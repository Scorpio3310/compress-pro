import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	convertFont,
	FONT_IDLE_CEIL_MS,
	FONT_IDLE_FLOOR_MS,
	fontIdleTimeoutMs,
	subsetFont
} from './font';
import { abortAll } from '$lib/workers/rpc';
import type { FontConversionSettings } from '$lib/types';

describe('fontIdleTimeoutMs', () => {
	const MB = 1024 * 1024;

	// Contract tests, deliberately not exact-ms mirrors of the rate constant —
	// see sevenzip-args.test.ts for the rationale. Floor/ceiling stay exact:
	// they are promises to rpc.ts and the UI.
	it('stays at the kind-default floor for everyday fonts', () => {
		expect(fontIdleTimeoutMs(0)).toBe(FONT_IDLE_FLOOR_MS);
		expect(fontIdleTimeoutMs(2 * MB)).toBe(FONT_IDLE_FLOOR_MS);
		expect(fontIdleTimeoutMs(5 * MB)).toBe(FONT_IDLE_FLOOR_MS);
	});

	it('scales linearly on the un-clamped segment', () => {
		const w1 = fontIdleTimeoutMs(15 * MB);
		const w2 = fontIdleTimeoutMs(30 * MB);
		expect(w1).toBeGreaterThan(FONT_IDLE_FLOOR_MS);
		expect(w2).toBeLessThan(FONT_IDLE_CEIL_MS);
		expect(w2 / w1).toBeCloseTo(2, 5);
	});

	it('gives a 20 MB+ CJK font more than the old fixed 10-minute window', () => {
		// The regression this guards: rpc.ts's own comment admits "minutes for
		// 20 MB+ CJK ones", yet the fixed window used to kill anything >10 min.
		expect(fontIdleTimeoutMs(20 * MB)).toBeGreaterThan(FONT_IDLE_FLOOR_MS);
	});

	it('caps at the one-hour ceiling', () => {
		expect(fontIdleTimeoutMs(500 * MB)).toBe(FONT_IDLE_CEIL_MS);
	});

	it('is monotonic in input size', () => {
		const sizes = [0, MB, 10 * MB, 20 * MB, 50 * MB, 200 * MB];
		const windows = sizes.map(fontIdleTimeoutMs);
		expect([...windows].sort((a, b) => a - b)).toEqual(windows);
	});
});

/** Wiring: the call sites must PASS the scaled window — the math above is
 *  worthless if a refactor drops the idleTimeoutMs opt and big CJK encodes
 *  regress to death at the 10-minute floor. */
describe('font call sites arm the scaled watchdog', () => {
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

	/** 30 MB → ~20.5-minute window; fake size, no allocation (stub never clones). */
	const bigFont = () =>
		({ size: 30 * MB, arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as File;

	const SETTINGS: FontConversionSettings = {
		op: 'convert',
		outputFormat: 'woff2',
		subsetPresets: [],
		subsetText: '',
		keepHinting: true,
		variableMode: 'keep',
		axisValues: {}
	};

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

	for (const [name, run] of [
		['convertFont', () => convertFont(bigFont(), SETTINGS)],
		['subsetFont', () => subsetFont(bigFont(), SETTINGS)]
	] as const) {
		it(`${name} survives past the floor and still dies past its window`, async () => {
			// Window derived from the same function the wiring must call — the
			// test asserts the contract and survives rate-constant retunes.
			const window = fontIdleTimeoutMs(30 * MB);
			expect(window).toBeGreaterThan(FONT_IDLE_FLOOR_MS); // else it proves nothing

			const state = watch(run());
			// Flush the arrayBuffer await so the request posts and the watchdog arms.
			await vi.advanceTimersByTimeAsync(0);
			expect(StubWorker.instances[0].posted).toHaveLength(1);

			await vi.advanceTimersByTimeAsync(FONT_IDLE_FLOOR_MS + MIN);
			expect(state.settled).toBe(false);

			await vi.advanceTimersByTimeAsync(window - FONT_IDLE_FLOOR_MS);
			expect(state.settled).toBe(true);
			expect(state.error?.message).toMatch(/no progress/);
		});
	}
});
