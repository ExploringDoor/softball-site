/* DVSL awards math: Player of the Week + the Records Book.
 *
 * Pure functions, no DOM, no Firestore. index.html (js/dvsl-awards-ui.js),
 * admin.html (Player of the Week panel) and the node tests all call these,
 * so the public card, the admin panel and the tests can never disagree.
 *
 * Box score parsing mirrors index.html loadAllData() exactly (the code that
 * feeds the Stats and Leaders pages):
 *   - a box score counts when status === 'final' OR either side has a lineup
 *   - lineup = away_lineup || awayLineup || awayBatters (same for home)
 *   - 2B = d || '2b', 3B = t || '3b', SO = so ?? k
 *   - singles = stored s, else H minus 2B, 3B and HR
 *   - H = 1B + 2B + 3B + HR, TB = 1B + 2*2B + 3*3B + 4*HR
 *   - playoff box scores (id / game_id 'po__...') count, like the Stats page
 *   - a box score for a game ruled a forfeit (games.forfeit away|home|double)
 *     never counts: the result stands with no runs, so the stats go too
 * Rows marked dnp are skipped (they carry no stats).
 *
 * Player of the Week (one line on the page, see FORMULA_TEXT):
 *   points = total bases + RBI + runs + walks for the week (the same formula
 *   the site already uses for its season MVP card), minimum 3 plate
 *   appearances (AB + BB + SAC + SF). Highest points wins; ties share it.
 * A week is the league's game week: games.wk (the schedule's "Week N").
 * Playoff games form one extra week labelled Playoffs.
 */
