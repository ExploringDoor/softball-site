/* Sponsor Empire: sponsor packages, a "see your name" preview and an inquiry form.
   Prices and spot counts are SAMPLES for the demo. The inquiry form is a plain .form, so site.js logs it to the coach desk inbox. */
(function () {
  window.EMPIRE_EXT = window.EMPIRE_EXT || { pages: {}, init: {} };
  var KEY = 'emp_x_sponsor';

  var TIERS = [
    { id: 'pog', name: 'Player of the Game', price: 300, team: true, spots: 'One per team',
      gets: ['Your business names the Player of the Game award for one team, all season.', 'The team thanks you by name in its award posts.', 'Your name on the team page and the home page sponsor band.'],
      where: [['team.html?t=white-16u-elite', 'Team page, Team partners strip'], ['index.html', 'Home page, Team sponsors band'], ['news.html', 'News, award posts']] },
    { id: 'team', name: 'Team Sponsor', price: 900, team: true, spots: 'One per team',
      gets: ['Your logo on one team page for the season.', 'Your name on that team\'s poster for the fence.', 'Jersey sleeve name if you sign up before the uniform order. The club confirms it with the uniform maker.'],
      where: [['teams.html', 'Your team\'s page, Team partners strip'], ['cards.html?t=white-16u-elite', 'Team poster and card set'], ['index.html', 'Home page, Team sponsors band']] },
    { id: 'derby', name: 'Derby and Combine Sponsor', price: 1200, spots: 'Two spots for the season',
      gets: ['Your name on the Home Run Derby and skills combine, the club event every team plays in.', 'A thank you at the event and in the derby recap.', 'Every dollar raised that day goes to the Empire Athletics Foundation.'],
      where: [['derby.html', 'Home Run Derby page'], ['index.html', 'Home page, Team sponsors band'], ['news.html', 'News, derby recap']] },
    { id: 'fdn', name: 'Foundation Scholarship Partner', price: 1500, spots: 'One partner a year',
      gets: ['Your business helps fund a scholarship for an Empire player heading to college.', 'Your name next to the scholarship when the winner is announced.', 'Helps keep fees down for families who need it.'],
      where: [['about.html', 'About page, More than a team section'], ['commits.html', 'Playing in college page'], ['news.html', 'News, scholarship winner post']] }
  ];
  function tier(id) { return TIERS.filter(function (t) { return t.id === id; })[0] || TIERS[0]; }
  function initials(s) { return s.split(/\s+/).filter(function (w) { return /^[a-z0-9]/i.test(w); }).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase() || 'YB'; }

  function preview(H, st) {
    var esc = H.esc, t = tier(st.tier), nm = st.name || 'Your Business Name', tm = H.team(st.team) || H.D.teams[1];
    var mark = '<span class="spx-logo" aria-hidden="true">' + esc(initials(nm)) + '</span>';
    var band = '<div class="spons">' + H.D.sponsors.map(function (x) { return '<span class="spons__real"><b>' + esc(x[0]) + '</b><i>' + esc(x[1]) + '</i></span>'; }).join('') +
      '<span class="spons__real spx-you">' + mark + '<b>' + esc(nm) + '</b><i>' + esc(t.name + (t.team ? ', ' + tm.name : '')) + '</i></span><span>Your business here</span></div>';
    var where = t.team ? tm.name + ' team page' : t.id === 'derby' ? 'Home Run Derby page' : 'About page, Empire Athletics Foundation';
    var strip = '<div class="spx-strip"><p class="kicker">' + esc(t.team ? 'Team partners' : t.id === 'derby' ? 'Derby and combine sponsor' : 'Scholarship partner') + '</p>' +
      '<div class="spx-strip__row">' + mark + '<span><b>' + esc(nm) + '</b><i>' + esc(t.id === 'pog' ? 'Player of the Game sponsor' : t.id === 'team' ? 'Team sponsor, ' + tm.name : t.id === 'derby' ? 'Home Run Derby and Combine' : 'Empire Athletics Foundation scholarship') + '</i></span></div></div>';
    return '<p class="spx-lab">Home page, Team sponsors band</p>' + band + '<p class="spx-lab">' + esc(where) + '</p>' + strip;
  }

  window.EMPIRE_EXT.pages.sponsor = function (H) {
    var D = H.D, esc = H.esc, I = H.I;
    var titles = D.results.concat(H.club().results || []).filter(function (r) { return r && /champ/i.test(r.finish || ''); }).length;
    var st = H.sget(KEY); if (!st || typeof st !== 'object') st = {};
    var ages = D.teams.map(function (t) { return parseInt(t.age, 10); }).filter(function (n) { return n > 0; });
    var ageRange = ages.length ? Math.min.apply(null, ages) + 'U to ' + Math.max.apply(null, ages) + 'U' : '';
    var topt = D.teams.map(function (t) { return '<option value="' + t.id + '"' + (t.id === (st.team || 'white-16u-elite') ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
    var tierOpts = TIERS.map(function (t) { return '<option>' + esc(t.name) + '</option>'; }).join('');
    var taken = D.sponsors.length;

    return H.pageHead('Sponsor <span class="wm">Empire</span>', 'Local businesses help cover tournament fees, winter training and the scholarship fund. Here is what each package gets you and where your name shows on this site.', null,
        '<div class="hero__cta"><a class="btn btn--ink" href="#spx-ask">Ask about sponsoring ' + I.arrow + '</a><a class="btn" href="#spx-try">See your name on the site</a></div>') +

      '<section class="sec sec--tight sec--gold"><div class="wrap"><div class="sec__head"><h2 class="disp">Why sponsor Empire</h2></div>' +
      '<div class="nums spx-nums"><div><b>' + D.teams.length + '</b><span>Teams' + (ageRange ? ', ' + esc(ageRange) : '') + '</span></div><div><b>' + titles + '</b><span>Tournament titles posted</span></div><div><b>1K</b><span>About 1,000 follow the club on Instagram</span></div></div>' +
      '<p>Families from all over ' + esc(D.club.region) + ' follow these teams, and the teams travel across the tri-state area. Brooklyn Delights Bakery already sponsors the Player of the Game award for Empire White. Max Effort Baseball and Joe Szadok Fitness help train the teams as partners.</p></div></section>' +

      '<section class="sec"><div class="wrap"><div class="sec__head"><h2 class="disp">The packages</h2><p>Every package runs for one season. ' + H.sample('Sample prices and spots') + '</p></div>' +
      '<div class="spx-tiers">' + TIERS.map(function (t) {
        var open = t.id === 'pog' ? (D.teams.length - taken) + ' of ' + D.teams.length + ' open. Empire White is taken by Brooklyn Delights Bakery.' : t.id === 'team' ? D.teams.length + ' of ' + D.teams.length + ' open.' : 'Open.';
        return '<div class="blk spx-tier"><div class="blk__top"><h2>' + esc(t.name) + '</h2></div>' +
          '<p class="spx-price disp">' + H.money(t.price) + '</p><p class="fine">per season ' + H.sample() + '</p>' +
          '<p class="spx-h">What you get</p><ul class="spx-list">' + t.gets.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul>' +
          '<p class="spx-h">Where your name shows</p><ul class="spx-list spx-links">' + t.where.map(function (w) { return '<li><a class="more" href="' + w[0] + '">' + esc(w[1]) + '</a></li>'; }).join('') + '</ul>' +
          '<p class="spx-h">Spots</p><p>' + esc(t.spots) + '. ' + esc(open) + '</p>' +
          '<p class="mt"><button type="button" class="btn btn--sm btn--ink" data-spx-pick="' + t.id + '">Ask about this one</button></p></div>';
      }).join('') + '</div>' +
      '<p class="note">Max Effort Baseball and Joe Szadok Fitness are training partners. They are listed on the team page as partners, not as paying sponsors.</p></div></section>' +

      '<section class="sec sec--soft" id="spx-try"><div class="wrap split"><div><h2 class="disp" style="font-size:clamp(26px,7vw,44px)">See your name <span class="wm">on the site</span></h2>' +
      '<p class="mt">Type your business name and pick a package. The preview shows how it would look. Nothing is posted.</p>' +
      '<form class="form cform mt" id="spxTry">' + H.field('spxName', 'Business name', 'text', 'maxlength="40" autocomplete="organization" placeholder="Your Business Name"', st.name || '') +
      '<div class="fld"><label for="spxTier">Package</label><select id="spxTier">' + TIERS.map(function (t) { return '<option value="' + t.id + '"' + (t.id === st.tier ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="fld" id="spxTeamF"><label for="spxTeam">Team</label><select id="spxTeam">' + topt + '</select></div></form></div>' +
      '<div class="blk" id="spxOut" aria-live="polite">' + preview(H, st) + '</div></div></section>' +

      '<section class="sec" id="spx-ask"><div class="wrap split"><div><h2 class="disp" style="font-size:clamp(26px,7vw,44px)">Ask about <span class="wm">sponsoring</span></h2>' +
      '<p class="mt">Tell us a little about your business and which package you like. Someone from the club will follow up.</p></div>' +
      '<form class="form" novalidate><div class="two">' + H.field('spxB', 'Business name', 'text', 'required autocomplete="organization"') + H.field('spxC', 'Your name', 'text', 'required autocomplete="name"') + '</div>' +
      '<div class="two">' + H.field('spxE', 'Email', 'email', 'required autocomplete="email"') + H.field('spxP', 'Phone', 'tel', 'autocomplete="tel"') + '</div>' +
      '<div class="fld"><label for="spxT">Package</label><select id="spxT" name="spxT">' + tierOpts + '<option>Not sure yet</option></select></div>' +
      '<div class="fld"><label for="spxM">Message</label><textarea id="spxM" name="spxM" maxlength="1000" placeholder="Which team, or anything you want us to know"></textarea></div>' +
      '<div><button class="btn btn--ink" type="submit">Send to the club ' + I.arrow + '</button></div>' +
      '<div class="form__ok" role="status">This is a sample site, so nothing was sent. On the live site this goes to the club.</div></form></div></section>';
  };

  window.EMPIRE_EXT.init.sponsor = function (H) {
    var $ = function (id) { return document.getElementById(id); };
    var nm = $('spxName'), tr = $('spxTier'), tm = $('spxTeam'), out = $('spxOut'), teamF = $('spxTeamF');
    function draw() {
      var st = { name: nm.value.trim(), tier: tr.value, team: tm.value };
      teamF.hidden = !tier(st.tier).team;
      out.innerHTML = preview(H, st);
      H.sset(KEY, st);
    }
    [nm, tr, tm].forEach(function (el) { el.addEventListener('input', draw); el.addEventListener('change', draw); });
    teamF.hidden = !tier(tr.value).team;
    $('spxTry').addEventListener('submit', function (e) { e.preventDefault(); draw(); });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-spx-pick]'); if (!b) return;
      var t = tier(b.getAttribute('data-spx-pick'));
      $('spxT').value = t.name; tr.value = t.id; draw();
      $('spx-ask').scrollIntoView(); $('spxB').focus();
    });
  };
})();
