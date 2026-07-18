import type {
	EncodePayload,
	EncodeProgress,
	EncodeResult,
	PredecodedPixels,
	WorkerContracts
} from './protocol';
import { expose } from './host';
import { wasmReady } from './wasm-ready';
import { sniffAnimatedInput, WEBP_MAX_DIMENSION } from './webp-mux';
import { containScale, frameDelayMs } from '$lib/codecs/video-math';
import { detectColorSpace } from '$lib/codecs/color-profile';
import { convertibleSpace, convertToSrgbInPlace } from '$lib/codecs/color-convert';
import { probeDimensions } from '$lib/codecs/image-probe';
import { stripImageMetadataBytes } from '$lib/codecs/exif';
import pngQuantWasmUrl from 'icodec/png-enc.wasm?url';
import heicDecWasmUrl from 'icodec/heic-dec.wasm?url';
import jxlDecWasmUrl from 'icodec/jxl-dec.wasm?url';
import jxlEncWasmUrl from 'icodec/jxl-enc.wasm?url';

/** Decode-time downscale engages only for genuine giants — comfortably above
 *  the largest calibrated e2e fixture (15.87 MP) so the locked thresholds
 *  never see the browser's resize kernel instead of lanczos3. */
const FAST_DECODE_MIN_PIXELS = 20_000_000;

function bitmapToImageData(bitmap: ImageBitmap): ImageData {
	try {
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const context = canvas.getContext('2d');
		if (!context) throw new Error('OffscreenCanvas 2d context unavailable');
		context.drawImage(bitmap, 0, 0);
		return context.getImageData(0, 0, bitmap.width, bitmap.height);
	} finally {
		bitmap.close();
	}
}

async function decodeToImageData(
	bytes: ArrayBuffer,
	maxDimension: number | null
): Promise<{ imageData: ImageData; preResized: boolean }> {
	const blob = new Blob([bytes]);

	// Giants headed for a big downscale decode straight to the target size:
	// createImageBitmap's resizeWidth/Height scales DURING decode, skipping
	// the full-resolution ImageData (and the wasm lanczos pass) entirely —
	// an 18 MP JPEG capped at 2000 px never materializes at 18 MP.
	if (maxDimension !== null) {
		const probe = probeDimensions(bytes);
		if (probe) {
			// Orientations 5-8 transpose the displayed image; resize dims refer
			// to the oriented result under 'from-image'.
			const ow = probe.orientation >= 5 ? probe.height : probe.width;
			const oh = probe.orientation >= 5 ? probe.width : probe.height;
			const scale = containScale(ow, oh, maxDimension);
			if (ow * oh >= FAST_DECODE_MIN_PIXELS && scale < 1) {
				const width = Math.max(1, Math.round(ow * scale));
				const height = Math.max(1, Math.round(oh * scale));
				const bitmap = await createImageBitmap(blob, {
					imageOrientation: 'from-image',
					resizeWidth: width,
					resizeHeight: height,
					resizeQuality: 'high'
				});
				// Any engine disagreement about orientation×resize ordering shows
				// up as a dimension mismatch — fall back to the plain decode
				// below rather than ever shipping a distorted image.
				if (bitmap.width === width && bitmap.height === height) {
					return { imageData: bitmapToImageData(bitmap), preResized: true };
				}
				bitmap.close();
			}
		}
	}

	// createImageBitmap sniffs the format from the blob contents, so this
	// decodes jpg/png/webp/avif (and the first frame of a gif) without any
	// wasm. 'from-image' pins EXIF rotation handling across browsers.
	const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
	return { imageData: bitmapToImageData(bitmap), preResized: false };
}

// --- TIFF (utif2 — createImageBitmap can't decode TIFF in Chromium) ---

