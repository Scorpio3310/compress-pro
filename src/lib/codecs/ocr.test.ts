import { describe, expect, it } from 'vitest';
import { mapWordToPdf, ocrPdf, type OcrWord } from './ocr';

const word = (x0: number, y0: number, x1: number, y1: number): OcrWord => ({
	text: 'w',
	bbox: { x0, y0, x1, y1 }
});

describe('mapWordToPdf', () => {
	it('scales render pixels to PDF points and flips the y axis', () => {
		// 1000×2000 px render of a 500×1000 pt page → scale 0.5 both ways.
		const at = mapWordToPdf(word(100, 200, 300, 260), 1000, 2000, 500, 1000);
		expect(at.x).toBe(50);
		// bbox bottom (y1=260 px → 130 pt from the top) flips to 1000-130.
		expect(at.y).toBe(870);
		expect(at.size).toBe(30); // (260-200) px * 0.5
	});

	it('handles asymmetric scales (non-uniform render)', () => {
		const at = mapWordToPdf(word(0, 0, 100, 40), 2000, 1000, 500, 500);
		expect(at.x).toBe(0);
		expect(at.y).toBe(480); // 500 - 40*0.5
		expect(at.size).toBe(20);
	});

	it('never emits a zero/negative font size', () => {
		const at = mapWordToPdf(word(10, 10, 12, 10), 1000, 1000, 100, 100);
		expect(at.size).toBeGreaterThanOrEqual(1);
	});

	// pdf.js rasters the /Rotate-applied presentation; pdf-lib's page size is
	// the raw MediaBox — the mapping must invert the viewport transform per
	// quadrant and report the draw angle, or the invisible layer lands
	// transposed on every rotated (landscape-scan) page.
	describe('rotated pages (/Rotate)', () => {
		// Unrotated page 500×1000 pt; /Rotate 90 presents 1000×500 pt, rendered
		// at scale 2 → 2000×1000 px. Word bbox (100,200)-(300,260) in render px.
		it('maps /Rotate 90 into the unrotated MediaBox with a 90° baseline', () => {
			const at = mapWordToPdf(word(100, 200, 300, 260), 2000, 1000, 500, 1000, 90);
			expect(at.x).toBe(130); // y1 · W/Rh = 260 · 0.5
			expect(at.y).toBe(50); // x0 · H/Rw = 100 · 0.5
			expect(at.size).toBe(30); // (y1-y0) · W/Rh
			expect(at.rotation).toBe(90);
		});

		it('maps /Rotate 180 (flipped both ways)', () => {
			const at = mapWordToPdf(word(100, 200, 300, 260), 1000, 2000, 500, 1000, 180);
			expect(at.x).toBe(450); // W - x0 · W/Rw = 500 - 100·0.5
			expect(at.y).toBe(130); // y1 · H/Rh = 260 · 0.5
			expect(at.size).toBe(30);
			expect(at.rotation).toBe(180);
		});

		it('maps /Rotate 270', () => {
			const at = mapWordToPdf(word(100, 200, 300, 260), 2000, 1000, 500, 1000, 270);
			expect(at.x).toBe(370); // W - y1 · W/Rh = 500 - 130
			expect(at.y).toBe(950); // H - x0 · H/Rw = 1000 - 50
			expect(at.size).toBe(30);
			expect(at.rotation).toBe(270);
		});

		it('normalizes negative and >360 angles to the 0-270 quadrants', () => {
			const at90 = mapWordToPdf(word(100, 200, 300, 260), 2000, 1000, 500, 1000, 90);
			expect(mapWordToPdf(word(100, 200, 300, 260), 2000, 1000, 500, 1000, 450)).toEqual(at90);
			expect(mapWordToPdf(word(100, 200, 300, 260), 2000, 1000, 500, 1000, -270)).toEqual(at90);
			const at0 = mapWordToPdf(word(100, 200, 300, 260), 1000, 2000, 500, 1000, 360);
			expect(at0).toEqual(mapWordToPdf(word(100, 200, 300, 260), 1000, 2000, 500, 1000));
		});
	});
});

describe('ocrPdf', () => {
	it('refuses an owner-locked (encrypted) PDF up front with an unlock hint', async () => {
		// Owner-locked (empty user password, AES-256): opens fine in pdf.js but
		// pdf-lib cannot decrypt it — without the up-front guard the output PDF
		// comes out corrupt/unreadable after a full (wasted) recognition pass.
		// Built inline with qpdf so the test runs on a checkout that never ran
		// `pnpm fixtures`.
		const { dirname, join } = await import('node:path');
		const { fileURLToPath } = await import('node:url');
		const { PDFDocument } = await import('pdf-lib');
		const doc = await PDFDocument.create();
		doc.addPage([200, 200]);
		const plain = await doc.save();
		const factory = (await import('@neslinesli93/qpdf-wasm')).default;
		const wasmPath = join(
			dirname(fileURLToPath(import.meta.url)),
			'../../../node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm'
		);
		const origLog = console.log;
		const origErr = console.error;
		console.log = () => {};
		console.error = () => {};
		let encrypted: Uint8Array;
		try {
			const qpdf = await factory({ locateFile: () => wasmPath });
			(qpdf.FS as unknown as { writeFile(p: string, d: Uint8Array): void }).writeFile(
				'/in.pdf',
				plain
			);
			qpdf.callMain([
				'--warning-exit-0',
				'--encrypt',
				'',
				'owner-pw',
				'256',
				'--',
				'/in.pdf',
				'/out.pdf'
			]);
			encrypted = qpdf.FS.readFile('/out.pdf');
		} finally {
			console.log = origLog;
			console.error = origErr;
		}
		const bytes = encrypted.buffer.slice(
			encrypted.byteOffset,
			encrypted.byteOffset + encrypted.byteLength
		) as ArrayBuffer;
		const file = new File([bytes], 'scan-text-locked.pdf', { type: 'application/pdf' });
		await expect(ocrPdf(file, { op: 'toPdf', language: 'eng' })).rejects.toThrow(/unlock-pdf/i);
	});
});
