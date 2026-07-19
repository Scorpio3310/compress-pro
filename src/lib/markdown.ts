import {
	SITE_NAME,
	SITE_URL,
	seoFor,
	type FullSeoEntry,
	type SeoEntry,
	type SeoLite
} from '$lib/seo';
// Type-only — erased at build, so seo-categories stays out of the client graph.
import type { CategoryDirectorySection } from '$lib/seo-categories';

// Markdown twins of the tool pages (`/<slug>.md`, `/index.md`) — the
// agent-facing render of the same seo entries the HTML pages are built
// from. Presentation mirrors FormatInfo.svelte; keep the two in sync.
// Callers supply FULL entries (lite index + lazy detail/body): the prerender
// routes via seo-full.server.ts, webmcp via `await seoDetailFor/seoBodyFor` —
// this module must never import the details or bodies itself (only the lite
// index, for related-link names) or they'd ride into the client bundle with it.

// FormatInfo's generic How-it-works trio, with the runtime pasteKey() pinned
// to a static spelling — the markdown is prerendered once for every platform.
const GENERIC_STEPS: readonly string[] = [
	'Drop files anywhere on the page, click to browse, or paste with Ctrl/⌘ + V.',
	'Pick a quality or preset — or set an exact target size and let the tool find it.',
	'Compress, compare before/after, and download — individually or as a ZIP.'
];

// Guide copy carries site-relative links (`[text](/path)`, the shape
// FormatInfo.svelte parses); agents read these files off-site, so absolutize.
const absolutize = (text: string) => text.replace(/\]\((\/[a-z0-9-]+)\)/g, `](${SITE_URL}$1)`);

const mdCell = (cell: string) => cell.replace(/\|/g, '\\|');

function tableMarkdown(table: { columns: string[]; rows: string[][] }): string {
	return [
		`| ${table.columns.map(mdCell).join(' | ')} |`,
		`| ${table.columns.map(() => '---').join(' | ')} |`,
		...table.rows.map((row) => `| ${row.map(mdCell).join(' | ')} |`)
	].join('\n');
}

const pageName = (e: SeoLite) => e.h1.replace(/\.$/, '');

/** The page as an ordered list of markdown blocks (joined with blank lines).
 *  Category hub entries additionally carry a `directory` — rendered as one
 *  linked section per sub-group, so a hub's twin lists every tool it links. */
function blocks(
	entry: FullSeoEntry & { directory?: readonly CategoryDirectorySection[] }
): string[] {
	const out: string[] = [
		[
			'---',
			`title: ${JSON.stringify(entry.title)}`,
			`description: ${JSON.stringify(entry.description)}`,
			`canonical: ${SITE_URL}${entry.path}`,
			'---'
		].join('\n'),
		`# ${entry.h1}`,
		`> ${entry.tagline}`,
		absolutize(entry.intro),
		'**No uploads · No ads · Free & open source.**'
	];
	for (const section of entry.directory ?? []) {
		out.push(
			`## ${section.heading}`,
			section.items.map((item) => `- [${item.name}](${SITE_URL}${item.path})`).join('\n')
		);
	}
	out.push(
		'## How it works',
		(entry.steps ?? GENERIC_STEPS).map((step, i) => `${i + 1}. ${step}`).join('\n')
	);
	for (const section of entry.guide ?? []) {
		out.push(`## ${section.heading}`);
		for (const paragraph of section.paragraphs ?? []) out.push(absolutize(paragraph));
		if (section.table) out.push(tableMarkdown(section.table));
	}
	if (entry.faq.length > 0) {
		out.push('## Frequently asked questions');
		for (const item of entry.faq) out.push(`### ${item.q}`, absolutize(item.a));
	}
	if (entry.related?.length) {
		out.push(
			'## Related tools',
			entry.related
				.map((path) => `- [${pageName(seoFor(path.slice(1)))}](${SITE_URL}${path})`)
				.join('\n')
		);
	}
	return out;
}

const FOOTER =
	'---\n\n' +
	`Part of [${SITE_NAME}](${SITE_URL}/) — every tool page has a markdown twin at ` +
	'`<page url>.md`' +
	`. Full tool index: [llms.txt](${SITE_URL}/llms.txt)`;

/** The markdown twin of one tool page (`/<slug>.md`). */
export function toolMarkdown(entry: FullSeoEntry): string {
	return [...blocks(entry), FOOTER].join('\n\n') + '\n';
}

/**
 * `/llms-full.txt` (llmstxt.org) — the whole site's content in one markdown
 * document, for agents that want the corpus in a single fetch instead of
 * walking the per-page `.md` twins. Frontmatter is replaced by a plain
 * `Canonical:` line (YAML frontmatter is only valid at the very top of a file).
 * `pages` = seo-full.server.ts's FULL_PAGES (canonical order, home first —
 * its description doubles as the site summary line).
 */
export function llmsFullMarkdown(pages: readonly FullSeoEntry[]): string {
	const home = pages.find((p) => p.path === '/') ?? pages[0];
	const header = [
		`# ${SITE_NAME} — full content`,
		`> ${home.description}`,
		`Tool index: ${SITE_URL}/llms.txt · every page below also exists as a standalone ` +
			'markdown twin at `<canonical url>.md`.'
	];
	const rendered = pages.map((entry) =>
		['---', `Canonical: ${SITE_URL}${entry.path}`, ...blocks(entry).slice(1)].join('\n\n')
	);
	return [...header, ...rendered].join('\n\n') + '\n';
}

/** `/index.md` — the homepage twin plus the full grouped tool directory.
 *  The directory (titles + descriptions of every page) is detail data, so the
 *  server callers pass seo-full.server.ts's FULL_* sets in. */
export function homeMarkdown(
	home: FullSeoEntry,
	directory: {
		formats: readonly SeoEntry[];
		converters: readonly SeoEntry[];
		tools: readonly SeoEntry[];
	}
): string {
	const line = (e: SeoEntry) =>
		`- [${e.title.split(' | ')[0]}](${SITE_URL}${e.path}): ${e.description}`;
	return [
		...blocks(home),
		'## All tools',
		'### Compress',
		directory.formats.map(line).join('\n'),
		'### Convert',
		directory.converters.map(line).join('\n'),
		'### Tools',
		directory.tools.map(line).join('\n'),
		FOOTER
	].join('\n\n');
}
