/**
 * Real-file matrix — docs family: EBOOK (epub/cbz/cbr), DATA (csv/xlsx/xls/
 * json/yaml), SUBTITLE (srt/vtt/ass) and OCR (image-to-text, ocr-pdf).
 * Every output decodes back through an independent node-side engine (fflate /
 * SheetJS / yaml / pdf-lib / pdfjs), container semantics are asserted (OCF
 * mimetype-first + stored, entry parity, cue counts, round-trip deep
 * equality, the YAML date-coercion trap), and ebook first-image
 * before/afters land as side-by-side rasters.
 *
 * Cell titles: `MX [docs] <file> :: <action> @<level>` — grep one to re-run.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { parse as parseYaml } from 'yaml';
import { expect, test } from '../fixtures';
import { compress, downloadRow, gotoPath, setEbookQuality, upload } from '../helpers';
import { REAL_PHOTO } from '../thresholds';
import {
	imageMeta,
	pdfEncryptionMeta,
	pdfInfo,
	pdfTextContent,
	qualityMetrics,
	sevenZipEntries,
	unzip,
	xlsxInfo,
	zipFirstEntry
} from '../verify';
import { MatrixRecorder, timer } from './record';
import { realByFormat, type RealFile } from './walk';

test.describe.configure({ timeout: 300_000 });

if (process.env.E2E_PREVIEW) throw new Error('matrix specs need the dev server (rasterizers)');

const rec = new MatrixRecorder('docs');

type Metrics = Record<string, number | string | boolean | null>;

/** Above this, node-side deep-equal is wasteful — structural checks only. */
const SIZE_BIG = 20_000_000;
/** Above this, conversions get their own small-chunk tests (+ test.slow). */
const SIZE_HEAVY = 8_000_000;

// ---------------------------------------------------------------- local utils

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

function bySize(files: RealFile[]): RealFile[] {
	return [...files].sort((a, b) => a.bytes - b.bytes || a.rel.localeCompare(b.rel));
}

function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function truncate(error: unknown): string {
	return String(error).slice(0, 500);
}

/** Sequential per-file batch: every attempted file records its cell inside the
 *  runner; failures collect and throw ONCE at the end (matrix-pdf discipline). */
async function runBatch(
	page: Page,
	files: RealFile[],
	runner: (page: Page, f: RealFile) => Promise<string | null>
): Promise<void> {
	const failures: string[] = [];
	for (const f of files) {
		const failure = await runner(page, f);
		if (failure) failures.push(failure);
	}
	expect(failures, failures.join(' | ')).toEqual([]);
}

/** Delimiter sniff on the first line, outside quotes (`,` vs `;` vs tab). */
function sniffDelimiter(text: string): string {
	const nl = text.indexOf('\n');
	const firstLine = text.slice(0, nl === -1 ? text.length : nl);
	let best = ',';
	let bestCount = -1;
	for (const d of [',', ';', '\t']) {
		let count = 0;
		let inQuotes = false;
		for (const ch of firstLine) {
			if (ch === '"') inQuotes = !inQuotes;
			else if (!inQuotes && ch === d) count++;
		}
		if (count > bestCount) {
			best = d;
			bestCount = count;
		}
	}
	return best;
}

/** Minimal RFC-4180 state machine — the node reference must survive quoted
 *  commas/newlines exactly like the app does (naive line counts don't). */
function parseCsv(raw: string): string[][] {
	const text = stripBom(raw);
	const delim = sniffDelimiter(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else inQuotes = false;
			} else cell += ch;
		} else if (ch === '"') inQuotes = true;
		else if (ch === delim) {
			row.push(cell);
			cell = '';
		} else if (ch === '\n') {
			row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell);
			rows.push(row);
			row = [];
			cell = '';
		} else cell += ch;
	}
	if (cell !== '' || row.length > 0) {
		row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell);
		rows.push(row);
	}
	while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
	return rows;
}

/** Formatted-text cells: SheetJS renders "4.50" back as "4.5" — compare
 *  numerically when both sides parse as numbers, exactly otherwise. */
function cellsMatch(a: string | undefined, b: string | undefined): boolean {
	const av = (a ?? '').trim();
	const bv = (b ?? '').trim();
	if (av === bv) return true;
	if (av === '' || bv === '') return false;
	const an = Number(av);
	const bn = Number(bv);
	return (
		Number.isFinite(an) &&
		Number.isFinite(bn) &&
		Math.abs(an - bn) <= 1e-9 * Math.max(1, Math.abs(an))
	);
}

/** Order-sensitive deep-equal via stringify (both sides preserve insertion
 *  order); returns a char-anchored context string on mismatch, null when equal. */
function jsonDiff(ref: unknown, out: unknown): string | null {
	const sa = JSON.stringify(ref);
	const sb = JSON.stringify(out);
	if (sa === sb) return null;
	const max = Math.min(sa.length, sb.length);
	let at = 0;
	while (at < max && sa[at] === sb[at]) at++;
	const from = Math.max(0, at - 40);
	return `differs at char ${at}: ref …${sa.slice(from, at + 40)}… out …${sb.slice(from, at + 40)}…`;
}

/** Bare YYYY-MM-DD scalars in a YAML source — the date-coercion trap: they
 *  must come back as the SAME string, never a Date / shifted ISO datetime. */
