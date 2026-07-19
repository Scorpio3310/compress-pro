import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import statsJson from './demo-stats.json';
import { CONVERTERS, FORMATS, TOOLS } from './seo';
import { fullSeoFor } from './seo-full.server';
import type { DemoKind, DemoStats } from './types';

// Drift guards for the before/after demos: manifest, shipped display assets
// and source fixtures are one unit produced by `pnpm demo-assets` — these
// tests fail CI whenever any piece is edited or regenerated alone.

const ALL = statsJson as Record<DemoKind, DemoStats>;
const FIXTURES = join(__dirname, '..', '..', 'tests', 'fixtures', 'real');
const ASSETS = join(__dirname, 'assets', 'demo');

const MAGIC: Record<string, (b: Buffer) => boolean> = {
	jpg: (b) => b[0] === 0xff && b[1] === 0xd8,
	png: (b) => b.subarray(1, 4).toString('latin1') === 'PNG',
	webp: (b) => b.subarray(8, 12).toString('latin1') === 'WEBP',
	svg: (b) => b.toString('utf8', 0, 200).trimStart().startsWith('<'),
	// ID3v2 tag or a bare MPEG frame sync — both are valid MP3 leads.
	mp3: (b) =>
		b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)
};

const SPEC: Record<
	DemoKind,
	{
		assetExt: 'jpg' | 'png' | 'webp' | 'svg' | 'mp3' | 'woff2';
		budget: number;
		mcuAligned: boolean;
	}
> = {
	photo: { assetExt: 'jpg', budget: 240_000, mcuAligned: true },
	// Continuous-tone watercolor can't ship as lossless PNG (megabytes) — the
	// crops are identical high-quality WebP; the MEASURED files stay PNG.
	png: { assetExt: 'webp', budget: 240_000, mcuAligned: true },
	webp: { assetExt: 'webp', budget: 240_000, mcuAligned: true },
	heic: { assetExt: 'jpg', budget: 240_000, mcuAligned: true },
	// Frame stills ship as LOSSLESS WebP (photographic 1887 plates — PNG of the
	// same pixels runs ~35% bigger).
	gif: { assetExt: 'webp', budget: 350_000, mcuAligned: false },
	svg: { assetExt: 'svg', budget: 100_000, mcuAligned: false },
	// The crop is cut from a pdf.js render, not a JPEG — no MCU phase to keep.
	pdf: { assetExt: 'jpg', budget: 240_000, mcuAligned: false },
	// Stills are crops of a <video>+canvas raster — a render, no MCU phase.
	video: { assetExt: 'webp', budget: 300_000, mcuAligned: false },
	// The assets ARE the complete files (players use preload="none") — the
	// budget covers the full-length original track.
	audio: { assetExt: 'mp3', budget: 5_000_000, mcuAligned: false },
	// Before side is the TTF, after side the WOFF2 — per-side magic below.
	font: { assetExt: 'woff2', budget: 300_000, mcuAligned: false },
	// No display assets at all — a folder manifest + two archive sizes.
	archive: { assetExt: 'jpg', budget: 0, mcuAligned: false },
	exif: { assetExt: 'jpg', budget: 240_000, mcuAligned: false },
	// Only the scan ships — the "after" side is display.text (the .txt).
	ocr: { assetExt: 'webp', budget: 350_000, mcuAligned: false },
	// No display assets — both panels inline the actual files from display.text.
	subtitle: { assetExt: 'jpg', budget: 0, mcuAligned: false },
	// Full-frame view of the same in-book illustration, q85 WebP both sides.
	ebook: { assetExt: 'webp', budget: 240_000, mcuAligned: false },
	// Fixed-camera three.js renders of both actual files, q85 WebP.
	model: { assetExt: 'webp', budget: 240_000, mcuAligned: false },
	// No display assets — CSV panel + sheet table both come from the manifest.
	data: { assetExt: 'jpg', budget: 0, mcuAligned: false },
	// Converter demos — same fixtures and crop windows as their compress kinds.
	'png-to-webp': { assetExt: 'webp', budget: 240_000, mcuAligned: true },
	'jpg-to-webp': { assetExt: 'webp', budget: 240_000, mcuAligned: true },
	'webp-to-jpg': { assetExt: 'jpg', budget: 240_000, mcuAligned: true },
	// The crop is cut from re-rastered (fitted) content — no MCU phase to keep.
	resize: { assetExt: 'webp', budget: 240_000, mcuAligned: false },
	// No display assets — the file table + page math straight from the manifest.
	merge: { assetExt: 'jpg', budget: 0, mcuAligned: false }
};
const KINDS = Object.keys(SPEC) as DemoKind[];

