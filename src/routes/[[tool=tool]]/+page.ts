import type { PageLoad } from './$types';
import { seoFor } from '$lib/seo';
import { seoBodyFor } from '$lib/seo-body';

/**
 * All 94 tool pages share this one route node, so per-page code splitting can
 * only happen here: the page's long-form copy (intro/guide/faq — 2/3 of the
 * old every-page seo chunk), the homepage directory and the before/after demo
 * are page-specific weight that every page's hydration used to pay for.
 * Loaded via dynamic import they become separate chunks fetched only where
 * they render — while prerendering still awaits them, so the static HTML
 * (FAQPage JSON-LD included) keeps the full content (SEO, no-JS).
 */
export const load: PageLoad = async ({ params }) => {
	const entry = seoFor(params.tool);
	const [body, demoCompare, toolDirectory] = await Promise.all([
		seoBodyFor(params.tool),
		entry.demo || entry.format === null
			? import('$lib/components/DemoCompare.svelte').then((m) => m.default)
			: null,
		entry.format === null
			? import('$lib/components/ToolDirectory.svelte').then((m) => m.default)
			: null
	]);
	return { body, demoCompare, toolDirectory };
};
