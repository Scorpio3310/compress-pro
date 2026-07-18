import { describe, expect, it } from 'vitest';
import {
	convertSubtitle,
	decodeSubtitleText,
	detectSubtitleFormat,
	parseAss,
	parseSrt,
	parseVtt,
	serializeSrt,
	serializeVtt
} from './subtitles';

const SRT = `1
00:00:01,000 --> 00:00:03,500
Hello world

2
00:00:04,000 --> 00:00:06,000
Second line
over two rows
`;

const VTT = `WEBVTT - with a header comment

NOTE
This note block must be skipped.

STYLE
::cue { color: gold }

intro
00:01.000 --> 00:03.500 position:10%,line-left align:left
Hello <c.yellow>world</c>

00:00:04.000 --> 00:00:06.000
<v Speaker>Second <i>line</i></v>
`;

const ASS = `[Script Info]
Title: Test

[V4+ Styles]
Format: Name, Fontname
Style: Default,Arial

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\i1}Hello{\\i0} world
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,Line one\\NLine two, with comma
`;

describe('detectSubtitleFormat', () => {
	it('detects by content, not extension', () => {
		expect(detectSubtitleFormat(SRT)).toBe('srt');
		expect(detectSubtitleFormat(VTT)).toBe('vtt');
		expect(detectSubtitleFormat(ASS)).toBe('ass');
	});

	it('survives a BOM and leading blank lines', () => {
		expect(detectSubtitleFormat('﻿\n\nWEBVTT\n')).toBe('vtt');
	});

	it('throws on garbage', () => {
		expect(() => detectSubtitleFormat('just some prose')).toThrow(/SRT, VTT or ASS/);
	});
});

describe('parseSrt', () => {
	it('reads counters, comma timestamps and multi-line text', () => {
		const cues = parseSrt(SRT);
		expect(cues).toHaveLength(2);
		expect(cues[0]).toEqual({ start: 1000, end: 3500, text: 'Hello world' });
		expect(cues[1].text).toBe('Second line\nover two rows');
	});

	it('accepts CRLF, missing counters and dot milliseconds', () => {
		const cues = parseSrt('00:00:01.250 --> 00:00:02.750\r\nLoose cue\r\n');
		expect(cues).toEqual([{ start: 1250, end: 2750, text: 'Loose cue' }]);
	});
});

describe('parseVtt', () => {
	it('skips header/NOTE/STYLE blocks, ids and cue settings', () => {
		const cues = parseVtt(VTT);
		expect(cues).toHaveLength(2);
		expect(cues[0].start).toBe(1000); // hourless MM:SS.mmm form
		expect(cues[0].end).toBe(3500);
		expect(cues[0].text).toBe('Hello <c.yellow>world</c>');
	});
});

describe('parseAss', () => {
	it('uses Format field order, centiseconds and keeps commas in text', () => {
		const cues = parseAss(ASS);
		expect(cues).toHaveLength(2);
		expect(cues[0]).toEqual({ start: 1000, end: 3500, text: 'Hello world' });
		expect(cues[1].text).toBe('Line one\nLine two, with comma');
	});
});

describe('serializers', () => {
	const cues = [{ start: 1000, end: 3500, text: 'Hi' }];

	it('SRT: counters, comma decimals, LF endings', () => {
		expect(serializeSrt(cues)).toBe('1\n00:00:01,000 --> 00:00:03,500\nHi\n');
	});

	it('VTT: WEBVTT header and dot decimals', () => {
		expect(serializeVtt(cues)).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nHi\n');
	});

	it('rolls hours past 60 minutes', () => {
		expect(serializeVtt([{ start: 3_723_004, end: 3_724_000, text: 'x' }])).toContain(
			'01:02:03.004 --> 01:02:04.000'
		);
	});
});

