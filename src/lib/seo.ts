import type { FileFormat, FontFormat, ImageFormat } from '$lib/types';
import * as publicEnv from '$env/static/public';

// NOTE: this module is imported by the `tool` param matcher (src/params/tool.ts),
// which runs on the server, the client, and at prerender time — keep it free of
// side effects and browser globals ($env/static/public is inlined at build).

// Production origin. Override via PUBLIC_SITE_URL in .env only when the
// canonical domain changes — dev/preview builds keep the default so any
// non-production host serves a Disallow robots.txt (see routes/robots.txt).
// Wildcard import + cast: a named import fails the build when the var is unset.
const { PUBLIC_SITE_URL } = publicEnv as { PUBLIC_SITE_URL?: string };
export const SITE_URL = PUBLIC_SITE_URL ?? 'https://compress-pro.com';
export const SITE_NAME = 'Compress Pro';

export interface SeoFaq {
	q: string;
	a: string;
}

export interface SeoEntry {
	/** null for the homepage. */
	format: FileFormat | null;
	/** URL path — '/' or '/compress-<format>'. Also the canonical path. */
	path: string;
	/** Tab label. */
	label: string;
	title: string;
	description: string;
	h1: string;
	tagline: string;
	intro: string;
	faq: SeoFaq[];
	/** Extra JSON-LD featureList line, e.g. "Convert WebP to JPG". */
	feature?: string;
	/** Longer crawlable guide sections, rendered between How-it-works and FAQ. */
	guide?: SeoGuideSection[];
	/** "How it works" copy override — exactly three cards; FormatInfo falls
	 *  back to the generic compress-tool trio when absent. */
	steps?: [string, string, string];
	/** Curated cross-links to related tool pages (paths from FORMATS/CONVERTERS/TOOLS). */
	related?: string[];
	/** Per-page OG image path under static/ — falls back to /og.jpg. */
	ogImage?: string;
}

export interface SeoGuideSection {
	heading: string;
	paragraphs?: string[];
	table?: { columns: string[]; rows: string[][] };
}

/** What a converter landing page preconfigures when the user arrives. */
export type ConverterPreset =
	| {
			// Positive list: new FileFormat members must opt in, not leak in.
			kind: 'image';
			tab: 'jpg' | 'png' | 'webp' | 'gif' | 'heic';
			to: ImageFormat | 'ico';
			quality?: number;
			// Target-size landing pages ("compress JPG to 100 KB") arrive with
			// the mode flipped and the cap typed in.
			mode?: 'target';
			targetKb?: number;
	  }
	| { kind: 'pdf-from-images' }
	| { kind: 'pdf-to-images'; imageFormat: 'jpg' | 'png' }
	// SVG tab raster export — 'svg' output itself is the tab default.
	| { kind: 'svg'; to: 'png' | 'ico' }
	| { kind: 'video'; container: 'mp4' | 'webm' | 'mov' | 'gif' }
	| { kind: 'audio'; output: 'mp3' | 'm4a' | 'wav' | 'ogg' }
	| { kind: 'font'; to: FontFormat }
	// Font-tab tools: 'subset' arrives on the Subset op with its defaults;
	// 'instance' additionally flips to a static-instance, keep-all-glyphs run.
	| { kind: 'font-op'; op: 'subset' | 'instance' }
	| { kind: 'pdf-op'; op: 'unlock' | 'protect' | 'merge' | 'pages' }
	// Longest-side cap across every image tab — the page's whole point, so
	// drops that re-route to their native tab (png → png) land configured.
	| { kind: 'resize'; maxDimension: number }
	// Universal image intake (/compress-image) — hosts on an image tab and
	// preconfigures nothing; the tab defaults (Auto format) are the point.
	| { kind: 'image-any' };

export interface ConverterEntry extends SeoEntry {
	/** Hosting tab — drives activeTab exactly like FORMATS entries. */
	format: FileFormat;
	feature: string;
	/** Applied by the page on navigation to this slug. */
	preset: ConverterPreset;
	/** FileUpload picker override (e.g. AVIF page on the jpg tab). */
	accept?: string;
	dropSubject?: string;
	dropHint?: string;
	/** Curated subset shown in the footer "Tools:" row (the layout appends TOOLS after it). */
	inFooter?: boolean;
}

// The two-step wording is deliberate: engines cache on first use, so only
// "run one, go offline, run another" is a truthful offline claim.
const PRIVACY_PROOF =
	' Want proof? Run one file through, switch your connection off, and run another — it still works.';

const PRIVACY_A =
	'Yes. Everything runs right in your browser — files are never uploaded, and the server only delivers this page. Close the tab and everything is gone.' +
	PRIVACY_PROOF;

// Same fact for questions phrased as "Are my files uploaded?" — the answer must
// open with "No", not "Yes". HOME uses the bare base: its "How do I know?" FAQ
// already carries the proof, and twice in a row reads canned.
const PRIVACY_NO_BASE =
	'No — everything runs right in your browser, and the server only delivers this page. Files never leave your device; close the tab and everything is gone.';
const PRIVACY_A_NO = PRIVACY_NO_BASE + PRIVACY_PROOF;

// The generic How-it-works trio talks quality/target-size — nonsense for
// fonts, so every font page overrides it (seo.test.ts enforces this).
const FONT_STEPS: [string, string, string] = [
	'Drop TTF, OTF, WOFF, WOFF2 or EOT files anywhere on the page — or click to browse.',
	'Pick the output format — the font tables are repackaged losslessly, never re-drawn.',
	'Convert, then download each font on its own or the whole batch as a ZIP.'
];

// Fonts are licensed software — every font page carries this answer verbatim.
const FONT_LICENSE_A =
	'Converting a font never changes its license. Many desktop licenses do not cover web embedding (and vice versa), so check yours before publishing a converted font. Fonts under the OFL or Apache licenses and fonts you made yourself are fine. Your file also never leaves your device — nothing is uploaded anywhere.';

// Subsetting/instancing MODIFIES the font — a stricter question than converting.
const FONT_LICENSE_SUBSET_A =
	'Subsetting is a modification of the font file, and licenses differ on it: many web-font licenses explicitly allow subsetting for performance, open licenses (OFL, Apache) allow it, and some commercial desktop licenses forbid modifications entirely. Check yours before shipping the result. Your file never leaves your device — nothing is uploaded anywhere.';

