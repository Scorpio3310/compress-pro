/**
 * Real-font sweep: every unique font under tests/fixtures/real (gitignored,
 * local-only — the suite self-skips when the directory has none) runs through
 * the WHOLE codec surface: parse, WOFF/WOFF2/EOT round-trips with bit-exact
 * table comparisons, subsetting, CFF rejection, variable-font instancing.
 *
 * WOFF2 encode (brotli q11) on multi-MB variable fonts takes ~10 s each, so
 * fonts above the size cap skip that one check unless REAL_FONTS_FULL=1 —
 * skips are logged, never silent.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fonteditorNs from 'fonteditor-core';
import { sniffFont } from './font-sniff';
import { findTable, readSfnt, SFNT_OTTO } from './sfnt';
import { unwrapWoff1, wrapWoff1 } from './woff1';
import { unwrapEot, wrapEot } from './eot';
import { parseFvar } from './fvar';
import { subsetSfnt, type HbExports } from './hb-subset';

const REAL = join(process.cwd(), 'tests', 'fixtures', 'real');
const FULL = !!process.env.REAL_FONTS_FULL;
const WOFF2_ENCODE_CAP = FULL ? Infinity : 1_500_000;

interface RealFont {
	name: string;
	path: string;
}

function discoverFonts(): RealFont[] {
	if (!existsSync(REAL)) return [];
	const seen = new Set<string>();
	const fonts: RealFont[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (/\.(ttf|otf|woff2?|eot)$/i.test(entry.name)) {
				const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
				if (seen.has(hash)) continue; // sample-1 ≡ sample-2, duplicated dirs
				seen.add(hash);
				fonts.push({ name: relative(REAL, path), path });
			}
		}
	};
	walk(REAL);
	return fonts.sort((a, b) => a.name.localeCompare(b.name));
}

const FONTS = discoverFonts();

type Woff2Codec = {
	init(): Promise<unknown>;
	encode(b: ArrayBuffer | Uint8Array): Uint8Array;
	decode(b: ArrayBuffer | Uint8Array): Uint8Array;
};

let hb: HbExports;
let woff2: Woff2Codec;

/** Decoded whole-sfnt per font (or the honest decode error, e.g. MTX EOT). */
const sfntCache = new Map<string, { sfnt: Uint8Array | null; error: string | null }>();

function getSfnt(font: RealFont): { sfnt: Uint8Array | null; error: string | null } {
	let entry = sfntCache.get(font.path);
	if (entry) return entry;
	const bytes = new Uint8Array(readFileSync(font.path));
	try {
		const sniff = sniffFont(bytes);
		if (!sniff || sniff.container === 'ttc') throw new Error('unrecognized container');
		const sfnt =
			sniff.container === 'woff'
				? unwrapWoff1(bytes)
				: sniff.container === 'woff2'
					? woff2.decode(bytes)
					: sniff.container === 'eot'
						? unwrapEot(bytes)
						: bytes;
		entry = { sfnt: new Uint8Array(sfnt), error: null };
	} catch (error) {
		entry = { sfnt: null, error: error instanceof Error ? error.message : String(error) };
	}
	sfntCache.set(font.path, entry);
	return entry;
}

function tableBytes(sfnt: Uint8Array): Map<string, Uint8Array> {
	return new Map(
		readSfnt(sfnt).tables.map((t) => [t.tag, sfnt.subarray(t.offset, t.offset + t.length)])
	);
}

function glyphCount(sfnt: Uint8Array): number {
	const maxp = findTable(sfnt, readSfnt(sfnt), 'maxp');
	expect(maxp, 'maxp present').not.toBeNull();
	return new DataView(maxp!.buffer, maxp!.byteOffset).getUint16(4);
}

const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

const LATIN = (() => {
	const cps: number[] = [];
	for (let cp = 0x20; cp <= 0x7e; cp++) cps.push(cp);
	return Uint32Array.from(cps);
})();

/** font name → op → outcome, printed as the closing summary table. */
const summary = new Map<string, Record<string, string>>();
const record = (font: RealFont, op: string, outcome: string) => {
	const row = summary.get(font.name) ?? {};
	row[op] = outcome;
	summary.set(font.name, row);
};

