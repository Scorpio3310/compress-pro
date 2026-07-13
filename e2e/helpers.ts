/**
 * Browser-side driving recipes. Selector contract with the app:
 * - the single hidden `input[type=file]` (setInputFiles works on hidden inputs)
 * - control ids: #quality, #target-size-kb, #max-dimension, #page-range,
 *   #target-size (MB), #image-quality, #precision; range inputs live inside
 *   a `[data-slider]` root (Slider.svelte) that also holds the value readout
 * - SegmentedControl buttons carry data-seg + aria-pressed; nav tabs are
 *   `a[data-seg]` (tag disambiguates)
 * - pills (output format, PDF level/op) are role=button with exact text
 * - data-testids added for tests: compress-cta, error-banner, file-row,
 *   row-warning, combined-result, savings-summary, advanced-toggle
 * - secondary controls (max dimension, keep metadata, fps, SVG options) sit in
 *   a collapsed "Advanced options" disclosure — openAdvanced() expands it; the
 *   collapsed content stays mounted, so value/count assertions work unopened
 */
import { expect, type Download, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export type Tab =
	'jpg' | 'png' | 'webp' | 'gif' | 'heic' | 'svg' | 'pdf' | 'video' | 'audio' | 'zip' | 'exif';
export type OutputPill = 'JPG' | 'PNG' | 'WebP' | 'GIF' | 'AVIF' | 'ICO' | 'SVG';

/** Navigate to any app path (format tab or converter page) and await hydration. */
export async function gotoPath(page: Page, path: string): Promise<void> {
	// Belt-and-suspenders: the config's use.reducedMotion has not reliably
	// reached matchMedia in this setup; the app tweens numbers when motion is OK,
	// and tests must read settled values.
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto(path);
	// The page is prerendered: the file input exists before hydration, but its
	// change handler doesn't. The tab bar's slideIndicator attachment stamps
	// `data-ready` on mount — only after hydration — so wait for that.
	await page.locator('[data-ready]').first().waitFor({ state: 'attached' });
	await page.locator('input[type=file]').waitFor({ state: 'attached' });
}

// jpg goes to /compress-jpg, NOT '/': the home route is the universal intake
// (any type routes to its tool), while tests rely on converter semantics
// (a PNG uploaded on the jpg tab parks there and converts).
export async function gotoTab(page: Page, tab: Tab): Promise<void> {
	await gotoPath(
		page,
		tab === 'exif' ? '/remove-exif' : tab === 'zip' ? '/zip-files' : `/compress-${tab}`
	);
}

export function rows(page: Page): Locator {
	return page.getByTestId('file-row');
}

/** Row lookup by a distinctive filename substring (extension may change). */
export function rowByName(page: Page, nameFragment: string): Locator {
	return rows(page).filter({ hasText: nameFragment });
}

export async function upload(page: Page, ...paths: string[]): Promise<void> {
	const before = await rows(page).count();
	await page.locator('input[type=file]').setInputFiles(paths);
	await expect(rows(page)).toHaveCount(before + paths.length);
}

// ------------------------------------------------------------------ settings

/** Set a range input through Svelte's bind:value (fill() rejects type=range). */
async function setRange(page: Page, selector: string, value: number, echo?: string): Promise<void> {
	const slider = page.locator(selector);
	await slider.evaluate((el, v) => {
		const input = el as HTMLInputElement;
		input.value = String(v);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}, value);
	// Binding canary: the visible value label must echo the new value.
	await expect(
		slider.locator('xpath=ancestor::div[@data-slider][1]').getByText(echo ?? `${value}%`)
	).toBeVisible();
}

export async function setQuality(page: Page, value: number): Promise<void> {
	await setRange(page, '#quality', value);
}

export async function setPdfImageQuality(page: Page, value: number): Promise<void> {
	await setRange(page, '#image-quality', value);
}

export async function setSvgPrecision(page: Page, value: number): Promise<void> {
	await setRange(page, '#precision', value, `${value} decimals`);
}

/** Expand the "Advanced options" disclosure (no-op on tabs without one). */
export async function openAdvanced(page: Page): Promise<void> {
	const btn = page.getByTestId('advanced-toggle');
	if ((await btn.count()) === 0) return;
	if ((await btn.getAttribute('aria-expanded')) === 'true') return;
	await btn.click();
	await expect(btn).toHaveAttribute('aria-expanded', 'true');
}

async function setSeg(page: Page, id: string): Promise<void> {
	const btn = page.locator(`button[data-seg="${id}"]`);
	await btn.click();
	await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

async function setPill(page: Page, name: string): Promise<void> {
	const btn = page.getByRole('button', { name, exact: true });
	await btn.click();
	await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

export async function setMode(page: Page, mode: 'quality' | 'target'): Promise<void> {
	await setSeg(page, mode);
}

export async function setOutputFormat(page: Page, pill: OutputPill): Promise<void> {
	await setPill(page, pill);
}

export async function setTargetKb(page: Page, kb: number): Promise<void> {
	await setMode(page, 'target');
	await page.locator('#target-size-kb').fill(String(kb));
}

export async function setMaxDimension(page: Page, px: number | null): Promise<void> {
	await openAdvanced(page);
	await page.locator('#max-dimension').fill(px === null ? '' : String(px));
}

export async function setPdfOp(
	page: Page,
	op: 'Compress' | 'Merge' | 'Pages' | 'To images' | 'From images' | 'Unlock' | 'Protect'
): Promise<void> {
	await setPill(page, op);
}

export async function setPdfLevel(
	page: Page,
	level: 'Low' | 'Medium' | 'High' | 'Ultra' | 'Extreme'
): Promise<void> {
	await setPill(page, level);
}

export async function setPdfMode(page: Page, mode: 'level' | 'target'): Promise<void> {
	await setSeg(page, mode);
}

export async function setTargetMb(page: Page, mb: number): Promise<void> {
	await setPdfMode(page, 'target');
	await page.locator('#target-size').fill(String(mb));
}

export async function setPageRange(page: Page, range: string): Promise<void> {
	await page.locator('#page-range').fill(range);
}

export async function setPageMode(page: Page, mode: 'keep' | 'remove'): Promise<void> {
	await setSeg(page, mode);
}

export async function setDpi(page: Page, dpi: 72 | 150 | 300): Promise<void> {
	await setSeg(page, String(dpi));
}

export async function setPdfImageFormat(page: Page, fmt: 'jpg' | 'png'): Promise<void> {
	await setSeg(page, fmt);
}

/** Labeled switch toggles (SVG options, "Keep metadata", "Compress after
 *  merging"). Some live behind the Advanced disclosure — opening it first is
 *  a no-op for the primary-area ones. */
export async function toggle(page: Page, label: string, on: boolean): Promise<void> {
	await openAdvanced(page);
	await page.getByLabel(label).setChecked(on);
}

export async function setContainer(
	page: Page,
	container: 'mp4' | 'webm' | 'mov' | 'gif'
): Promise<void> {
	await setSeg(page, container);
}

export async function setFps(page: Page, fps: 'original' | 60 | 30 | 15 | 10 | 5): Promise<void> {
	await openAdvanced(page);
	await setSeg(page, String(fps));
}

// ----------------------------------------------------------------- compress

export interface RunResult {
	error: string | null;
	warnings: string[];
}

/**
 * Click the CTA and wait for the run to fully finish: some terminal signal
 * (result row / combined block / error banner) plus the CTA re-enabling
 * (multi-file runs re-enable only after the LAST file).
 */
export async function compress(
	page: Page,
	opts: { expectError?: boolean; timeout?: number } = {}
): Promise<RunResult> {
	const { expectError = false, timeout = 60_000 } = opts;
	const cta = page.getByTestId('compress-cta');
	await expect(cta).toBeEnabled();
	await cta.click();

	const banner = page.getByTestId('error-banner');
	const firstDownload = rows(page).getByRole('button', { name: 'Download' }).first();
	const combined = page.getByTestId('combined-result');
	const winner = await Promise.race([
		banner
			.waitFor({ state: 'visible', timeout })
			.then(() => 'error' as const)
			.catch(() => null),
		firstDownload
			.waitFor({ state: 'visible', timeout })
			.then(() => 'result' as const)
			.catch(() => null),
		combined
			.waitFor({ state: 'visible', timeout })
			.then(() => 'combined' as const)
			.catch(() => null)
	]);
	if (winner === null) throw new Error('compress(): neither results nor an error appeared in time');
	await expect(cta).toBeEnabled({ timeout });

	const error = (await banner.isVisible()) ? ((await banner.textContent()) ?? '').trim() : null;
	if (!expectError && error) throw new Error(`compress(): unexpected error banner: ${error}`);
	if (expectError && !error) throw new Error('compress(): expected an error banner, none shown');
	const warnings = (await page.getByTestId('row-warning').allTextContents()).map((w) => w.trim());
	return { error, warnings };
}

export async function cancelRun(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
}

// ---------------------------------------------------------------- downloads

export interface Artifact {
	name: string;
	bytes: Buffer;
}

async function grab(download: Download): Promise<Artifact> {
	const path = await download.path();
	return { name: download.suggestedFilename(), bytes: readFileSync(path) };
}

/** Download one result row (first row when no name given). */
export async function downloadRow(page: Page, nameFragment?: string): Promise<Artifact> {
	const row = nameFragment ? rowByName(page, nameFragment) : rows(page).first();
	const wait = page.waitForEvent('download');
	await row.getByRole('button', { name: 'Download' }).click();
	return grab(await wait);
}

/** Download a result row by list position (duplicate filenames make names ambiguous). */
export async function downloadRowAt(page: Page, index: number): Promise<Artifact> {
	const wait = page.waitForEvent('download');
	await rows(page).nth(index).getByRole('button', { name: 'Download' }).click();
	return grab(await wait);
}

/** Download the combined output (merge / images→PDF). */
export async function downloadCombined(page: Page): Promise<Artifact> {
	const wait = page.waitForEvent('download');
	await page.getByTestId('combined-result').getByRole('button', { name: 'Download' }).click();
	return grab(await wait);
}

export async function downloadAllZip(page: Page): Promise<Artifact> {
	const wait = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download All as ZIP' }).click();
	return grab(await wait);
}

// ------------------------------------------------------------------ various

/** Dispatch a window-level drop (exercises routeIncomingFiles / tab routing). */
export async function dropFiles(
	page: Page,
	files: { path: string; mimeType: string; name?: string }[]
): Promise<void> {
	const payload = files.map((f) => ({
		name: f.name ?? basename(f.path),
		mimeType: f.mimeType,
		base64: readFileSync(f.path).toString('base64')
	}));
	await page.evaluate(async (items) => {
		const dt = new DataTransfer();
		for (const it of items) {
			const res = await fetch(`data:${it.mimeType};base64,${it.base64}`);
			const blob = await res.blob();
			dt.items.add(new File([blob], it.name, { type: it.mimeType }));
		}
		window.dispatchEvent(
			new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })
		);
	}, payload);
}

/** Dispatch a drop ON the per-tab dropzone (exercises shouldPark/onforeign). */
export async function dropOnZone(
	page: Page,
	files: { path: string; mimeType: string; name?: string }[]
): Promise<void> {
	const payload = files.map((f) => ({
		name: f.name ?? basename(f.path),
		mimeType: f.mimeType,
		base64: readFileSync(f.path).toString('base64')
	}));
	await page.evaluate(async (items) => {
		const dt = new DataTransfer();
		for (const it of items) {
			const res = await fetch(`data:${it.mimeType};base64,${it.base64}`);
			const blob = await res.blob();
			dt.items.add(new File([blob], it.name, { type: it.mimeType }));
		}
		const zone = document.querySelector('[data-testid="dropzone"]');
		if (!zone) throw new Error('dropzone not found');
		zone.dispatchEvent(
			new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })
		);
	}, payload);
}

