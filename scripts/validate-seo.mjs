/**
 * SEO & agent-surface validator (run after `pnpm build`).
 *
 * Crawls the prerendered output in .svelte-kit/cloudflare/ and asserts the
 * invariants from docs/quality-sweep-goal.md ("SEO & agent-surface track"):
 *
 *   1. title/meta-description present, unique; near-duplicate detection
 *   2. canonical present, correct (https://compress-pro.com/<slug>), unique
 *   3. no accidental <meta name="robots" content="noindex">
 *   4. heading ladder: exactly one h1, no skipped levels
 *   5. lang attribute on <html>
 *   6. placeholder copy (TODO / lorem / TKTK / xxx / "placeholder")
 *   7. JSON-LD parses; @graph types in the expected set; FAQ questions AND
 *      answers appear verbatim in the page's visible text
 *   8. sitemap.xml <loc> set === { /, every TOOL_SLUG, /about, /privacy };
 *      built *.html set matches the same expectation
 *   9. internal links resolve (HTML <a href>, .md twins' links, llms*.txt) —
 *      relative (./x), root-absolute (/x) and full-origin URLs all count;
 *      fragment-only and cross-page #anchors are checked against target ids
 *  10. og:image / twitter:image point at files that exist in the build
 *  11. .md twins: exist for every tool page + index, carry the canonical URL,
 *      mention the same tool name as the HTML <title>, and don't drop format
 *      tokens (jpg/png/pdf/…) that the HTML title advertises
 *  12. llms-full.txt lists every tool slug; llms.txt links resolve
 *  13. _headers advertises llms.txt + agent-skills via Link, COOP/COEP, nosniff
 *
 * Deliberately skipped: robots.txt — it is a runtime-only route
 * (src/routes/robots.txt/+server.ts, served per-host by the worker so preview
 * hosts get Disallow) and never lands in the prerendered output, so there is
 * nothing static to validate here. Links *to* /robots.txt are treated as
 * resolvable for the same reason. about/privacy intentionally have no .md
 * twins (PageHead.svelte emits no markdown alternate), so check 11 covers
 * tool pages + the homepage only.
 *
 * Expected slug registry: parsed from src/lib/seo.ts (the FORMATS/CONVERTERS/
 * TOOLS arrays that feed TOOL_SLUGS) — seo.ts imports $env aliases, so it is
 * regex-extracted rather than imported. The HOME entry (path: '/') is excluded
 * by requiring a non-empty slug.
 *
 * Output: greppable `ERROR <check> <page>: detail` / `WARN ...` lines grouped
 * by check + a per-check summary. Exit 0 when zero errors (warnings allowed).
 * Usage: node scripts/validate-seo.mjs [--json out.json]
 * (VALIDATE_SEO_DIST overrides the build dir — used to self-test the
 * validator against seeded-violation fixtures.)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = process.env.VALIDATE_SEO_DIST
	? resolve(process.env.VALIDATE_SEO_DIST)
	: join(ROOT, '.svelte-kit/cloudflare');
const ORIGIN = 'https://compress-pro.com';

// Routes that exist only at runtime (worker/hooks), never as static files.
const RUNTIME_ROUTES = new Set(['robots.txt']);

// Top-level @graph node types Seo.svelte / PageHead.svelte are known to emit.
const EXPECTED_LD_TYPES = new Set([
	'WebApplication',
	'WebSite',
	'WebPage',
	'AboutPage',
	'CollectionPage',
	'BreadcrumbList',
	'FAQPage',
	'ItemList'
]);

// Format/extension tokens for the html-title vs md-twin drift check (11).
const EXT_TOKENS = [
	'jpg',
	'jpeg',
	'png',
	'webp',
	'gif',
	'heic',
	'avif',
	'jxl',
	'psd',
	'svg',
	'bmp',
	'tiff',
	'raw',
	'cr2',
	'nef',
	'arw',
	'dng',
	'ico',
	'pdf',
	'mp4',
	'mov',
	'webm',
	'mkv',
	'mp3',
	'wav',
	'm4a',
	'flac',
	'ogg',
	'opus',
	'aac',
	'ttf',
	'otf',
	'woff',
	'woff2',
	'eot',
	'zip',
	'rar',
	'7z',
	'tar',
	'gz',
	'bz2',
	'xz',
	'iso',
	'cab',
	'deb',
	'rpm',
	'cpio',
	'lha',
	'arj',
	'epub',
	'cbz',
	'cbr',
	'glb',
	'srt',
	'vtt',
	'ass',
	'csv',
	'xlsx',
	'json',
	'yaml'
];

// ---------------------------------------------------------------------------
// tiny HTML helpers (no deps — regex-based, robust enough for our own output)
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	mdash: '—',
	ndash: '–',
	hellip: '…',
	rsquo: '’',
	lsquo: '‘',
	ldquo: '“',
	rdquo: '”',
	times: '×',
	middot: '·'
};
const decodeEntities = (s) =>
	s
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
		.replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);

const collapse = (s) => s.replace(/\s+/g, ' ').trim();
const norm = (s) => collapse(decodeEntities(s));

/** Attribute map of a single tag string ("<meta name=... content=...>"). */
function attrsOf(tag) {
	const out = {};
	for (const m of tag.matchAll(/([a-zA-Z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
		out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? '');
	return out;
}

/** Text a reader/crawler actually sees: tags, scripts, styles, svg stripped. */
function visibleText(html) {
	return norm(
		html
			.replace(/<(script|style|svg|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
			.replace(/<!--[\s\S]*?-->/g, ' ')
			.replace(/<[^>]+>/g, ' ')
	);
}

const tokenSet = (s) =>
	new Set(
		norm(s)
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter(Boolean)
	);
function jaccard(a, b) {
	let inter = 0;
	for (const t of a) if (b.has(t)) inter++;
	const union = a.size + b.size - inter;
	return union === 0 ? 1 : inter / union;
}

function walk(dir, skip = new Set()) {
	const out = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (skip.has(e.name)) continue;
		const p = join(dir, e.name);
		if (e.isDirectory()) out.push(...walk(p, skip));
		else out.push(p);
	}
	return out;
}

// ---------------------------------------------------------------------------
// result collection
// ---------------------------------------------------------------------------

const results = []; // { severity, check, page, detail }
const err = (check, page, detail) => results.push({ severity: 'ERROR', check, page, detail });
const warn = (check, page, detail) => results.push({ severity: 'WARN', check, page, detail });

// ---------------------------------------------------------------------------
// 0. preconditions + expected slug registry
// ---------------------------------------------------------------------------

if (!existsSync(DIST) || !existsSync(join(DIST, 'index.html'))) {
	console.error(`Build output missing at ${DIST} — run \`pnpm build\` first.`);
	process.exit(1);
}

const seoSrc = readFileSync(join(ROOT, 'src/lib/seo.ts'), 'utf8');
const regStart = seoSrc.indexOf('export const FORMATS');
const regEnd = seoSrc.indexOf('export const TOOL_SLUGS');
if (regStart === -1 || regEnd === -1) {
	console.error('Could not locate FORMATS…TOOL_SLUGS in src/lib/seo.ts — registry parse failed.');
	process.exit(1);
}
// `path: '/'` (the HOME entry) is excluded by requiring a first slug character.
const SLUGS = [
	...new Set(
		[...seoSrc.slice(regStart, regEnd).matchAll(/path: '\/([a-z0-9][a-z0-9-]*)'/g)].map((m) => m[1])
	)
].sort();
if (SLUGS.length < 100) {
	console.error(`Registry parse yielded only ${SLUGS.length} slugs — refusing to validate.`);
	process.exit(1);
}

// Category hub slugs — flat `categoryPath: '/…'` literals on TOOL_GROUPS
// (they sit AFTER the TOOL_SLUGS export, outside the SLUGS window above).
const CATEGORY_SLUGS = [
	...new Set([...seoSrc.matchAll(/categoryPath: '\/([a-z0-9-]+)'/g)].map((m) => m[1]))
].sort();
if (CATEGORY_SLUGS.length !== 5) {
	console.error(`Category parse yielded ${CATEGORY_SLUGS.length} slugs (expected 5) — refusing.`);
	process.exit(1);
}

// Every file in the build (relative posix paths) — the link-resolution ground truth.
const allFiles = new Set(walk(DIST).map((p) => relative(DIST, p).split('\\').join('/')));

// Root-level pages only (_app is hashed internals; nothing else nests HTML).
const htmlPages = walk(DIST, new Set(['_app']))
	.map((p) => relative(DIST, p).split('\\').join('/'))
	.filter((p) => p.endsWith('.html'))
	.sort();

const pagePath = (file) => {
	const slug = file.replace(/\.html$/, '');
	return slug === 'index' ? '/' : `/${slug}`;
};

// ---------------------------------------------------------------------------
// per-page parse
// ---------------------------------------------------------------------------

const pages = new Map(); // file -> parsed
for (const file of htmlPages) {
	const html = readFileSync(join(DIST, file), 'utf8');
	const headEnd = html.indexOf('</head>');
	const head = headEnd === -1 ? html : html.slice(0, headEnd);
	const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrsOf(m[0]));
	const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => attrsOf(m[0]));
	const meta = (name) => metas.find((m) => m.name === name)?.content;
	const prop = (p) => metas.find((m) => m.property === p)?.content;
	pages.set(file, {
		html,
		head,
		path: pagePath(file),
		titles: [...head.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => norm(m[1])),
		description: meta('description'),
		robots: meta('robots'),
		canonicals: links.filter((l) => l.rel === 'canonical').map((l) => l.href),
		mdAlternate: links.find((l) => l.rel === 'alternate' && l.type === 'text/markdown')?.href,
		ogImage: prop('og:image'),
		twitterImage: meta('twitter:image'),
		lang: attrsOf(html.match(/<html\b[^>]*>/i)?.[0] ?? '').lang,
		headings: [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({
			level: Number(m[1]),
			text: norm(m[2].replace(/<[^>]+>/g, ' '))
		})),
		ldBlocks: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
			(m) => m[1]
		),
		anchors: [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => attrsOf(m[0]).href).filter(Boolean),
		ids: new Set([...html.matchAll(/\bid\s*=\s*"([^"]*)"/g)].map((m) => m[1])),
		visible: visibleText(html)
	});
}

// ---------------------------------------------------------------------------
// 1. titles & descriptions — presence, duplicates, near-duplicates
// ---------------------------------------------------------------------------

const byTitle = new Map();
const byDesc = new Map();
for (const [file, p] of pages) {
	if (p.titles.length !== 1)
		err('title-desc', file, `expected exactly one <title> in <head>, found ${p.titles.length}`);
	const title = p.titles[0] ?? '';
	if (!title) err('title-desc', file, 'empty <title>');
	if (!p.description || !p.description.trim())
		err('title-desc', file, 'missing or empty meta description');
	if (title) (byTitle.get(title) ?? byTitle.set(title, []).get(title)).push(file);
	if (p.description)
		(byDesc.get(p.description) ?? byDesc.set(p.description, []).get(p.description)).push(file);
}
for (const [t, files] of byTitle)
	if (files.length > 1) err('title-desc', files.join(','), `duplicate <title>: "${t}"`);
for (const [d, files] of byDesc)
	if (files.length > 1)
		err('title-desc', files.join(','), `duplicate meta description: "${d.slice(0, 80)}…"`);

// Near-duplicates (token-set Jaccard > 0.9, not byte-identical) — cannibalization radar.
function nearDupes(map, label) {
	const entries = [...map.entries()].map(([text, files]) => ({
		text,
		file: files[0],
		toks: tokenSet(text)
	}));
	for (let i = 0; i < entries.length; i++)
		for (let j = i + 1; j < entries.length; j++) {
			const sim = jaccard(entries[i].toks, entries[j].toks);
			if (sim > 0.9)
				warn(
					'title-desc',
					`${entries[i].file} ~ ${entries[j].file}`,
					`near-duplicate ${label} (${sim.toFixed(2)}): "${entries[i].text.slice(0, 60)}" vs "${entries[j].text.slice(0, 60)}"`
				);
		}
}
nearDupes(byTitle, 'titles');
nearDupes(byDesc, 'descriptions');

// ---------------------------------------------------------------------------
// 2. canonicals
// ---------------------------------------------------------------------------

const byCanonical = new Map();
for (const [file, p] of pages) {
	const expected = ORIGIN + p.path;
	if (p.canonicals.length !== 1)
		err('canonical', file, `expected exactly one rel=canonical, found ${p.canonicals.length}`);
	const c = p.canonicals[0];
	if (c && c !== expected) err('canonical', file, `canonical "${c}" !== expected "${expected}"`);
	if (c) (byCanonical.get(c) ?? byCanonical.set(c, []).get(c)).push(file);
}
for (const [c, files] of byCanonical)
	if (files.length > 1)
		err('canonical', files.join(','), `canonical "${c}" shared by ${files.length} pages`);

// ---------------------------------------------------------------------------
// 3. noindex
// ---------------------------------------------------------------------------

for (const [file, p] of pages)
	if (p.robots && /noindex/i.test(p.robots))
		err('noindex', file, `meta robots contains noindex: "${p.robots}"`);

// ---------------------------------------------------------------------------
// 4. heading ladder
// ---------------------------------------------------------------------------

for (const [file, p] of pages) {
	const h1s = p.headings.filter((h) => h.level === 1);
	if (h1s.length !== 1)
		err(
			'headings',
			file,
			`expected exactly one <h1>, found ${h1s.length}${h1s.length ? `: ${h1s.map((h) => `"${h.text.slice(0, 40)}"`).join(', ')}` : ''}`
		);
	let prev = 0;
	for (const h of p.headings) {
		if (h.level > prev + 1)
			err(
				'headings',
				file,
				`skipped heading level: h${prev || '0'} → h${h.level} at "${h.text.slice(0, 50)}"`
			);
		prev = h.level;
	}
}

// ---------------------------------------------------------------------------
// 5. lang attribute
// ---------------------------------------------------------------------------

for (const [file, p] of pages)
	if (!p.lang) err('lang', file, 'missing or empty lang attribute on <html>');

// ---------------------------------------------------------------------------
// 6. placeholder copy in visible text
// ---------------------------------------------------------------------------

const PLACEHOLDER_RE = /(^|[^a-z0-9])(todo|tktk|lorem|placeholder|xxx+)(?![a-z0-9])/gi;
for (const [file, p] of pages) {
	for (const m of p.visible.matchAll(PLACEHOLDER_RE)) {
		const at = m.index + m[1].length;
		const ctx = p.visible.slice(Math.max(0, at - 30), at + m[2].length + 30);
		err('placeholder', file, `"${m[2]}" in visible text: …${ctx}…`);
	}
}

// ---------------------------------------------------------------------------
// 7. JSON-LD
// ---------------------------------------------------------------------------

for (const [file, p] of pages) {
	if (p.ldBlocks.length === 0) {
		warn('jsonld', file, 'no <script type="application/ld+json"> block');
		continue;
	}
	for (const raw of p.ldBlocks) {
		let data;
		try {
			data = JSON.parse(raw);
		} catch (e) {
			err('jsonld', file, `JSON-LD does not parse: ${e.message}`);
			continue;
		}
		const nodes = data['@graph'] ?? [data];
		for (const node of nodes) {
			const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
			for (const t of types)
				if (!EXPECTED_LD_TYPES.has(t))
					err(
						'jsonld',
						file,
						`unexpected @graph type "${t}" (expected: ${[...EXPECTED_LD_TYPES].join('/')})`
					);
			if (node['@type'] === 'FAQPage') {
				for (const q of node.mainEntity ?? []) {
					const question = norm(q.name ?? '');
					const answer = norm(q.acceptedAnswer?.text ?? '');
					if (!question || !answer) {
						err('jsonld', file, `FAQPage entry missing name or acceptedAnswer.text`);
						continue;
					}
					if (!p.visible.includes(question))
						err('jsonld', file, `FAQ question not in visible text: "${question.slice(0, 70)}"`);
					if (!p.visible.includes(answer))
						err('jsonld', file, `FAQ answer not in visible text: "${answer.slice(0, 70)}…"`);
				}
			}
		}
	}
}

// ---------------------------------------------------------------------------
// 8. sitemap.xml + built-file set vs registry
// ---------------------------------------------------------------------------

const expectedPaths = new Set([
	'/',
	'/about',
	'/privacy',
	...SLUGS.map((s) => `/${s}`),
	...CATEGORY_SLUGS.map((s) => `/${s}`)
]);
{
	const sitemapFile = join(DIST, 'sitemap.xml');
	if (!existsSync(sitemapFile)) {
		err('sitemap', 'sitemap.xml', 'sitemap.xml missing from build output');
	} else {
		const xml = readFileSync(sitemapFile, 'utf8');
		const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1]));
		const locPaths = new Set();
		for (const loc of locs) {
			if (!loc.startsWith(ORIGIN)) {
				err('sitemap', 'sitemap.xml', `<loc> not on canonical origin: ${loc}`);
				continue;
			}
			const path = loc.slice(ORIGIN.length) || '/';
			if (locPaths.has(path)) err('sitemap', 'sitemap.xml', `duplicate <loc>: ${loc}`);
			locPaths.add(path);
		}
		for (const p of expectedPaths)
			if (!locPaths.has(p)) err('sitemap', 'sitemap.xml', `missing <loc>: ${ORIGIN}${p}`);
		for (const p of locPaths)
			if (!expectedPaths.has(p))
				err('sitemap', 'sitemap.xml', `extra <loc> (no such route): ${ORIGIN}${p}`);
	}

	// The prerendered html set must cover exactly the same routes.
	const builtPaths = new Set([...pages.values()].map((p) => p.path));
	for (const p of expectedPaths)
		if (!builtPaths.has(p))
			err(
				'sitemap',
				`${p === '/' ? 'index' : p.slice(1)}.html`,
				`route ${p} in registry but no prerendered html`
			);
	for (const p of builtPaths)
		if (!expectedPaths.has(p))
			err(
				'sitemap',
				`${p === '/' ? 'index' : p.slice(1)}.html`,
				`prerendered html for ${p} but route not in registry`
			);
}

