/**
 * Node-side output verification: sharp for decode/metadata (jpg/png/webp/gif/
 * avif), icodec's libheif build for HEIC decode (sharp can't), pixelmatch for
 * visual diffs, pdf-lib for PDF structure, fflate for ZIP inspection.
 * (HEIC fixtures still carry a .preview.png proxy — report visuals only.)
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';
import { unzipSync } from 'fflate';
import * as pdfLibNs from 'pdf-lib';
import { detectColorSpace } from '../src/lib/codecs/color-profile';
import { convertibleSpace, convertToSrgbInPlace } from '../src/lib/codecs/color-convert';
import { sniffFont } from '../src/lib/codecs/font-sniff';
import { findTable, readSfnt } from '../src/lib/codecs/sfnt';
import { unwrapWoff1 } from '../src/lib/codecs/woff1';

// pdf-lib is CJS; depending on the loader the namespace may nest under default.
const { PDFDocument } = ((pdfLibNs as { default?: typeof pdfLibNs }).default ??
	pdfLibNs) as typeof pdfLibNs;

export interface ImageMeta {
	/** normalized: sharp reports AVIF as heif+av1 → 'avif' */
	format: string;
	width: number;
	/** single-frame height (sharp's animated metadata concatenates pages) */
	height: number;
	pages: number;
	/** per-frame delays in ms, animated inputs only */
	delay: number[] | null;
	hasAlpha: boolean;
	space?: string;
	depth?: string;
	isProgressive: boolean;
	bytes: number;
}

export async function imageMeta(buf: Buffer): Promise<ImageMeta> {
	// sharp has no libjxl — sniff JXL up front and decode via icodec instead.
	if (isJxlBuffer(buf)) {
		const raw = await decodeJxlRaw(buf);
		let hasAlpha = false;
		for (let i = 3; i < raw.data.length; i += 4) {
			if (raw.data[i] !== 255) {
				hasAlpha = true;
				break;
			}
		}
		return {
			format: 'jxl',
			width: raw.width,
			height: raw.height,
			pages: 1,
			delay: null,
			hasAlpha,
			space: undefined,
			depth: undefined,
			isProgressive: false,
			bytes: buf.length
		};
	}
	const m = await sharp(buf, { pages: -1 }).metadata();
	let format: string = m.format ?? 'unknown';
	if (format === 'heif') format = m.compression === 'av1' ? 'avif' : 'heic';
	return {
		format,
		width: m.width ?? 0,
		height: m.pageHeight ?? m.height ?? 0,
		pages: m.pages ?? 1,
		delay: m.delay ?? null,
		hasAlpha: !!m.hasAlpha,
		space: m.space,
		depth: m.depth,
		isProgressive: !!m.isProgressive,
		bytes: buf.length
	};
}

export interface ExifRawMeta {
	/** Raw EXIF buffer as stored (JPEG APP1 / PNG eXIf / WebP EXIF), null when absent. */
	exif: Buffer | null;
	icc: Buffer | null;
	orientation: number | null;
}

/** Metadata-focused view (imageMeta deliberately hides these). */
export async function exifMeta(buf: Buffer): Promise<ExifRawMeta> {
	const m = await sharp(buf).metadata();
	return { exif: m.exif ?? null, icc: m.icc ?? null, orientation: m.orientation ?? null };
}

export interface RawImage {
	data: Buffer;
	width: number;
	height: number;
}

// --- HEIC (sharp has no libheif; icodec's node build fills the gap) --------

/** ISOBMFF ftyp brand check — AVIF is deliberately excluded (sharp reads it). */
function isHeicBuffer(buf: Buffer): boolean {
	if (buf.length < 12 || buf.toString('latin1', 4, 8) !== 'ftyp') return false;
	return ['heic', 'heix', 'mif1', 'msf1', 'heis', 'hevc'].includes(buf.toString('latin1', 8, 12));
}

type HeicModule = {
	loadDecoder(): Promise<unknown>;
	decode(input: Uint8Array): {
		data: Uint8Array;
		width: number;
		height: number;
		/** Set by the _icodec_ImageData shim for >8-bit sources. */
		depth?: number;
	};
};

let heicReady: Promise<HeicModule> | null = null;

