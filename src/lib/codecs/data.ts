/**
 * Data conversion — CSV / XLSX / JSON / YAML, one uniform op: the input
 * format is detected from CONTENT and the target is implied (csv→xlsx,
 * xlsx→csv, json→yaml, yaml→json). SheetJS handles the spreadsheet side,
 * the `yaml` package the data side; each direction dynamic-imports only its
 * own engine, so json↔yaml never loads the SheetJS chunk.
 *
 * Main-thread by design (subtitles/ebook precedent): typical data files are
 * KBs–low MBs and convert in tens of ms. A 50 MB+ XLSX will block the UI for
 * seconds — accepted v1 ceiling.
 */
import type { DataSettings, UploadedFile } from '$lib/types';

export type DataKind = 'spreadsheet-binary' | 'csv' | 'json' | 'yaml';

export interface DataResult {
	blob: Blob;
	outExt: '.xlsx' | '.csv' | '.yaml' | '.json';
	info: string;
	warning: string | null;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** BOM/UTF-16 aware text decode — Excel's "Unicode Text" export is UTF-16LE. */
export function decodeText(bytes: Uint8Array): string {
	let text: string;
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
		text = new TextDecoder('utf-16le').decode(bytes);
	} else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
		text = new TextDecoder('utf-16be').decode(bytes);
	} else {
		text = new TextDecoder().decode(bytes);
	}
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Delimiter whose count (outside double quotes) is consistent across lines.
 *  Preference tab > ';' > ',' — tab/semicolon files almost always ALSO carry
 *  commas (decimal commas, prose); the reverse is rare. */
export function sniffCsvDelimiter(text: string): ',' | ';' | '\t' | null {
	const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 20);
	if (lines.length === 0) return null;
	const countOutsideQuotes = (line: string, ch: string) => {
		let count = 0;
		let quoted = false;
		for (const c of line) {
			if (c === '"') quoted = !quoted;
			else if (c === ch && !quoted) count++;
		}
		return count;
	};
	for (const candidate of ['\t', ';', ','] as const) {
		const first = countOutsideQuotes(lines[0], candidate);
		if (first < 1) continue;
		const consistent = lines.filter((l) => countOutsideQuotes(l, candidate) === first).length;
		if (consistent / lines.length >= 0.8) return candidate;
	}
	return null;
}

/** Order is load-bearing: JSON is valid YAML and CSV is often a YAML scalar —
 *  so binary → strict JSON → YAML markers → CSV sniff → YAML parse. The YAML
 *  step is async (the parser is a lazy chunk), hence the Promise. */
