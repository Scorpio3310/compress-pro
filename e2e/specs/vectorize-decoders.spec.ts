/**
 * VD-01…03: SVG output for accepted-but-wasm-decoded sources. The vtracer
 * worker decodes via createImageBitmap, which cannot read TIFF/PSD/RAW —
 * compress.ts must bridge them through the image worker (and LibRaw for RAW)
 * to a lossless PNG first, so the same files that convert fine to JPG also
 * vectorize instead of failing with a raw decode error.
 */
import { expect, fx, test } from '../fixtures';
import { compress, downloadRow, gotoTab, setOutputFormat, upload } from '../helpers';

test('VD-01: TIFF → SVG vectorizes via the decode bridge', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('photo.tiff'));
	await setOutputFormat(page, 'SVG');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('photo.svg');
	expect(art.bytes.toString('utf8')).toContain('<svg');
});

test('VD-02: PSD → SVG vectorizes via the decode bridge', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('photo-640x400.psd'));
	await setOutputFormat(page, 'SVG');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('photo-640x400.svg');
	expect(art.bytes.toString('utf8')).toContain('<svg');
});

test('VD-03: camera RAW (DNG) → SVG predecodes through LibRaw first', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('photo.dng'));
	await setOutputFormat(page, 'SVG');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('photo.svg');
	expect(art.bytes.toString('utf8')).toContain('<svg');
});