function isTiff(bytes: ArrayBuffer): boolean {
	const b = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
	return (
		(b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || // 'II*\0'
		(b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a) // 'MM\0*'
	);
}

async function decodeTiff(bytes: ArrayBuffer): Promise<ImageData> {
	const UTIF = await import('utif2');
	const ifds = UTIF.decode(bytes);
	if (!ifds.length) throw new Error('Could not decode this TIFF file');
	// Multi-page TIFFs keep the first page (documented on /tiff-to-jpg).
	UTIF.decodeImage(bytes, ifds[0]);
	const rgba = UTIF.toRGBA8(ifds[0]);
	const { width, height } = ifds[0];
	if (!width || !height || !rgba.length) throw new Error('Could not decode this TIFF file');
	// utif2 has zero tag-274 handling — orientation-tagged TIFFs decoded
	// rotated/mirrored vs how Preview/Photoshop display them (F-06).
	const tag274 = (ifds[0] as unknown as Record<string, number[]>)['t274'];
	const { applyOrientation } = await import('../codecs/orientation');
	const oriented = applyOrientation(new Uint8ClampedArray(rgba), width, height, tag274?.[0] ?? 1);
	// Fresh (non-shared) buffer — ImageData rejects ArrayBufferLike views.
	return new ImageData(new Uint8ClampedArray(oriented.data), oriented.width, oriented.height);
}

/** RAW pixels arrive pre-decoded (LibRaw runs outside this worker) — RGB rows
 *  are expanded to the RGBA layout ImageData requires, alpha fully opaque. */
function imageDataFromPredecoded(p: PredecodedPixels): ImageData {
	const src = new Uint8ClampedArray(p.data);
	if (p.channels === 4) return new ImageData(src, p.width, p.height);
	const out = new Uint8ClampedArray(p.width * p.height * 4);
	for (let i = 0, o = 0; i < src.length; i += 3, o += 4) {
		out[o] = src[i];
		out[o + 1] = src[i + 1];
		out[o + 2] = src[i + 2];
		out[o + 3] = 255;
	}
	return new ImageData(out, p.width, p.height);
}

// --- HEIC / JXL (icodec) ---

/** icodec's wasm glue returns pixels through this global, normally
 *  registered by its barrel index.js — which the deep aliases bypass. */
function installIcodecImageDataShim(): void {
	(globalThis as Record<string, unknown>)._icodec_ImageData ??= (
		data: Uint8ClampedArray<ArrayBuffer>,
		width: number,
		height: number,
		depth: number
	) => (depth === 8 ? new ImageData(data, width, height) : { data, width, height, depth });
}

// wasmReady (not `??=`): a rejected load must clear the cache so the user's
// retry refetches instead of replaying the stale error until page reload.
const heicReady = wasmReady(async () => (await import('icodec-heic')).loadDecoder(heicDecWasmUrl));

async function decodeHeic(bytes: ArrayBuffer): Promise<ImageData> {
	installIcodecImageDataShim();
	const heic = await import('icodec-heic');
	await heicReady();

	// libheif applies irot/imir transforms itself — no EXIF handling on top.
	const image = heic.decode(new Uint8Array(bytes));
	if (image.depth !== undefined && image.depth !== 8) {
		const { toBitDepth } = await import('icodec-common');
		const converted = toBitDepth(image, 8);
		return new ImageData(converted.data, converted.width, converted.height);
	}
	return image;
}

// --- JXL (icodec / libjxl — browsers can't createImageBitmap it) ---

function isJxl(bytes: ArrayBuffer): boolean {
	const b = new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength));
	if (b.length >= 2 && b[0] === 0xff && b[1] === 0x0a) return true; // bare codestream
	return (
		// ISO BMFF container: 00 00 00 0C 'JXL ' 0D 0A 87 0A
		b.length >= 12 &&
		b[0] === 0 &&
		b[1] === 0 &&
		b[2] === 0 &&
		b[3] === 0x0c &&
		b[4] === 0x4a &&
		b[5] === 0x58 &&
		b[6] === 0x4c &&
		b[7] === 0x20 &&
		b[8] === 0x0d &&
		b[9] === 0x0a &&
		b[10] === 0x87 &&
		b[11] === 0x0a
	);
}

const jxlDecReady = wasmReady(async () => (await import('icodec-jxl')).loadDecoder(jxlDecWasmUrl));
const jxlEncReady = wasmReady(async () => (await import('icodec-jxl')).loadEncoder(jxlEncWasmUrl));

