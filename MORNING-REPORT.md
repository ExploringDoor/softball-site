# Overnight bug-audit report — Apr 21, 2026

Adam, I ran a deep read-only audit of the site tonight (scorer, profile, index,
admin, registration, inbox). I fixed the unambiguous bugs and left the
judgment-call stuff here for you to decide in the morning. Nothing below is
fixed yet.

---

## What I fixed last night (shipped in v96)

Each fix is a separate commit so any single one can be reverted cleanly.

### Data-correctness

- **profile.html team chat was capped at OLDEST 100 messages.** Queries used
  `orderBy('timestamp','asc'), limit(100)`. Once a team crossed 100 messages
  the 101st never appeared and it looked broken. Now desc + reverse. Same
  fix applied to the captain team-chat and captains-chat feeds.
- **Ties were never recorded in the standings recalc.** `ti` field was never
  incremented, no `T` pushed to the results array. Tie games counted as
  "nothing" — no W, no L. A single tie would silently drift PCT/points. Fixed
  to count ties and write `ti` to the team doc. Also added a guard to skip
  games whose score fields are null (previously treated as a 0-0 tie on
  recalc — would corrupt standings if any game ever had a null score).
- **OBP formula in index.html ignored sacrifice flies.** Was
  `(H+BB)/(AB+BB)`; now `(H+BB)/(AB+BB+SF)` in both spots (batting-only and
  the overlay onto PLAYERS). Players with SF had inflated OBP.

### Scorer.html correctness

- **HR double-counted the batter's AB.** `endAtBat` increments AB at the top
  for any hit (including HR); then the HR animation callback ran another
  `stats.ab++` when the animation finished. Removed the duplicate.
- **Errors (reached-on-error) double-counted AB** the same way. Fixed.
- **HBP and CI were being routed into the walk branch**, crediting the batter
  a BB (wrong) and the pitcher a BB (wrong). Split HBP/CI into their own
  walk-types:
    - HBP → batter gets `hbp++`, pitcher gets `hbp++`
    - CI  → batter gets no stat (reached on interference), pitcher is not charged
    - IW  → still counts as a walk (slow-pitch convention)
  Runner-advance logic (forcing runners home from loaded bases) still mirrors
  a walk for all three. Playlog now says "HBP — Hit by pitch" / "CI — Catcher
  interference" instead of mislabelling everything as "Walk".

### Admin.html correctness

- **approveScore didn't clear the conflict flag.** An approved game still
  showed as disputed on the Scores tab. Now also writes `score_conflict:false,
  score_pending:false, score_confirmed:true, has_discrepancy:false`.
- **saveOneStanding would wipe a captain's password if the field was empty.**
  The guard `if (pw !== undefined)` was always true because `.value.trim()`
  returns a string. Fixed to `if (pw)` — empty input no longer writes.
  To explicitly *clear* a password now you have to do it from Firebase
  directly (or we can add a dedicated clear button later).

### Service worker

- Bumped `sw.js` VERSION to `${LEAGUE.id}-v96-bug-audit-fixes` so all open
  devices pick up the fixes on their next visit.

---

## Gray-area stuff — your call

Ranked by "how likely is this to upset a user." Each one I think should
probably be fixed, but the fix involves a trade-off and I didn't want to
make the call unilaterally.

### 1. `enterAdminNoPass` backdoor on admin.html (CRITICAL)

There's a link labeled "Enter admin without password (read-only)" on the
admin login screen. It does **not** actually gate anything read-only — a
session entered that way has full write access to every Firestore
collection. Anyone who finds /admin.html and clicks the link can edit
standings, delete players, send push notifications, etc.

**Options:**
- (a) Remove the link entirely — requires real login every time.
- (b) Add a `READ_ONLY` flag that's checked at the top of every
  `window.save*/delete*/approve*` function. Lots of touchpoints (~80).
- (c) Gate on Firebase security rules server-side (best, but broader).

My recommendation: (a). Fastest, least risky, matches the security posture
you'd expect. The link was probably useful when you were iterating on the
site solo, but it's a liability now.

### 2. No admin email allowlist (CRITICAL)

`onAuthStateChanged` in admin.html treats any signed-in Firebase Auth user
as commissioner. There's no check that the email is yours. If any captain
ever gets a Firebase Auth record (via password reset flows or similar),
they would get the full commissioner dashboard.

**Fix:** Add an ADMIN_EMAILS allowlist (just your email for now) at
admin.html ~line 2157. Sign them out if they aren't on the list.

### 3. MailerLite bearer token hardcoded in registration.html (CRITICAL)

At registration.html:1024 — the MailerLite API bearer token is baked into
the public HTML. Anyone can `curl` the page and harvest it. Someone
grabbing it could spam your list or get your MailerLite account flagged.

