/**
 * Open Graph image generator — static/og.jpg + static/og/<slug>.jpg (1200×630).
 *
 * Copy mirrors the table in docs/og-images.md (the human-readable source of
 * truth); edit there, then re-run. Rendering is deterministic and offline:
 * Playwright Chromium renders an HTML template at deviceScaleFactor 2 (the
 * Plus Jakarta Sans + Geist Mono variable fonts are embedded as data:
 * URLs — file:// fonts are CORS-blocked from setContent's about:blank origin)
 * and sharp downscales the screenshot to a 1200×630 JPEG.
 *
 * Design mirrors the app's nameplate-on-canvas hero: paper-grain canvas
 * (the same feTurbulence mask as layout.css's .canvas-grain), display
 * headline, and Geist Mono uppercase chips — monochrome throughout, like
 * the site (the layout.css tokens, light scheme).
 *
 * Usage: pnpm og   (node scripts/generate-og.mjs)
 */
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontDataUrl = (path) =>
	`data:font/woff2;base64,${readFileSync(join(ROOT, 'node_modules', path)).toString('base64')}`;
const sansUrl = fontDataUrl(
	'@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2'
);
const monoUrl = fontDataUrl(
	'@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2'
);

// [file, headline, subline] — keep in sync with docs/og-images.md.
const PAGES = [
	['og.jpg', 'Compress anything.', 'Images, video, audio & PDFs — private, in your browser.'],
	[
		'og/compress-pdf.jpg',
		'Compress PDFs.',
		'Hit 2 MB exactly — compressed in your browser. Never uploaded.'
	],
	[
		'og/compress-video.jpg',
		'Compress video.',
		'MP4 & WebM under any size limit — encoded on your device.'
	],
	['og/compress-jpg.jpg', 'Compress JPGs.', 'Quality sliders, target sizes, batches — all local.'],
	['og/compress-png.jpg', 'Compress PNGs.', 'Lossless or tiny — your pixels never leave.'],
	['og/compress-webp.jpg', 'Compress WebP.', 'Still or animated — re-encoded on your device.'],
	['og/compress-gif.jpg', 'Compress GIFs.', 'Keep the animation, lose the megabytes.'],
	['og/compress-heic.jpg', 'Compress HEIC.', 'iPhone photos, shrunk locally.'],
	['og/compress-svg.jpg', 'Compress SVGs.', 'Minified locally — your artwork stays yours.'],
	['og/remove-exif.jpg', 'Remove EXIF.', 'See what your photos reveal — then wipe it, locally.'],
	['og/heic-to-jpg.jpg', 'HEIC → JPG', 'iPhone photos that open anywhere. Converted locally.'],
	['og/webp-to-jpg.jpg', 'WebP → JPG', 'For every app that still wants JPG. No uploads.'],
	['og/webp-to-png.jpg', 'WebP → PNG', 'Lossless, transparency intact — in your browser.'],
	['og/avif-to-jpg.jpg', 'AVIF → JPG', 'The newest format, made universal. Locally.'],
	['og/png-to-jpg.jpg', 'PNG → JPG', 'Photos 5–10× smaller. Flattened to white, never uploaded.'],
	['og/jpg-to-webp.jpg', 'JPG → WebP', '~30% smaller at the same quality.'],
	['og/png-to-webp.jpg', 'PNG → WebP', 'Smaller files, alpha preserved.'],
	['og/jpg-to-pdf.jpg', 'JPG → PDF', 'Photos into one PDF — built in your browser.'],
	['og/pdf-to-jpg.jpg', 'PDF → JPG', 'Every page becomes an image. Rendered locally.'],
	['og/mov-to-mp4.jpg', 'MOV → MP4', 'iPhone video that plays everywhere.'],
	['og/webm-to-mp4.jpg', 'WebM → MP4', 'For Apple devices, TVs and editors.'],
	['og/mkv-to-mp4.jpg', 'MKV → MP4', 'Universal playback, converted on-device.'],
	['og/mp4-to-webm.jpg', 'MP4 → WebM', 'Smaller video for the web. Converted locally.'],
	[
		'og/compress-audio.jpg',
		'Compress audio.',
		'MP3, FLAC, M4A, WAV & OGG — encoded on your device.'
	],
	['og/zip-files.jpg', 'Zip & Unzip.', 'Archives created and opened locally. No upload.'],
	['og/rar-to-zip.jpg', 'RAR → ZIP', 'Opens everywhere — converted on your device.'],
	['og/7z-to-zip.jpg', '7Z → ZIP', 'Universal archives, repacked locally.'],
	['og/zip-to-7z.jpg', 'ZIP → 7Z', 'Same files, tighter compression.'],
	['og/tar-gz-to-zip.jpg', 'TAR.GZ → ZIP', 'Unix tarballs, Windows-friendly.'],
	['og/iso-to-zip.jpg', 'ISO → ZIP', 'Disc image files, no mounting.'],
	['og/zip-to-tar-gz.jpg', 'ZIP → TAR.GZ', 'For servers and pipelines. Local.'],
	['og/create-7z.jpg', 'Create 7Z.', 'Strongest compression, AES-256. On-device.'],
	['og/protect-zip.jpg', 'Protect ZIP.', 'AES-256 locked ZIPs. Keys stay local.'],
	['og/protect-7z.jpg', 'Protect 7Z.', 'AES-256, hidden file names. On-device.'],
	['og/create-tar.jpg', 'Create TAR.', 'The unix bundle — built in your browser.'],
	['og/create-tar-gz.jpg', 'Create TAR.GZ.', 'Tarballs the unix way. Nothing uploaded.'],
	['og/gzip-files.jpg', 'Gzip files.', 'Every file to its own .gz — locally.'],
	['og/bzip2-files.jpg', 'Bzip2 files.', 'Smaller than gzip, right in your browser.'],
	['og/xz-files.jpg', 'XZ files.', 'The hardest squeeze — on your device.'],
	['og/extract-rar.jpg', 'Extract RAR.', 'No WinRAR, no upload — opened in-browser.'],
	['og/extract-7z.jpg', 'Extract 7Z.', 'Unpacked locally, passwords included.'],
	['og/extract-tar-gz.jpg', 'Extract TAR.GZ.', 'Both layers unwrapped automatically.'],
	['og/extract-gz.jpg', 'Extract GZ.', 'Gunzip in the browser. Nothing uploaded.'],
	['og/extract-iso.jpg', 'Extract ISO.', 'Disc images opened — never mounted.'],
	['og/extract-cab.jpg', 'Extract CAB.', 'Windows cabinets, opened locally.'],
	['og/extract-deb.jpg', 'Extract DEB.', 'Debian payloads, unpacked in-browser.'],
	['og/extract-rpm.jpg', 'Extract RPM.', 'rpm2cpio, retired. Runs on your device.'],
	['og/extract-cpio.jpg', 'Extract CPIO.', 'initramfs & rpm payloads, opened locally.'],
	['og/extract-lha.jpg', 'Extract LHA.', 'Retro LZH archives, opened in-browser.'],
	['og/extract-arj.jpg', 'Extract ARJ.', 'DOS-era archives, opened on your device.'],
	['og/unlock-pdf.jpg', 'Unlock PDFs.', 'Your password never leaves your device.'],
	['og/protect-pdf.jpg', 'Protect PDFs.', 'Set a password — encrypted on your device.'],
	['og/video-to-gif.jpg', 'Video → GIF', 'Clips become loops — right in your browser.'],
	['og/gif-to-mp4.jpg', 'GIF → MP4', 'Same loop, a tenth of the bytes.'],
	['og/mp4-to-mp3.jpg', 'MP4 → MP3', 'Pull the audio out of any video. Locally.'],
	['og/wav-to-mp3.jpg', 'WAV → MP3', 'Huge recordings, made shareable.'],
	['og/bmp-to-jpg.jpg', 'BMP → JPG', 'Raw bitmaps, 10–20× smaller.'],
	['og/tiff-to-jpg.jpg', 'TIFF → JPG', 'Scans that fit in an email. Converted locally.'],
	['og/png-to-ico.jpg', 'PNG → ICO', 'A multi-size favicon in one click.'],
	['og/merge-pdf.jpg', 'Merge PDFs.', 'Many documents into one — reordered, never uploaded.'],
	['og/split-pdf.jpg', 'Split PDFs.', 'Extract or remove pages with ranges like 1-3,7. Local.'],
	['og/extract-pages-from-pdf.jpg', 'Extract pages.', 'Only the PDF pages you list. On-device.'],
	['og/delete-pages-from-pdf.jpg', 'Delete pages.', 'Listed PDF pages removed. On-device.'],
	['og/compress-mp4.jpg', 'Compress MP4.', 'Hit 10 MB for Discord — encoded on your device.'],
	['og/compress-mov.jpg', 'Compress MOV.', 'QuickTime in, QuickTime out — shrunk on your device.'],
	['og/resize-image.jpg', 'Resize images.', 'Cap the longest side — aspect kept, resized locally.'],
	['og/png-to-pdf.jpg', 'PNG → PDF', 'Screenshots into one document. Assembled locally.'],
	['og/mp4-to-gif.jpg', 'MP4 → GIF', 'Looping GIFs, no watermark — made in your browser.'],
	['og/pdf-to-png.jpg', 'PDF → PNG', 'Lossless page renders — made in your browser.'],
	['og/heic-to-png.jpg', 'HEIC → PNG', 'iPhone photos, converted lossless. Locally.'],
	['og/m4a-to-mp3.jpg', 'M4A → MP3', 'Voice memos that play anywhere. No upload.'],
	['og/flac-to-mp3.jpg', 'FLAC → MP3', 'Lossless archives, played anywhere. Locally.'],
	['og/wav-to-flac.jpg', 'WAV → FLAC', 'Same audio, half the bytes — lossless.'],
	['og/opus-to-mp3.jpg', 'OPUS → MP3', 'WhatsApp voice notes, made universal.'],
	['og/ogg-to-mp3.jpg', 'OGG → MP3', 'Open audio for every player. No uploads.'],
	['og/aac-to-mp3.jpg', 'AAC → MP3', 'Raw AAC streams, playable everywhere.'],
	['og/mp3-to-wav.jpg', 'MP3 → WAV', 'Clean PCM for editors and samplers.'],
	['og/mp4-to-wav.jpg', 'MP4 → WAV', 'The audio track, ready for any editor.'],
	[
		'og/compress-image.jpg',
		'Compress any image.',
		'JPG, PNG, WebP, HEIC & more — smaller on your device.'
	],
	[
		'og/compress-jpg-to-100kb.jpg',
		'JPG under 100 KB.',
		'Type the cap — the best quality that fits, locally.'
	],
	['og/jpg-to-ico.jpg', 'JPG → ICO', 'Any logo or photo becomes a favicon. Locally.'],
	['og/svg-to-png.jpg', 'SVG → PNG', 'Vector art rendered crisp at any size. Locally.'],
	['og/svg-to-ico.jpg', 'SVG → ICO', 'Vector-sharp favicons — made in your browser.'],
	[
		'og/font-converter.jpg',
		'Convert fonts.',
		'TTF, OTF, WOFF & WOFF2 — lossless, in your browser.'
	],
	['og/ttf-to-woff2.jpg', 'TTF → WOFF2', 'Web-ready fonts at half the size. Locally.'],
	['og/ttf-to-woff.jpg', 'TTF → WOFF', 'Legacy web fonts, byte-exact. No uploads.'],
	['og/otf-to-woff2.jpg', 'OTF → WOFF2', 'Web-ready fonts, outlines untouched. Locally.'],
	['og/otf-to-woff.jpg', 'OTF → WOFF', 'Legacy web wrapper, byte-exact. No uploads.'],
	['og/woff-to-ttf.jpg', 'WOFF → TTF', 'Web fonts unwrapped to installable TTF. Locally.'],
	['og/woff-to-otf.jpg', 'WOFF → OTF', 'Web fonts unwrapped to desktop OTF. Locally.'],
	['og/woff-to-woff2.jpg', 'WOFF → WOFF2', 'Same font, about 30% smaller. In your browser.'],
	['og/woff2-to-ttf.jpg', 'WOFF2 → TTF', 'Web fonts decoded to installable TTF. Locally.'],
	['og/woff2-to-otf.jpg', 'WOFF2 → OTF', 'Web fonts decoded to desktop OTF. Locally.'],
	['og/woff2-to-woff.jpg', 'WOFF2 → WOFF', 'The fallback old browsers still ask for. Local.'],
	['og/ttf-to-eot.jpg', 'TTF → EOT', 'For Internet Explorer 6–8 holdouts. Locally.'],
	['og/eot-to-ttf.jpg', 'EOT → TTF', 'Fonts rescued from legacy EOT files. Locally.'],
	['og/subset-font.jpg', 'Subset fonts.', 'Keep only the glyphs you use — subset locally.'],
	[
		'og/variable-font-to-static.jpg',
		'Variable → static',
		'Pin the axes, ship one static font. Locally.'
	],
	[
		'og/compress-avif.jpg',
		'Compress AVIF.',
		'The tightest format, tuned tighter — on your device.'
	],
	['og/jpg-to-avif.jpg', 'JPG → AVIF', 'Up to half the bytes, same picture. Local.'],
	['og/png-to-avif.jpg', 'PNG → AVIF', 'Graphics shrink, transparency stays.'],
	['og/webp-to-avif.jpg', 'WebP → AVIF', 'One generation newer, one size smaller.'],
	['og/avif-to-png.jpg', 'AVIF → PNG', 'Lossless pixels for every editor. Local.'],
	['og/heic-to-avif.jpg', 'HEIC → AVIF', 'iPhone photos, web-ready. Converted locally.'],
	['og/gif-to-webp.jpg', 'GIF → WebP', 'Animation kept, 50–70% smaller. Locally.'],
	['og/heic-to-webp.jpg', 'HEIC → WebP', 'iPhone photos the whole web can show. Local.'],
	['og/tiff-to-png.jpg', 'TIFF → PNG', 'Lossless scans for every editor. Local.'],
	['og/bmp-to-png.jpg', 'BMP → PNG', 'Same pixels, a fraction of the bytes.'],
	['og/webm-to-mp3.jpg', 'WebM → MP3', 'The soundtrack of any screen recording. Local.'],
	['og/mov-to-mp3.jpg', 'MOV → MP3', 'iPhone video audio, extracted locally.'],
	['og/mp3-to-m4a.jpg', 'MP3 → M4A', 'Apple-native audio, converted on-device.'],
	['og/wav-to-m4a.jpg', 'WAV → M4A', 'A tenth of the size, nothing you can hear.'],
	['og/mp3-to-ogg.jpg', 'MP3 → OGG', 'Opus for games and the web. No uploads.'],
	['og/wav-to-opus.jpg', 'WAV → Opus', 'The efficiency king, encoded locally.'],
	['og/create-tar-bz2.jpg', 'Create TAR.BZ2.', 'Tighter than gzip — built in your browser.'],
	['og/create-tar-xz.jpg', 'Create TAR.XZ.', 'The hardest-squeezing tarball. On-device.'],
	['og/extract-z.jpg', 'Extract .Z.', 'Unix compress, opened without unix.'],
	[
		'og/remove-audio-from-video.jpg',
		'Remove audio.',
		'The picture stays, the sound goes. Locally.'
	],
	['og/png-to-svg.jpg', 'PNG → SVG', 'Pixels become paths — vectorized locally.'],
	['og/jpg-to-svg.jpg', 'JPG → SVG', 'Logos traced into real vectors. On-device.'],
	['og/raw-to-jpg.jpg', 'RAW → JPG', 'CR2, NEF, ARW & DNG — developed locally.'],
	['og/cr2-to-jpg.jpg', 'CR2 → JPG', 'Canon RAW, developed in your browser.'],
	['og/nef-to-jpg.jpg', 'NEF → JPG', 'Nikon RAW, developed in your browser.'],
	['og/arw-to-jpg.jpg', 'ARW → JPG', 'Sony RAW, developed in your browser.'],
	['og/dng-to-jpg.jpg', 'DNG → JPG', 'Digital negatives, developed on-device.'],
	['og/image-to-text.jpg', 'Image → Text.', 'OCR in 8 languages — read on your device.'],
	['og/ocr-pdf.jpg', 'OCR PDF.', 'Scans become searchable. Recognized locally.'],
	['og/rotate-pdf.jpg', 'Rotate PDF.', 'Sideways scans, turned upright. Locally.'],
	['og/watermark-pdf.jpg', 'Watermark PDF.', 'Your stamp on every page — added locally.'],
	['og/pdf-page-numbers.jpg', 'Number pages.', 'Page / total on every page. On-device.'],
	['og/pdf-to-text.jpg', 'PDF → Text', 'All the words, extracted in your browser.'],
	['og/grayscale-pdf.jpg', 'Grayscale PDF.', 'Print-ready mono, converted locally.'],
	['og/pdf-to-pdfa.jpg', 'PDF → PDF/A', 'ISO archival grade, made on your device.'],
	['og/srt-to-vtt.jpg', 'SRT → VTT', 'Web-ready captions, converted on-device.'],
	['og/vtt-to-srt.jpg', 'VTT → SRT', 'Captions every player accepts. Locally.'],
	['og/ass-to-srt.jpg', 'ASS → SRT', 'Styling out, dialogue kept. On-device.'],
	['og/jxl-to-jpg.jpg', 'JXL → JPG', 'JPEG XL opened everywhere. Decoded locally.'],
	['og/jpg-to-jxl.jpg', 'JPG → JXL', 'JPEG XL: smaller archives, made on-device.'],
	['og/compress-jxl.jpg', 'Compress JXL.', 'JPEG XL re-encoded on your device.'],
	['og/psd-to-jpg.jpg', 'PSD → JPG', 'Photoshop files opened as JPG. Locally.'],
	['og/psd-to-png.jpg', 'PSD → PNG', 'Flattened lossless, transparency kept.'],
	['og/compress-epub.jpg', 'Compress EPUB.', 'Lighter e-books, text untouched. Local.'],
	['og/compress-cbz.jpg', 'Compress CBZ.', 'Comics slimmed page by page. On-device.'],
	['og/cbr-to-cbz.jpg', 'CBR → CBZ', 'RAR comics repacked. Pages bit-exact.'],
	['og/epub-to-txt.jpg', 'EPUB → TXT', 'A whole book as plain text. On-device.'],
	['og/cbz-to-pdf.jpg', 'CBZ → PDF', 'Comic pages embedded lossless. Local.'],
	['og/cbr-to-pdf.jpg', 'CBR → PDF', 'RAR comics as PDFs. Pages untouched.'],
	['og/compress-glb.jpg', 'Compress GLB.', '3D models crushed with Draco. On-device.'],
	['og/csv-to-xlsx.jpg', 'CSV → XLSX', 'A real Excel workbook, made on-device.'],
	['og/xlsx-to-csv.jpg', 'XLSX → CSV', 'Clean CSV out of Excel. Values, locally.'],
	['og/json-to-yaml.jpg', 'JSON → YAML', 'Readable configs, rewritten on-device.'],
	['og/yaml-to-json.jpg', 'YAML → JSON', 'Anchors resolved, JSON out. Locally.'],
	['og/image-tools.jpg', 'Image tools.', 'Compress, convert & resize — every image tool, local.'],
	[
		'og/video-audio-tools.jpg',
		'Video & audio tools.',
		'Shrink, convert, extract — on your own hardware.'
	],
	['og/pdf-tools.jpg', 'PDF tools.', 'Compress, merge, split, protect — never uploaded.'],
	['og/font-tools.jpg', 'Font tools.', 'Convert, subset, instance — web-ready, on-device.'],
	[
		'og/archive-tools.jpg',
		'Archive & data tools.',
		'Zip, extract, convert — plus ebooks, models & data.'
	],
	[
		'og/about.jpg',
		'About Compress Pro.',
		'Free, open source — and your files never leave your device.'
	],
	['og/privacy.jpg', 'Privacy.', 'No uploads, no cookies, no analytics — nothing to leak.']
];