async function decodeJxl(bytes: ArrayBuffer): Promise<ImageData> {
	installIcodecImageDataShim();
	const jxl = await import('icodec-jxl');
	await jxlDecReady();
	const image = jxl.decode(new Uint8Array(bytes));
	if (image.depth !== undefined && image.depth !== 8) {
		const { toBitDepth } = await import('icodec-common');
		const converted = toBitDepth(image, 8);
		return new ImageData(converted.data, converted.width, converted.height);
	}
	return image;
}

// --- PSD (@webtoon/psd — pure JS, wasm inlined) ---

function isPsd(bytes: ArrayBuffer): boolean {
	const b = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
	return b.length >= 4 && b[0] === 0x38 && b[1] === 0x42 && b[2] === 0x50 && b[3] === 0x53; // '8BPS'
}

async function decodePsd(bytes: ArrayBuffer): Promise<ImageData> {
	const { default: Psd } = await import('@webtoon/psd');
	const psd = Psd.parse(bytes);
	// composite() would happily misread anything else: CMYK channels land as
	// RGBA and 16-bit throws deep inside — fail up front with an honest line.
	if (psd.depth !== 8 || (psd.colorMode !== 3 && psd.colorMode !== 1)) {
		throw new Error(
			'Only 8-bit RGB or grayscale PSD files are supported — CMYK and 16/32-bit need a re-save'
		);
	}
	// Upstream reads RAW-compression planes from one offset (all channels come
	// back as the red plane) — and real-world flattened PSDs commonly store raw
	// composites (quality sweep F-05: every real sample did). Decode the raw
	// composite section ourselves; the honest refusal stays as the fallback.
	const red = (psd as unknown as { imageData?: { red?: { compression?: number } } }).imageData?.red;
	if (psd.colorMode === 3 && red?.compression === 0) {
		const { decodeRawPsdComposite } = await import('../codecs/psd-raw');
		const raw = decodeRawPsdComposite(bytes);
		// Fresh copy — same ImageData foreign-buffer rule as the composite path.
		if (raw) return new ImageData(new Uint8ClampedArray(raw.data), raw.width, raw.height);
		throw new Error(
			'This PSD stores uncompressed image data — re-save it in Photoshop and try again'
		);
	}
	const rgba = await psd.composite();
	if (!psd.width || !psd.height || !rgba.length) throw new Error('Could not decode this PSD file');
	// Fresh copy — ImageData rejects views over foreign buffers (decodeTiff precedent).
	return new ImageData(new Uint8ClampedArray(rgba), psd.width, psd.height);
}

// --- Wide gamut (WASM-decoded paths only) ---

/**
 * libheif/utif2 ignore the embedded profile, so HEIC/TIFF pixels arrive in
 * the source gamut. Convert the spaces we know to sRGB — after the resize,
 * on the fewest pixels. createImageBitmap paths never come here: the
 * browser already color-managed them into the sRGB canvas.
 */
async function applySrgbConversion(bytes: ArrayBuffer, imageData: ImageData): Promise<void> {
	const info = await detectColorSpace(bytes).catch(() => null);
	if (!info) return;
	const space = convertibleSpace(info.space, info.transfer);
	if (space) convertToSrgbInPlace(imageData.data, space, info.transfer);
}

// --- Resize ---

async function maybeResize(
	imageData: ImageData,
	maxDimension: number | null
): Promise<{ imageData: ImageData; resized: boolean }> {
	const scale = containScale(imageData.width, imageData.height, maxDimension);
	if (scale >= 1) return { imageData, resized: false };

	const width = Math.max(1, Math.round(imageData.width * scale));
	const height = Math.max(1, Math.round(imageData.height * scale));
	const { default: resize } = await import('@jsquash/resize');
	return {
		imageData: await resize(imageData, { width, height, method: 'lanczos3' }),
		resized: true
	};
}

/** Static WebP shares the animated path's hard limit: libwebp rejects any
 *  side over WEBP_MAX_DIMENSION with a bare "Encoding error." — shrink to the
 *  cap instead (callers report it via `dimensionCapped`, mirroring AN-11). */
async function clampToWebpCap(
	imageData: ImageData
): Promise<{ imageData: ImageData; capped: boolean }> {
	const scale = containScale(imageData.width, imageData.height, WEBP_MAX_DIMENSION);
	if (scale >= 1) return { imageData, capped: false };
	const width = Math.max(1, Math.round(imageData.width * scale));
	const height = Math.max(1, Math.round(imageData.height * scale));
	const { default: resize } = await import('@jsquash/resize');
	return {
		imageData: await resize(imageData, { width, height, method: 'lanczos3' }),
		capped: true
	};
}

