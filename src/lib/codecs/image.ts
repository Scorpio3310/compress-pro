import type { FileFormat, ImageCompressionSettings, ImageFormat } from '$lib/types';
import type { EncodeResult, PredecodedPixels } from '$lib/workers/protocol';
import { callWorker } from '$lib/workers/rpc';
import { sniffAnimatedInput, WEBP_MAX_DIMENSION } from '$lib/workers/webp-mux';
import { detectColorSpace, isWasmDecodedSource } from './color-profile';
import { convertibleSpace } from './color-convert';
import { exifPayloadForReencode, spliceExifIntoImage } from './exif-copy';
import { searchTargetSize, targetNotReachableWarning } from './target-search';

export interface ImageProgress {
	/** 1-based attempt counter (target-size mode only). */
	attempt?: number;
	attemptMax?: number;
	/** Size of the last finished attempt. */
	lastSize?: number;
	/** Animated-encode frame progress. */
	frame?: number;
	frameCount?: number;
}

export interface ImageResult {
	blob: Blob;
	warning: string | null;
	/** Neutral per-file note (e.g. "Resized to 800×600 to reach the target size"). */
	info: string | null;
	resized: boolean;
	animated: boolean;
	/** Concrete format of `blob` ('auto' requests resolve in the worker). */
	format: ImageFormat | 'ico' | 'jxl';
}

const MIME: Record<ImageFormat | 'ico' | 'jxl', string> = {
	jpg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
	avif: 'image/avif',
	ico: 'image/x-icon',
	jxl: 'image/jxl'
};

// Target-size search ladder: rung 0 = best quality. Step-5 granularity keeps
// the binary search at ≤5 encodes while adjacent-rung size deltas stay small.
const QUALITY_LADDER = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5];

// Downscale-to-target (opt-in): when no quality rung fits, search smaller
// dimensions at one fixed, good quality — a slightly smaller sharp image
// beats a full-size artifact-ridden one for every screen use.
const DOWNSCALE_QUALITY = 75;
const MIN_TARGET_DIMENSION = 320;
// Reaches down to 0.08× so multi-megapixel sources can approach the 320 px
// floor; the binary search still needs only ceil(log2(15)) = 4 encodes.
const SCALE_LADDER = [0.9, 0.8, 0.7, 0.6, 0.5, 0.42, 0.35, 0.3, 0.25, 0.2, 0.15, 0.12, 0.1, 0.08];

/**
 * Longest-side rungs for the dimension search: strictly shrinking, floored at
 * MIN_TARGET_DIMENSION (below that an honest "not reachable" beats a thumbnail).
 */
export function downscaleRungs(longest: number): number[] {
	const rungs = SCALE_LADDER.map((scale) => Math.round(longest * scale)).filter(
		(px) => px >= MIN_TARGET_DIMENSION && px < longest
	);
	return [...new Set(rungs)];
}

// 65535 = the JPEG dimension ceiling; HTML max attrs are advisory only,
// so the cap is enforced here at the point of use.
function normalizeMaxDimension(value: number | null | undefined): number | null {
	return typeof value === 'number' && value > 0 ? Math.min(Math.floor(value), 65535) : null;
}

/**
 * HEIC/HEIF image sequences (Live Photos, bursts) name themselves in the ftyp
 * brands: msf1/avis are the sequence brands, hevc/hevx the HEVC-track ones.
 * libheif only ever hands back the primary image, so these deserve the same
 * "animation lost" warning GIF/APNG already get.
 */
export function isHeicSequence(bytes: ArrayBuffer): boolean {
	const b = new DataView(bytes);
	if (b.byteLength < 16 || b.getUint32(4) !== 0x66747970) return false; // 'ftyp'
	const brandAt = (off: number) =>
		String.fromCharCode(
			b.getUint8(off),
			b.getUint8(off + 1),
			b.getUint8(off + 2),
			b.getUint8(off + 3)
		);
	const SEQUENCE_BRANDS = ['msf1', 'avis', 'hevc', 'hevx'];
	if (SEQUENCE_BRANDS.includes(brandAt(8))) return true; // major brand
	// Compatible brands run from byte 16 to the end of the ftyp box (capped —
	// real files list a handful; 64 bytes covers every sane header).
	const end = Math.min(b.getUint32(0), b.byteLength, 64);
	for (let off = 16; off + 4 <= end; off += 4) {
		if (SEQUENCE_BRANDS.includes(brandAt(off))) return true;
	}
	return false;
}

