/**
 * Bundle-size budget gate (CI, after `pnpm build`).
 *
 * Every one of the ~94 tool pages shares route node 2 and the same initial
 * modulepreload set, so a single accidental *static* import (a codec wrapper, a
 * settings panel, mediabunny, a seo-body group…) silently adds its weight to
 * every page at once. This turns that class of regression into a hard failure.
 *
 * Baseline (after the lazy panel/compress split + seo lite/detail split + lazy
 * motion engine): route node 2 ~74.6 KB raw, total initial JS ~79.6 KB gzipped.
 * Budgets carry ~15% headroom — tight enough that `motion` (25 KB gz) or a seo
 * detail group sneaking back into the static graph fails loudly. Raising them
 * is a deliberate act — it means every tool page just got heavier, so confirm
 * the growth is intentional (not an import that belongs behind `await import()`)
 * before bumping the numbers.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const DIST = '.svelte-kit/cloudflare';
// Any tool page is representative — they all share route node 2 byte-for-byte.
const PAGE = 'compress-jpg.html';

const BUDGET = {
	initialJsGz: 92_000, // sum of modulepreloaded JS, gzipped (baseline ~79.6 KB)
	node2Raw: 86_000 // the shared [[tool=tool]] route node, raw bytes (baseline ~74.6 KB)
};

const html = readFileSync(join(DIST, PAGE), 'utf8');
const refs = [...new Set([...html.matchAll(/immutable\/[^"']+?\.js/g)].map((m) => m[0]))];
if (refs.length === 0) {
	console.error(`No immutable JS references found in ${PAGE} — did the build run?`);
	process.exit(1);
}

let raw = 0;
let gz = 0;
for (const ref of refs) {
	const buf = readFileSync(join(DIST, '_app', ref));
	raw += buf.length;
	gz += gzipSync(buf).length;
}

const nodesDir = join(DIST, '_app/immutable/nodes');
const node2 = readdirSync(nodesDir).find((f) => /^2\..*\.js$/.test(f));
const node2Raw = node2 ? readFileSync(join(nodesDir, node2)).length : Infinity;

console.log(
	`initial JS (${refs.length} chunks): ${raw} raw / ${gz} gz  [budget ${BUDGET.initialJsGz} gz]`
);
console.log(`route node 2 (${node2 ?? 'MISSING'}): ${node2Raw} raw  [budget ${BUDGET.node2Raw}]`);

const problems = [];
if (gz > BUDGET.initialJsGz)
	problems.push(`initial JS ${gz} gz exceeds budget ${BUDGET.initialJsGz} gz`);
if (node2Raw > BUDGET.node2Raw)
	problems.push(`route node 2 ${node2Raw} raw exceeds budget ${BUDGET.node2Raw}`);

if (problems.length) {
	console.error('\n✗ Bundle-size budget exceeded:');
	for (const p of problems) console.error(`  - ${p}`);
	console.error(
		'\nThis payload ships on every tool page. Find the accidental static import' +
			'\n(likely a codec, panel, or heavy lib that should be behind `await import()`)' +
			'\nbefore raising the budget in scripts/check-bundle-size.mjs.'
	);
	process.exit(1);
}
console.log('\n✓ Bundle size within budget.');
