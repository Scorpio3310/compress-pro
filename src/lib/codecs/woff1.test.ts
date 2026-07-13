import { describe, expect, it } from 'vitest';
import { unwrapWoff1, wrapWoff1 } from './woff1';
import { sniffFont } from './font-sniff';
import { readSfnt, SFNT_OTTO, SFNT_TTF } from './sfnt';
import { buildHead, buildSfnt, noiseBytes } from './font-test-helpers';

const text = (s: string) => new TextEncoder().encode(s);

describe('wrapWoff1 / unwrapWoff1', () => {
	it('round-trips a canonical sfnt byte-for-byte (the losslessness claim)', () => {
		const sfnt = buildSfnt(SFNT_TTF, [
			{ tag: 'cmap', data: text('compressible '.repeat(40)) },
			{ tag: 'glyf', data: text('glyph data '.repeat(80)) },
			{ tag: 'head', data: buildHead() }
		]);
		const woff = wrapWoff1(sfnt);
		expect(sniffFont(woff)).toEqual({ container: 'woff', flavor: 'glyf' });
		expect(unwrapWoff1(woff)).toEqual(sfnt);
	});

	it('keeps the OTTO flavor for CFF fonts', () => {
		const sfnt = buildSfnt(SFNT_OTTO, [
			{ tag: 'CFF ', data: text('cff table '.repeat(50)) },
			{ tag: 'head', data: buildHead() }
		]);
		const woff = wrapWoff1(sfnt);
		expect(sniffFont(woff)).toEqual({ container: 'woff', flavor: 'cff' });
		expect(unwrapWoff1(woff)).toEqual(sfnt);
	});

	it('stores incompressible tables raw (spec: compLength === origLength)', () => {
		const noise = noiseBytes(256);
		const sfnt = buildSfnt(SFNT_TTF, [{ tag: 'nois', data: noise }]);
		const woff = wrapWoff1(sfnt);
		const dv = new DataView(woff.buffer);
		expect(dv.getUint32(44 + 8)).toBe(256); // compLength
		expect(dv.getUint32(44 + 12)).toBe(256); // origLength — equal means raw
		expect(unwrapWoff1(woff)).toEqual(sfnt);
	});

	it('carries directory checksums through untouched', () => {
		const sfnt = buildSfnt(SFNT_TTF, [
			{ tag: 'name', data: text('x'.repeat(100)), checksum: 0x12345678 }
		]);
		const back = readSfnt(unwrapWoff1(wrapWoff1(sfnt)));
		expect(back.tables[0].checksum).toBe(0x12345678);
	});

	it('preserves odd table lengths and zero-length tables through padding', () => {
		const sfnt = buildSfnt(SFNT_TTF, [
			{ tag: 'aaaa', data: text('odd') }, // 3 bytes → 1 pad byte
			{ tag: 'bbbb', data: new Uint8Array(0) },
			{ tag: 'cccc', data: text('12345') }
		]);
		expect(unwrapWoff1(wrapWoff1(sfnt))).toEqual(sfnt);
	});

	it('rejects garbage, truncation and lying directory entries', () => {
		expect(() => unwrapWoff1(noiseBytes(100))).toThrow(/valid WOFF/);
		const woff = wrapWoff1(buildSfnt(SFNT_TTF, [{ tag: 'head', data: buildHead() }]));
		expect(() => unwrapWoff1(woff.subarray(0, 50))).toThrow(/valid WOFF/);
		const lying = woff.slice();
		new DataView(lying.buffer).setUint32(44 + 12, 9999); // origLength ≠ inflated size
		expect(() => unwrapWoff1(lying)).toThrow(/valid WOFF/);
	});

	it('rejects non-sfnt input to wrap', () => {
		expect(() => wrapWoff1(noiseBytes(100))).toThrow(/valid font/);
	});
});
