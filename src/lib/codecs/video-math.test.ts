import { describe, expect, it } from 'vitest';
import {
	audioTargetBitrate,
	capBySourceBitrate,
	capFrameRate,
	cappedTargetBitrate,
	containScale,
	createFrameRateDecimator,
	fitDimensions,
	formatTime,
	frameDelayMs,
	GIF_MAX_DIMENSION,
	GIF_MAX_FRAMES,
	planGif,
	qualityToBitrate,
	retryBitrate,
	rotatedDrawSpec,
	targetBitrate,
	type RotatedDrawSpec
} from './video-math';

describe('containScale', () => {
	it('shrinks the longest side to the cap, never upscales', () => {
		expect(containScale(2000, 1000, 500)).toBe(0.25);
		expect(containScale(1000, 2000, 500)).toBe(0.25);
		expect(containScale(400, 300, 500)).toBe(1);
		expect(containScale(500, 500, 500)).toBe(1);
	});

	it('treats a missing cap as no-op', () => {
		expect(containScale(9000, 9000, null)).toBe(1);
	});
});

describe('frameDelayMs', () => {
	it('bumps ≤10 ms delays to 100 ms only under the GIF quirk', () => {
		expect(frameDelayMs(10_000, true)).toBe(100);
		expect(frameDelayMs(10_000, false)).toBe(10);
		expect(frameDelayMs(2_000, true)).toBe(100);
	});

	it('honors real delays and defaults unknown ones to 100 ms', () => {
		expect(frameDelayMs(80_000, true)).toBe(80);
		expect(frameDelayMs(80_000, false)).toBe(80);
		expect(frameDelayMs(null, true)).toBe(100);
		expect(frameDelayMs(0, false)).toBe(100); // 0 is falsy → unknown
	});
});

describe('fitDimensions', () => {
	it('downscales the longest side, keeps aspect, lands on even numbers', () => {
		expect(fitDimensions(1920, 1080, 480)).toEqual({ width: 480, height: 270, changed: true });
		expect(fitDimensions(1080, 1920, 480)).toEqual({ width: 270, height: 480, changed: true });
	});

	it('never upscales', () => {
		expect(fitDimensions(320, 240, 1000)).toEqual({ width: 320, height: 240, changed: false });
	});

	it('evens odd source dimensions even without a cap', () => {
		const fit = fitDimensions(321, 241, null);
		expect(fit).toEqual({ width: 320, height: 240, changed: true });
	});

	it('never collapses below 2px', () => {
		const fit = fitDimensions(10_000, 10, 100);
		expect(fit.height).toBeGreaterThanOrEqual(2);
		expect(fit.width % 2).toBe(0);
	});
});

describe('capFrameRate', () => {
	it('caps only when the source exceeds the cap', () => {
		expect(capFrameRate(60, 30)).toBe(30);
		expect(capFrameRate(30, 30)).toBeUndefined();
		expect(capFrameRate(24, 30)).toBeUndefined();
		expect(capFrameRate(null, 60)).toBe(60); // unknown source: trust the cap
		expect(capFrameRate(120, 'original')).toBeUndefined();
	});
});

describe('qualityToBitrate', () => {
	it('is monotonic in quality', () => {
		const at = (q: number) => qualityToBitrate(q, 1920, 1080, 30, 'avc');
		expect(at(30)).toBeLessThan(at(60));
		expect(at(60)).toBeLessThan(at(90));
	});

	it('anchors q75@1080p30 avc in the 4-10 Mbps band', () => {
		const bps = qualityToBitrate(75, 1920, 1080, 30, 'avc');
		expect(bps).toBeGreaterThan(4_000_000);
		expect(bps).toBeLessThan(10_000_000);
	});

	it('gives vp9 ~30% fewer bits and floors at 120 kbps', () => {
		const avc = qualityToBitrate(75, 1280, 720, 30, 'avc');
		const vp9 = qualityToBitrate(75, 1280, 720, 30, 'vp9');
		expect(vp9 / avc).toBeCloseTo(0.7, 1);
		expect(qualityToBitrate(1, 160, 120, 10, 'vp9')).toBe(120_000);
	});

	it('budgets by codec efficiency: vp8 needs MORE bits than avc, hevc fewer', () => {
		const avc = qualityToBitrate(75, 1280, 720, 30, 'avc');
		expect(qualityToBitrate(75, 1280, 720, 30, 'vp8') / avc).toBeCloseTo(1.1, 1);
		expect(qualityToBitrate(75, 1280, 720, 30, 'hevc') / avc).toBeCloseTo(0.75, 1);
	});
});

