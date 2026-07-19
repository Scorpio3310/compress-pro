import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import {
	compress,
	downloadCombined,
	downloadRow,
	gotoPath,
	rasterizePdfInPage,
	rasterizeVideoFramesInPage,
	rasterizeVideoFramesViaFsInPage,
	setAudioBitrate,
	setContainer,
	setMaxDimension,
	setOutputFormat,
	setPdfLevel,
	setQuality,
	upload
} from '../helpers';
import { glbInfo, glbJson, psnr, unzip, videoInfo, xlsxInfo } from '../verify';
import { fitDimensions } from '../../src/lib/codecs/video-math';
import { readExifSummary } from '../../src/lib/codecs/exif-parse';
import type { DemoCredit, DemoKind, DemoStats } from '../../src/lib/types';

/**
 * Before/after demo generator (`pnpm demo-assets`, one kind: `--grep svg`):
 * every demo drives the REAL tool page — the downloaded bytes are the official
 * numbers, reproducible by any visitor — then writes display derivatives plus
 * the shared manifest. Rules that keep the demos honest:
 * - a kind's assets may only come from its own page's pipeline (seo.test.ts
 *   pins the kind↔page map);
 * - crops are 1:1 (a downscale would hide exactly the artifacts the demo
 *   claims to show) and both sides get an IDENTICAL delivery encode, so
 *   delivery artifacts are common-mode;
 * - numbers always refer to the complete files and use the same rounding as
 *   the app UI (compress.ts savingsPercent).
 * The manifest is read-modify-written per kind — workers: 1 in
 * playwright.demo.config.ts is load-bearing.
 */

const REAL = join('tests', 'fixtures', 'real');
const OUT_DIR = join('src', 'lib', 'assets', 'demo');
const MANIFEST = join('src', 'lib', 'demo-stats.json');
const KIND_ORDER: DemoKind[] = [
	'photo',
	'png',
	'webp',
	'heic',
	'gif',
	'svg',
	'pdf',
	'video',
	'audio',
	'font',
	'archive',
	'exif',
	'ocr',
	'subtitle',
	'ebook',
	'model',
	'data'
];

// Authored demo inputs (subtitle/data) — deterministic bytes written into the
// gitignored real-fixtures dir, so the byte-for-byte source check in
// demo-stats.test.ts sees them like any other demo source. Self-authored:
// no license, no credit line. The SRT describes Méliès' 1902 "A Trip to the
// Moon" (public domain), the CSV is public-record alpine data.
const SRT_FIXTURE = join(REAL, 'demo-moon-voyage.srt');
const CSV_FIXTURE = join(REAL, 'demo-peaks.csv');
writeFileSync(
	SRT_FIXTURE,
	[
		'1',
		'00:00:12,000 --> 00:00:15,500',
		'The astronomers gather for the great congress.',
		'',
		'2',
		'00:00:42,250 --> 00:00:46,000',
		'The capsule is loaded into the giant cannon.',
		'',
		'3',
		'00:01:03,800 --> 00:01:07,400',
		'<i>Fire!</i> The voyage to the Moon begins.',
		'',
		'4',
		'00:01:28,500 --> 00:01:32,000',
		'The Man in the Moon takes the rocket in the eye.',
		''
	].join('\n')
);
writeFileSync(
	CSV_FIXTURE,
	[
		'Peak,Country,Elevation_m,First_ascent',
		'Triglav,Slovenia,2864,1778',
		'Mont Blanc,France,4808,1786',
		'Matterhorn,Switzerland,4478,1865',
		'Grossglockner,Austria,3798,1800',
		'Monte Rosa,Switzerland,4634,1855',
		'Säntis,Switzerland,2502,1846',
		''
	].join('\n')
);

// q85 = keeps a real photo's noise under budget without denoising; 4:2:0
// matches the app's own JPEG output subsampling. Applied to BOTH sides.
const DELIVERY_JPEG = { quality: 85, mozjpeg: true, chromaSubsampling: '4:2:0' } as const;
const DELIVERY_WEBP = { quality: 85 } as const;

// The guide's pages are letter (612×792 pt), so 4310 px never clamps
// pdf.js's native scale 4 → the render is a full 288 DPI (2448×3168) —
// comfortably above the Medium preset's 150 DPI images, so the render can't
// hide what Ghostscript did (a low-DPI render would downscale away exactly
// the artifacts the demo claims to show; demo-stats.test.ts pins ≥250).
// Full-page renders land in test-results/demo-tmp/ — that's where PDF_PAGE
// and PDF_CROP get tuned: the window must contain a photo AND body text
// (text staying vector-crisp is the PDF-specific point), and must avoid the
// Industry Partners section (~pp. 66–74) — partner-supplied photos are the
// one licensing risk in an otherwise pure US-government work.
// 1224 (not 1440) because the guide is a two-column letter layout: a clean
// single-column window — no neighbouring column cut mid-line — is ~1250 px
// at 288 DPI. DemoCompare caps the pdf slider at width/2 CSS px so the crop
// still displays 1:1 on 2x screens.
const PDF_RENDER_MAX_PX = 4310;
const PDF_PAGE = 47;
const PDF_CROP: Crop = { left: 24, top: 1672, width: 1224, height: 1216 };

// Tuned against the full-frame renders in test-results/demo-tmp/
// video-render-{before,after}.png (PDF_PAGE/PDF_CROP precedent). The frame is
// picked for a detailed, low-motion-blur moment; the crop is a 1:1 window in
// the FITTED (1920-wide) render space both sides now share — full frame
// height, face right of center, skipping the far-left bokeh band where q75
// falls apart hardest.
// The timestamp targets the MIDDLE of the frame's interval: a seek landing
// exactly on a frame boundary (e.g. 6.5 s × 30 fps = frame 195.0) may present
// either neighbor depending on each file's timescale rounding — the shipped
// slider once compared frames 194 vs 195 because of exactly that. The
// mediaTime assert in videoStillRender is the proof both sides show the same
// moment; this constant is what makes it pass.
const VIDEO_STILL_FRAME = 195;
const VIDEO_STILL_AT_SEC = (VIDEO_STILL_FRAME + 0.5) / 30;
const VIDEO_CROP: Crop = { left: 286, top: 0, width: 1350, height: 1012 };
// The video demo's headline move: the guide's own "website upload" preset —
// quality 75 plus a 1920 px cap. Without the resize the q75 curve at 4K
// (~35 Mbps) sits above this fixture's own 24 Mbps and savings collapse to
// whatever capBySourceBitrate shaves; the resize is what the page teaches
// ("Where the big savings hide") and what the caption narrates.
const VIDEO_MAX_DIMENSION = 1920;

interface Crop {
	left: number;
	top: number;
	width: number;
	height: number;
}

interface RenderOut {
	before: Buffer;
	after: Buffer;
	ext: 'jpg' | 'png' | 'webp' | 'svg' | 'mp3' | 'ttf' | 'woff2';
	/** font: the two sides keep their own container extensions. */
	beforeExt?: RenderOut['ext'];
	afterExt?: RenderOut['ext'];
	/** archive: the demo is numbers + a manifest — no display files at all. */
	noAssets?: true;
	/** ocr: only the before side ships — the "after" is display.text. */
	singleAsset?: true;
	width: number;
	height: number;
	shows: 'crop' | 'frame' | 'file' | 'render';
	crop?: Crop;
	frame?: { index: number; ofFrames: number };
	/** pdf: the raster frame the crop was cut from. */
	render?: { page: number; width: number; height: number; dpi: number };
	/** video: the shared timestamp both stills were rasterized at. */
	still?: { atSec: number };
	/** archive: folder manifest + the SECOND run's ZIP size (7Z is primary). */
	archive?: { entries: { name: string; bytes: number }[]; zipBytes: number };
	/** exif: what the app's own parser found in the original (gone after). */
	metadata?: { camera: string | null; taken: string | null; gps: string | null; fields: number };
	/** Text kinds: the actual file text, verbatim (see DemoStats.display). */
	text?: { before?: string; after?: string };
	/** ocr: the page's own word-count claim + the pinned language. */
	ocr?: { words: number; lang: string };
	/** subtitle: cue count (from the page's own row info) + from→to. */
	subtitle?: { cues: number; from: string; to: string };
	/** data: rows read back from the DOWNLOADED xlsx (row 0 = header). */
	sheet?: { rows: (string | number)[][] };
	/** model: input geometry stats + the page's own texture claim + the pins
	 *  the caption narrates. */
	model?: {
		triangles: number;
		vertices: number;
		texturesChanged: number;
		texturesTotal: number;
		codec: 'draco' | 'meshopt';
		textureMaxDimension: number | null;
	};
	/** ebook: which archive entry the display pair was derived from. */
	entryName?: string;
}

