import type { FileFormat } from '$lib/types';
import { seoFor, type SeoBody } from '$lib/seo';

/**
 * Lazy access to the per-tool-group body modules. The long-form page copy
 * (intro/guide/faq ≈ 2/3 of the old seo.ts) lives in per-group chunks that
 * only the page being rendered loads — the always-loaded seo index stays
 * light. `+page.ts` awaits the body in `load` (so prerendered HTML and the
 * FAQPage JSON-LD are complete), and webmcp awaits it inside get_current_tool.
 *
 * ONLY the literal dynamic imports below may reference the group modules —
 * a static import from any client-reachable module would pull the bodies
 * back into the every-page graph (seo-full.server.ts is the one static
 * consumer, and its .server suffix keeps it off the client).
 */

/** Shared with seo-detail/, which splits along the same partition. */
export type BodyGroup = 'home' | 'images' | 'video-audio' | 'pdf' | 'fonts' | 'archives';

/** Exhaustive by construction — a new FileFormat member fails to compile
 *  until it is mapped; index.test.ts pins congruence with TOOL_GROUPS. */
export const BODY_GROUP_OF: Record<FileFormat, Exclude<BodyGroup, 'home'>> = {
	jpg: 'images',
	png: 'images',
	webp: 'images',
	gif: 'images',
	heic: 'images',
	svg: 'images',
	pdf: 'pdf',
	video: 'video-audio',
	audio: 'video-audio',
	font: 'fonts',
	zip: 'archives',
	exif: 'archives'
};

const LOADERS: Record<BodyGroup, () => Promise<{ BODIES: Record<string, SeoBody> }>> = {
	home: () => import('./home'),
	images: () => import('./images'),
	'video-audio': () => import('./video-audio'),
	pdf: () => import('./pdf'),
	fonts: () => import('./fonts'),
	archives: () => import('./archives')
};

/** Body for a `[[tool]]` route param (undefined → homepage). Resolves through
 *  seoFor, so unknown slugs fall back to the home body exactly like the index. */
export async function seoBodyFor(tool: string | undefined): Promise<SeoBody> {
	const entry = seoFor(tool);
	const group = entry.format === null ? 'home' : BODY_GROUP_OF[entry.format];
	return (await LOADERS[group]()).BODIES[entry.path.slice(1)];
}
