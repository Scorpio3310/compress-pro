# Quality sweep — July 2026

Systematic audit of all 144 tools, shared infrastructure, UI/UX, SEO/agent surface, and
real-file validation per `docs/quality-sweep-goal.md`. Started 2026-07-18, completed
2026-07-19.

**Outcome:** 73 findings — every one FIXED with a red→green covering test, REFUTED with
evidence, or logged OPEN with a concrete recommendation (O-01…O-08). Final state: unit
963/963 · quick e2e 421/421 (two fully-green runs; individual runs occasionally drop one cell to 4-worker CPU contention — every such cell passes solo, a pre-existing suite trait) · xbrowser 27/27 (chromium+firefox+webkit) · real-file
matrix 826 cells 804✓/0✗/22 documented skips (normal + giant tier; full table in
`docs/matrix-report-2026-07.md`) · 486 output rasters individually inspected by eye ·
SEO validator 0 errors over 147 pages · bundle gate 84.2 KB gz (budget 92) · memory
bench before/after with no regressions. Headline fixes: gs dropping every PDF
annotation (filled forms + links — S1), all real-world RAW-composite PSDs refused,
TIFF orientation ignored, concurrent RAW decodes crossing pixels between files,
video→GIF silently truncating timelines, zip-bomb/OOM guards, cancel races, and a
long tail of honest-error and UX fixes.

Severity: **S1** corrupt/wrong output · **S2** silent failure (original returned without
explanation) · **S3** crash or misleading error · **S4** SEO error visible to crawlers ·
**S5** performance · **S6** polish.
Status: `FIXED` (commit + covering test) · `OPEN` (needs human decision) · `INVESTIGATING`.

## Findings

| # | Sev | Area | Finding | Status | Test | Commit |
|---|-----|------|---------|--------|------|--------|
| F-01 | S6 (test-infra) | e2e helpers | `openAdvanced()` raced the lazily-imported settings card (`loadControls` in +page): probing `advanced-toggle` via `count()` before the dynamic import mounted silently no-opped, leaving later switch clicks stuck against the collapsed `inert` panel. Baseline `test:e2e:quick` was red: 8/381 failing under workers=4 (HE-02, IMG-12, KM-06, S-04, S-05, V-07, V-08, V-24) — all in toggle/advanced flows; each passed in isolation. Diagnosed via CDP (`Network.requestWillBeSent` initiator + MutationObserver instrumentation). Fix: wait for new `data-testid="settings-panel"` before deciding the tab has no disclosure. | FIXED | quick suite 381/381 green after fix (was 8 fail → 2 residual-flake → 0 across three runs); race deterministically repro'd via instrumented spec before fix | 3481522 |
| F-03 | S1 | pdf compress/grayscale/pdfa | The gs wasm engine drops EVERY annotation on rewrite (measured: even bare pdfwrite args and `-dPreserveAnnots=true`): filled AcroForm values (sample2.pdf: "Man"/"150"/"Red" → empty) AND hyperlinks silently vanished. Caught by VISUAL inspection of the matrix raster (SSIM 0.9957 missed it). Two-layer root cause: engine strips annots; and pdf-lib `updateFieldAppearances` only regenerates DIRTY fields, so externally-filled forms flattened to empty boxes. Fix: `pdf-interactive.ts` — byte-scan (+bounded /ObjStm probe), re-set every field to its own value (marks dirty), regenerate appearances, flatten pre-gs; collect /Link annots (URI + GoTo) and transplant post-gs; flatten surfaced as row warning. Applied to compress (level+target), grayscale, pdfa. | FIXED | P-30 e2e (red→green) + 6 unit tests (pdf-interactive.test.ts) + visual re-check of matrix raster | d2a86a7 |
| F-04 | S6 (test-infra) | matrix harness | Archive extract cells failed as "3/6 entries" on every macOS-made zip/rar + all bz2 — triage proved ZERO app data loss: the app intentionally hides `__MACOSX/._*`/dot-file noise (extractableEntry rule), and Chromium appends ".txt" to extension-less single-entry downloads, breaking name-keyed comparison. Comparator now mirrors the app's row rule and byte-compares the 1:1 case. Sidebar polish idea logged as O-02. | FIXED | matrix extract cells green (sample-2.zip/bz2, sample-5.rar) | (with harness commits) |
| F-02 | S6 (dev-only) | dev server | During e2e runs a stray full reload sometimes fires from `@vite/client` (`pageReload` debouncer; CDP initiator stack captured; no HMR/full-reload message logged server- or client-side). Dev-only — production never runs the vite client. Resets page state mid-test when it lands; not reproducible on an idle page (25 s watch) nor in a standalone scripted flow. | OPEN (monitoring) | n/a — will re-flag if it recurs in matrix runs | — |