// The output is legitimately bigger (WEBVTT header, XLSX container; a 22 MP
// JPG re-encode of a lossy WebP; a merged PDF ≈ the sum of its parts) — these
// demos tell structure/compatibility stories; the tiles show real numbers.
const GROWTH_OK = new Set<DemoKind>(['subtitle', 'data', 'webp-to-jpg', 'merge']);
// Descriptor-less inputs: containers/models the sharp default can't describe.
const DESCRIPTORLESS = new Set<DemoKind>(['font', 'subtitle', 'data', 'ebook', 'model']);

// Source fixtures live in the gitignored tests/fixtures/real (see .gitignore and
// ci.yml) — large local samples that `pnpm demo-assets` consumes to write the
// committed assets + manifest. Present locally, absent in CI, so the byte-for-byte
// source check self-skips there, like woff2-patch/real-fonts do for their fixtures.
const SOURCE_NAMES = KINDS.flatMap((kind) => {
	// Mid-regeneration a kind may not be in the manifest yet — the
	// carries-every-kind test is what fails then, not this module's load.
	const s = ALL[kind];
	if (!s) return [];
	if (kind === 'archive') return s.display.archive!.entries.map((e) => e.name);
	if (kind === 'merge') return s.display.merge!.files.map((f) => f.name);
	return [s.input.name];
});
const HAVE_FIXTURES = SOURCE_NAMES.every((n) => existsSync(join(FIXTURES, n)));
if (!HAVE_FIXTURES)
	console.warn(
		'demo-stats.test: source fixtures absent under tests/fixtures/real — skipping byte-for-byte source check'
	);

