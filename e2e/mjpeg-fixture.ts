/**
 * Motion-JPEG fixture generator. Browsers and mediabunny can't *encode* MJPEG,
 * and the repo has no ffmpeg, so this hand-muxes a minimal QuickTime .mov with a
 * 'jpeg' video sample entry (frames from sharp) plus a PCM ('sowt') audio track —
 * the shape a camera / Photo-JPEG .mov has, and the file our convertMjpeg path
 * turns back into H.264/VP9. Pure Node, so it runs in Playwright global-setup
 * (unlike video-fixtures.ts, which needs Chromium to encode).
 *
 * Solid per-frame colors + a steady 440 Hz tone make the output verifiable.
 * The muxer was validated by round-tripping through mediabunny (null codec,
 * JPEG packets, PCM audio) and by the V-30 spec that consumes this file.
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MJPEG_DIR = join(ROOT, 'tests', 'fixtures', 'generated', 'video');

export const MJPEG_NAME = 'v-mjpeg-96x64.mov';
export const MJPEG_SPEC = {
	width: 96,
	height: 64,
	fps: 10,
	frames: 12,
	timescale: 600,
	audioRate: 44100,
	channels: 1,
	colors: [
		[220, 40, 40],
		[40, 200, 40],
		[40, 80, 230],
		[230, 210, 40],
		[210, 40, 210],
		[40, 210, 210],
		[240, 140, 30],
		[120, 120, 120],
		[240, 240, 240],
		[30, 30, 30],
		[180, 90, 200],
		[90, 180, 120]
	] as [number, number, number][]
};

type Part = Buffer | string;

const u16 = (n: number): Buffer => {
	const b = Buffer.alloc(2);
	b.writeUInt16BE(n & 0xffff);
	return b;
};
const u32 = (n: number): Buffer => {
	const b = Buffer.alloc(4);
	b.writeUInt32BE(n >>> 0);
	return b;
};
const box = (type: string, ...parts: Part[]): Buffer => {
	const payload = Buffer.concat(
		parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : p))
	);
	return Buffer.concat([u32(payload.length + 8), Buffer.from(type, 'latin1'), payload]);
};
const fullbox = (type: string, version: number, flags: number, ...parts: Part[]): Buffer =>
	box(
		type,
		Buffer.from([version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff]),
		...parts
	);
const MATRIX = Buffer.concat([0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(u32));

async function buildMov(): Promise<Buffer> {
	const {
		width: W,
		height: H,
		fps,
		frames: N,
		timescale: TS,
		audioRate: AR,
		channels: CH
	} = MJPEG_SPEC;
	const vDur = TS / fps;

	const jpegs: Buffer[] = [];
	for (let i = 0; i < N; i++) {
		const [r, g, b] = MJPEG_SPEC.colors[i % MJPEG_SPEC.colors.length];
		jpegs.push(
			await sharp({ create: { width: W, height: H, channels: 3, background: { r, g, b } } })
				.jpeg({ quality: 92 })
				.toBuffer()
		);
	}

	// 16-bit LE mono sine, one PCM frame per "sample".
	const sampleCount = Math.round(AR * (N / fps));
	const pcm = Buffer.alloc(sampleCount * 2 * CH);
	for (let i = 0; i < sampleCount; i++) {
		const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / AR) * 12000);
		for (let c = 0; c < CH; c++) pcm.writeInt16LE(v, (i * CH + c) * 2);
	}
	const mdatData = Buffer.concat([...jpegs, pcm]);

	// video stbl children (offset-independent)
	const visual = Buffer.concat([
		Buffer.alloc(6),
		u16(1),
		u16(0),
		u16(0),
		Buffer.alloc(12),
		u16(W),
		u16(H),
		u32(0x00480000),
		u32(0x00480000),
		u32(0),
		u16(1),
		Buffer.alloc(32),
		u16(0x0018),
		u16(0xffff)
	]);
	const vStsd = fullbox('stsd', 0, 0, u32(1), box('jpeg', visual));
	const vStts = fullbox('stts', 0, 0, u32(1), u32(N), u32(vDur));
	const vStsc = fullbox('stsc', 0, 0, u32(1), u32(1), u32(N), u32(1));
	const vStsz = fullbox('stsz', 0, 0, u32(0), u32(N), ...jpegs.map((f) => u32(f.length)));

	// audio stbl children (PCM 'sowt')
	const audioEntry = box(
		'sowt',
		Buffer.alloc(6),
		u16(1),
		u16(0),
		u16(0),
		u32(0),
		u16(CH),
		u16(16),
		u16(0),
		u16(0),
		u32(AR << 16)
	);
	const aStsd = fullbox('stsd', 0, 0, u32(1), audioEntry);
	const aStts = fullbox('stts', 0, 0, u32(1), u32(sampleCount), u32(1));
	const aStsc = fullbox('stsc', 0, 0, u32(1), u32(1), u32(sampleCount), u32(1));
	const aStsz = fullbox('stsz', 0, 0, u32(2 * CH), u32(sampleCount));

	const build = (vChunkOff: number, aChunkOff: number): Buffer => {
		const vStbl = box(
			'stbl',
			vStsd,
			vStts,
			vStsc,
			vStsz,
			fullbox('stco', 0, 0, u32(1), u32(vChunkOff))
		);
		const dinf = () => box('dinf', fullbox('dref', 0, 0, u32(1), fullbox('url ', 0, 1)));
		const vMinf = box('minf', fullbox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)), dinf(), vStbl);
		const vMdhd = fullbox(
			'mdhd',
			0,
			0,
			u32(0),
			u32(0),
			u32(TS),
			u32(vDur * N),
			u16(0x55c4),
			u16(0)
		);
		const vHdlr = fullbox('hdlr', 0, 0, u32(0), 'vide', Buffer.alloc(12), 'VideoHandler\0');
		const vTkhd = fullbox(
			'tkhd',
			0,
			7,
			u32(0),
			u32(0),
			u32(1),
			u32(0),
			u32(vDur * N),
			Buffer.alloc(8),
			u16(0),
			u16(0),
			u16(0),
			u16(0),
			MATRIX,
			u32(W << 16),
			u32(H << 16)
		);
		const vTrak = box('trak', vTkhd, box('mdia', vMdhd, vHdlr, vMinf));

		const aStbl = box(
			'stbl',
			aStsd,
			aStts,
			aStsc,
			aStsz,
			fullbox('stco', 0, 0, u32(1), u32(aChunkOff))
		);
		const aMinf = box('minf', fullbox('smhd', 0, 0, u16(0), u16(0)), dinf(), aStbl);
		const aMdhd = fullbox(
			'mdhd',
			0,
			0,
			u32(0),
			u32(0),
			u32(AR),
			u32(sampleCount),
			u16(0x55c4),
			u16(0)
		);
		const aHdlr = fullbox('hdlr', 0, 0, u32(0), 'soun', Buffer.alloc(12), 'SoundHandler\0');
		const aTkhd = fullbox(
			'tkhd',
			0,
			7,
			u32(0),
			u32(0),
			u32(2),
			u32(0),
			u32(Math.round((sampleCount / AR) * TS)),
			Buffer.alloc(8),
			u16(0),
			u16(0),
			u16(0),
			u16(0),
			MATRIX,
			u32(0),
			u32(0)
		);
		const aTrak = box('trak', aTkhd, box('mdia', aMdhd, aHdlr, aMinf));

		const mvhd = fullbox(
			'mvhd',
			0,
			0,
			u32(0),
			u32(0),
			u32(TS),
			u32(vDur * N),
			u32(0x00010000),
			u16(0x0100),
			u16(0),
			u32(0),
			u32(0),
			MATRIX,
			Buffer.alloc(24),
			u32(3)
		);
		return box('moov', mvhd, vTrak, aTrak);
	};

	const ftyp = box('ftyp', 'qt  ', u32(0), 'qt  ');
	const moov0 = build(0, 0);
	const mdatStart = ftyp.length + moov0.length + 8;
	const moov = build(mdatStart, mdatStart + jpegs.reduce((s, f) => s + f.length, 0));
	if (moov.length !== moov0.length) throw new Error('moov size shifted after offset patch');
	return Buffer.concat([ftyp, moov, box('mdat', mdatData)]);
}

/** Writes the MJPEG .mov into the generated-video dir (idempotent). */
export async function generateMjpegFixtures(): Promise<string> {
	mkdirSync(MJPEG_DIR, { recursive: true });
	const out = join(MJPEG_DIR, MJPEG_NAME);
	if (!existsSync(out)) writeFileSync(out, await buildMov());
	return out;
}