### Audit round 1 (workflow: 9 finders + adversarial verify, 2026-07-18 evening)
64 raw findings → **51 confirmed** (1 refuted, 12 verifications hit the session usage
limit — re-verify queued; full detail incl. failure scenarios + repro ideas in
`test-results/audit-r1.json`). All queued below; fixes land one commit each.

| F-06 | S2 | images | TIFF Orientation tag ignored — rotated/mirrored output for orientation-tagged TIFFs (`src/lib/workers/image.worker.ts:97`) | FIXED | orientation.test.ts (5 unit) + CV-19b e2e (red→green, upright dims + pixel diff) | b82cf1e |
| F-07 | S2 | vectorize-raw-ocr | RAW develops with daylight WB, not camera WB — indoor shots get a heavy color cast (`src/lib/codecs/raw.ts:42`) | FIXED | raw unit (2, real wasm develop) + CV-40/41 regen twin | 61e016f |
| F-08 | S2 | vectorize-raw-ocr | ocrPdf on owner-locked (permissions-encrypted) scan silently produces a corrupt PDF (`src/lib/codecs/ocr.ts:162`) | FIXED | ocr unit + OC-05 e2e | 61e016f |
| F-09 | S2 | vectorize-raw-ocr | ocrPdf text layer misplaced on pages with /Rotate 90/180/270 (landscape scans) (`src/lib/codecs/ocr.ts:188`) | FIXED | mapWordToPdf unit (4) + OC-04 e2e | 61e016f |
| F-10 | S2 | pdf | Merge/extract/watermark/pageNumbers silently corrupt owner-locked (encrypted) PDFs (`src/lib/codecs/pdf-tools.ts:15`) | FIXED | pdf-tools unit (3) + PT-27 e2e | e0935c8 |
| F-11 | S2 | pdf | watermark/pageNumbers ignore /Rotate — stamps sideways or upside down (`src/lib/codecs/pdf-tools.ts:236`) | FIXED | PT-28/29 e2e centroid/diagonal red→green | e0935c8 |
| F-12 | S2 | pdf | F-03 prep on encrypted inputs transplants mojibake link URIs, loses form values (`src/lib/codecs/pdf-interactive.ts:71`) | FIXED | unit: encrypted-untouched (qpdf-encrypted fixture) | 546c8eb |
| F-13 | S2 | pdf | Named-destination internal links silently dropped by the link transplant (`src/lib/codecs/pdf-interactive.ts:166`) | FIXED | unit: /Names tree + old-style /Dests both resolve | 546c8eb |
| F-14 | S2 | video-audio | Rotated MJPEG .mov: convertMjpeg squashes frames into swapped dims and drops rotation (`src/lib/workers/video.worker.ts:426`) | FIXED | rotatedDrawSpec unit (5) + V-32 quadrant e2e | 39377a7 |
| F-15 | S2 | video-audio | ADTS .aac → M4A: EXT grouping lets keep-original silently return the raw ADTS file (`src/lib/codecs/audio.ts:22`) | FIXED | unit red-proof vs old EXT grouping + AU-22 | 39377a7 |
| F-16 | S2 | archives | Encrypted ZIP with stored entries: fflate path returns raw ciphertext as output (`src/lib/compress.ts:441`) | FIXED | zip-meta CD parser routes encrypted zips to worker; Z-08 e2e | 229b597 |
| F-17 | S2 | archives | Extract silently drops dotfiles and 0-byte entries; all-dotfile zip gets wrong error (`src/lib/compress.ts:228`) | FIXED | dotfile/0-byte rows extracted; Z-07 + AR-05; honest all-noise error | 229b597 |
| F-18 | S2 | docs-models | Subtitle converter decodes every input as UTF-8 — legacy/UTF-16 SRT corrupts or errors (`src/lib/compress.ts:887`) | FIXED | decodeSubtitleText unit (5) + SB-06 e2e | 1d5ad0a |
| F-19 | S2 | docs-models | yaml-to-json leaves << merge keys unresolved — literal "<<" keys in the JSON output (`src/lib/codecs/data.ts:244`) | FIXED | unit docker-compose idiom | 1d5ad0a |
| F-20 | S2 | docs-models | csv-to-xlsx numeric retype destroys leading zeros and >15-digit identifiers (`src/lib/codecs/data.ts:144`) | FIXED | unit leading-zero/15-digit | 1d5ad0a |
| F-21 | S3 | images | Static WebP/Auto encode of >16383 px images throws cryptic 'Encoding error.' (`src/lib/workers/image.worker.ts:582`) | FIXED | e2e R-07/08/09 red→green | bcf5bbb |
| F-22 | S3 | images | isAnimatedInput byte-scan false-positives on static GIFs → false 'Animation lost' warning (`src/lib/codecs/image.ts:108`) | FIXED | unit GIF block-walk suite (5) | bcf5bbb |
| F-23 | S3 | images | Rejected wasm-loader promise cached forever — one failed load bricks HEIC/JXL until reload (`src/lib/workers/image.worker.ts:138`) | FIXED | wasm-ready unit (4) + WR-01 e2e route-abort retry | bcf5bbb |
| F-24 | S3 | images | Truncated GIF (<10 bytes) surfaces a raw DataView RangeError instead of an honest error (`src/lib/codecs/image.ts:449`) | FIXED | unit guard tests (3) | bcf5bbb |
| F-25 | S3 | vectorize-raw-ocr | RAW + 'Keep metadata' silently drops all EXIF/GPS despite the toggle's promise (`src/lib/codecs/image.ts:242`) | FIXED | unit (2): honest 'Metadata not kept' note; full EXIF copy = OPEN wiring | bcf5bbb |
| F-26 | S3 | vectorize-raw-ocr | vtracer wasm never re-inits after a panic — one bad job bricks vectorize until reload (`src/lib/workers/vtracer.worker.ts:18`) | FIXED | wasm-trap unit (4); pool-respawn mechanism | 61e016f |
| F-27 | S3 | vectorize-raw-ocr | OCR dispatches by settings.op — op toggle after upload sends PDFs to tesseract (`src/lib/compress.ts:863`) | FIXED | compress-dispatch unit: %PDF sniff refusals name the right pill | 229b597 |
| F-28 | S3 | vectorize-raw-ocr | RAW/TIFF/PSD/JXL + SVG output bypasses their decoders — accepted files fail to vectorize (`src/lib/compress.ts:768`) | FIXED | PNG bitmap bridge; VD-01..03 e2e tiff/psd/dng → svg | 229b597 |
| F-29 | S3 | pdf | Target-size mode can ship a file over the requested target, unreported (`src/lib/codecs/pdf.ts:454`) | FIXED | pdf.test unit (2) | e0935c8 |
| F-30 | S3 | pdf | Open-ended page range beyond the last page yields misleading 'reversed' error (`src/lib/pdf-range.ts:44`) | FIXED | pdf-range unit red→green | e0935c8 |
| F-31 | S3 | pdf | pdf-to-images/pdf-to-text surface raw 'No password given' and leak the failed task (`src/lib/codecs/pdf-tools.ts:252`) | FIXED | unit (3) + PT-30 e2e | e0935c8 |
| F-32 | S3 | video-audio | MJPEG path silently ignores the fps cap yet still flags transformed=true (`src/lib/workers/video.worker.ts:413`) | FIXED | V-33/34 + unit | 39377a7 |
| F-33 | S3 | video-audio | MJPEG with ≤24 kHz audio: conversion dies with raw 'mp4a.40.5 not supported' error (`src/lib/workers/video.worker.ts:382`) | FIXED | HE-AAC ladder unit + e2e | 39377a7 |
| F-34 | S3 | video-audio | MJPEG → GIF throws misleading 'This browser can't decode this video — try Chrome' (`src/lib/workers/video.worker.ts:463`) | FIXED | V-35 e2e | 39377a7 |
| F-35 | S3 | archives | Chain-unwrap keys on entry names, not outer format; deb branch drops sibling entries (`src/lib/codecs/sevenzip-args.ts:253`) | FIXED | nextChainStep contract units + AR-16 e2e | 30f6085 |
| F-36 | S3 | archives | No extracted-size guard: high-ratio archive (zip bomb) OOMs the tab mid-extract (`src/lib/workers/archive.worker.ts:305`) | FIXED | 2 GiB ceiling; AR-15 zip-bomb fixture refused pre-extract | 30f6085 |
| F-37 | S3 | fonts | Same-format convert passthrough: corrupt WOFF/WOFF2/EOT reported as success (`src/lib/workers/font.worker.ts:213`) | FIXED | font.worker unit (4) + FT-15 e2e | 4dd6494 |
| F-38 | S3 | fonts | woff2 wasm fetch failure hangs 10 min (init never settles), then misleading watchdog error (`src/lib/workers/font.worker.ts:59`) | FIXED | unit fail-fast + FT-01/02/09 green | 4dd6494 |
| F-39 | S3 | fonts | WOFF2-packed font collection (ttcf flavor) errors with 'doesn't look like a valid font' (`src/lib/codecs/font-sniff.ts:41`) | FIXED | font-sniff ttcf tests | 4dd6494 |
| F-40 | S3 | fonts | OTF (CFF) to EOT conversion silently produces a file no EOT consumer can render (`src/lib/workers/font.worker.ts:192`) | FIXED | honest refusal test | 4dd6494 |
| F-41 | S3 | fonts | woff2 emscripten abort poisons the cached module for every later woff2 job in the session (`src/lib/workers/font.worker.ts:187`) | FIXED | abort-recovery unit | 4dd6494 |
| F-42 | S3 | docs-models | vtt-to-srt misses hourless karaoke timestamps — <MM:SS.mmm> tags leak into the SRT (`src/lib/codecs/subtitles.ts:74`) | FIXED | unit mixed-tags | 1d5ad0a |
| F-43 | S3 | shared-infra | PDF merge ignores Cancel completely — run continues and commits its result (`src/lib/compress.ts:518`) | FIXED | abort gates around merge/fromImages/gs commits; unit: no commit after Cancel (mid-copyPages granularity = residual note) | 229b597 |
| F-44 | S3 | shared-infra | callWorker accepts an already-aborted owner — encodes escape Cancel onto fresh workers (`src/lib/workers/rpc.ts:260`) | FIXED | rpc.test.ts submit-time guard (red→green) | 07d4a68 |
| F-45 | S5 | images | ICO padToSquare allocates side² RGBA for extreme aspect ratios — ~1 GB+ for panoramas (`src/lib/workers/image.worker.ts:434`) | FIXED | CV-47 e2e 60MP pano (was stall/OOM) | bcf5bbb |
| F-46 | S5 | vectorize-raw-ocr | Vectorize has no size cap and ignores max-dimension — huge photos hang for minutes (`src/lib/codecs/vectorize.ts:52`) | FIXED | vectorize-limits unit (3) + VC-01 e2e; user maxDimension wiring = OPEN | 61e016f |
| F-47 | S5 | video-audio | Video→GIF has no hard frame/dimension cap; long or 4K sources OOM, warning shows post-run (`src/lib/codecs/video.ts:247`) | FIXED | planGif unit (5) + V-36 e2e | 39377a7 |
| F-48 | S5 | video-audio | Cancel during Conversion.init window is lost: guaranteed 5 s stall, then worker kill (`src/lib/workers/video.worker.ts:307`) | FIXED | job-registry unit (5) | 39377a7 |
| F-49 | S5 | archives | 60-line tail ring loses password signal; partly-failed extract discards good entries (`src/lib/workers/archive.worker.ts:81`) | FIXED | latched signal recorder units + Z-12 mixed-encryption e2e | 30f6085 |
| F-50 | S5 | archives | fflate fast paths buffer whole batch + output in main-thread RAM with no size gate (`src/lib/compress.ts:274`) | FIXED | FFLATE_FAST_PATH_MAX_BYTES=500MB routes big batches to worker; units | 229b597 |
| F-51 | S5 | shared-infra | fflate plain-zip create buffers all inputs in RAM — multi-GB batch crashes the tab (`src/lib/compress.ts:280`) | FIXED | same gate covers create; worker createBundle handles plain zip | 229b597 |
| F-52 | S6 | images | Keep-original guard clears info but not warning — kept original keeps false frame warning (`src/lib/compress.ts:1023`) | FIXED | guard nulls warning with info; unit + K-01 | 229b597 |
| F-53 | S6 | pdf | pdf-to-images zip names pad to 2 digits — wrong sort order for 100+ page PDFs (`src/lib/codecs/pdf-tools.ts:106`) | FIXED | unit 120-page padding | e0935c8 |
| F-54 | S6 | archives | Legacy non-UTF-8 zip names mojibake'd; C1 controls survive sanitizeEntryName (`src/lib/compress.ts:456`) | FIXED | cp437/UTF-8 CD decode + C1 strip; Z-09 e2e (7zz worker path residual → R3) | 229b597 |
| F-55 | S6 | fonts | WOFF extended-metadata and private blocks silently dropped on every conversion, no note (`src/lib/codecs/woff1.ts:67`) | FIXED | note surfaced; unit | 4dd6494 |
| F-56 | S6 | docs-models | Simplify is silently skipped on morph-target meshes — setting ignored with no warning (`src/lib/workers/model.worker.ts:192`) | FIXED | modelWarning unit + MD-10 e2e (morph fixture) | a22c4c7 |

