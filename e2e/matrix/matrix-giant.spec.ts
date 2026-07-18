/**
 * Real-file matrix — GIANT tier (> 60 MB, walk.ts GIANT_BYTES). Opt-in and
 * strictly serial: set MATRIX_GIANT=1 and run with --workers 1 — one 400 MB
 * PDF through Ghostscript already owns the machine's memory. Every duration
 * is recorded faithfully; these numbers feed the perf track.
 *
 * Runtime classification by walk.ts format (never hardcoded filenames):
 * - giant PDFs        → /compress-pdf Medium AND Extreme (one upload, two runs)
 * - giant ISOs        → /iso-to-zip convert, entry list + sizes vs 7z reference
 * - giant videos      → /compress-video q75, dims/duration preserved, mid frame
 * - giant anything-else → its hub with DEFAULT settings, structural check only
 * - unroutable giants → recorded skips (giant tier of negative material)
 *
 * Cell titles: `MX [giant] <file> :: <action> @<level>` — grep one to re-run.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import {
	compress,
	downloadCombined,
	downloadRow,
	gotoPath,
	rasterizePdfInPage,
	rasterizeVideoFramesViaFsInPage,
	setPdfLevel,
	setQuality,
	upload,
	type Artifact
} from '../helpers';
import type { FileFormat } from '../../src/lib/types';
import {
	audioInfo,
	fontInfo,
	glbJson,
	imageMeta,
	pdfInfo,
	qualityMetrics,
	sevenZipEntries,
	unzip,
	videoInfo
} from '../verify';
import { MatrixRecorder, timer } from './record';
import { walkReal, type RealFile } from './walk';

// Serial per the giant contract: one test at a time, failures halt the chain
// (a machine that just OOMed on a 400 MB PDF gives worthless numbers anyway).
test.describe.configure({ mode: 'serial', timeout: 900_000 });

if (process.env.E2E_PREVIEW) throw new Error('matrix specs need the dev server (rasterizers)');

const GIANT = !!process.env.MATRIX_GIANT;
const rec = new MatrixRecorder('giant');

const giants = walkReal().filter((f) => f.giant);
const pdfs = giants.filter((f) => f.format === 'pdf');
const isos = giants.filter((f) => f.ext === 'iso');
const videos = giants.filter((f) => f.format === 'video');
const others = giants.filter(
	(f) => f.format !== null && f.format !== 'pdf' && f.format !== 'video' && f.ext !== 'iso'
);
const unroutable = giants.filter((f) => f.format === null);

/** Longest side ≤ 640, even dims — the common framing for video comparisons
 *  (matrix-video's drawSizeFor; local copy, shared files stay untouched). */
function drawSizeFor(w: number, h: number): { width: number; height: number } {
	const scale = Math.min(1, 640 / Math.max(w, h, 1));
	const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
	return { width: even(w), height: even(h) };
}

/** The single result artifact, wherever the op put it (create → combined
 *  block, per-file convert/compress → row). compress() already settled the UI. */
async function downloadResult(page: Page): Promise<Artifact> {
	if ((await page.getByTestId('combined-result').count()) > 0) return downloadCombined(page);
	return downloadRow(page);
}

// --- A) giant PDFs: Medium AND Extreme, one upload ---------------------------

