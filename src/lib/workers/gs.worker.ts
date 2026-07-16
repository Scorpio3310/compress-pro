import loadGs from '@okathira/ghostpdl-wasm';
import gsWasmUrl from '@okathira/ghostpdl-wasm/gs.wasm?url';
import type { GsProgress, WorkerContracts } from './protocol';
import { expose } from './host';

// Compile the 15 MB wasm once per worker; each run instantiates a fresh
// Emscripten module from it (milliseconds), which avoids Ghostscript
// global-state issues across repeated callMain runs during target-size search.
let compiledPromise: Promise<WebAssembly.Module> | null = null;

function getCompiledModule(): Promise<WebAssembly.Module> {
	compiledPromise ??= (async () => {
		try {
			return await WebAssembly.compileStreaming(fetch(gsWasmUrl));
		} catch {
			// Fallback when the server didn't send application/wasm.
			const response = await fetch(gsWasmUrl);
			return WebAssembly.compile(await response.arrayBuffer());
		}
	})().catch((error) => {
		// Never memoize a rejection: a transient fetch failure during the
		// construction-time warm compile would otherwise poison this instance —
		// host.ts turns handler throws into {ok:false} messages (no onerror, no
		// respawn), so every later compress would replay the stale error even
		// after the network recovers. Reset so the next call refetches.
		compiledPromise = null;
		throw error;
	});
	return compiledPromise;
}

// Warm start: begin fetching + compiling the 15 MB wasm the moment this worker
// is constructed, so a warmUp('gs') on PDF file-drop hides it behind the user's
// think time before the Compress click. On success the compress handler reuses
// the memoized module; on failure the memo self-resets (above), so the handler
// simply retries the fetch — swallow the rejection here only to avoid an
// unhandledrejection at init.
getCompiledModule().catch(() => {});

/** Turn Ghostscript's stdout/stderr tail into a message a user can act on. */
function describeGsFailure(code: number, lines: string[]): string {
	const text = lines.join('\n');
	if (/requires a password|Password did not work/i.test(text)) {
		return (
			'This PDF is password-protected or the password is wrong — ' +
			'use the Unlock tool with the correct password'
		);
	}
	const gsError = lines.find((line) => line.startsWith('**** Error:') || line.startsWith('Error:'));
	if (gsError) return `Ghostscript failed: ${gsError.replace(/^\*+\s*/, '')}`;
	return `Ghostscript failed (exit code ${code})`;
}

expose<WorkerContracts['gs']>({
	compress: async ({ pdf, args }, progress) => {
		const module = await getCompiledModule();
		let pageCount: number | null = null;
		// Bounded tail of gs output — only read when a run fails.
		const tail: string[] = [];
		const record = (line: string) => {
			tail.push(line);
			if (tail.length > 50) tail.shift();
		};

		const gs = await loadGs({
			instantiateWasm: (imports, done) => {
				WebAssembly.instantiate(module, imports).then((instance) => done(instance));
				return {};
			},
			print: (line: string) => {
				record(line);
				const total = /^Processing pages \d+ through (\d+)/.exec(line);
				if (total) {
					pageCount = Number(total[1]);
					return;
				}
				const page = /^Page (\d+)/.exec(line);
				if (page) progress({ page: Number(page[1]), pageCount } satisfies GsProgress);
			},
			printErr: record
		});

		gs.FS.writeFile('/in.pdf', new Uint8Array(pdf));

		let code: number;
		try {
			code = gs.callMain(args);
		} catch (error) {
			// Emscripten may surface exit() as a thrown ExitStatus.
			const status = (error as { status?: unknown } | null)?.status;
			if (typeof status === 'number') code = status;
			else throw error;
		}
		// A wrong -sPDFPassword EXITS 0 (measured) while printing the error and
		// writing a useless output — the tail is the only reliable signal.
		const passwordFailed = /Password did not work|Cannot decrypt/i.test(tail.join('\n'));
		if (code !== 0 || passwordFailed) throw new Error(describeGsFailure(code, tail));

		const out = gs.FS.readFile('/out.pdf');
		if (out.length === 0) throw new Error('Ghostscript produced empty output');
		// Binary FS.readFile allocates a fresh exact-size buffer — transfer it
		// directly instead of duplicating a whole PDF; slice only if a future
		// emscripten ever hands back an offset view.
		const result = (
			out.byteOffset === 0 && out.byteLength === out.buffer.byteLength
				? out.buffer
				: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)
		) as ArrayBuffer;
		return { result, transfer: [result] };
	}
});
