/**
 * Named unicode ranges for the subset tool. Deliberately small and honest:
 * digits and ASCII punctuation live inside Basic Latin (no lying "Numbers"
 * pill), and CJK is left to the custom-text box — its ranges are per-language
 * and huge. Shared by FontControls (pills) and the codec (codepoint set).
 */

export interface SubsetPreset {
	id: string;
	label: string;
	/** Inclusive codepoint ranges. */
	ranges: [number, number][];
}

export const SUBSET_PRESETS: SubsetPreset[] = [
	// A–Z, a–z, digits, ASCII punctuation & space.
	{ id: 'basic-latin', label: 'Basic Latin', ranges: [[0x20, 0x7e]] },
	// Western European accents + common signs: é ü ñ ç £ © °.
	{ id: 'latin-1', label: 'Latin-1 accents', ranges: [[0xa0, 0xff]] },
	// Ext-A+B (Central European, Baltic, Turkish…) + Additional (Vietnamese).
	{
		id: 'latin-ext',
		label: 'Latin Extended',
		ranges: [
			[0x100, 0x24f],
			[0x1e00, 0x1eff]
		]
	},
	{ id: 'cyrillic', label: 'Cyrillic', ranges: [[0x400, 0x4ff]] },
	{ id: 'greek', label: 'Greek', ranges: [[0x370, 0x3ff]] },
	// Smart quotes/dashes/ellipsis, currency block (€ ₹ ₿), letterlike (™ №), minus.
	{
		id: 'punct-symbols',
		label: 'Punctuation & symbols',
		ranges: [
			[0x2000, 0x206f],
			[0x20a0, 0x20cf],
			[0x2100, 0x214f],
			[0x2212, 0x2212]
		]
	}
];

export const SUBSET_PRESET_IDS = new Set(SUBSET_PRESETS.map((p) => p.id));

/**
 * The codepoint set a subset run keeps: preset ranges ∪ custom text, space
 * always included (a font whose space is missing breaks everywhere). Returns
 * null when nothing is selected — the run then keeps EVERY glyph, which is
 * what pure instancing/repackaging (/variable-font-to-static) wants.
 */
export function collectCodepoints(presetIds: string[], text: string): Uint32Array | null {
	if (presetIds.length === 0 && text.trim() === '') return null;
	const set = new Set<number>([0x20]);
	for (const preset of SUBSET_PRESETS) {
		if (!presetIds.includes(preset.id)) continue;
		for (const [from, to] of preset.ranges) {
			for (let cp = from; cp <= to; cp++) set.add(cp);
		}
	}
	// String iteration is by code point — surrogate pairs arrive whole.
	for (const ch of text) set.add(ch.codePointAt(0)!);
	return Uint32Array.from([...set].sort((a, b) => a - b));
}
