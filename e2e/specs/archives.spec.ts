/**
 * AR-01…10: the archive engine beyond plain ZIP — 7z/tar.gz/gz creation,
 * multi-format extraction (RAR/ISO/CAB/…, vendored fixtures), password flows
 * and archive→archive conversion. Everything runs the real 7z-wasm worker;
 * outputs are verified byte-for-byte in node via the same engine.
 */
import { readFileSync } from 'node:fs';
import { ARCHIVE_FIXTURES, expect, fx, fxArchive, fxMeta, test } from '../fixtures';
import {
	compress,
	downloadCombined,
	downloadRow,
	gotoPath,
	gotoTab,
	rowByName,
	rows,
	upload
} from '../helpers';
import { gunzipBuf, sevenZipEntries, unzip, zipEntryEncrypted } from '../verify';

type Page = import('@playwright/test').Page;

async function setOp(page: Page, op: 'Create' | 'Extract' | 'Convert') {
	const btn = page.getByRole('button', { name: op, exact: true });
	await btn.click();
	await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

async function setArchiveFormat(page: Page, label: string) {
	await page.getByRole('button', { name: label, exact: true }).click();
}

function passwordField(page: Page) {
	return page.locator('#archive-password');
}

test('AR-01: create 7Z bundles files, verified by the engine itself @smoke', async ({
	page,
	rec
}) => {
	const a = readFileSync(fx('photo-1200x800.jpg'));
	const b = readFileSync(fx('notes.txt'));
	await gotoTab(page, 'zip');
	// The settings card (format pills, password) renders once files are parked.
	await upload(page, fx('photo-1200x800.jpg'), fx('notes.txt'));
	await setArchiveFormat(page, '7Z');
	await compress(page);
	const art = await downloadCombined(page);
	expect(art.name).toBe('archive.7z');
	const entries = await sevenZipEntries(art.bytes, art.name);
	expect(Object.keys(entries).sort()).toEqual(['notes.txt', 'photo-1200x800.jpg']);
	expect(Buffer.from(entries['photo-1200x800.jpg']).equals(a), 'bytes intact').toBe(true);
	expect(Buffer.from(entries['notes.txt']).equals(b)).toBe(true);
	rec.record({
		id: 'AR-01',
		settings: { tab: 'zip', op: 'create', outputFormat: '7z' },
		input: { name: 'photo + notes', bytes: a.length + b.length },
		output: { name: art.name, bytes: art.bytes.length },
		assets: { output: rec.saveAsset('AR-01', 'output', art.name, art.bytes) }
	});
});

test('AR-02: create TAR.GZ (two-pass tar+gzip)', async ({ page }) => {
	const b = readFileSync(fx('notes.txt'));
	await gotoTab(page, 'zip');
	await upload(page, fx('notes.txt'), fx('bloated.svg'));
	await setArchiveFormat(page, 'TAR.GZ');
	await compress(page);
	const art = await downloadCombined(page);
	expect(art.name).toBe('archive.tar.gz');
	const tar = await gunzipBuf(art.bytes);
	const entries = await sevenZipEntries(tar, 'archive.tar');
	expect(Object.keys(entries).sort()).toEqual(['bloated.svg', 'notes.txt']);
	expect(Buffer.from(entries['notes.txt']).equals(b)).toBe(true);
});

test('AR-03: GZ compresses each file on its own (no bundle)', async ({ page }) => {
	const b = readFileSync(fx('notes.txt'));
	await gotoTab(page, 'zip');
	await upload(page, fx('notes.txt'), fx('bloated.svg'));
	await setArchiveFormat(page, 'GZ');
	await compress(page);
	// 2 uploads → 2 per-file outputs, no combined download.
	await expect(page.getByRole('button', { name: 'Download archive', exact: false })).toHaveCount(0);
	const art = await downloadRow(page, 'notes.txt.gz');
	expect(Buffer.from(await gunzipBuf(art.bytes)).equals(b), 'gunzip round-trip').toBe(true);
});

test('AR-04: extract RAR v5 @smoke', async ({ page, rec }) => {
	const meta = ARCHIVE_FIXTURES['sample-v5-multi.rar'];
	await gotoTab(page, 'zip');
	await setOp(page, 'Extract');
	await upload(page, fxArchive('sample-v5-multi.rar'));
	await compress(page, { timeout: 120_000 });
	// 1 upload row + one row per entry.
	await expect(rows(page)).toHaveCount(1 + meta.entries.length);
	for (const entry of meta.entries) {
		await expect(rowByName(page, entry)).toBeVisible();
	}
	rec.record({
		id: 'AR-04',
		settings: { tab: 'zip', op: 'extract' },
		input: {
			name: 'sample-v5-multi.rar',
			bytes: readFileSync(fxArchive('sample-v5-multi.rar')).length
		},
		metrics: { entries: meta.entries.length },
		note: 'RAR decompression via the unRAR-derived decoder in 7z-wasm.'
	});
});

// The long tail rides one table — every format the extract op advertises.
// (cab's 0-byte "empty" member is dropped by design, same as fflate always did.)
for (const fixture of [
	'sample-v4.rar',
	'sample-v5.rar',
	'sample.cab',
	'sample.lzh',
	'sample.arj',
	'sample.iso',
	'sample.txt.Z',
	'sample.rpm'
] as const) {
	test(`AR-05 extracts ${fixture}`, async ({ page }) => {
		const meta = ARCHIVE_FIXTURES[fixture];
		const expected = meta.entries.filter((e) => e !== 'empty');
		await gotoTab(page, 'zip');
		await setOp(page, 'Extract');
		await upload(page, fxArchive(fixture));
		await compress(page, { timeout: 120_000 });
		for (const entry of expected) {
			await expect(rowByName(page, entry).first()).toBeVisible();
		}
		if (meta.sample) {
			const art = await downloadRow(page, meta.sample.entry);
			expect(art.bytes.toString('utf8')).toBe(meta.sample.text);
		}
	});
}

// Generated chained fixtures: deb → data.tar → payload; tar.gz → tar → files.
test('AR-06: deb and tar.gz chain-unwrap to the real files', async ({ page }) => {
	await gotoTab(page, 'zip');
	await setOp(page, 'Extract');
	await upload(page, fx('sample.deb'));
	await compress(page, { timeout: 120_000 });
	await expect(rowByName(page, 'hello.txt')).toBeVisible();

	await gotoTab(page, 'zip');
	await setOp(page, 'Extract');
	await upload(page, fx('bundle.tar.gz'));
	await compress(page, { timeout: 120_000 });
	for (const entry of fxMeta<{ entries: string[] }>('bundle.tar.gz').entries) {
		await expect(rowByName(page, entry).first()).toBeVisible();
	}
});

// Symlink-bearing tarballs are the real-world norm (node/python dists, deb
// data.tars). 7zz recreates the links as MEMFS symlinks; the app must skip
// them with a visible note — and still extract every regular file.
test('AR-06b: tar.gz with symlinks skips the links, keeps the files', async ({ page }) => {
	const meta = fxMeta<{ files: string[]; links: number }>('links.tar.gz');
	await gotoTab(page, 'zip');
	await setOp(page, 'Extract');
	await upload(page, fx('links.tar.gz'));
	await compress(page, { timeout: 120_000 });
	// 1 upload row + one row per REGULAR file — links must not produce rows.
	await expect(rows(page)).toHaveCount(1 + meta.files.length);
	for (const entry of meta.files) {
		await expect(rowByName(page, entry).first()).toBeVisible();
	}
	await expect(page.getByText(`${meta.links} symbolic links skipped`)).toBeVisible();
});

test('AR-07: password-protected 7Z — friendly error, then success', async ({ page }) => {
	await gotoTab(page, 'zip');
	await setOp(page, 'Extract');
	await upload(page, fx('bundle-hidden.7z'));
	// No password → a clear, non-technical explanation.
	await compress(page, { expectError: true, timeout: 120_000 });
	await expect(page.getByTestId('error-banner')).toContainText(/password/i);

	// Right password → full extraction.
	await passwordField(page).fill('TEST');
	await compress(page, { timeout: 120_000 });
	for (const entry of fxMeta<{ entries: string[] }>('bundle-hidden.7z').entries) {
		await expect(rowByName(page, entry).first()).toBeVisible();
	}
});

test('AR-08: wrong password on an encrypted RAR reads as a password problem', async ({ page }) => {
	await gotoTab(page, 'zip');
	await setOp(page, 'Extract');
	await upload(page, fxArchive('sample-locked-v5.rar'));
	await passwordField(page).fill('definitely-wrong');
	await compress(page, { expectError: true, timeout: 120_000 });
	await expect(page.getByTestId('error-banner')).toContainText(/wrong password/i);
});

test('AR-09: create an AES-256 zip that fflate cannot read but the password opens', async ({
	page
}) => {
	const b = readFileSync(fx('notes.txt'));
	await gotoTab(page, 'zip');
	await upload(page, fx('notes.txt'));
	// ZIP is the default output; a password flips the create onto the 7zz path.
	await passwordField(page).fill('TEST');
	await compress(page, { timeout: 120_000 });
	const art = await downloadCombined(page);
	expect(zipEntryEncrypted(art.bytes), 'encryption flag set').toBe(true);
	await expect(sevenZipEntries(art.bytes, art.name)).rejects.toThrow();
	const entries = await sevenZipEntries(art.bytes, art.name, 'TEST');
	expect(Buffer.from(entries['notes.txt']).equals(b)).toBe(true);
});

test('AR-10: convert RAR → ZIP repacks the same content @smoke', async ({ page, rec }) => {
	const meta = ARCHIVE_FIXTURES['sample-v5.rar'];
	await gotoTab(page, 'zip');
	await setOp(page, 'Convert');
	await upload(page, fxArchive('sample-v5.rar'));
	await setArchiveFormat(page, 'ZIP');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page, 'sample-v5.zip');
	const entries = unzip(art.bytes);
	expect(
		Object.keys(entries)
			.map((p) => p.split('/').pop())
			.sort()
	).toEqual([...meta.entries].sort());
	rec.record({
		id: 'AR-10',
		settings: { tab: 'zip', op: 'convert', outputFormat: 'zip' },
		input: { name: 'sample-v5.rar', bytes: readFileSync(fxArchive('sample-v5.rar')).length },
		output: { name: art.name, bytes: art.bytes.length },
		note: 'RAR reading is fine — writing RAR is impossible (proprietary); ZIP is the interoperable exit.'
	});
});

