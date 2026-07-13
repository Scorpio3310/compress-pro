import type { IconName } from '$lib/components/Icon.svelte';
import { formatFromName } from '$lib/routing';

/** What a file-list row's leading tile should show for a given filename. */
export type FileVisual =
	| { kind: 'thumb' }
	| { kind: 'icon'; icon: IconName; tint: string }
	| { kind: 'ext'; label: string; tint: string };

/** Extensions <img> renders cross-browser, with the MIME a typeless blob
 *  (ZIP extraction) needs on its object URL to display — SVG especially:
 *  browsers never content-sniff XML, so image/svg+xml must be declared. */
const DISPLAYABLE_IMAGE_MIME: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	jpe: 'image/jpeg',
	jfif: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
	avif: 'image/avif',
	svg: 'image/svg+xml',
	bmp: 'image/bmp',
	ico: 'image/x-icon'
};

/** Ext-label tint: code-ish extensions read accent, everything else muted. */
const CODE_EXTS = new Set([
	'js',
	'mjs',
	'cjs',
	'ts',
	'tsx',
	'jsx',
	'json',
	'html',
	'htm',
	'css',
	'scss',
	'svelte',
	'vue',
	'xml',
	'yml',
	'yaml',
	'sh',
	'py'
]);

// dot <= 0 also catches dotfiles (".gitignore" has no extension).
function extOf(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** MIME for the displayable-image set, null otherwise — used to type
 *  ZIP-extraction blobs so their thumbnails render. */
export function displayableImageMime(name: string): string | null {
	return DISPLAYABLE_IMAGE_MIME[extOf(name)] ?? null;
}

export function fileVisual(name: string): FileVisual {
	const ext = extOf(name);
	if (DISPLAYABLE_IMAGE_MIME[ext]) return { kind: 'thumb' };
	const format = formatFromName(name);
	if (format === 'video') return { kind: 'icon', icon: 'video', tint: 'text-file-video' };
	if (format === 'audio') return { kind: 'icon', icon: 'audio', tint: 'text-file-audio' };
	if (format === 'zip') return { kind: 'icon', icon: 'archive', tint: 'text-file-archive' };
	if (format === 'pdf') return { kind: 'icon', icon: 'document', tint: 'text-file-pdf' };
	if (format === 'font') return { kind: 'icon', icon: 'font', tint: 'text-file-font' };
	// The known formats left are exactly the non-displayable images (heic/heif/tif/tiff).
	if (format !== null) return { kind: 'icon', icon: 'image', tint: 'text-accent' };
	if (!ext) return { kind: 'icon', icon: 'document', tint: 'text-muted' };
	return {
		kind: 'ext',
		label: ext.slice(0, 4).toUpperCase(), // cap 4 — 5 mono chars overflow the 40px tile
		tint: CODE_EXTS.has(ext) ? 'text-accent' : 'text-muted'
	};
}
