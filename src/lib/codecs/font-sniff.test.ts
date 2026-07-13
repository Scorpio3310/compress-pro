import { describe, expect, it } from 'vitest';
import { sniffFont } from './font-sniff';

const bytes = (...values: number[]) => new Uint8Array(values);
const padded = (head: number[], length = 64) => {
	const out = new Uint8Array(length);
	out.set(head);
	return out;
};

describe('sniffFont', () => {
	it('detects both sfnt flavors and the old Apple magic', () => {
		expect(sniffFont(padded([0x00, 0x01, 0x00, 0x00]))).toEqual({
			container: 'ttf',
			flavor: 'glyf'
		});
		expect(sniffFont(padded([0x74, 0x72, 0x75, 0x65]))).toEqual({
			container: 'ttf',
			flavor: 'glyf'
		}); // 'true'
		expect(sniffFont(padded([0x4f, 0x54, 0x54, 0x4f]))).toEqual({
			container: 'otf',
			flavor: 'cff'
		}); // 'OTTO'
	});

	it('detects WOFF/WOFF2 and reads the inner flavor from offset 4', () => {
		expect(sniffFont(padded([0x77, 0x4f, 0x46, 0x46, 0x00, 0x01, 0x00, 0x00]))).toEqual({
			container: 'woff',
			flavor: 'glyf'
		});
		expect(sniffFont(padded([0x77, 0x4f, 0x46, 0x46, 0x4f, 0x54, 0x54, 0x4f]))).toEqual({
			container: 'woff',
			flavor: 'cff'
		});
		expect(sniffFont(padded([0x77, 0x4f, 0x46, 0x32, 0x4f, 0x54, 0x54, 0x4f]))).toEqual({
			container: 'woff2',
			flavor: 'cff'
		});
	});

	it('flags collections as ttc so the worker can reject them with a hint', () => {
		expect(sniffFont(padded([0x74, 0x74, 0x63, 0x66]))).toEqual({ container: 'ttc', flavor: null });
	});

	it('detects EOT via the magic field at 34 plus a known version', () => {
		const eot = new Uint8Array(64);
		const dv = new DataView(eot.buffer);
		dv.setUint32(8, 0x00020001, true);
		dv.setUint16(34, 0x504c, true);
		expect(sniffFont(eot)).toEqual({ container: 'eot', flavor: null });
		dv.setUint32(8, 0x00030003, true); // unknown version — not an EOT
		expect(sniffFont(eot)).toBeNull();
	});

	it('rejects junk, short buffers, and 2-byte lookalike prefixes', () => {
		expect(sniffFont(bytes())).toBeNull();
		expect(sniffFont(bytes(0x00, 0x01, 0x00, 0x00))).toBeNull(); // < 12 bytes
		// Starts 00 01 like a TTF but the full dword differs (corrupt-JPEG shape).
		expect(sniffFont(padded([0x00, 0x01, 0xff, 0xd8]))).toBeNull();
		expect(sniffFont(noise())).toBeNull();
	});
});

function noise(): Uint8Array {
	const out = new Uint8Array(64);
	for (let i = 0; i < out.length; i++) out[i] = (i * 37 + 11) & 0xff;
	return out;
}
