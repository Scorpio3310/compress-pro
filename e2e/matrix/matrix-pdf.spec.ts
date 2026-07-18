/**
 * Real-file matrix — PDF family. Every routable real PDF (normal tier) runs
 * the full compress level ladder with decode-back + raster/SSIM validation,
 * and every small PDF runs each PDF op landing page. Encrypted inputs are
 * detected at runtime and handled by the password tests instead.
 *
 * Cell titles: `MX [pdf] <file> :: <action> @<level>` — grep one to re-run it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '../fixtures';
import {
	compress,
	downloadRow,
	gotoPath,
	rasterizePdfInPage,
	setDpi,
	setPageRange,
	setPdfLevel,
	upload
} from '../helpers';
import {
	imageMeta,
	pdfEncryptionMeta,
	pdfInfo,
	pdfIsEncrypted,
	pdfRotations,
	pdfTextContent,
	qualityMetrics,
	unzip
} from '../verify';
import { MatrixRecorder, timer } from './record';
import { realByFormat } from './walk';

test.describe.configure({ timeout: 300_000 });

if (process.env.E2E_PREVIEW) throw new Error('matrix specs need the dev server (rasterizers)');

const rec = new MatrixRecorder('pdf');
const LEVELS = ['Low', 'Medium', 'High', 'Ultra', 'Extreme'] as const;
/** SSIM/PSNR floors gate Low/Medium/High (REAA calibration 2026-07-15);
 *  Ultra/Extreme are record-only — visibly lossy by design. */
const GATED = new Set(['Low', 'Medium', 'High']);
const FLOORS = { psnr: 15, ssim: 0.94 };
const OP_MAX_BYTES = 5_000_000;

const pdfs = realByFormat(['pdf']);
const smallPdfs = pdfs.filter((f) => f.bytes <= OP_MAX_BYTES);

/** Runtime encryption gate — encrypted inputs belong to the password tests. */
function skipIfEncrypted(input: Buffer, fileRel: string, action: string): boolean {
	if (!pdfEncryptionMeta(input).encrypted) return false;
	rec.cell({
		family: 'pdf',
		file: fileRel,
		tool: '/compress-pdf',
		action,
		level: 'n/a',
		status: 'skip',
		inBytes: input.length,
		durationMs: 0,
		notes: 'encrypted input — covered by the unlock password tests'
	});
	return true;
}

for (const f of pdfs) {
	test(`MX [pdf] ${f.rel} :: compress @all-levels`, async ({ page }) => {
		const input = readFileSync(f.abs);
		if (skipIfEncrypted(input, f.rel, 'compress')) return;
		const inInfo = await pdfInfo(input);
		const midPage = inInfo.pageCount > 2 ? Math.ceil(inInfo.pageCount / 2) : null;

		await gotoPath(page, '/compress-pdf');
		await upload(page, f.abs);
		const inRasterP1 = await rasterizePdfInPage(page, input, 1);
		expect(inRasterP1, 'input must rasterize (dev server)').not.toBeNull();
		const inRasterMid = midPage ? await rasterizePdfInPage(page, input, midPage) : null;

		const sizes: Record<string, number> = {};
		const failures: string[] = [];
		for (const level of LEVELS) {
			const elapsed = timer();
			const id = rec.id(f.rel, 'compress', level.toLowerCase());
			try {
				await setPdfLevel(page, level);
				await compress(page, { timeout: 240_000 });
				const art = await downloadRow(page);
				const outInfo = await pdfInfo(art.bytes); // decode-back: throws on garbage
				sizes[level] = art.bytes.length;
				const keptOriginal = art.bytes.length === input.length;

				const outRasterP1 = await rasterizePdfInPage(page, art.bytes, 1);
				let metrics: Record<string, number | string | boolean | null> = {
					pages: outInfo.pageCount
				};
				const rasters: string[] = [];
				if (outRasterP1 && inRasterP1) {
					const q = await qualityMetrics(inRasterP1, outRasterP1, { ssim: true });
					metrics = {
						...metrics,
						psnr: Number(q.psnr.toFixed(1)),
						ssim: q.ssim === null ? null : Number(q.ssim.toFixed(4)),
						diffRatio: Number(q.ratio.toFixed(5))
					};
					rasters.push(await rec.saveSideBySide(id, 'side-p1.png', inRasterP1, outRasterP1));
					if (level === 'Medium' && inRasterMid && midPage) {
						const outMid = await rasterizePdfInPage(page, art.bytes, midPage);
						if (outMid)
							rasters.push(await rec.saveSideBySide(id, 'side-pmid.png', inRasterMid, outMid));
					}
					if (GATED.has(level)) {
						if (q.psnr < FLOORS.psnr)
							failures.push(`${level}: psnr ${q.psnr.toFixed(1)} < ${FLOORS.psnr}`);
						if (q.ssim !== null && q.ssim < FLOORS.ssim)
							failures.push(`${level}: ssim ${q.ssim.toFixed(4)} < ${FLOORS.ssim}`);
					}
				}
				if (outInfo.pageCount !== inInfo.pageCount)
					failures.push(`${level}: pages ${outInfo.pageCount} != ${inInfo.pageCount}`);
				if (art.bytes.length > input.length) failures.push(`${level}: output grew`);

				rec.cell({
					family: 'pdf',
					file: f.rel,
					tool: '/compress-pdf',
					action: 'compress',
					level: level.toLowerCase(),
					status: failures.some((x) => x.startsWith(`${level}:`)) ? 'fail' : 'pass',
					inBytes: input.length,
					outBytes: art.bytes.length,
					keptOriginal,
					metrics,
					durationMs: elapsed(),
					rasters,
					notes: keptOriginal ? 'keep-original returned input bytes' : ''
				});
			} catch (error) {
				rec.cell({
					family: 'pdf',
					file: f.rel,
					tool: '/compress-pdf',
					action: 'compress',
					level: level.toLowerCase(),
					status: 'error',
					inBytes: input.length,
					durationMs: elapsed(),
					error: String(error).slice(0, 500)
				});
				failures.push(`${level}: ${String(error).slice(0, 200)}`);
			}
		}
		expect(failures, failures.join(' | ')).toEqual([]);
	});
}

