// Long-form page bodies (intro/guide/faq) for the 'fonts' tool group —
// extracted verbatim from the pre-split seo.ts (parity was pinned by the
// migration snapshot). This is now the authoring source for this copy;
// loaded lazily via seo-body/index.ts, statically by seo-full.server.ts.
import type { SeoBody } from '$lib/seo';
import {
	FONT_LICENSE_A,
	FONT_LICENSE_SUBSET_A,
	FONT_LICENSE_UNWRAP_A,
	PRIVACY_A_FONT
} from './shared';

export const BODIES: Record<string, SeoBody> = {
	'font-converter': {
		intro:
			'Convert fonts between TTF, OTF, WOFF, WOFF2 and even legacy EOT — entirely in your browser. These formats are different wrappers around the same font tables, so the conversion is true repackaging: glyphs, kerning and hinting come through untouched, and **your font file never touches a server**.',
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
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'WOFF2 files are written by Google’s own woff2 encoder — the reference implementation, with Brotli compression built in — compiled to WebAssembly and running in your browser; WOFF uses classic zlib. Neither touches the letterforms: conversion is a lossless repack of the same glyph tables into a different wrapper, which is why glyphs, kerning and hinting survive every trip byte for byte.'
				]
			}
		],
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
			{ q: 'Is it private?', a: PRIVACY_A_FONT }
		]
	},
	'ttf-to-woff2': {
		intro:
			'WOFF2 is the same font wrapped in Brotli compression — the format every modern browser wants in @font-face. Drop a TTF (or a whole batch) and it comes out typically half the size, with glyphs, kerning and hinting untouched. **Nothing is uploaded anywhere.**',
		guide: [
			{
				heading: 'Using the WOFF2 on your site',
				paragraphs: [
					'Reference the converted file in CSS with @font-face: set font-family to a name of your choice and src to url(yourfont.woff2) format("woff2"). Add font-display: swap so text renders immediately while the font loads. WOFF2 covers every browser released since 2016 — a WOFF fallback is only worth it for genuinely old traffic; [TTF to WOFF](/ttf-to-woff) makes one if you need it.'
				]
			}
		],
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
			{ q: 'Is it private?', a: PRIVACY_A_FONT }
		]
	},
	'ttf-to-woff': {
		intro:
			'WOFF (the original web font format) is a zlib-compressed wrapper around your TTF — **every table comes through byte-for-byte**. Modern sites should prefer WOFF2; reach for WOFF when you must support genuinely old browsers.',
		guide: [
			{
				heading: 'Who still needs WOFF',
				paragraphs: [
					'WOFF went from Mozilla proposal to W3C standard back when Internet Explorer was still a browser people chose, and its support table shows it: everything from IE9 up reads WOFF, while WOFF2 needs browsers from around 2016. That gap — IE9 through 11, Safari on older Macs and iPhones, Android 4-era webviews — is the entire audience for this conversion.'
				],
				table: {
					columns: ['Browser', 'Reads WOFF since', 'Reads WOFF2 since'],
					rows: [
						['Internet Explorer', '9 (2011)', 'never'],
						['Chrome', '6 (2010)', '36 (2014)'],
						['Firefox', '3.6 (2010)', '39 (2015)'],
						['Safari', '5.1 (2011)', '10 (2016)']
					]
				}
			},
			{
				heading: 'Serving both from one @font-face',
				paragraphs: [
					'Keep WOFF as the second source, not the first: list the WOFF2 URL first with format("woff2"), then the WOFF with format("woff"). Browsers walk the src list top to bottom and stop at the first format they understand, so modern visitors get the smaller file and legacy ones fall through to yours. If you only have a TTF today, [TTF to WOFF2](/ttf-to-woff2) makes the first half of that pair.'
				]
			},
			{
				heading: 'What WOFF actually does to your font',
				paragraphs: [
					'A WOFF file is the same sfnt structure as your TTF with each table run through zlib — the compression scheme of ZIP files and PNGs — plus a small header and an optional metadata block. Nothing is re-encoded: glyph outlines, kerning, hinting instructions and OpenType features are stored, not interpreted, which is why the round trip back through [WOFF to TTF](/woff-to-ttf) returns the bytes you started with.'
				]
			}
		],
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
			{ q: 'Is it private?', a: PRIVACY_A_FONT }
		]
	},
	'otf-to-woff2': {
		intro:
			'OTF fonts go straight into WOFF2 with their PostScript (CFF) outlines stored as-is — **no outline conversion, no quality loss**, just Brotli compression around the same tables. The result is what modern browsers expect in @font-face.',
		guide: [
			{
				heading: 'CFF outlines ride along untouched',
				paragraphs: [
					'WOFF2 has a clever trick for TrueType fonts — a glyf transform that re-encodes outline data for better compression — but for PostScript (CFF) outlines it has none, deliberately. Your OTF’s charstrings are compressed as plain Brotli input and decode to the identical bytes. That makes OTF the most faithful format to push through WOFF2: what the browser reconstructs is exactly the font your foundry shipped.'
				]
			},
			{
				heading: 'Pro features survive the trip',
				paragraphs: [
					'OTF is the wrapper foundries prefer for their retail faces, and those fonts tend to be feature-dense: ligatures, small caps, oldstyle figures, fractions, stylistic sets. All of it lives in OpenType layout tables (GSUB, GPOS) that pass through this conversion byte for byte — enable them in CSS with font-feature-settings or font-variant and they work in the browser exactly as they do in InDesign.'
				]
			},
			{
				heading: 'One file for the web, one for the desk',
				paragraphs: [
					'A sensible workflow keeps the OTF as the master copy for installing and editing, and treats the WOFF2 purely as the delivery format your site serves. Need to go the other way later — recover a desktop file from the web font? [WOFF2 to OTF](/woff2-to-otf) unwraps it. And if a legacy project still asks for the older wrapper, [OTF to WOFF](/otf-to-woff) exists for exactly that.'
				]
			}
		],
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
			{ q: 'Is it private?', a: PRIVACY_A_FONT }
		]
	},
	'otf-to-woff': {
		intro:
			'WOFF wraps your OTF in zlib compression, table by table, byte for byte — **the PostScript outlines are untouched**. Prefer WOFF2 for modern sites; WOFF exists for the long tail of old browsers.',
		guide: [
			{
				heading: 'Check whether you need it at all',
				paragraphs: [
					'Be honest about the audience before shipping a second font file: WOFF only pays off for browsers that predate 2016. If your visitors are on anything current, [OTF to WOFF2](/otf-to-woff2) alone covers them at about three-quarters of the size. Where WOFF still earns its bytes is the stubborn long tail — enterprise desktops pinned to IE11, kiosk and point-of-sale webviews frozen years ago, intranets nobody dares to upgrade.'
				]
			},
			{
				heading: 'PostScript curves in a zlib envelope',
				paragraphs: [
					'An OTF stores letterforms as CFF charstrings — compact cubic Bézier programs inherited from PostScript. WOFF wraps that table (and every other one) in zlib compression without parsing it, so the envelope neither knows nor cares what outline flavor it carries. Decompression is exact by definition, which is why kerning, ligatures and hinting come out precisely as they went in — verifiable by round-tripping through [WOFF to OTF](/woff-to-otf).'
				]
			}
		],
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
			{ q: 'Is it private?', a: PRIVACY_A_FONT }
		]
	},
	'woff-to-ttf': {
		intro:
			'A WOFF is a compressed envelope around a desktop font — unwrapping it returns the original TTF, byte for byte, ready to install or open in a font editor. **The decompression happens entirely in your browser**.',
		guide: [
			{
				heading: 'What you can do with the unwrapped TTF',
				paragraphs: [
					'A desktop TTF opens doors the web wrapper keeps shut: install it system-wide for Word, Photoshop or video titles; open it in FontForge or Glyphs to inspect metrics and features; feed it to tools — PDF generators, game engines, embedded UIs — that read raw font files but have never heard of WOFF. If the goal is a smaller web font rather than a desktop one, [WOFF to WOFF2](/woff-to-woff2) is the shorter path.'
				]
			},
			{
				heading: 'Web fonts are often subsets',
				paragraphs: [
					'Temper expectations before treating the result as the full typeface: fonts served on the web are frequently subset to the characters the site needed — Latin only, no Cyrillic, no Greek, sometimes just the handful of glyphs in a logo. Unwrapping returns everything the WOFF contains, but it cannot restore glyphs that were stripped before publishing. Type a few accented characters into a preview to see what actually survived.'
				]
			}
		],
		faq: [
			{
				q: 'Can I install the result?',
				a: 'Yes — the output is a regular desktop font file: double-click it and Font Book (macOS) or the Windows font viewer offers to install it. Whether the license permits desktop installation is a separate question, so check it.'
			},
			{
				q: 'Why did my file come out as .otf?',
				a: 'Because that is what was inside: some WOFFs carry PostScript (CFF) outlines, which by convention use the .otf extension. Converting the outlines themselves would lose hinting and can distort shapes, so the tool keeps them intact and names the file honestly — a note explains when this happens.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_UNWRAP_A },
			{ q: 'Is it private?', a: PRIVACY_A_FONT }
		]
	},
	'woff-to-otf': {
		intro:
			'Unwrapping a WOFF returns the exact desktop font that was packaged into it. If that font has PostScript (CFF) outlines you get an .otf; if it is a TrueType font you get a .ttf — either way, **byte-identical tables and a file you can install**.',
		guide: [
			{
				heading: 'What the extension really tells you',
				paragraphs: [
					'TTF and OTF are the same container structure inside; the extension just signals which outline flavor the font carries. This tool reads the actual tables and names the output accordingly — renaming a file by hand converts nothing.'
				],
				table: {
					columns: ['Extension', 'Outlines', 'Curve math', 'Typical origin'],
					rows: [
						['.ttf', 'TrueType (glyf)', 'Quadratic Béziers', 'System fonts, Google Fonts'],
						['.otf', 'PostScript (CFF)', 'Cubic Béziers', 'Foundry retail & Adobe faces']
					]
				}
			},
			{
				heading: 'Why the tool refuses to fake it',
				paragraphs: [
					'Converting between outline flavors is possible in a font editor but never free: quadratic-to-cubic approximates curves, cubic-to-quadratic adds points, and hand-tuned hinting dies either way. A converter that silently rewrites outlines hands you a subtly worse font wearing the extension you asked for. This one unwraps what is actually there instead — the same glyphs the site rendered, under an honest name. Need the web wrapper back afterwards? [OTF to WOFF](/otf-to-woff) reverses the trip.'
				]
			}
		],
		faq: [
			{
				q: 'Why did my file come out as .ttf?',
				a: 'Because the WOFF contained TrueType outlines — .otf is by convention the extension for PostScript (CFF) outlines. Converting between outline types would cost hinting and shape fidelity, so the tool never does it: same font, honest extension, and a note tells you when it happens.'
			},
			{
				q: 'Is the unwrapped font identical to the original?',
				a: 'Yes — WOFF stores each table zlib-compressed, and decompression returns the exact original bytes: outlines, kerning, OpenType features, hinting, everything.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_UNWRAP_A },
			{ q: 'Is it private?', a: PRIVACY_A_FONT }
		]
	},
	'woff-to-woff2': {
		intro:
			'Still serving WOFF? WOFF2 carries the same font in Brotli instead of zlib — usually 25–30% smaller, supported by every browser released since 2016. The upgrade is pure recompression: **unwrap, rewrap, identical tables**.',
		guide: [
			{
				heading: 'Where the extra compression comes from',
				paragraphs: [
					'zlib, the compressor inside WOFF, dates from 1995 and looks at 32 KB of context at a time. Brotli, inside WOFF2, was designed by Google two decades later with web fonts as an explicit target: a far larger window, a built-in dictionary, and a font-specific preprocessing step that re-encodes TrueType outline data before compressing it. On real font tables the difference is remarkably consistent — expect roughly a quarter to a third of the bytes to disappear.'
				]
			},
			{
				heading: 'The payoff at page level',
				paragraphs: [
					'Fonts load early and gate text rendering, so these are critical-path bytes, not background ones. Typical results:'
				],
				table: {
					columns: ['What you serve', 'As WOFF', 'As WOFF2'],
					rows: [
						['One text weight', '~100 KB', '~72 KB'],
						['Regular + bold + italic', '~300 KB', '~215 KB'],
						['Icon font subset', '~30 KB', '~22 KB']
					]
				}
			},
			{
				heading: 'Retire the WOFF, or keep it as fallback?',
				paragraphs: [
					'Every browser released since 2016 reads WOFF2, so most sites can simply swap the URL in @font-face and delete the old file. If your audience genuinely includes IE11 or Android 4-era webviews, keep both: list the WOFF2 source first and the WOFF second, and each browser takes the best format it understands. The reverse conversion — for the day a legacy pipeline demands it — lives at [WOFF2 to WOFF](/woff2-to-woff).'
				]
			}
		],
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
			{ q: 'Is it private?', a: PRIVACY_A_FONT }
		]
	},
	'woff2-to-ttf': {
		intro:
			'WOFF2 is a Brotli-compressed envelope around a desktop font. **Decoding it in your browser** returns a TTF you can install, inspect or edit — with every glyph, kerning pair and hinting instruction intact.',
		guide: [
			{
				heading: 'Got .otf instead of .ttf?',
				paragraphs: [
					'Some web fonts carry PostScript (CFF) outlines rather than TrueType ones. Converting between outline types is lossy (hinting dies, curves get approximated), so this tool never does it — a CFF font is saved as .otf with a note. It installs exactly the same way; only the extension differs. The reverse direction lives at [TTF to WOFF2](/ttf-to-woff2).'
				]
			}
		],
		faq: [
			{
				q: 'Can I install the result?',
				a: 'Yes — the output is a regular TTF: double-click to install it on macOS or Windows. Do check the license first; a web-embedding license does not automatically allow desktop installation.'
			},
			{
				q: 'Is the TTF identical to the font that was originally encoded?',
				a: 'Functionally yes — every glyph, kerning pair, OpenType feature and hinting instruction is reconstructed exactly as the WOFF2 spec defines. The raw bytes of the glyph table may be laid out slightly differently than in the pre-encoding original, which no renderer or editor will ever notice.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_UNWRAP_A },
			{ q: 'Is it private?', a: PRIVACY_A_FONT }
		]
	},
	'woff2-to-otf': {
		intro:
			'Decoding a WOFF2 returns the desktop font it was made from. **PostScript (CFF) outlines come out byte-for-byte** — WOFF2 stores them without any transformation — so the .otf you download is exactly the font the site serves.',
		guide: [
			{
				heading: 'When you need the desktop font back',
				paragraphs: [
					'The classic scenario: a site launched years ago, the agency is gone, and the only surviving copy of the brand typeface is the .woff2 the CDN still serves. Decoding it recovers an installable OTF for the next print job, pitch deck or rebrand audit. It is equally useful for inspection — open the result in FontForge or a feature viewer to see exactly which OpenType layout rules a web font ships with.'
				]
			},
			{
				heading: 'Why CFF comes out byte-identical',
				paragraphs: [
					'WOFF2 defines an optional transform that restructures TrueType glyph data for better compression — decoders rebuild those tables equivalently, but not always bit-identically. For PostScript (CFF) outlines no such transform exists: the table goes into Brotli as-is and comes out as-is. An OTF-flavored web font therefore decodes to the exact bytes the encoder saw, kerning and all. TrueType-flavored files come back as TTF via [WOFF2 to TTF](/woff2-to-ttf) instead — same rule, other flavor.'
				]
			}
		],
		faq: [
			{
				q: 'Why did my file come out as .ttf?',
				a: 'Because the WOFF2 contained TrueType outlines — .otf is by convention reserved for PostScript (CFF) outlines. Outline conversion is lossy, so the tool keeps the original outlines and names the file honestly; a note explains it whenever that happens.'
			},
			{
				q: 'Are CFF outlines really untouched?',
				a: 'Yes — the WOFF2 format compresses CFF tables without transforming them, so decoding returns the identical bytes. Kerning, ligatures and every other OpenType feature come along unchanged.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_UNWRAP_A },
			{ q: 'Is it private?', a: PRIVACY_A_FONT }
		]
	},
	'woff2-to-woff': {
		intro:
			'Going from WOFF2 back to WOFF trades size for reach: zlib compresses less than Brotli, so expect the output to be 25–40% larger — **same font, older wrapper**. Useful when a legacy browser or an old toolchain insists on WOFF.',
		guide: [
			{
				heading: 'The short list that still wants WOFF',
				paragraphs: [
					'Downgrading only makes sense when something in the chain cannot read WOFF2 — and that list is short, specific and shrinking.'
				],
				table: {
					columns: ['Environment', 'Why it needs WOFF'],
					rows: [
						['Internet Explorer 9–11', 'WOFF2 support never shipped'],
						['Android 4.x stock browser & webviews', 'Frozen before Brotli existed'],
						['Old smart-TV & e-reader browsers', 'Engines forked around 2013–2015'],
						['Strict CMS / email-builder allowlists', 'Upload validation predates WOFF2']
					]
				}
			},
			{
				heading: 'Budget for the growth',
				paragraphs: [
					'Expect the output to land 25–40% above the WOFF2 you started with — zlib simply cannot match Brotli on font tables. A 70 KB WOFF2 typically becomes a 90–100 KB WOFF. If both files end up on the same site, serve them as a pair in @font-face with the WOFF2 listed first, so only the browsers that truly need the bigger file ever download it. Upgrading in the other direction is [WOFF to WOFF2](/woff-to-woff2).'
				]
			}
		],
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
			{ q: 'Is it private?', a: PRIVACY_A_FONT }
		]
	},
	'ttf-to-eot': {
		intro:
			'EOT (Embedded OpenType) is the web font format Internet Explorer 6–8 understood — a small metadata header in front of the unchanged TTF. If a legacy intranet or an ancient CSS pipeline still demands it, this makes one **without your font leaving the machine**.',
		guide: [
			{
				heading: 'The format that started the web-font war',
				paragraphs: [
					'Microsoft shipped Embedded OpenType with Internet Explorer 4 in 1997 — real web fonts, a decade before anyone else had them. The catch was control: EOTs made with Microsoft’s WEFT tool were bound to specific domains via a "rootstring" and optionally scrambled, a rights-management scheme foundries demanded before they would license fonts for the web at all. No other browser ever implemented it. The standoff lasted until 2009, when WOFF finally gave foundries a wrapper they could tolerate and browsers a format they would actually ship.'
				]
			},
			{
				heading: 'Serving EOT to the browsers that want it',
				paragraphs: [
					'IE6–8 parse the src of @font-face greedily and choke on multi-format lists, which is why the classic "bulletproof" syntax exists: declare src: url(font.eot) alone first, then a second src with url(font.eot?#iefix) format("embedded-opentype") ahead of the modern formats — the query-string trick stops old IE from reading past the first URL. Serve the file as application/vnd.ms-fontobject. This tool writes plain, unscrambled EOT: no rootstring, no MicroType compression, maximum compatibility.'
				]
			},
			{
				heading: 'For everything that is not old IE',
				paragraphs: [
					'A line of perspective: unless you maintain a legacy intranet, a kiosk fleet or archival reproductions of old sites, no visitor has needed an EOT since roughly 2013. The same TTF converted with [TTF to WOFF2](/ttf-to-woff2) covers every current browser at half the size — do that first, and let this page serve the museum piece.'
				]
			}
		],
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
			{ q: 'Is it private?', a: PRIVACY_A_FONT }
		]
	},
	'eot-to-ttf': {
		intro:
			'Old sites and intranets left a trail of EOT files with no desktop counterpart. Most EOTs **store the original TTF verbatim** behind a header — this unwraps it (XOR-obfuscated ones included) into a font you can install or convert onward.',
		guide: [
			{
				heading: 'Why EOT files still turn up in 2026',
				paragraphs: [
					'Every @font-face kit generated between roughly 2009 and 2015 shipped an .eot next to its .woff and .ttf — so they sit by the thousands in old theme folders, SharePoint sites, agency handover ZIPs and CMS upload directories. The unlucky discovery is the backup where the .eot is the only file that survived: the desktop original was never archived, and the WOFF beside it got lost in a migration. This tool exists for that moment.'
				]
			},
			{
				heading: 'Three kinds of EOT, two of them recoverable',
				paragraphs: [
					'Not every EOT is built the same, and the difference decides whether the font can be rescued.'
				],
				table: {
					columns: ['Variant', 'How it stores the font', 'Decodes here?'],
					rows: [
						['Plain', 'Original TTF verbatim after the header', 'Yes — byte-exact'],
						['XOR-obfuscated', 'First bytes scrambled, rest verbatim', 'Yes — byte-exact'],
						[
							'MicroType Express',
							'Proprietary MTX compression (WEFT era)',
							'No — rejected with a clear note'
						]
					]
				}
			},
			{
				heading: 'After the rescue',
				paragraphs: [
					'The unwrapped TTF installs like any desktop font and opens in any editor — and if the point of the exercise is to put the typeface back on the web properly, [TTF to WOFF2](/ttf-to-woff2) turns it into the format every current browser expects. Fonts trapped in the other legacy wrapper of that era travel the same road: [WOFF to TTF](/woff-to-ttf) handles those.'
				]
			}
		],
		faq: [
			{
				q: 'Does every EOT work?',
				a: 'Most do — plain and XOR-obfuscated EOTs decode to the exact original font. The exception is EOTs made with MicroType Express compression (some WEFT-era files): browsers cannot decode MTX, so those are rejected with a clear message. If you have the original TTF, convert from that instead.'
			},
			{
				q: 'Can I install the result?',
				a: 'Yes — the unwrapped file is a regular desktop font. Note that EOTs were often produced under embedding-only licenses, so check whether desktop installation is actually permitted for your font.'
			},
			{ q: 'Am I allowed to convert this font?', a: FONT_LICENSE_UNWRAP_A },
			{ q: 'Is it private?', a: PRIVACY_A_FONT }
		]
	},
	'subset-font': {
		intro:
			'A font ships every glyph it knows; your page usually needs a fraction of them. Pick character sets or paste the exact text, and HarfBuzz — the same subsetter the big font services run — keeps just those glyphs, with kerning and ligatures intact. **Everything happens in your browser.**',
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
		]
	},
	'variable-font-to-static': {
		intro:
			'Variable fonts pack every weight and width into one file — great on the web, awkward in tools that expect one style per file. Drop one, set a value per axis (or keep the defaults), and **the axes are pinned into a normal static font, right in your browser**.',
		guide: [
			{
				heading: 'Picking the axis values',
				paragraphs: [
					'Weight (wght) runs 100–900 — 400 is regular, 700 bold. Width (wdth) is a percentage of normal. The inputs are pre-filled with each axis default, so downloading without touching anything gives you the designer-intended style. Need several styles? Run the tool once per value. To shrink the character set at the same time, use [Subset font](/subset-font) — it pins axes too.'
				]
			}
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
		]
	}
};
