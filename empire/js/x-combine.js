/* Combine numbers over time (block on every player page) and the combine leaderboard (combine.html).
   Every number here is SAMPLE. Read only. Remembers the picked test on this device (emp_x_combine). Static, nothing animates. */
(function () {
  'use strict';
  var X = window.EMPIRE_EXT = window.EMPIRE_EXT || { pages: {}, init: {} };
  X.pages = X.pages || {}; X.init = X.init || {}; X.blocks = X.blocks || {};
  var KEY = 'emp_x_combine';
  var DAYS = [
    { id: 'f25', name: 'Fall Combine 2025', short: 'Fall 2025', date: '2025-10-18' },
    { id: 'w26', name: 'Winter Test February 2026', short: 'Feb 2026', date: '2026-02-21' },
    { id: 'f26', name: 'Fall Combine 2026', short: 'Fall 2026', date: '2026-10-17' }
  ];
  var TESTS = [
    { k: 'ev', label: 'Exit velo', unit: 'mph', hi: true, dec: 0, step: 5 },
    { k: 'ov', label: 'Overhand velo', unit: 'mph', hi: true, dec: 0, step: 4 },
    { k: 'h1', label: 'Home to first', unit: 'sec', hi: false, dec: 2, step: 0.14 },
    { k: 'pop', label: 'Pop time', unit: 'sec', hi: false, dec: 2, step: 0.1, who: 'Catchers only' },
    { k: 'pv', label: 'Pitch velo', unit: 'mph', hi: true, dec: 0, step: 4, who: 'Pitchers only' },
    { k: 'hr', label: 'Derby home runs', unit: 'HR', hi: true, dec: 0, step: 3, fallOnly: true }
  ];
  /* SAMPLE latest day (Fall 2026), matched to the sample measurables in data.js */
  var LAST = {
    'angelina-mancuso': { ev: 66, ov: 58, h1: 2.92, hr: 3 }, 'gabriella-marino': { ev: 64, ov: 59, h1: 2.88, hr: 2 },
    'jessica-dobrzeniecki': { ev: 65, ov: 57, h1: 2.95, hr: 3 }, 'jocelyn-mueller': { ev: 63, ov: 58, h1: 2.85, hr: 1 },
    'julia-candelario': { ev: 69, ov: 61, h1: 3.02, pop: 1.98, hr: 5 }, 'kaitlyn-lozano': { ev: 70, ov: 62, h1: 2.98, pop: 1.92, hr: 6 },
    'kerriann-orth': { ev: 67, ov: 60, h1: 3.05, pop: 1.96, hr: 4 }, 'lia-arduini': { ev: 68, ov: 61, h1: 3.00, pv: 57, hr: 4 },
    'lily-suarez': { ev: 71, ov: 58, h1: 3.08, hr: 7 }, 'logan-berg': { ev: 66, ov: 58, h1: 2.94, hr: 2 },
    'megan-hobdy': { ev: 65, ov: 60, h1: 2.90, pv: 58, hr: 3 }, 'shayna-argentina': { ev: 68, ov: 60, h1: 3.01, hr: 4 },
    'tiffany-matthews': { ev: 66, ov: 61, h1: 2.87, pv: 59, hr: 3 }
  };
  /* earlier days are built from the latest one: a steady gain that differs a little per player */
  function seed(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973; return h; }
  var R = {};
  Object.keys(LAST).forEach(function (id) {
    var L = LAST[id], h = seed(id), r = { f25: {}, w26: {}, f26: {} };
    TESTS.forEach(function (t, i) {
      var v = L[t.k]; if (v == null) return;
      var gain = t.step * (0.35 + ((h >> i) % 7) / 10), half = gain * (0.4 + (h % 3) / 10), sign = t.hi ? -1 : 1;
      var fix = function (n) { return t.dec ? Math.round(n * 100) / 100 : Math.max(0, Math.round(n)); };
      r.f26[t.k] = v;
      r.f25[t.k] = fix(v + sign * gain);
      if (!t.fallOnly) r.w26[t.k] = fix(v + sign * (gain - half));
    });
    R[id] = r;
  });

  function test(k) { return TESTS.filter(function (t) { return t.k === k; })[0] || TESTS[0]; }
  function fmt(t, v) { return v == null ? '' : (t.dec ? v.toFixed(t.dec) : String(v)); }
  function unit(t, v) { return fmt(t, v) + (t.unit ? ' ' + t.unit : ''); }
  function better(t, a, b) { return t.hi ? b - a : a - b; } /* how much b beats a */
  function vals(id, k) { var r = R[id]; return r ? DAYS.map(function (d) { return r[d.id][k]; }) : []; }
  function firstLast(id, k) { var v = vals(id, k), f = null, fi = -1, l = null; v.forEach(function (x, i) { if (x == null) return; if (f == null) { f = x; fi = i; } l = x; }); return { f: f, l: l, day: DAYS[fi] }; }
  function gainLine(t, id) {
    var o = firstLast(id, t.k); if (o.f == null) return '';
    var g = better(t, o.f, o.l), amt = t.dec ? Math.abs(g).toFixed(2) : String(Math.abs(g));
    if (!g) return t.label + ' held at ' + unit(t, o.l) + ' since ' + o.day.short + '.';
    if (t.k === 'hr') return 'Derby home runs ' + (g > 0 ? 'up ' : 'down ') + amt + ' since ' + o.day.short + '.';
    if (!t.hi) return t.label + ' ' + amt + ' sec ' + (g > 0 ? 'faster' : 'slower') + ' since ' + o.day.short + '.';
    return t.label + (g > 0 ? ' up ' : ' down ') + amt + ' mph since ' + o.day.short + '.';
  }
  /* tiny static line: higher on the chart always means better */
  function spark(t, v) {
    var pts = [], lo = Infinity, hiV = -Infinity;
    v.forEach(function (x) { if (x == null) return; var y = t.hi ? x : -x; lo = Math.min(lo, y); hiV = Math.max(hiV, y); });
    v.forEach(function (x, i) { if (x == null) return; var y = t.hi ? x : -x, sy = hiV === lo ? 15 : 25 - (y - lo) / (hiV - lo) * 20; pts.push([8 + i * 40, Math.round(sy * 10) / 10]); });
    return '<svg class="cmb__spark" viewBox="0 0 96 30" width="96" height="30" aria-hidden="true" focusable="false"><polyline fill="none" stroke="#0b0b0b" stroke-width="2.5" stroke-linejoin="round" points="' +
      pts.map(function (p) { return p.join(','); }).join(' ') + '"/>' + pts.map(function (p, i) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="' + (i === pts.length - 1 ? '#e9d5a1' : '#fff') + '" stroke="#0b0b0b" stroke-width="2"/>'; }).join('') + '</svg>';
  }

  /* player page block */
  (X.blocks.player = X.blocks.player || []).push(function (H, p) {
    if (!p || !R[p.id]) return '';
    var esc = H.esc, rows = TESTS.filter(function (t) { return LAST[p.id][t.k] != null; });
    return '<div class="blk blk--wide"><div class="blk__top"><h2>Testing history</h2>' + H.sample('Sample numbers') + '</div>' +
      '<div class="cmb__hist">' + rows.map(function (t) {
        var v = vals(p.id, t.k);
        return '<div class="cmb__row"><div class="cmb__name"><b>' + esc(t.label) + (t.unit ? ' <i>' + t.unit + '</i>' : '') + '</b><span>' + esc(gainLine(t, p.id)) + '</span></div>' +
          '<dl class="cmb__vals">' + DAYS.map(function (d, i) { return '<div><dt>' + d.short + '</dt><dd>' + (v[i] == null ? '<span class="mute">No test</span>' : fmt(t, v[i])) + '</dd></div>'; }).join('') + '</dl>' + spark(t, v) + '</div>';
      }).join('') + '</div><p class="fine">Made up to show the layout. Real numbers come from the club\'s combine days. <a class="cmb__more" href="combine.html">See the leaderboard</a></p></div>';
  });

  /* leaderboard page */
  X.pages.combine = function (H) {
    var pick = H.sget(KEY); if (!TESTS.some(function (t) { return t.k === pick; })) pick = 'ev';
    return H.pageHead('Combine <span class="wm">results</span>', 'Every fall the club tests speed, arm and bat. Here is who leads, who holds the club records and who got better the most.', null,
      '<div class="chips" role="group" aria-label="Pick a test">' + TESTS.map(function (t) { return '<button type="button" class="chip" data-cmb="' + t.k + '" aria-pressed="' + (t.k === pick) + '">' + H.esc(t.label) + '</button>'; }).join('') + '</div>') +
      '<section class="sec sec--tight"><div class="wrap"><p class="note">Only White 16u Elite results are posted in this sample. Every number on this page is made up to show the layout. ' + H.sample('Sample numbers') + '</p>' +
      '<div class="pgrid cmb__grid"><div class="blk"><div class="blk__top"><h2 id="cmbTopH">Top 10</h2></div><p class="fine" id="cmbTopSub"></p><ol class="cmb__lb" id="cmbTop"></ol></div>' +
      '<div class="blk"><div class="blk__top"><h2>Most improved</h2></div><p class="fine" id="cmbImpSub"></p><ol class="cmb__lb" id="cmbImp"></ol></div></div></div></section>' +
      '<section class="sec sec--gold"><div class="wrap"><div class="sec__head"><h2 class="disp">Club <span class="wm">records</span></h2><p>The best mark ever posted at an Empire combine, and when.</p></div><div class="cmb__recs" id="cmbRecs"></div></div></section>';
  };

  X.init.combine = function (H) {
    var esc = H.esc, $ = function (id) { return document.getElementById(id); }, last = DAYS[DAYS.length - 1];
    var ids = Object.keys(R).filter(function (id) { return H.player(id); });
    function nm(id) { return esc(H.player(id).name); }
    function link(id) { return '<a href="player.html?p=' + esc(id) + '">' + nm(id) + '</a>'; }
    function row(n, id, right, sub) { return '<li class="cmb__li"><span class="cmb__n">' + n + '</span><span class="cmb__who">' + link(id) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><b>' + right + '</b></li>'; }
    function draw(k) {
      var t = test(k);
      var top = ids.filter(function (id) { return R[id][last.id][k] != null; }).sort(function (a, b) { return better(t, R[a][last.id][k], R[b][last.id][k]) || H.player(a).name.localeCompare(H.player(b).name); });
      $('cmbTopH').textContent = top.length > 10 ? 'Top 10' : 'Leaders';
      $('cmbTopSub').textContent = t.label + ' at the ' + last.name + ', ' + H.longDate(last.date) + '. ' + (t.hi ? 'Higher is better.' : 'Lower is better.') + (t.who ? ' ' + t.who + '.' : '');
      $('cmbTop').innerHTML = top.slice(0, 10).map(function (id, i) { return row(i + 1, id, unit(t, R[id][last.id][k]), (H.player(id).pos || []).join(' / ')); }).join('');
      var imp = ids.map(function (id) { var o = firstLast(id, k); return o.f == null ? null : { id: id, g: better(t, o.f, o.l), o: o }; }).filter(Boolean)
        .sort(function (a, b) { return b.g - a.g || H.player(a.id).name.localeCompare(H.player(b.id).name); }).slice(0, 5);
      $('cmbImpSub').textContent = 'Biggest gain in ' + t.label.toLowerCase() + ' from her first test to the ' + last.name + '.';
      $('cmbImp').innerHTML = imp.map(function (x, i) { return row(i + 1, x.id, t.hi ? (x.g > 0 ? '+' : '') + x.g + (t.unit ? ' ' + t.unit  : '') : Math.abs(x.g).toFixed(2) + ' sec ' + (x.g < 0 ? 'slower' : 'faster'), unit(t, x.o.f) + ' to ' + unit(t, x.o.l)); }).join('');
      [].forEach.call(document.querySelectorAll('[data-cmb]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-cmb') === k)); });
    }
    $('cmbRecs').innerHTML = TESTS.map(function (t) {
      var best = null;
      ids.forEach(function (id) { DAYS.forEach(function (d) { var v = R[id][d.id][t.k]; if (v != null && (!best || better(t, best.v, v) > 0)) best = { v: v, id: id, d: d }; }); });
      return best ? '<div class="cmb__rec"><span>' + esc(t.label) + '</span><b>' + unit(t, best.v) + '</b><small>' + link(best.id) + ', ' + best.d.name + '</small></div>' : '';
    }).join('');
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cmb]'); if (!b) return;
      var k = b.getAttribute('data-cmb'); H.sset(KEY, k); draw(k);
    });
    var pick = H.sget(KEY); draw(TESTS.some(function (t) { return t.k === pick; }) ? pick : 'ev');
  };
})();