export async function detectDataFormat(bytes: Uint8Array, fileName: string): Promise<DataKind> {
	// 1. binary containers: zip (xlsx/xlsm/ods) and CFB (legacy .xls)
	if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05)) {
		return 'spreadsheet-binary';
	}
	if (
		bytes.length >= 8 &&
		bytes[0] === 0xd0 &&
		bytes[1] === 0xcf &&
		bytes[2] === 0x11 &&
		bytes[3] === 0xe0
	) {
		return 'spreadsheet-binary';
	}

	const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
	const text = decodeText(bytes);
	const trimmed = text.trimStart();
	if (trimmed === '') throw new Error('This file is empty');

	// 2. strict JSON first — a JSON doc would otherwise parse as YAML
	if (trimmed[0] === '{' || trimmed[0] === '[') {
		try {
			JSON.parse(text);
			return 'json';
		} catch {
			// flow-style YAML like {a: 1} falls through
		}
	}
	if (ext === 'json') {
		try {
			JSON.parse(text);
			return 'json'; // bare-scalar JSON ("42") — extension tiebreaker
		} catch {
			// fall through; the json→yaml branch will surface the parse error
			return 'json';
		}
	}

	const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 20);
	// 3. unmistakable YAML markers beat the CSV sniff
	if (lines.some((l) => /^(---|%YAML)/.test(l))) return 'yaml';

	// 4. CSV by delimiter consistency — unless the lines READ as YAML mappings
	// ("tags: a, b, c" would sniff as comma-CSV without this guard)
	const yamlish =
		lines.filter((l) => /^\s*(#|- |[^,;\t:"']+:(\s|$))/.test(l)).length >= lines.length / 2;
	if (!yamlish && sniffCsvDelimiter(text) !== null) return 'csv';

	// 5. YAML by parse (objects/arrays only — a bare scalar is "any text file")
	try {
		const YAML = await import('yaml');
		const value = YAML.parse(text);
		if (value !== null && typeof value === 'object') return 'yaml';
	} catch {
		// not yaml either
	}
	if (ext === 'yaml' || ext === 'yml') return 'yaml';

	// 6. single-column CSV has no delimiter to sniff — extension decides
	if (ext === 'csv' || ext === 'tsv') return 'csv';
	throw new Error('Could not read this file as CSV, Excel, JSON or YAML');
}

// --- Spreadsheet side (SheetJS) --------------------------------------------

type Worksheet = import('xlsx').WorkSheet;

/** Phase-0 pin: SheetJS's CSV parser converts date-LIKE strings ("1/2",
 *  "2024-01-15") into date serial numbers even without cellDates — a "1/2"
 *  fraction silently becoming Jan 2001 is unacceptable. So the CSV is read
 *  raw (everything text) and pure numbers are re-typed here; date-looking
 *  strings honestly stay text. */
function retypeNumericCells(ws: Worksheet, XLSX: typeof import('xlsx')): void {
	const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
	for (let r = range.s.r; r <= range.e.r; r++) {
		for (let c = range.s.c; c <= range.e.c; c++) {
			const addr = XLSX.utils.encode_cell({ r, c });
			const cell = ws[addr];
			if (cell && cell.t === 's' && typeof cell.v === 'string' && /^-?\d+(\.\d+)?$/.test(cell.v.trim())) {
				cell.t = 'n';
				cell.v = Number(cell.v);
			}
		}
	}
}

async function csvToXlsx(text: string): Promise<DataResult> {
	const XLSX = await import('xlsx');
	const wb = XLSX.read(text, { type: 'string', raw: true });
	const ws = wb.Sheets[wb.SheetNames[0]];
	if (!ws || !ws['!ref']) throw new Error('No rows found in this CSV');
	retypeNumericCells(ws, XLSX);
	const range = XLSX.utils.decode_range(ws['!ref']);
	const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
	const rows = range.e.r + 1;
	const cols = range.e.c + 1;
	return {
		blob: new Blob([out], { type: XLSX_MIME }),
		outExt: '.xlsx',
		info: `CSV → XLSX · ${rows} row${rows === 1 ? '' : 's'} × ${cols} column${cols === 1 ? '' : 's'}`,
		warning: null
	};
}

async function xlsxToCsv(bytes: Uint8Array, settings: DataSettings): Promise<DataResult> {
	const XLSX = await import('xlsx');
	let wb: import('xlsx').WorkBook;
	try {
		wb = XLSX.read(bytes, { type: 'array' });
	} catch (error) {
		const message = error instanceof Error ? error.message : '';
		if (/password/i.test(message)) {
			throw new Error('This spreadsheet is password-protected — remove the password in Excel first');
		}
		throw new Error('This ZIP archive is not a spreadsheet — try the archive converter instead');
	}
	const first = wb.SheetNames[0];
	const ws = wb.Sheets[first];
	if (!ws || !ws['!ref']) throw new Error('The first sheet is empty');
	// A formula cell without a cached value would print "=B4*C4" into the CSV
	// (phase-0 measured) — emit an empty field instead.
	const range = XLSX.utils.decode_range(ws['!ref']);
	for (let r = range.s.r; r <= range.e.r; r++) {
		for (let c = range.s.c; c <= range.e.c; c++) {
			const cell = ws[XLSX.utils.encode_cell({ r, c })];
			if (cell?.f !== undefined && cell.v === undefined) delete cell.f;
		}
	}
	const FS = settings.csvDelimiter === 'tab' ? '\t' : settings.csvDelimiter;
	// BOM always: without it Excel opens UTF-8 CSVs as Windows-1252 and
	// mangles č/š/ž. Every mainstream tool tolerates it.
	const csv = '\uFEFF' + XLSX.utils.sheet_to_csv(ws, { FS, blankrows: false });
	const rows = range.e.r + 1;
	const cols = range.e.c + 1;
	return {
		blob: new Blob([csv], { type: 'text/csv' }),
		outExt: '.csv',
		info: `XLSX → CSV · ${rows} row${rows === 1 ? '' : 's'} × ${cols} column${cols === 1 ? '' : 's'}`,
		warning:
			wb.SheetNames.length > 1
				? `${wb.SheetNames.length} sheets found — only the first (“${first}”) was exported`
				: null
	};
}

// --- Data side (yaml) ------------------------------------------------------

function shapeInfo(value: unknown): string {
	if (Array.isArray(value)) return ` · ${value.length} item${value.length === 1 ? '' : 's'}`;
	if (value !== null && typeof value === 'object') {
		const keys = Object.keys(value).length;
		return ` · ${keys} key${keys === 1 ? '' : 's'}`;
	}
	return '';
}

async function jsonToYaml(text: string): Promise<DataResult> {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		throw new Error(
			`This file is not valid JSON — ${error instanceof Error ? error.message : 'parse failed'}`
		);
	}
	const YAML = await import('yaml');
	// lineWidth 0 disables folding — long strings stay on one line, diffs stay sane
	const out = YAML.stringify(value, { indent: 2, lineWidth: 0 });
	return {
		blob: new Blob([out], { type: 'application/yaml' }),
		outExt: '.yaml',
		info: `JSON → YAML${shapeInfo(value)}`,
		warning: null
	};
}

