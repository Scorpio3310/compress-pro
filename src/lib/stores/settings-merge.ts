import type {
	AudioConversionSettings,
	ZipSettings,
	ImageCompressionSettings,
	PdfCompressionSettings,
	SettingsMap,
	SvgCompressionSettings,
	VideoConversionSettings
} from '$lib/types';

/** Single source of the per-tab defaults (previously inline in +page.svelte). */
export function defaultSettings(): SettingsMap {
	const imageDefaults = {
		quality: 80,
		mode: 'quality' as const,
		targetKb: 500,
		maxDimension: null,
		downscaleToTarget: false,
		keepMetadata: false
	};
	return {
		// jpg/png/webp default to Auto (smallest of JPG/WebP per image); the GIF
		// tab stays gif-centric and HEIC keeps its convert-to-JPG default.
		jpg: { ...imageDefaults, outputFormat: 'auto' },
		png: { ...imageDefaults, outputFormat: 'auto' },
		webp: { ...imageDefaults, outputFormat: 'auto' },
		gif: { ...imageDefaults, outputFormat: 'gif' },
		heic: { ...imageDefaults, outputFormat: 'jpg' },
		svg: {
			removeComments: true,
			removeMetadata: true,
			cleanupIds: true,
			removeDimensions: false,
			precision: 3,
			aggressive: false,
			outputFormat: 'svg',
			rasterSize: 1024,
			quality: 100
		},
		pdf: {
			op: 'compress',
			mode: 'level',
			level: 'medium',
			targetMb: 2,
			mergeCompress: false,
			pageRange: '',
			pageMode: 'keep',
			imageDpi: 150,
			imageFormat: 'jpg',
			imageQuality: 85,
			password: ''
		},
		video: {
			container: 'mp4',
			mode: 'quality',
			quality: 75,
			targetMb: 25,
			maxDimension: null,
			fps: 'original',
			removeAudio: false
		},
		audio: {
			outputFormat: 'mp3',
			mode: 'quality',
			bitrateKbps: 192,
			targetMb: 10
		},
		zip: {
			op: 'create',
			level: 6
		},
		exif: {
			removeIcc: false
		}
	};
}

const IMAGE_TABS = ['jpg', 'png', 'webp', 'gif', 'heic'] as const;
const OUTPUT_FORMATS = new Set(['auto', 'jpg', 'png', 'webp', 'gif', 'avif', 'ico']);

function num(v: unknown, min: number, max: number, fallback: number): number {
	if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
	return Math.min(max, Math.max(min, v));
}

function bool(v: unknown, fallback: boolean): boolean {
	return typeof v === 'boolean' ? v : fallback;
}

function oneOf<T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T {
	return allowed.includes(v as T) ? (v as T) : fallback;
}

function mergeImage(
	target: ImageCompressionSettings,
	s: Record<string, unknown>,
	tab: string
): void {
	target.quality = num(s.quality, 1, 100, target.quality);
	target.mode = oneOf(s.mode, ['quality', 'target'] as const, target.mode);
	target.targetKb = num(s.targetKb, 1, 1_000_000, target.targetKb);
	target.downscaleToTarget = bool(s.downscaleToTarget, target.downscaleToTarget);
	target.keepMetadata = bool(s.keepMetadata, target.keepMetadata);
	target.maxDimension =
		s.maxDimension === null
			? null
			: num(s.maxDimension, 1, 65_535, target.maxDimension ?? 0) || null;
	const format = s.outputFormat;
	if (
		typeof format === 'string' &&
		OUTPUT_FORMATS.has(format) &&
		!(tab === 'heic' && format === 'gif') && // GIF output isn't offered for HEIC
		!(tab === 'gif' && format === 'auto') // the GIF tab has no Auto pill
	) {
		target.outputFormat = format as ImageCompressionSettings['outputFormat'];
	}
}

function mergeSvg(target: SvgCompressionSettings, s: Record<string, unknown>): void {
	target.removeComments = bool(s.removeComments, target.removeComments);
	target.removeMetadata = bool(s.removeMetadata, target.removeMetadata);
	target.cleanupIds = bool(s.cleanupIds, target.cleanupIds);
	target.removeDimensions = bool(s.removeDimensions, target.removeDimensions);
	target.precision = Math.round(num(s.precision, 0, 8, target.precision));
	target.aggressive = bool(s.aggressive, target.aggressive);
	target.outputFormat = oneOf(s.outputFormat, ['svg', 'png', 'ico'] as const, target.outputFormat);
	target.rasterSize = Math.round(num(s.rasterSize, 16, 4096, target.rasterSize));
	target.quality = num(s.quality, 1, 100, target.quality);
}

