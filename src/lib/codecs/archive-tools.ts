import type { UploadedFile, ZipSettings } from '$lib/types';
import type { ArchiveExtractResult } from '$lib/workers/protocol';
import { callWorker } from '$lib/workers/rpc';
import { archiveIdleTimeoutMs, CONVERT_EXPANSION_FACTOR } from '$lib/codecs/sevenzip-args';

/**
 * Main-thread side of the 7z-wasm archive worker: payload assembly, buffer
 * transfer and progress adaptation. Result shaping (CompressedFile rows,
 * combined outputs, failure banners) stays in compress.ts's runArchiveTool —
 * this module is the lazy-loaded worker boundary, like codecs/pdf-tools.
 */

/** Worker fractions are 0..1-or-null (null = indeterminate pulse). */
export type ArchiveProgressFn = (fraction: number | null, detail: string | null) => void;

/** Reads every input up front; reading is a visible phase (0 → readShare). */
async function readInputs(
	files: UploadedFile[],
	readShare: number,
	onProgress: ArchiveProgressFn,
	signal?: AbortSignal
): Promise<{ name: string; bytes: ArrayBuffer }[]> {
	const inputs: { name: string; bytes: ArrayBuffer }[] = [];
	for (let i = 0; i < files.length; i++) {
		signal?.throwIfAborted();
		inputs.push({ name: files[i].name, bytes: await files[i].file.arrayBuffer() });
		onProgress((readShare * (i + 1)) / files.length, `reading ${files[i].name}`);
	}
	return inputs;
}

/** Bundle every input into ONE archive (zip/7z/tar/tgz/tbz2/txz). */
export async function createBundle(
	files: UploadedFile[],
	settings: ZipSettings,
	baseName: string,
	onProgress: ArchiveProgressFn,
	signal?: AbortSignal
): Promise<{ blob: Blob; name: string }> {
	const READ_SHARE = 0.2;
	const inputs = await readInputs(files, READ_SHARE, onProgress, signal);
	const result = await callWorker(
		'archive',
		'create',
		{
			files: inputs,
			output: settings.outputFormat,
			level: settings.level,
			password: settings.password,
			encryptNames: settings.encryptNames,
			baseName
		},
		inputs.map((i) => i.bytes),
		(p) =>
			onProgress(p.fraction == null ? null : READ_SHARE + p.fraction * (1 - READ_SHARE), p.detail),
		// tar.* second stages / single-file 7z print one line then compress in
		// silence — scale the no-progress window so slow-but-healthy jobs live.
		{ owner: signal, idleTimeoutMs: archiveIdleTimeoutMs(files.reduce((t, f) => t + f.size, 0)) }
	);
	return { blob: new Blob([result.bytes], { type: result.mimeType }), name: result.name };
}

/** Compress ONE file into a single-stream format (gz/bz2/xz). */
export async function createStream(
	file: UploadedFile,
	settings: ZipSettings,
	onProgress: ArchiveProgressFn,
	signal?: AbortSignal
): Promise<{ blob: Blob; name: string }> {
	const bytes = await file.file.arrayBuffer();
	onProgress(0.1, null);
	const result = await callWorker(
		'archive',
		'create',
		{
			files: [{ name: file.name, bytes }],
			output: settings.outputFormat,
			level: settings.level,
			password: '', // stream formats cannot encrypt
			encryptNames: false,
			baseName: file.name // streams APPEND: report.pdf → report.pdf.gz
		},
		[bytes],
		(p) => onProgress(p.fraction == null ? null : 0.1 + p.fraction * 0.9, p.detail),
		// Single-stream gz/bz2/xz print one line up front, then silence.
		{ owner: signal, idleTimeoutMs: archiveIdleTimeoutMs(file.size) }
	);
	return { blob: new Blob([result.bytes], { type: result.mimeType }), name: result.name };
}

/** Extract ONE archive (any 7zz-readable format, nested payloads chained). */
export async function extractArchive(
	file: UploadedFile,
	password: string,
	onProgress: ArchiveProgressFn,
	signal?: AbortSignal
): Promise<ArchiveExtractResult> {
	onProgress(0.05, null);
	// The File rides in the payload by structured-clone reference (no byte
	// copy); the worker reads it lazily through a WORKERFS mount.
	return callWorker(
		'archive',
		'extract',
		{ file: file.file, name: file.name, password },
		[],
		(p) => onProgress(p.fraction, p.detail),
		// An archive holding ONE huge entry prints a single "- name" line and
		// then decompresses in silence; decompression outpaces compression, so
		// the create-scale window is a conservative bound here.
		{ owner: signal, idleTimeoutMs: archiveIdleTimeoutMs(file.size) }
	);
}

/** Repack ONE archive into another bundling format (rar → zip, zip → 7z…). */
export async function convertArchive(
	file: UploadedFile,
	settings: ZipSettings,
	onProgress: ArchiveProgressFn,
	signal?: AbortSignal
): Promise<{ blob: Blob; name: string; entryCount: number }> {
	if (
		settings.outputFormat === 'gz' ||
		settings.outputFormat === 'bz2' ||
		settings.outputFormat === 'xz'
	) {
		throw new Error('Convert needs a multi-file target format (ZIP, 7Z or TAR)');
	}
	onProgress(0.02, null);
	// File by structured-clone reference (see extractArchive); the repack
	// stage can be a silent single stream, hence the scaled watchdog window.
	// That silent stage compresses the EXTRACTED payload, not the source —
	// scale by the pessimistic expansion budget or a 200 MB zip of source
	// code (→ ~1 GB extracted) converted to txz dies at the 10-min floor.
	const result = await callWorker(
		'archive',
		'convert',
		{
			file: file.file,
			name: file.name,
			password: settings.password,
			output: settings.outputFormat,
			level: settings.level
		},
		[],
		(p) => onProgress(p.fraction, p.detail),
		{
			owner: signal,
			idleTimeoutMs: archiveIdleTimeoutMs(file.size * CONVERT_EXPANSION_FACTOR)
		}
	);
	return {
		blob: new Blob([result.bytes], { type: result.mimeType }),
		name: result.name,
		entryCount: result.entryCount
	};
}
