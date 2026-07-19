/**
 * EB-01…16: the ebook tab — EPUB/CBZ/CBR image recompression, plus the
 * converter outputs: EPUB → TXT (spine-ordered text extraction) and CBZ/CBR →
 * PDF (pages embedded losslessly). The container is rebuilt as a ZIP
 * (mimetype-first/stored for EPUB), raster images inside re-encode in their
 * own format with a per-entry keep-original guard, and everything else passes
 * through byte-identical.
 */
import { readFileSync } from 'node:fs';
import { expect, fx, test } from '../fixtures';
import {
	compress,
	downloadRow,
	gotoPath,
	rasterizePdfInPage,
	setEbookQuality,
	upload
} from '../helpers';
import {
	imageMeta,
	jpegSosOffset,
	pdfInfo,
	pixelDiff,
	sevenZipEntries,
	unzip,
	zipCentralNames,
	zipFirstEntry
} from '../verify';

const CBZ_ORDER = [
	'page01.jpg',
	'page02.jpg',
	'page03.jpg',
	'page04.jpg',
	'page05.webp',
	'page06.gif',
	'ComicInfo.xml'
];

test('EB-01: /compress-epub recompresses the images, keeps everything else @smoke', async ({
	page
}) => {
	await gotoPath(page, '/compress-epub');
	await expect(page).toHaveTitle(/Compress EPUB/);
	// hub = tab home: the dropzone accepts the whole family
	await expect(page.getByText('Drop EPUB, CBZ or CBR files here')).toBeVisible();
	await upload(page, fx('sample.epub'));
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.epub');
	const source = readFileSync(fx('sample.epub'));
	expect(art.bytes.length).toBeLessThan(source.length);
	// OCF rule survives the rebuild: first LOCAL header is mimetype, stored.
	expect(zipFirstEntry(art.bytes)).toEqual({ name: 'mimetype', method: 0 });
	const out = unzip(art.bytes);
	const src = unzip(source);
	expect(Object.keys(out).sort()).toEqual(Object.keys(src).sort());
	expect(Buffer.from(out['mimetype']).toString()).toBe('application/epub+zip');
	// text/structure byte-identical
	for (const name of [
		'META-INF/container.xml',
		'OEBPS/content.opf',
		'OEBPS/nav.xhtml',
		'OEBPS/chapter1.xhtml'
	]) {
		expect(Buffer.compare(Buffer.from(out[name]), Buffer.from(src[name])), name).toBe(0);
	}
	// images: smaller, same format, same dims; png keeps alpha
	for (const name of [
		'OEBPS/images/photo1.jpg',
		'OEBPS/images/photo2.jpg',
		'OEBPS/images/diagram.png'
	]) {
		expect(out[name].length, name).toBeLessThan(src[name].length);
	}
	const jpg = await imageMeta(Buffer.from(out['OEBPS/images/photo1.jpg']));
	expect([jpg.format, jpg.width, jpg.height]).toEqual(['jpeg', 1200, 800]);
	const { ratio } = await pixelDiff(
		Buffer.from(src['OEBPS/images/photo1.jpg']),
		Buffer.from(out['OEBPS/images/photo1.jpg'])
	);
	expect(ratio, 'photo1 recompression stays visually close').toBeLessThan(0.2);
	const png = await imageMeta(Buffer.from(out['OEBPS/images/diagram.png']));
	expect([png.format, png.width, png.height, png.hasAlpha]).toEqual(['png', 600, 400, true]);
	await expect(page.getByTestId('row-info')).toContainText('3 of 3 images recompressed');
});

test('EB-02: a DRM-protected EPUB is refused with a clear error', async ({ page }) => {
	await gotoPath(page, '/compress-epub');
	await upload(page, fx('sample-drm.epub'));
	const run = await compress(page, { expectError: true });
	expect(run.error).toMatch(/DRM/i);
	await expect(page.getByTestId('compress-cta')).toBeEnabled();
});

