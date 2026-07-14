import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import baseTeardown from '../global-teardown';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Bench teardown: the shared visual report, then the memory markdown table. */
export default function globalTeardown(): void {
	baseTeardown();
	try {
		execFileSync('node', [join(ROOT, 'scripts', 'memory-report.mjs')], {
			cwd: ROOT,
			stdio: 'inherit'
		});
	} catch (err) {
		// Like build-report: a report is a convenience artifact, never a failure.
		console.error('memory-report failed:', err);
	}
}
