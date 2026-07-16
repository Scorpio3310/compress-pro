import type {
	FileFormat,
	UploadedFile,
	CompressedFile,
	FileFailure,
	ImageCompressionSettings,
	SvgCompressionSettings,
	PdfCompressionSettings,
	VideoConversionSettings,
	AudioConversionSettings,
	FontConversionSettings,
	ZipSettings,
	ExifSettings,
	ProgressInfo
} from '$lib/types';
import { isBundlingArchiveFormat, isImageFormat } from '$lib/types';
import { ARCHIVE_OUTPUT_EXT, sanitizeEntryName } from '$lib/codecs/sevenzip-args';
import { runWithConcurrency } from '$lib/concurrency';
import { compressImage, type ImageProgress } from '$lib/codecs/image';
import { compressSvg } from '$lib/codecs/svg';
import { compressPdf, protectPdf, unlockPdf, type PdfProgress } from '$lib/codecs/pdf';
import { convertVideo } from '$lib/codecs/video';
import { convertAudio } from '$lib/codecs/audio';
import { convertFont, subsetFont } from '$lib/codecs/font';
import { callWorker, imageLaneCap } from '$lib/workers/rpc';
import { formatBytes } from '$lib/utils';
import { displayableImageMime } from '$lib/file-visual';

const extMap: Record<string, string> = {
	jpg: '.jpg',
	png: '.png',
	webp: '.webp',
	gif: '.gif',
	avif: '.avif',
	ico: '.ico',
	mp4: '.mp4',
	webm: '.webm',
	mov: '.mov',
	mp3: '.mp3',
	m4a: '.m4a',
	wav: '.wav',
	ogg: '.ogg',
	flac: '.flac',
	opus: '.opus',
	weba: '.weba',
	ttf: '.ttf',
	otf: '.otf',
	woff: '.woff',
	woff2: '.woff2',
	eot: '.eot'
};

function replaceExtension(filename: string, newExt: string | undefined): string {
	// A container/format missing from extMap must never yield "name<undefined>".
	if (!newExt) return filename;
	const dot = filename.lastIndexOf('.');
	return (dot > 0 ? filename.slice(0, dot) : filename) + newExt;
}

function savingsPercent(originalSize: number, compressedSize: number): number {
	return Math.max(0, Math.round((1 - compressedSize / originalSize) * 100));
}

/** True only when THIS run's own signal fired. Error identity is deliberately
 *  not trusted: a CancelledError also reaches us when ANOTHER run tears down a
 *  shared pooled worker (abortAll) — that must read as a per-file failure,
 *  never as our own cancel. Exported for unit tests. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- _error stays in the signature so call sites keep handing the caught error over
export function wasCancelled(signal: AbortSignal | undefined, _error: unknown): boolean {
	return !!signal?.aborted;
}

type Settings =
	| ImageCompressionSettings
	| SvgCompressionSettings
	| PdfCompressionSettings
	| VideoConversionSettings
	| AudioConversionSettings
	| FontConversionSettings
	| ZipSettings
	| ExifSettings;

function imageDetail(p: ImageProgress): string | null {
	const parts: string[] = [];
	if (p.attempt) {
		parts.push(
			`attempt ${p.attempt}/${p.attemptMax}${p.lastSize ? ` — ${formatBytes(p.lastSize)}` : ''}`
		);
	}
	if (p.frame) {
		parts.push(p.frameCount ? `frame ${p.frame}/${p.frameCount}` : `frame ${p.frame}`);
	}
	return parts.length ? parts.join(', ') : null;
}

function imageFraction(p: ImageProgress): number {
	const frameFraction = p.frame && p.frameCount ? Math.min(p.frame / p.frameCount, 1) : 0;
	if (p.attempt && p.attemptMax) {
		return Math.min((p.attempt - 1 + frameFraction) / p.attemptMax, 0.98);
	}
	return Math.min(frameFraction, 0.98);
}

function pdfDetail(p: PdfProgress): string | null {
	const parts: string[] = [];
	if (p.attempt) {
		parts.push(
			`attempt ${p.attempt}/${p.attemptMax}${p.lastSize ? ` — ${formatBytes(p.lastSize)}` : ''}`
		);
	}
	if (p.page) {
		parts.push(p.pageCount ? `page ${p.page}/${p.pageCount}` : `page ${p.page}`);
	}
	return parts.length ? parts.join(', ') : null;
}

function pdfFraction(p: PdfProgress): number {
	const pageFraction = p.page && p.pageCount ? Math.min(p.page / p.pageCount, 1) : 0;
	if (p.attempt && p.attemptMax) {
		return Math.min((p.attempt - 1 + pageFraction) / p.attemptMax, 0.98);
	}
	return Math.min(pageFraction, 0.98);
}

/** Per-file monotonic clamp (the archive paths' lastFraction pattern):
 *  Ghostscript re-reports pages 1..N on the low-DPI two-pass and on the
 *  %%EOF-truncation retry — without the held peak the bar saws back down. */
