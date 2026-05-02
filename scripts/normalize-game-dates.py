#!/usr/bin/env python3
"""
DVSL one-time data migration: normalize the `date` and `date_iso`
fields on every games doc.

WHY THIS EXISTS
---------------
Audit on 4/30/26 found 103 of 112 game docs in `games` had `date`
stored as ISO ("2026-04-27") with `date_iso` empty. Only 9 had the
intended split:
  - date = "Apr 27"      (human-readable for display)
  - date_iso = "2026-04-27"  (canonical sort key)
  - day = "Mon" / "Tue"   (weekday)

That mismatch causes intermittent sort/display bugs (admin scores
chronological sort issue, recap-text date format, schedule grouping)
that have been patched at the read site multiple times instead of
fixing the data.

This script normalizes every game so `date_iso` is always present
and `date` is always the human-friendly form.

SAFETY
------
- DRY-RUN by default: prints the writes it WOULD make and exits.
- Pass `--commit` to actually apply the writes (uses Firestore REST
  PATCH with explicit updateMask so we only touch the date fields,
  never overwrite anything else on the doc).
- Each PATCH is one call. If the script crashes mid-run, partial
  progress sticks, but no data is destroyed — just re-run.

USAGE
-----
    python3 scripts/normalize-game-dates.py            # dry-run (safe)
    python3 scripts/normalize-game-dates.py --commit   # apply writes
"""

import json
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime

PROJECT_ID = "dvsl-292dd"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SHORT_RE = re.compile(r"^([A-Za-z]{3,})\s+(\d{1,2})$")


def fetch_all_games():
    """Page through games collection and return parsed list of (id, fields)."""
    games = []
    page_token = None
    while True:
        url = f"{BASE}/games?pageSize=300"
        if page_token:
            url += f"&pageToken={page_token}"
        with urllib.request.urlopen(url) as r:
            data = json.loads(r.read())
        for doc in data.get("documents", []):
            gid = doc["name"].split("/")[-1]
            f = doc.get("fields", {})
            g = {}
            for k, v in f.items():
                if "stringValue" in v:
                    g[k] = v["stringValue"]
                elif "integerValue" in v:
                    g[k] = int(v["integerValue"])
                elif "booleanValue" in v:
                    g[k] = v["booleanValue"]
            games.append((gid, g))
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return games


def parse_to_iso(date_str, year_hint=2026):
    """
    Try to parse `date_str` into a (date_iso, date_short, day_short)
    tuple. Returns None if not parseable.
    """
    s = str(date_str or "").strip()
    if not s:
        return None
    # Already ISO?
    if ISO_RE.match(s):
        try:
            d = datetime.strptime(s, "%Y-%m-%d")
            return (
                d.strftime("%Y-%m-%d"),
                d.strftime("%b %-d") if sys.platform != "win32" else d.strftime("%b %#d"),
                d.strftime("%a"),
            )
        except ValueError:
            return None
    # "Apr 27" / "May 3" form?
    m = SHORT_RE.match(s)
    if m:
        try:
            d = datetime.strptime(f"{m.group(1)} {m.group(2)} {year_hint}", "%b %d %Y")
        except ValueError:
            try:
                d = datetime.strptime(f"{m.group(1)} {m.group(2)} {year_hint}", "%B %d %Y")
            except ValueError:
                return None
        return (
            d.strftime("%Y-%m-%d"),
            d.strftime("%b %-d") if sys.platform != "win32" else d.strftime("%b %#d"),
            d.strftime("%a"),
        )
    return None


def patch_game(gid, fields_to_set, commit=False):
    """Send a Firestore PATCH with updateMask so only date fields move."""
    fields_param = "&".join(
        f"updateMask.fieldPaths={k}" for k in fields_to_set.keys()
    )
    url = f"{BASE}/games/{gid}?{fields_param}"
    payload = {
        "fields": {
            k: ({"stringValue": v} if isinstance(v, str) else {"integerValue": str(v)})
            for k, v in fields_to_set.items()
        }
    }
    if not commit:
        print(f"  [DRY-RUN] PATCH {gid} ← {fields_to_set}")
        return True
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="PATCH",
        )
        with urllib.request.urlopen(req) as r:
            r.read()
        return True
    except urllib.error.HTTPError as e:
        print(f"  [ERROR] {gid}: {e.code} {e.reason}")
        try:
            print(f"           {e.read().decode()}")
        except Exception:
            pass
        return False


def main():
    commit = "--commit" in sys.argv
    print(f"DVSL game-date normalization — {'COMMIT' if commit else 'DRY-RUN'} mode")
    games = fetch_all_games()
    print(f"Fetched {len(games)} games")

    updates_needed = 0
    skipped_unparseable = 0
    skipped_already_correct = 0

    for gid, g in games:
        date_iso = (g.get("date_iso") or "").strip()
        date = (g.get("date") or "").strip()
        day = (g.get("day") or "").strip()

        # Pick the best source: prefer existing date_iso if valid, else
        # fall back to `date` (which is sometimes ISO, sometimes short).
        source = date_iso if ISO_RE.match(date_iso) else date
        parsed = parse_to_iso(source)
        if not parsed:
            skipped_unparseable += 1
            print(f"  SKIP {gid}: cannot parse date='{date}' date_iso='{date_iso}'")
            continue

        new_iso, new_short, new_day = parsed
        # What needs to change?
        to_set = {}
        if date_iso != new_iso:
            to_set["date_iso"] = new_iso
        if date != new_short:
            to_set["date"] = new_short
        # Only set `day` if it's missing — don't overwrite a manually-set
        # day (e.g. someone marked a Wed game as Thu after a reschedule).
        if not day:
            to_set["day"] = new_day

        if not to_set:
            skipped_already_correct += 1
            continue

        updates_needed += 1
        teams = f"{g.get('away','?')}@{g.get('home','?')}"
        print(f"  {gid} ({teams} wk{g.get('wk','?')}): {to_set}")
        patch_game(gid, to_set, commit=commit)

    print()
    print(f"Summary: {updates_needed} updates, "
          f"{skipped_already_correct} already correct, "
          f"{skipped_unparseable} unparseable")
    if not commit and updates_needed:
        print()
        print("Re-run with --commit to apply.")


if __name__ == "__main__":
    main()