function flattenToWhite(imageData: ImageData): void {
	const p = imageData.data;
	for (let i = 3; i < p.length; i += 4) {
		const a = p[i];
		if (a === 255) continue;
		p[i - 3] = Math.round((p[i - 3] * a + 255 * (255 - a)) / 255);
		p[i - 2] = Math.round((p[i - 2] * a + 255 * (255 - a)) / 255);
		p[i - 1] = Math.round((p[i - 1] * a + 255 * (255 - a)) / 255);
		p[i] = 255;
	}
}

// --- Lossy PNG (icodec libimagequant) ---

const pngQuantReady = wasmReady(async () =>
	(await import('icodec-png')).loadEncoder(pngQuantWasmUrl)
);

async function reducePngColors(imageData: ImageData, quality: number): Promise<ImageData> {
	const png = await import('icodec-png');
	await pngQuantReady();
	const rgba = png.reduceColors(
		{ data: imageData.data, width: imageData.width, height: imageData.height, depth: 8 },
		{ quality, colors: 256, dithering: 1, speed: 4 }
	);
	return new ImageData(new Uint8ClampedArray(rgba), imageData.width, imageData.height);
}

// --- Animated WebP output (WebCodecs ImageDecoder + own muxer) ---

function loopCountFrom(repetitionCount: number): number {
	// ImageDecoder: 0 = play once, N = play N+1 times, Infinity = forever.
	// WebP ANIM:    0 = forever,   N = play N times.
	if (!Number.isFinite(repetitionCount)) return 0;
	return Math.max(1, Math.min(65535, Math.round(repetitionCount) + 1));
}

type AnimatedInputType = 'image/gif' | 'image/webp' | 'image/png';

/** Returns null when this browser/input can't do animated encode (caller falls back). */
async function encodeAnimatedWebp(
	{ bytes, quality, maxDimension }: EncodePayload,
	type: AnimatedInputType,
	progress: (p: EncodeProgress) => void
): Promise<EncodeResult | null> {
	if (typeof ImageDecoder === 'undefined' || !(await ImageDecoder.isTypeSupported(type))) {
		return null;
	}

	const decoder = new ImageDecoder({ data: bytes, type });
	try {
		await decoder.tracks.ready;
		const track = decoder.tracks.selectedTrack;
		if (!track || track.frameCount <= 1) return null;

		const { encode } = await import('@jsquash/webp');
		const { muxAnimatedWebp } = await import('./webp-mux');

		let canvas: OffscreenCanvas | null = null;
		let context: OffscreenCanvasRenderingContext2D | null = null;
		let width = 0;
		let height = 0;
		let resized = false;
		let dimensionCapped = false;
		const frames: { still: Uint8Array; durationMs: number }[] = [];

		for (let i = 0; i < track.frameCount; i++) {
			const { image } = await decoder.decode({ frameIndex: i });
			try {
				if (!canvas) {
					// Clamp to the WebP hard limit so oversized animations shrink
					// (preserving the animation) instead of failing at mux time.
					const cap = Math.min(maxDimension ?? WEBP_MAX_DIMENSION, WEBP_MAX_DIMENSION);
					const scale = containScale(image.displayWidth, image.displayHeight, cap);
					resized = scale < 1;
					dimensionCapped =
						Math.max(image.displayWidth, image.displayHeight) > WEBP_MAX_DIMENSION &&
						(maxDimension === null || maxDimension > WEBP_MAX_DIMENSION);
					width = Math.max(1, Math.round(image.displayWidth * scale));
					height = Math.max(1, Math.round(image.displayHeight * scale));
					canvas = new OffscreenCanvas(width, height);
					context = canvas.getContext('2d', { willReadFrequently: true });
					if (!context) throw new Error('OffscreenCanvas 2d context unavailable');
					context.imageSmoothingQuality = 'high';
				}
				// Frames arrive fully composited; scale during draw (per-frame wasm
				// resize would multiply cost by frame count for marginal gain).
				context!.clearRect(0, 0, width, height);
				context!.drawImage(image, 0, 0, width, height);
				const durationMs = frameDelayMs(image.duration, type === 'image/gif');
				// method 4 (not 6): per-frame cost scales with frame count.
				const still = await encode(context!.getImageData(0, 0, width, height), {
					quality,
					method: 4
				});
				frames.push({ still: new Uint8Array(still), durationMs });
			} finally {
				image.close();
			}
			progress({ frame: i + 1, frameCount: track.frameCount });
		}

		const out = muxAnimatedWebp({
			width,
			height,
			loopCount: loopCountFrom(track.repetitionCount),
			frames
		});
		return {
			bytes: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer,
			resized,
			width,
			height,
			chosenFormat: 'webp',
			animated: true,
			frameCount: frames.length,
			...(dimensionCapped ? { dimensionCapped: true } : {})
		};
	} finally {
		decoder.close();
	}
}

