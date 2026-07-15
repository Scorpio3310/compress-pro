import type { Handle } from '@sveltejs/kit';
import { TOOL_SLUGS } from '$lib/seo';
import { fullSeoFor } from '$lib/seo-full.server';
import { toolMarkdown, homeMarkdown } from '$lib/markdown';

/** True only when the client explicitly lists text/markdown (browsers never do). */
function wantsMarkdown(accept: string | null): boolean {
	if (!accept) return false;
	return accept
		.split(',')
		.some((part) => part.trim().toLowerCase().split(';')[0] === 'text/markdown');
}

/**
 * Cross-origin isolation (SharedArrayBuffer → threaded AVIF/oxipng wasm) plus
 * the security-header set. Production pages are prerendered and get all of
 * these from the root _headers file; this hook covers the dev server (Vite's
 * server.headers don't reach Kit's SSR middleware) and the runtime routes
 * (robots.txt, sitemap.xml, llms.txt, 404s). The Content-Security-Policy for
 * runtime-rendered pages is added by kit.csp itself — never set it here.
 */
export const handle: Handle = async ({ event, resolve }) => {
	// Accept: text/markdown negotiation for the `vite dev` loop only. In
	// production the tool pages are prerendered static assets served before this
	// hook runs, so worker/index.js does the real negotiation there (this is a
	// no-op for those paths). Kept here so the dev server returns the same twin.
	if (
		(event.request.method === 'GET' || event.request.method === 'HEAD') &&
		wantsMarkdown(event.request.headers.get('accept'))
	) {
		const slug = event.url.pathname.replace(/^\/+|\/+$/g, '');
		if (slug === '' || TOOL_SLUGS.includes(slug)) {
			const md = slug === '' ? homeMarkdown(fullSeoFor(undefined)) : toolMarkdown(fullSeoFor(slug));
			return new Response(event.request.method === 'HEAD' ? null : md, {
				headers: {
					'Content-Type': 'text/markdown; charset=utf-8',
					Vary: 'Accept',
					'x-markdown-tokens': String(Math.ceil(md.length / 4))
				}
			});
		}
	}

	const response = await resolve(event);
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=()'
	);
	return response;
};
