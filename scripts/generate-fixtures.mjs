/**
 * Deterministic e2e fixture generator.
 *
 * Every pixel source is either an authored SVG scene or seeded-PRNG noise, so
 * repeated runs produce equivalent (not byte-identical across sharp versions —
 * irrelevant, tests read expectations from the manifest written by THIS run).
 *
 * Usage:
 *   node scripts/generate-fixtures.mjs               # always regenerate
 *   node scripts/generate-fixtures.mjs --if-missing  # skip when manifest hash matches
 *
 * Output: tests/fixtures/generated/ + .manifest.json (per-file expected
 * properties: dims, pages, delays, alpha, transparent/marker sample points).
 * HEIC is produced with macOS `sips`; when unavailable the manifest records
 * heicAvailable=false and HEIC tests skip.
 */
import { createHash } from 'node:crypto';
import { gzipSync, zipSync, zlibSync } from 'fflate';
import SevenZipFactory from '7z-wasm/7zz.es6.js';
import { crc32, deflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pdfLib from 'pdf-lib';
import * as opentypeNs from 'opentype.js';
import fonteditorNs from 'fonteditor-core';

const { PDFDocument, PDFName, StandardFonts, rgb } = pdfLib;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tests', 'fixtures', 'generated');
const MANIFEST = join(OUT, '.manifest.json');

// Hash of generator source + sharp version — staleness check for --if-missing.
const GEN_HASH = createHash('sha256')
	.update(readFileSync(fileURLToPath(import.meta.url)))
	.update(sharp.versions?.sharp ?? 'sharp')
	.digest('hex')
	.slice(0, 16);

// E2E_BENCH=1 (bench:memory) additionally produces the large bench inputs.
// Not part of GEN_HASH: that would flip the hash between normal and bench runs
// and force a full regeneration on every switch.
const BENCH = !!process.env.E2E_BENCH;
const BENCH_PDF = 'image-heavy-large.pdf';

if (process.argv.includes('--if-missing') && existsSync(MANIFEST)) {
	try {
		const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
		// A hash-matching manifest written by a NORMAL run lacks the bench
		// fixtures — a bench run must still regenerate then.
		if (m.genHash === GEN_HASH && (!BENCH || existsSync(join(OUT, BENCH_PDF)))) {
			console.log('fixtures up to date (hash match) — skipping');
			process.exit(0);
		}
	} catch {
		/* regenerate */
	}
}
mkdirSync(OUT, { recursive: true });

/** @type {Record<string, object>} name → expected properties for tests */
const manifest = {};

// ---------------------------------------------------------------- utilities

function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Seeded RGBA noise layer (alpha = opacity 0..255) for photo-like grain. */
function noiseLayer(w, h, alpha, seed) {
	const rand = mulberry32(seed);
	const buf = Buffer.allocUnsafe(w * h * 4);
	for (let i = 0; i < w * h; i++) {
		const v = Math.floor(rand() * 256);
		buf[i * 4] = v;
		buf[i * 4 + 1] = Math.floor(rand() * 256);
		buf[i * 4 + 2] = v; // correlate R/B so noise isn't pure confetti
		buf[i * 4 + 3] = alpha;
	}
	return { input: buf, raw: { width: w, height: h, channels: 4 } };
}

/** Photo-ish scene: gradients, sun, soft blobs, buildings, fine text. */
function photoSceneSvg(w, h) {
	const t = [];
	for (let i = 0; i < 12; i++) {
		t.push(
			`<text x="${(w * 0.06).toFixed(0)}" y="${(h * (0.52 + i * 0.035)).toFixed(0)}" font-family="Helvetica, sans-serif" font-size="${Math.max(10, h * 0.016).toFixed(0)}" fill="rgba(20,24,28,0.85)">The quick brown fox jumps over the lazy dog 0123456789 — line ${i + 1}</text>`
		);
	}
	const buildings = [];
	const rand = mulberry32(7);
	for (let i = 0; i < 14; i++) {
		const bw = w * (0.03 + rand() * 0.05);
		const bh = h * (0.1 + rand() * 0.28);
		const bx = w * 0.02 + i * w * 0.07;
		buildings.push(
			`<rect x="${bx.toFixed(0)}" y="${(h * 0.48 - bh).toFixed(0)}" width="${bw.toFixed(0)}" height="${bh.toFixed(0)}" fill="rgb(${40 + Math.floor(rand() * 60)},${50 + Math.floor(rand() * 60)},${70 + Math.floor(rand() * 60)})"/>`
		);
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7db9e8"/><stop offset="0.5" stop-color="#f7c873"/><stop offset="1" stop-color="#e8e2d4"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.75" cy="0.22" r="0.28">
      <stop offset="0" stop-color="#fff6d8"/><stop offset="1" stop-color="#fff6d800"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(w / 90).toFixed(1)}"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <rect width="${w}" height="${h}" fill="url(#sun)"/>
  <ellipse cx="${w * 0.3}" cy="${h * 0.3}" rx="${w * 0.18}" ry="${h * 0.1}" fill="#ffffff" opacity="0.7" filter="url(#soft)"/>
  <ellipse cx="${w * 0.55}" cy="${h * 0.24}" rx="${w * 0.14}" ry="${h * 0.07}" fill="#f2ede2" opacity="0.8" filter="url(#soft)"/>
  ${buildings.join('\n  ')}
  <rect x="0" y="${h * 0.48}" width="${w}" height="${h * 0.52}" fill="#dcd6c8"/>
  <circle cx="${w * 0.82}" cy="${h * 0.72}" r="${w * 0.06}" fill="#b3543e"/>
  <circle cx="${w * 0.82}" cy="${h * 0.72}" r="${w * 0.035}" fill="#e8b04b"/>
  ${t.join('\n  ')}
</svg>`;
}

async function photoScene(w, h, { noise = 40, seed = 42 } = {}) {
	return sharp(Buffer.from(photoSceneSvg(w, h)))
		.composite([{ ...noiseLayer(w, h, noise, seed), blend: 'overlay' }])
		.removeAlpha()
		.toColourspace('srgb')
		.png()
		.toBuffer();
}

/** Graphic on TRANSPARENT background; corners stay fully transparent. */
function alphaGraphicSvg(w, h) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#9333ea" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect x="${w * 0.2}" y="${h * 0.2}" width="${w * 0.6}" height="${h * 0.6}" rx="${w * 0.04}" fill="url(#g)"/>
  <circle cx="${w * 0.5}" cy="${h * 0.5}" r="${h * 0.18}" fill="#f59e0b" opacity="0.9"/>
  <text x="${w * 0.5}" y="${h * 0.53}" text-anchor="middle" font-family="Helvetica, sans-serif" font-weight="bold" font-size="${h * 0.09}" fill="#111827">ALPHA</text>
</svg>`;
}

/** Animation frame: bouncing ball + frame counter over a gradient. */
function animFrameSvg(w, h, i, n) {
	const x = w * 0.15 + (w * 0.7 * i) / Math.max(1, n - 1);
	const y = h * 0.5 + Math.sin((i / n) * Math.PI * 2) * h * 0.25;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#334155"/>
  </linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${h * 0.12}" fill="#f43f5e"/>
  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${h * 0.06}" fill="#fbbf24"/>
  <text x="${w * 0.06}" y="${h * 0.16}" font-family="Helvetica, sans-serif" font-weight="bold" font-size="${h * 0.12}" fill="#e2e8f0">${i + 1}/${n}</text>
</svg>`;
}

async function animFrames(w, h, n) {
	const frames = [];
	for (let i = 0; i < n; i++) {
		frames.push(
			await sharp(Buffer.from(animFrameSvg(w, h, i, n)))
				.removeAlpha()
				.png()
				.toBuffer()
		);
	}
	return frames;
}

async function write(name, buf) {
	writeFileSync(join(OUT, name), buf);
	return join(OUT, name);
}

async function meta(name) {
	// metadata().size is only set for Buffer/Stream input — use the file size.
	const m = await sharp(join(OUT, name), { pages: -1 }).metadata();
	m.size = statSync(join(OUT, name)).size;
	return m;
}

function assertEq(name, what, got, want) {
	const ok = Array.isArray(want) ? JSON.stringify(got) === JSON.stringify(want) : got === want;
	if (!ok)
		throw new Error(
			`gen-verify failed: ${name} ${what} = ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`
		);
}

function assertRange(name, what, got, min, max) {
	if (got < min || got > max)
		throw new Error(`gen-verify failed: ${name} ${what} = ${got}, expected ${min}..${max}`);
}

// ------------------------------------------------------------------- images

async function generateImages() {
	// 1. photo-1200x800.jpg — the workhorse. Heavy grain so target-size tests
	// (100 KB target) actually force a quality drop.
	{
		const src = await photoScene(1200, 800, { noise: 90 });
		await write(
			'photo-1200x800.jpg',
			await sharp(src).jpeg({ quality: 85, mozjpeg: true }).toBuffer()
		);
		const m = await meta('photo-1200x800.jpg');
		assertEq('photo-1200x800.jpg', 'format', m.format, 'jpeg');
		assertEq('photo-1200x800.jpg', 'dims', [m.width, m.height], [1200, 800]);
		assertRange('photo-1200x800.jpg', 'size', m.size, 60_000, 600_000);
		manifest['photo-1200x800.jpg'] = { width: 1200, height: 800, size: m.size };
	}

	// 2. photo-4000x3000.jpg — large-file path (pixel count is what matters:
	// 12 MP decode + slow AVIF encode for the cancel test; byte size is secondary)
	{
		const src = await photoScene(4000, 3000, { noise: 55, seed: 43 });
		await write(
			'photo-4000x3000.jpg',
			await sharp(src).jpeg({ quality: 88, mozjpeg: true }).toBuffer()
		);
		const m = await meta('photo-4000x3000.jpg');
		assertEq('photo-4000x3000.jpg', 'dims', [m.width, m.height], [4000, 3000]);
		assertRange('photo-4000x3000.jpg', 'size', m.size, 250_000, 9_000_000);
		manifest['photo-4000x3000.jpg'] = { width: 4000, height: 3000, size: m.size };
	}

	// 3. photo-progressive.jpg
	{
		const src = await photoScene(1200, 800, { seed: 44 });
		await write(
			'photo-progressive.jpg',
			await sharp(src).jpeg({ quality: 85, progressive: true }).toBuffer()
		);
		const m = await meta('photo-progressive.jpg');
		assertEq('photo-progressive.jpg', 'isProgressive', m.isProgressive, true);
		manifest['photo-progressive.jpg'] = { width: 1200, height: 800 };
	}

	// 4. photo-exif6.jpg — stored 900×600 landscape, EXIF orientation 6 → displays 600×900.
	// Display-space design: red marker square top-left + "TOP" banner. We author the
	// DISPLAY image then rotate 270° to get stored pixels.
	{
		const display = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
  <rect width="600" height="900" fill="#e2e8f0"/>
  <rect x="20" y="20" width="80" height="80" fill="#dc2626"/>
  <text x="300" y="80" text-anchor="middle" font-family="Helvetica, sans-serif" font-weight="bold" font-size="56" fill="#111827">TOP</text>
  <rect x="60" y="180" width="480" height="640" fill="#3b82f6"/>
  <text x="300" y="520" text-anchor="middle" font-family="Helvetica, sans-serif" font-size="40" fill="#f8fafc">portrait body</text>
</svg>`;
		const displayPng = await sharp(Buffer.from(display)).removeAlpha().png().toBuffer();
		const storedJpg = await sharp(displayPng)
			.rotate(270)
			.jpeg({ quality: 88 })
			.withMetadata({ orientation: 6 })
			.toBuffer();
		await write('photo-exif6.jpg', storedJpg);
		const m = await meta('photo-exif6.jpg');
		assertEq('photo-exif6.jpg', 'orientation', m.orientation, 6);
		assertEq('photo-exif6.jpg', 'stored dims', [m.width, m.height], [900, 600]);
		manifest['photo-exif6.jpg'] = {
			storedWidth: 900,
			storedHeight: 600,
			displayWidth: 600,
			displayHeight: 900,
			markerPoint: [50, 50], // display-space: inside the red square
			markerColor: [220, 38, 38]
		};
	}

	// 5. photo-cmyk.jpg
	{
		const src = await photoScene(1000, 700, { seed: 45 });
		await write(
			'photo-cmyk.jpg',
			await sharp(src).toColourspace('cmyk').jpeg({ quality: 85 }).toBuffer()
		);
		const m = await meta('photo-cmyk.jpg');
		assertEq('photo-cmyk.jpg', 'space', m.space, 'cmyk');
		manifest['photo-cmyk.jpg'] = { width: 1000, height: 700, space: 'cmyk' };
	}

	// 6. tiny-optimized.jpg — already tight; re-encode at q80 grows → keep-original.
	{
		const src = await photoScene(320, 200, { noise: 25, seed: 46 });
		await write(
			'tiny-optimized.jpg',
			await sharp(src).jpeg({ quality: 60, mozjpeg: true }).toBuffer()
		);
		const m = await meta('tiny-optimized.jpg');
		assertRange('tiny-optimized.jpg', 'size', m.size, 1_000, 25_000);
		manifest['tiny-optimized.jpg'] = { width: 320, height: 200, size: m.size };
	}

	// 7. photo-1200x800.png — 24-bit photo content
	{
		const src = await photoScene(1200, 800, { seed: 47 });
		await write('photo-1200x800.png', await sharp(src).png().toBuffer());
		const m = await meta('photo-1200x800.png');
		assertEq('photo-1200x800.png', 'format', m.format, 'png');
		assertEq('photo-1200x800.png', 'hasAlpha', m.hasAlpha ?? false, false);
		manifest['photo-1200x800.png'] = { width: 1200, height: 800, size: m.size };
	}

	// 8. graphic-alpha.png — transparency; corners guaranteed transparent.
	{
		await write(
			'graphic-alpha.png',
			await sharp(Buffer.from(alphaGraphicSvg(800, 600)))
				.png()
				.toBuffer()
		);
		const m = await meta('graphic-alpha.png');
		assertEq('graphic-alpha.png', 'hasAlpha', m.hasAlpha, true);
		const raw = await sharp(join(OUT, 'graphic-alpha.png')).ensureAlpha().raw().toBuffer();
		for (const [x, y] of [
			[10, 10],
			[790, 10],
			[10, 590],
			[790, 590]
		]) {
			const a = raw[(y * 800 + x) * 4 + 3];
			assertEq('graphic-alpha.png', `alpha@${x},${y}`, a, 0);
		}
		manifest['graphic-alpha.png'] = {
			width: 800,
			height: 600,
			transparentPoints: [
				[10, 10],
				[790, 10],
				[10, 590],
				[790, 590]
			],
			opaquePoint: [400, 300]
		};
	}

	// 9. palette-64.png
	{
		const src = await photoScene(600, 400, { seed: 48 });
		await write('palette-64.png', await sharp(src).png({ palette: true, colours: 64 }).toBuffer());
		const m = await meta('palette-64.png');
		assertEq('palette-64.png', 'format', m.format, 'png');
		manifest['palette-64.png'] = { width: 600, height: 400 };
	}

	// 10. png-16bit.png
	{
		const src = await photoScene(600, 400, { seed: 49 });
		await write('png-16bit.png', await sharp(src).toColourspace('rgb16').png().toBuffer());
		const m = await meta('png-16bit.png');
		assertEq('png-16bit.png', 'depth', m.depth, 'ushort');
		manifest['png-16bit.png'] = { width: 600, height: 400, depth: 'ushort' };
	}

	// 11. png-interlaced.png (Adam7)
	{
		const src = await photoScene(600, 400, { seed: 50 });
		await write('png-interlaced.png', await sharp(src).png({ progressive: true }).toBuffer());
		const m = await meta('png-interlaced.png');
		assertEq('png-interlaced.png', 'isProgressive', m.isProgressive, true);
		manifest['png-interlaced.png'] = { width: 600, height: 400 };
	}

	// 12. photo-1000x700.webp — lossy
	{
		const src = await photoScene(1000, 700, { seed: 51 });
		await write('photo-1000x700.webp', await sharp(src).webp({ quality: 80 }).toBuffer());
		const m = await meta('photo-1000x700.webp');
		assertEq('photo-1000x700.webp', 'format', m.format, 'webp');
		manifest['photo-1000x700.webp'] = { width: 1000, height: 700, size: m.size };
	}

	// 13. alpha-lossless.webp
	{
		await write(
			'alpha-lossless.webp',
			await sharp(Buffer.from(alphaGraphicSvg(800, 600)))
				.webp({ lossless: true })
				.toBuffer()
		);
		const m = await meta('alpha-lossless.webp');
		assertEq('alpha-lossless.webp', 'hasAlpha', m.hasAlpha, true);
		manifest['alpha-lossless.webp'] = {
			width: 800,
			height: 600,
			transparentPoints: [
				[10, 10],
				[790, 590]
			]
		};
	}

	// 19. photo-800x600.avif
	{
		const src = await photoScene(800, 600, { seed: 52 });
		await write('photo-800x600.avif', await sharp(src).avif({ quality: 55 }).toBuffer());
		const m = await meta('photo-800x600.avif');
		assertEq('photo-800x600.avif', 'format is heif(av1)', m.format, 'heif');
		manifest['photo-800x600.avif'] = { width: 800, height: 600 };
	}

	// 20. photo-640x400.psd + psd-ref.png — hand-rolled flattened RGB PSD.
	// Image data MUST be RLE (PackBits): @webtoon/psd's RawData path reads all
	// planes from one offset (upstream bug), and real Photoshop writes RLE
	// anyway. The PNG twin carries the same pixels for pixelDiff.
	{
		const w = 640,
			h = 400;
		const src = await photoScene(w, h, { seed: 77 });
		const { data } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
		const packBits = (row) => {
			const out = [];
			for (let i = 0; i < row.length; i += 128) {
				const chunk = row.subarray(i, i + 128);
				out.push(chunk.length - 1, ...chunk);
			}
			return out;
		};
		const header = new DataView(new ArrayBuffer(26));
		header.setUint32(0, 0x38425053); // '8BPS'
		header.setUint16(4, 1); // version
		header.setUint16(12, 3); // channels (RGB)
		header.setUint32(14, h);
		header.setUint32(18, w);
		header.setUint16(22, 8); // depth
		header.setUint16(24, 3); // color mode RGB
		// color mode data len=0 + image resources len=0 + layer&mask section:
		// the parser always reads [layer info len][layer count], so len=0 is
		// rejected — minimal 12-byte body with count 0.
		const sections = new Uint8Array(24);
		const sv = new DataView(sections.buffer);
		sv.setUint32(8, 12); // layer&mask outer length
		sv.setUint32(12, 8); // layer info length
		// RLE: u16 compression=1, per-row byte-count table (all channels,
		// channel-major), then the PackBits streams in the same order.
		const rows = [];
		for (let c = 0; c < 3; c++)
			for (let y = 0; y < h; y++) {
				const row = new Uint8Array(w);
				for (let x = 0; x < w; x++) row[x] = data[(y * w + x) * 3 + c];
				rows.push(packBits(row));
			}
		const table = new DataView(new ArrayBuffer(2 * rows.length));
		let streamLen = 0;
		rows.forEach((r, i) => {
			table.setUint16(i * 2, r.length);
			streamLen += r.length;
		});
		const img = new Uint8Array(2 + table.byteLength + streamLen);
		new DataView(img.buffer).setUint16(0, 1); // RleCompressed
		img.set(new Uint8Array(table.buffer), 2);
		let off = 2 + table.byteLength;
		for (const r of rows) {
			img.set(r, off);
			off += r.length;
		}
		const psd = new Uint8Array(26 + sections.length + img.length);
		psd.set(new Uint8Array(header.buffer), 0);
		psd.set(sections, 26);
		psd.set(img, 26 + sections.length);
		await write('photo-640x400.psd', Buffer.from(psd));
		await write('psd-ref.png', await sharp(src).png().toBuffer());
		manifest['photo-640x400.psd'] = { width: w, height: h };
		manifest['psd-ref.png'] = { width: w, height: h };
	}

	// 20b. photo-640x400-raw.psd — SAME pixels, compression=0 (RawData planes).
	// Real-world PSDs commonly store raw composites (every filesamples.com
	// sample does — quality sweep F-05); the app decodes them via
	// codecs/psd-raw.ts because @webtoon/psd misreads raw planes upstream.
	// Shares psd-ref.png with the RLE twin.
	{
		const w = 640,
			h = 400;
		const src = await photoScene(w, h, { seed: 77 });
		const { data } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
		const header = new DataView(new ArrayBuffer(26));
		header.setUint32(0, 0x38425053); // '8BPS'
		header.setUint16(4, 1); // version
		header.setUint16(12, 3); // channels (RGB)
		header.setUint32(14, h);
		header.setUint32(18, w);
		header.setUint16(22, 8); // depth
		header.setUint16(24, 3); // color mode RGB
		const sections = new Uint8Array(24); // see the RLE twin for the layout
		const sv = new DataView(sections.buffer);
		sv.setUint32(8, 12);
		sv.setUint32(12, 8);
		// Raw: u16 compression=0, then planar channel dumps (R plane, G, B).
		const img = new Uint8Array(2 + 3 * w * h);
		for (let c = 0; c < 3; c++) {
			for (let i = 0; i < w * h; i++) img[2 + c * w * h + i] = data[i * 3 + c];
		}
		const psd = new Uint8Array(26 + sections.length + img.length);
		psd.set(new Uint8Array(header.buffer), 0);
		psd.set(sections, 26);
		psd.set(img, 26 + sections.length);
		await write('photo-640x400-raw.psd', Buffer.from(psd));
		manifest['photo-640x400-raw.psd'] = { width: w, height: h };
	}

	// 21. photo-720x480.jxl — sharp has no libjxl, so the JXL rides icodec's
	// node build (the same decoder e2e/verify.ts uses to read it back).
	{
		const { jxl } = await import('icodec/node');
		await jxl.loadEncoder();
		const src = await photoScene(720, 480, { seed: 61 });
		const { data, info } = await sharp(src)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		// Lossless: the .jxl carries the scene's exact pixels, so converter
		// diffs measure a single JPG generation (CV-19's tiff shape) — and
		// compress-jxl gets a genuinely compressible input.
		const encoded = jxl.encode(
			{
				data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
				width: info.width,
				height: info.height
			},
			{ lossless: true, effort: 5 }
		);
		await write(
			'photo-720x480.jxl',
			Buffer.from(encoded.buffer, encoded.byteOffset, encoded.byteLength)
		);
		manifest['photo-720x480.jxl'] = { width: 720, height: 480 };
	}
}

// --------------------------------------------------------------- animations

async function generateAnimations() {
	// 14. anim-12f.gif — 12 frames @ 80 ms
	{
		const frames = await animFrames(360, 240, 12);
		await write(
			'anim-12f.gif',
			await sharp(frames, { join: { animated: true } })
				.gif({ delay: Array(12).fill(80), loop: 0, effort: 7 })
				.toBuffer()
		);
		const m = await meta('anim-12f.gif');
		assertEq('anim-12f.gif', 'pages', m.pages, 12);
		manifest['anim-12f.gif'] = {
			width: 360,
			height: m.pageHeight ?? 240,
			pages: 12,
			delay: m.delay
		};
	}

	// 15. anim-fast.gif — 6 frames @ 10 ms (delay-bump test)
	{
		const frames = await animFrames(200, 200, 6);
		await write(
			'anim-fast.gif',
			await sharp(frames, { join: { animated: true } })
				.gif({ delay: Array(6).fill(10), loop: 0, effort: 7 })
				.toBuffer()
		);
		const m = await meta('anim-fast.gif');
		assertEq('anim-fast.gif', 'pages', m.pages, 6);
		if (!m.delay || m.delay.some((d) => d > 10))
			throw new Error(
				`gen-verify failed: anim-fast.gif delays = ${JSON.stringify(m.delay)}, expected all ≤10`
			);
		manifest['anim-fast.gif'] = {
			width: 200,
			height: m.pageHeight ?? 200,
			pages: 6,
			delay: m.delay
		};
	}

	// 16. static.gif — single frame
	{
		const src = await photoScene(256, 192, { seed: 53 });
		await write('static.gif', await sharp(src).gif().toBuffer());
		const m = await meta('static.gif');
		assertEq('static.gif', 'pages', m.pages ?? 1, 1);
		manifest['static.gif'] = { width: 256, height: 192, pages: 1 };
	}

	// 16b. anim-2f-16600x40.gif — wider than the 16383 px WebP hard cap; the
	// animated-WebP path must clamp automatically (AN-11), not hard-fail.
	{
		const W = 16600;
		const H = 40;
		const solid = (r, g, b) =>
			sharp({ create: { width: W, height: H, channels: 3, background: { r, g, b } } })
				.png()
				.toBuffer();
		const frames = [await solid(220, 60, 40), await solid(40, 90, 220)];
		await write(
			'anim-2f-16600x40.gif',
			await sharp(frames, { join: { animated: true } })
				.gif({ delay: [200, 200], loop: 0, effort: 1 })
				.toBuffer()
		);
		const m = await meta('anim-2f-16600x40.gif');
		assertEq('anim-2f-16600x40.gif', 'pages', m.pages, 2);
		assertEq('anim-2f-16600x40.gif', 'width', m.width, W);
		manifest['anim-2f-16600x40.gif'] = { width: W, height: m.pageHeight ?? H, pages: 2 };
	}

	// 17. anim-10f.webp — animated webp input
	{
		const frames = await animFrames(300, 300, 10);
		await write(
			'anim-10f.webp',
			await sharp(frames, { join: { animated: true } })
				.webp({ quality: 85, delay: Array(10).fill(100), loop: 0 })
				.toBuffer()
		);
		const m = await meta('anim-10f.webp');
		assertEq('anim-10f.webp', 'pages', m.pages, 10);
		manifest['anim-10f.webp'] = {
			width: 300,
			height: m.pageHeight ?? 300,
			pages: 10,
			delay: m.delay
		};
	}

	// 17½. anim-fast.webp — 6 frames @ 10 ms. Unlike GIF, WebP timing is real:
	// the app must NOT bump these to 100 ms (AN-10). sharp/libvips silently
	// writes 100 ms for small webp delays, so the ANMF durations (u24 LE at
	// payload offset 12) are patched to 10 ms by hand afterwards.
	{
		const frames = await animFrames(200, 200, 6);
		const encoded = await sharp(frames, { join: { animated: true } })
			.webp({ quality: 85, delay: Array(6).fill(100), loop: 0 })
			.toBuffer();
		let at = 12;
		while (at + 8 <= encoded.length) {
			const type = encoded.toString('latin1', at, at + 4);
			const size = encoded.readUInt32LE(at + 4);
			if (type === 'ANMF') {
				encoded[at + 8 + 12] = 10; // duration u24 LE → 10 ms
				encoded[at + 8 + 13] = 0;
				encoded[at + 8 + 14] = 0;
			}
			at += 8 + size + (size % 2);
		}
		await write('anim-fast.webp', encoded);
		const m = await meta('anim-fast.webp');
		assertEq('anim-fast.webp', 'pages', m.pages, 6);
		if (!m.delay || m.delay.some((d) => d > 10)) {
			throw new Error(
				`gen-verify failed: anim-fast.webp delays = ${JSON.stringify(m.delay)}, expected all ≤10`
			);
		}
		manifest['anim-fast.webp'] = {
			width: 200,
			height: m.pageHeight ?? 200,
			pages: 6,
			delay: m.delay
		};
	}

	// 17¾. apng-3f.png — hand-muxed APNG (sharp/libvips can't write one):
	// IHDR + acTL + fcTL/IDAT + 2×(fcTL/fdAT), 100 ms per frame, full-frame
	// replace (dispose 0 / blend 0). sharp reads it as a 1-page PNG, so the
	// gen-time check is structural; Chromium's ImageDecoder drives it in e2e.
	{
		const W = 240;
		const H = 180;
		const frames = await animFrames(W, H, 3);
		const pngs = [];
		for (const f of frames) {
			pngs.push(await sharp(f).ensureAlpha().png({ palette: false }).toBuffer());
		}
		const chunksOf = (png) => {
			const out = [];
			let at = 8;
			while (at + 8 <= png.length) {
				const length = png.readUInt32BE(at);
				const type = png.toString('latin1', at + 4, at + 8);
				out.push({ type, data: png.subarray(at + 8, at + 8 + length) });
				at += 12 + length;
				if (type === 'IEND') break;
			}
			return out;
		};
		const u32 = (n) => {
			const b = Buffer.alloc(4);
			b.writeUInt32BE(n >>> 0);
			return b;
		};
		const u16 = (n) => {
			const b = Buffer.alloc(2);
			b.writeUInt16BE(n);
			return b;
		};
		const ihdr = chunksOf(pngs[0]).find((c) => c.type === 'IHDR');
		const idatOf = (png) =>
			Buffer.concat(
				chunksOf(png)
					.filter((c) => c.type === 'IDAT')
					.map((c) => c.data)
			);
		let seq = 0;
		const fcTL = () =>
			pngChunkBytes(
				'fcTL',
				Buffer.concat([
					u32(seq++), // sequence number (shared with fdAT)
					u32(W),
					u32(H),
					u32(0), // x
					u32(0), // y
					u16(100), // delay 100/1000 s = 100 ms
					u16(1000),
					Buffer.from([0, 0]) // dispose none, blend source
				])
			);
		const parts = [
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			pngChunkBytes('IHDR', Buffer.from(ihdr.data)),
			pngChunkBytes('acTL', Buffer.concat([u32(3), u32(0)])), // 3 frames, loop ∞
			fcTL(),
			pngChunkBytes('IDAT', idatOf(pngs[0]))
		];
		for (const png of pngs.slice(1)) {
			parts.push(fcTL(), pngChunkBytes('fdAT', Buffer.concat([u32(seq++), idatOf(png)])));
		}
		parts.push(pngChunkBytes('IEND', Buffer.alloc(0)));
		await write('apng-3f.png', Buffer.concat(parts));
		const m = await meta('apng-3f.png');
		assertEq('apng-3f.png', 'format', m.format, 'png');
		assertEq('apng-3f.png', 'width', m.width, W);
		const raw = readFileSync(join(OUT, 'apng-3f.png')).toString('latin1');
		assertEq('apng-3f.png', 'hasAcTL', raw.includes('acTL'), true);
		manifest['apng-3f.png'] = { width: W, height: H, pages: 3, delayMs: 100 };
	}
}

// --------------------------------------------------------------------- heic

async function generateHeic() {
	// 18. iphone-photo.heic via sips (macOS) + PNG preview proxy for the report.
	const srcPng = await photoScene(1200, 800, { seed: 54 });
	await write('iphone-photo.heic.preview.png', srcPng);
	try {
		execFileSync(
			'sips',
			[
				'-s',
				'format',
				'heic',
				'-s',
				'formatOptions',
				'80',
				join(OUT, 'iphone-photo.heic.preview.png'),
				'--out',
				join(OUT, 'iphone-photo.heic')
			],
			{ stdio: 'pipe' }
		);
		const size = readFileSync(join(OUT, 'iphone-photo.heic')).length;
		if (size < 1000) throw new Error('sips produced a suspiciously small HEIC');
		manifest['iphone-photo.heic'] = { width: 1200, height: 800, size, available: true };

		// 18b. iphone-burst.heic — the SAME still with its ftyp major brand
		// patched to msf1 (image sequence). libheif still decodes the primary
		// item; the app must emit the "first frame only" warning (HE-04).
		const burst = Buffer.from(readFileSync(join(OUT, 'iphone-photo.heic')));
		burst.write('msf1', 8, 'latin1');
		await write('iphone-burst.heic', burst);
		manifest['iphone-burst.heic'] = { width: 1200, height: 800, sequenceBrand: 'msf1' };
		return true;
	} catch (err) {
		console.warn(`! sips HEIC generation unavailable (${err.message}) — HEIC tests will skip`);
		return false;
	}
}

// --------------------------------------------------------------------- svgs

function generateSvgs() {
	const clean = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
<path d="M12 2 2 7v10l10 5 10-5V7z" fill="none" stroke="#2563eb" stroke-width="1.5"/>
<circle cx="12" cy="12" r="3.5" fill="#f59e0b"/>
</svg>`;
	writeFileSync(join(OUT, 'clean-icon.svg'), clean);
	manifest['clean-icon.svg'] = { size: clean.length };

	// Deliberately filthy: comments, RDF metadata, editor namespaces, 8-decimal
	// coords, duplicate paths, off-canvas junk, inline styles, verbose ids.
	const dup = `M100.12345678,200.98765432 C150.11111111,180.22222222 220.33333333,260.44444444 300.55555555,240.66666666 S420.77777777,180.88888888 500.99999999,220.12121212`;
	const bloated = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with a very chatty editor -->
<!-- TODO: remove this comment before shipping -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd" width="800" height="600" viewBox="0 0 800 600" inkscape:version="1.3 (0e150ed, 2023-07-21)" sodipodi:docname="bloated.svg">
  <metadata id="metadata-block-with-a-very-long-identifier">
    <rdf:RDF>
      <cc:Work rdf:about="">
        <dc:format>image/svg+xml</dc:format>
        <dc:title>Bloated test fixture</dc:title>
        <dc:creator><cc:Agent><dc:title>Fixture Generator</dc:title></cc:Agent></dc:creator>
      </cc:Work>
    </rdf:RDF>
  </metadata>
  <sodipodi:namedview id="namedview-junk" pagecolor="#ffffff" bordercolor="#666666" inkscape:zoom="1.4142136" inkscape:cx="400.00000001" inkscape:cy="300.00000002"/>
  <!-- background layer -->
  <g id="layer-background-with-quite-a-long-id" inkscape:groupmode="layer" inkscape:label="Background">
    <rect id="rect-background-0000001" x="0.00000000" y="0.00000000" width="800.00000000" height="600.00000000" style="fill:#eef2ff;fill-opacity:1;stroke:none"/>
    <rect id="rect-way-off-canvas-junk" x="-2000.12345678" y="-1500.87654321" width="50.00000000" height="50.00000000" style="fill:#ff0000"/>
  </g>
  <g id="layer-artwork-also-quite-long" inkscape:groupmode="layer" inkscape:label="Artwork">
    <path id="path-wave-original-instance" d="${dup}" style="fill:none;stroke:#2563eb;stroke-width:6.12345678;stroke-linecap:round"/>
    <path id="path-wave-duplicate-instance" d="${dup}" style="fill:none;stroke:#2563eb;stroke-width:6.12345678;stroke-linecap:round"/>
    <circle id="circle-sun-shape-long-id" cx="620.11223344" cy="140.55667788" r="60.99887766" style="fill:#f59e0b;fill-opacity:0.90000000"/>
    <rect id="rect-card-shape-long-id" x="120.10101010" y="320.20202020" width="360.30303030" height="180.40404040" rx="18.50505050" style="fill:#ffffff;stroke:#94a3b8;stroke-width:2.60606060"/>
    <text id="text-label-long-id" x="300.70707070" y="420.80808080" style="font-family:Helvetica, sans-serif;font-size:36.90909090px;fill:#111827" text-anchor="middle">Vector Card</text>
  </g>
</svg>`;
	writeFileSync(join(OUT, 'bloated.svg'), bloated);
	if (!bloated.includes('<!--') || !bloated.includes('<metadata'))
		throw new Error('bloated.svg self-check failed');
	manifest['bloated.svg'] = { size: bloated.length, width: 800, height: 600 };
}

// --------------------------------------------------------------------- pdfs

const A4 = [595.28, 841.89];

// -------------------------------------------------------- bmp/tiff inputs

async function generateBmpTiff() {
	// 28. graphic.bmp — hand-written 24-bit BMP (sharp/libvips can't write OR
	// read BMP) + graphic-bmp-ref.png with IDENTICAL pixels for node-side
	// verification (same twin idea as the HEIC preview proxy).
	{
		const W = 1200;
		const H = 800;
		const raw = await sharp(await photoScene(W, H, { seed: 88, noise: 55 }))
			.removeAlpha()
			.raw()
			.toBuffer();
		const rowSize = Math.ceil((W * 3) / 4) * 4; // rows padded to 4 bytes
		const pixels = Buffer.alloc(rowSize * H);
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const src = (y * W + x) * 3;
				const dst = (H - 1 - y) * rowSize + x * 3; // bottom-up, BGR
				pixels[dst] = raw[src + 2];
				pixels[dst + 1] = raw[src + 1];
				pixels[dst + 2] = raw[src];
			}
		}
		const header = Buffer.alloc(54);
		header.write('BM', 0, 'latin1');
		header.writeUInt32LE(54 + pixels.length, 2);
		header.writeUInt32LE(54, 10); // pixel data offset
		header.writeUInt32LE(40, 14); // BITMAPINFOHEADER
		header.writeInt32LE(W, 18);
		header.writeInt32LE(H, 22);
		header.writeUInt16LE(1, 26); // planes
		header.writeUInt16LE(24, 28); // bits per pixel
		header.writeUInt32LE(0, 30); // BI_RGB (uncompressed)
		header.writeUInt32LE(pixels.length, 34);
		header.writeInt32LE(2835, 38); // 72 DPI
		header.writeInt32LE(2835, 42);
		await write('graphic.bmp', Buffer.concat([header, pixels]));
		await write(
			'graphic-bmp-ref.png',
			await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
				.png()
				.toBuffer()
		);
		assertEq(
			'graphic.bmp',
			'size',
			readFileSync(join(OUT, 'graphic.bmp')).length,
			54 + pixels.length
		);
		manifest['graphic.bmp'] = { width: W, height: H, ref: 'graphic-bmp-ref.png' };
	}

	// 29. photo.tiff — LZW TIFF (sharp reads TIFF, so verification is direct).
	{
		const src = await photoScene(800, 600, { seed: 89, noise: 30 });
		await write('photo.tiff', await sharp(src).tiff({ compression: 'lzw' }).toBuffer());
		const m = await meta('photo.tiff');
		assertEq('photo.tiff', 'format', m.format, 'tiff');
		assertEq('photo.tiff', 'width', m.width, 800);
		manifest['photo.tiff'] = { width: 800, height: 600 };
	}

	// 29b. photo-orient6.tiff — pixels STORED rotated 90° CCW with Orientation
	// tag 6 (rotate 90 CW to display). Viewers show it upright as 400×250;
	// utif2 ignores tag 274, so the worker must apply it (F-06). The upright
	// reference rides along for the pixel diff.
	{
		const upright = await photoScene(800, 600, { seed: 91, noise: 30 });
		const stored = await sharp(upright).rotate(-90).toBuffer(); // 600×800 on disk
		await write(
			'photo-orient6.tiff',
			await sharp(stored).withMetadata({ orientation: 6 }).tiff({ compression: 'lzw' }).toBuffer()
		);
		await write('photo-orient6-ref.png', await sharp(upright).png().toBuffer());
		const m = await meta('photo-orient6.tiff');
		assertEq('photo-orient6.tiff', 'width', m.width, 600);
		assertEq('photo-orient6.tiff', 'orientation', m.orientation, 6);
		manifest['photo-orient6.tiff'] = { width: 600, height: 800, orientation: 6 };
		manifest['photo-orient6-ref.png'] = { width: 800, height: 600 };
	}
}

