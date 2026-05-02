#!/usr/bin/env python3
"""
DVSL one-time data migration: mark stale player docs as inactive.

WHY THIS EXISTS
---------------
Audit on 5/1/26 found two cleanup opportunities:

  1. Team `tsbka` (Temple Sinai Black/Kol Ami) is `active: false` and
     has 0 games scheduled this season, BUT 21 player docs still
     reference `team: "tsbka"`. The same 21 humans also have player
     docs on TOAST (their current team). The tsbka docs are stale
     duplicates that pollute name searches and roster lookups.

  2. `David Betman` has two docs in `gold`:
       - reg__gold__betmand_comcast_net__2026  (real registration)
       - ztJKXEEYQgNvIWjf5b8z                  (orphan placeholder,
                                                empty email, num=0,
                                                never claimed, but
                                                same phone number)

The site already filters with `p.active !== false` in many spots.
Adding `active: false` to these stale docs makes them invisible to
those filters without destroying any data — fully reversible by
flipping the field back.

SAFETY
------
- Non-destructive: only ADDS a field, never removes data.
- DRY-RUN by default: prints the writes it WOULD make and exits.
- Pass `--commit` to actually apply the writes.
- Uses Firestore PATCH with explicit updateMask so we ONLY touch
  the `active` field — nothing else on the doc changes.

USAGE
-----
    python3 scripts/deactivate-stale-players.py            # dry-run
    python3 scripts/deactivate-stale-players.py --commit   # apply
"""

import json
import sys
import urllib.request
import urllib.error

PROJECT_ID = "dvsl-292dd"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

# Hard-coded targets so this script is auditable. If you want to add
# more later, append them here and re-run.
TARGETS = {
    # David Betman orphan (real registration is at
    # reg__gold__betmand_comcast_net__2026, which we leave alone)
    "ztJKXEEYQgNvIWjf5b8z": "David Betman orphan duplicate (gold)",
}


def fetch_tsbka_player_ids():
    """Page through players collection and find every doc with team=tsbka."""
    ids = []
    page_token = None
    while True:
        url = f"{BASE}/players?pageSize=300"
        if page_token:
            url += f"&pageToken={page_token}"
        with urllib.request.urlopen(url) as r:
            data = json.loads(r.read())
        for doc in data.get("documents", []):
            f = doc.get("fields", {})
            team = f.get("team", {}).get("stringValue", "")
            if team == "tsbka":
                pid = doc["name"].split("/")[-1]
                name = f.get("name", {}).get("stringValue", "?")
                ids.append((pid, name))
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return ids


def patch_active_false(pid, label, commit=False):
    """Set active=false on a single player doc with updateMask."""
    url = f"{BASE}/players/{pid}?updateMask.fieldPaths=active"
    payload = {"fields": {"active": {"booleanValue": False}}}

    if not commit:
        print(f"  [DRY-RUN] PATCH players/{pid} ← active:false   ({label})")
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
        print(f"  PATCHED players/{pid}   ({label})")
        return True
    except urllib.error.HTTPError as e:
        print(f"  [ERROR] {pid}: {e.code} {e.reason}")
        try:
            print(f"           {e.read().decode()}")
        except Exception:
            pass
        return False


def main():
    commit = "--commit" in sys.argv
    print(f"DVSL stale-player deactivation — {'COMMIT' if commit else 'DRY-RUN'} mode")
    print()

    print("Fetching TSBKA player docs...")
    tsbka_players = fetch_tsbka_player_ids()
    print(f"  Found {len(tsbka_players)} TSBKA player docs")
    print()

    print("Targets:")
    for pid, name in tsbka_players:
        TARGETS[pid] = f"TSBKA stale roster: {name}"
    for pid, label in TARGETS.items():
        print(f"  {pid}: {label}")
    print()

    print(f"Applying active:false to {len(TARGETS)} docs...")
    print()
    successes = 0
    failures = 0
    for pid, label in TARGETS.items():
        if patch_active_false(pid, label, commit=commit):
            successes += 1
        else:
            failures += 1

    print()
    print(f"Summary: {successes} ok, {failures} failed")
    if not commit:
        print()
        print("Re-run with --commit to apply.")


if __name__ == "__main__":
    main()
