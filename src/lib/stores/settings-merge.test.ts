import { describe, expect, it } from 'vitest';
import { defaultSettings, mergeStoredSettings, serializeSettings } from './settings-merge';

describe('mergeStoredSettings', () => {
	it('round-trips a valid snapshot', () => {
		const target = defaultSettings();
		mergeStoredSettings(target, {
			jpg: { quality: 55, mode: 'target', targetKb: 250, maxDimension: 1920, outputFormat: 'webp' },
			svg: { precision: 1, aggressive: true },
			pdf: { op: 'merge', level: 'ultra', imageDpi: 300 }
		});
		expect(target.jpg).toEqual({
			quality: 55,
			mode: 'target',
			targetKb: 250,
			maxDimension: 1920,
			outputFormat: 'webp',
			downscaleToTarget: false,
			keepMetadata: false
		});
		expect(target.svg.precision).toBe(1);
		expect(target.svg.aggressive).toBe(true);
		expect(target.pdf.op).toBe('merge');
		expect(target.pdf.level).toBe('ultra');
		expect(target.pdf.imageDpi).toBe(300);
	});

	it('keeps defaults for malformed values and unknown enums', () => {
		const target = defaultSettings();
		mergeStoredSettings(target, {
			jpg: { quality: 'ninety', mode: 'chaos', outputFormat: 'bmp', maxDimension: -5 },
			pdf: { op: 'explode', imageDpi: 96, targetMb: 'two' },
			svg: { precision: 99, removeComments: 'yes' }
		});
		expect(target.jpg.quality).toBe(80);
		expect(target.jpg.mode).toBe('quality');
		expect(target.jpg.outputFormat).toBe('auto');
		expect(target.pdf.op).toBe('compress');
		expect(target.pdf.imageDpi).toBe(150);
		expect(target.pdf.targetMb).toBe(2);
		expect(target.svg.precision).toBe(8); // clamped
		expect(target.svg.removeComments).toBe(true);
	});

	it('round-trips and validates svg raster settings', () => {
		const target = defaultSettings();
		mergeStoredSettings(target, { svg: { outputFormat: 'png', rasterSize: 512, quality: 80 } });
		expect(target.svg.outputFormat).toBe('png');
		expect(target.svg.rasterSize).toBe(512);
		expect(target.svg.quality).toBe(80);

		const garbage = defaultSettings();
		mergeStoredSettings(garbage, {
			svg: { outputFormat: 'bmp', rasterSize: 999_999, quality: 'max' }
		});
		expect(garbage.svg.outputFormat).toBe('svg');
		expect(garbage.svg.rasterSize).toBe(4096); // clamped
		expect(garbage.svg.quality).toBe(100);

		const tiny = defaultSettings();
		mergeStoredSettings(tiny, { svg: { rasterSize: 4 } });
		expect(tiny.svg.rasterSize).toBe(16); // floor
	});

	it('clamps numeric ranges', () => {
		const target = defaultSettings();
		mergeStoredSettings(target, {
			png: { quality: 500, targetKb: 0, maxDimension: 999_999 },
			pdf: { imageQuality: -3, targetMb: 99_999 }
		});
		expect(target.png.quality).toBe(100);
		expect(target.png.targetKb).toBe(1);
		expect(target.png.maxDimension).toBe(65_535);
		expect(target.pdf.imageQuality).toBe(1);
		expect(target.pdf.targetMb).toBe(10_000);
	});

	it('never assigns gif output to the heic tab and preserves null maxDimension', () => {
		const target = defaultSettings();
		mergeStoredSettings(target, {
			heic: { outputFormat: 'gif', maxDimension: null },
			webp: { outputFormat: 'gif' }
		});
		expect(target.heic.outputFormat).toBe('jpg');
		expect(target.heic.maxDimension).toBeNull();
		expect(target.webp.outputFormat).toBe('gif');
	});

	it("never assigns 'auto' to the gif tab but allows it elsewhere", () => {
		const target = defaultSettings();
		mergeStoredSettings(target, {
			gif: { outputFormat: 'auto' },
			heic: { outputFormat: 'auto' },
			jpg: { outputFormat: 'auto' }
		});
		expect(target.gif.outputFormat).toBe('gif');
		expect(target.heic.outputFormat).toBe('auto');
		expect(target.jpg.outputFormat).toBe('auto');
	});

	it('validates video settings (enums, clamps, mixed-type fps)', () => {
		const target = defaultSettings();
		mergeStoredSettings(target, {
			video: { container: 'webm', mode: 'target', targetMb: 8, fps: 30, removeAudio: true }
		});
		expect(target.video).toEqual({
			container: 'webm',
			mode: 'target',
			quality: 75,
			targetMb: 8,
			maxDimension: null,
			fps: 30,
			removeAudio: true
		});

		const bad = defaultSettings();
		mergeStoredSettings(bad, {
			video: { container: 'avi', fps: 45, targetMb: -3, quality: '90', maxDimension: 999_999 }
		});
		expect(bad.video.container).toBe('mp4');
		expect(bad.video.fps).toBe('original');
		expect(bad.video.targetMb).toBe(0.1);
		expect(bad.video.quality).toBe(75);
		expect(bad.video.maxDimension).toBe(65_535);

		const mov = defaultSettings();
		mergeStoredSettings(mov, { video: { container: 'mov' } });
		expect(mov.video.container).toBe('mov');
	});

	it('merges keepMetadata as a bool, defaults false, rejects garbage', () => {
		const target = defaultSettings();
		expect(target.jpg.keepMetadata).toBe(false); // opt-in default
		mergeStoredSettings(target, { jpg: { keepMetadata: true } });
		expect(target.jpg.keepMetadata).toBe(true);
		expect(target.webp.keepMetadata).toBe(false); // per-tab, untouched
		const bad = defaultSettings();
		mergeStoredSettings(bad, { jpg: { keepMetadata: 'yes' } });
		expect(bad.jpg.keepMetadata).toBe(false);
	});

	it('merges downscaleToTarget as a bool, defaults false, rejects garbage', () => {
		const target = defaultSettings();
		expect(target.jpg.downscaleToTarget).toBe(false); // opt-in default
		mergeStoredSettings(target, { jpg: { downscaleToTarget: true } });
		expect(target.jpg.downscaleToTarget).toBe(true);
		expect(target.png.downscaleToTarget).toBe(false); // per-tab, untouched

		const bad = defaultSettings();
		mergeStoredSettings(bad, { jpg: { downscaleToTarget: 'yes' } });
		expect(bad.jpg.downscaleToTarget).toBe(false);
	});

	it('validates exif settings (bool whitelist, garbage keeps default)', () => {
		const target = defaultSettings();
		mergeStoredSettings(target, { exif: { removeIcc: true } });
		expect(target.exif.removeIcc).toBe(true);

		const bad = defaultSettings();
		mergeStoredSettings(bad, { exif: { removeIcc: 'yes' } });
		expect(bad.exif.removeIcc).toBe(false);
	});

	it('validates audio settings (enums + clamps)', () => {
		const target = defaultSettings();
		mergeStoredSettings(target, {
			audio: { outputFormat: 'ogg', mode: 'target', bitrateKbps: 128, targetMb: 5 }
		});
		expect(target.audio).toEqual({
			outputFormat: 'ogg',
			mode: 'target',
			bitrateKbps: 128,
			targetMb: 5
		});

		// Every offered output survives a round-trip through storage.
		for (const outputFormat of ['flac', 'opus', 'weba'] as const) {
			const t = defaultSettings();
			mergeStoredSettings(t, { audio: { outputFormat } });
			expect(t.audio.outputFormat).toBe(outputFormat);
		}

		const bad = defaultSettings();
		mergeStoredSettings(bad, {
			audio: { outputFormat: 'aiff', bitrateKbps: 100, targetMb: 'ten' }
		});
		expect(bad.audio.outputFormat).toBe('mp3');
		expect(bad.audio.bitrateKbps).toBe(192);
		expect(bad.audio.targetMb).toBe(10);
	});

	it('never persists or restores the pdf password', () => {
		const map = defaultSettings();
		map.pdf.password = 'hunter2';
		const stored = serializeSettings(2, map);
		expect(stored).not.toContain('hunter2');
		expect((JSON.parse(stored) as { data: { pdf: { password: string } } }).data.pdf.password).toBe(
			''
		);

		// Even a hand-crafted storage entry can't smuggle a password back in.
		const target = defaultSettings();
		mergeStoredSettings(target, { pdf: { op: 'unlock', password: 'stolen' } });
		expect(target.pdf.op).toBe('unlock');
		expect(target.pdf.password).toBe('');
	});

	it('never persists or restores the archive password', () => {
		const map = defaultSettings();
		map.zip.password = 'hunter2';
		const stored = serializeSettings(2, map);
		expect(stored).not.toContain('hunter2');
		expect((JSON.parse(stored) as { data: { zip: { password: string } } }).data.zip.password).toBe(
			''
		);

		const target = defaultSettings();
		mergeStoredSettings(target, { zip: { op: 'extract', password: 'stolen' } });
		expect(target.zip.op).toBe('extract');
		expect(target.zip.password).toBe('');
	});

	it('round-trips archive settings and rejects garbage', () => {
		const target = defaultSettings();
		mergeStoredSettings(target, {
			zip: { op: 'convert', outputFormat: '7z', level: 9, encryptNames: true }
		});
		expect(target.zip).toMatchObject({
			op: 'convert',
			outputFormat: '7z',
			level: 9,
			encryptNames: true
		});

		const bad = defaultSettings();
		mergeStoredSettings(bad, { zip: { op: 'explode', outputFormat: 'rar', level: 3 } });
		expect(bad.zip).toMatchObject({ op: 'create', outputFormat: 'zip', level: 6 });
	});

	it('snaps a persisted stream format back to zip under the convert op', () => {
		// rar → gz would promise a single stream from a multi-file archive.
		const target = defaultSettings();
		mergeStoredSettings(target, { zip: { op: 'convert', outputFormat: 'gz' } });
		expect(target.zip.op).toBe('convert');
		expect(target.zip.outputFormat).toBe('zip');
	});

	it('never persists or restores font axis pins (per-font runtime state)', () => {
		const map = defaultSettings();
		map.font.axisValues = { wght: 725 };
		const stored = serializeSettings(2, map);
		expect(
			(JSON.parse(stored) as { data: { font: { axisValues: object } } }).data.font.axisValues
		).toEqual({});

		const target = defaultSettings();
		mergeStoredSettings(target, { font: { op: 'subset', axisValues: { wght: 999 } } });
		expect(target.font.op).toBe('subset');
		expect(target.font.axisValues).toEqual({});
	});

	it('whitelists font subset presets and caps the custom text', () => {
		const target = defaultSettings();
		mergeStoredSettings(target, {
			font: {
				subsetPresets: ['basic-latin', 'nope', 42, 'cyrillic'],
				subsetText: 'abc',
				keepHinting: false,
				variableMode: 'static'
			}
		});
		expect(target.font.subsetPresets).toEqual(['basic-latin', 'cyrillic']);
		expect(target.font.subsetText).toBe('abc');
		expect(target.font.keepHinting).toBe(false);
		expect(target.font.variableMode).toBe('static');

		const capped = defaultSettings();
		mergeStoredSettings(capped, { font: { subsetText: 'x'.repeat(1001), variableMode: 'nope' } });
		expect(capped.font.subsetText).toBe('');
		expect(capped.font.variableMode).toBe('keep');
	});

	it('ignores non-object payloads and unknown keys wholesale', () => {
		const target = defaultSettings();
		mergeStoredSettings(target, 'garbage');
		mergeStoredSettings(target, null);
		mergeStoredSettings(target, { bmp: { quality: 10 }, jpg: 42 });
		expect(target).toEqual(defaultSettings());
	});
});