describe.skipIf(FONTS.length === 0)('real-font sweep', () => {
	beforeAll(async () => {
		const require = createRequire(import.meta.url);
		const wasm = readFileSync(require.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm'));
		hb = (await WebAssembly.instantiate(wasm)).instance.exports as unknown as HbExports;

		const ns = fonteditorNs as unknown as { woff2?: Woff2Codec; default?: { woff2: Woff2Codec } };
		woff2 = (ns.woff2 ?? ns.default!.woff2) as Woff2Codec;
		await woff2.init(); // node build resolves its wasm from __dirname
	}, 30_000);

	afterAll(() => {
		if (summary.size === 0) return;
		console.table(
			[...summary.entries()].map(([font, ops]) => ({ font: font.slice(0, 52), ...ops }))
		);
	});

	for (const font of FONTS) {
		describe(font.name, () => {
			it('parses (sniff + full table directory + fvar)', () => {
				const { sfnt, error } = getSfnt(font);
				if (error) {
					// The one legitimate decode failure is a MicroType EOT — anything
					// else is a real bug surfaced by a real font.
					expect(error, 'only MTX EOTs may refuse to decode').toMatch(/MicroType Express/);
					record(font, 'parse', 'MTX (honest error)');
					return;
				}
				const glyphs = glyphCount(sfnt!);
				expect(glyphs).toBeGreaterThan(0);
				const axes = parseFvar(sfnt!);
				for (const axis of axes) {
					expect(axis.min, `${axis.tag} min ≤ def`).toBeLessThanOrEqual(axis.def);
					expect(axis.def, `${axis.tag} def ≤ max`).toBeLessThanOrEqual(axis.max);
				}
				record(
					font,
					'parse',
					axes.length ? `ok (${glyphs}g, ${axes.length} axes)` : `ok (${glyphs}g)`
				);
			});

			it('WOFF round-trip is bit-exact', () => {
				const { sfnt } = getSfnt(font);
				if (!sfnt) return;
				const back = unwrapWoff1(wrapWoff1(sfnt));
				const src = tableBytes(sfnt);
				const out = tableBytes(back);
				expect([...out.keys()].sort()).toEqual([...src.keys()].sort());
				for (const [tag, bytes] of src) {
					expect(eq(out.get(tag)!, bytes), `table ${tag} byte-identical`).toBe(true);
				}
				record(font, 'woff', 'bit-exact');
			}, 20_000);

			it('WOFF2 round-trip preserves everything the spec lets it', () => {
				const { sfnt } = getSfnt(font);
				if (!sfnt) return;
				if (sfnt.length > WOFF2_ENCODE_CAP) {
					console.log(
						`  [cap] ${font.name}: ${sfnt.length} B > ${WOFF2_ENCODE_CAP} B — woff2 encode skipped (REAL_FONTS_FULL=1 lifts this)`
					);
					record(font, 'woff2', 'skipped (size cap)');
					return;
				}
				const back = new Uint8Array(woff2.decode(woff2.encode(sfnt)));
				const src = tableBytes(sfnt);
				const out = tableBytes(back);
				// DSIG is dropped per spec; glyf/loca/hmtx may be transform-normalized
				// and head's checksum recomputed — everything else must be verbatim.
				const normalized = new Set(['DSIG', 'glyf', 'loca', 'hmtx', 'head']);
				expect([...out.keys()].sort()).toEqual([...src.keys()].filter((t) => t !== 'DSIG').sort());
				const verbatim: string[] = [];
				for (const [tag, bytes] of src) {
					if (normalized.has(tag)) continue;
					expect(eq(out.get(tag)!, bytes), `table ${tag} byte-identical`).toBe(true);
					verbatim.push(tag);
				}
				expect(verbatim.length).toBeGreaterThan(0);
				record(font, 'woff2', `ok (${verbatim.length} tables verbatim)`);
			}, 60_000);

			it('EOT round-trip is bit-exact and reads OS/2 into the header', () => {
				const { sfnt } = getSfnt(font);
				if (!sfnt) return;
				const eot = wrapEot(sfnt);
				expect(new DataView(eot.buffer).getUint16(34, true)).toBe(0x504c);
				const os2 = findTable(sfnt, readSfnt(sfnt), 'OS/2');
				if (os2) {
					const weight = new DataView(os2.buffer, os2.byteOffset).getUint16(4);
					expect(new DataView(eot.buffer).getUint32(28, true)).toBe(weight);
				}
				expect(eq(unwrapEot(eot), sfnt)).toBe(true);
				record(font, 'eot', 'bit-exact');
			}, 20_000);

			it('subsets to Basic Latin (or honestly refuses CFF)', () => {
				const { sfnt } = getSfnt(font);
				if (!sfnt) return;
				if (readSfnt(sfnt).flavor === SFNT_OTTO) {
					expect(() =>
						subsetSfnt(hb, sfnt, { codepoints: LATIN, keepHinting: true, pinAxes: null })
					).toThrow(/PostScript \(CFF\)/);
					record(font, 'subset', 'CFF refused (honest)');
					return;
				}
				const before = glyphCount(sfnt);
				const out = subsetSfnt(hb, sfnt, { codepoints: LATIN, keepHinting: true, pinAxes: null });
				const after = glyphCount(out.bytes);
				expect(after).toBeGreaterThanOrEqual(1);
				expect(after).toBeLessThanOrEqual(before);
				// keep-everything with nothing to strip/pin is a byte-identical no-op
				// (deliberately avoids hb — its retain-all path traps on some VFs)
				const kept = subsetSfnt(hb, sfnt, { codepoints: null, keepHinting: true, pinAxes: null });
				expect(eq(kept.bytes, sfnt)).toBe(true);
				// stripping hinting drops the instruction tables when present
				const stripped = subsetSfnt(hb, sfnt, {
					codepoints: LATIN,
					keepHinting: false,
					pinAxes: null
				});
				const strippedTags = new Set(readSfnt(stripped.bytes).tables.map((t) => t.tag));
				for (const tag of ['fpgm', 'prep', 'cvt ']) {
					expect(strippedTags.has(tag), `${tag} gone after NO_HINTING`).toBe(false);
				}
				record(font, 'subset', `ok (${before}→${after}g)`);
			}, 30_000);

			it('instances variable fonts (static output, axes gone)', () => {
				const { sfnt } = getSfnt(font);
				if (!sfnt) return;
				if (readSfnt(sfnt).flavor === SFNT_OTTO) return; // covered by the CFF refusal above
				const axes = parseFvar(sfnt);
				if (axes.length === 0) {
					// Static font: an instance request must degrade gracefully.
					const out = subsetSfnt(hb, sfnt, { codepoints: null, keepHinting: true, pinAxes: {} });
					expect(out.pinned).toBe(false);
					record(font, 'instance', 'static (no-op, honest)');
					return;
				}
				const before = glyphCount(sfnt);
				// @ defaults…
				const atDefault = subsetSfnt(hb, sfnt, {
					codepoints: null,
					keepHinting: true,
					pinAxes: {}
				});
				expect(atDefault.pinned).toBe(true);
				const defaultTags = new Set(readSfnt(atDefault.bytes).tables.map((t) => t.tag));
				for (const tag of ['fvar', 'gvar', 'avar']) {
					expect(defaultTags.has(tag), `${tag} gone after instancing`).toBe(false);
				}
				expect(glyphCount(atDefault.bytes)).toBe(before);
				// …and @ wght max (or the first axis's max when wght is absent).
				const pin = axes.find((a) => a.tag === 'wght') ?? axes[0];
				const atMax = subsetSfnt(hb, sfnt, {
					codepoints: null,
					keepHinting: true,
					pinAxes: { [pin.tag]: pin.max }
				});
				expect(atMax.pinned).toBe(true);
				expect(readSfnt(atMax.bytes).tables.some((t) => t.tag === 'fvar')).toBe(false);
				// keep-variable subsetting must NOT drop the axes.
				const keep = subsetSfnt(hb, sfnt, { codepoints: LATIN, keepHinting: true, pinAxes: null });
				expect(readSfnt(keep.bytes).tables.some((t) => t.tag === 'fvar')).toBe(true);
				record(font, 'instance', `ok (${axes.map((a) => a.tag).join('/')})`);
			}, 60_000);
		});
	}
});
