import { describe, expect, it } from 'vitest';
import { ebookInfo, isDrmEncryption, isEpubDoc, sniffGif, sniffImage } from './ebook';

const bytes = (...list: number[]) => new Uint8Array(list);
const enc = (s: string) => new TextEncoder().encode(s);

describe('sniffImage', () => {
	it('recognizes jpg/png/webp by magic, not name', () => {
		expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg');
		expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1))).toBe('png');
		expect(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe(
			'webp'
		);
	});

	it('rejects gif, svg text, truncated headers and empties', () => {
		expect(sniffImage(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe(null);
		expect(sniffImage(enc('<svg xmlns="…"/>'))).toBe(null);
		expect(sniffImage(bytes(0xff, 0xd8))).toBe(null);
		expect(sniffImage(bytes())).toBe(null);
		// RIFF that is not WEBP (e.g. WAV) must not match
		expect(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBe(
			null
		);
	});
});

describe('sniffGif', () => {
	it('matches GIF8 only', () => {
		expect(sniffGif(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe(true);
		expect(sniffGif(bytes(0xff, 0xd8, 0xff))).toBe(false);
	});
});

describe('isEpubDoc', () => {
	it('mimetype entry content is authoritative', () => {
		const entries = [{ name: 'mimetype', bytes: enc('application/epub+zip') }];
		expect(isEpubDoc(entries, 'weird-name.zip')).toBe(true);
	});

	it('a non-epub mimetype entry wins over the extension', () => {
		const entries = [{ name: 'mimetype', bytes: enc('text/plain') }];
		expect(isEpubDoc(entries, 'book.epub')).toBe(false);
	});

	it('falls back to the extension when the entry is missing', () => {
		expect(isEpubDoc([{ name: 'ch1.xhtml', bytes: enc('<html/>') }], 'book.epub')).toBe(true);
		expect(isEpubDoc([{ name: 'page01.jpg', bytes: bytes(0xff) }], 'comic.cbz')).toBe(false);
	});
});

describe('isDrmEncryption', () => {
	it('real encryption algorithms read as DRM', () => {
		expect(
			isDrmEncryption(
				'<encryption><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></encryption>'
			)
		).toBe(true);
	});

	it('pure font obfuscation is NOT DRM (InDesign exports)', () => {
		expect(
			isDrmEncryption(
				'<encryption><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><EncryptionMethod Algorithm="http://ns.adobe.com/pdf/enc#RC"/></encryption>'
			)
		).toBe(false);
	});

	it('mixed obfuscation + real encryption still reads as DRM', () => {
		expect(
			isDrmEncryption(
				'<e><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-gcm"/></e>'
			)
		).toBe(true);
	});

	it('no algorithms at all is not DRM', () => {
		expect(isDrmEncryption('<encryption/>')).toBe(false);
	});
});

describe('ebookInfo', () => {
	it('epub counts images, cbz counts pages', () => {
		expect(ebookInfo(true, false, 3, 3, 8)).toBe('3 of 3 images recompressed');
		expect(ebookInfo(false, false, 5, 5, 7)).toBe('5 of 5 pages recompressed');
		expect(ebookInfo(false, false, 1, 1, 2)).toBe('1 of 1 page recompressed');
	});

	it('cbr conversions carry the container-change prefix', () => {
		expect(ebookInfo(false, true, 0, 4, 5)).toBe('Converted to CBZ · 0 of 4 pages recompressed');
		expect(ebookInfo(false, true, 0, 0, 4)).toBe('Converted to CBZ · 4 files repacked');
	});

	it('image-free archives say so honestly', () => {
		expect(ebookInfo(true, false, 0, 0, 5)).toBe('No images found — archive repacked');
	});
});