(function () {
  var MIN_PA_WEEK = 3;
  var SEASON_AVG_MIN_PA = 30;
  var FORMULA_TEXT = 'Points = total bases + RBI + runs + walks for the week, minimum ' +
    MIN_PA_WEEK + ' plate appearances. Ties share the award.';
  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  var MNAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function int(v) { var n = parseInt(v, 10); return isFinite(n) ? n : 0; }
  function cleanName(s) {
    // Same as index.html _dvslCleanName: any Unicode space → ' ', lowercase.
    return String(s || '').replace(/\p{Z}+/gu, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
  }
  function isPlayoffId(id) { return /^po__/.test(String(id || '')); }

  function hasAnyLineup(bs) {
    var a = bs.away_lineup || bs.awayLineup || bs.awayBatters;
    var h = bs.home_lineup || bs.homeLineup || bs.homeBatters;
    return (Array.isArray(a) && a.length > 0) || (Array.isArray(h) && h.length > 0);
  }
  function countsAsFinal(bs) { return !!bs && (bs.status === 'final' || hasAnyLineup(bs)); }

  // Any date-ish value → 'YYYY-MM-DD' or ''. 'Jun 2' needs a year.
  function isoFrom(v, year) {
    if (v == null || v === '') return '';
    if (typeof v === 'object') {
      try {
        var d = typeof v.toDate === 'function' ? v.toDate() : (v instanceof Date ? v : null);
        if (d && !isNaN(d)) return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      } catch (_) {}
      return '';
    }
    var s = String(v).trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})$/.exec(s);
    if (m && year && MONTHS[m[1].toLowerCase()] != null) {
      return year + '-' + pad(MONTHS[m[1].toLowerCase()] + 1) + '-' + pad(int(m[2]));
    }
    return '';
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function yearOf(v) { var iso = isoFrom(v, 0); return iso ? int(iso.slice(0, 4)) : 0; }

  // "Jul 13" / "Jul 13 to 16" / "Jun 29 to Jul 2"
  function shortDate(iso) {
    if (!iso) return '';
    return MNAMES[int(iso.slice(5, 7)) - 1] + ' ' + int(iso.slice(8, 10));
  }
  function rangeLabel(dates) {
    var ds = (dates || []).filter(Boolean).slice().sort();
    if (!ds.length) return '';
    var a = ds[0], b = ds[ds.length - 1];
    if (a === b) return shortDate(a);
    if (a.slice(0, 7) === b.slice(0, 7)) return shortDate(a) + ' to ' + int(b.slice(8, 10));
    return shortDate(a) + ' to ' + shortDate(b);
  }

  // Team id normaliser: box scores carry ids ('tbir'); some old docs carry the
  // short code ('TBIR'). teams = [{id, short}].
  function teamNormalizer(teams) {
    var byShort = {}, ids = {};
    (teams || []).forEach(function (t) {
      if (!t || !t.id) return;
      ids[String(t.id).toLowerCase()] = String(t.id).toLowerCase();
      if (t.short) byShort[String(t.short).toLowerCase()] = String(t.id).toLowerCase();
    });
    return function (v) {
      var k = String(v || '').trim().toLowerCase();
      return ids[k] || byShort[k] || k;
    };
  }

  function gameIdOf(bs) { return String((bs && (bs.game_id || bs.id)) || ''); }

  // Games ruled a forfeit: {gameId: true}. Same test as
  // DVSLStandings.forfeitOf. Any box score entered for one of these games
  // is left out of season stats, leaders, Player of the Week and records.
  function forfeitGameIds(games) {
    var out = {};
    (games || []).forEach(function (g) {
      if (g && g.id && (g.forfeit === 'away' || g.forfeit === 'home' || g.forfeit === 'double')) out[String(g.id)] = true;
    });
    return out;
  }
  // ff = forfeitGameIds(games). Checks both the doc id and game_id, since
  // captain per-team docs are {gameId}_{teamId} with game_id set.
  function isForfeitBox(bs, ff) {
    if (!bs || !ff) return false;
    return !!(ff[String(bs.game_id || '')] || ff[String(bs.id || '')]);
  }

  // Normalise the schedule. Accepts raw games docs or index.html
  // SCHEDULE_PREVIEW rows: {id, wk, date_iso | rawDate | date, done, ppd | rained_out}.
  function normGames(games, defaultYear) {
    var out = [];
    (games || []).forEach(function (g) {
      if (!g || isPlayoffId(g.id)) return;
      var wk = int(g.wk);
      if (!wk || String(g.wk).indexOf('PL') === 0) return;
      var iso = isoFrom(g.date_iso, 0) || isoFrom(g.rawDate, defaultYear) || isoFrom(g.date, defaultYear);
      out.push({
        id: String(g.id || ''), wk: wk, iso: iso,
        season: int(g.season) || (iso ? int(iso.slice(0, 4)) : defaultYear),
        done: !!g.done, ppd: !!(g.ppd || g.rained_out)
      });
    });
    return out;
  }

  /* Every batter row of every counted box score, flattened.
   * opts: {games, teams, defaultYear} */
  function battingLines(boxScores, opts) {
    opts = opts || {};
    var year = int(opts.defaultYear) || new Date().getFullYear();
    var norm = teamNormalizer(opts.teams);
    var games = normGames(opts.games, year);
    var gById = {};
    games.forEach(function (g) { gById[g.id] = g; });
    var ff = forfeitGameIds(opts.games);
    var lines = [];
    (boxScores || []).forEach(function (bs) {
      if (!countsAsFinal(bs)) return;
      if (isForfeitBox(bs, ff)) return;
      var gid = gameIdOf(bs);
      var g = gById[gid] || null;
      var playoff = isPlayoffId(gid) || isPlayoffId(bs.id);
      var season = int(bs.season) || (g && g.season) || yearOf(bs.date) ||
        yearOf(bs.created_at) || yearOf(bs.timestamp) || year;
      var iso = (g && g.iso) || isoFrom(bs.date, season);
      var wk = playoff ? 'po' : (g ? g.wk : (int(bs.wk) || int(bs.week) || 0));
      if (!wk && iso) {
        // Unmatched regular-season box score: place it in the schedule week
        // whose dates surround it.
        var near = games.filter(function (x) { return x.season === season && x.iso; })
          .sort(function (a, b) { return Math.abs(dayNum(a.iso) - dayNum(iso)) - Math.abs(dayNum(b.iso) - dayNum(iso)); })[0];
        if (near && Math.abs(dayNum(near.iso) - dayNum(iso)) <= 3) wk = near.wk;
      }
      var away = norm(bs.away), home = norm(bs.home);
      var sides = [
        { lu: bs.away_lineup || bs.awayLineup || bs.awayBatters, team: away, opp: home, side: 'away' },
        { lu: bs.home_lineup || bs.homeLineup || bs.homeBatters, team: home, opp: away, side: 'home' }
      ];
      sides.forEach(function (sd) {
        if (!Array.isArray(sd.lu)) return;
        sd.lu.forEach(function (p) {
          if (!p || p.dnp) return;
          var name = String(p.name || '').replace(/[<>"`]/g, '').trim();
          if (!name) return;
          var d = int(p.d || p['2b']), t = int(p.t || p['3b']), hr = int(p.hr), h0 = int(p.h);
          var s = p.s !== undefined ? int(p.s) : Math.max(0, h0 - d - t - hr);
          var ab = int(p.ab), bb = int(p.bb), sac = int(p.sac), sf = int(p.sf);
          lines.push({
            key: cleanName(name) + '||' + sd.team,
            name: name, team: sd.team, opp: sd.opp, side: sd.side,
            gameId: gid, season: season, iso: iso, wk: wk, playoff: playoff,
            away: away, home: home,
            awayScore: bs.away_score, homeScore: bs.home_score,
            ab: ab, h: s + d + t + hr, s: s, d: d, t: t, hr: hr,
            rbi: int(p.rbi), r: int(p.r), bb: bb, so: int(p.so != null ? p.so : p.k),
            sac: sac, sf: sf, pa: ab + bb + sac + sf,
            tb: s + 2 * d + 3 * t + 4 * hr
          });
        });
      });
    });
    return lines;
  }
  function dayNum(iso) { return iso ? Date.UTC(int(iso.slice(0, 4)), int(iso.slice(5, 7)) - 1, int(iso.slice(8, 10))) / 864e5 : 0; }

  var SUM_KEYS = ['ab', 'h', 's', 'd', 't', 'hr', 'rbi', 'r', 'bb', 'so', 'sac', 'sf', 'pa', 'tb'];
  function aggregate(lines) {
    var map = {}, order = [];
    lines.forEach(function (l) {
      var a = map[l.key];
      if (!a) {
        a = map[l.key] = { key: l.key, name: l.name, team: l.team, games: 0, gameIds: [], season: l.season };
        SUM_KEYS.forEach(function (k) { a[k] = 0; });
        order.push(a);
      }
      a.games++;
      if (a.gameIds.indexOf(l.gameId) < 0) a.gameIds.push(l.gameId);
      SUM_KEYS.forEach(function (k) { a[k] += l[k] || 0; });
    });
    return order;
  }

  function potwScore(a) { return (a.tb || 0) + (a.rbi || 0) + (a.r || 0) + (a.bb || 0); }

  // Rank one week's batters. Returns {winners, score, candidates}.
  function pickWeek(lines) {
    var agg = aggregate(lines).filter(function (a) { return a.pa >= MIN_PA_WEEK; });
    agg.forEach(function (a) { a.points = potwScore(a); });
    agg.sort(function (a, b) { return b.points - a.points || b.tb - a.tb || a.name.localeCompare(b.name); });
    var top = agg.length ? agg[0].points : 0;
    var winners = top > 0 ? agg.filter(function (a) { return a.points === top; }) : [];
    return { winners: winners, score: top, candidates: agg };
  }

  /* Group lines into game weeks and pick each week.
   * opts: {games, teams, defaultYear, today ('YYYY-MM-DD')}
   * Returns weeks newest first: [{id, season, wk, label, dates, complete,
   *   winners, score, candidates, lines}] */
  function weeks(boxScores, opts) {
    opts = opts || {};
    var year = int(opts.defaultYear) || new Date().getFullYear();
    var today = opts.today || isoFrom(new Date(), 0);
    var games = normGames(opts.games, year);
    var lines = opts.lines || battingLines(boxScores, opts);
    var buckets = {};
    function bucket(season, wk) {
      var id = season + '_w' + wk;
      return buckets[id] || (buckets[id] = { id: id, season: season, wk: wk, gameDates: [], lineDates: [], games: [], lines: [] });
    }
    games.forEach(function (g) { var b = bucket(g.season, g.wk); b.games.push(g); if (g.iso) b.gameDates.push(g.iso); });
    lines.forEach(function (l) {
      if (!l.wk) return;
      var b = bucket(l.season, l.wk); b.lines.push(l); if (l.iso) b.lineDates.push(l.iso);
    });
    var all = Object.keys(buckets).map(function (k) { return buckets[k]; });
    var latestSeason = all.reduce(function (m, b) { return Math.max(m, b.season); }, 0);
    all.forEach(function (b) {
      var dates = b.gameDates.length ? b.gameDates : b.lineDates;
      b.dates = rangeLabel(dates);
      b.lastIso = dates.slice().sort().pop() || '';
    });
    all.forEach(function (b) {
      var numeric = b.wk !== 'po';
      if (b.season < latestSeason) b.complete = true;
      else if (!numeric) {
        // Playoffs: picked once every regular-season week is complete.
        b.complete = all.every(function (o) { return o.season !== b.season || o.wk === 'po' || regularDone(o, all); });
      } else b.complete = regularDone(b, all);
      // A week with no box scores yet has nothing to pick.
      if (!b.lines.length) b.complete = false;
      b.label = numeric ? ('Week ' + b.wk) : 'Playoffs';
      var pick = pickWeek(b.lines);
      b.winners = pick.winners; b.score = pick.score; b.candidates = pick.candidates;
    });
    function regularDone(b, list) {
      if (!b.games.length) return true;
      var allDone = b.games.every(function (g) { return g.done || g.ppd; });
      if (allDone) return true;
      // Rained out games that never got a ppd flag shouldn't hold a week
      // open forever: once a later week has a final, this week is done.
      return list.some(function (o) {
        return o.season === b.season && o.wk !== 'po' && o.wk > b.wk && o.games.some(function (g) { return g.done; });
      }) && b.lastIso !== '' && b.lastIso < today;
    }
    return all.sort(function (a, b) {
      return b.season - a.season || wkOrder(b.wk) - wkOrder(a.wk);
    });
  }
  function wkOrder(wk) { return wk === 'po' ? 999 : int(wk); }

  /* Admin overrides: awards/{season}_w{n} docs
   *   {season, wk, cleared:bool, picks:[{name, team, player_id}], note}
   * cleared → no pick that week; picks → replace the formula pick. */
  function applyOverrides(weekList, awardDocs) {
    var byId = {};
    (awardDocs || []).forEach(function (d) { if (d && d.id) byId[d.id] = d; });
    return weekList.map(function (w) {
      var o = byId[w.id];
      var out = Object.assign({}, w, { overridden: false, cleared: false, note: '' });
      if (!o) return out;
      out.note = String(o.note || '').slice(0, 140);
      if (o.photo_url && /^https:\/\//i.test(String(o.photo_url))) out.photo_url = String(o.photo_url);
      if (o.cleared === true) { out.cleared = true; out.overridden = true; out.winners = []; return out; }
      if (Array.isArray(o.picks) && o.picks.length) {
        out.overridden = true;
        out.winners = o.picks.slice(0, 4).map(function (p) {
          var key = cleanName(p.name) + '||' + String(p.team || '').toLowerCase();
          var found = (w.candidates || []).filter(function (c) { return c.key === key; })[0] ||
            aggregate((w.lines || []).filter(function (l) { return l.key === key; }))[0];
          var base = found ? Object.assign({}, found) : { key: key, name: String(p.name || ''), team: String(p.team || '').toLowerCase(), games: 0 };
          if (found && base.points == null) base.points = potwScore(base);
          if (p.player_id) base.player_id = String(p.player_id);
          return base;
        });
      }
      return out;
    });
  }

  // "3 for 4, 2B, 2 HR, 5 RBI, 2 R, BB" (+ ", 2 games")
  function statLine(a) {
    if (!a || !a.games) return '';
    var parts = [a.h + ' for ' + a.ab];
    function add(n, lbl) { if (n > 0) parts.push((n > 1 ? n + ' ' : '') + lbl); }
    add(a.d, '2B'); add(a.t, '3B'); add(a.hr, 'HR');
    if (a.rbi > 0) parts.push(a.rbi + ' RBI');
    if (a.r > 0) parts.push(a.r + ' R');
    add(a.bb, 'BB');
    if (a.games > 1) parts.push(a.games + ' games');
    return parts.join(', ');
  }

  /* Records Book.
   * Single game: H, HR, RBI, R, TB in one game.
   * Single season: AVG (min SEASON_AVG_MIN_PA PA), H, HR, RBI, R.
   * Ties are all returned. A category with a best of 0 is left out. */
  var GAME_CATS = [
    { key: 'h', label: 'Hits' }, { key: 'hr', label: 'Home runs' }, { key: 'rbi', label: 'RBI' },
    { key: 'r', label: 'Runs' }, { key: 'tb', label: 'Total bases' }
  ];
  var SEASON_CATS = [
    { key: 'avg', label: 'Batting average' }, { key: 'h', label: 'Hits' }, { key: 'hr', label: 'Home runs' },
    { key: 'rbi', label: 'RBI' }, { key: 'r', label: 'Runs' }
  ];
  function fmtAvg(v) { return v.toFixed(3).replace(/^0/, ''); }

  function records(boxScores, opts) {
    opts = opts || {};
    var lines = opts.lines || battingLines(boxScores, opts);
    var seasons = [];
    lines.forEach(function (l) { if (seasons.indexOf(l.season) < 0) seasons.push(l.season); });
    seasons.sort();
    var game = GAME_CATS.map(function (c) {
      var best = lines.reduce(function (m, l) { return Math.max(m, l[c.key] || 0); }, 0);
      if (best <= 0) return null;
      var holders = lines.filter(function (l) { return (l[c.key] || 0) === best; })
        .sort(function (a, b) { return (a.iso || '').localeCompare(b.iso || '') || a.name.localeCompare(b.name); });
      return { key: c.key, label: c.label, value: best, display: String(best), holders: holders };
    }).filter(Boolean);

    var bySeason = [];
    seasons.forEach(function (yr) {
      aggregate(lines.filter(function (l) { return l.season === yr; })).forEach(function (a) {
        a.season = yr; a.avg = a.ab > 0 ? a.h / a.ab : 0; bySeason.push(a);
      });
    });
    var season = SEASON_CATS.map(function (c) {
      var pool = c.key === 'avg' ? bySeason.filter(function (a) { return a.pa >= SEASON_AVG_MIN_PA && a.ab > 0; }) : bySeason;
      var best = pool.reduce(function (m, a) { return Math.max(m, a[c.key] || 0); }, 0);
      if (best <= 0) return null;
      var holders = pool.filter(function (a) { return Math.abs((a[c.key] || 0) - best) < 1e-9; })
        .sort(function (a, b) { return a.season - b.season || a.name.localeCompare(b.name); });
      return { key: c.key, label: c.label, value: best, display: c.key === 'avg' ? fmtAvg(best) : String(best), holders: holders };
    }).filter(Boolean);
    return { seasons: seasons, game: game, season: season, minPA: SEASON_AVG_MIN_PA };
  }

  /* Box score name+team → roster player. Same order index.html uses:
   * exact name on that team; name alone when only one roster player has it;
   * "A Miller" style initial + last name on that team. */
  function matchPlayer(name, team, players) {
    var nm = cleanName(name), tm = String(team || '').toLowerCase();
    var list = players || [];
    var hit = list.filter(function (p) { return cleanName(p.name) === nm && String(p.team || '').toLowerCase() === tm; })[0];
    if (hit) return hit;
    var same = list.filter(function (p) { return cleanName(p.name) === nm; });
    if (same.length === 1) return same[0];
    var parts = nm.split(' ');
    if (parts.length >= 2) {
      var f = parts[0].replace(/\./g, ''), last = parts.slice(1).join(' ');
      if (f.length === 1) {
        var c = list.filter(function (p) {
          var pp = cleanName(p.name).split(' ');
          return pp.length >= 2 && pp[0][0] === f && pp.slice(1).join(' ') === last && String(p.team || '').toLowerCase() === tm;
        });
        if (c.length === 1) return c[0];
      }
    }
    return null;
  }

  // The week the home page shows: newest complete week, skipping cleared ones.
  function currentPick(weekList) {
    return (weekList || []).filter(function (w) { return w.complete && !w.cleared && w.winners && w.winners.length; })[0] || null;
  }

  var api = {
    MIN_PA_WEEK: MIN_PA_WEEK, SEASON_AVG_MIN_PA: SEASON_AVG_MIN_PA, FORMULA_TEXT: FORMULA_TEXT,
    cleanName: cleanName, isoFrom: isoFrom, rangeLabel: rangeLabel, shortDate: shortDate,
    countsAsFinal: countsAsFinal, forfeitGameIds: forfeitGameIds, isForfeitBox: isForfeitBox,
    battingLines: battingLines, aggregate: aggregate,
    potwScore: potwScore, pickWeek: pickWeek, weeks: weeks, applyOverrides: applyOverrides,
    statLine: statLine, records: records, matchPlayer: matchPlayer, currentPick: currentPick,
    fmtAvg: fmtAvg
  };
  if (typeof window !== 'undefined') window.DVSLAwards = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
