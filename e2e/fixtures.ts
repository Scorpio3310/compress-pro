/**
 * Shared test extension: fixture paths + manifest access + the CaseRecorder
 * that feeds the visual report. One JSON per Playwright testId (parallel-safe;
 * retries overwrite their own file), binary artifacts copied under
 * test-results/report/assets/<caseId>/.
 */
import { test as base, expect, type TestInfo } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALIBRATE } from './thresholds';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const GENERATED = join(ROOT, 'tests', 'fixtures', 'generated');
export const REAL = join(ROOT, 'tests', 'fixtures', 'real');
const MANIFEST_DIR = join(ROOT, 'test-results', 'manifest');
const ASSETS_DIR = join(ROOT, 'test-results', 'report', 'assets');

/** Absolute path of a generated fixture. */
export function fx(name: string): string {
	return join(GENERATED, name);
}

/**
 * First real-world sample matching the pattern (sorted for determinism), or
 * null → the caller test.skips. Discovery instead of exact names, so whatever
 * Nik drops into tests/fixtures/real/ just works.
 */
export function realFile(re: RegExp): string | null {
	try {
		const match = readdirSync(REAL)
			.filter((f) => re.test(f))
			.sort()[0];
		return match ? join(REAL, match) : null;
	} catch {
		return null;
	}
}

/** Absolute path of a generated VIDEO fixture (Chromium/WebCodecs-made). */
export function fxVideo(name: string): string {
	return join(GENERATED, 'video', name);
}

/** Absolute path of a generated AUDIO fixture (Chromium/WebCodecs-made). */
export function fxAudio(name: string): string {
	return join(GENERATED, 'audio', name);
}

interface AudioManifest {
	genHash: string;
	capabilities: { mp3: boolean; aac: boolean; opus: boolean; flac: boolean };
	failures: string[];
	files: Record<string, Record<string, unknown>>;
}

/** Written by e2e/audio-fixtures.ts during global-setup. */
export function audioFixtures(): AudioManifest {
	return JSON.parse(readFileSync(join(GENERATED, 'audio', 'audio.manifest.json'), 'utf8'));
}

interface VideoManifest {
	genHash: string;
	capabilities: { avc: boolean; vp9: boolean; opus: boolean; aac: boolean };
	failures: string[];
	files: Record<string, Record<string, unknown>>;
}

/** Written by e2e/video-fixtures.ts during global-setup. */
export function videoFixtures(): VideoManifest {
	return JSON.parse(readFileSync(join(GENERATED, 'video', 'video.manifest.json'), 'utf8'));
}

interface FixtureManifest {
	genHash: string;
	heicAvailable: boolean;
	/** False when the generator's node-side woff2 wasm failed — the .woff2 fixture is then absent. */
	fontWoff2Available: boolean;
	files: Record<string, Record<string, unknown>>;
}

/** Written by scripts/generate-fixtures.mjs (global-setup guarantees it). */
export const FIXTURES: FixtureManifest = JSON.parse(
	readFileSync(join(GENERATED, '.manifest.json'), 'utf8')
);

/** Expected properties recorded at generation time (dims, frames, points…). */
export function fxMeta<T = Record<string, unknown>>(name: string): T {
	const entry = FIXTURES.files[name];
	if (!entry) throw new Error(`fixture ${name} missing from .manifest.json`);
	return entry as T;
}

export type Expectation = 'assert' | 'document' | 'known-gap';

export interface CaseData {
	id: string;
	title?: string;
	expectation?: Expectation;
	settings?: Record<string, unknown>;
	input?: { name: string; bytes: number; [k: string]: unknown };
	output?: { name: string; bytes: number; [k: string]: unknown };
	metrics?: Record<string, number | string | boolean | null>;
	warnings?: string[];
	error?: string | null;
	note?: string;
	assets?: Record<string, string>;
}

export class CaseRecorder {
	private cases: CaseData[] = [];
	constructor(private testInfo: TestInfo) {}

	/** Copy/write a binary artifact for a case; returns the report-relative path. */
	saveAsset(
		caseId: string,
		kind: 'original' | 'output' | 'diff' | 'visual',
		filename: string,
		data: Buffer | string
	): string {
		const dir = join(ASSETS_DIR, caseId);
		mkdirSync(dir, { recursive: true });
		const rel = `assets/${caseId}/${kind}-${filename}`;
		const abs = join(dir, `${kind}-${filename}`);
		if (typeof data === 'string') copyFileSync(data, abs);
		else writeFileSync(abs, data);
		return rel;
	}

	record(data: CaseData): void {
		this.cases.push({ expectation: 'assert', ...data });
	}

	flush(): void {
		if (this.cases.length === 0) return;
		mkdirSync(MANIFEST_DIR, { recursive: true });
		const payload = {
			testId: this.testInfo.testId,
			title: this.testInfo.title,
			suite: this.testInfo.titlePath[0]?.replace(/\.spec\.ts$/, '') ?? 'unknown',
			status: this.testInfo.status ?? 'unknown',
			errorMessage: this.testInfo.error?.message?.split('\n')[0] ?? null,
			durationMs: this.testInfo.duration,
			cases: this.cases
		};
		writeFileSync(
			join(MANIFEST_DIR, `${this.testInfo.testId.replace(/[^a-z0-9-]/gi, '_')}.json`),
			JSON.stringify(payload, null, '\t')
		);
	}
}

export const test = base.extend<{ rec: CaseRecorder }>({
	// eslint-disable-next-line no-empty-pattern -- Playwright's fixture signature
	rec: async ({}, use, testInfo) => {
		const rec = new CaseRecorder(testInfo);
		await use(rec);
		rec.flush();
	}
});

export { expect };

/**
 * Diff-budget assertion that turns into a recorded observation under
 * E2E_CALIBRATE=1 (first full run collects real ratios, then budgets lock).
 */
export function assertDiffBudget(ratio: number, budget: number, label: string): void {
	if (CALIBRATE) {
		console.log(`[calibrate] ${label}: ratio=${ratio.toFixed(4)} budget=${budget}`);
		return;
	}
	expect(ratio, `${label} (pixel-diff ratio over budget)`).toBeLessThanOrEqual(budget);
}

/** Floor assertion (PSNR dB, tone amplitude…) — calibrate-aware like assertDiffBudget. */
export function assertFloor(value: number, floor: number, label: string): void {
	if (CALIBRATE) {
		console.log(`[calibrate] ${label}: value=${value.toFixed(4)} floor=${floor}`);
		return;
	}
	expect(value, `${label} (below floor)`).toBeGreaterThanOrEqual(floor);
}

/** Range assertion (RMS windows…) — calibrate-aware like assertDiffBudget. */
export function assertRange(
	value: number,
	[min, max]: readonly [number, number],
	label: string
): void {
	if (CALIBRATE) {
		console.log(`[calibrate] ${label}: value=${value.toFixed(4)} range=[${min}, ${max}]`);
		return;
	}
	expect(value, `${label} (below range)`).toBeGreaterThanOrEqual(min);
	expect(value, `${label} (above range)`).toBeLessThanOrEqual(max);
}
