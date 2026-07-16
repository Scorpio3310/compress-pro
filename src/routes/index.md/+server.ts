import { homeMarkdown } from '$lib/markdown';
import { FULL_CONVERTERS, FULL_FORMATS, FULL_TOOLS, fullSeoFor } from '$lib/seo-full.server';

export const prerender = true;

// `/index.md` — the homepage's markdown twin ('/' + '.md' is no valid URL),
// with the full tool directory appended so one fetch orients an agent.
export function GET() {
	return new Response(
		homeMarkdown(fullSeoFor(undefined), {
			formats: FULL_FORMATS,
			converters: FULL_CONVERTERS,
			tools: FULL_TOOLS
		}),
		{ headers: { 'Content-Type': 'text/markdown; charset=utf-8' } }
	);
}
