import { describe, expect, it } from 'vitest';
import { audioFormatChanged } from './audio';

describe('audioFormatChanged', () => {
	it('same container in and out is not a format change', () => {
		expect(audioFormatChanged('tone.mp3', 'mp3')).toBe(false);
		expect(audioFormatChanged('tone.m4a', 'm4a')).toBe(false);
		expect(audioFormatChanged('tone.wav', 'wav')).toBe(false);
		expect(audioFormatChanged('tone.flac', 'flac')).toBe(false);
		expect(audioFormatChanged('TONE.MP3', 'mp3')).toBe(false); // case-insensitive
	});

	it('crossing containers is a format change', () => {
		expect(audioFormatChanged('tone.wav', 'mp3')).toBe(true);
		expect(audioFormatChanged('tone.mp3', 'wav')).toBe(true);
		expect(audioFormatChanged('clip.mp4', 'm4a')).toBe(true);
	});

	it('raw ADTS .aac → M4A is a container change (ISOBMFF wrap), never keep-original', () => {
		// The ebook-family rule: formatChanged follows the CONTAINER, not the
		// codec. An .aac file is a raw ADTS stream; M4A output rewraps it in
		// ISOBMFF, so the keep-original guard must not return the raw stream.
		expect(audioFormatChanged('voice-memo.aac', 'm4a')).toBe(true);
	});

	it('keeps the deliberate stream-alias groupings', () => {
		// .oga is the same Ogg stream family as .ogg.
		expect(audioFormatChanged('tone.oga', 'ogg')).toBe(false);
		// .opus is deliberately split from ogg (AU-20 behavior).
		expect(audioFormatChanged('tone.opus', 'ogg')).toBe(true);
		expect(audioFormatChanged('tone.opus', 'opus')).toBe(false);
		expect(audioFormatChanged('tone.weba', 'weba')).toBe(false);
	});
});