// favicon.svg glyph with the light-scheme colors hardcoded (no media queries here).
const ICON = `<svg width="72" height="72" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect fill="#0b0c0e" width="32" height="32" rx="8"/><g fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="butt" stroke-linejoin="miter"><path d="M11 6.5l5 5 5-5"/><path d="M7 16h18"/><path d="M11 25.5l5-5 5 5"/></g></svg>`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CHIPS = ['compress-pro.com', 'free', 'private', 'no ads'];

const html = (headline, subline) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face {
	font-family: 'PJS';
	src: url('${sansUrl}') format('woff2-variations');
	font-weight: 200 800;
}
@font-face {
	font-family: 'JBM';
	src: url('${monoUrl}') format('woff2-variations');
	font-weight: 100 800;
}
* { margin: 0; box-sizing: border-box; }
body {
	position: relative;
	width: 1200px; height: 630px; padding: 72px 80px;
	display: flex; flex-direction: column;
	background: #f1f2f4; color: #0b0c0e;
	font-family: 'PJS', system-ui, sans-serif;
	-webkit-font-smoothing: antialiased;
}
/* Paper grain — .canvas-grain::before from layout.css, light-scheme values
   (--app-ink #0b0c0e, --app-grain-alpha 0.05) baked in. mask-size is 2× the
   site's 240px: at deviceScaleFactor 2 the noise texel would be 1px in the
   final 1200×630 image and mozjpeg quantizes that away entirely (flat gray);
   at 480px the texel lands at 2px and survives — same grain a retina display
   shows. */
