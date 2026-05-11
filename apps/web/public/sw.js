// ============================================================
// Fuelyn — Service Worker KILL-SWITCH
//
// Strategies (deliberately conservative):
//   • App shell (HTML, manifest, icons): network-first with a
//     2-second timeout, falling back to the precached copy. This
//     gives users a working UI when offline without serving stale
//     pages whenever the network is online.
//   • Static assets (/_next/static, fonts, /icon.svg): cache-first
//     with stale-while-revalidate. Webpack-hashed URLs make this
//     safe — any version bump produces a new URL.
//   • Map tiles (basemaps.cartocdn.com, tile.openstreetmap.org):
//     cache-first with a 50 MB LRU cap. Tiles change rarely and
//     are expensive to refetch on a phone.
//   • API responses (/api/...): NEVER cached. The BFF handles its
//     own freshness via Cache-Control headers; the client should
//     respect those without an opaque SW intercept.
//
// Versioning:
//   Bump CACHE_VERSION on any cache-key-affecting change. The
//   activate handler purges any caches NOT in EXPECTED_CACHES,
//   so a bump cleanly evicts old generations.
// ============================================================

/* eslint-env serviceworker */

const CACHE_VERSION = 'fuelyn-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const TILES_CACHE = `${CACHE_VERSION}-tiles`;
const EXPECTED_CACHES = new Set([SHELL_CACHE, STATIC_CACHE, TILES_CACHE]);

// Pre-cache the absolute minimum so a cold offline launch shows
// at least the shell + manifest + the SVG icon. Bigger pre-caches
// inflate install time without measurable benefit on this app.
const SHELL_PRECACHE = ['/', '/manifest.json', '/icon.svg'];

// Hard cap so a long road trip doesn't fill the user's storage
// quota with map tiles.
const TILE_CACHE_MAX_ENTRIES = 800;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Use addAll() with try/catch so a single 404 (e.g. on a future
      // route rename) doesn't abort the entire install.
      await Promise.all(
        SHELL_PRECACHE.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            // Best-effort.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (EXPECTED_CACHES.has(k) ? Promise.resolve() : caches.delete(k))),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept BFF/API calls — keep the cache out of the way of
  // the freshness-critical hot path. Same for SSE streams (Accept:
  // text/event-stream) which would break inside the cache.
  if (url.pathname.startsWith('/api/')) return;
  if (req.headers.get('accept') === 'text/event-stream') return;

  // Map tiles → cache-first with LRU prune.
  if (
    url.hostname.endsWith('basemaps.cartocdn.com') ||
    url.hostname.endsWith('tile.openstreetmap.org') ||
    url.hostname.endsWith('tile.opentopomap.org') ||
    url.hostname === 'server.arcgisonline.com'
  ) {
    event.respondWith(cacheFirst(req, TILES_CACHE, { lruCap: TILE_CACHE_MAX_ENTRIES }));
    return;
  }

  // Hashed static bundles → cache-first with stale-while-revalidate.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/static/')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Top-level navigations + manifest → network-first with timeout.
  if (req.mode === 'navigate' || url.pathname === '/manifest.json') {
    event.respondWith(networkFirst(req, SHELL_CACHE, 2000));
    return;
  }

  // Default: pass through to network.
});

async function cacheFirst(request, cacheName, options = {}) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // Stale-while-revalidate kick — fire and forget.
    fetch(request)
      .then((res) => {
        if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
      })
      .catch(() => {});
    return cached;
  }
  const fresh = await fetch(request);
  if (fresh && fresh.ok) {
    cache.put(request, fresh.clone()).catch(() => {});
    if (options.lruCap) trimCache(cacheName, options.lruCap).catch(() => {});
  }
  return fresh;
}

async function networkFirst(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await Promise.race([
      fetch(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('network-timeout')), timeoutMs),
      ),
    ]);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last resort: a minimal offline shell. Returning a synthetic
    // Response is gentler than letting the navigation error out.
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
        '<body style="font-family:sans-serif;padding:24px;text-align:center">' +
        '<h1>Offline</h1><p>Wir haben deine letzten Daten gecached — sobald du wieder online bist, lädt sich Fuelyn neu.</p></body>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  // FIFO eviction — keys() returns insertion-ordered.
  const overflow = keys.length - maxEntries;
  await Promise.all(keys.slice(0, overflow).map((k) => cache.delete(k)));
}
