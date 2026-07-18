// Long-form page bodies (intro/guide/faq) for the 'video-audio' tool group —
// extracted verbatim from the pre-split seo.ts (parity was pinned by the
// migration snapshot). This is now the authoring source for this copy;
// loaded lazily via seo-body/index.ts, statically by seo-full.server.ts.
import type { SeoBody } from '$lib/seo';
import { PRIVACY_A_AUDIO, PRIVACY_A_VIDEO, PRIVACY_NO_VIDEO, PRIVACY_PROOF } from './shared';

export const BODIES: Record<string, SeoBody> = {
	'compress-video': {
		intro:
			'Compress and convert videos entirely in your browser — nothing is uploaded, so it’s fast and private. Drop an MP4, MOV, WebM, or MKV, pick a quality or name a target size like 25 MB, and export as MP4 for universal playback or WebM for smaller files. Audio is kept untouched whenever the format allows. **Your videos never leave your device** — and there is no watermark, no ad break and no premium tier.',
		guide: [
			{
				heading: 'Platform size limits (as of 2026)',
				paragraphs: [
					'Most upload failures are size caps in disguise. Target-size mode exists exactly for this — enter the number below and let the tool do the math.'
				],
				table: {
					columns: ['Destination', 'Limit', 'What to enter'],
					rows: [
						[
							'Email (Gmail, iCloud, most providers)',
							'25 MB encoded',
							'19 MB — transport encoding adds ~33%'
						],
						['Discord (free)', '10 MB', '10 MB'],
						['Discord (Nitro Basic / Nitro)', '50 / 500 MB', '50 or 500 MB'],
						['Typical web forms & CMSes', '25–100 MB', 'Check the form, then enter it']
					]
				}
			},
			{
				heading: 'MP4 or WebM?',
				paragraphs: [
					'MP4 with H.264 is the universal answer — it plays on every phone, TV, editor and platform, which is why it is the default here. WebM with VP9 typically lands noticeably smaller at the same visual quality, but Apple devices handle it poorly. Rule of thumb: sharing with people → MP4; embedding on your own website → WebM — the [MP4 to WebM](/mp4-to-webm) converter is preset for exactly that move.'
				]
			},
			{
				heading: 'Where the big savings hide',
				paragraphs: [
					'Resolution and frame rate move more megabytes than quality sliders. Downscaling 4K to 1080p — or 1080p to 720p — roughly halves the size before compression even starts trying; capping 60 fps screen recordings to 30 fps saves another large slice with no visible cost for talking-head or screen content. Combine both with a modest quality and even long clips fit under email limits. iPhone footage usually arrives as MOV — [MOV to MP4](/mov-to-mp4) converts and shrinks it in one pass, and plain MP4 files have a dedicated [Compress MP4](/compress-mp4) page.'
				]
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'Encoding runs on WebCodecs — the hardware H.264/VP9 encoder already built into your browser — orchestrated by mediabunny, which handles the container work of reading and writing MP4, MOV and WebM. The same silicon that records your screen does the compression, which is why there is no upload, no queue, and no watermark — and why even long clips convert at full speed.'
				]
			}
		],
		faq: [
			{
				q: 'Is it safe to compress private videos here?',
				a: 'Yes. Conversion runs on your own device using your browser’s built-in video engine — videos are never uploaded, and the server only ever delivers this page. Close the tab and everything is gone. Want proof? Compress one video, switch your connection off, and compress another — it still works.'
			},
			{
				q: 'How do I get a video under 10 MB for Discord or 25 MB for email?',
				a: 'Switch to target-size mode and enter the limit. The tool works out the settings that land under it, converts, and verifies the result — ideal for Discord’s 10 MB free cap or email attachments.'
			},
			{
				q: 'Which formats can I convert?',
				a: 'Anything your browser can play: MP4, MOV, WebM and MKV — including footage from phones, cameras and screen recorders. Output is MP4 (H.264), the format that plays everywhere, or WebM (VP9), which is usually smaller.'
			},
			{
				q: 'Why do iPhone videos look slightly different after compressing?',
				a: 'Recent iPhones record HDR video. Browsers encode to standard SDR, so very bright highlights and saturated colors can shift — the tool warns you when this applies. Detail and sharpness are unaffected.'
			}
		]
	},
	'compress-audio': {
		intro:
			'Compress audio files or convert them between MP3, M4A, WAV, FLAC, OGG, OPUS and WEBA — **everything encodes in your browser, and nothing is uploaded**. Drop any audio file, or a video to have its audio track extracted, then pick a format and a bitrate or a target size. Free, with no ads and no length limits.',
		guide: [
			{
				heading: 'Bitrate guide',
				paragraphs: [
					'Audio bitrate is a straight rate — kilobits per second times duration is the file size, no surprises. 192 kbps MP3 sounds identical to the original for most music on most gear; voice tolerates far less. When in doubt, convert once at 192 and compare it against the source with your own ears.'
				],
				table: {
					columns: ['Use', 'Bitrate'],
					rows: [
						['Voice memos & podcasts', '96 kbps'],
						['Music, casual listening', '192 kbps'],
						['Music, near-archival', '256–320 kbps']
					]
				}
			},
			{
				heading: 'MP3, M4A, OGG, FLAC or WAV?',
				paragraphs: [
					'MP3 plays absolutely everywhere and is the safe default. M4A (AAC) sounds slightly better at the same bitrate and suits Apple ecosystems. OGG squeezes best at low bitrates but some players still shrug at it — OPUS and WEBA write the same modern Opus audio under the names voice apps and web players expect. WAV is uncompressed — a format for editing, not sharing, at roughly 10 MB per minute of stereo; [FLAC](/wav-to-flac) packs the same samples losslessly into about half that. Starting from a video instead? [MP4 to MP3](/mp4-to-mp3) pulls the audio track out directly.'
				]
			},
			{
				heading: 'Target size from duration',
				paragraphs: [
					'Because audio bitrate is constant, target-size mode can be exact: it divides your cap by the duration and picks the bitrate that fits, between 32 and 320 kbps. A 40-minute recording into 25 MB works out around 80 kbps — fine for speech, rough for music — and the math tells you honestly what’s possible.'
				]
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'Each format gets the encoder desktop audio tools actually ship: LAME for MP3, FFmpeg’s AAC encoder for M4A, libFLAC for FLAC — all compiled to WebAssembly — while Opus uses WebCodecs, the encoder already built into your browser. The pipeline is orchestrated by mediabunny, so whether you convert a recording or pull a track out of a video, everything encodes on your device.'
				]
			}
		],
		faq: [
			{
				q: 'Which bitrate should I pick?',
				a: '192 kbps MP3 sounds identical to the original for most music; 128 is fine for casual listening; 96 and below suit voice recordings and podcasts. M4A and OGG sound better than MP3 at the same bitrate, so they can go lower.'
			},
			{
				q: 'Can I turn a video into an MP3?',
				a: 'Yes — drop an MP4 or MOV straight onto this tab. The audio track is extracted and re-encoded to the format you picked; the video track is discarded.'
			},
			{
				q: 'Why is WAV so large?',
				a: 'WAV stores raw uncompressed samples — roughly 10 MB per stereo minute. Use it when a tool insists on WAV input or for editing; FLAC keeps it lossless at about half the size, and MP3/M4A/OGG sound identical at a tenth of it.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'mov-to-mp4': {
		intro:
			'Convert iPhone and Mac MOV recordings to MP4 right in your browser — **the conversion runs on your device, and nothing is uploaded**. MP4 plays everywhere: Windows, Android, TVs, editors, and every upload form. Keep the quality slider high for a near-identical copy, or set a target size like 25 MB to shrink while you convert.',
		guide: [
			{
				heading: 'Why iPhone videos are MOV in the first place',
				paragraphs: [
					'iPhones record into Apple’s own QuickTime format, and with the default “High Efficiency” camera setting the video inside is HEVC with HDR — efficient on an iPhone, awkward everywhere else. Converting to MP4 with H.264 makes the file open on Windows, Android, TVs and every upload form. One honest caveat: HDR footage is tone-mapped to standard colors during conversion, so extremely bright highlights can look slightly less punchy — the tool warns you when this applies.'
				]
			},
			{
				heading: 'Recommended settings by destination',
				table: {
					columns: ['Destination', 'Quality', 'Max dimension'],
					rows: [
						['Send by email', 'Target size: 19 MB', '1920 px'],
						['Share to Windows / Android', '75 (default)', 'Original'],
						['Upload to a website or CMS', '70', '1920 px'],
						['Keep as a compatible master copy', '90', 'Original']
					]
				}
			},
			{
				heading: 'Converting a whole camera roll',
				paragraphs: [
					'Drop any number of MOV files at once — they convert in sequence with per-file progress, and nothing uploads in the background while you wait, because there is no background. AirDrop the folder from your iPhone to a Mac, drop it here, and download the converted set. Clips that only need shrinking, not converting, belong on [Compress MOV](/compress-mov) — it keeps the QuickTime format.'
				]
			}
		],
		faq: [
			{
				q: 'Why convert MOV to MP4?',
				a: 'MOV is Apple’s QuickTime video format — many Windows apps, Android phones, TVs and upload forms refuse it. MP4 with H.264 is the most universally supported video format there is.'
			},
			{
				q: 'Will converting reduce quality?',
				a: 'The video is re-encoded once on your own device. At the default quality it is visually near-identical; raise the slider for archival copies or lower it to shrink the file at the same time.'
			},
			{
				q: 'What happens to the audio track?',
				a: 'It is carried over or converted as needed for MP4. In the rare case your browser cannot produce MP4-compatible audio, the tool says so clearly — switching output to WebM keeps the sound.'
			},
			{ q: 'Are my videos uploaded while converting?', a: PRIVACY_NO_VIDEO }
		]
	},
	'webm-to-mp4': {
		intro:
			'Turn WebM videos into MP4 **without uploading them** — the whole conversion happens in your browser. WebM plays great in browsers, but Apple devices, TVs, and most editors still want MP4. Drop a batch, keep the audio, and download files that play everywhere.',
		guide: [
			{
				heading: 'Where WebM refuses to play',
				paragraphs: [
					'WebM was built for browsers, and there it is excellent — but step outside and support thins fast: iPhones and iPads, Apple TV and many smart TVs, video editors, office software and upload forms all expect MP4. Converting once to MP4 with H.264 ends the compatibility guesswork.'
				]
			},
			{
				heading: 'Screen recordings are the classic case',
				paragraphs: [
					'Screen recorders that run in a browser — meeting tools, recorder extensions — save WebM, because that is the format browsers record natively. Convert the recording to MP4 and it drops into every editor, deck and chat app; if it also needs to be smaller, [Compress MP4](/compress-mp4) takes it from there.'
				]
			}
		],
		faq: [
			{
				q: 'Why convert WebM to MP4?',
				a: 'WebM is a web-first format — iPhones, iPads, Apple TV, many smart TVs and video editors cannot open it. MP4 with H.264 plays essentially everywhere.'
			},
			{
				q: 'Does the video lose quality?',
				a: 'One re-encode happens, right on your own device. At the default quality the difference is not visible in normal viewing; raise the slider if you want extra headroom.'
			},
			{
				q: 'Is the audio kept?',
				a: 'Yes — the audio track is carried over or converted as needed for MP4 playback. If your browser cannot manage it, the tool warns you instead of failing silently.'
			},
			{ q: 'Do my videos get uploaded?', a: PRIVACY_NO_VIDEO }
		]
	},
	'mkv-to-mp4': {
		intro:
			'Convert MKV files to MP4 entirely in your browser — the video is re-encoded and the audio carried over or converted, **with nothing uploaded anywhere**. MKV is a flexible format, but phones, TVs and editors often refuse it; MP4 opens everywhere. If your browser cannot read the video inside, the tool tells you straight away.',
		guide: [
			{
				heading: 'Why players reject MKV',
				paragraphs: [
					'MKV is a favorite of archivists because it can hold practically anything — several audio tracks, subtitles, any codec. That same flexibility is why phones, TVs and editors often refuse it: they cannot rely on what is inside. MP4 with H.264 makes the contents predictable, which is the whole point of converting.'
				]
			},
			{
				heading: 'Big files welcome',
				paragraphs: [
					'MKV files tend to be large, and with an upload-based converter a multi-gigabyte file spends longer travelling than converting. Here there is no travel: conversion starts the moment you drop the file, bounded only by your device. If the result should also be smaller, [Compress MP4](/compress-mp4) finishes the job.'
				]
			}
		],
		faq: [
			{
				q: 'Why convert MKV to MP4?',
				a: 'MKV is a powerful format loved by rippers and archivists, but phones, TVs, editors and upload forms often reject it. MP4 with H.264 is the safe, universal choice.'
			},
			{
				q: 'Which MKV files work?',
				a: 'Any whose video your browser can play — the vast majority of MKV files (H.264, HEVC, VP9, AV1) work. If one is not supported, you get a clear error instead of a broken file.'
			},
			{
				q: 'Can I shrink the file while converting?',
				a: 'Yes — pick a lower quality or switch to target-size mode and enter a limit like 25 MB; the converter fits the file to your budget.'
			},
			{ q: 'Is anything uploaded?', a: PRIVACY_NO_VIDEO }
		]
	},
	'mp4-to-webm': {
		intro:
			'Convert MP4 videos to WebM right in your browser — **everything runs on your device, nothing is uploaded**. WebM (VP9) usually lands noticeably smaller than MP4 at the same visual quality, which makes it the go-to format for websites and web apps. The audio track comes along too.',
		guide: [
			{
				heading: 'Smaller video for your own site',
				paragraphs: [
					'VP9 typically lands well under H.264 at the same visual quality, and on a website that difference is paid out on every single view. Background loops, product demos and portfolio reels are the sweet spot — the places where you control the player and every megabyte shows up in load time.'
				]
			},
			{
				heading: 'Keep an MP4 fallback',
				paragraphs: [
					'Apple devices still handle WebM inconsistently, so the safe pattern is to serve WebM first and let Safari fall back to the MP4 you already have. And if a WebM ever needs to travel the other way, [WebM to MP4](/webm-to-mp4) reverses the conversion.'
				]
			}
		],
		faq: [
			{
				q: 'Why convert MP4 to WebM?',
				a: 'Smaller files at the same visual quality — VP9 typically beats H.264 by a clear margin, which matters for websites, portfolios and anything users have to download.'
			},
			{
				q: 'Where does WebM not play?',
				a: 'The Apple ecosystem is the big exception — Safari handles WebM inconsistently and iPhones don’t preview it natively. For web pages and modern browsers it is a first-class citizen.'
			},
			{
				q: 'What happens to the audio?',
				a: 'It is converted to (or kept as) Opus, WebM’s native audio format — excellent quality at small sizes.'
			},
			{ q: 'Is my video uploaded during conversion?', a: PRIVACY_NO_VIDEO }
		]
	},
	'video-to-gif': {
		intro:
			'Turn any video your browser can play — MP4, WebM, MOV — into a looping GIF, entirely on your own device. **Nothing is uploaded, and there is no watermark or length gate**: drop a clip, pick the frame rate and size, and download the GIF.',
		guide: [
			{
				heading: 'The three levers',
				paragraphs: ['GIF has no motion compression, so size control is entirely in your hands:'],
				table: {
					columns: ['Lever', 'Effect'],
					rows: [
						['Frame rate', '10 fps looks smooth for UI and memes; 15 for real motion'],
						['Max dimension', '480 px fits chats — halving dimensions roughly quarters the file'],
						['Length', 'Bytes grow with every frame — a few seconds is the sweet spot']
					]
				}
			},
			{
				heading: 'GIF or video?',
				paragraphs: [
					'A GIF autoplays and loops in places that reject video — READMEs, docs, forums — but costs roughly ten times the bytes. If the destination plays video, skip the GIF: [compress the clip](/compress-video) and share it as MP4, smaller and with sound intact. Already made a GIF you regret? [GIF to MP4](/gif-to-mp4) converts it back.'
				]
			}
		],
		faq: [
			{
				q: 'How do I keep the GIF small?',
				a: 'Three levers: lower fps (10 already looks smooth), a smaller max dimension (480 px is the classic GIF size), and a lower quality setting (fewer palette colors). GIFs grow fast — a few seconds is the sweet spot.'
			},
			{
				q: 'Is there a length or size limit?',
				a: 'No hard limit — everything runs on your machine. Long clips produce very large GIFs though, so the tool warns you past roughly a minute at 15 fps.'
			},
			{
				q: 'Why does my GIF have no sound?',
				a: 'GIF cannot carry audio at all — the format is silent by design. If the sound matters, share the clip as a compressed video instead; the GIF is for the picture-only loop.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_VIDEO }
		]
	},
	'mp4-to-gif': {
		intro:
			'Convert MP4 videos to animated GIFs locally — **everything happens right in your browser**, and the finished GIF simply downloads. No watermark, no sign-up, no length gate. Best results come from short clips: pick the frame rate and a max dimension, and the GIF drops straight into chats, docs and READMEs.',
		guide: [
			{
				heading: 'When a GIF beats a video — and when it doesn’t',
				paragraphs: [
					'GIFs autoplay everywhere, loop forever and paste into places that reject video: READMEs, docs, issue trackers, some CMSes. But they cost roughly ten times the bytes of the same clip as MP4. The rule of thumb: under ten seconds of screen capture or reaction — GIF; anything longer or with sound — keep it a video and [compress it](/compress-video) instead.'
				]
			},
			{
				heading: 'Dial in frame rate and size',
				table: {
					columns: ['Use', 'Frame rate', 'Max dimension'],
					rows: [
						['UI demo in a README', '10 fps', '800 px'],
						['Chat reaction', '10 fps', '480 px'],
						['Smooth motion clip', '15 fps', '640 px']
					]
				}
			},
			{
				heading: 'Screen recordings convert best',
				paragraphs: [
					'Screen captures have flat colors and static regions — exactly what GIF’s palette handles well, which is why terminal demos and app walkthroughs convert so cleanly. Camera footage is the opposite: grain and gradients fight the 256-color palette and band visibly. If a real-video GIF looks rough, lower the dimension before lowering the quality.'
				]
			}
		],
		faq: [
			{
				q: 'Why is the GIF bigger than my MP4?',
				a: 'GIF is a 1980s format: every frame is stored as a full picture with no motion compression, so a few seconds of GIF can outweigh a minute of MP4. That’s normal — keep clips short and dimensions modest.'
			},
			{
				q: 'What settings make a good GIF?',
				a: '10–15 fps looks smooth for UI captures and memes, 480–640 px fits chat windows, and a few seconds of length keeps the file sane. The quality setting trades palette richness for size.'
			},
			{
				q: 'Can I turn a GIF back into a video?',
				a: 'Yes — the GIF to MP4 converter does the reverse, and a silent MP4 is usually far smaller than the same GIF. GIF wins only where autoplay-without-sound matters and video embeds don’t work.'
			},
			{ q: 'Is my video uploaded?', a: PRIVACY_NO_VIDEO }
		]
	},
	'gif-to-mp4': {
		intro:
			'MP4 stores the same animation in a fraction of the bytes and plays it smoother than any GIF. The conversion happens in your browser frame by frame — **the file never leaves your device**.',
		guide: [
			{
				heading: 'Why the MP4 is so much smaller',
				paragraphs: [
					'GIF stores every frame as a full 256-color picture — 1980s technology. Video formats store what changed between frames, which is why the same clip as MP4 typically lands 5–10× smaller and plays at full frame rate without the GIF shimmer. Anywhere a video embed works, the MP4 is simply the better file.'
				]
			},
			{
				heading: 'Where GIFs still win',
				paragraphs: [
					'Some places accept only images: README files, documentation, forums, office documents. There a GIF autoplays where a video would be stripped. The practical workflow is to keep the master as video and [make a GIF](/video-to-gif) only for destinations that demand one — and [compress it](/compress-gif) if it comes out heavy.'
				]
			}
		],
		faq: [
			{
				q: 'Why convert GIF to MP4 at all?',
				a: 'Size and smoothness. Modern video formats compress motion far better than GIF’s 1980s-era format — the MP4 is typically 5–10× smaller, plays at full frame rate, and every platform (including Twitter/X and WhatsApp) prefers it.'
			},
			{
				q: 'Does the MP4 loop like the GIF?',
				a: 'The file itself plays once; looping is a player setting. Browsers and chat apps that convert GIFs internally loop them automatically, and on websites a video can simply be set to loop.'
			},
			{
				q: 'Is there any sound in the MP4?',
				a: 'No — GIFs are silent by design, so there is no audio to carry over. The MP4 comes out silent too, just dramatically smaller and smoother than the GIF it came from.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_VIDEO }
		]
	},
	'mp4-to-mp3': {
		intro:
			'Extract the audio track from any MP4 or MOV video and save it as an MP3 — the extraction and encoding run in your browser, so **nothing is uploaded and even hour-long recordings convert without limits**. Drop a video, pick a bitrate, download just the sound.',
		guide: [
			{
				heading: 'What the MP3 can and cannot contain',
				paragraphs: [
					'Extraction re-encodes the sound that is already in the video — it cannot add fidelity that was never recorded. For talks and interviews filmed on a phone, 96–128 kbps captures everything there is; for concert or music footage, go 192 kbps or higher. To convert audio you already have as files, the [audio tool](/compress-audio) handles MP3, M4A, WAV, FLAC, OGG and more directly.'
				]
			},
			{
				heading: 'Typical uses',
				table: {
					columns: ['Task', 'Setting'],
					rows: [
						['Lecture or podcast from a recording', '96–128 kbps'],
						['Song from a music video', '192–256 kbps'],
						['Voice notes for transcription', '96 kbps'],
						['Fit a size cap', 'Target size — type the cap']
					]
				}
			}
		],
		faq: [
			{
				q: 'Does the video quality matter for the MP3?',
				a: 'No — the audio track is independent of the picture. A 4K and a 480p copy of the same video produce the identical MP3, because only the sound is re-encoded.'
			},
			{
				q: 'What bitrate does the MP3 use?',
				a: 'Whatever you pick — 192 kbps by default, which sounds identical to the original for music. Switch to Target size mode to aim at a specific file size instead.'
			},
			{
				q: 'Can I extract audio from many videos at once?',
				a: 'Yes — drop any number of MP4 or MOV files and each produces its own MP3, downloadable individually or as one ZIP. Long recordings work too; there is no length limit.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'wav-to-mp3': {
		intro:
			'WAV stores raw samples; MP3 keeps what you can hear. At 192 kbps the MP3 is about a tenth of the WAV with no audible difference — and **the conversion never leaves your machine**.',
		guide: [
			{
				heading: 'Pick a bitrate',
				paragraphs: [
					'MP3 size is pure arithmetic — bitrate times duration — so choosing a bitrate is choosing a file size:'
				],
				table: {
					columns: ['Content', 'Bitrate', 'An hour of audio'],
					rows: [
						['Voice, interviews, lectures', '96–128 kbps', '≈ 45–60 MB'],
						['Music, everyday listening', '192 kbps', '≈ 85 MB'],
						['Music, near-archival', '256–320 kbps', '≈ 115–140 MB']
					]
				}
			},
			{
				heading: 'When to keep the WAV',
				paragraphs: [
					'Keep the WAV as the master whenever editing lies ahead — every MP3 re-encode loses a little, so cut and mix in WAV, then export MP3 once at the end. For listening and sharing, the MP3 is the file to send; if it must also hit an exact size, the [audio tool](/compress-audio) can aim at a target size instead of a bitrate.'
				]
			}
		],
		faq: [
			{
				q: 'How much smaller does it get?',
				a: 'A stereo WAV is ~1.4 Mbps; a 192 kbps MP3 is about 7× smaller, a 128 kbps one about 11× smaller. An hour of WAV (~600 MB) becomes roughly 60–85 MB.'
			},
			{
				q: 'Will I hear the difference?',
				a: 'At 192 kbps and above, almost certainly not — in listening tests, that is the level where people stop telling the difference for music. Keep the WAV as an archival master if you plan to edit later; re-encoding MP3s repeatedly does degrade.'
			},
			{
				q: 'Can I convert many WAV files at once?',
				a: 'Yes — drop the whole batch and each file is encoded on your device, then download the results individually or as one ZIP. There are no daily caps and no file limits.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'm4a-to-mp3': {
		intro:
			'Convert M4A files — Apple’s default for Voice Memos, GarageBand exports and iTunes rips — to MP3 **without uploading a second of audio**. MP3 plays on everything ever made: car stereos, old players, court and HR portals, editing tools that shrug at M4A. Drop the files, pick a bitrate, download.',
		guide: [
			{
				heading: 'Voice memos off an iPhone',
				paragraphs: [
					'Share the memo from the Voice Memos app to your Mac (AirDrop) or into a folder, drop the .m4a files here, and download MP3s that any transcription portal, lawyer, journalist tool or ancient laptop will accept. Batches convert in one go and nothing routes through a server — worth remembering when the recordings are interviews or meetings.'
				]
			},
			{
				heading: 'Bitrate picks',
				table: {
					columns: ['Content', 'Bitrate'],
					rows: [
						['Voice memos & interviews', '96–128 kbps'],
						['Podcasts with music beds', '160 kbps'],
						['Music', '192 kbps']
					]
				}
			},
			{
				heading: 'When to keep M4A',
				paragraphs: [
					'If everything in your workflow already accepts M4A, converting buys nothing — M4A actually sounds better than MP3 at the same bitrate, so keep it and just [compress the audio](/compress-audio) if size is the issue. Convert only when a device or upload form actually refuses the file.'
				]
			}
		],
		faq: [
			{
				q: 'What is an M4A file?',
				a: 'Apple’s default audio format — what iPhones produce for Voice Memos and what Apple Music rips use. Quality for the size is excellent, but plenty of older software and hardware still refuses the format.'
			},
			{
				q: 'Will converting lose quality?',
				a: 'Both formats are lossy, so re-encoding costs a little — inaudible for speech at 128 kbps and above. Pick a bitrate at or above the source’s and the difference stays theoretical.'
			},
			{
				q: 'What bitrate should I use?',
				a: '96–128 kbps sounds identical to the original for voice memos and interviews; use 192 kbps for music. Higher bitrates than the source contain no extra quality — they just spend bytes.'
			},
			{
				q: 'Is my audio uploaded?',
				a:
					'No — the M4A is decoded and re-encoded to MP3 on your own device; no audio ever crosses the network, and no server keeps a copy.' +
					PRIVACY_PROOF
			}
		]
	},
	'flac-to-mp3': {
		intro:
			'FLAC keeps every bit of the original; MP3 keeps what you can hear. Convert lossless archives into files that play on anything — the decoding and encoding run in your browser, so **your library never leaves your machine**. Drop FLAC files, pick a bitrate, download MP3s.',
		guide: [
			{
				heading: 'Archive in FLAC, share in MP3',
				paragraphs: [
					'FLAC is the master copy — keep it. MP3 is the travel copy: 192 kbps for music sounds identical on most gear, 128 kbps if space is tight. Going the other way, WAV masters shrink losslessly with [WAV to FLAC](/wav-to-flac); to aim at an exact file size instead of a bitrate, the [audio tool](/compress-audio) has a target-size mode.'
				]
			}
		],
		faq: [
			{
				q: 'Does converting FLAC to MP3 lose quality?',
				a: 'Technically yes — MP3 is lossy. At 192 kbps and above the difference is inaudible for almost everyone; keep the FLAC as your archival master and use the MP3 for phones, cars and players that refuse FLAC.'
			},
			{
				q: 'Why convert FLAC at all?',
				a: 'Compatibility and size. FLAC is perfect for archiving, but plenty of car stereos, older players and apps refuse it — and it runs 5–10× larger than a 192 kbps MP3 that sounds the same on most gear.'
			},
			{
				q: 'Can I convert a whole album at once?',
				a: 'Yes — drop any number of FLAC files and each becomes its own MP3, downloadable individually or as one ZIP. There are no file limits and no daily caps.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'wav-to-flac': {
		intro:
			'FLAC stores exactly the same samples as WAV in roughly half the bytes — compression with no quality question at all. Drop WAV masters, download FLACs that decode back bit-for-bit; **everything runs in your browser and nothing is uploaded**.',
		guide: [
			{
				heading: 'When FLAC beats WAV',
				paragraphs: [
					'Every archival or editing reason to keep WAV applies to FLAC at half the disk — DAWs and editors widely accept it, and it even carries tags WAV cannot. Use it for masters and libraries; for sharing and phones, [FLAC to MP3](/flac-to-mp3) makes the small copy, and plain [WAV to MP3](/wav-to-mp3) skips the archival step entirely.'
				]
			}
		],
		faq: [
			{
				q: 'Is FLAC really lossless?',
				a: 'Yes — decode a FLAC and you get the identical samples the WAV held, bit for bit. It is a zip-style pack for audio, not a lossy encoder; that is why there is no bitrate to choose.'
			},
			{
				q: 'How much space does it save?',
				a: 'Typically 40–60% for music and up to 70% for speech or quiet recordings. Dense, loud material compresses least — the savings depend on the audio itself, not on a setting.'
			},
			{
				q: 'Why is there no bitrate slider?',
				a: 'Lossless formats have nothing to trade away — FLAC packs the samples as small as they go and always decodes to the exact original. For a smaller file you would switch to a lossy format like MP3 or Opus instead.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'opus-to-mp3': {
		intro:
			'OPUS is what messaging apps use for voice — tiny and great-sounding, until a car stereo, portal or editor refuses it. **Convert .opus files to MP3 entirely in your browser**: drop the notes, pick a bitrate, download audio that plays on everything.',
		guide: [
			{
				heading: 'From chat export to playable MP3',
				paragraphs: [
					'Export the conversation (WhatsApp: chat → Export, including media), pull out the .opus attachments, and drop them here in one batch. MP3 at 96–128 kbps is transparent for speech and opens in every transcription portal and player. Files already named .ogg convert the same way via [OGG to MP3](/ogg-to-mp3); to keep Opus but hit a size cap, use the [audio tool](/compress-audio).'
				]
			}
		],
		faq: [
			{
				q: 'Where do OPUS files come from?',
				a: 'Mostly voice messages — WhatsApp, Telegram and Signal exports all use Opus, and so do many voice recorders and game clips. It is a modern, efficient codec that older software simply never learned.'
			},
			{
				q: 'Which bitrate for voice notes?',
				a: '96–128 kbps MP3 captures everything a phone microphone recorded. Go 192 kbps only when the source is music; higher bitrates than the source just spend bytes.'
			},
			{
				q: 'Can I batch-convert exported chats?',
				a: 'Yes — drop every .opus file from the export at once; each becomes its own MP3 and the lot downloads as one ZIP. Nothing is uploaded, which matters for private conversations.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'ogg-to-mp3': {
		intro:
			'OGG carries Vorbis or Opus audio — efficient, open, and still refused by plenty of players and editors. **Convert it to MP3 without uploading anything**: drop .ogg or .oga files, pick a bitrate, download audio that works everywhere.',
		guide: [
			{
				heading: 'OGG, OGA, OPUS — which page?',
				paragraphs: [
					'They are siblings: .ogg and .oga are the same Ogg container, and .opus is Ogg carrying Opus under its own extension — voice messages usually arrive that way, and [OPUS to MP3](/opus-to-mp3) handles them. All of them convert here too; for bitrate advice and target-size mode, see the [audio tool](/compress-audio).'
				]
			}
		],
		faq: [
			{
				q: 'What is inside an OGG file?',
				a: 'Usually Vorbis or Opus audio — game soundtracks, podcast feeds and open-source rips ship this way. Both decode here in the browser and re-encode straight to MP3.'
			},
			{
				q: 'What about .oga files?',
				a: 'Same container, different label — .oga is the “audio-only Ogg” extension. Drop them exactly like .ogg files; the conversion is identical.'
			},
			{
				q: 'Does quality survive the conversion?',
				a: 'Both directions are lossy, so match or exceed the source: 192 kbps MP3 for music keeps the difference inaudible, 128 kbps is plenty for speech. Batches convert in one go and download as a ZIP.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'aac-to-mp3': {
		intro:
			'Raw .aac files — ADTS streams from voice recorders, broadcast rips and old phones — play in fewer places than they should. **Convert them to MP3 entirely in your browser**: drop the files, pick a bitrate, download audio that opens anywhere.',
		guide: [
			{
				heading: 'Bare streams vs wrapped audio',
				paragraphs: [
					'Recorders and broadcast tools often write bare ADTS .aac because it needs no finalization — but players want wrapped, tagged files. MP3 is the universal answer; [M4A to MP3](/m4a-to-mp3) covers the wrapped Apple flavor, and the [audio tool](/compress-audio) converts either into M4A, OGG, FLAC and more.'
				]
			}
		],
		faq: [
			{
				q: 'Is AAC the same as M4A?',
				a: 'Same codec, different wrapper. M4A is AAC inside an MP4 container; a raw .aac file is the bare ADTS stream. Both convert here — drop whichever you have.'
			},
			{
				q: 'Does AAC to MP3 cost quality?',
				a: 'Both are lossy, so a little — inaudible when you pick 128 kbps or more for speech and 192 kbps for music. Choosing a bitrate above the source cannot add quality back, it only spends bytes.'
			},
			{
				q: 'Why do some players refuse .aac?',
				a: 'Bare ADTS streams carry no tags and no index, and plenty of software only accepts wrapped, seekable audio. MP3 — or M4A — solves that instantly.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'mp3-to-wav': {
		intro:
			'Some tools simply insist on WAV — hardware samplers, transcription suites, old editors. **This decodes your MP3s to standard 16-bit PCM WAV entirely in the browser**: drop the files, download WAVs, feed the tool that was complaining.',
		guide: [
			{
				heading: 'A decode, not an upgrade',
				paragraphs: [
					'Treat this as unpacking: the WAV is the MP3’s content in a form every tool accepts, no better and no worse. Archiving losslessly only works from lossless sources — [WAV to FLAC](/wav-to-flac) halves master sizes; going back the other way, [WAV to MP3](/wav-to-mp3) makes the small share copy.'
				]
			}
		],
		faq: [
			{
				q: 'Does WAV sound better than the MP3?',
				a: 'No — decoding cannot restore what MP3 encoding removed. The WAV holds exactly what the MP3 contained, just unpacked into raw samples that picky software accepts.'
			},
			{
				q: 'How much larger will it be?',
				a: 'Roughly 10 MB per stereo minute at 16-bit/44.1 kHz — about ten times a 192 kbps MP3. That is the price of raw samples; delete the WAV when the tool is done with it.'
			},
			{
				q: 'Why do editors want WAV at all?',
				a: 'Editing decodes audio anyway, and working from WAV avoids generation loss when saving: cut and mix in WAV, then export a lossy copy once at the end.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'mp4-to-wav': {
		intro:
			'Editors, transcription suites and samplers want WAV, not video. Drop an MP4 or MOV and the audio track comes out as standard 16-bit PCM WAV — **decoded entirely in your browser, with no upload and no length limit**.',
		guide: [
			{
				heading: 'Straight into the editing chain',
				paragraphs: [
					'Extracting WAV is the cleanest handoff into an edit: one decode, zero re-encodes, and every DAW and transcription tool accepts the result. When the deliverable is the recording itself, [MP4 to MP3](/mp4-to-mp3) makes the small copy instead — and the [audio tool](/compress-audio) offers M4A, OGG, FLAC and target-size mode for everything in between.'
				]
			}
		],
		faq: [
			{
				q: 'Why WAV instead of MP3?',
				a: 'WAV skips a lossy re-encode — the video’s audio is decoded straight to raw samples, so nothing is lost on the way into your editor. If small and shareable is the goal instead, extract to MP3.'
			},
			{
				q: 'How big will the WAV be?',
				a: 'About 10 MB per stereo minute regardless of the video’s size — the picture is discarded and the sound is unpacked to raw PCM. An hour of footage yields roughly 600 MB of WAV.'
			},
			{
				q: 'Which video formats work?',
				a: 'MP4, M4V and MOV — phone footage, screen recordings, camera clips. Drop several at once and each video produces its own WAV, downloadable individually or as one ZIP.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'webm-to-mp3': {
		intro:
			'Extract the audio track from WebM videos as MP3 — **decoded and encoded entirely in your browser**, with no upload and no length gate. Screen recordings, browser captures and downloaded clips: drop them in, the soundtrack comes out as its own file.',
		guide: [
			{
				heading: 'From screen recording to shareable audio',
				paragraphs: [
					'WebM is what browser-based recorders and most capture tools produce, and the audio inside is often the part that matters — a call, a talk, a walkthrough narration. Extraction discards the picture and re-encodes the sound to MP3, the format that plays absolutely anywhere. [MP4 to MP3](/mp4-to-mp3) covers the MP4/MOV twin, and for editing-grade PCM instead, [MP4 to WAV](/mp4-to-wav) extracts losslessly.'
				]
			}
		],
		faq: [
			{
				q: 'Which WebM files work?',
				a: 'Anything your browser can play — VP8 or VP9 video with Opus or Vorbis audio. The video track is discarded; the audio is decoded and re-encoded to MP3 at the bitrate you pick.'
			},
			{
				q: 'Is quality lost in the conversion?',
				a: 'One lossy encode to MP3 happens — inaudible for speech at 128 kbps and safe for music at 192 kbps and up. Pick a higher bitrate when the source matters.'
			},
			{
				q: 'Can I get lossless audio instead?',
				a: 'Yes — on the audio tab choose WAV or FLAC as the output; MP3 is simply the small, plays-anywhere option this page arrives set to.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'mov-to-mp3': {
		intro:
			'Pull the audio out of iPhone and QuickTime MOV videos as MP3 — **everything runs in your browser**, nothing is uploaded, and there is no length limit. Concert clips, interviews, lectures, voice-heavy footage: the soundtrack downloads as a file of its own.',
		guide: [
			{
				heading: 'iPhone video, audio-first',
				paragraphs: [
					'Sometimes the camera was just the way the sound got recorded. Extraction discards the picture and encodes the audio to MP3, so an hour of lecture footage becomes a small file any phone, player or notes app opens. [MP4 to MP3](/mp4-to-mp3) is the same tool for MP4 files, [MP4 to WAV](/mp4-to-wav) extracts editing-grade PCM instead, and the video itself shrinks on [Compress MOV](/compress-mov).'
				]
			}
		],
		faq: [
			{
				q: 'Does it work with any MOV?',
				a: 'Any MOV your browser can decode — iPhone recordings (H.264 or HEVC with AAC audio) are exactly that. The audio re-encodes to MP3; the picture is discarded.'
			},
			{
				q: 'What bitrate should I pick?',
				a: '128 kbps is clean for speech; 192 kbps and up for music and gigs. The preset default suits voice-heavy recordings.'
			},
			{
				q: 'Is there a length limit?',
				a: 'No — an hour-long recording is fine. Processing runs on your device at roughly real-time speed or faster, and nothing queues on a server.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'mp3-to-m4a': {
		intro:
			'Convert MP3 files to M4A (AAC) entirely in your browser — **no uploads, no accounts**. M4A is the native audio format of the Apple ecosystem and the container audiobook and podcast tooling prefers; the re-encode happens on your own device.',
		guide: [
			{
				heading: 'When M4A makes sense — and when it does not',
				paragraphs: [
					'M4A/AAC is what iPhones, iTunes and audiobook apps speak natively, and some of them accept nothing else. But this is a lossy-to-lossy re-encode: quality cannot improve, only the packaging changes — so keep the MP3 masters and convert only where a tool demands M4A. The reverse trip is [M4A to MP3](/m4a-to-mp3); everything size-focused lives on [Compress audio](/compress-audio).'
				]
			}
		],
		faq: [
			{
				q: 'Will my audio sound better as M4A?',
				a: 'No — re-encoding lossy audio cannot restore what MP3 encoding removed. AAC holds quality slightly better at matching bitrates, but converting existing MP3s is about compatibility, not fidelity.'
			},
			{
				q: 'Why do some apps insist on M4A?',
				a: 'Apple tooling, audiobook chapters and some podcast pipelines are built around the MP4 audio container. M4A slots in natively where MP3 gets refused or re-processed.'
			},
			{
				q: 'What bitrate should I use?',
				a: 'Match or exceed the source — 192 kbps is a safe default that avoids stacking audible loss on top of the original encode.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'wav-to-m4a': {
		intro:
			'Convert WAV recordings to M4A (AAC) right in your browser — **roughly a tenth of the size with no audible difference at sensible bitrates**, encoded on your device. The natural export for recordings headed to Apple devices and modern apps.',
		guide: [
			{
				heading: 'A tenth of the size, none of the drama',
				paragraphs: [
					'WAV stores raw samples at about 10 MB per stereo minute; AAC keeps what the ear actually hears. At 192 kbps the difference is inaudible for nearly all material, and the files shrink by an order of magnitude. Archival masters belong in lossless [WAV to FLAC](/wav-to-flac); maximum-compatibility sharing in [WAV to MP3](/wav-to-mp3) — M4A sits between them: small, modern, Apple-native.'
				]
			}
		],
		faq: [
			{
				q: 'M4A or MP3 for my WAVs?',
				a: 'Both are lossy and small. M4A/AAC sounds slightly better at the same bitrate and is native across Apple devices; MP3 opens on absolutely everything ever made. Pick by where the file is headed.'
			},
			{
				q: 'Is M4A lossless?',
				a: 'No — AAC is lossy. For a mathematically perfect archive convert to FLAC instead; for listening and sharing, 192 kbps AAC is transparent for nearly all material.'
			},
			{
				q: 'How much smaller will files get?',
				a: 'Around 10× at 192 kbps — an hour-long WAV of ~600 MB lands near 80 MB as M4A with no audible change.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'mp3-to-ogg': {
		intro:
			'Convert MP3 audio to OGG entirely in your browser — **encoded on your device, never uploaded**. The output is modern Opus in an OGG container: the license-free combination game engines, web stacks and voice platforms standardized on.',
		guide: [
			{
				heading: 'Opus in OGG, and why that matters',
				paragraphs: [
					'This page writes Opus — the best lossy codec in wide use — into the standard .ogg container. Game engines load it, browsers decode it natively, and there are no licensing strings attached anywhere in the chain. One honest note: some very old players expect Vorbis inside .ogg and may refuse Opus; anything from the last decade reads it fine. Quality cannot improve on a lossy-to-lossy trip, so keep the MP3 sources. The reverse direction is [OGG to MP3](/ogg-to-mp3).'
				]
			}
		],
		faq: [
			{
				q: 'Is the output Vorbis or Opus?',
				a: 'Opus — the modern successor, in a standard OGG container. Current software reads it everywhere; only very old Vorbis-era players may refuse it.'
			},
			{
				q: 'Why OGG for games and the web?',
				a: 'License-free, small, loops cleanly and is decoded natively by engines and browsers — which is why game pipelines and web apps ask for it over MP3.'
			},
			{
				q: 'Does converting improve quality?',
				a: 'No — lossy to lossy never does. The point is compatibility and size, not fidelity; pick a bitrate at or above the source to avoid audible stacking.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'wav-to-opus': {
		intro:
			'Convert WAV audio to Opus right in your browser — **the most efficient lossy codec in wide use, encoded locally**. Voice recordings collapse from megabytes to almost nothing; music holds up at bitrates MP3 cannot touch.',
		guide: [
			{
				heading: 'What Opus is unreasonably good at',
				paragraphs: [
					'Opus wins listening tests at every bitrate: speech is clean at 32–64 kbps, music rivals higher-rate MP3 at 96–128 kbps. That makes it the right target for voice notes, podcasts, streaming and game audio — WhatsApp voice messages are Opus already. For a lossless archive use [WAV to FLAC](/wav-to-flac); when a legacy player must open the file, [WAV to MP3](/wav-to-mp3) stays the compatibility pick.'
				]
			}
		],
		faq: [
			{
				q: 'What plays .opus files?',
				a: 'Browsers, VLC, modern phones and every messaging platform. Older car stereos and iTunes-era software may refuse them — MP3 remains the safe pick for legacy gear.'
			},
			{
				q: 'What bitrate should I pick for voice?',
				a: '32–64 kbps sounds clean for speech — an hour of voice lands around 15–30 MB. Music is comfortable at 96–128 kbps.'
			},
			{
				q: 'Is Opus really better than MP3?',
				a: 'At the same bitrate, clearly — especially below 128 kbps, where MP3 degrades audibly and Opus stays composed. That efficiency is why voice platforms adopted it.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_AUDIO }
		]
	},
	'compress-mp4': {
		intro:
			'Compress MP4 files right on your own device — **no upload, no queue, no watermark**. Set a quality for a smaller look-alike, or type the limit you’re fighting and target-size mode finds the settings that fit. Audio is carried over untouched whenever possible.',
		guide: [
			{
				heading: 'Quality mode vs target-size mode',
				paragraphs: [
					'Quality mode is for “make it smaller, keep it looking good” — the tool picks settings matched to resolution and frame rate. Target-size mode is for hard limits: it works backwards from your number and the clip duration, so a 90-second clip and a 9-minute clip both land under the same cap — the long one just looks softer.'
				]
			},
			{
				heading: 'Recommended targets by destination',
				table: {
					columns: ['Destination', 'Setting'],
					rows: [
						['Discord (free tier)', 'Target size: 10 MB'],
						['Email attachment', 'Target size: 19 MB'],
						['Website or CMS upload', 'Quality 70, max dimension 1920 px'],
						['Compatible master copy', 'Quality 90, original size']
					]
				}
			},
			{
				heading: 'Why MP4 is the safe output',
				paragraphs: [
					'MP4 (H.264) plays on effectively everything made this decade — Windows, Android, TVs, editors, browsers, upload forms. If your source is a newer iPhone recording (HEVC), converting costs some efficiency but buys universal playback; keep the quality higher to compensate. For the smallest file where compatibility doesn’t matter, the [Compress video](/compress-video) tab’s WebM output beats it.'
				]
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'Compression runs on WebCodecs — the H.264 encoder built into your browser, usually the same hardware block that records your screen — while mediabunny does the container work of reading the source MP4 and writing the new one around the fresh video track. The quality slider maps to a bitrate matched to the clip’s resolution and frame rate, capped so the re-encode never spends more bits than the original. Everything happens on your device, which is why there is no upload, no queue and no watermark.'
				]
			}
		],
		faq: [
			{
				q: 'How much smaller will my MP4 get?',
				a: 'Phone and screen recordings typically shrink 50–80% at the default quality, because they were encoded generously at capture time. Videos that were already compressed hard shrink less — the tool keeps the original if it can’t beat it.'
			},
			{
				q: 'How do I fit Discord or email limits?',
				a: 'Switch to target-size mode and type the cap itself — 10 MB for Discord’s free tier, 19 MB to send reliably by email. The tool aims the file at your number and lands just under it.'
			},
			{
				q: 'Will it lose quality?',
				a: 'MP4 is lossy, so re-encoding trades some detail for size — at the default quality the difference is hard to spot on phone footage. HDR sources are tone-mapped to standard colors; the tool warns you when that applies.'
			},
			{ q: 'Is my video uploaded?', a: PRIVACY_NO_VIDEO }
		]
	},
	'compress-mov': {
		intro:
			'Compress MOV files without changing what they are — the video is re-encoded on your own device and stays in its QuickTime container, so it drops straight back into Final Cut, QuickTime Player and every Apple workflow. Pick a quality for a smaller look-alike, or type the limit you’re fighting and target-size mode finds settings that fit. Audio is carried over untouched whenever possible, and **nothing is uploaded anywhere**.',
		guide: [
			{
				heading: 'Same container in, same container out',
				paragraphs: [
					'Compression here changes the bitrate, not the identity of the file: a .mov goes in, a smaller .mov comes out, with audio carried over or converted as needed. That matters for format-picky pipelines — Final Cut libraries, review tools, archives that expect QuickTime. When universal playback is the actual goal, [MOV to MP4](/mov-to-mp4) converts instead, and files that are already MP4 belong on [Compress MP4](/compress-mp4).'
				]
			},
			{
				heading: 'Recommended settings by destination',
				table: {
					columns: ['Destination', 'Setting'],
					rows: [
						['Email attachment', 'Target size: 19 MB'],
						['Slack or Teams share', 'Target size: 25 MB'],
						['Archive a screen recording', 'Quality 70'],
						['Compatible master copy', 'Quality 90, original size']
					]
				}
			},
			{
				heading: 'Quality mode or target-size mode',
				paragraphs: [
					'Quality mode answers “make it smaller, keep it looking good” — bitrates are matched to resolution and frame rate. Target-size mode answers hard limits: it works backwards from the number you type and the clip duration, verifies the result, and re-encodes once if the first pass lands over. Long clips fit the same cap as short ones — they just look softer.'
				]
			}
		],
		faq: [
			{
				q: 'Why compress MOV to MOV instead of converting to MP4?',
				a: 'Keeping the QuickTime container means editors and Apple apps treat the file exactly as before — same format, just smaller. Convert only when a destination refuses MOV; the dedicated MOV to MP4 converter handles that case.'
			},
			{
				q: 'How much smaller will my MOV get?',
				a: 'iPhone and screen recordings are encoded generously at capture time and typically shrink 50–80% at the default quality. Files that were already compressed hard shrink less — the tool keeps the original if it can’t beat it.'
			},
			{
				q: 'What happens to HEVC and HDR iPhone footage?',
				a: 'The video is re-encoded to H.264 for reliable playback, and HDR colors are tone-mapped to standard range — the tool warns you when that applies. Raise the quality slider for extra headroom on detailed clips.'
			},
			{ q: 'Is my MOV uploaded?', a: PRIVACY_NO_VIDEO }
		]
	},
	'remove-audio-from-video': {
		intro:
			'Remove the audio track from a video right in your browser — **the file never leaves your device**. Drop MP4, MOV or WebM; the muted result comes back as an MP4 with voices, noise and music gone from the file itself, not just turned down.',
		guide: [
			{
				heading: 'Muted for good, not just in the player',
				paragraphs: [
					'Muting in a player hides the sound; this removes the track from the file, which is what you want before sharing clips whose audio is private, noisy or copyrighted. The page arrives with the remove-audio switch already on, and the output simply contains no audio stream. Need it under a size cap too? The quality and target-size controls work in the same run — this is [Compress video](/compress-video) machinery with the sound taken out.'
				]
			},
			{
				heading: 'What happens to the picture',
				paragraphs: [
					'The video is re-encoded through the same pipeline as the compressors — visually faithful at the default quality, and the removed audio alone saves whatever its bitrate cost. For the opposite job — keeping the sound and discarding the picture — [MP4 to MP3](/mp4-to-mp3) extracts the audio instead.'
				]
			}
		],
		faq: [
			{
				q: 'Is the audio really gone from the file?',
				a: 'Yes — the output contains no audio track at all, which any player’s stream info confirms. It is not muted metadata; the stream is absent.'
			},
			{
				q: 'Does removing audio make the video smaller?',
				a: 'Somewhat — audio typically costs 128–256 kbps, so a 10-minute clip drops 10–20 MB from that alone. Lower the quality or set a target size in the same run to shrink the picture too.'
			},
			{
				q: 'Which formats can I drop?',
				a: 'MP4, M4V, MOV and WebM. The muted result is written as universal MP4, so it plays everywhere the original did — minus the sound.'
			},
			{ q: 'Is my video uploaded?', a: PRIVACY_NO_VIDEO }
		]
	},
	'srt-to-vtt': {
		intro:
			'Convert SRT subtitles to WebVTT entirely in your browser — **the caption format HTML5 `<track>`, YouTube and every modern web player expects**. Drop the files and the .vtt twins come straight back; ASS files convert the same way. Nothing is ever uploaded.',
		guide: [
			{
				heading: 'Why players want VTT',
				paragraphs: [
					'Browsers only render WebVTT in a `<track>` element — hand them an SRT and the captions simply never appear. The two formats are near twins: VTT adds a `WEBVTT` header, writes milliseconds with a dot instead of a comma, and drops the numeric counters. Small differences, but they are exactly what a strict parser rejects, which is why the conversion exists at all.'
				]
			},
			{
				heading: 'What changes — and what stays',
				paragraphs: [
					'Timing and text survive untouched: every cue keeps its start, end and lines. The header is added, commas become dots, counters go. ASS input works too — styling override tags are stripped and `\\N` line breaks unfold, so heavily styled karaoke tracks flatten into plain readable captions. Need the opposite direction? [VTT to SRT](/vtt-to-srt) is one click away.'
				]
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'The whole conversion is a few hundred lines of pure JavaScript running on your device — no WebAssembly engine, no server round-trip, which is why it is instant even for feature-length tracks. Files are parsed into cues, sorted, and rewritten in the target dialect; the text itself never leaves your browser. That matters for unreleased footage, court transcripts and anything else subtitles tend to spoil.'
				]
			}
		],
		faq: [
			{
				q: 'Which input formats can I drop?',
				a: 'SRT, VTT and ASS/SSA — the format is detected from the file’s content, not its extension, so mislabeled files convert fine too.'
			},
			{
				q: 'Do formatting tags survive?',
				a: 'Basic ones do — <i>, <b> and <u> pass through. ASS styling overrides (colors, positioning, karaoke timing) are stripped, because SRT and most VTT players cannot render them anyway.'
			},
			{
				q: 'Can I convert many files at once?',
				a: 'Yes — drop a whole season. Each file converts independently and downloads on its own row, or grab everything as a ZIP.'
			},
			{
				q: 'Are my subtitle files uploaded?',
				a: 'No. The conversion is plain text processing that runs entirely in your browser — the server only delivers this page.' + PRIVACY_PROOF
			}
		]
	},
	'vtt-to-srt': {
		intro:
			'Convert WebVTT captions to SRT entirely in your browser — **the classic format practically every desktop player, TV and set-top box accepts**. Drop the .vtt files, download the .srt twins. Nothing is uploaded anywhere.',
		guide: [
			{
				heading: 'When SRT is the right target',
				paragraphs: [
					'VTT rules the web, but the living room still speaks SRT: VLC, TVs, media servers and older players all expect it. The conversion re-numbers the cues, turns dot-milliseconds into commas and drops web-only cue settings like position and alignment — the text and timing carry over exactly.'
				]
			},
			{
				heading: 'Web-only markup is cleaned out',
				paragraphs: [
					'VTT allows voice spans, class tags and karaoke timestamps inside the text; SRT players would show those as literal angle-bracket noise. They are stripped on the way through, while <i>, <b> and <u> — which SRT understands — stay. NOTE and STYLE blocks disappear with them. The reverse trip is [SRT to VTT](/srt-to-vtt).'
				]
			}
		],
		faq: [
			{
				q: 'Do positions and colors carry over?',
				a: 'No — SRT has no standard way to express them, so cue settings and styling tags are removed. The words and timing, the part that matters, stay exact.'
			},
			{
				q: 'Will the file work on my TV?',
				a: 'That is the point of SRT: it is the most widely accepted subtitle format there is. Name it after the video file and most players pick it up automatically.'
			},
			{
				q: 'Can I fix out-of-order cues?',
				a: 'Cues are sorted by start time during conversion, so a track stitched from fragments comes out in playable order.'
			},
			{
				q: 'Is anything uploaded?',
				a: 'No. The conversion is plain text processing that runs entirely in your browser — the server only delivers this page.' + PRIVACY_PROOF
			}
		]
	},
	'ass-to-srt': {
		intro:
			'Convert ASS and SSA subtitles to plain SRT entirely in your browser — **styling overrides stripped, dialogue and timing kept**. The anime-fansub format becomes something every player understands. Nothing is uploaded.',
		guide: [
			{
				heading: 'What flattening means',
				paragraphs: [
					'ASS is a typesetting format: fonts, colors, positioning, karaoke effects — all encoded as override tags inside the dialogue. SRT carries none of that, so the tags are removed, `\\N` breaks become real line breaks, and each Dialogue line becomes a numbered SRT cue. Centisecond ASS timing is converted to milliseconds exactly.'
				]
			},
			{
				heading: 'Honest about the losses',
				paragraphs: [
					'Signs, songs and karaoke that relied on positioning will read as plain stacked text — that is inherent to SRT, not a converter flaw. Dialogue tracks convert cleanly. If the target is web video rather than a desktop player, [SRT to VTT](/srt-to-vtt) takes the result the rest of the way.'
				]
			}
		],
		faq: [
			{
				q: 'Are SSA files supported too?',
				a: 'Yes — SSA is the older dialect of the same format and parses the same way. Both .ass and .ssa extensions are accepted.'
			},
			{
				q: 'What happens to karaoke and sign typesetting?',
				a: 'The effects are stripped and the underlying text stays. SRT simply cannot express animated or positioned text, so this is the honest best any converter can do.'
			},
			{
				q: 'Does the timing stay frame-accurate?',
				a: 'ASS stores centiseconds; SRT stores milliseconds. Conversion is exact — cues start and end precisely where they did.'
			},
			{
				q: 'Are my files uploaded?',
				a: 'No. The conversion is plain text processing that runs entirely in your browser — the server only delivers this page.' + PRIVACY_PROOF
			}
		]
	}
};