async function decodeHeicRaw(buf: Buffer): Promise<RawImage> {
	// icodec's wasm glue returns pixels through this global (no ImageData in Node).
	(globalThis as Record<string, unknown>)._icodec_ImageData ??= (
		data: Uint8Array,
		width: number,
		height: number,
		depth: number
	) => ({ data, width, height, depth });
	heicReady ??= import('icodec/node').then(async (m) => {
		const heic = m.heic as unknown as HeicModule;
		await heic.loadDecoder();
		return heic;
	});
	const heic = await heicReady;
	const img = heic.decode(new Uint8Array(buf));

	// 10/12-bit sources (some iPhone captures) come back as 16-bit words —
	// reduce to 8 bit the same way the app does (icodec-common toBitDepth).
	let rgba: Uint8Array;
	if (img.depth && img.depth !== 8) {
		const words = new Uint16Array(img.data.buffer, img.data.byteOffset, img.width * img.height * 4);
		rgba = new Uint8Array(words.length);
		const shift = img.depth - 8;
		for (let i = 0; i < words.length; i++) rgba[i] = words[i] >> shift;
	} else {
		rgba = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
	}

	// The app's worker converts recognized wide-gamut HEICs (Display P3
	// iPhone stills) to sRGB — the reference must do the SAME or every pixel
	// diff would measure the gamut conversion instead of codec loss. Shared
	// decision function ⇒ reference and worker cannot diverge. Untagged
	// sources (sips-generated synthetics, sample1.*) are a no-op.
	const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
	const profile = await detectColorSpace(ab).catch(() => null);
	const space = profile && convertibleSpace(profile.space, profile.transfer);
	if (space) {
		convertToSrgbInPlace(
			new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength),
			space,
			profile.transfer
		);
	}

	return {
		data: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength),
		width: img.width,
		height: img.height
	};
}

// --- JXL (sharp has no libjxl either; same icodec node build) --------------

/** Bare codestream (FF 0A) or ISO BMFF container ('JXL ' box). */
export function isJxlBuffer(buf: Buffer): boolean {
	if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0x0a) return true;
	return (
		buf.length >= 12 &&
		buf.readUInt32BE(0) === 0x0c &&
		buf.toString('latin1', 4, 8) === 'JXL ' &&
		buf.readUInt32BE(8) === 0x0d0a870a
	);
}

let jxlReady: Promise<HeicModule> | null = null;

async function decodeJxlRaw(buf: Buffer): Promise<RawImage> {
	(globalThis as Record<string, unknown>)._icodec_ImageData ??= (
		data: Uint8Array,
		width: number,
		height: number,
		depth: number
	) => ({ data, width, height, depth });
	jxlReady ??= import('icodec/node').then(async (m) => {
		const jxl = m.jxl as unknown as HeicModule;
		await jxl.loadDecoder();
		return jxl;
	});
	const jxl = await jxlReady;
	const img = jxl.decode(new Uint8Array(buf));
	// No sRGB pass here: detectColorSpace cannot parse JXL containers, so the
	// app's worker leaves these pixels alone too — parity by construction.
	let rgba: Uint8Array;
	if (img.depth && img.depth !== 8) {
		const words = new Uint16Array(img.data.buffer, img.data.byteOffset, img.width * img.height * 4);
		rgba = new Uint8Array(words.length);
		const shift = img.depth - 8;
		for (let i = 0; i < words.length; i++) rgba[i] = words[i] >> shift;
	} else {
		rgba = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
	}
	return {
		data: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength),
		width: img.width,
		height: img.height
	};
}

/** Decode one frame to raw RGBA — doubles as the "decodes cleanly" check. */
export async function decodeRaw(buf: Buffer, page = 0): Promise<RawImage> {
	if (isHeicBuffer(buf)) return decodeHeicRaw(buf); // single-frame by nature
	if (isJxlBuffer(buf)) return decodeJxlRaw(buf);
	// toColourspace normalizes CMYK/16-bit inputs to comparable 8-bit sRGB.
	const { data, info } = await sharp(buf, { page })
		.toColourspace('srgb')
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	return { data, width: info.width, height: info.height };
}

export interface DiffResult {
	/** mismatched pixels / total pixels */
	ratio: number;
	diffPng: Buffer;
	width: number;
	height: number;
}

/** Decode both buffers (HEIC-aware) and lanczos3-align the ORIGINAL to the
 *  output's dimensions when they differ (resize tests). */
async function alignedPair(
	origBuf: Buffer,
	outBuf: Buffer,
	opts: { origPage?: number; outPage?: number } = {}
): Promise<{ orig: RawImage; out: RawImage }> {
	const { origPage = 0, outPage = 0 } = opts;
	const out = await decodeRaw(outBuf, outPage);
	// Decode first, then resize the RAW pixels — sharp can't decode HEIC buffers.
	let orig = await decodeRaw(origBuf, origPage);
	if (orig.width !== out.width || orig.height !== out.height) {
		const { data, info } = await sharp(orig.data, {
			raw: { width: orig.width, height: orig.height, channels: 4 }
		})
			.resize(out.width, out.height, { kernel: 'lanczos3', fit: 'fill' })
			.raw()
			.toBuffer({ resolveWithObject: true });
		orig = { data, width: info.width, height: info.height };
	}
	return { orig, out };
}

