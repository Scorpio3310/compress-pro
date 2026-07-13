import { describe, expect, it } from 'vitest';
import { parseFvar } from './fvar';
import { SFNT_TTF } from './sfnt';
import { buildFvar, buildHead, buildSfnt, noiseBytes } from './font-test-helpers';

const AXES = [
	{ tag: 'wght', min: 100, def: 400, max: 900 },
	{ tag: 'wdth', min: 75, def: 100, max: 125, hidden: true }
];

function fontWith(fvar: Uint8Array): Uint8Array {
	return buildSfnt(SFNT_TTF, [
		{ tag: 'fvar', data: fvar },
		{ tag: 'head', data: buildHead() }
	]);
}

describe('parseFvar', () => {
	it('reads tag/min/def/max and the hidden flag', () => {
		expect(parseFvar(fontWith(buildFvar(AXES)))).toEqual([
			{ tag: 'wght', min: 100, def: 400, max: 900, hidden: false },
			{ tag: 'wdth', min: 75, def: 100, max: 125, hidden: true }
		]);
	});

	it('handles fractional Fixed 16.16 values', () => {
		const axes = parseFvar(fontWith(buildFvar([{ tag: 'slnt', min: -11.5, def: 0, max: 0 }])));
		expect(axes[0].min).toBeCloseTo(-11.5, 4);
	});

	it('returns [] for non-variable fonts', () => {
		expect(parseFvar(buildSfnt(SFNT_TTF, [{ tag: 'head', data: buildHead() }]))).toEqual([]);
	});

	it('returns [] on malformed data instead of throwing (probe safety)', () => {
		expect(parseFvar(noiseBytes(64))).toEqual([]); // not an sfnt at all
		const truncated = buildFvar(AXES).subarray(0, 20); // header claims more than present
		expect(parseFvar(fontWith(truncated))).toEqual([]);
		const badAxisSize = buildFvar(AXES);
		new DataView(badAxisSize.buffer).setUint16(10, 8); // axisSize below spec minimum
		expect(parseFvar(fontWith(badAxisSize))).toEqual([]);
	});
});
