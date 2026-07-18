import { describe, expect, it } from 'vitest';
import { complementPages, resolvePageRange, validatePageRangeSyntax } from './pdf-range';

describe('validatePageRangeSyntax', () => {
	it('accepts every term shape', () => {
		expect(validatePageRangeSyntax('1')).toBeNull();
		expect(validatePageRangeSyntax('1-3')).toBeNull();
		expect(validatePageRangeSyntax('12-')).toBeNull();
		expect(validatePageRangeSyntax('-4')).toBeNull();
		expect(validatePageRangeSyntax(' 1-3 , 7 , 12- ')).toBeNull();
	});

	it('returns the hint for empty input', () => {
		expect(validatePageRangeSyntax('')).toMatch(/e\.g\./);
		expect(validatePageRangeSyntax('   ')).toMatch(/e\.g\./);
	});

	it('flags malformed terms', () => {
		expect(validatePageRangeSyntax('abc')).toMatch(/Invalid range "abc"/);
		expect(validatePageRangeSyntax('1-3,,7')).toMatch(/Invalid range/);
		expect(validatePageRangeSyntax('1--3')).toMatch(/Invalid range/);
	});
});

describe('resolvePageRange', () => {
	it('resolves plain pages, ranges and open ends (sorted, unique)', () => {
		expect(resolvePageRange('1-3,7', 10)).toEqual([1, 2, 3, 7]);
		expect(resolvePageRange('3-', 5)).toEqual([3, 4, 5]);
		expect(resolvePageRange('-2', 5)).toEqual([1, 2]);
		expect(resolvePageRange('7,1-3', 10)).toEqual([1, 2, 3, 7]);
		expect(resolvePageRange('1-3,2-4', 5)).toEqual([1, 2, 3, 4]);
	});

	it('throws for out-of-range pages with the page in the message', () => {
		expect(() => resolvePageRange('9', 5)).toThrow(/page 9 is out of range/);
		expect(() => resolvePageRange('2-9', 5)).toThrow(/page 9 is out of range/);
	});

	it('throws for reversed ranges', () => {
		expect(() => resolvePageRange('4-2', 5)).toThrow(/reversed/);
	});

	it('reports out-of-range (not reversed) for open ends past the last page', () => {
		expect(() => resolvePageRange('12-', 5)).toThrow(/page 12 is out of range/);
		expect(() => resolvePageRange('12-', 5)).not.toThrow(/reversed/);
	});

	it('reports page 0 as out of range, not reversed', () => {
		expect(() => resolvePageRange('-0', 5)).toThrow(/page 0 is out of range/);
		expect(() => resolvePageRange('0', 5)).toThrow(/page 0 is out of range/);
		expect(() => resolvePageRange('0-3', 5)).toThrow(/page 0 is out of range/);
	});

	it('throws the syntax hint for invalid input', () => {
		expect(() => resolvePageRange('abc', 5)).toThrow(/Invalid range/);
	});
});

describe('complementPages', () => {
	it('returns the pages not listed', () => {
		expect(complementPages([2, 4], 5)).toEqual([1, 3, 5]);
		expect(complementPages([], 3)).toEqual([1, 2, 3]);
		expect(complementPages([1, 2, 3], 3)).toEqual([]);
	});
});
