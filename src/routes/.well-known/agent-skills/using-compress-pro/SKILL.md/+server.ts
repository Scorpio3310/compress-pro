// Thin wrapper — svelte-check skips dot-directories, so all logic (and its
// typechecking + tests) lives in src/lib/agent-skills.ts.
import { SKILL_MD } from '$lib/agent-skills';

export const prerender = true;

export function GET() {
	return new Response(SKILL_MD, {
		headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
	});
}
