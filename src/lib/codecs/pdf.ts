import type { PdfCompressionSettings, PdfLevel } from '$lib/types';
import { callWorker } from '$lib/workers/rpc';
import {
	prepareInteractive,
	scanInteractive,
	transplantLinks,
	type CollectedLink
} from './pdf-interactive';
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

// --- Unlock / Protect (qpdf: structural crypto, content never re-encoded) --

/**
 * qpdf rewrites only the encryption layer — pages are never re-interpreted,
 * unlike the old Ghostscript pdfwrite pass, which re-serialized the whole
 * document and could write nothing stronger than RC4-128/R3. protect writes
 * AES-256 (R6); unlock strips whatever revision the file carries. The
 * password rides in the worker payload per call — never persisted anywhere.
 */
async function runQpdfCrypt(
	file: File,
	op: 'unlock' | 'protect',
	password: string,
	signal?: AbortSignal
): Promise<Blob> {
	const pdf = await file.arrayBuffer();
	const result = await callWorker('qpdf', 'crypt', { pdf, op, password }, [pdf], undefined, {
		owner: signal
	});
	return new Blob([new Uint8Array(result) as BlobPart], { type: 'application/pdf' });
}

export async function unlockPdf(file: File, password: string, signal?: AbortSignal): Promise<Blob> {
	return runQpdfCrypt(file, 'unlock', password, signal);
}