/**
 * Rasterize a PDF page inside the app page using the app's own pdfjs setup
 * (dev-server only — /src/* module URLs don't exist in the built app).
 * Returns a PNG buffer, or null under E2E_PREVIEW so callers can self-skip.
 */
export async function rasterizePdfInPage(
	page: Page,
	pdfBytes: Buffer,
	pageNum: number
): Promise<Buffer | null> {
	if (process.env.E2E_PREVIEW) return null;
	const base64 = await page.evaluate(
		async (args: { b64: string; pageNum: number }) => {
			// Indirect import so the test transpiler leaves the specifier alone.
			const load = new Function('p', 'return import(p)') as (p: string) => Promise<{
				openPdfPreview(
					source: Blob,
					maxWidth?: number
				): Promise<{
					numPages: number;
					renderPage(n: number): Promise<string>;
					destroy(): Promise<void>;
				}>;
			}>;
			const mod = await load('/src/lib/pdf-preview.ts');
			const blob = await (await fetch(`data:application/pdf;base64,${args.b64}`)).blob();
			const handle = await mod.openPdfPreview(blob, 1600);
			const url = await handle.renderPage(args.pageNum);
			const png = await (await fetch(url)).arrayBuffer();
			URL.revokeObjectURL(url);
			await handle.destroy();
			const arr = new Uint8Array(png);
			let s = '';
			for (let i = 0; i < arr.length; i += 32768) {
				s += String.fromCharCode(...arr.subarray(i, i + 32768));
			}
			return btoa(s);
		},
		{ b64: pdfBytes.toString('base64'), pageNum }
	);
	return Buffer.from(base64, 'base64');
}

