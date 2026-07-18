/**
 * B-01…10: batch flows and UI behaviors — ZIP export with duplicate-name
 * dedup, cancel mid-batch, tab persistence, global drop routing, row removal,
 * Compare modal, clipboard copy, cross-tab cancel isolation.
 */
import { expect, fx, test } from '../fixtures';
import {
	cancelRun,
	compress,
	downloadAllZip,
	downloadRowAt,
	dropFiles,
	dropOnZone,
	gotoTab,
	readStats,
	rowByName,
	rows,
	setOutputFormat,
	upload
} from '../helpers';
import { unzip } from '../verify';

test('B-01: 5-file batch — stats, ZIP contents, duplicate-name dedup @smoke', async ({
	page,
	rec
}) => {
	const files = [
		fx('photo-1200x800.jpg'),
		fx('photo-1200x800.jpg'), // duplicate name on purpose
		fx('tiny-optimized.jpg'),
		fx('photo-progressive.jpg'),
		fx('photo-exif6.jpg')
	];
	await gotoTab(page, 'jpg');
	await upload(page, ...files);
	await setOutputFormat(page, 'JPG'); // pinned: the tab default became Auto
	await compress(page, { timeout: 90_000 });

	expect((await readStats(page)).files, 'stats card Files').toBe(5);

	const rowArts = [];
	for (let i = 0; i < 5; i++) rowArts.push(await downloadRowAt(page, i));

	const zipArt = await downloadAllZip(page);
	expect(zipArt.name).toBe('compressed.zip');
	const entries = unzip(zipArt.bytes);
	expect(Object.keys(entries).sort()).toEqual(
		[
			'photo-1200x800.jpg',
			'photo-1200x800 (1).jpg',
			'tiny-optimized.jpg',
			'photo-progressive.jpg',
			'photo-exif6.jpg'
		].sort()
	);
	// ZIP entries are written in results order — must byte-match row downloads.
	const zipByOrder = Object.values(entries);
	rowArts.forEach((art, i) => {
		expect(Buffer.from(zipByOrder[i]).equals(art.bytes), `zip entry ${i} == row ${i}`).toBe(true);
	});
	rec.record({
		id: 'B-01',
		settings: { tab: 'jpg', files: 5, duplicateNames: true },
		input: { name: '5 jpgs (1 dup name)', bytes: 0 },
		output: { name: zipArt.name, bytes: zipArt.bytes.length },
		metrics: { zipEntries: Object.keys(entries).length },
		assets: { output: rec.saveAsset('B-01', 'output', zipArt.name, zipArt.bytes) }
	});
});

test('B-02: cancel mid-batch keeps finished results, no error @slow', async ({ page, rec }) => {
	test.setTimeout(180_000);
	// Three 12 MP AVIF encodes ≈ tens of seconds each — plenty of cancel window,
	// and AVIF runs in the abortable worker pool (unlike gifsicle).
	await gotoTab(page, 'jpg');
	await upload(
		page,
		fx('photo-4000x3000.jpg'),
		fx('photo-4000x3000.jpg'),
		fx('photo-4000x3000.jpg')
	);
	await page.getByRole('button', { name: 'AVIF', exact: true }).click();

	const cta = page.getByTestId('compress-cta');
	await cta.click();
	// While busy, rows show status icons (not Download buttons). Files complete
	// in parallel and out of order — wait for ANY row's "Done" checkmark.
	await rows(page).getByRole('img', { name: 'Done' }).first().waitFor({ timeout: 120_000 });
	// Threaded AVIF can finish the whole batch before this click lands (the
	// Cancel button fades out inert) — a "too fast to cancel" run is legitimate.
	let cancelled = true;
	try {
		await cancelRun(page);
	} catch {
		cancelled = false;
	}

	await expect(cta).toBeEnabled({ timeout: 30_000 });
	await expect(cta).toHaveText(/Compress 3 files/);
	await expect(page.getByTestId('error-banner')).toHaveCount(0);
	const downloadCount = await rows(page).getByRole('button', { name: 'Download' }).count();
	expect(downloadCount, 'finished results survive the cancel').toBeGreaterThanOrEqual(1);
	if (cancelled) {
		expect(downloadCount, 'the cancelled tail must not have results').toBeLessThan(3);
	}
	// Mid-flight cancel semantics are additionally covered by video V-10.
	rec.record({
		id: 'B-02',
		settings: { tab: 'jpg', output: 'avif', files: 3, cancelled },
		input: { name: '3 × photo-4000x3000.jpg', bytes: 0 },
		output: { name: `${downloadCount} finished result(s)`, bytes: 0 },
		metrics: { finishedBeforeCancel: downloadCount, cancelLanded: cancelled }
	});
});

