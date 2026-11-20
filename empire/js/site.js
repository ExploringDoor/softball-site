/* Empire Softball sample: one small script renders every page from js/data.js. No framework, no loops, no timers. */
(function () {
  'use strict';
  var D = window.EMPIRE;
  var page = document.body.dataset.page;
  var app = document.getElementById('app');
  var qs = new URLSearchParams(location.search);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function team(id) { return D.teams.filter(function (t) { return t.id === id; })[0]; }
  function player(id) { return D.players.filter(function (p) { return p.id === id; })[0]; }
  function roster(tid) { return D.players.filter(function (p) { return p.team === tid; }); }
  function pphoto(p) { return 'img/players/' + p.id + '.webp'; }
  function hand(c) { return c === 'L' ? 'Left' : c === 'S' ? 'Switch' : 'Right'; }

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function ymd(s) { var a = s.split('-'); return { y: +a[0], m: +a[1] - 1, d: +a[2] }; }
  function todayKey() { var n = new Date(); return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2); }
  function upcoming(list) {
    var t = todayKey();
    var up = list.filter(function (e) { return e.end >= t; });
    return (up.length ? up : list).slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  }
  function dayRange(e) { var a = ymd(e.start), b = ymd(e.end); return a.d === b.d && a.m === b.m ? '' + a.d : (a.m === b.m ? a.d + ' to ' + b.d : a.d + ' to ' + MON[b.m] + ' ' + b.d); }

  var I = {
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7"/></svg>',
    back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M20 12H5M11 5l-7 7 7 7"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>'
  };

  var NAV = [
    ['index.html', 'Home', 'home'], ['teams.html', 'Teams', 'teams'], ['players.html', 'Players', 'players'],
    ['schedule.html', 'Where to watch', 'schedule'], ['photos.html', 'Photos', 'photos'], ['about.html', 'About', 'about'], ['contact.html', 'Contact', 'contact']
  ];
  var here = { team: 'teams', player: 'players', tryouts: 'tryouts' }[page] || page;

  function header() {
    var links = NAV.slice(1).map(function (n) { return '<a href="' + n[0] + '"' + (n[2] === here ? ' aria-current="page"' : '') + '>' + n[1] + '</a>'; }).join('');
    var sheet = NAV.concat([['tryouts.html', 'Tryouts', 'tryouts']]).map(function (n, i) {
      return '<a class="sheet__link" href="' + n[0] + '"' + (n[2] === here ? ' aria-current="page"' : '') + '><span>0' + (i + 1) + '</span>' + n[1] + '</a>';
    }).join('');
    return '<a class="skip" href="#main">Skip to content</a>' +
      '<header class="top"><div class="wrap top__in">' +
      '<a class="top__logo" href="index.html" aria-label="Empire Softball home"><img src="img/crest-sm.webp" width="320" height="199" alt="Empire Softball"></a>' +
      '<nav class="nav" aria-label="Main">' + links + '<a class="btn" href="tryouts.html">Tryouts</a></nav>' +
      '<button class="menu-btn" id="menuOpen" aria-haspopup="dialog" aria-controls="sheet">MENU</button>' +
      '</div></header>' +
      '<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="Menu"><div class="sheet__top"><img src="img/crest-sm.webp" width="320" height="199" alt="">' +
      '<button class="menu-btn" id="menuClose">CLOSE</button></div>' + sheet +
      '<div class="sheet__soc"><a href="' + D.club.instagram + '" target="_blank" rel="noopener">Instagram</a><a href="' + D.club.facebook + '" target="_blank" rel="noopener">Facebook</a></div></div>';
  }

  function footer() {
    var sky = '<svg class="foot__sky" viewBox="0 0 1200 70" preserveAspectRatio="none" aria-hidden="true"><path fill="currentColor" d="M0 70V52h34V40h22v12h30V30h18v-8h10v8h16v22h40V44h26V34h30v18h28V24h14V12h8V4h4v8h8v12h14v28h36V38h24v14h30V46h22V26h30v20h26V16h10V0h6v16h10v30h34V36h28v16h30V28h20v-8h12v8h20v24h32V42h26v10h30V32h36v20h28V44h30V22h14v-8h8v8h14v30h34V38h30v14h26V48h40v22z"/></svg>';
    return '<footer class="foot">' + sky + '<div class="wrap foot__in">' +
      '<a class="foot__logo" href="index.html"><img src="img/crest.webp" width="900" height="560" loading="lazy" alt="Empire Softball"></a>' +
      '<div class="foot__links">' + NAV.slice(1).concat([['tryouts.html', 'Tryouts']]).map(function (n) { return '<a href="' + n[0] + '">' + n[1] + '</a>'; }).join('') + '</div>' +
      '<div class="foot__soc"><a href="' + D.club.instagram + '" target="_blank" rel="noopener">Instagram</a><a href="' + D.club.facebook + '" target="_blank" rel="noopener">Facebook</a></div>' +
      '</div><div class="wrap foot__fine"><span>Empire Softball, ' + esc(D.club.region) + '. Travel softball, ' + esc(D.club.ages) + '.</span><span>Sample site by Main Line Web Design</span></div></footer>';
  }

  function pageHead(title, sub, ghost, crumb) {
    return '<section class="ph"><div class="wrap ph__in">' + (ghost ? '<span class="ph__ghost" aria-hidden="true">' + esc(ghost) + '</span>' : '') +
      (crumb ? '<a class="ph__crumb" href="' + crumb[0] + '">' + I.back + esc(crumb[1]) + '</a><br>' : '') +
      '<h1 class="disp">' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div></section>';
  }

  /* ---------- shared pieces ---------- */
  function teamRow(t) {
    var n = roster(t.id).length;
    return '<a class="trow" href="team.html?t=' + t.id + '" aria-label="' + esc(t.name) + '">' +
      '<span class="trow__age" aria-hidden="true">' + t.age + '</span>' +
      '<span><span class="trow__name"><i class="sw sw--' + t.color + '" aria-hidden="true"></i>Empire ' + esc(t.color) + (t.tag ? ' <span class="tag">' + esc(t.tag) + '</span>' : '') + '</span>' +
      '<span class="trow__coach">Head coach ' + esc(t.coach) + (n ? ' &nbsp;/&nbsp; ' + n + ' player profiles' : '') + '</span></span>' +
      (t.photo ? '<span class="trow__pic"><img src="' + t.photo + '" loading="lazy" alt=""></span>' : '<span class="trow__pic trow__pic--none"><img src="img/crest-sm.webp" loading="lazy" alt=""></span>') +
      '<span class="trow__go">' + I.arrow + '</span></a>';
  }
  function playerCard(p) {
    return '<a class="pl" href="player.html?p=' + p.id + '">' +
      '<img class="pl__img" src="' + pphoto(p) + '" width="720" height="900" loading="lazy" alt="' + esc(p.name) + '">' +
      '<span class="pl__txt"><span class="pl__name">' + esc(p.name) + '</span>' +
      '<span class="pl__meta"><b>' + p.grad + '</b> &nbsp;' + esc(p.pos.join(' / ')) + '<br>' + esc(p.school) + '</span></span>' +
      '<span class="pl__go">' + I.arrow + '</span></a>';
  }
  function eventRow(e, opts) {
    opts = opts || {};
    var a = ymd(e.start);
    var teams = opts.noTeams ? '' : '<div class="ev__teams">' + e.teams.map(function (id) { var t = team(id); return '<a href="team.html?t=' + id + '"><i class="sw sw--' + t.color + '"></i>' + esc(t.name.replace('Empire ', '')) + '</a>'; }).join('') + '</div>';
    return '<div class="ev"><div class="ev__date"><i>' + MON[a.m] + '</i><b>' + a.d + '</b><small>' + (e.start === e.end ? a.y : 'to ' + (ymd(e.end).m === a.m ? '' : MON[ymd(e.end).m] + ' ') + ymd(e.end).d) + '</small></div>' +
      '<div><h3>' + esc(e.name) + (e.showcase ? ' <span class="tag">College showcase</span>' : '') + '</h3>' +
      '<div class="ev__place">' + esc(e.place) + ', ' + esc(e.city) + '</div>' + teams + '</div>' +
      '<div class="ev__act"><button type="button" data-ics="' + e.id + '">Add to my calendar</button></div></div>';
  }
  function staffRow(s, sub) {
    var ini = s.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2);
    return '<div class="st">' + (s.photo ? '<img src="' + s.photo + '" loading="lazy" alt="' + esc(s.name) + '">' : '<span class="st__ph" aria-hidden="true">' + ini + '</span>') +
      '<div><b>' + esc(s.name) + '</b><span>' + esc(sub || s.role) + '</span>' +
      (s.phone || s.email ? '<div>' + (s.phone ? '<a href="tel:' + s.phone.replace(/\D/g, '') + '">' + s.phone + '</a>' : '') + (s.email ? '<a href="mailto:' + s.email + '">' + s.email + '</a>' : '') + '</div>' : '') +
      '</div></div>';
  }
  function tryoutCta() {
    return '<section class="cta"><img class="cta__bg" src="img/photos/champions.webp" loading="lazy" alt=""><div class="wrap cta__in">' +
      '<p class="kicker">Tryouts and open roster spots</p><h2 class="disp" style="margin-top:14px">Wear the <span class="cream">pinstripes.</span></h2>' +
      '<p>Tell us about your player and a coach from the right age group will reach out about tryouts and any open spots.</p>' +
      '<a class="btn" href="tryouts.html">Tryout interest form ' + I.arrow + '</a></div></section>';
  }

  /* ---------- pages ---------- */
  var P = {};

  P.home = function () {
    var feat = ['kaitlyn-lozano', 'lily-suarez', 'julia-candelario', 'megan-hobdy', 'tiffany-matthews'].map(player);
    var next = upcoming(D.events).slice(0, 3);
    var ages = D.club.ages.replace(' to ', ' to ');
    return '<section class="hero"><img class="hero__img" src="img/photos/huddle.webp" width="1800" height="1200" fetchpriority="high" alt="Empire players and coaches with hands in before a game">' +
      '<div class="wrap hero__in"><img class="hero__crest" src="img/crest.webp" width="900" height="560" alt="Empire Softball">' +
      '<h1 class="disp">Long Island<span class="cream" style="display:block">built.</span></h1>' +
      '<p class="hero__sub">Travel softball for players ' + esc(D.club.ages) + '. Coaches who push players on and off the field and get them ready for the next level.</p>' +
      '<div class="hero__cta"><a class="btn" href="players.html">Meet the players ' + I.arrow + '</a><a class="btn btn--line" href="tryouts.html">Tryouts</a></div></div></section>' +

      '<section class="facts"><div class="wrap facts__in">' +
      '<div class="fact"><b>' + D.teams.length + ' teams</b><span>Black, White and Gold</span></div>' +
      '<div class="fact"><b>' + ages + '</b><span>Every age group</span></div>' +
      '<div class="fact"><b>Aug to Jul</b><span>Fall, winter training, summer</span></div>' +
      '<div class="fact"><b>Tri-state</b><span>And beyond</span></div></div></section>' +

      '<section class="sec"><div class="wrap recruit"><div><p class="kicker">For college coaches</p>' +
      '<h2 class="disp" style="margin-top:14px">Find your next <span class="cream">recruit.</span></h2>' +
      '<p>Every Empire player has her own page: positions, grad year, school, GPA and a link to her recruiting profile. Search by class or position, then see where she plays next.</p>' +
      '<div class="recruit__find"><a class="chip" href="players.html?grad=2027">Class of 2027</a><a class="chip" href="players.html?grad=2028">Class of 2028</a><a class="chip" href="players.html?pos=C">Catchers</a><a class="chip" href="players.html?pos=P">Pitchers</a></div>' +
      '<p style="margin-top:26px"><a class="more" href="players.html">All player profiles ' + I.arrow.replace('<svg', '<svg width="16" height="16"') + '</a></p></div>' +
      '<div class="lineup">' + feat.map(function (p) { return '<a href="player.html?p=' + p.id + '"><img src="' + pphoto(p) + '" loading="lazy" alt="' + esc(p.name) + '"><b>' + esc(p.name.split(' ')[0]) + '<br>' + esc(p.name.split(' ').slice(1).join(' ')) + '<i>' + p.grad + ' / ' + esc(p.pos[0]) + '</i></b></a>'; }).join('') + '</div>' +
      '</div></section>' +

      '<section class="sec sec--band"><div class="wrap"><div class="sec__head"><h2 class="disp">The <span class="outline">teams</span></h2><p>' + D.teams.length + ' teams from 12U to 18U. Pick a team for its roster, coaches and schedule.</p></div>' +
      '<div class="trows">' + D.teams.map(teamRow).join('') + '</div></div></section>' +

      '<section class="sec"><div class="wrap"><div class="sec__head"><h2 class="disp">One year, <span class="cream">three seasons</span></h2><p>The travel season runs from late August to July.</p></div>' +
      '<div class="season">' + D.season.map(function (s) { return '<div class="season__row"><span class="season__n" aria-hidden="true">' + s.n + '</span><div><h3>' + esc(s.name) + '</h3><div class="season__when">' + esc(s.when) + '</div></div><p>' + esc(s.text) + '</p></div>'; }).join('') + '</div></div></section>' +

      '<section class="sec sec--band"><div class="wrap"><div class="sec__head"><h2 class="disp">Where to <span class="outline">watch</span></h2><p>Coming to see a player? Here is where Empire teams play next.</p></div>' +
      '<div class="evs">' + next.map(function (e) { return eventRow(e); }).join('') + '</div>' +
      '<p style="margin-top:26px"><a class="more" href="schedule.html">Full schedule ' + I.arrow.replace('<svg', '<svg width="16" height="16"') + '</a></p></div></section>' +
      tryoutCta();
  };

  P.teams = function () {
    return pageHead('The <span class="outline">teams</span>', D.teams.length + ' teams from 12U to 18U, in Black, White and Gold.', '') +
      '<section class="sec sec--tight"><div class="wrap"><div class="trows">' + D.teams.map(teamRow).join('') + '</div></div></section>' + tryoutCta();
  };

  P.team = function () {
    var t = team(qs.get('t')) || D.teams[1];
    document.title = t.name + ' | Empire Softball';
    var r = roster(t.id);
    var evs = upcoming(D.events.filter(function (e) { return e.teams.indexOf(t.id) > -1; }));
    var staff = t.staff || [{ name: t.coach, role: 'Head Coach' }];
    return pageHead('<span class="cream">' + esc(t.color) + '</span> ' + esc(t.age) + (t.tag ? ' <span class="outline">' + esc(t.tag) + '</span>' : ''), 'Empire ' + esc(t.color) + ' ' + esc(t.age.toLowerCase()) + (t.tag ? ' ' + esc(t.tag) : '') + '. Head coach ' + esc(t.coach) + '.', t.age, ['teams.html', 'All teams']) +
      (t.wide ? '<figure class="tphoto"><img src="' + t.wide + '" alt="' + esc(t.name) + ' team photo"></figure>' : '') +
      '<section class="sec sec--tight"><div class="wrap"><div class="sec__head"><h2 class="disp">Roster</h2>' + (r.length ? '<p>' + r.length + ' players. Tap a player for her full recruiting profile.</p>' : '') + '</div>' +
      (r.length ? '<div class="pls">' + r.map(playerCard).join('') + '</div>' :
        '<div class="empty"><h3>Roster coming soon</h3><p>Player profiles for this team have not been posted yet. Once the coach adds them, each player gets her own page here.</p><a class="btn btn--line" href="team.html?t=white-16u-elite">See a finished roster</a></div>') +
      '</div></section>' +
      '<section class="sec sec--tight sec--band"><div class="wrap"><div class="sec__head"><h2 class="disp">Coaches</h2></div><div class="staff">' + staff.map(function (s) { return staffRow(s); }).join('') + '</div></div></section>' +
      '<section class="sec sec--tight"><div class="wrap"><div class="sec__head"><h2 class="disp">Where to <span class="outline">watch</span></h2><p class="note">Sample dates for this demo.</p></div>' +
      '<div class="evs">' + evs.map(function (e) { return eventRow(e, { noTeams: true }); }).join('') + '</div></div></section>';
  };

  P.players = function () {
    var grads = []; var poss = [];
    D.players.forEach(function (p) { if (grads.indexOf(p.grad) < 0) grads.push(p.grad); p.pos.forEach(function (x) { if (poss.indexOf(x) < 0) poss.push(x); }); });
    grads.sort(); var order = ['P', 'C', '1B', '2B', '3B', 'SS', 'OF'];
    poss.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    function chips(kind, list) { return list.map(function (v) { return '<button type="button" class="chip" data-f="' + kind + '" data-v="' + v + '" aria-pressed="false">' + v + '</button>'; }).join(''); }
    return pageHead('Player <span class="outline">profiles</span>', 'For college coaches. Filter by class or position, then open a player for her school, GPA and recruiting profile.', '') +
      '<section class="sec sec--tight"><div class="wrap">' +
      '<div class="filters"><div class="filters__row"><span class="filters__lab">Class of</span>' + chips('grad', grads) + '</div>' +
      '<div class="filters__row"><span class="filters__lab">Position</span>' + chips('pos', poss) + '</div>' +
      '<div><label class="filters__lab" for="find" style="display:block;margin-bottom:8px">Name or school</label><input class="find" id="find" type="search" placeholder="Search" autocomplete="off"></div></div>' +
      '<div class="count" id="count" aria-live="polite"></div><div class="pls" id="list"></div>' +
      '<p class="note" style="margin-top:30px">Profiles are posted for Empire White 16u Elite so far. Other teams appear here as their coaches add them.</p>' +
      '</div></section>';
  };

  P.player = function () {
    var p = player(qs.get('p')) || D.players[0];
    var t = team(p.team);
    var head = (t.staff || [])[0] || { name: t.coach };
    document.title = p.name + ', ' + p.grad + ' ' + p.pos.join('/') + ' | Empire Softball';
    var evs = upcoming(D.events.filter(function (e) { return e.teams.indexOf(t.id) > -1; })).slice(0, 3);
    var nm = p.name.split(' ');
    return '<div class="wrap"><div class="pp">' +
      '<div class="pp__photo"><img src="' + pphoto(p) + '" width="720" height="900" alt="' + esc(p.name) + '"></div>' +
      '<div><a class="ph__crumb" href="team.html?t=' + t.id + '">' + I.back + esc(t.name) + '</a>' +
      '<h1 class="disp">' + esc(nm[0]) + '<br><span class="cream">' + esc(nm.slice(1).join(' ')) + '</span></h1>' +
      '<dl class="dl">' +
      '<div><dt>Class of</dt><dd>' + p.grad + '</dd></div>' +
      '<div><dt>Position</dt><dd>' + esc(p.pos.join(' / ')) + '</dd></div>' +
      '<div><dt>Bats / Throws</dt><dd class="sm">' + hand(p.bats) + ' / ' + hand(p.throws) + '</dd></div>' +
      '<div><dt>GPA</dt><dd>' + esc(p.gpa) + '</dd></div>' +
      '<div class="full"><dt>High school</dt><dd class="sm">' + esc(p.school) + '</dd></div>' +
      '<div class="full"><dt>Team</dt><dd class="sm">' + esc(t.name) + '</dd></div></dl>' +
      '<div class="pp__act">' +
      (p.fl ? '<a class="btn" href="https://www.fieldlevel.com/app/profile/' + p.fl + '/softball" target="_blank" rel="noopener">FieldLevel profile ' + I.arrow + '</a>' : '') +
      '<button class="btn btn--line" type="button" id="copy">Copy link to this page</button></div>' +

      '<div class="pp__sub"><h2>Skills video</h2><div class="slot">' + I.play + '<span>No video posted yet. A YouTube or Hudl link added by the family or coach plays right here.</span></div></div>' +
      '<div class="pp__sub"><h2>Talk to her coach</h2><div class="staff" style="grid-template-columns:1fr">' + staffRow(head, 'Head Coach, ' + t.name) + '</div></div>' +
      '<div class="pp__sub"><h2>See her play</h2><p class="note" style="margin:6px 0 12px">Sample dates for this demo.</p><div class="evs">' + evs.map(function (e) { return eventRow(e, { noTeams: true }); }).join('') + '</div></div>' +
      '</div></div></div>';
  };

  P.schedule = function () {
    var opts = '<option value="">All teams</option>' + D.teams.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('');
    return pageHead('Where to <span class="outline">watch</span>', 'Every tournament and showcase, by team. College coaches: showcase weekends are marked.', '') +
      '<section class="sec sec--tight"><div class="wrap">' +
      '<div class="fld" style="max-width:340px;margin-bottom:26px"><label for="tf">Show</label><select id="tf">' + opts + '</select></div>' +
      '<p class="note" style="margin-bottom:26px">These are sample dates to show how the page works. The real slate goes in from the coach page.</p>' +
      '<div id="sched"></div></div></section>';
  };

  P.photos = function () {
    return pageHead('Photos', '', '') + '<section class="sec sec--tight"><div class="wrap"><div class="gal">' +
      D.photos.map(function (ph, i) { return '<button type="button" data-i="' + i + '" aria-label="Open photo: ' + esc(ph.cap) + '"><img src="' + ph.src + '" width="' + ph.w + '" height="' + ph.h + '" decoding="async" alt="' + esc(ph.cap) + '"><span>' + esc(ph.cap) + '</span></button>'; }).join('') +
      '</div></div></section>' +
      '<dialog class="lb" id="lb"><div class="lb__in"><div class="lb__bar"><span id="lbCap" class="kicker"></span><button type="button" id="lbX">CLOSE</button></div><div class="lb__mid"><img id="lbImg" alt=""></div><div class="lb__nav"><button type="button" id="lbP">PREV</button><button type="button" id="lbN">NEXT</button></div></div></dialog>';
  };

  P.about = function () {
    var seen = {}; var coaches = [];
    D.teams.forEach(function (t) {
      (t.staff || [{ name: t.coach, role: 'Head Coach' }]).forEach(function (s) {
        if (!seen[s.name]) { seen[s.name] = { s: s, teams: [] }; coaches.push(seen[s.name]); }
        seen[s.name].teams.push((s.role === 'Head Coach' ? '' : 'Assistant, ') + t.name.replace('Empire ', ''));
      });
      if (t.staff && !seen[t.coach]) { /* head coach already inside staff */ }
    });
    return pageHead('About <span class="outline">Empire</span>', '', '') +
      '<section class="sec"><div class="wrap split"><div class="prose"><p class="lead">' + esc(D.club.mission) + '</p>' + D.club.about.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>' +
      '<figure class="frame"><img src="img/photos/gold12-team.webp" loading="lazy" alt="Empire Gold 12u team photo"></figure></div></section>' +
      '<section class="sec sec--band"><div class="wrap"><div class="sec__head"><h2 class="disp">One year, <span class="cream">three seasons</span></h2></div>' +
      '<div class="season">' + D.season.map(function (s) { return '<div class="season__row"><span class="season__n" aria-hidden="true">' + s.n + '</span><div><h3>' + esc(s.name) + '</h3><div class="season__when">' + esc(s.when) + '</div></div><p>' + esc(s.text) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="sec"><div class="wrap"><div class="sec__head"><h2 class="disp">Coaching <span class="outline">staff</span></h2></div><div class="staff">' +
      coaches.map(function (c) { return staffRow({ name: c.s.name, photo: c.s.photo }, c.teams.join(' and ')); }).join('') + '</div></div></section>' + tryoutCta();
  };

  function field(id, label, type, extra) { return '<div class="fld"><label for="' + id + '">' + label + '</label><input id="' + id + '" name="' + id + '" type="' + (type || 'text') + '" ' + (extra || '') + '></div>'; }
  P.tryouts = function () {
    var ages = []; D.teams.forEach(function (t) { if (ages.indexOf(t.age) < 0) ages.push(t.age); });
    return pageHead('Try<span class="outline">outs</span>', 'Tell us about your player. A coach from the right age group will reach out about tryout dates and open roster spots.', '') +
      '<section class="sec sec--tight"><div class="wrap split split--rev"><figure class="frame"><img src="img/photos/gold14-team.webp" loading="lazy" alt="Empire Gold 14u team photo"></figure>' +
      '<form class="form" id="form" novalidate><div class="two">' + field('pn', 'Player name', 'text', 'required autocomplete="off"') +
      '<div class="fld"><label for="ag">Age group</label><select id="ag" name="ag">' + ages.reverse().map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="two">' + field('gy', 'Grad year', 'text', 'inputmode="numeric" placeholder="2029"') + field('po', 'Positions', 'text', 'placeholder="SS, OF"') + '</div>' +
      field('ct', 'Current team (if any)') +
      '<div class="two">' + field('pa', 'Parent or guardian name', 'text', 'required autocomplete="name"') + field('em', 'Parent email', 'email', 'required autocomplete="email"') + '</div>' +
      field('ph', 'Parent phone', 'tel', 'autocomplete="tel"') +
      '<div class="fld"><label for="ms">Anything we should know</label><textarea id="ms" name="ms"></textarea></div>' +
      '<div><button class="btn" type="submit">Send to the coaches ' + I.arrow + '</button></div>' +
      '<div class="form__ok" id="ok" role="status">This is a sample site, so nothing was sent. On the live site this goes straight to the coach for that age group.</div></form></div></section>';
  };
  P.contact = function () {
    return pageHead('Contact', 'Questions about a team, a player or tryouts.', '') +
      '<section class="sec sec--tight"><div class="wrap split"><form class="form" id="form" novalidate><div class="two">' + field('nm', 'Name', 'text', 'required autocomplete="name"') + field('em', 'Email', 'email', 'required autocomplete="email"') + '</div>' +
      '<div class="fld"><label for="ab">About</label><select id="ab"><option>General question</option><option>I am a college coach</option><option>Tryouts</option><option>Sponsorship</option></select></div>' +
      '<div class="fld"><label for="ms">Message</label><textarea id="ms" name="ms" required></textarea></div>' +
      '<div><button class="btn" type="submit">Send message ' + I.arrow + '</button></div>' +
      '<div class="form__ok" id="ok" role="status">This is a sample site, so nothing was sent. On the live site this goes to the club inbox.</div></form>' +
      '<div><p class="kicker">Follow the teams</p><p style="margin:14px 0 26px"><a class="more" href="' + D.club.instagram + '" target="_blank" rel="noopener">Instagram</a> &nbsp; &nbsp; <a class="more" href="' + D.club.facebook + '" target="_blank" rel="noopener">Facebook</a></p>' +
      '<p class="kicker">College coaches</p><p class="mute" style="margin-top:12px;max-width:420px">Each team page lists its head coach. Open a player profile to reach the right coach directly.</p>' +
      '<p style="margin-top:18px"><a class="btn btn--line" href="players.html">Player profiles</a></p></div></div></section>';
  };

  /* ---------- render ---------- */
  app.innerHTML = header() + '<main id="main">' + (P[page] || P.home)() + '</main>' + footer();

  /* menu */
  var sheet = document.getElementById('sheet');
  document.getElementById('menuOpen').addEventListener('click', function () { sheet.classList.add('open'); document.documentElement.style.overflow = 'hidden'; document.getElementById('menuClose').focus(); });
  function closeMenu() { sheet.classList.remove('open'); document.documentElement.style.overflow = ''; }
  document.getElementById('menuClose').addEventListener('click', closeMenu);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  /* add to calendar */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-ics]'); if (!b) return;
    var e = D.events.filter(function (x) { return x.id === b.dataset.ics; })[0]; if (!e) return;
    var s = e.start.replace(/-/g, ''); var en = ymd(e.end); var d = new Date(en.y, en.m, en.d + 1);
    var endX = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Empire Softball//EN', 'BEGIN:VEVENT', 'UID:' + e.id + '@empiresoftball', 'DTSTAMP:' + s + 'T000000Z',
      'DTSTART;VALUE=DATE:' + s, 'DTEND;VALUE=DATE:' + endX, 'SUMMARY:Empire Softball: ' + e.name, 'LOCATION:' + e.place + '\\, ' + e.city.replace(',', '\\,'), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'empire-' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
  });

  if (page === 'players') {
    var state = { grad: qs.get('grad') || '', pos: qs.get('pos') || '', q: '' };
    var list = document.getElementById('list'), count = document.getElementById('count');
    var draw = function () {
      var q = state.q.toLowerCase();
      var out = D.players.filter(function (p) {
        return (!state.grad || String(p.grad) === state.grad) && (!state.pos || p.pos.indexOf(state.pos) > -1) && (!q || (p.name + ' ' + p.school).toLowerCase().indexOf(q) > -1);
      });
      list.innerHTML = out.map(playerCard).join('');
      count.innerHTML = '<b>' + out.length + '</b> ' + (out.length === 1 ? 'player' : 'players') + (state.grad ? ', class of ' + state.grad : '') + (state.pos ? ', ' + state.pos : '') + (out.length ? '' : '. Try clearing a filter.');
      [].forEach.call(document.querySelectorAll('.chip[data-f]'), function (c) { c.setAttribute('aria-pressed', String(state[c.dataset.f] === c.dataset.v)); });
    };
    document.querySelector('.filters').addEventListener('click', function (e) { var c = e.target.closest('.chip[data-f]'); if (!c) return; state[c.dataset.f] = state[c.dataset.f] === c.dataset.v ? '' : c.dataset.v; draw(); });
    document.getElementById('find').addEventListener('input', function (e) { state.q = e.target.value; draw(); });
    draw();
  }

  if (page === 'schedule') {
    var sel = document.getElementById('tf'), box = document.getElementById('sched');
    if (qs.get('t')) sel.value = qs.get('t');
    var drawS = function () {
      var evs = upcoming(D.events.filter(function (e) { return !sel.value || e.teams.indexOf(sel.value) > -1; }));
      var html = '', last = '';
      evs.forEach(function (e) { var a = ymd(e.start), k = MONTH[a.m] + ' ' + a.y; if (k !== last) { html += (last ? '</div>' : '') + '<h2 class="month">' + k + '</h2><div class="evs">'; last = k; } html += eventRow(e); });
      box.innerHTML = html ? html + '</div>' : '<p class="mute">Nothing on the schedule for this team yet.</p>';
    };
    sel.addEventListener('change', drawS); drawS();
  }

  if (page === 'photos') {
    var lb = document.getElementById('lb'), cur = 0;
    var show = function (i) { cur = (i + D.photos.length) % D.photos.length; var ph = D.photos[cur]; document.getElementById('lbImg').src = ph.src; document.getElementById('lbImg').alt = ph.cap; document.getElementById('lbCap').textContent = ph.cap; };
    document.querySelector('.gal').addEventListener('click', function (e) { var b = e.target.closest('button[data-i]'); if (!b) return; show(+b.dataset.i); lb.showModal(); });
    document.getElementById('lbX').addEventListener('click', function () { lb.close(); });
    document.getElementById('lbP').addEventListener('click', function () { show(cur - 1); });
    document.getElementById('lbN').addEventListener('click', function () { show(cur + 1); });
    lb.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') show(cur - 1); if (e.key === 'ArrowRight') show(cur + 1); });
  }

  var copy = document.getElementById('copy');
  if (copy) copy.addEventListener('click', function () {
    var done = function () { copy.textContent = 'Link copied'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).then(done, done);
    else { var t = document.createElement('input'); t.value = location.href; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) { } t.remove(); done(); }
  });

  var form = document.getElementById('form');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var bad = [].filter.call(form.querySelectorAll('[required]'), function (f) { return !f.value.trim() || (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(f.value)); });
    [].forEach.call(form.querySelectorAll('input,textarea'), function (f) { f.style.borderColor = ''; });
    if (bad.length) { bad.forEach(function (f) { f.style.borderColor = '#e2725b'; }); bad[0].focus(); return; }
    document.getElementById('ok').classList.add('on');
  });
})();
