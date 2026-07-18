/**
 * PT-01…26: pdf-lib tools — merge (order via page-size fingerprint), reorder,
 * page keep/remove grammar, toImages (ZIP vs single), fromImages (dims,
 * white-flattened alpha), AVIF acceptance, unlock/protect round-trip (qpdf,
 * AES-256, NFC/NFD password normalization), per-op engine warm-up gating
 * (gs vs qpdf).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { degrees, PDFDocument } from 'pdf-lib';
import { expect, fx, fxMeta, realFile, test } from '../fixtures';
import {
	compress,
	downloadCombined,
	downloadRow,
	gotoPath,
	gotoTab,
	rasterizePdfInPage,
	setDpi,
	setPageMode,
	setPageRange,
	setPdfImageFormat,
	setPdfOp,
	toggle,
	upload
} from '../helpers';
import {
	decodeRaw,
	imageMeta,
	pdfEncryptionMeta,
	pdfInfo,
	pdfIsEncrypted,
	pdfRotations,
	pdfTextContent,
	pixelAt,
	qpdfEncrypt,
	unzip
} from '../verify';

test.describe.configure({ timeout: 180_000 });

const MERGE_FILES = [fx('merge-a.pdf'), fx('merge-b.pdf'), fx('merge-c.pdf')];
// merge-a: 2 × 595pt, merge-b: 1 × 612pt, merge-c: 2 × 500pt
const ORDER_ABC = [595, 595, 612, 500, 500];

test('PT-01: merge a+b+c keeps upload order @smoke', async ({ page, rec }) => {
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Merge');
	await upload(page, ...MERGE_FILES);
	await compress(page);
	const art = await downloadCombined(page);
	expect(art.name).toBe('merged.pdf');
	const info = await pdfInfo(art.bytes);
	expect(info.pageCount).toBe(5);
	expect(
		info.pageSizes.map((s) => s.w),
		'page-size fingerprint proves order'
	).toEqual(ORDER_ABC);
	rec.record({
		id: 'PT-01',
		settings: { tab: 'pdf', op: 'merge' },
		input: {
			name: 'merge-a+b+c',
			bytes: MERGE_FILES.reduce((s, f) => s + readFileSync(f).length, 0)
		},
		output: { name: art.name, bytes: art.bytes.length, pages: info.pageCount },
		assets: { output: rec.saveAsset('PT-01', 'output', art.name, art.bytes) }
	});
});

test('PT-02: reorder arrows change the merge order', async ({ page, rec }) => {
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Merge');
	await upload(page, ...MERGE_FILES);
	await page.getByLabel('Move merge-c.pdf up').click();
	await page.getByLabel('Move merge-c.pdf up').click(); // c → front: [c, a, b]
	await compress(page);
	const art = await downloadCombined(page);
	const info = await pdfInfo(art.bytes);
	expect(info.pageSizes.map((s) => s.w)).toEqual([500, 500, 595, 595, 612]);
	rec.record({
		id: 'PT-02',
		settings: { tab: 'pdf', op: 'merge', reorder: 'c,a,b' },
		input: { name: 'merge-a+b+c', bytes: 0 },
		output: { name: art.name, bytes: art.bytes.length, pages: info.pageCount },
		assets: { output: rec.saveAsset('PT-02', 'output', art.name, art.bytes) }
	});
});

test('PT-03: merge + compress-after-merging shrinks the merged output', async ({ page, rec }) => {
	// Baseline merge without compression:
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Merge');
	await upload(page, ...MERGE_FILES);
	await compress(page);
	const plain = await downloadCombined(page);

	await page.reload();
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Merge');
	await upload(page, ...MERGE_FILES);
	await toggle(page, 'Compress after merging', true);
	await compress(page, { timeout: 150_000 });
	const compressed = await downloadCombined(page);
	const info = await pdfInfo(compressed.bytes);
	expect(info.pageCount).toBe(5);
	// pdf-lib's save() is not byte-deterministic across runs (/ID, dates), so
	// the two merges may differ by a few bytes — the guard compares against its
	// OWN input; allow that jitter here.
	expect(compressed.bytes.length, 'gs pass after merge must not inflate').toBeLessThanOrEqual(
		plain.bytes.length + 32
	);
	rec.record({
		id: 'PT-03',
		settings: { tab: 'pdf', op: 'merge', mergeCompress: true, level: 'medium' },
		input: { name: 'merged.pdf (plain)', bytes: plain.bytes.length },
		output: { name: compressed.name, bytes: compressed.bytes.length, pages: info.pageCount },
		assets: { output: rec.saveAsset('PT-03', 'output', compressed.name, compressed.bytes) }
	});
});

test('PT-04: merge with a single file keeps the CTA disabled', async ({ page }) => {
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Merge');
	await upload(page, fx('merge-a.pdf'));
	await expect(page.getByTestId('compress-cta')).toBeDisabled();
	await upload(page, fx('merge-b.pdf'));
	await expect(page.getByTestId('compress-cta')).toBeEnabled();
});

test('PT-05: pages keep 1-3,7,12- extracts the right pages @smoke', async ({ page, rec }) => {
	const widths = fxMeta<{ widths: number[] }>('pages-12.pdf').widths;
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Pages');
	await upload(page, fx('pages-12.pdf'));
	await setPageRange(page, '1-3,7,12-');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('pages-12-pages.pdf');
	const info = await pdfInfo(art.bytes);
	// widths[i] = 401+i identifies page i+1.
	expect(info.pageSizes.map((s) => s.w)).toEqual([
		widths[0],
		widths[1],
		widths[2],
		widths[6],
		widths[11]
	]);
	rec.record({
		id: 'PT-05',
		settings: { tab: 'pdf', op: 'pages', pageMode: 'keep', range: '1-3,7,12-' },
		input: { name: 'pages-12.pdf', bytes: readFileSync(fx('pages-12.pdf')).length, pages: 12 },
		output: { name: art.name, bytes: art.bytes.length, pages: info.pageCount },
		assets: { output: rec.saveAsset('PT-05', 'output', art.name, art.bytes) }
	});
});

test('PT-06: pages remove 2-11 leaves first and last', async ({ page, rec }) => {
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Pages');
	await upload(page, fx('pages-12.pdf'));
	await setPageMode(page, 'remove');
	await setPageRange(page, '2-11');
	await compress(page);
	const art = await downloadRow(page);
	const info = await pdfInfo(art.bytes);
	expect(info.pageSizes.map((s) => s.w)).toEqual([401, 412]);
	rec.record({
		id: 'PT-06',
		settings: { tab: 'pdf', op: 'pages', pageMode: 'remove', range: '2-11' },
		input: { name: 'pages-12.pdf', bytes: readFileSync(fx('pages-12.pdf')).length, pages: 12 },
		output: { name: art.name, bytes: art.bytes.length, pages: info.pageCount },
		assets: { output: rec.saveAsset('PT-06', 'output', art.name, art.bytes) }
	});
});

test('PT-07: an invalid page range disables the CTA until corrected', async ({ page }) => {
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Pages');
	await upload(page, fx('pages-12.pdf'));
	await setPageRange(page, 'abc');
	await expect(page.getByTestId('compress-cta')).toBeDisabled();
	await setPageRange(page, '2-4');
	await expect(page.getByTestId('compress-cta')).toBeEnabled();
});

test('PT-08: toImages on a 3-page pdf downloads a ZIP of JPEGs @smoke', async ({ page, rec }) => {
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'To images');
	await upload(page, fx('text-3pages.pdf'));
	await setDpi(page, 150);
	const run = await compress(page);
	expect(run.warnings, 'A4 at 150 DPI must not hit the render clamp').toEqual([]);
	const art = await downloadRow(page);
	expect(art.name).toBe('text-3pages-images.zip');
	const entries = unzip(art.bytes);
	const names = Object.keys(entries).sort();
	expect(names).toEqual(['text-3pages-p01.jpg', 'text-3pages-p02.jpg', 'text-3pages-p03.jpg']);
	for (const name of names) {
		const m = await imageMeta(Buffer.from(entries[name]));
		expect(m.format).toBe('jpeg');
		// A4 595.28×841.89 pt at 150/72 scale ≈ 1240×1754 (±2 for ceil).
		expect(Math.abs(m.width - 1240), `${name} width`).toBeLessThanOrEqual(2);
		expect(Math.abs(m.height - 1754), `${name} height`).toBeLessThanOrEqual(2);
	}
	rec.record({
		id: 'PT-08',
		settings: { tab: 'pdf', op: 'toImages', format: 'jpg', dpi: 150 },
		input: { name: 'text-3pages.pdf', bytes: readFileSync(fx('text-3pages.pdf')).length, pages: 3 },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { zipEntries: names.length },
		assets: {
			output: rec.saveAsset('PT-08', 'output', art.name, art.bytes),
			visual: rec.saveAsset('PT-08', 'visual', 'page1.jpg', Buffer.from(entries[names[0]]))
		}
	});
});

test('PT-09: toImages on a single-page pdf downloads the image directly', async ({ page, rec }) => {
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'To images');
	await upload(page, fx('merge-b.pdf'));
	await setPdfImageFormat(page, 'png');
	await setDpi(page, 72);
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('merge-b.png');
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('png');
	expect([m.width, m.height]).toEqual([612, 792]);
	rec.record({
		id: 'PT-09',
		settings: { tab: 'pdf', op: 'toImages', format: 'png', dpi: 72 },
		input: { name: 'merge-b.pdf', bytes: readFileSync(fx('merge-b.pdf')).length, pages: 1 },
		output: { name: art.name, bytes: art.bytes.length, width: m.width, height: m.height },
		assets: { output: rec.saveAsset('PT-09', 'output', art.name, art.bytes) }
	});
});

test('PT-11: fromImages — page per image, px=pt, alpha flattens white @smoke', async ({
	page,
	rec
}) => {
	const alphaMeta = fxMeta<{ transparentPoints: [number, number][] }>('graphic-alpha.png');
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'From images');
	await upload(page, fx('photo-1200x800.jpg'), fx('graphic-alpha.png'), fx('photo-1000x700.webp'));
	await compress(page);
	const art = await downloadCombined(page);
	expect(art.name).toBe('images.pdf');
	const info = await pdfInfo(art.bytes);
	expect(info.pageCount).toBe(3);
	expect(info.pageSizes, 'page size = image pixel size').toEqual([
		{ w: 1200, h: 800 },
		{ w: 800, h: 600 },
		{ w: 1000, h: 700 }
	]);

	const pagePng = await rasterizePdfInPage(page, art.bytes, 2);
	if (pagePng) {
		const raw = await decodeRaw(pagePng);
		const scale = raw.width / 800; // renderPage maxWidth 1600 → 2× here
		for (const [x, y] of alphaMeta.transparentPoints) {
			const [r, g, b] = pixelAt(raw, Math.round(x * scale), Math.round(y * scale));
			expect(r, `page bg at ${x},${y} white`).toBeGreaterThanOrEqual(245);
			expect(g).toBeGreaterThanOrEqual(245);
			expect(b).toBeGreaterThanOrEqual(245);
		}
	}
	rec.record({
		id: 'PT-11',
		settings: { tab: 'pdf', op: 'fromImages', quality: 85 },
		input: { name: 'jpg+alpha-png+webp', bytes: 0 },
		output: { name: art.name, bytes: art.bytes.length, pages: info.pageCount },
		assets: {
			output: rec.saveAsset('PT-11', 'output', art.name, art.bytes),
			...(pagePng ? { visual: rec.saveAsset('PT-11', 'visual', 'page2.png', pagePng) } : {})
		}
	});
});

test('PT-12: fromImages reorder flips the page order', async ({ page, rec }) => {
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'From images');
	await upload(page, fx('photo-1200x800.jpg'), fx('graphic-alpha.png'));
	await page.getByLabel('Move graphic-alpha.png up').click();
	await compress(page);
	const art = await downloadCombined(page);
	const info = await pdfInfo(art.bytes);
	expect(info.pageSizes.map((s) => s.w)).toEqual([800, 1200]);
	rec.record({
		id: 'PT-12',
		settings: { tab: 'pdf', op: 'fromImages', reorder: true },
		input: { name: 'jpg+alpha-png', bytes: 0 },
		output: { name: art.name, bytes: art.bytes.length, pages: info.pageCount },
		assets: { output: rec.saveAsset('PT-12', 'output', art.name, art.bytes) }
	});
});

test('PT-13: fromImages accepts AVIF input', async ({ page, rec }) => {
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'From images');
	await upload(page, fx('photo-800x600.avif'), fx('photo-1200x800.jpg'));
	await compress(page);
	const art = await downloadCombined(page);
	const info = await pdfInfo(art.bytes);
	expect(info.pageCount).toBe(2);
	expect(
		info.pageSizes.map((s) => s.w),
		'avif page first'
	).toEqual([800, 1200]);
	rec.record({
		id: 'PT-13',
		settings: { tab: 'pdf', op: 'fromImages', avifInput: true },
		input: { name: 'avif+jpg', bytes: 0 },
		output: { name: art.name, bytes: art.bytes.length, pages: info.pageCount },
		assets: { output: rec.saveAsset('PT-13', 'output', art.name, art.bytes) }
	});
});

test('PT-14: protect → unlock round-trip (AES-256 R6, in-app fixture)', async ({
	page,
	rec
}, testInfo) => {
	const input = readFileSync(fx('text-3pages.pdf'));
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Protect');
	await upload(page, fx('text-3pages.pdf'));
	await page.locator('#pdf-password').fill('correct horse battery');
	await compress(page, { timeout: 120_000 });
	const locked = await downloadRow(page);
	expect(locked.name).toBe('text-3pages-protected.pdf');
	expect(await pdfIsEncrypted(locked.bytes), 'output must be encrypted').toBe(true);
	expect(pdfEncryptionMeta(locked.bytes).aesv3, 'AES-256 / R6 encryption dict').toBe(true);

	// Round-trip: the protected artifact goes back in through Unlock.
	const lockedPath = testInfo.outputPath('protected.pdf');
	writeFileSync(lockedPath, locked.bytes);
	await page.reload();
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Unlock');
	await upload(page, lockedPath);
	await page.locator('#pdf-password').fill('correct horse battery');
	await compress(page, { timeout: 120_000 });
	const unlocked = await downloadRow(page);
	expect(unlocked.name).toBe('protected-unlocked.pdf');
	expect(await pdfIsEncrypted(unlocked.bytes), 'password removed').toBe(false);
	expect((await pdfInfo(unlocked.bytes)).pageCount).toBe(3);
	rec.record({
		id: 'PT-14',
		settings: { tab: 'pdf', op: 'protect→unlock', encryption: 'AES-256 (R6 — qpdf)' },
		input: { name: 'text-3pages.pdf', bytes: input.length, pages: 3 },
		output: { name: unlocked.name, bytes: unlocked.bytes.length, pages: 3 },
		note: 'In-app round-trip — no encrypted fixture needed. qpdf writes AES-256/R6 structurally; page content is never re-encoded.',
		assets: {
			original: rec.saveAsset('PT-14', 'original', locked.name, locked.bytes),
			output: rec.saveAsset('PT-14', 'output', unlocked.name, unlocked.bytes)
		}
	});
});

test('PT-15: unlock with the WRONG password fails with a password message', async ({
	page
}, testInfo) => {
	// Build a protected file first (same in-app path as PT-14).
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Protect');
	await upload(page, fx('text-3pages.pdf'));
	await page.locator('#pdf-password').fill('right-password');
	await compress(page, { timeout: 120_000 });
	const locked = await downloadRow(page);
	const lockedPath = testInfo.outputPath('protected-wrongpw.pdf');
	writeFileSync(lockedPath, locked.bytes);

	await page.reload();
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Unlock');
	await upload(page, lockedPath);
	await page.locator('#pdf-password').fill('wrong-password');
	const run = await compress(page, { expectError: true, timeout: 120_000 });
	expect(run.error).toMatch(/password/i);
	await expect(page.getByTestId('compress-cta'), 'CTA recovers').toBeEnabled();
});

test('PT-25: non-ASCII password round-trips, protect warns about Preview', async ({
	page
}, testInfo) => {
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Protect');
	await upload(page, fx('text-3pages.pdf'));

	// The interop hint: privacy copy for ASCII, Preview warning once č/š/ž land.
	const hint = page.getByText(/never leaves your device/);
	await page.locator('#pdf-password').fill('plain ascii');
	await expect(hint).toBeVisible();
	await page.locator('#pdf-password').fill('ččč'.normalize('NFC'));
	await expect(page.getByText(/won't open in Apple Preview/)).toBeVisible();
	await expect(hint).not.toBeVisible();

	await compress(page, { timeout: 120_000 });
	const locked = await downloadRow(page);
	expect(pdfEncryptionMeta(locked.bytes).aesv3, 'AES-256 / R6').toBe(true);

	const lockedPath = testInfo.outputPath('protected-nfc.pdf');
	writeFileSync(lockedPath, locked.bytes);
	await page.reload();
	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Unlock');
	await upload(page, lockedPath);
	await page.locator('#pdf-password').fill('ččč'.normalize('NFC'));
	await compress(page, { timeout: 120_000 });
	const unlocked = await downloadRow(page);
	expect(await pdfIsEncrypted(unlocked.bytes), 'password removed').toBe(false);
	expect((await pdfInfo(unlocked.bytes)).pageCount).toBe(3);
});

test('PT-26: unlock retries NFD bytes — Apple-encrypted non-ASCII passwords open', async ({
	page
}, testInfo) => {
	// Apple's PDF stack hashes the NFD form of the typed password (probed
	// 2026-07-18 against PDFKit — see qpdf-args.ts). Fabricate such a file with
	// exact NFD bytes, then unlock it by typing the NFC form every keyboard
	// produces: only the worker's candidate retry can make this pass.
	const locked = await qpdfEncrypt(readFileSync(fx('text-3pages.pdf')), 'ččč'.normalize('NFD'));
	const lockedPath = testInfo.outputPath('protected-nfd.pdf');
	writeFileSync(lockedPath, locked);

	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Unlock');
	await upload(page, lockedPath);
	await page.locator('#pdf-password').fill('ččč'.normalize('NFC'));
	await compress(page, { timeout: 120_000 });
	const unlocked = await downloadRow(page);
	expect(await pdfIsEncrypted(unlocked.bytes), 'password removed').toBe(false);
	expect((await pdfInfo(unlocked.bytes)).pageCount).toBe(3);
});

test('PT-17: unlock a REAL protected pdf with its password', async ({ page, rec }) => {
	// Real-world R3 file. Probed 2026-07-11: it carries OWNER-ONLY protection
	// (empty user password) — it opens freely, but the encryption dict is real
	// and Unlock must strip it. Password '123' is a throwaway and deliberately
	// public — Nik's call. (Deliberately does NOT match encrypted/user-locked
	// fixtures — those may use a different password.)
	const real = realFile(/protected\S*\.pdf$/i);
	test.skip(!real, 'drop a *-protected.pdf into tests/fixtures/real/ to enable');
	const input = readFileSync(real!);
	const source = await PDFDocument.load(new Uint8Array(input), { ignoreEncryption: true });

	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Unlock');
	await upload(page, real!);
	await page.locator('#pdf-password').fill('123');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(await pdfIsEncrypted(art.bytes), 'password removed').toBe(false);
	expect((await pdfInfo(art.bytes)).pageCount, 'all pages survive').toBe(source.getPageCount());
	rec.record({
		id: 'PT-17',
		settings: { tab: 'pdf', op: 'unlock', realWorld: true },
		input: { name: basename(real!), bytes: input.length, pages: source.getPageCount() },
		output: { name: art.name, bytes: art.bytes.length },
		assets: { output: rec.saveAsset('PT-17', 'output', art.name, art.bytes) }
	});
});

test('PT-16: /unlock-pdf and /protect-pdf pages preset the op and gate the CTA', async ({
	page
}) => {
	const { gotoPath } = await import('../helpers');
	await gotoPath(page, '/unlock-pdf');
	await expect(page).toHaveTitle(/Unlock PDF/);
	await expect(page.getByText('Drop PDF files here')).toBeVisible();
	await upload(page, fx('text-3pages.pdf'));
	await expect(
		page.getByRole('button', { name: 'Unlock', exact: true }),
		'op preset from the landing page'
	).toHaveAttribute('aria-pressed', 'true');
	// Empty password blocks the action.
	await expect(page.getByTestId('compress-cta')).toBeDisabled();
	await page.locator('#pdf-password').fill('x');
	await expect(page.getByTestId('compress-cta')).toBeEnabled();

	await gotoPath(page, '/protect-pdf');
	await upload(page, fx('merge-a.pdf'));
	await expect(page.getByRole('button', { name: 'Protect', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('PT-18: file-drop warms the right engine per op @smoke', async ({ page }) => {
	// gs = the 15 MB engine, qpdf = the small crypto one. Dev serves /X.wasm;
	// preview hashes them as gs.<hash>.wasm but qpdf-<hash>.wasm (?url asset).
	const gsWasmRequests: string[] = [];
	const qpdfWasmRequests: string[] = [];
	page.on('request', (request) => {
		const path = new URL(request.url()).pathname;
		if (/\/gs([.-][\w-]+)?\.wasm$/.test(path)) gsWasmRequests.push(path);
		if (/\/qpdf([.-][\w-]+)?\.wasm$/.test(path)) qpdfWasmRequests.push(path);
	});

	// /merge-pdf presets op=merge (mergeCompress off): pdf-lib does the whole
	// job, so the drop must pull neither engine. The warm fetch starts
	// synchronously with the drop, so a short settle catches a regression.
	await gotoPath(page, '/merge-pdf');
	await upload(page, fx('merge-a.pdf'));
	await page.waitForTimeout(1000);
	expect(gsWasmRequests, 'merge drop must not warm gs').toEqual([]);
	expect(qpdfWasmRequests, 'merge drop must not warm qpdf').toEqual([]);

	// Switching to Compress and dropping again must start the gs warm fetch
	// during think time — and proves the matcher still matches the real URL.
	await setPdfOp(page, 'Compress');
	await upload(page, fx('merge-b.pdf'));
	await expect.poll(() => gsWasmRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);

	// Protect rides the qpdf worker — its drop warms qpdf, never more gs.
	// Settle first: the gs warm may issue a legitimate second fetch when
	// compileStreaming falls back to arrayBuffer; snapshot after it lands.
	await page.waitForTimeout(1000);
	const gsAfterCompress = gsWasmRequests.length;
	await setPdfOp(page, 'Protect');
	await upload(page, fx('merge-c.pdf'));
	await expect.poll(() => qpdfWasmRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);
	await page.waitForTimeout(500);
	expect(gsWasmRequests.length, 'protect drop must not warm gs again').toBe(gsAfterCompress);
});

test('PT-19: /rotate-pdf turns every page 90° clockwise', async ({ page }) => {
	await gotoPath(page, '/rotate-pdf');
	await expect(page).toHaveTitle(/Rotate PDF/);
	await expect(page.getByRole('button', { name: 'Rotate', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await upload(page, fx('text-3pages.pdf'));
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('text-3pages-rotated.pdf');
	expect(await pdfRotations(art.bytes)).toEqual([90, 90, 90]);
	expect((await pdfInfo(art.bytes)).pageCount).toBe(3);
});

test('PT-20: /watermark-pdf stamps custom text across every page', async ({ page }) => {
	await gotoPath(page, '/watermark-pdf');
	await expect(page).toHaveTitle(/Watermark PDF/);
	await upload(page, fx('text-3pages.pdf'));
	await page.locator('#watermark-text').fill('COMPRESSPRO');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('text-3pages-watermarked.pdf');
	expect((await pdfInfo(art.bytes)).pageCount).toBe(3);
	// The stamp is real page content — text extraction must see it on pages.
	const stamps = (await pdfTextContent(art.bytes)).match(/COMPRESSPRO/g) ?? [];
	expect(stamps.length).toBe(3);
});

test('PT-21: /pdf-page-numbers adds page/total footers', async ({ page }) => {
	await gotoPath(page, '/pdf-page-numbers');
	await upload(page, fx('text-3pages.pdf'));
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('text-3pages-numbered.pdf');
	const text = await pdfTextContent(art.bytes);
	expect(text).toMatch(/1\s*\/\s*3/);
	expect(text).toMatch(/3\s*\/\s*3/);
});

test('PT-22: /pdf-to-text extracts the digital text layer to .txt', async ({ page }) => {
	await gotoPath(page, '/pdf-to-text');
	await expect(page).toHaveTitle(/PDF to Text/);
	await upload(page, fx('text-3pages.pdf'));
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('text-3pages.txt');
	expect(art.bytes.toString('utf8')).toMatch(/quick brown fox/i);
});

test('PT-23: /grayscale-pdf desaturates a colorful page', async ({ page }) => {
	// scan-text.pdf embeds the colorful sunset graphic — a strong color source.
	await gotoPath(page, '/grayscale-pdf');
	await upload(page, fx('scan-text.pdf'));
	await compress(page, { timeout: 180_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('scan-text-grayscale.pdf');
	const pagePng = await rasterizePdfInPage(page, art.bytes, 1);
	if (pagePng) {
		const raw = await decodeRaw(pagePng);
		// Page is 720×480 pt (the 1200×800 graphic at 0.6): sample the blue sky,
		// the orange sunset band and a colored bar — all must land neutral.
		const scale = raw.width / 720;
		for (const [x, y] of [
			[360, 30],
			[60, 200],
			[300, 160]
		]) {
			const [r, g, b] = pixelAt(raw, Math.round(x * scale), Math.round(y * scale));
			expect(Math.abs(r - g), `neutral at ${x},${y}`).toBeLessThanOrEqual(12);
			expect(Math.abs(g - b), `neutral at ${x},${y}`).toBeLessThanOrEqual(12);
		}
	}
});

/** Blank 600×800 pt page carrying /Rotate 90 — viewers display it landscape
 *  (800×600). Blank so stamped text is the ONLY ink on the raster. */
