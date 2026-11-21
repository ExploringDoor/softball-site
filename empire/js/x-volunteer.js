/* Volunteer jobs and family hours. Job board built from the schedule plus the club's own yearly events.
   Families claim a slot with one tap. Director view adds up hours. Saves on this device only (emp_x_volunteer). */
(function () {
  'use strict';
  var X = window.EMPIRE_EXT = window.EMPIRE_EXT || {};
  X.pages = X.pages || {}; X.init = X.init || {};
  var KEY = 'emp_x_volunteer', GOAL = 6;
  /* SAMPLE dates for the club events. Tournament jobs come from the schedule. */
  var CLUB = [
    { id: 'hol', date: '2026-12-12', event: 'Holiday party', place: 'Club party room', jobs: [['setup', 'Setup crew', 3, 2, 'Tables, decorations and the photo wall.'], ['clean', 'Cleanup crew', 3, 2, 'Trash, tables and lost and found.']] },
    { id: 'blk', date: '2027-01-09', event: 'Team blanket pickup', place: 'Club storage', jobs: [['pick', 'Blanket pickup table', 2, 2, 'Hand out the $40 blankets and check names off the list.']] },
    { id: 'hrd', date: '2027-03-20', event: 'Home Run Derby and Combine', place: 'Home field', jobs: [['raffle', 'Raffle table', 2, 3, 'Sell tickets and call the winners.'], ['watch', 'Stopwatch crew', 4, 3, 'Time home to first and other combine tests.'], ['count', 'Home run counter', 2, 3, 'Count home runs for each hitter and write them down.']] }
  ];
  var FAMS = ['Sample Family 1', 'Sample Family 2', 'Sample Family 3', 'Sample Family 4', 'Sample Family 5', 'Sample Family 6', 'Sample Family 7', 'Sample Family 8'];
  var SEED = { 'hol-setup': ['Sample Family 1', 'Sample Family 4'], 'hol-clean': ['Sample Family 2'], 'blk-pick': ['Sample Family 3', 'Sample Family 1'], 'hrd-watch': ['Sample Family 5', 'Sample Family 6', 'Sample Family 2'], 'hrd-raffle': ['Sample Family 7'], 'e1-book': ['Sample Family 4', 'Sample Family 8'], 'e1-tent': ['Sample Family 5'], 'e2-book': ['Sample Family 1'] };

  function jobs(H) {
    var out = [];
    CLUB.forEach(function (c) { c.jobs.forEach(function (j) { out.push({ id: c.id + '-' + j[0], date: c.date, event: c.event, place: c.place, name: j[1], slots: j[2], hrs: j[3], note: j[4] }); }); });
    H.upcoming(H.EV()).filter(function (e) { return e && e.id && /^\d{4}-\d{2}-\d{2}$/.test(e.start || ''); }).slice(0, 6).forEach(function (e) {
      var n = Math.max(1, Math.min(4, (e.teams || []).length)), where = [e.place, e.city].filter(function (x) { return x; }).join(', ') || 'Place to be set';
      out.push({ id: e.id + '-book', date: e.start, event: e.name || 'Tournament', place: where, name: 'Scorebook and pitch count', slots: n, hrs: 4, note: 'Keep the book and the pitch count for one team, one day.' });
      out.push({ id: e.id + '-tent', date: e.start, event: e.name || 'Tournament', place: where, name: 'Tent and cooler', slots: 2, hrs: 2, note: 'Bring and set up the team tent, ice the cooler.' });
    });
    return out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  function state(H) {
    var s = H.sget(KEY); s = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
    var raw = s.claims && typeof s.claims === 'object' && !Array.isArray(s.claims) ? s.claims : JSON.parse(JSON.stringify(SEED)), claims = {};
    Object.keys(raw).forEach(function (k) { if (Array.isArray(raw[k])) claims[k] = raw[k].filter(function (f) { return typeof f === 'string' && f.trim(); }); });
    return { fam: typeof s.fam === 'string' ? s.fam : '', claims: claims, extra: Array.isArray(s.extra) ? s.extra.filter(function (f) { return typeof f === 'string'; }) : [] };
  }
  function families(H, s) {
    var seen = Object.create(null), out = [], R = H.regs();
    function add(n) { n = String(n || '').trim(); if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = 1; out.push(n); } }
    FAMS.forEach(add); (Array.isArray(R) ? R : []).forEach(function (r) { if (r && !r.sample) add(r.parent); }); s.extra.forEach(add);
    Object.keys(s.claims).forEach(function (k) { (s.claims[k] || []).forEach(add); });
    return out;
  }
  function hours(H, s) {
    var t = Object.create(null), list = jobs(H);
    families(H, s).forEach(function (f) { t[f] = { hrs: 0, jobs: 0 }; });
    list.forEach(function (j) { (s.claims[j.id] || []).forEach(function (f) { t[f] = t[f] || { hrs: 0, jobs: 0 }; t[f].hrs += j.hrs; t[f].jobs += 1; }); });
    return t;
  }

  X.pages.volunteer = function (H) {
    return H.pageHead('Volunteer <span class="wm">jobs</span>', 'Every family gives a few hours a season. Pick your family, then tap an open slot to take it.', ['coach.html', 'Coach desk'],
      '<div class="hero__cta"><a class="btn btn--ink" href="#vlBoard">See open jobs ' + H.I.arrow + '</a><a class="btn" href="#vlDir">Director view</a></div>') +
      '<section class="sec sec--tight"><div class="wrap"><div class="split"><div><p class="kicker">Step 1</p><h2 class="disp vl__h">Who is <span class="wm">helping?</span></h2>' +
      '<form class="form cform mt" id="vlPick" novalidate><div class="fld"><label for="vlFam">Your family</label><select id="vlFam"></select></div>' +
      H.field('vlNew', 'Not on the list? Type your family name', 'text', 'autocomplete="family-name" placeholder="The Smith family"') +
      '<div><button class="btn btn--sm btn--ink" type="submit">Use this name</button></div><p class="fine">Saved on this phone so you only pick once.</p></form></div>' +
      '<div><div class="meter" id="vlMeter"></div></div></div></div></section>' +
      '<section class="sec sec--soft" id="vlBoard"><div class="wrap"><div class="sec__head"><h2 class="disp">Job <span class="wm">board</span></h2><p>Tournament jobs come from the schedule. Party, blanket and Derby dates are samples until the club sets them.</p></div>' +
      '<div class="chips vl__chips" role="group" aria-label="Show"><button type="button" class="chip" data-vf="all" aria-pressed="true">All jobs</button><button type="button" class="chip" data-vf="open" aria-pressed="false">Open slots</button><button type="button" class="chip" data-vf="mine" aria-pressed="false">My jobs</button></div>' +
      '<p class="vl__msg" id="vlMsg" aria-live="polite"></p><div id="vlJobs"></div></div></section>' +
      '<section class="sec sec--tight" id="vlDir"><div class="wrap"><p class="kicker">Director view</p><h2 class="disp vl__h">Family <span class="wm">hours</span></h2>' +
      '<p class="mt">On the real site this sits behind the coach sign in. Season goal is ' + GOAL + ' hours per family ' + H.sample('Sample goal') + '</p>' +
      '<div class="nums nums--3 mt" id="vlNums"></div><div class="hero__cta vl__act"><button type="button" class="btn btn--sm btn--ink" id="vlCsv">Download spreadsheet (CSV)</button><button type="button" class="btn btn--sm" id="vlReset">Start over with sample sign ups</button></div>' +
      '<div id="vlTbl"></div></div></section>';
  };

  X.init.volunteer = function (H) {
    var esc = H.esc, $ = function (id) { return document.getElementById(id); }, filt = 'all';
    function save(fn) { var s = state(H); fn(s); H.sset(KEY, s); draw(); }
    function when(d) { var a = H.ymd(d); return H.MON[a.m] + ' ' + a.d + ', ' + a.y; }
    function draw() {
      var s = state(H), fams = families(H, s), t = hours(H, s), me = s.fam, mine = me && t[me] ? t[me] : { hrs: 0, jobs: 0 };
      $('vlFam').innerHTML = '<option value="">Choose your family</option>' + fams.map(function (f) { return '<option' + (f === me ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('');
      var pct = Math.min(100, mine.hrs / GOAL * 100);
      $('vlMeter').innerHTML = me ? '<p class="kicker">' + esc(me) + '</p><b>' + mine.hrs + ' of ' + GOAL + ' hours</b><span>' + (mine.hrs >= GOAL ? 'Goal met. Thank you.' : (GOAL - mine.hrs) + ' to go this season') + '</span>' +
        '<div class="meter__bar" role="img" aria-label="' + Math.round(pct) + ' percent of the season goal"><i style="width:' + pct.toFixed(1) + '%"></i></div><p>' + mine.jobs + (mine.jobs === 1 ? ' job' : ' jobs') + ' taken. Goal of ' + GOAL + ' hours is a sample.</p>'
        : '<b>Pick your family</b><span>to see your hours</span><div class="meter__bar" role="img" aria-label="No family picked"><i style="width:0%"></i></div><p>Season goal: ' + GOAL + ' hours per family (sample).</p>';
      var list = jobs(H).filter(function (j) { var c = s.claims[j.id] || []; return filt === 'all' || (filt === 'open' ? c.length < j.slots : me && c.indexOf(me) > -1); }), last = '';
      $('vlJobs').innerHTML = list.length ? list.map(function (j) {
        var c = s.claims[j.id] || [], head = '', slots = '';
        if (j.date + j.event !== last) { last = j.date + j.event; head = '<h3 class="vl__day"><span>' + when(j.date) + ' ' + H.sample() + '</span>' + esc(j.event) + '<small>' + esc(j.place) + '</small></h3>'; }
        for (var i = 0; i < j.slots; i++) {
          var f = c[i];
          slots += !f ? '<button type="button" class="vl__slot" data-take="' + esc(j.id) + '">Open. Tap to take it</button>'
            : f === me ? '<button type="button" class="vl__slot vl__slot--me" data-give="' + esc(j.id) + '">' + esc(f) + '. Tap to give back</button>'
            : '<span class="vl__slot vl__slot--full">' + esc(f) + '</span>';
        }
        return head + '<div class="vl__job"><div class="vl__info"><b>' + esc(j.name) + '</b><span class="tag tag--gold">' + j.hrs + ' hrs</span><span class="tag">' + c.length + ' of ' + j.slots + ' filled</span><p>' + esc(j.note) + '</p></div><div class="vl__slots">' + slots + '</div></div>';
      }).join('') : '<p class="empty">' + (filt === 'mine' ? (me ? 'No jobs yet. Tap an open slot to take one.' : 'Pick your family first.') : 'Every slot is filled. Thank you.') + '</p>';
      var rows = Object.keys(t).map(function (f) { return [f, t[f].hrs, t[f].jobs]; }).sort(function (a, b) { return a[1] - b[1] || (a[0] < b[0] ? -1 : 1); });
      var under = rows.filter(function (r) { return r[1] < GOAL; }).length, tot = rows.reduce(function (a, r) { return a + r[1]; }, 0);
      $('vlNums').innerHTML = '<div><b>' + rows.length + '</b><span>families</span></div><div><b>' + under + '</b><span>under goal</span></div><div><b>' + tot + '</b><span>hours signed up</span></div>';
      $('vlTbl').innerHTML = '<div class="tblwrap mt"><table class="tbl"><thead><tr><th>Family</th><th>Hours</th><th>Jobs</th><th>Status</th></tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td>' + esc(r[0]) + '</td><td><b>' + r[1] + '</b></td><td>' + r[2] + '</td><td>' + (r[1] >= GOAL ? '<span class="tag tag--ink">Goal met</span>' : '<span class="tag">' + (GOAL - r[1]) + ' hrs short</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    function msg(t) { $('vlMsg').textContent = t; }
    $('vlFam').addEventListener('change', function () { var v = this.value; save(function (s) { s.fam = v; }); msg(v ? 'Picked ' + v + '.' : ''); });
    $('vlPick').addEventListener('submit', function (e) {
      e.preventDefault(); var v = $('vlNew').value.trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!v) { $('vlNew').classList.add('bad'); $('vlNew').focus(); return; }
      $('vlNew').classList.remove('bad'); $('vlNew').value = '';
      save(function (s) { if (families(H, s).map(function (f) { return f.toLowerCase(); }).indexOf(v.toLowerCase()) < 0) s.extra.push(v); else v = families(H, s).filter(function (f) { return f.toLowerCase() === v.toLowerCase(); })[0]; s.fam = v; });
      msg('Picked ' + v + '. Now tap an open slot.');
    });
    $('vlBoard').addEventListener('click', function (e) {
      var ch = e.target.closest('[data-vf]');
      if (ch) { filt = ch.getAttribute('data-vf'); [].forEach.call(document.querySelectorAll('[data-vf]'), function (x) { x.setAttribute('aria-pressed', String(x === ch)); }); draw(); return; }
      var tk = e.target.closest('[data-take]'), gv = e.target.closest('[data-give]'), me = state(H).fam;
      if (!tk && !gv) return;
      if (!me) { msg('Pick your family at the top first.'); $('vlFam').focus(); return; }
      var id = (tk || gv).getAttribute(tk ? 'data-take' : 'data-give'), j = jobs(H).filter(function (x) { return x.id === id; })[0];
      if (!j) { draw(); return; }
      save(function (s) {
        var c = s.claims[id] = (s.claims[id] || []).slice();
        if (gv) { var i = c.indexOf(me); if (i > -1) c.splice(i, 1); }
        else if (c.length < j.slots) c.push(me);
      });
      msg(gv ? 'You gave back ' + j.name + '.' : 'You took ' + j.name + ' on ' + when(j.date) + '. Thanks.');
    });
    $('vlReset').addEventListener('click', function () { if (confirm('Clear the sign ups saved on this device and put the sample ones back?')) { H.sset(KEY, { fam: state(H).fam, claims: JSON.parse(JSON.stringify(SEED)), extra: [] }); draw(); } });
    $('vlCsv').addEventListener('click', function () {
      var s = state(H), t = hours(H, s), q = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
      var rows = [['Family', 'Hours', 'Jobs', 'Goal', 'Short by', 'Sample']].concat(Object.keys(t).map(function (f) { return [f, t[f].hrs, t[f].jobs, GOAL, Math.max(0, GOAL - t[f].hrs), /^Sample /.test(f) ? 'yes' : '']; }));
      rows.push([]); rows.push(['Job', 'Date', 'Event', 'Hours', 'Family', '']);
      jobs(H).forEach(function (j) { (s.claims[j.id] || []).forEach(function (f) { rows.push([j.name, j.date, j.event, j.hrs, f, '']); }); });
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv' })); a.download = 'empire-volunteer-hours.csv';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    draw();
  };
})();
