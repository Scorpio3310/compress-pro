import { CONVERTERS, FORMATS, HOME, TOOLS, type FullSeoEntry, type SeoEntry } from '$lib/seo';
import { BODIES as HOME_BODIES } from '$lib/seo-body/home';
import { BODIES as IMAGE_BODIES } from '$lib/seo-body/images';
import { BODIES as VIDEO_AUDIO_BODIES } from '$lib/seo-body/video-audio';
import { BODIES as PDF_BODIES } from '$lib/seo-body/pdf';
import { BODIES as FONT_BODIES } from '$lib/seo-body/fonts';
import { BODIES as ARCHIVE_BODIES } from '$lib/seo-body/archives';

/**
 * Index + ALL bodies, statically — for the prerendered agent surface
 * ([tool=tool].md, index.md, llms-full.txt) and the body-pinning unit tests.
 * The `.server` suffix is load-bearing: SvelteKit fails the build if client
 * code ever imports this, which is what keeps the bodies out of the
 * every-page chunk. Client code awaits `seoBodyFor` (seo-body/index.ts).
 */

const ALL_BODIES = {
	...HOME_BODIES,
	...IMAGE_BODIES,
	...VIDEO_AUDIO_BODIES,
	...PDF_BODIES,
	...FONT_BODIES,
	...ARCHIVE_BODIES
};

function withBody(entry: SeoEntry): FullSeoEntry {
	const body = ALL_BODIES[entry.path.slice(1)];
	// Loud by design: a page without a body would prerender half-empty.
	if (!body) throw new Error(`seo-full: no body for ${entry.path}`);
	return { ...entry, ...body };
}

/** Every page, fully assembled, in the canonical [HOME, FORMATS, CONVERTERS,
 *  TOOLS] order llms-full.txt has always used. */
export const FULL_PAGES: readonly FullSeoEntry[] = [HOME, ...FORMATS, ...CONVERTERS, ...TOOLS].map(
	withBody
);

const BY_PATH = new Map(FULL_PAGES.map((entry) => [entry.path, entry]));

/** seoFor, with the body attached (undefined/unknown → homepage). */
export function fullSeoFor(tool: string | undefined): FullSeoEntry {
	return BY_PATH.get(`/${tool ?? ''}`) ?? (BY_PATH.get('/') as FullSeoEntry);
}
