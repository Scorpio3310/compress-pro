/**
 * Preservation of interactive PDF content across a Ghostscript pdfwrite pass.
 *
 * The bundled gs wasm build drops EVERY annotation on rewrite (measured on a
 * bare `-sDEVICE=pdfwrite` run and with `-dPreserveAnnots=true` — the flag is
 * a no-op in this build): filled AcroForm values and hyperlinks silently
 * vanish from compressed output (quality sweep F-03, 2026-07-18). Strategy:
 *
 *  - Forms: regenerate field appearances, then FLATTEN into page content
 *    before gs — filled values (and the widget look) stay visible. The form
 *    stops being editable, which gs enforced anyway; the caller surfaces it.
 *  - /Link annotations (external /URI actions + internal page GoTo dests):
 *    collected before gs and transplanted onto the compressed output. Our gs
 *    args keep page geometry (-dAutoRotatePages=/None, no cropping), so the
 *    annotation rects transfer 1:1. Other annotation subtypes (comments,
 *    highlights…) are painted into content by the flatten only when they are
 *    form widgets; the rest cannot survive this engine and stay dropped.
 *
 * pdf-lib loads dynamically — this module's heavy path only runs when the
 * cheap byte scan finds /AcroForm or /Annots, and never joins the init chunk.
 */

export interface CollectedLink {
	pageIndex: number;
	rect: [number, number, number, number];
	uri?: string;
	destPageIndex?: number;
}

export interface InteractivePrep {
	/** Bytes to feed Ghostscript (flattened when a form was present). */
	bytes: ArrayBuffer;
	flattened: boolean;
	links: CollectedLink[];
}

/** Object-stream writers hide the tokens; parsing giant scans to find out is
 *  not worth it — multi-hundred-MB documents virtually never carry forms. */
const MAX_OBJSTM_PROBE_BYTES = 64_000_000;

/** Cheap byte scan — is there anything interactive worth preserving? */
export function scanInteractive(input: ArrayBuffer): boolean {
	const bytes = new Uint8Array(input);
	if (findAscii(bytes, '/AcroForm') || findAscii(bytes, '/Annots')) return true;
	// Writers using object streams (PDF 1.5+) compress those dictionaries away
	// from the raw byte stream — only a real parse can tell, so bounded inputs
	// take the prepare path on the /ObjStm marker alone.
	return bytes.length <= MAX_OBJSTM_PROBE_BYTES && findAscii(bytes, '/ObjStm');
}

function findAscii(hay: Uint8Array, needle: string): boolean {
	const n = needle.length;
	const first = needle.charCodeAt(0);
	outer: for (let i = 0; i <= hay.length - n; i++) {
		if (hay[i] !== first) continue;
		for (let j = 1; j < n; j++) {
			if (hay[i + j] !== needle.charCodeAt(j)) continue outer;
		}
		return true;
	}
	return false;
}

/**
 * Flatten any form into page content and collect transplantable links.
 * Throws only when the document cannot be parsed at all — callers fall back
 * to the raw input (gs may still cope).
 */
export async function prepareInteractive(input: ArrayBuffer): Promise<InteractivePrep> {
	const { PDFDocument } = await import('pdf-lib');
	const doc = await PDFDocument.load(input, { ignoreEncryption: true, updateMetadata: false });
	const links = await collectLinks(doc);

	let flattened = false;
	try {
		const form = doc.getForm();
		if (form.getFields().length > 0) {
			// updateFieldAppearances only touches DIRTY fields — values filled by
			// another writer (empty/stale appearance streams; viewers draw them
			// straight from /V) would flatten to empty boxes (measured on the
			// OpenOffice sample). Re-setting every field to its own value marks
			// it dirty so the regeneration really runs.
			await markAllFieldsDirty(form);
			try {
				form.updateFieldAppearances();
			} catch {
				// Unencodable values (WinAnsi) or exotic fields — flatten still tries.
			}
			form.flatten();
			flattened = true;
		}
	} catch {
		// No AcroForm, or flatten failed — proceed with the original bytes.
	}

	if (!flattened) return { bytes: input, flattened, links };
	const saved = await doc.save({ updateFieldAppearances: false });
	return {
		bytes: saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer,
		flattened,
		links
	};
}

type PdfLibDoc = import('pdf-lib').PDFDocument;
type PdfLibForm = import('pdf-lib').PDFForm;

/** Re-set every field to its own current value — pdf-lib regenerates
 *  appearances only for dirty fields. Per-field try/catch: one exotic field
 *  must not cost the rest their values. */
