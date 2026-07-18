import { describe, expect, it } from 'vitest';
import { decodeText, detectDataFormat, sniffCsvDelimiter } from './data';

const enc = (s: string) => new TextEncoder().encode(s);
const detect = (s: string, name = 'file.txt') => detectDataFormat(enc(s), name);

describe('decodeText', () => {
	it('strips the UTF-8 BOM', () => {
		expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toBe('a');
	});

	it('decodes UTF-16LE (Excel "Unicode Text" exports)', () => {
		const utf16 = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x09, 0x00, 0x62, 0x00]);
		expect(decodeText(utf16)).toBe('a\tb');
	});
});

describe('sniffCsvDelimiter', () => {
	it('prefers tab and semicolon over comma (EU decimal commas)', () => {
		expect(sniffCsvDelimiter('a\tb\n1\t2\n')).toBe('\t');
		expect(sniffCsvDelimiter('a;b\n1,5;2,7\n')).toBe(';');
		expect(sniffCsvDelimiter('a,b\n1,2\n')).toBe(',');
	});

	it('ignores delimiters inside double quotes', () => {
		expect(sniffCsvDelimiter('"x,y",z\n"1,2",3\n')).toBe(',');
	});

	it('requires ≥80% consistency', () => {
		expect(sniffCsvDelimiter('a,b\nplain prose line\nanother prose line\nmore prose\nlast\n')).toBe(
			null
		);
	});
});

describe('detectDataFormat', () => {
	it('detects strict JSON before YAML (JSON is valid YAML)', async () => {
		await expect(detect('{"a": 1}')).resolves.toBe('json');
		await expect(detect('[1, 2, 3]')).resolves.toBe('json');
	});

	it('routes flow-style YAML that is not strict JSON to yaml', async () => {
		await expect(detect('{a: 1}')).resolves.toBe('yaml');
	});

	it('detects block YAML, document markers and comments', async () => {
		await expect(detect('a: 1\nb: 2\n')).resolves.toBe('yaml');
		await expect(detect('---\nfoo: 1\n')).resolves.toBe('yaml');
		await expect(detect('# comment\nkey: value\n')).resolves.toBe('yaml');
	});

	it('detects CSV variants', async () => {
		await expect(detect('a,b\n1,2\n')).resolves.toBe('csv');
		await expect(detect('a;b\n1,5;2,7\n')).resolves.toBe('csv');
		await expect(detect('a\tb\n1\t2\n')).resolves.toBe('csv');
	});

	it('the yaml-mapping guard beats a comma sniff on "tags: a, b" files', async () => {
		await expect(detect('tags: a, b, c\nmore: d, e, f\n')).resolves.toBe('yaml');
	});

	it('detects binary spreadsheets by magic', async () => {
		await expect(detectDataFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]), 'x.xlsx')).resolves.toBe(
			'spreadsheet-binary'
		);
		await expect(
			detectDataFormat(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'x.xls')
		).resolves.toBe('spreadsheet-binary');
	});

	it('extension tiebreakers: bare-scalar .json, single-column .csv', async () => {
		await expect(detect('42', 'n.json')).resolves.toBe('json');
		await expect(detect('name\nAna\nBor\n', 'list.csv')).resolves.toBe('csv');
	});

	it('empty and prose files throw', async () => {
		await expect(detect('')).rejects.toThrow(/empty/);
		await expect(detect('Just some plain prose without structure')).rejects.toThrow(
			/CSV, Excel, JSON or YAML/
		);
	});
});

describe('directions (via convertData on synthetic files)', () => {
	const settings = { csvDelimiter: ',' as const, jsonIndent: 2 as const };
	const uploaded = (name: string, content: string | Uint8Array) => ({
		id: 'x',
		file: new File([content as BlobPart], name),
		name,
		size: 0,
		objectUrl: ''
	});

	it('json → yaml preserves order and unicode, no flow braces', async () => {
		const { convertData } = await import('./data');
		const out = await convertData(
			uploaded('x.json', '{"name":"Compress","tags":["čšž"],"n":3.14}'),
			settings,
			() => {}
		);
		const text = await out.blob.text();
		expect(out.outExt).toBe('.yaml');
		expect(text.startsWith('name: Compress')).toBe(true);
		expect(text).toContain('- čšž');
		expect(text).not.toMatch(/[{}]/);
		expect(out.info).toBe('JSON → YAML · 3 keys');
	});

	it('yaml → json expands anchors, minifies on jsonIndent 0', async () => {
		const { convertData } = await import('./data');
		const yaml = 'base: &b\n  x: 1\nref: *b\n';
		const out = await convertData(uploaded('x.yaml', yaml), { ...settings, jsonIndent: 0 }, () => {});
		const parsed = JSON.parse(await out.blob.text());
		expect(parsed.ref).toEqual(parsed.base);
		expect((await out.blob.text()).includes('\n')).toBe(false);
	});

	it('yaml multi-document and duplicate keys throw friendly errors', async () => {
		const { convertData } = await import('./data');
		await expect(
			convertData(uploaded('m.yaml', 'a: 1\n---\nb: 2\n'), settings, () => {})
		).rejects.toThrow(/2 documents/);
		await expect(
			convertData(uploaded('d.yaml', 'a: 1\na: 2\n'), settings, () => {})
		).rejects.toThrow(/not valid YAML/);
	});

	it('Infinity becomes null with a warning', async () => {
		const { convertData } = await import('./data');
		const out = await convertData(uploaded('i.yaml', 'v: .inf\n'), settings, () => {});
		expect(JSON.parse(await out.blob.text()).v).toBe(null);
		expect(out.warning).toMatch(/no JSON equivalent/);
	});

	it('csv → xlsx keeps "1/2" and dates as text, numbers as numbers', async () => {
		const { convertData } = await import('./data');
		const XLSX = await import('xlsx');
		const out = await convertData(
			uploaded('t.csv', 'A,B,C,D\nMARCH1,1/2,2024-01-15,4.5\n'),
			settings,
			() => {}
		);
		expect(out.outExt).toBe('.xlsx');
		const wb = XLSX.read(new Uint8Array(await out.blob.arrayBuffer()), { type: 'array' });
		const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
			header: 1,
			raw: true
		}) as unknown[][];
		expect(rows[1]).toEqual(['MARCH1', '1/2', '2024-01-15', 4.5]);
	});

	it('xlsx → csv: BOM, first-sheet rule, cached formula, uncached dropped', async () => {
		const { convertData } = await import('./data');
		const XLSX = await import('xlsx');
		const ws = XLSX.utils.aoa_to_sheet([
			['N', 'V'],
			['a', 1]
		]);
		ws['B3'] = { t: 'n', f: 'B2*2', v: 2 };
		ws['A3'] = { t: 'n', f: 'B9*2' }; // no cached value
		ws['!ref'] = 'A1:B3';
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, 'One');
		XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['other']]), 'Two');
		const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
		const out = await convertData(uploaded('t.xlsx', bytes), settings, () => {});
		const raw = new Uint8Array(await out.blob.arrayBuffer());
		// Blob.text() strips a leading BOM during UTF-8 decode — assert bytes.
		expect([raw[0], raw[1], raw[2]]).toEqual([0xef, 0xbb, 0xbf]);
		const text = await out.blob.text();
		expect(text).toContain('a,1');
		expect(text).toContain('2'); // cached formula value
		expect(text).not.toContain('B9*2'); // uncached formula dropped, not printed
		expect(text).not.toContain('other');
		expect(out.warning).toMatch(/2 sheets found — only the first \(“One”\)/);
	});
});
