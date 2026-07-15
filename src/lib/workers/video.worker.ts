import type { WorkerContracts, VideoProbeResult } from './protocol';
import { expose } from './host';
import {
	containScale,
	fitDimensions,
	frameDelayMs,
	qualityToBitrate
} from '$lib/codecs/video-math';
import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	CanvasSink,
	CanvasSource,
	Conversion,
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
	type OutputFormat
} from 'mediabunny';
import { isLosslessAudioFormat, type AudioConversionSettings } from '$lib/types';

function openInput(file: File) {
	return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

/** Jobs in flight, so `cancel` can reach them by id (Conversion or GIF loop). */
const active = new Map<number, { cancel(): void | Promise<void> }>();

class JobCancelledError extends Error {
	constructor() {
		super('Cancelled');
		this.name = 'JobCancelledError';
	}
}

function undecodableMessage(codec: string | null): string {
	const name = codec ? codec.toUpperCase() : 'this';
	return (
		`This browser can’t decode ${name} video — try Chrome, ` +
		'or convert on the device that recorded it'
	);
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
		// useless generic error.
		if (!(await video.canDecode().catch(() => false))) {
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
		const [mp4Codec, webmCodec, aacOk] = await Promise.all([
			getFirstEncodableVideoCodec(['avc', 'hevc'], probeDims),
			getFirstEncodableVideoCodec(['vp9', 'vp8'], probeDims),
			// Register the wasm fallback before asking (no-op when AAC encodes
			// natively) — otherwise Firefox reports false here, decideAudio drops
			// the track, and the answer flips once an audio-tab M4A job happens
			// to have registered the encoder. Gated on an audio track existing,
			// so the ~1 MB encoder chunk is only fetched when the answer matters.
			audio
				? ensureAacEncoder().then(
						() => canEncodeAudio('aac'),
						() => false
					)
				: false
		]);
		const isobmffCodec = mp4Codec === 'avc' || mp4Codec === 'hevc' ? mp4Codec : null;

		const result: VideoProbeResult = {
			durationSec,
			width,
			height,
			frameRate: stats.averagePacketRate > 0 ? stats.averagePacketRate : null,
			videoCodec,
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
			aacEncodable: aacOk,
			audioDecodable
		};
		return { result };
	},

	convert: async ({ jobId, file, container, video, audio }, progress) => {
		// The probe that promised aacEncodable may have run on a different
		// pooled instance — registration is per-worker, so re-ensure it here.
		if (audio.kind === 'encode' && audio.codec === 'aac') await ensureAacEncoder();
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
		if (!conversion.isValid) {
			const reasons = conversion.discardedTracks.map((d) => d.reason).join(', ');
			throw new Error(
				`This file can’t be converted in this browser (${reasons || 'no usable tracks'})`
			);
		}

		conversion.onProgress = (fraction) => progress({ fraction });
		active.set(jobId, conversion);
		try {
			await conversion.execute();
		} finally {
			active.delete(jobId);
		}

		const bytes = target.buffer;
		if (!bytes || bytes.byteLength === 0) throw new Error('Video conversion produced no output');
		return {
			result: { bytes, mimeType: VIDEO_OUTPUT[container].mime },
			transfer: [bytes]
		};
	},

	toGif: async ({ jobId, file, fps, maxDimension, quality }, progress) => {
		const input = openInput(file);
		const video = await input.getPrimaryVideoTrack();
		if (!video) throw new Error('No video track found in this file');
		if (!(await video.canDecode().catch(() => false))) {
			throw new Error(undecodableMessage(await video.getCodec().catch(() => null)));
		}

		const [duration, dw, dh] = await Promise.all([
			input.computeDuration(),
			video.getDisplayWidth(),
			video.getDisplayHeight()
		]);
		const scale = containScale(dw, dh, maxDimension);
		const width = Math.max(1, Math.round(dw * scale));
		const height = Math.max(1, Math.round(dh * scale));

		const timestamps: number[] = [];
		for (let t = 0; t < duration; t += 1 / fps) timestamps.push(t);

		const flag = { cancelled: false };
		active.set(jobId, {
			cancel: () => {
				flag.cancelled = true;
			}
		});
		try {
			// CanvasSink scales for us; frames are copied onto our own canvas so
			// getImageData never depends on the sink's internal context type.
			const sink = new CanvasSink(video, { width, height, fit: 'fill' });
			const canvas = new OffscreenCanvas(width, height);
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');

			const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
			const gif = GIFEncoder();
			const maxColors = Math.max(2, Math.round((quality / 100) * 256));
			const delayMs = Math.round(1000 / fps);

			let frame = 0;
			for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
				if (flag.cancelled) throw new JobCancelledError();
				frame++;
				if (!wrapped) continue;
				ctx.drawImage(wrapped.canvas, 0, 0);
				const imageData = ctx.getImageData(0, 0, width, height);
				const rgba = new Uint8Array(
					imageData.data.buffer,
					imageData.data.byteOffset,
					imageData.data.byteLength
				);
				const palette = quantize(rgba, maxColors);
				const index = applyPalette(rgba, palette);
				gif.writeFrame(index, width, height, { palette, delay: delayMs });
				progress({ frame, frameCount: timestamps.length });
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
			active.delete(jobId);
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
		const flag = { cancelled: false };
		// Frame 0 is decoded once up front (dims + fps proxy) and reused as the
		// first encode-loop frame; consumed there or closed in the finally.
		let firstImage: VideoFrame | null = null;
		// Hoisted so the catch below can reach it — this hand-rolled pipeline
		// has no Conversion wrapper to self-cancel on failure.
		let output: Output | null = null;
		active.set(jobId, {
			cancel: () => {
				flag.cancelled = true;
			}
		});
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
				if (flag.cancelled) throw new JobCancelledError();
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
			active.delete(jobId);
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
		if (output === 'mp3') await ensureMp3Encoder();
		else if (output === 'flac') await ensureFlacEncoder();
		else if (output === 'm4a') await ensureAacEncoder();
		const spec = AUDIO_OUTPUT[output];
		if (!(await canEncodeAudio(spec.codec))) {
			throw new Error(`This browser can’t encode ${output.toUpperCase()} audio — try WAV instead`);
		}

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
		active.set(jobId, conversion);
		try {
			await conversion.execute();
		} finally {
			active.delete(jobId);
		}

		const bytes = target.buffer;
		if (!bytes || bytes.byteLength === 0) throw new Error('Audio conversion produced no output');
		return { result: { bytes, mimeType: spec.mime }, transfer: [bytes] };
	},

	cancel: async ({ jobId }) => {
		// Missing id = the conversion already finished; nothing to do.
		await active.get(jobId)?.cancel();
		return { result: null };
	}
});
