import { describe, expect, it } from 'vitest';
import {
	ARCHIVE_IDLE_CEIL_MS,
	ARCHIVE_IDLE_FLOOR_MS,
	archiveIdleTimeoutMs,
	CONVERT_EXPANSION_FACTOR,
	EXTRACT_MAX_TOTAL_BYTES,
	buildCreateArgs,
	buildExtractArgs,
	buildListArgs,
	createListCounter,
	createStages,
	createTailRecorder,
	extractTooLargeError,
	isEntryLine,
	mapSevenZipError,
	nextChainStep,
	outerTypeFromName,
	sanitizeEntryName,
	subItemsErrors
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

	it('latches the OUTER archive type from the header block, normalized', () => {
		expect(feed(listing).archiveType()).toBe('7z');
		// deb/rpm listings print the outer type FIRST, then the auto-opened
		// nested payload's type — the first one is the container's identity.
		const deb = feed([
			'Listing archive: /in/sample.deb',
			'--',
			'Path = /in/sample.deb',
			'Type = Ar',
			'--',
			'Path = data.tar.gz',
			'Type = gzip',
			'----------',
			'Path = data.tar',
			'Size = 10240'
		]);
		expect(deb.archiveType()).toBe('ar');
	});

	it('returns null archive type when no Type line appeared', () => {
		expect(feed(['Listing archive: x', 'ERROR: oops']).archiveType()).toBeNull();
	});

	it('never reads a Type line from an entry block as the outer type', () => {
		const c = feed(['----------', 'Path = weird.bin', 'Type = zip', 'Size = 5']);
		expect(c.archiveType()).toBeNull();
	});

	it('sums uncompressed entry sizes — files only, header block excluded', () => {
		// The header block's "Physical Size" must not count; folder blocks and
		// their Size lines must not count either.
		const c = feed([
			'Path = /in/a.7z',
			'Physical Size = 189',
			'Size = 999999',
			'----------',
			'Path = docs',
			'Size = 0',
			'Folder = +',
			'',
			'Path = docs/readme.txt',
			'Size = 20',
			'',
			'Path = image.png',
			'Size = 4096'
		]);
		expect(c.totalSize()).toBe(20 + 4096);
	});

	it('counts a folder Size even when the folder marker comes after it', () => {
		// -slt field order is not fixed: Size can precede Attributes = D.
		const c = feed(['----------', 'Path = dir', 'Size = 123', 'Attributes = D drwxr-xr-x']);
		expect(c.totalSize()).toBe(0);
	});

	it('tolerates blank or missing Size fields', () => {
		const c = feed(['----------', 'Path = a.txt', 'Size = ', '', 'Path = b.txt']);
		expect(c.totalSize()).toBe(0);
		expect(c.count()).toBe(2);
	});
});

describe('extract size ceiling', () => {
	it('is 2 GiB — the renderer heap can hold roughly double that transiently', () => {
		expect(EXTRACT_MAX_TOTAL_BYTES).toBe(2 * 1024 ** 3);
	});

	it('names both the archive total and the limit, honestly', () => {
		const message = extractTooLargeError(5.5 * 1024 ** 3);
		expect(message).toContain('5.5 GB');
		expect(message).toContain('2 GB');
		expect(message).toMatch(/desktop/i);
	});
});

describe('createTailRecorder', () => {
	it('keeps early password signals that thousands of entry lines would evict', () => {
		// The mixed-encryption shape: 3 encrypted entries fail FIRST, then
		// hundreds of clean "- name" lines scroll the 60-line ring past them.
		const recorder = createTailRecorder();
		recorder.push('Extracting archive: /in/m.zip');
		for (let i = 0; i < 3; i++) recorder.push(`ERROR: Wrong password : locked-${i}.bin`);
		for (let i = 0; i < 500; i++) recorder.push(`- plain-${i}.txt`);
		recorder.push('Sub items Errors: 3');
		const tail = recorder.tail();
		expect(tail).toContain('Wrong password');
		expect(mapSevenZipError(2, false, tail, false)).toMatch(/password-protected/);
		expect(mapSevenZipError(2, false, tail, true)).toMatch(/^Wrong password/);
	});

	it('stays bounded when the run spews thousands of error lines', () => {
		const recorder = createTailRecorder();
		for (let i = 0; i < 5000; i++) recorder.push(`ERROR: CRC Failed : file-${i}.bin`);
		expect(recorder.tail().length).toBeLessThan(10_000);
	});

	it('behaves like the plain ring for ordinary output', () => {
		const recorder = createTailRecorder();
		for (let i = 0; i < 100; i++) recorder.push(`- file-${i}.txt`);
		const lines = recorder.tail().split('\n');
		expect(lines.length).toBe(60);
		expect(lines.at(-1)).toBe('- file-99.txt');
	});
});

