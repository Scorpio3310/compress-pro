/**
 * qpdf CLI argument builders + failure mapping for the qpdf worker.
 *
 * qpdf does STRUCTURAL crypto work: it rewrites the encryption dictionary and
 * re-encrypts streams without re-interpreting page content — unlike the old
 * Ghostscript pdfwrite pass, which re-serialized the whole document and could
 * only write RC4-128/R3. protect writes AES-256 (R6); unlock strips whatever
 * revision the file carries (qpdf reads them all).
 *
 * This wasm build prunes the print/printErr Module hooks, so the worker
 * captures qpdf's stderr by patching console around the run instead (see
 * qpdf.worker.ts). Exit-code probes are NOT an option: measured on this build,
 * `--requires-password` and `--is-encrypted` both exit 2 for every input, so
 * the `invalid password` stderr line is the one reliable classifier. qpdf
 * exits 0 ok / 2 error / 3 warnings (folded to 0 via --warning-exit-0) —
 * honest exit codes either way, unlike gs, which exits 0 on a wrong password.
 *
 * Unicode passwords are a minefield (probed 2026-07-18 against PDFKit): the
 * PDF 2.0 spec hashes the SASLprep'd (≈ NFC) UTF-8 bytes for AES-256/R6, and
 * qpdf/pdf.js/Acrobat comply — but Apple CoreGraphics normalizes the typed
 * password to NFD first, so a spec-correct file whose password contains č/š/ž
 * NEVER opens in Preview, and an Apple-encrypted one never opens elsewhere.
 * protect therefore pins the stored bytes to NFC (spec side of the split; the
 * UI warns about non-ASCII), and unlock retries every distinct normalization
 * so both worlds' files open here.
 */

export const QPDF_IN = '/in.pdf';
export const QPDF_OUT = '/out.pdf';

export function buildCryptArgs(op: 'unlock' | 'protect', password: string): string[] {
	if (op === 'unlock') {
		return ['--warning-exit-0', `--password=${password}`, '--decrypt', QPDF_IN, QPDF_OUT];
	}
	// AES-256 (R6). The same password fills both the user and owner slots —
	// the UI has a single field — and no permissions are restricted (parity
	// with the old gs -dPermissions=-4 behavior). NFC keeps the stored bytes
	// deterministic (and spec-shaped) even for pasted NFD input, e.g. text
	// copied out of a macOS filename.
	const pw = password.normalize('NFC');
	return ['--warning-exit-0', '--encrypt', pw, pw, '256', '--', QPDF_IN, QPDF_OUT];
}

/** Unlock candidates: as typed first, then each normalization that actually
 *  changes the bytes. Covers spec/NFC files (qpdf, pdf.js, Acrobat) and
 *  Apple/NFD ones with a single password prompt; pure-ASCII input collapses
 *  to one entry, so the common case stays single-shot. */
export function unlockPasswordCandidates(password: string): string[] {
	return [...new Set([password, password.normalize('NFC'), password.normalize('NFD')])];
}

/** `invalid password` covers both failure shapes: a wrong unlock password and
 *  a protect run that couldn't open an already-encrypted input — the op picks
 *  the actionable message. */
export function describeQpdfFailure(op: 'unlock' | 'protect', exit: number, tail: string): string {
	if (/invalid password/i.test(tail)) {
		return op === 'unlock'
			? 'This PDF is password-protected or the password is wrong — ' +
					'use the Unlock tool with the correct password'
			: 'This PDF is already password-protected — unlock it with its current password first';
	}
	return `qpdf failed (exit code ${exit})`;
}
