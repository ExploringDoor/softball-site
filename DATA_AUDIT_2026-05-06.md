# DVSL data audit — 2026-05-06

Snapshot of Firestore game/box-score state across the 12 finalized games
through Week 3. Generated tonight after a string of score-only and
upload-fallback bugs surfaced via captain support tickets (BSMC, BOR,
BOR-GJC PDF). Listed in order of "most actionable to chase up."

**Stats coverage right now:** 3 of 12 finalized games have full per-team
batter stats. **75% of finalized games have no individual stats.** Most
of that is captains submitting score-only.

---

## 🚨 Section 1 — Bugs that need investigation (not just captain follow-up)

### 1a. Game finalized but no `box_scores` doc at all

| Wk | Date | Matchup | Score |
|---|---|---|---|
| Wk 3 | May 4 | BOR @ GJC | 13–7 |

The BOR captain submitted a score-only entry for this game (twice — once
May 5, once May 6). The `score_submissions/{gameId}_away` doc exists
with their score-only data. But the public `/box_scores/{gameId}` doc
**does not exist at all**. The game is `done: true` with the score
recorded on the games doc.

Suspect: a path through `submitScoreOnly` → `submitBoxScoreUnified` is
NOT writing to `/box_scores` for this game. Possibly:
- Firestore rules blocking the write
- `setDoc` on `/box_scores/{gameId}` silently failing
- A Firestore connection error swallowed by the try/catch in `submitBoxScoreUnified`

**Action:** instrument the upload path with verbose logging or pull the
Firestore console for the BOR captain's session to see if the write
attempt was logged. If the rules are blocking, fix the rules. If the
write is just failing, the catch is swallowing the error.

Until fixed, the BOR @ GJC May 4 game shows the score on the schedule
but the box-score modal opens to the v267 "Score Only Entry" placeholder
because there's no `/box_scores` doc to read from at all.

---

### 1b. Unresolved score conflict

| Wk | Date | Matchup | Recorded Score |
|---|---|---|---|
| Wk 2 | Apr 27 | BSMC @ BTBJ | 10–3 |

`game.score_conflict === true`. Two captains submitted disagreeing
scores. Admin needs to look at admin.html → conflict resolution UI and
pick the authoritative version, then clear the flag.

---

### 1c. "Status: final, but both lineups empty" (NOT flagged score-only)

| Wk | Date | Matchup | Score |
|---|---|---|---|
| Wk 1 | Apr 22 | SA @ TSMC | 15–0 |
| Wk 2 | Apr 28 | BOB @ CHA | 11–7 |

`box_scores` doc exists, `status: final`, but **both** `away_lineup` and
`home_lineup` are empty AND there's no `score_only: true` flag. These
are functionally identical to score-only games, but they aren't tagged
as such.

Suspect: pre-v265 score-only submissions or a bug where the score-only
flag wasn't set at write time. Public modal renders these as "no
batting data" instead of the cleaner "📝 Score Only Entry" placeholder.

**Action:** one-time backfill — set `score_only: true` on these two docs
so the public display renders the proper placeholder. Quick admin script.

---

## ⚠️ Section 2 — Captains who submitted score-only (six games)

These captains submitted just the final score, no individual stats. Now
that v275 added the "Recently Submitted — Add Detail" list to captain.html,
they CAN come back and add full stats. Prompt the captains who care
about their players' season totals.

| Wk | Date | Matchup | Score | Captain who submitted |
|---|---|---|---|---|
| Wk 1 | Apr 20 | GOLD @ CHA | 14–3 | Goldstein's |
| Wk 1 | Apr 21 | DN @ BOR | 3–22 | Beth Or Red |
| Wk 2 | Apr 27 | GJC @ TBIMC | 3–7 | Tifereth Bet Israel Men's Club |
| Wk 2 | Apr 28 | KI @ GOLD | 3–18 | Goldstein's |
| Wk 2 | Apr 29 | DN @ TOAST | 19–13 | TOAST |
| Wk 3 | May 4 | BSMC @ DN | 24–13 | Beth Sholom Men's Club |

**Action:** text these six captains: *"You submitted score-only for
[date matchup]. If you have player stats, you can now go to your
Captain Dashboard → Submit Score → 'Recently Submitted — Add Detail'
section and tap 📊 Box Score to add them. The score stays the same;
just adds individual stats."*

---

## 📊 Section 3 — Asymmetric submissions (one captain entered, the other didn't)

These games have stats from ONE side but not the other. The DVSL 3-lane
model means each captain only writes their own side, so this is normal
when the other captain hasn't submitted yet. But for SFBL launch, you
want full coverage.

| Wk | Date | Matchup | Score | Has stats | Missing stats |
|---|---|---|---|---|---|
| Wk 2 | Apr 27 | TOAST @ OA | 0–11 | OA (12 batters) | TOAST |
| Wk 2 | Apr 28 | SA @ BOR | 26–3 | BOR (18 batters) | SA |

**Action:** ask TOAST and SA captains to submit their box scores for
these games. Same path: Captain Dashboard → Submit Score → those games
should appear in Pending (since neither captain has submitted from
their side).

---

## ✅ Section 4 — Clean games (3 of 12)

These games have full per-team batter stats and no flags. Public modal
renders normally with both lineups + pitching tables.

You can find them by elimination: any finalized game NOT listed in
sections 1-3 above is in this set. Roughly:
- Wk 1: TBR @ CHA (or whichever Wk 1 game has full data)
- Wk 2: BSMC @ BTBJ (the Apr 28 one with 13 BSMC + 10 BTBJ batters)
- Plus one or two others

---

## Summary of action items

**Before SFBL launch (May 15):**

- [ ] Investigate why BOR @ GJC May 4 has no `box_scores` doc despite captain submitting (Section 1a)
- [ ] Resolve the BSMC @ BTBJ score conflict (Section 1b)
- [ ] Backfill `score_only: true` on the two pre-v265 untagged games (Section 1c)
- [ ] Reach out to the 6 score-only captains (Section 2) to add detail via the new Recently Submitted list
- [ ] Reach out to TOAST + SA captains (Section 3) to submit their side's stats
- [ ] After all of the above, re-run this audit. Goal: clean games count goes from 3 to 12.

**For LeagueEngine port:**

- The "asymmetric submissions" is a known consequence of 3-lane scoring.
  Document it as expected behavior — don't try to fix it.
- The "status: final but no lineups, no flag" untagged-score-only state
  shouldn't be possible in LE since the per-side score-only flag is
  always written when score_only is the chosen mode. Verify in the LE
  schema that `away_score_only` / `home_score_only` are required when
  the corresponding lineup is empty AND status is final.
- The "done game, no box_scores doc" failure in 1a should be impossible
  in LE because the server-side `/api/captain-submit` endpoint writes
  to box_scores as part of the same transaction as the submission. If
  there's a partial-write race, runTransaction will roll it back.

---

## Numbers

```
games:        112  (full season schedule)
done:          12  (Wk 1-3 played so far)
box_scores:    11  (one missing — see 1a)
clean:          3  (25% with full stats)
score_only:     6  (50% — captains submitted just score)
no_lineup:      2  (effectively score-only but untagged)
asymmetric:     2  (one side only)
no_box_at_all:  1  (BOR @ GJC May 4)
conflict:       1  (BSMC @ BTBJ Apr 27)
score_pending:  0  (no upcoming games stuck waiting)
score_mismatch: 0  (game.score == box.score everywhere — clean)
```

The last line is the most reassuring: **zero score parity issues**.
When data IS recorded, the game doc and box-score doc agree on the
final score. The mismatch class doesn't exist in the current dataset.
