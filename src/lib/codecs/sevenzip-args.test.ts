import { describe, expect, it } from 'vitest';
import {
	ARCHIVE_IDLE_CEIL_MS,
	ARCHIVE_IDLE_FLOOR_MS,
	archiveIdleTimeoutMs,
	CONVERT_EXPANSION_FACTOR,
	buildCreateArgs,
	buildExtractArgs,
	buildListArgs,
	createListCounter,
	createStages,
	isEntryLine,
	mapSevenZipError,
	nextChainStep,
	sanitizeEntryName
} from './sevenzip-args';

describe('createStages', () => {
	it('runs tar.* targets as two passes', () => {
		expect(createStages('tgz')).toEqual(['tar', 'gzip']);
		expect(createStages('tbz2')).toEqual(['tar', 'bzip2']);
		expect(createStages('txz')).toEqual(['tar', 'xz']);
	});

	it('runs direct targets as one pass', () => {
		expect(createStages('zip')).toEqual(['zip']);
		expect(createStages('7z')).toEqual(['7z']);
		expect(createStages('tar')).toEqual(['tar']);
		expect(createStages('gz')).toEqual(['gzip']);
		expect(createStages('bz2')).toEqual(['bzip2']);
		expect(createStages('xz')).toEqual(['xz']);
	});
});

describe('buildCreateArgs', () => {
	const base = { level: 6 as const, password: '', encryptNames: false };

	it('maps UI levels onto -mx and separates operands with --', () => {
		const args = buildCreateArgs('zip', base, '/out/a.zip', ['x.txt', 'y.txt']);
		expect(args).toContain('-mx5');
		expect(args.slice(args.indexOf('--') + 1)).toEqual(['/out/a.zip', 'x.txt', 'y.txt']);
	});

	it('caps the 7z dictionary for wasm32 memory', () => {
		expect(buildCreateArgs('7z', base, '/out/a.7z', ['x'])).toContain('-md=16m');
	});

	it('passes no -mx for tar (uncompressed container)', () => {
		expect(buildCreateArgs('tar', base, '/out/a.tar', ['x']).join(' ')).not.toContain('-mx');
	});

	it('encrypts zip with AES-256 only when a password is set', () => {
		const plain = buildCreateArgs('zip', base, '/out/a.zip', ['x']);
		expect(plain.join(' ')).not.toContain('-p');
		const locked = buildCreateArgs('zip', { ...base, password: 'pw' }, '/out/a.zip', ['x']);
		expect(locked).toContain('-ppw');
		expect(locked).toContain('-mem=AES256');
	});

	it('adds -mhe=on only for 7z with encryptNames + password', () => {
		const locked = buildCreateArgs('7z', { ...base, password: 'pw', encryptNames: true }, 'o', [
			'x'
		]);
		expect(locked).toContain('-mhe=on');
		const noPw = buildCreateArgs('7z', { ...base, encryptNames: true }, 'o', ['x']);
		expect(noPw.join(' ')).not.toContain('-mhe');
		const zip = buildCreateArgs('zip', { ...base, password: 'pw', encryptNames: true }, 'o', ['x']);
		expect(zip.join(' ')).not.toContain('-mhe');
	});
});

describe('extract/list args', () => {
	it('always passes -y and an explicit -p so 7zz can never prompt', () => {
		expect(buildExtractArgs('/in/a.rar', '', '/out')).toEqual([
			'x',
			'-y',
			'-bb1',
			'-bsp0',
			'-p',
			'-o/out',
			'--',
			'/in/a.rar'
		]);
		expect(buildListArgs('/in/a.rar', 'pw')).toEqual([
			'l',
			'-slt',
			'-y',
			'-ppw',
			'--',
			'/in/a.rar'
		]);
	});

	it('recognizes -bb1 per-entry lines', () => {
		expect(isEntryLine('- dir/file.txt')).toBe(true);
		expect(isEntryLine('Everything is Ok')).toBe(false);
	});
});

