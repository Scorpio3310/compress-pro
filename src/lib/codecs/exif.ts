/**
 * Lossless metadata removal for JPEG/PNG/WebP — pure byte surgery, no
 * re-encode: metadata segments/chunks are cut out and the untouched image
 * data is copied verbatim, so pixels stay byte-identical. The strip runs in
 * the image worker (buffers are TRANSFERRED both ways, so the off-main-thread
 * move costs nothing) — a batch of photos used to jank the progress UI with
 * serialized main-thread memcpys. The pure helpers stay main-thread-importable:
 * exif-copy.ts (keep-metadata re-encode path) and the unit tests use them.
 *
 * Always removed: EXIF, XMP (incl. extended), Photoshop APP13, JPEG comments,
 * PNG text/time chunks. ICC color profiles only with `removeIcc` (they change
 * how colors render). The EXIF orientation tag is the one useful bit — when
 * present it is written back as a minimal single-tag EXIF so phone photos
 * keep displaying upright.
 */
import { readExifSummary, TiffReader, type ExifSummary } from './exif-parse';

export interface ExifStripOptions {
	removeIcc: boolean;
}

export interface StripBytesResult {
	bytes: Uint8Array;
	/** Sniffed MIME of the input (extensions lie) — for rebuilding the Blob. */
	mime: string;
	/** Human summary of what was found/removed — shown under the result row. */
	info: string;
	removedAnything: boolean;
}

interface Removed {
	exif: number;
	xmp: number;
	comments: number;
	app13: number;
	icc: number;
	textChunks: number;
}

interface StripOutput {
	bytes: Uint8Array;
	summary: ExifSummary | null;
	/** EXIF was present but unparseable (still removed). */
	unreadable: boolean;
	removed: Removed;
	/** MPF index dropped because its offsets couldn't be rewritten safely. */
	mpfDropped?: boolean;
}

const noRemovals = (): Removed => ({
	exif: 0,
	xmp: 0,
	comments: 0,
	app13: 0,
	icc: 0,
	textChunks: 0
});

const removedAnything = (r: Removed): boolean =>
	r.exif + r.xmp + r.comments + r.app13 + r.icc + r.textChunks > 0;

// ------------------------------------------------------------------- crc32

let CRC_TABLE: Uint32Array | null = null;

/** Standard CRC-32 (poly 0xEDB88320) — PNG chunk checksums. */
export function crc32(bytes: Uint8Array): number {
	if (!CRC_TABLE) {
		CRC_TABLE = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			CRC_TABLE[n] = c >>> 0;
		}
	}
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

// -------------------------------------------------- minimal EXIF (26 bytes)

/**
 * Little-endian TIFF whose IFD0 holds exactly one SHORT tag: 0x0112
 * orientation. Reused verbatim inside a JPEG APP1, a PNG eXIf chunk and a
 * WebP EXIF chunk.
 */
export function buildMinimalExifTiff(orientation: number): Uint8Array {
	const tiff = new Uint8Array(26);
	const view = new DataView(tiff.buffer);
	tiff[0] = 0x49; // 'I'
	tiff[1] = 0x49; // 'I'
	view.setUint16(2, 42, true);
	view.setUint32(4, 8, true); // IFD0 at offset 8
	view.setUint16(8, 1, true); // one entry
	view.setUint16(10, 0x0112, true); // Orientation
	view.setUint16(12, 3, true); // SHORT
	view.setUint32(14, 1, true); // count
	view.setUint16(18, orientation, true); // value (inline, low bytes first)
	view.setUint32(22, 0, true); // no next IFD
	return tiff;
}

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

function startsWith(bytes: Uint8Array, offset: number, prefix: number[] | string): boolean {
	if (typeof prefix === 'string') {
		for (let i = 0; i < prefix.length; i++) {
			if (bytes[offset + i] !== prefix.charCodeAt(i)) return false;
		}
		return true;
	}
	for (let i = 0; i < prefix.length; i++) {
		if (bytes[offset + i] !== prefix[i]) return false;
	}
	return true;
}

