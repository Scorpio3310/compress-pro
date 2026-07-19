/**
 * KM-01…09: the "Keep metadata" toggle — EXIF carried over into re-encoded
 * JPG/PNG/WebP outputs (orientation neutralized, thumbnail dropped, ICC
 * never copied), silent skip where the container can't hold it (AVIF), and
 * for RAW inputs REBUILT from LibRaw metadata (exif-build, O-03).
 */
import { readFileSync } from 'node:fs';
import { readExifSummary } from '../../src/lib/codecs/exif-parse';
import { expect, fx, fxMeta, realFile, test } from '../fixtures';
import {
	compress,
	downloadRow,
	gotoTab,
	setOutputFormat,
	setTargetKb,
	toggle,
	upload
} from '../helpers';
import { decodeRaw, exifMeta, imageMeta, pixelAt } from '../verify';

test('KM-01: jpg → jpg keeps EXIF (camera, date, GPS) @smoke', async ({ page, rec }) => {
	const meta = fxMeta<{ gps: { lat: number; lon: number }; make: string }>('exif-gps.jpg');
	await gotoTab(page, 'jpg');
	await upload(page, fx('exif-gps.jpg'));
	await setOutputFormat(page, 'JPG');
	await toggle(page, 'Keep metadata', true);
	await compress(page);
	await expect(page.getByTestId('row-info')).toHaveText(/Metadata kept/);
	const art = await downloadRow(page);
	const m = await exifMeta(art.bytes);
	expect(m.exif, 'EXIF present in the re-encoded output').not.toBeNull();
	const summary = readExifSummary(new Uint8Array(m.exif!));
	expect(summary.make).toBe(meta.make);
	expect(summary.gps?.lat).toBeCloseTo(meta.gps.lat, 3);
	expect(summary.gps?.lon).toBeCloseTo(meta.gps.lon, 3);
	expect(m.icc, 'ICC must NOT be copied').toBeNull();
	rec.record({
		id: 'KM-01',
		settings: { tab: 'jpg', output: 'jpg', quality: 80, keepMetadata: true },
		input: { name: 'exif-gps.jpg', bytes: readFileSync(fx('exif-gps.jpg')).length },
		output: { name: art.name, bytes: art.bytes.length },
		assets: {
			original: rec.saveAsset('KM-01', 'original', 'exif-gps.jpg', fx('exif-gps.jpg')),
			output: rec.saveAsset('KM-01', 'output', art.name, art.bytes)
		}
	});
});

test('KM-02: toggle off (default) strips EXIF as before', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('exif-gps.jpg'));
	await setOutputFormat(page, 'JPG');
	await compress(page);
	const art = await downloadRow(page);
	const m = await exifMeta(art.bytes);
	expect(m.exif, 'default output carries no EXIF').toBeNull();
});

test('KM-03: EXIF-rotated source stays upright — orientation re-set to 1', async ({ page }) => {
	// photo-exif6.jpg: stored 900×600 + orientation 6 → decodes upright
	// 600×900. The kept EXIF must say orientation 1 or the image would
	// double-rotate in viewers.
	await gotoTab(page, 'jpg');
	await upload(page, fx('photo-exif6.jpg'));
	await setOutputFormat(page, 'JPG');
	await toggle(page, 'Keep metadata', true);
	await compress(page);
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect([m.width, m.height], 'pixels upright').toEqual([600, 900]);
	const exif = await exifMeta(art.bytes);
	expect(exif.exif).not.toBeNull();
	expect(exif.orientation ?? 1, 'orientation tag neutralized').toBe(1);
	const raw = await decodeRaw(art.bytes);
	const [r, g, b] = pixelAt(raw, 50, 50); // red marker square, display space
	expect(r, 'marker stays visual top-left').toBeGreaterThan(150);
	expect(g).toBeLessThan(110);
	expect(b).toBeLessThan(110);
});

test('KM-04: PNG output carries the eXIf chunk', async ({ page }) => {
	// text-exif.png has eXIf (Canon, orientation 6) — output must keep the
	// camera info with orientation neutralized.
	await gotoTab(page, 'png');
	await upload(page, fx('text-exif.png'));
	await setOutputFormat(page, 'PNG');
	await toggle(page, 'Keep metadata', true);
	await compress(page);
	await expect(page.getByTestId('row-info')).toHaveText(/Metadata kept/);
	const art = await downloadRow(page);
	const m = await exifMeta(art.bytes);
	expect(m.exif).not.toBeNull();
	const summary = readExifSummary(new Uint8Array(m.exif!));
	expect(summary.make).toBe('Canon');
	expect(summary.orientation).toBe(1);
});

