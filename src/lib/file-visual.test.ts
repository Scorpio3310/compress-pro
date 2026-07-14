import { describe, expect, it } from 'vitest';
import { displayableImageMime, fileVisual } from './file-visual';

describe('fileVisual', () => {
	it('thumbs browser-displayable images (case-insensitive)', () => {
		for (const n of [
			'a.jpg',
			'b.PNG',
			'c.webp',
			'd.gif',
			'e.avif',
			'f.svg',
			'g.bmp',
			'h.ico',
			'i.jfif'
		]) {
			expect(fileVisual(n)).toEqual({ kind: 'thumb' });
		}
	});

	it('family glyphs with tints', () => {
		expect(fileVisual('clip.mp4')).toEqual({
			kind: 'icon',
			icon: 'video',
			tint: 'text-file-video'
		});
		expect(fileVisual('song.mp3')).toEqual({
			kind: 'icon',
			icon: 'audio',
			tint: 'text-file-audio'
		});
		expect(fileVisual('bundle.zip')).toEqual({
			kind: 'icon',
			icon: 'archive',
			tint: 'text-file-archive'
		});
		expect(fileVisual('doc.pdf')).toEqual({
			kind: 'icon',
			icon: 'document',
			tint: 'text-file-pdf'
		});
		expect(fileVisual('Inter.woff2')).toEqual({
			kind: 'icon',
			icon: 'font',
			tint: 'text-file-font'
		});
		// Non-displayable images fall back to the image glyph, not a broken <img>.
		expect(fileVisual('IMG_0001.HEIC')).toEqual({
			kind: 'icon',
			icon: 'image',
			tint: 'text-accent'
		});
		expect(fileVisual('scan.tiff')).toEqual({ kind: 'icon', icon: 'image', tint: 'text-accent' });
	});

	it('extension labels: code accent, others muted, capped at 4 chars', () => {
		expect(fileVisual('app.js')).toEqual({ kind: 'ext', label: 'JS', tint: 'text-accent' });
		expect(fileVisual('index.html')).toEqual({ kind: 'ext', label: 'HTML', tint: 'text-accent' });
		expect(fileVisual('notes.txt')).toEqual({ kind: 'ext', label: 'TXT', tint: 'text-muted' });
		expect(fileVisual('seed.torrent')).toMatchObject({ kind: 'ext', label: 'TORR' });
		// .gz routes to the archive tab now, so it earns the archive icon.
		expect(fileVisual('backup.tar.gz')).toEqual({
			kind: 'icon',
			icon: 'archive',
			tint: 'text-file-archive'
		});
	});

	it('document fallback for no/hidden extension', () => {
		expect(fileVisual('README')).toEqual({ kind: 'icon', icon: 'document', tint: 'text-muted' });
		expect(fileVisual('.gitignore')).toEqual({
			kind: 'icon',
			icon: 'document',
			tint: 'text-muted'
		});
	});
});

describe('displayableImageMime', () => {
	it('types the displayable set only', () => {
		expect(displayableImageMime('logo.svg')).toBe('image/svg+xml');
		expect(displayableImageMime('shot.png')).toBe('image/png');
		expect(displayableImageMime('notes.txt')).toBeNull();
		expect(displayableImageMime('img.heic')).toBeNull();
	});
});
