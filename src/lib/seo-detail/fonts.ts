// Per-page head/meta + intake details (title/description/tagline/og, steps,
// related, converter preset/accept) for the 'fonts' tool group — extracted
// verbatim from the pre-split seo.ts (parity is pinned by the byte-identical
// prerender diff). This is now the authoring source for these fields; loaded
// lazily via seo-detail/index.ts, statically by seo-full.server.ts.
import type { ConverterDetail, SeoDetail } from '$lib/seo';

// The generic How-it-works trio talks quality/target-size — nonsense for
// fonts, so every font page overrides it (seo.test.ts enforces this).
const FONT_STEPS: [string, string, string] = [
	'Drop TTF, OTF, WOFF, WOFF2 or EOT files anywhere on the page — or click to browse.',
	'Pick the output format — the font tables are repackaged losslessly, never re-drawn.',
	'Convert, then download each font on its own or the whole batch as a ZIP.'
];

export const DETAILS: Record<string, SeoDetail | ConverterDetail> = {
	'font-converter': {
		steps: FONT_STEPS,
		ogImage: '/og/font-converter.jpg',
		title: 'Font Converter — TTF, OTF, WOFF, WOFF2 Online | Compress Pro',
		description:
			'Convert fonts between TTF, OTF, WOFF and WOFF2 right in your browser. Lossless repackaging — glyphs, kerning and hinting survive. Free, nothing uploaded.',
		tagline: 'TTF, OTF, WOFF & WOFF2 — converted right in your browser.',
		related: ['/ttf-to-woff2', '/woff2-to-ttf', '/subset-font']
	},
	'ttf-to-woff2': {
		steps: FONT_STEPS,
		ogImage: '/og/ttf-to-woff2.jpg',
		preset: { kind: 'font', to: 'woff2' },
		accept: 'font/ttf,.ttf',
		dropSubject: 'TTF fonts',
		dropHint: 'TTF fonts · repackaged to WOFF2 locally',
		title: 'TTF to WOFF2 Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert TTF fonts to WOFF2 in your browser — typically half the size, identical glyphs, kerning and hinting. Nothing is uploaded. Free, no sign-up.',
		tagline: 'Turn desktop TTF fonts into web-ready WOFF2 — privately.',
		related: ['/font-converter', '/otf-to-woff2', '/woff2-to-ttf']
	},
	'ttf-to-woff': {
		steps: FONT_STEPS,
		ogImage: '/og/ttf-to-woff.jpg',
		preset: { kind: 'font', to: 'woff' },
		accept: 'font/ttf,.ttf',
		dropSubject: 'TTF fonts',
		dropHint: 'TTF fonts · wrapped as WOFF locally',
		title: 'TTF to WOFF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert TTF to WOFF in your browser — a byte-exact zlib wrapper for older browsers. Your font never leaves your device. Free, private, no sign-up.',
		tagline: 'TTF wrapped as WOFF for legacy browsers — all in-browser.',
		related: ['/ttf-to-woff2', '/font-converter', '/woff-to-ttf']
	},
	'otf-to-woff2': {
		steps: FONT_STEPS,
		ogImage: '/og/otf-to-woff2.jpg',
		preset: { kind: 'font', to: 'woff2' },
		accept: 'font/otf,.otf',
		dropSubject: 'OTF fonts',
		dropHint: 'OTF fonts · repackaged to WOFF2 locally',
		title: 'OTF to WOFF2 Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert OTF fonts to WOFF2 in your browser — smaller for the web, with CFF outlines stored byte-for-byte. Nothing is uploaded. Free and private.',
		tagline: 'Web-ready WOFF2 from your OTF fonts — nothing uploaded.',
		related: ['/font-converter', '/ttf-to-woff2', '/woff2-to-otf']
	},
	'otf-to-woff': {
		steps: FONT_STEPS,
		ogImage: '/og/otf-to-woff.jpg',
		preset: { kind: 'font', to: 'woff' },
		accept: 'font/otf,.otf',
		dropSubject: 'OTF fonts',
		dropHint: 'OTF fonts · wrapped as WOFF locally',
		title: 'OTF to WOFF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert OTF to WOFF in your browser — a lossless zlib wrapper for older browsers. Your font file never leaves your device. Free, private, no sign-up.',
		tagline: 'OTF wrapped as WOFF for legacy browsers — all in-browser.',
		related: ['/otf-to-woff2', '/font-converter', '/woff-to-otf']
	},
	'woff-to-ttf': {
		steps: FONT_STEPS,
		ogImage: '/og/woff-to-ttf.jpg',
		preset: { kind: 'font', to: 'ttf' },
		accept: 'font/woff,application/font-woff,.woff',
		dropSubject: 'WOFF fonts',
		dropHint: 'WOFF web fonts · unwrapped locally',
		title: 'WOFF back to TTF — Unpack a Web Font Free | Compress Pro',
		description:
			'Convert WOFF web fonts back to installable TTF in your browser — the original font data, unwrapped losslessly. Nothing uploaded. Free, no sign-up.',
		tagline: 'Unwrap WOFF web fonts back to installable TTF — locally.',
		related: ['/woff-to-woff2', '/font-converter', '/woff2-to-ttf']
	},
	'woff-to-otf': {
		steps: FONT_STEPS,
		ogImage: '/og/woff-to-otf.jpg',
		preset: { kind: 'font', to: 'otf' },
		accept: 'font/woff,application/font-woff,.woff',
		dropSubject: 'WOFF fonts',
		dropHint: 'WOFF web fonts · unwrapped locally',
		title: 'WOFF back to OTF — Unpack Web Fonts Locally | Compress Pro',
		description:
			'Convert WOFF web fonts back to desktop OTF in your browser — the original CFF font, unwrapped losslessly. Nothing is uploaded. Free and private.',
		tagline: 'Unwrap WOFF web fonts back to desktop OTF — in-browser.',
		related: ['/woff-to-ttf', '/font-converter', '/otf-to-woff']
	},
	'woff-to-woff2': {
		steps: FONT_STEPS,
		ogImage: '/og/woff-to-woff2.jpg',
		preset: { kind: 'font', to: 'woff2' },
		accept: 'font/woff,application/font-woff,.woff',
		dropSubject: 'WOFF fonts',
		dropHint: 'WOFF web fonts · upgraded to WOFF2 locally',
		title: 'WOFF to WOFF2 Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert WOFF to WOFF2 in your browser — Brotli recompression makes web fonts about a quarter smaller, losslessly. Nothing uploaded. Free, no sign-up.',
		tagline: 'Upgrade WOFF fonts to smaller WOFF2 — nothing uploaded.',
		related: ['/ttf-to-woff2', '/font-converter', '/woff2-to-woff']
	},
	'woff2-to-ttf': {
		steps: FONT_STEPS,
		ogImage: '/og/woff2-to-ttf.jpg',
		preset: { kind: 'font', to: 'ttf' },
		accept: 'font/woff2,.woff2',
		dropSubject: 'WOFF2 fonts',
		dropHint: 'WOFF2 web fonts · decoded locally',
		title: 'WOFF2 back to TTF — Edit & Install Anywhere | Compress Pro',
		description:
			'Convert WOFF2 web fonts to installable TTF in your browser — glyphs, kerning and hinting all preserved. Nothing is uploaded. Free, private, no sign-up.',
		tagline: 'Unpack WOFF2 web fonts into installable TTF — privately.',
		related: ['/ttf-to-woff2', '/font-converter', '/woff2-to-otf']
	},
	'woff2-to-otf': {
		steps: FONT_STEPS,
		ogImage: '/og/woff2-to-otf.jpg',
		preset: { kind: 'font', to: 'otf' },
		accept: 'font/woff2,.woff2',
		dropSubject: 'WOFF2 fonts',
		dropHint: 'WOFF2 web fonts · decoded locally',
		title: 'WOFF2 back to OTF — Recover Desktop Fonts | Compress Pro',
		description:
			'Convert WOFF2 web fonts to desktop OTF in your browser — the CFF font data comes out byte-for-byte intact. Nothing uploaded. Free, private, no sign-up.',
		tagline: 'Unpack WOFF2 web fonts into desktop OTF — in your browser.',
		related: ['/woff2-to-ttf', '/font-converter', '/otf-to-woff2']
	},
	'woff2-to-woff': {
		steps: FONT_STEPS,
		ogImage: '/og/woff2-to-woff.jpg',
		preset: { kind: 'font', to: 'woff' },
		accept: 'font/woff2,.woff2',
		dropSubject: 'WOFF2 fonts',
		dropHint: 'WOFF2 web fonts · repacked as WOFF locally',
		title: 'WOFF2 down to WOFF — Legacy Browser Support | Compress Pro',
		description:
			'Convert WOFF2 to WOFF in your browser for legacy browser support — lossless, though zlib output is larger. Nothing is uploaded. Free, private, no limits.',
		tagline: 'Repack WOFF2 as WOFF for legacy browsers — output grows.',
		related: ['/woff-to-woff2', '/font-converter', '/woff2-to-ttf']
	},
	'ttf-to-eot': {
		steps: FONT_STEPS,
		ogImage: '/og/ttf-to-eot.jpg',
		preset: { kind: 'font', to: 'eot' },
		accept: 'font/ttf,.ttf',
		dropSubject: 'TTF fonts',
		dropHint: 'TTF fonts · wrapped as EOT locally',
		title: 'TTF to EOT for Legacy IE — Free, On-Device | Compress Pro',
		description:
			'Convert TTF fonts to EOT for Internet Explorer 6–8 in your browser — a lossless header wrapper. Your font never leaves your device. Free, no sign-up.',
		tagline: 'EOT files for the old Internet Explorer — created locally.',
		related: ['/eot-to-ttf', '/font-converter', '/ttf-to-woff2']
	},
	'eot-to-ttf': {
		steps: FONT_STEPS,
		ogImage: '/og/eot-to-ttf.jpg',
		preset: { kind: 'font', to: 'ttf' },
		accept: 'application/vnd.ms-fontobject,.eot',
		dropSubject: 'EOT fonts',
		dropHint: 'legacy EOT fonts · decoded locally',
		title: 'EOT to TTF Converter — Free, Private, Local | Compress Pro',
		description:
			'Convert legacy EOT fonts back to TTF in your browser — plain and XOR-obfuscated EOTs decode losslessly. Nothing is uploaded. Free, private, no sign-up.',
		tagline: 'Rescue fonts from legacy EOT files — decoded in-browser.',
		related: ['/ttf-to-eot', '/font-converter', '/woff-to-ttf']
	},
	'subset-font': {
		ogImage: '/og/subset-font.jpg',
		preset: { kind: 'font-op', op: 'subset' },
		accept:
			'font/ttf,font/otf,font/woff,font/woff2,application/vnd.ms-fontobject,.ttf,.otf,.woff,.woff2,.eot',
		dropSubject: 'font files',
		dropHint: 'TTF, WOFF & WOFF2 · subset locally',
		title: 'Subset Font Online — Smaller Web Fonts, Private | Compress Pro',
		description:
			'Subset fonts in your browser — keep only the character sets or exact text you need and cut web font weight dramatically. Free, private, no upload.',
		tagline: 'Keep only the characters you use — subset fonts locally.',
		steps: [
			'Drop a font — TTF, or WOFF/WOFF2 with TrueType outlines (batches work too).',
			'Tick the character sets you need, paste exact text, or pin variable axes.',
			'Subset, check the before/after glyph counts, and download the result.'
		],
		related: ['/font-converter', '/variable-font-to-static', '/ttf-to-woff2']
	},
	'variable-font-to-static': {
		ogImage: '/og/variable-font-to-static.jpg',
		preset: { kind: 'font-op', op: 'instance' },
		accept:
			'font/ttf,font/otf,font/woff,font/woff2,application/vnd.ms-fontobject,.ttf,.otf,.woff,.woff2,.eot',
		dropSubject: 'variable fonts',
		dropHint: 'variable TTF/WOFF2 · pinned locally',
		title: 'Variable Font to Static Converter — Free, Local | Compress Pro',
		description:
			'Turn a variable font into a static instance right in your browser — pin weight, width or any axis, or keep the defaults. Free, private, no upload.',
		tagline: 'Turn variable fonts into static instances — all locally.',
		steps: [
			'Drop a variable font — its axes (weight, width …) are detected automatically.',
			'Set a value per axis, like weight 700, or simply keep each axis default.',
			'Download the pinned static font — smaller, and it works everywhere.'
		],
		related: ['/subset-font', '/font-converter', '/woff2-to-ttf']
	}
};