describe('subItemsErrors', () => {
	it('reads the per-entry failure count from the closing summary', () => {
		expect(subItemsErrors('- a.txt\n- b.txt\nSub items Errors: 3\n')).toBe(3);
		expect(subItemsErrors('Everything is Ok')).toBeNull();
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
	it('chains a lone tar/cpio/iso container out of a single-stream WRAPPER', () => {
		expect(nextChainStep([{ path: 'x.tar', size: 10 }], 0, 'gzip')?.keep).toBe('x.tar');
		expect(nextChainStep([{ path: 'x.tar', size: 10 }], 0, 'bzip2')?.keep).toBe('x.tar');
		expect(nextChainStep([{ path: 'pkg-1.0.cpio', size: 10 }], 1, 'rpm')?.keep).toBe(
			'pkg-1.0.cpio'
		);
		expect(nextChainStep([{ path: 'disk.iso', size: 10 }], 0, 'z')?.keep).toBe('disk.iso');
		expect(nextChainStep([{ path: 'data.tar.xz', size: 10 }], 0, 'ar')?.keep).toBe('data.tar.xz');
	});

	it('never unwraps a container out of a BUNDLING outer — the entry IS the result', () => {
		// A zip holding exactly backup.tar: the user wants backup.tar as a row,
		// not its exploded contents (the old entry-name guess flipped on count).
		expect(nextChainStep([{ path: 'backup.tar', size: 10 }], 0, 'zip')).toBeNull();
		expect(nextChainStep([{ path: 'backup.tar', size: 10 }], 0, '7z')).toBeNull();
		expect(nextChainStep([{ path: 'backup.tar', size: 10 }], 0, 'rar5')).toBeNull();
		expect(nextChainStep([{ path: 'disk.iso', size: 10 }], 0, 'tar')).toBeNull();
	});

	it('stays put when the outer type is unknown — honesty over guessing', () => {
		expect(nextChainStep([{ path: 'x.tar', size: 10 }], 0, null)).toBeNull();
	});

	it('picks the data.tar payload out of a real deb (ar members) and says so', () => {
		const entries = [
			{ path: 'debian-binary', size: 4 },
			{ path: 'control.tar.gz', size: 100 },
			{ path: 'data.tar.xz', size: 900 }
		];
		for (const outer of ['ar', 'deb']) {
			const step = nextChainStep(entries, 0, outer);
			expect(step?.keep).toBe('data.tar.xz');
			expect(step?.note).toMatch(/control files/);
		}
	});

	it('notes the skipped control files when the Deb handler pre-unwraps to data.tar', () => {
		// 7zz auto-descends a .deb to its (already gunzipped) data.tar — the
		// engine has silently dropped debian-binary/control.tar by then, so the
		// note must say so here too.
		const step = nextChainStep([{ path: 'data.tar', size: 10240 }], 0, 'ar');
		expect(step?.keep).toBe('data.tar');
		expect(step?.note).toMatch(/control files/);
	});

	it('keeps deb-lookalike entries intact inside a zip (siblings preserved)', () => {
		// Someone zipped an unpacked-deb working directory: notes.txt and
		// control.tar.gz are real files the user must get back.
		expect(
			nextChainStep(
				[
					{ path: 'debian-binary', size: 4 },
					{ path: 'control.tar.gz', size: 100 },
					{ path: 'data.tar.gz', size: 900 },
					{ path: 'notes.txt', size: 12 }
				],
				0,
				'zip'
			)
		).toBeNull();
	});

	it('stops on real results, multiple entries and the hop cap', () => {
		expect(nextChainStep([{ path: 'photo.jpg', size: 10 }], 0, 'gzip')).toBeNull();
		expect(
			nextChainStep(
				[
					{ path: 'a.txt', size: 1 },
					{ path: 'b.txt', size: 2 }
				],
				0,
				'gzip'
			)
		).toBeNull();
		expect(nextChainStep([{ path: 'x.tar', size: 10 }], 3, 'gzip')).toBeNull();
	});
});

describe('outerTypeFromName', () => {
	it('maps wrapper extensions for the list-pass-failed fallback', () => {
		expect(outerTypeFromName('backup.tar.gz')).toBe('gzip');
		expect(outerTypeFromName('backup.tgz')).toBe('gzip');
		expect(outerTypeFromName('backup.tar.bz2')).toBe('bzip2');
		expect(outerTypeFromName('backup.txz')).toBe('xz');
		expect(outerTypeFromName('disk.iso.Z')).toBe('z');
		expect(outerTypeFromName('pkg.rpm')).toBe('rpm');
		expect(outerTypeFromName('pkg.deb')).toBe('deb');
		expect(outerTypeFromName('data.tar.zst')).toBe('zstd');
	});

	it('maps bundling extensions so they can be told apart from wrappers', () => {
		expect(outerTypeFromName('bundle.zip')).toBe('zip');
		expect(outerTypeFromName('bundle.7z')).toBe('7z');
		expect(outerTypeFromName('backup.tar')).toBe('tar');
	});

	it('returns null for unknown extensions', () => {
		expect(outerTypeFromName('mystery.bin')).toBeNull();
		expect(outerTypeFromName('no-extension')).toBeNull();
	});
});

describe('sanitizeEntryName', () => {
	it('flattens separators and strips control characters', () => {
		expect(sanitizeEntryName('dir/sub\\file.txt')).toBe('dir_sub_file.txt');
		expect(sanitizeEntryName('a\u0000b\u001fc.txt')).toBe('abc.txt');
	});

	it('strips bidi override characters used for extension spoofing', () => {
		const rlo = String.fromCharCode(0x202e); // right-to-left override
		expect(sanitizeEntryName(`photo${rlo}gpj.exe`)).toBe('photogpj.exe');
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
