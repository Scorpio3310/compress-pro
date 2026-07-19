/**
 * Real-file matrix — VIDEO family. Every routable real video (normal tier)
 * runs the q50/75/90 compress ladder with decode-back (mediabunny) + 3-frame
 * before/after rasters, plus its per-extension converter page, remove-audio on
 * the smallest clip with an audio track, video→GIF on the shortest clip and
 * GIF→MP4 on a real animated GIF. HEVC sources are expected to be refused by
 * the bundled Chromium (no HEVC decoder — V-13 precedent) and recorded as
 * honest skips, never hangs.
 *
 * Cell titles: `MX [video] <file> :: <action> @<level>` — grep one to re-run it.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '../fixtures';
import {
	compress,
	downloadRow,
	gotoPath,
	rasterizeVideoFramesViaFsInPage,
	setMaxDimension,
	setQuality,
	upload
} from '../helpers';
import { decodeRaw, imageMeta, videoInfo, type RawImage, type VideoFileInfo } from '../verify';
import { MatrixRecorder, timer } from './record';
import { realByFormat, type RealFile } from './walk';
import type { Page } from '@playwright/test';

test.describe.configure({ timeout: 300_000 });

if (process.env.E2E_PREVIEW) throw new Error('matrix specs need the dev server (rasterizers)');

const rec = new MatrixRecorder('video');
const QUALITIES = [50, 75, 90] as const;
const COMPRESS_TIMEOUT = 240_000;
/** Codecs the bundled Chromium can decode — an HEVC source makes the app show
 *  its guidance banner instead (no decoder in the test build). */
const DECODABLE = new Set(['avc', 'vp8', 'vp9', 'av1']);

const vids = realByFormat(['video']);
const gifs = realByFormat(['gif']);

/** Longest side ≤ 640, even dims, aspect preserved — the common framing BOTH
 *  sides of every comparison are drawn at (the browser's own sampler scales,
 *  per the drawSize upscale-comparison precedent). */
function drawSizeFor(w: number, h: number): { width: number; height: number } {
	const scale = Math.min(1, 640 / Math.max(w, h, 1));
	const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
	return { width: even(w), height: even(h) };
}

/** 10/50/90 % timestamps, clamped off the edges and DEDUPED — a re-seek to an
 *  identical currentTime never fires `seeked` (helpers contract). */
function sampleSecs(durationSec: number): number[] {
	const clamp = (t: number) => Math.min(Math.max(t, 0.05), Math.max(0.05, durationSec - 0.1));
	return [...new Set([0.1, 0.5, 0.9].map((p) => Number(clamp(durationSec * p).toFixed(3))))];
}

/** Presentation timestamps of the frames ACTUALLY drawn ('NaN' when the
 *  callback never fired) — the honest record of what each raster shows. */
const fmtTimes = (frames: { mediaTime: number }[]): string =>
	frames.map((f) => f.mediaTime.toFixed(3)).join(',');

/** compress() with the app's honest HEVC-refusal banner surfaced as a value
 *  (the bundled Chromium has no HEVC decoder) instead of a hard throw. */
async function runCompress(
	page: Page,
	timeout: number
): Promise<{ hevc: string | null; warnings: string[] }> {
	try {
		const run = await compress(page, { timeout });
		return { hevc: null, warnings: run.warnings };
	} catch (error) {
		const msg = String(error);
		if (/hevc/i.test(msg)) return { hevc: msg, warnings: [] };
		throw error;
	}
}

/** raw RGBA frame → png buffer for the raster savers. */
async function rawToPng(raw: RawImage): Promise<Buffer> {
	const sharp = (await import('sharp')).default;
	return sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 4 } })
		.png()
		.toBuffer();
}

// --- A) compress quality ladder --------------------------------------------

