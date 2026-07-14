/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/**
 * Offline/PWA cache. Strategy:
 * - install-time precache: the app shell (fingerprinted build minus wasm),
 *   every prerendered page, and static/ files — a few MB, instant offline.
 * - runtime cache-first: fingerprinted assets incl. the big codec wasm
 *   (gs alone is ~15 MB — precaching it would bloat install for a codec the
 *   visitor may never use; it caches on first use instead).
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
// Agent-facing docs (the ~95 .md page twins, /.well-known/*) are prerendered
// too, but human visitors rarely fetch them — keep them out of the install
// precache; the runtime cache still picks them up on first use.
const isAgentDoc = (path: string) => path.endsWith('.md') || path.startsWith('/.well-known/');

const PRECACHE = [
	...build.filter((path) => !path.endsWith('.wasm')),
	...prerendered.filter((path) => !NEVER.has(path) && !isAgentDoc(path)),
	...files
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

async function cacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const hit = await cache.match(request);
	if (hit) return hit;
	const response = await fetch(request);
	if (response.ok) await cache.put(request, response.clone());
	return response;
}

async function networkFirstNavigation(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	try {
		const response = await fetch(request);
		if (response.ok) await cache.put(request, response.clone());
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
