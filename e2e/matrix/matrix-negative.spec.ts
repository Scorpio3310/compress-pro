/**
 * Real-file matrix — negative family. Every file the router rejects (walk.ts
 * realNegative) is window-dropped on `/` in ext-cluster batches and must be
 * HONESTLY refused: the unsupported banner within 10 s, naming the first file,
 * zero parked rows, no hang (the test timeout is the hang detector).
 *
 * Positives that live in negative material:
 * - .txt on the zip CREATE op (/zip-files publishes accept="") must park and
 *   round-trip byte-equal through the created archive.
 * - .aif force-uploaded on /compress-audio must yield a clean row-level error
 *   (RF-22 contract): names the file, no stack-trace leakage, no crash.
 * mobi/azw3 stay in the standard reject batches (the ebook family does NOT
 * accept them); .gltf is owned by the models spec and never appears here.
 *
 * Cell titles: `MX [negative] batch reject @<cluster>-<n>` — grep to re-run.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '../fixtures';
import { compress, downloadCombined, dropFiles, gotoPath, rows, upload } from '../helpers';
import { sevenZipEntries } from '../verify';
import { MatrixRecorder, timer } from './record';
import { realNegative, type RealFile } from './walk';

test.describe.configure({ timeout: 300_000 });

if (process.env.E2E_PREVIEW) throw new Error('matrix specs need the dev server (rasterizers)');

const rec = new MatrixRecorder('negative');

/** Ext → cluster: batches stay thematically coherent and the report groups
 *  cleanly. Anything unmapped lands in 'misc' (e.g. extension-less files). */
function clusterOf(ext: string): string {
	if (['cr3', 'pef', 'raw'].includes(ext)) return 'camera-raw';
	if (['xwd', 'hdr', 'pcd', 'ico'].includes(ext)) return 'exotic-image';
	if (['blend', 'obj', 'fbx', '3ds', 'mtl', 'usdz'].includes(ext)) return 'model-3d';
	if (['mobi', 'azw3'].includes(ext)) return 'ebook';
	if (['sbv', 'sub', 'stl'].includes(ext)) return 'subtitle-like';
	if (ext === 'txt') return 'text';
	if (ext === 'xml') return 'xml';
	if (ext === 'aif') return 'audio-aif';
	return 'misc';
}

/** ~8-10 files per drop, but also byte-capped: dropFiles ships base64 through
 *  one page.evaluate, and a 10 × 25 MB CR3 batch would blow the CDP message
 *  budget. Singletons over the cap are allowed (57 MB .blend). */
const MAX_BATCH_FILES = 8;
const MAX_BATCH_BYTES = 48_000_000;

function chunk(files: RealFile[]): RealFile[][] {
	const out: RealFile[][] = [];
	let cur: RealFile[] = [];
	let bytes = 0;
	for (const f of files) {
		if (cur.length > 0 && (cur.length >= MAX_BATCH_FILES || bytes + f.bytes > MAX_BATCH_BYTES)) {
			out.push(cur);
			cur = [];
			bytes = 0;
		}
		cur.push(f);
		bytes += f.bytes;
	}
	if (cur.length > 0) out.push(cur);
	return out;
}

const negatives = realNegative();
const clusters = new Map<string, RealFile[]>();
for (const f of negatives) {
	const c = clusterOf(f.ext);
	clusters.set(c, [...(clusters.get(c) ?? []), f]);
}

// --- standard reject batches: window-drop on '/', honest banner, no rows ----

for (const cluster of [...clusters.keys()].sort()) {
	const batches = chunk(clusters.get(cluster)!);
	for (const [i, batch] of batches.entries()) {
		test(`MX [negative] batch reject @${cluster}-${i + 1}`, async ({ page }) => {
			const elapsed = timer();
			let failure: string | null = null;
			try {
				await gotoPath(page, '/');
				// Blank MIME: picker/drop reality for exotica — forces the
				// extension fallback (routeFileToFormat → formatFromName).
				await dropFiles(
					page,
					batch.map((f) => ({ path: f.abs, mimeType: '' }))
				);
				const banner = page.getByTestId('error-banner');
				// dropFiles ferries base64 payloads through CDP — a 50 MB CR3 batch
				// needs transfer headroom before the banner can possibly appear.
				const batchBytes = batch.reduce((n, f) => n + f.bytes, 0);
				const bannerTimeout = Math.max(10_000, Math.min(60_000, Math.round(batchBytes / 2_000)));
				await expect(banner, 'honest unsupported banner (transfer-scaled)').toContainText(
					'Unsupported file type',
					{ timeout: bannerTimeout }
				);
				await expect(banner, 'banner names the first rejected file').toContainText(batch[0].name);
				await expect(rows(page), 'nothing may park on /').toHaveCount(0);
			} catch (error) {
				failure = String(error).slice(0, 500);
			}
			const durationMs = elapsed();
			for (const f of batch) {
				rec.cell({
					family: 'negative',
					file: f.rel,
					tool: '/',
					action: 'reject',
					level: 'drop',
					status: failure ? 'fail' : 'pass',
					inBytes: f.bytes,
					durationMs,
					notes: `cluster ${cluster}, batch of ${batch.length}; pass = honestly rejected`,
					error: failure
				});
			}
			if (failure) {
				throw new Error(
					`[${cluster}-${i + 1}] ${batch.map((f) => f.name).join(', ')} :: ${failure}`
				);
			}
		});
	}
}

