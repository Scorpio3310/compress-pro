/**
 * Filename-natural ordering (page2 < page10) for comic → PDF page order.
 * Comic readers sort pages by name, so the PDF must too. NOTE: the CBZ/EPUB
 * REPACK path deliberately keeps archive-stored order untouched (readers of
 * the container honor stored order; EB-03 pins it) — this comparator is for
 * flattening a comic into a linear page sequence only.
 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function naturalCompare(a: string, b: string): number {
	return collator.compare(a, b);
}
