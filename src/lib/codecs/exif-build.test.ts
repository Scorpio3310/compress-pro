import { describe, expect, it } from 'vitest';
import { buildExifTiffFromRaw } from './exif-build';
import { readExifSummary, TiffReader } from './exif-parse';

const FULL_META = {
	camera_make: 'NIKON CORPORATION',
	camera_model: 'NIKON D90',
	iso_speed: 200,
	shutter: 1 / 250,
	aperture: 5.6,
	focal_len: 35,
	timestamp: new Date(2020, 5, 14, 12, 30, 45)
};

describe('buildExifTiffFromRaw', () => {
	it('round-trips camera fields through the app’s own reader', () => {
		const tiff = buildExifTiffFromRaw(FULL_META)!;
		expect(tiff).toBeInstanceOf(Uint8Array);
		const summary = readExifSummary(tiff);
		expect(summary.make).toBe('NIKON CORPORATION');
		expect(summary.model).toBe('NIKON D90');
		expect(summary.dateTime).toBe('2020:06:14 12:30:45');
		expect(summary.iso).toBe(200);
		expect(summary.exposureTime).toBeCloseTo(1 / 250, 6);
		expect(summary.fNumber).toBeCloseTo(5.6, 2);
		expect(summary.focalLength).toBeCloseTo(35, 2);
	});

	it('ALWAYS writes Orientation 1 — LibRaw pixels are already rotated', () => {
		// A RAW shot in portrait must NOT carry its flip into the EXIF, or
		// viewers double-rotate the already-upright pixels.
		const tiff = buildExifTiffFromRaw({ ...FULL_META, flip: 6 } as never)!;
		expect(readExifSummary(tiff).orientation).toBe(1);
	});

	it('writes a GPS IFD from LibRaw DMS tuples', () => {
		const tiff = buildExifTiffFromRaw({
			...FULL_META,
			gps_data: {
				latitude: [46, 3, 5.5] as [number, number, number],
				longitude: [14, 30, 21.25] as [number, number, number],
				altitude: 298,
				latref: 'N',
				longref: 'E',
				altref: 0,
				gpsparsed: true
			}
		})!;
		const { gps } = readExifSummary(tiff);
		expect(gps).not.toBeNull();
		expect(gps!.lat).toBeCloseTo(46 + 3 / 60 + 5.5 / 3600, 5);
		expect(gps!.lon).toBeCloseTo(14 + 30 / 60 + 21.25 / 3600, 5);
	});

	it('omits fields the RAW did not carry instead of writing junk', () => {
		const tiff = buildExifTiffFromRaw({ camera_make: 'Canon', iso_speed: 0, shutter: 0 })!;
		const summary = readExifSummary(tiff);
		expect(summary.make).toBe('Canon');
		expect(summary.model).toBeNull();
		expect(summary.iso).toBeNull();
		expect(summary.exposureTime).toBeNull();
		expect(summary.dateTime).toBeNull();
	});

	it('returns null when there is nothing worth keeping', () => {
		expect(buildExifTiffFromRaw(undefined)).toBeNull();
		expect(buildExifTiffFromRaw(null)).toBeNull();
		expect(buildExifTiffFromRaw({})).toBeNull();
		expect(buildExifTiffFromRaw({ camera_make: '  ', iso_speed: 0 })).toBeNull();
		// epoch-zero timestamps (unset in many RAWs) must not become 1970 dates
		expect(buildExifTiffFromRaw({ timestamp: new Date(0) })).toBeNull();
	});

	it('produces a structurally valid TIFF (ascending tags, bounded IFDs)', () => {
		// TiffReader bounds-checks every offset and rejects malformed layouts —
		// surviving a full walk is the structural proof.
		const tiff = buildExifTiffFromRaw(FULL_META)!;
		const reader = new TiffReader(tiff);
		const ifd0 = reader.readIfd(reader.ifd0Offset());
		const tags = [...ifd0.keys()];
		expect(tags).toEqual([...tags].sort((a, b) => a - b));
		expect(tiff.length).toBeLessThan(0xffff); // JPEG APP1 cap headroom
	});
});
