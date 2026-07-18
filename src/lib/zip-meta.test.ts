/**
 * readZipEntryMeta must agree byte-for-byte with what fflate will do (the
 * fflateName key) while decoding legacy cp437 names correctly and surfacing
 * the encryption bit fflate ignores. Zips are hand-built so every header
 * field is under test control.
 */
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readZipEntryMeta, stripC1 } from './zip-meta';
import { buildZip, crc32 } from './testing/build-zip';

const enc = new TextEncoder();

describe('readZipEntryMeta', () => {
	it('decodes non-UTF-8 names as cp437 and mirrors fflate latin1 keys', () => {
		// 'Résumé.pdf' in cp437: é = 0x82.
		const nameBytes = Uint8Array.from([0x52, 0x82, 0x73, 0x75, 0x6d, 0x82, 0x2e, 0x70, 0x64, 0x66]);
		const data = enc.encode('fake pdf bytes');
		const zip = buildZip([{ nameBytes, data, flags: 0 }]);

		const meta = readZipEntryMeta(zip);
		expect(meta).not.toBeNull();
		expect(meta![0].name).toBe('Résumé.pdf');
		expect(meta![0].encrypted).toBe(false);
		// fflate keys the same entry as latin1 — C1 controls where cp437 accents live.
		expect(meta![0].fflateName).toBe('R\u0082sum\u0082.pdf');
		expect(Object.keys(unzipSync(zip))).toEqual([meta![0].fflateName]);
	});

	it('decodes names with the UTF-8 flag as UTF-8, same as fflate', () => {
		const nameBytes = enc.encode('Résumé.pdf');
		const zip = buildZip([{ nameBytes, data: enc.encode('x'), flags: 0x800 }]);
		const meta = readZipEntryMeta(zip);
		expect(meta![0].name).toBe('Résumé.pdf');
		expect(meta![0].fflateName).toBe('Résumé.pdf');
		expect(Object.keys(unzipSync(zip))).toEqual(['Résumé.pdf']);
	});

	it('surfaces general-purpose bit 0 (the encryption flag fflate never reads)', () => {
		const zip = buildZip([
			{ nameBytes: enc.encode('secret.txt'), data: enc.encode('ciphertext-ish'), flags: 0x1 },
			{ nameBytes: enc.encode('plain.txt'), data: enc.encode('plain'), flags: 0 }
		]);
		const meta = readZipEntryMeta(zip);
		expect(meta!.map((e) => e.encrypted)).toEqual([true, false]);
	});

	it('bails to null on non-zip bytes, truncation and zip64 sentinels', () => {
		expect(readZipEntryMeta(enc.encode('not a zip at all'))).toBeNull();
		expect(readZipEntryMeta(new Uint8Array(4))).toBeNull();

		const zip = buildZip([{ nameBytes: enc.encode('a.txt'), data: enc.encode('a'), flags: 0 }]);
		// Corrupt the central-directory offset to the zip64 sentinel.
		const view = new DataView(zip.buffer);
		view.setUint32(zip.length - 22 + 16, 0xffffffff, true);
		expect(readZipEntryMeta(zip)).toBeNull();
	});

	it('walks multi-entry directories with extra fields and comments', () => {
		const zip = buildZip([
			{ nameBytes: enc.encode('a.txt'), data: enc.encode('aaa'), flags: 0, comment: 'first' },
			{ nameBytes: enc.encode('dir/b.txt'), data: enc.encode('bbb'), flags: 0x800 }
		]);
		const meta = readZipEntryMeta(zip);
		expect(meta!.map((e) => e.name)).toEqual(['a.txt', 'dir/b.txt']);
	});
});

describe('stripC1', () => {
	it('removes invisible C1 controls but keeps accents and text', () => {
		expect(stripC1('R\u0082sum\u0082.pdf')).toBe('Rsum.pdf');
		expect(stripC1('Résumé.pdf')).toBe('Résumé.pdf');
		expect(stripC1('plain')).toBe('plain');
	});
});

describe('crc32 helper self-check', () => {
	it('matches the known CRC of "123456789"', () => {
		expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
	});
});