export const FORMATS: (SeoEntry & { format: FileFormat })[] = [
	{
		format: 'jpg',
		path: '/compress-jpg',
		ogImage: '/og/compress-jpg.jpg',
		label: 'JPG',
		title: 'Compress JPG (JPEG) Online — Private, No Upload | Compress Pro',
		description:
			'Shrink JPG (JPEG) photos right in your browser. Set a quality or a target size like 500 KB. No uploads — files stay on your device. Free & private.',
		h1: 'Compress JPG images.',
		tagline: 'Smaller JPG photos in your browser — nothing is uploaded.',
		intro:
			'Shrink JPG (JPEG) photos right here in your browser. Pick a quality, or name a target size like 500 KB and let the tool find the best quality that fits. Nothing is uploaded — your photos never leave your device. Free, with no ads, no accounts and no watermarks.',
		faq: [
			{
				q: 'Is it safe to compress private photos here?',
				a:
					PRIVACY_A +
					' Compressing also strips hidden metadata — EXIF, GPS location and camera details never reach the output.'
			},
			{
				q: 'Does compressing a JPG lose quality?',
				a: 'JPG is a lossy format, so re-encoding trades some detail for size. Around quality 80 the difference is usually invisible — use the built-in before/after compare to judge for yourself.'
			},
			{
				q: 'Can I hit an exact file size like 500 KB?',
				a: 'Yes. Switch to target-size mode and enter a limit — the tool searches for the highest quality that stays under it, which is perfect for upload forms with size caps.'
			},
			{
				q: 'Can I resize photos at the same time?',
				a: 'Yes — set a longest-side cap and images are downscaled before encoding. For phone photos this is often the single biggest saving.'
			}
		],
		guide: [
			{
				heading: 'How JPG quality works',
				paragraphs: [
					'JPG quality is not a percentage of anything — it steers how aggressively fine detail is discarded, and file size responds exponentially. The compression here is tuned to pack more into every quality point than a typical photo app manages. Around quality 80, most photos are visually indistinguishable from the original at half the size or less; below 60, smooth gradients start to band and fine texture smears. If the photo is bound for the web, [JPG to WebP](/jpg-to-webp) buys another 25–35% at the same visual quality.'
				]
			},
			{
				heading: 'Recommended quality by use',
				table: {
					columns: ['Use', 'Quality'],
					rows: [
						['Web pages and blogs', '75–80'],
						['Email and chat photos', '70'],
						['Print and archives', '90–95'],
						['Thumbnails', '60']
					]
				}
			},
			{
				heading: 'Hitting an exact size',
				paragraphs: [
					'Upload forms don’t speak quality, they speak kilobytes — switch to target-size mode and type the limit (say 500 KB). The tool searches quality until the file fits and tells you honestly when it can’t. If “Allow downscaling” is on, dimensions shrink as a last resort, never below 320 px on the longest side. Prefer to control dimensions yourself? The [image resizer](/resize-image) caps the longest side exactly. And for the classic form limit, the [compress JPG to 100 KB](/compress-jpg-to-100kb) page arrives with the cap already typed in.'
				]
			}
		],
		related: ['/remove-exif', '/jpg-to-webp', '/jpg-to-pdf', '/compress-png']
	},
	{
		format: 'png',
		path: '/compress-png',
		ogImage: '/og/compress-png.jpg',
		label: 'PNG',
		title: 'Compress PNG Online — Private, No Upload | Compress Pro',
		description:
			'Compress PNG images in your browser — fully lossless or with smart color reduction, resizing and target file size. No uploads, no accounts. Free and private.',
		h1: 'Compress PNG images.',
		tagline: 'Lossless or lossy — your PNGs never leave your browser.',
		intro:
			'Compress PNG images right in your browser. Keep it fully lossless, or allow smart color reduction for dramatically smaller files that still look sharp. Nothing is uploaded — files stay on your device. Free to use, with no ads, no sign-up and no daily limits.',
		faq: [
			{
				q: 'Is it safe to compress private images here?',
				a:
					PRIVACY_A +
					' Compressing also strips hidden metadata — EXIF, GPS location and camera details never reach the output.'
			},
			{
				q: 'Is PNG compression lossless or lossy?',
				a: 'Both, your choice. At quality 100 pixels are untouched — pure lossless. Below that, colors are reduced to a smaller, optimized palette first, which is much smaller and usually indistinguishable for screenshots and graphics.'
			},
			{
				q: 'When should I convert a PNG to WebP or JPG instead?',
				a: 'PNG is best for graphics, screenshots and anything needing transparency. For photographic content, converting to JPG or WebP via the output format option is usually far smaller.'
			},
			{
				q: 'Can I target an exact file size?',
				a: 'Yes — target-size mode finds the strongest compression that fits under a limit you set, and you can cap dimensions to downscale large screenshots.'
			}
		],
		guide: [
			{
				heading: 'Lossless vs lossy PNG',
				paragraphs: [
					'At quality 100 pixels are untouched: metadata is stripped and the data is simply repacked more efficiently — a true lossless pass, typically 10–30% smaller. Below 100, colors are first reduced to an optimized palette, which routinely cuts 60–80% on screenshots and UI graphics with no visible difference.'
				]
			},
			{
				heading: 'What shrinks, and by how much',
				table: {
					columns: ['Source', 'Expected saving'],
					rows: [
						['Screenshots & UI graphics', '60–80% with the lossy palette'],
						['Logos and icons', '30–60%'],
						['Photos saved as PNG', '50–80% — or convert to JPG/WebP'],
						['Already-optimized PNGs', 'A few percent, lossless']
					]
				}
			},
			{
				heading: 'When WebP beats PNG',
				paragraphs: [
					'PNG is the right format for pixel-perfect graphics that must stay lossless. But if the image is going on a web page, WebP holds the same picture — transparency included — at a fraction of the size. The [PNG to WebP](/png-to-webp) converter keeps transparency intact; for photos that ended up as PNG by accident, [PNG to JPG](/png-to-jpg) is the bigger win.'
				]
			}
		],
		related: ['/png-to-webp', '/png-to-jpg', '/compress-jpg', '/compress-svg']
	},
	{
		format: 'webp',
		path: '/compress-webp',
		ogImage: '/og/compress-webp.jpg',
		label: 'WebP',
		title: 'Compress WebP Online — Private, No Upload | Compress Pro',
		description:
			'Compress WebP images — even animated ones — right in your browser. Quality or target-size modes, resizing, JPG/PNG conversion. No uploads. Free and private.',
		h1: 'Compress WebP images.',
		tagline: 'Still or animated — re-encoded locally, never uploaded.',
		intro:
			'Compress WebP images — including animated ones — right here in your browser. Lower the quality, hit a target size, resize, or convert to JPG or PNG. Nothing is uploaded — files never leave your device.',
		faq: [
			{
				q: 'Is it safe to compress private images here?',
				a:
					PRIVACY_A +
					' Compressing also strips hidden metadata — EXIF, GPS location and camera details never reach the output.'
			},
			{
				q: 'Do animated WebP files stay animated?',
				a: 'Yes — animated WebP is re-encoded frame by frame and stays animated. Resizing works on animations too.'
			},
			{
				q: 'Can I convert JPG or PNG to WebP?',
				a: 'Yes. Drop a JPG or PNG on its tab and pick WebP as the output format — WebP is typically 25–35% smaller than JPG at the same visual quality.'
			},
			{
				q: 'Can I target an exact file size?',
				a: 'Yes — switch to target-size mode and the tool finds the highest quality that fits under your limit.'
			}
		],
		guide: [
			{
				heading: 'Still and animated WebP',
				paragraphs: [
					'The tool handles both: still WebP is re-encoded at maximum effort, and animated WebP is processed frame by frame with timing preserved. Quality 100 switches to lossless mode — pixels survive exactly, which matters for graphics; anything lower is lossy and tuned for photos.'
				]
			},
			{
				heading: 'Quality guide',
				table: {
					columns: ['Use', 'Quality'],
					rows: [
						['Web photos', '75'],
						['Graphics with sharp edges', '85–90'],
						['Chat stickers & previews', '60'],
						['Pixel-perfect graphics', '100 (lossless)']
					]
				}
			},
			{
				heading: 'WebP vs JPG vs AVIF',
				paragraphs: [
					'WebP typically lands 25–35% under JPG at matched quality and supports transparency and animation, which JPG can’t. AVIF squeezes photos harder still but takes longer and enjoys less support in older software. The Auto format on this tab tries each format per image and keeps the smallest result, so you rarely have to choose by hand. And when a file must open outside the web — older editors, upload forms — [WebP to JPG](/webp-to-jpg) makes it universal.'
				]
			}
		],
		related: ['/webp-to-jpg', '/webp-to-png', '/compress-jpg', '/compress-gif']
	},
	{
		format: 'gif',
		path: '/compress-gif',
		ogImage: '/og/compress-gif.jpg',
		label: 'GIF',
		title: 'Compress GIF Online — Keep Animation, No Upload | Compress Pro',
		description:
			'Compress animated GIFs right in your browser. Keep the animation, resize, or hit a target size. No uploads — GIFs never leave your device. Free & private.',
		h1: 'Compress GIFs.',
		tagline: 'Shrink GIFs in your browser — they stay animated & local.',
		intro:
			'Compress animated GIFs entirely in your browser. Animations stay animated — frames are optimized, colors reduced, and you can resize or aim for a target size. Nothing is uploaded — GIFs never leave your device.',
		faq: [
			{ q: 'Is it safe to compress private GIFs here?', a: PRIVACY_A },
			{
				q: 'Will my GIF stay animated?',
				a: 'Yes — the animation is optimized in place (duplicate frames, color palette) without being flattened to a single frame.'
			},
			{
				q: 'How does GIF compression actually shrink the file?',
				a: 'Mostly by reducing colors and storing only what changes between frames. Lower quality means fewer colors; resizing the GIF shrinks it further.'
			},
			{
				q: 'Can I target an exact file size?',
				a: 'Yes — target-size mode tries increasingly strong settings until the GIF fits under your limit.'
			}
		],
		guide: [
			{
				heading: 'Why GIFs are huge',
				paragraphs: [
					'GIF predates modern video: every frame is stored as a full picture with no motion compression, and colors cap at 256. The tool attacks what it can — dropping duplicate frames, cropping unchanged regions, tightening palettes — but a GIF stays an order of magnitude heavier than the same clip as MP4.'
				]
			},
			{
				heading: 'Settings that matter',
				table: {
					columns: ['Lever', 'Effect'],
					rows: [
						['Quality slider', 'Lossy re-encode and tighter palette — the biggest win'],
						['Max dimension', 'Halving dimensions roughly quarters the file'],
						['Shorter clip', 'Fewer frames — trim before converting if you can']
					]
				}
			},
			{
				heading: 'Or stop using GIF',
				paragraphs: [
					'If the destination plays video, convert instead of compressing: the [GIF to MP4](/gif-to-mp4) converter produces a silent clip that is usually 90% smaller and looks better. Keep GIF for the places that genuinely require it — READMEs, docs and pickers that reject video files.'
				]
			}
		],
		related: ['/compress-webp', '/compress-video']
	},
	{
		format: 'heic',
		path: '/compress-heic',
		ogImage: '/og/compress-heic.jpg',
		label: 'HEIC',
		title: 'Compress HEIC Photos — Private, No Upload | Compress Pro',
		description:
			'Compress iPhone HEIC photos in your browser — pick a quality or an exact target size and export as JPG, PNG, WebP or AVIF. No uploads. Free and private.',
		h1: 'Compress HEIC photos.',
		tagline: 'Shrink iPhone HEIC photos locally — nothing is uploaded.',
		intro:
			'Compress iPhone HEIC photos right in your browser. Browsers can open HEIC but not save it, so compressed photos are exported as JPG, PNG, WebP, or AVIF — pick a quality or an exact target size like 500 KB. Nothing is uploaded; your photos never leave your device.',
		faq: [
			{ q: 'Is it safe to compress iPhone photos here?', a: PRIVACY_A },
			{
				q: 'Why does my compressed HEIC come out as JPG or WebP?',
				a: 'Browsers can decode HEIC but cannot encode it, so the result is written in a universal format instead. That is usually what you want anyway — the output opens everywhere, not just on Apple devices.'
			},
			{
				q: 'How much smaller will HEIC photos get?',
				a: 'HEIC is already heavily compressed, so at equal quality expect modest savings — the big wins come from setting a longest-side cap or a target size, which is perfect for shrinking 4 MB camera shots to a few hundred KB.'
			},
			{
				q: 'Can I make photos fit under an upload limit?',
				a: 'Yes — switch to target-size mode and enter the limit; the tool finds the best quality that stays under it for every photo in the batch.'
			}
		],
		guide: [
			{
				heading: 'What HEIC is',
				paragraphs: [
					'HEIC is Apple’s space-saving photo format — the iPhone default since iOS 11. It packs the same photo into roughly half a JPG’s bytes, which is why your camera roll uses it, and why so many upload forms, Windows apps and older tools still refuse it.'
				]
			},
			{
				heading: 'Compress it or convert it?',
				paragraphs: [
					'If the photo stays in the Apple ecosystem, compressing HEIC keeps the efficient format — this tab simply re-encodes it smaller. If it needs to go anywhere else, [HEIC to JPG](/heic-to-jpg) is the pragmatic move: universally readable, slightly larger. Either way the work happens on your device — iPhone photos are exactly the kind of thing that shouldn’t tour a stranger’s server.'
				]
			},
			{
				heading: 'Quality picks',
				table: {
					columns: ['Use', 'Quality'],
					rows: [
						['Share within the Apple world', '75'],
						['Long-term storage', '85'],
						['Squeeze a full camera roll', '65 — or set a target size']
					]
				}
			}
		],
		related: ['/heic-to-jpg', '/compress-jpg', '/resize-image']
	},
	{
		format: 'svg',
		path: '/compress-svg',
		ogImage: '/og/compress-svg.jpg',
		label: 'SVG',
		title: 'Compress SVG Online — Private, No Upload | Compress Pro',
		description:
			'Minify SVG files right in your browser: strip metadata, comments and editor junk, round coordinates. No uploads — your artwork never leaves your device.',
		h1: 'Compress SVGs.',
		tagline: 'Smaller SVG files in your browser — nothing is uploaded.',
		intro:
			'Minify SVG files entirely in your browser: strip comments, metadata and editor junk, clean up IDs and round coordinates to fewer decimals. Your artwork is never uploaded — it never leaves your machine. Need pixels instead? The output format switch renders your SVG to PNG at any size, or straight to a multi-size ICO favicon.',
		faq: [
			{ q: 'Is it safe to optimize proprietary artwork here?', a: PRIVACY_A },
			{
				q: 'Is a minified SVG still editable?',
				a: 'Yes — the output is still plain, valid SVG. Comments, metadata and redundant precision are gone, but you can reopen it in any editor.'
			},
			{
				q: 'Will minification change how my SVG looks?',
				a: 'With the default settings, no — they are visually safe. Aggressive mode and low precision can shift hairline details, so check the preview for intricate artwork.'
			},
			{
				q: 'How much smaller do SVGs get?',
				a: 'Exports from design tools often shrink 30–70%, since editors embed metadata and overly precise coordinates that the tool safely removes.'
			}
		],
		guide: [
			{
				heading: 'What gets removed',
				paragraphs: [
					'SVGs exported from Figma, Illustrator or Inkscape carry editor metadata, comments, hidden layers, default attributes and coordinates with absurd precision. The tool strips what doesn’t render and rewrites what does — same picture, a fraction of the file. And because SVG is text, the wins compound when your website serves it compressed. If the same artwork also needs a favicon, [SVG to ICO](/svg-to-ico) builds one straight from the vector.'
				]
			},
			{
				heading: 'Precision, explained',
				paragraphs: [
					'Coordinate precision is the main size dial: each extra decimal adds bytes to every point of every path. Three decimals is beyond visual perception for screen graphics; simple icons survive two. Lower it until something visibly shifts, then step back one.'
				]
			},
			{
				heading: 'Safe vs aggressive optimizations',
				paragraphs: [
					'The default toggles — comments, metadata, ID cleanup, dimension removal with the viewBox kept — are safe for virtually every file. The aggressive pass merges paths and collapses groups: usually fine for static icons, but test SVGs that are styled from CSS or animated through their IDs and classes, because collapsing can rename what your code targets.'
				]
			}
		],
		related: ['/compress-png', '/svg-to-png', '/svg-to-ico']
	},
	{
		format: 'pdf',
		path: '/compress-pdf',
		ogImage: '/og/compress-pdf.jpg',
		label: 'PDF',
		title: 'Compress PDF Online — No Upload, 100% Private | Compress Pro',
		description:
			'Reduce PDF file size right in your browser. Choose a preset or a target size like 2 MB. No uploads — documents never leave your device. Free & private.',
		h1: 'Compress PDFs.',
		tagline: 'Shrink PDFs in your browser — files are never uploaded.',
		intro:
			'Compress PDF files right in your browser — no upload, no waiting on a server. Pick a compression level or a target size like 2 MB — and merge PDFs, extract or remove pages, or convert between PDFs and images with the same tool. Documents never leave your device.',
		faq: [
			{
				q: 'Is it safe to compress confidential PDFs here?',
				a: 'Yes — this is the point of the tool. Compression runs entirely on your own device; documents are never uploaded and no server ever sees them. Close the tab and nothing remains. Want proof? Run one document through, switch your connection off, and run another — it still works.'
			},
			{
				q: 'How small can a PDF get?',
				a: 'It depends on what is inside. Scanned or image-heavy PDFs shrink dramatically because images are downsampled and re-encoded; text-only PDFs are already compact.'
			},
			{
				q: 'Can I hit an exact size like 2 MB?',
				a: 'Yes — target-size mode tries increasingly strong settings until the output fits under your limit, ideal for portals that cap uploads.'
			},
			{
				q: 'Is there a file size limit?',
				a: 'No hard limit — processing is bounded by your device’s memory. Very large files (200 MB+) work, they just take longer. There are no artificial limits either: no daily caps, no ads, no premium tier.'
			}
		],
		guide: [
			{
				heading: 'Choosing a preset',
				paragraphs: [
					'Each preset trades image sharpness for size by downsampling the pictures inside the PDF — text always stays crisp, because it is vector data that costs almost nothing.'
				],
				table: {
					columns: ['Preset', 'Image resolution', 'Best for'],
					rows: [
						['Low', '300 DPI', 'Archival copies and print — barely touched'],
						['Medium', '150 DPI', 'The all-round default: email, sharing, filing'],
						['High', '120 DPI', 'Web publishing and internal documents'],
						['Ultra', '72 DPI', 'Screen-only reading, big scans'],
						['Extreme', '50 DPI', 'When only the size limit matters']
					]
				}
			},
			{
				heading: 'Common upload limits — and how to hit them',
				paragraphs: [
					'Most email providers cap attachments around 25 MB — and because attachments are re-encoded for transport, a file should really stay under ~19 MB to send reliably. Government portals, job applications and e-invoicing systems are stricter still, typically 2–5 MB per document.',
					'Instead of guessing which preset gets you there, switch to target-size mode and type the limit itself (say 2 MB): the tool keeps trying stronger settings until the output fits, and tells you honestly if the target is impossible. If several documents must travel together, [merge them](/merge-pdf) first and compress the combined file; if only a few pages matter, [split the PDF](/split-pdf) and send just those.'
				]
			},
			{
				heading: 'Scanned vs. text-only PDFs',
				paragraphs: [
					'Scanned documents shrink dramatically — every page is a photograph, so downsampling and re-encoding routinely cuts 80–90% of the size. Digitally created, text-only PDFs are already compact; if yours barely shrinks, it was efficient to begin with. Image-heavy presentations sit in between and respond very well to the Medium and High presets.'
				]
			}
		],
		related: ['/pdf-to-jpg', '/jpg-to-pdf', '/merge-pdf', '/zip-files']
	},
	{
		format: 'video',
		path: '/compress-video',
		ogImage: '/og/compress-video.jpg',
		label: 'Video',
		title: 'Compress Video Online — Private, No Upload | Compress Pro',
		description:
			'Shrink MP4, MOV and WebM videos right in your browser. Hit a target size like 25 MB for email or Discord. No uploads — videos never leave your device.',
		h1: 'Compress videos.',
		tagline: 'MP4, MOV & WebM compressed on-device — nothing uploaded.',
		intro:
			'Compress and convert videos entirely in your browser — nothing is uploaded, so it’s fast and private. Drop an MP4, MOV, WebM, or MKV, pick a quality or name a target size like 25 MB, and export as MP4 for universal playback or WebM for smaller files. Audio is kept untouched whenever the format allows. Your videos never leave your device — and there is no watermark, no ad break and no premium tier.',
		feature: 'Compress MP4, MOV and WebM video to a target size',
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
		],
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
			}
		],
		related: ['/compress-mp4', '/mov-to-mp4', '/webm-to-mp4', '/mp4-to-webm']
	},
	{
		format: 'audio',
		path: '/compress-audio',
		ogImage: '/og/compress-audio.jpg',
		label: 'Audio',
		feature: 'Compress & Convert audio',
		title: 'Compress Audio Online — MP3, M4A, WAV | Compress Pro',
		description:
			'Compress MP3 and convert audio between MP3, M4A, WAV and OGG in your browser. Extract audio from video too — private, free, files never uploaded.',
		h1: 'Compress & Convert audio.',
		tagline: 'Shrink or convert audio locally — MP3, M4A, WAV and OGG.',
		intro:
			'Compress audio files or convert them between MP3, M4A, WAV and OGG — everything encodes in your browser, and nothing is uploaded. Drop any audio file, or a video to have its audio track extracted, then pick a format and a bitrate or a target size. Free, with no ads and no length limits.',
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
				a: 'WAV stores raw uncompressed samples — roughly 10 MB per stereo minute. Use it when a tool insists on WAV input or for editing; for listening and sharing, MP3/M4A/OGG sound identical at a tenth of the size.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
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
				heading: 'MP3, M4A, OGG or WAV?',
				paragraphs: [
					'MP3 plays absolutely everywhere and is the safe default. M4A (AAC) sounds slightly better at the same bitrate and suits Apple ecosystems. OGG squeezes best at low bitrates but some players still shrug at it. WAV is uncompressed — a format for editing, not sharing, at roughly 10 MB per minute of stereo. Starting from a video instead? [MP4 to MP3](/mp4-to-mp3) pulls the audio track out directly.'
				]
			},
			{
				heading: 'Target size from duration',
				paragraphs: [
					'Because audio bitrate is constant, target-size mode can be exact: it divides your cap by the duration and picks the bitrate that fits, between 32 and 320 kbps. A 40-minute recording into 25 MB works out around 80 kbps — fine for speech, rough for music — and the math tells you honestly what’s possible.'
				]
			}
		],
		related: ['/mp4-to-mp3', '/wav-to-mp3', '/compress-video']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/font-converter',
		ogImage: '/og/font-converter.jpg',
		label: 'Fonts',
		feature: 'Convert fonts — TTF, OTF, WOFF & WOFF2',
		title: 'Font Converter — TTF, OTF, WOFF, WOFF2 Online | Compress Pro',
		description:
			'Convert fonts between TTF, OTF, WOFF and WOFF2 right in your browser. Lossless repackaging — glyphs, kerning and hinting survive. Free, nothing uploaded.',
		h1: 'Convert fonts.',
		tagline: 'TTF, OTF, WOFF & WOFF2 — converted right in your browser.',
		intro:
			'Convert fonts between TTF, OTF, WOFF, WOFF2 and even legacy EOT — entirely in your browser. These formats are different wrappers around the same font tables, so the conversion is true repackaging: glyphs, kerning and hinting come through untouched, and your font file never touches a server.',
		faq: [
			{
				q: 'Is the conversion really lossless?',
				a: 'Yes. TTF/OTF, WOFF, WOFF2 and EOT are containers around the same font tables — converting unwraps one and wraps another, so glyphs, spacing, kerning and hinting are preserved. The only exception the WOFF2 spec itself demands: digital signatures (DSIG) are dropped, and you will see a note when that happens.'
			},
			{
				q: 'Can it turn TTF outlines into OTF outlines (or back)?',
				a: 'No, deliberately. TTF and OTF store letterforms with different curve math, and converting between them degrades hinting and can distort shapes — so if you ask for TTF but the font contains OTF-style (CFF) outlines, it is saved as .otf, with a note. Same font, honest extension, zero quality loss.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_A },
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'Which format goes where',
				paragraphs: [
					'All four formats carry the same glyphs — they differ in compression and in who can read them. For websites, [TTF to WOFF2](/ttf-to-woff2) is the conversion that matters; for installing a downloaded web font, [WOFF2 to TTF](/woff2-to-ttf) goes the other way.'
				],
				table: {
					columns: ['Format', 'Use it for', 'Notes'],
					rows: [
						['WOFF2', 'Websites (@font-face)', 'Smallest — Brotli; all modern browsers'],
						['WOFF', 'Very old browsers', 'zlib — larger than WOFF2'],
						['TTF / OTF', 'Installing on desktop', 'What Font Book & Windows expect'],
						['EOT', 'Internet Explorer 6–8', 'Legacy only — skip it today']
					]
				}
			},
			{
				heading: 'Why fonts deserve local conversion',
				paragraphs: [
					'Fonts are licensed software, and many licenses forbid passing the files to third parties — which is exactly what uploading to a converter site does. Here the conversion runs in your browser: the font never leaves your machine, and there is nothing on a server to leak, cache or crawl.'
				]
			}
		],
		related: ['/ttf-to-woff2', '/woff2-to-ttf', '/subset-font']
	},
	{
		format: 'zip',
		path: '/zip-files',
		ogImage: '/og/zip-files.jpg',
		label: 'ZIP',
		feature: 'Create & extract ZIP archives',
		title: 'Create & Extract ZIP Files Online — Private | Compress Pro',
		description:
			'Create ZIP archives from any files or extract existing ones — entirely in your browser. No upload, no size caps, no sign-up. Free, private and fast.',
		h1: 'Zip & Unzip files.',
		tagline: 'Zip and unzip files locally — nothing ever gets uploaded.',
		intro:
			'Bundle any files into one archive.zip, or drop a ZIP and pull its contents out — each file becomes its own download. Everything runs in your browser, so even huge archives never leave your machine.',
		faq: [
			{
				q: 'Why do my photos barely shrink in a ZIP?',
				a: 'JPGs, PNGs, videos and PDFs are already compressed — ZIP\u2019s compression can only shave a percent or two off them. ZIP shines for text, code, spreadsheets and for bundling many files into one attachment.'
			},
			{
				q: 'Is there a size limit?',
				a: 'No server means no upload cap — the practical limit is your device\u2019s memory. Multi-gigabyte archives work, they just take a moment.'
			},
			{
				q: 'Can it open password-protected ZIPs?',
				a: 'Not yet — encrypted archives are declined with a clear message rather than producing broken files.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'Compression levels',
				table: {
					columns: ['Level', 'What it does'],
					rows: [
						['Store', 'No compression — instant, right for already-compressed files'],
						['Fast', 'Light compression — quick, modest savings'],
						['Balanced', 'The usual default'],
						['Max', 'Smallest output, noticeably slower on big batches']
					]
				}
			},
			{
				heading: 'What actually compresses',
				paragraphs: [
					'ZIP compression loves redundancy: text, code, CSVs, logs and office documents often shrink 60–90%. Photos, video and audio are already compressed — zipping them mostly just bundles bytes, so pick Store and save the time. A mixed folder lands somewhere in between, and the per-file rows show exactly where the savings came from. When the contents themselves need to shrink, run them through the [image](/compress-jpg), [video](/compress-video) or [PDF](/compress-pdf) compressors first — then Store the results.'
				]
			},
			{
				heading: 'One archive, or files out of one',
				paragraphs: [
					'Zipping shines when the point is a single attachment: a project folder, a batch of scans, a handoff. Extraction works the other way — drop a ZIP and every file inside becomes its own row, downloadable individually or all at once, without the archive ever leaving your machine.'
				]
			}
		],
		related: ['/compress-pdf', '/compress-jpg']
	},
	{
		format: 'exif',
		path: '/remove-exif',
		ogImage: '/og/remove-exif.jpg',
		label: 'EXIF',
		title: 'Remove EXIF Data Online — Private, No Upload | Compress Pro',
		description:
			'See the GPS location, camera and dates hidden in your photos — and strip them in your browser. Lossless, pixels untouched, nothing uploaded. Free.',
		h1: 'Remove EXIF data.',
		tagline: 'GPS, camera & date wiped locally — pixels stay untouched.',
		feature: 'Remove EXIF metadata and GPS location from photos',
		intro:
			'Photos carry more than pixels: GPS coordinates of where they were taken, the exact time, your camera or phone model. Drop a JPG, PNG, or WebP here to see what your files reveal — then strip it in one click. Removal is lossless byte surgery: metadata segments are cut out without re-encoding, so pixels stay exactly identical. Orientation is preserved so phone photos never turn sideways, and nothing is ever uploaded.',
		faq: [
			{
				q: 'What do my photos reveal about me?',
				a: 'Often more than you think: the exact GPS coordinates of your home or workplace, timestamps, device model, even editing software. This tool lists what it found in each file — GPS, camera, dates — as it wipes it.'
			},
			{
				q: 'Are my photos uploaded to be cleaned?',
				a: 'No — everything runs right in your browser, which is the whole point of a privacy tool: photos with your GPS location inside never touch a server. Close the tab and everything is gone. Want proof? Clean one photo, switch your connection off, and clean another — it still works.'
			},
			{
				q: 'Is removing EXIF data lossless?',
				a: 'Completely. Metadata lives in separate segments of the file, so they are removed byte-for-byte without re-encoding the image. Pixels stay identical — verify with the built-in compare — and files only get smaller. Orientation is written back as the only remaining field, so phone photos keep displaying upright everywhere.'
			},
			{
				q: 'Is the color profile removed too?',
				a: 'Not by default — the ICC profile affects how colors render, so it is kept. Enable “Also remove color profile” to strip it as well; EXIF, GPS, XMP and comments are always removed.'
			}
		],
		guide: [
			{
				heading: 'What hides inside a photo',
				paragraphs: [
					'Cameras and phones write far more than pixels. This is what a typical photo quietly carries — and what this tool lists per file as it wipes it:'
				],
				table: {
					columns: ['Data', 'Example', 'Why it matters'],
					rows: [
						['GPS location', '46.0511°N, 14.5051°E', 'Reveals your home, workplace or routine'],
						['Timestamps', 'Taken 2026-05-14, 18:42', 'Places you somewhere at an exact time'],
						['Device model', 'Apple iPhone 15 Pro', 'Narrows down who took the photo'],
						[
							'Editing history (XMP)',
							'Lightroom edits, creator name',
							'Can carry names and software trails'
						],
						[
							'Comments & text chunks',
							'Notes left by apps and tools',
							'Often forgotten, rarely reviewed'
						]
					]
				}
			},
			{
				heading: 'What gets removed — and what stays',
				paragraphs: [
					'Removal is byte surgery, not re-encoding: metadata segments are cut out and the image data is copied verbatim, so pixels stay byte-identical and files only get smaller.'
				],
				table: {
					columns: ['Item', 'What happens'],
					rows: [
						['EXIF — including GPS, camera, dates', 'Removed'],
						['XMP metadata (incl. extended)', 'Removed'],
						['Photoshop metadata', 'Removed'],
						['Comments & PNG text/time chunks', 'Removed'],
						['ICC color profile', 'Kept by default — toggle to remove'],
						['Orientation', 'Preserved, re-embedded as the only remaining field'],
						['Pixels', 'Byte-identical — completely lossless']
					]
				}
			},
			{
				heading: 'When should you strip metadata?',
				paragraphs: [
					'Any time a photo leaves your control with the file intact: selling something on a marketplace, posting to a forum or blog, sending originals by email or a cloud link. One honest caveat — big social networks usually strip EXIF on upload themselves, but messengers sending “as document”, email attachments, and most forums and marketplaces do not. The safe assumption is that metadata survives unless you removed it yourself. Photos that also need to be smaller can go through [Compress JPG](/compress-jpg) afterwards — compression writes a brand-new file, so metadata stays gone. iPhone HEIC photos get the same cleanup as a side effect of [converting to JPG](/heic-to-jpg).'
				]
			}
		],
		related: ['/compress-jpg', '/compress-png', '/compress-webp']
	}
];

