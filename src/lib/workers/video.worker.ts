import type { WorkerContracts, VideoProbeResult } from './protocol';
import { expose } from './host';
import { createJobRegistry } from './job-registry';
import {
	containScale,
	createFrameRateDecimator,
	fitDimensions,
	frameDelayMs,
	qualityToBitrate,
	rotatedDrawSpec
} from '$lib/codecs/video-math';
import {
	ALL_FORMATS,
	AudioSampleSink,
	AudioSampleSource,
	BlobSource,
	BufferTarget,
	CanvasSink,
	CanvasSource,
	Conversion,
	EncodedAudioPacketSource,
	EncodedPacketSink,
	FlacOutputFormat,
	Input,
	MovOutputFormat,
	Mp3OutputFormat,
	Mp4OutputFormat,
	OggOutputFormat,
	Output,
	WavOutputFormat,
	WebMOutputFormat,
	canEncodeAudio,
	getFirstEncodableVideoCodec,
	type AudioCodec,
	type EncodedPacket,
	type InputAudioTrack,
	type InputVideoTrack,
	type OutputFormat,
	type Rotation
} from 'mediabunny';
import { isLosslessAudioFormat, type AudioConversionSettings } from '$lib/types';

function openInput(file: File) {
	return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

/** Jobs in flight, so `cancel` can reach them by id. Every handler registers
 *  BEFORE its heavy setup (see job-registry.ts) — a cancel arriving during
 *  encoder fetch / Conversion.init must not be silently dropped, or the main
 *  thread's 5 s fallback hard-kills this healthy worker. */
const jobs = createJobRegistry();

function undecodableMessage(codec: string | null): string {
	const name = codec ? codec.toUpperCase() : 'this';
	return (
		`This browser can’t decode ${name} video — try Chrome, ` +
		'or convert on the device that recorded it'
	);
}

/**
 * Motion-JPEG detection. mediabunny has no MJPEG codec, so its demuxer leaves a
 * 'jpeg' sample-entry track with `codec === null` (logging only a warning) and
 * `canDecode() === false`. But every packet is a whole JPEG file, so a null-codec
 * track whose first frame starts with the JPEG SOI marker (FF D8 FF) is MJPEG we
 * decode frame-by-frame ourselves (convertMjpeg) instead of rejecting.
 */
async function isMotionJpeg(video: InputVideoTrack): Promise<boolean> {
	try {
		const first = await new EncodedPacketSink(video).getFirstPacket();
		const d = first?.data;
		return !!d && d.length >= 3 && d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff;
	} catch {
		return false;
	}
}

/** One MJPEG packet = one whole JPEG file. Copy into a plain ArrayBuffer
 *  first — under cross-origin isolation packet.data may be
 *  SharedArrayBuffer-backed, which Blob rejects. */
async function decodeJpegPacket(packet: EncodedPacket): Promise<ImageBitmap> {
	try {
		return await createImageBitmap(new Blob([new Uint8Array(packet.data)], { type: 'image/jpeg' }));
	} catch {
		throw new Error('Couldn’t decode a Motion-JPEG frame — the file may be corrupt');
	}
}

/** Draw one raw (unrotated) MJPEG frame onto the display-dims canvas, baking
 *  the container's tkhd rotation in — the same thing mediabunny's Conversion
 *  does for decodable codecs. Without this, a QuickTime-rotated Photo-JPEG
 *  .mov gets its frames squashed into the swapped dims and plays sideways. */
function drawFrame(
	ctx: OffscreenCanvasRenderingContext2D,
	bitmap: ImageBitmap,
	width: number,
	height: number,
	rotation: Rotation
): void {
	if (rotation === 0) {
		ctx.drawImage(bitmap, 0, 0, width, height);
		return;
	}
	const spec = rotatedDrawSpec(rotation, width, height);
	ctx.save();
	ctx.translate(spec.translateX, spec.translateY);
	ctx.rotate(spec.rotateRad);
	ctx.scale(spec.scaleX, spec.scaleY);
	ctx.drawImage(bitmap, spec.dx, spec.dy, spec.dWidth, spec.dHeight);
	ctx.restore();
}

/**
 * Encoder-parameter fallback for the hand-rolled MJPEG audio path. mediabunny
 * builds the AAC codec string from the SOURCE sample rate, and ≤24 kHz maps to
 * HE-AAC profiles (mp4a.40.5/.29) no browser encoder accepts — exactly the
 * 8/22.05 kHz mono tracks vintage Photo-JPEG cameras record. Conversion
 * resamples such sources to its 48 kHz/stereo fallback; mirror that here,
 * resampling only as much as the encoder actually requires.
 */
async function audioEncodeTransform(
	track: InputAudioTrack,
	codec: AudioCodec,
	bitrate: number
): Promise<{ transform?: { sampleRate: number; numberOfChannels?: number } }> {
	const [numberOfChannels, sampleRate] = await Promise.all([
		track.getNumberOfChannels(),
		track.getSampleRate()
	]);
	if (await canEncodeAudio(codec, { numberOfChannels, sampleRate, bitrate })) return {};
	if (await canEncodeAudio(codec, { numberOfChannels, sampleRate: 48_000, bitrate })) {
		return { transform: { sampleRate: 48_000 } };
	}
	// Conversion's own last-resort parameters (48 kHz stereo).
	return { transform: { sampleRate: 48_000, numberOfChannels: 2 } };
}

/** Container → muxer + result MIME. MOV is MP4's ISOBMFF sibling — same codecs. */
const VIDEO_OUTPUT: Record<'mp4' | 'mov' | 'webm', { format: () => OutputFormat; mime: string }> = {
	mp4: { format: () => new Mp4OutputFormat(), mime: 'video/mp4' },
	mov: { format: () => new MovOutputFormat(), mime: 'video/quicktime' },
	webm: { format: () => new WebMOutputFormat(), mime: 'video/webm' }
};

// --- Audio output plumbing ---

// MIMEs are hardcoded: mediabunny's own mimeType getters report application/ogg
// and video/webm, which would mislabel audio downloads.
const AUDIO_OUTPUT: Record<
	AudioConversionSettings['outputFormat'],
	{ format: () => OutputFormat; codec: AudioCodec; mime: string }
> = {
	mp3: { format: () => new Mp3OutputFormat(), codec: 'mp3', mime: 'audio/mpeg' },
	m4a: { format: () => new Mp4OutputFormat(), codec: 'aac', mime: 'audio/mp4' },
	wav: { format: () => new WavOutputFormat(), codec: 'pcm-s16', mime: 'audio/wav' },
	ogg: { format: () => new OggOutputFormat(), codec: 'opus', mime: 'audio/ogg' },
	// .opus is the same Ogg/Opus stream, under the extension voice apps use.
	opus: { format: () => new OggOutputFormat(), codec: 'opus', mime: 'audio/ogg' },
	weba: { format: () => new WebMOutputFormat(), codec: 'opus', mime: 'audio/webm' },
	flac: { format: () => new FlacOutputFormat(), codec: 'flac', mime: 'audio/flac' }
};

function lazyEncoderRegistration(codec: AudioCodec, load: () => Promise<() => void>) {
	let ready: Promise<void> | null = null;
	return (): Promise<void> => {
		ready ??= (async () => {
			if (!(await canEncodeAudio(codec))) (await load())();
		})().catch((error) => {
			ready = null; // a transient chunk-fetch failure must not brick the session
			throw error;
		});
		return ready;
	};
}

/** WebCodecs never encodes MP3/FLAC, and Firefox + desktop-Linux Chromium lack
 *  AAC — wasm encoders fill in, registered on first use. Registration is
 *  per-worker-global (mediabunny clears its canEncodeAudio memo), so every
 *  path that needs a codec must ensure it itself: the video probe/convert
 *  can't rely on an audio-tab job having registered AAC first. */
const ensureMp3Encoder = lazyEncoderRegistration(
	'mp3',
	async () => (await import('@mediabunny/mp3-encoder')).registerMp3Encoder
);
const ensureFlacEncoder = lazyEncoderRegistration(
	'flac',
	async () => (await import('@mediabunny/flac-encoder')).registerFlacEncoder
);
const ensureAacEncoder = lazyEncoderRegistration(
	'aac',
	async () => (await import('@mediabunny/aac-encoder')).registerAacEncoder
);

/**
 * BT.2020 / PQ / HLG sources render washed out when naively encoded to SDR.
 * Primary signal is the container's color-space box; the codec-string
 * heuristic catches HEVC profile 2 / VP9 profile 2 files that omit it.
 */
function detectHdr(
	colorSpace: { primaries?: string | null; transfer?: string | null } | null,
	codecString: string | null
): boolean {
	if (colorSpace) {
		if (colorSpace.transfer === 'pq' || colorSpace.transfer === 'hlg') return true;
		if (colorSpace.primaries === 'bt2020') return true;
	}
	if (codecString) {
		if (/^(hvc1|hev1)\.2\./.test(codecString)) return true; // HEVC Main 10
		if (/^vp09\.02\./.test(codecString)) return true; // VP9 profile 2
		if (/^av01\.0\.\d+M\.10/.test(codecString)) return true; // AV1 10-bit
	}
	return false;
}

expose<WorkerContracts['video']>({
	probe: async ({ file, maxDimension }) => {
		const input = openInput(file);
		const video = await input.getPrimaryVideoTrack();
		if (!video) throw new Error('No video track found in this file');
		const audio = await input.getPrimaryAudioTrack();

		const [durationSec, width, height, rotation, videoCodec, codecString] = await Promise.all([
			input.computeDuration(),
			video.getDisplayWidth(),
			video.getDisplayHeight(),
			video.getRotation(),
			video.getCodec(),
			video.getCodecParameterString()
		]);
		// Encode support alone isn't enough — an undecodable source (HEVC on
		// Firefox, ProRes anywhere) would otherwise die mid-conversion with a
		// useless generic error. Motion-JPEG is the exception: mediabunny can't
		// decode it (null codec) but we can, so route it to convertMjpeg instead.
		const canDecode = await video.canDecode().catch(() => false);
		const mjpeg = !canDecode && videoCodec === null && (await isMotionJpeg(video));
		if (!canDecode && !mjpeg) {
			throw new Error(undecodableMessage(videoCodec));
		}
		const stats = await video.computePacketStats(120);
		const colorSpace = await video.getColorSpace().catch(() => null);

		let audioCodec: string | null = null;
		let audioBitrate: number | null = null;
		let audioDecodable = false;
		if (audio) {
			audioCodec = await audio.getCodec();
			audioBitrate =
				(await audio.computePacketStats(120).catch(() => null))?.averageBitrate ?? null;
			audioDecodable = await audio.canDecode().catch(() => false);
		}

		// Encodability depends on OUTPUT dimensions: check at the same fitted dims
		// the convert pass will use, not at the (possibly encoder-rejected) native
		// size — otherwise a downscale that would succeed is refused up front.
		const fitted = fitDimensions(width, height, maxDimension ?? null);
		const probeDims = { width: fitted.width, height: fitted.height };
		// AAC encodability is decided at CONVERT time (it re-registers the wasm
		// encoder and verifies), so the probe no longer speculatively fetches the
		// ~1 MB encoder chunk here — that Promise.all race is what produced the
		// flaky aacEncodable answer on Linux Chromium in the first place.
		const [mp4Codec, webmCodec] = await Promise.all([
			getFirstEncodableVideoCodec(['avc', 'hevc'], probeDims),
			getFirstEncodableVideoCodec(['vp9', 'vp8'], probeDims)
		]);
		const isobmffCodec = mp4Codec === 'avc' || mp4Codec === 'hevc' ? mp4Codec : null;

		const result: VideoProbeResult = {
			durationSec,
			width,
			height,
			frameRate: stats.averagePacketRate > 0 ? stats.averagePacketRate : null,
			// Label MJPEG (mediabunny reports null) so the UI and bitrate helpers
			// have a source codec; convertMjpeg is selected off `mjpeg` below.
			videoCodec: mjpeg ? 'mjpeg' : videoCodec,
			codecString,
			videoBitrate: stats.averageBitrate > 0 ? stats.averageBitrate : null,
			audioCodec,
			audioBitrate,
			rotation,
			likelyHdr: detectHdr(colorSpace, codecString),
			encodable: {
				mp4: isobmffCodec,
				mov: isobmffCodec, // MOV shares MP4's codec policy — only the wrapper differs
				webm: webmCodec === 'vp9' || webmCodec === 'vp8' ? webmCodec : null
			},
			audioDecodable,
			mjpeg
		};
		return { result };
	},

	convert: async ({ jobId, file, container, video, audio }, progress) => {
		// Registered BEFORE the encoder fetch + Conversion.init: a cancel in
		// that multi-second window must settle the job, not evaporate.
		const job = jobs.register(jobId);
		try {
			// The convert worker is authoritative for "can this browser produce this
			// audio codec": it registers the wasm encoder sequentially (unlike the
			// probe's racy Promise.all) and verifies before muxing, so an Opus source
			// re-encodes to AAC even on Linux Chromium, where the native encoder is
			// absent and the probe-time capability answer flapped.
			if (audio.kind === 'encode') {
				if (audio.codec === 'aac') await ensureAacEncoder();
				if (!(await canEncodeAudio(audio.codec))) {
					throw new Error(
						`This browser can’t produce ${audio.codec.toUpperCase()} audio for ` +
							`${container.toUpperCase()} — choose WebM to keep the audio track`
					);
				}
			}
			job.throwIfCancelled();
			const input = openInput(file);
			const target = new BufferTarget();
			const output = new Output({
				format: VIDEO_OUTPUT[container].format(),
				target
			});

			const conversion = await Conversion.init({
				input,
				output,
				video: {
					codec: video.codec,
					bitrate: video.bitrate,
					...(video.width && video.height
						? { width: video.width, height: video.height, fit: 'contain' as const }
						: {}),
					...(video.frameRate ? { frameRate: video.frameRate } : {})
				},
				audio:
					audio.kind === 'discard'
						? { discard: true }
						: audio.kind === 'encode'
							? { codec: audio.codec, bitrate: audio.bitrate }
							: undefined, // copy: transmux when the codec is container-legal
				// Discard reasons are inspected below instead of console noise.
				showWarnings: false
			});
			// A cancel that raced init: adopt() forwards it to the conversion,
			// and the throw settles this call instead of running the full encode.
			job.adopt(conversion);
			job.throwIfCancelled();

			// Backstop for anything the probe missed: name the reason instead of
			// failing later with an empty output.
			const videoDropped = conversion.discardedTracks.find(
				(d) =>
					d.track.isVideoTrack() &&
					(d.reason === 'undecodable_source_codec' || d.reason === 'unknown_source_codec')
			);
			if (videoDropped) {
				throw new Error(undecodableMessage(await videoDropped.track.getCodec().catch(() => null)));
			}
			// An audio-only drop leaves isValid === true (the video track still carries
			// the file), so the check below won't catch it — a silent, audio-less
			// download is exactly the XB-06 defect. Name the reason instead of shipping
			// it. Gated on `encode` so `discard` (removeAudio) and `copy` are untouched.
			if (audio.kind === 'encode') {
				const audioDropped = conversion.discardedTracks.find((d) => d.track.isAudioTrack());
				if (audioDropped) {
					throw new Error(
						audioDropped.reason === 'undecodable_source_codec' ||
							audioDropped.reason === 'unknown_source_codec'
							? 'This browser can’t read the source audio — choose WebM, or turn on Remove audio'
							: `This browser can’t produce ${audio.codec.toUpperCase()} audio for ` +
									`${container.toUpperCase()} — choose WebM to keep the audio track`
					);
				}
			}
			if (!conversion.isValid) {
				const reasons = conversion.discardedTracks.map((d) => d.reason).join(', ');
				throw new Error(
					`This file can’t be converted in this browser (${reasons || 'no usable tracks'})`
				);
			}

			conversion.onProgress = (fraction) => progress({ fraction });
			await conversion.execute();

			const bytes = target.buffer;
			if (!bytes || bytes.byteLength === 0) throw new Error('Video conversion produced no output');
			return {
				result: { bytes, mimeType: VIDEO_OUTPUT[container].mime },
				transfer: [bytes]
			};
		} finally {
			job.finish();
		}
	},

	// Motion-JPEG re-encode. mediabunny can't decode the 'jpeg' track (null codec),
	// but EncodedPacketSink still yields each frame's raw JPEG bytes, which the
	// browser decodes. Mirrors the fromGif low-level pipeline, plus audio (GIFs are
	// silent): decode frames → CanvasSource, and copy/transcode the audio track into
	// the same Output. Video is streamed frame-by-frame so a multi-GB source never
	// lands in memory whole.
	convertMjpeg: async ({ jobId, file, container, video: v, audio }, progress) => {
		const job = jobs.register(jobId);
		let output: Output | null = null;
		try {
			// Same authoritative audio-encoder guard as `convert`.
			if (audio.kind === 'encode') {
				if (audio.codec === 'aac') await ensureAacEncoder();
				if (!(await canEncodeAudio(audio.codec))) {
					throw new Error(
						`This browser can’t produce ${audio.codec.toUpperCase()} audio for ` +
							`${container.toUpperCase()} — choose WebM to keep the audio track`
					);
				}
			}
			job.throwIfCancelled();

			const input = openInput(file);
			const videoTrack = await input.getPrimaryVideoTrack();
			if (!videoTrack) throw new Error('No video track found in this file');
			const audioTrack = audio.kind === 'discard' ? null : await input.getPrimaryAudioTrack();

			const [duration, dw, dh, rotation] = await Promise.all([
				input.computeDuration(),
				videoTrack.getDisplayWidth(),
				videoTrack.getDisplayHeight(),
				videoTrack.getRotation()
			]);
			// Main thread only forwards dims when it downscaled; otherwise fit to even
			// numbers here (encoders reject odd dimensions). Dims are DISPLAY dims
			// (rotation applied) — drawFrame bakes the rotation into the pixels.
			const { width, height } =
				v.width && v.height ? { width: v.width, height: v.height } : fitDimensions(dw, dh, null);

			const target = new BufferTarget();
			output = new Output({ format: VIDEO_OUTPUT[container].format(), target });

			const canvas = new OffscreenCanvas(width, height);
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');
			const videoSource = new CanvasSource(canvas, { codec: v.codec, bitrate: v.bitrate });
			output.addVideoTrack(videoSource);

			// Audio: copy (transmux) when the source codec is container-legal, else
			// transcode; decideAudio already made that call, so honour its `kind`.
			let audioSource: EncodedAudioPacketSource | AudioSampleSource | null = null;
			if (audioTrack && audio.kind === 'copy') {
				const srcCodec = await audioTrack.getCodec();
				if (srcCodec) {
					audioSource = new EncodedAudioPacketSource(srcCodec as AudioCodec);
					output.addAudioTrack(audioSource);
				}
			} else if (audioTrack && audio.kind === 'encode') {
				audioSource = new AudioSampleSource({
					codec: audio.codec,
					bitrate: audio.bitrate,
					// 8/22.05 kHz sources would otherwise demand HE-AAC and die.
					...(await audioEncodeTransform(audioTrack, audio.codec, audio.bitrate))
				});
				output.addAudioTrack(audioSource);
			}

			await output.start();

			// Pump audio and video concurrently so mediabunny interleaves by
			// timestamp; each source applies its own encoder backpressure.
			const pumpAudio = async () => {
				if (!audioTrack || !audioSource) return;
				if (audio.kind === 'copy' && audioSource instanceof EncodedAudioPacketSource) {
					const meta = { decoderConfig: (await audioTrack.getDecoderConfig()) ?? undefined };
					let first = true;
					for await (const packet of new EncodedPacketSink(audioTrack).packets()) {
						job.throwIfCancelled();
						await audioSource.add(packet, first ? meta : undefined);
						first = false;
					}
				} else if (audio.kind === 'encode' && audioSource instanceof AudioSampleSource) {
					for await (const sample of new AudioSampleSink(audioTrack).samples()) {
						job.throwIfCancelled();
						try {
							await audioSource.add(sample);
						} finally {
							sample.close();
						}
					}
				}
			};

			const pumpVideo = async () => {
				// The fps cap is applied by hand here — mediabunny's Conversion,
				// which normally implements it, can't decode MJPEG. Kept frames
				// tile at the cap's cadence so the duration stays intact.
				const keepFrame = createFrameRateDecimator(v.frameRate);
				for await (const packet of new EncodedPacketSink(videoTrack).packets()) {
					job.throwIfCancelled();
					if (!keepFrame(packet.timestamp)) continue;
					const bitmap = await decodeJpegPacket(packet);
					try {
						drawFrame(ctx, bitmap, width, height, rotation);
						await videoSource.add(
							packet.timestamp,
							v.frameRate ? 1 / v.frameRate : packet.duration
						);
					} finally {
						bitmap.close();
					}
					progress({ fraction: duration > 0 ? Math.min(packet.timestamp / duration, 0.99) : 0 });
				}
			};

			await Promise.all([pumpVideo(), pumpAudio()]);
			await output.finalize();

			const out = target.buffer;
			if (!out || out.byteLength === 0) throw new Error('Video conversion produced no output');
			return {
				result: { bytes: out, mimeType: VIDEO_OUTPUT[container].mime },
				transfer: [out]
			};
		} catch (error) {
			// Force-close the open VideoEncoder in this pooled worker (what Conversion
			// does on its own failures); throws if already finalized — nothing left then.
			try {
				await output?.cancel();
			} catch {
				// best-effort cleanup — the original error is what matters
			}
			throw error;
		} finally {
			job.finish();
		}
	},

	toGif: async ({ jobId, file, fps, maxDimension, quality }, progress) => {
		const job = jobs.register(jobId);
		try {
			const input = openInput(file);
			const video = await input.getPrimaryVideoTrack();
			if (!video) throw new Error('No video track found in this file');
			const canDecode = await video.canDecode().catch(() => false);
			// Same routing rule as the probe: MJPEG is undecodable for mediabunny
			// but perfectly decodable for us — never tell a user to switch
			// browsers over a file this app converts fine to MP4/WebM.
			const mjpeg = !canDecode && (await video.getCodec()) === null && (await isMotionJpeg(video));
			if (!canDecode && !mjpeg) {
				throw new Error(undecodableMessage(await video.getCodec().catch(() => null)));
			}

			const [duration, dw, dh, rotation] = await Promise.all([
				input.computeDuration(),
				video.getDisplayWidth(),
				video.getDisplayHeight(),
				video.getRotation()
			]);
			const scale = containScale(dw, dh, maxDimension);
			const width = Math.max(1, Math.round(dw * scale));
			const height = Math.max(1, Math.round(dh * scale));

			const timestamps: number[] = [];
			for (let t = 0; t < duration; t += 1 / fps) timestamps.push(t);

			const canvas = new OffscreenCanvas(width, height);
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');

			const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
			const gif = GIFEncoder();
			const maxColors = Math.max(2, Math.round((quality / 100) * 256));
			const delayMs = Math.round(1000 / fps);

			const quantizeCanvas = () => {
				const imageData = ctx.getImageData(0, 0, width, height);
				const rgba = new Uint8Array(
					imageData.data.buffer,
					imageData.data.byteOffset,
					imageData.data.byteLength
				);
				const palette = quantize(rgba, maxColors);
				const index = applyPalette(rgba, palette);
				return { palette, index };
			};

			let frame = 0;
			if (mjpeg) {
				// Sample the same fps grid by holding each decoded JPEG frame until
				// the next packet's timestamp passes the slot — what CanvasSink
				// does for decodable codecs. Held frames reuse their quantization.
				const sink = new EncodedPacketSink(video);
				let current = await sink.getFirstPacket();
				if (!current) throw new Error('No video frames found in this file');
				let next = await sink.getNextPacket(current);
				let quantized: ReturnType<typeof quantizeCanvas> | null = null;
				for (const t of timestamps) {
					job.throwIfCancelled();
					frame++;
					while (next && next.timestamp <= t) {
						current = next;
						next = await sink.getNextPacket(current);
						quantized = null;
					}
					if (!quantized) {
						const bitmap = await decodeJpegPacket(current);
						try {
							drawFrame(ctx, bitmap, width, height, rotation);
						} finally {
							bitmap.close();
						}
						quantized = quantizeCanvas();
					}
					gif.writeFrame(quantized.index, width, height, {
						palette: quantized.palette,
						delay: delayMs
					});
					progress({ frame, frameCount: timestamps.length });
				}
			} else {
				// CanvasSink scales for us; frames are copied onto our own canvas so
				// getImageData never depends on the sink's internal context type.
				// A null slot (seek miss / undecodable moment) still OWNS its slice
				// of the timeline — hold the previous frame instead of skipping, or
				// the GIF silently contracts (13.3 s 4K clip shipped as 9.0 s, F-72).
				const sink = new CanvasSink(video, { width, height, fit: 'fill' });
				let held: ReturnType<typeof quantizeCanvas> | null = null;
				let leadingNulls = 0;
				for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
					job.throwIfCancelled();
					frame++;
					if (wrapped) {
						ctx.drawImage(wrapped.canvas, 0, 0);
						held = quantizeCanvas();
						// Slots missed before the first decodable frame get backfilled
						// with it — leading timeline must not vanish either.
						for (; leadingNulls > 0; leadingNulls--) {
							gif.writeFrame(held.index, width, height, { palette: held.palette, delay: delayMs });
						}
					} else if (!held) {
						leadingNulls++;
						progress({ frame, frameCount: timestamps.length });
						continue;
					}
					gif.writeFrame(held.index, width, height, { palette: held.palette, delay: delayMs });
					progress({ frame, frameCount: timestamps.length });
				}
			}
			gif.finish();
			const out = gif.bytes();
			const bytes = out.buffer.slice(
				out.byteOffset,
				out.byteOffset + out.byteLength
			) as ArrayBuffer;
			if (bytes.byteLength === 0) throw new Error('GIF conversion produced no output');
			return { result: { bytes }, transfer: [bytes] };
		} finally {
			job.finish();
		}
	},

	fromGif: async ({ jobId, bytes, container, quality, maxDimension }, progress) => {
		if (typeof ImageDecoder === 'undefined' || !(await ImageDecoder.isTypeSupported('image/gif'))) {
			throw new Error('This browser can’t decode GIF animations — try Chrome');
		}
		const found = await getFirstEncodableVideoCodec(
			container === 'webm' ? ['vp9', 'vp8'] : ['avc', 'hevc']
		);
		const codec =
			found === 'avc' || found === 'hevc' || found === 'vp9' || found === 'vp8' ? found : null;
		if (!codec) {
			throw new Error(
				`This browser can’t encode ${container.toUpperCase()} video — try another output format`
			);
		}

		const decoder = new ImageDecoder({ data: bytes, type: 'image/gif' });
		const job = jobs.register(jobId);
		// Frame 0 is decoded once up front (dims + fps proxy) and reused as the
		// first encode-loop frame; consumed there or closed in the finally.
		let firstImage: VideoFrame | null = null;
		// Hoisted so the catch below can reach it — this hand-rolled pipeline
		// has no Conversion wrapper to self-cancel on failure.
		let output: Output | null = null;
		try {
			await decoder.tracks.ready;
			const track = decoder.tracks.selectedTrack;
			const frameCount = track?.frameCount ?? 1;

			firstImage = (await decoder.decode({ frameIndex: 0 })).image;
			// Same even()+contain math the video convert path uses (encoders
			// reject odd dimensions).
			const { width, height } = fitDimensions(
				firstImage.displayWidth,
				firstImage.displayHeight,
				maxDimension
			);

			// GIF delays: browsers bump ≤10 ms to 100 ms for display — match that,
			// so the video plays like the GIF looked.
			const frameDurSec = (durationUs: number | null): number =>
				frameDelayMs(durationUs, true) / 1000;

			// Bitrate from a rough effective fps (first frame's duration as proxy).
			const fps = Math.min(30, Math.round(1 / frameDurSec(firstImage.duration)) || 10);
			const bitrate = qualityToBitrate(quality, width, height, fps, codec);

			const target = new BufferTarget();
			output = new Output({
				format: VIDEO_OUTPUT[container].format(),
				target
			});
			const canvas = new OffscreenCanvas(width, height);
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');
			const source = new CanvasSource(canvas, { codec, bitrate });
			output.addVideoTrack(source);
			await output.start();

			let t = 0;
			for (let i = 0; i < frameCount; i++) {
				job.throwIfCancelled();
				const image =
					i === 0 && firstImage ? firstImage : (await decoder.decode({ frameIndex: i })).image;
				try {
					const durSec = frameDurSec(image.duration);
					ctx.clearRect(0, 0, width, height);
					ctx.drawImage(image, 0, 0, width, height);
					await source.add(t, durSec);
					t += durSec;
				} finally {
					image.close();
					if (i === 0) firstImage = null;
				}
				progress({ frame: i + 1, frameCount });
			}
			await output.finalize();

			const out = target.buffer;
			if (!out || out.byteLength === 0) throw new Error('Video conversion produced no output');
			return {
				result: { bytes: out, mimeType: VIDEO_OUTPUT[container].mime },
				transfer: [out]
			};
		} catch (error) {
			// A mid-loop cancel/decode failure leaves the CanvasSource's
			// VideoEncoder open inside this pooled worker until GC — cancel()
			// force-closes encoder + target (what Conversion does internally on
			// its own failures). Throws if already finalized; nothing left then.
			try {
				await output?.cancel();
			} catch {
				// best-effort cleanup — the original error is what matters
			}
			throw error;
		} finally {
			firstImage?.close(); // error before the loop consumed it (close is idempotent)
			decoder.close();
			job.finish();
		}
	},

	probeAudio: async ({ file }) => {
		const input = openInput(file);
		const audio = await input.getPrimaryAudioTrack();
		if (!audio) throw new Error('No audio track found in this file');
		const codec = await audio.getCodec().catch(() => null);
		if (!(await audio.canDecode().catch(() => false))) {
			throw new Error(
				`This browser can’t decode ${codec ? codec.toUpperCase() : 'this'} audio — try Chrome`
			);
		}
		const durationSec = await input.computeDuration();
		const stats = await audio.computePacketStats(200).catch(() => null);
		const video = await input.getPrimaryVideoTrack();
		return {
			result: {
				durationSec,
				audioCodec: codec,
				audioBitrate: stats && stats.averageBitrate > 0 ? stats.averageBitrate : null,
				hasVideo: !!video
			}
		};
	},

	convertAudio: async ({ jobId, file, output, bitrate }, progress) => {
		// Registered BEFORE the encoder fetch + Conversion.init — same lost-cancel
		// window as `convert` (the MP3/FLAC/AAC wasm fetch can take seconds).
		const job = jobs.register(jobId);
		try {
			if (output === 'mp3') await ensureMp3Encoder();
			else if (output === 'flac') await ensureFlacEncoder();
			else if (output === 'm4a') await ensureAacEncoder();
			const spec = AUDIO_OUTPUT[output];
			if (!(await canEncodeAudio(spec.codec))) {
				throw new Error(
					`This browser can’t encode ${output.toUpperCase()} audio — try WAV instead`
				);
			}
			job.throwIfCancelled();

			const input = openInput(file);
			const target = new BufferTarget();
			const out = new Output({ format: spec.format(), target });
			// `bitrate` reaches AudioEncoder.configure() verbatim, but WebCodecs
			// defaults to bitrateMode 'variable' and mediabunny's Conversion API
			// (≤1.50.8) has no way to request 'constant'. Measured 2026-07-11 on
			// real music: AAC lands at 91-99% of the request (96→95.4, 192→174,
			// 256→239 kbps) — the pills are honest; only trivial content (pure
			// tones, silence) undershoots hard, which is VBR doing its job.
			// AU-15 guards this with a white-noise fixture.
			const conversion = await Conversion.init({
				input,
				output: out,
				video: { discard: true }, // audio-only by contract
				audio: {
					codec: spec.codec,
					...(isLosslessAudioFormat(output) ? {} : { bitrate })
				},
				showWarnings: false
			});
			job.adopt(conversion);
			job.throwIfCancelled();

			const audioDropped = conversion.discardedTracks.find((d) => d.track.isAudioTrack());
			if (audioDropped) {
				throw new Error(
					audioDropped.reason === 'undecodable_source_codec' ||
						audioDropped.reason === 'unknown_source_codec'
						? 'This browser can’t decode the source audio — try Chrome'
						: `This file can’t be converted (${audioDropped.reason})`
				);
			}
			if (!conversion.isValid) {
				const reasons = conversion.discardedTracks.map((d) => d.reason).join(', ');
				throw new Error(`This file can’t be converted (${reasons || 'no usable tracks'})`);
			}

			conversion.onProgress = (fraction) => progress({ fraction });
			await conversion.execute();

			const bytes = target.buffer;
			if (!bytes || bytes.byteLength === 0) throw new Error('Audio conversion produced no output');
			return { result: { bytes, mimeType: spec.mime }, transfer: [bytes] };
		} finally {
			job.finish();
		}
	},

	cancel: async ({ jobId }) => {
		// Missing id = the job already finished; nothing to do (see job-registry).
		await jobs.cancel(jobId);
		return { result: null };
	}
});
