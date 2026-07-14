/**
 * MEM-01…06: peak-memory bench for the heavy codec paths (gs PDF, video,
 * AVIF batch, 7z) across chromium/firefox/webkit — run via `pnpm bench:memory`
 * (playwright.bench.config.ts; never part of normal e2e runs).
 *
 * Every number is RECORDED (`expectation: 'document'`), never asserted —
 * machine-dependent, like the wall-clock timings in real-archives.spec.ts.
 * Peaks come from RssSampler (250 ms `ps` over the browser's process tree);
 * on chromium, measureUserAgentSpecificMemory() adds a retained-memory
 * breakdown after each run. scripts/memory-report.mjs turns the manifests
 * into docs/memory-bench.md.
 *
 * Inputs prefer the biggest real sample from tests/fixtures/real, falling
 * back to the E2E_BENCH-generated large fixtures (~20 MB PDF, 45 s WebM).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Page } from '@playwright/test';
import { REAL, expect, fx, fxVideo, test, type CaseRecorder } from '../fixtures';
import {
	compress,
	cancelRun,
	gotoTab,
	rows,
	setContainer,
	setOutputFormat,
	setPdfLevel,
	upload,
	type RunResult
} from '../helpers';
import { RssSampler, measureUasm, type RssSnapshot, type UasmReading } from './rss-sampler';

test.skip(process.platform !== 'darwin', 'the ps-based RSS sampler is darwin-only');

const RSS_NOTE =
	'Peak = max RSS sampled every 250 ms over the browser process tree (sum / largest single ' +
	'process); deltas over the post-upload baseline. macOS compression undercounts, the tree ' +
	'sum double-counts shared pages, sub-250ms spikes can be missed — trend metric, not a budget. ' +
	'WebKit attributes SharedArrayBuffer wasm memory and VideoToolbox codec memory to shared/XPC ' +
	'regions RSS barely sees — its MT-image and video peaks are a floor.';

const mb1 = (n: number) => Number(n.toFixed(1));
const secs = (ms: number) => Number((ms / 1000).toFixed(1));

/**
 * Biggest available input: real files matching `re` compete with the listed
 * generated fallbacks; largest on disk wins. Returns null when nothing exists
 * (caller test.skips) — mirrors the realFile() presence-gating convention.
 */
function biggestInput(re: RegExp, generated: string[]): string | null {
	const candidates: string[] = [];
	try {
		for (const f of readdirSync(REAL)) if (re.test(f)) candidates.push(join(REAL, f));
	} catch {
		/* no real dir */
	}
	for (const g of generated) if (existsSync(g)) candidates.push(g);
	if (candidates.length === 0) return null;
	return candidates.reduce((a, b) => (statSync(a).size >= statSync(b).size ? a : b));
}

/** compress() with wall-clock (real-archives precedent). */
async function timedCompress(
	page: Page,
	opts: { expectError?: boolean; timeout?: number } = {}
): Promise<{ run: RunResult; elapsedMs: number }> {
	const t0 = Date.now();
	const run = await compress(page, opts);
	return { run, elapsedMs: Date.now() - t0 };
}

/**
 * XB-03-style tolerant run for the video scenarios: an error banner means the
 * engine lacks the codec path — a recorded data point, not a failure. A hang
 * (neither signal) still rejects and fails the test.
 */
async function runTolerant(
	page: Page,
	timeoutMs: number
): Promise<{ status: 'ok' | 'unsupported'; error: string | null; elapsedMs: number }> {
	const cta = page.getByTestId('compress-cta');
	await expect(cta).toBeEnabled();
	const t0 = Date.now();
	await cta.click();
	const banner = page.getByTestId('error-banner');
	const download = rows(page).getByRole('button', { name: 'Download' }).first();
	const outcome = await Promise.race([
		banner.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'banner' as const),
		download.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => 'download' as const)
	]);
	await expect(cta).toBeEnabled({ timeout: timeoutMs });
	const elapsedMs = Date.now() - t0;
	if (outcome === 'banner') {
		return {
			status: 'unsupported',
			error: ((await banner.textContent()) ?? '').trim(),
			elapsedMs
		};
	}
	return { status: 'ok', error: null, elapsedMs };
}

