/** Synthetic sfnt builders for the font codec unit tests — canonical layout
 *  (directory-ordered data, 4-byte aligned, zero padding), so wrap→unwrap
 *  round-trips can assert byte identity, not just content equality. */

export interface RawTable {
	tag: string;
	data: Uint8Array;
	checksum?: number;
}

const pad4 = (n: number) => (n + 3) & ~3;

export function buildSfnt(flavor: number, tables: RawTable[]): Uint8Array {
	const n = tables.length;
	const total = 12 + n * 16 + tables.reduce((sum, t) => sum + pad4(t.data.length), 0);
	const out = new Uint8Array(total);
	const dv = new DataView(out.buffer);
	dv.setUint32(0, flavor);
	dv.setUint16(4, n);
	const entrySelector = Math.floor(Math.log2(n));
	const searchRange = 2 ** entrySelector * 16;
	dv.setUint16(6, searchRange);
	dv.setUint16(8, entrySelector);
	dv.setUint16(10, n * 16 - searchRange);
	let offset = 12 + n * 16;
	tables.forEach((t, i) => {
		const at = 12 + i * 16;
		for (let c = 0; c < 4; c++) out[at + c] = t.tag.charCodeAt(c);
		dv.setUint32(at + 4, t.checksum ?? 0xc0ffee00 + i);
		dv.setUint32(at + 8, offset);
		dv.setUint32(at + 12, t.data.length);
		out.set(t.data, offset);
		offset += pad4(t.data.length);
	});
	return out;
}

/** head table with just the fields the codecs read (54 bytes like the real one). */
export function buildHead(checkSumAdjustment = 0xdeadbeef): Uint8Array {
	const head = new Uint8Array(54);
	const dv = new DataView(head.buffer);
	dv.setUint32(4, 0x00010000); // fontRevision 1.0
	dv.setUint32(8, checkSumAdjustment);
	dv.setUint32(12, 0x5f0f3cf5); // magicNumber
	return head;
}

/** OS/2 version 1 (86 bytes) with recognizable values in the EOT-read fields. */
export function buildOs2(): Uint8Array {
	const os2 = new Uint8Array(86);
	const dv = new DataView(os2.buffer);
	dv.setUint16(0, 1); // version
	dv.setUint16(4, 700); // usWeightClass
	dv.setUint16(8, 8); // fsType
	for (let i = 0; i < 10; i++) os2[32 + i] = i + 1; // PANOSE 1..10
	dv.setUint32(42, 0x11111111);
	dv.setUint32(46, 0x22222222);
	dv.setUint32(50, 0x33333333);
	dv.setUint32(54, 0x44444444);
	dv.setUint16(62, 0x0001); // fsSelection: italic
	dv.setUint32(78, 0xaaaa5555);
	dv.setUint32(82, 0x0000ffff);
	return os2;
}

/** name table with Windows-Unicode (3,1,0x409) records for the given ids. */
export function buildName(entries: Record<number, string>): Uint8Array {
	const ids = Object.keys(entries).map(Number);
	const strings = ids.map((id) => {
		const value = entries[id];
		const bytes = new Uint8Array(value.length * 2);
		for (let i = 0; i < value.length; i++) {
			bytes[i * 2] = value.charCodeAt(i) >> 8; // UTF-16BE in the table
			bytes[i * 2 + 1] = value.charCodeAt(i) & 0xff;
		}
		return bytes;
	});
	const stringsAt = 6 + ids.length * 12;
	const total = stringsAt + strings.reduce((sum, s) => sum + s.length, 0);
	const out = new Uint8Array(total);
	const dv = new DataView(out.buffer);
	dv.setUint16(2, ids.length);
	dv.setUint16(4, stringsAt);
	let offset = 0;
	ids.forEach((id, i) => {
		const at = 6 + i * 12;
		dv.setUint16(at, 3); // platform: Windows
		dv.setUint16(at + 2, 1); // encoding: Unicode BMP
		dv.setUint16(at + 4, 0x0409); // language: en-US
		dv.setUint16(at + 6, id);
		dv.setUint16(at + 8, strings[i].length);
		dv.setUint16(at + 10, offset);
		out.set(strings[i], stringsAt + offset);
		offset += strings[i].length;
	});
	return out;
}

export interface FvarAxisSpec {
	tag: string;
	min: number;
	def: number;
	max: number;
	hidden?: boolean;
}

/** Minimal spec-shaped fvar table (header + axis records, no instances). */
export function buildFvar(axes: FvarAxisSpec[]): Uint8Array {
	const out = new Uint8Array(16 + axes.length * 20);
	const dv = new DataView(out.buffer);
	dv.setUint16(0, 1); // majorVersion
	dv.setUint16(4, 16); // axesArrayOffset
	dv.setUint16(6, 2); // reserved (spec: set to 2)
	dv.setUint16(8, axes.length);
	dv.setUint16(10, 20); // axisSize
	axes.forEach((axis, i) => {
		const at = 16 + i * 20;
		for (let c = 0; c < 4; c++) out[at + c] = axis.tag.charCodeAt(c);
		dv.setInt32(at + 4, Math.round(axis.min * 65536));
		dv.setInt32(at + 8, Math.round(axis.def * 65536));
		dv.setInt32(at + 12, Math.round(axis.max * 65536));
		dv.setUint16(at + 16, axis.hidden ? 0x1 : 0);
		dv.setUint16(at + 18, 256 + i); // axisNameID
	});
	return out;
}

/** Deterministic pseudo-random bytes — incompressible, so zlib can't win. */
export function noiseBytes(length: number, seed = 0x2f6e2b1): Uint8Array {
	const out = new Uint8Array(length);
	let state = seed;
	for (let i = 0; i < length; i++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		out[i] = state >>> 24;
	}
	return out;
}
