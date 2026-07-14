import type { PdfCompressionSettings, PdfLevel } from '$lib/types';
import { callWorker } from '$lib/workers/rpc';
import { searchTargetSize, targetNotReachableWarning } from './target-search';

export interface PdfProgress {
	/** 1-based attempt counter (target-size mode only). */
	attempt?: number;
	attemptMax?: number;
	/** Size of the last finished attempt (target-size mode only). */
	lastSize?: number;
	page?: number;
	pageCount?: number | null;
}

interface GsParams {
	dpi: number;
	monoDpi: number;
	qFactor: number;
	chroma: '444' | '420';
	srgb: boolean;
	compat: string;
	stripMetadata: boolean;
}

// Explicit DPI + JPEG QFactor combos instead of the coarse -dPDFSETTINGS
// presets. Lower QFactor = higher image quality. DPI dominates output size.
// Calibrated on the OneQlue fixture (7.83 MB): 5.18 / 3.32 / 1.78 / 0.78 / 0.55 MB.
const LEVELS: Record<PdfLevel, GsParams> = {
	low: {
		dpi: 300,
		monoDpi: 1200,
		qFactor: 0.4,
		chroma: '444',
		srgb: false,
		compat: '1.7',
		// Consistent with every other level/rung: compressing implies cleaning
		// document metadata (privacy stance; XMP + DOCINFO both go).
		stripMetadata: true
	},
	medium: {
		dpi: 150,
		monoDpi: 600,
		qFactor: 0.76,
		chroma: '420',
		srgb: true,
		compat: '1.5',
		stripMetadata: true
	},
	high: {
		dpi: 120,
		monoDpi: 400,
		qFactor: 0.9,
		chroma: '420',
		srgb: true,
		compat: '1.5',
		stripMetadata: true
	},
	ultra: {
		dpi: 72,
		monoDpi: 300,
		qFactor: 1.0,
		chroma: '420',
		srgb: true,
		compat: '1.5',
		stripMetadata: true
	},
	extreme: {
		dpi: 50,
		// Mono stays ≥300: GS only supports /Subsample for bilevel images (it
		// rejects /Bicubic), and subsampled scans fray below ~300 DPI. 1-bit
		// CCITT data is cheap, so the size cost of the floor is small.
		monoDpi: 300,
		qFactor: 1.3,
		chroma: '420',
		srgb: true,
		compat: '1.5',
		stripMetadata: true
	}
};

// Target-size search ladder: rung 0 = best quality, monotonically smaller
// output as the index grows.
const LADDER: GsParams[] = [
	{
		dpi: 300,
		monoDpi: 1200,
		qFactor: 0.15,
		chroma: '444',
		srgb: false,
		compat: '1.5',
		stripMetadata: true
	},
	{
		dpi: 250,
		monoDpi: 1200,
		qFactor: 0.25,
		chroma: '444',
		srgb: false,
		compat: '1.5',
		stripMetadata: true
	},
	{
		dpi: 200,
		monoDpi: 800,
		qFactor: 0.4,
		chroma: '444',
		srgb: true,
		compat: '1.5',
		stripMetadata: true
	},
	{
		dpi: 150,
		monoDpi: 600,
		qFactor: 0.6,
		chroma: '444',
		srgb: true,
		compat: '1.5',
		stripMetadata: true
	},
	{
		dpi: 150,
		monoDpi: 600,
		qFactor: 0.76,
		chroma: '420',
		srgb: true,
		compat: '1.5',
		stripMetadata: true
	},
	{
		dpi: 120,
		monoDpi: 400,
		qFactor: 0.9,
		chroma: '420',
		srgb: true,
		compat: '1.5',
		stripMetadata: true
	},
	{
		dpi: 96,
		monoDpi: 300,
		qFactor: 1.0,
		chroma: '420',
		srgb: true,
		compat: '1.5',
		stripMetadata: true
	},
	{
		dpi: 72,
		monoDpi: 300,
		qFactor: 1.0,
		chroma: '420',
		srgb: true,
		compat: '1.5',
		stripMetadata: true
	},
	{
		dpi: 60,
		monoDpi: 300, // /Subsample-only floor — see LEVELS.extreme
		qFactor: 1.3,
		chroma: '420',
		srgb: true,
		compat: '1.5',
		stripMetadata: true
	},
	{
		dpi: 50,
		monoDpi: 300, // /Subsample-only floor — see LEVELS.extreme
		qFactor: 1.8,
		chroma: '420',
		srgb: true,
		compat: '1.5',
		stripMetadata: true
	}
];

// Ghostscript skips image downsampling when the reduction factor is too
// large (observed on high-DPI sources: a 50 DPI target came out BIGGER than
// 72 DPI because the source image stayed at full resolution). For low-DPI
// targets, downsample in two passes: a light intermediate pass first, then
// the real one — each pass stays within a safe reduction factor.
const TWO_PASS_BELOW_DPI = 100;