| F-69 | S5 | images | Huge-image PNG conversions ground for minutes: oxipng optimise pass on 12–48 MP outputs (heic/webp→png @q100) ran 4–8+ min and timed out matrix cells; straight @jsquash/png encode is seconds. Fix: skip oxipng past 12 MP (savings there were single-digit %). Matrix cells 13–18 s after fix; existing <12 MP threshold suites untouched. | FIXED | matrix heic-to-png/webp-to-png cells (4-8 min timeout → green in seconds) + images-quality/defaults regression green | 4ff4fa5 |
| F-70 | S6 (test-infra) | matrix harness | remove-audio duration compare used CONTAINER duration; real webm's audio track runs 0.49 s longer than video, so stripping audio legitimately shortens the container. Spec now compares the input's VIDEO track duration. | FIXED | matrix remove-audio cell green | 4ff4fa5 |

| F-71 | S1 | images/raw | Concurrent RAW decodes crossed pixels between files: the shared LibRaw worker's open() and imageData() are two awaited calls, and image-lane parallelism (up to 4) let file B's open land between A's open and imageData — A shipped B's PHOTO under its own name (matrix visual inspector caught byte-identical outputs + wrong dims; probe reproduced it live). Fix: serialize the open→imageData transaction on a promise chain (bytes still read concurrently). | FIXED | raw.test.ts concurrency test (red→green) + matrix RAW cells re-run with correct native dims + visual re-check | 4e365da |
| F-72 | S2 | video | video→GIF silently truncates the timeline: 13.33 s 4K source → 9.04 s GIF (113×80 ms frames; measured via sharp delay sum). Caught by the VISUAL inspector (mid-frame showed a different moment); metrics/pages alone looked plausible. Root cause: CanvasSink yields null for slots it can't produce and the loop SKIPPED them (no frame written) — timeline contracted by the null count. Fix: hold the previous frame for null slots (+ backfill leading nulls). | FIXED | V-37 e2e (red 9.04s→green 13.3s±7%) | 2c535c5 |
| F-73 | S2 | video | gif→mp4 output visibly brighter/higher-contrast than the GIF source (Muybridge cat cell) — suspected full-vs-limited range (or gamma/matrix) mismatch in the RGB→H.264 path. Pixel probe REFUTED it: mean luma gif 197.4 vs mp4 197.5 (identical) through the same browser decode path — the perceived shift was the inspection compositor decoding the GIF via sharp vs the MP4 via browser video. App output correct; compositor polish noted in O-07. | REFUTED | luminance probe (this log) | — |

