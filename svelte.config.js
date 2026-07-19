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
		// config: adapter-cloudflare writes (and rimrafs) the generated worker at
		// the `main` of the wrangler config it reads. Point it at a dedicated build
		// config so it never clobbers our negotiation wrapper (wrangler.jsonc's
		// `main: worker/index.js`). See wrangler.adapter.jsonc.
		adapter: adapter({ config: 'wrangler.adapter.jsonc', platformProxy: { persist: false } }),
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
					'sha256-Ibe0FrEc/Jsn9YP7+qVi1I1xh6uJZrU0e7pYmEDoWZ8='
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
				'/rar-to-zip',
				'/7z-to-zip',
				'/zip-to-7z',
				'/tar-gz-to-zip',
				'/iso-to-zip',
				'/zip-to-tar-gz',
				'/create-7z',
				'/create-tar',
				'/create-tar-gz',
				'/gzip-files',
				'/bzip2-files',
				'/xz-files',
				'/extract-rar',
				'/extract-7z',
				'/extract-tar-gz',
				'/extract-gz',
				'/extract-iso',
				'/extract-cab',
				'/extract-deb',
				'/extract-rpm',
				'/extract-cpio',
				'/extract-lha',
				'/extract-arj',
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
				'/svg-to-ico',
				'/font-converter',
				'/ttf-to-woff2',
				'/ttf-to-woff',
				'/otf-to-woff2',
				'/otf-to-woff',
				'/woff-to-ttf',
				'/woff-to-otf',
				'/woff-to-woff2',
				'/woff2-to-ttf',
				'/woff2-to-otf',
				'/woff2-to-woff',
				'/ttf-to-eot',
				'/eot-to-ttf',
				'/subset-font',
				'/variable-font-to-static',
				'/flac-to-mp3',
				'/wav-to-flac',
				'/opus-to-mp3',
				'/ogg-to-mp3',
				'/aac-to-mp3',
				'/mp3-to-wav',
				'/mp4-to-wav',
				'/compress-avif',
				'/jpg-to-avif',
				'/png-to-avif',
				'/webp-to-avif',
				'/avif-to-png',
				'/heic-to-avif',
				'/gif-to-webp',
				'/heic-to-webp',
				'/tiff-to-png',
				'/bmp-to-png',
				'/webm-to-mp3',
				'/mov-to-mp3',
				'/mp3-to-m4a',
				'/wav-to-m4a',
				'/mp3-to-ogg',
				'/wav-to-opus',
				'/create-tar-bz2',
				'/create-tar-xz',
				'/extract-z',
				'/remove-audio-from-video',
				'/png-to-svg',
				'/jpg-to-svg',
				'/raw-to-jpg',
				'/cr2-to-jpg',
				'/nef-to-jpg',
				'/arw-to-jpg',
				'/dng-to-jpg',
				'/image-to-text',
				'/ocr-pdf',
				'/rotate-pdf',
				'/watermark-pdf',
				'/pdf-page-numbers',
				'/pdf-to-text',
				'/grayscale-pdf',
				'/pdf-to-pdfa',
				'/srt-to-vtt',
				'/vtt-to-srt',
				'/ass-to-srt',
				'/jxl-to-jpg',
				'/jpg-to-jxl',
				'/compress-jxl',
				'/psd-to-jpg',
				'/psd-to-png',
				'/compress-epub',
				'/compress-cbz',
				'/cbr-to-cbz',
				'/epub-to-txt',
				'/cbz-to-pdf',
				'/cbr-to-pdf',
				'/compress-glb',
				'/csv-to-xlsx',
				'/xlsx-to-csv',
				'/json-to-yaml',
				'/yaml-to-json'
			]
		}
	}
};

export default config;
