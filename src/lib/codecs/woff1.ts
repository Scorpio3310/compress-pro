import { unzlibSync, zlibSync } from 'fflate';
import { findTable, isSfntFlavor, readSfnt } from './sfnt';

/**
 * Hand-rolled WOFF 1.0 (zlib) wrap/unwrap over raw sfnt bytes. ~120 lines
 * beats a font library here because losslessness is the product claim: table
 * bytes are sliced and re-wrapped verbatim — glyphs, hinting, kerning and the
 * original directory checksums all survive untouched, for both TTF ('glyf')
 * and OTF ('OTTO') flavors. Directory order is preserved, not re-sorted, so a
 * wrap→unwrap round-trip of a well-formed font is byte-identical.
 */

const WOFF_SIG = 0x77_4f_46_46; // 'wOFF'
const HEADER_SIZE = 44;
const DIR_ENTRY_SIZE = 20;
const INVALID_WOFF = "This file doesn't look like a valid WOFF font";

const pad4 = (n: number) => (n + 3) & ~3;

/** sfnt → WOFF: per-table zlib, stored raw when zlib isn't smaller (spec rule). */
export function wrapWoff1(sfnt: Uint8Array): Uint8Array {
	const font = readSfnt(sfnt);
	const numTables = font.tables.length;

	const datas = font.tables.map((t) => {
		const orig = sfnt.subarray(t.offset, t.offset + t.length);
		const comp = zlibSync(orig, { level: 9 });
		return comp.length < orig.length ? comp : orig;
	});

	const dirSize = numTables * DIR_ENTRY_SIZE;
	const totalSize = HEADER_SIZE + dirSize + datas.reduce((sum, data) => sum + pad4(data.length), 0);
	const totalSfntSize =
		12 + numTables * 16 + font.tables.reduce((sum, t) => sum + pad4(t.length), 0);

	const out = new Uint8Array(totalSize);
	const dv = new DataView(out.buffer);
	dv.setUint32(0, WOFF_SIG);
	dv.setUint32(4, font.flavor);
	dv.setUint32(8, totalSize);
	dv.setUint16(12, numTables);
	dv.setUint32(16, totalSfntSize);
	// major/minor advertise the FONT's version (like existing tools do) — take
	// head.fontRevision (Fixed 16.16) when present. meta/priv blocks stay 0.
	const head = findTable(sfnt, font, 'head');
	dv.setUint16(20, head && head.length >= 8 ? (head[4] << 8) | head[5] : 1);
	dv.setUint16(22, head && head.length >= 8 ? (head[6] << 8) | head[7] : 0);

	let offset = HEADER_SIZE + dirSize;
	for (let i = 0; i < numTables; i++) {
		const t = font.tables[i];
		const at = HEADER_SIZE + i * DIR_ENTRY_SIZE;
		for (let c = 0; c < 4; c++) out[at + c] = t.tag.charCodeAt(c);
		dv.setUint32(at + 4, offset);
		dv.setUint32(at + 8, datas[i].length);
		dv.setUint32(at + 12, t.length);
		dv.setUint32(at + 16, t.checksum);
		out.set(datas[i], offset);
		offset += pad4(datas[i].length); // zero padding is already in place
	}
	return out;
}

/** WOFF header meta/priv block presence (extended-metadata XML at offsets
 *  24-32, private data at 36-40). These blocks live OUTSIDE the sfnt, so
 *  unwrap→repack drops them — callers owe the user a note when they exist.
 *  Header-only check; never throws (returns false/false on non-WOFF bytes). */
export function woff1ExtraBlocks(woff: Uint8Array): { meta: boolean; priv: boolean } {
	if (woff.length < HEADER_SIZE) return { meta: false, priv: false };
	const dv = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
	if (dv.getUint32(0) !== WOFF_SIG) return { meta: false, priv: false };
	return { meta: dv.getUint32(28) > 0, priv: dv.getUint32(40) > 0 };
}

/** WOFF → sfnt: rebuilds the header/directory, table bytes come out verbatim. */
export function unwrapWoff1(woff: Uint8Array): Uint8Array {
	if (woff.length < HEADER_SIZE) throw new Error(INVALID_WOFF);
	const dv = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
	const flavor = dv.getUint32(4);
	const numTables = dv.getUint16(12);
	if (
		dv.getUint32(0) !== WOFF_SIG ||
		!isSfntFlavor(flavor) ||
		numTables === 0 ||
		numTables > 1024 ||
		woff.length < HEADER_SIZE + numTables * DIR_ENTRY_SIZE
	) {
		throw new Error(INVALID_WOFF);
	}

	interface Entry {
		tag: string;
		checksum: number;
		data: Uint8Array;
	}
	const entries: Entry[] = [];
	for (let i = 0; i < numTables; i++) {
		const at = HEADER_SIZE + i * DIR_ENTRY_SIZE;
		const tag = String.fromCharCode(woff[at], woff[at + 1], woff[at + 2], woff[at + 3]);
		const offset = dv.getUint32(at + 4);
		const compLength = dv.getUint32(at + 8);
		const origLength = dv.getUint32(at + 12);
		const checksum = dv.getUint32(at + 16);
		if (offset + compLength > woff.length || compLength > origLength) {
			throw new Error(INVALID_WOFF);
		}
		const raw = woff.subarray(offset, offset + compLength);
		let data: Uint8Array;
		if (compLength === origLength) {
			data = raw; // stored uncompressed (spec: equal length means raw)
		} else {
			try {
				data = unzlibSync(raw);
			} catch {
				throw new Error(INVALID_WOFF);
			}
			if (data.length !== origLength) throw new Error(INVALID_WOFF);
		}
		entries.push({ tag, checksum, data });
	}

	const dirSize = numTables * 16;
	const total = 12 + dirSize + entries.reduce((sum, e) => sum + pad4(e.data.length), 0);
	const out = new Uint8Array(total);
	const outDv = new DataView(out.buffer);
	outDv.setUint32(0, flavor);
	outDv.setUint16(4, numTables);
	// Binary-search fields per the OpenType header formula.
	const entrySelector = Math.floor(Math.log2(numTables));
	const searchRange = 2 ** entrySelector * 16;
	outDv.setUint16(6, searchRange);
	outDv.setUint16(8, entrySelector);
	outDv.setUint16(10, numTables * 16 - searchRange);

	let offset = 12 + dirSize;
	for (let i = 0; i < numTables; i++) {
		const e = entries[i];
		const at = 12 + i * 16;
		for (let c = 0; c < 4; c++) out[at + c] = e.tag.charCodeAt(c);
		outDv.setUint32(at + 4, e.checksum);
		outDv.setUint32(at + 8, offset);
		outDv.setUint32(at + 12, e.data.length);
		out.set(e.data, offset);
		offset += pad4(e.data.length);
	}
	return out;
}