test('AR-11: /rar-to-zip landing presets the Convert op and converts @smoke', async ({ page }) => {
	await gotoPath(page, '/rar-to-zip');
	await expect(page).toHaveTitle(/RAR to ZIP Converter/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Convert RAR to ZIP.');
	await expect(page.getByRole('button', { name: 'Convert', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await upload(page, fxArchive('sample-v5.rar'));
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page, 'sample-v5.zip');
	expect(Object.keys(unzip(art.bytes)).length).toBeGreaterThan(0);
});

// The remaining archive landings — preset op (+ format pill, checked after an
// upload renders the settings card). The engines themselves are covered above.
// Convert pages accept archives only, so each row uploads a matching sample.
for (const { path, op, h1, pill, file } of [
	{
		path: '/7z-to-zip',
		op: 'Convert',
		h1: 'Convert 7Z to ZIP.',
		pill: 'ZIP',
		file: fx('bundle.7z')
	},
	{
		path: '/zip-to-7z',
		op: 'Convert',
		h1: 'Convert ZIP to 7Z.',
		pill: '7Z',
		file: fx('bundle.zip')
	},
	{
		path: '/tar-gz-to-zip',
		op: 'Convert',
		h1: 'Convert TAR.GZ to ZIP.',
		pill: 'ZIP',
		file: fx('bundle.tar.gz')
	},
	{
		path: '/iso-to-zip',
		op: 'Convert',
		h1: 'Convert ISO to ZIP.',
		pill: 'ZIP',
		file: fxArchive('sample.iso')
	},
	{
		path: '/zip-to-tar-gz',
		op: 'Convert',
		h1: 'Convert ZIP to TAR.GZ.',
		pill: 'TAR.GZ',
		file: fx('bundle.zip')
	},
	{
		path: '/create-7z',
		op: 'Create',
		h1: 'Create 7Z archives.',
		pill: '7Z',
		file: fx('notes.txt')
	},
	{
		path: '/create-tar',
		op: 'Create',
		h1: 'Create TAR archives.',
		pill: 'TAR',
		file: fx('notes.txt')
	},
	{
		path: '/create-tar-gz',
		op: 'Create',
		h1: 'Create TAR.GZ tarballs.',
		pill: 'TAR.GZ',
		file: fx('notes.txt')
	},
	{
		path: '/create-tar-bz2',
		op: 'Create',
		h1: 'Create TAR.BZ2 tarballs.',
		pill: 'TAR.BZ2',
		file: fx('notes.txt')
	},
	{
		path: '/create-tar-xz',
		op: 'Create',
		h1: 'Create TAR.XZ tarballs.',
		pill: 'TAR.XZ',
		file: fx('notes.txt')
	},
	{ path: '/gzip-files', op: 'Create', h1: 'Gzip files.', pill: 'GZ', file: fx('notes.txt') },
	{ path: '/bzip2-files', op: 'Create', h1: 'Bzip2 files.', pill: 'BZ2', file: fx('notes.txt') },
	{ path: '/xz-files', op: 'Create', h1: 'XZ-compress files.', pill: 'XZ', file: fx('notes.txt') }
] as const) {
	test(`AR-12 landing ${path} presets ${op}/${pill}`, async ({ page }) => {
		await gotoPath(page, path);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
		await expect(page.getByRole('button', { name: op, exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		// The format pills live in the settings card, which needs parked files.
		await upload(page, file);
		await expect(page.getByRole('button', { name: pill, exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
	});
}

// Extract landings preset only the op — one representative flow (rar) plus
// preset asserts for the rest keep this cheap.
test('AR-13: /extract-rar landing extracts a RAR end-to-end @smoke', async ({ page }) => {
	await gotoPath(page, '/extract-rar');
	await expect(page).toHaveTitle(/Extract RAR/);
	await expect(page.getByRole('button', { name: 'Extract', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await upload(page, fxArchive('sample-v5.rar'));
	await compress(page, { timeout: 120_000 });
	for (const entry of ARCHIVE_FIXTURES['sample-v5.rar'].entries) {
		await expect(rowByName(page, entry).first()).toBeVisible();
	}
});

for (const { path, h1 } of [
	{ path: '/extract-7z', h1: 'Extract 7Z archives.' },
	{ path: '/extract-tar-gz', h1: 'Extract TAR.GZ tarballs.' },
	{ path: '/extract-gz', h1: 'Extract GZ files.' },
	{ path: '/extract-z', h1: 'Extract .Z files.' },
	{ path: '/extract-iso', h1: 'Extract ISO images.' },
	{ path: '/extract-cab', h1: 'Extract CAB archives.' },
	{ path: '/extract-deb', h1: 'Extract DEB packages.' },
	{ path: '/extract-rpm', h1: 'Extract RPM packages.' },
	{ path: '/extract-cpio', h1: 'Extract cpio archives.' },
	{ path: '/extract-lha', h1: 'Extract LHA/LZH archives.' },
	{ path: '/extract-arj', h1: 'Extract ARJ archives.' }
] as const) {
	test(`AR-14 landing ${path} presets Extract`, async ({ page }) => {
		await gotoPath(page, path);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
		await expect(page.getByRole('button', { name: 'Extract', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
	});
}
