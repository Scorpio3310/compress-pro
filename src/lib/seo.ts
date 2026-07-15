import type {
	ArchiveOutputFormat,
	AudioConversionSettings,
	DemoKind,
	FileFormat,
	FontFormat,
	ImageFormat
} from '$lib/types';
import * as publicEnv from '$env/static/public';

// NOTE: this module is imported by the `tool` param matcher (src/params/tool.ts),
// which runs on the server, the client, and at prerender time — keep it free of
// side effects and browser globals ($env/static/public is inlined at build).

// Production origin. Override via PUBLIC_SITE_URL in .env only when the
// canonical domain changes — dev/preview builds keep the default so any
// non-production host serves a Disallow robots.txt (see routes/robots.txt).
// Wildcard import + cast: a named import fails the build when the var is unset.
const { PUBLIC_SITE_URL } = publicEnv as { PUBLIC_SITE_URL?: string };
export const SITE_URL = PUBLIC_SITE_URL ?? 'https://compress-pro.com';
export const SITE_NAME = 'Compress Pro';

export interface SeoFaq {
	q: string;
	a: string;
}

export interface SeoEntry {
	/** null for the homepage. */
	format: FileFormat | null;
	/** URL path — '/' or '/compress-<format>'. Also the canonical path. */
	path: string;
	/** Tab label. */
	label: string;
	title: string;
	description: string;
	h1: string;
	tagline: string;
	/** Extra JSON-LD featureList line, e.g. "Convert WebP to JPG". */
	feature?: string;
	/** "How it works" copy override — exactly three cards; FormatInfo falls
	 *  back to the generic compress-tool trio when absent. */
	steps?: [string, string, string];
	/** Curated cross-links to related tool pages (paths from FORMATS/CONVERTERS/TOOLS). */
	related?: string[];
	/** Per-page OG image path under static/ — falls back to /og.jpg. */
	ogImage?: string;
	/** Renders the static before/after demo (DemoCompare) below the intro.
	 *  Each kind's assets are real output of ONE pipeline, so a page may only
	 *  carry the kind its own pipeline produced — seo.test.ts pins the
	 *  kind↔page map, `pnpm demo-assets` regenerates assets + manifest. */
	demo?: DemoKind;
}

export interface SeoGuideSection {
	heading: string;
	paragraphs?: string[];
	table?: { columns: string[]; rows: string[][] };
}

/** The lazy-loaded long-form copy of a page — everything below the tool that
 *  routing, tabs and the <head> don't need. Lives in src/lib/seo-body/ as
 *  per-tool-group chunks so the always-loaded index stays light. */
export interface SeoBody {
	intro: string;
	faq: SeoFaq[];
	/** Longer crawlable guide sections, rendered between How-it-works and FAQ. */
	guide?: SeoGuideSection[];
}

/** Index entry merged with its body — what markdown.ts and the prerender
 *  routes consume (assembled by seo-full.server.ts / seoBodyFor). */
export type FullSeoEntry = SeoEntry & SeoBody;

/** What a converter landing page preconfigures when the user arrives. */
export type ConverterPreset =
	| {
			// Positive list: new FileFormat members must opt in, not leak in.
			kind: 'image';
			tab: 'jpg' | 'png' | 'webp' | 'gif' | 'heic';
			to: ImageFormat | 'ico';
			quality?: number;
			// Target-size landing pages ("compress JPG to 100 KB") arrive with
			// the mode flipped and the cap typed in.
			mode?: 'target';
			targetKb?: number;
	  }
	| { kind: 'pdf-from-images' }
	| { kind: 'pdf-to-images'; imageFormat: 'jpg' | 'png' }
	// SVG tab raster export — 'svg' output itself is the tab default.
	| { kind: 'svg'; to: 'png' | 'ico' }
	| { kind: 'video'; container: 'mp4' | 'webm' | 'mov' | 'gif' }
	| { kind: 'audio'; output: AudioConversionSettings['outputFormat'] }
	| { kind: 'font'; to: FontFormat }
	// Font-tab tools: 'subset' arrives on the Subset op with its defaults;
	// 'instance' additionally flips to a static-instance, keep-all-glyphs run.
	| { kind: 'font-op'; op: 'subset' | 'instance' }
	| { kind: 'pdf-op'; op: 'unlock' | 'protect' | 'merge' | 'pages' }
	// Longest-side cap across every image tab — the page's whole point, so
	// drops that re-route to their native tab (png → png) land configured.
	| { kind: 'resize'; maxDimension: number }
	// Universal image intake (/compress-image) — hosts on an image tab and
	// preconfigures nothing; the tab defaults (Auto format) are the point.
	| { kind: 'image-any' }
	// Archive tab: create-X, extract-X and X→Y converter pages all ride the
	// same tab; `to` targets create/convert (extract ignores it).
	| { kind: 'archive'; op: 'create' | 'extract' | 'convert'; to?: ArchiveOutputFormat };

export interface ConverterEntry extends SeoEntry {
	/** Hosting tab — drives activeTab exactly like FORMATS entries. */
	format: FileFormat;
	feature: string;
	/** Applied by the page on navigation to this slug. */
	preset: ConverterPreset;
	/** FileUpload picker override (e.g. AVIF page on the jpg tab). */
	accept?: string;
	dropSubject?: string;
	dropHint?: string;
}

// The generic How-it-works trio talks quality/target-size — nonsense for
// fonts, so every font page overrides it (seo.test.ts enforces this).
const FONT_STEPS: [string, string, string] = [
	'Drop TTF, OTF, WOFF, WOFF2 or EOT files anywhere on the page — or click to browse.',
	'Pick the output format — the font tables are repackaged losslessly, never re-drawn.',
	'Convert, then download each font on its own or the whole batch as a ZIP.'
];

export const FORMATS: (SeoEntry & { format: FileFormat })[] = [
	{
		format: 'jpg',
		path: '/compress-jpg',
		ogImage: '/og/compress-jpg.jpg',
		demo: 'photo',
		label: 'JPG',
		title: 'Compress JPG (JPEG) Online — Private, No Upload | Compress Pro',
		description:
			'Shrink JPG (JPEG) photos right in your browser. Set a quality or a target size like 500 KB. No uploads — files stay on your device. Free & private.',
		h1: 'Compress JPG images.',
		tagline: 'Smaller JPG photos in your browser — nothing is uploaded.',
		related: ['/remove-exif', '/jpg-to-webp', '/jpg-to-pdf', '/compress-png']
	},
	{
		format: 'png',
		path: '/compress-png',
		ogImage: '/og/compress-png.jpg',
		demo: 'png',
		label: 'PNG',
		title: 'Compress PNG Online — Private, No Upload | Compress Pro',
		description:
			'Compress PNG images in your browser — fully lossless or with smart color reduction, resizing and target file size. No uploads, no accounts. Free and private.',
		h1: 'Compress PNG images.',
		tagline: 'Lossless or lossy — your PNGs never leave your browser.',
		related: ['/png-to-webp', '/png-to-jpg', '/compress-jpg', '/compress-svg']
	},
	{
		format: 'webp',
		path: '/compress-webp',
		ogImage: '/og/compress-webp.jpg',
		demo: 'webp',
		label: 'WebP',
		title: 'Compress WebP Online — Private, No Upload | Compress Pro',
		description:
			'Compress WebP images — even animated ones — right in your browser. Quality or target-size modes, resizing, JPG/PNG conversion. No uploads. Free and private.',
		h1: 'Compress WebP images.',
		tagline: 'Still or animated — re-encoded locally, never uploaded.',
		related: ['/webp-to-jpg', '/webp-to-png', '/compress-jpg', '/compress-gif']
	},
	{
		format: 'gif',
		path: '/compress-gif',
		ogImage: '/og/compress-gif.jpg',
		demo: 'gif',
		label: 'GIF',
		title: 'Compress GIF Online — Keep Animation, No Upload | Compress Pro',
		description:
			'Compress animated GIFs right in your browser. Keep the animation, resize, or hit a target size. No uploads — GIFs never leave your device. Free & private.',
		h1: 'Compress GIFs.',
		tagline: 'Shrink GIFs in your browser — they stay animated & local.',
		related: ['/compress-webp', '/compress-video']
	},
	{
		format: 'heic',
		path: '/compress-heic',
		ogImage: '/og/compress-heic.jpg',
		demo: 'heic',
		label: 'HEIC',
		title: 'Compress HEIC Photos — Private, No Upload | Compress Pro',
		description:
			'Compress iPhone HEIC photos in your browser — pick a quality or an exact target size and export as JPG, PNG, WebP or AVIF. No uploads. Free and private.',
		h1: 'Compress HEIC photos.',
		tagline: 'Shrink iPhone HEIC photos locally — nothing is uploaded.',
		related: ['/heic-to-jpg', '/compress-jpg', '/resize-image']
	},
	{
		format: 'svg',
		path: '/compress-svg',
		ogImage: '/og/compress-svg.jpg',
		demo: 'svg',
		label: 'SVG',
		title: 'Compress SVG Online — Private, No Upload | Compress Pro',
		description:
			'Minify SVG files right in your browser: strip metadata, comments and editor junk, round coordinates. No uploads — your artwork never leaves your device.',
		h1: 'Compress SVGs.',
		tagline: 'Smaller SVG files in your browser — nothing is uploaded.',
		related: ['/compress-png', '/svg-to-png', '/svg-to-ico']
	},
	{
		format: 'pdf',
		path: '/compress-pdf',
		ogImage: '/og/compress-pdf.jpg',
		label: 'PDF',
		demo: 'pdf',
		title: 'Compress PDF Online — No Upload, 100% Private | Compress Pro',
		description:
			'Reduce PDF file size right in your browser. Choose a preset or a target size like 2 MB. No uploads — documents never leave your device. Free & private.',
		h1: 'Compress PDFs.',
		tagline: 'Shrink PDFs in your browser — files are never uploaded.',
		related: ['/pdf-to-jpg', '/jpg-to-pdf', '/merge-pdf', '/zip-files']
	},
	{
		format: 'video',
		path: '/compress-video',
		ogImage: '/og/compress-video.jpg',
		demo: 'video',
		label: 'Video',
		title: 'Compress Video Online — Private, No Upload | Compress Pro',
		description:
			'Shrink MP4, MOV and WebM videos right in your browser. Hit a target size like 25 MB for email or Discord. No uploads — videos never leave your device.',
		h1: 'Compress videos.',
		tagline: 'MP4, MOV & WebM compressed on-device — nothing uploaded.',
		feature: 'Compress MP4, MOV and WebM video to a target size',
		related: ['/compress-mp4', '/mov-to-mp4', '/webm-to-mp4', '/mp4-to-webm']
	},
	{
		format: 'audio',
		path: '/compress-audio',
		ogImage: '/og/compress-audio.jpg',
		demo: 'audio',
		label: 'Audio',
		feature: 'Compress & Convert audio',
		title: 'Compress Audio Online — MP3, FLAC, M4A, WAV | Compress Pro',
		description:
			'Compress MP3 and convert audio between MP3, M4A, WAV, FLAC, OGG and OPUS in your browser. Extract audio from video too — private, free, never uploaded.',
		h1: 'Compress & Convert audio.',
		tagline: 'Shrink or convert audio locally — MP3, FLAC, OGG and more.',
		related: ['/mp4-to-mp3', '/flac-to-mp3', '/wav-to-mp3', '/compress-video']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/font-converter',
		ogImage: '/og/font-converter.jpg',
		demo: 'font',
		label: 'Fonts',
		feature: 'Convert fonts — TTF, OTF, WOFF & WOFF2',
		title: 'Font Converter — TTF, OTF, WOFF, WOFF2 Online | Compress Pro',
		description:
			'Convert fonts between TTF, OTF, WOFF and WOFF2 right in your browser. Lossless repackaging — glyphs, kerning and hinting survive. Free, nothing uploaded.',
		h1: 'Convert fonts.',
		tagline: 'TTF, OTF, WOFF & WOFF2 — converted right in your browser.',
		related: ['/ttf-to-woff2', '/woff2-to-ttf', '/subset-font']
	},
	{
		format: 'zip',
		path: '/zip-files',
		ogImage: '/og/zip-files.jpg',
		demo: 'archive',
		label: 'Archive',
		feature: 'Create & extract ZIP, 7Z, TAR & RAR archives',
		title: 'Create & Extract ZIP Files Online — Private | Compress Pro',
		description:
			'Create ZIP, 7Z or TAR archives from any files, or extract ZIP, RAR, 7Z, ISO and more — entirely in your browser. No upload, no size caps. Free & private.',
		h1: 'Zip & Unzip files.',
		tagline: 'Zip and unzip files locally — nothing ever gets uploaded.',
		related: ['/rar-to-zip', '/create-7z', '/extract-rar', '/compress-jpg']
	},
	{
		format: 'exif',
		path: '/remove-exif',
		ogImage: '/og/remove-exif.jpg',
		demo: 'exif',
		label: 'EXIF',
		title: 'Remove EXIF Data Online — Private, No Upload | Compress Pro',
		description:
			'See the GPS location, camera and dates hidden in your photos — and strip them in your browser. Lossless, pixels untouched, nothing uploaded. Free.',
		h1: 'Remove EXIF data.',
		tagline: 'GPS, camera & date wiped locally — pixels stay untouched.',
		feature: 'Remove EXIF metadata and GPS location from photos',
		related: ['/compress-jpg', '/compress-png', '/compress-webp']
	}
];

