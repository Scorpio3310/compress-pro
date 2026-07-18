/**
 * Real-file matrix — AUDIO family. Every routable real audio file (normal
 * tier) runs the default mp3 conversion plus every applicable output pill
 * (same-as-source excluded), validated STRUCTURALLY on every cell: node-side
 * decode-back (mediabunny audioInfo), codec/container/extension, channel and
 * duration preservation. Two representatives (one mp3, one wav) additionally
 * decode in-page (OfflineAudioContext) for RMS + gated band-energy ratios —
 * the realAudioCase math from real-files.spec.ts, kept local per the matrix
 * convention. A bitrate ladder on one mp3 proves the pills are honest, and
 * one real video extracts its audio track on the matching converter page.
 *
 * Cell titles: `MX [audio] <file> :: <action> @<level>` — grep one to re-run.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { assertRange, expect, test } from '../fixtures';
import {
	audioMetricsInPage,
	compress,
	downloadRow,
	gotoPath,
	gotoTab,
	setAudioBitrate,
	upload,
	type AudioMetrics
} from '../helpers';
import { AUDIO_REAL } from '../thresholds';
import { audioInfo, videoInfo } from '../verify';
import { MatrixRecorder, timer } from './record';
import { realByFormat, type RealFile } from './walk';

test.describe.configure({ timeout: 300_000 });

if (process.env.E2E_PREVIEW) throw new Error('matrix specs need the dev server (rasterizers)');

const rec = new MatrixRecorder('audio');
const AUDIO_TOOL = '/compress-audio';

const files = realByFormat(['audio']);

// --- output expectations (audio.spec.ts AU-01..21 are the source of truth) --

type Pill = 'M4A' | 'WAV' | 'FLAC' | 'OGG' | 'OPUS' | 'WEBA';
type Target = 'MP3' | Pill;

interface OutputSpec {
	ext: string;
	codec: RegExp;
	/** Container proof via audioInfo formatMime (OPUS = Ogg, WEBA = WebM). */
	formatMime?: RegExp;
	/** WEBA must carry no video track. */
	audioOnly?: boolean;
}

const OUTPUTS: Record<Target, OutputSpec> = {
	MP3: { ext: '.mp3', codec: /^mp3$/ },
	M4A: { ext: '.m4a', codec: /^aac$/ },
	WAV: { ext: '.wav', codec: /^pcm/ },
	FLAC: { ext: '.flac', codec: /^flac$/ },
	OGG: { ext: '.ogg', codec: /^opus$/ }, // the app encodes Opus into Ogg (AU-04)
	OPUS: { ext: '.opus', codec: /^opus$/, formatMime: /ogg/ },
	WEBA: { ext: '.weba', codec: /^opus$/, formatMime: /webm|matroska/, audioOnly: true }
};

const PILLS: Pill[] = ['M4A', 'WAV', 'FLAC', 'OGG', 'OPUS', 'WEBA'];

/** Source ext → the pill that would be a same-format no-op (skipped in the
 *  sweep). The MP3 default still runs on mp3 sources — that is the real
 *  192 kbps recompress path (AU-11 precedent), keep-original allowed. */
const SAME_AS_SOURCE: Record<string, Pill | undefined> = {
	m4a: 'M4A',
	aac: 'M4A',
	wav: 'WAV',
	flac: 'FLAC',
	ogg: 'OGG',
	oga: 'OGG',
	opus: 'OPUS',
	weba: 'WEBA'
};

function targetsFor(f: RealFile): Target[] {
	return ['MP3' as Target, ...PILLS.filter((p) => p !== SAME_AS_SOURCE[f.ext])];
}

