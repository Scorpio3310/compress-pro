/**
 * Cancellation semantics of the pipeline: wasCancelled must trust only the
 * run's OWN signal, and a foreign pool teardown (another tab's abortAll or a
 * watchdog kill) must surface as a per-file failure — never as a silent early
 * stop. Worker RPC runs against the same stubbed Worker as rpc.test.ts.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { compressFiles, runArchiveTool, wasCancelled } from './compress';
import { abortAll, CancelledError } from './workers/rpc';
import type { ProgressInfo, SvgCompressionSettings, UploadedFile, ZipSettings } from './types';

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

const SVG_SETTINGS: SvgCompressionSettings = {
	removeComments: true,
	removeMetadata: true,
	cleanupIds: true,
	removeDimensions: false,
	precision: 2,
	aggressive: false,
	outputFormat: 'svg',
	rasterSize: 1024,
	quality: 100
};

function svgUpload(): UploadedFile {
	const file = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'a.svg', {
		type: 'image/svg+xml'
	});
	return { id: 'u1', file, name: file.name, size: file.size, objectUrl: 'blob:test' };
}

beforeEach(() => {
	StubWorker.instances = [];
	vi.stubGlobal('Worker', StubWorker);
});

afterEach(() => {
	abortAll();
	vi.unstubAllGlobals();
});

it('wasCancelled trusts the aborted signal, not error identity', () => {
	const aborted = new AbortController();
	aborted.abort();
	const fresh = new AbortController();
	const abortNamed = new Error('aborted');
	abortNamed.name = 'AbortError';

	expect(wasCancelled(aborted.signal, new Error('anything'))).toBe(true);
	// A CancelledError without our own signal fired means a FOREIGN teardown.
	expect(wasCancelled(fresh.signal, new CancelledError())).toBe(false);
	expect(wasCancelled(undefined, new CancelledError())).toBe(false);
	expect(wasCancelled(fresh.signal, abortNamed)).toBe(false);
});

/**
 * Starts a one-file svg run and waits until its encode is pending on the stub.
 * The run promise is returned WRAPPED — returning it bare from an async
 * function would make `await startSvgRun(...)` chain (and wait on) it.
 */
async function startSvgRun(signal: AbortSignal) {
	const run = compressFiles([svgUpload()], 'svg', SVG_SETTINGS, () => {}, signal);
	await vi.waitFor(() => expect(StubWorker.instances[0]?.posted.length ?? 0).toBeGreaterThan(0));
	return { run };
}

it("another run's pool teardown surfaces as a per-file failure, not a cancel", async () => {
	const controller = new AbortController();
	const { run } = await startSvgRun(controller.signal);
	// Foreign kind-wide teardown while OUR signal never fired.
	abortAll(['svg']);
	// Sanity: the teardown really hit the pool this run spawned on.
	expect(StubWorker.instances[0].terminated).toBe(true);
	const out = await run;
	expect(out.results).toEqual([]);
	expect(out.failures).toHaveLength(1);
	expect(out.failures[0].error).toMatch(/Interrupted by a cancelled run/);
});

it('an own cancel stays silent — no failure rows', async () => {
	const controller = new AbortController();
	const { run } = await startSvgRun(controller.signal);
	// handleCancel order: abort the signal first, then tear down owner-scoped.
	controller.abort();
	abortAll(['svg'], controller.signal);
	const out = await run;
	expect(out.results).toEqual([]);
	expect(out.failures).toEqual([]);
});

it('archive progress never rewinds across chain hops', async () => {
	// .7z name skips the fflate fast path, so the worker RPC carries progress.
	const file = new File(['not really a 7z'], 'a.7z', { type: 'application/x-7z-compressed' });
	const upload: UploadedFile = {
		id: 'u1',
		file,
		name: file.name,
		size: file.size,
		objectUrl: 'blob:test'
	};
	const settings: ZipSettings = {
		op: 'extract',
		outputFormat: 'zip',
		level: 6,
		password: '',
		encryptNames: false
	};
	const fractions: number[] = [];
	const run = runArchiveTool(
		[upload],
		settings,
		(p: ProgressInfo) => {
			if (p.stage === 'processing') fractions.push(p.fileFraction);
		},
		undefined
	);
	await vi.waitFor(() => expect(StubWorker.instances[0]?.posted.length ?? 0).toBeGreaterThan(0));
	const stub = StubWorker.instances[0];
	const { id } = stub.posted[0];
	// A chained extract's second hop restarts its scale window (0.9 → 0.1);
	// the consumer clamp must hold the peak, and null must carry it forward.
	stub.onmessage?.({ data: { id, progress: { fraction: 0.9, detail: 'photo.jpg' } } });
	stub.onmessage?.({ data: { id, progress: { fraction: null, detail: 'unpacking inner.tar' } } });
	stub.onmessage?.({ data: { id, progress: { fraction: 0.1, detail: 'doc.txt' } } });
	// Reject rather than resolve: a successful extract would build entry rows
	// via URL.createObjectURL, which node's test env doesn't provide.
	stub.onmessage?.({ data: { id, ok: false, error: 'stop' } });
	const out = await run;
	expect(out.failures).toHaveLength(1);
	expect(fractions.length).toBeGreaterThanOrEqual(4);
	for (let i = 1; i < fractions.length; i++) {
		expect(fractions[i]).toBeGreaterThanOrEqual(fractions[i - 1]);
	}
	// The rewinding 0.1 was clamped at the 0.9 peak.
	expect(fractions.at(-1)).toBe(0.9);
});
