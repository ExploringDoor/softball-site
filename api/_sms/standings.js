// Server-side standings recalc: a port of captain.html recalcStandingsFromAllGames.
//
// It runs after a texted final lands, as the captain portal does after a
// portal final. The fields, the rules and the rounding are the same, so a
// texted final and a portal final leave the teams docs identical:
//   * only games with done == true count, and never a PPD / rained out game
//     or one with a missing score
//   * ties count (ti), pct = (w + 0.5*ti) / gp, rounded to 3 places
//   * games are ordered by date_iso (else the week number) for the streak
//   * gb = (best (w-l) - (w-l)) / 2 as a string, '-' for the leaders
//   * streak = last result + run length ('W3'), '-' with no games
//   * every ACTIVE team gets a row; inactive teams and the brackets doc are skipped
//
// One deliberate difference: scores are read with Number(). captain.html adds
// them as-is, which concatenates if a score was ever stored as the string the
// rules allow ("7"). For numeric data, which is all of it today, the two match.
//
// Forfeits (2026-11, js/dvsl-standings.js has the rules): a done game with
// forfeit 'away' | 'home' | 'double' counts with no scores. The side that
// forfeited takes an L (both sides on a double forfeit), the other side a W;
// it never adds to rs / ra. Points are not stored on teams docs, so nothing
// else changes here.
//
// Only teams whose numbers changed are written, in one commit.
import { fsQuery, fsCommit, encFields } from '../_lib/dvsl.js';

const FIELDS = ['w', 'l', 'ti', 'pct', 'rs', 'ra', 'gb', 'streak'];
const BRACKETS_ID = '__playoff_brackets';

const forfeitOf = (g) => (g && (g.forfeit === 'away' || g.forfeit === 'home' || g.forfeit === 'double')) ? g.forfeit : '';

const scoreOf = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Pure: done games + teams -> { teamId: {w,l,ti,pct,rs,ra,gb,streak} } for active teams. */
export function computeStandings(games, teams) {
  const active = (teams || []).filter(t => t && t.id !== BRACKETS_ID && t.active !== false);
  const stats = {};
  active.forEach(t => { stats[t.id] = { w: 0, l: 0, ti: 0, rs: 0, ra: 0, results: [] }; });

  const dk = g => (g.date_iso && /^\d{4}-\d{2}-\d{2}$/.test(g.date_iso)) ? g.date_iso : String(g.wk || 0).padStart(4, '0');
  const done = (games || [])
    .filter(g => g && g.done === true && !g.ppd && !g.rained_out
      && (forfeitOf(g) || (scoreOf(g.away_score) !== null && scoreOf(g.home_score) !== null)))
    .sort((a, b) => dk(a).localeCompare(dk(b)));

  done.forEach(g => {
    const ff = forfeitOf(g);
    if (ff) {
      for (const [me, opp] of [['away', 'home'], ['home', 'away']]) {
        const s = stats[g[me]];
        if (!s) continue;
        if (ff === opp) { s.w++; s.results.push('W'); } else { s.l++; s.results.push('L'); }
      }
      return;
    }
    const as = scoreOf(g.away_score), hs = scoreOf(g.home_score);
    if (stats[g.away]) {
      const s = stats[g.away]; s.rs += as; s.ra += hs;
      if (as > hs) { s.w++; s.results.push('W'); }
      else if (as < hs) { s.l++; s.results.push('L'); }
      else { s.ti++; s.results.push('T'); }
    }
    if (stats[g.home]) {
      const s = stats[g.home]; s.rs += hs; s.ra += as;
      if (hs > as) { s.w++; s.results.push('W'); }
      else if (hs < as) { s.l++; s.results.push('L'); }
      else { s.ti++; s.results.push('T'); }
    }
  });

  let maxWinDiff = -Infinity;
  Object.values(stats).forEach(s => {
    const gp = s.w + s.l + s.ti;
    s.pct = gp > 0 ? ((s.w + 0.5 * s.ti) / gp) : 0;
    const wd = s.w - s.l;
    if (wd > maxWinDiff) maxWinDiff = wd;
    const r = s.results;
    if (r.length > 0) {
      const last = r[r.length - 1];
      let count = 0;
      for (let i = r.length - 1; i >= 0 && r[i] === last; i--) count++;
      s.streak = last + count;
    } else { s.streak = '-'; }
  });
  Object.values(stats).forEach(s => {
    const diff = maxWinDiff - (s.w - s.l);
    s.gb = diff === 0 ? '-' : (diff / 2).toString();
  });

  const out = {};
  for (const [id, s] of Object.entries(stats)) {
    out[id] = { w: s.w, l: s.l, ti: s.ti, pct: parseFloat(s.pct.toFixed(3)), rs: s.rs, ra: s.ra, gb: s.gb, streak: s.streak };
  }
  return out;
}

const same = (a, b) => (typeof a === 'number' && typeof b === 'number') ? Math.abs(a - b) < 1e-9 : a === b;

/** Recompute from Firestore and write the changed teams. Returns { written, teams }. */
export async function recalcStandings() {
  const [games, teams] = await Promise.all([
    fsQuery('games', [['done', '==', true]]),
    fsQuery('teams'),
  ]);
  const next = computeStandings(games, teams);
  const byId = new Map(teams.map(t => [t.id, t]));
  const writes = [];
  for (const [id, row] of Object.entries(next)) {
    const cur = byId.get(id) || {};
    if (FIELDS.every(k => same(cur[k], row[k]))) continue;
    writes.push({ update: { name: `teams/${id}`, fields: encFields(row) }, updateMask: { fieldPaths: FIELDS }, currentDocument: { exists: true } });
  }
  for (let i = 0; i < writes.length; i += 400) await fsCommit(writes.slice(i, i + 400));
  return { written: writes.length, teams: Object.keys(next).length };
}