function concat(parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, p) => sum + p.length, 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

// -------------------------------------------------------------------- JPEG

/** Wraps the minimal TIFF into a complete APP1 segment (36 bytes). */
function buildJpegOrientationApp1(orientation: number): Uint8Array {
	const tiff = buildMinimalExifTiff(orientation);
	const payloadLength = EXIF_HEADER.length + tiff.length; // 32
	const segment = new Uint8Array(4 + payloadLength);
	segment[0] = 0xff;
	segment[1] = 0xe1;
	segment[2] = (payloadLength + 2) >> 8;
	segment[3] = (payloadLength + 2) & 0xff;
	segment.set(EXIF_HEADER, 4);
	segment.set(tiff, 10);
	return segment;
}

/**
 * MPF (Multi-Picture Format, APP2 "MPF\0") stores byte offsets to secondary
 * embedded images (iPhone HDR gain maps, MPO pairs) RELATIVE to its own TIFF
 * header. Those images live in the verbatim tail after the primary EOI, so
 * removing metadata between the MPF header and the tail silently breaks the
 * offsets. This rewrites every non-zero MP Entry data offset by `delta`;
 * anything unexpected throws and the caller drops the MPF segment instead
 * (the photo still displays — only the secondary-image index is lost).
 */
function shiftMpfOffsets(segment: Uint8Array, delta: number): void {
	// Segment layout: FF E2 <len:2> 'M' 'P' 'F' 0 <TIFF…>
	const tiff = segment.subarray(8);
	const reader = new TiffReader(tiff);
	const ifd0 = reader.readIfd(reader.ifd0Offset());
	const mpEntry = ifd0.get(0xb002); // MP Entry: 16 bytes per image
	if (!mpEntry) throw new Error('MPF: no MP Entry tag');
	if (mpEntry.type !== 7 || mpEntry.count % 16 !== 0) {
		throw new Error('MPF: unexpected MP Entry shape');
	}
	const view = new DataView(segment.buffer, segment.byteOffset + 8, tiff.length);
	for (let j = 0; j < mpEntry.count / 16; j++) {
		const at = mpEntry.valueOffset + j * 16 + 8; // dataOffset field
		if (at + 4 > tiff.length) throw new Error('MPF: entry out of bounds');
		const offset = view.getUint32(at, reader.littleEndian);
		if (offset === 0) continue; // the primary image is 0 by spec
		const next = offset + delta;
		if (next <= 0 || !Number.isSafeInteger(next)) throw new Error('MPF: shifted offset invalid');
		view.setUint32(at, next, reader.littleEndian);
	}
}

