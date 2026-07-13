import type { WorkerContracts, WorkerKind, WorkerRequest, WorkerResponse } from './protocol';

const factories: Record<WorkerKind, () => Worker> = {
	image: () => new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' }),
	svg: () => new Worker(new URL('./svg.worker.ts', import.meta.url), { type: 'module' }),
	gs: () => new Worker(new URL('./gs.worker.ts', import.meta.url), { type: 'module' }),
	video: () => new Worker(new URL('./video.worker.ts', import.meta.url), { type: 'module' }),
	font: () => new Worker(new URL('./font.worker.ts', import.meta.url), { type: 'module' })
};

interface Pending {
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
	onProgress?: (progress: unknown) => void;
	/** Re-arms the no-progress watchdog; every progress message calls it. */
	touchWatchdog?: () => void;
	clearWatchdog?: () => void;
	/** Identity tag for owner-scoped abortAll(); never settles the call itself. */
	owner?: AbortSignal;
}

interface Instance {
	worker: Worker;
	pending: Map<number, Pending>;
	/** Reject everything in flight, drop the instance, kill the worker. */
	fail: (error: Error) => void;
}

/**
 * No-progress watchdogs: a wedged wasm codec would otherwise hang its file
 * forever (terminate() is the only way to interrupt synchronous wasm). These
 * are deliberately generous — they catch "stuck", not "slow" — and every
 * progress message (gs pages, animated frames, video fractions) re-arms them.
 */
const IDLE_TIMEOUT_MS: Record<WorkerKind, number> = {
	image: 10 * 60_000,
	svg: 5 * 60_000,
	gs: 20 * 60_000,
	video: 10 * 60_000,
	// WOFF2 encode is synchronous brotli-q11 — sub-second for text fonts but
	// minutes for 20 MB+ CJK ones; the ceiling catches "stuck", not "slow".
	font: 10 * 60_000
};

// Image work parallelizes across a small pool; svg is cheap and gs would cost
// 15 MB of wasm per extra instance, so both stay single.
const pools = new Map<WorkerKind, Instance[]>();
let nextId = 0;

/**
 * Shared image-lane ceiling — the worker pool size and compress.ts's file
 * fan-out must agree, or lanes would queue on a smaller pool. Read lazily:
 * `navigator` doesn't exist while prerendering (callers pick the SSR
 * fallback; neither actually runs there).
 */
export function imageLaneCap(ssrFallbackCores: number): number {
	const cores =
		typeof navigator === 'undefined' ? ssrFallbackCores : (navigator.hardwareConcurrency ?? 4);
	return Math.max(1, Math.min(cores, 4));
}

function poolCap(kind: WorkerKind): number {
	return kind === 'image' ? imageLaneCap(4) : 1;
}

function spawn(kind: WorkerKind, pool: Instance[]): Instance {
	const worker = factories[kind]();
	const pending = new Map<number, Pending>();

	// An uncaught worker error poisons every in-flight call on THIS instance;
	// fail them and drop just this instance so its next call starts fresh.
	const fail = (error: Error) => {
		for (const entry of pending.values()) {
			entry.clearWatchdog?.();
			entry.reject(error);
		}
		pending.clear();
		const at = pool.indexOf(instance);
		if (at >= 0) pool.splice(at, 1);
		worker.terminate();
	};
	const instance: Instance = { worker, pending, fail };

	worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
		const message = event.data;
		const entry = pending.get(message.id);
		if (!entry) return;
		if ('progress' in message) {
			entry.touchWatchdog?.();
			entry.onProgress?.(message.progress);
			return;
		}
		pending.delete(message.id);
		entry.clearWatchdog?.();
		if (message.ok) entry.resolve(message.result);
		else entry.reject(new Error(message.error));
	};

	worker.onerror = (event) => fail(new Error(event.message || 'Worker crashed'));
	// A response that fails to deserialize would otherwise leave its
	// id-matched promise pending forever.
	worker.onmessageerror = () => fail(new Error('Worker message could not be deserialized'));

	pool.push(instance);
	return instance;
}

/** Idle instance if any; grow the pool while under cap; else least busy. */
function getInstance(kind: WorkerKind): Instance {
	let pool = pools.get(kind);
	if (!pool) {
		pool = [];
		pools.set(kind, pool);
	}
	const idle = pool.find((i) => i.pending.size === 0);
	if (idle) return idle;
	if (pool.length < poolCap(kind)) return spawn(kind, pool);
	return pool.reduce((a, b) => (a.pending.size <= b.pending.size ? a : b));
}

