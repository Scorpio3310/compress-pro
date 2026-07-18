/**
 * Dispatch-level contracts of compress.ts, with the codecs mocked out:
 * signed savings, the keep-original guard's warning reset, OCR op/file
 * reconciliation, the wasm-decode bridge for SVG output, and merge Cancel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressFiles, runPdfTool, savingsPercent } from './compress';
import { compressImage } from './codecs/image';
import { vectorizeImage } from './codecs/vectorize';
import { decodeRaw } from './codecs/raw';
import { mergePdfs } from './codecs/pdf-tools';
import { ocrImage, ocrPdf } from './codecs/ocr';
import type {
	ImageCompressionSettings,
	OcrSettings,
	PdfCompressionSettings,
	ProgressInfo,
	UploadedFile
} from './types';

vi.mock('$lib/codecs/image', () => ({ compressImage: vi.fn() }));
vi.mock('$lib/codecs/vectorize', () => ({ vectorizeImage: vi.fn() }));
vi.mock('$lib/codecs/raw', () => ({ decodeRaw: vi.fn() }));
vi.mock('$lib/codecs/ocr', () => ({ ocrImage: vi.fn(), ocrPdf: vi.fn() }));
vi.mock('$lib/codecs/pdf-tools', () => ({ mergePdfs: vi.fn(), imagesToPdf: vi.fn() }));

const objectUrls = URL as unknown as {
	createObjectURL?: (blob: Blob) => string;
	revokeObjectURL?: (url: string) => void;
};

beforeEach(() => {
	objectUrls.createObjectURL = () => 'blob:test';
	objectUrls.revokeObjectURL = () => {};
});

afterEach(() => {
	delete objectUrls.createObjectURL;
	delete objectUrls.revokeObjectURL;
	vi.clearAllMocks();
});

function up(name: string, content: BlobPart[] = ['x'], type = ''): UploadedFile {
	const file = new File(content, name, { type });
	return { id: name, file, name, size: file.size, objectUrl: 'blob:test' };
}

const IMG: ImageCompressionSettings = {
	quality: 80,
	outputFormat: 'jpg',
	mode: 'quality',
	targetKb: 200,
	maxDimension: null,
	downscaleToTarget: false,
	keepMetadata: false,
	vectorMode: 'color',
	vectorDetail: 60
};

describe('savingsPercent', () => {
	it('goes negative when the output grew — the chip must not read −0%', () => {
		expect(savingsPercent(100_000, 400_000)).toBe(-300);
		expect(savingsPercent(100_000, 60_000)).toBe(40);
		expect(savingsPercent(100, 100)).toBe(0);
	});
});

describe('keep-original guard', () => {
	it('clears the stale codec warning along with info on revert', async () => {
		const upload = up('photo.jpg', ['tiny source'], 'image/jpeg');
		vi.mocked(compressImage).mockResolvedValue({
			blob: new Blob(['a much bigger re-encode than the original was']),
			warning: 'Animated input — this browser can only convert the first frame',
			info: 'Converted to sRGB',
			resized: false,
			animated: false,
			format: 'jpg'
		});
		const out = await compressFiles([upload], 'jpg', IMG, () => {});
		expect(out.failures).toEqual([]);
		const result = out.results[0];
		expect(result.blob).toBe(upload.file); // reverted to the untouched original
		expect(result.savings).toBe(0);
		expect(result.info).toBeNull();
		expect(result.warning).toBeNull(); // describes the DISCARDED encode — must not ship
	});
});

describe('ocr dispatch', () => {
	const OCR_TEXT: OcrSettings = { op: 'toText', language: 'eng' };
	const OCR_PDF: OcrSettings = { op: 'toPdf', language: 'eng' };

	it("refuses a PDF under 'Extract text' with an actionable message", async () => {
		const out = await compressFiles(
			[up('scan.pdf', ['%PDF-1.4 fake'], 'application/pdf')],
			'ocr',
			OCR_TEXT,
			() => {}
		);
		expect(out.results).toEqual([]);
		expect(out.failures[0].error).toMatch(/Searchable PDF/);
		expect(ocrImage).not.toHaveBeenCalled();
		expect(ocrPdf).not.toHaveBeenCalled();
	});

	it("refuses an image under 'Searchable PDF' with an actionable message", async () => {
		const out = await compressFiles(
			[up('page.jpg', ['not a pdf'], 'image/jpeg')],
			'ocr',
			OCR_PDF,
			() => {}
		);
		expect(out.results).toEqual([]);
		expect(out.failures[0].error).toMatch(/Extract text/);
		expect(ocrPdf).not.toHaveBeenCalled();
	});

	it('still dispatches matched inputs to their codec', async () => {
		vi.mocked(ocrImage).mockResolvedValue({ blob: new Blob(['text']), info: '2 words' });
		const out = await compressFiles(
			[up('page.jpg', ['jpg bytes'], 'image/jpeg')],
			'ocr',
			OCR_TEXT,
			() => {}
		);
		expect(out.failures).toEqual([]);
		expect(ocrImage).toHaveBeenCalledTimes(1);
		expect(out.results[0].name).toBe('page.txt');
	});
});

describe('svg output decode bridge', () => {
	const SVG_OUT: ImageCompressionSettings = { ...IMG, outputFormat: 'svg' };

	beforeEach(() => {
		vi.mocked(vectorizeImage).mockResolvedValue(new Blob(['<svg/>'], { type: 'image/svg+xml' }));
	});

	it('bridges TIFF through the image worker to a lossless PNG first', async () => {
		vi.mocked(compressImage).mockResolvedValue({
			blob: new Blob(['png bytes'], { type: 'image/png' }),
			warning: null,
			info: null,
			resized: false,
			animated: false,
			format: 'png'
		});
		const upload = up('scan.tif', ['II* tiff bytes'], 'image/tiff');
		const out = await compressFiles([upload], 'jpg', SVG_OUT, () => {});
		expect(out.failures).toEqual([]);
		expect(compressImage).toHaveBeenCalledTimes(1);
		const bridgeSettings = vi.mocked(compressImage).mock.calls[0][1];
		expect(bridgeSettings.outputFormat).toBe('png');
		expect(bridgeSettings.quality).toBe(100);
		const bridged = vi.mocked(vectorizeImage).mock.calls[0][0];
		expect(bridged).not.toBe(upload.file);
		expect(bridged.name.endsWith('.png')).toBe(true);
		expect(out.results[0].name).toBe('scan.svg');
	});

	it('predecodes RAW before the bridge', async () => {
		vi.mocked(decodeRaw).mockResolvedValue({
			data: new ArrayBuffer(16),
			width: 2,
			height: 2,
			channels: 4
		});
		vi.mocked(compressImage).mockResolvedValue({
			blob: new Blob(['png bytes'], { type: 'image/png' }),
			warning: null,
			info: null,
			resized: false,
			animated: false,
			format: 'png'
		});
		const out = await compressFiles([up('photo.dng', ['raw'], '')], 'jpg', SVG_OUT, () => {});
		expect(out.failures).toEqual([]);
		expect(decodeRaw).toHaveBeenCalledTimes(1);
		// The bridge must hand the predecoded pixels to the image worker.
		expect(vi.mocked(compressImage).mock.calls[0][5]).toBeDefined();
	});

	it('vectorizes browser-decodable formats directly, no bridge', async () => {
		const upload = up('logo.jpg', ['jpg bytes'], 'image/jpeg');
		const out = await compressFiles([upload], 'jpg', SVG_OUT, () => {});
		expect(out.failures).toEqual([]);
		expect(compressImage).not.toHaveBeenCalled();
		expect(vi.mocked(vectorizeImage).mock.calls[0][0]).toBe(upload.file);
	});
});

describe('merge cancel + progress', () => {
	const MERGE = { op: 'merge', mergeCompress: false } as PdfCompressionSettings;

	it('never commits the merged output after Cancel', async () => {
		const controller = new AbortController();
		vi.mocked(mergePdfs).mockImplementation(async (_files, onProgress) => {
			onProgress?.(0, 3, 'a.pdf');
			onProgress?.(1, 3, 'b.pdf');
			return new Blob(['%PDF merged']);
		});
		const out = await runPdfTool(
			[up('a.pdf'), up('b.pdf')],
			MERGE,
			() => controller.abort(), // user hits Cancel on the first progress tick
			controller.signal
		);
		expect(out.combined).toBeNull();
		expect(out.results).toEqual([]);
		expect(out.failures).toEqual([]);
	});

	it('reports one progress row per input, not fileIndex 0 / fileCount 1', async () => {
		vi.mocked(mergePdfs).mockImplementation(async (files, onProgress) => {
			for (let i = 0; i <= files.length; i++) {
				onProgress?.(i, files.length + 1, i === files.length ? 'saving' : `f${i}`);
			}
			return new Blob(['%PDF merged']);
		});
		const events: ProgressInfo[] = [];
		const out = await runPdfTool([up('a.pdf'), up('b.pdf'), up('c.pdf')], MERGE, (p) =>
			events.push(p)
		);
		expect(out.combined?.name).toBe('merged.pdf');
		expect(events.every((p) => p.fileCount === 3)).toBe(true);
		// All three rows flip to done by the end — the header can count K/N.
		expect(events.filter((p) => p.stage === 'done').map((p) => p.fileIndex)).toEqual([0, 1, 2]);
	});
});
