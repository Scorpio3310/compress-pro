/**
 * AU-01…21: the audio tab — WAV→MP3 (LAME wasm), MP4→MP3 extraction,
 * M4A/OGG/WAV/FLAC/OPUS/WEBA outputs (FLAC via the bundled libFLAC wasm),
 * encoded inputs (mp3/m4a/ogg/opus/weba/flac fixtures made in Chromium),
 * target bitrate math, corrupt/non-audio rejection — plus SAMPLE-LEVEL
 * verification: node can't decode mp3/aac/opus, so outputs are decoded in the
 * test browser (OfflineAudioContext) and probed with Goertzel at the fixture's
 * known tones (L 440 Hz / R 554.37+330 Hz / 3 kHz silence control).
 */
import { readFileSync } from 'node:fs';
import {
	assertFloor,
	assertRange,
	audioFixtures,
	expect,
	fx,
	fxAudio,
	fxMeta,
	fxVideo,
	test
} from '../fixtures';
import {
	audioMetricsInPage,
	compress,
	downloadRow,
	gotoTab,
	rows,
	setAudioBitrate,
	setTargetMb,
	upload,
	type AudioMetrics
} from '../helpers';
import { AUDIO } from '../thresholds';
import { audioInfo } from '../verify';

// The first MP3 job loads the LAME wasm — allow for that.
test.describe.configure({ timeout: 120_000 });

