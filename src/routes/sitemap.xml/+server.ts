import { SITE_URL, HOME, FORMATS, CONVERTERS, TOOLS, TOOL_GROUPS } from '$lib/seo';

export const prerender = true;

// Emitted as a static asset at build time — sourced from seo.ts so the sitemap
// can never drift from the actual page list. Deliberately no <lastmod>: a
// build-date stamp on every URL marks all pages "changed" each deploy, a
// signal search engines learn to ignore.
export function GET() {
	const paths = [
		HOME.path,
		...FORMATS.map((f) => f.path),
		...CONVERTERS.map((c) => c.path),
		...TOOLS.map((t) => t.path),
		...TOOL_GROUPS.map((g) => g.categoryPath),
		'/about',
		'/privacy'
	];
	const body =
		'<?xml version="1.0" encoding="UTF-8"?>' +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
		paths.map((p) => `<url><loc>${SITE_URL}${p}</loc></url>`).join('') +
		'</urlset>';
	return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