// --- Static encode paths ---

/** Trellis quantization buys ~3-6% smaller JPEGs; its encode-time cost only
 *  matters at very large pixel counts, where we fall back to plain settings.
 *  (progressive, optimize_coding and quant_table 3 are already the defaults.) */
const TRELLIS_MAX_PIXELS = 8_000_000;

function jpegOptions(imageData: ImageData, quality: number) {
	const trellis =
		imageData.width * imageData.height <= TRELLIS_MAX_PIXELS
			? { trellis_multipass: true, trellis_opt_zero: true, trellis_opt_table: true }
			: {};
	return { quality, ...trellis };
}

/** Early-exit alpha scan (same stride flattenToWhite walks). */
function isOpaque(imageData: ImageData): boolean {
	const p = imageData.data;
	for (let i = 3; i < p.length; i += 4) {
		if (p[i] !== 255) return false;
	}
	return true;
}

function bytesMatch(arr: Uint8Array, offset: number, ascii: string): boolean {
	for (let k = 0; k < ascii.length; k++) {
		if (arr[offset + k] !== ascii.charCodeAt(k)) return false;
	}
	return true;
}

/** True when the SOURCE bytes are a lossless format (PNG/GIF/lossless WebP). */
function isLosslessSource(bytes: ArrayBuffer): boolean {
	const b = new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength));
	if (b.length >= 8 && b[0] === 0x89 && bytesMatch(b, 1, 'PNG')) return true;
	if (b.length >= 4 && bytesMatch(b, 0, 'GIF8')) return true;
	if (b.length >= 2 && bytesMatch(b, 0, 'BM')) return true; // BMP is raw pixels
	if (b.length >= 16 && bytesMatch(b, 0, 'RIFF') && bytesMatch(b, 8, 'WEBP')) {
		if (bytesMatch(b, 12, 'VP8L')) return true;
		if (bytesMatch(b, 12, 'VP8X')) {
			// Walk the container for the bitstream chunk kind.
			const all = new Uint8Array(bytes);
			let i = 12;
			while (i + 8 <= all.length) {
				if (bytesMatch(all, i, 'VP8L')) return true;
				if (bytesMatch(all, i, 'VP8 ')) return false;
				const size = all[i + 4] | (all[i + 5] << 8) | (all[i + 6] << 16) | (all[i + 7] << 24);
				i += 8 + size + (size & 1);
			}
		}
	}
	return false;
}

// --- ICO (multi-size favicon; PNG entries per the post-Vista format) ---

/** Center the image on a transparent square so every ICO size keeps it whole. */
function padToSquare(img: ImageData): ImageData {
	if (img.width === img.height) return img;
	const side = Math.max(img.width, img.height);
	const out = new ImageData(side, side);
	const ox = (side - img.width) >> 1;
	const oy = (side - img.height) >> 1;
	for (let y = 0; y < img.height; y++) {
		out.data.set(
			img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4),
			((y + oy) * side + ox) * 4
		);
	}
	return out;
}

