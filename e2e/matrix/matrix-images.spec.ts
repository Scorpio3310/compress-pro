/**
 * Real-file matrix — IMAGE family (the largest one). Every routable real image
 * (normal tier) runs its hub compress cell at the default q80 with decode-back
 * + pixel-metric + raster validation; representatives run the quality ladder,
 * every applicable converter landing page, resize/target spot checks and the
 * EXIF strip. avif/bmp/tif(f)/jxl/psd + RAW extensions ride the jpg tab
 * (src/lib/routing.ts) and are split back out by extension here.
 *
 * Validation philosophy (docs/quality-sweep-goal.md): decode the output back
 * for real, metric-check when node can decode the source (sharp/icodec),
 * structural-only when it can't (BMP header dims; PSD/RAW opaque), and save
 * downscaled rasters for vision inspection. REAL_PHOTO floors are soft-recorded
 * (real content varies); the hard floor is psnr >= 20 — below that the pixels
 * are damaged, not merely compressed.
 *
 * Cell titles: `MX [images] <file> :: <action> @<level>` — grep one to re-run.
 */
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '../fixtures';
import {
	compress,
	downloadRow,
	downloadRowAt,
	gotoPath,
	rows,
	setMaxDimension,
	setOutputFormat,
	setQuality,
	setTargetKb,
	upload,
	type Artifact,
	type OutputPill
} from '../helpers';
import { REAL_PHOTO } from '../thresholds';
import { decodeRaw, exifMeta, icoInfo, imageMeta, qualityMetrics } from '../verify';
import { MatrixRecorder, timer } from './record';
import { realByFormat, type RealFile } from './walk';

test.describe.configure({ timeout: 300_000 });

if (process.env.E2E_PREVIEW) throw new Error('matrix specs need the dev server (rasterizers)');

const rec = new MatrixRecorder('images');

const RAW_EXTS = new Set(['cr2', 'nef', 'arw', 'dng', 'raf', 'rw2', 'orf']);
const JPG_EXTS = new Set(['jpg', 'jpeg', 'jpe', 'jfif']);
/** Below this every conversion damages pixels, not merely compresses them. */
const HARD_PSNR_FLOOR = 20;
/** icodec HEIC decode of 48 MP captures runs minutes in node — structural only above this. */
const HEIC_NODE_DECODE_MAX = 15_000_000;
/** Above this the encode itself gets the long-run budget. */
const HEAVY_BYTES = 8_000_000;

const files = realByFormat(['jpg', 'png', 'webp', 'gif', 'heic']);
const byExt = (...exts: string[]) => files.filter((f) => exts.includes(f.ext));
const jpgFiles = files.filter((f) => JPG_EXTS.has(f.ext));
const pngFiles = byExt('png');
const webpFiles = byExt('webp');
const gifFiles = byExt('gif');
const heicFiles = files.filter((f) => f.format === 'heic');
/** avif/bmp/tiff/jxl/psd/RAW — routed to the jpg tab, pinned to JPG output. */
const riderFiles = files.filter((f) => f.format === 'jpg' && !JPG_EXTS.has(f.ext));

// ---------------------------------------------------------------- utilities

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

/** The real dir carries literal duplicate copies ("sample1 (2).webp") — same
 *  ext+bytes adds runtime, not coverage, for CONVERTER cells (every copy still
 *  runs its compress cell). */