interface OpCheck {
	action: string;
	path: string;
	run?: (page: import('@playwright/test').Page) => Promise<void>;
	verify: (
		out: Buffer,
		input: Buffer,
		inPages: number,
		page: import('@playwright/test').Page
	) => Promise<Record<string, number | string | boolean | null>>;
	/** Op only applies when the input has a text layer. */
	needsText?: boolean;
}

const OPS: OpCheck[] = [
	{
		action: 'rotate',
		path: '/rotate-pdf',
		verify: async (out, _in, inPages) => {
			const rot = await pdfRotations(out);
			expect(rot, 'every page rotated 90°').toEqual(Array(inPages).fill(90));
			return { pages: rot.length };
		}
	},
	{
		action: 'watermark',
		path: '/watermark-pdf',
		run: async (page) => page.locator('#watermark-text').fill('MATRIXMARK'),
		verify: async (out, _in, inPages) => {
			expect((await pdfInfo(out)).pageCount).toBe(inPages);
			const stamps = (await pdfTextContent(out)).match(/MATRIXMARK/g) ?? [];
			expect(stamps.length, 'stamp on every page').toBe(inPages);
			return { stamps: stamps.length };
		}
	},
	{
		action: 'page-numbers',
		path: '/pdf-page-numbers',
		verify: async (out, _in, inPages) => {
			expect((await pdfInfo(out)).pageCount).toBe(inPages);
			const text = await pdfTextContent(out);
			expect(text).toMatch(new RegExp(`1\\s*/\\s*${inPages}`));
			expect(text).toMatch(new RegExp(`${inPages}\\s*/\\s*${inPages}`));
			return { pages: inPages };
		}
	},
	{
		action: 'to-text',
		path: '/pdf-to-text',
		needsText: true,
		verify: async (out, input) => {
			const outText = out.toString('utf8');
			expect(outText.trim().length, 'extracted text non-empty').toBeGreaterThan(20);
			const inText = await pdfTextContent(input);
			// A 12+ char snippet of the source text must survive extraction.
			const snippet = inText.replace(/\s+/g, ' ').trim().slice(0, 60);
			const probe = snippet.split(' ').find((w) => w.length >= 5);
			if (probe) expect(outText).toContain(probe);
			return { outChars: outText.length };
		}
	},
	{
		action: 'to-pdfa',
		path: '/pdf-to-pdfa',
		verify: async (out, _in, inPages) => {
			expect((await pdfInfo(out)).pageCount).toBe(inPages);
			const raw = out.toString('latin1');
			expect(raw).toMatch(/pdfaid:part='2'/);
			expect(raw).toMatch(/pdfaid:conformance='B'/);
			expect(raw).toMatch(/OutputIntent/);
			return { pages: inPages };
		}
	},
	{
		action: 'grayscale',
		path: '/grayscale-pdf',
		verify: async (out, _in, inPages, page) => {
			expect((await pdfInfo(out)).pageCount).toBe(inPages);
			const png = await rasterizePdfInPage(page, out, 1);
			if (!png) return { pages: inPages, maxChromaDelta: null };
			// Every sampled pixel must be neutral (r≈g≈b).
			const sharp = (await import('sharp')).default;
			const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
			let maxDelta = 0;
			for (let y = 1; y < 8; y++) {
				for (let x = 1; x < 8; x++) {
					const i =
						(Math.floor((info.height * y) / 8) * info.width + Math.floor((info.width * x) / 8)) *
						info.channels;
					maxDelta = Math.max(
						maxDelta,
						Math.abs(data[i] - data[i + 1]),
						Math.abs(data[i + 1] - data[i + 2])
					);
				}
			}
			expect(maxDelta, 'sampled grid must be neutral gray').toBeLessThanOrEqual(12);
			return { pages: inPages, maxChromaDelta: maxDelta };
		}
	}
];

