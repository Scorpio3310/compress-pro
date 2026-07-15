import type { FontConversionSettings, FontFormat } from '$lib/types';
import { callWorker } from '$lib/workers/rpc';
import { collectCodepoints } from './subset-charsets';

const FONT_MIME: Record<FontFormat, string> = {
	ttf: 'font/ttf',
	otf: 'font/otf',
	woff: 'font/woff',
	woff2: 'font/woff2',
	eot: 'application/vnd.ms-fontobject'
};

/** Matches IDLE_TIMEOUT_MS.font in rpc.ts — the no-progress default. */
export const FONT_IDLE_FLOOR_MS = 10 * 60_000;
export const FONT_IDLE_CEIL_MS = 60 * 60_000;
// WOFF2 encode is synchronous brotli-q11 with NO progress signal — the whole
// job is one silent window. Dev-machine wasm throughput is ≥100 KB/s, but a
// low-end phone runs wasm 3-5x slower and a killed healthy encode loses the
// user's work while a late-detected stuck one only costs patience (Cancel
// exists). Budget at 12.5 KB/s (8x dev margin) — same philosophy as
// sevenzip-args' archiveIdleTimeoutMs.
const WORST_CASE_BYTES_PER_MS = (12.5 * 1024) / 1000;

/** No-progress watchdog window for font convert/subset, scaled to the input
 *  size — a 20 MB+ CJK font's legitimate multi-minute encode must not be
 *  killed as "stuck" by the 10-minute kind default. */
export function fontIdleTimeoutMs(totalBytes: number): number {
	return Math.min(
		FONT_IDLE_CEIL_MS,
		Math.max(FONT_IDLE_FLOOR_MS, Math.ceil(totalBytes / WORST_CASE_BYTES_PER_MS))
	);
}

/** A cleared axis <input type="number"> binds `null` (Svelte's empty-string →
 *  null rule), which would cross the wire, coerce to 0 at the wasm boundary
 *  and get clamped to the axis MINIMUM (wght 100 instead of 400). Dropping
 *  non-finite entries lets hb's pin_all_axes_to_default supply the fvar
 *  default for that axis instead. */
export function finiteAxisValues(axisValues: Record<string, number>): Record<string, number> {
	return Object.fromEntries(
		Object.entries(axisValues).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
	);
}

export interface FontOutput {
	blob: Blob;
	/** Container actually written (the flavor rule can override the request). */
	outputFormat: FontFormat;
	/** Real (sniffed) source differs from output — gates the keep-original guard. */
	formatChanged: boolean;
	/** Content changed (glyphs dropped, axes pinned, hinting stripped) — the
	 *  keep-original guard must not hand the untouched source back then. */
	transformed: boolean;
	/** Stem suffix for the output name ('-subset' / '-static' / ''). */
	nameSuffix: string;
	info: string | null;
}

/** One font through the font worker — all heavy lifting (wasm included) lives there. */
export async function convertFont(
	file: File,
	settings: FontConversionSettings,
	signal?: AbortSignal
): Promise<FontOutput> {
	const bytes = await file.arrayBuffer();
	const out = await callWorker(
		'font',
		'convert',
		{ bytes, to: settings.outputFormat },
		[bytes],
		undefined,
		{
			owner: signal,
			idleTimeoutMs: fontIdleTimeoutMs(file.size)
		}
	);
	return {
		blob: new Blob([out.bytes], { type: FONT_MIME[out.outputFormat] }),
		outputFormat: out.outputFormat,
		formatChanged: out.outputFormat !== out.sourceFormat,
		transformed: false,
		nameSuffix: '',
		info: out.note
	};
}

/** Subset op: charset restriction and/or variable-axis pinning, then the
 *  same container packaging the convert op uses. */
export async function subsetFont(
	file: File,
	settings: FontConversionSettings,
	signal?: AbortSignal
): Promise<FontOutput> {
	const bytes = await file.arrayBuffer();
	const codepoints = collectCodepoints(settings.subsetPresets, settings.subsetText);
	const out = await callWorker(
		'font',
		'subset',
		{
			bytes,
			to: settings.outputFormat,
			codepoints,
			keepHinting: settings.keepHinting,
			// Fresh plain-object snapshot (the store proxy must not cross the
			// wire), with cleared/NaN inputs dropped — see finiteAxisValues.
			pinAxes: settings.variableMode === 'static' ? finiteAxisValues(settings.axisValues) : null
		},
		[bytes, ...(codepoints ? [codepoints.buffer] : [])],
		undefined,
		{ owner: signal, idleTimeoutMs: fontIdleTimeoutMs(file.size) }
	);
	const glyphs =
		out.glyphsBefore !== null && out.glyphsAfter !== null && out.glyphsAfter !== out.glyphsBefore
			? `Glyphs: ${out.glyphsBefore.toLocaleString('en-US')} → ${out.glyphsAfter.toLocaleString('en-US')}`
			: null;
	const subsetted = out.glyphsAfter !== null && out.glyphsAfter !== out.glyphsBefore;
	return {
		blob: new Blob([out.bytes], { type: FONT_MIME[out.outputFormat] }),
		outputFormat: out.outputFormat,
		formatChanged: out.outputFormat !== out.sourceFormat,
		transformed: subsetted || out.instanced || !settings.keepHinting,
		// Charset restriction wins the name; a pure instance run reads -static.
		nameSuffix: codepoints ? '-subset' : out.instanced ? '-static' : '',
		info: [glyphs, out.note].filter(Boolean).join(' · ') || null
	};
}
