/**
 * Post-extraction entry-name repair for legacy zips on the 7zz worker path.
 *
 * The 7z-wasm build converts non-UTF-8 entry names through a LOSSY
 * surrogate-escape path before writing to MEMFS (probe 2026-07-18: cp437
 * "Résumé.pdf" → 2 astral garbage codepoints; 8 name bytes collapse into
 * 42 recoverable bits, and `-mcp=…` is rejected with E_INVALIDARG), so the
 * garbled names can NEVER be un-mangled from the filesystem side. The zip's
 * own central directory still holds the pristine name bytes though — this
 * module reads it (two small range reads, never the whole archive), decodes
 * unflagged non-UTF-8 names as cp437 (the DOS/Windows legacy default, same
 * table as $lib/zip-meta which serves the fflate fast path), and lets the
 * worker re-label extracted entries by CRC-32 + size match. CRC+size pairs
 * that are ambiguous inside the archive are dropped rather than guessed.
 *
 * Pure and worker-safe: no wasm, no DOM — node-unit-testable like
 * sevenzip-args.
 */

/** cp437 0x80–0xFF (0x00–0x7F is ASCII); 0xFF is a non-breaking space. */
const CP437_HIGH =
	'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

function decodeCp437(bytes: Uint8Array): string {
	let out = '';
	for (const b of bytes) out += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80];
	return out;
}

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

function isValidUtf8(bytes: Uint8Array): boolean {
	try {
		strictUtf8.decode(bytes);
		return true;
	} catch {
		return false;
	}
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

/** Standard CRC-32 (the zip polynomial), unsigned. */
export function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

const EOCD_SIG = 0x06054b50;
const CDE_SIG = 0x02014b50;

export type RangeReader = (start: number, end: number) => Promise<Uint8Array>;

/**
 * Reads the central directory via `read` (worker: File.slice — the archive is
 * never buffered whole) and returns `crc:size` → correctly-decoded path for
 * every entry whose stored name the 7zz engine is known to mangle: no UTF-8
 * flag AND high bytes AND not valid UTF-8 (the engine passes valid UTF-8
 * through unchanged, flagged or not — verified empirically). Returns null
 * when the bytes are not a walkable zip (zip64, truncated, not a zip), and
 * an empty map when there is simply nothing to repair.
 */
export async function zipLegacyNameMap(
	fileSize: number,
	read: RangeReader
): Promise<Map<string, string> | null> {
	if (fileSize < 22) return null;
	// End-of-central-directory: fixed 22 bytes plus a comment of up to 64 KB.
	const tailStart = Math.max(0, fileSize - 22 - 65535);
	const tail = await read(tailStart, fileSize);
	const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
	let eocd = -1;
	for (let i = tail.length - 22; i >= 0; i--) {
		if (tailView.getUint32(i, true) === EOCD_SIG) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) return null;
	const entryCount = tailView.getUint16(eocd + 10, true);
	const cdSize = tailView.getUint32(eocd + 12, true);
	const cdOffset = tailView.getUint32(eocd + 16, true);
	// Zip64 sentinels or nonsense geometry — bail rather than misread.
	if (entryCount === 0xffff || cdOffset === 0xffffffff) return null;
	if (cdOffset + cdSize > fileSize) return null;

	const cd = await read(cdOffset, cdOffset + cdSize);
	const view = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
	const map = new Map<string, string>();
	const ambiguous = new Set<string>();
	let at = 0;
	for (let i = 0; i < entryCount; i++) {
		if (at + 46 > cd.length || view.getUint32(at, true) !== CDE_SIG) return null;
		const flags = view.getUint16(at + 8, true);
		const crc = view.getUint32(at + 16, true);
		const size = view.getUint32(at + 24, true);
		const nameLen = view.getUint16(at + 28, true);
		const extraLen = view.getUint16(at + 30, true);
		const commentLen = view.getUint16(at + 32, true);
		if (at + 46 + nameLen > cd.length) return null;
		const nameBytes = cd.subarray(at + 46, at + 46 + nameLen);
		at += 46 + nameLen + extraLen + commentLen;

		const isUtf8Flagged = (flags & 0x800) !== 0;
		const hasHighBytes = nameBytes.some((b) => b >= 0x80);
		const isDirectory = nameLen > 0 && nameBytes[nameLen - 1] === 0x2f; // trailing '/'
		if (isUtf8Flagged || !hasHighBytes || isDirectory) continue;
		if (isValidUtf8(nameBytes)) continue; // engine passes these through fine

		const key = `${crc >>> 0}:${size}`;
		if (ambiguous.has(key)) continue;
		if (map.has(key)) {
			// Two mangle-prone entries with identical bytes — renaming either
			// one would be a guess. Leave both engine names alone.
			map.delete(key);
			ambiguous.add(key);
			continue;
		}
		map.set(key, decodeCp437(nameBytes));
	}
	return map;
}

/** Re-labels extracted entries whose content matches a repair key; returns
 *  how many were renamed. Entries without a match keep the engine's name. */
export function applyNameRepairs(
	entries: { path: string; size: number; bytes: Uint8Array }[],
	repairs: Map<string, string>
): number {
	if (repairs.size === 0) return 0;
	let renamed = 0;
	for (const entry of entries) {
		const repaired = repairs.get(`${crc32(entry.bytes)}:${entry.size}`);
		if (repaired !== undefined && repaired !== entry.path) {
			entry.path = repaired;
			renamed++;
		}
	}
	return renamed;
}
