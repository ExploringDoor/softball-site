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
 *
 * Forfeits (Rule 19 points, Rule 24 Two Forfeits Rule), 2026-11:
 *  - games/{id}.forfeit = 'away' | 'home' (that side forfeited) | 'double'
 *    (both did). Absent, or any other value, is a normal game. A forfeit is a
 *    final (done: true) that carries NO runs: away_score / home_score stay
 *    null, and it never adds to runs scored, runs allowed or run differential.
 *  - Forfeit win = a W worth 3 points. Forfeit loss = an L worth
 *    FORFEIT_LOSS_POINTS (the rulebook doesn't list it; 0 until the
 *    commissioners say otherwise). Double forfeit = an L for both teams, worth
 *    0 points each. Team docs keep plain w/l/ti (forfeits included), so the
 *    point value of those losses comes from the games: points(t, tally[t.id]).
 *  - Head to head counts a forfeit as a win / loss like any other final.
 *  - A team charged with FORFEITS_TO_LOSE_SPOT (2) forfeits keeps its place in
 *    the table but loses its playoff spot; playoffRace() skips it.
 */
(function () {
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  var FORFEIT_LOSS_POINTS = 0;    // Rule 19 is silent on a forfeit loss; lead to confirm with the commissioners
  var FORFEIT_FEE = 50;           // the $50 umpire fee a forfeiting team owes the DVSL
  var FORFEITS_TO_LOSE_SPOT = 2;  // Rule 24

  // 'away' | 'home' | 'double' | ''  (the side that forfeited)
  function forfeitOf(g) {
    var f = g && g.forfeit;
    return (f === 'away' || f === 'home' || f === 'double') ? f : '';
  }

  // t = team row {w, l, ti}; ff = optional forfeit tally row {fl, df} for that
  // team (see forfeitTally). Without ff (or with no forfeits) this is the
  // plain 3 / 2 / 1.
  function points(t, ff) {
    var w = Number(t.w) || 0, l = Number(t.l) || 0, ti = Number(t.ti) || 0;
    var fl = 0, df = 0;
    if (ff) {
      fl = Math.min(l, Number(ff.fl) || 0);
      df = Math.min(l - fl, Number(ff.df) || 0);
    }
    return w * 3 + ti * 2 + (l - fl - df) * 1 + fl * FORFEIT_LOSS_POINTS;
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
  function isPlayoffRow(g) {
    return !!g && (g.wk === 'PL' || !!g.playoff || String(g.id || '').indexOf('po__') === 0);
  }

  // A forfeit row comes back with ff set and as/hs null (no runs).
  function normGame(g, alias) {
    if (!g || g.done !== true) return null;
    if (g.ppd || g.rained_out) return null;
    if (isPlayoffRow(g)) return null;
    var ff = forfeitOf(g);
    if (ff) {
      var fa = alias[String(g.away || '').trim().toLowerCase()];
      var fh = alias[String(g.home || '').trim().toLowerCase()];
      if (!fa || !fh || fa === fh) return null;
      return { a: fa, h: fh, as: null, hs: null, ff: ff };
    }
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
      if (g.ff) {
        if (g.ff === 'home') { ids[g.a].w++; ids[g.h].l++; }
        else if (g.ff === 'away') { ids[g.h].w++; ids[g.a].l++; }
        else { ids[g.a].l++; ids[g.h].l++; }
        return;
      }
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
    var tal = tallyFrom(teams, norm);
    var pts = function (t) { return points(t, tal[t.id]); };

    var ppg = {};
    teams.forEach(function (t) { var gp = gamesPlayed(t); ppg[t.id] = gp ? pts(t) / gp : 0; });
    var oppSum = {}, oppN = {};
    norm.forEach(function (g) {
      oppSum[g.a] = (oppSum[g.a] || 0) + (ppg[g.h] || 0); oppN[g.a] = (oppN[g.a] || 0) + 1;
      oppSum[g.h] = (oppSum[g.h] || 0) + (ppg[g.a] || 0); oppN[g.h] = (oppN[g.h] || 0) + 1;
    });
    var sos = {};
    teams.forEach(function (t) { sos[t.id] = oppN[t.id] ? oppSum[t.id] / oppN[t.id] : 0; });

    var ctx = { games: norm, sos: sos, coinFlip: {} };
    var ordered = flatten(bucketsBy(teams, pts).map(function (b) { return breakTie(b, ctx); }));
    rank.lastCoinFlip = ctx.coinFlip;   // ids decided by the A→Z stand-in on the last call
    return ordered;
  }

  // {teamId: {fw, fl, df, forfeits}} from normalized rows. fw = forfeit wins,
  // fl = forfeit losses, df = double forfeits, forfeits = fl + df (the count
  // Rule 24 and the $50 fee go by).
  function tallyFrom(teams, norm) {
    var out = {};
    teams.forEach(function (t) { out[t.id] = { fw: 0, fl: 0, df: 0, forfeits: 0 }; });
    norm.forEach(function (g) {
      if (!g.ff) return;
      var A = out[g.a], H = out[g.h];
      if (g.ff === 'double') { if (A) { A.df++; A.forfeits++; } if (H) { H.df++; H.forfeits++; } }
      else if (g.ff === 'away') { if (A) { A.fl++; A.forfeits++; } if (H) H.fw++; }
      else { if (H) { H.fl++; H.forfeits++; } if (A) A.fw++; }
    });
    return out;
  }

  /* forfeitTally(teams, games) -> {teamId: {fw, fl, df, forfeits}} (zeros for
   * teams without any). Counts only regular-season finals, like rank(). */
  function forfeitTally(teams, games) {
    teams = (teams || []).filter(Boolean);
    var alias = aliasMap(teams);
    return tallyFrom(teams, (games || []).map(function (g) { return normGame(g, alias); }).filter(Boolean));
  }

  function isoDay(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysBetween(a, b) {   // 'YYYY-MM-DD' strings, b - a in whole days
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }

  // Rule 20 lines by seed (1-based, among teams still eligible for the
  // playoffs). Bands past the team count are dropped.
  var BAND_DEFS = [
    { key: 'gold',          from: 1,  to: 6,  label: 'Gold' },
    { key: 'gold-playin',   from: 7,  to: 10, label: 'Gold play-in' },
    { key: 'silver',        from: 11, to: 14, label: 'Silver' },
    { key: 'silver-playin', from: 15, to: 18, label: 'Silver play-in' },
    { key: 'out',           from: 19, to: Infinity, label: 'Eliminated' }
  ];
  var GOLD_AUTO = 6, GOLD_LINE = 10;
  var SEASON_GRACE_DAYS = 21;   // Rule 11-12: a postponed game is played within 21 days

  /* playoffRace(ranked, games, opts) -> the playoff picture for a standings page.
   *   ranked: rank()'s output (active teams, best first). games: the same rows.
   *   opts.today: 'YYYY-MM-DD' (defaults to the device's date).
   * Returns {
   *   state: 'preseason' | 'live' | 'final',
   *   eligible: n teams in the race, skipped: n teams that lost their spot,
   *   bands: [{key, label, from, to}],
   *   rows: {teamId: {seed|null, band|null, forfeits, spotForfeited,
   *                   clinchedGold, eliminatedGold, remaining}}
   * }
   * Clinch / eliminated are only ever true when they are mathematically
   * certain, and only while the season is live:
   *   max = points now + 3 per remaining game, min = points now + 1 per
   *   remaining game (a loss; it assumes the team plays its games, a forfeit
   *   is Rule 24's business). Every unfinished regular-season game counts as
   *   remaining, postponed ones included, so the count can only run high,
   *   which only ever holds a marker back.
   *   Clinched Gold: fewer than 6 other eligible teams can reach this team's
   *   min (a tie counts against it).
   *   Eliminated from Gold: at least 10 other eligible teams are certain to
   *   finish strictly above this team's max.
   * The season is final once every regular-season game is done, a playoff
   * game has been played, or the last scheduled date is over 21 days past. */
  function playoffRace(ranked, games, opts) {
    opts = opts || {};
    ranked = (ranked || []).filter(Boolean);
    games = games || [];
    var today = opts.today || isoDay(new Date());
    var alias = aliasMap(ranked);
    var tal = forfeitTally(ranked, games);
    var remaining = {};
    ranked.forEach(function (t) { remaining[t.id] = 0; });
    var started = false, anyOpen = false, playoffsStarted = false, lastDate = '';
    games.forEach(function (g) {
      if (!g) return;
      if (isPlayoffRow(g)) { if (g.done === true) playoffsStarted = true; return; }
      var a = alias[String(g.away || '').trim().toLowerCase()];
      var h = alias[String(g.home || '').trim().toLowerCase()];
      if (!a || !h || a === h) return;
      var d = String(g.date_iso || '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > lastDate) lastDate = d;
      if (normGame(g, alias)) { started = true; return; }
      anyOpen = true; remaining[a]++; remaining[h]++;
    });
    var state = !started ? 'preseason'
      : (!anyOpen || playoffsStarted || (lastDate && daysBetween(lastDate, today) > SEASON_GRACE_DAYS)) ? 'final'
      : 'live';

    var rows = {}, elig = [];
    ranked.forEach(function (t) {
      var f = (tal[t.id] && tal[t.id].forfeits) || 0;
      var out = f >= FORFEITS_TO_LOSE_SPOT;
      var p = points(t, tal[t.id]);
      rows[t.id] = { seed: null, band: null, forfeits: f, spotForfeited: out, clinchedGold: false, eliminatedGold: false,
                     remaining: remaining[t.id] || 0, _min: p + (remaining[t.id] || 0), _max: p + 3 * (remaining[t.id] || 0) };
      if (!out) elig.push(t.id);
    });
    var n = elig.length;
    var bands = BAND_DEFS.filter(function (b) { return b.from <= n; })
      .map(function (b) { return { key: b.key, label: b.label, from: b.from, to: Math.min(b.to, n) }; });
    elig.forEach(function (id, i) {
      var r = rows[id]; r.seed = i + 1;
      for (var k = 0; k < bands.length; k++) if (r.seed >= bands[k].from && r.seed <= bands[k].to) { r.band = bands[k].key; break; }
      if (state !== 'live') return;
      var threats = 0, above = 0;
      elig.forEach(function (j) {
        if (j === id) return;
        if (rows[j]._max >= r._min) threats++;
        if (rows[j]._min > r._max) above++;
      });
      r.clinchedGold = threats < GOLD_AUTO;
      r.eliminatedGold = above >= GOLD_LINE;
    });
    Object.keys(rows).forEach(function (id) { delete rows[id]._min; delete rows[id]._max; });
    return { state: state, eligible: n, skipped: ranked.length - n, bands: bands, rows: rows };
  }

  var api = {
    rank: rank, points: points, forfeitOf: forfeitOf, forfeitTally: forfeitTally, playoffRace: playoffRace,
    FORFEIT_LOSS_POINTS: FORFEIT_LOSS_POINTS, FORFEIT_FEE: FORFEIT_FEE, FORFEITS_TO_LOSE_SPOT: FORFEITS_TO_LOSE_SPOT
  };
  if (typeof window !== 'undefined') window.DVSLStandings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