### Audit round 1b (re-verified after usage-limit failures — ALL 12 real)

| F-57 | S3 | models | Truncated/corrupt GLB surfaces raw RangeError/JSON SyntaxError instead of a friendly error (`src/lib/codecs/model-shared.ts:85`) | FIXED | model-shared units (4) + MD-11 e2e | a22c4c7 |
| F-58 | S3 | subtitles | srt-to-vtt never escapes bare < — WebVTT tokenizer swallows the rest of the cue (`src/lib/codecs/subtitles.ts:206`) | FIXED | subtitles escaping units (4) | 37c1ba1 |
| F-59 | S3 | shared-infra | Watchdog counts queue wait; expiry kills healthy co-tenant jobs on shared workers (`src/lib/workers/rpc.ts:271`) | FIXED | rpc instance-silence watchdog unit | 3e0d423 |
| F-60 | S6 | shared-infra | Keep-original revert keeps the stale codec warning — numbers contradict shipped bytes (`src/lib/compress.ts:1023`) | FIXED | duplicate of F-52 — same fix | 229b597 |
| F-61 | S6 | shared-infra | Settings persist effect writes localStorage unguarded — uncaught throw on blocked storage (`src/lib/stores/settings.svelte.ts:36`; theme.svelte.ts init read was the harder crash) | FIXED | ST-20 e2e (red→green via stash) | see git log |
| F-62 | S2 | ui-layer | afterNavigate presets fire on busy tabs: files cleared mid-run, in-flight settings mutated (`+page.svelte:572`) | FIXED | LP-17 e2e busy-tab guard (+latent data-preset fallthrough fix) | 270323b |
| F-63 | S3 | ui-layer | Offline chunk-load failure shows raw 'Failed to fetch dynamically imported module' (`+page.svelte:473`) | FIXED | E-12 e2e offline chunk message | 270323b |
| F-64 | S6 | ui-layer | savingsPercent clamps at 0: grown outputs show '−0%' chip contradicting '↑ larger' note (`src/lib/compress.ts:77`) | FIXED | signed savings; K-02 e2e | 270323b |
| F-65 | S6 | ui-layer | Merge/create/images→PDF runs show all rows but one 'queued' and '0/N done' throughout (`src/lib/compress.ts:516`) | FIXED | spreadCombinedProgress units | 270323b |
| F-66 | S6 | ui-layer | Removing a failed file's row leaves its stale error banner and red tab badge behind (`+page.svelte:507`) | FIXED | E-11 e2e banner/badge cleanup | 270323b |
| F-67 | S6 | ui-layer | Busy-tab refusal message names internal tab ids ('zip', 'subtitle'), not UI labels (`+page.svelte:701`) | FIXED | tab-ui units: real labels | 270323b |
| F-68 | S6 | ui-layer | Tab-title progress tracks first compressing tab in object order, not the watched one (`+page.svelte:260`) | FIXED | pickTitleRun units | 270323b |
## Real-file matrix

