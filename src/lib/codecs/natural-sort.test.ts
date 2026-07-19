import { describe, expect, it } from 'vitest';
import { naturalCompare } from './natural-sort';

describe('naturalCompare', () => {
	it('orders embedded numbers numerically, not lexically', () => {
		const names = ['page10.jpg', 'page2.jpg', 'page1.jpg'];
		expect([...names].sort(naturalCompare)).toEqual(['page1.jpg', 'page2.jpg', 'page10.jpg']);
	});

	it('handles zero-padding and mixed widths together', () => {
		const names = ['p003.png', 'p10.png', 'p2.png'];
		expect([...names].sort(naturalCompare)).toEqual(['p2.png', 'p003.png', 'p10.png']);
	});

	it('is case-insensitive and stable on equal keys', () => {
		expect(naturalCompare('Page1.jpg', 'page1.jpg')).toBe(0);
		expect(naturalCompare('a.jpg', 'a.jpg')).toBe(0);
	});

	it('sorts full paths so directory grouping survives', () => {
		const names = ['ch2/p1.jpg', 'ch10/p1.jpg', 'ch1/p2.jpg', 'ch1/p10.jpg'];
		expect([...names].sort(naturalCompare)).toEqual([
			'ch1/p2.jpg',
			'ch1/p10.jpg',
			'ch2/p1.jpg',
			'ch10/p1.jpg'
		]);
	});
});
