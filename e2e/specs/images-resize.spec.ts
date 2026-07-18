/**
 * R-01…04: max-dimension resize — downscale geometry, no-upscale guarantee,
 * EXIF-orientation interaction, animated GIF resize.
 */
import { readFileSync } from 'node:fs';
import { assertDiffBudget, assertFloor, expect, fx, fxMeta, test } from '../fixtures';
import {
	compress,
	downloadRow,
	gotoTab,
	setMaxDimension,
	setOutputFormat,
	upload
} from '../helpers';
import { decodeRaw, imageMeta, pixelAt, qualityMetrics } from '../verify';
import { DIFF_BUDGET, PSNR_FLOOR } from '../thresholds';

test('R-01: 4000×3000 at maxDimension 1000 → 1000×750 @smoke', async ({ page, rec }) => {
	const input = readFileSync(fx('photo-4000x3000.jpg'));
	await gotoTab(page, 'jpg');
	await upload(page, fx('photo-4000x3000.jpg'));
	await setOutputFormat(page, 'JPG'); // pinned: the tab default became Auto
	await setMaxDimension(page, 1000);
	await compress(page);
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect([m.width, m.height], 'longest side 1000, aspect kept').toEqual([1000, 750]);
	// qualityMetrics lanczos3-downscales the original to output dims for
	// reference (two lanczos implementations in the loop — floors sit lower).
	const { ratio, diffPng, psnr } = await qualityMetrics(input, art.bytes);
	assertDiffBudget(ratio, DIFF_BUDGET.resized, 'R-01 resized');
	assertFloor(psnr, PSNR_FLOOR.resized, 'R-01 resized psnr');
	rec.record({
		id: 'R-01',
		settings: { tab: 'jpg', maxDimension: 1000, quality: 80 },
		input: { name: 'photo-4000x3000.jpg', bytes: input.length, width: 4000, height: 3000 },
		output: { name: art.name, bytes: art.bytes.length, width: m.width, height: m.height },
		metrics: { diffRatio: Number(ratio.toFixed(5)), psnr: Number(psnr.toFixed(1)) },
		assets: {
			original: rec.saveAsset('R-01', 'original', 'photo-4000x3000.jpg', fx('photo-4000x3000.jpg')),
			output: rec.saveAsset('R-01', 'output', art.name, art.bytes),
			diff: rec.saveAsset('R-01', 'diff', 'diff.png', diffPng)
		}
	});
});

test('R-02: maxDimension larger than the image never upscales', async ({ page, rec }) => {
	const input = readFileSync(fx('tiny-optimized.jpg'));
	await gotoTab(page, 'jpg');
	await upload(page, fx('tiny-optimized.jpg'));
	await setOutputFormat(page, 'JPG'); // pinned: the tab default became Auto
	await setMaxDimension(page, 1000);
	await compress(page);
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect([m.width, m.height], 'dimensions untouched').toEqual([320, 200]);
	expect(art.bytes.length, 'must not grow (keep-original)').toBeLessThanOrEqual(input.length);
	rec.record({
		id: 'R-02',
		settings: { tab: 'jpg', maxDimension: 1000, quality: 80 },
		input: { name: 'tiny-optimized.jpg', bytes: input.length, width: 320, height: 200 },
		output: { name: art.name, bytes: art.bytes.length, width: m.width, height: m.height },
		assets: {
			original: rec.saveAsset('R-02', 'original', 'tiny-optimized.jpg', fx('tiny-optimized.jpg')),
			output: rec.saveAsset('R-02', 'output', art.name, art.bytes)
		}
	});
});

