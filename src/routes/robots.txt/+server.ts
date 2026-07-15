import { SITE_URL } from '$lib/seo';

// Served by the Worker at request time (not prerendered): non-production
// hosts (workers.dev previews, staging, localhost) must never be indexed —
// only the canonical production domain gets an Allow robots.txt.
export const prerender = false;

// Content-Signal (contentsignals.org) rides inside the User-agent group,
// production only — a usage signal on a Disallow'd host is contradictory
// noise. All-yes is deliberate: the pages are marketing copy for a free
// open-source tool, so search, AI answers and model training are all upside.
export function GET({ url }: { url: URL }) {
	const isProd = url.host === new URL(SITE_URL).host;
	// The llms.txt lines are comments (it is not a robots directive) — a cheap
	// redundant discovery path next to the site-wide Link header.
	const body = isProd
		? `User-agent: *\nContent-Signal: ai-train=yes, search=yes, ai-input=yes\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n\n# AI tool index: ${SITE_URL}/llms.txt\n# Full content: ${SITE_URL}/llms-full.txt\n`
		: 'User-agent: *\nDisallow: /\n';
	return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
