/* Home Run Derby pledge board. Public board + pledge form, and a coach section to enter home runs and see who owes what.
   Saves on this device only (emp_x_derby). Nothing is charged. */
(function () {
  'use strict';
  window.EMPIRE_EXT = window.EMPIRE_EXT || { pages: {}, init: {} };
  var KEY = 'emp_x_derby', GOAL = 10000, RAFFLE = 5, GUESS = 5, HOME = 'white-16u-elite';
  /* SAMPLE pledges for five real White 16u Elite players, and sample totals for the other teams */
  var SEED = [
    { id: 's1', sample: true, pid: 'kaitlyn-lozano', name: 'Sample Fan 1', per: 5, flat: 0, raffle: 4 },
    { id: 's2', sample: true, pid: 'kaitlyn-lozano', name: 'Sample Fan 2', per: 2, flat: 25, raffle: 0 },
    { id: 's3', sample: true, pid: 'lia-arduini', name: 'Sample Fan 3', per: 10, flat: 0, raffle: 2 },
    { id: 's4', sample: true, pid: 'julia-candelario', name: 'Sample Fan 4', per: 0, flat: 100, raffle: 5 },
    { id: 's5', sample: true, pid: 'megan-hobdy', name: 'Sample Fan 5', per: 5, flat: 20, raffle: 0 },
    { id: 's6', sample: true, pid: 'lily-suarez', name: 'Sample Fan 6', per: 1, flat: 50, raffle: 3 }
  ];
  var OTHER = { 'black-18u': 1420, 'gold-16u': 980, 'black-16u': 860, 'gold-14u': 1150, 'white-13u': 640, 'black-13u': 710, 'gold-12u': 530 };

  function state(H) { var s = H.sget(KEY); s = s && typeof s === 'object' ? s : {}; return { pledges: Array.isArray(s.pledges) ? s.pledges : [], hrs: s.hrs && typeof s.hrs === 'object' ? s.hrs : {} }; }
  function all(H) { return SEED.concat(state(H).pledges); }
  function hrOf(H, pid) { var h = state(H).hrs[pid]; return h === '' || h == null ? null : +h; }
  /* owed = flat + raffle + per home run times her count (before the Derby we guess 5) */
  function owed(H, p, guess) { var h = hrOf(H, p.pid); if (h == null) h = guess ? GUESS : 0; return (+p.flat || 0) + (+p.raffle || 0) * RAFFLE + (+p.per || 0) * h; }
  function shown(n) { n = String(n || ''); return /^Sample /.test(n) ? n : n.trim().split(/\s+/)[0]; }
  function pname(H, pid) { var p = H.player(pid); return p ? p.name : 'Player'; }

  window.EMPIRE_EXT.pages.derby = function (H) {
    var esc = H.esc, prog = {};
    (H.D.club.program || []).forEach(function (r) { prog[r[0]] = r[1]; });
    var opts = H.players().map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + (H.team(p.team) ? ' (' + esc(H.team(p.team).name.replace('Empire ', '')) + ')' : '') + '</option>'; }).join('');
    return H.pageHead('Home Run <span class="wm">Derby</span>', esc(prog['Home Run Derby and Combine'] || 'Once a year every Empire team takes part in a home run derby. Families and friends pledge per home run, and the money goes to the foundation.'), null,
      '<div class="hero__cta"><a class="btn btn--ink" href="#pledge">Make a pledge ' + H.I.arrow + '</a><a class="btn" href="#board">See the board</a></div>') +
      '<section class="sec sec--tight"><div class="wrap"><div class="split"><div><p class="kicker">Where the money goes</p><h2 class="disp hrd__h">Empire Athletics <span class="wm">Foundation</span></h2>' +
      '<p class="mt">' + esc(prog['Empire Athletics Foundation'] || '') + '</p><p class="mt">The first Brandon Wilson Scholarship went to Brooke Gullo, who now plays at Oswego State.</p></div>' +
      '<div><div class="meter" id="hrdMeter"></div></div></div></div></section>' +
      '<section class="sec sec--soft" id="board"><div class="wrap"><div class="sec__head"><h2 class="disp">Team <span class="wm">totals</span></h2><p>White 16u Elite players are real. The pledges and the other team totals are samples until the club goes live.</p></div>' +
      '<div class="pgrid"><div class="blk"><div class="blk__top"><h2>By team</h2>' + H.sample() + '</div><div id="hrdTeams"></div></div>' +
      '<div class="blk"><div class="blk__top"><h2>Latest pledges</h2></div><div id="hrdLatest"></div><p class="fine">Only first names show here. Emails are never shown.</p></div></div></div></section>' +
      '<section class="sec sec--tight" id="pledge"><div class="wrap narrow"><div class="sec__head"><h2 class="disp">Make a <span class="wm">pledge</span></h2><p>Pick a player, choose an amount per home run, a flat gift, or both.</p></div>' +
      '<form class="form cform" id="hrdForm" novalidate><div class="fld"><label for="hrdWho">Player</label><select id="hrdWho" required><option value="">Choose a player</option>' + opts + '</select></div>' +
      '<div class="two">' + H.field('hrdName', 'Your name', 'text', 'required autocomplete="name"') + H.field('hrdEmail', 'Email (optional, only the coach sees it)', 'email', 'autocomplete="email"') + '</div>' +
      '<div class="fld"><span class="hrd__lab" id="hrdPerLab">Per home run</span><div class="chips hrd__chips" role="group" aria-labelledby="hrdPerLab">' +
      [0, 1, 2, 5, 10].map(function (v) { return '<button type="button" class="chip" data-per="' + v + '" aria-pressed="' + (v === 2) + '">' + (v ? '$' + v : 'None') + '</button>'; }).join('') + '</div></div>' +
      '<div class="three">' + H.field('hrdPer', 'Or your own amount per home run', 'number', 'min="0" step="1" inputmode="numeric" placeholder="$"') + H.field('hrdFlat', 'Flat gift', 'number', 'min="0" step="1" inputmode="numeric" placeholder="$"') +
      H.field('hrdRaf', 'Raffle tickets, $5 each', 'number', 'min="0" step="1" inputmode="numeric" placeholder="0"') + '</div>' +
      '<p class="hrd__live" id="hrdLive" aria-live="polite"></p><p class="hrd__err" id="hrdErr" hidden></p>' +
      '<div><button class="btn btn--ink" type="submit">Save my pledge ' + H.I.arrow + '</button></div>' +
      '<p class="fine">Nothing is charged here. Pledges are paid after the Derby, at the field or through the club\'s own payment link.</p></form>' +
      '<div class="blk blk--gold mt" id="hrdThanks" hidden></div></div></section>' +
      '<section class="sec sec--ink" id="coach"><div class="wrap"><p class="kicker">Coach section</p><h2 class="disp hrd__h">Derby <span class="wm wm--onink">day</span></h2>' +
      '<p class="mt">On the real site this part sits behind the coach sign in. Here it saves on this device only, so try it.</p>' +
      '<div class="pgrid mt"><div class="blk"><div class="blk__top"><h2>Home runs hit</h2></div><p class="fine">Type each player\'s home runs after the Derby. Totals update right away.</p><div class="hrd__hrs" id="hrdHrs"></div></div>' +
      '<div class="blk blk--wide"><div class="blk__top"><h2>Who owes what</h2><div class="hero__cta hrd__act"><button type="button" class="btn btn--sm" id="hrdCsv">Download spreadsheet (CSV)</button><button type="button" class="btn btn--sm" id="hrdClear">Remove pledges made here</button></div></div>' +
      '<div id="hrdOwe"></div></div></div></div></section>';
  };

  window.EMPIRE_EXT.init.derby = function (H) {
    var esc = H.esc, money = H.money, $ = function (id) { return document.getElementById(id); };
    var per = 2;
    function save(fn) { var s = state(H); fn(s); H.sset(KEY, s); draw(); }
    function draw() { drawTop(); drawHrs(); drawOwe(); }
    function teamTotals() {
      var t = {}; Object.keys(OTHER).forEach(function (k) { t[k] = OTHER[k]; }); t[HOME] = 0;
      all(H).forEach(function (p) { var pl = H.player(p.pid), tid = pl ? pl.team : HOME; t[tid] = (t[tid] || 0) + owed(H, p, true); });
      return t;
    }
    function drawTop() {
      var t = teamTotals(), sum = 0;
      Object.keys(t).forEach(function (k) { sum += t[k]; });
      $('hrdMeter').innerHTML = '<p class="kicker">Foundation goal ' + H.sample('Sample goal') + '</p><p class="mt"><b>' + money(sum) + '</b><span>pledged of ' + money(GOAL) + '</span></p>' +
        '<div class="meter__bar" role="img" aria-label="' + Math.round(Math.min(100, sum / GOAL * 100)) + ' percent of the goal"><i style="width:' + Math.min(100, sum / GOAL * 100).toFixed(1) + '%"></i></div>' +
        '<p>Per home run pledges count as 5 home runs until the coach enters the real number.</p>';
      $('hrdTeams').innerHTML = '<div class="hrd__rows">' + H.D.teams.slice().sort(function (a, b) { return (t[b.id] || 0) - (t[a.id] || 0); }).map(function (tm) {
        return '<div class="hrd__row"><span><i class="sw sw--' + tm.color + '" aria-hidden="true"></i> ' + esc(tm.name.replace('Empire ', '')) + '</span><b>' + money(t[tm.id] || 0) + '</b></div>'; }).join('') + '</div>';
      $('hrdLatest').innerHTML = '<div class="hrd__rows">' + all(H).slice().reverse().slice(0, 8).map(function (p) {
        var bits = []; if (+p.per) bits.push(money(p.per) + ' per home run'); if (+p.flat) bits.push(money(p.flat) + ' gift'); if (+p.raffle) bits.push(p.raffle + ' raffle');
        return '<div class="hrd__row"><span><b>' + esc(shown(p.name)) + '</b>' + (p.sample ? ' ' + H.sample() : '') + ' for ' + esc(pname(H, p.pid)) + '<small>' + esc(bits.join(', ')) + '</small></span></div>'; }).join('') + '</div>';
    }
    function drawHrs() {
      var hrs = state(H).hrs, who = {};
      all(H).forEach(function (p) { who[p.pid] = 1; });
      $('hrdHrs').innerHTML = H.players().filter(function (p) { return who[p.id] || p.team === HOME; }).map(function (p) {
        return '<label class="hrd__hr"><span>' + esc(p.name) + '</span><input type="number" min="0" step="1" inputmode="numeric" data-hr="' + esc(p.id) + '" value="' + esc(hrs[p.id] == null ? '' : hrs[p.id]) + '" placeholder="0" aria-label="Home runs for ' + esc(p.name) + '"></label>'; }).join('');
    }
    function drawOwe() {
      var rows = all(H), tot = 0;
      $('hrdOwe').innerHTML = '<div class="tblwrap"><table class="tbl"><thead><tr><th>Pledger</th><th>Player</th><th>Per home run</th><th>Flat</th><th>Raffle</th><th>Total owed</th></tr></thead><tbody>' +
        rows.map(function (p) { var o = owed(H, p, false); tot += o; var h = hrOf(H, p.pid);
          return '<tr><td>' + esc(p.name) + (p.sample ? ' ' + H.sample() : '') + '</td><td>' + esc(pname(H, p.pid)) + '</td><td>' + (+p.per ? money(p.per) + ' x ' + (h || 0) : '') + '</td><td>' + (+p.flat ? money(p.flat) : '') + '</td><td>' + (+p.raffle ? money(p.raffle * RAFFLE) : '') + '</td><td><b>' + money(o) + '</b></td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td colspan="5">Everyone</td><td><b>' + money(tot) + '</b></td></tr></tfoot></table></div>';
    }
    function amounts() { var c = $('hrdPer').value.trim(); return { per: c !== '' ? Math.max(0, Math.round(+c) || 0) : per, flat: Math.max(0, Math.round(+$('hrdFlat').value) || 0), raffle: Math.max(0, Math.round(+$('hrdRaf').value) || 0) }; }
    function live() {
      var a = amounts(), pl = H.player($('hrdWho').value), first = pl ? pl.name.split(' ')[0] : 'she', total = a.per * GUESS + a.flat + a.raffle * RAFFLE;
      $('hrdLive').innerHTML = 'If ' + esc(first) + ' hits 5 home runs, you give <b>' + money(total) + '</b>.' + (a.raffle ? ' That includes ' + a.raffle + ' raffle ' + (a.raffle === 1 ? 'ticket' : 'tickets') + '.' : '');
    }
    [].forEach.call(document.querySelectorAll('[data-per]'), function (b) {
      b.addEventListener('click', function () { per = +b.getAttribute('data-per'); $('hrdPer').value = ''; [].forEach.call(document.querySelectorAll('[data-per]'), function (x) { x.setAttribute('aria-pressed', x === b); }); live(); });
    });
    $('hrdPer').addEventListener('input', function () { [].forEach.call(document.querySelectorAll('[data-per]'), function (x) { x.setAttribute('aria-pressed', 'false'); }); live(); });
    ['hrdFlat', 'hrdRaf', 'hrdWho'].forEach(function (id) { $(id).addEventListener(id === 'hrdWho' ? 'change' : 'input', live); });
    $('hrdForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var a = amounts(), name = $('hrdName').value.trim(), pid = $('hrdWho').value, err = $('hrdErr'), msg = '';
      $('hrdWho').classList.toggle('bad', !pid); $('hrdName').classList.toggle('bad', !name);
      if (!pid) msg = 'Pick a player.'; else if (!name) msg = 'Add your name.'; else if (!a.per && !a.flat && !a.raffle) msg = 'Choose an amount per home run, a flat gift or raffle tickets.';
      err.hidden = !msg; err.textContent = msg; if (msg) return;
      save(function (s) { s.pledges.push({ id: 'p' + Date.now().toString(36), pid: pid, name: name, email: $('hrdEmail').value.trim(), per: a.per, flat: a.flat, raffle: a.raffle, when: new Date().toISOString().slice(0, 10) }); });
      var th = $('hrdThanks');
      th.innerHTML = '<h2>Thank you, ' + esc(name.split(/\s+/)[0]) + '</h2><p class="mt">Your pledge for ' + esc(pname(H, pid)) + ' is saved. Nothing is charged today. After the Derby you pay at the field or through the club\'s own payment link.</p><p class="fine">Sample: this pledge saves on this device only.</p><p class="mt"><a class="btn btn--sm" href="#board">See the board</a></p>';
      th.hidden = false; this.reset(); per = 2;
      [].forEach.call(document.querySelectorAll('[data-per]'), function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-per') === '2'); });
      live(); th.scrollIntoView({ block: 'center' });
    });
    $('hrdHrs').addEventListener('input', function (e) {
      var id = e.target.getAttribute('data-hr'); if (!id) return;
      var s = state(H), v = e.target.value.trim(); if (v === '') delete s.hrs[id]; else s.hrs[id] = Math.max(0, Math.round(+v) || 0);
      H.sset(KEY, s); drawTop(); drawOwe();
    });
    $('hrdClear').addEventListener('click', function () { if (confirm('Remove the pledges and home run counts saved on this device? The sample pledges stay.')) { H.sset(KEY, { pledges: [], hrs: {} }); draw(); } });
    $('hrdCsv').addEventListener('click', function () {
      var q = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v) && isNaN(+v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
      var rows = [['Pledger', 'Email', 'Player', 'Per home run', 'Home runs', 'Flat gift', 'Raffle tickets', 'Raffle amount', 'Total owed', 'Sample']].concat(all(H).map(function (p) {
        return [p.name, p.email || '', pname(H, p.pid), p.per || 0, hrOf(H, p.pid) || 0, p.flat || 0, p.raffle || 0, (p.raffle || 0) * RAFFLE, owed(H, p, false), p.sample ? 'yes' : '']; }));
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv' })); a.download = 'empire-derby-pledges.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    draw(); live();
  };
})();
