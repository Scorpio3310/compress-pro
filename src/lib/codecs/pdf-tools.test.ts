/**
 * pdf-tools guard tests: encrypted inputs must fail fast (pdf-lib cannot
 * decrypt — editing ciphertext ships corrupt pages), pdf.js loads must map
 * PasswordException to the app's Unlock hint WITHOUT leaking the load task's
 * worker, and toImages zip entry names must sort naturally past 99 pages.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

vi.mock('$lib/workers/rpc', () => ({ callWorker: vi.fn() }));
vi.mock('$lib/pdf-preview', () => ({ getPdfjs: vi.fn(), renderPdfPageToBlob: vi.fn() }));

import { getPdfjs, renderPdfPageToBlob } from '$lib/pdf-preview';
import { mergePdfs, pageNumbersPdf, pdfToImages, pdfToText, watermarkPdf } from './pdf-tools';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.mocked(getPdfjs).mockReset();
	vi.mocked(renderPdfPageToBlob).mockReset();
});

// ------------------------------------------------ encrypted pdf-lib inputs

/** Classic-xref (no ObjStm) so an encrypted file still PARSES — the silent
 *  corruption case; object-stream encrypted files already fail loudly. */
async function plainPdfBytes(): Promise<Uint8Array> {
	const { PDFDocument } = await import('pdf-lib');
	const doc = await PDFDocument.create();
	doc.addPage([300, 300]);
	return doc.save({ useObjectStreams: false });
}

/** Owner-locked AES-256 via the app's own qpdf engine (empty user password —
 *  opens without a prompt in every viewer, like permission-restricted PDFs). */
async function ownerLockedPdfBytes(): Promise<Uint8Array> {
	const factory = (await import('@neslinesli93/qpdf-wasm')).default;
	const wasmPath = join(process.cwd(), 'node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
	const lines: string[] = [];
	const capture = (...parts: unknown[]) => void lines.push(parts.join(' '));
	const originalLog = console.log;
	const originalError = console.error;
	console.log = capture;
	console.error = capture;
	try {
		const qpdf = await factory({ locateFile: () => wasmPath });
		(qpdf.FS as unknown as { writeFile(path: string, data: Uint8Array): void }).writeFile(
			'/in.pdf',
			await plainPdfBytes()
		);
		const exit = qpdf.callMain([
			'--warning-exit-0',
			'--encrypt',
			'',
			'owner-secret',
			'256',
			'--',
			'/in.pdf',
			'/out.pdf'
		]);
		if (exit !== 0) throw new Error(`qpdf encrypt exit ${exit}: ${lines.slice(-3).join(' | ')}`);
		return (qpdf.FS as unknown as { readFile(path: string): Uint8Array }).readFile('/out.pdf');
	} finally {
		console.log = originalLog;
		console.error = originalError;
	}
}

describe('encrypted inputs fail fast instead of shipping ciphertext', () => {
	let plain: File;
	let locked: File;

	beforeAll(async () => {
		plain = new File([(await plainPdfBytes()) as BlobPart], 'plain.pdf', {
			type: 'application/pdf'
		});
		locked = new File([(await ownerLockedPdfBytes()) as BlobPart], 'locked.pdf', {
			type: 'application/pdf'
		});
	}, 30_000);

	it('mergePdfs refuses an owner-locked PDF (would copy ciphertext pages)', async () => {
		await expect(mergePdfs([plain, locked])).rejects.toThrow(
			/locked\.pdf.*password-protected.*Unlock/
		);
	});

	it('watermarkPdf refuses an owner-locked PDF (stamp would decrypt to garbage)', async () => {
		await expect(watermarkPdf(locked, 'CONFIDENTIAL')).rejects.toThrow(/password-protected/);
	});

	it('pageNumbersPdf refuses an owner-locked PDF', async () => {
		await expect(pageNumbersPdf(locked)).rejects.toThrow(/password-protected/);
	});
});

// ------------------------------------------------ merge cancel seam (O-05)

describe('mergePdfs honors its AbortSignal', () => {
	async function pdfFile(name: string, pages = 1): Promise<File> {
		const { PDFDocument } = await import('pdf-lib');
		const doc = await PDFDocument.create();
		for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
		return new File([(await doc.save()) as BlobPart], name, { type: 'application/pdf' });
	}

	it('a pre-aborted signal stops the merge before any work', async () => {
		const a = await pdfFile('a.pdf');
		const controller = new AbortController();
		controller.abort();
		const ticks: (string | null)[] = [];
		await expect(
			mergePdfs([a, a], (_d, _t, detail) => void ticks.push(detail), controller.signal)
		).rejects.toThrow();
		expect(ticks).toEqual([]);
	});

	it('an abort mid-run stops before the next file and never reaches saving', async () => {
		const [a, b, c] = await Promise.all([
			pdfFile('a.pdf'),
			pdfFile('b.pdf', 60), // 60 pages → several copy chunks under the abort
			pdfFile('c.pdf')
		]);
		const controller = new AbortController();
		const ticks: (string | null)[] = [];
		await expect(
			mergePdfs(
				[a, b, c],
				(_d, _t, detail) => {
					ticks.push(detail);
					if (detail === 'b.pdf') controller.abort();
				},
				controller.signal
			)
		).rejects.toThrow();
		expect(ticks).not.toContain('c.pdf');
		expect(ticks).not.toContain('saving');
	});
});

// ------------------------------------------------------- pdf.js load path

function passwordException(): Error {
	const error = new Error('No password given');
	error.name = 'PasswordException';
	return error;
}

function fakeTask(promise: Promise<unknown>) {
	return { promise, destroy: vi.fn(async () => undefined) };
}

function mockGetDocument(task: ReturnType<typeof fakeTask>) {
	vi.mocked(getPdfjs).mockResolvedValue({ getDocument: () => task } as unknown as Awaited<
		ReturnType<typeof getPdfjs>
	>);
}

const aPdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'locked.pdf');

