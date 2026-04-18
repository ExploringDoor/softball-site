// DVSL Service Worker — Step 1 (installable only, no aggressive caching yet)
//
// Registering a service worker is what makes the site installable as a PWA
// on iOS + Android. This worker intentionally does almost nothing beyond
// exist and claim the page — we are NOT caching pages yet because cached
// pages can serve stale data, which is bad for a live-scoring site.
//
// Phase 2 (future): add smart offline caching for schedule/standings/roster
// Phase 3 (future): add push-notification handling here

const VERSION = 'dvsl-v1';

self.addEventListener('install', (event) => {
  // Take control on first install without waiting for tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Wipe any old caches from previous versions
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Pass-through fetch handler. The mere presence of a fetch listener is what
// signals to the browser "this is a real PWA" and enables the install prompt.
self.addEventListener('fetch', (event) => {
  // Let the network handle everything for now.
  // Phase 2 will layer a stale-while-revalidate strategy on top.
});
