/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/**
 * Offline/PWA cache. Strategy:
 * - install-time precache: the app shell (fingerprinted build minus wasm,
 *   codec-worker JS, and bundled media), the home page, and static/ files
 *   minus /og/ — ~2 MB. Other pages cache on first visit (network-first).
 * - runtime cache-first: fingerprinted assets incl. the big codec wasm
 *   (gs alone is ~15 MB — precaching it would bloat install for a codec the
 *   visitor may never use; it caches on first use instead), the codec-worker
 *   JS + pdf.js worker, and the demo media. The put is backgrounded via
 *   waitUntil so caching a 15 MB response never delays the job awaiting it.
 * - network-first navigations: HTML shells aren't fingerprinted, so online
 *   visitors always get the newest deploy; offline falls back to the cache.
 * - NEVER handled: robots.txt/sitemap.xml (host-dependent SEO endpoints must
 *   always hit the edge), non-GET, cross-origin.
 *
 * COOP/COEP invariant: responses are cached and served WHOLE (never a
 * synthesized `new Response(body)`), so the stored isolation headers keep
 * `crossOriginIsolated` true on cached/offline loads — threaded codecs
 * depend on it.
 */
import { build, files, prerendered, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const CACHE = `app-${version}`;
const NEVER = new Set(['/robots.txt', '/sitemap.xml']);
// Bundled media follow the wasm rule: the homepage demo alone is ~11 MB of
// mp3/mp4/images a visitor may never scroll to — precaching it would turn the
// install into a ~25 MB background download. Runtime cache-first picks each
// file up on first real use. (Site webfonts are .woff2 — deliberately kept.)
const isHeavyAsset = (path: string) =>
	// /tesseract + /tessdata: the OCR engine (~12 MB of .wasm.js cores) and its
	// language models — fetched on first OCR use only, never at install.
	/\.(wasm|mp3|mp4|gif|jpe?g|png|webp|avif|ttf|otf|traineddata|gz)$/.test(path) ||
	path.startsWith('/tesseract/') ||
	path.startsWith('/tessdata/');
// Compute-only JS loaded on demand: the codec worker entries + their chunks
// (mediabunny/video/svg alone are ~2 MB) and the pdf.js worker (~1.2 MB). Like
// the wasm they sit beside, they cache-first on first real use — precaching
// them added ~4.6 MB to the install that raced the visitor's first compress.
const isLazyCompute = (path: string) =>
	(path.includes('/workers/') && path.endsWith('.js')) || /\/pdf\.worker\.min\./.test(path);

const PRECACHE = [
	...build.filter((path) => !isHeavyAsset(path) && !isLazyCompute(path)),
	// Precache only the home shell, not all ~95 pages: every page's footer
	// carries the build commit stamp, so every page's HTML changes on every
	// deploy — precaching the full set re-downloaded ~3.5 MB of HTML into the
	// fresh version-keyed cache each release, most of it pages a visitor never
	// opens. Other pages cache on first visit (network-first put); an offline
	// visit to an unvisited page falls back to '/' (see networkFirstNavigation),
	// so '/' must stay precached. The .md twins / llms*.txt / .well-known docs
	// (agent-facing, rarely fetched by humans) are excluded for free.
	...prerendered.filter((path) => path === '/'),
	// static/og/* (~5 MB of social previews) is fetched only by scrapers,
	// which never run this service worker — precaching it is pure waste.
	...files.filter((path) => !path.startsWith('/og/') && !isHeavyAsset(path))
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => self.clients.claim())
	);
});

/** Cache only complete 200s — `cache.put` REJECTS partial 206es (media
 *  elements send Range requests), and a failed put must never take the
 *  response down with it (an awaited rejection would fail respondWith). */
async function cachePut(cache: Cache, request: Request, response: Response): Promise<void> {
	if (response.status !== 200) return;
	await cache.put(request, response.clone()).catch(() => {});
}

async function cacheFirst(event: FetchEvent): Promise<Response> {
	const cache = await caches.open(CACHE);
	const hit = await cache.match(event.request);
	if (hit) return hit;
	const response = await fetch(event.request);
	// Persist in the background: a worker awaiting ~15 MB of codec wasm must not
	// block on the disk write of the clone. waitUntil keeps the SW alive to
	// finish the put after the response has already streamed to its caller.
	event.waitUntil(cachePut(cache, event.request, response));
	return response;
}

async function networkFirstNavigation(event: FetchEvent): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(event.request);
		event.waitUntil(cachePut(cache, event.request, response));
		return response;
	} catch {
		// Offline: this page if we have it, else the home shell.
		const hit = (await cache.match(event.request)) ?? (await cache.match('/'));
		if (hit) return hit;
		throw new Error(`Offline and ${new URL(event.request.url).pathname} is not cached`);
	}
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (NEVER.has(url.pathname)) return;

	if (request.mode === 'navigate') {
		event.respondWith(networkFirstNavigation(event));
		return;
	}
	// Fingerprinted build assets (incl. lazily-fetched wasm) and static files
	// are immutable — cache-first is always correct for them.
	event.respondWith(cacheFirst(event));
});
