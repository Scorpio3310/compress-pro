// Thin wrapper — svelte-check skips dot-directories, so all logic (and its
// typechecking + tests) lives in src/lib/agent-skills.ts.
import { skillsIndexJson } from '$lib/agent-skills';

export const prerender = true;

export async function GET() {
	return new Response(await skillsIndexJson(), {
		headers: { 'Content-Type': 'application/json; charset=utf-8' }
	});
}
