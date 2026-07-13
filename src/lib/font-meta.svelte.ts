/**
 * Variable-axis/glyph metadata for uploaded fonts — probed once per file so
 * FontControls can render per-axis inputs. Mirrors media-meta.svelte.ts, but
 * probes through the font worker: WOFF2 (where most variable web fonts live)
 * needs the woff2 wasm to reach fvar, and the worker owns that wasm anyway.
 */
import { SvelteMap } from 'svelte/reactivity';
import type { UploadedFile } from '$lib/types';
import type { FontProbeResult } from '$lib/workers/protocol';
import { callWorker } from '$lib/workers/rpc';

export type FontMeta = FontProbeResult;

/** null = probe failed (corrupt/collection) → no axis UI; the run reports the real error. */
const metas = new SvelteMap<string, FontMeta | null>();

/** Reactive lookup; undefined = not probed (yet). */
export function fontMeta(id: string): FontMeta | null | undefined {
	return metas.get(id);
}

/** Fire-and-forget. Deliberately owner-less: an owner-scoped cancel of a run
 *  must not tear down a probe that a re-run would need again. */
export function probeFont(file: UploadedFile): void {
	if (metas.has(file.id)) return;
	file.file
		.arrayBuffer()
		.then((bytes) => callWorker('font', 'probe', { bytes }, [bytes]))
		.then((meta) => metas.set(file.id, meta))
		.catch(() => metas.set(file.id, null));
}

export function removeFontMeta(id: string): void {
	metas.delete(id);
}