function dedupe(list: RealFile[]): RealFile[] {
	const seen = new Set<string>();
	return list.filter((f) => {
		const key = `${f.ext}:${f.bytes}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** Smallest file that is still a real photo (>=150 KB) — keeps the slow
 *  converters (vectorize, jxl/avif encode) off the 18 MP monsters. */
function pickRep(list: RealFile[]): RealFile | undefined {
	return [...list].sort((a, b) => a.bytes - b.bytes).find((f) => f.bytes >= 150_000) ?? list[0];
}

function largestUnder(list: RealFile[], maxBytes: number): RealFile | undefined {
	return [...list].filter((f) => f.bytes < maxBytes).sort((a, b) => b.bytes - a.bytes)[0];
}

type SourceKind = 'full' | 'bmp-header' | 'none';

/** Can node decode the SOURCE for dims/pixel metrics? */
function sourceKind(f: RealFile): SourceKind {
	if (f.ext === 'bmp') return 'bmp-header';
	if (f.ext === 'psd' || RAW_EXTS.has(f.ext)) return 'none';
	if (f.format === 'heic' && f.bytes > HEIC_NODE_DECODE_MAX) return 'none';
	return 'full';
}

/** Any decodable image buffer → PNG (rasters must be png-decodable; jxl/heic
 *  go through icodec via decodeRaw). Null when undecodable. */

/** JPEG (and other opaque) outputs carry no alpha — matte a transparent
 *  reference onto WHITE first, matching the app's flattenToWhite rule.
 *  Comparing against black-premultiplied pixels scored a perfectly correct
 *  alpha leaf texture at PSNR 2 (matrix v2 false positive). Non-sharp
 *  references (PSD/RAW/BMP) fall through unmatted. */
async function metricsVsRef(input: Buffer, out: Buffer): ReturnType<typeof qualityMetrics> {
	try {
		const [inMeta, outMeta] = await Promise.all([imageMeta(input), imageMeta(out)]);
		if (inMeta.hasAlpha && !outMeta.hasAlpha) {
			const matted = await sharp(input).flatten({ background: '#ffffff' }).png().toBuffer();
			return qualityMetrics(matted, out);
		}
	} catch {
		// undecodable reference for sharp — compare unmatted
	}
	return qualityMetrics(input, out);
}

async function toPngAny(buf: Buffer): Promise<Buffer | null> {
	try {
		const raw = await decodeRaw(buf);
		return await sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 4 } })
			.png()
			.toBuffer();
	} catch {
		return null;
	}
}

interface SrcDims {
	width: number;
	height: number;
	pages: number;
}

async function srcDims(f: RealFile, input: Buffer): Promise<SrcDims | null> {
	const kind = sourceKind(f);
	if (kind === 'none') return null;
	if (kind === 'bmp-header') {
		// BITMAPINFOHEADER: i32 LE width @18, height @22 (negative = top-down).
		return { width: input.readInt32LE(18), height: Math.abs(input.readInt32LE(22)), pages: 1 };
	}
	if (f.format === 'heic') {
		const raw = await decodeRaw(input); // sharp has no libheif
		return { width: raw.width, height: raw.height, pages: 1 };
	}
	const m = await imageMeta(input);
	return { width: m.width, height: m.height, pages: m.pages };
}

interface RowExpect {
	/** sharp-normalized output format: 'jpeg' | 'png' | 'webp' | 'gif' | 'avif' | 'jxl' */
	outFormat: string;
	/** growth is a hard failure only for same-format recompression */
	sameFormat: boolean;
}

interface RowVerdict {
	failures: string[];
	notes: string[];
	metrics: Record<string, number | string | boolean | null>;
	rasters: string[];
	keptOriginal: boolean;
}

/** Shared decode-back validation for one image output (compress + converters). */
async function verifyImageRow(
	f: RealFile,
	input: Buffer,
	art: Artifact,
	id: string,
	want: RowExpect
): Promise<RowVerdict> {
	const failures: string[] = [];
	const notes: string[] = [];
	const metrics: Record<string, number | string | boolean | null> = {};
	const rasters: string[] = [];

	const m = await imageMeta(art.bytes); // decode-back: throws on garbage
	if (m.format !== want.outFormat) failures.push(`format ${m.format} != ${want.outFormat}`);
	metrics.outWidth = m.width;
	metrics.outHeight = m.height;

	const keptOriginal = art.bytes.length === input.length;
	if (keptOriginal) notes.push('keep-original returned input bytes');
	if (art.bytes.length > input.length) {
		if (want.sameFormat) failures.push(`output grew ${input.length} -> ${art.bytes.length}`);
		else notes.push(`grew ${input.length} -> ${art.bytes.length} (cross-format, honest)`);
	}

	const src = await srcDims(f, input);
	if (src) {
		if (m.width !== src.width || m.height !== src.height)
			failures.push(`dims ${m.width}x${m.height} != ${src.width}x${src.height}`);
		if (src.pages > 1) {
			metrics.srcPages = src.pages;
			metrics.outPages = m.pages;
			if (m.pages !== src.pages) failures.push(`pages ${m.pages} != ${src.pages}`);
		}
	} else {
		notes.push('source not node-decodable — structural checks only');
	}

	const afterPng = await toPngAny(art.bytes);
	if (sourceKind(f) === 'full') {
		const q = await metricsVsRef(input, art.bytes);
		metrics.psnr = Number(q.psnr.toFixed(1));
		metrics.diffRatio = Number(q.ratio.toFixed(5));
		if (q.psnr < HARD_PSNR_FLOOR)
			failures.push(`psnr ${q.psnr.toFixed(1)} < hard floor ${HARD_PSNR_FLOOR}`);
		// REAL_PHOTO floors stay soft-recorded — real content varies too much to gate.
		if (q.psnr < REAL_PHOTO.psnrFloor) {
			metrics.belowRealPhotoPsnr = true;
			notes.push(`psnr ${q.psnr.toFixed(1)} below REAL_PHOTO floor ${REAL_PHOTO.psnrFloor} (soft)`);
		}
		if (q.ratio > REAL_PHOTO.ratio) {
			metrics.aboveRealPhotoRatio = true;
			notes.push(`diffRatio ${q.ratio.toFixed(3)} above REAL_PHOTO ${REAL_PHOTO.ratio} (soft)`);
		}
		const beforePng = await toPngAny(input);
		if (beforePng && afterPng) {
			rasters.push(await rec.saveSideBySide(id, 'side.png', beforePng, afterPng));
		} else if (afterPng) {
			rasters.push(await rec.saveRaster(id, 'after.png', afterPng));
		}
	} else if (afterPng) {
		rasters.push(await rec.saveRaster(id, 'after.png', afterPng));
	}

	return { failures, notes, metrics, rasters, keptOriginal };
}

// --- A) hub compress at the default q80, batched per source extension -------

interface HubGroup {
	key: string;
	tool: string;
	pill: OutputPill | null;
	outFormat: string;
	sameFormat: boolean;
	files: RealFile[];
	chunkSize: number;
}

const HUBS: HubGroup[] = [
	{
		key: 'jpg',
		tool: '/compress-jpg',
		pill: 'JPG',
		outFormat: 'jpeg',
		sameFormat: true,
		files: jpgFiles,
		chunkSize: 6
	},
	{
		key: 'png',
		tool: '/compress-png',
		pill: 'PNG',
		outFormat: 'png',
		sameFormat: true,
		files: pngFiles,
		chunkSize: 6
	},
	{
		key: 'webp',
		tool: '/compress-webp',
		pill: 'WebP',
		outFormat: 'webp',
		sameFormat: true,
		files: webpFiles,
		chunkSize: 6
	},
	// gif tab default output is GIF (no pill pin needed — RF-09 precedent).
	{
		key: 'gif',
		tool: '/compress-gif',
		pill: null,
		outFormat: 'gif',
		sameFormat: true,
		files: gifFiles,
		chunkSize: 6
	},
	// heic tab default converts to JPG.
	{
		key: 'heic',
		tool: '/compress-heic',
		pill: null,
		outFormat: 'jpeg',
		sameFormat: false,
		files: heicFiles,
		chunkSize: 6
	},
	// RAW/psd develop + decode are slow — smaller chunks keep runs bounded.
	{
		key: 'jpg-riders',
		tool: '/compress-jpg',
		pill: 'JPG',
		outFormat: 'jpeg',
		sameFormat: false,
		files: riderFiles,
		chunkSize: 4
	}
];

for (const hub of HUBS) {
	chunk(hub.files, hub.chunkSize).forEach((part, ci) => {
		test(`MX [images] batch compress-${hub.key}#${ci + 1} @q80`, async ({ page }) => {
			test.setTimeout(600_000); // 18 MP encodes + RAW develops under parallel workers
			const elapsed = timer();
			await gotoPath(page, hub.tool);
			await upload(page, ...part.map((f) => f.abs));
			if (hub.pill) await setOutputFormat(page, hub.pill);
			// A single broken file may raise the run-level banner — keep going and
			// let each row account for itself (matrix-pdf unlock precedent).
			const run = await compress(page, { timeout: 480_000 }).catch((e) => ({
				error: String(e),
				warnings: [] as string[]
			}));

			const failures: string[] = [];
			for (let i = 0; i < part.length; i++) {
				const f = part[i];
				const input = readFileSync(f.abs);
				const id = rec.id(f.rel, 'compress', 'q80');
				const base = {
					family: 'images',
					file: f.rel,
					tool: hub.tool,
					action: 'compress',
					level: 'q80',
					inBytes: input.length
				};
				try {
					// Fail fast with the row state instead of a long click timeout.
					await rows(page)
						.nth(i)
						.getByRole('button', { name: 'Download' })
						.waitFor({ state: 'visible', timeout: 15_000 });
					const art = await downloadRowAt(page, i);
					const v = await verifyImageRow(f, input, art, id, {
						outFormat: hub.outFormat,
						sameFormat: hub.sameFormat
					});
					rec.cell({
						...base,
						status: v.failures.length ? 'fail' : 'pass',
						outBytes: art.bytes.length,
						keptOriginal: v.keptOriginal,
						metrics: v.metrics,
						durationMs: elapsed(),
						rasters: v.rasters,
						notes: v.notes.join('; ')
					});
					failures.push(...v.failures.map((x) => `${f.rel}: ${x}`));
				} catch (error) {
					const msg = run.error
						? `${String(error).slice(0, 240)} | run: ${run.error.slice(0, 240)}`
						: String(error);
					rec.cell({ ...base, status: 'error', durationMs: elapsed(), error: msg.slice(0, 500) });
					failures.push(`${f.rel}: ${msg.slice(0, 200)}`);
				}
			}
			if (run.error && failures.length === 0)
				failures.push(`run error with all rows green: ${run.error.slice(0, 200)}`);
			expect(failures, failures.join(' | ')).toEqual([]);
		});
	});
}

