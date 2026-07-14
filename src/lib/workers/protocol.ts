import type {
	ArchiveOutputFormat,
	AudioConversionSettings,
	FontFormat,
	ImageFormat,
	SvgCompressionSettings
} from '$lib/types';

export interface WorkerRequest {
	id: number;
	action: string;
	payload: unknown;
}

export type WorkerResponse =
	| { id: number; ok: true; result: unknown }
	| { id: number; ok: false; error: string }
	| { id: number; progress: unknown };

// --- Per-worker RPC contracts (single source of truth for both ends) ---

export interface EncodePayload {
	bytes: ArrayBuffer;
	quality: number;
	/** 'auto' = worker races mozjpeg vs webp post-decode (alpha/animation-aware);
	 *  'ico' = multi-size favicon mux. */
	output: ImageFormat | 'auto' | 'ico';
	maxDimension: number | null;
	/** Explicit decode override for formats createImageBitmap can't sniff. */
	source?: 'heic';
	/** Composite transparency onto white (mozjpeg would otherwise render it black). */
	flatten?: boolean;
}

export interface EncodeResult {
	bytes: ArrayBuffer;
	resized: boolean;
	/** Output dimensions — the downscale-to-target search scales from these. */
	width: number;
	height: number;
	/** The concrete format actually encoded ('auto' resolves in the worker). */
	chosenFormat: ImageFormat | 'ico';
	/** True when the output is an animated WebP. */
	animated?: boolean;
	frameCount?: number;
	/** The 16383 px WebP hard limit (not the user's maxDimension) forced a shrink. */
	dimensionCapped?: boolean;
}

/** Animated-encode frame progress. */
export interface EncodeProgress {
	frame: number;
	frameCount: number;
}

export interface GsPayload {
	pdf: ArrayBuffer;
	args: string[];
}

export interface GsProgress {
	page: number;
	pageCount: number | null;
}

export interface SvgPayload {
	svg: string;
	settings: SvgCompressionSettings;
}

// --- Video (mediabunny + WebCodecs) ---

export interface VideoProbeResult {
	durationSec: number;
	/** Display dimensions (rotation/pixel-aspect applied). */
	width: number;
	height: number;
	frameRate: number | null;
	videoCodec: string | null;
	codecString: string | null;
	/** Average video-track bitrate (bps) — the ceiling re-encodes should respect. */
	videoBitrate: number | null;
	audioCodec: string | null;
	audioBitrate: number | null;
	rotation: 0 | 90 | 180 | 270;
	/** BT.2020 / PQ / HLG source — SDR output will shift colors. */
	likelyHdr: boolean;
	/** First encodable codec per target container in THIS browser, checked at
	 *  the requested OUTPUT dimensions (post-downscale), null = none. */
	encodable: {
		mp4: 'avc' | 'hevc' | null;
		mov: 'avc' | 'hevc' | null;
		webm: 'vp9' | 'vp8' | null;
	};
	aacEncodable: boolean;
	/** Whether THIS browser can decode the source audio (false when no audio). */
	audioDecodable: boolean;
}

export interface VideoConvertPayload {
	/** Identifies the running conversion so `cancel` can target it. */
	jobId: number;
	/** File clones without copying its data; mediabunny streams from it lazily. */
	file: File;
	container: 'mp4' | 'webm' | 'mov';
	video: {
		codec: 'avc' | 'hevc' | 'vp9' | 'vp8';
		bitrate: number;
		width?: number;
		height?: number;
		frameRate?: number;
	};
	audio:
		| { kind: 'copy' }
		| { kind: 'discard' }
		| { kind: 'encode'; codec: 'aac' | 'opus'; bitrate: number };
}

export interface VideoConvertResult {
	bytes: ArrayBuffer;
	mimeType: string;
}

export interface VideoConvertProgress {
	/** 0..1 within this conversion pass. */
	fraction: number;
}

