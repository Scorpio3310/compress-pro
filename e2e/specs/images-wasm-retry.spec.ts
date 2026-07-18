/**
 * WR-01: a wasm load that fails once (flaky network, offline cache miss) must
 * not poison the pooled image worker — the module-scope `ready ??= load()`
 * cache used to keep the REJECTED promise forever, so every retry replayed the
 * stale error until a full page reload.
 *
 * Interception notes (measured against the dev server):
 * - worker-thread requests only hit context-level routes, never page.route;
 * - the exact-match glob (no trailing star) spares the worker's static
 *   `?url` module-asset import (`jxl-dec.wasm?import&url`) — aborting that
 *   would kill the worker boot instead, which rpc handles by termination, and
 *   the fresh worker would side-step the poisoned-promise bug entirely.
 */
import { expect, fx, test } from '../fixtures';
import { compress, downloadRow, gotoTab, setOutputFormat, upload } from '../helpers';
import { imageMeta } from '../verify';

const WASM_FETCH = '**/jxl-dec.wasm';

test('WR-01: a failed jxl wasm fetch recovers on the next Compress click', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('photo-720x480.jxl'));
	await setOutputFormat(page, 'JPG');

	// First run: the decoder wasm dies mid-fetch (network blip).
	await page.context().route(WASM_FETCH, (route) => route.abort());
	await compress(page, { expectError: true });

	// Network is back: same file, same pooled worker — the retry must fetch
	// the wasm fresh and succeed without a page reload.
	await page.context().unroute(WASM_FETCH);
	const wasmRefetch = page.waitForRequest(WASM_FETCH, { timeout: 60_000 });
	const run = await compress(page, { timeout: 120_000 });
	expect(run.error).toBeNull();
	await wasmRefetch; // proves a fresh load happened instead of a cached rejection
	const art = await downloadRow(page);
	expect((await imageMeta(art.bytes)).format).toBe('jpeg');
});
