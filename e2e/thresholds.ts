/**
 * Pixel-diff budgets: fraction of pixels allowed to differ beyond pixelmatch's
 * YIQ threshold (0.05 here — see verify.ts; the 0.25 default is blind to
 * codec artifacts).
 *
 * RE-LOCKED 2026-07-10 (evening, post mozjpeg-trellis) at ~1.5–2.5× the max
 * observed over the full green suite: q80 combos peak 0.017, q60 0.008,
 * q30 0.016, pure-source avif 0.003, gif-source→jpg 0.149, resize 0.032.
 * Headroom covers fixture-regeneration variance across sharp versions.
 * Structural asserts (format/dims/frames/pages) stay hard regardless.
 *
 * RE-VALIDATED 2026-07-11 after the quality/reliability batch (Auto+AVIF,
 * webp q100 lossless, GIF 1-bit alpha, APNG→webp, MPF rewrite, PDF XMP strip,
 * fixtures regenerated): full suite green within the existing budgets — no
 * re-lock needed. New specs (Q-07, A-09, AN-09/10, P-08, E-06) assert exact
 * properties (lossless/alpha/frames/bytes), not diff budgets.
 */
export const DIFF_BUDGET = {
	/** png q100 / lossless chains: raw bytes must be identical */
	lossless: 0,
	q90: 0.02,
	q80: 0.03,
	q60: 0.02,
	q30: 0.04,
	/** libimagequant 256-color quantization */
	pngQuantized: 0.05,
	/** HEIC input decoded via icodec/libheif — the sips HEVC encode loss is in
	 *  the baseline, so budgets sit above the output codec's own. Locked
	 *  2026-07-11 at ~2.4× observed (IMG-21..24 peak 0.0148; heic→jpg 0.0148,
	 *  →png 0.0008, →webp 0.0052, →avif 0.0001). */
	heicSource: 0.035,
	/** gifenc/gifsicle palette + dither — also applies to dithered GIF sources */
	gifOut: 0.22,
	avif: 0.01,
	/** compared against a lanczos3-downscaled reference (two lanczos impls) */
	resized: 0.05,
	/** decode-time downscale (createImageBitmap resizeQuality 'high') vs the
	 *  lanczos3 reference — the browser kernel diverges more than lanczos-vs-
	 *  lanczos. LOCKED 2026-07-11: R-05 observed 0.0268 → ~2.2× ceiling. */
	browserResized: 0.06,
	/** SVG rasterized before/after at identical size */
	svg: 0.02,
	/** In-app SVG→PNG render (Chromium canvas) vs the sharp/librsvg reference —
	 *  two rasterizers, so AA edges may diverge. LOCKED 2026-07-12: S-07
	 *  observed 0.0000 (simple-shape fixture) — the budget is pure headroom. */
	svgRender: 0.02
} as const;

/**
 * PSNR floors (dB) — the log-domain counterpart of the diff budgets: PSNR
 * integrates error magnitude over EVERY pixel, so it catches uniform banding /
 * over-smoothing that the beyond-YIQ-threshold pixel count is blind to.
 * Lossless tiers assert raw byte-identity elsewhere and skip PSNR.
 *
 * LOCKED 2026-07-11 from E2E_CALIBRATE runs (values were run-to-run identical
 * on this machine; the − ~4 dB margin — the log-domain analog of the 1.5-2.5×
 * ratio-ceiling rule — carries cross-machine/sharp-regen drift). Observed
 * minima: q90 43.8, q80 36.9, avif 41.5, q30 33.2, pngQuantized 32.8,
 * heicSource 37.6, gif-source/-output 28.2 (static.gif→jpg), resized 34.5,
 * svg-rasterized 76.0.
 */
export const PSNR_FLOOR = {
	q90: 39,
	q80: 32,
	q60: 28,
	q30: 29,
	pngQuantized: 28,
	heicSource: 33,
	gifOut: 24,
	avif: 37,
	resized: 30,
	/** LOCKED 2026-07-11: R-05 observed 35.0 → floor at −4 dB. */
	browserResized: 31,
	svg: 35,
	/** LOCKED 2026-07-12: S-07 observed 38.7 → floor at −4 dB. */
	svgRender: 34
} as const;

/**
 * Mean-SSIM floors (0-1, ssim.js) — wired only where qualityMetrics runs with
 * ssim:true (the images-defaults matrix). LOCKED 2026-07-11: observed minima
 * 0.993 (q80 tiers), 0.997 (png/heic tiers), 0.975 (gif-involved combos);
 * floors sit at roughly half the observed distance to 1.0.
 */
export const SSIM_FLOOR = {
	q80: 0.95,
	pngQuantized: 0.95,
	heicSource: 0.95,
	gifOut: 0.92
} as const;

