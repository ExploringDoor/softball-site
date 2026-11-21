/* Message families: coach composer for texts and emails (sample, nothing sends) */
(function () {
  window.EMPIRE_EXT = window.EMPIRE_EXT || { pages: {}, init: {} };
  var KEY = 'emp_x_messages';
  var WHO = [['all', 'Everyone'], ['team', 'One team'], ['owe', 'Families who still owe dues'], ['tryout', 'Tryout sign ups']];
  var TPL = [
    ['rain', 'Rainout', 'Rainout today', 'Hi {first}, today\'s {team} games at {event} are rained out. We will text the new time as soon as the tournament sets it. Coach'],
    ['game', 'Game time and place', '{team}: {event}', 'Hi {first}, {team} plays in {event} on {time}. Field: {place}. Please be there 45 minutes early in full uniform. Coach'],
    ['dues', 'Dues reminder', 'Season dues reminder', 'Hi {first}, a friendly reminder that {owed} is still due for {player}\'s season. You can pay on the Register page. Thank you!'],
    ['offer', 'Tryout offer follow up', 'Your Empire tryout', 'Hi {first}, thank you for coming to Empire tryouts. We would love to have {player} on the team. Please reply by Friday so we can hold her spot. Coach'],
    ['derby', 'Home Run Derby reminder', 'Home Run Derby is coming up', 'Hi {first}, the Empire Home Run Derby is coming up. Ask family and friends to pledge per home run for {player}. Every dollar goes to the Empire Athletics Foundation.'],
    ['blank', 'Blank', 'A note from Empire', '']
  ];
  var S = { who: 'all', team: '', tpl: 'game' };

  function first(n) { n = String(n || '').trim(); return /^sample /i.test(n) ? n : (n.split(/\s+/)[0] || 'there'); }
  function tplOf(k) { return TPL.filter(function (t) { return t[0] === k; })[0]; }
  function inboxTryouts(H) {
    return (H.sget('emp_inbox') || []).filter(function (m) { return m.kind === 'Tryout interest'; }).map(function (m) {
      var f = {}; (m.fields || []).forEach(function (x) { f[x[0]] = x[1]; });
      return { parent: f['Parent or guardian name'] || '', email: f['Parent email'] || '', phone: f['Parent phone'] || '', player: f['Player name'] || 'your player', team: '', owed: 0 };
    });
  }
  function list(H) {
    if (S.who === 'tryout') return inboxTryouts(H);
    var r = H.regs().map(function (x) { return { parent: x.parent, email: x.email, phone: x.phone, player: x.player, team: x.team, owed: Math.max(0, (x.fee || 0) - (x.paid || 0)), sample: x.sample }; });
    if (S.who === 'team') r = r.filter(function (x) { return x.team === S.team; });
    if (S.who === 'owe') r = r.filter(function (x) { return x.owed > 0; });
    return r;
  }
  function nextEvent(H, tid) {
    var evs = H.upcoming(H.EV().filter(function (e) { return !tid || (e.teams || []).indexOf(tid) > -1; }));
    return evs[0];
  }
  function fill(H, text, r) {
    var t = r && r.team ? H.team(r.team) : (S.who === 'team' ? H.team(S.team) : null);
    var e = nextEvent(H, t ? t.id : ''), d = e ? new Date(e.start + 'T12:00:00') : null;
    var V = {
      first: first(r && r.parent), team: t ? t.name : 'Empire', player: (r && r.player ? first(r.player) : 'your player'),
      event: e ? e.name : 'our next event', place: e ? [e.place, e.city].filter(Boolean).join(', ') || 'the field' : 'the field',
      time: d ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()] + ', ' + H.MONTH[d.getMonth()] + ' ' + d.getDate() + ', first game 8:00 am' : 'the usual time',
      owed: H.money(r ? r.owed : 0)
    };
    return text.replace(/\{(\w+)\}/g, function (m, k) { return V.hasOwnProperty(k) ? V[k] : m; });
  }
  function whoLabel(H) {
    if (S.who === 'team') { var t = H.team(S.team); return t ? t.name : 'One team'; }
    return WHO.filter(function (w) { return w[0] === S.who; })[0][1];
  }
  function chips(id, arr, cur) {
    return '<div class="chips" id="' + id + '" role="group">' + arr.map(function (a) { return '<button type="button" class="chip" data-v="' + a[0] + '" aria-pressed="' + (a[0] === cur) + '">' + a[1] + '</button>'; }).join('') + '</div>';
  }

  window.EMPIRE_EXT.pages.messages = function (H) {
    var esc = H.esc;
    S.team = H.D.teams[0].id;
    return H.pageHead('Message <span class="wm">families</span>', 'Pick who gets it, pick a message, check how it looks, then send it by text and email.', ['coach.html', 'Coach desk']) +
      '<section class="sec sec--tight"><div class="wrap narrow msg">' +
      '<p class="note">Sample: nothing really sends from this page. Sent messages are listed at the bottom so you can see how it works.</p>' +
      '<div class="blk"><p class="kicker">Step 1</p><div class="blk__top"><h2>Who gets it</h2></div>' + chips('msgWho', WHO, S.who) +
      '<div class="fld msg__team" id="msgTeamWrap" hidden><label for="msgTeam">Which team</label><select id="msgTeam">' + H.D.teams.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('') + '</select></div>' +
      '<div id="msgNone"></div><p class="msg__count" id="msgCount" aria-live="polite"></p><details class="msg__list"><summary>See who is on the list</summary><div id="msgList"></div></details></div>' +
      '<div class="blk mt"><p class="kicker">Step 2</p><div class="blk__top"><h2>Pick a message</h2></div>' + chips('msgTpl', TPL, S.tpl) +
      '<p class="fine">Words in curly brackets fill in for each family: {first}, {player}, {team}, {event}, {place}, {time}, {owed}.</p></div>' +
      '<div class="blk mt"><p class="kicker">Step 3</p><div class="blk__top"><h2>Write and check it</h2></div>' +
      '<form class="form cform" id="msgForm" novalidate><div class="fld"><label for="msgText">Message</label><textarea id="msgText" maxlength="600"></textarea><small id="msgLen"></small></div>' +
      '<div class="msg__pv"><div><p class="kicker">As a text</p><div class="msg__phone"><p class="msg__to" id="msgPhTo"></p><p class="msg__bub" id="msgBub"></p></div></div>' +
      '<div><p class="kicker">As an email</p><div class="msg__mail"><p><b>To</b> <span id="msgMailTo"></span></p><p><b>Subject</b> <span id="msgSubj"></span></p><p class="msg__body" id="msgBody"></p><p class="fine">Empire Softball, ' + esc(H.D.club.region || 'Long Island') + '</p></div></div></div>' +
      '<p class="fine">Texts are kept short. Over 160 letters can arrive as two texts. Game times are sample placeholders.</p>' +
      '<div class="hero__cta"><button type="submit" class="btn btn--ink" id="msgSend">Send to families ' + H.I.arrow + '</button></div><p class="form__err msg__err" id="msgErr" hidden></p></form></div>' +
      '<div class="blk mt" id="msgSentBox"><div class="blk__top"><h2>Sent</h2><button type="button" class="btn btn--sm" id="msgClear">Clear list</button></div>' +
      '<p class="note">Sample: on the real site this goes out by text and email.</p><div id="msgSent"></div></div>' +
      '</div></section>';
  };

  window.EMPIRE_EXT.init.messages = function (H) {
    var esc = H.esc, $ = function (id) { return document.getElementById(id); };
    var txt = $('msgText');
    function setTpl() { var t = tplOf(S.tpl); txt.value = t[3]; }
    function press(box, v) { [].forEach.call($(box).querySelectorAll('.chip'), function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-v') === v)); }); }
    function drawSent() {
      var log = H.sget(KEY); if (!Array.isArray(log)) log = [];
      $('msgSent').innerHTML = log.length ? log.map(function (m) { return '<div class="msg__row"><p><b>' + esc(m.who) + '</b><span class="msg__meta">' + (+m.n || 0) + (+m.n === 1 ? ' family' : ' families') + ', ' + esc(m.when) + '</span></p><p class="msg__body">' + esc(m.text) + '</p></div>'; }).join('') : '<p class="mute">Nothing sent yet.</p>';
    }
    function draw() {
      var r = list(H), f = r[0];
      $('msgTeamWrap').hidden = S.who !== 'team';
      var none = '';
      if (S.who === 'tryout' && !r.length) none = '<p class="note">No tryout sign ups on this device yet. Fill in the tryout interest form and it shows up here.</p><a class="btn btn--sm" href="tryouts.html">Open the tryout form</a>';
      else if (S.who !== 'tryout' && !H.regs().length) none = '<p class="note">No families have registered on this device yet. Add a few sample families to try it.</p><button type="button" class="btn btn--sm" id="msgSample">Add sample families</button>';
      else if (S.who === 'owe' && !r.length) none = '<p class="note">Every registered family is paid in full. Nobody to remind.</p>';
      else if (S.who === 'team' && !r.length) none = '<p class="note">No families registered for this team yet. Pick another team or Everyone.</p>';
      $('msgNone').innerHTML = none;
      $('msgCount').innerHTML = '<b>Reaches ' + r.length + (r.length === 1 ? ' family' : ' families') + '</b>';
      $('msgList').innerHTML = r.length ? '<ul>' + r.map(function (x) { var t = x.team ? H.team(x.team) : null; return '<li>' + esc(x.parent || 'Parent') + ' <span class="mute">for ' + esc(x.player) + (t ? ', ' + esc(t.name) : '') + (x.owed ? ', owes ' + H.money(x.owed) : '') + '</span></li>'; }).join('') + '</ul>' : '<p class="mute">Nobody yet.</p>';
      var body = fill(H, txt.value, f);
      $('msgLen').textContent = body.length + ' letters with names filled in' + (body.length > 160 ? ', may arrive as ' + Math.ceil(body.length / 153) + ' texts' : ', fits in one text');
      $('msgPhTo').textContent = f ? 'To ' + (f.parent || 'Parent') + ', ' + (f.phone || 'no phone') : 'No one picked yet';
      $('msgBub').textContent = body || 'Your message shows here.';
      $('msgMailTo').textContent = f ? (f.parent || 'Parent') + ', ' + (f.email || 'no email') : 'No one picked yet';
      $('msgSubj').textContent = fill(H, tplOf(S.tpl)[2], f);
      $('msgBody').textContent = body || 'Your message shows here.';
    }
    function addSample() {
      var F = H.fee(), tm = ['white-16u-elite', 'gold-14u', 'black-18u', 'gold-12u', 'white-16u-elite', 'white-13u'], paid = [1, 1 / 3, 0, 2 / 3, 1, 0];
      var add = tm.map(function (t, i) { var n = i + 1; return { id: 'M' + (2100 + n), sample: true, player: 'Sample Player ' + n, team: t, fee: F, paid: Math.round(paid[i] * F), each: Math.round(F / 3), plan: 'three', jersey: 'Adult S', pants: 'Adult S', nums: [String(n + 10)], parent: 'Sample Family ' + n, email: 'family' + n + '@example.com', phone: '516-555-01' + ('0' + (n + 10)).slice(-2), emer: 'Sample Contact ' + n, emerPhone: '516-555-01' + (n + 40), med: '', sign: 'Sample Family ' + n, when: new Date().toLocaleDateString() }; });
      H.sset('emp_reg', H.regs().filter(function (r) { return !r.sample; }).concat(add)); draw();
    }
    $('msgWho').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; S.who = b.getAttribute('data-v'); press('msgWho', S.who); if (S.who === 'tryout' && S.tpl === 'game') { S.tpl = 'offer'; press('msgTpl', S.tpl); setTpl(); } if (S.who === 'owe' && S.tpl === 'game') { S.tpl = 'dues'; press('msgTpl', S.tpl); setTpl(); } draw(); });
    $('msgTeam').addEventListener('change', function () { S.team = this.value; draw(); });
    $('msgTpl').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; S.tpl = b.getAttribute('data-v'); press('msgTpl', S.tpl); setTpl(); draw(); if (S.tpl === 'blank') txt.focus(); });
    $('msgNone').addEventListener('click', function (e) { if (e.target.closest('#msgSample')) addSample(); });
    txt.addEventListener('input', draw);
    $('msgForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var r = list(H), err = $('msgErr');
      err.hidden = true;
      if (!r.length) { err.textContent = 'No families on this list yet. Pick another group or add sample families.'; err.hidden = false; return; }
      if (!txt.value.trim()) { err.textContent = 'Write a message first.'; err.hidden = false; txt.focus(); return; }
      var log = H.sget(KEY); if (!Array.isArray(log)) log = [];
      log.unshift({ who: whoLabel(H), n: r.length, when: new Date().toLocaleString(), text: txt.value.trim() });
      H.sset(KEY, log.slice(0, 20)); drawSent();
      $('msgSentBox').scrollIntoView();
    });
    $('msgClear').addEventListener('click', function () { H.sset(KEY, []); drawSent(); });
    setTpl(); draw(); drawSent();
  };
})();
