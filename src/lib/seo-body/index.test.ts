import { describe, expect, it } from 'vitest';
import { CONVERTERS, FORMATS, HOME, TOOLS, TOOL_GROUPS, TOOL_SLUGS } from '$lib/seo';
import { BODY_GROUP_OF, seoBodyFor } from './index';
import { BODIES as HOME_BODIES } from './home';
import { BODIES as IMAGE_BODIES } from './images';
import { BODIES as VIDEO_AUDIO_BODIES } from './video-audio';
import { BODIES as PDF_BODIES } from './pdf';
import { BODIES as FONT_BODIES } from './fonts';
import { BODIES as ARCHIVE_BODIES } from './archives';

const MODULES = [
	HOME_BODIES,
	IMAGE_BODIES,
	VIDEO_AUDIO_BODIES,
	PDF_BODIES,
	FONT_BODIES,
	ARCHIVE_BODIES
];
const ALL_BODIES = Object.assign({}, ...MODULES) as Record<string, (typeof HOME_BODIES)[string]>;

describe('seo body modules', () => {
	const entries = [HOME, ...FORMATS, ...CONVERTERS, ...TOOLS];

	it('every page has exactly one body — no orphans, no cross-file duplicates', () => {
		const slugs = entries.map((e) => e.path.slice(1));
		const keys = MODULES.flatMap((m) => Object.keys(m));
		// A slug present in two group files would vanish in the Object.assign
		// merge — compare the raw key list, not the merged record.
		expect([...keys].sort()).toEqual([...slugs].sort());
	});

	it('BODY_GROUP_OF is congruent with TOOL_GROUPS', () => {
		for (const group of TOOL_GROUPS) {
			const mapped = new Set(group.formats.map((f) => BODY_GROUP_OF[f]));
			expect(mapped.size, `${group.title} maps to one body group`).toBe(1);
		}
		const distinct = new Set(TOOL_GROUPS.map((g) => BODY_GROUP_OF[g.formats[0]]));
		expect(distinct.size, 'no two groups share a body module').toBe(TOOL_GROUPS.length);
	});

	it('seoBodyFor resolves every slug and the homepage through the lazy loaders', async () => {
		for (const slug of [undefined, ...TOOL_SLUGS]) {
			const body = await seoBodyFor(slug);
			expect(body, slug ?? '(home)').toEqual(ALL_BODIES[slug ?? '']);
			expect(body.intro.length).toBeGreaterThan(0);
			expect(body.faq.length).toBeGreaterThan(0);
		}
	});

	it('unknown slugs fall back to the home body, mirroring seoFor', async () => {
		expect(await seoBodyFor('no-such-tool')).toEqual(ALL_BODIES['']);
	});
});