function heldPeak(): (fraction: number) => number {
	let peak = 0;
	return (fraction) => (peak = Math.max(peak, fraction));
}

export interface PdfToolOutput {
	results: CompressedFile[];
	failures: FileFailure[];
	combined: CompressedFile | null;
}

function toFailure(file: UploadedFile, error: unknown): FileFailure {
	return {
		id: file.id,
		name: file.name,
		error: error instanceof Error ? error.message : 'Compression failed'
	};
}

function makeCombined(
	name: string,
	blob: Blob,
	originalSize: number,
	warning: string | null
): CompressedFile {
	return {
		id: 'combined',
		name,
		originalSize,
		compressedSize: blob.size,
		blob,
		objectUrl: URL.createObjectURL(blob),
		savings: savingsPercent(originalSize, blob.size),
		warning,
		info: null
	};
}

function uniqueEntryName(name: string, used: Set<string>): string {
	if (!used.has(name)) return name;
	const dot = name.lastIndexOf('.');
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : '';
	for (let n = 1; ; n++) {
		const candidate = `${stem} (${n})${ext}`;
		if (!used.has(candidate)) return candidate;
	}
}

/** One extract result row per archive entry — basename-flattened (zip-slip
 *  hygiene: path segments never reach the download attribute), typed so image
 *  entries render as row thumbnails, deduped across the whole batch. */
function entryRow(
	fileId: string,
	index: number,
	entryPath: string,
	bytes: Uint8Array | ArrayBuffer,
	used: Set<string>,
	info: string | null
): CompressedFile {
	const short = uniqueEntryName(sanitizeEntryName(entryPath.split('/').pop()!), used);
	used.add(short);
	// SVG is never content-sniffed; '' keeps today's default otherwise.
	const blob = new Blob([bytes as BlobPart], { type: displayableImageMime(short) ?? '' });
	return {
		id: `${fileId}#${index}`, // never collides with an upload id
		name: short,
		originalSize: blob.size,
		compressedSize: blob.size,
		blob,
		objectUrl: URL.createObjectURL(blob),
		savings: 0,
		warning: null,
		info
	};
}

/** Entries worth a row: real files, not folder markers, empty blobs or
 *  dotfile noise (__MACOSX/.DS_Store) — same rule fflate extract always had. */
function extractableEntry(path: string, size: number): boolean {
	return !path.endsWith('/') && size > 0 && !path.split('/').pop()!.startsWith('.');
}

/**
 * Archive tab (fflate + 7z-wasm).
 * - create, bundling formats (zip/7z/tar/tgz/tbz2/txz) → ONE combined archive
 *   from all inputs; plain unencrypted zip keeps the fflate fast path, the
 *   rest runs in the archive worker.
 * - create, stream formats (gz/bz2/xz) → one output per input.
 * - extract → one result row per archive ENTRY (ids never match an upload, so
 *   FileList renders them as standalone rows); unencrypted .zip goes through
 *   fflate first and falls back to the worker (which speaks every format and
 *   maps password errors to friendly messages).
 * - convert → each input repacked into the target format (extract + create in
 *   the worker, folder structure preserved).
 */
