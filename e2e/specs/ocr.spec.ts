/**
 * OC-01…03: the OCR tab — image → .txt (Tesseract, self-hosted langs),
 * scanned image-only PDF → searchable PDF (invisible text layer over the
 * ORIGINAL pages), op preset from the landing pages + language persistence.
 */
import { expect, fx, test } from '../fixtures';
import { compress, downloadRow, gotoPath, upload } from '../helpers';
import { pdfInfo, pdfRotations, pdfTextContent } from '../verify';

test.describe.configure({ timeout: 240_000 });

test('OC-01: /image-to-text recognizes a text image into a .txt @smoke', async ({ page }) => {
	await gotoPath(page, '/image-to-text');
	await expect(page).toHaveTitle(/Image to Text/);
	await upload(page, fx('graphic-bmp-ref.png'));
	await expect(page.getByTestId('compress-cta')).toHaveText('Recognize text in 1 file');
	await compress(page, { timeout: 180_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('graphic-bmp-ref.txt');
	expect(art.bytes.toString('utf8')).toMatch(/quick brown fox/i);
	await expect(page.getByTestId('row-info')).toContainText(/words recognized/i);
});

test('OC-02: /ocr-pdf adds an invisible text layer to an image-only scan', async ({ page }) => {
	// The fixture is IMAGE-ONLY (no text layer) — any text found in the output
	// can only have come from the recognition.
	await gotoPath(page, '/ocr-pdf');
	await expect(page).toHaveTitle(/OCR PDF/);
	await expect(page.getByText('Drop PDF files here')).toBeVisible();
	await upload(page, fx('scan-text.pdf'));
	// The settings card renders once files are parked — assert the preset then.
	await expect(
		page.getByRole('button', { name: 'Searchable PDF', exact: true }),
		'op preset from the landing page'
	).toHaveAttribute('aria-pressed', 'true');
	await compress(page, { timeout: 180_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('scan-text-searchable.pdf');
	expect((await pdfInfo(art.bytes)).pageCount).toBe(1);
	// Each word is its own invisible drawText — pdf.js joins them with
	// variable whitespace, so match across it.
	expect(await pdfTextContent(art.bytes)).toMatch(/quick\s+brown\s+fox/i);
	await expect(page.getByTestId('row-info')).toContainText(/words recognized/i);
});

test('OC-04: /ocr-pdf keeps the text layer aligned on /Rotate 90 landscape scans', async ({
	page
}) => {
	// The fixture stores the page the way ADF scanners do: portrait MediaBox,
	// content drawn 90° CCW, /Rotate 90 — viewers (and the OCR raster) see it
	// upright, but pdf-lib coordinates are the raw MediaBox.
	await gotoPath(page, '/ocr-pdf');
	await upload(page, fx('scan-text-rot90.pdf'));
	await compress(page, { timeout: 180_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('scan-text-rot90-searchable.pdf');
	expect(await pdfRotations(art.bytes), 'original page untouched').toEqual([90]);
	expect(await pdfTextContent(art.bytes)).toMatch(/quick\s+brown\s+fox/i);
	// The invisible words must run ALONG the visible text: on a /Rotate 90
	// page that is a 90° baseline in raw page space — text matrix [a b c d]
	// with a ≈ 0, b > 0. The unrotated-mapping bug drew a > 0, b = 0
	// (perpendicular to the visible lines, unselectable), so this is the
	// red/green seam.
	const items = await pdfTextTransforms(art.bytes);
	expect(items.length).toBeGreaterThan(5);
	const { pageSizes } = await pdfInfo(art.bytes);
	for (const t of items) {
		expect(Math.abs(t.a), `${t.str}: baseline must not run along raw x`).toBeLessThan(0.01);
		expect(t.b, `${t.str}: baseline runs up the raw page`).toBeGreaterThan(0);
		expect(t.e, `${t.str}: anchor inside MediaBox`).toBeGreaterThanOrEqual(0);
		expect(t.e).toBeLessThanOrEqual(pageSizes[0].w);
		expect(t.f).toBeGreaterThanOrEqual(0);
		expect(t.f).toBeLessThanOrEqual(pageSizes[0].h);
	}
});

test('OC-05: /ocr-pdf refuses a password-protected (owner-locked) scan up front', async ({
	page
}) => {
	// Owner-locked scans open fine in every viewer (empty user password), but
	// pdf-lib cannot decrypt them — before the guard this produced a corrupt
	// "-searchable.pdf" after a full recognition pass.
	await gotoPath(page, '/ocr-pdf');
	await upload(page, fx('scan-text-locked.pdf'));
	const run = await compress(page, { expectError: true });
	expect(run.error).toMatch(/password-protected/i);
	expect(run.error, 'points at the unlock tool').toMatch(/unlock-pdf/i);
});

test('OC-03: the language choice persists across a navigation', async ({ page }) => {
	await gotoPath(page, '/image-to-text');
	await upload(page, fx('graphic-bmp-ref.png'));
	await page.locator('#ocr-language').selectOption('deu');
	// Full re-navigation (hydration-safe, unlike a bare reload) — the persisted
	// settings store must bring the language back.
	await gotoPath(page, '/image-to-text');
	await upload(page, fx('graphic-bmp-ref.png'));
	await expect(page.locator('#ocr-language')).toHaveValue('deu');
});

/** Non-whitespace text items with their text-matrix basis + anchor (raw PDF
 *  page space) — rotation verification needs the full transform, which
 *  verify.ts's pdfTextContent flattens away. */
async function pdfTextTransforms(
	buf: Buffer
): Promise<{ str: string; a: number; b: number; e: number; f: number }[]> {
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
	const doc = await task.promise;
	const out: { str: string; a: number; b: number; e: number; f: number }[] = [];
	for (let p = 1; p <= doc.numPages; p++) {
		const content = await (await doc.getPage(p)).getTextContent();
		for (const item of content.items) {
			if ('str' in item && item.str.trim()) {
				const [a, b, , , e, f] = item.transform as number[];
				out.push({ str: item.str, a, b, e, f });
			}
		}
	}
	await task.destroy();
	return out;
}
