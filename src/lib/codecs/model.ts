/**
 * GLB compression — thin main-thread layer over the model worker (the
 * archive-tools shape): validate cheaply, hand the bytes over by transfer,
 * map progress, build the row's info/warning strings.
 */
import type { ModelSettings, UploadedFile } from '$lib/types';
import { callWorker } from '$lib/workers/rpc';
import {
	modelIdleTimeoutMs,
	modelInfo,
	modelWarning,
	validateModelInput,
	type ModelStatsX
} from './model-shared';

export interface ModelResult {
	blob: Blob;
	info: string | null;
	warning: string | null;
	/** Committed simplify or texture downscale — must survive the whole-file guard. */
	transformed: boolean;
}

export async function compressModel(
	file: UploadedFile,
	settings: ModelSettings,
	onProgress: (fraction: number, detail: string | null) => void,
	signal?: AbortSignal
): Promise<ModelResult> {
	const bytes = await file.file.arrayBuffer();
	validateModelInput(new Uint8Array(bytes), file.name);
	signal?.throwIfAborted();
	onProgress(0.02, null);
	// Snapshot the ($state-proxied) settings into plain primitives — a Proxy
	// cannot ride postMessage's structured clone.
	const plain: ModelSettings = {
		compression: settings.compression,
		simplify: settings.simplify,
		textureQuality: settings.textureQuality,
		textureMaxDimension: settings.textureMaxDimension
	};
	const out = await callWorker(
		'model',
		'optimize',
		{ bytes, settings: plain },
		[bytes],
		(p) => onProgress(p.fraction, p.detail),
		{ owner: signal, idleTimeoutMs: modelIdleTimeoutMs(file.size) }
	);
	// The worker ships the family's extended stats (ModelStatsX) over the
	// plain wire type — the extra fields are optional and clone-safe.
	const stats = out.stats as ModelStatsX;
	return {
		blob: new Blob([out.bytes], { type: 'model/gltf-binary' }),
		info: modelInfo(stats, settings),
		warning: modelWarning(stats),
		transformed: stats.textureResized || stats.trianglesAfter < stats.trianglesBefore
	};
}
