/**
 * Deterministic audio fixtures, generated INSIDE Chromium (WebCodecs
 * AudioEncoder + mediabunny + the LAME mp3 and libFLAC wasm encoders — the
 * same ones the app bundles) — node has no aac/opus/mp3 encoder. Same
 * architecture as video-fixtures.ts: runs from
 * Playwright global-setup, fake https origin (WebCodecs needs a secure
 * context), bundles injected via Blob imports, manifest records what THIS
 * run's encoders produced.
 *
 * The PCM is the EXACT tone plan of tone-3s.wav (scripts/generate-fixtures.mjs
 * keeps the twin copy — keep them in sync):
 *   L = 0.4·sin(440 Hz)    + 0.2·sweep(880→2080 Hz)
 *   R = 0.4·sin(554.37 Hz) + 0.2·sin(330 Hz)
 * so one Goertzel probe policy covers wav and encoded inputs alike; 3 kHz
 * (above the sweep's ceiling) is the silence control probe.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO_DIR = join(ROOT, 'tests', 'fixtures', 'generated', 'audio');
const MANIFEST = join(AUDIO_DIR, 'audio.manifest.json');
const MB_BUNDLE = join(ROOT, 'node_modules', 'mediabunny', 'dist', 'bundles', 'mediabunny.mjs');
const MP3_BUNDLE = join(
	ROOT,
	'node_modules',
	'@mediabunny',
	'mp3-encoder',
	'dist',
	'bundles',
	'mediabunny-mp3-encoder.mjs'
);
const FLAC_BUNDLE = join(
	ROOT,
	'node_modules',
	'@mediabunny',
	'flac-encoder',
	'dist',
	'bundles',
	'mediabunny-flac-encoder.mjs'
);

interface AudioSpec {
	name: string;
	container: 'mp3' | 'mp4' | 'ogg' | 'flac' | 'webm' | 'adts';
	codec: 'mp3' | 'aac' | 'opus' | 'flac';
	/** null = lossless codec, no bitrate knob */
	bitrate: number | null;
	sampleRate: number;
}

const SECONDS = 3;

/**
 * tone-3s.mp3 sits at 320 kbps ON PURPOSE: the recompress spec (AU-11)
 * re-encodes it at 128 kbps and asserts real shrink headroom.
 */
const SPECS: AudioSpec[] = [
	{ name: 'tone-3s.mp3', container: 'mp3', codec: 'mp3', bitrate: 320_000, sampleRate: 44_100 },
	{ name: 'tone-3s.m4a', container: 'mp4', codec: 'aac', bitrate: 192_000, sampleRate: 44_100 },
	// Opus is 48 kHz-native; asking for 44.1 k would just resample inside the codec.
	{ name: 'tone-3s.ogg', container: 'ogg', codec: 'opus', bitrate: 128_000, sampleRate: 48_000 },
	// Same Ogg/Opus stream under the .opus name (input + EXT-split specs).
	{ name: 'tone-3s.opus', container: 'ogg', codec: 'opus', bitrate: 128_000, sampleRate: 48_000 },
	// WebM audio (.weba) — Opus in an audio-only WebM.
	{ name: 'tone-3s.weba', container: 'webm', codec: 'opus', bitrate: 128_000, sampleRate: 48_000 },
	// Bare ADTS stream for /aac-to-mp3 — skip-gated on the aac capability.
	{ name: 'tone-3s.aac', container: 'adts', codec: 'aac', bitrate: 128_000, sampleRate: 44_100 },
	// FLAC encodes via the bundled libFLAC wasm (registered below, like LAME) —
	// WebCodecs still can't encode it in any browser.
	{ name: 'tone-3s.flac', container: 'flac', codec: 'flac', bitrate: null, sampleRate: 44_100 }
];

/** Tone table recorded per file so specs read probes from the manifest. */
const TONES = {
	left: [{ hz: 440, amp: 0.4 }],
	right: [
		{ hz: 554.37, amp: 0.4 },
		{ hz: 330, amp: 0.2 }
	],
	sweep: { channel: 'left', fromHz: 880, toHz: 2080, amp: 0.2 },
	controlHz: 3000
} as const;

