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
    var cl = club();
    var b = D.players.concat(cl.players || []).filter(function (p) { return p.id === id; })[0]; if (!b) return null;
    var o = (sget('emp_ov') || {})[id], note = (cl.notes || {})[id];
    if (!o && !note) return b;
    var p = Object.assign({}, b, o || {}); p.m = Object.assign({}, b.m, (o || {}).m || {});
    if (o) { p.sampleM = false; p.edited = true; }
    if (note) p.coachNote = note;
    return p;
  }
  function club() { return sget('emp_club') || {}; }
  function regs() { return sget('emp_reg') || []; }
  function fee() { return parseInt(club().fee, 10) || D.fee; }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function NEWS() { return (Array.isArray(club().news) ? club().news : []).concat(D.news).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }); }
  function RESULTS() { return (club().results || []).concat(D.results); }
  function titles() { return RESULTS().filter(function (r) { return /champ/i.test(r.finish); }).length; }
  function longDate(s) { var a = ymd(s); return MONTH[a.m] + ' ' + a.d + ', ' + a.y; }
  function alumRow(a) { return '<div class="cm__row"><img src="' + a.photo + '" loading="lazy" alt=""><span class="cm__who"><b>' + esc(a.name) + '</b><i>' + esc(a.note) + '</i></span><span class="cm__to"><i>Playing at</i><b>' + esc(a.college) + '</b></span></div>'; }
  function newsRow(n) { return '<article class="nw" id="' + n.id + '">' + (n.photo ? '<img src="' + n.photo + '" loading="lazy" alt="">' : '') + '<div><p class="nw__d">' + longDate(n.date) + (n.sample ? ' ' + sample() : '') + '</p><h3>' + esc(n.title) + '</h3><p>' + esc(n.text) + '</p></div></article>'; }
  function trophyRow(r) { var t = team(r.team) || { name: r.label || 'Empire' }; return '<a class="tr" href="' + (t.id ? 'team.html?t=' + t.id : 'news.html#results') + '"><span class="tr__f' + (/champ/i.test(r.finish) ? ' tr__f--1' : '') + '">' + esc(r.finish) + '</span><span class="tr__e"><b>' + esc(r.event) + '</b><i>' + esc(t.name) + (r.record ? ', ' + esc(r.record) : '') + (r.date ? ', ' + MONTH[ymd(r.date).m] + ' ' + ymd(r.date).y : '') + (r.sample ? ' ' + sample() : '') + '</i></span></a>'; }
  function EV() { return D.events.concat(club().events || []); }
  function players() { return D.players.concat(club().players || []).map(function (p) { return player(p.id); }); }
  function initialsPic(p) {
    var ini = p.name.split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="900"><rect width="720" height="900" fill="#e9d5a1"/><text x="360" y="520" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="260" fill="#0b0b0b">' + ini + '</text></svg>');
  }
  function roster(tid) { return players().filter(function (p) { return p.team === tid; }); }
  function pphoto(p) { return p.photo || (p.added ? initialsPic(p) : 'img/players/' + p.id + '.webp'); }
  function hand(c) { return c === 'L' ? 'Left' : c === 'S' ? 'Switch' : 'Right'; }
  function purl(p) { return location.origin + location.pathname.replace(/[^/]*$/, '') + 'player.html?p=' + p.id; }
  function ytId(u) { var m = String(u || '').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/); return m ? m[1] : ''; }
  function shortlist() { return sget('emp_list') || []; }
  function notes() { return sget('emp_notes') || {}; }
  function avgGpa(list) { var g = list.filter(function (p) { return !p.hideGpa && parseFloat(p.gpa); }).map(function (p) { return parseFloat(p.gpa); }); return g.length ? (g.reduce(function (a, b) { return a + b; }, 0) / g.length).toFixed(2) : ''; }
  var STATS = [['avg', 'AVG'], ['obp', 'OBP'], ['hr', 'HR'], ['rbi', 'RBI'], ['sb', 'SB'], ['era', 'ERA'], ['k', 'K'], ['ip', 'IP']];
  var MEAS = [['ht', 'Height', ''], ['ev', 'Exit velo', 'mph'], ['ov', 'Overhand velo', 'mph'], ['h1', 'Home to first', 'sec'], ['pop', 'Pop time', 'sec'], ['pv', 'Pitch velo', 'mph']];
  function icsFile(list, fileName) {
    var out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Empire Softball//EN'];
    list.forEach(function (e) {
      var s = e.start.replace(/-/g, ''); var en = ymd(e.end); var d = new Date(en.y, en.m, en.d + 1);
      var endX = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
      out.push('BEGIN:VEVENT', 'UID:' + e.id + '@empiresoftball', 'DTSTAMP:' + s + 'T000000Z', 'DTSTART;VALUE=DATE:' + s, 'DTEND;VALUE=DATE:' + endX, 'SUMMARY:Empire Softball: ' + e.name, 'LOCATION:' + e.place + '\\, ' + e.city.replace(',', '\\,'), 'END:VEVENT');
    });
    out.push('END:VCALENDAR');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out.join('\r\n')], { type: 'text/calendar' })); a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function diamond(pos) {
    var S = { P: [100, 120], C: [100, 166], '1B': [146, 114], '2B': [124, 86], '3B': [54, 114], SS: [76, 86], LF: [42, 66], CF: [100, 44], RF: [158, 66] };
    return '<svg class="dia" viewBox="0 0 200 190" role="img" aria-label="Field diagram showing ' + esc(pos.join(', ')) + '"><path d="M100 180 L8 86 A100 100 0 0 1 192 86 Z" fill="#f1eee3" stroke="#0b0b0b" stroke-width="2.5" stroke-linejoin="round"/><path d="M100 166 L146 120 L100 74 L54 120 Z" fill="#e9d5a1" stroke="#0b0b0b" stroke-width="2" stroke-linejoin="round"/>' +
      Object.keys(S).map(function (k) { var on = pos.indexOf(k) > -1 || (pos.indexOf('OF') > -1 && /F$/.test(k)); return '<circle cx="' + S[k][0] + '" cy="' + S[k][1] + '" r="13" fill="' + (on ? '#0b0b0b' : '#ffffff') + '" stroke="#0b0b0b" stroke-width="2"/><text x="' + S[k][0] + '" y="' + (S[k][1] + 3.5) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="' + (on ? '#e9d5a1' : '#8a867b') + '">' + k + '</text>'; }).join('') + '</svg>';
  }

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
    find: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>',
    star: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.4 6.4 20.4l1.1-6.3L3 9.7l6.2-.9z"/></svg>'
  };
  var SKY = 'M0 70V52h34V40h22v12h30V30h18v-8h10v8h16v22h40V44h26V34h30v18h28V24h14V12h8V4h4v8h8v12h14v28h36V38h24v14h30V46h22V26h30v20h26V16h10V0h6v16h10v30h34V36h28v16h30V28h20v-8h12v8h20v24h32V42h26v10h30V32h36v20h28V44h30V22h14v-8h8v8h14v30h34V38h30v14h26V48h40v22z';
  function sky(cls) { return '<svg class="sky ' + (cls || '') + '" viewBox="0 0 1200 70" preserveAspectRatio="none" aria-hidden="true"><path fill="currentColor" d="' + SKY + '"/></svg>'; }

  var NAV = [
    ['index.html', 'Home', 'home'], ['teams.html', 'Teams', 'teams'], ['players.html', 'Players', 'players'],
    ['schedule.html', 'Where to watch', 'schedule'], ['photos.html', 'Photos', 'photos'], ['about.html', 'About', 'about'], ['contact.html', 'Contact', 'contact']
  ];
  var here = { team: 'teams', player: 'players', cards: 'teams', builder: 'builder', compare: 'players' }[page] || page;

  function header() {
    var links = NAV.slice(1).map(function (n) { return '<a href="' + n[0] + '"' + (n[2] === here ? ' aria-current="page"' : '') + '>' + n[1] + '</a>'; }).join('');
    var sheet = NAV.concat([['family.html', 'My family', 'family'], ['register.html', 'Register', 'register'], ['tryouts.html', 'Tryouts', 'tryouts'], ['news.html', 'News', 'news'], ['commits.html', 'Committed', 'commits'], ['roadmap.html', 'Recruiting road map', 'roadmap'], ['my-profile.html', 'Player sign in', 'builder'], ['coach.html', 'Coach desk', 'coach']]).map(function (n, i) {
      return '<a class="sheet__link" href="' + n[0] + '"' + (n[2] === here ? ' aria-current="page"' : '') + '><span>' + ('0' + (i + 1)).slice(-2) + '</span>' + n[1] + '</a>';
    }).join('');
    return '<a class="skip" href="#main">Skip to content</a>' +
      '<a class="bar" href="tryouts.html">' + esc(club().banner || 'Registration and tryout sign-ups are open') + ' ' + I.arrow + '</a>' +
      '<header class="top"><div class="wrap top__in">' +
      '<a class="top__logo" href="index.html" aria-label="Empire Softball home"><img src="img/crest-sm.webp" width="320" height="199" alt="Empire Softball"></a>' +
      '<nav class="nav" aria-label="Main">' + links + '</nav>' +
      '<div class="top__act"><button class="top__find" id="findOpen" type="button" aria-label="Search the site">' + I.find + '</button><a class="top__sign" href="my-profile.html">Player sign in</a><a class="btn btn--sm btn--ink" href="register.html">Register</a>' +
      '<button class="menu-btn" id="menuOpen" aria-haspopup="dialog" aria-controls="sheet">Menu</button></div>' +
      '</div></header>' +
      '<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="Menu"><div class="sheet__top"><img src="img/crest-sm.webp" width="320" height="199" alt="">' +
      '<button class="menu-btn" id="menuClose">Close</button></div><div class="sheet__links">' + sheet + '</div>' +
      '<div class="sheet__soc"><a href="' + D.club.instagram + '" target="_blank" rel="noopener">Instagram</a><a href="' + D.club.facebook + '" target="_blank" rel="noopener">Facebook</a></div></div>' +
      '<dialog class="find" id="findDlg" aria-label="Search"><div class="find__bar"><input id="findQ" type="search" placeholder="Search players, teams, events" autocomplete="off" aria-label="Search the site"><button type="button" id="findX">Close</button></div><div id="findR" class="find__r"></div></dialog>';
  }

  function footer() {
    return '<footer class="foot">' + sky('foot__sky') + '<div class="foot__body"><div class="wrap foot__in">' +
      '<div class="foot__brand"><span class="foot__wm">Empire</span><span class="foot__wm foot__wm--b">Softball</span><p>' + esc(D.club.region) + '. Travel softball, ' + esc(D.club.ages) + '.</p></div>' +
      '<div class="foot__col"><b>The club</b>' + NAV.slice(1, 4).concat([['photos.html', 'Photos'], ['about.html', 'About']]).map(function (n) { return '<a href="' + n[0] + '">' + n[1] + '</a>'; }).join('') + '</div>' +
      '<div class="foot__col"><b>Players</b><a href="family.html">My family</a><a href="register.html">Register</a><a href="tryouts.html">Tryouts</a><a href="my-profile.html">Build my profile</a><a href="cards.html?t=white-16u-elite">Team card set</a><a href="commits.html">Committed</a><a href="roadmap.html">Recruiting road map</a></div>' +
      '<div class="foot__col"><b>Club</b><a href="news.html">News</a><a href="derby.html">Home Run Derby</a><a href="sponsor.html">Sponsor Empire</a><a href="' + D.club.store + '" target="_blank" rel="noopener">Team store</a><a href="contact.html">Contact</a><a href="coach.html">Coach desk</a><a href="' + D.club.instagram + '" target="_blank" rel="noopener">Instagram</a><a href="' + D.club.facebook + '" target="_blank" rel="noopener">Facebook</a></div>' +
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
      '<div class="ev__act"><a href="weekend.html?e=' + e.id + '">Weekend sheet</a>' + (e.showcase ? '<a href="scout.html?e=' + e.id + '">Scout sheet</a>' : '') + '<button type="button" data-ics="' + e.id + '">Add to my calendar</button>' +
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

  var KINDS = [['front', 'Card front'], ['back', 'Card back'], ['watch', 'Watch me play'], ['commit', 'Committed']];
  function kindChips(p, all) {
    return '<div class="chips" id="kinds" role="group" aria-label="What to make">' + KINDS.filter(function (k) { return all || k[0] !== 'commit' || p.college; }).map(function (k, i) { return '<button type="button" class="chip" data-kind="' + k[0] + '" aria-pressed="' + (i === 0) + '">' + k[1] + '</button>'; }).join('') + '</div>';
  }
  function gfx(p, kind, style, scale) {
    var o = cardOpts(p, style, scale), t = team(p.team), head = (t.staff || [])[0] || { name: t.coach };
    if (kind === 'back') {
      o.back = { meas: p.sampleM ? [] : MEAS.filter(function (m) { return p.m[m[0]]; }).map(function (m) { return [p.m[m[0]] + (m[2] ? ' ' + m[2] : ''), m[1]]; }),
        stats: STATS.filter(function (x) { return (p.stats || {})[x[0]]; }).map(function (x) { return [p.stats[x[0]], x[1]]; }), about: p.about || '', honors: p.honors || [],
        lines: [p.school + (p.hideGpa ? '' : '   \u2022   ' + p.gpa + ' GPA'), 'Coach ' + head.name + (head.email ? '   \u2022   ' + head.email : '')] };
      return C.back(o);
    }
    if (kind === 'commit') { o.college = p.college || 'Your college'; return C.commit(o); }
    if (kind === 'watch') {
      o.events = upcoming(EV().filter(function (e) { return e.teams.indexOf(t.id) > -1; })).slice(0, 4).map(function (e) { var a = ymd(e.start); return { mon: MON[a.m].toUpperCase(), day: a.d, name: e.name, place: e.place + ', ' + e.city }; });
      return C.story(o);
    }
    return C.render(o);
  }

  /* ---------- pages ---------- */
  var P = {};

  P.home = function () {
    var feat = ['kaitlyn-lozano', 'lily-suarez', 'julia-candelario', 'megan-hobdy', 'tiffany-matthews'].map(player);
    var next = upcoming(EV()).slice(0, 3);
    return '<section class="hero"><div class="wrap hero__in"><div class="hero__txt">' +
      '<p class="kicker">' + esc(D.club.region) + ' / ' + esc(D.club.ages) + '</p>' +
      '<h1 class="disp">Long Island <span class="wm">built.</span></h1>' +
      '<p class="hero__sub">Travel softball with coaches who push players on and off the field and get them ready for the next level.</p>' +
      '<div class="hero__cta"><a class="btn btn--ink" href="players.html">Meet the players ' + I.arrow + '</a><a class="btn" href="tryouts.html">Tryouts</a></div></div>' +
      '<figure class="hero__pic"><img src="img/photos/huddle.webp" width="1800" height="1200" fetchpriority="high" alt="Empire players and coaches with hands in before a game"><figcaption>Hands in before first pitch</figcaption></figure>' +
      '</div>' + sky('hero__sky') + '</section>' +

      '<section class="facts"><div class="wrap facts__in">' +
      '<div class="fact"><b>' + D.teams.length + '</b><span>Teams in Black, White and Gold</span></div>' +
      '<div class="fact"><b>10U<i>to</i>18U</b><span>Every age group</span></div>' +
      '<div class="fact"><b>' + players().length + '</b><span>Recruiting profiles posted</span></div>' +
      '<div class="fact"><b>' + titles() + '</b><span>Tournament titles since 2024</span></div></div></section>' +

      '<nav class="ql" aria-label="Shortcuts"><div class="wrap ql__in"><a href="register.html"><b>Register</b><span>Season sign-up and dues</span></a><a href="tryouts.html"><b>Tryouts</b><span>Dates by age group</span></a><a href="schedule.html"><b>Schedule</b><span>Where each team plays</span></a><a href="players.html"><b>Recruiting</b><span>Player profiles</span></a></div></nav>' +

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

      '<section class="sec"><div class="wrap split"><div><div class="sec__head"><h2 class="disp">Trophy case</h2><p>How Empire teams have finished, from the club\'s own posts.</p></div><div class="trs">' + RESULTS().slice(0, 5).map(trophyRow).join('') + '</div><p class="mt"><a class="more" href="news.html#results">All ' + RESULTS().length + ' results ' + I.arrow + '</a></p></div>' +
      '<div><div class="sec__head"><h2 class="disp">News</h2><p>From the coaches.</p></div><div class="nws nws--sm">' + NEWS().slice(0, 2).map(newsRow).join('') + '</div><p class="mt"><a class="more" href="news.html">All news ' + I.arrow + '</a></p></div></div></section>' +

      '<section class="sec sec--soft"><div class="wrap"><div class="sec__head"><h2 class="disp">One year, three seasons</h2><p>The travel season runs from late August to July.</p></div>' + seasonRows() + '</div></section>' +

      '<section class="sec"><div class="wrap"><div class="sec__head"><h2 class="disp">Where to watch</h2><p>Coming to see a player? Here is where Empire teams play next. ' + sample('Sample dates') + '</p></div>' +
      '<div class="evs">' + next.map(function (e) { return eventRow(e); }).join('') + '</div>' +
      '<p class="mt"><a class="more" href="schedule.html">Full schedule ' + I.arrow + '</a></p></div></section>' +

      '<section class="sec sec--ink"><div class="wrap"><div class="sec__head"><h2 class="disp">On <span class="wm wm--onink">Instagram</span></h2><p>Game day photos and team news at eya_softball.</p></div>' +
      '<div class="ig">' + D.photos.filter(function (ph) { return ph.src.indexOf('/ig/') > -1; }).slice(0, 6).map(function (ph) { return '<a href="' + D.club.instagram + '" target="_blank" rel="noopener"><img src="' + ph.src + '" loading="lazy" alt="' + esc(ph.cap) + '"></a>'; }).join('') + '</div>' +
      '<p class="mt"><a class="btn btn--gold" href="' + D.club.instagram + '" target="_blank" rel="noopener">Follow Empire ' + I.arrow + '</a></p></div></section>' +

      '<section class="sec"><div class="wrap"><div class="sec__head"><h2 class="disp">Team sponsors</h2><p>Local businesses help cover tournament fees and winter training. Sponsor names and logos go here.</p></div>' +
      '<div class="spons">' + D.sponsors.map(function (x) { return '<span class="spons__real"><b>' + esc(x[0]) + '</b><i>' + esc(x[1]) + '</i></span>'; }).join('') + '<span>Your business here</span><span>Your business here</span><span>Your business here</span></div>' +
      '<p class="mt"><a class="more" href="sponsor.html">Sponsor packages ' + I.arrow + '</a></p></div></section>' +
      '<section class="sec sec--soft"><div class="wrap split"><div><p class="kicker">More than a team</p><h2 class="disp" style="font-size:clamp(26px,7vw,48px);margin:12px 0 16px">' + esc(D.club.program[0][0]) + '</h2><p class="lead">' + esc(D.club.program[0][1]) + '</p>' +
      '<div class="hero__cta"><a class="btn" href="about.html">About the program</a><a class="btn" href="' + D.club.store + '" target="_blank" rel="noopener">Team store</a></div></div>' +
      '<div class="cm">' + D.alumni.map(alumRow).join('') + '<p><a class="more" href="commits.html">Playing in college ' + I.arrow + '</a></p></div></div></section>' +
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
    var evs = upcoming(EV().filter(function (e) { return e.teams.indexOf(t.id) > -1; }));
    var staff = t.staff || [{ name: t.coach, role: 'Head Coach' }];
    return pageHead(esc(t.color) + ' <span class="wm">' + esc(t.age) + '</span>' + (t.tag ? ' ' + esc(t.tag) : ''), 'Head coach ' + esc(t.coach) + '.' + (t.blurb ? ' ' + esc(t.blurb) : ''), ['teams.html', 'All teams'],
      r.length ? '<div class="ph__act noprint"><a class="btn btn--sm" href="#sheet-roster">Roster sheet</a><a class="btn btn--sm" href="cards.html?t=' + t.id + '">Team card set</a><a class="btn btn--sm" href="schedule.html?t=' + t.id + '">Schedule</a>' + (t.ig ? '<a class="btn btn--sm" href="' + t.ig + '" target="_blank" rel="noopener">Team Instagram</a>' : '') + '</div>' : (t.ig ? '<div class="ph__act noprint"><a class="btn btn--sm" href="' + t.ig + '" target="_blank" rel="noopener">Team Instagram</a></div>' : '')) +
      (t.wide ? '<div class="wrap"><figure class="tphoto"><img src="' + t.wide + '" alt="' + esc(t.name) + ' team photo"></figure></div>' : '') +
      '<section class="sec sec--tight"><div class="wrap"><div class="sec__head"><h2 class="disp">Roster</h2>' + (r.length ? '<p>' + r.length + ' players. Open a player for her full recruiting page.</p>' : '') + '</div>' +
      (function () { var tr = RESULTS().filter(function (x) { return x.team === t.id; }); return tr.length ? '<div class="trs trs--row">' + tr.map(trophyRow).join('') + '</div>' : ''; })() +
      (r.length ? (function () {
        var by = {}; r.forEach(function (p) { by[p.grad] = (by[p.grad] || 0) + 1; });
        var has = function (k) { return r.filter(function (p) { return p.pos.indexOf(k) > -1; }).length; };
        return '<div class="nums"><div><b>' + r.length + '</b><span>Players</span></div><div><b>' + avgGpa(r) + '</b><span>Team GPA</span></div>' +
          Object.keys(by).sort().map(function (g) { return '<div><b>' + by[g] + '</b><span>Class of ' + g + '</span></div>'; }).join('') +
          '<div><b>' + has('P') + '</b><span>Pitchers</span></div><div><b>' + has('C') + '</b><span>Catchers</span></div></div>';
      })() + '<div class="pcs noprint">' + r.map(playerCard).join('') + '</div>' +
        '<div class="sheetbox" id="sheet-roster"><div class="sheetbox__top"><h3>Roster sheet for coaches</h3><button type="button" class="btn btn--sm noprint" data-print>Print this sheet</button></div>' +
        '<div class="tblwrap"><table class="tbl"><thead><tr><th>Player</th><th>Class</th><th>Pos</th><th>B/T</th><th>GPA</th><th>High school</th></tr></thead><tbody>' +
        r.map(function (p) { return '<tr><td><a href="player.html?p=' + p.id + '">' + esc(p.name) + '</a></td><td>' + p.grad + '</td><td>' + esc(p.pos.join(', ')) + '</td><td>' + p.bats + '/' + p.throws + '</td><td>' + (p.hideGpa ? '' : esc(p.gpa)) + '</td><td>' + esc(p.school) + '</td></tr>'; }).join('') +
        '</tbody></table></div></div>' :
        '<div class="empty"><h3>Roster coming soon</h3><p>Player profiles for this team have not been posted yet. Once the coach adds them, each player gets her own page here.</p><a class="btn" href="team.html?t=white-16u-elite">See a finished roster</a></div>') +
      '</div></section>' +
      '<section class="sec sec--tight sec--soft"><div class="wrap"><div class="sec__head"><h2 class="disp">Coaches</h2></div><div class="staff">' + staff.map(function (s) { return staffRow(s); }).join('') + '</div>' +
      (t.partners ? '<div class="sec__head" style="margin-top:36px"><h2 class="disp" style="font-size:clamp(22px,5.4vw,34px)">Team partners</h2></div><div class="spons spons--real">' + t.partners.map(function (x) { return '<span><b>' + esc(x[0]) + '</b><i>' + esc(x[1]) + '</i></span>'; }).join('') + '</div>' : '') + '</div></section>' +
      '<section class="sec sec--tight noprint"><div class="wrap"><div class="sec__head"><h2 class="disp">Where to watch</h2><p>' + sample('Sample dates') + '</p></div>' +
      '<div class="evs">' + evs.map(function (e) { return eventRow(e, { noTeams: true }); }).join('') + '</div>' +
      '<p class="mt"><button type="button" class="btn btn--sm" data-icsall="' + t.id + '">Add the whole schedule to my calendar</button></p></div></section>' +
      '<section class="sec sec--tight sec--gold noprint"><div class="wrap split"><div><h2 class="disp" style="font-size:clamp(24px,6vw,40px)">Rainouts and field changes</h2><p class="mt">Get a text when a game for ' + esc(t.name) + ' moves, is rained out or changes fields.</p></div>' +
      '<form class="form" novalidate><div class="two">' + field('an', 'Your name', 'text', 'required autocomplete="name"') + field('ap', 'Cell phone', 'tel', 'required autocomplete="tel"') + '</div>' +
      '<div><button class="btn btn--ink" type="submit">Text me changes ' + I.arrow + '</button></div><div class="form__ok" role="status">This is a sample site, so nothing was saved. On the live site you would be on the text list for this team.</div></form></div></section>';
  };

  P.players = function () {
    var grads = []; var poss = [];
    players().forEach(function (p) { if (grads.indexOf(p.grad) < 0) grads.push(p.grad); p.pos.forEach(function (x) { if (poss.indexOf(x) < 0) poss.push(x); }); });
    grads.sort(); var order = ['P', 'C', '1B', '2B', '3B', 'SS', 'OF'];
    poss.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    function chips(kind, list, lab) { return list.map(function (v) { return '<button type="button" class="chip" data-f="' + kind + '" data-v="' + v + '" aria-pressed="false">' + (lab ? lab(v) : v) + '</button>'; }).join(''); }
    return pageHead('Player <span class="wm">profiles</span>', 'For college coaches. Filter the list, open a player for her full recruiting page, and star the ones you want to keep.') +
      '<section class="sec sec--tight"><div class="wrap">' +
      '<div class="filters"><div class="filters__row"><span class="filters__lab">Class of</span>' + chips('grad', grads) + '</div>' +
      '<div class="filters__row"><span class="filters__lab">Position</span>' + chips('pos', poss) + '</div>' +
      '<div class="filters__row"><span class="filters__lab">GPA</span>' + chips('gpa', ['3.5', '3.8', '4.0'], function (v) { return v + ' and up'; }) + '</div>' +
      '<div class="filters__row filters__row--in"><div class="fld"><label for="find">Name or school</label><input id="find" type="search" placeholder="Search" autocomplete="off"></div>' +
      '<div class="fld"><label for="sort">Sort by</label><select id="sort"><option value="name">Name</option><option value="grad">Class</option><option value="gpa">GPA, high to low</option></select></div></div>' +
      '<div class="filters__row"><span class="filters__lab">Show as</span><button type="button" class="chip" data-f="view" data-v="" aria-pressed="true">Photos</button><button type="button" class="chip" data-f="view" data-v="list" aria-pressed="false">List</button></div></div>' +
      '<div class="listbar"><div class="count" id="count" aria-live="polite"></div>' +
      '<button type="button" class="chip chip--star" data-f="mine" data-v="1" aria-pressed="false">' + I.star + ' My list <b id="mineN">0</b></button></div>' +
      '<div class="mine" id="mine" hidden><span>Your list is saved on this device.</span><a class="btn btn--sm" href="compare.html">Compare side by side</a><a class="btn btn--sm" id="mineMail" href="#">Email my list to myself</a><button type="button" class="btn btn--sm" data-print>Print my list</button></div>' +
      '<div class="pcs" id="list"></div>' +
      '<p class="note">Profiles are posted for Empire White 16u Elite so far. Other teams appear here as their coaches add them.</p>' +
      '</div></section>';
  };

  P.player = function () {
    var p = player(qs.get('p')) || player(D.players[0].id);
    var t = team(p.team);
    var head = (t.staff || [])[0] || { name: t.coach };
    document.title = p.name + ', ' + p.grad + ' ' + p.pos.join('/') + ' | Empire Softball';
    var evs = upcoming(EV().filter(function (e) { return e.teams.indexOf(t.id) > -1; })).slice(0, 3);
    var nm = p.name.split(' ');
    var meas = MEAS.filter(function (m) { return p.m[m[0]]; });
    var vids = (p.vid || []).map(ytId).filter(Boolean);
    var st = STATS.filter(function (x) { return (p.stats || {})[x[0]]; });
    var mail = 'mailto:?subject=' + encodeURIComponent(p.name + ', class of ' + p.grad + ', Empire Softball') + '&body=' + encodeURIComponent(p.name + '\n' + p.pos.join(' / ') + ', class of ' + p.grad + '\n' + p.school + '\n' + t.name + '\n\nFull profile: ' + purl(p));
    return '<section class="pp"><div class="wrap pp__in">' +
      '<div class="pp__photo"><img src="' + pphoto(p) + '" width="720" height="900" alt="' + esc(p.name) + '">' + (p.num ? '<span class="pp__num">' + esc(p.num) + '</span>' : '') + '</div>' +
      '<div class="pp__head"><a class="crumb" href="team.html?t=' + t.id + '">' + I.back + esc(t.name) + '</a>' +
      '<h1 class="disp">' + esc(nm[0]) + ' <span class="wm">' + esc(nm.slice(1).join(' ')) + '</span></h1>' +
      '<div class="pp__tags"><span class="tag tag--ink">Class of ' + p.grad + '</span><span class="tag">' + esc(p.pos.join(' / ')) + '</span>' + (p.college ? '<span class="tag tag--gold">Committed: ' + esc(p.college) + '</span>' : p.commit ? '<span class="tag tag--gold">' + esc(p.commit) + '</span>' : '') + (p.transcript ? '<span class="tag">Transcript on request</span>' : '') + '</div>' +
      (p.about ? '<p class="pp__about">' + esc(p.about) + '</p>' : '') +
      '<dl class="dl">' +
      '<div><dt>Bats / Throws</dt><dd>' + hand(p.bats) + ' / ' + hand(p.throws) + '</dd></div>' +
      (p.hideGpa ? '' : '<div><dt>GPA</dt><dd>' + esc(p.gpa) + '</dd></div>') +
      '<div><dt>High school</dt><dd>' + esc(p.school) + '</dd></div>' +
      '<div><dt>Team</dt><dd>' + esc(t.name) + '</dd></div>' +
      (p.major ? '<div><dt>Wants to study</dt><dd>' + esc(p.major) + '</dd></div>' : '') +
      (p.sat ? '<div><dt>SAT</dt><dd>' + esc(p.sat) + '</dd></div>' : '') + (p.act ? '<div><dt>ACT</dt><dd>' + esc(p.act) + '</dd></div>' : '') +
      (p.ncaa ? '<div><dt>NCAA ID</dt><dd>' + esc(p.ncaa) + '</dd></div>' : '') + '</dl>' +
      '<div class="pp__act noprint">' + starBtn(p).replace('class="star"', 'class="star star--btn"').replace('</button>', '<span>Save to my list</span></button>') +
      '<button class="btn btn--sm" type="button" id="share">Share</button><button class="btn btn--sm" type="button" data-print>Print one page</button>' +
      '<a class="btn btn--sm" href="' + mail + '">Email this page</a><a class="btn btn--sm" href="#ask">Ask about her</a></div>' +
      '<div class="pnote noprint" id="pnote" hidden><label for="pn">My private note about ' + esc(nm[0]) + '</label><textarea id="pn" placeholder="Only you see this. It stays on this device."></textarea></div></div></div></section>' +

      '<section class="sec sec--tight"><div class="wrap pgrid">' +
      '<div class="blk"><div class="blk__top"><h2>Measurables</h2>' + (p.sampleM ? sample('Sample numbers') : '') + '</div>' +
      (meas.length ? '<div class="meas">' + meas.map(function (m) { return '<div><b>' + esc(p.m[m[0]]) + (m[2] ? '<i>' + m[2] + '</i>' : '') + '</b><span>' + m[1] + '</span></div>'; }).join('') + '</div>' : '<p class="mute">No numbers posted yet.</p>') +
      (p.sampleM ? '<p class="fine">These are made up to show the layout. Her family enters the real ones in the profile builder.</p>' : '') + '</div>' +

      '<div class="blk' + (st.length || (p.honors || []).length ? '' : ' noprint') + '"><div class="blk__top"><h2>' + (p.statsNote && !p.edited ? 'Her numbers' : 'This season') + '</h2>' + (p.statsNote && !p.edited ? '<span class="tag">' + esc(p.statsNote) + '</span>' : '') + '</div>' +
      (st.length ? '<div class="meas meas--4">' + st.map(function (x) { return '<div><b>' + esc(p.stats[x[0]]) + '</b><span>' + x[1] + '</span></div>'; }).join('') + '</div>' : '<div class="slot"><span>No season stats posted yet. The family or coach adds them in the profile builder.</span></div>') +
      ((p.honors || []).length ? '<div class="hon">' + p.honors.map(function (h) { return '<span class="tag tag--gold">' + esc(h) + '</span>'; }).join('') + '</div>' : '') + '</div>' +

      '<div class="blk"><div class="blk__top"><h2>Where she plays</h2><span class="tag">' + esc(p.pos.join(' / ')) + '</span></div>' + diamond(p.pos) + '</div>' +

      ((p.hl || []).length ? '<div class="blk blk--wide"><div class="blk__top"><h2>Highlights</h2><span class="tag">From her team\'s posts</span></div><ol class="hl">' + p.hl.map(function (h) { return '<li><b>' + esc(h[0]) + '</b><span>' + esc(h[1]) + '</span></li>'; }).join('') + '</ol></div>' : '') +
      '<div class="blk noprint"><div class="blk__top"><h2>Video</h2></div>' +
      (vids.length ? '<div class="vids">' + vids.map(function (id, i) { return '<button type="button" class="vid" data-yt="' + id + '" aria-label="Play video ' + (i + 1) + '"><img src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" loading="lazy" alt=""><span>' + I.play + '</span></button>'; }).join('') + '</div>' :
        '<div class="slot">' + I.play + '<span>No video posted yet. Paste a YouTube link in the profile builder and it plays right here.</span></div>') + '</div>' +

      '<div class="blk noprint"><div class="blk__top"><h2>Cards and graphics</h2></div><div class="cardbox"><img id="cardImg" class="cardimg" width="500" height="700" alt="Graphic for ' + esc(p.name) + '">' +
      '<div><p>Pick what to make and a look, then save it to post or print. The code on it opens this page.</p>' + kindChips(p) + styleChips(p.cardStyle || 'pin') +
      '<div class="hero__cta"><button type="button" class="btn btn--ink btn--sm" id="cardShare">Share card</button><button type="button" class="btn btn--sm" id="cardSave">Save picture</button></div><p class="fine" id="cardMsg" role="status"></p></div></div></div>' +

      (p.coachNote ? '<div class="blk blk--wide blk--gold"><div class="blk__top"><h2>Coach\'s take</h2><span class="tag">' + esc(head.name) + '</span></div><p class="lead">' + esc(p.coachNote) + '</p></div>' : '') +
      '<div class="blk"><div class="blk__top"><h2>Her coach</h2></div><div class="staff staff--one">' + staffRow(head, 'Head Coach, ' + t.name) + '</div>' +
      (p.hsCoach ? '<p class="fine">High school coach: ' + esc(p.hsCoach) + '</p>' : '') +
      '<div class="links">' + (p.fl ? '<a class="more" href="https://www.fieldlevel.com/app/profile/' + p.fl + '/softball" target="_blank" rel="noopener">FieldLevel profile ' + I.arrow + '</a>' : '') + '</div></div>' +

      '<div class="blk blk--wide noprint"><div class="blk__top"><h2>See her play</h2>' + sample('Sample dates') + '</div><div class="evs">' + evs.map(function (e) { return eventRow(e, { noTeams: true }); }).join('') + '</div></div>' +

      '<div class="blk blk--wide blk--ink noprint" id="ask"><div class="blk__top"><h2>College coaches: ask about ' + esc(nm[0]) + '</h2></div>' +
      '<form class="form" novalidate><div class="two">' + field('cn', 'Your name', 'text', 'required autocomplete="name"') + field('cs', 'College or program', 'text', 'required') + '</div>' +
      '<div class="two">' + field('ce', 'Email', 'email', 'required autocomplete="email"') + field('cp', 'Phone', 'tel', 'autocomplete="tel"') + '</div>' +
      '<div class="fld"><label for="cm">Message</label><textarea id="cm" name="cm" placeholder="Transcript, schedule, a time to talk"></textarea></div>' +
      '<div><button class="btn btn--gold" type="submit">Send to her coach ' + I.arrow + '</button></div>' +
      '<div class="form__ok" role="status">This is a sample site, so nothing was sent. On the live site this goes to ' + esc(head.name) + ' and the family.</div></form></div>' +

      '</div><div class="wrap noprint">' + (function () {
        var r = roster(t.id), i = r.map(function (x) { return x.id; }).indexOf(p.id), a = r[(i - 1 + r.length) % r.length], b = r[(i + 1) % r.length];
        return r.length > 1 ? '<div class="pn2"><a href="player.html?p=' + a.id + '">' + I.back + '<span><i>Previous</i>' + esc(a.name) + '</span></a><a href="player.html?p=' + b.id + '"><span><i>Next</i>' + esc(b.name) + '</span>' + I.arrow + '</a></div>' : '';
      })() + '<p class="own"><a class="more" href="my-profile.html?p=' + p.id + '">Is this you? Update your profile ' + I.arrow + '</a></p></div></section>';
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
      '<div class="two">' + field('commit', 'College status', 'text', 'placeholder="Uncommitted"', p.commit || '') + field('college', 'Committed to (college name)', 'text', 'placeholder="Leave empty until it is official"', p.college || '') + '</div>' +
      '<h2 class="fh">School</h2>' +
      field('school', 'High school', 'text', '', p.school) +
      '<div class="two">' + field('gpa', 'GPA', 'text', 'inputmode="decimal"', p.gpa) + field('major', 'Wants to study', 'text', '', p.major || '') + '</div>' +
      '<div class="two">' + field('sat', 'SAT', 'text', 'inputmode="numeric"', p.sat || '') + field('act', 'ACT', 'text', 'inputmode="numeric"', p.act || '') + '</div>' +
      '<div class="two">' + field('ncaa', 'NCAA ID', 'text', 'inputmode="numeric"', p.ncaa || '') + field('hsCoach', 'High school coach and email', 'text', '', p.hsCoach || '') + '</div>' +
      '<label class="check"><input type="checkbox" id="hideGpa"' + (p.hideGpa ? ' checked' : '') + '> Keep my GPA off my page and card</label>' +
      '<label class="check"><input type="checkbox" id="transcript"' + (p.transcript ? ' checked' : '') + '> My transcript is available on request</label>' +
      '<h2 class="fh">Measurables</h2>' +
      '<div class="two">' + field('ht', 'Height', 'text', 'placeholder="5\'6&quot;"', p.m.ht || '') + field('ev', 'Exit velo (mph)', 'text', 'inputmode="decimal"', p.m.ev || '') + '</div>' +
      '<div class="two">' + field('ov', 'Overhand velo (mph)', 'text', 'inputmode="decimal"', p.m.ov || '') + field('h1', 'Home to first (sec)', 'text', 'inputmode="decimal"', p.m.h1 || '') + '</div>' +
      '<div class="two">' + field('pop', 'Pop time (catchers)', 'text', 'inputmode="decimal"', p.m.pop || '') + field('pv', 'Pitch velo (pitchers)', 'text', 'inputmode="decimal"', p.m.pv || '') + '</div>' +
      '<h2 class="fh">This season</h2>' +
      '<div class="three">' + STATS.map(function (x) { return field('s_' + x[0], x[1], 'text', 'inputmode="decimal"', (p.stats || {})[x[0]] || ''); }).join('') + '</div>' +
      field('honors', 'Honors and awards, separated by commas', 'text', 'placeholder="All-County 2026, Team captain"', (p.honors || []).join(', ')) +
      '<h2 class="fh">Video</h2>' +
      field('vid1', 'YouTube link: skills video', 'url', 'placeholder="https://youtu.be/..."', v[0] || '') + field('vid2', 'YouTube link: game clips', 'url', '', v[1] || '') +
      '<div class="build__act"><button class="btn btn--ink" type="submit">Save my profile ' + I.arrow + '</button><button class="btn" type="button" id="bfill">Fill in sample answers</button><button class="btn" type="button" id="breset">Start over</button></div>' +
      '<div class="form__ok" id="bok" role="status">Saved on this device. <a href="player.html?p=' + p.id + '">See my page</a></div></form>' +
      '<aside class="build__side"><div class="meter" id="meter"></div><h2 class="fh">My cards and graphics</h2><img id="cardImg" class="cardimg" width="500" height="700" alt="Graphic preview">' + kindChips(p, true) + styleChips(p.cardStyle || 'pin') +
      '<div class="hero__cta"><button type="button" class="btn btn--ink btn--sm" id="cardShare">Share card</button><button type="button" class="btn btn--sm" id="cardSave">Save picture</button></div><p class="fine" id="cardMsg" role="status">The card updates when you save.</p></aside>' +
      '</div></section>';
  };

  P.cards = function () {
    var t = team(qs.get('t')) || D.teams[1];
    document.title = t.name + ' card set | Empire Softball';
    var r = roster(t.id);
    return pageHead('Team <span class="wm">card set</span>', esc(t.name) + '. ' + (r.length ? 'One card for every player. Tap a card to save it, or print the whole set.' : ''), ['team.html?t=' + t.id, t.name],
      r.length ? '<div class="ph__act noprint">' + styleChips('pin') + '<button type="button" class="btn btn--sm" data-print>Print the set</button></div>' : '') +
      '<section class="sec sec--tight"><div class="wrap">' + (r.length ? '<div class="set" id="set">' + r.map(function (p) { return '<button type="button" class="set__c" data-card="' + p.id + '" aria-label="Save the card for ' + esc(p.name) + '"><img width="500" height="700" alt="' + esc(p.name) + ' player card"></button>'; }).join('') + '</div><p class="fine noprint" id="cardMsg" role="status"></p>' +
        '<div class="sec__head noprint" style="margin-top:44px"><h2 class="disp">Team graphics</h2><p>A poster for the fence with a code that opens the roster, and a roster graphic to post. Tap one to save it.</p></div>' +
        '<div class="gfx2 noprint"><button type="button" class="set__c" data-tg="poster" aria-label="Save the team poster"><img id="tgPoster" width="540" height="675" alt="Team poster"></button><button type="button" class="set__c" data-tg="roster" aria-label="Save the roster graphic"><img id="tgRoster" width="540" height="675" alt="Roster graphic"></button></div>' :
        '<div class="empty"><h3>No cards yet</h3><p>Cards appear once this team has player profiles.</p><a class="btn" href="cards.html?t=white-16u-elite">See a finished set</a></div>') + '</div></section>';
  };

  P.compare = function () {
    var ids = (qs.get('ids') ? qs.get('ids').split(',') : shortlist()).slice(0, 4);
    var ps = ids.map(player).filter(Boolean);
    if (ps.length < 2) return pageHead('Compare <span class="wm">players</span>', 'Star two to four players and they line up here side by side.', ['players.html', 'All players']) +
      '<section class="sec sec--tight"><div class="wrap"><div class="empty"><h3>Star at least two players</h3><p>Tap the star on a player, then come back.</p><a class="btn" href="players.html">Go to the player list</a></div></div></section>';
    var rows = [['Class', function (p) { return p.grad; }], ['Positions', function (p) { return p.pos.join(', '); }], ['Bats / Throws', function (p) { return p.bats + ' / ' + p.throws; }], ['GPA', function (p) { return p.hideGpa ? '' : p.gpa; }], ['High school', function (p) { return p.school; }]]
      .concat(MEAS.map(function (m) { return [m[1], function (p) { return p.m[m[0]] ? p.m[m[0]] + (m[2] ? ' ' + m[2] : '') : ''; }]; }))
      .concat(STATS.map(function (x) { return [x[1], function (p) { return (p.stats || {})[x[0]] || ''; }]; }))
      .filter(function (r) { return ps.some(function (p) { return r[1](p) !== ''; }); });
    return pageHead('Compare <span class="wm">players</span>', ps.length + ' players from your list, side by side.', ['players.html', 'All players'], '<div class="ph__act noprint"><button type="button" class="btn btn--sm" data-print>Print this</button></div>') +
      '<section class="sec sec--tight"><div class="wrap">' + (ps.some(function (p) { return p.sampleM; }) ? '<p class="note">Height, velo and speed numbers are samples for this demo.</p>' : '') +
      '<div class="sheetbox" style="margin-top:0"><div class="tblwrap"><table class="tbl cmp"><thead><tr><th></th>' + ps.map(function (p) { return '<th><a href="player.html?p=' + p.id + '"><img src="' + pphoto(p) + '" alt="">' + esc(p.name) + '</a></th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><th scope="row">' + r[0] + '</th>' + ps.map(function (p) { return '<td>' + esc(r[1](p)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></div></div></section>';
  };

  P.news = function () {
    return pageHead('News', 'From the Empire coaches. These posts are drawn from the club\'s Instagram.') + '<section class="sec sec--tight"><div class="wrap"><div class="nws">' + NEWS().map(newsRow).join('') + '</div></div></section>' +
      '<section class="sec sec--soft" id="results"><div class="wrap"><div class="sec__head"><h2 class="disp">Trophy case</h2><p>' + titles() + ' titles and ' + (RESULTS().length - titles()) + ' finals since 2024, from the club\'s own posts.</p></div><div class="trs trs--2">' + RESULTS().map(trophyRow).join('') + '</div></div></section>';
  };

  P.register = function () {
    var F = fee(), mine = regs();
    var sizes = ['Youth M', 'Youth L', 'Adult S', 'Adult M', 'Adult L', 'Adult XL'];
    function pick(id, label, opts, req) { return '<div class="fld"><label for="' + id + '">' + label + '</label><select id="' + id + '"' + (req ? ' required' : '') + '>' + opts.map(function (o) { return '<option' + (o === '' ? ' value=""' : '') + '>' + (o === '' ? 'Choose' : esc(o)) + '</option>'; }).join('') + '</select></div>'; }
    return pageHead('Season <span class="wm">registration</span>', 'For players who have been offered a spot. It takes about five minutes.') +
      '<section class="sec sec--tight"><div class="wrap narrow">' +
      (mine.length ? '<div class="blk mine2"><div class="blk__top"><h2>Registered on this device</h2></div>' + mine.map(function (r) { var owe = r.fee - r.paid; return '<div class="mine2__row"><span><b>' + esc(r.player) + '</b><i>' + esc(team(r.team).name) + ' / receipt ' + r.id + '</i></span><span class="mine2__bal">' + (owe > 0 ? money(owe) + ' left' : 'Paid in full') + '</span>' + (owe > 0 ? '<button type="button" class="btn btn--sm" data-pay="' + r.id + '">Pay ' + money(Math.min(owe, r.each)) + '</button>' : '') + '</div>'; }).join('') + '<p class="fine">Sample checkout: no card is asked for and nothing is charged.</p></div>' : '') +
      '<p class="note">Sample: the fee, the sizes and the agreements below are placeholders the club replaces. Nothing is charged and nothing leaves this device.</p>' +
      '<form class="form cform reg" id="reg" novalidate>' +
      '<div class="steps" id="steps" aria-live="polite"></div>' +

      '<div class="step" data-step="Player">' + field('rPlayer', 'Player full name', 'text', 'required autocomplete="off"') +
      '<div class="two">' + field('rDob', 'Date of birth', 'date', 'required') + field('rGrad', 'Grad year', 'text', 'required inputmode="numeric" placeholder="2029"') + '</div>' +
      '<div class="fld"><label for="rTeam">Team</label><select id="rTeam" required>' + D.teams.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('') + '</select></div>' +
      field('rPos', 'Positions', 'text', 'placeholder="SS, OF"') + field('rSchool', 'School', 'text', '') + '</div>' +

      '<div class="step" data-step="Family">' + field('rParent', 'Parent or guardian name', 'text', 'required autocomplete="name"') +
      '<div class="two">' + field('rEmail', 'Email', 'email', 'required autocomplete="email"') + field('rPhone', 'Cell phone', 'tel', 'required autocomplete="tel"') + '</div>' +
      '<div class="two">' + field('rEmer', 'Emergency contact name', 'text', 'required') + field('rEmerPhone', 'Emergency contact phone', 'tel', 'required') + '</div>' +
      '<div class="fld"><label for="rMed">Allergies or medical notes the coach should know</label><textarea id="rMed"></textarea></div></div>' +

      '<div class="step" data-step="Uniform"><div class="two">' + pick('rJersey', 'Jersey size', [''].concat(sizes), true) + pick('rPants', 'Pants size', [''].concat(sizes), true) + '</div>' +
      '<div class="three">' + field('rN1', 'Number, first choice', 'text', 'required inputmode="numeric" maxlength="2"') + field('rN2', 'Second choice', 'text', 'inputmode="numeric" maxlength="2"') + field('rN3', 'Third choice', 'text', 'inputmode="numeric" maxlength="2"') + '</div>' +
      '<p class="fine">Numbers are given out by the coach. Returning players keep theirs.</p></div>' +

      '<div class="step" data-step="Agreements">' +
      '<label class="check check--box"><input type="checkbox" id="rA1" required> <span><b>Code of conduct.</b> My player and I will follow the club code of conduct for players and parents.</span></label>' +
      '<label class="check check--box"><input type="checkbox" id="rA2" required> <span><b>Medical release.</b> I allow coaches to get emergency care for my player if I cannot be reached.</span></label>' +
      '<label class="check check--box"><input type="checkbox" id="rA3"> <span><b>Photos.</b> The club may use photos of my player on this site and its social pages. Optional.</span></label>' +
      field('rSign', 'Type your full name to sign', 'text', 'required autocomplete="off"') + '</div>' +

      '<div class="step" data-step="Payment"><fieldset class="plans"><legend>Season fee: ' + money(F) + ' ' + sample('Sample fee') + '</legend>' +
      [['full', 'Pay in full', F, 'One payment today'], ['three', 'Three payments', F / 3, 'Today, then two more'], ['six', 'Monthly', F / 6, 'Today, then five monthly payments']].map(function (pl, i) { return '<label class="plan"><input type="radio" name="rPlan" value="' + pl[0] + '" data-each="' + Math.round(pl[2]) + '"' + (i === 1 ? ' checked' : '') + '><span><b>' + pl[1] + '</b><i>' + pl[3] + '</i></span><strong>' + money(pl[2]) + '</strong></label>'; }).join('') + '</fieldset>' +
      '<p class="fine">Sample checkout: no card is asked for and nothing is charged. On the real site this step is the card or bank payment.</p></div>' +

      '<div class="reg__nav"><button type="button" class="btn" id="regBack">Back</button><button type="submit" class="btn btn--ink" id="regNext">Next ' + I.arrow + '</button></div></form>' +
      '<div class="blk blk--gold" id="regDone" hidden></div></div></section>';
  };

  P.commits = function () {
 var c = players().filter(function (p) { return p.college; });
    return pageHead('Com<span class="wm">mitted</span>', 'Empire players who have chosen where they will play in college.') +
      '<section class="sec sec--tight"><div class="wrap"><div class="sec__head"><h2 class="disp">Playing in college</h2><p>Announced by the club.</p></div><div class="cm">' + D.alumni.map(alumRow).join('') + '</div>' +
      '<div class="sec__head" style="margin-top:44px"><h2 class="disp">Current players</h2></div>' + (c.length ? '<div class="cm">' + c.map(function (p) { return '<a class="cm__row" href="player.html?p=' + p.id + '"><img src="' + pphoto(p) + '" alt=""><span class="cm__who"><b>' + esc(p.name) + '</b><i>Class of ' + p.grad + ', ' + esc(p.pos.join(' / ')) + ', ' + esc(p.school) + '</i></span><span class="cm__to"><i>Committed to</i><b>' + esc(p.college) + '</b></span></a>'; }).join('') + '</div>' :
        '<div class="empty"><h3>The wall fills in as players commit</h3><p>When a player adds her college in the profile builder, she shows up here with her commitment graphic ready to post.</p><a class="btn" href="my-profile.html?p=kaitlyn-lozano">Try it in the profile builder</a></div>') +
      '</div></section>' + tryoutCta();
  };

  P.roadmap = function () {
    var steps = [
      ['Freshman year', 'Build the base', ['Start your profile here and add a photo in uniform.', 'Protect your grades. A strong GPA opens more doors than any one tournament.', 'Play more than one position and learn where you help a team most.']],
      ['Sophomore year', 'Get on video', ['Film a skills video: hitting, fielding, throwing and running.', 'Add your real numbers to your profile and keep them current.', 'Make a list of schools that fit you. Think about what you want to study first, softball second.']],
      ['Junior year', 'Be seen', ['Send college coaches your profile link and your showcase schedule before each event.', 'Take the SAT or ACT and add the score to your profile.', 'Visit campuses, and ask your Empire coach to reach out for you.']],
      ['Senior year', 'Decide', ['Narrow your list and talk through each offer with your family.', 'Commit, then add your college to your profile and post your commitment graphic.', 'Thank the coaches who helped you get there.']]
    ];
    return pageHead('Recruiting <span class="wm">road map</span>', 'A plain guide for players and parents: what to work on each year of high school.') +
      '<section class="sec sec--tight"><div class="wrap"><div class="road">' + steps.map(function (st, i) { return '<div class="road__row"><span class="road__n" aria-hidden="true">' + (i + 1) + '</span><div><p class="kicker">' + st[0] + '</p><h2>' + st[1] + '</h2><ul>' + st[2].map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div></div>'; }).join('') + '</div>' +
      '<p class="note">Recruiting rules and contact dates change and differ by division. Ask your Empire coach what applies to you right now.</p>' +
      '<div class="hero__cta"><a class="btn btn--ink" href="my-profile.html">Build my profile ' + I.arrow + '</a><a class="btn" href="schedule.html">See the showcase schedule</a></div></div></section>';
  };

  P.coach = function () {
    var topt = D.teams.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('');
    return pageHead('Coach <span class="wm">desk</span>', 'Where Empire coaches run the site: the top banner, rosters, the schedule and every form that comes in.') +
      '<section class="sec sec--tight"><div class="wrap"><p class="note">Sample: on the real site coaches sign in first. Here anything you change saves on this phone or computer only, so try it.</p>' +
      '<nav class="ql ql--desk" aria-label="Coach tools"><div class="ql__in"><a href="messages.html"><b>Message families</b><span>Texts and emails to the right group</span></a><a href="tryout-night.html"><b>Tryout night</b><span>Check in, score, make offers</span></a><a href="derby.html#coach"><b>Derby day</b><span>Enter home runs, see who owes</span></a><a href="register.html"><b>Registration</b><span>What families fill in</span></a></div></nav><div class="pgrid">' +

      '<div class="blk blk--wide blk--ink" id="inbox"><div class="blk__top"><h2>Inbox</h2><button type="button" class="btn btn--sm" id="inboxClear">Clear inbox</button></div><div id="deskInbox"></div></div>' +

      '<div class="blk blk--wide" id="dues"><div class="blk__top"><h2>Registrations and dues</h2><div class="hero__cta" style="margin:0"><button type="button" class="btn btn--sm" id="regCsv">Download spreadsheet</button><button type="button" class="btn btn--sm" id="regSample">Add sample families</button></div></div><div id="deskRegs"></div>' +
      '<form class="form cform" id="fFee" style="margin-top:16px"><div class="fld" style="max-width:260px"><label for="feeIn">Season fee per player</label><input id="feeIn" inputmode="numeric"></div><div><button class="btn btn--ink btn--sm" type="submit">Save fee</button></div></form></div>' +

      '<div class="blk"><div class="blk__top"><h2>Post news</h2></div><form class="form cform" id="fPost" novalidate>' + field('pTitle', 'Headline', 'text', 'required maxlength="80"') +
      '<div class="fld"><label for="pText">What happened</label><textarea id="pText" required maxlength="500"></textarea></div>' +
      '<div class="fld"><label for="pPhoto">Photo</label><select id="pPhoto"><option value="">No photo</option>' + D.photos.map(function (ph) { return '<option value="' + ph.src + '">' + esc(ph.cap) + '</option>'; }).join('') + '</select></div>' +
      '<div><button class="btn btn--ink btn--sm" type="submit">Post it</button></div></form><div class="dlist" id="deskNews"></div></div>' +

      '<div class="blk"><div class="blk__top"><h2>Post a result</h2></div><form class="form cform" id="fRes" novalidate><div class="fld"><label for="xTeam">Team</label><select id="xTeam">' + topt + '</select></div>' +
      field('xEvent', 'Tournament', 'text', 'required') + '<div class="two"><div class="fld"><label for="xFin">Finish</label><select id="xFin"><option>Champions</option><option>Finalist</option><option>Semifinalist</option><option>Played</option></select></div>' + field('xRec', 'Record', 'text', 'placeholder="5-0"') + '</div>' +
      '<div><button class="btn btn--ink btn--sm" type="submit">Add to the trophy case</button></div></form><div class="dlist" id="deskRes"></div></div>' +

      '<div class="blk"><div class="blk__top"><h2>Top banner</h2></div><form class="form cform" id="fNews"><div class="fld"><label for="news">Message across the top of every page</label><input id="news" maxlength="70" placeholder="Registration and tryout sign-ups are open"></div><div><button class="btn btn--ink btn--sm" type="submit">Post it</button></div></form></div>' +

      '<div class="blk"><div class="blk__top"><h2>Coach\'s take on a player</h2></div><form class="form cform" id="fNote"><div class="fld"><label for="nWho">Player</label><select id="nWho"></select></div>' +
      '<div class="fld"><label for="nTxt">Two or three lines a college coach should read</label><textarea id="nTxt" maxlength="320"></textarea></div><div><button class="btn btn--ink btn--sm" type="submit">Save to her page</button></div></form></div>' +

      '<div class="blk"><div class="blk__top"><h2>Add a player</h2></div><form class="form cform" id="fPlayer" novalidate><div class="fld"><label for="aTeam">Team</label><select id="aTeam">' + topt + '</select></div>' +
      field('aName', 'Player name', 'text', 'required') + '<div class="two">' + field('aGrad', 'Grad year', 'text', 'required inputmode="numeric" placeholder="2029"') + field('aPos', 'Positions', 'text', 'required placeholder="SS, OF"') + '</div>' +
      '<div class="two">' + field('aSchool', 'High school', 'text', '') + field('aGpa', 'GPA', 'text', 'inputmode="decimal"') + '</div>' +
      '<div><button class="btn btn--ink btn--sm" type="submit">Add to the roster</button></div></form><div class="dlist" id="deskPlayers"></div></div>' +

      '<div class="blk"><div class="blk__top"><h2>Add an event</h2></div><form class="form cform" id="fEvent" novalidate>' + field('eName', 'Event name', 'text', 'required') +
      '<div class="two">' + field('eStart', 'First day', 'date', 'required') + field('eEnd', 'Last day', 'date', '') + '</div>' +
      '<div class="two">' + field('ePlace', 'Park or complex', 'text', 'required') + field('eCity', 'City and state', 'text', 'required placeholder="Baldwin, NY"') + '</div>' +
      '<fieldset class="tpick"><legend>Teams playing</legend>' + D.teams.map(function (t) { return '<label class="check"><input type="checkbox" name="eTeam" value="' + t.id + '"> ' + esc(t.name.replace('Empire ', '')) + '</label>'; }).join('') + '</fieldset>' +
      '<label class="check"><input type="checkbox" id="eShow"> College showcase</label>' +
      '<div><button class="btn btn--ink btn--sm" type="submit">Add to the schedule</button></div></form><div class="dlist" id="deskEvents"></div></div>' +

      '</div><p class="mt"><button type="button" class="btn btn--sm" id="deskReset">Undo everything I changed here</button></p></div></section>';
  };

  P.schedule = function () {
    var opts = '<option value="">All teams</option>' + D.teams.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('');
    return pageHead('Where to <span class="wm">watch</span>', 'Every tournament and showcase, by team. College coaches: showcase weekends are marked.') +
      '<section class="sec sec--tight"><div class="wrap">' +
      '<div class="schedbar"><div class="fld"><label for="tf">Show</label><select id="tf">' + opts + '</select></div>' +
      '<label class="check"><input type="checkbox" id="showOnly"> College showcases only</label>' +
      '<button type="button" class="btn btn--sm" id="icsAll">Add these to my calendar</button></div>' +
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
      '<section class="sec"><div class="wrap"><div class="sec__head"><h2 class="disp">More than a team</h2><p>From the club\'s own posts.</p></div><div class="season">' + D.club.program.map(function (x, i) { return '<div class="season__row"><span class="season__n" aria-hidden="true">0' + (i + 1) + '</span><div><h3>' + esc(x[0]) + '</h3></div><p>' + esc(x[1]) + '</p></div>'; }).join('') + '</div>' +
      '<div class="hero__cta"><a class="btn btn--ink" href="derby.html">Home Run Derby pledges</a><a class="btn" href="commits.html">Playing in college</a><a class="btn" href="' + D.club.store + '" target="_blank" rel="noopener">Team store</a></div></div></section>' +
      '<section class="sec sec--soft"><div class="wrap"><div class="sec__head"><h2 class="disp">Coaching staff</h2></div><div class="staff">' +
      coaches.map(function (c) { return staffRow({ name: c.s.name, photo: c.s.photo }, c.teams.join(' and ')); }).join('') + '</div></div></section>' + tryoutCta().replace('class="cta"', 'class="cta cta--flat"');
  };

  P.tryouts = function () {
    var ages = []; D.teams.forEach(function (t) { if (ages.indexOf(t.age) < 0) ages.push(t.age); });
    return pageHead('Try<span class="wm">outs</span>', 'Tell us about your player. A coach from the right age group will reach out about tryout dates and open roster spots.') +
      '<section class="sec sec--tight"><div class="wrap split split--rev"><figure class="frame"><img src="img/photos/gold14-team.webp" loading="lazy" alt="Empire Gold 14u team photo"></figure>' +
      '<form class="form" novalidate><div class="two">' + field('pn', 'Player name', 'text', 'required autocomplete="off"') +
      '<div class="fld"><label for="ag">Age group</label><select id="ag" name="ag">' + ages.reverse().map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="fld"><label for="td">Tryout date</label><select id="td" name="td"><option value="">I am not sure yet</option>' + D.tryoutDates.map(function (d) { return '<option>' + esc(d.label) + '</option>'; }).join('') + '</select><small>Sample dates for this demo.</small></div>' +
      '<div class="two">' + field('gy', 'Grad year', 'text', 'inputmode="numeric" placeholder="2029"') + field('po', 'Positions', 'text', 'placeholder="SS, OF"') + '</div>' +
      field('ct', 'Current team (if any)') +
      '<div class="two">' + field('pa', 'Parent or guardian name', 'text', 'required autocomplete="name"') + field('em', 'Parent email', 'email', 'required autocomplete="email"') + '</div>' +
      field('ph', 'Parent phone', 'tel', 'autocomplete="tel"') +
      '<div class="fld"><label for="ms">Anything we should know</label><textarea id="ms" name="ms"></textarea></div>' +
      '<div><button class="btn btn--ink" type="submit">Send to the coaches ' + I.arrow + '</button></div>' +
      '<div class="form__ok" role="status">This is a sample site, so nothing was sent. On the live site this goes straight to the coach for that age group.</div></form></div></section>' +
      '<section class="sec sec--soft"><div class="wrap narrow"><div class="sec__head"><h2 class="disp">Common questions</h2><p>The tryout answers come from the club\'s posts. ' + sample('Fee answers are samples') + '</p></div><div class="faq">' + D.faq.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') + '</div>' +
      '<p class="mt">Already offered a spot? <a class="more" href="register.html">Register for the season ' + I.arrow + '</a></p></div></section>';
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
  /* feature files (js/x-*.js) register pages in window.EMPIRE_EXT before this script runs */
  var H = { D: D, C: C, qs: qs, page: page, esc: esc, team: team, player: player, players: players, roster: roster, pphoto: pphoto, purl: purl, sget: sget, sset: sset,
    club: club, regs: regs, fee: fee, money: money, EV: EV, upcoming: upcoming, ymd: ymd, MON: MON, MONTH: MONTH, longDate: longDate, I: I, sky: sky,
    pageHead: pageHead, sample: sample, field: field, eventRow: eventRow, staffRow: staffRow, playerCard: playerCard, cardOpts: cardOpts };
  var EXT = window.EMPIRE_EXT || { pages: {}, init: {} };
  Object.keys(EXT.pages || {}).forEach(function (k) { P[k] = function () { return EXT.pages[k](H); }; });
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
      var e = EV().filter(function (x) { return x.id === b.dataset.ics; })[0]; if (!e) return;
      icsFile([e], 'empire-' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.ics'); return;
    }
    var all = ev.target.closest('[data-icsall]');
    if (all) { icsFile(upcoming(EV().filter(function (x) { return x.teams.indexOf(all.dataset.icsall) > -1; })), 'empire-' + all.dataset.icsall + '.ics'); return; }
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

  if (EXT.init && EXT.init[page]) EXT.init[page](H);

  /* search */
  var fd = document.getElementById('findDlg'), fq = document.getElementById('findQ'), fr = document.getElementById('findR');
  var findDraw = function () {
    var q = fq.value.trim().toLowerCase(), out = [];
    if (q) {
      players().forEach(function (p) { if ((p.name + ' ' + p.school + ' ' + p.grad + ' ' + p.pos.join(' ')).toLowerCase().indexOf(q) > -1) out.push(['player.html?p=' + p.id, p.name, 'Player, ' + p.grad + ', ' + p.pos.join(' / ')]); });
      D.teams.forEach(function (t) { if ((t.name + ' ' + t.coach).toLowerCase().indexOf(q) > -1) out.push(['team.html?t=' + t.id, t.name, 'Team, coach ' + t.coach]); });
      EV().forEach(function (e) { if ((e.name + ' ' + e.place + ' ' + e.city).toLowerCase().indexOf(q) > -1) out.push(['schedule.html', e.name, 'Event, ' + e.place + ', ' + e.city]); });
      NAV.concat([['tryouts.html', 'Tryouts'], ['my-profile.html', 'Build my profile'], ['compare.html', 'Compare players'], ['commits.html', 'Committed players'], ['roadmap.html', 'Recruiting road map'], ['coach.html', 'Coach desk'], ['register.html', 'Register for the season'], ['news.html', 'News'], ['family.html', 'My family'], ['derby.html', 'Home Run Derby'], ['sponsor.html', 'Sponsor Empire'], ['messages.html', 'Message families'], ['tryout-night.html', 'Tryout night']]).forEach(function (n) { if (n[1].toLowerCase().indexOf(q) > -1) out.push([n[0], n[1], 'Page']); });
    }
    fr.innerHTML = out.slice(0, 12).map(function (o) { return '<a href="' + o[0] + '"><b>' + esc(o[1]) + '</b><span>' + esc(o[2]) + '</span></a>'; }).join('') || '<p class="mute">' + (q ? 'Nothing found. Try a name, a school, a position or a team.' : 'Type a name, school, position, team or event.') + '</p>';
  };
  document.getElementById('findOpen').addEventListener('click', function () { fd.showModal(); fq.value = ''; findDraw(); fq.focus(); });
  document.getElementById('findX').addEventListener('click', function () { fd.close(); });
  fq.addEventListener('input', findDraw);

  /* demo forms */
  [].forEach.call(document.querySelectorAll('form.form:not(#bform):not(.cform)'), function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = [].filter.call(form.querySelectorAll('[required]'), function (f) { return !f.value.trim() || (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(f.value)); });
      [].forEach.call(form.querySelectorAll('input,textarea'), function (f) { f.classList.remove('bad'); });
      if (bad.length) { bad.forEach(function (f) { f.classList.add('bad'); }); bad[0].focus(); return; }
      var ok = form.querySelector('.form__ok'); ok.classList.add('on');
      var fields = [].map.call(form.querySelectorAll('.fld'), function (d) { return [d.querySelector('label').textContent, d.querySelector('input,select,textarea').value]; }).filter(function (x) { return x[1]; });
      var box = sget('emp_inbox') || [];
      box.unshift({ kind: ({ tryouts: 'Tryout interest', contact: 'Contact form', player: 'College coach request', team: 'Text alert sign-up', sponsor: 'Sponsor inquiry', derby: 'Derby pledge', family: 'Family form' })[page] || 'Form', about: document.querySelector('h1').textContent.trim(), when: new Date().toLocaleString(), fields: fields });
      sset('emp_inbox', box.slice(0, 30));
      if (!ok.querySelector('a')) ok.insertAdjacentHTML('beforeend', ' <a href="coach.html#inbox">See how it lands in the coach desk.</a>');
      form.reset();
    });
  });

  /* player card preview + save, used on the player page and the builder */
  function cardUi(getP) {
    var img = document.getElementById('cardImg'); if (!img || !C) return function () { };
    var style = getP().cardStyle || 'pin', msg = document.getElementById('cardMsg');
    var kind = 'front', kinds = document.getElementById('kinds');
    function draw() { gfx(getP(), kind, style, 0.5).then(function (c) { img.style.aspectRatio = c.width + ' / ' + c.height; img.src = c.toDataURL('image/png'); }); }
    if (kinds) kinds.addEventListener('click', function (e) {
      var b = e.target.closest('[data-kind]'); if (!b) return; kind = b.dataset.kind;
      [].forEach.call(kinds.querySelectorAll('.chip'), function (c) { c.setAttribute('aria-pressed', String(c === b)); }); draw();
    });
    document.getElementById('styles').addEventListener('click', function (e) {
      var b = e.target.closest('[data-style]'); if (!b) return; style = b.dataset.style;
      [].forEach.call(this.querySelectorAll('.chip'), function (c) { c.setAttribute('aria-pressed', String(c === b)); });
      var o = sget('emp_ov') || {}; if (o[getP().id]) { o[getP().id].cardStyle = style; sset('emp_ov', o); }
      draw();
    });
    function out(dl) {
      var p = getP(); msg.textContent = 'Drawing the card.';
      gfx(p, kind, style, 1).then(function (c) { return C.share(c, 'empire-' + p.id + (kind === 'front' ? '' : '-' + kind) + '.png', p.name + ', Empire Softball', dl); })
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
    var state = { grad: qs.get('grad') || '', pos: qs.get('pos') || '', gpa: qs.get('gpa') || '', mine: '', q: '', sort: 'name', view: '' };
    var list = document.getElementById('list'), count = document.getElementById('count'), mineBox = document.getElementById('mine');
    var draw = function () {
      var q = state.q.toLowerCase(), l = shortlist();
      var out = players().filter(function (p) {
        return (!state.grad || String(p.grad) === state.grad) && (!state.pos || p.pos.indexOf(state.pos) > -1) && (!state.gpa || (!p.hideGpa && parseFloat(p.gpa) >= parseFloat(state.gpa))) &&
          (!state.mine || l.indexOf(p.id) > -1) && (!q || (p.name + ' ' + p.school).toLowerCase().indexOf(q) > -1);
      });
      out.sort(function (a, b) { return state.sort === 'gpa' ? parseFloat(b.gpa) - parseFloat(a.gpa) : state.sort === 'grad' ? a.grad - b.grad || a.name.localeCompare(b.name) : a.name.localeCompare(b.name); });
      list.className = state.view ? '' : 'pcs';
      list.innerHTML = (state.view && out.length ? '<div class="sheetbox" style="margin-top:0"><div class="tblwrap"><table class="tbl"><thead><tr><th>Player</th><th>Class</th><th>Pos</th><th>B/T</th><th>GPA</th><th>High school</th><th>Team</th></tr></thead><tbody>' +
        out.map(function (p) { return '<tr><td><a href="player.html?p=' + p.id + '">' + esc(p.name) + '</a></td><td>' + p.grad + '</td><td>' + esc(p.pos.join(', ')) + '</td><td>' + p.bats + '/' + p.throws + '</td><td>' + (p.hideGpa ? '' : esc(p.gpa)) + '</td><td>' + esc(p.school) + '</td><td>' + esc(team(p.team).name.replace('Empire ', '')) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' : out.map(playerCard).join('')) || '<div class="empty"><h3>' + (state.mine ? 'Nobody on your list yet' : 'No players match') + '</h3><p>' + (state.mine ? 'Tap the star on any player to keep her here.' : 'Try clearing a filter.') + '</p></div>';
      count.innerHTML = '<b>' + out.length + '</b> ' + (out.length === 1 ? 'player' : 'players');
      document.getElementById('mineN').textContent = l.length;
      mineBox.hidden = !state.mine || !out.length;
      document.getElementById('mineMail').href = 'mailto:?subject=' + encodeURIComponent('My Empire Softball list') + '&body=' + encodeURIComponent(out.map(function (p) { return p.name + ', ' + p.grad + ', ' + p.pos.join('/') + ', ' + p.school + (notes()[p.id] ? '\nMy note: ' + notes()[p.id] : '') + '\n' + purl(p); }).join('\n\n'));
      [].forEach.call(document.querySelectorAll('.chip[data-f]'), function (c) { c.setAttribute('aria-pressed', String(state[c.dataset.f] === c.dataset.v)); });
    };
    onStar = draw;
    document.getElementById('main').addEventListener('click', function (e) { var c = e.target.closest('.chip[data-f]'); if (!c) return; state[c.dataset.f] = c.dataset.f === 'view' ? c.dataset.v : state[c.dataset.f] === c.dataset.v ? '' : c.dataset.v; draw(); });
    document.getElementById('find').addEventListener('input', function (e) { state.q = e.target.value; draw(); });
    document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; draw(); });
    draw();
  }

  if (page === 'player') {
    var cur = function () { return player(qs.get('p')) || player(D.players[0].id); };
    cardUi(cur);
    var pnBox = document.getElementById('pnote'), pn = document.getElementById('pn');
    var pnShow = function () { pnBox.hidden = shortlist().indexOf(cur().id) < 0; pn.value = notes()[cur().id] || ''; };
    onStar = pnShow; pnShow();
    pn.addEventListener('input', function () { var n = notes(); n[cur().id] = pn.value; sset('emp_notes', n); });
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
          gpa: val('gpa') || player(pid).gpa, major: val('major'), college: val('college'), sat: val('sat'), act: val('act'), ncaa: val('ncaa'), hsCoach: val('hsCoach'),
          stats: (function () { var z = {}; STATS.forEach(function (x) { if (val('s_' + x[0])) z[x[0]] = val('s_' + x[0]); }); return z; })(), honors: val('honors').split(',').map(function (h) { return h.trim(); }).filter(Boolean), hideGpa: document.getElementById('hideGpa').checked, transcript: document.getElementById('transcript').checked, m: m, vid: [val('vid1'), val('vid2')].filter(Boolean), cardStyle: old.cardStyle, photo: newPhoto || old.photo };
        if (!o[pid].photo) delete o[pid].photo;
        sset('emp_ov', o); document.getElementById('bok').classList.add('on'); redraw(); meter();
      });
      var meter = function () {
        var p = player(pid), m = p.m || {};
        var checks = [['Your own photo', !!p.photo], ['About me', !!p.about], ['College status', !!(p.commit || p.college)], ['Your real numbers', !!p.edited && !!(m.ht && m.ev && m.ov && m.h1)], ['Season stats', !!Object.keys(p.stats || {}).length],
          ['Honors', !!(p.honors || []).length], ['A video', !!(p.vid || []).length], ['Test scores', !!(p.sat || p.act)], ['What you want to study', !!p.major], ['High school coach', !!p.hsCoach]];
        var done = checks.filter(function (c) { return c[1]; }).length, left = checks.filter(function (c) { return !c[1]; }).map(function (c) { return c[0]; });
        document.getElementById('meter').innerHTML = '<b>' + done + ' of ' + checks.length + '</b><span>parts of my profile done</span><div class="meter__bar" role="img" aria-label="' + done + ' of ' + checks.length + ' done"><i style="width:' + (done * 10) + '%"></i></div>' + (left.length ? '<p>Still to add: ' + left.join(', ') + '.</p>' : '<p>Everything is filled in.</p>');
      };
      meter();
      document.getElementById('bfill').addEventListener('click', function () {
        var S = { about: 'Sample: I am a vocal leader who loves to compete. I want to play college softball while studying to be a nurse.', commit: 'Uncommitted', major: 'Nursing', sat: '1280', s_avg: '.412', s_obp: '.489', s_hr: '4', s_rbi: '27', s_sb: '11', honors: 'Sample: All-County 2026, Team captain', hsCoach: 'Sample Coach, coach@example.com' };
        Object.keys(S).forEach(function (k) { var f = document.getElementById(k); if (f && !f.value) f.value = S[k]; });
        document.getElementById('cardMsg').textContent = 'Sample answers filled in. Change anything, then save.';
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
      [].forEach.call(this.querySelectorAll('.chip'), function (c) { c.setAttribute('aria-pressed', String(c === b)); }); drawSet(); drawTg();
    });
    var tg = function (kind, scale) {
      var t = team(qs.get('t')) || D.teams[1];
      var o = { style: setStyle, scale: scale, team: { name: t.name, coach: t.coach, photo: t.wide }, url: location.origin + location.pathname.replace(/[^/]*$/, '') + 'team.html?t=' + t.id,
        players: r2.map(function (p) { return { name: p.name, grad: p.grad, pos: p.pos.join('/'), num: p.num }; }) };
      return kind === 'poster' ? C.poster(o) : C.rosterGfx(o);
    };
    var drawTg = function () { tg('poster', 0.5).then(function (c) { document.getElementById('tgPoster').src = c.toDataURL('image/png'); return tg('roster', 0.5); }).then(function (c) { document.getElementById('tgRoster').src = c.toDataURL('image/png'); }); };
    document.querySelector('.gfx2').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tg]'); if (!b) return;
      tg(b.dataset.tg, 1).then(function (c) { return C.share(c, 'empire-' + b.dataset.tg + '.png', 'Empire Softball'); });
    });
    drawTg();
    setEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-card]'); if (!b) return; var p = player(b.dataset.card), msg = document.getElementById('cardMsg');
      msg.textContent = 'Drawing the card.';
      C.render(cardOpts(p, setStyle, 1)).then(function (c) { return C.share(c, 'empire-' + p.id + '.png', p.name + ', Empire Softball'); }).then(function (r) { msg.textContent = r === 'downloaded' ? 'Saved to your downloads.' : ''; });
    });
    drawSet();
  }

  if (page === 'register') {
    var rf = document.getElementById('reg'), stepEls = [].slice.call(rf.querySelectorAll('.step')), at = 0, g = function (id) { return (document.getElementById(id).value || '').trim(); };
    var showStep = function () {
      stepEls.forEach(function (el, i) { el.hidden = i !== at; });
      document.getElementById('steps').innerHTML = '<b>Step ' + (at + 1) + ' of ' + stepEls.length + '</b><span>' + stepEls[at].dataset.step + '</span><div class="meter__bar"><i style="width:' + ((at + 1) / stepEls.length * 100) + '%"></i></div>';
      document.getElementById('regBack').hidden = at === 0;
      document.getElementById('regNext').innerHTML = at === stepEls.length - 1 ? 'Finish and pay ' + money(+rf.querySelector('[name=rPlan]:checked').dataset.each) : 'Next ' + I.arrow;
    };
    rf.addEventListener('change', function (e) { if (e.target.name === 'rPlan') showStep(); });
    document.getElementById('regBack').addEventListener('click', function () { at = Math.max(0, at - 1); showStep(); rf.scrollIntoView(); });
    rf.addEventListener('submit', function (e) {
      e.preventDefault();
      var need = [].filter.call(stepEls[at].querySelectorAll('[required]'), function (f) { return f.type === 'checkbox' ? !f.checked : !f.value.trim() || (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(f.value)); });
      [].forEach.call(rf.querySelectorAll('.bad'), function (f) { f.classList.remove('bad'); });
      if (need.length) { need.forEach(function (f) { (f.type === 'checkbox' ? f.closest('label') : f).classList.add('bad'); }); need[0].focus(); return; }
      if (at < stepEls.length - 1) { at++; showStep(); rf.scrollIntoView(); return; }
      var plan = rf.querySelector('[name=rPlan]:checked'), each = +plan.dataset.each, F = fee(), n = new Date();
      var r = { id: 'E' + String(n.getTime()).slice(-6), when: n.toLocaleDateString(), player: g('rPlayer'), dob: g('rDob'), grad: g('rGrad'), team: g('rTeam'), pos: g('rPos'), school: g('rSchool'), parent: g('rParent'), email: g('rEmail'), phone: g('rPhone'), emer: g('rEmer'), emerPhone: g('rEmerPhone'), med: g('rMed'),
        jersey: g('rJersey'), pants: g('rPants'), nums: [g('rN1'), g('rN2'), g('rN3')].filter(Boolean), photoOk: document.getElementById('rA3').checked, sign: g('rSign'), plan: plan.value, fee: F, each: each, paid: Math.min(each, F) };
      sset('emp_reg', regs().concat([r]));
      rf.hidden = true; var d = document.getElementById('regDone'); d.hidden = false;
      d.innerHTML = '<div class="blk__top"><h2>' + esc(r.player) + ' is registered</h2><span class="tag tag--ink">Receipt ' + r.id + '</span></div>' +
        '<dl class="dl"><div><dt>Team</dt><dd>' + esc(team(r.team).name) + '</dd></div><div><dt>Paid today</dt><dd>' + money(r.paid) + '</dd></div><div><dt>Still to pay</dt><dd>' + money(r.fee - r.paid) + '</dd></div><div><dt>Uniform</dt><dd>Jersey ' + esc(r.jersey) + ', pants ' + esc(r.pants) + ', number ' + esc(r.nums.join(' or ')) + '</dd></div><div><dt>Signed by</dt><dd>' + esc(r.sign) + ', ' + esc(r.when) + '</dd></div></dl>' +
        '<p class="fine" style="color:inherit">Sample checkout: nothing was charged. On the real site the family also gets this by email.</p>' +
        '<div class="hero__cta noprint"><button type="button" class="btn btn--sm" data-print>Print receipt</button><a class="btn btn--sm btn--ink" href="coach.html#dues">See it in the coach desk</a></div>';
      d.scrollIntoView();
    });
    document.getElementById('main').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pay]'); if (!b) return;
      sset('emp_reg', regs().map(function (r) { if (r.id === b.dataset.pay) r.paid = Math.min(r.fee, r.paid + r.each); return r; })); location.reload();
    });
    showStep();
  }

  if (page === 'coach') {
    var $ = function (id) { return document.getElementById(id); };
    var saveClub = function (fn) { var c = club(); fn(c); sset('emp_club', c); deskDraw(); };
    var deskDraw = function () {
      var c = club(), box = sget('emp_inbox') || [];
      $('deskInbox').innerHTML = box.length ? box.map(function (m) { return '<div class="inb"><div class="inb__top"><b>' + esc(m.kind) + '</b><span>' + esc(m.about) + ' / ' + esc(m.when) + '</span></div><dl>' + m.fields.map(function (f) { return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>'; }).join('') + '</dl></div>'; }).join('') :
        '<p>Nothing yet. Fill in the <a href="tryouts.html">tryout form</a>, the <a href="contact.html">contact form</a> or the coach form on any <a href="player.html?p=kaitlyn-lozano#ask">player page</a> and it lands here.</p>';
      $('deskPlayers').innerHTML = (c.players || []).map(function (p) { return '<div><span><b>' + esc(p.name) + '</b> ' + p.grad + ', ' + esc(p.pos.join('/')) + ', ' + esc(team(p.team).name.replace('Empire ', '')) + '</span><a href="player.html?p=' + p.id + '">View</a><button type="button" data-rmp="' + p.id + '">Remove</button></div>'; }).join('');
      $('deskEvents').innerHTML = (c.events || []).map(function (e) { var a = ymd(e.start); return '<div><span><b>' + esc(e.name) + '</b> ' + MON[a.m] + ' ' + a.d + ', ' + esc(e.place) + '</span><a href="schedule.html">View</a><button type="button" data-rme="' + e.id + '">Remove</button></div>'; }).join('');
      $('nWho').innerHTML = players().map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
      $('nTxt').value = (c.notes || {})[$('nWho').value] || '';
      $('news').value = c.banner || '';
      var R = regs(), paid = R.reduce(function (a, r) { return a + r.paid; }, 0), owed = R.reduce(function (a, r) { return a + (r.fee - r.paid); }, 0), sz = {};
      R.forEach(function (r) { sz[r.jersey] = (sz[r.jersey] || 0) + 1; });
      $('deskRegs').innerHTML = '<div class="nums nums--3"><div><b>' + R.length + '</b><span>Registered</span></div><div><b>' + money(paid) + '</b><span>Collected</span></div><div><b>' + money(owed) + '</b><span>Still owed</span></div></div>' +
        (R.length ? '<div class="tblwrap"><table class="tbl"><thead><tr><th>Player</th><th>Team</th><th>Paid</th><th>Owes</th><th>Jersey</th><th>Pants</th><th>No.</th><th>Parent</th><th>Phone</th><th></th></tr></thead><tbody>' +
          R.map(function (r) { var owe = r.fee - r.paid; return '<tr><td>' + esc(r.player) + (r.sample ? ' ' + sample() : '') + '</td><td>' + esc(team(r.team).name.replace('Empire ', '')) + '</td><td>' + money(r.paid) + '</td><td>' + (owe > 0 ? '<b class="owe">' + money(owe) + '</b>' : 'Paid') + '</td><td>' + esc(r.jersey) + '</td><td>' + esc(r.pants) + '</td><td>' + esc(r.nums[0] || '') + '</td><td>' + esc(r.parent) + '</td><td>' + esc(r.phone) + '</td><td class="acts">' + (owe > 0 ? '<button type="button" data-paid="' + r.id + '">Mark paid</button>' : '') + '<button type="button" data-rmr="' + r.id + '">Remove</button></td></tr>'; }).join('') + '</tbody></table></div>' +
          '<p class="fine">Jersey order: ' + Object.keys(sz).map(function (k) { return sz[k] + ' ' + k; }).join(', ') + '.</p>' :
          '<p class="mute">No one has registered on this device yet. Fill in the <a href="register.html">registration form</a>, or add sample families to see how this fills up.</p>');
      $('feeIn').value = fee();
      $('deskNews').innerHTML = (c.news || []).map(function (n) { return '<div><span><b>' + esc(n.title) + '</b></span><a href="news.html">View</a><button type="button" data-rmn="' + n.id + '">Remove</button></div>'; }).join('');
      $('deskRes').innerHTML = (c.results || []).map(function (r) { return '<div><span><b>' + esc(r.finish) + '</b> ' + esc(r.event) + ', ' + esc(team(r.team).name.replace('Empire ', '')) + '</span><button type="button" data-rmx="' + r.id + '">Remove</button></div>'; }).join('');
    };
    var today = function () { var n = new Date(); return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2); };
    $('fFee').addEventListener('submit', function (e) { e.preventDefault(); var v = parseInt($('feeIn').value.replace(/[^0-9]/g, ''), 10); if (v > 0) saveClub(function (c) { c.fee = v; }); });
    $('fPost').addEventListener('submit', function (e) { e.preventDefault(); if (!$('pTitle').value.trim() || !$('pText').value.trim()) return; saveClub(function (c) { c.news = c.news || []; c.news.unshift({ id: 'n' + Date.now().toString(36), date: today(), title: $('pTitle').value.trim(), text: $('pText').value.trim(), photo: $('pPhoto').value }); }); this.reset(); });
    $('fRes').addEventListener('submit', function (e) { e.preventDefault(); if (!$('xEvent').value.trim()) { $('xEvent').focus(); return; } saveClub(function (c) { c.results = c.results || []; c.results.unshift({ id: 'r' + Date.now().toString(36), team: $('xTeam').value, event: $('xEvent').value.trim(), finish: $('xFin').value, record: $('xRec').value.trim() }); }); this.reset(); });
    $('regSample').addEventListener('click', function () {
      var F = fee(), mk = function (i, player, tm, paid, j, pnt, n, parent, phone) { return { id: 'S' + (1041 + i), sample: true, when: today(), player: player, team: tm, fee: F, paid: Math.round(paid * F), each: Math.round(F / 3), plan: 'three', jersey: j, pants: pnt, nums: [n], parent: parent, phone: phone, email: 'family' + i + '@example.com' }; };
      var add = [mk(1, 'Sample Player One', 'black-18u', 1, 'Adult M', 'Adult M', '7', 'Sample Parent', '516-555-0101'), mk(2, 'Sample Player Two', 'gold-14u', 1 / 3, 'Adult S', 'Adult S', '12', 'Sample Parent', '516-555-0102'), mk(3, 'Sample Player Three', 'gold-12u', 2 / 3, 'Youth L', 'Youth L', '3', 'Sample Parent', '516-555-0103'), mk(4, 'Sample Player Four', 'white-13u', 0, 'Adult S', 'Youth L', '21', 'Sample Parent', '516-555-0104')];
      sset('emp_reg', regs().filter(function (r) { return !r.sample; }).concat(add)); deskDraw();
    });
    $('regCsv').addEventListener('click', function () {
      var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
      var rows = [['Player', 'Team', 'Fee', 'Paid', 'Owes', 'Plan', 'Jersey', 'Pants', 'Number choices', 'Parent', 'Email', 'Phone', 'Emergency contact', 'Emergency phone', 'Medical notes', 'Signed by', 'Date', 'Receipt']].concat(regs().map(function (r) { return [r.player, team(r.team).name, r.fee, r.paid, r.fee - r.paid, r.plan, r.jersey, r.pants, (r.nums || []).join(' / '), r.parent, r.email, r.phone, r.emer, r.emerPhone, r.med, r.sign, r.when, r.id]; }));
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv' })); a.download = 'empire-registrations.csv'; document.body.appendChild(a); a.click(); a.remove();
    });
    var need = function (form) { var bad = [].filter.call(form.querySelectorAll('[required]'), function (f) { return !f.value.trim(); }); [].forEach.call(form.querySelectorAll('input'), function (f) { f.classList.remove('bad'); }); bad.forEach(function (f) { f.classList.add('bad'); }); if (bad.length) bad[0].focus(); return !bad.length; };
    $('fNews').addEventListener('submit', function (e) { e.preventDefault(); saveClub(function (c) { c.banner = $('news').value.trim(); }); document.querySelector('.bar').firstChild.textContent = ($('news').value.trim() || 'Registration and tryout sign-ups are open') + ' '; });
    $('nWho').addEventListener('change', function () { $('nTxt').value = (club().notes || {})[$('nWho').value] || ''; });
    $('fNote').addEventListener('submit', function (e) { e.preventDefault(); var who = $('nWho').value, txt = $('nTxt').value.trim(); saveClub(function (c) { c.notes = c.notes || {}; if (txt) c.notes[who] = txt; else delete c.notes[who]; }); $('nWho').value = who; $('nTxt').value = txt; location.href = 'player.html?p=' + who; });
    $('fPlayer').addEventListener('submit', function (e) {
      e.preventDefault(); if (!need(this)) return;
      var name = $('aName').value.trim(), pos = $('aPos').value.toUpperCase().split(/[,\/\s]+/).filter(Boolean);
      saveClub(function (c) { c.players = c.players || []; c.players.push({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36), added: true, name: name, team: $('aTeam').value, pos: pos, school: $('aSchool').value.trim(), grad: parseInt($('aGrad').value, 10) || 2029, gpa: $('aGpa').value.trim(), hideGpa: !$('aGpa').value.trim(), bats: 'R', throws: 'R', m: {} }); });
      this.reset();
    });
    $('fEvent').addEventListener('submit', function (e) {
      e.preventDefault(); if (!need(this)) return;
      var teams = [].map.call(this.querySelectorAll('[name=eTeam]:checked'), function (x) { return x.value; });
      saveClub(function (c) { c.events = c.events || []; c.events.push({ id: 'x' + Date.now().toString(36), added: true, name: $('eName').value.trim(), start: $('eStart').value, end: $('eEnd').value && $('eEnd').value >= $('eStart').value ? $('eEnd').value : $('eStart').value, place: $('ePlace').value.trim(), city: $('eCity').value.trim(), teams: teams.length ? teams : D.teams.map(function (t) { return t.id; }), showcase: $('eShow').checked }); });
      this.reset();
    });
    document.getElementById('main').addEventListener('click', function (e) {
      var a = e.target.closest('[data-rmp]'), b = e.target.closest('[data-rme]');
      if (a) saveClub(function (c) { c.players = (c.players || []).filter(function (p) { return p.id !== a.dataset.rmp; }); });
      if (b) saveClub(function (c) { c.events = (c.events || []).filter(function (x) { return x.id !== b.dataset.rme; }); });
      var n = e.target.closest('[data-rmn]'), x = e.target.closest('[data-rmx]'), pd = e.target.closest('[data-paid]'), rr = e.target.closest('[data-rmr]');
      if (n) saveClub(function (c) { c.news = (c.news || []).filter(function (z) { return z.id !== n.dataset.rmn; }); });
      if (x) saveClub(function (c) { c.results = (c.results || []).filter(function (z) { return z.id !== x.dataset.rmx; }); });
      if (pd) { sset('emp_reg', regs().map(function (r) { if (r.id === pd.dataset.paid) r.paid = r.fee; return r; })); deskDraw(); }
      if (rr) { sset('emp_reg', regs().filter(function (r) { return r.id !== rr.dataset.rmr; })); deskDraw(); }
    });
    $('inboxClear').addEventListener('click', function () { sset('emp_inbox', []); deskDraw(); });
    $('deskReset').addEventListener('click', function () { sset('emp_club', {}); sset('emp_reg', []); location.reload(); });
    deskDraw();
  }

  if (page === 'schedule') {
    var sel = document.getElementById('tf'), box = document.getElementById('sched'), so = document.getElementById('showOnly');
    if (qs.get('t')) sel.value = qs.get('t');
    var drawS = function () {
      var evs = upcoming(EV().filter(function (e) { return (!sel.value || e.teams.indexOf(sel.value) > -1) && (!so.checked || e.showcase); }));
      var html = '', last = '';
      evs.forEach(function (e) { var a = ymd(e.start), k = MONTH[a.m] + ' ' + a.y; if (k !== last) { html += (last ? '</div>' : '') + '<h2 class="month">' + k + '</h2><div class="evs">'; last = k; } html += eventRow(e); });
      box.innerHTML = html ? html + '</div>' : '<div class="empty"><h3>Nothing here yet</h3><p>No events match for this team.</p></div>';
    };
    sel.addEventListener('change', drawS); so.addEventListener('change', drawS); drawS();
    document.getElementById('icsAll').addEventListener('click', function () { icsFile(upcoming(EV().filter(function (e) { return (!sel.value || e.teams.indexOf(sel.value) > -1) && (!so.checked || e.showcase); })), 'empire-schedule.ics'); });
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
