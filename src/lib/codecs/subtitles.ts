/**
 * Subtitle conversion — SRT / VTT / ASS in, SRT / VTT out. Pure JS, a few
 * hundred lines, runs on the main thread (parsing text is instant even for
 * feature-length files). Input format is detected from CONTENT, not the
 * extension — every landing page converts any of the three inputs.
 */

export interface SubtitleCue {
	/** milliseconds */
	start: number;
	/** milliseconds */
	end: number;
	text: string;
}

export type SubtitleTarget = 'vtt' | 'srt';

function stripBom(s: string): string {
	return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Byte-level decode for subtitle files. Blob.text() decodes UTF-8 only, but
 *  real-world SRTs are often UTF-16 (Windows Notepad "Unicode", Subtitle
 *  Workshop) or a legacy single-byte codepage (opensubtitles exports) — sniff
 *  the BOM, try strict UTF-8, and fall back to windows-1252 (the web's legacy
 *  default) so accented characters never ship as U+FFFD. */
export function decodeSubtitleText(bytes: Uint8Array): string {
	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
		return stripBom(new TextDecoder('utf-16le').decode(bytes));
	}
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
		return stripBom(new TextDecoder('utf-16be').decode(bytes));
	}
	// BOM-less UTF-16: subtitle text never contains NUL bytes, UTF-16-coded
	// ASCII is half NULs — their even/odd position picks the endianness.
	const scan = bytes.subarray(0, 512);
	let evenNul = 0;
	let oddNul = 0;
	for (let i = 0; i < scan.length; i++) {
		if (scan[i] !== 0) continue;
		if (i % 2 === 0) evenNul++;
		else oddNul++;
	}
	if (evenNul + oddNul > scan.length / 8) {
		return stripBom(new TextDecoder(oddNul > evenNul ? 'utf-16le' : 'utf-16be').decode(bytes));
	}
	try {
		return stripBom(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
	} catch {
		return new TextDecoder('windows-1252').decode(bytes);
	}
}

export function detectSubtitleFormat(raw: string): 'vtt' | 'ass' | 'srt' {
	const t = stripBom(raw).trimStart();
	if (t.startsWith('WEBVTT')) return 'vtt';
	if (/^\[Script Info\]/im.test(t) || /^Dialogue:/m.test(t)) return 'ass';
	if (/-->/.test(t)) return 'srt';
	throw new Error('Could not read this file as SRT, VTT or ASS subtitles');
}

/** SRT/VTT timestamp: [HH:]MM:SS(,|.)mmm — hours optional (VTT), 1-3 ms digits. */
const TIME_RE = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/;

function parseTime(match: RegExpMatchArray): number {
	const [, h, m, s, frac] = match;
	const ms = Number(frac.padEnd(3, '0'));
	return ((Number(h ?? 0) * 60 + Number(m)) * 60 + Number(s)) * 1000 + ms;
}

function normalizeNewlines(raw: string): string {
	return stripBom(raw).replace(/\r\n?/g, '\n');
}

function parseTimingLine(line: string): { start: number; end: number } | null {
	const arrow = line.indexOf('-->');
	if (arrow === -1) return null;
	const startMatch = line.slice(0, arrow).match(TIME_RE);
	// Only look right after the arrow so VTT cue settings can't shadow the end
	// time (they contain no timestamps, but be strict anyway).
	const endMatch = line.slice(arrow + 3).match(TIME_RE);
	if (!startMatch || !endMatch) return null;
	return { start: parseTime(startMatch), end: parseTime(endMatch) };
}

export function parseSrt(raw: string): SubtitleCue[] {
	const cues: SubtitleCue[] = [];
	for (const block of normalizeNewlines(raw).split(/\n{2,}/)) {
		const lines = block.split('\n').filter((l) => l.trim() !== '');
		if (lines.length === 0) continue;
		// Optional numeric counter line before the timing line.
		if (/^\d+$/.test(lines[0].trim()) && lines.length > 1 && lines[1].includes('-->')) {
			lines.shift();
		}
		const timing = parseTimingLine(lines[0] ?? '');
		if (!timing) continue;
		cues.push({ ...timing, text: lines.slice(1).join('\n') });
	}
	return cues;
}

/** VTT-only inline markup that SRT players choke on; <i>/<b>/<u> are valid SRT. */
function stripVttTags(text: string): string {
	return text
		.replace(/<\/?(?:c|v|lang|ruby|rt)(?:[.\s][^>]*)?>/gi, '')
		.replace(/<(?:\d{1,3}:)?\d{1,2}:\d{1,2}\.\d{1,3}>/g, ''); // karaoke timestamps — hours optional (VTT)
}

