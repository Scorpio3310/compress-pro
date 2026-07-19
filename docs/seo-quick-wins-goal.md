# Goal spec: 4 SEO quick-win pages — protect-zip/7z + delete/extract-pages-from-pdf

## Mission
Ship four new tool landing pages whose engines are **already fully implemented and
tested**: `/protect-zip`, `/protect-7z` (password-protected archive creation) and
`/delete-pages-from-pdf`, `/extract-pages-from-pdf` (the existing PDF `pages` op,
split by mode). Tool count 147 → **151**. This is SEO plumbing plus a handful of
landing/preset tests — **no codec, worker, or controls code should change** (the two
tiny preset-plumbing exceptions are called out explicitly below).

All file:line references below were verified on 2026-07-19. Line numbers drift —
re-locate with grep before editing; the *facts* were confirmed in code.

## Before you start
- `git status` must be clean; commit any leftovers first.
- Read the project memory files (Claude memory dir) — especially the SEO registration
  checklist (seo.ts + seo-detail + seo-body + svelte.config entries + generate-og +
  og-images.md + agent-ready count), the EB-15 persisted-preset-leak lesson, and the
  commit style (single-line, no body, no Co-Authored-By).
- Pattern to imitate throughout: the `cbr-to-cbz` / `create-7z` registration and the
  EB/AR/LP test styles. Copy structure, not prose — titles/descriptions/taglines must
  be unique (seo.test.ts pins lengths: title ≤62, description 140–160, tagline 55–58,
  faq 3–4, related 2–4; validate-seo flags near-duplicate titles).

## A) /protect-zip + /protect-7z

### Verified: the encryption engine is 100 % shipped — do NOT rebuild it
- `src/lib/codecs/archive-tools.ts:35-36` — the create op already sends
  `settings.password` + `settings.encryptNames` to the worker. (Convert/extract use
  the password only to decrypt the *source*; converted output is intentionally
  unencrypted — do not "fix" that.)
- `src/lib/components/controls/ArchiveControls.svelte:45-47` — `canEncrypt = op ===
  'create' && (zip || 7z)`; password input with Show/Hide eye-toggle at L122-142;
  `encryptNames` ("hide file names") checkbox, 7z-only, at L146-151.
- `src/lib/codecs/sevenzip-args.ts:114-134` — `-p<password>` gated to zip/7z;
  zip → `-mem=AES256`; 7z + encryptNames → `-mhe=on`.
- Password is never persisted (`settings-merge.ts` serialize strips it); encryptNames
  is persisted (a preference, not a secret).
- Fixtures already exist: `bundle-aes.zip`, `bundle-locked.7z`, `bundle-hidden.7z`
  (generate-fixtures.mjs ~L1544-1568). e2e **AR-09** already proves AES-256 zip
  creation through the UI (`zipEntryEncrypted`, e2e/verify.ts:691-705).

### Tasks
1. `src/lib/seo.ts` TOOLS: two entries, `format: 'zip'`, paths `/protect-zip` and
   `/protect-7z` (no `-to-`, so they land in TOOLS — mirror `create-7z` at
   seo.ts:1093-1099). label/feature/h1 e.g. "Protect ZIP" / "Password-protect a ZIP" /
   "Password-protect ZIP files."
2. `src/lib/seo-detail/archives.ts`: two details (mirror `create-7z` at L97-108) with
   `preset: { kind: 'archive', op: 'create', to: 'zip' }` resp. `to: '7z'`.
   **`accept: ''` is mandatory** — seo.test.ts (~L154-155) pins that archive-create
   presets accept everything. dropSubject `'any files'`, dropHint mentioning the
   password. related 2–4: each other + `/create-7z` + `/zip-files`; consider
   `/protect-pdf` as a cross-family link.