export interface VideoToGifPayload {
	jobId: number;
	file: File;
	/** Frames sampled per second of source video. */
	fps: number;
	maxDimension: number | null;
	/** 1-100 → GIF palette size (like the static image gif path). */
	quality: number;
}

export interface GifToVideoPayload {
	jobId: number;
	bytes: ArrayBuffer;
	container: 'mp4' | 'webm' | 'mov';
	quality: number;
	maxDimension: number | null;
}

/** Frame-by-frame progress for the GIF paths. */
export interface FrameProgress {
	frame: number;
	frameCount: number;
}

// --- Audio (same worker as video — both ride mediabunny) ---

export interface AudioProbeResult {
	durationSec: number;
	audioCodec: string | null;
	/** Average audio-track bitrate (bps), null when unknown. */
	audioBitrate: number | null;
	/** True when the source also carries video (it gets discarded). */
	hasVideo: boolean;
}

export interface AudioConvertPayload {
	jobId: number;
	file: File;
	output: AudioConversionSettings['outputFormat'];
	/** bps for lossy outputs — lossless ones (WAV/FLAC) ignore it. */
	bitrate: number;
}

// --- Font (raw sfnt repackaging; WOFF2 via the Google codec wasm) ---

export interface FontConvertPayload {
	bytes: ArrayBuffer;
	to: FontFormat;
}

export interface FontConvertResult {
	bytes: ArrayBuffer;
	/** Container actually written — a 'ttf'/'otf' request follows the sfnt
	 *  flavor instead of converting outlines (the flavor rule). */
	outputFormat: FontFormat;
	/** Sniffed source container (extensions/MIMEs lie). */
	sourceFormat: FontFormat;
	/** Neutral per-file note (flavor rule, DSIG drop) — not a warning. */
	note: string | null;
}

export interface FontSubsetPayload {
	bytes: ArrayBuffer;
	to: FontFormat;
	/** Sorted unique codepoints to keep; null = keep every glyph. */
	codepoints: Uint32Array | null;
	keepHinting: boolean;
	/** tag → user-coords pin. Non-null asks for a static instance (unlisted
	 *  axes pin to their defaults); tags absent from the font are ignored. */
	pinAxes: Record<string, number> | null;
}

export interface FontSubsetResult extends FontConvertResult {
	glyphsBefore: number | null;
	glyphsAfter: number | null;
	/** Whether axes were actually pinned (false on non-variable fonts). */
	instanced: boolean;
}

export interface FontAxisInfo {
	tag: string;
	min: number;
	def: number;
	max: number;
	hidden: boolean;
}

export interface FontProbeResult {
	container: FontFormat;
	/** fvar axes in user coordinates; [] for static fonts. */
	axes: FontAxisInfo[];
	glyphCount: number | null;
}

// --- Archive (7-Zip 24.09 via 7z-wasm; fresh emscripten instance per job) ---

export interface ArchiveEntryOut {
	/** Path relative to the archive root — the UI flattens to basename, the
	 *  convert op preserves it so folder structure survives repacking. */
	path: string;
	bytes: ArrayBuffer;
}

export interface ArchiveCreatePayload {
	files: { name: string; bytes: ArrayBuffer }[];
	output: ArchiveOutputFormat;
	level: 0 | 1 | 6 | 9;
	/** '' = unencrypted. Only zip/7z can honor it. */
	password: string;
	/** 7z only: -mhe=on (hide the file list too). Needs a password. */
	encryptNames: boolean;
	/** Output stem — 'archive' for bundles, the source filename for streams
	 *  (gz/bz2/xz APPEND their extension: "report.pdf" → "report.pdf.gz"). */
	baseName: string;
}

export interface ArchiveCreateResult {
	bytes: ArrayBuffer;
	name: string;
	mimeType: string;
}

export interface ArchiveExtractPayload {
	bytes: ArrayBuffer;
	name: string;
	password: string;
}