/** Hand-written minimal LinearRaw DNG (a TIFF container with DNG tags —
 *  neither sharp nor utif2 can author one). 8-bit RGB, uncompressed. */
function buildLinearDng(width, height, rgb) {
	const model = 'CompressPro Fixture\0';
	const entries = [];
	const push = (tag, type, count, value) => entries.push({ tag, type, count, value });
	push(254, 4, 1, 0); // NewSubfileType: primary image
	push(256, 4, 1, width);
	push(257, 4, 1, height);
	push(258, 3, 3, { extra: Buffer.from(new Uint16Array([8, 8, 8]).buffer) }); // BitsPerSample
	push(259, 3, 1, 1); // Compression: none
	push(262, 3, 1, 34892); // PhotometricInterpretation: LinearRaw
	push(273, 4, 1, { strip: true }); // StripOffsets
	push(277, 3, 1, 3); // SamplesPerPixel
	push(278, 4, 1, height); // RowsPerStrip
	push(279, 4, 1, rgb.length); // StripByteCounts
	push(284, 3, 1, 1); // PlanarConfiguration: chunky
	push(50706, 1, 4, null); // DNGVersion 1.4.0.0 (inline bytes below)
	push(50708, 2, model.length, { extra: Buffer.from(model, 'ascii') }); // UniqueCameraModel
	entries.sort((a, b) => a.tag - b.tag);
	const ifdSize = 2 + entries.length * 12 + 4;
	let extraOffset = 8 + ifdSize;
	for (const e of entries) {
		if (e.value?.extra) {
			e.offset = extraOffset;
			extraOffset += e.value.extra.length + (e.value.extra.length % 2);
		}
	}
	const stripOffset = extraOffset;
	const buf = Buffer.alloc(stripOffset + rgb.length);
	buf.write('II', 0, 'ascii');
	buf.writeUInt16LE(42, 2);
	buf.writeUInt32LE(8, 4);
	let o = 8;
	buf.writeUInt16LE(entries.length, o);
	o += 2;
	for (const e of entries) {
		buf.writeUInt16LE(e.tag, o);
		buf.writeUInt16LE(e.type, o + 2);
		buf.writeUInt32LE(e.count, o + 4);
		if (e.value?.strip) buf.writeUInt32LE(stripOffset, o + 8);
		else if (e.value?.extra) buf.writeUInt32LE(e.offset, o + 8);
		else if (e.tag === 50706) {
			buf[o + 8] = 1; // DNGVersion bytes 1.4.0.0
			buf[o + 9] = 4;
		} else if (e.type === 3) buf.writeUInt16LE(e.value, o + 8);
		else buf.writeUInt32LE(e.value, o + 8);
		o += 12;
	}
	buf.writeUInt32LE(0, o); // no next IFD
	for (const e of entries) if (e.value?.extra) e.value.extra.copy(buf, e.offset);
	rgb.copy(buf, stripOffset);
	return buf;
}

