export type FileFormat =
	| 'jpg'
	| 'png'
	| 'webp'
	| 'gif'
	| 'heic'
	| 'svg'
	| 'pdf'
	| 'video'
	| 'audio'
	| 'font'
	| 'zip'
	| 'exif'
	| 'ocr'
	| 'subtitle'
	| 'ebook'
	| 'model'
	| 'data';

/** The raster-image pipeline tabs — one family: shared worker pool, shared
 *  ImageCompressionSettings. familyOf(), the CTA labels, the concurrency
 *  planner and the resize preset all key off this set. (Distinct from
 *  ImageFormat, which is the *output* encoder enum.) */
export const IMAGE_FORMATS = [
	'jpg',
	'png',
	'webp',
	'gif',
	'heic'
] as const satisfies readonly FileFormat[];
export type ImageFileFormat = (typeof IMAGE_FORMATS)[number];

export function isImageFormat(format: FileFormat): format is ImageFileFormat {
	return (IMAGE_FORMATS as readonly FileFormat[]).includes(format);
}

/** Static before/after demo kinds — each page may only show output its own
 *  pipeline produced (seo.test.ts pins the kind↔page map, `pnpm demo-assets`
 *  regenerates the assets + manifest through the real tools). */
export type DemoKind =
	| 'photo'
	| 'png'
	| 'webp'
	| 'heic'
	| 'gif'
	| 'svg'
	| 'pdf'
	| 'video'
	| 'audio'
	| 'font'
	| 'archive'
	| 'exif'
	| 'ocr'
	| 'subtitle'
	| 'ebook'
	| 'model'
	| 'data'
	| 'png-to-webp'
	| 'jpg-to-webp'
	| 'webp-to-jpg'
	| 'resize'
	| 'merge';

export interface DemoCredit {
	author: string;
	url: string;
	source:
		| 'Unsplash'
		| 'Wikimedia Commons'
		| 'NASA'
		| 'Openclipart'
		| 'Magnific'
		| 'HEIC Digital'
		| 'Pixabay'
		| 'Google Fonts'
		| 'Project Gutenberg'
		| 'Poly Haven';
	/** Present for public-domain works — rendered as "— {license}." instead of
	 *  "on {source}." (there is no author to credit, only a work to cite). */
	license?: string;
}

