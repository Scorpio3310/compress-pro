/**
 * OC-01…03: the OCR tab — image → .txt (Tesseract, self-hosted langs),
 * scanned image-only PDF → searchable PDF (invisible text layer over the
 * ORIGINAL pages), op preset from the landing pages + language persistence.
 */
import { expect, fx, test } from '../fixtures';
import { compress, downloadRow, gotoPath, upload } from '../helpers';
import { pdfInfo, pdfTextContent } from '../verify';

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