describe('createListCounter', () => {
	const listing = [
		'Listing archive: /in/a.7z',
		'--',
		'Path = /in/a.7z',
		'Type = 7z',
		'Physical Size = 189',
		'',
		'----------',
		'Path = docs',
		'Folder = +',
		'',
		'Path = docs/readme.txt',
		'Size = 20',
		'Encrypted = +',
		'',
		'Path = image.png',
		'Size = 4096',
		'Attributes = A',
		''
	];

	const feed = (lines: string[]) => {
		const counter = createListCounter();
		for (const line of lines) counter.onLine(line);
		return counter;
	};

	it('counts file entries only — folders and the archive header block do not', () => {
		expect(feed(listing).count()).toBe(2);
	});

	it('returns null when the listing never reached the separator', () => {
		expect(feed(['Listing archive: x', 'ERROR: oops']).count()).toBeNull();
	});

	it('counts the final block even without a trailing line', () => {
		expect(feed(['----------', 'Path = only.txt', 'Size = 3']).count()).toBe(1);
	});

	it('is stable across repeated count() calls', () => {
		const counter = feed(listing);
		expect(counter.count()).toBe(2);
		expect(counter.count()).toBe(2);
	});

	it('handles listings far beyond the worker tail ring (the frozen-bar bug)', () => {
		// 40 entries × ~18 lines ≈ 720 lines — the old tail-parse saw only the
		// last 60 and returned null; incremental counting must not care.
		const lines = ['preamble', '----------'];
		for (let i = 0; i < 40; i++) {
			lines.push(`Path = file-${i}.txt`, 'Size = 10', 'Packed Size = 5');
			for (let pad = 0; pad < 15; pad++) lines.push(`Field${pad} = value`);
			lines.push('');
		}
		expect(feed(lines).count()).toBe(40);
	});
});

describe('mapSevenZipError', () => {
	it('treats exit 0/1/null (no throw) as success', () => {
		expect(mapSevenZipError(0, false, '', false)).toBeNull();
		expect(mapSevenZipError(1, false, 'WARNING: something', false)).toBeNull();
		expect(mapSevenZipError(null, false, '', false)).toBeNull();
	});

	it('maps password signals by whether a password was supplied', () => {
		const tail = 'ERROR: Wrong password : a.txt';
		expect(mapSevenZipError(2, false, tail, true)).toMatch(/^Wrong password/);
		expect(mapSevenZipError(2, false, tail, false)).toMatch(/password-protected/);
		expect(
			mapSevenZipError(2, false, 'Cannot open encrypted archive. Wrong password?', false)
		).toMatch(/password-protected/);
		expect(
			mapSevenZipError(2, false, 'ERROR: Data Error in encrypted file. Wrong password? : foo', true)
		).toMatch(/^Wrong password/);
	});

	it('maps not-an-archive and out-of-memory failures', () => {
		expect(mapSevenZipError(2, false, 'Cannot open the file as archive', false)).toMatch(
			/supported archive/
		);
		expect(mapSevenZipError(8, false, '', false)).toMatch(/memory/);
	});

	it('maps numeric C++ throws to the password hypothesis', () => {
		expect(mapSevenZipError(null, true, '', false)).toMatch(/password-protected or damaged/);
		expect(mapSevenZipError(null, true, '', true)).toMatch(
			/wrong password, or the file is damaged/
		);
	});

	it('falls back to the last ERROR line, then a generic message', () => {
		expect(mapSevenZipError(2, false, 'noise\nERROR: CRC failed : x.bin', false)).toBe(
			'CRC failed : x.bin'
		);
		expect(mapSevenZipError(2, false, 'no error marker here', false)).toBe(
			'Archive operation failed'
		);
	});
});

