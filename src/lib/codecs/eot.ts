import { findTable, isSfntFlavor, readSfnt, type Sfnt } from './sfnt';

/**
 * Plain (uncompressed) EOT wrap/unwrap. An EOT is the raw sfnt prefixed with
 * a little-endian metadata header — wrapping reads the few needed fields
 * straight from the OS/2, head and name tables and never recompiles the font,
 * so this path is as lossless as the WOFF one. Legacy MicroType-Express
 *-compressed EOTs (WEFT-era) can't be decoded in a browser and are rejected
 * with an actionable message; XOR-obfuscated ones are trivially decoded.
 */

const EOT_MAGIC = 0x504c;
const EOT_VERSION = 0x00020001; // what ttf2eot and friends write
const EOT_VERSIONS = new Set([0x00010000, 0x00020001, 0x00020002]);
const TTEMBED_TTCOMPRESSED = 0x00000004;
const TTEMBED_XORENCRYPTDATA = 0x10000000;
const INVALID_EOT = "This file doesn't look like a valid EOT font";

/** EOT → sfnt. The font data is stored verbatim as the trailing FontDataSize
 *  bytes of the structure — located via the size fields, so the variable-
 *  length name strings in the header never need walking. */
export function unwrapEot(bytes: Uint8Array): Uint8Array {
	if (bytes.length < 82) throw new Error(INVALID_EOT);
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const eotSize = dv.getUint32(0, true);
	const fontDataSize = dv.getUint32(4, true);
	if (dv.getUint16(34, true) !== EOT_MAGIC || !EOT_VERSIONS.has(dv.getUint32(8, true))) {
		throw new Error(INVALID_EOT);
	}
	const flags = dv.getUint32(12, true);
	if (flags & TTEMBED_TTCOMPRESSED) {
		throw new Error(
			'This EOT uses MicroType Express compression, which browsers cannot decode — ' +
				'convert the original TTF/OTF instead'
		);
	}
	// Generators disagree on whether EOTSize includes trailing padding — accept
	// the slice (structure-relative or file-relative) that starts like an sfnt.
	for (const end of [eotSize, bytes.length]) {
		const start = end - fontDataSize;
		if (start < 82 || end > bytes.length) continue;
		const data = bytes.slice(start, end);
		if (flags & TTEMBED_XORENCRYPTDATA) {
			for (let i = 0; i < data.length; i++) data[i] ^= 0x50;
		}
		if (data.length >= 4 && isSfntFlavor(new DataView(data.buffer).getUint32(0))) return data;
	}
	throw new Error(INVALID_EOT);
}

// --- wrap ---

function decodeUtf16Be(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i + 1 < bytes.length; i += 2)
		s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
	return s;
}

/** Best-effort name-table string: Windows Unicode records first (the ones EOT
 *  header consumers were built around), Unicode platform next, Mac last. */
function readName(name: Uint8Array | null, nameId: number): string {
	if (!name || name.length < 6) return '';
	const dv = new DataView(name.buffer, name.byteOffset, name.byteLength);
	const count = dv.getUint16(2);
	const stringsAt = dv.getUint16(4);
	interface Candidate {
		rank: number;
		bytes: Uint8Array;
		mac: boolean;
	}
	let best: Candidate | null = null;
	for (let i = 0; i < count; i++) {
		const at = 6 + i * 12;
		if (at + 12 > name.length) break;
		if (dv.getUint16(at + 6) !== nameId) continue;
		const platform = dv.getUint16(at);
		const encoding = dv.getUint16(at + 2);
		const language = dv.getUint16(at + 4);
		const length = dv.getUint16(at + 8);
		const offset = stringsAt + dv.getUint16(at + 10);
		if (offset + length > name.length) continue;
		const rank =
			platform === 3 && (encoding === 1 || encoding === 10)
				? language === 0x0409
					? 0
					: 1
				: platform === 0
					? 2
					: 3;
		if (!best || rank < best.rank) {
			best = { rank, bytes: name.subarray(offset, offset + length), mac: platform === 1 };
		}
	}
	if (!best) return '';
	// Mac strings are single-byte (Roman in practice) — good enough for ASCII names.
	return best.mac ? String.fromCharCode(...best.bytes) : decodeUtf16Be(best.bytes);
}

/** sfnt → EOT (version 0x00020001, empty root string — the ttf2eot shape). */
export function wrapEot(sfnt: Uint8Array): Uint8Array {
	const font: Sfnt = readSfnt(sfnt);
	const os2 = findTable(sfnt, font, 'OS/2');
	const head = findTable(sfnt, font, 'head');
	const name = findTable(sfnt, font, 'name');
	const os2Dv = os2 ? new DataView(os2.buffer, os2.byteOffset, os2.byteLength) : null;

	// UTF-16LE, byte length prefixed, in the header's fixed field order.
	const strings = [1, 2, 5, 4].map((id) => {
		const value = readName(name, id);
		const bytes = new Uint8Array(value.length * 2);
		for (let i = 0; i < value.length; i++) {
			const code = value.charCodeAt(i);
			bytes[i * 2] = code & 0xff;
			bytes[i * 2 + 1] = code >> 8;
		}
		return bytes;
	});

	// 80 fixed bytes, then (padding + size + bytes) per string, closed by
	// Padding5 + empty RootStringSize (4 bytes).
	const headerSize = 80 + strings.reduce((sum, s) => sum + s.length + 4, 0) + 4;
	const out = new Uint8Array(headerSize + sfnt.length);
	const dv = new DataView(out.buffer);
	dv.setUint32(0, out.length, true);
	dv.setUint32(4, sfnt.length, true);
	dv.setUint32(8, EOT_VERSION, true);
	dv.setUint32(12, 0, true); // flags: plain, uncompressed
	if (os2 && os2.length >= 42) out.set(os2.subarray(32, 42), 16); // PANOSE
	out[26] = 0x01; // DEFAULT_CHARSET
	out[27] = os2Dv && os2Dv.byteLength >= 64 ? os2Dv.getUint16(62) & 0x01 : 0; // fsSelection italic bit
	dv.setUint32(28, os2Dv && os2Dv.byteLength >= 6 ? os2Dv.getUint16(4) : 400, true); // usWeightClass
	dv.setUint16(32, os2Dv && os2Dv.byteLength >= 10 ? os2Dv.getUint16(8) : 0, true); // fsType (embedding rights)
	dv.setUint16(34, EOT_MAGIC, true);
	for (let i = 0; i < 4; i++) {
		dv.setUint32(
			36 + i * 4,
			os2Dv && os2Dv.byteLength >= 58 ? os2Dv.getUint32(42 + i * 4) : 0,
			true
		);
	}
	for (let i = 0; i < 2; i++) {
		dv.setUint32(
			52 + i * 4,
			os2Dv && os2Dv.byteLength >= 86 ? os2Dv.getUint32(78 + i * 4) : 0,
			true
		);
	}
	if (head && head.length >= 12) {
		dv.setUint32(60, new DataView(head.buffer, head.byteOffset).getUint32(8), true); // checkSumAdjustment
	}
	// Reserved1-4 stay 0. Strings: Padding1 precedes FamilyName's size field.
	let at = 80;
	for (const s of strings) {
		dv.setUint16(at, 0, true); // padding
		dv.setUint16(at + 2, s.length, true);
		out.set(s, at + 4);
		at += 4 + s.length;
	}
	dv.setUint16(at, 0, true); // Padding5
	dv.setUint16(at + 2, 0, true); // RootStringSize (none)
	out.set(sfnt, headerSize);
	return out;
}
