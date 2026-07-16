import sevenZipWasmUrl from '7z-wasm/7zz.wasm?url';
import SevenZipFactory, { type SevenZipModule } from '7z-wasm';
import type { WorkerContracts, ArchiveEntryOut, ArchiveProgress } from './protocol';
import { expose } from './host';
import {
	ARCHIVE_OUTPUT_EXT,
	ARCHIVE_OUTPUT_MIME,
	buildCreateArgs,
	buildExtractArgs,
	buildListArgs,
	createListCounter,
	createStages,
	isEntryLine,
	mapSevenZipError,
	nextChainStep,
	sanitizeEntryName
} from '$lib/codecs/sevenzip-args';

/**
 * Every operation is one or more short-lived 7zz CLI runs against MEMFS —
 * a FRESH emscripten instance per run. That isolation is load-bearing: 7zz's
 * encrypted-header paths throw C++ exceptions straight through callMain,
 * which leaves the C++ runtime in an undefined state, and a fresh instance
 * also releases the wasm heap between jobs (archives can be huge). The wasm
 * is fetched and COMPILED once (cached WebAssembly.Module — same pattern as
 * font.worker's hb cache); each run only instantiates from it, so isolation
 * no longer costs a 1.65 MB recompile per run (2-6 runs per user operation).
 */

let wasmModulePromise: Promise<WebAssembly.Module> | null = null;

function getWasmModule(): Promise<WebAssembly.Module> {
	wasmModulePromise ??= (async () => {
		try {
			try {
				return await WebAssembly.compileStreaming(fetch(sevenZipWasmUrl));
			} catch {
				// Fallback when the server didn't send application/wasm.
				const response = await fetch(sevenZipWasmUrl);
				if (!response.ok) throw new Error(`7z engine download failed (${response.status})`);
				return await WebAssembly.compile(await response.arrayBuffer());
			}
		} catch (error) {
			// A failed fetch must not poison every later job (offline blip).
			wasmModulePromise = null;
			throw error;
		}
	})();
	return wasmModulePromise;
}

/** The shipped d.ts predates the emscripten hook — extend it locally. */
type SevenZipFactoryOptions = Parameters<typeof SevenZipFactory>[0] & {
	instantiateWasm?: (
		imports: WebAssembly.Imports,
		done: (instance: WebAssembly.Instance) => void
	) => Record<string, never>;
};

interface RunResult {
	exit: number | null;
	thrown: boolean;
	/** Last stdout+stderr lines, newline-joined — input to mapSevenZipError. */
	tail: string;
	/** Live module for reading outputs; dropped (GC'd) when the run ends. */
	fs: SevenZipModule['FS'];
}

/** Input keys may be nested paths ("dir/file.txt") — parents are created.
 *  OWNERSHIP: `inputs` is consumed destructively — each entry is deleted as
 *  soon as MEMFS holds the copy, so callers must pass a fresh record per run.
 *  `mounts` exposes Blobs/Files read-only at /src/<name> via WORKERFS (lazy
 *  FileReaderSync chunk reads — the sources never enter the JS heap whole). */
