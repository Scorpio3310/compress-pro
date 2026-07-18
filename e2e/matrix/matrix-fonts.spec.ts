/**
 * Real-file matrix — FONT family. Every routable real font (normal tier) runs
 * each applicable converter page (batched per source→target pairing), variable
 * fonts run /variable-font-to-static with an axes-actually-vary proof, two
 * representatives run /subset-font, and one TTF runs the full EOT roundtrip.
 *
 * Validation model (docs/quality-sweep-goal.md): decode the output back with
 * the node-side parsers (fontInfo — container/flavor/glyph structure), then
 * render BOTH sides with the browser's own rasterizer (font-render.ts) and
 * pixel-diff them — a lossless container change must draw the same ink. EOT
 * can't load through FontFace, so its inner sfnt (the app's own unwrap) is
 * rendered instead. The flavor rule (font.worker.ts packageSfnt): a ttf/otf
 * request follows the ACTUAL outline flavor — cff sources come back as .otf.
 *
 * Batched cells share one compress run, so per-row durationMs is cumulative
 * from the batch start (informational, not a per-file benchmark).
 *
 * Cell titles: `MX [fonts] <file> :: <action> @<level>` /
 * `MX [fonts] batch <src>-<action> gN @default` — grep one to re-run it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { unwrapEot } from '../../src/lib/codecs/eot';
import { parseFvar } from '../../src/lib/codecs/fvar';
import { expect, test } from '../fixtures';
import { compress, downloadRow, downloadRowAt, gotoPath, upload } from '../helpers';
import { fontInfo, pixelDiff, type FontFileInfo } from '../verify';
import {
	inkRatio,
	JAVANESE_SAMPLE,
	PANGRAM,
	renderFontSampleInPage,
	SHAVIAN_SAMPLE
} from './font-render';
import { MatrixRecorder, timer } from './record';
import { realByFormat, type RealFile } from './walk';

test.describe.configure({ timeout: 300_000 });

if (process.env.E2E_PREVIEW) throw new Error('matrix specs need the dev server (rasterizers)');

const rec = new MatrixRecorder('fonts');

/** Same-rasterizer render diff budget — the container change is lossless. */
const RENDER_DIFF = 0.02;
/** Below this ink ratio the sample text drew nothing (blank render). */
const INK_FLOOR = 0.02;
/** wght 300 vs 800 renders must differ at least this much (axes alive). */
const VF_VARY_MIN = 0.01;
const BATCH = 7;

type Container = 'ttf' | 'otf' | 'woff' | 'woff2' | 'eot';

const PILL: Record<Container, string> = {
	ttf: 'TTF',
	otf: 'OTF',
	woff: 'WOFF',
	woff2: 'WOFF2',
	eot: 'EOT'
};

interface ConvTarget {
	path: string;
	action: string;
	to: Container;
	/** The flavor rule makes this pairing meaningful for CFF sources only
	 *  (a glyf source would produce the identical output as the to-ttf page). */
	cffOnly?: boolean;
}

/** Converter pages per SNIFFED source container — slugs verified in seo.ts. */
const TARGETS: Record<Container, ConvTarget[]> = {
	ttf: [
		{ path: '/ttf-to-woff2', action: 'to-woff2', to: 'woff2' },
		{ path: '/ttf-to-woff', action: 'to-woff', to: 'woff' },
		{ path: '/ttf-to-eot', action: 'to-eot', to: 'eot' }
	],
	otf: [
		{ path: '/otf-to-woff2', action: 'to-woff2', to: 'woff2' },
		{ path: '/otf-to-woff', action: 'to-woff', to: 'woff' }
	],
	woff: [
		{ path: '/woff-to-ttf', action: 'to-ttf', to: 'ttf' },
		{ path: '/woff-to-otf', action: 'to-otf', to: 'otf', cffOnly: true },
		{ path: '/woff-to-woff2', action: 'to-woff2', to: 'woff2' }
	],
	woff2: [
		{ path: '/woff2-to-ttf', action: 'to-ttf', to: 'ttf' },
		{ path: '/woff2-to-otf', action: 'to-otf', to: 'otf', cffOnly: true },
		{ path: '/woff2-to-woff', action: 'to-woff', to: 'woff' }
	],
	eot: [{ path: '/eot-to-ttf', action: 'to-ttf', to: 'ttf' }]
};

