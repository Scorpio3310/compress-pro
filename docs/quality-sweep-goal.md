# Goal spec: Full-app quality sweep — correctness, edge cases, performance, UX, SEO

## Mission

Systematically audit and harden the entire compress.pro app: all ~139 tools, the shared
infrastructure, the UI/UX layer, and the SEO/agent-facing surface. Find correctness bugs,
unhandled edge cases, performance problems, UX rough spots, and SEO irregularities — and
**fix every confirmed finding**, each covered by a regression test or automated check.

## Before you start

- Check `git status`. If the working tree contains uncommitted work from a previous
  batch, commit it first (logically grouped commits) so the sweep starts clean and
  every fix is attributable.
- Read the project memory files in the Claude memory directory — they document known
  pitfalls (keep-original guard, SW precache limits, gs memo reset, qpdf quirks,
  NFC/NFD passwords, 7z error codes, /@fs + warmup tricks for large-file runs, etc.).
  Do not re-break things they warn about.

## Scope

1. **Every tool family**: images (incl. RAW, JXL, PSD, AVIF, vectorize), PDF (compress,
   qpdf protect/unlock, PDF/A, grayscale, OCR), video/audio (incl. MJPEG, FLAC/OPUS/AAC),
   archives (all 14 formats), ebooks (EPUB/CBZ/CBR), fonts, subtitles, 3D models.
2. **Shared infrastructure**: `src/lib/compress.ts`, worker RPC (`src/lib/workers/`),
   service worker precache/offline behavior, settings store + merge, routing, batch
   pipeline, file type detection (`file-visual.ts`, magic-byte sniffing).
3. **UI/UX**: drag & drop, batch flows, error messages (are they actionable and honest?),
   progress + cancel behavior, keyboard navigation/a11y, small screens, dark mode.
4. **SEO & agent surface**: all prerendered pages, metadata, structured data, sitemap,
   OG images, .md twins, llms-full.txt, Content-Signal/Link headers, internal linking.
5. **Real-file validation**: every file under `tests/fixtures/real/` (enumerate the
   directory **recursively at run time** — files are still being added; never hardcode
   the list, counts, or sizes) run through every applicable tool, with real + visual
   output checks.

## Real-file validation track

