/**
 * Lazy motion engine. `motion` (~70 KB raw / ~25 KB gz) was the single biggest
 * chunk in every page's modulepreload set, yet nothing needs it for first
 * paint: SSR'd entrances are CSS (.reveal-css) and every JS animation is
 * either input feedback or fires ≥600 ms after mount. It now loads via a
 * dynamic import kicked off right after hydration; every wrapper degrades
 * statically until it lands.
 *
 * Contract:
 * - engine(): the module or null, synchronously. Check at FIRE time.
 * - whenEngine(cb): run cb once loaded (immediately if already loaded) — for
 *   listener-style upgrades (press/hover). Returns a cancel; attachment
 *   cleanups MUST call it or removed elements leak queued callbacks.
 * - Entrances (reveal/pop/squeezes) must NEVER be deferred via whenEngine: an
 *   opacity-[0,1] entrance running after first paint reads as paint → blink
 *   out → fade back in. Skip instead — the element simply renders visible.
 */
import { browser } from '$app/environment';

export type MotionModule = typeof import('motion');

let mod: MotionModule | null = null;
let queue: Array<(m: MotionModule) => void> = [];
let started = false;

/** Idempotent kickoff (module init schedules it below). */
function warmup(): void {
	if (started || !browser) return;
	started = true;
	import('motion').then(
		(m) => {
			mod = m;
			const callbacks = queue;
			queue = [];
			for (const cb of callbacks) cb(m);
		},
		() => {
			// Fetch failed (offline first visit, blocked request): engine() stays
			// null and every call site keeps its static fallback — fully usable.
		}
	);
}

/** The loaded motion module, or null while it's still in flight. */
export function engine(): MotionModule | null {
	return mod;
}

/** Run cb as soon as the engine exists. Returns a cancel — call it on cleanup. */
export function whenEngine(cb: (m: MotionModule) => void): () => void {
	if (mod) {
		cb(mod);
		return () => {};
	}
	queue.push(cb);
	return () => {
		const at = queue.indexOf(cb);
		if (at !== -1) queue.splice(at, 1);
	};
}

if (browser) {
	// Post-hydration idle; the timeout bounds the wait when the main thread
	// stays busy (Chrome can starve idle callbacks for seconds). Safari has no
	// requestIdleCallback.
	if (typeof requestIdleCallback === 'function') {
		requestIdleCallback(() => warmup(), { timeout: 200 });
	} else {
		setTimeout(warmup, 200);
	}
}
