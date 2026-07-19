import { callWorker } from '$lib/workers/rpc';
import { getPdfjs, renderPdfPageToBlob } from '$lib/pdf-preview';
import { resolvePageRange, complementPages } from '$lib/pdf-range';

export type ToolProgress = (done: number, total: number, detail: string | null) => void;

// Longest rendered side; keeps 300 DPI renders of large pages within sane RAM.
const MAX_RENDER_PX = 8192;

async function loadPdf(file: File) {
	const { PDFDocument } = await import('pdf-lib');
	let doc;
	try {
		// ignoreEncryption lets the parser read the structure so the /Encrypt
		// check below can run; truly broken content still throws here with the
		// file name attached.
		doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
	} catch (error) {
		throw new Error(
			`${file.name}: ${error instanceof Error ? error.message : 'could not read PDF'}`,
			{ cause: error }
		);
	}
	// pdf-lib cannot decrypt — editing an encrypted file (even an owner-locked
	// one that opens fine in every viewer) would silently ship ciphertext pages
	// or stamps that decrypt to garbage. Fail fast with the way out instead.
	if (doc.isEncrypted) {
		throw new Error(
			`${file.name}: this PDF is password-protected — run Compress on it first ` +
				'(that rewrites it without encryption), or remove the password with the Unlock tool'
		);
	}
	return doc;
}

/** pdf.js loader: guaranteed task cleanup on failure (each getDocument spawns
 *  its own worker) + the app's password message instead of pdf.js's raw
 *  "No password given". */
async function openPdfjsDoc(file: File) {
	const pdfjs = await getPdfjs();
	const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
	try {
		return { task, doc: await task.promise };
	} catch (error) {
		try {
			await task.destroy();
		} catch {
			// Already failed — destroy is best-effort cleanup.
		}
		const needsPassword = (error as { name?: string } | null)?.name === 'PasswordException';
		throw new Error(
			needsPassword
				? `${file.name}: this PDF is password-protected — remove the password with the Unlock tool first`
				: `${file.name}: ${error instanceof Error ? error.message : 'could not read PDF'}`,
			{ cause: error }
		);
	}
}

/** Pages copied per copyPages call — one 400-page member would otherwise be a
 *  single atomic await that Cancel cannot interrupt (O-05). */
const MERGE_COPY_CHUNK = 25;