async function runSevenZip(
	args: string[],
	inputs: Record<string, Uint8Array>,
	onLine?: (line: string) => void,
	mounts?: { name: string; data: Blob }[]
): Promise<RunResult> {
	const ring: string[] = [];
	const push = (line: string) => {
		ring.push(line);
		if (ring.length > 60) ring.shift();
		onLine?.(line);
	};
	const wasmModule = await getWasmModule();
	// Emscripten's instantiateWasm has no error path through `done` — with the
	// module pre-awaited the only failure left is an instantiate OOM, which
	// would leave SevenZipFactory pending until the 10-min watchdog. Race the
	// load against the rejection so the call fails fast, and drop the module
	// memo in case the compiled module itself is the problem.
	let failInstantiate!: (error: unknown) => void;
	const instantiateFailed = new Promise<never>((_, reject) => (failInstantiate = reject));
	const options: SevenZipFactoryOptions = {
		// Instantiate from the pre-compiled module — the hook wins over
		// wasmBinary in the glue and skips its per-call WebAssembly.instantiate
		// (bytes) compile.
		instantiateWasm: (imports, done) => {
			WebAssembly.instantiate(wasmModule, imports).then(
				(instance) => done(instance),
				(error) => {
					wasmModulePromise = null;
					failInstantiate(error);
				}
			);
			return {};
		},
		print: push,
		printErr: push,
		// EOF forever — with -y and an explicit -p, 7zz must never wait on a
		// prompt; the d.ts wants `number` but emscripten treats null as EOF.
		stdin: (() => null) as unknown as () => number
	};
	const sz = await Promise.race([SevenZipFactory(options), instantiateFailed]);
	sz.FS.mkdir('/in');
	sz.FS.mkdir('/out');
	if (mounts?.length) {
		sz.FS.mkdir('/src');
		sz.FS.mount(sz.WORKERFS, { blobs: mounts }, '/src');
	}
	for (const path of Object.keys(inputs)) {
		const dir = path.split('/').slice(0, -1).join('/');
		if (dir) mkdirp(sz.FS, `/in/${dir}`);
		sz.FS.writeFile(`/in/${path}`, inputs[path]);
		// MEMFS now holds the only copy — drop the caller's reference eagerly
		// (this is what frees the original inputs during a tar.* second stage).
		delete inputs[path];
	}
	sz.FS.chdir('/in');

	let exit: number | null = null;
	let thrown = false;
	try {
		// The shipped .d.ts says void, but emscripten's callMain returns main()'s
		// exit code — and onExit never fires in this build.
		const returned = sz.callMain(args) as unknown;
		if (typeof returned === 'number') exit = returned;
	} catch (error) {
		if (error && (error as { name?: string }).name === 'ExitStatus') {
			exit = (error as { status: number }).status;
		} else if (error && (error as { name?: string }).name === 'NotReadableError') {
			// A WORKERFS lazy read failed: the source file changed or vanished
			// on disk after it was picked. Without this branch the generic
			// `thrown` path would misreport it as password-protected/damaged.
			throw new Error('The file changed on disk after it was added — re-add it and try again.', {
				cause: error
			});
		} else {
			// Numeric C++ exception (encrypted-header paths) — instance is dead.
			thrown = true;
		}
	}
	return { exit, thrown, tail: ring.join('\n'), fs: sz.FS };
}

interface OutEntry {
	path: string;
	size: number;
	bytes: Uint8Array;
}

/** Collects every file under /out, paths relative to it. FS.readFile copies
 *  out of the wasm heap, and each MEMFS node is freed the moment it is copied
 *  (unlink/rmdir) — so the extracted output exists once in memory, not twice.
 *  Symbolic links (7zz recreates tar/deb link entries as real MEMFS symlinks)
 *  are counted and skipped: lstat-first is load-bearing, because following a
 *  link would re-read — or ENOENT-crash on — a target this walk already
 *  freed, and a link can't be represented in a flat per-file download anyway. */
function walkOut(fs: SevenZipModule['FS'], dir: string, skipped: { links: number }): OutEntry[] {
	const entries: OutEntry[] = [];
	for (const name of fs.readdir(dir)) {
		if (name === '.' || name === '..') continue;
		const full = `${dir}/${name}`;
		const mode = fs.lstat(full).mode;
		if (fs.isLink(mode)) {
			skipped.links++;
			try {
				fs.unlink(full);
			} catch {
				// Best-effort — freeing is an optimization, never a failure.
			}
		} else if (fs.isDir(mode)) {
			entries.push(...walkOut(fs, full, skipped));
			try {
				fs.rmdir(full);
			} catch {
				// Best-effort — freeing is an optimization, never a failure.
			}
		} else {
			const bytes = fs.readFile(full);
			fs.unlink(full);
			entries.push({ path: full.slice('/out/'.length), size: bytes.length, bytes });
		}
	}
	return entries;
}