interface DemoJob {
	kind: DemoKind;
	page: string;
	fixture: string;
	/** archive: the whole uploaded folder (fixture stays the first entry). */
	fixtures?: string[];
	/** Bundling outputs (archive create) land as the combined result row. */
	download?: 'combined';
	engine: string;
	quality?: number;
	precision?: number;
	/** pdf: the preset pill the run is pinned to. */
	level?: string;
	/** audio: the bitrate pill the run is pinned to. */
	bitrateKbps?: number;
	/** video: the max-dimension pin — the resize is part of the result the
	 *  caption narrates (4K in, 1080p out). */
	maxDimension?: number;
	outputFormat: string;
	formatChanged?: boolean;
	/** subtitle/data: the output is legitimately BIGGER than the input (WEBVTT
	 *  header, XLSX container) — the demo tells a structure story, not bytes. */
	growthOk?: true;
	budgetBytes: number;
	/** pdf pushes 62 MB through Ghostscript wasm — far slower than 120 s. */
	compressTimeoutMs?: number;
	credit?: DemoCredit;
	drive(p: Page): Promise<void>;
	sniff(bytes: Buffer): void;
	render(input: Buffer, output: Buffer, p: Page): Promise<RenderOut>;
	/** Runs after gotoPath, before the real upload. pdf: pushes a tiny file
	 *  through first so a cold Vite server discovers + optimizes the engine's
	 *  dynamic imports on a cheap run — the "new dependencies optimized"
	 *  full-page reload would otherwise kill the 62 MB run mid-compress. */
	warmup?(p: Page): Promise<void>;
	/** Manifest `input` fields (minus name) when the sharp default doesn't
	 *  apply: heic (sips decode), pdf (page count instead of dimensions). */
	describeInput?(input: Buffer): Promise<Omit<DemoStats['input'], 'name'>>;
	/** gif: SECOND real tool run (same file, extra settings — e.g. a resize)
	 *  whose verbatim output ships as a live animated preview. */
	anim?: { drive(p: Page): Promise<void>; maxDimension: number; budgetBytes: number };
	/** video: SECOND real tool run (same file, quality + resize) whose verbatim
	 *  output ships as a playable <video> preview, plus a committed poster
	 *  frame so preload="none" costs no video bytes until play. */
	clip?: {
		drive(p: Page): Promise<void>;
		maxDimension: number;
		quality: number;
		posterAtSec: number;
		budgetBytes: number;
		posterBudgetBytes: number;
	};
}

// ------------------------------------------------------------------- sniffers

const expectJpeg = (b: Buffer) => {
	expect(b[0], 'JPEG magic').toBe(0xff);
	expect(b[1]).toBe(0xd8);
};
const expectPng = (b: Buffer) =>
	expect(b.subarray(1, 4).toString('latin1'), 'PNG magic').toBe('PNG');
const expectWebp = (b: Buffer) => {
	expect(b.subarray(0, 4).toString('latin1'), 'RIFF magic').toBe('RIFF');
	expect(b.subarray(8, 12).toString('latin1'), 'WEBP magic').toBe('WEBP');
};
const expectGif = (b: Buffer) =>
	expect(b.subarray(0, 4).toString('latin1'), 'GIF magic').toBe('GIF8');
const expectSvg = (b: Buffer) =>
	expect(b.toString('utf8', 0, 200).trimStart().startsWith('<'), 'SVG must be markup').toBe(true);
const expectPdf = (b: Buffer) =>
	expect(b.subarray(0, 5).toString('latin1'), 'PDF magic').toBe('%PDF-');
const expectMp4 = (b: Buffer) =>
	expect(b.subarray(4, 8).toString('latin1'), 'MP4 ftyp magic').toBe('ftyp');
const expectMp3 = (b: Buffer) =>
	expect(
		// ID3v2 tag or a bare MPEG frame sync — both are valid MP3 leads.
		b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
		'MP3 magic'
	).toBe(true);
const expectWoff2 = (b: Buffer) =>
	expect(b.subarray(0, 4).toString('latin1'), 'WOFF2 magic').toBe('wOF2');
const expect7z = (b: Buffer) =>
	expect(
		b.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])),
		'7z magic'
	).toBe(true);
const expectTxt = (b: Buffer) =>
	expect(b.length, 'txt output must not be empty').toBeGreaterThan(0);
const expectVtt = (b: Buffer) => expect(b.toString('utf8', 0, 6), 'WEBVTT magic').toBe('WEBVTT');
const expectZip = (b: Buffer) =>
	expect(b.subarray(0, 2).toString('latin1'), 'ZIP magic').toBe('PK');
const expectGlb = (b: Buffer) => expect(b.readUInt32LE(0), 'GLB magic').toBe(0x46546c67);

// ------------------------------------------------------------ render helpers

function assertMcuAligned(crop: Crop) {
	// 16-px aligned so the crop keeps the full file's block phase — the
	// artifacts shown are the real file's artifacts, block for block.
	expect(crop.left % 16, 'crop left must stay MCU-aligned').toBe(0);
	expect(crop.top % 16, 'crop top must stay MCU-aligned').toBe(0);
}

/** The identical absolute crop only compares the same content while input and
 *  output share dimensions — the app's decode-time giant downscale (or any
 *  future cap) would silently shift the after-side window otherwise. */
async function assertSameDims(input: Buffer, output: Buffer) {
	const metaIn = await sharp(input).metadata();
	const metaOut = await sharp(output).metadata();
	expect(
		{ width: metaOut.width, height: metaOut.height },
		'output was resized — the identical crop would show different content'
	).toEqual({ width: metaIn.width, height: metaIn.height });
}

function cropRender(crop: Crop, fmt: 'jpeg' | 'webp' | 'png') {
	if (fmt !== 'png') assertMcuAligned(crop);
	const encode = (b: Buffer) => {
		const s = sharp(b).extract(crop);
		if (fmt === 'jpeg') return s.jpeg(DELIVERY_JPEG).toBuffer();
		if (fmt === 'webp') return s.webp(DELIVERY_WEBP).toBuffer();
		// PNG delivery is lossless — palette artifacts survive bit-exactly.
		return s.png().toBuffer();
	};
	return async (input: Buffer, output: Buffer): Promise<RenderOut> => {
		await assertSameDims(input, output);
		return {
			before: await encode(input),
			after: await encode(output),
			ext: fmt === 'jpeg' ? 'jpg' : fmt,
			width: crop.width,
			height: crop.height,
			shows: 'crop',
			crop
		};
	};
}

/** sharp cannot decode real-world HEIC here — macOS sips does the before-side
 *  decode (same tool scripts/generate-fixtures.mjs uses; macOS-only, fine:
 *  the generated assets are committed). */
function heicCropRender(crop: Crop) {
	assertMcuAligned(crop);
	return async (input: Buffer, output: Buffer): Promise<RenderOut> => {
		const tmpDir = join('test-results', 'demo-tmp');
		mkdirSync(tmpDir, { recursive: true });
		const tmpHeic = join(tmpDir, 'heic-src.heic');
		const tmpPng = join(tmpDir, 'heic-src.png');
		writeFileSync(tmpHeic, input);
		execFileSync('sips', ['-s', 'format', 'png', tmpHeic, '--out', tmpPng], { stdio: 'pipe' });
		const decoded = readFileSync(tmpPng);
		await assertSameDims(decoded, output);
		return {
			before: await sharp(decoded).extract(crop).jpeg(DELIVERY_JPEG).toBuffer(),
			after: await sharp(output).extract(crop).jpeg(DELIVERY_JPEG).toBuffer(),
			ext: 'jpg',
			width: crop.width,
			height: crop.height,
			shows: 'crop',
			crop
		};
	};
}

/** Frame 0 of both animations, delivered as LOSSLESS WebP (photographic
 *  paletted frames pack ~35% tighter than PNG at identical pixels). Frame 0
 *  because gifsicle's -O3 dedupe can drop/merge LATER frames — index 0 is the
 *  only index guaranteed to show the same moment in both files. */
