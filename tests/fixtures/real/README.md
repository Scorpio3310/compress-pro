# Real-world test fixtures (optional, committed)

Drop real files here — the e2e suite picks them up automatically and skips
the corresponding tests when a file is absent. Synthetic fixtures (generated
into `../generated/` by `pnpm fixtures`) cover the logic; real files catch
decoder quirks synthetic ones can't (camera EXIF + ICC profiles, odd encoders,
real Ghostscript-hostile PDFs).

Received (2026-07-11 — tests DISCOVER files by extension via `realFile()` in
e2e/fixtures.ts, so exact names don't matter):

| File(s)                                              | Covers                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| file-example_PDF_1MB.pdf, sample1/2/3.pdf            | RF-01 + RF-14 (compress medium, pages survive)                |
| file_example MOV/MP4/WEBM                            | RF-02/03/04 (real conversions + 8 MB target)                  |
| file_example_MP3_5MG.mp3 (the »(1)« dup is harmless) | RF-05 mp3→m4a (ID3 tags through demux)                        |
| sample1.m4a (AAC)                                    | RF-06 m4a→mp3                                                 |
| sample1.flac (2 min)                                 | RF-07 flac→mp3 (decode-only codec)                            |
| file_example_WAV_5MG.wav                             | RF-08 wav→mp3                                                 |
| sample_1920×1280.gif (static)                        | RF-09 gifsicle recompress                                     |
| sample_1920×1280.png                                 | RF-10 Auto format                                             |
| sample_1920×1280.tiff                                | RF-11 utif2 decode → jpg                                      |
| sample_5184×3456.bmp (54 MB, 18 MP)                  | RF-12 native BMP decode → jpg                                 |
| sample_5184×3456.jpg/.jpeg/.jpe                      | RF-13 18 MP recompress + X-10 EXIF strip (.jpe routing fixed) |
| sample1.heic + sample1.heif                          | RF-15 real HEIC/HEIF → jpg (no false sequence warning)        |
| sample .pcd/.hdr/.ico                                | E-10 unsupported-format rejection (named + counted)           |

Received (2026-07-11 late):

| File(s)                                               | Covers                                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| file-example_PDF_1MB-protected-unlocked-protected.pdf | PT-17 positive unlock — **password: 123** (throwaway, deliberately public). Probed: OWNER-ONLY encryption (empty user password) — opens freely, so it can NOT drive E-05/E-07 |
| IMG_0883.HEIC (24.5 MP, Display P3, real iPhone)      | RF-15 (replaces sample1.heic as the sorted `realFile` pick) + KM-08 keep-metadata                                                                                             |
| IMG_0884.HEIC (48.8 MP portrait via irot, Display P3) | RF-16 (max-dimension cap on a 48 MP still; sort never picks it, targeted explicitly)                                                                                          |
| IMG_0885.MOV (4K HEVC, BT.2020 + **HLG = HDR**, APAC) | V-13 — either-or: branded Chrome converts with the HDR warning; the bundled test Chromium has no HEVC decoder, so the guiding refusal is asserted instead                     |

Received (2026-07-13 — audio-format expansion):

| File(s)                   | Covers                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| sample-1/2/5.ogg (Vorbis) | RF-17 ogg→mp3 — the suite's only real Vorbis decode (generated ogg fixtures are Opus)                                           |
| sample-1/3/5.opus         | RF-18 opus→mp3                                                                                                                  |
| file_example_WAV_5MG.wav  | also RF-19 wav→FLAC (lossless pack via libFLAC wasm)                                                                            |
| sample-1/2/5.flac         | also RF-20 flac→opus (.opus). NOTE: `realFile` sort now picks **sample-1.flac** (96 s, **32 kHz**) for RF-07/RF-20, not sample1 |
| file_example_MP3_5MG.mp3  | also RF-21 mp3→weba (audio-only WebM/Opus)                                                                                      |
| sample-1/3/5.aif (AIFF)   | RF-22 — deliberately UNSUPPORTED format (mediabunny has no AIFF reader); asserts the clean row-level rejection                  |

Received (2026-07-14 — archive suite, `real-archives.spec.ts` RA-01…12):

| File(s)                                    | Covers                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| sample-1/3/4/5.rar (v4)                    | RA-01 extract (v4 — a different generation than the vendored v5 corpus) + RA-08 convert RAR→ZIP (`realFile` sort picks sample-1)   |
| sample-2/3/4/5.7z                          | RA-02 extract (sort picks sample-2)                                                                                                |
| sample-3.zip (20 MB)                       | RA-03 — fflate fast-path timing on a real-sized zip                                                                                |
| sample-3.tar (65 MB)                       | RA-04 @slow — MEMFS scale proof (input + output coexist in wasm memory)                                                            |
| sample-2/3/4/5.gz, sample-2/3/4/5.bz2      | RA-05 stream decompression timing                                                                                                  |
| 1mb/3mb/100mb.iso                          | RA-06 (3 MB) + RA-07 @slow (100 MB — memory ceiling probe)                                                                         |
| WAV+PDF+JPG+TTF (existing files, ~11.8 MB) | RA-10 @slow create benchmark: ZIP vs 7Z (cold+warm) vs TAR.GZ vs TAR — ratios, elapsed, MB/s; RA-11 gzip WAV; RA-12 7Z level sweep |

Timings land as `metrics` in the visual report (`pnpm report`) — the RA suite
is the wall-clock benchmark of record for the archive engine.

Still wanted:

| File                            | Used for                                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `user-locked.pdf`               | E-05/E-07 need a USER-password-locked PDF (refuses to open). Make one: app → Protect (any password) → download → rename to `user-locked.pdf` |
| iPhone `.jpg` **with EXIF+GPS** | X-10 positive GPS-strip branch (the exif tab is JPEG/PNG/WebP only — HEIC doesn't count)                                                     |

Keep files reasonably small (a few MB). Anything else dropped here is ignored
unless a test picks it up by extension.
