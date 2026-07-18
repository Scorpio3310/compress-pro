/**
 * Merge real-file matrix cell results (test-results/matrix/cells/*.json) into:
 * - test-results/matrix/results.jsonl        (one line per cell, sorted)
 * - test-results/matrix/matrix-report.md     (grouped markdown table)
 * - test-results/matrix/rasters/<family>/manifest.json  (visual-inspection index)
 *
 * Usage: node scripts/matrix-report.mjs [--family pdf]
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MATRIX = join(ROOT, 'test-results', 'matrix');
const CELLS = join(MATRIX, 'cells');

const familyFilter = (() => {
	const i = process.argv.indexOf('--family');
	return i >= 0 ? process.argv[i + 1] : null;
})();

let files = [];
try {
	files = readdirSync(CELLS).filter((f) => f.endsWith('.json'));
} catch {
	console.error(`no cells at ${CELLS} — run pnpm test:matrix first`);
	process.exit(1);
}

const cells = files
	.map((f) => JSON.parse(readFileSync(join(CELLS, f), 'utf8')))
	.filter((c) => !familyFilter || c.family === familyFilter)
	.sort((a, b) => a.cellId.localeCompare(b.cellId));

writeFileSync(join(MATRIX, 'results.jsonl'), cells.map((c) => JSON.stringify(c)).join('\n') + '\n');

// --- markdown table, grouped by family ------------------------------------
const byFamily = new Map();
for (const c of cells) {
	if (!byFamily.has(c.family)) byFamily.set(c.family, []);
	byFamily.get(c.family).push(c);
}

const fmtBytes = (n) =>
	n === undefined || n === null
		? ''
		: n >= 1_000_000
			? `${(n / 1_000_000).toFixed(1)}MB`
			: `${Math.round(n / 1000)}KB`;
const icon = { pass: '✓', fail: '✗', error: '⚠', skip: '–' };

const lines = ['# Real-file matrix results', ''];
const totals = { pass: 0, fail: 0, error: 0, skip: 0 };
for (const c of cells) totals[c.status] = (totals[c.status] ?? 0) + 1;
lines.push(
	`**${cells.length} cells** — ${totals.pass} pass · ${totals.fail} fail · ${totals.error} error · ${totals.skip} skip`,
	''
);
for (const [family, list] of [...byFamily.entries()].sort()) {
	const f = { pass: 0, fail: 0, error: 0, skip: 0 };
	for (const c of list) f[c.status] = (f[c.status] ?? 0) + 1;
	lines.push(
		`## ${family} (${list.length}: ${f.pass}✓ ${f.fail}✗ ${f.error}⚠ ${f.skip}–)`,
		'',
		'| file | action | level | st | in | out | Δ% | metrics | note |',
		'|---|---|---|---|---|---|---|---|---|'
	);
	for (const c of list) {
		const metrics = Object.entries(c.metrics ?? {})
			.filter(([, v]) => v !== null)
			.map(([k, v]) => `${k}=${v}`)
			.join(' ');
		const note = [c.keptOriginal ? 'KEPT-ORIGINAL' : '', c.notes ?? '', c.error ?? '']
			.filter(Boolean)
			.join('; ')
			.slice(0, 120);
		lines.push(
			`| ${c.file} | ${c.action} | ${c.level} | ${icon[c.status] ?? c.status} | ${fmtBytes(c.inBytes)} | ${fmtBytes(c.outBytes)} | ${c.savingsPct ?? ''} | ${metrics.slice(0, 80)} | ${note} |`
		);
	}
	lines.push('');
}
writeFileSync(join(MATRIX, 'matrix-report.md'), lines.join('\n'));

// --- per-family raster manifests for visual inspectors ---------------------
for (const [family, list] of byFamily.entries()) {
	const withRasters = list.filter((c) => c.rasters?.length);
	if (withRasters.length === 0) continue;
	const dir = join(MATRIX, 'rasters', family);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, 'manifest.json'),
		JSON.stringify(
			withRasters.map((c) => ({
				cellId: c.cellId,
				file: c.file,
				tool: c.tool,
				action: c.action,
				level: c.level,
				status: c.status,
				metrics: c.metrics ?? {},
				rasters: c.rasters
			})),
			null,
			'\t'
		)
	);
}

console.log(
	`matrix-report: ${cells.length} cells → results.jsonl + matrix-report.md (${totals.pass}✓ ${totals.fail}✗ ${totals.error}⚠ ${totals.skip}–)`
);