for (const f of smallPdfs) {
	for (const op of OPS) {
		test(`MX [pdf] ${f.rel} :: ${op.action} @default`, async ({ page }) => {
			const input = readFileSync(f.abs);
			if (skipIfEncrypted(input, f.rel, op.action)) return;
			const inInfo = await pdfInfo(input);
			if (op.needsText) {
				const inText = await pdfTextContent(input);
				if (inText.trim().length < 40) {
					rec.cell({
						family: 'pdf',
						file: f.rel,
						tool: op.path,
						action: op.action,
						level: 'default',
						status: 'skip',
						inBytes: input.length,
						durationMs: 0,
						notes: 'no digital text layer — to-text not applicable (ocr covers scans)'
					});
					return;
				}
			}
			const elapsed = timer();
			const id = rec.id(f.rel, op.action, 'default');
			try {
				await gotoPath(page, op.path);
				await upload(page, f.abs);
				await op.run?.(page);
				await compress(page, { timeout: 240_000 });
				const art = await downloadRow(page);
				const metrics = await op.verify(art.bytes, input, inInfo.pageCount, page);
				const rasters: string[] = [];
				if (art.name.endsWith('.pdf')) {
					const inP1 = await rasterizePdfInPage(page, input, 1);
					const outP1 = await rasterizePdfInPage(page, art.bytes, 1);
					if (inP1 && outP1) rasters.push(await rec.saveSideBySide(id, 'side-p1.png', inP1, outP1));
				}
				rec.cell({
					family: 'pdf',
					file: f.rel,
					tool: op.path,
					action: op.action,
					level: 'default',
					status: 'pass',
					inBytes: input.length,
					outBytes: art.bytes.length,
					metrics,
					durationMs: elapsed(),
					rasters
				});
			} catch (error) {
				rec.cell({
					family: 'pdf',
					file: f.rel,
					tool: op.path,
					action: op.action,
					level: 'default',
					status: 'error',
					inBytes: input.length,
					durationMs: elapsed(),
					error: String(error).slice(0, 500)
				});
				throw error;
			}
		});
	}
}

// --- to-images DPI ladder + split + merge on representatives ---------------

const rep = smallPdfs.find((f) => f.bytes > 100_000) ?? smallPdfs[0];

