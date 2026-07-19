import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { RAW_OPEN_SETTINGS, decodeRaw } from './raw';

// Capture what decodeRaw asks of LibRaw without spinning the package's own
// web worker (which can't run under node) — the wasm-level effect of these
// settings is covered by the develop test below.
const openSpy = vi.fn<(bytes: Uint8Array, settings?: object) => Promise<void>>();

/** Swappable decoder body so one module-level mock serves both the settings
 *  tests (default) and the concurrency test (shared-state decoder). */
let decoderImpl: {
	open(bytes: Uint8Array, settings?: object): Promise<void>;
	imageData(): Promise<unknown>;
	dispose(): void;
} = {
	open: openSpy,
	async imageData() {
		return { width: 2, height: 1, colors: 3, bits: 8, dataSize: 6, data: new Uint8Array(6) };
	},
	dispose() {}
};

vi.mock('libraw-wasm', () => ({
	default: class {
		open(bytes: Uint8Array, settings?: object) {
			return decoderImpl.open(bytes, settings);
		}
		imageData() {
			return decoderImpl.imageData();
		}
		dispose() {
			decoderImpl.dispose();
		}
	}
}));

describe('decodeRaw', () => {
	it('develops with the camera as-shot white balance, not the daylight default', async () => {
		// libraw-wasm defaults to useCameraWb: false (LibRaw's -w off) — every
		// non-daylight shot would ship with a heavy color cast unless the codec
		// asks for the as-shot multipliers explicitly.
		await decodeRaw(new File([new Uint8Array([73, 73, 42, 0])], 'shot.dng'));
		expect(openSpy).toHaveBeenCalledTimes(1);
		expect(openSpy.mock.calls[0][1]).toMatchObject({ outputBps: 8, useCameraWb: true });
	});

	it('concurrent decodes never cross wires on the shared engine (F-71)', async () => {
		// The libraw worker is ONE shared instance; open() and imageData() are two
		// separate awaited calls. Without a per-decode lock, file B's open slips
		// between file A's open and imageData, so A gets B's pixels — the matrix
		// visual inspector caught exactly this (ARW got the CR2's photo).
		let current: number | null = null;
		decoderImpl = {
			async open(bytes) {
				await Promise.resolve(); // yield — invites interleaving
				current = bytes[0];
			},
			async imageData() {
				await Promise.resolve();
				return {
					width: 1,
					height: 1,
					colors: 3,
					bits: 8,
					dataSize: 3,
					data: new Uint8Array([current!, 0, 0])
				};
			},
			dispose() {}
		};
		try {
			const results = await Promise.all([
				decodeRaw(new File([new Uint8Array([11, 0, 0, 0])], 'a.dng')),
				decodeRaw(new File([new Uint8Array([22, 0, 0, 0])], 'b.dng')),
				decodeRaw(new File([new Uint8Array([33, 0, 0, 0])], 'c.dng'))
			]);
			// Each decode must carry ITS OWN first byte through to its pixels.
			expect(new Uint8Array(results[0].data)[0]).toBe(11);
			expect(new Uint8Array(results[1].data)[0]).toBe(22);
			expect(new Uint8Array(results[2].data)[0]).toBe(33);
		} finally {
			decoderImpl = {
				open: openSpy,
				async imageData() {
					return { width: 2, height: 1, colors: 3, bits: 8, dataSize: 6, data: new Uint8Array(6) };
				},
				dispose() {}
			};
		}
	});

	it('RAW_OPEN_SETTINGS actually shifts the develop of an as-shot-neutral DNG', async () => {
		// Real wasm (single-thread node build — the same LibRaw the browser
		// runs): a tungsten-ish AsShotNeutral must change the channel balance
		// versus a WB-off develop. Guards against the settings key silently
		// losing its effect on a package upgrade.
		const dng = buildLinearDng(64, 48, Buffer.alloc(64 * 48 * 3, 100), {
			asShotNeutral: [0.45, 1.0, 0.85]
		});
		const wbOff = await developMeans(dng, { outputBps: 8 });
		const codec = await developMeans(dng, RAW_OPEN_SETTINGS);
		// WB-off leaves the flat gray balanced; as-shot multipliers (1/neutral)
		// push red up relative to green — assert a clear channel divergence.
		expect(Math.abs(wbOff[0] - wbOff[1])).toBeLessThan(2);
		expect(codec[0] - codec[1]).toBeGreaterThan(10);
	}, 30_000);
});

