/**
 * E-01…07: failure paths — corrupt inputs, unsupported drops, the (fixed)
 * AVIF routing, encrypted-PDF merge guidance, per-file batch isolation.
 */
import { expect, fx, fxVideo, realFile, test } from '../fixtures';
import {
	compress,
	downloadRow,
	dropFiles,
	dropOnZone,
	gotoTab,
	rows,
	setOutputFormat,
	upload
} from '../helpers';
import { imageMeta } from '../verify';

test('E-01: corrupt jpg shows the error banner and recovers @smoke', async ({ page, rec }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('corrupt.jpg'));
	await setOutputFormat(page, 'JPG'); // pinned: the tab default became Auto
	const run = await compress(page, { expectError: true });
	expect(run.error).toBeTruthy();
	await expect(rows(page).getByRole('button', { name: 'Download' })).toHaveCount(0);
	await expect(page.getByTestId('compress-cta'), 'CTA recovers for a retry').toBeEnabled();
	rec.record({
		id: 'E-01',
		settings: { tab: 'jpg' },
		input: { name: 'corrupt.jpg', bytes: 256 },
		error: run.error,
		metrics: {}
	});
});

test('E-02: corrupt pdf shows the error banner', async ({ page, rec }) => {
	await gotoTab(page, 'pdf');
	await upload(page, fx('corrupt.pdf'));
	const run = await compress(page, { expectError: true, timeout: 120_000 });
	expect(run.error).toBeTruthy();
	rec.record({
		id: 'E-02',
		settings: { tab: 'pdf', op: 'compress' },
		input: { name: 'corrupt.pdf', bytes: 256 },
		error: run.error,
		metrics: {}
	});
});

test('E-03: an unsupported file type reports its name exactly', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await dropFiles(page, [{ path: fx('notes.txt'), mimeType: 'text/plain' }]);
	await expect(page.getByTestId('error-banner')).toHaveText(/Unsupported file type: notes\.txt/);
});

test('E-04: dropped AVIF routes to the jpg tab and compresses', async ({ page, rec }) => {
	await gotoTab(page, 'png'); // start elsewhere to prove the routing hop
	await dropFiles(page, [{ path: fx('photo-800x600.avif'), mimeType: 'image/avif' }]);
	await expect(page).toHaveURL(/\/compress-jpg$/);
	await expect(page.getByTestId('error-banner')).toHaveCount(0);
	await expect(rows(page)).toHaveCount(1);
	await setOutputFormat(page, 'JPG'); // pinned: this asserts the jpg conversion specifically
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('photo-800x600.jpg');
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('jpeg');
	expect([m.width, m.height]).toEqual([800, 600]);
	rec.record({
		id: 'E-04',
		settings: { droppedAvif: true, landsOn: 'jpg' },
		input: { name: 'photo-800x600.avif', bytes: 0 },
		output: { name: art.name, bytes: art.bytes.length },
		note: 'Regression guard: AVIF drop/paste used to error "Unsupported file type".',
		assets: {
			original: rec.saveAsset('E-04', 'original', 'photo-800x600.avif', fx('photo-800x600.avif')),
			output: rec.saveAsset('E-04', 'output', art.name, art.bytes)
		}
	});
});

test('E-05: merging an encrypted pdf explains the workaround', async ({ page }) => {
	// Needs a USER-password-locked PDF (one that refuses to OPEN). Owner-only
	// protection (like the real *-protected.pdf sample) opens freely in gs, so
	// it can't trigger this error. Make one: app → Protect (any password) →
	// download → rename to user-locked.pdf.
	const encrypted = realFile(/(^encrypted|user-locked)\S*\.pdf$/i);
	test.skip(!encrypted, 'drop a user-locked.pdf (app Protect output) into tests/fixtures/real/');
	await gotoTab(page, 'pdf');
	await page.getByRole('button', { name: 'Merge', exact: true }).click();
	await upload(page, encrypted!, fx('merge-a.pdf'));
	const run = await compress(page, { expectError: true });
	expect(run.error).toMatch(/encrypt/i);
});

test('E-06: one corrupt file does not take down the rest of the batch', async ({ page, rec }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('corrupt.jpg'), fx('photo-1200x800.jpg'));
	await setOutputFormat(page, 'JPG');
	const run = await compress(page, { expectError: true });
	expect(run.error, 'banner names the failing file').toMatch(/corrupt\.jpg/);
	// The healthy file still finished: exactly one downloadable row.
	await expect(rows(page).getByRole('button', { name: 'Download' })).toHaveCount(1);
	await expect(page.getByTestId('row-error'), 'failed row carries its error').toBeVisible();
	await expect(page.getByTestId('compress-cta'), 'CTA recovers for a retry').toBeEnabled();
	rec.record({
		id: 'E-06',
		settings: { tab: 'jpg', batch: ['corrupt.jpg', 'photo-1200x800.jpg'] },
		input: { name: 'corrupt.jpg + photo-1200x800.jpg', bytes: 0 },
		error: run.error,
		note: 'Per-file isolation: finished results survive a sibling failure.',
		metrics: {}
	});
});

