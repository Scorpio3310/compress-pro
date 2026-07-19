/**
 * TS-01…07: tab-bar scroll affordances (chevron nudgers, hidden-scrollbar
 * tracks) and the op rails added for OCR / subtitles / ebooks. Chevrons are
 * presentation-only (aria-hidden, no data-seg) and desktop-only (fine
 * pointer); visibility mirrors the track's data-scroll state. The OCR rail
 * governs the dropzone accept BEFORE upload — the old trap where a persisted
 * "Searchable PDF" op silently pinned a PDF-only intake under an
 * image-extraction H1 is now visible and flippable.
 */
import { expect, fx, test } from '../fixtures';
import { gotoPath, rows, upload } from '../helpers';

const primaryNav = '[data-chevrons]:has(nav[aria-label="File format"])';
const OCR_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
const OCR_PDF_ACCEPT = 'application/pdf,.pdf';

test('TS-01: primary bar chevron reveals the off-screen tabs on a narrow window', async ({
	page
}) => {
	await page.setViewportSize({ width: 700, height: 900 });
	await gotoPath(page, '/compress-pdf');
	const nav = page.locator('nav[aria-label="File format"]');
	const right = page.locator(`${primaryNav} [data-chev="right"]`);
	const left = page.locator(`${primaryNav} [data-chev="left"]`);
	await expect(right).toBeVisible();
	await expect(left).toBeHidden();
	await right.click();
	await expect.poll(() => nav.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
	// one more nudge if the first didn't reach the end yet
	if (await right.isVisible()) await right.click();
	await expect(page.locator('a[data-seg="data"]')).toBeInViewport();
	await expect(left).toBeVisible();
});

test('TS-02: op-rail chevron shows on overflow and never intercepts op clicks', async ({
	page
}) => {
	await page.setViewportSize({ width: 700, height: 900 });
	await gotoPath(page, '/compress-pdf');
	await expect(
		page.locator('[data-chevrons]:has([aria-label="PDF tool"]) [data-chev="right"]')
	).toBeVisible();
	await page.getByRole('button', { name: 'PDF/A', exact: true }).click();
	await expect(page.locator('button[data-seg="toPdfa"]')).toHaveAttribute('aria-pressed', 'true');
});

test('TS-03: chevrons stay out of the a11y tree and the data-seg contract', async ({ page }) => {
	await gotoPath(page, '/compress-pdf');
	const chevs = page.locator('[data-chev]');
	await expect(chevs).toHaveCount(4); // 2 per track, hidden unless scrollable
	for (const chev of await chevs.all()) {
		await expect(chev).toHaveAttribute('aria-hidden', 'true');
		await expect(chev).toHaveAttribute('tabindex', '-1');
	}
	// exactly the 13 PDF ops — chevrons must never add data-seg buttons
	await expect(page.locator('button[data-seg]')).toHaveCount(13);
});

test('TS-04: flipping the OCR rail swaps the accepted inputs and clears the batch', async ({
	page
}) => {
	await gotoPath(page, '/ocr-pdf');
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', OCR_PDF_ACCEPT);
	await upload(page, fx('scan-text.pdf'));
	await expect(rows(page)).toHaveCount(1);
	// toText reads images — the parked PDF cannot survive the flip
	await page.getByRole('button', { name: 'Extract text', exact: true }).click();
	await expect(rows(page)).toHaveCount(0);
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', OCR_IMAGE_ACCEPT);
	await expect(page.getByText('Drop images here')).toBeVisible();
	await page.getByRole('button', { name: 'Searchable PDF', exact: true }).click();
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', OCR_PDF_ACCEPT);
	await expect(page.getByText('Drop PDF files here')).toBeVisible();
});

test('TS-05: a persisted Searchable PDF op is visible (and fixable) on /image-to-text', async ({
	page
}) => {
	await gotoPath(page, '/ocr-pdf'); // preset persists op: 'toPdf'
	await gotoPath(page, '/image-to-text'); // hub carries no preset — op sticks
	await expect(page.getByRole('button', { name: 'Searchable PDF', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', OCR_PDF_ACCEPT);
	// one visible click restores the page's promised image intake
	await page.getByRole('button', { name: 'Extract text', exact: true }).click();
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', OCR_IMAGE_ACCEPT);
	await expect(page.getByText('Drop images here')).toBeVisible();
});

test('TS-06: the subtitle rail flips the target before any file is uploaded', async ({ page }) => {
	await gotoPath(page, '/srt-to-vtt');
	await expect(page.getByRole('button', { name: 'To VTT', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: 'To SRT', exact: true }).click();
	await expect(page.getByRole('button', { name: 'To SRT', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await upload(page, fx('sample.srt'));
	await expect(page.getByTestId('compress-cta')).toHaveText('Convert 1 file to SRT');
});

test('TS-07: the ebook rail shows all outputs pre-upload, mix-filters after, keeps files on flip', async ({
	page
}) => {
	await gotoPath(page, '/compress-epub');
	for (const name of ['Compress', 'To TXT', 'To PDF']) {
		await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
	}
	await upload(page, fx('sample.epub'));
	// an EPUB batch can't become a PDF — the item leaves the rail
	await expect(page.getByRole('button', { name: 'To PDF', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'To TXT', exact: true }).click();
	await expect(page.getByRole('button', { name: 'To TXT', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	// same inputs for every output — the flip keeps the parked file
	await expect(rows(page)).toHaveCount(1);
	await expect(page.getByTestId('compress-cta')).toHaveText('Extract text from 1 file');
});

test('TS-08: no ghost chevron when the ebook rail shrinks under a stale thumb', async ({
	page
}) => {
	// With "To PDF" selected, an EPUB drop removes that item and snaps the
	// selection to Compress. The thumb springs back from the removed segment —
	// its transient overhang must never stamp data-scroll on the shrunk track
	// (the scroll hint measures segs, not scrollWidth).
	await gotoPath(page, '/compress-epub');
	await page.getByRole('button', { name: 'To PDF', exact: true }).click();
	await upload(page, fx('sample.epub'));
	await expect(page.getByRole('button', { name: 'Compress', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	const railWrap = page.locator('[data-chevrons]:has([aria-label="E-book output"])');
	await expect(railWrap.locator('[data-chev]:visible')).toHaveCount(0);
	await expect(railWrap.locator('[aria-label="E-book output"]')).not.toHaveAttribute(
		'data-scroll',
		/.+/
	);
	// both remaining items stay fully usable
	await page.getByRole('button', { name: 'To TXT', exact: true }).click();
	await expect(page.getByRole('button', { name: 'To TXT', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});