test('R-03: maxDimension applies to post-EXIF-rotation geometry', async ({ page, rec }) => {
	// Stored 900×600 with orientation 6 → displays 600×900; longest side is the
	// rotated height, so maxDim 450 must yield 300×450 (not 450×300).
	await gotoTab(page, 'jpg');
	await upload(page, fx('photo-exif6.jpg'));
	await setOutputFormat(page, 'JPG'); // pinned: the tab default became Auto
	await setMaxDimension(page, 450);
	await compress(page);
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect([m.width, m.height], 'portrait after rotation, then scaled').toEqual([300, 450]);
	const raw = await decodeRaw(art.bytes);
	const [r, g, b] = pixelAt(raw, 25, 25); // marker square scales 50,50 → 25,25
	expect(r, 'marker stays visual top-left (red)').toBeGreaterThan(150);
	expect(g).toBeLessThan(110);
	expect(b).toBeLessThan(110);
	rec.record({
		id: 'R-03',
		settings: { tab: 'jpg', maxDimension: 450, quality: 80 },
		input: { name: 'photo-exif6.jpg', bytes: readFileSync(fx('photo-exif6.jpg')).length },
		output: { name: art.name, bytes: art.bytes.length, width: m.width, height: m.height },
		assets: {
			original: rec.saveAsset('R-03', 'original', 'photo-exif6.jpg', fx('photo-exif6.jpg')),
			output: rec.saveAsset('R-03', 'output', art.name, art.bytes)
		}
	});
});

test('R-05: 21 MP giant decodes straight to maxDimension (fast path)', async ({ page, rec }) => {
	// 5600×3800 crosses the worker's 20 MP decode-time-downscale gate; the
	// output must be geometrically identical to the slow path and visually
	// within the browserResized tier (browser 'high' kernel vs lanczos ref).
	const input = readFileSync(fx('giant-photo.jpg'));
	await gotoTab(page, 'jpg');
	await upload(page, fx('giant-photo.jpg'));
	await setOutputFormat(page, 'JPG');
	await setMaxDimension(page, 1200);
	await compress(page);
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect([m.width, m.height], 'longest side 1200, aspect kept').toEqual([1200, 814]);
	const { ratio, diffPng, psnr } = await qualityMetrics(input, art.bytes);
	assertDiffBudget(ratio, DIFF_BUDGET.browserResized, 'R-05 browser-resized');
	assertFloor(psnr, PSNR_FLOOR.browserResized, 'R-05 browser-resized psnr');
	rec.record({
		id: 'R-05',
		settings: { tab: 'jpg', maxDimension: 1200, quality: 80 },
		input: { name: 'giant-photo.jpg', bytes: input.length, width: 5600, height: 3800 },
		output: { name: art.name, bytes: art.bytes.length, width: m.width, height: m.height },
		metrics: { diffRatio: Number(ratio.toFixed(5)), psnr: Number(psnr.toFixed(1)) },
		assets: {
			original: rec.saveAsset('R-05', 'original', 'giant-photo.jpg', fx('giant-photo.jpg')),
			output: rec.saveAsset('R-05', 'output', art.name, art.bytes),
			diff: rec.saveAsset('R-05', 'diff', 'diff.png', diffPng)
		}
	});
});

test('R-06: 21 MP giant with EXIF orientation 6 keeps oriented geometry', async ({ page, rec }) => {
	// Stored 5600×3800 + orientation 6 → displays 3800×5600; resize dims must
	// follow the ORIENTED image (portrait out), whichever decode path runs.
	// Structural asserts only, like R-03: qualityMetrics' reference doesn't
	// apply EXIF rotation, so a pixel diff would compare across a rotation.
	const input = readFileSync(fx('giant-exif6.jpg'));
	await gotoTab(page, 'jpg');
	await upload(page, fx('giant-exif6.jpg'));
	await setOutputFormat(page, 'JPG');
	await setMaxDimension(page, 1200);
	await compress(page);
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect([m.width, m.height], 'portrait after rotation, then scaled').toEqual([814, 1200]);
	rec.record({
		id: 'R-06',
		settings: { tab: 'jpg', maxDimension: 1200, quality: 80 },
		input: { name: 'giant-exif6.jpg', bytes: input.length, width: 5600, height: 3800 },
		output: { name: art.name, bytes: art.bytes.length, width: m.width, height: m.height },
		assets: {
			original: rec.saveAsset('R-06', 'original', 'giant-exif6.jpg', fx('giant-exif6.jpg')),
			output: rec.saveAsset('R-06', 'output', art.name, art.bytes)
		}
	});
});

