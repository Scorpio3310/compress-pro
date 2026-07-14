# Vendored archive fixtures

Committed binary samples for formats that have **no JavaScript/WASM compressor**
— they cannot be produced by `scripts/generate-fixtures.mjs` on CI the way the
7z/zip/tar/gz/bz2/xz fixtures are. `archives.json` records the expected entries
per file (validated by extracting each with the same 7z-wasm engine the app
ships); e2e reads it via `fxArchive()`/`ARCHIVES` in `e2e/fixtures.ts`.

| File                   | Format                        | Source                                                           | Password   |
| ---------------------- | ----------------------------- | ---------------------------------------------------------------- | ---------- |
| `sample-v4.rar`        | RAR v4                        | libarchive test corpus¹ (`test_read_format_rar.rar.uu`)          | —          |
| `sample-locked-v4.rar` | RAR v4, data encrypted        | libarchive¹ (`test_read_format_rar_encryption_data.rar.uu`)      | `12345678` |
| `sample-v5.rar`        | RAR v5                        | libarchive¹ (`test_read_format_rar5_compressed.rar.uu`)          | —          |
| `sample-v5-multi.rar`  | RAR v5, 4 entries             | libarchive¹ (`test_read_format_rar5_multiple_files.rar.uu`)      | —          |
| `sample-locked-v5.rar` | RAR v5, encrypted incl. names | libarchive¹ (`test_read_format_rar5_encrypted_filenames.rar.uu`) | `password` |
| `sample.cab`           | CAB                           | libarchive¹ (`test_read_format_cab_1.cab.uu`)                    | —          |
| `sample.lzh`           | LHA/LZH                       | libarchive¹ (`test_read_format_lha_header1.lzh.uu`)              | —          |
| `sample.rpm`           | RPM (gzip/cpio payload)       | libarchive¹ (`test_read_format_cpio_svr4_gzip_rpm.rpm.uu`)       | —          |
| `sample.iso`           | ISO9660+Joliet                | made for this repo (macOS `hdiutil makehybrid -iso`)             | —          |
| `sample.txt.Z`         | unix compress                 | made for this repo (macOS BSD `compress`)                        | —          |
| `sample.arj`           | ARJ (stored)                  | made for this repo (hand-written writer, validated via 7zz)      | —          |

¹ [libarchive](https://github.com/libarchive/libarchive)'s test corpus, BSD-2-Clause
(the project's own license); files were uudecoded from
`libarchive/test/*.uu` at master (2026-07) and renamed. RAR _decompression_
test data redistributes fine; RAR compression itself stays proprietary, which
is exactly why these can't be generated.

Passwords are test-only and intentionally public. If you replace or add a
sample, update `archives.json` (entries are basenames of every extracted file,
after the app's nested-payload chaining — e.g. the rpm lists its final files,
with the intermediate `.cpio` under `chain`).
