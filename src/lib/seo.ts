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
//
// It is also in EVERY page's initial chunk (layout footer, tabs, matcher), so
// each entry carries only the lite fields routing/tabs/JSON-LD need. The heavy
// per-page head/meta + intake copy (title/description/tagline/og, steps,
// related, converter preset/accept) lives in src/lib/seo-detail/ as lazy
// per-tool-group chunks, exactly like the seo-body split — `+page.ts` awaits
// the detail in `load` and hands the merged SeoEntry to the page.

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

/** The always-loaded slice of a page's seo entry — what routing, the tab bar,
 *  cross-page links (h1) and the sitewide JSON-LD featureList need. */
export interface SeoLite {
	/** null for the homepage. */
	format: FileFormat | null;
	/** URL path — '/' or '/compress-<format>'. Also the canonical path. */
	path: string;
	/** Tab label. */
	label: string;
	h1: string;
	/** Extra JSON-LD featureList line, e.g. "Convert WebP to JPG". */
	feature?: string;
	/** Renders the static before/after demo (DemoCompare) below the intro.
	 *  Each kind's assets are real output of ONE pipeline, so a page may only
	 *  carry the kind its own pipeline produced — seo.test.ts pins the
	 *  kind↔page map, `pnpm demo-assets` regenerates assets + manifest. */
	demo?: DemoKind;
}

/** The lazy-loaded rest of the entry (src/lib/seo-detail/) — head/meta copy
 *  plus everything only the page being rendered needs. `+page.ts` awaits it
 *  in `load`, so prerendered HTML and hydration always see the merged entry. */
export interface SeoDetail {
	title: string;
	description: string;
	tagline: string;
	/** "How it works" copy override — exactly three cards; FormatInfo falls
	 *  back to the generic compress-tool trio when absent. */
	steps?: [string, string, string];
	/** Curated cross-links to related tool pages (paths from FORMATS/CONVERTERS/TOOLS). */
	related?: string[];
	/** Per-page OG image path under static/ — falls back to /og.jpg. */
	ogImage?: string;
}

/** Detail slice of a converter/tool page — the preset the page applies on
 *  navigation plus the FileUpload intake copy. The intake card renders only
 *  after `load` resolved, so these can ride the lazy detail chunk. */
export interface ConverterDetail extends SeoDetail {
	/** Applied by the page on navigation to this slug. */
	preset: ConverterPreset;
	/** FileUpload picker override (e.g. AVIF page on the jpg tab). */
	accept?: string;
	dropSubject?: string;
	dropHint?: string;
}

/** A fully assembled page entry (lite ⊕ detail) — what Seo.svelte and
 *  FormatInfo consume. Assembled in `+page.ts` (lazy) / seo-full.server.ts
 *  (static, server-only); the arrays below carry only the lite slice. */
export type SeoEntry = SeoLite & SeoDetail;

/** Lite converter/tool entry — what CONVERTERS/TOOLS carry. `format` is the
 *  hosting tab (drives activeTab exactly like FORMATS entries); preset and
 *  intake copy live in the entry's ConverterDetail (seo-detail/, pinned by
 *  seo-detail/index.test.ts since it left the type level). */
export type ConverterLite = SeoLite & { format: FileFormat; feature: string };

/** A fully assembled converter/tool entry (lite ⊕ converter detail) — like
 *  the old static shape, `format` (hosting tab) and `feature` are required. */
export type ConverterEntry = ConverterLite & ConverterDetail;

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
			to: ImageFormat | 'ico' | 'svg' | 'jxl';
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
	| { kind: 'video'; container: 'mp4' | 'webm' | 'mov' | 'gif'; removeAudio?: true }
	| { kind: 'audio'; output: AudioConversionSettings['outputFormat'] }
	| { kind: 'font'; to: FontFormat }
	// Font-tab tools: 'subset' arrives on the Subset op with its defaults;
	// 'instance' additionally flips to a static-instance, keep-all-glyphs run.
	| { kind: 'font-op'; op: 'subset' | 'instance' }
	| {
			kind: 'pdf-op';
			op:
				| 'unlock'
				| 'protect'
				| 'merge'
				| 'pages'
				| 'rotate'
				| 'watermark'
				| 'pageNumbers'
				| 'toText'
				| 'grayscale'
				| 'toPdfa';
			/** Pages-op direction — /extract-pages… presets 'keep', /delete-pages…
			 *  'remove'; pages presets without it (split-pdf) normalize to 'keep'. */
			pageMode?: 'keep' | 'remove';
	  }
	// Longest-side cap across every image tab — the page's whole point, so
	// drops that re-route to their native tab (png → png) land configured.
	| { kind: 'resize'; maxDimension: number }
	// Universal image intake (/compress-image) — hosts on an image tab and
	// preconfigures nothing; the tab defaults (Auto format) are the point.
	| { kind: 'image-any' }
	// Archive tab: create-X, extract-X and X→Y converter pages all ride the
	// same tab; `to` targets create/convert (extract ignores it).
	| { kind: 'archive'; op: 'create' | 'extract' | 'convert'; to?: ArchiveOutputFormat }
	// OCR tab: /image-to-text hosts the tab default (toText); /ocr-pdf presets
	// the searchable-PDF op.
	| { kind: 'ocr'; op: 'toText' | 'toPdf' }
	// Subtitle tab: target format only — the input (SRT/VTT/ASS) is detected
	// per file, so every page converts any of the three inputs.
	| { kind: 'subtitle'; to: 'vtt' | 'srt' }
	// Ebook tab: one uniform pipeline; /cbr-to-cbz presets quality 100 so the
	// per-entry keep-original guard makes it a bit-exact container repack.
	| { kind: 'ebook'; quality?: number; to?: 'txt' | 'pdf' }
	// Data tab: one uniform pipeline, nothing to preset — the marker exists
	// because every converter detail must carry a preset (index test).
	| { kind: 'data' };

