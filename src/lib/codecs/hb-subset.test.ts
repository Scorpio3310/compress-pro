import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as opentypeNs from 'opentype.js';
import fonteditorNs from 'fonteditor-core';
import { subsetSfnt, type HbExports } from './hb-subset';
import { findTable, readSfnt, SFNT_TTF } from './sfnt';
import { parseFvar } from './fvar';

const require = createRequire(import.meta.url);
let hb: HbExports;

beforeAll(async () => {
	// The exact wasm the worker ships — raw exports, no JS glue (see hb-subset.ts).
	const bytes = readFileSync(require.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm'));
	const { instance } = await WebAssembly.instantiate(bytes);
	hb = instance.exports as unknown as HbExports;
});

/** A/B/C + space + .notdef authored in-memory: opentype.js writes CFF, so the
 *  glyf variant is derived through fonteditor-core (no fixture-file coupling —
 *  unit tests must pass on a checkout that never ran `pnpm fixtures`). */
function authoredOtf(): Uint8Array {
	const O = (opentypeNs as { default?: typeof opentypeNs }).default ?? opentypeNs;
	const glyph = (name: string, unicode: number | undefined, draw: boolean) => {
		const path = new O.Path();
		if (draw) {
			path.moveTo(50, 0);
			path.lineTo(250, 700);
			path.lineTo(450, 0);
			path.close();
		}
		return new O.Glyph({ name, unicode, advanceWidth: 560, path });
	};
	const font = new O.Font({
		familyName: 'Subset Test',
		styleName: 'Regular',
		unitsPerEm: 1000,
		ascender: 800,
		descender: -200,
		glyphs: [
			glyph('.notdef', undefined, false),
			glyph('space', 0x20, false),
			glyph('A', 0x41, true),
			glyph('B', 0x42, true),
			glyph('C', 0x43, true)
		]
	});
	return new Uint8Array(font.toArrayBuffer());
}

function authoredTtf(): Uint8Array {
	const ns = fonteditorNs as unknown as { Font?: unknown; default?: unknown };
	const fonteditor = (ns.Font ? ns : ns.default) as typeof fonteditorNs;
	const otf = authoredOtf();
	const parsed = fonteditor.Font.create(
		otf.buffer.slice(otf.byteOffset, otf.byteOffset + otf.byteLength) as ArrayBuffer,
		{ type: 'otf', hinting: true }
	);
	return new Uint8Array(parsed.write({ type: 'ttf', hinting: true }) as ArrayBuffer);
}

function glyphCount(sfnt: Uint8Array): number {
	const maxp = findTable(sfnt, readSfnt(sfnt), 'maxp')!;
	return new DataView(maxp.buffer, maxp.byteOffset).getUint16(4);
}

// A real variable font, locally copied into the gitignored real-fixtures dir
// (any glyf VF works — macOS: cp /System/Library/Fonts/SFNS.ttf → this path).
const REAL_VF = join(process.cwd(), 'tests', 'fixtures', 'real', 'variable-sfns.ttf');

describe('subsetSfnt', () => {
	it('keeps only the requested codepoints (plus .notdef)', () => {
		const source = authoredTtf();
		expect(readSfnt(source).flavor).toBe(SFNT_TTF);
		const out = subsetSfnt(hb, source, {
			codepoints: Uint32Array.from([0x20, 0x41]),
			keepHinting: true,
			pinAxes: null
		});
		expect(out.pinned).toBe(false);
		expect(readSfnt(out.bytes).tables.some((t) => t.tag === 'glyf')).toBe(true);
		expect(glyphCount(out.bytes)).toBe(3); // .notdef + space + A; B and C gone
		expect(glyphCount(source)).toBe(5);
	});

	it('keep-everything with nothing to do is a no-op that never touches hb', () => {
		const source = authoredTtf();
		// null instead of a live instance — the shortcut must not call into wasm
		// (its retain-all path traps on some large variable fonts).
		const out = subsetSfnt(null as unknown as HbExports, source, {
			codepoints: null,
			keepHinting: true,
			pinAxes: null
		});
		expect(out.pinned).toBe(false);
		expect(out.bytes).toEqual(source);
		expect(out.bytes).not.toBe(source); // a copy, not the caller's buffer
	});

	it('NO_HINTING runs clean', () => {
		const out = subsetSfnt(hb, authoredTtf(), {
			codepoints: Uint32Array.from([0x41]),
			keepHinting: false,
			pinAxes: null
		});
		expect(glyphCount(out.bytes)).toBe(2); // .notdef + A
	});

	it('refuses CFF outlines with the honest message (build has no CFF subsetter)', () => {
		expect(() =>
			subsetSfnt(hb, authoredOtf(), {
				codepoints: Uint32Array.from([0x41]),
				keepHinting: true,
				pinAxes: null
			})
		).toThrow(/PostScript \(CFF\)/);
	});

	it('reports pinned=false when a static font is asked for an instance', () => {
		const out = subsetSfnt(hb, authoredTtf(), {
			codepoints: null,
			keepHinting: true,
			pinAxes: { wght: 700 }
		});
		expect(out.pinned).toBe(false);
		expect(glyphCount(out.bytes)).toBe(5); // the run itself still succeeds
	});

	// Real-VF coverage — the frankenfont route (synthetic fvar without gvar)
	// measured as a no-op in hb, so instancing is proven on a real font only.
	it.skipIf(!existsSync(REAL_VF))('pins a real variable font to a static instance', () => {
		const source = new Uint8Array(readFileSync(REAL_VF));
		const axes = parseFvar(source);
		expect(axes.length).toBeGreaterThan(0);
		const out = subsetSfnt(hb, source, {
			codepoints: Uint32Array.from([0x20, 0x41, 0x42, 0x43]),
			keepHinting: true,
			pinAxes: { [axes[0].tag]: axes[0].max }
		});
		expect(out.pinned).toBe(true);
		const tags = readSfnt(out.bytes).tables.map((t) => t.tag);
		expect(tags).not.toContain('fvar');
		expect(tags).not.toContain('gvar');
		expect(tags).not.toContain('avar');
	});

	it.skipIf(!existsSync(REAL_VF))('keep-everything + pin = pure instancing', () => {
		const source = new Uint8Array(readFileSync(REAL_VF));
		const out = subsetSfnt(hb, source, {
			codepoints: null,
			keepHinting: true,
			pinAxes: {} // all axes → their defaults
		});
		expect(out.pinned).toBe(true);
		expect(readSfnt(out.bytes).tables.map((t) => t.tag)).not.toContain('fvar');
		expect(glyphCount(out.bytes)).toBe(glyphCount(source)); // no charset restriction
	});
});