Enumerate `tests/fixtures/real/` **recursively at run time** and build the file × tool
matrix from what is actually there. Notes on the current contents (non-exhaustive —
re-scan, don't trust this list):

- Subdirectories contain extracted 3D-model sets (OBJ/FBX/3DS/MTL/BLEND + texture
  images) — include those files in the matrix individually; textures are also valid
  image-tool inputs.
- Files in formats **no tool accepts** (e.g. `.blend`, `.3ds`, `.mtl`, `.pcd` if
  unsupported) are negative-test material: dropping them into the app must produce a
  clear, honest "unsupported format" message — never a hang, crash, or silent no-op.
  Test that explicitly.
- Archives containing 3D models double as archive-tool inputs AND as a source of model
  files; `test-geslo-ččč.pdf` exercises the NFC/NFD password case.

For every (file, applicable tool) pair, run compression at each quality level the tool
offers plus every advertised conversion, through the actual app in Playwright (follow
the pattern of `e2e/specs/real-pdf-reaa.spec.ts`). Then validate the output **for real,
not just "no exception"**:

- **Decode it back**: every output must successfully decode/parse in its target format.
- **Visual check — actually look at it**: rasterize before/after (images, PDF pages,
  extracted video frames, text rendered in the output font, SVG renders) into a scratch
  directory and **inspect the rendered images yourself** (read the image files). Confirm:
  nothing blank/black, no wrong rotation or mirroring, no color shift, no cropped
  content, no mangled glyphs, orientation/EXIF respected.
- **Metric check** where applicable: PSNR/SSIM for images and PDF page rasters against
  the source; duration + channel/sample-rate sanity for audio/video; frame count for
  video; page count for PDFs.
- **Semantic check** for containers: archives — extract and byte-compare contents;
  fonts — render a pangram (and Javanese/variable-font samples where relevant);
  protected PDFs — unlock with the real password, then verify content.
- **If output is wrong → fix the code and re-run that file until the output is correct
  and valid.** Iterate as long as it takes; a finding is only closed when the visual
  and metric checks pass.
- Giant files (`100mb.iso`, the 4K video, huge PDFs): run the full matrix once to
  establish they work without OOM; after fixes, re-run only affected ones.
- Record per-file results (tool × level → pass/fail, size delta, notes) in the
  findings log. A silent "returned original" where compression should clearly win
  (see keep-original guard) counts as a finding to investigate.

## Method — verified loops, family by family

For each area:

1. Read the codec, its worker path, and its controls component; identify edge-case and
   correctness risks.
2. Attack it with hostile inputs: 0-byte files, truncated/corrupt files, huge files
   (100 MB+), wrong extension vs. real content, unicode/emoji/very long filenames,
   password-protected inputs, exotic variants (CMYK, 16-bit, animated, progressive,
   interlaced, mono/8 kHz audio, RTL text, mixed line endings).
   Extend `scripts/generate-fixtures.mjs` when a new fixture is needed.
3. Run the real-file matrix for that family (track above) alongside the hostile inputs.
4. A suspected bug only counts once it is **reproduced** — unit test or Playwright e2e
   with a real fixture. No fix without a failing test first.
5. Fix it, keep the regression test, re-run the affected suites.
6. Append every finding (fixed or open) to `docs/quality-sweep-2026-07.md` immediately,
   so progress survives context compaction. Include: severity, area, repro, fix commit.

Priority order when triaging: corrupt/wrong output > silent failure (original returned
without explanation) > crash or misleading error > SEO errors visible to crawlers >
performance > polish.

## SEO & agent-surface track

Build the site (`pnpm build`) and audit the **prerendered output**, not just the source.
Write a crawler/validator script (keep it in `scripts/`) that walks every generated page
and asserts invariants, so the checks are repeatable:

- **Uniqueness**: every page has a unique `<title>` and meta description; flag
  duplicates and near-duplicates (keyword cannibalization between similar tools).
- **Correctness**: canonical URLs correct and self-referencing; no page accidentally
  noindexed; heading hierarchy sane (exactly one h1, no skipped levels); lang attribute
  set; no empty/placeholder copy that shipped by mistake.
- **Structured data**: JSON-LD on every tool page parses and validates against the
  schema.org types used; FAQ answers match visible content.
- **Sitemap & routing**: sitemap contains exactly the set of real routes — no missing
  tools, no dead entries; all internal links resolve (no 404s in ToolDirectory,
  related-tools, hub pages, seo-body cross-links).
- **OG images**: every page has an OG image that actually exists in the build output;
  regenerate via `scripts/generate-og.mjs` if any are stale or missing.
- **Agent surface**: every HTML page's .md twin exists and its content matches the
  HTML (tool name, formats, limits — no drift); llms-full.txt is complete and current;
  `Accept: text/markdown` negotiation works via the worker wrapper; Content-Signal and
  Link headers present and consistent.
- **Content honesty**: claims in SEO copy (format support, size limits, "works offline",
  privacy claims) must match what the code actually does — flag any drift as a
  correctness finding, not just an SEO one.
  Fix everything confirmed; where a fix is editorial judgment (rewording copy), log it
  as OPEN with a concrete suggestion instead.

## Performance track

- Run `pnpm bench:memory` before starting (baseline) and after significant changes;
  investigate regressions and standout memory hogs across all 3 browsers.
- Time the real-file matrix runs — flag tools that are anomalously slow for their
  input size, unnecessary copies (esp. SAB→Blob), redundant decodes, main-thread
  stalls during batch processing.
- The CI bundle-budget gate must stay green (79.6 KB gz init). Anything new on the init
  path needs explicit justification in the findings log.

## Definition of done — per finding

- Test fails before the fix, passes after (for SEO findings: the validator script
  catches it before, passes after).
- `pnpm test` green; affected e2e specs green on chromium, firefox, and webkit.
- Real-file outputs for the affected tool re-validated: decode + visual + metric
  checks all pass.
- No bundle-budget regression; no new console errors.

## Constraints

- Client-side only — no telemetry, no network calls during processing. Privacy is the
  product; never weaken it.
- Keep-original guard semantics are intentional (outputs ≥ input return the original) —
  fix presentation/labeling around it if confusing, never remove it.
- Never modify or delete files in `tests/fixtures/real/` — they are source material.
- Commits: one logical fix per commit, single-line message, no body, no Co-Authored-By.
- No style-only refactors; change only what a finding requires.
- If a fix would change behavior users may rely on, or you cannot confirm the bug,
  log it as OPEN with a recommendation instead of guessing.

## Final report

Commit `docs/quality-sweep-2026-07.md` at the end with: a findings table (severity,
area, status, covering test, commit), the full real-file matrix (file × tool × level →
result), perf/memory before-vs-after numbers, SEO validator results (before/after),
and a short list of OPEN items that need a human decision.
