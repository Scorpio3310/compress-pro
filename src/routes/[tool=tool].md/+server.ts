import type { EntryGenerator, RequestHandler } from './$types';
import { TOOL_SLUGS } from '$lib/seo';
import { fullSeoFor } from '$lib/seo-full.server';
import { toolMarkdown } from '$lib/markdown';

export const prerender = true;

// Every tool page gets a markdown twin at `/<slug>.md` — generated from the
// same TOOL_SLUGS registry as the pages themselves, so the set can't drift
// (and svelte.config's prerender.entries doesn't grow by 94 lines).
export const entries: EntryGenerator = () => TOOL_SLUGS.map((tool) => ({ tool }));

export const GET: RequestHandler = ({ params }) =>
	new Response(toolMarkdown(fullSeoFor(params.tool)), {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
	});
