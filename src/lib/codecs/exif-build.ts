/**
 * Minimal EXIF TIFF *writer* — rebuilds camera metadata for RAW inputs, whose
 * original bytes never enter the encode pipeline (predecoded path), so
 * exif-copy's extract-and-splice has nothing to extract. The output is the
 * exact byte shape spliceExifIntoImage expects: a bare little-endian TIFF
 * (no "Exif\0\0" prefix — the JPEG splicer adds its own), Orientation ALWAYS
 * 1 because LibRaw delivers pixels already rotated upright (copying the RAW
 * flip would double-rotate in viewers). No MakerNotes, no thumbnail — a lean
 * IFD stays far under the 0xFFFF JPEG APP1 cap.
 */

/** The slice of libraw-wasm's Metadata this builder consumes (structural —
 *  keeps the worker package out of the type graph). */
export interface RawExifSource {
	camera_make?: string;
	camera_model?: string;
	iso_speed?: number;
	/** Exposure time in seconds. */
	shutter?: number;
	/** F-number. */
	aperture?: number;
	/** Focal length in mm. */
	focal_len?: number;
	timestamp?: Date;
	gps_data?: {
		latitude?: [number, number, number];
		longitude?: [number, number, number];
		altitude?: number;
		latref?: string | null;
		longref?: string | null;
		altref?: number;
		gpsparsed?: boolean;
	};
}

const ASCII = 2;
const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;
const TYPE_BYTES: Record<number, number> = { 1: 1, [ASCII]: 1, [SHORT]: 2, [LONG]: 4, [RATIONAL]: 8 };

interface Field {
	tag: number;
	type: number;
	count: number;
	/** Value bytes, little-endian, unpadded. */
	value: Uint8Array;
}

function asciiField(tag: number, text: string): Field {
	const clean = text.trim();
	const bytes = new Uint8Array(clean.length + 1); // NUL-terminated
	for (let i = 0; i < clean.length; i++) bytes[i] = clean.charCodeAt(i) & 0x7f;
	return { tag, type: ASCII, count: bytes.length, value: bytes };
}

function shortField(tag: number, v: number): Field {
	const value = new Uint8Array(2);
	new DataView(value.buffer).setUint16(0, Math.max(0, Math.min(0xffff, Math.round(v))), true);
	return { tag, type: SHORT, count: 1, value };
}

function byteField(tag: number, values: number[]): Field {
	return { tag, type: 1, count: values.length, value: new Uint8Array(values) };
}

function rationalField(tag: number, pairs: [number, number][]): Field {
	const value = new Uint8Array(pairs.length * 8);
	const view = new DataView(value.buffer);
	pairs.forEach(([num, den], i) => {
		view.setUint32(i * 8, num >>> 0, true);
		view.setUint32(i * 8 + 4, den >>> 0, true);
	});
	return { tag, type: RATIONAL, count: pairs.length, value };
}

/** Sub-second exposures read naturally as 1/N; everything else as x/100. */
function exposureRational(seconds: number): [number, number] {
	if (seconds > 0 && seconds < 1) return [1, Math.round(1 / seconds)];
	return [Math.round(seconds * 100), 100];
}

function hundredths(x: number): [number, number] {
	return [Math.round(x * 100), 100];
}

