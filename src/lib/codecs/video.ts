import type { VideoConversionSettings } from '$lib/types';
import type { VideoConvertPayload, VideoProbeResult } from '$lib/workers/protocol';
import { callWorker } from '$lib/workers/rpc';
import { runCancellableVideoJob } from './graceful-cancel';
import { targetNotReachableWarning } from './target-search';
import {
	capBySourceBitrate,
	capFrameRate,
	cappedTargetBitrate,
	fitDimensions,
	formatTime,
	qualityToBitrate,
	retryBitrate
} from './video-math';

export interface VideoProgress {
	fraction: number;
	detail: string | null;
}

export interface VideoResult {
	blob: Blob;
	warning: string | null;
	container: 'mp4' | 'webm' | 'mov' | 'gif';
	/** Source container differs from the target (mkv/unknown always count). */
	formatChanged: boolean;
	/** Resize, fps cap or audio removal — disqualifies the keep-original guard. */
	transformed: boolean;
}

type AudioPlan = VideoConvertPayload['audio'];

const AUDIO_BITRATE = 128_000;

/**
 * Container legality first, speed second: copy (lossless transmux) whenever
 * the source codec may live in the target container, transcode when it can't,
 * drop with an explanation when the browser can't even transcode.
 */
function decideAudio(
	probe: VideoProbeResult,
	settings: VideoConversionSettings,
	warnings: (string | null)[]
): AudioPlan {
	if (!probe.audioCodec || settings.removeAudio) return { kind: 'discard' };
	const source = probe.audioCodec;

	if (settings.container === 'mp4' || settings.container === 'mov') {
		const target = settings.container.toUpperCase();
		// AAC/MP3 are already legal and Apple-friendly → transmux untouched.
		if (source === 'aac' || source === 'mp3') return { kind: 'copy' };
		// Everything else (Opus, Vorbis, PCM…) is re-encoded to AAC: Opus in
		// ISOBMFF is spec-legal but silent in Safari/QuickTime, and the rest
		// aren't legal here at all. The CONVERT step is authoritative for "can
		// this browser really produce AAC" (it re-registers the wasm encoder and
		// verifies), so we no longer gate on the probe's unreliable aacEncodable —
		// only on whether we can READ the source track.
		if (probe.audioDecodable) {
			return { kind: 'encode', codec: 'aac', bitrate: AUDIO_BITRATE };
		}
		warnings.push(
			`Audio removed — this browser can’t read the ${source.toUpperCase()} audio track for ${target}. Choose WebM to keep it.`
		);
		return { kind: 'discard' };
	}
	// WebM allows only Opus/Vorbis.
	if (source === 'opus' || source === 'vorbis') return { kind: 'copy' };
	if (!probe.audioDecodable) {
		warnings.push(
			`Audio removed — this browser can’t read the ${source.toUpperCase()} audio track`
		);
		return { kind: 'discard' };
	}
	return { kind: 'encode', codec: 'opus', bitrate: AUDIO_BITRATE };
}

/** 'mp4' | 'webm' | 'mov' | null (mkv/unknown — always a container change). */
function sniffContainer(file: File): 'mp4' | 'webm' | 'mov' | null {
	const name = file.name.toLowerCase();
	if (file.type === 'video/mp4' || name.endsWith('.mp4') || name.endsWith('.m4v')) return 'mp4';
	if (file.type === 'video/webm' || name.endsWith('.webm')) return 'webm';
	if (file.type === 'video/quicktime' || name.endsWith('.mov')) return 'mov';
	return null;
}