/** Extraction-note suffix so skipped links are visible, not silent. */
function withLinkNote(note: string | null, links: number): string | null {
	if (links === 0) return note;
	const suffix = `${links} symbolic link${links === 1 ? '' : 's'} skipped`;
	return note ? `${note} · ${suffix}` : suffix;
}

/** /in-side names must be flat and unique; collisions get " (n)" suffixes. */
function uniqueInputNames(names: string[]): string[] {
	const used = new Set<string>();
	return names.map((raw) => {
		const name = sanitizeEntryName(raw);
		if (!used.has(name)) {
			used.add(name);
			return name;
		}
		const dot = name.lastIndexOf('.');
		const stem = dot > 0 ? name.slice(0, dot) : name;
		const ext = dot > 0 ? name.slice(dot) : '';
		for (let n = 1; ; n++) {
			const candidate = `${stem} (${n})${ext}`;
			if (!used.has(candidate)) {
				used.add(candidate);
				return candidate;
			}
		}
	});
}

/** "photos.tar.gz" → "photos", "backup.rar" → "backup" (unknown exts kept). */
function stripArchiveExt(name: string): string {
	const compound = /\.tar\.(gz|bz2|xz|zst|lzma|z)$/i.exec(name);
	if (compound) return name.slice(0, -compound[0].length);
	const single =
		/\.(zip|7z|rar|tar|gz|tgz|bz2|tbz2|txz|xz|iso|cab|deb|rpm|cpio|lha|lzh|arj|z|lzma|zst)$/i.exec(
			name
		);
	if (single) return name.slice(0, -single[0].length);
	return name;
}

/** mkdir -p for MEMFS (FS.mkdirTree exists but isn't in the typings). */
function mkdirp(fs: SevenZipModule['FS'], path: string): void {
	let current = '';
	for (const part of path.split('/').filter(Boolean)) {
		current += `/${part}`;
		try {
			fs.mkdir(current);
		} catch {
			// exists
		}
	}
}

function throwIfFailed(run: RunResult, hadPassword: boolean): void {
	const error = mapSevenZipError(run.exit, run.thrown, run.tail, hadPassword);
	if (error) throw new Error(error);
}

/**
 * Extraction with nested-payload chaining (tar.gz → tar → files, rpm → cpio,
 * deb → data.tar.*). Each hop is its own 7zz run; `scale` maps the pass
 * fractions into the caller's progress window.
 */
async function extractAll(
	source: File | Uint8Array,
	name: string,
	password: string,
	progress: (p: ArchiveProgress) => void,
	scale: (fraction: number) => number
): Promise<{ entries: OutEntry[]; note: string | null }> {
	let current: { name: string; source: File | Uint8Array } = {
		name: sanitizeEntryName(name),
		source
	};
	let note: string | null = null;
	const skipped = { links: 0 };

	for (let hop = 0; ; hop++) {
		// The user's File is read through a zero-copy WORKERFS mount; inner
		// chain payloads (walkOut copies) are plain bytes and go through /in.
		// Fresh inputs record per run — runSevenZip consumes it destructively,
		// while `current.source` keeps the bytes alive across list + extract.
		const viaMount = current.source instanceof Blob;
		const archivePath = viaMount ? `/src/${current.name}` : `/in/${current.name}`;
		const mounts = viaMount ? [{ name: current.name, data: current.source as Blob }] : undefined;
		const inputsFor = () => (viaMount ? {} : { [current.name]: current.source as Uint8Array });

		// Listing is best-effort: it feeds the entry-count fraction and nothing
		// else, so a failure here (encrypted headers throw!) just means
		// indeterminate progress until the extract itself reports the error.
		// Counted per line — the run's `tail` ring is far too short for -slt.
		let entryCount: number | null = null;
		try {
			const counter = createListCounter();
			const list = await runSevenZip(
				buildListArgs(archivePath, password),
				inputsFor(),
				counter.onLine,
				mounts
			);
			if (!list.thrown) entryCount = counter.count();
		} catch {
			entryCount = null;
		}

		let done = 0;
		const run = await runSevenZip(
			buildExtractArgs(archivePath, password, '/out'),
			inputsFor(),
			(line) => {
				if (!isEntryLine(line)) return;
				done++;
				progress({
					fraction: entryCount ? scale(Math.min(done / entryCount, 1)) : null,
					detail: line.slice(2)
				});
			},
			mounts
		);
		throwIfFailed(run, password !== '');

		const entries = walkOut(run.fs, '/out', skipped);
		if (entries.length === 0) {
			throw new Error(
				skipped.links > 0
					? 'The archive contains only symbolic links — there are no regular files to extract'
					: 'The archive contains no extractable files'
			);
		}

		const chain = nextChainStep(
			entries.map((e) => ({ path: e.path, size: e.size })),
			hop
		);
		const inner = chain && entries.find((e) => e.path === chain.keep);
		if (!chain || !inner) return { entries, note: withLinkNote(note, skipped.links) };
		note = chain.note ?? note;
		progress({ fraction: null, detail: `unpacking ${inner.path.split('/').pop()}` });
		current = {
			name: sanitizeEntryName(inner.path.split('/').pop() ?? inner.path),
			source: inner.bytes
		};
	}
}