async function generateRaw() {
	// 29b. photo.dng + raw-dng-ref.png — LibRaw applies its develop pipeline
	// (gamma on the linear data, white balance) so the source pixels are NOT
	// the expected output; the pixel-diff twin is generated FROM the bundled
	// decoder itself. The browser pipeline runs the same wasm, so the e2e
	// diff proves the whole predecoded path end to end.
	const W = 320;
	const H = 240;
	const rgb = await sharp(await photoScene(W, H, { seed: 91, noise: 40 }))
		.removeAlpha()
		.raw()
		.toBuffer();
	const dng = buildLinearDng(W, H, rgb);
	await write('photo.dng', dng);

	const { createRequire } = await import('node:module');
	const require = createRequire(import.meta.url);
	const factory = (await import('libraw-wasm/dist/libraw.js')).default;
	const mod = await factory({
		wasmBinary: readFileSync(require.resolve('libraw-wasm/dist/libraw.wasm'))
	});
	const lr = new mod.LibRaw();
	// MUST mirror RAW_OPEN_SETTINGS (src/lib/codecs/raw.ts) — the twin is the
	// ground truth for CV-40's pixel diff, so the develop settings must match.
	lr.open(new Uint8Array(dng), { outputBps: 8, useCameraWb: true });
	const img = lr.imageData();
	assertEq('photo.dng', 'width', img.width, W);
	assertEq('photo.dng', 'height', img.height, H);
	assertEq('photo.dng', 'colors', img.colors, 3);
	await write(
		'raw-dng-ref.png',
		await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), {
			raw: { width: img.width, height: img.height, channels: 3 }
		})
			.png()
			.toBuffer()
	);
	manifest['photo.dng'] = { width: W, height: H, ref: 'raw-dng-ref.png' };
}

// ------------------------------------------- wide gamut + decode-time resize

async function generateColorAndGiants() {
	// 30. p3-patches.{tiff,png} — pixel-identical Display-P3-tagged twins.
	// SEMANTICS (probed 2026-07-11): sharp's withIccProfile('p3') CONVERTS the
	// authored sRGB pixels into P3 space and tags (appearance-preserving
	// export) — the files physically hold P3-space values (`p3` below), and
	// their correct sRGB rendering is the authored `srgb`. Beware sharp
	// read-back: .raw() silently converts tagged input BACK to sRGB, so the
	// file values here come from utif2 (color-blind decoder, same as the app).
	// TIFF exercises the WASM path (utif2 + the worker's matrix conversion);
	// PNG rides createImageBitmap, where Chrome converts — both must land on
	// `srgb`, and landing on `p3` instead means the conversion didn't run.
	{
		const PATCHES = [
			{ at: [100, 100], srgb: [200, 30, 30] },
			{ at: [300, 100], srgb: [30, 180, 60] },
			{ at: [100, 300], srgb: [40, 60, 200] },
			{ at: [300, 300], srgb: [128, 128, 128] } // neutral: identical in both spaces
		];
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
  <rect x="0" y="0" width="200" height="200" fill="rgb(200,30,30)"/>
  <rect x="200" y="0" width="200" height="200" fill="rgb(30,180,60)"/>
  <rect x="0" y="200" width="200" height="200" fill="rgb(40,60,200)"/>
  <rect x="200" y="200" width="200" height="200" fill="rgb(128,128,128)"/>
</svg>`;
		const base = await sharp(Buffer.from(svg)).removeAlpha().toColourspace('srgb').png().toBuffer();
		await write(
			'p3-patches.tiff',
			await sharp(base).withIccProfile('p3').tiff({ compression: 'lzw' }).toBuffer()
		);
		await write('p3-patches.png', await sharp(base).withIccProfile('p3').png().toBuffer());
		for (const name of ['p3-patches.tiff', 'p3-patches.png']) {
			const m = await meta(name);
			if (!m.icc) throw new Error(`gen-verify failed: ${name} has no ICC profile`);
			assertEq(name, 'dims', [m.width, m.height], [400, 400]);
		}
		// Read the true FILE values through utif2 (exactly what the app's wasm
		// path decodes) and sanity-check the export really transformed.
		const UTIF = (await import('utif2')).default;
		const tiffBytes = readFileSync(join(OUT, 'p3-patches.tiff'));
		const ab = tiffBytes.buffer.slice(
			tiffBytes.byteOffset,
			tiffBytes.byteOffset + tiffBytes.byteLength
		);
		const ifds = UTIF.decode(ab);
		UTIF.decodeImage(ab, ifds[0]);
		const rgba = UTIF.toRGBA8(ifds[0]);
		const patches = PATCHES.map(({ at, srgb }) => {
			const i = (at[1] * 400 + at[0]) * 4;
			return { at, srgb, p3: [rgba[i], rgba[i + 1], rgba[i + 2]] };
		});
		for (const { at, srgb, p3 } of patches) {
			const neutral = srgb[0] === srgb[1] && srgb[1] === srgb[2];
			const moved = p3.some((v, c) => Math.abs(v - srgb[c]) > 4);
			if (neutral && moved) throw new Error(`gen-verify failed: neutral p3 patch drifted: ${p3}`);
			if (!neutral && !moved)
				throw new Error(`gen-verify failed: p3 patch@${at} was not transformed: ${p3}`);
		}
		manifest['p3-patches.tiff'] = { width: 400, height: 400, patches };
		manifest['p3-patches.png'] = { width: 400, height: 400, patches };
	}

	// 31. giant-photo.jpg — 5600×3800 (21.3 MP) crosses the worker's
	// FAST_DECODE_MIN_PIXELS gate (20 MP): with a maxDimension set it decodes
	// straight to target size via createImageBitmap resize options.
	{
		const src = await photoScene(5600, 3800, { seed: 90, noise: 45 });
		await write(
			'giant-photo.jpg',
			await sharp(src).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
		);
		const m = await meta('giant-photo.jpg');
		assertEq('giant-photo.jpg', 'dims', [m.width, m.height], [5600, 3800]);
		manifest['giant-photo.jpg'] = { width: 5600, height: 3800, size: m.size };
	}

	// 32. giant-exif6.jpg — same pixel count, stored landscape + EXIF
	// orientation 6 → displays portrait 3800×5600. Exercises the oriented-dims
	// math of the decode-time downscale (resize dims refer to the ORIENTED
	// image under imageOrientation:'from-image').
	{
		const display = await photoScene(3800, 5600, { seed: 91, noise: 45 });
		const stored = await sharp(display)
			.rotate(270)
			.jpeg({ quality: 82, mozjpeg: true })
			.withMetadata({ orientation: 6 })
			.toBuffer();
		await write('giant-exif6.jpg', stored);
		const m = await meta('giant-exif6.jpg');
		assertEq('giant-exif6.jpg', 'orientation', m.orientation, 6);
		assertEq('giant-exif6.jpg', 'stored dims', [m.width, m.height], [5600, 3800]);
		manifest['giant-exif6.jpg'] = {
			storedWidth: 5600,
			storedHeight: 3800,
			displayWidth: 3800,
			displayHeight: 5600
		};
	}

	// 33. wide-17000x260.jpg — wider than the 16383 px WebP hard cap (and at
	// 4.4 MP above the AUTO_AVIF gate): static WebP output must clamp with an
	// info line (R-07), Auto must keep full resolution via the JPG candidate
	// (R-08) — both used to die with a bare "Encoding error.".
	{
		const src = await photoScene(17000, 260, { seed: 92, noise: 30 });
		await write(
			'wide-17000x260.jpg',
			await sharp(src).jpeg({ quality: 80, mozjpeg: true }).toBuffer()
		);
		const m = await meta('wide-17000x260.jpg');
		assertEq('wide-17000x260.jpg', 'dims', [m.width, m.height], [17000, 260]);
		manifest['wide-17000x260.jpg'] = { width: 17000, height: 260, size: m.size };
	}

	// 34. wide-alpha-17000x120.png — over the WebP cap WITH transparency: on
	// Auto, WebP is the only candidate that can carry the alpha, so the encode
	// must clamp to 16383 px and say so (R-09) instead of failing.
	{
		const src = await sharp(Buffer.from(alphaGraphicSvg(17000, 120)))
			.png()
			.toBuffer();
		await write('wide-alpha-17000x120.png', src);
		const m = await meta('wide-alpha-17000x120.png');
		assertEq('wide-alpha-17000x120.png', 'dims', [m.width, m.height], [17000, 120]);
		assertEq('wide-alpha-17000x120.png', 'hasAlpha', m.hasAlpha ?? false, true);
		manifest['wide-alpha-17000x120.png'] = { width: 17000, height: 120 };
	}

	// 35. pano-30000x2000.jpg — 60 MP panorama for the ICO path: padToSquare
	// BEFORE downscaling would allocate a 30000² RGBA square (~3.6 GB) for an
	// output that is at most 256 px (CV-47). Upscaled from a small scene —
	// content quality is irrelevant, geometry is the point.
	{
		const src = await photoScene(3000, 200, { seed: 93, noise: 25 });
		await write(
			'pano-30000x2000.jpg',
			await sharp(src).resize(30000, 2000).jpeg({ quality: 70, mozjpeg: true }).toBuffer()
		);
		const m = await meta('pano-30000x2000.jpg');
		assertEq('pano-30000x2000.jpg', 'dims', [m.width, m.height], [30000, 2000]);
		manifest['pano-30000x2000.jpg'] = { width: 30000, height: 2000, size: m.size };
	}
}

// ---------------------------------------------------------------------- zip

async function generateZip() {
	// 31. bundle.zip — 3 entries incl. one nested path (extraction flattens
	// names to basenames) — built with fflate, the same library the app uses.
	{
		const png = await sharp(await photoScene(64, 48, { seed: 90 }))
			.png()
			.toBuffer();
		const entries = {
			'readme.txt': new TextEncoder().encode('hello from the fixture zip\n'),
			'pixel.png': new Uint8Array(png),
			'docs/nested.txt': new TextEncoder().encode('nested entry\n')
		};
		const data = zipSync(entries, { level: 6 });
		await write('bundle.zip', Buffer.from(data));
		manifest['bundle.zip'] = {
			entries: ['readme.txt', 'pixel.png', 'nested.txt'],
			sizes: { 'readme.txt': entries['readme.txt'].length, 'pixel.png': png.length }
		};
	}

	// 31b. bundle-dotfiles.zip — real dotfiles, an empty placeholder and macOS
	// sidecar noise. Extract must row the first four and drop ONLY the noise
	// (the old rule silently withheld every dot-basename and 0-byte entry).
	{
		const text = (s) => new TextEncoder().encode(s);
		const entries = {
			'.env': text('SECRET=1\n'),
			'web/.htaccess': text('Deny from all\n'),
			'empty.txt': new Uint8Array(0),
			'index.html': text('<!doctype html><title>dotfiles fixture</title>\n'),
			'__MACOSX/._index.html': text('AppleDouble resource fork'),
			'.DS_Store': text('finder junk')
		};
		await write('bundle-dotfiles.zip', Buffer.from(zipSync(entries, { level: 6 })));
		manifest['bundle-dotfiles.zip'] = {
			rows: ['.env', '.htaccess', 'empty.txt', 'index.html'],
			noise: ['__MACOSX/._index.html', '.DS_Store']
		};
	}

	// 31c. bundle-cp437.zip — legacy Windows/DOS zip: cp437 name bytes with the
	// UTF-8 flag CLEAR ('Résumé.pdf', é = 0x82). Hand-built STORED entry —
	// fflate's writers always set the UTF-8 flag, so they can't produce this.
	{
		const nameBytes = Buffer.from([0x52, 0x82, 0x73, 0x75, 0x6d, 0x82, 0x2e, 0x70, 0x64, 0x66]);
		const data = Buffer.from('legacy zip fixture payload\n');
		await write('bundle-cp437.zip', storedZip([{ nameBytes, data, flags: 0 }]));
		manifest['bundle-cp437.zip'] = { displayName: 'Résumé.pdf', text: data.toString('utf8') };
	}
}

/** CRC-32 for the hand-built zips below (fflate doesn't export its own). */
function zipCrc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal STORED-entry zip writer with full header control (raw name bytes,
 *  general-purpose flags) — the knobs fflate's writers don't expose. */
function storedZip(entries) {
	const locals = [];
	const centrals = [];
	let offset = 0;
	for (const e of entries) {
		const crc = zipCrc32(e.data);
		const local = Buffer.alloc(30 + e.nameBytes.length + e.data.length);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4); // version needed
		local.writeUInt16LE(e.flags, 6);
		local.writeUInt16LE(0, 8); // method: stored
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(e.data.length, 18);
		local.writeUInt32LE(e.data.length, 22);
		local.writeUInt16LE(e.nameBytes.length, 26);
		e.nameBytes.copy(local, 30);
		e.data.copy(local, 30 + e.nameBytes.length);
		locals.push(local);

		const central = Buffer.alloc(46 + e.nameBytes.length);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4); // version made by
		central.writeUInt16LE(20, 6); // version needed
		central.writeUInt16LE(e.flags, 8);
		central.writeUInt16LE(0, 10); // method: stored
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(e.data.length, 20);
		central.writeUInt32LE(e.data.length, 24);
		central.writeUInt16LE(e.nameBytes.length, 28);
		central.writeUInt32LE(offset, 42);
		e.nameBytes.copy(central, 46);
		centrals.push(central);
		offset += local.length;
	}
	const cd = Buffer.concat(centrals);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(entries.length, 8);
	eocd.writeUInt16LE(entries.length, 10);
	eocd.writeUInt32LE(cd.length, 12);
	eocd.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, cd, eocd]);
}

// ----------------------------------------------------------------- archives

/** One short-lived 7zz run against MEMFS; returns a reader for output paths.
 *  Mirrors the app's archive.worker.ts usage (same engine, same flags). */
async function sevenZip(args, inputs = {}) {
	const sz = await SevenZipFactory({ print: () => {}, printErr: () => {}, stdin: () => null });
	sz.FS.mkdir('/in');
	sz.FS.mkdir('/out');
	for (const [name, bytes] of Object.entries(inputs)) {
		let cur = '/in';
		for (const part of name.split('/').slice(0, -1)) {
			cur += `/${part}`;
			try {
				sz.FS.mkdir(cur);
			} catch {
				/* exists */
			}
		}
		sz.FS.writeFile(`/in/${name}`, bytes);
	}
	sz.FS.chdir('/in');
	const code = sz.callMain(args);
	if (typeof code === 'number' && code !== 0) {
		throw new Error(`7zz exited ${code}: ${args.join(' ')}`);
	}
	return sz;
}

/** Extract with 7zz and return { 'relative/path': byteLength } for gen-verify. */
async function sevenZipEntries(name, bytes, password = '') {
	const sz = await sevenZip(['x', '-y', `-p${password}`, '-o/out', '--', `/in/${name}`], {
		[name]: bytes
	});
	const walk = (dir) => {
		const acc = {};
		for (const n of sz.FS.readdir(dir)) {
			if (n === '.' || n === '..') continue;
			const full = `${dir}/${n}`;
			if (sz.FS.isDir(sz.FS.stat(full).mode)) Object.assign(acc, walk(full));
			else acc[full.slice(5)] = sz.FS.readFile(full).length;
		}
		return acc;
	};
	return walk('/out');
}

/** Minimal `ar` writer — enough for a valid .deb (BSD ar, no symbol table). */
function arArchive(members) {
	const parts = [Buffer.from('!<arch>\n')];
	for (const m of members) {
		const hdr = Buffer.alloc(60, 0x20);
		hdr.write(m.name, 0, 'latin1');
		hdr.write('0', 16, 'latin1'); // mtime
		hdr.write('0', 28, 'latin1'); // uid
		hdr.write('0', 34, 'latin1'); // gid
		hdr.write('100644', 40, 'latin1');
		hdr.write(String(m.bytes.length), 48, 'latin1');
		hdr.write('`\n', 58, 'latin1');
		parts.push(hdr, Buffer.from(m.bytes));
		if (m.bytes.length % 2) parts.push(Buffer.from('\n')); // 2-byte alignment
	}
	return Buffer.concat(parts);
}

