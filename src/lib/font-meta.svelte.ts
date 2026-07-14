/**
 * Variable-axis/glyph metadata for uploaded fonts — probed once per file so
 * FontControls can render per-axis inputs. Mirrors media-meta.svelte.ts, but
 * probes through the font worker: WOFF2 (where most variable web fonts live)
 * needs the woff2 wasm to reach fvar, and the worker owns that wasm anyway.
 */
import { SvelteMap } from 'svelte/reactivity';
import type { UploadedFile } from '$lib/types';
import type { FontProbeResult } from '$lib/workers/protocol';
import { callWorker, CancelledError } from '$lib/workers/rpc';

export type FontMeta = FontProbeResult;

/** null = probe failed (corrupt/collection) → no axis UI; the run reports the real error. */
const metas = new SvelteMap<string, FontMeta | null>();

/** In-flight probes by file id. The token's `live` flag is how removeFontMeta
 *  vetoes a cancel-retry for a file that no longer exists — without it the
 *  retry would re-parse the font and park an orphaned meta until reload. */
const inFlight = new Map<string, { live: boolean }>();

/** Reactive lookup; undefined = not probed (yet). */
export function fontMeta(id: string): FontMeta | null | undefined {
	return metas.get(id);
}

/** Fire-and-forget. Owner-less but probe-tagged: a cancel's teardown may take
 *  the worker (and this probe) with it instead of letting the probe keep a
 *  cancelled encode alive on the size-1 pool — CancelledError then means
 *  "rerun on the fresh worker", not "probe failed". */
export function probeFont(file: UploadedFile): void {
	if (metas.has(file.id) || inFlight.has(file.id)) return;
	const token = { live: true };
	inFlight.set(file.id, token);
	file.file
		.arrayBuffer()
		.then((bytes) => callWorker('font', 'probe', { bytes }, [bytes], undefined, { probe: true }))
		.then(
			(meta) => {
				inFlight.delete(file.id);
				if (token.live) metas.set(file.id, meta);
			},
			(error) => {
				inFlight.delete(file.id);
				if (!token.live) return; // removed mid-flight — nothing wants the result
				if (error instanceof CancelledError) {
					// Bounded: each retry needs another cancel, and the fresh probe
					// re-registers itself in inFlight above.
					probeFont(file);
				} else {
					metas.set(file.id, null);
				}
			}
		);
}

export function removeFontMeta(id: string): void {
	metas.delete(id);
	const token = inFlight.get(id);
	if (token) {
		token.live = false;
		inFlight.delete(id);
	}
}
