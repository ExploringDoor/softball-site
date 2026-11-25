// DVSL makeup tracker (Rules 11-12), browser copy. window.DVSLMakeups.
// PARITY: generated from the top half of api/_lib/makeups.js (read its header
// for the rules) by lockdown-workspace/features2-tests/makeup-gen-browser.py.
// Change the server file, regenerate; makeup-parity.test.mjs fails on drift.
(function (root) {
  'use strict';
  const TZ = 'America/New_York';
  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;
  const PICK_WITHIN_MS = 48 * HOUR;
  const PLAY_WITHIN_DAYS = 21;
  const DEFAULT_TIME = '18:00';

  const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

  let fmtET = null; // one formatter: building one per call is slow on phones
  function partsET(ms) {
    const f = fmtET || (fmtET = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    }));
    const o = {};
    for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second, wd: o.weekday };
  }

  // Minutes New York is ahead of UTC at this instant (-240 in summer, -300 in winter).
  function offsetMinutesET(ms) {
    const p = partsET(ms);
    const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  }

  // "2026-07-06" + "18:15" New York wall clock -> epoch ms.
  function etToMs(ymd, hhmm) {
    const m = YMD.exec(String(ymd || ''));
    const t = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
    if (!m || !t) return NaN;
    const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
    let ms = guess - offsetMinutesET(guess) * 60000;
    const off2 = offsetMinutesET(ms);
    if (guess - off2 * 60000 !== ms) ms = guess - off2 * 60000;
    return ms;
  }

  function ymdET(ms) {
    const p = partsET(ms);
    return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }

  function addDaysYmd(ymd, n) {
    const m = YMD.exec(String(ymd || ''));
    if (!m) return '';
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n, 12));
    return d.toISOString().slice(0, 10);
  }

  // "18:15", "6:15 PM", "6 pm" -> "HH:MM" (24h) or ''.
  function time24(g) {
    const t = String((g && g.time_24) || '').trim();
    if (/^\d{1,2}:\d{2}$/.test(t)) return t.padStart(5, '0');
    const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(String((g && g.time) || '').trim());
    if (!m) return '';
    let h = (+m[1]) % 12;
    if (/p/i.test(m[3])) h += 12;
    return `${String(h).padStart(2, '0')}:${m[2] || '00'}`;
  }

  function gameStartMs(g) {
    const ymd = String((g && g.date_iso) || '').slice(0, 10);
    if (!YMD.test(ymd)) return NaN;
    return etToMs(ymd, time24(g) || DEFAULT_TIME);
  }

  function tsMs(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'string') return Date.parse(v);
    if (typeof v === 'number') return v;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    return NaN;
  }

  const isPpd = (g) => !!(g && (g.ppd === true || g.rained_out === true));
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const isFinal = (g) => !!(g && g.done === true && num(g.away_score) !== null && num(g.home_score) !== null);
  const isPlayoffId = (id) => /^po__/.test(String(id || ''));

  // A ppd_rescheduled_to note that names a date ("May 26", "Tue 6/30 at Mondauk").
  function rescheduleNote(g) {
    const s = String((g && (g.ppd_rescheduled_to || g.rescheduled_to)) || '').trim();
    if (!s || /^(tbd|tba|n\/?a|none|unknown|later|\?+|-+)$/i.test(s)) return '';
    return s;
  }

  const pairKey = (g) => [String(g.away || ''), String(g.home || '')].sort().join('|');

  // When the game was postponed (ms): ppd_at when it's a real time, else the
  // scheduled start. Never later than "now" matters only for display.
  function postponedAtMs(g) {
    const t = tsMs(g && g.ppd_at);
    return Number.isFinite(t) ? t : gameStartMs(g);
  }

  function deadlines(g) {
    const ppdAt = postponedAtMs(g);
    const orig = String((g && g.date_iso) || '').slice(0, 10);
    const playBy = addDaysYmd(orig, PLAY_WITHIN_DAYS);
    return {
      postponedAt: ppdAt,
      pickBy: Number.isFinite(ppdAt) ? ppdAt + PICK_WITHIN_MS : NaN,
      playBy,                                                     // YYYY-MM-DD, last allowed day
      playByEnd: playBy ? etToMs(addDaysYmd(playBy, 1), '00:00') : NaN, // first instant after it
    };
  }

  /**
   * The makeup tracker.
   *   games: every games doc ({id, ...fields}); nowMs: the clock.
   * Returns { open: [entry], madeUp: [entry] } where open is sorted by urgency.
   * entry = { id, game, away, home, wk, origDate, origTime, field,
   *           postponedAt, pickBy, playBy, playByEnd, daysSince,
   *           status: 'needs_date'|'date_set'|'overdue', overdueWhy: ''|'no_date_48h'|'not_played_21d',
   *           makeup: {id, date_iso, time, field, done, linked:bool}|null, note, lateMakeup:bool }
   */
  function trackMakeups(games, nowMs) {
    const list = (Array.isArray(games) ? games : []).filter(g => g && g.id && !isPlayoffId(g.id));
    const byId = new Map(list.map(g => [g.id, g]));
    const makeupOfIds = new Set(list.filter(g => g.makeup_of).map(g => String(g.makeup_of)));
    const used = new Set();
    // Games explicitly linked are never auto-matched to another postponement.
    for (const g of list) if (g.makeup_game_id && byId.has(g.makeup_game_id)) used.add(g.makeup_game_id);

    const cands = list
      .filter(g => isPpd(g) && !isFinal(g) && YMD.test(String(g.date_iso || '').slice(0, 10)))
      // A postponed MAKEUP is tracked through its original game, not twice.
      .filter(g => !(g.makeup_of && byId.has(g.makeup_of) && isPpd(byId.get(g.makeup_of))))
      .sort((a, b) => (gameStartMs(a) - gameStartMs(b)) || String(a.id).localeCompare(String(b.id)));

    const byDate = [...list].sort((a, b) => (gameStartMs(a) - gameStartMs(b)) || String(a.id).localeCompare(String(b.id)));
    const open = [], madeUp = [];
    for (const g of cands) {
      const orig = String(g.date_iso).slice(0, 10);
      let mk = null, linked = false;
      if (g.makeup_game_id && byId.has(g.makeup_game_id)) { mk = byId.get(g.makeup_game_id); linked = true; }
      else {
        mk = byDate.find(x => x.id !== g.id && !used.has(x.id) && !isPpd(x)
          && pairKey(x) === pairKey(g) && String(x.date_iso || '').slice(0, 10) > orig
          && (!x.makeup_of || x.makeup_of === g.id)) || null;
        if (mk) used.add(mk.id);
      }
      const dl = deadlines(g);
      const makeup = mk ? {
        id: mk.id, date_iso: String(mk.date_iso || '').slice(0, 10), time: mk.time || '', time_24: time24(mk),
        field: mk.field || '', done: isFinal(mk), ppd: isPpd(mk), linked,
      } : null;
      const entry = {
        id: g.id, game: g, away: g.away, home: g.home, wk: g.wk, origDate: orig, origTime: g.time || '', field: g.field || '',
        postponedAt: dl.postponedAt, pickBy: dl.pickBy, playBy: dl.playBy, playByEnd: dl.playByEnd,
        daysSince: Number.isFinite(dl.postponedAt) ? Math.max(0, Math.floor((nowMs - dl.postponedAt) / DAY)) : null,
        makeup, note: rescheduleNote(g), status: 'needs_date', overdueWhy: '', lateMakeup: false,
      };
      if (makeup && makeup.done) { entry.status = 'made_up'; madeUp.push(entry); continue; }
      const hasDate = !!(makeup && !makeup.ppd) || !!entry.note;
      if (makeup && !makeup.ppd && makeup.date_iso && makeup.date_iso > dl.playBy) entry.lateMakeup = true;
      if (nowMs >= dl.playByEnd) { entry.status = 'overdue'; entry.overdueWhy = 'not_played_21d'; }
      else if (hasDate) entry.status = 'date_set';
      else if (nowMs >= dl.pickBy) { entry.status = 'overdue'; entry.overdueWhy = 'no_date_48h'; }
      open.push(entry);
    }
    const rank = { overdue: 0, needs_date: 1, date_set: 2 };
    open.sort((a, b) => (rank[a.status] - rank[b.status]) || (a.pickBy - b.pickBy));
    return { open, madeUp };
  }

  // Hide what's long settled from public and captain views: an entry whose
  // 21 day window closed more than `days` ago.
  function isStale(entry, nowMs, days = 14) {
    return Number.isFinite(entry.playByEnd) && nowMs > entry.playByEnd + days * DAY;
  }

  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // "Thu 6/12"
  function fmtDay(ms) {
    if (!Number.isFinite(ms)) return '';
    const p = partsET(ms);
    return `${p.wd} ${p.mo}/${p.d}`;
  }
  function fmtYmd(ymd) {
    const m = YMD.exec(String(ymd || ''));
    if (!m) return '';
    return `${WD[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).getUTCDay()]} ${+m[2]}/${+m[3]}`;
  }
  // "3:09 PM"
  function fmtClock(ms) {
    if (!Number.isFinite(ms)) return '';
    const p = partsET(ms);
    return `${(p.h % 12) || 12}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'AM' : 'PM'}`;
  }

  root.DVSLMakeups = { TZ, HOUR, DAY, PICK_WITHIN_MS, PLAY_WITHIN_DAYS, DEFAULT_TIME, offsetMinutesET, etToMs, ymdET, addDaysYmd, time24, gameStartMs, isPpd, isFinal, isPlayoffId, rescheduleNote, postponedAtMs, deadlines, trackMakeups, isStale, fmtDay, fmtYmd, fmtClock };
})(typeof window !== 'undefined' ? window : globalThis);