/** Stage-1 source of a create/repack run. `mounts` = the user's own Files,
 *  read zero-copy through WORKERFS (flat, pre-uniqued names). `files` = plain
 *  bytes via MEMFS /in with relative paths preserved (convert's repack of
 *  extracted entries — folder structure survives).
 *  OWNERSHIP (bytes mode): `files` is consumed destructively at entry — the
 *  caller must not retain another reference to the array or its buffers. */
type CreateSource =
	{ mounts: { name: string; data: Blob }[] } | { files: { path: string; bytes: Uint8Array }[] };

/** Bundle the source into `output`, two passes for tar.* targets. */
async function createArchive(
	source: CreateSource,
	output: WorkerContracts['archive']['create']['payload']['output'],
	opts: { level: 0 | 1 | 6 | 9; password: string; encryptNames: boolean },
	baseName: string,
	progress: (p: ArchiveProgress) => void,
	scale: (fraction: number) => number
): Promise<{ bytes: Uint8Array; name: string; mimeType: string }> {
	const stages = createStages(output);
	const finalName = `${baseName}${ARCHIVE_OUTPUT_EXT[output]}`;
	const tarName = `${baseName}.tar`;

	const stage1Inputs: Record<string, Uint8Array> = {};
	let stage1Mounts: { name: string; data: Blob }[] | undefined;
	let stage1Operands: string[];
	let total: number;
	if ('mounts' in source) {
		// Operands are absolute (/src is the read-only mount; cwd stays /in so
		// any 7zz scratch writes land on writable MEMFS). 7zz stores file
		// operands by basename, so entry names match the mount names.
		stage1Mounts = source.mounts;
		stage1Operands = source.mounts.map((m) => `/src/${m.name}`);
		total = source.mounts.length;
	} else {
		// 7zz recurses into the top-level directories it is handed.
		const topLevel = new Set<string>();
		for (const file of source.files) {
			// Defense-in-depth: '.'/'..' segments can't escape /in in MEMFS, and
			// walkOut (the only source here) never emits them — but drop them
			// anyway so a crafted entry path can't resolve outside the re-feed dir.
			const parts = file.path.split('/').filter((p) => p && p !== '.' && p !== '..');
			if (parts.length === 0) continue;
			topLevel.add(parts[0]);
			stage1Inputs[parts.join('/')] = file.bytes;
		}
		// From here `stage1Inputs` is the single owner of the byte buffers, and
		// runSevenZip drops each entry once MEMFS has it — so stage 2 of a tar.*
		// create no longer pins the original inputs alongside the tar.
		total = source.files.length;
		source.files.length = 0;
		stage1Operands = [...topLevel];
	}

	let added = 0;
	const runStage = async (
		type: ReturnType<typeof createStages>[number],
		stageInputs: Record<string, Uint8Array>,
		names: string[],
		outPath: string,
		mounts?: { name: string; data: Blob }[]
	) => {
		const run = await runSevenZip(
			buildCreateArgs(type, opts, outPath, names),
			stageInputs,
			(line) => {
				if (!line.startsWith('+ ')) return;
				added++;
				progress({
					fraction: scale(Math.min((added / total) * 0.9, 0.9)),
					detail: line.slice(2)
				});
			},
			mounts
		);
		throwIfFailed(run, opts.password !== '');
		return run.fs.readFile(outPath);
	};

	if (stages.length === 1) {
		const bytes = await runStage(
			stages[0],
			stage1Inputs,
			stage1Operands,
			`/out/${finalName}`,
			stage1Mounts
		);
		return { bytes, name: finalName, mimeType: ARCHIVE_OUTPUT_MIME[output] };
	}

	// tar.* targets: tar the inputs first, then compress that tar (stage 2's
	// input is the intermediate tar — plain bytes via /in, never a mount).
	const tarBytes = await runStage(
		'tar',
		stage1Inputs,
		stage1Operands,
		`/out/${tarName}`,
		stage1Mounts
	);
	progress({ fraction: scale(0.95), detail: `compressing ${tarName}` });
	const bytes = await runStage(stages[1], { [tarName]: tarBytes }, [tarName], `/out/${finalName}`);
	return { bytes, name: finalName, mimeType: ARCHIVE_OUTPUT_MIME[output] };
}

