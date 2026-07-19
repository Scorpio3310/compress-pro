/**
 * Minimal read-only EXIF/TIFF parser — just enough for the privacy summary
 * (camera, date, GPS, orientation) the EXIF tab shows while stripping.
 * Every offset is bounds-checked; malformed data throws and the caller
 * degrades to "unreadable metadata" (the segment still gets removed).
 */

export interface ExifSummary {
	make: string | null;
	model: string | null;
	orientation: number | null;
	dateTime: string | null;
	gps: { lat: number; lon: number } | null;
	/** ISOSpeedRatings from the Exif sub-IFD. */
	iso: number | null;
	/** ExposureTime in seconds. */
	exposureTime: number | null;
	fNumber: number | null;
	/** FocalLength in mm. */
	focalLength: number | null;
	/** Entries across IFD0 + Exif sub-IFD + GPS IFD. */
	fieldCount: number;
}

export const TYPE_SIZES: Record<number, number> = {
	1: 1, // BYTE
	2: 1, // ASCII
	3: 2, // SHORT
	4: 4, // LONG
	5: 8, // RATIONAL
	7: 1, // UNDEFINED
	9: 4, // SLONG
	10: 8 // SRATIONAL
};

export interface Entry {
	type: number;
	count: number;
	/** Absolute offset (within the TIFF buffer) of the value data. */
	valueOffset: number;
}

// Spread into String.fromCharCode would blow the argument limit on long tags
// (a JPEG APP1 can carry up to ~64 KB of ASCII).
const LATIN1 = new TextDecoder('latin1');

export class TiffReader {
	private view: DataView;
	private le = true;

	constructor(private tiff: Uint8Array) {
		this.view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
		if (tiff.length < 8) throw new Error('EXIF too short');
		const order = this.view.getUint16(0, false);
		if (order === 0x4949) this.le = true;
		else if (order === 0x4d4d) this.le = false;
		else throw new Error('bad TIFF byte order');
		if (this.view.getUint16(2, this.le) !== 42) throw new Error('bad TIFF magic');
	}

	get littleEndian(): boolean {
		return this.le;
	}

	private check(offset: number, length: number): void {
		if (offset < 0 || offset + length > this.tiff.length) {
			throw new Error('EXIF offset out of bounds');
		}
	}

	u16(offset: number): number {
		this.check(offset, 2);
		return this.view.getUint16(offset, this.le);
	}

	u32(offset: number): number {
		this.check(offset, 4);
		return this.view.getUint32(offset, this.le);
	}

	ifd0Offset(): number {
		return this.u32(4);
	}

	/** Parses one IFD into a tag → entry map. */
	readIfd(offset: number): Map<number, Entry> {
		const entries = new Map<number, Entry>();
		const count = this.u16(offset);
		if (count > 512) throw new Error('implausible IFD entry count');
		for (let i = 0; i < count; i++) {
			const at = offset + 2 + i * 12;
			this.check(at, 12);
			const tag = this.u16(at);
			const type = this.u16(at + 2);
			const n = this.u32(at + 4);
			const size = (TYPE_SIZES[type] ?? 1) * n;
			// Values ≤4 bytes live inline in the entry; larger ones at an offset.
			const valueOffset = size <= 4 ? at + 8 : this.u32(at + 8);
			this.check(valueOffset, size);
			entries.set(tag, { type, count: n, valueOffset });
		}
		return entries;
	}

	ascii(entry: Entry): string {
		const bytes = this.tiff.subarray(entry.valueOffset, entry.valueOffset + entry.count);
		let end = bytes.length;
		while (end > 0 && (bytes[end - 1] === 0 || bytes[end - 1] === 0x20)) end--;
		return LATIN1.decode(bytes.subarray(0, end));
	}

	ushort(entry: Entry): number {
		return this.u16(entry.valueOffset);
	}

