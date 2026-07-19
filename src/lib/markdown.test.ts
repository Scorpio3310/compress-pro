import { describe, expect, it } from 'vitest';
import { CATEGORY_SLUGS, SITE_URL, TOOL_SLUGS } from '$lib/seo';
import {
	FULL_CATEGORIES,
	FULL_CONVERTERS,
	FULL_FORMATS,
	FULL_PAGES,
	FULL_TOOLS,
	fullSeoFor
} from '$lib/seo-full.server';
import { homeMarkdown, llmsFullMarkdown, toolMarkdown } from './markdown';

describe('category hub markdown twins', () => {
	it('lists every tool of the group as an absolute link', () => {
		for (const category of FULL_CATEGORIES) {
			const md = toolMarkdown(category);
			expect(md, category.path).toContain(`canonical: ${SITE_URL}${category.path}`);
			expect(md, category.path).toContain(`# ${category.h1}`);
			for (const item of category.directory.flatMap((s) => s.items)) {
				expect(md, `${category.path} → ${item.path}`).toContain(
					`- [${item.name}](${SITE_URL}${item.path})`
				);
			}
		}
	});

	it('appears in llms-full with a Canonical line per hub', () => {
		const md = llmsFullMarkdown(FULL_PAGES);
		for (const slug of CATEGORY_SLUGS) {
			expect(md, slug).toContain(`Canonical: ${SITE_URL}/${slug}\n`);
		}
	});
});

describe('toolMarkdown', () => {
	const md = toolMarkdown(fullSeoFor('compress-jpg'));

	it('opens with frontmatter carrying title, description and canonical', () => {
		expect(md.startsWith('---\ntitle: "Compress JPG')).toBe(true);
		expect(md).toContain(`canonical: ${SITE_URL}/compress-jpg`);
	});

	it('renders h1, steps, guide tables and FAQ', () => {
		expect(md).toContain('# Compress JPG images.');
		expect(md).toContain('## How it works');
		expect(md).toContain('\n1. Drop files anywhere on the page');
		expect(md).toContain('| --- |');
		expect(md).toContain('| Web pages and blogs | 75–80 |');
		expect(md).toContain('### Can I hit an exact file size like 500 KB?');
	});

	it('absolutizes every internal link', () => {
		expect(md).toContain(`](${SITE_URL}/jpg-to-webp)`);
		expect(md).not.toMatch(/\]\(\//);
	});

	it('keeps per-page step overrides verbatim', () => {
		const font = toolMarkdown(fullSeoFor('font-converter'));
		expect(font).toContain('1. Drop TTF, OTF, WOFF, WOFF2 or EOT files');
	});
});

describe('llmsFullMarkdown', () => {
	const md = llmsFullMarkdown(FULL_PAGES);

	it('carries every page as a Canonical-tagged section', () => {
		expect(md.startsWith('# Compress Pro — full content\n')).toBe(true);
		expect(md).toContain(`Canonical: ${SITE_URL}/\n`);
		for (const slug of TOOL_SLUGS) {
			expect(md, slug).toContain(`Canonical: ${SITE_URL}/${slug}\n`);
		}
	});

	it('inlines full page content, not just links', () => {
		expect(md).toContain('# Compress JPG images.');
		expect(md).toContain('### Can I hit an exact file size like 500 KB?');
		expect(md).toContain('| Web pages and blogs | 75–80 |');
		// Frontmatter is only valid at the top of a file — pages must not carry it.
		expect(md).not.toContain('\ntitle: "');
	});
});

describe('homeMarkdown', () => {
	it('lists every tool page so the directory can never drift from the registry', () => {
		const md = homeMarkdown(fullSeoFor(undefined), {
			formats: FULL_FORMATS,
			converters: FULL_CONVERTERS,
			tools: FULL_TOOLS
		});
		expect(md).toContain('# Compress anything.');
		expect(md).toContain('## All tools');
		for (const slug of TOOL_SLUGS) {
			expect(md, slug).toContain(`](${SITE_URL}/${slug})`);
		}
	});
});