// --- special: .txt is a first-class CREATE input on /zip-files --------------
// Unroutable on '/', but the zip create op publishes accept="" — the archive
// must contain the txt files byte-equal (verified with 7z-wasm, the app's own
// engine, from the outside).

const txts = [...(clusters.get('text') ?? [])].sort((a, b) => a.bytes - b.bytes).slice(0, 3);

test('MX [negative] batch zip-create @txt', async ({ page }) => {
	test.skip(txts.length < 3, 'needs 3+ real .txt files in tests/fixtures/real');
	const joined = txts.map((f) => f.rel).join('+');
	const inputs = txts.map((f) => ({ f, bytes: readFileSync(f.abs) }));
	const inBytes = inputs.reduce((a, b) => a + b.bytes.length, 0);
	const elapsed = timer();
	try {
		await gotoPath(page, '/zip-files');
		await upload(page, ...txts.map((f) => f.abs));
		await compress(page, { timeout: 120_000 });
		const art = await downloadCombined(page);
		const entries = await sevenZipEntries(art.bytes, art.name);
		for (const { f, bytes } of inputs) {
			const entry = entries[f.name];
			expect(entry, `${f.name} present in the created archive`).toBeTruthy();
			expect(Buffer.from(entry).equals(bytes), `${f.name} byte-equal after round-trip`).toBe(true);
		}
		rec.cell({
			family: 'negative',
			file: joined,
			tool: '/zip-files',
			action: 'zip-create',
			level: 'default',
			status: 'pass',
			inBytes,
			outBytes: art.bytes.length,
			metrics: { entries: Object.keys(entries).length },
			durationMs: elapsed(),
			notes: 'unroutable .txt parks on the create op (accept="") and round-trips byte-equal'
		});
	} catch (error) {
		rec.cell({
			family: 'negative',
			file: joined,
			tool: '/zip-files',
			action: 'zip-create',
			level: 'default',
			status: 'error',
			inBytes,
			durationMs: elapsed(),
			error: String(error).slice(0, 500)
		});
		throw error;
	}
});

// --- special: .aif force-uploaded on /compress-audio ------------------------
// aif is NOT in the audio accept list; upload() bypasses accept (picker
// reality: "All files"). Per RF-22 the run must fail with a clean row-level
// error naming the file — never a crash or a stack trace in the banner.

for (const f of clusters.get('audio-aif') ?? []) {
	test(`MX [negative] ${f.rel} :: compress-audio @reject`, async ({ page }) => {
		const elapsed = timer();
		try {
			await gotoPath(page, '/compress-audio');
			await upload(page, f.abs);
			const run = await compress(page, { expectError: true, timeout: 120_000 });
			expect(run.error, 'error banner names the file').toContain(f.name);
			expect(run.error, 'no stack-trace leakage in the banner').not.toMatch(/at .*\.ts/);
			rec.cell({
				family: 'negative',
				file: f.rel,
				tool: '/compress-audio',
				action: 'compress-audio',
				level: 'reject',
				status: 'pass',
				inBytes: f.bytes,
				metrics: { error: (run.error ?? '').slice(0, 200) },
				durationMs: elapsed(),
				notes: 'clean row-level rejection of an unsupported audio format (RF-22 contract)'
			});
		} catch (error) {
			rec.cell({
				family: 'negative',
				file: f.rel,
				tool: '/compress-audio',
				action: 'compress-audio',
				level: 'reject',
				status: 'fail',
				inBytes: f.bytes,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}