export async function runArchiveTool(
	files: UploadedFile[],
	settings: ZipSettings,
	onProgress: (progress: ProgressInfo) => void,
	signal?: AbortSignal
): Promise<PdfToolOutput> {
	if (settings.op === 'create') {
		return isBundlingArchiveFormat(settings.outputFormat)
			? createArchiveBundle(files, settings, onProgress, signal)
			: createArchiveStreams(files, settings, onProgress, signal);
	}
	if (settings.op === 'convert') return convertArchives(files, settings, onProgress, signal);
	return extractArchives(files, settings, onProgress, signal);
}

async function createArchiveBundle(
	files: UploadedFile[],
	settings: ZipSettings,
	onProgress: (progress: ProgressInfo) => void,
	signal?: AbortSignal
): Promise<PdfToolOutput> {
	const sum = files.reduce((total, f) => total + f.size, 0);
	const outName = `archive${ARCHIVE_OUTPUT_EXT[settings.outputFormat]}`;
	const base = { fileIndex: 0, fileCount: 1, fileName: outName };
	onProgress({ ...base, fileFraction: 0, detail: null, stage: 'processing' });
	try {
		if (settings.outputFormat === 'zip' && !settings.password) {
			// fflate fast path — no wasm download for the everyday case.
			const fflate = await import('fflate');
			const entries: Record<string, Uint8Array> = {};
			const used = new Set<string>();
			for (let i = 0; i < files.length; i++) {
				signal?.throwIfAborted();
				const name = uniqueEntryName(files[i].name, used);
				used.add(name);
				entries[name] = new Uint8Array(await files[i].file.arrayBuffer());
				onProgress({
					...base,
					fileFraction: ((i + 1) / files.length) * 0.7,
					detail: `reading ${files[i].name}`,
					stage: 'processing'
				});
			}
			const data = await new Promise<Uint8Array>((resolve, reject) =>
				fflate.zip(entries, { level: settings.level }, (error, out) =>
					error ? reject(error) : resolve(out)
				)
			);
			// A cancel during the zip discards the result (fflate's internal blob:
			// workers can't be aborted mid-flight — it returns a terminator handle
			// if that CPU burn ever needs reclaiming); the catch below maps this
			// to the empty cancelled output.
			signal?.throwIfAborted();
			onProgress({ ...base, fileFraction: 1, detail: null, stage: 'done' });
			const blob = new Blob([data as BlobPart], { type: 'application/zip' });
			return { results: [], failures: [], combined: makeCombined(outName, blob, sum, null) };
		}

		const tools = await import('$lib/codecs/archive-tools');
		let lastFraction = 0;
		const { blob, name } = await tools.createBundle(
			files,
			settings,
			'archive',
			(fraction, detail) => {
				// Monotonic clamp — see the identical per-file sites below.
				lastFraction = fraction == null ? lastFraction : Math.max(lastFraction, fraction);
				onProgress({ ...base, fileFraction: lastFraction, detail, stage: 'processing' });
			},
			signal
		);
		onProgress({ ...base, fileFraction: 1, detail: null, stage: 'done' });
		return { results: [], failures: [], combined: makeCombined(name, blob, sum, null) };
	} catch (error) {
		if (wasCancelled(signal, error)) return { results: [], failures: [], combined: null };
		throw error;
	}
}