function prePassParams(p: GsParams): GsParams {
	return {
		dpi: Math.min(Math.max(4 * p.dpi, 150), 300),
		monoDpi: Math.min(4 * p.monoDpi, 1200),
		qFactor: 0.25,
		chroma: '444',
		srgb: p.srgb,
		compat: p.compat,
		stripMetadata: false
	};
}

function buildGsArgs(p: GsParams): string[] {
	const samples = p.chroma === '420' ? '[2 1 1 2]' : '[1 1 1 1]';
	const imageDict = `<< /QFactor ${p.qFactor} /Blend 1 /HSamples ${samples} /VSamples ${samples} >>`;

	// pdfwrite has no -dJPEGQ; explicit JPEG quality requires AutoFilter off,
	// DCTEncode forced, and QFactor via setdistillerparams. Metadata is
	// stripped with an empty-DOCINFO pdfmark plus -dOmitXMP, which drops the
	// catalog's XMP /Metadata stream that the pdfmark alone leaves behind.
	// The pdfmark must run AFTER the input: the pdf interpreter re-emits the
	// input's own DOCINFO while processing, and the last write per key wins.
	const postscript = `<< /ColorImageDict ${imageDict} /GrayImageDict ${imageDict} >> setdistillerparams`;
	const stripDocInfo =
		'[ /Title () /Author () /Subject () /Keywords () /Creator () /DOCINFO pdfmark';

	return [
		'-sDEVICE=pdfwrite',
		`-dCompatibilityLevel=${p.compat}`,
		'-dNOPAUSE',
		'-dBATCH',
		'-dSAFER',
		...(p.stripMetadata ? ['-dOmitXMP=true', '-dOmitInfoDate=true'] : []),
		'-dDetectDuplicateImages=true',
		// Linearized ("fast web view") output: byte layout only, so web-hosted
		// PDFs render progressively; merge/pages (pdf-lib) drop it on re-save.
		'-dFastWebView=true',
		'-dCompressFonts=true',
		'-dSubsetFonts=true',
		'-dEmbedAllFonts=true',
		'-dAutoRotatePages=/None',
		// Color images
		'-dDownsampleColorImages=true',
		'-dColorImageDownsampleType=/Bicubic',
		`-dColorImageResolution=${p.dpi}`,
		'-dColorImageDownsampleThreshold=1.0',
		'-dAutoFilterColorImages=false',
		'-dColorImageFilter=/DCTEncode',
		// Gray images
		'-dDownsampleGrayImages=true',
		'-dGrayImageDownsampleType=/Bicubic',
		`-dGrayImageResolution=${p.dpi}`,
		'-dGrayImageDownsampleThreshold=1.0',
		'-dAutoFilterGrayImages=false',
		'-dGrayImageFilter=/DCTEncode',
		// Mono / bilevel images
		'-dDownsampleMonoImages=true',
		'-dMonoImageDownsampleType=/Subsample',
		`-dMonoImageResolution=${p.monoDpi}`,
		'-dMonoImageDownsampleThreshold=1.0',
		...(p.srgb ? ['-sColorConversionStrategy=sRGB'] : []),
		'-sOutputFile=/out.pdf',
		'-c',
		postscript,
		'-f',
		'/in.pdf',
		...(p.stripMetadata ? ['-c', stripDocInfo] : [])
	];
}

async function runGsArgs(
	input: ArrayBuffer,
	args: string[],
	onPage: (page: number, pageCount: number | null) => void,
	signal?: AbortSignal
): Promise<Uint8Array> {
	// Transfer a copy: target-size mode reuses `input` across attempts.
	const copy = input.slice(0);
	const result = await callWorker(
		'gs',
		'compress',
		{ pdf: copy, args },
		[copy],
		(progress) => onPage(progress.page, progress.pageCount),
		{ owner: signal }
	);
	return new Uint8Array(result);
}

/** GS always terminates a healthy pdfwrite file with `%%EOF`; a missing one
 *  means the write was silently cut short (exit code stays 0 — measured). */
function endsWithEof(out: Uint8Array): boolean {
	const tail = out.subarray(Math.max(0, out.length - 64));
	return new TextDecoder('latin1').decode(tail).includes('%%EOF');
}

async function runGs(
	input: ArrayBuffer,
	params: GsParams,
	onPage: (page: number, pageCount: number | null) => void,
	signal?: AbortSignal
): Promise<Uint8Array> {
	const out = await runGsArgs(input, buildGsArgs(params), onPage, signal);
	if (endsWithEof(out)) return out;
	// The -dFastWebView linearization pass can exhaust wasm memory on complex
	// documents and truncate the output mid-xref while still exiting 0
	// (measured on a real 62 MB guide AND on a 5.6 MB brochure — it's not a
	// size threshold). Linearization is a nicety; a complete file is not.
	signal?.throwIfAborted();
	const args = buildGsArgs(params).filter((a) => a !== '-dFastWebView=true');
	const retry = await runGsArgs(input, args, onPage, signal);
	if (!endsWithEof(retry)) {
		throw new Error('Ghostscript produced a truncated PDF — the document may be too complex');
	}
	return retry;
}