function gifFrameRender() {
	return async (input: Buffer, output: Buffer): Promise<RenderOut> => {
		const pagesIn = (await sharp(input).metadata()).pages ?? 1;
		const pagesOut = (await sharp(output).metadata()).pages ?? 1;
		expect(pagesIn, 'source GIF must be animated').toBeGreaterThanOrEqual(2);
		expect(pagesOut, 'output GIF must stay animated').toBeGreaterThanOrEqual(2);
		const before = await sharp(input, { page: 0 }).webp({ lossless: true }).toBuffer();
		const after = await sharp(output, { page: 0 }).webp({ lossless: true }).toBuffer();
		const meta = await sharp(before).metadata();
		return {
			before,
			after,
			ext: 'webp',
			width: meta.width!,
			height: meta.height!,
			shows: 'frame',
			frame: { index: 0, ofFrames: pagesOut }
		};
	};
}

/** Both PDFs rendered by the app's own pdf.js at full preview fidelity
 *  (288 DPI — see PDF_RENDER_MAX_PX), then the identical 1:1 crop from both
 *  renders. No MCU alignment: the source is a render, not a JPEG. */
function pdfCropRender(pageNum: number, crop: Crop) {
	return async (input: Buffer, output: Buffer, p: Page): Promise<RenderOut> => {
		const beforePng = await rasterizePdfInPage(p, input, pageNum, PDF_RENDER_MAX_PX);
		const afterPng = await rasterizePdfInPage(p, output, pageNum, PDF_RENDER_MAX_PX);
		expect(
			beforePng && afterPng,
			'pdf render needs the dev server — never run demo-assets under E2E_PREVIEW'
		).toBeTruthy();

		// Full-page renders are the tuning artifacts for PDF_PAGE / PDF_CROP.
		const tmpDir = join('test-results', 'demo-tmp');
		mkdirSync(tmpDir, { recursive: true });
		writeFileSync(join(tmpDir, 'pdf-render-before.png'), beforePng!);
		writeFileSync(join(tmpDir, 'pdf-render-after.png'), afterPng!);

		// Ghostscript preserves page boxes, so both sides clamp to the same
		// scale — the slider would silently lie if the dimensions diverged.
		const metaB = await sharp(beforePng!).metadata();
		const metaA = await sharp(afterPng!).metadata();
		expect({ width: metaA.width, height: metaA.height }).toEqual({
			width: metaB.width,
			height: metaB.height
		});
		expect(crop.left + crop.width).toBeLessThanOrEqual(metaB.width!);
		expect(crop.top + crop.height).toBeLessThanOrEqual(metaB.height!);

		// Achieved DPI from the page's true size in points — interpolated into
		// the caption, so the copy can never overstate the render.
		const doc = await PDFDocument.load(input, { ignoreEncryption: true });
		const widthPt = doc.getPage(pageNum - 1).getSize().width;
		const dpi = Math.round((72 * metaB.width!) / widthPt);

		return {
			before: await sharp(beforePng!).extract(crop).jpeg(DELIVERY_JPEG).toBuffer(),
			after: await sharp(afterPng!).extract(crop).jpeg(DELIVERY_JPEG).toBuffer(),
			ext: 'jpg',
			width: crop.width,
			height: crop.height,
			shows: 'crop',
			crop,
			render: { page: pageNum, width: metaB.width!, height: metaB.height!, dpi }
		};
	};
}

/** The same frame of both files, rasterized by the browser's own
 *  <video>+canvas (both sides travel via /@fs — real videos are far past the
 *  CDP base64 limit). The run RESIZES (maxDimension), so BOTH sides render at
 *  the OUTPUT's fitted dimensions — the before drawn down by the browser's own
 *  sampler, the after 1:1 — because that is what a viewer's screen shows when
 *  playing the 1080p result (pdf's common-DPI render precedent). Rendering the
 *  after back UP to source dimensions was tried and shipped once: the 4K-sharp
 *  vs upscaled-1080p seam reads as a DIFFERENT picture (19 dB in bokeh
 *  regions), which buries the demo's actual message — same picture, smaller
 *  file. Then an identical 1:1 crop from both, delivered as q85 WebP
 *  (common-mode). No MCU alignment: the source is a canvas raster, not a
 *  JPEG. */
function videoStillRender(atSec: number, crop: Crop, maxDimension: number) {
	return async (input: Buffer, output: Buffer, p: Page): Promise<RenderOut> => {
		// The mp4 run must keep codec and duration, and land exactly on the
		// pipeline's own fit of the resize pin — a demo that silently trimmed
		// or transcoded further would overstate the tool.
		const inInfo = await videoInfo(input);
		const outInfo = await videoInfo(output);
		expect(outInfo.videoCodec, 'the mp4 run must encode H.264').toBe('avc');
		const fitted = fitDimensions(inInfo.width, inInfo.height, maxDimension);
		expect({ width: outInfo.width, height: outInfo.height }).toEqual({
			width: fitted.width,
			height: fitted.height
		});
		expect(Math.abs(outInfo.durationSec - inInfo.durationSec)).toBeLessThanOrEqual(0.3);
		expect(atSec, 'still timestamp must sit inside the clip').toBeLessThan(inInfo.durationSec);

		// Both sides at the output's fitted scale (drawSize is a no-op for the
		// after, which already IS fitted) — see the render-philosophy comment
		// above the function.
		const beforeFrames = await rasterizeVideoFramesViaFsInPage(p, input, 'mp4', [atSec], fitted);
		const afterFrames = await rasterizeVideoFramesViaFsInPage(p, output, 'mp4', [atSec], fitted);
		expect(
			beforeFrames && afterFrames,
			'video render needs the dev server — never run demo-assets under E2E_PREVIEW'
		).toBeTruthy();
		const beforePng = beforeFrames![0].frame;
		const afterPng = afterFrames![0].frame;

		// The proof both sides show the SAME moment: the presentation timestamp
		// of the frame each decoder actually drew. A seek that lands exactly on
		// a frame boundary may present either neighbor (shipped once as frames
		// 194 vs 195) — mid-interval atSec makes this pass, this assert keeps it.
		const fps = Math.round(inInfo.frameRate ?? 30);
		const mtBefore = beforeFrames![0].mediaTime;
		const mtAfter = afterFrames![0].mediaTime;
		expect(Number.isFinite(mtBefore), 'before frame needs a mediaTime').toBe(true);
		expect(Number.isFinite(mtAfter), 'after frame needs a mediaTime').toBe(true);
		expect(
			Math.abs(mtBefore - mtAfter),
			`slider would compare different frames (before ${mtBefore}s vs after ${mtAfter}s)`
		).toBeLessThan(0.5 / fps);

		// Full-frame renders are the tuning artifacts for VIDEO_STILL_FRAME /
		// VIDEO_CROP.
		const tmpDir = join('test-results', 'demo-tmp');
		mkdirSync(tmpDir, { recursive: true });
		writeFileSync(join(tmpDir, 'video-render-before.png'), beforePng);
		writeFileSync(join(tmpDir, 'video-render-after.png'), afterPng);

		// Both rasters must agree — the slider would silently lie otherwise.
		const metaB = await sharp(beforePng).metadata();
		const metaA = await sharp(afterPng).metadata();
		expect({ width: metaA.width, height: metaA.height }).toEqual({
			width: metaB.width,
			height: metaB.height
		});
		expect(crop.left + crop.width).toBeLessThanOrEqual(metaB.width!);
		expect(crop.top + crop.height).toBeLessThanOrEqual(metaB.height!);

		const before = await sharp(beforePng).extract(crop).webp(DELIVERY_WEBP).toBuffer();
		const after = await sharp(afterPng).extract(crop).webp(DELIVERY_WEBP).toBuffer();

		// Content-identity net under the timestamp proof: the same moment after
		// q75+resize sits well above 24 dB; a neighboring frame of a talking
		// subject falls under it. Logged so regressions have a trail.
		const stillPsnr = await psnr(before, after);
		console.log(
			`demo-assets[video]: still mediaTime ${mtBefore.toFixed(4)}s/${mtAfter.toFixed(4)}s, ` +
				`crop PSNR ${stillPsnr.toFixed(1)} dB`
		);
		expect(stillPsnr, 'stills must show the same moment').toBeGreaterThanOrEqual(24);

		return {
			before,
			after,
			ext: 'webp',
			width: crop.width,
			height: crop.height,
			shows: 'crop',
			crop,
			still: { atSec }
		};
	};
}

