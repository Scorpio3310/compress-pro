// Long-form page bodies (intro/guide/faq) for the 'images' tool group —
// extracted verbatim from the pre-split seo.ts (parity was pinned by the
// migration snapshot). This is now the authoring source for this copy;
// loaded lazily via seo-body/index.ts, statically by seo-full.server.ts.
import type { SeoBody } from '$lib/seo';
import {
	PRIVACY_A_IMAGE,
	PRIVACY_A_IMAGE_CONVERT,
	PRIVACY_A_PDF,
	PRIVACY_NO_IMAGE
} from './shared';

export const BODIES: Record<string, SeoBody> = {
	'compress-jpg': {
		intro:
			'Shrink JPG (JPEG) photos right here in your browser. Pick a quality, or name a target size like 500 KB and let the tool find the best quality that fits. **Nothing is uploaded — your photos never leave your device.** Free, with no ads, no accounts and no watermarks.',
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
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'Compression on this page runs on MozJPEG — Mozilla’s tuned JPEG encoder, the same library professional image pipelines build on — compiled to WebAssembly so it works entirely on your device. MozJPEG spends extra effort on trellis quantization and progressive scan ordering, which is where the extra quality per kilobyte comes from: slower than a stock encoder, visibly smaller at the same quality.'
				]
			}
		],
		faq: [
			{
				q: 'Is it safe to compress private photos here?',
				a: 'Yes. The pixels are decoded and re-encoded right in your browser — images are never uploaded, and the server does nothing but deliver this page. Close the tab and no trace of your photos remains. Want proof? Run one file through, switch your connection off, and run another — it still works. Compressing also strips hidden metadata — EXIF, GPS location and camera details never reach the output.'
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
		]
	},
	'compress-png': {
		intro:
			'Compress PNG images right in your browser. Keep it fully lossless, or allow smart color reduction for dramatically smaller files that still look sharp. **Nothing is uploaded — files stay on your device.** Free to use, with no ads, no sign-up and no daily limits.',
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
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'Two engines share the work here. At quality 100, OxiPNG repacks your PNG losslessly — same pixels, tighter bytes. Below that, libimagequant takes over: it is the palette-quantization engine inside pngquant, the tool famous for cutting screenshots 60–80% with no visible change. Both are compiled to WebAssembly, so every pass runs entirely on your device.'
				]
			}
		],
		faq: [
			{
				q: 'Is it safe to compress private images here?',
				a: 'Yes. The pixels are decoded and re-encoded right in your browser — images are never uploaded, and the server does nothing but deliver this page. Close the tab and no trace of your photos remains. Want proof? Run one file through, switch your connection off, and run another — it still works. Compressing also strips hidden metadata — EXIF, GPS location and camera details never reach the output.'
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
		]
	},
	'compress-webp': {
		intro:
			'Compress WebP images — including animated ones — right here in your browser. Lower the quality, hit a target size, resize, or convert to JPG or PNG. **Nothing is uploaded — files never leave your device.**',
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
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'Every WebP on this page is encoded by libwebp — Google’s reference encoder, the same code that defines the format — compiled to WebAssembly and running entirely on your device. That matters at the edges: quality 100 engages libwebp’s true lossless mode, not a high-quality approximation, so pixel-perfect graphics come out bit-exact while everything below stays tuned for photos.'
				]
			}
		],
		faq: [
			{
				q: 'Is it safe to compress private images here?',
				a: 'Yes. The pixels are decoded and re-encoded right in your browser — images are never uploaded, and the server does nothing but deliver this page. Close the tab and no trace of your photos remains. Want proof? Run one file through, switch your connection off, and run another — it still works. Compressing also strips hidden metadata — EXIF, GPS location and camera details never reach the output.'
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
		]
	},
	'compress-gif': {
		intro:
			'Compress animated GIFs entirely in your browser. Animations stay animated — frames are optimized, colors reduced, and you can resize or aim for a target size. **Nothing is uploaded — GIFs never leave your device.**',
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
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'GIF optimization here runs on gifsicle — the canonical GIF tool since the 1990s, the one nearly every optimizer wraps — compiled to WebAssembly so it works entirely in your browser. Frame-level tricks are its specialty: dropping duplicate frames, storing only the pixels that change, and tightening color palettes. Decades of GIF-specific engineering, applied without your animation ever leaving your device.'
				]
			}
		],
		faq: [
			{ q: 'Is it safe to compress private GIFs here?', a: PRIVACY_A_IMAGE },
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
		]
	},
	'compress-heic': {
		intro:
			'Compress iPhone HEIC photos right in your browser. Browsers can open HEIC but not save it, so compressed photos are exported as JPG, PNG, WebP, or AVIF — pick a quality or an exact target size like 500 KB. **Nothing is uploaded; your photos never leave your device.**',
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
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'Browsers cannot read HEIC natively, so this page brings its own decoder: libheif with libde265, compiled to WebAssembly, unpacks your iPhone photo entirely on your device. The result is then written by the destination format’s reference encoder — MozJPEG for JPG, libwebp for WebP, and so on. Two proven engines back to back, and the photo never touches a server.'
				]
			}
		],
		faq: [
			{ q: 'Is it safe to compress iPhone photos here?', a: PRIVACY_A_IMAGE },
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
		]
	},
	'compress-svg': {
		intro:
			'Minify SVG files entirely in your browser: strip comments, metadata and editor junk, clean up IDs and round coordinates to fewer decimals. **Your artwork is never uploaded — it never leaves your machine.** Need pixels instead? The output format switch renders your SVG to PNG at any size, or straight to a multi-size ICO favicon.',
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
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'Minification runs on SVGO — the standard SVG optimizer, the same tool front-end build pipelines run before shipping icons — bundled into this page so your artwork never leaves your machine. Every toggle in the panel maps to a documented SVGO plugin, so the output here matches what a professional toolchain would produce, byte for byte.'
				]
			}
		],
		faq: [
			{ q: 'Is it safe to optimize proprietary artwork here?', a: PRIVACY_A_IMAGE },
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
		]
	},
	'heic-to-jpg': {
		intro:
			'Convert iPhone HEIC photos to JPG right here in your browser — not on a server. Drop a whole camera roll, pick a quality, and download everything as a ZIP. **Your photos are never uploaded anywhere.** If you want JPG output but smaller, set a target size like 500 KB and the tool finds the best quality that fits. Free, with no ads and no limit on how many photos you convert.',
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
		faq: [
			{
				q: 'Why won’t HEIC photos open on Windows or Android?',
				a: 'HEIC is Apple’s default camera format, but support elsewhere is patchy because the format requires special licensing. Converting to JPG makes photos open in every app, browser, and upload form.'
			},
			{ q: 'Is it safe to convert personal photos here?', a: PRIVACY_A_IMAGE_CONVERT },
			{
				q: 'Does HEIC to JPG reduce quality?',
				a: 'Slightly — both formats are lossy, so there is one re-encode. At the default quality 80 the difference is invisible in practice, and you can raise the slider to 90+ for prints.'
			},
			{
				q: 'Can I convert hundreds of photos at once?',
				a: 'Yes — drop them all, convert in one run, and use Download All to get a single ZIP. Everything is processed in parallel on your own device.'
			}
		]
	},
	'heic-to-png': {
		intro:
			'Convert iPhone HEIC photos straight to lossless PNG — **everything runs in your browser**, and the pixels read from the photo are exactly the pixels PNG stores. That makes PNG the right stop before editing or archiving: no second round of lossy compression on top of HEIC’s. Drop a whole album and download the set as a ZIP.',
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
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'heic-to-avif': {
		intro:
			'Convert iPhone HEIC photos to AVIF entirely in your browser — **decoded and re-encoded on your device, never uploaded**. HEIC and AVIF are equally modern, but only one of them works on the web: AVIF displays in every current browser, while HEIC stays locked to Apple software. Batch a whole album and download the ZIP.',
		guide: [
			{
				heading: 'Two modern formats, one web-ready',
				paragraphs: [
					'Both formats compress photos far tighter than JPG — that part is a tie. The difference is reach: browsers never adopted HEIC, so an iPhone photo cannot be embedded on a website as-is, while AVIF can, at essentially the same size. For older apps and upload forms, [HEIC to JPG](/heic-to-jpg) remains the safe exit; for anything headed to the web, AVIF is the better one, and [Compress HEIC](/compress-heic) covers the keep-it-HEIC case.'
				]
			},
			{
				heading: 'Metadata is stripped',
				paragraphs: [
					'The AVIF is written clean: EXIF, GPS location and camera details do not carry over. For photos headed to the public web that is the safer default — location data in particular has no business on a website. Rotation is applied during decode, so photos come out upright.'
				]
			}
		],
		faq: [
			{
				q: 'Why AVIF instead of JPG?',
				a: 'Size at quality: AVIF stores the same photo in roughly half the bytes of an equivalent JPG. Choose JPG only when the file must open in older software — every current browser displays AVIF fine.'
			},
			{
				q: 'Does GPS location stay in the photo?',
				a: 'No — AVIF output is written without EXIF or GPS metadata. What your camera recorded stays on your device, in the original HEIC.'
			},
			{
				q: 'What can open the AVIF afterwards?',
				a: 'Browsers universally — Chrome, Edge, Firefox, and Safari from 16.1. Older desktop viewers and some upload forms may refuse it; convert those photos to JPG instead.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'heic-to-webp': {
		intro:
			'Convert iPhone HEIC photos to WebP entirely in your browser — **decoded and re-encoded on your device, never uploaded**. WebP opens where HEIC cannot: every browser, CMS and chat app of the last decade, at a fraction of the size an equivalent JPG would cost.',
		guide: [
			{
				heading: 'Why WebP for iPhone photos',
				paragraphs: [
					'HEIC is excellent on the phone and awkward everywhere else — browsers never adopted it. WebP keeps most of that efficiency while displaying across the entire web, which makes it the right export for sites, blogs and web apps. [HEIC to JPG](/heic-to-jpg) remains the pick for older desktop software and print; [HEIC to AVIF](/heic-to-avif) squeezes hardest where cutting-edge support is guaranteed.'
				]
			},
			{
				heading: 'Quality and metadata',
				paragraphs: [
					'The default quality is visually transparent for photos — judge with the built-in compare slider before batch-exporting an album. With the keep-metadata toggle on, EXIF from the HEIC carries into the WebP; leave it off and the file is written clean. Rotation is applied during decode either way, so photos come out upright.'
				]
			}
		],
		faq: [
			{
				q: 'Why WebP instead of JPG?',
				a: 'Roughly 25–35% fewer bytes at the same visual quality, plus transparency support. JPG still wins for maximum compatibility with older desktop apps, print shops and picky upload forms.'
			},
			{
				q: 'Is metadata kept?',
				a: 'Your choice — the keep-metadata toggle carries EXIF from the HEIC into the WebP; switched off, the output is written clean, which for web publishing is usually the safer default.'
			},
			{
				q: 'Can I convert a whole album at once?',
				a: 'Yes — drop hundreds of photos in one go; each converts on your device and the batch downloads as a single ZIP.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'webp-to-jpg': {
		intro:
			'Convert WebP images to JPG right in your browser — **nothing is uploaded, files never leave your device**. Handy for images saved from the web that older apps and upload forms refuse. Animated WebP converts to a single frame; transparency is flattened onto white. Batch-convert and grab everything as a ZIP.',
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
			{ q: 'Are my images uploaded during conversion?', a: PRIVACY_NO_IMAGE }
		]
	},
	'webp-to-png': {
		intro:
			'Convert WebP images to PNG entirely in your browser — opened and re-saved losslessly, all on your own device. Transparency survives intact and, at the default settings, pixels are preserved exactly. **Nothing is uploaded; your files never leave your device.**',
		guide: [
			{
				heading: 'Transparency is the point',
				paragraphs: [
					'Logos, stickers and UI cutouts ride on their transparency, and JPG destroys it — [WebP to JPG](/webp-to-jpg) flattens see-through pixels onto white. PNG keeps the alpha channel exactly, which makes it the safe export for anything that must sit on a colored background. If the result feels heavy, the [PNG compressor](/compress-png) shrinks it losslessly.'
				]
			}
		],
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
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'gif-to-webp': {
		intro:
			'Convert animated GIFs to WebP entirely in your browser — **every frame is re-encoded on your device, and the animation survives**. GIF is a 1989 format doing a 2020s job; animated WebP does the same job in typically half to a third of the bytes. Batch-convert and download everything as a ZIP.',
		guide: [
			{
				heading: 'The animation really is kept',
				paragraphs: [
					'Each frame is decoded, re-encoded and muxed into an animated WebP with the original frame timing — nothing is flattened to a still. On the rare browser without modern decoding support the tool falls back to the first frame and says so with a warning rather than failing silently. To stay in GIF instead, [Compress GIF](/compress-gif) shrinks the file without changing format.'
				]
			},
			{
				heading: 'Where the savings come from',
				paragraphs: [
					'GIF is capped at 256 colors per frame and compresses with 1980s LZW; WebP brings full-color frames and video-style compression. Photographic loops and smooth gradients gain the most — 50–70% smaller is typical, sometimes far more. For silent clips where a video file is acceptable, [GIF to MP4](/gif-to-mp4) beats both formats by another wide margin.'
				]
			}
		],
		faq: [
			{
				q: 'Does the animation survive?',
				a: 'Yes — all frames and their timing carry into the animated WebP. Only on very old browsers without the needed decoders does the tool fall back to the first frame, and it warns you when that happens.'
			},
			{
				q: 'How much smaller will my GIFs get?',
				a: 'Typically 50–70%. Photographic and gradient-heavy loops shrink the most; tiny pixel-art GIFs with few colors have the least to give.'
			},
			{
				q: 'Where does animated WebP play?',
				a: 'Every current browser and most chat and social apps display it. If a destination strictly demands GIF, keep the original and compress it on the GIF tab instead.'
			},
			{ q: 'Are my GIFs uploaded?', a: PRIVACY_NO_IMAGE }
		]
	},
	'avif-to-jpg': {
		intro:
			'Convert AVIF images to JPG entirely in your browser — **the conversion happens on your own device, with no upload step**. AVIF is the newest image format on the web, which is exactly why older editors, viewers, and upload forms still reject it. Drop a batch, convert, and download everything as a ZIP.',
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
			{ q: 'Do my AVIF files get uploaded?', a: PRIVACY_NO_IMAGE }
		]
	},
	'avif-to-png': {
		intro:
			'Convert AVIF images to lossless PNG entirely in your browser — **decoded on your own device, with no upload step**. At the default settings the decoded pixels are written to PNG exactly, transparency included, which makes PNG the right exit when an editor, pipeline or older tool refuses AVIF.',
		guide: [
			{
				heading: 'When PNG is the right exit',
				paragraphs: [
					'PNG opens in everything made in the last twenty-five years and keeps transparency intact — the safe handoff to editors and workflows that predate AVIF. The price is bytes: lossless PNG cannot match a lossy AVIF for size. If the result feels heavy, the [PNG compressor](/compress-png) shrinks it losslessly, and [AVIF to JPG](/avif-to-jpg) is the smaller pick when transparency does not matter.'
				]
			},
			{
				heading: 'Opening AVIF at all',
				paragraphs: [
					'Decoding uses your browser’s built-in AVIF support — any current Chrome, Edge or Firefox, and Safari from 16.1 on. If a file is refused on an older browser, updating the browser is the fix; nothing is wrong with the file.'
				]
			}
		],
		faq: [
			{
				q: 'Is the conversion lossless?',
				a: 'Yes — at the default quality 100 the decoded image is written to PNG without touching a pixel, transparency included. Lowering the slider switches to palette PNGs that are smaller but slightly lossy.'
			},
			{
				q: 'Will the PNG be bigger than the AVIF?',
				a: 'Almost always, and often dramatically — AVIF is one of the tightest lossy formats and PNG is lossless. That is the price of universal compatibility, not a fault in the file.'
			},
			{
				q: 'Why PNG instead of JPG?',
				a: 'JPG is far smaller but flattens transparency onto white and re-compresses lossily. Pick PNG for editing and transparency; JPG for plain sharing.'
			},
			{ q: 'Are my images uploaded anywhere?', a: PRIVACY_NO_IMAGE }
		]
	},
	'jpg-to-avif': {
		intro:
			'Convert JPG photos to AVIF right in your browser — **encoded on your own device, nothing uploaded**. AVIF is the format built a quarter-century after JPG, and it shows: the same photo at the same visual quality typically lands 30–50% smaller. Batch-convert and download everything as a ZIP.',
		guide: [
			{
				heading: 'Why AVIF lands so much smaller',
				paragraphs: [
					'AVIF borrows its compression from the AV1 video codec — decades of research JPG never had. Photos keep smooth gradients and fine detail at a fraction of the bytes, and banding-prone skies survive visibly better. On a website that compounds into faster pages and lower bandwidth on every visit. If the file must stay JPG, [Compress JPG](/compress-jpg) is the tool instead.'
				]
			},
			{
				heading: 'Where AVIF works (and where not yet)',
				paragraphs: [
					'Every current browser displays AVIF — Chrome and Edge since 2020, Firefox since 2021, Safari since 16.1. Outside the browser the picture is patchier: older editors, office suites and some upload forms still refuse it, so keep the JPG originals as masters. The trip back is one click via [AVIF to JPG](/avif-to-jpg), and [Compress AVIF](/compress-avif) re-squeezes AVIFs you already have.'
				]
			}
		],
		faq: [
			{
				q: 'How much smaller will my photos get?',
				a: 'Typically 30–50% below the source JPG at the same visual quality — more when the source was saved at a high quality setting. The before/after compare shows exactly what you are trading.'
			},
			{
				q: 'Is EXIF metadata kept?',
				a: 'No — AVIF output is always written without EXIF, GPS or camera metadata. If keeping metadata matters, convert to WebP instead, where the keep-metadata option applies.'
			},
			{
				q: 'Can I hit an exact file size?',
				a: 'Yes — switch to target-size mode and type a cap like 200 KB; the tool searches out the best quality that fits under it, for every photo in the batch.'
			},
			{ q: 'Is it safe for private photos?', a: PRIVACY_A_IMAGE }
		]
	},
	'png-to-avif': {
		intro:
			'Convert PNG images to AVIF entirely in your browser — **processed on your device, never uploaded**. AVIF keeps transparency fully intact while compressing far tighter than PNG ever can, so logos, screenshots and UI graphics shrink dramatically without losing their see-through edges.',
		guide: [
			{
				heading: 'Transparency kept, weight dropped',
				paragraphs: [
					'Like [PNG to WebP](/png-to-webp), the alpha channel survives conversion untouched; unlike it, AVIF compresses the color underneath even tighter. Graphics routinely land 70–90% smaller than the source PNG with edges just as clean. For pixel-exact needs keep a PNG master and let [Compress PNG](/compress-png) shrink it losslessly instead.'
				]
			},
			{
				heading: 'Screenshots and sharp text',
				paragraphs: [
					'AVIF handles flat panels and gradients well, but very fine text at low quality can soften. Quality 80–90 keeps UI screenshots crisp; judge with the built-in compare view before batch-exporting a whole set.'
				]
			}
		],
		faq: [
			{
				q: 'Is transparency preserved?',
				a: 'Yes — AVIF has a full alpha channel, so nothing is flattened. This is the key difference from converting to JPG, which paints transparent pixels white.'
			},
			{
				q: 'How much smaller than PNG?',
				a: 'Graphics and screenshots typically shrink 70–90%; photographic PNGs even more. PNG pays for lossless storage in bytes, and AVIF simply does not.'
			},
			{
				q: 'What happens to metadata?',
				a: 'AVIF output is written clean — any EXIF or text chunks in the PNG are stripped, which for published graphics is usually the safer default.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'webp-to-avif': {
		intro:
			'Convert WebP images to AVIF right in your browser — **re-encoded locally, never uploaded**. WebP was the web’s efficiency upgrade of the 2010s; AVIF is the same step taken again. Stills typically come out 20–40% smaller at matching visual quality, transparency included.',
		guide: [
			{
				heading: 'One generation newer',
				paragraphs: [
					'AVIF’s AV1-based compression outperforms WebP’s VP8 roots on nearly every image type — smoother gradients, cleaner detail at low quality, tighter files. The gap is biggest on photographic content and high-quality sources. Both formats enjoy universal current-browser support, so for the web this conversion is almost pure savings; [Compress WebP](/compress-webp) is the tool when the file must stay WebP.'
				]
			},
			{
				heading: 'Animated WebP: first frame only',
				paragraphs: [
					'AVIF output here is still-image only — an animated WebP converts to a single AVIF of its first frame, and the tool warns when that happens. To shrink an animation while keeping it moving, run it through [Compress WebP](/compress-webp) instead, which re-encodes animated WebP natively.'
				]
			}
		],
		faq: [
			{
				q: 'How much smaller is AVIF than WebP?',
				a: 'Typically 20–40% at the same visual quality for stills — a smaller jump than from JPG, but real. High-quality sources gain the most.'
			},
			{
				q: 'What happens to animated WebP?',
				a: 'Only the first frame is kept — AVIF output is still-image only, and a warning tells you when an animation was flattened. Keep animations in WebP instead.'
			},
			{
				q: 'Is transparency preserved?',
				a: 'Yes — both formats carry a full alpha channel, so see-through regions survive the conversion exactly.'
			},
			{ q: 'Do my files leave my device?', a: PRIVACY_NO_IMAGE }
		]
	},
	'png-to-jpg': {
		intro:
			'Convert PNG images to JPG right here **in your browser tab — nothing is uploaded**. Photographic PNGs are often 5–10× smaller as JPG with no visible difference. Transparent regions are flattened onto white, since JPG cannot store transparency. Convert in batches and download the lot as a ZIP.',
		guide: [
			{
				heading: 'Photos yes, screenshots maybe',
				paragraphs: [
					'The big savings apply to photographic content — gradients, textures, real-world scenes — where JPG routinely lands 5–10× smaller. Screenshots with sharp text and flat color panels are JPG’s weak spot: edges halo and small text fuzzes. For those, [PNG to WebP](/png-to-webp) keeps the crispness at a fraction of the size, transparency included.'
				]
			}
		],
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
			{ q: 'Is it safe for private images?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'jpg-to-webp': {
		intro:
			'Convert JPG photos to WebP right in your browser — **no uploads, no accounts, files never leave your device**. WebP typically lands 25–35% smaller than JPG at the same visual quality, which is why it is the default choice for fast websites. Batch-convert and download everything as a ZIP.',
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
			{ q: 'Are photos uploaded to a server?', a: PRIVACY_NO_IMAGE }
		]
	},
	'jpg-to-svg': {
		intro:
			'Convert JPG images to vector SVG right in your browser — **traced on your device, nothing uploaded**. Exported logos, scanned drawings and lettering become scalable, editable paths; pick color tracing or a black & white stencil.',
		guide: [
			{
				heading: 'From JPG to editable vectors',
				paragraphs: [
					'Tracing turns pixels into geometry: paths that stay sharp at billboard size and open in any vector editor. It shines on graphics that were rasterized somewhere along the way — a logo that only survives as a JPG, a scanned sketch, hand lettering. Photographs are the wrong input: they trace into heavy approximations, usually larger than the JPG itself; keep those on [Compress JPG](/compress-jpg). The finished vector can be minified further with [Compress SVG](/compress-svg).'
				]
			},
			{
				heading: 'JPEG noise and the Detail dial',
				paragraphs: [
					'JPEG compression sprinkles subtle noise around edges, and a tracer faithfully picks it up as tiny stray shapes. If the result looks speckled, lower the Detail slider — it merges small artifacts away — and clean, high-quality sources always trace best. Black & white mode ignores color noise entirely, which makes it the most forgiving choice for scans.'
				]
			}
		],
		faq: [
			{
				q: 'Which JPGs vectorize well?',
				a: 'Logos, lettering, scanned line art and drawings with flat areas. The cleaner and sharper the source, the better the trace — heavily compressed or photographic JPGs come out rough.'
			},
			{
				q: 'Why is the SVG larger than my JPG?',
				a: 'Detailed images need many paths to approximate, and each path costs bytes. Simple graphics produce small SVGs; photos rarely do — that is inherent to tracing, not a bug.'
			},
			{
				q: 'What is the black & white mode for?',
				a: 'It traces a single-color stencil — ideal for cutting machines, stamps, watermarks and one-color print, and it shrugs off JPEG color noise.'
			},
			{ q: 'Are my images uploaded?', a: PRIVACY_NO_IMAGE }
		]
	},
	'png-to-webp': {
		intro:
			'Convert PNG images to WebP entirely in your browser — **processed on your device, never uploaded**. Unlike JPG, WebP keeps transparency fully intact, so logos, UI graphics, and stickers stay see-through while shrinking dramatically. Pick a quality or a target size, convert in batches, and download a ZIP.',
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
			{ q: 'Do my files leave my device?', a: PRIVACY_NO_IMAGE }
		]
	},
	'png-to-svg': {
		intro:
			'Convert PNG images to true vector SVG entirely in your browser — **traced on your own device by the vtracer engine, never uploaded**. Logos, icons and flat graphics become infinitely scalable paths you can recolor and edit in any vector tool.',
		guide: [
			{
				heading: 'What vectorization really does',
				paragraphs: [
					'Tracing rebuilds the picture as geometric shapes instead of pixels: the result stays razor-sharp at any size and opens as editable paths in Illustrator, Inkscape or Figma. Ideal inputs are logos, icons, stickers and drawings with flat color areas. Photographs are the wrong input — the tracer approximates them with hundreds of overlapping shapes and the SVG usually ends up larger than the PNG; for photos, [Compress PNG](/compress-png) or [PNG to WebP](/png-to-webp) is the right tool. The reverse trip lives on [SVG to PNG](/svg-to-png).'
				]
			},
			{
				heading: 'Color or black & white',
				paragraphs: [
					'Color mode clusters similar colors into stacked vector layers — right for full-color logos and illustrations. Black & white mode traces a single-color stencil: perfect for cut files, stamps and one-color printing. The Detail slider trades fidelity for simplicity — higher keeps small shapes and more color steps, lower merges them into cleaner, lighter paths.'
				]
			}
		],
		faq: [
			{
				q: 'Which images vectorize well?',
				a: 'Logos, icons, lettering, stickers and flat illustrations — anything with clear edges and few distinct colors. Screenshots and photographs trace poorly; they become heavy approximations.'
			},
			{
				q: 'Why is my SVG bigger than the PNG?',
				a: 'Complex or photographic images need hundreds of paths to approximate, and paths cost bytes. That is the honest trade of tracing — for simple graphics the SVG is small; for photos it rarely is.'
			},
			{
				q: 'Can I edit the result afterwards?',
				a: 'Yes — the output is standard SVG paths, fully editable in Illustrator, Inkscape, Figma or any vector editor: recolor shapes, delete layers, refine curves.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'bmp-to-jpg': {
		intro:
			'BMP stores every pixel raw, which is why screenshots and exports balloon to megabytes. JPG keeps what the eye sees at a fraction of the size — and **the conversion runs entirely on your device**.',
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
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'bmp-to-png': {
		intro:
			'Convert BMP bitmaps to PNG entirely in your browser — **lossless by default, processed on your device**. Same pixels, dramatically fewer bytes: PNG compresses what BMP stores raw, and transparency, where the BMP carries it, survives intact.',
		guide: [
			{
				heading: 'Lossless, unlike BMP to JPG',
				paragraphs: [
					'PNG stores the decoded bitmap exactly, which makes it the right exit for diagrams, pixel art and screenshots with sharp text — everything JPG smears. Photographic BMPs are the exception: [BMP to JPG](/bmp-to-jpg) lands them far smaller with no visible cost. If the PNG itself feels heavy afterwards, [Compress PNG](/compress-png) shrinks it losslessly or via palette reduction.'
				]
			}
		],
		faq: [
			{
				q: 'Is the conversion really lossless?',
				a: 'Yes — at the default quality 100 every pixel is carried over exactly. Lowering the quality slider switches to palette PNGs: much smaller, slightly lossy, often indistinguishable for flat graphics.'
			},
			{
				q: 'How much smaller than BMP?',
				a: 'Typically 5–20× — BMP spends three or four bytes on every pixel regardless of content, while PNG actually compresses. Flat-color screenshots and diagrams shrink the most.'
			},
			{
				q: 'PNG or JPG for my BMPs?',
				a: 'PNG for graphics, text and pixel art — sharp edges stay sharp. JPG for photographic content, where it lands several times smaller again.'
			},
			{ q: 'Are my files uploaded?', a: PRIVACY_NO_IMAGE }
		]
	},
	'tiff-to-jpg': {
		intro:
			'Scanners and pro cameras love TIFF; the rest of the world does not. Convert to JPG for sharing and uploading — **the file never leaves your machine**, so even huge scans are fine.',
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
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'tiff-to-png': {
		intro:
			'Convert TIFF scans and photos to lossless PNG entirely in your browser — **no upload, and no size ceiling imposed by a server**. The decoded page is written to PNG pixel-for-pixel, giving editing pipelines and archives a universal lossless file that opens everywhere.',
		guide: [
			{
				heading: 'From archival TIFF to usable PNG',
				paragraphs: [
					'TIFF is the native tongue of scanners and pro cameras, and almost nothing else speaks it. PNG carries the same pixels losslessly and opens in every editor, browser and pipeline. Multi-page TIFFs keep their first page — export pages individually from the scanner when you need them all. Wide-gamut scans are converted to sRGB, with a note when that happens. For sharing rather than archiving, [TIFF to JPG](/tiff-to-jpg) lands far smaller, and [Compress PNG](/compress-png) squeezes the PNG itself.'
				]
			}
		],
		faq: [
			{
				q: 'Is anything lost in the conversion?',
				a: 'No pixels — at the default quality 100 the decode is written to PNG exactly. Wide-gamut color is mapped to sRGB (the tool notes when it applies), and TIFF metadata is not carried over.'
			},
			{
				q: 'What happens to multi-page TIFFs?',
				a: 'The first page converts; the rest are ignored. Scanner software can export pages as separate files when you need every page.'
			},
			{
				q: 'Why is the PNG still large?',
				a: 'PNG is lossless — a detailed 600-dpi scan simply holds a lot of information. If size matters more than perfect pixels, JPG at quality 90 is the practical compromise.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'raw-to-jpg': {
		intro:
			'Convert camera RAW files to JPG entirely in your browser — **CR2, NEF, ARW, DNG, RAF, RW2 and ORF, demosaiced on your own device by LibRaw**. Drop a whole shoot, get shareable JPGs back as a ZIP; the negatives never touch a server.',
		guide: [
			{
				heading: 'What developing a RAW actually means',
				paragraphs: [
					'A RAW file is not an image yet — it is the sensor’s mosaic of single-color readings. Developing interpolates full color for every pixel (demosaicing), applies the camera’s white balance and writes standard sRGB. This tool uses LibRaw — the same engine behind many desktop converters — with its sensible defaults, so what you get closely matches the camera’s intent. It is a fast converter, not a raw editor: for exposure surgery and profiles, develop in a dedicated tool and compress the export with [Compress JPG](/compress-jpg).'
				]
			},
			{
				heading: 'Speed, size and the other outputs',
				paragraphs: [
					'Decoding runs at full sensor resolution, so a 45-megapixel file takes a few seconds — that is real demosaicing happening locally. The output does not have to be JPG: the format pills switch to [WebP](/jpg-to-webp) or AVIF for tighter web copies, and quality, resize and target-size modes all apply after the develop. Metadata is not carried over — the output is a clean image file.'
				]
			}
		],
		faq: [
			{
				q: 'Which RAW formats are supported?',
				a: 'Canon CR2, Nikon NEF, Sony ARW, Adobe DNG, Fujifilm RAF, Panasonic RW2 and Olympus ORF — everything the bundled LibRaw engine reads. Drop a file and it either develops or tells you clearly.'
			},
			{
				q: 'Do I control the development settings?',
				a: 'The camera’s own white balance, sRGB output and standard demosaicing are applied — the same sane defaults desktop converters start from. For creative control, use a raw editor; this tool is for fast, faithful conversion.'
			},
			{
				q: 'Why is my 40 MB RAW only a few MB as JPG?',
				a: 'That is the point — RAW stores unprocessed sensor data with headroom you no longer need once developed. The JPG keeps what the photo looks like at a fraction of the weight.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE }
		]
	},
	'cr2-to-jpg': {
		intro:
			'Convert Canon CR2 RAW files to JPG right in your browser — **demosaiced locally by LibRaw, never uploaded**. EOS shoots become shareable JPGs in one drop, with quality and resize controls applied after the develop.',
		guide: [
			{
				heading: 'From EOS sensor data to a finished JPG',
				paragraphs: [
					'CR2 is Canon’s TIFF-based RAW container from the EOS era. Developing it interpolates full color from the sensor mosaic, applies your camera’s white balance and writes sRGB — LibRaw’s defaults, matching what Canon’s own software would start from. The [generic RAW converter](/raw-to-jpg) handles mixed shoots (including newer CR3 siblings it may not read — those need a desktop tool), and [Compress JPG](/compress-jpg) squeezes the results further.'
				]
			},
			{
				heading: 'Proofing a shoot in minutes',
				paragraphs: [
					'The classic CR2 chore is not one file — it is two hundred, needed as JPGs an hour after the shoot. Batch develop plus the resize control turns that into one drop; pick the settings by where the proofs are going:'
				],
				table: {
					columns: ['Deliverable', 'Setting'],
					rows: [
						[
							'Client gallery by email',
							'Resize to 2048 px, quality 75 — dozens of shots per 25 MB'
						],
						['Fast cull on a laptop', 'Resize to 1200 px — tiny files that scrub instantly'],
						['Print-shop handoff', 'Full resolution, quality 90'],
						['A portal with a hard cap', 'Target-size mode — type the limit itself']
					]
				}
			}
		],
		faq: [
			{
				q: 'Does it read CR3 too?',
				a: 'CR2 is the focus here. CR3 (newer EOS bodies) is not part of the supported set — convert those with Canon’s software or a desktop raw tool, then compress the JPG here.'
			},
			{
				q: 'Is the conversion faithful to the camera?',
				a: 'Yes within converter terms — the camera’s white balance and standard demosaicing are applied. It will closely match the embedded preview, though creative picture styles are not reproduced.'
			},
			{
				q: 'Can I convert a whole shoot at once?',
				a: 'Yes — drop hundreds of files; they develop one after another (the decoder works at full resolution) and download together as a ZIP.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'nef-to-jpg': {
		intro:
			'Convert Nikon NEF RAW files to JPG entirely in your browser — **decoded on your device by LibRaw, with nothing uploaded**. From D-SLR archives to fresh Z-series shoots, the negatives become universal JPGs in one drop.',
		guide: [
			{
				heading: 'Developing NEF without Nikon software',
				paragraphs: [
					'NEF is Nikon’s RAW container, and opening it usually means installing NX Studio or a commercial editor. Here the develop happens in the browser: demosaic, camera white balance, sRGB out — LibRaw’s faithful defaults. Mixed-brand shoots belong on the [generic RAW converter](/raw-to-jpg); the finished JPGs shrink further with [Compress JPG](/compress-jpg) or convert to [WebP](/jpg-to-webp) for the web.'
				]
			},
			{
				heading: 'Compressed NEF vs uncompressed',
				paragraphs: [
					'Nikon bodies write NEF in up to three flavors: lossless compressed (the default on most cameras — about a third smaller, pixels mathematically identical), plain compressed (“visually lossless”, smaller still), and uncompressed (mostly older bodies and cautious menus). The size difference lives entirely on the memory card.',
					'For this converter it is a non-question: all three decode through the same LibRaw path and develop to the same JPG. If you have been shooting uncompressed out of caution, the lossless-compressed menu option buys card space and costs nothing that survives to the develop.'
				]
			}
		],
		faq: [
			{
				q: 'Which Nikon bodies does this cover?',
				a: 'Anything writing standard NEF that LibRaw reads — decades of D-SLRs and Z mirrorless bodies. Compressed and uncompressed NEF variants both develop.'
			},
			{
				q: 'Will it look like the camera’s JPG?',
				a: 'Close — the camera white balance and standard demosaicing are applied. Nikon Picture Controls (vivid, flat …) are creative extras the standard develop does not reproduce.'
			},
			{
				q: 'What resolution does the JPG keep?',
				a: 'Full sensor resolution by default. Use the resize control to cap the longest side, or target-size mode to hit an exact file size.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'arw-to-jpg': {
		intro:
			'Convert Sony ARW RAW files to JPG right in your browser — **demosaiced locally, never uploaded**. Alpha-series shoots turn into shareable JPGs with the quality, resize and target-size controls applied after the develop.',
		guide: [
			{
				heading: 'Alpha RAW, developed in a tab',
				paragraphs: [
					'ARW is Sony’s RAW flavor, and the usual route to JPG runs through Imaging Edge or a paid editor. This page develops it directly: LibRaw demosaics the sensor data, applies the camera’s white balance and writes sRGB. For mixed cards use the [RAW converter](/raw-to-jpg); for web-bound exports flip the output pill to [WebP](/jpg-to-webp) or AVIF and skip a second conversion.'
				]
			},
			{
				heading: 'High-megapixel Alphas without the wait',
				paragraphs: [
					'Sony’s appeal is resolution — and a 61-megapixel A7R frame is a 120 MB negative that almost no destination wants at full size. Resizing during the develop collapses the work into one pass:'
				],
				table: {
					columns: ['Output need', 'Setting'],
					rows: [
						['Full-detail master', 'Full resolution, quality 85–90'],
						['Web and social exports', 'Resize to 2048 px — 61 MP collapses to a couple of MB'],
						[
							'Email or a form with a cap',
							'Target-size mode — the tool works backwards from the limit'
						],
						['Culling on a screen', 'Resize to 1200 px and flick through at speed']
					]
				}
			}
		],
		faq: [
			{
				q: 'Are compressed ARW files supported?',
				a: 'Yes — Sony’s compressed and uncompressed ARW variants both develop, as long as the bundled LibRaw reads the body’s files. Drop one and you will know immediately.'
			},
			{
				q: 'Why does the conversion take a few seconds?',
				a: 'Because it is a real develop: full-resolution demosaicing of every pixel, on your own hardware. A 60-megapixel A7R file is honest work — nothing is being sent anywhere.'
			},
			{
				q: 'Can I go straight to WebP or AVIF?',
				a: 'Yes — the output pills switch formats after the develop, so one pass produces web-ready files without an intermediate JPG.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'dng-to-jpg': {
		intro:
			'Convert DNG files to JPG entirely in your browser — **Adobe’s universal RAW negative, decoded on your device by LibRaw**. Phone pro-mode captures, drone shots and converted camera archives all develop into standard JPGs, nothing uploaded.',
		guide: [
			{
				heading: 'The RAW everything speaks — almost',
				paragraphs: [
					'DNG is the openly documented RAW container: phones with pro mode, drones, and Lightroom-converted archives all write it. What they don’t do is open everywhere — plenty of apps and forms still want a plain JPG, which is exactly the develop this page performs (demosaic, camera white balance, sRGB). Mixed RAW batches belong on the [RAW converter](/raw-to-jpg), and [Compress JPG](/compress-jpg) squeezes the results to any cap.'
				]
			},
			{
				heading: 'Why phone DNGs look flatter than the phone’s JPG',
				paragraphs: [
					'A phone’s JPG is not one photo — it is a stack of exposures merged, tone-mapped, denoised and sharpened by the camera pipeline. The DNG next to it is a single exposure’s sensor data, and a standard develop renders exactly that: honest colors, less punch, more visible noise in the shadows. Nothing is wrong; the computational layer simply is not in the negative.',
					'That flatness is the point — it is editing headroom. Treat the developed JPG as a neutral base for your own adjustments, and when you just want the phone look with no editing, the phone’s own JPG already is that look — shoot RAW+JPG and use each for what it is.'
				]
			}
		],
		faq: [
			{
				q: 'Where do DNG files come from?',
				a: 'Phone pro/RAW modes (Pixel, iPhone via apps), DJI drones, and Adobe tooling that converts brand RAWs to DNG for archiving. All of these develop here.'
			},
			{
				q: 'Does it handle compressed DNG?',
				a: 'Standard lossless-compressed and uncompressed DNGs develop fine. Exotic variants (lossy proxies from some apps) usually work too — the tool tells you clearly when one does not.'
			},
			{
				q: 'Is the original DNG changed?',
				a: 'Never — the negative on your disk stays untouched. You download a newly developed JPG copy next to it.'
			},
			{ q: 'Are my photos uploaded?', a: PRIVACY_NO_IMAGE }
		]
	},
	'png-to-ico': {
		intro:
			'Turn a PNG logo into a classic favicon.ico with 16–256 px versions embedded — **generated entirely in your browser, so the file never leaves your device**. Drop a square-ish PNG; transparency survives, and non-square images are centered.',
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
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'jpg-to-ico': {
		intro:
			'Turn a JPG logo or photo into a classic favicon.ico with 16–256 px versions embedded — **generated entirely in your browser, so the file never leaves your device**. Non-square images are centered on a transparent square rather than stretched.',
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
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'svg-to-png': {
		intro:
			'Render SVG artwork to pixel-perfect PNG entirely in your browser — pick the size you need and transparency is preserved. **Nothing is uploaded: logos, icons and illustrations never leave your device.**',
		guide: [
			{
				heading: 'Vector in, pixels out',
				paragraphs: [
					'An SVG scales forever; a PNG is frozen at one size — so render at the largest size you will actually use and downscale from there. For a favicon, [SVG to ICO](/svg-to-ico) builds the multi-size .ico in one step, and if the page keeps serving the vector itself, [Compress SVG](/compress-svg) makes it lighter first.'
				]
			}
		],
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
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'svg-to-ico': {
		intro:
			'SVG is the ideal favicon source: the vector is rendered fresh for the ICO, so every embedded size comes out sharp. The classic favicon.ico with 16–256 px versions is built entirely in your browser — **your artwork never leaves your device**.',
		guide: [
			{
				heading: 'One vector, every context',
				paragraphs: [
					'Keep the SVG as the master: link it as the modern favicon, ship the generated favicon.ico at your site root as the fallback, and you cover everything from retina tabs to legacy Windows. If the site serves the SVG directly, [Compress SVG](/compress-svg) trims it; for plain raster export, [SVG to PNG](/svg-to-png) renders any size.'
				]
			}
		],
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
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'resize-image': {
		intro:
			'**Shrink image dimensions on your device**: set the longest side — the page starts at 1920 px — and every photo scales down proportionally with smooth, high-quality resampling. The format stays what it was, compression happens in the same pass, and upscaling never happens: images already smaller than the cap pass through untouched.',
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
			{ q: 'Are my photos uploaded?', a: PRIVACY_NO_IMAGE }
		]
	},
	'compress-image': {
		intro:
			'Compress any image right in your browser — JPG, PNG, WebP, GIF, HEIC and AVIF each land on the right tool automatically. Pick a quality, set an exact target size like 200 KB, or cap the dimensions; batches download as a ZIP. **Nothing is uploaded, and there are no ads and no limits.**',
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
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'One dropzone, but not one engine: every image is routed to the reference encoder for its format — MozJPEG for JPG, OxiPNG and libimagequant for PNG, libwebp for WebP, libavif for AVIF — each compiled to WebAssembly and running on your device. You get the specialist tool’s results without knowing which specialist you needed; the routing happens automatically, file by file.'
				]
			}
		],
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
			{ q: 'Is it safe for private photos?', a: PRIVACY_A_IMAGE }
		]
	},
	'compress-jpg-to-100kb': {
		intro:
			'Get a JPG under 100 KB without guessing at quality sliders: this page arrives preset to target-size mode with 100 KB already typed in, and the tool searches for the best quality that fits under the cap — for every photo in the batch. **Everything runs in your browser; photos are never uploaded.**',
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
			{ q: 'Are my photos uploaded?', a: PRIVACY_NO_IMAGE }
		]
	},
	'compress-avif': {
		intro:
			'Compress AVIF images right in your browser — **re-encoded on your own device, never uploaded**. AVIF is already a tight format, but plenty of AVIFs are heavier than they need to be: design-tool exports at quality 90+, cautious converter defaults, screenshots. Pick a quality or type a target size and squeeze the excess out.',
		guide: [
			{
				heading: 'Why an AVIF can still shrink',
				paragraphs: [
					'File size in AVIF is a dial, not a property — and most encoders ship with the dial set timidly high. Re-encoding at quality 60–70 often halves a “quality 90” file with no visible change; the before/after compare tells you exactly when to stop. Target-size mode instead searches out the best quality under a hard cap like 200 KB. When a file must open in older software, [AVIF to JPG](/avif-to-jpg) is one click away, and the [image compressor](/compress-image) handles mixed batches.'
				]
			},
			{
				heading: 'What re-encoding changes',
				paragraphs: [
					'The output is a clean still AVIF: EXIF and GPS metadata are stripped (a privacy plus for web-bound images) and transparency is preserved exactly. Lossy generations do stack, so recompress from the best source you have, not from an already-crunched copy. Opening AVIF at all needs a current browser — Chrome, Edge, Firefox, or Safari from 16.1.'
				]
			}
		],
		faq: [
			{
				q: 'How much can an AVIF shrink?',
				a: 'It depends how it was made: quality-90 exports routinely drop 40–60% at quality 65 with no visible difference. Files that were already encoded aggressively have little left to give.'
			},
			{
				q: 'Is recompressing lossy?',
				a: 'Yes — each lossy re-encode costs a little fidelity, invisible once but cumulative. Compress from the original when you can, and judge with the built-in compare slider.'
			},
			{
				q: 'Is EXIF metadata kept?',
				a: 'No — the output is written clean: EXIF, GPS and camera details are stripped. For images headed to the web that is usually the safer default.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE }
		]
	},
	'psd-to-jpg': {
		intro:
			'Convert Photoshop PSD files to JPG entirely in your browser — **the flattened composite, decoded on your own device**. No Photoshop, no uploads, no accounts: drop the .psd, download the .jpg everyone can open.',
		guide: [
			{
				heading: 'What comes out of a PSD',
				paragraphs: [
					'A PSD carries the layered project plus a flattened preview of how it looked when saved — that flattened image is what converts, pixel-exact at full resolution. Layers, masks and smart objects are design-time machinery; they are not exported separately. The result is set to quality 90 by default — a faithful copy, adjustable before you run. Need transparency kept? [PSD to PNG](/psd-to-png) is the lossless sibling.'
				]
			},
			{
				heading: 'The honest limits',
				paragraphs: [
					'8-bit RGB and grayscale documents convert; CMYK and 16/32-bit files are refused with a clear message rather than mangled — re-save them as 8-bit RGB first. Files saved with “Maximize Compatibility” off may carry no flattened preview and can fail to open. This is a converter, not an editor: for tweaks you still need an image tool, but for “send me a JPG of that design”, this is the shortest path.'
				]
			}
		],
		faq: [
			{
				q: 'Do I need Photoshop installed?',
				a: 'No — the file is parsed and flattened by the decoder in this page, on your device. Nothing is installed and nothing leaves your browser.'
			},
			{
				q: 'Are individual layers exported?',
				a: 'No — the flattened composite converts as one image, exactly as the file looked when saved. Layer-by-layer export needs an editor.'
			},
			{
				q: 'Why is my PSD refused?',
				a: 'Most refusals are CMYK color or 16/32-bit depth — re-save as 8-bit RGB and it will convert. Very old or preview-less files (Maximize Compatibility off) can also fail to parse.'
			},
			{ q: 'Are my design files uploaded?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'psd-to-png': {
		intro:
			'Convert Photoshop PSD files to lossless PNG entirely in your browser — **the flattened composite with its transparency, decoded on your own device**. Drop the .psd files, download PNG twins that open everywhere. Nothing is uploaded.',
		guide: [
			{
				heading: 'Lossless, transparency included',
				paragraphs: [
					'The PNG is written at quality 100 — a pixel-exact copy of the PSD’s flattened image, and where the document carries an alpha channel, the transparency survives into the PNG. That makes this the right exit for logos, UI assets and cut-outs headed to the web or a slide deck. For photos where file size matters more than perfection, [PSD to JPG](/psd-to-jpg) lands much smaller.'
				]
			},
			{
				heading: 'What converts and what does not',
				paragraphs: [
					'8-bit RGB and grayscale PSDs convert; CMYK and 16/32-bit are refused with a clear message — re-save as 8-bit RGB first. Layers are not exported individually: the composite is the deliverable. The resulting PNG can go straight into [Compress PNG](/compress-png) if it needs to lose weight afterwards.'
				]
			}
		],
		faq: [
			{
				q: 'Is transparency preserved?',
				a: 'Yes — when the flattened composite carries an alpha channel, the PNG keeps it. Areas that were transparent in the design stay transparent.'
			},
			{
				q: 'Is the conversion really lossless?',
				a: 'Yes — PNG at quality 100 stores the flattened pixels exactly. What you saved in Photoshop is what lands in the PNG.'
			},
			{
				q: 'Can I convert many PSDs at once?',
				a: 'Yes — drop a folder’s worth; each file converts independently and everything downloads together as a ZIP if you want it in one go.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'jxl-to-jpg': {
		intro:
			'Convert JPEG XL images to universal JPG entirely in your browser — **decoded by libjxl compiled to WebAssembly, running on your own device**. JXL is a great archive format that most software still cannot open; JPG opens everywhere. Nothing is uploaded.',
		guide: [
			{
				heading: 'Why convert out of JXL',
				paragraphs: [
					'JPEG XL compresses beautifully, but support outside Safari is still thin — Chrome dropped its experiment, and most editors, viewers and upload forms simply refuse .jxl files. Converting to JPG trades some bytes for universal compatibility: mail clients, CMSes, office suites, everything opens it. Keep the JXL originals as masters; this tool produces the copies the rest of the world can read.'
				]
			},
			{
				heading: 'Quality choices that matter',
				paragraphs: [
					'JPG is lossy, so the quality slider decides how faithful the copy is — the default is visually transparent for photos. Need the opposite direction? [JPG to JXL](/jpg-to-jxl) writes new JPEG XL files, and [Compress JXL](/compress-jxl) re-squeezes existing ones without leaving the format.'
				]
			}
		],
		faq: [
			{
				q: 'Why won’t my JXL files open anywhere?',
				a: 'Browser and OS support stalled — Safari renders JXL, Chrome and most editors do not. That is exactly what this converter is for: the JPG copy opens everywhere.'
			},
			{
				q: 'Do both JXL container flavors work?',
				a: 'Yes — bare codestreams and ISO-container .jxl files are both detected by content and decoded the same way.'
			},
			{
				q: 'Is quality lost in the conversion?',
				a: 'JPG re-encoding is lossy by nature — at the default quality the difference is not visible for photos. Raise the slider to 100 for the most faithful copy.'
			},
			{ q: 'Are my images uploaded?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'jpg-to-jxl': {
		intro:
			'Convert JPG photos to JPEG XL entirely in your browser — **encoded by libjxl on your own device, typically 20–40% smaller at the same visual quality**. The format built to replace JPG, applied to your existing photos. Nothing is uploaded.',
		guide: [
			{
				heading: 'What JPEG XL buys you',
				paragraphs: [
					'JXL is the newest of the next-generation image formats — modern entropy coding, wider color, progressive decode, and file sizes that undercut JPG substantially at equal quality. For photo archives that compounds into real disk savings. The catch is support: Safari displays JXL natively, Chrome currently does not — which is why this site treats JXL as a storage and archival format rather than a web-delivery one.'
				]
			},
			{
				heading: 'Archive honestly',
				paragraphs: [
					'Converting a JPG to JXL cannot restore detail the JPG already discarded — it re-encodes what is there into fewer bytes. For a web-ready format with broad support today, [JPG to AVIF](/jpg-to-avif) is the better pick; for coming back out, [JXL to JPG](/jxl-to-jpg) reverses the trip.'
				]
			}
		],
		faq: [
			{
				q: 'How much smaller do files get?',
				a: 'Typically 20–40% below the source JPG at matching visual quality, more at lower quality settings. Target-size mode works too — type a cap and the encoder searches out the best fit.'
			},
			{
				q: 'Will the .jxl files open on my machine?',
				a: 'Safari and a growing set of image tools read JXL; Chrome and most editors still do not. Treat it as an archive format and keep this converter handy for the way back.'
			},
			{
				q: 'Is EXIF metadata kept?',
				a: 'No — JXL output is written without EXIF, GPS or camera metadata. If keeping metadata matters, convert to WebP instead, where the keep-metadata option applies.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE_CONVERT }
		]
	},
	'compress-jxl': {
		intro:
			'Compress JPEG XL images entirely in your browser — **decoded and re-encoded by libjxl on your own device**. Pick a quality or an exact target size; the result stays a .jxl. Nothing is ever uploaded.',
		guide: [
			{
				heading: 'When a JXL can still shrink',
				paragraphs: [
					'JXL files saved at high quality, exported losslessly, or produced by cameras and tools with conservative defaults carry more bytes than their content needs. Re-encoding at a sensible quality routinely halves them. Files that were already tightly compressed have little left to give — when re-encoding would grow a file, the original is returned untouched, so a batch run never makes anything worse.'
				]
			},
			{
				heading: 'Quality, target size, or lossless',
				paragraphs: [
					'The quality slider is the everyday control; target-size mode finds the best quality under a byte cap. Because the output stays JXL, this is for trimming archives in place — for copies the rest of the world opens, [JXL to JPG](/jxl-to-jpg) is one click away.'
				]
			}
		],
		faq: [
			{
				q: 'How much smaller will my files get?',
				a: 'High-quality or lossless sources often drop 40–70%; already-tight files may not shrink at all — those come back unchanged rather than bloated.'
			},
			{
				q: 'Does the file stay a JXL?',
				a: 'Yes — same format, same extension, just fewer bytes. Players and tools that opened the original open the result.'
			},
			{
				q: 'Can I set an exact size?',
				a: 'Yes — switch to target-size mode and type a cap like 500 KB; the tool searches out the best quality that fits for every file in the batch.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_IMAGE }
		]
	},
	'image-to-text': {
		intro:
			'Extract text from images entirely in your browser — **screenshots, photos of documents, scans and whiteboards, recognized on your own device**. Pick the document language, drop the images, and each one comes back as a .txt file. Nothing is ever uploaded.',
		guide: [
			{
				heading: 'What OCR reads well — and what it does not',
				paragraphs: [
					'Printed text is the sweet spot: books, receipts, screenshots, signs and scans recognize reliably when the text is sharp and reasonably horizontal. Handwriting is not — cursive and freeform notes come out garbled, and no browser OCR changes that honestly. Resolution matters too: if you can barely read it zoomed in, neither can the recognizer. Scanned PDFs have their own tool — [OCR PDF](/ocr-pdf) keeps the pages and adds a searchable layer.'
				]
			},
			{
				heading: 'Eight languages, downloaded once',
				paragraphs: [
					'Recognition models for English, Slovenian, German, Italian, French, Spanish, Portuguese and Croatian ship with the site — the one you pick (1–2 MB) downloads on first use and stays cached, so later runs work offline. Choosing the right language matters: an English model reading German text will miss every umlaut.'
				]
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'Recognition runs on Tesseract — the open-source OCR engine that has read the world’s paper for decades — compiled to WebAssembly and running in a worker on your device. The page you are on only ever serves files; your images, the recognized text and the language models all live and die in your browser. That is also why there are no page limits and no queues: your hardware does the reading.'
				]
			}
		],
		faq: [
			{
				q: 'Which languages are supported?',
				a: 'English, Slovenian, German, Italian, French, Spanish, Portuguese and Croatian. Pick the document’s language before running — recognition quality depends on it.'
			},
			{
				q: 'Does it read handwriting?',
				a: 'Not usefully — Tesseract is built for printed text. Clean print recognizes well; cursive and freeform handwriting come out garbled.'
			},
			{
				q: 'Why is my result poor?',
				a: 'Usually resolution or language: blurry, small or skewed text defeats any OCR, and the wrong language model misses accented characters. Use a sharper capture and double-check the language picker.'
			},
			{ q: 'Are my images uploaded?', a: PRIVACY_NO_IMAGE }
		]
	},
	'ocr-pdf': {
		intro:
			'Make scanned PDFs searchable entirely in your browser — **every page is recognized on your device and an invisible text layer is laid over the original**. The document looks exactly the same, but suddenly you can select, copy and Ctrl-F it. Nothing is uploaded.',
		guide: [
			{
				heading: 'An invisible layer over your original pages',
				paragraphs: [
					'The pages themselves are never re-rendered or recompressed — the original PDF is kept and only a transparent text layer is added on top, word by word, exactly where each word sits in the scan. File size barely changes and the visual quality cannot degrade. When the goal is a smaller file rather than a searchable one, [Compress PDF](/compress-pdf) is the tool; the two combine well — compress first, then recognize.'
				]
			},
			{
				heading: 'Which PDFs need OCR at all',
				paragraphs: [
					'PDFs born digital — exported from Word, invoices from software, web receipts — already carry a text layer and need nothing. Scans are the ones that don’t: a scanned contract is just photographs of paper until OCR gives it words. Recognition uses the same eight self-hosted [Tesseract languages as the image tool](/image-to-text), and picking the document’s language is what makes accented characters come out right.'
				]
			}
		],
		faq: [
			{
				q: 'Does the PDF look different afterwards?',
				a: 'No — the original pages are untouched; the added text layer is invisible. The only change you notice is that selection, copying and search suddenly work.'
			},
			{
				q: 'How accurate is the recognition?',
				a: 'On clean 300-DPI scans of printed text, very — occasional misreads happen on stamps, tables and low-quality faxes. The layer is invisible either way, so a misread never disfigures the document.'
			},
			{
				q: 'How long does a big scan take?',
				a: 'Roughly a second or two per page on a modern laptop — an 80-page contract is a coffee-length job. Everything runs locally, so nothing queues behind other people’s files.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_PDF }
		]
	}
};
