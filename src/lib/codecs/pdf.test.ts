/**
 * Target-size honesty: the link transplant re-save (pdf-lib, no object
 * streams) can grow the winning gs rung past targetBytes. The search must
 * judge rungs by the size the user actually downloads — and when even that
 * final size misses the target, say so instead of shipping silently over.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/workers/rpc', () => ({ callWorker: vi.fn() }));
vi.mock('./pdf-interactive', () => ({
	scanInteractive: vi.fn(),
	prepareInteractive: vi.fn(),
	transplantLinks: vi.fn()
}));

import { callWorker } from '$lib/workers/rpc';
import { prepareInteractive, scanInteractive, transplantLinks } from './pdf-interactive';
import { compressPdf } from './pdf';
import type { PdfCompressionSettings } from '$lib/types';

const EOF = new TextEncoder().encode('\n%%EOF\n');

/** Fake gs output of `size` bytes ending in %%EOF (the truncation check). */
function gsOutput(size: number): ArrayBuffer {
	const bytes = new Uint8Array(size);
	bytes.set(EOF, size - EOF.length);
	return bytes.buffer;
}

const TARGET_SETTINGS: PdfCompressionSettings = {
	op: 'compress',
	mode: 'target',
	level: 'medium',
	targetMb: 0.01, // 10 000 bytes
	mergeCompress: false,
	pageRange: '',
	pageMode: 'keep',
	imageDpi: 150,
	imageFormat: 'jpg',
	imageQuality: 80,
	password: '',
	rotation: 90,
	watermarkText: ''
};

// 50 kB input: comfortably over the 10 kB target, so keep-original stays out.
const inputFile = () =>
	new File([new Uint8Array(50_000)], 'linked.pdf', { type: 'application/pdf' });

beforeEach(() => {
	vi.mocked(callWorker).mockReset();
	vi.mocked(scanInteractive).mockReturnValue(true);
	vi.mocked(prepareInteractive).mockImplementation(async (bytes: ArrayBuffer) => ({
		bytes,
		links: [{ pageIndex: 0 } as never],
		flattened: false
	}));
	// Every gs rung lands under target — raw sizes alone would report success.
	vi.mocked(callWorker).mockImplementation(async () => gsOutput(9_500));
});

describe('compressPdf target mode with links', () => {
	it('warns when the link transplant pushes the final file over the target', async () => {
		// Transplant re-save expands every rung past the 10 kB target.
		vi.mocked(transplantLinks).mockImplementation(async () => new Uint8Array(11_000));

		const result = await compressPdf(inputFile(), TARGET_SETTINGS, () => undefined);
		expect(result.blob.size).toBe(11_000);
		expect(result.warning, 'a missed target must be reported').toMatch(/not reachable/i);
	});

	it('stays silent when the transplanted result fits the target', async () => {
		vi.mocked(transplantLinks).mockImplementation(async (out: Uint8Array) => out);

		const result = await compressPdf(inputFile(), TARGET_SETTINGS, () => undefined);
		expect(result.blob.size).toBeLessThanOrEqual(10_000);
		expect(result.warning).toBeNull();
	});
});