function yamlDateTokens(text: string): string[] {
	const out = new Set<string>();
	for (const m of text.matchAll(/(?::|-)[ \t]*(\d{4}-\d{2}-\d{2})[ \t]*(?:#[^\n]*)?$/gm)) {
		out.add(m[1]);
	}
	return [...out].slice(0, 20);
}

const cueCount = (text: string): number => (text.match(/-->/g) ?? []).length;
const dialogueCount = (text: string): number => (text.match(/^Dialogue\s*:/gm) ?? []).length;

const IMAGE_ENTRY = /\.(jpe?g|png|gif|webp)$/i;

function zipFileNames(entries: Record<string, Uint8Array>): string[] {
	return Object.keys(entries)
		.filter((n) => !n.endsWith('/'))
		.sort();
}

function firstImageEntry(entries: Record<string, Uint8Array>): string | null {
	return (
		Object.keys(entries)
			.filter((n) => IMAGE_ENTRY.test(n))
			.sort()[0] ?? null
	);
}

/** fflate first (the common case), 7zz fallback for zip features it rejects. */
async function readZipEntries(buf: Buffer, name: string): Promise<Record<string, Uint8Array>> {
	try {
		return unzip(buf);
	} catch {
		return sevenZipEntries(buf, name);
	}
}

async function toPng(image: Buffer): Promise<Buffer> {
	return sharp(image).png().toBuffer();
}

// ===========================================================================
// A) EBOOKS — epub compress q60/q100, cbz compress, cbr→cbz
// ===========================================================================

const ebooks = realByFormat(['ebook']);
const epubs = ebooks.filter((f) => f.ext === 'epub');
const cbzs = ebooks.filter((f) => f.ext === 'cbz');
const cbrs = ebooks.filter((f) => f.ext === 'cbr');

/** q100 representatives: the smallest (likely text-only) + the largest
 *  (likely image-heavy). Excluded from the q60 batches (unique cell ids). */
const repEpubs =
	epubs.length <= 2
		? epubs
		: (() => {
				const sorted = bySize(epubs);
				return [sorted[0], sorted[sorted.length - 1]];
			})();
const batchEpubs = epubs.filter((f) => !repEpubs.includes(f));

/**
 * One compress run at one quality on an already-uploaded EPUB. Records the
 * cell (pass/fail/error) and returns the failure string, null when green.
 */
async function runEpubLevel(
	page: Page,
	f: RealFile,
	input: Buffer,
	srcEntries: Record<string, Uint8Array>,
	level: 60 | 100
): Promise<string | null> {
	const levelTag = `q${level}`;
	const elapsed = timer();
	const id = rec.id(f.rel, 'compress', levelTag);
	try {
		await setEbookQuality(page, level);
		await compress(page, { timeout: 240_000 });
		const art = await downloadRow(page);
		const outEntries = unzip(art.bytes); // decode-back: throws on garbage
		const problems: string[] = [];
		const first = zipFirstEntry(art.bytes);
		if (first.name !== 'mimetype' || first.method !== 0) {
			problems.push(`OCF rule broken: first entry "${first.name}" method ${first.method}`);
		}
		const srcNames = zipFileNames(srcEntries);
		const outNames = zipFileNames(outEntries);
		if (srcNames.length !== outNames.length || srcNames.some((n, i) => n !== outNames[i])) {
			problems.push(`entry set changed: ${outNames.length} vs ${srcNames.length}`);
		}
		const mimetype = outEntries['mimetype'] ? Buffer.from(outEntries['mimetype']).toString() : '';
		if (mimetype !== 'application/epub+zip') {
			problems.push(`mimetype payload "${mimetype.slice(0, 40)}"`);
		}
		const keptOriginal = art.bytes.length === input.length;
		if (art.bytes.length > input.length) problems.push('output grew past the keep-original guard');

		// First contained image before/after — raster + PSNR (q60 gated at the
		// real-photo floor; q100 is per-entry byte-exact so it reads 99).
		const rasters: string[] = [];
		const metrics: Metrics = { entries: outNames.length, firstImage: null, firstImagePsnr: null };
		const imgName = firstImageEntry(srcEntries);
		if (imgName && outEntries[imgName]) {
			metrics.firstImage = imgName;
			metrics.firstImageInBytes = srcEntries[imgName].length;
			metrics.firstImageOutBytes = outEntries[imgName].length;
			try {
				const before = Buffer.from(srcEntries[imgName]);
				const after = Buffer.from(outEntries[imgName]);
				const q = await qualityMetrics(before, after);
				metrics.firstImagePsnr = Number(q.psnr.toFixed(1));
				metrics.firstImageDiffRatio = Number(q.ratio.toFixed(5));
				if (level === 60 && q.psnr < REAL_PHOTO.psnrFloor) {
					problems.push(`first image psnr ${q.psnr.toFixed(1)} < ${REAL_PHOTO.psnrFloor}`);
				}
				rasters.push(
					await rec.saveSideBySide(id, 'first-image.png', await toPng(before), await toPng(after))
				);
			} catch (error) {
				metrics.firstImageError = truncate(error).slice(0, 120);
			}
		}
		const notes = [
			keptOriginal ? 'keep-original returned input bytes' : '',
			level === 60 && keptOriginal ? 'q60 no savings (soft — recorded, not failed)' : ''
		]
			.filter(Boolean)
			.join('; ');
		rec.cell({
			family: 'docs',
			file: f.rel,
			tool: '/compress-epub',
			action: 'compress',
			level: levelTag,
			status: problems.length ? 'fail' : 'pass',
			inBytes: input.length,
			outBytes: art.bytes.length,
			keptOriginal,
			metrics,
			durationMs: elapsed(),
			rasters,
			notes
		});
		return problems.length ? `${f.rel} ${levelTag}: ${problems.join('; ')}` : null;
	} catch (error) {
		rec.cell({
			family: 'docs',
			file: f.rel,
			tool: '/compress-epub',
			action: 'compress',
			level: levelTag,
			status: 'error',
			inBytes: input.length,
			durationMs: elapsed(),
			error: truncate(error)
		});
		return `${f.rel} ${levelTag}: ${truncate(error).slice(0, 200)}`;
	}
}

for (const f of repEpubs) {
	test(`MX [docs] ${f.rel} :: compress @q60+q100`, async ({ page }) => {
		const input = readFileSync(f.abs);
		const srcEntries = await readZipEntries(input, f.name);
		await gotoPath(page, '/compress-epub');
		await upload(page, f.abs);
		const failures: string[] = [];
		// One upload, two runs — the second compress re-runs on the same row.
		for (const level of [60, 100] as const) {
			const failure = await runEpubLevel(page, f, input, srcEntries, level);
			if (failure) failures.push(failure);
		}
		expect(failures, failures.join(' | ')).toEqual([]);
	});
}

chunk(batchEpubs, 4).forEach((files, i) => {
	test(`MX [docs] batch${i + 1} :: epub-compress @q60`, async ({ page }) => {
		await runBatch(page, files, async (pg, f) => {
			try {
				const input = readFileSync(f.abs);
				const srcEntries = await readZipEntries(input, f.name);
				await gotoPath(pg, '/compress-epub');
				await upload(pg, f.abs);
				return await runEpubLevel(pg, f, input, srcEntries, 60);
			} catch (error) {
				// pre-run failure (unreadable/unzippable input, upload) — record it
				rec.cell({
					family: 'docs',
					file: f.rel,
					tool: '/compress-epub',
					action: 'compress',
					level: 'q60',
					status: 'error',
					inBytes: f.bytes,
					durationMs: 0,
					error: truncate(error)
				});
				return `${f.rel}: ${truncate(error).slice(0, 200)}`;
			}
		});
	});
});

for (const f of cbzs) {
	test(`MX [docs] ${f.rel} :: cbz-compress @q60`, async ({ page }) => {
		test.slow(); // 32 MB real comics re-encode dozens of pages
		const input = readFileSync(f.abs);
		const elapsed = timer();
		const id = rec.id(f.rel, 'cbz-compress', 'q60');
		try {
			const srcEntries = await readZipEntries(input, f.name);
			await gotoPath(page, '/compress-cbz');
			await upload(page, f.abs);
			await setEbookQuality(page, 60);
			await compress(page, { timeout: 240_000 });
			const art = await downloadRow(page);
			const outEntries = unzip(art.bytes);
			const problems: string[] = [];
			const srcNames = zipFileNames(srcEntries);
			const outNames = zipFileNames(outEntries);
			if (srcNames.length !== outNames.length || srcNames.some((n, i) => n !== outNames[i])) {
				problems.push(`entry set changed: ${outNames.length} vs ${srcNames.length}`);
			}
			if (art.bytes.length > input.length)
				problems.push('output grew past the keep-original guard');
			const keptOriginal = art.bytes.length === input.length;
			const metrics: Metrics = { entries: outNames.length, firstPage: null };
			const rasters: string[] = [];
			const imgName = firstImageEntry(outEntries);
			if (!imgName) problems.push('no decodable image entry in the output comic');
			else {
				const after = Buffer.from(outEntries[imgName]);
				const meta = await imageMeta(after); // decodes cleanly
				metrics.firstPage = imgName;
				metrics.firstPageFormat = meta.format;
				metrics.firstPageWidth = meta.width;
				metrics.firstPageHeight = meta.height;
				if (srcEntries[imgName]) {
					const before = Buffer.from(srcEntries[imgName]);
					const q = await qualityMetrics(before, after);
					metrics.firstPagePsnr = Number(q.psnr.toFixed(1));
					if (q.psnr < REAL_PHOTO.psnrFloor) {
						problems.push(`first page psnr ${q.psnr.toFixed(1)} < ${REAL_PHOTO.psnrFloor}`);
					}
					rasters.push(
						await rec.saveSideBySide(id, 'first-page.png', await toPng(before), await toPng(after))
					);
				}
			}
			rec.cell({
				family: 'docs',
				file: f.rel,
				tool: '/compress-cbz',
				action: 'cbz-compress',
				level: 'q60',
				status: problems.length ? 'fail' : 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				keptOriginal,
				metrics,
				durationMs: elapsed(),
				rasters,
				notes: keptOriginal ? 'keep-original returned input bytes' : ''
			});
			expect(problems, problems.join(' | ')).toEqual([]);
		} catch (error) {
			rec.cell({
				family: 'docs',
				file: f.rel,
				tool: '/compress-cbz',
				action: 'cbz-compress',
				level: 'q60',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: truncate(error)
			});
			throw error;
		}
	});
}

for (const f of cbrs) {
	test(`MX [docs] ${f.rel} :: cbr-to-cbz @default`, async ({ page }) => {
		test.slow(); // 32 MB RAR extract in 7z-wasm + zip rebuild
		const input = readFileSync(f.abs);
		const elapsed = timer();
		const id = rec.id(f.rel, 'cbr-to-cbz', 'default');
		try {
			const srcEntries = await sevenZipEntries(input, f.name);
			await gotoPath(page, '/cbr-to-cbz');
			await upload(page, f.abs);
			await compress(page, { timeout: 240_000 });
			const art = await downloadRow(page);
			const problems: string[] = [];
			if (!art.name.endsWith('.cbz')) problems.push(`output name "${art.name}"`);
			const outEntries = unzip(art.bytes); // valid zip or throws
			const srcBase = Object.keys(srcEntries)
				.map((n) => basename(n))
				.sort();
			const outBase = zipFileNames(outEntries)
				.map((n) => basename(n))
				.sort();
			if (srcBase.length !== outBase.length || srcBase.some((n, i) => n !== outBase[i])) {
				problems.push(`entry basenames changed: ${outBase.length} vs ${srcBase.length}`);
			}
			const metrics: Metrics = { entries: outBase.length, firstPage: null };
			const rasters: string[] = [];
			const imgName = firstImageEntry(outEntries);
			if (!imgName) problems.push('no decodable image entry in the converted comic');
			else {
				const after = Buffer.from(outEntries[imgName]);
				const meta = await imageMeta(after);
				metrics.firstPage = imgName;
				metrics.firstPageFormat = meta.format;
				const srcMatch = Object.keys(srcEntries).find((n) => basename(n) === basename(imgName));
				if (srcMatch) {
					rasters.push(
						await rec.saveSideBySide(
							id,
							'first-page.png',
							await toPng(Buffer.from(srcEntries[srcMatch])),
							await toPng(after)
						)
					);
				}
			}
			rec.cell({
				family: 'docs',
				file: f.rel,
				tool: '/cbr-to-cbz',
				action: 'cbr-to-cbz',
				level: 'default',
				status: problems.length ? 'fail' : 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				metrics,
				durationMs: elapsed(),
				rasters,
				notes: 'conversion — the zip may legitimately be bigger than the rar'
			});
			expect(problems, problems.join(' | ')).toEqual([]);
		} catch (error) {
			rec.cell({
				family: 'docs',
				file: f.rel,
				tool: '/cbr-to-cbz',
				action: 'cbr-to-cbz',
				level: 'default',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: truncate(error)
			});
			throw error;
		}
	});
}

// ===========================================================================
// B) DATA — csv→xlsx, xlsx/xls→csv, json→yaml, yaml→json
// ===========================================================================

const dataFiles = realByFormat(['data']);
const csvs = dataFiles.filter((f) => f.ext === 'csv' || f.ext === 'tsv');
const xlsxs = dataFiles.filter((f) => f.ext === 'xlsx');
const xlss = dataFiles.filter((f) => f.ext === 'xls');
const jsons = dataFiles.filter((f) => f.ext === 'json');
const yamls = dataFiles.filter((f) => f.ext === 'yaml' || f.ext === 'yml');

async function runCsvToXlsx(page: Page, f: RealFile): Promise<string | null> {
	const structuralOnly = f.bytes > SIZE_BIG;
	const level = structuralOnly ? 'structural' : 'default';
	const elapsed = timer();
	const input = readFileSync(f.abs);
	try {
		await gotoPath(page, '/csv-to-xlsx');
		await upload(page, f.abs);
		await compress(page, { timeout: 240_000 });
		const art = await downloadRow(page);
		const problems: string[] = [];
		let metrics: Metrics = {};
		if (!art.name.endsWith('.xlsx')) problems.push(`output name "${art.name}"`);
		if (structuralOnly) {
			// >20 MB: full SheetJS read-back would burn minutes — assert the OOXML
			// skeleton at the container level and record honestly.
			const entries = unzip(art.bytes);
			for (const required of ['[Content_Types].xml', 'xl/worksheets/sheet1.xml']) {
				if (!entries[required]) problems.push(`missing ${required}`);
			}
			metrics = { note: 'structural only (>20MB) — container skeleton, no cell read-back' };
		} else {
			const info = await xlsxInfo(art.bytes); // decode-back with SheetJS
			const ref = parseCsv(input.toString('utf8'));
			metrics = { outRows: info.rows.length, refRows: ref.length, sheets: info.sheetNames.length };
			if (Math.abs(info.rows.length - ref.length) > 1) {
				problems.push(`rows ${info.rows.length} vs csv ${ref.length}`);
			}
			if (ref.length > 0 && !cellsMatch(info.rows[0]?.[0], ref[0]?.[0])) {
				problems.push(
					`header cell "${String(info.rows[0]?.[0]).slice(0, 40)}" != "${(ref[0]?.[0] ?? '').slice(0, 40)}"`
				);
			}
			const spot = (rowIdx: number): void => {
				const refRow = ref[rowIdx];
				const outRow = info.rows[rowIdx];
				if (!refRow || !outRow) return;
				const col = refRow.findIndex((c) => c.trim() !== '');
				if (col === -1) return;
				if (!cellsMatch(outRow[col], refRow[col])) {
					problems.push(
						`cell[${rowIdx}][${col}] "${String(outRow[col]).slice(0, 40)}" != "${refRow[col].slice(0, 40)}"`
					);
				}
			};
			spot(1);
			spot(Math.min(ref.length, info.rows.length) - 1);
		}
		rec.cell({
			family: 'docs',
			file: f.rel,
			tool: '/csv-to-xlsx',
			action: 'to-xlsx',
			level,
			status: problems.length ? 'fail' : 'pass',
			inBytes: input.length,
			outBytes: art.bytes.length,
			metrics,
			durationMs: elapsed()
		});
		return problems.length ? `${f.rel}: ${problems.join('; ')}` : null;
	} catch (error) {
		rec.cell({
			family: 'docs',
			file: f.rel,
			tool: '/csv-to-xlsx',
			action: 'to-xlsx',
			level,
			status: 'error',
			inBytes: input.length,
			durationMs: elapsed(),
			error: truncate(error)
		});
		return `${f.rel}: ${truncate(error).slice(0, 200)}`;
	}
}

/** xlsx AND legacy xls ride the same page — SheetJS reads both in node too. */
async function runSheetToCsv(page: Page, f: RealFile): Promise<string | null> {
	const elapsed = timer();
	const input = readFileSync(f.abs);
	try {
		const ref = await xlsxInfo(input);
		await gotoPath(page, '/xlsx-to-csv');
		await upload(page, f.abs);
		await compress(page, { timeout: 240_000 });
		const art = await downloadRow(page);
		const problems: string[] = [];
		if (!art.name.endsWith('.csv')) problems.push(`output name "${art.name}"`);
		if (!(art.bytes[0] === 0xef && art.bytes[1] === 0xbb && art.bytes[2] === 0xbf)) {
			problems.push('missing UTF-8 BOM (Excel contract)');
		}
		const rows = parseCsv(art.bytes.toString('utf8'));
		if (Math.abs(rows.length - ref.rows.length) > 1) {
			problems.push(`rows ${rows.length} vs sheet ${ref.rows.length}`);
		}
		if (ref.rows.length > 0 && !cellsMatch(rows[0]?.[0], ref.rows[0]?.[0])) {
			problems.push(
				`header cell "${String(rows[0]?.[0]).slice(0, 40)}" != "${String(ref.rows[0]?.[0]).slice(0, 40)}"`
			);
		}
		if (ref.rows.length > 1 && rows.length > 1) {
			const col = ref.rows[1].findIndex((c) => String(c).trim() !== '');
			if (col >= 0 && !cellsMatch(rows[1]?.[col], ref.rows[1]?.[col])) {
				problems.push(
					`cell[1][${col}] "${String(rows[1]?.[col]).slice(0, 40)}" != "${String(ref.rows[1]?.[col]).slice(0, 40)}"`
				);
			}
		}
		rec.cell({
			family: 'docs',
			file: f.rel,
			tool: '/xlsx-to-csv',
			action: 'to-csv',
			level: 'default',
			status: problems.length ? 'fail' : 'pass',
			inBytes: input.length,
			outBytes: art.bytes.length,
			metrics: { outRows: rows.length, refRows: ref.rows.length, sheets: ref.sheetNames.length },
			durationMs: elapsed(),
			notes: ref.sheetNames.length > 1 ? 'multi-sheet input — only the first sheet exports' : ''
		});
		return problems.length ? `${f.rel}: ${problems.join('; ')}` : null;
	} catch (error) {
		rec.cell({
			family: 'docs',
			file: f.rel,
			tool: '/xlsx-to-csv',
			action: 'to-csv',
			level: 'default',
			status: 'error',
			inBytes: input.length,
			durationMs: elapsed(),
			error: truncate(error)
		});
		return `${f.rel}: ${truncate(error).slice(0, 200)}`;
	}
}

async function runJsonToYaml(page: Page, f: RealFile): Promise<string | null> {
	const structuralOnly = f.bytes > SIZE_BIG;
	const level = structuralOnly ? 'structural' : 'default';
	const elapsed = timer();
	const input = readFileSync(f.abs);
	try {
		let ref: unknown;
		let refError: string | null = null;
		try {
			ref = JSON.parse(stripBom(input.toString('utf8')));
		} catch (error) {
			refError = truncate(error);
		}
		await gotoPath(page, '/json-to-yaml');
		await upload(page, f.abs);
		if (refError !== null) {
			// Node refuses it as JSON — the app must refuse it too, honestly.
			const run = await compress(page, { expectError: true, timeout: 120_000 });
			rec.cell({
				family: 'docs',
				file: f.rel,
				tool: '/json-to-yaml',
				action: 'to-yaml',
				level,
				status: 'pass',
				inBytes: input.length,
				durationMs: elapsed(),
				metrics: { refused: true },
				notes: `invalid JSON refused: ${(run.error ?? '').slice(0, 120)}`
			});
			return null;
		}
		await compress(page, { timeout: 240_000 });
		const art = await downloadRow(page);
		const problems: string[] = [];
		if (!/\.ya?ml$/.test(art.name)) problems.push(`output name "${art.name}"`);
		let metrics: Metrics = {};
		if (structuralOnly) {
			// >20 MB: parsing a ~60 MB YAML in node is minutes of CPU — shape
			// heuristics only, recorded as such.
			const head = art.bytes.toString('utf8', 0, 200);
			if (art.bytes.length === 0) problems.push('empty output');
			if (/^\s*[{[]/.test(head)) problems.push('output starts with flow JSON, not block YAML');
			metrics = { note: 'structural only (>20MB) — shape heuristics, no parse' };
		} else {
			const roundTripped = parseYaml(stripBom(art.bytes.toString('utf8'))); // decode-back
			const diff = jsonDiff(ref, roundTripped);
			if (diff) problems.push(`round-trip mismatch: ${diff}`);
		}
		rec.cell({
			family: 'docs',
			file: f.rel,
			tool: '/json-to-yaml',
			action: 'to-yaml',
			level,
			status: problems.length ? 'fail' : 'pass',
			inBytes: input.length,
			outBytes: art.bytes.length,
			metrics,
			durationMs: elapsed()
		});
		return problems.length ? `${f.rel}: ${problems.join('; ')}` : null;
	} catch (error) {
		rec.cell({
			family: 'docs',
			file: f.rel,
			tool: '/json-to-yaml',
			action: 'to-yaml',
			level,
			status: 'error',
			inBytes: input.length,
			durationMs: elapsed(),
			error: truncate(error)
		});
		return `${f.rel}: ${truncate(error).slice(0, 200)}`;
	}
}

async function runYamlToJson(page: Page, f: RealFile): Promise<string | null> {
	const elapsed = timer();
	const input = readFileSync(f.abs);
	const text = stripBom(input.toString('utf8'));
	try {
		let ref: unknown;
		let refError: string | null = null;
		try {
			ref = parseYaml(text);
		} catch (error) {
			refError = truncate(error);
		}
		await gotoPath(page, '/yaml-to-json');
		await upload(page, f.abs);
		if (refError !== null) {
			// Node's yaml parser refuses it (multi-doc, tags…) — either app outcome
			// can be legitimate; record which, structurally validate a conversion.
			const run = await compress(page, { timeout: 240_000 }).catch((error) => ({
				error: String(error),
				warnings: [] as string[]
			}));
			if (run.error) {
				rec.cell({
					family: 'docs',
					file: f.rel,
					tool: '/yaml-to-json',
					action: 'to-json',
					level: 'default',
					status: 'pass',
					inBytes: input.length,
					durationMs: elapsed(),
					metrics: { refused: true },
					notes: `node yaml.parse failed and the app refused too: ${run.error.slice(0, 120)}`
				});
				return null;
			}
			const art = await downloadRow(page);
			JSON.parse(stripBom(art.bytes.toString('utf8'))); // throws → error cell
			rec.cell({
				family: 'docs',
				file: f.rel,
				tool: '/yaml-to-json',
				action: 'to-json',
				level: 'default',
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				durationMs: elapsed(),
				notes: `node yaml.parse failed (${refError.slice(0, 80)}) — structural JSON.parse only`
			});
			return null;
		}
		await compress(page, { timeout: 240_000 });
		const art = await downloadRow(page);
		const problems: string[] = [];
		if (!art.name.endsWith('.json')) problems.push(`output name "${art.name}"`);
		const outText = stripBom(art.bytes.toString('utf8'));
		const out = JSON.parse(outText); // decode-back
		// Reference normalized through JSON so a node-side Date (rare %YAML 1.1
		// docs) becomes an ISO string instead of crashing the comparison.
		const refNormalized: unknown = JSON.parse(JSON.stringify(ref === undefined ? null : ref));
		const diff = jsonDiff(refNormalized, out);
		if (diff) problems.push(`round-trip mismatch: ${diff}`);
		// The date-coercion trap, explicitly: bare YYYY-MM-DD scalars must come
		// back as the same string — a Date object serializes as "…T00:00:00…".
		const dateTokens = yamlDateTokens(text);
		for (const token of dateTokens) {
			if (!outText.includes(`"${token}"`) || outText.includes(`"${token}T`)) {
				problems.push(`date "${token}" coerced/shifted in the JSON output`);
			}
		}
		rec.cell({
			family: 'docs',
			file: f.rel,
			tool: '/yaml-to-json',
			action: 'to-json',
			level: 'default',
			status: problems.length ? 'fail' : 'pass',
			inBytes: input.length,
			outBytes: art.bytes.length,
			metrics: { dateTokensChecked: dateTokens.length },
			durationMs: elapsed()
		});
		return problems.length ? `${f.rel}: ${problems.join('; ')}` : null;
	} catch (error) {
		rec.cell({
			family: 'docs',
			file: f.rel,
			tool: '/yaml-to-json',
			action: 'to-json',
			level: 'default',
			status: 'error',
			inBytes: input.length,
			durationMs: elapsed(),
			error: truncate(error)
		});
		return `${f.rel}: ${truncate(error).slice(0, 200)}`;
	}
}

const csvLight = bySize(csvs.filter((f) => f.bytes <= SIZE_HEAVY));
const csvHeavy = bySize(csvs.filter((f) => f.bytes > SIZE_HEAVY && f.bytes <= SIZE_BIG));
const csvBig = bySize(csvs.filter((f) => f.bytes > SIZE_BIG));

chunk(csvLight, 8).forEach((files, i) => {
	test(`MX [docs] batch${i + 1} :: csv-to-xlsx @default`, async ({ page }) => {
		await runBatch(page, files, runCsvToXlsx);
	});
});
chunk(csvHeavy, 2).forEach((files, i) => {
	test(`MX [docs] heavy${i + 1} :: csv-to-xlsx @default`, async ({ page }) => {
		test.slow(); // 8-20 MB sheets — browser SheetJS + node read-back both crawl
		await runBatch(page, files, runCsvToXlsx);
	});
});
for (const f of csvBig) {
	test(`MX [docs] ${f.rel} :: csv-to-xlsx @structural`, async ({ page }) => {
		test.slow();
		await runBatch(page, [f], runCsvToXlsx);
	});
}

chunk(bySize(xlsxs), 4).forEach((files, i) => {
	test(`MX [docs] batch${i + 1} :: xlsx-to-csv @default`, async ({ page }) => {
		await runBatch(page, files, runSheetToCsv);
	});
});
chunk(bySize(xlss), 4).forEach((files, i) => {
	test(`MX [docs] batch${i + 1} :: xls-to-csv @default`, async ({ page }) => {
		await runBatch(page, files, runSheetToCsv);
	});
});

const jsonLight = bySize(jsons.filter((f) => f.bytes <= SIZE_HEAVY));
const jsonHeavy = bySize(jsons.filter((f) => f.bytes > SIZE_HEAVY && f.bytes <= SIZE_BIG));
const jsonBig = bySize(jsons.filter((f) => f.bytes > SIZE_BIG));

chunk(jsonLight, 5).forEach((files, i) => {
	test(`MX [docs] batch${i + 1} :: json-to-yaml @default`, async ({ page }) => {
		await runBatch(page, files, runJsonToYaml);
	});
});
for (const f of jsonHeavy) {
	test(`MX [docs] ${f.rel} :: json-to-yaml @default`, async ({ page }) => {
		test.slow(); // 8-20 MB: node-side yaml.parse of the output is the cost
		await runBatch(page, [f], runJsonToYaml);
	});
}
for (const f of jsonBig) {
	test(`MX [docs] ${f.rel} :: json-to-yaml @structural`, async ({ page }) => {
		test.slow();
		await runBatch(page, [f], runJsonToYaml);
	});
}

chunk(bySize(yamls), 8).forEach((files, i) => {
	test(`MX [docs] batch${i + 1} :: yaml-to-json @default`, async ({ page }) => {
		await runBatch(page, files, runYamlToJson);
	});
});

// ===========================================================================
// C) SUBTITLES — srt→vtt, vtt→srt, ass→srt (registers nothing when empty)
// ===========================================================================

const subs = realByFormat(['subtitle']);
const srts = subs.filter((f) => f.ext === 'srt');
const vtts = subs.filter((f) => f.ext === 'vtt');
const asses = subs.filter((f) => f.ext === 'ass' || f.ext === 'ssa');

async function runSubtitle(
	page: Page,
	f: RealFile,
	path: string,
	action: 'to-vtt' | 'to-srt'
): Promise<string | null> {
	const elapsed = timer();
	const input = readFileSync(f.abs);
	try {
		const inText = stripBom(input.toString('utf8'));
		const isAss = f.ext === 'ass' || f.ext === 'ssa';
		const inCues = isAss ? dialogueCount(inText) : cueCount(inText);
		await gotoPath(page, path);
		await upload(page, f.abs);
		await compress(page, { timeout: 120_000 });
		const art = await downloadRow(page);
		const outText = stripBom(art.bytes.toString('utf8'));
		const outCues = cueCount(outText);
		const problems: string[] = [];
		if (action === 'to-vtt') {
			if (!art.name.endsWith('.vtt')) problems.push(`output name "${art.name}"`);
			if (!outText.startsWith('WEBVTT')) problems.push('missing WEBVTT header');
			if (outCues !== inCues) problems.push(`cues ${outCues} != ${inCues}`);
		} else {
			if (!art.name.endsWith('.srt')) problems.push(`output name "${art.name}"`);
			if (!/\d{2}:\d{2}:\d{2},\d{3} --> /.test(outText)) problems.push('no SRT comma timestamps');
			if (isAss) {
				// Converters may legitimately drop empty/comment dialogue lines —
				// only zero output or MORE cues than dialogues is damage.
				if (outCues === 0) problems.push('no cues survived');
				if (outCues > inCues) problems.push(`cues ${outCues} > dialogues ${inCues}`);
				if (/\{\\/.test(outText)) problems.push('ASS override tags leaked into the SRT');
			} else if (outCues !== inCues) problems.push(`cues ${outCues} != ${inCues}`);
		}
		rec.cell({
			family: 'docs',
			file: f.rel,
			tool: path,
			action,
			level: 'default',
			status: problems.length ? 'fail' : 'pass',
			inBytes: input.length,
			outBytes: art.bytes.length,
			metrics: { inCues, outCues },
			durationMs: elapsed()
		});
		return problems.length ? `${f.rel}: ${problems.join('; ')}` : null;
	} catch (error) {
		rec.cell({
			family: 'docs',
			file: f.rel,
			tool: path,
			action,
			level: 'default',
			status: 'error',
			inBytes: input.length,
			durationMs: elapsed(),
			error: truncate(error)
		});
		return `${f.rel}: ${truncate(error).slice(0, 200)}`;
	}
}

for (const f of srts) {
	test(`MX [docs] ${f.rel} :: to-vtt @default`, async ({ page }) => {
		await runBatch(page, [f], (pg, file) => runSubtitle(pg, file, '/srt-to-vtt', 'to-vtt'));
	});
}
chunk(bySize(vtts), 4).forEach((files, i) => {
	test(`MX [docs] batch${i + 1} :: vtt-to-srt @default`, async ({ page }) => {
		await runBatch(page, files, (pg, file) => runSubtitle(pg, file, '/vtt-to-srt', 'to-srt'));
	});
});
chunk(bySize(asses), 4).forEach((files, i) => {
	test(`MX [docs] batch${i + 1} :: ass-to-srt @default`, async ({ page }) => {
		await runBatch(page, files, (pg, file) => runSubtitle(pg, file, '/ass-to-srt', 'to-srt'));
	});
});

// ===========================================================================
// D) OCR — one real photo through /image-to-text, one real PDF through /ocr-pdf
// ===========================================================================

const ocrJpeg = bySize(
	realByFormat(['jpg']).filter((f) => ['jpg', 'jpeg', 'jpe'].includes(f.ext))
)[0];

if (ocrJpeg) {
	test(`MX [docs] ${ocrJpeg.rel} :: image-to-text @eng`, async ({ page }) => {
		const input = readFileSync(ocrJpeg.abs);
		const elapsed = timer();
		try {
			await gotoPath(page, '/image-to-text');
			await upload(page, ocrJpeg.abs);
			await compress(page, { timeout: 240_000 });
			const art = await downloadRow(page);
			expect(art.name.endsWith('.txt'), `output name "${art.name}"`).toBe(true);
			const chars = art.bytes.toString('utf8').trim().length;
			rec.cell({
				family: 'docs',
				file: ocrJpeg.rel,
				tool: '/image-to-text',
				action: 'image-to-text',
				level: 'eng',
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				metrics: { chars },
				durationMs: elapsed(),
				notes: 'photo input — recognized chars recorded, no content assertion (may be near-empty)'
			});
		} catch (error) {
			rec.cell({
				family: 'docs',
				file: ocrJpeg.rel,
				tool: '/image-to-text',
				action: 'image-to-text',
				level: 'eng',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: truncate(error)
			});
			throw error;
		}
	});
}

const ocrPdfCandidates = realByFormat(['pdf']).filter((f) => f.bytes < 5_000_000);

if (ocrPdfCandidates.length) {
	test('MX [docs] ocr-pdf :: searchable-pdf @eng', async ({ page }) => {
		// Runtime pick: prefer an image-only scan (any text in the output can only
		// come from recognition); fall back to the smallest text-ful PDF. Page
		// count capped — wasm tesseract runs seconds per page.
		interface OcrPick {
			f: RealFile;
			pages: number;
			textless: boolean;
		}
		let pick: OcrPick | null = null;
		for (const f of bySize(ocrPdfCandidates)) {
			const buf = readFileSync(f.abs);
			if (pdfEncryptionMeta(buf).encrypted) continue;
			let pages: number;
			try {
				pages = (await pdfInfo(buf)).pageCount;
			} catch {
				continue;
			}
			if (pages > 12) continue;
			const text = await pdfTextContent(buf).catch(() => '');
			if (text.trim().length < 40) {
				pick = { f, pages, textless: true };
				break;
			}
			pick ??= { f, pages, textless: false };
		}
		test.skip(!pick, 'no usable small unencrypted PDF');
		const { f, pages, textless } = pick!;
		const input = readFileSync(f.abs);
		const elapsed = timer();
		try {
			await gotoPath(page, '/ocr-pdf');
			await upload(page, f.abs);
			await compress(page, { timeout: 240_000 });
			const art = await downloadRow(page);
			const outInfo = await pdfInfo(art.bytes); // decode-back
			expect(outInfo.pageCount, 'page count preserved').toBe(pages);
			const outText = (await pdfTextContent(art.bytes)).trim();
			expect(outText.length, 'searchable output must carry a text layer').toBeGreaterThan(0);
			rec.cell({
				family: 'docs',
				file: f.rel,
				tool: '/ocr-pdf',
				action: 'ocr-pdf',
				level: 'eng',
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				metrics: { pages, textChars: outText.length, inputHadTextLayer: !textless },
				durationMs: elapsed(),
				notes: textless
					? 'image-only scan — every output char came from recognition'
					: 'fallback: no text-free scan under 5 MB — input already had a text layer'
			});
		} catch (error) {
			rec.cell({
				family: 'docs',
				file: f.rel,
				tool: '/ocr-pdf',
				action: 'ocr-pdf',
				level: 'eng',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: truncate(error)
			});
			throw error;
		}
	});
}