/**
 * GIF is animated iff it holds ≥2 image descriptors — counted by walking the
 * real block structure. (A raw whole-file scan for the 0x21 0xF9 GCE marker
 * false-positives on LZW data and color tables — ~15 incidental hits per MB —
 * which hung a fake "Animation lost" warning on perfectly static GIFs.)
 * Malformed structure stops the walk: err on "not animated", never on a
 * false warning.
 */
function isAnimatedGif(bytes: ArrayBuffer): boolean {
	const b = new Uint8Array(bytes);
	if (b.length < 13) return false; // header (6) + logical screen descriptor (7)
	let at = 13;
	if (b[10] & 0x80) at += 3 * (1 << ((b[10] & 0x07) + 1)); // global color table
	const skipSubBlocks = () => {
		while (at < b.length) {
			const size = b[at++];
			if (size === 0) return true;
			at += size;
		}
		return false; // ran off the end
	};
	let frames = 0;
	while (at < b.length) {
		const block = b[at++];
		if (block === 0x3b) break; // trailer
		if (block === 0x21) {
			at++; // extension label; then its data sub-blocks
			if (!skipSubBlocks()) break;
		} else if (block === 0x2c) {
			if (++frames >= 2) return true;
			if (at + 9 > b.length) break;
			const flags = b[at + 8];
			at += 9; // image descriptor body
			if (flags & 0x80) at += 3 * (1 << ((flags & 0x07) + 1)); // local color table
			at++; // LZW minimum code size
			if (!skipSubBlocks()) break;
		} else {
			break; // unknown block — corrupt file
		}
	}
	return false;
}

/** Animated iff GIF with ≥2 image descriptors (structural walk), WebP with
 *  the ANIM flag, or PNG with an acTL chunk (APNG). Exported for tests. */
export function isAnimatedInput(bytes: ArrayBuffer): boolean {
	const type = sniffAnimatedInput(bytes);
	if (type === 'image/webp' || type === 'image/png') return true;
	if (type !== 'image/gif') return false;
	return isAnimatedGif(bytes);
}

function animationWarning(
	inputAnimated: boolean,
	output: ImageFormat | 'ico' | 'jxl',
	result: EncodeResult
): string | null {
	if (!inputAnimated) return null;
	if (output === 'webp') {
		return result.animated
			? null
			: 'Animated input — this browser can only convert the first frame';
	}
	return `Animation lost — ${output.toUpperCase()} output keeps only the first frame`;
}

function joinWarnings(...warnings: (string | null)[]): string | null {
	const parts = warnings.filter(Boolean);
	return parts.length ? parts.join(' — ') : null;
}

/** Info line for the automatic WebP dimension clamp (not user resizes) —
 *  animated (AN-11) and static (R-07/R-09) encodes both hit the same cap. */
function capInfo(result: EncodeResult): string | null {
	if (!result.dimensionCapped) return null;
	const what = result.animated ? 'animated WebP' : 'WebP';
	return `Resized to ${result.width}×${result.height} — ${what} is limited to ${WEBP_MAX_DIMENSION} px`;
}

function joinInfo(...infos: (string | null)[]): string | null {
	const parts = infos.filter(Boolean);
	return parts.length ? parts.join(' — ') : null;
}

/** One worker encode. Exported for the SVG raster path (svg-raster.ts). */
export async function encodeOnce(
	bytes: ArrayBuffer,
	quality: number,
	output: ImageFormat | 'auto' | 'ico' | 'jxl',
	maxDimension: number | null,
	source: 'heic' | undefined,
	onProgress?: (p: ImageProgress) => void,
	signal?: AbortSignal,
	predecoded?: PredecodedPixels
): Promise<EncodeResult> {
	// Transfer a copy: target-size mode reuses `bytes` across attempts.
	const copy = bytes.slice(0);
	const transfer = [copy];
	// Same rule for predecoded RAW pixels — clone per attempt, transfer the clone.
	const predecodedCopy = predecoded ? { ...predecoded, data: predecoded.data.slice(0) } : undefined;
	if (predecodedCopy) transfer.push(predecodedCopy.data);
	return callWorker(
		'image',
		'encode',
		{ bytes: copy, quality, output, maxDimension, source, predecoded: predecodedCopy },
		transfer,
		(progress) => onProgress?.(progress),
		{ owner: signal }
	);
}