for (const f of vids) {
	test(`MX [video] ${f.rel} :: compress @q50-75-90`, async ({ page }) => {
		test.setTimeout(540_000); // three re-encodes of real footage + frame rasters
		const input = readFileSync(f.abs);
		let inInfo: VideoFileInfo;
		try {
			inInfo = await videoInfo(input); // input must parse before anything else
		} catch (error) {
			rec.cell({
				family: 'video',
				file: f.rel,
				tool: '/compress-video',
				action: 'compress',
				level: 'q50',
				status: 'error',
				inBytes: input.length,
				durationMs: 0,
				error: `input does not parse (mediabunny): ${String(error).slice(0, 400)}`
			});
			throw error;
		}
		const atSecs = sampleSecs(inInfo.durationSec);
		const drawSize = drawSizeFor(inInfo.width, inInfo.height);

		await gotoPath(page, '/compress-video');
		await upload(page, f.abs);

		// Input frames rasterize lazily after the FIRST successful compress — a
		// source the engine refuses (HEVC) would fail the <video> path too.
		let inFrames: { frame: Buffer; mediaTime: number }[] | null = null;
		const sizes: Record<string, number> = {};
		const failures: string[] = [];
		for (let qi = 0; qi < QUALITIES.length; qi++) {
			const q = QUALITIES[qi];
			const level = `q${q}`;
			const elapsed = timer();
			const id = rec.id(f.rel, 'compress', level);
			try {
				await setQuality(page, q);
				const run = await runCompress(page, COMPRESS_TIMEOUT);
				if (run.hevc) {
					for (const rest of QUALITIES.slice(qi)) {
						rec.cell({
							family: 'video',
							file: f.rel,
							tool: '/compress-video',
							action: 'compress',
							level: `q${rest}`,
							status: 'skip',
							inBytes: input.length,
							durationMs: elapsed(),
							notes: 'engine cannot decode HEVC — the app refused with its guidance banner',
							error: run.hevc.slice(0, 500)
						});
					}
					return;
				}
				const art = await downloadRow(page);
				const outInfo = await videoInfo(art.bytes); // decode-back: throws on garbage
				sizes[level] = art.bytes.length;
				const keptOriginal = art.bytes.length === input.length;

				if (outInfo.videoCodec !== 'avc')
					failures.push(`${level}: codec ${outInfo.videoCodec} != avc`);
				if (Math.abs(outInfo.durationSec - inInfo.durationSec) > 0.3)
					failures.push(
						`${level}: duration ${outInfo.durationSec.toFixed(2)} vs ${inInfo.durationSec.toFixed(2)}`
					);
				const rotated = inInfo.rotation % 180 !== 0 || outInfo.rotation % 180 !== 0;
				const dimsOk =
					(outInfo.width === inInfo.width && outInfo.height === inInfo.height) ||
					(rotated && outInfo.width === inInfo.height && outInfo.height === inInfo.width);
				if (!dimsOk)
					failures.push(
						`${level}: dims ${outInfo.width}x${outInfo.height} != ${inInfo.width}x${inInfo.height}`
					);

				inFrames ??= await rasterizeVideoFramesViaFsInPage(page, input, f.ext, atSecs, drawSize);
				const outFrames = await rasterizeVideoFramesViaFsInPage(
					page,
					art.bytes,
					'mp4',
					atSecs,
					drawSize
				);
				const rasters: string[] = [];
				if (inFrames && outFrames) {
					for (let i = 0; i < atSecs.length; i++) {
						rasters.push(
							await rec.saveSideBySide(
								id,
								`side-${i}-${atSecs[i].toFixed(1)}s.png`,
								inFrames[i].frame,
								outFrames[i].frame
							)
						);
					}
				}
				const notes: string[] = [];
				if (keptOriginal) notes.push('keep-original returned input bytes');
				else if (art.bytes.length > input.length)
					notes.push('output larger than input (re-encode of an efficient source)');
				if (level === 'q90' && sizes.q50 !== undefined && sizes.q50 > art.bytes.length)
					notes.push(`soft size ordering violated: q50 ${sizes.q50} > q90 ${art.bytes.length}`);
				if (run.warnings.length) notes.push(`warnings: ${run.warnings.join(' | ')}`);

				rec.cell({
					family: 'video',
					file: f.rel,
					tool: '/compress-video',
					action: 'compress',
					level,
					status: failures.some((x) => x.startsWith(`${level}:`)) ? 'fail' : 'pass',
					inBytes: input.length,
					outBytes: art.bytes.length,
					keptOriginal,
					metrics: {
						width: outInfo.width,
						height: outInfo.height,
						durationSec: Number(outInfo.durationSec.toFixed(2)),
						audioCodec: outInfo.audioCodec,
						sampleSecs: atSecs.join(','),
						inMediaTimes: inFrames ? fmtTimes(inFrames) : null,
						outMediaTimes: outFrames ? fmtTimes(outFrames) : null
					},
					durationMs: elapsed(),
					rasters,
					notes: notes.join('; ')
				});
			} catch (error) {
				rec.cell({
					family: 'video',
					file: f.rel,
					tool: '/compress-video',
					action: 'compress',
					level,
					status: 'error',
					inBytes: input.length,
					durationMs: elapsed(),
					error: String(error).slice(0, 500)
				});
				failures.push(`${level}: ${String(error).slice(0, 200)}`);
			}
		}
		expect(failures, failures.join(' | ')).toEqual([]);
	});
}