test('EB-03: /compress-cbz shrinks pages, preserves names, order and metadata', async ({
	page
}) => {
	await gotoPath(page, '/compress-cbz');
	await expect(page).toHaveTitle(/Compress CBZ/);
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', '.cbz');
	await upload(page, fx('sample.cbz'));
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.cbz');
	// exact central-directory order — ComicInfo.xml stays LAST (a sorted
	// rebuild would hoist it alphabetically and fail here)
	expect(zipCentralNames(art.bytes)).toEqual(CBZ_ORDER);
	const out = unzip(art.bytes);
	const src = unzip(readFileSync(fx('sample.cbz')));
	for (const name of ['page01.jpg', 'page02.jpg', 'page03.jpg', 'page04.jpg', 'page05.webp']) {
		expect(out[name].length, name).toBeLessThan(src[name].length);
	}
	const p1 = await imageMeta(Buffer.from(out['page01.jpg']));
	expect([p1.format, p1.width, p1.height]).toEqual(['jpeg', 1400, 2000]);
	expect((await imageMeta(Buffer.from(out['page05.webp']))).format).toBe('webp');
	// gif + metadata pass through byte-identical
	expect(Buffer.compare(Buffer.from(out['page06.gif']), Buffer.from(src['page06.gif']))).toBe(0);
	expect(Buffer.compare(Buffer.from(out['ComicInfo.xml']), Buffer.from(src['ComicInfo.xml']))).toBe(
		0
	);
	await expect(page.getByTestId('row-info')).toContainText('5 of 5 pages recompressed');
});

test('EB-04: quality 100 keeps every page byte-identical (per-entry guard)', async ({ page }) => {
	await gotoPath(page, '/compress-cbz');
	await upload(page, fx('sample.cbz'));
	await setEbookQuality(page, 100);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	const out = unzip(art.bytes);
	const src = unzip(readFileSync(fx('sample.cbz')));
	// asserted on ENTRY bytes so it holds whether or not the whole-file
	// keep-original also fired for the container itself
	for (const name of ['page01.jpg', 'page02.jpg', 'page03.jpg', 'page04.jpg', 'page05.webp']) {
		expect(Buffer.compare(Buffer.from(out[name]), Buffer.from(src[name])), name).toBe(0);
	}
});

test('EB-05: a rebuild that would grow returns the original file untouched', async ({ page }) => {
	// The deflated fixture's images survive q100 (per-entry guard) but would be
	// rebuilt STORED — strictly bigger → the whole-file guard returns the
	// exact original bytes, with the info line honestly dropped.
	await gotoPath(page, '/compress-cbz');
	await upload(page, fx('sample-deflated.cbz'));
	await setEbookQuality(page, 100);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('sample-deflated.cbz');
	expect(art.bytes.equals(readFileSync(fx('sample-deflated.cbz')))).toBe(true);
	await expect(page.getByTestId('row-info')).toHaveCount(0);
});

test('EB-06: /cbr-to-cbz repacks a RAR comic with entries bit-identical @smoke', async ({
	page
}) => {
	await gotoPath(page, '/cbr-to-cbz');
	await expect(page).toHaveTitle(/CBR to CBZ/);
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', '.cbr');
	await upload(page, fx('sample.cbr'));
	// landing preset: bit-exact repack
	await expect(page.locator('#ebook-quality')).toHaveValue('100');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	// conversion ships even though the zip may be BIGGER than the rar
	expect(art.name).toBe('sample.cbz');
	const out = unzip(art.bytes);
	const srcEntries = await sevenZipEntries(readFileSync(fx('sample.cbr')), 'sample.cbr');
	expect(Object.keys(out).sort()).toEqual(Object.keys(srcEntries).sort());
	for (const [name, bytes] of Object.entries(srcEntries)) {
		expect(Buffer.compare(Buffer.from(out[name]), Buffer.from(bytes)), name).toBe(0);
	}
	await expect(page.getByTestId('row-info')).toContainText(/Converted to CBZ/);
});

