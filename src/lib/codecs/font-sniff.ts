import { SFNT_OTTO, SFNT_TRUE, SFNT_TTC, SFNT_TTF } from './sfnt';

/** 'ttc' is sniffable but not convertible — the worker rejects it with a hint. */
export type FontContainer = 'ttf' | 'otf' | 'woff' | 'woff2' | 'eot' | 'ttc';

export interface FontSniff {
	container: FontContainer;
	/** Outline flavor when the header carries it (sfnt directly; WOFF/WOFF2
	 *  restate the inner sfnt version). EOT hides it behind its header. */
	flavor: 'glyf' | 'cff' | null;
}

const WOFF_SIG = 0x774f4646; // 'wOFF'
const WOFF2_SIG = 0x774f4632; // 'wOF2'
const EOT_MAGIC = 0x504c;
const EOT_VERSIONS = new Set([0x00010000, 0x00020001, 0x00020002]);

function sfntFlavor(version: number): 'glyf' | 'cff' | null {
	if (version === SFNT_TTF || version === SFNT_TRUE) return 'glyf';
	if (version === SFNT_OTTO) return 'cff';
	return null;
}

/**
 * Container detection from magic bytes — extensions and MIMEs lie (pickers
 * blank font MIMEs, files get renamed), the first dword doesn't. All four
 * bytes are always checked: 2-byte prefixes false-positive (a corrupt JPEG
 * fixture famously starts 00 01). Returns null for anything unrecognized.
 */
export function sniffFont(bytes: Uint8Array): FontSniff | null {
	if (bytes.length < 12) return null;
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const magic = dv.getUint32(0);

	const asSfnt = sfntFlavor(magic);
	if (asSfnt) return { container: asSfnt === 'cff' ? 'otf' : 'ttf', flavor: asSfnt };
	if (magic === SFNT_TTC) return { container: 'ttc', flavor: null };
	if (magic === WOFF_SIG || magic === WOFF2_SIG) {
		return {
			container: magic === WOFF_SIG ? 'woff' : 'woff2',
			flavor: sfntFlavor(dv.getUint32(4))
		};
	}
	// EOT is little-endian with no leading magic — identify via the magic
	// number field at offset 34 plus a known header version at offset 8.
	if (
		bytes.length >= 36 &&
		dv.getUint16(34, true) === EOT_MAGIC &&
		EOT_VERSIONS.has(dv.getUint32(8, true))
	) {
		return { container: 'eot', flavor: null };
	}
	return null;
}
