// Per-page head/meta + intake details (title/description/tagline/og, steps,
// related, converter preset/accept) for the 'video-audio' tool group — extracted
// verbatim from the pre-split seo.ts (parity is pinned by the byte-identical
// prerender diff). This is now the authoring source for these fields; loaded
// lazily via seo-detail/index.ts, statically by seo-full.server.ts.
import type { ConverterDetail, SeoDetail } from '$lib/seo';

export const DETAILS: Record<string, SeoDetail | ConverterDetail> = {
	'compress-video': {
		ogImage: '/og/compress-video.jpg',
		title: 'Compress Video Online — Private, No Upload | Compress Pro',
		description:
			'Shrink MP4, MOV and WebM videos right in your browser. Hit a target size like 25 MB for email or Discord. No uploads — videos never leave your device.',
		tagline: 'MP4, MOV & WebM compressed on-device — nothing uploaded.',
		related: ['/compress-mp4', '/mov-to-mp4', '/webm-to-mp4', '/mp4-to-webm']
	},
	'compress-audio': {
		ogImage: '/og/compress-audio.jpg',
		title: 'Compress Audio Online — MP3, FLAC, M4A, WAV | Compress Pro',
		description:
			'Compress MP3 and convert audio between MP3, M4A, WAV, FLAC, OGG and OPUS in your browser. Extract audio from video too — private, free, never uploaded.',
		tagline: 'Shrink or convert audio locally — MP3, FLAC, OGG and more.',
		related: ['/mp4-to-mp3', '/flac-to-mp3', '/wav-to-mp3', '/compress-video']
	},
	'mov-to-mp4': {
		ogImage: '/og/mov-to-mp4.jpg',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'video/quicktime,.mov',
		dropSubject: 'MOV files',
		dropHint: 'MOV only · multiple files supported',
		title: 'MOV to MP4 Converter — iPhone Video, No Upload | Compress Pro',
		description:
			'Convert iPhone MOV videos to MP4 right in your browser — fast, audio carried over, nothing uploaded. Hit a target size in the same step. Free & private.',
		tagline: 'iPhone MOV to MP4 on your device — nothing gets uploaded.',
		related: ['/compress-mov', '/compress-mp4', '/webm-to-mp4', '/mkv-to-mp4']
	},
	'webm-to-mp4': {
		ogImage: '/og/webm-to-mp4.jpg',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'video/webm,.webm',
		dropSubject: 'WebM files',
		dropHint: 'WebM only · multiple files supported',
		title: 'WebM to MP4 Converter — Play Anywhere, Private | Compress Pro',
		description:
			'Convert WebM videos to MP4 in your browser so they play on Apple devices, TVs and editors. Audio included, batches supported, nothing uploaded. Free.',
		tagline: 'WebM to MP4 converted on your device — files never leave.',
		related: ['/compress-video', '/mov-to-mp4', '/mp4-to-webm']
	},
	'mkv-to-mp4': {
		ogImage: '/og/mkv-to-mp4.jpg',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'video/x-matroska,.mkv',
		dropSubject: 'MKV files',
		dropHint: 'MKV only · multiple files supported',
		title: 'MKV to MP4 Converter — In Your Browser, Private | Compress Pro',
		description:
			'Convert MKV videos to MP4 locally in your browser — no uploads, no installs. Works with any MKV your browser can play, batches included. Free & private.',
		tagline: 'MKV into universal MP4 — converted right in your browser.',
		related: ['/compress-video', '/mov-to-mp4', '/webm-to-mp4']
	},
	'mp4-to-webm': {
		ogImage: '/og/mp4-to-webm.jpg',
		preset: { kind: 'video', container: 'webm' },
		accept: 'video/mp4,video/x-m4v,.mp4,.m4v',
		dropSubject: 'MP4 files',
		dropHint: 'MP4 only · multiple files supported',
		title: 'MP4 to WebM Converter — Smaller Web Video | Compress Pro',
		description:
			'Convert MP4 videos to WebM right in your browser — typically smaller at the same visual quality, ideal for the web. No uploads, no accounts. Free & private.',
		tagline: 'MP4 to WebM in your browser — smaller video, same quality.',
		related: ['/compress-video', '/webm-to-mp4']
	},
	'video-to-gif': {
		ogImage: '/og/video-to-gif.jpg',
		preset: { kind: 'video', container: 'gif' },
		title: 'Video to GIF Converter — Free & Private | Compress Pro',
		description:
			'Convert MP4, WebM or MOV video to an animated GIF in your browser. Pick fps and size, files never leave your device. Free, private, no watermark.',
		tagline: 'Turn MP4 or WebM clips into GIFs — right in your browser.',
		related: ['/mp4-to-gif', '/compress-video', '/gif-to-mp4', '/compress-gif']
	},
	'mp4-to-gif': {
		ogImage: '/og/mp4-to-gif.jpg',
		preset: { kind: 'video', container: 'gif' },
		accept: 'video/mp4,video/x-m4v,.mp4,.m4v',
		dropSubject: 'MP4 files',
		dropHint: 'MP4 clips · turned into looping GIFs locally',
		title: 'MP4 to GIF Converter — No Watermark, No Upload | Compress Pro',
		description:
			'Turn MP4 clips into looping GIFs right in your browser — choose fps and size, no watermark, no length gate, nothing uploaded. Great for screen recordings.',
		tagline: 'MP4 clips become looping GIFs — made right on your device.',
		related: ['/video-to-gif', '/gif-to-mp4', '/compress-gif']
	},
	'gif-to-mp4': {
		ogImage: '/og/gif-to-mp4.jpg',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'image/gif,.gif',
		dropSubject: 'GIF files',
		dropHint: 'Animated GIFs · converted to silent MP4',
		title: 'GIF to MP4 Converter — Smaller Files, No Upload | Compress Pro',
		description:
			'Convert animated GIFs to MP4 video in your browser — typically 5–10× smaller with smoother playback. No upload, no watermark, free and unlimited.',
		tagline: 'GIFs become silent MP4 videos — smaller, smoother, local.',
		related: ['/compress-gif', '/video-to-gif', '/compress-video']
	},
	'mp4-to-mp3': {
		ogImage: '/og/mp4-to-mp3.jpg',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'video/mp4,video/quicktime,.mp4,.m4v,.mov',
		dropSubject: 'video files',
		dropHint: 'MP4/MOV video · audio extracted as MP3',
		title: 'MP4 to MP3 Converter — Extract Audio | Compress Pro',
		description:
			'Extract the audio track from MP4 or MOV video and save it as MP3 — right in your browser. No upload, no sign-up, no length limits. Free and private.',
		tagline: 'Pull audio out of any video — straight to MP3, locally.',
		related: ['/compress-audio', '/wav-to-mp3', '/m4a-to-mp3', '/compress-video']
	},
	'wav-to-mp3': {
		ogImage: '/og/wav-to-mp3.jpg',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/wav,audio/x-wav,.wav',
		dropSubject: 'WAV files',
		dropHint: 'WAV recordings · encoded to MP3 locally',
		title: 'WAV to MP3 Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WAV audio to MP3 in your browser — typically 10× smaller with no audible difference. Pick the bitrate, keep the file on your device. Free forever.',
		tagline: 'Turn huge WAV recordings into small MP3s, in your browser.',
		related: ['/compress-audio', '/mp4-to-mp3', '/m4a-to-mp3', '/mp3-to-wav']
	},
	'm4a-to-mp3': {
		ogImage: '/og/m4a-to-mp3.jpg',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/mp4,audio/x-m4a,.m4a',
		dropSubject: 'M4A files',
		dropHint: 'M4A recordings · encoded to MP3 locally',
		title: 'M4A to MP3 Converter — Voice Memos, No Upload | Compress Pro',
		description:
			'Convert M4A and AAC audio to MP3 right in your browser — voice memos, recordings and music that play anywhere. Pick a bitrate. Nothing is uploaded. Free.',
		tagline: 'Apple voice memos become MP3s — converted on your device.',
		related: ['/compress-audio', '/mp4-to-mp3', '/aac-to-mp3', '/wav-to-mp3']
	},
	'flac-to-mp3': {
		ogImage: '/og/flac-to-mp3.jpg',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/flac,audio/x-flac,.flac',
		dropSubject: 'FLAC files',
		dropHint: 'FLAC audio · encoded to MP3 locally',
		title: 'FLAC to MP3 Converter — Play It Anywhere | Compress Pro',
		description:
			'Convert FLAC to MP3 in your browser — files that play anywhere at a tenth of the size. Pick a bitrate, keep everything on your device. Free forever.',
		tagline: 'Lossless FLAC in, small MP3 out — encoded on your device.',
		related: ['/wav-to-flac', '/compress-audio', '/mp3-to-wav']
	},
	'wav-to-flac': {
		ogImage: '/og/wav-to-flac.jpg',
		preset: { kind: 'audio', output: 'flac' },
		accept: 'audio/wav,audio/x-wav,.wav',
		dropSubject: 'WAV files',
		dropHint: 'WAV masters · packed into lossless FLAC',
		title: 'WAV to FLAC — Lossless Audio Compression | Compress Pro',
		description:
			'Convert WAV to FLAC in your browser — mathematically lossless, typically half the size. No upload, no sign-up, no length limits. Free and private.',
		tagline: 'Same audio, about half the bytes — WAV to FLAC, locally.',
		related: ['/flac-to-mp3', '/wav-to-mp3', '/compress-audio']
	},
	'opus-to-mp3': {
		ogImage: '/og/opus-to-mp3.jpg',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/opus,audio/ogg,.opus',
		dropSubject: 'OPUS files',
		dropHint: 'OPUS voice notes · encoded to MP3 locally',
		title: 'OPUS to MP3 Converter — Voice Messages | Compress Pro',
		description:
			'Convert OPUS voice messages and recordings to MP3 in your browser — WhatsApp and Telegram audio that plays anywhere. No upload, free, no limits.',
		tagline: 'Turn WhatsApp voice notes into MP3s that play anywhere.',
		related: ['/ogg-to-mp3', '/m4a-to-mp3', '/compress-audio']
	},
	'ogg-to-mp3': {
		ogImage: '/og/ogg-to-mp3.jpg',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/ogg,.ogg,.oga',
		dropSubject: 'OGG files',
		dropHint: 'OGG/OGA audio · encoded to MP3 locally',
		title: 'OGG to MP3 Converter — Free, No Upload | Compress Pro',
		description:
			'Convert OGG and OGA files to MP3 right in your browser — game audio, podcasts and rips that play on any device. Free, private, no length limits.',
		tagline: 'OGG audio in, universal MP3 out — nothing ever uploaded.',
		related: ['/opus-to-mp3', '/wav-to-mp3', '/compress-audio']
	},
	'aac-to-mp3': {
		ogImage: '/og/aac-to-mp3.jpg',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/aac,.aac',
		dropSubject: 'AAC files',
		dropHint: 'AAC audio · encoded to MP3 locally',
		title: 'AAC to MP3 Converter — Free, Private | Compress Pro',
		description:
			'Convert raw AAC audio files to MP3 in your browser — recorder output and stream rips that any device accepts. No upload, no sign-up, free forever.',
		tagline: 'AAC recordings become MP3s that play absolutely anywhere.',
		related: ['/m4a-to-mp3', '/mp4-to-mp3', '/compress-audio']
	},
	'mp3-to-wav': {
		ogImage: '/og/mp3-to-wav.jpg',
		preset: { kind: 'audio', output: 'wav' },
		accept: 'audio/mpeg,audio/mp3,.mp3',
		dropSubject: 'MP3 files',
		dropHint: 'MP3 audio · decoded to WAV PCM locally',
		title: 'MP3 to WAV Converter — For Editors & DAWs | Compress Pro',
		description:
			'Convert MP3 to WAV in your browser — uncompressed PCM that samplers, DAWs and legacy tools accept without complaint. Free, private, no uploads ever.',
		tagline: 'Decode MP3s into clean WAV PCM for editors and samplers.',
		related: ['/wav-to-mp3', '/mp4-to-wav', '/compress-audio']
	},
	'mp4-to-wav': {
		ogImage: '/og/mp4-to-wav.jpg',
		preset: { kind: 'audio', output: 'wav' },
		accept: 'video/mp4,video/quicktime,.mp4,.m4v,.mov',
		dropSubject: 'video files',
		dropHint: 'MP4/MOV video · audio extracted as WAV',
		title: 'MP4 to WAV Converter — Extract PCM Audio | Compress Pro',
		description:
			'Extract the audio track from MP4 or MOV video as uncompressed WAV — in your browser, nothing uploaded. For editing, transcription and sampling. Free.',
		tagline: 'Pull the audio out of video as WAV — ready for any editor.',
		related: ['/mp4-to-mp3', '/mp3-to-wav', '/compress-audio']
	},
	'webm-to-mp3': {
		ogImage: '/og/webm-to-mp3.jpg',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/webm,video/webm,.webm',
		dropSubject: 'WebM files',
		dropHint: 'WebM video · audio extracted as MP3',
		title: 'WebM to MP3 Converter — Extract Audio | Compress Pro',
		description:
			'Extract the audio track from WebM videos and save it as MP3 — right in your browser. No upload, no sign-up, no length limits. Free and private.',
		tagline: 'Pull audio out of WebM videos — straight to MP3, locally.',
		related: ['/mp4-to-mp3', '/compress-audio', '/webm-to-mp4']
	},
	'mov-to-mp3': {
		ogImage: '/og/mov-to-mp3.jpg',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'video/quicktime,.mov',
		dropSubject: 'MOV files',
		dropHint: 'iPhone MOV video · audio extracted as MP3',
		title: 'MOV to MP3 Converter — iPhone Video Audio | Compress Pro',
		description:
			'Extract audio from iPhone MOV videos and save it as MP3 right in your browser — interviews, gigs and memos. No uploads, no length limits. Free & private.',
		tagline: 'The soundtrack of your MOV videos as MP3 — made locally.',
		related: ['/mp4-to-mp3', '/mov-to-mp4', '/compress-audio']
	},
	'mp3-to-m4a': {
		ogImage: '/og/mp3-to-m4a.jpg',
		preset: { kind: 'audio', output: 'm4a' },
		accept: 'audio/mpeg,audio/mp3,.mp3',
		dropSubject: 'MP3 files',
		dropHint: 'MP3 audio · encoded to M4A locally',
		title: 'MP3 to M4A Converter — Free, No Upload | Compress Pro',
		description:
			'Convert MP3 audio to M4A (AAC) right in your browser — the native format for Apple devices and audiobooks. Pick a bitrate, nothing uploaded. Free.',
		tagline: 'MP3 re-encoded to Apple-native M4A — on your own device.',
		related: ['/m4a-to-mp3', '/wav-to-m4a', '/compress-audio']
	},
	'wav-to-m4a': {
		ogImage: '/og/wav-to-m4a.jpg',
		preset: { kind: 'audio', output: 'm4a' },
		accept: 'audio/wav,audio/x-wav,.wav',
		dropSubject: 'WAV files',
		dropHint: 'WAV recordings · encoded to M4A locally',
		title: 'WAV to M4A Converter — Small AAC Files | Compress Pro',
		description:
			'Convert WAV recordings to M4A (AAC) in your browser — roughly a tenth of the size with no audible difference. Pick a bitrate, keep it local. Free forever.',
		tagline: 'Huge WAV masters become small M4A files — encoded locally.',
		related: ['/wav-to-mp3', '/wav-to-flac', '/compress-audio']
	},
	'mp3-to-ogg': {
		ogImage: '/og/mp3-to-ogg.jpg',
		preset: { kind: 'audio', output: 'ogg' },
		accept: 'audio/mpeg,audio/mp3,.mp3',
		dropSubject: 'MP3 files',
		dropHint: 'MP3 audio · encoded to OGG (Opus) locally',
		title: 'MP3 to OGG Converter — Free, No Upload | Compress Pro',
		description:
			'Convert MP3 audio to OGG right in your browser — modern Opus in an OGG container, ideal for games and the web. No uploads, no sign-up. Free forever.',
		tagline: 'MP3 into OGG (Opus) for games and the web — made locally.',
		related: ['/ogg-to-mp3', '/wav-to-opus', '/compress-audio']
	},
	'wav-to-opus': {
		ogImage: '/og/wav-to-opus.jpg',
		preset: { kind: 'audio', output: 'opus' },
		accept: 'audio/wav,audio/x-wav,.wav',
		dropSubject: 'WAV files',
		dropHint: 'WAV recordings · encoded to Opus locally',
		title: 'WAV to Opus Converter — Tiny Voice Audio | Compress Pro',
		description:
			'Convert WAV audio to Opus in your browser — the most efficient audio codec there is, ideal for voice and streaming. Pick a bitrate, keep it local. Free.',
		tagline: 'WAV into tiny Opus files — peak efficiency, run locally.',
		related: ['/opus-to-mp3', '/wav-to-mp3', '/compress-audio']
	},
	'compress-mp4': {
		ogImage: '/og/compress-mp4.jpg',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'video/mp4,video/x-m4v,.mp4,.m4v',
		dropSubject: 'MP4 files',
		dropHint: 'MP4 only · multiple files supported',
		title: 'Compress MP4 Video Online — Free & Private | Compress Pro',
		description:
			'Shrink MP4 videos right in your browser — set a quality or a target size like 10 MB for Discord. Nothing is uploaded, no watermark. Free & private.',
		tagline: 'Shrink MP4s on your device — under any upload size limit.',
		related: ['/compress-video', '/mov-to-mp4', '/mp4-to-webm', '/mp4-to-gif']
	},
	'compress-mov': {
		ogImage: '/og/compress-mov.jpg',
		preset: { kind: 'video', container: 'mov' },
		accept: 'video/quicktime,.mov',
		dropSubject: 'MOV files',
		dropHint: 'MOV only · multiple files supported',
		title: 'Compress MOV (QuickTime) Online — No Upload | Compress Pro',
		description:
			'Shrink MOV videos right in your browser and keep the QuickTime format — set a quality or a target size. No uploads, no watermarks. Free & private.',
		tagline: 'Shrink QuickTime MOV files on your device — still a MOV.',
		related: ['/mov-to-mp4', '/compress-mp4', '/compress-video']
	},
	// Hub page of the subtitle tab (pathFor target) — FORMATS entries carry no
	// preset by design (tab clicks land here and must not stomp settings); the
	// tab default (to: 'vtt') matches the page's promise.
	'srt-to-vtt': {
		ogImage: '/og/srt-to-vtt.jpg',
		dropSubject: 'SRT files',
		dropHint: 'SRT/VTT/ASS · converted locally',
		title: 'SRT to VTT Converter — Free, Private, No Upload | Compress Pro',
		description:
			'Convert SRT subtitles to WebVTT for HTML5 video right in your browser — instant, private, nothing uploaded. ASS files convert too. Free, no accounts.',
		tagline: 'Subtitles converted on your device — instant & private.',
		related: ['/vtt-to-srt', '/ass-to-srt', '/compress-video']
	},
	'vtt-to-srt': {
		ogImage: '/og/vtt-to-srt.jpg',
		preset: { kind: 'subtitle', to: 'srt' },
		accept: 'text/vtt,.vtt',
		dropSubject: 'VTT files',
		dropHint: 'VTT only · converted locally',
		title: 'VTT to SRT Converter — Free, Private, No Upload | Compress Pro',
		description:
			'Convert WebVTT captions to SRT right in your browser — the format every player and TV accepts. Instant and private, nothing is uploaded. Free, no limits.',
		tagline: 'Web captions turned into classic SRT — right on-device.',
		related: ['/srt-to-vtt', '/ass-to-srt', '/compress-video']
	},
	'ass-to-srt': {
		ogImage: '/og/ass-to-srt.jpg',
		preset: { kind: 'subtitle', to: 'srt' },
		accept: '.ass,.ssa',
		dropSubject: 'ASS files',
		dropHint: 'ASS/SSA · styling stripped, timing kept',
		title: 'ASS to SRT Converter — Free, Private, No Upload | Compress Pro',
		description:
			'Convert ASS/SSA subtitles to plain SRT in your browser — styling stripped, text and timing kept. Instant and private, nothing gets uploaded. Free.',
		tagline: 'ASS subtitles flattened to clean SRT — all on your device.',
		related: ['/srt-to-vtt', '/vtt-to-srt', '/compress-video']
	},
	'remove-audio-from-video': {
		ogImage: '/og/remove-audio-from-video.jpg',
		preset: { kind: 'video', container: 'mp4', removeAudio: true },
		accept: 'video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm',
		dropSubject: 'video files',
		dropHint: 'MP4/MOV/WebM · audio track removed locally',
		title: 'Remove Audio from Video — Mute MP4, No Upload | Compress Pro',
		description:
			'Strip the audio track from MP4, MOV or WebM videos right in your browser — the picture stays, the sound goes, nothing is uploaded. Free and private.',
		tagline: 'Mute any video on your own device — the audio just goes.',
		related: ['/compress-video', '/compress-mp4', '/mp4-to-mp3']
	}
};