test('EB-07: a RAR mislabeled as .cbz falls back to the 7zz reader', async ({ page }) => {
	await gotoPath(page, '/compress-cbz');
	await upload(page, fx('sample-rar.cbz'));
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	const out = unzip(art.bytes);
	const srcEntries = await sevenZipEntries(readFileSync(fx('sample-rar.cbz')), 'sample.rar');
	expect(Object.keys(out).sort()).toEqual(Object.keys(srcEntries).sort());
});

test('EB-08: a home-dropped .cbz routes to the Books tab', async ({ page }) => {
	await gotoPath(page, '/');
	await upload(page, fx('sample.cbz'));
	await expect(page.locator('#ebook-quality')).toBeVisible();
	await expect(page.getByTestId('compress-cta')).toHaveText('Compress 1 file');
});

test('EB-09: the max-dimension cap downscales only the oversized page', async ({ page }) => {
	await gotoPath(page, '/compress-cbz');
	await upload(page, fx('sample.cbz'));
	await page.getByRole('button', { name: '1200 px', exact: true }).click();
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	const out = unzip(art.bytes);
	// the 1400×2000 scan caps to 840×1200; pages under the cap keep their dims
	const p1 = await imageMeta(Buffer.from(out['page01.jpg']));
	expect([p1.width, p1.height]).toEqual([840, 1200]);
	const p2 = await imageMeta(Buffer.from(out['page02.jpg']));
	expect([p2.width, p2.height]).toEqual([700, 1000]);
	// the downscaled run must ship, not revert (transformed → resized seam)
	expect(art.bytes.length).toBeLessThan(readFileSync(fx('sample.cbz')).length);
});