export const HOME: SeoEntry = {
	format: null,
	path: '/',
	label: 'Home',
	title: 'Compress Images, Video & PDFs — Private, Free | Compress Pro',
	description:
		'Compress JPG, PNG, WebP, GIF, HEIC, SVG, PDF, video & audio entirely in your browser. No uploads, no ads, no limits — files never leave your device. Free.',
	h1: 'Compress anything.',
	tagline: 'Images, video, audio & PDFs — squeezed in your browser.',
	intro:
		'Compress Pro is a free, open-source set of compression tools that run entirely in your browser — no uploads, no ads, no accounts. Compress images, PDFs, video and audio, convert between formats, build ZIP archives, and strip photo metadata with the lossless EXIF remover that shows what your photos reveal. Everything happens right on your own device: there is no upload step, so there is no server to trust — and no upload wait, so even a huge video starts compressing the moment you drop it.',
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
					['Offline', 'Needs a connection', 'Works offline once loaded']
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
			a: 'Images (JPG, PNG, WebP, GIF, HEIC, AVIF, SVG), PDFs, MP4/WebM/MOV video and MP3/WAV/M4A/OGG audio — plus ZIP archives, converters between formats like HEIC to JPG or MOV to MP4, and a lossless EXIF remover for photo metadata.'
		},
		{
			q: 'Will compression make my files look worse?',
			a: 'Only as much as you allow. Every tool has a quality control and a before/after compare, and target-size mode finds the best quality under a limit like 2 MB. Lossless modes (PNG, SVG, EXIF removal) don’t touch pixels at all.'
		}
	]
};