// --- B) quality ladder {30,60,90,100} on two representatives ----------------

const QUALITIES = [30, 60, 90, 100] as const;

interface LadderRep {
	f: RealFile | undefined;
	tool: string;
	pill: OutputPill;
	outFormat: string;
}

const LADDER: LadderRep[] = [
	{ f: largestUnder(jpgFiles, 20_000_000), tool: '/compress-jpg', pill: 'JPG', outFormat: 'jpeg' },
	{ f: largestUnder(pngFiles, 20_000_000), tool: '/compress-png', pill: 'PNG', outFormat: 'png' }
];

for (const repCase of LADDER) {
	const f = repCase.f;
	if (!f) continue;
	test(`MX [images] ${f.rel} :: quality-ladder @30-100`, async ({ page }) => {
		test.setTimeout(900_000); // four full encodes of the biggest sub-20 MB photo
		const input = readFileSync(f.abs);
		await gotoPath(page, repCase.tool);
		await upload(page, f.abs);
		await setOutputFormat(page, repCase.pill);
		const beforePng = await toPngAny(input);

		const sizes: Record<number, number> = {};
		const psnrs: Record<number, number> = {};
		const failures: string[] = [];
		for (const q of QUALITIES) {
			const elapsed = timer();
			const id = rec.id(f.rel, 'compress', `q${q}`);
			const base = {
				family: 'images',
				file: f.rel,
				tool: repCase.tool,
				action: 'compress',
				level: `q${q}`,
				inBytes: input.length
			};
			try {
				await setQuality(page, q);
				await compress(page, { timeout: 480_000 });
				const art = await downloadRow(page);
				const m = await imageMeta(art.bytes);
				if (m.format !== repCase.outFormat) failures.push(`q${q}: format ${m.format}`);
				sizes[q] = art.bytes.length;
				const qm = await metricsVsRef(input, art.bytes);
				psnrs[q] = qm.psnr;
				const rasters: string[] = [];
				const afterPng = await toPngAny(art.bytes);
				if (beforePng && afterPng)
					rasters.push(await rec.saveSideBySide(id, 'side.png', beforePng, afterPng));
				const keptOriginal = art.bytes.length === input.length;
				rec.cell({
					...base,
					status: failures.some((x) => x.startsWith(`q${q}:`)) ? 'fail' : 'pass',
					outBytes: art.bytes.length,
					keptOriginal,
					metrics: { psnr: Number(qm.psnr.toFixed(1)), diffRatio: Number(qm.ratio.toFixed(5)) },
					durationMs: elapsed(),
					rasters,
					notes: keptOriginal ? 'keep-original returned input bytes' : ''
				});
			} catch (error) {
				rec.cell({
					...base,
					status: 'error',
					durationMs: elapsed(),
					error: String(error).slice(0, 500)
				});
				failures.push(`q${q}: ${String(error).slice(0, 200)}`);
			}
		}
		if (sizes[30] !== undefined && sizes[90] !== undefined && sizes[30] > sizes[90])
			failures.push(`size(q30) ${sizes[30]} > size(q90) ${sizes[90]}`);
		if (psnrs[30] !== undefined && psnrs[90] !== undefined) {
			// Strict > unless both hit the 99 dB cap (real photos never do).
			const bad = psnrs[30] < 99 ? psnrs[90] <= psnrs[30] : psnrs[90] < psnrs[30];
			if (bad)
				failures.push(`psnr(q90) ${psnrs[90].toFixed(1)} not > psnr(q30) ${psnrs[30].toFixed(1)}`);
		}
		expect(failures, failures.join(' | ')).toEqual([]);
	});
}