export const HOME: SeoEntry = {
	format: null,
	path: '/',
	label: 'Home',
	title: 'Compress Images, Video & PDFs — Private, Free | Compress Pro',
	description:
		'Compress JPG, PNG, WebP, GIF, HEIC, SVG, PDF, video & audio entirely in your browser. No uploads, no ads, no limits — files never leave your device. Free.',
	h1: 'Compress anything.',
	tagline: 'Images, video, audio & PDFs — compressed, never uploaded.'
};

// Converter landing pages — same route/component as the format tabs, but each
// URL preconfigures the tool (tab + output) and carries its own crawlable copy.
export const CONVERTERS: ConverterEntry[] = [
	{
		format: 'heic',
		path: '/heic-to-jpg',
		ogImage: '/og/heic-to-jpg.jpg',
		label: 'HEIC → JPG',
		feature: 'Convert HEIC to JPG',
		preset: { kind: 'image', tab: 'heic', to: 'jpg' },
		title: 'HEIC to JPG Converter — Private, In-Browser | Compress Pro',
		description:
			'Convert iPhone HEIC photos to JPG right in your browser — no uploads, no accounts. Batch-convert whole camera rolls, tune quality, download as a ZIP. Free.',
		h1: 'Convert HEIC to JPG.',
		tagline: 'iPhone HEIC to JPG in your browser — photos never leave.',
		related: ['/compress-heic', '/compress-jpg', '/jpg-to-pdf', '/heic-to-png']
	},
	{
		format: 'heic',
		path: '/heic-to-png',
		ogImage: '/og/heic-to-png.jpg',
		label: 'HEIC → PNG',
		feature: 'Convert HEIC to PNG',
		preset: { kind: 'image', tab: 'heic', to: 'png', quality: 100 },
		accept: 'image/heic,image/heif,.heic,.heif',
		dropSubject: 'HEIC files',
		dropHint: 'iPhone HEIC photos · decoded to PNG locally',
		title: 'HEIC to PNG Converter — Lossless & Private | Compress Pro',
		description:
			'Convert iPhone HEIC photos to lossless PNG in your browser — batch whole albums, download as a ZIP, nothing uploaded. Ideal for editing and archiving.',
		h1: 'Convert HEIC to PNG.',
		tagline: 'iPhone HEIC decoded to lossless PNG — on your own device.',
		related: ['/heic-to-jpg', '/compress-heic', '/compress-png']
	},
	{
		format: 'webp',
		path: '/webp-to-jpg',
		ogImage: '/og/webp-to-jpg.jpg',
		label: 'WebP → JPG',
		feature: 'Convert WebP to JPG',
		preset: { kind: 'image', tab: 'webp', to: 'jpg' },
		title: 'WebP to JPG Converter — Free, No Upload | Compress Pro',
		description:
			'Convert WebP images to JPG in your browser. Transparency is flattened to white, batches download as a ZIP, and files are never uploaded anywhere. Free.',
		h1: 'Convert WebP to JPG.',
		tagline: 'WebP to JPG re-encoded locally — nothing ever uploaded.',
		related: ['/compress-webp', '/webp-to-png', '/avif-to-jpg']
	},
	{
		format: 'webp',
		path: '/webp-to-png',
		ogImage: '/og/webp-to-png.jpg',
		label: 'WebP → PNG',
		feature: 'Convert WebP to PNG',
		preset: { kind: 'image', tab: 'webp', to: 'png', quality: 100 },
		title: 'WebP to PNG Converter — Lossless, No Upload | Compress Pro',
		description:
			'Convert WebP to lossless PNG in your browser — transparency preserved, pixels untouched. Batch conversion with ZIP download. No uploads, no accounts. Free.',
		h1: 'Convert WebP to PNG.',
		tagline: 'WebP to lossless PNG in your browser — files stay local.',
		related: ['/webp-to-jpg', '/compress-png', '/png-to-webp']
	},
	{
		format: 'jpg',
		path: '/avif-to-jpg',
		ogImage: '/og/avif-to-jpg.jpg',
		label: 'AVIF → JPG',
		feature: 'Convert AVIF to JPG',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept: 'image/avif,.avif',
		dropSubject: 'AVIF files',
		dropHint: 'AVIF only · multiple files supported',
		title: 'AVIF to JPG Converter — Private, In-Browser | Compress Pro',
		description:
			'Convert AVIF images to JPG locally in your browser — perfect when an app or site cannot open AVIF yet. Batch support, ZIP download, zero uploads. Free.',
		h1: 'Convert AVIF to JPG.',
		tagline: 'AVIF decoded to JPG in your browser — nothing uploaded.',
		related: ['/compress-jpg', '/jpg-to-webp', '/webp-to-jpg']
	},
	{
		format: 'png',
		path: '/png-to-jpg',
		ogImage: '/og/png-to-jpg.jpg',
		label: 'PNG → JPG',
		feature: 'Convert PNG to JPG',
		preset: { kind: 'image', tab: 'png', to: 'jpg' },
		title: 'PNG to JPG Converter — Batch, No Upload | Compress Pro',
		description:
			'Convert PNG images to JPG right in your browser. Transparency flattens to white, photos get dramatically smaller, and nothing is uploaded. Free & private.',
		h1: 'Convert PNG to JPG.',
		tagline: 'PNG to JPG converted in your browser — files stay local.',
		related: ['/compress-png', '/png-to-webp', '/compress-jpg']
	},
	{
		format: 'jpg',
		path: '/jpg-to-webp',
		ogImage: '/og/jpg-to-webp.jpg',
		label: 'JPG → WebP',
		feature: 'Convert JPG to WebP',
		preset: { kind: 'image', tab: 'jpg', to: 'webp' },
		title: 'JPG to WebP Converter — Smaller Files, Private | Compress Pro',
		description:
			'Convert JPG photos to WebP right in your browser — typically 25–35% smaller at the same visual quality. Batch conversion, ZIP download, no uploads. Free.',
		h1: 'Convert JPG to WebP.',
		tagline: 'JPG to WebP, typically 30% smaller — all in your browser.',
		related: ['/compress-jpg', '/compress-webp', '/png-to-webp']
	},
	{
		format: 'png',
		path: '/png-to-webp',
		ogImage: '/og/png-to-webp.jpg',
		label: 'PNG → WebP',
		feature: 'Convert PNG to WebP',
		preset: { kind: 'image', tab: 'png', to: 'webp' },
		title: 'PNG to WebP Converter — Keep Alpha, No Upload | Compress Pro',
		description:
			'Convert PNG to WebP in your browser and keep full transparency. Graphics shrink dramatically, batches download as a ZIP, and nothing is uploaded. Free.',
		h1: 'Convert PNG to WebP.',
		tagline: 'PNG to WebP with transparency kept — converted locally.',
		related: ['/compress-png', '/jpg-to-webp', '/webp-to-png']
	},
	{
		format: 'pdf',
		path: '/jpg-to-pdf',
		ogImage: '/og/jpg-to-pdf.jpg',
		label: 'JPG → PDF',
		feature: 'Convert JPG to PDF',
		preset: { kind: 'pdf-from-images' },
		title: 'JPG to PDF Converter — Combine Images, Private | Compress Pro',
		description:
			'Combine JPG photos into a single PDF right in your browser — one page per image, in your order. Reorder pages, set JPEG quality, download. No uploads. Free.',
		h1: 'Convert JPG to PDF.',
		tagline: 'JPGs into one PDF, page per image — built in your browser.',
		related: ['/compress-pdf', '/pdf-to-jpg', '/png-to-pdf', '/compress-jpg']
	},
	{
		format: 'pdf',
		path: '/png-to-pdf',
		ogImage: '/og/png-to-pdf.jpg',
		label: 'PNG → PDF',
		feature: 'Convert PNG to PDF',
		preset: { kind: 'pdf-from-images' },
		accept: 'image/png,.png',
		dropSubject: 'PNG files',
		dropHint: 'PNG images · combined into one PDF locally',
		title: 'PNG to PDF — Turn Screenshots into One File | Compress Pro',
		description:
			'Turn PNG screenshots and graphics into a single PDF in your browser — one page per image, in your order. Nothing is uploaded or watermarked. Free.',
		h1: 'Convert PNG to PDF.',
		tagline: 'PNG screenshots into one PDF — assembled on your device.',
		related: ['/jpg-to-pdf', '/compress-pdf', '/compress-png']
	},
	{
		format: 'pdf',
		path: '/pdf-to-jpg',
		ogImage: '/og/pdf-to-jpg.jpg',
		label: 'PDF → JPG',
		feature: 'Convert PDF to JPG',
		preset: { kind: 'pdf-to-images', imageFormat: 'jpg' },
		title: 'PDF to JPG Converter — Every Page, No Upload | Compress Pro',
		description:
			'Turn PDF pages into JPG images entirely in your browser. Choose 72–300 DPI and JPEG quality; multi-page PDFs download as a ZIP of images. No uploads. Free.',
		h1: 'Convert PDF to JPG.',
		tagline: 'PDF pages to JPG images — rendered 100% in your browser.',
		related: ['/compress-pdf', '/jpg-to-pdf', '/split-pdf', '/pdf-to-png']
	},
	{
		format: 'pdf',
		path: '/pdf-to-png',
		ogImage: '/og/pdf-to-png.jpg',
		label: 'PDF → PNG',
		feature: 'Convert PDF to PNG',
		preset: { kind: 'pdf-to-images', imageFormat: 'png' },
		dropSubject: 'PDF files',
		dropHint: 'PDF pages · rendered to PNG locally',
		title: 'PDF to PNG Converter — Lossless Pages, Local | Compress Pro',
		description:
			'Turn PDF pages into crisp lossless PNG images in your browser. Pick 72–300 DPI; multi-page files download as a ZIP. Nothing is uploaded, ever. Free.',
		h1: 'Convert PDF to PNG.',
		tagline: 'PDF pages become lossless PNGs — rendered on your device.',
		related: ['/pdf-to-jpg', '/compress-pdf', '/compress-png']
	},
	{
		format: 'video',
		path: '/mov-to-mp4',
		ogImage: '/og/mov-to-mp4.jpg',
		label: 'MOV → MP4',
		feature: 'Convert MOV to MP4',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'video/quicktime,.mov',
		dropSubject: 'MOV files',
		dropHint: 'MOV only · multiple files supported',
		title: 'MOV to MP4 Converter — iPhone Video, No Upload | Compress Pro',
		description:
			'Convert iPhone MOV videos to MP4 right in your browser — fast, audio carried over, nothing uploaded. Hit a target size in the same step. Free & private.',
		h1: 'Convert MOV to MP4.',
		tagline: 'iPhone MOV to MP4 on your device — nothing gets uploaded.',
		related: ['/compress-mov', '/compress-mp4', '/webm-to-mp4', '/mkv-to-mp4']
	},
	{
		format: 'video',
		path: '/webm-to-mp4',
		ogImage: '/og/webm-to-mp4.jpg',
		label: 'WebM → MP4',
		feature: 'Convert WebM to MP4',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'video/webm,.webm',
		dropSubject: 'WebM files',
		dropHint: 'WebM only · multiple files supported',
		title: 'WebM to MP4 Converter — Play Anywhere, Private | Compress Pro',
		description:
			'Convert WebM videos to MP4 in your browser so they play on Apple devices, TVs and editors. Audio included, batches supported, nothing uploaded. Free.',
		h1: 'Convert WebM to MP4.',
		tagline: 'WebM to MP4 converted on your device — files never leave.',
		related: ['/compress-video', '/mov-to-mp4', '/mp4-to-webm']
	},
	{
		format: 'video',
		path: '/mkv-to-mp4',
		ogImage: '/og/mkv-to-mp4.jpg',
		label: 'MKV → MP4',
		feature: 'Convert MKV to MP4',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'video/x-matroska,.mkv',
		dropSubject: 'MKV files',
		dropHint: 'MKV only · multiple files supported',
		title: 'MKV to MP4 Converter — In Your Browser, Private | Compress Pro',
		description:
			'Convert MKV videos to MP4 locally in your browser — no uploads, no installs. Works with any MKV your browser can play, batches included. Free & private.',
		h1: 'Convert MKV to MP4.',
		tagline: 'MKV into universal MP4 — converted right in your browser.',
		related: ['/compress-video', '/mov-to-mp4', '/webm-to-mp4']
	},
	{
		format: 'video',
		path: '/mp4-to-webm',
		ogImage: '/og/mp4-to-webm.jpg',
		label: 'MP4 → WebM',
		feature: 'Convert MP4 to WebM',
		preset: { kind: 'video', container: 'webm' },
		accept: 'video/mp4,video/x-m4v,.mp4,.m4v',
		dropSubject: 'MP4 files',
		dropHint: 'MP4 only · multiple files supported',
		title: 'MP4 to WebM Converter — Smaller Web Video | Compress Pro',
		description:
			'Convert MP4 videos to WebM right in your browser — typically smaller at the same visual quality, ideal for the web. No uploads, no accounts. Free & private.',
		h1: 'Convert MP4 to WebM.',
		tagline: 'MP4 to WebM in your browser — smaller video, same quality.',
		related: ['/compress-video', '/webm-to-mp4']
	},
	{
		format: 'video',
		path: '/video-to-gif',
		ogImage: '/og/video-to-gif.jpg',
		label: 'Video → GIF',
		feature: 'Convert video to GIF',
		preset: { kind: 'video', container: 'gif' },
		title: 'Video to GIF Converter — Free & Private | Compress Pro',
		description:
			'Convert MP4, WebM or MOV video to an animated GIF in your browser. Pick fps and size, files never leave your device. Free, private, no watermark.',
		h1: 'Convert video to GIF.',
		tagline: 'Turn MP4 or WebM clips into GIFs — right in your browser.',
		related: ['/mp4-to-gif', '/compress-video', '/gif-to-mp4', '/compress-gif']
	},
	{
		format: 'video',
		path: '/mp4-to-gif',
		ogImage: '/og/mp4-to-gif.jpg',
		label: 'MP4 → GIF',
		feature: 'Convert MP4 to GIF',
		preset: { kind: 'video', container: 'gif' },
		accept: 'video/mp4,video/x-m4v,.mp4,.m4v',
		dropSubject: 'MP4 files',
		dropHint: 'MP4 clips · turned into looping GIFs locally',
		title: 'MP4 to GIF Converter — No Watermark, No Upload | Compress Pro',
		description:
			'Turn MP4 clips into looping GIFs right in your browser — choose fps and size, no watermark, no length gate, nothing uploaded. Great for screen recordings.',
		h1: 'Convert MP4 to GIF.',
		tagline: 'MP4 clips become looping GIFs — made right on your device.',
		related: ['/video-to-gif', '/gif-to-mp4', '/compress-gif']
	},
	{
		format: 'video',
		path: '/gif-to-mp4',
		ogImage: '/og/gif-to-mp4.jpg',
		label: 'GIF → MP4',
		feature: 'Convert GIF to MP4',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'image/gif,.gif',
		dropSubject: 'GIF files',
		dropHint: 'Animated GIFs · converted to silent MP4',
		title: 'GIF to MP4 Converter — Smaller Files, No Upload | Compress Pro',
		description:
			'Convert animated GIFs to MP4 video in your browser — typically 5–10× smaller with smoother playback. No upload, no watermark, free and unlimited.',
		h1: 'Convert GIF to MP4.',
		tagline: 'GIFs become silent MP4 videos — smaller, smoother, local.',
		related: ['/compress-gif', '/video-to-gif', '/compress-video']
	},
	{
		format: 'audio',
		path: '/mp4-to-mp3',
		ogImage: '/og/mp4-to-mp3.jpg',
		label: 'MP4 → MP3',
		feature: 'Convert MP4 to MP3',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'video/mp4,video/quicktime,.mp4,.m4v,.mov',
		dropSubject: 'video files',
		dropHint: 'MP4/MOV video · audio extracted as MP3',
		title: 'MP4 to MP3 Converter — Extract Audio | Compress Pro',
		description:
			'Extract the audio track from MP4 or MOV video and save it as MP3 — right in your browser. No upload, no sign-up, no length limits. Free and private.',
		h1: 'Convert MP4 to MP3.',
		tagline: 'Pull audio out of any video — straight to MP3, locally.',
		related: ['/compress-audio', '/wav-to-mp3', '/m4a-to-mp3', '/compress-video']
	},
	{
		format: 'audio',
		path: '/wav-to-mp3',
		ogImage: '/og/wav-to-mp3.jpg',
		label: 'WAV → MP3',
		feature: 'Convert WAV to MP3',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/wav,audio/x-wav,.wav',
		dropSubject: 'WAV files',
		dropHint: 'WAV recordings · encoded to MP3 locally',
		title: 'WAV to MP3 Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WAV audio to MP3 in your browser — typically 10× smaller with no audible difference. Pick the bitrate, keep the file on your device. Free forever.',
		h1: 'Convert WAV to MP3.',
		tagline: 'Turn huge WAV recordings into small MP3s, in your browser.',
		related: ['/compress-audio', '/mp4-to-mp3', '/m4a-to-mp3', '/mp3-to-wav']
	},
	{
		format: 'audio',
		path: '/m4a-to-mp3',
		ogImage: '/og/m4a-to-mp3.jpg',
		label: 'M4A → MP3',
		feature: 'Convert M4A to MP3',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/mp4,audio/x-m4a,.m4a',
		dropSubject: 'M4A files',
		dropHint: 'M4A recordings · encoded to MP3 locally',
		title: 'M4A to MP3 Converter — Voice Memos, No Upload | Compress Pro',
		description:
			'Convert M4A and AAC audio to MP3 right in your browser — voice memos, recordings and music that play anywhere. Pick a bitrate. Nothing is uploaded. Free.',
		h1: 'Convert M4A to MP3.',
		tagline: 'Apple voice memos become MP3s — converted on your device.',
		related: ['/compress-audio', '/mp4-to-mp3', '/aac-to-mp3', '/wav-to-mp3']
	},
	{
		format: 'audio',
		path: '/flac-to-mp3',
		ogImage: '/og/flac-to-mp3.jpg',
		label: 'FLAC → MP3',
		feature: 'Convert FLAC to MP3',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/flac,audio/x-flac,.flac',
		dropSubject: 'FLAC files',
		dropHint: 'FLAC audio · encoded to MP3 locally',
		title: 'FLAC to MP3 Converter — Play It Anywhere | Compress Pro',
		description:
			'Convert FLAC to MP3 in your browser — files that play anywhere at a tenth of the size. Pick a bitrate, keep everything on your device. Free forever.',
		h1: 'Convert FLAC to MP3.',
		tagline: 'Lossless FLAC in, small MP3 out — encoded on your device.',
		related: ['/wav-to-flac', '/compress-audio', '/mp3-to-wav']
	},
	{
		format: 'audio',
		path: '/wav-to-flac',
		ogImage: '/og/wav-to-flac.jpg',
		label: 'WAV → FLAC',
		feature: 'Convert WAV to FLAC',
		preset: { kind: 'audio', output: 'flac' },
		accept: 'audio/wav,audio/x-wav,.wav',
		dropSubject: 'WAV files',
		dropHint: 'WAV masters · packed into lossless FLAC',
		title: 'WAV to FLAC — Lossless Audio Compression | Compress Pro',
		description:
			'Convert WAV to FLAC in your browser — mathematically lossless, typically half the size. No upload, no sign-up, no length limits. Free and private.',
		h1: 'Convert WAV to FLAC.',
		tagline: 'Same audio, about half the bytes — WAV to FLAC, locally.',
		related: ['/flac-to-mp3', '/wav-to-mp3', '/compress-audio']
	},
	{
		format: 'audio',
		path: '/opus-to-mp3',
		ogImage: '/og/opus-to-mp3.jpg',
		label: 'OPUS → MP3',
		feature: 'Convert OPUS to MP3',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/opus,audio/ogg,.opus',
		dropSubject: 'OPUS files',
		dropHint: 'OPUS voice notes · encoded to MP3 locally',
		title: 'OPUS to MP3 Converter — Voice Messages | Compress Pro',
		description:
			'Convert OPUS voice messages and recordings to MP3 in your browser — WhatsApp and Telegram audio that plays anywhere. No upload, free, no limits.',
		h1: 'Convert OPUS to MP3.',
		tagline: 'Turn WhatsApp voice notes into MP3s that play anywhere.',
		related: ['/ogg-to-mp3', '/m4a-to-mp3', '/compress-audio']
	},
	{
		format: 'audio',
		path: '/ogg-to-mp3',
		ogImage: '/og/ogg-to-mp3.jpg',
		label: 'OGG → MP3',
		feature: 'Convert OGG to MP3',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/ogg,.ogg,.oga',
		dropSubject: 'OGG files',
		dropHint: 'OGG/OGA audio · encoded to MP3 locally',
		title: 'OGG to MP3 Converter — Free, No Upload | Compress Pro',
		description:
			'Convert OGG and OGA files to MP3 right in your browser — game audio, podcasts and rips that play on any device. Free, private, no length limits.',
		h1: 'Convert OGG to MP3.',
		tagline: 'OGG audio in, universal MP3 out — nothing ever uploaded.',
		related: ['/opus-to-mp3', '/wav-to-mp3', '/compress-audio']
	},
	{
		format: 'audio',
		path: '/aac-to-mp3',
		ogImage: '/og/aac-to-mp3.jpg',
		label: 'AAC → MP3',
		feature: 'Convert AAC to MP3',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/aac,.aac',
		dropSubject: 'AAC files',
		dropHint: 'AAC audio · encoded to MP3 locally',
		title: 'AAC to MP3 Converter — Free, Private | Compress Pro',
		description:
			'Convert raw AAC audio files to MP3 in your browser — recorder output and stream rips that any device accepts. No upload, no sign-up, free forever.',
		h1: 'Convert AAC to MP3.',
		tagline: 'AAC recordings become MP3s that play absolutely anywhere.',
		related: ['/m4a-to-mp3', '/mp4-to-mp3', '/compress-audio']
	},
	{
		format: 'audio',
		path: '/mp3-to-wav',
		ogImage: '/og/mp3-to-wav.jpg',
		label: 'MP3 → WAV',
		feature: 'Convert MP3 to WAV',
		preset: { kind: 'audio', output: 'wav' },
		accept: 'audio/mpeg,audio/mp3,.mp3',
		dropSubject: 'MP3 files',
		dropHint: 'MP3 audio · decoded to WAV PCM locally',
		title: 'MP3 to WAV Converter — For Editors & DAWs | Compress Pro',
		description:
			'Convert MP3 to WAV in your browser — uncompressed PCM that samplers, DAWs and legacy tools accept without complaint. Free, private, no uploads ever.',
		h1: 'Convert MP3 to WAV.',
		tagline: 'Decode MP3s into clean WAV PCM for editors and samplers.',
		related: ['/wav-to-mp3', '/mp4-to-wav', '/compress-audio']
	},
	{
		format: 'audio',
		path: '/mp4-to-wav',
		ogImage: '/og/mp4-to-wav.jpg',
		label: 'MP4 → WAV',
		feature: 'Convert MP4 to WAV',
		preset: { kind: 'audio', output: 'wav' },
		accept: 'video/mp4,video/quicktime,.mp4,.m4v,.mov',
		dropSubject: 'video files',
		dropHint: 'MP4/MOV video · audio extracted as WAV',
		title: 'MP4 to WAV Converter — Extract PCM Audio | Compress Pro',
		description:
			'Extract the audio track from MP4 or MOV video as uncompressed WAV — in your browser, nothing uploaded. For editing, transcription and sampling. Free.',
		h1: 'Convert MP4 to WAV.',
		tagline: 'Pull the audio out of video as WAV — ready for any editor.',
		related: ['/mp4-to-mp3', '/mp3-to-wav', '/compress-audio']
	},
	{
		format: 'jpg',
		path: '/bmp-to-jpg',
		ogImage: '/og/bmp-to-jpg.jpg',
		label: 'BMP → JPG',
		feature: 'Convert BMP to JPG',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept: 'image/bmp,.bmp',
		dropSubject: 'BMP files',
		dropHint: 'BMP bitmaps · converted to JPG locally',
		title: 'BMP to JPG Converter — Free, Private, No Upload | Compress Pro',
		description:
			'Convert BMP images to JPG in your browser — typically 10–20× smaller. Drop the files, download the JPGs; nothing is uploaded. Free and unlimited.',
		h1: 'Convert BMP to JPG.',
		tagline: 'Turn bulky BMP bitmaps into small JPGs — in your browser.',
		related: ['/compress-jpg', '/png-to-jpg', '/tiff-to-jpg']
	},
	{
		format: 'jpg',
		path: '/tiff-to-jpg',
		ogImage: '/og/tiff-to-jpg.jpg',
		label: 'TIFF → JPG',
		feature: 'Convert TIFF to JPG',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept: 'image/tiff,.tif,.tiff',
		dropSubject: 'TIFF files',
		dropHint: 'TIFF scans & photos · converted to JPG locally',
		title: 'TIFF to JPG Converter — Free & Private | Compress Pro',
		description:
			'Convert TIFF scans and photos to JPG in your browser — no upload, no size limits. Multi-page TIFFs keep the first page. Free, private, unlimited.',
		h1: 'Convert TIFF to JPG.',
		tagline: 'Scanner TIFFs become shareable JPGs — locally, for free.',
		related: ['/compress-jpg', '/jpg-to-pdf', '/bmp-to-jpg']
	},
	{
		format: 'png',
		path: '/png-to-ico',
		ogImage: '/og/png-to-ico.jpg',
		label: 'PNG → ICO',
		feature: 'Convert PNG to ICO',
		preset: { kind: 'image', tab: 'png', to: 'ico' },
		accept: 'image/png,.png',
		dropSubject: 'PNG files',
		dropHint: 'PNG logos · turned into a multi-size favicon',
		title: 'PNG to ICO Converter — Favicon Generator | Compress Pro',
		description:
			'Convert PNG to a multi-size ICO favicon (16–256 px) right in your browser. Transparency is preserved and nothing gets uploaded. Free and unlimited.',
		h1: 'Convert PNG to ICO.',
		tagline: 'Turn a PNG into a multi-size favicon ICO, in your browser.',
		related: ['/compress-png', '/webp-to-png', '/jpg-to-ico', '/svg-to-ico']
	},
	{
		format: 'jpg',
		path: '/jpg-to-ico',
		ogImage: '/og/jpg-to-ico.jpg',
		label: 'JPG → ICO',
		feature: 'Convert JPG to ICO',
		preset: { kind: 'image', tab: 'jpg', to: 'ico' },
		accept: 'image/jpeg,.jpg,.jpeg',
		dropSubject: 'JPG files',
		dropHint: 'JPG logos & photos · turned into a multi-size favicon',
		title: 'JPG to ICO Converter — Favicon Generator | Compress Pro',
		description:
			'Convert JPG to a multi-size ICO favicon (16–256 px) right in your browser. Non-square photos are centered and nothing gets uploaded. Free and unlimited.',
		h1: 'Convert JPG to ICO.',
		tagline: 'Turn a JPG logo into a multi-size favicon ICO — locally.',
		related: ['/png-to-ico', '/svg-to-ico', '/compress-jpg']
	},
	{
		format: 'svg',
		path: '/svg-to-png',
		ogImage: '/og/svg-to-png.jpg',
		label: 'SVG → PNG',
		feature: 'Convert SVG to PNG',
		preset: { kind: 'svg', to: 'png' },
		accept: 'image/svg+xml,.svg',
		dropSubject: 'SVG files',
		dropHint: 'SVG artwork · rendered to PNG locally',
		title: 'SVG to PNG Converter — Free & Private | Compress Pro',
		description:
			'Convert SVG to PNG right in your browser — pick the output size, keep transparency, and batch-convert files. No uploads, no limits. Free and private.',
		h1: 'Convert SVG to PNG.',
		tagline: 'Crisp PNGs from SVG at any size — right in your browser.',
		related: ['/compress-svg', '/svg-to-ico', '/compress-png']
	},
	{
		format: 'svg',
		path: '/svg-to-ico',
		ogImage: '/og/svg-to-ico.jpg',
		label: 'SVG → ICO',
		feature: 'Convert SVG to ICO',
		preset: { kind: 'svg', to: 'ico' },
		accept: 'image/svg+xml,.svg',
		dropSubject: 'SVG files',
		dropHint: 'SVG logos · turned into a multi-size favicon',
		title: 'SVG to ICO Converter — Favicon Generator | Compress Pro',
		description:
			'Convert an SVG logo to a multi-size ICO favicon (16–256 px) in your browser. Vector sharpness at every size, nothing uploaded. Free and unlimited.',
		h1: 'Convert SVG to ICO.',
		tagline: 'Vector-sharp favicons — SVG to a multi-size ICO, locally.',
		related: ['/png-to-ico', '/svg-to-png', '/compress-svg']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/ttf-to-woff2',
		ogImage: '/og/ttf-to-woff2.jpg',
		label: 'TTF → WOFF2',
		feature: 'Convert TTF to WOFF2',
		preset: { kind: 'font', to: 'woff2' },
		accept: 'font/ttf,.ttf',
		dropSubject: 'TTF fonts',
		dropHint: 'TTF fonts · repackaged to WOFF2 locally',
		title: 'TTF to WOFF2 Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert TTF fonts to WOFF2 in your browser — typically half the size, identical glyphs, kerning and hinting. Nothing is uploaded. Free, no sign-up.',
		h1: 'Convert TTF to WOFF2.',
		tagline: 'Turn desktop TTF fonts into web-ready WOFF2 — privately.',
		related: ['/font-converter', '/otf-to-woff2', '/woff2-to-ttf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/ttf-to-woff',
		ogImage: '/og/ttf-to-woff.jpg',
		label: 'TTF → WOFF',
		feature: 'Convert TTF to WOFF',
		preset: { kind: 'font', to: 'woff' },
		accept: 'font/ttf,.ttf',
		dropSubject: 'TTF fonts',
		dropHint: 'TTF fonts · wrapped as WOFF locally',
		title: 'TTF to WOFF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert TTF to WOFF in your browser — a byte-exact zlib wrapper for older browsers. Your font never leaves your device. Free, private, no sign-up.',
		h1: 'Convert TTF to WOFF.',
		tagline: 'TTF wrapped as WOFF for legacy browsers — all in-browser.',
		related: ['/ttf-to-woff2', '/font-converter', '/woff-to-ttf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/otf-to-woff2',
		ogImage: '/og/otf-to-woff2.jpg',
		label: 'OTF → WOFF2',
		feature: 'Convert OTF to WOFF2',
		preset: { kind: 'font', to: 'woff2' },
		accept: 'font/otf,.otf',
		dropSubject: 'OTF fonts',
		dropHint: 'OTF fonts · repackaged to WOFF2 locally',
		title: 'OTF to WOFF2 Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert OTF fonts to WOFF2 in your browser — smaller for the web, with CFF outlines stored byte-for-byte. Nothing is uploaded. Free and private.',
		h1: 'Convert OTF to WOFF2.',
		tagline: 'Web-ready WOFF2 from your OTF fonts — nothing uploaded.',
		related: ['/font-converter', '/ttf-to-woff2', '/woff2-to-otf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/otf-to-woff',
		ogImage: '/og/otf-to-woff.jpg',
		label: 'OTF → WOFF',
		feature: 'Convert OTF to WOFF',
		preset: { kind: 'font', to: 'woff' },
		accept: 'font/otf,.otf',
		dropSubject: 'OTF fonts',
		dropHint: 'OTF fonts · wrapped as WOFF locally',
		title: 'OTF to WOFF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert OTF to WOFF in your browser — a lossless zlib wrapper for older browsers. Your font file never leaves your device. Free, private, no sign-up.',
		h1: 'Convert OTF to WOFF.',
		tagline: 'OTF wrapped as WOFF for legacy browsers — all in-browser.',
		related: ['/otf-to-woff2', '/font-converter', '/woff-to-otf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/woff-to-ttf',
		ogImage: '/og/woff-to-ttf.jpg',
		label: 'WOFF → TTF',
		feature: 'Convert WOFF to TTF',
		preset: { kind: 'font', to: 'ttf' },
		accept: 'font/woff,application/font-woff,.woff',
		dropSubject: 'WOFF fonts',
		dropHint: 'WOFF web fonts · unwrapped locally',
		title: 'WOFF to TTF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WOFF web fonts back to installable TTF in your browser — the original font data, unwrapped losslessly. Nothing uploaded. Free, no sign-up.',
		h1: 'Convert WOFF to TTF.',
		tagline: 'Unwrap WOFF web fonts back to installable TTF — locally.',
		related: ['/woff-to-woff2', '/font-converter', '/woff2-to-ttf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/woff-to-otf',
		ogImage: '/og/woff-to-otf.jpg',
		label: 'WOFF → OTF',
		feature: 'Convert WOFF to OTF',
		preset: { kind: 'font', to: 'otf' },
		accept: 'font/woff,application/font-woff,.woff',
		dropSubject: 'WOFF fonts',
		dropHint: 'WOFF web fonts · unwrapped locally',
		title: 'WOFF to OTF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WOFF web fonts back to desktop OTF in your browser — the original CFF font, unwrapped losslessly. Nothing is uploaded. Free and private.',
		h1: 'Convert WOFF to OTF.',
		tagline: 'Unwrap WOFF web fonts back to desktop OTF — in-browser.',
		related: ['/woff-to-ttf', '/font-converter', '/otf-to-woff']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/woff-to-woff2',
		ogImage: '/og/woff-to-woff2.jpg',
		label: 'WOFF → WOFF2',
		feature: 'Convert WOFF to WOFF2',
		preset: { kind: 'font', to: 'woff2' },
		accept: 'font/woff,application/font-woff,.woff',
		dropSubject: 'WOFF fonts',
		dropHint: 'WOFF web fonts · upgraded to WOFF2 locally',
		title: 'WOFF to WOFF2 Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WOFF to WOFF2 in your browser — Brotli recompression makes web fonts about a quarter smaller, losslessly. Nothing uploaded. Free, no sign-up.',
		h1: 'Convert WOFF to WOFF2.',
		tagline: 'Upgrade WOFF fonts to smaller WOFF2 — nothing uploaded.',
		related: ['/ttf-to-woff2', '/font-converter', '/woff2-to-woff']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/woff2-to-ttf',
		ogImage: '/og/woff2-to-ttf.jpg',
		label: 'WOFF2 → TTF',
		feature: 'Convert WOFF2 to TTF',
		preset: { kind: 'font', to: 'ttf' },
		accept: 'font/woff2,.woff2',
		dropSubject: 'WOFF2 fonts',
		dropHint: 'WOFF2 web fonts · decoded locally',
		title: 'WOFF2 to TTF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WOFF2 web fonts to installable TTF in your browser — glyphs, kerning and hinting all preserved. Nothing is uploaded. Free, private, no sign-up.',
		h1: 'Convert WOFF2 to TTF.',
		tagline: 'Unpack WOFF2 web fonts into installable TTF — privately.',
		related: ['/ttf-to-woff2', '/font-converter', '/woff2-to-otf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/woff2-to-otf',
		ogImage: '/og/woff2-to-otf.jpg',
		label: 'WOFF2 → OTF',
		feature: 'Convert WOFF2 to OTF',
		preset: { kind: 'font', to: 'otf' },
		accept: 'font/woff2,.woff2',
		dropSubject: 'WOFF2 fonts',
		dropHint: 'WOFF2 web fonts · decoded locally',
		title: 'WOFF2 to OTF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WOFF2 web fonts to desktop OTF in your browser — the CFF font data comes out byte-for-byte intact. Nothing uploaded. Free, private, no sign-up.',
		h1: 'Convert WOFF2 to OTF.',
		tagline: 'Unpack WOFF2 web fonts into desktop OTF — in your browser.',
		related: ['/woff2-to-ttf', '/font-converter', '/otf-to-woff2']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/woff2-to-woff',
		ogImage: '/og/woff2-to-woff.jpg',
		label: 'WOFF2 → WOFF',
		feature: 'Convert WOFF2 to WOFF',
		preset: { kind: 'font', to: 'woff' },
		accept: 'font/woff2,.woff2',
		dropSubject: 'WOFF2 fonts',
		dropHint: 'WOFF2 web fonts · repacked as WOFF locally',
		title: 'WOFF2 to WOFF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WOFF2 to WOFF in your browser for legacy browser support — lossless, though zlib output is larger. Nothing is uploaded. Free, private, no limits.',
		h1: 'Convert WOFF2 to WOFF.',
		tagline: 'Repack WOFF2 as WOFF for legacy browsers — output grows.',
		related: ['/woff-to-woff2', '/font-converter', '/woff2-to-ttf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/ttf-to-eot',
		ogImage: '/og/ttf-to-eot.jpg',
		label: 'TTF → EOT',
		feature: 'Convert TTF to EOT',
		preset: { kind: 'font', to: 'eot' },
		accept: 'font/ttf,.ttf',
		dropSubject: 'TTF fonts',
		dropHint: 'TTF fonts · wrapped as EOT locally',
		title: 'TTF to EOT Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert TTF fonts to EOT for Internet Explorer 6–8 in your browser — a lossless header wrapper. Your font never leaves your device. Free, no sign-up.',
		h1: 'Convert TTF to EOT.',
		tagline: 'EOT files for the old Internet Explorer — created locally.',
		related: ['/eot-to-ttf', '/font-converter', '/ttf-to-woff2']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/eot-to-ttf',
		ogImage: '/og/eot-to-ttf.jpg',
		label: 'EOT → TTF',
		feature: 'Convert EOT to TTF',
		preset: { kind: 'font', to: 'ttf' },
		accept: 'application/vnd.ms-fontobject,.eot',
		dropSubject: 'EOT fonts',
		dropHint: 'legacy EOT fonts · decoded locally',
		title: 'EOT to TTF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert legacy EOT fonts back to TTF in your browser — plain and XOR-obfuscated EOTs decode losslessly. Nothing is uploaded. Free, private, no sign-up.',
		h1: 'Convert EOT to TTF.',
		tagline: 'Rescue fonts from legacy EOT files — decoded in-browser.',
		related: ['/ttf-to-eot', '/font-converter', '/woff-to-ttf']
	},
	{
		format: 'zip',
		path: '/rar-to-zip',
		ogImage: '/og/rar-to-zip.jpg',
		label: 'RAR → ZIP',
		feature: 'Convert RAR to ZIP',
		preset: { kind: 'archive', op: 'convert', to: 'zip' },
		accept: '.rar,application/vnd.rar,application/x-rar-compressed',
		dropSubject: 'RAR archives',
		dropHint: 'RAR v4 & v5 · repacked to ZIP locally',
		title: 'RAR to ZIP Converter — Private, No Upload | Compress Pro',
		description:
			'Convert RAR to ZIP right in your browser — no WinRAR, no upload. Handles RAR v4 and v5, password-protected ones included. Files stay on your device.',
		h1: 'Convert RAR to ZIP.',
		tagline: 'Open-anywhere ZIP from RAR — converted on your own device.',
		related: ['/7z-to-zip', '/zip-files', '/zip-to-7z']
	},
	{
		format: 'zip',
		path: '/7z-to-zip',
		ogImage: '/og/7z-to-zip.jpg',
		label: '7Z → ZIP',
		feature: 'Convert 7Z to ZIP',
		preset: { kind: 'archive', op: 'convert', to: 'zip' },
		accept: '.7z,application/x-7z-compressed',
		dropSubject: '7Z archives',
		dropHint: '7-Zip archives · repacked to ZIP locally',
		title: '7Z to ZIP Converter — Private, No Upload | Compress Pro',
		description:
			'Convert 7Z archives to ZIP in your browser — nothing to install, nothing uploaded. Password-protected 7Z files work too. Free, fast and private.',
		h1: 'Convert 7Z to ZIP.',
		tagline: 'Turn 7Z archives into ZIPs that open everywhere, locally.',
		related: ['/zip-to-7z', '/rar-to-zip', '/zip-files']
	},
	{
		format: 'zip',
		path: '/zip-to-7z',
		ogImage: '/og/zip-to-7z.jpg',
		label: 'ZIP → 7Z',
		feature: 'Convert ZIP to 7Z',
		preset: { kind: 'archive', op: 'convert', to: '7z' },
		accept: '.zip,application/zip,application/x-zip-compressed',
		dropSubject: 'ZIP archives',
		dropHint: 'ZIP archives · repacked to 7Z locally',
		title: 'ZIP to 7Z Converter — Smaller Archives | Compress Pro',
		description:
			'Repack ZIP archives as 7Z right in your browser and shave off extra megabytes — LZMA2 compresses harder than deflate. No upload, free and private.',
		h1: 'Convert ZIP to 7Z.',
		tagline: 'Repack ZIP as 7Z for the strongest everyday compression.',
		related: ['/7z-to-zip', '/zip-files', '/rar-to-zip']
	},
	{
		format: 'zip',
		path: '/tar-gz-to-zip',
		ogImage: '/og/tar-gz-to-zip.jpg',
		label: 'TAR.GZ → ZIP',
		feature: 'Convert TAR.GZ to ZIP',
		preset: { kind: 'archive', op: 'convert', to: 'zip' },
		accept: '.gz,.tgz,.tar,.tbz2,.txz,application/gzip,application/x-tar',
		dropSubject: 'tarballs',
		dropHint: 'tar.gz / tgz / tar · repacked to ZIP locally',
		title: 'TAR.GZ to ZIP Converter — Private, No Upload | Compress Pro',
		description:
			'Convert tar.gz and tgz tarballs to ZIP in your browser — double-click friendly on Windows, no extra tools. Plain tar, tar.bz2 and tar.xz work too.',
		h1: 'Convert TAR.GZ to ZIP.',
		tagline: 'Unix tar.gz in, Windows-friendly ZIP out — all on-device.',
		related: ['/zip-to-tar-gz', '/zip-files', '/rar-to-zip']
	},
	{
		format: 'zip',
		path: '/iso-to-zip',
		ogImage: '/og/iso-to-zip.jpg',
		label: 'ISO → ZIP',
		feature: 'Convert ISO to ZIP',
		preset: { kind: 'archive', op: 'convert', to: 'zip' },
		accept: '.iso,application/x-iso9660-image',
		dropSubject: 'ISO images',
		dropHint: 'Disc images · files repacked to ZIP locally',
		title: 'ISO to ZIP Converter — Extract & Repack | Compress Pro',
		description:
			'Pull the files out of an ISO disc image and repack them as a ZIP — entirely in your browser, no mounting, no drive letters, nothing uploaded anywhere.',
		h1: 'Convert ISO to ZIP.',
		tagline: 'Disc image in, plain ZIP of its files out — no installs.',
		related: ['/zip-files', '/rar-to-zip', '/zip-to-7z']
	},
	{
		format: 'zip',
		path: '/zip-to-tar-gz',
		ogImage: '/og/zip-to-tar-gz.jpg',
		label: 'ZIP → TAR.GZ',
		feature: 'Convert ZIP to TAR.GZ',
		preset: { kind: 'archive', op: 'convert', to: 'tgz' },
		accept: '.zip,application/zip,application/x-zip-compressed',
		dropSubject: 'ZIP archives',
		dropHint: 'ZIP archives · repacked to tar.gz locally',
		title: 'ZIP to TAR.GZ Converter — Private, No Upload | Compress Pro',
		description:
			'Turn a ZIP into a unix-style tar.gz tarball right in your browser — for build pipelines, servers and tools that expect tarballs. Free and private.',
		h1: 'Convert ZIP to TAR.GZ.',
		tagline: 'ZIP from Windows in, unix-ready tar.gz out — on-device.',
		related: ['/tar-gz-to-zip', '/zip-files', '/7z-to-zip']
	}
];

/**
 * Standalone tool pages hosted on an existing tab (like CONVERTERS, minus the
 * "X → Y" conversion framing) — PDF ops (unlock/protect/merge/split) plus
 * standalone video and image tools.
 */
export const TOOLS: ConverterEntry[] = [
	{
		format: 'pdf',
		path: '/unlock-pdf',
		ogImage: '/og/unlock-pdf.jpg',
		label: 'Unlock PDF',
		feature: 'Unlock password-protected PDFs',
		preset: { kind: 'pdf-op', op: 'unlock' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'Password-protected PDFs · unlocked locally',
		title: 'Unlock PDF Online — Remove Password Locally | Compress Pro',
		description:
			'Remove a password from a PDF you own — right in your browser. The file and the password never leave your device. Free, private, no upload, no sign-up.',
		h1: 'Unlock PDF files.',
		tagline: 'Remove PDF passwords locally — nothing ever gets uploaded.',
		related: ['/compress-pdf', '/protect-pdf', '/merge-pdf', '/split-pdf']
	},
	{
		format: 'pdf',
		path: '/protect-pdf',
		ogImage: '/og/protect-pdf.jpg',
		label: 'Protect PDF',
		feature: 'Password-protect PDFs',
		preset: { kind: 'pdf-op', op: 'protect' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF files · password-protected locally',
		title: 'Protect PDF with a Password — Free & Private | Compress Pro',
		description:
			'Add a password to a PDF right in your browser. Encryption runs locally — the file and the password never leave your device. Free, private and unlimited.',
		h1: 'Password-protect PDF files.',
		tagline: 'Password-protect PDFs locally — no uploads, no accounts.',
		related: ['/compress-pdf', '/unlock-pdf', '/split-pdf']
	},
	{
		format: 'pdf',
		path: '/merge-pdf',
		ogImage: '/og/merge-pdf.jpg',
		label: 'Merge PDF',
		feature: 'Merge PDFs into one document',
		preset: { kind: 'pdf-op', op: 'merge' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF files · merged locally in your order',
		title: 'Merge PDF Files — Combine PDFs Privately | Compress Pro',
		description:
			'Merge multiple PDFs into one document right in your browser — drag to reorder, optionally compress the result. Files never leave your device. Free.',
		h1: 'Merge PDF files.',
		tagline: 'Combine PDFs into one file locally — nothing is uploaded.',
		related: ['/split-pdf', '/compress-pdf', '/unlock-pdf']
	},
	{
		format: 'pdf',
		path: '/split-pdf',
		ogImage: '/og/split-pdf.jpg',
		label: 'Split PDF',
		feature: 'Split PDFs — extract or remove pages',
		preset: { kind: 'pdf-op', op: 'pages' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF files · pages extracted locally',
		title: 'Split PDF — Extract or Remove Pages Privately | Compress Pro',
		description:
			'Split a PDF in your browser — keep only the pages you need or delete the ones you don’t, with ranges like 1-3,7. The file never leaves your device. Free.',
		h1: 'Split PDF files.',
		tagline: 'Extract or remove PDF pages locally — nothing is uploaded.',
		related: ['/merge-pdf', '/compress-pdf', '/pdf-to-jpg']
	},
	{
		format: 'video',
		path: '/compress-mp4',
		ogImage: '/og/compress-mp4.jpg',
		demo: 'video',
		label: 'Compress MP4',
		feature: 'Compress MP4 video to a size limit',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'video/mp4,video/x-m4v,.mp4,.m4v',
		dropSubject: 'MP4 files',
		dropHint: 'MP4 only · multiple files supported',
		title: 'Compress MP4 Video Online — Free & Private | Compress Pro',
		description:
			'Shrink MP4 videos right in your browser — set a quality or a target size like 10 MB for Discord. Nothing is uploaded, no watermark. Free & private.',
		h1: 'Compress MP4 videos.',
		tagline: 'Shrink MP4s on your device — under any upload size limit.',
		related: ['/compress-video', '/mov-to-mp4', '/mp4-to-webm', '/mp4-to-gif']
	},
	{
		format: 'video',
		path: '/compress-mov',
		ogImage: '/og/compress-mov.jpg',
		label: 'Compress MOV',
		feature: 'Compress MOV (QuickTime) video',
		preset: { kind: 'video', container: 'mov' },
		accept: 'video/quicktime,.mov',
		dropSubject: 'MOV files',
		dropHint: 'MOV only · multiple files supported',
		title: 'Compress MOV (QuickTime) Online — No Upload | Compress Pro',
		description:
			'Shrink MOV videos right in your browser and keep the QuickTime format — set a quality or a target size. No uploads, no watermarks. Free & private.',
		h1: 'Compress MOV videos.',
		tagline: 'Shrink QuickTime MOV files on your device — still a MOV.',
		related: ['/mov-to-mp4', '/compress-mp4', '/compress-video']
	},
	{
		format: 'jpg',
		path: '/resize-image',
		ogImage: '/og/resize-image.jpg',
		label: 'Resize image',
		feature: 'Resize images to a longest-side cap',
		preset: { kind: 'resize', maxDimension: 1920 },
		accept:
			'image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif',
		dropSubject: 'images',
		dropHint: 'JPG, PNG, WebP, GIF & HEIC · resized locally',
		title: 'Resize Images Online — Fast, Private, No Upload | Compress Pro',
		description:
			'Resize images right in your browser — set a longest-side limit like 1920 px and photos scale down with their aspect ratio intact. No uploads, no limits. Free.',
		h1: 'Resize images.',
		tagline: 'Downscale photos to any pixel size — all in your browser.',
		related: ['/compress-jpg', '/compress-png', '/compress-heic']
	},
	{
		format: 'jpg',
		path: '/compress-image',
		ogImage: '/og/compress-image.jpg',
		demo: 'photo',
		label: 'Image compressor',
		feature: 'Compress any image format',
		preset: { kind: 'image-any' },
		accept:
			'image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif',
		dropSubject: 'images',
		dropHint: 'JPG, PNG, WebP, GIF, HEIC & AVIF · compressed locally',
		title: 'Image Compressor — Free & Private, No Upload | Compress Pro',
		description:
			'Free image compressor that runs in your browser. Compress JPG, PNG, WebP, GIF, HEIC or AVIF — pick a quality or an exact target size. No uploads, no ads.',
		h1: 'Compress images.',
		tagline: 'JPG, PNG, WebP, HEIC & more — compressed on your device.',
		related: ['/compress-jpg', '/compress-png', '/compress-heic', '/resize-image']
	},
	{
		format: 'jpg',
		path: '/compress-jpg-to-100kb',
		ogImage: '/og/compress-jpg-to-100kb.jpg',
		label: 'JPG to 100 KB',
		feature: 'Compress JPG photos to 100 KB',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg', mode: 'target', targetKb: 100 },
		accept: 'image/jpeg,.jpg,.jpeg',
		dropSubject: 'JPG files',
		dropHint: 'JPG photos · squeezed under 100 KB locally',
		title: 'Compress JPEG to 100 KB Online — Free & Private | Compress Pro',
		description:
			'Compress JPG (JPEG) photos to 100 KB right in your browser — target-size mode finds the best quality that fits under the cap. No uploads, no ads. Free.',
		h1: 'Compress JPG to 100 KB.',
		tagline: 'JPG photos squeezed under 100 KB — right in your browser.',
		related: ['/compress-jpg', '/resize-image', '/compress-image']
	},
	{
		format: 'font',
		path: '/subset-font',
		ogImage: '/og/subset-font.jpg',
		label: 'Subset font',
		feature: 'Subset fonts — keep only the characters you use',
		preset: { kind: 'font-op', op: 'subset' },
		accept:
			'font/ttf,font/otf,font/woff,font/woff2,application/vnd.ms-fontobject,.ttf,.otf,.woff,.woff2,.eot',
		dropSubject: 'font files',
		dropHint: 'TTF, WOFF & WOFF2 · subset locally',
		title: 'Subset Font Online — Smaller Web Fonts, Private | Compress Pro',
		description:
			'Subset fonts in your browser — keep only the character sets or exact text you need and cut web font weight dramatically. Free, private, no upload.',
		h1: 'Subset fonts.',
		tagline: 'Keep only the characters you use — subset fonts locally.',
		steps: [
			'Drop a font — TTF, or WOFF/WOFF2 with TrueType outlines (batches work too).',
			'Tick the character sets you need, paste exact text, or pin variable axes.',
			'Subset, check the before/after glyph counts, and download the result.'
		],
		related: ['/font-converter', '/variable-font-to-static', '/ttf-to-woff2']
	},
	{
		format: 'font',
		path: '/variable-font-to-static',
		ogImage: '/og/variable-font-to-static.jpg',
		label: 'Variable → static',
		feature: 'Pin variable font axes to a static instance',
		preset: { kind: 'font-op', op: 'instance' },
		accept:
			'font/ttf,font/otf,font/woff,font/woff2,application/vnd.ms-fontobject,.ttf,.otf,.woff,.woff2,.eot',
		dropSubject: 'variable fonts',
		dropHint: 'variable TTF/WOFF2 · pinned locally',
		title: 'Variable Font to Static Converter — Free, Local | Compress Pro',
		description:
			'Turn a variable font into a static instance right in your browser — pin weight, width or any axis, or keep the defaults. Free, private, no upload.',
		h1: 'Variable font to static.',
		tagline: 'Turn variable fonts into static instances — all locally.',
		steps: [
			'Drop a variable font — its axes (weight, width …) are detected automatically.',
			'Set a value per axis, like weight 700, or simply keep each axis default.',
			'Download the pinned static font — smaller, and it works everywhere.'
		],
		related: ['/subset-font', '/font-converter', '/woff2-to-ttf']
	},
	{
		format: 'zip',
		path: '/create-7z',
		ogImage: '/og/create-7z.jpg',
		label: 'Create 7Z',
		feature: 'Create 7Z archives',
		preset: { kind: 'archive', op: 'create', to: '7z' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Any files · bundled into one 7Z locally',
		title: 'Create 7Z Archives Online — AES-256, Private | Compress Pro',
		description:
			'Make a 7Z archive from any files right in your browser — the strongest everyday compression, optional AES-256 password, nothing uploaded anywhere.',
		h1: 'Create 7Z archives.',
		tagline: 'Build 7Z archives in your browser — small, AES, private.',
		related: ['/zip-to-7z', '/7z-to-zip', '/zip-files']
	},
	{
		format: 'zip',
		path: '/create-tar',
		ogImage: '/og/create-tar.jpg',
		label: 'Create TAR',
		feature: 'Create TAR archives',
		preset: { kind: 'archive', op: 'create', to: 'tar' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Any files · bundled into one TAR locally',
		title: 'Create TAR Files Online — Private, No Upload | Compress Pro',
		description:
			'Bundle files into a plain .tar archive right in your browser — the unix standard for grouping files, uncompressed by design. Free, private, local.',
		h1: 'Create TAR archives.',
		tagline: 'Bundle files into a tar archive — built on your device.',
		related: ['/create-tar-gz', '/gzip-files', '/zip-files']
	},
	{
		format: 'zip',
		path: '/create-tar-gz',
		ogImage: '/og/create-tar-gz.jpg',
		label: 'Create TAR.GZ',
		feature: 'Create TAR.GZ tarballs',
		preset: { kind: 'archive', op: 'create', to: 'tgz' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Any files · packed into one tar.gz locally',
		title: 'Create TAR.GZ Online — Private, No Upload | Compress Pro',
		description:
			'Build a tar.gz tarball from any files in your browser — the standard unix distribution format, also as tar.bz2 or tar.xz. Nothing gets uploaded.',
		h1: 'Create TAR.GZ tarballs.',
		tagline: 'Make tar.gz tarballs in your browser — nothing uploaded.',
		related: ['/zip-to-tar-gz', '/tar-gz-to-zip', '/create-tar']
	},
	{
		format: 'zip',
		path: '/gzip-files',
		ogImage: '/og/gzip-files.jpg',
		label: 'Gzip',
		feature: 'Gzip individual files',
		preset: { kind: 'archive', op: 'create', to: 'gz' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Each file compressed to its own .gz locally',
		title: 'Gzip Files Online — Compress to .GZ Locally | Compress Pro',
		description:
			'Gzip any file in your browser — each input becomes its own .gz, the format servers, log tooling and unix pipelines expect. Free, private, no upload.',
		h1: 'Gzip files.',
		tagline: 'Gzip any file right in your browser — nothing uploaded.',
		related: ['/bzip2-files', '/xz-files', '/create-tar-gz']
	},
	{
		format: 'zip',
		path: '/bzip2-files',
		ogImage: '/og/bzip2-files.jpg',
		label: 'Bzip2',
		feature: 'Bzip2 individual files',
		preset: { kind: 'archive', op: 'create', to: 'bz2' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Each file compressed to its own .bz2 locally',
		title: 'Bzip2 Files Online — Compress to .BZ2 Locally | Compress Pro',
		description:
			'Compress files to .bz2 right in your browser — bzip2 squeezes text harder than gzip, one output per input, nothing uploaded. Free and private.',
		h1: 'Bzip2 files.',
		tagline: 'Bzip2-compress files in your browser — smaller than gzip.',
		related: ['/gzip-files', '/xz-files', '/create-tar-gz']
	},
	{
		format: 'zip',
		path: '/xz-files',
		ogImage: '/og/xz-files.jpg',
		label: 'XZ',
		feature: 'XZ-compress individual files',
		preset: { kind: 'archive', op: 'create', to: 'xz' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Each file compressed to its own .xz locally',
		title: 'XZ Compress Online — Smallest Single Files | Compress Pro',
		description:
			'Compress files to .xz in your browser — LZMA2 squeezes text and data harder than gzip or bzip2. One output per input, private, nothing uploaded.',
		h1: 'XZ-compress files.',
		tagline: 'XZ squeezes hardest — compress files on your own device.',
		related: ['/gzip-files', '/bzip2-files', '/create-7z']
	},
	{
		format: 'zip',
		path: '/extract-rar',
		ogImage: '/og/extract-rar.jpg',
		label: 'Extract RAR',
		feature: 'Extract RAR archives',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.rar,application/vnd.rar,application/x-rar-compressed',
		dropSubject: 'RAR archives',
		dropHint: 'RAR v4 & v5 · extracted locally',
		title: 'Extract RAR Online — Open RAR Without WinRAR | Compress Pro',
		description:
			'Open RAR archives right in your browser — no WinRAR, no install, no upload. RAR v4 and v5, password-protected included. Every file its own download.',
		h1: 'Extract RAR archives.',
		tagline: 'Open RAR archives in your browser — files out, no apps.',
		related: ['/rar-to-zip', '/extract-7z', '/zip-files']
	},
	{
		format: 'zip',
		path: '/extract-7z',
		ogImage: '/og/extract-7z.jpg',
		label: 'Extract 7Z',
		feature: 'Extract 7Z archives',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.7z,application/x-7z-compressed',
		dropSubject: '7Z archives',
		dropHint: '7-Zip archives · extracted locally',
		title: 'Extract 7Z Online — Unpack 7-Zip Archives | Compress Pro',
		description:
			'Unpack .7z archives in your browser — no 7-Zip install needed, nothing uploaded. Password-protected and header-encrypted archives both supported.',
		h1: 'Extract 7Z archives.',
		tagline: 'Unpack 7Z archives locally — every file its own download.',
		related: ['/7z-to-zip', '/create-7z', '/extract-rar']
	},
	{
		format: 'zip',
		path: '/extract-tar-gz',
		ogImage: '/og/extract-tar-gz.jpg',
		label: 'Extract TAR.GZ',
		feature: 'Extract TAR.GZ tarballs',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.gz,.tgz,.tar,.tbz2,.txz,application/gzip,application/x-tar',
		dropSubject: 'tarballs',
		dropHint: 'tar.gz / tgz / tar.xz · unpacked locally',
		title: 'Extract TAR.GZ Online — Open Tarballs Easily | Compress Pro',
		description:
			'Open tar.gz, tgz, tar.bz2 and tar.xz tarballs in your browser — both layers unpacked automatically, every file its own download. Nothing uploaded.',
		h1: 'Extract TAR.GZ tarballs.',
		tagline: 'Open tar.gz tarballs in your browser — no terminal used.',
		related: ['/tar-gz-to-zip', '/create-tar-gz', '/extract-gz']
	},
	{
		format: 'zip',
		path: '/extract-gz',
		ogImage: '/og/extract-gz.jpg',
		label: 'Extract GZ',
		feature: 'Decompress .gz files',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.gz,application/gzip,application/x-gzip',
		dropSubject: 'GZ files',
		dropHint: 'gzip streams · decompressed locally',
		title: 'Extract GZ Online — Gunzip in the Browser | Compress Pro',
		description:
			'Decompress .gz files right in your browser — server logs, database dumps, exports. The original file comes straight back; nothing is ever uploaded.',
		h1: 'Extract GZ files.',
		tagline: 'Gunzip .gz files in your browser — nothing gets uploaded.',
		related: ['/gzip-files', '/extract-tar-gz', '/zip-files']
	},
	{
		format: 'zip',
		path: '/extract-iso',
		ogImage: '/og/extract-iso.jpg',
		label: 'Extract ISO',
		feature: 'Extract ISO disc images',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.iso,application/x-iso9660-image',
		dropSubject: 'ISO images',
		dropHint: 'Disc images · files listed locally',
		title: 'Extract ISO Online — Open Disc Images | Compress Pro',
		description:
			'Open ISO disc images in your browser and pull out the files — no mounting, no virtual drives, no admin rights. Runs locally; nothing is uploaded.',
		h1: 'Extract ISO images.',
		tagline: 'Look inside ISO disc images — files out, never mounted.',
		related: ['/iso-to-zip', '/zip-files', '/extract-rar']
	},
	{
		format: 'zip',
		path: '/extract-cab',
		ogImage: '/og/extract-cab.jpg',
		label: 'Extract CAB',
		feature: 'Extract CAB archives',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.cab,application/vnd.ms-cab-compressed',
		dropSubject: 'CAB archives',
		dropHint: 'Windows cabinets · extracted locally',
		title: 'Extract CAB Online — Open Cabinet Files | Compress Pro',
		description:
			'Open Windows .cab cabinet archives in your browser — driver packages, installer payloads and update files, extracted locally with nothing uploaded.',
		h1: 'Extract CAB archives.',
		tagline: 'Open Windows CAB archives right in your browser — free.',
		related: ['/extract-iso', '/zip-files', '/extract-rar']
	},
	{
		format: 'zip',
		path: '/extract-deb',
		ogImage: '/og/extract-deb.jpg',
		label: 'Extract DEB',
		feature: 'Extract Debian packages',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.deb,application/vnd.debian.binary-package',
		dropSubject: 'DEB packages',
		dropHint: 'Debian packages · payload unpacked locally',
		title: 'Extract DEB Online — Open Debian Packages | Compress Pro',
		description:
			'Look inside .deb packages in your browser — the data payload unpacks automatically, every file its own download. No dpkg, no Linux box, no upload.',
		h1: 'Extract DEB packages.',
		tagline: 'See inside Debian .deb packages — unpacked on your device.',
		related: ['/extract-rpm', '/extract-tar-gz', '/zip-files']
	},
	{
		format: 'zip',
		path: '/extract-rpm',
		ogImage: '/og/extract-rpm.jpg',
		label: 'Extract RPM',
		feature: 'Extract RPM packages',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.rpm,application/x-rpm',
		dropSubject: 'RPM packages',
		dropHint: 'RPM packages · payload unpacked locally',
		title: 'Extract RPM Online — Open RPM Packages | Compress Pro',
		description:
			'Open .rpm packages in your browser — the cpio payload unwraps automatically to the real files. No rpm2cpio, no Linux needed, nothing uploaded.',
		h1: 'Extract RPM packages.',
		tagline: 'Open RPM packages in your browser — the payload files out.',
		related: ['/extract-deb', '/extract-cpio', '/zip-files']
	},
	{
		format: 'zip',
		path: '/extract-cpio',
		ogImage: '/og/extract-cpio.jpg',
		label: 'Extract CPIO',
		feature: 'Extract cpio archives',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.cpio,application/x-cpio',
		dropSubject: 'cpio archives',
		dropHint: 'cpio archives · extracted locally',
		title: 'Extract CPIO Online — Open cpio Archives | Compress Pro',
		description:
			'Open cpio archives in your browser — initramfs images, rpm payloads and unix backups, extracted locally with every file its own download. Free.',
		h1: 'Extract cpio archives.',
		tagline: 'Unpack cpio archives in your browser — nothing uploaded.',
		related: ['/extract-rpm', '/extract-tar-gz', '/zip-files']
	},
	{
		format: 'zip',
		path: '/extract-lha',
		ogImage: '/og/extract-lha.jpg',
		label: 'Extract LHA',
		feature: 'Extract LHA/LZH archives',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.lha,.lzh,application/x-lzh-compressed',
		dropSubject: 'LHA/LZH archives',
		dropHint: 'LHA & LZH · retro archives, extracted locally',
		title: 'Extract LHA / LZH Online — Retro Archives | Compress Pro',
		description:
			'Open LHA and LZH archives in your browser — the format of 90s Japan, Amiga scenes and retro software. Extracted locally; nothing gets uploaded.',
		h1: 'Extract LHA/LZH archives.',
		tagline: 'Open LHA and LZH archives — retro formats, done locally.',
		related: ['/extract-arj', '/zip-files', '/create-7z']
	},
	{
		format: 'zip',
		path: '/extract-arj',
		ogImage: '/og/extract-arj.jpg',
		label: 'Extract ARJ',
		feature: 'Extract ARJ archives',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.arj,application/x-arj',
		dropSubject: 'ARJ archives',
		dropHint: 'ARJ archives · DOS-era files, extracted locally',
		title: 'Extract ARJ Online — Open DOS-Era Archives | Compress Pro',
		description:
			'Open ARJ archives in your browser — the DOS-era format of BBS downloads and floppy backups. Files extract locally; nothing is ever uploaded.',
		h1: 'Extract ARJ archives.',
		tagline: 'Open ARJ archives in your browser — DOS-era files freed.',
		related: ['/extract-lha', '/create-7z', '/zip-files']
	}
];

/** Every valid `[[tool]]` slug — single source of truth for the param matcher. */
export const TOOL_SLUGS: readonly string[] = [...FORMATS, ...CONVERTERS, ...TOOLS].map((e) =>
	e.path.slice(1)
);

/** Homepage "Popular tools" grid — order is display order (curated by search
 *  demand). seo.test.ts asserts each path exists and the list stays at 12. */
export const FEATURED_PATHS: readonly string[] = [
	'/compress-pdf',
	'/compress-image',
	'/compress-jpg',
	'/compress-png',
	'/compress-video',
	'/merge-pdf',
	'/heic-to-jpg',
	'/webp-to-jpg',
	'/mov-to-mp4',
	'/mp4-to-mp3',
	'/resize-image',
	'/jpg-to-pdf'
];

/** Content-category buckets — ONE definition drives both the homepage
 *  directory grouping (title + formats) and the curated footer columns
 *  (footerPaths, display order, hub page first). seo.test.ts asserts the
 *  formats partition every FileFormat and each footer path resolves. */
export const TOOL_GROUPS: readonly {
	title: string;
	/** Column heading override where `title` wraps the narrow footer grid. */
	footerTitle?: string;
	formats: readonly FileFormat[];
	footerPaths: readonly string[];
}[] = [
	{
		title: 'Images',
		formats: ['jpg', 'png', 'webp', 'gif', 'heic', 'svg'],
		footerPaths: [
			'/compress-jpg',
			'/compress-png',
			'/compress-webp',
			'/heic-to-jpg',
			'/resize-image',
			'/compress-image'
		]
	},
	{
		title: 'Video & audio',
		formats: ['video', 'audio'],
		footerPaths: [
			'/compress-video',
			'/compress-mp4',
			'/mov-to-mp4',
			'/mp4-to-mp3',
			'/video-to-gif',
			'/compress-audio'
		]
	},
	{
		title: 'PDF',
		formats: ['pdf'],
		footerPaths: [
			'/compress-pdf',
			'/merge-pdf',
			'/split-pdf',
			'/jpg-to-pdf',
			'/pdf-to-jpg',
			'/unlock-pdf'
		]
	},
	{
		title: 'Fonts',
		formats: ['font'],
		footerPaths: [
			'/font-converter',
			'/ttf-to-woff2',
			'/woff2-to-ttf',
			'/subset-font',
			'/variable-font-to-static'
		]
	},
	{
		title: 'Archives & metadata',
		footerTitle: 'Archives',
		formats: ['zip', 'exif'],
		footerPaths: [
			'/zip-files',
			'/create-7z',
			'/extract-rar',
			'/extract-7z',
			'/gzip-files',
			'/remove-exif'
		]
	}
];

export function pathFor(format: FileFormat): string {
	// EXIF removes, ZIP archives and fonts convert rather than compress —
	// their slugs say so.
	if (format === 'exif') return '/remove-exif';
	if (format === 'zip') return '/zip-files';
	if (format === 'font') return '/font-converter';
	return `/compress-${format}`;
}

/** Resolve the seo entry for a `[[tool]]` route param (undefined → homepage). */
export function seoFor(tool: string | undefined): SeoEntry {
	if (!tool) return HOME;
	const path = `/${tool}`;
	return (
		FORMATS.find((f) => f.path === path) ??
		CONVERTERS.find((c) => c.path === path) ??
		TOOLS.find((t) => t.path === path) ??
		HOME
	);
}

/** The converter/tool entry for a route param (carries preset + accept). */
export function converterFor(tool: string | undefined): ConverterEntry | undefined {
	if (!tool) return undefined;
	const path = `/${tool}`;
	return CONVERTERS.find((c) => c.path === path) ?? TOOLS.find((t) => t.path === path);
}