async function createArchiveStreams(
	files: UploadedFile[],
	settings: ZipSettings,
	onProgress: (progress: ProgressInfo) => void,
	signal?: AbortSignal
): Promise<PdfToolOutput> {
	const tools = await import('$lib/codecs/archive-tools');
	const results: CompressedFile[] = [];
	const failures: FileFailure[] = [];
	for (let i = 0; i < files.length; i++) {
		if (signal?.aborted) break;
		const file = files[i];
		const base = { fileIndex: i, fileCount: files.length, fileName: file.name };
		onProgress({ ...base, fileFraction: 0, detail: null, stage: 'processing' });
		try {
			let lastFraction = 0;
			const { blob, name } = await tools.createStream(
				file,
				settings,
				(fraction, detail) => {
					// Monotonic clamp: chained extraction and two-stage tar.* creates
					// restart their scale window per pass — hold the peak instead of
					// rewinding the bar (null = indeterminate pulse, carried forward).
					lastFraction = fraction == null ? lastFraction : Math.max(lastFraction, fraction);
					onProgress({ ...base, fileFraction: lastFraction, detail, stage: 'processing' });
				},
				signal
			);
			results.push({
				id: file.id,
				name,
				originalSize: file.size,
				compressedSize: blob.size,
				blob,
				objectUrl: URL.createObjectURL(blob),
				savings: savingsPercent(file.size, blob.size),
				warning: null,
				info: null
			});
		} catch (error) {
			if (wasCancelled(signal, error)) break;
			failures.push(toFailure(file, error));
			onProgress({ ...base, fileFraction: 1, detail: null, stage: 'error' });
			continue;
		}
		onProgress({ ...base, fileFraction: 1, detail: null, stage: 'done' });
	}
	return { results, failures, combined: null };
}

async function convertArchives(
	files: UploadedFile[],
	settings: ZipSettings,
	onProgress: (progress: ProgressInfo) => void,
	signal?: AbortSignal
): Promise<PdfToolOutput> {
	const tools = await import('$lib/codecs/archive-tools');
	const results: CompressedFile[] = [];
	const failures: FileFailure[] = [];
	for (let i = 0; i < files.length; i++) {
		if (signal?.aborted) break;
		const file = files[i];
		const base = { fileIndex: i, fileCount: files.length, fileName: file.name };
		onProgress({ ...base, fileFraction: 0, detail: null, stage: 'processing' });
		try {
			let lastFraction = 0;
			const { blob, name, entryCount } = await tools.convertArchive(
				file,
				settings,
				(fraction, detail) => {
					// Monotonic clamp: chained extraction and two-stage tar.* creates
					// restart their scale window per pass — hold the peak instead of
					// rewinding the bar (null = indeterminate pulse, carried forward).
					lastFraction = fraction == null ? lastFraction : Math.max(lastFraction, fraction);
					onProgress({ ...base, fileFraction: lastFraction, detail, stage: 'processing' });
				},
				signal
			);
			results.push({
				id: file.id,
				name,
				originalSize: file.size,
				compressedSize: blob.size,
				blob,
				objectUrl: URL.createObjectURL(blob),
				savings: savingsPercent(file.size, blob.size),
				warning: null,
				info: `${entryCount} ${entryCount === 1 ? 'file' : 'files'} repacked`
			});
		} catch (error) {
			if (wasCancelled(signal, error)) break;
			failures.push(toFailure(file, error));
			onProgress({ ...base, fileFraction: 1, detail: null, stage: 'error' });
			continue;
		}
		onProgress({ ...base, fileFraction: 1, detail: null, stage: 'done' });
	}
	return { results, failures, combined: null };
}

