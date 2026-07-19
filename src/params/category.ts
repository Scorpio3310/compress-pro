import type { ParamMatcher } from '@sveltejs/kit';
import { CATEGORY_SLUGS } from '$lib/seo';

// Category hub pages (/image-tools, /pdf-tools, …) — the slug set lives on
// TOOL_GROUPS in seo.ts and is disjoint from TOOL_SLUGS, so this matcher and
// the tool matcher can never both claim a path.
export const match = ((param) => CATEGORY_SLUGS.includes(param)) satisfies ParamMatcher;