/** Minimal cpio "newc" (SVR4, no CRC) writer. */
function cpioNewc(files) {
	const parts = [];
	const hex = (n) => n.toString(16).padStart(8, '0');
	let ino = 1;
	const push = (name, bytes, mode, nlink) => {
		const nameZ = `${name}\0`;
		const header =
			'070701' +
			hex(ino++) +
			hex(mode) +
			hex(0) + // uid
			hex(0) + // gid
			hex(nlink) +
			hex(0) + // mtime
			hex(bytes.length) +
			hex(0) + // devmajor
			hex(0) + // devminor
			hex(0) + // rdevmajor
			hex(0) + // rdevminor
			hex(nameZ.length) +
			hex(0); // check (0 for newc)
		const nameBuf = Buffer.from(nameZ, 'latin1');
		parts.push(
			Buffer.from(header, 'latin1'),
			nameBuf,
			Buffer.alloc((4 - ((110 + nameBuf.length) % 4)) % 4),
			Buffer.from(bytes),
			Buffer.alloc((4 - (bytes.length % 4)) % 4)
		);
	};
	for (const f of files) push(f.name, f.bytes, 0o100644, 1);
	push('TRAILER!!!', Buffer.alloc(0), 0, 1);
	return Buffer.concat(parts);
}

/** Minimal ustar writer. 7zz's own tar WRITER never emits symlink entries on
 *  MEMFS, but its reader recreates them as real FS.symlink nodes — so the one
 *  fixture that needs links (typeflag '2') is hand-written, like cpio/ar. */
function tarUstar(entries) {
	const octal = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';
	const blocks = [];
	for (const e of entries) {
		const bytes = e.bytes ?? new Uint8Array(0);
		const header = Buffer.alloc(512);
		header.write(e.name, 0, 'latin1');
		header.write(octal(e.linkTo ? 0o777 : 0o644, 8), 100, 'latin1'); // mode
		header.write(octal(0, 8), 108, 'latin1'); // uid
		header.write(octal(0, 8), 116, 'latin1'); // gid
		header.write(octal(bytes.length, 12), 124, 'latin1'); // size
		header.write(octal(0, 12), 136, 'latin1'); // mtime — deterministic
		header.write('        ', 148, 'latin1'); // chksum: spaces while summing
		header.write(e.linkTo ? '2' : '0', 156, 'latin1'); // typeflag
		if (e.linkTo) header.write(e.linkTo, 157, 'latin1');
		header.write('ustar', 257, 'latin1'); // magic ("ustar\0" — byte 262 stays 0)
		header.write('00', 263, 'latin1'); // version
		let sum = 0;
		for (const byte of header) sum += byte;
		header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'latin1');
		blocks.push(header, Buffer.from(bytes), Buffer.alloc((512 - (bytes.length % 512)) % 512));
	}
	blocks.push(Buffer.alloc(1024)); // two zero blocks = end of archive
	return Buffer.concat(blocks);
}

/** Like sevenZip() but captures stdout/stderr lines and never throws on a
 *  nonzero exit — for gen-verifying fixtures whose POINT is a failing run
 *  (wrong password, bomb listings). */
async function sevenZipLines(args, inputs = {}) {
	const lines = [];
	const sz = await SevenZipFactory({
		print: (l) => lines.push(l),
		printErr: (l) => lines.push(l),
		stdin: () => null
	});
	sz.FS.mkdir('/in');
	sz.FS.mkdir('/out');
	for (const [name, bytes] of Object.entries(inputs)) sz.FS.writeFile(`/in/${name}`, bytes);
	sz.FS.chdir('/in');
	let exit = null;
	try {
		exit = sz.callMain(args);
	} catch {
		exit = -1;
	}
	return { exit, lines };
}

/** Zip writer with FULL header control (raw name bytes, flags, method,
 *  claimed uncompressed size, crc) — knobs neither fflate nor 7zz expose.
 *  `data` holds the entry's stored bytes exactly as they should land in the
 *  file (already deflated and/or ZipCrypto-wrapped by the caller). */
function rawZip(entries) {
	const locals = [];
	const centrals = [];
	let offset = 0;
	for (const e of entries) {
		const local = Buffer.alloc(30 + e.nameBytes.length + e.data.length);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4); // version needed
		local.writeUInt16LE(e.flags, 6);
		local.writeUInt16LE(e.method, 8);
		local.writeUInt32LE(e.crc >>> 0, 14);
		local.writeUInt32LE(e.data.length, 18);
		local.writeUInt32LE(e.size, 22);
		local.writeUInt16LE(e.nameBytes.length, 26);
		e.nameBytes.copy(local, 30);
		e.data.copy(local, 30 + e.nameBytes.length);
		const central = Buffer.alloc(46 + e.nameBytes.length);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4); // version made by
		central.writeUInt16LE(20, 6); // version needed
		central.writeUInt16LE(e.flags, 8);
		central.writeUInt16LE(e.method, 10);
		central.writeUInt32LE(e.crc >>> 0, 16);
		central.writeUInt32LE(e.data.length, 20);
		central.writeUInt32LE(e.size, 24);
		central.writeUInt16LE(e.nameBytes.length, 28);
		central.writeUInt32LE(offset, 42);
		e.nameBytes.copy(central, 46);
		locals.push(local);
		centrals.push(central);
		offset += local.length;
	}
	const cd = Buffer.concat(centrals);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(entries.length, 8);
	eocd.writeUInt16LE(entries.length, 10);
	eocd.writeUInt32LE(cd.length, 12);
	eocd.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, cd, eocd]);
}

/** PKZIP stream cipher (ZipCrypto) — the encryption every pre-AES Windows
 *  archiver used, and the shape legacy cp437-named zips actually come in.
 *  Deterministic: the 12-byte header is fixed bytes + the crc check byte. */
function zipCryptoEncrypt(password, plain, crc) {
	let k0 = 0x12345678,
		k1 = 0x23456789,
		k2 = 0x34567890;
	const crcTab = [];
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		crcTab[n] = c >>> 0;
	}
	const crcByte = (state, b) => (crcTab[(state ^ b) & 0xff] ^ (state >>> 8)) >>> 0;
	const update = (b) => {
		k0 = crcByte(k0, b);
		k1 = (k1 + (k0 & 0xff)) >>> 0;
		k1 = (Math.imul(k1, 134775813) + 1) >>> 0;
		k2 = crcByte(k2, k1 >>> 24);
	};
	const keystream = () => {
		const t = (k2 | 2) & 0xffff;
		return (Math.imul(t, t ^ 1) >> 8) & 0xff;
	};
	for (const ch of Buffer.from(password, 'latin1')) update(ch);
	const header = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, (crc >>> 24) & 0xff]);
	const out = Buffer.alloc(12 + plain.length);
	for (let i = 0; i < header.length; i++) {
		out[i] = header[i] ^ keystream();
		update(header[i]);
	}
	for (let i = 0; i < plain.length; i++) {
		out[12 + i] = plain[i] ^ keystream();
		update(plain[i]);
	}
	return out;
}

