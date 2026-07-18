import { describe, expect, it } from 'vitest';
import { vectorizeParams } from './vectorize';

describe('vectorizeParams', () => {
	it('lands on vtracer CLI defaults at detail 60 — with wrapper semantics', () => {
		const p = vectorizeParams('color', 60);
		expect(p.binary).toBe(false);
		expect(p.filterSpeckle).toBe(4);
		// CLI precision 6 → wrapper same-color bits 8-6=2 (inverted semantics).
		expect(p.colorPrecision).toBe(2);
		expect(p.layerDifference).toBe(16);
		expect(p.mode).toBe('spline');
		expect(p.hierarchical).toBe('stacked');
		// Angle thresholds are RADIANS at this boundary (60°/45° CLI defaults).
		expect(p.cornerThreshold).toBeCloseTo(Math.PI / 3, 5);
		expect(p.spliceThreshold).toBeCloseTo(Math.PI / 4, 5);
	});

	it('higher detail keeps more, lower simplifies harder', () => {
		const hi = vectorizeParams('color', 100);
		const lo = vectorizeParams('color', 0);
		expect(hi.filterSpeckle).toBeLessThan(lo.filterSpeckle);
		// Inverted field: fewer same-color bits = more precise.
		expect(hi.colorPrecision).toBeLessThan(lo.colorPrecision);
		expect(hi.layerDifference).toBeLessThan(lo.layerDifference);
	});

	it('never reaches the wrapper values that panic the wasm', () => {
		// colorPrecision 8 (same_color_a = 8) trips a visioncortex assert —
		// the mapping must stay within 1..5 across the whole detail range.
		for (let d = 0; d <= 100; d += 10) {
			const p = vectorizeParams('color', d);
			expect(p.colorPrecision).toBeGreaterThanOrEqual(1);
			expect(p.colorPrecision).toBeLessThanOrEqual(5);
		}
	});

	it('clamps out-of-range detail and maps the bw mode', () => {
		expect(vectorizeParams('bw', 500)).toEqual(vectorizeParams('bw', 100));
		expect(vectorizeParams('bw', -5)).toEqual(vectorizeParams('bw', 0));
		expect(vectorizeParams('bw', 50).binary).toBe(true);
		expect(vectorizeParams('color', 50).binary).toBe(false);
	});
});
