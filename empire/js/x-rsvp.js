/* Who is coming: rsvp.html?e=EVENTID&t=TEAMID. Families tap Going, Not going or Maybe for each event.
   Saves on this phone only (emp_x_rsvp). The seeded answers for White 16u Elite at the first event are SAMPLE. Static, no timers. */
(function () {
  'use strict';
  var X = window.EMPIRE_EXT = window.EMPIRE_EXT || { pages: {}, init: {} };
  X.pages = X.pages || {}; X.init = X.init || {};

  var KEY = 'emp_x_rsvp';
  var SEED_TEAM = 'white-16u-elite';
  /* SAMPLE answers shown for the first event until someone changes one */
  var SEED = {
    'angelina-mancuso': { a: 'yes' }, 'gabriella-marino': { a: 'yes' }, 'jessica-dobrzeniecki': { a: 'yes', note: 'Leaving after game 2 on Sunday' },
    'jocelyn-mueller': { a: 'no', note: 'School trip that weekend' }, 'julia-candelario': { a: 'yes' }, 'kaitlyn-lozano': { a: 'maybe', note: 'Will know by Wednesday' },
    'kerriann-orth': { a: 'yes' }, 'lia-arduini': { a: 'yes' }, 'logan-berg': { a: 'yes', note: 'Getting there at 9' }, 'megan-hobdy': { a: 'maybe' }
  };
  var ANS = [['yes', 'Going'], ['no', 'Not going'], ['maybe', 'Maybe']];
  function OKA(a) { return a === 'yes' || a === 'no' || a === 'maybe'; }

  function store(H) { var s = H.sget(KEY); return s && typeof s === 'object' && !Array.isArray(s) ? s : {}; }
  function firstEv(H) { var u = H.upcoming(H.EV()); return u[0] || H.EV()[0]; }
  function getEvent(H, id) { return H.EV().filter(function (x) { return x.id === id; })[0] || firstEv(H); }
  function teamsOf(H, e) { return (e.teams || []).filter(function (id) { return !!H.team(id); }); }
  function pickTeam(H, e, want) { var l = teamsOf(H, e); return l.indexOf(want) > -1 ? want : l[0]; }
  function isFirst(H, e) { var f = firstEv(H); return !!f && !!e && e.id === f.id; }
  /* _seedOff = someone changed a White 16u Elite answer (or cleared the event), so the sample label goes away */
  function isSeed(H, e, tid) { var s = store(H); return isFirst(H, e) && tid === SEED_TEAM && !s._seedOff && !(s[e.id] && typeof s[e.id] === 'object' && !Object.keys(s[e.id]).length); }
  function answers(H, e) {
    var s = store(H)[e.id], out = {};
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      Object.keys(s).forEach(function (k) { var v = s[k]; if (v && typeof v === 'object') out[k] = { a: OKA(v.a) ? v.a : '', note: typeof v.note === 'string' ? v.note : '' }; });
      return out;
    }
    if (isFirst(H, e)) Object.keys(SEED).forEach(function (k) { out[k] = { a: SEED[k].a, note: SEED[k].note || '' }; });
    return out;
  }
  function dateText(H, e) { try { return H.longDate(e.start) + (e.end && e.end !== e.start ? ' to ' + H.longDate(e.end) : ''); } catch (x) { return ''; } }
  function samplePlayers(tid) {
    var out = [];
    for (var i = 1; i <= 10; i++) out.push({ id: 'rs-' + tid + '-' + i, name: 'Sample Player ' + i, sample: true });
    return out;
  }
  function list(H, tid) {
    var r = H.roster(tid);
    if (r.length) return r;
    var sp = store(H)._sp;
    return sp && typeof sp === 'object' && sp[tid] ? samplePlayers(tid) : [];
  }

  function teamBox(H, e, tid) {
    var t = H.team(tid);
    if (!t) return '<div class="empty"><h3>No teams yet</h3><p>No Empire teams are listed for this event yet.</p></div>';
    var ps = list(H, tid), ans = answers(H, e), seed = isSeed(H, e, tid);
    if (!ps.length) {
      return '<div class="empty"><h3>Roster coming soon</h3><p>' + H.esc(t.name) + ' has not posted a roster yet. Add sample players to see how the page works.</p>' +
        '<button type="button" class="btn btn--ink" id="rsAddSp">Add sample players</button></div>';
    }
    var c = { yes: 0, no: 0, maybe: 0, none: 0 }, missing = [];
    ps.forEach(function (p) { var a = ans[p.id] && ans[p.id].a; if (OKA(a)) c[a]++; else { c.none++; missing.push(p); } });
    var notes = ps.filter(function (p) { return ans[p.id] && ans[p.id].note; }).map(function (p) { return '<li><b>' + H.esc(p.name) + ':</b> ' + H.esc(ans[p.id].note) + '</li>'; });
    var sum = '<div class="blk blk--wide"><div class="blk__top"><h2>Coach summary</h2>' + (seed ? H.sample('Sample answers') : '') + '</div>' +
      '<div class="nums rs-nums"><div><b>' + c.yes + '</b><span>Going</span></div><div><b>' + c.no + '</b><span>Not going</span></div>' +
      '<div><b>' + c.maybe + '</b><span>Maybe</span></div><div><b>' + c.none + '</b><span>No answer</span></div></div>' +
      (notes.length ? '<p class="kicker">Notes from families</p><ul class="rs-notes">' + notes.join('') + '</ul>' : '') +
      (missing.length ? '<p class="kicker mt">Has not answered</p><ul class="rs-miss">' + missing.map(function (p) { return '<li>' + H.esc(p.name) + '</li>'; }).join('') + '</ul>' +
        '<p class="mt"><a class="btn btn--gold" href="messages.html">Remind them ' + H.I.arrow + '</a></p><p class="fine">Opens Message families, where the coach writes the reminder.</p>' :
        '<p><b>Everyone has answered.</b></p>') + '</div>';
    var rows = ps.map(function (p) {
      var me = ans[p.id] || {};
      return '<li class="rs-row"><div class="rs-name"><b>' + H.esc(p.name) + '</b>' + (p.sample ? ' ' + H.sample() : '') + '</div>' +
        '<div class="rs-btns" role="group" aria-label="' + H.esc(p.name) + ' answer">' + ANS.map(function (o) {
          return '<button type="button" class="rs-b rs-b--' + o[0] + '" data-rsp="' + H.esc(p.id) + '" data-rsa="' + o[0] + '" aria-pressed="' + (me.a === o[0]) + '">' + o[1] + '</button>';
        }).join('') + '</div>' +
        '<input class="rs-note" type="text" maxlength="60" data-rsn="' + H.esc(p.id) + '" value="' + H.esc(me.note || '') + '" placeholder="Short note, like leaving after game 2" aria-label="Note for ' + H.esc(p.name) + '"></li>';
    }).join('');
    return '<div class="pgrid">' + sum +
      '<div class="blk blk--wide"><div class="blk__top"><h2>' + H.esc(t.name) + '</h2><span class="tag">' + ps.length + ' players</span></div>' +
      '<ul class="rs-list">' + rows + '</ul><p class="fine">Answers save on this phone. On the live site they go to the coach and every family on the team sees the same list.</p>' +
      '<p class="mt"><button type="button" class="btn btn--sm" id="rsClear">Clear answers for this event</button>' +
      (ps[0].sample ? ' <button type="button" class="btn btn--sm" id="rsDelSp">Take off sample players</button>' : '') + '</p></div></div>';
  }

  function body(H, e, tid) {
    var chips = teamsOf(H, e).map(function (id) {
      var t = H.team(id);
      return '<button type="button" class="chip" data-rst="' + H.esc(id) + '" aria-pressed="' + (id === tid) + '"><i class="sw sw--' + H.esc(t.color) + '" aria-hidden="true"></i>' + H.esc(t.name.replace('Empire ', '')) + '</button>';
    }).join('');
    return '<p class="rs-when"><b>' + H.esc(e.name) + '</b><br>' + H.esc(dateText(H, e)) +
      '<br>' + H.esc([e.place, e.city].filter(Boolean).join(', ')) + (e.sample ? ' ' + H.sample('Sample event') : '') + '</p>' +
      '<p class="kicker mt">Pick your team</p><div class="chips" role="group" aria-label="Pick your team">' + chips + '</div>' +
      '<div id="rsBox" class="mt">' + teamBox(H, e, tid) + '</div>';
  }

  X.pages.rsvp = function (H) {
    var e = getEvent(H, H.qs.get('e'));
    if (!e) return H.pageHead('Who is <span class="wm">coming</span>', 'No events on the schedule yet.', ['schedule.html', 'Where to watch']);
    var evs = H.upcoming(H.EV());
    if (evs.indexOf(e) < 0) evs = [e].concat(evs);
    var opts = evs.map(function (x) { return '<option value="' + H.esc(x.id) + '"' + (x === e ? ' selected' : '') + '>' + H.esc(x.name + (dateText(H, x) ? ', ' + dateText(H, x) : '')) + '</option>'; }).join('');
    return H.pageHead('Who is <span class="wm">coming</span>', 'Tap Going, Not going or Maybe for each event. The coach sees the count and who still needs to answer.', ['schedule.html', 'Where to watch']) +
      '<section class="sec sec--tight"><div class="wrap"><div class="form cform rs-pick"><div class="fld"><label for="rsEv">Event</label><select id="rsEv">' + opts + '</select></div></div>' +
      '<div id="rsMain">' + body(H, e, pickTeam(H, e, H.qs.get('t'))) + '</div></div></section>';
  };

  X.init.rsvp = function (H) {
    var e = getEvent(H, H.qs.get('e')); if (!e) return;
    var tid = pickTeam(H, e, H.qs.get('t'));
    var main = document.getElementById('rsMain');
    function url() { try { history.replaceState(null, '', location.pathname + '?e=' + encodeURIComponent(e.id) + (tid ? '&t=' + encodeURIComponent(tid) : '')); } catch (x) { } }
    function box() { var b = document.getElementById('rsBox'); if (b) b.innerHTML = teamBox(H, e, tid); }
    function save(fn) { var s = store(H), a = answers(H, e); fn(a, s); s[e.id] = a; if (tid === SEED_TEAM && isFirst(H, e)) s._seedOff = true; H.sset(KEY, s); }

    document.getElementById('rsEv').addEventListener('change', function () {
      e = getEvent(H, this.value); tid = pickTeam(H, e, tid);
      main.innerHTML = body(H, e, tid); url();
    });
    main.addEventListener('click', function (ev) {
      var c = ev.target.closest('[data-rst]');
      if (c) {
        tid = c.getAttribute('data-rst');
        [].forEach.call(main.querySelectorAll('[data-rst]'), function (b) { b.setAttribute('aria-pressed', String(b === c)); });
        box(); url(); return;
      }
      var b = ev.target.closest('[data-rsp]');
      if (b) {
        var pid = b.getAttribute('data-rsp'), v = b.getAttribute('data-rsa');
        if (!OKA(v)) return;
        save(function (a) { var me = a[pid] || {}; if (me.a === v) me.a = ''; else me.a = v; a[pid] = me; });
        box();
        var nb = [].filter.call(main.querySelectorAll('[data-rsa="' + v + '"]'), function (x) { return x.getAttribute('data-rsp') === pid; })[0]; if (nb) nb.focus();
        return;
      }
      if (ev.target.closest('#rsAddSp') || ev.target.closest('#rsDelSp')) {
        var add = !!ev.target.closest('#rsAddSp'), s = store(H);
        if (!s._sp || typeof s._sp !== 'object') s._sp = {}; if (add) s._sp[tid] = true; else delete s._sp[tid];
        H.sset(KEY, s); box(); return;
      }
      if (ev.target.closest('#rsClear')) { var s2 = store(H); s2[e.id] = {}; if (isFirst(H, e)) s2._seedOff = true; H.sset(KEY, s2); box(); }
    });
    main.addEventListener('change', function (ev) {
      var n = ev.target.closest('[data-rsn]'); if (!n) return;
      var pid = n.getAttribute('data-rsn'), v = n.value.trim().slice(0, 60);
      var wasSeed = isSeed(H, e, tid);
      save(function (a) { var me = a[pid] || {}; me.note = v; a[pid] = me; });
      if (wasSeed) box();
    });
  };
})();
