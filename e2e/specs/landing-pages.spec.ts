/**
 * LP-01…15: standalone landing pages (/merge-pdf, /split-pdf, /compress-mp4,
 * /compress-mov, /resize-image, /png-to-pdf, /mp4-to-gif, …, /compress-image,
 * /compress-jpg-to-100kb) — each URL must preselect its op or settings and
 * carry its own copy. The pipelines have their own specs; the contract here is
 * the preset landing, plus two end-to-end flows.
 */
import { expect, fx, fxAudio, fxVideo, FIXTURES, test } from '../fixtures';
import { compress, downloadCombined, gotoPath, upload } from '../helpers';
import { pdfInfo } from '../verify';

function pill(page: import('@playwright/test').Page, name: string) {
	return page.getByRole('button', { name, exact: true });
}

test('LP-01: /merge-pdf presets Merge and combines two PDFs @smoke', async ({ page }) => {
	await gotoPath(page, '/merge-pdf');
	await expect(page).toHaveTitle(/Merge PDF Files/);
	await expect(page.locator('h1')).toHaveText('Merge PDF files.');
	await expect(pill(page, 'Merge')).toHaveAttribute('aria-pressed', 'true');
	await upload(page, fx('merge-a.pdf'), fx('merge-b.pdf'));
	await compress(page);
	const art = await downloadCombined(page);
	expect((await pdfInfo(art.bytes)).pageCount).toBe(3);
});

test('LP-02: /split-pdf presets the Pages op with the range input ready', async ({ page }) => {
	await gotoPath(page, '/split-pdf');
	await expect(page.locator('h1')).toHaveText('Split PDF files.');
	await expect(pill(page, 'Pages')).toHaveAttribute('aria-pressed', 'true');
	await upload(page, fx('pages-12.pdf'));
	await expect(page.locator('#page-range')).toBeVisible();
});

test('LP-03: /compress-mp4 scopes the dropzone to MP4 on the video tab', async ({ page }) => {
	await gotoPath(page, '/compress-mp4');
	await expect(page).toHaveTitle(/Compress MP4 Video/);
	await expect(page.locator('h1')).toHaveText('Compress MP4 videos.');
	await expect(page.getByText('Drop MP4 files here')).toBeVisible();
	await expect(page.locator('input[type=file]')).toHaveAttribute(
		'accept',
		'video/mp4,video/x-m4v,.mp4,.m4v'
	);
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await expect(page.locator('button[data-seg="mp4"]')).toHaveAttribute('aria-pressed', 'true');
});

test('LP-15: /compress-mov scopes the dropzone to MOV and presets the MOV container', async ({
	page
}) => {
	await gotoPath(page, '/compress-mov');
	await expect(page).toHaveTitle(/Compress MOV/);
	await expect(page.locator('h1')).toHaveText('Compress MOV videos.');
	await expect(page.getByText('Drop MOV files here')).toBeVisible();
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', 'video/quicktime,.mov');
	await upload(page, fxVideo('v-320x240-3s.mov'));
	await expect(page.locator('button[data-seg="mov"]')).toHaveAttribute('aria-pressed', 'true');
});

test('LP-04: /resize-image presets a 1920 px cap that spans image tabs', async ({ page }) => {
	await gotoPath(page, '/resize-image');
	await expect(page.locator('h1')).toHaveText('Resize images.');
	await expect(page.getByText('Drop images here')).toBeVisible();
	await upload(page, fx('photo-1200x800.jpg'));
	await expect(page.locator('#max-dimension')).toHaveValue('1920');
	// The cap must span image tabs — drops re-route to their native tab (png →
	// png), which has to land already configured.
	await gotoPath(page, '/compress-png');
	await upload(page, fx('graphic-alpha.png'));
	await expect(page.locator('#max-dimension')).toHaveValue('1920');
	// On a fresh load the disclosure is collapsed — the persisted cap must not
	// act invisibly: the toggle row summarizes it.
	await expect(page.getByTestId('advanced-toggle')).toContainText('Max 1920 px');
});