async function generateArchives() {
	const enc = (s) => new TextEncoder().encode(s);
	const CONTENTS = {
		'alpha.txt': enc('alpha entry — compress-pro archive fixture\n'),
		'beta.json': enc('{"fixture":true,"n":42}\n'),
		'docs/gamma.txt': enc('nested entry for flatten/preserve checks\n')
	};
	const TOP = ['alpha.txt', 'beta.json', 'docs'];
	const BASENAMES = ['alpha.txt', 'beta.json', 'gamma.txt'];

	const expectEntries = async (file, name, bytes, password = '') => {
		const got = Object.keys(await sevenZipEntries(name, bytes, password))
			.map((p) => p.split('/').pop())
			.sort();
		const want = [...BASENAMES].sort();
		if (JSON.stringify(got) !== JSON.stringify(want)) {
			throw new Error(`gen-verify failed: ${file} entries ${got} != ${want}`);
		}
	};

	// 40. 7z bundles: plain, data-encrypted, and header-encrypted (-mhe=on —
	// even the file list needs the password).
	{
		const plain = (
			await sevenZip(['a', '-t7z', '-mx5', '-md=16m', '--', '/out/bundle.7z', ...TOP], CONTENTS)
		).FS.readFile('/out/bundle.7z'); //
		await expectEntries('bundle.7z', 'bundle.7z', plain);
		await write('bundle.7z', Buffer.from(plain));
		manifest['bundle.7z'] = { entries: BASENAMES, password: null };

		const locked = (
			await sevenZip(
				['a', '-t7z', '-mx5', '-md=16m', '-pTEST', '--', '/out/l.7z', ...TOP],
				CONTENTS
			)
		).FS.readFile('/out/l.7z');
		await expectEntries('bundle-locked.7z', 'l.7z', locked, 'TEST');
		await write('bundle-locked.7z', Buffer.from(locked));
		manifest['bundle-locked.7z'] = { entries: BASENAMES, password: 'TEST' };

		const hidden = (
			await sevenZip(
				['a', '-t7z', '-mx5', '-md=16m', '-pTEST', '-mhe=on', '--', '/out/h.7z', ...TOP],
				CONTENTS
			)
		).FS.readFile('/out/h.7z');
		await expectEntries('bundle-hidden.7z', 'h.7z', hidden, 'TEST');
		await write('bundle-hidden.7z', Buffer.from(hidden));
		manifest['bundle-hidden.7z'] = { entries: BASENAMES, password: 'TEST', headerEncrypted: true };
	}

	// 41. AES-256 zip (7zz-made; fflate can't decrypt it — the app must route
	// password zips through the 7z worker).
	{
		const aes = (
			await sevenZip(
				['a', '-tzip', '-mx5', '-pTEST', '-mem=AES256', '--', '/out/a.zip', ...TOP],
				CONTENTS
			)
		).FS.readFile('/out/a.zip');
		await expectEntries('bundle-aes.zip', 'a.zip', aes, 'TEST');
		await write('bundle-aes.zip', Buffer.from(aes));
		manifest['bundle-aes.zip'] = { entries: BASENAMES, password: 'TEST' };
	}

	// 41b. ZipCrypto STORED zip (the classic `zip -e -0` shape: incompressible
	// content stores, ZipCrypto encrypts). fflate "extracts" such entries as
	// key-header + XOR ciphertext with NO error — the app must read the
	// encryption bit and route to the worker instead.
	{
		const secret = enc('top secret notes — zipcrypto fixture\n');
		const zc = (
			await sevenZip(
				['a', '-tzip', '-mx0', '-pTEST', '-mem=ZipCrypto', '--', '/out/zc.zip', 'secret.txt'],
				{ 'secret.txt': secret }
			)
		).FS.readFile('/out/zc.zip');
		// gen-verify: the entry must be method 0 (stored) WITH bit 0 set — the
		// exact shape fflate mis-extracts silently. Read the central directory.
		const buf = Buffer.from(zc);
		const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
		const cd = buf.readUInt32LE(eocd + 16);
		const flags = buf.readUInt16LE(cd + 8);
		const method = buf.readUInt16LE(cd + 10);
		if (!(flags & 1) || method !== 0) {
			throw new Error(
				`bundle-zipcrypto.zip: expected stored+encrypted, got flags=${flags} method=${method}`
			);
		}
		// gen-verify: the password opens it and yields the exact plaintext.
		const opened = await sevenZipEntries('zc.zip', zc, 'TEST');
		if (opened['secret.txt'] !== secret.length) {
			throw new Error(`bundle-zipcrypto.zip: gen-verify failed (${JSON.stringify(opened)})`);
		}
		await write('bundle-zipcrypto.zip', Buffer.from(zc));
		manifest['bundle-zipcrypto.zip'] = {
			entries: ['secret.txt'],
			password: 'TEST',
			text: 'top secret notes — zipcrypto fixture\n'
		};
	}

	// 42. tar + tar.gz (tar via 7zz — the tar the app writes; gzip via fflate).
	{
		const tar = (
			await sevenZip(['a', '-ttar', '--', '/out/bundle.tar', ...TOP], CONTENTS)
		).FS.readFile('/out/bundle.tar'); //
		await expectEntries('bundle.tar', 'bundle.tar', tar);
		await write('bundle.tar', Buffer.from(tar));
		manifest['bundle.tar'] = { entries: BASENAMES };

		const tgz = gzipSync(tar, { level: 6 });
		await write('bundle.tar.gz', Buffer.from(tgz));
		manifest['bundle.tar.gz'] = { entries: BASENAMES, chained: true };
	}

	// 43. Single-file streams (extract must yield exactly the inner file).
	{
		const text = enc('stream fixture — one file, one compressed stream\n');
		writeFileSync(join(OUT, 'stream.txt'), Buffer.from(text));
		manifest['stream.txt'] = { size: text.length };
		for (const [ext, type] of [
			['gz', 'gzip'],
			['bz2', 'bzip2'],
			['xz', 'xz']
		]) {
			const out = (
				await sevenZip(['a', `-t${type}`, '-mx5', '--', `/out/stream.txt.${ext}`, 'stream.txt'], {
					'stream.txt': text
				})
			).FS.readFile(`/out/stream.txt.${ext}`);
			const entries = await sevenZipEntries(`stream.txt.${ext}`, out);
			if (Object.keys(entries).length !== 1) {
				throw new Error(`gen-verify failed: stream.txt.${ext} should hold exactly one entry`);
			}
			await write(`stream.txt.${ext}`, Buffer.from(out));
			manifest[`stream.txt.${ext}`] = { inner: 'stream.txt', size: text.length };
		}
	}

	// 44. deb — ar(debian-binary, control.tar.gz, data.tar.gz); the app must
	// chain-unwrap data.tar.* and skip the control files.
	{
		const dataTar = (
			await sevenZip(['a', '-ttar', '--', '/out/data.tar', 'usr'], {
				'usr/share/doc/fixture/hello.txt': enc('payload file from the deb fixture\n')
			})
		).FS.readFile('/out/data.tar');
		const controlTar = (
			await sevenZip(['a', '-ttar', '--', '/out/control.tar', 'control'], {
				control: enc('Package: fixture\nVersion: 1.0\nArchitecture: all\n')
			})
		).FS.readFile('/out/control.tar');
		const deb = arArchive([
			{ name: 'debian-binary', bytes: enc('2.0\n') },
			{ name: 'control.tar.gz', bytes: gzipSync(controlTar, { level: 6 }) },
			{ name: 'data.tar.gz', bytes: gzipSync(dataTar, { level: 6 }) }
		]);
		// gen-verify: 7zz's Deb handler surfaces the (already gunzipped) data
		// payload directly — pass 1 must yield data.tar, pass 2 the real file.
		const members = Object.keys(await sevenZipEntries('sample.deb', new Uint8Array(deb)));
		if (JSON.stringify(members) !== JSON.stringify(['data.tar'])) {
			throw new Error(`gen-verify failed: sample.deb members ${members}`);
		}
		const inner = Object.keys(await sevenZipEntries('data.tar', dataTar));
		if (!inner.some((p) => p.endsWith('hello.txt'))) {
			throw new Error(`gen-verify failed: sample.deb payload ${inner}`);
		}
		await write('sample.deb', deb);
		manifest['sample.deb'] = { chain: ['data.tar'], payloadEntry: 'hello.txt' };
	}

	// 45. cpio (newc) — hand-written; rpm payloads use this shape.
	{
		const cpio = cpioNewc([
			{ name: 'first.txt', bytes: enc('first cpio entry\n') },
			{ name: 'dir/second.txt', bytes: enc('second cpio entry\n') }
		]);
		const entries = Object.keys(await sevenZipEntries('sample.cpio', new Uint8Array(cpio)));
		if (entries.length !== 2) throw new Error(`gen-verify failed: sample.cpio entries ${entries}`);
		await write('sample.cpio', cpio);
		manifest['sample.cpio'] = { entries: ['first.txt', 'second.txt'] };
	}

	// 46. tar.gz with symlinks — real-world tarballs (node/python dists, deb
	// data.tars) carry them; the app must SKIP links (walkOut's lstat guard)
	// and still deliver every regular file. Covers all the nasty orders: link
	// before its target, link after it (the target is already freed by then),
	// dangling, and absolute (7zz rebases it under the output dir → dangling).
	{
		const tar = tarUstar([
			{ name: 'link-first.txt', linkTo: 'target.txt' },
			{ name: 'target.txt', bytes: enc('the link target — a regular file\n') },
			{ name: 'link-after.txt', linkTo: 'target.txt' },
			{ name: 'dangling.txt', linkTo: 'missing.txt' },
			{ name: 'abs.txt', linkTo: '/etc/hosts' },
			{ name: 'docs/nested.txt', bytes: enc('regular file after the links\n') }
		]);
		// gen-verify: 7zz must extract cleanly AND materialize the links as real
		// MEMFS symlinks — the exact condition walkOut has to survive.
		const sz = await sevenZip(['x', '-y', '-p', '-o/out', '--', '/in/links.tar'], {
			'links.tar': new Uint8Array(tar)
		});
		const top = sz.FS.readdir('/out').filter((n) => n !== '.' && n !== '..');
		const links = top.filter((n) => sz.FS.isLink(sz.FS.lstat(`/out/${n}`).mode));
		if (links.length !== 4) {
			throw new Error(`gen-verify failed: links.tar should yield 4 symlinks, got [${links}]`);
		}
		if (!top.includes('target.txt') || !sz.FS.readdir('/out/docs').includes('nested.txt')) {
			throw new Error('gen-verify failed: links.tar regular files missing');
		}
		await write('links.tar.gz', Buffer.from(gzipSync(new Uint8Array(tar), { level: 6 })));
		manifest['links.tar.gz'] = { files: ['target.txt', 'nested.txt'], links: 4 };
	}

	// 47. zip-bomb.zip — 40 REAL deflate entries of 64 MiB zeros each (~2.6 MB
	// on disk, 2.5 GiB claimed) with the encryption bit set so the app routes
	// it to the 7z worker (fflate would inflate it on the main thread). The
	// extract path must refuse from the LIST pass's Size sum, before callMain
	// balloons the JS heap.
	{
		const MB = 1024 * 1024;
		const zeros = Buffer.alloc(64 * MB);
		const deflated = deflateRawSync(zeros, { level: 9 });
		const crc = crc32(zeros);
		const bombEntries = [];
		for (let i = 0; i < 40; i++) {
			bombEntries.push({
				nameBytes: Buffer.from(`zeros-${String(i).padStart(2, '0')}.bin`),
				data: deflated,
				flags: 1,
				method: 8,
				crc,
				size: zeros.length
			});
		}
		const bomb = rawZip(bombEntries);
		if (bomb.length > 4 * MB) throw new Error(`zip-bomb.zip too big: ${bomb.length}`);
		// gen-verify: the engine must LIST it cleanly (exit 0) with the full
		// uncompressed sum visible — that sum is what the app's guard reads.
		const { exit, lines } = await sevenZipLines(['l', '-slt', '-y', '-p', '--', '/in/bomb.zip'], {
			'bomb.zip': new Uint8Array(bomb)
		});
		const sep = lines.findIndex((l) => l.startsWith('----------'));
		const sum = lines
			.slice(sep + 1)
			.filter((l) => l.startsWith('Size = '))
			.reduce((t, l) => t + (parseInt(l.slice(7), 10) || 0), 0);
		if (exit !== 0 || sum !== 40 * zeros.length) {
			throw new Error(`gen-verify failed: zip-bomb.zip list exit=${exit} sum=${sum}`);
		}
		await write('zip-bomb.zip', bomb);
		manifest['zip-bomb.zip'] = { entries: 40, totalUncompressed: 40 * zeros.length };
	}

	// 48. bundle-cp437-locked.zip — the LEGACY shape end to end: cp437 name
	// bytes (no UTF-8 flag) + ZipCrypto. Password-protected forces the 7zz
	// worker path, whose C-locale build mangles the name irrecoverably — the
	// app must re-label from the central directory (zip-name-repair).
	{
		const text = 'legacy locked zip fixture payload\n';
		const plain = Buffer.from(text);
		const crc = crc32(plain);
		// 'Résumé.pdf' in cp437 (é = 0x82).
		const nameBytes = Buffer.from([0x52, 0x82, 0x73, 0x75, 0x6d, 0x82, 0x2e, 0x70, 0x64, 0x66]);
		const locked = rawZip([
			{
				nameBytes,
				data: zipCryptoEncrypt('TEST', plain, crc),
				flags: 1,
				method: 0,
				crc,
				size: plain.length
			}
		]);
		// gen-verify: no password → wrong-password failure; TEST → exact bytes.
		const bad = await sevenZipLines(['x', '-y', '-p', '-o/out', '--', '/in/l.zip'], {
			'l.zip': new Uint8Array(locked)
		});
		if (bad.exit === 0 || !bad.lines.some((l) => /wrong password/i.test(l))) {
			throw new Error(`gen-verify failed: bundle-cp437-locked.zip opened without a password`);
		}
		const opened = await sevenZipEntries('l.zip', new Uint8Array(locked), 'TEST');
		const sizes = Object.values(opened);
		if (sizes.length !== 1 || sizes[0] !== plain.length) {
			throw new Error(`gen-verify failed: bundle-cp437-locked.zip ${JSON.stringify(opened)}`);
		}
		await write('bundle-cp437-locked.zip', locked);
		manifest['bundle-cp437-locked.zip'] = { displayName: 'Résumé.pdf', password: 'TEST', text };
	}

	// 49. bundle-utf8-aes.zip — modern non-ASCII names through the worker
	// path: 7zz's own writer flags the name UTF-8 and AES-encrypts. The
	// reader side must surface the name intact (verified: the engine passes
	// valid UTF-8 through unmangled).
	{
		const utf8Name = 'Résumé-übər.txt';
		const text = 'utf8 name through the aes worker path\n';
		const aes = (
			await sevenZip(
				['a', '-tzip', '-mx5', '-pTEST', '-mem=AES256', '--', '/out/u.zip', utf8Name],
				{
					[utf8Name]: enc(text)
				}
			)
		).FS.readFile('/out/u.zip');
		// gen-verify: UTF-8 flag + encryption bit set, and the password opens it
		// with the name intact.
		const buf = Buffer.from(aes);
		const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
		const flags = buf.readUInt16LE(buf.readUInt32LE(eocd + 16) + 8);
		if (!(flags & 0x800) || !(flags & 1)) {
			throw new Error(`gen-verify failed: bundle-utf8-aes.zip flags=${flags.toString(16)}`);
		}
		const openedAes = await sevenZipEntries('u.zip', aes, 'TEST');
		if (!Object.keys(openedAes).some((p) => p.endsWith(utf8Name))) {
			throw new Error(`gen-verify failed: bundle-utf8-aes.zip names ${Object.keys(openedAes)}`);
		}
		await write('bundle-utf8-aes.zip', Buffer.from(aes));
		manifest['bundle-utf8-aes.zip'] = { entries: [utf8Name], password: 'TEST', text };
	}

	// 50. bundle-mixed-enc.zip — 3 ZipCrypto-locked entries FIRST, then 70
	// plain ones: extracting without a password prints "Wrong password" early
	// and then 70+ per-entry lines — the exact shape that evicted the signal
	// from a plain 60-line tail ring (the app must latch it).
	{
		const mixed = [];
		for (let i = 0; i < 3; i++) {
			const secret = Buffer.from(`mixed-enc locked entry ${i}\n`);
			const crc = crc32(secret);
			mixed.push({
				nameBytes: Buffer.from(`locked-${i}.txt`),
				data: zipCryptoEncrypt('TEST', secret, crc),
				flags: 1,
				method: 0,
				crc,
				size: secret.length
			});
		}
		for (let i = 0; i < 70; i++) {
			const data = Buffer.from(`plain entry ${i}\n`);
			mixed.push({
				nameBytes: Buffer.from(`plain-${String(i).padStart(2, '0')}.txt`),
				data,
				flags: 0,
				method: 0,
				crc: crc32(data),
				size: data.length
			});
		}
		const zip = rawZip(mixed);
		// gen-verify: passwordless extract fails WITH the signal, the signal
		// sits outside a plain last-60 ring (the regression this fixture
		// exists to catch), and the right password opens everything.
		const noPw = await sevenZipLines(
			['x', '-y', '-bb1', '-bsp0', '-p', '-o/out', '--', '/in/m.zip'],
			{
				'm.zip': new Uint8Array(zip)
			}
		);
		const hasSignal = noPw.lines.some((l) => /wrong password/i.test(l));
		const ringHasSignal = noPw.lines.slice(-60).some((l) => /wrong password/i.test(l));
		if (noPw.exit === 0 || !hasSignal || ringHasSignal) {
			throw new Error(
				`gen-verify failed: bundle-mixed-enc.zip exit=${noPw.exit} signal=${hasSignal} inRing=${ringHasSignal}`
			);
		}
		const openedMixed = await sevenZipEntries('m.zip', new Uint8Array(zip), 'TEST');
		if (Object.keys(openedMixed).length !== 73) {
			throw new Error(
				`gen-verify failed: bundle-mixed-enc.zip TEST opened ${Object.keys(openedMixed).length}/73`
			);
		}
		await write('bundle-mixed-enc.zip', zip);
		manifest['bundle-mixed-enc.zip'] = { locked: 3, plain: 70, password: 'TEST' };
	}

	// 51. bundle-tar-inside-aes.zip — a password zip holding EXACTLY ONE tar.
	// The old entry-name chain guess exploded it into the tar's files (and
	// flipped behavior on entry count); keyed on the outer type (zip =
	// bundling, not a wrapper) it must come back as backup.tar itself.
	// Password → the worker path, where the chain rule actually runs.
	{
		const innerTar = (
			await sevenZip(['a', '-ttar', '--', '/out/backup.tar', ...TOP], CONTENTS)
		).FS.readFile('/out/backup.tar');
		const zipped = (
			await sevenZip(
				['a', '-tzip', '-mx1', '-pTEST', '-mem=AES256', '--', '/out/t.zip', 'backup.tar'],
				{ 'backup.tar': innerTar }
			)
		).FS.readFile('/out/t.zip');
		const openedZip = await sevenZipEntries('t.zip', zipped, 'TEST');
		if (JSON.stringify(Object.keys(openedZip)) !== JSON.stringify(['backup.tar'])) {
			throw new Error(
				`gen-verify failed: bundle-tar-inside-aes.zip members ${Object.keys(openedZip)}`
			);
		}
		await write('bundle-tar-inside-aes.zip', Buffer.from(zipped));
		manifest['bundle-tar-inside-aes.zip'] = {
			entries: ['backup.tar'],
			password: 'TEST',
			tarEntries: BASENAMES
		};
	}
}

// -------------------------------------------------------------------- audio

async function generateAudio() {
	// 30. tone-3s.wav — deterministic 3 s stereo sine sweep, hand-written PCM
	// (no encoder dependency; WAV is a 44-byte header + samples).
	{
		const SR = 44100;
		const SECONDS = 3;
		const CHANNELS = 2;
		const frames = SR * SECONDS;
		const data = Buffer.alloc(frames * CHANNELS * 2);
		for (let i = 0; i < frames; i++) {
			const t = i / SR;
			// Two tones + a slow sweep so lossy encoders have real work to do.
			const left =
				0.4 * Math.sin(2 * Math.PI * 440 * t) + 0.2 * Math.sin(2 * Math.PI * (880 + 200 * t) * t);
			const right =
				0.4 * Math.sin(2 * Math.PI * 554.37 * t) + 0.2 * Math.sin(2 * Math.PI * 330 * t);
			data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left)) * 32767), i * 4);
			data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right)) * 32767), i * 4 + 2);
		}
		const header = Buffer.alloc(44);
		header.write('RIFF', 0, 'latin1');
		header.writeUInt32LE(36 + data.length, 4);
		header.write('WAVE', 8, 'latin1');
		header.write('fmt ', 12, 'latin1');
		header.writeUInt32LE(16, 16); // fmt chunk size
		header.writeUInt16LE(1, 20); // PCM
		header.writeUInt16LE(CHANNELS, 22);
		header.writeUInt32LE(SR, 24);
		header.writeUInt32LE(SR * CHANNELS * 2, 28); // byte rate
		header.writeUInt16LE(CHANNELS * 2, 32); // block align
		header.writeUInt16LE(16, 34); // bits per sample
		header.write('data', 36, 'latin1');
		header.writeUInt32LE(data.length, 40);
		await write('tone-3s.wav', Buffer.concat([header, data]));
		const size = readFileSync(join(OUT, 'tone-3s.wav')).length;
		assertEq('tone-3s.wav', 'size', size, 44 + frames * CHANNELS * 2);
		manifest['tone-3s.wav'] = {
			durationSec: SECONDS,
			sampleRate: SR,
			channels: CHANNELS,
			size,
			// Tone table for the Goertzel probes (e2e/helpers.ts audioMetricsInPage);
			// e2e/audio-fixtures.ts encodes the SAME plan — keep the twins in sync.
			// The sweep term sin(2π(880+200t)t) has instantaneous frequency
			// 880+400t → 880..2080 Hz over the 3 s; 3 kHz sits safely above it.
			tones: {
				left: [{ hz: 440, amp: 0.4 }],
				right: [
					{ hz: 554.37, amp: 0.4 },
					{ hz: 330, amp: 0.2 }
				],
				sweep: { channel: 'left', fromHz: 880, toHz: 2080, amp: 0.2 },
				controlHz: 3000
			}
		};
	}

	// 30b. noise-10s.wav — seeded white noise: the HARDEST content for a lossy
	// audio encoder, so an ABR/VBR AAC encode must spend close to the
	// requested bitrate. Regression net for "bitrate pills are decorative"
	// (probe 2026-07-11 on real music: 96→99%, 192→91%, 256→94% of request;
	// pure tones legitimately undershoot to ~53 kbps — that is VBR working).
	{
		const SR = 44100;
		const SECONDS = 10;
		const CHANNELS = 2;
		const frames = SR * SECONDS;
		const data = Buffer.alloc(frames * CHANNELS * 2);
		// Deterministic LCG (Numerical Recipes constants) — fixtures must not
		// change across regenerations.
		let state = 0xc0ffee;
		const next = () => {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
			return state / 0xffffffff - 0.5;
		};
		for (let i = 0; i < frames; i++) {
			data.writeInt16LE(Math.round(next() * 0.9 * 32767), i * 4);
			data.writeInt16LE(Math.round(next() * 0.9 * 32767), i * 4 + 2);
		}
		const header = Buffer.alloc(44);
		header.write('RIFF', 0, 'latin1');
		header.writeUInt32LE(36 + data.length, 4);
		header.write('WAVE', 8, 'latin1');
		header.write('fmt ', 12, 'latin1');
		header.writeUInt32LE(16, 16);
		header.writeUInt16LE(1, 20); // PCM
		header.writeUInt16LE(CHANNELS, 22);
		header.writeUInt32LE(SR, 24);
		header.writeUInt32LE(SR * CHANNELS * 2, 28);
		header.writeUInt16LE(CHANNELS * 2, 32);
		header.writeUInt16LE(16, 34);
		header.write('data', 36, 'latin1');
		header.writeUInt32LE(data.length, 40);
		await write('noise-10s.wav', Buffer.concat([header, data]));
		assertEq(
			'noise-10s.wav',
			'size',
			readFileSync(join(OUT, 'noise-10s.wav')).length,
			44 + frames * CHANNELS * 2
		);
		manifest['noise-10s.wav'] = { durationSec: SECONDS, sampleRate: SR, channels: CHANNELS };
	}
}