/** One entry of src/lib/demo-stats.json — written only by the generator. */
export interface DemoStats {
	tool: string;
	engine: string;
	quality?: number;
	precision?: number;
	/** pdf: the preset pill the run was pinned to (quality has no meaning). */
	level?: string;
	/** audio: the bitrate pill the run was pinned to (quality has no meaning). */
	bitrateKbps?: number;
	/** video: the max-dimension pin of the run — the resize is part of the
	 *  result the caption narrates (4K in, 1080p out), not a display choice. */
	maxDimension?: number;
	outputFormat: string;
	/** heic: the output is a different format than the input — the caption
	 *  must present the conversion as part of the result. */
	formatChanged?: boolean;
	/** Raster kinds carry width/height/megapixels; pdf carries pages; video
	 *  adds duration/fps. The kind-specific guards in demo-stats.test.ts
	 *  enforce presence per kind. */
	input: {
		name: string;
		width?: number;
		height?: number;
		megapixels?: number;
		pages?: number;
		durationSec?: number;
		fps?: number;
	};
	originalBytes: number;
	compressedBytes: number;
	savingsPercent: number;
	display: {
		before: string;
		after: string;
		width: number;
		height: number;
		/** 'render' = the full frame is a derived raster of the file (model
		 *  stills, ocr scan) — nothing was cropped and the asset is not the
		 *  measured file itself. */
		shows: 'crop' | 'frame' | 'file' | 'render';
		crop?: { left: number; top: number; width: number; height: number };
		frame?: { index: number; ofFrames: number };
		/** pdf: the raster frame the crop was cut from — one page of the
		 *  document rendered by the app's own pdf.js at this resolution.
		 *  ebook: the decoded in-container illustration the crop was cut from
		 *  (page = its ordinal among the images; dpi has no meaning there). */
		render?: { page: number; width: number; height: number; dpi?: number };
		/** gif: a live animated preview from a SECOND real tool run (quality +
		 *  resize) — its own honest numbers, small enough to ship. */
		anim?: { file: string; bytes: number; maxDimension: number };
		/** video: the shared timestamp both slider stills were rasterized at —
		 *  the video analog of pdf's `render` provenance. */
		still?: { atSec: number };
		/** video: a playable preview from a SECOND real tool run (quality +
		 *  resize; gif-anim precedent) — width/height are the clip's real output
		 *  dimensions, `poster` a committed frame so preload="none" costs no
		 *  video bytes until play. */
		clip?: {
			file: string;
			bytes: number;
			maxDimension: number;
			width: number;
			height: number;
			quality: number;
			poster: string;
		};
		/** archive: the folder manifest (each entry is a committed fixture) and
		 *  the SECOND real run's ZIP size — 7Z is the primary numbers. */
		archive?: { entries: { name: string; bytes: number }[]; zipBytes: number };
		/** exif: the curated metadata the tool found and removed — extracted by
		 *  the app's own parser (src/lib/codecs/exif-parse). */
		metadata?: { camera: string | null; taken: string | null; gps: string | null; fields: number };
		/** Text kinds carry the actual file text verbatim in the manifest —
		 *  subtitle ships both sides, ocr only the recognized output, data only
		 *  the CSV input (the XLSX side renders from `sheet`). */
		text?: { before?: string; after?: string };
		/** ocr: recognized-word count + language of the run — the .txt size the
		 *  tiles cite is compressedBytes (the downloaded file). */
		ocr?: { words: number; lang: string };
		/** subtitle: cue count and the from→to formats of the run. */
		subtitle?: { cues: number; from: string; to: string };
		/** data: the rows read back from the DOWNLOADED xlsx (SheetJS in the
		 *  generator) — row 0 is the header row. */
		sheet?: { rows: (string | number)[][] };
		/** model: geometry/texture stats of the run + the pins the caption
		 *  narrates (codec, and the Max-texture-size pill the run set — the
		 *  guide's own "usual culprit" fix; audio-bitrate precedent). */
		model?: {
			triangles: number;
			vertices: number;
			texturesChanged: number;
			texturesTotal: number;
			codec: 'draco' | 'meshopt';
			textureMaxDimension: number | null;
		};
		/** ebook/model: which archive entry (ebook) or rendered view (model) the
		 *  display pair was derived from. */
		entryName?: string;
		/** merge: the uploaded documents (each a committed fixture) and the
		 *  merged output's total page count — the demo is this table, no assets. */
		merge?: { files: { name: string; pages: number; bytes: number }[]; pages: number };
	};
	credit?: DemoCredit;
}

export interface UploadedFile {
	id: string;
	file: File;
	name: string;
	size: number;
	objectUrl: string;
}

export interface CompressedFile {
	id: string;
	name: string;
	originalSize: number;
	compressedSize: number;
	blob: Blob;
	objectUrl: string;
	savings: number;
	warning: string | null;
	/** Neutral per-file note (e.g. what the EXIF tab found) — not an alert. */
	info: string | null;
	/** True when the Auto output format actually changed this file's format —
	 * drives the row's format badge. Absent on non-image pipelines. */
	autoConverted?: boolean;
}

/** One file that failed during a run — the rest of the batch continues. */
export interface FileFailure {
	id: string;
	name: string;
	error: string;
}

export type ImageFormat = 'jpg' | 'png' | 'webp' | 'gif' | 'avif';

export interface ImageCompressionSettings {
	/** 1-100. PNG: 100 = lossless (oxipng only), <100 = palette quantization + oxipng. */
	quality: number;
	/** 'auto' = smallest of JPG/WebP per image (alpha/animation stay WebP).
	 *  'ico' = multi-size favicon — an Output pill on the JPG/PNG tabs, preset
	 *  by the /png-to-ico and /jpg-to-ico pages.
	 *  'svg' = vtracer vectorization — JPG/PNG tabs only, preset by the
	 *  /png-to-svg and /jpg-to-svg pages.
	 *  'jxl' = JPEG XL — preset-only (Chrome can't render it, so no sitewide
	 *  pill), set by /jpg-to-jxl and /compress-jxl. */
	outputFormat: ImageFormat | 'auto' | 'ico' | 'svg' | 'jxl';
	mode: 'quality' | 'target';
	/** Target size in KB (SI, 1 KB = 1000 B — the safe reading of upload limits). */
	targetKb: number;
	/** Longest-side cap in px, downscale-only; null = off. */
	maxDimension: number | null;
	/** Target mode only, opt-in: when quality alone can't reach the target,
	 *  search smaller dimensions at q75 (never below 320 px longest side). */
	downscaleToTarget: boolean;
	/** Copy source EXIF (date, camera, GPS) into JPG/PNG/WebP outputs.
	 *  ICC is never copied — pixels are sRGB after decode/conversion. */
	keepMetadata: boolean;
	/** SVG output only: color vectorization vs black & white stencil. */
	vectorMode: 'color' | 'bw';
	/** SVG output only, 0-100 — one dial mapped onto vtracer's parameters
	 *  (see codecs/vectorize.ts vectorizeParams). */
	vectorDetail: number;
}