export function stripJpegBytes(bytes: Uint8Array, opts: ExifStripOptions): StripOutput {
	const removed = noRemovals();
	let summary: ExifSummary | null = null;
	let unreadable = false;

	const kept: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
	// Index in `kept` after which the orientation APP1 belongs (after any
	// leading APP0 JFIF block, per the EXIF-in-JFIF convention).
	let spliceIndex = 1;
	let sawNonApp0 = false;
	// MPF bookkeeping: input offsets of the kept MPF segment and of the
	// verbatim tail, so their relative shift can be measured after surgery.
	let mpfPiece: Uint8Array | null = null;
	let mpfInOffset = -1;
	let tailPiece: Uint8Array | null = null;
	let tailInOffset = -1;

	let i = 2;
	while (i < bytes.length) {
		// Tolerate fill bytes between segments.
		if (bytes[i] === 0xff && bytes[i + 1] === 0xff) {
			i++;
			continue;
		}
		if (bytes[i] !== 0xff) throw new Error('Corrupt JPEG: expected a segment marker');
		const marker = bytes[i + 1];

		if (marker === 0xda) {
			// SOS: entropy-coded data (plus any later scans/EOI/trailers) is
			// copied verbatim — nothing after this point is touched.
			tailPiece = bytes.subarray(i);
			tailInOffset = i;
			kept.push(tailPiece);
			break;
		}
		if (i + 4 > bytes.length) throw new Error('Corrupt JPEG: truncated segment header');
		const length = (bytes[i + 2] << 8) | bytes[i + 3];
		if (length < 2 || i + 2 + length > bytes.length) {
			throw new Error('Corrupt JPEG: segment length out of bounds');
		}
		const segment = bytes.subarray(i, i + 2 + length);
		const payload = i + 4;

		let drop = false;
		if (marker === 0xe1 && startsWith(bytes, payload, EXIF_HEADER)) {
			drop = true;
			removed.exif++;
			if (!summary && !unreadable) {
				try {
					summary = readExifSummary(bytes.subarray(payload, i + 2 + length));
				} catch {
					unreadable = true;
				}
			}
		} else if (
			marker === 0xe1 &&
			(startsWith(bytes, payload, 'http://ns.adobe.com/xap/1.0/') ||
				startsWith(bytes, payload, 'http://ns.adobe.com/xmp/extension/'))
		) {
			drop = true;
			removed.xmp++;
		} else if (marker === 0xed && startsWith(bytes, payload, 'Photoshop 3.0\0')) {
			drop = true;
			removed.app13++;
		} else if (marker === 0xfe) {
			drop = true;
			removed.comments++;
		} else if (marker === 0xe2 && startsWith(bytes, payload, 'ICC_PROFILE\0')) {
			// Multi-segment profiles: keep = every part verbatim, remove = all
			// parts — reassembly is never needed.
			if (opts.removeIcc) {
				drop = true;
				removed.icc++;
			}
		}

		if (!drop) {
			if (!mpfPiece && marker === 0xe2 && startsWith(bytes, payload, 'MPF\0')) {
				// Mutable copy — its data offsets may need rewriting below.
				mpfPiece = new Uint8Array(segment);
				mpfInOffset = i;
				kept.push(mpfPiece);
			} else {
				kept.push(segment);
			}
			if (marker === 0xe0 && !sawNonApp0) {
				spliceIndex = kept.length; // orientation goes after the JFIF block
			} else {
				sawNonApp0 = true;
			}
		}
		i += 2 + length;
	}

	if (summary?.orientation && summary.orientation !== 1) {
		kept.splice(spliceIndex, 0, buildJpegOrientationApp1(summary.orientation));
	}

	// Keep the MPF index pointing at the right bytes: its offsets are relative
	// to its own TIFF header, so only the CHANGE in (tail − MPF) distance
	// matters — removals before the MPF shift both equally and cancel out.
	let mpfDropped = false;
	if (mpfPiece && tailPiece) {
		const outOffsetOf = (piece: Uint8Array): number => {
			let at = 0;
			for (const part of kept) {
				if (part === piece) return at;
				at += part.length;
			}
			throw new Error('MPF: piece vanished'); // unreachable
		};
		const delta = outOffsetOf(tailPiece) - tailInOffset - (outOffsetOf(mpfPiece) - mpfInOffset);
		if (delta !== 0) {
			try {
				shiftMpfOffsets(mpfPiece, delta);
			} catch {
				kept.splice(kept.indexOf(mpfPiece), 1);
				mpfDropped = true;
			}
		}
	}

	return { bytes: concat(kept), summary, unreadable, removed, mpfDropped };
}

// --------------------------------------------------------------------- PNG

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function buildPngExifChunk(orientation: number): Uint8Array {
	const tiff = buildMinimalExifTiff(orientation);
	const chunk = new Uint8Array(12 + tiff.length);
	const view = new DataView(chunk.buffer);
	view.setUint32(0, tiff.length, false);
	chunk.set([0x65, 0x58, 0x49, 0x66], 4); // "eXIf"
	chunk.set(tiff, 8);
	view.setUint32(8 + tiff.length, crc32(chunk.subarray(4, 8 + tiff.length)), false);
	return chunk;
}