// ---------------------------------------------------------------------------
// 9. internal links (html anchors, md twins, llms*.txt)
// ---------------------------------------------------------------------------

/** → { kind: 'skip'|'external'|'ok'|'missing'|'invalid', filePath?, frag? } */
function resolveLink(href, basePath) {
	if (/^(mailto:|tel:|data:|javascript:)/i.test(href)) return { kind: 'skip' };
	if (href.startsWith('#')) return { kind: 'ok', filePath: null, frag: href.slice(1) };
	let u;
	try {
		u = new URL(href, ORIGIN + basePath);
	} catch {
		return { kind: 'invalid' };
	}
	if (u.origin !== ORIGIN) return { kind: 'external' };
	let path;
	try {
		path = decodeURIComponent(u.pathname);
	} catch {
		return { kind: 'invalid' };
	}
	const frag = u.hash ? u.hash.slice(1) : undefined;
	const rel = path.replace(/^\/+/, '');
	if (rel === '') return { kind: 'ok', filePath: 'index.html', frag };
	if (RUNTIME_ROUTES.has(rel)) return { kind: 'ok', filePath: null, frag };
	if (allFiles.has(rel)) return { kind: 'ok', filePath: rel, frag };
	if (allFiles.has(`${rel}.html`)) return { kind: 'ok', filePath: `${rel}.html`, frag };
	if (allFiles.has(`${rel}/index.html`)) return { kind: 'ok', filePath: `${rel}/index.html`, frag };
	return { kind: 'missing' };
}