/**
 * Grab N frames of an encoded video as PNGs via <video> + canvas — pure DOM,
 * works in dev and preview alike. One load, sequential seeks (order preserved).
 * Sample at x.5-second timestamps: band changes and likely keyframes sit on
 * integer seconds, and a re-seek to an identical currentTime never fires
 * `seeked` — distinct timestamps only.
 */
export async function rasterizeVideoFramesInPage(
	page: Page,
	videoBytes: Buffer,
	mimeType: string,
	atSecs: number[]
): Promise<Buffer[]> {
	const base64s = await page.evaluate(
		async (args: { b64: string; mimeType: string; atSecs: number[] }) => {
			const blob = await (await fetch(`data:${args.mimeType};base64,${args.b64}`)).blob();
			const url = URL.createObjectURL(blob);
			try {
				const video = document.createElement('video');
				video.muted = true;
				video.src = url;
				await new Promise<void>((ok, err) => {
					video.onloadedmetadata = () => ok();
					video.onerror = () => err(new Error('video failed to load'));
				});
				const canvas = document.createElement('canvas');
				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;
				const ctx = canvas.getContext('2d')!;
				const frames: string[] = [];
				for (const atSec of args.atSecs) {
					video.currentTime = Math.min(atSec, Math.max(0, video.duration - 0.05));
					await new Promise<void>((ok) => (video.onseeked = () => ok()));
					ctx.drawImage(video, 0, 0);
					frames.push(canvas.toDataURL('image/png').split(',')[1]);
				}
				return frames;
			} finally {
				URL.revokeObjectURL(url);
			}
		},
		{ b64: videoBytes.toString('base64'), mimeType, atSecs }
	);
	return base64s.map((b64) => Buffer.from(b64, 'base64'));
}

