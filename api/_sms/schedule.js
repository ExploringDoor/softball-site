// The DVSL schedule as the change watcher sees it (Builder C).
//
// One snapshot per game in sms_schedule/{gameId}:
//   { date:'YYYY-MM-DD', time:'HH:MM'|null, field, status, away, home, seen_at }
// status: 'final' | 'live' | 'postponed' | 'cancelled' | null (scheduled).
// Regular games come from games/{id} (date_iso, time_24, field, away, home,
// done/live/ppd/rained_out). Playoff games come from the bracket JSON on
// teams/__playoff_brackets (date, time, field; sides resolved to team ids by
// name or short), ids po__{bracket}_{g} like playoff_games.
import { fsGet, fsQuery, fsCommit, encFields, lc } from '../_lib/dvsl.js';
import { parseBracketField, resolvedSides, isPlayed } from '../_lib/bracket.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function gameStatus(g) {
  if (g.done === true || g.status === 'final') return 'final';
  if (g.live === true) return 'live';
  if (g.cancelled === true || g.status === 'cancelled') return 'cancelled';
  if (g.ppd === true || g.rained_out === true || g.status === 'postponed') return 'postponed';
  return null;
}

function cleanTime(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

export function snapOfGame(g) {
  return {
    date: String(g.date_iso || '').slice(0, 10),
    time: cleanTime(g.time_24),
    field: g.field ? String(g.field).trim() : null,
    status: gameStatus(g),
    away: String(g.away || ''),
    home: String(g.home || ''),
  };
}

export function teamIdResolver(teams) {
  const m = new Map();
  for (const t of teams) {
    if (t.name) m.set(lc(t.name), t.id);
    if (t.short) m.set(lc(t.short), t.id);
  }
  return (name) => (name ? m.get(lc(name)) || '' : '');
}

export function playoffSnaps(bracketDoc, teams) {
  const idOf = teamIdResolver(teams);
  const out = new Map();
  for (const key of ['gold', 'silver']) {
    const t = parseBracketField(bracketDoc && bracketDoc[key]);
    if (!t) continue;
    for (const g of t.games || []) {
      if (!Number.isInteger(g.g) || !YMD.test(String(g.date || ''))) continue;
      const sides = resolvedSides(t, g);
      out.set(`po__${key}_${g.g}`, {
        date: g.date,
        time: cleanTime(g.time),
        field: g.field ? String(g.field).trim() : null,
        status: isPlayed(g) ? 'final' : (g.ppd === true ? 'postponed' : null),
        away: idOf(sides.away),
        home: idOf(sides.home),
      });
    }
  }
  return out;
}

export async function loadTeams() {
  return (await fsQuery('teams')).filter(t => t.id !== '__playoff_brackets');
}

// Current schedule: Map id -> snapshot, games dated on/after fromDate (or all).
export async function loadCurrent({ fromDate = null, teams = null } = {}) {
  const [games, bracketDoc, tms] = await Promise.all([
    fromDate ? fsQuery('games', [['date_iso', '>=', fromDate]]) : fsQuery('games'),
    fsGet('teams/__playoff_brackets'),
    teams ? Promise.resolve(teams) : loadTeams(),
  ]);
  const cur = new Map();
  for (const g of games) {
    const s = snapOfGame(g);
    if (!YMD.test(s.date)) continue;
    cur.set(g.id, { ...s, _changedBy: g.updated_by_uid ? String(g.updated_by_uid) : null });
  }
  for (const [id, s] of playoffSnaps(bracketDoc, tms)) if (!fromDate || s.date >= fromDate) cur.set(id, s);
  return { current: cur, teams: tms, bracketDoc };
}

export function stripSnap(s) {
  if (!s) return null;
  return { date: s.date || '', time: s.time || null, field: s.field || null, status: s.status || null, away: s.away || '', home: s.home || '' };
}
export function sameSnap(a, b) {
  return JSON.stringify(stripSnap(a)) === JSON.stringify(stripSnap(b));
}
// league-platform shape for describeChange / planScheduleAlerts.
export function toLP(s) {
  if (!s) return null;
  return { date: s.date, time: s.time || null, field: s.field || null, status: s.status || null, away_team_id: s.away || '', home_team_id: s.home || '' };
}
// A playoff side going from undecided to a team is the bracket filling in,
// not a schedule change: compare as if the old side had been that team.
export function forCompare(before, after) {
  if (!before || !after) return before;
  const b = { ...before };
  if (!b.away && after.away) b.away = after.away;
  if (!b.home && after.home) b.home = after.home;
  return b;
}

// Write (or delete) snapshots in batches. sets: [[id, snap]], deletes: [id].
export async function writeSnaps(sets, deletes = [], now = new Date()) {
  const writes = [
    ...sets.map(([id, s]) => ({ update: { name: `sms_schedule/${id}`, fields: encFields({ ...stripSnap(s), seen_at: now }) } })),
    ...deletes.map(id => ({ delete: `sms_schedule/${id}` })),
  ];
  for (let i = 0; i < writes.length; i += 400) await fsCommit(writes.slice(i, i + 400));
  return writes.length;
}

// Make every snapshot match the schedule right now, so the watcher starts
// quiet (memory: reference_island_restore_texts_coaches). Used by the seed
// button and whenever schedule alerts are switched on.
export async function seedSnapshots({ dry = false, now = new Date() } = {}) {
  const [{ current }, existing] = await Promise.all([loadCurrent({}), fsQuery('sms_schedule')]);
  const stale = existing.map(d => d.id).filter(id => !current.has(id));
  const sets = [...current.entries()];
  if (!dry) await writeSnaps(sets, stale, now);
  return { snapshots: sets.length, removed: stale.length, dry };
}
