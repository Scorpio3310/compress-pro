import { describe, expect, it } from 'vitest';
import { CATEGORY_SLUGS, TOOL_SLUGS } from '$lib/seo';
import { match } from './tool';

describe('tool param matcher', () => {
	it('accepts every slug listed in seo.ts', () => {
		for (const slug of TOOL_SLUGS) expect(match(slug), slug).toBe(true);
	});

	it('rejects everything else (falls through to the 404 page)', () => {
		for (const bad of ['compress-bmp', 'jpg-to-heic', 'webp-to-jpg/', '', 'sitemap.xml', 'about'])
			expect(match(bad), bad).toBe(false);
	});

	it('rejects category hub slugs — those belong to the category matcher', () => {
		for (const slug of CATEGORY_SLUGS) expect(match(slug), slug).toBe(false);
	});
});
