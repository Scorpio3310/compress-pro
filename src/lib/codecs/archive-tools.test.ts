/**
 * Watchdog WIRING tests: the pure window math lives in sevenzip-args.test.ts —
 * these prove the call sites actually PASS the scaled window to callWorker.
 * If a refactor drops the idleTimeoutMs opt, extract/convert of large archives
 * regress to the 10-minute floor and get killed mid-job; only a fake-timer
 * test at this layer catches that.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { convertArchive, extractArchive } from './archive-tools';
import {
	ARCHIVE_IDLE_FLOOR_MS,
	archiveIdleTimeoutMs,
	CONVERT_EXPANSION_FACTOR
} from './sevenzip-args';
import { abortAll } from '$lib/workers/rpc';
import type { UploadedFile, ZipSettings } from '$lib/types';

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

const MB = 1024 * 1024;
const MIN = 60_000;

/** Big input without allocating it: the stub never structured-clones. */
function bigUpload(size: number): UploadedFile {
	const fake = { size, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as File;
	return { id: 'a1', file: fake, name: 'big.7z', size, objectUrl: 'blob:test' };
}

const CONVERT_SETTINGS: ZipSettings = {
	op: 'convert',
	outputFormat: 'zip',
	level: 6,
	password: '',
	encryptNames: false
};

/** Tracks settlement without letting a rejection escape as unhandled. */
function watch<T>(promise: Promise<T>) {
	const state = { settled: false, error: null as Error | null };
	promise.then(
		() => (state.settled = true),
		(error: Error) => {
			state.settled = true;
			state.error = error;
		}
	);
	return state;
}

beforeEach(() => {
	vi.useFakeTimers();
	StubWorker.instances = [];
	vi.stubGlobal('Worker', StubWorker);
});

afterEach(() => {
	abortAll();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it('extract passes the size-scaled idle window, not the 10-minute floor', async () => {
	// The window is derived from the SAME function the wiring must call —
	// the test asserts the contract (floor survived, window enforced), so it
	// keeps discriminating through any retune of the rate constants.
	const size = 600 * MB;
	const window = archiveIdleTimeoutMs(size);
	expect(window).toBeGreaterThan(ARCHIVE_IDLE_FLOOR_MS); // else the test proves nothing

	const state = watch(extractArchive(bigUpload(size), '', () => {}));
	await vi.advanceTimersByTimeAsync(0);
	expect(StubWorker.instances[0].posted).toHaveLength(1);

	// Past the floor the old wiring would have killed a healthy silent job.
	await vi.advanceTimersByTimeAsync(ARCHIVE_IDLE_FLOOR_MS + MIN);
	expect(state.settled).toBe(false);

	// Past the scaled window the watchdog must still be the backstop.
	await vi.advanceTimersByTimeAsync(window - ARCHIVE_IDLE_FLOOR_MS);
	expect(state.settled).toBe(true);
	expect(state.error?.message).toMatch(/no progress/);
});

it('convert scales the window by the expansion budget on top of source size', async () => {
	const size = 60 * MB;
	const window = archiveIdleTimeoutMs(size * CONVERT_EXPANSION_FACTOR);
	expect(window).toBeGreaterThan(ARCHIVE_IDLE_FLOOR_MS);

	const state = watch(convertArchive(bigUpload(size), CONVERT_SETTINGS, () => {}));
	await vi.advanceTimersByTimeAsync(0);
	expect(StubWorker.instances[0].posted).toHaveLength(1);

	await vi.advanceTimersByTimeAsync(ARCHIVE_IDLE_FLOOR_MS + MIN);
	expect(state.settled).toBe(false);

	await vi.advanceTimersByTimeAsync(window - ARCHIVE_IDLE_FLOOR_MS);
	expect(state.settled).toBe(true);
	expect(state.error?.message).toMatch(/no progress/);
});