function checkLinks(source, basePath, hrefs) {
	for (const href of hrefs) {
		const r = resolveLink(href, basePath);
		if (r.kind === 'invalid') err('links', source, `unparseable href "${href}"`);
		else if (r.kind === 'missing') err('links', source, `dead internal link "${href}"`);
		else if (r.kind === 'ok' && r.frag) {
			// Anchor check — only when the target is a page we parsed.
			const targetFile = r.filePath === null && href.startsWith('#') ? source : r.filePath;
			const target = pages.get(targetFile);
			if (target && !target.ids.has(r.frag))
				warn('links', source, `link "${href}" targets missing anchor #${r.frag} in ${targetFile}`);
		}
	}
}

for (const [file, p] of pages) checkLinks(file, p.path, new Set(p.anchors));

const mdLinkTargets = (text) => {
	const targets = new Set();
	for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) targets.add(m[1]);
	for (const m of text.matchAll(/https?:\/\/compress-pro\.com[^\s)"'<>\]]*/g))
		targets.add(m[0].replace(/[).,;:!?]+$/, ''));
	return targets;
};

const mdFiles = [...allFiles].filter((f) => f.endsWith('.md') && !f.includes('/')).sort();
for (const md of mdFiles) {
	const text = readFileSync(join(DIST, md), 'utf8');
	checkLinks(md, pagePath(md.replace(/\.md$/, '.html')), mdLinkTargets(text));
}
for (const txt of ['llms.txt', 'llms-full.txt'])
	if (allFiles.has(txt)) checkLinks(txt, '/', mdLinkTargets(readFileSync(join(DIST, txt), 'utf8')));

