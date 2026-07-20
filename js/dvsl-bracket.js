/* ═══════════════════════════════════════════════════════════════════════
   DVSL BRACKET ENGINE
   Ported from the D27 / STS district bracket engine (d19-site/brackets.html),
   which runs live on PA District 19/22/30 and Small Town Select.

   What it does: you give it a list of games where a side can be a literal
   team name OR a reference — "WG-5" (winner of game 5) / "LG-3" (loser of
   game 3). As scores get entered, it resolves those references into real
   teams and advances them, drawing the winners bracket on top, the losers
   bracket below, and the championship to the right, with connector lines.

   Differences from the D27 original:
     • no D27 chrome/deps (D27logos, escTxt, d27-gamemodal) — self-contained
     • DVSL colors, and CSS lives in playoffs-content.html scoped to the page
     • exposes window.DVSLBracket instead of page-level globals

   Data shape:
     { key:'gold', name:'Gold Bracket', sub:'…', teams:[{n,name,abbr}],
       games:[{g, away, home, as, hs, date:'YYYY-MM-DD', time:'HH:MM', field}] }
   A game is "played" only when BOTH as and hs are numbers.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CARD_W = 210, CARD_H = 137, COL_GAP = 76, ROW_GAP = 26, Y_PAD = 26;

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── reference parsing + winner resolution ───────────────────────────
  function parseRef(s) {
    if (s == null) return { kind: 'tbd' };
    var t = String(s).trim();
    var m = t.match(/^WG-(\d+)$/i); if (m) return { kind: 'WG', g: +m[1] };
    m = t.match(/^LG-(\d+)$/i);     if (m) return { kind: 'LG', g: +m[1] };
    if (/if necessary/i.test(t)) return { kind: 'tbd', label: 'If necessary' };
    if (/^bye$/i.test(t))        return { kind: 'bye' };
    if (/^(tbd|tba)$/i.test(t))  return { kind: 'tbd' };
    return { kind: 'team', name: t };
  }
  function gameByNum(t, n) { return t.games.find(function (g) { return g.g === n; }); }
  // Both scores must be present. (Unlike the D27 original we do NOT require
  // as+hs > 0, so a legitimate 1-0 / 0-0 entry still counts as played.)
  function isPlayed(g) { return !!g && g.as != null && g.hs != null && g.as !== '' && g.hs !== ''; }

  function resolveSide(t, ref, seen) {
    seen = seen || new Set();
    if (ref.kind === 'team') return ref.name;
    if (ref.kind === 'bye')  return 'BYE';
    if (ref.kind !== 'WG' && ref.kind !== 'LG') return null;
    var g = gameByNum(t, ref.g);
    if (!g || seen.has(ref.g)) return null;
    seen.add(ref.g);
    return ref.kind === 'WG' ? winnerName(t, g, seen) : loserName(t, g, seen);
  }
  function winnerName(t, g, seen) {
    if (!isPlayed(g)) return null;
    var a = resolveSide(t, parseRef(g.away), new Set(seen)),
        h = resolveSide(t, parseRef(g.home), new Set(seen));
    return g.as > g.hs ? a : g.hs > g.as ? h : null;
  }
  function loserName(t, g, seen) {
    if (!isPlayed(g)) return null;
    var a = resolveSide(t, parseRef(g.away), new Set(seen)),
        h = resolveSide(t, parseRef(g.home), new Set(seen));
    return g.as > g.hs ? h : g.hs > g.as ? a : null;
  }
  function sideDisplay(t, raw) {
    var ref = parseRef(raw);
    if (ref.kind === 'team') return { name: ref.name };
    if (ref.kind === 'bye')  return { name: 'BYE', bye: true };
    if (ref.kind === 'tbd')  return { name: ref.label || 'TBD', tbd: true };
    var resolved = resolveSide(t, ref, new Set());
    if (resolved) return { name: resolved, via: 'G' + ref.g };
    return { name: (ref.kind === 'WG' ? 'Winner' : 'Loser') + ' G' + ref.g, tbd: true };
  }

  // ── structure: feeders, rounds, bracket class (w / l / f) ───────────
  function feeders(g) {
    var o = [];
    [g.away, g.home].forEach(function (raw) {
      var r = parseRef(raw);
      if (r.kind === 'WG' || r.kind === 'LG') o.push(r.g);
    });
    return o;
  }
  function computeRounds(t) {
    var depth = {}, guard = new Set();
    function d(n) {
      if (depth[n] != null) return depth[n];
      if (guard.has(n)) return 1;
      guard.add(n);
      var g = gameByNum(t, n); if (!g) return 1;
      var f = feeders(g);
      var r = f.length ? 1 + Math.max.apply(null, f.map(d)) : 1;
      depth[n] = r; return r;
    }
    t.games.forEach(function (g) { d(g.g); });
    return depth;
  }
  // Winners bracket = "pure winners": no LG anywhere in the game's lineage.
  function classify(t) {
    var pw = {}, guard = new Set();
    function isPw(n) {
      if (pw[n] != null) return pw[n];
      if (guard.has(n)) return true;
      guard.add(n);
      var g = gameByNum(t, n); if (!g) { pw[n] = true; return true; }
      var v = true;
      [g.away, g.home].forEach(function (raw) {
        var r = parseRef(raw);
        if (r.kind === 'LG') v = false;
        if (r.kind === 'WG' && !isPw(r.g)) v = false;
      });
      pw[n] = v; return v;
    }
    t.games.forEach(function (g) { isPw(g.g); });

    var depth = computeRounds(t);
    var wbFinal = null, wbDepth = -1;
    t.games.forEach(function (g) {
      if (pw[g.g] && (depth[g.g] || 1) > wbDepth) { wbDepth = depth[g.g] || 1; wbFinal = g.g; }
    });

    var consumers = {};
    t.games.forEach(function (g) {
      [g.away, g.home].forEach(function (raw) {
        var r = parseRef(raw);
        if (r.kind === 'WG' || r.kind === 'LG') (consumers[r.g] = consumers[r.g] || []).push(g.g);
      });
    });

    // Grand final = game(s) consuming the WB final's winner (+ if-necessary).
    var fin = new Set();
    if (wbFinal != null) {
      var q = (consumers[wbFinal] || []).filter(function (n) {
        var g = gameByNum(t, n), a = parseRef(g.away), h = parseRef(g.home);
        return (a.kind === 'WG' && a.g === wbFinal) || (h.kind === 'WG' && h.g === wbFinal);
      });
      while (q.length) {
        var n = q.shift();
        if (fin.has(n)) continue;
        fin.add(n);
        (consumers[n] || []).forEach(function (c) { q.push(c); });
      }
      if (!fin.size) fin.add(wbFinal); // single-elim: WB final IS the title game
    }

    var cls = {};
    t.games.forEach(function (g) { cls[g.g] = fin.has(g.g) ? 'f' : pw[g.g] ? 'w' : 'l'; });
    return cls;
  }

  // ── card markup ─────────────────────────────────────────────────────
  function fmtTime(s) {
    var p = String(s).split(':').map(Number), h = p[0], m = p[1] || 0;
    var ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
  }
  function okStr(v) { return v && !/^(n\/?a|tbd|tba|none|-+)$/i.test(String(v).trim()); }

  function matchHTML(t, g, cls, x, y) {
    var A = sideDisplay(t, g.away), H = sideDisplay(t, g.home);
    var played = isPlayed(g), aWin = played && g.as > g.hs, hWin = played && g.hs > g.as;
    function side(s, sc, win) {
      return '<div class="bk-side' + (win ? ' win' : '') + (s.tbd ? ' tbd' : '') + (s.bye ? ' bye' : '') + '">' +
        '<span class="nm">' + esc(s.name) + (s.via ? '<span class="via">via ' + esc(s.via) + '</span>' : '') + '</span>' +
        '<span class="sc">' + (sc != null && sc !== '' ? esc(sc) : '') + '</span></div>';
    }
    var tag = cls === 'f' ? '<span class="tag f">🏆 Final</span>'
            : cls === 'l' ? '<span class="tag l">Losers</span>'
                          : '<span class="tag w">Winners</span>';
    var cd = okStr(g.date) ? new Date(g.date + 'T12:00:00') : null;
    var when = [
      (cd && !isNaN(cd)) ? cd.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' }) : null,
      okStr(g.time) ? fmtTime(g.time) : null
    ].filter(Boolean).join(' · ');
    var field = okStr(g.field) ? String(g.field) : '';
    // Reuse the site's clickable-venue helper when it's available.
    var fieldHTML = field
      ? '📍 ' + (typeof window.fieldLink === 'function' ? window.fieldLink(field) : esc(field))
      : '';
    return '<div class="bk-match acc-' + cls + '" data-tkey="' + esc(t.key) + '" data-g="' + g.g + '"' +
      ' style="left:' + x + 'px;top:' + y + 'px">' +
      '<div class="bk-mtop"><span class="g">Game ' + g.g + '</span>' + tag + '</div>' +
      side(A, g.as, aWin) + side(H, g.hs, hWin) +
      '<div class="bk-mfoot"><div class="bk-when">' + esc(when || 'TBD') + '</div>' +
      '<div class="bk-frow"><span class="bk-field">' + fieldHTML + '</span></div></div></div>';
  }

  // ── layout ──────────────────────────────────────────────────────────
  // Columns = distance to the section's final, so each round lines up.
  function colsFromEnd(t, games) {
    var inSet = new Set(games.map(function (g) { return g.g; }));
    var consumer = {};
    games.forEach(function (c) {
      [c.away, c.home].forEach(function (raw) {
        var r = parseRef(raw);
        if (r.kind === 'WG' && inSet.has(r.g)) consumer[r.g] = c.g;
      });
    });
    var rank = {}, guard = new Set();
    function rk(n) {
      if (rank[n] != null) return rank[n];
      if (guard.has(n)) return 0;
      guard.add(n);
      var c = consumer[n];
      rank[n] = (c != null && inSet.has(c)) ? 1 + rk(c) : 0;
      return rank[n];
    }
    games.forEach(function (g) { rk(g.g); });
    var maxRank = Math.max.apply(null, [0].concat(games.map(function (g) { return rank[g.g] || 0; })));
    var col = {};
    games.forEach(function (g) { col[g.g] = maxRank - (rank[g.g] || 0) + 1; });
    return col;
  }

  // Rows: leaves stack top→bottom; every later game centers between its feeders.
  function layoutSection(t, games) {
    var inSet = new Set(games.map(function (g) { return g.g; }));
    var depth = colsFromEnd(t, games);
    var SLOT = CARD_H + ROW_GAP;
    function kidsOf(n) {
      var g = gameByNum(t, n); if (!g) return [];
      var ks = [];
      [g.away, g.home].forEach(function (raw) {
        var r = parseRef(raw);
        if ((r.kind === 'WG' || r.kind === 'LG') && inSet.has(r.g)) ks.push(r.g);
      });
      return ks;
    }
    var consumed = new Set();
    games.forEach(function (g) { kidsOf(g.g).forEach(function (k) { consumed.add(k); }); });
    var roots = games.map(function (g) { return g.g; })
      .filter(function (n) { return !consumed.has(n); })
      .sort(function (a, b) { return a - b; });

    var cen = {}, leaf = 0, guard = new Set();
    function place(n) {
      if (cen[n] != null) return cen[n];
      if (guard.has(n)) return (cen[n] = Y_PAD + (leaf++) * SLOT + CARD_H / 2);
      guard.add(n);
      var ks = kidsOf(n), c;
      if (ks.length) {
        var cs = ks.map(place);
        c = (Math.min.apply(null, cs) + Math.max.apply(null, cs)) / 2;
      } else {
        c = Y_PAD + (leaf++) * SLOT + CARD_H / 2;
      }
      return (cen[n] = c);
    }
    roots.forEach(place);
    games.forEach(function (g) { if (cen[g.g] == null) place(g.g); });

    var pos = {};
    games.forEach(function (g) {
      pos[g.g] = { x: ((depth[g.g] || 1) - 1) * (CARD_W + COL_GAP), y: cen[g.g] - CARD_H / 2, h: CARD_H, col: depth[g.g] || 1 };
    });

    // de-overlap within a column
    var byCol = {};
    games.forEach(function (g) { var r = depth[g.g] || 1; (byCol[r] = byCol[r] || []).push(g.g); });
    Object.keys(byCol).forEach(function (r) {
      var list = byCol[r].sort(function (a, b) { return pos[a].y - pos[b].y; });
      for (var i = 1; i < list.length; i++) {
        var minY = pos[list[i - 1]].y + pos[list[i - 1]].h + ROW_GAP;
        if (pos[list[i]].y < minY) pos[list[i]].y = minY;
      }
    });
    return pos;
  }

  // Winners on top, losers directly below, championship to the RIGHT of both,
  // so the two feeds visibly converge into the title game.
  function combinedCanvas(t, cls, visible) {
    var REGION_GAP = 64;
    var W = visible.filter(function (g) { return cls[g.g] === 'w'; });
    var L = visible.filter(function (g) { return cls[g.g] === 'l'; });
    var F = visible.filter(function (g) { return cls[g.g] === 'f'; }).sort(function (a, b) { return a.g - b.g; });

    var pos = {}, posW = layoutSection(t, W), winnersH = 0, winnersMaxCol = 0;
    Object.keys(posW).forEach(function (k) {
      pos[k] = posW[k];
      winnersH = Math.max(winnersH, posW[k].y + posW[k].h);
      winnersMaxCol = Math.max(winnersMaxCol, posW[k].col);
    });

    var losersOffsetY = winnersH + REGION_GAP, losersMaxCol = 0;
    if (L.length) {
      var posL = layoutSection(t, L);
      var wcol = {}; W.forEach(function (g) { wcol[g.g] = posW[g.g].col; });
      var Lset = new Set(L.map(function (g) { return g.g; }));
      var offCol = 0;
      L.forEach(function (g) {
        var wMax = 0, hasL = false;
        [g.away, g.home].forEach(function (raw) {
          var r = parseRef(raw);
          if (r.kind === 'WG' || r.kind === 'LG') {
            if (Lset.has(r.g)) hasL = true;
            else if (r.kind === 'LG' && wcol[r.g] != null) wMax = Math.max(wMax, wcol[r.g]);
          }
        });
        if (wMax && !hasL) offCol = Math.max(offCol, wMax - posL[g.g].col);
      });
      var dx = Math.max(0, offCol) * (CARD_W + COL_GAP);
      Object.keys(posL).forEach(function (k) {
        pos[k] = { x: posL[k].x + dx, y: posL[k].y + losersOffsetY, h: posL[k].h, col: posL[k].col + offCol };
        losersMaxCol = Math.max(losersMaxCol, posL[k].col + offCol);
      });
    }

    var fcol = Math.max(winnersMaxCol, losersMaxCol) + 1;
    F.forEach(function (g) {
      var fc = feeders(g).map(function (n) { return pos[n]; }).filter(Boolean)
        .map(function (p) { return p.y + p.h / 2; });
      var cy = fc.length ? (Math.min.apply(null, fc) + Math.max.apply(null, fc)) / 2 : losersOffsetY / 2 + Y_PAD;
      pos[g.g] = { x: (fcol - 1) * (CARD_W + COL_GAP), y: cy - CARD_H / 2, h: CARD_H, col: fcol };
      fcol++;
    });

    var maxX = 0, maxY = 0;
    Object.keys(pos).forEach(function (k) {
      maxX = Math.max(maxX, pos[k].x + CARD_W);
      maxY = Math.max(maxY, pos[k].y + pos[k].h);
    });

    // Connectors follow ONLY "winner advances" refs — drawing loser drop-ins too
    // turns the canvas into spaghetti.
    function wgFeeders(g) {
      var o = [];
      [g.away, g.home].forEach(function (raw) {
        var r = parseRef(raw); if (r.kind === 'WG') o.push(r.g);
      });
      return o;
    }
    function lineColor(k) {
      return k === 'f' ? '#C9A227' : k === 'l' ? 'rgba(200,16,46,.55)' : 'rgba(0,45,114,.5)';
    }
    var paths = '';
    visible.forEach(function (g) {
      var p = pos[g.g]; if (!p) return;
      wgFeeders(g).forEach(function (fn) {
        var fp = pos[fn]; if (!fp) return;
        var x1 = fp.x + CARD_W, y1 = fp.y + fp.h / 2, x2 = p.x, y2 = p.y + p.h / 2,
            mx = x1 + (x2 - x1) / 2, sw = cls[g.g] === 'f' ? 2.5 : 2;
        paths += '<path d="M' + x1 + ',' + y1 + ' H' + mx + ' V' + y2 + ' H' + x2 +
                 '" fill="none" stroke="' + lineColor(cls[g.g]) + '" stroke-width="' + sw + '"/>';
      });
    });

    var cards = '';
    visible.forEach(function (g) { var p = pos[g.g]; if (p) cards += matchHTML(t, g, cls[g.g], p.x, p.y); });

    var labels = '';
    if (L.length) {
      labels += '<div class="bk-region w" style="left:0;top:2px">Winners Bracket</div>';
      labels += '<div class="bk-region l" style="left:0;top:' + (losersOffsetY - 20) + 'px">Losers Bracket</div>';
      if (F.length) {
        var fp0 = pos[F[0].g];
        if (fp0) labels += '<div class="bk-region f" style="left:' + fp0.x + 'px;top:' + (fp0.y - 22) + 'px">Championship</div>';
      }
    }

    var Hgt = maxY + Y_PAD;
    return '<div class="bk-scroll"><div class="bk-canvas" style="width:' + maxX + 'px;height:' + Hgt + 'px">' +
      '<svg width="' + maxX + '" height="' + Hgt + '">' + paths + '</svg>' + labels + cards + '</div></div>';
  }

  // Double-elim outcome. The winners-bracket champion only has to win the grand
  // final once — if they do, the if-necessary game is never played, so hide it.
  function championOutcome(t, cls) {
    var finals = t.games.filter(function (g) { return cls[g.g] === 'f'; })
      .sort(function (a, b) { return a.g - b.g; });
    var hide = new Set();
    if (!finals.length) return { champion: null, hide: hide };
    var gf = finals[0];
    function feederCls(raw) {
      var r = parseRef(raw);
      return (r.kind === 'WG' || r.kind === 'LG') ? cls[r.g] : null;
    }
    var winnersSide = feederCls(gf.away) === 'w' ? 'away' : feederCls(gf.home) === 'w' ? 'home' : 'away';
    var isGrandFinal = feederCls(gf.away) === 'l' || feederCls(gf.home) === 'l';
    var champion = null;
    if (isPlayed(gf)) {
      var winSide = gf.as > gf.hs ? 'away' : gf.hs > gf.as ? 'home' : null;
      if (winSide && (!isGrandFinal || winSide === winnersSide)) {
        champion = resolveSide(t, parseRef(winSide === 'away' ? gf.away : gf.home), new Set());
        finals.slice(1).forEach(function (g) { hide.add(g.g); });
      } else if (winSide) {
        var dec = finals[1];
        if (dec && isPlayed(dec)) {
          var ds = dec.as > dec.hs ? 'away' : dec.hs > dec.as ? 'home' : null;
          if (ds) champion = resolveSide(t, parseRef(ds === 'away' ? dec.away : dec.home), new Set());
        }
      }
    }
    return { champion: champion, hide: hide };
  }

  function teamsPanelHTML(t) {
    var teams = (t.teams || []).slice().sort(function (a, b) { return (a.n || 0) - (b.n || 0); });
    if (!teams.length) return '';
    var rows = teams.map(function (tm) {
      return '<tr><td class="ts">' + (tm.n || '') + '</td><td class="tn">' + esc(tm.name || '') +
        '</td><td class="tac"><span class="ta">' + esc(tm.abbr || '') + '</span></td></tr>';
    }).join('');
    return '<details class="bk-teams"><summary><span class="chev">▸</span> Teams &amp; Seeds ' +
      '<span class="cnt">' + teams.length + ' teams</span></summary>' +
      '<div class="bk-teams-wrap"><table class="bk-teams-table"><tbody>' + rows + '</tbody></table></div></details>';
  }

  // ── public render ───────────────────────────────────────────────────
  function render(container, t) {
    if (!container) return;
    if (!t || !Array.isArray(t.games) || !t.games.length) {
      container.innerHTML = '<div class="bk-empty">No bracket games defined yet.</div>';
      return;
    }
    var cls = classify(t);
    var outcome = championOutcome(t, cls);
    var visible = t.games.filter(function (g) { return !outcome.hide.has(g.g); });
    var champ = outcome.champion
      ? '<div class="bk-champ">🏆 <strong>' + esc(outcome.champion) + '</strong> — Champion</div>'
      : '';
    var played = t.games.filter(isPlayed).length;
    var head = '<div class="bk-head"><div class="bk-head-t">' + esc(t.name || 'Bracket') + '</div>' +
      '<div class="bk-head-s">' + esc(t.sub || ('Double elimination · ' + t.games.length + ' games')) +
      ' · <strong>' + played + '</strong> of ' + t.games.length + ' played</div></div>';
    container.innerHTML = head + champ + teamsPanelHTML(t) + combinedCanvas(t, cls, visible);
  }

  // zoom helpers operate on a wrapper element the page supplies
  function zoomBy(wrap, delta, labelEl) {
    if (!wrap) return;
    var cur = parseFloat(wrap.dataset.zoom || '1');
    var z = Math.min(1.4, Math.max(0.3, Math.round((cur + delta) * 10) / 10));
    wrap.dataset.zoom = z;
    wrap.style.zoom = z;
    if (labelEl) labelEl.textContent = Math.round(z * 100) + '%';
  }
  function fit(wrap, labelEl) {
    if (!wrap) return;
    wrap.style.zoom = '1';
    var maxW = 0;
    wrap.querySelectorAll('.bk-canvas').forEach(function (c) { maxW = Math.max(maxW, c.offsetWidth); });
    var avail = (wrap.parentElement ? wrap.parentElement.clientWidth : window.innerWidth) - 8;
    var z = maxW > 0 ? Math.round(Math.max(0.3, Math.min(1, avail / maxW)) * 100) / 100 : 1;
    wrap.dataset.zoom = z;
    wrap.style.zoom = z;
    if (labelEl) labelEl.textContent = Math.round(z * 100) + '%';
  }

  // ── standard 8-team double elimination (15 games) ───────────────────
  // Same wiring the D19/D30/STS brackets run. seeds = array of 8 names by
  // seed order (index 0 = the 1 seed); missing entries render as TBD.
  //   WB : G1 1v8 · G2 4v5 · G3 3v6 · G4 2v7 · G5,G6 semis · G11 final
  //   LB : G7,G8 round 1 · G9,G10 round 2 (semi losers cross in) · G12 semi
  //        · G13 final (LB winner vs WB-final loser)
  //   F  : G14 grand final · G15 only if the LB team wins G14
  function build8TeamDoubleElim(opts) {
    opts = opts || {};
    var s = opts.seeds || [];
    var nm = function (i) { return (s[i] && String(s[i]).trim()) ? String(s[i]).trim() : 'TBD'; };
    var sch = opts.schedule || {};           // { 1:{date,time,field}, … }
    function G(g, away, home) {
      var m = sch[g] || {};
      return { g: g, away: away, home: home, as: null, hs: null,
               date: m.date || '', time: m.time || '', field: m.field || '' };
    }
    return {
      key: opts.key || 'bracket',
      name: opts.name || 'Bracket',
      sub: opts.sub || 'Double elimination · 15 games',
      teams: s.map(function (n, i) { return { n: i + 1, name: (n && String(n).trim()) || 'TBD', abbr: opts.abbrs ? opts.abbrs[i] : '' }; }),
      games: [
        G(1, nm(0), nm(7)), G(2, nm(3), nm(4)), G(3, nm(2), nm(5)), G(4, nm(1), nm(6)),
        G(5, 'WG-1', 'WG-2'), G(6, 'WG-3', 'WG-4'),
        G(7, 'LG-1', 'LG-2'), G(8, 'LG-3', 'LG-4'),
        G(9, 'LG-6', 'WG-7'), G(10, 'LG-5', 'WG-8'),
        G(11, 'WG-5', 'WG-6'),
        G(12, 'WG-9', 'WG-10'),
        G(13, 'LG-11', 'WG-12'),
        G(14, 'WG-11', 'WG-13'),
        G(15, 'WG-14', 'LG-14')
      ]
    };
  }

  window.DVSLBracket = {
    render: render,
    build8TeamDoubleElim: build8TeamDoubleElim,
    zoomBy: zoomBy,
    fit: fit,
    // exposed for the admin score editor + tests
    classify: classify,
    isPlayed: isPlayed,
    resolveSide: resolveSide,
    parseRef: parseRef,
    sideDisplay: sideDisplay,
    championOutcome: championOutcome
  };
})();
