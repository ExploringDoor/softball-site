// Makeup tracker + late score rules (Rules 11-12 and 14), server copy.
//
// PARITY: js/dvsl-makeups.js is the browser copy of everything above the
// "server only" line. Keep the two in step; lockdown-workspace/features2-tests/
// makeup-parity.test.mjs runs both on the same games and fails on any drift.
//
// Rulebook:
//   11-12  A postponed game must be rescheduled within 48 hours of the
//          postponement and played within 21 days of the original date, else
//          the Commissioners assign the date and location.
//   14     Captains of both teams report the score within 24 hours.
//
// League clock is America/New_York (DST aware). "48 hours" is 48 real hours
// from the moment the game was marked postponed (games.ppd_at, written by
// admin.html, captain.html and the text-in store); a game without ppd_at uses
// its scheduled start. "21 days" is calendar days: played on or before
// original date + 21, any time that day.
//
// A makeup is "set" when:
//   1. games.makeup_game_id points at the makeup game (admin Makeups panel), or
//   2. a later game between the same two teams exists that is not itself
//      postponed (captains and the commissioner add makeups with Add Game;
//      the first unused later game is matched to the earliest postponement), or
//   3. ppd_rescheduled_to holds a date note ("May 26"), not "TBD".
// It is "made up" (off the tracker) when that makeup game is final, or the
// postponed game itself got a final.
// Playoff games (po__*) are never on the tracker: they have no games doc,
// can't be marked postponed by captains or by text, and the 21 day window
// doesn't fit a bracket. The commissioner moves playoff games in the bracket.

export const TZ = 'America/New_York';
export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;
export const PICK_WITHIN_MS = 48 * HOUR;
export const PLAY_WITHIN_DAYS = 21;
export const DEFAULT_TIME = '18:00';

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
export function offsetMinutesET(ms) {
  const p = partsET(ms);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

// "2026-07-06" + "18:15" New York wall clock -> epoch ms.
export function etToMs(ymd, hhmm) {
  const m = YMD.exec(String(ymd || ''));
  const t = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m || !t) return NaN;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
  let ms = guess - offsetMinutesET(guess) * 60000;
  const off2 = offsetMinutesET(ms);
  if (guess - off2 * 60000 !== ms) ms = guess - off2 * 60000;
  return ms;
}

