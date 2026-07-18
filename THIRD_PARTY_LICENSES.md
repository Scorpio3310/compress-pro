# Third-party licenses

Compress Pro's own code is [MIT](LICENSE). The app additionally ships (as part of
the built bundle served to browsers) the runtime dependencies below. Many are
thin npm wrappers around compiled WASM engines — in those cases the engine's
upstream license is the one that matters, and it is listed separately from the
wrapper's. Licenses are as declared by the upstream projects at the time of
writing; follow the links for the authoritative texts. This document is a
good-faith engineering summary, not legal advice.

## Copyleft components — read this before redistributing

These bundled engines carry copyleft licenses. This repository publishes its
complete corresponding source, which satisfies their source-availability
requirements for this project and its hosted deployment. If you redistribute a
build — especially modified or as part of a closed-source product — these terms
apply to you directly:

| Engine                                | License                                 | Ships via                 |
| ------------------------------------- | --------------------------------------- | ------------------------- |
| Ghostscript / GhostPDL                | AGPL-3.0                                | `@okathira/ghostpdl-wasm` |
| gifsicle                              | GPL-2.0                                 | `gifsicle-wasm-browser`   |
| LAME MP3 encoder                      | LGPL                                    | `@mediabunny/mp3-encoder` |
| FFmpeg native AAC encoder             | LGPL-2.1-or-later                       | `@mediabunny/aac-encoder` |
| HEIC codecs (libheif + libde265/x265) | LGPL/GPL family — see upstream projects | `icodec`                  |
| libimagequant / pngquant (lossy PNG)  | GPL-3.0-or-later (commercial dual-lic.) | `icodec`                  |
| 7-Zip (`7zz` CLI, archive engine)     | LGPL-2.1-or-later + unRAR restriction   | `7z-wasm`                 |
| LibRaw (camera RAW decoder)           | LGPL-2.1-only OR CDDL-1.0 (dual)        | `libraw-wasm`             |

One non-copyleft restriction rides along with 7-Zip: its RAR decoder derives
from Alexander Roshal's unRAR sources, whose license forbids using that code to
re-create the proprietary RAR _compression_ algorithm. This app only ever
decompresses RAR — creating RAR archives is impossible in any software that
respects that license — and this notice states the restriction as required.

## Full package table