async function diffPair(orig: RawImage, out: RawImage, threshold: number): Promise<DiffResult> {
	const diff = Buffer.alloc(out.width * out.height * 4);
	const mismatched = pixelmatch(orig.data, out.data, diff, out.width, out.height, { threshold });
	const diffPng = await sharp(diff, {
		raw: { width: out.width, height: out.height, channels: 4 }
	})
		.png()
		.toBuffer();
	return {
		ratio: mismatched / (out.width * out.height),
		diffPng,
		width: out.width,
		height: out.height
	};
}

/**
 * Pixel-compare two encoded images. When dimensions differ (resize tests) the
 * ORIGINAL is lanczos3-resized to the output's dimensions first.
 */
export async function pixelDiff(
	origBuf: Buffer,
	outBuf: Buffer,
	opts: { threshold?: number; origPage?: number; outPage?: number } = {}
): Promise<DiffResult> {
	// 0.05 (not pixelmatch's 0.25 default): compression artifacts are small
	// per-pixel color shifts — at 0.25 even a quality-5 JPEG reads as ~0.5%
	// different, at 0.05 it reads ~11% while q60 reads ~1.4%.
	const { threshold = 0.05, origPage = 0, outPage = 0 } = opts;
	const { orig, out } = await alignedPair(origBuf, outBuf, { origPage, outPage });
	return diffPair(orig, out, threshold);
}

/**
 * PSNR in dB over coverage-weighted RGB: each channel is premultiplied by its
 * pixel's alpha before differencing, so fully transparent pixels contribute
 * nothing and LOSING coverage itself still counts (255·1 vs x·0). Straight-
 * alpha decoders keep whatever RGB the encoder happened to store under
 * alpha=0 (white mattes; canvas round-trips store zeros) — unweighted RGB
 * would punish differences no human can see (measured: the watercolor PNG
 * fixture scored 12.8 dB purely from invisible pixels). Opaque images are
 * unaffected (weight 1 everywhere).
 * Integrates error magnitude across ALL pixels, so it catches uniform
 * sub-threshold degradation (banding, over-smoothing, slight level shifts)
 * that the pixelmatch ratio is blind to. Identical pixels → Infinity.
 */
