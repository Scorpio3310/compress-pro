/**
 * CV-01…11: converter landing pages (/webp-to-jpg …) — each URL preselects the
 * hosting tab + output format, carries unique SEO copy, and converts for real.
 */
import { readFileSync } from 'node:fs';
import {
	assertDiffBudget,
	audioFixtures,
	expect,
	fx,
	fxAudio,
	fxMeta,
	fxVideo,
	FIXTURES,
	test
} from '../fixtures';
import {
	compress,
	downloadCombined,
	downloadRow,
	dropOnZone,
	gotoPath,
	rows,
	setOutputFormat,
	upload
} from '../helpers';
import {
	audioInfo,
	decodeRaw,
	icoInfo,
	imageMeta,
	pdfInfo,
	pixelDiff,
	unzip,
	videoInfo
} from '../verify';
import { DIFF_BUDGET } from '../thresholds';

function outputPill(page: import('@playwright/test').Page, name: string) {
	return page.getByRole('button', { name, exact: true });
}

test('CV-01: /webp-to-jpg presets JPG and converts @smoke', async ({ page }) => {
	await gotoPath(page, '/webp-to-jpg');
	await expect(page).toHaveTitle(/WebP to JPG Converter/);
	await expect(page.locator('h1')).toHaveText('Convert WebP to JPG.');
	await upload(page, fx('photo-1000x700.webp'));
	await expect(outputPill(page, 'JPG')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('photo-1000x700.jpg');
	expect((await imageMeta(art.bytes)).format).toBe('jpeg');
});

test('CV-02: /avif-to-jpg scopes the dropzone to AVIF and converts', async ({ page }) => {
	await gotoPath(page, '/avif-to-jpg');
	await expect(page.getByText('Drop AVIF files here')).toBeVisible();
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', 'image/avif,.avif');
	await upload(page, fx('photo-800x600.avif'));
	await expect(outputPill(page, 'JPG')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	expect((await imageMeta((await downloadRow(page)).bytes)).format).toBe('jpeg');
});

test('CV-03: /png-to-jpg flattens alpha to an opaque JPG', async ({ page }) => {
	await gotoPath(page, '/png-to-jpg');
	await upload(page, fx('graphic-alpha.png'));
	await expect(outputPill(page, 'JPG')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const m = await imageMeta((await downloadRow(page)).bytes);
	expect(m.format).toBe('jpeg');
	expect(m.hasAlpha).toBe(false);
});

test('CV-04: /jpg-to-webp converts to webp', async ({ page }) => {
	await gotoPath(page, '/jpg-to-webp');
	await upload(page, fx('photo-1200x800.jpg'));
	await expect(outputPill(page, 'WebP')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	expect((await imageMeta((await downloadRow(page)).bytes)).format).toBe('webp');
});

test('CV-05: /png-to-webp keeps transparency', async ({ page }) => {
	await gotoPath(page, '/png-to-webp');
	await upload(page, fx('graphic-alpha.png'));
	await expect(outputPill(page, 'WebP')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const m = await imageMeta((await downloadRow(page)).bytes);
	expect(m.format).toBe('webp');
	expect(m.hasAlpha).toBe(true);
});

test('CV-06: /webp-to-png presets lossless quality 100', async ({ page }) => {
	await gotoPath(page, '/webp-to-png');
	await upload(page, fx('photo-1000x700.webp'));
	await expect(outputPill(page, 'PNG')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('#quality')).toHaveValue('100');
	await compress(page);
	expect((await imageMeta((await downloadRow(page)).bytes)).format).toBe('png');
});

test('CV-07: /heic-to-jpg converts an iPhone photo', async ({ page }) => {
	test.skip(!FIXTURES.heicAvailable, 'sips HEIC fixture unavailable');
	await gotoPath(page, '/heic-to-jpg');
	await expect(page).toHaveTitle(/HEIC to JPG Converter/);
	await upload(page, fx('iphone-photo.heic'));
	await expect(outputPill(page, 'JPG')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	expect((await imageMeta((await downloadRow(page)).bytes)).format).toBe('jpeg');
});

test('CV-08: /pdf-to-jpg presets the To-images op and renders pages @smoke', async ({ page }) => {
	await gotoPath(page, '/pdf-to-jpg');
	await expect(outputPill(page, 'To images')).toHaveAttribute('aria-pressed', 'true');
	await upload(page, fx('text-3pages.pdf'));
	await expect(page.locator('button[data-seg="jpg"]')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('text-3pages-images.zip');
	const entries = unzip(art.bytes);
	const names = Object.keys(entries);
	expect(names).toHaveLength(3);
	for (const name of names) expect(name).toMatch(/\.jpg$/);
	expect((await imageMeta(Buffer.from(entries[names[0]]))).format).toBe('jpeg');
});

test('CV-09: /jpg-to-pdf presets From-images and builds one PDF', async ({ page }) => {
	await gotoPath(page, '/jpg-to-pdf');
	await expect(outputPill(page, 'From images')).toHaveAttribute('aria-pressed', 'true');
	await upload(page, fx('photo-1200x800.jpg'), fx('tiny-optimized.jpg'));
	await compress(page);
	const art = await downloadCombined(page);
	expect(art.name).toBe('images.pdf');
	expect((await pdfInfo(art.bytes)).pageCount).toBe(2);
});

test('CV-10: preset applies per arrival, never fights manual changes', async ({ page }) => {
	await gotoPath(page, '/webp-to-jpg');
	await upload(page, fx('photo-1000x700.webp'));
	await expect(outputPill(page, 'JPG')).toHaveAttribute('aria-pressed', 'true');

	// Manual change wins while staying on the page…
	await setOutputFormat(page, 'PNG');

	// …and survives a client-side hop to the plain tab route (persisted store,
	// no preset there; a full reload would drop the in-memory files instead).
	await page.locator('a[data-seg="webp"]').click();
	await expect(page).toHaveURL(/\/compress-webp$/);
	await expect(outputPill(page, 'PNG')).toHaveAttribute('aria-pressed', 'true');

	// …but returning to the converter re-asserts its promise.
	await page.goBack();
	await expect(page).toHaveURL(/\/webp-to-jpg$/);
	await expect(outputPill(page, 'JPG')).toHaveAttribute('aria-pressed', 'true');
});

test('CV-12: /webm-to-mp4 presets the MP4 container and converts', async ({ page }) => {
	await gotoPath(page, '/webm-to-mp4');
	await expect(page).toHaveTitle(/WebM to MP4 Converter/);
	await expect(page.getByText('Drop WebM files here')).toBeVisible();
	await upload(page, fxVideo('v-audio-3s.webm'));
	await expect(page.locator('button[data-seg="mp4"]')).toHaveAttribute('aria-pressed', 'true');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('v-audio-3s.mp4');
	const info = await videoInfo(art.bytes);
	expect(info.videoCodec).toBe('avc');
});

test('CV-13: /mp4-to-webm presets the WebM container and converts', async ({ page }) => {
	await gotoPath(page, '/mp4-to-webm');
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await expect(page.locator('button[data-seg="webm"]')).toHaveAttribute('aria-pressed', 'true');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('v-320x240-3s.webm');
	expect(['vp9', 'vp8']).toContain((await videoInfo(art.bytes)).videoCodec);
});

test('CV-14: /mov-to-mp4 scopes the dropzone to MOV and presets MP4', async ({ page }) => {
	await gotoPath(page, '/mov-to-mp4');
	await expect(page).toHaveTitle(/MOV to MP4 Converter/);
	await expect(page.locator('h1')).toHaveText('Convert MOV to MP4.');
	await expect(page.getByText('Drop MOV files here')).toBeVisible();
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', 'video/quicktime,.mov');
	await upload(page, fxVideo('v-320x240-3s.mov'));
	await expect(page.locator('button[data-seg="mp4"]')).toHaveAttribute('aria-pressed', 'true');
});

test('CV-15: /mkv-to-mp4 scopes the dropzone to MKV and presets MP4', async ({ page }) => {
	await gotoPath(page, '/mkv-to-mp4');
	await expect(page).toHaveTitle(/MKV to MP4 Converter/);
	await expect(page.getByText('Drop MKV files here')).toBeVisible();
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', 'video/x-matroska,.mkv');
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await expect(page.locator('button[data-seg="mp4"]')).toHaveAttribute('aria-pressed', 'true');
});

test('CV-11: every converter page has unique title/h1 and a matching canonical', async ({
	page
}) => {
	const slugs = [
		'/heic-to-jpg',
		'/webp-to-jpg',
		'/webp-to-png',
		'/avif-to-jpg',
		'/png-to-jpg',
		'/jpg-to-webp',
		'/png-to-webp',
		'/jpg-to-pdf',
		'/pdf-to-jpg',
		'/mov-to-mp4',
		'/webm-to-mp4',
		'/mkv-to-mp4',
		'/mp4-to-webm'
	];
	const titles: string[] = [];
	const h1s: string[] = [];
	for (const slug of slugs) {
		await gotoPath(page, slug);
		titles.push(await page.title());
		h1s.push((await page.locator('h1').textContent()) ?? '');
		const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
		expect(canonical, slug).toMatch(/^https:\/\//);
		expect(canonical, slug).toContain(slug);
	}
	expect(new Set(titles).size).toBe(slugs.length);
	expect(new Set(h1s).size).toBe(slugs.length);
});

test('CV-16: /mp4-to-mp3 presets MP3 output and extracts audio', async ({ page }) => {
	await gotoPath(page, '/mp4-to-mp3');
	await expect(page).toHaveTitle(/MP4 to MP3/);
	await expect(page.getByText('Drop video files here')).toBeVisible();
	await upload(page, fxVideo('v-audio-3s.mp4'));
	await expect(page.getByRole('button', { name: 'MP3', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('v-audio-3s.mp3');
	const info = await audioInfo(art.bytes);
	expect(info.audioCodec).toBe('mp3');
	expect(info.hasVideo).toBe(false);
});

test('CV-17: /wav-to-mp3 presets MP3 and converts a WAV', async ({ page }) => {
	await gotoPath(page, '/wav-to-mp3');
	await expect(page).toHaveTitle(/WAV to MP3/);
	await expect(page.getByText('Drop WAV files here')).toBeVisible();
	await upload(page, fx('tone-3s.wav'));
	await expect(page.getByRole('button', { name: 'MP3', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.mp3');
	expect((await audioInfo(art.bytes)).audioCodec).toBe('mp3');
});

test('CV-18: /bmp-to-jpg decodes BMP natively and converts', async ({ page }) => {
	const meta = fxMeta<{ width: number; height: number; ref: string }>('graphic.bmp');
	await gotoPath(page, '/bmp-to-jpg');
	await expect(page).toHaveTitle(/BMP to JPG/);
	await upload(page, fx('graphic.bmp'));
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('graphic.jpg');
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('jpeg');
	expect([m.width, m.height]).toEqual([meta.width, meta.height]);
	// Pixel diff vs the byte-identical PNG twin (sharp can't read BMP).
	const { ratio } = await pixelDiff(readFileSync(fx(meta.ref)), art.bytes);
	assertDiffBudget(ratio, DIFF_BUDGET.q80, 'CV-18 bmp→jpg');
});

test('CV-19: /tiff-to-jpg decodes TIFF via utif2 and converts', async ({ page }) => {
	await gotoPath(page, '/tiff-to-jpg');
	await expect(page).toHaveTitle(/TIFF to JPG/);
	await upload(page, fx('photo.tiff'));
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('photo.jpg');
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('jpeg');
	expect([m.width, m.height]).toEqual([800, 600]);
	// sharp reads TIFF directly — diff against the actual source.
	const { ratio } = await pixelDiff(readFileSync(fx('photo.tiff')), art.bytes);
	assertDiffBudget(ratio, DIFF_BUDGET.q80, 'CV-19 tiff→jpg');
});

test('CV-20: /png-to-ico muxes a multi-size favicon with alpha intact', async ({ page }) => {
	await gotoPath(page, '/png-to-ico');
	await expect(page).toHaveTitle(/PNG to ICO/);
	await upload(page, fx('graphic-alpha.png'));
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('graphic-alpha.ico');
	const ico = icoInfo(art.bytes);
	expect(ico.count).toBeGreaterThanOrEqual(3);
	expect(ico.sizes).toContain(16);
	expect(ico.sizes).toContain(32);
	for (const entry of ico.entries) expect(entry.isPng, `${entry.size}px entry is PNG`).toBe(true);
	// Transparency survives: the 32 px entry decodes with transparent pixels
	// (source alpha + the square padding both guarantee some).
	const small = ico.entries.find((e) => e.size === 32);
	const raw = await decodeRaw(small!.bytes);
	let transparent = 0;
	for (let i = 3; i < raw.data.length; i += 4) if (raw.data[i] === 0) transparent++;
	expect(transparent, 'alpha preserved in the embedded PNGs').toBeGreaterThan(0);
});

test('CV-21: a GIF dropped on the /gif-to-mp4 dropzone parks on the video tab', async ({
	page
}) => {
	await gotoPath(page, '/gif-to-mp4');
	// The converter's accept override ('image/gif') must win over cross-family
	// re-routing — dropping a GIF here means "convert THIS gif to mp4".
	await dropOnZone(page, [{ path: fx('anim-12f.gif'), mimeType: 'image/gif' }]);
	await expect(page).toHaveURL(/\/gif-to-mp4$/);
	await expect(rows(page)).toHaveCount(1);
	await expect(page.getByTestId('error-banner')).toHaveCount(0);
});

test('CV-22: /jpg-to-ico builds a multi-size favicon from a JPG', async ({ page }) => {
	await gotoPath(page, '/jpg-to-ico');
	await expect(page).toHaveTitle(/JPG to ICO/);
	await upload(page, fx('photo-1200x800.jpg'));
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('photo-1200x800.ico');
	const ico = icoInfo(art.bytes);
	// 1200×800 pads to a 1200 px square — every standard size fits.
	expect(ico.count).toBe(5);
	expect(ico.sizes).toContain(16);
	expect(ico.sizes).toContain(32);
	expect(ico.sizes).toContain(256);
	for (const entry of ico.entries) expect(entry.isPng, `${entry.size}px entry is PNG`).toBe(true);
	// JPG has no alpha, but padToSquare centers 1200×800 on a transparent
	// square — the embedded PNGs must carry that transparency.
	const small = ico.entries.find((e) => e.size === 32);
	const raw = await decodeRaw(small!.bytes);
	let transparent = 0;
	for (let i = 3; i < raw.data.length; i += 4) if (raw.data[i] === 0) transparent++;
	expect(transparent, 'square padding is transparent').toBeGreaterThan(0);
});

test('CV-23: /flac-to-mp3 presets MP3 and converts a FLAC', async ({ page }) => {
	test.skip(!audioFixtures().files['tone-3s.flac'], 'flac fixture missing');
	await gotoPath(page, '/flac-to-mp3');
	await expect(page).toHaveTitle(/FLAC to MP3/);
	await expect(page.getByText('Drop FLAC files here')).toBeVisible();
	await upload(page, fxAudio('tone-3s.flac'));
	await expect(page.getByRole('button', { name: 'MP3', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.mp3');
	expect((await audioInfo(art.bytes)).audioCodec).toBe('mp3');
});

test('CV-24: /wav-to-flac presets FLAC and packs a WAV losslessly', async ({ page }) => {
	await gotoPath(page, '/wav-to-flac');
	await expect(page).toHaveTitle(/WAV to FLAC/);
	await expect(page.getByText('Drop WAV files here')).toBeVisible();
	await upload(page, fx('tone-3s.wav'));
	await expect(page.getByRole('button', { name: 'FLAC', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.flac');
	const info = await audioInfo(art.bytes);
	expect(info.audioCodec).toBe('flac');
	expect(art.bytes.length).toBeLessThan(readFileSync(fx('tone-3s.wav')).length);
});

test('CV-25: /opus-to-mp3 presets MP3 and converts a voice-note .opus', async ({ page }) => {
	test.skip(!audioFixtures().files['tone-3s.opus'], 'no Opus encoder in this Chromium');
	await gotoPath(page, '/opus-to-mp3');
	await expect(page).toHaveTitle(/OPUS to MP3/);
	await expect(page.getByText('Drop OPUS files here')).toBeVisible();
	await upload(page, fxAudio('tone-3s.opus'));
	await expect(page.getByRole('button', { name: 'MP3', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.mp3');
	expect((await audioInfo(art.bytes)).audioCodec).toBe('mp3');
});

test('CV-26: /ogg-to-mp3 presets MP3 and converts an OGG', async ({ page }) => {
	test.skip(!audioFixtures().files['tone-3s.ogg'], 'no Opus encoder in this Chromium');
	await gotoPath(page, '/ogg-to-mp3');
	await expect(page).toHaveTitle(/OGG to MP3/);
	await expect(page.getByText('Drop OGG files here')).toBeVisible();
	await upload(page, fxAudio('tone-3s.ogg'));
	await expect(page.getByRole('button', { name: 'MP3', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.mp3');
	expect((await audioInfo(art.bytes)).audioCodec).toBe('mp3');
});

test('CV-27: /aac-to-mp3 presets MP3 and converts a bare ADTS stream', async ({ page }) => {
	test.skip(!audioFixtures().files['tone-3s.aac'], 'no AAC encoder in this Chromium');
	await gotoPath(page, '/aac-to-mp3');
	await expect(page).toHaveTitle(/AAC to MP3/);
	await expect(page.getByText('Drop AAC files here')).toBeVisible();
	await upload(page, fxAudio('tone-3s.aac'));
	await expect(page.getByRole('button', { name: 'MP3', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.mp3');
	expect((await audioInfo(art.bytes)).audioCodec).toBe('mp3');
});

test('CV-28: /mp3-to-wav presets WAV and decodes to PCM', async ({ page }) => {
	await gotoPath(page, '/mp3-to-wav');
	await expect(page).toHaveTitle(/MP3 to WAV/);
	await expect(page.getByText('Drop MP3 files here')).toBeVisible();
	await upload(page, fxAudio('tone-3s.mp3'));
	await expect(page.getByRole('button', { name: 'WAV', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.wav');
	expect((await audioInfo(art.bytes)).audioCodec).toMatch(/^pcm/);
});

test('CV-29: /mp4-to-wav presets WAV and extracts the audio track', async ({ page }) => {
	await gotoPath(page, '/mp4-to-wav');
	await expect(page).toHaveTitle(/MP4 to WAV/);
	await expect(page.getByText('Drop video files here')).toBeVisible();
	await upload(page, fxVideo('v-audio-3s.mp4'));
	await expect(page.getByRole('button', { name: 'WAV', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('v-audio-3s.wav');
	const info = await audioInfo(art.bytes);
	expect(info.audioCodec).toMatch(/^pcm/);
	expect(info.hasVideo, 'video track discarded').toBe(false);
});

test('CV-30: /jpg-to-avif presets AVIF and converts', async ({ page }) => {
	await gotoPath(page, '/jpg-to-avif');
	await expect(page).toHaveTitle(/JPG to AVIF Converter/);
	await upload(page, fx('photo-1200x800.jpg'));
	await expect(outputPill(page, 'AVIF')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	expect((await imageMeta((await downloadRow(page)).bytes)).format).toBe('avif');
});

test('CV-31: /png-to-avif keeps transparency', async ({ page }) => {
	await gotoPath(page, '/png-to-avif');
	await upload(page, fx('graphic-alpha.png'));
	await expect(outputPill(page, 'AVIF')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const m = await imageMeta((await downloadRow(page)).bytes);
	expect(m.format).toBe('avif');
	expect(m.hasAlpha).toBe(true);
});

test('CV-32: /compress-avif scopes the dropzone to AVIF and recompresses', async ({ page }) => {
	await gotoPath(page, '/compress-avif');
	await expect(page.getByText('Drop AVIF files here')).toBeVisible();
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', 'image/avif,.avif');
	await upload(page, fx('photo-800x600.avif'));
	await expect(outputPill(page, 'AVIF')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	expect((await imageMeta((await downloadRow(page)).bytes)).format).toBe('avif');
});

test('CV-33: /gif-to-webp keeps the animation', async ({ page }) => {
	const meta = fxMeta<{ pages: number }>('anim-12f.gif');
	await gotoPath(page, '/gif-to-webp');
	await expect(page).toHaveTitle(/GIF to WebP/);
	await upload(page, fx('anim-12f.gif'));
	await expect(outputPill(page, 'WebP')).toHaveAttribute('aria-pressed', 'true');
	const run = await compress(page);
	expect(run.warnings, 'animation preserved, no warning').toEqual([]);
	const art = await downloadRow(page);
	expect(art.name).toBe('anim-12f.webp');
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('webp');
	expect(m.pages, 'all frames re-encoded').toBe(meta.pages);
});

test('CV-34: /mp3-to-m4a presets M4A and converts', async ({ page }) => {
	await gotoPath(page, '/mp3-to-m4a');
	await expect(page).toHaveTitle(/MP3 to M4A/);
	await upload(page, fxAudio('tone-3s.mp3'));
	await expect(page.getByRole('button', { name: 'M4A', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.m4a');
	const info = await audioInfo(art.bytes);
	expect(info.audioCodec).toBe('aac');
	expect(info.hasVideo).toBe(false);
});

test('CV-35: /webm-to-mp3 extracts the audio track as MP3', async ({ page }) => {
	await gotoPath(page, '/webm-to-mp3');
	await expect(page).toHaveTitle(/WebM to MP3/);
	await expect(page.getByText('Drop WebM files here')).toBeVisible();
	await upload(page, fxVideo('v-audio-3s.webm'));
	await expect(page.getByRole('button', { name: 'MP3', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('v-audio-3s.mp3');
	const info = await audioInfo(art.bytes);
	expect(info.audioCodec).toBe('mp3');
	expect(info.hasVideo, 'video track discarded').toBe(false);
});

test('CV-36: /bmp-to-png converts losslessly', async ({ page }) => {
	const meta = fxMeta<{ width: number; height: number; ref: string }>('graphic.bmp');
	await gotoPath(page, '/bmp-to-png');
	await expect(page).toHaveTitle(/BMP to PNG/);
	await upload(page, fx('graphic.bmp'));
	await expect(outputPill(page, 'PNG')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('#quality')).toHaveValue('100');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('graphic.png');
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('png');
	expect([m.width, m.height]).toEqual([meta.width, meta.height]);
	// Lossless path — byte-identical pixels vs the PNG twin of the BMP.
	const { ratio } = await pixelDiff(readFileSync(fx(meta.ref)), art.bytes);
	expect(ratio, 'lossless conversion').toBe(0);
});

test('CV-37: /remove-audio-from-video strips the audio track', async ({ page }) => {
	await gotoPath(page, '/remove-audio-from-video');
	await expect(page).toHaveTitle(/Remove Audio from Video/);
	await upload(page, fxVideo('v-audio-3s.mp4'));
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('v-audio-3s.mp4');
	const info = await videoInfo(art.bytes);
	expect(info.audioCodec, 'audio track removed').toBeNull();
	expect(info.videoCodec).toBeTruthy();
});

test('CV-38: /png-to-svg vectorizes a flat graphic into real paths', async ({ page }) => {
	await gotoPath(page, '/png-to-svg');
	await expect(page).toHaveTitle(/PNG to SVG Converter/);
	await upload(page, fx('graphic-alpha.png'));
	await expect(outputPill(page, 'SVG')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('compress-cta')).toHaveText('Convert 1 image to SVG');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('graphic-alpha.svg');
	const text = art.bytes.toString('utf8');
	expect(text).toContain('<svg');
	expect(text).toContain('<path');
	// The trace must resemble the source — sharp rasterizes the SVG at its
	// intrinsic (source) size, so a straight pixel diff works. Vectorization
	// is approximate by nature (the fixture's gradient flattens to one color),
	// so the bound only catches garbage: healthy trace measures ~0.21 here,
	// the degrees-instead-of-radians blob soup ≥0.45.
	const { ratio } = await pixelDiff(readFileSync(fx('graphic-alpha.png')), art.bytes);
	expect(ratio, 'trace resembles the source graphic').toBeLessThan(0.28);
});

test('CV-39: /jpg-to-svg traces a photo and flags the approximate result', async ({ page }) => {
	await gotoPath(page, '/jpg-to-svg');
	await expect(page).toHaveTitle(/JPG to SVG Converter/);
	await upload(page, fx('photo-1200x800.jpg'));
	await expect(outputPill(page, 'SVG')).toHaveAttribute('aria-pressed', 'true');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('photo-1200x800.svg');
	expect(art.bytes.toString('utf8')).toContain('<svg');
	// A photographic trace lands bigger than the JPG — the row says so honestly.
	await expect(page.getByTestId('row-info')).toContainText(/vectorization suits logos/i);
});

test('CV-40: /dng-to-jpg develops a DNG via LibRaw and converts', async ({ page }) => {
	const meta = fxMeta<{ width: number; height: number; ref: string }>('photo.dng');
	await gotoPath(page, '/dng-to-jpg');
	await expect(page).toHaveTitle(/DNG to JPG/);
	await expect(page.getByText('Drop DNG files here')).toBeVisible();
	await upload(page, fx('photo.dng'));
	await expect(outputPill(page, 'JPG')).toHaveAttribute('aria-pressed', 'true');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('photo.jpg');
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('jpeg');
	expect([m.width, m.height]).toEqual([meta.width, meta.height]);
	// Diff against the LibRaw ground-truth twin (generated by the fixture
	// script from the same wasm). The browser runs the pthreads build, whose
	// develop drifts ~±1 level on grain vs the single-threaded node twin —
	// measured healthy ratio ≈0.09; garbage (channel swap, wrong gamma)
	// lands ≥0.5. The bound proves a correct develop, not bit-exactness.
	const { ratio } = await pixelDiff(readFileSync(fx(meta.ref)), art.bytes);
	expect(ratio, 'browser develop matches the LibRaw twin').toBeLessThan(0.15);
});

test('CV-41: /raw-to-jpg accepts the whole RAW family and develops', async ({ page }) => {
	await gotoPath(page, '/raw-to-jpg');
	await expect(page).toHaveTitle(/RAW to JPG/);
	await expect(page.getByText('Drop RAW files here')).toBeVisible();
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', /\.cr2.*\.dng/);
	await upload(page, fx('photo.dng'));
	await expect(outputPill(page, 'JPG')).toHaveAttribute('aria-pressed', 'true');
	await compress(page, { timeout: 120_000 });
	expect((await imageMeta((await downloadRow(page)).bytes)).format).toBe('jpeg');
});

test('CV-42: /jxl-to-jpg decodes JPEG XL via icodec and converts', async ({ page }) => {
	await gotoPath(page, '/jxl-to-jpg');
	await expect(page).toHaveTitle(/JXL to JPG/);
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', 'image/jxl,.jxl');
	await upload(page, fx('photo-720x480.jxl'));
	await expect(outputPill(page, 'JPG')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('photo-720x480.jpg');
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('jpeg');
	expect([m.width, m.height]).toEqual([720, 480]);
	// Diff against the .jxl source itself (decodeRaw decodes it via icodec's
	// node build) — proves a REAL decode while measuring only the JPG
	// generation (the fixture is lossless JXL; the page presets quality 90).
	const { ratio } = await pixelDiff(readFileSync(fx('photo-720x480.jxl')), art.bytes);
	assertDiffBudget(ratio, DIFF_BUDGET.q90, 'CV-42 jxl→jpg');
});

test('CV-43: /jpg-to-jxl presets the JXL pill and encodes JPEG XL', async ({ page }) => {
	await gotoPath(page, '/jpg-to-jxl');
	await expect(page).toHaveTitle(/JPG to JXL/);
	await upload(page, fx('photo-1200x800.jpg'));
	// preset-only pill: rendered (and active) because the preset selected it
	await expect(outputPill(page, 'JXL')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('photo-1200x800.jxl');
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('jxl');
	expect([m.width, m.height]).toEqual([1200, 800]);
	// JXL results can't render in Chromium — the Compare button must not appear.
	await expect(rows(page).getByRole('button', { name: 'Compare' })).toHaveCount(0);
});

test('CV-44: /compress-jxl scopes the dropzone to JXL and re-encodes', async ({ page }) => {
	await gotoPath(page, '/compress-jxl');
	await expect(page.getByText('Drop JXL files here')).toBeVisible();
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', 'image/jxl,.jxl');
	await upload(page, fx('photo-720x480.jxl'));
	await expect(outputPill(page, 'JXL')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('photo-720x480.jxl');
	expect((await imageMeta(art.bytes)).format).toBe('jxl');
});

test('CV-19b: /tiff-to-jpg honors the TIFF Orientation tag', async ({ page }) => {
	// F-06 (quality sweep): utif2 ignores tag 274, so orientation-tagged TIFFs
	// converted rotated/mirrored. The fixture stores pixels rotated 90° CCW
	// with Orientation 6 — the output must come out upright (800×600).
	await gotoPath(page, '/tiff-to-jpg');
	await upload(page, fx('photo-orient6.tiff'));
	await compress(page);
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('jpeg');
	expect([m.width, m.height], 'orientation applied → upright dims').toEqual([800, 600]);
	const { ratio } = await pixelDiff(readFileSync(fx('photo-orient6-ref.png')), art.bytes);
	assertDiffBudget(ratio, DIFF_BUDGET.q80, 'CV-19b tiff orientation');
});

test('CV-45: /psd-to-jpg flattens a Photoshop file via @webtoon/psd', async ({ page }) => {
	await gotoPath(page, '/psd-to-jpg');
	await expect(page).toHaveTitle(/PSD to JPG/);
	await expect(page.getByText('Drop PSD files here')).toBeVisible();
	await expect(page.locator('input[type=file]')).toHaveAttribute(
		'accept',
		'image/vnd.adobe.photoshop,.psd'
	);
	await upload(page, fx('photo-640x400.psd'));
	await expect(outputPill(page, 'JPG')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('photo-640x400.jpg');
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('jpeg');
	expect([m.width, m.height]).toEqual([640, 400]);
	// Diff against the same-pixels PNG twin — proves the RLE planes really
	// decoded (sharp cannot read the .psd source directly).
	const { ratio } = await pixelDiff(readFileSync(fx('psd-ref.png')), art.bytes);
	assertDiffBudget(ratio, DIFF_BUDGET.q90, 'CV-45 psd→jpg');
});

test('CV-45b: /psd-to-jpg decodes RAW-composite PSDs (the real-world default)', async ({
	page
}) => {
	// F-05 (quality sweep 2026-07-18): every real sample PSD stores an
	// uncompressed (RawData) composite, and the app refused them all with a
	// "re-save it in Photoshop" error — @webtoon/psd misreads raw planes, so
	// codecs/psd-raw.ts now decodes the raw composite section directly.
	await gotoPath(page, '/psd-to-jpg');
	await upload(page, fx('photo-640x400-raw.psd'));
	await compress(page);
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('jpeg');
	expect([m.width, m.height]).toEqual([640, 400]);
	// Same-pixels PNG twin — proves the raw planes decoded as R,G,B (the
	// upstream bug would tint everything red).
	const { ratio } = await pixelDiff(readFileSync(fx('psd-ref.png')), art.bytes);
	assertDiffBudget(ratio, DIFF_BUDGET.q90, 'CV-45b raw psd→jpg');
});

test('CV-46: /psd-to-png converts losslessly at quality 100', async ({ page }) => {
	await gotoPath(page, '/psd-to-png');
	await expect(page).toHaveTitle(/PSD to PNG/);
	await upload(page, fx('photo-640x400.psd'));
	await expect(outputPill(page, 'PNG')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('photo-640x400.png');
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('png');
	expect([m.width, m.height]).toEqual([640, 400]);
	// PNG at q100 is lossless — the pixels must match the source exactly.
	const { ratio } = await pixelDiff(readFileSync(fx('psd-ref.png')), art.bytes);
	expect(ratio, 'lossless PSD→PNG must be pixel-exact').toBe(0);
});
