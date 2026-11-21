/* Player of the Game wall. Brooklyn Delights Bakery (real sponsor of Empire White) gives a cookie to the Player of the Game.
   Wall + coach form on potg.html, latest 3 on each team page, and a square graphic per tile drawn once on click.
   Seeded games and lines are SAMPLE. Saves on this device only (emp_x_potg). Nothing is posted. */
(function () {
  'use strict';
  var X = window.EMPIRE_EXT = window.EMPIRE_EXT || {};
  X.pages = X.pages || {}; X.init = X.init || {}; X.blocks = X.blocks || {}; X.after = X.after || {};
  var KEY = 'emp_x_potg', SPONSOR = 'Brooklyn Delights Bakery', GOLD = '#e9d5a1', INK = '#0b0b0b';
  var DISP = '"Unbounded","Arial Black",sans-serif', BODY = '"Instrument Sans",system-ui,sans-serif';
  /* SAMPLE winners for real White 16u Elite players. The games and lines are made up for the demo. */
  var SEED = [
    { id: 's1', sample: true, date: '2026-11-15', team: 'white-16u-elite', pid: 'lia-arduini', game: 'Toys for Tots Tournament, championship game', line: 'Hit a grand slam in the third inning' },
    { id: 's2', sample: true, date: '2026-11-14', team: 'white-16u-elite', pid: 'megan-hobdy', game: 'Toys for Tots Tournament, pool play', line: 'Threw five scoreless innings with seven strikeouts' },
    { id: 's3', sample: true, date: '2026-10-25', team: 'white-16u-elite', pid: 'kaitlyn-lozano', game: 'Fall Classic, semifinal', line: 'Threw out two runners stealing and drove in the winning run' },
    { id: 's4', sample: true, date: '2026-10-11', team: 'white-16u-elite', pid: 'shayna-argentina', game: 'Columbus Day Showdown, game 2', line: 'Went three for three with a diving stop at third' }
  ];

  function mine(H) {
    var s = H.sget(KEY); if (!Array.isArray(s)) return [];
    return s.filter(function (w) { return w && typeof w === 'object' && typeof w.id === 'string' && typeof w.line === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(w.date)); });
  }
  function all(H) { return mine(H).concat(SEED).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }); }
  function who(H, w) { var p = w.pid ? H.player(w.pid) : null; return p ? p.name : (w.name || 'Player'); }
  function short(H, tid) { var t = H.team(tid); return t ? t.name.replace('Empire ', '') : ''; }
  function niceDate(H, s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return String(s || ''); var d = H.ymd(s); return H.MON[d.m] + ' ' + d.d + ', ' + d.y; }

  function tile(H, w, withBtn) {
    var esc = H.esc, p = w.pid ? H.player(w.pid) : null, nm = esc(who(H, w));
    if (!w) return '';
    return '<article class="pog__tile"><div class="pog__top"><span class="pog__date">' + esc(niceDate(H, w.date)) + '</span>' + (w.sample ? H.sample() : '') + '</div>' +
      '<p class="pog__team">' + esc(short(H, w.team)) + '</p>' +
      '<h3 class="pog__name">' + (p ? '<a href="player.html?p=' + esc(p.id) + '">' + nm + '</a>' : nm) + '</h3>' +
      '<p class="pog__line">' + esc(w.line) + '</p><p class="pog__game">' + esc(w.game) + '</p>' +
      '<p class="pog__by">Cookie award from <b>' + SPONSOR + '</b></p>' +
      (withBtn ? '<button type="button" class="btn btn--sm pog__btn" data-gfx="' + esc(w.id) + '">Make the graphic</button>' : '') + '</article>';
  }

  X.pages.potg = function (H) {
    var esc = H.esc;
    var topts = H.D.teams.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === 'white-16u-elite' ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
    return H.pageHead('Player of the <span class="wm">Game</span>', 'After every game the coach picks one player. She gets a cookie from ' + SPONSOR + ' and a spot on this wall.', null,
      '<div class="hero__cta"><a class="btn btn--ink" href="#pogWall">See the winners ' + H.I.arrow + '</a><a class="btn" href="#pogAdd">Coach: add a winner</a></div>') +
      '<section class="sec sec--tight sec--soft" id="pogWall"><div class="wrap"><div class="sec__head"><h2 class="disp">Recent <span class="wm">winners</span></h2>' +
      '<p>Newest first. The players are real. The games and lines marked sample are made up for this demo.</p></div><div class="pog__wall" id="pogList"></div></div></section>' +
      '<section class="sec sec--tight" id="pogAdd"><div class="wrap narrow"><div class="sec__head"><h2 class="disp">Add a <span class="wm">winner</span></h2>' +
      '<p>Coaches only on the real site. Here it saves on this device, so try it.</p></div>' +
      '<form class="form cform" id="pogForm" novalidate><div class="two"><div class="fld"><label for="pogTeam">Team</label><select id="pogTeam" required>' + topts + '</select></div>' +
      '<div class="fld" id="pogPick"></div></div>' +
      '<div class="two">' + H.field('pogDate', 'Game date', 'date', 'required', localDay()) + H.field('pogGame', 'Game', 'text', 'required placeholder="Fall Classic, game 2"') + '</div>' +
      H.field('pogLine', 'What she did', 'text', 'required maxlength="90" placeholder="Hit a grand slam"') +
      '<p class="pog__err" id="pogErr" hidden></p><div class="hero__cta pog__act"><button class="btn btn--ink" type="submit">Add to the wall ' + H.I.arrow + '</button>' +
      '<button type="button" class="btn" id="pogClear">Remove winners added here</button></div>' +
      '<p class="fine">Nothing is posted anywhere. The real site would show it to everyone once the coach saves.</p></form>' +
      '<div class="blk blk--gold mt" id="pogOk" hidden></div></div></section>';
  };

  function localDay() { var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function wrapText(x, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  function graphic(H, w, btn) {
    var c = document.createElement('canvas'), S = 1080; c.width = S; c.height = S;
    var x = c.getContext('2d'), name = who(H, w);
    var ready = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('900 80px "Unbounded"'), document.fonts.load('600 30px "Instrument Sans"')]).catch(function () { }) : Promise.resolve();
    btn.disabled = true; btn.textContent = 'Making it';
    ready.then(function () {
      x.fillStyle = INK; x.fillRect(0, 0, S, S);
      x.strokeStyle = GOLD; x.lineWidth = 14; x.strokeRect(40, 40, S - 80, S - 80);
      x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      x.fillStyle = GOLD; x.font = '900 40px ' + DISP; x.fillText('EMPIRE SOFTBALL', S / 2, 150);
      x.font = '600 30px ' + BODY; x.fillText(short(H, w.team).toUpperCase(), S / 2, 200);
      x.fillStyle = GOLD; x.fillRect(110, 250, S - 220, 120);
      x.fillStyle = INK; x.font = '900 58px ' + DISP; x.fillText('PLAYER OF THE GAME', S / 2, 333, S - 260);
      var sz = 104; x.font = '900 ' + sz + 'px ' + DISP;
      var nl = wrapText(x, name.toUpperCase(), S - 200);
      while ((nl.length > 2 || nl.some(function (l) { return x.measureText(l).width > S - 200; })) && sz > 50) { sz -= 6; x.font = '900 ' + sz + 'px ' + DISP; nl = wrapText(x, name.toUpperCase(), S - 200); }
      var y = 500; x.fillStyle = '#ffffff';
      nl.forEach(function (l) { x.fillText(l, S / 2, y); y += sz * 1.1; });
      x.font = '600 44px ' + BODY; x.fillStyle = '#ffffff';
      wrapText(x, w.line, S - 220).slice(0, 3).forEach(function (l) { y += 10; x.fillText(l, S / 2, y + 30); y += 52; });
      x.font = '600 28px ' + BODY; x.fillStyle = 'rgba(255,255,255,.7)';
      x.fillText(niceDate(H, w.date) + '  |  ' + String(w.game || '').slice(0, 48), S / 2, 880);
      x.fillStyle = GOLD; x.font = '700 32px ' + BODY; x.fillText('Presented by ' + SPONSOR, S / 2, 970);
      if (w.sample) { x.font = '700 22px ' + BODY; x.fillStyle = 'rgba(255,255,255,.55)'; x.fillText('SAMPLE GAME FOR THE DEMO', S / 2, 1010); }
      var file = 'empire-player-of-the-game-' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'winner') + '.png';
      if (!window.EmpireCards || !window.EmpireCards.share) throw new Error('no cards');
      return window.EmpireCards.share(c, file, name + ' is the Empire Player of the Game, presented by ' + SPONSOR);
    }).then(function () { btn.disabled = false; btn.textContent = 'Make the graphic'; }, function () { btn.disabled = false; btn.textContent = 'Make the graphic'; });
  }

  X.init.potg = function (H) {
    var esc = H.esc, $ = function (id) { return document.getElementById(id); };
    function drawWall() { $('pogList').innerHTML = all(H).map(function (w) { return tile(H, w, true); }).join(''); }
    function drawPick() {
      var r = H.roster($('pogTeam').value);
      $('pogPick').innerHTML = r.length ?
        '<label for="pogWho">Player</label><select id="pogWho" required><option value="">Choose a player</option>' + r.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('') + '</select>' :
        '<label for="pogWho">Player name</label><input id="pogWho" type="text" required autocomplete="off" placeholder="No roster posted yet, type her name">';
    }
    $('pogTeam').addEventListener('change', drawPick);
    $('pogList').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-gfx]') : null; if (!b) return;
      var id = b.getAttribute('data-gfx'), w = all(H).filter(function (v) { return v.id === id; })[0];
      if (w) graphic(H, w, b);
    });
    $('pogForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var tid = $('pogTeam').value, pick = $('pogWho'), isSel = pick.tagName === 'SELECT', val = pick.value.trim();
      var date = $('pogDate').value, game = $('pogGame').value.trim(), line = $('pogLine').value.trim(), msg = '';
      [[pick, val], [$('pogDate'), date], [$('pogGame'), game], [$('pogLine'), line]].forEach(function (f) { f[0].classList.toggle('bad', !f[1]); });
      if (!val) msg = 'Pick the player.'; else if (!date) msg = 'Add the game date.'; else if (!game) msg = 'Add the game.'; else if (!line) msg = 'Add what she did.';
      $('pogErr').hidden = !msg; $('pogErr').textContent = msg; if (msg) return;
      var w = { id: 'w' + Date.now().toString(36), date: date, team: tid, game: game.slice(0, 80), line: line.slice(0, 90) };
      if (isSel) w.pid = val; else w.name = val.slice(0, 40);
      H.sset(KEY, [w].concat(mine(H)).slice(0, 60));
      drawWall();
      var ok = $('pogOk');
      ok.innerHTML = '<h2>' + esc(who(H, w)) + ' is on the wall</h2><p class="mt">Saved on this device only. Tap Make the graphic on her tile to get a square picture for Instagram.</p><p class="mt"><a class="btn btn--sm" href="#pogWall">See the wall</a></p>';
      ok.hidden = false; $('pogGame').value = ''; $('pogLine').value = ''; pick.value = '';
      ok.scrollIntoView({ block: 'center' });
    });
    $('pogClear').addEventListener('click', function () { if (confirm('Remove the winners added on this device? The sample winners stay.')) { H.sset(KEY, []); drawWall(); $('pogOk').hidden = true; } });
    drawPick(); drawWall();
  };

  (X.blocks.team = X.blocks.team || []).push(function (H, t) {
    var list = all(H).filter(function (w) { return w.team === t.id; }).slice(0, 3);
    if (!list.length) return '';
    return '<section class="sec sec--tight"><div class="wrap"><div class="sec__head"><h2 class="disp">Player of the <span class="wm">Game</span></h2>' +
      '<p>Presented by ' + SPONSOR + '. Every winner gets a cookie.</p></div><div class="pog__wall pog__wall--strip">' +
      list.map(function (w) { return tile(H, w, false); }).join('') + '</div><p class="mt"><a class="btn btn--sm" href="potg.html">See every winner ' + H.I.arrow + '</a></p></div></section>';
  });
})();
