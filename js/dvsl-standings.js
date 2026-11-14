/* DVSL standings order — the ONE place team rank is decided.
 *
 * League rule (Rules page, §19 Points System):
 *   Teams are ranked by total points accumulated (W = 3, T = 2, L = 1).
 *   Tiebreakers, in order: total cumulative points → head to head →
 *   strength of schedule → coin flip.
 *
 * Before this file, six different sorts ranked teams (PCT only, PTS→PCT→W,
 * PCT→W→run diff, PTS→run diff, …). With Goldstein's and Shir Ami tied at
 * 13-1 / 40 pts in 2026 the home page and the Standings page disagreed on
 * who was #1, and playoff seeding broke ties on run differential. Every
 * standings view now calls DVSLStandings.rank().
 *
 * Interpretation notes (the rulebook is one line):
 *  - Only completed regular-season games count toward head to head and
 *    strength of schedule. Postponed / rained-out rows are skipped even if
 *    they carry a score, and playoff rows (wk 'PL', id 'po__…') are skipped.
 *  - Head to head with 3+ tied teams uses each team's record against the
 *    rest of the tied group, but only when every tied team played at least
 *    one game inside the group; otherwise it can't separate them fairly and
 *    we move on to strength of schedule. Whenever a tiebreaker splits a
 *    group, the still-tied sub-groups restart at head to head.
 *  - Strength of schedule = average points-per-game of the opponents you
 *    actually played (an opponent faced twice counts twice).
 *  - A coin flip can't be automated, so the last step is a fixed, published
 *    order (team name A→Z). rank() marks those teams with coinFlip so a page
 *    can footnote it.
 */
(function () {
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function points(t) {
    return (Number(t.w) || 0) * 3 + (Number(t.ti) || 0) * 2 + (Number(t.l) || 0) * 1;
  }

  function gamesPlayed(t) {
    return (Number(t.w) || 0) + (Number(t.l) || 0) + (Number(t.ti) || 0);
  }

  // Games arrive in different shapes per page (index.html maps teams to their
  // short names; admin/captain keep raw ids). Accept id, short, name or abbr.
  function aliasMap(teams) {
    var m = {};
    teams.forEach(function (t) {
      [t.id, t.short, t.name, t.abbr].forEach(function (k) {
        if (k !== undefined && k !== null && String(k).trim() !== '') m[String(k).trim().toLowerCase()] = t.id;
      });
    });
    return m;
  }

  // -> {a, h, as, hs} using team ids, or null when the row shouldn't count.
  function normGame(g, alias) {
    if (!g || g.done !== true) return null;
    if (g.ppd || g.rained_out) return null;
    if (g.wk === 'PL' || g.playoff || String(g.id || '').indexOf('po__') === 0) return null;
    var as = num(g.as !== undefined ? g.as : g.away_score);
    var hs = num(g.hs !== undefined ? g.hs : g.home_score);
    if (as === null || hs === null) return null;
    var a = alias[String(g.away || '').trim().toLowerCase()];
    var h = alias[String(g.home || '').trim().toLowerCase()];
    if (!a || !h || a === h) return null;
    return { a: a, h: h, as: as, hs: hs };
  }

  // Split `group` into ordered buckets by key(team) (higher first).
  function bucketsBy(group, key) {
    var keyed = group.map(function (t) { return { t: t, k: Math.round(key(t) * 1e9) / 1e9 }; });
    keyed.sort(function (x, y) { return y.k - x.k; });
    var out = [];
    keyed.forEach(function (x) {
      var last = out[out.length - 1];
      if (last && last.k === x.k) last.items.push(x.t);
      else out.push({ k: x.k, items: [x.t] });
    });
    return out.map(function (b) { return b.items; });
  }

  function breakTie(group, ctx) {
    if (group.length < 2) return group;
    var ids = {};
    group.forEach(function (t) { ids[t.id] = { w: 0, l: 0, t: 0 }; });

    // 1) Head to head inside the tied group.
    ctx.games.forEach(function (g) {
      if (!ids[g.a] || !ids[g.h]) return;
      if (g.as > g.hs) { ids[g.a].w++; ids[g.h].l++; }
      else if (g.hs > g.as) { ids[g.h].w++; ids[g.a].l++; }
      else { ids[g.a].t++; ids[g.h].t++; }
    });
    var everyonePlayed = group.every(function (t) { var r = ids[t.id]; return r.w + r.l + r.t > 0; });
    if (everyonePlayed) {
      var byH2h = bucketsBy(group, function (t) {
        var r = ids[t.id]; return (r.w + r.t / 2) / (r.w + r.l + r.t);
      });
      if (byH2h.length > 1) return flatten(byH2h.map(function (b) { return breakTie(b, ctx); }));
    }

    // 2) Strength of schedule.
    var bySos = bucketsBy(group, function (t) { return ctx.sos[t.id] || 0; });
    if (bySos.length > 1) return flatten(bySos.map(function (b) { return breakTie(b, ctx); }));

    // 3) Coin flip stand-in: fixed alphabetical order, flagged.
    return group.slice().sort(function (x, y) {
      return String(x.name || x.short || x.id).localeCompare(String(y.name || y.short || y.id));
    }).map(function (t) { ctx.coinFlip[t.id] = true; return t; });
  }

  function flatten(arrs) { return [].concat.apply([], arrs); }

  /* rank(teams, games) -> new array, same team objects, best first.
   * teams: [{id, w, l, ti, name?, short?}]   games: any page's game rows.
   * Never mutates the inputs. Safe with games missing/empty (ties then fall
   * through to the alphabetical stand-in). */
  function rank(teams, games) {
    teams = (teams || []).filter(Boolean);
    var alias = aliasMap(teams);
    var norm = (games || []).map(function (g) { return normGame(g, alias); }).filter(Boolean);

    var ppg = {};
    teams.forEach(function (t) { var gp = gamesPlayed(t); ppg[t.id] = gp ? points(t) / gp : 0; });
    var oppSum = {}, oppN = {};
    norm.forEach(function (g) {
      oppSum[g.a] = (oppSum[g.a] || 0) + (ppg[g.h] || 0); oppN[g.a] = (oppN[g.a] || 0) + 1;
      oppSum[g.h] = (oppSum[g.h] || 0) + (ppg[g.a] || 0); oppN[g.h] = (oppN[g.h] || 0) + 1;
    });
    var sos = {};
    teams.forEach(function (t) { sos[t.id] = oppN[t.id] ? oppSum[t.id] / oppN[t.id] : 0; });

    var ctx = { games: norm, sos: sos, coinFlip: {} };
    var ordered = flatten(bucketsBy(teams, points).map(function (b) { return breakTie(b, ctx); }));
    rank.lastCoinFlip = ctx.coinFlip;   // ids decided by the A→Z stand-in on the last call
    return ordered;
  }

  var api = { rank: rank, points: points };
  if (typeof window !== 'undefined') window.DVSLStandings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