function exifDate(d: Date): string | null {
	if (!(d instanceof Date) || Number.isNaN(d.getTime()) || d.getTime() <= 0) return null;
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;

/** IFD byte size: entry count + 12/entry + next-IFD pointer. */
const ifdSize = (fields: Field[]) => 2 + fields.length * 12 + 4;

/**
 * Serialize IFDs into one bare TIFF. Layout: header, IFD0, Exif IFD, GPS IFD,
 * then all out-of-line values (even-aligned, per spec).
 */
function serialize(ifd0: Field[], exif: Field[], gps: Field[]): Uint8Array {
	const EXIF_POINTER = 0x8769;
	const GPS_POINTER = 0x8825;
	const ifd0Offset = 8;
	// IFD0's on-disk size includes the pointer entries added below.
	const pointerCount = (exif.length ? 1 : 0) + (gps.length ? 1 : 0);
	const ifd0Bytes = 2 + (ifd0.length + pointerCount) * 12 + 4;
	const exifOffset = exif.length ? ifd0Offset + ifd0Bytes : 0;
	const gpsOffset = gps.length
		? ifd0Offset + ifd0Bytes + (exif.length ? ifdSize(exif) : 0)
		: 0;
	let dataOffset =
		ifd0Offset + ifd0Bytes + (exif.length ? ifdSize(exif) : 0) + (gps.length ? ifdSize(gps) : 0);

	// First pass: assign out-of-line offsets (values > 4 bytes), even-aligned.
	const outOfLine = new Map<Field, number>();
	for (const field of [...ifd0, ...exif, ...gps]) {
		const size = field.value.length;
		if (size > 4) {
			if (dataOffset % 2) dataOffset++;
			outOfLine.set(field, dataOffset);
			dataOffset += size;
		}
	}

	const tiff = new Uint8Array(dataOffset);
	const view = new DataView(tiff.buffer);
	tiff[0] = 0x49;
	tiff[1] = 0x49;
	view.setUint16(2, 42, true);
	view.setUint32(4, ifd0Offset, true);

	const writeIfd = (fields: Field[], offset: number) => {
		const sorted = [...fields].sort((a, b) => a.tag - b.tag); // spec: ascending tags
		view.setUint16(offset, sorted.length, true);
		sorted.forEach((field, i) => {
			const at = offset + 2 + i * 12;
			view.setUint16(at, field.tag, true);
			view.setUint16(at + 2, field.type, true);
			view.setUint32(at + 4, field.count, true);
			const inline = outOfLine.get(field);
			if (inline === undefined) {
				tiff.set(field.value, at + 8); // inline, remaining bytes stay 0
			} else {
				view.setUint32(at + 8, inline, true);
				tiff.set(field.value, inline);
			}
		});
		view.setUint32(offset + 2 + sorted.length * 12, 0, true); // no next IFD
	};

	const pointers: Field[] = [];
	if (exifOffset) {
		const value = new Uint8Array(4);
		new DataView(value.buffer).setUint32(0, exifOffset, true);
		pointers.push({ tag: EXIF_POINTER, type: LONG, count: 1, value });
	}
	if (gpsOffset) {
		const value = new Uint8Array(4);
		new DataView(value.buffer).setUint32(0, gpsOffset, true);
		pointers.push({ tag: GPS_POINTER, type: LONG, count: 1, value });
	}
	writeIfd([...ifd0, ...pointers], ifd0Offset);
	if (exifOffset) writeIfd(exif, exifOffset);
	if (gpsOffset) writeIfd(gps, gpsOffset);
	return tiff;
}

/**
 * Bare EXIF TIFF from LibRaw metadata, or null when the RAW exposed nothing
 * worth keeping (the caller then surfaces an honest "not kept" note).
 */
export function buildExifTiffFromRaw(meta: RawExifSource | null | undefined): Uint8Array | null {
	if (!meta) return null;
	const ifd0: Field[] = [];
	const exif: Field[] = [];
	const gps: Field[] = [];

	const make = meta.camera_make?.trim();
	const model = meta.camera_model?.trim();
	if (make) ifd0.push(asciiField(0x010f, make));
	if (model) ifd0.push(asciiField(0x0110, model));
	const date = meta.timestamp ? exifDate(meta.timestamp) : null;
	if (date) {
		ifd0.push(asciiField(0x0132, date));
		exif.push(asciiField(0x9003, date)); // DateTimeOriginal
	}

	if (finite(meta.shutter)) exif.push(rationalField(0x829a, [exposureRational(meta.shutter)]));
	if (finite(meta.aperture)) exif.push(rationalField(0x829d, [hundredths(meta.aperture)]));
	if (finite(meta.iso_speed)) exif.push(shortField(0x8827, meta.iso_speed));
	if (finite(meta.focal_len)) exif.push(rationalField(0x920a, [hundredths(meta.focal_len)]));

	const g = meta.gps_data;
	if (g?.gpsparsed && g.latitude && g.longitude && g.latref && g.longref) {
		const dmsPairs = (t: [number, number, number]): [number, number][] => [
			[Math.round(t[0]), 1],
			[Math.round(t[1]), 1],
			[Math.round(t[2] * 1000), 1000]
		];
		gps.push(byteField(0x0000, [2, 3, 0, 0])); // GPSVersionID
		gps.push(asciiField(0x0001, g.latref));
		gps.push(rationalField(0x0002, dmsPairs(g.latitude)));
		gps.push(asciiField(0x0003, g.longref));
		gps.push(rationalField(0x0004, dmsPairs(g.longitude)));
		if (finite(g.altitude)) {
			gps.push(byteField(0x0005, [g.altref === 1 ? 1 : 0]));
			gps.push(rationalField(0x0006, [hundredths(g.altitude)]));
		}
	}

	// Nothing real to keep → no TIFF (an Orientation=1-only EXIF is noise).
	if (ifd0.length === 0 && exif.length === 0 && gps.length === 0) return null;
	// Pixels leave LibRaw already rotated upright — Orientation must say so.
	ifd0.push(shortField(0x0112, 1));
	return serialize(ifd0, exif, gps);
}