/**
 * Audio sample-level thresholds — outputs are decoded IN the test browser
 * (OfflineAudioContext; node has no mp3/aac/opus decoder) and measured with
 * Hann-windowed Goertzel probes. Tone fixtures carry 0.4-amp dominants
 * (L 440 Hz / R 554.37 Hz), a 0.2-amp secondary (R 330 Hz), a 0.2-amp sweep
 * (L 880→2080 Hz) → nominal per-channel RMS ≈ 0.316; 3 kHz is the silence
 * control probe.
 *
 * LOCKED 2026-07-11 from E2E_CALIBRATE runs: dominant amps observed
 * 0.380-0.400 across mp3/aac/opus/pcm, secondary 0.190-0.200, stereo RMS
 * 0.300-0.317, mono tone 0.970 / RMS ≈ 0.707, worst separation 3174×
 * (opus round-trip), control amp 0.0000 everywhere. Floors sit at
 * ~0.6× observed minima, ranges at ±25%, separation at ~1/30 of worst —
 * wide enough for encoder drift, tight enough that a swap/downmix/silence
 * bug (separation collapses to ≈1, RMS to 0) can't pass.
 */
export const AUDIO = {
	/** per-channel RMS window for the stereo tone fixtures (nominal ≈ 0.316) */
	rmsRange: [0.24, 0.38] as const,
	/** 0.4-amp dominant tone must survive any lossy encode at ≥ this */
	toneAmpMin: 0.25,
	/** 0.2-amp secondary tone (right channel, 330 Hz) */
	secondaryToneAmpMin: 0.12,
	/** dominant-tone power ratio own-channel/other-channel (swap/downmix guard) */
	separationMin: 100,
	/** amplitude at the 3 kHz control probe — nothing may live there */
	controlAmpMax: 0.02,
	/** mono 440 Hz opus track inside v-audio-3s.* (oscillator amp 1 → RMS ≈ .707) */
	monoToneAmpMin: 0.6,
	monoRmsRange: [0.55, 0.8] as const
} as const;

/**
 * Real-audio input↔output comparison (RF-05..08, RF-17..21): both sides decode
 * through the same OfflineAudioContext(48 kHz) path, so decoder/resampler bias
 * cancels out of every ratio. Spectral bands are 5-bin pools at 300/1000/3000
 * Hz, asserted only when the input clears bandGateAmp — single ~0.02 Hz bins
 * on real music are unstable in spectral valleys.
 *
 * LOCKED 2026-07-13 from the E2E_CALIBRATE real-file run: lossy RMS ratios
 * observed 0.969-1.000 (mp3 ~0.97, aac/opus ~1.00), lossless 1.0000; in-gate
 * band ratios 0.969-1.004 (comfortably inside the [0.6, 1.6] demotion rule —
 * spectral asserts stay); LAME CBR effective kbps 192.01-192.05; flac/wav
 * size 0.259 on real music (0.216 synthetic tones). Ranges sit 3-5× beyond
 * the observed spread so future content/encoder drift fits, while real damage
 * (silence, half-volume, wrong bitrate, killed band) still fails hard.
 */
export const AUDIO_REAL = {
	/** hard non-silence floor (max-channel RMS) — the old standalone check */
	rmsFloor: 0.02,
	/** per-channel RMS out/in, lossy codecs (observed 0.969-1.000) */
	rmsRatioLossy: [0.85, 1.15] as const,
	/** per-channel RMS out/in, wav→flac (observed exactly 1.0000) */
	rmsRatioLossless: [0.99, 1.01] as const,
	/** input band amplitude below which the band ratio is metric-only */
	bandGateAmp: 2e-4,
	/** gated band-amplitude out/in ratio (observed 0.969-1.004) */
	bandRatioRange: [0.6, 1.6] as const,
	/** LAME CBR at the default 192 pill (observed 192.01-192.05) */
	mp3EffectiveKbps: [180, 205] as const,
	/** flac(bytes)/wav(bytes) — observed 0.259 real music; noise approaches 1
	 *  but the hard `bytes < input` assert covers that end */
	flacSizeRatio: [0.15, 0.9] as const,
	/** node-side audioInfo |out − in| duration ceiling (opus pre-skip incl.) */
	durationDeltaSec: 0.3
} as const;

/**
 * Video frame checks: band-color sampling tolerance (V-16 precedent, ±40 per
 * channel) and the source-vs-output frame PSNR floor over the stable band
 * region. LOCKED 2026-07-11: V-21 observed 62.1 dB (solid bands compress
 * nearly losslessly at q75); the floor sits far below to absorb hardware-
 * encoder variance across machines while still failing hard on real damage
 * (wrong band ≈ single-digit dB, heavy corruption < 20 dB).
 */
export const VIDEO_QUALITY = { bandTolerance: 40, psnrFloor: 40 } as const;

/**
 * Real-world photographic content (tests/fixtures/real/) — detail-rich photos
 * sit measurably below the synthetic-scene tiers at the same quality: LOCKED
 * 2026-07-11 from the real-fixture calibrate run — q80 ratios observed up to
 * 0.096 (18 MP jpeg recompress) vs 0.017 synthetic; PSNR bottoms at 30.0 dB
 * (real png/tiff/jpeg) vs 36.9 synthetic. Ceiling ≈1.5× observed max, floor
 * ≈ observed_min − 4 dB. Structural asserts stay hard regardless.
 */
export const REAL_PHOTO = { ratio: 0.15, psnrFloor: 26 } as const;

/** E2E_CALIBRATE=1 turns budget asserts into recorded observations. */
export const CALIBRATE = !!process.env.E2E_CALIBRATE;
