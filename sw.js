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

// ── RAW push handling — no Firebase SDK in the SW ──
//
// v18 diagnostic showed onBackgroundMessage NEVER fires on iOS PWA even
// with data-only pushes: FCM's SW-side SDK intercepts the push event,
// auto-displays a banner, and never calls our callback. Solution: don't
// load the FCM SDK in the SW at all. Handle the raw `push` event.
//
// FCM's getToken() on the page side just calls pushManager.subscribe on
// our registration — it doesn't require firebase-messaging code IN the
// SW, only that the SW is registered. So we can own the push pipeline.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}

  // FCM HTTP v1 delivers the `data` object at payload.data. Some FCM paths
  // also wrap in FCM_MSG — handle both.
  const d =
    (payload && payload.data) ||
    (payload && payload.FCM_MSG && payload.FCM_MSG.data) ||
    payload ||
    {};
  const rawUrl = d.url;
  const title  = d.title || 'DVSL';
  const body   = d.body || '';
  const url    = rawUrl || '/';

  event.waitUntil((async () => {
    try {
      const cache = await caches.open('dvsl-pending-nav');
      const info = {
        url: rawUrl == null ? null : String(rawUrl),
        ts: Date.now(),
        keys: Object.keys(d),
        source: 'raw-push',
      };
      await cache.put(
        new Request('/__dvsl_push_info'),
        new Response(JSON.stringify(info), { headers: { 'content-type': 'application/json' } })
      );
    } catch (_) {}
    await self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'dvsl-push',
      renotify: true,
      data: { url },
    });
  })());
});

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

  // We set data ourselves in onBackgroundMessage, so it's just {url}.
  const rawUrl = (event.notification.data && event.notification.data.url) || '/';

  // Resolve against this SW's origin so relative paths ("/team-chat.html?...")
  // work and we can compare pathname+search against any open DVSL tab.
  const target = new URL(rawUrl, self.location.origin);

  event.waitUntil((async () => {
    // DIAGNOSTIC: write click count + URL + timestamp to cache EVERY time.
    // The page polls this and renders it in the version badge so we can
    // see from the phone whether this handler is even firing.
    try {
      const cache = await caches.open('dvsl-pending-nav');
      // Read existing counter
      let n = 0;
      try {
        const prev = await cache.match('/__dvsl_click_count');
        if (prev) n = parseInt(await prev.text(), 10) || 0;
      } catch (_) {}
      n += 1;
      await cache.put(
        new Request('/__dvsl_click_count'),
        new Response(String(n), { headers: { 'content-type': 'text/plain' } })
      );
      await cache.put(
        new Request('/__dvsl_pending_nav'),
        new Response(target.href, { headers: { 'content-type': 'text/plain' } })
      );
      await cache.put(
        new Request('/__dvsl_last_click_ts'),
        new Response(String(Date.now()), { headers: { 'content-type': 'text/plain' } })
      );
    } catch (_) {}

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

    // 2. postMessage every in-scope client as a fast path.
    for (const c of allClients) {
      try {
        const cu = new URL(c.url);
        if (cu.origin === target.origin) {
          try { c.postMessage({ type: 'NAVIGATE', url: target.href }); } catch (_) {}
        }
      } catch (_) {}
    }

    // 3. openWindow brings the PWA to foreground. Page polling picks up
    //    the pending URL from Cache API and navigates there.
    return clients.openWindow(target.href);
  })());
});

const VERSION = 'dvsl-v35-tabbar-inbox-sort-notifs';
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
  '/inbox.html',
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
// Only delete caches that are OLD versions of ours (prefix dvsl-core- or
// dvsl-runtime-) — NEVER touch ancillary caches like dvsl-pending-nav that
// other parts of the SW may rely on across version changes.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) =>
              (k.startsWith('dvsl-core-') || k.startsWith('dvsl-runtime-')) &&
              k !== CORE_CACHE && k !== RUNTIME_CACHE
            )
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
