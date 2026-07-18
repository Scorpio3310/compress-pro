import { describe, expect, it } from 'vitest';
import { applyNameRepairs, crc32, zipLegacyNameMap } from './zip-name-repair';

/**
 * The 7zz wasm build converts non-UTF-8 entry names through a LOSSY
 * surrogate-escape path before they ever reach MEMFS (probe 2026-07-18:
 * cp437 "Résumé.pdf" → "R򳵭򮤤f"-style astral garbage, 8 bytes collapsed
 * into 2 codepoints — irrecoverable from the FS side, and -mcp is rejected
 * with E_INVALIDARG). The repair therefore reads the zip's OWN central
 * directory and re-labels extracted entries by CRC+size match.
 */

/** Minimal stored-entry zip writer with raw name bytes + flag control —
 *  the same knobs the fixture generator uses (fflate always sets the flag). */
function storedZip(entries: { nameBytes: Uint8Array; data: Uint8Array; flags: number }[]) {
	const chunks: Uint8Array[] = [];
	const centrals: Uint8Array[] = [];
	let offset = 0;
	const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
	const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
	for (const e of entries) {
		const crc = crc32(e.data);
		const local = new Uint8Array([
			...u32(0x04034b50),
			...u16(20),
			...u16(e.flags),
			...u16(0), // stored
			...u16(0),
			...u16(0), // time/date
			...u32(crc),
			...u32(e.data.length),
			...u32(e.data.length),
			...u16(e.nameBytes.length),
			...u16(0),
			...e.nameBytes,
			...e.data
		]);
		const central = new Uint8Array([
			...u32(0x02014b50),
			...u16(20),
			...u16(20),
			...u16(e.flags),
			...u16(0),
			...u16(0),
			...u16(0),
			...u32(crc),
			...u32(e.data.length),
			...u32(e.data.length),
			...u16(e.nameBytes.length),
			...u16(0),
			...u16(0),
			...u16(0),
			...u16(0),
			...u32(0),
			...u32(offset),
			...e.nameBytes
		]);
		chunks.push(local);
		centrals.push(central);
		offset += local.length;
	}
	const cdSize = centrals.reduce((t, c) => t + c.length, 0);
	const eocd = new Uint8Array([
		...u32(0x06054b50),
		...u16(0),
		...u16(0),
		...u16(entries.length),
		...u16(entries.length),
		...u32(cdSize),
		...u32(offset),
		...u16(0)
	]);
	const total = [...chunks, ...centrals, eocd];
	const out = new Uint8Array(total.reduce((t, c) => t + c.length, 0));
	let at = 0;
	for (const c of total) {
		out.set(c, at);
		at += c.length;
	}
	return out;
}

const enc = (s: string) => new TextEncoder().encode(s);
const readerFor = (zip: Uint8Array) => async (start: number, end: number) =>
	zip.subarray(start, end);

// cp437 bytes for "Résumé.pdf" (é = 0x82).
const CP437_RESUME = new Uint8Array([0x52, 0x82, 0x73, 0x75, 0x6d, 0x82, 0x2e, 0x70, 0x64, 0x66]);

describe('crc32', () => {
	it('matches the reference vector', () => {
		expect(crc32(enc('123456789'))).toBe(0xcbf43926);
		expect(crc32(new Uint8Array(0))).toBe(0);
	});
});

describe('zipLegacyNameMap', () => {
	it('maps ONLY unflagged non-UTF-8 names, decoded as cp437', async () => {
		const cp437Data = enc('legacy payload\n');
		const utf8Data = enc('modern payload\n');
		const plainData = enc('ascii payload\n');
		const zip = storedZip([
			{ nameBytes: CP437_RESUME, data: cp437Data, flags: 0 },
			{ nameBytes: enc('Grüße.txt'), data: utf8Data, flags: 0x800 }, // flagged UTF-8
			{ nameBytes: enc('plain.txt'), data: plainData, flags: 0 } // ASCII, no repair needed
		]);
		const map = await zipLegacyNameMap(zip.length, readerFor(zip));
		expect(map).not.toBeNull();
		expect(map!.size).toBe(1);
		expect(map!.get(`${crc32(cp437Data)}:${cp437Data.length}`)).toBe('Résumé.pdf');
	});

	it('leaves unflagged-but-valid-UTF-8 names alone — the engine passes those through', async () => {
		const zip = storedZip([{ nameBytes: enc('Grüße.txt'), data: enc('x\n'), flags: 0 }]);
		const map = await zipLegacyNameMap(zip.length, readerFor(zip));
		expect(map?.size ?? 0).toBe(0);
	});

	it('drops ambiguous crc+size collisions rather than guessing', async () => {
		const same = enc('identical bytes\n');
		const zip = storedZip([
			{ nameBytes: new Uint8Array([0x82, 0x2e, 0x74, 0x78, 0x74]), data: same, flags: 0 }, // é.txt
			{ nameBytes: new Uint8Array([0x81, 0x2e, 0x74, 0x78, 0x74]), data: same, flags: 0 } // ü.txt
		]);
		const map = await zipLegacyNameMap(zip.length, readerFor(zip));
		expect(map?.size ?? 0).toBe(0);
	});

	it('returns null for bytes that are not a zip', async () => {
		const junk = new Uint8Array(64).fill(0xaa);
		expect(await zipLegacyNameMap(junk.length, readerFor(junk))).toBeNull();
	});
});

describe('applyNameRepairs', () => {
	it('renames matching entries and counts them; leaves the rest untouched', () => {
		const legacy = enc('legacy payload\n');
		const other = enc('other payload\n');
		const entries = [
			{ path: 'R\u{b3d6d}\u{aec24}f', size: legacy.length, bytes: legacy }, // engine-mangled
			{ path: 'plain.txt', size: other.length, bytes: other }
		];
		const map = new Map([[`${crc32(legacy)}:${legacy.length}`, 'Résumé.pdf']]);
		expect(applyNameRepairs(entries, map)).toBe(1);
		expect(entries[0].path).toBe('Résumé.pdf');
		expect(entries[1].path).toBe('plain.txt');
	});

	it('does nothing for an empty map without touching entry bytes', () => {
		const bytes = enc('x');
		const entries = [{ path: 'a.txt', size: 1, bytes }];
		expect(applyNameRepairs(entries, new Map())).toBe(0);
		expect(entries[0].path).toBe('a.txt');
	});
});
