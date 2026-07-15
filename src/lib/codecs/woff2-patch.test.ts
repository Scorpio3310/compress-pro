/**
 * Pins the pnpm-patched fonteditor-core woff2 additions (patches/):
 * - convertFromVecToUint8Array releases its embind vector (leak fix) — the
 *   wasm heap must not grow across repeated rounds;
 * - dispose() drops the emscripten instance so font.worker can release the
 *   heap after huge jobs, and a re-init produces identical output.
 * Uses the generated tiny font (self-skips before `pnpm fixtures`, same rule
 * as real-fonts.test.ts — skips are logged, never silent).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const TINY = join(process.cwd(), 'tests', 'fixtures', 'generated', 'font-tiny.ttf');
const available = existsSync(TINY);
if (!available) console.warn('woff2-patch.test: run `pnpm fixtures` first — skipping');

type PatchedWoff2 = {
	init(): Promise<unknown>;
	isInited(): boolean;
	encode(b: Uint8Array): Uint8Array;
	decode(b: Uint8Array): Uint8Array;
	dispose(): void;
	woff2Module: { HEAP8: Int8Array } | null;
};

describe.runIf(available)('patched fonteditor-core woff2', () => {
	let woff2: PatchedWoff2;
	let ttf: Uint8Array;

	beforeAll(async () => {
		woff2 = (await import('fonteditor-core/woff2')).default as unknown as PatchedWoff2;
		await woff2.init();
		ttf = new Uint8Array(readFileSync(TINY));
	});

	it('dispose() drops the instance; re-init encodes identically', async () => {
		const before = woff2.encode(ttf);
		expect(before.length).toBeGreaterThan(0);

		woff2.dispose();
		expect(woff2.isInited()).toBeFalsy();

		await woff2.init();
		expect(woff2.isInited()).toBeTruthy();
		const after = woff2.encode(ttf);
		expect(Buffer.from(after).equals(Buffer.from(before))).toBe(true);
	});

	it('repeated rounds leave the wasm heap flat (vector.delete leak fix)', () => {
		woff2.decode(woff2.encode(ttf)); // establish the high-water mark
		const highWater = woff2.woff2Module!.HEAP8.length;
		for (let i = 0; i < 8; i++) woff2.decode(woff2.encode(ttf));
		expect(woff2.woff2Module!.HEAP8.length).toBe(highWater);
	});
});
