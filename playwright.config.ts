import { defineConfig, devices } from '@playwright/test';

// Dev server by default (fast, sourcemapped, allows in-page /src imports for PDF
// rasterization). E2E_PREVIEW=1 runs against the built app on wrangler (:8787).
const preview = !!process.env.E2E_PREVIEW;

// E2E_QUICK=1 (test:e2e:quick) skips the real-file suite on top of the @slow
// grep — fast local iteration; the full run stays the report of record.
const quick = !!process.env.E2E_QUICK;

// E2E_XBROWSER=1 adds Firefox/WebKit projects running only the @xbrowser
// capability-degradation smoke — opt-in so plain runs never require
// `playwright install firefox webkit`.
const xbrowser = !!process.env.E2E_XBROWSER;

export default defineConfig({
	testDir: 'e2e/specs',
	outputDir: 'test-results/artifacts',
	globalSetup: './e2e/global-setup.ts',
	globalTeardown: './e2e/global-teardown.ts',
	// WASM cold-start headroom (gs.wasm is 15 MB; jSquash loads per worker).
	timeout: 90_000,
	expect: { timeout: 15_000 },
	// Specs within a file run serially in one worker; gs.wasm compiles are heavy,
	// so cap concurrency instead of fully parallelizing.
	fullyParallel: false,
	workers: 4,
	// CI-only retries absorb infra hiccups (server restarts, slow disk); local
	// runs stay strict so real regressions surface immediately.
	retries: process.env.CI ? 2 : 0,
	testIgnore: quick ? ['**/real-files.spec.ts', '**/real-archives.spec.ts'] : [],
	reporter: [['list'], ['html', { outputFolder: 'test-results/pw-html', open: 'never' }]],
	use: {
		baseURL: preview ? 'http://localhost:8787' : 'http://localhost:5173',
		contextOptions: { reducedMotion: 'reduce' },
		viewport: { width: 1280, height: 900 },
		actionTimeout: 15_000,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'off'
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		...(xbrowser
			? [
					{ name: 'firefox', grep: /@xbrowser/, use: { ...devices['Desktop Firefox'] } },
					{ name: 'webkit', grep: /@xbrowser/, use: { ...devices['Desktop Safari'] } }
				]
			: [])
	],
	webServer: preview
		? { command: 'pnpm preview', port: 8787, timeout: 240_000, reuseExistingServer: true }
		: { command: 'pnpm dev', port: 5173, timeout: 60_000, reuseExistingServer: true }
});