export function stripPngBytes(bytes: Uint8Array, opts: ExifStripOptions): StripOutput {
	if (!startsWith(bytes, 0, PNG_SIGNATURE)) throw new Error('Corrupt PNG: bad signature');
	const removed = noRemovals();
	let summary: ExifSummary | null = null;
	let unreadable = false;

	const kept: Uint8Array[] = [bytes.subarray(0, 8)];
	let spliceIndex: number | null = null;

	let i = 8;
	while (i + 8 <= bytes.length) {
		const view = new DataView(bytes.buffer, bytes.byteOffset + i);
		const length = view.getUint32(0, false);
		const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
		const total = 12 + length;
		if (i + total > bytes.length) throw new Error('Corrupt PNG: chunk length out of bounds');
		const chunk = bytes.subarray(i, i + total);

		if (type === 'eXIf') {
			removed.exif++;
			if (!summary && !unreadable) {
				try {
					summary = readExifSummary(bytes.subarray(i + 8, i + 8 + length));
				} catch {
					unreadable = true;
				}
			}
		} else if (PNG_DROP.has(type)) {
			removed.textChunks++;
		} else if (type === 'iCCP' && opts.removeIcc) {
			removed.icc++;
		} else {
			// Copied chunks keep their original CRCs untouched.
			kept.push(chunk);
			if (type === 'IHDR') spliceIndex = kept.length;
		}

		i += total;
		if (type === 'IEND') break;
	}

	if (summary?.orientation && summary.orientation !== 1 && spliceIndex !== null) {
		kept.splice(spliceIndex, 0, buildPngExifChunk(summary.orientation));
	}
	return { bytes: concat(kept), summary, unreadable, removed };
}

// -------------------------------------------------------------------- WebP

// VP8X flag bits (payload byte 0, MSB-first: Rsv(2) I L E X A R) — matches
// the muxer in src/lib/workers/webp-mux.ts.
const VP8X_ICC = 0x20;
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

function buildWebpExifChunk(orientation: number): Uint8Array {
	const tiff = buildMinimalExifTiff(orientation); // 26 bytes — even, no pad
	const chunk = new Uint8Array(8 + tiff.length);
	const view = new DataView(chunk.buffer);
	chunk.set([0x45, 0x58, 0x49, 0x46], 0); // "EXIF"
	view.setUint32(4, tiff.length, true);
	chunk.set(tiff, 8);
	return chunk;
}

export function stripWebpBytes(bytes: Uint8Array, opts: ExifStripOptions): StripOutput {
	if (!startsWith(bytes, 0, 'RIFF') || !startsWith(bytes, 8, 'WEBP')) {
		throw new Error('Corrupt WebP: bad RIFF header');
	}
	const removed = noRemovals();
	let summary: ExifSummary | null = null;
	let unreadable = false;

	const chunks: Uint8Array[] = [];
	let vp8x: Uint8Array | null = null;

	let i = 12;
	while (i + 8 <= bytes.length) {
		const view = new DataView(bytes.buffer, bytes.byteOffset + i);
		const type = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
		const length = view.getUint32(4, true);
		const total = 8 + length + (length % 2); // odd payloads carry a pad byte
		if (i + 8 + length > bytes.length) throw new Error('Corrupt WebP: chunk length out of bounds');
		const chunk = bytes.subarray(i, Math.min(i + total, bytes.length));

		if (type === 'EXIF') {
			removed.exif++;
			if (!summary && !unreadable) {
				try {
					summary = readExifSummary(bytes.subarray(i + 8, i + 8 + length));
				} catch {
					unreadable = true;
				}
			}
		} else if (type === 'XMP ') {
			removed.xmp++;
		} else if (type === 'ICCP' && opts.removeIcc) {
			removed.icc++;
		} else if (type === 'VP8X') {
			// Copy so the flag byte can be edited without touching the input.
			vp8x = new Uint8Array(chunk);
			chunks.push(vp8x);
		} else {
			chunks.push(chunk);
		}
		i += total;
	}

	// Bare VP8/VP8L files have no metadata chunks by construction.
	if (!removedAnything(removed)) {
		return { bytes, summary, unreadable, removed };
	}

	const reEmbed = summary?.orientation && summary.orientation !== 1;
	if (reEmbed) chunks.push(buildWebpExifChunk(summary!.orientation!));

	if (vp8x) {
		vp8x[8] &= ~VP8X_XMP;
		if (!reEmbed) vp8x[8] &= ~VP8X_EXIF;
		if (opts.removeIcc) vp8x[8] &= ~VP8X_ICC;
	}

	const body = concat(chunks);
	const out = new Uint8Array(12 + body.length);
	const view = new DataView(out.buffer);
	out.set(bytes.subarray(0, 12));
	view.setUint32(4, 4 + body.length, true); // riffSize = "WEBP" + chunks
	out.set(body, 12);
	return { bytes: out, summary, unreadable, removed };
}

