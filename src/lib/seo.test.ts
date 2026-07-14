import { describe, expect, it } from 'vitest';
import { CONVERTERS, FORMATS, HOME, TOOLS, TOOL_SLUGS, converterFor, pathFor, seoFor } from './seo';

const ALL = [HOME, ...FORMATS, ...CONVERTERS, ...TOOLS];

describe('seo entries', () => {
	it('has unique paths, titles, descriptions and h1s across every page', () => {
		for (const key of ['path', 'title', 'description', 'h1'] as const) {
			const values = ALL.map((e) => e[key]);
			expect(new Set(values).size, `duplicate ${key}`).toBe(values.length);
		}
	});

	it('keeps taglines 55–58 chars so the hero never reflows between pages', () => {
		for (const e of ALL) {
			expect(e.tagline.length, `${e.path} tagline "${e.tagline}"`).toBeGreaterThanOrEqual(55);
			expect(e.tagline.length, `${e.path} tagline "${e.tagline}"`).toBeLessThanOrEqual(58);
		}
	});

	it('keeps descriptions and titles within SERP-friendly lengths', () => {
		for (const e of ALL) {
			expect(e.description.length, `${e.path} description`).toBeGreaterThanOrEqual(140);
			expect(e.description.length, `${e.path} description`).toBeLessThanOrEqual(160);
			expect(e.title.length, `${e.path} title`).toBeLessThanOrEqual(62);
		}
	});

	it('every non-home page has a 3–4 item FAQ', () => {
		for (const e of [...FORMATS, ...CONVERTERS, ...TOOLS]) {
			expect(e.faq.length, `${e.path} faq`).toBeGreaterThanOrEqual(3);
			expect(e.faq.length, `${e.path} faq`).toBeLessThanOrEqual(4);
		}
	});

	it('gives every tool page a per-page OG image derived from its path', () => {
		for (const e of [...FORMATS, ...CONVERTERS, ...TOOLS]) {
			expect(e.ogImage, e.path).toBe(`/og${e.path}.jpg`);
		}
	});

	it('every font page overrides the generic how-it-works steps', () => {
		// The generic trio talks quality/target-size/compare — none of which
		// the font pipeline has; shipping it there would be dishonest copy.
		for (const e of [...FORMATS, ...CONVERTERS, ...TOOLS]) {
			if (e.format !== 'font') continue;
			expect(e.steps, e.path).toBeDefined();
			expect(e.steps, e.path).toHaveLength(3);
		}
	});
});

describe('converter entries', () => {
	it('presets live on their hosting tab (image/svg/video/pdf/font/archive)', () => {
		for (const c of CONVERTERS) {
			if (c.preset.kind === 'image') expect(c.preset.tab, c.path).toBe(c.format);
			else if (c.preset.kind === 'svg') expect(c.format, c.path).toBe('svg');
			else if (c.preset.kind === 'video') expect(c.format, c.path).toBe('video');
			else if (c.preset.kind === 'audio') expect(c.format, c.path).toBe('audio');
			else if (c.preset.kind === 'font') expect(c.format, c.path).toBe('font');
			else if (c.preset.kind === 'archive') expect(c.format, c.path).toBe('zip');
			else expect(c.format, c.path).toBe('pdf');
		}
	});

	it('declares a "Convert …" feature line and an arrow label', () => {
		for (const c of CONVERTERS) {
			expect(c.feature, c.path).toMatch(/^Convert /);
			expect(c.label, c.path).toContain('→');
		}
	});

	it('curates exactly twenty-two converters into the footer', () => {
		expect(CONVERTERS.filter((c) => c.inFooter)).toHaveLength(22);
	});

	it('uses "-to-" slugs that never collide with compress slugs', () => {
		// Segments may be compound (tar-gz-to-zip) — the ONE "-to-" stays load-bearing.
		for (const c of CONVERTERS) {
			expect(c.path, c.path).toMatch(/^\/[a-z0-9]+(?:-[a-z0-9]+)*-to-[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(c.path.match(/-to-/g), c.path).toHaveLength(1);
		}
	});
});

describe('tool entries (standalone pages)', () => {
	it('host their preset on the right tab, with a feature line and an accept', () => {
		const imageTabs = new Set(['jpg', 'png', 'webp', 'gif', 'heic']);
		for (const t of TOOLS) {
			if (t.preset.kind === 'image') expect(t.preset.tab, t.path).toBe(t.format);
			else if (t.preset.kind === 'resize' || t.preset.kind === 'image-any')
				expect(imageTabs.has(t.format), t.path).toBe(true);
			else if (t.preset.kind === 'video') expect(t.format, t.path).toBe('video');
			else if (t.preset.kind === 'audio') expect(t.format, t.path).toBe('audio');
			else if (t.preset.kind === 'font-op') expect(t.format, t.path).toBe('font');
			else if (t.preset.kind === 'archive') expect(t.format, t.path).toBe('zip');
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

	it('resolves through seoFor and converterFor like converters do', () => {
		expect(seoFor('unlock-pdf').h1).toBe('Unlock PDF files.');
		expect(converterFor('protect-pdf')?.preset).toEqual({ kind: 'pdf-op', op: 'protect' });
	});
});

describe('related links', () => {
	it('point at real tool pages, never at the page itself, 2–4 per page', () => {
		const valid = new Set([...FORMATS, ...CONVERTERS, ...TOOLS].map((e) => e.path));
		for (const e of [...FORMATS, ...CONVERTERS, ...TOOLS]) {
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
		for (const e of ALL) {
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
		for (const e of ALL) {
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
