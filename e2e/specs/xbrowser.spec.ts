/**
 * XB-01…06 (@xbrowser): capability-degradation smoke for Firefox/WebKit —
 * the app must WORK where the engine allows (wasm image codecs, EXIF byte
 * surgery and the wasm audio encoders are engine-agnostic) and DEGRADE
 * GRACEFULLY where it doesn't (WebCodecs video encode). Runs on chromium in
 * every full run; the firefox/webkit projects join under E2E_XBROWSER=1
 * (see playwright.config).
 */
import { expect, fx, fxVideo, test } from '../fixtures';
import { compress, downloadRow, gotoTab, rows, setOutputFormat, upload } from '../helpers';
import { audioInfo, videoInfo } from '../verify';

function collectPageErrors(page: import('@playwright/test').Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	return errors;
}

test('XB-01: home renders without uncaught exceptions @xbrowser', async ({ page }) => {
	const errors = collectPageErrors(page);
	await gotoTab(page, 'jpg');
	// The CTA appears only once files are queued — the load smoke asserts the
	// shell: heading + a working file input.
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(page.locator('input[type=file]')).toBeAttached();
	expect(errors, 'no uncaught exceptions on load').toEqual([]);
});

test('XB-02: jpg → jpg compression works end-to-end @xbrowser', async ({ page }) => {
	const errors = collectPageErrors(page);
	await gotoTab(page, 'jpg');
	await upload(page, fx('photo-1200x800.jpg'));
	await setOutputFormat(page, 'JPG');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.bytes.length).toBeGreaterThan(1000);
	expect(art.bytes[0], 'JPEG magic').toBe(0xff);
	expect(art.bytes[1]).toBe(0xd8);
	expect(errors).toEqual([]);
});

test('XB-03: video tab succeeds or degrades to an explanation — never crashes @xbrowser', async ({
	page
}) => {
	test.setTimeout(180_000);
	const errors = collectPageErrors(page);
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	const cta = page.getByTestId('compress-cta');
	await expect(cta).toBeEnabled();
	await cta.click();
	// Either outcome is a pass; a hang or uncaught exception is the failure.
	const banner = page.getByTestId('error-banner');
	const download = rows(page).getByRole('button', { name: 'Download' }).first();
	const outcome = await Promise.race([
		banner.waitFor({ state: 'visible', timeout: 150_000 }).then(() => 'banner' as const),
		download.waitFor({ state: 'visible', timeout: 150_000 }).then(() => 'download' as const)
	]);
	if (outcome === 'banner') {
		await expect(banner, 'a helpful message, not a stack trace').toHaveText(/browser|convert/i);
	}
	expect(errors).toEqual([]);
});

test('XB-04: EXIF strip (pure byte surgery) works everywhere @xbrowser', async ({ page }) => {
	const errors = collectPageErrors(page);
	await gotoTab(page, 'exif');
	await upload(page, fx('exif-gps.jpg'));
	await compress(page, { timeout: 120_000 });
	await expect(page.getByTestId('row-info')).toHaveText(/Removed:/);
	const art = await downloadRow(page);
	expect(art.bytes.length).toBeGreaterThan(1000);
	expect(errors).toEqual([]);
});

test('XB-05: m4a (AAC) output works everywhere — native or wasm fallback @xbrowser', async ({
	page
}) => {
	// Chromium and Safari encode AAC natively; Firefox reaches the identical
	// result through the FFmpeg wasm fallback (~1 MB fetch + init, hence the
	// generous timeout). Same assertions on every engine — the absence of a
	// capability skip is the point of this test.
	test.setTimeout(240_000);
	const errors = collectPageErrors(page);
	await gotoTab(page, 'audio');
	await upload(page, fx('tone-3s.wav'));
	const pill = page.getByRole('button', { name: 'M4A', exact: true });
	await pill.click();
	await expect(pill).toHaveAttribute('aria-pressed', 'true');
	await compress(page, { timeout: 210_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.m4a');
	expect((await audioInfo(art.bytes)).audioCodec).toBe('aac');
	expect(errors).toEqual([]);
});

test('XB-06: a video convert that succeeds must carry AAC audio — never drop it @xbrowser', async ({
	page
}) => {
	// The regression this locks in: without the probe-time wasm registration,
	// Firefox reported AAC unencodable and the MP4 run SUCCEEDED with the
	// audio track silently discarded (or opus kept, unplayable in Safari).
	// VIDEO encode support still varies per engine (XB-03's tolerance), so a
	// banner is an acceptable outcome — but a download with missing or
	// non-AAC audio is the failure.
	test.setTimeout(240_000);
	const errors = collectPageErrors(page);
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-audio-3s.mp4'));
	const cta = page.getByTestId('compress-cta');
	await expect(cta).toBeEnabled();
	await cta.click();
	const banner = page.getByTestId('error-banner');
	const download = rows(page).getByRole('button', { name: 'Download' }).first();
	const outcome = await Promise.race([
		banner.waitFor({ state: 'visible', timeout: 210_000 }).then(() => 'banner' as const),
		download.waitFor({ state: 'visible', timeout: 210_000 }).then(() => 'download' as const)
	]);
	if (outcome === 'banner') {
		await expect(banner, 'a helpful message, not a stack trace').toHaveText(/browser|convert/i);
	} else {
		const art = await downloadRow(page);
		const info = await videoInfo(art.bytes);
		expect(info.audioCodec, 'opus source re-encoded via native or wasm AAC').toBe('aac');
		expect(info.trackCount, 'audio track survived the convert').toBe(2);
	}
	expect(errors).toEqual([]);
});