async function writeRotatedBlankPdf(path: string): Promise<void> {
	const doc = await PDFDocument.create();
	doc.addPage([600, 800]).setRotation(degrees(90));
	writeFileSync(path, await doc.save());
}

/** Centroid + count of raster pixels darker than `threshold` on every channel. */
function darkPixelStats(
	raw: { data: Buffer | Uint8Array; width: number; height: number },
	threshold: number
) {
	let sx = 0;
	let sy = 0;
	let n = 0;
	for (let y = 0; y < raw.height; y++) {
		for (let x = 0; x < raw.width; x++) {
			const i = (y * raw.width + x) * 4;
			if (raw.data[i] < threshold && raw.data[i + 1] < threshold && raw.data[i + 2] < threshold) {
				sx += x;
				sy += y;
				n++;
			}
		}
	}
	return { cx: sx / Math.max(1, n), cy: sy / Math.max(1, n), n };
}

test('PT-27: merge refuses an encrypted PDF with the unlock hint', async ({ page }, testInfo) => {
	// Classic-xref source so the encrypted file still PARSES in pdf-lib — the
	// case that used to merge "successfully" and ship ciphertext pages.
	const doc = await PDFDocument.create();
	doc.addPage([300, 300]);
	const plain = await doc.save({ useObjectStreams: false });
	const locked = await qpdfEncrypt(Buffer.from(plain), 'owner-secret');
	const lockedPath = testInfo.outputPath('locked.pdf');
	writeFileSync(lockedPath, locked);

	await gotoTab(page, 'pdf');
	await setPdfOp(page, 'Merge');
	await upload(page, fx('merge-a.pdf'), lockedPath);
	const run = await compress(page, { expectError: true, timeout: 120_000 });
	expect(run.error).toMatch(/password-protected/i);
	expect(run.error).toMatch(/Unlock/);
});

