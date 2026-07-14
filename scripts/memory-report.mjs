/**
 * Renders the peak-memory bench manifests (suite "memory", written by
 * e2e/bench/memory.spec.ts via CaseRecorder) into a scenario × browser
 * markdown table — printed to stdout and written to docs/memory-bench.md.
 * Runs from the bench globalTeardown after `pnpm bench:memory`.
 *
 *   node scripts/memory-report.mjs
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_DIR = join(ROOT, 'test-results', 'manifest');
const OUT_MD = join(ROOT, 'docs', 'memory-bench.md');

const BROWSER_ORDER = ['chromium', 'firefox', 'webkit'];

const tests = [];
if (existsSync(MANIFEST_DIR)) {
	for (const f of readdirSync(MANIFEST_DIR)
		.filter((f) => f.endsWith('.json'))
		.sort()) {
		try {
			const t = JSON.parse(readFileSync(join(MANIFEST_DIR, f), 'utf8'));
			if (t.suite === 'memory') tests.push(t);
		} catch {
			console.warn(`memory-report: skipping unreadable ${f}`);
		}
	}
}

const rows = [];
for (const t of tests) {
	for (const c of t.cases ?? []) {
		rows.push({
			id: c.id,
			browser: String(c.settings?.browser ?? '?'),
			file: c.input?.name ?? '?',
			inputMb: c.input?.bytes ? (c.input.bytes / 1e6).toFixed(1) : null,
			status: t.status,
			m: c.metrics ?? {},
			note: c.note ?? ''
		});
	}
}
rows.sort(
	(a, b) =>
		a.id.localeCompare(b.id) || BROWSER_ORDER.indexOf(a.browser) - BROWSER_ORDER.indexOf(b.browser)
);

if (rows.length === 0) {
	console.log('memory-report: no suite "memory" manifests found — nothing to render');
	process.exit(0);
}

const fmt = (v, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`);
/** run1 peak as "Δtree (proc abs)" — the two numbers that matter together. */
const peakCell = (m) =>
	m.deltaMb === undefined && m.peakTreeMb === undefined
		? '—'
		: `${fmt(m.deltaMb)} (proc ${fmt(m.peakProcMb)})`;

const lines = rows.map((r) => {
	const m = r.m;
	if (m.supported === false) {
		return `| ${r.id} | ${r.browser} | ${r.file} (${fmt(r.inputMb)} MB) | unsupported | — | — | — | — | — |`;
	}
	const time =
		m.run2Sec !== undefined
			? `${fmt(m.run1Sec)}s / ${fmt(m.run2Sec)}s`
			: m.run1Sec !== undefined
				? `${fmt(m.run1Sec)}s`
				: '—';
	const uasm =
		m.uasmRun1Mb !== undefined || m.uasmRun2Mb !== undefined
			? `${fmt(m.uasmRun2Mb ?? m.uasmRun1Mb)} (wk ${fmt(m.uasmRun2WorkerMb ?? m.uasmRun1WorkerMb)})`
			: '—';
	const run2 =
		m.run2DeltaMb !== undefined ? `${fmt(m.run2DeltaMb)} (leak ${fmt(m.leakSignalMb)})` : '—';
	const settle =
		m.atCancelDeltaMb !== undefined
			? `${fmt(m.settledDeltaMb)} (at cancel ${fmt(m.atCancelDeltaMb)})`
			: fmt(m.settledDeltaMb);
	return `| ${r.id} | ${r.browser} | ${r.file} (${fmt(r.inputMb)} MB) | ${fmt(m.baselineMb)} | ${peakCell(m)} | ${run2} | ${settle} | ${uasm} | ${time} |`;
});

const gb = (n) => (n / 1024 ** 3).toFixed(0);
const md = `# Peak-memory bench

Generated ${new Date().toISOString()} · ${cpus()[0]?.model ?? 'unknown CPU'} · ${gb(totalmem())} GB RAM · built app on wrangler (preview)

Peak = max RSS sampled every 250 ms over the browser's process tree (Δ over the post-upload
baseline; "proc" = largest single process, absolute). UASM = chromium-only
\`measureUserAgentSpecificMemory()\` after the run (retained, post-GC; "wk" = worker realms) —
it counts a SharedArrayBuffer-backed wasm memory once per attached pthread realm, so
multithreaded scenarios (MEM-04) report many GB; read RSS for those, UASM for leak trends.
macOS RSS under-counts compressed pages and the tree sum double-counts shared ones —
**trends, not budgets**. Regenerate with \`pnpm bench:memory\`.

WebKit caveat: SharedArrayBuffer-backed wasm memory (MEM-04) and VideoToolbox codec memory
(MEM-02/03) live in shared/XPC regions that per-process RSS barely attributes — webkit peaks
are a FLOOR there, not a comparison point (its gs numbers, plain wasm memory, are honest).

| scenario | browser | input | baseline MB | run1 peak Δ MB | run2 Δ MB | settled Δ MB | UASM MB | time |
|---|---|---|---|---|---|---|---|---|
${lines.join('\n')}

Scenario key: MEM-01 gs PDF High ×2 (leak signal = run2 − run1 peak) · MEM-02 video WebM→WebM ·
MEM-03 video MP4→MP4 (chromium only) · MEM-04 3×12 MP JPG→AVIF batch · MEM-05 100 MB ISO→7z ·
MEM-06 gs cancel mid-run (settled Δ near zero ⇒ worker terminate returned the wasm heap).
`;

writeFileSync(OUT_MD, md);
console.log(md);
console.log(`memory-report: wrote ${OUT_MD}`);
