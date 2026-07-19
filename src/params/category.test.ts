import { describe, expect, it } from 'vitest';
import { CATEGORY_SLUGS, TOOL_SLUGS } from '$lib/seo';
import { match } from './category';

describe('category param matcher', () => {
	it('accepts every category hub slug', () => {
		expect(CATEGORY_SLUGS.length).toBe(5);
		for (const slug of CATEGORY_SLUGS) expect(match(slug), slug).toBe(true);
	});

	it('rejects every tool slug — the matcher sets stay disjoint', () => {
		for (const slug of TOOL_SLUGS) expect(match(slug), slug).toBe(false);
	});

	it('rejects everything else (falls through to the 404 page)', () => {
		for (const bad of ['image-tool', 'tools', 'pdf', '', 'about', 'image-tools/'])
			expect(match(bad), bad).toBe(false);
	});
});
