import { defineConfig } from '@playwright/test';
import demoConfig from './playwright.demo.config';

/**
 * One-off variant of the demo config on a private port: the shared :4390 dev
 * server gets full-page-reloaded by parallel sessions' edits and first-run
 * dep optimizations, which kills long jobs (the 62 MB pdf compress) mid-run.
 * reuseExistingServer: false guarantees a server nobody else drives.
 */
export default defineConfig({
	...demoConfig,
	use: { ...demoConfig.use, baseURL: 'http://localhost:4391' },
	webServer: {
		command: 'pnpm exec vite dev --port 4391 --strictPort',
		port: 4391,
		timeout: 60_000,
		reuseExistingServer: false
	}
});