/** The assets ARE the files — original and SVGO output, byte for byte. */
function svgVerbatimRender() {
	return async (input: Buffer, output: Buffer): Promise<RenderOut> => {
		let width = 0;
		let height = 0;
		try {
			const meta = await sharp(input).metadata();
			width = meta.width ?? 0;
			height = meta.height ?? 0;
		} catch {
			/* fall through to viewBox parse */
		}
		if (!width || !height) {
			const vb = input.toString('utf8').match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/);
			if (vb) {
				width = Math.round(Number(vb[1]));
				height = Math.round(Number(vb[2]));
			}
		}
		expect(width, 'SVG intrinsic width').toBeGreaterThan(0);
		expect(height, 'SVG intrinsic height').toBeGreaterThan(0);
		return { before: input, after: output, ext: 'svg', width, height, shows: 'file' };
	};
}

/** The assets ARE the files — original and LAME output, byte for byte. Audio
 *  has no geometry; width/height 0 and the drift test's geometry guard skips
 *  dimensionless kinds. */
function audioVerbatimRender() {
	return async (input: Buffer, output: Buffer): Promise<RenderOut> => ({
		before: input,
		after: output,
		ext: 'mp3',
		width: 0,
		height: 0,
		shows: 'file'
	});
}

/** The assets ARE the files — TTF in, WOFF2 out, byte for byte. The specimen
 *  on the page is rendered BY the after-file via the FontFace API. */
function fontVerbatimRender() {
	return async (input: Buffer, output: Buffer): Promise<RenderOut> => ({
		before: input,
		after: output,
		ext: 'woff2',
		beforeExt: 'ttf',
		afterExt: 'woff2',
		width: 0,
		height: 0,
		shows: 'file'
	});
}

/** No display assets — the archive demo is a folder manifest + two archive
 *  sizes. The SECOND real run (ZIP on the same parked files) happens here;
 *  the primary run was 7Z. */
function archiveRender(fixtures: string[]) {
	return async (_input: Buffer, _output: Buffer, page: Page): Promise<RenderOut> => {
		const zipPill = page.getByRole('button', { name: 'ZIP', exact: true });
		await zipPill.click();
		await expect(zipPill).toHaveAttribute('aria-pressed', 'true');
		await compress(page, { timeout: 120_000 });
		const zip = await downloadCombined(page);
		expect(zip.bytes.subarray(0, 2).toString('latin1'), 'ZIP magic').toBe('PK');
		const total = fixtures.reduce((sum, f) => sum + statSync(f).size, 0);
		expect(zip.bytes.length, 'zip must also shrink the folder').toBeLessThan(total);
		return {
			before: Buffer.alloc(0),
			after: Buffer.alloc(0),
			noAssets: true,
			ext: 'jpg',
			width: 0,
			height: 0,
			shows: 'file',
			archive: {
				entries: fixtures.map((f) => ({ name: basename(f), bytes: statSync(f).size })),
				zipBytes: zip.bytes.length
			}
		};
	};
}

/** Pulls the APP1 Exif payload (bare TIFF) out of a JPEG, if any. */
function exifSegment(jpeg: Buffer): Buffer | null {
	let off = 2;
	while (off + 4 <= jpeg.length && jpeg[off] === 0xff) {
		const marker = jpeg[off + 1];
		if (marker === 0xda) break; // SOS — pixel data, no more metadata
		const len = jpeg.readUInt16BE(off + 2);
		if (marker === 0xe1 && jpeg.subarray(off + 4, off + 10).toString('latin1') === 'Exif\0\0') {
			return jpeg.subarray(off + 10, off + 2 + len);
		}
		off += 2 + len;
	}
	return null;
}

/** The demo is a metadata table: what the app's own parser finds in the
 *  original — and proves gone from the output. Pixels must stay byte-identical
 *  (that's the page's "lossless" promise, pinned here for the demo card). */
function exifRender(crop: Crop) {
	return async (input: Buffer, output: Buffer): Promise<RenderOut> => {
		const seg = exifSegment(input);
		expect(seg, 'input must carry an EXIF segment').toBeTruthy();
		const s = readExifSummary(seg!);
		expect(s.gps, 'input must carry GPS — the demo table leads with it').toBeTruthy();
		expect(exifSegment(output), 'output must carry NO EXIF').toBeNull();
		const [a, b] = await Promise.all([
			sharp(input).raw().toBuffer(),
			sharp(output).raw().toBuffer()
		]);
		expect(a.equals(b), 'pixels must be byte-identical').toBe(true);
		// The table is the demo; the photo is only the anchor — q80 keeps the
		// (duplicated before/after) thumb light, no artifact claim rides on it.
		const thumb = await sharp(input)
			.extract(crop)
			.jpeg({ quality: 80, mozjpeg: true, chromaSubsampling: '4:2:0' })
			.toBuffer();
		return {
			before: thumb,
			after: thumb,
			ext: 'jpg',
			width: crop.width,
			height: crop.height,
			shows: 'crop',
			crop,
			metadata: {
				camera: s.make && s.model ? `${s.make} ${s.model}` : (s.model ?? s.make),
				taken: s.dateTime,
				gps: s.gps
					? `${Math.abs(s.gps.lat).toFixed(4)}° ${s.gps.lat >= 0 ? 'N' : 'S'}, ${Math.abs(s.gps.lon).toFixed(4)}° ${s.gps.lon >= 0 ? 'E' : 'W'}`
					: null,
				fields: s.fieldCount
			}
		};
	};
}

/** The scan resized for display; the demo's "after" side is the recognized
 *  TEXT (display.text.after — the downloaded .txt, verbatim), so only one
 *  image ships. The word count the tiles cite is the page's own claim. */
function ocrRender(lang: string) {
	return async (input: Buffer, output: Buffer, p: Page): Promise<RenderOut> => {
		const text = output.toString('utf8').replace(/\f/g, '\n').trimEnd();
		expect(text.length, 'recognition must produce real text').toBeGreaterThan(100);
		const info = (await p.getByTestId('row-info').textContent()) ?? '';
		const uiWords = Number(/(\d[\d,]*)\s+words?\s+recognized/i.exec(info)?.[1]?.replace(/,/g, ''));
		expect(uiWords, `row info must report a word count (got: ${info})`).toBeGreaterThan(0);
		// The .txt's whitespace word count must track the engine's own claim —
		// a drifting pair would mean the panel and the tile tell different runs.
		const txtWords = text.split(/\s+/).length;
		expect(Math.abs(uiWords - txtWords)).toBeLessThanOrEqual(Math.ceil(uiWords * 0.1));
		const display = await sharp(input)
			.resize({ width: 1200, withoutEnlargement: true })
			.webp(DELIVERY_WEBP)
			.toBuffer();
		const meta = await sharp(display).metadata();
		return {
			before: display,
			after: Buffer.alloc(0),
			singleAsset: true,
			ext: 'webp',
			width: meta.width!,
			height: meta.height!,
			shows: 'render',
			text: { after: text },
			ocr: { words: uiWords, lang }
		};
	};
}

/** No display assets — both panels inline the complete actual files from the
 *  manifest (subtitle files are tiny text). */
function subtitleVerbatimRender() {
	return async (input: Buffer, output: Buffer, p: Page): Promise<RenderOut> => {
		const before = input.toString('utf8');
		const after = output.toString('utf8');
		expect(after.startsWith('WEBVTT'), 'output must be WebVTT').toBe(true);
		const info = (await p.getByTestId('row-info').textContent()) ?? '';
		const m = /SRT → VTT · (\d+) cues?/.exec(info);
		expect(m, `row info must report the conversion (got: ${info})`).toBeTruthy();
		return {
			before: Buffer.alloc(0),
			after: Buffer.alloc(0),
			noAssets: true,
			ext: 'jpg',
			width: 0,
			height: 0,
			shows: 'file',
			text: { before, after },
			subtitle: { cues: Number(m![1]), from: 'srt', to: 'vtt' }
		};
	};
}

/** Full-frame view of the same in-book illustration from BOTH containers —
 *  deterministic pick (the largest raster in the source, i.e. the title
 *  plate), identical q85 WebP delivery on both sides. */
