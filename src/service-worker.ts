/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/**
 * Offline/PWA cache. Strategy:
 * - install-time precache: the app shell (fingerprinted build minus wasm and
 *   bundled media), every prerendered page, and static/ files minus /og/ —
 *   a few MB, instant offline.
 * - runtime cache-first: fingerprinted assets incl. the big codec wasm
 *   (gs alone is ~15 MB — precaching it would bloat install for a codec the
 *   visitor may never use; it caches on first use instead) and the demo media.
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
// Agent-facing docs (the ~95 .md page twins, /llms*.txt, /.well-known/*) are
// prerendered too, but human visitors rarely fetch them — keep them out of the
// install precache (llms-full.txt alone is ~0.5 MB); the runtime cache still
// picks them up on first use.
const isAgentDoc = (path: string) =>
	path.endsWith('.md') || path.startsWith('/.well-known/') || path.startsWith('/llms');
// Bundled media follow the wasm rule: the homepage demo alone is ~11 MB of
// mp3/mp4/images a visitor may never scroll to — precaching it would turn the
// install into a ~25 MB background download. Runtime cache-first picks each
// file up on first real use. (Site webfonts are .woff2 — deliberately kept.)
const isHeavyAsset = (path: string) =>
	/\.(wasm|mp3|mp4|gif|jpe?g|png|webp|avif|ttf|otf)$/.test(path);

const PRECACHE = [
	...build.filter((path) => !isHeavyAsset(path)),
	...prerendered.filter((path) => !NEVER.has(path) && !isAgentDoc(path)),
	// static/og/* (~5 MB of social previews) is fetched only by scrapers,
	// which never run this service worker — precaching it is pure waste.
	...files.filter((path) => !path.startsWith('/og/'))
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

async function cacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const hit = await cache.match(request);
	if (hit) return hit;
	const response = await fetch(request);
	await cachePut(cache, request, response);
	return response;
}

async function networkFirstNavigation(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		await cachePut(cache, request, response);
		return response;
	} catch {
		// Offline: this page if we have it, else the home shell.
		const hit = (await cache.match(request)) ?? (await cache.match('/'));
		if (hit) return hit;
		throw new Error(`Offline and ${new URL(request.url).pathname} is not cached`);
	}
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (NEVER.has(url.pathname)) return;

	if (request.mode === 'navigate') {
		event.respondWith(networkFirstNavigation(request));
		return;
	}
	// Fingerprinted build assets (incl. lazily-fetched wasm) and static files
	// are immutable — cache-first is always correct for them.
	event.respondWith(cacheFirst(request));
});