async function extractArchives(
	files: UploadedFile[],
	settings: ZipSettings,
	onProgress: (progress: ProgressInfo) => void,
	signal?: AbortSignal
): Promise<PdfToolOutput> {
	const results: CompressedFile[] = [];
	const failures: FileFailure[] = [];
	const used = new Set<string>();
	for (let i = 0; i < files.length; i++) {
		if (signal?.aborted) break;
		const file = files[i];
		const base = { fileIndex: i, fileCount: files.length, fileName: file.name };
		onProgress({ ...base, fileFraction: 0, detail: null, stage: 'processing' });
		try {
			let rows: CompressedFile[] | null = null;

			if (!settings.password && /\.zip$/i.test(file.name)) {
				// fflate fast path; ANY failure (encrypted entries, zip64 quirks,
				// misnamed file) falls through to the worker for a better answer.
				try {
					const fflate = await import('fflate');
					const bytes = new Uint8Array(await file.file.arrayBuffer());
					signal?.throwIfAborted();
					const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
						fflate.unzip(bytes, (error, out) => (error ? reject(error) : resolve(out)))
					);
					// A cancel mid-unzip must not commit rows (result discarded; see
					// the createArchiveBundle note on fflate's internal workers).
					signal?.throwIfAborted();
					const names = Object.keys(entries).filter((n) => extractableEntry(n, entries[n].length));
					if (names.length) {
						rows = names.map((n, e) => entryRow(file.id, e, n, entries[n], used, null));
					}
				} catch (error) {
					if (wasCancelled(signal, error)) break;
					rows = null;
				}
			}

			if (!rows) {
				const tools = await import('$lib/codecs/archive-tools');
				let lastFraction = 0.05;
				const { entries, note } = await tools.extractArchive(
					file,
					settings.password,
					(fraction, detail) => {
						// Monotonic clamp: chained extraction and two-stage tar.* creates
						// restart their scale window per pass — hold the peak instead of
						// rewinding the bar (null = indeterminate pulse, carried forward).
						lastFraction = fraction == null ? lastFraction : Math.max(lastFraction, fraction);
						onProgress({ ...base, fileFraction: lastFraction, detail, stage: 'processing' });
					},
					signal
				);
				const real = entries.filter((e) => extractableEntry(e.path, e.bytes.byteLength));
				if (!real.length) throw new Error('The archive contains no extractable files');
				// The chaining note (e.g. deb control files skipped) rides on the
				// first row — once per archive, not once per entry.
				rows = real.map((e, index) =>
					entryRow(file.id, index, e.path, e.bytes, used, index === 0 ? note : null)
				);
			}

			results.push(...rows);
		} catch (error) {
			if (wasCancelled(signal, error)) break;
			failures.push(toFailure(file, error));
			onProgress({ ...base, fileFraction: 1, detail: null, stage: 'error' });
			continue;
		}
		onProgress({ ...base, fileFraction: 1, detail: null, stage: 'done' });
	}
	return { results, failures, combined: null };
}

/**
 * PDF operations other than compression (merge/pages/toImages/fromImages/
 * unlock/protect). On abort, already-finished per-file results are kept; the
 * combined ops (merge/fromImages) return empty output instead.
 */
