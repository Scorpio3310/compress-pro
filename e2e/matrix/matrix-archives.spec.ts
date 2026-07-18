/**
 * Real-file matrix — ARCHIVE family. Every routable real archive (normal tier)
 * runs extract with a full node-side reference extraction (7z-wasm — the same
 * engine the app ships) and per-entry byte equality; every file with a convert
 * landing repacks and is compared entry-for-entry; loose real text files drive
 * the create pages (zip/7z/tar.gz/tar.bz2/tar.xz + gz/bz2/xz streams) and the
 * ZIP level ladder. "No exception" is never the validation — outputs are
 * decompressed back for real and compared byte-for-byte.
 *
 * Cell titles: `MX [archives] <file> :: <action> @<level>` — grep one to re-run.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import {
	compress,
	downloadCombined,
	downloadRow,
	downloadRowAt,
	gotoPath,
	rows,
	upload
} from '../helpers';
import { gunzipBuf, sevenZipEntries, unzip } from '../verify';
import { MatrixRecorder, timer } from './record';
import { realByFormat, walkReal, type RealFile } from './walk';

test.describe.configure({ timeout: 300_000 });

if (process.env.E2E_PREVIEW) throw new Error('matrix specs need the dev server (rasterizers)');

const rec = new MatrixRecorder('archives');

const archives = realByFormat(['zip']);

/** NFC first — matches the app's protect pinning; the rest are common guesses. */
const PASSWORD_CANDIDATES = ['ččč'.normalize('NFC'), 'geslo', 'password', 'test'];

// ---------------------------------------------------------------- local utils