test('PAR-01: image batches actually run in parallel, order preserved @slow', async ({
	page,
	rec
}) => {
	test.setTimeout(180_000);
	const cores = await page.evaluate(() => navigator.hardwareConcurrency ?? 1);
	test.skip(cores < 2, 'single-core environment cannot parallelize');

	await gotoTab(page, 'jpg');
	// 12 MP inputs keep encodes slow enough to observe concurrent spinners.
	await upload(
		page,
		fx('photo-4000x3000.jpg'),
		fx('photo-4000x3000.jpg'),
		fx('photo-4000x3000.jpg'),
		fx('photo-4000x3000.jpg')
	);
	await setOutputFormat(page, 'JPG'); // pinned: the tab default became Auto
	await page.getByTestId('compress-cta').click();

	// Poll while the run is live: at least two rows spinning at once proves
	// the pool fans out (the old serial loop showed exactly one spinner).
	let maxSpinning = 0;
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline) {
		const spinning = await rows(page).getByLabel('Compressing').count();
		maxSpinning = Math.max(maxSpinning, spinning);
		const done = await rows(page).getByRole('button', { name: 'Download' }).count();
		if (done === 4) break;
		await page.waitForTimeout(100);
	}
	expect(maxSpinning, 'at least 2 files in flight simultaneously').toBeGreaterThanOrEqual(2);

	await expect(rows(page).getByRole('button', { name: 'Download' })).toHaveCount(4, {
		timeout: 120_000
	});
	await expect(page.getByTestId('error-banner')).toHaveCount(0);

	// Completion order must not leak into result order: ZIP mirrors row order.
	const zip = unzip((await downloadAllZip(page)).bytes);
	expect(Object.keys(zip).length).toBe(4);
	rec.record({
		id: 'PAR-01',
		settings: { tab: 'jpg', files: 4, parallel: true },
		input: { name: '4 × photo-4000x3000.jpg', bytes: 0 },
		metrics: { maxConcurrentSpinners: maxSpinning, cores }
	});
});

test('B-03: per-tab state survives tab switches, badge shows parked count', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('photo-1200x800.jpg'));
	await page.locator('nav a[data-seg="png"]').click();
	await expect(rows(page)).toHaveCount(0); // png tab is empty
	await expect(page.locator('nav a[data-seg="jpg"]'), 'jpg badge').toContainText('1');
	await page.locator('nav a[data-seg="jpg"]').click();
	await expect(rows(page)).toHaveCount(1); // file still parked on jpg
});

test('B-04: dropping a PNG while on the jpg tab routes to /compress-png', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await dropFiles(page, [{ path: fx('photo-1200x800.png'), mimeType: 'image/png' }]);
	await expect(page).toHaveURL(/\/compress-png$/);
	await expect(rowByName(page, 'photo-1200x800.png')).toHaveCount(1);
});

test('B-05: a mixed drop parks every file on its own tab', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await dropFiles(page, [
		{ path: fx('photo-1200x800.jpg'), mimeType: 'image/jpeg' },
		{ path: fx('photo-1200x800.png'), mimeType: 'image/png' }
	]);
	// jpg group comes first → stays on the jpg tab (URL may remain / or hop to
	// /compress-jpg depending on where the drop landed); png parked with a badge.
	await expect(page).toHaveURL(/\/(compress-jpg)?$/);
	await expect(rowByName(page, 'photo-1200x800.jpg')).toHaveCount(1);
	await expect(page.locator('nav a[data-seg="png"]'), 'png badge').toContainText('1');
	await page.locator('nav a[data-seg="png"]').click();
	await expect(rowByName(page, 'photo-1200x800.png')).toHaveCount(1);
});

