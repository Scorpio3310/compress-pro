import type { ProgressInfo } from '$lib/types';

/**
 * Progress spreader for combined-output ops (PDF merge, images→PDF, archive
 * create): ONE output from N inputs, but the page seeds one progress row per
 * input file and derives the aggregate as the mean of row fractions.
 * Reporting everything as fileIndex 0 / fileCount 1 froze rows 2..N on
 * "queued" and the header on "0/N done" for the entire run.
 *
 * This maps the op's single overall fraction F onto the N rows: floor(F·N)
 * rows read done, the next row carries the remainder — so the page's mean
 * equals F exactly and the "K/N done" header advances. The LAST row never
 * flips early; it stays processing until finish() so a run is visibly alive
 * through the final phase (fflate zip, gs compress, PDF save).
 */
export function spreadCombinedProgress(
	fileCount: number,
	outName: string,
	onProgress: (progress: ProgressInfo) => void
): {
	/** Overall 0..1 fraction (monotonic — rewinds are clamped; null keeps the
	 *  previous fraction and only refreshes the detail line). */
	report: (fraction: number | null, detail: string | null) => void;
	finish: () => void;
} {
	const count = Math.max(1, fileCount);
	let doneRows = 0;
	let peak = 0;

	const row = (
		fileIndex: number,
		fileFraction: number,
		stage: 'processing' | 'done',
		detail: string | null
	) => onProgress({ fileIndex, fileCount: count, fileName: outName, fileFraction, detail, stage });

	const report = (fraction: number | null, detail: string | null) => {
		if (fraction != null) peak = Math.max(peak, Math.min(fraction, 1));
		const target = peak * count;
		const active = Math.min(Math.floor(target), count - 1);
		while (doneRows < active) row(doneRows++, 1, 'done', null);
		row(active, Math.min(Math.max(target - active, 0), 1), 'processing', detail);
	};

	const finish = () => {
		while (doneRows < count) row(doneRows++, 1, 'done', null);
	};

	return { report, finish };
}
