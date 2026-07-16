import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { CONVERTERS, FORMATS, TOOLS, TOOL_SLUGS, seoFor } from '$lib/seo';
import { seoBodyFor } from '$lib/seo-body';
import { allSeoDetails, seoDetailFor } from '$lib/seo-detail';

// Minimal WebMCP surface (https://webmachinelearning.github.io/webmcp/):
// browsers with an in-page agent expose a model context — the Chrome preview
// puts it on navigator, the W3C draft on document; agents drive the page
// through registered tools. Registration reuses the lite seo.ts data already
// in the bundle (the layout imports it for the footer); the heavy copy
// (titles/descriptions, markdown bodies) is awaited inside the handlers, so
// an agent actually calling a tool is what fetches those chunks. When the
// API is absent the whole thing is a single property probe.

interface ToolResult {
	content: { type: 'text'; text: string }[];
}

interface ModelContextTool {
	name: string;
	description: string;
	inputSchema?: Record<string, unknown>;
	annotations?: { readOnlyHint?: boolean };
	execute: (input?: Record<string, unknown>) => Promise<ToolResult>;
}

interface ModelContext {
	registerTool?: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => unknown;
	provideContext?: (context: { tools: ModelContextTool[] }) => unknown;
}

const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] });

function buildTools(): ModelContextTool[] {
	return [
		{
			name: 'list_tools',
			description:
				'List every Compress Pro tool page as "slug — name: what it does". Slugs feed open_tool.',
			annotations: { readOnlyHint: true },
			execute: async () => {
				const details = await allSeoDetails();
				return text(
					[...FORMATS, ...CONVERTERS, ...TOOLS]
						.map((e) => {
							const detail = details[e.path.slice(1)];
							return `- ${e.path.slice(1)} — ${detail.title.split(' | ')[0]}: ${detail.description}`;
						})
						.join('\n')
				);
			}
		},
		{
			name: 'open_tool',
			description:
				'Open a Compress Pro tool page by slug (e.g. "compress-jpg", "heic-to-jpg", "merge-pdf"). The tool arrives preconfigured; the user then drops their file — files cannot be injected.',
			inputSchema: {
				type: 'object',
				properties: {
					slug: { type: 'string', description: 'A slug from list_tools, e.g. "compress-jpg".' }
				},
				required: ['slug']
			},
			execute: async (input) => {
				const slug = typeof input?.slug === 'string' ? input.slug : '';
				if (!TOOL_SLUGS.includes(slug)) {
					return text(`Unknown tool "${slug}" — call list_tools for the valid slugs.`);
				}
				await goto(resolve(`/${slug}`));
				return text(`Opened /${slug} — ${(await seoDetailFor(slug)).description}`);
			}
		},
		{
			name: 'get_current_tool',
			description:
				'Describe the tool on the current page — what it does, how it works, quality guidance and FAQ — as markdown.',
			annotations: { readOnlyHint: true },
			execute: async () => {
				const slug = location.pathname.replace(/^\/|\/$/g, '');
				if (slug && !TOOL_SLUGS.includes(slug)) {
					return text(`${location.pathname} is not a tool page — call list_tools.`);
				}
				// The page's markdown twin, rendered from the same seo entry — the
				// detail, long-form body AND the markdown emitter are lazy chunks,
				// awaited here on demand.
				const tool = slug || undefined;
				const [{ toolMarkdown }, detail, body] = await Promise.all([
					import('$lib/markdown'),
					seoDetailFor(tool),
					seoBodyFor(tool)
				]);
				return text(toolMarkdown({ ...seoFor(tool), ...detail, ...body }));
			}
		}
	];
}

/** Register the site's tools with the browser's agent context, if one exists. */
export function registerWebMcpTools(): void {
	const mc =
		(navigator as Navigator & { modelContext?: ModelContext }).modelContext ??
		(document as Document & { modelContext?: ModelContext }).modelContext;
	if (!mc) return;
	const tools = buildTools();
	if (typeof mc.registerTool === 'function') {
		// May return a promise (the draft says so) or not (early previews) —
		// normalize, and never let a rejection surface as an unhandled error.
		for (const tool of tools) void Promise.resolve(mc.registerTool(tool)).catch(() => {});
	} else if (typeof mc.provideContext === 'function') {
		mc.provideContext({ tools });
	}
}
