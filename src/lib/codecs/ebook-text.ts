/**
 * EPUB → plain text. An EPUB is a zip of XHTML chapters; readArchive (fflate +
 * 7zz fallback) opens it, container.xml → OPF → <spine> gives the reading
 * order, and DOMParser (this codec runs on the main thread) turns each chapter
 * into paragraphed text. Degradation over failure: when container/OPF are
 * missing or unparseable, every .xhtml/.html entry in archive order still
 * yields the book's text — slightly less faithful ordering beats an error.
 */
import type { UploadedFile } from '$lib/types';
import { isDrmEncryption, isEpubDoc, readArchive, type Entry } from './ebook';

export interface EpubTextResult {
	text: string;
	chapters: number;
	words: number;
}

/** container.xml → OPF path → manifest + spine → ordered chapter paths.
 *  Falls back to all HTML-ish entries in archive order when anything is off. */
export function parseEpubSpine(entries: Entry[]): string[] {
	const byName = new Map(entries.map((e) => [e.name, e]));
	const htmlFallback = () =>
		entries.filter((e) => /\.(x?html?|htm)$/i.test(e.name)).map((e) => e.name);
	const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

	const container = byName.get('META-INF/container.xml');
	if (!container) return htmlFallback();
	const parser = new DOMParser();
	const containerDoc = parser.parseFromString(decode(container.bytes), 'application/xml');
	// rootfile is namespaced — getElementsByTagName ignores namespaces enough.
	const rootfile = containerDoc.querySelector('rootfile[full-path]');
	const opfPath = rootfile?.getAttribute('full-path');
	const opfEntry = opfPath ? byName.get(opfPath) : undefined;
	if (!opfPath || !opfEntry) return htmlFallback();

	const opfDoc = parser.parseFromString(decode(opfEntry.bytes), 'application/xml');
	if (opfDoc.querySelector('parsererror')) return htmlFallback();
	const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

	const manifest = new Map<string, string>();
	for (const item of opfDoc.querySelectorAll('manifest > item')) {
		const id = item.getAttribute('id');
		const href = item.getAttribute('href');
		if (id && href) manifest.set(id, href);
	}
	const ordered: string[] = [];
	for (const ref of opfDoc.querySelectorAll('spine > itemref')) {
		const href = manifest.get(ref.getAttribute('idref') ?? '');
		if (!href) continue;
		const resolved = resolveHref(opfDir, href);
		if (byName.has(resolved)) ordered.push(resolved);
	}
	return ordered.length > 0 ? ordered : htmlFallback();
}

/** Resolve an OPF-relative href (handles ../ and %20-style escapes). */
function resolveHref(opfDir: string, href: string): string {
	let clean = href.split('#')[0];
	try {
		clean = decodeURIComponent(clean);
	} catch {
		// malformed escape — use as-is
	}
	const parts = (opfDir + clean).split('/');
	const out: string[] = [];
	for (const part of parts) {
		if (part === '' || part === '.') continue;
		if (part === '..') out.pop();
		else out.push(part);
	}
	return out.join('/');
}

/** Block-level elements that terminate a paragraph when walking the DOM. */
const BLOCK = new Set([
	'P',
	'DIV',
	'LI',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6',
	'TR',
	'BLOCKQUOTE',
	'SECTION',
	'ARTICLE',
	'ASIDE',
	'FIGCAPTION',
	'DT',
	'DD',
	'PRE'
]);
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);

/**
 * XHTML → plain text with paragraph structure. Parsed as text/html: the HTML
 * parser handles named entities, stray markup and unclosed tags that a strict
 * XML parse would choke on — chapter files in the wild are messy.
 */
export function extractXhtmlText(html: string): string {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const paragraphs: string[] = [];
	let current = '';

	const flush = () => {
		const text = current.replace(/\s+/g, ' ').trim();
		if (text) paragraphs.push(text);
		current = '';
	};

	const walk = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			current += node.textContent ?? '';
			return;
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return;
		const el = node as Element;
		const tag = el.tagName;
		if (SKIP.has(tag)) return;
		if (tag === 'BR') {
			current += ' ';
			return;
		}
		const isBlock = BLOCK.has(tag);
		if (isBlock) flush();
		for (const child of el.childNodes) walk(child);
		if (isBlock) flush();
	};

	walk(doc.body ?? doc.documentElement);
	flush();
	return paragraphs.join('\n\n');
}

export async function epubToText(
	file: UploadedFile,
	onProgress: (fraction: number, detail: string | null) => void,
	signal?: AbortSignal
): Promise<EpubTextResult> {
	const { entries } = await readArchive(file, onProgress, signal);
	if (!isEpubDoc(entries, file.name)) {
		throw new Error('This file isn’t an EPUB — text extraction works on EPUB books');
	}
	const enc = entries.find((e) => e.name === 'META-INF/encryption.xml');
	if (enc && isDrmEncryption(new TextDecoder().decode(enc.bytes))) {
		throw new Error(
			'This EPUB is DRM-protected (META-INF/encryption.xml) — its text can’t be read. Remove the DRM first, then try again'
		);
	}

	const { decodeText } = await import('./data');
	const byName = new Map(entries.map((e) => [e.name, e]));
	const chapters = parseEpubSpine(entries);
	const parts: string[] = [];
	let done = 0;
	for (const path of chapters) {
		signal?.throwIfAborted();
		const entry = byName.get(path);
		if (!entry) continue;
		const text = extractXhtmlText(decodeText(entry.bytes));
		if (text) parts.push(text);
		done++;
		onProgress(0.2 + 0.75 * (done / chapters.length), `chapter ${done}/${chapters.length}`);
	}
	const text = parts.join('\n\n\n');
	if (!text.trim()) {
		throw new Error('This EPUB has no extractable text — is it an image-only book?');
	}
	const words = text.split(/\s+/).filter(Boolean).length;
	return { text, chapters: parts.length, words };
}