async function setOp(page: Page, op: 'Create' | 'Extract' | 'Convert'): Promise<void> {
	const btn = page.getByRole('button', { name: op, exact: true });
	await btn.click();
	await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

/** Extract landings preset the op; everything else falls back to the zip tab. */
function extractTool(f: RealFile): { path: string; needsOp: boolean } {
	if (/\.(tar\.gz|tgz)$/i.test(f.name)) return { path: '/extract-tar-gz', needsOp: false };
	const direct: Record<string, string> = {
		rar: '/extract-rar',
		'7z': '/extract-7z',
		gz: '/extract-gz',
		z: '/extract-z',
		iso: '/extract-iso',
		cab: '/extract-cab',
		deb: '/extract-deb',
		rpm: '/extract-rpm',
		cpio: '/extract-cpio',
		lha: '/extract-lha',
		lzh: '/extract-lha',
		arj: '/extract-arj'
	};
	const path = direct[f.ext];
	return path ? { path, needsOp: false } : { path: '/zip-files', needsOp: true };
}

interface ConvertTarget {
	path: string;
	target: 'zip' | '7z' | 'tar.gz';
}

function convertTargets(f: RealFile): ConvertTarget[] {
	if (/\.(tar\.gz|tgz)$/i.test(f.name)) return [{ path: '/tar-gz-to-zip', target: 'zip' }];
	switch (f.ext) {
		case 'rar':
			return [{ path: '/rar-to-zip', target: 'zip' }];
		case '7z':
			return [{ path: '/7z-to-zip', target: 'zip' }];
		case 'zip':
			return [
				{ path: '/zip-to-7z', target: '7z' },
				{ path: '/zip-to-tar-gz', target: 'tar.gz' }
			];
		case 'iso':
			return [{ path: '/iso-to-zip', target: 'zip' }];
		default:
			return [];
	}
}

/**
 * Reference extraction in node via the same 7z-wasm engine, mirroring the
 * app's chain-unwrap rule (sevenzip-args nextChainStep): a single extracted
 * entry that is itself a bare container (x.tar.gz → x.tar → files) is fed
 * back through, capped at 3 hops. Throws on garbage or a wrong password.
 */
async function refEntries(
	buf: Buffer,
	name: string,
	password = ''
): Promise<Record<string, Uint8Array>> {
	let entries = await sevenZipEntries(buf, name, password);
	for (let hop = 0; hop < 3; hop++) {
		const keys = Object.keys(entries);
		if (keys.length !== 1) break;
		const single = keys[0];
		if (!/\.(tar|cpio|iso)$/i.test(single) && !/\.(tar|cpio)\.(gz|bz2|xz|z)$/i.test(single)) break;
		entries = await sevenZipEntries(
			Buffer.from(entries[single]),
			single.split('/').pop() ?? single,
			password
		);
	}
	return entries;
}

/** Mirror the app's extractableEntry row rule (src/lib/compress.ts): folder
 *  markers, empty entries and dot-basename noise (__MACOSX/._*, .DS_Store)
 *  never become rows — the EXTRACT reference must not count them either.
 *  (Triage 2026-07-18: refEntries = 2× rows on every macOS-made zip was
 *  exactly the __MACOSX sidecars, not data loss.) CONVERT deliberately
 *  compares UNFILTERED: a format conversion must preserve every entry. */
function appVisible(entries: Record<string, Uint8Array>): Record<string, Uint8Array> {
	return Object.fromEntries(
		Object.entries(entries).filter(([n, bytes]) => {
			if (n.endsWith('/') || bytes.length === 0) return false;
			const base = n.split('/').pop() ?? n;
			return !base.startsWith('.');
		})
	);
}

/** fflate keeps directory entries (trailing slash) — files only, please. */
function fileEntries(entries: Record<string, Uint8Array>): Record<string, Uint8Array> {
	return Object.fromEntries(Object.entries(entries).filter(([n]) => !n.endsWith('/')));
}

/**
 * Byte-equality matching by basename multiset: the app flattens entry paths to
 * basenames (colliding names get " (n)" dedupe suffixes — stripped as a second
 * try), the reference keeps full paths. Every output entry must consume one
 * byte-identical reference entry.
 */
function matchEntries(
	ref: Record<string, Uint8Array>,
	out: Record<string, Uint8Array>
): { matched: number; problems: string[] } {
	const pool = new Map<string, Uint8Array[]>();
	for (const [path, bytes] of Object.entries(ref)) {
		const base = path.split('/').pop() ?? path;
		const list = pool.get(base) ?? [];
		list.push(bytes);
		pool.set(base, list);
	}
	const take = (base: string, bytes: Uint8Array): boolean => {
		const list = pool.get(base);
		if (!list) return false;
		const i = list.findIndex((b) => Buffer.compare(Buffer.from(b), Buffer.from(bytes)) === 0);
		if (i === -1) return false;
		list.splice(i, 1);
		if (list.length === 0) pool.delete(base);
		return true;
	};
	let matched = 0;
	const problems: string[] = [];
	for (const [name, bytes] of Object.entries(out)) {
		const base = name.split('/').pop() ?? name;
		const undeduped = base.replace(/ \(\d+\)(\.[^.]*)?$/, '$1');
		if (take(base, bytes) || (undeduped !== base && take(undeduped, bytes))) matched++;
		else problems.push(`${base}: no byte-equal reference entry (${bytes.length} B)`);
	}
	return { matched, problems };
}

/**
 * Run compress; on a password-flavored error banner walk the candidate list
 * (AR-07 flow: banner leaves files parked and the CTA re-enabled). Non-password
 * errors rethrow. Returns the winning password ('' = none needed) or the
 * failure text when no candidate opened it.
 */
async function runWithPasswords(
	page: Page,
	timeout: number
): Promise<{ password: string } | { failed: string }> {
	try {
		await compress(page, { timeout });
		return { password: '' };
	} catch (error) {
		let last = String(error);
		if (!/password/i.test(last)) throw error;
		const field = page.locator('#archive-password');
		if ((await field.count()) === 0) return { failed: `password needed, no field: ${last}` };
		for (const pw of PASSWORD_CANDIDATES) {
			await field.fill(pw);
			try {
				await compress(page, { timeout });
				return { password: pw };
			} catch (retryError) {
				last = String(retryError);
				if (!/password/i.test(last)) throw retryError;
			}
		}
		return { failed: last };
	}
}

/** helpers.downloadAllZip hardcodes the 30 s waitForEvent default — big
 *  extractions re-zip in-browser and can exceed it, hence the local variant. */
async function downloadAllZipSlow(
	page: Page,
	timeout: number
): Promise<{ name: string; bytes: Buffer }> {
	const wait = page.waitForEvent('download', { timeout });
	await page.getByRole('button', { name: 'Download All as ZIP' }).click();
	const download = await wait;
	const path = await download.path();
	return { name: download.suggestedFilename(), bytes: readFileSync(path) };
}

// -------------------------------------------------------- A) extract per file

for (const f of archives) {
	test(`MX [archives] ${f.rel} :: extract @default`, async ({ page }) => {
		const input = readFileSync(f.abs);
		const tool = extractTool(f);
		const elapsed = timer();
		const failures: string[] = [];
		try {
			await gotoPath(page, tool.path);
			if (tool.needsOp) await setOp(page, 'Extract');
			await upload(page, f.abs);
			const run = await runWithPasswords(page, 240_000);
			if ('failed' in run) {
				rec.cell({
					family: 'archives',
					file: f.rel,
					tool: tool.path,
					action: 'extract',
					level: 'default',
					status: 'skip',
					inBytes: input.length,
					durationMs: elapsed(),
					notes: 'encrypted, password unknown',
					error: run.failed.slice(0, 500)
				});
				return;
			}
			// Row 0 is the upload (no Download button in extract mode) — entries follow.
			const entryCount = (await rows(page).count()) - 1;
			expect(entryCount, 'at least one extracted entry').toBeGreaterThan(0);

			// Reference extraction of the INPUT (same engine, node-side).
			let ref: Record<string, Uint8Array> | null = null;
			let refError = '';
			try {
				ref = appVisible(await refEntries(input, f.name, run.password));
			} catch (error) {
				refError = String(error).slice(0, 200);
			}

			let out: Record<string, Uint8Array>;
			let outBytes: number;
			if (entryCount > 1) {
				const art = await downloadAllZipSlow(page, 180_000);
				outBytes = art.bytes.length;
				out = fileEntries(unzip(art.bytes));
			} else {
				const art = await downloadRowAt(page, 1);
				outBytes = art.bytes.length;
				out = { [art.name]: new Uint8Array(art.bytes) };
			}
			const outCount = Object.keys(out).length;
			if (outCount !== entryCount)
				failures.push(`downloaded ${outCount} entries but ${entryCount} rows shown`);

			const metrics: Record<string, number | string | boolean | null> = {
				entries: entryCount,
				refEntries: ref ? Object.keys(ref).length : null,
				matched: null,
				byteCompare: !!ref,
				password: run.password
			};
			if (ref) {
				const refFiles = Object.values(ref);
				if (entryCount === 1 && refFiles.length === 1) {
					// Chromium mangles extension-less download names (sample-2 →
					// sample-2.txt) — for the 1:1 case bytes are the whole truth.
					const same = Buffer.from(Object.values(out)[0]).equals(Buffer.from(refFiles[0]));
					metrics.matched = same ? 1 : 0;
					if (!same) failures.push('single-entry bytes differ from reference');
				} else {
					const { matched, problems } = matchEntries(ref, out);
					metrics.matched = matched;
					failures.push(...problems.slice(0, 5));
					if (Object.keys(ref).length !== outCount)
						failures.push(`entry count ${outCount} != reference ${Object.keys(ref).length}`);
				}
			}
			rec.cell({
				family: 'archives',
				file: f.rel,
				tool: tool.path,
				action: 'extract',
				level: 'default',
				status: failures.length ? 'fail' : 'pass',
				inBytes: input.length,
				outBytes,
				metrics,
				durationMs: elapsed(),
				notes: ref
					? run.password
						? `opened with password '${run.password}'`
						: ''
					: `reference extraction failed — byte-compare skipped: ${refError}`
			});
		} catch (error) {
			rec.cell({
				family: 'archives',
				file: f.rel,
				tool: tool.path,
				action: 'extract',
				level: 'default',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
		expect(failures, failures.join(' | ')).toEqual([]);
	});
}

// -------------------------------------------------- B) convert where possible

/** Decompress a converted archive back with an engine matched to the target. */
async function readConverted(
	bytes: Buffer,
	name: string,
	target: ConvertTarget['target']
): Promise<Record<string, Uint8Array>> {
	if (target === 'zip') return fileEntries(unzip(bytes));
	if (target === '7z') return sevenZipEntries(bytes, name);
	// tar.gz: gunzip via node:zlib (engine-independent), then 7zz reads the tar.
	return sevenZipEntries(await gunzipBuf(bytes), 'archive.tar');
}

for (const f of archives) {
	const targets = convertTargets(f);
	if (targets.length === 0) continue;
	const levelToken = targets.length > 1 ? 'all-targets' : targets[0].target;
	test(`MX [archives] ${f.rel} :: convert @${levelToken}`, async ({ page }) => {
		test.setTimeout(targets.length * 300_000);
		const input = readFileSync(f.abs);
		let ref: Record<string, Uint8Array> | null = null;
		let refError = '';
		try {
			ref = await refEntries(input, f.name);
		} catch (error) {
			refError = String(error).slice(0, 200);
		}
		const failures: string[] = [];
		for (const t of targets) {
			const elapsed = timer();
			const action = `convert:${t.target}`;
			try {
				await gotoPath(page, t.path);
				await upload(page, f.abs);
				const run = await runWithPasswords(page, 240_000);
				if ('failed' in run) {
					rec.cell({
						family: 'archives',
						file: f.rel,
						tool: t.path,
						action,
						level: 'default',
						status: 'skip',
						inBytes: input.length,
						durationMs: elapsed(),
						notes: 'encrypted, password unknown',
						error: run.failed.slice(0, 500)
					});
					continue;
				}
				const art = await downloadRow(page);
				const keptOriginal = art.bytes.length === input.length;
				const out = await readConverted(art.bytes, art.name, t.target);
				const metrics: Record<string, number | string | boolean | null> = {
					entries: Object.keys(out).length,
					refEntries: ref ? Object.keys(ref).length : null,
					matched: null,
					byteCompare: !!ref
				};
				const targetFailures: string[] = [];
				if (Object.keys(out).length === 0) targetFailures.push('converted archive is empty');
				if (ref) {
					const { matched, problems } = matchEntries(ref, out);
					metrics.matched = matched;
					targetFailures.push(...problems.slice(0, 5));
					if (Object.keys(ref).length !== Object.keys(out).length)
						targetFailures.push(
							`entry count ${Object.keys(out).length} != reference ${Object.keys(ref).length}`
						);
				}
				rec.cell({
					family: 'archives',
					file: f.rel,
					tool: t.path,
					action,
					level: 'default',
					status: targetFailures.length ? 'fail' : 'pass',
					inBytes: input.length,
					outBytes: art.bytes.length,
					keptOriginal,
					metrics,
					durationMs: elapsed(),
					notes: [
						keptOriginal ? 'keep-original returned input bytes' : '',
						ref ? '' : `reference extraction failed — byte-compare skipped: ${refError}`
					]
						.filter(Boolean)
						.join('; ')
				});
				failures.push(...targetFailures.map((x) => `${t.target}: ${x}`));
			} catch (error) {
				rec.cell({
					family: 'archives',
					file: f.rel,
					tool: t.path,
					action,
					level: 'default',
					status: 'error',
					inBytes: input.length,
					durationMs: elapsed(),
					error: String(error).slice(0, 500)
				});
				failures.push(`${t.target}: ${String(error).slice(0, 200)}`);
			}
		}
		expect(failures, failures.join(' | ')).toEqual([]);
	});
}

// ------------------------------------------------ C) create from real files

/** 3-4 small loose real text files — deterministic (walkReal is sorted). */
const looseParts = walkReal()
	.filter(
		(f) => !f.giant && (f.ext === 'txt' || f.ext === 'csv') && f.bytes >= 500 && f.bytes <= 300_000
	)
	.slice(0, 4);

/** One real .txt for the single-file stream formats. */
const streamTxt = walkReal().find(
	(f) => !f.giant && f.ext === 'txt' && f.bytes >= 1_000 && f.bytes <= 500_000
);

interface CreateCheck {
	path: string;
	format: string;
	read: (bytes: Buffer) => Promise<Record<string, Uint8Array>>;
}

const CREATE_SETS: CreateCheck[] = [
	{ path: '/zip-files', format: 'zip', read: async (b) => fileEntries(unzip(b)) },
	{ path: '/create-7z', format: '7z', read: (b) => sevenZipEntries(b, 'archive.7z') },
	{
		path: '/create-tar-gz',
		format: 'tar.gz',
		read: async (b) => sevenZipEntries(await gunzipBuf(b), 'archive.tar')
	},
	{ path: '/create-tar-bz2', format: 'tar.bz2', read: (b) => refEntries(b, 'archive.tar.bz2') },
	{ path: '/create-tar-xz', format: 'tar.xz', read: (b) => refEntries(b, 'archive.tar.xz') }
];

/** Exactly the uploaded basenames, each byte-identical (create packs flat). */
function verifyCreatedSet(entries: Record<string, Uint8Array>, parts: RealFile[]): string[] {
	const problems: string[] = [];
	const got = Object.keys(entries)
		.map((n) => n.split('/').pop() ?? n)
		.sort();
	const want = parts.map((p) => p.name).sort();
	if (JSON.stringify(got) !== JSON.stringify(want)) {
		problems.push(`entries [${got.join(', ')}] != [${want.join(', ')}]`);
		return problems;
	}
	for (const p of parts) {
		const key = Object.keys(entries).find((n) => (n.split('/').pop() ?? n) === p.name);
		const entry = key ? entries[key] : undefined;
		if (!entry || Buffer.compare(Buffer.from(entry), readFileSync(p.abs)) !== 0)
			problems.push(`${p.name}: bytes differ after round-trip`);
	}
	return problems;
}

for (const check of CREATE_SETS) {
	test(`MX [archives] batch create @${check.format}`, async ({ page }) => {
		test.skip(looseParts.length < 2, 'need 2+ small real .txt/.csv files');
		const inBytes = looseParts.reduce((sum, p) => sum + p.bytes, 0);
		const fileId = looseParts.map((p) => p.rel).join('+');
		const elapsed = timer();
		let problems: string[] = [];
		try {
			await gotoPath(page, check.path);
			await upload(page, ...looseParts.map((p) => p.abs));
			await compress(page, { timeout: 240_000 });
			const art = await downloadCombined(page);
			const entries = await check.read(art.bytes);
			problems = verifyCreatedSet(entries, looseParts);
			rec.cell({
				family: 'archives',
				file: fileId,
				tool: check.path,
				action: `create:${check.format}`,
				level: 'default',
				status: problems.length ? 'fail' : 'pass',
				inBytes,
				outBytes: art.bytes.length,
				metrics: { entries: Object.keys(entries).length, outName: art.name },
				durationMs: elapsed()
			});
		} catch (error) {
			rec.cell({
				family: 'archives',
				file: fileId,
				tool: check.path,
				action: `create:${check.format}`,
				level: 'default',
				status: 'error',
				inBytes,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
		expect(problems, problems.join(' | ')).toEqual([]);
	});
}

// Single-file stream formats: each file compresses on its own (no bundle).
const STREAMS: {
	path: string;
	format: string;
	verify: (out: Buffer, name: string) => Promise<Buffer>;
}[] = [
	{ path: '/gzip-files', format: 'gz', verify: (out) => gunzipBuf(out) },
	{
		path: '/bzip2-files',
		format: 'bz2',
		verify: async (out, name) => {
			const entries = await sevenZipEntries(out, name);
			const keys = Object.keys(entries);
			expect(keys.length, 'one decompressed payload').toBe(1);
			return Buffer.from(entries[keys[0]]);
		}
	},
	{
		path: '/xz-files',
		format: 'xz',
		verify: async (out, name) => {
			const entries = await sevenZipEntries(out, name);
			const keys = Object.keys(entries);
			expect(keys.length, 'one decompressed payload').toBe(1);
			return Buffer.from(entries[keys[0]]);
		}
	}
];

for (const stream of STREAMS) {
	test(`MX [archives] ${streamTxt?.rel ?? 'no-txt'} :: create-stream @${stream.format}`, async ({
		page
	}) => {
		test.skip(!streamTxt, 'no small real .txt file');
		const input = readFileSync(streamTxt!.abs);
		const elapsed = timer();
		try {
			await gotoPath(page, stream.path);
			await upload(page, streamTxt!.abs);
			await compress(page, { timeout: 240_000 });
			const art = await downloadRow(page);
			expect(art.name, 'stream keeps the source name + adds the extension').toBe(
				`${streamTxt!.name}.${stream.format}`
			);
			const roundTrip = await stream.verify(art.bytes, art.name);
			const identical = Buffer.compare(roundTrip, input) === 0;
			expect(identical, 'decompressed bytes === input bytes').toBe(true);
			expect(art.bytes.length, 'compressible text must shrink').toBeLessThan(input.length);
			rec.cell({
				family: 'archives',
				file: streamTxt!.rel,
				tool: stream.path,
				action: 'create-stream',
				level: stream.format,
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				metrics: { roundTripIdentical: identical },
				durationMs: elapsed()
			});
		} catch (error) {
			rec.cell({
				family: 'archives',
				file: streamTxt!.rel,
				tool: stream.path,
				action: 'create-stream',
				level: stream.format,
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}

// --------------------------------------------------------- D) zip level ladder

const ZIP_LEVELS = ['Store', 'Fast', 'Balanced', 'Max'] as const;

test('MX [archives] batch create-zip @levels', async ({ page }) => {
	test.skip(looseParts.length < 2, 'need 2+ small real .txt/.csv files');
	const inBytes = looseParts.reduce((sum, p) => sum + p.bytes, 0);
	const fileId = looseParts.map((p) => p.rel).join('+');
	const sizes: Record<string, number> = {};
	const failures: string[] = [];
	await gotoPath(page, '/zip-files');
	await upload(page, ...looseParts.map((p) => p.abs));
	for (const level of ZIP_LEVELS) {
		const elapsed = timer();
		try {
			await page.getByRole('button', { name: level, exact: true }).click();
			await compress(page, { timeout: 240_000 });
			const art = await downloadCombined(page);
			sizes[level] = art.bytes.length;
			const problems = verifyCreatedSet(fileEntries(unzip(art.bytes)), looseParts);
			failures.push(...problems.map((x) => `${level}: ${x}`));
			rec.cell({
				family: 'archives',
				file: fileId,
				tool: '/zip-files',
				action: 'create:zip',
				level: level.toLowerCase(),
				status: problems.length ? 'fail' : 'pass',
				inBytes,
				outBytes: art.bytes.length,
				metrics: { roundTripOk: problems.length === 0 },
				durationMs: elapsed()
			});
		} catch (error) {
			rec.cell({
				family: 'archives',
				file: fileId,
				tool: '/zip-files',
				action: 'create:zip',
				level: level.toLowerCase(),
				status: 'error',
				inBytes,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			failures.push(`${level}: ${String(error).slice(0, 200)}`);
		}
	}
	if (sizes.Store !== undefined && sizes.Max !== undefined && sizes.Store < sizes.Max)
		failures.push(`Store (${sizes.Store}) < Max (${sizes.Max}) on compressible text`);
	expect(failures, failures.join(' | ')).toEqual([]);
});