describe('convertSubtitle', () => {
	it('srt → vtt', () => {
		const out = convertSubtitle(SRT, 'vtt');
		expect(out.from).toBe('srt');
		expect(out.cueCount).toBe(2);
		expect(out.text.startsWith('WEBVTT\n\n')).toBe(true);
		expect(out.text).toContain('00:00:01.000 --> 00:00:03.500');
	});

	it('vtt → srt strips VTT-only tags but keeps <i>', () => {
		const out = convertSubtitle(VTT, 'srt');
		expect(out.text).toContain('1\n00:00:01,000 --> 00:00:03,500\nHello world');
		expect(out.text).toContain('Second <i>line</i>');
		expect(out.text).not.toContain('<v');
		expect(out.text).not.toContain('<c');
	});

	it('ass → srt and ass → vtt both work', () => {
		expect(convertSubtitle(ASS, 'srt').text).toContain('Hello world');
		expect(convertSubtitle(ASS, 'vtt').text).toContain('Line one\nLine two, with comma');
	});

	it('sorts cues by start time', () => {
		const out = convertSubtitle(
			'00:00:05,000 --> 00:00:06,000\nlater\n\n00:00:01,000 --> 00:00:02,000\nearlier\n',
			'vtt'
		);
		expect(out.text.indexOf('earlier')).toBeLessThan(out.text.indexOf('later'));
	});

	it('throws when no cues survive parsing', () => {
		expect(() => convertSubtitle('WEBVTT\n\nNOTE nothing here\n', 'srt')).toThrow(
			/No subtitle cues/
		);
	});

	it('vtt → srt strips hourless karaoke timestamps too', () => {
		const out = convertSubtitle(
			'WEBVTT\n\n00:00:15.000 --> 00:00:18.500\n<00:16.000>Never <00:17.000>gonna <00:00:18.000>give\n',
			'srt'
		);
		expect(out.text).toContain('Never gonna give');
		expect(out.text).not.toContain('<');
	});
});

describe('decodeSubtitleText', () => {
	const srtFor = (text: string) => `1\r\n00:00:01,000 --> 00:00:02,000\r\n${text}\r\n`;

	const utf16 = (s: string, endian: 'le' | 'be', bom: boolean) => {
		const withBom = bom ? '﻿' + s : s;
		const buf = new Uint8Array(withBom.length * 2);
		for (let i = 0; i < withBom.length; i++) {
			const c = withBom.charCodeAt(i);
			buf[2 * i] = endian === 'le' ? c & 0xff : c >> 8;
			buf[2 * i + 1] = endian === 'le' ? c >> 8 : c & 0xff;
		}
		return buf;
	};

	it('passes UTF-8 through and strips the BOM', () => {
		const decoded = decodeSubtitleText(new TextEncoder().encode('﻿' + srtFor('čšž')));
		expect(decoded).toContain('čšž');
		expect(decoded.charCodeAt(0)).not.toBe(0xfeff);
	});

	it('decodes UTF-16LE with BOM (Windows Notepad "Unicode") end to end', () => {
		const bytes = utf16(srtFor('Čeprav žvižga'), 'le', true);
		const out = convertSubtitle(decodeSubtitleText(bytes), 'vtt');
		expect(out.from).toBe('srt');
		expect(out.cueCount).toBe(1);
		expect(out.text).toContain('Čeprav žvižga');
	});

	it('decodes UTF-16BE with BOM', () => {
		const bytes = utf16(srtFor('Čeprav žvižga'), 'be', true);
		expect(decodeSubtitleText(bytes)).toContain('Čeprav žvižga');
	});

	it('guesses BOM-less UTF-16LE from the NUL-byte pattern', () => {
		const bytes = utf16(srtFor('plain ascii cue'), 'le', false);
		const out = convertSubtitle(decodeSubtitleText(bytes), 'vtt');
		expect(out.text).toContain('plain ascii cue');
	});

	it('falls back to windows-1252 when strict UTF-8 fails — no U+FFFD', () => {
		// é as a single 0xE9 byte — the opensubtitles CP-1252 legacy shape.
		// (Only 0xA0–0xFF asserted: Node's ICU maps the 0x80–0x9F smart-quote
		// range to C1 controls, browsers follow WHATWG — 0xE9 agrees in both.)
		const template = srtFor('caf# au lait');
		const bytes = Uint8Array.from(template, (ch) => (ch === '#' ? 0xe9 : ch.charCodeAt(0)));
		const out = convertSubtitle(decodeSubtitleText(bytes), 'vtt');
		expect(out.text).toContain('café au lait');
		expect(out.text).not.toContain('\uFFFD');
	});
});
