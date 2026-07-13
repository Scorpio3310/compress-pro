import { describe, expect, it } from 'vitest';
import { unwrapEot, wrapEot } from './eot';
import { sniffFont } from './font-sniff';
import { SFNT_TTF } from './sfnt';
import { buildHead, buildName, buildOs2, buildSfnt, noiseBytes } from './font-test-helpers';

const NAMES = {
	1: 'Test Family',
	2: 'Bold Italic',
	4: 'Test Family Bold Italic',
	5: 'Version 1.0'
};

function sampleSfnt(): Uint8Array {
	return buildSfnt(SFNT_TTF, [
		{ tag: 'OS/2', data: buildOs2() },
		{ tag: 'head', data: buildHead(0xdeadbeef) },
		{ tag: 'name', data: buildName(NAMES) }
	]);
}

describe('wrapEot / unwrapEot', () => {
	it('round-trips the sfnt byte-for-byte (font data is stored verbatim)', () => {
		const sfnt = sampleSfnt();
		const eot = wrapEot(sfnt);
		expect(sniffFont(eot)).toEqual({ container: 'eot', flavor: null });
		expect(unwrapEot(eot)).toEqual(sfnt);
	});

	it('fills the header from OS/2, head and name (what IE actually reads)', () => {
		const eot = wrapEot(sampleSfnt());
		const dv = new DataView(eot.buffer);
		expect(dv.getUint32(0, true)).toBe(eot.length); // EOTSize
		expect(dv.getUint32(12, true)).toBe(0); // flags: plain
		expect(Array.from(eot.subarray(16, 26))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // PANOSE
		expect(eot[27]).toBe(1); // italic from fsSelection
		expect(dv.getUint32(28, true)).toBe(700); // weight
		expect(dv.getUint16(32, true)).toBe(8); // fsType
		expect(dv.getUint32(36, true)).toBe(0x11111111); // UnicodeRange1
		expect(dv.getUint32(52, true)).toBe(0xaaaa5555); // CodePageRange1
		expect(dv.getUint32(60, true)).toBe(0xdeadbeef); // CheckSumAdjustment
		// FamilyName: size prefix then UTF-16LE "Test Family".
		expect(dv.getUint16(82, true)).toBe(NAMES[1].length * 2);
		expect(eot[84]).toBe('T'.charCodeAt(0));
		expect(eot[85]).toBe(0);
	});

	it('wraps fonts lacking OS/2 and name with defaults instead of failing', () => {
		const sfnt = buildSfnt(SFNT_TTF, [{ tag: 'head', data: buildHead() }]);
		const eot = wrapEot(sfnt);
		const dv = new DataView(eot.buffer);
		expect(dv.getUint32(28, true)).toBe(400); // default weight
		expect(dv.getUint16(82, true)).toBe(0); // empty family name
		expect(unwrapEot(eot)).toEqual(sfnt);
	});

	it('rejects MicroType-Express-compressed EOTs with an actionable message', () => {
		const eot = wrapEot(sampleSfnt());
		new DataView(eot.buffer).setUint32(12, 0x00000004, true); // TTEMBED_TTCOMPRESSED
		expect(() => unwrapEot(eot)).toThrow(/MicroType Express/);
	});

	it('decodes XOR-obfuscated font data (TTEMBED_XORENCRYPTDATA)', () => {
		const sfnt = sampleSfnt();
		const eot = wrapEot(sfnt);
		const dv = new DataView(eot.buffer);
		dv.setUint32(12, 0x10000000, true);
		const dataStart = eot.length - sfnt.length;
		for (let i = dataStart; i < eot.length; i++) eot[i] ^= 0x50;
		expect(unwrapEot(eot)).toEqual(sfnt);
	});

	it('tolerates a trailing-padding mismatch between EOTSize and file size', () => {
		const sfnt = sampleSfnt();
		const eot = wrapEot(sfnt);
		const padded = new Uint8Array(eot.length + 2); // junk after the structure
		padded.set(eot);
		expect(unwrapEot(padded)).toEqual(sfnt);
	});

	it('rejects garbage and truncated headers', () => {
		expect(() => unwrapEot(noiseBytes(200))).toThrow(/valid EOT/);
		expect(() => unwrapEot(wrapEot(sampleSfnt()).subarray(0, 60))).toThrow(/valid EOT/);
	});
});