async function markAllFieldsDirty(form: PdfLibForm): Promise<void> {
	const { PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } = await import(
		'pdf-lib'
	);
	for (const field of form.getFields()) {
		try {
			if (field instanceof PDFTextField) field.setText(field.getText());
			else if (field instanceof PDFDropdown || field instanceof PDFOptionList)
				field.select(field.getSelected());
			else if (field instanceof PDFCheckBox) {
				if (field.isChecked()) field.check();
				else field.uncheck();
			} else if (field instanceof PDFRadioGroup) {
				const selected = field.getSelected();
				if (selected) field.select(selected);
			}
		} catch {
			// Leave the field's existing appearance untouched.
		}
	}
}

async function collectLinks(doc: PdfLibDoc): Promise<CollectedLink[]> {
	const { PDFArray, PDFDict, PDFName, PDFHexString, PDFNumber, PDFRef, PDFString } = await import(
		'pdf-lib'
	);
	const pages = doc.getPages();
	const refToIndex = new Map(pages.map((p, i) => [p.ref.toString(), i]));
	const links: CollectedLink[] = [];
	pages.forEach((p, pageIndex) => {
		const annots = p.node.Annots?.();
		if (!(annots instanceof PDFArray)) return;
		for (let i = 0; i < annots.size(); i++) {
			const dict = annots.lookup(i);
			if (!(dict instanceof PDFDict)) continue;
			if (dict.get(PDFName.of('Subtype'))?.toString() !== '/Link') continue;
			const rectArr = dict.lookup(PDFName.of('Rect'));
			if (!(rectArr instanceof PDFArray) || rectArr.size() !== 4) continue;
			const rect: number[] = [];
			for (let r = 0; r < 4; r++) {
				const num = rectArr.lookup(r);
				if (!(num instanceof PDFNumber)) break;
				rect.push(num.asNumber());
			}
			if (rect.length !== 4) continue;

			let uri: string | undefined;
			let destPageIndex: number | undefined;
			const action = dict.lookup(PDFName.of('A'));
			if (action instanceof PDFDict) {
				const kind = action.get(PDFName.of('S'))?.toString();
				if (kind === '/URI') {
					const u = action.lookup(PDFName.of('URI'));
					if (u instanceof PDFString || u instanceof PDFHexString) uri = u.decodeText();
				} else if (kind === '/GoTo') {
					destPageIndex = destIndex(action.lookup(PDFName.of('D')), refToIndex, PDFArray, PDFRef);
				}
			}
			if (uri === undefined && destPageIndex === undefined) {
				destPageIndex = destIndex(dict.lookup(PDFName.of('Dest')), refToIndex, PDFArray, PDFRef);
			}
			if (uri !== undefined || destPageIndex !== undefined) {
				links.push({
					pageIndex,
					rect: rect as [number, number, number, number],
					uri,
					destPageIndex
				});
			}
		}
	});
	return links;
}

function destIndex(
	dest: unknown,
	refToIndex: Map<string, number>,
	PDFArrayCtor: typeof import('pdf-lib').PDFArray,
	PDFRefCtor: typeof import('pdf-lib').PDFRef
): number | undefined {
	if (!(dest instanceof PDFArrayCtor) || dest.size() < 1) return undefined;
	const ref = dest.get(0);
	if (!(ref instanceof PDFRefCtor)) return undefined;
	return refToIndex.get(ref.toString());
}

/**
 * Re-attach collected /Link annotations to the gs output. Re-saving through
 * pdf-lib forfeits gs's linearization (FastWebView) — links beat byte layout.
 * Throws on parse failure; callers keep the un-transplanted gs output.
 */
export async function transplantLinks(
	gsOut: Uint8Array,
	links: CollectedLink[]
): Promise<Uint8Array> {
	if (links.length === 0) return gsOut;
	const { PDFDocument, PDFName, PDFString } = await import('pdf-lib');
	const doc = await PDFDocument.load(gsOut.slice(), {
		ignoreEncryption: true,
		updateMetadata: false
	});
	const pages = doc.getPages();
	for (const link of links) {
		const page = pages[link.pageIndex];
		if (!page) continue;
		const base = {
			Type: 'Annot',
			Subtype: 'Link',
			Rect: link.rect as number[],
			Border: [0, 0, 0]
		};
		let annot;
		if (link.uri !== undefined) {
			annot = doc.context.obj({
				...base,
				A: { Type: 'Action', S: 'URI', URI: PDFString.of(link.uri) }
			});
		} else if (link.destPageIndex !== undefined) {
			const target = pages[link.destPageIndex];
			if (!target) continue;
			annot = doc.context.obj({ ...base, Dest: [target.ref, 'Fit'] });
		} else {
			continue;
		}
		const ref = doc.context.register(annot);
		const existing = page.node.Annots?.();
		if (existing) existing.push(ref);
		else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
	}
	// No object streams: keeps the annots/URIs visible to naive scanners and
	// maximally compatible with strict readers (a few hundred bytes of cost).
	return doc.save({ updateFieldAppearances: false, useObjectStreams: false });
}