async function setAudioOutput(page: import('@playwright/test').Page, pill: string) {
	const btn = page.getByRole('button', { name: pill, exact: true });
	await btn.click();
	await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

interface ToneTable {
	left: { hz: number; amp: number }[];
	right: { hz: number; amp: number }[];
	controlHz: number;
}

/** Tone plan recorded by the fixture generators (wav + encoded twins share it). */
const TONES = fxMeta<{ durationSec: number; tones: ToneTable }>('tone-3s.wav').tones;
const STEREO_PROBES = [
	TONES.left[0].hz, // 440 — left dominant
	TONES.right[0].hz, // 554.37 — right dominant
	TONES.right[1].hz, // 330 — right secondary
	TONES.controlHz // 3000 — must be near-silent
];

const round = (v: number, digits: number) => Number(v.toFixed(digits));
const amp = (m: AudioMetrics, ch: number, hz: number) => m.channels[ch]?.freqAmp[String(hz)] ?? 0;

/**
 * Full stereo tone policy: RMS windows, dominant + secondary tones surviving
 * the encode, L/R separation (a swap or downmix collapses it), near-silent
 * control probe. Returns flat metrics for the report card.
 */
function expectStereoTones(m: AudioMetrics, id: string): Record<string, number> {
	expect(m.channelCount, `${id} stereo preserved`).toBe(2);
	const [lHz, rHz, r2Hz] = [TONES.left[0].hz, TONES.right[0].hz, TONES.right[1].hz];
	const lDom = amp(m, 0, lHz);
	const rDom = amp(m, 1, rHz);
	const rSec = amp(m, 1, r2Hz);
	const sepL = lDom / Math.max(amp(m, 1, lHz), 1e-6);
	const sepR = rDom / Math.max(amp(m, 0, rHz), 1e-6);
	const control = Math.max(amp(m, 0, TONES.controlHz), amp(m, 1, TONES.controlHz));
	assertRange(m.channels[0].rms, AUDIO.rmsRange, `${id} L rms`);
	assertRange(m.channels[1].rms, AUDIO.rmsRange, `${id} R rms`);
	assertFloor(lDom, AUDIO.toneAmpMin, `${id} L ${lHz} Hz`);
	assertFloor(rDom, AUDIO.toneAmpMin, `${id} R ${rHz} Hz`);
	assertFloor(rSec, AUDIO.secondaryToneAmpMin, `${id} R ${r2Hz} Hz`);
	assertFloor(sepL, AUDIO.separationMin, `${id} separation @${lHz} Hz`);
	assertFloor(sepR, AUDIO.separationMin, `${id} separation @${rHz} Hz`);
	assertRange(control, [0, AUDIO.controlAmpMax], `${id} control @${TONES.controlHz} Hz`);
	return {
		rmsL: round(m.channels[0].rms, 3),
		rmsR: round(m.channels[1].rms, 3),
		ampL440: round(lDom, 3),
		ampR554: round(rDom, 3),
		ampR330: round(rSec, 3),
		separation: round(Math.min(sepL, sepR, 999), 1),
		controlAmp: round(control, 4)
	};
}

/** Mono policy for the 440 Hz oscillator track inside v-audio-3s.* (amp 1 → RMS ≈ .707). */
function expectMonoTone(m: AudioMetrics, id: string): Record<string, number> {
	expect(m.channelCount, `${id} mono preserved`).toBe(1);
	const a440 = amp(m, 0, 440);
	const control = amp(m, 0, TONES.controlHz);
	assertRange(m.channels[0].rms, AUDIO.monoRmsRange, `${id} rms`);
	assertFloor(a440, AUDIO.monoToneAmpMin, `${id} 440 Hz`);
	assertRange(control, [0, AUDIO.controlAmpMax], `${id} control @${TONES.controlHz} Hz`);
	return {
		rms: round(m.channels[0].rms, 3),
		amp440: round(a440, 3),
		controlAmp: round(control, 4)
	};
}

test('AU-01: wav → mp3 at 192 kbps shrinks ~10×, tones and stereo survive @smoke', async ({
	page,
	rec
}) => {
	const input = readFileSync(fx('tone-3s.wav'));
	const meta = fxMeta<{ durationSec: number }>('tone-3s.wav');
	await gotoTab(page, 'audio');
	await upload(page, fx('tone-3s.wav'));
	await compress(page); // mp3 @ 192 kbps is the default
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.mp3');
	const info = await audioInfo(art.bytes);
	expect(info.audioCodec).toBe('mp3');
	expect(Math.abs(info.durationSec - meta.durationSec)).toBeLessThanOrEqual(0.2);
	// 1.4 Mbps PCM → 192 kbps ≈ 7× smaller; leave slack for the mp3 container.
	expect(art.bytes.length).toBeLessThan(input.length / 5);
	const m = await audioMetricsInPage(page, art.bytes, 'audio/mpeg', { probeHz: STEREO_PROBES });
	expect(Math.abs(m.durationSec - meta.durationSec), 'decoded PCM duration').toBeLessThanOrEqual(
		0.2
	);
	const tones = expectStereoTones(m, 'AU-01');
	rec.record({
		id: 'AU-01',
		settings: { tab: 'audio', output: 'mp3', bitrateKbps: 192 },
		input: { name: 'tone-3s.wav', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: {
			savingsPct: Number((((input.length - art.bytes.length) / input.length) * 100).toFixed(1)),
			...tones
		},
		assets: {
			original: rec.saveAsset('AU-01', 'original', 'tone-3s.wav', fx('tone-3s.wav')),
			output: rec.saveAsset('AU-01', 'output', art.name, art.bytes)
		}
	});
});

test('AU-02: mp4 → mp3 extracts the audio track (video discarded)', async ({ page, rec }) => {
	await gotoTab(page, 'audio');
	await upload(page, fxVideo('v-audio-3s.mp4'));
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('v-audio-3s.mp3');
	const info = await audioInfo(art.bytes);
	expect(info.audioCodec).toBe('mp3');
	expect(info.hasVideo, 'video track discarded').toBe(false);
	expect(info.trackCount).toBe(1);
	expect(Math.abs(info.durationSec - 3)).toBeLessThanOrEqual(0.3);
	const m = await audioMetricsInPage(page, art.bytes, 'audio/mpeg', { probeHz: [440, 3000] });
	const tones = expectMonoTone(m, 'AU-02');
	rec.record({
		id: 'AU-02',
		settings: { tab: 'audio', output: 'mp3', source: 'mp4 video' },
		input: { name: 'v-audio-3s.mp4', bytes: readFileSync(fxVideo('v-audio-3s.mp4')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: tones,
		assets: { output: rec.saveAsset('AU-02', 'output', art.name, art.bytes) }
	});
});

test('AU-03: wav → m4a encodes AAC, tones and stereo survive', async ({ page, rec }) => {
	await gotoTab(page, 'audio');
	await upload(page, fx('tone-3s.wav'));
	await setAudioOutput(page, 'M4A');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.m4a');
	const info = await audioInfo(art.bytes);
	expect(info.audioCodec).toBe('aac');
	expect(info.hasVideo).toBe(false);
	const m = await audioMetricsInPage(page, art.bytes, 'audio/mp4', { probeHz: STEREO_PROBES });
	const tones = expectStereoTones(m, 'AU-03');
	rec.record({
		id: 'AU-03',
		settings: { tab: 'audio', output: 'm4a' },
		input: { name: 'tone-3s.wav', bytes: readFileSync(fx('tone-3s.wav')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: tones,
		assets: { output: rec.saveAsset('AU-03', 'output', art.name, art.bytes) }
	});
});

test('AU-04: wav → ogg encodes Opus, tones and stereo survive', async ({ page, rec }) => {
	await gotoTab(page, 'audio');
	await upload(page, fx('tone-3s.wav'));
	await setAudioOutput(page, 'OGG');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.ogg');
	expect((await audioInfo(art.bytes)).audioCodec).toBe('opus');
	const m = await audioMetricsInPage(page, art.bytes, 'audio/ogg', { probeHz: STEREO_PROBES });
	const tones = expectStereoTones(m, 'AU-04');
	rec.record({
		id: 'AU-04',
		settings: { tab: 'audio', output: 'ogg' },
		input: { name: 'tone-3s.wav', bytes: readFileSync(fx('tone-3s.wav')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: tones,
		assets: { output: rec.saveAsset('AU-04', 'output', art.name, art.bytes) }
	});
});

test('AU-05: mp4 → wav produces PCM (bitrate knobs hidden)', async ({ page, rec }) => {
	await gotoTab(page, 'audio');
	await upload(page, fxVideo('v-audio-3s.mp4'));
	await setAudioOutput(page, 'WAV');
	// WAV is PCM — the bitrate/target controls disappear.
	await expect(page.getByRole('button', { name: '192', exact: true })).toHaveCount(0);
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('v-audio-3s.wav');
	const info = await audioInfo(art.bytes);
	expect(info.audioCodec).toMatch(/^pcm/);
	const m = await audioMetricsInPage(page, art.bytes, 'audio/wav', { probeHz: [440, 3000] });
	const tones = expectMonoTone(m, 'AU-05');
	rec.record({
		id: 'AU-05',
		settings: { tab: 'audio', output: 'wav' },
		input: { name: 'v-audio-3s.mp4', bytes: readFileSync(fxVideo('v-audio-3s.mp4')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: tones,
		assets: { output: rec.saveAsset('AU-05', 'output', art.name, art.bytes) }
	});
});

test('AU-06: target 0.05 MB picks a fitting bitrate', async ({ page, rec }) => {
	await gotoTab(page, 'audio');
	await upload(page, fx('tone-3s.wav'));
	await setTargetMb(page, 0.05); // 50 KB for 3 s → ~129 kbps
	const run = await compress(page);
	expect(run.warnings, 'reachable target must not warn').toEqual([]);
	const art = await downloadRow(page);
	expect(art.bytes.length, 'fits under 50 KB').toBeLessThanOrEqual(50_000);
	expect((await audioInfo(art.bytes)).audioCodec).toBe('mp3');
	// Cheap non-silence guard (hard, not calibrate-gated).
	const m = await audioMetricsInPage(page, art.bytes, 'audio/mpeg', { probeHz: [440] });
	expect(m.channels[0].rms, 'target output must not be silence').toBeGreaterThanOrEqual(0.05);
	rec.record({
		id: 'AU-06',
		settings: { tab: 'audio', output: 'mp3', mode: 'target', targetMb: 0.05 },
		input: { name: 'tone-3s.wav', bytes: readFileSync(fx('tone-3s.wav')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { targetBytes: 50_000, fits: art.bytes.length <= 50_000 },
		assets: { output: rec.saveAsset('AU-06', 'output', art.name, art.bytes) }
	});
});

test('AU-07: a file without audio fails its row, batch survives', async ({ page }) => {
	await gotoTab(page, 'audio');
	// setInputFiles bypasses the accept attr — a photo lands on the tab.
	await upload(page, fx('photo-1200x800.jpg'), fx('tone-3s.wav'));
	const run = await compress(page, { expectError: true });
	expect(run.error).toMatch(/photo-1200x800\.jpg/);
	await expect(page.getByTestId('row-error')).toBeVisible();
	// The healthy wav still converted.
	await expect(rows(page).getByRole('button', { name: 'Download' })).toHaveCount(1);
});

test('AU-08: mp3 → wav round-trip — tones survive the decode side too', async ({ page, rec }) => {
	const input = readFileSync(fxAudio('tone-3s.mp3'));
	await gotoTab(page, 'audio');
	await upload(page, fxAudio('tone-3s.mp3'));
	await setAudioOutput(page, 'WAV');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.wav');
	expect((await audioInfo(art.bytes)).audioCodec).toMatch(/^pcm/);
	const m = await audioMetricsInPage(page, art.bytes, 'audio/wav', { probeHz: STEREO_PROBES });
	const tones = expectStereoTones(m, 'AU-08');
	rec.record({
		id: 'AU-08',
		title: 'mp3 input decodes (LAME-encoded fixture) and lands as PCM',
		settings: { tab: 'audio', output: 'wav', source: 'mp3 320 kbps' },
		input: { name: 'tone-3s.mp3', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: tones,
		assets: {
			original: rec.saveAsset('AU-08', 'original', 'tone-3s.mp3', fxAudio('tone-3s.mp3')),
			output: rec.saveAsset('AU-08', 'output', art.name, art.bytes)
		}
	});
});

test('AU-09: m4a (AAC) → mp3', async ({ page, rec }) => {
	test.skip(!audioFixtures().files['tone-3s.m4a'], 'no AAC encoder in this Chromium');
	const input = readFileSync(fxAudio('tone-3s.m4a'));
	await gotoTab(page, 'audio');
	await upload(page, fxAudio('tone-3s.m4a'));
	await compress(page); // mp3 default
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.mp3');
	expect((await audioInfo(art.bytes)).audioCodec).toBe('mp3');
	const m = await audioMetricsInPage(page, art.bytes, 'audio/mpeg', { probeHz: STEREO_PROBES });
	const tones = expectStereoTones(m, 'AU-09');
	rec.record({
		id: 'AU-09',
		settings: { tab: 'audio', output: 'mp3', source: 'm4a aac' },
		input: { name: 'tone-3s.m4a', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: tones,
		assets: {
			original: rec.saveAsset('AU-09', 'original', 'tone-3s.m4a', fxAudio('tone-3s.m4a')),
			output: rec.saveAsset('AU-09', 'output', art.name, art.bytes)
		}
	});
});

test('AU-10: ogg (Opus) → mp3', async ({ page, rec }) => {
	test.skip(!audioFixtures().files['tone-3s.ogg'], 'no Opus encoder in this Chromium');
	const input = readFileSync(fxAudio('tone-3s.ogg'));
	await gotoTab(page, 'audio');
	await upload(page, fxAudio('tone-3s.ogg'));
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.mp3');
	expect((await audioInfo(art.bytes)).audioCodec).toBe('mp3');
	const m = await audioMetricsInPage(page, art.bytes, 'audio/mpeg', { probeHz: STEREO_PROBES });
	const tones = expectStereoTones(m, 'AU-10');
	rec.record({
		id: 'AU-10',
		settings: { tab: 'audio', output: 'mp3', source: 'ogg opus' },
		input: { name: 'tone-3s.ogg', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: tones,
		assets: {
			original: rec.saveAsset('AU-10', 'original', 'tone-3s.ogg', fxAudio('tone-3s.ogg')),
			output: rec.saveAsset('AU-10', 'output', art.name, art.bytes)
		}
	});
});

test('AU-11: mp3 320 kbps → mp3 128 kbps recompresses smaller, tones intact', async ({
	page,
	rec
}) => {
	const input = readFileSync(fxAudio('tone-3s.mp3'));
	await gotoTab(page, 'audio');
	await upload(page, fxAudio('tone-3s.mp3'));
	await setAudioBitrate(page, 128);
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.mp3');
	// 320 → 128 kbps must shrink decisively (same-format keep-original would
	// otherwise return the original bytes — that would fail this).
	expect(art.bytes.length, '128 kbps re-encode beats the 320 kbps source').toBeLessThan(
		input.length * 0.6
	);
	const m = await audioMetricsInPage(page, art.bytes, 'audio/mpeg', { probeHz: STEREO_PROBES });
	const tones = expectStereoTones(m, 'AU-11');
	rec.record({
		id: 'AU-11',
		title: 'mp3 recompress (320 → 128 kbps)',
		settings: { tab: 'audio', output: 'mp3', bitrateKbps: 128 },
		input: { name: 'tone-3s.mp3', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: {
			savingsPct: Number((((input.length - art.bytes.length) / input.length) * 100).toFixed(1)),
			...tones
		},
		assets: { output: rec.saveAsset('AU-11', 'output', art.name, art.bytes) }
	});
});

test('AU-12: corrupt mp3 fails its row with a clean message, batch survives', async ({ page }) => {
	await gotoTab(page, 'audio');
	await upload(page, fxAudio('corrupt.mp3'), fx('tone-3s.wav'));
	const run = await compress(page, { expectError: true });
	expect(run.error).toMatch(/corrupt\.mp3/);
	await expect(page.getByTestId('row-error')).toBeVisible();
	// No stack traces / exit codes in the user-facing message.
	expect(run.error).not.toMatch(/exit code|undefined|\bat\b.*\.ts/);
	// The healthy wav still converted.
	await expect(rows(page).getByRole('button', { name: 'Download' })).toHaveCount(1);
});

test('AU-13: flac → mp3 (decode via WebCodecs, encode via LAME)', async ({ page, rec }) => {
	test.skip(
		!audioFixtures().files['tone-3s.flac'],
		'flac fixture missing — the bundled libFLAC encoder should always produce it'
	);
	await gotoTab(page, 'audio');
	await upload(page, fxAudio('tone-3s.flac'));
	await compress(page);
	const art = await downloadRow(page);
	expect((await audioInfo(art.bytes)).audioCodec).toBe('mp3');
	const m = await audioMetricsInPage(page, art.bytes, 'audio/mpeg', { probeHz: STEREO_PROBES });
	const tones = expectStereoTones(m, 'AU-13');
	rec.record({
		id: 'AU-13',
		settings: { tab: 'audio', output: 'mp3', source: 'flac' },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: tones
	});
});

test('AU-14: WAV output in target mode says the target does not apply', async ({ page, rec }) => {
	const input = readFileSync(fx('tone-3s.wav'));
	await gotoTab(page, 'audio');
	await upload(page, fx('tone-3s.wav'));
	// Arm target mode while MP3 is selected, then switch the output to WAV —
	// the persisted mode stays 'target' even though its controls hide.
	await setTargetMb(page, 0.05);
	await setAudioOutput(page, 'WAV');
	const run = await compress(page);
	expect(run.warnings.join(' — ')).toMatch(/uncompressed/i);
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.wav');
	expect(art.bytes.length, 'PCM ignores the 50 KB target').toBeGreaterThan(50_000);
	rec.record({
		id: 'AU-14',
		title: 'WAV + persisted target mode warns instead of silently overshooting',
		settings: { tab: 'audio', output: 'wav', mode: 'target', targetMb: 0.05 },
		input: { name: 'tone-3s.wav', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		warnings: run.warnings
	});
});

test('AU-15: AAC spends the requested bitrate on dense content (pills are honest)', async ({
	page,
	rec
}) => {
	// White noise is the hardest material a lossy encoder can meet — a
	// VBR/ABR AAC must land near the request here (real-music probe
	// 2026-07-11: 91-99% of the pill across 96/192/256). Pure tones
	// legitimately undershoot to ~53 kbps; this fixture exists precisely so
	// that VBR behavior can't mask a genuinely broken bitrate path.
	const meta = fxMeta<{ durationSec: number }>('noise-10s.wav');
	await gotoTab(page, 'audio');
	await upload(page, fx('noise-10s.wav'));
	await setAudioOutput(page, 'M4A');
	await setAudioBitrate(page, 192);
	await compress(page);
	const art = await downloadRow(page);
	const info = await audioInfo(art.bytes);
	expect(info.audioCodec).toBe('aac');
	const effectiveKbps = (art.bytes.length * 8) / meta.durationSec / 1000;
	assertRange(effectiveKbps, [134, 260], 'AU-15 effective kbps @192 on noise');
	rec.record({
		id: 'AU-15',
		title: 'AAC effective bitrate tracks the pill on dense content',
		settings: { tab: 'audio', output: 'm4a', bitrateKbps: 192 },
		input: { name: 'noise-10s.wav', bytes: readFileSync(fx('noise-10s.wav')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: { effectiveKbps: Number(effectiveKbps.toFixed(1)) }
	});
});

test('AU-16: wav → flac (libFLAC wasm) — lossless, bitrate knobs hidden', async ({ page, rec }) => {
	const input = readFileSync(fx('tone-3s.wav'));
	await gotoTab(page, 'audio');
	await upload(page, fx('tone-3s.wav'));
	await setAudioOutput(page, 'FLAC');
	// FLAC is lossless — the bitrate/target controls disappear, like WAV.
	await expect(page.getByRole('button', { name: '192', exact: true })).toHaveCount(0);
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.flac');
	const info = await audioInfo(art.bytes);
	expect(info.audioCodec).toBe('flac');
	expect(info.hasVideo).toBe(false);
	// Lossless pack of PCM: clearly smaller than the WAV, nowhere near lossy-tier.
	assertRange(art.bytes.length / input.length, [0.05, 0.95], 'AU-16 flac/wav size ratio');
	const m = await audioMetricsInPage(page, art.bytes, 'audio/flac', { probeHz: STEREO_PROBES });
	const tones = expectStereoTones(m, 'AU-16');
	rec.record({
		id: 'AU-16',
		settings: { tab: 'audio', output: 'flac' },
		input: { name: 'tone-3s.wav', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: {
			savingsPct: Number((((input.length - art.bytes.length) / input.length) * 100).toFixed(1)),
			...tones
		},
		assets: { output: rec.saveAsset('AU-16', 'output', art.name, art.bytes) }
	});
});

test('AU-17: wav → opus writes Ogg/Opus under the .opus name', async ({ page, rec }) => {
	await gotoTab(page, 'audio');
	await upload(page, fx('tone-3s.wav'));
	await setAudioOutput(page, 'OPUS');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.opus');
	const info = await audioInfo(art.bytes);
	expect(info.audioCodec).toBe('opus');
	expect(info.formatMime, 'Ogg container, not WebM').toMatch(/ogg/);
	const m = await audioMetricsInPage(page, art.bytes, 'audio/ogg', { probeHz: STEREO_PROBES });
	const tones = expectStereoTones(m, 'AU-17');
	rec.record({
		id: 'AU-17',
		settings: { tab: 'audio', output: 'opus' },
		input: { name: 'tone-3s.wav', bytes: readFileSync(fx('tone-3s.wav')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: tones,
		assets: { output: rec.saveAsset('AU-17', 'output', art.name, art.bytes) }
	});
});

test('AU-18: wav → weba writes audio-only WebM/Opus', async ({ page, rec }) => {
	await gotoTab(page, 'audio');
	await upload(page, fx('tone-3s.wav'));
	await setAudioOutput(page, 'WEBA');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.weba');
	const info = await audioInfo(art.bytes);
	expect(info.audioCodec).toBe('opus');
	expect(info.hasVideo, 'audio-only WebM').toBe(false);
	expect(info.formatMime, 'WebM container, not Ogg').toMatch(/webm|matroska/);
	const m = await audioMetricsInPage(page, art.bytes, 'audio/webm', { probeHz: STEREO_PROBES });
	const tones = expectStereoTones(m, 'AU-18');
	rec.record({
		id: 'AU-18',
		settings: { tab: 'audio', output: 'weba' },
		input: { name: 'tone-3s.wav', bytes: readFileSync(fx('tone-3s.wav')).length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: tones,
		assets: { output: rec.saveAsset('AU-18', 'output', art.name, art.bytes) }
	});
});

test('AU-19: weba → mp3 (WebM-audio input path)', async ({ page, rec }) => {
	test.skip(!audioFixtures().files['tone-3s.weba'], 'no Opus encoder in this Chromium');
	const input = readFileSync(fxAudio('tone-3s.weba'));
	await gotoTab(page, 'audio');
	await upload(page, fxAudio('tone-3s.weba'));
	await compress(page); // mp3 default
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.mp3');
	expect((await audioInfo(art.bytes)).audioCodec).toBe('mp3');
	const m = await audioMetricsInPage(page, art.bytes, 'audio/mpeg', { probeHz: STEREO_PROBES });
	const tones = expectStereoTones(m, 'AU-19');
	rec.record({
		id: 'AU-19',
		settings: { tab: 'audio', output: 'mp3', source: 'weba opus' },
		input: { name: 'tone-3s.weba', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: tones,
		assets: { output: rec.saveAsset('AU-19', 'output', art.name, art.bytes) }
	});
});

test('AU-20: .opus input + OGG output re-encodes and renames to .ogg', async ({ page, rec }) => {
	// The deliberate EXT-split behavior: OPUS is its own output now, so an
	// .opus file sent to OGG counts as a format change — a real re-encode and
	// a rename, never the keep-original guard.
	test.skip(!audioFixtures().files['tone-3s.opus'], 'no Opus encoder in this Chromium');
	await gotoTab(page, 'audio');
	await upload(page, fxAudio('tone-3s.opus'));
	await setAudioOutput(page, 'OGG');
	await compress(page);
	const art = await downloadRow(page);
	expect(art.name, 'renamed — not keep-original').toBe('tone-3s.ogg');
	expect((await audioInfo(art.bytes)).audioCodec).toBe('opus');
	rec.record({
		id: 'AU-20',
		title: '.opus → OGG crosses the format split (re-encode + rename)',
		settings: { tab: 'audio', output: 'ogg', source: 'opus' },
		input: { name: 'tone-3s.opus', bytes: readFileSync(fxAudio('tone-3s.opus')).length },
		output: { name: art.name, bytes: art.bytes.length }
	});
});

test('AU-21: FLAC output in target mode says the target does not apply', async ({ page, rec }) => {
	const input = readFileSync(fx('tone-3s.wav'));
	await gotoTab(page, 'audio');
	await upload(page, fx('tone-3s.wav'));
	// Arm target mode while MP3 is selected, then switch the output to FLAC —
	// the persisted mode stays 'target' even though its controls hide (AU-14
	// covers the WAV twin).
	await setTargetMb(page, 0.05);
	await setAudioOutput(page, 'FLAC');
	const run = await compress(page);
	expect(run.warnings.join(' — ')).toMatch(/lossless/i);
	const art = await downloadRow(page);
	expect(art.name).toBe('tone-3s.flac');
	expect(art.bytes.length, 'FLAC ignores the 50 KB target').toBeGreaterThan(50_000);
	rec.record({
		id: 'AU-21',
		title: 'FLAC + persisted target mode warns instead of silently overshooting',
		settings: { tab: 'audio', output: 'flac', mode: 'target', targetMb: 0.05 },
		input: { name: 'tone-3s.wav', bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		warnings: run.warnings
	});
});
