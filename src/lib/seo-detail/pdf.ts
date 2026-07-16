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
			'Add a password to a PDF right in your browser. Encryption runs locally — the file and the password never leave your device. Free, private and unlimited.',
		tagline: 'Password-protect PDFs locally — no uploads, no accounts.',
		related: ['/compress-pdf', '/unlock-pdf', '/split-pdf']
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
		related: ['/merge-pdf', '/compress-pdf', '/pdf-to-jpg']
	}
};
