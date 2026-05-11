// ═════════════════════════════════════════════════════════════════════════
// LEAGUE CONFIG — per-deployment settings
// ═════════════════════════════════════════════════════════════════════════
//
// This file holds every value that differs between leagues. To spin up a new
// league, copy this file, change the values below, and deploy. Nothing else
// in the repo should hardcode league-specific data — everything reads from
// window.LEAGUE_CONFIG.
//
// Loaded first (before any other script or ES module) on every page. Also
// importScripts()'d by sw.js. See LEAGUE-SETUP.md for full spin-up steps.
//
// DO NOT add behavior here. This is data only. Logic goes in HTML/JS files
// that read these values.
// ═════════════════════════════════════════════════════════════════════════

(function () {
  var CONFIG = {
    // ── Identity ─────────────────────────────────────────────────────────
    id: 'dvsl',                                   // slug: used in cache names, storage keys
    name: 'DVSL',                                 // short display name (nav, titles, push)
    fullName: 'Delaware Valley Softball League',  // long display name (footers, manifest)

    // ── Season ───────────────────────────────────────────────────────────
    season: {
      year: 2026                                  // used by footers; structural refs still hardcoded
    },

    // ── Theme colors ─────────────────────────────────────────────────────
    // Inline color literals in CSS are NOT read from here — this is only
    // the source of truth for programmatic reads and future codemods.
    theme: {
      navy: '#002D72',
      gold: '#FFD700'
    },

    // ── Images ───────────────────────────────────────────────────────────
    images: {
      hero: 'bannersoftball.jpg',
      fieldBg: 'logos/field-bg.png'
    },

    // ── Contact ──────────────────────────────────────────────────────────
    contact: {
      name: 'Adam Miller',
      email: 'adam.miller.22@gmail.com'
    },

    // ── Firebase ─────────────────────────────────────────────────────────
    // Shared across all live pages EXCEPT live-score.html, which is pinned
    // to a separate Firebase project intentionally (legacy setup).
    firebase: {
      apiKey: 'AIzaSyDXuC-R0aPEX4F7lN5AKq48UC3r5whYzdg',
      authDomain: 'dvsl-292dd.firebaseapp.com',
      projectId: 'dvsl-292dd',
      storageBucket: 'dvsl-292dd.firebasestorage.app',
      messagingSenderId: '145862305559',
      appId: '1:145862305559:web:153ec455bad57e17517952',
      // measurementId enables Firebase Analytics. Without it, getAnalytics()
      // initializes but no page-view events flow to the Firebase Console.
      // Get this from Firebase Console → Project Settings → General →
      // "Your apps" → Web app config. Added 2026-05-09 to enable visitor
      // tracking after league email rollout.
      measurementId: 'G-HJV86E217K'
    },

    // ── Push / FCM ───────────────────────────────────────────────────────
    // VAPID public key — browser uses this to subscribe to FCM pushes.
    // adminSecret — shared secret the admin sends with push-send requests
    // so the /api/send-notification endpoint accepts them. Must match the
    // ADMIN_SEND_SECRET env var on the Vercel deployment. Client-visible
    // (embedded in admin.html bundle) — same posture as before.
    push: {
      vapidKey: 'BDTRzR0TDskGZ72K5Y_arFf_HaRdmNINcfDk41atLfeqNS-5HgMgK_Dv-plrR_o4jKk9dS2DJv7NIOvY6hIM9Q0',
      adminSecret: 'dvsl-push-2026-rkj3849f'
    },

    // ── League-specific data ─────────────────────────────────────────────
    // Field/venue list — where games are played. Used by admin scheduling
    // dropdowns. The companion FIELD_LOCATIONS map (below) is the single
    // source of truth for street addresses; keep the two in sync.
    fields: ['Mondauk 4', 'Mondauk 5', 'Lukens #2', 'Plymouth', 'Sunnybrook', 'Cedar Hill', 'Southampton', 'TBD'],

    // Field → street address. Used by saveEditGame (admin + captain) to
    // auto-fill `addr` whenever a games `field` changes, so calendar
    // events / map links always reflect the right venue. Adding a new
    // field? Add the address here too.
    fieldLocations: {
      'Mondauk 4':   '1452 Dillon Road, Ambler, PA 19034',
      'Mondauk 5':   '1452 Dillon Road, Ambler, PA 19034',
      'Lukens #2':   '540A Dresher Road, Horsham, PA 19044',
      'Plymouth':    '810 Germantown Pike, Plymouth Meeting, PA 19462',
      'Sunnybrook':  '2532 Long Meadow Road, Lansdale, PA 19446',
      'Cedar Hill':  '449 Cedar Hill Road, Ambler, PA 19002',
      'Southampton': 'Schafer Park, Gravel Hill and Industrial Blvd, Southampton, PA 18966',
      'TBD':         '',
    },

    // Team abbreviations that have a matching logo PNG in /logos/<abbr>.png.
    // Used only as a has-logo cache — any team not in this set falls back to
    // a text avatar. Update when you add a new team logo.
    logoTeams: ['aj', 'ba', 'bob', 'bor', 'bsb', 'bsmc', 'btbj', 'cha', 'dn', 'gjc', 'gold', 'ki', 'oa', 'sa', 'toast', 'tsbka', 'tsmc', 'tsg', 'tbimc', 'tbir']
  };

  // Works in both window (pages) and self (service worker) contexts.
  if (typeof window !== 'undefined') window.LEAGUE_CONFIG = CONFIG;
  if (typeof self   !== 'undefined') self.LEAGUE_CONFIG   = CONFIG;
})();
