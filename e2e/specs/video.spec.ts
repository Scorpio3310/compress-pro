/**
 * V-01…29: the video tab — container round-trips (incl. MOV in AND out),
 * target size with one corrective pass, resize/fps caps, smart audio copy,
 * cancel + worker recovery, rotation, real iPhone HDR (skip-if-absent),
 * persistence, drop-routing and band-color visual proofs.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { assertFloor, expect, fx, fxVideo, realFile, test, videoFixtures } from '../fixtures';
import {
	MJPEG_LOWRATE_NAME,
	MJPEG_LOWRATE_SPEC,
	MJPEG_NAME,
	MJPEG_ROT90_COLORS,
	MJPEG_ROT90_NAME,
	MJPEG_SPEC
} from '../mjpeg-fixture';
import {
	compress,
	downloadRow,
	dropFiles,
	gotoTab,
	rasterizeVideoFrameInPage,
	rasterizeVideoFramesInPage,
	rows,
	setContainer,
	setFps,
	setMaxDimension,
	setQuality,
	setTargetMb,
	toggle,
	upload
} from '../helpers';
import { VIDEO_QUALITY } from '../thresholds';
import { imageMeta, pixelAt, decodeRaw, psnr, stitchHorizontal, videoInfo } from '../verify';
import type { Page } from '@playwright/test';

/** Sample (250,200) — below the moving square's band, away from the counter —
 *  and expect the per-second band color within VIDEO_QUALITY.bandTolerance. */
async function expectBandColor(
	page: Page,
	bytes: Buffer,
	mimeType: string,
	atSec: number,
	expected: [number, number, number],
	label: string
): Promise<Buffer> {
	const frame = await rasterizeVideoFrameInPage(page, bytes, mimeType, atSec);
	const raw = await decodeRaw(frame);
	const [r, g, b] = pixelAt(raw, 250, 200);
	const [er, eg, eb] = expected;
	const tol = VIDEO_QUALITY.bandTolerance;
	expect(Math.abs(r - er), `${label} red ${r} vs ${er}`).toBeLessThanOrEqual(tol);
	expect(Math.abs(g - eg), `${label} green ${g} vs ${eg}`).toBeLessThanOrEqual(tol);
	expect(Math.abs(b - eb), `${label} blue ${b} vs ${eb}`).toBeLessThanOrEqual(tol);
	return frame;
}

type BandMeta = { bandColors: [number, number, number][] };

// One conversion at a time (worker pool cap 1) — generous per-test room.
test.describe.configure({ timeout: 120_000 });

