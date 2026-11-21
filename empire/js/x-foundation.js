/* Empire Athletics Foundation and the Brandon Wilson Scholarship. Story, first winner, SAMPLE goal, SAMPLE donor wall, Give form.
   Gifts made here save on this device only (emp_x_foundation). Nothing is charged. */
(function () {
  'use strict';
  var X = window.EMPIRE_EXT = window.EMPIRE_EXT || {};
  X.pages = X.pages || {}; X.init = X.init || {};
  var KEY = 'emp_x_foundation', GOAL = 15000, BASE = 6200, CHIPS = [25, 50, 100, 250, 500], MAX = 100000;
  var LEVELS = [['Champion', 250, '$250 and up'], ['Supporter', 100, '$100 to $249'], ['Friend', 1, 'Up to $99']];
  /* SAMPLE donors. Names are obviously made up. */
  var SEED = [
    { name: 'Sample Family 1', amt: 500, line: 'In memory of Coach Brandon Wilson' },
    { name: 'Sample Business 1', amt: 250, line: '' },
    { name: 'Sample Family 2', amt: 250, line: 'In honor of the 18u class' },
    { name: 'Anonymous', amt: 150, line: '' },
    { name: 'Sample Family 3', amt: 100, line: 'In memory of Coach Brandon Wilson' },
    { name: 'Sample Grandparents 1', amt: 100, line: 'In honor of Sample Player 4' },
    { name: 'Sample Family 4', amt: 50, line: '' },
    { name: 'Sample Fan 1', amt: 25, line: 'In honor of Sample Player 2' },
    { name: 'Sample Family 5', amt: 40, line: '' }
  ];
  /* only well formed gifts survive a bad or hand edited storage value */
  function mine(H) {
    var s = H.sget(KEY), g = s && Array.isArray(s.gifts) ? s.gifts : [];
    return g.filter(function (x) { return x && typeof x === 'object' && isFinite(+x.amt) && +x.amt >= 1 && +x.amt <= MAX; })
      .map(function (x) { return { name: String(x.name || 'Anonymous'), amt: Math.round(+x.amt), line: typeof x.line === 'string' ? x.line : '', wall: !!x.wall }; });
  }
  function all(H) {
    return SEED.map(function (d) { return { name: d.name, amt: d.amt, line: d.line, sample: true }; })
      .concat(mine(H).filter(function (g) { return g.wall; }))
      .sort(function (a, b) { return b.amt - a.amt; });
  }
  /* every gift made here counts toward the goal, on the wall or not */
  function raised(H) { return SEED.concat(mine(H)).reduce(function (t, d) { return t + (+d.amt || 0); }, BASE); }

  X.pages.foundation = function (H) {
    var esc = H.esc, prog = {}, al = H.D.alumni || [], a = al.filter(function (x) { return x && x.name === 'Brooke Gullo'; })[0] || al[0] || {};
    (H.D.club.program || []).forEach(function (r) { prog[r[0]] = r[1]; });
    var opts = H.players().filter(Boolean).map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('');
    return H.pageHead('Empire Athletics <span class="wm">Foundation</span>', esc(prog['Empire Athletics Foundation'] || ''), null,
      '<div class="hero__cta"><a class="btn btn--ink" href="#give">Give to the foundation ' + H.I.arrow + '</a><a class="btn" href="#wall">See the donor wall</a></div>') +
      '<section class="sec sec--tight"><div class="wrap"><div class="split"><div><p class="kicker">What it does</p><h2 class="disp fdn__h">Every girl gets to <span class="wm">play</span></h2>' +
      '<ul class="fdn__list"><li><b>Keeps fees down.</b> Money raised helps lower what every family pays.</li><li><b>Helps players play.</b> It helps athletes who could not otherwise afford a season.</li><li><b>Gives scholarships.</b> It helps Empire players moving on to college.</li></ul>' +
      '<p class="mt">The Brandon Wilson Scholarship honors a late Empire coach. It stands for compassion, excellence and camaraderie.</p></div>' +
      '<div><div class="blk blk--gold fdn__win"><img src="' + esc(a.photo || 'img/ig/brooke-gullo.webp') + '" alt="' + esc(a.name || 'Brooke Gullo') + '" loading="lazy">' +
      '<div><p class="kicker">First winner, February 2025</p><h3 class="disp fdn__wn">' + esc(a.name || 'Brooke Gullo') + '</h3><p><b>' + esc(a.college || 'Oswego State') + '</b></p><p class="fine">' + esc(a.note || '') + '</p></div></div></div></div></div></section>' +
      '<section class="sec sec--soft"><div class="wrap"><div class="split"><div><div class="meter" id="fdnMeter"></div></div>' +
      '<div><p class="kicker">Another way to help</p><h2 class="disp fdn__h">Home Run <span class="wm">Derby</span></h2><p class="mt">' + esc(prog['Home Run Derby and Combine'] || '') + '</p><p class="mt"><a class="btn btn--sm" href="derby.html">Pledge for a player ' + H.I.arrow + '</a></p></div></div></div></section>' +
      '<section class="sec sec--tight" id="wall"><div class="wrap"><div class="sec__head"><h2 class="disp">Donor <span class="wm">wall</span></h2><p>Thank you to everyone who gives. ' + H.sample('Sample names') + '</p></div><div class="fdn__wall" id="fdnWall"></div></div></section>' +
      '<section class="sec sec--soft" id="give"><div class="wrap narrow"><div class="sec__head"><h2 class="disp">Give to the <span class="wm">foundation</span></h2><p>Pick an amount. Every gift helps a player.</p></div>' +
      '<form class="form cform" id="fdnForm" novalidate><div class="fld"><span class="fdn__lab" id="fdnAmtLab">Amount</span><div class="chips fdn__chips" role="group" aria-labelledby="fdnAmtLab">' +
      CHIPS.map(function (v) { return '<button type="button" class="chip" data-amt="' + v + '" aria-pressed="' + (v === 100) + '">$' + v + '</button>'; }).join('') + '</div></div>' +
      H.field('fdnOther', 'Or your own amount', 'number', 'min="1" max="' + MAX + '" step="1" inputmode="numeric" placeholder="$"') +
      H.field('fdnName', 'Your name as it should show on the wall', 'text', 'autocomplete="name" placeholder="Like The Smith Family"') +
      '<label class="check"><input type="checkbox" id="fdnAnon"> Show my gift as Anonymous</label>' +
      '<div class="fld"><label for="fdnHonor">In honor of a player (optional)</label><select id="fdnHonor"><option value="">No one in particular</option>' + opts + '</select></div>' +
      '<label class="check"><input type="checkbox" id="fdnWallOk" checked> Add my name to the donor wall</label>' +
      '<p class="fdn__err" id="fdnErr" hidden></p><div><button class="btn btn--ink" type="submit">Give ' + H.I.arrow + '</button></div>' +
      '<p class="fine">Nothing is charged here. On the real site this button goes to the foundation\'s own giving link.</p></form>' +
      '<div class="blk blk--gold mt" id="fdnThanks" hidden></div><p class="mt" id="fdnMineWrap" hidden><button type="button" class="btn btn--sm" id="fdnClear">Remove gifts made on this device</button></p></div></section>' +
      '<section class="sec sec--tight"><div class="wrap narrow"><div class="blk"><div class="blk__top"><h2>How the scholarship is chosen</h2>' + H.sample() + '</div>' +
      '<ol class="fdn__steps"><li>Senior Empire players can apply each winter.</li><li>Each player writes a short note about what Empire meant to her.</li><li>A small group of coaches and parents reads every note.</li><li>They look for the things Coach Wilson stood for: caring for teammates, working hard and lifting others up.</li><li>The winner is shared in February.</li></ol>' +
      '<p class="fine">Sample steps. The club will set the real rules.</p></div></div></section>';
  };

  X.init.foundation = function (H) {
    var esc = H.esc, money = H.money, $ = function (id) { return document.getElementById(id); }, amt = 100;
    function lineFor(pid) { var p = pid && H.player(pid); return p ? 'In honor of ' + p.name : ''; }
    function draw() {
      var r = raised(H), pct = Math.min(100, r / GOAL * 100);
      $('fdnMeter').innerHTML = '<p class="kicker">This year\'s goal ' + H.sample('Sample goal') + '</p><p class="mt"><b>' + money(r) + '</b><span>raised of ' + money(GOAL) + '</span></p>' +
        '<div class="meter__bar" role="img" aria-label="' + Math.round(pct) + ' percent of the goal"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
        '<p>Enough to cover a full season for about ' + Math.floor(r / (H.fee() || 1)) + ' players. Sample numbers.</p>';
      var list = all(H);
      $('fdnWall').innerHTML = LEVELS.map(function (L, i) {
        var top = i ? LEVELS[i - 1][1] : Infinity;
        var rows = list.filter(function (d) { return d.amt >= L[1] && d.amt < top; });
        return '<div class="blk' + (i === 0 ? ' blk--gold' : '') + '"><div class="blk__top"><h2>' + L[0] + '</h2><span class="tag' + (i === 0 ? ' tag--ink' : '') + '">' + L[2] + '</span></div>' +
          (rows.length ? '<ul class="fdn__names">' + rows.map(function (d) {
            return '<li><b>' + esc(d.name) + '</b>' + (d.sample ? '' : ' <span class="tag">You</span>') + (d.line ? '<small>' + esc(d.line) + '</small>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="empty">Be the first.</p>') + '</div>';
      }).join('');
      $('fdnMineWrap').hidden = !mine(H).length;
    }
    function chips() { [].forEach.call(document.querySelectorAll('[data-amt]'), function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-amt') === amt && !$('fdnOther').value)); }); }
    [].forEach.call(document.querySelectorAll('[data-amt]'), function (b) {
      b.addEventListener('click', function () { amt = +b.getAttribute('data-amt'); $('fdnOther').value = ''; chips(); });
    });
    $('fdnOther').addEventListener('input', chips);
    $('fdnAnon').addEventListener('change', function () { $('fdnName').disabled = this.checked; });
    $('fdnForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var o = $('fdnOther').value.trim(), val = o !== '' ? Math.round(+o) || 0 : amt, anon = $('fdnAnon').checked, name = anon ? 'Anonymous' : $('fdnName').value.trim(), err = $('fdnErr'), msg = '';
      if (!(val >= 1)) msg = 'Choose an amount.'; else if (val > MAX) msg = 'For a gift over ' + money(MAX) + ', please contact the club.'; else if (!name) msg = 'Add your name, or check Anonymous.';
      $('fdnName').classList.toggle('bad', !anon && !name);
      err.hidden = !msg; err.textContent = msg; if (msg) return;
      var line = lineFor($('fdnHonor').value), wall = $('fdnWallOk').checked, s = H.sget(KEY);
      s = s && Array.isArray(s.gifts) ? s : { gifts: [] };
      s.gifts.push({ id: 'g' + Date.now().toString(36), name: name, amt: val, line: line, wall: wall, when: new Date().toISOString().slice(0, 10) });
      H.sset(KEY, s);
      var th = $('fdnThanks');
      th.innerHTML = '<h2>Thank you' + (anon ? '' : ', ' + esc(name)) + '</h2><p class="mt">Your gift of <b>' + money(val) + '</b>' + (line ? ' ' + esc(line.charAt(0).toLowerCase() + line.slice(1)) : '') + ' helps an Empire player.</p>' +
        '<p class="mt">Nothing was charged. On the real site you would finish on the foundation\'s own giving link.</p>' +
        '<p class="fine">Sample: ' + (wall ? 'your name is on the wall on this device only.' : 'your gift saves on this device only.') + '</p><p class="mt"><a class="btn btn--sm" href="#wall">See the wall</a></p>';
      th.hidden = false; this.reset(); amt = 100; $('fdnName').disabled = false; chips(); draw();
      th.scrollIntoView({ block: 'center' });
    });
    $('fdnClear').addEventListener('click', function () { if (confirm('Remove the gifts saved on this device? The sample names stay.')) { H.sset(KEY, { gifts: [] }); $('fdnThanks').hidden = true; draw(); } });
    draw();
  };
})();