function ebookIllustrationRender() {
	return async (input: Buffer, output: Buffer): Promise<RenderOut> => {
		const src = unzip(input);
		const out = unzip(output);
		const images = Object.keys(src)
			.filter((n) => /\.(jpe?g|png)$/i.test(n))
			.sort();
		expect(images.length, 'the demo book needs raster images').toBeGreaterThanOrEqual(10);
		const entryName = images.reduce((a, b) => (src[b].length > src[a].length ? b : a));
		const beforeImg = Buffer.from(src[entryName]);
		const afterImg = Buffer.from(out[entryName]);
		expect(afterImg.length, `${entryName} must have been recompressed`).toBeLessThan(
			beforeImg.length
		);
		await assertSameDims(beforeImg, afterImg);
		const meta = await sharp(beforeImg).metadata();
		return {
			before: await sharp(beforeImg).webp(DELIVERY_WEBP).toBuffer(),
			after: await sharp(afterImg).webp(DELIVERY_WEBP).toBuffer(),
			ext: 'webp',
			width: meta.width!,
			height: meta.height!,
			shows: 'frame',
			frame: { index: images.indexOf(entryName), ofFrames: images.length },
			entryName
		};
	};
}

/** Both GLBs rendered by three.js through the IDENTICAL fixed camera (framed
 *  once, from the before model) — bundled dev-only by esbuild and imported
 *  into the app page via /@fs (pdf/video rasterizer precedent). `three` is a
 *  devDependency that never touches the app bundle. */
function modelRender(width: number, height: number, textureMaxDimension: number) {
	return async (input: Buffer, output: Buffer, p: Page): Promise<RenderOut> => {
		const required =
			(glbJson(output) as { extensionsRequired?: string[] }).extensionsRequired ?? [];
		expect(required, 'the run must produce Draco geometry').toContain('KHR_draco_mesh_compression');
		const infoIn = await glbInfo(input);
		const uiInfo = (await p.getByTestId('row-info').textContent()) ?? '';
		const tex = /(\d+) of (\d+) textures? recompressed/.exec(uiInfo);
		expect(tex, `row info must report texture work (got: ${uiInfo})`).toBeTruthy();
		// The run must honor the pinned cap — every output texture within it.
		const infoOut = await glbInfo(output);
		for (const t of infoOut.textures) {
			expect(Math.max(t.width, t.height), 'texture must honor the cap').toBeLessThanOrEqual(
				textureMaxDimension
			);
		}

		expect(process.env.E2E_PREVIEW, 'model render needs the dev server').toBeFalsy();
		const tmpDir = join('.svelte-kit', 'rasterize-tmp');
		mkdirSync(tmpDir, { recursive: true });
		const rendererJs = join(tmpDir, 'model-renderer.js');
		execFileSync(
			join('node_modules', '.bin', 'esbuild'),
			[
				join('e2e', 'demo', 'model-renderer.ts'),
				'--bundle',
				'--format=esm',
				`--outfile=${rendererJs}`
			],
			{ stdio: 'pipe' }
		);
		const beforeGlb = join(tmpDir, 'model-demo-before.glb');
		const afterGlb = join(tmpDir, 'model-demo-after.glb');
		writeFileSync(beforeGlb, input);
		writeFileSync(afterGlb, output);
		const cwd = process.cwd();
		try {
			// Up to 5 attempts, 5 s apart — a dev-server reload or dep
			// re-optimization landing mid-fetch surfaces as a transient
			// "Failed to fetch" (rasterizePdfInPage precedent, measured here too).
			let pngs: { before: string; after: string } | undefined;
			let lastError: unknown;
			for (let attempt = 0; attempt < 5 && !pngs; attempt++) {
				try {
					pngs = await p.evaluate(
						async (args: {
							renderer: string;
							before: string;
							after: string;
							width: number;
							height: number;
							draco: string;
						}) => {
							// Indirect import so the test transpiler leaves the specifier alone.
							const load = new Function('p', 'return import(p)') as (p: string) => Promise<{
								renderGlbPair(
									b: string,
									a: string,
									w: number,
									h: number,
									d: string
								): Promise<{ before: string; after: string }>;
							}>;
							const mod = await load(args.renderer);
							return mod.renderGlbPair(
								args.before,
								args.after,
								args.width,
								args.height,
								args.draco
							);
						},
						{
							renderer: `/@fs${join(cwd, rendererJs)}`,
							before: `/@fs${join(cwd, beforeGlb)}`,
							after: `/@fs${join(cwd, afterGlb)}`,
							width,
							height,
							draco: `/@fs${join(cwd, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf')}/`
						}
					);
				} catch (error) {
					lastError = error;
					await p.waitForTimeout(5_000);
				}
			}
			if (!pngs) throw lastError;
			const decode = (dataUrl: string) => {
				expect(dataUrl.startsWith('data:image/png;base64,'), 'render must produce a PNG').toBe(
					true
				);
				return Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
			};
			const before = await sharp(decode(pngs.before)).webp(DELIVERY_WEBP).toBuffer();
			const after = await sharp(decode(pngs.after)).webp(DELIVERY_WEBP).toBuffer();
			// Same-model net: quantized geometry + re-encoded textures shift
			// pixels slightly; a wrong file/camera would crater the number.
			const pairPsnr = await psnr(before, after);
			console.log(`demo-assets[model]: render pair PSNR ${pairPsnr.toFixed(1)} dB`);
			expect(pairPsnr, 'renders must show the same model').toBeGreaterThanOrEqual(20);
			return {
				before,
				after,
				ext: 'webp',
				width,
				height,
				shows: 'render',
				model: {
					triangles: infoIn.triangles,
					vertices: infoIn.vertices,
					texturesChanged: Number(tex![1]),
					texturesTotal: Number(tex![2]),
					codec: 'draco',
					textureMaxDimension
				}
			};
		} finally {
			rmSync(beforeGlb, { force: true });
			rmSync(afterGlb, { force: true });
		}
	};
}

/** No display assets — the left panel inlines the CSV verbatim, the right
 *  panel renders rows read back from the DOWNLOADED xlsx with SheetJS. */
function dataSheetRender() {
	return async (input: Buffer, output: Buffer, p: Page): Promise<RenderOut> => {
		const info = await xlsxInfo(output);
		expect(info.sheetNames).toHaveLength(1);
		const rows = info.rows as (string | number)[][];
		expect(rows.length).toBeGreaterThanOrEqual(3);
		const uiInfo = (await p.getByTestId('row-info').textContent()) ?? '';
		expect(uiInfo).toContain(`CSV → XLSX · ${rows.length} rows × ${rows[0].length} columns`);
		return {
			before: Buffer.alloc(0),
			after: Buffer.alloc(0),
			noAssets: true,
			ext: 'jpg',
			width: 0,
			height: 0,
			shows: 'file',
			text: { before: input.toString('utf8') },
			sheet: { rows }
		};
	};
}

// --------------------------------------------------------------------- jobs