// --- Unlock / Protect (no downsampling flags — pixel quality is untouched) --

/**
 * Minimal pdfwrite pass: decrypts with the user's password (`unlock`) or
 * re-saves with password encryption (`protect`). The password stays inside
 * the worker args — it is never persisted or sent anywhere.
 *
 * pdfwrite can WRITE only encryption revisions 2/3 (measured: R4/R6 fail with
 * "Encryption revisions 2 and 3 are only supported") — so protect uses R3
 * (128-bit RC4), the strongest this engine can produce; AESV2/V3 support in
 * the wasm is read-side only.
 */
function buildCryptArgs(op: 'unlock' | 'protect', password: string): string[] {
	const base = [
		'-sDEVICE=pdfwrite',
		'-dCompatibilityLevel=1.7',
		'-dNOPAUSE',
		'-dBATCH',
		'-dSAFER',
		'-sOutputFile=/out.pdf'
	];
	if (op === 'unlock') {
		return [...base, `-sPDFPassword=${password}`, '-f', '/in.pdf'];
	}
	return [
		...base,
		`-sOwnerPassword=${password}`,
		`-sUserPassword=${password}`,
		'-dEncryptionR=3',
		'-dKeyLength=128',
		'-dPermissions=-4',
		'-f',
		'/in.pdf'
	];
}

export async function unlockPdf(
	file: File,
	password: string,
	onPage: (page: number, pageCount: number | null) => void,
	signal?: AbortSignal
): Promise<Blob> {
	const out = await runGsArgs(
		await file.arrayBuffer(),
		buildCryptArgs('unlock', password),
		onPage,
		signal
	);
	return new Blob([out as BlobPart], { type: 'application/pdf' });
}

export async function protectPdf(
	file: File,
	password: string,
	onPage: (page: number, pageCount: number | null) => void,
	signal?: AbortSignal
): Promise<Blob> {
	const out = await runGsArgs(
		await file.arrayBuffer(),
		buildCryptArgs('protect', password),
		onPage,
		signal
	);
	return new Blob([out as BlobPart], { type: 'application/pdf' });
}

async function runPipeline(
	input: ArrayBuffer,
	params: GsParams,
	onPage: (page: number, pageCount: number | null) => void,
	signal?: AbortSignal
): Promise<Uint8Array> {
	if (params.dpi >= TWO_PASS_BELOW_DPI) return runGs(input, params, onPage, signal);
	const intermediate = await runGs(input, prePassParams(params), onPage, signal);
	// A cancel landing between the passes would otherwise respawn a fresh
	// worker and finish the file anyway.
	signal?.throwIfAborted();
	return runGs(intermediate.buffer as ArrayBuffer, params, onPage, signal);
}

export async function compressPdf(
	file: File,
	settings: PdfCompressionSettings,
	onProgress: (p: PdfProgress) => void,
	signal?: AbortSignal
): Promise<{ blob: Blob; warning: string | null }> {
	const input = await file.arrayBuffer();

	if (settings.mode === 'target') {
		return compressToTarget(
			input,
			Math.max(1, Math.round(settings.targetMb * 1_000_000)),
			onProgress,
			signal
		);
	}

	const out = await runPipeline(
		input,
		LEVELS[settings.level],
		(page, pageCount) => onProgress({ page, pageCount }),
		signal
	);
	// Ghostscript can inflate already-optimized PDFs; keep the original then.
	if (out.byteLength >= input.byteLength) {
		return { blob: new Blob([input], { type: 'application/pdf' }), warning: null };
	}
	return { blob: new Blob([out as BlobPart], { type: 'application/pdf' }), warning: null };
}

async function compressToTarget(
	input: ArrayBuffer,
	targetBytes: number,
	onProgress: (p: PdfProgress) => void,
	signal?: AbortSignal
): Promise<{ blob: Blob; warning: string | null }> {
	const { best, smallest } = await searchTargetSize<Uint8Array>(
		LADDER.length,
		targetBytes,
		(rung, state) =>
			runPipeline(
				input,
				LADDER[rung],
				(page, pageCount) => onProgress({ ...state, page, pageCount }),
				signal
			),
		(out) => out.byteLength,
		onProgress,
		signal
	);

	// The original already fitting beats any lossy rung of the same size class.
	if (input.byteLength <= targetBytes && (!best || best.byteLength >= input.byteLength)) {
		return { blob: new Blob([input], { type: 'application/pdf' }), warning: null };
	}

	if (best) {
		return { blob: new Blob([best as BlobPart], { type: 'application/pdf' }), warning: null };
	}

	// Nothing fits — return the smallest result with a warning.
	return {
		blob: new Blob([smallest as BlobPart], { type: 'application/pdf' }),
		warning: targetNotReachableWarning(targetBytes, smallest.byteLength)
	};
}