test('V-01: mp4 → mp4 quality 60 shrinks, keeps duration and dims @smoke', async ({
	page,
	rec
}) => {
	const input = readFileSync(fxVideo('v-320x240-3s.mp4'));
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await setQuality(page, 60);
	const run = await compress(page);
	expect(run.warnings).toEqual([]);
	const art = await downloadRow(page);
	expect(art.name).toBe('v-320x240-3s.mp4');
	const info = await videoInfo(art.bytes);
	expect(info.videoCodec).toBe('avc');
	expect([info.width, info.height]).toEqual([320, 240]);
	expect(Math.abs(info.durationSec - 3)).toBeLessThanOrEqual(0.2);
	expect(art.bytes.length, 'q60 must shrink the 1.2 Mbps source').toBeLessThan(input.length);
	rec.record({
		id: 'V-01',
		settings: { tab: 'video', container: 'mp4', quality: 60 },
		input: { name: 'v-320x240-3s.mp4', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: {
			savingsPct: Number((((input.length - art.bytes.length) / input.length) * 100).toFixed(1))
		},
		assets: {
			original: rec.saveAsset('V-01', 'original', 'v-320x240-3s.mp4', fxVideo('v-320x240-3s.mp4')),
			output: rec.saveAsset('V-01', 'output', art.name, art.bytes)
		}
	});
});

test('V-02: mp4 → webm converts to vp9', async ({ page, rec }) => {
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await setContainer(page, 'webm');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('v-320x240-3s.webm');
	const info = await videoInfo(art.bytes);
	expect(['vp9', 'vp8']).toContain(info.videoCodec);
	expect(Math.abs(info.durationSec - 3)).toBeLessThanOrEqual(0.2);
	// Real pixel proof for the main cross-container path, not just headers.
	const meta = videoFixtures().files['v-320x240-3s.mp4'] as BandMeta;
	const frame = await expectBandColor(
		page,
		art.bytes,
		'video/webm',
		1.5,
		meta.bandColors[1],
		'V-02'
	);
	rec.record({
		id: 'V-02',
		settings: { tab: 'video', container: 'webm', quality: 75 },
		input: { name: 'v-320x240-3s.mp4', bytes: readFileSync(fxVideo('v-320x240-3s.mp4')).length },
		output: { name: art.name, bytes: art.bytes.length, format: info.videoCodec },
		assets: {
			output: rec.saveAsset('V-02', 'output', art.name, art.bytes),
			visual: rec.saveAsset('V-02', 'visual', 'frame-1.5s.png', frame)
		}
	});
});

test('V-03: webm → mp4 converts to avc', async ({ page, rec }) => {
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.webm'));
	await compress(page); // mp4 is the default container
	const art = await downloadRow(page);
	expect(art.name).toBe('v-320x240-3s.mp4');
	const info = await videoInfo(art.bytes);
	expect(info.videoCodec).toBe('avc');
	const meta = videoFixtures().files['v-320x240-3s.webm'] as BandMeta;
	const frame = await expectBandColor(
		page,
		art.bytes,
		'video/mp4',
		1.5,
		meta.bandColors[1],
		'V-03'
	);
	rec.record({
		id: 'V-03',
		settings: { tab: 'video', container: 'mp4', quality: 75 },
		input: { name: 'v-320x240-3s.webm', bytes: readFileSync(fxVideo('v-320x240-3s.webm')).length },
		output: { name: art.name, bytes: art.bytes.length, format: info.videoCodec },
		assets: {
			output: rec.saveAsset('V-03', 'output', art.name, art.bytes),
			visual: rec.saveAsset('V-03', 'visual', 'frame-1.5s.png', frame)
		}
	});
});

test('V-04: target 2 MB lands under the cap', async ({ page, rec }) => {
	const input = readFileSync(fxVideo('v-720p-10s.mp4'));
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-720p-10s.mp4'));
	await setTargetMb(page, 2);
	const run = await compress(page, { timeout: 90_000 });
	expect(run.warnings, 'reachable target must not warn').toEqual([]);
	const art = await downloadRow(page);
	expect(art.bytes.length, 'fits under 2 MB (one corrective pass allowed)').toBeLessThanOrEqual(
		2_000_000
	);
	expect((await videoInfo(art.bytes)).videoCodec).toBe('avc');
	rec.record({
		id: 'V-04',
		settings: { tab: 'video', container: 'mp4', mode: 'target', targetMb: 2 },
		input: { name: 'v-720p-10s.mp4', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { targetBytes: 2_000_000, fits: art.bytes.length <= 2_000_000 },
		assets: { output: rec.saveAsset('V-04', 'output', art.name, art.bytes) }
	});
});

test('V-05: unreachable 0.1 MB target warns and returns the smallest attempt', async ({
	page,
	rec
}) => {
	const input = readFileSync(fxVideo('v-720p-10s.mp4'));
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-720p-10s.mp4'));
	await setTargetMb(page, 0.1);
	const run = await compress(page, { timeout: 90_000 });
	expect(run.warnings.join('\n')).toMatch(/not reachable/i);
	const art = await downloadRow(page);
	// Hardware encoders have a quality floor — on full-noise 720p they overshoot
	// tiny bitrate requests hard, so "smallest" only guarantees < input here.
	expect(art.bytes.length, 'smallest attempt still beats the input').toBeLessThan(input.length);
	rec.record({
		id: 'V-05',
		settings: { tab: 'video', container: 'mp4', mode: 'target', targetMb: 0.1 },
		input: { name: 'v-720p-10s.mp4', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		warnings: run.warnings,
		assets: { output: rec.saveAsset('V-05', 'output', art.name, art.bytes) }
	});
});

test('V-06: maxDimension 160 downscales to even 160×120', async ({ page, rec }) => {
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await setMaxDimension(page, 160);
	await compress(page);
	const art = await downloadRow(page);
	const info = await videoInfo(art.bytes);
	expect([info.width, info.height]).toEqual([160, 120]);
	rec.record({
		id: 'V-06',
		settings: { tab: 'video', container: 'mp4', maxDimension: 160 },
		input: { name: 'v-320x240-3s.mp4', bytes: readFileSync(fxVideo('v-320x240-3s.mp4')).length },
		output: { name: art.name, bytes: art.bytes.length, width: info.width, height: info.height },
		assets: { output: rec.saveAsset('V-06', 'output', art.name, art.bytes) }
	});
});

test('V-07: 60 fps source capped to 30 fps, duration unchanged', async ({ page, rec }) => {
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-60fps-2s.mp4'));
	await setFps(page, 30);
	await compress(page);
	const art = await downloadRow(page);
	const info = await videoInfo(art.bytes);
	expect(info.frameRate, 'packet rate ≈ capped fps').not.toBeNull();
	expect(Math.abs((info.frameRate ?? 0) - 30)).toBeLessThanOrEqual(2);
	expect(Math.abs(info.durationSec - 2)).toBeLessThanOrEqual(0.2);
	rec.record({
		id: 'V-07',
		settings: { tab: 'video', container: 'mp4', fps: 30 },
		input: { name: 'v-60fps-2s.mp4', bytes: readFileSync(fxVideo('v-60fps-2s.mp4')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { frameRate: Number((info.frameRate ?? 0).toFixed(1)) },
		assets: { output: rec.saveAsset('V-07', 'output', art.name, art.bytes) }
	});
});

test('V-08: Remove audio drops the track', async ({ page, rec }) => {
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-audio-3s.mp4'));
	await toggle(page, 'Remove audio', true);
	await compress(page);
	const art = await downloadRow(page);
	const info = await videoInfo(art.bytes);
	expect(info.audioCodec).toBeNull();
	expect(info.trackCount).toBe(1);
	rec.record({
		id: 'V-08',
		settings: { tab: 'video', container: 'mp4', removeAudio: true },
		input: { name: 'v-audio-3s.mp4', bytes: readFileSync(fxVideo('v-audio-3s.mp4')).length },
		output: { name: art.name, bytes: art.bytes.length },
		assets: { output: rec.saveAsset('V-08', 'output', art.name, art.bytes) }
	});
});

test('V-09: opus audio in an MP4 run becomes AAC (Safari compat)', async ({ page, rec }) => {
	// Fixture audio is Opus. Opus-in-MP4 won't play in Safari/QuickTime, so the
	// app re-encodes to AAC — unconditionally: the probe registers the wasm
	// AAC fallback where the engine has no native encoder, so the old
	// capability branch (kept-as-opus + warning) is dead on every engine.
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-audio-3s.mp4'));
	const run = await compress(page);
	const art = await downloadRow(page);
	const info = await videoInfo(art.bytes);
	expect(info.audioCodec, 're-encoded for compatibility').toBe('aac');
	expect(run.warnings).toHaveLength(0);
	expect(info.trackCount).toBe(2);
	rec.record({
		id: 'V-09',
		settings: { tab: 'video', container: 'mp4', audio: 'opus→aac' },
		input: { name: 'v-audio-3s.mp4', bytes: readFileSync(fxVideo('v-audio-3s.mp4')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { audioCodec: info.audioCodec ?? '' },
		assets: { output: rec.saveAsset('V-09', 'output', art.name, art.bytes) }
	});
});

test('V-10: cancel recovers and the next conversion succeeds', async ({ page }) => {
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-720p-10s.mp4'));
	const cta = page.getByTestId('compress-cta');
	await cta.click();
	// Cancel as soon as the run registers (the Cancel button appears with it).
	const cancelBtn = page.getByRole('button', { name: 'Cancel', exact: true });
	if (await cancelBtn.isVisible().catch(() => false)) {
		await cancelBtn.click();
	}
	await expect(cta).toBeEnabled({ timeout: 60_000 });
	await expect(page.getByTestId('error-banner')).toHaveCount(0);

	// Worker was terminated — a fresh conversion in the SAME page must succeed
	// (worker respawn + hardware encoder session recovery).
	await page.getByLabel('Remove v-720p-10s.mp4').click();
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await compress(page);
	const art = await downloadRow(page);
	expect((await videoInfo(art.bytes)).videoCodec).toBe('avc');
});

test('V-11: corrupt mp4 shows the error banner and recovers', async ({ page, rec }) => {
	await gotoTab(page, 'video');
	await upload(page, fxVideo('corrupt.mp4'));
	const run = await compress(page, { expectError: true });
	expect(run.error).toBeTruthy();
	await expect(page.getByTestId('compress-cta')).toBeEnabled();
	rec.record({
		id: 'V-11',
		settings: { tab: 'video' },
		input: { name: 'corrupt.mp4', bytes: 512 },
		error: run.error,
		metrics: {}
	});
});

test('V-12: rotation metadata survives as portrait output', async ({ page, rec }) => {
	test.skip(!videoFixtures().files['v-rotated-90.mp4'], 'rotated fixture unavailable');
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-rotated-90.mp4'));
	await compress(page);
	const art = await downloadRow(page);
	const info = await videoInfo(art.bytes);
	const portrait = info.height > info.width || info.rotation === 90 || info.rotation === 270;
	expect(portrait, `dims ${info.width}×${info.height}, rotation ${info.rotation}`).toBe(true);
	rec.record({
		id: 'V-12',
		settings: { tab: 'video', container: 'mp4' },
		input: { name: 'v-rotated-90.mp4', bytes: readFileSync(fxVideo('v-rotated-90.mp4')).length },
		output: { name: art.name, bytes: art.bytes.length, width: info.width, height: info.height },
		metrics: { rotation: info.rotation },
		assets: { output: rec.saveAsset('V-12', 'output', art.name, art.bytes) }
	});
});

test('V-13: real iPhone HEVC clip converts with an HDR warning — or explains the decode gap', async ({
	page,
	rec
}) => {
	// Matches the legacy iphone-hdr.mov name AND the IMG_*.MOV capture
	// convention — iPhones record HEVC + HLG (BT.2020) by default since the
	// 12. TWO correct outcomes, engine-dependent: branded Chrome decodes HEVC
	// → convert + HDR warning; the bundled test Chromium has NO HEVC decoder
	// → the app must refuse with its guiding message, never a raw error.
	// (APAC spatial audio is undecodable either way → extra warning is fine.)
	const real = realFile(/(hdr|img_)\S*\.mov$/i);
	test.skip(!real, 'drop a real iPhone .mov (IMG_*.MOV) into tests/fixtures/real/ to enable');
	test.setTimeout(240_000);
	await gotoTab(page, 'video');
	await upload(page, real!);
	const cta = page.getByTestId('compress-cta');
	await expect(cta).toBeEnabled();
	await cta.click();
	const banner = page.getByTestId('error-banner');
	const download = rows(page).getByRole('button', { name: 'Download' }).first();
	const outcome = await Promise.race([
		banner.waitFor({ state: 'visible', timeout: 200_000 }).then(() => 'banner' as const),
		download.waitFor({ state: 'visible', timeout: 200_000 }).then(() => 'download' as const)
	]);

	if (outcome === 'banner') {
		await expect(banner, 'guiding message, not a raw failure').toHaveText(/decode HEVC/i);
		await expect(banner).not.toHaveText(/exit code|undefined/i);
		rec.record({
			id: 'V-13',
			settings: { tab: 'video', container: 'mp4', realWorld: true },
			input: { name: basename(real!), bytes: readFileSync(real!).length },
			note: 'This engine has no HEVC decoder — the app refused with its guidance message.'
		});
		return;
	}

	await expect(cta).toBeEnabled({ timeout: 200_000 });
	const warnings = (await page.getByTestId('row-warning').allTextContents()).join('\n');
	expect(warnings).toMatch(/HDR/);
	const art = await downloadRow(page);
	const info = await videoInfo(art.bytes);
	expect(info.videoCodec).toBe('avc');
	rec.record({
		id: 'V-13',
		settings: { tab: 'video', container: 'mp4', realWorld: true },
		input: { name: basename(real!), bytes: readFileSync(real!).length },
		output: { name: art.name, bytes: art.bytes.length },
		warnings: warnings.split('\n'),
		assets: { output: rec.saveAsset('V-13', 'output', art.name, art.bytes) }
	});
});

test('V-14: container and target persist across reloads', async ({ page }) => {
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await setContainer(page, 'webm');
	await setTargetMb(page, 8);

	await page.reload();
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await expect(page.locator('button[data-seg="webm"]')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('button[data-seg="target"]')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('#target-size')).toHaveValue('8');
});

test('V-15: dropping an mp4 on the jpg tab routes to /compress-video', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await dropFiles(page, [{ path: fxVideo('v-320x240-3s.mp4'), mimeType: 'video/mp4' }]);
	await expect(page).toHaveURL(/\/compress-video$/);
	await expect(rows(page)).toHaveCount(1);
	await expect(page.getByTestId('error-banner')).toHaveCount(0);
});

test('V-16: output frames show the correct band color at 3 timestamps', async ({ page, rec }) => {
	const meta = videoFixtures().files['v-320x240-3s.mp4'] as BandMeta;
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await compress(page);
	const art = await downloadRow(page);

	// x.5-second samples: second N → bandColors[N]. Three timestamps prove
	// seek correctness and temporal integrity, not just one lucky frame.
	const atSecs = [0.5, 1.5, 2.5];
	const frames = await rasterizeVideoFramesInPage(page, art.bytes, 'video/mp4', atSecs);
	const sampled: string[] = [];
	for (let i = 0; i < atSecs.length; i++) {
		const raw = await decodeRaw(frames[i]);
		const [r, g, b] = pixelAt(raw, 250, 200);
		const [er, eg, eb] = meta.bandColors[i];
		const tol = VIDEO_QUALITY.bandTolerance;
		expect(Math.abs(r - er), `t=${atSecs[i]} red ${r} vs ${er}`).toBeLessThanOrEqual(tol);
		expect(Math.abs(g - eg), `t=${atSecs[i]} green ${g} vs ${eg}`).toBeLessThanOrEqual(tol);
		expect(Math.abs(b - eb), `t=${atSecs[i]} blue ${b} vs ${eb}`).toBeLessThanOrEqual(tol);
		sampled.push(`${r},${g},${b}`);
	}
	rec.record({
		id: 'V-16',
		settings: { tab: 'video', container: 'mp4', quality: 75 },
		input: { name: 'v-320x240-3s.mp4', bytes: readFileSync(fxVideo('v-320x240-3s.mp4')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: {
			sampledRgb: sampled.join(' | '),
			expectedRgb: meta.bandColors
				.slice(0, 3)
				.map((c) => c.join(','))
				.join(' | ')
		},
		assets: {
			output: rec.saveAsset('V-16', 'output', art.name, art.bytes),
			visual: rec.saveAsset(
				'V-16',
				'visual',
				'frames-0.5-1.5-2.5s.png',
				await stitchHorizontal(frames)
			)
		}
	});
});

test('V-21: source-vs-output frame PSNR over the stable band region', async ({ page, rec }) => {
	const input = readFileSync(fxVideo('v-320x240-3s.mp4'));
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await compress(page); // q75 mp4 default
	const art = await downloadRow(page);

	// Same timestamp from source and output; crop to the band-only strip below
	// the travelling square (y 150-240) so a ±1-frame seek difference can't
	// move content — pure band pixels on both sides.
	const [srcFrame] = await rasterizeVideoFramesInPage(page, input, 'video/mp4', [1.5]);
	const [outFrame] = await rasterizeVideoFramesInPage(page, art.bytes, 'video/mp4', [1.5]);
	const region = { left: 0, top: 150, width: 320, height: 90 };
	const framePsnr = await psnr(srcFrame, outFrame, { region });
	assertFloor(framePsnr, VIDEO_QUALITY.psnrFloor, 'V-21 frame psnr');
	rec.record({
		id: 'V-21',
		title: 'source vs output frame PSNR @1.5s (band region)',
		settings: { tab: 'video', container: 'mp4', quality: 75 },
		input: { name: 'v-320x240-3s.mp4', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { framePsnr: Number(Math.min(framePsnr, 99).toFixed(1)) },
		assets: {
			output: rec.saveAsset('V-21', 'output', art.name, art.bytes),
			visual: rec.saveAsset(
				'V-21',
				'visual',
				'source-vs-output-1.5s.png',
				await stitchHorizontal([srcFrame, outFrame])
			)
		}
	});
});

test('V-22: mkv → mp4 converts and keeps the band content', async ({ page, rec }) => {
	test.skip(!videoFixtures().files['v-320x240-3s.mkv'], 'MkvOutputFormat unavailable here');
	const meta = videoFixtures().files['v-320x240-3s.mkv'] as BandMeta;
	const input = readFileSync(fxVideo('v-320x240-3s.mkv'));
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mkv'));
	await compress(page); // mp4 default — mkv → mp4 is always a container change
	const art = await downloadRow(page);
	expect(art.name).toBe('v-320x240-3s.mp4');
	const info = await videoInfo(art.bytes);
	expect(info.videoCodec).toBe('avc');
	expect([info.width, info.height]).toEqual([320, 240]);
	expect(Math.abs(info.durationSec - 3)).toBeLessThanOrEqual(0.2);
	const frame = await expectBandColor(
		page,
		art.bytes,
		'video/mp4',
		1.5,
		meta.bandColors[1],
		'V-22'
	);
	rec.record({
		id: 'V-22',
		title: 'mkv input converts (matroska demux)',
		settings: { tab: 'video', container: 'mp4', quality: 75 },
		input: { name: 'v-320x240-3s.mkv', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		assets: {
			output: rec.saveAsset('V-22', 'output', art.name, art.bytes),
			visual: rec.saveAsset('V-22', 'visual', 'frame-1.5s.png', frame)
		}
	});
});

test('V-24: Remove audio on a silent clip cannot defeat keep-original', async ({ page, rec }) => {
	// v-320x240-3s.mp4 has NO audio track — removing audio is a no-op, so the
	// q100 re-encode must lose to the untouched original (keep-original guard).
	const input = readFileSync(fxVideo('v-320x240-3s.mp4'));
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await toggle(page, 'Remove audio', true);
	await setQuality(page, 100);
	await compress(page);
	const art = await downloadRow(page);
	expect(
		art.bytes.length,
		'no-op removeAudio at q100 must keep the original, not ship a bigger re-encode'
	).toBeLessThanOrEqual(input.length);
	rec.record({
		id: 'V-24',
		title: 'removeAudio on an audio-less clip keeps the original',
		settings: { tab: 'video', container: 'mp4', quality: 100, removeAudio: true },
		input: { name: 'v-320x240-3s.mp4', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { keptOriginal: art.bytes.length === input.length }
	});
});

test('V-25: mov → mov quality 60 shrinks and stays QuickTime', async ({ page, rec }) => {
	const input = readFileSync(fxVideo('v-320x240-3s.mov'));
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mov'));
	await setContainer(page, 'mov');
	await setQuality(page, 60);
	const run = await compress(page);
	expect(run.warnings).toEqual([]);
	const art = await downloadRow(page);
	expect(art.name).toBe('v-320x240-3s.mov');
	const info = await videoInfo(art.bytes);
	expect(info.formatMime, 'output container is QuickTime, not renamed MP4').toBe('video/quicktime');
	expect(info.videoCodec).toBe('avc');
	expect([info.width, info.height]).toEqual([320, 240]);
	expect(Math.abs(info.durationSec - 3)).toBeLessThanOrEqual(0.2);
	expect(art.bytes.length, 'q60 must shrink the 1.2 Mbps source').toBeLessThan(input.length);
	rec.record({
		id: 'V-25',
		title: 'mov → mov compresses without leaving QuickTime',
		settings: { tab: 'video', container: 'mov', quality: 60 },
		input: { name: 'v-320x240-3s.mov', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: {
			savingsPct: Number((((input.length - art.bytes.length) / input.length) * 100).toFixed(1))
		},
		assets: {
			original: rec.saveAsset('V-25', 'original', 'v-320x240-3s.mov', fxVideo('v-320x240-3s.mov')),
			output: rec.saveAsset('V-25', 'output', art.name, art.bytes)
		}
	});
});

test('V-26: mp4 → mov converts with a .mov name and the band intact', async ({ page, rec }) => {
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await setContainer(page, 'mov');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('v-320x240-3s.mov');
	const info = await videoInfo(art.bytes);
	expect(info.formatMime).toBe('video/quicktime');
	expect(info.videoCodec).toBe('avc');
	// Real pixel proof for the new mux path — Chromium plays H.264-in-MOV.
	const meta = videoFixtures().files['v-320x240-3s.mp4'] as BandMeta;
	const frame = await expectBandColor(
		page,
		art.bytes,
		'video/quicktime',
		1.5,
		meta.bandColors[1],
		'V-26'
	);
	rec.record({
		id: 'V-26',
		settings: { tab: 'video', container: 'mov', quality: 75 },
		input: { name: 'v-320x240-3s.mp4', bytes: readFileSync(fxVideo('v-320x240-3s.mp4')).length },
		output: { name: art.name, bytes: art.bytes.length, format: info.videoCodec },
		assets: {
			output: rec.saveAsset('V-26', 'output', art.name, art.bytes),
			visual: rec.saveAsset('V-26', 'visual', 'frame-1.5s.png', frame)
		}
	});
});

test('V-27: mov → mov at q100 cannot beat keep-original', async ({ page, rec }) => {
	// sniffContainer must read .mov output as "same format" — a q100 re-encode
	// that loses to the source falls back to the untouched original bytes.
	const input = readFileSync(fxVideo('v-320x240-3s.mov'));
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mov'));
	await setContainer(page, 'mov');
	await setQuality(page, 100);
	await compress(page);
	const art = await downloadRow(page);
	expect(
		art.bytes.length,
		'mov → mov must never ship a bigger file than the source'
	).toBeLessThanOrEqual(input.length);
	rec.record({
		id: 'V-27',
		title: 'mov → mov q100 keeps the original when the re-encode loses',
		settings: { tab: 'video', container: 'mov', quality: 100 },
		input: { name: 'v-320x240-3s.mov', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { keptOriginal: art.bytes.length === input.length }
	});
});

test('V-28: opus audio in a MOV run becomes AAC (QuickTime compat)', async ({ page, rec }) => {
	// Same policy as V-09's MP4 case: Opus is spec-legal in ISOBMFF but
	// QuickTime won't play it, so the MOV path re-encodes to AAC — the wasm
	// fallback makes that unconditional on every engine (see V-09).
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-audio-3s.mp4'));
	await setContainer(page, 'mov');
	const run = await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('v-audio-3s.mov');
	const info = await videoInfo(art.bytes);
	expect(info.formatMime).toBe('video/quicktime');
	expect(info.audioCodec, 're-encoded for QuickTime compatibility').toBe('aac');
	expect(run.warnings).toHaveLength(0);
	expect(info.trackCount).toBe(2);
	rec.record({
		id: 'V-28',
		settings: { tab: 'video', container: 'mov', audio: 'opus→aac' },
		input: { name: 'v-audio-3s.mp4', bytes: readFileSync(fxVideo('v-audio-3s.mp4')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { audioCodec: info.audioCodec ?? '' },
		assets: { output: rec.saveAsset('V-28', 'output', art.name, art.bytes) }
	});
});

test('V-29: mov → mov source-vs-output frame PSNR (before/after proof)', async ({ page, rec }) => {
	const input = readFileSync(fxVideo('v-320x240-3s.mov'));
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mov'));
	await setContainer(page, 'mov');
	await compress(page); // q75 default

	const art = await downloadRow(page);
	// Same timestamp from source and compressed output, band-only strip (see
	// V-21) — proves the re-encoded QuickTime frames match the original ones.
	const [srcFrame] = await rasterizeVideoFramesInPage(page, input, 'video/quicktime', [1.5]);
	const [outFrame] = await rasterizeVideoFramesInPage(page, art.bytes, 'video/quicktime', [1.5]);
	const region = { left: 0, top: 150, width: 320, height: 90 };
	const framePsnr = await psnr(srcFrame, outFrame, { region });
	assertFloor(framePsnr, VIDEO_QUALITY.psnrFloor, 'V-29 frame psnr');
	rec.record({
		id: 'V-29',
		title: 'mov source vs compressed mov frame PSNR @1.5s (band region)',
		settings: { tab: 'video', container: 'mov', quality: 75 },
		input: { name: 'v-320x240-3s.mov', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { framePsnr: Number(Math.min(framePsnr, 99).toFixed(1)) },
		assets: {
			output: rec.saveAsset('V-29', 'output', art.name, art.bytes),
			visual: rec.saveAsset(
				'V-29',
				'visual',
				'source-vs-output-1.5s.png',
				await stitchHorizontal([srcFrame, outFrame])
			)
		}
	});
});

test('V-17: mp4 → GIF keeps dimensions, samples at the chosen fps', async ({ page, rec }) => {
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await setContainer(page, 'gif'); // fps snaps to 15
	const run = await compress(page, { timeout: 120_000 });
	expect(run.warnings, 'short clip → no size warning').toEqual([]);
	const art = await downloadRow(page);
	expect(art.name).toBe('v-320x240-3s.gif');
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('gif');
	expect([m.width, m.height]).toEqual([320, 240]);
	// ~3 s at 15 fps — allow slack for edge sampling.
	expect(m.pages).toBeGreaterThanOrEqual(40);
	expect(m.pages).toBeLessThanOrEqual(48);
	for (const d of m.delay ?? []) {
		expect(d, '1000/15 ≈ 67 ms, stored in centiseconds').toBeGreaterThanOrEqual(60);
		expect(d).toBeLessThanOrEqual(80);
	}
	rec.record({
		id: 'V-17',
		settings: { tab: 'video', container: 'gif', fps: 15 },
		input: { name: 'v-320x240-3s.mp4', bytes: readFileSync(fxVideo('v-320x240-3s.mp4')).length },
		output: { name: art.name, bytes: art.bytes.length, pages: m.pages },
		assets: { output: rec.saveAsset('V-17', 'output', art.name, art.bytes) }
	});
});

test('V-18: GIF → silent MP4 via /gif-to-mp4 (duration preserved)', async ({ page, rec }) => {
	const { gotoPath } = await import('../helpers');
	await gotoPath(page, '/gif-to-mp4');
	await expect(page).toHaveTitle(/GIF to MP4/);
	await upload(page, fx('anim-12f.gif')); // 12 × 80 ms ≈ 0.96 s
	await expect(page.locator('button[data-seg="mp4"]')).toHaveAttribute('aria-pressed', 'true');
	const run = await compress(page, { timeout: 120_000 });
	expect(run.warnings).toEqual([]);
	const art = await downloadRow(page);
	expect(art.name).toBe('anim-12f.mp4');
	const info = await videoInfo(art.bytes);
	expect(info.videoCodec).toBe('avc');
	expect(info.audioCodec, 'silent — GIFs carry no audio').toBeNull();
	expect(info.trackCount).toBe(1);
	expect(Math.abs(info.durationSec - 0.96), 'duration follows the GIF timing').toBeLessThanOrEqual(
		0.3
	);
	rec.record({
		id: 'V-18',
		settings: { tab: 'video', converter: '/gif-to-mp4', container: 'mp4' },
		input: { name: 'anim-12f.gif', bytes: readFileSync(fx('anim-12f.gif')).length, pages: 12 },
		output: { name: art.name, bytes: art.bytes.length, durationSec: info.durationSec },
		assets: { output: rec.saveAsset('V-18', 'output', art.name, art.bytes) }
	});
});

test('V-19: 10 s clip at 15 fps stays under the long-GIF warning threshold', async ({ page }) => {
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-720p-10s.mp4'));
	await setContainer(page, 'gif');
	await setMaxDimension(page, 320); // keep the encode quick
	const run = await compress(page, { timeout: 180_000 });
	// 150 frames — far below the 900-frame warning line.
	expect(run.warnings).toEqual([]);
});

test('V-20: /video-to-gif presets the GIF container and gif fps options', async ({ page }) => {
	const { gotoPath } = await import('../helpers');
	await gotoPath(page, '/video-to-gif');
	await expect(page).toHaveTitle(/Video to GIF/);
	await upload(page, fxVideo('v-320x240-3s.mp4'));
	await expect(page.locator('button[data-seg="gif"]')).toHaveAttribute('aria-pressed', 'true');
	// GIF mode swaps the fps options to the GIF-sensible set.
	await expect(page.locator('button[data-seg="15"]')).toBeVisible();
	await expect(page.locator('button[data-seg="original"]')).toHaveCount(0);
	// And hides audio + target controls (meaningless for GIF).
	await expect(page.getByLabel('Remove audio')).toHaveCount(0);
});

test('V-30: Motion-JPEG .mov → mp4 (mediabunny can’t decode it — frames re-encoded)', async ({
	page,
	rec
}) => {
	// The 'jpeg' sample entry gives mediabunny a null codec, so this used to fail
	// with "This browser can’t decode this video". convertMjpeg pulls the raw
	// JPEG frames instead and re-encodes to H.264, keeping the audio.
	const input = readFileSync(fxVideo(MJPEG_NAME));
	await gotoTab(page, 'video');
	await upload(page, fxVideo(MJPEG_NAME));
	await setContainer(page, 'mp4');
	const run = await compress(page);
	expect(run.error).toBeNull();
	expect(run.warnings).toEqual([]);
	const art = await downloadRow(page);
	expect(art.name).toBe('v-mjpeg-96x64.mp4');
	const info = await videoInfo(art.bytes);
	expect(info.videoCodec).toBe('avc');
	expect([info.width, info.height]).toEqual([MJPEG_SPEC.width, MJPEG_SPEC.height]);
	// PCM isn’t MP4-legal → transcoded to AAC, never silently dropped.
	expect(info.audioCodec, 'audio preserved as AAC').toBe('aac');
	expect(info.trackCount).toBe(2);
	expect(info.durationSec).toBeGreaterThan(1);
	expect(info.durationSec).toBeLessThan(1.6);
	rec.record({
		id: 'V-30',
		title: 'Motion-JPEG .mov re-encoded to H.264 mp4 (audio kept)',
		settings: { tab: 'video', container: 'mp4', source: 'mjpeg' },
		input: { name: MJPEG_NAME, bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { videoCodec: info.videoCodec ?? '', audioCodec: info.audioCodec ?? '' },
		assets: { output: rec.saveAsset('V-30', 'output', art.name, art.bytes) }
	});
});

test('V-31: Motion-JPEG .mov → webm downscaled, audio kept as Opus', async ({ page }) => {
	await gotoTab(page, 'video');
	await upload(page, fxVideo(MJPEG_NAME));
	await setContainer(page, 'webm');
	await setMaxDimension(page, 48);
	const run = await compress(page);
	expect(run.error).toBeNull();
	const art = await downloadRow(page);
	expect(art.name).toBe('v-mjpeg-96x64.webm');
	const info = await videoInfo(art.bytes);
	expect(['vp9', 'vp8']).toContain(info.videoCodec);
	// Longest side 96 → 48, aspect kept, even dims.
	expect([info.width, info.height]).toEqual([48, 32]);
	expect(info.audioCodec, 'PCM → Opus for WebM').toBe('opus');
	expect(info.trackCount).toBe(2);
});

test('V-32: rotated Motion-JPEG .mov bakes the 90° rotation instead of squashing', async ({
	page,
	rec
}) => {
	// tkhd matrix says 90° cw; source frames are top-red / bottom-blue, so the
	// correct portrait output has blue on the LEFT half and red on the RIGHT.
	// The old path stretched the unrotated frame into the swapped dims, which
	// kept red on top — every sampled quadrant flips when rotation is baked.
	await gotoTab(page, 'video');
	await upload(page, fxVideo(MJPEG_ROT90_NAME));
	await setContainer(page, 'mp4');
	const run = await compress(page);
	expect(run.error).toBeNull();
	const art = await downloadRow(page);
	const info = await videoInfo(art.bytes);
	expect([info.width, info.height], 'portrait display dims').toEqual([64, 96]);

	const frame = await rasterizeVideoFrameInPage(page, art.bytes, 'video/mp4', 0.6);
	const raw = await decodeRaw(frame);
	const tol = VIDEO_QUALITY.bandTolerance;
	const expectColor = (x: number, y: number, [er, eg, eb]: [number, number, number]) => {
		const [r, g, b] = pixelAt(raw, x, y);
		expect(Math.abs(r - er), `(${x},${y}) red ${r} vs ${er}`).toBeLessThanOrEqual(tol);
		expect(Math.abs(g - eg), `(${x},${y}) green ${g} vs ${eg}`).toBeLessThanOrEqual(tol);
		expect(Math.abs(b - eb), `(${x},${y}) blue ${b} vs ${eb}`).toBeLessThanOrEqual(tol);
	};
	// Left half = source bottom (blue), right half = source top (red).
	expectColor(16, 24, MJPEG_ROT90_COLORS.bottom);
	expectColor(16, 72, MJPEG_ROT90_COLORS.bottom);
	expectColor(48, 24, MJPEG_ROT90_COLORS.top);
	expectColor(48, 72, MJPEG_ROT90_COLORS.top);
	rec.record({
		id: 'V-32',
		title: 'rotated MJPEG .mov → mp4 bakes the tkhd rotation into the pixels',
		settings: { tab: 'video', container: 'mp4', source: 'mjpeg rot90' },
		input: { name: MJPEG_ROT90_NAME, bytes: readFileSync(fxVideo(MJPEG_ROT90_NAME)).length },
		output: { name: art.name, bytes: art.bytes.length, width: info.width, height: info.height },
		assets: {
			output: rec.saveAsset('V-32', 'output', art.name, art.bytes),
			visual: rec.saveAsset('V-32', 'visual', 'frame-0.6s.png', frame)
		}
	});
});

test('V-33: Motion-JPEG honors the fps cap (60 → 30)', async ({ page }) => {
	// The Conversion path caps fps for decodable codecs; the hand-rolled MJPEG
	// path must decimate by hand — it used to forward all frames silently.
	await gotoTab(page, 'video');
	await upload(page, fxVideo(MJPEG_LOWRATE_NAME));
	await setContainer(page, 'mp4');
	await setFps(page, 30);
	const run = await compress(page);
	expect(run.error).toBeNull();
	const art = await downloadRow(page);
	const info = await videoInfo(art.bytes);
	expect(info.frameRate, 'packet rate ≈ capped fps').not.toBeNull();
	expect(Math.abs((info.frameRate ?? 0) - 30), `rate ${info.frameRate}`).toBeLessThanOrEqual(3);
	const srcDuration = MJPEG_LOWRATE_SPEC.frames / MJPEG_LOWRATE_SPEC.fps;
	expect(Math.abs(info.durationSec - srcDuration)).toBeLessThanOrEqual(0.3);
});

test('V-34: Motion-JPEG with 8 kHz mono audio converts (resampled AAC, no HE-AAC error)', async ({
	page,
	rec
}) => {
	// ≤24 kHz sources map to HE-AAC codec strings (mp4a.40.5) no browser
	// encoder accepts — the worker must resample toward 48 kHz like the
	// Conversion path does, not die with the raw encoder-config message.
	await gotoTab(page, 'video');
	await upload(page, fxVideo(MJPEG_LOWRATE_NAME));
	await setContainer(page, 'mp4');
	const run = await compress(page);
	expect(run.error).toBeNull();
	expect(run.warnings).toEqual([]);
	const art = await downloadRow(page);
	const info = await videoInfo(art.bytes);
	expect(info.videoCodec).toBe('avc');
	expect(info.audioCodec, '8 kHz PCM → resampled AAC, never dropped or fatal').toBe('aac');
	expect(info.trackCount).toBe(2);
	rec.record({
		id: 'V-34',
		title: '8 kHz-audio MJPEG .mov → mp4 with resampled AAC',
		settings: { tab: 'video', container: 'mp4', source: 'mjpeg 8 kHz mono' },
		input: { name: MJPEG_LOWRATE_NAME, bytes: readFileSync(fxVideo(MJPEG_LOWRATE_NAME)).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { audioCodec: info.audioCodec ?? '' },
		assets: { output: rec.saveAsset('V-34', 'output', art.name, art.bytes) }
	});
});

test('V-35: Motion-JPEG .mov → GIF converts instead of blaming the browser', async ({
	page,
	rec
}) => {
	// toGif used to re-check canDecode() and throw "try Chrome" for a file the
	// app itself converts fine to MP4/WebM — the JPEG-frame branch fixes that.
	await gotoTab(page, 'video');
	await upload(page, fxVideo(MJPEG_NAME));
	await setContainer(page, 'gif'); // fps snaps to 15
	const run = await compress(page, { timeout: 120_000 });
	expect(run.error).toBeNull();
	const art = await downloadRow(page);
	expect(art.name).toBe('v-mjpeg-96x64.gif');
	const m = await imageMeta(art.bytes);
	expect(m.format).toBe('gif');
	expect([m.width, m.height]).toEqual([MJPEG_SPEC.width, MJPEG_SPEC.height]);
	// 1.2 s sampled at 15 fps — the same grid the decodable-codec path uses.
	expect(m.pages).toBeGreaterThanOrEqual(16);
	expect(m.pages).toBeLessThanOrEqual(19);
	rec.record({
		id: 'V-35',
		title: 'MJPEG → GIF via the JPEG-frame branch',
		settings: { tab: 'video', container: 'gif', source: 'mjpeg' },
		input: { name: MJPEG_NAME, bytes: readFileSync(fxVideo(MJPEG_NAME)).length },
		output: { name: art.name, bytes: art.bytes.length, pages: m.pages },
		assets: { output: rec.saveAsset('V-35', 'output', art.name, art.bytes) }
	});
});

test('V-36: 720p → GIF auto-caps the dimensions and says so', async ({ page }) => {
	// gifenc holds the whole GIF in memory — quantizing native 4K/1080p frames
	// is an OOM path, so sources above the GIF ceiling downscale with a warning.
	test.setTimeout(240_000);
	await gotoTab(page, 'video');
	await upload(page, fxVideo('v-720p-10s.mp4'));
	await setContainer(page, 'gif');
	await setFps(page, 5); // 50 frames — keeps the 800 px encode quick
	const run = await compress(page, { timeout: 220_000 });
	expect(run.error).toBeNull();
	expect(run.warnings.join('\n')).toMatch(/Downscaled to 800 px/);
	const art = await downloadRow(page);
	const m = await imageMeta(art.bytes);
	expect([m.width, m.height], 'longest side capped to 800').toEqual([800, 450]);
});