// --- C) converter landing pages at default quality --------------------------

type Target = 'jpeg' | 'png' | 'webp' | 'avif' | 'jxl' | 'ico' | 'svg';

interface ConvCase {
	f: RealFile;
	path: string;
	target: Target;
	sameFormat: boolean;
}

const conv: ConvCase[] = [];
const push = (f: RealFile, path: string, target: Target, sameFormat = false) =>
	conv.push({ f, path, target, sameFormat });

// jpg/png carry many files — converters run on ONE representative each; every
// file still runs its compress cell above.
const jpgRep = pickRep(jpgFiles);
if (jpgRep) {
	push(jpgRep, '/jpg-to-webp', 'webp');
	push(jpgRep, '/jpg-to-avif', 'avif');
	push(jpgRep, '/jpg-to-jxl', 'jxl');
	push(jpgRep, '/jpg-to-ico', 'ico');
	push(jpgRep, '/jpg-to-svg', 'svg');
}
const pngRep = pickRep(pngFiles);
if (pngRep) {
	push(pngRep, '/png-to-jpg', 'jpeg');
	push(pngRep, '/png-to-webp', 'webp');
	push(pngRep, '/png-to-avif', 'avif');
	push(pngRep, '/png-to-ico', 'ico');
	push(pngRep, '/png-to-svg', 'svg');
}
for (const f of dedupe(webpFiles)) {
	push(f, '/webp-to-jpg', 'jpeg');
	push(f, '/webp-to-png', 'png');
	push(f, '/webp-to-avif', 'avif');
}
for (const f of dedupe(gifFiles)) push(f, '/gif-to-webp', 'webp');
for (const f of dedupe(heicFiles)) {
	push(f, '/heic-to-jpg', 'jpeg');
	push(f, '/heic-to-png', 'png');
	push(f, '/heic-to-avif', 'avif');
	push(f, '/heic-to-webp', 'webp');
}
for (const f of dedupe(byExt('avif'))) {
	push(f, '/avif-to-jpg', 'jpeg');
	push(f, '/avif-to-png', 'png');
	push(f, '/compress-avif', 'avif', true);
}
for (const f of dedupe(byExt('bmp'))) {
	push(f, '/bmp-to-jpg', 'jpeg');
	push(f, '/bmp-to-png', 'png');
}
for (const f of dedupe(byExt('tif', 'tiff'))) {
	push(f, '/tiff-to-jpg', 'jpeg');
	push(f, '/tiff-to-png', 'png');
}
for (const f of dedupe(byExt('jxl'))) {
	push(f, '/jxl-to-jpg', 'jpeg');
	push(f, '/compress-jxl', 'jxl', true);
}
for (const f of dedupe(byExt('psd'))) {
	push(f, '/psd-to-jpg', 'jpeg');
	push(f, '/psd-to-png', 'png');
}
for (const f of dedupe(files.filter((x) => RAW_EXTS.has(x.ext)))) {
	const slug = ['cr2', 'nef', 'arw', 'dng'].includes(f.ext) ? f.ext : 'raw';
	push(f, `/${slug}-to-jpg`, 'jpeg');
}

