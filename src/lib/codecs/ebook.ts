/**
 * EPUB / CBZ / CBR recompression — the archive is read (fflate for ZIP, the
 * 7zz worker for RAR and exotic ZIPs), every raster image inside is re-encoded
 * IN ITS OWN format through the pooled image worker, and the container is
 * rebuilt as a ZIP. One uniform pipeline: .epub → .epub, .cbz → .cbz,
 * .cbr → .cbz. Text, styles and structure pass through byte-identical.
 */
import type { EbookSettings, UploadedFile } from '$lib/types';
import { callWorker, imageLaneCap } from '$lib/workers/rpc';
import { runWithConcurrency } from '$lib/concurrency';

export interface EbookResult {
	blob: Blob;
	/** '.epub' keeps .epub; '.cbz' for .cbz AND .cbr inputs. */
	outExt: '.epub' | '.cbz';
	/** true only when outExt differs from the input's extension (cbr → cbz). */
	formatChanged: boolean;
	/** true when a maxDimension downscale was committed to at least one entry —
	 *  feeds compressOne's `resized` so the whole-file guard can't revert it. */
	transformed: boolean;
	info: string | null;
	warning: string | null;
}

interface Entry {
	name: string;
	bytes: Uint8Array;
}

/** Raster formats we re-encode; magic bytes are authoritative — comics are
 *  full of .jpg files that are really PNGs, and the entry NAME must never
 *  change (opf hrefs / reader page order reference it). */
export function sniffImage(bytes: Uint8Array): 'jpg' | 'png' | 'webp' | null {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return 'png';
	}
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return 'webp';
	}
	return null;
}

/** GIFs pass through (re-encoding animations inside books isn't worth it),
 *  but they still ride stored in the rebuilt zip — already compressed. */
export function sniffGif(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 4 &&
		bytes[0] === 0x47 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x38
	);
}

export function isEpubDoc(entries: Entry[], fileName: string): boolean {
	const mimetype = entries.find((e) => e.name === 'mimetype');
	if (mimetype) {
		return new TextDecoder().decode(mimetype.bytes.slice(0, 20)).startsWith('application/epub+zip');
	}
	return /\.epub$/i.test(fileName);
}

/** EPUB encryption.xml is DRM — EXCEPT when every Algorithm is a font-
 *  obfuscation URI (InDesign exports those routinely; the obfuscated fonts
 *  pass through untouched anyway since they aren't images). */
export function isDrmEncryption(xml: string): boolean {
	const algorithms = [...xml.matchAll(/Algorithm\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
	if (algorithms.length === 0) return false;
	const FONT_OBFUSCATION = new Set([
		'http://www.idpf.org/2008/embedding',
		'http://ns.adobe.com/pdf/enc#RC'
	]);
	return algorithms.some((a) => !FONT_OBFUSCATION.has(a));
}

export function ebookInfo(
	isEpub: boolean,
	isCbr: boolean,
	changed: number,
	candidates: number,
	entryCount: number
): string {
	const noun = isEpub ? 'image' : 'page';
	const prefix = isCbr ? 'Converted to CBZ · ' : '';
	if (candidates === 0) {
		return isCbr
			? `Converted to CBZ · ${entryCount} file${entryCount === 1 ? '' : 's'} repacked`
			: 'No images found — archive repacked';
	}
	return `${prefix}${changed} of ${candidates} ${noun}${candidates === 1 ? '' : 's'} recompressed`;
}

/** fflate can't write zip64 — its entry count silently wraps at 16 bits. */
const MAX_ENTRIES = 65_535;

async function readArchive(
	file: UploadedFile,
	onProgress: (fraction: number, detail: string | null) => void,
	signal?: AbortSignal
): Promise<{ entries: Entry[]; wasZip: boolean }> {
	const bytes = new Uint8Array(await file.file.arrayBuffer());
	signal?.throwIfAborted();
	const wasZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
	// 'PK' magic → fflate fast path (no wasm); ANY failure — encrypted zip,
	// mislabeled RAR-as-.cbz, junk — falls through to the 7zz worker, which
	// autodetects the real format and has the friendly error mapping.
	if (wasZip) {
		try {
			const fflate = await import('fflate');
			const record = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
				fflate.unzip(bytes, (error, out) => (error ? reject(error) : resolve(out)))
			);
			signal?.throwIfAborted();
			onProgress(0.2, null);
			return {
				entries: Object.entries(record).map(([name, data]) => ({ name, bytes: data })),
				wasZip
			};
		} catch (error) {
			if (signal?.aborted) throw error;
			// fall through to 7zz
		}
	}
	const { extractArchive } = await import('$lib/codecs/archive-tools');
	let lastFraction = 0;
	const out = await extractArchive(
		file,
		'',
		(fraction, detail) => {
			lastFraction = fraction == null ? lastFraction : Math.max(lastFraction, fraction);
			onProgress(lastFraction * 0.2, detail);
		},
		signal
	);
	return { entries: out.entries.map((e) => ({ name: e.path, bytes: new Uint8Array(e.bytes) })), wasZip };
}

async function buildZip(
	ordered: { name: string; bytes: Uint8Array; level: 0 | 6 }[]
): Promise<Uint8Array> {
	const fflate = await import('fflate');
	const record: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
	for (const e of ordered) record[e.name] = [e.bytes, { level: e.level }];
	// JS hoists integer-like keys (an entry literally named "12") to the front,
	// which would break the mimetype-first rule — fall back to the streaming
	// writer, which is order-exact by construction.
	if (Object.keys(record)[0] !== ordered[0].name) return buildZipStreamed(fflate, ordered);
	return new Promise((resolve, reject) =>
		fflate.zip(record, (error, out) => (error ? reject(error) : resolve(out)))
	);
}

function buildZipStreamed(
	fflate: typeof import('fflate'),
	ordered: { name: string; bytes: Uint8Array; level: 0 | 6 }[]
): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		const chunks: Uint8Array[] = [];
		const zip = new fflate.Zip((error, chunk, final) => {
			if (error) return reject(error);
			chunks.push(chunk);
			if (final) {
				const total = chunks.reduce((n, c) => n + c.length, 0);
				const out = new Uint8Array(total);
				let off = 0;
				for (const c of chunks) {
					out.set(c, off);
					off += c.length;
				}
				resolve(out);
			}
		});
		for (const e of ordered) {
			const stream =
				e.level === 0 ? new fflate.ZipPassThrough(e.name) : new fflate.ZipDeflate(e.name, { level: 6 });
			zip.add(stream);
			stream.push(e.bytes, true);
		}
		zip.end();
	});
}

