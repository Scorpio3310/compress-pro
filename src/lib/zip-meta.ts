/**
 * Minimal ZIP central-directory reader for the fflate fast paths in
 * compress.ts. fflate 0.8 never looks at general-purpose bit 0, so a
 * ZipCrypto STORED entry "extracts" as 12 bytes of key header plus XOR
 * ciphertext with no error — and names without the UTF-8 flag are decoded
 * as latin1, although legacy Windows/DOS archivers wrote them in cp437
 * (accented letters land on invisible C1 controls). This parser recovers
 * both signals up front so the caller can route encrypted zips to the 7z
 * worker and label legacy entries correctly.
 *
 * Returns null whenever the directory can't be walked confidently (zip64
 * markers, truncated or non-zip bytes) — callers must then keep fflate's
 * existing behavior unchanged.
 */

export interface ZipEntryMeta {
	/** The name exactly as fflate will key this entry (UTF-8 flag honored, latin1 otherwise). */
	fflateName: string;
	/** The correctly decoded name: UTF-8 when flagged, cp437 (the DOS/Windows default) otherwise. */
	name: string;
	/** General-purpose bit 0 — ZipCrypto or AES payload. */
	encrypted: boolean;
}

/** cp437 0x80–0xFF (0x00–0x7F is ASCII); 0xFF is a non-breaking space. */
const CP437_HIGH =
	'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0';

function decodeCp437(bytes: Uint8Array): string {
	let out = '';
	for (const b of bytes) out += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80];
	return out;
}

/** Byte-for-byte charcode mapping — exactly fflate's non-UTF-8 decode. */
function decodeLatin1(bytes: Uint8Array): string {
	let out = '';
	for (const b of bytes) out += String.fromCharCode(b);
	return out;
}

const utf8 = new TextDecoder();

const EOCD_SIG = 0x06054b50;
const CDE_SIG = 0x02014b50;

export function readZipEntryMeta(bytes: Uint8Array): ZipEntryMeta[] | null {
	if (bytes.length < 22) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	// End-of-central-directory: fixed 22 bytes plus a comment of up to 64 KB —
	// scan back for the signature, exactly the window fflate itself searches.
	let eocd = -1;
	const stop = Math.max(0, bytes.length - 22 - 65535);
	for (let i = bytes.length - 22; i >= stop; i--) {
		if (view.getUint32(i, true) === EOCD_SIG) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) return null;
	const entryCount = view.getUint16(eocd + 10, true);
	const cdOffset = view.getUint32(eocd + 16, true);
	// Zip64 sentinel values — bail rather than misread.
	if (entryCount === 0xffff || cdOffset === 0xffffffff) return null;

	const entries: ZipEntryMeta[] = [];
	let at = cdOffset;
	for (let i = 0; i < entryCount; i++) {
		if (at + 46 > bytes.length || view.getUint32(at, true) !== CDE_SIG) return null;
		const flags = view.getUint16(at + 8, true);
		const nameLen = view.getUint16(at + 28, true);
		const extraLen = view.getUint16(at + 30, true);
		const commentLen = view.getUint16(at + 32, true);
		if (at + 46 + nameLen > bytes.length) return null;
		const nameBytes = bytes.subarray(at + 46, at + 46 + nameLen);
		const isUtf8 = (flags & 0x800) !== 0;
		entries.push({
			fflateName: isUtf8 ? utf8.decode(nameBytes) : decodeLatin1(nameBytes),
			name: isUtf8 ? utf8.decode(nameBytes) : decodeCp437(nameBytes),
			encrypted: (flags & 0x1) !== 0
		});
		at += 46 + nameLen + extraLen + commentLen;
	}
	return entries;
}

/** C1 controls (U+0080–U+009F): invisible in row labels and download names,
 *  and NOT covered by sanitizeEntryName's C0 strip — they reach entry names
 *  via latin1-decoded legacy zips and hostile archives alike. */
export function stripC1(name: string): string {
	return name.replace(/[\u0080-\u009f]/g, '');
}
