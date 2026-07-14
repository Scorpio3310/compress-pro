import { describe, expect, it } from 'vitest';
import { SITE_URL, TOOL_SLUGS, seoFor } from '$lib/seo';
import { homeMarkdown, toolMarkdown } from './markdown';

describe('toolMarkdown', () => {
	const md = toolMarkdown(seoFor('compress-jpg'));

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
		const font = toolMarkdown(seoFor('font-converter'));
		expect(font).toContain('1. Drop TTF, OTF, WOFF, WOFF2 or EOT files');
	});
});

describe('homeMarkdown', () => {
	it('lists every tool page so the directory can never drift from the registry', () => {
		const md = homeMarkdown();
		expect(md).toContain('# Compress anything.');
		expect(md).toContain('## All tools');
		for (const slug of TOOL_SLUGS) {
			expect(md, slug).toContain(`](${SITE_URL}/${slug})`);
		}
	});
});