/** upload() with headroom for pushing ~100 MB through the driver protocol. */
async function uploadBig(page: Page, path: string): Promise<void> {
	const before = await rows(page).count();
	await page.locator('input[type=file]').setInputFiles(path);
	await expect(rows(page)).toHaveCount(before + 1, { timeout: 60_000 });
}

/** Stop peak tracking, give GC/terminated workers time, read the settled value. */
async function settled(page: Page, sampler: RssSampler, ms = 8_000): Promise<RssSnapshot> {
	sampler.stop();
	await page.waitForTimeout(ms);
	return sampler.sample();
}

function uasmMetrics(prefix: string, u: UasmReading | null) {
	return u ? { [`${prefix}Mb`]: u.totalMb, [`${prefix}WorkerMb`]: u.workerMb } : {};
}

function recordCase(
	rec: CaseRecorder,
	data: {
		id: string;
		title: string;
		browser: string;
		src: string;
		settings?: Record<string, unknown>;
		metrics: Record<string, number | string | boolean | null>;
		extraNote?: string;
	}
): void {
	rec.record({
		id: data.id,
		title: data.title,
		expectation: 'document',
		settings: { browser: data.browser, file: basename(data.src), ...data.settings },
		input: { name: basename(data.src), bytes: readFileSync(data.src).length },
		metrics: data.metrics,
		note: data.extraNote ? `${data.extraNote} ${RSS_NOTE}` : RSS_NOTE
	});
}

// nasa-* is the demo-assets source (28 MB), not a bench input — without the
// exclusion it would displace image-heavy-large.pdf and shift the baselines.
const benchPdf = () =>
	biggestInput(/^(?!nasa-).*\.pdf$/i, [fx('image-heavy-large.pdf'), fx('image-heavy.pdf')]);

test('MEM-01: gs PDF High ×2 back-to-back — peak, leak signal, settle', async ({
	page,
	rec,
	browserName
}) => {
	test.setTimeout(720_000);
	const src = benchPdf();
	test.skip(!src, 'no PDF fixture available');
	const sampler = new RssSampler();

	await gotoTab(page, 'pdf');
	await upload(page, src!);
	await setPdfLevel(page, 'High');

	const baseline = await sampler.sample();
	sampler.start();

	const { elapsedMs: run1Ms } = await timedCompress(page, { timeout: 300_000 });
	const run1 = sampler.peaks();
	const uasm1 = browserName === 'chromium' ? await measureUasm(page) : null;

	// Files persist after a run and handleCompress() clears stale results
	// synchronously, so run 2 is just another CTA click. The gs worker pool
	// survives between runs — run 2 measures warm-worker residue (the leak
	// signal), not a cold start.
	sampler.resetPeaks();
	const { elapsedMs: run2Ms } = await timedCompress(page, { timeout: 300_000 });
	const run2 = sampler.peaks();
	const uasm2 = browserName === 'chromium' ? await measureUasm(page) : null;

	const after = await settled(page, sampler);

	recordCase(rec, {
		id: 'MEM-01',
		title: 'gs PDF High ×2 — peak RSS + leak signal',
		browser: browserName,
		src: src!,
		settings: { tab: 'pdf', level: 'High' },
		metrics: {
			baselineMb: mb1(baseline.treeMb),
			peakTreeMb: mb1(run1.treeMb),
			peakProcMb: mb1(run1.maxProcMb),
			deltaMb: mb1(run1.treeMb - baseline.treeMb),
			run2PeakTreeMb: mb1(run2.treeMb),
			run2DeltaMb: mb1(run2.treeMb - baseline.treeMb),
			leakSignalMb: mb1(run2.treeMb - run1.treeMb),
			settledDeltaMb: mb1(after.treeMb - baseline.treeMb),
			run1Sec: secs(run1Ms),
			run2Sec: secs(run2Ms),
			...uasmMetrics('uasmRun1', uasm1),
			...uasmMetrics('uasmRun2', uasm2)
		},
		extraNote:
			'settledDelta includes the retained result blobs (what a user tab holds) — not a leak.' +
			(uasm2 ? ` UASM realms after run2: ${uasm2.top}.` : '')
	});
});