function mergeVideo(target: VideoConversionSettings, s: Record<string, unknown>): void {
	target.container = oneOf(s.container, ['mp4', 'webm', 'mov', 'gif'] as const, target.container);
	target.mode = oneOf(s.mode, ['quality', 'target'] as const, target.mode);
	target.quality = num(s.quality, 1, 100, target.quality);
	target.targetMb = num(s.targetMb, 0.1, 10_000, target.targetMb);
	target.maxDimension =
		s.maxDimension === null
			? null
			: num(s.maxDimension, 1, 65_535, target.maxDimension ?? 0) || null;
	target.fps = oneOf(s.fps, ['original', 60, 30, 15, 10, 5] as const, target.fps);
	target.removeAudio = bool(s.removeAudio, target.removeAudio);
}

function mergeAudio(target: AudioConversionSettings, s: Record<string, unknown>): void {
	target.outputFormat = oneOf(
		s.outputFormat,
		['mp3', 'm4a', 'wav', 'ogg'] as const,
		target.outputFormat
	);
	target.mode = oneOf(s.mode, ['quality', 'target'] as const, target.mode);
	target.bitrateKbps = oneOf(
		s.bitrateKbps,
		[320, 256, 192, 128, 96, 64] as const,
		target.bitrateKbps
	);
	target.targetMb = num(s.targetMb, 0.1, 10_000, target.targetMb);
}

function mergeZip(target: ZipSettings, s: Record<string, unknown>): void {
	target.op = oneOf(s.op, ['create', 'extract'] as const, target.op);
	target.level = oneOf(s.level, [0, 1, 6, 9] as const, target.level);
}

function mergePdf(target: PdfCompressionSettings, s: Record<string, unknown>): void {
	// `password` is deliberately NOT merged — secrets never round-trip storage.
	target.op = oneOf(
		s.op,
		['compress', 'merge', 'pages', 'toImages', 'fromImages', 'unlock', 'protect'] as const,
		target.op
	);
	target.mode = oneOf(s.mode, ['level', 'target'] as const, target.mode);
	target.level = oneOf(
		s.level,
		['low', 'medium', 'high', 'ultra', 'extreme'] as const,
		target.level
	);
	target.targetMb = num(s.targetMb, 0.1, 10_000, target.targetMb);
	target.mergeCompress = bool(s.mergeCompress, target.mergeCompress);
	if (typeof s.pageRange === 'string' && s.pageRange.length <= 200) target.pageRange = s.pageRange;
	target.pageMode = oneOf(s.pageMode, ['keep', 'remove'] as const, target.pageMode);
	target.imageDpi = oneOf(s.imageDpi, [72, 150, 300] as const, target.imageDpi);
	target.imageFormat = oneOf(s.imageFormat, ['jpg', 'png'] as const, target.imageFormat);
	target.imageQuality = num(s.imageQuality, 1, 100, target.imageQuality);
}

/**
 * JSON for localStorage — secrets (pdf.password) are stripped so they never
 * touch disk; the load side (mergePdf) refuses to read them anyway.
 */
export function serializeSettings(version: number, map: SettingsMap): string {
	const data = JSON.parse(JSON.stringify(map)) as SettingsMap;
	data.pdf.password = '';
	return JSON.stringify({ version, data });
}

/**
 * Merge persisted settings into the live map — whitelisted keys only,
 * enum-validated, numerically clamped. Anything malformed keeps the default,
 * so a stale/hand-edited localStorage entry can never wedge the UI.
 */
export function mergeStoredSettings(target: SettingsMap, stored: unknown): void {
	if (typeof stored !== 'object' || stored === null) return;
	const s = stored as Record<string, unknown>;
	for (const tab of IMAGE_TABS) {
		const entry = s[tab];
		if (typeof entry === 'object' && entry !== null) {
			mergeImage(target[tab], entry as Record<string, unknown>, tab);
		}
	}
	if (typeof s.svg === 'object' && s.svg !== null)
		mergeSvg(target.svg, s.svg as Record<string, unknown>);
	if (typeof s.pdf === 'object' && s.pdf !== null)
		mergePdf(target.pdf, s.pdf as Record<string, unknown>);
	if (typeof s.video === 'object' && s.video !== null)
		mergeVideo(target.video, s.video as Record<string, unknown>);
	if (typeof s.audio === 'object' && s.audio !== null)
		mergeAudio(target.audio, s.audio as Record<string, unknown>);
	if (typeof s.zip === 'object' && s.zip !== null)
		mergeZip(target.zip, s.zip as Record<string, unknown>);
	if (typeof s.exif === 'object' && s.exif !== null) {
		const e = s.exif as Record<string, unknown>;
		target.exif.removeIcc = bool(e.removeIcc, target.exif.removeIcc);
	}
}