/** ICONDIR + ICONDIRENTRYs + whole PNG files as payloads (256 encodes as 0). */
function muxIco(sizes: number[], pngs: Uint8Array[]): ArrayBuffer {
	const headerSize = 6 + sizes.length * 16;
	const out = new Uint8Array(headerSize + pngs.reduce((sum, p) => sum + p.length, 0));
	const view = new DataView(out.buffer);
	view.setUint16(0, 0, true); // reserved
	view.setUint16(2, 1, true); // type 1 = icon
	view.setUint16(4, sizes.length, true);
	let offset = headerSize;
	for (let i = 0; i < sizes.length; i++) {
		const at = 6 + i * 16;
		out[at] = sizes[i] >= 256 ? 0 : sizes[i];
		out[at + 1] = sizes[i] >= 256 ? 0 : sizes[i];
		view.setUint16(at + 4, 1, true); // planes
		view.setUint16(at + 6, 32, true); // bpp
		view.setUint32(at + 8, pngs[i].length, true);
		view.setUint32(at + 12, offset, true);
		out.set(pngs[i], offset);
		offset += pngs[i].length;
	}
	return out.buffer;
}

const ICO_SIZES = [256, 128, 48, 32, 16];

// AVIF joins the Auto race only when it's affordable: small-to-medium images
// with the multithreaded wasm active (cross-origin isolated — true in prod).
const AUTO_AVIF_MAX_PIXELS = 4_000_000;

/**
 * 'auto' output: smallest candidate at the same quality — WebP always, JPEG
 * when opaque (it has no alpha), AVIF when the gate above allows.
 */
async function encodeAuto(
	imageData: ImageData,
	quality: number,
	resized: boolean
): Promise<EncodeResult> {
	type Candidate = { bytes: ArrayBuffer; format: EncodeResult['chosenFormat'] };
	const candidates: Candidate[] = [];

	// WebP (the always-on candidate) hard-caps at 16383 px per side. Opaque
	// oversized images keep full resolution — JPEG takes over and WebP sits
	// out. With alpha, WebP is the only candidate that can carry it, so the
	// pixels clamp to the cap (same treatment as explicit webp output).
	const opaque = isOpaque(imageData);
	let data = imageData;
	let capped = false;
	if (Math.max(data.width, data.height) > WEBP_MAX_DIMENSION && !opaque) {
		({ imageData: data, capped } = await clampToWebpCap(data));
	}

	if (Math.max(data.width, data.height) <= WEBP_MAX_DIMENSION) {
		const { encode: encodeWebp } = await import('@jsquash/webp');
		candidates.push({ bytes: await encodeWebp(data, { quality, method: 6 }), format: 'webp' });
	}

	if (opaque) {
		const { encode: encodeJpeg } = await import('@jsquash/jpeg');
		candidates.push({
			bytes: await encodeJpeg(data, jpegOptions(data, quality)),
			format: 'jpg'
		});
	}

	if (
		data.width * data.height <= AUTO_AVIF_MAX_PIXELS &&
		typeof crossOriginIsolated !== 'undefined' &&
		crossOriginIsolated
	) {
		const { encode: encodeAvif } = await import('@jsquash/avif');
		candidates.push({ bytes: await encodeAvif(data, { quality, speed: 7 }), format: 'avif' });
	}

	const smallest = candidates.reduce((a, b) => (b.bytes.byteLength < a.bytes.byteLength ? b : a));
	return {
		bytes: smallest.bytes,
		resized: resized || capped,
		width: data.width,
		height: data.height,
		chosenFormat: smallest.format,
		...(capped ? { dimensionCapped: true } : {})
	};
}

