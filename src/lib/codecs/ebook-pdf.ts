/**
 * CBZ/CBR → PDF. A comic is a linear sequence of raster pages; pdf-lib embeds
 * JPEG bytes VERBATIM (embedJpg) and PNG pixels losslessly (embedPng re-wraps
 * IDAT into PDF Flate — pixel-exact, though the stream can GROW vs a
 * well-compressed source PNG; measured +8 MB on a 17 MB PNG page), each page
 * sized to its image. WebP/GIF pages take one trip through the pooled image
 * worker to JPEG first. Pages are ordered filename-naturally (page2 before
 * page10) — how every comic reader presents them; ComicInfo.xml and other
 * non-image entries are skipped by magic-byte sniffing.
 *
 * pdf-lib holds the whole document in memory (roughly input + output live at
 * once), so a hard input ceiling keeps a 2 GB tab limit honest.
 */
import type { EbookSettings, UploadedFile } from '$lib/types';
import { callWorker } from '$lib/workers/rpc';
import { readArchive, sniffImage, sniffGif } from './ebook';
import { naturalCompare } from './natural-sort';

export interface ComicPdfResult {
	blob: Blob;
	pages: number;
	/** Pages embedded byte-verbatim (jpg/png) vs transcoded (webp/gif). */
	lossless: number;
	transcoded: number;
}

/** pdf-lib duplicates page data across doc + save buffers — past this the tab
 *  is at real OOM risk (the archive 2 GiB extract ceiling's sibling). */
export const COMIC_PDF_MAX_BYTES = 1_073_741_824; // 1 GiB of image pages

/** PDF page-size ceiling is 14 400 pt per side (imagesToPdf precedent). */
const MAX_PAGE_PT = 14_400;

export async function comicToPdf(
	file: UploadedFile,
	settings: EbookSettings,
	onProgress: (fraction: number, detail: string | null) => void,
	signal?: AbortSignal
): Promise<ComicPdfResult> {
	const { entries } = await readArchive(file, onProgress, signal);

	const pages = entries
		.map((e) => ({ ...e, kind: sniffImage(e.bytes) ?? (sniffGif(e.bytes) ? 'gif' : null) }))
		.filter(
			(e): e is { name: string; bytes: Uint8Array; kind: 'jpg' | 'png' | 'webp' | 'gif' } =>
				e.kind !== null
		)
		.sort((a, b) => naturalCompare(a.name, b.name));

	if (pages.length === 0) {
		throw new Error('No image pages found in this archive — is it really a comic?');
	}
	const totalBytes = pages.reduce((n, p) => n + p.bytes.length, 0);
	if (totalBytes > COMIC_PDF_MAX_BYTES) {
		throw new Error(
			`This comic's pages add up to ${Math.round(totalBytes / 1_000_000)} MB — too large to build a PDF in browser memory (limit 1 GB). Split it and convert the parts`
		);
	}

	const { PDFDocument } = await import('pdf-lib');
	const doc = await PDFDocument.create();
	let lossless = 0;
	let transcoded = 0;
	for (let i = 0; i < pages.length; i++) {
		signal?.throwIfAborted();
		const page = pages[i];
		let image;
		if (page.kind === 'jpg') {
			image = await doc.embedJpg(page.bytes);
			lossless++;
		} else if (page.kind === 'png') {
			image = await doc.embedPng(page.bytes);
			lossless++;
		} else {
			// WebP/GIF have no PDF-native encoding — one worker pass to JPEG.
			// Copy before transfer: the entry buffer may be a view we still hold.
			const buf = page.bytes.slice().buffer as ArrayBuffer;
			const out = await callWorker(
				'image',
				'encode',
				{
					bytes: buf,
					quality: settings.quality,
					output: 'jpg',
					maxDimension: settings.maxDimension,
					flatten: true
				},
				[buf],
				undefined,
				{ owner: signal }
			);
			image = await doc.embedJpg(new Uint8Array(out.bytes));
			transcoded++;
		}
		const scale = Math.min(1, MAX_PAGE_PT / Math.max(image.width, image.height));
		const pdfPage = doc.addPage([image.width * scale, image.height * scale]);
		pdfPage.drawImage(image, {
			x: 0,
			y: 0,
			width: image.width * scale,
			height: image.height * scale
		});
		onProgress(0.2 + 0.75 * ((i + 1) / pages.length), `page ${i + 1}/${pages.length}`);
	}

	const bytes = await doc.save();
	return {
		blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
		pages: pages.length,
		lossless,
		transcoded
	};
}
