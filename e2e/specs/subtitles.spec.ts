/**
 * SB-01…06: the subtitle tab — SRT/VTT/ASS converted between each other by
 * pure JS on the main thread. Input format is detected from content, the
 * target comes from the landing-page preset (hub /srt-to-vtt → VTT,
 * /vtt-to-srt & /ass-to-srt → SRT).
 */
import { writeFileSync } from 'node:fs';
import { expect, fx, test } from '../fixtures';
import { compress, downloadRow, gotoPath, upload } from '../helpers';

test('SB-01: /srt-to-vtt converts a messy CRLF+BOM SRT into WebVTT @smoke', async ({ page }) => {
	await gotoPath(page, '/srt-to-vtt');
	await expect(page).toHaveTitle(/SRT to VTT/);
	await upload(page, fx('sample.srt'));
	await expect(
		page.getByRole('button', { name: 'To VTT', exact: true }),
		'target preset from the landing page'
	).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('compress-cta')).toHaveText('Convert 1 file to VTT');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.vtt');
	const text = art.bytes.toString('utf8');
	expect(text.startsWith('WEBVTT\n\n')).toBe(true);
	// comma milliseconds became dots; the hour rolls in from minute 62
	expect(text).toContain('00:00:01.000 --> 00:00:03.500');
	expect(text).toContain('00:01:02.750 --> 00:01:05.000');
	expect(text).toContain('The quick brown fox');
	expect(text).toContain('jumps over\nthe lazy dog');
	await expect(page.getByTestId('row-info')).toContainText('SRT → VTT · 3 cues');
});

test('SB-02: /vtt-to-srt strips web-only markup and re-numbers cues', async ({ page }) => {
	await gotoPath(page, '/vtt-to-srt');
	await expect(page).toHaveTitle(/VTT to SRT/);
	await expect(page.getByText('Drop VTT files here')).toBeVisible();
	await upload(page, fx('sample.vtt'));
	await expect(page.getByRole('button', { name: 'To SRT', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.srt');
	const text = art.bytes.toString('utf8');
	// numbered cues with comma decimals; NOTE/STYLE blocks and cue settings gone
	expect(text).toContain('1\n00:00:01,000 --> 00:00:03,500');
	expect(text).toContain('2\n00:00:04,000 --> 00:00:06,200');
	expect(text).not.toMatch(/NOTE|STYLE|position:/);
	// <c>/<v> stripped, plain words kept
	expect(text).toContain('The quick brown fox');
	expect(text).toContain('jumps over the lazy dog');
	expect(text).not.toContain('<v');
});

test('SB-03: /ass-to-srt flattens override tags and \\N line breaks', async ({ page }) => {
	await gotoPath(page, '/ass-to-srt');
	await expect(page).toHaveTitle(/ASS to SRT/);
	await upload(page, fx('sample.ass'));
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.srt');
	const text = art.bytes.toString('utf8');
	expect(text).toContain('1\n00:00:01,000 --> 00:00:03,500\nThe quick brown fox');
	// \N becomes a real break; the comma inside the text survives the split
	expect(text).toContain('jumps over\nthe lazy dog, twice');
	expect(text).not.toContain('{\\');
	await expect(page.getByTestId('row-info')).toContainText('ASS → SRT · 2 cues');
});

test('SB-04: flipping the segmented control converts the other way', async ({ page }) => {
	await gotoPath(page, '/srt-to-vtt');
	await upload(page, fx('sample.vtt'));
	// hub presets VTT — flip to SRT and the same VTT input round-trips to SRT
	await page.getByRole('button', { name: 'To SRT', exact: true }).click();
	await expect(page.getByTestId('compress-cta')).toHaveText('Convert 1 file to SRT');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.srt');
	expect(art.bytes.toString('utf8')).toContain('00:00:01,000 --> 00:00:03,500');
});

test('SB-05: a home-dropped .srt routes to the subtitle tab', async ({ page }) => {
	await gotoPath(page, '/');
	await upload(page, fx('sample.srt'));
	// routing lands on the subtitle tab with the settings card visible
	await expect(page.getByRole('button', { name: 'To VTT', exact: true })).toBeVisible();
	await expect(page.getByTestId('compress-cta')).toHaveText('Convert 1 file to VTT');
});

test('SB-06: legacy CP-1252 and UTF-16 SRT files decode correctly', async ({ page }, testInfo) => {
	// Blob.text() is UTF-8-only — these two real-world encodings used to ship
	// U+FFFD (CP-1252) or fail detection outright (UTF-16, NULs hide the arrow).
	const cp1252 = testInfo.outputPath('legacy-cp1252.srt');
	writeFileSync(
		cp1252,
		Buffer.from('1\r\n00:00:01,000 --> 00:00:02,500\r\ncafé au lait\r\n', 'latin1')
	);
	const utf16 = testInfo.outputPath('notepad-utf16.srt');
	writeFileSync(
		utf16,
		Buffer.from('﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nČeprav žvižga\r\n', 'utf16le')
	);
	await gotoPath(page, '/srt-to-vtt');
	await upload(page, cp1252, utf16);
	await compress(page);
	const legacy = (await downloadRow(page, 'legacy-cp1252')).bytes.toString('utf8');
	expect(legacy).toContain('café au lait');
	expect(legacy).not.toContain('�');
	const unicode = (await downloadRow(page, 'notepad-utf16')).bytes.toString('utf8');
	expect(unicode.startsWith('WEBVTT\n\n')).toBe(true);
	expect(unicode).toContain('Čeprav žvižga');
});
