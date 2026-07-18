/**
 * Pure helpers shared by the model worker, the main-thread codec and unit
 * tests (the sevenzip-args pattern — no wasm, no DOM, node-env testable).
 */
import type { ModelStats } from '$lib/workers/protocol';
import type { ModelSettings } from '$lib/types';

/** gltf-transform's documented example value — the library default (0.0001)
 *  stops far above the requested ratio on detailed meshes (phase-0 measured:
 *  0.001 reaches 49.99% of triangles at ratio 0.5 on a 24k-triangle sphere). */
export const SIMPLIFY_ERROR = 0.001;

/** Raster formats inside GLB textures; magic bytes are authoritative — the
 *  declared mimeType lies often enough that it only gets corrected on write. */
export function sniffTexture(bytes: Uint8Array): 'jpg' | 'png' | 'webp' | 'ktx2' | null {
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
		return 'jpg';
	if (
		bytes.length >= 8 &&
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return 'png';
	}
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return 'webp';
	}
	// KTX2: «0xAB 'KTX 20' 0xBB» identifier
	if (
		bytes.length >= 7 &&
		bytes[0] === 0xab &&
		bytes[1] === 0x4b &&
		bytes[2] === 0x54 &&
		bytes[3] === 0x58 &&
		bytes[4] === 0x20 &&
		bytes[5] === 0x32 &&
		bytes[6] === 0x30
	) {
		return 'ktx2';
	}
	return null;
}

/** Cheap 12-byte header gate, run on the main thread before the worker spins. */
export function validateModelInput(bytes: Uint8Array, name: string): void {
	// A .gltf (or any JSON) file: geometry/textures live in separate files the
	// browser can't reach — the most common user mistake, so the friendliest error.
	const head = bytes.slice(0, 1);
	if (head[0] === 0x7b || /\.gltf$/i.test(name)) {
		throw new Error(
			".gltf files keep textures and geometry in separate files this tool can't see — export as a single .glb (Binary glTF) and try again"
		);
	}
	if (bytes.length < 12) throw new Error('Not a glTF binary (.glb) file');
	const view = new DataView(bytes.buffer, bytes.byteOffset, 12);
	if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a glTF binary (.glb) file'); // 'glTF'
	if (view.getUint32(4, true) !== 2) {
		throw new Error('glTF 1.0 is not supported — re-export as glTF 2.0 (.glb)');
	}
}

const GLB_TRUNCATED =
	'This .glb is incomplete — the file ends before its data does (often a cut-off download); re-download or re-export it and try again';
const GLB_DAMAGED =
	'This file could not be read as a glTF binary — it may be damaged or not a real .glb';

/** Parses the GLB's JSON chunk without decoding geometry: rejects external
 *  references with a clear message and records the input's compression (the
 *  decoded Document no longer reliably carries extensionsRequired).
 *
 *  validateModelInput only guarantees the 12-byte header — everything past it
 *  can be missing or lying, so the chunk reads map their own failures to the
 *  honest messages instead of leaking RangeError/SyntaxError to the row. */
export function scanGlbJson(bytes: Uint8Array): { inputCompression: 'draco' | 'meshopt' | null } {
	if (bytes.byteLength < 20) throw new Error(GLB_TRUNCATED);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const jsonLength = view.getUint32(12, true);
	const jsonType = view.getUint32(16, true);
	if (jsonType !== 0x4e4f534a) throw new Error('Not a glTF binary (.glb) file'); // 'JSON'
	if (20 + jsonLength > bytes.byteLength) throw new Error(GLB_TRUNCATED);
	let json: {
		buffers?: { uri?: string }[];
		images?: { uri?: string }[];
		extensionsRequired?: string[];
	};
	try {
		json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength)));
	} catch {
		throw new Error(GLB_DAMAGED);
	}
	for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
		if (resource.uri && !resource.uri.startsWith('data:')) {
			throw new Error(
				`This .glb references external files (${resource.uri}) — export it self-contained and try again`
			);
		}
	}
	const required = json.extensionsRequired ?? [];
	return {
		inputCompression: required.includes('KHR_draco_mesh_compression')
			? 'draco'
			: required.includes('EXT_meshopt_compression')
				? 'meshopt'
				: null
	};
}

/** Model-family extension of the wire ModelStats — declared here (the family
 *  owns its own seam) and optional, so the shared protocol stays untouched
 *  and older readers simply ignore it. Rides structured clone unchanged. */
export interface ModelStatsX extends ModelStats {
	/** Simplify was requested but skipped wholesale: primitives carry morph
	 *  targets that MeshoptSimplifier would desync. */
	simplifySkippedMorphs?: boolean;
}

/** Row warning: every way the run quietly did less than the settings asked. */
export function modelWarning(stats: ModelStatsX): string | null {
	const parts: string[] = [];
	if (stats.simplifySkippedMorphs) {
		parts.push(
			'Simplify skipped — morph targets (blend shapes) would fall out of sync with a decimated mesh'
		);
	}
	if (stats.texturesFailed > 0) {
		parts.push(
			`${stats.texturesFailed} damaged texture${stats.texturesFailed === 1 ? '' : 's'} kept unchanged`
		);
	}
	return parts.length > 0 ? parts.join(' · ') : null;
}

function fmtCount(n: number): string {
	if (n < 10_000) return n.toLocaleString('en-US');
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

export function modelInfo(stats: ModelStats, settings: ModelSettings): string {
	const parts: string[] = [];
	parts.push(
		settings.compression === 'draco'
			? 'Draco geometry'
			: settings.compression === 'meshopt'
				? 'Meshopt geometry'
				: 'Geometry quantized'
	);
	if (stats.trianglesAfter < stats.trianglesBefore) {
		parts.push(`${fmtCount(stats.trianglesBefore)} → ${fmtCount(stats.trianglesAfter)} triangles`);
	}
	const candidates = stats.texturesTotal - stats.texturesSkipped;
	if (candidates > 0) {
		let line = `${stats.texturesChanged} of ${candidates} texture${candidates === 1 ? '' : 's'} recompressed`;
		if (stats.texturesSkipped > 0) line += ` (${stats.texturesSkipped} GPU-format kept)`;
		parts.push(line);
	}
	return parts.join(' · ');
}

/** draco/meshopt byte-encode runs inside ONE synchronous writeBinary call —
 *  scale the no-progress watchdog with input size so huge meshes survive it. */
export function modelIdleTimeoutMs(bytes: number): number {
	return Math.max(10 * 60_000, Math.round((bytes / 2 ** 20) * 4000));
}