export const FORMATS: (SeoLite & { format: FileFormat })[] = [
	{
		format: 'jpg',
		path: '/compress-jpg',
		demo: 'photo',
		label: 'JPG',
		h1: 'Compress JPG images.'
	},
	{
		format: 'png',
		path: '/compress-png',
		demo: 'png',
		label: 'PNG',
		h1: 'Compress PNG images.'
	},
	{
		format: 'webp',
		path: '/compress-webp',
		demo: 'webp',
		label: 'WebP',
		h1: 'Compress WebP images.'
	},
	{
		format: 'gif',
		path: '/compress-gif',
		demo: 'gif',
		label: 'GIF',
		h1: 'Compress GIFs.'
	},
	{
		format: 'heic',
		path: '/compress-heic',
		demo: 'heic',
		label: 'HEIC',
		h1: 'Compress HEIC photos.'
	},
	{
		format: 'svg',
		path: '/compress-svg',
		demo: 'svg',
		label: 'SVG',
		h1: 'Compress SVGs.'
	},
	{
		format: 'pdf',
		path: '/compress-pdf',
		label: 'PDF',
		demo: 'pdf',
		h1: 'Compress PDFs.'
	},
	{
		format: 'video',
		path: '/compress-video',
		demo: 'video',
		label: 'Video',
		h1: 'Compress videos.',
		feature: 'Compress MP4, MOV and WebM video to a target size'
	},
	{
		format: 'audio',
		path: '/compress-audio',
		demo: 'audio',
		label: 'Audio',
		feature: 'Compress & Convert audio',
		h1: 'Compress & Convert audio.'
	},
	{
		format: 'font',
		path: '/font-converter',
		demo: 'font',
		label: 'Fonts',
		feature: 'Convert fonts — TTF, OTF, WOFF & WOFF2',
		h1: 'Convert fonts.'
	},
	{
		format: 'zip',
		path: '/zip-files',
		demo: 'archive',
		label: 'Archive',
		feature: 'Create & extract ZIP, 7Z, TAR & RAR archives',
		h1: 'Zip & Unzip files.'
	},
	{
		format: 'exif',
		path: '/remove-exif',
		demo: 'exif',
		label: 'EXIF',
		h1: 'Remove EXIF data.',
		feature: 'Remove EXIF metadata and GPS location from photos'
	},
	{
		format: 'ocr',
		path: '/image-to-text',
		demo: 'ocr',
		label: 'OCR',
		h1: 'Extract text from images.',
		feature: 'Extract text from images (OCR)'
	},
	{
		format: 'subtitle',
		path: '/srt-to-vtt',
		demo: 'subtitle',
		label: 'Subs',
		h1: 'Convert SRT to VTT.',
		feature: 'Convert subtitles between SRT, VTT and ASS'
	},
	{
		format: 'ebook',
		path: '/compress-epub',
		demo: 'ebook',
		label: 'Books',
		h1: 'Compress EPUB e-books.',
		feature: 'Compress the images inside EPUB e-books'
	},
	{
		format: 'model',
		path: '/compress-glb',
		demo: 'model',
		label: '3D',
		h1: 'Compress GLB 3D models.',
		feature: 'Compress GLB 3D models (Draco, Meshopt, textures)'
	},
	{
		format: 'data',
		path: '/csv-to-xlsx',
		demo: 'data',
		label: 'Data',
		h1: 'Convert CSV to XLSX.',
		feature: 'Convert spreadsheets and data files (CSV, XLSX, JSON, YAML)'
	}
];

export const HOME: SeoLite = {
	format: null,
	path: '/',
	label: 'Home',
	h1: 'Compress anything.'
};

