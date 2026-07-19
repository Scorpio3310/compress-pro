import type { FontOp, OcrSettings, PdfOp, SubtitleSettings, ZipSettings } from './types';

/** One item of a secondary op rail. `id` doubles as the e2e hook
 *  (`button[data-seg="<id>"]`) and `label` as the exact accessible name —
 *  both are pinned by tests, treat them as contracts. */
export interface RailItem {
	id: string;
	label: string;
}

/** Secondary-rail descriptor: which op group sits under the primary tabs,
 *  which item is selected, and where a click goes. +page builds it from the
 *  persisted settings; Tabs renders it without knowing any op semantics.
 *  (The Images rail is not a Rail — it's format LINKS, special-cased in Tabs.) */
export interface Rail {
	/** Stable group key — remounts the track (and its thumb) when it changes. */
	group: string;
	/** aria-label for the rail's group element. */
	label: string;
	items: RailItem[];
	value: string;
	onselect: (id: string) => void;
}

export const PDF_OPS: { id: PdfOp; label: string }[] = [
	{ id: 'compress', label: 'Compress' },
	{ id: 'merge', label: 'Merge' },
	{ id: 'pages', label: 'Pages' },
	{ id: 'toImages', label: 'To images' },
	{ id: 'fromImages', label: 'From images' },
	{ id: 'unlock', label: 'Unlock' },
	{ id: 'protect', label: 'Protect' },
	{ id: 'rotate', label: 'Rotate' },
	{ id: 'watermark', label: 'Watermark' },
	{ id: 'pageNumbers', label: 'Numbers' },
	{ id: 'toText', label: 'To text' },
	{ id: 'grayscale', label: 'Grayscale' },
	{ id: 'toPdfa', label: 'PDF/A' }
];
export const ZIP_OPS: { id: ZipSettings['op']; label: string }[] = [
	{ id: 'create', label: 'Create' },
	{ id: 'extract', label: 'Extract' },
	{ id: 'convert', label: 'Convert' }
];
export const FONT_OPS: { id: FontOp; label: string }[] = [
	{ id: 'convert', label: 'Convert' },
	{ id: 'subset', label: 'Subset' }
];
export const OCR_OPS: { id: OcrSettings['op']; label: string }[] = [
	{ id: 'toText', label: 'Extract text' },
	{ id: 'toPdf', label: 'Searchable PDF' }
];
export const SUBTITLE_TARGETS: { id: SubtitleSettings['to']; label: string }[] = [
	{ id: 'vtt', label: 'To VTT' },
	{ id: 'srt', label: 'To SRT' }
];
