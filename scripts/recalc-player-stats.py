#!/usr/bin/env python3
"""
DVSL: re-aggregate player batting stats from box_scores → patch
divergent player docs.

WHY THIS EXISTS
---------------
Audit on 5/1/26 found 17 active players (all on BOR) whose stored
gp/ab/h/etc on the player doc disagreed with what's actually in
the box_scores collection. Cause: captain.html's submitBoxScore
path updates standings but never calls recalcPlayerStatsFromBoxScores.
Player batting stats only refresh when admin publishes from the
admin UI. So between captain submit and admin publish, stats are
stale on the public site.

This script does what admin.html's recalcPlayerStatsFromBoxScores
does, but via Firestore REST PATCH. Only writes to player docs
that actually need to change (idempotent).

SAFETY
------
- Read-only by default (DRY-RUN). Pass --commit to apply.
- Uses updateMask so we only touch the 14 stats fields on each
  player doc, never the registration/auth fields.
- Skips players marked active: false (e.g., the TSBKA stale roster
  we deactivated earlier today).

USAGE
-----
    python3 scripts/recalc-player-stats.py            # dry-run
    python3 scripts/recalc-player-stats.py --commit   # apply
"""

import json
import sys
import urllib.request
import urllib.error

PROJECT_ID = "dvsl-292dd"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

STAT_FIELDS = ["gp", "ab", "r", "h", "s", "d", "t", "hr", "rbi", "bb", "so",
               "avg", "obp", "slg", "ops"]


def fetch_all(coll):
    docs, pt = [], None
    while True:
        u = f"{BASE}/{coll}?pageSize=300" + (f"&pageToken={pt}" if pt else "")
        with urllib.request.urlopen(u) as r:
            d = json.loads(r.read())
        docs.extend(d.get("documents", []))
        pt = d.get("nextPageToken")
        if not pt: break
    return docs