// Converter landing pages — same route/component as the format tabs, but each
// URL preconfigures the tool (tab + output) and carries its own crawlable copy.
export const CONVERTERS: ConverterLite[] = [
	{
		format: 'heic',
		path: '/heic-to-jpg',
		label: 'HEIC → JPG',
		feature: 'Convert HEIC to JPG',
		h1: 'Convert HEIC to JPG.',
		// Honest reuse: the heic demo run IS a HEIC→JPG develop (q75, JPG out) —
		// the exact pipeline this page preconfigures.
		demo: 'heic'
	},
	{
		format: 'heic',
		path: '/heic-to-png',
		label: 'HEIC → PNG',
		feature: 'Convert HEIC to PNG',
		h1: 'Convert HEIC to PNG.'
	},
	{
		format: 'heic',
		path: '/heic-to-avif',
		label: 'HEIC → AVIF',
		feature: 'Convert HEIC to AVIF',
		h1: 'Convert HEIC to AVIF.'
	},
	{
		format: 'heic',
		path: '/heic-to-webp',
		label: 'HEIC → WebP',
		feature: 'Convert HEIC to WebP',
		h1: 'Convert HEIC to WebP.'
	},
	{
		format: 'webp',
		path: '/webp-to-jpg',
		label: 'WebP → JPG',
		feature: 'Convert WebP to JPG',
		h1: 'Convert WebP to JPG.',
		demo: 'webp-to-jpg'
	},
	{
		format: 'webp',
		path: '/webp-to-png',
		label: 'WebP → PNG',
		feature: 'Convert WebP to PNG',
		h1: 'Convert WebP to PNG.'
	},
	{
		format: 'gif',
		path: '/gif-to-webp',
		label: 'GIF → WebP',
		feature: 'Convert GIF to WebP',
		h1: 'Convert GIF to WebP.'
	},
	{
		format: 'jpg',
		path: '/avif-to-jpg',
		label: 'AVIF → JPG',
		feature: 'Convert AVIF to JPG',
		h1: 'Convert AVIF to JPG.'
	},
	{
		format: 'jpg',
		path: '/avif-to-png',
		label: 'AVIF → PNG',
		feature: 'Convert AVIF to PNG',
		h1: 'Convert AVIF to PNG.'
	},
	{
		format: 'jpg',
		path: '/jpg-to-avif',
		label: 'JPG → AVIF',
		feature: 'Convert JPG to AVIF',
		h1: 'Convert JPG to AVIF.'
	},
	{
		format: 'jpg',
		path: '/jxl-to-jpg',
		label: 'JXL → JPG',
		feature: 'Convert JXL to JPG',
		h1: 'Convert JXL to JPG.'
	},
	{
		format: 'jpg',
		path: '/psd-to-jpg',
		label: 'PSD → JPG',
		feature: 'Convert PSD to JPG',
		h1: 'Convert PSD to JPG.'
	},
	{
		format: 'jpg',
		path: '/psd-to-png',
		label: 'PSD → PNG',
		feature: 'Convert PSD to PNG',
		h1: 'Convert PSD to PNG.'
	},
	{
		format: 'jpg',
		path: '/jpg-to-jxl',
		label: 'JPG → JXL',
		feature: 'Convert JPG to JXL',
		h1: 'Convert JPG to JXL.'
	},
	{
		format: 'png',
		path: '/png-to-avif',
		label: 'PNG → AVIF',
		feature: 'Convert PNG to AVIF',
		h1: 'Convert PNG to AVIF.'
	},
	{
		format: 'png',
		path: '/png-to-svg',
		label: 'PNG → SVG',
		feature: 'Convert PNG to SVG',
		h1: 'Convert PNG to SVG.'
	},
	{
		format: 'jpg',
		path: '/jpg-to-svg',
		label: 'JPG → SVG',
		feature: 'Convert JPG to SVG',
		h1: 'Convert JPG to SVG.'
	},
	{
		format: 'webp',
		path: '/webp-to-avif',
		label: 'WebP → AVIF',
		feature: 'Convert WebP to AVIF',
		h1: 'Convert WebP to AVIF.'
	},
	{
		format: 'png',
		path: '/png-to-jpg',
		label: 'PNG → JPG',
		feature: 'Convert PNG to JPG',
		h1: 'Convert PNG to JPG.'
	},
	{
		format: 'jpg',
		path: '/jpg-to-webp',
		label: 'JPG → WebP',
		feature: 'Convert JPG to WebP',
		h1: 'Convert JPG to WebP.',
		demo: 'jpg-to-webp'
	},
	{
		format: 'png',
		path: '/png-to-webp',
		label: 'PNG → WebP',
		feature: 'Convert PNG to WebP',
		h1: 'Convert PNG to WebP.',
		demo: 'png-to-webp'
	},
	{
		format: 'pdf',
		path: '/jpg-to-pdf',
		label: 'JPG → PDF',
		feature: 'Convert JPG to PDF',
		h1: 'Convert JPG to PDF.'
	},
	{
		format: 'pdf',
		path: '/png-to-pdf',
		label: 'PNG → PDF',
		feature: 'Convert PNG to PDF',
		h1: 'Convert PNG to PDF.'
	},
	{
		format: 'pdf',
		path: '/pdf-to-jpg',
		label: 'PDF → JPG',
		feature: 'Convert PDF to JPG',
		h1: 'Convert PDF to JPG.'
	},
	{
		format: 'pdf',
		path: '/pdf-to-png',
		label: 'PDF → PNG',
		feature: 'Convert PDF to PNG',
		h1: 'Convert PDF to PNG.'
	},
	{
		format: 'pdf',
		path: '/pdf-to-text',
		label: 'PDF → Text',
		feature: 'Convert PDF to text',
		h1: 'Convert PDF to text.'
	},
	{
		format: 'pdf',
		path: '/pdf-to-pdfa',
		label: 'PDF → PDF/A',
		feature: 'Convert PDF to PDF/A',
		h1: 'Convert PDF to PDF/A.'
	},
	{
		format: 'video',
		path: '/mov-to-mp4',
		label: 'MOV → MP4',
		feature: 'Convert MOV to MP4',
		h1: 'Convert MOV to MP4.'
	},
	{
		format: 'video',
		path: '/webm-to-mp4',
		label: 'WebM → MP4',
		feature: 'Convert WebM to MP4',
		h1: 'Convert WebM to MP4.'
	},
	{
		format: 'video',
		path: '/mkv-to-mp4',
		label: 'MKV → MP4',
		feature: 'Convert MKV to MP4',
		h1: 'Convert MKV to MP4.'
	},
	{
		format: 'video',
		path: '/mp4-to-webm',
		label: 'MP4 → WebM',
		feature: 'Convert MP4 to WebM',
		h1: 'Convert MP4 to WebM.'
	},
	{
		format: 'video',
		path: '/video-to-gif',
		label: 'Video → GIF',
		feature: 'Convert video to GIF',
		h1: 'Convert video to GIF.'
	},
	{
		format: 'video',
		path: '/mp4-to-gif',
		label: 'MP4 → GIF',
		feature: 'Convert MP4 to GIF',
		h1: 'Convert MP4 to GIF.'
	},
	{
		format: 'video',
		path: '/gif-to-mp4',
		label: 'GIF → MP4',
		feature: 'Convert GIF to MP4',
		h1: 'Convert GIF to MP4.'
	},
	{
		format: 'audio',
		path: '/mp4-to-mp3',
		label: 'MP4 → MP3',
		feature: 'Convert MP4 to MP3',
		h1: 'Convert MP4 to MP3.'
	},
	{
		format: 'audio',
		path: '/wav-to-mp3',
		label: 'WAV → MP3',
		feature: 'Convert WAV to MP3',
		h1: 'Convert WAV to MP3.'
	},
	{
		format: 'audio',
		path: '/m4a-to-mp3',
		label: 'M4A → MP3',
		feature: 'Convert M4A to MP3',
		h1: 'Convert M4A to MP3.'
	},
	{
		format: 'audio',
		path: '/flac-to-mp3',
		label: 'FLAC → MP3',
		feature: 'Convert FLAC to MP3',
		h1: 'Convert FLAC to MP3.'
	},
	{
		format: 'audio',
		path: '/wav-to-flac',
		label: 'WAV → FLAC',
		feature: 'Convert WAV to FLAC',
		h1: 'Convert WAV to FLAC.'
	},
	{
		format: 'audio',
		path: '/opus-to-mp3',
		label: 'OPUS → MP3',
		feature: 'Convert OPUS to MP3',
		h1: 'Convert OPUS to MP3.'
	},
	{
		format: 'audio',
		path: '/ogg-to-mp3',
		label: 'OGG → MP3',
		feature: 'Convert OGG to MP3',
		h1: 'Convert OGG to MP3.'
	},
	{
		format: 'audio',
		path: '/aac-to-mp3',
		label: 'AAC → MP3',
		feature: 'Convert AAC to MP3',
		h1: 'Convert AAC to MP3.'
	},
	{
		format: 'audio',
		path: '/mp3-to-wav',
		label: 'MP3 → WAV',
		feature: 'Convert MP3 to WAV',
		h1: 'Convert MP3 to WAV.'
	},
	{
		format: 'audio',
		path: '/mp4-to-wav',
		label: 'MP4 → WAV',
		feature: 'Convert MP4 to WAV',
		h1: 'Convert MP4 to WAV.'
	},
	{
		format: 'audio',
		path: '/webm-to-mp3',
		label: 'WebM → MP3',
		feature: 'Convert WebM to MP3',
		h1: 'Convert WebM to MP3.'
	},
	{
		format: 'audio',
		path: '/mov-to-mp3',
		label: 'MOV → MP3',
		feature: 'Convert MOV to MP3',
		h1: 'Convert MOV to MP3.'
	},
	{
		format: 'audio',
		path: '/mp3-to-m4a',
		label: 'MP3 → M4A',
		feature: 'Convert MP3 to M4A',
		h1: 'Convert MP3 to M4A.'
	},
	{
		format: 'audio',
		path: '/wav-to-m4a',
		label: 'WAV → M4A',
		feature: 'Convert WAV to M4A',
		h1: 'Convert WAV to M4A.'
	},
	{
		format: 'audio',
		path: '/mp3-to-ogg',
		label: 'MP3 → OGG',
		feature: 'Convert MP3 to OGG',
		h1: 'Convert MP3 to OGG.'
	},
	{
		format: 'audio',
		path: '/wav-to-opus',
		label: 'WAV → Opus',
		feature: 'Convert WAV to Opus',
		h1: 'Convert WAV to Opus.'
	},
	{
		format: 'jpg',
		path: '/bmp-to-jpg',
		label: 'BMP → JPG',
		feature: 'Convert BMP to JPG',
		h1: 'Convert BMP to JPG.'
	},
	{
		format: 'jpg',
		path: '/bmp-to-png',
		label: 'BMP → PNG',
		feature: 'Convert BMP to PNG',
		h1: 'Convert BMP to PNG.'
	},
	{
		format: 'jpg',
		path: '/tiff-to-jpg',
		label: 'TIFF → JPG',
		feature: 'Convert TIFF to JPG',
		h1: 'Convert TIFF to JPG.'
	},
	{
		format: 'jpg',
		path: '/tiff-to-png',
		label: 'TIFF → PNG',
		feature: 'Convert TIFF to PNG',
		h1: 'Convert TIFF to PNG.'
	},
	{
		format: 'jpg',
		path: '/raw-to-jpg',
		label: 'RAW → JPG',
		feature: 'Convert RAW to JPG',
		h1: 'Convert RAW to JPG.'
	},
	{
		format: 'jpg',
		path: '/cr2-to-jpg',
		label: 'CR2 → JPG',
		feature: 'Convert CR2 to JPG',
		h1: 'Convert CR2 to JPG.'
	},
	{
		format: 'jpg',
		path: '/nef-to-jpg',
		label: 'NEF → JPG',
		feature: 'Convert NEF to JPG',
		h1: 'Convert NEF to JPG.'
	},
	{
		format: 'jpg',
		path: '/arw-to-jpg',
		label: 'ARW → JPG',
		feature: 'Convert ARW to JPG',
		h1: 'Convert ARW to JPG.'
	},
	{
		format: 'jpg',
		path: '/dng-to-jpg',
		label: 'DNG → JPG',
		feature: 'Convert DNG to JPG',
		h1: 'Convert DNG to JPG.'
	},
	{
		format: 'png',
		path: '/png-to-ico',
		label: 'PNG → ICO',
		feature: 'Convert PNG to ICO',
		h1: 'Convert PNG to ICO.'
	},
	{
		format: 'jpg',
		path: '/jpg-to-ico',
		label: 'JPG → ICO',
		feature: 'Convert JPG to ICO',
		h1: 'Convert JPG to ICO.'
	},
	{
		format: 'svg',
		path: '/svg-to-png',
		label: 'SVG → PNG',
		feature: 'Convert SVG to PNG',
		h1: 'Convert SVG to PNG.'
	},
	{
		format: 'svg',
		path: '/svg-to-ico',
		label: 'SVG → ICO',
		feature: 'Convert SVG to ICO',
		h1: 'Convert SVG to ICO.'
	},
	{
		format: 'font',
		path: '/ttf-to-woff2',
		label: 'TTF → WOFF2',
		feature: 'Convert TTF to WOFF2',
		h1: 'Convert TTF to WOFF2.',
		// Honest reuse: the font demo run is exactly TTF in → WOFF2 out.
		demo: 'font'
	},
	{
		format: 'font',
		path: '/ttf-to-woff',
		label: 'TTF → WOFF',
		feature: 'Convert TTF to WOFF',
		h1: 'Convert TTF to WOFF.'
	},
	{
		format: 'font',
		path: '/otf-to-woff2',
		label: 'OTF → WOFF2',
		feature: 'Convert OTF to WOFF2',
		h1: 'Convert OTF to WOFF2.'
	},
	{
		format: 'font',
		path: '/otf-to-woff',
		label: 'OTF → WOFF',
		feature: 'Convert OTF to WOFF',
		h1: 'Convert OTF to WOFF.'
	},
	{
		format: 'font',
		path: '/woff-to-ttf',
		label: 'WOFF → TTF',
		feature: 'Convert WOFF to TTF',
		h1: 'Convert WOFF to TTF.'
	},
	{
		format: 'font',
		path: '/woff-to-otf',
		label: 'WOFF → OTF',
		feature: 'Convert WOFF to OTF',
		h1: 'Convert WOFF to OTF.'
	},
	{
		format: 'font',
		path: '/woff-to-woff2',
		label: 'WOFF → WOFF2',
		feature: 'Convert WOFF to WOFF2',
		h1: 'Convert WOFF to WOFF2.'
	},
	{
		format: 'font',
		path: '/woff2-to-ttf',
		label: 'WOFF2 → TTF',
		feature: 'Convert WOFF2 to TTF',
		h1: 'Convert WOFF2 to TTF.'
	},
	{
		format: 'font',
		path: '/woff2-to-otf',
		label: 'WOFF2 → OTF',
		feature: 'Convert WOFF2 to OTF',
		h1: 'Convert WOFF2 to OTF.'
	},
	{
		format: 'font',
		path: '/woff2-to-woff',
		label: 'WOFF2 → WOFF',
		feature: 'Convert WOFF2 to WOFF',
		h1: 'Convert WOFF2 to WOFF.'
	},
	{
		format: 'font',
		path: '/ttf-to-eot',
		label: 'TTF → EOT',
		feature: 'Convert TTF to EOT',
		h1: 'Convert TTF to EOT.'
	},
	{
		format: 'font',
		path: '/eot-to-ttf',
		label: 'EOT → TTF',
		feature: 'Convert EOT to TTF',
		h1: 'Convert EOT to TTF.'
	},
	{
		format: 'zip',
		path: '/rar-to-zip',
		label: 'RAR → ZIP',
		feature: 'Convert RAR to ZIP',
		h1: 'Convert RAR to ZIP.'
	},
	{
		format: 'zip',
		path: '/7z-to-zip',
		label: '7Z → ZIP',
		feature: 'Convert 7Z to ZIP',
		h1: 'Convert 7Z to ZIP.'
	},
	{
		format: 'zip',
		path: '/zip-to-7z',
		label: 'ZIP → 7Z',
		feature: 'Convert ZIP to 7Z',
		h1: 'Convert ZIP to 7Z.'
	},
	{
		format: 'zip',
		path: '/tar-gz-to-zip',
		label: 'TAR.GZ → ZIP',
		feature: 'Convert TAR.GZ to ZIP',
		h1: 'Convert TAR.GZ to ZIP.'
	},
	{
		format: 'zip',
		path: '/iso-to-zip',
		label: 'ISO → ZIP',
		feature: 'Convert ISO to ZIP',
		h1: 'Convert ISO to ZIP.'
	},
	{
		format: 'zip',
		path: '/zip-to-tar-gz',
		label: 'ZIP → TAR.GZ',
		feature: 'Convert ZIP to TAR.GZ',
		h1: 'Convert ZIP to TAR.GZ.'
	},
	{
		format: 'subtitle',
		path: '/vtt-to-srt',
		label: 'VTT → SRT',
		feature: 'Convert VTT to SRT',
		h1: 'Convert VTT to SRT.'
	},
	{
		format: 'subtitle',
		path: '/ass-to-srt',
		label: 'ASS → SRT',
		feature: 'Convert ASS to SRT',
		h1: 'Convert ASS to SRT.'
	},
	{
		format: 'ebook',
		path: '/cbr-to-cbz',
		label: 'CBR → CBZ',
		feature: 'Convert CBR to CBZ',
		h1: 'Convert CBR to CBZ.'
	},
	{
		format: 'ebook',
		path: '/epub-to-txt',
		label: 'EPUB → TXT',
		feature: 'Convert EPUB to TXT',
		h1: 'Convert EPUB to TXT.'
	},
	{
		format: 'ebook',
		path: '/cbz-to-pdf',
		label: 'CBZ → PDF',
		feature: 'Convert CBZ to PDF',
		h1: 'Convert CBZ to PDF.'
	},
	{
		format: 'ebook',
		path: '/cbr-to-pdf',
		label: 'CBR → PDF',
		feature: 'Convert CBR to PDF',
		h1: 'Convert CBR to PDF.'
	},
	{
		format: 'data',
		path: '/xlsx-to-csv',
		label: 'XLSX → CSV',
		feature: 'Convert XLSX to CSV',
		h1: 'Convert XLSX to CSV.'
	},
	{
		format: 'data',
		path: '/json-to-yaml',
		label: 'JSON → YAML',
		feature: 'Convert JSON to YAML',
		h1: 'Convert JSON to YAML.'
	},
	{
		format: 'data',
		path: '/yaml-to-json',
		label: 'YAML → JSON',
		feature: 'Convert YAML to JSON',
		h1: 'Convert YAML to JSON.'
	}
];