3. `src/lib/seo-body/archives.ts`: two bodies (intro + guide + faq 3–4). Honesty
   requirements: (a) ZIP AES-256 does **not** open in Windows Explorer's built-in
   extractor — needs 7-Zip/WinRAR (FAQ); (b) 7z with "hide file names" encrypts the
   headers too (`-mhe=on`) so even the file list needs the password; (c) the password
   never leaves the device and is never stored; (d) losing the password = losing the
   files (no recovery — it's real AES).
4. `svelte.config.js` prerender entries ×2; `scripts/generate-og.mjs` PAGES ×2 +
   `docs/og-images.md` rows ×2 + run `pnpm og`.
5. e2e (`e2e/specs/archives.spec.ts`, AR-12 landing-matrix style):
   - Landing test per page: title, preset lands on Create with the right output
     format pressed, password field visible.
   - **New coverage: create an encryptNames 7z through the UI** (currently untested):
     upload files on `/protect-7z`, type a password, tick "hide file names", create;
     assert the output 7z has encrypted headers (7zz list without password fails —
     reuse the sevenZipEntries/error pattern from AR-07/AR-08, or assert
     sevenZipEntries with the password succeeds while without it throws).
6. **No changes** to archive-tools.ts, ArchiveControls.svelte, sevenzip-args.ts,
   archive.worker.ts, types.ts, settings-merge.ts, or fixtures.
7. Explicitly skippable: a `focusPassword` preset polish is NOT needed — the password
   field renders automatically because the preset makes `canEncrypt` true.

## B) /delete-pages-from-pdf + /extract-pages-from-pdf

### Verified: the pages op is fully shipped — do NOT rebuild it
- `src/lib/codecs/pdf-tools.ts:81-112` — `extractPages(file, range, 'keep'|'remove')`
  (remove inverts via `complementPages`; empty selection → honest error). Dispatch at
  `compress.ts:641-644`; output name `-pages.pdf`.
- UI: op rail `Tabs.svelte:24-27` (`{id:'pages', label:'Pages'}`);
  `PdfControls.svelte:144-166` — Keep/Remove segmented control + `#page-range` input
  validated by `validatePageRangeSyntax` (src/lib/pdf-range.ts).
- `/split-pdf` (seo-detail/pdf.ts:166-177) already presets `op:'pages'` but has no
  pageMode — its copy covers both directions.
- e2e PT-05 (keep) / PT-06 (remove) prove the engine; LP-02 covers the split-pdf
  landing; matrix has a `split @1-2` cell. Helpers `setPageRange`/`setPageMode` exist.

### Tasks
1. `src/lib/seo.ts` (~L140-153): extend the `pdf-op` ConverterPreset arm with
   `pageMode?: 'keep' | 'remove'`.
2. `src/routes/[[tool=tool]]/+page.svelte` (afterNavigate, ~L671-672): after
   `handlePdfOpChange(preset.op)` add:
   `if (preset.op === 'pages') settings.pdf.pageMode = preset.pageMode ?? 'keep';`
   — EB-15 discipline: normalize ONLY for the pages op, so a persisted 'remove' never
   leaks into `/split-pdf` (which thus always arrives in Keep, matching its "Extract"
   framing), while rotate/watermark/etc. presets keep not touching pageMode.
3. `src/lib/seo.ts` TOOLS: two entries, `format: 'pdf'` (no `-to-`):
   `/extract-pages-from-pdf`, `/delete-pages-from-pdf`.
4. `src/lib/seo-detail/pdf.ts`: two details with
   `preset: { kind: 'pdf-op', op: 'pages', pageMode: 'keep' }` resp. `'remove'`,
   `accept: 'application/pdf,.pdf'`. Titles/descriptions/taglines/h1 must be UNIQUE
   vs `/split-pdf` and each other (seo.test.ts uniqueness + validate-seo
   near-duplicate warnings) — diverge the framing: "keep only the pages you list"
   vs "remove the pages you list". related: each other + `/split-pdf` +
   `/merge-pdf`; add back-links from `split-pdf` within the 2–4 cap.
5. `src/lib/seo-body/pdf.ts`: two bodies (intro + guide + faq 3–4). Cover: range
   syntax `1-3,7,12-`, per-file operation on batches, the honest "selection would
   remove every page" error, output is a new PDF (original untouched).
6. `svelte.config.js` ×2; `generate-og.mjs` + `docs/og-images.md` ×2 + `pnpm og`.
7. e2e (`e2e/specs/landing-pages.spec.ts`, LP-02 style): one test per page asserting
   the preset sets the Pages op AND the correct Keep/Remove segment (aria-pressed)
   with the range input ready. Plus one leak-guard test (EB-15 pattern): visit
   `/delete-pages-from-pdf` then `/split-pdf` → pageMode is back on Keep.
   PT-05/PT-06 stay as the engine proof — do not duplicate full runs.
8. **No changes** to pdf-tools.ts, PdfControls.svelte, pdf-range.ts, or types.ts.

## Shared finish line
- `e2e/specs/agent-ready.spec.ts:118` — `.toHaveLength(147)` → **151**.
- Gates, all green before done:
  1. `pnpm test` (unit) and `pnpm check` (svelte-check 0 errors).
  2. Quick e2e on chromium: archives, pdf-tools, landing-pages specs; plus
     `E2E_PREVIEW=1` agent-ready (tool count + .md twins).
  3. `pnpm build && pnpm check:bundle` — init bundle must be unchanged (these pages
     add zero JS; any budget movement is a bug).
  4. `node scripts/validate-seo.mjs` — 0 errors across (now) 154 pages; only the
     10 pre-existing A→B/B→A near-duplicate title warnings are acceptable.
- Commits: one per feature area (A pages+og / B preset-plumbing+pages+og / e2e), each
  commit builds, single-line message, no Co-Authored-By.
- Update the memory index with a one-line note when done (new page count 151).

## Constraints
- Client-side only; never weaken privacy claims — copy must match what the code does.
- Do not modify `tests/fixtures/real/`.
- No style-only refactors; touch only what the tasks require.

## Explicitly OUT of scope (decided 2026-07-19 — do not drift into these)
- **txt-to-epub** (~16h) and **json-to-csv / csv-to-json** (~15h): both verified
  feasible with full designs (chapter detection + OCF build reusing ebook.ts buildZip;
  DataSettings.to + SheetJS/hand-rolled RFC-4180 split). Parked deliberately — a
  future goal can pick them up; do not partially implement them here.
