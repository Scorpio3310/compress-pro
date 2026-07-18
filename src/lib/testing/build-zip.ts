/**
 * Hand-rolled STORED-entry zip writer for tests: every header field (flags,
 * name bytes, method) is under direct control, which fflate's own writers
 * don't allow (they pick the UTF-8 flag themselves and can't set the
 * encryption bit). Stored entries also keep fflate's async unzip fully
 * synchronous — no worker spawn in the node test env.
 *
 * Test-only module: never import from app code.
 */

export interface TestZipEntry {
	/** Raw name bytes exactly as they'll sit in both headers (cp437, utf8, …). */
	nameBytes: Uint8Array;
	data: Uint8Array;
	/** General-purpose flags word (0x1 = encrypted, 0x800 = UTF-8 name). */
	flags: number;
	comment?: string;
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

export function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

export function buildZip(entries: TestZipEntry[]): Uint8Array {
	const enc = new TextEncoder();
	const locals: Uint8Array[] = [];
	const centrals: Uint8Array[] = [];
	let offset = 0;

	for (const e of entries) {
		const crc = crc32(e.data);
		const local = new Uint8Array(30 + e.nameBytes.length + e.data.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(4, 20, true); // version needed
		lv.setUint16(6, e.flags, true);
		lv.setUint16(8, 0, true); // method: stored
		lv.setUint32(14, crc, true);
		lv.setUint32(18, e.data.length, true); // compressed size (stored = raw)
		lv.setUint32(22, e.data.length, true); // uncompressed size
		lv.setUint16(26, e.nameBytes.length, true);
		local.set(e.nameBytes, 30);
		local.set(e.data, 30 + e.nameBytes.length);
		locals.push(local);

		const commentBytes = enc.encode(e.comment ?? '');
		const central = new Uint8Array(46 + e.nameBytes.length + commentBytes.length);
		const cv = new DataView(central.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(4, 20, true); // version made by
		cv.setUint16(6, 20, true); // version needed
		cv.setUint16(8, e.flags, true);
		cv.setUint16(10, 0, true); // method: stored
		cv.setUint32(16, crc, true);
		cv.setUint32(20, e.data.length, true);
		cv.setUint32(24, e.data.length, true);
		cv.setUint16(28, e.nameBytes.length, true);
		cv.setUint16(32, commentBytes.length, true);
		cv.setUint32(42, offset, true); // local header offset
		central.set(e.nameBytes, 46);
		central.set(commentBytes, 46 + e.nameBytes.length);
		centrals.push(central);

		offset += local.length;
	}

	const cdSize = centrals.reduce((sum, c) => sum + c.length, 0);
	const eocd = new Uint8Array(22);
	const ev = new DataView(eocd.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, entries.length, true); // entries on this disk
	ev.setUint16(10, entries.length, true); // entries total
	ev.setUint32(12, cdSize, true);
	ev.setUint32(16, offset, true); // central directory offset
	const parts = [...locals, ...centrals, eocd];
	const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}
