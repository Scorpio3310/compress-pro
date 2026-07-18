// Page-range grammar: comma-separated terms `N`, `N-M`, `N-` (open end), `-M`
// (from page 1). 1-based, whitespace-tolerant.

const TERM = /^(?:(\d+)\s*-\s*(\d+)?|-\s*(\d+)|(\d+))$/;

const HINT = 'Enter pages, e.g. 1-3,7,12-';

/** Syntax-only check for live UI validation; null = valid. */
export function validatePageRangeSyntax(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return HINT;
	for (const raw of trimmed.split(',')) {
		const term = raw.trim();
		if (!term || !TERM.test(term)) return `Invalid range "${raw.trim() || ','}" — ${HINT}`;
	}
	return null;
}

/** Resolves to a sorted, unique, 1-based page list; throws with a precise message. */
export function resolvePageRange(input: string, pageCount: number): number[] {
	const syntaxError = validatePageRangeSyntax(input);
	if (syntaxError) throw new Error(syntaxError);

	const pages = new Set<number>();
	for (const raw of input.trim().split(',')) {
		const match = TERM.exec(raw.trim());
		if (!match) continue;
		let from: number;
		// null = open end ("N-"), resolved to the last page AFTER bounds checks —
		// otherwise "12-" on a 5-page doc reports a phantom "12-5 is reversed"
		// instead of the real problem (page 12 doesn't exist).
		let to: number | null;
		if (match[4] !== undefined) {
			from = Number(match[4]);
			to = from;
		} else if (match[3] !== undefined) {
			from = 1;
			to = Number(match[3]);
		} else {
			from = Number(match[1]);
			to = match[2] !== undefined ? Number(match[2]) : null;
		}
		const typed = to === null ? [from] : [from, to];
		const outOfRange = typed.find((p) => p < 1 || p > pageCount);
		if (outOfRange !== undefined) {
			throw new Error(
				`page ${outOfRange} is out of range (document has ${pageCount} page${pageCount === 1 ? '' : 's'})`
			);
		}
		const end = to ?? pageCount;
		if (from > end) throw new Error(`range ${from}-${end} is reversed`);
		for (let p = from; p <= end; p++) pages.add(p);
	}
	return [...pages].sort((a, b) => a - b);
}

export function complementPages(pages: number[], pageCount: number): number[] {
	const remove = new Set(pages);
	const keep: number[] = [];
	for (let p = 1; p <= pageCount; p++) if (!remove.has(p)) keep.push(p);
	return keep;
}
