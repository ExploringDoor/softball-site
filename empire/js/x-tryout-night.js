/* Tryout night: coach check in, scoring and offers. Saves on this device only (emp_x_tryout). Nothing is sent. */
(function () {
  'use strict';
  window.EMPIRE_EXT = window.EMPIRE_EXT || { pages: {}, init: {} };
  var KEY = 'emp_x_tryout';
  var AGES = ['10U', '12U', '13U', '14U', '16U', '18U'];
  var SITES = ['Seaford', 'Huntington Station'];
  var SKILLS = [['hit', 'Hitting'], ['fld', 'Fielding'], ['thr', 'Throwing'], ['spd', 'Speed'], ['pit', 'Pitching']];
  var GRAD = { '10U': 2035, '12U': 2033, '13U': 2032, '14U': 2031, '16U': 2029, '18U': 2027 };
  var POS = ['SS', 'C', 'P', 'OF', '2B', '3B', '1B', 'CF', 'P / 1B', 'OF / C', 'SS / P', 'LF', '3B / P', 'C / 1B'];
  var MIX = ['10U', '10U', '12U', '12U', '13U', '13U', '14U', '14U', '14U', '16U', '16U', '16U', '18U', '18U'];

  function load(H) {
    var s = H.sget(KEY);
    if (!s || typeof s !== 'object' || !Array.isArray(s.list)) return { age: '16U', site: SITES[0], view: 'list', open: '', next: 101, list: [] };
    s.list = s.list.filter(function (p) { return p && p.id && p.name; });
    s.list.forEach(function (p) { if (!p.s || typeof p.s !== 'object') p.s = {}; });
    if (AGES.indexOf(s.age) < 0) s.age = '16U';
    if (SITES.indexOf(s.site) < 0) s.site = SITES[0];
    if (s.view !== 'ranked') s.view = 'list';
    var top = s.list.reduce(function (m, p) { return Math.max(m, +p.bib || 0); }, 100);
    s.list.forEach(function (p) { if (!(+p.bib)) p.bib = ++top; });
    s.next = Math.max(+s.next || 0, top + 1);
    return s;
  }
  function scoredKeys(p) { return SKILLS.filter(function (k) { return p.s && p.s[k[0]]; }); }
  function avg(p) { var k = scoredKeys(p); return k.length ? k.reduce(function (a, x) { return a + p.s[x[0]]; }, 0) / k.length : 0; }
  function first(n) { return /^Sample /.test(n) ? n : String(n).split(/\s+/)[0]; }
  function teamsFor(D, age) { return D.teams.filter(function (t) { return t.age === age; }); }
  function offerText(H, p) {
    var t = H.team(p.team) || teamsFor(H.D, p.age)[0];
    return 'Hi, thanks for trying out with Empire Softball. We would like to offer ' + first(p.name) + ' a spot on ' + (t ? t.name : 'our ' + p.age + ' team') +
      ' for the 2027 season. Reply to this message to let us know, and we will send the registration link. ' + (t ? 'Coach ' + t.coach : 'The Empire coaches');
  }

  window.EMPIRE_EXT.pages.tryoutnight = function (H) {
    return H.pageHead('Tryout <span class="wm">night</span>', 'Check players in, score them as they go, then rank each age group and draft the offers.', ['coach.html', 'Coach desk']) +
      '<section class="sec sec--tight"><div class="wrap"><p class="note">Sample: on the real site this page sits behind the coach sign in. Here everything saves on this phone or computer only, and nothing is ever sent or charged.</p>' +
      '<div id="tnNums"></div>' +
      '<p class="kicker">Location</p><div class="chips" id="tnSite" role="group" aria-label="Tryout location"></div>' +
      '<p class="kicker mt">Age group</p><div class="chips" id="tnAge" role="group" aria-label="Age group"></div>' +
      '<div class="chips" id="tnView" role="group" aria-label="View"><button type="button" class="chip" data-view="list">Check in and score</button><button type="button" class="chip" data-view="ranked">Ranked</button></div>' +
      '<div class="hero__cta"><button type="button" class="btn btn--sm btn--ink" id="tnLoad">Load sample tryout players</button><button type="button" class="btn btn--sm" id="tnCsv">Download spreadsheet</button><button type="button" class="btn btn--sm" id="tnClear">Clear tryout night</button></div>' +
      '<p class="fine" id="tnMsg" role="status"></p><div id="tnBody"></div></div></section>';
  };

  window.EMPIRE_EXT.init.tryoutnight = function (H) {
    var S = load(H), esc = H.esc, $ = function (id) { return document.getElementById(id); };
    function save() { H.sset(KEY, S); }
    function byId(id) { return S.list.filter(function (p) { return p.id === id; })[0]; }
    function add(p) { p.bib = S.next++; p.s = p.s || {}; S.list.push(p); }

    function nums() {
      var a = S.list;
      $('tnNums').innerHTML = '<div class="nums nums--3"><div><b>' + a.filter(function (p) { return p.in; }).length + '</b><span>Checked in</span></div><div><b>' +
        a.filter(function (p) { return scoredKeys(p).length; }).length + '</b><span>Scored</span></div><div><b>' + a.filter(function (p) { return p.offer; }).length + '</b><span>Offers</span></div></div>';
    }
    function chips() {
      $('tnSite').innerHTML = SITES.map(function (s) { return '<button type="button" class="chip" data-site="' + esc(s) + '" aria-pressed="' + (S.site === s) + '">' + esc(s) + '</button>'; }).join('');
      $('tnAge').innerHTML = AGES.map(function (a) { var n = S.list.filter(function (p) { return p.age === a; }).length; return '<button type="button" class="chip" data-age="' + a + '" aria-pressed="' + (S.age === a) + '">' + a + (n ? ' <b class="tn-n">' + n + '</b>' : '') + '</button>'; }).join('');
      [].forEach.call($('tnView').querySelectorAll('[data-view]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === S.view)); });
    }
    function scoreCard(p) {
      return '<div class="tn-card">' + SKILLS.map(function (k) {
        return '<div class="tn-skill"><span class="tn-lab">' + k[1] + '</span><div class="tn-sc" role="group" aria-label="' + k[1] + ' score">' + [1, 2, 3, 4, 5].map(function (n) {
          return '<button type="button" data-score="' + k[0] + '" data-n="' + n + '" data-id="' + p.id + '" aria-pressed="' + (p.s[k[0]] === n) + '" aria-label="' + k[1] + ' ' + n + ' of 5">' + n + '</button>';
        }).join('') + '</div></div>';
      }).join('') + '<div class="fld"><label for="tnNote' + p.id + '">Note</label><input id="tnNote' + p.id + '" data-note="' + p.id + '" maxlength="120" placeholder="Quick bat, needs work on footwork" value="' + esc(p.note || '') + '"></div>' +
        '<p class="fine">Saves as you tap. Tap a number again to clear it.</p></div>';
    }
    function row(p) {
      var open = S.open === p.id;
      return '<div class="tn-row' + (open ? ' tn-row--open' : '') + '"><span class="tn-bib" aria-label="Bib ' + p.bib + '">' + p.bib + '</span>' +
        '<button type="button" class="tn-who" data-open="' + p.id + '" aria-expanded="' + open + '"><b>' + esc(p.name) + '</b><i>' + esc([p.grad, p.pos, p.in && p.site ? 'at ' + p.site : ''].filter(Boolean).join(', ')) + (p.src === 'signup' ? ' <span class="tag">Signed up online</span>' : '') +
        (scoredKeys(p).length ? ' <span class="tag tag--gold">Avg ' + avg(p).toFixed(1) + '</span>' : '') + '</i></button>' +
        '<span class="tn-togs"><button type="button" class="tn-t" data-in="' + p.id + '" aria-pressed="' + !!p.in + '">' + (p.in ? 'Checked in' : 'Not here yet') + '</button>' +
        '<button type="button" class="tn-t tn-t--fee" data-paid="' + p.id + '" aria-pressed="' + !!p.paid + '">' + (p.paid ? '$20 fee paid' : '$20 fee owed') + '</button></span>' +
        (open ? scoreCard(p) : '') + '</div>';
    }
    function ranked(list) {
      list = list.slice().sort(function (a, b) { return avg(b) - avg(a) || a.bib - b.bib; });
      return list.map(function (p, i) {
        var tl = teamsFor(H.D, p.age), has = scoredKeys(p).length;
        return '<div class="tn-row">' + (has ? '<span class="tn-bib tn-bib--rank" aria-label="Rank ' + (i + 1) + '">' + (i + 1) + '</span>' : '<span class="tn-bib tn-bib--none" aria-hidden="true"></span>') +
          '<span class="tn-who tn-who--flat"><b>' + esc(p.name) + ' <small>Bib ' + p.bib + '</small></b><i>' + (has ? 'Average ' + avg(p).toFixed(1) + ' from ' + has + ' of 5 skills' : 'Not scored yet') + '</i></span>' +
          '<span class="tn-togs"><button type="button" class="tn-t" data-offer="' + p.id + '" aria-pressed="' + !!p.offer + '">' + (p.offer ? 'Offer made' : 'Make an offer') + '</button></span>' +
          (p.offer ? '<div class="tn-card">' + (tl.length > 1 ? '<div class="fld"><label for="tnTeam' + p.id + '">Team</label><select id="tnTeam' + p.id + '" data-team="' + p.id + '">' + tl.map(function (t) { return '<option value="' + t.id + '"' + (p.team === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select></div>' : '') +
            '<div class="fld"><label for="tnDraft' + p.id + '">Draft offer message</label><textarea id="tnDraft' + p.id + '" readonly>' + esc(offerText(H, p)) + '</textarea></div>' +
            '<div><button type="button" class="btn btn--sm" data-copy="' + p.id + '">Copy message</button></div><p class="fine">Paste it into your own text or email. This page never sends it.</p></div>' : '') + '</div>';
      }).join('');
    }
    function draw(focus) {
      save(); nums(); chips();
      var list = S.list.filter(function (p) { return p.age === S.age; }).sort(function (a, b) { return a.bib - b.bib; });
      var body = !list.length ? '<div class="empty"><h3>No ' + S.age + ' players yet</h3><p>' + (S.list.length ? 'Pick another age group, or load the sample players.' : 'Load the sample players to try it. Any tryout sign ups from this device come in too.') + '</p></div>' :
        '<div class="sheetbox"><div class="sheetbox__top"><h3>' + S.age + ' tryouts</h3><span>' + list.length + ' players. Checking in at ' + esc(S.site) + '</span></div>' + (S.view === 'ranked' ? ranked(list) : list.map(row).join('')) + '</div>';
      $('tnBody').innerHTML = body;
      if (focus) { var f = $('tnBody').querySelector(focus); if (f) f.focus(); }
    }

    function loadSample() {
      var n = 0;
      if (!S.list.some(function (p) { return p.src === 'sample'; })) {
        MIX.forEach(function (age, i) {
          var p = { id: 's' + (i + 1), src: 'sample', name: 'Sample Player ' + (i + 1), age: age, grad: String(GRAD[age] + (i % 2)), pos: POS[i], in: i % 3 !== 2, paid: i % 2 === 0, s: {} };
          if (p.in) p.site = SITES[i % 2];
          if (i % 3 === 0) SKILLS.forEach(function (k, j) { p.s[k[0]] = j === 4 && i % 2 ? 0 : 1 + (i + j * 2) % 5; });
          add(p); n++;
        });
      }
      var inbox = H.sget('emp_inbox') || [];
      inbox.filter(function (m) { return m && m.kind === 'Tryout interest'; }).forEach(function (m) {
        var f = {}; (m.fields || []).forEach(function (x) { f[x[0]] = x[1]; });
        var name = String(f['Player name'] || '').trim(), age = AGES.indexOf(f['Age group']) > -1 ? f['Age group'] : '16U';
        if (!name || S.list.some(function (p) { return p.name.toLowerCase() === name.toLowerCase() && p.age === age; })) return;
        add({ id: 'i' + S.next, src: 'signup', name: name, age: age, grad: f['Grad year'] || '', pos: f['Positions'] || '', in: false, paid: false }); n++;
      });
      $('tnMsg').textContent = n ? 'Added ' + n + ' players. Bib numbers were given out in order.' : 'Nothing new to add. Everyone is already on the list.';
      draw();
    }
    function csv() {
      var q = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var rows = [['Bib', 'Name', 'Age group', 'Grad year', 'Positions', 'Location', 'Checked in', 'New player fee'].concat(SKILLS.map(function (k) { return k[1]; }), ['Average', 'Offer', 'Team', 'Note'])];
      S.list.slice().sort(function (a, b) { return AGES.indexOf(a.age) - AGES.indexOf(b.age) || avg(b) - avg(a); }).forEach(function (p) {
        var t = p.offer ? (H.team(p.team) || teamsFor(H.D, p.age)[0]) : null;
        rows.push([p.bib, p.name, p.age, p.grad, p.pos, p.site || '', p.in ? 'Yes' : 'No', p.paid ? 'Paid' : 'Owed'].concat(SKILLS.map(function (k) { return p.s[k[0]] || ''; }), [scoredKeys(p).length ? avg(p).toFixed(1) : '', p.offer ? 'Yes' : '', t ? t.name : '', p.note || '']));
      });
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv' }));
      a.download = 'empire-tryout-night.csv'; document.body.appendChild(a); a.click(); a.remove();
      $('tnMsg').textContent = S.list.length ? 'Spreadsheet saved with ' + S.list.length + ' players.' : 'No players yet, so the spreadsheet only has the column names.';
    }
    function copy(id, btn) {
      var ta = $('tnDraft' + id), done = function () { btn.textContent = 'Copied'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, function () { ta.select(); try { document.execCommand('copy'); done(); } catch (e) { } });
      else { ta.select(); try { document.execCommand('copy'); done(); } catch (e) { } }
    }

    $('main').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      var d = b.dataset, p;
      if (d.site) { S.site = d.site; draw(); }
      else if (d.age) { S.age = d.age; S.open = ''; draw(); }
      else if (d.view) { S.view = d.view; draw(); }
      else if (d.open) { S.open = S.open === d.open ? '' : d.open; draw('[data-open="' + d.open + '"]'); }
      else if (d.in && (p = byId(d.in))) { p.in = !p.in; if (p.in) p.site = S.site; draw('[data-in="' + p.id + '"]'); }
      else if (d.paid && (p = byId(d.paid))) { p.paid = !p.paid; draw('[data-paid="' + p.id + '"]'); }
      else if (d.offer && (p = byId(d.offer))) { p.offer = !p.offer; if (p.offer && !p.team && teamsFor(H.D, p.age)[0]) p.team = teamsFor(H.D, p.age)[0].id; draw('[data-offer="' + p.id + '"]'); }
      else if (d.score && (p = byId(d.id))) { var n = +d.n; p.s[d.score] = p.s[d.score] === n ? 0 : n; draw('[data-score="' + d.score + '"][data-id="' + p.id + '"][data-n="' + n + '"]'); }
      else if (d.copy) copy(d.copy, b);
      else if (b.id === 'tnLoad') loadSample();
      else if (b.id === 'tnCsv') csv();
      else if (b.id === 'tnClear' && window.confirm('Clear every player, score and offer from tryout night on this device?')) { S = { age: S.age, site: S.site, view: 'list', open: '', next: 101, list: [] }; $('tnMsg').textContent = 'Tryout night cleared.'; draw(); }
    });
    $('main').addEventListener('input', function (ev) {
      var t = ev.target, p;
      if (t.dataset.note && (p = byId(t.dataset.note))) { p.note = t.value; save(); }
    });
    $('main').addEventListener('change', function (ev) {
      var t = ev.target, p;
      if (t.dataset.team && (p = byId(t.dataset.team))) { p.team = t.value; $('tnDraft' + p.id).value = offerText(H, p); save(); }
    });
    draw();
  };
})();
