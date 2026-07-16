import type { ArchiveOutputFormat } from '$lib/types';

/**
 * Pure argument/parsing helpers for the 7zz CLI (7z-wasm) — kept free of
 * worker/wasm imports so they unit-test in node. The worker composes these;
 * nothing here touches a filesystem.
 *
 * CLI invariants (verified against 7-Zip 24.09 in the integration spike):
 * - callMain RETURNS the exit code (0 ok, 1 warning, 2 error, 8 memory);
 *   onExit never fires in this build.
 * - Password failures on header-encrypted 7z archives escape as NUMERIC C++
 *   exceptions, not exit codes — callers must catch and map those too.
 * - Always pass an explicit `-p` (even empty) and `-y`, or 7zz would block on
 *   an interactive prompt there is no TTY for.
 * - `--` before file operands so an archive named "-foo" can't become a switch.
 */

/** UI levels (shared with fflate's 0/1/6/9 deflate scale) → 7zz -mx. */
const MX: Record<0 | 1 | 6 | 9, 0 | 1 | 5 | 9> = { 0: 0, 1: 1, 6: 5, 9: 9 };

/** The single-invocation 7zz archive types (tar.* variants are two passes). */
type SevenZipType = 'zip' | '7z' | 'tar' | 'gzip' | 'bzip2' | 'xz';

/** Output extension per target — tgz/tbz2/txz spell out the full suffix;
 *  stream formats APPEND to the source name ("report.pdf" → "report.pdf.gz"). */
export const ARCHIVE_OUTPUT_EXT: Record<ArchiveOutputFormat, string> = {
	zip: '.zip',
	'7z': '.7z',
	tar: '.tar',
	tgz: '.tar.gz',
	tbz2: '.tar.bz2',
	txz: '.tar.xz',
	gz: '.gz',
	bz2: '.bz2',
	xz: '.xz'
};

export const ARCHIVE_OUTPUT_MIME: Record<ArchiveOutputFormat, string> = {
	zip: 'application/zip',
	'7z': 'application/x-7z-compressed',
	tar: 'application/x-tar',
	tgz: 'application/gzip',
	tbz2: 'application/x-bzip2',
	txz: 'application/x-xz',
	gz: 'application/gzip',
	bz2: 'application/x-bzip2',
	xz: 'application/x-xz'
};

/** The 7zz passes a create runs: tar.* = tar first, then compress that tar. */
export function createStages(output: ArchiveOutputFormat): SevenZipType[] {
	switch (output) {
		case 'tgz':
			return ['tar', 'gzip'];
		case 'tbz2':
			return ['tar', 'bzip2'];
		case 'txz':
			return ['tar', 'xz'];
		case 'gz':
			return ['gzip'];
		case 'bz2':
			return ['bzip2'];
		case 'xz':
			return ['xz'];
		default:
			return [output];
	}
}

/** Matches IDLE_TIMEOUT_MS.archive in rpc.ts — the no-progress default. */
export const ARCHIVE_IDLE_FLOOR_MS = 10 * 60_000;
export const ARCHIVE_IDLE_CEIL_MS = 60 * 60_000;
// Worst-case single-threaded wasm LZMA2 at -mx9 measures ~1-2 MB/s — on the
// DEV machine. A low-end phone runs wasm 3-5x slower, which would eat a 2-4x
// margin whole, and the cost asymmetry is stark: a stuck job detected late
// costs patience (Cancel exists the whole time), a healthy 25-minute job
// killed at 20 loses the user's work. Budget at 0.25 MB/s (4-8x dev margin).
// This bounds the SILENT window only, not the job: every -bb1 entry line
// re-arms the watchdog, so the scaled window matters solely for single-stream
// passes (gz/bz2/xz, tar.* stage 2, one huge file) that print a single
// "+ name" line and then compress in silence.
const WORST_CASE_BYTES_PER_MS = (0.25 * 1024 * 1024) / 1000;

/** No-progress watchdog window for archive create/convert calls, scaled to
 *  the input size so a legitimately slow single-stream compression isn't
 *  killed as "stuck". Floor = the kind default; ceiling = deliberate backstop
 *  (anything needing more input already exceeds practical wasm32 limits).
 *  Callers must pass the byte count the SILENT stage actually processes:
 *  create = the input sum (≈ the tar stage 2 compresses), convert = the
 *  compressed source × CONVERT_EXPANSION_FACTOR (the repack runs over
 *  EXTRACTED bytes, unknown up front). */
