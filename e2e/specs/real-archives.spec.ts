/**
 * RA-01…12: the archive suite against Nik's REAL archives and files from
 * tests/fixtures/real/ (self-skip when absent, like real-files.spec.ts).
 * Correctness stays hard-asserted (entries appear, round-trips byte-match);
 * compression ratios and wall-clock timings are RECORDED as metrics — the
 * first suite to measure elapsed time around compress() — so the visual
 * report doubles as a real-world benchmark sheet. Timing carries no hard
 * asserts (machine-dependent); pure comparisons use expectation:'document'.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Page } from '@playwright/test';
import { REAL, expect, realFile, test } from '../fixtures';
import {
	compress,
	downloadCombined,
	downloadRow,
	downloadRowAt,
	gotoTab,
	rows,
	upload,
	type RunResult
} from '../helpers';
import { gunzipBuf, sevenZipEntries, unzip } from '../verify';

test.describe.configure({ timeout: 240_000 });

// Named picks where the SIZE is the point; realFile() where any sample works.
const ZIP20 = join(REAL, 'sample-3.zip'); // 20 MB — fflate fast-path timing
const TAR65 = join(REAL, 'sample-3.tar'); // 65 MB — MEMFS scale proof
const ISO3 = join(REAL, '3mb.iso');
const ISO100 = join(REAL, '100mb.iso');
const WAV = join(REAL, 'file_example_WAV_5MG.wav'); // 5 MB PCM — compressible
const PDF = join(REAL, 'file-example_PDF_1MB.pdf');
const JPG = join(REAL, 'sample_5184×3456.jpg'); // 5.3 MB — incompressible
const TTF = join(REAL, 'sample-1.ttf');

async function setOp(page: Page, op: 'Create' | 'Extract' | 'Convert') {
	const btn = page.getByRole('button', { name: op, exact: true });
	await btn.click();
	await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

async function setArchiveFormat(page: Page, label: string) {
	await page.getByRole('button', { name: label, exact: true }).click();
}

/** compress() with wall-clock — CTA click through terminal signal + re-enable. */
async function timedCompress(
	page: Page,
	opts: { expectError?: boolean; timeout?: number } = {}
): Promise<{ run: RunResult; elapsedMs: number }> {
	const t0 = Date.now();
	const run = await compress(page, opts);
	return { run, elapsedMs: Date.now() - t0 };
}

const mb = (bytes: number) => Number((bytes / 1e6).toFixed(2));
const secs = (ms: number) => Number((ms / 1000).toFixed(2));
const mbPerSec = (bytes: number, ms: number) => Number((bytes / 1e6 / (ms / 1000)).toFixed(1));
const savingsPct = (inB: number, outB: number) => Number((((inB - outB) / inB) * 100).toFixed(1));

/** Shared extract-and-record body for the per-format timing tests. */
async function extractReal(
	page: Page,
	rec: import('../fixtures').CaseRecorder,
	id: string,
	src: string,
	opts: { timeout?: number; note?: string } = {}
) {
	const input = readFileSync(src);
	await gotoTab(page, 'zip');
	await setOp(page, 'Extract');
	await upload(page, src);
	const { elapsedMs } = await timedCompress(page, { timeout: opts.timeout ?? 180_000 });
	const entryCount = (await rows(page).count()) - 1; // minus the upload row
	expect(entryCount, 'at least one extracted entry').toBeGreaterThan(0);
	// Row 0 is the upload (no Download button in extract mode) — entries follow.
	const art = await downloadRowAt(page, 1);
	expect(art.bytes.length, 'first entry downloads non-empty').toBeGreaterThan(0);
	rec.record({
		id,
		settings: { tab: 'zip', op: 'extract', realWorld: true },
		input: { name: basename(src), bytes: input.length },
		metrics: {
			entries: entryCount,
			inMB: mb(input.length),
			elapsedSec: secs(elapsedMs),
			mbPerSec: mbPerSec(input.length, elapsedMs),
			coldStart: true // first archive op in this page pays the wasm boot
		},
		note: opts.note ?? 'Timing includes the one-time 7z engine boot (~1.65 MB wasm).'
	});
	return { input, entryCount, elapsedMs };
}

