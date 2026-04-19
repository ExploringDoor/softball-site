// DVSL Service Worker — offline mode + push notifications
//
// Strategy:
//   - Firestore / Firebase API calls  → network-only, never cache (live data)
//   - HTML navigations                → network-first, fall back to cache,
//                                        then fall back to offline.html
//   - Static same-origin assets       → stale-while-revalidate
//                                        (logos, icons, manifest, etc.)
//   - Cross-origin (gstatic, etc.)    → stale-while-revalidate
//
// IMPORTANT: This SW also handles FCM push notifications. We do this in ONE
// SW (rather than a separate firebase-messaging-sw.js) because on iOS PWA,
// two SWs competing at scope "/" cause the push subscription to be silently
// invalidated on each page load. One SW = stable push subscription.

// ── FCM push handling (loaded at top so install event can reference it) ──
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDXuC-R0aPEX4F7lN5AKq48UC3r5whYzdg",
  authDomain: "dvsl-292dd.firebaseapp.com",
  projectId: "dvsl-292dd",
  storageBucket: "dvsl-292dd.firebasestorage.app",
  messagingSenderId: "145862305559",
  appId: "1:145862305559:web:153ec455bad57e17517952"
});

// Calling firebase.messaging() is required so FCM wires up its push event
// listener inside this SW. We intentionally do NOT define onBackgroundMessage
// here — when the FCM payload contains a top-level `notification` block, the
// SDK auto-displays it once. Adding onBackgroundMessage caused a duplicate
// banner. One banner = the right behavior.
firebase.messaging();

// Respond to version queries from page scripts so they can render a
// small SW-version badge (proves which build is actually live on the
// phone — useful for debugging iOS PWA update lag).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    try { event.source?.postMessage({ type: 'VERSION', version: VERSION }); } catch (_) {}
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  // FCM payload includes the target URL in TWO places depending on how the
  // notification was built:
  //   - event.notification.data.url     ← our own /api/send-notification
  //   - event.notification.data.FCM_MSG.notification.click_action (rare)
  // Fall back to '/' if neither exists.
  const data = event.notification.data || {};
  const fcm = data.FCM_MSG?.notification || {};
  const rawUrl = data.url || fcm.click_action || fcm.fcmOptions?.link || '/';

  // Resolve against this SW's origin so relative paths ("/team-chat.html?...")
  // work and we can compare pathname+search against any open DVSL tab.
  const target = new URL(rawUrl, self.location.origin);

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });

    // 1. If a tab is already open at the exact target URL → just focus it.
    for (const c of allClients) {
      try {
        const cu = new URL(c.url);
        if (cu.origin === target.origin && cu.pathname === target.pathname && cu.search === target.search) {
          return c.focus();
        }
      } catch (_) {}
    }

    // 2. Belt-and-suspenders: tell every in-scope client via postMessage to
    //    navigate to the target URL. On iOS standalone PWAs, client.navigate()
    //    silently no-ops — postMessage + window.location.href is the only
    //    reliable way to move a backgrounded PWA.
    for (const c of allClients) {
      try {
        const cu = new URL(c.url);
        if (cu.origin === target.origin) {
          try { c.postMessage({ type: 'NAVIGATE', url: target.href }); } catch (_) {}
        }
      } catch (_) {}
    }

    // 3. ALWAYS call openWindow. On iOS installed PWAs, openWindow() to an
    //    in-scope URL brings the existing standalone window forward AND
    //    navigates it — which is exactly what we want. On Chrome/Android it
    //    opens a new tab if none exists, or refocuses+navigates if one does.
    //    If a matching window was already open (step 1), we returned early
    //    above, so this only runs when we actually need movement.
    return clients.openWindow(target.href);
  })());
});

const VERSION = 'dvsl-v12-openwin';
const CORE_CACHE = `dvsl-core-${VERSION}`;
const RUNTIME_CACHE = `dvsl-runtime-${VERSION}`;