// Converter landing pages — same route/component as the format tabs, but each
// URL preconfigures the tool (tab + output) and carries its own crawlable copy.
export const CONVERTERS: ConverterEntry[] = [
	{
		format: 'heic',
		path: '/heic-to-jpg',
		ogImage: '/og/heic-to-jpg.jpg',
		label: 'HEIC → JPG',
		feature: 'Convert HEIC to JPG',
		preset: { kind: 'image', tab: 'heic', to: 'jpg' },
		inFooter: true,
		title: 'HEIC to JPG Converter — Private, In-Browser | Compress Pro',
		description:
			'Convert iPhone HEIC photos to JPG right in your browser — no uploads, no accounts. Batch-convert whole camera rolls, tune quality, download as a ZIP. Free.',
		h1: 'Convert HEIC to JPG.',
		tagline: 'iPhone HEIC to JPG in your browser — photos never leave.',
		intro:
			'Convert iPhone HEIC photos to JPG right here in your browser — not on a server. Drop a whole camera roll, pick a quality, and download everything as a ZIP. Your photos are never uploaded anywhere. If you want JPG output but smaller, set a target size like 500 KB and the tool finds the best quality that fits. Free, with no ads and no limit on how many photos you convert.',
		faq: [
			{
				q: 'Why won’t HEIC photos open on Windows or Android?',
				a: 'HEIC is Apple’s default camera format, but support elsewhere is patchy because the format requires special licensing. Converting to JPG makes photos open in every app, browser, and upload form.'
			},
			{ q: 'Is it safe to convert personal photos here?', a: PRIVACY_A },
			{
				q: 'Does HEIC to JPG reduce quality?',
				a: 'Slightly — both formats are lossy, so there is one re-encode. At the default quality 80 the difference is invisible in practice, and you can raise the slider to 90+ for prints.'
			},
			{
				q: 'Can I convert hundreds of photos at once?',
				a: 'Yes — drop them all, convert in one run, and use Download All to get a single ZIP. Everything is processed in parallel on your own device.'
			}
		],
		guide: [
			{
				heading: 'Which quality should I pick?',
				paragraphs: [
					'JPG quality is a trade-off dial, not a correctness setting — these are the values that work in practice for a typical 12 MP iPhone photo:'
				],
				table: {
					columns: ['Use', 'Quality', 'Typical size (12 MP)'],
					rows: [
						['Web, chat, social', '75–80', '≈ 0.5–1.5 MB'],
						['Prints and slideshows', '90', '≈ 2–4 MB'],
						['Archival master', '95+', '≈ 4–8 MB']
					]
				}
			},
			{
				heading: 'What about Live Photos?',
				paragraphs: [
					'Converting the HEIC gives you the still photo — the full-quality key frame. The motion part of a Live Photo is stored as a separate video file on your phone and is not inside the HEIC, so nothing is silently lost here; the moving version simply stays on your device.'
				]
			},
			{
				heading: 'Metadata is stripped — on purpose',
				paragraphs: [
					'The converter decodes your photo to raw pixels and writes a brand-new JPG, so EXIF metadata — including GPS location, device model and timestamps — does not travel into the output. Orientation is applied to the pixels first, so photos still display the right way up. For photos you are about to share publicly, that is a privacy feature, not a limitation. Want the photo to stay HEIC and only get smaller? [Compress HEIC](/compress-heic) keeps the format; for perfect pixels before editing, [HEIC to PNG](/heic-to-png) is the lossless route.'
				]
			}
		],
		related: ['/compress-heic', '/compress-jpg', '/jpg-to-pdf', '/heic-to-png']
	},
	{
		format: 'heic',
		path: '/heic-to-png',
		ogImage: '/og/heic-to-png.jpg',
		label: 'HEIC → PNG',
		feature: 'Convert HEIC to PNG',
		preset: { kind: 'image', tab: 'heic', to: 'png', quality: 100 },
		accept: 'image/heic,image/heif,.heic,.heif',
		dropSubject: 'HEIC files',
		dropHint: 'iPhone HEIC photos · decoded to PNG locally',
		inFooter: true,
		title: 'HEIC to PNG Converter — Lossless & Private | Compress Pro',
		description:
			'Convert iPhone HEIC photos to lossless PNG in your browser — batch whole albums, download as a ZIP, nothing uploaded. Ideal for editing and archiving.',
		h1: 'Convert HEIC to PNG.',
		tagline: 'iPhone HEIC decoded to lossless PNG — on your own device.',
		intro:
			'Convert iPhone HEIC photos straight to lossless PNG — everything runs in your browser, and the pixels read from the photo are exactly the pixels PNG stores. That makes PNG the right stop before editing or archiving: no second round of lossy compression on top of HEIC’s. Drop a whole album and download the set as a ZIP.',
		faq: [
			{
				q: 'Why PNG instead of JPG?',
				a: 'PNG stores the decoded photo losslessly, so nothing degrades before you edit or archive it. If the photo is just being shared or uploaded somewhere, JPG is far smaller and the more practical pick.'
			},
			{
				q: 'Will the PNG files be large?',
				a: 'Yes — expect several times the HEIC size. HEIC is one of the most efficient photo formats there is, and lossless PNG pays for its perfection in bytes. That trade is the point: perfect pixels for editing, not small files for sharing.'
			},
			{
				q: 'Is anything lost in the conversion?',
				a: 'No pixels are — the decode is exact and PNG is lossless. Metadata (EXIF, GPS) is stripped in the process, which for most people is a feature; rotation is applied so photos come out upright.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'PNG or JPG for iPhone photos',
				paragraphs: [
					'Pick PNG when the photo has work ahead of it — retouching, design mockups, archival copies — because every later save starts from perfect pixels. Pick [HEIC to JPG](/heic-to-jpg) when the photo just needs to open somewhere: a form, an old app, a website. JPG is the sharing format; PNG is the working format.'
				]
			},
			{
				heading: 'Size expectations, honestly',
				paragraphs: [
					'A 3 MB HEIC routinely becomes a 15–25 MB PNG. Nothing is wrong when that happens — HEIC spends a decade of clever engineering on making photos tiny, and PNG spends nothing. If the sizes hurt, convert to JPG at quality 85 instead, or keep HEIC and just [compress it](/compress-heic).'
				]
			}
		],
		related: ['/heic-to-jpg', '/compress-heic', '/compress-png']
	},
	{
		format: 'webp',
		path: '/webp-to-jpg',
		ogImage: '/og/webp-to-jpg.jpg',
		label: 'WebP → JPG',
		feature: 'Convert WebP to JPG',
		preset: { kind: 'image', tab: 'webp', to: 'jpg' },
		inFooter: true,
		title: 'WebP to JPG Converter — Free, No Upload | Compress Pro',
		description:
			'Convert WebP images to JPG in your browser. Transparency is flattened to white, batches download as a ZIP, and files are never uploaded anywhere. Free.',
		h1: 'Convert WebP to JPG.',
		tagline: 'WebP to JPG re-encoded locally — nothing ever uploaded.',
		intro:
			'Convert WebP images to JPG right in your browser — nothing is uploaded, files never leave your device. Handy for images saved from the web that older apps and upload forms refuse. Animated WebP converts to a single frame; transparency is flattened onto white. Batch-convert and grab everything as a ZIP.',
		faq: [
			{
				q: 'Why convert WebP to JPG?',
				a: 'WebP is everywhere on the web but not everywhere else — older photo editors, Office documents, and plenty of upload forms still expect JPG. Converting makes the image universally usable.'
			},
			{
				q: 'What happens to transparent areas?',
				a: 'JPG cannot store transparency, so transparent pixels are flattened onto a white background. If you need transparency, convert to PNG instead — that tool is one tab away.'
			},
			{
				q: 'Can I convert many WebP files at once?',
				a: 'Yes — drop a whole batch, convert in one run, and download all results as a single ZIP.'
			},
			{ q: 'Are my images uploaded during conversion?', a: PRIVACY_A_NO }
		],
		guide: [
			{
				heading: 'Why convert WebP to JPG',
				paragraphs: [
					'WebP is everywhere on the modern web, but the long tail of software lags: older photo editors, office suites, e-commerce and government upload forms, embedded viewers. JPG opens in all of them. Converting locally means the picture itself never goes anywhere — only the file format changes.'
				]
			},
			{
				heading: 'Transparency and animation',
				paragraphs: [
					'JPG supports neither. Transparent regions are flattened onto white during conversion — fine for photos, visible on logos, where [WebP to PNG](/webp-to-png) is the better route. Animated WebP keeps only its first frame as JPG; convert animations to GIF or video instead.'
				]
			},
			{
				heading: 'Quality picks',
				table: {
					columns: ['Use', 'Quality'],
					rows: [
						['General sharing', '80'],
						['Upload forms with size caps', 'Target size — type the cap'],
						['Archival copy', '90–95']
					]
				}
			}
		],
		related: ['/compress-webp', '/webp-to-png', '/avif-to-jpg']
	},
	{
		format: 'webp',
		path: '/webp-to-png',
		ogImage: '/og/webp-to-png.jpg',
		label: 'WebP → PNG',
		feature: 'Convert WebP to PNG',
		preset: { kind: 'image', tab: 'webp', to: 'png', quality: 100 },
		title: 'WebP to PNG Converter — Lossless, No Upload | Compress Pro',
		description:
			'Convert WebP to lossless PNG in your browser — transparency preserved, pixels untouched. Batch conversion with ZIP download. No uploads, no accounts. Free.',
		h1: 'Convert WebP to PNG.',
		tagline: 'WebP to lossless PNG in your browser — files stay local.',
		intro:
			'Convert WebP images to PNG entirely in your browser — opened and re-saved losslessly, all on your own device. Transparency survives intact and, at the default settings, pixels are preserved exactly. Nothing is uploaded; your files never leave your device.',
		faq: [
			{
				q: 'Why convert WebP to PNG?',
				a: 'PNG opens in every editor and pipeline ever made and keeps transparency — the safe choice when a tool, printer, or workflow does not accept WebP.'
			},
			{
				q: 'Is the conversion really lossless?',
				a: 'Yes — at the default quality 100 the decoded image is written to PNG without touching a pixel. Lowering the quality slider reduces colors to a smaller palette for much smaller (slightly lossy) PNGs.'
			},
			{
				q: 'Will the PNG be larger than the WebP?',
				a: 'Usually, especially for photos — PNG is a lossless format and cannot match lossy WebP sizes. That is the price of universal compatibility; for graphics the difference is smaller.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'Transparency is the point',
				paragraphs: [
					'Logos, stickers and UI cutouts ride on their transparency, and JPG destroys it — [WebP to JPG](/webp-to-jpg) flattens see-through pixels onto white. PNG keeps the alpha channel exactly, which makes it the safe export for anything that must sit on a colored background. If the result feels heavy, the [PNG compressor](/compress-png) shrinks it losslessly.'
				]
			}
		],
		related: ['/webp-to-jpg', '/compress-png', '/png-to-webp']
	},
	{
		format: 'jpg',
		path: '/avif-to-jpg',
		ogImage: '/og/avif-to-jpg.jpg',
		label: 'AVIF → JPG',
		feature: 'Convert AVIF to JPG',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept: 'image/avif,.avif',
		dropSubject: 'AVIF files',
		dropHint: 'AVIF only · multiple files supported',
		inFooter: true,
		title: 'AVIF to JPG Converter — Private, In-Browser | Compress Pro',
		description:
			'Convert AVIF images to JPG locally in your browser — perfect when an app or site cannot open AVIF yet. Batch support, ZIP download, zero uploads. Free.',
		h1: 'Convert AVIF to JPG.',
		tagline: 'AVIF decoded to JPG in your browser — nothing uploaded.',
		intro:
			'Convert AVIF images to JPG entirely in your browser — the conversion happens on your own device, with no upload step. AVIF is the newest image format on the web, which is exactly why older editors, viewers, and upload forms still reject it. Drop a batch, convert, and download everything as a ZIP.',
		faq: [
			{
				q: 'Why convert AVIF to JPG?',
				a: 'AVIF is excellent for the web but young — many editors, printers, older browsers, and upload forms cannot read it yet. JPG works absolutely everywhere.'
			},
			{
				q: 'How much quality is lost going AVIF to JPG?',
				a: 'One lossy re-encode happens. At the default quality 80 the difference is invisible for typical photos; raise the slider if you plan to edit the result further.'
			},
			{
				q: 'Can I resize or hit a target size while converting?',
				a: 'Yes — cap the longest side, pick an exact quality, or switch to target-size mode and name a limit like 500 KB.'
			},
			{ q: 'Do my AVIF files get uploaded?', a: PRIVACY_A_NO }
		],
		guide: [
			{
				heading: 'Why AVIF files get refused',
				paragraphs: [
					'AVIF is the youngest of the mainstream image formats — browsers adopted it quickly because it packs photos tighter than JPG and WebP, but the long tail of software did not: older photo editors, office suites, print shops and plenty of upload forms still shrug at it. Converting to JPG trades a little efficiency for a file that opens absolutely everywhere — and [Compress JPG](/compress-jpg) can then squeeze the result under any size cap.'
				]
			},
			{
				heading: 'Transparency and quality',
				paragraphs: [
					'AVIF can store transparency; JPG cannot, so see-through regions are flattened onto white during conversion. If transparency is load-bearing, pick PNG as the output format on the tab instead. Quality-wise, one lossy re-encode happens — invisible at quality 80 for typical photos — and the original AVIF on your disk stays untouched.'
				]
			},
			{
				heading: 'Quality picks',
				table: {
					columns: ['Use', 'Quality'],
					rows: [
						['Web and chat', '75–80'],
						['Print-bound photos', '90'],
						['Hard size limit', 'Target-size mode with the cap']
					]
				}
			}
		],
		related: ['/compress-jpg', '/jpg-to-webp', '/webp-to-jpg']
	},
	{
		format: 'png',
		path: '/png-to-jpg',
		ogImage: '/og/png-to-jpg.jpg',
		label: 'PNG → JPG',
		feature: 'Convert PNG to JPG',
		preset: { kind: 'image', tab: 'png', to: 'jpg' },
		inFooter: true,
		title: 'PNG to JPG Converter — Batch, No Upload | Compress Pro',
		description:
			'Convert PNG images to JPG right in your browser. Transparency flattens to white, photos get dramatically smaller, and nothing is uploaded. Free & private.',
		h1: 'Convert PNG to JPG.',
		tagline: 'PNG to JPG converted in your browser — files stay local.',
		intro:
			'Convert PNG images to JPG right here in your browser tab — nothing is uploaded. Photographic PNGs are often 5–10× smaller as JPG with no visible difference. Transparent regions are flattened onto white, since JPG cannot store transparency. Convert in batches and download the lot as a ZIP.',
		faq: [
			{
				q: 'When does PNG to JPG make sense?',
				a: 'For photographic content — photos exported as PNG are needlessly huge, and JPG stores them in a fraction of the size. Screenshots with sharp text and flat colors are usually better kept as PNG.'
			},
			{
				q: 'What happens to transparency?',
				a: 'JPG cannot store transparency, so transparent pixels are flattened onto a white background. Need transparency? Use the PNG to WebP converter instead.'
			},
			{
				q: 'Can I control the output size exactly?',
				a: 'Yes — pick a quality, or switch to target-size mode and enter a limit like 200 KB; the tool finds the best quality that fits under it.'
			},
			{ q: 'Is it safe for private images?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'Photos yes, screenshots maybe',
				paragraphs: [
					'The big savings apply to photographic content — gradients, textures, real-world scenes — where JPG routinely lands 5–10× smaller. Screenshots with sharp text and flat color panels are JPG’s weak spot: edges halo and small text fuzzes. For those, [PNG to WebP](/png-to-webp) keeps the crispness at a fraction of the size, transparency included.'
				]
			}
		],
		related: ['/compress-png', '/png-to-webp', '/compress-jpg']
	},
	{
		format: 'jpg',
		path: '/jpg-to-webp',
		ogImage: '/og/jpg-to-webp.jpg',
		label: 'JPG → WebP',
		feature: 'Convert JPG to WebP',
		preset: { kind: 'image', tab: 'jpg', to: 'webp' },
		title: 'JPG to WebP Converter — Smaller Files, Private | Compress Pro',
		description:
			'Convert JPG photos to WebP right in your browser — typically 25–35% smaller at the same visual quality. Batch conversion, ZIP download, no uploads. Free.',
		h1: 'Convert JPG to WebP.',
		tagline: 'JPG to WebP, typically 30% smaller — all in your browser.',
		intro:
			'Convert JPG photos to WebP right in your browser — no uploads, no accounts, files never leave your device. WebP typically lands 25–35% smaller than JPG at the same visual quality, which is why it is the default choice for fast websites. Batch-convert and download everything as a ZIP.',
		faq: [
			{
				q: 'Why convert JPG to WebP?',
				a: 'Smaller files at the same quality — usually 25–35% savings. Every modern browser supports WebP, so for websites it is nearly free page speed.'
			},
			{
				q: 'When should I stay with JPG?',
				a: 'When the image leaves the web: email attachments, older desktop software, print shops, and some upload forms still expect JPG. For maximum compatibility, JPG remains the safe bet.'
			},
			{
				q: 'Can I convert a whole folder and set an exact size?',
				a: 'Yes — drop the batch, optionally switch to target-size mode with a per-file limit, and download the results as one ZIP.'
			},
			{ q: 'Are photos uploaded to a server?', a: PRIVACY_A_NO }
		],
		guide: [
			{
				heading: 'Why websites serve WebP',
				paragraphs: [
					'The 25–35% saving is not marketing — WebP simply encodes photos tighter than a format from the early nineties can. On a website that compounds into faster pages, better search rankings and lower bandwidth on every single visit, which is why performance-minded sites converted their image libraries years ago.'
				]
			},
			{
				heading: 'When JPG should stay JPG',
				paragraphs: [
					'Off the web, JPG is still king: email attachments, print shops, older desktop software and plenty of upload forms refuse WebP. The practical setup is both — keep the JPG as the compatible master and serve WebP copies on your site. If the master itself is heavy, [Compress JPG](/compress-jpg) shrinks it without changing format.'
				]
			}
		],
		related: ['/compress-jpg', '/compress-webp', '/png-to-webp']
	},
	{
		format: 'png',
		path: '/png-to-webp',
		ogImage: '/og/png-to-webp.jpg',
		label: 'PNG → WebP',
		feature: 'Convert PNG to WebP',
		preset: { kind: 'image', tab: 'png', to: 'webp' },
		title: 'PNG to WebP Converter — Keep Alpha, No Upload | Compress Pro',
		description:
			'Convert PNG to WebP in your browser and keep full transparency. Graphics shrink dramatically, batches download as a ZIP, and nothing is uploaded. Free.',
		h1: 'Convert PNG to WebP.',
		tagline: 'PNG to WebP with transparency kept — converted locally.',
		intro:
			'Convert PNG images to WebP entirely in your browser — processed on your device, never uploaded. Unlike JPG, WebP keeps transparency fully intact, so logos, UI graphics, and stickers stay see-through while shrinking dramatically. Pick a quality or a target size, convert in batches, and download a ZIP.',
		faq: [
			{
				q: 'Why convert PNG to WebP?',
				a: 'Same image, much smaller file — graphics and screenshots often shrink 60–80%. WebP keeps transparency, so it replaces PNG on the web without visual compromise.'
			},
			{
				q: 'Is transparency preserved?',
				a: 'Yes — WebP fully supports transparency, so nothing is flattened. This is the key difference from converting to JPG.'
			},
			{
				q: 'Lossy or lossless — what am I getting?',
				a: 'The quality slider drives lossy compression, which is what makes files so small; at 90+ it is visually indistinguishable for most graphics. Judge with the built-in before/after compare.'
			},
			{ q: 'Do my files leave my device?', a: PRIVACY_A_NO }
		],
		guide: [
			{
				heading: 'Transparency without PNG’s weight',
				paragraphs: [
					'PNG pays for lossless perfection in bytes; WebP keeps the see-through parts — logos, UI cutouts, stickers — while compressing the rest like a modern format. Graphics routinely land 60–80% smaller with edges just as clean, which is why WebP replaced PNG as the default graphics format of the web.'
				]
			},
			{
				heading: 'Pick the quality by content',
				paragraphs: [
					'Screenshots and UI graphics look identical at quality 80–90; photographic PNGs tolerate less. Quality 100 keeps pixels exact when nothing may shift. And the trip is reversible — [WebP to PNG](/webp-to-png) decodes back to lossless PNG whenever an old tool insists on it.'
				]
			}
		],
		related: ['/compress-png', '/jpg-to-webp', '/webp-to-png']
	},
	{
		format: 'pdf',
		path: '/jpg-to-pdf',
		ogImage: '/og/jpg-to-pdf.jpg',
		label: 'JPG → PDF',
		feature: 'Convert JPG to PDF',
		preset: { kind: 'pdf-from-images' },
		inFooter: true,
		title: 'JPG to PDF Converter — Combine Images, Private | Compress Pro',
		description:
			'Combine JPG photos into a single PDF right in your browser — one page per image, in your order. Reorder pages, set JPEG quality, download. No uploads. Free.',
		h1: 'Convert JPG to PDF.',
		tagline: 'JPGs into one PDF, page per image — built in your browser.',
		intro:
			'Combine JPG photos into a single PDF entirely in your browser — the document is assembled on your device, and nothing is uploaded. Each image becomes one page sized exactly to the image, in the order you arrange with the list arrows. Other image types work too: PNG, WebP, GIF, and AVIF are re-encoded as JPEG pages, with transparency flattened to white.',
		faq: [
			{
				q: 'How are the PDF pages laid out?',
				a: 'One image per page, page size equal to the image’s pixel size, in your list order — use the arrows to reorder before converting. The result downloads as a single images.pdf.'
			},
			{
				q: 'Can I mix JPG with PNG or WebP in one PDF?',
				a: 'Yes — the dropzone accepts all common image types. Everything is re-encoded as JPEG inside the PDF; transparent areas turn white and animations keep their first frame.'
			},
			{
				q: 'How do I keep the PDF small?',
				a: 'Lower the JPG quality slider — it controls the re-encode of every page. Around 80 is visually clean and compact for photos.'
			},
			{ q: 'Are my photos uploaded to build the PDF?', a: PRIVACY_A_NO }
		],
		guide: [
			{
				heading: 'Page layout and ordering',
				paragraphs: [
					'Each image becomes one page sized exactly to its pixels — no cropping, no letterboxing, portrait and landscape mixing freely. The list order is the page order; rearrange with the row arrows before converting, and the result downloads as a single images.pdf.'
				]
			},
			{
				heading: 'Keeping the PDF small',
				paragraphs: [
					'The quality slider re-encodes every page as JPEG inside the document — 80 is visually clean for photos, and receipts tolerate less. If the finished PDF must hit a hard cap (a 2 MB portal limit, say), run it through [Compress PDF](/compress-pdf) in target-size mode as a second step.'
				]
			},
			{
				heading: 'Scans, receipts and forms',
				paragraphs: [
					'Phone photos of paperwork are this tool’s bread and butter: shoot the pages, drop them in order, convert, and send one document instead of eleven photos. For the cleanest result, crop the photos to the paper first and keep every page the same orientation — the PDF preserves exactly what you feed it.'
				]
			}
		],
		related: ['/compress-pdf', '/pdf-to-jpg', '/png-to-pdf', '/compress-jpg']
	},
	{
		format: 'pdf',
		path: '/png-to-pdf',
		ogImage: '/og/png-to-pdf.jpg',
		label: 'PNG → PDF',
		feature: 'Convert PNG to PDF',
		preset: { kind: 'pdf-from-images' },
		accept: 'image/png,.png',
		dropSubject: 'PNG files',
		dropHint: 'PNG images · combined into one PDF locally',
		inFooter: true,
		title: 'PNG to PDF — Turn Screenshots into One File | Compress Pro',
		description:
			'Turn PNG screenshots and graphics into a single PDF in your browser — one page per image, in your order. Nothing is uploaded or watermarked. Free.',
		h1: 'Convert PNG to PDF.',
		tagline: 'PNG screenshots into one PDF — assembled on your device.',
		intro:
			'Bundle PNG screenshots, scans or graphics into a single PDF without anything leaving your browser. Each PNG becomes one page sized to the image, in the order you arrange; transparent areas are flattened to white, since PDF pages have no transparency. Perfect for turning a screenshot trail into one shareable document.',
		faq: [
			{
				q: 'What happens to PNG transparency?',
				a: 'PDF pages are opaque, so transparent regions are flattened onto white — logos and UI screenshots come out looking like they would on paper. If you need transparency preserved, PDF isn’t the format for it.'
			},
			{
				q: 'How do I order the pages?',
				a: 'Pages follow the file list — use the row arrows to rearrange before converting. The result downloads as a single images.pdf with one PNG per page.'
			},
			{
				q: 'Why is the PDF bigger than my PNGs?',
				a: 'Pages are re-encoded as JPEG inside the PDF, which usually shrinks screenshots — but flat graphics with few colors can grow slightly. Lower the quality slider to trade sharpness for size; around 80 is a good screenshot setting.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'Screenshots to a single document',
				paragraphs: [
					'The classic use: a bug report, a chat export or a step-by-step walkthrough captured as a dozen screenshots. Drop them all, order them with the arrows, convert — and send one PDF instead of twelve attachments that arrive shuffled. Page size follows each image’s pixels, so nothing is cropped or letterboxed.'
				]
			},
			{
				heading: 'Keeping the PDF small',
				paragraphs: [
					'The quality slider re-encodes every page as JPEG inside the document. Screenshots tolerate 75–85 well; photographic PNGs can go lower. If the combined file still needs to hit a limit — a 2 MB application-portal cap, say — run the result through [Compress PDF](/compress-pdf) with target-size mode afterwards.'
				]
			}
		],
		related: ['/jpg-to-pdf', '/compress-pdf', '/compress-png']
	},
	{
		format: 'pdf',
		path: '/pdf-to-jpg',
		ogImage: '/og/pdf-to-jpg.jpg',
		label: 'PDF → JPG',
		feature: 'Convert PDF to JPG',
		preset: { kind: 'pdf-to-images', imageFormat: 'jpg' },
		inFooter: true,
		title: 'PDF to JPG Converter — Every Page, No Upload | Compress Pro',
		description:
			'Turn PDF pages into JPG images entirely in your browser. Choose 72–300 DPI and JPEG quality; multi-page PDFs download as a ZIP of images. No uploads. Free.',
		h1: 'Convert PDF to JPG.',
		tagline: 'PDF pages to JPG images — rendered 100% in your browser.',
		intro:
			'Turn PDF pages into JPG images without uploading the document anywhere — rendering happens entirely in your browser. Pick a resolution (72, 150, or 300 DPI) and a JPEG quality; every page becomes an image. Single-page PDFs download directly as a .jpg, multi-page ones as a ZIP with one image per page.',
		faq: [
			{
				q: 'Which DPI should I choose?',
				a: '72 DPI for screens and quick previews, 150 DPI as the all-round default, 300 DPI when the images must hold up in print. Higher DPI means larger images and files.'
			},
			{
				q: 'How do multi-page PDFs come out?',
				a: 'As a ZIP containing one numbered JPG per page (name-p01.jpg, name-p02.jpg, …). A single-page PDF skips the ZIP and downloads as an image directly.'
			},
			{
				q: 'Can I get PNG instead of JPG?',
				a: 'Yes — flip the output toggle to PNG for razor-sharp text and graphics. JPG stays the smaller choice for photographic pages.'
			},
			{
				q: 'Is this safe for confidential documents?',
				a: 'Yes — pages are rendered by code running locally in your tab. The PDF is never uploaded and no server ever sees its contents. Want proof? Convert one document, switch your connection off, and convert another — it still works.'
			}
		],
		guide: [
			{
				heading: 'Choosing a DPI',
				table: {
					columns: ['DPI', 'Best for'],
					rows: [
						['72', 'Screen previews, thumbnails, quick shares'],
						['150', 'The all-round default — crisp on screens, reasonable size'],
						['300', 'Print, archives, zooming into fine detail']
					]
				}
			},
			{
				heading: 'JPG or PNG output',
				paragraphs: [
					'JPG is the right pick for pages with photos and scans — small files, no visible artifacts at these DPIs. PNG is lossless and keeps hairline text and diagrams pixel-perfect at the cost of size; pick it when the page is mostly line art, or when the images head into further editing.'
				]
			},
			{
				heading: 'Multi-page documents',
				paragraphs: [
					'Every page renders to its own image, named by page number, and multi-page results download as a single ZIP. Only need a few pages as images? Split the PDF first — extract the range with the [Split tool](/split-pdf), then render just those pages.'
				]
			}
		],
		related: ['/compress-pdf', '/jpg-to-pdf', '/split-pdf', '/pdf-to-png']
	},
	{
		format: 'pdf',
		path: '/pdf-to-png',
		ogImage: '/og/pdf-to-png.jpg',
		label: 'PDF → PNG',
		feature: 'Convert PDF to PNG',
		preset: { kind: 'pdf-to-images', imageFormat: 'png' },
		dropSubject: 'PDF files',
		dropHint: 'PDF pages · rendered to PNG locally',
		title: 'PDF to PNG Converter — Lossless Pages, Local | Compress Pro',
		description:
			'Turn PDF pages into crisp lossless PNG images in your browser. Pick 72–300 DPI; multi-page files download as a ZIP. Nothing is uploaded, ever. Free.',
		h1: 'Convert PDF to PNG.',
		tagline: 'PDF pages become lossless PNGs — rendered on your device.',
		intro:
			'Render PDF pages to pixel-perfect PNG images without the file leaving your browser. PNG is lossless, so hairline text, diagrams and line art come out exactly as the page draws them — no JPEG artifacts around sharp edges. Pick the DPI, drop a document, and multi-page results arrive as one ZIP.',
		faq: [
			{
				q: 'PNG or JPG for PDF pages?',
				a: 'PNG is lossless and keeps thin lines, small text and flat colors pixel-perfect — right for diagrams, forms and anything headed into further editing. For photographic scans, JPG is several times smaller at no visible cost.'
			},
			{
				q: 'What DPI should I pick?',
				a: '150 DPI is the all-round default — crisp on screens with reasonable files. Use 72 for quick previews and thumbnails, 300 when the images go to print or need deep zooming.'
			},
			{
				q: 'How do multi-page PDFs download?',
				a: 'Every page renders to its own numbered PNG, and documents with more than one page download as a single ZIP so nothing gets lost or misordered.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'When PNG beats JPG for pages',
				paragraphs: [
					'PNG wins whenever the page is drawn rather than photographed: contracts and forms with fine print, wireframes, CAD exports, sheet music, charts. JPEG compression smears exactly those high-contrast edges. If your document is a photo scan, the [PDF to JPG](/pdf-to-jpg) converter produces far smaller files with nothing visible lost.'
				]
			},
			{
				heading: 'Choosing a DPI',
				table: {
					columns: ['DPI', 'What you get'],
					rows: [
						['72', 'Screen-size previews — small and fast'],
						['150', 'Sharp on any display — the sensible default'],
						['300', 'Print-grade renders that survive heavy zooming']
					]
				}
			},
			{
				heading: 'Editing the results',
				paragraphs: [
					'Because PNG is lossless, the rendered pages tolerate further work — annotate them, crop them, paste them into slides — without stacking compression artifacts on every save. If the pages end up on a web page afterwards, run them through [Compress PNG](/compress-png) to shrink them losslessly first.'
				]
			}
		],
		related: ['/pdf-to-jpg', '/compress-pdf', '/compress-png']
	},
	{
		format: 'video',
		path: '/mov-to-mp4',
		ogImage: '/og/mov-to-mp4.jpg',
		label: 'MOV → MP4',
		feature: 'Convert MOV to MP4',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'video/quicktime,.mov',
		dropSubject: 'MOV files',
		dropHint: 'MOV only · multiple files supported',
		inFooter: true,
		title: 'MOV to MP4 Converter — iPhone Video, No Upload | Compress Pro',
		description:
			'Convert iPhone MOV videos to MP4 right in your browser — fast, audio carried over, nothing uploaded. Hit a target size in the same step. Free & private.',
		h1: 'Convert MOV to MP4.',
		tagline: 'iPhone MOV to MP4 on your device — nothing gets uploaded.',
		intro:
			'Convert iPhone and Mac MOV recordings to MP4 right in your browser — the conversion runs on your device, and nothing is uploaded. MP4 plays everywhere: Windows, Android, TVs, editors, and every upload form. Keep the quality slider high for a near-identical copy, or set a target size like 25 MB to shrink while you convert.',
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
			{ q: 'Are my videos uploaded while converting?', a: PRIVACY_A_NO }
		],
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
		related: ['/compress-mov', '/compress-mp4', '/webm-to-mp4', '/mkv-to-mp4']
	},
	{
		format: 'video',
		path: '/webm-to-mp4',
		ogImage: '/og/webm-to-mp4.jpg',
		label: 'WebM → MP4',
		feature: 'Convert WebM to MP4',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'video/webm,.webm',
		dropSubject: 'WebM files',
		dropHint: 'WebM only · multiple files supported',
		inFooter: true,
		title: 'WebM to MP4 Converter — Play Anywhere, Private | Compress Pro',
		description:
			'Convert WebM videos to MP4 in your browser so they play on Apple devices, TVs and editors. Audio included, batches supported, nothing uploaded. Free.',
		h1: 'Convert WebM to MP4.',
		tagline: 'WebM to MP4 converted on your device — files never leave.',
		intro:
			'Turn WebM videos into MP4 without uploading them — the whole conversion happens in your browser. WebM plays great in browsers, but Apple devices, TVs, and most editors still want MP4. Drop a batch, keep the audio, and download files that play everywhere.',
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
			{ q: 'Do my videos get uploaded?', a: PRIVACY_A_NO }
		],
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
		related: ['/compress-video', '/mov-to-mp4', '/mp4-to-webm']
	},
	{
		format: 'video',
		path: '/mkv-to-mp4',
		ogImage: '/og/mkv-to-mp4.jpg',
		label: 'MKV → MP4',
		feature: 'Convert MKV to MP4',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'video/x-matroska,.mkv',
		dropSubject: 'MKV files',
		dropHint: 'MKV only · multiple files supported',
		title: 'MKV to MP4 Converter — In Your Browser, Private | Compress Pro',
		description:
			'Convert MKV videos to MP4 locally in your browser — no uploads, no installs. Works with any MKV your browser can play, batches included. Free & private.',
		h1: 'Convert MKV to MP4.',
		tagline: 'MKV into universal MP4 — converted right in your browser.',
		intro:
			'Convert MKV files to MP4 entirely in your browser — the video is re-encoded and the audio carried over or converted, with nothing uploaded anywhere. MKV is a flexible format, but phones, TVs and editors often refuse it; MP4 opens everywhere. If your browser cannot read the video inside, the tool tells you straight away.',
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
			{ q: 'Is anything uploaded?', a: PRIVACY_A_NO }
		],
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
		related: ['/compress-video', '/mov-to-mp4', '/webm-to-mp4']
	},
	{
		format: 'video',
		path: '/mp4-to-webm',
		ogImage: '/og/mp4-to-webm.jpg',
		label: 'MP4 → WebM',
		feature: 'Convert MP4 to WebM',
		preset: { kind: 'video', container: 'webm' },
		accept: 'video/mp4,video/x-m4v,.mp4,.m4v',
		dropSubject: 'MP4 files',
		dropHint: 'MP4 only · multiple files supported',
		title: 'MP4 to WebM Converter — Smaller Web Video | Compress Pro',
		description:
			'Convert MP4 videos to WebM right in your browser — typically smaller at the same visual quality, ideal for the web. No uploads, no accounts. Free & private.',
		h1: 'Convert MP4 to WebM.',
		tagline: 'MP4 to WebM in your browser — smaller video, same quality.',
		intro:
			'Convert MP4 videos to WebM right in your browser — everything runs on your device, nothing is uploaded. WebM (VP9) usually lands noticeably smaller than MP4 at the same visual quality, which makes it the go-to format for websites and web apps. The audio track comes along too.',
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
			{ q: 'Is my video uploaded during conversion?', a: PRIVACY_A_NO }
		],
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
		related: ['/compress-video', '/webm-to-mp4']
	},
	{
		format: 'video',
		path: '/video-to-gif',
		ogImage: '/og/video-to-gif.jpg',
		label: 'Video → GIF',
		feature: 'Convert video to GIF',
		preset: { kind: 'video', container: 'gif' },
		inFooter: true,
		title: 'Video to GIF Converter — Free & Private | Compress Pro',
		description:
			'Convert MP4, WebM or MOV video to an animated GIF in your browser. Pick fps and size, files never leave your device. Free, private, no watermark.',
		h1: 'Convert video to GIF.',
		tagline: 'Turn MP4 or WebM clips into GIFs — right in your browser.',
		intro:
			'Turn any video your browser can play — MP4, WebM, MOV — into a looping GIF, entirely on your own device. Nothing is uploaded, and there is no watermark or length gate: drop a clip, pick the frame rate and size, and download the GIF.',
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
			{ q: 'Is it private?', a: PRIVACY_A }
		],
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
		related: ['/mp4-to-gif', '/compress-video', '/gif-to-mp4', '/compress-gif']
	},
	{
		format: 'video',
		path: '/mp4-to-gif',
		ogImage: '/og/mp4-to-gif.jpg',
		label: 'MP4 → GIF',
		feature: 'Convert MP4 to GIF',
		preset: { kind: 'video', container: 'gif' },
		accept: 'video/mp4,video/x-m4v,.mp4,.m4v',
		dropSubject: 'MP4 files',
		dropHint: 'MP4 clips · turned into looping GIFs locally',
		title: 'MP4 to GIF Converter — No Watermark, No Upload | Compress Pro',
		description:
			'Turn MP4 clips into looping GIFs right in your browser — choose fps and size, no watermark, no length gate, nothing uploaded. Great for screen recordings.',
		h1: 'Convert MP4 to GIF.',
		tagline: 'MP4 clips become looping GIFs — made right on your device.',
		intro:
			'Convert MP4 videos to animated GIFs locally — everything happens right in your browser, and the finished GIF simply downloads. No watermark, no sign-up, no length gate. Best results come from short clips: pick the frame rate and a max dimension, and the GIF drops straight into chats, docs and READMEs.',
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
			{ q: 'Is my video uploaded?', a: PRIVACY_A_NO }
		],
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
		related: ['/video-to-gif', '/gif-to-mp4', '/compress-gif']
	},
	{
		format: 'video',
		path: '/gif-to-mp4',
		ogImage: '/og/gif-to-mp4.jpg',
		label: 'GIF → MP4',
		feature: 'Convert GIF to MP4',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'image/gif,.gif',
		dropSubject: 'GIF files',
		dropHint: 'Animated GIFs · converted to silent MP4',
		title: 'GIF to MP4 Converter — Smaller Files, No Upload | Compress Pro',
		description:
			'Convert animated GIFs to MP4 video in your browser — typically 5–10× smaller with smoother playback. No upload, no watermark, free and unlimited.',
		h1: 'Convert GIF to MP4.',
		tagline: 'GIFs become silent MP4 videos — smaller, smoother, local.',
		intro:
			'MP4 stores the same animation in a fraction of the bytes and plays it smoother than any GIF. The conversion happens in your browser frame by frame — the file never leaves your device.',
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
			{ q: 'Is it private?', a: PRIVACY_A }
		],
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
		related: ['/compress-gif', '/video-to-gif', '/compress-video']
	},
	{
		format: 'audio',
		path: '/mp4-to-mp3',
		ogImage: '/og/mp4-to-mp3.jpg',
		label: 'MP4 → MP3',
		feature: 'Convert MP4 to MP3',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'video/mp4,video/quicktime,.mp4,.m4v,.mov',
		dropSubject: 'video files',
		dropHint: 'MP4/MOV video · audio extracted as MP3',
		inFooter: true,
		title: 'MP4 to MP3 Converter — Extract Audio | Compress Pro',
		description:
			'Extract the audio track from MP4 or MOV video and save it as MP3 — right in your browser. No upload, no sign-up, no length limits. Free and private.',
		h1: 'Convert MP4 to MP3.',
		tagline: 'Pull audio out of any video — straight to MP3, locally.',
		intro:
			'Extract the audio track from any MP4 or MOV video and save it as an MP3 — the extraction and encoding run in your browser, so nothing is uploaded and even hour-long recordings convert without limits. Drop a video, pick a bitrate, download just the sound.',
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
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'What the MP3 can and cannot contain',
				paragraphs: [
					'Extraction re-encodes the sound that is already in the video — it cannot add fidelity that was never recorded. For talks and interviews filmed on a phone, 96–128 kbps captures everything there is; for concert or music footage, go 192 kbps or higher. To convert audio you already have as files, the [audio tool](/compress-audio) handles MP3, M4A, WAV and OGG directly.'
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
		related: ['/compress-audio', '/wav-to-mp3', '/m4a-to-mp3', '/compress-video']
	},
	{
		format: 'audio',
		path: '/wav-to-mp3',
		ogImage: '/og/wav-to-mp3.jpg',
		label: 'WAV → MP3',
		feature: 'Convert WAV to MP3',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/wav,audio/x-wav,.wav',
		dropSubject: 'WAV files',
		dropHint: 'WAV recordings · encoded to MP3 locally',
		inFooter: true,
		title: 'WAV to MP3 Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WAV audio to MP3 in your browser — typically 10× smaller with no audible difference. Pick the bitrate, keep the file on your device. Free forever.',
		h1: 'Convert WAV to MP3.',
		tagline: 'Turn huge WAV recordings into small MP3s, in your browser.',
		intro:
			'WAV stores raw samples; MP3 keeps what you can hear. At 192 kbps the MP3 is about a tenth of the WAV with no audible difference — and the conversion never leaves your machine.',
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
			{ q: 'Is it private?', a: PRIVACY_A }
		],
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
		related: ['/compress-audio', '/mp4-to-mp3', '/m4a-to-mp3']
	},
	{
		format: 'audio',
		path: '/m4a-to-mp3',
		ogImage: '/og/m4a-to-mp3.jpg',
		label: 'M4A → MP3',
		feature: 'Convert M4A to MP3',
		preset: { kind: 'audio', output: 'mp3' },
		accept: 'audio/mp4,audio/x-m4a,.m4a',
		dropSubject: 'M4A files',
		dropHint: 'M4A recordings · encoded to MP3 locally',
		inFooter: true,
		title: 'M4A to MP3 Converter — Voice Memos, No Upload | Compress Pro',
		description:
			'Convert M4A and AAC audio to MP3 right in your browser — voice memos, recordings and music that play anywhere. Pick a bitrate. Nothing is uploaded. Free.',
		h1: 'Convert M4A to MP3.',
		tagline: 'Apple voice memos become MP3s — converted on your device.',
		intro:
			'Convert M4A files — Apple’s default for Voice Memos, GarageBand exports and iTunes rips — to MP3 without uploading a second of audio. MP3 plays on everything ever made: car stereos, old players, court and HR portals, editing tools that shrug at M4A. Drop the files, pick a bitrate, download.',
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
			{ q: 'Is my audio uploaded?', a: PRIVACY_A_NO }
		],
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
		related: ['/compress-audio', '/mp4-to-mp3', '/wav-to-mp3']
	},
	{
		format: 'jpg',
		path: '/bmp-to-jpg',
		ogImage: '/og/bmp-to-jpg.jpg',
		label: 'BMP → JPG',
		feature: 'Convert BMP to JPG',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept: 'image/bmp,.bmp',
		dropSubject: 'BMP files',
		dropHint: 'BMP bitmaps · converted to JPG locally',
		title: 'BMP to JPG Converter — Free, Private, No Upload | Compress Pro',
		description:
			'Convert BMP images to JPG in your browser — typically 10–20× smaller. Drop the files, download the JPGs; nothing is uploaded. Free and unlimited.',
		h1: 'Convert BMP to JPG.',
		tagline: 'Turn bulky BMP bitmaps into small JPGs — in your browser.',
		intro:
			'BMP stores every pixel raw, which is why screenshots and exports balloon to megabytes. JPG keeps what the eye sees at a fraction of the size — and the conversion runs entirely on your device.',
		faq: [
			{
				q: 'Why are BMP files so large?',
				a: 'BMP is essentially uncompressed — three bytes per pixel plus padding. A 1920×1080 screenshot is ~6 MB as BMP and typically 200–500 KB as a JPG that looks identical.'
			},
			{
				q: 'Will the JPG lose quality?',
				a: 'JPG is lossy, but at the default quality the difference is invisible for photos and screenshots. For pixel-perfect graphics choose PNG or lossless WebP on the JPG tab instead.'
			},
			{
				q: 'Where do BMP files still come from?',
				a: 'Mostly older Windows software: legacy screenshot tools, scanners, industrial and medical systems, MS Paint saves. The format works fine — it simply predates modern compression, which is why the files are enormous.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'From 6 MB to a few hundred KB',
				paragraphs: [
					'BMP spends three bytes on every pixel no matter what the picture shows — a full-HD screenshot is ~6 MB before it contains anything interesting. JPG stores what the eye actually sees, so the same screenshot typically lands at 200–500 KB with no visible difference. Batches convert in one run and download as a ZIP.'
				]
			},
			{
				heading: 'When JPG is the wrong target',
				paragraphs: [
					'JPG is built for photos and smooth tones. If the BMP is a diagram, pixel art or a screenshot full of sharp text, flip the output format to PNG instead — lossless crispness in a fraction of BMP’s bytes, and the [PNG compressor](/compress-png) squeezes it further.'
				]
			}
		],
		related: ['/compress-jpg', '/png-to-jpg', '/tiff-to-jpg']
	},
	{
		format: 'jpg',
		path: '/tiff-to-jpg',
		ogImage: '/og/tiff-to-jpg.jpg',
		label: 'TIFF → JPG',
		feature: 'Convert TIFF to JPG',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept: 'image/tiff,.tif,.tiff',
		dropSubject: 'TIFF files',
		dropHint: 'TIFF scans & photos · converted to JPG locally',
		title: 'TIFF to JPG Converter — Free & Private | Compress Pro',
		description:
			'Convert TIFF scans and photos to JPG in your browser — no upload, no size limits. Multi-page TIFFs keep the first page. Free, private, unlimited.',
		h1: 'Convert TIFF to JPG.',
		tagline: 'Scanner TIFFs become shareable JPGs — locally, for free.',
		intro:
			'Scanners and pro cameras love TIFF; the rest of the world does not. Convert to JPG for sharing and uploading — the file never leaves your machine, so even huge scans are fine.',
		faq: [
			{
				q: 'Does it handle multi-page TIFFs?',
				a: 'The first page is converted. For multi-page scanned documents, a PDF is usually the better format — scan to PDF or combine the exported JPGs with the Images → PDF tool.'
			},
			{
				q: 'What about compressed TIFFs?',
				a: 'The common kinds decode fine. A few rare variants — multi-layer files and some print-shop color scans — may fail; if one does, export it as PNG from your scanner software first and convert that.'
			},
			{
				q: 'Can I hit an exact output size?',
				a: 'Yes — pick a quality, or switch to target-size mode and type a cap like 1 MB. Huge scans also respond well to a longest-side limit, which trims dimensions before quality even has to give.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'Scans: from archive to attachment',
				paragraphs: [
					'A 600 DPI scan is a beautiful archive and a terrible email attachment. Converted to JPG at quality 80–85, documents and photos keep every readable detail at a tenth of the size. Multi-page documents work best the other way around: convert the pages, then [combine them into one PDF](/jpg-to-pdf) so they travel as a single file.'
				]
			},
			{
				heading: 'Keep the TIFF as the master',
				paragraphs: [
					'If the TIFF is the only copy of an old family photo or an original document, keep it — it is the master. Convert copies to JPG for sharing and everyday viewing; the conversion here never touches the original file on your disk.'
				]
			}
		],
		related: ['/compress-jpg', '/jpg-to-pdf', '/bmp-to-jpg']
	},
	{
		format: 'png',
		path: '/png-to-ico',
		ogImage: '/og/png-to-ico.jpg',
		label: 'PNG → ICO',
		feature: 'Convert PNG to ICO',
		preset: { kind: 'image', tab: 'png', to: 'ico' },
		accept: 'image/png,.png',
		dropSubject: 'PNG files',
		dropHint: 'PNG logos · turned into a multi-size favicon',
		title: 'PNG to ICO Converter — Favicon Generator | Compress Pro',
		description:
			'Convert PNG to a multi-size ICO favicon (16–256 px) right in your browser. Transparency is preserved and nothing gets uploaded. Free and unlimited.',
		h1: 'Convert PNG to ICO.',
		tagline: 'Turn a PNG into a multi-size favicon ICO, in your browser.',
		intro:
			'Turn a PNG logo into a classic favicon.ico with 16–256 px versions embedded — generated entirely in your browser, so the file never leaves your device. Drop a square-ish PNG; transparency survives, and non-square images are centered.',
		faq: [
			{
				q: 'Which sizes go into the ICO?',
				a: '256, 128, 48, 32 and 16 px (skipping sizes larger than your source). That covers browser tabs, bookmarks, desktop shortcuts and Windows Explorer views in one file.'
			},
			{
				q: 'Do I still need an ICO in 2026?',
				a: 'Mostly for legacy contexts — modern browsers accept PNG and SVG favicons. But favicon.ico is still the zero-configuration fallback every browser requests, so shipping one never hurts.'
			},
			{
				q: 'What source image works best?',
				a: 'A square PNG, 256 px or larger — every embedded size is scaled down from it, so starting big keeps even the 16 px version crisp. Non-square images are centered rather than stretched.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'What lives inside a favicon.ico',
				paragraphs: [
					'ICO is a container: one file carries the same image at several sizes, and each context picks the one it needs.'
				],
				table: {
					columns: ['Size', 'Where it shows up'],
					rows: [
						['16 px', 'Browser tabs and bookmark lists'],
						['32 px', 'High-DPI tabs and taskbars'],
						['48 px', 'Desktop shortcuts and Windows Explorer'],
						['128–256 px', 'App switchers and zoomed folder views']
					]
				}
			},
			{
				heading: 'Shipping the favicon',
				paragraphs: [
					'Name the file favicon.ico and place it at the root of your site — browsers request that exact path on their own, no markup needed. Keep the source PNG for your other icons too, and run it through [Compress PNG](/compress-png) if the page also serves it directly.'
				]
			}
		],
		related: ['/compress-png', '/webp-to-png', '/jpg-to-ico', '/svg-to-ico']
	},
	{
		format: 'jpg',
		path: '/jpg-to-ico',
		ogImage: '/og/jpg-to-ico.jpg',
		label: 'JPG → ICO',
		feature: 'Convert JPG to ICO',
		preset: { kind: 'image', tab: 'jpg', to: 'ico' },
		accept: 'image/jpeg,.jpg,.jpeg',
		dropSubject: 'JPG files',
		dropHint: 'JPG logos & photos · turned into a multi-size favicon',
		inFooter: true,
		title: 'JPG to ICO Converter — Favicon Generator | Compress Pro',
		description:
			'Convert JPG to a multi-size ICO favicon (16–256 px) right in your browser. Non-square photos are centered and nothing gets uploaded. Free and unlimited.',
		h1: 'Convert JPG to ICO.',
		tagline: 'Turn a JPG logo into a multi-size favicon ICO — locally.',
		intro:
			'Turn a JPG logo or photo into a classic favicon.ico with 16–256 px versions embedded — generated entirely in your browser, so the file never leaves your device. Non-square images are centered on a transparent square rather than stretched.',
		faq: [
			{
				q: 'Which sizes end up in the ICO?',
				a: '256, 128, 48, 32 and 16 px — sizes larger than your source are skipped. One file covers browser tabs, bookmarks, desktop shortcuts and Windows Explorer views.'
			},
			{
				q: 'My JPG isn’t square — what happens?',
				a: 'It is centered on a transparent square canvas rather than stretched, and every icon size is scaled from that square. For best results, crop the image to a square first.'
			},
			{
				q: 'Wouldn’t a PNG be a better source?',
				a: 'If you have one, yes — PNG carries transparency, so cut-out logos stay see-through. From a JPG the icon is a solid rectangle, which is fine for photos and boxed logos.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'From photo to favicon',
				paragraphs: [
					'Favicons live at 16–48 px, so detail disappears fast — bold shapes and strong contrast survive, fine text does not. Crop tight around the mark before converting, and check the 16 px look in a browser tab. If your logo exists as a transparent PNG or an SVG, [PNG to ICO](/png-to-ico) and [SVG to ICO](/svg-to-ico) keep the cut-out edges.'
				]
			},
			{
				heading: 'Shipping the favicon',
				paragraphs: [
					'Name the file favicon.ico and put it at your site root — browsers request that exact path on their own, no markup needed. If the same JPG also appears on the page, [Compress JPG](/compress-jpg) shrinks it for serving.'
				]
			}
		],
		related: ['/png-to-ico', '/svg-to-ico', '/compress-jpg']
	},
	{
		format: 'svg',
		path: '/svg-to-png',
		ogImage: '/og/svg-to-png.jpg',
		label: 'SVG → PNG',
		feature: 'Convert SVG to PNG',
		preset: { kind: 'svg', to: 'png' },
		accept: 'image/svg+xml,.svg',
		dropSubject: 'SVG files',
		dropHint: 'SVG artwork · rendered to PNG locally',
		inFooter: true,
		title: 'SVG to PNG Converter — Free & Private | Compress Pro',
		description:
			'Convert SVG to PNG right in your browser — pick the output size, keep transparency, and batch-convert files. No uploads, no limits. Free and private.',
		h1: 'Convert SVG to PNG.',
		tagline: 'Crisp PNGs from SVG at any size — right in your browser.',
		intro:
			'Render SVG artwork to pixel-perfect PNG entirely in your browser — pick the size you need and transparency is preserved. Nothing is uploaded: logos, icons and illustrations never leave your device.',
		faq: [
			{
				q: 'What size should I render at?',
				a: 'Whatever you’ll actually display, or double it for high-DPI screens. Vector art has no native resolution — the size box sets the longest side and the aspect ratio is kept.'
			},
			{
				q: 'Is transparency preserved?',
				a: 'Yes — anywhere the SVG shows no background, the PNG is transparent. Set quality below 100 for a smaller palette-based PNG; 100 keeps it fully lossless.'
			},
			{
				q: 'Why does my PNG look different from the editor?',
				a: 'SVGs rendered as images can’t run scripts or load external images or fonts by reference — text using a non-embedded font falls back. Convert text to outlines in your editor if that matters.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'Vector in, pixels out',
				paragraphs: [
					'An SVG scales forever; a PNG is frozen at one size — so render at the largest size you will actually use and downscale from there. For a favicon, [SVG to ICO](/svg-to-ico) builds the multi-size .ico in one step, and if the page keeps serving the vector itself, [Compress SVG](/compress-svg) makes it lighter first.'
				]
			}
		],
		related: ['/compress-svg', '/svg-to-ico', '/compress-png']
	},
	{
		format: 'svg',
		path: '/svg-to-ico',
		ogImage: '/og/svg-to-ico.jpg',
		label: 'SVG → ICO',
		feature: 'Convert SVG to ICO',
		preset: { kind: 'svg', to: 'ico' },
		accept: 'image/svg+xml,.svg',
		dropSubject: 'SVG files',
		dropHint: 'SVG logos · turned into a multi-size favicon',
		title: 'SVG to ICO Converter — Favicon Generator | Compress Pro',
		description:
			'Convert an SVG logo to a multi-size ICO favicon (16–256 px) in your browser. Vector sharpness at every size, nothing uploaded. Free and unlimited.',
		h1: 'Convert SVG to ICO.',
		tagline: 'Vector-sharp favicons — SVG to a multi-size ICO, locally.',
		intro:
			'SVG is the ideal favicon source: the vector is rendered fresh for the ICO, so every embedded size comes out sharp. The classic favicon.ico with 16–256 px versions is built entirely in your browser — your artwork never leaves your device.',
		faq: [
			{
				q: 'Why convert from SVG instead of PNG?',
				a: 'The vector is rendered natively before the icon sizes are built, so edges stay crisp — a PNG source has one fixed resolution and every other size is interpolated from it.'
			},
			{
				q: 'Which sizes go into the ICO?',
				a: '256, 128, 48, 32 and 16 px in one file — that covers browser tabs, bookmarks, desktop shortcuts and Windows Explorer views. Transparency survives throughout.'
			},
			{
				q: 'Do I still need an ICO if browsers accept SVG favicons?',
				a: 'Modern browsers do take SVG favicons, but favicon.ico remains the zero-configuration fallback every browser requests on its own — shipping both is the safe setup.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'One vector, every context',
				paragraphs: [
					'Keep the SVG as the master: link it as the modern favicon, ship the generated favicon.ico at your site root as the fallback, and you cover everything from retina tabs to legacy Windows. If the site serves the SVG directly, [Compress SVG](/compress-svg) trims it; for plain raster export, [SVG to PNG](/svg-to-png) renders any size.'
				]
			}
		],
		related: ['/png-to-ico', '/svg-to-png', '/compress-svg']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/ttf-to-woff2',
		ogImage: '/og/ttf-to-woff2.jpg',
		label: 'TTF → WOFF2',
		feature: 'Convert TTF to WOFF2',
		preset: { kind: 'font', to: 'woff2' },
		accept: 'font/ttf,.ttf',
		dropSubject: 'TTF fonts',
		dropHint: 'TTF fonts · repackaged to WOFF2 locally',
		inFooter: true,
		title: 'TTF to WOFF2 Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert TTF fonts to WOFF2 in your browser — typically half the size, identical glyphs, kerning and hinting. Nothing is uploaded. Free, no sign-up.',
		h1: 'Convert TTF to WOFF2.',
		tagline: 'Turn desktop TTF fonts into web-ready WOFF2 — privately.',
		intro:
			'WOFF2 is the same font wrapped in Brotli compression — the format every modern browser wants in @font-face. Drop a TTF (or a whole batch) and it comes out typically half the size, with glyphs, kerning and hinting untouched. Nothing is uploaded anywhere.',
		faq: [
			{
				q: 'How much smaller does WOFF2 get?',
				a: 'Typically 40–60% smaller than the raw TTF — Brotli compresses font tables extremely well. A 200 KB text font usually lands around 80–110 KB; large CJK fonts shrink the most in absolute terms.'
			},
			{
				q: 'Is anything lost in the conversion?',
				a: 'No glyphs, spacing, kerning or hinting — WOFF2 is a compressed wrapper around the same tables, and browsers reconstruct them exactly. Only a digital signature (DSIG), if present, is removed, because the WOFF2 spec requires it; a note tells you when that happens.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_A },
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'Using the WOFF2 on your site',
				paragraphs: [
					'Reference the converted file in CSS with @font-face: set font-family to a name of your choice and src to url(yourfont.woff2) format("woff2"). Add font-display: swap so text renders immediately while the font loads. WOFF2 covers every browser released since 2016 — a WOFF fallback is only worth it for genuinely old traffic; [TTF to WOFF](/ttf-to-woff) makes one if you need it.'
				]
			}
		],
		related: ['/font-converter', '/otf-to-woff2', '/woff2-to-ttf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/ttf-to-woff',
		ogImage: '/og/ttf-to-woff.jpg',
		label: 'TTF → WOFF',
		feature: 'Convert TTF to WOFF',
		preset: { kind: 'font', to: 'woff' },
		accept: 'font/ttf,.ttf',
		dropSubject: 'TTF fonts',
		dropHint: 'TTF fonts · wrapped as WOFF locally',
		title: 'TTF to WOFF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert TTF to WOFF in your browser — a byte-exact zlib wrapper for older browsers. Your font never leaves your device. Free, private, no sign-up.',
		h1: 'Convert TTF to WOFF.',
		tagline: 'TTF wrapped as WOFF for legacy browsers — all in-browser.',
		intro:
			'WOFF (the original web font format) is a zlib-compressed wrapper around your TTF — every table comes through byte-for-byte. Modern sites should prefer WOFF2; reach for WOFF when you must support genuinely old browsers.',
		faq: [
			{
				q: 'Should I use WOFF or WOFF2?',
				a: 'WOFF2, almost always — it is about 25–30% smaller and every browser released since 2016 supports it. WOFF only earns its place as a fallback for very old browsers like IE9–11 or Android 4 stock.'
			},
			{
				q: 'Is the conversion lossless?',
				a: 'Bit-for-bit: WOFF stores each original font table zlib-compressed, and unwrapping returns exactly the bytes that went in. Glyphs, kerning, hinting — even the digital signature — all survive.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_A },
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		related: ['/ttf-to-woff2', '/font-converter', '/woff-to-ttf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/otf-to-woff2',
		ogImage: '/og/otf-to-woff2.jpg',
		label: 'OTF → WOFF2',
		feature: 'Convert OTF to WOFF2',
		preset: { kind: 'font', to: 'woff2' },
		accept: 'font/otf,.otf',
		dropSubject: 'OTF fonts',
		dropHint: 'OTF fonts · repackaged to WOFF2 locally',
		inFooter: true,
		title: 'OTF to WOFF2 Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert OTF fonts to WOFF2 in your browser — smaller for the web, with CFF outlines stored byte-for-byte. Nothing is uploaded. Free and private.',
		h1: 'Convert OTF to WOFF2.',
		tagline: 'Web-ready WOFF2 from your OTF fonts — nothing uploaded.',
		intro:
			'OTF fonts go straight into WOFF2 with their PostScript (CFF) outlines stored as-is — no outline conversion, no quality loss, just Brotli compression around the same tables. The result is what modern browsers expect in @font-face.',
		faq: [
			{
				q: 'Do the PostScript outlines survive?',
				a: 'Byte-for-byte. WOFF2 has no special handling for CFF tables, so an OTF font round-trips exactly — converting back returns the identical outlines, kerning and features.'
			},
			{
				q: 'How much smaller is the WOFF2?',
				a: 'Typically 40–60% smaller than the OTF — CFF data compresses well under Brotli. The exact ratio depends on how many glyphs and features the font carries.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_A },
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		related: ['/font-converter', '/ttf-to-woff2', '/woff2-to-otf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/otf-to-woff',
		ogImage: '/og/otf-to-woff.jpg',
		label: 'OTF → WOFF',
		feature: 'Convert OTF to WOFF',
		preset: { kind: 'font', to: 'woff' },
		accept: 'font/otf,.otf',
		dropSubject: 'OTF fonts',
		dropHint: 'OTF fonts · wrapped as WOFF locally',
		title: 'OTF to WOFF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert OTF to WOFF in your browser — a lossless zlib wrapper for older browsers. Your font file never leaves your device. Free, private, no sign-up.',
		h1: 'Convert OTF to WOFF.',
		tagline: 'OTF wrapped as WOFF for legacy browsers — all in-browser.',
		intro:
			'WOFF wraps your OTF in zlib compression, table by table, byte for byte — the PostScript outlines are untouched. Prefer WOFF2 for modern sites; WOFF exists for the long tail of old browsers.',
		faq: [
			{
				q: 'When is WOFF the right choice over WOFF2?',
				a: 'Only when you must serve genuinely old browsers — IE9–11 or Android 4-era stock browsers. Everything newer prefers WOFF2, which is also about a quarter smaller.'
			},
			{
				q: 'Is the conversion lossless?',
				a: 'Bit-for-bit: each table is stored zlib-compressed and unwraps to exactly the original bytes. Outlines, kerning, OpenType features and hinting all survive untouched.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_A },
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		related: ['/otf-to-woff2', '/font-converter', '/woff-to-otf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/woff-to-ttf',
		ogImage: '/og/woff-to-ttf.jpg',
		label: 'WOFF → TTF',
		feature: 'Convert WOFF to TTF',
		preset: { kind: 'font', to: 'ttf' },
		accept: 'font/woff,application/font-woff,.woff',
		dropSubject: 'WOFF fonts',
		dropHint: 'WOFF web fonts · unwrapped locally',
		title: 'WOFF to TTF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WOFF web fonts back to installable TTF in your browser — the original font data, unwrapped losslessly. Nothing uploaded. Free, no sign-up.',
		h1: 'Convert WOFF to TTF.',
		tagline: 'Unwrap WOFF web fonts back to installable TTF — locally.',
		intro:
			'A WOFF is a compressed envelope around a desktop font — unwrapping it returns the original TTF, byte for byte, ready to install or open in a font editor. The decompression happens entirely in your browser.',
		faq: [
			{
				q: 'Can I install the result?',
				a: 'Yes — the output is a regular desktop font file: double-click it and Font Book (macOS) or the Windows font viewer offers to install it. Whether the license permits desktop installation is a separate question, so check it.'
			},
			{
				q: 'Why did my file come out as .otf?',
				a: 'Because that is what was inside: some WOFFs carry PostScript (CFF) outlines, which by convention use the .otf extension. Converting the outlines themselves would lose hinting and can distort shapes, so the tool keeps them intact and names the file honestly — a note explains when this happens.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_A },
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		related: ['/woff-to-woff2', '/font-converter', '/woff2-to-ttf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/woff-to-otf',
		ogImage: '/og/woff-to-otf.jpg',
		label: 'WOFF → OTF',
		feature: 'Convert WOFF to OTF',
		preset: { kind: 'font', to: 'otf' },
		accept: 'font/woff,application/font-woff,.woff',
		dropSubject: 'WOFF fonts',
		dropHint: 'WOFF web fonts · unwrapped locally',
		title: 'WOFF to OTF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WOFF web fonts back to desktop OTF in your browser — the original CFF font, unwrapped losslessly. Nothing is uploaded. Free and private.',
		h1: 'Convert WOFF to OTF.',
		tagline: 'Unwrap WOFF web fonts back to desktop OTF — in-browser.',
		intro:
			'Unwrapping a WOFF returns the exact desktop font that was packaged into it. If that font has PostScript (CFF) outlines you get an .otf; if it is a TrueType font you get a .ttf — either way, byte-identical tables and a file you can install.',
		faq: [
			{
				q: 'Why did my file come out as .ttf?',
				a: 'Because the WOFF contained TrueType outlines — .otf is by convention the extension for PostScript (CFF) outlines. Converting between outline types would cost hinting and shape fidelity, so the tool never does it: same font, honest extension, and a note tells you when it happens.'
			},
			{
				q: 'Is the unwrapped font identical to the original?',
				a: 'Yes — WOFF stores each table zlib-compressed, and decompression returns the exact original bytes: outlines, kerning, OpenType features, hinting, everything.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_A },
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		related: ['/woff-to-ttf', '/font-converter', '/otf-to-woff']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/woff-to-woff2',
		ogImage: '/og/woff-to-woff2.jpg',
		label: 'WOFF → WOFF2',
		feature: 'Convert WOFF to WOFF2',
		preset: { kind: 'font', to: 'woff2' },
		accept: 'font/woff,application/font-woff,.woff',
		dropSubject: 'WOFF fonts',
		dropHint: 'WOFF web fonts · upgraded to WOFF2 locally',
		inFooter: true,
		title: 'WOFF to WOFF2 Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WOFF to WOFF2 in your browser — Brotli recompression makes web fonts about a quarter smaller, losslessly. Nothing uploaded. Free, no sign-up.',
		h1: 'Convert WOFF to WOFF2.',
		tagline: 'Upgrade WOFF fonts to smaller WOFF2 — nothing uploaded.',
		intro:
			'Still serving WOFF? WOFF2 carries the same font in Brotli instead of zlib — usually 25–30% smaller, supported by every browser released since 2016. The upgrade is pure recompression: unwrap, rewrap, identical tables.',
		faq: [
			{
				q: 'How much do I save?',
				a: 'Usually 25–30% — Brotli beats zlib consistently on font tables. On a page loading three weights, that is often 100 KB+ off the critical path for one-line CSS changes.'
			},
			{
				q: 'Do I still need the WOFF fallback?',
				a: 'Only for genuinely old browsers (IE9–11, Android 4 stock). Every browser released since 2016 reads WOFF2, so most sites today ship WOFF2 alone.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_A },
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		related: ['/ttf-to-woff2', '/font-converter', '/woff2-to-woff']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/woff2-to-ttf',
		ogImage: '/og/woff2-to-ttf.jpg',
		label: 'WOFF2 → TTF',
		feature: 'Convert WOFF2 to TTF',
		preset: { kind: 'font', to: 'ttf' },
		accept: 'font/woff2,.woff2',
		dropSubject: 'WOFF2 fonts',
		dropHint: 'WOFF2 web fonts · decoded locally',
		inFooter: true,
		title: 'WOFF2 to TTF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WOFF2 web fonts to installable TTF in your browser — glyphs, kerning and hinting all preserved. Nothing is uploaded. Free, private, no sign-up.',
		h1: 'Convert WOFF2 to TTF.',
		tagline: 'Unpack WOFF2 web fonts into installable TTF — privately.',
		intro:
			'WOFF2 is a Brotli-compressed envelope around a desktop font. Decoding it in your browser returns a TTF you can install, inspect or edit — with every glyph, kerning pair and hinting instruction intact.',
		faq: [
			{
				q: 'Can I install the result?',
				a: 'Yes — the output is a regular TTF: double-click to install it on macOS or Windows. Do check the license first; a web-embedding license does not automatically allow desktop installation.'
			},
			{
				q: 'Is the TTF identical to the font that was originally encoded?',
				a: 'Functionally yes — every glyph, kerning pair, OpenType feature and hinting instruction is reconstructed exactly as the WOFF2 spec defines. The raw bytes of the glyph table may be laid out slightly differently than in the pre-encoding original, which no renderer or editor will ever notice.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_A },
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'Got .otf instead of .ttf?',
				paragraphs: [
					'Some web fonts carry PostScript (CFF) outlines rather than TrueType ones. Converting between outline types is lossy (hinting dies, curves get approximated), so this tool never does it — a CFF font is saved as .otf with a note. It installs exactly the same way; only the extension differs. The reverse direction lives at [TTF to WOFF2](/ttf-to-woff2).'
				]
			}
		],
		related: ['/ttf-to-woff2', '/font-converter', '/woff2-to-otf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/woff2-to-otf',
		ogImage: '/og/woff2-to-otf.jpg',
		label: 'WOFF2 → OTF',
		feature: 'Convert WOFF2 to OTF',
		preset: { kind: 'font', to: 'otf' },
		accept: 'font/woff2,.woff2',
		dropSubject: 'WOFF2 fonts',
		dropHint: 'WOFF2 web fonts · decoded locally',
		title: 'WOFF2 to OTF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WOFF2 web fonts to desktop OTF in your browser — the CFF font data comes out byte-for-byte intact. Nothing uploaded. Free, private, no sign-up.',
		h1: 'Convert WOFF2 to OTF.',
		tagline: 'Unpack WOFF2 web fonts into desktop OTF — in your browser.',
		intro:
			'Decoding a WOFF2 returns the desktop font it was made from. PostScript (CFF) outlines come out byte-for-byte — WOFF2 stores them without any transformation — so the .otf you download is exactly the font the site serves.',
		faq: [
			{
				q: 'Why did my file come out as .ttf?',
				a: 'Because the WOFF2 contained TrueType outlines — .otf is by convention reserved for PostScript (CFF) outlines. Outline conversion is lossy, so the tool keeps the original outlines and names the file honestly; a note explains it whenever that happens.'
			},
			{
				q: 'Are CFF outlines really untouched?',
				a: 'Yes — the WOFF2 format compresses CFF tables without transforming them, so decoding returns the identical bytes. Kerning, ligatures and every other OpenType feature come along unchanged.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_A },
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		related: ['/woff2-to-ttf', '/font-converter', '/otf-to-woff2']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/woff2-to-woff',
		ogImage: '/og/woff2-to-woff.jpg',
		label: 'WOFF2 → WOFF',
		feature: 'Convert WOFF2 to WOFF',
		preset: { kind: 'font', to: 'woff' },
		accept: 'font/woff2,.woff2',
		dropSubject: 'WOFF2 fonts',
		dropHint: 'WOFF2 web fonts · repacked as WOFF locally',
		title: 'WOFF2 to WOFF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WOFF2 to WOFF in your browser for legacy browser support — lossless, though zlib output is larger. Nothing is uploaded. Free, private, no limits.',
		h1: 'Convert WOFF2 to WOFF.',
		tagline: 'Repack WOFF2 as WOFF for legacy browsers — output grows.',
		intro:
			'Going from WOFF2 back to WOFF trades size for reach: zlib compresses less than Brotli, so expect the output to be 25–40% larger — same font, older wrapper. Useful when a legacy browser or an old toolchain insists on WOFF.',
		faq: [
			{
				q: 'Why is the converted file bigger than my WOFF2?',
				a: 'Because WOFF uses zlib and WOFF2 uses Brotli, and Brotli simply compresses better. The font inside is identical — the older wrapper just costs 25–40% more bytes. That is the honest price of legacy compatibility.'
			},
			{
				q: 'Who actually needs WOFF today?',
				a: 'Browsers that predate 2016 — IE9–11, old Android stock browsers, some embedded webviews — and the occasional tool or CMS that validates uploads against a WOFF-only allowlist.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_A },
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		related: ['/woff-to-woff2', '/font-converter', '/woff2-to-ttf']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/ttf-to-eot',
		ogImage: '/og/ttf-to-eot.jpg',
		label: 'TTF → EOT',
		feature: 'Convert TTF to EOT',
		preset: { kind: 'font', to: 'eot' },
		accept: 'font/ttf,.ttf',
		dropSubject: 'TTF fonts',
		dropHint: 'TTF fonts · wrapped as EOT locally',
		title: 'TTF to EOT Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert TTF fonts to EOT for Internet Explorer 6–8 in your browser — a lossless header wrapper. Your font never leaves your device. Free, no sign-up.',
		h1: 'Convert TTF to EOT.',
		tagline: 'EOT files for the old Internet Explorer — created locally.',
		intro:
			'EOT (Embedded OpenType) is the web font format Internet Explorer 6–8 understood — a small metadata header in front of the unchanged TTF. If a legacy intranet or an ancient CSS pipeline still demands it, this makes one without your font leaving the machine.',
		faq: [
			{
				q: 'Do I actually need EOT?',
				a: 'Almost certainly not — EOT only ever mattered for Internet Explorer 6–8, which are long dead outside legacy intranets. For anything current, WOFF2 is the format to serve; this page exists for maintaining old systems.'
			},
			{
				q: 'Is the font changed in any way?',
				a: 'No — a plain EOT is your TTF stored verbatim behind a metadata header (name, weight, embedding flags) read from the font itself. Unwrapping it returns the identical TTF.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_A },
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		related: ['/eot-to-ttf', '/font-converter', '/ttf-to-woff2']
	},
	{
		format: 'font',
		steps: FONT_STEPS,
		path: '/eot-to-ttf',
		ogImage: '/og/eot-to-ttf.jpg',
		label: 'EOT → TTF',
		feature: 'Convert EOT to TTF',
		preset: { kind: 'font', to: 'ttf' },
		accept: 'application/vnd.ms-fontobject,.eot',
		dropSubject: 'EOT fonts',
		dropHint: 'legacy EOT fonts · decoded locally',
		title: 'EOT to TTF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert legacy EOT fonts back to TTF in your browser — plain and XOR-obfuscated EOTs decode losslessly. Nothing is uploaded. Free, private, no sign-up.',
		h1: 'Convert EOT to TTF.',
		tagline: 'Rescue fonts from legacy EOT files — decoded in-browser.',
		intro:
			'Old sites and intranets left a trail of EOT files with no desktop counterpart. Most EOTs store the original TTF verbatim behind a header — this unwraps it (XOR-obfuscated ones included) into a font you can install or convert onward.',
		faq: [
			{
				q: 'Does every EOT work?',
				a: 'Most do — plain and XOR-obfuscated EOTs decode to the exact original font. The exception is EOTs made with MicroType Express compression (some WEFT-era files): browsers cannot decode MTX, so those are rejected with a clear message. If you have the original TTF, convert from that instead.'
			},
			{
				q: 'Can I install the result?',
				a: 'Yes — the unwrapped file is a regular desktop font. Note that EOTs were often produced under embedding-only licenses, so check whether desktop installation is actually permitted for your font.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_A },
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		related: ['/ttf-to-eot', '/font-converter', '/woff-to-ttf']
	}
];

/**
 * Standalone tool pages hosted on an existing tab (like CONVERTERS, minus the
 * "X → Y" conversion framing) — PDF ops (unlock/protect/merge/split) plus
 * standalone video and image tools.
 */
export const TOOLS: ConverterEntry[] = [
	{
		format: 'pdf',
		path: '/unlock-pdf',
		ogImage: '/og/unlock-pdf.jpg',
		label: 'Unlock PDF',
		feature: 'Unlock password-protected PDFs',
		preset: { kind: 'pdf-op', op: 'unlock' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'Password-protected PDFs · unlocked locally',
		title: 'Unlock PDF Online — Remove Password Locally | Compress Pro',
		description:
			'Remove a password from a PDF you own — right in your browser. The file and the password never leave your device. Free, private, no upload, no sign-up.',
		h1: 'Unlock PDF files.',
		tagline: 'Remove PDF passwords locally — nothing ever gets uploaded.',
		intro:
			'Remove the password from a PDF you own and get a copy that opens freely. Unlike online unlockers, both the PDF and the password you type stay on your device — the whole job runs right in your browser, and nothing is ever sent anywhere.',
		faq: [
			{
				q: 'Is unlocking a PDF legal?',
				a: 'Unlocking PDFs you own or have the right to use — like invoices, bank statements or reports sent to you with a password — is fine. This tool requires the correct password; it does not crack or bypass anything.'
			},
			{
				q: 'What if I don’t know the password?',
				a: 'Then the PDF can’t be unlocked here. This tool unlocks with the password you provide — it is not a password recovery or cracking service.'
			},
			{
				q: 'Why does my PDF open fine but refuse printing or editing?',
				a: 'That is a permissions lock — the file is readable, but flags inside it restrict printing, copying or editing. Unlocking rewrites the PDF without those restrictions, so the copy prints and copies normally in every reader.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'Your password never leaves this page',
				paragraphs: [
					'Typing a PDF password into a random website is a leap of faith — you hand a stranger’s server both the document and the key to it. Here there is no server in the loop: the PDF is decrypted and rewritten on your own device, and neither the file nor the password is ever transmitted. The unlocked copy downloads straight from your browser’s memory.'
				]
			},
			{
				heading: 'Two kinds of PDF locks',
				paragraphs: [
					'An open password is the real lock: the file is encrypted and nothing can read it without the password, which is why this tool asks for it once. A permissions lock is softer — the PDF opens fine but printing, copying or editing is restricted. Both come off here, and the unlocked copy behaves like any ordinary PDF.',
					'What this tool never does is guess or crack passwords — if you don’t know the open password, the file stays sealed. Going the other direction, [Protect PDF](/protect-pdf) adds a password to documents you are about to send.'
				]
			}
		],
		related: ['/compress-pdf', '/protect-pdf', '/merge-pdf', '/split-pdf']
	},
	{
		format: 'pdf',
		path: '/protect-pdf',
		ogImage: '/og/protect-pdf.jpg',
		label: 'Protect PDF',
		feature: 'Password-protect PDFs',
		preset: { kind: 'pdf-op', op: 'protect' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF files · password-protected locally',
		title: 'Protect PDF with a Password — Free & Private | Compress Pro',
		description:
			'Add a password to a PDF right in your browser. Encryption runs locally — the file and the password never leave your device. Free, private and unlimited.',
		h1: 'Password-protect PDF files.',
		tagline: 'Password-protect PDFs locally — no uploads, no accounts.',
		intro:
			'Add a password to any PDF and download an encrypted copy that no reader opens without it. Everything happens in your browser with standard PDF encryption — the kind every reader supports — and neither the file nor the password is ever sent anywhere.',
		faq: [
			{
				q: 'Which encryption does it use?',
				a: 'Standard 128-bit PDF encryption, which every PDF reader supports — Adobe Acrobat, Apple Preview and browsers all require the password to open the file. For highly sensitive material, prefer an encrypted archive or disk image.'
			},
			{
				q: 'What if I forget the password?',
				a: 'There is no recovery. The encryption is real — without the password the content is unreadable, and no service can restore it. Keep the original file or store the password in a password manager.'
			},
			{
				q: 'Can I remove the password later?',
				a: 'Yes — as long as you still know it. Drop the protected file on the Unlock PDF tool, type the password once, and download a copy that opens freely. Keep the original file too, or store the password in a password manager.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'What the password actually protects',
				paragraphs: [
					'The password encrypts the entire document — without it the contents are unreadable bytes, and every serious reader (Acrobat, Preview, browsers) refuses to open the file until it is entered. That protects the document at rest and in transit: an intercepted email attachment or a PDF on a lost USB stick stays sealed.'
				]
			},
			{
				heading: 'Sending a protected PDF safely',
				paragraphs: [
					'Send the file and the password on different channels — the PDF by email, the password in a text message or a call. Both in the same email defeats the point. And pick a password you don’t use anywhere else: the recipient could try it, and the file may outlive the conversation.',
					'One order-of-operations tip: size first, then seal. Encrypted files can’t be processed further, so run a heavy scan through [Compress PDF](/compress-pdf) before adding the password.'
				]
			}
		],
		related: ['/compress-pdf', '/unlock-pdf', '/split-pdf']
	},
	{
		format: 'pdf',
		path: '/merge-pdf',
		ogImage: '/og/merge-pdf.jpg',
		label: 'Merge PDF',
		feature: 'Merge PDFs into one document',
		preset: { kind: 'pdf-op', op: 'merge' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF files · merged locally in your order',
		title: 'Merge PDF Files — Combine PDFs Privately | Compress Pro',
		description:
			'Merge multiple PDFs into one document right in your browser — drag to reorder, optionally compress the result. Files never leave your device. Free.',
		h1: 'Merge PDF files.',
		tagline: 'Combine PDFs into one file locally — nothing is uploaded.',
		intro:
			'Combine any number of PDFs into a single document, assembled entirely in your browser. Drop the files, arrange them with the list arrows, and merge — pages are copied losslessly, so nothing is re-encoded unless you also tick “Compress after merging”. No server ever touches your documents.',
		faq: [
			{
				q: 'How do I control the page order?',
				a: 'The merged PDF follows the list order — use the arrows on each row to rearrange files before merging. Pages inside each file keep their original order.'
			},
			{
				q: 'Can I merge and compress in one step?',
				a: 'Yes — enable “Compress after merging” and the combined document is compressed right after assembly, with the preset you pick. Leave it off for a lossless merge.'
			},
			{
				q: 'What about password-protected PDFs?',
				a: 'Encrypted files can’t be merged directly. Remove the password first with the Unlock tool — it runs locally too — then merge the unlocked copies.'
			},
			{ q: 'Are my documents uploaded?', a: PRIVACY_A_NO }
		],
		guide: [
			{
				heading: 'Merging without quality loss',
				paragraphs: [
					'The merge itself is lossless: pages are copied from each source PDF into the combined document exactly as they are — text, images, links and fonts are untouched, just reassembled. The output is only as large as its inputs combined, so if the result feels heavy, that weight was already in the sources.'
				]
			},
			{
				heading: 'Merge and compress in one pass',
				paragraphs: [
					'Tick “Compress after merging” to hand the combined file straight to the same compression engine behind the [Compress PDF](/compress-pdf) tool. This is the right order of operations — compressing one merged file beats compressing ten inputs separately, because images are downsampled once, consistently, and you check the size limit against the final document.'
				]
			},
			{
				heading: 'Typical uses',
				table: {
					columns: ['Task', 'How'],
					rows: [
						[
							'Combine scanned pages',
							'Drop the scans in shooting order — each becomes consecutive pages'
						],
						[
							'Assemble a report',
							'Cover, body and appendix PDFs in list order, compress at Medium'
						],
						['Bundle invoices', 'Merge a month of invoices, then compress to email size']
					]
				}
			}
		],
		related: ['/split-pdf', '/compress-pdf', '/unlock-pdf']
	},
	{
		format: 'pdf',
		path: '/split-pdf',
		ogImage: '/og/split-pdf.jpg',
		label: 'Split PDF',
		feature: 'Split PDFs — extract or remove pages',
		preset: { kind: 'pdf-op', op: 'pages' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'PDF files · pages extracted locally',
		title: 'Split PDF — Extract or Remove Pages Privately | Compress Pro',
		description:
			'Split a PDF in your browser — keep only the pages you need or delete the ones you don’t, with ranges like 1-3,7. The file never leaves your device. Free.',
		h1: 'Split PDF files.',
		tagline: 'Extract or remove PDF pages locally — nothing is uploaded.',
		intro:
			'Pull exact pages out of a PDF — or cut pages from it — entirely in your browser. Type a range like 1-3,7,12- and choose whether to keep or remove those pages; the rest assemble into a new document with nothing re-encoded and nothing uploaded.',
		faq: [
			{
				q: 'How do page ranges work?',
				a: 'Comma-separate pages and ranges: 1-3,7,12- means pages one to three, page seven, and everything from twelve to the end. Open-ended ranges like 12- save you from knowing the page count.'
			},
			{
				q: 'What’s the difference between Keep and Remove?',
				a: 'Keep extracts your selection into the new file; Remove deletes the selection and keeps everything else. The same range means opposite things, so double-check the toggle before running.'
			},
			{
				q: 'Does splitting reduce quality?',
				a: 'No — pages are copied as-is, without re-encoding. Only the pages you excluded are gone. Compress the result separately if you also want it smaller.'
			},
			{ q: 'Is it private?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'Page ranges by example',
				table: {
					columns: ['Range', 'Result with Keep'],
					rows: [
						['5', 'Just page five'],
						['1-3,7', 'Pages one to three, plus page seven'],
						['12-', 'Page twelve to the end'],
						['1-3,12-', 'Everything except pages four to eleven']
					]
				}
			},
			{
				heading: 'Extract vs remove',
				paragraphs: [
					'Keep mode answers “I need these pages”: pull the signed page out of a contract, or the one relevant chapter from a manual. Remove mode answers “these pages shouldn’t be here”: strip a blank scan, an outdated appendix or a page with someone else’s data. Both produce a fresh PDF and leave the original untouched.'
				]
			},
			{
				heading: 'Splitting big scans',
				paragraphs: [
					'Scanned bundles are the classic case — a hundred-page scan where you need pages 34–41. Extraction is instant even on huge files because pages are copied, not rendered. If the extracted part is still heavy, run it through [Compress PDF](/compress-pdf) afterwards; scans shrink dramatically there.'
				]
			}
		],
		related: ['/merge-pdf', '/compress-pdf', '/pdf-to-jpg']
	},
	{
		format: 'video',
		path: '/compress-mp4',
		ogImage: '/og/compress-mp4.jpg',
		label: 'Compress MP4',
		feature: 'Compress MP4 video to a size limit',
		preset: { kind: 'video', container: 'mp4' },
		accept: 'video/mp4,video/x-m4v,.mp4,.m4v',
		dropSubject: 'MP4 files',
		dropHint: 'MP4 only · multiple files supported',
		title: 'Compress MP4 Video Online — Free & Private | Compress Pro',
		description:
			'Shrink MP4 videos right in your browser — set a quality or a target size like 10 MB for Discord. Nothing is uploaded, no watermark. Free & private.',
		h1: 'Compress MP4 videos.',
		tagline: 'Shrink MP4s on your device — under any upload size limit.',
		intro:
			'Compress MP4 files right on your own device — no upload, no queue, no watermark. Set a quality for a smaller look-alike, or type the limit you’re fighting and target-size mode finds the settings that fit. Audio is carried over untouched whenever possible.',
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
			{ q: 'Is my video uploaded?', a: PRIVACY_A_NO }
		],
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
			}
		],
		related: ['/compress-video', '/mov-to-mp4', '/mp4-to-webm', '/mp4-to-gif']
	},
	{
		format: 'video',
		path: '/compress-mov',
		ogImage: '/og/compress-mov.jpg',
		label: 'Compress MOV',
		feature: 'Compress MOV (QuickTime) video',
		preset: { kind: 'video', container: 'mov' },
		accept: 'video/quicktime,.mov',
		dropSubject: 'MOV files',
		dropHint: 'MOV only · multiple files supported',
		title: 'Compress MOV (QuickTime) Online — No Upload | Compress Pro',
		description:
			'Shrink MOV videos right in your browser and keep the QuickTime format — set a quality or a target size. No uploads, no watermarks. Free & private.',
		h1: 'Compress MOV videos.',
		tagline: 'Shrink QuickTime MOV files on your device — still a MOV.',
		intro:
			'Compress MOV files without changing what they are — the video is re-encoded on your own device and stays in its QuickTime container, so it drops straight back into Final Cut, QuickTime Player and every Apple workflow. Pick a quality for a smaller look-alike, or type the limit you’re fighting and target-size mode finds settings that fit. Audio is carried over untouched whenever possible, and nothing is uploaded anywhere.',
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
			{ q: 'Is my MOV uploaded?', a: PRIVACY_A_NO }
		],
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
		related: ['/mov-to-mp4', '/compress-mp4', '/compress-video']
	},
	{
		format: 'jpg',
		path: '/resize-image',
		ogImage: '/og/resize-image.jpg',
		label: 'Resize image',
		feature: 'Resize images to a longest-side cap',
		preset: { kind: 'resize', maxDimension: 1920 },
		accept:
			'image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif',
		dropSubject: 'images',
		dropHint: 'JPG, PNG, WebP, GIF & HEIC · resized locally',
		title: 'Resize Images Online — Fast, Private, No Upload | Compress Pro',
		description:
			'Resize images right in your browser — set a longest-side limit like 1920 px and photos scale down with their aspect ratio intact. No uploads, no limits. Free.',
		h1: 'Resize images.',
		tagline: 'Downscale photos to any pixel size — all in your browser.',
		intro:
			'Shrink image dimensions on your device: set the longest side — the page starts at 1920 px — and every photo scales down proportionally with smooth, high-quality resampling. The format stays what it was, compression happens in the same pass, and upscaling never happens: images already smaller than the cap pass through untouched.',
		faq: [
			{
				q: 'Does resizing keep the aspect ratio?',
				a: 'Always. You set one number — the longest side — and the other dimension follows proportionally. A 4000×3000 photo capped at 1920 px becomes 1920×1440; a portrait becomes 1440×1920.'
			},
			{
				q: 'Can it enlarge small images?',
				a: 'No — the cap is downscale-only by design. Upscaling invents pixels and makes photos blurry, so images already within your limit are left at their original size.'
			},
			{
				q: 'Which formats can I resize?',
				a: 'JPG, PNG, WebP, GIF and HEIC — drop any mix. Each keeps its own format by default, animations are resized frame by frame, and you can pick a different output format on the tab if you want conversion too.'
			},
			{ q: 'Are my photos uploaded?', a: PRIVACY_A_NO }
		],
		guide: [
			{
				heading: 'How longest-side resizing works',
				paragraphs: [
					'Thinking in “longest side” beats thinking in width×height: one number covers landscape, portrait and square images without distortion. Resizing is also where the big savings hide — a 48-megapixel phone photo holds many times the pixels a 4K screen can even show, so capping it at 1920 px routinely cuts 80–90% of the file before quality settings matter at all. Once the dimensions are right, [compressing the JPG](/compress-jpg) squeezes what remains.'
				]
			},
			{
				heading: 'Common target sizes',
				table: {
					columns: ['Use', 'Longest side'],
					rows: [
						['4K displays and print', '3840 px'],
						['Web pages & full-HD screens', '1920 px'],
						['Email and chat photos', '1280 px'],
						['Thumbnails & avatars', '640 px']
					]
				}
			},
			{
				heading: 'Resize and compress in one pass',
				paragraphs: [
					'The dimension cap and the quality slider work together in a single encode — there’s no second generation loss from doing them separately. For an upload form with a size cap, combine the cap with target-size mode: quality adapts first, and if you allow downscaling to reach the target, dimensions give way only when quality alone can’t get there.'
				]
			}
		],
		related: ['/compress-jpg', '/compress-png', '/compress-heic']
	},
	{
		format: 'jpg',
		path: '/compress-image',
		ogImage: '/og/compress-image.jpg',
		label: 'Image compressor',
		feature: 'Compress any image format',
		preset: { kind: 'image-any' },
		accept:
			'image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif',
		dropSubject: 'images',
		dropHint: 'JPG, PNG, WebP, GIF, HEIC & AVIF · compressed locally',
		title: 'Image Compressor — Free & Private, No Upload | Compress Pro',
		description:
			'Free image compressor that runs in your browser. Compress JPG, PNG, WebP, GIF, HEIC or AVIF — pick a quality or an exact target size. No uploads, no ads.',
		h1: 'Compress images.',
		tagline: 'JPG, PNG, WebP, HEIC & more — compressed on your device.',
		intro:
			'Compress any image right in your browser — JPG, PNG, WebP, GIF, HEIC and AVIF each land on the right tool automatically. Pick a quality, set an exact target size like 200 KB, or cap the dimensions; batches download as a ZIP. Nothing is uploaded, and there are no ads and no limits.',
		faq: [
			{
				q: 'Which output format should I pick?',
				a: 'Usually none — the default Auto mode tries the best formats for every image and keeps the smallest file that still looks right. Pick a specific format only when the destination demands one, like JPG for an upload form.'
			},
			{
				q: 'Is the compression lossless or lossy?',
				a: 'Your choice. The quality slider trades invisible detail for size — around 80 the difference is imperceptible for photos. PNG at quality 100 stays fully lossless, and the built-in before/after compare lets you judge every result.'
			},
			{
				q: 'Can I compress to an exact size?',
				a: 'Yes — switch to target-size mode and type the cap, like 200 KB. The tool finds the highest quality that fits under it for every image in the batch.'
			},
			{ q: 'Is it safe for private photos?', a: PRIVACY_A }
		],
		guide: [
			{
				heading: 'One dropzone, every format',
				paragraphs: [
					'Drop any mix — phone photos, screenshots, stickers, scans — and each image is handled by the codec built for it. If you know what you have, the dedicated pages expose the same engines with format-specific guidance: [Compress JPG](/compress-jpg) for photos, [Compress PNG](/compress-png) for screenshots and graphics, [Compress HEIC](/compress-heic) for iPhone shots.'
				]
			},
			{
				heading: 'The three levers, in order',
				paragraphs: [
					'Dimensions first: a photo far larger than its destination wastes more bytes than any quality setting can recover — the [image resizer](/resize-image) caps the longest side. Quality second: 75–85 covers almost every real use. Format last: Auto mode picks it per image, so you rarely need to.'
				]
			}
		],
		related: ['/compress-jpg', '/compress-png', '/compress-heic', '/resize-image']
	},
	{
		format: 'jpg',
		path: '/compress-jpg-to-100kb',
		ogImage: '/og/compress-jpg-to-100kb.jpg',
		label: 'JPG to 100 KB',
		feature: 'Compress JPG photos to 100 KB',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg', mode: 'target', targetKb: 100 },
		accept: 'image/jpeg,.jpg,.jpeg',
		dropSubject: 'JPG files',
		dropHint: 'JPG photos · squeezed under 100 KB locally',
		title: 'Compress JPEG to 100 KB Online — Free & Private | Compress Pro',
		description:
			'Compress JPG (JPEG) photos to 100 KB right in your browser — target-size mode finds the best quality that fits under the cap. No uploads, no ads. Free.',
		h1: 'Compress JPG to 100 KB.',
		tagline: 'JPG photos squeezed under 100 KB — right in your browser.',
		intro:
			'Get a JPG under 100 KB without guessing at quality sliders: this page arrives preset to target-size mode with 100 KB already typed in, and the tool searches for the best quality that fits under the cap — for every photo in the batch. Everything runs in your browser; photos are never uploaded.',
		faq: [
			{
				q: 'Will my photo look bad at 100 KB?',
				a: 'It depends on dimensions, not luck. 100 KB is workable for a 1200 px web photo and impossible for a full 12-megapixel one — enable “Allow downscaling” and the tool trims dimensions only as far as the target demands.'
			},
			{
				q: 'Can I use a different cap, like 50 or 200 KB?',
				a: 'Yes — the 100 KB is just typed in for you. Change the number to whatever the form demands: 50, 200, 500 KB or more; the search works the same at any cap.'
			},
			{
				q: 'What if 100 KB can’t be reached?',
				a: 'The tool tells you honestly instead of shipping a ruined image. Turn on “Allow downscaling” and dimensions shrink as a last resort — never below 320 px on the longest side.'
			},
			{ q: 'Are my photos uploaded?', a: PRIVACY_A_NO }
		],
		guide: [
			{
				heading: 'What actually fits in 100 KB',
				paragraphs: [
					'JPEG bytes scale with pixels: at quality 75, an 800×600 photo lands near 60–90 KB, a 1200×900 near 120–180 KB, and a 12-megapixel phone shot is hopeless without downscaling. That is why the downscale toggle matters more than the quality slider here — 100 KB at sensible dimensions looks clean; 100 KB forced onto huge dimensions looks like mud.'
				]
			},
			{
				heading: 'Where 100 KB caps come from',
				paragraphs: [
					'Government portals, job applications, visa and exam forms — especially passport-photo uploads — commonly cap images at 100 KB or 200 KB. Type whatever the form says: the mechanics are identical at any cap. For everyday shrinking without a hard limit, [Compress JPG](/compress-jpg) with the quality slider is the more natural tool, and the [image resizer](/resize-image) handles the dimensions-only case.'
				]
			}
		],
		related: ['/compress-jpg', '/resize-image', '/compress-image']
	},
	{
		format: 'font',
		path: '/subset-font',
		ogImage: '/og/subset-font.jpg',
		label: 'Subset font',
		feature: 'Subset fonts — keep only the characters you use',
		preset: { kind: 'font-op', op: 'subset' },
		accept:
			'font/ttf,font/otf,font/woff,font/woff2,application/vnd.ms-fontobject,.ttf,.otf,.woff,.woff2,.eot',
		dropSubject: 'font files',
		dropHint: 'TTF, WOFF & WOFF2 · subset locally',
		title: 'Subset Font Online — Smaller Web Fonts, Private | Compress Pro',
		description:
			'Subset fonts in your browser — keep only the character sets or exact text you need and cut web font weight dramatically. Free, private, no upload.',
		h1: 'Subset fonts.',
		tagline: 'Keep only the characters you use — subset fonts locally.',
		intro:
			'A font ships every glyph it knows; your page usually needs a fraction of them. Pick character sets or paste the exact text, and HarfBuzz — the same subsetter the big font services run — keeps just those glyphs, with kerning and ligatures intact. Everything happens in your browser.',
		steps: [
			'Drop a font — TTF, or WOFF/WOFF2 with TrueType outlines (batches work too).',
			'Tick the character sets you need, paste exact text, or pin variable axes.',
			'Subset, check the before/after glyph counts, and download the result.'
		],
		faq: [
			{
				q: 'How much smaller does a subset font get?',
				a: 'That depends on how much you cut: trimming a 2,000-glyph font down to Basic Latin routinely removes 80–95% of the glyphs. The per-file note shows the exact before/after glyph counts, so the result is never a guess.'
			},
			{
				q: 'Do kerning and ligatures survive subsetting?',
				a: 'Yes — HarfBuzz keeps the OpenType layout rules that involve the glyphs you kept and drops only the rules referencing removed glyphs. Ligatures and kerning between the letters you keep continue to work.'
			},
			{
				q: 'Why does my OTF fail with a CFF error?',
				a: 'The browser build of the subsetter handles TrueType-flavored fonts (TTF, and WOFF/WOFF2 wrapping TrueType outlines) but not PostScript CFF outlines. Converting OTF between formats still works — subsetting it currently does not.'
			},
			{ q: 'Am I allowed to subset this font?', a: FONT_LICENSE_SUBSET_A }
		],
		guide: [
			{
				heading: 'Pick the right character sets',
				paragraphs: [
					'Basic Latin covers English text, digits and ASCII punctuation; add Latin-1 accents for Western European languages and Punctuation & symbols for smart quotes, dashes and the euro sign. Building a one-off headline or a logo? Paste the exact text instead — the font shrinks to just those letters. Serve the result as WOFF2 for the web; [TTF to WOFF2](/ttf-to-woff2) handles fonts you are not subsetting.'
				]
			},
			{
				heading: 'Variable fonts',
				paragraphs: [
					'A variable font carries every weight and width in one file. When one style is all you use, pin the axes while subsetting — or use [Variable font to static](/variable-font-to-static) if pinning is the only thing you need. Leaving the axes variable works too; the character set still shrinks.'
				]
			}
		],
		related: ['/font-converter', '/variable-font-to-static', '/ttf-to-woff2']
	},
	{
		format: 'font',
		path: '/variable-font-to-static',
		ogImage: '/og/variable-font-to-static.jpg',
		label: 'Variable → static',
		feature: 'Pin variable font axes to a static instance',
		preset: { kind: 'font-op', op: 'instance' },
		accept:
			'font/ttf,font/otf,font/woff,font/woff2,application/vnd.ms-fontobject,.ttf,.otf,.woff,.woff2,.eot',
		dropSubject: 'variable fonts',
		dropHint: 'variable TTF/WOFF2 · pinned locally',
		title: 'Variable Font to Static Converter — Free, Local | Compress Pro',
		description:
			'Turn a variable font into a static instance right in your browser — pin weight, width or any axis, or keep the defaults. Free, private, no upload.',
		h1: 'Variable font to static.',
		tagline: 'Turn variable fonts into static instances — all locally.',
		intro:
			'Variable fonts pack every weight and width into one file — great on the web, awkward in tools that expect one style per file. Drop one, set a value per axis (or keep the defaults), and the axes are pinned into a normal static font, right in your browser.',
		steps: [
			'Drop a variable font — its axes (weight, width …) are detected automatically.',
			'Set a value per axis, like weight 700, or simply keep each axis default.',
			'Download the pinned static font — smaller, and it works everywhere.'
		],
		faq: [
			{
				q: 'What happens to the variation axes?',
				a: 'Each axis is pinned at the value you chose, the outlines are recalculated at that exact position, and the variation tables (fvar, gvar, avar) are removed. The result behaves like a hand-made static font of that one style.'
			},
			{
				q: 'Why make a static instance at all?',
				a: 'Older design apps and some pipelines cannot load variable fonts, embedded systems often want one small file, and a single pinned style is smaller than the full variable font when one style is genuinely all you use.'
			},
			{
				q: 'Which variable fonts work?',
				a: 'Fonts with TrueType outlines — which is nearly all of them, every variable Google Font included. Rare PostScript (CFF2) variable fonts are not supported by the browser build of the instancer.'
			},
			{ q: 'Am I allowed to modify this font?', a: FONT_LICENSE_SUBSET_A }
		],
		guide: [
			{
				heading: 'Picking the axis values',
				paragraphs: [
					'Weight (wght) runs 100–900 — 400 is regular, 700 bold. Width (wdth) is a percentage of normal. The inputs are pre-filled with each axis default, so downloading without touching anything gives you the designer-intended style. Need several styles? Run the tool once per value. To shrink the character set at the same time, use [Subset font](/subset-font) — it pins axes too.'
				]
			}
		],
		related: ['/subset-font', '/font-converter', '/woff2-to-ttf']
	}
];

/** Every valid `[[tool]]` slug — single source of truth for the param matcher. */
export const TOOL_SLUGS: readonly string[] = [...FORMATS, ...CONVERTERS, ...TOOLS].map((e) =>
	e.path.slice(1)
);

export function pathFor(format: FileFormat): string {
	// EXIF removes, ZIP archives and fonts convert rather than compress —
	// their slugs say so.
	if (format === 'exif') return '/remove-exif';
	if (format === 'zip') return '/zip-files';
	if (format === 'font') return '/font-converter';
	return `/compress-${format}`;
}

/** Resolve the seo entry for a `[[tool]]` route param (undefined → homepage). */
export function seoFor(tool: string | undefined): SeoEntry {
	if (!tool) return HOME;
	const path = `/${tool}`;
	return (
		FORMATS.find((f) => f.path === path) ??
		CONVERTERS.find((c) => c.path === path) ??
		TOOLS.find((t) => t.path === path) ??
		HOME
	);
}

/** The converter/tool entry for a route param (carries preset + accept). */
export function converterFor(tool: string | undefined): ConverterEntry | undefined {
	if (!tool) return undefined;
	const path = `/${tool}`;
	return CONVERTERS.find((c) => c.path === path) ?? TOOLS.find((t) => t.path === path);
}