for (const c of conv) {
	const action = c.path.slice(1);
	test(`MX [images] ${c.f.rel} :: ${action} @default`, async ({ page }) => {
		if (c.f.bytes > HEAVY_BYTES) test.setTimeout(600_000);
		const input = readFileSync(c.f.abs);
		const elapsed = timer();
		const id = rec.id(c.f.rel, action, 'default');
		const base = {
			family: 'images',
			file: c.f.rel,
			tool: c.path,
			action,
			level: 'default',
			inBytes: input.length
		};
		let recorded = false;
		try {
			await gotoPath(page, c.path);
			await upload(page, c.f.abs);
			await compress(page, { timeout: c.f.bytes > HEAVY_BYTES ? 480_000 : 240_000 });
			const art = await downloadRow(page);

			if (c.target === 'ico') {
				const ico = icoInfo(art.bytes); // throws when not an ICO container
				const failures: string[] = [];
				if (ico.count < 3) failures.push(`only ${ico.count} ico entries`);
				if (!ico.sizes.includes(16) || !ico.sizes.includes(32))
					failures.push(`sizes ${ico.sizes.join(',')} miss 16/32`);
				for (const entry of ico.entries) await decodeRaw(entry.bytes); // every entry decodes
				const rasters: string[] = [];
				const largest = [...ico.entries].sort((a, b) => b.size - a.size)[0];
				const largestPng = largest && (await toPngAny(largest.bytes));
				if (largestPng) rasters.push(await rec.saveRaster(id, 'ico-largest.png', largestPng));
				rec.cell({
					...base,
					status: failures.length ? 'fail' : 'pass',
					outBytes: art.bytes.length,
					metrics: { entries: ico.count, sizes: ico.sizes.join(',') },
					durationMs: elapsed(),
					rasters
				});
				recorded = true;
				expect(failures, failures.join(' | ')).toEqual([]);
			} else if (c.target === 'svg') {
				// Vectorization is approximate by design — assert real SVG text and
				// record the byte size; no raster roundtrip (CV-38/39 cover fidelity).
				const head = art.bytes.toString('utf8', 0, Math.min(art.bytes.length, 300)).trimStart();
				const ok = head.startsWith('<svg') || head.startsWith('<?xml');
				rec.cell({
					...base,
					status: ok ? 'pass' : 'fail',
					outBytes: art.bytes.length,
					metrics: { svgBytes: art.bytes.length },
					durationMs: elapsed()
				});
				recorded = true;
				expect(ok, `svg output must start with <svg or <?xml: ${head.slice(0, 60)}`).toBe(true);
			} else {
				const v = await verifyImageRow(c.f, input, art, id, {
					outFormat: c.target,
					sameFormat: c.sameFormat
				});
				rec.cell({
					...base,
					status: v.failures.length ? 'fail' : 'pass',
					outBytes: art.bytes.length,
					keptOriginal: v.keptOriginal,
					metrics: v.metrics,
					durationMs: elapsed(),
					rasters: v.rasters,
					notes: v.notes.join('; ')
				});
				recorded = true;
				expect(v.failures, v.failures.join(' | ')).toEqual([]);
			}
		} catch (error) {
			if (!recorded)
				rec.cell({
					...base,
					status: 'error',
					durationMs: elapsed(),
					error: String(error).slice(0, 500)
				});
			throw error;
		}
	});
}

