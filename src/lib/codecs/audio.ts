import { isLosslessAudioFormat, type AudioConversionSettings } from '$lib/types';
import { callWorker } from '$lib/workers/rpc';
import { runCancellableVideoJob } from './graceful-cancel';
import { targetNotReachableWarning } from './target-search';
import { audioTargetBitrate } from './video-math';

export interface AudioProgress {
	fraction: number;
	detail: string | null;
}

export interface AudioResult {
	blob: Blob;
	warning: string | null;
	/** Warning describes the SETTINGS, not the discarded encode — it must
	 *  survive a keep-original revert ("target doesn't apply to WAV", AU-14). */
	stickyWarning?: boolean;
	outputFormat: AudioConversionSettings['outputFormat'];
	/** Extension/mime differs from the source — disables the keep-original guard. */
	formatChanged: boolean;
}

const EXT: Record<AudioConversionSettings['outputFormat'], string[]> = {
	mp3: ['.mp3'],
	// .aac is deliberately NOT grouped here: a .aac file is a raw ADTS stream,
	// and M4A output rewraps it in ISOBMFF — a real container change. Grouping
	// them let the keep-original guard ship the raw ADTS bytes back whenever
	// the re-encode came out bigger, silently skipping the requested wrap.
	m4a: ['.m4a'],
	wav: ['.wav'],
	// .opus is its own output now — an .opus file sent to OGG re-encodes and
	// renames to .ogg instead of tripping the keep-original guard.
	ogg: ['.ogg', '.oga'],
	flac: ['.flac'],
	opus: ['.opus'],
	weba: ['.weba']
};

/** Extension/container crossing check behind AudioResult.formatChanged —
 *  formatChanged follows the CONTAINER, not the codec (ebook-family rule). */
export function audioFormatChanged(
	fileName: string,
	outputFormat: AudioConversionSettings['outputFormat']
): boolean {
	const name = fileName.toLowerCase();
	return !EXT[outputFormat].some((ext) => name.endsWith(ext));
}

export async function convertAudio(
	file: File,
	settings: AudioConversionSettings,
	onProgress?: (p: AudioProgress) => void,
	signal?: AbortSignal
): Promise<AudioResult> {
	const probe = await callWorker('video', 'probeAudio', { file });
	signal?.throwIfAborted();

	const targetBytes = Math.max(1, Math.round(settings.targetMb * 1_000_000));
	const lossless = isLosslessAudioFormat(settings.outputFormat);
	const useTarget = settings.mode === 'target' && !lossless;
	const bitrate = useTarget
		? audioTargetBitrate(targetBytes, probe.durationSec)
		: settings.bitrateKbps * 1000;

	return runCancellableVideoJob(signal, async (jobId) => {
		const out = await callWorker(
			'video',
			'convertAudio',
			{ jobId, file, output: settings.outputFormat, bitrate },
			[],
			(p) => onProgress?.({ fraction: Math.min(p.fraction, 0.99), detail: null })
		);

		const blob = new Blob([out.bytes], { type: out.mimeType });
		// Lossless outputs have no bitrate to steer, so target mode is ignored
		// for them (useTarget above). When that overshoots, say so instead of
		// shipping a silently oversized "target" result (persisted target mode).
		const losslessTargetIgnored = settings.mode === 'target' && lossless;
		const targetIgnoredMsg =
			losslessTargetIgnored && blob.size > targetBytes
				? settings.outputFormat === 'wav'
					? 'WAV is uncompressed — the target size doesn’t apply to WAV output'
					: 'FLAC is lossless — the target size doesn’t apply to FLAC output'
				: null;
		const warning =
			useTarget && blob.size > targetBytes
				? targetNotReachableWarning(targetBytes, blob.size)
				: targetIgnoredMsg;
		return {
			blob,
			warning,
			// "Target doesn't apply" stays TRUE when keep-original reverts to the
			// source bytes — the guard must not swallow it (AU-14 regression).
			stickyWarning: warning !== null && warning === targetIgnoredMsg,
			outputFormat: settings.outputFormat,
			formatChanged: audioFormatChanged(file.name, settings.outputFormat)
		};
	});
}
