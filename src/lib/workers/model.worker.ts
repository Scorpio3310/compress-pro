/**
 * GLB optimizer — gltf-transform pipeline with Draco / Meshopt / quantize
 * geometry codecs and embedded-texture recompression. Single-instance worker
 * (synchronous wasm encode → plain terminate is the only mid-run cancel).
 *
 * Draco wasm rides fetch → wasmBinary (its glue's fs/path requires live in
 * dead Node branches); meshoptimizer inlines its wasm as base64 — no assets.
 */
import dracoEncoderWasmUrl from 'draco3d/draco_encoder.wasm?url';
import dracoDecoderWasmUrl from 'draco3d/draco_decoder.wasm?url';
import draco3d from 'draco3d';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import { WebIO, Logger, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, quantize, draco, meshopt } from '@gltf-transform/functions';
import type { ModelSettings } from '$lib/types';
import type { WorkerContracts, ModelStats } from './protocol';
import { expose } from './host';
import { sniffTexture, scanGlbJson, SIMPLIFY_ERROR } from '$lib/codecs/model-shared';
import { containScale } from '$lib/codecs/video-math';

const SILENT = new Logger(Logger.Verbosity.SILENT);

let enginePromise: Promise<WebIO> | null = null;

async function fetchWasm(url: string): Promise<ArrayBuffer> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`3D engine download failed (${response.status})`);
	return response.arrayBuffer();
}

function getEngine(): Promise<WebIO> {
	// Lazy memo with self-reset on failure — an offline blip must not poison
	// later jobs. One long-lived module pair: draco is a pure encode/decode
	// API without the C++-exception state traps qpdf has.
	enginePromise ??= (async () => {
		const [encoderModule, decoderModule] = await Promise.all([
			fetchWasm(dracoEncoderWasmUrl).then((wasmBinary) =>
				draco3d.createEncoderModule({ wasmBinary })
			),
			fetchWasm(dracoDecoderWasmUrl).then((wasmBinary) =>
				draco3d.createDecoderModule({ wasmBinary })
			),
			MeshoptEncoder.ready,
			MeshoptDecoder.ready,
			MeshoptSimplifier.ready
		]);
		return new WebIO()
			.setLogger(SILENT)
			.registerExtensions(ALL_EXTENSIONS)
			.registerDependencies({
				'draco3d.encoder': encoderModule,
				'draco3d.decoder': decoderModule,
				'meshopt.encoder': MeshoptEncoder,
				'meshopt.decoder': MeshoptDecoder
			});
	})().catch((error) => {
		enginePromise = null;
		throw error;
	});
	return enginePromise;
}

// Spawn == warm: the WARM_KIND-triggered construction starts the wasm fetches
// during think time (vtracer pattern).
getEngine().catch(() => {});

function countGeometry(document: Document): { triangles: number; vertices: number } {
	let triangles = 0;
	let vertices = 0;
	for (const mesh of document.getRoot().listMeshes()) {
		for (const primitive of mesh.listPrimitives()) {
			const position = primitive.getAttribute('POSITION');
			if (!position) continue;
			const indices = primitive.getIndices();
			triangles += Math.floor((indices ? indices.getCount() : position.getCount()) / 3);
			vertices += position.getCount();
		}
	}
	return { triangles, vertices };
}

interface TextureOutcome {
	changed: number;
	total: number;
	skipped: number;
	failed: number;
	resized: boolean;
}