// --- B) converter landing pages by extension --------------------------------

const CONVERTERS: Record<string, { path: string; out: 'mp4' | 'webm' } | undefined> = {
	mov: { path: '/mov-to-mp4', out: 'mp4' },
	webm: { path: '/webm-to-mp4', out: 'mp4' },
	mp4: { path: '/mp4-to-webm', out: 'webm' }
};

for (const f of vids) {
	const conv = CONVERTERS[f.ext];
	if (!conv) continue;
	test(`MX [video] ${f.rel} :: to-${conv.out} @default`, async ({ page }) => {
		test.setTimeout(540_000); // software vp8/vp9 encodes of 4K sources are slow
		const input = readFileSync(f.abs);
		let inInfo: VideoFileInfo;
		try {
			inInfo = await videoInfo(input);
		} catch (error) {
			rec.cell({
				family: 'video',
				file: f.rel,
				tool: conv.path,
				action: `to-${conv.out}`,
				level: 'default',
				status: 'error',
				inBytes: input.length,
				durationMs: 0,
				error: `input does not parse (mediabunny): ${String(error).slice(0, 400)}`
			});
			throw error;
		}
		const elapsed = timer();
		const id = rec.id(f.rel, `to-${conv.out}`, 'default');
		try {
			await gotoPath(page, conv.path);
			await upload(page, f.abs);
			const run = await runCompress(page, COMPRESS_TIMEOUT);
			if (run.hevc) {
				rec.cell({
					family: 'video',
					file: f.rel,
					tool: conv.path,
					action: `to-${conv.out}`,
					level: 'default',
					status: 'skip',
					inBytes: input.length,
					durationMs: elapsed(),
					notes: 'engine cannot decode HEVC — the app refused with its guidance banner',
					error: run.hevc.slice(0, 500)
				});
				return;
			}
			const art = await downloadRow(page);
			const outInfo = await videoInfo(art.bytes); // decode-back: throws on garbage
			expect(art.name.endsWith(`.${conv.out}`), `name: ${art.name}`).toBe(true);
			if (conv.out === 'mp4') {
				expect(outInfo.videoCodec, 'mp4 output codec').toBe('avc');
				expect(outInfo.formatMime, 'container is really MP4').toContain('mp4');
			} else {
				expect(['vp8', 'vp9'], `webm codec ${outInfo.videoCodec}`).toContain(outInfo.videoCodec);
				expect(outInfo.formatMime, 'container is really WebM').toContain('webm');
			}
			expect(
				Math.abs(outInfo.durationSec - inInfo.durationSec),
				'duration preserved'
			).toBeLessThanOrEqual(0.3);

			const mid = Math.max(0.05, Number((inInfo.durationSec / 2).toFixed(3)));
			const drawSize = drawSizeFor(inInfo.width, inInfo.height);
			const [inF] =
				(await rasterizeVideoFramesViaFsInPage(page, input, f.ext, [mid], drawSize)) ?? [];
			const [outF] =
				(await rasterizeVideoFramesViaFsInPage(page, art.bytes, conv.out, [mid], drawSize)) ?? [];
			const rasters: string[] = [];
			if (inF && outF)
				rasters.push(await rec.saveSideBySide(id, 'side-mid.png', inF.frame, outF.frame));
			rec.cell({
				family: 'video',
				file: f.rel,
				tool: conv.path,
				action: `to-${conv.out}`,
				level: 'default',
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				keptOriginal: art.bytes.length === input.length,
				metrics: {
					outName: art.name,
					videoCodec: outInfo.videoCodec,
					audioCodec: outInfo.audioCodec,
					formatMime: outInfo.formatMime,
					durationSec: Number(outInfo.durationSec.toFixed(2)),
					midSec: mid,
					inMediaTime: inF ? inF.mediaTime.toFixed(3) : null,
					outMediaTime: outF ? outF.mediaTime.toFixed(3) : null
				},
				durationMs: elapsed(),
				rasters,
				notes: run.warnings.join(' | ')
			});
		} catch (error) {
			rec.cell({
				family: 'video',
				file: f.rel,
				tool: conv.path,
				action: `to-${conv.out}`,
				level: 'default',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}

// --- C) remove-audio on the smallest clip that HAS an audio track -----------

if (vids.length > 0) {
	test('MX [video] first-with-audio :: remove-audio @default', async ({ page }) => {
		test.setTimeout(540_000);
		// Runtime probe (mediabunny parses in node): smallest decodable clip with
		// an actual audio track — synthetic silence isn't the point here.
		let pick: { f: RealFile; input: Buffer; info: VideoFileInfo } | null = null;
		for (const f of [...vids].sort((a, b) => a.bytes - b.bytes)) {
			const input = readFileSync(f.abs);
			const info = await videoInfo(input).catch(() => null);
			if (info && info.audioCodec !== null && DECODABLE.has(info.videoCodec ?? '')) {
				pick = { f, input, info };
				break;
			}
		}
		test.skip(!pick, 'no real video with an audio track (decodable codec)');
		const { f, input, info } = pick!;
		const elapsed = timer();
		try {
			await gotoPath(page, '/remove-audio-from-video');
			await upload(page, f.abs);
			await compress(page, { timeout: COMPRESS_TIMEOUT });
			const art = await downloadRow(page);
			const outInfo = await videoInfo(art.bytes);
			expect(outInfo.audioCodec, 'audio track removed').toBeNull();
			expect(outInfo.videoCodec, 'video track intact').toBeTruthy();
			expect([outInfo.width, outInfo.height]).toEqual([info.width, info.height]);
			// The input's CONTAINER duration = max(track durations); once the audio
			// track goes, the output legitimately equals the VIDEO track duration
			// (real webm sample: audio runs 0.49 s longer than video). Compare
			// against the video track, not the container.
			const { ALL_FORMATS, BufferSource, Input } = await import('mediabunny');
			const inputParsed = new Input({
				source: new BufferSource(new Uint8Array(input)),
				formats: ALL_FORMATS
			});
			const videoTrackDuration =
				await (await inputParsed.getPrimaryVideoTrack())!.computeDuration();
			expect(
				Math.abs(outInfo.durationSec - videoTrackDuration),
				'video-track duration preserved'
			).toBeLessThanOrEqual(0.3);
			rec.cell({
				family: 'video',
				file: f.rel,
				tool: '/remove-audio-from-video',
				action: 'remove-audio',
				level: 'default',
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				keptOriginal: art.bytes.length === input.length,
				metrics: {
					inAudioCodec: info.audioCodec,
					outTrackCount: outInfo.trackCount,
					videoCodec: outInfo.videoCodec,
					durationSec: Number(outInfo.durationSec.toFixed(2))
				},
				durationMs: elapsed()
			});
		} catch (error) {
			rec.cell({
				family: 'video',
				file: f.rel,
				tool: '/remove-audio-from-video',
				action: 'remove-audio',
				level: 'default',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}

// --- D) video → GIF on the shortest clip ------------------------------------

if (vids.length > 0) {
	test('MX [video] shortest :: to-gif @480px', async ({ page }) => {
		test.setTimeout(540_000);
		// Runtime probe: the shortest decodable clip; > 15 s → honest skip (the
		// GIF framecount and encode time explode).
		let pick: { f: RealFile; input: Buffer; info: VideoFileInfo } | null = null;
		for (const f of vids) {
			const input = readFileSync(f.abs);
			const info = await videoInfo(input).catch(() => null);
			if (!info || !DECODABLE.has(info.videoCodec ?? '')) continue;
			if (!pick || info.durationSec < pick.info.durationSec) pick = { f, input, info };
		}
		test.skip(!pick, 'no decodable real video');
		const { f, input, info } = pick!;
		if (info.durationSec > 15) {
			rec.cell({
				family: 'video',
				file: f.rel,
				tool: '/video-to-gif',
				action: 'to-gif',
				level: '480px',
				status: 'skip',
				inBytes: input.length,
				durationMs: 0,
				notes: `shortest real video is ${info.durationSec.toFixed(1)} s (> 15 s) — GIF framecount would explode`
			});
			return;
		}
		const elapsed = timer();
		const id = rec.id(f.rel, 'to-gif', '480px');
		try {
			await gotoPath(page, '/video-to-gif');
			await upload(page, f.abs);
			await setMaxDimension(page, 480); // keeps a 4K-source GIF encode sane
			await compress(page, { timeout: COMPRESS_TIMEOUT });
			const art = await downloadRow(page);
			const m = await imageMeta(art.bytes); // decode-back: throws on garbage
			expect(m.format).toBe('gif');
			expect(m.pages, 'a real animation, not a poster frame').toBeGreaterThan(5);
			const mid = Math.max(0.05, Number((info.durationSec / 2).toFixed(3)));
			const drawSize = drawSizeFor(info.width, info.height);
			const [inF] =
				(await rasterizeVideoFramesViaFsInPage(page, input, f.ext, [mid], drawSize)) ?? [];
			const gifMid = await rawToPng(await decodeRaw(art.bytes, Math.floor(m.pages / 2)));
			const rasters: string[] = [];
			if (inF) rasters.push(await rec.saveSideBySide(id, 'side-mid.png', inF.frame, gifMid));
			rec.cell({
				family: 'video',
				file: f.rel,
				tool: '/video-to-gif',
				action: 'to-gif',
				level: '480px',
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				metrics: {
					pages: m.pages,
					width: m.width,
					height: m.height,
					// GIF is an ancient format — outputs often EXCEED the video input.
					sizeExplosionRatio: Number((art.bytes.length / input.length).toFixed(2)),
					inMediaTime: inF ? inF.mediaTime.toFixed(3) : null
				},
				durationMs: elapsed(),
				rasters,
				notes:
					art.bytes.length > input.length
						? 'GIF output larger than the video input — expected for the format, recorded honestly'
						: ''
			});
		} catch (error) {
			rec.cell({
				family: 'video',
				file: f.rel,
				tool: '/video-to-gif',
				action: 'to-gif',
				level: '480px',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}

// --- E) real animated GIF → MP4 ---------------------------------------------

if (gifs.length > 0) {
	test('MX [video] animated-gif :: gif-to-mp4 @default', async ({ page }) => {
		// Runtime probe: first real GIF that is actually animated (files with a
		// .gif extension route to the gif tab, hence realByFormat(['gif'])).
		let pick: { f: RealFile; input: Buffer; pages: number; delay: number[] } | null = null;
		for (const f of gifs) {
			const input = readFileSync(f.abs);
			const m = await imageMeta(input).catch(() => null);
			if (m && m.pages > 1) {
				pick = { f, input, pages: m.pages, delay: m.delay ?? [] };
				break;
			}
		}
		test.skip(!pick, 'no animated real GIF');
		const { f, input, pages, delay } = pick!;
		const expectedSec = delay.reduce((a, b) => a + b, 0) / 1000;
		const elapsed = timer();
		const id = rec.id(f.rel, 'gif-to-mp4', 'default');
		try {
			await gotoPath(page, '/gif-to-mp4');
			await upload(page, f.abs);
			await compress(page, { timeout: COMPRESS_TIMEOUT });
			const art = await downloadRow(page);
			const outInfo = await videoInfo(art.bytes); // parses: a real video came out
			expect(outInfo.videoCodec).toBe('avc');
			expect(outInfo.audioCodec, 'GIFs carry no audio').toBeNull();
			const mid = Math.max(0.05, Number((outInfo.durationSec / 2).toFixed(3)));
			const drawSize = drawSizeFor(outInfo.width, outInfo.height);
			const gifMid = await rawToPng(await decodeRaw(input, Math.floor(pages / 2)));
			const [outF] =
				(await rasterizeVideoFramesViaFsInPage(page, art.bytes, 'mp4', [mid], drawSize)) ?? [];
			const rasters: string[] = [];
			if (outF) rasters.push(await rec.saveSideBySide(id, 'side-mid.png', gifMid, outF.frame));
			const durationDelta = Math.abs(outInfo.durationSec - expectedSec);
			rec.cell({
				family: 'video',
				file: f.rel,
				tool: '/gif-to-mp4',
				action: 'gif-to-mp4',
				level: 'default',
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				metrics: {
					gifPages: pages,
					// Soft record: mp4 duration vs the GIF delay sum — muxers round.
					expectedSec: Number(expectedSec.toFixed(2)),
					durationSec: Number(outInfo.durationSec.toFixed(2)),
					durationDeltaSec: Number(durationDelta.toFixed(2)),
					width: outInfo.width,
					height: outInfo.height,
					outMediaTime: outF ? outF.mediaTime.toFixed(3) : null
				},
				durationMs: elapsed(),
				rasters,
				notes:
					durationDelta > 0.5
						? `duration drifted ${durationDelta.toFixed(2)} s from the GIF delay sum (soft)`
						: ''
			});
		} catch (error) {
			rec.cell({
				family: 'video',
				file: f.rel,
				tool: '/gif-to-mp4',
				action: 'gif-to-mp4',
				level: 'default',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}
