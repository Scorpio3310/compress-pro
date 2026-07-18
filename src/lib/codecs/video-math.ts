/**
 * Pure math for the video pipeline — kept worker-free so vitest covers it.
 */

export interface FittedDimensions {
	width: number;
	height: number;
	changed: boolean;
}

/**
 * Downscale-only fit of the longest side to `maxDimension`, aspect preserved.
 * Both sides land on EVEN numbers — 4:2:0 chroma subsampling (H.264/VP9)
 * requires it, and hardware encoders reject odd dimensions outright.
 */
export function fitDimensions(
	width: number,
	height: number,
	maxDimension: number | null
): FittedDimensions {
	const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
	const longest = Math.max(width, height);
	if (!maxDimension || longest <= maxDimension) {
		const w = even(width);
		const h = even(height);
		// Sources with odd dimensions still need the even rounding to encode.
		return { width: w, height: h, changed: w !== width || h !== height };
	}
	const scale = maxDimension / longest;
	return {
		width: even(width * scale),
		height: even(height * scale),
		changed: true
	};
}

/** Downscale-only contain factor for the longest side (1 = leave as-is). */
export function containScale(width: number, height: number, maxDimension: number | null): number {
	if (!maxDimension) return 1;
	const longest = Math.max(width, height);
	return longest > maxDimension ? maxDimension / longest : 1;
}

/**
 * Delay of one animation frame. Browsers bump ≤10 ms GIF delays to 100 ms for
 * display — pass `gifQuirk` for GIF sources so the output plays like the GIF
 * looked; WebP/APNG timing is honored as-is.
 */
export function frameDelayMs(durationUs: number | null, gifQuirk: boolean): number {
	const ms = durationUs ? Math.round(durationUs / 1000) : 100;
	return gifQuirk && ms <= 10 ? 100 : ms;
}

/**
 * Canvas transform for baking a clockwise rotation into a frame draw.
 * `width`/`height` are the DISPLAY (rotation-applied) canvas dimensions; the
 * source bitmap is the raw, unrotated frame. Apply as: translate → rotate →
 * scale → drawImage(dx, dy, dWidth, dHeight). Mirrors mediabunny's own
 * VideoSample.draw() math (center-rotate + aspect-compensating scale), so the
 * hand-rolled MJPEG path rotates exactly like the Conversion path bakes.
 */
export interface RotatedDrawSpec {
	translateX: number;
	translateY: number;
	rotateRad: number;
	scaleX: number;
	scaleY: number;
	dx: number;
	dy: number;
	dWidth: number;
	dHeight: number;
}

export function rotatedDrawSpec(
	rotation: 0 | 90 | 180 | 270,
	width: number,
	height: number
): RotatedDrawSpec {
	// Scale compensates the aspect swap on 90°/270°: the dWidth×dHeight box is
	// first stretched to the source's aspect, then rotated back onto the canvas.
	const aspectChange = rotation % 180 === 0 ? 1 : width / height;
	return {
		translateX: width / 2,
		translateY: height / 2,
		rotateRad: (rotation * Math.PI) / 180,
		scaleX: 1 / aspectChange,
		scaleY: aspectChange,
		dx: -width / 2,
		dy: -height / 2,
		dWidth: width,
		dHeight: height
	};
}

/**
 * Frame-drop filter for hand-rolled pipelines (MJPEG) where mediabunny's
 * Conversion — which normally implements the fps cap — can't run. Keeps
 * frames on a 1/capFps grid; after a timestamp gap the grid re-anchors at the
 * next kept frame instead of replaying missed slots.
 */
export function createFrameRateDecimator(capFps: number | undefined): (ts: number) => boolean {
	if (!capFps) return () => true;
	const interval = 1 / capFps;
	const epsilon = interval / 1000; // float-safe grid comparison
	let nextTs = -Infinity;
	return (ts: number): boolean => {
		if (ts < nextTs - epsilon) return false;
		nextTs = Math.max(nextTs, ts) + interval;
		return true;
	};
}

/** GIF output ceiling: past this edge length palettes+LZW balloon for nothing. */
export const GIF_MAX_DIMENSION = 800;
/** Hard frame cap — gifenc holds the whole GIF in memory until the end, so an
 *  unbounded frame count is an OOM, not a big file. 900 ≈ 75 s at 12 fps. */
export const GIF_MAX_FRAMES = 900;
/** Soft heads-up threshold (≈25 s at 12 fps): the GIF will be large. */
export const GIF_FRAME_WARNING = 300;

export interface GifPlan {
	/** Sampling-grid frame count the worker will produce. */
	frameCount: number;
	/** Effective dimension cap to pass to the worker (never above the ceiling). */
	maxDimension: number;
	/** True when the CEILING (not the user's own setting) shrinks the source. */
	dimensionCapped: boolean;
	/** Over the hard cap — the caller should refuse up front, before any work. */
	tooManyFrames: boolean;
	/** Over the soft threshold — worth a size warning. */
	longGif: boolean;
}

