import { describe, expect, it } from 'vitest';
import { actionInvalid, actionLabel, busyLabel } from './action-labels';
import type { SettingsMap } from './types';

const image = (over: Partial<SettingsMap['jpg']> = {}): SettingsMap['jpg'] => ({
	quality: 80,
	outputFormat: 'auto',
	mode: 'quality',
	targetKb: 500,
	maxDimension: null,
	downscaleToTarget: false,
	keepMetadata: false,
	...over
});

const pdf = (over: Partial<SettingsMap['pdf']> = {}): SettingsMap['pdf'] => ({
	op: 'compress',
	mode: 'level',
	level: 'medium',
	targetMb: 1,
	mergeCompress: false,
	pageRange: '1-3',
	pageMode: 'keep',
	imageDpi: 150,
	imageFormat: 'jpg',
	imageQuality: 80,
	password: '',
	...over
});

const video = (over: Partial<SettingsMap['video']> = {}): SettingsMap['video'] => ({
	container: 'mp4',
	mode: 'quality',
	quality: 75,
	targetMb: 10,
	maxDimension: null,
	fps: 'original',
	removeAudio: false,
	...over
});

const audio = (over: Partial<SettingsMap['audio']> = {}): SettingsMap['audio'] => ({
	outputFormat: 'mp3',
	mode: 'quality',
	bitrateKbps: 192,
	targetMb: 5,
	...over
});

const zip = (op: 'create' | 'extract'): SettingsMap['zip'] => ({ op, level: 6 });

const font = (over: Partial<SettingsMap['font']> = {}): SettingsMap['font'] => ({
	op: 'convert',
	outputFormat: 'woff2',
	subsetPresets: ['basic-latin'],
	subsetText: '',
	keepHinting: true,
	variableMode: 'keep',
	axisValues: {},
	...over
});

describe('actionLabel', () => {
	it('pluralizes the default compress label', () => {
		expect(actionLabel('jpg', image(), 1)).toBe('Compress 1 file');
		expect(actionLabel('jpg', image(), 3)).toBe('Compress 3 files');
	});

	it('labels per-format actions', () => {
		expect(actionLabel('exif', { removeIcc: false }, 2)).toBe('Remove metadata from 2 files');
		expect(actionLabel('audio', audio(), 1)).toBe('Convert 1 file');
		expect(actionLabel('font', font(), 2)).toBe('Convert 2 files');
		expect(actionLabel('font', font({ op: 'subset' }), 2)).toBe('Subset 2 fonts');
		expect(actionLabel('font', font({ op: 'subset' }), 1)).toBe('Subset 1 font');
		expect(actionLabel('zip', zip('create'), 4)).toBe('Create ZIP from 4 files');
		expect(actionLabel('zip', zip('extract'), 1)).toBe('Extract 1 archive');
	});

	it('labels PDF ops', () => {
		expect(actionLabel('pdf', pdf(), 2)).toBe('Compress 2 files');
		expect(actionLabel('pdf', pdf({ op: 'merge' }), 3)).toBe('Merge 3 files');
		expect(actionLabel('pdf', pdf({ op: 'pages', pageMode: 'keep' }), 1)).toBe('Extract pages');
		expect(actionLabel('pdf', pdf({ op: 'pages', pageMode: 'remove' }), 1)).toBe('Remove pages');
		expect(actionLabel('pdf', pdf({ op: 'toImages' }), 1)).toBe('Convert 1 file to images');
		expect(actionLabel('pdf', pdf({ op: 'fromImages' }), 2)).toBe('Create PDF from 2 images');
		expect(actionLabel('pdf', pdf({ op: 'unlock' }), 1)).toBe('Unlock 1 PDF');
		expect(actionLabel('pdf', pdf({ op: 'protect' }), 2)).toBe('Protect 2 PDFs');
	});
});

describe('busyLabel', () => {
	it('picks the verb per format and PDF op', () => {
		expect(busyLabel('exif', { removeIcc: false })).toBe('Cleaning…');
		expect(busyLabel('audio', audio())).toBe('Converting…');
		expect(busyLabel('font', font({ outputFormat: 'ttf' }))).toBe('Converting…');
		expect(busyLabel('font', font({ op: 'subset' }))).toBe('Subsetting…');
		expect(busyLabel('zip', zip('create'))).toBe('Working…');
		expect(busyLabel('pdf', pdf({ op: 'merge' }))).toBe('Working…');
		expect(busyLabel('pdf', pdf())).toBe('Compressing…');
		expect(busyLabel('jpg', image())).toBe('Compressing…');
	});
});

describe('actionInvalid', () => {
	it('flags PDF target/merge/range/password problems', () => {
		expect(actionInvalid('pdf', pdf({ mode: 'target', targetMb: 0 }), 1)).toBe(true);
		expect(actionInvalid('pdf', pdf({ op: 'merge' }), 1)).toBe(true);
		expect(actionInvalid('pdf', pdf({ op: 'merge' }), 2)).toBe(false);
		expect(actionInvalid('pdf', pdf({ op: 'pages', pageRange: 'abc' }), 1)).toBe(true);
		expect(actionInvalid('pdf', pdf({ op: 'unlock', password: '  ' }), 1)).toBe(true);
		expect(actionInvalid('pdf', pdf({ op: 'protect', password: 'pw' }), 1)).toBe(false);
		expect(actionInvalid('pdf', pdf(), 1)).toBe(false);
	});

	it('requires a positive target size where target mode exists', () => {
		expect(actionInvalid('jpg', image({ mode: 'target', targetKb: 0 }), 1)).toBe(true);
		expect(actionInvalid('jpg', image({ mode: 'target' }), 1)).toBe(false);
		// GIF output has no target mode — never invalid on target fields.
		expect(
			actionInvalid('gif', image({ outputFormat: 'gif', mode: 'target', targetKb: 0 }), 1)
		).toBe(false);
		expect(actionInvalid('video', video({ mode: 'target', targetMb: 0 }), 1)).toBe(true);
		expect(actionInvalid('audio', audio({ mode: 'target', targetMb: 0 }), 1)).toBe(true);
		// WAV is PCM — target mode does not apply.
		expect(
			actionInvalid('audio', audio({ outputFormat: 'wav', mode: 'target', targetMb: 0 }), 1)
		).toBe(false);
		expect(actionInvalid('svg', image(), 1)).toBe(false);
	});
});
