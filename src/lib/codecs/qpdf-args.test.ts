import { describe, expect, it } from 'vitest';
import { buildCryptArgs, describeQpdfFailure, unlockPasswordCandidates } from './qpdf-args';

describe('buildCryptArgs', () => {
	it('protect writes AES-256 with user == owner password and no restrictions', () => {
		expect(buildCryptArgs('protect', 'pw')).toEqual([
			'--warning-exit-0',
			'--encrypt',
			'pw',
			'pw',
			'256',
			'--',
			'/in.pdf',
			'/out.pdf'
		]);
	});

	it('unlock decrypts with the given password', () => {
		expect(buildCryptArgs('unlock', 'pw')).toEqual([
			'--warning-exit-0',
			'--password=pw',
			'--decrypt',
			'/in.pdf',
			'/out.pdf'
		]);
	});

	it('passwords with spaces ride as single argv entries, never re-split', () => {
		expect(buildCryptArgs('protect', 'correct horse battery')).toContain('correct horse battery');
		expect(buildCryptArgs('unlock', 'two words')).toContain('--password=two words');
	});

	it('protect pins pasted-NFD passwords to their NFC bytes', () => {
		const nfd = 'ččč'.normalize('NFD');
		const nfc = 'ččč'.normalize('NFC');
		const args = buildCryptArgs('protect', nfd);
		expect(args).toContain(nfc);
		expect(args).not.toContain(nfd);
	});

	it('unlock passes the password exactly as typed (candidates handle the rest)', () => {
		const nfd = 'ččč'.normalize('NFD');
		expect(buildCryptArgs('unlock', nfd)).toContain(`--password=${nfd}`);
	});
});

describe('unlockPasswordCandidates', () => {
	it('collapses pure-ASCII input to a single attempt', () => {
		expect(unlockPasswordCandidates('correct horse')).toEqual(['correct horse']);
	});

	it('NFC input adds the NFD form Apple readers would have stored', () => {
		const nfc = 'ččč'.normalize('NFC');
		expect(unlockPasswordCandidates(nfc)).toEqual([nfc, nfc.normalize('NFD')]);
	});

	it('NFD input adds the NFC form spec-side writers store, as-typed first', () => {
		const nfd = 'ččč'.normalize('NFD');
		expect(unlockPasswordCandidates(nfd)).toEqual([nfd, nfd.normalize('NFC')]);
	});

	it('non-ASCII input that both normalizations leave alone stays one attempt', () => {
		// U+00E7 ç is its own NFC form; NFD decomposes it — so 2, not 3, entries.
		expect(unlockPasswordCandidates('geslo')).toHaveLength(1);
		expect(unlockPasswordCandidates('çç')).toHaveLength(2);
	});
});

describe('describeQpdfFailure', () => {
	it('maps the stderr password line to op-specific actionable messages', () => {
		const tail = 'qpdf: /in.pdf: invalid password';
		expect(describeQpdfFailure('unlock', 2, tail)).toMatch(/password is wrong/i);
		expect(describeQpdfFailure('protect', 2, tail)).toMatch(/already password-protected/i);
	});

	it('falls back to the exit code when stderr says something else', () => {
		expect(describeQpdfFailure('unlock', 2, 'qpdf: /in.pdf: not a PDF file')).toBe(
			'qpdf failed (exit code 2)'
		);
	});
});