test('RA-01: real RAR extracts (v4-era archive)', async ({ page, rec }) => {
	const src = realFile(/\.rar$/i);
	test.skip(!src, 'drop a real .rar into tests/fixtures/real to enable');
	await extractReal(page, rec, 'RA-01', src!, {
		note: 'Real-world RAR v4 — a different generation than the vendored v5 corpus fixtures.'
	});
});

test('RA-02: real 7Z extracts', async ({ page, rec }) => {
	const src = realFile(/\.7z$/i);
	test.skip(!src, 'drop a real .7z into tests/fixtures/real to enable');
	await extractReal(page, rec, 'RA-02', src!);
});

test('RA-03: real 20 MB ZIP extracts through the fflate fast path', async ({ page, rec }) => {
	test.skip(!existsSync(ZIP20), 'sample-3.zip not present');
	await extractReal(page, rec, 'RA-03', ZIP20, {
		note: 'Unencrypted .zip takes the fflate fast path — no wasm involved; compare elapsed against RA-02.'
	});
});

test('RA-04: real 65 MB TAR extracts (MEMFS scale) @slow', async ({ page, rec }) => {
	test.skip(!existsSync(TAR65), 'sample-3.tar not present');
	test.setTimeout(480_000);
	await extractReal(page, rec, 'RA-04', TAR65, {
		timeout: 360_000,
		note: '65 MB input + extracted output live in wasm memory simultaneously — the scale this proves.'
	});
});

test('RA-05: real BZ2 and GZ streams decompress', async ({ page, rec }) => {
	// The biggest bz2 present (realFile's sort would pick a 12 KB one — too
	// small for a meaningful MB/s figure); any gz works.
	const big = join(REAL, 'sample-4.bz2');
	const bz2 = existsSync(big) ? big : realFile(/\.bz2$/i);
	const gz = realFile(/\.gz$/i);
	test.skip(!bz2 || !gz, 'drop a real .bz2 and .gz into tests/fixtures/real to enable');

	await extractReal(page, rec, 'RA-05a', bz2!);
	await gotoTab(page, 'zip');
	await setOp(page, 'Extract');
	await upload(page, gz!);
	const { elapsedMs } = await timedCompress(page);
	const entries = (await rows(page).count()) - 1;
	expect(entries).toBeGreaterThan(0);
	rec.record({
		id: 'RA-05b',
		settings: { tab: 'zip', op: 'extract', realWorld: true },
		input: { name: basename(gz!), bytes: readFileSync(gz!).length },
		metrics: { entries, elapsedSec: secs(elapsedMs), coldStart: false },
		note: 'Second op on the same page — engine already warm.'
	});
});

test('RA-06: real 3 MB ISO lists its files', async ({ page, rec }) => {
	test.skip(!existsSync(ISO3), '3mb.iso not present');
	await extractReal(page, rec, 'RA-06', ISO3);
});

test('RA-07: real 100 MB ISO extracts (memory ceiling probe) @slow', async ({ page, rec }) => {
	test.skip(!existsSync(ISO100), '100mb.iso not present');
	test.setTimeout(480_000);
	await extractReal(page, rec, 'RA-07', ISO100, {
		timeout: 360_000,
		note: '100 MB disc image — input, wasm heap and every extracted buffer coexist in one tab.'
	});
});