def parse(v):
    if "stringValue" in v: return v["stringValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "booleanValue" in v: return v["booleanValue"]
    if "doubleValue" in v: return v["doubleValue"]
    if "arrayValue" in v: return [parse(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v: return {k: parse(vv) for k, vv in v["mapValue"].get("fields", {}).items()}
    if "nullValue" in v: return None
    return None


def to_dict(doc):
    return {k: parse(v) for k, v in doc.get("fields", {}).items()}


def add_line(totals, line, team):
    name = (line.get("name") or "").strip()
    if not name: return
    key = name + "||" + (team or "")
    if key not in totals:
        totals[key] = {f: 0 for f in ["gp","ab","r","h","d","t","hr","rbi","bb","so"]}
    x = totals[key]
    _s  = int(line.get("s")  or 0)
    _d  = int(line.get("d")  or 0)
    _t  = int(line.get("t")  or 0)
    _hr = int(line.get("hr") or 0)
    # Fallback for h: some captain submissions fill s/d/t/hr but leave h
    # unset. index.html display handles this — aggregator must too.
    _h  = int(line.get("h") or 0) if line.get("h") is not None else (_s + _d + _t + _hr)
    x["gp"] += 1
    x["ab"] += int(line.get("ab") or 0)
    x["r"]  += int(line.get("r")  or 0)
    x["h"]  += _h
    x["d"]  += _d
    x["t"]  += _t
    x["hr"] += _hr
    x["rbi"]+= int(line.get("rbi")or 0)
    x["bb"] += int(line.get("bb") or 0)
    x["so"] += int(line.get("so") or line.get("k") or 0)


def derive(t):
    """Compute derived rates (avg, obp, slg, ops) from raw counts."""
    h, ab, bb = t["h"], t["ab"], t["bb"]
    d, tr, hr = t["d"], t["t"], t["hr"]
    s = h - d - tr - hr  # singles derived
    avg = (h / ab) if ab > 0 else 0
    obp = ((h + bb) / (ab + bb)) if (ab + bb) > 0 else 0
    slg = ((s + 2*d + 3*tr + 4*hr) / ab) if ab > 0 else 0
    return {
        "s":   s,
        "avg": round(avg, 3),
        "obp": round(obp, 3),
        "slg": round(slg, 3),
        "ops": round(obp + slg, 3),
    }


def patch_player(pid, fields, commit=False):
    keys = list(fields.keys())
    mask = "&".join(f"updateMask.fieldPaths={k}" for k in keys)
    url = f"{BASE}/players/{pid}?{mask}"
    payload_fields = {}
    for k, v in fields.items():
        if isinstance(v, float):
            payload_fields[k] = {"doubleValue": v}
        else:
            payload_fields[k] = {"integerValue": str(int(v))}
    payload = {"fields": payload_fields}
    if not commit:
        return True
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="PATCH",
        )
        with urllib.request.urlopen(req) as r: r.read()
        return True
    except urllib.error.HTTPError as e:
        print(f"  [ERROR] {pid}: {e.code} {e.reason}")
        return False


def main():
    commit = "--commit" in sys.argv
    print(f"DVSL player-stats recalc — {'COMMIT' if commit else 'DRY-RUN'}\n")

    players = [(d["name"].split("/")[-1], to_dict(d)) for d in fetch_all("players")]
    bs_docs = fetch_all("box_scores")
    print(f"  {len(players)} players, {len(bs_docs)} box_score docs\n")

    # Same dedup as admin.html: prefer master doc (no team_id) per game
    by_game = {}
    for d in bs_docs:
        bd = to_dict(d)
        gid = bd.get("game_id")
        if not gid: continue
        has_team = bool(bd.get("team_id"))
        if gid not in by_game or (not has_team and by_game[gid]["_has_team"]):
            by_game[gid] = {"data": bd, "_has_team": has_team}

    # Aggregate. Treat 'final' and 'approved' both as finalized — earlier
    # version filtered to only 'final' and silently skipped half the docs.
    FINALIZED = {"final", "approved", ""}
    totals = {}
    for entry in by_game.values():
        bs = entry["data"]
        if bs.get("status") and bs.get("status") not in FINALIZED: continue
        for line in (bs.get("away_lineup") or []):
            add_line(totals, line, bs.get("away"))
        for line in (bs.get("home_lineup") or []):
            add_line(totals, line, bs.get("home"))

    # For each player, compute target stats and compare
    written = 0
    skipped_clean = 0
    skipped_inactive = 0
    for pid, p in players:
        if p.get("active") is False:
            skipped_inactive += 1
            continue
        name = (p.get("name") or "").strip()
        team = p.get("team") or ""
        key = name + "||" + team
        t = totals.get(key, {f: 0 for f in ["gp","ab","r","h","d","t","hr","rbi","bb","so"]})
        derived = derive(t)
        target = {
            "gp": t["gp"], "ab": t["ab"], "r": t["r"], "h": t["h"],
            "s": derived["s"], "d": t["d"], "t": t["t"], "hr": t["hr"],
            "rbi": t["rbi"], "bb": t["bb"], "so": t["so"],
            "avg": derived["avg"], "obp": derived["obp"],
            "slg": derived["slg"], "ops": derived["ops"],
        }

        # Compare to stored
        diffs = []
        for f, v in target.items():
            stored = p.get(f, 0)
            sv = (round(float(stored), 3) if isinstance(v, float) else int(stored or 0))
            tv = (round(float(v), 3)      if isinstance(v, float) else int(v))
            if sv != tv:
                diffs.append(f"{f}: {sv} → {tv}")

        if not diffs:
            skipped_clean += 1
            continue

        print(f"  {name} ({team}) [{pid[:8]}]")
        for d in diffs[:8]:
            print(f"     {d}")
        if len(diffs) > 8: print(f"     ... and {len(diffs)-8} more")
        if not commit:
            print(f"     [DRY-RUN] would patch {len(target)} fields")
        else:
            ok = patch_player(pid, target, commit=True)
            if ok:
                print(f"     PATCHED")
                written += 1

    print()
    print(f"Summary: {skipped_clean} already-correct, {skipped_inactive} inactive (skipped),")
    print(f"         {written if commit else 'N/A'} written, "
          f"{(len(players)-skipped_clean-skipped_inactive)} divergent.")
    if not commit:
        print()
        print("Re-run with --commit to apply.")


if __name__ == "__main__":
    main()