/**
 * Standalone tool pages hosted on an existing tab (like CONVERTERS, minus the
 * "X → Y" conversion framing) — PDF ops (unlock/protect/merge/split) plus
 * standalone video and image tools.
 */
export const TOOLS: ConverterLite[] = [
	{
		format: 'pdf',
		path: '/unlock-pdf',
		label: 'Unlock PDF',
		feature: 'Unlock password-protected PDFs',
		h1: 'Unlock PDF files.'
	},
	{
		format: 'pdf',
		path: '/protect-pdf',
		label: 'Protect PDF',
		feature: 'Password-protect PDFs',
		h1: 'Password-protect PDF files.'
	},
	{
		format: 'pdf',
		path: '/merge-pdf',
		label: 'Merge PDF',
		feature: 'Merge PDFs into one document',
		h1: 'Merge PDF files.',
		demo: 'merge'
	},
	{
		format: 'pdf',
		path: '/split-pdf',
		label: 'Split PDF',
		feature: 'Split PDFs — extract or remove pages',
		h1: 'Split PDF files.'
	},
	{
		format: 'pdf',
		path: '/extract-pages-from-pdf',
		label: 'Extract PDF pages',
		feature: 'Extract pages from PDFs',
		h1: 'Extract pages from a PDF.'
	},
	{
		format: 'pdf',
		path: '/delete-pages-from-pdf',
		label: 'Delete PDF pages',
		feature: 'Delete pages from PDFs',
		h1: 'Delete pages from a PDF.'
	},
	{
		format: 'pdf',
		path: '/rotate-pdf',
		label: 'Rotate PDF',
		feature: 'Rotate PDF pages',
		h1: 'Rotate PDF pages.'
	},
	{
		format: 'pdf',
		path: '/watermark-pdf',
		label: 'Watermark PDF',
		feature: 'Watermark PDFs with custom text',
		h1: 'Watermark PDF files.'
	},
	{
		format: 'pdf',
		path: '/pdf-page-numbers',
		label: 'Page numbers',
		feature: 'Add page numbers to PDFs',
		h1: 'Add page numbers to PDFs.'
	},
	{
		format: 'pdf',
		path: '/grayscale-pdf',
		label: 'Grayscale PDF',
		feature: 'Convert PDFs to grayscale',
		h1: 'Convert PDFs to grayscale.'
	},
	{
		format: 'video',
		path: '/compress-mp4',
		demo: 'video',
		label: 'Compress MP4',
		feature: 'Compress MP4 video to a size limit',
		h1: 'Compress MP4 videos.'
	},
	{
		format: 'video',
		path: '/compress-mov',
		label: 'Compress MOV',
		feature: 'Compress MOV (QuickTime) video',
		h1: 'Compress MOV videos.'
	},
	{
		format: 'video',
		path: '/remove-audio-from-video',
		label: 'Remove audio',
		feature: 'Remove the audio track from videos',
		h1: 'Remove audio from video.'
	},
	{
		format: 'ocr',
		path: '/ocr-pdf',
		label: 'OCR PDF',
		feature: 'Make scanned PDFs searchable',
		h1: 'Make scanned PDFs searchable.'
	},
	{
		format: 'jpg',
		path: '/resize-image',
		label: 'Resize image',
		feature: 'Resize images to a longest-side cap',
		h1: 'Resize images.',
		demo: 'resize'
	},
	{
		format: 'jpg',
		path: '/compress-image',
		demo: 'photo',
		label: 'Image compressor',
		feature: 'Compress any image format',
		h1: 'Compress images.'
	},
	{
		format: 'jpg',
		path: '/compress-jpg-to-100kb',
		label: 'JPG to 100 KB',
		feature: 'Compress JPG photos to 100 KB',
		h1: 'Compress JPG to 100 KB.'
	},
	{
		format: 'jpg',
		path: '/compress-avif',
		label: 'Compress AVIF',
		feature: 'Compress AVIF images',
		h1: 'Compress AVIF images.'
	},
	{
		format: 'jpg',
		path: '/compress-jxl',
		label: 'Compress JXL',
		feature: 'Compress JPEG XL images',
		h1: 'Compress JXL images.'
	},
	{
		format: 'ebook',
		path: '/compress-cbz',
		label: 'Compress CBZ',
		feature: 'Compress CBZ comic archives',
		h1: 'Compress CBZ comics.'
	},
	{
		format: 'font',
		path: '/subset-font',
		label: 'Subset font',
		feature: 'Subset fonts — keep only the characters you use',
		h1: 'Subset fonts.'
	},
	{
		format: 'font',
		path: '/variable-font-to-static',
		label: 'Variable → static',
		feature: 'Pin variable font axes to a static instance',
		h1: 'Variable font to static.'
	},
	{
		format: 'zip',
		path: '/create-7z',
		label: 'Create 7Z',
		feature: 'Create 7Z archives',
		h1: 'Create 7Z archives.',
		// Honest reuse: the archive demo's primary number is its create-7Z run
		// (Balanced preset) — the operation this page preconfigures.
		demo: 'archive'
	},
	{
		format: 'zip',
		path: '/protect-zip',
		label: 'Protect ZIP',
		feature: 'Password-protect ZIP archives',
		h1: 'Password-protect ZIP files.'
	},
	{
		format: 'zip',
		path: '/protect-7z',
		label: 'Protect 7Z',
		feature: 'Password-protect 7Z archives',
		h1: 'Password-protect 7Z archives.'
	},
	{
		format: 'zip',
		path: '/create-tar',
		label: 'Create TAR',
		feature: 'Create TAR archives',
		h1: 'Create TAR archives.'
	},
	{
		format: 'zip',
		path: '/create-tar-gz',
		label: 'Create TAR.GZ',
		feature: 'Create TAR.GZ tarballs',
		h1: 'Create TAR.GZ tarballs.'
	},
	{
		format: 'zip',
		path: '/create-tar-bz2',
		label: 'Create TAR.BZ2',
		feature: 'Create TAR.BZ2 tarballs',
		h1: 'Create TAR.BZ2 tarballs.'
	},
	{
		format: 'zip',
		path: '/create-tar-xz',
		label: 'Create TAR.XZ',
		feature: 'Create TAR.XZ tarballs',
		h1: 'Create TAR.XZ tarballs.'
	},
	{
		format: 'zip',
		path: '/gzip-files',
		label: 'Gzip',
		feature: 'Gzip individual files',
		h1: 'Gzip files.'
	},
	{
		format: 'zip',
		path: '/bzip2-files',
		label: 'Bzip2',
		feature: 'Bzip2 individual files',
		h1: 'Bzip2 files.'
	},
	{
		format: 'zip',
		path: '/xz-files',
		label: 'XZ',
		feature: 'XZ-compress individual files',
		h1: 'XZ-compress files.'
	},
	{
		format: 'zip',
		path: '/extract-rar',
		label: 'Extract RAR',
		feature: 'Extract RAR archives',
		h1: 'Extract RAR archives.'
	},
	{
		format: 'zip',
		path: '/extract-7z',
		label: 'Extract 7Z',
		feature: 'Extract 7Z archives',
		h1: 'Extract 7Z archives.'
	},
	{
		format: 'zip',
		path: '/extract-tar-gz',
		label: 'Extract TAR.GZ',
		feature: 'Extract TAR.GZ tarballs',
		h1: 'Extract TAR.GZ tarballs.'
	},
	{
		format: 'zip',
		path: '/extract-gz',
		label: 'Extract GZ',
		feature: 'Decompress .gz files',
		h1: 'Extract GZ files.'
	},
	{
		format: 'zip',
		path: '/extract-z',
		label: 'Extract Z',
		feature: 'Decompress unix .Z files',
		h1: 'Extract .Z files.'
	},
	{
		format: 'zip',
		path: '/extract-iso',
		label: 'Extract ISO',
		feature: 'Extract ISO disc images',
		h1: 'Extract ISO images.'
	},
	{
		format: 'zip',
		path: '/extract-cab',
		label: 'Extract CAB',
		feature: 'Extract CAB archives',
		h1: 'Extract CAB archives.'
	},
	{
		format: 'zip',
		path: '/extract-deb',
		label: 'Extract DEB',
		feature: 'Extract Debian packages',
		h1: 'Extract DEB packages.'
	},
	{
		format: 'zip',
		path: '/extract-rpm',
		label: 'Extract RPM',
		feature: 'Extract RPM packages',
		h1: 'Extract RPM packages.'
	},
	{
		format: 'zip',
		path: '/extract-cpio',
		label: 'Extract CPIO',
		feature: 'Extract cpio archives',
		h1: 'Extract cpio archives.'
	},
	{
		format: 'zip',
		path: '/extract-lha',
		label: 'Extract LHA',
		feature: 'Extract LHA/LZH archives',
		h1: 'Extract LHA/LZH archives.'
	},
	{
		format: 'zip',
		path: '/extract-arj',
		label: 'Extract ARJ',
		feature: 'Extract ARJ archives',
		h1: 'Extract ARJ archives.'
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
	/** The group's category hub page — flat literals (validate-seo greps them). */
	categoryPath: string;
	categoryLabel: string;
	formats: readonly FileFormat[];
	footerPaths: readonly string[];
}[] = [
	{
		title: 'Images',
		categoryPath: '/image-tools',
		categoryLabel: 'Image tools',
		formats: ['jpg', 'png', 'webp', 'gif', 'heic', 'svg', 'ocr'],
		footerPaths: [
			'/compress-jpg',
			'/compress-png',
			'/compress-webp',
			'/heic-to-jpg',
			'/jpg-to-avif',
			'/resize-image',
			'/compress-image'
		]
	},
	{
		title: 'Video & audio',
		categoryPath: '/video-audio-tools',
		categoryLabel: 'Video & audio tools',
		formats: ['video', 'audio', 'subtitle'],
		footerPaths: [
			'/compress-video',
			'/compress-mp4',
			'/mov-to-mp4',
			'/mp4-to-mp3',
			'/video-to-gif',
			'/compress-audio',
			'/srt-to-vtt'
		]
	},
	{
		title: 'PDF',
		categoryPath: '/pdf-tools',
		categoryLabel: 'PDF tools',
		formats: ['pdf'],
		footerPaths: [
			'/compress-pdf',
			'/merge-pdf',
			'/split-pdf',
			'/rotate-pdf',
			'/jpg-to-pdf',
			'/pdf-to-jpg',
			'/unlock-pdf'
		]
	},
	{
		title: 'Fonts',
		categoryPath: '/font-tools',
		categoryLabel: 'Font tools',
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
		categoryPath: '/archive-tools',
		categoryLabel: 'Archive & data tools',
		// 'model' and 'data' ride here as the misc bucket (footer picks are
		// full at 7 — their hubs are reachable via the homepage directory).
		formats: ['zip', 'exif', 'ebook', 'model', 'data'],
		footerPaths: [
			'/zip-files',
			'/create-7z',
			'/extract-rar',
			'/extract-7z',
			'/gzip-files',
			'/remove-exif',
			'/compress-epub'
		]
	}
];

/** Category hub slugs (no leading slash) — the `[category=category]` route's
 *  param set. Deliberately disjoint from TOOL_SLUGS; src/params tests pin it. */
export const CATEGORY_SLUGS: readonly string[] = TOOL_GROUPS.map((g) => g.categoryPath.slice(1));

/** The TOOL_GROUPS entry hosting a format — every FileFormat is in exactly one
 *  group (pinned by seo.test.ts), so this never legitimately returns undefined. */
export function categoryFor(format: FileFormat): (typeof TOOL_GROUPS)[number] {
	const group = TOOL_GROUPS.find((g) => g.formats.includes(format));
	if (!group) throw new Error(`categoryFor: ${format} is in no TOOL_GROUPS bucket`);
	return group;
}

export function pathFor(format: FileFormat): string {
	// EXIF removes, ZIP archives and fonts convert rather than compress —
	// their slugs say so.
	if (format === 'exif') return '/remove-exif';
	if (format === 'zip') return '/zip-files';
	if (format === 'font') return '/font-converter';
	if (format === 'ocr') return '/image-to-text';
	if (format === 'subtitle') return '/srt-to-vtt';
	if (format === 'ebook') return '/compress-epub';
	if (format === 'model') return '/compress-glb';
	if (format === 'data') return '/csv-to-xlsx';
	return `/compress-${format}`;
}

/** Resolve the lite seo entry for a `[[tool]]` route param (undefined →
 *  homepage). The heavy rest is `await seoDetailFor(tool)` (seo-detail/). */
export function seoFor(tool: string | undefined): SeoLite {
	if (!tool) return HOME;
	const path = `/${tool}`;
	return (
		FORMATS.find((f) => f.path === path) ??
		CONVERTERS.find((c) => c.path === path) ??
		TOOLS.find((t) => t.path === path) ??
		HOME
	);
}

/** The lite converter/tool entry for a route param — hosting tab + labels;
 *  the preset/accept it applies live in its lazy ConverterDetail. */
export function converterFor(tool: string | undefined): ConverterLite | undefined {
	if (!tool) return undefined;
	const path = `/${tool}`;
	return CONVERTERS.find((c) => c.path === path) ?? TOOLS.find((t) => t.path === path);
}
