import { describe, expect, it } from 'vitest';
import { applyOrientation } from './orientation';

/** 2×1 image: A=red at (0,0), B=green at (1,0). */
const A = [255, 0, 0, 255];
const B = [0, 255, 0, 255];
const src = () => new Uint8ClampedArray([...A, ...B]);
const px = (r: { data: Uint8ClampedArray }, i: number) => [...r.data.slice(i * 4, i * 4 + 4)];

describe('applyOrientation', () => {
	it('passes orientation 1 (and garbage) through untouched', () => {
		const r = applyOrientation(src(), 2, 1, 1);
		expect([r.width, r.height]).toEqual([2, 1]);
		expect(px(r, 0)).toEqual(A);
		expect(applyOrientation(src(), 2, 1, 0).width).toBe(2);
		expect(applyOrientation(src(), 2, 1, 9).width).toBe(2);
	});

	it('mirrors horizontally (2) and rotates 180 (3)', () => {
		const m = applyOrientation(src(), 2, 1, 2);
		expect(px(m, 0)).toEqual(B);
		expect(px(m, 1)).toEqual(A);
		const r = applyOrientation(src(), 2, 1, 3);
		expect(px(r, 0)).toEqual(B);
		expect(px(r, 1)).toEqual(A);
	});

	it('rotates 90 CW (6): row [A B] becomes column [A; B]', () => {
		const r = applyOrientation(src(), 2, 1, 6);
		expect([r.width, r.height]).toEqual([1, 2]);
		expect(px(r, 0)).toEqual(A); // top
		expect(px(r, 1)).toEqual(B); // bottom
	});

	it('rotates 270 CW (8): row [A B] becomes column [B; A]', () => {
		const r = applyOrientation(src(), 2, 1, 8);
		expect([r.width, r.height]).toEqual([1, 2]);
		expect(px(r, 0)).toEqual(B);
		expect(px(r, 1)).toEqual(A);
	});

	it('round-trips: 6 then 8 restores the original', () => {
		const once = applyOrientation(src(), 2, 1, 6);
		const back = applyOrientation(once.data, once.width, once.height, 8);
		expect([back.width, back.height]).toEqual([2, 1]);
		expect(px(back, 0)).toEqual(A);
		expect(px(back, 1)).toEqual(B);
	});
});
