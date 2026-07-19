/**
 * K-01…02: the "keep original if it got bigger" guard — applies for
 * same-format recompression, deliberately NOT for format conversion.
 */
import { readFileSync } from 'node:fs';
import { expect, fx, test } from '../fixtures';
import { compress, downloadRow, gotoTab, rows, setOutputFormat, upload } from '../helpers';
import { imageMeta } from '../verify';

test('K-01: pre-optimized jpg → jpg keeps original bytes @smoke', async ({ page, rec }) => {
	const input = readFileSync(fx('tiny-optimized.jpg'));
	await gotoTab(page, 'jpg');
	await upload(page, fx('tiny-optimized.jpg'));
	await setOutputFormat(page, 'JPG'); // pinned: the tab default became Auto
	await compress(page);
	const art = await downloadRow(page);
	expect(art.bytes.length, 'byte length unchanged').toBe(input.length);
	expect(art.bytes.equals(input), 'exact original bytes').toBe(true);
	rec.record({
		id: 'K-01',
		settings: { tab: 'jpg', output: 'jpg', quality: 80 },
		input: { name: 'tiny-optimized.jpg', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { keptOriginal: true, savingsPct: 0 },
		assets: {
			original: rec.saveAsset('K-01', 'original', 'tiny-optimized.jpg', fx('tiny-optimized.jpg')),
			output: rec.saveAsset('K-01', 'output', art.name, art.bytes)
		}
	});
});

test('K-02: conversion is honored even when the output is larger', async ({ page, rec }) => {
	const input = readFileSync(fx('tiny-optimized.jpg'));
	await gotoTab(page, 'jpg');
	await upload(page, fx('tiny-optimized.jpg'));
	await setOutputFormat(page, 'PNG'); // lossless png of a photo ≫ jpg source
	await compress(page);
	// The row chip must agree with the "↑ larger" summary: a grown conversion
	// reads "+N%", never the old clamped "−0%".
	await expect(rows(page).first()).toContainText(/\+\d+%/);
	// The compare modal must agree too: a grown file reads "Grew N%", never a
	// green "Saved −N%" (O-04).
	await page.getByRole('button', { name: 'Compare', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'File comparison' });
	await expect(dialog).toContainText('Grew');
	await expect(dialog).not.toContainText('Saved');
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect(m.format, 'conversion must not silently keep the jpg').toBe('png');
	expect(art.name).toBe('tiny-optimized.png');
	rec.record({
		id: 'K-02',
		expectation: 'document',
		settings: { tab: 'jpg', output: 'png', quality: 80 },
		input: { name: 'tiny-optimized.jpg', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length, format: m.format },
		metrics: { grewBytes: art.bytes.length - input.length },
		note: 'Chip and summary agree since the savings clamp fix: grown conversions read "+N%" and "↑ larger".',
		assets: {
			original: rec.saveAsset('K-02', 'original', 'tiny-optimized.jpg', fx('tiny-optimized.jpg')),
			output: rec.saveAsset('K-02', 'output', art.name, art.bytes)
		}
	});
});