const fonts = realByFormat(['font']);

function safeFontInfo(buf: Buffer): FontFileInfo | null {
	try {
		return fontInfo(buf);
	} catch {
		return null;
	}
}

// Sync parse of every real font once at module load — grouping (source
// container, CFF flavor, variable axes) must be known before tests register.
const infoByRel = new Map<string, FontFileInfo | null>(
	fonts.map((f) => [f.rel, safeFontInfo(readFileSync(f.abs))])
);

function isConvertible(info: FontFileInfo | null): info is FontFileInfo & { container: Container } {
	return !!info && info.container !== 'unknown' && info.container !== 'ttc';
}

const readable = fonts.filter((f) => isConvertible(infoByRel.get(f.rel) ?? null));
const unreadable = fonts.filter((f) => !isConvertible(infoByRel.get(f.rel) ?? null));

const bySource = new Map<Container, RealFile[]>();
for (const f of readable) {
	const container = (infoByRel.get(f.rel) as FontFileInfo).container as Container;
	bySource.set(container, [...(bySource.get(container) ?? []), f]);
}

/** Script-appropriate sample text — a latin pangram on a Javanese-only font
 *  would measure .notdef coverage, not the conversion. */
function sampleFor(rel: string): string {
	if (/javanese/i.test(rel)) return JAVANESE_SAMPLE;
	if (/shavian/i.test(rel)) return SHAVIAN_SAMPLE;
	return PANGRAM;
}

/** FontFace cannot load EOT — render the inner sfnt (the app's own unwrap). */
function renderable(buf: Buffer, container: FontFileInfo['container']): Buffer {
	return container === 'eot' ? Buffer.from(unwrapEot(new Uint8Array(buf))) : buf;
}

/** Containers the flavor rule allows for the request (worker packageSfnt). */
function expectedContainers(to: Container, flavor: 'glyf' | 'cff' | null): Container[] {
	if (to !== 'ttf' && to !== 'otf') return [to];
	if (flavor === 'cff') return ['otf'];
	if (flavor === 'glyf') return ['ttf'];
	return ['ttf', 'otf']; // eot sources sniff no flavor — the output decides
}

function outputPill(page: Page, name: string) {
	return page.getByRole('button', { name, exact: true });
}

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

const round4 = (n: number): number => Number(n.toFixed(4));

interface RenderCheck {
	failures: string[];
	metrics: Record<string, number>;
	rasters: string[];
	notes: string[];
}

/** The mangled-glyphs check: render input and output with the SAME rasterizer
 *  at the same px and pixel-diff — plus the blank-render (ink) floor. */
async function renderCompare(
	page: Page,
	id: string,
	rel: string,
	input: Buffer,
	inContainer: FontFileInfo['container'],
	output: Buffer,
	outContainer: FontFileInfo['container']
): Promise<RenderCheck> {
	const text = sampleFor(rel);
	const before = await renderFontSampleInPage(page, renderable(input, inContainer), { text });
	const after = await renderFontSampleInPage(page, renderable(output, outContainer), { text });
	const inkBefore = await inkRatio(before);
	const inkAfter = await inkRatio(after);
	const diff = await pixelDiff(before, after);
	const failures: string[] = [];
	const notes: string[] = [];
	if (diff.ratio > RENDER_DIFF)
		failures.push(`render diff ${diff.ratio.toFixed(4)} > ${RENDER_DIFF}`);
	if (inkBefore > INK_FLOOR && inkAfter <= INK_FLOOR)
		failures.push(`output renders blank (ink ${inkAfter.toFixed(4)})`);
	if (inkBefore <= INK_FLOOR)
		notes.push('source draws no ink for the sample text (icon/PUA font?) — ink floor not applied');
	const rasters = [await rec.saveSideBySide(id, 'sample-before-after.png', before, after)];
	return {
		failures,
		metrics: {
			renderDiff: round4(diff.ratio),
			inkBefore: round4(inkBefore),
			inkAfter: round4(inkAfter)
		},
		rasters,
		notes
	};
}

// --- A) conversions: batched per source→target pairing ---------------------

