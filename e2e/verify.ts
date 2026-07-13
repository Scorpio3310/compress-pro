/**
 * Node-side output verification: sharp for decode/metadata (jpg/png/webp/gif/
 * avif), icodec's libheif build for HEIC decode (sharp can't), pixelmatch for
 * visual diffs, pdf-lib for PDF structure, fflate for ZIP inspection.
 * (HEIC fixtures still carry a .preview.png proxy — report visuals only.)
 */
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

/** Decode one frame to raw RGBA — doubles as the "decodes cleanly" check. */
export async function decodeRaw(buf: Buffer, page = 0): Promise<RawImage> {
	if (isHeicBuffer(buf)) return decodeHeicRaw(buf); // single-frame by nature
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
 * PSNR in dB over RGB (alpha excluded — decodeRaw's ensureAlpha pads 255).
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
		const dr = a.data[i] - b.data[i];
		const dg = a.data[i + 1] - b.data[i + 1];
		const db = a.data[i + 2] - b.data[i + 2];
		sum += dr * dr + dg * dg + db * db;
	}
	const mse = sum / (n * 3);
	return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
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
		ssim = ssimFn(asImageData(orig), asImageData(out)).mssim;
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
		const c = { input, left, top: 0 };
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