async function yamlToJson(text: string, settings: DataSettings): Promise<DataResult> {
	const YAML = await import('yaml');
	const docs = YAML.parseAllDocuments(text);
	if (docs.length > 1) {
		throw new Error(
			`This YAML file contains ${docs.length} documents — split it and convert one at a time`
		);
	}
	const doc = docs[0];
	if (!doc || doc.errors.length > 0) {
		throw new Error(
			`This file is not valid YAML — ${doc?.errors[0]?.message.split('\n')[0] ?? 'parse failed'}`
		);
	}
	const value = doc.toJS(); // anchors/aliases expand here — inherent to the conversion
	let lossy = false;
	const json = JSON.stringify(
		value,
		(_key, v) => (typeof v === 'number' && !Number.isFinite(v) ? ((lossy = true), null) : v),
		settings.jsonIndent === 0 ? undefined : settings.jsonIndent
	);
	if (json === undefined) throw new Error('This YAML document has no JSON representation');
	return {
		blob: new Blob([json], { type: 'application/json' }),
		outExt: '.json',
		info: `YAML → JSON${shapeInfo(value)}`,
		warning: lossy ? '.inf/.nan values have no JSON equivalent — written as null' : null
	};
}

// --- Entry -----------------------------------------------------------------

export async function convertData(
	file: UploadedFile,
	settings: DataSettings,
	onProgress: (fraction: number, detail: string | null) => void,
	signal?: AbortSignal
): Promise<DataResult> {
	const bytes = new Uint8Array(await file.file.arrayBuffer());
	signal?.throwIfAborted();
	onProgress(0.1, null);
	const kind = await detectDataFormat(bytes, file.name);
	signal?.throwIfAborted();
	onProgress(0.3, null);
	switch (kind) {
		case 'spreadsheet-binary':
			return xlsxToCsv(bytes, settings);
		case 'csv':
			return csvToXlsx(decodeText(bytes));
		case 'json':
			return jsonToYaml(decodeText(bytes));
		case 'yaml':
			return yamlToJson(decodeText(bytes), settings);
	}
}
