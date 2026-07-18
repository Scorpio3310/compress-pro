/**
 * Worker-logic tests for the font convert handler — quality-sweep coverage:
 * passthrough validation of corrupt containers, fail-fast woff2 wasm load,
 * WOFF2-packed collections, the CFF→EOT refusal, abort recovery, and the
 * WOFF meta/priv disclosure note.
 *
 * The woff2 emscripten glue cannot init inside vitest (its browser path
 * fetches the wasm URL), so `fonteditor-core/woff2` is mocked; hb is never
 * reached. `expose` is mocked to hand the handlers back for direct calls —
 * the wire protocol itself is covered by host/rpc tests and e2e.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Handlers } from './host';
import type { WorkerContracts } from './protocol';
import {
	buildHead,
	buildName,
	buildOs2,
	buildSfnt,
	noiseBytes
} from '$lib/codecs/font-test-helpers';
import { wrapWoff1 } from '$lib/codecs/woff1';
import { wrapEot } from '$lib/codecs/eot';
import { SFNT_OTTO, SFNT_TTC, SFNT_TTF } from '$lib/codecs/sfnt';
import { sniffFont } from '$lib/codecs/font-sniff';

const captured = vi.hoisted(() => ({ handlers: null as unknown }));
vi.mock('./host', () => ({
	expose: (handlers: unknown) => {
		captured.handlers = handlers;
	}
}));

const woff2Mock = vi.hoisted(() => ({
	init: vi.fn(),
	encode: vi.fn(),
	decode: vi.fn(),
	dispose: vi.fn()
}));
vi.mock('fonteditor-core/woff2', () => ({ default: woff2Mock }));

type FontHandlers = Handlers<WorkerContracts['font']>;

/** Fresh module state (woff2Promise etc.) per test. */
async function loadWorker(): Promise<FontHandlers> {
	vi.resetModules();
	await import('./font.worker');
	return captured.handlers as FontHandlers;
}

const noop = () => {};

const ab = (u8: Uint8Array): ArrayBuffer =>
	u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

const ttfSfnt = () =>
	buildSfnt(SFNT_TTF, [
		{ tag: 'glyf', data: noiseBytes(64) },
		{ tag: 'head', data: buildHead() },
		{ tag: 'name', data: buildName({ 1: 'Fixture' }) },
		{ tag: 'OS/2', data: buildOs2() }
	]);

const otfSfnt = () =>
	buildSfnt(SFNT_OTTO, [
		{ tag: 'CFF ', data: noiseBytes(64) },
		{ tag: 'head', data: buildHead() },
		{ tag: 'name', data: buildName({ 1: 'Fixture' }) }
	]);

/** wOF2 magic + an arbitrary inner flavor, junk body — enough for sniffing. */
function fakeWoff2(innerFlavor: number): Uint8Array {
	const out = new Uint8Array(48);
	const dv = new DataView(out.buffer);
	dv.setUint32(0, 0x774f4632); // 'wOF2'
	dv.setUint32(4, innerFlavor);
	return out;
}

/** Append a WOFF extended-metadata (and optional private) block and set the
 *  header fields — built by hand so the test doesn't trust wrapWoff1 with the
 *  very fields under test. */
function withWoffBlocks(woff: Uint8Array, meta: Uint8Array, priv?: Uint8Array): Uint8Array {
	const out = new Uint8Array(woff.length + meta.length + (priv?.length ?? 0));
	out.set(woff, 0);
	out.set(meta, woff.length);
	if (priv) out.set(priv, woff.length + meta.length);
	const dv = new DataView(out.buffer);
	dv.setUint32(8, out.length); // header length = whole file
	dv.setUint32(24, woff.length); // metaOffset
	dv.setUint32(28, meta.length); // metaLength
	dv.setUint32(32, meta.length); // metaOrigLength
	if (priv) {
		dv.setUint32(36, woff.length + meta.length); // privOffset
		dv.setUint32(40, priv.length); // privLength
	}
	return out;
}

const okFetch = () => vi.fn(async () => new Response(new Uint8Array(8), { status: 200 }));

beforeEach(() => {
	woff2Mock.init.mockReset().mockResolvedValue(undefined);
	woff2Mock.encode.mockReset().mockImplementation(() => fakeWoff2(SFNT_TTF));
	woff2Mock.decode.mockReset().mockImplementation(() => ttfSfnt());
	woff2Mock.dispose.mockReset();
	vi.stubGlobal('fetch', okFetch());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('convert passthrough validates the whole container', () => {
	it('rejects a truncated WOFF instead of shipping it back as success', async () => {
		const handlers = await loadWorker();
		const truncated = wrapWoff1(ttfSfnt()).slice(0, 100);
		await expect(handlers.convert({ bytes: ab(truncated), to: 'woff' }, noop)).rejects.toThrow(
			/valid WOFF/
		);
	});

	it('rejects a truncated EOT on the eot→eot path', async () => {
		const handlers = await loadWorker();
		const truncated = wrapEot(ttfSfnt()).slice(0, 90);
		await expect(handlers.convert({ bytes: ab(truncated), to: 'eot' }, noop)).rejects.toThrow(
			/valid EOT/
		);
	});

	it('runs a corrupt WOFF2 through the decoder instead of passing it through', async () => {
		const handlers = await loadWorker();
		woff2Mock.decode.mockImplementation(() => new Uint8Array(0)); // decoder refusal
		await expect(
			handlers.convert({ bytes: ab(fakeWoff2(SFNT_TTF)), to: 'woff2' }, noop)
		).rejects.toThrow(/WOFF2 decoding failed/);
		expect(woff2Mock.decode).toHaveBeenCalled();
	});

	it('still passes a WHOLE woff through byte-identical (meta blocks included)', async () => {
		const handlers = await loadWorker();
		const woff = withWoffBlocks(wrapWoff1(ttfSfnt()), new TextEncoder().encode('<metadata/>'));
		const out = await handlers.convert({ bytes: ab(woff), to: 'woff' }, noop);
		expect(new Uint8Array(out.result.bytes)).toEqual(woff);
		expect(out.result.note).toBeNull(); // nothing dropped — no note owed
	});
});

describe('woff2 engine load fails fast instead of hanging until the watchdog', () => {
	it('surfaces an honest connection error when the wasm fetch fails, and recovers', async () => {
		const handlers = await loadWorker();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			})
		);
		const src = ttfSfnt();
		await expect(handlers.convert({ bytes: ab(src), to: 'woff2' }, noop)).rejects.toThrow(
			/check your connection/
		);
		expect(woff2Mock.init).not.toHaveBeenCalled();

		// Network back: the cached failure must not brick later jobs.
		vi.stubGlobal('fetch', okFetch());
		const out = await handlers.convert({ bytes: ab(src), to: 'woff2' }, noop);
		expect(out.result.outputFormat).toBe('woff2');
	});

	it('hands the glue a blob: URL so its own fetch cannot hit the network', async () => {
		const handlers = await loadWorker();
		await handlers.convert({ bytes: ab(ttfSfnt()), to: 'woff2' }, noop);
		expect(woff2Mock.init).toHaveBeenCalledWith(expect.stringMatching(/^blob:/));
	});
});