export async function runPdfTool(
	files: UploadedFile[],
	settings: PdfCompressionSettings,
	onProgress: (progress: ProgressInfo) => void,
	signal?: AbortSignal
): Promise<PdfToolOutput> {
	const tools = await import('$lib/codecs/pdf-tools');

	if (settings.op === 'merge') {
		try {
			const sum = files.reduce((total, f) => total + f.size, 0);
			const base = { fileIndex: 0, fileCount: 1, fileName: 'merged.pdf' };
			const mergeShare = settings.mergeCompress ? 0.2 : 1;
			let blob = await tools.mergePdfs(
				files.map((f) => f.file),
				(done, total, detail) =>
					onProgress({
						...base,
						fileFraction: mergeShare * (done / total),
						detail: detail ? `merging ${detail}` : null,
						stage: 'processing'
					})
			);
			let warning: string | null = null;
			if (settings.mergeCompress) {
				const merged = new File([blob], 'merged.pdf', { type: 'application/pdf' });
				const peak = heldPeak();
				// compressPdf keeps the smaller of input/output itself.
				const out = await compressPdf(
					merged,
					settings,
					(p) =>
						onProgress({
							...base,
							fileFraction: 0.2 + 0.8 * peak(pdfFraction(p)),
							detail: pdfDetail(p),
							stage: 'processing'
						}),
					signal
				);
				blob = out.blob;
				warning = out.warning;
			}
			onProgress({ ...base, fileFraction: 1, detail: null, stage: 'done' });
			return {
				results: [],
				failures: [],
				combined: makeCombined('merged.pdf', blob, sum, warning)
			};
		} catch (error) {
			if (wasCancelled(signal, error)) return { results: [], failures: [], combined: null };
			throw error;
		}
	}

	if (settings.op === 'fromImages') {
		try {
			const sum = files.reduce((total, f) => total + f.size, 0);
			const base = { fileIndex: 0, fileCount: 1, fileName: 'images.pdf' };
			const blob = await tools.imagesToPdf(
				files.map((f) => f.file),
				{ quality: settings.imageQuality },
				(done, total, detail) =>
					onProgress({ ...base, fileFraction: done / total, detail, stage: 'processing' }),
				signal
			);
			onProgress({ ...base, fileFraction: 1, detail: null, stage: 'done' });
			return { results: [], failures: [], combined: makeCombined('images.pdf', blob, sum, null) };
		} catch (error) {
			if (wasCancelled(signal, error)) return { results: [], failures: [], combined: null };
			throw error;
		}
	}

	// Per-file ops: pages | toImages. A failing file becomes a failure entry;
	// the remaining files still run.
	const results: CompressedFile[] = [];
	const failures: FileFailure[] = [];
	for (let i = 0; i < files.length; i++) {
		if (signal?.aborted) break;
		const file = files[i];
		const base = { fileIndex: i, fileCount: files.length, fileName: file.name };
		onProgress({ ...base, fileFraction: 0, detail: null, stage: 'processing' });

		let blob: Blob;
		let outName: string;
		let warning: string | null = null;

		try {
			if (settings.op === 'pages') {
				const out = await tools.extractPages(file.file, settings.pageRange, settings.pageMode);
				blob = out.blob;
				outName = replaceExtension(file.name, '-pages.pdf');
			} else if (settings.op === 'unlock' || settings.op === 'protect') {
				const run = settings.op === 'unlock' ? unlockPdf : protectPdf;
				blob = await run(
					file.file,
					settings.password,
					(page, pageCount) =>
						onProgress({
							...base,
							fileFraction: page && pageCount ? Math.min(page / pageCount, 0.98) : 0,
							detail: pageCount ? `page ${page}/${pageCount}` : null,
							stage: 'processing'
						}),
					signal
				);
				outName = replaceExtension(
					file.name,
					settings.op === 'unlock' ? '-unlocked.pdf' : '-protected.pdf'
				);
			} else {
				const out = await tools.pdfToImages(
					file.file,
					{ dpi: settings.imageDpi, format: settings.imageFormat, quality: settings.imageQuality },
					(done, total, detail) =>
						onProgress({
							...base,
							fileFraction: Math.min(done / total, 0.98),
							detail,
							stage: 'processing'
						})
				);
				blob = out.blob;
				outName = out.name;
				warning = out.warning;
			}
		} catch (error) {
			if (wasCancelled(signal, error)) break;
			failures.push(toFailure(file, error));
			onProgress({ ...base, fileFraction: 1, detail: null, stage: 'error' });
			continue;
		}

		results.push({
			id: file.id,
			name: outName,
			originalSize: file.size,
			compressedSize: blob.size,
			blob,
			objectUrl: URL.createObjectURL(blob),
			savings: savingsPercent(file.size, blob.size),
			warning,
			info: null
		});
		onProgress({ ...base, fileFraction: 1, detail: null, stage: 'done' });
	}
	return { results, failures, combined: null };
}

/**
 * Images fan out across the worker pool; caps keep memory and nested-thread
 * counts sane. SVG/PDF stay serial (single worker per kind anyway).
 */
function computeConcurrency(files: UploadedFile[], format: FileFormat, settings: Settings): number {
	if (!isImageFormat(format)) return 1;
	let cap = imageLaneCap(1);
	const out = (settings as ImageCompressionSettings).outputFormat;
	// Under cross-origin isolation avif/png encoders spawn their own pthreads —
	// N workers × M threads would oversubscribe the machine.
	if (
		typeof crossOriginIsolated !== 'undefined' &&
		crossOriginIsolated &&
		(out === 'avif' || out === 'png')
	) {
		cap = Math.min(cap, 2);
	}
	// gifsicle runs its own internal worker outside the pool.
	if (format === 'gif' && out === 'gif') cap = Math.min(cap, 2);
	// Huge inputs: N simultaneous full-res decodes (RGBA ≈ 4 B/px) add up fast.
	if (files.some((f) => f.size > 25_000_000)) cap = Math.min(cap, 2);
	return cap;
}

export interface CompressOutput {
	results: CompressedFile[];
	failures: FileFailure[];
}

