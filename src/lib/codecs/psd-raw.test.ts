import { describe, expect, it } from 'vitest';
import { decodeRawPsdComposite } from './psd-raw';

/** Minimal hand-rolled PSD: header + empty-ish sections + composite planes. */
function buildPsd(opts: {
	width: number;
	height: number;
	channels: number;
	colorMode: 1 | 3;
	compression: 0 | 1;
	planes: Uint8Array[];
	depth?: number;
}): ArrayBuffer {
	const { width, height, channels, colorMode, compression, planes, depth = 8 } = opts;
	const sections = new Uint8Array(24);
	const sv = new DataView(sections.buffer);
	sv.setUint32(8, 12); // layer&mask outer length (generate-fixtures layout)
	sv.setUint32(12, 8);
	const planeBytes = planes.reduce((n, p) => n + p.length, 0);
	const buf = new Uint8Array(26 + sections.length + 2 + planeBytes);
	const view = new DataView(buf.buffer);
	view.setUint32(0, 0x38425053);
	view.setUint16(4, 1);
	view.setUint16(12, channels);
	view.setUint32(14, height);
	view.setUint32(18, width);
	view.setUint16(22, depth);
	view.setUint16(24, colorMode);
	buf.set(sections, 26);
	view.setUint16(26 + sections.length, compression);
	let at = 26 + sections.length + 2;
	for (const p of planes) {
		buf.set(p, at);
		at += p.length;
	}
	return buf.buffer;
}

const plane = (w: number, h: number, value: number) => new Uint8Array(w * h).fill(value);

describe('decodeRawPsdComposite', () => {
	it('decodes planar RGB (the upstream all-red bug shape)', () => {
		const img = decodeRawPsdComposite(
			buildPsd({
				width: 4,
				height: 2,
				channels: 3,
				colorMode: 3,
				compression: 0,
				planes: [plane(4, 2, 10), plane(4, 2, 20), plane(4, 2, 30)]
			})
		);
		expect(img).not.toBeNull();
		expect([img!.width, img!.height]).toEqual([4, 2]);
		// Distinct per-channel values prove planes are NOT read from one offset.
		expect([...img!.data.slice(0, 4)]).toEqual([10, 20, 30, 255]);
		expect([...img!.data.slice(-4)]).toEqual([10, 20, 30, 255]);
	});

	it('keeps a 4th channel as alpha', () => {
		const img = decodeRawPsdComposite(
			buildPsd({
				width: 2,
				height: 2,
				channels: 4,
				colorMode: 3,
				compression: 0,
				planes: [plane(2, 2, 1), plane(2, 2, 2), plane(2, 2, 3), plane(2, 2, 128)]
			})
		);
		expect([...img!.data.slice(0, 4)]).toEqual([1, 2, 3, 128]);
	});

	it('expands grayscale to RGB', () => {
		const img = decodeRawPsdComposite(
			buildPsd({
				width: 3,
				height: 1,
				channels: 1,
				colorMode: 1,
				compression: 0,
				planes: [new Uint8Array([0, 128, 255])]
			})
		);
		expect([...img!.data.slice(4, 8)]).toEqual([128, 128, 128, 255]);
	});

	it('declines RLE, truncated and non-PSD input', () => {
		const rle = buildPsd({
			width: 2,
			height: 2,
			channels: 3,
			colorMode: 3,
			compression: 1,
			planes: [plane(2, 2, 9), plane(2, 2, 9), plane(2, 2, 9)]
		});
		expect(decodeRawPsdComposite(rle)).toBeNull();
		const truncated = buildPsd({
			width: 100,
			height: 100,
			channels: 3,
			colorMode: 3,
			compression: 0,
			planes: [plane(2, 2, 9)] // far too few bytes for 100×100×3
		});
		expect(decodeRawPsdComposite(truncated)).toBeNull();
		expect(decodeRawPsdComposite(new ArrayBuffer(100))).toBeNull();
		const cmyk = buildPsd({
			width: 2,
			height: 2,
			channels: 4,
			colorMode: 3,
			compression: 0,
			planes: [plane(2, 2, 9), plane(2, 2, 9), plane(2, 2, 9), plane(2, 2, 9)],
			depth: 16
		});
		expect(decodeRawPsdComposite(cmyk), '16-bit declined').toBeNull();
	});
});
