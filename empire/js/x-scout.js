/* Scout sheet for college coaches: one showcase weekend, every Empire player there, with a QR code to her page.
   Reads emp_list (starred players) only. Writes nothing. Static: no timers, nothing moves. */
(function () {
  'use strict';
  window.EMPIRE_EXT = window.EMPIRE_EXT || { pages: {}, init: {} };

  var MEAS = { ht: ['Height', ''], ev: ['Exit velo', ' mph'], ov: ['Overhand velo', ' mph'], h1: ['Home to first', ' sec'], pop: ['Pop time', ' sec'], pv: ['Pitch velo', ' mph'] };

  function shows(H) { return H.upcoming(H.EV().filter(function (e) { return e.showcase; })); }
  function pickEvent(H) {
    var list = shows(H), id = H.qs.get('e');
    return list.filter(function (e) { return e.id === id; })[0] || list[0] || null;
  }
  function dates(H, e) {
    var end = e.end || e.start, a = H.ymd(e.start), b = H.ymd(end);
    if (e.start === end) return H.longDate(e.start);
    if (a.y !== b.y) return H.longDate(e.start) + ' to ' + H.longDate(end);
    return H.MONTH[a.m] + ' ' + a.d + (a.m === b.m ? '' : ' to ' + H.MONTH[b.m]) + (a.m === b.m ? ' to ' : ' ') + b.d + ', ' + b.y;
  }
  function pageUrl(e) { return location.origin + location.pathname + '?e=' + encodeURIComponent(e.id); }

  /* two numbers a coach looks at first, picked by position */
  function topTwo(p) {
    var m = p.m || {}, pos = p.pos || [], order = [];
    if (pos.indexOf('P') > -1) order.push('pv');
    if (pos.indexOf('C') > -1) order.push('pop');
    order = order.concat(['ev', 'h1', 'ov', 'ht']);
    return order.filter(function (k, i) { return m[k] && order.indexOf(k) === i; }).slice(0, 2).map(function (k) { return [MEAS[k][0], m[k] + MEAS[k][1]]; });
  }
  function qr(url) {
    if (!window.qrcode) return '';
    try { var q = window.qrcode(0, 'M'); q.addData(url); q.make(); return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }); } catch (err) { return ''; }
  }
  /* same star the rest of the site uses; site.js handles the click and saves emp_list */
  function starBtn(H, p, list) {
    var on = list.indexOf(p.id) > -1;
    return '<button type="button" class="star sc__star" data-star="' + H.esc(p.id) + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Remove ' : 'Save ') + H.esc(p.name) + (on ? ' from my list' : ' to my list') + '">' + H.I.star + '</button>';
  }
  function numVal(p) { var n = parseInt(p.num, 10); return isNaN(n) ? 999 : n; }
  function sorted(list) {
    return list.slice().sort(function (a, b) { return ((parseInt(a.grad, 10) || 9999) - (parseInt(b.grad, 10) || 9999)) || (numVal(a) - numVal(b)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
  }

  function row(H, p, list) {
    var e = H.esc, mm = topTwo(p), url = H.purl(p), qrSvg = qr(url);
    var facts = [];
    if (p.grad) facts.push('Class of ' + p.grad);
    if ((p.pos || []).length) facts.push(p.pos.join(' / '));
    if (p.bats || p.throws) facts.push('Bats ' + (p.bats || 'R') + ', throws ' + (p.throws || 'R'));
    if (!p.hideGpa && p.gpa) facts.push(p.gpa + ' GPA');
    return '<article class="sc">' +
      '<div class="sc__side"><div class="sc__num">' + (p.num ? '<span class="sc__vh">Jersey number </span>#' + e(p.num) : '<i>No #</i>') + '</div>' + starBtn(H, p, list) + '</div>' +
      '<div class="sc__body"><h3><a href="player.html?p=' + e(p.id) + '">' + e(p.name) + '</a></h3>' +
      '<p class="sc__facts">' + facts.map(e).join('<span aria-hidden="true">, </span>') + '</p>' +
      (p.school ? '<p class="sc__sch">' + e(p.school) + '</p>' : '') +
      (mm.length ? '<p class="sc__m">' + mm.map(function (x) { return '<span><i>' + e(x[0]) + '</i> <b>' + e(x[1]) + '</b></span>'; }).join('') + (p.sampleM ? ' ' + H.sample('Sample numbers') : '') + '</p>' : '') +
      (p.honors && p.honors.length ? '<p class="sc__hon">' + e(p.honors[0]) + '</p>' : '') +
      (p.college ? '<p class="sc__hon"><span class="tag tag--gold">' + e(p.commit || 'Committed') + ': ' + e(p.college) + '</span></p>' : p.commit ? '<p class="sc__hon"><span class="tag tag--gold">' + e(p.commit) + '</span></p>' : '') +
      '<a class="sc__go noprint" href="player.html?p=' + e(p.id) + '">Full profile ' + H.I.arrow + '</a></div>' +
      (qrSvg ? '<div class="sc__qr"><span class="sc__code" role="img" aria-label="QR code to the page for ' + e(p.name) + '">' + qrSvg + '</span><span>Scan for her page</span></div>' : '') +
      '</article>';
  }

  function coachLine(H, t) {
    var hc = (t.staff || []).filter(function (s) { return /head/i.test(s.role); })[0];
    if (!hc) return '<p class="sc__coach">Head coach <b>' + H.esc(t.coach) + '</b>. Reach the club through the <a href="contact.html">contact page</a>.</p>';
    return '<p class="sc__coach">Head coach <b>' + H.esc(hc.name) + '</b>' +
      (hc.phone ? '<a href="tel:' + hc.phone.replace(/\D/g, '') + '">' + H.esc(hc.phone) + '</a>' : '') +
      (hc.email ? '<a href="mailto:' + H.esc(hc.email) + '">' + H.esc(hc.email) + '</a>' : '') + '</p>';
  }

  function listHtml(H, e, starredOnly) {
    var star = H.sget('emp_list'), shown = 0, empty = [];
    if (!Array.isArray(star)) star = [];
    var groups = (e.teams || []).map(function (tid) {
      var t = H.team(tid); if (!t) return '';
      var all = H.roster(tid);
      if (!all.length) { empty.push(t.name); return ''; }
      var list = sorted(all.filter(function (p) { return !starredOnly || star.indexOf(p.id) > -1; }));
      if (!list.length) return '';
      shown += list.length;
      return '<section class="sc__team"><div class="sc__th"><h2 class="disp">' + H.esc(t.name) + '</h2><span class="tag">' + list.length + ' player' + (list.length === 1 ? '' : 's') + '</span></div>' +
        coachLine(H, t) + '<div class="sc__grid">' + list.map(function (p) { return row(H, p, star); }).join('') + '</div></section>';
    }).join('');
    var none = starredOnly && !shown ? '<div class="empty"><h3>No starred players here</h3><p>Tap the star on any player to add her to your list, then come back. Your list stays on this device.</p><a class="btn btn--sm" href="players.html">See all players</a></div>' : '';
    var emptyLine = empty.length ? '<p class="sc__none">No roster posted yet: ' + empty.map(H.esc).join(', ') + '.</p>' : '';
    return none + groups + emptyLine;
  }

  window.EMPIRE_EXT.pages.scout = function (H) {
    var e = pickEvent(H), esc = H.esc;
    if (!e) return H.pageHead('Scout <span class="wm">sheet</span>', 'No college showcases are on the schedule right now.', ['schedule.html', 'Where to watch']) +
      '<section class="sec sec--tight"><div class="wrap"><div class="empty"><h3>Nothing to show yet</h3><p>Showcase weekends appear here once the club adds them.</p><a class="btn btn--sm" href="schedule.html">Full schedule</a></div></div></section>';
    var opts = shows(H).map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === e.id ? ' selected' : '') + '>' + esc(x.name) + ', ' + H.MON[H.ymd(x.start).m] + ' ' + H.ymd(x.start).d + '</option>'; }).join('');
    var sub = '<b>' + esc(dates(H, e)) + '</b>' + (e.sample ? ' ' + H.sample('Sample dates') : '') + '<br>' + esc([e.place, e.city].filter(Boolean).join(', '));
    return H.pageHead('Scout <span class="wm">sheet</span>', sub, ['schedule.html', 'Where to watch'], '<p class="sc__ev disp">' + esc(e.name) + '</p>') +
      '<section class="sec sec--tight"><div class="wrap">' +
      '<div class="sc__bar noprint"><div class="fld"><label for="scEv">Showcase</label><select id="scEv">' + opts + '</select></div>' +
      '<label class="check"><input type="checkbox" id="scStar"> Starred players only</label>' +
      '<div class="sc__btns"><button type="button" class="btn btn--sm btn--ink" id="scPrint">Print this sheet</button>' +
      '<a class="btn btn--sm" id="scText" href="#">Text this link to a coach</a></div></div>' +
      '<p class="note">For college coaches. Every Empire player at this showcase, youngest class last. Scan a code to open her full page. Contact goes through her head coach.</p>' +
      '<div id="scList">' + listHtml(H, e, false) + '</div></div></section>';
  };

  window.EMPIRE_EXT.init.scout = function (H) {
    var e = pickEvent(H); if (!e) return;
    var box = document.getElementById('scList'), star = document.getElementById('scStar');
    var txt = document.getElementById('scText');
    txt.href = 'sms:?&body=' + encodeURIComponent('Empire Softball scout sheet for ' + e.name + ': ' + pageUrl(e));
    star.addEventListener('change', function () { box.innerHTML = listHtml(H, e, star.checked); });
    /* site.js saves the star first (its listener was added earlier); redraw so the starred view stays true */
    document.addEventListener('click', function (ev) { if (star.checked && ev.target.closest('#scList [data-star]')) box.innerHTML = listHtml(H, e, true); });
    document.getElementById('scPrint').addEventListener('click', function () { window.print(); });
    document.getElementById('scEv').addEventListener('change', function () { location.href = 'scout.html?e=' + encodeURIComponent(this.value); });
  };
})();
