/**
 * Deterministic video fixtures, generated INSIDE Chromium (WebCodecs +
 * mediabunny) because Node has neither — runs from Playwright global-setup,
 * which starts before the web server, so it launches its own browser and
 * injects the mediabunny bundle straight from node_modules via a Blob import.
 *
 * Every clip renders a per-second solid color band (recorded in the manifest
 * for pixel-level verification), a moving white square and a frame counter.
 * Encoders aren't byte-deterministic across machines, so the manifest records
 * what THIS run produced (dims, fps, frames, codecs) — tests assert structure
 * and band colors, never hashes.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIDEO_DIR = join(ROOT, 'tests', 'fixtures', 'generated', 'video');
const MANIFEST = join(VIDEO_DIR, 'video.manifest.json');
const BUNDLE = join(ROOT, 'node_modules', 'mediabunny', 'dist', 'bundles', 'mediabunny.mjs');

interface ClipSpec {
	name: string;
	width: number;
	height: number;
	fps: number;
	seconds: number;
	container: 'mp4' | 'webm' | 'mkv' | 'mov';
	videoCodec: 'avc' | 'vp9';
	audio: boolean;
	rotate?: 90;
	/** Deterministic per-block noise overlay (resists over-compression). */
	noise?: boolean;
	bandColors: [number, number, number][];
}

const BANDS: [number, number, number][] = [
	[200, 40, 40],
	[40, 170, 60],
	[40, 80, 210],
	[220, 190, 40],
	[170, 40, 190],
	[40, 190, 190],
	[230, 120, 30],
	[120, 120, 120],
	[240, 240, 240],
	[30, 30, 30]
];

const clip = (spec: Omit<ClipSpec, 'bandColors'>): ClipSpec => ({ ...spec, bandColors: BANDS });

const CLIPS: ClipSpec[] = [
	clip({
		name: 'v-320x240-3s.mp4',
		width: 320,
		height: 240,
		fps: 30,
		seconds: 3,
		container: 'mp4',
		videoCodec: 'avc',
		audio: false
	}),
	clip({
		name: 'v-320x240-3s.mov',
		width: 320,
		height: 240,
		fps: 30,
		seconds: 3,
		container: 'mov',
		videoCodec: 'avc',
		audio: false
	}),
	clip({
		name: 'v-320x240-3s.webm',
		width: 320,
		height: 240,
		fps: 30,
		seconds: 3,
		container: 'webm',
		videoCodec: 'vp9',
		audio: false
	}),
	clip({
		name: 'v-720p-10s.mp4',
		width: 1280,
		height: 720,
		fps: 30,
		seconds: 10,
		container: 'mp4',
		videoCodec: 'avc',
		audio: false,
		noise: true
	}),
	clip({
		name: 'v-60fps-2s.mp4',
		width: 320,
		height: 240,
		fps: 60,
		seconds: 2,
		container: 'mp4',
		videoCodec: 'avc',
		audio: false
	}),
	clip({
		name: 'v-audio-3s.mp4',
		width: 320,
		height: 240,
		fps: 30,
		seconds: 3,
		container: 'mp4',
		videoCodec: 'avc',
		audio: true
	}),
	clip({
		name: 'v-audio-3s.webm',
		width: 320,
		height: 240,
		fps: 30,
		seconds: 3,
		container: 'webm',
		videoCodec: 'vp9',
		audio: true
	}),
	clip({
		name: 'v-rotated-90.mp4',
		width: 320,
		height: 240,
		fps: 30,
		seconds: 2,
		container: 'mp4',
		videoCodec: 'avc',
		audio: false,
		rotate: 90
	}),
	// Matroska input coverage (WebM is an MKV profile; MkvOutputFormat writes
	// the full-brand container). avc-in-mkv is a first-class mediabunny path.
	clip({
		name: 'v-320x240-3s.mkv',
		width: 320,
		height: 240,
		fps: 30,
		seconds: 3,
		container: 'mkv',
		videoCodec: 'avc',
		audio: false
	})
];

