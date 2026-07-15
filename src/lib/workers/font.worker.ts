import woff2WasmUrl from 'fonteditor-core/woff2/woff2.wasm?url';
import hbWasmUrl from 'harfbuzzjs/dist/harfbuzz-subset.wasm?url';
import type { WorkerContracts } from './protocol';
import { expose } from './host';
import type { FontFormat } from '$lib/types';
import { sniffFont, type FontSniff } from '$lib/codecs/font-sniff';
import { findTable, readSfnt } from '$lib/codecs/sfnt';
import { unwrapWoff1, wrapWoff1 } from '$lib/codecs/woff1';
import { unwrapEot, wrapEot } from '$lib/codecs/eot';
import { parseFvar } from '$lib/codecs/fvar';
import { subsetSfnt, type HbExports } from '$lib/codecs/hb-subset';

/**
 * Conversion here is raw repackaging around the SAME sfnt table bytes —
 * unwrap the source container, wrap the target one. Outlines are never
 * converted: a 'ttf'/'otf' request follows the actual sfnt flavor (with a
 * note) instead of running a lossy cubic↔quadratic approximation. The only
 * codec involved is Google's woff2 (Brotli), which is content-lossless: on
 * TTF it may normalize glyf padding/flags and it drops DSIG per spec.
 * The subset op additionally runs HarfBuzz's subsetter/instancer between
 * unwrap and wrap — the one deliberate content change in the pipeline.
 */

interface Woff2 {
	init(wasmUrl: string): Promise<unknown>;
	encode(buffer: Uint8Array | ArrayBuffer): Uint8Array;
	decode(buffer: Uint8Array | ArrayBuffer): Uint8Array;
	/** pnpm-patched addition — drops the emscripten instance (see patches/). */
	dispose(): void;
}

let woff2Promise: Promise<Woff2> | null = null;

// Everyday webfonts are well under 2 MB; past this the job's working set
// (brotli-q11 window on encode, the decompressed sfnt on decode) has grown
// the emscripten heap in power-of-two steps that NEVER shrink — and the
// worker is pooled for the whole session. Same rationale as the archive
// worker's fresh-instance-per-run: release the heap between huge jobs.
const WOFF2_RELEASE_BYTES = 8 * 1024 * 1024;

/** Drop the woff2 instance after a huge job so its heap high-water is
 *  released; the next job re-inits (HTTP-cached fetch + ~712 KB recompile —
 *  milliseconds, and only ever paid right after a multi-second encode). */
function releaseWoff2IfHuge(woff2: Woff2, ...byteSizes: number[]): void {
	if (Math.max(...byteSizes) <= WOFF2_RELEASE_BYTES) return;
	woff2.dispose();
	woff2Promise = null;
}

/** Lazy: the ~710 KB wasm (+ CJS glue) loads only when a woff2 endpoint is hit. */
function getWoff2(): Promise<Woff2> {
	woff2Promise ??= (async () => {
		// fonteditor-core sniffs browser-vs-node via `typeof window` — a worker
		// has neither, and the node path would try fs. The shim is scoped to
		// this single-purpose worker.
		(globalThis as { window?: unknown }).window ??= globalThis;
		// unknown hop: dispose() is a pnpm-patched addition the shipped d.ts lacks.
		const mod = (await import('fonteditor-core/woff2')).default as unknown as Woff2;
		await mod.init(woff2WasmUrl);
		return mod;
	})().catch((error) => {
		// A transient chunk/wasm fetch failure must not brick every later
		// woff2 job in the session (same rule as the video worker's encoders).
		woff2Promise = null;
		throw error;
	});
	return woff2Promise;
}

let hbModulePromise: Promise<WebAssembly.Module> | null = null;
let hbInstancePromise: Promise<HbExports> | null = null;

/** Lazy: the ~500 KB HarfBuzz subsetter loads only for the subset op. The
 *  compiled module is kept forever; the INSTANCE is disposable — a wasm trap
 *  leaves its heap corrupted, so resetHb() swaps in a fresh one (cheap:
 *  instantiation only, no recompile). */