async function generatePdfs() {
	// 22. text-3pages.pdf — vector text only
	{
		const doc = await PDFDocument.create();
		const font = await doc.embedFont(StandardFonts.Helvetica);
		const bold = await doc.embedFont(StandardFonts.HelveticaBold);
		for (let p = 1; p <= 3; p++) {
			const page = doc.addPage(A4);
			page.drawText(`Fixture document — page ${p}`, { x: 50, y: 780, size: 20, font: bold });
			for (let line = 0; line < 38; line++) {
				page.drawText(
					`Paragraph ${p}.${line + 1}: the quick brown fox jumps over the lazy dog, 0123456789, verifying vector text compression.`,
					{ x: 50, y: 740 - line * 18, size: 10, font, color: rgb(0.12, 0.12, 0.15) }
				);
			}
		}
		writeFileSync(join(OUT, 'text-3pages.pdf'), await doc.save());
		const check = await PDFDocument.load(readFileSync(join(OUT, 'text-3pages.pdf')));
		assertEq('text-3pages.pdf', 'pageCount', check.getPageCount(), 3);
		manifest['text-3pages.pdf'] = { pages: 3 };
	}

	// 22b. form-filled.pdf — filled AcroForm + link annotations. The gs wasm
	// build drops EVERY annotation on rewrite (quality sweep F-03): filled form
	// values and hyperlinks vanish. This fixture proves the preservation path:
	// values must stay VISIBLE (flatten pre-pass) and links must survive
	// (post-pass transplant).
	{
		const doc = await PDFDocument.create();
		const font = await doc.embedFont(StandardFonts.Helvetica);
		const page1 = doc.addPage(A4);
		const page2 = doc.addPage(A4);
		page1.drawText('Interactive fixture — filled form + links', { x: 50, y: 780, size: 16, font });
		page2.drawText('Second page (GoTo link target)', { x: 50, y: 780, size: 16, font });
		const form = doc.getForm();
		const nameField = form.createTextField('fixture.name');
		nameField.setText('MATRIX-VALUE-42');
		nameField.addToPage(page1, { x: 50, y: 700, width: 240, height: 24, font });
		const agree = form.createCheckBox('fixture.agree');
		agree.addToPage(page1, { x: 50, y: 660, width: 18, height: 18 });
		agree.check();
		form.updateFieldAppearances(font);
		// pdf-lib has no high-level link API — raw /Link annots (URI + GoTo).
		const uriLink = doc.context.register(
			doc.context.obj({
				Type: 'Annot',
				Subtype: 'Link',
				Rect: [50, 600, 260, 620],
				Border: [0, 0, 0],
				A: { Type: 'Action', S: 'URI', URI: pdfLib.PDFString.of('https://example.com/matrix-link') }
			})
		);
		const gotoLink = doc.context.register(
			doc.context.obj({
				Type: 'Annot',
				Subtype: 'Link',
				Rect: [50, 560, 260, 580],
				Border: [0, 0, 0],
				Dest: [page2.ref, 'Fit']
			})
		);
		page1.node.set(PDFName.of('Annots'), doc.context.obj([uriLink, gotoLink]));
		page1.drawText('Visit example.com/matrix-link', {
			x: 52,
			y: 605,
			size: 11,
			font,
			color: rgb(0.1, 0.3, 0.8)
		});
		page1.drawText('Jump to page 2', { x: 52, y: 565, size: 11, font, color: rgb(0.1, 0.3, 0.8) });
		writeFileSync(join(OUT, 'form-filled.pdf'), await doc.save());
		const check = await PDFDocument.load(readFileSync(join(OUT, 'form-filled.pdf')));
		assertEq('form-filled.pdf', 'pageCount', check.getPageCount(), 2);
		assertEq(
			'form-filled.pdf',
			'field value',
			check.getForm().getTextField('fixture.name').getText(),
			'MATRIX-VALUE-42'
		);
		manifest['form-filled.pdf'] = { pages: 2, fieldValue: 'MATRIX-VALUE-42' };
	}

	// 23. image-heavy.pdf — 3 A4 pages, full-bleed ~300 DPI JPEGs (compressible)
	{
		const doc = await PDFDocument.create();
		for (let p = 0; p < 3; p++) {
			const jpg = await sharp(await photoScene(2480, 3508, { noise: 55, seed: 60 + p }))
				.jpeg({ quality: 90 })
				.toBuffer();
			const img = await doc.embedJpg(jpg);
			const page = doc.addPage(A4);
			page.drawImage(img, { x: 0, y: 0, width: A4[0], height: A4[1] });
		}
		writeFileSync(join(OUT, 'image-heavy.pdf'), await doc.save());
		const bytes = readFileSync(join(OUT, 'image-heavy.pdf'));
		const check = await PDFDocument.load(bytes);
		assertEq('image-heavy.pdf', 'pageCount', check.getPageCount(), 3);
		assertRange('image-heavy.pdf', 'size', bytes.length, 2_000_000, 12_000_000);
		manifest['image-heavy.pdf'] = { pages: 3, size: bytes.length };
	}

	// 23b. image-heavy-large.pdf — bench-only (~20 MB): the image-heavy recipe
	// scaled to 26 pages of unique JPEGs, sized so the Ghostscript memory
	// scenario measures a genuinely large job. Gated on E2E_BENCH so normal
	// runs never pay the ~minute of generation.
	if (BENCH) {
		const doc = await PDFDocument.create();
		const PAGES = 26;
		for (let p = 0; p < PAGES; p++) {
			const jpg = await sharp(await photoScene(2480, 3508, { noise: 55, seed: 600 + p }))
				.jpeg({ quality: 90 })
				.toBuffer();
			const img = await doc.embedJpg(jpg);
			const page = doc.addPage(A4);
			page.drawImage(img, { x: 0, y: 0, width: A4[0], height: A4[1] });
		}
		writeFileSync(join(OUT, BENCH_PDF), await doc.save());
		const bytes = readFileSync(join(OUT, BENCH_PDF));
		const check = await PDFDocument.load(bytes);
		assertEq(BENCH_PDF, 'pageCount', check.getPageCount(), PAGES);
		assertRange(BENCH_PDF, 'size', bytes.length, 12_000_000, 60_000_000);
		manifest[BENCH_PDF] = { pages: PAGES, size: bytes.length };
	}

	// 24. pages-12.pdf — page N is (400+N) pt wide → order/selection fingerprint
	{
		const doc = await PDFDocument.create();
		const bold = await doc.embedFont(StandardFonts.HelveticaBold);
		for (let n = 1; n <= 12; n++) {
			const page = doc.addPage([400 + n, 300]);
			page.drawText(String(n), { x: 150, y: 90, size: 140, font: bold, color: rgb(0.1, 0.3, 0.7) });
		}
		writeFileSync(join(OUT, 'pages-12.pdf'), await doc.save());
		const check = await PDFDocument.load(readFileSync(join(OUT, 'pages-12.pdf')));
		assertEq('pages-12.pdf', 'pageCount', check.getPageCount(), 12);
		assertEq(
			'pages-12.pdf',
			'widths',
			check.getPages().map((p) => Math.round(p.getWidth())),
			Array.from({ length: 12 }, (_, i) => 401 + i)
		);
		manifest['pages-12.pdf'] = { pages: 12, widths: Array.from({ length: 12 }, (_, i) => 401 + i) };
	}

	// 25½. metadata.pdf — DOCINFO + catalog XMP stream; the strip-metadata spec
	// (P-08) asserts BOTH are gone after compression. Sentinel strings are
	// unique so raw byte searches can't false-positive on page content. The
	// embedded high-DPI JPEG matters: without compressible content, gs output
	// grows and the keep-original guard would hand back the unstripped input.
	{
		const doc = await PDFDocument.create();
		const font = await doc.embedFont(StandardFonts.Helvetica);
		const page = doc.addPage(A4);
		page.drawText('Metadata fixture — the page content itself is boring.', {
			x: 50,
			y: 780,
			size: 14,
			font
		});
		// ~600 DPI at the drawn size — even Low (300 DPI cap) downsamples, so
		// every level genuinely shrinks and the keep-original guard stays out.
		const jpg = await sharp(await photoScene(4960, 3200, { noise: 55, seed: 77 }))
			.jpeg({ quality: 90 })
			.toBuffer();
		const img = await doc.embedJpg(jpg);
		page.drawImage(img, { x: 0, y: 100, width: A4[0], height: 384 });
		doc.setTitle('FixtureSecretTitle');
		doc.setAuthor('FixtureSecretAuthor');
		const xmp = [
			'<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
			'<x:xmpmeta xmlns:x="adobe:ns:meta/">',
			'<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
			'<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">',
			'<dc:title><rdf:Alt><rdf:li xml:lang="x-default">FixtureSecretTitle</rdf:li></rdf:Alt></dc:title>',
			'<dc:creator><rdf:Seq><rdf:li>FixtureSecretAuthor</rdf:li></rdf:Seq></dc:creator>',
			'</rdf:Description></rdf:RDF></x:xmpmeta>',
			'<?xpacket end="w"?>'
		].join('\n');
		const stream = doc.context.stream(Buffer.from(xmp, 'utf8'), {
			Type: 'Metadata',
			Subtype: 'XML'
		});
		doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream));
		writeFileSync(join(OUT, 'metadata.pdf'), await doc.save());

		const bytes = readFileSync(join(OUT, 'metadata.pdf'));
		const raw = bytes.toString('latin1');
		assertEq('metadata.pdf', 'hasXmp', raw.includes('xpacket'), true);
		assertEq('metadata.pdf', 'hasXmpTitle', raw.includes('FixtureSecretTitle'), true);
		const check = await PDFDocument.load(bytes, { updateMetadata: false });
		assertEq('metadata.pdf', 'docInfoTitle', check.getTitle(), 'FixtureSecretTitle');
		manifest['metadata.pdf'] = { pages: 1, secret: 'FixtureSecretTitle' };
	}

	// 25. merge-a/b/c.pdf — unique page sizes = merge/reorder fingerprint
	{
		const specs = [
			{ name: 'merge-a.pdf', size: [595, 842], pages: ['A1', 'A2'] },
			{ name: 'merge-b.pdf', size: [612, 792], pages: ['B1'] },
			{ name: 'merge-c.pdf', size: [500, 500], pages: ['C1', 'C2'] }
		];
		for (const spec of specs) {
			const doc = await PDFDocument.create();
			const bold = await doc.embedFont(StandardFonts.HelveticaBold);
			for (const label of spec.pages) {
				const page = doc.addPage(spec.size);
				page.drawText(label, {
					x: spec.size[0] / 2 - 90,
					y: spec.size[1] / 2 - 60,
					size: 120,
					font: bold,
					color: rgb(0.75, 0.2, 0.2)
				});
			}
			writeFileSync(join(OUT, spec.name), await doc.save());
			const check = await PDFDocument.load(readFileSync(join(OUT, spec.name)));
			assertEq(spec.name, 'pageCount', check.getPageCount(), spec.pages.length);
			manifest[spec.name] = { pages: spec.pages.length, pageWidth: spec.size[0] };
		}
	}
}

// -------------------------------------------------------------------- fonts

/**
 * Deterministic font family: opentype.js authors a tiny CFF (OTF) font from
 * hand-written glyph paths; fonteditor-core (a FOREIGN implementation — the
 * app hand-rolls its own WOFF/EOT) derives ttf/woff/eot; the Google woff2
 * codec (fonteditor-core's node build) derives woff2. Plus two error inputs:
 * corrupt.ttf (valid magic, lying directory) and mtx.eot (MicroType flag).
 * Returns false when the node woff2 wasm fails — woff2 e2e tests then skip.
 */
async function generateFonts() {
	const O = opentypeNs.default?.Font ? opentypeNs.default : opentypeNs;
	const fonteditor = fonteditorNs.Font ? fonteditorNs : fonteditorNs.default;
	const { Font, woff2 } = fonteditor;
	const toBuf = (x) => (Buffer.isBuffer(x) ? x : Buffer.from(new Uint8Array(x)));
	const toAb = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
	const sfntInfo = (buf) => {
		const numTables = buf.readUInt16BE(4);
		const tags = [];
		for (let i = 0; i < numTables; i++) tags.push(buf.toString('latin1', 12 + i * 16, 16 + i * 16));
		return { numTables, tags };
	};

	// 33. font-tiny.otf — authored glyphs (straight-line paths keep it tiny).
	const glyph = (name, unicode, contours) => {
		const path = new O.Path();
		for (const points of contours) {
			points.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
			path.close();
		}
		return new O.Glyph({ name, unicode, advanceWidth: 560, path });
	};
	const glyphs = [
		new O.Glyph({ name: '.notdef', advanceWidth: 560, path: new O.Path() }),
		new O.Glyph({ name: 'space', unicode: 32, advanceWidth: 400, path: new O.Path() }),
		glyph('A', 65, [
			[
				[40, 0],
				[230, 700],
				[330, 700],
				[520, 0],
				[400, 0],
				[280, 520],
				[160, 0]
			]
		]),
		glyph('B', 66, [
			[
				[60, 0],
				[60, 700],
				[420, 700],
				[480, 540],
				[420, 380],
				[480, 160],
				[400, 0]
			],
			[
				[180, 420],
				[180, 580],
				[340, 580],
				[340, 420]
			]
		]),
		glyph('C', 67, [
			[
				[500, 120],
				[380, 0],
				[120, 0],
				[40, 350],
				[120, 700],
				[380, 700],
				[500, 580],
				[400, 520],
				[330, 590],
				[190, 590],
				[150, 350],
				[190, 110],
				[330, 110],
				[400, 180]
			]
		])
	];
	const authored = new O.Font({
		familyName: 'Fixture Sans',
		styleName: 'Regular',
		unitsPerEm: 1000,
		ascender: 800,
		descender: -200,
		glyphs
	});
	const otf = toBuf(authored.toArrayBuffer());
	await write('font-tiny.otf', otf);
	{
		const info = sfntInfo(otf);
		assertEq('font-tiny.otf', 'magic', otf.toString('latin1', 0, 4), 'OTTO');
		for (const tag of ['CFF ', 'head', 'name', 'OS/2', 'cmap']) {
			assertEq('font-tiny.otf', `has ${tag}`, info.tags.includes(tag), true);
		}
		manifest['font-tiny.otf'] = { flavor: 'cff', ...info, unitsPerEm: 1000, size: otf.length };
	}

	// 34. font-tiny.ttf — fonteditor-core's CFF→glyf conversion of the same font.
	const parsed = Font.create(toAb(otf), { type: 'otf', hinting: true });
	const ttf = toBuf(parsed.write({ type: 'ttf', hinting: true }));
	await write('font-tiny.ttf', ttf);
	{
		const info = sfntInfo(ttf);
		assertEq('font-tiny.ttf', 'magic', ttf.readUInt32BE(0), 0x00010000);
		assertEq('font-tiny.ttf', 'has glyf', info.tags.includes('glyf'), true);
		manifest['font-tiny.ttf'] = { flavor: 'glyf', ...info, size: ttf.length };
	}

	// 35/36. font-tiny.woff (fonteditor's own WOFF writer, zlib via fflate) and
	// font-tiny.eot (fonteditor's ttf2eot) — both derived from the ttf.
	const ttfFont = Font.create(toAb(ttf), { type: 'ttf', hinting: true });
	const woff = toBuf(
		ttfFont.write({ type: 'woff', hinting: true, deflate: (u8) => zlibSync(Uint8Array.from(u8)) })
	);
	await write('font-tiny.woff', woff);
	assertEq('font-tiny.woff', 'signature', woff.toString('latin1', 0, 4), 'wOFF');
	assertEq('font-tiny.woff', 'flavor', woff.readUInt32BE(4), 0x00010000);
	manifest['font-tiny.woff'] = {
		flavor: 'glyf',
		numTables: woff.readUInt16BE(12),
		size: woff.length
	};

	const eot = toBuf(ttfFont.write({ type: 'eot', hinting: true }));
	await write('font-tiny.eot', eot);
	assertEq('font-tiny.eot', 'magic', eot.readUInt16LE(34), 0x504c);
	manifest['font-tiny.eot'] = { size: eot.length };

	// 37½. font-var.ttf — font-tiny.ttf with a synthetic 1-axis fvar spliced in.
	// The glyphs carry no real variation data (gvar) — enough for the axis UI
	// and the fvar parser; hb instancing is exercised against real VFs only
	// (tests/fixtures/real, self-skipping).
	{
		const numTables = ttf.readUInt16BE(4);
		const tables = [];
		for (let i = 0; i < numTables; i++) {
			const at = 12 + i * 16;
			tables.push({
				tag: ttf.toString('latin1', at, at + 4),
				checksum: ttf.readUInt32BE(at + 4),
				data: ttf.subarray(
					ttf.readUInt32BE(at + 8),
					ttf.readUInt32BE(at + 8) + ttf.readUInt32BE(at + 12)
				)
			});
		}
		const fvar = Buffer.alloc(16 + 20);
		fvar.writeUInt16BE(1, 0); // majorVersion
		fvar.writeUInt16BE(16, 4); // axesArrayOffset
		fvar.writeUInt16BE(2, 6); // reserved
		fvar.writeUInt16BE(1, 8); // axisCount
		fvar.writeUInt16BE(20, 10); // axisSize
		fvar.write('wght', 16, 'latin1');
		fvar.writeInt32BE(100 * 65536, 20); // min
		fvar.writeInt32BE(400 * 65536, 24); // def
		fvar.writeInt32BE(900 * 65536, 28); // max
		fvar.writeUInt16BE(0, 32); // flags
		fvar.writeUInt16BE(256, 34); // axisNameID
		tables.push({ tag: 'fvar', checksum: 0, data: fvar });
		tables.sort((a, b) => (a.tag < b.tag ? -1 : 1));
		const pad4 = (n) => (n + 3) & ~3;
		const total = 12 + tables.length * 16 + tables.reduce((sum, t) => sum + pad4(t.data.length), 0);
		const out = Buffer.alloc(total);
		out.writeUInt32BE(0x00010000, 0);
		out.writeUInt16BE(tables.length, 4);
		const entrySelector = Math.floor(Math.log2(tables.length));
		const searchRange = 2 ** entrySelector * 16;
		out.writeUInt16BE(searchRange, 6);
		out.writeUInt16BE(entrySelector, 8);
		out.writeUInt16BE(tables.length * 16 - searchRange, 10);
		let offset = 12 + tables.length * 16;
		tables.forEach((t, i) => {
			const at = 12 + i * 16;
			out.write(t.tag, at, 'latin1');
			out.writeUInt32BE(t.checksum, at + 4);
			out.writeUInt32BE(offset, at + 8);
			out.writeUInt32BE(t.data.length, at + 12);
			t.data.copy(out, offset);
			offset += pad4(t.data.length);
		});
		await write('font-var.ttf', out);
		const info = sfntInfo(out);
		assertEq('font-var.ttf', 'has fvar', info.tags.includes('fvar'), true);
		manifest['font-var.ttf'] = {
			flavor: 'glyf',
			...info,
			axes: [{ tag: 'wght', min: 100, def: 400, max: 900 }]
		};
	}

	// 38. corrupt.ttf — valid sfnt magic, absurd table count, truncated body.
	{
		const rand = mulberry32(1234);
		const junk = Buffer.alloc(256);
		for (let i = 0; i < junk.length; i++) junk[i] = Math.floor(rand() * 256);
		junk.writeUInt32BE(0x00010000, 0);
		junk.writeUInt16BE(0xffff, 4); // numTables far beyond any real font
		await write('corrupt.ttf', junk);
		manifest['corrupt.ttf'] = { size: 256 };
	}

	// 39. mtx.eot — structurally valid EOT header with the MicroType Express
	// flag set (TTEMBED_TTCOMPRESSED) over junk data; the app must reject it
	// with the MicroType message, not a generic parse error.
	{
		const rand = mulberry32(4321);
		const data = Buffer.alloc(64);
		for (let i = 0; i < data.length; i++) data[i] = Math.floor(rand() * 256);
		const headerSize = 80 + 4 * 4 + 4; // fixed + four empty strings + empty root string
		const mtx = Buffer.alloc(headerSize + data.length);
		mtx.writeUInt32LE(mtx.length, 0); // EOTSize
		mtx.writeUInt32LE(data.length, 4); // FontDataSize
		mtx.writeUInt32LE(0x00020001, 8); // Version
		mtx.writeUInt32LE(0x00000004, 12); // Flags: TTEMBED_TTCOMPRESSED
		mtx.writeUInt16LE(0x504c, 34); // MagicNumber
		data.copy(mtx, headerSize);
		await write('mtx.eot', mtx);
		manifest['mtx.eot'] = { size: mtx.length, compression: 'mtx' };
	}

	// 37. font-tiny.woff2 — Google codec (wasm); node init can fail on exotic
	// setups, so its absence is recorded rather than fatal (heicAvailable idea).
	try {
		await woff2.init();
		const w2 = toBuf(woff2.encode(toAb(ttf)));
		if (w2.length < 100) throw new Error('woff2 encode produced a suspiciously small file');
		await write('font-tiny.woff2', w2);
		assertEq('font-tiny.woff2', 'signature', w2.toString('latin1', 0, 4), 'wOF2');
		assertEq('font-tiny.woff2', 'flavor', w2.readUInt32BE(4), 0x00010000);
		manifest['font-tiny.woff2'] = {
			flavor: 'glyf',
			numTables: w2.readUInt16BE(12),
			size: w2.length
		};
		return true;
	} catch (err) {
		console.warn(`! node woff2 wasm unavailable (${err.message}) — woff2 font tests will skip`);
		return false;
	}
}

