import { describe, expect, it } from 'vitest';
import { CONVERTERS, FORMATS, HOME, TOOLS, TOOL_SLUGS, type ConverterDetail } from '$lib/seo';
import { allSeoDetails, seoDetailFor } from './index';
import { DETAILS as HOME_DETAILS } from './home';
import { DETAILS as IMAGE_DETAILS } from './images';
import { DETAILS as VIDEO_AUDIO_DETAILS } from './video-audio';
import { DETAILS as PDF_DETAILS } from './pdf';
import { DETAILS as FONT_DETAILS } from './fonts';
import { DETAILS as ARCHIVE_DETAILS } from './archives';

const MODULES = [
	HOME_DETAILS,
	IMAGE_DETAILS,
	VIDEO_AUDIO_DETAILS,
	PDF_DETAILS,
	FONT_DETAILS,
	ARCHIVE_DETAILS
];
const ALL_DETAILS = Object.assign({}, ...MODULES) as Record<string, (typeof HOME_DETAILS)[string]>;

describe('seo detail modules', () => {
	const entries = [HOME, ...FORMATS, ...CONVERTERS, ...TOOLS];

	it('every page has exactly one detail — no orphans, no cross-file duplicates', () => {
		const slugs = entries.map((e) => e.path.slice(1));
		const keys = MODULES.flatMap((m) => Object.keys(m));
		// A slug present in two group files would vanish in the Object.assign
		// merge — compare the raw key list, not the merged record.
		expect([...keys].sort()).toEqual([...slugs].sort());
	});

	it('every converter/tool detail carries a preset — the guarantee that left the type level', () => {
		// The lite ConverterLite can no longer require `preset` at compile time,
		// so this pins it: a converter page without one would land unconfigured.
		for (const e of [...CONVERTERS, ...TOOLS]) {
			const detail = ALL_DETAILS[e.path.slice(1)] as ConverterDetail;
			expect(detail.preset, e.path).toBeDefined();
			expect(detail.preset.kind, e.path).toBeTruthy();
		}
		// …and the converse: plain format pages/home must NOT smuggle one in.
		for (const e of [HOME, ...FORMATS]) {
			expect('preset' in ALL_DETAILS[e.path.slice(1)], e.path).toBe(false);
		}
	});

	it('seoDetailFor resolves every slug and the homepage through the lazy loaders', async () => {
		for (const slug of [undefined, ...TOOL_SLUGS]) {
			const detail = await seoDetailFor(slug);
			expect(detail, slug ?? '(home)').toEqual(ALL_DETAILS[slug ?? '']);
			expect(detail.title.length).toBeGreaterThan(0);
			expect(detail.description.length).toBeGreaterThan(0);
			expect(detail.tagline.length).toBeGreaterThan(0);
		}
	});

	it('unknown slugs fall back to the home detail, mirroring seoFor', async () => {
		expect(await seoDetailFor('no-such-tool')).toEqual(ALL_DETAILS['']);
	});

	it('allSeoDetails merges every page across the six chunks', async () => {
		const all = await allSeoDetails();
		expect(Object.keys(all).sort()).toEqual(entries.map((e) => e.path.slice(1)).sort());
	});
});