// Team codes used across schedule.html / stats.html / standings / index.
// Logos are referenced dynamically as `logos/<code>.svg` or `logos/<code>.png`,
// so stale-while-revalidate won't pre-populate them. We precache both forms
// up-front so they render on the very first offline visit.
const TEAM_CODES = [
  'aj','ba','ba1','bami','bob','boo','bor','bsb','bsmc','btbj','cha','dn',
  'gjc','gold','ka','ki','oa','os','sa','tbi1','tbimc','tbir','ti','tsbka',
  'tsg','tsmc',
];
const LOGO_URLS = [];
TEAM_CODES.forEach((c) => {
  LOGO_URLS.push(`/logos/${c}.svg`);
  LOGO_URLS.push(`/logos/${c}.png`);
});

// Precache the public "shell" — pages a fan might want to pull up at the
// field with no signal. Intentionally excludes admin / captain / scorer /
// player / registration / live-score (those need live Firestore data).
const CORE_URLS = [
  '/',
  '/index.html',
  '/schedule.html',
  '/stats.html',
  '/leaders.html',
  '/standings-history.html',
  '/playoffs.html',
  '/rules.html',
  '/photos.html',
  '/watch.html',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/logos/glove.png',
  '/dvsl-hero.png',
  '/dvsl-logo-dark.png',
  '/dvsl-logo-glass.png',
  ...LOGO_URLS,
];

// ---- install: warm the core cache -----------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) =>
      // Use addAll with individual catches so one 404 doesn't kill the install.
      Promise.all(
        CORE_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// ---- activate: wipe old caches --------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CORE_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ---- helpers --------------------------------------------------------------
function isFirebaseRequest(url) {
  const h = url.hostname;
  return (
    h.endsWith('googleapis.com') ||
    h.endsWith('firebaseio.com') ||
    h.endsWith('firebase.com') ||
    h.endsWith('firebaseapp.com') ||
    h.endsWith('firestore.googleapis.com') ||
    h.endsWith('identitytoolkit.googleapis.com')
  );
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

// Pages that are useless without fresh Firestore data — don't even try to
// serve a cached version of these, just fall through to the network.
function isLiveDataPage(pathname) {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/captain') ||
    pathname.startsWith('/scorer') ||
    pathname.startsWith('/player') ||
    pathname.startsWith('/registration') ||
    pathname.startsWith('/live-score') ||
    pathname.startsWith('/notifications') ||
    pathname.startsWith('/gcal-sync') ||
    pathname.startsWith('/firebase-') ||
    pathname.startsWith('/dvsl-admin') ||
    pathname.startsWith('/tbir-stats') ||
    pathname.startsWith('/league-site')
  );
}

// network-first, fall back to cache, then offline.html
async function htmlNetworkFirst(request) {
  try {
    const netResp = await fetch(request);
    // Only cache successful, basic responses
    if (netResp && netResp.ok && netResp.type === 'basic') {
      const copy = netResp.clone();
      caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy)).catch(() => {});
    }
    return netResp;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match('/offline.html');
    if (offline) return offline;
    // Last resort: re-throw so browser shows its own error
    throw err;
  }
}

// stale-while-revalidate for static assets
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((resp) => {
      if (resp && resp.ok) cache.put(request, resp.clone()).catch(() => {});
      return resp;
    })
    .catch(() => null);
  return cached || (await networkFetch) || new Response('', { status: 504 });
}

// ---- fetch router ---------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GETs. Firestore writes go through POST/PATCH and must never
  // be intercepted.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Skip Firestore / Firebase traffic entirely — let it go straight to the
  // network so live data never gets stale.
  if (isFirebaseRequest(url)) return;

  // Skip our own /api/* serverless routes (notify-admin, etc.) — network only.
  if (isApiRequest(url)) return;

  // HTML navigations
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    // For live-data pages, still network-first but don't bother caching —
    // a stale admin / captain / scorer shell is worse than a real offline msg.
    if (url.origin === self.location.origin && isLiveDataPage(url.pathname)) {
      event.respondWith(
        fetch(req).catch(async () => {
          const offline = await caches.match('/offline.html');
          return offline || new Response('Offline', { status: 503 });
        })
      );
      return;
    }
    event.respondWith(htmlNetworkFirst(req));
    return;
  }

  // Static same-origin assets (images, JSON, CSS, fonts) → stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Cross-origin (e.g. gstatic, firebasejs CDN) → stale-while-revalidate too
  event.respondWith(staleWhileRevalidate(req));
});