describe('demo stats manifest', () => {
	it('carries every kind', () => {
		expect(Object.keys(ALL).sort()).toEqual([...KINDS].sort());
	});

	it.each(KINDS)('%s: claims a real reduction with the exact app rounding', (kind) => {
		const s = ALL[kind];
		expect(s.compressedBytes).toBeGreaterThan(0);
		if (!GROWTH_OK.has(kind)) expect(s.compressedBytes).toBeLessThan(s.originalBytes);
		// Same formula as compress.ts savingsPercent — the demo number must
		// equal what the app UI itself would report for this run.
		expect(s.savingsPercent).toBe(
			Math.max(0, Math.round((1 - s.compressedBytes / s.originalBytes) * 100))
		);
	});

	it.skipIf(!HAVE_FIXTURES).each(KINDS)('%s: matches the source fixture byte for byte', (kind) => {
		const s = ALL[kind];
		if (kind === 'archive') {
			// The "fixture" is a whole folder — every entry must exist and the
			// entry sizes must sum to the claimed original.
			const entries = s.display.archive!.entries;
			expect(entries.length).toBeGreaterThanOrEqual(3);
			let sum = 0;
			for (const e of entries) {
				const size = statSync(join(FIXTURES, e.name)).size;
				expect(size, e.name).toBe(e.bytes);
				sum += size;
			}
			expect(sum).toBe(s.originalBytes);
			return;
		}
		if (kind === 'merge') {
			// Two authored fixtures — sizes sum to the original, pages to the total.
			const files = s.display.merge!.files;
			expect(files.length).toBeGreaterThanOrEqual(2);
			let sum = 0;
			for (const f of files) {
				const size = statSync(join(FIXTURES, f.name)).size;
				expect(size, f.name).toBe(f.bytes);
				expect(f.pages, f.name).toBeGreaterThanOrEqual(1);
				sum += size;
			}
			expect(sum).toBe(s.originalBytes);
			expect(s.display.merge!.pages).toBe(files.reduce((n, f) => n + f.pages, 0));
			return;
		}
		expect(statSync(join(FIXTURES, s.input.name)).size).toBe(s.originalBytes);
		// Raster kinds carry dimensions; pdf carries a page count; audio a
		// duration; font is just a file.
		if (s.input.width !== undefined) {
			expect(s.input.megapixels).toBe(Math.round((s.input.width * s.input.height!) / 1e6));
		} else if (s.input.pages !== undefined) {
			expect(s.input.pages, `${kind} needs pages when dimensionless`).toBeGreaterThanOrEqual(2);
		} else if (s.input.durationSec !== undefined) {
			expect(s.input.durationSec).toBeGreaterThan(0);
		} else {
			expect(DESCRIPTORLESS.has(kind), `${kind} may not omit every input descriptor`).toBe(true);
		}
	});

	it.each(KINDS)('%s: ships both display assets within budget and format', (kind) => {
		const s = ALL[kind];
		if (kind === 'archive' || kind === 'subtitle' || kind === 'data' || kind === 'merge') {
			// Numbers/text-only demos — deliberately no display files.
			expect(s.display.before).toBe('');
			expect(s.display.after).toBe('');
			return;
		}
		if (kind === 'ocr') {
			// Single asset: the scan; the after side is display.text (the .txt).
			expect(s.display.after).toBe('');
			expect(s.display.before.endsWith('.webp'), `${s.display.before} extension`).toBe(true);
			const bytes = readFileSync(join(ASSETS, s.display.before));
			expect(MAGIC.webp(bytes), `${s.display.before} magic`).toBe(true);
			expect(bytes.length, `${s.display.before} over budget`).toBeLessThanOrEqual(SPEC.ocr.budget);
			return;
		}
		if (kind === 'font') {
			// Per-side containers: the assets ARE the files, TTF in, WOFF2 out.
			const ttf = readFileSync(join(ASSETS, s.display.before));
			expect(ttf.readUInt32BE(0), 'TTF sfnt magic').toBe(0x00010000);
			const woff2 = readFileSync(join(ASSETS, s.display.after));
			expect(woff2.subarray(0, 4).toString('latin1'), 'WOFF2 magic').toBe('wOF2');
			expect(woff2.length).toBeLessThanOrEqual(SPEC.font.budget);
			return;
		}
		const spec = SPEC[kind];
		for (const name of [s.display.before, s.display.after]) {
			expect(name.endsWith('.' + spec.assetExt), `${name} extension`).toBe(true);
			const bytes = readFileSync(join(ASSETS, name));
			expect(MAGIC[spec.assetExt](bytes), `${name} magic`).toBe(true);
			expect(bytes.length, `${name} over budget`).toBeLessThanOrEqual(spec.budget);
		}
	});

	// The kinds whose before/after assets are two rasters of the same content.
	// ebook: the same in-book illustration; model: identical-camera renders of
	// both actual files (quantized geometry + re-encoded textures shift pixels
	// slightly — the 20 dB floor still catches a wrong file or camera).
	const RASTER_PAIR_KINDS = [
		'photo',
		'png',
		'webp',
		'heic',
		'gif',
		'pdf',
		'video',
		'exif',
		'ebook',
		'model',
		'png-to-webp',
		'jpg-to-webp',
		'webp-to-jpg',
		'resize'
	] as const;

	it.each(RASTER_PAIR_KINDS)('%s: shipped pair shows the same content', async (kind) => {
		// Geometry-lie detector over the COMMITTED assets: identical dims plus a
		// PSNR floor. The generator asserts the same at write time, but a run
		// compiled before a fix can clobber good assets afterwards — that
		// shipped twice (a video seek landing on different frames; a resized
		// output under an identical absolute crop). Honest pairs measure
		// 28–39 dB (exif ~138); a shifted comparison window falls to ~10–18 dB.
		const s = ALL[kind];
		const decode = (name: string) =>
			sharp(join(ASSETS, name)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
		const before = await decode(s.display.before);
		const after = await decode(s.display.after);
		expect({ width: after.info.width, height: after.info.height }).toEqual({
			width: before.info.width,
			height: before.info.height
		});
		let se = 0;
		for (let i = 0; i < before.data.length; i++) {
			const d = before.data[i] - after.data[i];
			se += d * d;
		}
		const psnr = 10 * Math.log10((255 * 255) / Math.max(se / before.data.length, 1e-9));
		expect(psnr, `${kind} before/after must show the same content`).toBeGreaterThanOrEqual(20);
	});

	it.each(KINDS)('%s: display geometry is sane', (kind) => {
		// Dimensionless demos: audio (players), font (specimen), archive/merge
		// (tables), subtitle/data (text panels straight from the manifest).
		if (kind === 'audio' || kind === 'font' || kind === 'archive' || kind === 'merge') return;
		if (kind === 'subtitle' || kind === 'data') return;
		const s = ALL[kind];
		expect(s.display.width).toBeGreaterThan(0);
		expect(s.display.height).toBeGreaterThan(0);
		if (s.display.shows === 'crop') {
			const c = s.display.crop!;
			// The crop's frame is the source image — or, for pdf, the page render.
			const frame = s.display.render ?? { width: s.input.width!, height: s.input.height! };
			expect(c.left + c.width).toBeLessThanOrEqual(frame.width);
			expect(c.top + c.height).toBeLessThanOrEqual(frame.height);
			if (SPEC[kind].mcuAligned) {
				expect(c.left % 16, `${kind} crop left MCU`).toBe(0);
				expect(c.top % 16, `${kind} crop top MCU`).toBe(0);
			}
		}
		if (s.display.shows === 'frame') {
			expect(s.display.frame!.index).toBeLessThan(s.display.frame!.ofFrames);
		}
	});

	it('svg assets ARE the measured files, byte for byte', () => {
		const s = ALL.svg;
		expect(statSync(join(ASSETS, s.display.before)).size).toBe(s.originalBytes);
		expect(statSync(join(ASSETS, s.display.after)).size).toBe(s.compressedBytes);
	});

	it('audio assets ARE the measured files, byte for byte — at the pinned bitrate', () => {
		const s = ALL.audio;
		expect(statSync(join(ASSETS, s.display.before)).size).toBe(s.originalBytes);
		expect(statSync(join(ASSETS, s.display.after)).size).toBe(s.compressedBytes);
		// The caption reads the pill from the manifest — pin it so copy and run
		// can only change together.
		expect(s.bitrateKbps).toBe(128);
	});

	it('heic declares its format change', () => {
		expect(ALL.heic.outputFormat).toBe('jpg');
		expect(ALL.heic.formatChanged).toBe(true);
	});

	it('font assets ARE the measured files, byte for byte', () => {
		const s = ALL.font;
		expect(statSync(join(ASSETS, s.display.before)).size).toBe(s.originalBytes);
		expect(statSync(join(ASSETS, s.display.after)).size).toBe(s.compressedBytes);
		expect(s.formatChanged).toBe(true);
	});

	it('archive: the folder story holds — 7Z beats ZIP beats the folder', () => {
		const s = ALL.archive;
		const a = s.display.archive!;
		expect(a, 'archive needs its manifest').toBeDefined();
		expect(a.zipBytes).toBeGreaterThan(0);
		expect(a.zipBytes, 'zip must shrink the folder').toBeLessThan(s.originalBytes);
		// The page's whole claim: LZMA2 out-compresses deflate on the same input.
		expect(s.compressedBytes, '7z must beat zip').toBeLessThan(a.zipBytes);
	});

	it('exif: the table leads with real findings and the pixels claim is pinned', () => {
		const m = ALL.exif.display.metadata!;
		expect(m, 'exif needs its metadata table').toBeDefined();
		expect(m.gps, 'GPS is the money row').toBeTruthy();
		expect(m.camera).toBeTruthy();
		expect(m.fields).toBeGreaterThan(5);
	});

	it('gif ships its animated preview — verbatim second-run output', () => {
		const anim = ALL.gif.display.anim!;
		expect(anim, 'gif needs the animated preview').toBeDefined();
		const bytes = readFileSync(join(ASSETS, anim.file));
		expect(bytes.subarray(0, 4).toString('latin1'), 'GIF magic').toBe('GIF8');
		expect(bytes.length, 'anim preview must be the manifest bytes').toBe(anim.bytes);
		expect(bytes.length, 'anim preview over budget').toBeLessThanOrEqual(600_000);
		expect(anim.maxDimension).toBeGreaterThan(0);
	});

	it('pdf: render out-resolves the preset and the e-mail story holds', () => {
		const s = ALL.pdf;
		expect(s.level).toBe('medium');
		const r = s.display.render!;
		expect(r, 'pdf display needs its render frame').toBeDefined();
		expect(r.page).toBeGreaterThanOrEqual(1);
		expect(r.page).toBeLessThanOrEqual(s.input.pages!);
		// The Medium preset keeps 150 DPI images — a render below ~250 DPI would
		// downscale away exactly the artifacts the demo claims to show.
		expect(r.dpi).toBeGreaterThanOrEqual(250);
		// The caption tells the e-mail attachment story (>25 MB in, attachable
		// out) — these bounds pin the copy to the numbers. If the fixture ever
		// changes, the DemoCompare pdf copy and this guard change together.
		expect(s.originalBytes).toBeGreaterThan(25_000_000);
		expect(s.compressedBytes).toBeLessThan(19_000_000);
		expect(s.credit?.license).toBe('public domain');
	});

	it('video: ships its playable clip — verbatim second-run output', () => {
		const s = ALL.video;
		const clip = s.display.clip!;
		expect(clip, 'video needs the playable clip').toBeDefined();
		const bytes = readFileSync(join(ASSETS, clip.file));
		expect(bytes.subarray(4, 8).toString('latin1'), 'MP4 ftyp magic').toBe('ftyp');
		expect(bytes.length, 'clip must be the manifest bytes').toBe(clip.bytes);
		expect(bytes.length, 'clip over budget').toBeLessThanOrEqual(1_500_000);
		expect(Math.max(clip.width, clip.height), 'clip must honor its resize').toBeLessThanOrEqual(
			clip.maxDimension
		);
		const poster = readFileSync(join(ASSETS, clip.poster));
		expect(MAGIC.webp(poster), 'poster magic').toBe(true);
		expect(poster.length, 'poster over budget').toBeLessThanOrEqual(100_000);
	});

	it('video: still timestamp sits inside the clip and the run stayed mp4', () => {
		const s = ALL.video;
		expect(s.outputFormat).toBe('mp4');
		// The caption narrates the 4K→1080p website preset — pin the resize so
		// copy and run can only change together (audio bitrate precedent).
		expect(s.maxDimension).toBe(1920);
		expect(Math.max(s.input.width!, s.input.height!), '4K source story').toBeGreaterThanOrEqual(
			3840
		);
		expect(s.input.durationSec, 'video input needs a duration').toBeGreaterThan(0);
		expect(s.input.fps, 'video input needs a frame rate').toBeGreaterThan(0);
		const still = s.display.still!;
		expect(still, 'video display needs its still timestamp').toBeDefined();
		expect(still.atSec).toBeGreaterThan(0);
		expect(still.atSec).toBeLessThan(s.input.durationSec!);
	});

	it('ocr: the panel text, word claim and language hold together', () => {
		const s = ALL.ocr;
		expect(s.outputFormat).toBe('txt');
		expect(s.formatChanged).toBe(true);
		const o = s.display.ocr!;
		expect(o, 'ocr needs its word/language payload').toBeDefined();
		expect(o.words).toBeGreaterThan(50);
		expect(o.lang).toBe('eng');
		const text = s.display.text?.after ?? '';
		expect(text.length, 'the panel needs the recognized text').toBeGreaterThan(100);
		// The tile's claim and the shipped panel must describe the same run.
		const txtWords = text.trim().split(/\s+/).length;
		expect(Math.abs(o.words - txtWords)).toBeLessThanOrEqual(Math.ceil(o.words * 0.1));
	});

	it('subtitle: both panels ARE the measured files, byte for byte', () => {
		const s = ALL.subtitle;
		expect(s.outputFormat).toBe('vtt');
		expect(s.formatChanged).toBe(true);
		const sub = s.display.subtitle!;
		expect(sub, 'subtitle needs its cue payload').toBeDefined();
		expect(sub.cues).toBeGreaterThanOrEqual(3);
		expect(sub.from).toBe('srt');
		expect(sub.to).toBe('vtt');
		const t = s.display.text!;
		expect(t?.before && t?.after, 'subtitle needs both text panels').toBeTruthy();
		expect(Buffer.byteLength(t.before!, 'utf8')).toBe(s.originalBytes);
		expect(Buffer.byteLength(t.after!, 'utf8')).toBe(s.compressedBytes);
		expect(t.after!.startsWith('WEBVTT'), 'after panel must be WebVTT').toBe(true);
		expect(t.before!, 'before panel must be SRT (comma millis)').toMatch(/\d\d,\d\d\d --> /);
	});

	it('ebook: the illustration story holds and the savings stay honest', () => {
		const s = ALL.ebook;
		expect(s.outputFormat).toBe('epub');
		expect(s.display.entryName, 'ebook needs its entry provenance').toBeTruthy();
		expect(s.display.frame, 'ebook needs its image ordinal').toBeDefined();
		// The demo book is an already-optimized PG production and lands under
		// the FAQ's 30–60% "image-heavy" range — the caption says so explicitly
		// (trust story, not cherry-picking). Floor pinned just under the run.
		expect(s.savingsPercent).toBeGreaterThanOrEqual(20);
		expect(s.credit?.license).toBe('public domain');
	});

	it('model: geometry stats, codec and the render pair hold together', () => {
		const s = ALL.model;
		expect(s.outputFormat).toBe('glb');
		const m = s.display.model!;
		expect(m, 'model needs its stats payload').toBeDefined();
		expect(m.codec).toBe('draco');
		// The caption narrates the Max-texture-size pin — pin it here so copy
		// and run can only change together (audio bitrate precedent).
		expect(m.textureMaxDimension).toBe(1024);
		expect(m.triangles).toBeGreaterThan(1_000);
		expect(m.vertices).toBeGreaterThan(1_000);
		expect(m.texturesTotal).toBeGreaterThanOrEqual(1);
		expect(m.texturesChanged).toBeGreaterThanOrEqual(1);
		expect(s.savingsPercent, 'the model story is the byte drop').toBeGreaterThanOrEqual(70);
		expect(s.credit?.license).toBe('CC0');
	});

	it('data: the CSV panel IS the measured input and the sheet reads back', () => {
		const s = ALL.data;
		expect(s.outputFormat).toBe('xlsx');
		expect(s.formatChanged).toBe(true);
		expect(Buffer.byteLength(s.display.text!.before!, 'utf8')).toBe(s.originalBytes);
		const rows = s.display.sheet!.rows;
		expect(rows.length).toBeGreaterThanOrEqual(3);
		// Every row shares the header's column count — a ragged table would
		// mean the read-back and the CSV describe different data.
		for (const row of rows) expect(row.length).toBe(rows[0].length);
	});

	it.each(KINDS)('%s: tool matches the seo entry carrying this kind', (kind) => {
		// CONVERTERS included: the png-to-webp-style kinds live on converter pages.
		const carriers = [...FORMATS, ...CONVERTERS, ...TOOLS]
			.filter((e) => e.demo === kind)
			.map((e) => e.path);
		expect(carriers, `${kind} needs at least one page`).not.toHaveLength(0);
		expect(carriers).toContain(ALL[kind].tool);
	});

	it('converter kinds pin the run their captions narrate', () => {
		// The caption narrates the format flip / the resize cap — pin them here
		// so copy and run can only change together (model/audio precedent).
		for (const kind of ['png-to-webp', 'jpg-to-webp'] as const) {
			expect(ALL[kind].formatChanged, kind).toBe(true);
			expect(ALL[kind].outputFormat, kind).toBe('webp');
		}
		expect(ALL['webp-to-jpg'].formatChanged).toBe(true);
		expect(ALL['webp-to-jpg'].outputFormat).toBe('jpg');
		expect(ALL.resize.maxDimension).toBe(1920);
		expect(ALL.resize.outputFormat).toBe('jpg');
		expect(ALL.resize.formatChanged ?? false).toBe(false);
	});

	it('merge: two files, one document, honest page math', () => {
		const s = ALL.merge;
		expect(s.outputFormat).toBe('pdf');
		const m = s.display.merge;
		expect(m, 'merge needs its file table').toBeDefined();
		expect(m!.files.length).toBe(2);
		expect(m!.pages).toBe(m!.files.reduce((n, f) => n + f.pages, 0));
		// The merged output ≈ the sum of its parts — never smaller than the
		// largest input (a "compression" claim here would be a lie).
		expect(s.compressedBytes).toBeGreaterThanOrEqual(Math.max(...m!.files.map((f) => f.bytes)));
	});

	it.each(KINDS)('%s: engine names appear in the page’s Under the hood copy', (kind) => {
		const s = ALL[kind];
		const entry = fullSeoFor(s.tool.slice(1));
		expect(entry.path, `${s.tool} must be a real page`).toBe(s.tool);
		const section = entry.guide?.find((g) => g.heading === 'Under the hood');
		expect(section, `${s.tool} Under the hood`).toBeDefined();
		const prose = section!.paragraphs!.join(' ');
		for (const token of s.engine.split(/\s*(?:\+|→|,)\s*/)) {
			expect(prose, `${s.tool} must name ${token}`).toContain(token);
		}
	});

	it.each(KINDS)('%s: credit, when present, points at its claimed source', (kind) => {
		const credit = ALL[kind].credit;
		if (!credit) return;
		expect(credit.author.length).toBeGreaterThan(0);
		const host = {
			Unsplash: 'unsplash.com',
			'Wikimedia Commons': 'commons.wikimedia.org',
			NASA: 'nasa.gov',
			Openclipart: 'openclipart.org',
			Magnific: 'magnific.com',
			'HEIC Digital': 'heic.digital',
			Pixabay: 'pixabay.com',
			'Google Fonts': 'fonts.google.com',
			'Project Gutenberg': 'gutenberg.org',
			'Poly Haven': 'polyhaven.com'
		}[credit.source];
		expect(credit.url.startsWith('https://')).toBe(true);
		expect(credit.url).toContain(`${host}/`);
	});
});
