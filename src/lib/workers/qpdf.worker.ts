import qpdfWasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import QpdfFactory, { type QpdfInstance } from '@neslinesli93/qpdf-wasm';
import type { WorkerContracts } from './protocol';
import { expose } from './host';
import {
	buildCryptArgs,
	describeQpdfFailure,
	unlockPasswordCandidates,
	QPDF_IN,
	QPDF_OUT
} from '$lib/codecs/qpdf-args';

/**
 * Each operation is one short-lived qpdf CLI run against MEMFS with a FRESH
 * emscripten instance — same isolation rationale as the 7zz worker (C++
 * exception state, heap release). This glue supports neither instantiateWasm
 * nor wasmBinary (closure-pruned), so the compiled-Module memo of the other
 * workers doesn't apply: instead the .wasm BYTES are fetched once and handed
 * to every instance through a blob: URL via locateFile. No network after the
 * first run, and re-compiling ~1.3 MB per run is a few milliseconds.
 */

let wasmUrlPromise: Promise<string> | null = null;

function getWasmBlobUrl(): Promise<string> {
	wasmUrlPromise ??= (async () => {
		try {
			const response = await fetch(qpdfWasmUrl);
			if (!response.ok) throw new Error(`qpdf engine download failed (${response.status})`);
			const blob = new Blob([await response.arrayBuffer()], { type: 'application/wasm' });
			return URL.createObjectURL(blob);
		} catch (error) {
			// A failed fetch must not poison every later job (offline blip).
			wasmUrlPromise = null;
			throw error;
		}
	})();
	return wasmUrlPromise;
}

// Spawn == warm: start the wasm fetch the moment the worker exists, so the
// file-drop warm-up hides the download behind think time (gs.worker pattern —
// the memo self-resets on failure, so a dead warm never poisons real runs).
getWasmBlobUrl().catch(() => {});

/** The shipped d.ts lists only the FS calls its own examples use — extend it. */
type QpdfFs = QpdfInstance['FS'] & {
	writeFile(path: string, data: Uint8Array): void;
};

interface RunResult {
	exit: number;
	/** Everything qpdf printed — the only channel carrying `invalid password`. */
	tail: string;
	fs: QpdfFs;
}

async function runQpdf(args: string[], input: Uint8Array): Promise<RunResult> {
	const url = await getWasmBlobUrl();
	// The glue's pruned print hooks fall back to console.log/console.error and
	// BIND them when the factory runs — patch before the factory, restore after
	// callMain, and qpdf's stderr (e.g. `invalid password`) lands in the ring.
	// This worker is single-instance and runs are sequential, so the window is
	// exclusively ours.
	const ring: string[] = [];
	const capture = (...parts: unknown[]) => {
		ring.push(parts.join(' '));
		if (ring.length > 40) ring.shift();
	};
	const originalLog = console.log;
	const originalError = console.error;
	console.log = capture;
	console.error = capture;
	let exit: number;
	let fs: QpdfFs;
	try {
		const qpdf = await QpdfFactory({ locateFile: () => url });
		fs = qpdf.FS as QpdfFs;
		fs.writeFile(QPDF_IN, input);
		try {
			exit = qpdf.callMain(args);
		} catch (error) {
			// Emscripten may surface exit() as a thrown ExitStatus.
			const status = (error as { status?: unknown } | null)?.status;
			if (typeof status === 'number') exit = status;
			else throw error;
		}
	} finally {
		console.log = originalLog;
		console.error = originalError;
	}
	return { exit, tail: ring.join('\n'), fs };
}

expose<WorkerContracts['qpdf']>({
	crypt: async ({ pdf, op, password }) => {
		const input = new Uint8Array(pdf);
		// unlock retries each normalization of the password (NFC vs NFD — see
		// qpdf-args.ts): Apple encrypts the NFD bytes of what the user typed,
		// everyone else the NFC bytes. Each attempt is its own fresh instance
		// (the wasm bytes are memoized, re-instantiation is ~ms) and only a
		// clean `invalid password` moves on — other failures throw as-is.
		const passwords = op === 'unlock' ? unlockPasswordCandidates(password) : [password];
		let run = await runQpdf(buildCryptArgs(op, passwords[0]), input);
		for (const retry of passwords.slice(1)) {
			if (run.exit === 0 || !/invalid password/i.test(run.tail)) break;
			run = await runQpdf(buildCryptArgs(op, retry), input);
		}
		const { exit, tail, fs } = run;
		if (exit !== 0) throw new Error(describeQpdfFailure(op, exit, tail));
		const out = fs.readFile(QPDF_OUT);
		if (out.length === 0) throw new Error('qpdf produced empty output');
		// FS.readFile allocates a fresh exact-size buffer — transfer it directly.
		const result = (
			out.byteOffset === 0 && out.byteLength === out.buffer.byteLength
				? out.buffer
				: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)
		) as ArrayBuffer;
		return { result, transfer: [result] };
	}
});