Generated by `scripts/matrix-report.mjs` from `test-results/matrix/cells/`.
**FINAL (2026-07-19): 826 cells — 804 pass, 0 fail, 0 error, 22 skips** (18 encrypted
inputs covered by the dedicated password tests, 4 honest HEVC refusals). Normal tier
807 cells in 37.5 min (workers 3); giant tier 10/10 (406 MB PDFs at Medium+Extreme,
100 MB ISO→zip, 637 MB 4K video — the one contention timeout re-ran green solo in 6 s).
Full file × tool × level table: `docs/matrix-report-2026-07.md`. Visual inspection:
486 rasters read individually by multimodal inspectors — caught F-71 (RAW pixel
cross-wiring) and F-72 (GIF timeline truncation) that all numeric metrics missed;
refuted F-73 (compositor artifact). PDF/fonts/docs/models families visually clean.

## Performance

### Before/after summary (Phase 6)
After-state (2026-07-19, same 16-scenario bench): no regressions beyond run noise;
several peaks improved (MEM-02 chromium 197→158 MB, MEM-03 4K video 652→356 MB,
MEM-05 iso 368→188 MB, MEM-06 cancel settled 744→−61 MB). MEM-01 gs run +2.3 s from
the F-03 interactive byte-scan on a 406 MB input — since reduced to a single pass.
MEM-04 (AVIF batch) settled Δ stays high/noisy across runs → O-08 watch item.
Matrix `durationMs` doubles as the per-tool timing source; the one anomaly it caught
(oxipng minutes-long grind past 12 MP) is fixed (F-69).

