// Text a box score: a captain texts a photo of the scorebook (MMS), the AI
// scorebook reader (api/_lib/boxscore-ai.js, the same one the captain page
// uses) reads it, the captain gets a one-line summary, and only a YES posts it.
//
// The flow, as the captain sees it:
//   photo ──► "DVSL: DN 12, SA 9 (Jun 15). Read 13 DN batters, 10 SA batters.
//              Reply YES to post, NO to cancel."
//   YES   ──► box_scores/{gid} (captain.html submitBoxScoreUnified shape and
//              merge rules), the final through the DVSL store's reportFinal
//              (first report posts, same side may correct, a disagreeing second
//              report is recorded and flagged; playoff ids go to the bracket),
//              the captain's lane score_submissions/{gid}_{side}
//              (has_boxscore:true), then both teams' player stats.
//   NO    ──► nothing is written.
//
// Rules kept (lib/sms/core/README.md): a photo never saves by itself; no box
// score for a game that has not started; when the photo could be for two
// games, ask with a numbered menu; the office's ruling stands (reportFinal
// says so and nothing about the final changes).
//
// Reading a full scorebook takes the model 15 to 40 seconds and Twilio gives
// the webhook 15. So the read gets SYNC_BUDGET_MS: done in time, the summary is
// the webhook's reply; not done, the reply says "reading it now" and the read
// finishes in the background (Vercel waitUntil), saves the session through the
// store and texts the summary with sendSms. sms-inbound needs maxDuration ≥ 60.
//
// Interfaces (TEXTING.md):
//   handlePhoto({from, sender, mediaUrls, mediaTypes?, session}) → {reply, session, background?}
//   handlePhotoReply({from, sender, body, session}) → {handled, reply?, session?, background?}
// `sender` is dvsl-store getSender(); `session` is the whole sms_sessions doc
// (getSessionDoc, pending_box included); the result's session is what the
// caller saves with saveSession(from, session, {withBox:true}). `background`
// (a promise) is only there for tests and callers that want to await the late
// read; it is already registered with waitUntil.
//
// The final goes through dvsl-store reportCaptainFinal({..., boxWritten:true})
// AFTER the full box score is written (captain.html order: box score, then the
// game), so the store's own score-only box score is skipped. That call writes
// the games doc (or the bracket), the lane, the pushes, the activity log and
// the standings; this module then marks the lane has_boxscore and recomputes
// both teams' player stats.

import crypto from 'crypto';
import { fsGet, fsQuery, fsSet, fsUpdate, dailyCount, rateLimited } from '../_lib/dvsl.js';
import { parseBracketField, isPlayed } from '../_lib/bracket.js';
import { readBoxScore, resolveParsedNames, stripDnp } from '../_lib/boxscore-ai.js';
import { recalcTeamStats } from './stats.js';
import { lastFour } from './ids.js';
import { hasStarted, startsAt, clockIn, parseChoice } from './core.js';
import * as storeMod from './dvsl-store.js';
import * as sendMod from './send.js';

export const TZ = 'America/New_York';
export const DAILY_AI_CAP = 40;          // dailyCount('sms-boxscore')
const WINDOW_DAYS = 7;                   // how far back a texted box score may be for
const MENU_MAX = 4;
const CHOOSE_MS = 30 * 60 * 1000;
const READING_MS = 30 * 60 * 1000;
const CONFIRM_MS = 12 * 60 * 60 * 1000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // Anthropic's per-image limit
const PDF_MAX_BYTES = 10 * 1024 * 1024;
const MEDIA_MAX = 4;
const SITE = 'dvsl.vercel.app';

// ─── dependencies (swappable in tests) ────────────────────────────────────
function vercelWaitUntil(p) {
  try {
    const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
    if (ctx && typeof ctx.waitUntil === 'function') { ctx.waitUntil(p); return true; }
  } catch (_) { /* not on Vercel */ }
  return false;
}
const DEFAULT_DEPS = {
  reportCaptainFinal: (args) => storeMod.reportCaptainFinal(args),
  getSessionDoc: (from) => storeMod.getSessionDoc(from),
  saveSession: (from, s) => storeMod.saveSession(from, s, { withBox: true }),
  sendSms: (args) => sendMod.sendSms(args),
  readBoxScore,
  fetchMedia: fetchTwilioMedia,
  recalcTeamStats,
  now: () => new Date(),
  waitUntil: vercelWaitUntil,
  syncBudgetMs: 11000,
  lateWriteDelayMs: 2500,
  aiTimeoutMs: 55000,
};
let D = { ...DEFAULT_DEPS };
export function _setDeps(over) { D = { ...DEFAULT_DEPS, ...(over || {}) }; }

// ─── small helpers ────────────────────────────────────────────────────────
export const brand = (s) => (/^DVSL: /.test(s) ? s : 'DVSL: ' + s);
const nowMs = () => D.now().getTime();
const clean = (v, max = 60) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 0; };
const scoreOrNull = (v) => { const n = typeof v === 'number' ? v : (/^\s*\d{1,3}\s*$/.test(String(v ?? '')) ? Number(v) : NaN); return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null; };
const PLAYOFF_RE = /^po__(gold|silver)_([0-9]+)$/;
const log = (msg, from, extra = '') => console.log(`[sms photo] ${msg} ...${lastFour(from || '')}${extra ? ' ' + extra : ''}`);

