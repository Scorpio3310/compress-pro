/**
 * RAW-composite PSD decoding (compression 0). @webtoon/psd reads every raw
 * plane from one offset (upstream bug: all channels come back as the red
 * plane), and real-world flattened PSDs commonly store raw composites — every
 * filesamples.com sample does (quality sweep F-05). The composite layout is
 * trivial, so decode it ourselves: 26-byte header, three length-prefixed
 * sections (color mode data, image resources, layer & mask), then a u16
 * compression marker followed by planar 8-bit channel dumps.
 *
 * Pure module (no ImageData) so node-side unit tests cover it; the image
 * worker wraps the pixels. Returns null whenever anything is off — callers
 * keep their honest error path.
 */

export interface RawPsdImage {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

export function decodeRawPsdComposite(bytes: ArrayBuffer): RawPsdImage | null {
	if (bytes.byteLength < 36) return null;
	const view = new DataView(bytes);
	if (view.getUint32(0) !== 0x38425053 || view.getUint16(4) !== 1) return null; // '8BPS' v1
	const channels = view.getUint16(12);
	const height = view.getUint32(14);
	const width = view.getUint32(18);
	const depth = view.getUint16(22);
	const colorMode = view.getUint16(24);
	// 8-bit RGB or grayscale only — matches the worker's decodePsd gate.
	if (depth !== 8 || (colorMode !== 3 && colorMode !== 1)) return null;
	if (colorMode === 3 && channels < 3) return null;
	if (width === 0 || height === 0 || width * height > 268_435_456) return null;

	let at = 26;
	for (let s = 0; s < 3; s++) {
		if (at + 4 > bytes.byteLength) return null;
		at += 4 + view.getUint32(at);
	}
	if (at + 2 > bytes.byteLength) return null;
	if (view.getUint16(at) !== 0) return null; // not RawData — library handles RLE
	at += 2;

	const plane = width * height;
	const alphaIndex = colorMode === 3 ? 3 : 1;
	const usable = Math.min(channels, alphaIndex + 1);
	if (at + usable * plane > bytes.byteLength) return null;

	const src = new Uint8Array(bytes);
	const chan = (i: number) => src.subarray(at + i * plane, at + (i + 1) * plane);
	const r = chan(0);
	const g = colorMode === 3 ? chan(1) : r;
	const b = colorMode === 3 ? chan(2) : r;
	const a = channels > alphaIndex ? chan(alphaIndex) : null;

	const out = new Uint8ClampedArray(plane * 4);
	for (let i = 0; i < plane; i++) {
		const o = i * 4;
		out[o] = r[i];
		out[o + 1] = g[i];
		out[o + 2] = b[i];
		out[o + 3] = a ? a[i] : 255;
	}
	return { data: out, width, height };
}
