/**
 * The spreader's contract with +page.svelte: rows flip queued→processing→done
 * as the combined op advances, the mean of row fractions equals the reported
 * overall fraction, and the last row stays alive until finish().
 */
import { describe, expect, it } from 'vitest';
import { spreadCombinedProgress } from './combined-progress';
import type { ProgressInfo } from './types';

/** Replays events the way +page.svelte folds them into fileProgress. */
function replay(events: ProgressInfo[], fileCount: number) {
	const rows = Array.from({ length: fileCount }, () => ({ fraction: 0, stage: 'queued' }));
	for (const p of events) {
		rows[p.fileIndex] = { fraction: p.stage === 'processing' ? p.fileFraction : 1, stage: p.stage };
	}
	return rows;
}

function collect() {
	const events: ProgressInfo[] = [];
	const spread = spreadCombinedProgress(4, 'merged.pdf', (p) => events.push(p));
	return { events, spread };
}

describe('spreadCombinedProgress', () => {
	it('marks floor(F·N) rows done and keeps the mean equal to F', () => {
		const { events, spread } = collect();
		spread.report(0.5, 'page 2/4');
		const rows = replay(events, 4);
		expect(rows.map((r) => r.stage)).toEqual(['done', 'done', 'processing', 'queued']);
		expect(rows.reduce((sum, r) => sum + r.fraction, 0) / 4).toBeCloseTo(0.5, 10);
		expect(events.every((p) => p.fileCount === 4 && p.fileName === 'merged.pdf')).toBe(true);
	});

	it('never flips the last row before finish(), even at F = 1', () => {
		const { events, spread } = collect();
		spread.report(1, null);
		let rows = replay(events, 4);
		expect(rows[3].stage).toBe('processing');
		spread.finish();
		rows = replay(events, 4);
		expect(rows.map((r) => r.stage)).toEqual(['done', 'done', 'done', 'done']);
	});

	it('is monotonic across rewinds and carries the peak through null fractions', () => {
		const { events, spread } = collect();
		spread.report(0.6, null);
		spread.report(0.2, 'second pass'); // two-pass rewind must not undo rows
		spread.report(null, 'still busy'); // null = detail-only refresh
		const rows = replay(events, 4);
		expect(rows.map((r) => r.stage)).toEqual(['done', 'done', 'processing', 'queued']);
		expect(events.at(-1)!.detail).toBe('still busy');
		expect(rows.reduce((sum, r) => sum + r.fraction, 0) / 4).toBeCloseTo(0.6, 10);
	});

	it('finish() completes rows that progress never reached', () => {
		const events: ProgressInfo[] = [];
		const spread = spreadCombinedProgress(3, 'archive.zip', (p) => events.push(p));
		spread.report(0.1, null);
		spread.finish();
		expect(replay(events, 3).map((r) => r.stage)).toEqual(['done', 'done', 'done']);
	});

	it('handles a single-input run without ever emitting fileIndex > 0', () => {
		const events: ProgressInfo[] = [];
		const spread = spreadCombinedProgress(1, 'images.pdf', (p) => events.push(p));
		spread.report(0.7, null);
		spread.finish();
		expect(events.every((p) => p.fileIndex === 0 && p.fileCount === 1)).toBe(true);
		expect(events.at(-1)!.stage).toBe('done');
	});
});