test('R-04: animated gif resize keeps all frames', async ({ page, rec }) => {
	const meta = fxMeta<{ pages: number }>('anim-12f.gif');
	await gotoTab(page, 'gif');
	await upload(page, fx('anim-12f.gif'));
	await setMaxDimension(page, 180);
	const run = await compress(page);
	expect(run.warnings).toEqual([]);
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('gif');
	expect([m.width, m.height], 'gifsicle --resize-fit').toEqual([180, 120]);
	expect(m.pages, 'all frames survive the resize').toBe(meta.pages);
	rec.record({
		id: 'R-04',
		settings: { tab: 'gif', output: 'gif', maxDimension: 180, quality: 80 },
		input: {
			name: 'anim-12f.gif',
			bytes: readFileSync(fx('anim-12f.gif')).length,
			pages: meta.pages
		},
		output: {
			name: art.name,
			bytes: art.bytes.length,
			width: m.width,
			height: m.height,
			pages: m.pages
		},
		assets: {
			original: rec.saveAsset('R-04', 'original', 'anim-12f.gif', fx('anim-12f.gif')),
			output: rec.saveAsset('R-04', 'output', art.name, art.bytes)
		}
	});
});

test('R-07: 17000 px static image → WebP clamps to the 16383 cap and says so', async ({
	page,
	rec
}) => {
	// The animated path already clamped (AN-11); the static path used to die
	// with libwebp's bare "Encoding error." instead.
	test.slow(); // a 16383 px webp encode under parallel-suite load needs headroom
	await gotoTab(page, 'jpg');
	await upload(page, fx('wide-17000x260.jpg'));
	await setOutputFormat(page, 'WebP');
	const run = await compress(page, { timeout: 120_000 });
	expect(run.error).toBeNull();
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('webp');
	expect(m.width, 'clamped under the container cap').toBeLessThanOrEqual(16383);
	expect(m.width, 'barely shrunk, not thumbnailed').toBeGreaterThan(16000);
	await expect(page.getByTestId('row-info')).toContainText('16383');
	rec.record({
		id: 'R-07',
		settings: { tab: 'jpg', output: 'webp', quality: 80 },
		input: { name: 'wide-17000x260.jpg', bytes: readFileSync(fx('wide-17000x260.jpg')).length },
		output: { name: art.name, bytes: art.bytes.length, width: m.width, height: m.height },
		note: 'Used to hard-fail with a bare "Encoding error." from libwebp.'
	});
});

test('R-08: 17000 px opaque image on Auto keeps full resolution via JPG', async ({ page, rec }) => {
	// Auto used to encode the WebP candidate first and unconditionally — the
	// whole file failed even though JPG handles the size fine.
	await gotoTab(page, 'jpg');
	await upload(page, fx('wide-17000x260.jpg'));
	const run = await compress(page, { timeout: 120_000 });
	expect(run.error).toBeNull();
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect(m.format, 'WebP sat out — JPG carries full resolution').toBe('jpeg');
	expect([m.width, m.height], 'no silent downscale').toEqual([17000, 260]);
	rec.record({
		id: 'R-08',
		settings: { tab: 'jpg', output: 'auto', quality: 80 },
		input: { name: 'wide-17000x260.jpg', bytes: readFileSync(fx('wide-17000x260.jpg')).length },
		output: { name: art.name, bytes: art.bytes.length, width: m.width, height: m.height },
		note: 'Auto used to fail outright: the WebP candidate threw "Encoding error.".'
	});
});

test('R-09: 17000 px image WITH alpha on Auto clamps (WebP is the only carrier)', async ({
	page,
	rec
}) => {
	test.slow(); // clamped webp + avif candidates under parallel-suite load
	await gotoTab(page, 'png');
	await upload(page, fx('wide-alpha-17000x120.png'));
	const run = await compress(page, { timeout: 120_000 });
	expect(run.error).toBeNull();
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect(m.hasAlpha, 'alpha survives — JPG was never an option').toBe(true);
	expect(m.width, 'clamped to the WebP cap').toBe(16383);
	await expect(page.getByTestId('row-info')).toContainText('16383');
	rec.record({
		id: 'R-09',
		settings: { tab: 'png', output: 'auto', quality: 80 },
		input: {
			name: 'wide-alpha-17000x120.png',
			bytes: readFileSync(fx('wide-alpha-17000x120.png')).length
		},
		output: { name: art.name, bytes: art.bytes.length, width: m.width, height: m.height },
		note: 'Alpha + over-cap: the only alpha-capable candidate must clamp, not throw.'
	});
});