/** Pre-run plan for video → GIF: bounded frames + bounded dimensions. */
export function planGif(
	durationSec: number,
	width: number,
	height: number,
	fps: number,
	userMaxDimension: number | null
): GifPlan {
	const maxDimension = Math.min(userMaxDimension ?? GIF_MAX_DIMENSION, GIF_MAX_DIMENSION);
	const longest = Math.max(width, height);
	const frameCount = Math.ceil(durationSec * fps);
	return {
		frameCount,
		maxDimension,
		dimensionCapped:
			longest > maxDimension && (userMaxDimension === null || userMaxDimension > maxDimension),
		tooManyFrames: frameCount > GIF_MAX_FRAMES,
		longGif: frameCount > GIF_FRAME_WARNING && frameCount <= GIF_MAX_FRAMES
	};
}

/** Cap-only frame rate: undefined = leave the source rate untouched. */
export function capFrameRate(
	sourceFps: number | null,
	fps: 'original' | number
): number | undefined {
	if (fps === 'original') return undefined;
	if (sourceFps !== null && sourceFps <= fps) return undefined;
	return fps;
}

/** Relative bits each codec family needs for comparable perceptual quality. */
const CODEC_BITS: Record<string, number> = {
	av1: 0.6,
	hevc: 0.75,
	vp9: 0.7,
	avc: 1,
	vp8: 1.1
};

/**
 * Quality (1-100) → video bitrate via bits-per-pixel-per-frame. The curve
 * `0.02 · 15^(q/100)` spans ≈0.021 bppf (q1) to 0.30 bppf (q100), putting
 * q75 at ≈0.152 — around 9 Mbps for 1080p30 H.264, which matches common
 * "high quality" encoder presets. The codec factor comes from CODEC_BITS —
 * VP9/HEVC need fewer bits than H.264, VP8 needs more.
 */
export function qualityToBitrate(
	quality: number,
	width: number,
	height: number,
	fps: number,
	codec: 'avc' | 'hevc' | 'vp9' | 'vp8'
): number {
	const q = Math.min(100, Math.max(1, quality));
	const bppf = 0.02 * 15 ** (q / 100);
	return Math.max(120_000, Math.round(width * height * fps * bppf * CODEC_BITS[codec]));
}

/**
 * Cap a quality-mode bitrate by what the SOURCE stream actually carries —
 * information content can't exceed it, so re-encoding a 400 kbps web clip at
 * a resolution-derived 9 Mbps only balloons the file (measured +750% on a
 * real MOV before this cap). The cap scales with the quality slider
 * (q75 ≈ 1× source) and adjusts for codec-efficiency differences between
 * source and target (VP9 → H.264 needs more bits, not fewer).
 */
export function capBySourceBitrate(
	curveBps: number,
	quality: number,
	sourceVideoBps: number | null,
	sourceCodec: string | null,
	targetCodec: 'avc' | 'hevc' | 'vp9' | 'vp8'
): number {
	if (!sourceVideoBps || sourceVideoBps <= 0) return curveBps;
	const source = CODEC_BITS[sourceCodec ?? 'avc'] ?? 1;
	const target = CODEC_BITS[targetCodec] ?? 1;
	const crossFactor = Math.min(2, Math.max(0.5, target / source));
	const q = Math.min(100, Math.max(1, quality));
	const cap = sourceVideoBps * (q / 75) * crossFactor;
	return Math.max(120_000, Math.min(curveBps, Math.round(cap)));
}

/**
 * Target size → video bitrate. Derates by ~8% (single-pass VBR overshoots)
 * plus ~2% container overhead, then subtracts the audio budget.
 */
export function targetBitrate(targetBytes: number, durationSec: number, audioBps: number): number {
	const budgetBits = targetBytes * 8 * 0.92 * 0.98;
	const videoBits = budgetBits - audioBps * durationSec;
	return Math.max(120_000, Math.floor(videoBits / Math.max(0.1, durationSec)));
}

/**
 * `targetBitrate`, additionally capped by the source's own content — the same
 * q100 ceiling quality mode uses. Without it, a generous target on a
 * low-bitrate source balloons the file, and a container change (mov→mp4)
 * sidesteps the keep-original guard that would otherwise catch that.
 */
export function cappedTargetBitrate(
	targetBytes: number,
	durationSec: number,
	audioBps: number,
	sourceVideoBps: number | null,
	sourceCodec: string | null,
	targetCodec: 'avc' | 'hevc' | 'vp9' | 'vp8'
): number {
	const fromTarget = targetBitrate(targetBytes, durationSec, audioBps);
	return capBySourceBitrate(fromTarget, 100, sourceVideoBps, sourceCodec, targetCodec);
}

/** Corrective bitrate for the single verify-and-retry pass. */
export function retryBitrate(previous: number, actualBytes: number, targetBytes: number): number {
	return Math.max(120_000, Math.floor(previous * (targetBytes / actualBytes) * 0.95));
}

/**
 * Target size → AUDIO bitrate: ~3% container overhead, clamped to the sane
 * CBR range (32–320 kbps) — below 32 nothing is intelligible, above 320
 * encoders stop taking requests seriously.
 */
export function audioTargetBitrate(targetBytes: number, durationSec: number): number {
	const bits = targetBytes * 8 * 0.97;
	return Math.max(32_000, Math.min(320_000, Math.floor(bits / Math.max(0.1, durationSec))));
}

/** "01:23" / "1:02:03" for progress detail lines. */
export function formatTime(totalSeconds: number): string {
	const s = Math.max(0, Math.round(totalSeconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
	return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}