async function recompressTextures(
	document: Document,
	settings: ModelSettings,
	onTexture: (done: number, total: number) => void
): Promise<TextureOutcome> {
	const textures = document.getRoot().listTextures();
	const out: TextureOutcome = {
		changed: 0,
		total: textures.length,
		skipped: 0,
		failed: 0,
		resized: false
	};
	// Sequential — one decoded texture at a time bounds peak memory.
	let done = 0;
	for (const texture of textures) {
		const image = texture.getImage();
		const kind = image ? sniffTexture(image) : null;
		if (kind !== 'jpg' && kind !== 'png') {
			// KTX2/WebP/unknown pass through untouched — GPU formats especially
			// must never be re-rasterized behind the user's back.
			out.skipped++;
			done++;
			continue;
		}
		try {
			const bitmap = await createImageBitmap(new Blob([image as Uint8Array<ArrayBuffer>]));
			const scale = containScale(bitmap.width, bitmap.height, settings.textureMaxDimension);
			const width = Math.max(1, Math.round(bitmap.width * scale));
			const height = Math.max(1, Math.round(bitmap.height * scale));
			const resizing = width !== bitmap.width || height !== bitmap.height;
			if (kind === 'png' && !resizing) {
				// Canvas PNG encode can't beat an optimized source at the same
				// dims — the guard would reject it, so skip the work.
				bitmap.close();
				done++;
				onTexture(done, textures.length);
				continue;
			}
			const canvas = new OffscreenCanvas(width, height);
			const context = canvas.getContext('2d');
			if (!context) throw new Error('OffscreenCanvas 2d context unavailable');
			context.drawImage(bitmap, 0, 0, width, height);
			bitmap.close();
			// Same-format re-encode only: JPEG stays JPEG (quality applies),
			// PNG stays PNG (resize-only — keeps alpha, spares normal maps).
			const blob = await canvas.convertToBlob(
				kind === 'jpg'
					? { type: 'image/jpeg', quality: settings.textureQuality / 100 }
					: { type: 'image/png' }
			);
			const encoded = new Uint8Array(await blob.arrayBuffer());
			if (encoded.byteLength < (image as Uint8Array).byteLength) {
				texture.setImage(encoded).setMimeType(kind === 'jpg' ? 'image/jpeg' : 'image/png');
				out.changed++;
				out.resized ||= resizing;
			}
			// else: per-texture keep-original — the source bytes ride through
		} catch {
			out.failed++;
		}
		done++;
		onTexture(done, textures.length);
	}
	return out;
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

expose<WorkerContracts['model']>({
	optimize: async ({ bytes, settings }, progress) => {
		const io = await getEngine();
		const input = new Uint8Array(bytes);

		// External-ref guard + input compression, read from the raw JSON chunk
		// OFF the main thread (chunk 0 of a big GLB can be tens of MB).
		const scan = scanGlbJson(input);
		progress({ fraction: 0.05, detail: 'reading model' });
		let document: Document;
		try {
			document = await io.readBinary(input);
		} catch {
			throw new Error(
				'This file could not be read as a glTF binary — it may be damaged or not a real .glb'
			);
		}
		document.setLogger(SILENT);

		const before = countGeometry(document);
		progress({ fraction: 0.12, detail: 'optimizing structure' });
		await document.transform(dedup(), prune(), weld());

		if (settings.simplify != null) {
			// MeshoptSimplifier doesn't understand morph targets — decimating a
			// primitive with targets would desync them, so skip simplify wholesale.
			const hasMorphTargets = document
				.getRoot()
				.listMeshes()
				.some((mesh) => mesh.listPrimitives().some((p) => p.listTargets().length > 0));
			if (!hasMorphTargets) {
				progress({ fraction: 0.2, detail: 'simplifying mesh' });
				await document.transform(
					simplify({
						simplifier: MeshoptSimplifier,
						ratio: settings.simplify / 100,
						error: SIMPLIFY_ERROR
					})
				);
			}
		}

		const textures = await recompressTextures(document, settings, (done, total) =>
			progress({ fraction: 0.3 + 0.4 * (done / total), detail: `texture ${done}/${total}` })
		);

		progress({
			fraction: 0.75,
			detail:
				settings.compression === 'none' ? 'quantizing geometry' : 'preparing geometry codec'
		});
		if (settings.compression === 'draco') {
			// Draco quantizes internally — no quantize() first (double loss, no win).
			await document.transform(draco({ method: 'edgebreaker' }));
		} else if (settings.compression === 'meshopt') {
			await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
		} else {
			// KHR_mesh_quantization only — needs no decoder, viewers read it natively.
			await document.transform(quantize());
		}

		// The draco/meshopt BYTE encode happens inside this one synchronous
		// writeBinary call — the detail line covers the silent window honestly.
		progress({ fraction: 0.85, detail: 'encoding geometry' });
		const outBytes = await io.writeBinary(document);
		const after = countGeometry(document);

		const stats: ModelStats = {
			trianglesBefore: before.triangles,
			trianglesAfter: after.triangles,
			verticesBefore: before.vertices,
			verticesAfter: after.vertices,
			texturesChanged: textures.changed,
			texturesTotal: textures.total,
			texturesSkipped: textures.skipped,
			texturesFailed: textures.failed,
			textureResized: textures.resized,
			inputCompression: scan.inputCompression
		};
		const result = { bytes: exactBuffer(outBytes), stats };
		return { result, transfer: [result.bytes] };
	}
});
