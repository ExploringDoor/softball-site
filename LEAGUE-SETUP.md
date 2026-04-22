# Spinning up a second league

This repo powers one deployment today (DVSL). All per-league values live in
`config.js`. To run a second league on the same codebase, you copy the repo,
swap `config.js`, and deploy to a new domain. The two sites will share code
but nothing else — separate Firebase projects, separate data, separate users.

## The short version

1. **Clone the repo** to a new folder / new GitHub repo.
2. **Create a new Firebase project** (console.firebase.google.com → Add project).
   Enable Firestore, Authentication, Cloud Messaging. Note the project's config
   values (API key, project ID, messagingSenderId, appId).
3. **Generate a new VAPID key pair** in Firebase → Project settings → Cloud
   Messaging → Web Push certificates → Generate key pair. Copy the public key.
4. **Pick a new admin secret** — any long random string. This is the shared
   secret between the client and the push-send API. Keep it off GitHub except
   inside `config.js` (which ships to the browser, same posture as today).
5. **Edit `config.js`** with the values from steps 2–4 plus the league's name,
   colors, field list, team list, commissioner info. That's the only file you
   have to edit to stand up the new league.
6. **Set Vercel env vars** on the new deployment:
   - `ADMIN_SEND_SECRET` — must match `config.push.adminSecret`
   - `FIREBASE_SERVICE_ACCOUNT` — JSON for the new Firebase project's admin SDK
   - `ADMIN_EMAIL` — commissioner email for admin push alerts
   - `RESEND_API_KEY` — if you're using Resend for email
7. **Deploy to a new domain** (Vercel → Add project → point at the new repo).

That's it. No other code changes required for identical functionality.

## What's in `config.js`

```js
window.LEAGUE_CONFIG = {
  id: 'dvsl',                          // slug — used in cache names, storage keys
  name: 'DVSL',                        // short name (nav, titles, push)
  fullName: 'Delaware Valley Softball League',
  season: { year: 2026 },              // footers only — structural refs still hardcoded (see below)
  theme: { navy: '#002D72', gold: '#FFD700' },
  images: { hero: 'bannersoftball.jpg', fieldBg: 'logos/field-bg.png' },
  contact: { name: 'Adam Miller', email: 'adam.miller.22@gmail.com' },
  firebase: { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId },
  push:     { vapidKey, adminSecret },
  fields:   ['Mondauk 4', 'Mondauk 5', ...],   // venue dropdown list
  logoTeams: ['aj','ba','bob',...]             // team abbrs that have /logos/<abbr>.png
};
```

Every live HTML page loads this file via `<script src="/config.js"></script>`
before anything else. The service worker `importScripts('/config.js')` at its
top.

## What's still hardcoded (known limitations)

The initial refactor moved the high-leverage stuff. A few things still require
code edits — **document these and bump them to config.js when league #2 needs
them**:

1. **League name in prose** — the rulebook (rules.html), waiver text
   (registration.html), photo captions (photos.html), and footer copyright
   lines still say "DVSL" literally. Change these per-league by hand, OR lift
   them to config in a later pass.
2. **Year 2026 is structural.** DOM ids like `yr-2026`, `tbody-2026`, the
   function `buildStand2026`, and `.ics` date-builders all hardcode 2026.
   Bumping the season to 2027 is a hunt-and-replace job, not a config edit.
3. **Inline color literals.** `#002D72` (navy) appears as a raw hex value in
   hundreds of inline styles and CSS rules. The CSS custom property `--navy`
   is the right way to address this, but most files don't use it consistently.
   A proper re-theme is a codemod pass, not a config swap.
4. **Branded asset filenames.** Files like `/dvsl-logo-dark.png`,
   `/dvsl-hero.png`, `/bannersoftball.jpg` are referenced literally. Replace
   the files or rename them in a later pass.
5. **`live-score.html` has its own Firebase config.** Intentional — it's
   pinned to a separate FCM app registration within the same project. If
   you're cloning to a new league, swap this block manually too.
6. **`api/notify-admin.js`** contains `DVSL <onboarding@resend.dev>` as the
   from-line. Edit by hand per league.

## Re-deploying DVSL

Nothing about DVSL's deployment changes. `config.js` is pre-filled with DVSL's
values, so pushing any commit on `main` deploys the same site with the same
behavior. The `dvsl-v95-monorepo-config` SW version will replace any older SW
on the first visit after deploy.

## Quick sanity check after deploy

Open the site, then in browser DevTools console:

```js
console.log(window.LEAGUE_CONFIG);
```

Should print the full config object for that deployment. If it's `undefined`,
`/config.js` isn't loading (check the Network tab; should return 200 with the
right Content-Type for a `.js` file).