// ---------------------------------------------------------------------------
// 10. og:image / twitter:image files exist
// ---------------------------------------------------------------------------

for (const [file, p] of pages) {
	for (const [label, url] of [
		['og:image', p.ogImage],
		['twitter:image', p.twitterImage]
	]) {
		if (!url) {
			warn('og-image', file, `no ${label} meta tag`);
			continue;
		}
		if (!url.startsWith(ORIGIN + '/')) {
			err('og-image', file, `${label} not on canonical origin: ${url}`);
			continue;
		}
		const rel = url.slice(ORIGIN.length + 1);
		if (!allFiles.has(rel)) err('og-image', file, `${label} file missing from build: /${rel}`);
	}
}

// ---------------------------------------------------------------------------
// 11. .md twins (tool pages + index; about/privacy have none by design)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
	'a',
	'an',
	'the',
	'to',
	'and',
	'or',
	'of',
	'in',
	'for',
	'online',
	'converter',
	'compress',
	'pro'
]);
for (const [file, p] of pages) {
	if (file === 'about.html' || file === 'privacy.html') continue;
	const twin = file.replace(/\.html$/, '.md');
	if (!allFiles.has(twin)) {
		err('md-twin', file, `missing markdown twin ${twin}`);
		continue;
	}
	const twinText = readFileSync(join(DIST, twin), 'utf8');
	const twinLower = twinText.toLowerCase();

	// rel=alternate in the html must point at the twin.
	const expectedAlt = `${ORIGIN}${p.path === '/' ? '/index' : p.path}.md`;
	if (!p.mdAlternate) err('md-twin', file, 'no <link rel="alternate" type="text/markdown">');
	else if (p.mdAlternate !== expectedAlt)
		err('md-twin', file, `markdown alternate "${p.mdAlternate}" !== expected "${expectedAlt}"`);

	// Twin must carry the canonical URL.
	if (!twinText.includes(ORIGIN + p.path))
		err('md-twin', file, `twin ${twin} does not contain canonical URL ${ORIGIN}${p.path}`);

	// Twin must mention the tool name: exact front-matter title match, else
	// fuzzy token check on the html title's keyword (part before — or |).
	const htmlTitle = p.titles[0] ?? '';
	const fmTitle = twinText.match(/^title:\s*"([^"]*)"/m)?.[1] ?? '';
	if (fmTitle !== htmlTitle) {
		const keyword = htmlTitle.split(/—|\|/)[0];
		const toks = [...tokenSet(keyword)].filter((t) => !STOPWORDS.has(t));
		const h1 = twinText.match(/^# (.+)$/m)?.[1] ?? '';
		const hay = (fmTitle + ' ' + h1).toLowerCase();
		const hit = toks.filter((t) => hay.includes(t)).length;
		if (toks.length && hit / toks.length < 0.6)
			err(
				'md-twin',
				file,
				`twin title/h1 does not mention tool name — html "${htmlTitle.slice(0, 50)}" vs twin "${fmTitle || h1}"`
			);
	}

	// Format-token drift: extensions the html title advertises must appear
	// somewhere in the twin (plural-tolerant).
	const titleLower = htmlTitle.toLowerCase();
	for (const ext of EXT_TOKENS) {
		if (!new RegExp(`(^|[^a-z0-9])${ext}(s)?([^a-z0-9]|$)`).test(titleLower)) continue;
		if (!new RegExp(`(^|[^a-z0-9])${ext}(s)?([^a-z0-9]|$)`).test(twinLower))
			warn('md-twin', file, `html title mentions "${ext}" but twin ${twin} never does`);
	}
}

