// Per-page head/meta + intake details (title/description/tagline/og, steps,
// related, converter preset/accept) for the 'pdf' tool group — extracted
// verbatim from the pre-split seo.ts (parity is pinned by the byte-identical
// prerender diff). This is now the authoring source for these fields; loaded
// lazily via seo-detail/index.ts, statically by seo-full.server.ts.
import type { ConverterDetail, SeoDetail } from '$lib/seo';

export const DETAILS: Record<string, SeoDetail | ConverterDetail> = {
	'compress-pdf': {
		ogImage: '/og/compress-pdf.jpg',
		title: 'Compress PDF Online — No Upload, 100% Private | Compress Pro',
		description:
			'Reduce PDF file size right in your browser. Choose a preset or a target size like 2 MB. No uploads — documents never leave your device. Free & private.',
		tagline: 'Shrink PDFs in your browser — files are never uploaded.',
		related: ['/pdf-to-jpg', '/jpg-to-pdf', '/merge-pdf', '/zip-files']
	},
	'jpg-to-pdf': {
		ogImage: '/og/jpg-to-pdf.jpg',
		preset: { kind: 'pdf-from-images' },
		title: 'JPG to PDF Converter — Combine Images, Private | Compress Pro',
		description:
			'Combine JPG photos into a single PDF right in your browser — one page per image, in your order. Reorder pages, set JPEG quality, download. No uploads. Free.',
		tagline: 'JPGs into one PDF, page per image — built in your browser.',
		related: ['/compress-pdf', '/pdf-to-jpg', '/png-to-pdf', '/compress-jpg']
	},
	'png-to-pdf': {
		ogImage: '/og/png-to-pdf.jpg',
		preset: { kind: 'pdf-from-images' },
		accept: 'image/png,.png',
		dropSubject: 'PNG files',
		dropHint: 'PNG images · combined into one PDF locally',
		title: 'PNG to PDF — Turn Screenshots into One File | Compress Pro',
		description:
			'Turn PNG screenshots and graphics into a single PDF in your browser — one page per image, in your order. Nothing is uploaded or watermarked. Free.',
		tagline: 'PNG screenshots into one PDF — assembled on your device.',
		related: ['/jpg-to-pdf', '/compress-pdf', '/compress-png']
	},
	'pdf-to-jpg': {
		ogImage: '/og/pdf-to-jpg.jpg',
		preset: { kind: 'pdf-to-images', imageFormat: 'jpg' },
		title: 'PDF to JPG Converter — Every Page, No Upload | Compress Pro',
		description:
			'Turn PDF pages into JPG images entirely in your browser. Choose 72–300 DPI and JPEG quality; multi-page PDFs download as a ZIP of images. No uploads. Free.',
		tagline: 'PDF pages to JPG images — rendered 100% in your browser.',
		related: ['/compress-pdf', '/jpg-to-pdf', '/split-pdf', '/pdf-to-png']
	},
	'pdf-to-png': {
		ogImage: '/og/pdf-to-png.jpg',
		preset: { kind: 'pdf-to-images', imageFormat: 'png' },
		dropSubject: 'PDF files',
		dropHint: 'PDF pages · rendered to PNG locally',
		title: 'PDF to PNG Converter — Lossless Pages, Local | Compress Pro',
		description:
			'Turn PDF pages into crisp lossless PNG images in your browser. Pick 72–300 DPI; multi-page files download as a ZIP. Nothing is uploaded, ever. Free.',
		tagline: 'PDF pages become lossless PNGs — rendered on your device.',
		related: ['/pdf-to-jpg', '/compress-pdf', '/compress-png']
	},
	'unlock-pdf': {
		ogImage: '/og/unlock-pdf.jpg',
		preset: { kind: 'pdf-op', op: 'unlock' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'Password-protected PDFs · unlocked locally',
		title: 'Unlock PDF Online — Remove Password Locally | Compress Pro',
		description:
			'Remove a password from a PDF you own — right in your browser. The file and the password never leave your device. Free, private, no upload, no sign-up.',
		tagline: 'Remove PDF passwords locally — nothing ever gets uploaded.',
		related: ['/compress-pdf', '/protect-pdf', '/merge-pdf', '/split-pdf']
	},
	'protect-pdf': {
		ogImage: '/og/protect-pdf.jpg',
		preset: { kind: 'pdf-op', op: 'protect' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF files · password-protected locally',
		title: 'Protect PDF with a Password — Free & Private | Compress Pro',
		description:
			'Add a password to a PDF right in your browser — real AES-256 encryption, run locally. The file and the password never leave your device. Free & unlimited.',
		tagline: 'Password-protect PDFs locally — no uploads, no accounts.',
		related: ['/compress-pdf', '/unlock-pdf', '/protect-zip', '/split-pdf']
	},
	'rotate-pdf': {
		ogImage: '/og/rotate-pdf.jpg',
		preset: { kind: 'pdf-op', op: 'rotate' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'Sideways PDFs · rotated locally',
		title: 'Rotate PDF Online — Free, Private, No Upload | Compress Pro',
		description:
			'Rotate PDF pages right in your browser — 90° either way or 180°, applied structurally without re-encoding. No uploads, no accounts, free & unlimited.',
		tagline: 'Sideways scans turned upright — rotated on your device.',
		related: ['/split-pdf', '/compress-pdf', '/merge-pdf']
	},
	'watermark-pdf': {
		ogImage: '/og/watermark-pdf.jpg',
		preset: { kind: 'pdf-op', op: 'watermark' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF documents · stamped locally',
		title: 'Watermark PDF — Stamp Text Across Pages | Compress Pro',
		description:
			'Add a diagonal text watermark to every PDF page right in your browser — CONFIDENTIAL, DRAFT or your own text. Nothing is uploaded anywhere. Free.',
		tagline: 'Your stamp on every page — added right in your browser.',
		related: ['/pdf-page-numbers', '/protect-pdf', '/compress-pdf']
	},
	'pdf-page-numbers': {
		ogImage: '/og/pdf-page-numbers.jpg',
		preset: { kind: 'pdf-op', op: 'pageNumbers' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF documents · numbered locally',
		title: 'Add Page Numbers to PDF — Free & Private | Compress Pro',
		description:
			'Add page numbers to a PDF right in your browser — “page / total” at the bottom of every page, nothing else touched. No uploads, no sign-up. Free.',
		tagline: 'Every page numbered in seconds — done on your own device.',
		related: ['/watermark-pdf', '/merge-pdf', '/compress-pdf']
	},
	'pdf-to-text': {
		ogImage: '/og/pdf-to-text.jpg',
		preset: { kind: 'pdf-op', op: 'toText' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'Digital PDFs · text extracted locally',
		title: 'PDF to Text Converter — Extract Text Free | Compress Pro',
		description:
			'Extract all text from a PDF into a .txt file right in your browser — digital documents only, scans need OCR. No uploads, no length limits. Free.',
		tagline: 'The words out of any digital PDF — extracted on-device.',
		related: ['/ocr-pdf', '/pdf-to-jpg', '/epub-to-txt', '/compress-pdf']
	},
	'grayscale-pdf': {
		ogImage: '/og/grayscale-pdf.jpg',
		preset: { kind: 'pdf-op', op: 'grayscale' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'Color PDFs · converted to grayscale locally',
		title: 'Grayscale PDF — Convert to Black & White | Compress Pro',
		description:
			'Convert a color PDF to grayscale right in your browser — smaller files, ink-friendly printing, consistent mono look. Nothing is uploaded. Free.',
		tagline: 'Color PDFs turned print-ready grayscale — all in-browser.',
		related: ['/compress-pdf', '/pdf-to-pdfa', '/pdf-to-jpg']
	},
	'pdf-to-pdfa': {
		ogImage: '/og/pdf-to-pdfa.jpg',
		preset: { kind: 'pdf-op', op: 'toPdfa' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF documents · archived as PDF/A locally',
		title: 'PDF to PDF/A Converter — ISO Archival | Compress Pro',
		description:
			'Convert PDFs to PDF/A-2b right in your browser — the ISO archival standard courts and registries require. Ghostscript runs locally, zero uploads. Free.',
		tagline: 'Archive-grade PDF/A-2b conversion — run on your device.',
		related: ['/compress-pdf', '/grayscale-pdf', '/merge-pdf']
	},
	'merge-pdf': {
		ogImage: '/og/merge-pdf.jpg',
		preset: { kind: 'pdf-op', op: 'merge' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF files · merged locally in your order',
		title: 'Merge PDF Files — Combine PDFs Privately | Compress Pro',
		description:
			'Merge multiple PDFs into one document right in your browser — drag to reorder, optionally compress the result. Files never leave your device. Free.',
		tagline: 'Combine PDFs into one file locally — nothing is uploaded.',
		related: ['/split-pdf', '/compress-pdf', '/unlock-pdf']
	},
	'split-pdf': {
		ogImage: '/og/split-pdf.jpg',
		preset: { kind: 'pdf-op', op: 'pages' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF files · pages extracted locally',
		title: 'Split PDF — Extract or Remove Pages Privately | Compress Pro',
		description:
			'Split a PDF in your browser — keep only the pages you need or delete the ones you don’t, with ranges like 1-3,7. The file never leaves your device. Free.',
		tagline: 'Extract or remove PDF pages locally — nothing is uploaded.',
		related: ['/extract-pages-from-pdf', '/delete-pages-from-pdf', '/merge-pdf', '/compress-pdf']
	},
	// Same 'pages' engine as split-pdf, landed in a fixed direction — the search
	// intents ("extract pages from pdf" / "delete pages from pdf") are distinct.
	'extract-pages-from-pdf': {
		ogImage: '/og/extract-pages-from-pdf.jpg',
		preset: { kind: 'pdf-op', op: 'pages', pageMode: 'keep' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF files · listed pages pulled out locally',
		title: 'Extract PDF Pages — Free, Private, No Upload | Compress Pro',
		description:
			'Pull only the pages you list out of a PDF, right in your browser — ranges like 1-3,7 become a clean new document. Nothing is uploaded. Free, no limits.',
		tagline: 'Just the PDF pages you need, pulled out on your device.',
		related: ['/delete-pages-from-pdf', '/split-pdf', '/merge-pdf']
	},
	'delete-pages-from-pdf': {
		ogImage: '/og/delete-pages-from-pdf.jpg',
		preset: { kind: 'pdf-op', op: 'pages', pageMode: 'remove' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF files · listed pages removed locally',
		title: 'Delete Pages from a PDF — Free, No Upload | Compress Pro',
		description:
			'Remove the pages you list from a PDF right in your browser — ranges like 1-3,7 delete cover sheets, blanks or whole sections. Nothing is uploaded. Free.',
		tagline: 'Unwanted PDF pages deleted on your own device, privately.',
		related: ['/extract-pages-from-pdf', '/split-pdf', '/compress-pdf']
	}
};