	rationals(entry: Entry): number[] {
		const out: number[] = [];
		for (let i = 0; i < entry.count; i++) {
			const num = this.u32(entry.valueOffset + i * 8);
			const den = this.u32(entry.valueOffset + i * 8 + 4);
			out.push(den === 0 ? 0 : num / den);
		}
		return out;
	}
}

function dms(values: number[]): number {
	const [deg = 0, min = 0, sec = 0] = values;
	return deg + min / 60 + sec / 3600;
}

/**
 * Reads the summary from a TIFF blob (optionally prefixed with `Exif\0\0`,
 * as found in JPEG APP1 and WebP EXIF chunks).
 */
export function readExifSummary(input: Uint8Array): ExifSummary {
	let tiff = input;
	if (
		input.length >= 6 &&
		input[0] === 0x45 && // E
		input[1] === 0x78 && // x
		input[2] === 0x69 && // i
		input[3] === 0x66 && // f
		input[4] === 0 &&
		input[5] === 0
	) {
		tiff = input.subarray(6);
	}

	const reader = new TiffReader(tiff);
	const ifd0 = reader.readIfd(reader.ifd0Offset());
	let fieldCount = ifd0.size;

	const makeEntry = ifd0.get(0x010f);
	const modelEntry = ifd0.get(0x0110);
	const orientationEntry = ifd0.get(0x0112);
	const dateEntry = ifd0.get(0x0132);

	let dateTime = dateEntry ? reader.ascii(dateEntry) : null;

	let iso: number | null = null;
	let exposureTime: number | null = null;
	let fNumber: number | null = null;
	let focalLength: number | null = null;
	const exifPointer = ifd0.get(0x8769);
	if (exifPointer) {
		try {
			const exifIfd = reader.readIfd(reader.u32(exifPointer.valueOffset));
			fieldCount += exifIfd.size;
			const original = exifIfd.get(0x9003); // DateTimeOriginal
			if (original) dateTime = reader.ascii(original);
			const isoEntry = exifIfd.get(0x8827);
			if (isoEntry) iso = reader.ushort(isoEntry);
			const exposure = exifIfd.get(0x829a);
			if (exposure) exposureTime = reader.rationals(exposure)[0] ?? null;
			const fnum = exifIfd.get(0x829d);
			if (fnum) fNumber = reader.rationals(fnum)[0] ?? null;
			const focal = exifIfd.get(0x920a);
			if (focal) focalLength = reader.rationals(focal)[0] ?? null;
		} catch {
			// A broken sub-IFD shouldn't sink the whole summary.
		}
	}

	let gps: ExifSummary['gps'] = null;
	const gpsPointer = ifd0.get(0x8825);
	if (gpsPointer) {
		try {
			const gpsIfd = reader.readIfd(reader.u32(gpsPointer.valueOffset));
			fieldCount += gpsIfd.size;
			const latRef = gpsIfd.get(0x0001);
			const lat = gpsIfd.get(0x0002);
			const lonRef = gpsIfd.get(0x0003);
			const lon = gpsIfd.get(0x0004);
			if (lat && lon) {
				let latDeg = dms(reader.rationals(lat));
				let lonDeg = dms(reader.rationals(lon));
				if (latRef && reader.ascii(latRef).toUpperCase().startsWith('S')) latDeg = -latDeg;
				if (lonRef && reader.ascii(lonRef).toUpperCase().startsWith('W')) lonDeg = -lonDeg;
				gps = { lat: latDeg, lon: lonDeg };
			}
		} catch {
			// GPS IFD unreadable — everything else still counts.
		}
	}

	return {
		make: makeEntry ? reader.ascii(makeEntry) : null,
		model: modelEntry ? reader.ascii(modelEntry) : null,
		orientation: orientationEntry ? reader.ushort(orientationEntry) : null,
		dateTime,
		gps,
		iso,
		exposureTime,
		fNumber,
		focalLength,
		fieldCount
	};
}
