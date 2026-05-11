// ============================================================
// Fuelyn — Service Worker KILL-SWITCH
//
// Purpose: unregister any prior service worker version and purge
// every cache it left behind. The previous SW (v3) is the root
// cause of:
//   • stale HTML served with outdated CSP nonces / strict-dynamic
//   • map-tile fetches intercepted against an old connect-src list
//   • manifest/icon Response-coercion crashes when subresources fail
//
// This file installs immediately, activates immediately, deletes
// all caches, fully unregisters itself, and stops handling any
// future fetches. After one reload the app runs straight off the
// network with the current server-side CSP and routes.
//
// To re-introduce offline-first behaviour later, replace this file
// with a fresh `sw.js` that bumps `CACHE_VERSION` and re-implements
// the desired strategies.
// ============================================================

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();

      // Force every controlled tab to reload so they pick up the
      // network-fresh HTML (with the new CSP and routes).
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try {
          client.navigate(client.url);
        } catch {
          // Some browsers reject same-origin navigate(); ignore.
        }
      }
    })(),
  );
});

// Pass-through for any in-flight fetch that arrives before unregister
// completes. We deliberately do NOT call event.respondWith() so the
// browser handles the request natively.
self.addEventListener('fetch', () => {});