// ------------------------------------------------------------------- errors

// ------------------------------------------------------------- exif fixtures

// Hand-built big-endian TIFF — deliberately independent of the app's own
// EXIF writer/parser so tests never verify the code with itself.
function buildTestExifTiff({ make, model, dateTimeOriginal, orientation, gps }) {
	const u16 = (n) => [(n >> 8) & 0xff, n & 0xff];
	const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
	const ascii = (s) => [...Buffer.from(s + '\0', 'latin1')];

	const ifd0Entries = [];
	const heap = [];
	let exifIfd = null;
	let gpsIfd = null;

	const ifd0Count =
		(make ? 1 : 0) +
		(model ? 1 : 0) +
		(orientation ? 1 : 0) +
		(dateTimeOriginal ? 1 : 0) +
		(gps ? 1 : 0);
	const ifd0Size = 2 + ifd0Count * 12 + 4;
	const exifIfdAt = 8 + ifd0Size;
	const exifIfdSize = dateTimeOriginal ? 2 + 12 + 4 : 0;
	const gpsIfdAt = exifIfdAt + exifIfdSize;
	const gpsIfdSize = gps ? 2 + 4 * 12 + 4 : 0;
	let heapAt = gpsIfdAt + gpsIfdSize;

	const push = (tag, type, count, value) =>
		ifd0Entries.push([...u16(tag), ...u16(type), ...u32(count), ...value]);
	const heapAscii = (s) => {
		const bytes = ascii(s);
		const at = heapAt;
		heap.push(...bytes);
		heapAt += bytes.length;
		return { at, length: bytes.length };
	};

	if (make) {
		const { at, length } = heapAscii(make);
		push(0x010f, 2, length, u32(at));
	}
	if (model) {
		const { at, length } = heapAscii(model);
		push(0x0110, 2, length, u32(at));
	}
	if (orientation) push(0x0112, 3, 1, [...u16(orientation), 0, 0]);
	if (dateTimeOriginal) push(0x8769, 4, 1, u32(exifIfdAt));
	if (gps) push(0x8825, 4, 1, u32(gpsIfdAt));

	if (dateTimeOriginal) {
		const { at, length } = heapAscii(dateTimeOriginal);
		exifIfd = [...u16(1), ...u16(0x9003), ...u16(2), ...u32(length), ...u32(at), ...u32(0)];
	}
	if (gps) {
		const rational = (deg) => {
			const d = Math.floor(deg);
			const m = Math.floor((deg - d) * 60);
			const s = Math.round(((deg - d) * 60 - m) * 60 * 1000);
			return [...u32(d), ...u32(1), ...u32(m), ...u32(1), ...u32(s), ...u32(1000)];
		};
		const latAt = heapAt;
		heap.push(...rational(Math.abs(gps.lat)));
		heapAt += 24;
		const lonAt = heapAt;
		heap.push(...rational(Math.abs(gps.lon)));
		heapAt += 24;
		gpsIfd = [
			...u16(4),
			...u16(0x0001),
			...u16(2),
			...u32(2),
			gps.lat >= 0 ? 0x4e : 0x53,
			0,
			0,
			0,
			...u16(0x0002),
			...u16(5),
			...u32(3),
			...u32(latAt),
			...u16(0x0003),
			...u16(2),
			...u32(2),
			gps.lon >= 0 ? 0x45 : 0x57,
			0,
			0,
			0,
			...u16(0x0004),
			...u16(5),
			...u32(3),
			...u32(lonAt),
			...u32(0)
		];
	}

	return Buffer.from([
		0x4d,
		0x4d,
		0x00,
		0x2a,
		...u32(8),
		...u16(ifd0Count),
		...ifd0Entries.flat(),
		...u32(0),
		...(exifIfd ?? []),
		...(gpsIfd ?? []),
		...heap
	]);
}

function jpegSegment(marker, payload) {
	const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'latin1');
	return Buffer.concat([
		Buffer.from([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff]),
		body
	]);
}

/** Splices raw segments right after SOI (before whatever sharp wrote). */
function spliceJpegSegments(jpeg, segments) {
	return Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
}

function pngChunkBytes(type, payload) {
	const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'latin1');
	const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), body]);
	const length = Buffer.alloc(4);
	length.writeUInt32BE(body.length);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(typeAndData) >>> 0);
	return Buffer.concat([length, typeAndData, crc]);
}

async function generateExifFixtures() {
	const GPS = { lat: 46.0511, lon: 14.5051 };
	const exifTiff = buildTestExifTiff({
		make: 'Apple',
		model: 'Apple iPhone 15 Pro',
		dateTimeOriginal: '2026:05:14 09:30:00',
		orientation: 1,
		gps: GPS
	});
	const exifApp1 = jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), exifTiff]));
	const xmpApp1 = jpegSegment(
		0xe1,
		'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"/>'
	);
	const comment = jpegSegment(0xfe, 'shot on my phone');

	// 1. JPEG with EXIF (GPS + camera + date) + XMP + comment.
	{
		const base = await sharp(await photoScene(800, 600, { seed: 77 }))
			.jpeg({ quality: 85 })
			.toBuffer();
		const spliced = spliceJpegSegments(base, [exifApp1, xmpApp1, comment]);
		await write('exif-gps.jpg', spliced);
		const m = await meta('exif-gps.jpg');
		if (!m.exif) throw new Error('gen-verify failed: exif-gps.jpg has no EXIF after splice');
		manifest['exif-gps.jpg'] = { width: 800, height: 600, gps: GPS, make: 'Apple', size: m.size };
	}

	// 2. JPEG with an ICC profile + EXIF (for the removeIcc toggle test).
	{
		const base = await sharp(await photoScene(600, 400, { seed: 78 }))
			.withIccProfile('p3')
			.jpeg({ quality: 85 })
			.toBuffer();
		const spliced = spliceJpegSegments(base, [exifApp1]);
		await write('exif-icc.jpg', spliced);
		const m = await meta('exif-icc.jpg');
		if (!m.icc) throw new Error('gen-verify failed: exif-icc.jpg has no ICC profile');
		if (!m.exif) throw new Error('gen-verify failed: exif-icc.jpg has no EXIF');
		manifest['exif-icc.jpg'] = { width: 600, height: 400 };
	}

	// 3. PNG with eXIf (orientation 6 + camera) and text chunks.
	{
		const base = await sharp(await photoScene(400, 300, { seed: 79 }))
			.png()
			.toBuffer();
		const eXIf = pngChunkBytes('eXIf', buildTestExifTiff({ make: 'Canon', orientation: 6 }));
		const tEXt = pngChunkBytes('tEXt', 'Author\0Nik');
		const ihdrEnd = 8 + 25; // signature + IHDR chunk (13-byte payload)
		const spliced = Buffer.concat([base.subarray(0, ihdrEnd), eXIf, tEXt, base.subarray(ihdrEnd)]);
		await write('text-exif.png', spliced);
		const m = await meta('text-exif.png');
		if (m.orientation !== 6) throw new Error('gen-verify failed: text-exif.png orientation not 6');
		manifest['text-exif.png'] = { width: 400, height: 300, orientation: 6 };
	}

	// 4. WebP with an EXIF chunk (hand-built VP8X wrapper — sharp's EXIF
	//    support for webp varies, RIFF splicing doesn't).
	{
		const base = await sharp(await photoScene(400, 300, { seed: 80 }))
			.webp({ quality: 85 })
			.toBuffer();
		const imageChunks = base.subarray(12); // after RIFF....WEBP
		const vp8x = Buffer.alloc(18);
		vp8x.write('VP8X', 0, 'latin1');
		vp8x.writeUInt32LE(10, 4);
		vp8x[8] = 0x08; // EXIF flag
		vp8x.writeUIntLE(400 - 1, 12, 3);
		vp8x.writeUIntLE(300 - 1, 15, 3);
		const tiff = buildTestExifTiff({ make: 'Google', orientation: 6 });
		const exifChunk = Buffer.concat([
			Buffer.from('EXIF', 'latin1'),
			(() => {
				const b = Buffer.alloc(4);
				b.writeUInt32LE(tiff.length);
				return b;
			})(),
			tiff,
			tiff.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)
		]);
		const body = Buffer.concat([vp8x, imageChunks, exifChunk]);
		const out = Buffer.alloc(12 + body.length);
		out.write('RIFF', 0, 'latin1');
		out.writeUInt32LE(4 + body.length, 4);
		out.write('WEBP', 8, 'latin1');
		body.copy(out, 12);
		await write('exif.webp', out);
		const m = await meta('exif.webp');
		if (!m.exif) throw new Error('gen-verify failed: exif.webp has no EXIF');
		manifest['exif.webp'] = { width: 400, height: 300, orientation: m.orientation ?? null };
	}
}

function generateErrorFiles() {
	const rand = mulberry32(999);
	const junk = Buffer.alloc(256);
	for (let i = 0; i < junk.length; i++) junk[i] = Math.floor(rand() * 256);
	junk[0] = 0x00; // ensure no accidental valid magic bytes
	junk[1] = 0x01;
	writeFileSync(join(OUT, 'corrupt.jpg'), junk);
	writeFileSync(join(OUT, 'corrupt.pdf'), junk);
	writeFileSync(join(OUT, 'notes.txt'), 'Just some plain text notes.\nNot an image, not a PDF.\n');
	manifest['corrupt.jpg'] = { size: 256 };
	manifest['corrupt.pdf'] = { size: 256 };
	manifest['notes.txt'] = {};
}