export function psnrRaw(a: RawImage, b: RawImage): number {
	if (a.width !== b.width || a.height !== b.height) {
		throw new Error('psnrRaw: dimension mismatch');
	}
	let sum = 0;
	const n = a.width * a.height;
	for (let i = 0; i < n * 4; i += 4) {
		const wa = a.data[i + 3] / 255;
		const wb = b.data[i + 3] / 255;
		const dr = a.data[i] * wa - b.data[i] * wb;
		const dg = a.data[i + 1] * wa - b.data[i + 1] * wb;
		const db = a.data[i + 2] * wa - b.data[i + 2] * wb;
		sum += dr * dr + dg * dg + db * db;
	}
	const mse = sum / (n * 3);
	return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

/** Copy with RGB premultiplied by alpha — for metrics (SSIM) that read the
 *  RGB planes naively; see psnrRaw for why invisible pixels must not count. */
function premultiplied(raw: RawImage): RawImage {
	const data = Buffer.from(raw.data);
	for (let i = 0; i < data.length; i += 4) {
		const alpha = data[i + 3];
		if (alpha === 255) continue;
		data[i] = Math.round((data[i] * alpha) / 255);
		data[i + 1] = Math.round((data[i + 1] * alpha) / 255);
		data[i + 2] = Math.round((data[i + 2] * alpha) / 255);
	}
	return { data, width: raw.width, height: raw.height };
}

export interface CropRegion {
	left: number;
	top: number;
	width: number;
	height: number;
}

function cropRaw(raw: RawImage, r: CropRegion): RawImage {
	const data = Buffer.alloc(r.width * r.height * 4);
	for (let y = 0; y < r.height; y++) {
		const src = ((r.top + y) * raw.width + r.left) * 4;
		raw.data.copy(data, y * r.width * 4, src, src + r.width * 4);
	}
	return { data, width: r.width, height: r.height };
}

/**
 * Decode + optional crop + PSNR. `region` lets video-frame comparisons exclude
 * moving overlays (frame counter, travelling square) and compare only the
 * stable band area. Returns raw dB (Infinity when identical).
 */
export async function psnr(
	aBuf: Buffer,
	bBuf: Buffer,
	opts: { region?: CropRegion; aPage?: number; bPage?: number } = {}
): Promise<number> {
	const { orig, out } = await alignedPair(aBuf, bBuf, {
		origPage: opts.aPage ?? 0,
		outPage: opts.bPage ?? 0
	});
	const a = opts.region ? cropRaw(orig, opts.region) : orig;
	const b = opts.region ? cropRaw(out, opts.region) : out;
	return psnrRaw(a, b);
}

export interface QualityMetrics extends DiffResult {
	/** dB, capped at 99 so it survives JSON (identical → 99). */
	psnr: number;
	/** mean SSIM 0..1 (ssim.js), null unless opts.ssim requested it. */
	ssim: number | null;
}

/**
 * Superset of pixelDiff: one decode pass yields the pixelmatch ratio, PSNR and
 * (opt-in — it costs ~50-150 ms/MP) mean SSIM. Division of authority: the
 * DIFF_BUDGET ratio stays the regression gate; PSNR/SSIM floors guard the
 * failure modes a beyond-threshold pixel count can't see.
 */
export async function qualityMetrics(
	origBuf: Buffer,
	outBuf: Buffer,
	opts: { threshold?: number; origPage?: number; outPage?: number; ssim?: boolean } = {}
): Promise<QualityMetrics> {
	const { threshold = 0.05, origPage = 0, outPage = 0 } = opts;
	const { orig, out } = await alignedPair(origBuf, outBuf, { origPage, outPage });
	const diff = await diffPair(orig, out, threshold);
	let ssim: number | null = null;
	if (opts.ssim) {
		const { ssim: ssimFn } = await import('ssim.js');
		const asImageData = (raw: RawImage) => ({
			data: new Uint8ClampedArray(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength),
			width: raw.width,
			height: raw.height
		});
		// ssim.js reads RGB naively — weight by coverage like psnrRaw does.
		ssim = ssimFn(asImageData(premultiplied(orig)), asImageData(premultiplied(out))).mssim;
	}
	return { ...diff, psnr: Math.min(psnrRaw(orig, out), 99), ssim };
}

/** Strict raw-RGBA byte equality (PNG q100 lossless guarantee). */
export async function isPixelIdentical(aBuf: Buffer, bBuf: Buffer): Promise<boolean> {
	const a = await decodeRaw(aBuf);
	const b = await decodeRaw(bBuf);
	return a.width === b.width && a.height === b.height && a.data.equals(b.data);
}

/**
 * Byte offset of the first SOS marker (proper segment walk — FF DA lookalikes
 * inside APP payloads are skipped by length). Everything from SOS onward is
 * the entropy-coded pixel data: byte-equal tails ⇒ identical pixels by
 * construction, with no decoder (or its color management) in the loop.
 */
export function jpegSosOffset(buf: Buffer): number {
	let i = 2;
	while (i + 4 <= buf.length) {
		if (buf[i] !== 0xff) throw new Error('corrupt JPEG: expected a marker');
		const marker = buf[i + 1];
		if (marker === 0xff) {
			i++;
			continue;
		}
		if (marker === 0xda) return i;
		i += 2 + buf.readUInt16BE(i + 2);
	}
	throw new Error('corrupt JPEG: no SOS marker');
}

/** Count distinct RGBA values (palette/quantization assertions). */
export async function uniqueColorCount(buf: Buffer, page = 0): Promise<number> {
	const { data } = await decodeRaw(buf, page);
	const seen = new Set<number>();
	for (let i = 0; i < data.length; i += 4) {
		seen.add(data.readUInt32BE(i));
	}
	return seen.size;
}

/** Sample RGBA at (x, y) of a decoded frame. */
export function pixelAt(raw: RawImage, x: number, y: number): [number, number, number, number] {
	const i = (y * raw.width + x) * 4;
	return [raw.data[i], raw.data[i + 1], raw.data[i + 2], raw.data[i + 3]];
}

/** Horizontal strip of PNG frames (report visual for multi-timestamp checks). */
export async function stitchHorizontal(frames: Buffer[], gap = 4): Promise<Buffer> {
	const metas = await Promise.all(frames.map((f) => sharp(f).metadata()));
	const width = metas.reduce((sum, m) => sum + (m.width ?? 0), 0) + gap * (frames.length - 1);
	const height = Math.max(...metas.map((m) => m.height ?? 0));
	let left = 0;
	const composites = frames.map((input, i) => {
		// Center unequal heights — a top-pinned shorter frame reads as a
		// vertical offset during visual inspection (O-07).
		const c = { input, left, top: Math.floor((height - (metas[i].height ?? 0)) / 2) };
		left += (metas[i].width ?? 0) + gap;
		return c;
	});
	return sharp({
		create: { width, height, channels: 3, background: { r: 17, g: 17, b: 17 } }
	})
		.composite(composites)
		.png()
		.toBuffer();
}

export interface PdfInfo {
	pageCount: number;
	/** rounded pt sizes, order-faithful — page-size fingerprint for merge/pages */
	pageSizes: { w: number; h: number }[];
}

/** Parses (throws on garbage) and fingerprints a PDF. */
export async function pdfInfo(buf: Buffer): Promise<PdfInfo> {
	const doc = await PDFDocument.load(new Uint8Array(buf), { ignoreEncryption: true });
	return {
		pageCount: doc.getPageCount(),
		pageSizes: doc.getPages().map((p) => ({
			w: Math.round(p.getWidth()),
			h: Math.round(p.getHeight())
		}))
	};
}

/** True when pdf-lib refuses the file without ignoreEncryption — i.e. encrypted. */
export async function pdfIsEncrypted(buf: Buffer): Promise<boolean> {
	try {
		await PDFDocument.load(new Uint8Array(buf));
		return false;
	} catch (error) {
		return error instanceof Error && /encrypted/i.test(error.message);
	}
}

/** Per-page /Rotate angles (pdf-lib parse) — rotate-op verification. */
export async function pdfRotations(buf: Buffer): Promise<number[]> {
	const doc = await PDFDocument.load(new Uint8Array(buf), { ignoreEncryption: true });
	return doc.getPages().map((p) => p.getRotation().angle);
}

/** Full text content of every page — searchable-PDF (OCR layer) verification. */
export async function pdfTextContent(buf: Buffer): Promise<string> {
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
	const doc = await task.promise;
	const parts: string[] = [];
	for (let p = 1; p <= doc.numPages; p++) {
		const page = await doc.getPage(p);
		const content = await page.getTextContent();
		parts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
	}
	await task.destroy();
	return parts.join('\n');
}

export interface PdfEncryptionMeta {
	encrypted: boolean;
	/** AES-256 (encryption revision 6) markers present in the Encrypt dict. */
	aesv3: boolean;
}

/** Raw-byte scan — qpdf (and most writers) keep the Encrypt dict uncompressed,
 *  so /AESV3 and /R 6 are greppable. pdf-lib's pdfIsEncrypted can't tell
 *  revisions apart; this can, without decrypting anything. */
export function pdfEncryptionMeta(buf: Buffer): PdfEncryptionMeta {
	const text = buf.toString('latin1');
	return {
		encrypted: /\/Encrypt\b/.test(text),
		aesv3: /\/AESV3/.test(text) && /\/R\s*6\b/.test(text)
	};
}

/** DOCINFO fields as a reader sees them (updateMetadata off — no rewrite). */
export async function pdfDocInfo(buf: Buffer): Promise<{ title?: string; author?: string }> {
	const doc = await PDFDocument.load(new Uint8Array(buf), {
		ignoreEncryption: true,
		updateMetadata: false
	});
	return { title: doc.getTitle(), author: doc.getAuthor() };
}

export function unzip(buf: Buffer): Record<string, Uint8Array> {
	return unzipSync(new Uint8Array(buf));
}

/**
 * Lists + extracts ANY archive format via 7z-wasm (the engine the app ships) —
 * the universal verifier for 7z/tar/gz/bz2/xz/rar/… outputs. Returns entries
 * keyed by path relative to the archive root. Throws on nonzero exit
 * (including wrong password).
 */
export async function sevenZipEntries(
	buf: Buffer,
	name: string,
	password = ''
): Promise<Record<string, Uint8Array>> {
	const factory = (await import('7z-wasm/7zz.es6.js')).default;
	const stderr: string[] = [];
	const sz = await factory({
		print: () => {},
		printErr: (l: string) => stderr.push(l),
		// EOF — the d.ts wants `number`, emscripten accepts null (see archive.worker.ts).
		stdin: (() => null) as unknown as () => number
	});
	sz.FS.mkdir('/in');
	sz.FS.mkdir('/out');
	sz.FS.writeFile(`/in/${name}`, new Uint8Array(buf));
	let exit: number | null = null;
	try {
		const returned = sz.callMain(['x', '-y', `-p${password}`, '-o/out', '--', `/in/${name}`]);
		if (typeof returned === 'number') exit = returned;
	} catch (error) {
		throw new Error(`7zz threw on ${name}: ${String(error)} ${stderr.slice(-3).join(' | ')}`, {
			cause: error
		});
	}
	if (exit !== 0) throw new Error(`7zz exit ${exit} on ${name}: ${stderr.slice(-3).join(' | ')}`);
	const entries: Record<string, Uint8Array> = {};
	const walk = (dir: string) => {
		for (const n of sz.FS.readdir(dir)) {
			if (n === '.' || n === '..') continue;
			const full = `${dir}/${n}`;
			if (sz.FS.isDir(sz.FS.stat(full).mode)) walk(full);
			else entries[full.slice('/out/'.length)] = sz.FS.readFile(full);
		}
	};
	walk('/out');
	return entries;
}

/**
 * Encrypts a PDF via qpdf-wasm (the engine the app ships) with EXACT password
 * bytes — no NFC pinning, unlike the app's protect path. Exists so specs can
 * fabricate what Apple's PDF stack writes for non-ASCII passwords (NFD bytes)
 * and prove the unlock retry path opens it. This build prunes the print/printErr
 * hooks (they bind console at factory time — see qpdf.worker.ts), so console is
 * patched around the run to keep qpdf's chatter out of test output.
 */
export async function qpdfEncrypt(buf: Buffer, password: string): Promise<Uint8Array> {
	const factory = (await import('@neslinesli93/qpdf-wasm')).default;
	const wasmPath = join(
		dirname(fileURLToPath(import.meta.url)),
		'../node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm'
	);
	const lines: string[] = [];
	const capture = (...parts: unknown[]) => void lines.push(parts.join(' '));
	const originalLog = console.log;
	const originalError = console.error;
	console.log = capture;
	console.error = capture;
	let exit: number;
	let out: Uint8Array;
	try {
		const qpdf = await factory({ locateFile: () => wasmPath });
		(qpdf.FS as unknown as { writeFile(path: string, data: Uint8Array): void }).writeFile(
			'/in.pdf',
			new Uint8Array(buf)
		);
		exit = qpdf.callMain([
			'--warning-exit-0',
			'--encrypt',
			password,
			password,
			'256',
			'--',
			'/in.pdf',
			'/out.pdf'
		]);
		out = qpdf.FS.readFile('/out.pdf');
	} finally {
		console.log = originalLog;
		console.error = originalError;
	}
	if (exit !== 0) throw new Error(`qpdf encrypt exit ${exit}: ${lines.slice(-3).join(' | ')}`);
	return out;
}

/** gunzip via node:zlib — independent of both fflate and 7zz. */
export async function gunzipBuf(buf: Buffer): Promise<Buffer> {
	const { gunzipSync } = await import('node:zlib');
	return gunzipSync(buf);
}

/**
 * True when the zip's first local file header has the encryption bit set or
 * an AES-256 extra field (0x9901) — how e2e proves "this zip is really
 * password-protected" without decrypting it.
 */
/** First LOCAL file header: raw name + compression method — the OCF
 *  "mimetype first and stored" rule can only be proven at the byte level. */
export function zipFirstEntry(buf: Buffer): { name: string; method: number } {
	if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip (no local file header)');
	return {
		method: buf.readUInt16LE(8),
		name: buf.toString('utf8', 30, 30 + buf.readUInt16LE(26))
	};
}

/** Entry names in CENTRAL-DIRECTORY order — the order readers/tools see.
 *  (fflate's unzipSync loses order for integer-like names; this never does.) */
export function zipCentralNames(buf: Buffer): string[] {
	// EOCD: scan back over the (≤64 KB) comment for the 0x06054b50 signature.
	let eocd = -1;
	for (let at = buf.length - 22; at >= Math.max(0, buf.length - 22 - 65_535); at--) {
		if (buf.readUInt32LE(at) === 0x06054b50) {
			eocd = at;
			break;
		}
	}
	if (eocd === -1) throw new Error('not a zip (no end-of-central-directory)');
	const count = buf.readUInt16LE(eocd + 10);
	let at = buf.readUInt32LE(eocd + 16);
	const names: string[] = [];
	for (let i = 0; i < count; i++) {
		if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('central directory walk desynced');
		const nameLen = buf.readUInt16LE(at + 28);
		const extraLen = buf.readUInt16LE(at + 30);
		const commentLen = buf.readUInt16LE(at + 32);
		names.push(buf.toString('utf8', at + 46, at + 46 + nameLen));
		at += 46 + nameLen + extraLen + commentLen;
	}
	return names;
}

export function zipEntryEncrypted(buf: Buffer): boolean {
	if (buf.readUInt32LE(0) !== 0x04034b50) return false;
	const flags = buf.readUInt16LE(6);
	if (flags & 0x1) return true;
	const extraLen = buf.readUInt16LE(28);
	const nameLen = buf.readUInt16LE(26);
	let at = 30 + nameLen;
	const end = at + extraLen;
	while (at + 4 <= end && at + 4 <= buf.length) {
		const id = buf.readUInt16LE(at);
		if (id === 0x9901) return true;
		at += 4 + buf.readUInt16LE(at + 2);
	}
	return false;
}

export interface VideoFileInfo {
	durationSec: number;
	width: number;
	height: number;
	videoCodec: string | null;
	codecString: string | null;
	audioCodec: string | null;
	trackCount: number;
	rotation: number;
	/** Average packet rate ≈ frame rate. */
	frameRate: number | null;
	/** Demuxed container MIME, e.g. 'video/quicktime' — proves the wrapper, not just the codec. */
	formatMime: string;
}

/** Structural video verification — mediabunny parses in plain Node (no WebCodecs). */
export interface AudioFileInfo {
	durationSec: number;
	audioCodec: string | null;
	numberOfChannels: number;
	sampleRate: number;
	hasVideo: boolean;
	trackCount: number;
	/** Demuxed container MIME, e.g. 'application/ogg' vs 'video/webm' — proves
	 *  the wrapper for outputs that share the opus codec (.ogg/.opus vs .weba). */
	formatMime: string;
}

/** Audio-first parse — works for audio-only files videoInfo would reject. */
export async function audioInfo(buf: Buffer): Promise<AudioFileInfo> {
	const { ALL_FORMATS, BufferSource, Input } = await import('mediabunny');
	const input = new Input({ source: new BufferSource(new Uint8Array(buf)), formats: ALL_FORMATS });
	const audio = await input.getPrimaryAudioTrack();
	if (!audio) throw new Error('no audio track');
	return {
		durationSec: await input.computeDuration(),
		audioCodec: await audio.getCodec(),
		numberOfChannels: audio.numberOfChannels,
		sampleRate: audio.sampleRate,
		hasVideo: !!(await input.getPrimaryVideoTrack()),
		trackCount: (await input.getTracks()).length,
		formatMime: (await input.getFormat()).mimeType
	};
}

export async function videoInfo(buf: Buffer): Promise<VideoFileInfo> {
	const { ALL_FORMATS, BufferSource, Input } = await import('mediabunny');
	const input = new Input({ source: new BufferSource(new Uint8Array(buf)), formats: ALL_FORMATS });
	const video = await input.getPrimaryVideoTrack();
	if (!video) throw new Error('no video track');
	const audio = await input.getPrimaryAudioTrack();
	const stats = await video.computePacketStats(120).catch(() => null);
	return {
		durationSec: await input.computeDuration(),
		width: await video.getDisplayWidth(),
		height: await video.getDisplayHeight(),
		videoCodec: await video.getCodec(),
		codecString: await video.getCodecParameterString(),
		audioCodec: audio ? await audio.getCodec() : null,
		trackCount: (await input.getTracks()).length,
		rotation: await video.getRotation(),
		frameRate: stats && stats.averagePacketRate > 0 ? stats.averagePacketRate : null,
		formatMime: (await input.getFormat()).mimeType
	};
}

export interface IcoInfo {
	count: number;
	sizes: number[];
	/** Whole embedded payloads (PNG files in our outputs). */
	entries: { size: number; bytes: Buffer; isPng: boolean }[];
}

/** Parses an ICO container (ICONDIR + entries). Throws on anything else. */
export function icoInfo(buf: Buffer): IcoInfo {
	if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) throw new Error('not an ICO file');
	const count = buf.readUInt16LE(4);
	const entries = [];
	for (let i = 0; i < count; i++) {
		const at = 6 + i * 16;
		const size = buf[at] === 0 ? 256 : buf[at];
		const length = buf.readUInt32LE(at + 8);
		const offset = buf.readUInt32LE(at + 12);
		const bytes = buf.subarray(offset, offset + length);
		entries.push({ size, bytes, isPng: bytes[0] === 0x89 && bytes[1] === 0x50 });
	}
	return { count, sizes: entries.map((e) => e.size), entries };
}