test('PT-28: page numbers land bottom-center on /Rotate 90 pages', async ({ page }, testInfo) => {
	const src = testInfo.outputPath('rotated-blank.pdf');
	await writeRotatedBlankPdf(src);
	await gotoPath(page, '/pdf-page-numbers');
	await upload(page, src);
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('rotated-blank-numbered.pdf');
	const png = await rasterizePdfInPage(page, art.bytes, 1);
	test.skip(!png, 'rasterization unavailable (preview mode)');
	const raw = await decodeRaw(png!);
	expect(raw.width, 'page renders landscape').toBeGreaterThan(raw.height);
	// The "1 / 1" label is the only ink — it must sit in the bottom-center
	// band of the page AS VIEWED, not run sideways along an edge.
	const { cx, cy, n } = darkPixelStats(raw, 128);
	expect(n, 'label pixels found').toBeGreaterThan(20);
	expect(cy, 'bottom band').toBeGreaterThan(raw.height * 0.85);
	expect(cx, 'horizontally centered').toBeGreaterThan(raw.width * 0.4);
	expect(cx, 'horizontally centered').toBeLessThan(raw.width * 0.6);
});

test('PT-29: watermark follows the VIEWED diagonal on /Rotate 90 pages', async ({
	page
}, testInfo) => {
	const src = testInfo.outputPath('rotated-blank-wm.pdf');
	await writeRotatedBlankPdf(src);
	await gotoPath(page, '/watermark-pdf');
	await upload(page, src);
	await page.locator('#watermark-text').fill('CONFIDENTIAL');
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	const png = await rasterizePdfInPage(page, art.bytes, 1);
	test.skip(!png, 'rasterization unavailable (preview mode)');
	const raw = await decodeRaw(png!);
	// The stamp (the only ink) must run bottom-left → top-right of the VIEWED
	// landscape page. Raster y grows downward, so the left half's centroid
	// sits LOWER (larger y) than the right half's; the /Rotate bug flips it.
	let leftY = 0;
	let leftN = 0;
	let rightY = 0;
	let rightN = 0;
	for (let y = 0; y < raw.height; y++) {
		for (let x = 0; x < raw.width; x++) {
			const i = (y * raw.width + x) * 4;
			if (raw.data[i] < 245 && raw.data[i + 1] < 245 && raw.data[i + 2] < 245) {
				if (x < raw.width / 2) {
					leftY += y;
					leftN++;
				} else {
					rightY += y;
					rightN++;
				}
			}
		}
	}
	expect(leftN, 'stamp ink in the left half').toBeGreaterThan(200);
	expect(rightN, 'stamp ink in the right half').toBeGreaterThan(200);
	expect(leftY / leftN - rightY / rightN, 'ascending diagonal').toBeGreaterThan(raw.height * 0.15);
});