/** Single-frame convenience wrapper around rasterizeVideoFramesInPage. */
export async function rasterizeVideoFrameInPage(
	page: Page,
	videoBytes: Buffer,
	mimeType: string,
	atSec: number
): Promise<Buffer> {
	const [frame] = await rasterizeVideoFramesInPage(page, videoBytes, mimeType, [atSec]);
	return frame;
}

export interface AudioChannelMetrics {
	/** over the trimmed analysis window, linear */
	rms: number;
	peak: number;
	/** probe Hz (stringified) → estimated tone amplitude (≈ the sine's amp) */
	freqAmp: Record<string, number>;
}

export interface AudioMetrics {
	durationSec: number;
	/** decode-context rate (fixed 48 kHz — decodeAudioData resamples to it;
	 *  the CONTAINER sample rate stays asserted via verify.ts audioInfo) */
	sampleRate: number;
	channelCount: number;
	channels: AudioChannelMetrics[];
	/** per channel: the probe frequency with the highest amplitude */
	dominantHz: number[];
}

/**
 * Decode an encoded audio file IN the test browser (OfflineAudioContext —
 * node has no mp3/aac/opus decoder) and measure per-channel RMS, peak and
 * Hann-windowed Goertzel amplitude at each probe frequency. A 0.4-amp sine
 * reads back as ≈0.4. `trimSec` (default 0.25 s) excludes encoder
 * ramp/priming at both ends. Resampling to 48 kHz preserves tones, RMS and
 * duration, and keeps the Goertzel math container-independent.
 */