test('RA-08: convert a real RAR to ZIP, contents verified', async ({ page, rec }) => {
	const src = realFile(/\.rar$/i);
	test.skip(!src, 'drop a real .rar into tests/fixtures/real to enable');
	const input = readFileSync(src!);
	const outName = `${basename(src!).replace(/\.rar$/i, '')}.zip`;

	await gotoTab(page, 'zip');
	await setOp(page, 'Convert');
	await upload(page, src!);
	await setArchiveFormat(page, 'ZIP');
	const { elapsedMs } = await timedCompress(page, { timeout: 180_000 });
	const art = await downloadRow(page, outName);
	const entries = unzip(art.bytes);
	expect(Object.keys(entries).length, 'repacked ZIP holds entries').toBeGreaterThan(0);
	rec.record({
		id: 'RA-08',
		settings: { tab: 'zip', op: 'convert', outputFormat: 'zip', realWorld: true },
		input: { name: basename(src!), bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: {
			entries: Object.keys(entries).length,
			elapsedSec: secs(elapsedMs),
			// RAR (LZSS-family) vs ZIP deflate on the same content:
			sizeVsRarPct: Number(((art.bytes.length / input.length) * 100).toFixed(1))
		}
	});
});

// ---------------------------------------------------------------- benchmark

test('RA-10: create benchmark — ZIP vs 7Z (cold+warm) vs TAR.GZ vs TAR on real files @slow', async ({
	page,
	rec
}) => {
	for (const f of [WAV, PDF, JPG, TTF]) {
		test.skip(!existsSync(f), `${basename(f)} not present`);
	}
	test.setTimeout(600_000);
	const inputs = [WAV, PDF, JPG, TTF];
	const inBytes = inputs.reduce((sum, f) => sum + readFileSync(f).length, 0);
	const names = inputs.map((f) => basename(f)).sort();
	const wavBytes = readFileSync(WAV);

	await gotoTab(page, 'zip');
	await upload(page, ...inputs);

	/** One measured create run; files stay parked, results reset per run. */
	const measure = async (pill: string) => {
		await setArchiveFormat(page, pill);
		const { elapsedMs } = await timedCompress(page, { timeout: 240_000 });
		const art = await downloadCombined(page);
		return { art, elapsedMs };
	};

	// ZIP first — fflate, no wasm involved.
	const zip = await measure('ZIP');
	expect(Object.keys(unzip(zip.art.bytes)).sort()).toEqual(names);
	expect(zip.art.bytes.length, 'zip of a set containing PCM must shrink').toBeLessThan(inBytes);

	// 7Z twice: the first run pays the wasm download+compile (the honest
	// first-use number), the second shows steady-state speed.
	const sevenCold = await measure('7Z');
	const sevenWarm = await measure('7Z');
	const sevenEntries = await sevenZipEntries(sevenWarm.art.bytes, sevenWarm.art.name);
	expect(Object.keys(sevenEntries).sort()).toEqual(names);
	expect(
		Buffer.from(sevenEntries[basename(WAV)]).equals(wavBytes),
		'WAV survives the 7z round-trip byte-for-byte'
	).toBe(true);
	expect(sevenWarm.art.bytes.length).toBeLessThan(inBytes);

	const tgz = await measure('TAR.GZ');
	const tgzEntries = await sevenZipEntries(await gunzipBuf(tgz.art.bytes), 'archive.tar');
	expect(Object.keys(tgzEntries).sort()).toEqual(names);
	expect(tgz.art.bytes.length).toBeLessThan(inBytes);

	const tar = await measure('TAR');
	const tarEntries = await sevenZipEntries(tar.art.bytes, tar.art.name);
	expect(Object.keys(tarEntries).sort()).toEqual(names);
	expect(tar.art.bytes.length, 'tar adds headers, never compresses').toBeGreaterThan(inBytes);

	for (const [id, label, r] of [
		['RA-10a', 'ZIP (fflate, level 6)', zip],
		['RA-10b', '7Z cold (incl. wasm boot)', sevenCold],
		['RA-10c', '7Z warm (mx5, 16m dict)', sevenWarm],
		['RA-10d', 'TAR.GZ (two-pass)', tgz],
		['RA-10e', 'TAR (store)', tar]
	] as const) {
		rec.record({
			id,
			title: label,
			settings: { tab: 'zip', op: 'create', realWorld: true, set: 'wav+pdf+jpg+ttf' },
			input: { name: '4 real files', bytes: inBytes },
			output: { name: r.art.name, bytes: r.art.bytes.length },
			metrics: {
				savingsPct: savingsPct(inBytes, r.art.bytes.length),
				outMB: mb(r.art.bytes.length),
				elapsedSec: secs(r.elapsedMs),
				mbPerSec: mbPerSec(inBytes, r.elapsedMs)
			}
		});
	}
});

test('RA-11: gzip a real 5 MB WAV — ratio, speed, byte-perfect round-trip', async ({
	page,
	rec
}) => {
	test.skip(!existsSync(WAV), 'file_example_WAV_5MG.wav not present');
	const input = readFileSync(WAV);
	await gotoTab(page, 'zip');
	await upload(page, WAV);
	await setArchiveFormat(page, 'GZ');
	const { elapsedMs } = await timedCompress(page, { timeout: 180_000 });
	const art = await downloadRow(page, `${basename(WAV)}.gz`);
	expect(Buffer.from(await gunzipBuf(art.bytes)).equals(input), 'gunzip round-trip').toBe(true);
	rec.record({
		id: 'RA-11',
		settings: { tab: 'zip', op: 'create', outputFormat: 'gz', realWorld: true },
		input: { name: basename(WAV), bytes: input.length },
		output: { name: art.name, bytes: art.bytes.length },
		metrics: {
			savingsPct: savingsPct(input.length, art.bytes.length),
			elapsedSec: secs(elapsedMs),
			mbPerSec: mbPerSec(input.length, elapsedMs),
			coldStart: true
		}
	});
});

test('RA-12: 7Z Balanced vs Max on a real WAV — what Max actually buys @slow', async ({
	page,
	rec
}) => {
	test.skip(!existsSync(WAV), 'file_example_WAV_5MG.wav not present');
	test.setTimeout(480_000);
	const input = readFileSync(WAV);
	await gotoTab(page, 'zip');
	await upload(page, WAV);
	await setArchiveFormat(page, '7Z');

	// Warm the engine so the level comparison is apples-to-apples.
	await timedCompress(page, { timeout: 240_000 });

	await page.getByRole('button', { name: 'Balanced', exact: true }).click();
	const balanced = await timedCompress(page, { timeout: 240_000 });
	const balancedArt = await downloadCombined(page);

	await page.getByRole('button', { name: 'Max', exact: true }).click();
	const max = await timedCompress(page, { timeout: 240_000 });
	const maxArt = await downloadCombined(page);

	// No Max<=Balanced assert: LZMA2 levels are heuristics, not a monotonic
	// guarantee — on this real PCM the first run measured Max 288 bytes LARGER
	// than Balanced. That surprise is the documented finding, not a failure.
	expect(balancedArt.bytes.length, 'PCM compresses substantially').toBeLessThan(input.length);
	expect(maxArt.bytes.length).toBeLessThan(input.length);
	rec.record({
		id: 'RA-12',
		title: '7Z level sweep on real PCM audio',
		expectation: 'document',
		settings: { tab: 'zip', op: 'create', outputFormat: '7z', realWorld: true },
		input: { name: basename(WAV), bytes: input.length },
		output: { name: maxArt.name, bytes: maxArt.bytes.length },
		metrics: {
			balancedSavingsPct: savingsPct(input.length, balancedArt.bytes.length),
			maxSavingsPct: savingsPct(input.length, maxArt.bytes.length),
			balancedSec: secs(balanced.elapsedMs),
			maxSec: secs(max.elapsedMs),
			maxVsBalancedPct: savingsPct(balancedArt.bytes.length, maxArt.bytes.length)
		},
		note: 'Documented comparison, no hard size/time asserts — on real PCM, Max can land marginally LARGER than Balanced (LZMA2 levels are heuristics).'
	});
});
