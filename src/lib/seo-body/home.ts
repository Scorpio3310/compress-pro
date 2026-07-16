// Long-form page bodies (intro/guide/faq) for the 'home' tool group —
// extracted verbatim from the pre-split seo.ts (parity was pinned by the
// migration snapshot). This is now the authoring source for this copy;
// loaded lazily via seo-body/index.ts, statically by seo-full.server.ts.
import type { SeoBody } from '$lib/seo';
import { PRIVACY_NO_BASE } from './shared';

export const BODIES: Record<string, SeoBody> = {
	'': {
		intro:
			'Compress Pro is a free, open-source set of compression tools that run entirely in your browser — no uploads, no ads, no accounts. Compress images, PDFs, video and audio, convert between formats, build ZIP archives, and strip photo metadata with the lossless EXIF remover that shows what your photos reveal. Everything happens right on your own device: **there is no upload step, so there is no server to trust** — and no upload wait, so even a huge video starts compressing the moment you drop it.',
		guide: [
			{
				heading: 'What makes this different',
				paragraphs: [
					'Most online compressors are upload services: your file travels to their server, waits in a queue between banner ads, and comes back smaller. Compress Pro skips the trip — the compression engine runs inside your browser, on your own device. Every difference below follows from that one design choice.'
				],
				table: {
					columns: ['', 'Typical online compressor', 'Compress Pro'],
					rows: [
						['Your files', 'Uploaded to a server', 'Never leave your device'],
						['Ads', 'Banners around every step', 'None'],
						['Price & limits', 'Daily caps, premium tiers', 'Free, no limits'],
						['Source code', 'Closed', 'Open on GitHub'],
						['Offline', 'Needs a connection', 'Works offline after first use']
					]
				}
			},
			{
				heading: 'The engines under the hood',
				paragraphs: [
					'The same battle-tested open-source encoders professional tools are built on — compiled to WebAssembly, running on your device. Video drives WebCodecs, the hardware encoder already built into your browser, so even long videos convert at full speed.'
				],
				table: {
					columns: ['Category', 'Engines running in your browser'],
					rows: [
						['JPG', 'MozJPEG — Mozilla’s tuned JPEG encoder'],
						['PNG', 'OxiPNG (lossless) and libimagequant, the pngquant engine (lossy)'],
						['WebP / AVIF', 'libwebp and libavif with libaom — the reference encoders'],
						['HEIC / GIF', 'libheif with libde265 for decoding; gifsicle for GIF'],
						[
							'Video',
							'WebCodecs (your browser’s hardware H.264/HEVC/VP9 encoder), orchestrated by mediabunny'
						],
						['Audio', 'LAME (MP3), FFmpeg’s AAC encoder, libFLAC (FLAC), plus WebCodecs for Opus'],
						[
							'PDF',
							'Ghostscript for compression; pdf-lib and pdf.js for merge, split and rendering'
						],
						['SVG', 'SVGO — the standard SVG optimizer'],
						['Fonts', 'HarfBuzz for subsetting; Google’s woff2 with Brotli for WOFF2'],
						['Archives', '7-Zip 24.09 compiled to WebAssembly, with fflate for ZIP/gzip fast paths']
					]
				}
			}
		],
		faq: [
			{ q: 'Are my files uploaded anywhere?', a: PRIVACY_NO_BASE },
			{
				q: 'Is it really free?',
				a: 'Yes — completely. No ads, no accounts, no watermarks, no daily limits, no premium tier. Everything runs on your own device, so there are no server costs to pass on — and the app is open source.'
			},
			{
				q: 'How do I know my files aren’t uploaded?',
				a: 'Two ways. Test it: compress a file, switch your connection off, and compress another — everything keeps working, because there was never anything to send. And check it: the app is open source, so anyone can read the code on GitHub and verify that no upload exists.'
			},
			{
				q: 'Is there a file size limit?',
				a: 'No hard limit — processing is bounded by your device’s memory, not by an upload cap. Multi-hundred-megabyte videos and PDFs work; they just take longer on slower hardware.'
			},
			{
				q: 'What can I compress or convert?',
				a: 'Images (JPG, PNG, WebP, GIF, HEIC, AVIF, SVG), PDFs, MP4/WebM/MOV video and MP3/WAV/M4A/FLAC/OGG/OPUS audio — plus ZIP archives, converters between formats like HEIC to JPG or MOV to MP4, and a lossless EXIF remover for photo metadata.'
			},
			{
				q: 'Will compression make my files look worse?',
				a: 'Only as much as you allow. Every tool has a quality control and a before/after compare, and target-size mode finds the best quality under a limit like 2 MB. Lossless modes (PNG, SVG, EXIF removal) don’t touch pixels at all.'
			}
		]
	}
};