const JOBS: DemoJob[] = [
	{
		kind: 'photo',
		page: '/compress-jpg',
		fixture: join(REAL, 'magnific-12304873-seiser-alm.jpg'),
		engine: 'MozJPEG',
		quality: 75,
		outputFormat: 'jpg',
		budgetBytes: 240_000,
		credit: {
			author: 'Magnific',
			url: 'https://www.magnific.com/free-photo/landscape-seiser-alm-near-langkofel-group-mountains-sunlight-italy_12304873.htm',
			source: 'Magnific'
		},
		drive: async (p) => {
			await setOutputFormat(p, 'JPG');
			await setQuality(p, 75);
		},
		sniff: expectJpeg,
		render: cropRender({ left: 320, top: 320, width: 1440, height: 1080 }, 'jpeg')
	},
	{
		kind: 'png',
		page: '/compress-png',
		fixture: join(REAL, 'magnific-407746309-watercolor.png'),
		engine: 'libimagequant + OxiPNG',
		quality: 80,
		outputFormat: 'png',
		// Lossless PNG delivery of continuous-tone watercolor would run into
		// megabytes — the crops ship as identical high-quality WebP instead
		// (common-mode delivery; the palette's dithering survives it plainly).
		budgetBytes: 240_000,
		credit: {
			author: 'Magnific',
			url: 'https://www.magnific.com/free-psd/majestic-mountain-landscape-watercolor-masterpiece_407746309.htm',
			source: 'Magnific'
		},
		drive: async (p) => {
			// The tab defaults to Auto — the demo must pin real PNG output.
			await setOutputFormat(p, 'PNG');
			await setQuality(p, 80);
		},
		sniff: expectPng,
		render: cropRender({ left: 496, top: 16, width: 1440, height: 1080 }, 'webp')
	},
	{
		kind: 'webp',
		page: '/compress-webp',
		fixture: join(REAL, 'unsplash-Bkci_8qcdvQ-kalen-emsley.webp'),
		engine: 'libwebp',
		quality: 75,
		outputFormat: 'webp',
		budgetBytes: 240_000,
		credit: {
			author: 'Kalen Emsley',
			url: 'https://unsplash.com/photos/snow-capped-mountains-with-valley-and-forest-Bkci_8qcdvQ',
			source: 'Unsplash'
		},
		drive: async (p) => {
			await setOutputFormat(p, 'WebP');
			await setQuality(p, 75);
		},
		sniff: expectWebp,
		render: cropRender({ left: 864, top: 1152, width: 1440, height: 1080 }, 'webp')
	},
	{
		kind: 'heic',
		page: '/compress-heic',
		fixture: join(REAL, 'heicdigital-sewing-threads.heic'),
		engine: 'libheif → MozJPEG',
		quality: 75,
		outputFormat: 'jpg',
		formatChanged: true,
		budgetBytes: 240_000,
		credit: {
			author: 'HEIC Digital',
			url: 'https://heic.digital/samples/',
			source: 'HEIC Digital'
		},
		drive: async (p) => {
			await setOutputFormat(p, 'JPG');
			await setQuality(p, 75);
		},
		sniff: expectJpeg,
		render: heicCropRender({ left: 1280, top: 960, width: 1440, height: 1080 }),
		describeInput: async (input) => {
			const tmpDir = join('test-results', 'demo-tmp');
			mkdirSync(tmpDir, { recursive: true });
			const tmpHeic = join(tmpDir, 'heic-meta.heic');
			const tmpPng = join(tmpDir, 'heic-meta.png');
			writeFileSync(tmpHeic, input);
			execFileSync('sips', ['-s', 'format', 'png', tmpHeic, '--out', tmpPng], { stdio: 'pipe' });
			const meta = await sharp(readFileSync(tmpPng)).metadata();
			return {
				width: meta.width!,
				height: meta.height!,
				megapixels: Math.round((meta.width! * meta.height!) / 1e6)
			};
		}
	},
	{
		kind: 'gif',
		page: '/compress-gif',
		fixture: join(REAL, 'wikimedia-muybridge-cat.gif'),
		engine: 'gifsicle',
		quality: 80,
		outputFormat: 'gif',
		// Frame stills are photographic (1887 collotype plates) — even lossless
		// WebP of a 1231×551 paletted frame runs bigger than flat UI content.
		budgetBytes: 350_000,
		credit: {
			author: 'Eadweard Muybridge',
			url: 'https://commons.wikimedia.org/wiki/File:Cat_trotting,_changing_to_a_gallop.gif',
			source: 'Wikimedia Commons',
			license: 'public domain'
		},
		drive: async (p) => {
			await setOutputFormat(p, 'GIF');
			await setQuality(p, 80);
		},
		sniff: expectGif,
		render: gifFrameRender(),
		// Second run on the same parked file: the tool's own resize produces a
		// preview small enough to ship ANIMATED — its numbers are its own.
		anim: {
			drive: async (p) => {
				await setMaxDimension(p, 480);
			},
			maxDimension: 480,
			budgetBytes: 600_000
		}
	},
	{
		kind: 'svg',
		page: '/compress-svg',
		fixture: join(REAL, 'magnific-9899870-landscape.svg'),
		engine: 'SVGO',
		precision: 3,
		outputFormat: 'svg',
		budgetBytes: 100_000,
		credit: {
			author: 'Magnific',
			url: 'https://www.magnific.com/free-vector/natural-landscape-background-theme_9899870.htm',
			source: 'Magnific'
		},
		drive: async (p) => {
			// Defaults (preset-default, precision 3) ARE the demo settings —
			// just pin the pill so a preset drift can't flip the output.
			await setOutputFormat(p, 'SVG');
		},
		sniff: expectSvg,
		render: svgVerbatimRender()
	},
	{
		kind: 'pdf',
		page: '/compress-pdf',
		fixture: join(REAL, 'nasa-sls-reference-guide-2022.pdf'),
		engine: 'Ghostscript',
		level: 'medium',
		outputFormat: 'pdf',
		budgetBytes: 240_000,
		compressTimeoutMs: 540_000,
		credit: {
			author: 'NASA SLS Reference Guide (2022)',
			url: 'https://www.nasa.gov/humans-in-space/space-launch-system/reference-guide/',
			source: 'NASA',
			license: 'public domain'
		},
		drive: async (p) => {
			// Medium IS the default — pin the pill so a default drift can't
			// silently flip the demo's numbers (svg-job precedent).
			await setPdfLevel(p, 'Medium');
		},
		warmup: async (p) => {
			await upload(p, join('tests', 'fixtures', 'generated', 'text-3pages.pdf'));
			await compress(p, { timeout: 120_000 });
		},
		sniff: expectPdf,
		render: pdfCropRender(PDF_PAGE, PDF_CROP),
		describeInput: async (input) => ({
			pages: (await PDFDocument.load(input, { ignoreEncryption: true })).getPageCount()
		})
	},
	{
		kind: 'video',
		page: '/compress-mp4',
		fixture: join(REAL, 'magnific-474074-woman-selfie-stick.mp4'),
		engine: 'WebCodecs + mediabunny',
		quality: 75,
		outputFormat: 'mp4',
		budgetBytes: 300_000,
		// 1080p H.264 re-encode of a real clip — slower than the 120 s default.
		compressTimeoutMs: 300_000,
		credit: {
			author: 'Magnific',
			url: 'https://www.magnific.com/free-video/close-up-view-caucasian-blonde-young-woman-recording-video-smartphone-while-holding-it-with-selfie-stick-street_474074',
			source: 'Magnific'
		},
		maxDimension: VIDEO_MAX_DIMENSION,
		drive: async (p) => {
			// The landing page presets mp4 — pin the pill, the default quality AND
			// the 1920 px cap (the guide's own website preset) so a preset/default
			// drift can't flip the output (svg/pdf precedent).
			await setContainer(p, 'mp4');
			await setQuality(p, 75);
			await setMaxDimension(p, VIDEO_MAX_DIMENSION);
		},
		// A parallel session's new imports can invalidate Vite's optimize cache;
		// the resulting full-page reload mid-encode silently kills the 40 MB run
		// (pdf precedent) — spend the reload on a 3-second synthetic clip first.
		warmup: async (p) => {
			await upload(p, join('tests', 'fixtures', 'generated', 'video', 'v-320x240-3s.mp4'));
			await compress(p, { timeout: 120_000 });
		},
		sniff: expectMp4,
		render: videoStillRender(VIDEO_STILL_AT_SEC, VIDEO_CROP, VIDEO_MAX_DIMENSION),
		describeInput: async (input) => {
			const info = await videoInfo(input);
			// The bundled Chromium has no HEVC decoder, and the stills must show
			// the file end users see — plain unrotated H.264 only.
			expect(info.videoCodec, 'demo fixture must be H.264/AVC').toBe('avc');
			expect(info.rotation, 'demo fixture must be unrotated').toBe(0);
			expect(info.frameRate, 'demo fixture needs a measurable frame rate').toBeTruthy();
			return {
				width: info.width,
				height: info.height,
				megapixels: Math.round((info.width * info.height) / 1e6),
				durationSec: Math.round(info.durationSec * 10) / 10,
				fps: Math.round(info.frameRate!)
			};
		},
		// Second run on the same parked file: the tool's own resize produces a
		// preview small enough to ship PLAYABLE — its numbers are its own.
		clip: {
			drive: async (p) => {
				await setMaxDimension(p, 640);
				await setQuality(p, 50);
			},
			maxDimension: 640,
			quality: 50,
			posterAtSec: VIDEO_STILL_AT_SEC,
			budgetBytes: 1_500_000,
			posterBudgetBytes: 100_000
		}
	},
	{
		kind: 'audio',
		page: '/compress-audio',
		fixture: join(REAL, 'pixabay-564418-the-mountain-upbeat.mp3'),
		engine: 'LAME',
		bitrateKbps: 128,
		outputFormat: 'mp3',
		// BOTH complete files ship as the demo (audio has no visual crop; the
		// players use preload="none", so no bytes move until Play) — the
		// budget must cover the full-length original.
		budgetBytes: 5_000_000,
		credit: {
			author: 'The Mountain',
			url: 'https://pixabay.com/music/old-school-hip-hop-upbeat-564418/',
			source: 'Pixabay'
		},
		drive: async (p) => {
			// MP3 is the tab default — pin the pill anyway (svg/pdf precedent),
			// then the bitrate.
			const mp3 = p.getByRole('button', { name: 'MP3', exact: true });
			await mp3.click();
			await expect(mp3).toHaveAttribute('aria-pressed', 'true');
			await setAudioBitrate(p, 128);
		},
		sniff: expectMp3,
		render: audioVerbatimRender(),
		describeInput: async () => {
			// Duration via afinfo (macOS-only — the sips precedent); sharp
			// cannot read audio and the caption wants the track length.
			const out = execFileSync('afinfo', [join(REAL, 'pixabay-564418-the-mountain-upbeat.mp3')], {
				encoding: 'utf8'
			});
			const durationSec =
				Math.round(Number(out.match(/estimated duration: ([\d.]+)/)?.[1] ?? 0) * 10) / 10;
			expect(durationSec, 'audio input needs a duration').toBeGreaterThan(0);
			return { durationSec };
		}
	},
	{
		kind: 'font',
		page: '/font-converter',
		fixture: join(REAL, 'googlefonts-plus-jakarta-sans.ttf'),
		engine: 'woff2 + Brotli',
		outputFormat: 'woff2',
		formatChanged: true,
		budgetBytes: 300_000,
		credit: {
			author: 'Tokotype',
			url: 'https://fonts.google.com/specimen/Plus+Jakarta+Sans',
			source: 'Google Fonts',
			license: 'SIL Open Font License'
		},
		drive: async (p) => {
			// WOFF2 is the tab default — pin the pill anyway (svg/pdf precedent).
			const woff2 = p.getByRole('button', { name: 'WOFF2', exact: true });
			await woff2.click();
			await expect(woff2).toHaveAttribute('aria-pressed', 'true');
		},
		sniff: expectWoff2,
		render: fontVerbatimRender(),
		describeInput: async () => ({})
	},
	{
		kind: 'archive',
		page: '/zip-files',
		// Text is what archives actually compress (the page's own guide says
		// so) — a folder of media files archives to −1% and demos nothing.
		// Five public-domain classics from Project Gutenberg, committed as
		// fixtures with provenance in the fixtures README.
		fixture: join(REAL, 'gutenberg-2701-moby-dick.txt'),
		fixtures: [
			join(REAL, 'gutenberg-2701-moby-dick.txt'),
			join(REAL, 'gutenberg-1342-pride-and-prejudice.txt'),
			join(REAL, 'gutenberg-345-dracula.txt'),
			join(REAL, 'gutenberg-84-frankenstein.txt'),
			join(REAL, 'gutenberg-11-alice-in-wonderland.txt')
		],
		engine: '7-Zip',
		outputFormat: '7z',
		download: 'combined',
		budgetBytes: 1, // no display assets — noAssets render
		// ~19 MB of mixed files through 7z wasm at Balanced — give it headroom.
		compressTimeoutMs: 300_000,
		drive: async (p) => {
			// Create is the op default; pin 7Z (primary numbers) at the default
			// Balanced level. The ZIP comparison run happens in render().
			const sevenZ = p.getByRole('button', { name: '7Z', exact: true });
			await sevenZ.click();
			await expect(sevenZ).toHaveAttribute('aria-pressed', 'true');
			const balanced = p.getByRole('button', { name: 'Balanced', exact: true });
			await balanced.click();
			await expect(balanced).toHaveAttribute('aria-pressed', 'true');
		},
		sniff: expect7z,
		render: archiveRender([
			join(REAL, 'gutenberg-2701-moby-dick.txt'),
			join(REAL, 'gutenberg-1342-pride-and-prejudice.txt'),
			join(REAL, 'gutenberg-345-dracula.txt'),
			join(REAL, 'gutenberg-84-frankenstein.txt'),
			join(REAL, 'gutenberg-11-alice-in-wonderland.txt')
		]),
		describeInput: async () => ({})
	},
	{
		kind: 'exif',
		page: '/remove-exif',
		fixture: join(REAL, 'unsplash-pOWBHdgy1Lo-bled-exif.jpg'),
		engine: 'byte surgery',
		outputFormat: 'jpg',
		budgetBytes: 240_000,
		credit: {
			author: 'Neven Krcmarek',
			url: 'https://unsplash.com/photos/island-surrounded-by-water-and-mountains-at-daytime-pOWBHdgy1Lo',
			source: 'Unsplash'
		},
		// Defaults are the demo settings — nothing to pin on this tab.
		drive: async () => {},
		sniff: expectJpeg,
		render: exifRender({ left: 1200, top: 800, width: 1440, height: 1080 })
	},
	{
		kind: 'ocr',
		page: '/image-to-text',
		fixture: join(REAL, 'wikimedia-sherlock-1892-scandal-p3.jpg'),
		engine: 'Tesseract',
		outputFormat: 'txt',
		formatChanged: true,
		budgetBytes: 350_000,
		compressTimeoutMs: 300_000,
		credit: {
			author: 'Arthur Conan Doyle',
			url: 'https://commons.wikimedia.org/wiki/File:Doyle_-_Adventures_of_Sherlock_Holmes,_1892.djvu',
			source: 'Wikimedia Commons',
			license: 'public domain'
		},
		// Defaults are the demo settings: op toText, language English.
		drive: async () => {},
		sniff: expectTxt,
		render: ocrRender('eng')
	},
	{
		kind: 'subtitle',
		page: '/srt-to-vtt',
		fixture: SRT_FIXTURE,
		engine: 'pure JavaScript',
		outputFormat: 'vtt',
		formatChanged: true,
		// The WEBVTT header makes the output a few bytes BIGGER — that's the
		// caption's point, not a failure.
		growthOk: true,
		budgetBytes: 0,
		describeInput: async () => ({}),
		drive: async () => {},
		sniff: expectVtt,
		render: subtitleVerbatimRender()
	},
	{
		kind: 'ebook',
		page: '/compress-epub',
		fixture: join(REAL, 'gutenberg-14838-peter-rabbit.epub'),
		engine: 'MozJPEG + OxiPNG',
		quality: 80,
		outputFormat: 'epub',
		budgetBytes: 240_000,
		compressTimeoutMs: 300_000,
		credit: {
			author: 'Beatrix Potter',
			url: 'https://www.gutenberg.org/ebooks/14838',
			source: 'Project Gutenberg',
			license: 'public domain'
		},
		describeInput: async () => ({}),
		// Defaults are the demo settings: quality 80, no size cap.
		drive: async () => {},
		sniff: expectZip,
		render: ebookIllustrationRender()
	},
	{
		kind: 'model',
		page: '/compress-glb',
		fixture: join(REAL, 'polyhaven-camera-01-2k.glb'),
		engine: 'glTF Transform + Draco',
		outputFormat: 'glb',
		budgetBytes: 240_000,
		compressTimeoutMs: 300_000,
		credit: {
			author: 'Rajil Jose Macatangay',
			url: 'https://polyhaven.com/a/Camera_01',
			source: 'Poly Haven',
			license: 'CC0'
		},
		describeInput: async () => ({}),
		// Draco + texture quality 80 are the page defaults; the Max texture
		// size pill is pinned to 1024 px — the guide's own "usual culprit" fix
		// (video quality+resize precedent) — and the caption narrates it.
		drive: async (p) => {
			const cap = p.getByRole('button', { name: '1024 px', exact: true });
			await cap.click();
			await expect(cap).toHaveAttribute('aria-pressed', 'true');
		},
		sniff: expectGlb,
		render: modelRender(1280, 960, 1024)
	},
	{
		kind: 'data',
		page: '/csv-to-xlsx',
		fixture: CSV_FIXTURE,
		engine: 'SheetJS',
		outputFormat: 'xlsx',
		formatChanged: true,
		// A real .xlsx container is bigger than 200 B of CSV — structure story.
		growthOk: true,
		budgetBytes: 0,
		describeInput: async () => ({}),
		drive: async () => {},
		sniff: expectZip,
		render: dataSheetRender()
	}
];