test('MEM-02: video WebM→WebM — peak + settle (engine-tolerant)', async ({
	page,
	rec,
	browserName
}) => {
	test.setTimeout(600_000);
	const src = biggestInput(/\.webm$/i, [fxVideo('v-720p-45s.webm'), fxVideo('v-320x240-3s.webm')]);
	test.skip(!src, 'no WebM fixture available');
	const sampler = new RssSampler();

	await gotoTab(page, 'video');
	await upload(page, src!);
	await setContainer(page, 'webm');

	const baseline = await sampler.sample();
	sampler.start();
	const run = await runTolerant(page, 480_000);
	const peak = sampler.peaks();
	const uasm = browserName === 'chromium' ? await measureUasm(page) : null;
	const after = await settled(page, sampler);

	recordCase(rec, {
		id: 'MEM-02',
		title: 'video WebM→WebM — peak RSS',
		browser: browserName,
		src: src!,
		settings: { tab: 'video', container: 'webm' },
		metrics:
			run.status === 'ok'
				? {
						baselineMb: mb1(baseline.treeMb),
						peakTreeMb: mb1(peak.treeMb),
						peakProcMb: mb1(peak.maxProcMb),
						deltaMb: mb1(peak.treeMb - baseline.treeMb),
						settledDeltaMb: mb1(after.treeMb - baseline.treeMb),
						run1Sec: secs(run.elapsedMs),
						...uasmMetrics('uasmRun1', uasm)
					}
				: { supported: false },
		extraNote:
			run.status === 'unsupported'
				? `Engine lacks the decode/encode path (${run.error}) — memory not measured.`
				: undefined
	});
});

test('MEM-03: video MP4(H.264)→MP4 — peak + settle', async ({ page, rec, browserName }) => {
	test.skip(
		browserName !== 'chromium',
		'Playwright firefox/webkit builds ship no H.264 — WebM path covers them (MEM-02)'
	);
	test.setTimeout(600_000);
	// magnific-* is the demo-assets source, not a bench input — without the
	// exclusion it could displace the fixture this baseline was recorded on.
	const src = biggestInput(/^(?!magnific-).*\.mp4$/i, [fxVideo('v-720p-10s.mp4')]);
	test.skip(!src, 'no MP4 fixture available');
	const sampler = new RssSampler();

	await gotoTab(page, 'video');
	await upload(page, src!);
	await setContainer(page, 'mp4');

	const baseline = await sampler.sample();
	sampler.start();
	const run = await runTolerant(page, 480_000);
	const peak = sampler.peaks();
	const uasm = await measureUasm(page);
	const after = await settled(page, sampler);

	recordCase(rec, {
		id: 'MEM-03',
		title: 'video MP4→MP4 — peak RSS',
		browser: browserName,
		src: src!,
		settings: { tab: 'video', container: 'mp4' },
		metrics:
			run.status === 'ok'
				? {
						baselineMb: mb1(baseline.treeMb),
						peakTreeMb: mb1(peak.treeMb),
						peakProcMb: mb1(peak.maxProcMb),
						deltaMb: mb1(peak.treeMb - baseline.treeMb),
						settledDeltaMb: mb1(after.treeMb - baseline.treeMb),
						run1Sec: secs(run.elapsedMs),
						...uasmMetrics('uasmRun1', uasm)
					}
				: { supported: false },
		extraNote:
			run.status === 'unsupported'
				? `Engine lacks the decode/encode path (${run.error}) — memory not measured.`
				: undefined
	});
});

test('MEM-04: 3×12 MP JPG→AVIF batch (threaded wasm) — peak + settle', async ({
	page,
	rec,
	browserName
}) => {
	test.setTimeout(600_000);
	const src = fx('photo-4000x3000.jpg');
	const sampler = new RssSampler();

	await gotoTab(page, 'jpg');
	await upload(page, src, src, src);
	await setOutputFormat(page, 'AVIF');
	// SAB gates the multithreaded AVIF encoder — record it so single-thread
	// fallback numbers aren't compared against MT ones.
	const coi = await page.evaluate(() => crossOriginIsolated);

	const baseline = await sampler.sample();
	sampler.start();
	const { elapsedMs } = await timedCompress(page, { timeout: 480_000 });
	const peak = sampler.peaks();
	const uasm = browserName === 'chromium' ? await measureUasm(page) : null;
	const after = await settled(page, sampler);

	recordCase(rec, {
		id: 'MEM-04',
		title: '3×12 MP AVIF batch — peak RSS',
		browser: browserName,
		src,
		settings: { tab: 'jpg', output: 'avif', files: 3, crossOriginIsolated: coi },
		metrics: {
			baselineMb: mb1(baseline.treeMb),
			peakTreeMb: mb1(peak.treeMb),
			peakProcMb: mb1(peak.maxProcMb),
			deltaMb: mb1(peak.treeMb - baseline.treeMb),
			settledDeltaMb: mb1(after.treeMb - baseline.treeMb),
			run1Sec: secs(elapsedMs),
			...uasmMetrics('uasmRun1', uasm)
		},
		// UASM attributes the ONE SharedArrayBuffer-backed wasm memory to every
		// attached pthread realm, so the MT encoder reports many GB "retained" —
		// the realm list makes the multiple counting visible.
		extraNote: uasm ? `UASM realms (shared wasm counted per realm): ${uasm.top}.` : undefined
	});
});

