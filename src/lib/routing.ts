import type { FileFormat } from '$lib/types';
import { isImageFormat } from '$lib/types';

const MIME_TO_FORMAT: Record<string, FileFormat> = {
	'image/jpeg': 'jpg',
	'image/pjpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	// No AVIF tab — browsers decode it natively, so it lands on the jpg tab
	// and converts to JPG by default (same idea as HEIC's convert-first flow).
	'image/avif': 'jpg',
	// BMP/TIFF have no tab either — native/utif2 decode on the jpg tab.
	'image/bmp': 'jpg',
	'image/x-ms-bmp': 'jpg',
	'image/tiff': 'jpg',
	'image/heic': 'heic',
	'image/heif': 'heic',
	'image/heic-sequence': 'heic',
	'image/svg+xml': 'svg',
	'application/pdf': 'pdf',
	'video/mp4': 'video',
	'video/quicktime': 'video',
	'video/webm': 'video',
	'video/x-matroska': 'video',
	'video/x-m4v': 'video',
	'audio/mpeg': 'audio',
	'audio/mp3': 'audio',
	'audio/wav': 'audio',
	'audio/x-wav': 'audio',
	'audio/wave': 'audio',
	'audio/mp4': 'audio',
	'audio/aac': 'audio',
	'audio/ogg': 'audio',
	'audio/opus': 'audio',
	'audio/flac': 'audio',
	'audio/x-flac': 'audio',
	'font/ttf': 'font',
	'font/otf': 'font',
	'font/sfnt': 'font',
	'font/woff': 'font',
	'font/woff2': 'font',
	'application/font-woff': 'font',
	'application/font-sfnt': 'font',
	'application/x-font-ttf': 'font',
	'application/x-font-otf': 'font',
	'application/vnd.ms-fontobject': 'font',
	'application/zip': 'zip',
	'application/x-zip-compressed': 'zip'
};

const EXT_TO_FORMAT: Record<string, FileFormat> = {
	jpg: 'jpg',
	jpeg: 'jpg',
	jpe: 'jpg', // legacy 8.3-era JPEG extension — still in the wild (real samples)
	jfif: 'jpg',
	png: 'png',
	webp: 'webp',
	gif: 'gif',
	avif: 'jpg',
	bmp: 'jpg',
	tif: 'jpg',
	tiff: 'jpg',
	heic: 'heic',
	heif: 'heic',
	svg: 'svg',
	pdf: 'pdf',
	mp4: 'video',
	m4v: 'video',
	mov: 'video',
	webm: 'video',
	mkv: 'video',
	mp3: 'audio',
	wav: 'audio',
	m4a: 'audio',
	aac: 'audio',
	ogg: 'audio',
	oga: 'audio',
	flac: 'audio',
	opus: 'audio',
	// Load-bearing: pickers/drops report a blank MIME for most font files.
	ttf: 'font',
	otf: 'font',
	woff: 'font',
	woff2: 'font',
	eot: 'font',
	zip: 'zip'
};

/** Extension-only tab lookup — for names without a MIME (ZIP entries). */
export function formatFromName(name: string): FileFormat | null {
	const dot = name.lastIndexOf('.');
	if (dot < 0) return null;
	return EXT_TO_FORMAT[name.slice(dot + 1).toLowerCase()] ?? null;
}

/** Maps a pasted/dropped file to its tab. MIME first, extension fallback
 *  (pickers often report no MIME for .heic); unknown → null. */
export function routeFileToFormat(file: File): FileFormat | null {
	return MIME_TO_FORMAT[file.type.toLowerCase()] ?? formatFromName(file.name);
}

export type FormatFamily = 'image' | 'svg' | 'pdf' | 'video' | 'audio' | 'font' | 'zip' | 'exif';

/**
 * Pipeline family of a tab. Same-family drops on a dropzone park there (a PNG
 * on the jpg tab means "convert to JPG"); cross-family drops re-route — a
 * video parked on an image tab could only fail at compress time.
 */
export function familyOf(format: FileFormat): FormatFamily {
	return isImageFormat(format) ? 'image' : format;
}

/**
 * Does a file match an HTML `accept` attribute? '' accepts everything.
 * Tokens: `.ext` = case-insensitive name suffix, `type/*` = MIME prefix,
 * anything else = exact MIME. Pure strings so node-env vitest covers it.
 */
export function matchesAccept(accept: string, name: string, type: string): boolean {
	if (!accept) return true;
	const lowerName = name.toLowerCase();
	const lowerType = type.toLowerCase();
	return accept.split(',').some((raw) => {
		const token = raw.trim().toLowerCase();
		if (!token) return false;
		if (token.startsWith('.')) return lowerName.endsWith(token);
		if (token.endsWith('/*')) return lowerType.startsWith(token.slice(0, -1));
		return lowerType === token;
	});
}

/** Dropzone/file-picker accept per tab (FileUpload renders these). */
export const TAB_ACCEPT: Record<FileFormat, string> = {
	// AVIF/BMP/TIFF ride on the jpg tab (no tabs of their own; convert to JPG).
	// .jpe: legacy JPEG extension pickers report with a blank MIME.
	jpg: 'image/jpeg,image/avif,image/bmp,image/tiff,.jpe,.avif,.bmp,.tif,.tiff',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
	// Extensions are load-bearing: pickers often report no/blank MIME for
	// .heic, and Chromium hides HEIC files when accept lists MIME only.
	heic: 'image/heic,image/heif,.heic,.heif',
	svg: 'image/svg+xml',
	pdf: 'application/pdf',
	// Extensions again load-bearing: pickers often blank the MIME for .mkv.
	video: 'video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.m4v,.mov,.webm,.mkv',
	// Video is accepted too — the audio tab extracts the audio track.
	audio: 'audio/*,video/mp4,video/quicktime,.mp3,.wav,.m4a,.aac,.ogg,.oga,.flac,.opus,.mp4,.mov',
	// Extensions load-bearing (blank MIMEs, see EXT_TO_FORMAT).
	font: 'font/ttf,font/otf,font/woff,font/woff2,application/vnd.ms-fontobject,.ttf,.otf,.woff,.woff2,.eot',
	// Extract default; the create op overrides accept to '' (anything) in-page.
	zip: 'application/zip,.zip',
	exif: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'
};
