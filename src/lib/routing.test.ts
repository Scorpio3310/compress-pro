import { describe, expect, it } from 'vitest';
import { familyOf, matchesAccept, routeFileToFormat, TAB_ACCEPT } from './routing';
import type { FileFormat } from '$lib/types';

const file = (name: string, type: string) => new File([], name, { type });

describe('routeFileToFormat', () => {
	it('routes by MIME type first', () => {
		expect(routeFileToFormat(file('a.jpg', 'image/jpeg'))).toBe('jpg');
		expect(routeFileToFormat(file('a.png', 'image/png'))).toBe('png');
		expect(routeFileToFormat(file('a.webp', 'image/webp'))).toBe('webp');
		expect(routeFileToFormat(file('a.gif', 'image/gif'))).toBe('gif');
		expect(routeFileToFormat(file('a.svg', 'image/svg+xml'))).toBe('svg');
		expect(routeFileToFormat(file('a.pdf', 'application/pdf'))).toBe('pdf');
		expect(routeFileToFormat(file('a.heic', 'image/heic'))).toBe('heic');
	});

	it('routes AVIF to the jpg tab (no tab of its own, converts to JPG by default)', () => {
		expect(routeFileToFormat(file('a.avif', 'image/avif'))).toBe('jpg');
		expect(routeFileToFormat(file('shot.AVIF', ''))).toBe('jpg');
	});

	it('prefers MIME over a conflicting extension', () => {
		expect(routeFileToFormat(file('misnamed.png', 'image/jpeg'))).toBe('jpg');
	});

	it('falls back to the extension when MIME is missing (picker quirk for .heic)', () => {
		expect(routeFileToFormat(file('IMG_0001.HEIC', ''))).toBe('heic');
		expect(routeFileToFormat(file('photo.jfif', ''))).toBe('jpg');
		expect(routeFileToFormat(file('photo.jpe', ''))).toBe('jpg'); // legacy JPEG ext
		expect(routeFileToFormat(file('scan.PDF', ''))).toBe('pdf');
	});

	it('routes BMP and TIFF to the jpg tab (convert-on-arrival like AVIF)', () => {
		expect(routeFileToFormat(file('a.bmp', 'image/bmp'))).toBe('jpg');
		expect(routeFileToFormat(file('scan.tiff', 'image/tiff'))).toBe('jpg');
		expect(routeFileToFormat(file('SCAN.TIF', ''))).toBe('jpg');
	});

	it('routes audio files to the audio tab (MIME and extension)', () => {
		expect(routeFileToFormat(file('song.mp3', 'audio/mpeg'))).toBe('audio');
		expect(routeFileToFormat(file('take.wav', 'audio/wav'))).toBe('audio');
		expect(routeFileToFormat(file('memo.m4a', ''))).toBe('audio');
		expect(routeFileToFormat(file('clip.flac', ''))).toBe('audio');
		expect(routeFileToFormat(file('voice.OPUS', ''))).toBe('audio');
	});

	it('routes ZIP archives to the zip tab', () => {
		expect(routeFileToFormat(file('archive.zip', 'application/zip'))).toBe('zip');
		expect(routeFileToFormat(file('BUNDLE.ZIP', ''))).toBe('zip');
	});

	it('routes fonts to the font tab (pickers usually blank the MIME)', () => {
		expect(routeFileToFormat(file('Inter.ttf', ''))).toBe('font');
		expect(routeFileToFormat(file('Inter.WOFF2', ''))).toBe('font');
		expect(routeFileToFormat(file('a.woff', 'font/woff'))).toBe('font');
		expect(routeFileToFormat(file('a.otf', 'font/otf'))).toBe('font');
		expect(routeFileToFormat(file('legacy.eot', 'application/vnd.ms-fontobject'))).toBe('font');
	});

	it('returns null for unknown or extensionless files', () => {
		expect(routeFileToFormat(file('notes.txt', 'text/plain'))).toBeNull();
		expect(routeFileToFormat(file('README', ''))).toBeNull();
	});
});

describe('familyOf', () => {
	it('groups all image tabs into one family', () => {
		for (const tab of ['jpg', 'png', 'webp', 'gif', 'heic'] as const) {
			expect(familyOf(tab)).toBe('image');
		}
	});

	it('keeps every non-image tab in its own family', () => {
		for (const tab of ['svg', 'pdf', 'video', 'audio', 'font', 'zip', 'exif'] as const) {
			expect(familyOf(tab)).toBe(tab);
		}
	});
});

describe('matchesAccept', () => {
	it('empty accept admits everything', () => {
		expect(matchesAccept('', 'anything.xyz', 'application/octet-stream')).toBe(true);
		expect(matchesAccept('', 'README', '')).toBe(true);
	});

	it('matches .ext tokens case-insensitively against the name', () => {
		expect(matchesAccept('.mkv,.mov', 'CLIP.MKV', '')).toBe(true);
		expect(matchesAccept('.mkv,.mov', 'clip.mp4', 'video/mp4')).toBe(false);
	});

	it('matches type/* wildcards against the MIME prefix', () => {
		expect(matchesAccept('audio/*', 'song.mp3', 'audio/mpeg')).toBe(true);
		expect(matchesAccept('audio/*', 'clip.mp4', 'video/mp4')).toBe(false);
		// The slash is part of the prefix — 'audio/*' must not match 'audio'.
		expect(matchesAccept('audio/*', 'weird', 'audio')).toBe(false);
	});

	it('matches exact MIME tokens and ignores stray whitespace', () => {
		expect(matchesAccept('image/jpeg, image/png', 'x.png', 'image/png')).toBe(true);
		expect(matchesAccept('image/jpeg, image/png', 'x.gif', 'image/gif')).toBe(false);
	});

	it('admits a blank-MIME file via its extension token (picker quirk)', () => {
		expect(matchesAccept(TAB_ACCEPT.heic, 'IMG_0001.HEIC', '')).toBe(true);
		expect(matchesAccept(TAB_ACCEPT.video, 'clip.mkv', '')).toBe(true);
		expect(matchesAccept(TAB_ACCEPT.font, 'Inter.woff2', '')).toBe(true);
		expect(matchesAccept(TAB_ACCEPT.font, 'legacy.EOT', '')).toBe(true);
	});

	it('rejects cross-family files against each tab default', () => {
		const cases: [FileFormat, string, string][] = [
			['jpg', 'clip.mp4', 'video/mp4'],
			['video', 'photo.jpg', 'image/jpeg'],
			['pdf', 'song.mp3', 'audio/mpeg'],
			['audio', 'page.pdf', 'application/pdf']
		];
		for (const [tab, name, type] of cases) {
			expect(matchesAccept(TAB_ACCEPT[tab], name, type)).toBe(false);
		}
	});

	it('audio tab deliberately admits mp4/mov (audio-track extraction)', () => {
		expect(matchesAccept(TAB_ACCEPT.audio, 'clip.mp4', 'video/mp4')).toBe(true);
		expect(matchesAccept(TAB_ACCEPT.audio, 'clip.mov', 'video/quicktime')).toBe(true);
		expect(matchesAccept(TAB_ACCEPT.audio, 'clip.webm', 'video/webm')).toBe(false);
	});
});
