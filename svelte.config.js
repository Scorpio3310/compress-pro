import adapter from '@sveltejs/adapter-cloudflare';
import { relative, sep } from 'node:path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, execept for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		// persist: false — the app has no stateful bindings (ASSETS only), and the
		// default on-disk .wrangler/state SQLite can crash workerd on CI (SQLITE_BUSY).
		adapter: adapter({ platformProxy: { persist: false } }),
		csp: {
			// Prerendered pages (all of them) get per-page script hashes in a
			// <meta http-equiv> tag; dev + runtime-rendered 404s get a header with
			// nonces. frame-ancestors can't ride in a meta tag — the root _headers
			// file carries it for static pages.
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				// wasm-unsafe-eval: WebAssembly.instantiate is blocked by 'self'
				// alone; gifsicle even compiles wasm inside a blob: worker that
				// inherits this document policy. The sha256 is the app.html
				// theme-init script (pinned by src/lib/csp-hash.test.ts) — kit
				// only hashes its own hydration script, not app.html's.
				'script-src': [
					'self',
					'wasm-unsafe-eval',
					'sha256-wUiu1icdgmmYsLeFT/LSXKVTnz5o9eUbN+MmRcnTTmI='
				],
				// blob:: gifsicle-wasm-browser and fflate spawn blob: workers.
				'worker-src': ['self', 'blob:'],
				// unsafe-inline: Svelte transitions inject <style> elements and
				// style= attributes can't be hash-allowed. Keep script-src free of
				// unsafe-inline or kit stops emitting hashes.
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'blob:', 'data:'], // blob: previews; data: svg in built CSS
				'media-src': ['self', 'blob:'], // video/audio previews from object URLs
				'font-src': ['self', 'data:'], // woff2 files + one Vite-inlined data: subset
				// data:: fetch('data:…') is a local decode, not a network destination —
				// harmless to allow, and the e2e file-injection helpers depend on it.
				'connect-src': ['self', 'blob:', 'data:'],
				'manifest-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['none'],
				'frame-src': ['none'],
				// Ignored in the meta variant; effective on runtime-rendered pages.
				'frame-ancestors': ['none']
			}
		},
		prerender: {
			origin: 'https://compress-pro.com',
			// [[tool=tool]] is a dynamic route, so its pages are not auto-entered.
			// Keep this list in sync with FORMATS + CONVERTERS + TOOLS in src/lib/seo.ts.
			entries: [
				'*',
				'/',
				'/compress-jpg',
				'/compress-png',
				'/compress-webp',
				'/compress-gif',
				'/compress-heic',
				'/compress-svg',
				'/compress-pdf',
				'/compress-video',
				'/remove-exif',
				'/heic-to-jpg',
				'/webp-to-jpg',
				'/webp-to-png',
				'/avif-to-jpg',
				'/png-to-jpg',
				'/jpg-to-webp',
				'/png-to-webp',
				'/jpg-to-pdf',
				'/pdf-to-jpg',
				'/mov-to-mp4',
				'/webm-to-mp4',
				'/mkv-to-mp4',
				'/mp4-to-webm',
				'/unlock-pdf',
				'/protect-pdf',
				'/video-to-gif',
				'/gif-to-mp4',
				'/compress-audio',
				'/mp4-to-mp3',
				'/wav-to-mp3',
				'/bmp-to-jpg',
				'/tiff-to-jpg',
				'/png-to-ico',
				'/zip-files',
				'/merge-pdf',
				'/split-pdf',
				'/compress-mp4',
				'/compress-mov',
				'/resize-image',
				'/png-to-pdf',
				'/mp4-to-gif',
				'/pdf-to-png',
				'/heic-to-png',
				'/m4a-to-mp3',
				'/compress-image',
				'/compress-jpg-to-100kb',
				'/jpg-to-ico',
				'/svg-to-png',
				'/svg-to-ico'
			]
		}
	}
};

export default config;