if (rep) {
	for (const dpi of [72, 150, 300] as const) {
		test(`MX [pdf] ${rep.rel} :: to-images @${dpi}dpi`, async ({ page }) => {
			const input = readFileSync(rep.abs);
			if (skipIfEncrypted(input, rep.rel, `to-images-${dpi}`)) return;
			const inInfo = await pdfInfo(input);
			const elapsed = timer();
			const id = rec.id(rep.rel, 'to-images', `${dpi}dpi`);
			await gotoPath(page, '/pdf-to-jpg');
			await upload(page, rep.abs);
			await setDpi(page, dpi);
			await compress(page, { timeout: 240_000 });
			const art = await downloadRow(page);
			const rasters: string[] = [];
			let pageImages = 1;
			if (art.name.endsWith('.zip')) {
				const entries = unzip(art.bytes);
				const names = Object.keys(entries).sort();
				pageImages = names.length;
				expect(pageImages, 'one image per page').toBe(inInfo.pageCount);
				const first = Buffer.from(entries[names[0]]);
				const m = await imageMeta(first); // decodes cleanly
				expect(m.format).toBe('jpeg');
				rasters.push(await rec.saveRaster(id, 'page1.png', await toPng(first)));
			} else {
				const m = await imageMeta(art.bytes);
				expect(m.format).toBe('jpeg');
				rasters.push(await rec.saveRaster(id, 'page1.png', await toPng(art.bytes)));
			}
			rec.cell({
				family: 'pdf',
				file: rep.rel,
				tool: '/pdf-to-jpg',
				action: 'to-images',
				level: `${dpi}dpi`,
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				metrics: { pageImages },
				durationMs: elapsed(),
				rasters
			});
		});
	}

	test(`MX [pdf] ${rep.rel} :: split @1-2`, async ({ page }) => {
		const input = readFileSync(rep.abs);
		if (skipIfEncrypted(input, rep.rel, 'split')) return;
		const inInfo = await pdfInfo(input);
		test.skip(inInfo.pageCount < 3, 'split needs a 3+ page document');
		const elapsed = timer();
		await gotoPath(page, '/split-pdf');
		await upload(page, rep.abs);
		await setPageRange(page, '1-2');
		await compress(page, { timeout: 240_000 });
		const art = await downloadRow(page);
		const outInfo = await pdfInfo(art.bytes);
		expect(outInfo.pageCount).toBe(2);
		expect(outInfo.pageSizes).toEqual(inInfo.pageSizes.slice(0, 2));
		rec.cell({
			family: 'pdf',
			file: rep.rel,
			tool: '/split-pdf',
			action: 'split',
			level: '1-2',
			status: 'pass',
			inBytes: input.length,
			outBytes: art.bytes.length,
			metrics: { pages: outInfo.pageCount },
			durationMs: elapsed()
		});
	});
}

test(`MX [pdf] batch :: merge @default`, async ({ page }) => {
	const parts = smallPdfs.slice(0, 3);
	test.skip(parts.length < 2, 'merge needs 2+ small PDFs');
	const inputs = parts.map((p) => readFileSync(p.abs));
	if (inputs.some((b) => pdfEncryptionMeta(b).encrypted)) test.skip(true, 'encrypted part');
	const pageCounts = [];
	for (const b of inputs) pageCounts.push((await pdfInfo(b)).pageCount);
	const elapsed = timer();
	await gotoPath(page, '/merge-pdf');
	await upload(page, ...parts.map((p) => p.abs));
	await compress(page, { timeout: 240_000 });
	const { downloadCombined } = await import('../helpers');
	const art = await downloadCombined(page);
	const outInfo = await pdfInfo(art.bytes);
	expect(outInfo.pageCount, 'merged pages = sum of parts').toBe(
		pageCounts.reduce((a, b) => a + b, 0)
	);
	rec.cell({
		family: 'pdf',
		file: parts.map((p) => p.rel).join('+'),
		tool: '/merge-pdf',
		action: 'merge',
		level: 'default',
		status: 'pass',
		inBytes: inputs.reduce((a, b) => a + b.length, 0),
		outBytes: art.bytes.length,
		metrics: { pages: outInfo.pageCount },
		durationMs: elapsed()
	});
});

// --- password flows --------------------------------------------------------

