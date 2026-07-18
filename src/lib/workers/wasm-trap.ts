/**
 * Trap recovery for memoized wasm-bindgen workers (vtracer). A trap — 32-bit
 * heap OOM abort, Rust panic → 'unreachable' — poisons the instance heap, and
 * wasm-bindgen's init()/initSync() early-return once `wasm` is set, so
 * re-initializing inside the same worker only hands the SAME broken instance
 * back. The only real reset is a fresh worker: report the job's failure with
 * an honest message first, then crash this worker so the rpc pool's uncaught-
 * error path (rpc.ts fail()) drops the instance and the next job starts
 * healthy — the font worker's resetHb() is the sibling precedent for wasm
 * engines whose glue CAN swap instances.
 */

export function isWasmTrap(error: unknown): boolean {
	// Rust aborts surface as WebAssembly.RuntimeError ('unreachable executed');
	// wasm-bindgen glue also rethrows non-Error values from a poisoned
	// instance ('null pointer passed to rust', bare numbers).
	return error instanceof WebAssembly.RuntimeError || !(error instanceof Error);
}

/** Deferred uncaught throw: fires the worker's global error event on a
 *  macrotask, AFTER the already-posted job response has left this thread. */
function crashWorker(error: Error): void {
	setTimeout(() => {
		throw error;
	}, 0);
}

/**
 * Runs one synchronous wasm call. Ordinary Errors pass through; a trap
 * schedules the worker self-crash (pool replacement) and throws `trapMessage`
 * so THIS job still fails with something a person can act on instead of
 * 'unreachable executed'.
 */
export function runTrapGuarded<T>(
	job: () => T,
	trapMessage: string,
	crash: (error: Error) => void = crashWorker
): T {
	try {
		return job();
	} catch (error) {
		if (!isWasmTrap(error)) throw error;
		crash(new Error('wasm trapped — discarding this worker instance', { cause: error }));
		throw new Error(trapMessage, { cause: error });
	}
}