export async function convertVideo(
	file: File,
	settings: VideoConversionSettings,
	onProgress?: (p: VideoProgress) => void,
	signal?: AbortSignal
): Promise<VideoResult> {
	// Animated GIF input: mediabunny can't demux GIF — the WebCodecs path
	// (ImageDecoder → CanvasSource) turns it into a silent video instead.
	const head = new Uint8Array(await file.slice(0, 6).arrayBuffer());
	const gifInput = head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38; // 'GIF8'
	if (gifInput) {
		if (settings.container === 'gif') {
			throw new Error('This file is already a GIF — choose MP4, WebM or MOV output');
		}
		return convertGifToVideo(file, settings.container, settings, onProgress, signal);
	}
	if (settings.container === 'gif') {
		return convertVideoToGif(file, settings, onProgress, signal);
	}

	// Past the GIF branches the container is a real video one — capture the
	// narrowing in a const (calls below would otherwise reset TS's analysis).
	const container = settings.container;

	// The probe checks encodability at the OUTPUT dimensions — an 8K source the
	// encoder rejects at native size may be fine at the requested downscale.
	const probe = await callWorker('video', 'probe', {
		file,
		maxDimension: settings.maxDimension
	});
	signal?.throwIfAborted();

	const codec = probe.encodable[container];
	if (!codec) {
		throw new Error(
			`This browser can’t encode ${container.toUpperCase()} video — try another output format` +
				(settings.maxDimension ? '' : ', or set a Max dimension to downscale first')
		);
	}

	const warnings: (string | null)[] = [];
	if (probe.likelyHdr) {
		warnings.push('HDR video — colors may shift a little when converted to SDR');
	}

	const dims = fitDimensions(probe.width, probe.height, settings.maxDimension);
	const frameRate = capFrameRate(probe.frameRate, settings.fps);
	const effectiveFps = frameRate ?? probe.frameRate ?? 30;
	const audio = decideAudio(probe, settings, warnings);
	const audioBps =
		audio.kind === 'discard'
			? 0
			: audio.kind === 'encode'
				? audio.bitrate
				: (probe.audioBitrate ?? AUDIO_BITRATE);

	const targetBytes = Math.max(1, Math.round(settings.targetMb * 1_000_000));
	// A downscale shrinks the information the source carries with it.
	const scaledSourceBps =
		probe.videoBitrate === null
			? null
			: Math.round(
					probe.videoBitrate * ((dims.width * dims.height) / (probe.width * probe.height))
				);
	let bitrate =
		settings.mode === 'target'
			? cappedTargetBitrate(
					targetBytes,
					probe.durationSec,
					audioBps,
					scaledSourceBps,
					probe.videoCodec,
					codec
				)
			: capBySourceBitrate(
					qualityToBitrate(settings.quality, dims.width, dims.height, effectiveFps, codec),
					settings.quality,
					scaledSourceBps,
					probe.videoCodec,
					codec
				);

	const attemptMax = settings.mode === 'target' ? 2 : 1;
	// Motion-JPEG can't go through mediabunny's Conversion (it can't decode the
	// 'jpeg' track); the worker re-encodes it from raw JPEG frames instead.
	const convertAction = probe.mjpeg ? 'convertMjpeg' : 'convert';
	return runCancellableVideoJob(signal, async (jobId) => {
		const run = (attempt: number) =>
			callWorker(
				'video',
				convertAction,
				{
					jobId,
					file,
					container,
					video: {
						codec,
						bitrate,
						...(dims.changed ? { width: dims.width, height: dims.height } : {}),
						...(frameRate ? { frameRate } : {})
					},
					audio
				},
				[],
				(p) =>
					onProgress?.({
						fraction: Math.min((attempt - 1 + p.fraction) / attemptMax, 0.99),
						detail: `${attemptMax > 1 ? `pass ${attempt}/${attemptMax} — ` : ''}${formatTime(
							p.fraction * probe.durationSec
						)} / ${formatTime(probe.durationSec)}`
					})
			);

		let out = await run(1);
		if (settings.mode === 'target' && out.bytes.byteLength > targetBytes) {
			// Single corrective pass, mirroring the PDF ladder's abort semantics.
			signal?.throwIfAborted();
			bitrate = retryBitrate(bitrate, out.bytes.byteLength, targetBytes);
			out = await run(2);
			if (out.bytes.byteLength > targetBytes) {
				warnings.push(targetNotReachableWarning(targetBytes, out.bytes.byteLength));
			}
		}

		return {
			blob: new Blob([out.bytes], { type: out.mimeType }),
			warning: warnings.filter(Boolean).join(' — ') || null,
			container,
			formatChanged: sniffContainer(file) !== container,
			// The keep-original guard (compress.ts) reverts to the source bytes when
			// the output isn't smaller and nothing was "transformed". Re-encoding the
			// audio to a container-legal codec (Opus→AAC for MP4/MOV) IS such a
			// transform: the source codec is mute in the target (Opus in an MP4 plays
			// silent in Safari/QuickTime), so keeping the smaller original would ship a
			// broken file. removeAudio likewise only matters when there IS an audio track.
			transformed:
				dims.changed ||
				frameRate !== undefined ||
				audio.kind === 'encode' ||
				(settings.removeAudio && probe.audioCodec !== null)
		};
	});
}

/** GIF frames sampled per second — capped hard: high-fps GIFs balloon fast. */
const GIF_MAX_FPS = 15;
const GIF_DEFAULT_FPS = 12;
/** Soft size guard: past this many frames the GIF gets a heads-up warning. */
const GIF_FRAME_WARNING = 900;

async function convertVideoToGif(
	file: File,
	settings: VideoConversionSettings,
	onProgress?: (p: VideoProgress) => void,
	signal?: AbortSignal
): Promise<VideoResult> {
	const probe = await callWorker('video', 'probe', { file });
	signal?.throwIfAborted();

	const fps = settings.fps === 'original' ? GIF_DEFAULT_FPS : Math.min(settings.fps, GIF_MAX_FPS);
	const warnings: (string | null)[] = [];
	if (Math.ceil(probe.durationSec * fps) > GIF_FRAME_WARNING) {
		warnings.push(
			'Long video — the GIF will be large; consider a lower frame rate or a shorter clip'
		);
	}

	return runCancellableVideoJob(signal, async (jobId) => {
		const out = await callWorker(
			'video',
			'toGif',
			{ jobId, file, fps, maxDimension: settings.maxDimension, quality: settings.quality },
			[],
			(p) =>
				onProgress?.({
					fraction: Math.min(p.frame / p.frameCount, 0.99),
					detail: `frame ${p.frame}/${p.frameCount}`
				})
		);
		return {
			blob: new Blob([out.bytes], { type: 'image/gif' }),
			warning: warnings.filter(Boolean).join(' — ') || null,
			container: 'gif',
			formatChanged: true,
			transformed: true
		};
	});
}

async function convertGifToVideo(
	file: File,
	container: 'mp4' | 'webm' | 'mov',
	settings: VideoConversionSettings,
	onProgress?: (p: VideoProgress) => void,
	signal?: AbortSignal
): Promise<VideoResult> {
	const bytes = await file.arrayBuffer();
	signal?.throwIfAborted();

	return runCancellableVideoJob(signal, async (jobId) => {
		const out = await callWorker(
			'video',
			'fromGif',
			{
				jobId,
				bytes,
				container,
				quality: settings.quality,
				maxDimension: settings.maxDimension
			},
			[bytes],
			(p) =>
				onProgress?.({
					fraction: Math.min(p.frame / p.frameCount, 0.99),
					detail: `frame ${p.frame}/${p.frameCount}`
				})
		);
		return {
			blob: new Blob([out.bytes], { type: out.mimeType }),
			warning: null,
			container,
			formatChanged: true, // gif → video is always a conversion
			transformed: true
		};
	});
}