/** Develop `dng` with the node factory build and return per-channel means. */
async function developMeans(dng: Buffer, settings: object): Promise<[number, number, number]> {
	const require = createRequire(import.meta.url);
	const factory = (await import('libraw-wasm/dist/libraw.js')).default;
	const mod = await factory({
		wasmBinary: readFileSync(require.resolve('libraw-wasm/dist/libraw.wasm'))
	});
	const lr = new mod.LibRaw();
	lr.open(new Uint8Array(dng), settings);
	const img = lr.imageData();
	const n = img.width * img.height;
	const sum = [0, 0, 0];
	for (let i = 0; i < n; i++) {
		sum[0] += img.data[i * 3];
		sum[1] += img.data[i * 3 + 1];
		sum[2] += img.data[i * 3 + 2];
	}
	return [sum[0] / n, sum[1] / n, sum[2] / n];
}

/** Minimal LinearRaw DNG (mirrors the fixture generator's builder) with an
 *  optional AsShotNeutral tag — the camera's recorded white balance. */
function buildLinearDng(
	width: number,
	height: number,
	rgb: Buffer,
	opts: { asShotNeutral?: [number, number, number] } = {}
): Buffer {
	const model = 'CompressPro Fixture\0';
	interface Entry {
		tag: number;
		type: number;
		count: number;
		value: number | { extra?: Buffer; strip?: boolean } | null;
		offset?: number;
	}
	const entries: Entry[] = [];
	const push = (tag: number, type: number, count: number, value: Entry['value']) =>
		entries.push({ tag, type, count, value });
	push(254, 4, 1, 0); // NewSubfileType
	push(256, 4, 1, width);
	push(257, 4, 1, height);
	push(258, 3, 3, { extra: Buffer.from(new Uint16Array([8, 8, 8]).buffer) }); // BitsPerSample
	push(259, 3, 1, 1); // Compression: none
	push(262, 3, 1, 34892); // PhotometricInterpretation: LinearRaw
	push(273, 4, 1, { strip: true }); // StripOffsets
	push(277, 3, 1, 3); // SamplesPerPixel
	push(278, 4, 1, height); // RowsPerStrip
	push(279, 4, 1, rgb.length); // StripByteCounts
	push(284, 3, 1, 1); // PlanarConfiguration: chunky
	push(50706, 1, 4, null); // DNGVersion 1.4.0.0
	push(50708, 2, model.length, { extra: Buffer.from(model, 'ascii') }); // UniqueCameraModel
	if (opts.asShotNeutral) {
		const extra = Buffer.alloc(24); // 3 RATIONALs (num/denom uint32 pairs)
		opts.asShotNeutral.forEach((v, i) => {
			extra.writeUInt32LE(Math.round(v * 10000), i * 8);
			extra.writeUInt32LE(10000, i * 8 + 4);
		});
		push(50728, 5, 3, { extra }); // AsShotNeutral
	}
	entries.sort((a, b) => a.tag - b.tag);
	const ifdSize = 2 + entries.length * 12 + 4;
	let extraOffset = 8 + ifdSize;
	for (const e of entries) {
		const extra = typeof e.value === 'object' ? e.value?.extra : undefined;
		if (extra) {
			e.offset = extraOffset;
			extraOffset += extra.length + (extra.length % 2);
		}
	}
	const stripOffset = extraOffset;
	const buf = Buffer.alloc(stripOffset + rgb.length);
	buf.write('II', 0, 'ascii');
	buf.writeUInt16LE(42, 2);
	buf.writeUInt32LE(8, 4);
	let o = 8;
	buf.writeUInt16LE(entries.length, o);
	o += 2;
	for (const e of entries) {
		buf.writeUInt16LE(e.tag, o);
		buf.writeUInt16LE(e.type, o + 2);
		buf.writeUInt32LE(e.count, o + 4);
		const obj = typeof e.value === 'object' ? e.value : null;
		if (obj?.strip) buf.writeUInt32LE(stripOffset, o + 8);
		else if (obj?.extra) buf.writeUInt32LE(e.offset ?? 0, o + 8);
		else if (e.tag === 50706) {
			buf[o + 8] = 1; // DNGVersion bytes 1.4.0.0
			buf[o + 9] = 4;
		} else if (e.type === 3) buf.writeUInt16LE(e.value as number, o + 8);
		else buf.writeUInt32LE((e.value as number) ?? 0, o + 8);
		o += 12;
	}
	buf.writeUInt32LE(0, o); // no next IFD
	for (const e of entries) {
		const extra = typeof e.value === 'object' ? e.value?.extra : undefined;
		if (extra && e.offset) extra.copy(buf, e.offset);
	}
	rgb.copy(buf, stripOffset);
	return buf;
}