export async function generateAudioFixtures(): Promise<void> {
	const mbSource = readFileSync(MB_BUNDLE, 'utf8');
	const mp3Source = readFileSync(MP3_BUNDLE, 'utf8');
	const flacSource = readFileSync(FLAC_BUNDLE, 'utf8');
	const genHash = createHash('sha256')
		.update(readFileSync(fileURLToPath(import.meta.url)))
		.update(mbSource)
		.update(mp3Source)
		.update(flacSource)
		.digest('hex')
		.slice(0, 16);

	if (existsSync(MANIFEST)) {
		try {
			if (JSON.parse(readFileSync(MANIFEST, 'utf8')).genHash === genHash) return;
		} catch {
			/* regenerate */
		}
	}
	mkdirSync(AUDIO_DIR, { recursive: true });
	console.log('generating audio fixtures (Chromium + WebCodecs + LAME)…');

	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.route('https://fixtures.local/**', (route) =>
			route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>fixtures</title>' })
		);
		await page.goto('https://fixtures.local/');
		const generated = await page.evaluate(
			async ({ mbSource, mp3Source, flacSource, specs, seconds }) => {
				const mbUrl = URL.createObjectURL(new Blob([mbSource], { type: 'text/javascript' }));
				const mod = await import(/* @vite-ignore */ mbUrl);
				// The encoder bundles bare-import "mediabunny", which a Blob
				// module can't resolve — rewrite the specifier to the Blob URL so
				// all of them share one mediabunny instance.
				const importRewritten = (source: string) =>
					import(
						/* @vite-ignore */ URL.createObjectURL(
							new Blob([source.replaceAll('"mediabunny"', JSON.stringify(mbUrl))], {
								type: 'text/javascript'
							})
						)
					);
				const mp3Mod = await importRewritten(mp3Source);
				if (!(await mod.canEncodeAudio('mp3'))) mp3Mod.registerMp3Encoder();
				const flacMod = await importRewritten(flacSource);
				if (!(await mod.canEncodeAudio('flac'))) flacMod.registerFlacEncoder();

				const capabilities: Record<string, boolean> = {
					mp3: await mod.canEncodeAudio('mp3'),
					aac: await mod.canEncodeAudio('aac'),
					opus: await mod.canEncodeAudio('opus'),
					flac: await mod.canEncodeAudio('flac')
				};

				const files: Record<string, { base64?: string; error?: string }> = {};
				for (const spec of specs) {
					try {
						if (!capabilities[spec.codec]) throw new Error(`no ${spec.codec} encoder`);

						// PCM identical to tone-3s.wav (generate-fixtures.mjs twin).
						const frames = spec.sampleRate * seconds;
						const buffer = new AudioBuffer({
							numberOfChannels: 2,
							length: frames,
							sampleRate: spec.sampleRate
						});
						const left = new Float32Array(frames);
						const right = new Float32Array(frames);
						for (let i = 0; i < frames; i++) {
							const t = i / spec.sampleRate;
							left[i] =
								0.4 * Math.sin(2 * Math.PI * 440 * t) +
								0.2 * Math.sin(2 * Math.PI * (880 + 200 * t) * t);
							right[i] =
								0.4 * Math.sin(2 * Math.PI * 554.37 * t) + 0.2 * Math.sin(2 * Math.PI * 330 * t);
						}
						buffer.copyToChannel(left, 0);
						buffer.copyToChannel(right, 1);

						const format =
							spec.container === 'mp3'
								? new mod.Mp3OutputFormat()
								: spec.container === 'mp4'
									? new mod.Mp4OutputFormat()
									: spec.container === 'ogg'
										? new mod.OggOutputFormat()
										: spec.container === 'webm'
											? new mod.WebMOutputFormat()
											: spec.container === 'adts'
												? new mod.AdtsOutputFormat()
												: new mod.FlacOutputFormat();
						const target = new mod.BufferTarget();
						const output = new mod.Output({ format, target });
						const source = new mod.AudioBufferSource({
							codec: spec.codec,
							...(spec.bitrate ? { bitrate: spec.bitrate } : {})
						});
						output.addAudioTrack(source);
						await output.start();
						await source.add(buffer);
						await output.finalize();

						const bytes = new Uint8Array(target.buffer!);
						let bin = '';
						for (let i = 0; i < bytes.length; i += 32_768) {
							bin += String.fromCharCode(...bytes.subarray(i, i + 32_768));
						}
						files[spec.name] = { base64: btoa(bin) };
					} catch (error) {
						files[spec.name] = { error: String(error) };
					}
				}
				return { capabilities, files };
			},
			{ mbSource, mp3Source, flacSource, specs: SPECS, seconds: SECONDS }
		);

		const manifestFiles: Record<string, object> = {};
		const failures: string[] = [];
		for (const spec of SPECS) {
			const out = generated.files[spec.name];
			if (!out?.base64) {
				failures.push(`${spec.name}: ${out?.error ?? 'unknown'}`);
				continue;
			}
			writeFileSync(join(AUDIO_DIR, spec.name), Buffer.from(out.base64, 'base64'));
			manifestFiles[spec.name] = {
				durationSec: SECONDS,
				sampleRate: spec.sampleRate,
				channels: 2,
				codec: spec.codec,
				bitrate: spec.bitrate,
				tones: TONES
			};
		}

		// corrupt.mp3 needs no browser: a well-formed ID3v2 header whose declared
		// (synchsafe) size swallows the rest of the file — a correct demuxer skips
		// the tag, finds no MPEG frame sync, and errors cleanly at the row level.
		const junk = Buffer.alloc(2048);
		junk.write('ID3\x04\x00\x00', 0, 'latin1');
		const tagSize = junk.length - 10;
		junk[6] = (tagSize >> 21) & 0x7f;
		junk[7] = (tagSize >> 14) & 0x7f;
		junk[8] = (tagSize >> 7) & 0x7f;
		junk[9] = tagSize & 0x7f;
		for (let i = 10; i < junk.length; i++) junk[i] = (i * 41) % 256;
		writeFileSync(join(AUDIO_DIR, 'corrupt.mp3'), junk);
		manifestFiles['corrupt.mp3'] = { corrupt: true };

		writeFileSync(
			MANIFEST,
			JSON.stringify(
				{ genHash, capabilities: generated.capabilities, failures, files: manifestFiles },
				null,
				'\t'
			)
		);

		// The LAME and libFLAC encoders are bundled — mp3 and flac MUST work.
		// aac/opus come from the platform; their absence degrades to
		// capability-gated skips.
		const critical = failures.filter(
			(f) => f.startsWith('tone-3s.mp3') || f.startsWith('tone-3s.flac')
		);
		if (critical.length) {
			throw new Error(`audio fixture generation failed:\n${critical.join('\n')}`);
		}
		console.log(
			`audio fixtures ready (${Object.keys(manifestFiles).length} files; capabilities ${JSON.stringify(generated.capabilities)})`
		);
	} finally {
		await browser.close();
	}
}