export function parseVtt(raw: string): SubtitleCue[] {
	const text = normalizeNewlines(raw);
	const cues: SubtitleCue[] = [];
	const blocks = text.split(/\n{2,}/);
	for (const block of blocks) {
		const lines = block.split('\n').filter((l) => l.trim() !== '');
		if (lines.length === 0) continue;
		const head = lines[0].trim();
		// Header + metadata blocks (NOTE/STYLE/REGION and the WEBVTT line itself).
		if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(head) || head === 'NOTE') continue;
		// Optional cue identifier line (any line without an arrow).
		if (!lines[0].includes('-->') && lines.length > 1 && lines[1].includes('-->')) {
			lines.shift();
		}
		const timing = parseTimingLine(lines[0] ?? '');
		if (!timing) continue;
		cues.push({ ...timing, text: lines.slice(1).join('\n') });
	}
	return cues;
}

/** ASS/SSA: [Events] Format-indexed Dialogue lines; times are CENTIseconds. */
export function parseAss(raw: string): SubtitleCue[] {
	const lines = normalizeNewlines(raw).split('\n');
	let fields: string[] | null = null;
	let inEvents = false;
	const cues: SubtitleCue[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (/^\[/.test(trimmed)) {
			inEvents = /^\[Events\]$/i.test(trimmed);
			continue;
		}
		if (!inEvents) continue;
		const fmt = trimmed.match(/^Format\s*:\s*(.*)$/i);
		if (fmt) {
			fields = fmt[1].split(',').map((f) => f.trim().toLowerCase());
			continue;
		}
		const dlg = trimmed.match(/^Dialogue\s*:\s*(.*)$/i);
		if (!dlg) continue;
		const cols = fields ?? [
			'layer',
			'start',
			'end',
			'style',
			'name',
			'marginl',
			'marginr',
			'marginv',
			'effect',
			'text'
		];
		// Text is always the last field — split with a limit so commas survive.
		const parts = splitWithLimit(dlg[1], ',', cols.length);
		const start = parseAssTime(parts[cols.indexOf('start')] ?? '');
		const end = parseAssTime(parts[cols.indexOf('end')] ?? '');
		if (start === null || end === null) continue;
		const textIdx = cols.indexOf('text');
		const rawText = textIdx === -1 ? '' : (parts[textIdx] ?? '');
		const text = rawText
			.replace(/\{[^}]*\}/g, '') // override tags {\i1}, {\pos(...)}, …
			.replace(/\\N|\\n/g, '\n')
			.replace(/\\h/g, ' ')
			.trim();
		cues.push({ start, end, text });
	}
	return cues;
}

function splitWithLimit(s: string, sep: string, limit: number): string[] {
	const parts: string[] = [];
	let rest = s;
	while (parts.length < limit - 1) {
		const i = rest.indexOf(sep);
		if (i === -1) break;
		parts.push(rest.slice(0, i).trim());
		rest = rest.slice(i + 1);
	}
	parts.push(rest.trim());
	return parts;
}

/** ASS time H:MM:SS.cc — final component is centiseconds. */
function parseAssTime(s: string): number | null {
	const m = s.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[.,](\d{1,2})$/);
	if (!m) return null;
	return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(m[4]) * 10;
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

function formatTime(ms: number, sep: ',' | '.'): string {
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor(ms / 60_000) % 60;
	const s = Math.floor(ms / 1000) % 60;
	const frac = String(Math.round(ms) % 1000).padStart(3, '0');
	return `${pad2(h)}:${pad2(m)}:${pad2(s)}${sep}${frac}`;
}

export function serializeSrt(cues: SubtitleCue[]): string {
	return (
		cues
			.map(
				(c, i) => `${i + 1}\n${formatTime(c.start, ',')} --> ${formatTime(c.end, ',')}\n${c.text}`
			)
			.join('\n\n') + '\n'
	);
}

export function serializeVtt(cues: SubtitleCue[]): string {
	return (
		'WEBVTT\n\n' +
		cues
			.map((c) => `${formatTime(c.start, '.')} --> ${formatTime(c.end, '.')}\n${c.text}`)
			.join('\n\n') +
		'\n'
	);
}

export interface SubtitleResult {
	text: string;
	cueCount: number;
	/** detected input format — lets the UI report "SRT → VTT · 312 cues" */
	from: 'srt' | 'vtt' | 'ass';
}

export function convertSubtitle(raw: string, to: SubtitleTarget): SubtitleResult {
	const from = detectSubtitleFormat(raw);
	let cues = { srt: parseSrt, vtt: parseVtt, ass: parseAss }[from](raw);
	if (cues.length === 0) {
		throw new Error('No subtitle cues found in this file');
	}
	cues = cues.slice().sort((a, b) => a.start - b.start);
	if (to === 'srt') {
		cues = cues.map((c) => ({ ...c, text: stripVttTags(c.text) }));
		return { text: serializeSrt(cues), cueCount: cues.length, from };
	}
	return { text: serializeVtt(cues), cueCount: cues.length, from };
}
