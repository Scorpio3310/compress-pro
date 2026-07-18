# Peak-memory bench

Generated 2026-07-18T17:22:48.289Z · Apple M1 Pro · 16 GB RAM · built app on wrangler (preview)

Peak = max RSS sampled every 250 ms over the browser's process tree (Δ over the post-upload
baseline; "proc" = largest single process, absolute). UASM = chromium-only
`measureUserAgentSpecificMemory()` after the run (retained, post-GC; "wk" = worker realms) —
it counts a SharedArrayBuffer-backed wasm memory once per attached pthread realm, so
multithreaded scenarios (MEM-04) report many GB; read RSS for those, UASM for leak trends.
macOS RSS under-counts compressed pages and the tree sum double-counts shared ones —
**trends, not budgets**. Regenerate with `pnpm bench:memory`.

WebKit caveat: SharedArrayBuffer-backed wasm memory (MEM-04) and VideoToolbox codec memory
(MEM-02/03) live in shared/XPC regions that per-process RSS barely attributes — webkit peaks
are a FLOOR there, not a comparison point (its gs numbers, plain wasm memory, are honest).

| scenario | browser | input | baseline MB | run1 peak Δ MB | run2 Δ MB | settled Δ MB | UASM MB | time |
|---|---|---|---|---|---|---|---|---|
| MEM-01 | chromium | reaa-bz-obdelana-3.pdf (405.8 MB) | 999.9 | 762.1 (proc 1103.3) | 796.4 (leak 34.3) | -190 | 5.9 (wk 0.5) | 5.4s / 5.4s |
| MEM-01 | firefox | reaa-bz-obdelana-3.pdf (405.8 MB) | 1252.8 | 956.8 (proc 1195.9) | 1105.9 (leak 149.1) | 613.3 | — | 37.8s / 37.2s |
| MEM-01 | webkit | reaa-bz-obdelana-3.pdf (405.8 MB) | 158.9 | 86.7 (proc 242.8) | -59.3 (leak -146) | -65.3 | — | 5.7s / 5.3s |
| MEM-02 | chromium | v-720p-45s.webm (6.7 MB) | 835.9 | 196.6 (proc 418.6) | — | -6.4 | 8.4 (wk 3.1) | 7.2s |
| MEM-02 | firefox | v-720p-45s.webm (6.7 MB) | 1321.8 | 345.5 (proc 669.7) | — | -18.3 | — | 73.6s |
| MEM-02 | webkit | v-720p-45s.webm (6.7 MB) | 205.1 | 65.9 (proc 268.3) | — | -2.8 | — | 7.6s |
| MEM-03 | chromium | 123A1748.MP4 (636.9 MB) | 938.7 | 651.7 (proc 903) | — | -151.7 | 8.4 (wk 3.1) | 33s |
| MEM-04 | chromium | photo-4000x3000.jpg (0.4 MB) | 960.2 | 1299.3 (proc 1399.5) | — | 528.4 | 9309.4 (wk 9303.6) | 4.1s |
| MEM-04 | firefox | photo-4000x3000.jpg (0.4 MB) | 1316.8 | 1005 (proc 1243.6) | — | 925.7 | — | 17.7s |
| MEM-04 | webkit | photo-4000x3000.jpg (0.4 MB) | 218 | 2.8 (proc 218.1) | — | -22.5 | — | 4.2s |
| MEM-05 | chromium | 100mb.iso (105.2 MB) | 751.8 | 367.9 (proc 546.5) | — | 61 | 5.8 (wk 0.6) | 13.4s |
| MEM-05 | firefox | 100mb.iso (105.2 MB) | 1304.1 | 278.9 (proc 673.7) | — | -99.6 | — | 51.9s |
| MEM-05 | webkit | 100mb.iso (105.2 MB) | 214.3 | 16.4 (proc 228) | — | -1 | — | 13.6s |
| MEM-06 | chromium | reaa-bz-obdelana-3.pdf (405.8 MB) | 759.6 | — (proc 1213.6) | — | 743.8 (at cancel 928.4) | — | — |
| MEM-06 | firefox | reaa-bz-obdelana-3.pdf (405.8 MB) | 1341.5 | — (proc 1442) | — | 308.5 (at cancel 786.3) | — | — |
| MEM-06 | webkit | reaa-bz-obdelana-3.pdf (405.8 MB) | 223.8 | — (proc 327.4) | — | 92.5 (at cancel 98.6) | — | — |

Scenario key: MEM-01 gs PDF High ×2 (leak signal = run2 − run1 peak) · MEM-02 video WebM→WebM ·
MEM-03 video MP4→MP4 (chromium only) · MEM-04 3×12 MP JPG→AVIF batch · MEM-05 100 MB ISO→7z ·
MEM-06 gs cancel mid-run (settled Δ near zero ⇒ worker terminate returned the wasm heap).