describe('capBySourceBitrate', () => {
	it('caps a resolution-derived bitrate by what the source carries', () => {
		// 9 Mbps curve vs a 400 kbps web clip at q75, avc→avc: cap wins.
		expect(capBySourceBitrate(9_000_000, 75, 400_000, 'avc', 'avc')).toBe(400_000);
	});

	it('leaves high-bitrate camera footage on the curve', () => {
		expect(capBySourceBitrate(9_000_000, 75, 50_000_000, 'hevc', 'avc')).toBe(9_000_000);
	});

	it('scales with the quality slider', () => {
		expect(capBySourceBitrate(9_000_000, 30, 1_000_000, 'avc', 'avc')).toBe(400_000);
		expect(capBySourceBitrate(9_000_000, 100, 1_000_000, 'avc', 'avc')).toBe(1_333_333);
	});

	it('grants extra bits when converting from a stronger codec', () => {
		// VP9 source → H.264 target needs ~1.43× the bits for the same quality.
		expect(capBySourceBitrate(9_000_000, 75, 700_000, 'vp9', 'avc')).toBe(1_000_000);
	});

	it('is a no-op without source stats and floors at 120 kbps', () => {
		expect(capBySourceBitrate(9_000_000, 75, null, null, 'avc')).toBe(9_000_000);
		expect(capBySourceBitrate(9_000_000, 1, 100_000, 'avc', 'avc')).toBe(120_000);
	});
});

describe('targetBitrate', () => {
	it('subtracts the audio budget and derates for overshoot', () => {
		// 25 MB, 60 s, 128 kbps audio → well under the naive 25MB*8/60.
		const bps = targetBitrate(25_000_000, 60, 128_000);
		const naive = (25_000_000 * 8) / 60;
		expect(bps).toBeLessThan(naive);
		expect(bps).toBeGreaterThan(naive * 0.8);
	});

	it('floors at 120 kbps for absurd targets', () => {
		expect(targetBitrate(10_000, 600, 128_000)).toBe(120_000);
	});
});

describe('cappedTargetBitrate', () => {
	it('caps a generous target by the source ceiling (q100, cross-codec aware)', () => {
		// 50 MB target for a 60 s / 400 kbps avc clip → source ceiling wins:
		// 400k · (100/75) ≈ 533 kbps, far below the ~6.5 Mbps the target allows.
		const bps = cappedTargetBitrate(50_000_000, 60, 128_000, 400_000, 'avc', 'avc');
		expect(bps).toBe(Math.round(400_000 * (100 / 75)));
	});

	it('keeps the target math when it is the binding constraint', () => {
		const uncapped = targetBitrate(2_000_000, 60, 128_000);
		expect(cappedTargetBitrate(2_000_000, 60, 128_000, 8_000_000, 'avc', 'avc')).toBe(uncapped);
	});

	it('is targetBitrate when source stats are unknown', () => {
		expect(cappedTargetBitrate(5_000_000, 30, 0, null, null, 'vp9')).toBe(
			targetBitrate(5_000_000, 30, 0)
		);
	});
});

describe('audioTargetBitrate', () => {
	it('derives the bitrate from target size and duration with 3% overhead', () => {
		// 50 KB for 3 s → ~129 kbps
		expect(audioTargetBitrate(50_000, 3)).toBe(Math.floor((50_000 * 8 * 0.97) / 3));
	});

	it('clamps to the sane CBR range', () => {
		expect(audioTargetBitrate(1_000, 600)).toBe(32_000); // absurdly small
		expect(audioTargetBitrate(100_000_000, 3)).toBe(320_000); // absurdly large
	});
});

describe('retryBitrate', () => {
	it('scales down proportionally with an extra 5% margin', () => {
		expect(retryBitrate(1_000_000, 30_000_000, 25_000_000)).toBe(
			Math.floor(1_000_000 * (25 / 30) * 0.95)
		);
	});
});

describe('formatTime', () => {
	it('formats mm:ss and h:mm:ss', () => {
		expect(formatTime(0)).toBe('0:00');
		expect(formatTime(62)).toBe('1:02');
		expect(formatTime(3723)).toBe('1:02:03');
	});
});

// Applies the spec's canvas transform chain (translate → rotate → scale →
// drawImage rect) to a normalized source point (u,v ∈ 0..1) the way a 2d
// context would, so the tests verify real corner mapping, not internals.
function applyDraw(spec: RotatedDrawSpec, u: number, v: number): [number, number] {
	const x0 = spec.dx + u * spec.dWidth;
	const y0 = spec.dy + v * spec.dHeight;
	const xs = x0 * spec.scaleX;
	const ys = y0 * spec.scaleY;
	const cos = Math.cos(spec.rotateRad);
	const sin = Math.sin(spec.rotateRad);
	const xr = xs * cos - ys * sin;
	const yr = xs * sin + ys * cos;
	// `+ 0` folds the IEEE −0 that exact 180°/270° rotations produce.
	return [Math.round(xr + spec.translateX) + 0, Math.round(yr + spec.translateY) + 0];
}

