/* Paperwork and cleared to play: paperwork.html. Coach tool. Ticks save on this device only (emp_x_paperwork). Static, no timers. */
(function () {
  'use strict';
  var X = window.EMPIRE_EXT = window.EMPIRE_EXT || {};
  X.pages = X.pages || {}; X.init = X.init || {};
  var KEY = 'emp_x_paperwork';
  /* [key, full label, short label] */
  var ITEMS = [['med', 'Medical release', 'Medical'], ['coc', 'Code of conduct', 'Conduct'], ['photo', 'Photo release', 'Photo'], ['card', 'USSSA player card', 'USSSA card'], ['birth', 'Birth certificate shown', 'Birth cert'], ['sizes', 'Uniform sizes in', 'Sizes'], ['dues', 'Dues plan picked', 'Dues plan']];
  var cur = null, onlyMissing = false;

  function obj(s) { return s && typeof s === 'object' && !Array.isArray(s) ? s : null; }
  function store(H) { return obj(H.sget(KEY)) || {}; }
  function allRegs(H) { var r; try { r = H.regs(); } catch (e) { r = []; } return Array.isArray(r) ? r.filter(function (x) { return obj(x) && x.player; }) : []; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }
  function slug(s) { return norm(s) || 'x'; }
  /* what a registration already proves */
  function fromReg(r, k) {
    if (k === 'med' || k === 'coc') return !!r.sign;
    if (k === 'photo') return !!r.photoOk;
    if (k === 'sizes') return !!(r.jersey && r.pants);
    if (k === 'dues') return !!r.plan;
    return null;
  }
  /* SAMPLE ticks so the demo looks like a real week: about one in three is missing one item */
  function sampleTick(i, j) { return !(i % 3 === 1 && j === (i * 3 + 3) % ITEMS.length); }

  function rows(H, tid) {
    var regs = allRegs(H).filter(function (r) { return r.team === tid; }), seen = {}, out = [];
    H.roster(tid).forEach(function (p) {
      var r = regs.filter(function (x) { return norm(x.player) === norm(p.name); })[0];
      seen[norm(p.name)] = 1; out.push({ id: 'p_' + p.id, name: p.name, reg: r, real: true });
    });
    regs.forEach(function (r) { if (!seen[norm(r.player)]) { seen[norm(r.player)] = 1; out.push({ id: 'r_' + slug(r.player), name: r.player, reg: r, sampleName: !!r.sample }); } });
    if (!out.length) {
      var n = 10 + (H.D.teams.map(function (t) { return t.id; }).indexOf(tid) % 4);
      for (var k = 1; k <= n; k++) out.push({ id: 's_' + k, name: 'Sample Player ' + k, sampleName: true });
    }
    var st = obj(store(H)[tid]) || {};
    out.forEach(function (row, i) {
      var mine = obj(st[row.id]) || {};
      row.sampleTicks = false;
      row.v = ITEMS.map(function (it, j) {
        if (typeof mine[it[0]] === 'boolean') return mine[it[0]];
        var rv = row.reg ? fromReg(row.reg, it[0]) : null;
        if (rv) return true;
        row.sampleTicks = true; return sampleTick(i, j);
      });
      row.ok = row.v.every(Boolean);
    });
    return out;
  }
  function count(H, tid) { var r = rows(H, tid); return { ok: r.filter(function (x) { return x.ok; }).length, all: r.length }; }

  function cell(H, row, j, cls) {
    var it = ITEMS[j], on = row.v[j];
    return '<button type="button" class="' + cls + '" data-pw="' + H.esc(row.id) + '" data-pwi="' + j + '" aria-pressed="' + on + '" aria-label="' + H.esc(row.name + ': ' + it[1] + (on ? ', done' : ', missing')) + '">' +
      (cls === 'chip' ? H.esc(it[2]) : '<span aria-hidden="true">' + (on ? 'Yes' : 'No') + '</span>') + '</button>';
  }
  function who(H, row) {
    return '<b>' + H.esc(row.name) + '</b>' + (row.sampleName ? ' ' + H.sample() : row.sampleTicks ? ' ' + H.sample('Sample ticks') : '') +
      (row.reg ? '<small>Registered' + (row.reg.sample ? ' (sample)' : '') + '</small>' : '');
  }

  function teamPart(H) {
    var t = H.team(cur), all = rows(H, cur), ok = all.filter(function (x) { return x.ok; }).length;
    var list = onlyMissing ? all.filter(function (x) { return !x.ok; }) : all;
    var pct = all.length ? Math.round(ok / all.length * 100) : 0;
    var head = '<div class="blk blk--wide"><div class="blk__top"><h2>' + H.esc(t.name) + '</h2><span class="tag tag--ink">Cleared to play ' + ok + ' of ' + all.length + '</span></div>' +
      '<div class="meter__bar"><i style="width:' + pct + '%"></i></div>' +
      '<p class="fine">Tap any box to tick it or untick it. A player is cleared when all 7 are done. Signed agreements, uniform sizes, photo OK and dues plan tick on their own when a family registers.</p></div>';
    if (!list.length) return '<div class="pgrid">' + head + '<div class="blk blk--wide"><p class="empty">Nobody is missing anything. Everyone is cleared to play.</p></div></div>';
    var table = '<div class="tblwrap pw-tbl"><table class="tbl"><thead><tr><th scope="col">Player</th>' + ITEMS.map(function (it) { return '<th scope="col">' + H.esc(it[2]) + '</th>'; }).join('') + '<th scope="col">Status</th></tr></thead><tbody>' +
      list.map(function (row) {
        return '<tr><td>' + who(H, row) + '</td>' + ITEMS.map(function (it, j) { return '<td>' + cell(H, row, j, 'pw-cell') + '</td>'; }).join('') +
          '<td><span class="tag' + (row.ok ? ' tag--gold' : '') + '">' + (row.ok ? 'Cleared' : 'Missing') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
    var cards = '<div class="pw-cards">' + list.map(function (row) {
      var miss = ITEMS.filter(function (it, j) { return !row.v[j]; }).length;
      return '<div class="pw-card"><div class="pw-card__top"><span>' + who(H, row) + '</span><span class="tag' + (row.ok ? ' tag--gold' : '') + '">' + (row.ok ? 'Cleared' : miss + ' missing') + '</span></div>' +
        '<div class="chips">' + ITEMS.map(function (it, j) { return cell(H, row, j, 'chip'); }).join('') + '</div></div>';
    }).join('') + '</div>';
    return '<div class="pgrid">' + head + '<div class="blk blk--wide">' + table + cards +
      '<p class="mt"><button type="button" class="btn btn--sm" id="pwClear">Undo my ticks for this team</button></p></div></div>';
  }
  function strip(H) {
    return '<div class="pw-strip">' + H.D.teams.map(function (t) {
      var c = count(H, t.id);
      return '<button type="button" class="pw-team" data-pwteam="' + H.esc(t.id) + '" aria-pressed="' + (t.id === cur) + '"><span><i class="sw sw--' + H.esc(t.color) + '" aria-hidden="true"></i>' + H.esc(t.name.replace('Empire ', '')) + '</span><b>' + c.ok + ' of ' + c.all + '</b></button>';
    }).join('') + '</div>';
  }
  function body(H) {
    return '<p class="kicker">Club wide, cleared to play</p>' + strip(H) +
      '<div class="chips" role="group" aria-label="Show"><button type="button" class="chip" id="pwMiss" aria-pressed="' + onlyMissing + '">Missing anything</button></div>' +
      '<div class="mt">' + teamPart(H) + '</div>';
  }

  X.pages.paperwork = function (H) {
    var ids = H.D.teams.map(function (t) { return t.id; });
    cur = ids.indexOf(H.qs.get('t')) > -1 ? H.qs.get('t') : (H.roster('white-16u-elite').length ? 'white-16u-elite' : ids[0]);
    return H.pageHead('Paper<span class="wm">work</span>', 'Who is cleared to play. Tap a team, then tick what each family has turned in.', ['coach.html', 'Coach desk'],
      '<div class="ph__act pw-act"><a class="btn btn--ink" href="messages.html">Remind families ' + H.I.arrow + '</a><button type="button" class="btn" id="pwCsv">Download spreadsheet</button></div>') +
      '<section class="sec sec--tight"><div class="wrap"><p class="note">Sample: ticks shown are made up for the demo. Anything you tap saves on this phone or computer only. Birth certificates are a tick only. No dates or copies are kept.</p>' +
      '<div id="pwBody" class="mt">' + body(H) + '</div></div></section>';
  };

  X.init.paperwork = function (H) {
    var box = document.getElementById('pwBody');
    function draw() { box.innerHTML = body(H); }
    document.addEventListener('click', function (ev) {
      var tb = ev.target.closest('[data-pwteam]'), c = ev.target.closest('[data-pw]');
      if (tb) {
        cur = tb.getAttribute('data-pwteam'); draw();
        try { history.replaceState(null, '', location.pathname + '?t=' + encodeURIComponent(cur)); } catch (x) { }
        return;
      }
      if (c) {
        var all = store(H), rid = c.getAttribute('data-pw'), j = +c.getAttribute('data-pwi');
        var t = all[cur] = obj(all[cur]) || {}, r = t[rid] = obj(t[rid]) || {};
        r[ITEMS[j][0]] = c.getAttribute('aria-pressed') !== 'true';
        H.sset(KEY, all); draw();
        var back = box.querySelector('[data-pw="' + rid + '"][data-pwi="' + j + '"]' + (c.classList.contains('chip') ? '.chip' : '.pw-cell'));
        if (back) back.focus();
        return;
      }
      if (ev.target.closest('#pwMiss')) { onlyMissing = !onlyMissing; draw(); return; }
      if (ev.target.closest('#pwClear')) { var s = store(H); delete s[cur]; H.sset(KEY, s); draw(); return; }
      if (ev.target.closest('#pwCsv')) {
        var q = function (v) { v = String(v == null ? '' : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        var out = [['Team', 'Player'].concat(ITEMS.map(function (it) { return it[1]; })).concat(['Cleared to play', 'Sample'])];
        H.D.teams.forEach(function (t) {
          rows(H, t.id).forEach(function (row) {
            out.push([t.name, row.name].concat(row.v.map(function (v) { return v ? 'Yes' : 'No'; })).concat([row.ok ? 'Yes' : 'No', row.sampleName || row.sampleTicks ? 'Sample' : '']));
          });
        });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([out.map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv' }));
        a.download = 'empire-paperwork.csv'; document.body.appendChild(a); a.click(); a.remove();
      }
    });
  };
})();