export interface ArchiveExtractResult {
	entries: ArchiveEntryOut[];
	/** Chaining commentary (e.g. deb control files skipped) — info, not a warning. */
	note: string | null;
}

export interface ArchiveConvertPayload {
	bytes: ArrayBuffer;
	name: string;
	/** Password of the SOURCE archive — the repacked output is never encrypted. */
	password: string;
	/** Streams can't hold several entries, so convert targets bundles only. */
	output: Exclude<ArchiveOutputFormat, 'gz' | 'bz2' | 'xz'>;
	level: 0 | 1 | 6 | 9;
}

export interface ArchiveConvertResult {
	bytes: ArrayBuffer;
	name: string;
	mimeType: string;
	entryCount: number;
}

export interface ArchiveProbeResult {
	/** Container type 7zz reports ("7z", "Rar5", "Iso", …), null when unknown. */
	format: string | null;
	encrypted: boolean;
	entryCount: number | null;
}

export interface ArchiveProgress {
	/** 0..1 when the entry count is known, null = indeterminate pulse. */
	fraction: number | null;
	detail: string | null;
}

/**
 * Action → payload/result/progress map per worker kind. `callWorker` (rpc.ts)
 * and `expose` (host.ts) are both typed against this, so a wrong action name
 * or a payload/result mismatch fails to compile on either side.
 */
export interface WorkerContracts {
	image: {
		encode: { payload: EncodePayload; result: EncodeResult; progress: EncodeProgress };
	};
	gs: {
		compress: { payload: GsPayload; result: ArrayBuffer; progress: GsProgress };
	};
	svg: {
		optimize: { payload: SvgPayload; result: string; progress: never };
	};
	font: {
		convert: { payload: FontConvertPayload; result: FontConvertResult; progress: never };
		subset: { payload: FontSubsetPayload; result: FontSubsetResult; progress: never };
		/** Upload-time metadata (variable axes for the UI, glyph count). */
		probe: { payload: { bytes: ArrayBuffer }; result: FontProbeResult; progress: never };
	};
	video: {
		/** maxDimension feeds the encodability check — see VideoProbeResult.encodable. */
		probe: {
			payload: { file: File; maxDimension?: number | null };
			result: VideoProbeResult;
			progress: never;
		};
		convert: {
			payload: VideoConvertPayload;
			result: VideoConvertResult;
			progress: VideoConvertProgress;
		};
		/** Video → animated GIF (CanvasSink sampling + gifenc). */
		toGif: { payload: VideoToGifPayload; result: { bytes: ArrayBuffer }; progress: FrameProgress };
		/** Animated GIF → silent MP4/MOV/WebM (ImageDecoder + CanvasSource). */
		fromGif: {
			payload: GifToVideoPayload;
			result: VideoConvertResult;
			progress: FrameProgress;
		};
		/** Audio-first probe (audio tab) — tolerates video-less files. */
		probeAudio: { payload: { file: File }; result: AudioProbeResult; progress: never };
		/** Audio-only conversion/extraction (video track discarded). */
		convertAudio: {
			payload: AudioConvertPayload;
			result: VideoConvertResult;
			progress: VideoConvertProgress;
		};
		/** Graceful mid-conversion cancel (mediabunny conversion.cancel()). */
		cancel: { payload: { jobId: number }; result: null; progress: never };
	};
	archive: {
		create: {
			payload: ArchiveCreatePayload;
			result: ArchiveCreateResult;
			progress: ArchiveProgress;
		};
		extract: {
			payload: ArchiveExtractPayload;
			result: ArchiveExtractResult;
			progress: ArchiveProgress;
		};
		convert: {
			payload: ArchiveConvertPayload;
			result: ArchiveConvertResult;
			progress: ArchiveProgress;
		};
		/** Upload-time metadata (encryption detection drives the password field). */
		probe: {
			payload: { bytes: ArrayBuffer; name: string };
			result: ArchiveProbeResult;
			progress: never;
		};
	};
}

export type WorkerKind = keyof WorkerContracts;