describe('rotatedDrawSpec', () => {
	// Display canvas 64×96 (portrait) fed by unrotated 96×64 JPEG frames —
	// the rotated-MJPEG shape. Rotation is clockwise, like mediabunny's.
	it('90°: source top-left lands top-right, bottom-left lands top-left', () => {
		const spec = rotatedDrawSpec(90, 64, 96);
		expect(applyDraw(spec, 0, 0)).toEqual([64, 0]);
		expect(applyDraw(spec, 1, 0)).toEqual([64, 96]);
		expect(applyDraw(spec, 0, 1)).toEqual([0, 0]);
		expect(applyDraw(spec, 1, 1)).toEqual([0, 96]);
	});

	it('180°: corners swap diagonally on the same canvas', () => {
		const spec = rotatedDrawSpec(180, 64, 96);
		expect(applyDraw(spec, 0, 0)).toEqual([64, 96]);
		expect(applyDraw(spec, 1, 0)).toEqual([0, 96]);
		expect(applyDraw(spec, 1, 1)).toEqual([0, 0]);
	});

	it('270°: source top-left lands bottom-left', () => {
		const spec = rotatedDrawSpec(270, 64, 96);
		expect(applyDraw(spec, 0, 0)).toEqual([0, 96]);
		expect(applyDraw(spec, 1, 0)).toEqual([0, 0]);
		expect(applyDraw(spec, 1, 1)).toEqual([64, 0]);
	});

	it('0°: identity mapping filling the whole canvas', () => {
		const spec = rotatedDrawSpec(0, 96, 64);
		expect(applyDraw(spec, 0, 0)).toEqual([0, 0]);
		expect(applyDraw(spec, 1, 1)).toEqual([96, 64]);
	});

	it('every rotation covers the full canvas exactly (corner set equality)', () => {
		for (const rotation of [0, 90, 180, 270] as const) {
			const spec = rotatedDrawSpec(rotation, 64, 96);
			const corners = (
				[
					[0, 0],
					[1, 0],
					[0, 1],
					[1, 1]
				] as const
			).map(([u, v]) => applyDraw(spec, u, v).join(','));
			expect(new Set(corners)).toEqual(new Set(['0,0', '64,0', '0,96', '64,96']));
		}
	});
});

describe('createFrameRateDecimator', () => {
	it('keeps everything when no cap is set', () => {
		const keep = createFrameRateDecimator(undefined);
		for (let i = 0; i < 10; i++) expect(keep(i / 60)).toBe(true);
	});

	it('halves a 60 fps stream to 30 fps', () => {
		const keep = createFrameRateDecimator(30);
		const kept = Array.from({ length: 60 }, (_, i) => keep(i / 60)).filter(Boolean).length;
		expect(kept).toBe(30);
	});

	it('keeps every frame when the source is already below the cap', () => {
		const keep = createFrameRateDecimator(15);
		const kept = Array.from({ length: 20 }, (_, i) => keep(i / 10)).filter(Boolean).length;
		expect(kept).toBe(20);
	});

	it('recovers after a timestamp gap without a burst of kept frames', () => {
		const keep = createFrameRateDecimator(30);
		expect(keep(0)).toBe(true);
		expect(keep(1 / 60)).toBe(false);
		// 2-second hole (e.g. an edit) — the very next frame is kept, but the
		// grid re-anchors there instead of replaying the missed slots.
		expect(keep(2)).toBe(true);
		expect(keep(2 + 1 / 60)).toBe(false);
		expect(keep(2 + 2 / 60)).toBe(true);
	});
});

describe('planGif', () => {
	it('auto-caps 4K sources to the GIF dimension ceiling with a flag', () => {
		const plan = planGif(3, 3840, 2160, 12, null);
		expect(plan.maxDimension).toBe(GIF_MAX_DIMENSION);
		expect(plan.dimensionCapped).toBe(true);
	});

	it('leaves small sources and tighter user caps alone', () => {
		expect(planGif(3, 320, 240, 12, null).dimensionCapped).toBe(false);
		const user = planGif(3, 3840, 2160, 12, 320);
		expect(user.maxDimension).toBe(320);
		expect(user.dimensionCapped).toBe(false);
	});

	it('clamps a user cap above the ceiling back down, flagged', () => {
		const plan = planGif(3, 3840, 2160, 12, 1280);
		expect(plan.maxDimension).toBe(GIF_MAX_DIMENSION);
		expect(plan.dimensionCapped).toBe(true);
	});

	it('hard-fails frame counts past the cap, soft-warns on long clips', () => {
		expect(planGif(1800, 1280, 720, 12, null).tooManyFrames).toBe(true); // 21600 frames
		const long = planGif(60, 1280, 720, 12, null); // 720 frames
		expect(long.tooManyFrames).toBe(false);
		expect(long.longGif).toBe(true);
		const short = planGif(10, 1280, 720, 15, null); // 150 frames
		expect(short.tooManyFrames).toBe(false);
		expect(short.longGif).toBe(false);
	});

	it('frame count mirrors the worker sampling grid', () => {
		expect(planGif(3, 320, 240, 15, null).frameCount).toBe(45);
		expect(planGif(GIF_MAX_FRAMES / 12, 320, 240, 12, null).tooManyFrames).toBe(false);
		expect(planGif(GIF_MAX_FRAMES / 12 + 1, 320, 240, 12, null).tooManyFrames).toBe(true);
	});
});