export async function mergePdfs(
	files: File[],
	onProgress?: ToolProgress,
	signal?: AbortSignal
): Promise<Blob> {
	const { PDFDocument } = await import('pdf-lib');
	const out = await PDFDocument.create();
	for (let i = 0; i < files.length; i++) {
		signal?.throwIfAborted();
		onProgress?.(i, files.length + 1, files[i].name);
		const src = await loadPdf(files[i]);
		try {
			const indices = src.getPageIndices();
			for (let at = 0; at < indices.length; at += MERGE_COPY_CHUNK) {
				signal?.throwIfAborted();
				const pages = await out.copyPages(src, indices.slice(at, at + MERGE_COPY_CHUNK));
				for (const page of pages) out.addPage(page);
			}
		} catch (error) {
			if (signal?.aborted) throw error;
			throw new Error(
				`${files[i].name}: ${error instanceof Error ? error.message : 'copy failed'} — if the file is encrypted, run Compress on it first (that rewrites it without encryption), then merge`,
				{ cause: error }
			);
		}
	}
	signal?.throwIfAborted();
	onProgress?.(files.length, files.length + 1, 'saving');
	const bytes = await out.save();
	return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

export async function extractPages(
	file: File,
	range: string,
	mode: 'keep' | 'remove'
): Promise<{ blob: Blob; kept: number; total: number }> {
	const src = await loadPdf(file);
	const total = src.getPageCount();
	let wanted: number[];
	try {
		wanted = resolvePageRange(range, total);
	} catch (error) {
		throw new Error(`${file.name}: ${error instanceof Error ? error.message : 'invalid range'}`, {
			cause: error
		});
	}
	const keep = mode === 'keep' ? wanted : complementPages(wanted, total);
	if (!keep.length) throw new Error(`${file.name}: selection would remove every page`);

	const { PDFDocument } = await import('pdf-lib');
	const out = await PDFDocument.create();
	const pages = await out.copyPages(
		src,
		keep.map((n) => n - 1)
	);
	for (const page of pages) out.addPage(page);
	const bytes = await out.save();
	return {
		blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
		kept: keep.length,
		total
	};
}

export async function pdfToImages(
	file: File,
	opts: { dpi: 72 | 150 | 300; format: 'jpg' | 'png'; quality: number },
	onProgress?: ToolProgress
): Promise<{ blob: Blob; name: string; pages: number; warning: string | null }> {
	const { task, doc } = await openPdfjsDoc(file);
	try {
		const mime = opts.format === 'jpg' ? 'image/jpeg' : 'image/png';
		const stem = file.name.replace(/\.pdf$/i, '');
		const canvas = document.createElement('canvas'); // reused across pages
		const entries: Record<string, Uint8Array> = {};
		// Width follows the page count (min 2) so extracted files sort naturally
		// past 99 pages: p001…p120, not p01…p10,p100,p11.
		const pad = Math.max(2, String(doc.numPages).length);
		let single: Blob | null = null;
		let clampedAny = false;

		for (let n = 1; n <= doc.numPages; n++) {
			const rendered = await renderPdfPageToBlob(doc, n, {
				scale: opts.dpi / 72,
				maxPx: MAX_RENDER_PX,
				mime,
				quality: opts.quality / 100,
				canvas
			});
			clampedAny ||= rendered.clamped;
			if (doc.numPages === 1) {
				single = rendered.blob;
			} else {
				const pageName = `${stem}-p${String(n).padStart(pad, '0')}.${opts.format}`;
				entries[pageName] = new Uint8Array(await rendered.blob.arrayBuffer());
			}
			onProgress?.(n, doc.numPages, `page ${n}/${doc.numPages}`);
		}

		const warning = clampedAny ? `Very large pages were rendered below ${opts.dpi} DPI` : null;
		if (single) {
			return { blob: single, name: `${stem}.${opts.format}`, pages: 1, warning };
		}
		const { zip } = await import('fflate');
		const zipped = await new Promise<Uint8Array>((resolve, reject) =>
			// level 0: jpg/png entries are already compressed
			zip(entries, { level: 0 }, (error, data) => (error ? reject(error) : resolve(data)))
		);
		return {
			blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
			name: `${stem}-images.zip`,
			pages: doc.numPages,
			warning
		};
	} finally {
		await task.destroy();
	}
}

export async function imagesToPdf(
	files: File[],
	opts: { quality: number },
	onProgress?: ToolProgress,
	signal?: AbortSignal
): Promise<Blob> {
	const { PDFDocument } = await import('pdf-lib');
	const out = await PDFDocument.create();

	for (let i = 0; i < files.length; i++) {
		// A cancel landing between page encodes has nothing pending to reject —
		// without this check the loop would carry on to the next page.
		signal?.throwIfAborted();
		onProgress?.(i, files.length + 1, files[i].name);
		const buffer = await files[i].arrayBuffer();
		// Re-encode via the existing image worker: predictable size, EXIF applied,
		// transparency flattened to white (mozjpeg would render it black).
		const encoded = await callWorker(
			'image',
			'encode',
			{ bytes: buffer, quality: opts.quality, output: 'jpg', maxDimension: null, flatten: true },
			[buffer],
			undefined,
			{ owner: signal }
		);
		const image = await out.embedJpg(encoded.bytes);
		// Page sized to the image (1 px = 1 pt), clamped to PDF's 14400 pt limit.
		const scale = Math.min(1, 14400 / Math.max(image.width, image.height));
		const page = out.addPage([image.width * scale, image.height * scale]);
		page.drawImage(image, { x: 0, y: 0, width: image.width * scale, height: image.height * scale });
	}

	onProgress?.(files.length, files.length + 1, 'saving');
	const bytes = await out.save();
	return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** Rotate every page clockwise by `angle` — structural, content untouched. */
export async function rotatePdf(file: File, angle: 90 | 180 | 270): Promise<Blob> {
	const { degrees } = await import('pdf-lib');
	const doc = await loadPdf(file);
	for (const page of doc.getPages()) {
		page.setRotation(degrees((page.getRotation().angle + angle) % 360));
	}
	const bytes = await doc.save();
	return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** WinAnsi-safe drawText: retry without combining marks, else skip (ocr.ts pattern). */
function drawTextSafe(
	page: import('pdf-lib').PDFPage,
	text: string,
	options: import('pdf-lib').PDFPageDrawTextOptions
): void {
	try {
		page.drawText(text, options);
	} catch {
		const ascii = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
		try {
			page.drawText(ascii, options);
		} catch {
			// Unencodable even stripped — leave this page's stamp out.
		}
	}
}

/** Page /Rotate normalized to 0|90|180|270 (spec allows negatives/multiples;
 *  snap defensively — non-90° values are invalid PDF). */
function pageRotation(page: import('pdf-lib').PDFPage): number {
	const angle = ((page.getRotation().angle % 360) + 360) % 360;
	return angle - (angle % 90);
}

/** Viewers rotate page content clockwise by /Rotate, so stamps designed for
 *  the VIEWED orientation must be placed in unrotated MediaBox space. Maps a
 *  point from visual coordinates (origin at the displayed bottom-left) into
 *  page space; drawn text must additionally counter-rotate by `rotation`. */
function visualToPage(
	u: number,
	v: number,
	rotation: number,
	width: number,
	height: number
): { x: number; y: number } {
	switch (rotation) {
		case 90:
			return { x: width - v, y: u };
		case 180:
			return { x: width - u, y: height - v };
		case 270:
			return { x: v, y: height - u };
		default:
			return { x: u, y: v };
	}
}

/** Stamp `text` diagonally across the middle of every page. */
export async function watermarkPdf(file: File, text: string): Promise<Blob> {
	const { StandardFonts, degrees, rgb } = await import('pdf-lib');
	const doc = await loadPdf(file);
	const font = await doc.embedFont(StandardFonts.HelveticaBold);
	for (const page of doc.getPages()) {
		const { width, height } = page.getSize();
		// Geometry works on the page AS VIEWED: a /Rotate 90 scan is landscape
		// to the reader, so the diagonal follows the displayed page and the
		// anchor maps back into unrotated page space.
		const rotation = pageRotation(page);
		const visWidth = rotation % 180 === 0 ? width : height;
		const visHeight = rotation % 180 === 0 ? height : width;
		// Size the stamp to span most of the diagonal, capped for short texts.
		const size = Math.min(
			(Math.hypot(visWidth, visHeight) * 0.7) / Math.max(1, font.widthOfTextAtSize(text, 1)),
			Math.min(visWidth, visHeight) / 4
		);
		const textWidth = font.widthOfTextAtSize(text, size);
		const angle = Math.atan2(visHeight, visWidth);
		const anchor = visualToPage(
			visWidth / 2 - (textWidth / 2) * Math.cos(angle),
			visHeight / 2 - (textWidth / 2) * Math.sin(angle),
			rotation,
			width,
			height
		);
		drawTextSafe(page, text, {
			x: anchor.x,
			y: anchor.y,
			size,
			font,
			color: rgb(0.5, 0.5, 0.5),
			opacity: 0.18,
			rotate: degrees(rotation + (angle * 180) / Math.PI)
		});
	}
	const bytes = await doc.save();
	return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** Add "page / total" at the bottom center of every page. */
export async function pageNumbersPdf(file: File): Promise<Blob> {
	const { StandardFonts, degrees, rgb } = await import('pdf-lib');
	const doc = await loadPdf(file);
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const pages = doc.getPages();
	for (let i = 0; i < pages.length; i++) {
		const page = pages[i];
		const label = `${i + 1} / ${pages.length}`;
		const size = 10;
		// Bottom-center of the page AS VIEWED (compensating /Rotate) with the
		// label kept upright — not sideways on an edge of a rotated scan.
		const rotation = pageRotation(page);
		const visWidth = rotation % 180 === 0 ? page.getWidth() : page.getHeight();
		const anchor = visualToPage(
			visWidth / 2 - font.widthOfTextAtSize(label, size) / 2,
			24,
			rotation,
			page.getWidth(),
			page.getHeight()
		);
		drawTextSafe(page, label, {
			x: anchor.x,
			y: anchor.y,
			size,
			font,
			color: rgb(0.25, 0.25, 0.25),
			rotate: degrees(rotation)
		});
	}
	const bytes = await doc.save();
	return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** Extract the digital text layer into plain text (scans have none — that's OCR's job). */
export async function pdfToText(file: File, onProgress?: ToolProgress): Promise<Blob> {
	const { task, doc } = await openPdfjsDoc(file);
	try {
		const parts: string[] = [];
		for (let p = 1; p <= doc.numPages; p++) {
			onProgress?.(p - 1, doc.numPages, `page ${p}/${doc.numPages}`);
			const page = await doc.getPage(p);
			const content = await page.getTextContent();
			parts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
			page.cleanup();
		}
		const text = parts.join('\n\n').trim();
		if (!text) {
			throw new Error(
				`${file.name}: no digital text layer found — this looks like a scan; use the OCR PDF tool instead`
			);
		}
		return new Blob([text], { type: 'text/plain' });
	} finally {
		await task.destroy();
	}
}
