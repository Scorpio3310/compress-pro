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
	// JXL rides the jpg tab too — icodec/libjxl decodes it in the worker.
	'image/jxl': 'jpg',
	// PSD (flattened composite) — @webtoon/psd decodes it in the worker.
	'image/vnd.adobe.photoshop': 'jpg',
	'application/x-photoshop': 'jpg',
	'image/x-photoshop': 'jpg',
	// Camera RAW rides the jpg tab too — decoded by LibRaw (codecs/raw.ts).
	// Pickers usually report a blank MIME for RAW; extensions are load-bearing.
	'image/x-adobe-dng': 'jpg',
	'image/x-canon-cr2': 'jpg',
	'image/x-nikon-nef': 'jpg',
	'image/x-sony-arw': 'jpg',
	'image/x-fuji-raf': 'jpg',
	'image/x-panasonic-rw2': 'jpg',
	'image/x-olympus-orf': 'jpg',
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
	'audio/webm': 'audio',
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
	'application/x-zip-compressed': 'zip',
	'application/x-7z-compressed': 'zip',
	'application/vnd.rar': 'zip',
	'application/x-rar-compressed': 'zip',
	'application/x-tar': 'zip',
	'application/gzip': 'zip',
	'application/x-gzip': 'zip',
	'application/x-bzip2': 'zip',
	'application/x-xz': 'zip',
	'application/x-iso9660-image': 'zip',
	'application/vnd.ms-cab-compressed': 'zip',
	'application/vnd.debian.binary-package': 'zip',
	'application/x-rpm': 'zip',
	'application/x-cpio': 'zip',
	'application/x-lzh-compressed': 'zip',
	'application/x-arj': 'zip',
	'application/x-compress': 'zip',
	'text/vtt': 'subtitle',
	'application/x-subrip': 'subtitle',
	'application/epub+zip': 'ebook',
	'application/vnd.comicbook+zip': 'ebook',
	'application/vnd.comicbook-rar': 'ebook',
	'model/gltf-binary': 'model',
	'text/csv': 'data',
	'application/json': 'data',
	'application/x-yaml': 'data',
	'application/yaml': 'data',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'data',
	'application/vnd.ms-excel': 'data'
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
	jxl: 'jpg',
	psd: 'jpg',
	cr2: 'jpg', // RAW family — LibRaw decodes, converts on the jpg tab
	nef: 'jpg',
	arw: 'jpg',
	dng: 'jpg',
	raf: 'jpg',
	rw2: 'jpg',
	orf: 'jpg',
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
	weba: 'audio',
	// Load-bearing: pickers/drops report a blank MIME for most font files.
	ttf: 'font',
	otf: 'font',
	woff: 'font',
	woff2: 'font',
	eot: 'font',
	// The whole archive family rides the zip tab. Extensions are load-bearing:
	// pickers report a blank MIME for most of these (.7z, .rar, .cpio, .arj…).
	zip: 'zip',
	'7z': 'zip',
	rar: 'zip',
	tar: 'zip',
	gz: 'zip',
	tgz: 'zip',
	bz2: 'zip',
	tbz2: 'zip',
	txz: 'zip',
	xz: 'zip',
	iso: 'zip',
	cab: 'zip',
	deb: 'zip',
	rpm: 'zip',
	cpio: 'zip',
	lha: 'zip',
	lzh: 'zip',
	arj: 'zip',
	z: 'zip', // .Z (unix compress) — formatFromName lowercases
	lzma: 'zip',
	// Subtitles — pickers report blank/odd MIMEs for all three, extensions rule.
	srt: 'subtitle',
	vtt: 'subtitle',
	ass: 'subtitle',
	ssa: 'subtitle',
	// E-books & comics — ZIP/RAR magics inside, but the extension IS the intent
	// (a .cbz dropped on / means "comic", never "extract this zip").
	epub: 'ebook',
	cbz: 'ebook',
	cbr: 'ebook',
	// 3D models. .gltf is accepted so the codec can explain "export as .glb"
	// instead of a silent unsupported-file drop; a lone .bin stays unroutable.
	glb: 'model',
	gltf: 'model',
	// Data converters — the target is implied per input (csv→xlsx, xlsx→csv,
	// json→yaml, yaml→json).
	csv: 'data',
	tsv: 'data',
	xlsx: 'data',
	xls: 'data',
	json: 'data',
	yaml: 'data',
	yml: 'data'
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

export type FormatFamily =
	| 'image'
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
/** RAW camera extensions LibRaw decodes for us (they ride the jpg tab). */
export const RAW_EXTENSIONS = new Set(['cr2', 'nef', 'arw', 'dng', 'raf', 'rw2', 'orf']);

/** RAW must be detected UP FRONT, never sniffed: CR2/NEF/ARW/DNG carry TIFF
 *  magic bytes, so byte-sniffing would misroute them to the TIFF decoder. */
export function isRawFile(name: string, mime: string): boolean {
	if (
		/^image\/x-(adobe-dng|canon-cr2|nikon-nef|sony-arw|fuji-raf|panasonic-rw2|olympus-orf)$/.test(
			mime
		)
	) {
		return true;
	}
	const dot = name.lastIndexOf('.');
	return dot >= 0 && RAW_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export const TAB_ACCEPT: Record<FileFormat, string> = {
	// AVIF/BMP/TIFF/RAW ride on the jpg tab (no tabs of their own; convert to
	// JPG). .jpe: legacy JPEG extension pickers report with a blank MIME.
	jpg: 'image/jpeg,image/avif,image/bmp,image/tiff,image/jxl,image/vnd.adobe.photoshop,.jpe,.avif,.bmp,.tif,.tiff,.jxl,.psd,.cr2,.nef,.arw,.dng,.raf,.rw2,.orf',
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
	// Video is accepted too (MP4/MOV/WebM) — the audio tab extracts the audio track.
	audio:
		'audio/*,video/mp4,video/quicktime,video/webm,.mp3,.wav,.m4a,.aac,.ogg,.oga,.flac,.opus,.weba,.mp4,.mov,.webm',
	// Extensions load-bearing (blank MIMEs, see EXT_TO_FORMAT).
	font: 'font/ttf,font/otf,font/woff,font/woff2,application/vnd.ms-fontobject,.ttf,.otf,.woff,.woff2,.eot',
	// Extract/convert default; the create op overrides accept to '' (anything)
	// in-page. Extensions load-bearing (blank MIMEs for most archive types).
	zip: 'application/zip,application/x-zip-compressed,application/x-7z-compressed,application/vnd.rar,application/x-tar,application/gzip,.zip,.7z,.rar,.tar,.gz,.tgz,.bz2,.tbz2,.txz,.xz,.iso,.cab,.deb,.rpm,.cpio,.lha,.lzh,.arj,.z,.lzma',
	exif: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
	// Chosen destination like exif — nothing ROUTES here; the per-op accept
	// (images for toText, PDF for toPdf) narrows further in-page.
	ocr: 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf',
	// Extensions load-bearing: pickers report blank MIMEs for .srt/.ass.
	subtitle: 'text/vtt,application/x-subrip,.srt,.vtt,.ass,.ssa',
	// Extensions load-bearing again — most pickers blank the MIME for .cbz/.cbr.
	ebook: 'application/epub+zip,.epub,.cbz,.cbr',
	// .gltf accepted for the helpful export-as-glb error, not for conversion.
	model: 'model/gltf-binary,.glb,.gltf',
	// Extensions load-bearing (blank MIMEs for .yaml/.tsv are common).
	data: 'text/csv,application/json,.csv,.tsv,.xlsx,.xls,.json,.yaml,.yml'
};
