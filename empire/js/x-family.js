/* My family page: one place for a parent. Sample only: picks a player on this device, nothing is sent. Storage key emp_x_family. */
(function () {
  'use strict';
  window.EMPIRE_EXT = window.EMPIRE_EXT || { pages: {}, init: {} };
  var KEY = 'emp_x_family';
  var PLANS = { full: 'Pay in full', three: 'Three payments', six: 'Monthly payments' };

  function state(H) { var s = H.sget(KEY); if (!s || typeof s !== 'object' || Array.isArray(s)) s = {}; if (typeof s.pick !== 'string') s.pick = ''; if (!s.ticks || typeof s.ticks !== 'object') s.ticks = {}; return s; }
  /* this family's own registrations only: the coach desk demo rows (sample:true) stand for other families and are never shown here */
  function own(H) { var r = H.regs(); return (Array.isArray(r) ? r : []).filter(function (x) { return x && !x.sample; }); }
  function todayKey() { var n = new Date(); return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2); }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  /* every player a parent can pick: posted players, plus registrations on this device that have no posted profile */
  function choices(H) {
    var list = H.players().filter(Boolean).map(function (p) { return { key: p.id, name: p.name, team: p.team }; });
    var names = list.map(function (c) { return norm(c.name); });
    own(H).forEach(function (r) {
      if (r.player && names.indexOf(norm(r.player)) < 0) { names.push(norm(r.player)); list.push({ key: 'r:' + r.id, name: r.player, team: r.team, regOnly: true }); }
    });
    return list;
  }

  function who(H, key) {
    var c = choices(H).filter(function (x) { return x.key === key; })[0]; if (!c) return null;
    var p = c.regOnly ? null : H.player(c.key);
    var reg = own(H).filter(function (r) { return c.regOnly ? 'r:' + r.id === c.key : norm(r.player) === norm(c.name); }).pop() || null;
    return { key: c.key, name: c.name, p: p, reg: reg, team: H.team((p && p.team) || (reg && reg.team) || c.team) };
  }

  function nextFirst(H) { var n = new Date(); var d = new Date(n.getFullYear(), n.getMonth() + 1, 1); return H.MONTH[d.getMonth()] + ' 1, ' + d.getFullYear(); }

  function feeBlock(H, w) {
    var r = w.reg;
    if (!r) {
      return '<div class="blk"><div class="blk__top"><h2>Season fee</h2>' + H.sample() + '</div>' +
        '<div class="empty fam-empty"><h3>Not registered yet</h3><p>' + H.esc(w.name) + ' does not have a season registration on this device. The season fee is ' + H.money(H.fee()) + '.</p><a class="btn btn--ink" href="register.html">Register ' + H.I.arrow + '</a></div></div>';
    }
    var total = Number(r.fee) || H.fee(), paid = Math.min(total, Number(r.paid) || 0), each = Number(r.each) || 0;
    var left = Math.max(0, total - paid), pct = total ? Math.round(paid / total * 100) : 0;
    return '<div class="blk"><div class="blk__top"><h2>Season fee</h2>' + H.sample('Sample fee') + '</div>' +
      '<div class="meter__bar" role="img" aria-label="' + pct + ' percent paid"><i style="width:' + pct + '%"></i></div>' +
      '<dl class="dl"><div><dt>Paid</dt><dd>' + H.money(paid) + '</dd></div><div><dt>Left to pay</dt><dd>' + (left ? H.money(left) : 'Nothing. Paid in full.') + '</dd></div>' +
      '<div><dt>Plan</dt><dd>' + H.esc(PLANS[r.plan] || r.plan || 'Not set') + '</dd></div><div><dt>Next payment</dt><dd>' + (left ? H.money(Math.min(left, each || left)) + ' on ' + nextFirst(H) : 'None') + '</dd></div></dl>' +
      (left ? '<p class="mt"><a class="btn btn--sm btn--ink" href="register.html">Make a payment ' + H.I.arrow + '</a></p>' : '') +
      '<p class="fine">Sample: the next payment date is made up (the first of next month). Nothing is ever charged here.</p></div>';
  }

  function formItems(H, w, ticks) {
    var r = w.reg, signed = !!(r && r.sign);
    var items = [
      ['med', 'Medical release', signed, 'Signed at registration'],
      ['conduct', 'Code of conduct', signed, 'Signed at registration'],
      ['photo', 'Photo release', !!(r && r.photoOk), 'Said yes at registration'],
      ['card', 'USSSA player card', false, ''],
      ['birth', 'Birth certificate shown to the coach', false, ''],
      ['sizes', 'Uniform sizes in', !!(r && r.jersey && r.pants), r ? 'Jersey ' + r.jersey + ', pants ' + r.pants : '']
    ];
    return items.map(function (it) { return { k: it[0], label: it[1], fromReg: it[2], how: it[3], done: it[2] || !!ticks[it[0]] }; });
  }

  function formsBlock(H, w, ticks) {
    var items = formItems(H, w, ticks), done = items.filter(function (i) { return i.done; }).length;
    return '<div class="blk"><div class="blk__top"><h2>Forms checklist</h2>' + H.sample() + '</div>' +
      '<div class="fam-count"><b class="disp">' + done + ' of ' + items.length + '</b><span>done</span></div>' +
      '<div class="meter__bar" role="img" aria-label="' + done + ' of ' + items.length + ' done"><i style="width:' + Math.round(done / items.length * 100) + '%"></i></div>' +
      '<div class="fam-list">' + items.map(function (i) {
        return '<label class="check check--box' + (i.fromReg ? ' fam-reg' : '') + '"><input type="checkbox" data-famtick="' + i.k + '"' + (i.done ? ' checked' : '') + (i.fromReg ? ' disabled' : '') + '>' +
          '<span><b>' + H.esc(i.label) + '</b>' + (i.fromReg ? '<i>' + H.esc(i.how) + '</i>' : '<i>Tick this when it is done</i>') + '</span></label>';
      }).join('') + '</div>' +
      '<p class="fine">Ticks are saved on this device only. The birth certificate is only shown to the coach. No date or copy is kept.</p></div>';
  }

  function profileBlock(H, w) {
    var p = w.p, real = p && H.D.players.some(function (x) { return x.id === p.id; });
    if (!p) return '<div class="blk"><div class="blk__top"><h2>Her profile</h2></div><p>' + H.esc(w.name) + ' does not have a recruiting page yet. Her coach adds it after the roster is set.</p></div>';
    var m = p.m || {}, left = [['her own photo', !!p.photo], ['an About me', !!p.about], ['college status', !!(p.commit || p.college)], ['her real numbers', !!p.edited && !!(m.ht && m.ev && m.ov && m.h1)], ['season stats', !!Object.keys(p.stats || {}).length],
      ['honors', !!(p.honors || []).length], ['a video', !!(p.vid || []).length], ['test scores', !!(p.sat || p.act)], ['what she wants to study', !!p.major], ['her high school coach', !!p.hsCoach]].filter(function (c) { return !c[1]; }).map(function (c) { return c[0]; });
    return '<div class="blk"><div class="blk__top"><h2>Her profile</h2></div><div class="fam-pro"><img src="' + H.esc(H.pphoto(p)) + '" width="720" height="900" loading="lazy" alt="' + H.esc(p.name) + '">' +
      '<div><b>' + H.esc(p.name) + '</b><span>' + H.esc((p.pos || []).join(' / ')) + (p.grad ? ', class of ' + H.esc(p.grad) : '') + '</span>' +
      (real ? '<p class="fine">' + (left.length ? (10 - left.length) + ' of 10 parts done. Still to add: ' + H.esc(left.slice(0, 3).join(', ')) + (left.length > 3 ? ' and more' : '') + '.' : 'Every part of her profile is filled in.') + '</p>' : '') + '</div></div>' +
      '<div class="hero__cta"><a class="btn btn--sm" href="player.html?p=' + encodeURIComponent(p.id) + '">Her player page</a>' + (real ? '<a class="btn btn--sm btn--ink" href="my-profile.html?p=' + encodeURIComponent(p.id) + '">Update her profile</a>' : '') + '</div></div>';
  }

  function linksBlock(H, w) {
    var t = w.team, head = t && (t.staff || []).filter(function (s) { return /head/i.test(s.role) && s.email; })[0];
    var msg = head ? 'mailto:' + head.email + '?subject=' + encodeURIComponent('Question from the family of ' + w.name) : 'contact.html';
    return '<nav class="ql ql--desk" aria-label="Quick links"><div class="ql__in">' +
      (t ? '<a href="team.html?t=' + encodeURIComponent(t.id) + '"><b>Team page</b><span>' + H.esc(t.name) + '</span></a>' : '<a href="teams.html"><b>Teams</b><span>All Empire teams</span></a>') +
      '<a href="schedule.html' + (t ? '?t=' + encodeURIComponent(t.id) : '') + '"><b>Schedule</b><span>Every event this season</span></a>' +
      '<a href="' + H.esc(msg) + '"><b>Message the coach</b><span>' + (head ? 'Email ' + H.esc(head.name) : 'Use the contact page') + '</span></a>' +
      '<a href="' + H.esc(H.D.club.store || 'contact.html') + '"' + (H.D.club.store ? ' target="_blank" rel="noopener"' : '') + '><b>Team store</b><span>Club gear</span></a></div></nav>';
  }

  function body(H) {
    var s = state(H), w = s.pick ? who(H, s.pick) : null;
    if (!w) return '<div class="empty"><h3>Pick your player</h3><p>Choose your player above. This device remembers her, so next time the page opens straight to her.</p></div>';
    var t0 = todayKey(), ev = w.team ? H.upcoming(H.EV().filter(function (e) { return e && e.start && e.end >= t0 && (e.teams || []).indexOf(w.team.id) > -1; }))[0] : null;
    var ticks = (s.ticks || {})[w.key] || {};
    return linksBlock(H, w) +
      '<div class="fam-next"><div class="sec__head"><h2 class="disp">Next <span class="wm">game</span></h2>' + (ev && ev.sample !== false ? H.sample('Sample date') : '') + '</div>' +
      (ev ? '<div class="evs">' + H.eventRow(ev, { noTeams: true }) + '</div><p class="mt"><a class="more" href="weekend.html?e=' + encodeURIComponent(ev.id) + '">Open the weekend sheet ' + H.I.arrow + '</a></p>' :
        '<div class="empty"><h3>No games posted yet</h3><p>The coach has not posted an upcoming event for this team yet.</p><a class="btn btn--sm" href="schedule.html">Full schedule</a></div>') + '</div>' +
      '<div class="pgrid mt">' + feeBlock(H, w) + formsBlock(H, w, ticks) + profileBlock(H, w) + '</div>';
  }

  window.EMPIRE_EXT.pages.family = function (H) {
    var s = state(H), list = choices(H);
    var pick = '<div class="fld fam-pick"><label for="famWho">My player</label><select id="famWho"><option value="">Choose your player</option>' +
      list.map(function (c) { return '<option value="' + H.esc(c.key) + '"' + (c.key === s.pick ? ' selected' : '') + '>' + H.esc(c.name) + (H.team(c.team) ? ', ' + H.esc(H.team(c.team).name.replace('Empire ', '')) : '') + '</option>'; }).join('') + '</select></div>';
    return H.pageHead('My <span class="wm">family</span>', 'Next game, season fee, forms and your player, all in one place.', null, pick) +
      '<section class="sec sec--tight"><div class="wrap"><p class="note">Sample: on the real site each family signs in and only sees their own player.</p><div id="famBody">' + body(H) + '</div></div></section>';
  };

  window.EMPIRE_EXT.init.family = function (H) {
    var sel = document.getElementById('famWho'), box = document.getElementById('famBody');
    if (!sel || !box) return;
    sel.addEventListener('change', function () { var s = state(H); s.pick = sel.value; H.sset(KEY, s); box.innerHTML = body(H); });
    box.addEventListener('change', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-famtick'); if (!k) return;
      var s = state(H); s.ticks = s.ticks || {}; var t = s.ticks[s.pick] = s.ticks[s.pick] || {};
      if (e.target.checked) t[k] = true; else delete t[k];
      H.sset(KEY, s); box.innerHTML = body(H);
      var again = box.querySelector('[data-famtick="' + k + '"]'); if (again) again.focus();
    });
  };
})();