async function generateEbooks() {
	// Structurally honest minimal EPUB 3 + CBZ fixtures. Images ride STORED
	// (tuple form, level 0) like the app writes them; XML deflates at 6.
	const jpg1 = await sharp(await photoScene(1200, 800, { seed: 96 }))
		.jpeg({ quality: 90 })
		.toBuffer();
	const jpg2 = await sharp(await photoScene(900, 1200, { seed: 97, noise: 60 }))
		.jpeg({ quality: 88 })
		.toBuffer();
	const png1 = await sharp(Buffer.from(alphaGraphicSvg(600, 400)))
		.png()
		.toBuffer();
	const enc = (s) => new TextEncoder().encode(s);

	const containerXml =
		'<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
	const contentOpf =
		'<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:5f3a2e10-9d7c-4b56-8f21-compresspro1</dc:identifier><dc:title>Fixture Book</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/><item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/><item id="img1" href="images/photo1.jpg" media-type="image/jpeg"/><item id="img2" href="images/photo2.jpg" media-type="image/jpeg"/><item id="img3" href="images/diagram.png" media-type="image/png"/></manifest><spine><itemref idref="ch1"/><itemref idref="ch2"/></spine></package>';
	const navXhtml =
		'<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head><body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">Chapter 1</a></li></ol></nav></body></html>';
	const chapterXhtml =
		'<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head><body><h1>Chapter 1</h1><p>The quick brown fox jumps over the lazy dog, verifying ebook recompression.</p><img src="images/photo1.jpg" alt="photo one"/><img src="images/photo2.jpg" alt="photo two"/><img src="images/diagram.png" alt="diagram"/></body></html>';
	// ch2 sits BEFORE ch1 in both the zip and the OPF manifest, but AFTER it in
	// the spine — epub-to-txt output order proves the spine won. The &amp; and
	// <style> give entity resolution and skip-list handling teeth.
	const chapter2Xhtml =
		'<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 2</title><style>p { color: red; }</style></head><body><h1>Chapter 2</h1><p>Second chapter marker sentence &amp; spine-order proof.</p></body></html>';

	const epubEntries = {
		mimetype: [enc('application/epub+zip'), { level: 0 }],
		'META-INF/container.xml': [enc(containerXml), { level: 6 }],
		'OEBPS/content.opf': [enc(contentOpf), { level: 6 }],
		'OEBPS/nav.xhtml': [enc(navXhtml), { level: 6 }],
		'OEBPS/chapter2.xhtml': [enc(chapter2Xhtml), { level: 6 }],
		'OEBPS/chapter1.xhtml': [enc(chapterXhtml), { level: 6 }],
		'OEBPS/images/photo1.jpg': [new Uint8Array(jpg1), { level: 0 }],
		'OEBPS/images/photo2.jpg': [new Uint8Array(jpg2), { level: 0 }],
		'OEBPS/images/diagram.png': [new Uint8Array(png1), { level: 0 }]
	};
	const epub = zipSync(epubEntries);
	// gen-verify the OCF rule the e2e later asserts on the OUTPUT
	if (
		(epub[8] | (epub[9] << 8)) !== 0 ||
		Buffer.from(epub.slice(30, 38)).toString() !== 'mimetype'
	) {
		throw new Error('sample.epub: mimetype-first/stored rule broken in generator');
	}
	await write('sample.epub', Buffer.from(epub));
	manifest['sample.epub'] = {
		entries: Object.keys(epubEntries).length,
		imageSizes: {
			'OEBPS/images/photo1.jpg': jpg1.length,
			'OEBPS/images/photo2.jpg': jpg2.length,
			'OEBPS/images/diagram.png': png1.length
		}
	};

	// DRM variant — real encryption algorithm, must be refused by the app.
	const encryptionXml =
		'<?xml version="1.0" encoding="UTF-8"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><enc:CipherData><enc:CipherReference URI="OEBPS/images/photo1.jpg"/></enc:CipherData></enc:EncryptedData></encryption>';
	const drmEntries = { ...epubEntries };
	drmEntries['META-INF/encryption.xml'] = [enc(encryptionXml), { level: 6 }];
	await write('sample-drm.epub', Buffer.from(zipSync(drmEntries)));
	manifest['sample-drm.epub'] = {};

	// CBZ — ComicInfo.xml deliberately LAST (alphabetical rebuild would move it
	// first, giving the e2e order assertion teeth).
	// page01 is an oversized scan (1400×2000) so the 1200 px cap has real work;
	// the rest sit under every cap and must pass through un-resized.
	const pages = [
		await sharp(await photoScene(1400, 2000, { seed: 98 }))
			.jpeg({ quality: 90 })
			.toBuffer()
	];
	for (let i = 1; i < 4; i++) {
		pages.push(
			await sharp(await photoScene(700, 1000, { seed: 98 + i }))
				.jpeg({ quality: 90 })
				.toBuffer()
		);
	}
	const pageWebp = await sharp(await photoScene(700, 1000, { seed: 102 }))
		.webp({ quality: 90 })
		.toBuffer();
	const pageGif = await sharp(await photoScene(320, 460, { seed: 103 }))
		.gif()
		.toBuffer();
	const comicInfo =
		'<?xml version="1.0" encoding="utf-8"?><ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Title>Fixture Comic</Title><Series>Compress Pro Fixtures</Series><PageCount>6</PageCount></ComicInfo>';
	const cbzOrder = [
		'page01.jpg',
		'page02.jpg',
		'page03.jpg',
		'page04.jpg',
		'page05.webp',
		'page06.gif',
		'ComicInfo.xml'
	];
	const cbzBytes = [
		...pages.map((p) => new Uint8Array(p)),
		new Uint8Array(pageWebp),
		new Uint8Array(pageGif),
		enc(comicInfo)
	];
	const cbzEntries = {};
	cbzOrder.forEach((name, i) => {
		cbzEntries[name] = [cbzBytes[i], { level: name.endsWith('.xml') ? 6 : 0 }];
	});
	await write('sample.cbz', Buffer.from(zipSync(cbzEntries)));
	manifest['sample.cbz'] = { order: cbzOrder, page01: { width: 1400, height: 2000 } };

	// Deflated variant: q100 keeps every image (per-entry guard), but the app
	// rebuilds them STORED → output strictly bigger → deterministic whole-file
	// keep-original (phase-0 measured: deflate saves ~2 KB per 83 KB jpg).
	const cbzDeflated = {};
	cbzOrder.forEach((name, i) => {
		cbzDeflated[name] = [cbzBytes[i], { level: 6 }];
	});
	await write('sample-deflated.cbz', Buffer.from(zipSync(cbzDeflated)));
	manifest['sample-deflated.cbz'] = {};

	// CBR cannot be generated (no RAR writer exists) — reuse the committed
	// libarchive-corpus RAR under comic names. Entries are text files: proves
	// RAR-read + zip-rebuild + rename with 0 images (limitation documented).
	const rar = readFileSync(join(ROOT, 'tests', 'fixtures', 'archives', 'sample-v5-multi.rar'));
	await write('sample.cbr', rar);
	await write('sample-rar.cbz', rar); // mislabeled: fflate fails → 7zz fallback
	manifest['sample.cbr'] = {};
	manifest['sample-rar.cbz'] = {};
}

async function generateData() {
	const XLSX = await import('xlsx');
	// BOM on the INPUT csv too — the parser must strip it before the header.
	const csv =
		'\uFEFF' +
		'Name,Qty,Price,Note\n' +
		'Žižek čaj,3,4.5,"has, comma"\n' +
		'Šipek,12,0.8,"two\nlines"\n' +
		'Ćevapčići,5,7.25,plain\n';
	const semicolon = 'Artikel;Menge;Preis\nČaj;3;4,50\nŠipek;12;0,80\n';
	const json = JSON.stringify(
		{
			name: 'Compress Pro',
			version: 2,
			active: true,
			notes: null,
			tags: ['čšž', 'data'],
			nested: { depth: { value: 3.14 } }
		},
		null,
		2
	);
	// anchor + alias + block scalar + comment (comment must vanish in JSON);
	// no merge keys — YAML 1.2.
	const yaml =
		'# top comment — must vanish in JSON\n' +
		'defaults: &base\n  retries: 3\n  timeout: 30\n' +
		'prod_config: *base\n' +
		'description: |\n  multi-line\n  block čšž\n' +
		'items:\n  - one\n  - two\n';
	const ws = XLSX.utils.aoa_to_sheet([
		['Name', 'Qty', 'Price', 'Date', 'Total'],
		['Žižek čaj', 3, 4.5, null, null],
		['Šipek', 12, 0.8, null, null]
	]);
	ws['D2'] = { t: 'd', v: new Date(Date.UTC(2026, 0, 15)), z: 'yyyy-mm-dd' };
	ws['E2'] = { t: 'n', f: 'B2*C2', v: 13.5 };
	ws['!ref'] = 'A1:E3';
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Data');
	XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['SECOND-SHEET-MARKER']]), 'Extra');
	writeFileSync(
		join(OUT, 'sample.xlsx'),
		XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true })
	);
	writeFileSync(join(OUT, 'sample.csv'), csv);
	writeFileSync(join(OUT, 'sample-semicolon.csv'), semicolon);
	writeFileSync(join(OUT, 'sample.json'), json);
	writeFileSync(join(OUT, 'sample.yaml'), yaml);
	writeFileSync(join(OUT, 'corrupt.data.json'), '{"unterminated": ');
	manifest['sample.csv'] = { rows: 4, cols: 4 };
	manifest['sample-semicolon.csv'] = { rows: 3, cols: 3 };
	manifest['sample.xlsx'] = { sheets: 2, rows: 3, cols: 5 };
	manifest['sample.json'] = {};
	manifest['sample.yaml'] = {};
	manifest['corrupt.data.json'] = {};
}

async function generateModels() {
	// UV sphere with pole-clean triangles: exact counts survive draco/weld
	// round-trips, so e2e can assert them precisely. weld() merges the two
	// bitwise-identical pole seams → 12,511 verts post-optimize (measured).
	const { Document, NodeIO } = await import('@gltf-transform/core');
	const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
	const { draco } = await import('@gltf-transform/functions');
	const draco3d = (await import('draco3d')).default;

	function buildSphere(doc, { withTexture }) {
		const segments = 128,
			rings = 96;
		const positions = [],
			normals = [],
			uvs = [],
			indices = [];
		for (let r = 0; r <= rings; r++) {
			const phi = (r / rings) * Math.PI;
			for (let s = 0; s <= segments; s++) {
				const theta = (s / segments) * 2 * Math.PI;
				const x = Math.sin(phi) * Math.cos(theta);
				const y = Math.cos(phi);
				const z = Math.sin(phi) * Math.sin(theta);
				positions.push(x, y, z);
				normals.push(x, y, z);
				uvs.push(s / segments, r / rings);
			}
		}
		const stride = segments + 1;
		for (let r = 0; r < rings; r++)
			for (let s = 0; s < segments; s++) {
				const a = r * stride + s;
				const b = a + stride;
				if (r > 0) indices.push(a, b, a + 1);
				if (r < rings - 1) indices.push(a + 1, b, b + 1);
			}
		const buffer = doc.createBuffer();
		const prim = doc
			.createPrimitive()
			.setIndices(
				doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer)
			)
			.setAttribute(
				'POSITION',
				doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer)
			)
			.setAttribute(
				'NORMAL',
				doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer)
			)
			.setAttribute(
				'TEXCOORD_0',
				doc.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer)
			);
		if (withTexture) {
			const texture = doc.createTexture('photo').setImage(withTexture).setMimeType('image/jpeg');
			prim.setMaterial(doc.createMaterial('mat').setBaseColorTexture(texture));
		}
		const node = doc.createNode('sphere').setMesh(doc.createMesh('sphere').addPrimitive(prim));
		doc.getRoot().setDefaultScene(doc.createScene().addChild(node));
		// 3-keyframe rotation — animation survival is an e2e assertion, not hope.
		const input = doc
			.createAccessor()
			.setType('SCALAR')
			.setArray(new Float32Array([0, 1, 2]))
			.setBuffer(buffer);
		const output = doc
			.createAccessor()
			.setType('VEC4')
			.setArray(new Float32Array([0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2, 0, 1, 0, 0]))
			.setBuffer(buffer);
		const sampler = doc
			.createAnimationSampler()
			.setInput(input)
			.setOutput(output)
			.setInterpolation('LINEAR');
		doc
			.createAnimation('spin')
			.addSampler(sampler)
			.addChannel(
				doc
					.createAnimationChannel()
					.setTargetNode(node)
					.setTargetPath('rotation')
					.setSampler(sampler)
			);
		return { triangles: indices.length / 3, vertices: positions.length / 3 };
	}

	const textureJpeg = new Uint8Array(
		await sharp(await photoScene(2048, 1024, { seed: 110 }))
			.jpeg({ quality: 92 })
			.toBuffer()
	);
	const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
		'draco3d.encoder': await draco3d.createEncoderModule({}),
		'draco3d.decoder': await draco3d.createDecoderModule({})
	});

	const plain = new Document();
	const counts = buildSphere(plain, { withTexture: textureJpeg });
	await write('sample.glb', Buffer.from(await io.writeBinary(plain)));
	manifest['sample.glb'] = {
		triangles: counts.triangles,
		vertices: counts.vertices,
		texture: { width: 2048, height: 1024, bytes: textureJpeg.length },
		animations: 1
	};

	// Already-draco input (MD-09): same sphere, compressed at generation time.
	const compressed = new Document();
	buildSphere(compressed, { withTexture: textureJpeg });
	await compressed.transform(draco());
	await write('sample-draco.glb', Buffer.from(await io.writeBinary(compressed)));
	manifest['sample-draco.glb'] = { triangles: counts.triangles };

	// Texture-less draco sphere (MD-06): with compression None the decoded,
	// merely-quantized geometry is deterministically BIGGER than its draco
	// source and no texture win can mask it → whole-file keep-original fires.
	const notex = new Document();
	buildSphere(notex, { withTexture: null });
	await notex.transform(draco());
	await write('sample-draco-notex.glb', Buffer.from(await io.writeBinary(notex)));
	manifest['sample-draco-notex.glb'] = {};

	// Morph-target sphere (MD-10): one blend-shape target on the primitive —
	// simplify must skip wholesale and say so in the row warning.
	const morph = new Document();
	const morphCounts = buildSphere(morph, { withTexture: null });
	{
		const prim = morph.getRoot().listMeshes()[0].listPrimitives()[0];
		const base = prim.getAttribute('POSITION').getArray();
		// Spec-correct displacement deltas: puff the sphere out by 25 %.
		const deltas = Float32Array.from(base, (v) => v * 0.25);
		prim.addTarget(
			morph
				.createPrimitiveTarget('puff')
				.setAttribute(
					'POSITION',
					morph
						.createAccessor()
						.setType('VEC3')
						.setArray(deltas)
						.setBuffer(morph.getRoot().listBuffers()[0])
				)
		);
		morph.getRoot().listMeshes()[0].setWeights([0]);
	}
	await write('sample-morph.glb', Buffer.from(await io.writeBinary(morph)));
	manifest['sample-morph.glb'] = { triangles: morphCounts.triangles };

	// External-reference .gltf (MD-07): scene.bin deliberately does not exist.
	const externalGltf = JSON.stringify({
		asset: { version: '2.0' },
		scenes: [{ nodes: [0] }],
		nodes: [{ mesh: 0 }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
		accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
		bufferViews: [{ buffer: 0, byteLength: 36 }],
		buffers: [{ uri: 'scene.bin', byteLength: 36 }]
	});
	writeFileSync(join(OUT, 'sample-external.gltf'), externalGltf);
	manifest['sample-external.gltf'] = {};
}

function generateSubtitles() {
	// CRLF + BOM on the SRT: the messy real-world shape parsers must survive.
	const srt =
		'﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nThe quick brown fox\r\n\r\n' +
		'2\r\n00:00:04,000 --> 00:00:06,200\r\njumps over\r\nthe lazy dog\r\n\r\n' +
		'3\r\n00:01:02,750 --> 00:01:05,000\r\n<i>Emphasis survives</i>\r\n';
	const vtt =
		'WEBVTT - sample track\n\n' +
		'NOTE\nThis block must vanish on conversion.\n\n' +
		'STYLE\n::cue { color: gold }\n\n' +
		'intro\n00:01.000 --> 00:03.500 position:10% align:left\nThe quick <c.gold>brown</c> fox\n\n' +
		'00:00:04.000 --> 00:00:06.200\n<v Narrator>jumps over the lazy dog</v>\n';
	const ass =
		'[Script Info]\nTitle: Sample\nScriptType: v4.00+\n\n' +
		'[V4+ Styles]\nFormat: Name, Fontname, Fontsize\nStyle: Default,Arial,20\n\n' +
		'[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
		'Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\i1}The quick{\\i0} brown fox\n' +
		'Dialogue: 0,0:00:04.00,0:00:06.20,Default,,0,0,0,,jumps over\\Nthe lazy dog, twice\n';
	writeFileSync(join(OUT, 'sample.srt'), srt);
	writeFileSync(join(OUT, 'sample.vtt'), vtt);
	writeFileSync(join(OUT, 'sample.ass'), ass);
	manifest['sample.srt'] = { cues: 3 };
	manifest['sample.vtt'] = { cues: 2 };
	manifest['sample.ass'] = { cues: 2 };
}

// --------------------------------------------------------------------- main

const t0 = Date.now();
console.log(`generating fixtures → ${OUT}`);
await generateImages();
console.log('  images ✓');
await generateAnimations();
console.log('  animations ✓');
const heicAvailable = await generateHeic();
console.log('  heic ✓');
generateSvgs();
console.log('  svgs ✓');
await generatePdfs();

// scan-text.pdf — an image-only PDF (rasterized page, NO text layer): the
// OCR e2e must prove recognition ADDS text, so the input can't carry any.
{
	const png = readFileSync(join(OUT, 'graphic-bmp-ref.png'));
	const doc = await PDFDocument.create();
	const img = await doc.embedPng(png);
	const w = img.width * 0.6;
	const h = img.height * 0.6;
	const page = doc.addPage([w, h]);
	page.drawImage(img, { x: 0, y: 0, width: w, height: h });
	await write('scan-text.pdf', Buffer.from(await doc.save()));
	manifest['scan-text.pdf'] = { pages: 1 };
}

// scan-text-rot90.pdf — the same scan stored the way ADF scanners store
// landscape pages: image drawn 90° CCW into a portrait page + /Rotate 90.
// Viewers (and pdf.js renders) show it upright; the raw MediaBox does not.
{
	const { degrees } = pdfLib;
	const png = readFileSync(join(OUT, 'graphic-bmp-ref.png'));
	const doc = await PDFDocument.create();
	const img = await doc.embedPng(png);
	const w = img.width * 0.6;
	const h = img.height * 0.6;
	const page = doc.addPage([h, w]); // portrait MediaBox
	// rotate 90° CCW around (x, y): the w×h image lands in x-h..x, y..y+w.
	page.drawImage(img, { x: h, y: 0, width: w, height: h, rotate: degrees(90) });
	page.setRotation(degrees(90));
	await write('scan-text-rot90.pdf', Buffer.from(await doc.save()));
	manifest['scan-text-rot90.pdf'] = { pages: 1, rotate: 90 };
}

// scan-text-locked.pdf — the SAME scan, owner-locked (empty user password,
// AES-256): opens fine in every viewer/pdf.js, but pdf-lib cannot decrypt it,
// so tools built on pdf-lib must refuse it up front instead of corrupting it.
{
	const { createRequire } = await import('node:module');
	const require = createRequire(import.meta.url);
	const qpdfFactory = require('@neslinesli93/qpdf-wasm');
	const qpdf = await qpdfFactory({
		locateFile: () => require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'),
		print: () => {},
		printErr: () => {}
	});
	qpdf.FS.writeFile('/in.pdf', readFileSync(join(OUT, 'scan-text.pdf')));
	const exit = qpdf.callMain(['--encrypt', '', 'owner-secret', '256', '--', '/in.pdf', '/out.pdf']);
	if (exit !== 0) throw new Error(`qpdf --encrypt failed (exit ${exit})`);
	await write('scan-text-locked.pdf', Buffer.from(qpdf.FS.readFile('/out.pdf')));
	manifest['scan-text-locked.pdf'] = { pages: 1, ownerLocked: true };
}

await generateAudio();

await generateBmpTiff();

await generateRaw();

await generateColorAndGiants();
console.log('  color + giants ✓');

await generateZip();
console.log('  pdfs ✓');
await generateArchives();
console.log('  archives ✓');
await generateExifFixtures();
console.log('  exif ✓');
const fontWoff2Available = await generateFonts();
console.log('  fonts ✓');
generateErrorFiles();
console.log('  error files ✓');
generateSubtitles();
console.log('  subtitles ✓');
await generateEbooks();
console.log('  ebooks ✓');
await generateModels();
console.log('  models ✓');
await generateData();
console.log('  data ✓');

writeFileSync(
	MANIFEST,
	JSON.stringify(
		{
			genHash: GEN_HASH,
			generatedWith: `sharp ${sharp.versions?.sharp ?? '?'}`,
			heicAvailable,
			fontWoff2Available,
			files: manifest
		},
		null,
		'\t'
	)
);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s — manifest: ${MANIFEST}`);
