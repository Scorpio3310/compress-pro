import { seoFor } from '$lib/seo';
import type { ConverterDetail, SeoDetail } from '$lib/seo';
import { BODY_GROUP_OF, type BodyGroup } from '$lib/seo-body';

/**
 * Lazy access to the per-tool-group detail modules. The per-page head/meta +
 * intake copy (title/description/tagline/og, steps, related, converter
 * preset/accept) lives in per-group chunks that only the page being rendered
 * loads — the always-loaded seo index keeps just the lite fields. `+page.ts`
 * awaits the detail in `load` (so prerendered HTML, the <head> and hydration
 * all see the merged entry), and webmcp awaits it inside its handlers.
 *
 * ONLY the literal dynamic imports below may reference the group modules —
 * a static import from any client-reachable module would pull the details
 * back into the every-page graph (seo-full.server.ts is the one static
 * consumer, and its .server suffix keeps it off the client).
 */

const LOADERS: Record<
	BodyGroup,
	() => Promise<{ DETAILS: Record<string, SeoDetail | ConverterDetail> }>
> = {
	home: () => import('./home'),
	images: () => import('./images'),
	'video-audio': () => import('./video-audio'),
	pdf: () => import('./pdf'),
	fonts: () => import('./fonts'),
	archives: () => import('./archives')
};

/** Detail for a `[[tool]]` route param (undefined → homepage). Resolves through
 *  seoFor, so unknown slugs fall back to the home detail exactly like the index. */
export async function seoDetailFor(tool: string | undefined): Promise<SeoDetail | ConverterDetail> {
	const entry = seoFor(tool);
	const group = entry.format === null ? 'home' : BODY_GROUP_OF[entry.format];
	const detail = (await LOADERS[group]()).DETAILS[entry.path.slice(1)];
	// Loud by design: a page without a detail would prerender a broken <head>.
	if (!detail) throw new Error(`seo-detail: no detail for ${entry.path}`);
	return detail;
}

/** Every page's detail, keyed by slug ('' = home) — for webmcp's list_tools,
 *  which needs all titles/descriptions at once (six chunk fetches, on demand). */
export async function allSeoDetails(): Promise<Record<string, SeoDetail | ConverterDetail>> {
	const modules = await Promise.all(Object.values(LOADERS).map((load) => load()));
	return Object.assign({}, ...modules.map((m) => m.DETAILS));
}
