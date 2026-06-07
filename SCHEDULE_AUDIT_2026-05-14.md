# DVSL schedule + scores audit — 2026-05-14

Comparison of Adam's pasted master list (16 teams, all completed +
upcoming games) against current Firestore state. Run via browser
diagnostic at `dvsl.vercel.app` browser console.

---

## ✅ Headline: 0 score mismatches

Every game that's marked `done:true` in BOTH the list AND Firestore
agrees exactly on the score. No data is wrong where it exists.

The 14-game gap (47 list-done vs 36 FS-done) is almost entirely
"games happened, just never marked final on the site" + a handful
of genuinely missing rows.

---

## COMPLETED GAMES — punch list

### 🟡 9 games in FS but `done:false` — just need scores entered

Easy batch. Each exists as a scheduled row; admin → Scores → enter
the score → Mark Final.

| Date | Game | Score (list) |
|---|---|---|
| May 13 | DN @ BTBJ | 3-9 |
| May 14 | BA @ CHA | **10-10 TIE** |
| May 14 | BOB @ TBIMC | 19-1 |
| May 18 | TBIMC @ BTBJ | 6-19 |
| May 26 | KI @ BOB | 6-4 |
| May 28 | DN @ TBIMC | 7-8 |
| Jun 1 | BA @ TBIMC | 16-0 |
| Jun 3 | BTBJ @ TSMC | 11-2 |
| Jun 4 | SA @ KI | 15-4 |

### ❌ 3 games genuinely missing from FS — need to be added

These need brand-new game rows + scores. Either they never existed
on the original schedule or got deleted.

1. **May 26 GOLD @ TSMC 15-0** (Southampton)
2. **May 27 BA @ BTBJ 9-2** (Cedar Hill)
3. **Jun 4 TSMC @ DN 12-13** (Mondauk 5)

### ⚠ 1 state mismatch — needs Adam's call

| Date | Game | List | Firestore |
|---|---|---|---|
| May 5 | TOAST @ TBIMC | Awaiting | **Done, 10-7 (TBIMC won)** |

Most likely Firestore is right (someone entered it; the master list
got stale). Confirm with TBIMC or TOAST captain if uncertain.

### 📅 1 date off-by-one

| Date in list | Date in FS | Game | Score |
|---|---|---|---|
| Jun 3 | **Jun 2** | OA @ GOLD | 1-4 |

Same game and score — just disagree on the day. Pick one, fix the
other.

---

## UPCOMING GAMES — punch list

62 upcoming games in the list. Site is in much better shape on this
side — just 6 differences.

### ❌ 3 missing from FS

1. **Jun 10 6:15 PM BTBJ @ DN** (Mondauk 4)
2. **Jul 6 6:15 PM SA @ BA** (Plymouth)
3. **Jul 16 6:00 PM TBIMC @ BSMC** (Mondauk 5)

### 🕐 2 time mismatches

1. **Jun 10 TBIMC @ SA** — list: 7:00 PM, FS: 8:00 PM
2. **Jun 10 TSMC @ TOAST** — list: 6:00 PM, FS: 6:15 PM

### 🏟 1 field mismatch

1. **Jul 13 SA @ BSMC** — list: Mondauk 4, FS: Mondauk 5

---

## Total work

- **9** score-only entries (existing rows, just fill scores)
- **6** new game rows to create (3 completed + 3 upcoming)
- **1** state decision (TOAST/TBIMC May 5)
- **1** date fix (OA/GOLD)
- **2** time fixes (Jun 10 evening)
- **1** field fix (Jul 13 SA/BSMC)

Roughly **20 individual changes**. ~30 minutes manual via admin, or
I can batch it.