describe('WOFF2-packed collections (ttcf inner flavor)', () => {
	it('sniffFont reports the collection container', () => {
		expect(sniffFont(fakeWoff2(SFNT_TTC))).toEqual({ container: 'ttc', flavor: null });
		// WOFF1 variant: same rule.
		const woff1 = fakeWoff2(SFNT_TTC);
		new DataView(woff1.buffer).setUint32(0, 0x774f4646); // 'wOFF'
		expect(sniffFont(woff1)).toEqual({ container: 'ttc', flavor: null });
	});

	it('convert fails with the collections hint, not a generic invalid-font error', async () => {
		const handlers = await loadWorker();
		await expect(
			handlers.convert({ bytes: ab(fakeWoff2(SFNT_TTC)), to: 'ttf' }, noop)
		).rejects.toThrow(/extract a single font/);
	});
});

describe('CFF → EOT refusal', () => {
	it('refuses to wrap CFF outlines into an EOT no consumer can render', async () => {
		const handlers = await loadWorker();
		await expect(handlers.convert({ bytes: ab(otfSfnt()), to: 'eot' }, noop)).rejects.toThrow(
			/CFF/
		);
	});

	it('still wraps TrueType-flavored fonts into EOT', async () => {
		const handlers = await loadWorker();
		const out = await handlers.convert({ bytes: ab(ttfSfnt()), to: 'eot' }, noop);
		expect(out.result.outputFormat).toBe('eot');
	});
});

describe('woff2 abort recovery', () => {
	it('an emscripten abort disposes the poisoned module, fails honestly, next job re-inits', async () => {
		const handlers = await loadWorker();
		woff2Mock.encode.mockImplementationOnce(() => {
			// emscripten's abort() throws a raw STRING, not an Error.
			throw 'abort(Cannot enlarge memory arrays) at Error';
		});
		const src = ttfSfnt();
		const failed = handlers.convert({ bytes: ab(src), to: 'woff2' }, noop);
		await expect(failed).rejects.toBeInstanceOf(Error);
		await expect(failed).rejects.toThrow(/WOFF2 engine crashed/);
		expect(woff2Mock.dispose).toHaveBeenCalled();

		const initCalls = woff2Mock.init.mock.calls.length;
		const out = await handlers.convert({ bytes: ab(src), to: 'woff2' }, noop);
		expect(out.result.outputFormat).toBe('woff2');
		expect(woff2Mock.init.mock.calls.length).toBe(initCalls + 1); // fresh instance
	});

	it('a plain Error from the codec is passed through without nuking the instance', async () => {
		const handlers = await loadWorker();
		woff2Mock.encode.mockImplementationOnce(() => {
			throw new Error('BindingError: expected instance');
		});
		await expect(handlers.convert({ bytes: ab(ttfSfnt()), to: 'woff2' }, noop)).rejects.toThrow(
			/BindingError/
		);
		expect(woff2Mock.dispose).not.toHaveBeenCalled();
	});
});

describe('WOFF meta/priv disclosure', () => {
	it('woff→ttf notes the dropped extended metadata', async () => {
		const handlers = await loadWorker();
		const woff = withWoffBlocks(wrapWoff1(ttfSfnt()), new TextEncoder().encode('<metadata/>'));
		const out = await handlers.convert({ bytes: ab(woff), to: 'ttf' }, noop);
		expect(out.result.note).toMatch(/extended metadata/);
	});

	it('mentions the private block too when both are present', async () => {
		const handlers = await loadWorker();
		const woff = withWoffBlocks(
			wrapWoff1(ttfSfnt()),
			new TextEncoder().encode('<metadata/>'),
			noiseBytes(16)
		);
		const out = await handlers.convert({ bytes: ab(woff), to: 'ttf' }, noop);
		expect(out.result.note).toMatch(/extended metadata/);
		expect(out.result.note).toMatch(/private data/);
	});

	it('stays silent for a plain WOFF with no extra blocks', async () => {
		const handlers = await loadWorker();
		const out = await handlers.convert({ bytes: ab(wrapWoff1(ttfSfnt())), to: 'ttf' }, noop);
		expect(out.result.note).toBeNull();
	});
});
