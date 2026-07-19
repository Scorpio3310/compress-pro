import type { EntryGenerator, RequestHandler } from './$types';
import { CATEGORY_SLUGS } from '$lib/seo';
import { CATEGORY_BY_SLUG } from '$lib/seo-categories';
import { toolMarkdown } from '$lib/markdown';

export const prerender = true;

// Category hubs get markdown twins exactly like tool pages — same emitter,
// plus the linked directory blocks() renders from the entry's `directory`.
export const entries: EntryGenerator = () => CATEGORY_SLUGS.map((category) => ({ category }));

export const GET: RequestHandler = ({ params }) => {
	const entry = CATEGORY_BY_SLUG.get(params.category);
	if (!entry) throw new Error(`category md twin: no entry for ${params.category}`);
	return new Response(toolMarkdown(entry), {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
	});
};