describe('nextChainStep', () => {
	it('chains a lone tar/cpio/iso container from a decompression pass', () => {
		expect(nextChainStep([{ path: 'x.tar', size: 10 }], 0)?.keep).toBe('x.tar');
		expect(nextChainStep([{ path: 'pkg-1.0.cpio', size: 10 }], 1)?.keep).toBe('pkg-1.0.cpio');
		expect(nextChainStep([{ path: 'disk.iso', size: 10 }], 0)?.keep).toBe('disk.iso');
		expect(nextChainStep([{ path: 'data.tar.xz', size: 10 }], 0)?.keep).toBe('data.tar.xz');
	});

	it('picks the data.tar payload out of a deb and says so', () => {
		const step = nextChainStep(
			[
				{ path: 'debian-binary', size: 4 },
				{ path: 'control.tar.gz', size: 100 },
				{ path: 'data.tar.xz', size: 900 }
			],
			0
		);
		expect(step?.keep).toBe('data.tar.xz');
		expect(step?.note).toMatch(/control files/);
	});

	it('stops on real results, multiple entries and the hop cap', () => {
		expect(nextChainStep([{ path: 'photo.jpg', size: 10 }], 0)).toBeNull();
		expect(
			nextChainStep(
				[
					{ path: 'a.txt', size: 1 },
					{ path: 'b.txt', size: 2 }
				],
				0
			)
		).toBeNull();
		expect(nextChainStep([{ path: 'x.tar', size: 10 }], 3)).toBeNull();
	});
});

describe('sanitizeEntryName', () => {
	it('flattens separators and strips control characters', () => {
		expect(sanitizeEntryName('dir/sub\\file.txt')).toBe('dir_sub_file.txt');
		expect(sanitizeEntryName('a\u0000b\u001fc.txt')).toBe('abc.txt');
	});

	it('never returns an empty or dot name', () => {
		expect(sanitizeEntryName('')).toBe('file');
		expect(sanitizeEntryName('..')).toBe('file');
		expect(sanitizeEntryName('   ')).toBe('file');
	});
});

/**
 * CONTRACT tests, deliberately not exact-ms mirrors of the rate constant:
 * re-deriving the implementation's arithmetic proves nothing about whether
 * the constant fits real devices, and it breaks on every honest retune.
 * The floor and ceiling ARE exact — they are promises to rpc.ts and the UI.
 */
describe('archiveIdleTimeoutMs', () => {
	const MB = 1024 * 1024;

	it('never dips below the kind-default floor', () => {
		expect(archiveIdleTimeoutMs(0)).toBe(ARCHIVE_IDLE_FLOOR_MS);
		expect(archiveIdleTimeoutMs(50 * MB)).toBe(ARCHIVE_IDLE_FLOOR_MS);
	});

	it('gives large inputs strictly more than the floor, bounded by the ceiling', () => {
		const window = archiveIdleTimeoutMs(600 * MB);
		expect(window).toBeGreaterThan(ARCHIVE_IDLE_FLOOR_MS);
		expect(window).toBeLessThan(ARCHIVE_IDLE_CEIL_MS);
	});

	it('scales linearly on the un-clamped segment', () => {
		// The RATIO survives any retune of the bytes/s budget; a unit slip
		// (s vs ms) or an accidental non-linear curve breaks it.
		const w1 = archiveIdleTimeoutMs(300 * MB);
		const w2 = archiveIdleTimeoutMs(600 * MB);
		expect(w1).toBeGreaterThan(ARCHIVE_IDLE_FLOOR_MS);
		expect(w2).toBeLessThan(ARCHIVE_IDLE_CEIL_MS);
		expect(w2 / w1).toBeCloseTo(2, 5);
	});

	it('caps at the one-hour ceiling', () => {
		expect(archiveIdleTimeoutMs(100 * 1024 * MB)).toBe(ARCHIVE_IDLE_CEIL_MS);
	});

	it('is monotonic in input size', () => {
		const sizes = [0, MB, 300 * MB, 600 * MB, 1024 * MB, 4096 * MB];
		const windows = sizes.map(archiveIdleTimeoutMs);
		expect([...windows].sort((a, b) => a - b)).toEqual(windows);
	});

	it('convert expansion buys a floor-level source real extra window', () => {
		// The user-facing contract: a modest compressed source whose own size
		// sits at the floor must NOT be watchdogged at the floor during its
		// repack — the expansion factor has to lift it.
		const source = 60 * MB;
		expect(archiveIdleTimeoutMs(source)).toBe(ARCHIVE_IDLE_FLOOR_MS);
		expect(archiveIdleTimeoutMs(source * CONVERT_EXPANSION_FACTOR)).toBeGreaterThan(
			ARCHIVE_IDLE_FLOOR_MS
		);
	});
});