/** Rejection used by abortAll() so callers can tell user cancellation from real failures. */
export class CancelledError extends Error {
	constructor() {
		super('Cancelled');
		this.name = 'CancelledError';
	}
}

/**
 * Terminates pooled workers and rejects their in-flight calls with
 * CancelledError. The pool is shared across tabs, so `kinds` scopes the
 * teardown to the worker kinds the cancelling tab actually uses — a cancel on
 * the jpg tab must not kill a pdf run's gs worker. Omit `kinds` for a full
 * teardown. Workers respawn lazily on the next call (the gs wasm recompiles
 * then — acceptable for an explicit user cancel).
 *
 * `owner` narrows the teardown further, to a single RUN: only calls tagged
 * with that AbortSignal (callWorker's opts.owner) are rejected, and an
 * instance is terminated only when no other run's call is in flight on it —
 * terminate stops wasm dead, which is right for the owner's work and
 * catastrophic for a concurrent tab's. The owner's work on a shared instance
 * is orphaned instead: the encode burns out in the background, its late
 * response hits an unknown id and is ignored, and the watchdog stays the
 * backstop.
 */
export function abortAll(kinds?: WorkerKind[], owner?: AbortSignal): void {
	for (const [kind, pool] of pools) {
		if (kinds && !kinds.includes(kind)) continue;
		for (const instance of [...pool]) {
			let hasForeign = false;
			for (const [id, entry] of instance.pending) {
				if (owner && entry.owner !== owner) {
					hasForeign = true;
					continue;
				}
				entry.clearWatchdog?.();
				entry.reject(new CancelledError());
				instance.pending.delete(id);
			}
			if (hasForeign) continue;
			instance.worker.terminate();
			const at = pool.indexOf(instance);
			if (at >= 0) pool.splice(at, 1);
		}
		if (pool.length === 0) pools.delete(kind);
	}
}

interface MethodSpec {
	payload: unknown;
	result: unknown;
	progress: unknown;
}

/** Resolves the {payload, result, progress} spec for a (kind, action) pair. */
type Spec<
	K extends WorkerKind,
	A extends keyof WorkerContracts[K]
> = WorkerContracts[K][A] extends MethodSpec ? WorkerContracts[K][A] : never;

/**
 * Picks (or lazily spawns) a pool worker for `kind` and performs one request.
 * Payload, result and progress types all follow from (kind, action) via
 * the WorkerContracts map in protocol.ts. `opts.idleTimeoutMs` overrides the
 * per-kind no-progress watchdog (0 disables it). `opts.owner` tags the call
 * with its run's AbortSignal so abortAll(kinds, owner) can cancel just that
 * run — a call without the tag survives every owner-scoped abort, so any new
 * call site on a kind listed in CANCEL_KINDS must pass it.
 */
export function callWorker<K extends WorkerKind, A extends keyof WorkerContracts[K] & string>(
	kind: K,
	action: A,
	payload: Spec<K, A>['payload'],
	transfer: Transferable[] = [],
	onProgress?: (progress: Spec<K, A>['progress']) => void,
	opts?: { idleTimeoutMs?: number; owner?: AbortSignal }
): Promise<Spec<K, A>['result']> {
	const instance = getInstance(kind);
	const id = ++nextId;
	const request: WorkerRequest = { id, action, payload };
	const timeoutMs = opts?.idleTimeoutMs ?? IDLE_TIMEOUT_MS[kind];

	return new Promise((resolve, reject) => {
		const entry: Pending = {
			resolve: resolve as (value: unknown) => void,
			reject,
			onProgress: onProgress as ((progress: unknown) => void) | undefined,
			owner: opts?.owner
		};
		if (timeoutMs > 0) {
			let timer: ReturnType<typeof setTimeout>;
			const arm = () => {
				timer = setTimeout(() => {
					// Synchronous wasm can't be interrupted — kill the whole
					// instance; the pool respawns a fresh one on the next call.
					instance.fail(
						new Error(
							`${kind} worker made no progress for ${Math.round(timeoutMs / 60_000)} min — ` +
								'likely a stuck codec; this file was skipped'
						)
					);
				}, timeoutMs);
			};
			entry.touchWatchdog = () => {
				clearTimeout(timer);
				arm();
			};
			entry.clearWatchdog = () => clearTimeout(timer);
			arm();
		}
		instance.pending.set(id, entry);
		try {
			instance.worker.postMessage(request, transfer);
		} catch (error) {
			// A throwing postMessage (e.g. DataCloneError) must not leave an
			// orphaned entry whose armed watchdog would later fail() a healthy
			// worker and take its other in-flight calls down with it.
			instance.pending.delete(id);
			entry.clearWatchdog?.();
			throw error;
		}
	});
}