// --- Fonts (parsed with the app's own container modules — their wrap/unwrap
// correctness is proven independently by the codec unit tests) --------------

export interface FontFileInfo {
	container: 'ttf' | 'otf' | 'woff' | 'woff2' | 'eot' | 'ttc' | 'unknown';
	flavor: 'glyf' | 'cff' | null;
	/** Table count (woff2: header field only; eot: null). */
	numTables: number | null;
	/** Directory tags for sfnt/woff containers, null otherwise. */
	tags: string[] | null;
	/** maxp numGlyphs for sfnt/woff containers (the subset op's honest metric). */
	glyphCount: number | null;
}

function sfntGlyphCount(bytes: Uint8Array): number | null {
	const maxp = findTable(bytes, readSfnt(bytes), 'maxp');
	if (!maxp || maxp.length < 6) return null;
	return new DataView(maxp.buffer, maxp.byteOffset).getUint16(4);
}

export function fontInfo(buf: Buffer): FontFileInfo {
	const bytes = new Uint8Array(buf);
	const sniff = sniffFont(bytes);
	if (!sniff)
		return { container: 'unknown', flavor: null, numTables: null, tags: null, glyphCount: null };
	if (sniff.container === 'ttf' || sniff.container === 'otf') {
		const sfnt = readSfnt(bytes);
		return {
			container: sniff.container,
			flavor: sniff.flavor,
			numTables: sfnt.tables.length,
			tags: sfnt.tables.map((t) => t.tag),
			glyphCount: sfntGlyphCount(bytes)
		};
	}
	if (sniff.container === 'woff') {
		const inner = unwrapWoff1(bytes);
		const sfnt = readSfnt(inner);
		return {
			container: 'woff',
			flavor: sniff.flavor,
			numTables: sfnt.tables.length,
			tags: sfnt.tables.map((t) => t.tag),
			glyphCount: sfntGlyphCount(inner)
		};
	}
	if (sniff.container === 'woff2') {
		// Full decode needs the wasm codec — the header carries what we assert.
		return {
			container: 'woff2',
			flavor: sniff.flavor,
			numTables: buf.readUInt16BE(12),
			tags: null,
			glyphCount: null
		};
	}
	return {
		container: sniff.container,
		flavor: sniff.flavor,
		numTables: null,
		tags: null,
		glyphCount: null
	};
}