export interface SvgCompressionSettings {
	removeComments: boolean;
	removeMetadata: boolean;
	cleanupIds: boolean;
	removeDimensions: boolean;
	precision: number;
	aggressive: boolean;
	/** 'svg' = SVGO optimize (default); 'png'/'ico' render the vector and
	 *  encode via the image worker. */
	outputFormat: 'svg' | 'png' | 'ico';
	/** PNG output only: longest side of the render in px (ICO renders at 256). */
	rasterSize: number;
	/** PNG output only: 100 = lossless, <100 = palette quantization. */
	quality: number;
}

export type PdfLevel = 'low' | 'medium' | 'high' | 'ultra' | 'extreme';

export type PdfOp =
	| 'compress'
	| 'merge'
	| 'pages'
	| 'toImages'
	| 'fromImages'
	| 'unlock'
	| 'protect'
	| 'rotate'
	| 'watermark'
	| 'pageNumbers'
	| 'toText'
	| 'grayscale'
	| 'toPdfa';

export interface PdfCompressionSettings {
	op: PdfOp;
	mode: 'level' | 'target';
	level: PdfLevel;
	/** Target size in MB (SI, 1 MB = 1,000,000 B — the safe reading of upload limits). */
	targetMb: number;
	/** Merge op: run the merged PDF through gs compression afterwards. */
	mergeCompress: boolean;
	/** Pages op: e.g. "1-3,7,12-". */
	pageRange: string;
	pageMode: 'keep' | 'remove';
	/** To-images op. imageQuality is also the from-images JPEG re-encode quality. */
	imageDpi: 72 | 150 | 300;
	imageFormat: 'jpg' | 'png';
	imageQuality: number;
	/** Unlock/protect ops — RUNTIME ONLY: stripped before persisting and never
	 *  merged back from storage (see serializeSettings / mergePdf). */
	password: string;
	/** Rotate op: clockwise degrees applied to every page. */
	rotation: 90 | 180 | 270;
	/** Watermark op: the diagonal stamp text (persisted — not a secret). */
	watermarkText: string;
}

export interface VideoConversionSettings {
	/** 'gif' turns the tab into a video→GIF converter (silent, palette-based). */
	container: 'mp4' | 'webm' | 'mov' | 'gif';
	mode: 'quality' | 'target';
	/** 1-100, mapped to a bitrate from resolution and frame rate (GIF: palette size). */
	quality: number;
	/** Target size in MB (SI, 1 MB = 1,000,000 B — the safe reading of upload limits). */
	targetMb: number;
	/** Longest-side cap in px, downscale-only; null = off. */
	maxDimension: number | null;
	/** Frame-rate cap; 'original' keeps the source rate (downscale-only).
	 *  15/10/5 exist for GIF output, where high fps balloons the file. */
	fps: 'original' | 60 | 30 | 15 | 10 | 5;
	removeAudio: boolean;
}

export interface AudioConversionSettings {
	/** 'opus' and 'ogg' are both Ogg/Opus under the hood — they differ only in
	 *  the extension users ask for; 'weba' is Opus in an audio-only WebM. */
	outputFormat: 'mp3' | 'm4a' | 'wav' | 'ogg' | 'flac' | 'opus' | 'weba';
	mode: 'quality' | 'target';
	/** Requested bitrate in kbps for lossy outputs (WAV/FLAC are lossless — ignored).
	 *  MP3 encodes true CBR; AAC/Opus run the encoder's VBR targeting this
	 *  rate — real content lands within ~10% (measured 2026-07-11), trivial
	 *  content (tones/silence) legitimately undershoots. */
	bitrateKbps: 320 | 256 | 192 | 128 | 96 | 64;
	/** Target size in MB (SI, 1 MB = 1,000,000 B — the safe reading of upload limits). */
	targetMb: number;
}