test('EB-10: /epub-to-txt extracts spine-ordered plain text @smoke', async ({ page }) => {
	await gotoPath(page, '/epub-to-txt');
	await expect(page).toHaveTitle(/EPUB to TXT/);
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', '.epub');
	await upload(page, fx('sample.epub'));
	// controls mount with the first file — the landing preset must have stuck
	await expect(page.getByRole('button', { name: 'To TXT', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByTestId('compress-cta')).toHaveText('Extract text from 1 file');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.txt');
	const text = art.bytes.toString('utf8');
	expect(text).toContain('The quick brown fox jumps over the lazy dog');
	// entity resolved to a literal ampersand, not left as &amp;
	expect(text).toContain('Second chapter marker sentence & spine-order proof.');
	// ch2 sits before ch1 in both the zip and the manifest — the SPINE decides
	expect(text.indexOf('quick brown fox')).toBeLessThan(text.indexOf('Second chapter marker'));
	// headings survive as their own paragraphs; markup and styles do not
	expect(text).toContain('Chapter 1');
	expect(text).toContain('Chapter 2');
	expect(text).not.toContain('color: red');
	expect(text).not.toMatch(/<[a-z]/i);
	await expect(page.getByTestId('row-info')).toContainText('2 chapters');
});

test('EB-11: /cbz-to-pdf embeds jpg pages byte-verbatim, one page per image @smoke', async ({
	page
}) => {
	await gotoPath(page, '/cbz-to-pdf');
	await expect(page).toHaveTitle(/CBZ to PDF/);
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', '.cbz');
	await upload(page, fx('sample.cbz'));
	await expect(page.getByRole('button', { name: 'To PDF', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.pdf');
	// 6 image pages in natural order — ComicInfo.xml is not a page
	const info = await pdfInfo(art.bytes);
	expect(info.pageCount).toBe(6);
	// page = image dims (1 px = 1 pt), oversized scan first
	expect(info.pageSizes[0]).toEqual({ w: 1400, h: 2000 });
	// lossless embed: the source jpg's entropy-coded tail appears VERBATIM in
	// the PDF — identical bytes ⇒ identical pixels, no decoder in the loop
	const src = unzip(readFileSync(fx('sample.cbz')));
	const page01 = Buffer.from(src['page01.jpg']);
	expect(art.bytes.includes(page01.subarray(jpegSosOffset(page01)))).toBe(true);
	await expect(page.getByTestId('row-info')).toContainText(
		'6 pages · 4 embedded losslessly · 2 re-encoded'
	);
	// the page actually DRAWS the image (an embedded-but-blank page would still
	// pass the byte check)
	const raster = await rasterizePdfInPage(page, art.bytes, 1);
	if (raster) {
		const { ratio } = await pixelDiff(page01, raster);
		expect(ratio, 'PDF page 1 renders the source scan').toBeLessThan(0.05);
	}
});

test('EB-12: /cbr-to-pdf refuses an image-free archive with an honest error', async ({ page }) => {
	await gotoPath(page, '/cbr-to-pdf');
	await expect(page).toHaveTitle(/CBR to PDF/);
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', '.cbr');
	// the fixture CBR holds text files only — a real comic conversion is
	// covered by the matrix suite with example.cbr
	await upload(page, fx('sample.cbr'));
	await expect(page.getByRole('button', { name: 'To PDF', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	const run = await compress(page, { expectError: true });
	expect(run.error).toMatch(/no image pages/i);
	await expect(page.getByTestId('compress-cta')).toBeEnabled();
});

test('EB-13: a comic dropped on /epub-to-txt hides TXT and falls back to compress', async ({
	page
}) => {
	// TXT can't succeed for a comic — the segment hides and the preset
	// selection snaps VISIBLY to Compress instead of dead-ending on run.
	await gotoPath(page, '/epub-to-txt');
	await upload(page, fx('sample.cbz'));
	await expect(page.getByRole('button', { name: 'Compress', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: 'To TXT', exact: true })).toHaveCount(0);
	await expect(page.getByTestId('compress-cta')).toHaveText('Compress 1 file');
	await compress(page, { timeout: 120_000 });
	expect((await downloadRow(page)).name).toBe('sample.cbz');
});

test('EB-16: an EPUB dropped on /cbz-to-pdf hides PDF and falls back to compress', async ({
	page
}) => {
	await gotoPath(page, '/cbz-to-pdf');
	await upload(page, fx('sample.epub'));
	await expect(page.getByRole('button', { name: 'Compress', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: 'To PDF', exact: true })).toHaveCount(0);
	// TXT stays offered — it CAN act on an EPUB.
	await expect(page.getByRole('button', { name: 'To TXT', exact: true })).toBeVisible();
	await expect(page.getByTestId('compress-cta')).toHaveText('Compress 1 file');
	await compress(page, { timeout: 120_000 });
	expect((await downloadRow(page)).name).toBe('sample.epub');
});

test('EB-15: a persisted txt/pdf output does not leak into compress pages', async ({ page }) => {
	// Visiting a converter persists `to` — a later compress/cbz landing must
	// reset it, or /cbr-to-cbz would hand back a PDF and /compress-epub would
	// refuse EPUBs outright.
	await gotoPath(page, '/cbz-to-pdf');
	await gotoPath(page, '/cbr-to-cbz');
	await upload(page, fx('sample.cbr'));
	await expect(page.getByRole('button', { name: 'Compress', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.cbz');

	await gotoPath(page, '/epub-to-txt');
	await gotoPath(page, '/compress-epub');
	await upload(page, fx('sample.epub'));
	await expect(page.getByTestId('compress-cta')).toHaveText('Compress 1 file');
	await compress(page, { timeout: 120_000 });
	expect((await downloadRow(page)).name).toBe('sample.epub');
});

test('EB-14: a DRM-protected EPUB is refused on /epub-to-txt too', async ({ page }) => {
	await gotoPath(page, '/epub-to-txt');
	await upload(page, fx('sample-drm.epub'));
	const run = await compress(page, { expectError: true });
	expect(run.error).toMatch(/DRM/i);
	await expect(page.getByTestId('compress-cta')).toBeEnabled();
});