async function encodeImage(
	payload: EncodePayload,
	progress: (p: EncodeProgress) => void
): Promise<EncodeResult> {
	const { bytes, quality, output, maxDimension, source, predecoded } = payload;

	// Animated sources keep their animation for webp output — and for 'auto',
	// where animated-webp is the only animation-preserving candidate.
	// (Predecoded RAW frames are always still images — nothing to sniff.)
	if (!predecoded && (output === 'webp' || output === 'auto') && source !== 'heic') {
		const type = sniffAnimatedInput(bytes);
		if (type) {
			// Residual animated-path failures (mux geometry, exotic frames) degrade
			// to the static first-frame encode below — which carries the existing
			// "animation lost" warning — instead of failing the whole file.
			const animated = await encodeAnimatedWebp(payload, type, progress).catch((error: unknown) => {
				if (import.meta.env.DEV) {
					console.warn('Animated WebP encode failed — falling back to first frame:', error);
				}
				return null;
			});
			if (animated) return animated;
		}
	}

	// Predecoded (RAW) frames skip decode AND the sRGB pass — LibRaw already
	// writes sRGB. Everything downstream (resize, encode) is identical.
	const wasmDecoded =
		!predecoded && (source === 'heic' || isJxl(bytes) || isPsd(bytes) || isTiff(bytes));
	const decoded = predecoded
		? { imageData: imageDataFromPredecoded(predecoded), preResized: false }
		: source === 'heic'
			? { imageData: await decodeHeic(bytes), preResized: false }
			: isJxl(bytes)
				? { imageData: await decodeJxl(bytes), preResized: false }
				: isPsd(bytes)
					? { imageData: await decodePsd(bytes), preResized: false }
					: isTiff(bytes)
						? { imageData: await decodeTiff(bytes), preResized: false }
						: await decodeToImageData(bytes, maxDimension);
	// After a decode-time downscale containScale returns 1, so maybeResize
	// naturally skips — but `resized` must still report true downstream
	// (keep-original guard + UI state depend on it).
	const resizeOut = await maybeResize(decoded.imageData, maxDimension);
	const imageData = resizeOut.imageData;
	const resized = resizeOut.resized || decoded.preResized;
	if (wasmDecoded) await applySrgbConversion(bytes, imageData);
	const dims = { width: imageData.width, height: imageData.height };

	if (output === 'auto') return encodeAuto(imageData, quality, resized);

	// JPEG stores no alpha — flatten transparency to white (matching the
	// images→PDF treatment) instead of letting mozjpeg composite onto black.
	if (payload.flatten || output === 'jpg') flattenToWhite(imageData);

	switch (output) {
		case 'jpg': {
			const { encode } = await import('@jsquash/jpeg');
			return {
				bytes: await encode(imageData, jpegOptions(imageData, quality)),
				resized,
				...dims,
				chosenFormat: 'jpg'
			};
		}
		case 'webp': {
			const { encode } = await import('@jsquash/webp');
			// Same hard limit as the animated clamp (AN-11): shrink + report via
			// dimensionCapped instead of libwebp's bare "Encoding error.".
			const { imageData: webpData, capped } = await clampToWebpCap(imageData);
			const webpFlags = {
				resized: resized || capped,
				width: webpData.width,
				height: webpData.height,
				...(capped ? { dimensionCapped: true } : {})
			};
			// q100 on a LOSSLESS source → true lossless WebP (VP8L). Lossy
			// sources stay on the lossy path: losslessly re-encoding codec
			// artifacts costs 2-10× the bytes for zero visible gain.
			if (quality === 100 && source !== 'heic' && isLosslessSource(bytes)) {
				return {
					bytes: await encode(webpData, { lossless: 1 }),
					...webpFlags,
					chosenFormat: 'webp'
				};
			}
			// Measured 2026-07-10: use_sharp_yuv grows files 3-6% at the same
			// nominal quality (it buys fidelity, not bytes) — deliberately off.
			return {
				bytes: await encode(webpData, { quality, method: 6 }),
				...webpFlags,
				chosenFormat: 'webp'
			};
		}
		case 'avif': {
			const { encode } = await import('@jsquash/avif');
			// Measured 2026-07-10: speed 5 + enableSharpYUV grow files 5-16% at
			// the same nominal quality and cost 2-3× the time — speed 7 stays.
			return {
				bytes: await encode(imageData, { quality, speed: 7 }),
				resized,
				...dims,
				chosenFormat: 'avif'
			};
		}
		case 'jxl': {
			const jxl = await import('icodec-jxl');
			await jxlEncReady();
			// q100 on a lossless source → true lossless JXL (same rule as WebP);
			// lossy sources stay lossy — re-encoding artifacts losslessly costs
			// multiples of the bytes for zero visible gain.
			const options =
				quality === 100 && source !== 'heic' && isLosslessSource(bytes)
					? { lossless: true }
					: { quality, effort: 7 };
			const out = jxl.encode(imageData, options);
			return {
				bytes: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer,
				resized,
				...dims,
				chosenFormat: 'jxl'
			};
		}
		case 'png': {
			const { encode } = await import('@jsquash/png');
			const { optimise } = await import('@jsquash/oxipng');
			// quality < 100 → lossy palette quantization first; 100 → lossless.
			const sourceData = quality < 100 ? await reducePngColors(imageData, quality) : imageData;
			const png = await encode(sourceData);
			// Small files can afford a deeper oxipng pass; keep big ones snappy.
			const level = png.byteLength < 500_000 ? 4 : 2;
			return {
				bytes: await optimise(png, { level, optimiseAlpha: quality < 100 }),
				resized,
				...dims,
				chosenFormat: 'png'
			};
		}
		case 'ico': {
			const { encode } = await import('@jsquash/png');
			const { default: resize } = await import('@jsquash/resize');
			// Shrink to the largest ICO size BEFORE padding: pad-first would
			// allocate a max(w,h)² RGBA square (~3.6 GB for a 30000 px panorama)
			// for an output that is at most 256 px.
			const icoScale = containScale(imageData.width, imageData.height, ICO_SIZES[0]);
			const base =
				icoScale < 1
					? await resize(imageData, {
							width: Math.max(1, Math.round(imageData.width * icoScale)),
							height: Math.max(1, Math.round(imageData.height * icoScale)),
							method: 'lanczos3'
						})
					: imageData;
			const square = padToSquare(base);
			const sizes = ICO_SIZES.filter((s) => s <= square.width);
			if (!sizes.length) sizes.push(16); // tiny sources still get a favicon
			const pngs: Uint8Array[] = [];
			for (const size of sizes) {
				const scaled =
					square.width === size
						? square
						: await resize(square, { width: size, height: size, method: 'lanczos3' });
				pngs.push(new Uint8Array(await encode(scaled)));
			}
			return { bytes: muxIco(sizes, pngs), resized, ...dims, chosenFormat: 'ico' };
		}
		case 'gif': {
			// Static gif encode from RGBA (gif→gif goes through gifsicle instead).
			const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
			const rgba = new Uint8Array(
				imageData.data.buffer,
				imageData.data.byteOffset,
				imageData.data.byteLength
			);
			const maxColors = Math.max(2, Math.round((quality / 100) * 256));
			const gif = GIFEncoder();
			if (isOpaque(imageData)) {
				const palette = quantize(rgba, maxColors);
				const index = applyPalette(rgba, palette);
				gif.writeFrame(index, imageData.width, imageData.height, { palette });
			} else {
				// GIF supports 1-bit alpha: quantize alpha-aware so transparent
				// pixels get their own palette slot, then mark that slot.
				const palette = quantize(rgba, maxColors, { format: 'rgba4444', oneBitAlpha: true });
				let transparentIndex = palette.findIndex((c) => c[3] === 0);
				if (transparentIndex < 0) {
					// Guarantee a slot BEFORE mapping so pixels can land on it.
					if (palette.length < 256) palette.push([0, 0, 0, 0]);
					else palette[palette.length - 1] = [0, 0, 0, 0];
					transparentIndex = palette.length - 1;
				}
				const index = applyPalette(rgba, palette, 'rgba4444');
				gif.writeFrame(index, imageData.width, imageData.height, {
					palette,
					transparent: true,
					transparentIndex
				});
			}
			gif.finish();
			const out = gif.bytes();
			return {
				bytes: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer,
				resized,
				...dims,
				chosenFormat: 'gif'
			};
		}
		default: {
			const unhandled: never = output;
			throw new Error(`Unsupported output format: ${String(unhandled)}`);
		}
	}
}

expose<WorkerContracts['image']>({
	encode: async (payload, progress) => {
		const result = await encodeImage(payload, progress);
		return { result, transfer: [result.bytes] };
	},
	stripMetadata: async ({ bytes, removeIcc }) => {
		const out = stripImageMetadataBytes(new Uint8Array(bytes), { removeIcc });
		// concat() builds exact-size buffers, but the WebP nothing-removed fast
		// path returns the input view untouched — normalize before transferring.
		const b = out.bytes;
		const buffer = (
			b.byteOffset === 0 && b.byteLength === b.buffer.byteLength
				? b.buffer
				: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
		) as ArrayBuffer;
		return {
			result: {
				bytes: buffer,
				mime: out.mime,
				info: out.info,
				removedAnything: out.removedAnything
			},
			transfer: [buffer]
		};
	}
});
