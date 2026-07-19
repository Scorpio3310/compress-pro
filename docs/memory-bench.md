# Peak-memory bench

Generated 2026-07-19T00:47:58.883Z · Apple M1 Pro · 16 GB RAM · built app on wrangler (preview)

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

| scenario | browser  | input                             | baseline MB | run1 peak Δ MB       | run2 Δ MB          | settled Δ MB              | UASM MB          | time          |
| -------- | -------- | --------------------------------- | ----------- | -------------------- | ------------------ | ------------------------- | ---------------- | ------------- |
| MEM-01   | chromium | reaa-bz-obdelana-3.pdf (405.8 MB) | 900.3       | 798 (proc 1115.9)    | 897.8 (leak 99.8)  | -426.6                    | 5.9 (wk 0.5)     | 7.7s / 8s     |
| MEM-01   | firefox  | reaa-bz-obdelana-3.pdf (405.8 MB) | 1289.5      | 581 (proc 959.4)     | 814.8 (leak 233.8) | -294.8                    | —                | 38.8s / 38.9s |
| MEM-01   | webkit   | reaa-bz-obdelana-3.pdf (405.8 MB) | 133.9       | 109.4 (proc 240.5)   | 8.7 (leak -100.7)  | -29.1                     | —                | 5.4s / 5.7s   |
| MEM-02   | chromium | v-720p-45s.webm (6.7 MB)          | 791.2       | 157.6 (proc 357.9)   | —                  | -142.8                    | 8.5 (wk 3.1)     | 7.4s          |
| MEM-02   | firefox  | v-720p-45s.webm (6.7 MB)          | 1257.8      | 242.5 (proc 620.3)   | —                  | -791.9                    | —                | 83s           |
| MEM-02   | webkit   | v-720p-45s.webm (6.7 MB)          | 212.1       | 72 (proc 281.4)      | —                  | 4.2                       | —                | 7s            |
| MEM-03   | chromium | 123A1748.MP4 (636.9 MB)           | 805.1       | 356.4 (proc 615.9)   | —                  | -158.7                    | 8.5 (wk 3.1)     | 39.9s         |
| MEM-04   | chromium | photo-4000x3000.jpg (0.4 MB)      | 906.6       | 1138.3 (proc 1315.8) | —                  | 845.8                     | 8895.8 (wk 8890) | 4.5s          |
| MEM-04   | firefox  | photo-4000x3000.jpg (0.4 MB)      | 849.9       | 693.9 (proc 910.4)   | —                  | 258.4                     | —                | 18.9s         |
| MEM-04   | webkit   | photo-4000x3000.jpg (0.4 MB)      | 246.6       | 12.6 (proc 256.5)    | —                  | -21.6                     | —                | 4.6s          |
| MEM-05   | chromium | 100mb.iso (105.2 MB)              | 726.6       | 188.3 (proc 467.2)   | —                  | -144.1                    | 5.9 (wk 0.6)     | 14.5s         |
| MEM-05   | firefox  | 100mb.iso (105.2 MB)              | 885.3       | 141.6 (proc 430.9)   | —                  | -240                      | —                | 53.9s         |
| MEM-05   | webkit   | 100mb.iso (105.2 MB)              | 239.4       | 14.4 (proc 251.1)    | —                  | -9.8                      | —                | 14s           |
| MEM-06   | chromium | reaa-bz-obdelana-3.pdf (405.8 MB) | 712.1       | — (proc 990)         | —                  | -61.4 (at cancel 349.5)   | —                | —             |
| MEM-06   | firefox  | reaa-bz-obdelana-3.pdf (405.8 MB) | 908.7       | — (proc 1272.5)      | —                  | -180.2 (at cancel -234.6) | —                | —             |
| MEM-06   | webkit   | reaa-bz-obdelana-3.pdf (405.8 MB) | 241.5       | — (proc 306.2)       | —                  | 18 (at cancel 49.2)       | —                | —             |

Scenario key: MEM-01 gs PDF High ×2 (leak signal = run2 − run1 peak) · MEM-02 video WebM→WebM ·
MEM-03 video MP4→MP4 (chromium only) · MEM-04 3×12 MP JPG→AVIF batch · MEM-05 100 MB ISO→7z ·
MEM-06 gs cancel mid-run (settled Δ near zero ⇒ worker terminate returned the wasm heap).
