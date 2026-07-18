import { describe, expect, it, vi } from 'vitest';
import type { ImageCompressionSettings } from '$lib/types';
import { compressImage, downscaleRungs, isAnimatedInput, isHeicSequence } from './image';

// compressImage-level tests (truncated GIF guard, RAW metadata note) must not
// spin up a real Worker — Node has none. The mock returns a minimal successful
// EncodeResult; tests that never reach the worker are unaffected.
vi.mock('$lib/workers/rpc', () => ({
	callWorker: vi.fn(async () => ({
		bytes: new ArrayBuffer(8),
		resized: false,
		width: 2,
		height: 2,
		chosenFormat: 'jpg'
	}))
}));

const imageSettings = (over: Partial<ImageCompressionSettings> = {}): ImageCompressionSettings => ({
	quality: 80,
	outputFormat: 'auto',
	mode: 'quality',
	targetKb: 200,
	maxDimension: null,
	downscaleToTarget: false,
	keepMetadata: false,
	vectorMode: 'color',
	vectorDetail: 50,
	...over
});

/** Minimal ISOBMFF header: ftyp box with the given major + compatible brands. */
function ftyp(major: string, ...compatible: string[]): ArrayBuffer {
	const size = 16 + compatible.length * 4;
	const b = new Uint8Array(size);
	const view = new DataView(b.buffer);
	view.setUint32(0, size);
	const writeBrand = (off: number, brand: string) => {
		for (let i = 0; i < 4; i++) b[off + i] = brand.charCodeAt(i);
	};
	writeBrand(4, 'ftyp');
	writeBrand(8, major);
	// bytes 12-15 = minor version (zeros)
	compatible.forEach((brand, i) => writeBrand(16 + i * 4, brand));
	return b.buffer;
}

describe('isHeicSequence', () => {
	it('detects sequence major brands (msf1/avis/hevc/hevx)', () => {
		for (const brand of ['msf1', 'avis', 'hevc', 'hevx']) {
			expect(isHeicSequence(ftyp(brand))).toBe(true);
		}
	});

	it('detects a sequence brand hiding in the compatible list', () => {
		expect(isHeicSequence(ftyp('heic', 'mif1', 'msf1'))).toBe(true);
		expect(isHeicSequence(ftyp('mif1', 'heic', 'hevc'))).toBe(true);
	});

	it('leaves plain stills alone (heic/mif1/heix majors, still compatibles)', () => {
		expect(isHeicSequence(ftyp('heic'))).toBe(false);
		expect(isHeicSequence(ftyp('heic', 'mif1', 'miaf'))).toBe(false);
		expect(isHeicSequence(ftyp('mif1', 'heic', 'heix'))).toBe(false);
		expect(isHeicSequence(ftyp('avif', 'mif1'))).toBe(false);
	});

	it('rejects truncated or non-ISOBMFF bytes', () => {
		expect(isHeicSequence(new ArrayBuffer(0))).toBe(false);
		expect(isHeicSequence(new ArrayBuffer(12))).toBe(false);
		expect(isHeicSequence(ftyp('msf1').slice(0, 10))).toBe(false);
		const notFtyp = new Uint8Array(ftyp('msf1'));
		notFtyp[4] = 0x6d; // 'ftyp' → 'mtyp'
		expect(isHeicSequence(notFtyp.buffer)).toBe(false);
	});

	it('stops scanning at the declared box size', () => {
		// msf1 sits BEYOND the declared ftyp box — must not be picked up.
		const bytes = new Uint8Array(ftyp('heic', 'mif1', 'msf1'));
		new DataView(bytes.buffer).setUint32(0, 20); // box ends after 'mif1'
		expect(isHeicSequence(bytes.buffer)).toBe(false);
	});
});

describe('downscaleRungs', () => {
	it('produces strictly shrinking longest-side rungs from the scale ladder', () => {
		const rungs = downscaleRungs(4000);
		expect(rungs).toEqual([
			3600, 3200, 2800, 2400, 2000, 1680, 1400, 1200, 1000, 800, 600, 480, 400, 320
		]);
		for (let i = 1; i < rungs.length; i++) expect(rungs[i]).toBeLessThan(rungs[i - 1]);
	});

	it('floors at 320 px — smaller rungs are dropped, tiny sources get none', () => {
		expect(downscaleRungs(400)).toEqual([360, 320]);
		expect(downscaleRungs(320)).toEqual([]);
		expect(downscaleRungs(100)).toEqual([]);
	});

	it('never returns a rung at or above the source size', () => {
		for (const longest of [321, 356, 500, 1200, 12_000]) {
			for (const rung of downscaleRungs(longest)) {
				expect(rung).toBeLessThan(longest);
				expect(rung).toBeGreaterThanOrEqual(320);
			}
		}
	});

	it('deduplicates rungs that round to the same pixel size', () => {
		for (const longest of [400, 450, 800, 3000]) {
			const rungs = downscaleRungs(longest);
			expect(new Set(rungs).size).toBe(rungs.length);
		}
	});
});

// ------------------------------------------------------------ GIF structure