test('KM-05: WebP output builds VP8X and carries the EXIF chunk', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('exif-gps.jpg'));
	await setOutputFormat(page, 'WebP');
	await toggle(page, 'Keep metadata', true);
	await compress(page);
	await expect(page.getByTestId('row-info')).toHaveText(/Metadata kept/);
	const art = await downloadRow(page);
	// Structural: extended WebP with the EXIF flag bit.
	expect(art.bytes.subarray(12, 16).toString('latin1')).toBe('VP8X');
	expect(art.bytes[20] & 0x08, 'VP8X EXIF flag').toBe(0x08);
	const m = await exifMeta(art.bytes);
	expect(m.exif).not.toBeNull();
	expect(readExifSummary(new Uint8Array(m.exif!)).make).toBe('Apple');
});

test('KM-06: AVIF output skips metadata silently (no note, no EXIF)', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('exif-gps.jpg'));
	await setOutputFormat(page, 'AVIF');
	await toggle(page, 'Keep metadata', true);
	await compress(page);
	await expect(page.getByTestId('row-info')).toHaveCount(0);
	const art = await downloadRow(page);
	expect(art.name.endsWith('.avif')).toBe(true);
});

test('KM-07: target mode reserves room — fits under target WITH the EXIF', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('exif-gps.jpg'));
	await setOutputFormat(page, 'JPG');
	await setTargetKb(page, 100);
	await toggle(page, 'Keep metadata', true);
	await compress(page);
	const art = await downloadRow(page);
	expect(art.bytes.length, 'still under the 100 KB target after splice').toBeLessThanOrEqual(
		100_000
	);
	const m = await exifMeta(art.bytes);
	expect(m.exif).not.toBeNull();
	expect(readExifSummary(new Uint8Array(m.exif!)).make).toBe('Apple');
});

test('KM-08: real HEIC → JPG carries its EXIF when the source has any', async ({ page }) => {
	const src = realFile(/\.heic$/i);
	test.skip(!src, 'drop a real .heic into tests/fixtures/real');
	await gotoTab(page, 'heic');
	await upload(page, src!);
	await setOutputFormat(page, 'JPG');
	await toggle(page, 'Keep metadata', true);
	await compress(page);
	const art = await downloadRow(page);
	const kept = await page.getByTestId('row-info').filter({ hasText: 'Metadata kept' }).count();
	const m = await exifMeta(art.bytes);
	if (kept > 0) {
		expect(m.exif, 'note shown → EXIF must really be there').not.toBeNull();
		expect(readExifSummary(new Uint8Array(m.exif!)).orientation ?? 1).toBe(1);
	} else {
		expect(m.exif, 'no note → no EXIF (source had none)').toBeNull();
	}
});

test('KM-09: RAW → JPG rebuilds EXIF from LibRaw metadata (O-03)', async ({ page }) => {
	// Real camera file required: the generated photo.dng carries only
	// UniqueCameraModel, no Make/ISO — nothing to rebuild or assert.
	const dng = realFile(/^sample1\.dng$/i);
	test.skip(!dng, 'real RAW fixture not present');
	await gotoTab(page, 'jpg');
	await upload(page, dng!);
	await setOutputFormat(page, 'JPG');
	await toggle(page, 'Keep metadata', true);
	await compress(page, { timeout: 240_000 });
	await expect(page.getByTestId('row-info')).toHaveText(/Metadata kept/);
	const art = await downloadRow(page);
	const m = await exifMeta(art.bytes);
	expect(m.exif, 'rebuilt EXIF present in the developed JPG').not.toBeNull();
	const summary = readExifSummary(new Uint8Array(m.exif!));
	expect(summary.make).toMatch(/canon/i); // sample1.dng = Canon EOS 350D
	expect(summary.model).toMatch(/eos/i);
	// LibRaw pixels are pre-rotated — a copied RAW flip would double-rotate.
	expect(summary.orientation).toBe(1);
	expect(summary.iso, 'ISO rides the Exif sub-IFD').not.toBeNull();
});