// ---------------------------------------------------------------------------
// 12. llms.txt + llms-full.txt
// ---------------------------------------------------------------------------

{
	if (!allFiles.has('llms-full.txt')) err('llms', 'llms-full.txt', 'file missing from build');
	else {
		const full = readFileSync(join(DIST, 'llms-full.txt'), 'utf8');
		for (const slug of [...SLUGS, ...CATEGORY_SLUGS])
			if (!full.includes(`${ORIGIN}/${slug}`))
				err('llms', 'llms-full.txt', `tool slug missing: ${slug}`);
	}
	if (!allFiles.has('llms.txt')) err('llms', 'llms.txt', 'file missing from build');
	// llms.txt link resolution already runs in check 9.
}

// ---------------------------------------------------------------------------
// 13. _headers
// ---------------------------------------------------------------------------

{
	const hf = join(DIST, '_headers');
	if (!existsSync(hf)) err('headers', '_headers', 'file missing from build');
	else {
		const headers = readFileSync(hf, 'utf8');
		const active = headers
			.split('\n')
			.filter((l) => !/^\s*#/.test(l))
			.join('\n');
		const wants = [
			['Link header advertising llms.txt', /^\s*Link:.*<\/llms\.txt>/m],
			['Link header advertising agent-skills index', /^\s*Link:.*agent-skills\/index\.json/m],
			['Cross-Origin-Opener-Policy: same-origin', /^\s*Cross-Origin-Opener-Policy:\s*same-origin/m],
			[
				'Cross-Origin-Embedder-Policy: require-corp',
				/^\s*Cross-Origin-Embedder-Policy:\s*require-corp/m
			],
			['X-Content-Type-Options: nosniff', /^\s*X-Content-Type-Options:\s*nosniff/m]
		];
		for (const [label, re] of wants)
			if (!re.test(active)) err('headers', '_headers', `missing: ${label}`);
	}
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const CHECK_ORDER = [
	'title-desc',
	'canonical',
	'noindex',
	'headings',
	'lang',
	'placeholder',
	'jsonld',
	'sitemap',
	'links',
	'og-image',
	'md-twin',
	'llms',
	'headers'
];

console.log(
	`validate-seo: ${htmlPages.length} html pages, ${mdFiles.length} md twins, ${SLUGS.length} registry slugs\n`
);
for (const check of CHECK_ORDER) {
	const rows = results.filter((r) => r.check === check);
	const e = rows.filter((r) => r.severity === 'ERROR').length;
	const w = rows.length - e;
	console.log(`== ${check}: ${e} errors, ${w} warnings`);
	for (const r of rows.filter((r) => r.severity === 'ERROR'))
		console.log(`ERROR ${r.check} ${r.page}: ${r.detail}`);
	for (const r of rows.filter((r) => r.severity === 'WARN'))
		console.log(`WARN ${r.check} ${r.page}: ${r.detail}`);
}

const errors = results.filter((r) => r.severity === 'ERROR').length;
const warnings = results.length - errors;
console.log(
	`\n${errors ? '✗' : '✓'} ${errors} errors, ${warnings} warnings across ${htmlPages.length} pages`
);

const jsonIdx = process.argv.findIndex((a) => a === '--json' || a.startsWith('--json='));
if (jsonIdx !== -1) {
	const out =
		process.argv[jsonIdx].split('=')[1] ?? process.argv[jsonIdx + 1] ?? 'validate-seo.json';
	const counts = Object.fromEntries(
		CHECK_ORDER.map((c) => [
			c,
			{
				errors: results.filter((r) => r.check === c && r.severity === 'ERROR').length,
				warnings: results.filter((r) => r.check === c && r.severity === 'WARN').length
			}
		])
	);
	writeFileSync(
		out,
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				dist: DIST,
				pages: htmlPages.length,
				slugs: SLUGS.length,
				errors,
				warnings,
				counts,
				results
			},
			null,
			'\t'
		)
	);
	console.log(`json report → ${out}`);
}

process.exit(errors ? 1 : 0);
