/* DVSL index.html: Player of the Week card (home), Player of the Week
 * archive + Records Book (Leaders page tabs). Math lives in
 * js/dvsl-awards.js; this file only renders.
 *
 * Reads globals that index.html's classic scripts define: PLAYERS, TEAMS,
 * ALL_TEAMS, SCHEDULE_PREVIEW, LOGO_TEAMS, esc, getDb, openModal, goPage,
 * openBoxEl, boxDataAttrs, buildLeadersPage, plus window.FINAL_BOX_SCORES.
 * Every Firestore-sourced value goes through esc(); clicks use data-*
 * attributes and one delegated listener, never text spliced into handlers.
 */
(function () {
  'use strict';
  var A = window.DVSLAwards;
  if (!A) return;
  var state = { data: null, awards: null, tab: 'leaders' };

  function e(s) { return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s); }
  function teamOf(id) {
    var list = (typeof ALL_TEAMS !== 'undefined' && ALL_TEAMS.length) ? ALL_TEAMS : ((typeof TEAMS !== 'undefined') ? TEAMS : []);
    return list.filter(function (t) { return t.id === id; })[0] || null;
  }
  function teamName(id) { var t = teamOf(id); return t ? (t.name || t.short || id) : String(id || '').toUpperCase(); }
  function teamShort(id) { var t = teamOf(id); return t ? (t.short || t.id) : String(id || '').toUpperCase(); }
  function hasLogo(id) { try { return LOGO_TEAMS.has(String(id || '').toLowerCase()); } catch (_) { return false; } }
  function logo(id, cls) {
    if (hasLogo(id)) return '<img class="' + cls + '" src="logos/' + e(String(id).toLowerCase()) + '.png" alt="' + e(teamName(id)) + '" loading="lazy" draggable="false">';
    return '<span class="' + cls + ' aw-logo-txt">' + e(teamShort(id)) + '</span>';
  }
  function safePhoto(u) {
    var s = String(u == null ? '' : u).trim();
    return /^https:\/\//i.test(s) ? s : '';
  }

  // ── data ──────────────────────────────────────────────────────────────
  function loadAwardDocs() {
    if (state.awards) return state.awards;
    state.awards = (async function () {
      try {
        var db = await getDb();
        var d = window._fbDeps;
        var snap = await d.getDocs(d.collection(db, 'awards'));
        return snap.docs.map(function (x) { return Object.assign({ id: x.id }, x.data()); });
      } catch (err) {
        // Rule not deployed yet / offline: the formula picks still show.
        console.warn('[DVSL] awards overrides unavailable:', err && err.message);
        return [];
      }
    })();
    return state.awards;
  }

  async function getData() {
    if (window._dataPromise) { try { await window._dataPromise; } catch (_) {} }
    var awardDocs = await loadAwardDocs();
    var box = window.FINAL_BOX_SCORES || [];
    if (state.data && state.data.box === box) return state.data;
    var games = (typeof SCHEDULE_PREVIEW !== 'undefined') ? SCHEDULE_PREVIEW : [];
    var teams = (typeof ALL_TEAMS !== 'undefined') ? ALL_TEAMS : [];
    var yr = (window.LEAGUE_CONFIG && window.LEAGUE_CONFIG.season && window.LEAGUE_CONFIG.season.year) || new Date().getFullYear();
    var opts = { games: games, teams: teams, defaultYear: yr };
    var lines = A.battingLines(box, opts);
    opts.lines = lines;
    var weeks = A.applyOverrides(A.weeks(box, opts), awardDocs);
    var byGame = {};
    box.forEach(function (b) { byGame[String(b.game_id || b.id)] = b; });
    state.data = { box: box, lines: lines, weeks: weeks, records: A.records(box, opts), byGame: byGame };
    return state.data;
  }

  function playerFor(w) {
    if (w.player_id) {
      var byId = (typeof PLAYERS !== 'undefined' ? PLAYERS : []).filter(function (p) { return p.id === w.player_id; })[0];
      if (byId) return byId;
    }
    return A.matchPlayer(w.name, w.team, typeof PLAYERS !== 'undefined' ? PLAYERS : []);
  }
  // data-* attributes that the delegated click handler reads.
  function targetAttrs(name, team, pid) {
    var p = pid ? { id: pid } : A.matchPlayer(name, team, typeof PLAYERS !== 'undefined' ? PLAYERS : []);
    return p ? ' data-aw-pid="' + e(p.id) + '"' : ' data-aw-team="' + e(team) + '"';
  }
  function gameAttrs(line, data) {
    var bs = data.byGame[line.gameId] || {};
    var g = (typeof SCHEDULE_PREVIEW !== 'undefined' ? SCHEDULE_PREVIEW : []).filter(function (x) { return x.id === line.gameId; })[0];
    var as = g && g.as != null ? g.as : bs.away_score, hs = g && g.hs != null ? g.hs : bs.home_score;
    return boxDataAttrs(teamShort(line.away), teamShort(line.home), as, hs, bs.field || (g && g.field) || '', A.shortDate(line.iso) || bs.date || '', line.gameId) + ' data-aw-box="1"';
  }

  // ── home card ─────────────────────────────────────────────────────────
  async function renderHome() {
    var host = document.getElementById('home-potw');
    if (!host) return;
    var data = await getData();
    var w = A.currentPick(data.weeks);
    if (!w) { host.hidden = true; host.innerHTML = ''; return; }
    var many = w.winners.length > 1;
    var eyebrow = (many ? 'Co-Players of the Week' : 'Player of the Week') + ' <span class="potw-sep">|</span> ' +
      e(w.label) + (w.dates ? ', ' + e(w.dates) : '');
    var people = w.winners.map(function (p) {
      var pl = playerFor(p);
      var photo = many ? '' : safePhoto(w.photo_url);
      var line = A.statLine(p);
      return '<div class="potw-player" role="link" tabindex="0"' + targetAttrs(p.name, p.team, pl && pl.id) +
        ' aria-label="' + e(p.name + ', ' + teamName(p.team)) + '">' +
        '<div class="potw-media">' +
          (photo ? '<img class="potw-photo" src="' + e(photo) + '" alt="" loading="lazy">' : '') +
          logo(p.team, 'potw-logo') + '</div>' +
        '<div class="potw-txt">' +
          '<div class="potw-name">' + e(p.name) + '</div>' +
          '<div class="potw-team">' + e(teamName(p.team)) + '</div>' +
          (line ? '<div class="potw-line">' + e(line) + '</div>' : '') +
        '</div>' +
        '<span class="potw-go" aria-hidden="true">Profile &rarr;</span>' +
      '</div>';
    }).join('');
    host.innerHTML = '<div class="container">' +
      '<div class="potw-head"><div class="potw-eyebrow">' + eyebrow + '</div>' +
      '<a class="potw-all" href="#leaders/potw" data-aw-tab="potw">All weeks &rarr;</a></div>' +
      '<div class="potw-people' + (many ? ' many' : '') + '">' + people + '</div>' +
      (w.note ? '<div class="potw-note">' + e(w.note) + '</div>' : '') +
      '</div>';
    host.hidden = false;
  }

  // ── leaders: Player of the Week archive ──────────────────────────────
  async function renderArchive() {
    var host = document.getElementById('lp-potw');
    if (!host) return;
    var data = await getData();
    var done = data.weeks.filter(function (w) { return w.complete; });
    var head = '<div class="aw-intro"><strong>How it is picked.</strong> ' + e(A.FORMULA_TEXT) +
      ' The league can name its own pick for a week.</div>';
    if (!done.length) { host.innerHTML = head + '<div class="aw-empty">No completed weeks yet. The first pick shows up once a week of games is final.</div>'; return; }
    var bySeason = {};
    done.forEach(function (w) { (bySeason[w.season] = bySeason[w.season] || []).push(w); });
    host.innerHTML = head + Object.keys(bySeason).sort().reverse().map(function (yr) {
      return '<div class="aw-season">' + e(yr) + ' season</div><ol class="aw-list">' + bySeason[yr].map(function (w) {
        var when = '<div class="aw-when"><span class="aw-wk">' + e(w.label) + '</span><span class="aw-dates">' + e(w.dates) + '</span></div>';
        if (!w.winners.length) {
          return '<li class="aw-row aw-none">' + when + '<div class="aw-who"><div class="aw-muted">' +
            (w.cleared ? 'No pick this week' : 'No qualified hitters') + '</div>' +
            (w.note ? '<div class="aw-note">' + e(w.note) + '</div>' : '') + '</div></li>';
        }
        return '<li class="aw-row">' + when + '<div class="aw-who">' + w.winners.map(function (p) {
          var pl = playerFor(p), line = A.statLine(p);
          return '<div class="aw-person" role="link" tabindex="0"' + targetAttrs(p.name, p.team, pl && pl.id) + '>' +
            logo(p.team, 'aw-logo') +
            '<div class="aw-ptxt"><div class="aw-name">' + e(p.name) + '</div>' +
            '<div class="aw-team">' + e(teamName(p.team)) + '</div>' +
            (line ? '<div class="aw-line">' + e(line) + '</div>' : '') + '</div>' +
            (p.points != null && p.games ? '<div class="aw-pts">' + e(p.points) + '<small>pts</small></div>' : '') +
          '</div>';
        }).join('') +
          (w.overridden ? '<div class="aw-tag">League pick</div>' : '') +
          (w.note ? '<div class="aw-note">' + e(w.note) + '</div>' : '') +
        '</div></li>';
      }).join('') + '</ol>';
    }).join('');
  }

  // ── leaders: Records Book ─────────────────────────────────────────────
  async function renderRecords() {
    var host = document.getElementById('lp-records');
    if (!host) return;
    var data = await getData();
    var R = data.records;
    if (!R.seasons.length) { host.innerHTML = '<div class="aw-empty">Records appear once box scores are entered.</div>'; return; }
    var covered = R.seasons.join(', ');
    var intro = '<div class="aw-intro"><strong>Seasons covered: ' + e(covered) + '.</strong> ' +
      (R.seasons.length === 1 ? 'Box scores start with the ' + e(covered) + ' season, so these are the bests so far. ' : '') +
      'Season totals include playoff games, same as the Stats page. Batting average needs at least ' + e(R.minPA) + ' plate appearances.</div>';
    function holderGame(h) {
      return '<li class="rb-holder">' +
        '<span class="rb-who" role="link" tabindex="0"' + targetAttrs(h.name, h.team) + '>' + logo(h.team, 'rb-logo') +
          '<span class="rb-name">' + e(h.name) + '</span></span>' +
        '<button type="button" class="rb-game" ' + gameAttrs(h, data) + '>' + e(A.shortDate(h.iso) || 'Game') +
          ' vs ' + e(teamShort(h.opp)) + (h.playoff ? ', playoffs' : '') + (R.seasons.length > 1 && h.season ? ', ' + e(h.season) : '') + '</button>' +
      '</li>';
    }
    function holderSeason(h, key) {
      var extra = key === 'avg' ? (h.h + ' for ' + h.ab + ', ' + h.pa + ' PA') : (h.games + ' games');
      return '<li class="rb-holder">' +
        '<span class="rb-who" role="link" tabindex="0"' + targetAttrs(h.name, h.team) + '>' + logo(h.team, 'rb-logo') +
          '<span class="rb-name">' + e(h.name) + '</span></span>' +
        '<span class="rb-meta">' + e(h.season) + ' season, ' + e(extra) + '</span>' +
      '</li>';
    }
    function block(title, cats, fn) {
      if (!cats.length) return '';
      return '<h3 class="rb-title">' + title + '</h3><div class="rb-table">' + cats.map(function (c) {
        return '<div class="rb-row"><div class="rb-cat">' + e(c.label) + '</div>' +
          '<div class="rb-val">' + e(c.display) + '</div>' +
          '<ul class="rb-holders">' + c.holders.map(function (h) { return fn(h, c.key); }).join('') + '</ul>' +
          (c.holders.length > 1 ? '<div class="rb-tie">' + e(c.holders.length) + ' tied</div>' : '') +
        '</div>';
      }).join('') + '</div>';
    }
    host.innerHTML = intro + block('Single game', R.game, holderGame) + block('Single season', R.season, holderSeason);
  }

  // ── leaders tab switch ────────────────────────────────────────────────
  var TABS = ['leaders', 'potw', 'records'];
  function setTab(tab, fromRoute) {
    if (TABS.indexOf(tab) < 0) tab = 'leaders';
    state.tab = tab;
    var wrap = document.querySelector('#pg-leaders .leaders-page-wrap');
    var aw = document.getElementById('lp-awards-wrap');
    if (wrap) wrap.style.display = tab === 'leaders' ? '' : 'none';
    if (aw) aw.hidden = tab === 'leaders';
    var p = document.getElementById('lp-potw'), r = document.getElementById('lp-records');
    if (p) p.hidden = tab !== 'potw';
    if (r) r.hidden = tab !== 'records';
    document.querySelectorAll('#lp-tabs [data-lp-tab]').forEach(function (b) {
      var on = b.getAttribute('data-lp-tab') === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (tab === 'potw') renderArchive().catch(function (err) { console.error(err); });
    if (tab === 'records') renderRecords().catch(function (err) { console.error(err); });
    if (!fromRoute) {
      try { history.replaceState({ page: 'leaders', extra: tab === 'leaders' ? null : tab }, '', '#leaders' + (tab === 'leaders' ? '' : '/' + tab)); } catch (_) {}
    }
  }
  window.dvslLeadersTab = setTab;

  // ── one delegated click handler for everything above ─────────────────
  function activate(el, ev) {
    var tabBtn = el.closest('[data-lp-tab]');
    if (tabBtn) { setTab(tabBtn.getAttribute('data-lp-tab')); return true; }
    var toTab = el.closest('[data-aw-tab]');
    if (toTab) { if (ev) ev.preventDefault(); goPage('leaders', toTab.getAttribute('data-aw-tab')); return true; }
    var box = el.closest('[data-aw-box]');
    if (box) { openBoxEl(box); return true; }
    var who = el.closest('[data-aw-pid],[data-aw-team]');
    if (who) {
      var pid = who.getAttribute('data-aw-pid');
      if (pid) openModal(pid); else goPage('team', who.getAttribute('data-aw-team'));
      return true;
    }
    return false;
  }
  function scoped(t) { return t && t.closest && t.closest('#home-potw, #lp-tabs, #lp-awards-wrap'); }
  document.addEventListener('click', function (ev) { if (scoped(ev.target)) activate(ev.target, ev); });
  document.addEventListener('keydown', function (ev) {
    if ((ev.key === 'Enter' || ev.key === ' ') && scoped(ev.target) && ev.target.getAttribute('role') === 'link') {
      ev.preventDefault(); activate(ev.target, ev);
    }
  });

  function start() {
    renderHome().catch(function (err) { console.error('[DVSL] POTW card:', err); });
    var m = /^#leaders\/(potw|records)$/.exec(location.hash || '');
    if (m) setTab(m[1], true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
