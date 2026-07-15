// Custom Worker entry (wrangler `main`). Adds `Accept: text/markdown`
// content negotiation in front of the SvelteKit worker, then delegates
// everything else to it unchanged.
//
// Why a wrapper: adapter-cloudflare prerenders every page and its emitted
// worker short-circuits prerendered paths to `env.ASSETS.fetch(req)` before
// `server.respond()` runs — so `src/hooks.server.ts` `handle` never sees them
// and can't negotiate. This entry runs first (see `run_worker_first` in
// wrangler.jsonc) and, when an agent asks for markdown, serves the page's
// already-prerendered `.md` twin (the output of `toolMarkdown(fullSeoFor(slug))`),
// so HTML and Markdown can never drift. Lives outside `src/` so svelte-check
// (which only type-checks `../src/**`) never tries to resolve the post-build
// artifact imported below.
//
// The adapter keeps emitting the SvelteKit worker to the default path via
// `svelte.config.js` adapter `{ config: 'wrangler.adapter.jsonc' }`, so this
// file is never clobbered by the build.
import sveltekit from '../.svelte-kit/cloudflare/_worker.js';

// Mirror src/hooks.server.ts / _headers so a worker-generated markdown body
// carries the same security-header set as every other response on the site.
const SECURITY_HEADERS = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'X-Frame-Options': 'DENY',
	'Permissions-Policy':
		'camera=(), microphone=(), geolocation=(), payment=(), usb=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=()'
};

/**
 * True only when the client explicitly lists `text/markdown`. Browsers send an
 * Accept list ending in a `*` wildcard and never name it, so they never match.
 * @param {string | null} accept
 */
function wantsMarkdown(accept) {
	if (!accept) return false;
	return accept
		.split(',')
		.some((part) => part.trim().toLowerCase().split(';')[0] === 'text/markdown');
}

/**
 * Map an HTML page path to its prerendered markdown twin, or null to delegate.
 * `/` → `/index.md`; a path that already carries an extension (`.md`/`.txt`/…)
 * or is nested (has a `/` past the first char) is not a tool page.
 * @param {string} pathname
 */
function mdTwinPath(pathname) {
	const p = pathname.replace(/\/+$/, '') || '/';
	if (p === '/') return '/index.md';
	if (p.includes('.')) return null;
	if (p.indexOf('/', 1) !== -1) return null;
	return p + '.md';
}

/** Cheap, dependency-free token estimate (~4 chars/token). Approximate by design. */
const estimateTokens = (text) => Math.ceil(text.length / 4);

export default {
	/**
	 * @param {Request} req
	 * @param {{ ASSETS: { fetch: typeof fetch } }} env
	 * @param {ExecutionContext} ctx
	 */
	async fetch(req, env, ctx) {
		if (
			(req.method === 'GET' || req.method === 'HEAD') &&
			wantsMarkdown(req.headers.get('accept'))
		) {
			const url = new URL(req.url);
			const twin = mdTwinPath(url.pathname);
			if (twin) {
				const twinRes = await env.ASSETS.fetch(new URL(twin, url.origin));
				if (twinRes.status === 200) {
					const body = await twinRes.text();
					return new Response(req.method === 'HEAD' ? null : body, {
						headers: {
							...SECURITY_HEADERS,
							'Content-Type': 'text/markdown; charset=utf-8',
							Vary: 'Accept',
							'x-markdown-tokens': String(estimateTokens(body))
						}
					});
				}
				// No twin (unknown slug, /about, /privacy, …) → fall through to HTML.
			}
		}

		// Everything else: hand to the SvelteKit worker unchanged, then mark the
		// response Accept-varying so shared caches never mix HTML and Markdown.
		const res = await sveltekit.fetch(req, env, ctx);
		const out = new Response(res.body, res);
		out.headers.append('Vary', 'Accept');
		return out;
	}
};