/** tag → exact table bytes of a raw sfnt (TTF/OTF) buffer. */
export function sfntTableBytes(buf: Buffer): Record<string, Buffer> {
	const bytes = new Uint8Array(buf);
	const sfnt = readSfnt(bytes);
	return Object.fromEntries(
		sfnt.tables.map((t) => [t.tag, Buffer.from(bytes.subarray(t.offset, t.offset + t.length))])
	);
}

/** tag → exact INNER table bytes of a WOFF — the byte-level losslessness probe. */
export function woffTableBytes(buf: Buffer): Record<string, Buffer> {
	return sfntTableBytes(Buffer.from(unwrapWoff1(new Uint8Array(buf))));
}

// --- GLB (gltf-transform NodeIO — the same engine the app runs) ------------

export interface GlbInfo {
	/** RAW-BYTE layer: read from the GLB JSON chunk, not the decoded document. */
	extensionsRequired: string[];
	extensionsUsed: string[];
	/** Library layer, AFTER decode (draco/meshopt decoders registered). */
	triangles: number;
	vertices: number;
	textures: { mime: string; width: number; height: number; bytes: number }[];
	animations: number;
	animationChannels: number;
}

/** Raw chunk-0 JSON of a .glb — magic + version checked, nothing decoded. */
export function glbJson(buf: Buffer): Record<string, unknown> {
	if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb (magic)');
	if (buf.readUInt32LE(4) !== 2) throw new Error('not glTF 2.0');
	const jsonLength = buf.readUInt32LE(12);
	if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('chunk 0 is not JSON');
	return JSON.parse(buf.toString('utf8', 20, 20 + jsonLength));
}

