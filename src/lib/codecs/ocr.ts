import type { OcrSettings } from '$lib/types';

/**
 * OCR (tesseract.js) — main-thread codec, libraw pattern: the package runs
 * its own worker, so this file only orchestrates. All assets are self-hosted
 * (static/tesseract + static/tessdata) — the CSP, COEP and the privacy
 * promise all forbid the CDN defaults.
 *
 * One worker per language is memoized (init downloads the 1–2 MB model, the
 * SW caches it afterwards); switching language terminates and respawns.
 * Terminate is also the only way to interrupt a running recognition — abort
 * disposes the worker and the memo self-resets for the next run.
 */

const TESS_OPTIONS = {
	workerPath: '/tesseract/worker.min.js',
	corePath: '/tesseract',
	langPath: '/tessdata',
	gzip: true
};

/** tesseract.js block-tree word (the subset the overlay consumes). */
export interface OcrWord {
	text: string;
	bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface TesseractLoggerMessage {
	status: string;
	progress: number;
}

// The logger is fixed at createWorker time — a mutable ref routes it to
// whichever operation is currently running (ops are sequential per worker).
let activeLogger: ((m: TesseractLoggerMessage) => void) | null = null;

type TesseractWorker = {
	recognize: (
		image: Blob | File,
		options: Record<string, never>,
		output: { text: boolean; blocks: boolean }
	) => Promise<{ data: { text: string; blocks: OcrBlock[] | null } }>;
	terminate: () => Promise<unknown>;
};

interface OcrBlock {
	paragraphs: { lines: { words: OcrWord[] }[] }[];
}

let engine: { language: string; worker: Promise<TesseractWorker> } | null = null;

function getWorker(language: string): Promise<TesseractWorker> {
	if (engine && engine.language !== language) disposeOcr();
	if (!engine) {
		const worker = (async () => {
			const { createWorker } = await import('tesseract.js');
			return (await createWorker(language, 1, {
				...TESS_OPTIONS,
				logger: (m: TesseractLoggerMessage) => activeLogger?.(m)
			})) as unknown as TesseractWorker;
		})().catch((error) => {
			engine = null;
			throw error;
		});
		engine = { language, worker };
	}
	return engine.worker;
}

/** Terminate the OCR worker (aborts reject in-flight recognitions). */
export function disposeOcr(): void {
	const current = engine;
	engine = null;
	current?.worker.then((w) => w.terminate()).catch(() => {});
}

function wordsOf(blocks: OcrBlock[] | null): OcrWord[] {
	return (blocks ?? []).flatMap((b) =>
		b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words))
	);
}

/**
 * Map a recognized word's raster bbox onto PDF page coordinates. PDF's origin
 * is bottom-left and drawText's y is the BASELINE — the bbox bottom
 * approximates it (descenders land slightly low; invisible text doesn't
 * care, selection rectangles still line up).
 */
export function mapWordToPdf(
	word: OcrWord,
	renderWidth: number,
	renderHeight: number,
	pageWidth: number,
	pageHeight: number
): { x: number; y: number; size: number } {
	const scaleX = pageWidth / renderWidth;
	const scaleY = pageHeight / renderHeight;
	return {
		x: word.bbox.x0 * scaleX,
		y: pageHeight - word.bbox.y1 * scaleY,
		size: Math.max(1, (word.bbox.y1 - word.bbox.y0) * scaleY)
	};
}

export interface OcrOutput {
	blob: Blob;
	info: string;
}

type OnOcrProgress = (fraction: number, detail: string | null) => void;

/** Image → recognized plain text (.txt). */
export async function ocrImage(
	file: File,
	settings: OcrSettings,
	onProgress?: OnOcrProgress,
	signal?: AbortSignal
): Promise<OcrOutput> {
	signal?.throwIfAborted();
	const onAbort = () => disposeOcr();
	signal?.addEventListener('abort', onAbort, { once: true });
	try {
		activeLogger = (m) => {
			if (m.status === 'recognizing text') onProgress?.(m.progress, null);
		};
		const worker = await getWorker(settings.language);
		const { data } = await worker.recognize(file, {}, { text: true, blocks: true });
		if (!data.text.trim()) {
			throw new Error(
				'No text was recognized — check the document language, or try a sharper scan'
			);
		}
		const count = wordsOf(data.blocks).length;
		return {
			blob: new Blob([data.text], { type: 'text/plain' }),
			info: `${count} word${count === 1 ? '' : 's'} recognized · ${settings.language.toUpperCase()}`
		};
	} finally {
		activeLogger = null;
		signal?.removeEventListener('abort', onAbort);
	}
}

/** Scanned PDF → the ORIGINAL pages plus an invisible, selectable text layer. */
export async function ocrPdf(
	file: File,
	settings: OcrSettings,
	onProgress?: OnOcrProgress,
	signal?: AbortSignal
): Promise<OcrOutput> {
	signal?.throwIfAborted();
	const onAbort = () => disposeOcr();
	signal?.addEventListener('abort', onAbort, { once: true });
	try {
		const bytes = await file.arrayBuffer();
		const [{ getPdfjs, renderPdfPageToBlob }, { PDFDocument, StandardFonts }] = await Promise.all([
			import('$lib/pdf-preview'),
			import('pdf-lib')
		]);
		const pdfjs = await getPdfjs();
		const src = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
		const out = await PDFDocument.load(new Uint8Array(bytes), { ignoreEncryption: true });
		const font = await out.embedFont(StandardFonts.Helvetica);
		const worker = await getWorker(settings.language);

		const pageCount = src.numPages;
		const canvas = document.createElement('canvas');
		let totalWords = 0;
		for (let p = 1; p <= pageCount; p++) {
			signal?.throwIfAborted();
			// ~300 DPI (PDF units are 72/inch), capped like pdfToImages.
			const rendered = await renderPdfPageToBlob(src, p, {
				scale: 300 / 72,
				maxPx: 8192,
				mime: 'image/png',
				canvas
			});
			activeLogger = (m) => {
				if (m.status === 'recognizing text') {
					onProgress?.((p - 1 + m.progress) / pageCount, `page ${p}/${pageCount}`);
				}
			};
			const { data } = await worker.recognize(rendered.blob, {}, { text: true, blocks: true });
			const page = out.getPage(p - 1);
			for (const word of wordsOf(data.blocks)) {
				const text = word.text.trim();
				if (!text) continue;
				const at = mapWordToPdf(word, rendered.width, rendered.height, page.getWidth(), page.getHeight());
				try {
					page.drawText(text, { x: at.x, y: at.y, size: at.size, font, opacity: 0 });
				} catch {
					// Helvetica is WinAnsi-only — retry without combining marks, then
					// give the word up rather than fail the page (č → c stays findable).
					const ascii = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
					try {
						page.drawText(ascii, { x: at.x, y: at.y, size: at.size, font, opacity: 0 });
					} catch {
						continue;
					}
				}
				totalWords++;
			}
		}
		if (totalWords === 0) {
			throw new Error(
				'No text was recognized — check the document language, or try a sharper scan'
			);
		}
		const outBytes = await out.save();
		return {
			blob: new Blob([outBytes as BlobPart], { type: 'application/pdf' }),
			info: `${pageCount} page${pageCount === 1 ? '' : 's'} · ${totalWords} words recognized`
		};
	} finally {
		activeLogger = null;
		signal?.removeEventListener('abort', onAbort);
	}
}