export async function protectPdf(
	file: File,
	password: string,
	signal?: AbortSignal
): Promise<Blob> {
	return runQpdfCrypt(file, 'protect', password, signal);
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

/** F-03: the gs engine drops every annotation — flatten filled forms up front
 *  (values stay visible) and remember /Link annots for the post-pass. On any
 *  pdf-lib parse failure the raw bytes go to gs unchanged. */
async function prepInteractive(
	input: ArrayBuffer
): Promise<{ gsInput: ArrayBuffer; links: CollectedLink[]; flattenNote: string | null }> {
	if (!scanInteractive(input)) return { gsInput: input, links: [], flattenNote: null };
	try {
		const prep = await prepareInteractive(input);
		return {
			gsInput: prep.bytes,
			links: prep.links,
			flattenNote: prep.flattened
				? 'Form fields were flattened so filled-in values stay visible.'
				: null
		};
	} catch {
		return { gsInput: input, links: [], flattenNote: null };
	}
}

/** Best-effort link restore — a transplant failure keeps the gs output. */
async function restoreLinks(out: Uint8Array, links: CollectedLink[]): Promise<Uint8Array> {
	if (links.length === 0) return out;
	try {
		return await transplantLinks(out, links);
	} catch {
		return out;
	}
}

export async function compressPdf(
	file: File,
	settings: PdfCompressionSettings,
	onProgress: (p: PdfProgress) => void,
	signal?: AbortSignal
): Promise<{ blob: Blob; warning: string | null }> {
	const input = await file.arrayBuffer();
	const { gsInput, links, flattenNote } = await prepInteractive(input);

	if (settings.mode === 'target') {
		return compressToTarget(
			input,
			gsInput,
			links,
			flattenNote,
			Math.max(1, Math.round(settings.targetMb * 1_000_000)),
			onProgress,
			signal
		);
	}

	const out = await restoreLinks(
		await runPipeline(
			gsInput,
			LEVELS[settings.level],
			(page, pageCount) => onProgress({ page, pageCount }),
			signal
		),
		links
	);
	// Ghostscript can inflate already-optimized PDFs; keep the original then
	// (the original still carries its live form + links — nothing to flag).
	if (out.byteLength >= input.byteLength) {
		return { blob: new Blob([input], { type: 'application/pdf' }), warning: null };
	}
	return { blob: new Blob([out as BlobPart], { type: 'application/pdf' }), warning: flattenNote };
}

async function compressToTarget(
	input: ArrayBuffer,
	gsInput: ArrayBuffer,
	links: CollectedLink[],
	flattenNote: string | null,
	targetBytes: number,
	onProgress: (p: PdfProgress) => void,
	signal?: AbortSignal
): Promise<{ blob: Blob; warning: string | null }> {
	// The link transplant re-saves through pdf-lib without object streams,
	// which can expand a rung well past its raw gs size on object-heavy
	// documents — so the search must judge each rung by the size the user
	// actually downloads, not the raw gs output. restoreLinks is identity for
	// link-less files and cheap (no re-interpretation) next to a gs pass.
	const { best, smallest } = await searchTargetSize<Uint8Array>(
		LADDER.length,
		targetBytes,
		async (rung, state) =>
			restoreLinks(
				await runPipeline(
					gsInput,
					LADDER[rung],
					(page, pageCount) => onProgress({ ...state, page, pageCount }),
					signal
				),
				links
			),
		(out) => out.byteLength,
		onProgress,
		signal
	);

	// The original already fitting beats any lossy rung of the same size class
	// (and keeps its live form + links — nothing to flag).
	if (input.byteLength <= targetBytes && (!best || best.byteLength >= input.byteLength)) {
		return { blob: new Blob([input], { type: 'application/pdf' }), warning: null };
	}

	if (best) {
		return {
			blob: new Blob([best as BlobPart], { type: 'application/pdf' }),
			warning: flattenNote
		};
	}

	// Nothing fits — return the smallest result with a warning.
	return {
		blob: new Blob([smallest as BlobPart], { type: 'application/pdf' }),
		warning: [targetNotReachableWarning(targetBytes, smallest.byteLength), flattenNote]
			.filter(Boolean)
			.join(' ')
	};
}

// --- Grayscale / PDF-A (pdfwrite variants over the existing gs worker) ------

/** Convert every color to grayscale — a pdfwrite pass with the Gray strategy
 *  (both symbols confirmed in the wasm; pixel data is not downsampled). */
export async function grayscalePdf(
	file: File,
	onPage: (page: number, pageCount: number | null) => void,
	signal?: AbortSignal
): Promise<Blob> {
	const args = [
		'-sDEVICE=pdfwrite',
		'-dCompatibilityLevel=1.7',
		'-dNOPAUSE',
		'-dBATCH',
		'-dSAFER',
		'-sColorConversionStrategy=Gray',
		'-dProcessColorModel=/DeviceGray',
		'-sOutputFile=/out.pdf',
		'-f',
		'/in.pdf'
	];
	// Same engine, same annotation loss as compress — flatten + re-link (F-03).
	const { gsInput, links } = await prepInteractive(await file.arrayBuffer());
	const out = await restoreLinks(await runGsArgs(gsInput, args, onPage, signal), links);
	return new Blob([out as BlobPart], { type: 'application/pdf' });
}

/** The OutputIntent definition -dPDFA needs, injected inline via `-c` — the
 *  sRGB ICC profile ships in the wasm's ROM filesystem, so no extra files
 *  cross the worker boundary. (This replaces the PDFA_def.ps a desktop
 *  Ghostscript would read from disk; measured: output declares
 *  pdfaid:part='2' conformance='B'.) */
const PDFA_OUTPUT_INTENT = [
	'[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark',
	'[{icc_PDFA} <</N 3>> /PUT pdfmark',
	'[{icc_PDFA} (%rom%iccprofiles/srgb.icc) (r) file /PUT pdfmark',
	'[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark',
	'[{OutputIntent_PDFA} <</Type /OutputIntent /S /GTS_PDFA1 /DestOutputProfile {icc_PDFA} /OutputConditionIdentifier (sRGB)>> /PUT pdfmark',
	'[{Catalog} <</OutputIntents [ {OutputIntent_PDFA} ]>> /PUT pdfmark'
].join(' ');

/** Convert to PDF/A-2b (ISO archival). No -dSAFER: the inline OutputIntent
 *  must read the ROM srgb.icc, which SAFER would block. */
export async function pdfaPdf(
	file: File,
	onPage: (page: number, pageCount: number | null) => void,
	signal?: AbortSignal
): Promise<Blob> {
	const args = [
		'-sDEVICE=pdfwrite',
		'-dPDFA=2',
		'-dPDFACompatibilityPolicy=1',
		'-sColorConversionStrategy=RGB',
		'-dNOPAUSE',
		'-dBATCH',
		'-sOutputFile=/out.pdf',
		'-c',
		PDFA_OUTPUT_INTENT,
		'-f',
		'/in.pdf'
	];
	// Flatten filled forms so their values survive (F-03); PDF/A-2b allows
	// /Link annots, and the transplant re-save keeps the catalog's XMP +
	// OutputIntents objects intact (verified by PT-24's conformance greps).
	const { gsInput, links } = await prepInteractive(await file.arrayBuffer());
	const out = await restoreLinks(await runGsArgs(gsInput, args, onPage, signal), links);
	return new Blob([out as BlobPart], { type: 'application/pdf' });
}