async function setAudioOutput(page: Page, pill: Pill): Promise<void> {
	const btn = page.getByRole('button', { name: pill, exact: true });
	await btn.click();
	await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

// --- A) per-file output sweep — structural validation on every cell ---------

for (const f of files) {
	for (const target of targetsFor(f)) {
		const action = `convert:${target.toLowerCase()}`;
		test(`MX [audio] ${f.rel} :: ${action} @default`, async ({ page }) => {
			const input = readFileSync(f.abs);
			const spec = OUTPUTS[target];
			const elapsed = timer();
			try {
				const inInfo = await audioInfo(input);
				await gotoTab(page, 'audio');
				await upload(page, f.abs);
				if (target !== 'MP3') await setAudioOutput(page, target);
				await compress(page, { timeout: 240_000 });
				const art = await downloadRow(page);
				const keptOriginal = art.bytes.length === input.length;
				const outInfo = await audioInfo(art.bytes); // decode-back: throws on garbage
				const durationDelta = Math.abs(outInfo.durationSec - inInfo.durationSec);
				const metrics: Record<string, number | string | boolean | null> = {
					codec: outInfo.audioCodec ?? 'unknown',
					channels: outInfo.numberOfChannels,
					durationDelta: Number(durationDelta.toFixed(3)),
					effectiveKbps: Number(((art.bytes.length * 8) / outInfo.durationSec / 1000).toFixed(1))
				};

				// keep-original can only surface on the same-format mp3 default — its
				// bytes ARE the input, so the structural asserts hold trivially.
				expect(outInfo.audioCodec ?? '', `${target} output codec`).toMatch(spec.codec);
				expect(outInfo.numberOfChannels, 'channel count preserved').toBe(inInfo.numberOfChannels);
				expect(durationDelta, 'duration preserved').toBeLessThanOrEqual(
					AUDIO_REAL.durationDeltaSec
				);
				expect(art.name.endsWith(spec.ext), `named *${spec.ext} (got ${art.name})`).toBe(true);
				if (spec.formatMime) {
					expect(outInfo.formatMime, `${target} container`).toMatch(spec.formatMime);
				}
				if (spec.audioOnly) expect(outInfo.hasVideo, 'audio-only output').toBe(false);
				if (f.ext === 'wav' && target === 'FLAC') {
					// wav→FLAC is the lossless pack — hard shrink + calibrated size window.
					expect(art.bytes.length, 'lossless pack must shrink').toBeLessThan(input.length);
					const ratio = art.bytes.length / input.length;
					assertRange(ratio, AUDIO_REAL.flacSizeRatio, `${f.rel} flac/wav size ratio`);
					metrics.sizeRatio = Number(ratio.toFixed(3));
				}

				rec.cell({
					family: 'audio',
					file: f.rel,
					tool: AUDIO_TOOL,
					action,
					level: 'default',
					status: 'pass',
					inBytes: input.length,
					outBytes: art.bytes.length,
					keptOriginal,
					metrics,
					durationMs: elapsed(),
					notes: keptOriginal ? 'keep-original returned input bytes' : ''
				});
			} catch (error) {
				rec.cell({
					family: 'audio',
					file: f.rel,
					tool: AUDIO_TOOL,
					action,
					level: 'default',
					status: 'error',
					inBytes: input.length,
					durationMs: elapsed(),
					error: String(error).slice(0, 500)
				});
				throw error;
			}
		});
	}
}

// --- B) deep metric on two representatives (realAudioCase math, local) ------

/** Spectral probes: 5 sub-bins pooled per band — single ~0.02 Hz bins on real
 *  music are unstable in spectral valleys (real-files.spec.ts precedent). */
const BANDS = [300, 1000, 3000] as const;
const PROBES = BANDS.flatMap((hz) => [hz - 2, hz - 1, hz, hz + 1, hz + 2]);

/** RMS-pooled band amplitude across the 5 sub-bins of every channel. */
function bandAmp(m: AudioMetrics, center: number): number {
	const amps: number[] = [];
	for (const ch of m.channels) {
		for (let off = -2; off <= 2; off++) amps.push(ch.freqAmp[String(center + off)] ?? 0);
	}
	return Math.sqrt(amps.reduce((s, a) => s + a * a, 0) / Math.max(1, amps.length));
}

/** Input decodes memoized per path (worker-local, RF pattern). decodeAudioData
 *  sniffs the container — the data-URL mime is inert. */
const inputMetricsCache = new Map<string, AudioMetrics>();
async function inputMetrics(page: Page, abs: string): Promise<AudioMetrics> {
	const hit = inputMetricsCache.get(abs);
	if (hit) return hit;
	const m = await audioMetricsInPage(page, readFileSync(abs), 'application/octet-stream', {
		probeHz: PROBES
	});
	inputMetricsCache.set(abs, m);
	return m;
}

const byExt = (ext: string) => files.filter((f) => f.ext === ext);
const smallest = (list: RealFile[]): RealFile | null =>
	list.length ? [...list].sort((a, b) => a.bytes - b.bytes || a.rel.localeCompare(b.rel))[0] : null;

const deepReps = [smallest(byExt('mp3')), smallest(byExt('wav'))].filter(
	(f): f is RealFile => f !== null
);

for (const f of deepReps) {
	test(`MX [audio] ${f.rel} :: deep-metric @mp3-192`, async ({ page }) => {
		const input = readFileSync(f.abs);
		const elapsed = timer();
		try {
			const inInfo = await audioInfo(input);
			await gotoTab(page, 'audio');
			await upload(page, f.abs);
			await compress(page, { timeout: 240_000 }); // mp3 @ 192 kbps is the default
			const art = await downloadRow(page);
			const keptOriginal = art.bytes.length === input.length;
			const outInfo = await audioInfo(art.bytes);
			expect(outInfo.audioCodec, 'default output codec').toBe('mp3');
			expect(
				Math.abs(outInfo.durationSec - inInfo.durationSec),
				'duration preserved'
			).toBeLessThanOrEqual(AUDIO_REAL.durationDeltaSec);

			// Both sides through the identical decode+48 kHz-resample path, so
			// decoder bias cancels out of every ratio.
			const mOut = await audioMetricsInPage(page, art.bytes, 'audio/mpeg', { probeHz: PROBES });
			const mIn = await inputMetrics(page, f.abs);
			expect(
				Math.max(...mOut.channels.map((c) => c.rms)),
				'output must not be silence'
			).toBeGreaterThanOrEqual(AUDIO_REAL.rmsFloor);
			const rmsRatios = mOut.channels.map(
				(c, i) => c.rms / Math.max(mIn.channels[i]?.rms ?? 0, 1e-9)
			);
			rmsRatios.forEach((r, i) =>
				assertRange(r, AUDIO_REAL.rmsRatioLossy, `${f.rel} ch${i} rms out/in`)
			);
			const metrics: Record<string, number | string | boolean | null> = {
				rmsRatio: Number(
					rmsRatios.reduce((w, r) => (Math.abs(r - 1) > Math.abs(w - 1) ? r : w), 1).toFixed(3)
				)
			};
			for (const band of BANDS) {
				const aIn = bandAmp(mIn, band);
				const ratio = bandAmp(mOut, band) / Math.max(aIn, 1e-9);
				if (aIn >= AUDIO_REAL.bandGateAmp) {
					assertRange(ratio, AUDIO_REAL.bandRatioRange, `${f.rel} band ${band} Hz out/in`);
					metrics[`band${band}`] = Number(ratio.toFixed(2));
				} else {
					metrics[`band${band}`] = null; // input too quiet there — metric suppressed
				}
			}
			const effectiveKbps = (art.bytes.length * 8) / outInfo.durationSec / 1000;
			metrics.effectiveKbps = Number(effectiveKbps.toFixed(1));
			// LAME CBR at the default 192 pill — inapplicable if keep-original fired.
			if (!keptOriginal) {
				assertRange(effectiveKbps, AUDIO_REAL.mp3EffectiveKbps, `${f.rel} mp3 kbps @192`);
			}

			rec.cell({
				family: 'audio',
				file: f.rel,
				tool: AUDIO_TOOL,
				action: 'deep-metric',
				level: 'mp3-192',
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				keptOriginal,
				metrics,
				durationMs: elapsed(),
				notes: keptOriginal ? 'keep-original returned input bytes — kbps assert skipped' : ''
			});
		} catch (error) {
			rec.cell({
				family: 'audio',
				file: f.rel,
				tool: AUDIO_TOOL,
				action: 'deep-metric',
				level: 'mp3-192',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}

// --- C) bitrate ladder on one mp3 — the pills must be honest ----------------

const ladderSrc = smallest(byExt('mp3'));
const LADDER = [64, 128, 320] as const;

if (ladderSrc) {
	test(`MX [audio] ${ladderSrc.rel} :: bitrate-ladder @64-128-320`, async ({ page }) => {
		const input = readFileSync(ladderSrc.abs);
		const inInfo = await audioInfo(input);
		const inKbps = (input.length * 8) / inInfo.durationSec / 1000;
		const failures: string[] = [];
		const sizes = new Map<number, { bytes: number; kept: boolean }>();
		for (const kbps of LADDER) {
			const elapsed = timer();
			try {
				await gotoTab(page, 'audio');
				await upload(page, ladderSrc.abs);
				await setAudioBitrate(page, kbps);
				await compress(page, { timeout: 240_000 });
				const art = await downloadRow(page);
				// A pill at/above the source's own bitrate can legally return the
				// original bytes (keep-original guard) — noted, never a failure.
				const kept = art.bytes.length === input.length;
				const outInfo = await audioInfo(art.bytes);
				const effectiveKbps = (art.bytes.length * 8) / outInfo.durationSec / 1000;
				sizes.set(kbps, { bytes: art.bytes.length, kept });
				if (outInfo.audioCodec !== 'mp3') failures.push(`${kbps}: codec ${outInfo.audioCodec}`);
				if (!kept && (effectiveKbps < kbps * 0.8 || effectiveKbps > kbps * 1.2)) {
					failures.push(`${kbps}: effective ${effectiveKbps.toFixed(1)} kbps outside ±20%`);
				}
				rec.cell({
					family: 'audio',
					file: ladderSrc.rel,
					tool: AUDIO_TOOL,
					action: 'bitrate',
					level: String(kbps),
					status: failures.some((x) => x.startsWith(`${kbps}:`)) ? 'fail' : 'pass',
					inBytes: input.length,
					outBytes: art.bytes.length,
					keptOriginal: kept,
					metrics: {
						effectiveKbps: Number(effectiveKbps.toFixed(1)),
						sourceKbps: Number(inKbps.toFixed(1))
					},
					durationMs: elapsed(),
					notes: kept
						? `keep-original (source ≈ ${inKbps.toFixed(0)} kbps) — kbps assert skipped`
						: ''
				});
			} catch (error) {
				rec.cell({
					family: 'audio',
					file: ladderSrc.rel,
					tool: AUDIO_TOOL,
					action: 'bitrate',
					level: String(kbps),
					status: 'error',
					inBytes: input.length,
					durationMs: elapsed(),
					error: String(error).slice(0, 500)
				});
				failures.push(`${kbps}: ${String(error).slice(0, 200)}`);
			}
		}
		// Strict size ordering among the real (non-keep-original) outputs.
		const real = LADDER.filter((k) => sizes.get(k) && !sizes.get(k)!.kept);
		for (let i = 1; i < real.length; i++) {
			const lo = sizes.get(real[i - 1])!.bytes;
			const hi = sizes.get(real[i])!.bytes;
			if (!(lo < hi)) {
				failures.push(`sizes not ordered: ${real[i - 1]} kbps ${lo} !< ${real[i]} kbps ${hi}`);
			}
		}
		expect(failures, failures.join(' | ')).toEqual([]);
	});
}

// --- E) video-as-audio-input on the matching converter page -----------------

const videoSrc = smallest(
	realByFormat(['video']).filter((f) => f.ext === 'mp4' || f.ext === 'mov')
);

if (videoSrc) {
	const route = `/${videoSrc.ext}-to-mp3`;
	test(`MX [audio] ${videoSrc.rel} :: extract-audio @default`, async ({ page }) => {
		const input = readFileSync(videoSrc.abs);
		const elapsed = timer();
		let inInfo: Awaited<ReturnType<typeof videoInfo>>;
		try {
			inInfo = await videoInfo(input);
		} catch (error) {
			rec.cell({
				family: 'audio',
				file: videoSrc.rel,
				tool: route,
				action: 'extract-audio',
				level: 'default',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
		if (!inInfo.audioCodec) {
			rec.cell({
				family: 'audio',
				file: videoSrc.rel,
				tool: route,
				action: 'extract-audio',
				level: 'default',
				status: 'skip',
				inBytes: input.length,
				durationMs: elapsed(),
				notes: 'video has no audio track — nothing to extract'
			});
			test.skip(true, 'chosen real video has no audio track');
			return;
		}
		try {
			await gotoPath(page, route);
			await upload(page, videoSrc.abs);
			await compress(page, { timeout: 240_000 });
			const art = await downloadRow(page);
			const outInfo = await audioInfo(art.bytes);
			expect(outInfo.audioCodec, 'extracted codec').toBe('mp3');
			expect(outInfo.hasVideo, 'video track discarded').toBe(false);
			expect(art.name.endsWith('.mp3'), `named *.mp3 (got ${art.name})`).toBe(true);
			// Container duration vs mp3 track: the video track may outlast the audio
			// by a frame or two, plus LAME padding — slightly wider than pure-audio.
			const durationDelta = Math.abs(outInfo.durationSec - inInfo.durationSec);
			expect(durationDelta, 'duration matches the source video').toBeLessThanOrEqual(0.5);
			rec.cell({
				family: 'audio',
				file: videoSrc.rel,
				tool: route,
				action: 'extract-audio',
				level: 'default',
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				metrics: {
					sourceAudioCodec: inInfo.audioCodec,
					durationDelta: Number(durationDelta.toFixed(3)),
					channels: outInfo.numberOfChannels
				},
				durationMs: elapsed(),
				notes: ''
			});
		} catch (error) {
			rec.cell({
				family: 'audio',
				file: videoSrc.rel,
				tool: route,
				action: 'extract-audio',
				level: 'default',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}
