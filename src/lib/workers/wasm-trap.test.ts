import { describe, expect, it, vi } from 'vitest';
import { isWasmTrap, runTrapGuarded } from './wasm-trap';

describe('isWasmTrap', () => {
	it('classifies wasm aborts and non-Error throws as traps', () => {
		expect(isWasmTrap(new WebAssembly.RuntimeError('unreachable executed'))).toBe(true);
		expect(isWasmTrap('null pointer passed to rust')).toBe(true);
		expect(isWasmTrap(42)).toBe(true);
	});

	it('leaves ordinary Errors alone', () => {
		expect(isWasmTrap(new Error('Vectorization produced no SVG output'))).toBe(false);
		expect(isWasmTrap(new TypeError('bad input'))).toBe(false);
	});
});

describe('runTrapGuarded', () => {
	it('passes results and ordinary errors through untouched, without crashing', () => {
		const crash = vi.fn();
		expect(runTrapGuarded(() => 'svg', 'oom', crash)).toBe('svg');
		const plain = new Error('regular failure');
		expect(() =>
			runTrapGuarded(
				() => {
					throw plain;
				},
				'oom',
				crash
			)
		).toThrow(plain);
		expect(crash).not.toHaveBeenCalled();
	});

	it('on a trap: schedules the worker crash and throws the honest message', () => {
		// After a trap the instance heap is poisoned and wasm-bindgen's init()
		// memoizes — the pool must get a chance to replace the whole worker,
		// while THIS job still fails with a message a person can act on.
		const crash = vi.fn();
		expect(() =>
			runTrapGuarded(
				() => {
					throw new WebAssembly.RuntimeError('unreachable executed');
				},
				'Not enough memory to vectorize this image',
				crash
			)
		).toThrow(/not enough memory/i);
		expect(crash).toHaveBeenCalledTimes(1);
		expect(crash.mock.calls[0][0]).toBeInstanceOf(Error);
	});

	it('treats non-Error throws (wasm-bindgen glue) as traps too', () => {
		const crash = vi.fn();
		expect(() => runTrapGuarded(() => JSON.parse('{'), 'oom', crash)).toThrow(/JSON/);
		expect(() =>
			runTrapGuarded(
				() => {
					throw 'null pointer passed to rust';
				},
				'oom message',
				crash
			)
		).toThrow('oom message');
		expect(crash).toHaveBeenCalledTimes(1);
	});
});
