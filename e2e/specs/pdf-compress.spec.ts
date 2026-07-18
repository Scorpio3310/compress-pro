/**
 * P-01…08: Ghostscript compression — level ladder, the two-pass <100 DPI
 * regression (ultra/extreme MUST shrink; gs skips downsampling at large
 * reduction factors without the pre-pass), target mode, inflation guard,
 * metadata stripping (XMP + DOCINFO).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, fx, test } from '../fixtures';
import {
	compress,
	downloadRow,
	gotoTab,
	rasterizePdfInPage,
	setPdfLevel,
	setTargetMb,
	upload
} from '../helpers';
import { pdfDocInfo, pdfInfo, pdfTextContent, pixelDiff } from '../verify';

// Ghostscript: 15 MB wasm compile + multi-pass runs need generous room.
test.describe.configure({ timeout: 240_000 });

test('P-01: text pdf, medium level — parses, 3 pages, smaller @smoke', async ({ page, rec }) => {
	const input = readFileSync(fx('text-3pages.pdf'));
	await gotoTab(page, 'pdf');
	await upload(page, fx('text-3pages.pdf'));
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	const info = await pdfInfo(art.bytes);
	expect(info.pageCount).toBe(3);
	expect(art.bytes.length, 'compressed text pdf must not grow').toBeLessThanOrEqual(input.length);
	rec.record({
		id: 'P-01',
		settings: { tab: 'pdf', op: 'compress', level: 'medium' },
		input: { name: 'text-3pages.pdf', bytes: input.length, pages: 3 },
		output: { name: art.name, bytes: art.bytes.length, pages: info.pageCount },
		assets: { output: rec.saveAsset('P-01', 'output', art.name, art.bytes) }
	});
});

test('P-02/03: level ladder monotone; ultra & extreme (two-pass DPI) must shrink', async ({
	page,
	rec
}) => {
	const input = readFileSync(fx('image-heavy.pdf'));
	await gotoTab(page, 'pdf');
	await upload(page, fx('image-heavy.pdf'));

	const sizes: Record<string, number> = {};
	for (const level of ['Low', 'Medium', 'High', 'Ultra', 'Extreme'] as const) {
		await setPdfLevel(page, level);
		await compress(page, { timeout: 150_000 });
		const art = await downloadRow(page);
		const info = await pdfInfo(art.bytes);
		expect(info.pageCount, `${level}: page count`).toBe(3);
		sizes[level] = art.bytes.length;
		rec.record({
			id: `P-02-${level.toLowerCase()}`,
			settings: { tab: 'pdf', op: 'compress', level: level.toLowerCase() },
			input: { name: 'image-heavy.pdf', bytes: input.length, pages: 3 },
			output: { name: art.name, bytes: art.bytes.length, pages: info.pageCount },
			metrics: {
				savingsPct: Number((((input.length - art.bytes.length) / input.length) * 100).toFixed(1))
			},
			assets: {
				output: rec.saveAsset(
					`P-02-${level.toLowerCase()}`,
					'output',
					`${level}-${art.name}`,
					art.bytes
				)
			}
		});
	}
	// Ladder: each level ≤ the previous (ties allowed), extreme strictly < low.
	expect(sizes.Medium).toBeLessThanOrEqual(sizes.Low);
	expect(sizes.High).toBeLessThanOrEqual(sizes.Medium);
	expect(sizes.Ultra).toBeLessThanOrEqual(sizes.High);
	expect(sizes.Extreme).toBeLessThanOrEqual(sizes.Ultra);
	expect(sizes.Extreme, 'extreme < low').toBeLessThan(sizes.Low);
	// The two-pass regression: <100 DPI targets grow without the 4×DPI pre-pass.
	expect(sizes.Ultra, 'ultra (72 DPI) must shrink vs original').toBeLessThan(input.length);
	expect(sizes.Extreme, 'extreme (50 DPI) must shrink vs original').toBeLessThan(input.length);
});

test('P-04: target 0.5 MB fits without warning', async ({ page, rec }) => {
	const input = readFileSync(fx('image-heavy.pdf'));
	await gotoTab(page, 'pdf');
	await upload(page, fx('image-heavy.pdf'));
	await setTargetMb(page, 0.5);
	const run = await compress(page, { timeout: 150_000 });
	expect(run.warnings).toEqual([]);
	const art = await downloadRow(page);
	expect(art.bytes.length, 'fits under 0.5 MB').toBeLessThanOrEqual(500_000);
	expect((await pdfInfo(art.bytes)).pageCount).toBe(3);
	rec.record({
		id: 'P-04',
		settings: { tab: 'pdf', op: 'compress', mode: 'target', targetMb: 0.5 },
		input: { name: 'image-heavy.pdf', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { targetBytes: 500_000, fits: true },
		assets: { output: rec.saveAsset('P-04', 'output', art.name, art.bytes) }
	});
});

test('P-05: unreachable 0.01 MB target warns and returns the smallest', async ({ page, rec }) => {
	const input = readFileSync(fx('image-heavy.pdf'));
	await gotoTab(page, 'pdf');
	await upload(page, fx('image-heavy.pdf'));
	await setTargetMb(page, 0.01);
	const run = await compress(page, { timeout: 150_000 });
	expect(run.warnings.join('\n')).toMatch(/not reachable/i);
	const art = await downloadRow(page);
	expect(art.bytes.length, 'smallest attempt way below input').toBeLessThan(input.length / 2);
	expect((await pdfInfo(art.bytes)).pageCount).toBe(3);
	rec.record({
		id: 'P-05',
		settings: { tab: 'pdf', op: 'compress', mode: 'target', targetMb: 0.01 },
		input: { name: 'image-heavy.pdf', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		warnings: run.warnings,
		metrics: { targetBytes: 10_000, fits: false },
		assets: { output: rec.saveAsset('P-05', 'output', art.name, art.bytes) }
	});
});

test('P-06: recompressing an extreme output never inflates', async ({ page, rec }, testInfo) => {
	await gotoTab(page, 'pdf');
	await upload(page, fx('image-heavy.pdf'));
	await setPdfLevel(page, 'Extreme');
	await compress(page, { timeout: 150_000 });
	const first = await downloadRow(page);

	const passPath = testInfo.outputPath('extreme-pass1.pdf');
	writeFileSync(passPath, first.bytes);
	await page.reload();
	await gotoTab(page, 'pdf');
	await upload(page, passPath);
	await setPdfLevel(page, 'Extreme');
	await compress(page, { timeout: 150_000 });
	const second = await downloadRow(page);
	expect(second.bytes.length, 'keep-original guard on inflation').toBeLessThanOrEqual(
		first.bytes.length
	);
	expect((await pdfInfo(second.bytes)).pageCount).toBe(3);
	rec.record({
		id: 'P-06',
		settings: { tab: 'pdf', op: 'compress', level: 'extreme', pass: 2 },
		input: { name: 'extreme-pass1.pdf', bytes: first.bytes.length },
		output: { name: second.name, bytes: second.bytes.length },
		metrics: { keptOriginal: second.bytes.length === first.bytes.length },
		assets: { output: rec.saveAsset('P-06', 'output', second.name, second.bytes) }
	});
});

test('P-07: medium output page 1 rasterizes close to the original', async ({ page, rec }) => {
	const input = readFileSync(fx('image-heavy.pdf'));
	await gotoTab(page, 'pdf');
	await upload(page, fx('image-heavy.pdf'));
	await compress(page, { timeout: 150_000 }); // default medium
	const art = await downloadRow(page);

	const before = await rasterizePdfInPage(page, input, 1);
	const after = await rasterizePdfInPage(page, art.bytes, 1);
	test.skip(!before || !after, 'in-page rasterization is dev-server only');
	const { ratio, diffPng } = await pixelDiff(before!, after!);
	// No hard budget — Ghostscript recompresses/downsamples by design; the
	// number and the side-by-side land in the visual report.
	rec.record({
		id: 'P-07',
		expectation: 'document',
		settings: { tab: 'pdf', op: 'compress', level: 'medium' },
		input: { name: 'image-heavy.pdf', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { diffRatio: Number(ratio.toFixed(5)) },
		note: 'Rasterized page 1 before/after at medium — informational, no pass bound.',
		assets: {
			original: rec.saveAsset('P-07', 'original', 'page1-before.png', before!),
			output: rec.saveAsset('P-07', 'output', 'page1-after.png', after!),
			diff: rec.saveAsset('P-07', 'diff', 'diff.png', diffPng)
		}
	});
});

test('P-08: strip-metadata removes XMP and DOCINFO on medium AND low', async ({ page, rec }) => {
	const input = readFileSync(fx('metadata.pdf'));
	expect(input.toString('latin1')).toContain('FixtureSecretTitle'); // fixture sanity
	await gotoTab(page, 'pdf');
	await upload(page, fx('metadata.pdf'));

	// Low used to skip metadata stripping — every level must clean now.
	for (const level of ['Medium', 'Low'] as const) {
		await setPdfLevel(page, level);
		await compress(page, { timeout: 120_000 });
		const art = await downloadRow(page);
		const raw = art.bytes.toString('latin1');
		expect(raw, `${level}: XMP packet must be gone`).not.toContain('xpacket');
		expect(raw, `${level}: XMP payload must be gone`).not.toContain('FixtureSecretTitle');
		const docInfo = await pdfDocInfo(art.bytes);
		expect(docInfo.title ?? '', `${level}: DOCINFO title blanked`).toBe('');
		expect(docInfo.author ?? '', `${level}: DOCINFO author blanked`).toBe('');
		expect((await pdfInfo(art.bytes)).pageCount).toBe(1);
		rec.record({
			id: `P-08-${level.toLowerCase()}`,
			settings: { tab: 'pdf', op: 'compress', level: level.toLowerCase() },
			input: { name: 'metadata.pdf', bytes: input.length, pages: 1 },
			output: { name: art.name, bytes: art.bytes.length },
			note: 'XMP /Metadata stream and DOCINFO both stripped (-dOmitXMP + empty DOCINFO pdfmark).',
			assets: {
				output: rec.saveAsset(`P-08-${level.toLowerCase()}`, 'output', art.name, art.bytes)
			}
		});
	}
});

test('P-30: filled form values stay visible and links survive compression', async ({
	page,
	rec
}) => {
	// F-03 (quality sweep 2026-07-18): the gs wasm build drops EVERY annotation
	// on rewrite — filled AcroForm values and hyperlinks silently vanished. The
	// fix flattens filled forms into page content before gs (values stay
	// visible; text extraction sees them) and transplants /Link annotations
	// back onto the compressed output.
	const input = readFileSync(fx('form-filled.pdf'));
	await gotoTab(page, 'pdf');
	await upload(page, fx('form-filled.pdf'));
	const run = await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect((await pdfInfo(art.bytes)).pageCount).toBe(2);

	// The filled value must remain VISIBLE content (flatten), not vanish.
	const text = await pdfTextContent(art.bytes);
	expect(text, 'filled field value visible after compression').toContain('MATRIX-VALUE-42');

	// Both link annotations survive: external URI + internal GoTo.
	const raw = art.bytes.toString('latin1');
	expect(raw, 'URI link survives').toContain('example.com/matrix-link');
	expect((raw.match(/\/Link/g) ?? []).length, 'both /Link annots present').toBeGreaterThanOrEqual(
		2
	);

	// Honesty: the flatten is surfaced to the user as a row note/warning.
	expect(
		run.warnings.join(' '),
		'flatten surfaced to the user'
	).toMatch(/form/i);

	rec.record({
		id: 'P-30',
		settings: { tab: 'pdf', op: 'compress', level: 'medium' },
		input: { name: 'form-filled.pdf', bytes: input.length, pages: 2 },
		output: { name: art.name, bytes: art.bytes.length },
		note: 'Filled AcroForm flattened before gs (values stay visible); /Link annots transplanted after.',
		assets: { output: rec.saveAsset('P-30', 'output', art.name, art.bytes) }
	});
});