/**
 * "Keep metadata": splice the prepared EXIF into a re-encoded JPG/PNG/WebP
 * result. Skips silently for kept originals (their metadata is intact),
 * animated outputs and containers without a splice path (avif/gif/ico).
 * Runs BEFORE compress.ts's keep-original size comparison by construction.
 */
async function withKeptMetadata(
	result: ImageResult,
	file: File,
	exifTiff: Uint8Array | null
): Promise<ImageResult> {
	if (!exifTiff || result.blob === file || result.animated) return result;
	if (result.format !== 'jpg' && result.format !== 'png' && result.format !== 'webp') {
		return result;
	}
	const encoded = new Uint8Array(await result.blob.arrayBuffer());
	const spliced = spliceExifIntoImage(encoded, result.format, exifTiff);
	if (!spliced) return result;
	return {
		...result,
		blob: new Blob([spliced as BlobPart], { type: MIME[result.format] }),
		info: joinInfo(result.info, 'Metadata kept')
	};
}

export async function compressImage(
	file: File,
	settings: ImageCompressionSettings,
	onProgress?: (p: ImageProgress) => void,
	sourceFormat?: FileFormat,
	signal?: AbortSignal,
	/** Pixels decoded outside the worker (camera RAW) — skips byte-level work. */
	predecoded?: PredecodedPixels
): Promise<ImageResult> {
	// SVG output never reaches this codec — compress.ts dispatches it to the
	// vectorize codec first; the guard also narrows outputFormat's type here.
	if (settings.outputFormat === 'svg') {
		throw new Error('SVG output is handled by the vectorize codec');
	}
	// Read the ($state-proxied) settings into plain primitives once.
	const { quality, outputFormat, mode, targetKb, downscaleToTarget, keepMetadata } = settings;
	const maxDimension = normalizeMaxDimension(settings.maxDimension);
	const source = sourceFormat === 'heic' ? ('heic' as const) : undefined;
	const isGifInput = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');

	// gif→gif keeps animation, so it goes through gifsicle (always the quality
	// path — gifsicle has no clean monotonic quality ladder for target mode).
	if (outputFormat === 'gif' && isGifInput) {
		return compressGifWithGifsicle(file, quality, maxDimension);
	}

	// Predecoded RAW: the original bytes stay outside the pipeline entirely —
	// no animation sniffing, no color-space detection (LibRaw outputs sRGB),
	// no EXIF splice source.
	const bytes = predecoded ? new ArrayBuffer(0) : await file.arrayBuffer();
	const inputAnimated = predecoded
		? false
		: source
			? isHeicSequence(bytes)
			: isAnimatedInput(bytes);
	// Honesty note: browser decoding converts every tagged source to sRGB;
	// on the WASM paths (HEIC/TIFF) the worker matrix-converts the spaces it
	// knows — so the note appears only where a conversion really happened.
	// (The EXIF tab preserves ICC and is unaffected.)
	const colorInfo = predecoded ? null : await detectColorSpace(bytes).catch(() => null);
	const converted =
		colorInfo &&
		(!isWasmDecodedSource(bytes) || convertibleSpace(colorInfo.space, colorInfo.transfer));
	const gamutInfo = converted ? `Wide-gamut color (${colorInfo.name}) converted to sRGB` : null;
	const exifTiff = keepMetadata && !predecoded ? exifPayloadForReencode(bytes) : null;
	// "Keep metadata" promises EXIF in JPG/PNG/WebP outputs, but RAW rides the
	// predecoded path where the original bytes (and their EXIF) never enter the
	// pipeline — be honest about the ignored toggle instead of silent.
	const rawMetadataInfo =
		keepMetadata && predecoded
			? "Metadata not kept — EXIF (date, camera, GPS) can't be copied from RAW files yet"
			: null;

	if (mode === 'target' && outputFormat !== 'gif' && outputFormat !== 'ico') {
		// The ladder search needs ONE monotonic codec — 'auto' resolves to webp
		// (handles alpha and animation, and photos rarely lose to jpg there).
		const targetFormat: ImageFormat | 'jxl' = outputFormat === 'auto' ? 'webp' : outputFormat;
		// Reserve the splice bytes up front so "fits under target" stays true
		// AFTER the EXIF lands. Keeping metadata under a tiny target would eat
		// most of the budget — drop it instead of shipping mush.
		let targetBytes = Math.max(1, Math.round(targetKb * 1000));
		let targetExif = exifTiff;
		if (targetExif) {
			const reserve = targetExif.length + 32;
			if (reserve > targetBytes * 0.5) targetExif = null;
			else targetBytes -= reserve;
		}
		const result = await compressToTarget(
			file,
			bytes,
			targetFormat,
			maxDimension,
			targetBytes,
			source,
			inputAnimated,
			downscaleToTarget,
			onProgress,
			signal,
			predecoded
		);
		// A kept original is untouched — its profile was NOT converted.
		const keptOriginal = result.blob === file;
		const noted = keptOriginal
			? result
			: { ...result, info: joinInfo(result.info, gamutInfo, rawMetadataInfo) };
		return withKeptMetadata(noted, file, targetExif);
	}

	const out = await encodeOnce(
		bytes,
		quality,
		outputFormat,
		maxDimension,
		source,
		onProgress,
		signal,
		predecoded
	);
	return withKeptMetadata(
		{
			blob: new Blob([out.bytes], { type: MIME[out.chosenFormat] }),
			warning: animationWarning(inputAnimated, out.chosenFormat, out),
			info: joinInfo(gamutInfo, capInfo(out), rawMetadataInfo),
			resized: out.resized,
			animated: out.animated ?? false,
			format: out.chosenFormat
		},
		file,
		exifTiff
	);
}