| Package                                  | Version | Wrapper license | Bundled engine → upstream license                                                                                                                                            |
| ---------------------------------------- | ------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@jsquash/jpeg`                          | 1.6.0   | Apache-2.0      | [MozJPEG](https://github.com/mozilla/mozjpeg) → IJG + Modified BSD-3 + zlib (restated in `codec/LICENSE.codec.md`)                                                           |
| `@jsquash/webp`                          | 1.5.0   | Apache-2.0      | [libwebp](https://chromium.googlesource.com/webm/libwebp) → BSD-3-Clause (restated in package)                                                                               |
| `@jsquash/avif`                          | 2.1.1   | Apache-2.0      | [libavif](https://github.com/AOMediaCodec/libavif) → BSD-2-Clause; [aom](https://aomedia.googlesource.com/aom/) → BSD-2-Clause + AOM Patent License 1.0 (per upstream)       |
| `@jsquash/oxipng`                        | 2.3.0   | Apache-2.0      | [oxipng](https://github.com/oxipng/oxipng) → MIT (restated in package)                                                                                                       |
| `@jsquash/png`                           | 3.1.1   | Apache-2.0      | [image-rs png crate](https://github.com/image-rs/image-png) → MIT/Apache-2.0; Squoosh-derived support code → BSD-3 (restated in package)                                     |
| `@jsquash/resize`                        | 2.1.1   | Apache-2.0      | [PistonDevelopers/resize](https://github.com/PistonDevelopers/resize) → MIT; Squoosh-derived code → Apache-2.0 (per upstream)                                                |
| `icodec`                                 | 0.6.0   | MIT             | HEIC: [libheif](https://github.com/strukturag/libheif) + libde265/x265 → LGPL/GPL family; lossy PNG: [libimagequant](https://pngquant.org) → GPL-3.0-or-later (per upstream); JXL: [libjxl](https://github.com/libjxl/libjxl) → BSD-3-Clause |
| `@webtoon/psd`                           | 0.4.0   | MIT             | Pure TS/JS PSD parser (inline wasm helper) — no bundled third-party codecs                                                                                                   |
| `@gltf-transform/core` + `/functions` + `/extensions` | 4.4.1 | MIT   | Pure TS/JS glTF processing — no bundled codecs (Draco/meshopt ride separately)                                                                                               |
| `draco3d`                                | 1.5.7   | Apache-2.0      | [Google Draco](https://github.com/google/draco) → Apache-2.0 (encoder + decoder wasm)                                                                                        |
| `meshoptimizer`                          | 1.2.0   | MIT             | [meshoptimizer](https://github.com/zeux/meshoptimizer) → MIT (encoder/decoder/simplifier, wasm inlined)                                                                      |
| `xlsx` (SheetJS CE)                      | 0.20.3  | Apache-2.0      | Installed from the official cdn.sheetjs.com tarball — the npm registry copy is stale (0.18.5, known CVEs)                                                                    |
| `yaml`                                   | 2.9.0   | ISC             | —                                                                                                                                                                            |
| `@okathira/ghostpdl-wasm`                | 1.1.0   | AGPL-3.0        | [Ghostscript / GhostPDL](https://www.ghostscript.com) → AGPL-3.0 (full text shipped in package)                                                                              |
| `gifsicle-wasm-browser`                  | 1.5.19  | MIT             | [gifsicle](https://www.lcdf.org/gifsicle/) → GPL-2.0 (per upstream; not restated in package)                                                                                 |
| `mediabunny`                             | 1.50.8  | MPL-2.0         | — (pure TypeScript, no bundled engine)                                                                                                                                       |
| `@mediabunny/mp3-encoder`                | 1.50.8  | MPL-2.0         | [LAME](https://lame.sourceforge.io) → LGPL (per upstream; not restated in package)                                                                                           |
| `@mediabunny/flac-encoder`               | 1.50.8  | MPL-2.0         | [libFLAC](https://xiph.org/flac/) → BSD-3-Clause (per upstream; not restated in package)                                                                                     |
| `@mediabunny/aac-encoder`                | 1.50.8  | MPL-2.0         | [FFmpeg](https://ffmpeg.org) native AAC encoder (libavcodec) → LGPL-2.1-or-later (per upstream; not restated in package)                                                     |
| `gifenc`                                 | 1.0.3   | MIT             | —                                                                                                                                                                            |
| `fflate`                                 | 0.8.3   | MIT             | —                                                                                                                                                                            |
| `7z-wasm`                                | 1.2.0   | (engine's)      | [7-Zip](https://www.7-zip.org) 24.09 `7zz` CLI → LGPL-2.1-or-later; RAR decoder → unRAR license (decompress-only restriction) — both texts shipped in the package            |
| `fonteditor-core`                        | 2.6.3   | MIT             | [Google woff2](https://github.com/google/woff2) → MIT; [Brotli](https://github.com/google/brotli) → MIT (compiled into its `woff2.wasm`)                                     |
| `harfbuzzjs`                             | 1.4.0   | MIT             | [HarfBuzz](https://github.com/harfbuzz/harfbuzz) → "Old MIT" (compiled into its `harfbuzz-subset.wasm`)                                                                      |
| `svgo`                                   | 4.0.1   | MIT             | —                                                                                                                                                                            |
| `@neslinesli93/qpdf-wasm`                | 0.3.0   | ISC             | [qpdf](https://github.com/qpdf/qpdf) → Apache-2.0 (per upstream; not restated in package)                                                                                    |
| `vtracer-wasm`                           | 0.1.0   | MIT             | [visioncortex VTracer](https://github.com/visioncortex/vtracer) → MIT (per upstream; not restated in package)                                                                |
| `libraw-wasm`                            | 1.6.0   | ISC             | [LibRaw](https://www.libraw.org) → LGPL-2.1-only OR CDDL-1.0, dual-licensed (per upstream; not restated in package)                                                          |
| `tesseract.js`                           | 7.0.0   | Apache-2.0      | [Tesseract](https://github.com/tesseract-ocr/tesseract) → Apache-2.0; language models from [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) → Apache-2.0     |
| `pdf-lib`                                | 1.17.1  | MIT             | —                                                                                                                                                                            |
| `pdfjs-dist` (pdf.js)                    | 6.1.200 | Apache-2.0      | —                                                                                                                                                                            |
| `utif2`                                  | 4.1.0   | MIT             | —                                                                                                                                                                            |
| `motion`                                 | 12.42.2 | MIT             | —                                                                                                                                                                            |
| `@fontsource-variable/plus-jakarta-sans` | 5.2.8   | OFL-1.1         | [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans) → SIL Open Font License 1.1                                                                                 |
| `@fontsource-variable/geist-mono`        | 5.2.8   | OFL-1.1         | [Geist Mono](https://github.com/vercel/geist-font) → SIL Open Font License 1.1                                                                                               |

Build-time tooling (SvelteKit, Vite, Tailwind, Playwright, sharp, …) is not
shipped to users and is therefore not listed here; see `package.json`
`devDependencies` and each package's own license.