for (const [source, files] of bySource) {
	for (const target of TARGETS[source]) {
		const eligible = target.cffOnly
			? files.filter((f) => infoByRel.get(f.rel)?.flavor === 'cff')
			: files;
		chunk(eligible, BATCH).forEach((group, gi) => {
			test(`MX [fonts] batch ${source}-${target.action} g${gi + 1} @default`, async ({ page }) => {
				const inputs = group.map((f) => readFileSync(f.abs));
				const elapsed = timer();
				try {
					await gotoPath(page, target.path);
					await upload(page, ...group.map((f) => f.abs));
					// The page slug must preset the target pill.
					await expect(outputPill(page, PILL[target.to])).toHaveAttribute('aria-pressed', 'true');
					await compress(page, { timeout: 240_000 });
				} catch (error) {
					for (const [i, f] of group.entries()) {
						rec.cell({
							family: 'fonts',
							file: f.rel,
							tool: target.path,
							action: target.action,
							level: 'default',
							status: 'error',
							inBytes: inputs[i].length,
							durationMs: elapsed(),
							error: String(error).slice(0, 500)
						});
					}
					throw error;
				}

				const failures: string[] = [];
				for (const [i, f] of group.entries()) {
					const input = inputs[i];
					const inInfo = infoByRel.get(f.rel) as FontFileInfo;
					const id = rec.id(f.rel, target.action, 'default');
					const rowFailures: string[] = [];
					const notes: string[] = [];
					try {
						const art = await downloadRowAt(page, i);
						const outInfo = fontInfo(art.bytes); // decode-back: throws on garbage
						const keptOriginal = art.bytes.length === input.length;
						if (keptOriginal) notes.push('keep-original returned input bytes');

						const allowed = expectedContainers(target.to, inInfo.flavor);
						if (!allowed.includes(outInfo.container as Container))
							rowFailures.push(`container ${outInfo.container} not in [${allowed.join(',')}]`);
						if (inInfo.flavor && outInfo.flavor && outInfo.flavor !== inInfo.flavor)
							rowFailures.push(`flavor changed ${inInfo.flavor} -> ${outInfo.flavor}`);
						// Both sides structurally readable (woff2/eot glyph counts are
						// opaque to the node-side parser — those cells skip this check).
						if (
							inInfo.glyphCount !== null &&
							outInfo.glyphCount !== null &&
							outInfo.glyphCount !== inInfo.glyphCount
						)
							rowFailures.push(`glyphs ${inInfo.glyphCount} -> ${outInfo.glyphCount}`);
						// Row-order probe only — duplicate basenames across dirs are legal;
						// the render diff below is the real cross-file-mixup guard.
						const stem = f.name.replace(/\.[^.]+$/, '');
						const outStem = art.name.replace(/\.[^.]+$/, '');
						if (outStem !== stem) notes.push(`output stem ${outStem} != ${stem} (row-order probe)`);

						const render = await renderCompare(
							page,
							id,
							f.rel,
							input,
							inInfo.container,
							art.bytes,
							outInfo.container
						);
						rowFailures.push(...render.failures);
						notes.push(...render.notes);

						rec.cell({
							family: 'fonts',
							file: f.rel,
							tool: target.path,
							action: target.action,
							level: 'default',
							status: rowFailures.length ? 'fail' : 'pass',
							inBytes: input.length,
							outBytes: art.bytes.length,
							keptOriginal,
							metrics: {
								...render.metrics,
								container: outInfo.container,
								glyphsIn: inInfo.glyphCount,
								glyphsOut: outInfo.glyphCount
							},
							durationMs: elapsed(),
							rasters: render.rasters,
							notes: notes.join(' · ')
						});
						failures.push(...rowFailures.map((x) => `${f.name}: ${x}`));
					} catch (error) {
						rec.cell({
							family: 'fonts',
							file: f.rel,
							tool: target.path,
							action: target.action,
							level: 'default',
							status: 'error',
							inBytes: input.length,
							durationMs: elapsed(),
							error: String(error).slice(0, 500)
						});
						failures.push(`${f.name}: ${String(error).slice(0, 200)}`);
					}
				}
				expect(failures, failures.join(' | ')).toEqual([]);
			});
		});
	}
}

// --- B) variable fonts → static instance -----------------------------------

const VF_NAME = /variable|VariableFont|\[wght\]/i;
const vfFonts = readable.filter((f) => {
	const info = infoByRel.get(f.rel);
	return VF_NAME.test(f.rel) || (info?.tags?.includes('fvar') ?? false);
});

