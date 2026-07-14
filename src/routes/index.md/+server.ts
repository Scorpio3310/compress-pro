import { homeMarkdown } from '$lib/markdown';

export const prerender = true;

// `/index.md` — the homepage's markdown twin ('/' + '.md' is no valid URL),
// with the full tool directory appended so one fetch orients an agent.
export function GET() {
	return new Response(homeMarkdown(), {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
	});
}
