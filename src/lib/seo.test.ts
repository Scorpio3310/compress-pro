import { describe, expect, it } from 'vitest';
import {
	CONVERTERS,
	FEATURED_PATHS,
	FORMATS,
	HOME,
	TOOLS,
	TOOL_GROUPS,
	TOOL_SLUGS,
	converterFor,
	pathFor,
	seoFor
} from './seo';
// Content assertions (title/description/tagline, steps, preset/accept, faq,
// guide) go through the server-side assembly — the light index above carries
// only the lite fields (path/label/h1/feature/demo).
import {
	FULL_CONVERTERS,
	FULL_FORMATS,
	FULL_PAGES,
	FULL_TOOLS,
	fullSeoFor
} from './seo-full.server';

const FULL_NON_HOME = [...FULL_FORMATS, ...FULL_CONVERTERS, ...FULL_TOOLS];

describe('seo entries', () => {
	it('has unique paths, titles, descriptions and h1s across every page', () => {
		for (const key of ['path', 'title', 'description', 'h1'] as const) {
			const values = FULL_PAGES.map((e) => e[key]);
			expect(new Set(values).size, `duplicate ${key}`).toBe(values.length);
		}
	});

	it('keeps taglines 55–58 chars so the hero never reflows between pages', () => {
		for (const e of FULL_PAGES) {
			expect(e.tagline.length, `${e.path} tagline "${e.tagline}"`).toBeGreaterThanOrEqual(55);
			expect(e.tagline.length, `${e.path} tagline "${e.tagline}"`).toBeLessThanOrEqual(58);
		}
	});

	it('keeps descriptions and titles within SERP-friendly lengths', () => {
		for (const e of FULL_PAGES) {
			expect(e.description.length, `${e.path} description`).toBeGreaterThanOrEqual(140);
			expect(e.description.length, `${e.path} description`).toBeLessThanOrEqual(160);
			expect(e.title.length, `${e.path} title`).toBeLessThanOrEqual(62);
		}
	});

	it('every non-home page has a 3–4 item FAQ', () => {
		for (const e of FULL_PAGES.filter((p) => p.format !== null)) {
			expect(e.faq.length, `${e.path} faq`).toBeGreaterThanOrEqual(3);
			expect(e.faq.length, `${e.path} faq`).toBeLessThanOrEqual(4);
		}
	});

	it('gives every tool page a per-page OG image derived from its path', () => {
		for (const e of FULL_NON_HOME) {
			expect(e.ogImage, e.path).toBe(`/og${e.path}.jpg`);
		}
	});

	it('every font page overrides the generic how-it-works steps', () => {
		// The generic trio talks quality/target-size/compare — none of which
		// the font pipeline has; shipping it there would be dishonest copy.
		for (const e of FULL_NON_HOME) {
			if (e.format !== 'font') continue;
			expect(e.steps, e.path).toBeDefined();
			expect(e.steps, e.path).toHaveLength(3);
		}
	});
});