/** Structurally valid GIF built block by block. Frames are image descriptors;
 *  `dataBytes` lands verbatim inside the LZW data sub-block of every frame —
 *  the place a naive whole-file byte scan misreads as extension headers. */
function buildGif(opts: {
	frames: number;
	gcePerFrame?: boolean;
	globalColorTable?: boolean;
	dataBytes?: number[];
}): ArrayBuffer {
	const { frames, gcePerFrame = true, globalColorTable = false, dataBytes = [1, 2, 3] } = opts;
	const out: number[] = [];
	const ascii = (s: string) => {
		for (const ch of s) out.push(ch.charCodeAt(0));
	};
	ascii('GIF89a');
	// Logical screen descriptor: 2×2, packed flags, bg index, aspect.
	out.push(2, 0, 2, 0, globalColorTable ? 0x80 : 0x00, 0, 0);
	if (globalColorTable) for (let i = 0; i < 2 * 3; i++) out.push(i * 40); // 2-entry GCT
	for (let f = 0; f < frames; f++) {
		if (gcePerFrame) out.push(0x21, 0xf9, 0x04, 0x01, 0x0a, 0x00, 0x00, 0x00);
		out.push(0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0x00); // image descriptor, no LCT
		out.push(0x02); // LZW minimum code size
		out.push(dataBytes.length, ...dataBytes); // one data sub-block
		out.push(0x00); // block terminator
	}
	out.push(0x3b); // trailer
	return new Uint8Array(out).buffer;
}

describe('isAnimatedInput (GIF block walk)', () => {
	it('a static GIF whose LZW data contains 0x21 0xF9 is NOT animated', () => {
		// One real GCE + a sneaky byte pair inside the image data: the old
		// whole-file scan counted 2 "GCEs" and flagged a fake animation.
		const gif = buildGif({ frames: 1, dataBytes: [0x21, 0xf9, 0x21, 0xf9] });
		expect(isAnimatedInput(gif)).toBe(false);
	});

	it('a static GIF with a global color table full of sneaky pairs is NOT animated', () => {
		const gif = new Uint8Array(
			buildGif({ frames: 1, globalColorTable: true, dataBytes: [0x21, 0xf9] })
		);
		// Poison the GCT too (valid palette bytes, arbitrary values).
		gif[13] = 0x21;
		gif[14] = 0xf9;
		expect(isAnimatedInput(gif.buffer)).toBe(false);
	});

	it('a two-frame GIF IS animated', () => {
		expect(isAnimatedInput(buildGif({ frames: 2 }))).toBe(true);
		expect(isAnimatedInput(buildGif({ frames: 3, dataBytes: [0x21, 0xf9] }))).toBe(true);
	});

	it('a single-frame GIF without any GCE is NOT animated', () => {
		expect(isAnimatedInput(buildGif({ frames: 1, gcePerFrame: false }))).toBe(false);
	});

	it('truncated or garbage GIF bytes are NOT animated', () => {
		expect(isAnimatedInput(new Uint8Array([0x47, 0x49, 0x46, 0x38]).buffer)).toBe(false);
		expect(isAnimatedInput(buildGif({ frames: 2 }).slice(0, 14))).toBe(false);
	});
});

// -------------------------------------------------------- truncated GIF guard

describe('compressGifWithGifsicle input guard', () => {
	const gifSettings = imageSettings({ outputFormat: 'gif' });

	it('rejects a truncated .gif with an honest message, not a DataView RangeError', async () => {
		const file = new File([new Uint8Array(5)], 'clip.gif', { type: 'image/gif' });
		await expect(compressImage(file, gifSettings)).rejects.toThrow(/could not read this gif/i);
	});

	it('rejects an empty .gif the same way', async () => {
		const file = new File([], 'empty.gif', { type: 'image/gif' });
		await expect(compressImage(file, gifSettings)).rejects.toThrow(/could not read this gif/i);
	});

	it('rejects a mislabeled non-GIF payload the same way', async () => {
		const file = new File([new Uint8Array(64).fill(0x41)], 'fake.gif', { type: 'image/gif' });
		await expect(compressImage(file, gifSettings)).rejects.toThrow(/could not read this gif/i);
	});
});

// ------------------------------------------------------ RAW keep-metadata note

describe('RAW (predecoded) + keep metadata', () => {
	const predecoded = {
		data: new Uint8Array(2 * 2 * 3).fill(128).buffer,
		width: 2,
		height: 2,
		channels: 3 as const
	};
	const rawFile = new File([new Uint8Array(4)], 'shot.nef', { type: 'image/x-nikon-nef' });

	it('surfaces an honest "metadata not kept" note when the toggle is on', async () => {
		const result = await compressImage(
			rawFile,
			imageSettings({ outputFormat: 'jpg', keepMetadata: true }),
			undefined,
			undefined,
			undefined,
			predecoded
		);
		expect(result.info).toMatch(/metadata/i);
		expect(result.info).toMatch(/raw/i);
	});

	it('stays quiet when the toggle is off', async () => {
		const result = await compressImage(
			rawFile,
			imageSettings({ outputFormat: 'jpg', keepMetadata: false }),
			undefined,
			undefined,
			undefined,
			predecoded
		);
		expect(result.info).toBeNull();
	});
});