for (const f of vfFonts) {
	test(`MX [fonts] ${f.rel} :: vf-to-static @default`, async ({ page }) => {
		const input = readFileSync(f.abs);
		const inInfo = infoByRel.get(f.rel) as FontFileInfo;
		const elapsed = timer();
		const id = rec.id(f.rel, 'vf-to-static', 'default');
		try {
			// parseFvar reads raw sfnt only — every real VF here is a .ttf; a
			// wrapped VF would just skip the axis-vary proof, not the tool run.
			const isSfnt = inInfo.container === 'ttf' || inInfo.container === 'otf';
			const axes = isSfnt ? parseFvar(new Uint8Array(input)) : [];
			const wght = axes.find((a) => a.tag === 'wght');

			await gotoPath(page, '/variable-font-to-static');
			await upload(page, f.abs);
			await outputPill(page, 'TTF').click();
			await expect(outputPill(page, 'TTF')).toHaveAttribute('aria-pressed', 'true');
			await compress(page, { timeout: 240_000 });
			const art = await downloadRow(page);
			const outInfo = fontInfo(art.bytes); // decode-back
			const keptOriginal = art.bytes.length === input.length;

			const failures: string[] = [];
			const notes: string[] = [];
			const rasters: string[] = [];
			const metrics: Record<string, number | string | null> = {
				axes: axes.map((a) => a.tag).join(',') || 'none',
				container: outInfo.container,
				glyphsIn: inInfo.glyphCount,
				glyphsOut: outInfo.glyphCount
			};

			if (axes.length > 0) {
				if (!/-static\.(ttf|otf)$/.test(art.name))
					failures.push(`name ${art.name} lacks the -static suffix`);
				if (outInfo.tags?.includes('fvar')) failures.push('fvar survived instancing');
				if (outInfo.tags?.includes('gvar')) failures.push('gvar survived instancing');
				if (
					inInfo.glyphCount !== null &&
					outInfo.glyphCount !== null &&
					outInfo.glyphCount !== inInfo.glyphCount
				)
					failures.push(`glyphs ${inInfo.glyphCount} -> ${outInfo.glyphCount} (keep-all run)`);
			} else {
				// Name matched but no fvar — the honest kept-as-is path (FT-11).
				notes.push('no fvar axes — app keeps the font as-is, nothing to pin');
			}

			// Output must actually draw at its pinned default.
			const text = sampleFor(f.rel);
			const staticRender = await renderFontSampleInPage(
				page,
				renderable(art.bytes, outInfo.container),
				{ text }
			);
			const staticInk = await inkRatio(staticRender);
			metrics.staticInk = round4(staticInk);
			if (staticInk <= INK_FLOOR)
				failures.push(`static render blank (ink ${staticInk.toFixed(4)})`);
			rasters.push(await rec.saveRaster(id, 'static-default.png', staticRender));

			// Axes-actually-vary proof: the INPUT at two wght stops must differ —
			// otherwise the "variable" font never varied and pinning proves nothing.
			if (wght) {
				const lo = Math.max(wght.min, 300);
				const hi = Math.min(wght.max, 800);
				const light = await renderFontSampleInPage(page, input, {
					text,
					variation: `'wght' ${lo}`
				});
				const bold = await renderFontSampleInPage(page, input, {
					text,
					variation: `'wght' ${hi}`
				});
				const vary = await pixelDiff(light, bold);
				metrics.wghtLo = lo;
				metrics.wghtHi = hi;
				metrics.wghtVaryRatio = round4(vary.ratio);
				if (hi > lo && vary.ratio <= VF_VARY_MIN)
					failures.push(`wght ${lo} vs ${hi} render identical (${vary.ratio.toFixed(4)})`);
				rasters.push(await rec.saveSideBySide(id, `wght-${lo}-vs-${hi}.png`, light, bold));
			} else if (axes.length > 0) {
				notes.push(`no wght axis (axes: ${axes.map((a) => a.tag).join(',')}) — vary proof skipped`);
			}

			rec.cell({
				family: 'fonts',
				file: f.rel,
				tool: '/variable-font-to-static',
				action: 'vf-to-static',
				level: 'default',
				status: failures.length ? 'fail' : 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				keptOriginal,
				metrics,
				durationMs: elapsed(),
				rasters,
				notes: notes.join(' · ')
			});
			expect(failures, failures.join(' | ')).toEqual([]);
		} catch (error) {
			rec.cell({
				family: 'fonts',
				file: f.rel,
				tool: '/variable-font-to-static',
				action: 'vf-to-static',
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

// --- C) subset (Basic Latin preset) on one TTF + one OTF representative ----

/** Static (non-VF) representative — instancing must not blur the subset cell. */
function subsetRep(container: Container): RealFile | null {
	const candidates = (bySource.get(container) ?? []).filter((f) => {
		const info = infoByRel.get(f.rel);
		return !VF_NAME.test(f.rel) && !info?.tags?.includes('fvar');
	});
	// Prefer plain-latin fonts — a script font would subset away its own sample.
	return candidates.find((f) => !/javanese|shavian/i.test(f.rel)) ?? candidates[0] ?? null;
}

for (const container of ['ttf', 'otf'] as const) {
	const f = subsetRep(container);
	test(`MX [fonts] ${f?.rel ?? `no-${container}`} :: subset @basic-latin`, async ({ page }) => {
		test.skip(!f, `no static real .${container} available`);
		const input = readFileSync(f!.abs);
		const inInfo = infoByRel.get(f!.rel) as FontFileInfo;
		const elapsed = timer();
		const id = rec.id(f!.rel, 'subset', 'basic-latin');
		try {
			await gotoPath(page, '/subset-font');
			await upload(page, f!.abs);
			// Arrival state: Subset op with Basic Latin preselected (FT-10).
			await expect(outputPill(page, 'Basic Latin')).toHaveAttribute('aria-pressed', 'true');
			await outputPill(page, PILL[container]).click();
			await expect(outputPill(page, PILL[container])).toHaveAttribute('aria-pressed', 'true');
			if (inInfo.flavor === 'cff') {
				// hb-subset cannot process CFF outlines (fonts-phase2 memory) — the
				// CONTRACT here is the honest refusal, not a subset.
				const run = await compress(page, { expectError: true, timeout: 240_000 });
				const honest = /CFF|PostScript/i.test(run.error ?? '');
				rec.cell({
					family: 'fonts',
					file: f!.rel,
					tool: '/subset-font',
					action: 'subset',
					level: 'basic-latin',
					status: honest ? 'pass' : 'fail',
					inBytes: input.length,
					durationMs: elapsed(),
					notes: `CFF refusal contract: ${String(run.error).slice(0, 120)}`
				});
				expect(honest, `honest CFF refusal, got: ${run.error}`).toBe(true);
				return;
			}
			await compress(page, { timeout: 240_000 });
			const art = await downloadRow(page);
			const outInfo = fontInfo(art.bytes); // decode-back

			const failures: string[] = [];
			if (!/-subset\./.test(art.name)) failures.push(`name ${art.name} lacks -subset suffix`);
			if (outInfo.container !== container)
				failures.push(`container ${outInfo.container} != ${container}`);
			if (inInfo.glyphCount === null || outInfo.glyphCount === null)
				failures.push('glyph counts unreadable — cannot prove the subset');
			else if (outInfo.glyphCount >= inInfo.glyphCount)
				failures.push(`glyphs not reduced: ${inInfo.glyphCount} -> ${outInfo.glyphCount}`);

			// Kept characters must still render EXACTLY as before the subset.
			const render = await renderCompare(
				page,
				id,
				f!.rel,
				input,
				inInfo.container,
				art.bytes,
				outInfo.container
			);
			failures.push(...render.failures);
			// The pangram sits inside Basic Latin — a blank render here is damage
			// even when the source ink was low; assert the floor unconditionally.
			if (render.metrics.inkAfter <= INK_FLOOR)
				failures.push(`subset render blank (ink ${render.metrics.inkAfter})`);

			rec.cell({
				family: 'fonts',
				file: f!.rel,
				tool: '/subset-font',
				action: 'subset',
				level: 'basic-latin',
				status: failures.length ? 'fail' : 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				keptOriginal: art.bytes.length === input.length,
				metrics: {
					...render.metrics,
					glyphsIn: inInfo.glyphCount,
					glyphsOut: outInfo.glyphCount
				},
				durationMs: elapsed(),
				rasters: render.rasters,
				notes: render.notes.join(' · ')
			});
			expect(failures, failures.join(' | ')).toEqual([]);
		} catch (error) {
			rec.cell({
				family: 'fonts',
				file: f!.rel,
				tool: '/subset-font',
				action: 'subset',
				level: 'basic-latin',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}

// --- D) EOT roundtrip: ttf → /ttf-to-eot → /eot-to-ttf ---------------------

{
	const f = subsetRep('ttf');
	test(`MX [fonts] ${f?.rel ?? 'no-ttf'} :: eot-roundtrip @default`, async ({ page }, testInfo) => {
		test.skip(!f, 'no static real .ttf available');
		const input = readFileSync(f!.abs);
		const inInfo = infoByRel.get(f!.rel) as FontFileInfo;
		const elapsed = timer();
		const id = rec.id(f!.rel, 'eot-roundtrip', 'default');
		try {
			await gotoPath(page, '/ttf-to-eot');
			await upload(page, f!.abs);
			await compress(page, { timeout: 240_000 });
			const eotArt = await downloadRow(page);
			const eotInfo = fontInfo(eotArt.bytes);
			const failures: string[] = [];
			if (eotInfo.container !== 'eot') failures.push(`leg 1 container ${eotInfo.container}`);
			// The wrapper is prepended metadata — the inner sfnt must survive whole.
			const innerInfo = fontInfo(Buffer.from(unwrapEot(new Uint8Array(eotArt.bytes))));
			if (innerInfo.glyphCount !== inInfo.glyphCount)
				failures.push(`inner glyphs ${innerInfo.glyphCount} != ${inInfo.glyphCount}`);

			const tmp = testInfo.outputPath('matrix-roundtrip.eot');
			writeFileSync(tmp, eotArt.bytes);
			await gotoPath(page, '/eot-to-ttf');
			await upload(page, tmp);
			await compress(page, { timeout: 240_000 });
			const backArt = await downloadRow(page);
			const backInfo = fontInfo(backArt.bytes); // decode-back
			if (backInfo.container !== 'ttf') failures.push(`leg 2 container ${backInfo.container}`);
			if (backInfo.glyphCount !== inInfo.glyphCount)
				failures.push(`roundtrip glyphs ${backInfo.glyphCount} != ${inInfo.glyphCount}`);

			// Full-circle render: the roundtripped ttf vs the original source.
			const render = await renderCompare(
				page,
				id,
				f!.rel,
				input,
				inInfo.container,
				backArt.bytes,
				backInfo.container
			);
			failures.push(...render.failures);

			rec.cell({
				family: 'fonts',
				file: f!.rel,
				tool: '/ttf-to-eot+/eot-to-ttf',
				action: 'eot-roundtrip',
				level: 'default',
				status: failures.length ? 'fail' : 'pass',
				inBytes: input.length,
				outBytes: backArt.bytes.length,
				metrics: {
					...render.metrics,
					eotBytes: eotArt.bytes.length,
					glyphsIn: inInfo.glyphCount,
					glyphsBack: backInfo.glyphCount
				},
				durationMs: elapsed(),
				rasters: render.rasters,
				notes: render.notes.join(' · ')
			});
			expect(failures, failures.join(' | ')).toEqual([]);
		} catch (error) {
			rec.cell({
				family: 'fonts',
				file: f!.rel,
				tool: '/ttf-to-eot+/eot-to-ttf',
				action: 'eot-roundtrip',
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

// --- E) fonts the node-side parser rejects: honest outcome either way ------

for (const f of unreadable) {
	test(`MX [fonts] ${f.rel} :: convert-error @default`, async ({ page }) => {
		const input = readFileSync(f.abs);
		const elapsed = timer();
		try {
			await gotoPath(page, '/font-converter');
			await upload(page, f.abs);
			// The app's parser is the authority: it must either convert what our
			// node-side sniff rejected, or show the honest banner — never hang.
			let honest: string | null = null;
			try {
				await compress(page, { timeout: 240_000 });
			} catch (error) {
				const msg = String(error);
				if (!/unexpected error banner/.test(msg)) throw error;
				honest = msg;
			}
			rec.cell({
				family: 'fonts',
				file: f.rel,
				tool: '/font-converter',
				action: 'convert-error',
				level: 'default',
				status: 'pass',
				inBytes: input.length,
				durationMs: elapsed(),
				notes: honest
					? `honest error: ${honest.slice(0, 200)}`
					: 'app converted a file the node-side sniff rejected'
			});
		} catch (error) {
			rec.cell({
				family: 'fonts',
				file: f.rel,
				tool: '/font-converter',
				action: 'convert-error',
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
