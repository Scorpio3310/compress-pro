/**
 * Z-01…05: the ZIP tab — create (combined archive, level knob), extract
 * (entries as standalone rows, basename flattening), drop-routing.
 */
import { readFileSync } from 'node:fs';
import { expect, fx, fxMeta, test } from '../fixtures';
import {
	compress,
	downloadCombined,
	dropFiles,
	dropOnZone,
	gotoTab,
	rows,
	upload
} from '../helpers';
import { unzip } from '../verify';

async function setZipOp(
	page: import('@playwright/test').Page,
	op: 'Create' | 'Extract' | 'Convert'
) {
	const btn = page.getByRole('button', { name: op, exact: true });
	await btn.click();
	await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

test('Z-01: create bundles two files into one archive @smoke', async ({ page, rec }) => {
	const a = readFileSync(fx('photo-1200x800.jpg'));
	const b = readFileSync(fx('notes.txt'));
	await gotoTab(page, 'zip');
	await upload(page, fx('photo-1200x800.jpg'), fx('notes.txt'));
	await compress(page);
	const art = await downloadCombined(page);
	expect(art.name).toBe('archive.zip');
	const entries = unzip(art.bytes);
	expect(Object.keys(entries).sort()).toEqual(['notes.txt', 'photo-1200x800.jpg']);
	expect(Buffer.from(entries['photo-1200x800.jpg']).equals(a), 'bytes intact').toBe(true);
	expect(Buffer.from(entries['notes.txt']).equals(b)).toBe(true);
	rec.record({
		id: 'Z-01',
		settings: { tab: 'zip', op: 'create', level: 6 },
		input: { name: 'photo + notes', bytes: a.length + b.length },
		output: { name: art.name, bytes: art.bytes.length },
		assets: { output: rec.saveAsset('Z-01', 'output', art.name, art.bytes) }
	});
});

test('Z-02: extract turns every archive entry into its own row', async ({ page, rec }) => {
	const meta = fxMeta<{ entries: string[]; sizes: Record<string, number> }>('bundle.zip');
	await gotoTab(page, 'zip');
	await setZipOp(page, 'Extract');
	await upload(page, fx('bundle.zip'));
	await compress(page);
	// 1 upload row + 3 extracted entry rows.
	await expect(rows(page)).toHaveCount(1 + meta.entries.length);
	await expect(rows(page).getByRole('button', { name: 'Download' })).toHaveCount(
		meta.entries.length
	);
	// Nested path flattened to its basename.
	await expect(page.getByText('nested.txt', { exact: true })).toBeVisible();
	rec.record({
		id: 'Z-02',
		settings: { tab: 'zip', op: 'extract' },
		input: { name: 'bundle.zip', bytes: readFileSync(fx('bundle.zip')).length },
		note: 'Entries become standalone rows; directory paths flatten to basenames.',
		metrics: { entries: meta.entries.length }
	});
});

test('Z-03: level Store produces a bigger archive than Max', async ({ page }) => {
	await gotoTab(page, 'zip');
	await upload(page, fx('notes.txt'), fx('bloated.svg'));

	await page.getByRole('button', { name: 'Store', exact: true }).click();
	await compress(page);
	const stored = await downloadCombined(page);

	await page.getByRole('button', { name: 'Max', exact: true }).click();
	await compress(page);
	const maxed = await downloadCombined(page);

	expect(stored.bytes.length, 'store ≥ max for compressible text').toBeGreaterThan(
		maxed.bytes.length
	);
});

test('Z-04: switching op clears the parked files (incompatible inputs)', async ({ page }) => {
	await gotoTab(page, 'zip');
	await upload(page, fx('notes.txt'));
	await expect(rows(page)).toHaveCount(1);
	await setZipOp(page, 'Extract');
	await expect(rows(page)).toHaveCount(0);
});

test('Z-05: dropping a .zip anywhere routes to the zip tab', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await dropFiles(page, [{ path: fx('bundle.zip'), mimeType: 'application/zip' }]);
	await expect(page).toHaveURL(/\/zip-files$/);
	await expect(rows(page)).toHaveCount(1);
});

test('Z-06: zip-create accepts ANY file dropped on its dropzone', async ({ page }) => {
	await gotoTab(page, 'zip');
	// Create mode publishes accept="" — even an unroutable .txt must park here
	// instead of bouncing through the cross-family re-route.
	await page.getByRole('button', { name: 'Create', exact: true }).click();
	await dropOnZone(page, [{ path: fx('notes.txt'), mimeType: 'text/plain' }]);
	await expect(rows(page)).toHaveCount(1);
	await expect(page.getByTestId('error-banner')).toHaveCount(0);
});