test('LP-05: /png-to-pdf presets From-images, scoped to PNG, and builds a PDF', async ({
	page
}) => {
	await gotoPath(page, '/png-to-pdf');
	await expect(page).toHaveTitle(/PNG to PDF/);
	await expect(page.locator('h1')).toHaveText('Convert PNG to PDF.');
	await expect(pill(page, 'From images')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', 'image/png,.png');
	await upload(page, fx('graphic-alpha.png'));
	await compress(page);
	const art = await downloadCombined(page);
	expect(art.name).toBe('images.pdf');
	expect((await pdfInfo(art.bytes)).pageCount).toBe(1);
});

test('LP-06: /mp4-to-gif presets GIF output for MP4 clips', async ({ page }) => {
	await gotoPath(page, '/mp4-to-gif');
	await expect(page).toHaveTitle(/MP4 to GIF Converter/);
	await expect(page.locator('h1')).toHaveText('Convert MP4 to GIF.');
	await expect(page.locator('input[type=file]')).toHaveAttribute(
		'accept',
		'video/mp4,video/x-m4v,.mp4,.m4v'
	);
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await expect(page.locator('button[data-seg="gif"]')).toHaveAttribute('aria-pressed', 'true');
});

test('LP-07: /pdf-to-png presets To-images with PNG output', async ({ page }) => {
	await gotoPath(page, '/pdf-to-png');
	await expect(page).toHaveTitle(/PDF to PNG Converter/);
	await expect(page.locator('h1')).toHaveText('Convert PDF to PNG.');
	await expect(pill(page, 'To images')).toHaveAttribute('aria-pressed', 'true');
	await upload(page, fx('text-3pages.pdf'));
	await expect(page.locator('button[data-seg="png"]')).toHaveAttribute('aria-pressed', 'true');
});

test('LP-08: /heic-to-png presets lossless PNG output for HEIC', async ({ page }) => {
	await gotoPath(page, '/heic-to-png');
	await expect(page).toHaveTitle(/HEIC to PNG Converter/);
	await expect(page.locator('h1')).toHaveText('Convert HEIC to PNG.');
	await expect(page.locator('input[type=file]')).toHaveAttribute(
		'accept',
		'image/heic,image/heif,.heic,.heif'
	);
	test.skip(!FIXTURES.heicAvailable, 'sips HEIC fixture unavailable');
	await upload(page, fx('iphone-photo.heic'));
	await expect(pill(page, 'PNG')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('#quality')).toHaveValue('100');
});

test('LP-09: /m4a-to-mp3 presets MP3 output for M4A files', async ({ page }) => {
	await gotoPath(page, '/m4a-to-mp3');
	await expect(page).toHaveTitle(/M4A to MP3 Converter/);
	await expect(page.locator('h1')).toHaveText('Convert M4A to MP3.');
	await expect(page.locator('input[type=file]')).toHaveAttribute(
		'accept',
		'audio/mp4,audio/x-m4a,.m4a'
	);
	await upload(page, fxAudio('tone-3s.m4a'));
	await expect(pill(page, 'MP3')).toHaveAttribute('aria-pressed', 'true');
});

test('LP-10: /compress-image is a universal image intake on the jpg tab', async ({ page }) => {
	await gotoPath(page, '/compress-image');
	await expect(page).toHaveTitle(/Image Compressor/);
	await expect(page.locator('h1')).toHaveText('Compress images.');
	await expect(page.getByText('Drop images here')).toBeVisible();
	await expect(page.locator('input[type=file]')).toHaveAttribute(
		'accept',
		'image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif'
	);
	// The preset is deliberately a no-op — the tab defaults (Auto) must survive.
	await upload(page, fx('photo-1200x800.jpg'));
	await expect(pill(page, 'Auto')).toHaveAttribute('aria-pressed', 'true');
});

test('LP-11: /compress-jpg-to-100kb arrives in target mode with 100 typed in', async ({ page }) => {
	await gotoPath(page, '/compress-jpg-to-100kb');
	await expect(page).toHaveTitle(/Compress JPEG to 100 KB/);
	await expect(page.locator('h1')).toHaveText('Compress JPG to 100 KB.');
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', 'image/jpeg,.jpg,.jpeg');
	await upload(page, fx('photo-1200x800.jpg'));
	await expect(page.locator('button[data-seg="target"]')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('#target-size-kb')).toHaveValue('100');
	await expect(pill(page, 'JPG')).toHaveAttribute('aria-pressed', 'true');
});

test('LP-12: /jpg-to-ico presets ICO on the jpg tab and hides the quality slider', async ({
	page
}) => {
	await gotoPath(page, '/jpg-to-ico');
	await expect(page).toHaveTitle(/JPG to ICO/);
	await expect(page.locator('h1')).toHaveText('Convert JPG to ICO.');
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', 'image/jpeg,.jpg,.jpeg');
	await upload(page, fx('photo-1200x800.jpg'));
	await expect(pill(page, 'ICO')).toHaveAttribute('aria-pressed', 'true');
	// ICO ignores quality — the slider must not render, the favicon note must.
	await expect(page.locator('#quality')).toHaveCount(0);
	await expect(page.getByText('Multi-size favicon ICO (16–256 px in one file)')).toBeVisible();
});

test('LP-13: /svg-to-png presets PNG output with the size field on the svg tab', async ({
	page
}) => {
	await gotoPath(page, '/svg-to-png');
	await expect(page).toHaveTitle(/SVG to PNG/);
	await expect(page.locator('h1')).toHaveText('Convert SVG to PNG.');
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', 'image/svg+xml,.svg');
	await upload(page, fx('bloated.svg'));
	await expect(pill(page, 'PNG')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('#raster-size')).toHaveValue('1024');
	// Raster mode hides the SVGO-specific precision slider.
	await expect(page.locator('#precision')).toHaveCount(0);
});

test('LP-14: /svg-to-ico presets ICO output and drops the SVGO disclosure', async ({ page }) => {
	await gotoPath(page, '/svg-to-ico');
	await expect(page).toHaveTitle(/SVG to ICO/);
	await expect(page.locator('h1')).toHaveText('Convert SVG to ICO.');
	await upload(page, fx('clean-icon.svg'));
	await expect(pill(page, 'ICO')).toHaveAttribute('aria-pressed', 'true');
	// The SVGO switches don't apply to raster output — no Advanced disclosure.
	await expect(page.getByTestId('advanced-toggle')).toHaveCount(0);
});

test('LP-16: the before/after demo renders where honest and nowhere else', async ({ page }) => {
	// Every demo asset is real output of its own page's pipeline (pnpm
	// demo-assets) — it may appear only there (seo.test.ts pins the kind↔page
	// map; this asserts the rendered result on both sides of the rule).
	await gotoPath(page, '/compress-jpg');
	await expect(page.locator('[aria-label="Image comparison slider"]')).toBeVisible();
	await gotoPath(page, '/compress-pdf');
	await expect(page.locator('[aria-label="Image comparison slider"]')).toBeVisible();
	await gotoPath(page, '/compress-mp4');
	await expect(page.locator('[aria-label="Image comparison slider"]')).toBeVisible();
	// The playable preview must never cost video bytes before play.
	await expect(page.getByTestId('demo-clip')).toHaveAttribute('preload', 'none');
	await gotoPath(page, '/compress-video');
	await expect(page.locator('[aria-label="Image comparison slider"]')).toBeVisible();
	// Audio has no visual side — its demo is a listening pair, both players
	// preload="none" so no audio bytes move before Play.
	await gotoPath(page, '/compress-audio');
	await expect(page.locator('[aria-label="Image comparison slider"]')).toHaveCount(0);
	const players = page.locator('audio[controls]');
	await expect(players).toHaveCount(2);
	await expect(players.first()).toHaveAttribute('preload', 'none');
	await expect(players.last()).toHaveAttribute('preload', 'none');
	// Font renders a live specimen, archive a folder table, exif a metadata
	// table — none of them a slider.
	await gotoPath(page, '/font-converter');
	await expect(page.locator('[aria-label="Image comparison slider"]')).toHaveCount(0);
	await expect(page.locator('[data-demo-specimen]')).toBeVisible();
	await gotoPath(page, '/zip-files');
	await expect(page.locator('[data-demo-archive]')).toBeVisible();
	await gotoPath(page, '/remove-exif');
	await expect(page.locator('[data-demo-exif]')).toBeVisible();
	// /merge-pdf and /compress-mov run the same engine families but have no
	// demo of their own.
	await gotoPath(page, '/merge-pdf');
	await expect(page.locator('[aria-label="Image comparison slider"]')).toHaveCount(0);
	await gotoPath(page, '/compress-mov');
	await expect(page.locator('[aria-label="Image comparison slider"]')).toHaveCount(0);
});