describe('converter entries', () => {
	it('presets live on their hosting tab (image/svg/video/pdf/font/archive)', () => {
		for (const c of FULL_CONVERTERS) {
			if (c.preset.kind === 'image') expect(c.preset.tab, c.path).toBe(c.format);
			else if (c.preset.kind === 'svg') expect(c.format, c.path).toBe('svg');
			else if (c.preset.kind === 'video') expect(c.format, c.path).toBe('video');
			else if (c.preset.kind === 'audio') expect(c.format, c.path).toBe('audio');
			else if (c.preset.kind === 'font') expect(c.format, c.path).toBe('font');
			else if (c.preset.kind === 'archive') expect(c.format, c.path).toBe('zip');
			else if (c.preset.kind === 'subtitle') expect(c.format, c.path).toBe('subtitle');
			else if (c.preset.kind === 'ebook') expect(c.format, c.path).toBe('ebook');
			else if (c.preset.kind === 'data') expect(c.format, c.path).toBe('data');
			else expect(c.format, c.path).toBe('pdf');
		}
	});

	it('declares a "Convert …" feature line and an arrow label', () => {
		for (const c of CONVERTERS) {
			expect(c.feature, c.path).toMatch(/^Convert /);
			expect(c.label, c.path).toContain('→');
		}
	});

	it('uses "-to-" slugs that never collide with compress slugs', () => {
		// Segments may be compound (tar-gz-to-zip) — the ONE "-to-" stays load-bearing.
		for (const c of CONVERTERS) {
			expect(c.path, c.path).toMatch(/^\/[a-z0-9]+(?:-[a-z0-9]+)*-to-[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(c.path.match(/-to-/g), c.path).toHaveLength(1);
		}
	});
});

describe('tool groups (homepage directory + footer columns)', () => {
	it('partitions every FileFormat into exactly one group', () => {
		// A format outside every bucket would silently drop its pages from BOTH
		// the homepage directory and the footer — this is the tripwire.
		const covered = TOOL_GROUPS.flatMap((g) => g.formats);
		expect(new Set(covered).size, 'format in two groups').toBe(covered.length);
		expect([...covered].sort()).toEqual(FORMATS.map((f) => f.format).sort());
	});

	it('curates 4–7 existing footer picks per group, hub page first, no duplicates', () => {
		const seen = new Set<string>();
		for (const g of TOOL_GROUPS) {
			expect(g.footerPaths.length, g.title).toBeGreaterThanOrEqual(4);
			expect(g.footerPaths.length, g.title).toBeLessThanOrEqual(7);
			// seoFor falls back to HOME on unknown slugs — the round-trip catches typos.
			for (const path of g.footerPaths) {
				const entry = seoFor(path.slice(1));
				expect(entry.path, `${g.title}: ${path} must resolve`).toBe(path);
				expect(entry.format, `${g.title}: ${path} sits in the wrong column`).toSatisfy(
					(f) => f !== null && g.formats.includes(f)
				);
				expect(seen.has(path), `${g.title}: ${path} appears twice`).toBe(false);
				seen.add(path);
			}
			expect(g.formats.map(pathFor), `${g.title} leads with its hub page`).toContain(
				g.footerPaths[0]
			);
		}
	});
});

describe('tool entries (standalone pages)', () => {
	it('host their preset on the right tab, with a feature line and an accept', () => {
		const imageTabs = new Set(['jpg', 'png', 'webp', 'gif', 'heic']);
		for (const t of FULL_TOOLS) {
			if (t.preset.kind === 'image') expect(t.preset.tab, t.path).toBe(t.format);
			else if (t.preset.kind === 'resize' || t.preset.kind === 'image-any')
				expect(imageTabs.has(t.format), t.path).toBe(true);
			else if (t.preset.kind === 'video') expect(t.format, t.path).toBe('video');
			else if (t.preset.kind === 'audio') expect(t.format, t.path).toBe('audio');
			else if (t.preset.kind === 'font-op') expect(t.format, t.path).toBe('font');
			else if (t.preset.kind === 'archive') expect(t.format, t.path).toBe('zip');
			else if (t.preset.kind === 'ocr') expect(t.format, t.path).toBe('ocr');
			else if (t.preset.kind === 'ebook') expect(t.format, t.path).toBe('ebook');
			else expect(t.format, t.path).toBe('pdf');
			expect(t.feature.length, t.path).toBeGreaterThan(0);
			// Archive-create pages accept ANYTHING — an explicit '' (rendered as
			// accept-everything) instead of a non-empty list.
			if (t.preset.kind === 'archive' && t.preset.op === 'create') {
				expect(t.accept, t.path).toBe('');
			} else {
				expect(t.accept?.length ?? 0, t.path).toBeGreaterThan(0);
			}
		}
	});

	it('resolves through seoFor like converters do, with the preset in the detail', () => {
		expect(seoFor('unlock-pdf').h1).toBe('Unlock PDF files.');
		expect(FULL_TOOLS.find((t) => t.path === '/protect-pdf')?.preset).toEqual({
			kind: 'pdf-op',
			op: 'protect'
		});
	});
});

describe('engine copy', () => {
	// The "Under the hood" sections are the only place subpages name their
	// engines — keyed regexes keep the claims from silently drifting away
	// from THIRD_PARTY_LICENSES.md and the HOME engines table.
	const ENGINE_BY_PAGE: Record<string, RegExp> = {
		'/compress-jpg': /MozJPEG/,
		'/compress-png': /OxiPNG[\s\S]*libimagequant/,
		'/compress-webp': /libwebp/,
		'/compress-gif': /gifsicle/,
		'/compress-heic': /libheif/,
		'/compress-svg': /SVGO/,
		'/compress-pdf': /Ghostscript/,
		'/compress-video': /WebCodecs[\s\S]*mediabunny/,
		'/compress-audio': /LAME/,
		'/font-converter': /Brotli/,
		'/zip-files': /7-Zip/,
		'/remove-exif': /byte surgery/,
		'/image-to-text': /Tesseract/,
		'/srt-to-vtt': /pure JavaScript/,
		'/compress-epub': /MozJPEG/,
		'/compress-glb': /Draco/,
		'/csv-to-xlsx': /SheetJS/
	};

	it('every format page names its engine in an "Under the hood" section', () => {
		for (const e of FORMATS) {
			const section = fullSeoFor(e.path.slice(1)).guide?.find(
				(s) => s.heading === 'Under the hood'
			);
			expect(section, e.path).toBeDefined();
			expect(section!.paragraphs?.join(' '), e.path).toMatch(ENGINE_BY_PAGE[e.path]);
		}
	});

	it('the universal image tool names its routed encoders', () => {
		const section = fullSeoFor('compress-image').guide?.find((s) => s.heading === 'Under the hood');
		expect(section).toBeDefined();
		expect(section!.paragraphs?.join(' ')).toMatch(/MozJPEG[\s\S]*libwebp/);
	});

	it('shows each demo kind only on the page whose pipeline made its assets', () => {
		// Every demo asset is real output of one specific engine — on any other
		// page the same slider would demonstrate an engine that page doesn't run.
		const withDemo = [...FORMATS, ...CONVERTERS, ...TOOLS].filter((e) => e.demo);
		expect(Object.fromEntries(withDemo.map((e) => [e.path, e.demo]))).toEqual({
			'/compress-image': 'photo',
			'/compress-jpg': 'photo',
			'/compress-png': 'png',
			'/compress-webp': 'webp',
			'/compress-heic': 'heic',
			'/compress-gif': 'gif',
			'/compress-svg': 'svg',
			'/compress-pdf': 'pdf',
			'/compress-video': 'video',
			'/compress-mp4': 'video',
			'/compress-audio': 'audio',
			'/font-converter': 'font',
			'/zip-files': 'archive',
			'/remove-exif': 'exif'
		});
	});
});

describe('featured tools', () => {
	it('curates exactly twelve unique existing paths for the home grid', () => {
		const valid = new Set([...FORMATS, ...CONVERTERS, ...TOOLS].map((e) => e.path));
		expect(FEATURED_PATHS).toHaveLength(12);
		expect(new Set(FEATURED_PATHS).size).toBe(FEATURED_PATHS.length);
		for (const p of FEATURED_PATHS) expect(valid.has(p), p).toBe(true);
	});
});

describe('related links', () => {
	it('point at real tool pages, never at the page itself, 2–4 per page', () => {
		const valid = new Set([...FORMATS, ...CONVERTERS, ...TOOLS].map((e) => e.path));
		for (const e of FULL_NON_HOME) {
			if (!e.related) continue;
			expect(e.related.length, e.path).toBeGreaterThanOrEqual(2);
			expect(e.related.length, e.path).toBeLessThanOrEqual(4);
			for (const r of e.related) {
				expect(valid.has(r), `${e.path} → ${r}`).toBe(true);
				expect(r, e.path).not.toBe(e.path);
			}
		}
	});
});

describe('guide links', () => {
	it('point at real tool pages and never at the page itself', () => {
		const valid = new Set([...FORMATS, ...CONVERTERS, ...TOOLS].map((e) => e.path));
		for (const e of FULL_PAGES) {
			for (const section of e.guide ?? []) {
				for (const paragraph of section.paragraphs ?? []) {
					for (const match of paragraph.matchAll(/\[[^\]]+\]\((\/[a-z0-9-]+)\)/g)) {
						expect(valid.has(match[1]), `${e.path} → ${match[1]}`).toBe(true);
						expect(match[1], e.path).not.toBe(e.path);
					}
				}
			}
		}
	});

	it('keeps link syntax out of plain-text surfaces (faq, intro, meta, tables)', () => {
		// FAQ answers feed the JSON-LD FAQPage verbatim and tables render as
		// plain text — `[text](/path)` must stay a guide-paragraph-only feature.
		const hasLink = (s: string) => /\[[^\]]+\]\(\/[a-z0-9-]+\)/.test(s);
		for (const e of FULL_PAGES) {
			const plain = [
				e.title,
				e.description,
				e.tagline,
				e.intro,
				...(e.steps ?? []),
				...e.faq.flatMap((f) => [f.q, f.a]),
				...(e.guide ?? []).flatMap((s) => [
					s.heading,
					...(s.table ? [...s.table.columns, ...s.table.rows.flat()] : [])
				])
			];
			for (const s of plain) expect(hasLink(s), `${e.path}: "${s.slice(0, 50)}"`).toBe(false);
		}
	});
});

describe('resolvers', () => {
	it('seoFor finds formats, converters, and falls back to home', () => {
		expect(seoFor('compress-jpg')).toBe(FORMATS[0]);
		expect(seoFor('webp-to-jpg').h1).toBe('Convert WebP to JPG.');
		expect(seoFor(undefined)).toBe(HOME);
		expect(seoFor('nope')).toBe(HOME);
	});

	it('converterFor matches only converter slugs', () => {
		expect(converterFor('webp-to-jpg')?.path).toBe('/webp-to-jpg');
		expect(converterFor('compress-jpg')).toBeUndefined();
		expect(converterFor(undefined)).toBeUndefined();
	});

	it('TOOL_SLUGS covers formats + converters and pathFor matches its format slugs', () => {
		expect(TOOL_SLUGS).toHaveLength(FORMATS.length + CONVERTERS.length + TOOLS.length);
		for (const f of FORMATS) expect(pathFor(f.format)).toBe(f.path);
	});
});
