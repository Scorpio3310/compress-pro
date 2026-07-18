import { describe, expect, it, vi } from 'vitest';
import { wasmReady } from './wasm-ready';

describe('wasmReady', () => {
	it('loads once and caches the fulfilled promise', async () => {
		const load = vi.fn(async () => 'module');
		const ready = wasmReady(load);
		await expect(ready()).resolves.toBe('module');
		await expect(ready()).resolves.toBe('module');
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('shares one in-flight promise between concurrent callers', async () => {
		let resolve!: (v: string) => void;
		const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));
		const ready = wasmReady(load);
		const a = ready();
		const b = ready();
		resolve('module');
		await expect(a).resolves.toBe('module');
		await expect(b).resolves.toBe('module');
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('a rejected load is NOT cached — the next call retries and can succeed', async () => {
		// The bug: `ready ??= load()` kept a rejected promise in module scope
		// forever, so one flaky wasm fetch bricked the codec until page reload.
		let attempts = 0;
		const load = vi.fn(async () => {
			if (++attempts === 1) throw new Error('network blip');
			return 'module';
		});
		const ready = wasmReady(load);
		await expect(ready()).rejects.toThrow('network blip');
		await expect(ready()).resolves.toBe('module');
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('every retry surfaces the fresh error, not a stale one', async () => {
		let attempts = 0;
		const load = vi.fn(async () => {
			throw new Error(`attempt ${++attempts}`);
		});
		const ready = wasmReady(load);
		await expect(ready()).rejects.toThrow('attempt 1');
		await expect(ready()).rejects.toThrow('attempt 2');
	});
});
