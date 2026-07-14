/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// Commit stamp for the footer: Workers Builds env → local git → 'dev'.
// A dirty working tree gets an explicit suffix so a hand-rolled deploy can
// never claim to be a clean repo state.
function commitStamp() {
	const ci = process.env.WORKERS_CI_COMMIT_SHA;
	if (ci) return ci.slice(0, 7);
	try {
		const sha = execSync('git rev-parse --short HEAD').toString().trim();
		const dirty = execSync('git status --porcelain').toString().trim() !== '';
		return dirty ? `${sha}-dirty` : sha;
	} catch {
		return 'dev';
	}
}

// Cross-origin isolation in dev/preview — production gets the same pair from
// the root _headers file. Required for SharedArrayBuffer (threaded AVIF/oxipng).
const coiHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp'
};

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// Baked at build time — the footer's version/commit stamps and © year read
	// these, so SSR and client always agree (no hydration mismatch).
	define: {
		__BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
		__COMMIT__: JSON.stringify(commitStamp())
	},
	build: { target: 'esnext' },
	worker: { format: 'es' },
	server: { headers: coiHeaders },
	preview: { headers: coiHeaders },
	resolve: {
		alias: {
			// icodec's index re-exports every codec, which would pull ~20 MB of
			// unrelated wasm (jxl/wp2/…) into the build. Deep-alias straight to
			// the needed modules — its exports map offers no public subpaths.
			'icodec-png': fileURLToPath(new URL('./node_modules/icodec/lib/png.js', import.meta.url)),
			'icodec-heic': fileURLToPath(new URL('./node_modules/icodec/lib/heic.js', import.meta.url)),
			'icodec-common': fileURLToPath(
				new URL('./node_modules/icodec/lib/common.js', import.meta.url)
			)
		}
	},
	optimizeDeps: {
		// ESM-only WASM packages: let Vite serve them as-is instead of prebundling,
		// which breaks their import.meta.url-relative .wasm lookups in dev.
		exclude: [
			'@jsquash/jpeg',
			'@jsquash/webp',
			'@jsquash/png',
			'@jsquash/oxipng',
			'@jsquash/avif',
			'@jsquash/resize',
			'icodec',
			'@okathira/ghostpdl-wasm',
			'gifsicle-wasm-browser',
			// Emscripten ESM whose .wasm we pass explicitly (fetch + wasmBinary);
			// prebundling would only re-root its import.meta.url for nothing.
			'7z-wasm'
		],
		// Lazily-imported deps (workers, dynamic imports) are otherwise discovered
		// mid-session, and Vite's "new dependencies optimized" full-reload would
		// interrupt a running compression in dev.
		include: [
			'svgo/browser',
			'gifenc',
			'pdf-lib',
			'pdfjs-dist',
			'fflate',
			'mediabunny',
			'@mediabunny/mp3-encoder',
			'@mediabunny/flac-encoder',
			'@mediabunny/aac-encoder',
			'utif2',
			// CJS — needs the esbuild CJS→ESM prebundle to load in a module worker.
			// The subpath exists via patches/fonteditor-core@2.6.3.patch (upstream
			// ships the woff2 module but forgot it in the exports map).
			'fonteditor-core/woff2'
		]
	},
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
