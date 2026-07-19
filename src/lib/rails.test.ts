import { describe, expect, it } from 'vitest';
import { EBOOK_OUTPUTS, FONT_OPS, OCR_OPS, PDF_OPS, SUBTITLE_TARGETS, ZIP_OPS } from './rails';

// The rail item ids are e2e hooks (`button[data-seg="<id>"]`) and the labels
// are clicked by EXACT accessible name — both are contracts, pinned verbatim.
describe('rail op lists', () => {
	it('pins the PDF ops and their exact labels', () => {
		expect(PDF_OPS).toEqual([
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
		]);
	});

	it('pins the archive, font, ocr, subtitle and ebook rails', () => {
		expect(ZIP_OPS).toEqual([
			{ id: 'create', label: 'Create' },
			{ id: 'extract', label: 'Extract' },
			{ id: 'convert', label: 'Convert' }
		]);
		expect(FONT_OPS).toEqual([
			{ id: 'convert', label: 'Convert' },
			{ id: 'subset', label: 'Subset' }
		]);
		expect(OCR_OPS).toEqual([
			{ id: 'toText', label: 'Extract text' },
			{ id: 'toPdf', label: 'Searchable PDF' }
		]);
		expect(SUBTITLE_TARGETS).toEqual([
			{ id: 'vtt', label: 'To VTT' },
			{ id: 'srt', label: 'To SRT' }
		]);
		expect(EBOOK_OUTPUTS).toEqual([
			{ id: 'auto', label: 'Compress' },
			{ id: 'txt', label: 'To TXT' },
			{ id: 'pdf', label: 'To PDF' }
		]);
	});

	it('never repeats an accessible name within a group (strict-mode safety)', () => {
		for (const group of [PDF_OPS, ZIP_OPS, FONT_OPS, OCR_OPS, SUBTITLE_TARGETS, EBOOK_OUTPUTS]) {
			const labels = group.map((o) => o.label);
			expect(new Set(labels).size).toBe(labels.length);
		}
	});
});
