import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Homepage demo-asset generator — run via `pnpm demo-assets`. Drives the REAL
 * /compress-jpg tool and writes src/lib/assets/demo/* + src/lib/demo-stats.json,
 * so the before/after numbers on the homepage are the app's actual output,
 * reproducible by any visitor. A separate config keeps the generator out of
 * every normal e2e run: the main config's testDir never discovers e2e/demo.
 */
export default defineConfig({
	...baseConfig,
	testDir: 'e2e/demo',
	// Generous: the pdf job pushes a 62 MB reference guide through Ghostscript
	// wasm plus two 288 DPI pdf.js renders — a manual local run, slack is free.
	timeout: 900_000,
	fullyParallel: false,
	// workers: 1 is load-bearing — jobs read-modify-write the shared
	// src/lib/demo-stats.json manifest; parallel workers would clobber it.
	workers: 1,
	// A retried encode is the same number, but keep runs strict and observable.
	retries: 0,
	reporter: [['list']],
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	// Own dev server on a dedicated port: the shared :5173 belongs to parallel
	// sessions whose Vite optimize cache may be stale for codecs this generator
	// touches (icodec-png dynamic import 404s on a stale graph).
	use: { ...baseConfig.use, baseURL: 'http://localhost:4390' },
	webServer: {
		command: 'pnpm exec vite dev --port 4390 --strictPort',
		port: 4390,
		timeout: 60_000,
		reuseExistingServer: true
	}
});
