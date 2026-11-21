/* Empire Softball sample: one script renders every page from js/data.js. No framework, no timers, nothing loops. */
(function () {
  'use strict';
  var D = window.EMPIRE, C = window.EmpireCards;
  var page = document.body.dataset.page;
  var app = document.getElementById('app');
  var qs = new URLSearchParams(location.search);

  /* storage that still works when the browser blocks it */
  var mem = {};
  function sget(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : mem[k]; } catch (e) { return mem[k]; } }
  function sset(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function team(id) { return D.teams.filter(function (t) { return t.id === id; })[0]; }
  /* a player = what the club posted, plus anything the family changed in the profile builder on this device */
  function player(id) {
    var b = D.players.filter(function (p) { return p.id === id; })[0]; if (!b) return null;
    var o = (sget('emp_ov') || {})[id]; if (!o) return b;
    var p = Object.assign({}, b, o); p.m = Object.assign({}, b.m, o.m || {}); p.sampleM = false; p.edited = true; return p;
  }
  function players() { return D.players.map(function (p) { return player(p.id); }); }
  function roster(tid) { return players().filter(function (p) { return p.team === tid; }); }
  function pphoto(p) { return p.photo || 'img/players/' + p.id + '.webp'; }
  function hand(c) { return c === 'L' ? 'Left' : c === 'S' ? 'Switch' : 'Right'; }
  function purl(p) { return location.origin + location.pathname.replace(/[^/]*$/, '') + 'player.html?p=' + p.id; }
  function ytId(u) { var m = String(u || '').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/); return m ? m[1] : ''; }
  function shortlist() { return sget('emp_list') || []; }

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function ymd(s) { var a = s.split('-'); return { y: +a[0], m: +a[1] - 1, d: +a[2] }; }
  function todayKey() { var n = new Date(); return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2); }
  function upcoming(list) {
    var t = todayKey(); var up = list.filter(function (e) { return e.end >= t; });
    return (up.length ? up : list).slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  }

  var I = {
    arrow: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7"/></svg>',
    back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="M20 12H5M11 5l-7 7 7 7"/></svg>',
    play: '<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l12 7-12 7z" fill="currentColor"/></svg>',
    star: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.4 6.4 20.4l1.1-6.3L3 9.7l6.2-.9z"/></svg>'
  };
  var SKY = 'M0 70V52h34V40h22v12h30V30h18v-8h10v8h16v22h40V44h26V34h30v18h28V24h14V12h8V4h4v8h8v12h14v28h36V38h24v14h30V46h22V26h30v20h26V16h10V0h6v16h10v30h34V36h28v16h30V28h20v-8h12v8h20v24h32V42h26v10h30V32h36v20h28V44h30V22h14v-8h8v8h14v30h34V38h30v14h26V48h40v22z';
  function sky(cls) { return '<svg class="sky ' + (cls || '') + '" viewBox="0 0 1200 70" preserveAspectRatio="none" aria-hidden="true"><path fill="currentColor" d="' + SKY + '"/></svg>'; }

  var NAV = [
    ['index.html', 'Home', 'home'], ['teams.html', 'Teams', 'teams'], ['players.html', 'Players', 'players'],
    ['schedule.html', 'Where to watch', 'schedule'], ['photos.html', 'Photos', 'photos'], ['about.html', 'About', 'about'], ['contact.html', 'Contact', 'contact']
  ];
  var here = { team: 'teams', player: 'players', cards: 'teams', builder: 'builder' }[page] || page;

  function header() {
    var links = NAV.slice(1).map(function (n) { return '<a href="' + n[0] + '"' + (n[2] === here ? ' aria-current="page"' : '') + '>' + n[1] + '</a>'; }).join('');
    var sheet = NAV.concat([['tryouts.html', 'Tryouts', 'tryouts'], ['my-profile.html', 'Player sign in', 'builder']]).map(function (n, i) {
      return '<a class="sheet__link" href="' + n[0] + '"' + (n[2] === here ? ' aria-current="page"' : '') + '><span>' + ('0' + (i + 1)).slice(-2) + '</span>' + n[1] + '</a>';
    }).join('');
    return '<a class="skip" href="#main">Skip to content</a>' +
      '<a class="bar" href="tryouts.html">Tryout interest is open for every age group ' + I.arrow + '</a>' +
      '<header class="top"><div class="wrap top__in">' +
      '<a class="top__logo" href="index.html" aria-label="Empire Softball home"><img src="img/crest-sm.webp" width="320" height="199" alt="Empire Softball"></a>' +
      '<nav class="nav" aria-label="Main">' + links + '</nav>' +
      '<div class="top__act"><a class="top__sign" href="my-profile.html">Player sign in</a><a class="btn btn--sm" href="tryouts.html">Tryouts</a>' +
      '<button class="menu-btn" id="menuOpen" aria-haspopup="dialog" aria-controls="sheet">Menu</button></div>' +
      '</div></header>' +
      '<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="Menu"><div class="sheet__top"><img src="img/crest-sm.webp" width="320" height="199" alt="">' +
      '<button class="menu-btn" id="menuClose">Close</button></div><div class="sheet__links">' + sheet + '</div>' +
      '<div class="sheet__soc"><a href="' + D.club.instagram + '" target="_blank" rel="noopener">Instagram</a><a href="' + D.club.facebook + '" target="_blank" rel="noopener">Facebook</a></div></div>';
  }

  function footer() {
    return '<footer class="foot">' + sky('foot__sky') + '<div class="foot__body"><div class="wrap foot__in">' +
      '<div class="foot__brand"><span class="foot__wm">Empire</span><span class="foot__wm foot__wm--b">Softball</span><p>' + esc(D.club.region) + '. Travel softball, ' + esc(D.club.ages) + '.</p></div>' +
      '<div class="foot__col"><b>The club</b>' + NAV.slice(1, 4).concat([['photos.html', 'Photos'], ['about.html', 'About']]).map(function (n) { return '<a href="' + n[0] + '">' + n[1] + '</a>'; }).join('') + '</div>' +
      '<div class="foot__col"><b>Players</b><a href="tryouts.html">Tryouts</a><a href="my-profile.html">Build my profile</a><a href="cards.html?t=white-16u-elite">Team card set</a><a href="contact.html">Contact</a></div>' +
      '<div class="foot__col"><b>Follow</b><a href="' + D.club.instagram + '" target="_blank" rel="noopener">Instagram</a><a href="' + D.club.facebook + '" target="_blank" rel="noopener">Facebook</a></div>' +
      '</div><div class="wrap foot__fine"><span>Empire Softball</span><span>Sample site by Main Line Web Design</span></div></div></footer>';
  }

  function pageHead(title, sub, crumb, extra) {
    return '<section class="ph"><div class="wrap">' +
      (crumb ? '<a class="crumb" href="' + crumb[0] + '">' + I.back + esc(crumb[1]) + '</a>' : '') +
      '<h1 class="disp">' + title + '</h1>' + (sub ? '<p class="ph__sub">' + sub + '</p>' : '') + (extra || '') + '</div></section>';
  }
  function sample(t) { return '<span class="smp">' + (t || 'Sample') + '</span>'; }

  /* ---------- shared pieces ---------- */
  function teamRow(t) {
    var n = roster(t.id).length;
    return '<a class="trow" href="team.html?t=' + t.id + '" aria-label="' + esc(t.name) + '">' +
      '<span class="trow__age" aria-hidden="true">' + t.age.replace('U', '') + '<i>U</i></span>' +
      '<span class="trow__txt"><span class="trow__name"><i class="sw sw--' + t.color + '" aria-hidden="true"></i>' + esc(t.color) + (t.tag ? ' <span class="tag">' + esc(t.tag) + '</span>' : '') + '</span>' +
      '<span class="trow__coach">Coach ' + esc(t.coach) + (n ? ' <b>' + n + ' profiles</b>' : '') + '</span></span>' +
      (t.photo ? '<span class="trow__pic"><img src="' + t.photo + '" loading="lazy" alt=""></span>' : '') +
      '<span class="trow__go">' + I.arrow + '</span></a>';
  }
  function starBtn(p) {
    var on = shortlist().indexOf(p.id) > -1;
    return '<button type="button" class="star" data-star="' + p.id + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Remove ' : 'Save ') + esc(p.name) + (on ? ' from my list' : ' to my list') + '">' + I.star + '</button>';
  }
  function playerCard(p) {
    return '<div class="pc"><a class="pc__link" href="player.html?p=' + p.id + '">' +
      '<span class="pc__pic"><img src="' + pphoto(p) + '" width="720" height="900" loading="lazy" alt="' + esc(p.name) + '"><span class="pc__yr">' + p.grad + '</span></span>' +
      '<span class="pc__txt"><span class="pc__name">' + esc(p.name) + '</span>' +
      '<span class="pc__meta"><b>' + esc(p.pos.join(' / ')) + '</b>' + (p.hideGpa ? '' : '<i>' + esc(p.gpa) + ' GPA</i>') + '</span><span class="pc__sch">' + esc(p.school) + '</span></span></a>' + starBtn(p) + '</div>';
  }
  function eventRow(e, opts) {
    opts = opts || {};
    var a = ymd(e.start), b = ymd(e.end);
    var teams = opts.noTeams ? '' : '<div class="ev__teams">' + e.teams.map(function (id) { var t = team(id); return '<a href="team.html?t=' + id + '"><i class="sw sw--' + t.color + '"></i>' + esc(t.name.replace('Empire ', '')) + '</a>'; }).join('') + '</div>';
    return '<div class="ev' + (e.showcase ? ' ev--show' : '') + '"><div class="ev__date"><i>' + MON[a.m] + '</i><b>' + a.d + '</b><small>' + (e.start === e.end ? a.y : 'to ' + (b.m === a.m ? '' : MON[b.m] + ' ') + b.d) + '</small></div>' +
      '<div class="ev__body"><h3>' + esc(e.name) + (e.showcase ? ' <span class="tag tag--ink">College showcase</span>' : '') + '</h3>' +
      '<div class="ev__place">' + esc(e.place) + ', ' + esc(e.city) + '</div>' + teams +
      '<div class="ev__act"><button type="button" data-ics="' + e.id + '">Add to my calendar</button>' +
      '<a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.place + ' ' + e.city) + '" target="_blank" rel="noopener">Directions</a></div></div></div>';
  }
  function staffRow(s, sub) {
    var ini = s.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2);
    return '<div class="st">' + (s.photo ? '<img src="' + s.photo + '" loading="lazy" alt="' + esc(s.name) + '">' : '<span class="st__ph" aria-hidden="true">' + ini + '</span>') +
      '<div><b>' + esc(s.name) + '</b><span>' + esc(sub || s.role) + '</span>' +
      (s.phone || s.email ? '<div class="st__c">' + (s.phone ? '<a href="tel:' + s.phone.replace(/\D/g, '') + '">' + s.phone + '</a>' : '') + (s.email ? '<a href="mailto:' + s.email + '">' + s.email + '</a>' : '') + '</div>' : '') +
      '</div></div>';
  }
  function seasonRows() {
    return '<div class="season">' + D.season.map(function (s) { return '<div class="season__row"><span class="season__n" aria-hidden="true">' + s.n + '</span><div><h3>' + esc(s.name) + '</h3><div class="season__when">' + esc(s.when) + '</div></div><p>' + esc(s.text) + '</p></div>'; }).join('') + '</div>';
  }
  function tryoutCta() {
    return '<section class="cta"><div class="wrap cta__in"><div><p class="kicker">Tryouts and open roster spots</p><h2 class="disp">Wear the <span class="wm">pinstripes.</span></h2>' +
      '<p>Tell us about your player and a coach from the right age group will reach out about tryouts and any open spots.</p>' +
      '<a class="btn btn--ink" href="tryouts.html">Tryout interest form ' + I.arrow + '</a></div>' +
      '<figure class="cta__pic"><img src="img/photos/champions.webp" loading="lazy" alt="Empire players holding a championship banner"></figure></div></section>';
  }
  function field(id, label, type, extra, val) { return '<div class="fld"><label for="' + id + '">' + label + '</label><input id="' + id + '" name="' + id + '" type="' + (type || 'text') + '" ' + (extra || '') + (val != null ? ' value="' + esc(val) + '"' : '') + '></div>'; }
  function cardStats(p) {
    var third = !p.sampleM && p.m.ev ? [p.m.ev + ' mph', 'Exit velo'] : [p.pos[0], 'Position'];
    return [[p.bats + ' / ' + p.throws, 'Bats / Throws'], p.hideGpa ? [p.m.ht && !p.sampleM ? p.m.ht : p.grad, p.m.ht && !p.sampleM ? 'Height' : 'Class'] : [p.gpa, 'GPA'], third];
  }
  function cardOpts(p, style, scale) {
    var t = team(p.team);
    return { player: { name: p.name, grad: p.grad, pos: p.pos, team: t.name, school: p.school, photo: pphoto(p), num: p.num }, style: style || p.cardStyle || 'pin', stats: cardStats(p), url: purl(p), scale: scale || 1 };
  }
  function styleChips(cur) {
    return '<div class="chips" id="styles" role="group" aria-label="Card style">' + Object.keys(C.STYLES).map(function (k) { return '<button type="button" class="chip" data-style="' + k + '" aria-pressed="' + (k === cur) + '">' + C.STYLES[k].name + '</button>'; }).join('') + '</div>';
  }

  /* ---------- pages ---------- */
  var P = {};

  P.home = function () {
    var feat = ['kaitlyn-lozano', 'lily-suarez', 'julia-candelario', 'megan-hobdy', 'tiffany-matthews'].map(player);
    var next = upcoming(D.events).slice(0, 3);
    return '<section class="hero"><div class="wrap hero__in"><div class="hero__txt">' +
      '<p class="kicker">' + esc(D.club.region) + ' / ' + esc(D.club.ages) + '</p>' +
      '<h1 class="disp">Long Island <span class="wm">built.</span></h1>' +
      '<p class="hero__sub">Travel softball with coaches who push players on and off the field and get them ready for the next level.</p>' +
      '<div class="hero__cta"><a class="btn btn--ink" href="players.html">Meet the players ' + I.arrow + '</a><a class="btn" href="tryouts.html">Tryouts</a></div></div>' +
      '<figure class="hero__pic"><img src="img/photos/huddle.webp" width="1800" height="1200" fetchpriority="high" alt="Empire players and coaches with hands in before a game"><figcaption>Hands in before first pitch</figcaption></figure>' +
      '</div>' + sky('hero__sky') + '</section>' +

      '<section class="facts"><div class="wrap facts__in">' +
      '<div class="fact"><b>' + D.teams.length + '</b><span>Teams in Black, White and Gold</span></div>' +
      '<div class="fact"><b>12U<i>to</i>18U</b><span>Every age group</span></div>' +
      '<div class="fact"><b>' + D.players.length + '</b><span>Recruiting profiles posted</span></div>' +
      '<div class="fact"><b>3</b><span>Seasons a year, August to July</span></div></div></section>' +

      '<section class="sec"><div class="wrap recruit"><div><p class="kicker">For college coaches</p>' +
      '<h2 class="disp">Find your next <span class="wm">recruit.</span></h2>' +
      '<p class="lead">Every Empire player has a full recruiting page right here: measurables, academics, video, her coach and where she plays next. Save the ones you like to your own list.</p>' +
      '<div class="chips"><a class="chip" href="players.html?grad=2027">Class of 2027</a><a class="chip" href="players.html?grad=2028">Class of 2028</a><a class="chip" href="players.html?pos=C">Catchers</a><a class="chip" href="players.html?pos=P">Pitchers</a><a class="chip" href="players.html?gpa=3.8">3.8 GPA and up</a></div>' +
      '<p class="mt"><a class="more" href="players.html">All player profiles ' + I.arrow + '</a></p></div>' +
      '<ol class="lineup" aria-label="Featured players">' + feat.map(function (p, i) { return '<li><a href="player.html?p=' + p.id + '"><span class="lineup__n">' + (i + 1) + '</span><img src="' + pphoto(p) + '" loading="lazy" alt=""><span class="lineup__name">' + esc(p.name) + '<i>' + esc(p.school) + '</i></span><span class="lineup__pos">' + esc(p.pos[0]) + '<i>' + p.grad + '</i></span></a></li>'; }).join('') + '</ol>' +
      '</div></section>' +

      '<section class="sec sec--gold"><div class="wrap"><div class="sec__head"><h2 class="disp">The teams</h2><p>' + D.teams.length + ' teams from 12U to 18U. Pick one for its roster, coaches and schedule.</p></div>' +
      '<div class="trows">' + D.teams.map(teamRow).join('') + '</div></div></section>' +

      '<section class="sec sec--ink promo"><div class="wrap promo__in"><div><p class="kicker">For players and families</p>' +
      '<h2 class="disp">Your page. <span class="wm wm--onink">Your card.</span></h2>' +
      '<p class="lead">Each player builds her own profile with her numbers, grades and video, then makes a player card to post or print. The code on the card opens her page, so a college coach can scan it at the field.</p>' +
      '<div class="hero__cta"><a class="btn btn--gold" href="my-profile.html?p=kaitlyn-lozano">Try the profile builder ' + I.arrow + '</a><a class="btn btn--line" href="cards.html?t=white-16u-elite">See a team card set</a></div></div>' +
      '<div class="fan" id="fan" aria-label="Three sample player cards"></div></div></section>' +

      '<section class="sec"><div class="wrap"><div class="sec__head"><h2 class="disp">One year, three seasons</h2><p>The travel season runs from late August to July.</p></div>' + seasonRows() + '</div></section>' +

      '<section class="sec sec--soft"><div class="wrap"><div class="sec__head"><h2 class="disp">Where to watch</h2><p>Coming to see a player? Here is where Empire teams play next. ' + sample('Sample dates') + '</p></div>' +
      '<div class="evs">' + next.map(function (e) { return eventRow(e); }).join('') + '</div>' +
      '<p class="mt"><a class="more" href="schedule.html">Full schedule ' + I.arrow + '</a></p></div></section>' +
      tryoutCta();
  };

  P.teams = function () {
    return pageHead('The teams', D.teams.length + ' teams from 12U to 18U, in Black, White and Gold.') +
      '<section class="sec sec--tight"><div class="wrap"><div class="trows">' + D.teams.map(teamRow).join('') + '</div></div></section>' + tryoutCta();
  };

  P.team = function () {
    var t = team(qs.get('t')) || D.teams[1];
    document.title = t.name + ' | Empire Softball';
    var r = roster(t.id);
    var evs = upcoming(D.events.filter(function (e) { return e.teams.indexOf(t.id) > -1; }));
    var staff = t.staff || [{ name: t.coach, role: 'Head Coach' }];
    return pageHead(esc(t.color) + ' <span class="wm">' + esc(t.age) + '</span>' + (t.tag ? ' ' + esc(t.tag) : ''), 'Head coach ' + esc(t.coach) + '.', ['teams.html', 'All teams'],
      r.length ? '<div class="ph__act noprint"><a class="btn btn--sm" href="#sheet-roster">Roster sheet</a><a class="btn btn--sm" href="cards.html?t=' + t.id + '">Team card set</a><a class="btn btn--sm" href="schedule.html?t=' + t.id + '">Schedule</a></div>' : '') +
      (t.wide ? '<div class="wrap"><figure class="tphoto"><img src="' + t.wide + '" alt="' + esc(t.name) + ' team photo"></figure></div>' : '') +
      '<section class="sec sec--tight"><div class="wrap"><div class="sec__head"><h2 class="disp">Roster</h2>' + (r.length ? '<p>' + r.length + ' players. Open a player for her full recruiting page.</p>' : '') + '</div>' +
      (r.length ? '<div class="pcs noprint">' + r.map(playerCard).join('') + '</div>' +
        '<div class="sheetbox" id="sheet-roster"><div class="sheetbox__top"><h3>Roster sheet for coaches</h3><button type="button" class="btn btn--sm noprint" data-print>Print this sheet</button></div>' +
        '<div class="tblwrap"><table class="tbl"><thead><tr><th>Player</th><th>Class</th><th>Pos</th><th>B/T</th><th>GPA</th><th>High school</th></tr></thead><tbody>' +
        r.map(function (p) { return '<tr><td><a href="player.html?p=' + p.id + '">' + esc(p.name) + '</a></td><td>' + p.grad + '</td><td>' + esc(p.pos.join(', ')) + '</td><td>' + p.bats + '/' + p.throws + '</td><td>' + (p.hideGpa ? '' : esc(p.gpa)) + '</td><td>' + esc(p.school) + '</td></tr>'; }).join('') +
        '</tbody></table></div></div>' :
        '<div class="empty"><h3>Roster coming soon</h3><p>Player profiles for this team have not been posted yet. Once the coach adds them, each player gets her own page here.</p><a class="btn" href="team.html?t=white-16u-elite">See a finished roster</a></div>') +
      '</div></section>' +
      '<section class="sec sec--tight sec--soft"><div class="wrap"><div class="sec__head"><h2 class="disp">Coaches</h2></div><div class="staff">' + staff.map(function (s) { return staffRow(s); }).join('') + '</div></div></section>' +
      '<section class="sec sec--tight noprint"><div class="wrap"><div class="sec__head"><h2 class="disp">Where to watch</h2><p>' + sample('Sample dates') + '</p></div>' +
      '<div class="evs">' + evs.map(function (e) { return eventRow(e, { noTeams: true }); }).join('') + '</div></div></section>';
  };

  P.players = function () {
    var grads = []; var poss = [];
    D.players.forEach(function (p) { if (grads.indexOf(p.grad) < 0) grads.push(p.grad); p.pos.forEach(function (x) { if (poss.indexOf(x) < 0) poss.push(x); }); });
    grads.sort(); var order = ['P', 'C', '1B', '2B', '3B', 'SS', 'OF'];
    poss.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    function chips(kind, list, lab) { return list.map(function (v) { return '<button type="button" class="chip" data-f="' + kind + '" data-v="' + v + '" aria-pressed="false">' + (lab ? lab(v) : v) + '</button>'; }).join(''); }
    return pageHead('Player <span class="wm">profiles</span>', 'For college coaches. Filter the list, open a player for her full recruiting page, and star the ones you want to keep.') +
      '<section class="sec sec--tight"><div class="wrap">' +
      '<div class="filters"><div class="filters__row"><span class="filters__lab">Class of</span>' + chips('grad', grads) + '</div>' +
      '<div class="filters__row"><span class="filters__lab">Position</span>' + chips('pos', poss) + '</div>' +
      '<div class="filters__row"><span class="filters__lab">GPA</span>' + chips('gpa', ['3.5', '3.8', '4.0'], function (v) { return v + ' and up'; }) + '</div>' +
      '<div class="filters__row filters__row--in"><div class="fld"><label for="find">Name or school</label><input id="find" type="search" placeholder="Search" autocomplete="off"></div>' +
      '<div class="fld"><label for="sort">Sort by</label><select id="sort"><option value="name">Name</option><option value="grad">Class</option><option value="gpa">GPA, high to low</option></select></div></div></div>' +
      '<div class="listbar"><div class="count" id="count" aria-live="polite"></div>' +
      '<button type="button" class="chip chip--star" data-f="mine" data-v="1" aria-pressed="false">' + I.star + ' My list <b id="mineN">0</b></button></div>' +
      '<div class="mine" id="mine" hidden><span>Your list is saved on this device.</span><a class="btn btn--sm" id="mineMail" href="#">Email my list to myself</a><button type="button" class="btn btn--sm" data-print>Print my list</button></div>' +
      '<div class="pcs" id="list"></div>' +
      '<p class="note">Profiles are posted for Empire White 16u Elite so far. Other teams appear here as their coaches add them.</p>' +
      '</div></section>';
  };

  var MEAS = [['ht', 'Height', ''], ['ev', 'Exit velo', 'mph'], ['ov', 'Overhand velo', 'mph'], ['h1', 'Home to first', 'sec'], ['pop', 'Pop time', 'sec'], ['pv', 'Pitch velo', 'mph']];

  P.player = function () {
    var p = player(qs.get('p')) || player(D.players[0].id);
    var t = team(p.team);
    var head = (t.staff || [])[0] || { name: t.coach };
    document.title = p.name + ', ' + p.grad + ' ' + p.pos.join('/') + ' | Empire Softball';
    var evs = upcoming(D.events.filter(function (e) { return e.teams.indexOf(t.id) > -1; })).slice(0, 3);
    var nm = p.name.split(' ');
    var meas = MEAS.filter(function (m) { return p.m[m[0]]; });
    var vids = (p.vid || []).map(ytId).filter(Boolean);
    return '<section class="pp"><div class="wrap pp__in">' +
      '<div class="pp__photo"><img src="' + pphoto(p) + '" width="720" height="900" alt="' + esc(p.name) + '">' + (p.num ? '<span class="pp__num">' + esc(p.num) + '</span>' : '') + '</div>' +
      '<div class="pp__head"><a class="crumb" href="team.html?t=' + t.id + '">' + I.back + esc(t.name) + '</a>' +
      '<h1 class="disp">' + esc(nm[0]) + ' <span class="wm">' + esc(nm.slice(1).join(' ')) + '</span></h1>' +
      '<div class="pp__tags"><span class="tag tag--ink">Class of ' + p.grad + '</span><span class="tag">' + esc(p.pos.join(' / ')) + '</span>' + (p.commit ? '<span class="tag tag--gold">' + esc(p.commit) + '</span>' : '') + '</div>' +
      (p.about ? '<p class="pp__about">' + esc(p.about) + '</p>' : '') +
      '<dl class="dl">' +
      '<div><dt>Bats / Throws</dt><dd>' + hand(p.bats) + ' / ' + hand(p.throws) + '</dd></div>' +
      (p.hideGpa ? '' : '<div><dt>GPA</dt><dd>' + esc(p.gpa) + '</dd></div>') +
      '<div><dt>High school</dt><dd>' + esc(p.school) + '</dd></div>' +
      '<div><dt>Team</dt><dd>' + esc(t.name) + '</dd></div>' +
      (p.major ? '<div><dt>Wants to study</dt><dd>' + esc(p.major) + '</dd></div>' : '') + '</dl>' +
      '<div class="pp__act noprint">' + starBtn(p).replace('class="star"', 'class="star star--btn"').replace('</button>', '<span>Save to my list</span></button>') +
      '<button class="btn btn--sm" type="button" id="share">Share</button><button class="btn btn--sm" type="button" data-print>Print one page</button>' +
      '<a class="btn btn--sm" href="#ask">Ask about her</a></div></div></div></section>' +

      '<section class="sec sec--tight"><div class="wrap pgrid">' +
      '<div class="blk"><div class="blk__top"><h2>Measurables</h2>' + (p.sampleM ? sample('Sample numbers') : '') + '</div>' +
      (meas.length ? '<div class="meas">' + meas.map(function (m) { return '<div><b>' + esc(p.m[m[0]]) + (m[2] ? '<i>' + m[2] + '</i>' : '') + '</b><span>' + m[1] + '</span></div>'; }).join('') + '</div>' : '<p class="mute">No numbers posted yet.</p>') +
      (p.sampleM ? '<p class="fine">These are made up to show the layout. Her family enters the real ones in the profile builder.</p>' : '') + '</div>' +

      '<div class="blk"><div class="blk__top"><h2>Video</h2></div>' +
      (vids.length ? '<div class="vids">' + vids.map(function (id, i) { return '<button type="button" class="vid" data-yt="' + id + '" aria-label="Play video ' + (i + 1) + '"><img src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" loading="lazy" alt=""><span>' + I.play + '</span></button>'; }).join('') + '</div>' :
        '<div class="slot">' + I.play + '<span>No video posted yet. Paste a YouTube link in the profile builder and it plays right here.</span></div>') + '</div>' +

      '<div class="blk noprint"><div class="blk__top"><h2>Her player card</h2></div><div class="cardbox"><img id="cardImg" class="cardimg" width="500" height="700" alt="Player card for ' + esc(p.name) + '">' +
      '<div><p>Pick a look, then save it to post or print. The code on the card opens this page.</p>' + styleChips(p.cardStyle || 'pin') +
      '<div class="hero__cta"><button type="button" class="btn btn--ink btn--sm" id="cardShare">Share card</button><button type="button" class="btn btn--sm" id="cardSave">Save picture</button></div><p class="fine" id="cardMsg" role="status"></p></div></div></div>' +

      '<div class="blk"><div class="blk__top"><h2>Her coach</h2></div><div class="staff staff--one">' + staffRow(head, 'Head Coach, ' + t.name) + '</div>' +
      '<div class="links">' + (p.fl ? '<a class="more" href="https://www.fieldlevel.com/app/profile/' + p.fl + '/softball" target="_blank" rel="noopener">FieldLevel profile ' + I.arrow + '</a>' : '') + '</div></div>' +

      '<div class="blk blk--wide noprint"><div class="blk__top"><h2>See her play</h2>' + sample('Sample dates') + '</div><div class="evs">' + evs.map(function (e) { return eventRow(e, { noTeams: true }); }).join('') + '</div></div>' +

      '<div class="blk blk--wide blk--ink noprint" id="ask"><div class="blk__top"><h2>College coaches: ask about ' + esc(nm[0]) + '</h2></div>' +
      '<form class="form" novalidate><div class="two">' + field('cn', 'Your name', 'text', 'required autocomplete="name"') + field('cs', 'College or program', 'text', 'required') + '</div>' +
      '<div class="two">' + field('ce', 'Email', 'email', 'required autocomplete="email"') + field('cp', 'Phone', 'tel', 'autocomplete="tel"') + '</div>' +
      '<div class="fld"><label for="cm">Message</label><textarea id="cm" name="cm" placeholder="Transcript, schedule, a time to talk"></textarea></div>' +
      '<div><button class="btn btn--gold" type="submit">Send to her coach ' + I.arrow + '</button></div>' +
      '<div class="form__ok" role="status">This is a sample site, so nothing was sent. On the live site this goes to ' + esc(head.name) + ' and the family.</div></form></div>' +

      '</div><div class="wrap noprint"><p class="own"><a class="more" href="my-profile.html?p=' + p.id + '">Is this you? Update your profile ' + I.arrow + '</a></p></div></section>';
  };

  P.builder = function () {
    var id = qs.get('p');
    var p = id && player(id);
    if (!p) {
      return pageHead('Build my <span class="wm">profile</span>', 'Players and parents: this is where you fill in your recruiting page and make your player card.') +
        '<section class="sec sec--tight"><div class="wrap narrow"><div class="blk"><p class="note">Sample: on the real site each family signs in with a private code from their coach. Here, just pick a player to try it.</p>' +
        '<div class="fld mt"><label for="who">Player</label><select id="who"><option value="">Choose a player</option>' + players().map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + '</option>'; }).join('') + '</select></div></div></div></section>';
    }
    function sel(idn, label, val, opts) { return '<div class="fld"><label for="' + idn + '">' + label + '</label><select id="' + idn + '" name="' + idn + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>'; }
    var hands = [['R', 'Right'], ['L', 'Left'], ['S', 'Switch']];
    var v = p.vid || [];
    return pageHead('Build my <span class="wm">profile</span>', esc(p.name) + ', ' + esc(team(p.team).name) + '.', ['player.html?p=' + p.id, 'Back to my page']) +
      '<section class="sec sec--tight"><div class="wrap build">' +
      '<form class="form" id="bform" novalidate data-id="' + p.id + '">' +
      '<p class="note">Sample: changes save on this phone or computer only, so you can try it. Numbers start as made up samples, so change them to yours.</p>' +
      '<h2 class="fh">Photo and basics</h2>' +
      '<div class="fld"><label for="bphoto">Photo</label><input id="bphoto" type="file" accept="image/*"><small>A head and shoulders photo in uniform works best.</small></div>' +
      '<div class="two">' + field('num', 'Jersey number', 'text', 'inputmode="numeric" maxlength="2"', p.num || '') + field('pos', 'Positions', 'text', 'placeholder="C, OF"', p.pos.join(', ')) + '</div>' +
      '<div class="two">' + sel('bats', 'Bats', p.bats, hands) + sel('throws', 'Throws', p.throws, hands.slice(0, 2)) + '</div>' +
      '<div class="fld"><label for="about">About me</label><textarea id="about" name="about" maxlength="320" placeholder="Two or three lines a college coach should know">' + esc(p.about || '') + '</textarea></div>' +
      field('commit', 'College status', 'text', 'placeholder="Uncommitted, or Committed to ..."', p.commit || '') +
      '<h2 class="fh">School</h2>' +
      field('school', 'High school', 'text', '', p.school) +
      '<div class="two">' + field('gpa', 'GPA', 'text', 'inputmode="decimal"', p.gpa) + field('major', 'Wants to study', 'text', '', p.major || '') + '</div>' +
      '<label class="check"><input type="checkbox" id="hideGpa"' + (p.hideGpa ? ' checked' : '') + '> Keep my GPA off my page and card</label>' +
      '<h2 class="fh">Measurables</h2>' +
      '<div class="two">' + field('ht', 'Height', 'text', 'placeholder="5\'6&quot;"', p.m.ht || '') + field('ev', 'Exit velo (mph)', 'text', 'inputmode="decimal"', p.m.ev || '') + '</div>' +
      '<div class="two">' + field('ov', 'Overhand velo (mph)', 'text', 'inputmode="decimal"', p.m.ov || '') + field('h1', 'Home to first (sec)', 'text', 'inputmode="decimal"', p.m.h1 || '') + '</div>' +
      '<div class="two">' + field('pop', 'Pop time (catchers)', 'text', 'inputmode="decimal"', p.m.pop || '') + field('pv', 'Pitch velo (pitchers)', 'text', 'inputmode="decimal"', p.m.pv || '') + '</div>' +
      '<h2 class="fh">Video</h2>' +
      field('vid1', 'YouTube link: skills video', 'url', 'placeholder="https://youtu.be/..."', v[0] || '') + field('vid2', 'YouTube link: game clips', 'url', '', v[1] || '') +
      '<div class="build__act"><button class="btn btn--ink" type="submit">Save my profile ' + I.arrow + '</button><button class="btn" type="button" id="breset">Start over</button></div>' +
      '<div class="form__ok" id="bok" role="status">Saved on this device. <a href="player.html?p=' + p.id + '">See my page</a></div></form>' +
      '<aside class="build__side"><h2 class="fh">My player card</h2><img id="cardImg" class="cardimg" width="500" height="700" alt="Player card preview">' + styleChips(p.cardStyle || 'pin') +
      '<div class="hero__cta"><button type="button" class="btn btn--ink btn--sm" id="cardShare">Share card</button><button type="button" class="btn btn--sm" id="cardSave">Save picture</button></div><p class="fine" id="cardMsg" role="status">The card updates when you save.</p></aside>' +
      '</div></section>';
  };

  P.cards = function () {
    var t = team(qs.get('t')) || D.teams[1];
    document.title = t.name + ' card set | Empire Softball';
    var r = roster(t.id);
    return pageHead('Team <span class="wm">card set</span>', esc(t.name) + '. ' + (r.length ? 'One card for every player. Tap a card to save it, or print the whole set.' : ''), ['team.html?t=' + t.id, t.name],
      r.length ? '<div class="ph__act noprint">' + styleChips('pin') + '<button type="button" class="btn btn--sm" data-print>Print the set</button></div>' : '') +
      '<section class="sec sec--tight"><div class="wrap">' + (r.length ? '<div class="set" id="set">' + r.map(function (p) { return '<button type="button" class="set__c" data-card="' + p.id + '" aria-label="Save the card for ' + esc(p.name) + '"><img width="500" height="700" alt="' + esc(p.name) + ' player card"></button>'; }).join('') + '</div><p class="fine noprint" id="cardMsg" role="status"></p>' :
        '<div class="empty"><h3>No cards yet</h3><p>Cards appear once this team has player profiles.</p><a class="btn" href="cards.html?t=white-16u-elite">See a finished set</a></div>') + '</div></section>';
  };

  P.schedule = function () {
    var opts = '<option value="">All teams</option>' + D.teams.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('');
    return pageHead('Where to <span class="wm">watch</span>', 'Every tournament and showcase, by team. College coaches: showcase weekends are marked.') +
      '<section class="sec sec--tight"><div class="wrap">' +
      '<div class="schedbar"><div class="fld"><label for="tf">Show</label><select id="tf">' + opts + '</select></div>' +
      '<label class="check"><input type="checkbox" id="showOnly"> College showcases only</label></div>' +
      '<p class="note">These are sample dates to show how the page works. The real slate goes in from the coach page.</p>' +
      '<div id="sched"></div></div></section>';
  };

  P.photos = function () {
    return pageHead('Photos') + '<section class="sec sec--tight"><div class="wrap"><div class="gal">' +
      D.photos.map(function (ph, i) { return '<button type="button" data-i="' + i + '" aria-label="Open photo: ' + esc(ph.cap) + '"><img src="' + ph.src + '" width="' + ph.w + '" height="' + ph.h + '" decoding="async" alt="' + esc(ph.cap) + '"><span>' + esc(ph.cap) + '</span></button>'; }).join('') +
      '</div></div></section>' +
      '<dialog class="lb" id="lb"><div class="lb__in"><div class="lb__bar"><span id="lbCap"></span><button type="button" id="lbX">Close</button></div><div class="lb__mid"><img id="lbImg" alt=""></div><div class="lb__nav"><button type="button" id="lbP">Previous</button><button type="button" id="lbN">Next</button></div></div></dialog>';
  };

  P.about = function () {
    var seen = {}; var coaches = [];
    D.teams.forEach(function (t) {
      (t.staff || [{ name: t.coach, role: 'Head Coach' }]).forEach(function (s) {
        if (!seen[s.name]) { seen[s.name] = { s: s, teams: [] }; coaches.push(seen[s.name]); }
        seen[s.name].teams.push((s.role === 'Head Coach' ? '' : 'Assistant, ') + t.name.replace('Empire ', ''));
      });
    });
    return pageHead('About <span class="wm">Empire</span>') +
      '<section class="sec sec--tight"><div class="wrap split"><div class="prose"><p class="lead">' + esc(D.club.mission) + '</p>' + D.club.about.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>' +
      '<figure class="frame"><img src="img/photos/gold12-team.webp" loading="lazy" alt="Empire Gold 12u team photo"></figure></div></section>' +
      '<section class="sec sec--soft"><div class="wrap"><div class="sec__head"><h2 class="disp">One year, three seasons</h2></div>' + seasonRows() + '</div></section>' +
      '<section class="sec"><div class="wrap"><div class="sec__head"><h2 class="disp">Coaching staff</h2></div><div class="staff">' +
      coaches.map(function (c) { return staffRow({ name: c.s.name, photo: c.s.photo }, c.teams.join(' and ')); }).join('') + '</div></div></section>' + tryoutCta();
  };

  P.tryouts = function () {
    var ages = []; D.teams.forEach(function (t) { if (ages.indexOf(t.age) < 0) ages.push(t.age); });
    return pageHead('Try<span class="wm">outs</span>', 'Tell us about your player. A coach from the right age group will reach out about tryout dates and open roster spots.') +
      '<section class="sec sec--tight"><div class="wrap split split--rev"><figure class="frame"><img src="img/photos/gold14-team.webp" loading="lazy" alt="Empire Gold 14u team photo"></figure>' +
      '<form class="form" novalidate><div class="two">' + field('pn', 'Player name', 'text', 'required autocomplete="off"') +
      '<div class="fld"><label for="ag">Age group</label><select id="ag" name="ag">' + ages.reverse().map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="two">' + field('gy', 'Grad year', 'text', 'inputmode="numeric" placeholder="2029"') + field('po', 'Positions', 'text', 'placeholder="SS, OF"') + '</div>' +
      field('ct', 'Current team (if any)') +
      '<div class="two">' + field('pa', 'Parent or guardian name', 'text', 'required autocomplete="name"') + field('em', 'Parent email', 'email', 'required autocomplete="email"') + '</div>' +
      field('ph', 'Parent phone', 'tel', 'autocomplete="tel"') +
      '<div class="fld"><label for="ms">Anything we should know</label><textarea id="ms" name="ms"></textarea></div>' +
      '<div><button class="btn btn--ink" type="submit">Send to the coaches ' + I.arrow + '</button></div>' +
      '<div class="form__ok" role="status">This is a sample site, so nothing was sent. On the live site this goes straight to the coach for that age group.</div></form></div></section>';
  };
  P.contact = function () {
    return pageHead('Contact', 'Questions about a team, a player or tryouts.') +
      '<section class="sec sec--tight"><div class="wrap split"><form class="form" novalidate><div class="two">' + field('nm', 'Name', 'text', 'required autocomplete="name"') + field('em', 'Email', 'email', 'required autocomplete="email"') + '</div>' +
      '<div class="fld"><label for="ab">About</label><select id="ab"><option>General question</option><option>I am a college coach</option><option>Tryouts</option><option>Sponsorship</option></select></div>' +
      '<div class="fld"><label for="ms">Message</label><textarea id="ms" name="ms" required></textarea></div>' +
      '<div><button class="btn btn--ink" type="submit">Send message ' + I.arrow + '</button></div>' +
      '<div class="form__ok" role="status">This is a sample site, so nothing was sent. On the live site this goes to the club inbox.</div></form>' +
      '<div class="side"><p class="kicker">Follow the teams</p><p><a class="more" href="' + D.club.instagram + '" target="_blank" rel="noopener">Instagram</a><a class="more" href="' + D.club.facebook + '" target="_blank" rel="noopener">Facebook</a></p>' +
      '<p class="kicker">College coaches</p><p class="mute">Each player page has a form that goes to her head coach. Start with the player list.</p>' +
      '<p><a class="btn" href="players.html">Player profiles</a></p></div></div></section>';
  };

  /* ---------- render ---------- */
  app.innerHTML = header() + '<main id="main">' + (P[page] || P.home)() + '</main>' + footer();

  /* menu */
  var sheet = document.getElementById('sheet');
  document.getElementById('menuOpen').addEventListener('click', function () { sheet.classList.add('open'); document.documentElement.style.overflow = 'hidden'; document.getElementById('menuClose').focus(); });
  function closeMenu() { sheet.classList.remove('open'); document.documentElement.style.overflow = ''; }
  document.getElementById('menuClose').addEventListener('click', closeMenu);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  /* one click handler for the small shared buttons */
  var onStar = null;
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-ics]');
    if (b) {
      var e = D.events.filter(function (x) { return x.id === b.dataset.ics; })[0]; if (!e) return;
      var s = e.start.replace(/-/g, ''); var en = ymd(e.end); var d = new Date(en.y, en.m, en.d + 1);
      var endX = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
      var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Empire Softball//EN', 'BEGIN:VEVENT', 'UID:' + e.id + '@empiresoftball', 'DTSTAMP:' + s + 'T000000Z',
        'DTSTART;VALUE=DATE:' + s, 'DTEND;VALUE=DATE:' + endX, 'SUMMARY:Empire Softball: ' + e.name, 'LOCATION:' + e.place + '\\, ' + e.city.replace(',', '\\,'), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'empire-' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.ics';
      document.body.appendChild(a); a.click(); a.remove(); return;
    }
    if (ev.target.closest('[data-print]')) { window.print(); return; }
    var st = ev.target.closest('[data-star]');
    if (st) {
      ev.preventDefault();
      var l = shortlist(), id = st.dataset.star, i = l.indexOf(id);
      if (i > -1) l.splice(i, 1); else l.push(id);
      sset('emp_list', l); st.setAttribute('aria-pressed', String(i < 0));
      var sp = st.querySelector('span'); if (sp) sp.textContent = i < 0 ? 'Saved to my list' : 'Save to my list';
      if (onStar) onStar(); return;
    }
    var yt = ev.target.closest('[data-yt]');
    if (yt) {
      var f = document.createElement('iframe'); f.className = 'vid'; f.src = 'https://www.youtube-nocookie.com/embed/' + yt.dataset.yt + '?autoplay=1'; f.allow = 'autoplay; encrypted-media; picture-in-picture'; f.allowFullscreen = true; f.title = 'Player video';
      yt.replaceWith(f);
    }
  });

  /* demo forms */
  [].forEach.call(document.querySelectorAll('form.form:not(#bform)'), function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = [].filter.call(form.querySelectorAll('[required]'), function (f) { return !f.value.trim() || (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(f.value)); });
      [].forEach.call(form.querySelectorAll('input,textarea'), function (f) { f.classList.remove('bad'); });
      if (bad.length) { bad.forEach(function (f) { f.classList.add('bad'); }); bad[0].focus(); return; }
      form.querySelector('.form__ok').classList.add('on');
    });
  });

  /* player card preview + save, used on the player page and the builder */
  function cardUi(getP) {
    var img = document.getElementById('cardImg'); if (!img || !C) return function () { };
    var style = getP().cardStyle || 'pin', msg = document.getElementById('cardMsg');
    function draw() { C.render(cardOpts(getP(), style, 0.5)).then(function (c) { img.src = c.toDataURL('image/png'); }); }
    document.getElementById('styles').addEventListener('click', function (e) {
      var b = e.target.closest('[data-style]'); if (!b) return; style = b.dataset.style;
      [].forEach.call(this.querySelectorAll('.chip'), function (c) { c.setAttribute('aria-pressed', String(c === b)); });
      var o = sget('emp_ov') || {}; if (o[getP().id]) { o[getP().id].cardStyle = style; sset('emp_ov', o); }
      draw();
    });
    function out(dl) {
      var p = getP(); msg.textContent = 'Drawing the card.';
      C.render(cardOpts(p, style, 1)).then(function (c) { return C.share(c, 'empire-' + p.id + '.png', p.name + ', Empire Softball', dl); })
        .then(function (r) { msg.textContent = r === 'downloaded' ? 'Saved to your downloads.' : r === 'shared' ? 'Shared.' : ''; });
    }
    document.getElementById('cardShare').addEventListener('click', function () { out(false); });
    document.getElementById('cardSave').addEventListener('click', function () { out(true); });
    draw(); return draw;
  }

  if (page === 'home' && C) {
    var fan = document.getElementById('fan');
    [['kaitlyn-lozano', 'gold'], ['lily-suarez', 'pin'], ['megan-hobdy', 'white']].forEach(function (x, i) {
      var p = player(x[0]); var a = document.createElement('a'); a.href = 'player.html?p=' + p.id; a.className = 'fan__c fan__c--' + i; a.setAttribute('aria-label', p.name + ' player card');
      fan.appendChild(a);
      C.render(cardOpts(p, x[1], 0.4)).then(function (c) { var im = new Image(); im.alt = ''; im.width = 400; im.height = 560; im.src = c.toDataURL('image/png'); a.appendChild(im); });
    });
  }

  if (page === 'players') {
    var state = { grad: qs.get('grad') || '', pos: qs.get('pos') || '', gpa: qs.get('gpa') || '', mine: '', q: '', sort: 'name' };
    var list = document.getElementById('list'), count = document.getElementById('count'), mineBox = document.getElementById('mine');
    var draw = function () {
      var q = state.q.toLowerCase(), l = shortlist();
      var out = players().filter(function (p) {
        return (!state.grad || String(p.grad) === state.grad) && (!state.pos || p.pos.indexOf(state.pos) > -1) && (!state.gpa || (!p.hideGpa && parseFloat(p.gpa) >= parseFloat(state.gpa))) &&
          (!state.mine || l.indexOf(p.id) > -1) && (!q || (p.name + ' ' + p.school).toLowerCase().indexOf(q) > -1);
      });
      out.sort(function (a, b) { return state.sort === 'gpa' ? parseFloat(b.gpa) - parseFloat(a.gpa) : state.sort === 'grad' ? a.grad - b.grad || a.name.localeCompare(b.name) : a.name.localeCompare(b.name); });
      list.innerHTML = out.map(playerCard).join('') || '<div class="empty"><h3>' + (state.mine ? 'Nobody on your list yet' : 'No players match') + '</h3><p>' + (state.mine ? 'Tap the star on any player to keep her here.' : 'Try clearing a filter.') + '</p></div>';
      count.innerHTML = '<b>' + out.length + '</b> ' + (out.length === 1 ? 'player' : 'players');
      document.getElementById('mineN').textContent = l.length;
      mineBox.hidden = !state.mine || !out.length;
      document.getElementById('mineMail').href = 'mailto:?subject=' + encodeURIComponent('My Empire Softball list') + '&body=' + encodeURIComponent(out.map(function (p) { return p.name + ', ' + p.grad + ', ' + p.pos.join('/') + ', ' + p.school + '\n' + purl(p); }).join('\n\n'));
      [].forEach.call(document.querySelectorAll('.chip[data-f]'), function (c) { c.setAttribute('aria-pressed', String(state[c.dataset.f] === c.dataset.v)); });
    };
    onStar = draw;
    document.getElementById('main').addEventListener('click', function (e) { var c = e.target.closest('.chip[data-f]'); if (!c) return; state[c.dataset.f] = state[c.dataset.f] === c.dataset.v ? '' : c.dataset.v; draw(); });
    document.getElementById('find').addEventListener('input', function (e) { state.q = e.target.value; draw(); });
    document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; draw(); });
    draw();
  }

  if (page === 'player') {
    var cur = function () { return player(qs.get('p')) || player(D.players[0].id); };
    cardUi(cur);
    var sh = document.getElementById('share');
    sh.addEventListener('click', function () {
      var p = cur(), done = function () { sh.textContent = 'Link copied'; };
      if (navigator.share) { navigator.share({ title: p.name + ', Empire Softball', url: location.href }).catch(function () { }); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).then(done, done);
      else { var t = document.createElement('input'); t.value = location.href; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) { } t.remove(); done(); }
    });
  }

  if (page === 'builder') {
    var who = document.getElementById('who');
    if (who) who.addEventListener('change', function () { if (who.value) location.href = 'my-profile.html?p=' + who.value; });
    var bf = document.getElementById('bform');
    if (bf) {
      var pid = bf.dataset.id, newPhoto = null;
      var redraw = cardUi(function () { var p = player(pid); if (newPhoto) p = Object.assign({}, p, { photo: newPhoto }); return p; });
      var val = function (n) { return (document.getElementById(n).value || '').trim(); };
      document.getElementById('bphoto').addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0]; if (!f) return;
        var url = URL.createObjectURL(f), im = new Image();
        im.onload = function () {
          var w = 600, h = 750, c = document.createElement('canvas'); c.width = w; c.height = h;
          var s = Math.max(w / im.width, h / im.height); c.getContext('2d').drawImage(im, (w - im.width * s) / 2, (h - im.height * s) * 0.2, im.width * s, im.height * s);
          newPhoto = c.toDataURL('image/jpeg', 0.82); URL.revokeObjectURL(url); redraw();
        };
        im.src = url;
      });
      bf.addEventListener('submit', function (e) {
        e.preventDefault();
        var o = sget('emp_ov') || {}, old = o[pid] || {};
        var pos = val('pos').toUpperCase().split(/[,\/\s]+/).filter(Boolean);
        var m = {}; MEAS.forEach(function (x) { m[x[0]] = val(x[0]); });
        o[pid] = { num: val('num'), pos: pos.length ? pos : player(pid).pos, bats: val('bats'), throws: val('throws'), about: val('about'), commit: val('commit'), school: val('school') || player(pid).school,
          gpa: val('gpa') || player(pid).gpa, major: val('major'), hideGpa: document.getElementById('hideGpa').checked, m: m, vid: [val('vid1'), val('vid2')].filter(Boolean), cardStyle: old.cardStyle, photo: newPhoto || old.photo };
        if (!o[pid].photo) delete o[pid].photo;
        sset('emp_ov', o); document.getElementById('bok').classList.add('on'); redraw();
      });
      document.getElementById('breset').addEventListener('click', function () { var o = sget('emp_ov') || {}; delete o[pid]; sset('emp_ov', o); location.reload(); });
    }
  }

  if (page === 'cards' && C && document.getElementById('set')) {
    var setEl = document.getElementById('set'), setStyle = 'pin';
    var r2 = roster((team(qs.get('t')) || D.teams[1]).id);
    var drawSet = function () {
      /* one at a time, so a phone never holds more than one big canvas */
      r2.reduce(function (chain, p, i) { return chain.then(function () { return C.render(cardOpts(p, setStyle, 0.5)); }).then(function (c) { setEl.children[i].firstChild.src = c.toDataURL('image/png'); }); }, Promise.resolve());
    };
    document.getElementById('styles').addEventListener('click', function (e) {
      var b = e.target.closest('[data-style]'); if (!b) return; setStyle = b.dataset.style;
      [].forEach.call(this.querySelectorAll('.chip'), function (c) { c.setAttribute('aria-pressed', String(c === b)); }); drawSet();
    });
    setEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-card]'); if (!b) return; var p = player(b.dataset.card), msg = document.getElementById('cardMsg');
      msg.textContent = 'Drawing the card.';
      C.render(cardOpts(p, setStyle, 1)).then(function (c) { return C.share(c, 'empire-' + p.id + '.png', p.name + ', Empire Softball'); }).then(function (r) { msg.textContent = r === 'downloaded' ? 'Saved to your downloads.' : ''; });
    });
    drawSet();
  }

  if (page === 'schedule') {
    var sel = document.getElementById('tf'), box = document.getElementById('sched'), so = document.getElementById('showOnly');
    if (qs.get('t')) sel.value = qs.get('t');
    var drawS = function () {
      var evs = upcoming(D.events.filter(function (e) { return (!sel.value || e.teams.indexOf(sel.value) > -1) && (!so.checked || e.showcase); }));
      var html = '', last = '';
      evs.forEach(function (e) { var a = ymd(e.start), k = MONTH[a.m] + ' ' + a.y; if (k !== last) { html += (last ? '</div>' : '') + '<h2 class="month">' + k + '</h2><div class="evs">'; last = k; } html += eventRow(e); });
      box.innerHTML = html ? html + '</div>' : '<div class="empty"><h3>Nothing here yet</h3><p>No events match for this team.</p></div>';
    };
    sel.addEventListener('change', drawS); so.addEventListener('change', drawS); drawS();
  }

  if (page === 'photos') {
    var lb = document.getElementById('lb'), curI = 0;
    var show = function (i) { curI = (i + D.photos.length) % D.photos.length; var ph = D.photos[curI]; document.getElementById('lbImg').src = ph.src; document.getElementById('lbImg').alt = ph.cap; document.getElementById('lbCap').textContent = ph.cap; };
    document.querySelector('.gal').addEventListener('click', function (e) { var b = e.target.closest('button[data-i]'); if (!b) return; show(+b.dataset.i); lb.showModal(); });
    document.getElementById('lbX').addEventListener('click', function () { lb.close(); });
    document.getElementById('lbP').addEventListener('click', function () { show(curI - 1); });
    document.getElementById('lbN').addEventListener('click', function () { show(curI + 1); });
    lb.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') show(curI - 1); if (e.key === 'ArrowRight') show(curI + 1); });
  }
})();