// ---------------------------------------------------------------- manifest

function writeManifestEntry(kind: DemoKind, entry: Record<string, unknown>) {
	const current: Record<string, unknown> = existsSync(MANIFEST)
		? JSON.parse(readFileSync(MANIFEST, 'utf8'))
		: {};
	current[kind] = entry;
	const ordered: Record<string, unknown> = {};
	for (const k of KIND_ORDER) if (current[k]) ordered[k] = current[k];
	writeFileSync(MANIFEST, JSON.stringify(ordered, null, '\t') + '\n');
}

// ------------------------------------------------------------------- tests

for (const job of JOBS) {
	test(`generate ${job.kind} demo through ${job.page}`, async ({ page }) => {
		const allFixtures = job.fixtures ?? [job.fixture];
		const input = readFileSync(job.fixture);
		const originalBytes = allFixtures.reduce((sum, f) => sum + statSync(f).size, 0);
		const inputDesc = job.describeInput
			? await job.describeInput(input)
			: await sharp(input)
					.metadata()
					.then((m) => ({
						width: m.width!,
						height: m.height!,
						megapixels: Math.round((m.width! * m.height!) / 1e6)
					}));

		await gotoPath(page, job.page);
		if (job.warmup) {
			await job.warmup(page);
			// Fresh page state after the warm-up run (rows persist otherwise).
			await gotoPath(page, job.page);
		}
		// A dev-server full reload mid-run (a parallel session saving a source
		// file → HMR) silently wipes the rows: compress() then sees neither
		// results nor an error. The run is cheap to restage — do it once before
		// giving up instead of losing the whole job to someone else's keystroke.
		for (let attempt = 0; ; attempt++) {
			await upload(page, ...allFixtures);
			await job.drive(page);
			try {
				await compress(page, { timeout: job.compressTimeoutMs ?? 120_000 });
				break;
			} catch (error) {
				if (attempt >= 1 || !String(error).includes('neither results nor an error')) throw error;
				console.log(`demo-assets[${job.kind}]: run lost to a page reload — restaging once`);
				await gotoPath(page, job.page);
			}
		}
		const artifact =
			job.download === 'combined' ? await downloadCombined(page) : await downloadRow(page);

		job.sniff(artifact.bytes);
		const compressedBytes = artifact.bytes.length;
		expect(compressedBytes).toBeGreaterThan(0);
		if (!job.growthOk) {
			expect(compressedBytes, 'demo must show a real reduction').toBeLessThan(originalBytes);
		}

		const out = await job.render(input, artifact.bytes, page);
		// Geometry-lie detector, not a quality gate: honest pairs measure
		// 28–39 dB, while a shifted comparison window (resized output under an
		// identical absolute crop, or a video seek landing on different frames —
		// both shipped once) falls to ~10–18 dB. Kind-specific asserts stay
		// stricter; this floor catches the whole class for every future kind.
		if (!out.noAssets && (out.shows === 'crop' || out.shows === 'frame')) {
			const pairPsnr = await psnr(out.before, out.after);
			console.log(`demo-assets[${job.kind}]: pair PSNR ${pairPsnr.toFixed(1)} dB`);
			expect(pairPsnr, 'before/after must show the same content').toBeGreaterThanOrEqual(20);
		}
		mkdirSync(OUT_DIR, { recursive: true });
		const beforeName = out.noAssets ? '' : `${job.kind}-before.${out.beforeExt ?? out.ext}`;
		const afterName =
			out.noAssets || out.singleAsset ? '' : `${job.kind}-after.${out.afterExt ?? out.ext}`;
		if (!out.noAssets) {
			expect(out.before.length, `${beforeName} over page-weight budget`).toBeLessThanOrEqual(
				job.budgetBytes
			);
			writeFileSync(join(OUT_DIR, beforeName), out.before);
			if (!out.singleAsset) {
				expect(out.after.length, `${afterName} over page-weight budget`).toBeLessThanOrEqual(
					job.budgetBytes
				);
				writeFileSync(join(OUT_DIR, afterName), out.after);
			}
		}

		// Optional second run: extra settings on the SAME parked file (e.g. the
		// gif resize) — the verbatim output ships as a live animated preview.
		let anim: DemoStats['display']['anim'];
		if (job.anim) {
			await job.anim.drive(page);
			await compress(page, { timeout: job.compressTimeoutMs ?? 120_000 });
			const animArtifact = await downloadRow(page);
			job.sniff(animArtifact.bytes);
			expect(animArtifact.bytes.length, 'anim preview over page-weight budget').toBeLessThanOrEqual(
				job.anim.budgetBytes
			);
			const animName = `${job.kind}-anim.gif`;
			writeFileSync(join(OUT_DIR, animName), animArtifact.bytes);
			anim = {
				file: animName,
				bytes: animArtifact.bytes.length,
				maxDimension: job.anim.maxDimension
			};
		}

		// Optional second run, video flavor: verbatim output ships as a playable
		// <video> preview plus a committed poster frame (gif-anim precedent).
		let clip: DemoStats['display']['clip'];
		if (job.clip) {
			await job.clip.drive(page);
			await compress(page, { timeout: job.compressTimeoutMs ?? 120_000 });
			const clipArtifact = await downloadRow(page);
			job.sniff(clipArtifact.bytes);
			expect(clipArtifact.bytes.length, 'clip preview over page-weight budget').toBeLessThanOrEqual(
				job.clip.budgetBytes
			);
			const clipInfo = await videoInfo(clipArtifact.bytes);
			expect(
				Math.max(clipInfo.width, clipInfo.height),
				'clip must honor the resize'
			).toBeLessThanOrEqual(job.clip.maxDimension);
			const clipName = `${job.kind}-clip.mp4`;
			writeFileSync(join(OUT_DIR, clipName), clipArtifact.bytes);
			// Poster: a frame of the CLIP itself (small enough for the base64
			// path), so preload="none" costs no video bytes until play.
			const [posterPng] = await rasterizeVideoFramesInPage(page, clipArtifact.bytes, 'video/mp4', [
				job.clip.posterAtSec
			]);
			const poster = await sharp(posterPng).webp(DELIVERY_WEBP).toBuffer();
			expect(poster.length, 'poster over page-weight budget').toBeLessThanOrEqual(
				job.clip.posterBudgetBytes
			);
			const posterName = `${job.kind}-poster.webp`;
			writeFileSync(join(OUT_DIR, posterName), poster);
			clip = {
				file: clipName,
				bytes: clipArtifact.bytes.length,
				maxDimension: job.clip.maxDimension,
				width: clipInfo.width,
				height: clipInfo.height,
				quality: job.clip.quality,
				poster: posterName
			};
		}

		// Same rounding as compress.ts savingsPercent — the demo number equals
		// what the app UI itself would report for this run.
		const savingsPercent = Math.max(0, Math.round((1 - compressedBytes / originalBytes) * 100));
		writeManifestEntry(job.kind, {
			tool: job.page,
			engine: job.engine,
			...(job.quality !== undefined ? { quality: job.quality } : {}),
			...(job.precision !== undefined ? { precision: job.precision } : {}),
			...(job.level !== undefined ? { level: job.level } : {}),
			...(job.bitrateKbps !== undefined ? { bitrateKbps: job.bitrateKbps } : {}),
			...(job.maxDimension !== undefined ? { maxDimension: job.maxDimension } : {}),
			outputFormat: job.outputFormat,
			...(job.formatChanged ? { formatChanged: true } : {}),
			input: { name: basename(job.fixture), ...inputDesc },
			originalBytes,
			compressedBytes,
			savingsPercent,
			display: {
				before: beforeName,
				after: afterName,
				width: out.width,
				height: out.height,
				shows: out.shows,
				...(out.crop ? { crop: out.crop } : {}),
				...(out.frame ? { frame: out.frame } : {}),
				...(out.render ? { render: out.render } : {}),
				...(anim ? { anim } : {}),
				...(out.still ? { still: out.still } : {}),
				...(clip ? { clip } : {}),
				...(out.archive ? { archive: out.archive } : {}),
				...(out.metadata ? { metadata: out.metadata } : {}),
				...(out.text ? { text: out.text } : {}),
				...(out.ocr ? { ocr: out.ocr } : {}),
				...(out.subtitle ? { subtitle: out.subtitle } : {}),
				...(out.sheet ? { sheet: out.sheet } : {}),
				...(out.model ? { model: out.model } : {}),
				...(out.entryName ? { entryName: out.entryName } : {})
			},
			...(job.credit ? { credit: job.credit } : {})
		});

		console.log(
			`demo-assets[${job.kind}]: ${originalBytes} B → ${compressedBytes} B (−${savingsPercent}%); ` +
				`display before=${out.before.length} B after=${out.after.length} B`
		);
	});
}