for (const f of pdfs) {
	test(`MX [giant] ${f.rel} :: compress @medium-extreme`, async ({ page }) => {
		test.skip(!GIANT, 'set MATRIX_GIANT=1');
		// Two full Ghostscript runs of a document that can reach 405 MB.
		test.setTimeout(1_500_000);
		const input = readFileSync(f.abs);
		const inInfo = await pdfInfo(input);

		await gotoPath(page, '/compress-pdf');
		await upload(page, f.abs);
		const inRaster = await rasterizePdfInPage(page, input, 1);

		const failures: string[] = [];
		for (const level of ['Medium', 'Extreme'] as const) {
			const elapsed = timer();
			const id = rec.id(f.rel, 'compress', level.toLowerCase());
			try {
				await setPdfLevel(page, level);
				const t0 = timer();
				await compress(page, { timeout: 600_000 });
				const compressMs = t0();
				const art = await downloadRow(page);
				const outInfo = await pdfInfo(art.bytes); // decode-back: throws on garbage
				const keptOriginal = art.bytes.length === input.length;
				const notes: string[] = [];
				let metrics: Record<string, number | string | boolean | null> = {
					pages: outInfo.pageCount,
					compressMs
				};

				const rasters: string[] = [];
				const outRaster = await rasterizePdfInPage(page, art.bytes, 1);
				if (inRaster && outRaster) {
					const q = await qualityMetrics(inRaster, outRaster, { ssim: true });
					metrics = {
						...metrics,
						psnr: Number(q.psnr.toFixed(1)),
						ssim: q.ssim === null ? null : Number(q.ssim.toFixed(4)),
						diffRatio: Number(q.ratio.toFixed(5))
					};
					rasters.push(await rec.saveSideBySide(id, 'side-p1.png', inRaster, outRaster));
					// Medium: 0.90 is a soft floor (recorded), 0.80 the hard one.
					// Extreme is record-only — visibly lossy by design.
					if (level === 'Medium' && q.ssim !== null) {
						if (q.ssim < 0.8) {
							failures.push(`${level}: ssim ${q.ssim.toFixed(4)} < 0.80 hard floor`);
						} else if (q.ssim < 0.9) {
							notes.push(`ssim ${q.ssim.toFixed(4)} below the 0.90 soft floor (recorded)`);
						}
					}
				} else {
					notes.push('page-1 raster unavailable — ssim not measured');
				}

				if (outInfo.pageCount !== inInfo.pageCount)
					failures.push(`${level}: pages ${outInfo.pageCount} != ${inInfo.pageCount}`);
				if (art.bytes.length > input.length) failures.push(`${level}: output grew`);
				if (keptOriginal) notes.push('keep-original returned input bytes');

				rec.cell({
					family: 'giant',
					file: f.rel,
					tool: '/compress-pdf',
					action: 'compress',
					level: level.toLowerCase(),
					status: failures.some((x) => x.startsWith(`${level}:`)) ? 'fail' : 'pass',
					inBytes: input.length,
					outBytes: art.bytes.length,
					keptOriginal,
					metrics,
					durationMs: elapsed(),
					rasters,
					notes: notes.join('; ')
				});
			} catch (error) {
				rec.cell({
					family: 'giant',
					file: f.rel,
					tool: '/compress-pdf',
					action: 'compress',
					level: level.toLowerCase(),
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

// --- B) giant ISOs: /iso-to-zip, entry names + sizes vs the 7z reference -----

for (const f of isos) {
	test(`MX [giant] ${f.rel} :: iso-to-zip @default`, async ({ page }) => {
		test.skip(!GIANT, 'set MATRIX_GIANT=1');
		const input = readFileSync(f.abs);
		const elapsed = timer();
		try {
			// Node-side reference listing FIRST — same engine (7z-wasm) from outside.
			const inEntries = await sevenZipEntries(input, f.name);
			const inNames = Object.keys(inEntries).sort();

			await gotoPath(page, '/iso-to-zip');
			await upload(page, f.abs);
			const t0 = timer();
			await compress(page, { timeout: 600_000 });
			const compressMs = t0();
			const art = await downloadResult(page);

			const out = unzip(art.bytes);
			const outNames = Object.keys(out)
				.filter((n) => !n.endsWith('/'))
				.sort();
			expect(outNames, 'zip holds exactly the ISO entries').toEqual(inNames);
			// Size-compare only — full byte-compare of a 100 MB tier is the normal
			// tier's job; identical names + sizes from the same engine is the probe.
			const sizeMismatches = inNames.filter((n) => out[n].length !== inEntries[n].length);
			expect(sizeMismatches, `entry sizes differ: ${sizeMismatches.join(', ')}`).toEqual([]);

			rec.cell({
				family: 'giant',
				file: f.rel,
				tool: '/iso-to-zip',
				action: 'iso-to-zip',
				level: 'default',
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				metrics: { entries: inNames.length, compressMs },
				durationMs: elapsed(),
				notes: 'entry sizes compared (not full bytes — 100 MB tier); peak memory n/a'
			});
		} catch (error) {
			rec.cell({
				family: 'giant',
				file: f.rel,
				tool: '/iso-to-zip',
				action: 'iso-to-zip',
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

// --- C) giant videos: q75, same dims (no auto-resize claim), mid frame -------

for (const f of videos) {
	test(`MX [giant] ${f.rel} :: compress @q75`, async ({ page }) => {
		test.skip(!GIANT, 'set MATRIX_GIANT=1');
		// A 600 MB 4K source re-encodes for a long time even on hardware encoders.
		test.setTimeout(1_500_000);
		const input = readFileSync(f.abs);
		const inInfo = await videoInfo(input); // input must parse before anything else
		const elapsed = timer();
		const id = rec.id(f.rel, 'compress', 'q75');
		try {
			await gotoPath(page, '/compress-video');
			await upload(page, f.abs);
			await setQuality(page, 75);
			const t0 = timer();
			try {
				await compress(page, { timeout: 900_000 });
			} catch (error) {
				if (/hevc/i.test(String(error))) {
					rec.cell({
						family: 'giant',
						file: f.rel,
						tool: '/compress-video',
						action: 'compress',
						level: 'q75',
						status: 'skip',
						inBytes: input.length,
						durationMs: elapsed(),
						notes: 'engine cannot decode HEVC — the app refused with its guidance banner',
						error: String(error).slice(0, 500)
					});
					return;
				}
				throw error;
			}
			const compressMs = t0();
			const art = await downloadRow(page);
			const outInfo = await videoInfo(art.bytes); // decode-back: throws on garbage
			const keptOriginal = art.bytes.length === input.length;

			const failures: string[] = [];
			const rotated = inInfo.rotation % 180 !== 0 || outInfo.rotation % 180 !== 0;
			const dimsOk =
				(outInfo.width === inInfo.width && outInfo.height === inInfo.height) ||
				(rotated && outInfo.width === inInfo.height && outInfo.height === inInfo.width);
			if (!dimsOk)
				failures.push(
					`dims ${outInfo.width}x${outInfo.height} != ${inInfo.width}x${inInfo.height} (no auto-resize claim)`
				);
			if (Math.abs(outInfo.durationSec - inInfo.durationSec) > 0.5)
				failures.push(
					`duration ${outInfo.durationSec.toFixed(2)} vs ${inInfo.durationSec.toFixed(2)}`
				);

			// One honest frame at 50 % — both sides drawn at the same ≤640 framing.
			const mid = Math.max(0.05, Number((inInfo.durationSec / 2).toFixed(3)));
			const drawSize = drawSizeFor(inInfo.width, inInfo.height);
			const [inF] =
				(await rasterizeVideoFramesViaFsInPage(page, input, f.ext, [mid], drawSize)) ?? [];
			const [outF] =
				(await rasterizeVideoFramesViaFsInPage(page, art.bytes, 'mp4', [mid], drawSize)) ?? [];
			const rasters: string[] = [];
			let framePsnr: number | null = null;
			if (inF && outF) {
				rasters.push(await rec.saveSideBySide(id, 'side-mid.png', inF.frame, outF.frame));
				framePsnr = Number((await qualityMetrics(inF.frame, outF.frame)).psnr.toFixed(1));
			}

			rec.cell({
				family: 'giant',
				file: f.rel,
				tool: '/compress-video',
				action: 'compress',
				level: 'q75',
				status: failures.length ? 'fail' : 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				keptOriginal,
				metrics: {
					width: outInfo.width,
					height: outInfo.height,
					durationSec: Number(outInfo.durationSec.toFixed(2)),
					videoCodec: outInfo.videoCodec,
					audioCodec: outInfo.audioCodec,
					midSec: mid,
					framePsnr,
					compressMs
				},
				durationMs: elapsed(),
				rasters,
				notes: keptOriginal ? 'keep-original returned input bytes' : '',
				error: failures.length ? failures.join(' | ').slice(0, 500) : null
			});
			expect(failures, failures.join(' | ')).toEqual([]);
		} catch (error) {
			rec.cell({
				family: 'giant',
				file: f.rel,
				tool: '/compress-video',
				action: 'compress',
				level: 'q75',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}

// --- D) giant anything-else: its hub, default settings, structural check -----

/** Hub page per routable format (seo.ts FORMATS paths). exif/ocr never come
 *  out of formatFromName, so they cannot appear here. */
const HUB: Partial<Record<FileFormat, string>> = {
	jpg: '/compress-jpg',
	png: '/compress-png',
	webp: '/compress-webp',
	gif: '/compress-gif',
	heic: '/compress-heic',
	svg: '/compress-svg',
	audio: '/compress-audio',
	font: '/font-converter',
	zip: '/zip-files',
	subtitle: '/srt-to-vtt',
	ebook: '/compress-epub',
	model: '/compress-glb',
	data: '/csv-to-xlsx'
};

/** Structural decode-back per family — "no exception" alone is not validation,
 *  but the giant tier deliberately stops at container/parse level. */
async function verifyStructural(
	f: RealFile,
	art: Artifact
): Promise<Record<string, number | string | boolean | null>> {
	switch (f.format) {
		case 'jpg':
		case 'png':
		case 'webp':
		case 'gif':
		case 'heic': {
			const m = await imageMeta(art.bytes); // throws on garbage
			expect(m.width, 'decoded width').toBeGreaterThan(0);
			expect(m.height, 'decoded height').toBeGreaterThan(0);
			return { outFormat: m.format, width: m.width, height: m.height };
		}
		case 'zip': {
			// Default op on /zip-files is CREATE — the giant archive becomes the
			// single entry of a fresh zip; it must be listed at its exact size.
			const entries = unzip(art.bytes);
			const entry = entries[f.name];
			expect(entry, `${f.name} listed in the created zip`).toBeTruthy();
			expect(entry.length, 'entry inflates back to the input size').toBe(f.bytes);
			return { entries: Object.keys(entries).length, op: 'create (tab default)' };
		}
		case 'model': {
			const json = glbJson(art.bytes) as {
				extensionsRequired?: string[];
				extensionsUsed?: string[];
			};
			return {
				extensionsRequired: (json.extensionsRequired ?? []).join(',') || 'none',
				extensionsUsed: (json.extensionsUsed ?? []).join(',') || 'none'
			};
		}
		case 'audio': {
			const info = await audioInfo(art.bytes); // throws on garbage
			return {
				audioCodec: info.audioCodec,
				durationSec: Number(info.durationSec.toFixed(2)),
				sampleRate: info.sampleRate
			};
		}
		case 'video': {
			const info = await videoInfo(art.bytes);
			return { videoCodec: info.videoCodec, durationSec: Number(info.durationSec.toFixed(2)) };
		}
		case 'font': {
			const info = fontInfo(art.bytes);
			expect(info.container, 'recognizable font container').not.toBe('unknown');
			return { container: info.container, numTables: info.numTables };
		}
		case 'svg': {
			expect(art.bytes.toString('utf8')).toContain('<svg');
			return { chars: art.bytes.length };
		}
		default:
			return { note: 'no node-side reference decoder wired — size/name recorded only' };
	}
}

for (const f of others) {
	const hub = HUB[f.format!];
	test(`MX [giant] ${f.rel} :: hub-default @${f.format}`, async ({ page }) => {
		test.skip(!GIANT, 'set MATRIX_GIANT=1');
		const elapsed = timer();
		if (!hub) {
			rec.cell({
				family: 'giant',
				file: f.rel,
				tool: 'n/a',
				action: 'hub-default',
				level: 'default',
				status: 'skip',
				inBytes: f.bytes,
				durationMs: 0,
				notes: `no hub mapping for format ${f.format} — extend HUB in matrix-giant`
			});
			return;
		}
		const input = readFileSync(f.abs);
		const id = rec.id(f.rel, 'hub-default', 'default');
		try {
			await gotoPath(page, hub);
			await upload(page, f.abs);
			const t0 = timer();
			await compress(page, { timeout: 600_000 });
			const compressMs = t0();
			const art = await downloadResult(page);
			const keptOriginal = art.bytes.length === input.length;
			const metrics = await verifyStructural(f, art);

			// Image-family outputs get a (downscaled) report raster; everything
			// else in this bucket has no honest node-side visual.
			const rasters: string[] = [];
			if (['jpg', 'png', 'webp', 'gif', 'heic'].includes(f.format!)) {
				try {
					const sharp = (await import('sharp')).default;
					rasters.push(
						await rec.saveRaster(id, 'out.png', await sharp(art.bytes).png().toBuffer())
					);
				} catch {
					// non-sharp-decodable output (e.g. jxl) — imageMeta above proved it
				}
			}

			rec.cell({
				family: 'giant',
				file: f.rel,
				tool: hub,
				action: 'hub-default',
				level: 'default',
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				keptOriginal,
				metrics: { ...metrics, outName: art.name, compressMs },
				durationMs: elapsed(),
				rasters,
				notes: keptOriginal
					? 'keep-original returned input bytes'
					: 'default settings, structural validation only (giant tier)'
			});
		} catch (error) {
			rec.cell({
				family: 'giant',
				file: f.rel,
				tool: hub,
				action: 'hub-default',
				level: 'default',
				status: 'error',
				inBytes: f.bytes,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}

// --- E) unroutable giants: recorded skips, never silence ---------------------

test('MX [giant] batch unroutable @skip', async () => {
	test.skip(!GIANT, 'set MATRIX_GIANT=1');
	test.skip(unroutable.length === 0, 'no unroutable giant files present');
	for (const f of unroutable) {
		rec.cell({
			family: 'giant',
			file: f.rel,
			tool: 'n/a',
			action: 'unroutable',
			level: 'n/a',
			status: 'skip',
			inBytes: f.bytes,
			durationMs: 0,
			notes:
				'router assigns no tab (giant tier of negative material) — the normal-tier ' +
				'negative spec proves the honest rejection UX on smaller files'
		});
	}
});
