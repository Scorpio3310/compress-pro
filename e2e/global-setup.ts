import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAudioFixtures } from './audio-fixtures';
import { generateMjpegFixtures } from './mjpeg-fixture';
import { generateVideoFixtures } from './video-fixtures';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export default async function globalSetup(): Promise<void> {
	// Regenerates only when the generator hash in .manifest.json is stale.
	execFileSync('node', ['scripts/generate-fixtures.mjs', '--if-missing'], {
		cwd: ROOT,
		stdio: 'inherit'
	});
	// Video clips need WebCodecs — generated in a Chromium of their own.
	await generateVideoFixtures();
	// Encoded audio (mp3/aac/opus) needs WebCodecs + the LAME wasm too.
	await generateAudioFixtures();
	// Motion-JPEG .mov (browsers/mediabunny can't ENCODE MJPEG, so it's hand-muxed
	// in Node from sharp JPEG frames + a PCM track).
	await generateMjpegFixtures();
	// Fresh manifest + report assets per run (artifacts dir is Playwright's own).
	rmSync(join(ROOT, 'test-results', 'manifest'), { recursive: true, force: true });
	rmSync(join(ROOT, 'test-results', 'report', 'assets'), { recursive: true, force: true });
	mkdirSync(join(ROOT, 'test-results', 'manifest'), { recursive: true });
	mkdirSync(join(ROOT, 'test-results', 'report', 'assets'), { recursive: true });
}