function getHb(): Promise<HbExports> {
	hbModulePromise ??= (async () => {
		try {
			return await WebAssembly.compileStreaming(fetch(hbWasmUrl));
		} catch {
			// Fallback when the server didn't send application/wasm.
			return WebAssembly.compile(await (await fetch(hbWasmUrl)).arrayBuffer());
		}
	})().catch((error) => {
		// Reset on failure or an offline blip poisons every later subset —
		// the inner catch above only covers the MIME fallback, not the network.
		hbModulePromise = null;
		throw error;
	});
	hbInstancePromise ??= hbModulePromise
		.then(
			async (module) =>
				// Standalone build — instantiates with no imports object.
				(await WebAssembly.instantiate(module)).exports as unknown as HbExports
		)
		.catch((error) => {
			hbInstancePromise = null;
			throw error;
		});
	return hbInstancePromise;
}

function resetHb(): void {
	hbInstancePromise = null;
}

/** The container an sfnt buffer should be labeled as (the flavor rule). */
function sfntContainer(sfnt: Uint8Array): 'ttf' | 'otf' {
	return readSfnt(sfnt).flavor === 0x4f54544f ? 'otf' : 'ttf';
}

function hasDsig(sfnt: Uint8Array): boolean {
	return readSfnt(sfnt).tables.some((t) => t.tag === 'DSIG');
}

/** maxp numGlyphs — the honest "kept N of M glyphs" numerator/denominator. */
function glyphCountOf(sfnt: Uint8Array): number | null {
	const maxp = findTable(sfnt, readSfnt(sfnt), 'maxp');
	if (!maxp || maxp.length < 6) return null;
	return new DataView(maxp.buffer, maxp.byteOffset).getUint16(4);
}

function sniffOrThrow(bytes: Uint8Array): FontSniff & { container: FontFormat } {
	const sniff = sniffFont(bytes);
	if (!sniff) {
		throw new Error("This file doesn't look like a font — expected TTF, OTF, WOFF, WOFF2 or EOT");
	}
	if (sniff.container === 'ttc') {
		throw new Error(
			'Font collections (.ttc) contain several fonts in one file and are not supported — ' +
				'extract a single font first'
		);
	}
	// Magic bytes alone accept a truncated/lying file — validate the whole
	// table directory up front so corrupt input fails on EVERY target,
	// the ttf→ttf passthrough included.
	if (sniff.container === 'ttf' || sniff.container === 'otf') readSfnt(bytes);
	return sniff as FontSniff & { container: FontFormat };
}

async function toSfnt(bytes: Uint8Array, container: FontFormat): Promise<Uint8Array> {
	switch (container) {
		case 'woff':
			return unwrapWoff1(bytes);
		case 'woff2': {
			const woff2 = await getWoff2();
			const sfnt = woff2.decode(bytes);
			releaseWoff2IfHuge(woff2, bytes.byteLength, sfnt?.length ?? 0);
			if (!sfnt?.length) throw new Error('WOFF2 decoding failed — the file may be corrupted');
			return sfnt;
		}
		case 'eot':
			return unwrapEot(bytes);
		default:
			return bytes; // already sfnt
	}
}

function flavorNote(actual: 'ttf' | 'otf'): string {
	return actual === 'otf'
		? 'This font has CFF (PostScript) outlines — saved as .otf to keep it lossless'
		: 'This font has TrueType outlines — saved as .ttf to keep it lossless';
}

/** sfnt → target container (the shared encode tail of both ops). */
async function packageSfnt(
	sfnt: Uint8Array,
	to: FontFormat
): Promise<{ bytes: Uint8Array; outputFormat: FontFormat; note: string | null }> {
	if (to === 'ttf' || to === 'otf') {
		const outputFormat = sfntContainer(sfnt);
		return {
			bytes: sfnt,
			outputFormat,
			note: outputFormat !== to ? flavorNote(outputFormat) : null
		};
	}
	if (to === 'woff') {
		return { bytes: wrapWoff1(sfnt), outputFormat: 'woff', note: null };
	}
	if (to === 'woff2') {
		const note = hasDsig(sfnt)
			? 'Digital signature (DSIG) removed — the WOFF2 spec requires it'
			: null;
		const woff2 = await getWoff2();
		const bytes = woff2.encode(sfnt);
		releaseWoff2IfHuge(woff2, sfnt.byteLength, bytes?.length ?? 0);
		if (!bytes?.length) throw new Error('WOFF2 encoding failed — the file may be corrupted');
		return { bytes, outputFormat: 'woff2', note };
	}
	return { bytes: wrapEot(sfnt), outputFormat: 'eot', note: null };
}

