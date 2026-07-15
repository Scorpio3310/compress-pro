import { CONVERTERS, FORMATS, HOME, SITE_NAME, SITE_URL, TOOLS } from '$lib/seo';
import type { SeoEntry } from '$lib/seo';

export const prerender = true;

// llms.txt (llmstxt.org): H1 + blockquote summary + H2 sections of
// `- [name](url): description` lines. AI answer engines (ChatGPT, Perplexity,
// AI Overviews) read this to cite the right tool page directly. Emitted as a
// static asset at build time, sourced from seo.ts so it can never drift.
const line = (e: SeoEntry) =>
	`- [${e.title.split(' | ')[0]}](${SITE_URL}${e.path}): ${e.description}`;

export function GET() {
	const body = [
		`# ${SITE_NAME}`,
		'',
		`> ${HOME.description}`,
		'',
		'Every tool runs entirely in the browser — files are never uploaded, there is no server-side processing, no account, no ads and no file-size limit. The app is free, open source (https://github.com/Scorpio3310/compress-pro), and keeps working offline once loaded — proof that nothing is sent anywhere.',
		'',
		`Every tool page below has a plain-markdown twin for agents — append ".md" to its URL (homepage: ${SITE_URL}/index.md). The full content of every page in one document: ${SITE_URL}/llms-full.txt`,
		'',
		'## Compress',
		'',
		...FORMATS.map(line),
		'',
		'## Convert',
		'',
		...CONVERTERS.map(line),
		'',
		'## Tools',
		'',
		...TOOLS.map(line),
		'',
		'## More',
		'',
		`- [About](${SITE_URL}/about): What ${SITE_NAME} is, how the in-browser compression works, and who builds it.`,
		`- [Privacy](${SITE_URL}/privacy): Files never leave your device — no uploads, no ads, no accounts, no cookies, no analytics.`,
		''
	].join('\n');
	return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
