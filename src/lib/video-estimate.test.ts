import { describe, expect, it } from 'vitest';
import { estimateAudioBytes, estimateVideoBytes } from './video-estimate';
import type { VideoConversionSettings } from './types';

const settings = (over: Partial<VideoConversionSettings> = {}): VideoConversionSettings => ({
	container: 'mp4',
	mode: 'quality',
	quality: 75,
	targetMb: 25,
	maxDimension: null,
	fps: 'original',
	removeAudio: false,
	...over
});

// 30 s of 1080p at a ~20 Mbps source — the quality curve, not the cap, decides.
const hd = { meta: { durationSec: 30, width: 1920, height: 1080 }, bytes: 75_000_000 };

describe('estimateVideoBytes', () => {
	it('returns null for GIF output, empty input, and missing dimensions', () => {
		expect(estimateVideoBytes([hd], settings({ container: 'gif' }))).toBeNull();
		expect(estimateVideoBytes([], settings())).toBeNull();
		expect(
			estimateVideoBytes([{ meta: { durationSec: 30, width: 0, height: 0 }, bytes: 1 }], settings())
		).toBeNull();
	});

	it('grows with quality and shrinks with max dimension / removed audio', () => {
		const base = estimateVideoBytes([hd], settings())!;
		expect(estimateVideoBytes([hd], settings({ quality: 90 }))!).toBeGreaterThan(base);
		expect(estimateVideoBytes([hd], settings({ quality: 40 }))!).toBeLessThan(base);
		expect(estimateVideoBytes([hd], settings({ maxDimension: 720 }))!).toBeLessThan(base);
		expect(estimateVideoBytes([hd], settings({ removeAudio: true }))!).toBeLessThan(base);
	});

	it('predicts fewer bytes for VP9/WebM than H.264/MP4 at equal quality', () => {
		expect(estimateVideoBytes([hd], settings({ container: 'webm' }))!).toBeLessThan(
			estimateVideoBytes([hd], settings())!
		);
	});

	it('estimates MOV exactly like MP4 (same avc curve)', () => {
		expect(estimateVideoBytes([hd], settings({ container: 'mov' }))).toBe(
			estimateVideoBytes([hd], settings())
		);
	});

	it('caps by the source bitrate so a small source cannot balloon', () => {
		// same clip but only ~1 Mbps of source data — the cap must bite
		const small = { meta: hd.meta, bytes: 4_000_000 };
		expect(estimateVideoBytes([small], settings())!).toBeLessThan(
			estimateVideoBytes([hd], settings())! / 2
		);
	});
});

describe('estimateAudioBytes', () => {
	it('is kbps × duration plus container overhead', () => {
		expect(estimateAudioBytes([60], 128)).toBe(Math.round(((128_000 * 60) / 8) * 1.03));
		expect(estimateAudioBytes([], 128)).toBeNull();
	});
});