export async function compressEbook(
	file: UploadedFile,
	settings: EbookSettings,
	onProgress: (fraction: number, detail: string | null) => void,
	signal?: AbortSignal
): Promise<EbookResult> {
	const { entries, wasZip } = await readArchive(file, onProgress, signal);
	if (entries.length > MAX_ENTRIES) {
		throw new Error(`Archive has ${entries.length} entries — more than a ZIP can hold (65,535)`);
	}

	const isEpub = isEpubDoc(entries, file.name);
	if (isEpub) {
		const enc = entries.find((e) => e.name === 'META-INF/encryption.xml');
		if (enc && isDrmEncryption(new TextDecoder().decode(enc.bytes))) {
			throw new Error(
				'This EPUB is DRM-protected (META-INF/encryption.xml) — recompressing would corrupt it. Remove the DRM first, then try again'
			);
		}
	}

	// --- Re-encode every raster image in place (0.2 → 0.9) ---
	const candidates = entries
		.map((e, i) => ({ i, kind: sniffImage(e.bytes) }))
		.filter((c): c is { i: number; kind: 'jpg' | 'png' | 'webp' } => c.kind !== null);
	let done = 0;
	let changed = 0;
	let failed = 0;
	let committedResize = false;
	await runWithConcurrency(
		candidates.length,
		imageLaneCap(1),
		async (k) => {
			const { i, kind } = candidates[k];
			const original = entries[i].bytes;
			try {
				// Copy before transfer — the worker call detaches the buffer and
				// the keep-original guard below still needs the source bytes.
				const buf = original.slice().buffer as ArrayBuffer;
				const out = await callWorker(
					'image',
					'encode',
					{
						bytes: buf,
						quality: settings.quality,
						output: kind,
						maxDimension: settings.maxDimension
					},
					[buf],
					undefined,
					{ owner: signal }
				);
				if (out.bytes.byteLength < original.byteLength) {
					entries[i] = { name: entries[i].name, bytes: new Uint8Array(out.bytes) };
					changed++;
					committedResize ||= out.resized;
				}
				// else: per-entry keep-original — the source bytes ride through
			} catch (error) {
				// Our cancel (or another run's pooled-worker teardown) must reach
				// compressOne's machinery; only real decode failures are absorbed.
				if (signal?.aborted || (error instanceof Error && error.name === 'CancelledError')) {
					throw error;
				}
				failed++;
			}
			done++;
			onProgress(0.2 + 0.7 * (done / candidates.length), `image ${done}/${candidates.length}`);
		},
		() => !!signal?.aborted,
		() => !!signal?.aborted
	);
	signal?.throwIfAborted();

	// --- Rebuild (0.9 → 1.0) ---
	onProgress(0.9, null);
	const isStored = (e: Entry) =>
		sniffImage(e.bytes) !== null || sniffGif(e.bytes) || e.bytes.length === 0 || e.name.endsWith('/');
	const ordered = entries.map((e) => ({
		name: e.name,
		bytes: e.bytes,
		level: isStored(e) ? (0 as const) : (6 as const)
	}));
	if (isEpub) {
		// OCF rule: the mimetype entry must be FIRST and STORED. Content is
		// kept verbatim; when a broken epub lacks it, nothing is synthesized.
		const at = ordered.findIndex((e) => e.name === 'mimetype');
		if (at > 0) ordered.unshift(...ordered.splice(at, 1));
		if (at !== -1) ordered[0].level = 0;
	}
	const zipped = await buildZip(ordered);
	signal?.throwIfAborted();

	const currentExt = /\.epub$/i.test(file.name) ? '.epub' : /\.cbz$/i.test(file.name) ? '.cbz' : null;
	const outExt = isEpub ? ('.epub' as const) : ('.cbz' as const);
	const isCbr = !isEpub && currentExt !== '.cbz';
	return {
		blob: new Blob([zipped as Uint8Array<ArrayBuffer>], {
			type: outExt === '.epub' ? 'application/epub+zip' : 'application/vnd.comicbook+zip'
		}),
		outExt,
		// The CONTAINER is what changed, not just the extension: a mislabeled
		// RAR-as-.cbz genuinely converted to ZIP and must ship even when the
		// zip is bigger — reverting would hand back RAR bytes named .cbz.
		formatChanged: outExt !== currentExt || !wasZip,
		transformed: committedResize,
		info: ebookInfo(isEpub, isCbr, changed, candidates.length, entries.length),
		warning: failed > 0 ? `${failed} damaged image${failed === 1 ? '' : 's'} kept unchanged` : null
	};
}
