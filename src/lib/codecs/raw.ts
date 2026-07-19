import type LibRaw from 'libraw-wasm';
import type { LibRawSettings } from 'libraw-wasm';
import type { PredecodedPixels } from '$lib/workers/protocol';
import { buildExifTiffFromRaw, type RawExifSource } from './exif-build';

/** Decoded RAW pixels plus the EXIF rebuilt from LibRaw metadata (null when
 *  the file exposed none). The TIFF stays on the main thread — the worker
 *  protocol carries pixels only; image.ts splices after encode. */
export interface RawDecodedPixels extends PredecodedPixels {
	exifTiff: Uint8Array | null;
}

/**
 * Camera RAW decode (CR2/NEF/ARW/DNG/RAF/RW2/ORF) via LibRaw. The package is
 * used as designed: its own module worker (plus emscripten pthread
 * sub-workers) does the demosaic off the main thread, and calls on one
 * instance queue internally — concurrent files serialize on the decoder
 * naturally. The decoded RGB frame then rides the ordinary image pipeline as
 * a `predecoded` payload; RAW bytes never enter the image worker (they carry
 * TIFF magic and would confuse its sniffing).
 *
 * Develop settings: sRGB, 8-bit, orientation applied — this is a converter,
 * not a raw developer. The one non-default we MUST set is useCameraWb:
 * libraw-wasm defaults to LibRaw's `-w` OFF, i.e. fixed daylight multipliers,
 * which ships every tungsten/fluorescent-lit shot with a heavy orange/green
 * cast. As-shot WB is what the camera's own preview and every converter use;
 * when a file carries no as-shot multipliers LibRaw falls back by itself.
 */

/** Single source of truth for the develop — the fixture generator mirrors it
 *  (scripts/generate-fixtures.mjs, raw-dng-ref.png twin) and raw.test.ts
 *  proves its wasm-level effect. */
export const RAW_OPEN_SETTINGS: LibRawSettings = { outputBps: 8, useCameraWb: true };

let engine: Promise<LibRaw> | null = null;

// The libraw worker is ONE shared instance and open()/imageData() are two
// separate awaited round-trips. Concurrent image-lane files (imageLaneCap up
// to 4) would otherwise interleave — file B's open landing between file A's
// open and imageData, so A reads B's pixels (quality sweep F-71). Serialize
// the open→imageData transaction on a promise chain so each decode is atomic.
let decodeChain: Promise<unknown> = Promise.resolve();

function getEngine(): Promise<LibRaw> {
	engine ??= import('libraw-wasm')
		.then((m) => new m.default())
		.catch((error) => {
			engine = null;
			throw error;
		});
	return engine;
}

/** Tear down the decoder worker (aborts reject in-flight opens). */
function disposeEngine(): void {
	const current = engine;
	engine = null;
	current?.then((raw) => raw.dispose()).catch(() => {});
}

export async function decodeRaw(file: File, signal?: AbortSignal): Promise<RawDecodedPixels> {
	signal?.throwIfAborted();
	// Read the bytes BEFORE claiming the decode slot — I/O need not serialize,
	// only the shared-engine open→imageData transaction must.
	const bytes = new Uint8Array(await file.arrayBuffer());
	const run = decodeChain.then(async () => {
		signal?.throwIfAborted();
		const raw = await getEngine();
		// Terminating the worker is the only way to interrupt a running demosaic;
		// the next decode spawns a fresh engine via the self-resetting memo.
		const onAbort = () => disposeEngine();
		signal?.addEventListener('abort', onAbort, { once: true });
		try {
			await raw.open(bytes, RAW_OPEN_SETTINGS);
			const img = await raw.imageData();
			if (!img || !img.width || !(img.data instanceof Uint8Array)) {
				throw new Error('This RAW file could not be decoded');
			}
			if (img.colors !== 3 && img.colors !== 4) {
				throw new Error(`Unsupported RAW channel count (${img.colors})`);
			}
			// Camera metadata → minimal EXIF TIFF (O-03). Best-effort: a RAW
			// whose metadata call fails still decodes — the toggle then shows
			// the honest "not kept" note instead of sinking the file.
			let exifTiff: Uint8Array | null = null;
			try {
				exifTiff = buildExifTiffFromRaw((await raw.metadata()) as RawExifSource | undefined);
			} catch {
				// metadata is optional; pixels are the product
			}
			return {
				data: img.data.buffer as ArrayBuffer,
				width: img.width,
				height: img.height,
				channels: img.colors,
				exifTiff
			} satisfies RawDecodedPixels;
		} finally {
			signal?.removeEventListener('abort', onAbort);
		}
	});
	// Keep the chain alive even when this decode rejects, so a failed file never
	// wedges the queue for the ones behind it.
	decodeChain = run.catch(() => {});
	return run;
}