// ----------------------------------------------------------------- summary

function formatGps(gps: { lat: number; lon: number }): string {
	const lat = `${Math.abs(gps.lat).toFixed(4)}°${gps.lat >= 0 ? 'N' : 'S'}`;
	const lon = `${Math.abs(gps.lon).toFixed(4)}°${gps.lon >= 0 ? 'E' : 'W'}`;
	return `GPS location (${lat}, ${lon})`;
}

function buildInfo(out: StripOutput): string {
	if (!removedAnything(out.removed)) return 'No metadata found';

	const parts: string[] = [];
	const s = out.summary;
	if (s?.gps) parts.push(formatGps(s.gps));
	if (s?.make || s?.model) {
		const model = s.model ?? '';
		const make = s.make ?? '';
		// "Apple iPhone 15 Pro", not "Apple Apple iPhone…" when Model repeats Make.
		parts.push(model.startsWith(make) ? model || make : `${make} ${model}`.trim());
	}
	if (s?.dateTime) {
		const date = s.dateTime.slice(0, 10).replaceAll(':', '-');
		parts.push(`taken ${date}`);
	}
	if (s && s.fieldCount > 0) parts.push(`${s.fieldCount} metadata fields`);
	if (out.unreadable) parts.push('unreadable EXIF metadata');
	if (out.removed.xmp > 0) parts.push('XMP');
	if (out.removed.app13 > 0) parts.push('Photoshop data');
	if (out.removed.comments > 0) {
		parts.push(out.removed.comments === 1 ? '1 comment' : `${out.removed.comments} comments`);
	}
	if (out.removed.textChunks > 0) {
		parts.push(
			out.removed.textChunks === 1 ? '1 text chunk' : `${out.removed.textChunks} text chunks`
		);
	}
	if (out.removed.icc > 0) parts.push('color profile');
	if (out.mpfDropped) parts.push('multi-picture (HDR) index — the photo displays normally');
	return `Removed: ${parts.join(', ')}`;
}

// ------------------------------------------------------------------ public

/** Sniffed from magic bytes — extensions and MIME types lie. */
function sniff(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
	if (startsWith(bytes, 0, PNG_SIGNATURE)) return 'png';
	if (startsWith(bytes, 0, 'RIFF') && startsWith(bytes, 8, 'WEBP')) return 'webp';
	return null;
}

const MIME: Record<'jpeg' | 'png' | 'webp', string> = {
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp'
};

/** Pure bytes-in/bytes-out strip — runs inside the image worker (rpc-free so
 *  the worker bundle stays lean; compress.ts owns the File→Blob framing). */
export function stripImageMetadataBytes(
	bytes: Uint8Array,
	opts: ExifStripOptions
): StripBytesResult {
	const format = sniff(bytes);
	if (!format) throw new Error('Only JPEG, PNG and WebP files are supported');

	const out =
		format === 'jpeg'
			? stripJpegBytes(bytes, opts)
			: format === 'png'
				? stripPngBytes(bytes, opts)
				: stripWebpBytes(bytes, opts);

	return {
		bytes: out.bytes,
		mime: MIME[format],
		info: buildInfo(out),
		removedAnything: removedAnything(out.removed)
	};
}
