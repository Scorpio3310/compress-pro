import { readSfnt, SFNT_OTTO } from './sfnt';

/**
 * Raw-exports driver for harfbuzzjs's harfbuzz-subset.wasm (no JS glue — the
 * module instantiates with no imports; every call below is a wasm export).
 * Sequence follows the package's own examples/harfbuzz-subset.example.node.js.
 * Runs identically in the font worker and in node (vitest).
 */

export interface HbExports {
	memory: WebAssembly.Memory;
	malloc(size: number): number;
	free(ptr: number): void;
	hb_blob_create(
		data: number,
		length: number,
		mode: number,
		userData: number,
		destroy: number
	): number;
	hb_blob_destroy(blob: number): void;
	hb_blob_get_data(blob: number, length: number): number;
	hb_blob_get_length(blob: number): number;
	hb_face_create(blob: number, index: number): number;
	hb_face_destroy(face: number): void;
	hb_face_reference_blob(face: number): number;
	hb_set_add(set: number, codepoint: number): void;
	hb_subset_input_create_or_fail(): number;
	hb_subset_input_destroy(input: number): void;
	hb_subset_input_keep_everything(input: number): void;
	hb_subset_input_set_flags(input: number, flags: number): void;
	hb_subset_input_unicode_set(input: number): number;
	hb_subset_input_pin_all_axes_to_default(input: number, face: number): number;
	hb_subset_input_pin_axis_location(
		input: number,
		face: number,
		tag: number,
		value: number
	): number;
	hb_subset_or_fail(face: number, input: number): number;
}

export const HB_SUBSET_FLAGS_NO_HINTING = 0x1;

/** OpenType tag: 4 ASCII chars as a big-endian u32 ('wght', 'wdth', …). */
export function hbTag(tag: string): number {
	return (
		((tag.charCodeAt(0) << 24) |
			(tag.charCodeAt(1) << 16) |
			(tag.charCodeAt(2) << 8) |
			tag.charCodeAt(3)) >>>
		0
	);
}

export interface SubsetOptions {
	/** Sorted unique codepoints to keep; null = keep every glyph. */
	codepoints: Uint32Array | null;
	keepHinting: boolean;
	/** tag → user-coords value. Non-null pins ALL axes (unlisted → default),
	 *  which makes HarfBuzz emit a static font (fvar/gvar/avar dropped). */
	pinAxes: Record<string, number> | null;
}

export interface SubsetResult {
	bytes: Uint8Array;
	/** Whether axes were actually pinned — false on non-variable fonts
	 *  (hb_subset_input_pin_all_axes_to_default returns 0 there). */
	pinned: boolean;
}

const FAILED =
	'Subsetting failed — the font may be corrupted or use features HarfBuzz cannot subset';
// Measured (2026-07-13): this minimal hb build has no CFF subsetter — it
// silently DROPS the CFF table (outline-less output), and the passthrough+
// retain-gids workaround yields an inconsistent maxp. Refusing is the only
// honest option; real-world web/variable fonts are overwhelmingly glyf.
const CFF_UNSUPPORTED =
	'This font has PostScript (CFF) outlines, which the browser subsetter cannot process — ' +
	'TrueType-flavored fonts (.ttf, .woff/.woff2 with TrueType outlines) work';

/** sfnt in → subset/instanced sfnt out. Outlines/tables are HarfBuzz's business;
 *  container packaging (woff/woff2/eot) stays with the existing font codecs. */
export function subsetSfnt(hb: HbExports, sfnt: Uint8Array, opts: SubsetOptions): SubsetResult {
	if (readSfnt(sfnt).flavor === SFNT_OTTO) throw new Error(CFF_UNSUPPORTED);
	// Keep-everything with nothing to strip or pin is a pure no-op — skip hb
	// entirely. Beyond being free, this dodges a measured wasm trap: this hb
	// build crashes on retain-all-glyphs runs of some large variable fonts
	// (Google Sans VF, 7.4k glyphs × 3 axes) unless axes are being pinned.
	if (opts.codepoints === null && opts.pinAxes === null && opts.keepHinting) {
		return { bytes: sfnt.slice(), pinned: false };
	}
	// memory.grow detaches earlier views — always read the heap fresh.
	const heap = () => new Uint8Array(hb.memory.buffer);

	const ptr = hb.malloc(sfnt.byteLength);
	heap().set(sfnt, ptr);
	let face = 0;
	let input = 0;
	let subset = 0;
	let resultBlob = 0;
	try {
		const blob = hb.hb_blob_create(ptr, sfnt.byteLength, 2 /* HB_MEMORY_MODE_WRITABLE */, 0, 0);
		face = hb.hb_face_create(blob, 0);
		hb.hb_blob_destroy(blob);

		input = hb.hb_subset_input_create_or_fail();
		if (!input) throw new Error(FAILED);

		if (opts.codepoints === null) {
			hb.hb_subset_input_keep_everything(input);
		} else {
			const unicodes = hb.hb_subset_input_unicode_set(input);
			// This build exports no hb_set_add_range — one codepoint at a time.
			for (const cp of opts.codepoints) hb.hb_set_add(unicodes, cp);
		}
		// After keep_everything, which resets flags.
		if (!opts.keepHinting) hb.hb_subset_input_set_flags(input, HB_SUBSET_FLAGS_NO_HINTING);

		let pinned = false;
		if (opts.pinAxes !== null) {
			// Default-pin everything first; explicit values then override. hb
			// clamps out-of-range values to the axis bounds itself. Returns 0
			// on non-variable fonts — the run proceeds, just not instanced.
			pinned = hb.hb_subset_input_pin_all_axes_to_default(input, face) !== 0;
			if (pinned) {
				for (const [tag, value] of Object.entries(opts.pinAxes)) {
					hb.hb_subset_input_pin_axis_location(input, face, hbTag(tag), value);
				}
			}
		}

		subset = hb.hb_subset_or_fail(face, input);
		if (!subset) throw new Error(FAILED);

		resultBlob = hb.hb_face_reference_blob(subset);
		const offset = hb.hb_blob_get_data(resultBlob, 0);
		const length = hb.hb_blob_get_length(resultBlob);
		if (!offset || !length) throw new Error(FAILED);
		// Copy out — the heap gets reused/freed the moment we return.
		return { bytes: heap().slice(offset, offset + length), pinned };
	} finally {
		if (resultBlob) hb.hb_blob_destroy(resultBlob);
		if (subset) hb.hb_face_destroy(subset);
		if (input) hb.hb_subset_input_destroy(input);
		if (face) hb.hb_face_destroy(face);
		hb.free(ptr);
	}
}