/** Lossless audio outputs — no bitrate to steer, so the bitrate/target knobs,
 *  size estimate and target-mode CTA gate all switch off for these. */
export const LOSSLESS_AUDIO_FORMATS: readonly AudioConversionSettings['outputFormat'][] = [
	'wav',
	'flac'
];

export function isLosslessAudioFormat(format: AudioConversionSettings['outputFormat']): boolean {
	return LOSSLESS_AUDIO_FORMATS.includes(format);
}

/** Font containers the font tab converts between. 'ttf'/'otf' are the two
 *  sfnt flavors (TrueType glyf vs PostScript CFF outlines) — conversion keeps
 *  the actual flavor, so the real output format can differ from the request
 *  (see the flavor rule in font.worker.ts). */
export const FONT_FORMATS = ['ttf', 'otf', 'woff', 'woff2', 'eot'] as const;
export type FontFormat = (typeof FONT_FORMATS)[number];

export type FontOp = 'convert' | 'subset';

export interface FontConversionSettings {
	op: FontOp;
	/** Target container — shared by both ops. */
	outputFormat: FontFormat;
	/** Subset op: preset ids from SUBSET_PRESETS. Empty presets + empty text
	 *  = keep every glyph (pure instance/repackage — /variable-font-to-static). */
	subsetPresets: string[];
	/** Subset op: exact characters to keep, unioned with the presets. */
	subsetText: string;
	/** Subset op: keep TrueType hinting bytecode (fpgm/prep/cvt). */
	keepHinting: boolean;
	/** Variable fonts under the subset op: keep the axes, or pin a static instance. */
	variableMode: 'keep' | 'static';
	/** Static mode per-axis pins keyed by fvar tag — RUNTIME ONLY: per-font
	 *  values, not preferences. Stripped before persisting and never merged
	 *  back (see serializeSettings / mergeFont), like pdf.password. */
	axisValues: Record<string, number>;
}

/** Archive-tab output targets. zip/7z/tar/tgz/tbz2/txz bundle every input into
 *  ONE archive; gz/bz2/xz are single-stream formats — one output per input. */
export type ArchiveOutputFormat =
	'zip' | '7z' | 'tar' | 'tgz' | 'tbz2' | 'txz' | 'gz' | 'bz2' | 'xz';

export const BUNDLING_ARCHIVE_FORMATS = [
	'zip',
	'7z',
	'tar',
	'tgz',
	'tbz2',
	'txz'
] as const satisfies readonly ArchiveOutputFormat[];

export function isBundlingArchiveFormat(
	format: ArchiveOutputFormat
): format is (typeof BUNDLING_ARCHIVE_FORMATS)[number] {
	return (BUNDLING_ARCHIVE_FORMATS as readonly ArchiveOutputFormat[]).includes(format);
}

export interface ZipSettings {
	op: 'create' | 'extract' | 'convert';
	/** Create/convert target. gz/bz2/xz are single-stream formats (one output
	 *  per input) — create only; convert snaps them back to a bundling format. */
	outputFormat: ArchiveOutputFormat;
	/** 0 = store, 9 = smallest. Plain-zip creates use it as the fflate deflate
	 *  level; every 7zz path maps it onto -mx0/1/5/9. */
	level: 0 | 1 | 6 | 9;
	/** Create: encrypt (ZIP/7Z, AES-256). Extract/convert: decrypt the source.
	 *  RUNTIME ONLY: stripped before persisting and never merged back (the
	 *  pdf.password treatment — see serializeSettings / mergeZip). */
	password: string;
	/** 7Z create only: also encrypt the file list (-mhe=on). Persisted — it's a
	 *  preference, not a secret; it only takes effect alongside a password. */
	encryptNames: boolean;
}

export interface ExifSettings {
	/** ICC affects color rendering, so it stays unless explicitly removed. */
	removeIcc: boolean;
}

/** Self-hosted tessdata languages (static/tessdata/<code>.traineddata.gz). */
export const OCR_LANGUAGES = [
	{ code: 'eng', label: 'English' },
	{ code: 'slv', label: 'Slovenščina' },
	{ code: 'deu', label: 'Deutsch' },
	{ code: 'ita', label: 'Italiano' },
	{ code: 'fra', label: 'Français' },
	{ code: 'spa', label: 'Español' },
	{ code: 'por', label: 'Português' },
	{ code: 'hrv', label: 'Hrvatski' }
] as const;

