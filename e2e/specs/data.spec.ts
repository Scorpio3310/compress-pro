/**
 * DT-01…08: the data tab — CSV / XLSX / JSON / YAML, one uniform op: the
 * input format is detected from content, the target is implied. Spreadsheet
 * side rides SheetJS, data side the `yaml` parser; outputs are verified in
 * Node with the SAME engines.
 */
import { readFileSync } from 'node:fs';
import { expect, fx, test } from '../fixtures';
import { compress, downloadRow, gotoPath, upload } from '../helpers';
import { unzip, xlsxInfo } from '../verify';

test('DT-01: /csv-to-xlsx converts a BOM’d CSV into a real workbook @smoke', async ({ page }) => {
	await gotoPath(page, '/csv-to-xlsx');
	await expect(page).toHaveTitle(/CSV to Excel/);
	await expect(page.getByText('Drop CSV, Excel, JSON or YAML files here')).toBeVisible();
	await upload(page, fx('sample.csv'));
	await expect(page.getByTestId('compress-cta')).toHaveText('Convert 1 file');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.xlsx');
	// structurally a real xlsx (zip with the OOXML skeleton)
	const entries = unzip(art.bytes);
	expect(Object.keys(entries)).toEqual(
		expect.arrayContaining(['[Content_Types].xml', 'xl/worksheets/sheet1.xml'])
	);
	// semantically correct — read back with SheetJS
	const info = await xlsxInfo(art.bytes);
	expect(info.sheetNames).toHaveLength(1);
	expect(info.rows[0]).toEqual(['Name', 'Qty', 'Price', 'Note']);
	expect(info.rows[1][0]).toBe('Žižek čaj'); // input BOM stripped + unicode
	expect(info.rows[1][3]).toBe('has, comma'); // quoted comma survives
	expect(info.rows[2][3]).toBe('two\nlines'); // embedded newline survives
	await expect(page.getByTestId('row-info')).toContainText('CSV → XLSX · 4 rows × 4 columns');
});

test('DT-02: /xlsx-to-csv exports first-sheet values with a BOM', async ({ page }) => {
	await gotoPath(page, '/xlsx-to-csv');
	await expect(page).toHaveTitle(/XLSX to CSV/);
	await expect(page.locator('input[type=file]')).toHaveAttribute('accept', /\.xlsx,\.xls/);
	await upload(page, fx('sample.xlsx'));
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.csv');
	expect([art.bytes[0], art.bytes[1], art.bytes[2]]).toEqual([0xef, 0xbb, 0xbf]); // BOM for Excel
	const text = art.bytes.toString('utf8');
	expect(text).toContain('Name,Qty,Price,Date,Total');
	expect(text).toContain('Žižek čaj,3,4.5');
	expect(text).toContain('2026-01-15'); // date as displayed, not a serial
	expect(text).toContain('13.5'); // formula → cached value
	expect(text).not.toContain('B2*C2');
	expect(text).not.toContain('SECOND-SHEET-MARKER');
	await expect(page.getByTestId('row-warning')).toContainText(
		'2 sheets found — only the first (“Data”) was exported'
	);
	await expect(page.getByTestId('row-info')).toContainText('XLSX → CSV · 3 rows × 5 columns');
});

test('DT-03: the Semicolon pill writes ;-separated CSV', async ({ page }) => {
	await gotoPath(page, '/xlsx-to-csv');
	await upload(page, fx('sample.xlsx'));
	await page.getByRole('button', { name: 'Semicolon', exact: true }).click();
	await compress(page);
	const text = (await downloadRow(page)).bytes.toString('utf8');
	expect(text).toContain('Name;Qty;Price;Date;Total');
	expect(text.split('\n')[1].split(';')).toHaveLength(5);
});

test('DT-04: a semicolon CSV with decimal commas keeps its 3 columns', async ({ page }) => {
	await gotoPath(page, '/csv-to-xlsx');
	await upload(page, fx('sample-semicolon.csv'));
	await compress(page);
	const info = await xlsxInfo((await downloadRow(page)).bytes);
	expect(info.rows[0]).toEqual(['Artikel', 'Menge', 'Preis']);
	// decimal commas parse as text, never split into extra columns
	expect(info.rows[1]).toEqual(['Čaj', '3', '4,50']);
});

test('DT-05: /json-to-yaml preserves values, order and unicode', async ({ page }) => {
	await gotoPath(page, '/json-to-yaml');
	await expect(page).toHaveTitle(/JSON to YAML/);
	await upload(page, fx('sample.json'));
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.yaml');
	const text = art.bytes.toString('utf8');
	expect(text.startsWith('name: Compress Pro')).toBe(true);
	expect(text).toContain('- čšž');
	expect(text).toContain('value: 3.14');
	expect(text).toContain('notes: null');
	expect(text).not.toMatch(/[{}]/); // block style, no flow braces
	expect(text.indexOf('name:')).toBeLessThan(text.indexOf('version:'));
	await expect(page.getByTestId('row-info')).toContainText('JSON → YAML · 6 keys');
});

test('DT-06: /yaml-to-json expands anchors into valid JSON', async ({ page }) => {
	await gotoPath(page, '/yaml-to-json');
	await expect(page).toHaveTitle(/YAML to JSON/);
	await upload(page, fx('sample.yaml'));
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.json');
	const text = art.bytes.toString('utf8');
	const value = JSON.parse(text);
	expect(value.prod_config).toEqual(value.defaults); // alias expanded
	expect(typeof value.defaults.retries).toBe('number');
	expect(value.description).toBe('multi-line\nblock čšž\n'); // block scalar
	expect(text).not.toContain('#'); // comment gone
	expect(text).not.toContain('*base');
});

test('DT-07: a .json dropped on the hub becomes YAML (auto-detect)', async ({ page }) => {
	await gotoPath(page, '/csv-to-xlsx');
	await upload(page, fx('sample.json'));
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.yaml');
	expect(art.bytes.toString('utf8')).toContain('name: Compress Pro');
	await expect(page.getByTestId('row-info')).toContainText('JSON → YAML');
});

test('DT-08: invalid input errors cleanly; a home-dropped .csv routes here', async ({ page }) => {
	await gotoPath(page, '/json-to-yaml');
	await upload(page, fx('corrupt.data.json'));
	const run = await compress(page, { expectError: true });
	expect(run.error).toMatch(/not valid JSON/i);
	await expect(page.getByTestId('compress-cta')).toBeEnabled();

	await gotoPath(page, '/');
	await upload(page, fx('sample.csv'));
	await expect(page.getByRole('button', { name: 'Semicolon', exact: true })).toBeVisible();
	await expect(page.getByTestId('compress-cta')).toHaveText('Convert 1 file');
});