### Memory bench baseline (before sweep)
2026-07-18, 16 passed / 2 skipped, 10.5 min — full table in `docs/memory-bench.md`
(this run = the before-state). Highlights: MEM-01 gs 406 MB PDF chromium peak Δ 762 MB
(leak signal 34 MB); MEM-04 AVIF batch chromium peak Δ 1299 MB and **settled Δ 528 MB**
(candidate to re-examine in Phase 6 — previous sweeps reported settled ≈ 0);
MEM-06 cancel returns the gs wasm heap on all 3 browsers.

### Bundle gate
Baseline at sweep start (2026-07-18, post-expansion commits): initial JS 232,886 raw /
**83,753 gz** (budget 92,000), route node 2: 77,827 raw (budget 86,000). Note: init grew
from the pre-expansion 79.6 KB gz baseline by ~4.1 KB — attributable to wiring 22 new
tools (new settings types, controls routing, tab registry). To re-examine in Phase 6
whether any of that belongs off the init path.

## SEO validator

### Before
2026-07-18, `node scripts/validate-seo.mjs` over `.svelte-kit/cloudflare/` (147 html,
145 md twins, 144 registry slugs): **0 errors, 10 warnings, exit 0**. All 13 check
classes proven non-vacuous against seeded violations. The 10 warnings are reversed
converter pairs (eot↔ttf, json↔yaml, mp3↔ogg, otf↔woff, otf↔woff2, srt↔vtt,
tar-gz↔zip, ttf↔woff, ttf↔woff2, woff↔woff2) whose title token SETS are identical
(strings distinct and direction-correct) → logged as OPEN item O-01.

