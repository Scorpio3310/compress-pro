import { describe, expect, it } from 'vitest';
import { VECTORIZE_MAX_PIXELS, vectorizeTraceSize } from './vectorize-limits';

describe('vectorizeTraceSize', () => {
	it('leaves images at or under the ceiling untouched', () => {
		expect(vectorizeTraceSize(1200, 800)).toEqual({ width: 1200, height: 800, scaled: false });
		// Exactly at the cap is fine too.
		const side = Math.floor(Math.sqrt(VECTORIZE_MAX_PIXELS));
		expect(vectorizeTraceSize(side, side).scaled).toBe(false);
	});

	it('downscales a phone panorama under the ceiling, preserving aspect', () => {
		// The audit's 9152×6944 (63 MP) hang case.
		const { width, height, scaled } = vectorizeTraceSize(9152, 6944);
		expect(scaled).toBe(true);
		expect(width * height).toBeLessThanOrEqual(VECTORIZE_MAX_PIXELS);
		// Aspect within a pixel of rounding.
		expect(width / height).toBeCloseTo(9152 / 6944, 2);
		// Not overly aggressive either — lands near the ceiling.
		expect(width * height).toBeGreaterThan(VECTORIZE_MAX_PIXELS * 0.9);
	});

	it('never exceeds the ceiling on degenerate aspect ratios', () => {
		const banner = vectorizeTraceSize(8_000_000, 1);
		expect(banner.width * banner.height).toBeLessThanOrEqual(VECTORIZE_MAX_PIXELS);
		expect(banner.height).toBeGreaterThanOrEqual(1);
		const pole = vectorizeTraceSize(2, 40_000_000);
		expect(pole.width * pole.height).toBeLessThanOrEqual(VECTORIZE_MAX_PIXELS);
		expect(pole.width).toBeGreaterThanOrEqual(1);
	});

	it("honors the user's max-dimension cap below the ceiling", () => {
		const r = vectorizeTraceSize(4000, 3000, 1000);
		expect([r.width, r.height]).toEqual([1000, 750]);
		expect(r.scaled).toBe(true);
	});

	it('keeps the 2 MP ceiling as the hard bound over a huge user cap', () => {
		const r = vectorizeTraceSize(9152, 6944, 8000);
		expect(r.width * r.height).toBeLessThanOrEqual(2_000_000);
		expect(r.scaled).toBe(true);
	});
});