body::before {
	content: '';
	position: absolute;
	inset: 0;
	z-index: -1;
	background: #0b0c0e;
	opacity: 0.05;
	mask-image: url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20width%3D'240'%20height%3D'240'%3E%3Cfilter%20id%3D'n'%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'0.8'%20numOctaves%3D'3'%20stitchTiles%3D'stitch'%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D'240'%20height%3D'240'%20filter%3D'url(%23n)'%2F%3E%3C%2Fsvg%3E");
	mask-size: 480px 480px;
}
.brand { display: flex; align-items: center; gap: 20px; font-size: 38px; font-weight: 600; letter-spacing: -0.02em; }
main { flex: 1; display: flex; flex-direction: column; justify-content: center; }
h1 { font-size: 96px; font-weight: 600; letter-spacing: -0.03em; line-height: 1.06; }
p { margin-top: 26px; font-size: 34px; font-weight: 500; line-height: 1.35; color: #5d636b; max-width: 980px; }
.chips { display: flex; gap: 14px; }
.chip {
	padding: 12px 26px; border-radius: 999px;
	background: #ffffff; box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
	font-family: 'JBM', monospace; font-size: 21px; font-weight: 500;
	letter-spacing: 0.1em; text-transform: uppercase; color: #5d636b;
}
</style></head>
<body>
	<div class="brand">${ICON}Compress Pro</div>
	<main><h1>${esc(headline)}</h1><p>${esc(subline)}</p></main>
	<div class="chips">${CHIPS.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
</body></html>`;

mkdirSync(join(ROOT, 'static', 'og'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: 1200, height: 630 },
	deviceScaleFactor: 2 // render @2x, downscale below → crisp text
});
for (const [file, headline, subline] of PAGES) {
	await page.setContent(html(headline, subline));
	await page.evaluate(() => document.fonts.ready);
	const png = await page.screenshot({ type: 'png' });
	const out = join(ROOT, 'static', file);
	// q88, not 82: the paper grain sits right at mozjpeg's quantization
	// threshold — at 82 it flattens to plain gray.
	await sharp(png).resize(1200, 630).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
	console.log(`${file}  ${(statSync(out).size / 1024).toFixed(0)} kB`);
}
await browser.close();
