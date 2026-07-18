/**
 * Cache a wasm-module load while it is pending or fulfilled — but NOT after a
 * rejection. The old `ready ??= load()` pattern kept a rejected promise in
 * worker module scope forever: one flaky wasm fetch (train wifi, offline SW
 * cache miss) bricked that codec until a full page reload, because the pooled
 * worker instance survives handled per-file errors. icodec itself caches only
 * on success (`??= await load()`), so this makes the worker-side cache match.
 */
export function wasmReady(load: () => Promise<unknown>): () => Promise<unknown> {
	let ready: Promise<unknown> | null = null;
	return () => {
		ready ??= load().catch((error: unknown) => {
			ready = null; // next call starts a fresh load
			throw error;
		});
		return ready;
	};
}