expose<WorkerContracts['archive']>({
	async create(payload, progress) {
		// The user's Files are read zero-copy through a WORKERFS mount; names
		// must be flat and unique on the mount (collisions get " (n)" suffixes).
		const names = uniqueInputNames(payload.files.map((f) => f.name));
		const mounts = payload.files.map((f, i) => ({ name: names[i], data: f.data }));
		const result = await createArchive(
			{ mounts },
			payload.output,
			{ level: payload.level, password: payload.password, encryptNames: payload.encryptNames },
			payload.baseName,
			progress,
			(f) => f
		);
		const bytes = result.bytes.buffer as ArrayBuffer;
		return {
			result: { bytes, name: result.name, mimeType: result.mimeType },
			transfer: [bytes]
		};
	},

	async extract(payload, progress) {
		const { entries, note } = await extractAll(
			payload.file,
			payload.name,
			payload.password,
			progress,
			(f) => 0.05 + f * 0.9
		);
		const out: ArchiveEntryOut[] = entries.map((e) => ({
			path: e.path,
			bytes: e.bytes.buffer as ArrayBuffer
		}));
		return { result: { entries: out, note }, transfer: out.map((e) => e.bytes) };
	},

	async convert(payload, progress) {
		const { entries } = await extractAll(
			payload.file,
			payload.name,
			payload.password,
			progress,
			(f) => f * 0.5
		);
		progress({ fraction: 0.55, detail: 'repacking' });
		// Snapshot the count, then make `mapped` the single owner of the
		// extracted buffers — createArchive consumes it destructively, so the
		// repack stage doesn't hold the extraction twice. payload.file stays
		// referenced on purpose: it is a disk-backed handle, dropping it frees
		// nothing.
		const entryCount = entries.length;
		const mapped = entries.map((e) => ({ path: e.path, bytes: e.bytes }));
		entries.length = 0;
		const result = await createArchive(
			{ files: mapped },
			payload.output,
			// The repacked archive is intentionally unencrypted — the password
			// belongs to the SOURCE; encrypt-on-convert would silently produce
			// files the user can't open elsewhere without realizing why.
			{ level: payload.level, password: '', encryptNames: false },
			stripArchiveExt(sanitizeEntryName(payload.name)) || 'archive',
			progress,
			(f) => 0.55 + f * 0.45
		);
		const bytes = result.bytes.buffer as ArrayBuffer;
		return {
			result: { bytes, name: result.name, mimeType: result.mimeType, entryCount },
			transfer: [bytes]
		};
	}
});