**Fix:** Move the MailerLite call to a server route (e.g.
`/api/mailerlite-subscribe`) with the token in a Vercel env var.

### 4. Registrations tab reads the WRONG collection (CRITICAL)

admin.html's Registrations tab reads `player_signups`. registration.html
writes new signups to `players`. The Registrations view is **always
empty** — Adam only learns about a new player via the push toast.

**Options:**
- (a) Change registration.html to write to `player_signups` (staging) and
  require admin approval to migrate to `players`. Most correct, but changes
  the flow.
- (b) Change admin.html to read from `players where waiver_signed_at >=
  last-week`. Quick fix, doesn't require a staging step.

Recommendation: (b) now, (a) when you have appetite for the flow redesign.

### 5. Registration has no duplicate check (HIGH)

Someone who refreshes after signup gets a second `players` row. No
`where(team_id, email)` check before `addDoc`. Fix is ~5 lines.

### 6. Captain schedule tab doesn't land on "today" (HIGH)

Your v93 fix landed on index.html's schedule tab but the captain portal's
own schedule tab (`renderCaptainSchedule`) still opens at week 1 every
time. Should match.

### 7. Discrepancy score display shows first captain's numbers (HIGH)

When captain A submits 5-4 and captain B submits 6-4, the game keeps
showing 5-4 on index.html until you resolve the conflict. Better UX:
refuse to mark the game "done" until conflict resolves, OR show a
"pending review" badge on fan views.

### 8. Payment doc key collides across teams (HIGH)

`payments/{playerId}` — no team namespace. If a player appears on two
teams (sub, trade) their payment record overwrites across teams. Switch
to `payments/{teamId}_{playerId}`.

### 9. Payment input only saves on blur (HIGH)

Captain types $25 into "owed", taps a tab — value never hits Firestore
because `onchange` doesn't fire until blur. Debounce-save on `input`, or
add a Save button, or blur on tab-switch.

### 10. Hard-delete of players breaks historical stats (HIGH)

`captRemovePlayer` in profile.html uses `deleteDoc` — rest of the codebase
uses `active:false` soft-delete. Hard delete orphans availability +
payment rows and breaks box-score name matching that falls back to id.

### 11. Schedule auto-select picks the week with any `!done` game (HIGH)

index.html `buildScoresNav` finds the earliest week with any undone game,
so a single rained-out week-3 game keeps the schedule tab landing on
week 3 in July. `renderScores` does prefer today, but `buildScoresNav`
fights it. Fix is to reuse the targetDate logic in both places.

### 12. Hardcoded `new Date(2026, ...)` in parseDate (HIGH for 2027 prep)

index.html:6504, 6847. Come January 2027 the site will treat all game
dates as 2026, "today" logic will say season's over for every real game.
Pull the year from `config.js`'s `season.year` instead.

---

## Security-ish stuff (medium)

- **Open redirect in inbox.html**: push URLs aren't validated as same-origin.
  An admin push with `url: 'https://evil.com'` would navigate off-site on
  tap. Low exposure today (only you send pushes) but worth fixing: `if
  (t.origin !== location.origin) t = new URL('/', location.origin);`
- **Push notification payload size**: admin push composer's image field
  base64s into the POST body. If the compressed image is >~700KB, Firestore
  rejects the pending_nav doc silently and the push is never delivered.
  Client has `_compressImage` but no size check after compression.
- **Random password generator uses Math.random()**: `genAllPlayerPasswords`
  in admin.html. Six-char length × 30-alphabet = ~387M combinations,
  brute-forceable. Swap to `crypto.getRandomValues`.

---

## Low severity / notes

- Some push deep-links use `/profile.html` with no hash — if a logged-out
  user taps the push they land on the chooser screen and can't route to
  the relevant tab. Add `#chat`/`#attendance` suffix.
- Captain availability summary groups by `player_name`, so two "Mike S" on
  a roster merge. Group by `player_id` instead.
- `sign-out` doesn't clear the FCM push token, so a player who leaves a
  team keeps getting that team's team-chat pushes.
- `captPayFillDefaultOwed` does N sequential writes — 20 players on a bad
  network takes 10s with no rollback. Use `writeBatch`.

---

## Full audit artifacts

The raw audit reports (all 60+ findings including style nits I didn't list
above) are in the worktree at:
- `/private/tmp/claude-501/.../tasks/a3d65c3206c093d98.output` (index+profile)
- `/private/tmp/claude-501/.../tasks/ae474e3df4f173744.output` (admin+reg+inbox)

Also in MEMORY — I can re-run a narrower audit on any of these any time.

— Claude (late Mon night)
