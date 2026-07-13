import { describe, expect, it } from 'vitest';
import { collectCodepoints, SUBSET_PRESETS } from './subset-charsets';

describe('collectCodepoints', () => {
	it('returns null when nothing is selected (= keep every glyph)', () => {
		expect(collectCodepoints([], '')).toBeNull();
		expect(collectCodepoints([], '   ')).toBeNull(); // whitespace-only counts as empty…
	});

	it('unions presets with custom text, deduped and sorted', () => {
		const cps = collectCodepoints(['basic-latin'], 'Aé')!;
		const list = [...cps];
		expect(list).toContain(0x41); // A (also in the preset — deduped)
		expect(list).toContain(0xe9); // é from text only
		expect(list.filter((c) => c === 0x41)).toHaveLength(1);
		expect([...list].sort((a, b) => a - b)).toEqual(list); // ascending
	});

	it('always includes the space, even from text-only input', () => {
		expect([...collectCodepoints([], 'A')!]).toContain(0x20);
	});

	it('iterates text by code point (surrogate pairs stay whole)', () => {
		expect([...collectCodepoints([], '𝕏')!]).toContain(0x1d54f);
	});

	it('covers every preset range end-to-end', () => {
		for (const preset of SUBSET_PRESETS) {
			const cps = new Set(collectCodepoints([preset.id], '')!);
			for (const [from, to] of preset.ranges) {
				expect(cps.has(from), `${preset.id} start`).toBe(true);
				expect(cps.has(to), `${preset.id} end`).toBe(true);
			}
		}
	});

	it('ignores unknown preset ids (only the forced space remains)', () => {
		expect([...collectCodepoints(['nope'], '')!]).toEqual([0x20]);
	});
});
