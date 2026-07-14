import {
	CONVERTERS,
	FORMATS,
	HOME,
	SITE_NAME,
	SITE_URL,
	TOOLS,
	seoFor,
	type SeoEntry
} from '$lib/seo';

// Markdown twins of the tool pages (`/<slug>.md`, `/index.md`) — the
// agent-facing render of the same seo.ts entries the HTML pages are built
// from. Presentation mirrors FormatInfo.svelte; keep the two in sync.

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

const pageName = (e: SeoEntry) => e.h1.replace(/\.$/, '');

/** The page as an ordered list of markdown blocks (joined with blank lines). */
function blocks(entry: SeoEntry): string[] {
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
		'**No uploads · No ads · Free & open source.**',
		'## How it works',
		(entry.steps ?? GENERIC_STEPS).map((step, i) => `${i + 1}. ${step}`).join('\n')
	];
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
export function toolMarkdown(entry: SeoEntry): string {
	return [...blocks(entry), FOOTER].join('\n\n') + '\n';
}

/** `/index.md` — the homepage twin plus the full grouped tool directory. */
export function homeMarkdown(): string {
	const line = (e: SeoEntry) =>
		`- [${e.title.split(' | ')[0]}](${SITE_URL}${e.path}): ${e.description}`;
	return [
		...blocks(HOME),
		'## All tools',
		'### Compress',
		FORMATS.map(line).join('\n'),
		'### Convert',
		CONVERTERS.map(line).join('\n'),
		'### Tools',
		TOOLS.map(line).join('\n'),
		FOOTER
	].join('\n\n');
}
