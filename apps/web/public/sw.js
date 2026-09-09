// Minimal service worker: precache a handful of small, stable app-shell assets and serve them
// cache-first, network-first everything else (falling back to /offline.html for navigations).
//
// Vite's hashed JS/CSS bundle and index.html are NOT precached here — their filenames/content
// change on every build, so a stale cache would silently serve an old build. Only assets that
// rarely change and are safe to serve stale (icons, the manifest, the static favicon) are
// precached.
//
// To bump: change CACHE_VERSION below. That produces a new cache name, so the browser installs
// a fresh service worker, repopulates the new cache, and the activate handler deletes every old
// 6mansdle-shell-* cache. Bump it whenever PRECACHE_URLS changes or a precached file's contents
// change on disk without a new filename.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `6mansdle-shell-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/favicon.svg',
  '/og.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept the API or cross-origin requests (clip playback URLs point at S3/CDN, not
  // this origin) — those must always hit the network.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Page navigations: network-first, so a deployed update is picked up immediately, with a
  // small offline page as the fallback when there's no connection.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html').then((res) => res || Response.error())),
    );
    return;
  }

  // The small set of precached shell assets: cache-first, since they're static and safe to
  // serve stale until the next CACHE_VERSION bump.
  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