type GltfIo = import('@gltf-transform/core').NodeIO;
let glbIoReady: Promise<GltfIo> | null = null;

async function getGlbIo(): Promise<GltfIo> {
	glbIoReady ??= (async () => {
		const { NodeIO } = await import('@gltf-transform/core');
		const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
		const draco3d = (await import('draco3d')).default;
		const { MeshoptDecoder, MeshoptEncoder } = await import('meshoptimizer');
		await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
		return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
			'draco3d.encoder': await draco3d.createEncoderModule({}),
			'draco3d.decoder': await draco3d.createDecoderModule({}),
			'meshopt.encoder': MeshoptEncoder,
			'meshopt.decoder': MeshoptDecoder
		});
	})();
	return glbIoReady;
}

export async function glbInfo(buf: Buffer): Promise<GlbInfo> {
	const json = glbJson(buf) as { extensionsRequired?: string[]; extensionsUsed?: string[] };
	const io = await getGlbIo();
	const document = await io.readBinary(new Uint8Array(buf));
	let triangles = 0;
	let vertices = 0;
	for (const mesh of document.getRoot().listMeshes()) {
		for (const primitive of mesh.listPrimitives()) {
			const position = primitive.getAttribute('POSITION');
			if (!position) continue;
			const indices = primitive.getIndices();
			triangles += Math.floor((indices ? indices.getCount() : position.getCount()) / 3);
			vertices += position.getCount();
		}
	}
	const textures: GlbInfo['textures'] = [];
	for (const texture of document.getRoot().listTextures()) {
		const image = texture.getImage();
		if (!image) continue;
		const meta = await imageMeta(Buffer.from(image));
		textures.push({
			mime: texture.getMimeType(),
			width: meta.width,
			height: meta.height,
			bytes: image.byteLength
		});
	}
	const animations = document.getRoot().listAnimations();
	return {
		extensionsRequired: json.extensionsRequired ?? [],
		extensionsUsed: json.extensionsUsed ?? [],
		triangles,
		vertices,
		textures,
		animations: animations.length,
		animationChannels: animations.reduce((n, a) => n + a.listChannels().length, 0)
	};
}

/** True when the .glb decodes WITHOUT any compression decoders registered —
 *  the "opens in every viewer as-is" proof for compression: none output. */
export async function glbDecodesWithoutCodecs(buf: Buffer): Promise<boolean> {
	const { NodeIO } = await import('@gltf-transform/core');
	const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
	const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
	try {
		await io.readBinary(new Uint8Array(buf));
		return true;
	} catch {
		return false;
	}
}

// --- XLSX (SheetJS — the same engine the app runs) -------------------------

export interface XlsxFileInfo {
	sheetNames: string[];
	/** First sheet as formatted-text rows (header:1, raw:false). */
	rows: string[][];
}

export async function xlsxInfo(buf: Buffer): Promise<XlsxFileInfo> {
	const XLSX = await import('xlsx');
	const wb = XLSX.read(buf, { type: 'buffer' });
	const ws = wb.Sheets[wb.SheetNames[0]];
	return {
		sheetNames: wb.SheetNames,
		rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as string[][]
	};
}
