/* Game day weekend sheet: weekend.html?e=EVENTID. Everything below about times, jerseys and fields is SAMPLE. Static, no timers. */
(function () {
  'use strict';
  window.EMPIRE_EXT = window.EMPIRE_EXT || { pages: {}, init: {} };

  var KEY = 'emp_x_weekend';
  var BASE = ['Both jerseys and pants', 'Belt, socks and visor', 'Glove, bat and helmet', 'Cleats and turf shoes', 'Water jug with her name on it', 'Sunscreen', 'Healthy snacks and lunch', 'Folding chair for the family', 'Cash for the gate'];
  var HOTEL = ['Hotel confirmation', 'Pool bag and flip flops', 'Phone charger'];
  /* SAMPLE weekend details. The coach desk would fill these in for real. */
  var W = {
    e1: { arrive: '7:30 AM', first: '8:30 AM', jersey: ['Black', 'White'], field: 1, gate: '$10 per adult for the weekend. Kids under 12 free.', park: 'Free lot off Grand Ave. Fills up by 9 AM on Saturday.' },
    e2: { arrive: '7:15 AM', first: '8:15 AM', jersey: ['White', 'Black'], field: 3, gate: '$10 per adult per day.', park: 'Use Field 6 lot by the aquatic center. Free.' },
    e3: { arrive: '7:00 AM', first: '8:00 AM', jersey: ['Black', 'White', 'Gold'], field: 2, gate: '$15 per adult for the weekend. Wristband at the front gate.', park: 'Free parking on site. Carpool if you can.', hotel: 'Team block at a sample hotel in Flemington, about 15 minutes from the fields. Book through the team mom by May 1.' },
    e4: { arrive: '7:30 AM', first: '8:30 AM', jersey: ['White', 'Black', 'White'], field: 5, gate: '$20 per adult for the showcase weekend.', park: 'Free parking on site. Golf carts are not allowed.', hotel: 'Team block at a sample hotel in Flemington, about 15 minutes away. Book by June 1.' },
    e5: { arrive: '7:45 AM', first: '8:45 AM', jersey: ['Gold', 'Black'], field: 2, gate: '$10 per adult for the weekend.', park: 'Free lot off Grand Ave.' },
    e6: { arrive: '7:00 AM', first: '8:00 AM', jersey: ['White', 'Black', 'Gold', 'White'], field: 4, gate: 'Gate wristband is included in the team fee. Grandparents pay $10 per day.', park: '$10 per car per day in the main lot. Bring cash.', hotel: 'Team block at a sample hotel in Aberdeen, about 10 minutes away. Book through the team mom by June 10.' },
    e7: { arrive: '7:30 AM', first: '8:30 AM', jersey: ['Black', 'White', 'Gold', 'Black'], field: 1, gate: '$10 per adult per day.', park: 'Use the Field 6 lot by the aquatic center. Free.' }
  };
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function days(H, e) {
    var a = H.ymd(e.start), b = H.ymd(e.end), out = [];
    var d = new Date(a.y, a.m, a.d), end = new Date(b.y, b.m, b.d);
    while (d <= end && out.length < 7) { out.push(DAYS[d.getDay()] + ', ' + H.MON[d.getMonth()] + ' ' + d.getDate()); d.setDate(d.getDate() + 1); }
    return out;
  }
  function getEvent(H) {
    var all = H.EV(), id = H.qs.get('e');
    return all.filter(function (x) { return x.id === id; })[0] || H.upcoming(all)[0];
  }
  function teamsOf(H, e) { return (e.teams || []).filter(function (id) { return !!H.team(id); }); }
  function pickTeam(H, e) {
    var t = H.qs.get('t'), list = teamsOf(H, e);
    return list.indexOf(t) > -1 ? t : list[0];
  }
  function info(e) { return W[e.id] || { arrive: 'Ask your coach', first: 'Ask your coach', jersey: [], field: 0, gate: 'Ask your coach.', park: 'Ask your coach.' }; }
  function bringList(e) { return BASE.concat(info(e).hotel ? HOTEL : []); }
  function store(H) { var all = H.sget(KEY); return all && typeof all === 'object' && !Array.isArray(all) ? all : {}; }
  function ticks(H, eid) { var m = store(H)[eid]; return m && typeof m === 'object' ? m : {}; }
  var COLORS = ['Black', 'White', 'Gold'];

  function teamPart(H, e, tid) {
    var t = H.team(tid);
    if (!t) return '<div class="blk"><p>No Empire teams are listed for this event yet. Ask your coach.</p></div>';
    var w = info(e), real = !!W[e.id], idx = Math.max(0, (e.teams || []).indexOf(tid)), dl = days(H, e);
    var head = (t.staff || []).filter(function (s) { return /head/i.test(s.role); })[0] || { name: t.coach, role: 'Head Coach' };
    var jer = dl.map(function (d, i) {
      var c = w.jersey[i] || w.jersey[w.jersey.length - 1] || 'Ask your coach';
      return '<li><span>' + H.esc(d) + '</span><b>' + (COLORS.indexOf(c) > -1 ? '<i class="sw sw--' + c + '" aria-hidden="true"></i>' : '') + H.esc(c) + '</b></li>';
    }).join('');
    var tk = ticks(H, e.id), list = bringList(e);
    var done = list.filter(function (x, i) { return tk[i]; }).length;
    return '<div class="pgrid">' +
      '<div class="blk blk--wide"><div class="blk__top"><h2>' + H.esc(t.name) + '</h2>' + (real ? H.sample('Sample times') : '') + '</div>' +
      '<div class="nums nums--3"><div><b>' + H.esc(w.arrive) + '</b><span>Arrive by</span></div><div><b>' + H.esc(w.first) + '</b><span>First pitch</span></div><div><b>' + (w.field ? 'Field ' + (w.field + idx) : 'TBA') + '</b><span>First game</span></div></div>' +
      '<p class="fine">Times are for the first day. The coach posts the rest of the weekend in the team chat after pool play.</p></div>' +
      '<div class="blk"><div class="blk__top"><h2>Jersey each day</h2>' + (real ? H.sample() : '') + '</div><ul class="wk-jer">' + jer + '</ul></div>' +
      '<div class="blk"><div class="blk__top"><h2>Head coach</h2></div><div class="staff">' + H.staffRow(head, 'Head coach, ' + t.name.replace('Empire ', '')) + '</div>' +
      (head.phone || head.email ? '' : '<p class="fine">Questions about the weekend? <a href="contact.html">Send the club a message</a> and it goes to the coach.</p>') + '</div>' +
      '<div class="blk blk--wide"><div class="blk__top"><h2>Bring</h2><span class="tag" id="wkCount">' + done + ' of ' + list.length + ' packed</span></div>' +
      '<div class="wk-bring">' + list.map(function (x, i) {
        return '<label class="check check--box"><input type="checkbox" data-wk="' + i + '"' + (tk[i] ? ' checked' : '') + '> <span>' + H.esc(x) + '</span></label>';
      }).join('') + '</div><p class="fine">Your ticks save on this phone for this event only.</p>' +
      '<p class="mt"><button type="button" class="btn btn--sm" id="wkClear">Clear my ticks</button></p></div>' +
      '</div>';
  }

  window.EMPIRE_EXT.pages.weekend = function (H) {
    var e = getEvent(H);
    if (!e) return H.pageHead('Weekend <span class="wm">sheet</span>', 'No events on the schedule yet.', ['schedule.html', 'Where to watch']);
    var w = info(e), a = H.ymd(e.start), b = H.ymd(e.end), tid = pickTeam(H, e);
    var when = e.start === e.end ? H.longDate(e.start) : H.MONTH[a.m] + ' ' + a.d + ' to ' + (a.m === b.m ? '' : H.MONTH[b.m] + ' ') + b.d + ', ' + b.y;
    var map = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.place + ' ' + e.city);
    var chips = teamsOf(H, e).map(function (id) {
      var t = H.team(id); if (!t) return '';
      return '<button type="button" class="chip" data-wkteam="' + H.esc(id) + '" aria-pressed="' + (id === tid) + '"><i class="sw sw--' + H.esc(t.color) + '" aria-hidden="true"></i>' + H.esc(t.name.replace('Empire ', '')) + '</button>';
    }).join('');
    return H.pageHead(H.esc(e.name), H.esc(when) + '<br>' + H.esc(e.place) + ', ' + H.esc(e.city) + (e.sample ? ' ' + H.sample('Sample event') : ''), ['schedule.html', 'Where to watch'],
      '<div class="ph__act wk-act"><a class="btn btn--ink" href="' + map + '" target="_blank" rel="noopener">Directions ' + H.I.arrow + '</a>' +
      '<button type="button" class="btn" data-ics="' + H.esc(e.id) + '">Add to my calendar</button>' +
      '<button type="button" class="btn" id="wkShare">Share with my family</button></div><p class="fine" id="wkShareMsg" role="status"></p>') +
      '<section class="sec sec--tight"><div class="wrap">' +
      '<p class="kicker">Pick your team</p><div class="chips wk-chips" role="group" aria-label="Pick your team">' + chips + '</div>' +
      '<div id="wkTeam" class="mt">' + teamPart(H, e, tid) + '</div>' +
      '<div class="pgrid mt">' +
      '<div class="blk"><div class="blk__top"><h2>Gate and parking</h2>' + (W[e.id] ? H.sample() : '') + '</div><dl class="wk-dl"><div><dt>Gate fee</dt><dd>' + H.esc(w.gate) + '</dd></div><div><dt>Parking</dt><dd>' + H.esc(w.park) + '</dd></div></dl></div>' +
      '<div class="blk blk--gold"><div class="blk__top"><h2>Weather</h2></div><p><b>Check the forecast the night before.</b></p><p class="fine wk-ink">If storms roll in, the coach sends the new start time in the team chat. Stay off the field until the coach says it is safe.</p></div>' +
      (w.hotel ? '<div class="blk blk--wide blk--ink"><div class="blk__top"><h2>Hotel</h2>' + H.sample() + '</div><p>' + H.esc(w.hotel) + '</p><p class="fine wk-onink">This is an overnight trip. Plan to leave the night before so she is rested for first pitch.</p></div>' : '') +
      '</div></div></section>';
  };

  window.EMPIRE_EXT.init.weekend = function (H) {
    var e = getEvent(H); if (!e) return;
    try { document.title = e.name + ' weekend sheet | Empire Softball'; } catch (x) { }
    var box = document.getElementById('wkTeam'), msg = document.getElementById('wkShareMsg');
    function pageUrl(tid) { return location.origin + location.pathname + '?e=' + encodeURIComponent(e.id) + '&t=' + encodeURIComponent(tid); }
    var cur = pickTeam(H, e);

    document.addEventListener('click', function (ev) {
      var c = ev.target.closest('[data-wkteam]');
      if (c) {
        cur = c.getAttribute('data-wkteam');
        [].forEach.call(document.querySelectorAll('[data-wkteam]'), function (b) { b.setAttribute('aria-pressed', String(b === c)); });
        if (box) box.innerHTML = teamPart(H, e, cur);
        try { history.replaceState(null, '', pageUrl(cur)); } catch (x) { }
        return;
      }
      if (ev.target.closest('#wkClear')) {
        var all = store(H); delete all[e.id]; H.sset(KEY, all);
        if (box) box.innerHTML = teamPart(H, e, cur); return;
      }
      if (ev.target.closest('#wkShare')) {
        var url = pageUrl(cur), title = 'Empire Softball: ' + e.name;
        var ok = function () { if (msg) msg.textContent = 'Link copied. Paste it in your family group text.'; };
        var copy = function () {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, function () { fallback(url); ok(); });
          else { fallback(url); ok(); }
        };
        if (navigator.share) {
          navigator.share({ title: title, text: 'Our weekend sheet for ' + e.name, url: url }).catch(function (er) { if (!er || er.name !== 'AbortError') copy(); });
          return;
        }
        copy();
      }
    });
    function fallback(url) {
      var t = document.createElement('textarea'); t.value = url; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (x) { } t.remove();
    }
    document.addEventListener('change', function (ev) {
      var cb = ev.target.closest('[data-wk]'); if (!cb) return;
      var all = store(H), mine = ticks(H, e.id);
      if (cb.checked) mine[cb.getAttribute('data-wk')] = true; else delete mine[cb.getAttribute('data-wk')];
      all[e.id] = mine; H.sset(KEY, all);
      var len = bringList(e).length, n = document.getElementById('wkCount');
      if (n) n.textContent = Object.keys(mine).filter(function (k) { return +k < len; }).length + ' of ' + len + ' packed';
    });
  };
})();