export interface OcrSettings {
	/** 'toText' = image → .txt; 'toPdf' = scanned PDF → searchable PDF. */
	op: 'toText' | 'toPdf';
	/** tessdata language code — one of OCR_LANGUAGES. */
	language: string;
}

export interface SubtitleSettings {
	/** Target format — the input (SRT/VTT/ASS) is detected per file from content. */
	to: 'vtt' | 'srt';
}

/** CSV/XLSX/JSON/YAML converter — one uniform op: input detected from
 *  content, target implied (csv→xlsx, xlsx→csv, json→yaml, yaml→json). */
export interface DataSettings {
	/** Field separator for CSV OUTPUT (xlsx → csv); input is always sniffed.
	 *  ';' matters for EU Excel locales. */
	csvDelimiter: ',' | ';' | 'tab';
	/** JSON OUTPUT indent (yaml → json). 0 = minified. */
	jsonIndent: 2 | 0;
}

/** GLB 3D models — geometry codec + optional simplify + embedded textures. */
export interface ModelSettings {
	/** Geometry codec. 'none' = maximum-compatibility output (no decoder needed). */
	compression: 'none' | 'draco' | 'meshopt';
	/** Triangle keep-ratio %, 1..100; null = off (destructive when on). */
	simplify: number | null;
	/** 1-100 JPEG re-encode quality for embedded textures (PNGs resize-only). */
	textureQuality: number;
	/** Longest-side cap for embedded textures; null = off. */
	textureMaxDimension: number | null;
}

/** EPUB/CBZ/CBR — images inside the container are re-encoded in their own
 *  format; per-entry keep-original guards mean q100 ≈ bit-exact repack. */
export interface EbookSettings {
	/** 1-100 for the raster images inside (jpg/png/webp). */
	quality: number;
	/** Longest-side cap in px for those images, downscale-only; null = off. */
	maxDimension: number | null;
	/** Output: 'auto' recompresses the container (epub→epub, cbz/cbr→cbz);
	 *  'txt' extracts EPUB text; 'pdf' builds a PDF from comic pages. */
	to: 'auto' | 'txt' | 'pdf';
}

/** Per-tab settings with the concrete type per key (no cast needed for e.g. `.pdf`). */
export interface SettingsMap {
	jpg: ImageCompressionSettings;
	png: ImageCompressionSettings;
	webp: ImageCompressionSettings;
	gif: ImageCompressionSettings;
	heic: ImageCompressionSettings;
	svg: SvgCompressionSettings;
	pdf: PdfCompressionSettings;
	video: VideoConversionSettings;
	audio: AudioConversionSettings;
	font: FontConversionSettings;
	zip: ZipSettings;
	exif: ExifSettings;
	ocr: OcrSettings;
	subtitle: SubtitleSettings;
	ebook: EbookSettings;
	model: ModelSettings;
	data: DataSettings;
}

/** Per-file progress reported by compressFiles. */
export interface ProgressInfo {
	fileIndex: number;
	fileCount: number;
	fileName: string;
	/** Best-effort 0..1 fraction within the current file. */
	fileFraction: number;
	/** Human-readable detail, e.g. "page 12/48" or "attempt 2/4 — 2.4 MB". */
	detail: string | null;
	stage: 'processing' | 'done' | 'error';
}

/** One row's live status while a run is active (files fan out in parallel). */
export interface FileProgress {
	fraction: number;
	stage: 'queued' | 'processing' | 'done' | 'error';
}

export interface TabState {
	files: UploadedFile[];
	results: CompressedFile[];
	/** Files that failed in the last run (aligned to results by id, not index). */
	failures: FileFailure[];
	/** Single output produced from ALL inputs (PDF merge / images→PDF). */
	combinedResult: CompressedFile | null;
	isCompressing: boolean;
	progress: number;
	/** Live per-file progress detail while compressing (null when idle). */
	progressInfo: ProgressInfo | null;
	/** Aligned to `files` while compressing; empty when idle. */
	fileProgress: FileProgress[];
	/** Files already finished DURING the current run (same object references
	 * that land in `results` afterwards — never revoke these separately). */
	finished: CompressedFile[];
	/** Smoothed seconds-remaining estimate while compressing (null when idle
	 * or too early to be meaningful). */
	etaSeconds: number | null;
	error: string | null;
}

export type ThemeMode = 'system' | 'light' | 'dark';