async function compressToTarget(
	file: File,
	bytes: ArrayBuffer,
	output: ImageFormat | 'jxl',
	maxDimension: number | null,
	targetBytes: number,
	source: 'heic' | undefined,
	inputAnimated: boolean,
	downscale: boolean,
	onProgress?: (p: ImageProgress) => void,
	signal?: AbortSignal,
	predecoded?: PredecodedPixels
): Promise<ImageResult> {
	const { best, smallest } = await searchTargetSize<EncodeResult>(
		QUALITY_LADDER.length,
		targetBytes,
		(rung, state) =>
			encodeOnce(
				bytes,
				QUALITY_LADDER[rung],
				output,
				maxDimension,
				source,
				(p) => onProgress?.({ ...state, ...p }),
				signal,
				predecoded
			),
		(out) => out.bytes.byteLength,
		onProgress,
		signal
	);

	// The untouched original may beat any re-encode — but only when the output
	// format matches the input and no downscale was requested/applied.
	const fallback = smallest;
	const originalUsable =
		file.type === MIME[output] && !fallback.resized && file.size <= targetBytes;

	if (best) {
		if (originalUsable && file.size <= best.bytes.byteLength) {
			return {
				blob: file,
				warning: null,
				info: null,
				resized: false,
				animated: inputAnimated,
				format: output
			};
		}
		return {
			blob: new Blob([best.bytes], { type: MIME[output] }),
			warning: animationWarning(inputAnimated, output, best),
			info: capInfo(best),
			resized: best.resized,
			animated: best.animated ?? false,
			format: output
		};
	}

	if (originalUsable) {
		return {
			blob: file,
			warning: null,
			info: null,
			resized: false,
			animated: inputAnimated,
			format: output
		};
	}

	// Opt-in second phase: quality alone can't reach the target — search
	// smaller dimensions at a fixed good quality instead of shipping the q5
	// mush. Scales from the q5 attempt's output dims, so a user-set
	// maxDimension stays the ceiling.
	if (downscale) {
		const rungs = downscaleRungs(Math.max(fallback.width, fallback.height));
		if (rungs.length > 0) {
			const scaled = await searchTargetSize<EncodeResult>(
				rungs.length,
				targetBytes,
				(rung, state) =>
					encodeOnce(
						bytes,
						DOWNSCALE_QUALITY,
						output,
						rungs[rung],
						source,
						(p) => onProgress?.({ ...state, ...p }),
						signal,
						predecoded
					),
				(out) => out.bytes.byteLength,
				onProgress,
				signal
			);
			if (scaled.best) {
				const hit = scaled.best;
				return {
					blob: new Blob([hit.bytes], { type: MIME[output] }),
					warning: animationWarning(inputAnimated, output, hit),
					info: `Resized to ${hit.width}×${hit.height} to reach the target size`,
					resized: true,
					animated: hit.animated ?? false,
					format: output
				};
			}
			// Even the smallest allowed scale missed — the honest "smallest
			// achievable" is whichever attempt across BOTH searches was smaller.
			if (scaled.smallest.bytes.byteLength < fallback.bytes.byteLength) {
				return {
					blob: new Blob([scaled.smallest.bytes], { type: MIME[output] }),
					warning: joinWarnings(
						targetNotReachableWarning(targetBytes, scaled.smallest.bytes.byteLength),
						animationWarning(inputAnimated, output, scaled.smallest)
					),
					info: null,
					resized: true,
					animated: scaled.smallest.animated ?? false,
					format: output
				};
			}
		}
	}

	return {
		blob: new Blob([fallback.bytes], { type: MIME[output] }),
		warning: joinWarnings(
			targetNotReachableWarning(targetBytes, fallback.bytes.byteLength),
			animationWarning(inputAnimated, output, fallback)
		),
		info: capInfo(fallback),
		resized: fallback.resized,
		animated: fallback.animated ?? false,
		format: output
	};
}

