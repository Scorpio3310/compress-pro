/**
 * The prerender entries (svelte.config.js) and the OG-image PAGES list
 * (scripts/generate-og.mjs) are hardcoded copies of the tool registry —
 * unlike sitemap/llms.txt/the param matcher they cannot derive from seo.ts.
 * A tool added to seo.ts without those two updates would ship without its
 * prerendered page or with a 404 og:image; these tests pin both lists to
 * TOOL_SLUGS so the drift fails loudly.
 */
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import config from '../../svelte.config.js';
import { TOOL_SLUGS } from './seo';

it('svelte.config prerender entries match TOOL_SLUGS exactly', () => {
	const entries = (config.kit?.prerender?.entries ?? []).filter((e) => e !== '*' && e !== '/');
	expect([...entries].sort()).toEqual(TOOL_SLUGS.map((slug) => `/${slug}`).sort());
});

it('generate-og PAGES cover TOOL_SLUGS exactly, plus home/about/privacy', () => {
	const source = readFileSync('scripts/generate-og.mjs', 'utf8');
	const slugs = [...source.matchAll(/'og\/([a-z0-9-]+)\.jpg'/g)].map((m) => m[1]);
	expect(slugs.length, 'duplicate OG entries').toBe(new Set(slugs).size);
	// about/privacy are static routes (PageHead), not registry tools.
	expect([...slugs].sort()).toEqual([...TOOL_SLUGS, 'about', 'privacy'].sort());
	expect(source).toContain("'og.jpg'"); // the home card
});
