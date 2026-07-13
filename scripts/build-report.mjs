/**
 * Builds the visual e2e report: test-results/manifest/*.json + copied assets
 * → test-results/report/index.html. Self-contained (data inlined, no CDN,
 * works over file://). Cards render before/after side by side — GIF/animated
 * WebP animate natively in <img> — sorted worst-first.
 *
 *   node scripts/build-report.mjs [--open]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_DIR = join(ROOT, 'test-results', 'manifest');
const REPORT_DIR = join(ROOT, 'test-results', 'report');
const OUT_HTML = join(REPORT_DIR, 'index.html');

const tests = [];
if (existsSync(MANIFEST_DIR)) {
	for (const f of readdirSync(MANIFEST_DIR)
		.filter((f) => f.endsWith('.json'))
		.sort()) {
		try {
			tests.push(JSON.parse(readFileSync(join(MANIFEST_DIR, f), 'utf8')));
		} catch {
			console.warn(`build-report: skipping unreadable ${f}`);
		}
	}
}

const data = {
	generatedAt: new Date().toISOString(),
	mode: process.env.E2E_PREVIEW ? 'preview (wrangler)' : 'dev (vite)',
	tests
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Compress Pro e2e visual report</title>
<style>
:root { color-scheme: light dark;
  --bg: light-dark(#f7f7f8, #101014);
  --card: light-dark(#ffffff, #1a1a20);
  --ink: light-dark(#17171c, #ececf1);
  --muted: light-dark(#6b7280, #9ca3af);
  --line: light-dark(#e5e7eb, #2d2d36);
  --accent: #2563eb;
  --ok: light-dark(#0a7d33, #4ade80);
  --warn: light-dark(#b45309, #fbbf24);
  --bad: light-dark(#b91c1c, #f87171);
}
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
header { position: sticky; top: 0; z-index: 5; background: var(--card); border-bottom: 1px solid var(--line); padding: 12px 20px; display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: center; }
header h1 { font-size: 15px; margin: 0 8px 0 0; }
.stat b { font-variant-numeric: tabular-nums; }
.stat span { color: var(--muted); }
header .controls { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
select, input[type=search] { font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--line); border-radius: 999px; padding: 4px 12px; }
main { max-width: 1280px; margin: 0 auto; padding: 20px; }
section > h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 26px 4px 10px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; margin-bottom: 14px; }
.card.failed { border-color: var(--bad); border-width: 2px; }
.card.known-gap { border-color: var(--warn); border-width: 2px; }
.card.document { border-color: color-mix(in srgb, var(--warn) 55%, var(--line)); }
.card h3 { margin: 0 0 2px; font-size: 14px; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.card h3 .id { color: var(--accent); font-variant-numeric: tabular-nums; }
.badge { font-size: 11px; font-weight: 600; border-radius: 999px; padding: 1px 9px; }
.badge.passed { background: color-mix(in srgb, var(--ok) 14%, transparent); color: var(--ok); }
.badge.failed, .badge.timedOut, .badge.interrupted { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad); }
.badge.document, .badge.known-gap, .badge.skipped { background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px; }
.chip { font-size: 11px; background: var(--bg); border: 1px solid var(--line); border-radius: 999px; padding: 1px 9px; color: var(--muted); }
.imgs { display: flex; gap: 12px; flex-wrap: wrap; }
.imgs figure { margin: 0; flex: 1 1 300px; max-width: 480px; min-width: 220px; }
.imgs figcaption { font-size: 11px; color: var(--muted); margin-bottom: 4px; display: flex; justify-content: space-between; gap: 8px; }
.imgs .frame { border: 1px solid var(--line); border-radius: 10px; overflow: hidden;
  background: repeating-conic-gradient(light-dark(#00000014, #ffffff14) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px; }
.imgs img, .imgs video { display: block; width: 100%; height: auto; }
.filechip { display: inline-block; margin: 4px 0; padding: 8px 14px; border: 1px dashed var(--line); border-radius: 10px; color: var(--accent); text-decoration: none; font-size: 12px; word-break: break-all; }
.metrics { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.metrics b { color: var(--ink); font-weight: 600; }
.metrics .save { color: var(--ok); } .metrics .grow { color: var(--bad); }
.warns { margin-top: 8px; font-size: 12px; color: var(--warn); white-space: pre-wrap; }
.error { margin-top: 8px; font-size: 12px; color: var(--bad); white-space: pre-wrap; }
.note { margin-top: 8px; font-size: 12px; color: var(--muted); font-style: italic; }
.difftoggle { font: inherit; font-size: 11px; margin-top: 8px; background: none; border: 1px solid var(--line); color: var(--muted); border-radius: 999px; padding: 2px 10px; cursor: pointer; }
.hidden { display: none; }
footer { color: var(--muted); font-size: 12px; text-align: center; padding: 24px; }
</style>
</head>
<body>
<header>
  <h1>Compress Pro e2e</h1>
  <div class="stat"><b id="s-pass"></b> <span id="s-pass-label"></span></div>
  <div class="stat"><b id="s-bytes"></b> <span>bytes in → out</span></div>
  <div class="stat"><b id="s-count"></b> <span>cases</span></div>
  <div class="controls">
    <select id="f-suite"><option value="">all suites</option></select>
    <select id="f-status">
      <option value="">all statuses</option>
      <option value="failed">failed</option>
      <option value="known-gap">known-gap</option>
      <option value="document">document</option>
      <option value="passed">passed</option>
      <option value="skipped">skipped</option>
    </select>
    <input id="f-text" type="search" placeholder="search…">
  </div>
</header>
<main id="root"></main>
<footer id="foot"></footer>
<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>
const DATA = JSON.parse(document.getElementById('data').textContent);
const IMG_EXT = /\\.(png|jpe?g|webp|gif|avif|svg)$/i;
const VID_EXT = /\\.(mp4|webm|mov|mkv)$/i;
const AUD_EXT = /\\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i;

const fmtBytes = (n) => {
  if (n == null || n === 0) return '—';
  const u = ['B', 'kB', 'MB', 'GB']; let i = 0; let v = n;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + ' ' + u[i];
};

// Flatten: one card per recorded case, inheriting its test's status.
const cards = [];
for (const t of DATA.tests) {
  for (const c of t.cases) {
    const status = t.status !== 'passed' ? t.status
      : c.expectation === 'known-gap' ? 'known-gap'
      : c.expectation === 'document' ? 'document'
      : 'passed';
    cards.push({ ...c, suite: t.suite, testTitle: t.title, testStatus: t.status, status, durationMs: t.durationMs, errorMessage: t.errorMessage });
  }
}
const RANK = { failed: 0, timedOut: 0, interrupted: 0, 'known-gap': 1, document: 2, passed: 3, skipped: 4 };
cards.sort((a, b) =>
  (RANK[a.status] ?? 0) - (RANK[b.status] ?? 0) ||
  ((b.metrics?.diffRatio ?? 0) - (a.metrics?.diffRatio ?? 0)) ||
  a.suite.localeCompare(b.suite) || String(a.id).localeCompare(String(b.id)));

// Header stats
const failedTests = DATA.tests.filter((t) => t.status !== 'passed' && t.status !== 'skipped').length;
document.getElementById('s-pass').textContent = (DATA.tests.length - failedTests) + '/' + DATA.tests.length;
document.getElementById('s-pass-label').textContent = 'tests green';
const inB = cards.reduce((s, c) => s + (c.input?.bytes || 0), 0);
const outB = cards.reduce((s, c) => s + (c.input?.bytes ? c.output?.bytes || 0 : 0), 0);
document.getElementById('s-bytes').textContent = fmtBytes(inB) + ' → ' + fmtBytes(outB) +
  (inB > 0 ? ' (−' + Math.round((1 - outB / inB) * 100) + '%)' : '');
document.getElementById('s-count').textContent = String(cards.length);
document.getElementById('foot').textContent = 'generated ' + DATA.generatedAt + ' · mode: ' + DATA.mode;

const suites = [...new Set(cards.map((c) => c.suite))].sort();
for (const s of suites) {
  const o = document.createElement('option'); o.value = s; o.textContent = s;
  document.getElementById('f-suite').appendChild(o);
}

function media(path, caption, bytes) {
  if (!path) return '';
  const cap = '<figcaption><span>' + caption + '</span><span>' + fmtBytes(bytes) + '</span></figcaption>';
  if (IMG_EXT.test(path)) {
    return '<figure>' + cap + '<div class="frame"><img loading="lazy" src="' + path + '" alt="' + caption + '"></div></figure>';
  }
  if (VID_EXT.test(path)) {
    return '<figure>' + cap + '<div class="frame"><video controls muted loop preload="metadata" src="' + path + '"></video></div></figure>';
  }
  if (AUD_EXT.test(path)) {
    return '<figure>' + cap + '<div class="frame" style="display:flex;align-items:center;padding:8px"><audio controls preload="metadata" src="' + path + '" style="width:100%"></audio></div></figure>';
  }
  return '<figure>' + cap + '<a class="filechip" href="' + path + '" download>' + path.split('/').pop() + ' ⬇</a></figure>';
}

function esc(s) { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

function cardHtml(c, i) {
  const a = c.assets ?? {};
  const chips = Object.entries(c.settings ?? {}).map(([k, v]) => '<span class="chip">' + esc(k) + ': ' + esc(v) + '</span>').join('');
  const inB = c.input?.bytes || 0, outB = c.output?.bytes || 0;
  const pct = inB > 0 && outB > 0 ? Math.round((1 - outB / inB) * 100) : null;
  const mParts = [];
  if (inB || outB) mParts.push('<span>' + fmtBytes(inB) + ' → <b>' + fmtBytes(outB) + '</b>' +
    (pct != null ? ' <b class="' + (pct >= 0 ? 'save' : 'grow') + '">' + (pct >= 0 ? '−' + pct : '+' + -pct) + '%</b>' : '') + '</span>');
  if (c.output?.width) mParts.push('<span>dims <b>' + (c.input?.width ? c.input.width + '×' + c.input.height + ' → ' : '') + c.output.width + '×' + c.output.height + '</b></span>');
  if (c.input?.pages || c.output?.pages) mParts.push('<span>frames/pages <b>' + (c.input?.pages ?? '?') + ' → ' + (c.output?.pages ?? '?') + '</b></span>');
  for (const [k, v] of Object.entries(c.metrics ?? {})) mParts.push('<span>' + esc(k) + ' <b>' + esc(v) + '</b></span>');
  mParts.push('<span>test <b>' + (c.durationMs / 1000).toFixed(1) + 's</b></span>');
  return '<div class="card ' + c.status + '" data-suite="' + esc(c.suite) + '" data-status="' + c.status + '">' +
    '<h3><span class="id">' + esc(c.id) + '</span> ' + esc(c.title ?? c.testTitle) +
    ' <span class="badge ' + c.status + '">' + c.status + '</span></h3>' +
    '<div class="chips">' + chips + '</div>' +
    '<div class="imgs">' +
      media(a.original, 'original — ' + esc(c.input?.name ?? ''), inB) +
      media(a.output, 'output — ' + esc(c.output?.name ?? ''), outB) +
      media(a.visual, 'visual', null) +
    '</div>' +
    (a.diff ? '<button class="difftoggle" onclick="this.nextElementSibling.classList.toggle(\\'hidden\\')">toggle diff</button>' +
      '<div class="imgs hidden">' + media(a.diff, 'pixel diff', null) + '</div>' : '') +
    (c.warnings?.length ? '<div class="warns">⚠ ' + c.warnings.map(esc).join('\\n⚠ ') + '</div>' : '') +
    (c.status !== 'passed' && c.errorMessage ? '<div class="error">' + esc(c.errorMessage) + '</div>' : '') +
    (c.note ? '<div class="note">' + esc(c.note) + '</div>' : '') +
  '</div>';
}

function render() {
  const suite = document.getElementById('f-suite').value;
  const status = document.getElementById('f-status').value;
  const text = document.getElementById('f-text').value.toLowerCase();
  const root = document.getElementById('root');
  const groups = new Map();
  for (const c of cards) {
    if (suite && c.suite !== suite) continue;
    if (status && c.status !== status) continue;
    if (text && !(JSON.stringify(c).toLowerCase().includes(text))) continue;
    if (!groups.has(c.suite)) groups.set(c.suite, []);
    groups.get(c.suite).push(c);
  }
  // Suites ordered by their worst card (already sorted worst-first globally).
  const order = [...groups.entries()];
  root.innerHTML = order.map(([name, cs]) =>
    '<section><h2>' + esc(name) + ' <span style="font-weight:400">(' + cs.length + ')</span></h2>' +
    cs.map(cardHtml).join('') + '</section>').join('') || '<p style="color:var(--muted)">no cases match</p>';
}
for (const id of ['f-suite', 'f-status', 'f-text']) document.getElementById(id).addEventListener('input', render);
render();
</script>
</body>
</html>`;

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(OUT_HTML, html);
const caseCount = tests.reduce((s, t) => s + t.cases.length, 0);
console.log(`report: ${tests.length} tests, ${caseCount} cases → ${OUT_HTML}`);

if (process.argv.includes('--open')) {
	execFileSync('open', [OUT_HTML]);
}
