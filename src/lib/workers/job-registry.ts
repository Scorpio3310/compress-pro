/**
 * Cancel bookkeeping for long-running worker jobs (video/audio conversions).
 *
 * The old pattern registered a job in the cancel map only AFTER the heavy
 * setup (wasm encoder fetch + Conversion.init) finished — a cancel arriving
 * in that window found nothing, was silently dropped, and the main thread's
 * 5 s fallback then hard-killed the whole healthy worker. Here the job is
 * registered up front: a cancel in the setup window flips the flag (handlers
 * check it between awaits), and adopting the real Conversion afterwards
 * forwards any missed cancel to it immediately.
 */

export interface CancellableJob {
	cancel(): void | Promise<void>;
}

export interface JobHandle {
	/** True once a cancel for this job id has been received. */
	readonly cancelled: boolean;
	/** Attach the real cancellable (Conversion / Output) once it exists.
	 *  A cancel that arrived earlier is forwarded to it right away. */
	adopt(job: CancellableJob): void;
	/** Throw a JobCancelledError if a cancel has been received — call between
	 *  the heavy setup awaits so a cancelled job settles fast. */
	throwIfCancelled(): void;
	/** Deregister (call in `finally`) — later cancels become no-ops. */
	finish(): void;
}

export class JobCancelledError extends Error {
	constructor() {
		super('Cancelled');
		this.name = 'JobCancelledError';
	}
}

interface JobState {
	cancelled: boolean;
	inner: CancellableJob | null;
}

export function createJobRegistry() {
	const jobs = new Map<number, JobState>();

	return {
		register(jobId: number): JobHandle {
			const state: JobState = { cancelled: false, inner: null };
			jobs.set(jobId, state);
			return {
				get cancelled() {
					return state.cancelled;
				},
				adopt(job: CancellableJob) {
					state.inner = job;
					// The cancel raced the setup — forward it now so the adopted
					// conversion tears itself down instead of running to completion.
					if (state.cancelled) void job.cancel();
				},
				throwIfCancelled() {
					if (state.cancelled) throw new JobCancelledError();
				},
				finish() {
					jobs.delete(jobId);
				}
			};
		},

		/** Missing id = the job already finished (or never existed); no-op. */
		async cancel(jobId: number): Promise<void> {
			const state = jobs.get(jobId);
			if (!state) return;
			state.cancelled = true;
			await state.inner?.cancel();
		}
	};
}
