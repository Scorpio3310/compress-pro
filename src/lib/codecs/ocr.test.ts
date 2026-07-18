import { describe, expect, it } from 'vitest';
import { mapWordToPdf, type OcrWord } from './ocr';

const word = (x0: number, y0: number, x1: number, y1: number): OcrWord => ({
	text: 'w',
	bbox: { x0, y0, x1, y1 }
});

describe('mapWordToPdf', () => {
	it('scales render pixels to PDF points and flips the y axis', () => {
		// 1000×2000 px render of a 500×1000 pt page → scale 0.5 both ways.
		const at = mapWordToPdf(word(100, 200, 300, 260), 1000, 2000, 500, 1000);
		expect(at.x).toBe(50);
		// bbox bottom (y1=260 px → 130 pt from the top) flips to 1000-130.
		expect(at.y).toBe(870);
		expect(at.size).toBe(30); // (260-200) px * 0.5
	});

	it('handles asymmetric scales (non-uniform render)', () => {
		const at = mapWordToPdf(word(0, 0, 100, 40), 2000, 1000, 500, 500);
		expect(at.x).toBe(0);
		expect(at.y).toBe(480); // 500 - 40*0.5
		expect(at.size).toBe(20);
	});

	it('never emits a zero/negative font size', () => {
		const at = mapWordToPdf(word(10, 10, 12, 10), 1000, 1000, 100, 100);
		expect(at.size).toBeGreaterThanOrEqual(1);
	});
});