test('E-07: compressing a password-protected pdf says so, not "exit code"', async ({ page }) => {
	// Same fixture contract as E-05: must be USER-locked, not owner-only.
	const encrypted = realFile(/(^encrypted|user-locked)\S*\.pdf$/i);
	test.skip(!encrypted, 'drop a user-locked.pdf (app Protect output) into tests/fixtures/real/');
	await gotoTab(page, 'pdf');
	await upload(page, encrypted!);
	const run = await compress(page, { expectError: true, timeout: 120_000 });
	expect(run.error).toMatch(/password/i);
	expect(run.error).not.toMatch(/exit code/i);
});

test('E-08: a video dropped on the jpg DROPZONE re-routes to the video tab', async ({ page }) => {
	await gotoTab(page, 'jpg');
	// The dropzone used to force-park anything on the active tab; the video
	// then only failed at compress time with a confusing decode error.
	await dropOnZone(page, [{ path: fxVideo('v-320x240-3s.mp4'), mimeType: 'video/mp4' }]);
	await expect(page).toHaveURL(/\/compress-video$/);
	await expect(rows(page)).toHaveCount(1);
	await expect(page.getByTestId('error-banner')).toHaveCount(0);
});

test('E-09: a mixed drop parks the routable file AND names the skipped one', async ({ page }) => {
	await gotoTab(page, 'jpg');
	// Used to discard unroutable files silently as soon as one file routed.
	await dropFiles(page, [
		{ path: fx('photo-1200x800.jpg'), mimeType: 'image/jpeg' },
		{ path: fx('notes.txt'), mimeType: 'text/plain' }
	]);
	await expect(rows(page)).toHaveCount(1);
	await expect(page.getByTestId('error-banner')).toContainText('Unsupported file type: notes.txt');
});

test('E-10: exotic real formats are rejected by name, with a count', async ({ page }) => {
	// Kodak PhotoCD / Radiance HDR / ICO input — none decodable here. Blank
	// MIME (picker reality for exotica) forces the extension fallback.
	const files = [realFile(/\.pcd$/i), realFile(/\.hdr$/i), realFile(/\.ico$/i)].filter(
		(f): f is string => f !== null
	);
	test.skip(files.length < 2, 'drop exotic samples (.pcd/.hdr/.ico) into tests/fixtures/real');
	await gotoTab(page, 'jpg');
	await dropFiles(
		page,
		files.map((path) => ({ path, mimeType: '' }))
	);
	await expect(page.getByTestId('error-banner')).toContainText(
		new RegExp(`Unsupported file type: .+ \\(\\+${files.length - 1} more\\)`)
	);
	await expect(rows(page)).toHaveCount(0);
});

test('E-11: removing a failed row takes its stale banner and red badge with it', async ({
	page
}) => {
	// The failure banner (and the red tab badge derived from it) used to keep
	// naming a file the user had already removed from the list.
	await gotoTab(page, 'jpg');
	await upload(page, fx('corrupt.jpg'), fx('photo-1200x800.jpg'));
	await setOutputFormat(page, 'JPG');
	const run = await compress(page, { expectError: true });
	expect(run.error, 'banner names the failing file').toMatch(/corrupt\.jpg/);

	await page.getByLabel('Remove corrupt.jpg').click();
	await expect(rows(page)).toHaveCount(1);
	// No failed row remains — neither may the banner that described it…
	await expect(page.getByTestId('error-banner')).toHaveCount(0);
	// …nor the red error badge on any tab pill (the healthy result stays).
	await expect(page.locator('nav span.bg-red-500')).toHaveCount(0);
	await expect(rows(page).getByRole('button', { name: 'Download' })).toHaveCount(1);
});

test.describe('offline chunk fetch', () => {
	// route() cannot intercept requests the service worker answers — blocking
	// SW registration also matches the failure being modeled: a visitor whose
	// SW never got to precache the codec chunk before the network went away.
	test.use({ serviceWorkers: 'block' });

	test('E-12: a failed compress-chunk fetch reads as an honest offline hint', async ({ page }) => {
		// Blocks the codec-orchestration module the way a flaky/offline network
		// would — the banner must explain, not leak the browser's internal
		// "Failed to fetch dynamically imported module: <chunk url>" loader text.
		test.skip(!!process.env.E2E_PREVIEW, 'dev-server module URLs only');
		await gotoTab(page, 'jpg');
		// Installed before upload so the file-add prefetch cannot cache the chunk.
		await page.route('**/src/lib/compress.ts*', (route) => route.abort());
		await upload(page, fx('photo-1200x800.jpg'));
		await setOutputFormat(page, 'JPG');
		await page.getByTestId('compress-cta').click();

		const banner = page.getByTestId('error-banner');
		await expect(banner).toBeVisible();
		const text = ((await banner.textContent()) ?? '').trim();
		expect(text).not.toMatch(/dynamically imported module|Importing a module script/i);
		expect(text, 'no internal chunk URLs').not.toMatch(/https?:\/\//);
		expect(text, 'actionable next step').toMatch(/connection|offline/i);
		// The run settles cleanly — CTA ready for a retry once back online.
		await expect(page.getByTestId('compress-cta')).toBeEnabled();
	});
});