/**
 * On abort, results of already-finished files are returned; the rest are
 * skipped. A file that fails for any other reason becomes a `failures` entry
 * (stage 'error' in progress) — it never takes the rest of the batch down.
 */
export async function compressFiles(
	files: UploadedFile[],
	format: FileFormat,
	settings: Settings,
	onProgress: (progress: ProgressInfo) => void,
	signal?: AbortSignal,
	/** Fires as each file finishes — lets the UI offer finished files mid-run. */
	onFileDone?: (index: number, file: CompressedFile) => void
): Promise<CompressOutput> {
	const isImage = isImageFormat(format);
	const failures: FileFailure[] = [];

	const runOne = async (i: number): Promise<CompressedFile | undefined> => {
		const file = files[i];
		const base = { fileIndex: i, fileCount: files.length, fileName: file.name };
		onProgress({ ...base, fileFraction: 0, detail: null, stage: 'processing' });

		try {
			const result = await compressOne(file, base);
			onFileDone?.(i, result);
			return result;
		} catch (error) {
			// Cancels propagate so the scheduler stops starting new files.
			if (wasCancelled(signal, error)) throw error;
			// Our signal did NOT fire, yet the worker call was torn down: another
			// run's cancel (or a watchdog) hit a shared pooled worker. Surface it
			// as a retryable per-file failure, never as a silent early stop.
			const surfaced =
				error instanceof Error && error.name === 'CancelledError'
					? new Error('Interrupted by a cancelled run in another tab — try this file again')
					: error;
			failures.push(toFailure(file, surfaced));
			onProgress({ ...base, fileFraction: 1, detail: null, stage: 'error' });
			return undefined;
		}
	};

	const compressOne = async (
		file: UploadedFile,
		base: { fileIndex: number; fileCount: number; fileName: string }
	): Promise<CompressedFile> => {
		let blob: Blob;
		let warning: string | null = null;
		let info: string | null = null;
		let outName = file.name;
		let formatChanged = false;
		let resized = false;

		let autoRequested = false;
		if (isImage) {
			const imageSettings = settings as ImageCompressionSettings;
			autoRequested = imageSettings.outputFormat === 'auto';
			// The file's real format can differ from its tab: AVIF rides on the
			// jpg tab, so treating it as already-jpg would skip the rename and
			// let the keep-original guard return AVIF bytes from a JPG run.
			const sourceFormat =
				file.file.type === 'image/avif' || file.name.toLowerCase().endsWith('.avif')
					? 'avif'
					: format;
			const out = await compressImage(
				file.file,
				imageSettings,
				(p) =>
					onProgress({
						...base,
						fileFraction: imageFraction(p),
						detail: imageDetail(p),
						stage: 'processing'
					}),
				format,
				signal
			);
			blob = out.blob;
			warning = out.warning;
			info = out.info;
			resized = out.resized;
			// 'auto' resolves per file inside the worker — the name and the
			// keep-original comparison follow what actually got encoded.
			formatChanged = out.format !== sourceFormat;
			if (extMap[out.format]) {
				outName = replaceExtension(file.name, extMap[out.format]);
			}
		} else if (format === 'svg') {
			const svgSettings = settings as SvgCompressionSettings;
			if (svgSettings.outputFormat === 'png' || svgSettings.outputFormat === 'ico') {
				const { rasterizeSvg } = await import('$lib/codecs/svg-raster');
				const out = await rasterizeSvg(file.file, svgSettings, signal);
				blob = out.blob;
				// The keep-original guard must never hand back .svg bytes for a
				// PNG/ICO request (small icon SVGs usually beat their PNG in size).
				formatChanged = true;
				outName = replaceExtension(file.name, extMap[svgSettings.outputFormat]);
				if (svgSettings.outputFormat === 'png') {
					info = `Rendered at ${out.width}×${out.height} px`;
				}
			} else {
				blob = await compressSvg(file.file, svgSettings, signal);
			}
		} else if (format === 'exif') {
			// The strip runs in the image worker; the buffer is transferred both
			// ways (zero-copy), keeping batch strips off the main thread.
			const buf = await file.file.arrayBuffer();
			const out = await callWorker(
				'image',
				'stripMetadata',
				{ bytes: buf, removeIcc: (settings as ExifSettings).removeIcc },
				[buf],
				undefined,
				{ owner: signal }
			);
			blob = new Blob([out.bytes], { type: out.mime });
			info = out.info;
			// formatChanged/resized stay false — when nothing was removed the
			// bytes are identical and the keep-original guard below returns the
			// original File naturally (savings 0, info "No metadata found").
		} else if (format === 'video') {
			const out = await convertVideo(
				file.file,
				settings as VideoConversionSettings,
				(p) =>
					onProgress({ ...base, fileFraction: p.fraction, detail: p.detail, stage: 'processing' }),
				signal
			);
			blob = out.blob;
			warning = out.warning;
			// Resize / fps cap / audio removal ⇒ the keep-original guard never fires.
			resized = out.transformed;
			formatChanged = out.formatChanged;
			outName = replaceExtension(file.name, extMap[out.container]);
		} else if (format === 'audio') {
			const out = await convertAudio(
				file.file,
				settings as AudioConversionSettings,
				(p) =>
					onProgress({ ...base, fileFraction: p.fraction, detail: p.detail, stage: 'processing' }),
				signal
			);
			blob = out.blob;
			warning = out.warning;
			formatChanged = out.formatChanged;
			outName = replaceExtension(file.name, extMap[out.outputFormat]);
		} else if (format === 'font') {
			const fontSettings = settings as FontConversionSettings;
			const out =
				fontSettings.op === 'subset'
					? await subsetFont(file.file, fontSettings, signal)
					: await convertFont(file.file, fontSettings, signal);
			blob = out.blob;
			info = out.info;
			// The flavor rule means the real output can equal the source (ttf→ttf
			// passthrough) — then the guard below returns the original bytes.
			formatChanged = out.formatChanged;
			// Subset/instance changes content — the guard must not undo it even
			// when the output happens to be larger (video's `transformed` seam).
			resized = out.transformed;
			outName = replaceExtension(file.name, out.nameSuffix + extMap[out.outputFormat]);
		} else {
			const peak = heldPeak();
			const out = await compressPdf(
				file.file,
				settings as PdfCompressionSettings,
				(p) =>
					onProgress({
						...base,
						fileFraction: peak(pdfFraction(p)),
						detail: pdfDetail(p),
						stage: 'processing'
					}),
				signal
			);
			blob = out.blob;
			warning = out.warning;
		}

		// When not converting formats (and not downscaling), a "compressed"
		// file that got bigger is a regression — keep the original bytes.
		// Auto's contract is "smallest", so there the original is always an
		// implicit candidate even when the winning codec differs from the source.
		if ((!formatChanged || autoRequested) && !resized && blob.size >= file.size) {
			blob = file.file;
			outName = file.name;
			// Image info lines describe a transformation (sRGB conversion) that
			// the untouched original did NOT undergo. EXIF keeps its info —
			// "No metadata found" relies on exactly this branch.
			if (isImage) info = null;
		}

		const result: CompressedFile = {
			id: file.id,
			name: outName,
			originalSize: file.size,
			compressedSize: blob.size,
			blob,
			objectUrl: URL.createObjectURL(blob),
			savings: savingsPercent(file.size, blob.size),
			warning,
			info,
			// after the keep-original guard: a reverted file keeps its name, so
			// this stays false when Auto's pick didn't actually ship
			autoConverted: autoRequested && outName !== file.name
		};
		onProgress({ ...base, fileFraction: 1, detail: null, stage: 'done' });
		return result;
	};

	// Gifsicle and the pdf.js preview run outside the pool, so a cancel takes
	// effect for them when their file finishes rather than mid-call; the
	// scheduler then stops starting new files (finished results are kept).
	const settled = await runWithConcurrency(
		files.length,
		computeConcurrency(files, format, settings),
		runOne,
		(error) => wasCancelled(signal, error),
		() => !!signal?.aborted
	);
	return { results: settled.filter((r): r is CompressedFile => r !== undefined), failures };
}
