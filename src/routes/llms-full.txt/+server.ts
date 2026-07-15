import { llmsFullMarkdown } from '$lib/markdown';
import { FULL_PAGES } from '$lib/seo-full.server';

export const prerender = true;

// llms-full.txt (llmstxt.org): the companion to /llms.txt — instead of an
// index of links, the entire site's content in a single markdown document,
// for agents that prefer one fetch over walking the per-page .md twins.
// Emitted as a static asset at build time, sourced from the seo index +
// bodies via the same emitter as the twins so the surfaces can never drift.
export function GET() {
	return new Response(llmsFullMarkdown(FULL_PAGES), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
}
