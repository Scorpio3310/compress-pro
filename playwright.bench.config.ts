import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Peak-memory bench — run via `pnpm bench:memory` (which sets E2E_PREVIEW=1 so
 * the spread base config resolves the built app on wrangler :8787, and
 * E2E_BENCH=1 so the fixture generators also produce the large inputs).
 * A separate config keeps the bench out of every normal e2e run: the main
 * config's testDir never discovers e2e/bench. Numbers are recorded, not
 * asserted — see docs/memory-bench.md, rebuilt by the globalTeardown.
 */
export default defineConfig({
	...baseConfig,
	testDir: 'e2e/bench',
	// MEM-05 (100 MB → 7z in wasm) is the long pole; per-test setTimeout tops up.
	timeout: 360_000,
	fullyParallel: false,
	// Exactly one browser alive at a time — the RSS sampler counts every
	// descendant process, so a concurrent worker's browser would pollute peaks.
	workers: 1,
	// A retried memory number is a different number; never blend.
	retries: 0,
	reporter: [['list']],
	globalTeardown: './e2e/bench/global-teardown.ts',
	projects: [
		// channel 'chromium' = the full build in new-headless mode: the default
		// chrome-headless-shell throws SecurityError on
		// performance.measureUserAgentSpecificMemory() even when cross-origin
		// isolated, and the full build is closer to real Chrome for memory anyway.
		{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
	]
});