describe('pdf.js password handling', () => {
	it('pdfToText maps PasswordException to the Unlock hint and destroys the task', async () => {
		const rejection = Promise.reject(passwordException());
		rejection.catch(() => undefined); // observed later via the codec
		const task = fakeTask(rejection);
		mockGetDocument(task);
		await expect(pdfToText(aPdf())).rejects.toThrow(/locked\.pdf.*password-protected.*Unlock/);
		expect(task.destroy, 'failed load must not leak a pdf.js worker').toHaveBeenCalled();
	});

	it('pdfToImages maps PasswordException to the Unlock hint and destroys the task', async () => {
		const rejection = Promise.reject(passwordException());
		rejection.catch(() => undefined);
		const task = fakeTask(rejection);
		mockGetDocument(task);
		await expect(pdfToImages(aPdf(), { dpi: 72, format: 'jpg', quality: 80 })).rejects.toThrow(
			/locked\.pdf.*password-protected.*Unlock/
		);
		expect(task.destroy).toHaveBeenCalled();
	});

	it('pdfToText prefixes other load failures with the file name', async () => {
		const rejection = Promise.reject(new Error('Invalid PDF structure'));
		rejection.catch(() => undefined);
		mockGetDocument(fakeTask(rejection));
		await expect(pdfToText(aPdf())).rejects.toThrow(/locked\.pdf.*Invalid PDF structure/);
	});
});

// ------------------------------------------------------ toImages zip names

describe('pdfToImages zip entry names', () => {
	it('pads to the page-count width so 100+ pages sort naturally', async () => {
		const task = fakeTask(Promise.resolve({ numPages: 120 }));
		mockGetDocument(task);
		vi.mocked(renderPdfPageToBlob).mockResolvedValue({
			blob: new Blob([new Uint8Array([0xff, 0xd8])]),
			width: 10,
			height: 10,
			clamped: false
		});
		vi.stubGlobal('document', { createElement: () => ({}) });

		const out = await pdfToImages(new File([new Uint8Array(4)], 'big.pdf'), {
			dpi: 72,
			format: 'jpg',
			quality: 80
		});
		const { unzipSync } = await import('fflate');
		const names = Object.keys(unzipSync(new Uint8Array(await out.blob.arrayBuffer())));
		expect(names[0]).toBe('big-p001.jpg');
		expect(names[99]).toBe('big-p100.jpg');
		expect(names[119]).toBe('big-p120.jpg');
		expect([...names].sort(), 'lexicographic order = page order').toEqual(names);
	});
});
