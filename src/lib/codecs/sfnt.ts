/**
 * Minimal raw sfnt (TTF/OTF) container reader — table directory only, no
 * glyph parsing. The font pipeline's losslessness rests on this: conversions
 * slice and re-wrap the original table BYTES, they never decompile them.
 */

export interface SfntTable {
	tag: string;
	/** Original directory checksum — carried through repacks, never recomputed. */
	checksum: number;
	offset: number;
	length: number;
}

export interface Sfnt {
	/** sfnt version dword: 0x00010000 / 'true' (glyf) or 'OTTO' (CFF). */
	flavor: number;
	tables: SfntTable[];
}

export const SFNT_TTF = 0x00010000;
export const SFNT_TRUE = 0x74727565; // 'true' — old Apple TrueType
export const SFNT_OTTO = 0x4f54544f; // 'OTTO' — CFF outlines
export const SFNT_TTC = 0x74746366; // 'ttcf' — collection (not convertible per-file)

export function isSfntFlavor(version: number): boolean {
	return version === SFNT_TTF || version === SFNT_TRUE || version === SFNT_OTTO;
}

const INVALID = "This file doesn't look like a valid font";

/** Parses the sfnt header + table directory; throws on anything malformed. */
export function readSfnt(bytes: Uint8Array): Sfnt {
	if (bytes.length < 12) throw new Error(INVALID);
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const flavor = dv.getUint32(0);
	if (!isSfntFlavor(flavor)) throw new Error(INVALID);
	const numTables = dv.getUint16(4);
	// Real fonts carry ~10-30 tables; 1024 is a defensive ceiling, not a spec one.
	if (numTables === 0 || numTables > 1024 || bytes.length < 12 + numTables * 16) {
		throw new Error(INVALID);
	}
	const tables: SfntTable[] = [];
	for (let i = 0; i < numTables; i++) {
		const at = 12 + i * 16;
		const table: SfntTable = {
			tag: String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]),
			checksum: dv.getUint32(at + 4),
			offset: dv.getUint32(at + 8),
			length: dv.getUint32(at + 12)
		};
		if (table.offset < 12 || table.offset + table.length > bytes.length) {
			throw new Error(INVALID);
		}
		tables.push(table);
	}
	return { flavor, tables };
}

/** The raw bytes of one table (a view, not a copy), or null when absent. */
export function findTable(bytes: Uint8Array, sfnt: Sfnt, tag: string): Uint8Array | null {
	const table = sfnt.tables.find((t) => t.tag === tag);
	return table ? bytes.subarray(table.offset, table.offset + table.length) : null;
}
