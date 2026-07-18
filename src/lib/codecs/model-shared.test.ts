import { describe, expect, it } from 'vitest';
import {
	modelIdleTimeoutMs,
	modelInfo,
	scanGlbJson,
	sniffTexture,
	validateModelInput
} from './model-shared';
import type { ModelStats } from '$lib/workers/protocol';
import type { ModelSettings } from '$lib/types';

const bytes = (...list: number[]) => new Uint8Array(list);
const enc = (s: string) => new TextEncoder().encode(s);

function glbWithJson(json: object): Uint8Array {
	const body = enc(JSON.stringify(json));
	const out = new Uint8Array(20 + body.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, 0x46546c67, true); // 'glTF'
	view.setUint32(4, 2, true);
	view.setUint32(8, out.length, true);
	view.setUint32(12, body.length, true);
	view.setUint32(16, 0x4e4f534a, true); // 'JSON'
	out.set(body, 20);
	return out;
}

describe('sniffTexture', () => {
	it('recognizes jpg/png/webp/ktx2 by magic', () => {
		expect(sniffTexture(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg');
		expect(sniffTexture(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
		expect(
			sniffTexture(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))
		).toBe('webp');
		expect(sniffTexture(bytes(0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb))).toBe('ktx2');
	});

	it('rejects everything else', () => {
		expect(sniffTexture(enc('<svg/>'))).toBe(null);
		expect(sniffTexture(bytes())).toBe(null);
	});
});

describe('validateModelInput', () => {
	it('accepts a glTF 2.0 binary header', () => {
		expect(() => validateModelInput(glbWithJson({ asset: { version: '2.0' } }), 'model.glb')).not.toThrow();
	});

	it('routes .gltf (and any JSON) to the export-as-glb message', () => {
		expect(() => validateModelInput(enc('{"asset":{}}'), 'scene.gltf')).toThrow(/single \.glb/);
		expect(() => validateModelInput(glbWithJson({}), 'scene.gltf')).toThrow(/single \.glb/);
	});

	it('rejects non-glTF bytes and glTF 1.0', () => {
		expect(() => validateModelInput(bytes(1, 2, 3, 4), 'x.glb')).toThrow(/Not a glTF binary/);
		const v1 = glbWithJson({});
		new DataView(v1.buffer).setUint32(4, 1, true);
		expect(() => validateModelInput(v1, 'old.glb')).toThrow(/glTF 1\.0/);
	});
});

describe('scanGlbJson', () => {
	it('rejects external buffer/image references with the uri in the message', () => {
		expect(() =>
			scanGlbJson(glbWithJson({ buffers: [{ uri: 'scene.bin', byteLength: 4 }] }))
		).toThrow(/scene\.bin.*self-contained/);
		expect(() => scanGlbJson(glbWithJson({ images: [{ uri: 'tex.png' }] }))).toThrow(/tex\.png/);
	});

	it('accepts data: uris and embedded buffers', () => {
		expect(
			scanGlbJson(glbWithJson({ buffers: [{ byteLength: 4 }, { uri: 'data:application/octet-stream;base64,AAAA' }] }))
		).toEqual({ inputCompression: null });
	});

	it('reads the input compression from extensionsRequired', () => {
		expect(
			scanGlbJson(glbWithJson({ extensionsRequired: ['KHR_draco_mesh_compression'] }))
				.inputCompression
		).toBe('draco');
		expect(
			scanGlbJson(glbWithJson({ extensionsRequired: ['EXT_meshopt_compression'] })).inputCompression
		).toBe('meshopt');
	});
});

describe('modelInfo', () => {
	const stats = (over: Partial<ModelStats>): ModelStats => ({
		trianglesBefore: 24_320,
		trianglesAfter: 24_320,
		verticesBefore: 12_511,
		verticesAfter: 12_511,
		texturesChanged: 0,
		texturesTotal: 0,
		texturesSkipped: 0,
		texturesFailed: 0,
		textureResized: false,
		inputCompression: null,
		...over
	});
	const settings = (compression: ModelSettings['compression']): ModelSettings => ({
		compression,
		simplify: null,
		textureQuality: 80,
		textureMaxDimension: null
	});

	it('names the codec and the texture outcome', () => {
		expect(modelInfo(stats({ texturesChanged: 1, texturesTotal: 1 }), settings('draco'))).toBe(
			'Draco geometry · 1 of 1 texture recompressed'
		);
		expect(modelInfo(stats({}), settings('none'))).toBe('Geometry quantized');
	});

	it('reports simplify as a triangle count arrow', () => {
		expect(modelInfo(stats({ trianglesAfter: 12_159 }), settings('meshopt'))).toBe(
			'Meshopt geometry · 24.3k → 12.2k triangles'
		);
	});

	it('counts GPU-format textures separately', () => {
		expect(
			modelInfo(
				stats({ texturesChanged: 1, texturesTotal: 3, texturesSkipped: 2 }),
				settings('draco')
			)
		).toBe('Draco geometry · 1 of 1 texture recompressed (2 GPU-format kept)');
	});
});

describe('modelIdleTimeoutMs', () => {
	it('floors at 10 minutes and scales 4 s per MB', () => {
		expect(modelIdleTimeoutMs(1024)).toBe(10 * 60_000);
		expect(modelIdleTimeoutMs(500 * 2 ** 20)).toBe(500 * 4000);
	});
});
