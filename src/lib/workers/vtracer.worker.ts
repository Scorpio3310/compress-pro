import vtracerWasmUrl from 'vtracer-wasm/vtracer.wasm?url';
import init, { to_svg } from 'vtracer-wasm';
import { vectorizeTraceSize } from '$lib/codecs/vectorize-limits';
import type { WorkerContracts } from './protocol';
import { expose } from './host';
import { runTrapGuarded } from './wasm-trap';

/**
 * Raster → SVG vectorization (visioncortex vtracer, wasm-bindgen web build).
 * The wasm inits once per worker — memoized with a self-reset on failure so an
 * offline blip can't poison later jobs (icodec `ready ??=` pattern). Each job
 * decodes the raster HERE (createImageBitmap works in workers; unlike
 * svg-raster's DOM-bound reverse direction), downscales to the trace ceiling
 * (vectorize-limits — a full-res photo would grind the synchronous to_svg for
 * minutes), and makes one to_svg call under the trap guard: a wasm abort
 * cannot be healed in-place (init() memoizes), so the guard fails the job
 * honestly and self-crashes the worker for the pool to replace.
 */

let ready: Promise<unknown> | null = null;

function getEngine(): Promise<unknown> {
	ready ??= init({ module_or_path: vtracerWasmUrl }).catch((error) => {
		ready = null;
		throw error;
	});
	return ready;
}

// Spawn == warm: start the wasm fetch+compile the moment the worker exists,
// so the file-drop warm-up hides the download behind think time.
getEngine().catch(() => {});

expose<WorkerContracts['vtracer']>({
	vectorize: async ({ file, config }) => {
		await getEngine();
		const bitmap = await createImageBitmap(file);
		try {
			const { width, height } = vectorizeTraceSize(bitmap.width, bitmap.height);
			const canvas = new OffscreenCanvas(width, height);
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Could not decode the image for vectorization');
			ctx.drawImage(bitmap, 0, 0, width, height);
			const pixels = ctx.getImageData(0, 0, width, height);
			const svg = runTrapGuarded(
				() =>
					to_svg(
						new Uint8Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength),
						pixels.width,
						pixels.height,
						config
					),
				'Not enough memory to vectorize this image — try a smaller image or a lower detail'
			);
			if (!svg.includes('<svg')) throw new Error('Vectorization produced no SVG output');
			return { result: svg };
		} finally {
			bitmap.close();
		}
	}
});