function shiftYmd(ymd, days) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function monDay(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function withPending(session, pb) {
  const s = { ...(session || {}) };
  if (pb === undefined) return s;
  s.pending_box = pb;
  return s;
}

const YES_RE = /^(yes|y|yep|yeah|yup|ok|okay|post|post it|confirm|correct|looks good)[\s.!]*$/i;
const NO_RE = /^(no|n|nope|cancel|wrong|delete|dont post|don't post)[\s.!]*$/i;
const EDIT_RE = /^(edit|fix|change)\b/i;
function readReply(body) {
  const t = String(body || '').trim();
  if (YES_RE.test(t)) return { kind: 'yes' };
  if (NO_RE.test(t)) return { kind: 'no' };
  if (EDIT_RE.test(t)) return { kind: 'edit' };
  const c = parseChoice(t);
  if (c && !c.rest) return { kind: 'choice', n: c.n };
  return null;
}

// ─── wording (short, plain, no emoji; MENU never HELP) ───────────────────
const scoreLine = (pb, a, h) => `${pb.away_short} ${a}, ${pb.home_short} ${h}`;
const example = (my) => `${my || 'TBIR'} 12 ${my === 'SA' ? 'KI' : 'SA'} 9`;
export const TEXT = {
  off: (my) => `Box score photos are not turned on yet. Text the score instead, like ${example(my)}.`,
  noKey: (my) => `I cannot read photos right now. Text the score instead, like ${example(my)}.`,
  notSender: 'This number is not set up to send box scores. Ask the commissioner to add you.',
  adminPhone: 'Box score photos come from a captain\'s phone. Enter this one on the admin page.',
  tooMany: 'That is a lot of photos at once. Wait a few minutes, then send it again.',
  heic: 'I cannot read that photo format (HEIC). Send a screenshot of the photo, or set Settings > Camera > Formats to Most Compatible and take it again.',
  badMedia: 'I can read a photo (JPEG or PNG) or a PDF of the scorebook. Send one of those.',
  couldNotRead: (my) => `I could not read that box score. Try a clearer, straight-on photo of the whole page, or text the score like ${example(my)}.`,
  noScore: (my) => `I could read the sheet but not the final score. Try a clearer photo, or text the score like ${example(my)}.`,
  cap: (my) => `The box score reader is at its limit for today. Text the score like ${example(my)}, or enter the box score on the captain page: ${SITE}/captain.html`,
  reading: (label) => `Got your box score photo for ${label}. Reading it now, I will text you back in a minute.`,
  stillReading: 'Still reading your box score. I will text you when it is ready.',
  cancelled: 'Box score cancelled. Nothing was posted.',
  expired: 'That box score was not posted in time and has expired. Send the photo again.',
  edit: `Reply YES to post it as read, then fix any stat on the captain page: ${SITE}/captain.html. Or reply NO to cancel.`,
  tryAgain: 'Something went wrong and nothing was posted. Reply YES to try again, or NO to cancel.',
  boxFailed: 'The box score is saved, but the score did not go in. Reply YES to try again.',
  gameGone: 'That game is no longer on the schedule for your team, so nothing was posted. Text the commissioner.',
  rainedOut: 'That game is marked rained out on the site, so nothing was posted. Text the commissioner if it was played.',
};

// ─── switch ───────────────────────────────────────────────────────────────
async function boxPhotoEnabled() {
  try {
    const c = await fsGet('sms_state/config');
    return !!(c && c.box_photo && c.box_photo.enabled === true);
  } catch (e) {
    console.warn('[sms photo] config read failed', e.message);
    return false;
  }
}

// ─── media ────────────────────────────────────────────────────────────────
function normType(t) {
  const x = String(t || '').split(';')[0].trim().toLowerCase();
  return x === 'image/jpg' || x === 'image/pjpeg' ? 'image/jpeg' : x;
}
const READABLE = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']);
const isHeic = (t) => /^image\/hei[cf](-sequence)?$/.test(t);
export function normalizeMedia(mediaUrls, mediaTypes = []) {
  return (Array.isArray(mediaUrls) ? mediaUrls : [])
    .map((m, i) => (typeof m === 'string'
      ? { url: m, type: normType(Array.isArray(mediaTypes) ? mediaTypes[i] : '') }
      : { url: m && m.url, type: normType(m && (m.contentType || m.type)) }))
    .filter(m => typeof m.url === 'string' && /^https:\/\/api\.twilio\.com\//.test(m.url))
    .slice(0, 10);
}

// Pull one media file off Twilio (media URLs need the account's credentials).
// API key + secret when set, else the auth token. → {base64, mediaType} | {error}
export async function fetchTwilioMedia(url) {
  const sid = process.env.TWILIO_ACCOUNT_SID || '';
  const user = process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET ? process.env.TWILIO_API_KEY_SID : sid;
  const pass = process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET ? process.env.TWILIO_API_KEY_SECRET : (process.env.TWILIO_AUTH_TOKEN || '');
  if (!user || !pass || !/^https:\/\/api\.twilio\.com\//.test(url)) return { error: 'unavailable' };
  try {
    const r = await fetch(url, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { error: 'http ' + r.status };
    const mediaType = normType(r.headers.get('content-type'));
    if (isHeic(mediaType)) return { error: 'heic', mediaType };
    if (!READABLE.has(mediaType)) return { error: 'type', mediaType };
    const buf = Buffer.from(await r.arrayBuffer());
    const max = mediaType === 'application/pdf' ? PDF_MAX_BYTES : IMAGE_MAX_BYTES;
    if (!buf.length) return { error: 'empty' };
    if (buf.length > max) return { error: 'too-large', mediaType };
    return { base64: buf.toString('base64'), mediaType };
  } catch (e) {
    return { error: 'fetch' };
  }
}

// ─── games ────────────────────────────────────────────────────────────────
async function teamDoc(id) {
  try { return (await fsGet(`teams/${id}`)) || { id }; } catch (_) { return { id }; }
}
const shortOf = (t) => clean((t && (t.short || t.name || t.id)) || '', 20);

let _bracketCache = null;
async function brackets() {
  if (_bracketCache && Date.now() - _bracketCache.at < 30000) return _bracketCache.data;
  const doc = await fsGet('teams/__playoff_brackets');
  const data = { gold: parseBracketField(doc && doc.gold), silver: parseBracketField(doc && doc.silver) };
  _bracketCache = { at: Date.now(), data };
  return data;
}

// A playoff_games/{po__…} row → the game object this module works with
// (bracket-away is away, as on the captain page). Null when a side is open.
async function playoffGame(pg) {
  const m = PLAYOFF_RE.exec(pg.id || '');
  if (!m || !pg.away || !pg.home) return null;
  const t = (await brackets())[m[1]];
  const bg = t ? (t.games || []).find(x => x.g === Number(m[2])) : null;
  const iso = bg && /^\d{4}-\d{2}-\d{2}$/.test(bg.date || '') ? bg.date : '';
  return {
    id: pg.id, playoff: true, bracket: m[1], bracket_game: Number(m[2]),
    away: pg.away, home: pg.home, wk: 'PL',
    date_iso: iso, date: monDay(iso), time: bg && bg.time ? String(bg.time) : '', field: (bg && bg.field) || '',
    done: !!(bg && isPlayed(bg)),
    label: `${m[1] === 'gold' ? 'Gold' : 'Silver'} G${m[2]}`,
  };
}

async function loadGame(id) {
  if (PLAYOFF_RE.test(id)) {
    const pg = await fsGet(`playoff_games/${id}`);
    return pg ? playoffGame(pg) : null;
  }
  const g = await fsGet(`games/${id}`);
  return g ? { ...g, id } : null;
}

const calledOff = (g) => !!(g.ppd || g.rained_out || /^(ppd|postponed|cancel+ed|rained ?out)$/i.test(String(g.status || '')));
// A forfeit (games.forfeit) carries no runs and no box score (Rule 19).
const isForfeit = (g) => ['away', 'home', 'double'].includes(g && g.forfeit);
function started(g, clock) {
  if (!g.date_iso) return !!(g.playoff && g.done);
  return hasStarted({ date: g.date_iso, time: g.time_24 || g.time || '', status: g.done ? 'final' : (g.live ? 'live' : null) }, clock);
}
// Has this captain's side (or the commissioner's master copy) already put in
// a box score with batting lines for the game? A score-only doc (what a texted
// or portal score writes) does not count: the photo is how the lines arrive.
function hasMyBox(bs, role) {
  if (!bs) return false;
  const lines = (side) => (bs[`${side}_lineup`] || bs[`${side}Batters`] || []).length > 0;
  if (bs.first_submitter === role || bs.second_submitter === role) return lines(role);
  return !bs.first_submitter && (lines('away') || lines('home'));
}

// The sender's teams' games a texted box score could be for. Each game
// carries `_team`: which of the sender's teams plays in it.
// → { candidates:[game...] (latest first), done:[game with my box], upcoming: game|null }
export async function findGames(teamIds) {
  const clock = clockIn(TZ, D.now());
  const today = clock.slice(0, 10);
  const from = shiftYmd(today, -WINDOW_DAYS);
  const rows = (await Promise.all(teamIds.flatMap(t => [
    fsQuery('games', [['away', '==', t]]),
    fsQuery('games', [['home', '==', t]]),
    fsQuery('playoff_games', [['away', '==', t]]).then(a => Promise.all(a.map(playoffGame))),
    fsQuery('playoff_games', [['home', '==', t]]).then(a => Promise.all(a.map(playoffGame))),
  ]))).flat();
  const seen = new Set();
  const all = rows.filter(g => g && !seen.has(g.id) && seen.add(g.id) && !calledOff(g) && !isForfeit(g))
    .map(g => ({ ...g, _team: teamIds.includes(g.home) ? g.home : g.away }));
  const inWindow = all.filter(g => (g.date_iso ? g.date_iso >= from && g.date_iso <= today : g.playoff && g.done));
  const startedGames = inWindow.filter(g => started(g, clock))
    .sort((a, b) => startsAt({ date: b.date_iso || '0000-00-00', time: b.time_24 || b.time }).localeCompare(startsAt({ date: a.date_iso || '0000-00-00', time: a.time_24 || a.time })));
  const upcoming = inWindow.filter(g => g.date_iso === today && !started(g, clock))[0] || null;
  const boxes = await Promise.all(startedGames.map(g => fsGet(`box_scores/${g.id}`).catch(() => null)));
  const candidates = [], done = [];
  startedGames.forEach((g, i) => {
    const role = g.home === g._team ? 'home' : 'away';
    (hasMyBox(boxes[i], role) ? done : candidates).push(g);
  });
  return { candidates, done, upcoming };
}

function gameLabel(g, shorts) {
  const teamId = g._team;
  const opp = g.home === teamId ? g.away : g.home;
  const vs = g.home === teamId ? 'vs' : 'at';
  const when = g.date || monDay(g.date_iso) || (g.label || '');
  return `${when} ${vs} ${shorts[opp] || opp}${g.playoff && g.label && when !== g.label ? ` (${g.label})` : ''}`.trim();
}

// ─── building the box score from the AI's read ───────────────────────────
function lineFor(p) {
  const h = toInt(p.h), hr = toInt(p.hr), d = toInt(p.doubles), t = toInt(p.triples);
  const oneB = Math.max(0, h - hr - d - t);
  const so = toInt(p.so) || toInt(p.k);
  // Exactly the keys captain.html's readBatters writes (no `h`: readers and
  // the stats recalc derive it from s + d + t + hr).
  return {
    name: clean(p.name), ab: toInt(p.ab), r: toInt(p.r), '1b': oneB, '2b': d, '3b': t, hr,
    rbi: toInt(p.rbi), bb: toInt(p.bb), k: so, sac: 0, sf: 0, roe: 0, fc: 0,
    so, d, t, s: oneB,
  };
}
function pitcherFor(p) {
  const so = toInt(p.so) || toInt(p.k);
  return { name: clean(p.name), ip: clean(p.ip, 8) || '0', h: toInt(p.h), r: toInt(p.r), er: toInt(p.er), bb: toInt(p.bb), k: so, so };
}
const sum = (a) => a.reduce((x, y) => x + y, 0);
const stripId = (o) => { const x = { ...(o || {}) }; delete x.id; return x; };
function innings(arr) {
  const a = (Array.isArray(arr) ? arr : []).slice(0, 12).map(toInt);
  while (a.length < 7) a.push(0);
  return a;
}

// parsed (from the AI, names already resolved) → { box, as, hs, counts, warnings } | { error }
export function buildBox(parsed, g, { teamId, teamName }) {
  if (!parsed || typeof parsed !== 'object') return { error: 'unreadable' };
  const aB = stripDnp(parsed.awayBatters).filter(p => p && clean(p.name));
  const hB = stripDnp(parsed.homeBatters).filter(p => p && clean(p.name));
  const awayLineup = aB.map(lineFor), homeLineup = hB.map(lineFor);
  const awayP = (parsed.awayPitchers || []).filter(p => p && clean(p.name)).map(pitcherFor);
  const homeP = (parsed.homePitchers || []).filter(p => p && clean(p.name)).map(pitcherFor);
  const ls = parsed.linescore || {};
  const hasLs = (Array.isArray(ls.away) && ls.away.length > 0) || (Array.isArray(ls.home) && ls.home.length > 0);
  const awayLs = innings(ls.away), homeLs = innings(ls.home);
  let as = scoreOrNull(parsed.awayScore), hs = scoreOrNull(parsed.homeScore);
  if (as == null && hasLs && Array.isArray(ls.away) && ls.away.length) as = scoreOrNull(sum(awayLs));
  if (hs == null && hasLs && Array.isArray(ls.home) && ls.home.length) hs = scoreOrNull(sum(homeLs));
  if (as == null || hs == null) return { error: 'no-score' };
  const warnings = [];
  if (hasLs && (sum(awayLs) || sum(homeLs)) && (sum(awayLs) !== as || sum(homeLs) !== hs)) warnings.push({ kind: 'linescore', away: sum(awayLs), home: sum(homeLs) });
  const hitsOf = (lineup) => sum(lineup.map(l => l.s + l.d + l.t + l.hr));
  const awayOnly = awayLineup.length === 0, homeOnly = homeLineup.length === 0;
  const box = {
    game_id: g.id,
    week: g.wk || 0,
    date: g.date || '',
    field: g.field || '',
    away: g.away, home: g.home,
    away_score: as, home_score: hs,
    away_linescore: awayLs, home_linescore: homeLs,
    away_hits: hitsOf(awayLineup), home_hits: hitsOf(homeLineup),
    away_errors: toInt(ls.awayErrors), home_errors: toInt(ls.homeErrors),
    awayBatters: awayLineup, homeBatters: homeLineup,   // camelCase, legacy readers
    away_lineup: awayLineup, home_lineup: homeLineup,   // snake_case, leaders/index
    away_pitchers: awayP, home_pitchers: homeP,
    away_errors_detail: [], home_errors_detail: [],
    away_score_only: awayOnly, home_score_only: homeOnly,
    submitted_by: teamName, submitted_by_id: teamId,
    status: 'approved',
    source: 'sms',
  };
  if (awayOnly && homeOnly) box.score_only = true;
  return { box, as, hs, counts: { away: awayLineup.length, home: homeLineup.length }, warnings };
}

// ─── the read (fetch media → AI → summary) ───────────────────────────────
async function runRead({ from, teamId, game, media }) {
  const [awayT, homeT] = await Promise.all([teamDoc(game.away), teamDoc(game.home)]);
  const myT = teamId === game.home ? homeT : awayT;
  const my = shortOf(myT);
  const files = [];
  let heic = false;
  for (const m of media.slice(0, MEDIA_MAX)) {
    if (m.type && isHeic(m.type)) { heic = true; continue; }
    if (m.type && !READABLE.has(m.type)) continue;
    const f = await D.fetchMedia(m.url);
    if (f && f.base64) files.push({ base64: f.base64, mediaType: f.mediaType });
    else if (f && f.error === 'heic') heic = true;
  }
  if (!files.length) return { ok: false, text: heic ? TEXT.heic : TEXT.couldNotRead(my) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, text: TEXT.noKey(my) };
  if (await dailyCount('sms-boxscore') > DAILY_AI_CAP) return { ok: false, text: TEXT.cap(my) };

  const players = await fsQuery('players', [['team', 'in', [game.away, game.home]]]);
  const roster = (team) => players
    .filter(p => p.team === team && p.active !== false && p.pending_approval !== true && p.name)
    .map(p => ({ id: p.id, name: p.name, num: p.num == null ? '' : p.num }));
  const awayRoster = roster(game.away), homeRoster = roster(game.home);

  let parsed;
  try {
    parsed = await D.readBoxScore({
      awayTeam: awayT.name || game.away, homeTeam: homeT.name || game.home,
      awayRoster, homeRoster,
      date: game.date || game.date_iso || '', week: game.wk || '', field: game.field || '',
      files,
    }, { apiKey, signal: AbortSignal.timeout(D.aiTimeoutMs) });
  } catch (e) {
    log('read failed', from, e.message);
    return { ok: false, text: TEXT.couldNotRead(my) };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, text: TEXT.couldNotRead(my) };
  // Did-not-play rows go first so they are not reported as unknown names.
  parsed.awayBatters = stripDnp(parsed.awayBatters);
  parsed.homeBatters = stripDnp(parsed.homeBatters);
  const { unmatched } = resolveParsedNames(parsed, awayRoster, homeRoster);
  const built = buildBox(parsed, game, { teamId, teamName: myT.name || teamId });
  if (built.error === 'no-score') return { ok: false, text: TEXT.noScore(my) };
  if (built.error) return { ok: false, text: TEXT.couldNotRead(my) };

  const role = teamId === game.home ? 'home' : 'away';
  const pb = {
    stage: 'confirm',
    game_id: game.id, playoff: !!game.playoff, role, team_id: teamId,
    away_short: shortOf(awayT), home_short: shortOf(homeT),
    when: game.date || monDay(game.date_iso) || game.label || '',
    box: built.box,
    created_at: nowMs(), expires_at: nowMs() + CONFIRM_MS,
  };
  return { ok: true, pb, text: summaryText(pb, built, unmatched) };
}

export function summaryText(pb, built, unmatched = []) {
  const A = pb.away_short, H = pb.home_short;
  const parts = [`${scoreLine(pb, built.as, built.hs)}${pb.when ? ` (${pb.when})` : ''}.`];
  const { away, home } = built.counts;
  if (!away && !home) parts.push('Read the score only, no batting lines.');
  else if (!home) parts.push(`Read ${away} ${A} batters, no ${H} batting.`);
  else if (!away) parts.push(`Read ${home} ${H} batters, no ${A} batting.`);
  else parts.push(`Read ${away} ${A} batters, ${home} ${H} batters.`);
  const ls = built.warnings.find(w => w.kind === 'linescore');
  if (ls) parts.push(`The innings add up to ${A} ${ls.away}, ${H} ${ls.home}, so check the score.`);
  if (unmatched.length) {
    const names = unmatched.slice(0, 3).map(u => u.name).join(', ');
    parts.push(unmatched.length === 1 ? `Not on a roster: ${names}.` : `${unmatched.length} names not on a roster: ${names}${unmatched.length > 3 ? ' and more' : ''}.`);
  }
  parts.push('Reply YES to post, NO to cancel.');
  return parts.join(' ');
}

// Start a read: finish inside the webhook when it can, otherwise reply now and
// finish in the background.
async function startRead({ from, teamId, game, media, session, label }) {
  const job = crypto.randomBytes(6).toString('hex');
  const role = teamId === game.home ? 'home' : 'away';
  const readingPb = {
    stage: 'reading', job, game_id: game.id, role, team_id: teamId, media,
    created_at: nowMs(), expires_at: nowMs() + READING_MS,
  };
  let result = null;
  const work = runRead({ from, teamId, game, media })
    .catch(e => { log('read crashed', from, e.message); return { ok: false, text: TEXT.couldNotRead('') }; })
    .then(r => (result = r));
  let timer;
  const late = new Promise(res => { timer = setTimeout(res, D.syncBudgetMs, 'late'); });
  const first = await Promise.race([work.then(() => 'done'), late]);
  clearTimeout(timer);
  if (first === 'done') {
    return { reply: brand(result.text), session: withPending(session, result.ok ? result.pb : null) };
  }

  // Late: the caller saves `reading` now; the background waits a moment so
  // that save lands first, then writes the result and texts it.
  const returnedAt = Date.now();
  const background = work.then(async () => {
    const wait = returnedAt + D.lateWriteDelayMs - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    const cur = (await D.getSessionDoc(from)) || {};
    const p = cur.pending_box;
    // Cancelled, or replaced by a newer photo: say nothing (and drop this
    // job's cancel marker so the session is clean again).
    if (p && (p.job !== job || p.stage !== 'reading')) {
      if (p.job === job && p.stage === 'cancelled') {
        const next = { ...cur, pending_box: null };
        delete next.id;
        await D.saveSession(from, next);
      }
      return { skipped: true };
    }
    const next = { ...cur, pending_box: result.ok ? result.pb : null };
    delete next.id;
    await D.saveSession(from, next);
    await D.sendSms({ to: from, body: brand(result.text), kind: 'reply', team_id: teamId, game_id: game.id });
    return { sent: true };
  }).catch(e => { log('late reply failed', from, e.message); return { error: e.message }; });
  D.waitUntil(background);
  return { reply: brand(TEXT.reading(label)), session: withPending(session, readingPb), background };
}

// ─── entry 1: a photo arrived ─────────────────────────────────────────────
const teamsOf = (sender) => [...new Set([
  ...(sender && Array.isArray(sender.team_ids) ? sender.team_ids : []),
  sender && sender.team_id,
].filter(t => typeof t === 'string' && t))];

export async function handlePhoto({ from, sender, mediaUrls, mediaTypes, session } = {}) {
  const sess = session || {};
  const reply = (text, pb) => ({ reply: brand(text), session: withPending(sess, pb) });
  if (!sender || sender.active === false) return reply(TEXT.notSender);
  const teamIds = teamsOf(sender);
  if (!teamIds.length) return reply(TEXT.adminPhone);
  const teamId = teamIds[0];
  const myT = await teamDoc(teamId);
  const my = shortOf(myT);

  if (!(await boxPhotoEnabled())) return reply(TEXT.off(my));
  if (!process.env.ANTHROPIC_API_KEY) return reply(TEXT.noKey(my));
  if (rateLimited('smsbox:' + from, 6, 10 * 60 * 1000)) return reply(TEXT.tooMany);

  const media = normalizeMedia(mediaUrls, mediaTypes);
  const typed = media.filter(m => m.type);
  if (!media.length) return reply(TEXT.badMedia);
  if (typed.length === media.length && !typed.some(m => READABLE.has(m.type))) {
    return reply(typed.some(m => isHeic(m.type)) ? TEXT.heic : TEXT.badMedia);
  }

  let found;
  try { found = await findGames(teamIds); }
  catch (e) { log('games read failed', from, e.message); return reply(TEXT.couldNotRead(my)); }
  const { candidates, done, upcoming } = found;
  const ids = [...new Set([...candidates, ...done, ...(upcoming ? [upcoming] : [])].flatMap(g => [g.away, g.home]))];
  const shorts = { [teamId]: my };
  (await Promise.all(ids.filter(id => id !== teamId).map(teamDoc))).forEach(t => { shorts[t.id] = shortOf(t); });

  if (!candidates.length) {
    if (done.length) {
      return reply(`Your box score for ${gameLabel(done[0], shorts)} is already in. To change it, use the captain page: ${SITE}/captain.html`);
    }
    if (upcoming) {
      const tm = upcoming.time ? ` starts at ${upcoming.time}` : ' has not started yet';
      return reply(`Your game ${gameLabel(upcoming, shorts).replace(/^\S+ \S+ /, '')} today${tm}. Send the box score photo after the game.`);
    }
    return reply(`I do not see a ${my} game in the last week that is missing your box score. Text the photo after the game.`);
  }
  if (candidates.length === 1) {
    log('reading', from, candidates[0].id);
    return startRead({ from, teamId: candidates[0]._team, game: candidates[0], media, session: sess, label: gameLabel(candidates[0], shorts) });
  }
  const list = candidates.slice(0, MENU_MAX);
  const pb = {
    stage: 'choose', game_ids: list.map(g => g.id), labels: list.map(g => gameLabel(g, shorts)), teams: list.map(g => g._team),
    media, created_at: nowMs(), expires_at: nowMs() + CHOOSE_MS,
  };
  return reply(menuText(pb), pb);
}

function menuText(pb) {
  const opts = pb.labels.map((l, i) => `${i + 1} for ${l}`);
  const joined = opts.length === 2 ? opts.join(' or ') : opts.slice(0, -1).join(', ') + ', or ' + opts[opts.length - 1];
  return `Which game is this box score for? Reply ${joined}. Reply NO to cancel.`;
}

// ─── entry 2: a text while a box score is waiting ────────────────────────
export async function handlePhotoReply({ from, sender, body, session } = {}) {
  const pb = session && session.pending_box;
  if (!pb || typeof pb !== 'object' || pb.stage === 'cancelled') return { handled: false };
  const r = readReply(body);
  const cleared = withPending(session, null);
  if (!pb.expires_at || nowMs() > pb.expires_at) {
    // A YES / NO / number meant for it gets told; anything else goes on to
    // the score reader with the stale box score dropped (saved here, since
    // the caller saves only handled replies).
    if (r) return { handled: true, reply: brand(TEXT.expired), session: cleared };
    try { await D.saveSession(from, stripId(cleared)); } catch (e) { log('expired clear failed', from, e.message); }
    return { handled: false, session: cleared };
  }
  if (!r) return { handled: false };
  const myTeams = teamsOf(sender);
  const allowed = pb.stage === 'choose' ? (pb.teams || []).some(t => myTeams.includes(t)) : myTeams.includes(pb.team_id);
  if (!sender || sender.active === false || !allowed) {
    return { handled: true, reply: brand(TEXT.notSender), session: cleared };
  }

  if (r.kind === 'no') {
    if (pb.stage === 'reading') {
      return { handled: true, reply: brand(TEXT.cancelled), session: withPending(session, { stage: 'cancelled', job: pb.job, expires_at: pb.expires_at }) };
    }
    return { handled: true, reply: brand(TEXT.cancelled), session: cleared };
  }

  if (pb.stage === 'choose') {
    if (r.kind !== 'choice' || r.n > pb.game_ids.length) {
      return { handled: true, reply: brand(menuText(pb)), session };
    }
    if (!(await boxPhotoEnabled())) return { handled: true, reply: brand(TEXT.off('')), session: cleared };
    const teamId = (pb.teams || [])[r.n - 1];
    const game = await loadGame(pb.game_ids[r.n - 1]);
    if (!game || !myTeams.includes(teamId) || (game.away !== teamId && game.home !== teamId) || calledOff(game)) {
      return { handled: true, reply: brand(TEXT.gameGone), session: cleared };
    }
    const out = await startRead({ from, teamId, game, media: pb.media || [], session, label: pb.labels[r.n - 1] });
    return { handled: true, ...out };
  }

  if (pb.stage === 'reading') return { handled: true, reply: brand(TEXT.stillReading), session };

  if (pb.stage === 'confirm') {
    if (r.kind === 'edit') return { handled: true, reply: brand(TEXT.edit), session };
    if (r.kind === 'choice') return { handled: true, reply: brand('Reply YES to post this box score, or NO to cancel.'), session };
    return { handled: true, ...(await postBox({ from, sender, teamId: pb.team_id, session, pb })) };
  }
  return { handled: false };
}

// ─── YES: post it ─────────────────────────────────────────────────────────
async function postBox({ from, sender, teamId, session, pb }) {
  const cleared = withPending(session, null);
  if (!(await boxPhotoEnabled())) return { reply: brand('Box score photos are turned off right now. Nothing was posted.'), session: cleared };
  let game;
  try { game = await loadGame(pb.game_id); }
  catch (e) { log('game read failed', from, e.message); return { reply: brand(TEXT.tryAgain), session }; }
  if (!game || (game.away !== teamId && game.home !== teamId)) return { reply: brand(TEXT.gameGone), session: cleared };
  if (calledOff(game)) return { reply: brand(TEXT.rainedOut), session: cleared };
  if (isForfeit(game)) return { reply: brand('The commissioner ruled that game a forfeit, so it has no box score. Nothing was posted.'), session: cleared };
  const role = game.home === teamId ? 'home' : 'away';
  const box = { ...pb.box, away: game.away, home: game.home };
  const as = box.away_score, hs = box.home_score;

  // captain.html order: the box score first, then the game's final.
  try {
    await submitBoxScoreServer(game.id, { ...box, timestamp: D.now() }, role, { playoff: !!game.playoff });
  } catch (e) {
    log('box write failed', from, e.message);
    return { reply: brand(TEXT.tryAgain), session };
  }

  let outcome;
  try {
    outcome = await D.reportCaptainFinal({
      gameId: game.id, teamId, away: as, home: hs,
      by: { phone: from, name: clean((sender && sender.name) || '', 80) },
      boxWritten: true,
    });
  } catch (e) {
    // The store's own refusal (the bracket will not take it, the game is off
    // the schedule...) is a sentence for the captain.
    if (e && e.smsReply) return { reply: brand(`The box score is saved, but the score was not posted: ${e.smsReply}`), session: cleared };
    log('reportCaptainFinal failed', from, e && e.message);
    return { reply: brand(TEXT.boxFailed), session };
  }

  const kind = outcome && outcome.kind;
  const conflict = kind === 'disputed' || kind === 'office_stands';
  try {
    // captain.html writes this lane after every box score (setDoc); merged
    // here so anything reportFinal recorded on it stays.
    await fsUpdate(`score_submissions/${game.id}_${role}`, {
      game_id: game.id, away: game.away, home: game.home,
      away_score: as, home_score: hs,
      submitted_by: box.submitted_by, team_id: teamId, team_name: box.submitted_by,
      wk: parseInt(game.wk, 10) || 0, timestamp: D.now(),
      status: conflict ? 'conflict' : 'approved', has_boxscore: true, role, source: 'sms',
    });
  } catch (e) { log('lane write failed', from, e.message); }

  if ((box.away_lineup || []).length || (box.home_lineup || []).length) {
    try { await D.recalcTeamStats([game.away, game.home]); }
    catch (e) { log('stats recalc failed', from, e.message); }
  }
  log('posted ' + (kind || '?'), from, game.id);
  return { reply: brand(postedText(pb, outcome, as, hs)), session: cleared };
}

export function postedText(pb, outcome, as, hs) {
  const kind = outcome && outcome.kind;
  const mine = scoreLine(pb, as, hs);
  const when = pb.when ? ` (${pb.when})` : '';
  if (kind === 'published') return `Posted: ${mine}${when}. The box score and stats are on the site.`;
  if (kind === 'agreed') return `Posted the box score. ${mine} matches the score already on the site.`;
  if (kind === 'office_stands') {
    return `Box score saved. The commissioner already set the final at ${scoreLine(pb, outcome.officeAway, outcome.officeHome)}, so that score stays.`;
  }
  if (kind === 'disputed') {
    const theirs = outcome.otherAway != null && outcome.otherHome != null ? ` (${scoreLine(pb, outcome.otherAway, outcome.otherHome)})` : '';
    const whose = outcome.otherSide === 'site' ? 'the score on the site' : `the other team's score`;
    return `Box score saved, but your score (${mine}) does not match ${whose}${theirs}. The score on the site stays and the commissioner will sort it out.`;
  }
  return `Posted the box score for ${mine}${when}.`;
}

// ─── captain.html submitBoxScoreUnified, server side ─────────────────────
// First submission (or the same side again): replace the doc, keeping the
// other side's already-submitted data when this one left that side empty.
// Second side: merge only this side's lineup/pitchers/score/linescore and
// record per-player and score discrepancies.
export async function submitBoxScoreServer(gameId, boxScoreData, myRole, { playoff = false } = {}) {
  const path = `box_scores/${gameId}`;
  const existing = await fsGet(path);
  const nowIso = new Date().toISOString();

  if (!existing || !existing.first_submitter || existing.first_submitter === myRole) {
    const otherRole = myRole === 'away' ? 'home' : 'away';
    const isEmpty = v => !Array.isArray(v) || v.length === 0;
    const preserved = {};
    if (existing) {
      const newOther = boxScoreData[`${otherRole}_lineup`] || boxScoreData[`${otherRole}Batters`];
      const oldOther = existing[`${otherRole}_lineup`] || existing[`${otherRole}Batters`];
      if (isEmpty(newOther) && !isEmpty(oldOther)) {
        preserved[`${otherRole}_lineup`] = existing[`${otherRole}_lineup`] || oldOther;
        preserved[`${otherRole}Batters`] = existing[`${otherRole}Batters`] || oldOther;
        [`${otherRole}_pitchers`, `${otherRole}_score`, `${otherRole}_score_only`,
          `${otherRole}_linescore`, `${otherRole}_hits`, `${otherRole}_errors`,
          `${otherRole}_errors_detail`].forEach(f => {
          if (existing[f] !== undefined) preserved[f] = existing[f];
        });
        if (existing.linescores && existing.linescores[otherRole] !== undefined) {
          preserved.linescores = { ...(boxScoreData.linescores || {}), [otherRole]: existing.linescores[otherRole] };
        }
        if (existing.second_submitter) preserved.second_submitter = existing.second_submitter;
        if (existing.has_discrepancy) {
          preserved.has_discrepancy = existing.has_discrepancy;
          preserved.discrepancies = existing.discrepancies || [];
        }
      }
    }
    await fsSet(path, {
      has_discrepancy: false,
      discrepancies: [],
      ...boxScoreData,
      ...preserved,
      first_submitter: (existing && existing.first_submitter) || myRole,
      created_at: (existing && existing.created_at) || nowIso,
      updated_at: nowIso,
    });
    return { firstSubmission: !existing, hasDiscrepancy: !!preserved.has_discrepancy };
  }

  const discrepancies = [];
  const newAway = boxScoreData.away_score ?? 0;
  const newHome = boxScoreData.home_score ?? 0;
  if (newAway !== (existing.away_score || 0) || newHome !== (existing.home_score || 0)) {
    discrepancies.push({
      type: 'score',
      first_submitter: existing.first_submitter,
      second_submitter: myRole,
      first_away: existing.away_score, first_home: existing.home_score,
      second_away: newAway, second_home: newHome,
    });
  }
  ['away', 'home'].forEach(side => {
    const firstLineup = existing[`${side}_lineup`] || existing[`${side}Batters`] || [];
    const secondLineup = boxScoreData[`${side}_lineup`] || boxScoreData[`${side}Batters`] || [];
    const firstByName = {};
    firstLineup.forEach(p => { firstByName[p.name] = p; });
    secondLineup.forEach(p => {
      const prev = firstByName[p.name];
      if (!prev) return;
      const keys = ['ab', 'h', 'r', 'rbi', 'bb'];
      const diffs = keys.filter(k => (p[k] || 0) !== (prev[k] || 0));
      if (diffs.length > 0) {
        discrepancies.push({
          type: 'batting', player: p.name, side,
          first_submitter: existing.first_submitter,
          second_submitter: myRole,
          first: Object.fromEntries(keys.map(k => [k, prev[k] || 0])),
          second: Object.fromEntries(keys.map(k => [k, p[k] || 0])),
        });
      }
    });
  });
  const mergeUpdate = {
    [`${myRole}_lineup`]: boxScoreData[`${myRole}_lineup`] || boxScoreData[`${myRole}Batters`] || [],
    [`${myRole}_pitchers`]: boxScoreData[`${myRole}_pitchers`] || [],
    [`${myRole}_score`]: boxScoreData[`${myRole}_score`],
    [`${myRole}_score_only`]: !!boxScoreData[`${myRole}_score_only`],
    second_submitter: myRole,
    has_discrepancy: discrepancies.length > 0,
    discrepancies,
    second_submitted_at: nowIso,
  };
  const ls = (boxScoreData.linescores && boxScoreData.linescores[myRole]) ?? boxScoreData[`${myRole}_linescore`];
  if (ls) {
    // captain.html sets the nested field `linescores.<side>`; the REST helper
    // masks top-level fields, so the map is merged here.
    mergeUpdate.linescores = { ...(existing.linescores || {}), [myRole]: ls };
    mergeUpdate[`${myRole}_linescore`] = ls;
  }
  await fsUpdate(path, mergeUpdate);
  if (discrepancies.length > 0 && !playoff) {
    await fsUpdate(`games/${gameId}`, { has_discrepancy: true }, { mustExist: true }).catch(() => {});
  }
  return { firstSubmission: false, hasDiscrepancy: discrepancies.length > 0 };
}