// gifsicle-wasm-browser spawns its own internal worker, so calling it from
// the main thread does not block the UI.
async function compressGifWithGifsicle(
	file: File,
	quality: number,
	maxDimension: number | null
): Promise<ImageResult> {
	// The routing here is by extension/MIME only — a truncated download or a
	// mislabeled file would otherwise surface a raw DataView RangeError from
	// the header reads below. 13 bytes = GIF header + logical screen descriptor.
	const headerBytes = await file.slice(0, 13).arrayBuffer();
	const magic = new Uint8Array(headerBytes);
	const looksLikeGif =
		magic.length >= 13 &&
		magic[0] === 0x47 && // 'G'
		magic[1] === 0x49 && // 'I'
		magic[2] === 0x46 && // 'F'
		magic[3] === 0x38; // '8'
	if (!looksLikeGif) {
		throw new Error('Could not read this GIF file — it looks incomplete or corrupted');
	}

	const { default: gifsicle } = await import('gifsicle-wasm-browser');

	// Logical screen descriptor: width/height are u16 LE at bytes 6/8.
	const header = new DataView(headerBytes);
	const width = header.getUint16(6, true);
	const height = header.getUint16(8, true);
	const willResize =
		maxDimension !== null && width > 0 && height > 0 && Math.max(width, height) > maxDimension;

	const colors = Math.max(2, Math.round((quality / 100) * 256));
	const lossy = quality < 100 ? ` --lossy=${Math.round((100 - quality) * 1.2)}` : '';
	const dither = quality < 50 ? ' --dither' : '';
	// --resize-fit only ever shrinks; the header check just keeps `resized` honest.
	const resizeFit = willResize ? ` --resize-fit ${maxDimension}x${maxDimension}` : '';

	const output = await gifsicle.run({
		input: [{ file, name: 'in.gif' }],
		command: [
			`-O3${lossy}${dither}${resizeFit} --colors ${colors} --no-comments --no-names --no-extensions in.gif -o /out/out.gif`
		]
	});
	if (!output.length) throw new Error('GIF compression produced no output');
	return {
		blob: output[0],
		warning: null,
		info: null,
		resized: willResize,
		animated: true,
		format: 'gif'
	};
}
