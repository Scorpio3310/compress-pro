/**
 * The archive fast paths in compress.ts: encrypted zips must never ship
 * fflate's raw ciphertext, dotfiles/0-byte entries are real files, legacy
 * cp437 names decode correctly, and oversized batches leave the main-thread
 * fflate path for the streaming 7z worker. Worker RPC runs against the same
 * stubbed Worker as compress.test.ts.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FFLATE_FAST_PATH_MAX_BYTES, runArchiveTool } from './compress';
import { abortAll } from './workers/rpc';
import { buildZip } from './testing/build-zip';
import type { ProgressInfo, UploadedFile, ZipSettings } from './types';

class StubWorker {
	static instances: StubWorker[] = [];
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onerror: ((event: { message?: string }) => void) | null = null;
	onmessageerror: (() => void) | null = null;
	posted: { id: number }[] = [];
	terminated = false;
	constructor() {
		StubWorker.instances.push(this);
	}
	postMessage(message: { id: number }) {
		this.posted.push(message);
	}
	terminate() {
		this.terminated = true;
	}
}

const enc = new TextEncoder();

const objectUrls = URL as unknown as {
	createObjectURL?: (blob: Blob) => string;
	revokeObjectURL?: (url: string) => void;
};

beforeEach(() => {
	StubWorker.instances = [];
	vi.stubGlobal('Worker', StubWorker);
	objectUrls.createObjectURL = () => 'blob:test';
});

afterEach(() => {
	abortAll();
	vi.unstubAllGlobals();
	delete objectUrls.createObjectURL;
});

function zipUpload(name: string, bytes: Uint8Array, declaredSize?: number): UploadedFile {
	const file = new File([bytes as BlobPart], name, { type: 'application/zip' });
	return { id: name, file, name, size: declaredSize ?? file.size, objectUrl: 'blob:test' };
}

const EXTRACT: ZipSettings = {
	op: 'extract',
	outputFormat: 'zip',
	level: 6,
	password: '',
	encryptNames: false
};

const CREATE: ZipSettings = {
	op: 'create',
	outputFormat: 'zip',
	level: 0,
	password: '',
	encryptNames: false
};

/** If the run consults the worker, answer it so the test can settle. */
function answerWorker(error: string) {
	return (async () => {
		await vi.waitFor(() => {
			if (!StubWorker.instances.some((w) => w.posted.length > 0)) throw new Error('no post');
		});
		const stub = StubWorker.instances.find((w) => w.posted.length > 0)!;
		stub.onmessage?.({ data: { id: stub.posted[0].id, ok: false, error } });
	})().catch(() => {});
}

it('routes an encrypted stored zip to the worker — never ships raw ciphertext rows', async () => {
	const zip = buildZip([
		{
			nameBytes: enc.encode('secret.jpg'),
			data: enc.encode('~~zipcrypto ciphertext~~'),
			flags: 0x1
		}
	]);
	const run = runArchiveTool([zipUpload('locked.zip', zip)], EXTRACT, () => {});
	await vi.waitFor(() => expect(StubWorker.instances[0]?.posted.length ?? 0).toBeGreaterThan(0));
	const stub = StubWorker.instances[0];
	stub.onmessage?.({
		data: {
			id: stub.posted[0].id,
			ok: false,
			error: 'This archive is password-protected — enter the password and try again'
		}
	});
	const out = await run;
	expect(out.results).toEqual([]);
	expect(out.failures[0].error).toMatch(/password/i);
});

it('extracts dotfiles and 0-byte entries as rows; macOS sidecar noise stays out', async () => {
	const zip = buildZip(
		Object.entries({
			'.env': 'SECRET=1\n',
			'web/.htaccess': 'Deny from all\n',
			'empty.txt': '',
			'index.html': '<!doctype html>\n',
			'__MACOSX/._index.html': 'AppleDouble resource fork',
			'.DS_Store': 'finder junk'
		}).map(([name, content]) => ({
			nameBytes: enc.encode(name),
			data: enc.encode(content),
			flags: 0x800
		}))
	);
	const out = await runArchiveTool([zipUpload('site.zip', zip)], EXTRACT, () => {});
	expect(out.failures).toEqual([]);
	expect(out.results.map((r) => r.name).sort()).toEqual([
		'.env',
		'.htaccess',
		'empty.txt',
		'index.html'
	]);
	expect(StubWorker.instances).toHaveLength(0); // fast path handled it, no wasm download
});