test('PT-30: /pdf-to-text maps a protected PDF to the unlock hint', async ({ page }, testInfo) => {
	const locked = await qpdfEncrypt(readFileSync(fx('text-3pages.pdf')), 'secret');
	const lockedPath = testInfo.outputPath('locked-totext.pdf');
	writeFileSync(lockedPath, locked);
	await gotoPath(page, '/pdf-to-text');
	await upload(page, lockedPath);
	const run = await compress(page, { expectError: true, timeout: 120_000 });
	expect(run.error).toMatch(/password-protected/i);
	expect(run.error).toMatch(/Unlock/);
	expect(run.error, 'no raw pdf.js text').not.toMatch(/No password given/);
});

test('PT-24: /pdf-to-pdfa declares PDF/A-2b conformance', async ({ page }) => {
	await gotoPath(page, '/pdf-to-pdfa');
	await expect(page).toHaveTitle(/PDF\/A/);
	await upload(page, fx('text-3pages.pdf'));
	await compress(page, { timeout: 180_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('text-3pages-pdfa.pdf');
	expect((await pdfInfo(art.bytes)).pageCount).toBe(3);
	// XMP is stored uncompressed — the conformance declaration is greppable.
	const raw = art.bytes.toString('latin1');
	expect(raw).toMatch(/pdfaid:part='2'/);
	expect(raw).toMatch(/pdfaid:conformance='B'/);
	expect(raw).toMatch(/OutputIntent/);
});
