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
			owner: signal
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
			// Plain-object snapshot — the store proxy must not cross the wire.
			pinAxes: settings.variableMode === 'static' ? { ...settings.axisValues } : null
		},
		[bytes, ...(codepoints ? [codepoints.buffer] : [])],
		undefined,
		{ owner: signal }
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