it('an all-noise zip fails honestly on the fast path instead of consulting the worker', async () => {
	const zip = buildZip([
		{ nameBytes: enc.encode('__MACOSX/._photo.jpg'), data: enc.encode('x'), flags: 0x800 },
		{ nameBytes: enc.encode('.DS_Store'), data: enc.encode('x'), flags: 0x800 }
	]);
	const run = runArchiveTool([zipUpload('noise.zip', zip)], EXTRACT, () => {});
	const responder = answerWorker('worker consulted');
	const out = await run;
	expect(out.failures[0].error).toBe('The archive contains no extractable files');
	expect(StubWorker.instances).toHaveLength(0);
	// Let the fallback responder time out before the next test starts posting.
	await responder;
});

it('decodes legacy cp437 names on the fast path', async () => {
	// 'Résumé.pdf' in cp437 (é = 0x82), UTF-8 flag cleared — an older Windows zip.
	const nameBytes = Uint8Array.from([0x52, 0x82, 0x73, 0x75, 0x6d, 0x82, 0x2e, 0x70, 0x64, 0x66]);
	const zip = buildZip([{ nameBytes, data: enc.encode('fake pdf'), flags: 0 }]);
	const out = await runArchiveTool([zipUpload('legacy.zip', zip)], EXTRACT, () => {});
	expect(out.failures).toEqual([]);
	expect(out.results.map((r) => r.name)).toEqual(['Résumé.pdf']);
});

it('skips the extract fast path for oversized zips (main-thread RAM gate)', async () => {
	const zip = buildZip([{ nameBytes: enc.encode('big.bin'), data: enc.encode('x'), flags: 0x800 }]);
	const run = runArchiveTool(
		[zipUpload('big.zip', zip, FFLATE_FAST_PATH_MAX_BYTES + 1)],
		EXTRACT,
		() => {}
	);
	await vi.waitFor(() => expect(StubWorker.instances[0]?.posted.length ?? 0).toBeGreaterThan(0));
	const stub = StubWorker.instances[0];
	stub.onmessage?.({ data: { id: stub.posted[0].id, ok: false, error: 'stop' } });
	const out = await run;
	expect(out.failures[0].error).toBe('stop');
});

it('routes an oversized create batch to the streaming worker path', async () => {
	const files: UploadedFile[] = [
		zipUpload('a.mov', enc.encode('tiny stand-in'), FFLATE_FAST_PATH_MAX_BYTES / 2 + 1),
		zipUpload('b.mov', enc.encode('tiny stand-in'), FFLATE_FAST_PATH_MAX_BYTES / 2 + 1)
	];
	const run = runArchiveTool(files, CREATE, () => {});
	await vi.waitFor(() => expect(StubWorker.instances[0]?.posted.length ?? 0).toBeGreaterThan(0));
	const stub = StubWorker.instances[0];
	stub.onmessage?.({
		data: {
			id: stub.posted[0].id,
			ok: true,
			result: { bytes: enc.encode('PK fake'), mimeType: 'application/zip', name: 'archive.zip' }
		}
	});
	const out = await run;
	expect(out.combined?.name).toBe('archive.zip');
});

it('fflate create reports one progress row per input with a final done sweep', async () => {
	const files: UploadedFile[] = [
		zipUpload('a.txt', enc.encode('aaa')),
		zipUpload('b.txt', enc.encode('bbb'))
	];
	const events: ProgressInfo[] = [];
	const out = await runArchiveTool(files, CREATE, (p) => events.push(p));
	expect(out.combined?.name).toBe('archive.zip');
	expect(StubWorker.instances).toHaveLength(0);
	expect(events.every((p) => p.fileCount === 2)).toBe(true);
	expect(events.filter((p) => p.stage === 'done').map((p) => p.fileIndex)).toEqual([0, 1]);
});
