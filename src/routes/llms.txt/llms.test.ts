import { describe, expect, it } from 'vitest';
import { CATEGORY_SLUGS, SITE_NAME, SITE_URL, TOOL_SLUGS } from '$lib/seo';
import { GET } from './+server';

describe('llms.txt', () => {
	it('lists every tool page so the index can never drift from the registry', async () => {
		const body = await GET().text();
		expect(body.startsWith(`# ${SITE_NAME}\n`)).toBe(true);
		expect(body).toContain('\n> ');
		for (const slug of TOOL_SLUGS) {
			expect(body, slug).toContain(`](${SITE_URL}/${slug}):`);
		}
		expect(body).toContain(`${SITE_URL}/about`);
		expect(body).toContain(`${SITE_URL}/privacy`);
		expect(body, 'markdown-twin hint').toContain(`${SITE_URL}/index.md`);
		expect(body, 'full-corpus hint').toContain(`${SITE_URL}/llms-full.txt`);
	});

	it('lists the category hub pages under their own section', async () => {
		const body = await GET().text();
		expect(body).toContain('\n## Categories\n');
		for (const slug of CATEGORY_SLUGS) {
			expect(body, slug).toContain(`](${SITE_URL}/${slug}):`);
		}
	});
});
