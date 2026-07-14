import { describe, expect, it } from 'vitest';
import { SITE_URL } from '$lib/seo';
import { GET } from './+server';

const body = (url: string) => GET({ url: new URL(url) }).text();

describe('robots.txt', () => {
	it('allows the production host and declares Content-Signals', async () => {
		const text = await body(`${SITE_URL}/robots.txt`);
		expect(text).toContain(
			'User-agent: *\nContent-Signal: ai-train=yes, search=yes, ai-input=yes\nAllow: /'
		);
		expect(text).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
		expect(text).not.toContain('Disallow');
	});

	it('disallows every other host, with no signals', async () => {
		const text = await body('http://localhost:8787/robots.txt');
		expect(text).toContain('User-agent: *\nDisallow: /');
		expect(text).not.toContain('Content-Signal');
		expect(text).not.toContain('Sitemap');
	});
});