export function archiveIdleTimeoutMs(totalBytes: number): number {
	return Math.min(
		ARCHIVE_IDLE_CEIL_MS,
		Math.max(ARCHIVE_IDLE_FLOOR_MS, Math.ceil(totalBytes / WORST_CASE_BYTES_PER_MS))
	);
}

/** Convert's silent repack stage compresses the EXTRACTED payload, but only
 *  the compressed source size is known when the watchdog is armed — budget a
 *  pessimistic 10x expansion (source/text archives commonly reach 5-8x; the
 *  one-hour ceiling still bounds the window for outliers). */
export const CONVERT_EXPANSION_FACTOR = 10;

export interface CreateOptions {
	level: 0 | 1 | 6 | 9;
	/** '' = unencrypted. Only zip/7z honor it (the stream formats can't). */
	password: string;
	/** 7z only: also encrypt the file list (-mhe=on). Ignored without a password. */
	encryptNames: boolean;
}

/** One `a` invocation. `inputs` are names relative to the instance's cwd. */
export function buildCreateArgs(
	type: SevenZipType,
	opts: CreateOptions,
	outPath: string,
	inputs: string[]
): string[] {
	// -bb1 prints one "+ name" line per added file — that's what re-arms the
	// caller's no-progress watchdog on big batches.
	const args = ['a', `-t${type}`, '-y', '-bb1', '-bsp0'];
	// tar is an uncompressed container — no -mx knob to pass.
	if (type !== 'tar') args.push(`-mx${MX[opts.level]}`);
	// -mx9's default 64 MB LZMA2 dictionary needs ~700 MB of wasm32 heap; 16 MB
	// keeps peak memory sane at a small ratio cost.
	if (type === '7z') args.push('-md=16m');
	if (opts.password && (type === 'zip' || type === '7z')) {
		args.push(`-p${opts.password}`);
		if (type === 'zip') args.push('-mem=AES256');
		if (type === '7z' && opts.encryptNames) args.push('-mhe=on');
	}
	return [...args, '--', outPath, ...inputs];
}

/** `x` = extract with paths. -bb1 prints one "- name" line per entry and
 *  -bsp0 silences the \b-riddled percent spinner that would garble them. */
export function buildExtractArgs(archivePath: string, password: string, outDir: string): string[] {
	return ['x', '-y', '-bb1', '-bsp0', `-p${password}`, `-o${outDir}`, '--', archivePath];
}

/** `l -slt` = machine-readable listing (entry count, Encrypted flags, Type). */
export function buildListArgs(archivePath: string, password: string): string[] {
	return ['l', '-slt', '-y', `-p${password}`, '--', archivePath];
}

/** Incremental `l -slt` entry counter. The worker keeps only a short tail
 *  ring of 7zz output (error mapping), and `-slt` prints 10-19 lines PER
 *  entry — parsing the tail after the fact only ever saw the "----------"
 *  separator on ~3-entry archives, so counting has to happen per line. One
 *  "Path = …" block per entry after the separator; folder blocks
 *  (Folder = + / Attributes = D…) don't count as files. */
export function createListCounter(): {
	onLine: (line: string) => void;
	/** File-only entry count; null when the separator never appeared (unparsed). */
	count: () => number | null;
} {
	let seenSeparator = false;
	let files = 0;
	let inBlock = false;
	let blockIsFolder = false;
	const closeBlock = () => {
		if (inBlock && !blockIsFolder) files++;
		inBlock = false;
	};
	return {
		onLine(line: string) {
			if (!seenSeparator) {
				if (line.startsWith('----------')) seenSeparator = true;
				return;
			}
			if (line.startsWith('Path = ')) {
				closeBlock();
				inBlock = true;
				blockIsFolder = false;
			} else if (inBlock && (/^Folder = \+/.test(line) || /^Attributes = D/.test(line))) {
				blockIsFolder = true;
			}
		},
		count(): number | null {
			if (!seenSeparator) return null;
			closeBlock();
			return files;
		}
	};
}

/** True when this stdout line is a -bb1 per-entry marker ("- path"). */
export function isEntryLine(line: string): boolean {
	return line.startsWith('- ');
}

