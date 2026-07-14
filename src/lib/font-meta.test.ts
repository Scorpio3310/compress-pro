/**
 * Liveness rules of the fire-and-forget font probe: a cancel-torn probe must
 * rerun on the fresh worker, but ONLY while its file still exists — a removed
 * file's retry would park an orphaned meta entry and respawn the worker for
 * nothing. Runs against the same stubbed Worker as compress.test.ts.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fontMeta, probeFont, removeFontMeta } from './font-meta.svelte';
import { abortAll } from './workers/rpc';
import type { UploadedFile } from './types';

class StubWorker {
	static instances: StubWorker[] = [];
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onerror: ((event: { message?: string }) => void) | null = null;
	onmessageerror: (() => void) | null = null;
	posted: { id: number }[] = [];
	terminated = false;
	constructor() {
		StubWorker.instances.push(this);
	}
	postMessage(message: { id: number }) {
		this.posted.push(message);
	}
	terminate() {
		this.terminated = true;
	}
}

const PROBE_RESULT = { container: 'ttf', axes: [], glyphCount: 42 };

function fontUpload(id: string): UploadedFile {
	const file = new File([new Uint8Array(8)], `${id}.ttf`, { type: 'font/ttf' });
	return { id, file, name: file.name, size: file.size, objectUrl: 'blob:test' };
}

/** Total probe requests across every worker instance the pool spawned. */
function totalPosted(): number {
	return StubWorker.instances.reduce((n, w) => n + w.posted.length, 0);
}

beforeEach(() => {
	StubWorker.instances = [];
	vi.stubGlobal('Worker', StubWorker);
});

afterEach(() => {
	abortAll();
	vi.unstubAllGlobals();
});

it('a cancelled probe reruns on the fresh worker and lands its meta', async () => {
	const upload = fontUpload('fm-retry');
	probeFont(upload);
	await vi.waitFor(() => expect(totalPosted()).toBe(1));

	// A run-cancel teardown takes the pooled worker (and the probe) with it.
	abortAll(['font']);
	expect(StubWorker.instances[0].terminated).toBe(true);

	// The retry spawns a fresh instance and re-posts the probe.
	await vi.waitFor(() => expect(StubWorker.instances).toHaveLength(2));
	const fresh = StubWorker.instances[1];
	await vi.waitFor(() => expect(fresh.posted.length).toBe(1));
	fresh.onmessage?.({ data: { id: fresh.posted[0].id, ok: true, result: PROBE_RESULT } });
	await vi.waitFor(() => expect(fontMeta('fm-retry')).toEqual(PROBE_RESULT));

	removeFontMeta('fm-retry');
});

it('removeFontMeta vetoes the retry of an in-flight probe', async () => {
	const upload = fontUpload('fm-veto');
	probeFont(upload);
	await vi.waitFor(() => expect(totalPosted()).toBe(1));

	removeFontMeta('fm-veto');
	abortAll(['font']);

	// Give a would-be retry ample time to appear, then assert it never did.
	await new Promise((resolve) => setTimeout(resolve, 25));
	expect(StubWorker.instances).toHaveLength(1);
	expect(totalPosted()).toBe(1);
	expect(fontMeta('fm-veto')).toBeUndefined();
});

it('a second probeFont for the same id is deduped while one is in flight', async () => {
	const upload = fontUpload('fm-dedupe');
	probeFont(upload);
	probeFont(upload);
	await vi.waitFor(() => expect(totalPosted()).toBe(1));
	await new Promise((resolve) => setTimeout(resolve, 25));
	expect(totalPosted()).toBe(1);

	removeFontMeta('fm-dedupe');
});
