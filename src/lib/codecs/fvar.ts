import { findTable, readSfnt } from './sfnt';

/** One fvar variation axis, values in user/design coordinates. */
export interface FvarAxis {
	tag: string;
	min: number;
	def: number;
	max: number;
	/** HIDDEN_AXIS flag — internal axes UIs are meant to leave alone. */
	hidden: boolean;
}

const fixed = (dv: DataView, at: number) => dv.getInt32(at) / 65536;

/**
 * Variation axes of a raw sfnt, [] when the font isn't variable. Malformed
 * fvar data also yields [] — probing must never take an upload down.
 */
export function parseFvar(sfnt: Uint8Array): FvarAxis[] {
	let fvar: Uint8Array | null;
	try {
		fvar = findTable(sfnt, readSfnt(sfnt), 'fvar');
	} catch {
		return [];
	}
	if (!fvar || fvar.length < 16) return [];
	const dv = new DataView(fvar.buffer, fvar.byteOffset, fvar.byteLength);
	const axesArrayOffset = dv.getUint16(4);
	const axisCount = dv.getUint16(8);
	const axisSize = dv.getUint16(10);
	if (axisSize < 20 || axesArrayOffset + axisCount * axisSize > fvar.length) return [];
	const axes: FvarAxis[] = [];
	for (let i = 0; i < axisCount; i++) {
		const at = axesArrayOffset + i * axisSize;
		axes.push({
			tag: String.fromCharCode(fvar[at], fvar[at + 1], fvar[at + 2], fvar[at + 3]),
			min: fixed(dv, at + 4),
			def: fixed(dv, at + 8),
			max: fixed(dv, at + 12),
			hidden: (dv.getUint16(at + 16) & 0x1) !== 0
		});
	}
	return axes;
}
