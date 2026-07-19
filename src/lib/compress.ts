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
	OcrSettings,
	SubtitleSettings,
	EbookSettings,
	ModelSettings,
	DataSettings,
	ProgressInfo
} from '$lib/types';
import { isBundlingArchiveFormat, isImageFormat } from '$lib/types';
import { ARCHIVE_OUTPUT_EXT, sanitizeEntryName } from '$lib/codecs/sevenzip-args';
import { readZipEntryMeta, stripC1 } from '$lib/zip-meta';
import { spreadCombinedProgress } from '$lib/combined-progress';
import { runWithConcurrency } from '$lib/concurrency';
import { compressImage, type ImageProgress } from '$lib/codecs/image';
import { compressSvg } from '$lib/codecs/svg';
import {
	compressPdf,
	grayscalePdf,
	pdfaPdf,
	protectPdf,
	unlockPdf,
	type PdfProgress
} from '$lib/codecs/pdf';
import { convertVideo } from '$lib/codecs/video';
import { convertAudio } from '$lib/codecs/audio';
import { convertFont, subsetFont } from '$lib/codecs/font';
import { callWorker, imageLaneCap } from '$lib/workers/rpc';
import { formatBytes } from '$lib/utils';
import { displayableImageMime } from '$lib/file-visual';
import { sniffGif, sniffImage } from '$lib/codecs/ebook';
import { isRawFile } from '$lib/routing';
import type { PredecodedPixels } from '$lib/workers/protocol';

