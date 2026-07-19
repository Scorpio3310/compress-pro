import { describe, expect, it } from 'vitest';
import pdfLib from 'pdf-lib';
import { prepareInteractive, scanInteractive, transplantLinks } from './pdf-interactive';

const { PDFDocument, PDFName, PDFString, StandardFonts } = pdfLib;

/** Filled form + URI link + internal GoTo link — the F-03 shape. */
async function buildInteractivePdf(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const page1 = doc.addPage([595, 842]);
	const page2 = doc.addPage([595, 842]);
	page1.drawText('page one', { x: 50, y: 800, size: 14, font });
	page2.drawText('page two', { x: 50, y: 800, size: 14, font });
	const form = doc.getForm();
	const field = form.createTextField('t.name');
	field.setText('FLATTEN-ME-7');
	field.addToPage(page1, { x: 50, y: 700, width: 200, height: 24, font });
	form.updateFieldAppearances(font);
	const uriLink = doc.context.register(
		doc.context.obj({
			Type: 'Annot',
			Subtype: 'Link',
			Rect: [50, 600, 250, 620],
			Border: [0, 0, 0],
			A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com/u') }
		})
	);
	const gotoLink = doc.context.register(
		doc.context.obj({
			Type: 'Annot',
			Subtype: 'Link',
			Rect: [50, 560, 250, 580],
			Border: [0, 0, 0],
			Dest: [page2.ref, 'Fit']
		})
	);
	page1.node.set(PDFName.of('Annots'), doc.context.obj([uriLink, gotoLink]));
	return doc.save();
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
	return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

describe('scanInteractive', () => {
	it('spots forms/annots and stays quiet on plain documents', async () => {
		expect(scanInteractive(toArrayBuffer(await buildInteractivePdf()))).toBe(true);
		const plain = await PDFDocument.create();
		plain.addPage([100, 100]);
		// Without object streams every token is raw — a plain doc scans false.
		expect(scanInteractive(toArrayBuffer(await plain.save({ useObjectStreams: false })))).toBe(
			false
		);
		// WITH object streams the tokens could be hidden — the bounded /ObjStm
		// probe must send the document down the parse path.
		expect(scanInteractive(toArrayBuffer(await plain.save()))).toBe(true);
	});
});

describe('prepareInteractive', () => {
	it('flattens filled fields and collects both link kinds', async () => {
		const prep = await prepareInteractive(toArrayBuffer(await buildInteractivePdf()));
		expect(prep.flattened).toBe(true);
		expect(prep.links).toEqual([
			expect.objectContaining({ pageIndex: 0, uri: 'https://example.com/u' }),
			expect.objectContaining({ pageIndex: 0, destPageIndex: 1 })
		]);
		const flat = await PDFDocument.load(prep.bytes);
		expect(flat.getForm().getFields(), 'no editable fields remain').toHaveLength(0);
		// The painted value itself is inside (possibly compressed) content
		// streams — P-30 (e2e) asserts its visibility via real text extraction;
		// here the structural flatten proof is fields=0 + XObject resources on
		// the page the widget lived on.
		const page1 = flat.getPages()[0];
		expect(page1.node.Resources()?.toString()).toContain('/XObject');
	});

	it('regenerates values for fields filled by another writer (not dirty)', async () => {
		// Round-trip through save+load: the reloaded fields are NOT dirty, which
		// used to make updateFieldAppearances a no-op — flatten then painted the
		// stale/empty appearance streams and values vanished (measured on the
		// OpenOffice real sample: Gender/Height/colour flattened to empty boxes).
		const reloaded = await PDFDocument.load(await buildInteractivePdf());
		// Simulate the external-writer shape: blank the appearance streams so
		// only a real regeneration can bring the value back.
		const { PDFName } = pdfLib;
		for (const field of reloaded.getForm().getFields()) {
			for (const widget of field.acroField.getWidgets()) {
				widget.dict.delete(PDFName.of('AP'));
			}
		}
		const prep = await prepareInteractive(toArrayBuffer(await reloaded.save()));
		expect(prep.flattened).toBe(true);
		// The value must be present in the flattened page's (deflated) streams.
		const { inflateSync } = await import('node:zlib');
		const flat = await PDFDocument.load(prep.bytes);
		const texts: string[] = [];
		for (const [, obj] of flat.context.enumerateIndirectObjects()) {
			const stream = obj as { contents?: Uint8Array };
			if (!(stream.contents instanceof Uint8Array)) continue;
			try {
				texts.push(inflateSync(stream.contents).toString('latin1'));
			} catch {
				texts.push(Buffer.from(stream.contents).toString('latin1'));
			}
		}
		// Appearance streams write text as hex strings (<...> Tj).
		const hex = Buffer.from('FLATTEN-ME-7', 'latin1').toString('hex').toUpperCase();
		const all = texts.join('\n');
		expect(all.includes('FLATTEN-ME-7') || all.toUpperCase().includes(hex)).toBe(true);
	});

	it('passes formless documents through untouched', async () => {
		const doc = await PDFDocument.create();
		const page = doc.addPage([200, 200]);
		const link = doc.context.register(
			doc.context.obj({
				Type: 'Annot',
				Subtype: 'Link',
				Rect: [0, 0, 100, 20],
				A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com/only-link') }
			})
		);
		page.node.set(PDFName.of('Annots'), doc.context.obj([link]));
		const input = toArrayBuffer(await doc.save());
		const prep = await prepareInteractive(input);
		expect(prep.flattened).toBe(false);
		expect(prep.bytes).toBe(input); // untouched, not re-saved
		expect(prep.links).toHaveLength(1);
	});
});

describe('encrypted inputs (F-12)', () => {
	it('leaves encrypted documents untouched — no mojibake links, no fake flatten', async () => {
		// Owner-locked file (empty user password): pdf-lib parses the structure
		// but every string is ciphertext — prepare must bail and let gs handle it.
		const { dirname, join } = await import('node:path');
		const { fileURLToPath } = await import('node:url');
		const plain = await buildInteractivePdf();
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
		const input = toArrayBuffer(encrypted);
		const prep = await prepareInteractive(input);
		expect(prep.flattened).toBe(false);
		expect(prep.links).toEqual([]);
		expect(prep.bytes).toBe(input);
	});
});

describe('named destinations (F-13)', () => {
	it('resolves /Names-tree GoTo destinations to page indices', async () => {
		const doc = await PDFDocument.create();
		const font = await doc.embedFont(StandardFonts.Helvetica);
		const page1 = doc.addPage([595, 842]);
		const page2 = doc.addPage([595, 842]);
		page1.drawText('toc', { x: 50, y: 800, size: 12, font });
		page2.drawText('target', { x: 50, y: 800, size: 12, font });
		// Catalog /Names/Dests name tree: (sec1) -> [page2 /Fit]
		const destArray = doc.context.obj([page2.ref, 'Fit']);
		const destsTree = doc.context.obj({ Names: [PDFString.of('sec1'), destArray] });
		doc.catalog.set(PDFName.of('Names'), doc.context.obj({ Dests: destsTree }));
		const link = doc.context.register(
			doc.context.obj({
				Type: 'Annot',
				Subtype: 'Link',
				Rect: [50, 780, 150, 800],
				A: { Type: 'Action', S: 'GoTo', D: PDFString.of('sec1') }
			})
		);
		page1.node.set(PDFName.of('Annots'), doc.context.obj([link]));
		const prep = await prepareInteractive(toArrayBuffer(await doc.save()));
		expect(prep.links).toEqual([expect.objectContaining({ pageIndex: 0, destPageIndex: 1 })]);
	});

	it('resolves old-style catalog /Dests dictionary destinations', async () => {
		const doc = await PDFDocument.create();
		const page1 = doc.addPage([300, 300]);
		const page2 = doc.addPage([300, 300]);
		const destArray = doc.context.obj([page2.ref, 'Fit']);
		doc.catalog.set(PDFName.of('Dests'), doc.context.obj({ chap2: destArray }));
		const link = doc.context.register(
			doc.context.obj({
				Type: 'Annot',
				Subtype: 'Link',
				Rect: [10, 10, 100, 30],
				Dest: 'chap2' // PDFName-style dest
			})
		);
		page1.node.set(PDFName.of('Annots'), doc.context.obj([link]));
		const prep = await prepareInteractive(toArrayBuffer(await doc.save()));
		expect(prep.links).toEqual([expect.objectContaining({ pageIndex: 0, destPageIndex: 1 })]);
	});
});

describe('transplantLinks', () => {
	it('re-attaches links onto an annotation-stripped document', async () => {
		const prep = await prepareInteractive(toArrayBuffer(await buildInteractivePdf()));
		// Simulate the gs pass: same pages, every annotation gone.
		const stripped = await PDFDocument.load(prep.bytes);
		for (const p of stripped.getPages()) p.node.delete(PDFName.of('Annots'));
		const gsOut = await stripped.save({ useObjectStreams: false });
		// pdf-lib keeps the now-orphaned link objects in the file — what matters
		// is that no page REFERENCES them anymore.
		const strippedDoc = await PDFDocument.load(gsOut.slice());
		expect(strippedDoc.getPages()[0].node.Annots?.()).toBeUndefined();

		const restored = await transplantLinks(gsOut, prep.links);
		const doc = await PDFDocument.load(restored.slice());
		const annots = doc.getPages()[0].node.Annots?.();
		expect(annots?.size(), 'both links back on page 1').toBe(2);
		// transplantLinks saves WITHOUT object streams — raw greps must work
		// (P-30 relies on the same property on the real gs output).
		const raw = Buffer.from(restored).toString('latin1');
		expect(raw).toContain('example.com/u');
		expect(raw).toMatch(/\/Dest/);
	});

	it('is a no-op for zero links', async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		expect(await transplantLinks(bytes, [])).toBe(bytes);
	});
});