test('B-06: removing a row clears it; adding files clears stale results', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('photo-1200x800.jpg'), fx('tiny-optimized.jpg'));
	await setOutputFormat(page, 'JPG'); // pinned: the tab default became Auto
	await compress(page);
	await expect(rows(page).getByRole('button', { name: 'Download' })).toHaveCount(2);

	await page.getByLabel('Remove tiny-optimized.jpg').click();
	await expect(rows(page)).toHaveCount(1);

	// Adding a file invalidates previous results (files ↔ results desync guard).
	await upload(page, fx('photo-progressive.jpg'));
	await expect(rows(page)).toHaveCount(2);
	await expect(rows(page).getByRole('button', { name: 'Download' })).toHaveCount(0);
});

test('B-07: Compare modal opens with the slider and closes on Escape', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('photo-1200x800.jpg'));
	await setOutputFormat(page, 'JPG'); // pinned: the tab default became Auto
	await compress(page);
	await rows(page).getByRole('button', { name: 'Compare' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.locator('img').first()).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
});

test.describe('clipboard', () => {
	test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
	test('B-08: Copy flips to Copied ✓', async ({ page }) => {
		await gotoTab(page, 'png');
		await upload(page, fx('graphic-alpha.png'));
		await setOutputFormat(page, 'PNG'); // pinned: the tab default became Auto
		await compress(page);
		const copyBtn = rows(page).getByRole('button', { name: 'Copy', exact: true });
		test.skip((await copyBtn.count()) === 0, 'clipboard unsupported in this context');
		await copyBtn.click();
		await expect(rows(page).getByText('Copied ✓')).toBeVisible();
	});
});

test('B-09: a PNG dropped on the jpg DROPZONE parks there (convert-to-jpg intent)', async ({
	page
}) => {
	await gotoTab(page, 'jpg');
	// Same-family files stay put — the converter-page contract ("drop a PNG on
	// the JPG tab to get a JPG"). The window-level drop (B-04) routes instead.
	await dropOnZone(page, [{ path: fx('photo-1200x800.png'), mimeType: 'image/png' }]);
	await expect(rows(page)).toHaveCount(1);
	await expect(page).not.toHaveURL(/compress-png/);
	await expect(page.getByTestId('error-banner')).toHaveCount(0);
});

test('B-10: cancelling one tab never truncates a concurrent run on another tab @slow', async ({
	page,
	rec
}) => {
	test.setTimeout(180_000);
	// Victim: three 12 MP AVIF encodes on the jpg tab (tens of seconds each —
	// they are still in flight when the png cancel lands). Both tabs share the
	// image worker pool, so an unscoped cancel would kill the jpg encodes too.
	await gotoTab(page, 'jpg');
	await upload(
		page,
		fx('photo-4000x3000.jpg'),
		fx('photo-4000x3000.jpg'),
		fx('photo-4000x3000.jpg')
	);
	await setOutputFormat(page, 'AVIF');
	await page.getByTestId('compress-cta').click();

	// Second run on the png tab, cancelled as soon as it starts. Wait out the
	// client-side navigation before uploading — upload() counts rows first,
	// and mid-switch it would still see the jpg tab's three.
	await page.locator('nav a[data-seg="png"]').click();
	await expect(page).toHaveURL(/compress-png$/);
	await upload(page, fx('photo-1200x800.png'));
	await setOutputFormat(page, 'AVIF');
	await page.getByTestId('compress-cta').click();
	// A threaded encode can finish before the click lands — that run simply
	// wasn't cancellable anymore, which is still a valid (weaker) pass.
	let cancelled = true;
	try {
		await cancelRun(page);
	} catch {
		cancelled = false;
	}
	await expect(page.getByTestId('compress-cta')).toBeEnabled({ timeout: 30_000 });
	await expect(page.getByTestId('error-banner')).toHaveCount(0);

	// The jpg run must complete EVERY file — no silent truncation, no errors.
	await page.locator('nav a[data-seg="jpg"]').click();
	await expect(rows(page).getByRole('button', { name: 'Download' })).toHaveCount(3, {
		timeout: 150_000
	});
	await expect(page.getByTestId('error-banner')).toHaveCount(0);
	rec.record({
		id: 'B-10',
		settings: { victimTab: 'jpg', cancelledTab: 'png', output: 'avif', cancelLanded: cancelled },
		input: { name: '3 × photo-4000x3000.jpg + 1 png', bytes: 0 },
		output: { name: '3 finished jpg-tab results', bytes: 0 },
		metrics: { cancelLanded: cancelled }
	});
});
