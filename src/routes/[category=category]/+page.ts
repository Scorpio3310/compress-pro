import type { EntryGenerator, PageLoad } from './$types';
import { CATEGORY_SLUGS } from '$lib/seo';

// The category route enumerates its own prerender entries (same pattern as
// [tool=tool].md) so svelte.config's explicit tool-slug list — pinned 1:1 to
// TOOL_SLUGS by seo-sync.test.ts — never has to learn about hubs.
export const entries: EntryGenerator = () => CATEGORY_SLUGS.map((category) => ({ category }));

export const load: PageLoad = async ({ params }) => {
	// Lazy — the hub copy + directory ride their own chunk, never the shared
	// route node (mirrors how tool pages load seo-detail/seo-body).
	const { CATEGORIES, CATEGORY_BY_SLUG } = await import('$lib/seo-categories');
	const entry = CATEGORY_BY_SLUG.get(params.category);
	if (!entry) throw new Error(`category route: no entry for ${params.category}`);
	return {
		entry,
		others: CATEGORIES.filter((c) => c.path !== entry.path).map((c) => ({
			label: c.label,
			path: c.path
		}))
	};
};