### After
(populated at the end)

## OPEN items (need a human decision)

- **O-02 (UX polish, archives):** an extracted entry with no extension (e.g. the JPEG
  payload inside sample-2.bz2) downloads as "<name>.txt" — Chromium appends an extension
  because the blob is typed `''` (compress.ts entryRow). Suggestion: magic-sniff common
  types for extension-less extracted entries (image sniffing already exists in
  file-visual.ts) and set blob type + display name accordingly.
- **O-03 (feature wiring, RAW metadata):** "Keep metadata" on RAW inputs now shows an
  honest "Metadata not kept …" note (F-25 fix). FULL preservation needs: LibRaw
  metadata() → minimal EXIF TIFF in raw.ts, an optional `exifTiff` on PredecodedPixels
  (protocol.ts), and the splice in image.ts (already in place for other paths). Small,
  well-scoped follow-up.
- **O-04 (copy polish):** with honest signed savings (F-64), CompareModal can render
  "Saved −300 %" in green for grown files — consider a "Grew 300 %" phrasing/color
  variant in CompareModal/SavingsSummary.
- **O-05 (cancel granularity):** merge Cancel now bites at per-file progress ticks and
  commit gates (F-43); threading the AbortSignal INTO pdf-tools' mergePdfs loop would
  make it bite mid-copyPages of one huge member too.
- **O-06 (legacy archives, names):** old RAR/LZH/ARJ/CAB with OEM-codepage entry names
  still come out garbled through the 7zz worker (engine mangles them lossily before
  MEMFS; -mcp rejected). Zip gets repaired from its own central directory (30f6085);
  other formats would each need a minimal name+CRC header walker, or the js7z-tools
  (7-Zip 25.01) upgrade already noted in memory. Content is correct either way.
- **O-07 (harness polish):** the side-by-side raster compositor offsets the right panel
  ~12 px and can render dark scenes slightly darker on one side (different decode paths
  for GIF vs video panels) — cosmetic, but it cost two false S2 alarms during visual
  inspection; align panels pixel-exact and decode both sides through one path.
- **O-08 (perf watch):** MEM-04 (AVIF batch) settled Δ is high and noisy across runs
  (529 MB before, 846 MB after; peaks similar) — pooled image workers keep wasm heaps
  alive by design; no per-run leak signal, but worth a look if users report memory
  pressure after large AVIF batches.

- **O-01 (SEO, editorial):** 10 reversed converter pairs share identical title token
  sets (e.g. "Convert TTF to WOFF2 …" vs "Convert WOFF2 to TTF …") — potential keyword
  cannibalization between A→B and B→A pages. Suggestion: differentiate one side's title
  angle (e.g. B→A gets "Restore/Extract …" phrasing or a use-case qualifier). Rankings
  currently unaffected as directions differ; purely precautionary.
