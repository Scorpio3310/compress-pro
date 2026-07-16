import {
	CONVERTERS,
	FORMATS,
	HOME,
	TOOLS,
	type ConverterDetail,
	type ConverterEntry,
	type FullSeoEntry,
	type SeoBody,
	type SeoDetail,
	type SeoLite
} from '$lib/seo';
import { DETAILS as HOME_DETAILS } from '$lib/seo-detail/home';
import { DETAILS as IMAGE_DETAILS } from '$lib/seo-detail/images';
import { DETAILS as VIDEO_AUDIO_DETAILS } from '$lib/seo-detail/video-audio';
import { DETAILS as PDF_DETAILS } from '$lib/seo-detail/pdf';
import { DETAILS as FONT_DETAILS } from '$lib/seo-detail/fonts';
import { DETAILS as ARCHIVE_DETAILS } from '$lib/seo-detail/archives';
import { BODIES as HOME_BODIES } from '$lib/seo-body/home';
import { BODIES as IMAGE_BODIES } from '$lib/seo-body/images';
import { BODIES as VIDEO_AUDIO_BODIES } from '$lib/seo-body/video-audio';
import { BODIES as PDF_BODIES } from '$lib/seo-body/pdf';
import { BODIES as FONT_BODIES } from '$lib/seo-body/fonts';
import { BODIES as ARCHIVE_BODIES } from '$lib/seo-body/archives';

/**
 * Lite index + ALL details + ALL bodies, statically — for the prerendered
 * pages and agent surface ([tool=tool].md, index.md, llms.txt, llms-full.txt)
 * and the content-pinning unit tests. The `.server` suffix is load-bearing:
 * SvelteKit fails the build if client code ever imports this, which is what
 * keeps the details and bodies out of the every-page chunk. Client code
 * awaits `seoDetailFor` / `seoBodyFor` instead.
 */

const ALL_DETAILS: Record<string, SeoDetail | ConverterDetail> = {
	...HOME_DETAILS,
	...IMAGE_DETAILS,
	...VIDEO_AUDIO_DETAILS,
	...PDF_DETAILS,
	...FONT_DETAILS,
	...ARCHIVE_DETAILS
};

const ALL_BODIES: Record<string, SeoBody> = {
	...HOME_BODIES,
	...IMAGE_BODIES,
	...VIDEO_AUDIO_BODIES,
	...PDF_BODIES,
	...FONT_BODIES,
	...ARCHIVE_BODIES
};

/** A converter/tool page, fully assembled — detail carries its preset. */
export type FullConverterEntry = ConverterEntry & SeoBody;

function assemble(entry: SeoLite): FullSeoEntry {
	const slug = entry.path.slice(1);
	const detail = ALL_DETAILS[slug];
	const body = ALL_BODIES[slug];
	// Loud by design: a page without its parts would prerender half-empty.
	if (!detail) throw new Error(`seo-full: no detail for ${entry.path}`);
	if (!body) throw new Error(`seo-full: no body for ${entry.path}`);
	return { ...entry, ...detail, ...body };
}

export const FULL_HOME: FullSeoEntry = assemble(HOME);
export const FULL_FORMATS: readonly FullSeoEntry[] = FORMATS.map(assemble);
// Safe casts: seo-detail/index.test.ts pins that every CONVERTERS/TOOLS slug's
// detail carries a preset (the guarantee that left the type level).
export const FULL_CONVERTERS: readonly FullConverterEntry[] = CONVERTERS.map(
	(c) => assemble(c) as FullConverterEntry
);
export const FULL_TOOLS: readonly FullConverterEntry[] = TOOLS.map(
	(t) => assemble(t) as FullConverterEntry
);

/** Every page, fully assembled, in the canonical [HOME, FORMATS, CONVERTERS,
 *  TOOLS] order llms-full.txt has always used. */
export const FULL_PAGES: readonly FullSeoEntry[] = [
	FULL_HOME,
	...FULL_FORMATS,
	...FULL_CONVERTERS,
	...FULL_TOOLS
];

const BY_PATH = new Map(FULL_PAGES.map((entry) => [entry.path, entry]));

/** seoFor, with detail + body attached (undefined/unknown → homepage). */
export function fullSeoFor(tool: string | undefined): FullSeoEntry {
	return BY_PATH.get(`/${tool ?? ''}`) ?? (BY_PATH.get('/') as FullSeoEntry);
}