test('MEM-05: 100 MB ISO→7z (largest MEMFS allocation) — peak + settle', async ({
	page,
	rec,
	browserName
}) => {
	test.setTimeout(720_000);
	const src = join(REAL, '100mb.iso');
	test.skip(!existsSync(src), 'drop 100mb.iso into tests/fixtures/real to enable');
	const sampler = new RssSampler();

	await gotoTab(page, 'zip');
	const createBtn = page.getByRole('button', { name: 'Create', exact: true });
	await createBtn.click();
	await expect(createBtn).toHaveAttribute('aria-pressed', 'true');
	await uploadBig(page, src);
	await page.getByRole('button', { name: '7Z', exact: true }).click();

	const baseline = await sampler.sample();
	sampler.start();
	const { elapsedMs } = await timedCompress(page, { timeout: 600_000 });
	const peak = sampler.peaks();
	const uasm = browserName === 'chromium' ? await measureUasm(page) : null;
	const after = await settled(page, sampler);

	recordCase(rec, {
		id: 'MEM-05',
		title: '100 MB ISO→7z — peak RSS',
		browser: browserName,
		src,
		settings: { tab: 'zip', op: 'create', format: '7z' },
		metrics: {
			baselineMb: mb1(baseline.treeMb),
			peakTreeMb: mb1(peak.treeMb),
			peakProcMb: mb1(peak.maxProcMb),
			deltaMb: mb1(peak.treeMb - baseline.treeMb),
			settledDeltaMb: mb1(after.treeMb - baseline.treeMb),
			run1Sec: secs(elapsedMs),
			...uasmMetrics('uasmRun1', uasm)
		}
	});
});

test('MEM-06: gs PDF cancel mid-run — memory returns after worker terminate', async ({
	page,
	rec,
	browserName
}) => {
	test.setTimeout(360_000);
	const src = benchPdf();
	test.skip(!src, 'no PDF fixture available');
	const sampler = new RssSampler();

	await gotoTab(page, 'pdf');
	await upload(page, src!);
	await setPdfLevel(page, 'High');

	const baseline = await sampler.sample();
	sampler.start();

	const cta = page.getByTestId('compress-cta');
	await expect(cta).toBeEnabled();
	await cta.click();
	await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor({ state: 'visible' });
	// Let the gs wasm boot and chew a few pages so the cancel hits a hot worker.
	await page.waitForTimeout(5_000);
	const atCancel = await sampler.sample();

	// B-02 pattern: a run that finished before the click is a legitimate
	// (recorded) outcome, not a failure.
	let cancelLanded = true;
	try {
		await cancelRun(page);
	} catch {
		cancelLanded = false;
	}
	await expect(cta).toBeEnabled({ timeout: 60_000 });

	const peak = sampler.peaks();
	const after = await settled(page, sampler, 10_000);

	recordCase(rec, {
		id: 'MEM-06',
		title: 'gs cancel mid-run — settle after abortAll terminate',
		browser: browserName,
		src: src!,
		settings: { tab: 'pdf', level: 'High' },
		metrics: {
			baselineMb: mb1(baseline.treeMb),
			atCancelMb: mb1(atCancel.treeMb),
			atCancelDeltaMb: mb1(atCancel.treeMb - baseline.treeMb),
			peakTreeMb: mb1(peak.treeMb),
			peakProcMb: mb1(peak.maxProcMb),
			settledDeltaMb: mb1(after.treeMb - baseline.treeMb),
			cancelLanded
		},
		extraNote:
			'Cancel on the pdf tab owner-scope-terminates the gs worker (CANCEL_KINDS.pdf); ' +
			'settledDelta near zero means the terminate actually returned the wasm heap.'
	});
});