const extMap: Record<string, string> = {
	jpg: '.jpg',
	png: '.png',
	webp: '.webp',
	gif: '.gif',
	avif: '.avif',
	ico: '.ico',
	svg: '.svg',
	jxl: '.jxl',
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

/** Signed: NEGATIVE when the output grew. Conversions legitimately grow
 *  (jpg→png, vectorize) and formatSignedPercent renders negatives as "+N%" —
 *  the old 0-floor made every grown row read "−0%" while the summary said
 *  "↑ larger" on the same screen. Exported for unit tests. */
export function savingsPercent(originalSize: number, compressedSize: number): number {
	if (!originalSize) return 0;
	return Math.round((1 - compressedSize / originalSize) * 100);
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
	| ExifSettings
	| OcrSettings
	| SubtitleSettings
	| EbookSettings
	| ModelSettings
	| DataSettings;

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
	// stripC1 first: sanitizeEntryName only strips C0 controls, and latin1-
	// decoded legacy names (or hostile archives) carry invisible C1s.
	let name = sanitizeEntryName(stripC1(entryPath.split('/').pop()!));
	// Extension-less entries (gz/bz2 streams shed the container extension) get
	// a magic-sniffed image extension: with a bare name AND an empty blob type
	// Chromium downloads "<name>.txt" (O-02). Sniff BEFORE dedup so two
	// "photo" entries collide as "photo.jpg", not after numbering. Names that
	// already carry an extension are left alone; SVG stays name-based (never
	// content-sniffed); non-image bytes keep the honest bare name.
	if (name.lastIndexOf('.') <= 0) {
		const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
		const kind = sniffImage(view) ?? (sniffGif(view) ? 'gif' : null);
		if (kind) name = `${name}.${kind}`;
	}
	const short = uniqueEntryName(name, used);
	used.add(short);
	// '' keeps today's default for non-displayable types.
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

/** Entries worth a row: real files — not folder markers, and not macOS
 *  sidecar noise (__MACOSX/, .DS_Store, AppleDouble ._*). Real dotfiles
 *  (.env, .gitignore) and 0-byte placeholders DO get rows: the old
 *  "starts with a dot or is empty" rule silently withheld files the
 *  archive genuinely contains. */
function extractableEntry(path: string): boolean {
	if (path.endsWith('/')) return false;
	const segments = path.split('/');
	if (segments.includes('__MACOSX')) return false;
	const base = segments[segments.length - 1];
	return base !== '.DS_Store' && !base.startsWith('._');
}

/** The fflate fast paths buffer the whole batch AND the output in main-thread
 *  renderer RAM (fflate's internal workers copy rather than transfer — ~2-3×
 *  input peak). Above this the streaming 7z worker path takes over: WORKERFS
 *  mounts read inputs lazily and the heap lives in the worker. */
export const FFLATE_FAST_PATH_MAX_BYTES = 500 * 1024 * 1024;

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
	// One output from N inputs — the spreader advances the page's N rows so
	// they don't all sit on "queued" under a "0/N done" header for the run.
	const spread = spreadCombinedProgress(files.length, outName, onProgress);
	spread.report(0, null);
	try {
		if (
			settings.outputFormat === 'zip' &&
			!settings.password &&
			sum <= FFLATE_FAST_PATH_MAX_BYTES
		) {
			// fflate fast path — no wasm download for the everyday case. Bigger
			// batches take the worker path below: this one buffers every input
			// plus the whole output in main-thread RAM.
			const fflate = await import('fflate');
			const entries: Record<string, Uint8Array> = {};
			const used = new Set<string>();
			for (let i = 0; i < files.length; i++) {
				signal?.throwIfAborted();
				const name = uniqueEntryName(files[i].name, used);
				used.add(name);
				entries[name] = new Uint8Array(await files[i].file.arrayBuffer());
				spread.report(((i + 1) / files.length) * 0.7, `reading ${files[i].name}`);
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
			spread.finish();
			const blob = new Blob([data as BlobPart], { type: 'application/zip' });
			return { results: [], failures: [], combined: makeCombined(outName, blob, sum, null) };
		}

		const tools = await import('$lib/codecs/archive-tools');
		const { blob, name } = await tools.createBundle(
			files,
			settings,
			'archive',
			// The spreader holds the peak itself (chained/two-stage creates
			// restart their scale window; null = indeterminate pulse).
			(fraction, detail) => spread.report(fraction, detail),
			signal
		);
		spread.finish();
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
			let noExtractable = false;

			if (
				!settings.password &&
				/\.zip$/i.test(file.name) &&
				file.size <= FFLATE_FAST_PATH_MAX_BYTES
			) {
				// fflate fast path; ANY failure (AES entries, zip64 quirks,
				// misnamed file) falls through to the worker for a better answer.
				// Oversized zips skip it — this path buffers the archive plus
				// every entry in main-thread RAM.
				try {
					const fflate = await import('fflate');
					const bytes = new Uint8Array(await file.file.arrayBuffer());
					signal?.throwIfAborted();
					// fflate never reads general-purpose bit 0: a ZipCrypto STORED
					// entry "extracts" as key-header + XOR ciphertext with no error.
					// Only the worker can decrypt — or answer 'password-protected'
					// honestly — so encrypted zips must never take this path.
					const meta = readZipEntryMeta(bytes);
					if (!meta?.some((entry) => entry.encrypted)) {
						const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
							fflate.unzip(bytes, (error, out) => (error ? reject(error) : resolve(out)))
						);
						// A cancel mid-unzip must not commit rows (result discarded; see
						// the createArchiveBundle note on fflate's internal workers).
						signal?.throwIfAborted();
						// fflate decodes non-UTF-8 names as latin1, but legacy Windows
						// archivers wrote cp437 — accents become invisible C1 controls.
						// Label rows with the central directory's correct decode.
						const displayName = new Map(
							(meta ?? []).map((entry) => [entry.fflateName, entry.name])
						);
						const names = Object.keys(entries).filter((n) => extractableEntry(n));
						if (names.length) {
							rows = names.map((n, e) =>
								entryRow(file.id, e, displayName.get(n) ?? n, entries[n], used, null)
							);
						} else if (Object.keys(entries).length) {
							// Parsed fine, holds nothing extractable — the worker would
							// only re-derive the same answer after a 1.65 MB wasm download.
							noExtractable = true;
						}
					}
				} catch (error) {
					if (wasCancelled(signal, error)) break;
					rows = null;
				}
			}
			if (noExtractable) throw new Error('The archive contains no extractable files');

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
				const real = entries.filter((e) => extractableEntry(e.path));
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
		const spread = spreadCombinedProgress(files.length, 'merged.pdf', onProgress);
		try {
			const sum = files.reduce((total, f) => total + f.size, 0);
			const mergeShare = settings.mergeCompress ? 0.2 : 1;
			let blob = await tools.mergePdfs(
				files.map((f) => f.file),
				(done, total, detail) => {
					spread.report(mergeShare * (done / total), detail ? `merging ${detail}` : null);
				},
				// The signal also bites INSIDE mergePdfs, between copy chunks —
				// a cancelled run no longer grinds through a huge member (O-05).
				signal
			);
			signal?.throwIfAborted();
			let warning: string | null = null;
			if (settings.mergeCompress) {
				const merged = new File([blob], 'merged.pdf', { type: 'application/pdf' });
				const peak = heldPeak();
				// compressPdf keeps the smaller of input/output itself.
				const out = await compressPdf(
					merged,
					settings,
					(p) => spread.report(0.2 + 0.8 * peak(pdfFraction(p)), pdfDetail(p)),
					signal
				);
				// A cancel during the gs pass must never commit its result.
				signal?.throwIfAborted();
				blob = out.blob;
				warning = out.warning;
			}
			spread.finish();
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
		const spread = spreadCombinedProgress(files.length, 'images.pdf', onProgress);
		try {
			const sum = files.reduce((total, f) => total + f.size, 0);
			const blob = await tools.imagesToPdf(
				files.map((f) => f.file),
				{ quality: settings.imageQuality },
				(done, total, detail) => spread.report(done / total, detail),
				signal
			);
			// imagesToPdf consults the signal itself, but gate the commit too.
			signal?.throwIfAborted();
			spread.finish();
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
				// qpdf's structural pass is atomic — no per-page progress to relay.
				blob = await run(file.file, settings.password, signal);
				outName = replaceExtension(
					file.name,
					settings.op === 'unlock' ? '-unlocked.pdf' : '-protected.pdf'
				);
			} else if (settings.op === 'rotate') {
				blob = await tools.rotatePdf(file.file, settings.rotation);
				outName = replaceExtension(file.name, '-rotated.pdf');
			} else if (settings.op === 'watermark') {
				blob = await tools.watermarkPdf(file.file, settings.watermarkText.trim());
				outName = replaceExtension(file.name, '-watermarked.pdf');
			} else if (settings.op === 'pageNumbers') {
				blob = await tools.pageNumbersPdf(file.file);
				outName = replaceExtension(file.name, '-numbered.pdf');
			} else if (settings.op === 'toText') {
				blob = await tools.pdfToText(file.file, (done, total, detail) =>
					onProgress({
						...base,
						fileFraction: total ? Math.min(done / total, 0.98) : 0,
						detail,
						stage: 'processing'
					})
				);
				outName = replaceExtension(file.name, '.txt');
			} else if (settings.op === 'grayscale' || settings.op === 'toPdfa') {
				const run = settings.op === 'grayscale' ? grayscalePdf : pdfaPdf;
				blob = await run(
					file.file,
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
					settings.op === 'grayscale' ? '-grayscale.pdf' : '-pdfa.pdf'
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

/** Raster formats the jpg tab accepts that only the image worker's wasm
 *  decoders can read (utif2/psd/libjxl) — createImageBitmap, the vtracer
 *  worker's decoder, fails on all of them in every browser. RAW is detected
 *  separately (isRawFile) because it predecodes outside the worker. */
function needsBitmapBridge(name: string, mime: string): boolean {
	const lower = name.toLowerCase();
	const mimeLower = mime.toLowerCase();
	return (
		/\.(tiff?|psd|jxl)$/.test(lower) ||
		mimeLower === 'image/tiff' ||
		mimeLower === 'image/jxl' ||
		/photoshop/.test(mimeLower)
	);
}

/** '%PDF-' in the first KB (the spec tolerates junk before the header), or
 *  the file's own name/mime claim — OCR dispatch follows what the file IS. */
async function isPdfInput(file: File): Promise<boolean> {
	if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return true;
	const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
	const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
	for (let i = 0; i + magic.length <= head.length; i++) {
		if (magic.every((byte, at) => head[i + at] === byte)) return true;
	}
	return false;
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
	// RAW decodes serialize on the LibRaw worker anyway, but each decoded
	// frame holds ~100-200 MB of RGB until its encode lane drains — keep two
	// in flight at most (small DNGs would otherwise dodge the >25 MB guard).
	if (files.some((f) => isRawFile(f.name, f.file.type))) cap = Math.min(cap, 2);
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
		let stickyWarning = false;
		let info: string | null = null;
		let outName = file.name;
		let formatChanged = false;
		let resized = false;

		let autoRequested = false;
		if (isImage && (settings as ImageCompressionSettings).outputFormat === 'svg') {
			const imageSettings = settings as ImageCompressionSettings;
			const { vectorizeImage } = await import('$lib/codecs/vectorize');
			let input = file.file;
			// The vtracer worker decodes via createImageBitmap, which cannot read
			// RAW/TIFF/PSD/JXL in any browser — formats this tab accepts and
			// happily converts to JPG. Bridge them to a lossless full-quality PNG
			// through the same decoders the raster outputs use, then vectorize.
			if (isRawFile(file.name, file.file.type) || needsBitmapBridge(file.name, file.file.type)) {
				let predecoded: PredecodedPixels | undefined;
				if (isRawFile(file.name, file.file.type)) {
					const { decodeRaw } = await import('$lib/codecs/raw');
					predecoded = await decodeRaw(file.file, signal);
				}
				const bridged = await compressImage(
					file.file,
					// Lossless intermediate: q100 png, no resize, no target search.
					{
						...imageSettings,
						outputFormat: 'png',
						quality: 100,
						mode: 'quality',
						maxDimension: null,
						keepMetadata: false
					},
					(p) =>
						onProgress({
							...base,
							fileFraction: imageFraction(p) * 0.4,
							detail: imageDetail(p),
							stage: 'processing'
						}),
					format,
					signal,
					predecoded
				);
				input = new File([bridged.blob], replaceExtension(file.name, extMap.png), {
					type: 'image/png'
				});
			}
			blob = await vectorizeImage(input, imageSettings, signal);
			// The keep-original guard must never hand back raster bytes for an
			// SVG request — vectorized photos are legitimately larger.
			formatChanged = true;
			outName = replaceExtension(file.name, extMap.svg);
			if (blob.size >= file.size) {
				info =
					'Vector output is larger than the source — vectorization suits logos and flat graphics best';
			}
		} else if (isImage) {
			const imageSettings = settings as ImageCompressionSettings;
			autoRequested = imageSettings.outputFormat === 'auto';
			// The file's real format can differ from its tab: AVIF and camera
			// RAW both ride the jpg tab — the distinction drives the rename and
			// the keep-original guard, and RAW additionally decodes outside the
			// image worker (its TIFF magic would confuse the worker's sniffing).
			const isRaw = isRawFile(file.name, file.file.type);
			const sourceFormat = isRaw
				? 'raw'
				: file.file.type === 'image/avif' || file.name.toLowerCase().endsWith('.avif')
					? 'avif'
					: file.file.type === 'image/jxl' || file.name.toLowerCase().endsWith('.jxl')
						? 'jxl'
						: file.name.toLowerCase().endsWith('.psd') ||
							  /photoshop/.test(file.file.type.toLowerCase())
							? 'psd'
							: format;
			let predecoded: PredecodedPixels | undefined;
			if (isRaw) {
				const { decodeRaw } = await import('$lib/codecs/raw');
				predecoded = await decodeRaw(file.file, signal);
			}
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
				signal,
				predecoded
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
		} else if (format === 'ocr') {
			const ocrSettings = settings as OcrSettings;
			// Parked files survive an op toggle, so op alone can't drive dispatch:
			// a PDF under 'Extract text' would die inside tesseract's image decode,
			// an image under 'Searchable PDF' inside pdf.js ('Invalid PDF
			// structure'). Check what the file IS and refuse honestly instead.
			const isPdf = await isPdfInput(file.file);
			if (ocrSettings.op === 'toPdf' && !isPdf) {
				throw new Error(
					"'Searchable PDF' works on PDF scans — switch to 'Extract text' for images, or turn them into a PDF on /jpg-to-pdf first"
				);
			}
			if (ocrSettings.op === 'toText' && isPdf) {
				throw new Error(
					"'Extract text' reads images — switch to 'Searchable PDF' for PDF scans, or export the pages as images on /pdf-to-jpg first"
				);
			}
			const { ocrImage, ocrPdf } = await import('$lib/codecs/ocr');
			const run = ocrSettings.op === 'toPdf' ? ocrPdf : ocrImage;
			const out = await run(
				file.file,
				ocrSettings,
				(fraction, detail) =>
					onProgress({
						...base,
						fileFraction: Math.min(fraction, 0.98),
						detail,
						stage: 'processing'
					}),
				signal
			);
			blob = out.blob;
			info = out.info;
			// A .txt/searchable-PDF result must never fall back to the source.
			formatChanged = true;
			outName = replaceExtension(
				file.name,
				ocrSettings.op === 'toPdf' ? '-searchable.pdf' : '.txt'
			);
		} else if (format === 'subtitle') {
			const { to } = settings as SubtitleSettings;
			const { convertSubtitle, decodeSubtitleText } = await import('$lib/codecs/subtitles');
			// Decode from bytes, not .text() — legacy SRTs are often UTF-16 or CP-1252.
			const out = convertSubtitle(
				decodeSubtitleText(new Uint8Array(await file.file.arrayBuffer())),
				to
			);
			blob = new Blob([out.text], {
				type: to === 'vtt' ? 'text/vtt' : 'application/x-subrip'
			});
			info = `${out.from.toUpperCase()} → ${to.toUpperCase()} · ${out.cueCount} cue${out.cueCount !== 1 ? 's' : ''}`;
			// Converted text must never fall back to the source bytes.
			formatChanged = true;
			outName = replaceExtension(file.name, `.${to}`);
		} else if (format === 'data') {
			const { convertData } = await import('$lib/codecs/data');
			const out = await convertData(
				file,
				settings as DataSettings,
				(fraction, detail) =>
					onProgress({
						...base,
						fileFraction: Math.min(fraction, 0.98),
						detail,
						stage: 'processing'
					}),
				signal
			);
			blob = out.blob;
			info = out.info;
			warning = out.warning;
			// A pretty-printed YAML is often LARGER than its minified JSON source
			// — the keep-original guard must never "un-convert".
			formatChanged = true;
			outName = replaceExtension(file.name, out.outExt);
		} else if (format === 'ebook' && (settings as EbookSettings).to === 'txt') {
			if (/\.(cbz|cbr)$/i.test(file.name)) {
				throw new Error(
					"'Extract text' reads EPUB books — a comic's pages are images. Use /cbz-to-pdf to turn this one into a PDF instead"
				);
			}
			const { epubToText } = await import('$lib/codecs/ebook-text');
			const out = await epubToText(
				file,
				(fraction, detail) =>
					onProgress({
						...base,
						fileFraction: Math.min(fraction, 0.98),
						detail,
						stage: 'processing'
					}),
				signal
			);
			blob = new Blob([out.text], { type: 'text/plain' });
			info = `${out.chapters} chapter${out.chapters !== 1 ? 's' : ''} · ${out.words.toLocaleString('en-US')} words`;
			// Extracted text must never fall back to the EPUB bytes.
			formatChanged = true;
			outName = replaceExtension(file.name, '.txt');
		} else if (format === 'ebook' && (settings as EbookSettings).to === 'pdf') {
			if (/\.epub$/i.test(file.name)) {
				throw new Error(
					"'To PDF' lays out comic pages (CBZ/CBR) — for an EPUB's text use /epub-to-txt instead"
				);
			}
			const { comicToPdf } = await import('$lib/codecs/ebook-pdf');
			const out = await comicToPdf(
				file,
				settings as EbookSettings,
				(fraction, detail) =>
					onProgress({
						...base,
						fileFraction: Math.min(fraction, 0.98),
						detail,
						stage: 'processing'
					}),
				signal
			);
			blob = out.blob;
			info =
				`${out.pages} page${out.pages !== 1 ? 's' : ''}` +
				(out.lossless > 0 ? ` · ${out.lossless} embedded losslessly` : '') +
				(out.transcoded > 0 ? ` · ${out.transcoded} re-encoded` : '');
			// A comic PDF is usually LARGER than its source archive (PDF framing
			// on top of the same bytes) — the keep-original guard must not
			// silently hand back the .cbz.
			formatChanged = true;
			outName = replaceExtension(file.name, '.pdf');
		} else if (format === 'ebook') {
			const { compressEbook } = await import('$lib/codecs/ebook');
			const out = await compressEbook(
				file,
				settings as EbookSettings,
				(fraction, detail) =>
					onProgress({
						...base,
						fileFraction: Math.min(fraction, 0.98),
						detail,
						stage: 'processing'
					}),
				signal
			);
			blob = out.blob;
			info = out.info;
			warning = out.warning;
			// true only for cbr → cbz: a zip bigger than its rar source must
			// still ship (reverting would silently un-convert the container).
			formatChanged = out.formatChanged;
			// A committed maxDimension downscale must survive the guard below.
			resized = out.transformed;
			outName = replaceExtension(file.name, out.outExt);
		} else if (format === 'model') {
			const { compressModel } = await import('$lib/codecs/model');
			const out = await compressModel(
				file,
				settings as ModelSettings,
				(fraction, detail) =>
					onProgress({
						...base,
						fileFraction: Math.min(fraction, 0.98),
						detail,
						stage: 'processing'
					}),
				signal
			);
			blob = out.blob;
			info = out.info;
			warning = out.warning;
			// .glb in → .glb out: formatChanged stays false so the whole-file
			// keep-original guard applies; committed simplify/texture downscale
			// must not be reverted by it.
			resized = out.transformed;
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
			stickyWarning = out.stickyWarning ?? false;
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
			// the untouched original did NOT undergo — same for a reverted
			// ebook's/model's "N of M … recompressed". EXIF keeps its info —
			// "No metadata found" relies on exactly this branch.
			if (isImage || format === 'ebook' || format === 'model') info = null;
			// A warning usually narrates the DISCARDED encode ("first frame
			// only", "smallest achievable is N KB") — on the untouched original
			// those claims are false. Reverts ship warning-free, EXCEPT sticky
			// warnings that describe the settings, not the encode ("target size
			// doesn't apply to WAV") — those stay true either way (AU-14).
			if (!stickyWarning) warning = null;
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
