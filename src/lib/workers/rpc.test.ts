/**
 * Watchdog + pool behavior of callWorker, driven against a stubbed Worker
 * (vitest runs in node; the real workers only exist in the browser).
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { abortAll, callWorker } from './rpc';

class StubWorker {
	static instances: StubWorker[] = [];
	static throwOnPost = false;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onerror: ((event: { message?: string }) => void) | null = null;
	onmessageerror: (() => void) | null = null;
	terminated = false;
	posted: { id: number }[] = [];
	constructor() {
		StubWorker.instances.push(this);
	}
	postMessage(message: { id: number }) {
		if (StubWorker.throwOnPost) throw new Error('boom: postMessage failed');
		this.posted.push(message);
	}
	terminate() {
		this.terminated = true;
	}
}

const SVG_PAYLOAD = {
	svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
	settings: {
		removeComments: true,
		removeMetadata: true,
		cleanupIds: true,
		removeDimensions: false,
		precision: 2,
		aggressive: false,
		outputFormat: 'svg' as const,
		rasterSize: 1024,
		quality: 100
	}
};

function callSvg(idleTimeoutMs: number) {
	return callWorker('svg', 'optimize', SVG_PAYLOAD, [], undefined, { idleTimeoutMs });
}

beforeEach(() => {
	vi.useFakeTimers();
	StubWorker.instances = [];
	StubWorker.throwOnPost = false;
	vi.stubGlobal('Worker', StubWorker);
});

afterEach(() => {
	abortAll();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it('watchdog rejects a silent call and terminates the worker', async () => {
	const settled = callSvg(1000).then(
		() => 'resolved',
		(error: Error) => error
	);
	await vi.advanceTimersByTimeAsync(1000);
	const outcome = await settled;
	expect(outcome).toBeInstanceOf(Error);
	// The message must name BOTH hypotheses — damage and a slow device — a
	// watchdog kill is not proof the codec was stuck.
	expect((outcome as Error).message).toMatch(/no progress .* damaged, or this device/);
	expect(StubWorker.instances).toHaveLength(1);
	expect(StubWorker.instances[0].terminated).toBe(true);
});

it('progress messages re-arm the watchdog', async () => {
	let rejected = false;
	const settled = callSvg(1000).catch(() => (rejected = true));
	const stub = StubWorker.instances[0];
	const { id } = stub.posted[0];

	// 600 ms in, the worker reports progress — the 1000 ms window restarts.
	await vi.advanceTimersByTimeAsync(600);
	stub.onmessage?.({ data: { id, progress: { page: 1, pageCount: 3 } } });
	await vi.advanceTimersByTimeAsync(600); // 1200 ms total, 600 since progress
	expect(rejected).toBe(false);

	await vi.advanceTimersByTimeAsync(400); // now 1000 ms of silence
	await settled;
	expect(rejected).toBe(true);
});

it('a completed call never trips the watchdog', async () => {
	const call = callSvg(1000);
	const stub = StubWorker.instances[0];
	const { id } = stub.posted[0];
	stub.onmessage?.({ data: { id, ok: true, result: '<svg/>' } });
	await expect(call).resolves.toBe('<svg/>');
	// The armed timer was cleared — advancing time kills nothing.
	await vi.advanceTimersByTimeAsync(5000);
	expect(stub.terminated).toBe(false);
});

it('the pool respawns a fresh worker after a watchdog kill', async () => {
	const first = callSvg(1000).catch(() => null);
	await vi.advanceTimersByTimeAsync(1000);
	await first;

	const second = callSvg(1000);
	expect(StubWorker.instances).toHaveLength(2);
	const stub = StubWorker.instances[1];
	const { id } = stub.posted[0];
	stub.onmessage?.({ data: { id, ok: true, result: 'fresh' } });
	await expect(second).resolves.toBe('fresh');
});

it('idleTimeoutMs 0 disables the watchdog', async () => {
	let settled = false;
	// Both arms handled: afterEach's abortAll rejects this still-open call.
	callSvg(0).then(
		() => (settled = true),
		() => (settled = true)
	);
	await vi.advanceTimersByTimeAsync(60 * 60_000);
	expect(settled).toBe(false);
	expect(StubWorker.instances[0].terminated).toBe(false);
});

function callImage() {
	return callWorker(
		'image',
		'encode',
		{ bytes: new ArrayBuffer(4), quality: 80, output: 'jpg', maxDimension: null },
		[],
		undefined,
		{ idleTimeoutMs: 0 }
	);
}

it('abortAll(kinds) rejects only the selected pools and keeps others alive', async () => {
	const outcomes: { svg?: string; image?: string } = {};
	const svgCall = callSvg(0).then(
		() => (outcomes.svg = 'resolved'),
		(error: Error) => (outcomes.svg = error.name)
	);
	const imageCall = callImage().then(
		() => (outcomes.image = 'resolved'),
		(error: Error) => (outcomes.image = error.name)
	);
	expect(StubWorker.instances).toHaveLength(2);
	const [svgStub, imageStub] = StubWorker.instances;

	abortAll(['image']);
	await imageCall;
	expect(outcomes.image).toBe('CancelledError');
	expect(imageStub.terminated).toBe(true);
	// The svg call is still in flight on its untouched worker.
	expect(outcomes.svg).toBeUndefined();
	expect(svgStub.terminated).toBe(false);

	abortAll(); // no-arg keeps full-teardown semantics
	await svgCall;
	expect(outcomes.svg).toBe('CancelledError');
	expect(svgStub.terminated).toBe(true);
});

function callSvgOwned(owner: AbortSignal, idleTimeoutMs = 0) {
	return callWorker('svg', 'optimize', SVG_PAYLOAD, [], undefined, { idleTimeoutMs, owner });
}

it('abortAll(kinds, owner) rejects only the owner and spares a shared instance', async () => {
	const ownerA = new AbortController().signal;
	const ownerB = new AbortController().signal;
	const outcomes: { a?: string; b?: string } = {};
	const callA = callSvgOwned(ownerA).then(
		() => (outcomes.a = 'resolved'),
		(error: Error) => (outcomes.a = error.name)
	);
	const callB = callSvgOwned(ownerB).then(
		(result) => (outcomes.b = result as string),
		(error: Error) => (outcomes.b = error.name)
	);
	// svg poolCap is 1 — both calls share one instance.
	expect(StubWorker.instances).toHaveLength(1);
	const stub = StubWorker.instances[0];
	const [{ id: idA }, { id: idB }] = stub.posted;

	abortAll(['svg'], ownerA);
	await callA;
	expect(outcomes.a).toBe('CancelledError');
	// B's call is still in flight, so the shared worker must NOT be killed.
	expect(stub.terminated).toBe(false);
	// A's late response hits an unknown id and is ignored…
	stub.onmessage?.({ data: { id: idA, ok: true, result: 'late' } });
	expect(outcomes.b).toBeUndefined();
	// …while B still completes normally.
	stub.onmessage?.({ data: { id: idB, ok: true, result: '<svg/>' } });
	await callB;
	expect(outcomes.b).toBe('<svg/>');
});

it('abortAll(kinds, owner) terminates an instance the owner has to itself', async () => {
	const owner = new AbortController().signal;
	const call = callSvgOwned(owner).then(
		() => 'resolved',
		(error: Error) => error.name
	);
	const stub = StubWorker.instances[0];
	abortAll(['svg'], owner);
	expect(await call).toBe('CancelledError');
	expect(stub.terminated).toBe(true);
	// The instance left the pool — the next call spawns a fresh worker.
	const second = callSvg(0);
	expect(StubWorker.instances).toHaveLength(2);
	const fresh = StubWorker.instances[1];
	fresh.onmessage?.({ data: { id: fresh.posted[0].id, ok: true, result: 'fresh' } });
	await expect(second).resolves.toBe('fresh');
});

it('abortAll(kinds, owner) terminates an instance whose only foreign pendings are probes', async () => {
	const owner = new AbortController().signal;
	const owned = callSvgOwned(owner).then(
		() => 'resolved',
		(error: Error) => error.name
	);
	const probe = callWorker('svg', 'optimize', SVG_PAYLOAD, [], undefined, {
		idleTimeoutMs: 0,
		probe: true
	}).then(
		() => 'resolved',
		(error: Error) => error.name
	);
	// svg poolCap is 1 — the run and the probe share one instance.
	expect(StubWorker.instances).toHaveLength(1);
	const stub = StubWorker.instances[0];

	abortAll(['svg'], owner);
	// The probe must not shield the instance: both reject, the worker dies.
	expect(await owned).toBe('CancelledError');
	expect(await probe).toBe('CancelledError');
	expect(stub.terminated).toBe(true);
	// The instance left the pool — the next call spawns a fresh worker.
	const second = callSvg(0);
	expect(StubWorker.instances).toHaveLength(2);
	const fresh = StubWorker.instances[1];
	fresh.onmessage?.({ data: { id: fresh.posted[0].id, ok: true, result: 'fresh' } });
	await expect(second).resolves.toBe('fresh');
});

it('a foreign RUN call still shields the instance — probes stay pending', async () => {
	const ownerA = new AbortController().signal;
	const ownerB = new AbortController().signal;
	const cancelled = callSvgOwned(ownerA).then(
		() => 'resolved',
		(error: Error) => error.name
	);
	let foreignSettled = false;
	const foreignRun = callSvgOwned(ownerB).then(
		() => (foreignSettled = true),
		() => (foreignSettled = true)
	);
	let probeSettled = false;
	const probe = callWorker('svg', 'optimize', SVG_PAYLOAD, [], undefined, {
		idleTimeoutMs: 0,
		probe: true
	}).then(
		() => (probeSettled = true),
		() => (probeSettled = true)
	);
	const stub = StubWorker.instances[0];

	abortAll(['svg'], ownerA);
	expect(await cancelled).toBe('CancelledError');
	// B's run is in flight, so the instance survives and the probe rides along.
	expect(stub.terminated).toBe(false);
	expect(foreignSettled).toBe(false);
	expect(probeSettled).toBe(false);
	void foreignRun;
	void probe; // both settled by afterEach's abortAll
});

it("an owner-scoped abort clears the owner's watchdog and keeps the survivor alive", async () => {
	const owner = new AbortController().signal;
	const owned = callSvgOwned(owner, 1000).catch(() => null);
	let foreignSettled = false;
	const foreign = callSvg(0).then(
		() => (foreignSettled = true),
		() => (foreignSettled = true)
	);
	const stub = StubWorker.instances[0];

	abortAll(['svg'], owner);
	await owned;
	// The dead call's 1000 ms watchdog must not fire later and kill the
	// shared instance out from under the survivor.
	await vi.advanceTimersByTimeAsync(1500);
	expect(stub.terminated).toBe(false);
	expect(foreignSettled).toBe(false);
	void foreign; // settled by afterEach's abortAll
});

it('untagged calls survive an owner-scoped abort', async () => {
	const owner = new AbortController().signal;
	let settled = false;
	const untagged = callSvg(0).then(
		() => (settled = true),
		() => (settled = true)
	);
	abortAll(['svg'], owner);
	await vi.advanceTimersByTimeAsync(0);
	expect(settled).toBe(false);
	expect(StubWorker.instances[0].terminated).toBe(false);
	void untagged; // settled by afterEach's abortAll
});

it('a throwing postMessage cleans up its pending entry and armed watchdog', async () => {
	StubWorker.throwOnPost = true;
	await expect(callSvg(1000)).rejects.toThrow('boom');
	StubWorker.throwOnPost = false;
	// The orphaned watchdog must not fire later and fail() the healthy worker.
	await vi.advanceTimersByTimeAsync(5000);
	const stub = StubWorker.instances[0];
	expect(stub.terminated).toBe(false);
	// The same instance keeps serving.
	const second = callSvg(0);
	expect(StubWorker.instances).toHaveLength(1);
	stub.onmessage?.({
		data: { id: stub.posted[stub.posted.length - 1].id, ok: true, result: '<svg/>' }
	});
	await expect(second).resolves.toBe('<svg/>');
});

it('a survived pool keeps serving after a kinds-scoped abort elsewhere', async () => {
	const pending = callSvg(0).catch(() => null); // afterEach abortAll settles it
	const imagePending = callImage().catch(() => null); // spawn the image pool…
	abortAll(['image']); // …and tear only it down
	await imagePending;

	// The svg pool still has its (busy) instance — a new call reuses the pool
	// without the instance count growing beyond the respawn-free expectation.
	const before = StubWorker.instances.length;
	const second = callSvg(0);
	expect(StubWorker.instances.length).toBe(before);
	const stub = StubWorker.instances[0];
	const { id } = stub.posted[stub.posted.length - 1];
	stub.onmessage?.({ data: { id, ok: true, result: '<svg/>' } });
	await expect(second).resolves.toBe('<svg/>');
	void pending; // settled by afterEach's abortAll
});

it('an already-aborted owner is rejected at submit time — no worker spawned', async () => {
	// F-39: a cancel landing in a codec's pre-work window (arrayBuffer, probes)
	// used to submit anyway — respawning a fresh worker into the pool abortAll
	// just emptied, so the "cancelled" job ran to completion.
	const controller = new AbortController();
	controller.abort();
	const call = callWorker('svg', 'optimize', SVG_PAYLOAD, [], undefined, {
		owner: controller.signal
	});
	await expect(call).rejects.toMatchObject({ name: 'CancelledError' });
	expect(StubWorker.instances, 'no worker may spawn for a dead run').toHaveLength(0);
});

it('a queued call does not die while its co-tenant makes progress (F-59)', async () => {
	// The svg pool is size 1, so the second call queues behind the first; its
	// watchdog used to count pure queue wait and then fail() the instance,
	// killing the healthy active job with the misleading "no progress" error.
	const a = callSvg(10_000);
	const b = callSvg(10_000);
	const worker = StubWorker.instances[0];
	for (let t = 0; t < 3; t++) {
		await vi.advanceTimersByTimeAsync(5_000);
		worker.onmessage?.({ data: { id: worker.posted[0].id, progress: { page: t } } });
	}
	// 15 s of co-tenant progress — b (10 s window) must still be pending.
	worker.onmessage?.({ data: { id: worker.posted[0].id, ok: true, result: 'a' } });
	await expect(a).resolves.toBe('a');
	// b is now the active job and the worker goes truly silent → honest fire.
	await vi.advanceTimersByTimeAsync(10_100);
	await expect(b).rejects.toThrow(/no progress/);
	expect(worker.terminated).toBe(true);
});