const PASSWORD_SIGNALS = [
	'wrong password',
	'cannot open encrypted archive',
	'data error in encrypted file',
	'enter password'
];

/**
 * Maps a finished 7zz invocation to a user-facing error, or null on success.
 * `thrown` = a non-ExitStatus exception escaped callMain (the 7z
 * header-decryption path does this instead of exiting) — the instance is
 * unusable afterwards, which is one reason every job gets a fresh one.
 */
export function mapSevenZipError(
	exit: number | null,
	thrown: boolean,
	tail: string,
	hadPassword: boolean
): string | null {
	if (!thrown && (exit === 0 || exit === 1 || exit === null)) return null;
	const lower = tail.toLowerCase();
	if (PASSWORD_SIGNALS.some((s) => lower.includes(s))) {
		return hadPassword
			? 'Wrong password — check it and try again.'
			: 'This archive is password-protected — enter its password and try again.';
	}
	if (lower.includes('cannot open the file as archive') || lower.includes('is not archive')) {
		return "This doesn't look like a supported archive — the file may be damaged or in an unknown format.";
	}
	if (exit === 8 || lower.includes('not enough memory') || lower.includes('allocat')) {
		return 'Not enough memory to process this archive on this device.';
	}
	if (thrown) {
		// Numeric C++ throws carry no message; in practice they come from
		// encrypted-header handling, so lead with the password hypothesis.
		return hadPassword
			? "Couldn't decrypt this archive — wrong password, or the file is damaged."
			: 'This archive appears to be password-protected or damaged — try entering its password.';
	}
	const errorLine = tail
		.split('\n')
		.reverse()
		.find((l) => l.includes('ERROR:'));
	if (errorLine) return errorLine.replace(/^.*ERROR:\s*/, '').trim() || 'Archive operation failed';
	return 'Archive operation failed';
}

export interface ExtractedEntry {
	path: string;
	size: number;
}

/**
 * Nested-payload chaining: after a pass, decide whether the result is itself
 * the archive the user actually wants opened. Covers .tar.gz/.tbz2/.txz
 * (7zz peels one layer per pass), rpm (payload cpio), .Z/.gz wrappers, and
 * deb (ar members: debian-binary + control.tar.* + data.tar.* — the files
 * live in data.tar.*). Returns the entry path to feed back through 7zz, or
 * null when the entries are the real result. `hops` caps runaway nesting.
 */
export function nextChainStep(
	entries: ExtractedEntry[],
	hops: number
): { keep: string; note: string | null } | null {
	if (hops >= 3 || entries.length === 0) return null;

	// deb: ar unpack yields the debian-binary marker next to data.tar.*
	const names = entries.map((e) => e.path.split('/').pop() ?? e.path);
	if (names.includes('debian-binary')) {
		const data = entries.find((e) => /(^|\/)data\.tar(\.\w+)?$/i.test(e.path));
		if (data)
			return {
				keep: data.path,
				note: 'Unpacked the data.tar payload — Debian control files are skipped.'
			};
	}

	if (entries.length !== 1) return null;
	const single = entries[0].path;
	// Bare container from a decompression pass (x.tar.gz → x.tar, rpm → .cpio,
	// disk.iso.Z → disk.iso) or a still-wrapped one (deb's data.tar.xz).
	if (/\.(tar|cpio|iso)$/i.test(single) || /\.(tar|cpio)\.(gz|bz2|xz|zst|lzma|z)$/i.test(single)) {
		return { keep: single, note: null };
	}
	return null;
}

/**
 * Entry-name hygiene, shared by create (inputs land flat in the instance's cwd,
 * so path separators must go; MEMFS also rejects NUL and pure-dot names) and by
 * extract (the basename becomes an <a download> value). Control and bidi-format
 * characters are stripped: the latter (RTL override / embedding / isolate) are
 * pure filename-spoofing vectors — U+202E makes "photo<RLO>gpj.exe" render as
 * "photoexe.jpg". Uniqueness stays the caller's job.
 */
export function sanitizeEntryName(name: string): string {
	const clean = name
		// eslint-disable-next-line no-control-regex
		.replace(/[\u0000-\u001f]/g, '')
		.replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, '')
		.replace(/[/\\]/g, '_')
		.trim();
	if (!clean || clean === '.' || clean === '..') return 'file';
	return clean;
}
