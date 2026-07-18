import { describe, expect, it, vi } from 'vitest';
import { createJobRegistry, JobCancelledError } from './job-registry';

describe('createJobRegistry', () => {
	it('cancel before adopt marks the job cancelled (the Conversion.init window)', async () => {
		const jobs = createJobRegistry();
		const handle = jobs.register(1);
		expect(handle.cancelled).toBe(false);

		// A cancel message lands while the handler is still awaiting init —
		// nothing adopted yet, but the cancel must NOT be lost.
		await jobs.cancel(1);
		expect(handle.cancelled).toBe(true);
		expect(() => handle.throwIfCancelled()).toThrow(JobCancelledError);
	});

	it('adopting after a missed cancel forwards the cancel to the conversion', async () => {
		const jobs = createJobRegistry();
		const handle = jobs.register(2);
		await jobs.cancel(2);

		const conversion = { cancel: vi.fn() };
		handle.adopt(conversion);
		expect(conversion.cancel).toHaveBeenCalledTimes(1);
	});

	it('cancel after adopt reaches the adopted conversion', async () => {
		const jobs = createJobRegistry();
		const handle = jobs.register(3);
		const conversion = { cancel: vi.fn().mockResolvedValue(undefined) };
		handle.adopt(conversion);

		await jobs.cancel(3);
		expect(conversion.cancel).toHaveBeenCalledTimes(1);
		expect(handle.cancelled).toBe(true);
	});

	it('cancelling an unknown or finished job is a silent no-op', async () => {
		const jobs = createJobRegistry();
		await expect(jobs.cancel(99)).resolves.toBeUndefined();

		const handle = jobs.register(4);
		const conversion = { cancel: vi.fn() };
		handle.adopt(conversion);
		handle.finish();
		await jobs.cancel(4);
		expect(conversion.cancel).not.toHaveBeenCalled();
	});

	it('independent jobs do not cross-cancel', async () => {
		const jobs = createJobRegistry();
		const a = jobs.register(5);
		const b = jobs.register(6);
		await jobs.cancel(5);
		expect(a.cancelled).toBe(true);
		expect(b.cancelled).toBe(false);
	});
});
