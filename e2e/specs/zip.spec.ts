/**
 * Z-01…05: the ZIP tab — create (combined archive, level knob), extract
 * (entries as standalone rows, basename flattening), drop-routing.
 */
import { readFileSync } from 'node:fs';
import { expect, fx, fxMeta, test } from '../fixtures';
import {
	compress,
	downloadCombined,
	downloadRow,
	dropFiles,
	dropOnZone,
	gotoTab,
	rowByName,
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

test('Z-07: extract keeps real dotfiles and 0-byte entries, drops macOS noise', async ({
	page
}) => {
	const meta = fxMeta<{ rows: string[] }>('bundle-dotfiles.zip');
	await gotoTab(page, 'zip');
	await setZipOp(page, 'Extract');
	await upload(page, fx('bundle-dotfiles.zip'));
	await compress(page);
	// 1 upload row + .env, .htaccess, empty.txt, index.html — never the
	// __MACOSX/AppleDouble/.DS_Store sidecars.
	await expect(rows(page)).toHaveCount(1 + meta.rows.length);
	for (const entry of meta.rows) {
		await expect(rowByName(page, entry).first()).toBeVisible();
	}
	await expect(page.getByText('.DS_Store')).toHaveCount(0);
	// The 0-byte placeholder downloads as an honest empty file.
	const art = await downloadRow(page, 'empty.txt');
	expect(art.bytes.length).toBe(0);
});

test('Z-08: ZipCrypto stored zip — password error, then real plaintext, never ciphertext', async ({
	page
}) => {
	const meta = fxMeta<{ password: string; text: string }>('bundle-zipcrypto.zip');
	await gotoTab(page, 'zip');
	await setZipOp(page, 'Extract');
	await upload(page, fx('bundle-zipcrypto.zip'));
	// No password: fflate would silently return key-header+XOR ciphertext —
	// the run must route to the worker and say so instead.
	await compress(page, { expectError: true, timeout: 120_000 });
	await expect(page.getByTestId('error-banner')).toContainText(/password/i);

	await page.locator('#archive-password').fill(meta.password);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page, 'secret.txt');
	expect(art.bytes.toString('utf8'), 'decrypted plaintext, not ciphertext').toBe(meta.text);
});

test('Z-09: legacy cp437 name decodes to its real characters', async ({ page }) => {
	const meta = fxMeta<{ displayName: string; text: string }>('bundle-cp437.zip');
	await gotoTab(page, 'zip');
	await setZipOp(page, 'Extract');
	await upload(page, fx('bundle-cp437.zip'));
	await compress(page);
	// 'Résumé.pdf', not 'Rsum.pdf' with invisible C1 controls.
	await expect(rowByName(page, meta.displayName)).toBeVisible();
	const art = await downloadRow(page, meta.displayName);
	expect(art.name).toBe(meta.displayName);
	expect(art.bytes.toString('utf8')).toBe(meta.text);
});

test('Z-10: locked legacy cp437 zip — the WORKER path repairs the mangled name', async ({
	page
}) => {
	// Z-09 covers the fflate fast path; a password forces 7zz, whose C-locale
	// build garbles unflagged cp437 names irrecoverably before they reach the
	// filesystem — the app must re-label from the zip's own central directory.
	const meta = fxMeta<{ displayName: string; password: string; text: string }>(
		'bundle-cp437-locked.zip'
	);
	await gotoTab(page, 'zip');
	await setZipOp(page, 'Extract');
	await upload(page, fx('bundle-cp437-locked.zip'));
	await compress(page, { expectError: true, timeout: 120_000 });
	await expect(page.getByTestId('error-banner')).toContainText(/password/i);

	await page.locator('#archive-password').fill(meta.password);
	await compress(page, { timeout: 120_000 });
	await expect(rowByName(page, meta.displayName)).toBeVisible();
	const art = await downloadRow(page, meta.displayName);
	expect(art.name).toBe(meta.displayName);
	expect(art.bytes.toString('utf8')).toBe(meta.text);
});

test('Z-11: AES zip with a UTF-8 name survives the worker path intact', async ({ page }) => {
	// Modern archivers flag names UTF-8 — the engine passes those through
	// unmangled even in its C-locale build; this pins that down.
	const meta = fxMeta<{ entries: string[]; password: string; text: string }>('bundle-utf8-aes.zip');
	await gotoTab(page, 'zip');
	await setZipOp(page, 'Extract');
	await upload(page, fx('bundle-utf8-aes.zip'));
	await page.locator('#archive-password').fill(meta.password);
	await compress(page, { timeout: 120_000 });
	await expect(rowByName(page, meta.entries[0])).toBeVisible();
	const art = await downloadRow(page, meta.entries[0]);
	expect(art.name).toBe(meta.entries[0]);
	expect(art.bytes.toString('utf8')).toBe(meta.text);
});

test('Z-12: mixed-encryption zip still reads as a password problem, honestly all-or-nothing', async ({
	page
}) => {
	// 3 locked entries fail FIRST, then 70 plain per-entry lines scroll past —
	// the password signal must survive the output ring (latched, not evicted)
	// instead of degrading to a generic 'Archive operation failed'; and the
	// discarded good entries must be owned up to, not silently swallowed.
	await gotoTab(page, 'zip');
	await setZipOp(page, 'Extract');
	await upload(page, fx('bundle-mixed-enc.zip'));
	await compress(page, { expectError: true, timeout: 120_000 });
	const banner = page.getByTestId('error-banner');
	await expect(banner).toContainText(/password/i);
	await expect(banner).toContainText(/did extract.*nothing was kept/i);
});