export async function generateVideoFixtures(): Promise<void> {
	const bundleSource = readFileSync(BUNDLE, 'utf8');
	const genHash = createHash('sha256')
		.update(readFileSync(fileURLToPath(import.meta.url)))
		.update(bundleSource)
		.digest('hex')
		.slice(0, 16);

	if (existsSync(MANIFEST)) {
		try {
			if (JSON.parse(readFileSync(MANIFEST, 'utf8')).genHash === genHash) return;
		} catch {
			/* regenerate */
		}
	}
	mkdirSync(VIDEO_DIR, { recursive: true });
	console.log('generating video fixtures (Chromium + WebCodecs)…');

	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		// WebCodecs is secure-context-only and about:blank does not qualify here —
		// fulfill a fake https origin locally so the page gets the real API.
		await page.route('https://fixtures.local/**', (route) =>
			route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>fixtures</title>' })
		);
		await page.goto('https://fixtures.local/');
		const generated = await page.evaluate(
			async ({ bundleSource, clips }) => {
				const mod = await import(
					/* @vite-ignore */ URL.createObjectURL(
						new Blob([bundleSource], { type: 'text/javascript' })
					)
				);

				const capabilities = {
					avc:
						(await mod.getFirstEncodableVideoCodec(['avc'], { width: 320, height: 240 })) === 'avc',
					vp9:
						(await mod.getFirstEncodableVideoCodec(['vp9'], { width: 320, height: 240 })) === 'vp9',
					opus: await mod.canEncodeAudio('opus'),
					aac: await mod.canEncodeAudio('aac')
				};

				const files: Record<string, { base64?: string; error?: string }> = {};

				// Deterministic PRNG for the noise clip.
				const mulberry32 = (seed: number) => () => {
					seed |= 0;
					seed = (seed + 0x6d2b79f5) | 0;
					let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
					t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
					return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
				};

				for (const spec of clips) {
					try {
						if (spec.videoCodec === 'avc' && !capabilities.avc) throw new Error('no avc encoder');
						if (spec.videoCodec === 'vp9' && !capabilities.vp9) throw new Error('no vp9 encoder');
						if (spec.audio && !capabilities.opus) throw new Error('no opus encoder');

						const canvas = new OffscreenCanvas(spec.width, spec.height);
						const ctx = canvas.getContext('2d')!;
						const format =
							spec.container === 'mp4'
								? new mod.Mp4OutputFormat()
								: spec.container === 'mov'
									? new mod.MovOutputFormat()
									: spec.container === 'mkv'
										? new mod.MkvOutputFormat()
										: new mod.WebMOutputFormat();
						const target = new mod.BufferTarget();
						const output = new mod.Output({ format, target });
						const videoSource = new mod.CanvasSource(canvas, {
							codec: spec.videoCodec,
							bitrate: 1_200_000
						});
						output.addVideoTrack(videoSource, spec.rotate ? { rotation: spec.rotate } : undefined);

						let audioSource: { add(buffer: AudioBuffer): Promise<void> } | null = null;
						if (spec.audio) {
							audioSource = new mod.AudioBufferSource({ codec: 'opus', bitrate: 96_000 });
							output.addAudioTrack(audioSource);
						}

						await output.start();

						const frames = spec.fps * spec.seconds;
						const rand = mulberry32(1234);
						for (let f = 0; f < frames; f++) {
							const second = Math.floor(f / spec.fps);
							const [r, g, b] = spec.bandColors[second % spec.bandColors.length];
							ctx.fillStyle = `rgb(${r},${g},${b})`;
							ctx.fillRect(0, 0, spec.width, spec.height);
							if (spec.noise) {
								// 16px blocks reshuffled every frame — keeps bitrate honest.
								for (let y = 0; y < spec.height; y += 16) {
									for (let x = 0; x < spec.width; x += 16) {
										const v = Math.floor(rand() * 120);
										ctx.fillStyle = `rgba(${v},${v},${v},0.45)`;
										ctx.fillRect(x, y, 16, 16);
									}
								}
							}
							ctx.fillStyle = '#ffffff';
							const sq = Math.max(20, Math.round(spec.height / 8));
							const x = (f * 7) % Math.max(1, spec.width - sq);
							ctx.fillRect(x, Math.round(spec.height / 2 - sq / 2), sq, sq);
							ctx.fillStyle = '#000000';
							ctx.font = `${Math.round(spec.height / 6)}px sans-serif`;
							ctx.fillText(String(f), 8, Math.round(spec.height / 5));
							await videoSource.add(f / spec.fps, 1 / spec.fps);
						}

						if (audioSource) {
							const actx = new OfflineAudioContext(1, 48_000 * spec.seconds, 48_000);
							const osc = actx.createOscillator();
							osc.frequency.value = 440;
							osc.connect(actx.destination);
							osc.start();
							const buffer = await actx.startRendering();
							await audioSource.add(buffer);
						}

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
			{ bundleSource, clips: CLIPS }
		);

		const manifestFiles: Record<string, object> = {};
		const failures: string[] = [];
		for (const spec of CLIPS) {
			const out = generated.files[spec.name];
			if (!out?.base64) {
				failures.push(`${spec.name}: ${out?.error ?? 'unknown'}`);
				continue;
			}
			writeFileSync(join(VIDEO_DIR, spec.name), Buffer.from(out.base64, 'base64'));
			manifestFiles[spec.name] = {
				width: spec.width,
				height: spec.height,
				fps: spec.fps,
				seconds: spec.seconds,
				frames: spec.fps * spec.seconds,
				container: spec.container,
				videoCodec: spec.videoCodec,
				audio: spec.audio ? 'opus' : null,
				rotate: spec.rotate ?? 0,
				bandColors: spec.bandColors
			};
		}

		// corrupt.mp4 needs no browser: a valid ftyp header followed by garbage.
		const junk = Buffer.alloc(512);
		junk.write('\0\0\0\x18ftypisom', 0, 'latin1');
		for (let i = 16; i < junk.length; i++) junk[i] = (i * 37) % 256;
		writeFileSync(join(VIDEO_DIR, 'corrupt.mp4'), junk);
		manifestFiles['corrupt.mp4'] = { corrupt: true };

		writeFileSync(
			MANIFEST,
			JSON.stringify(
				{ genHash, capabilities: generated.capabilities, failures, files: manifestFiles },
				null,
				'\t'
			)
		);

		// The rotated clip may legitimately fail if the muxer rejects the
		// metadata, and the mkv clip if an exotic build lacks MkvOutputFormat —
		// their tests skip. Anything else failing is a hard error.
		const critical = failures.filter(
			(f) => !f.startsWith('v-rotated-90') && !f.startsWith('v-320x240-3s.mkv')
		);
		if (critical.length) {
			throw new Error(`video fixture generation failed:\n${critical.join('\n')}`);
		}
		console.log(
			`video fixtures ready (${Object.keys(manifestFiles).length} files; capabilities ${JSON.stringify(generated.capabilities)})`
		);
	} finally {
		await browser.close();
	}
}
