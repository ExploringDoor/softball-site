// Server-side player batting stats from box_scores (service account).
//
// Port of admin.html recalcPlayerStatsFromBoxScores / captain.html
// _captRecalcStatsFromBoxScores, scoped to the teams whose box score just
// changed (a texted box score touches exactly two teams):
//   * every box_scores doc, deduped per game, preferring the master doc (no
//     team_id) over a per-team captain copy;
//   * only finalized docs count: status 'final', 'approved' or missing;
//   * totals keyed by (trimmed line name, team id), joined to players by
//     (trimmed p.name, p.team); inactive players are skipped;
//   * every active player of those teams is written (a player who has no line
//     any more goes back to zeros, as admin.html does), but only when a value
//     actually changed;
//   * fields gp ab r h s d t hr rbi bb so avg obp slg ops, rounded to 3 dp.
// Singles are max(0, h - d - t - hr) as captain.html computes them (admin.html
// omits the max; the two only differ on a line with more extra-base hits than
// hits, which a real box score never has).

import { fsQuery, fsUpdate } from '../_lib/dvsl.js';

const FINALIZED = new Set(['final', 'approved', '']);
const zero = () => ({ gp: 0, ab: 0, r: 0, h: 0, s: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, so: 0 });

// box score docs (each with .id) → { "name||team": totals }
export function totalsFromBoxScores(docs) {
  const byGame = {};
  for (const x of docs || []) {
    const gid = x.game_id || x.id;
    const hasTeam = !!x.team_id;
    if (!byGame[gid] || (!hasTeam && byGame[gid]._hasTeam)) byGame[gid] = { ...x, _hasTeam: hasTeam };
  }
  const totals = {};
  const addLine = (line, teamId) => {
    if (!line || !line.name) return;
    const key = String(line.name).trim() + '||' + (teamId || '');
    const x = totals[key] || (totals[key] = zero());
    const _s = parseInt(line.s) || 0;
    const _d = parseInt(line.d) || 0;
    const _t = parseInt(line.t) || 0;
    const _hr = parseInt(line.hr) || 0;
    const _h = (line.h != null) ? (parseInt(line.h) || 0) : (_s + _d + _t + _hr);
    x.gp += 1;
    x.ab += parseInt(line.ab) || 0;
    x.r += parseInt(line.r) || 0;
    x.h += _h;
    x.s += _s;
    x.d += _d;
    x.t += _t;
    x.hr += _hr;
    x.rbi += parseInt(line.rbi) || 0;
    x.bb += parseInt(line.bb) || 0;
    x.so += parseInt(line.so) || parseInt(line.k) || 0;
  };
  for (const bs of Object.values(byGame)) {
    if (bs.status && !FINALIZED.has(bs.status)) continue;
    (bs.away_lineup || []).forEach(l => addLine(l, bs.away));
    (bs.home_lineup || []).forEach(l => addLine(l, bs.home));
  }
  return totals;
}

// totals (or undefined) → the player doc patch.
export function statUpdate(t) {
  t = t || zero();
  const ab = t.ab, h = t.h, bb = t.bb, d = t.d, tr = t.t, hr = t.hr;
  const sing = Math.max(0, h - d - tr - hr);
  const avg = ab > 0 ? h / ab : 0;
  const obp = (ab + bb) > 0 ? (h + bb) / (ab + bb) : 0;
  const slg = ab > 0 ? (sing + 2 * d + 3 * tr + 4 * hr) / ab : 0;
  const ops = obp + slg;
  return {
    gp: t.gp, ab, r: t.r, h, s: sing, d, t: tr, hr, rbi: t.rbi, bb, so: t.so,
    avg: parseFloat(avg.toFixed(3)),
    obp: parseFloat(obp.toFixed(3)),
    slg: parseFloat(slg.toFixed(3)),
    ops: parseFloat(ops.toFixed(3)),
  };
}

// Same comparison as admin.html: decimals compared at 3 dp.
export function isDirty(p, update) {
  for (const k of Object.keys(update)) {
    const frac = typeof update[k] === 'number' && !Number.isInteger(update[k]);
    const stored = frac ? Number(Number(p[k] || 0).toFixed(3)) : Number(p[k] || 0);
    const target = frac ? Number(update[k].toFixed(3)) : update[k];
    if (stored !== target) return true;
  }
  return false;
}

// Recompute and write the stats of every active player on `teamIds`.
// Returns { written, players }. Throws if Firestore cannot be read.
export async function recalcTeamStats(teamIds) {
  const teams = [...new Set((teamIds || []).filter(t => typeof t === 'string' && t))];
  if (!teams.length) return { written: 0, players: 0 };
  const [boxes, players] = await Promise.all([
    fsQuery('box_scores'),
    fsQuery('players', [['team', 'in', teams]]),
  ]);
  const totals = totalsFromBoxScores(boxes);
  let written = 0, seen = 0;
  for (const p of players) {
    if (p.active === false) continue;
    seen++;
    const update = statUpdate(totals[String(p.name || '').trim() + '||' + (p.team || '')]);
    if (!isDirty(p, update)) continue;
    try {
      await fsUpdate(`players/${p.id}`, update, { mustExist: true });
      written++;
    } catch (e) {
      console.warn('[sms stats] player update failed', p.id, e.message);
    }
  }
  return { written, players: seen };
}
