import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Real-file validation matrix — run via `pnpm test:matrix [spec] [--grep cell]`.
 * Separate config (bench precedent): the main config's testDir never discovers
 * e2e/matrix, so normal e2e/CI runs are unaffected. Requires the DEV server
 * (E2E_PREVIEW must stay unset — the /@fs rasterizers are dev-only).
 *
 * Env contract:
 * - MATRIX_FILE=<regex>  pre-filter the walked real files (re-batches solo)
 * - MATRIX_GIANT=1       enable matrix-giant.spec.ts (>60 MB tier, use --workers 1)
 * - MATRIX_WORKERS=<n>   worker override (default 3; giant runs want 1)
 */
export default defineConfig({
	...baseConfig,
	testDir: 'e2e/matrix',
	outputDir: 'test-results/matrix/artifacts',
	// One cell can be a 250 MB PDF through Extreme — generous, giant spec tops up.
	timeout: 300_000,
	fullyParallel: false,
	workers: Number(process.env.MATRIX_WORKERS ?? 3),
	// A retried pass would poison the findings log — cells must fail honestly.
	retries: 0,
	testIgnore: [],
	reporter: [['list'], ['json', { outputFile: 'test-results/matrix/pw-report.json' }]],
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
