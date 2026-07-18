import type LibRaw from 'libraw-wasm';
import type { LibRawSettings } from 'libraw-wasm';
import type { PredecodedPixels } from '$lib/workers/protocol';

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

export async function decodeRaw(file: File, signal?: AbortSignal): Promise<PredecodedPixels> {
	signal?.throwIfAborted();
	const raw = await getEngine();
	// Terminating the worker is the only way to interrupt a running demosaic;
	// the next decode spawns a fresh engine via the self-resetting memo.
	const onAbort = () => disposeEngine();
	signal?.addEventListener('abort', onAbort, { once: true });
	try {
		await raw.open(new Uint8Array(await file.arrayBuffer()), RAW_OPEN_SETTINGS);
		const img = await raw.imageData();
		if (!img || !img.width || !(img.data instanceof Uint8Array)) {
			throw new Error('This RAW file could not be decoded');
		}
		if (img.colors !== 3 && img.colors !== 4) {
			throw new Error(`Unsupported RAW channel count (${img.colors})`);
		}
		return {
			data: img.data.buffer as ArrayBuffer,
			width: img.width,
			height: img.height,
			channels: img.colors
		};
	} finally {
		signal?.removeEventListener('abort', onAbort);
	}
}
