import type { PageLoad } from './$types';
import {
	converterFor,
	seoFor,
	type ConverterDetail,
	type ConverterEntry,
	type SeoEntry
} from '$lib/seo';
import { seoBodyFor } from '$lib/seo-body';
import { seoDetailFor } from '$lib/seo-detail';

/**
 * Every tool page shares this one route node, so per-page code splitting can
 * only happen here: the page's head/meta + intake detail (title/tagline/
 * preset…), its long-form copy (intro/guide/faq — together 3/4 of the old
 * every-page seo chunk), the homepage directory and the before/after demo
 * are page-specific weight that every page's hydration used to pay for.
 * Loaded via dynamic import they become separate chunks fetched only where
 * they render — while prerendering still awaits them, so the static HTML
 * (head, FAQPage JSON-LD included) keeps the full content (SEO, no-JS).
 */
export const load: PageLoad = async ({ params }) => {
	const lite = seoFor(params.tool);
	const conv = converterFor(params.tool);
	const [detail, body, demoCompare, toolDirectory] = await Promise.all([
		seoDetailFor(params.tool),
		seoBodyFor(params.tool),
		lite.demo || lite.format === null
			? import('$lib/components/DemoCompare.svelte').then((m) => m.default)
			: null,
		lite.format === null
			? import('$lib/components/ToolDirectory.svelte').then((m) => m.default)
			: null
	]);
	return {
		entry: { ...lite, ...detail } as SeoEntry,
		converter: conv ? ({ ...conv, ...(detail as ConverterDetail) } as ConverterEntry) : undefined,
		body,
		demoCompare,
		toolDirectory
	};
};
