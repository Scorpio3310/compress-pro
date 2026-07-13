/**
 * FT-01…08: the font conversion pages (/ttf-to-woff2 …) — presets, real
 * conversions with byte-level losslessness proofs, the flavor rule, and the
 * two honest failure modes (corrupt sfnt, MicroType EOT).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, FIXTURES, fx, fxMeta, realFile, test } from '../fixtures';
import { compress, downloadRow, downloadRowAt, gotoPath, rows, upload } from '../helpers';
import { fontInfo, sfntTableBytes, woffTableBytes } from '../verify';

function outputPill(page: import('@playwright/test').Page, name: string) {
	return page.getByRole('button', { name, exact: true });
}

test('FT-01: /ttf-to-woff2 presets WOFF2 and converts @smoke @xbrowser', async ({ page, rec }) => {
	await gotoPath(page, '/ttf-to-woff2');
	await expect(page).toHaveTitle(/TTF to WOFF2 Converter/);
	await expect(page.locator('h1')).toHaveText('Convert TTF to WOFF2.');
	await upload(page, fx('font-tiny.ttf'));
	await expect(outputPill(page, 'WOFF2')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('font-tiny.woff2');
	const info = fontInfo(art.bytes);
	expect(info.container).toBe('woff2');
	expect(info.flavor).toBe('glyf');
	rec.record({
		id: 'FT-01',
		settings: { to: 'woff2' },
		input: { name: 'font-tiny.ttf', bytes: readFileSync(fx('font-tiny.ttf')).length },
		output: { name: art.name, bytes: art.bytes.length, container: info.container },
		metrics: { numTables: info.numTables }
	});
});

test('FT-02: /woff2-to-ttf decodes back to a full TTF', async ({ page, rec }) => {
	test.skip(!FIXTURES.fontWoff2Available, 'node woff2 wasm unavailable — no .woff2 fixture');
	await gotoPath(page, '/woff2-to-ttf');
	await upload(page, fx('font-tiny.woff2'));
	await expect(outputPill(page, 'TTF')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('font-tiny.ttf');
	const info = fontInfo(art.bytes);
	expect(info.container).toBe('ttf');
	// The decoder must reconstruct the exact table set of the pre-encoding TTF.
	const sourceTags = fxMeta<{ tags: string[] }>('font-tiny.ttf').tags;
	expect(info.tags?.slice().sort()).toEqual(sourceTags.slice().sort());
	rec.record({
		id: 'FT-02',
		settings: { to: 'ttf' },
		input: { name: 'font-tiny.woff2', bytes: readFileSync(fx('font-tiny.woff2')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { tags: info.tags?.join(' ') ?? null }
	});
});

test('FT-03: /ttf-to-woff is losslessness you can measure — inner bytes identical', async ({
	page,
	rec
}) => {
	await gotoPath(page, '/ttf-to-woff');
	await upload(page, fx('font-tiny.ttf'));
	await expect(outputPill(page, 'WOFF')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('font-tiny.woff');
	expect(fontInfo(art.bytes).container).toBe('woff');
	const source = sfntTableBytes(readFileSync(fx('font-tiny.ttf')));
	const inner = woffTableBytes(art.bytes);
	expect(Object.keys(inner).sort()).toEqual(Object.keys(source).sort());
	for (const [tag, bytes] of Object.entries(source)) {
		expect(inner[tag].equals(bytes), `table ${tag} must be byte-identical`).toBe(true);
	}
	rec.record({
		id: 'FT-03',
		settings: { to: 'woff' },
		input: { name: 'font-tiny.ttf', bytes: readFileSync(fx('font-tiny.ttf')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { tablesCompared: Object.keys(source).length, byteIdentical: true }
	});
});

test('FT-04: /font-converter hub converts a mixed TTF+OTF batch to WOFF2', async ({ page }) => {
	await gotoPath(page, '/font-converter');
	await expect(page.locator('h1')).toHaveText('Convert fonts.');
	await upload(page, fx('font-tiny.ttf'), fx('font-tiny.otf'));
	await expect(rows(page)).toHaveCount(2);
	// woff2 is the tab default — no pill click on the hub.
	await expect(outputPill(page, 'WOFF2')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const first = fontInfo((await downloadRowAt(page, 0)).bytes);
	const second = fontInfo((await downloadRowAt(page, 1)).bytes);
	expect([first.container, second.container]).toEqual(['woff2', 'woff2']);
	// Each keeps its own outline flavor inside the new wrapper.
	expect([first.flavor, second.flavor].sort()).toEqual(['cff', 'glyf']);
});

test('FT-05: the flavor rule — OTF asked to become TTF stays CFF, saves as .otf', async ({
	page,
	rec
}) => {
	await gotoPath(page, '/woff-to-ttf'); // arrival presets TTF…
	await upload(page, fx('font-tiny.otf')); // …but the input has CFF outlines
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('font-tiny.otf');
	const info = fontInfo(art.bytes);
	expect(info.container).toBe('otf');
	expect(info.flavor).toBe('cff');
	rec.record({
		id: 'FT-05',
		title: 'flavor rule: no lossy outline conversion, honest extension',
		settings: { to: 'ttf' },
		input: { name: 'font-tiny.otf', bytes: readFileSync(fx('font-tiny.otf')).length },
		output: { name: art.name, bytes: art.bytes.length },
		note: 'CFF outlines kept verbatim; converting them would cost hinting + shape fidelity'
	});
});

test('FT-06: /eot-to-ttf scopes the dropzone and unwraps legacy EOT @xbrowser', async ({
	page
}) => {
	await gotoPath(page, '/eot-to-ttf');
	await expect(page.getByText('Drop EOT fonts here')).toBeVisible();
	await expect(page.locator('input[type=file]')).toHaveAttribute(
		'accept',
		'application/vnd.ms-fontobject,.eot'
	);
	await upload(page, fx('font-tiny.eot'));
	await expect(outputPill(page, 'TTF')).toHaveAttribute('aria-pressed', 'true');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('font-tiny.ttf');
	const info = fontInfo(art.bytes);
	expect(info.container).toBe('ttf');
	expect(info.tags).toContain('glyf');
});

test('FT-07: corrupt sfnt shows the error banner and recovers', async ({ page, rec }) => {
	await gotoPath(page, '/ttf-to-woff');
	await upload(page, fx('corrupt.ttf'));
	const run = await compress(page, { expectError: true });
	expect(run.error).toBeTruthy();
	await expect(rows(page).getByRole('button', { name: 'Download' })).toHaveCount(0);
	await expect(page.getByTestId('compress-cta'), 'CTA recovers for a retry').toBeEnabled();
	rec.record({
		id: 'FT-07',
		settings: { to: 'woff' },
		input: { name: 'corrupt.ttf', bytes: 256 },
		error: run.error,
		metrics: {}
	});
});

test('FT-09: real font TTF → WOFF2 → TTF keeps every layout table byte-identical', async ({
	page,
	rec
}, testInfo) => {
	const real = realFile(/\.ttf$/i);
	test.skip(!real, 'drop any real .ttf into tests/fixtures/real/ to enable');
	const sourceBytes = readFileSync(real!);

	await gotoPath(page, '/ttf-to-woff2');
	await upload(page, real!);
	await compress(page, { timeout: 120_000 }); // brotli-q11 on a real font takes seconds
	const woff2Art = await downloadRow(page);
	expect(fontInfo(woff2Art.bytes).container).toBe('woff2');
	expect(woff2Art.bytes.length).toBeLessThan(sourceBytes.length);

	const tmp = testInfo.outputPath(woff2Art.name);
	writeFileSync(tmp, woff2Art.bytes);
	await gotoPath(page, '/woff2-to-ttf');
	await upload(page, tmp);
	await compress(page, { timeout: 120_000 });
	const ttfArt = await downloadRow(page);

	// The WOFF2 spec drops DSIG and lets the codec normalize glyf/loca (and
	// transform hmtx); head carries a recomputed checksum. EVERYTHING else —
	// hinting (fpgm/prep/cvt), kerning (GPOS/kern), features (GSUB), names —
	// must come back byte-for-byte.
	const normalized = new Set(['DSIG', 'glyf', 'loca', 'hmtx', 'head']);
	const source = sfntTableBytes(sourceBytes);
	const back = sfntTableBytes(ttfArt.bytes);
	expect(Object.keys(back).sort()).toEqual(
		Object.keys(source)
			.filter((t) => t !== 'DSIG')
			.sort()
	);
	const compared: string[] = [];
	for (const [tag, bytes] of Object.entries(source)) {
		if (normalized.has(tag)) continue;
		expect(back[tag].equals(bytes), `table ${tag} must be byte-identical`).toBe(true);
		compared.push(tag);
	}
	expect(compared.length).toBeGreaterThan(0);
	rec.record({
		id: 'FT-09',
		title: 'real-font WOFF2 round-trip',
		input: { name: real!.split('/').pop()!, bytes: sourceBytes.length },
		output: { name: ttfArt.name, bytes: ttfArt.bytes.length },
		metrics: {
			woff2Bytes: woff2Art.bytes.length,
			savingsPct: Math.round((1 - woff2Art.bytes.length / sourceBytes.length) * 100),
			tablesByteIdentical: compared.join(' ')
		}
	});
});

test('FT-10: /subset-font subsets to typed characters with honest glyph counts @smoke @xbrowser', async ({
	page,
	rec
}) => {
	await gotoPath(page, '/subset-font');
	await expect(page).toHaveTitle(/Subset Font Online/);
	await expect(page.locator('h1')).toHaveText('Subset fonts.');
	// The generic how-it-works trio is overridden on font pages.
	await expect(page.locator('.how-steps li').first()).toContainText('Drop a font');
	await upload(page, fx('font-tiny.ttf'));
	// Default arrival state: Subset op, Basic Latin preselected.
	await expect(outputPill(page, 'Basic Latin')).toHaveAttribute('aria-pressed', 'true');
	await outputPill(page, 'Basic Latin').click(); // deselect — custom text only
	await page.getByLabel('Custom characters').fill('A');
	await outputPill(page, 'TTF').click();
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('font-tiny-subset.ttf');
	const info = fontInfo(art.bytes);
	expect(info.container).toBe('ttf');
	const sourceGlyphs = fontInfo(readFileSync(fx('font-tiny.ttf'))).glyphCount!;
	expect(info.glyphCount).toBe(3); // .notdef + forced space + A
	expect(info.glyphCount!).toBeLessThan(sourceGlyphs);
	await expect(page.getByText(`Glyphs: ${sourceGlyphs} → 3`)).toBeVisible();
	rec.record({
		id: 'FT-10',
		settings: { op: 'subset', text: 'A', to: 'ttf' },
		input: { name: 'font-tiny.ttf', bytes: readFileSync(fx('font-tiny.ttf')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { glyphsBefore: sourceGlyphs, glyphsAfter: info.glyphCount }
	});
});

test('FT-11: /variable-font-to-static on a static font succeeds with the honest note', async ({
	page
}) => {
	await gotoPath(page, '/variable-font-to-static');
	await expect(page.locator('h1')).toHaveText('Variable font to static.');
	await upload(page, fx('font-tiny.ttf'));
	await outputPill(page, 'TTF').click();
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('font-tiny.ttf'); // no -static suffix — nothing was pinned
	await expect(page.getByText('Not a variable font — kept as-is')).toBeVisible();
});

test('FT-12: a variable font surfaces the axis inputs prefilled with defaults', async ({
	page
}) => {
	await gotoPath(page, '/subset-font');
	await upload(page, fx('font-var.ttf'));
	await expect(page.getByText('Variable font', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Static instance' }).click();
	const wght = page.getByRole('spinbutton');
	await expect(wght).toHaveCount(1); // one visible axis: wght
	await expect(wght).toHaveValue('400'); // prefilled with the fvar default
});

test('FT-13: real variable font pins to a static instance (fvar/gvar gone)', async ({ page }) => {
	const real = realFile(/variable|-vf/i);
	test.skip(!real, 'drop a real variable .ttf into tests/fixtures/real/ to enable');
	await gotoPath(page, '/variable-font-to-static');
	await upload(page, real!);
	await outputPill(page, 'TTF').click();
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toMatch(/-static\.ttf$/);
	const info = fontInfo(art.bytes);
	expect(info.container).toBe('ttf');
	expect(info.tags).not.toContain('fvar');
	expect(info.tags).not.toContain('gvar');
	// Keep-everything instance run: the glyph set survives whole.
	expect(info.glyphCount).toBe(fontInfo(readFileSync(real!)).glyphCount);
});

test('FT-14: corrupt sfnt on /subset-font shows the banner and recovers', async ({ page }) => {
	await gotoPath(page, '/subset-font');
	await upload(page, fx('corrupt.ttf'));
	const run = await compress(page, { expectError: true });
	expect(run.error).toBeTruthy();
	await expect(page.getByTestId('compress-cta'), 'CTA recovers for a retry').toBeEnabled();
});

test('FT-08: MicroType-compressed EOT fails with the actionable message', async ({ page, rec }) => {
	await gotoPath(page, '/eot-to-ttf');
	await upload(page, fx('mtx.eot'));
	const run = await compress(page, { expectError: true });
	expect(run.error).toMatch(/MicroType Express/);
	rec.record({
		id: 'FT-08',
		settings: { to: 'ttf' },
		input: { name: 'mtx.eot', bytes: readFileSync(fx('mtx.eot')).length },
		error: run.error,
		metrics: {}
	});
});