export function ymdET(ms) {
  const p = partsET(ms);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export function addDaysYmd(ymd, n) {
  const m = YMD.exec(String(ymd || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n, 12));
  return d.toISOString().slice(0, 10);
}

// "18:15", "6:15 PM", "6 pm" -> "HH:MM" (24h) or ''.
export function time24(g) {
  const t = String((g && g.time_24) || '').trim();
  if (/^\d{1,2}:\d{2}$/.test(t)) return t.padStart(5, '0');
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(String((g && g.time) || '').trim());
  if (!m) return '';
  let h = (+m[1]) % 12;
  if (/p/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] || '00'}`;
}

export function gameStartMs(g) {
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

export const isPpd = (g) => !!(g && (g.ppd === true || g.rained_out === true));
const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
export const isFinal = (g) => !!(g && g.done === true && num(g.away_score) !== null && num(g.home_score) !== null);
export const isPlayoffId = (id) => /^po__/.test(String(id || ''));

// A ppd_rescheduled_to note that names a date ("May 26", "Tue 6/30 at Mondauk").
export function rescheduleNote(g) {
  const s = String((g && (g.ppd_rescheduled_to || g.rescheduled_to)) || '').trim();
  if (!s || /^(tbd|tba|n\/?a|none|unknown|later|\?+|-+)$/i.test(s)) return '';
  return s;
}

const pairKey = (g) => [String(g.away || ''), String(g.home || '')].sort().join('|');

// When the game was postponed (ms): ppd_at when it's a real time, else the
// scheduled start. Never later than "now" matters only for display.
export function postponedAtMs(g) {
  const t = tsMs(g && g.ppd_at);
  return Number.isFinite(t) ? t : gameStartMs(g);
}

export function deadlines(g) {
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
export function trackMakeups(games, nowMs) {
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
export function isStale(entry, nowMs, days = 14) {
  return Number.isFinite(entry.playByEnd) && nowMs > entry.playByEnd + days * DAY;
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// "Thu 6/12"
export function fmtDay(ms) {
  if (!Number.isFinite(ms)) return '';
  const p = partsET(ms);
  return `${p.wd} ${p.mo}/${p.d}`;
}
export function fmtYmd(ymd) {
  const m = YMD.exec(String(ymd || ''));
  if (!m) return '';
  return `${WD[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).getUTCDay()]} ${+m[2]}/${+m[3]}`;
}
// "3:09 PM"
export function fmtClock(ms) {
  if (!Number.isFinite(ms)) return '';
  const p = partsET(ms);
  return `${(p.h % 12) || 12}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'AM' : 'PM'}`;
}

// ───────────────────────────── server only ─────────────────────────────

export const LATE_AFTER_MS = 3 * HOUR;       // remind captains this long after first pitch
export const LATE_UNTIL_MS = 72 * HOUR;      // ...but not for games older than this
export const OFFICE_AFTER_MS = 24 * HOUR;    // Rule 14: commissioner digest after 24 hours
export const OFFICE_UNTIL_MS = 14 * DAY;     // digest only looks back two weeks
export const LIVE_FRESH_MS = 2 * HOUR;       // a scorer still live-scoring: leave it alone

function liveNow(g, nowMs) {
  if (!g || g.live !== true) return false;
  const t = tsMs(g.liveAt);
  return Number.isFinite(t) && nowMs - t < LIVE_FRESH_MS;
}

/**
 * Which reminders are due. Pure.
 *   games: games docs; lanes: Set of "gid_side" score_submissions ids;
 *   playoff: [{id, away, home, date, time, field, played}] decided playoff games;
 *   teamName(id) -> display name.
 * Returns {
 *   captain: [{key, gameId, side, stage:'score'|'makeup', teamId, oppId, startMs, entry?}],
 *   office:  [{key, gameId, stage:'score24'|'makeup48', away, home, startMs, entry?}],
 * }
 */
export function planReminders({ games, lanes, playoff = [], nowMs }) {
  const captain = [], office = [];
  const laneSet = lanes instanceof Set ? lanes : new Set(lanes || []);
  const hasLane = (g, side) => laneSet.has(`${g.id}_${side}`)
    || !!(g[`score_submitted_${side}_by`] || num(g[`score_submitted_${side}_away`]) !== null);

  const rows = [];
  for (const g of games || []) {
    if (!g || !g.id || isPlayoffId(g.id) || isPpd(g) || isFinal(g) || g.done === true) continue;
    if (!g.away || !g.home) continue;
    rows.push({ g, playoff: false, startMs: gameStartMs(g) });
  }
  for (const p of playoff || []) {
    if (!p || !p.id || !p.away || !p.home || p.played) continue;
    const startMs = etToMs(p.date, /^\d{1,2}:\d{2}$/.test(String(p.time || '')) ? String(p.time).padStart(5, '0') : DEFAULT_TIME);
    rows.push({ g: { id: p.id, away: p.away, home: p.home, date_iso: p.date, time_24: p.time, field: p.field }, playoff: true, startMs });
  }
  for (const { g, playoff: po, startMs } of rows) {
    if (!Number.isFinite(startMs)) continue;
    const age = nowMs - startMs;
    if (age < LATE_AFTER_MS) continue;
    if (!po && liveNow(g, nowMs)) continue;
    if (age <= LATE_UNTIL_MS) {
      for (const side of ['away', 'home']) {
        if (!po && hasLane(g, side)) continue;
        captain.push({ key: `${g.id}_${side}_score`, gameId: g.id, side, stage: 'score', teamId: g[side],
          oppId: g[side === 'away' ? 'home' : 'away'], startMs, playoff: po, game: g });
      }
    }
    if (age >= OFFICE_AFTER_MS && age <= OFFICE_UNTIL_MS) {
      office.push({ key: `${g.id}_admin_score24`, gameId: g.id, stage: 'score24', away: g.away, home: g.home, startMs, playoff: po, game: g });
    }
  }

  const { open } = trackMakeups(games, nowMs);
  for (const e of open) {
    if (e.status !== 'overdue' || e.overdueWhy !== 'no_date_48h') continue;
    if (nowMs >= e.playByEnd) continue;
    for (const side of ['away', 'home']) {
      captain.push({ key: `${e.id}_${side}_makeup`, gameId: e.id, side, stage: 'makeup', teamId: e[side],
        oppId: e[side === 'away' ? 'home' : 'away'], startMs: gameStartMs(e.game), entry: e, game: e.game });
    }
    office.push({ key: `${e.id}_admin_makeup48`, gameId: e.id, stage: 'makeup48', away: e.away, home: e.home,
      startMs: gameStartMs(e.game), entry: e, game: e.game });
  }
  return { captain, office };
}

// ─── wording (no emoji, no dashes as punctuation, brand prefix on texts) ───
export function scorePush({ teamName, oppName, startMs, playoff }) {
  return {
    title: `Score needed: ${teamName} vs ${oppName}`,
    body: `Your ${playoff ? 'playoff ' : ''}game vs ${oppName} on ${fmtDay(startMs)} has no score yet. `
      + 'Rule 14: captains report within 24 hours. Tap to report it.',
    url: '/captain.html',
  };
}
export function scoreText({ teamShort, oppName, oppShort, startMs, textIn }) {
  const how = textIn
    ? `Reply with the score like "${teamShort} 12 ${oppShort} 9", or report it at dvsl.vercel.app/captain.html.`
    : 'Report it at dvsl.vercel.app/captain.html.';
  return `DVSL: Your game vs ${oppName} on ${fmtDay(startMs)} has no score yet. ${how} Rule 14: within 24 hours.`;
}
export function makeupPush({ teamName, oppName, entry }) {
  return {
    title: `Makeup date needed: ${teamName} vs ${oppName}`,
    body: `Your ${fmtYmd(entry.origDate)} game vs ${oppName} was postponed and still has no makeup date. `
      + `Rule 12: pick one within 48 hours and play it by ${fmtYmd(entry.playBy)}, or the commissioners assign it.`,
    url: '/captain.html',
  };
}
export function makeupText({ oppName, entry }) {
  return `DVSL: Your ${fmtYmd(entry.origDate)} game vs ${oppName} still needs a makeup date. `
    + `Rule 12: agree on one with the other captain and add it in the Captain Portal. It must be played by ${fmtYmd(entry.playBy)}.`;
}
export function digestPush({ items, nameOf, stillOpen = 0 }) {
  const scores = items.filter(i => i.stage === 'score24');
  const mk = items.filter(i => i.stage === 'makeup48');
  const label = (i) => `${nameOf(i.away)} @ ${nameOf(i.home)} (${fmtDay(i.startMs)})`;
  const parts = [];
  if (scores.length) parts.push(`No score after 24 hours: ${scores.slice(0, 6).map(label).join('; ')}${scores.length > 6 ? `; and ${scores.length - 6} more` : ''}.`);
  if (mk.length) parts.push(`No makeup date after 48 hours: ${mk.slice(0, 6).map(label).join('; ')}${mk.length > 6 ? `; and ${mk.length - 6} more` : ''}.`);
  if (stillOpen) parts.push(`${stillOpen} more from earlier days still open.`);
  parts.push('Open Admin, Makeups.');
  const n = [scores.length ? `${scores.length} late score${scores.length === 1 ? '' : 's'}` : '', mk.length ? `${mk.length} makeup${mk.length === 1 ? '' : 's'} with no date` : '']
    .filter(Boolean).join(', ');
  return { title: `DVSL office: ${n}`, body: parts.join(' '), url: '/admin.html' };
}
