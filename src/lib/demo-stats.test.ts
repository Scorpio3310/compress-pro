import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import statsJson from './demo-stats.json';
import { FORMATS, TOOLS } from './seo';
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
	exif: { assetExt: 'jpg', budget: 240_000, mcuAligned: false }
};
const KINDS = Object.keys(SPEC) as DemoKind[];

// Source fixtures live in the gitignored tests/fixtures/real (see .gitignore and
// ci.yml) — large local samples that `pnpm demo-assets` consumes to write the
// committed assets + manifest. Present locally, absent in CI, so the byte-for-byte
// source check self-skips there, like woff2-patch/real-fonts do for their fixtures.
const SOURCE_NAMES = KINDS.flatMap((kind) => {
	const s = ALL[kind];
	return kind === 'archive' ? s.display.archive!.entries.map((e) => e.name) : [s.input.name];
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
		expect(s.compressedBytes).toBeLessThan(s.originalBytes);
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
			expect(kind, 'only font may omit every input descriptor').toBe('font');
		}
	});

	it.each(KINDS)('%s: ships both display assets within budget and format', (kind) => {
		const s = ALL[kind];
		if (kind === 'archive') {
			// Numbers-only demo — deliberately no display files.
			expect(s.display.before).toBe('');
			expect(s.display.after).toBe('');
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
	const RASTER_PAIR_KINDS = [
		'photo',
		'png',
		'webp',
		'heic',
		'gif',
		'pdf',
		'video',
		'exif'
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
		// Dimensionless demos: audio (players), font (specimen), archive (table).
		if (kind === 'audio' || kind === 'font' || kind === 'archive') return;
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

	it.each(KINDS)('%s: tool matches the seo entry carrying this kind', (kind) => {
		const carriers = [...FORMATS, ...TOOLS].filter((e) => e.demo === kind).map((e) => e.path);
		expect(carriers, `${kind} needs at least one page`).not.toHaveLength(0);
		expect(carriers).toContain(ALL[kind].tool);
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
			'Google Fonts': 'fonts.google.com'
		}[credit.source];
		expect(credit.url.startsWith('https://')).toBe(true);
		expect(credit.url).toContain(`${host}/`);
	});
});