/** input came in as a transferred buffer; hand a tight copy straight back. */
function toTransfer(out: Uint8Array): ArrayBuffer {
	return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

const joinNotes = (...notes: (string | null)[]) => notes.filter(Boolean).join(' · ') || null;

expose<WorkerContracts['font']>({
	convert: async ({ bytes, to }) => {
		const input = new Uint8Array(bytes);
		const sourceFormat = sniffOrThrow(input).container;

		const wantsSfnt = to === 'ttf' || to === 'otf';
		const isSfntSource = sourceFormat === 'ttf' || sourceFormat === 'otf';

		let out: Uint8Array;
		let outputFormat: FontFormat;
		let note: string | null = null;
		if (to === sourceFormat || (wantsSfnt && isSfntSource)) {
			// Passthrough — also the flavor rule's trivial case (ttf→otf request
			// on an sfnt source returns the source container unchanged).
			out = input;
			outputFormat = sourceFormat;
			if (wantsSfnt && outputFormat !== to) note = flavorNote(outputFormat as 'ttf' | 'otf');
		} else {
			const packaged = await packageSfnt(await toSfnt(input, sourceFormat), to);
			out = packaged.bytes;
			outputFormat = packaged.outputFormat;
			note = packaged.note;
		}

		const buffer = toTransfer(out);
		return {
			result: { bytes: buffer, outputFormat, sourceFormat, note },
			transfer: [buffer]
		};
	},

	subset: async ({ bytes, to, codepoints, keepHinting, pinAxes }) => {
		const input = new Uint8Array(bytes);
		const sourceFormat = sniffOrThrow(input).container;
		const sfnt = await toSfnt(input, sourceFormat);
		const glyphsBefore = glyphCountOf(sfnt);

		// Pins apply per font: prune to THIS font's axes so a mixed batch works;
		// a static font just skips instancing (subsetSfnt reports pinned=false).
		let prunedPins: Record<string, number> | null = null;
		let pinNote: string | null = null;
		if (pinAxes !== null) {
			const axes = parseFvar(sfnt);
			if (axes.length === 0) {
				pinNote = 'Not a variable font — kept as-is';
			} else {
				prunedPins = Object.fromEntries(
					Object.entries(pinAxes).filter(([tag]) => axes.some((axis) => axis.tag === tag))
				);
			}
		}

		const hb = await getHb();
		let result;
		try {
			result = subsetSfnt(hb, sfnt, { codepoints, keepHinting, pinAxes: prunedPins });
		} catch (error) {
			// A wasm trap (seen with retain-all runs on some huge variable fonts)
			// poisons the instance heap — swap it out so the NEXT file gets a
			// healthy subsetter, and fail just this file with an honest message.
			if (error instanceof WebAssembly.RuntimeError) {
				resetHb();
				throw new Error(
					'The subsetter crashed on this font — it may use features the browser build ' +
						'cannot process. Other files are unaffected; try a character-set subset instead',
					{ cause: error }
				);
			}
			throw error;
		}
		const glyphsAfter = glyphCountOf(result.bytes);
		const packaged = await packageSfnt(result.bytes, to);

		const buffer = toTransfer(packaged.bytes);
		return {
			result: {
				bytes: buffer,
				outputFormat: packaged.outputFormat,
				sourceFormat,
				note: joinNotes(pinNote, packaged.note),
				glyphsBefore,
				glyphsAfter,
				instanced: result.pinned
			},
			transfer: [buffer]
		};
	},

	probe: async ({ bytes }) => {
		const input = new Uint8Array(bytes);
		const sniff = sniffOrThrow(input);
		const sfnt = await toSfnt(input, sniff.container);
		return {
			result: {
				container: sniff.container,
				axes: parseFvar(sfnt),
				glyphCount: glyphCountOf(sfnt)
			}
		};
	}
});
