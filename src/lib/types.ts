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
	| 'exif';

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
	 *  by the /png-to-ico and /jpg-to-ico pages. */
	outputFormat: ImageFormat | 'auto' | 'ico';
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
	'compress' | 'merge' | 'pages' | 'toImages' | 'fromImages' | 'unlock' | 'protect';

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

export interface ZipSettings {
	op: 'create' | 'extract';
	/** Deflate level for create — 0 = store, 9 = smallest. */
	level: 0 | 1 | 6 | 9;
}

export interface ExifSettings {
	/** ICC affects color rendering, so it stays unless explicitly removed. */
	removeIcc: boolean;
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