// --- D) spot checks: resize cap, target size, impossible target -------------

const resizeRep = largestUnder(jpgFiles, 20_000_000);
if (resizeRep) {
	const f = resizeRep;
	test(`MX [images] ${f.rel} :: resize @1000px`, async ({ page }) => {
		const input = readFileSync(f.abs);
		const srcM = await imageMeta(input);
		const elapsed = timer();
		const id = rec.id(f.rel, 'resize', '1000px');
		const base = {
			family: 'images',
			file: f.rel,
			tool: '/resize-image',
			action: 'resize',
			level: '1000px',
			inBytes: input.length
		};
		try {
			await gotoPath(page, '/resize-image');
			await upload(page, f.abs);
			await setOutputFormat(page, 'JPG'); // deterministic decode-back target
			await setMaxDimension(page, 1000);
			await compress(page, { timeout: 240_000 });
			const art = await downloadRow(page);
			const m = await imageMeta(art.bytes);
			const scale = Math.min(1, 1000 / Math.max(srcM.width, srcM.height));
			const expW = Math.round(srcM.width * scale);
			const expH = Math.round(srcM.height * scale);
			const failures: string[] = [];
			if (scale < 1 && Math.max(m.width, m.height) !== 1000)
				failures.push(`longest side ${Math.max(m.width, m.height)} != 1000`);
			// ±1 px absorbs rounding-kernel differences; aspect must survive.
			if (Math.abs(m.width - expW) > 1 || Math.abs(m.height - expH) > 1)
				failures.push(`dims ${m.width}x${m.height} != ~${expW}x${expH}`);
			const q = await metricsVsRef(input, art.bytes); // original lanczos3-aligned
			if (q.psnr < HARD_PSNR_FLOOR) failures.push(`psnr ${q.psnr.toFixed(1)} < ${HARD_PSNR_FLOOR}`);
			const rasters: string[] = [];
			const beforePng = await toPngAny(input);
			const afterPng = await toPngAny(art.bytes);
			if (beforePng && afterPng)
				rasters.push(await rec.saveSideBySide(id, 'side.png', beforePng, afterPng));
			rec.cell({
				...base,
				status: failures.length ? 'fail' : 'pass',
				outBytes: art.bytes.length,
				metrics: {
					outWidth: m.width,
					outHeight: m.height,
					psnr: Number(q.psnr.toFixed(1)),
					noDownscaleNeeded: scale === 1
				},
				durationMs: elapsed(),
				rasters,
				notes: scale === 1 ? 'source already within 1000 px — dims must stay unchanged' : ''
			});
			expect(failures, failures.join(' | ')).toEqual([]);
		} catch (error) {
			rec.cell({
				...base,
				status: 'error',
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}

const kbRep = jpgFiles
	.filter((f) => f.bytes >= 1_000_000 && f.bytes <= 5_000_000)
	.sort((a, b) => a.bytes - b.bytes)[0];
if (kbRep) {
	const f = kbRep;
	test(`MX [images] ${f.rel} :: target-100kb @default`, async ({ page }) => {
		const input = readFileSync(f.abs);
		const elapsed = timer();
		const id = rec.id(f.rel, 'target', '100kb');
		const base = {
			family: 'images',
			file: f.rel,
			tool: '/compress-jpg-to-100kb',
			action: 'target',
			level: '100kb',
			inBytes: input.length
		};
		try {
			await gotoPath(page, '/compress-jpg-to-100kb'); // arrives in target mode, 100 typed in
			await upload(page, f.abs);
			const run = await compress(page, { timeout: 240_000 });
			const art = await downloadRow(page);
			const m = await imageMeta(art.bytes);
			const hitTarget = art.bytes.length <= 110_000; // corrective-pass tolerance
			const warned = run.warnings.length > 0;
			const failures: string[] = [];
			if (m.format !== 'jpeg') failures.push(`format ${m.format} != jpeg`);
			if (!hitTarget && !warned)
				failures.push(`missed 100 KB (${art.bytes.length} B) with no row-warning`);
			const rasters: string[] = [];
			const afterPng = await toPngAny(art.bytes);
			if (afterPng) rasters.push(await rec.saveRaster(id, 'after.png', afterPng));
			rec.cell({
				...base,
				status: failures.length ? 'fail' : 'pass',
				outBytes: art.bytes.length,
				metrics: { hitTarget, warning: run.warnings.join(' | ').slice(0, 300) || null },
				durationMs: elapsed(),
				rasters,
				notes: hitTarget ? '' : 'target missed but honestly warned'
			});
			expect(failures, failures.join(' | ')).toEqual([]);
		} catch (error) {
			rec.cell({
				...base,
				status: 'error',
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}

const impossibleRep = largestUnder(jpgFiles, 60_000_000);
if (impossibleRep) {
	const f = impossibleRep;
	test(`MX [images] ${f.rel} :: target-1kb @impossible`, async ({ page }) => {
		test.setTimeout(600_000); // target mode runs corrective encode passes
		const input = readFileSync(f.abs);
		const elapsed = timer();
		const base = {
			family: 'images',
			file: f.rel,
			tool: '/compress-jpg',
			action: 'target',
			level: '1kb-impossible',
			inBytes: input.length
		};
		try {
			await gotoPath(page, '/compress-jpg');
			await upload(page, f.abs);
			await setTargetKb(page, 1);
			const run = await compress(page, { timeout: 480_000 });
			const art = await downloadRow(page); // best-effort output must still exist
			const warned = run.warnings.length > 0;
			rec.cell({
				...base,
				status: warned ? 'pass' : 'fail',
				outBytes: art.bytes.length,
				metrics: { warning: run.warnings.join(' | ').slice(0, 300) || null },
				durationMs: elapsed(),
				notes: warned ? '' : 'impossible target produced no row-warning (silent miss)'
			});
			expect(warned, 'a 1 KB target on a large photo must warn, not stay silent').toBe(true);
		} catch (error) {
			rec.cell({
				...base,
				status: 'error',
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}

// --- E) EXIF strip on a real exif-bearing jpg -------------------------------

test('MX [images] exif-bearing-jpg :: remove-exif @default', async ({ page }) => {
	// Runtime discovery: EXIF presence needs the bytes, not the name.
	let target: RealFile | null = null;
	let input: Buffer | null = null;
	for (const f of jpgFiles) {
		const bytes = readFileSync(f.abs);
		if ((await exifMeta(bytes)).exif !== null) {
			target = f;
			input = bytes;
			break;
		}
	}
	test.skip(!target, 'no exif-bearing real jpg present');
	const elapsed = timer();
	const id = rec.id(target!.rel, 'remove-exif', 'default');
	const base = {
		family: 'images',
		file: target!.rel,
		tool: '/remove-exif',
		action: 'remove-exif',
		level: 'default',
		inBytes: input!.length
	};
	try {
		await gotoPath(page, '/remove-exif');
		await upload(page, target!.abs);
		await compress(page, { timeout: 240_000 });
		const art = await downloadRow(page);
		const failures: string[] = [];
		const outExif = await exifMeta(art.bytes);
		if (outExif.exif !== null) failures.push('EXIF payload survived the strip');
		const srcM = await imageMeta(input!);
		const m = await imageMeta(art.bytes);
		if (m.width !== srcM.width || m.height !== srcM.height)
			failures.push(`dims ${m.width}x${m.height} != ${srcM.width}x${srcM.height}`);
		// Byte surgery, not re-encode — pixels must be near-identical.
		const q = await metricsVsRef(input!, art.bytes);
		if (q.psnr <= 40) failures.push(`psnr ${q.psnr.toFixed(1)} <= 40 (pixels changed)`);
		const rasters: string[] = [];
		const beforePng = await toPngAny(input!);
		const afterPng = await toPngAny(art.bytes);
		if (beforePng && afterPng)
			rasters.push(await rec.saveSideBySide(id, 'side.png', beforePng, afterPng));
		rec.cell({
			...base,
			status: failures.length ? 'fail' : 'pass',
			outBytes: art.bytes.length,
			metrics: { psnr: Number(q.psnr.toFixed(1)), exifStripped: outExif.exif === null },
			durationMs: elapsed(),
			rasters
		});
		expect(failures, failures.join(' | ')).toEqual([]);
	} catch (error) {
		rec.cell({
			...base,
			status: 'error',
			durationMs: elapsed(),
			error: String(error).slice(0, 500)
		});
		throw error;
	}
});