export async function audioMetricsInPage(
	page: Page,
	audioBytes: Buffer,
	mimeType: string,
	opts: { probeHz: number[]; trimSec?: number }
): Promise<AudioMetrics> {
	return page.evaluate(
		async (args: { b64: string; mimeType: string; probeHz: number[]; trimSec: number }) => {
			const bytes = await (await fetch(`data:${args.mimeType};base64,${args.b64}`)).arrayBuffer();
			const ctx = new OfflineAudioContext(1, 1, 48_000);
			const buf = await ctx.decodeAudioData(bytes);

			// Goertzel single-bin DFT with a Hann window: with a ~2.5 s window the
			// leakage at a probe 100+ Hz away is < -60 dB, so non-integer tone
			// frequencies (554.37) need no special handling. The Hann-weighted
			// signal is precomputed once per channel — real-file specs sweep 15
			// probes over multi-minute audio, where a per-probe window dominates.
			const hannWeigh = (x: Float32Array): { xw: Float32Array; winSum: number } => {
				const n = x.length;
				const xw = new Float32Array(n);
				let winSum = 0;
				for (let i = 0; i < n; i++) {
					const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
					winSum += hann;
					xw[i] = x[i] * hann;
				}
				return { xw, winSum };
			};
			const goertzelAmp = (
				xw: Float32Array,
				winSum: number,
				sampleRate: number,
				freq: number
			): number => {
				const w = (2 * Math.PI * freq) / sampleRate;
				const coeff = 2 * Math.cos(w);
				let s1 = 0;
				let s2 = 0;
				for (let i = 0; i < xw.length; i++) {
					const s0 = xw[i] + coeff * s1 - s2;
					s2 = s1;
					s1 = s0;
				}
				const re = s1 - s2 * Math.cos(w);
				const im = s2 * Math.sin(w);
				return (2 * Math.hypot(re, im)) / winSum;
			};

			const from = Math.min(Math.round(args.trimSec * buf.sampleRate), buf.length);
			const to = Math.max(from, buf.length - from);
			const channels: { rms: number; peak: number; freqAmp: Record<string, number> }[] = [];
			const dominantHz: number[] = [];
			for (let c = 0; c < buf.numberOfChannels; c++) {
				const x = buf.getChannelData(c).subarray(from, to);
				let sum = 0;
				let peak = 0;
				for (let i = 0; i < x.length; i++) {
					sum += x[i] * x[i];
					const a = Math.abs(x[i]);
					if (a > peak) peak = a;
				}
				const { xw, winSum } = hannWeigh(x);
				const freqAmp: Record<string, number> = {};
				let bestHz = args.probeHz[0] ?? 0;
				for (const hz of args.probeHz) {
					const amp = goertzelAmp(xw, winSum, buf.sampleRate, hz);
					freqAmp[String(hz)] = amp;
					if (amp > (freqAmp[String(bestHz)] ?? 0)) bestHz = hz;
				}
				channels.push({ rms: Math.sqrt(sum / Math.max(1, x.length)), peak, freqAmp });
				dominantHz.push(bestHz);
			}
			return {
				durationSec: buf.duration,
				sampleRate: buf.sampleRate,
				channelCount: buf.numberOfChannels,
				channels,
				dominantHz
			};
		},
		{
			b64: audioBytes.toString('base64'),
			mimeType,
			probeHz: opts.probeHz,
			trimSec: opts.trimSec ?? 0.25
		}
	);
}

/** Click an audio bitrate pill (plain aria-pressed buttons labelled by the number). */
export async function setAudioBitrate(
	page: Page,
	kbps: 320 | 256 | 192 | 128 | 96 | 64
): Promise<void> {
	const pill = page.getByRole('button', { name: String(kbps), exact: true });
	await pill.click();
	await expect(pill).toHaveAttribute('aria-pressed', 'true');
}

export interface Stats {
	totalSaved: string;
	reduction: string;
	files: number;
}

export async function readStats(page: Page): Promise<Stats> {
	const summary = page.getByTestId('savings-summary');
	await summary.waitFor({ state: 'visible' });
	const stat = (name: string) => summary.locator(`[data-stat="${name}"]`);
	return {
		totalSaved: ((await stat('total').textContent()) ?? '').trim(),
		reduction: ((await stat('reduction').textContent()) ?? '').trim(),
		files: Number(((await stat('files').textContent()) ?? '').trim())
	};
}