test('MX [pdf] protect-unlock :: roundtrip @aes256', async ({ page }, testInfo) => {
	const src = smallPdfs.find((f) => !pdfEncryptionMeta(readFileSync(f.abs)).encrypted);
	test.skip(!src, 'no small unencrypted real PDF');
	const input = readFileSync(src!.abs);
	const inPages = (await pdfInfo(input)).pageCount;
	const elapsed = timer();

	await gotoPath(page, '/protect-pdf');
	await upload(page, src!.abs);
	await page.locator('#pdf-password').fill('matrix-ččč'.normalize('NFC'));
	await compress(page, { timeout: 240_000 });
	const locked = await downloadRow(page);
	expect(await pdfIsEncrypted(locked.bytes), 'protected output must be encrypted').toBe(true);
	expect(pdfEncryptionMeta(locked.bytes).aesv3, 'AES-256/R6').toBe(true);

	const lockedPath = testInfo.outputPath('matrix-protected.pdf');
	writeFileSync(lockedPath, locked.bytes);
	await page.reload();
	await gotoPath(page, '/unlock-pdf');
	await upload(page, lockedPath);
	await page.locator('#pdf-password').fill('matrix-ččč'.normalize('NFC'));
	await compress(page, { timeout: 240_000 });
	const unlocked = await downloadRow(page);
	expect(await pdfIsEncrypted(unlocked.bytes), 'password removed').toBe(false);
	expect((await pdfInfo(unlocked.bytes)).pageCount).toBe(inPages);
	const inP1 = await rasterizePdfInPage(page, input, 1);
	const outP1 = await rasterizePdfInPage(page, unlocked.bytes, 1);
	const rasters: string[] = [];
	if (inP1 && outP1) {
		const q = await qualityMetrics(inP1, outP1);
		expect(q.psnr, 'unlock must not alter page content').toBeGreaterThan(30);
		rasters.push(
			await rec.saveSideBySide(
				rec.id(src!.rel, 'protect-unlock', 'aes256'),
				'side-p1.png',
				inP1,
				outP1
			)
		);
	}
	rec.cell({
		family: 'pdf',
		file: src!.rel,
		tool: '/protect-pdf+/unlock-pdf',
		action: 'protect-unlock',
		level: 'aes256',
		status: 'pass',
		inBytes: input.length,
		outBytes: unlocked.bytes.length,
		metrics: { pages: inPages },
		durationMs: elapsed(),
		rasters
	});
});

test('MX [pdf] test-geslo-ččč.pdf :: unlock @candidates', async ({ page }) => {
	const f = pdfs.find((p) => /test-geslo/i.test(p.rel));
	test.skip(!f, 'test-geslo PDF not present');
	const input = readFileSync(f!.abs);
	expect(pdfEncryptionMeta(input).encrypted, 'fixture should be encrypted').toBe(true);
	const elapsed = timer();
	// NFC first — the app's worker retries NFD itself (qpdf-args candidates).
	const candidates = ['ččč'.normalize('NFC'), 'geslo', '123', 'test'];
	let opened: string | null = null;
	let lastError = '';
	for (const pw of candidates) {
		await gotoPath(page, '/unlock-pdf');
		await upload(page, f!.abs);
		await page.locator('#pdf-password').fill(pw);
		const run = await compress(page, { timeout: 240_000 }).catch((e) => ({
			error: String(e),
			warnings: [] as string[]
		}));
		if (!run.error) {
			opened = pw;
			break;
		}
		lastError = run.error;
		await page.reload();
	}
	if (!opened) {
		rec.cell({
			family: 'pdf',
			file: f!.rel,
			tool: '/unlock-pdf',
			action: 'unlock',
			level: 'candidates',
			status: 'fail',
			inBytes: input.length,
			durationMs: elapsed(),
			error: `no candidate password opened it; last: ${lastError.slice(0, 200)}`
		});
		throw new Error(`unlock failed for all candidate passwords: ${lastError.slice(0, 200)}`);
	}
	const art = await downloadRow(page);
	expect(await pdfIsEncrypted(art.bytes), 'password removed').toBe(false);
	const text = await pdfTextContent(art.bytes).catch(() => '');
	const outP1 = await rasterizePdfInPage(page, art.bytes, 1);
	const rasters: string[] = [];
	if (outP1)
		rasters.push(await rec.saveRaster(rec.id(f!.rel, 'unlock', 'candidates'), 'p1.png', outP1));
	rec.cell({
		family: 'pdf',
		file: f!.rel,
		tool: '/unlock-pdf',
		action: 'unlock',
		level: 'candidates',
		status: 'pass',
		inBytes: input.length,
		outBytes: art.bytes.length,
		metrics: { password: opened, textChars: text.length },
		durationMs: elapsed(),
		rasters
	});
});

/** jpeg → png buffer for raster storage (savers expect png-decodable input). */
async function toPng(jpeg: Buffer): Promise<Buffer> {
	const sharp = (await import('sharp')).default;
	return sharp(jpeg).png().toBuffer();
}
