// Text a Score for DVSL: the InboundStore the conversation engine (core.js,
// handleInboundText) talks to, over Firestore through api/_lib/dvsl.js
// (service account). One league, one number.
//
// The score rules are captain.html's, line for line (submitScore, the
// "First-submit-wins" block), so a texted final and a portal final can never
// disagree about who wins:
//   * The first report posts and finalizes the game (done, score_confirmed).
//   * The same side may correct its own report while the other side has not
//     reported (score_submitted_{side}_* on the games doc says who reported).
//   * A later report that matches is recorded ("agreed").
//   * A later report that DIFFERS is recorded in its lane, sets
//     score_conflict, LEAVES the final up, and alerts the commissioner.
// Every report writes score_submissions/{gid}_{away|home} (the lane) and,
// when no box score with lineups exists yet, a score-only box_scores/{gid}.
// After a final lands, standings are recomputed (./standings.js).
//
// Playoff games (po__gold_3) have no games doc. Their final goes into the
// bracket through api/account.js actPlayoffScore, the same code the captain
// portal calls, so all its checks apply (side of the game, lock once played,
// no ties, a later game already played). Sides come from playoff_games/{id}.
//
// A sender is a row in sms_senders/{phoneDocId}: role 'captain' with
// team_id (or team_ids) reports through the rules above; role 'admin' is the
// commissioner, whose word is final (admin.html resolveConflict semantics).
//
// UNDO puts back exactly what the write changed (game fields, the lane, the
// score-only box score) unless someone reported or ruled since, in which case
// the site is left alone and the texter is told.
//
// When a write must be refused with a sentence of its own (a playoff score the
// bracket will not take, a game someone is live scoring), the store throws
// ReplyError; api/sms-inbound.js sends its .smsReply as the answer.
import { fsGet, fsQuery, fsCreate, fsSet, fsUpdate, fsDelete } from '../_lib/dvsl.js';
import { isPlayed, parseBracketField } from '../_lib/bracket.js';
import { sendPush } from '../_lib/push.js';
import { actPlayoffScore, HttpError } from '../account.js';
import { recalcStandings } from './standings.js';
import { phoneDocId, lastFour } from './ids.js';

export const LEAGUE = { id: 'dvsl', name: 'DVSL', abbrev: 'DVSL', timezone: 'America/New_York', sport: 'softball' };
export const SITE_BASE = (process.env.SITE_BASE || 'https://dvsl.vercel.app').replace(/\/+$/, '');
const BRACKETS_ID = '__playoff_brackets';
export const PO_RE = /^po__(gold|silver)_([0-9]+)$/;
const LIVE_FRESH_MS = 60 * 60 * 1000;   // index.html hides a LIVE badge after 60 min
const PUSH_TIMEOUT_MS = 4000;

export class ReplyError extends Error {
  constructor(reply, code = 'refused') { super(reply); this.smsReply = reply; this.code = code; }
}

const other = (side) => (side === 'home' ? 'away' : 'home');
const num = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();
const isoNow = () => new Date().toISOString();
const uniq = (a) => [...new Set(a)];

// Timestamps come back from fsGet as ISO strings. When a saved doc is written
// back by UNDO, these fields go back as timestamps, as the browser wrote them.
const TS_FIELDS = new Set(['timestamp', 'liveAt', 'live_owner_started_at']);
function revive(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const out = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === 'id') continue;
    out[k] = TS_FIELDS.has(k) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v;
  }
  return out;
}

// ─── reads ─────────────────────────────────────────────────────────────────
export async function loadTeams() {
  return (await fsQuery('teams')).filter(t => t.id !== BRACKETS_ID);
}
function teamIndex(teams) {
  const byId = new Map(teams.map(t => [t.id, t]));
  // Games store team ids; an odd row may carry the short name (captain.html
  // looks both up), so resolve that too.
  const resolve = (x) => {
    if (byId.has(x)) return x;
    const k = lc(x);
    const t = teams.find(t => lc(t.short) === k || lc(t.name) === k);
    return t ? t.id : x;
  };
  const full = (id) => (byId.get(id) && byId.get(id).name) || id || '';
  const short = (id) => { const t = byId.get(id); return t ? (t.short || t.name) : String(id || '???').toUpperCase(); };
  return { byId, resolve, full, short };
}

export async function loadBracket() {
  const d = await fsGet(`teams/${BRACKETS_ID}`);
  return { gold: parseBracketField(d && d.gold), silver: parseBracketField(d && d.silver) };
}

function liveFresh(g, nowMs) {
  if (g.live !== true || !g.liveAt) return false;
  const t = Date.parse(g.liveAt);
  return Number.isFinite(t) && nowMs - t < LIVE_FRESH_MS;
}

/** A games doc -> the engine's StoreGame. */
export function toStoreGame(g, idx, nowMs = Date.now()) {
  const as = num(g.away_score), hs = num(g.home_score);
  let status = null;
  if (g.done === true && as !== null && hs !== null) status = 'final';
  else if (g.ppd || g.rained_out) status = 'postponed';
  else if (liveFresh(g, nowMs)) status = 'live';
  return {
    id: g.id,
    date: String(g.date_iso || '').slice(0, 10),
    time: g.time_24 || g.time || null,
    field: g.field || null,
    division: null,
    status,
    away_team_id: idx.resolve(g.away),
    home_team_id: idx.resolve(g.home),
    away_score: status === 'final' || status === 'live' ? as : null,
    home_score: status === 'final' || status === 'live' ? hs : null,
    current_inning: status === 'live' ? num(g.inning) : null,
    current_half: status === 'live' ? (g.half || null) : null,
  };
}

/** Decided playoff games (both sides known) dated fromYmd..toYmd. */
export function playoffStoreGames(brackets, pgDocs, fromYmd, toYmd) {
  const out = [];
  for (const pg of pgDocs) {
    const m = PO_RE.exec(pg.id || '');
    if (!m || !pg.away || !pg.home) continue;
    const t = brackets[m[1]];
    const game = t && t.games.find(x => x.g === Number(m[2]));
    if (!game) continue;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(game.date || '') ? game.date : '';
    if (!date || date < fromYmd || date > toYmd) continue;
    const played = isPlayed(game);
    out.push({
      id: pg.id, date, time: game.time || null, field: game.field || null, division: null,
      status: played ? 'final' : null,
      away_team_id: pg.away, home_team_id: pg.home,
      away_score: played ? num(game.as) : null, home_score: played ? num(game.hs) : null,
      current_inning: null, current_half: null,
    });
  }
  return out;
}

// ─── side effects that never fail the text ────────────────────────────────
async function push(opts) {
  try {
    await Promise.race([
      sendPush(opts, { senderRole: 'system' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('push timeout')), PUSH_TIMEOUT_MS)),
    ]);
  } catch (e) { console.warn('[sms] push failed:', e && e.message); }
}
async function activity(action, details, by) {
  try {
    await fsCreate('activity_log', {
      action: String(action).slice(0, 200),
      details: String(details).slice(0, 2000),
      timestamp: new Date(),
      user: `text from ${by && by.name ? String(by.name).slice(0, 60) : 'captain'} (…${lastFour(by && by.phone)})`,
    });
  } catch (e) { console.warn('[sms] activity_log failed:', e && e.message); }
}
async function recalc() {
  try { await recalcStandings(); } catch (e) { console.warn('[sms] standings recalc failed:', e && e.message); }
}

// captain.html sendFinalScorePush / sendScoreSubmittedPush / sendScoreConflictAlert
function finalPush(meta, idx, as, hs) {
  const parts = [];
  if (meta.wk && meta.wk !== 'PL') parts.push(`Week ${meta.wk}`);
  if (meta.date) parts.push(meta.date);
  return push({
    title: `Final: ${idx.full(meta.away)} ${as}, ${idx.full(meta.home)} ${hs}`,
    body: parts.join(' · ') || 'Game final',
    category: 'scores', gameId: meta.id, teams: [meta.away, meta.home], url: `/#game/${meta.id}`,
  });
}
function submittedPush(meta, idx, as, hs, by) {
  const parts = [];
  if (by) parts.push(`by ${by}`);
  if (meta.wk && meta.wk !== 'PL') parts.push(`Week ${meta.wk}`);
  if (meta.date) parts.push(meta.date);
  return push({
    title: `Score submitted: ${idx.full(meta.away)} ${as}, ${idx.full(meta.home)} ${hs}`,
    body: parts.join(' · ') || 'Awaiting confirmation from the other captain',
    category: 'scores', gameId: meta.id, teams: [meta.away, meta.home], url: `/#game/${meta.id}`,
  });
}
function conflictPush(meta, idx, as, hs, oa, oh) {
  return push({
    title: `🔔 Score conflict: ${idx.full(meta.away)} @ ${idx.full(meta.home)}`,
    body: `Captains disagree — one says ${as}-${hs}, other says ${oa}-${oh}. Review on admin.`,
    category: 'admin', adminOnly: true, gameId: meta.id, url: '/admin.html',
  });
}

// ─── score-only box score (captain.html submitScore -> submitBoxScoreUnified) ──
// Written only when no box score with lineups exists. Covers the two cases
// captain.html completes: no doc yet, or a doc this side started. When the
// OTHER side started the doc, captain.html's merge throws on an undefined
// field and writes nothing (caught as non-fatal); that is matched by writing
// nothing here too.
async function writeScoreOnlyBox(meta, side, away, home, teamName, teamId, finalStatus) {
  const ref = `box_scores/${meta.id}`;
  const existing = await fsGet(ref);
  const nA = ((existing && (existing.away_lineup || existing.awayBatters)) || []).length;
  const nH = ((existing && (existing.home_lineup || existing.homeBatters)) || []).length;
  if (existing && (nA > 0 || nH > 0)) return { touched: false };
  if (existing && existing.first_submitter && existing.first_submitter !== side) return { touched: false };
  const now = isoNow();
  await fsSet(ref, {
    has_discrepancy: false,
    discrepancies: [],
    game_id: meta.id, week: meta.wk || 0, date: meta.date || '', field: meta.field || '',
    away: meta.away, home: meta.home,
    away_score: away, home_score: home,
    score_only: true,
    [`${side}_score_only`]: true,
    submitted_by: teamName, submitted_by_id: teamId,
    status: finalStatus, timestamp: new Date(),
    first_submitter: (existing && existing.first_submitter) || side,
    created_at: (existing && existing.created_at) || now,
    updated_at: now,
  });
  return { touched: true, prev: existing || null };
}

// The lane doc, captain.html submitScore `subData`.
function laneDoc(meta, side, away, home, teamName, teamId, finalStatus) {
  return {
    game_id: meta.id, away: meta.away, home: meta.home,
    away_score: away, home_score: home,
    submitted_by: teamName, team_id: teamId, team_name: teamName,
    wk: parseInt(meta.wk, 10) || 0,
    timestamp: new Date(), status: finalStatus, role: side,
    source: 'sms',
  };
}

// ─── a captain's final ─────────────────────────────────────────────────────
//
// reportCaptainFinal is exported for the box-score-by-photo flow too: after
// it writes the full box score itself it calls this with boxWritten:true, so
// the score-only box score is skipped. Returns a core ReportOutcome with a
// `prev` the store can UNDO from.
export async function reportCaptainFinal({ gameId, teamId, away, home, by, boxWritten = false }) {
  if (!Number.isInteger(away) || !Number.isInteger(home) || away < 0 || home < 0 || away > 99 || home > 99) {
    throw new ReplyError('Scores must be whole numbers from 0 to 99.', 'bad-score');
  }
  const teams = await loadTeams();
  const idx = teamIndex(teams);
  const teamName = idx.full(teamId);
  if (PO_RE.test(gameId)) return reportPlayoff({ gameId, teamId, teamName, away, home, by, boxWritten, idx });

  const g = await fsGet(`games/${gameId}`);
  if (!g) throw new ReplyError('That game is no longer on the schedule.', 'no-game');
  const meta = { id: gameId, wk: g.wk, date: g.date, field: g.field, away: idx.resolve(g.away), home: idx.resolve(g.home) };
  const side = meta.home === teamId ? 'home' : meta.away === teamId ? 'away' : null;
  if (!side) throw new ReplyError('Your team is not in that game.', 'not-your-game');
  const oth = other(side);

  const wasDone = !!g.done;
  const iAlready = g[`score_submitted_${side}_away`] !== undefined;
  const otherHas = g[`score_submitted_${oth}_away`] !== undefined;
  const update = {
    [`score_submitted_${side}_away`]: away,
    [`score_submitted_${side}_home`]: home,
    [`score_submitted_${side}_by`]: teamName,
  };
  let finalStatus = 'approved';
  let outcome;
  const prevScore = { status: wasDone ? 'final' : (g.ppd || g.rained_out) ? 'postponed' : null, away_score: num(g.away_score), home_score: num(g.home_score) };

  if (!wasDone || (iAlready && !otherHas)) {
    Object.assign(update, { done: true, away_score: away, home_score: home, score_confirmed: true, score_pending: false, score_conflict: false });
    // A text-claimed (or unowned) LIVE flag would keep the LIVE badge on a final.
    if (g.live === true && (!g.live_owner || g.live_owner === side)) Object.assign(update, { live: false, live_owner: null });
    outcome = { kind: 'published' };
  } else {
    const storedAway = typeof g.away_score === 'number' ? g.away_score : away;
    const storedHome = typeof g.home_score === 'number' ? g.home_score : home;
    if (storedAway !== away || storedHome !== home) {
      update.score_conflict = true;
      finalStatus = 'conflict';
      outcome = { kind: 'disputed', otherAway: storedAway, otherHome: storedHome, otherSide: otherHas ? oth : 'site' };
    } else {
      outcome = { kind: 'agreed', with: otherHas ? 'coach' : 'site' };
    }
  }

  // Snapshot for UNDO: exactly the fields this write touches.
  const keys = Object.keys(update);
  const before = {}, absent = [];
  for (const k of keys) { if (g[k] === undefined) absent.push(k); else before[k] = g[k]; }
  const [laneBefore] = await Promise.all([fsGet(`score_submissions/${gameId}_${side}`)]);

  if (outcome.kind === 'disputed') {
    await activity('Score Conflict', `Late captain submission on game ${gameId} disagrees with final: stored ${idx.short(meta.away)} ${outcome.otherAway}–${idx.short(meta.home)} ${outcome.otherHome}; ${teamName} said ${away}–${home}. (by text)`, by);
    await conflictPush(meta, idx, away, home, outcome.otherAway, outcome.otherHome);
  }
  await fsUpdate(`games/${gameId}`, update, { mustExist: true });
  let box = { touched: false };
  if (!boxWritten) {
    try { box = await writeScoreOnlyBox(meta, side, away, home, teamName, teamId, finalStatus); }
    catch (e) { console.warn('[sms] box_scores write skipped/failed (non-fatal):', e && e.message); }
  }
  if (update.done && !wasDone) await finalPush(meta, idx, away, home);
  else if (!update.done) await submittedPush(meta, idx, away, home, teamName);
  if (update.done) await recalc();
  await fsSet(`score_submissions/${gameId}_${side}`, laneDoc(meta, side, away, home, teamName, teamId, finalStatus));
  await activity('Score Submission', `${teamName}: ${idx.short(meta.away)} ${away} – ${idx.short(meta.home)} ${home} (by text)`, by);

  const prev = {
    ...prevScore,
    dvsl: {
      kind: 'game', side, wrote: { away, home }, published: outcome.kind === 'published', otherHad: otherHas,
      before, absent, lane: laneBefore ? revive(laneBefore) : null,
      boxTouched: !!box.touched, boxPrev: box.touched && box.prev ? revive(box.prev) : null,
    },
  };
  return { ...outcome, prev };
}

async function reportPlayoff({ gameId, teamId, teamName, away, home, by, boxWritten, idx }) {
  const [, key, gs] = PO_RE.exec(gameId);
  const gnum = Number(gs);
  const [pg, brackets] = await Promise.all([fsGet(`playoff_games/${gameId}`), loadBracket()]);
  const t = brackets[key];
  const game = t && t.games.find(x => x.g === gnum);
  if (!pg || !game) throw new ReplyError('That playoff game is not in the bracket.', 'no-game');
  const side = pg.home === teamId ? 'home' : pg.away === teamId ? 'away' : null;
  if (!side) throw new ReplyError('Your team is not in that playoff game.', 'not-your-game');
  const oth = other(side);
  const [laneBefore, otherLane] = await Promise.all([
    fsGet(`score_submissions/${gameId}_${side}`), fsGet(`score_submissions/${gameId}_${oth}`),
  ]);
  const meta = { id: gameId, wk: 'PL', date: game.date || '', field: game.field || '', away: pg.away, home: pg.home };
  const played = isPlayed(game);
  // Same side correcting itself: the bracket records who scored it (sub),
  // and actPlayoffScore allows exactly that case.
  const iAlready = game.sub === side;
  const otherHas = !!otherLane;
  const prevScore = { status: played ? 'final' : null, away_score: played ? num(game.as) : null, home_score: played ? num(game.hs) : null };
  let outcome, finalStatus = 'approved';

  if (!played || (iAlready && !otherHas)) {
    try {
      await actPlayoffScore(null, { bracket: key, g: gnum, as: away, hs: home },
        { admin: false, captain_teams: [teamId], member_teams: [teamId], player_ids: [] });
    } catch (e) {
      if (e instanceof HttpError || (e && e.status && e.code)) throw new ReplyError(e.message, e.code);
      throw e;
    }
    outcome = { kind: 'published' };
  } else {
    const sa = num(game.as), sh = num(game.hs);
    if (sa !== away || sh !== home) {
      finalStatus = 'conflict';
      outcome = { kind: 'disputed', otherAway: sa, otherHome: sh, otherSide: otherHas ? oth : 'site' };
      await activity('Score Conflict', `Late captain submission on game ${gameId} disagrees with final: stored ${idx.short(meta.away)} ${sa}–${idx.short(meta.home)} ${sh}; ${teamName} said ${away}–${home}. (by text)`, by);
      await conflictPush(meta, idx, away, home, sa, sh);
    } else {
      outcome = { kind: 'agreed', with: otherHas ? 'coach' : 'site' };
    }
  }
  let box = { touched: false };
  if (!boxWritten) {
    try { box = await writeScoreOnlyBox(meta, side, away, home, teamName, teamId, finalStatus); }
    catch (e) { console.warn('[sms] box_scores write skipped/failed (non-fatal):', e && e.message); }
  }
  if (outcome.kind === 'published' && !played) await finalPush(meta, idx, away, home);
  else if (outcome.kind !== 'published') await submittedPush(meta, idx, away, home, teamName);
  await fsSet(`score_submissions/${gameId}_${side}`, laneDoc(meta, side, away, home, teamName, teamId, finalStatus));
  await activity('Score Submission', `${teamName}: ${idx.short(meta.away)} ${away} – ${idx.short(meta.home)} ${home} (by text)`, by);
  const prev = {
    ...prevScore,
    dvsl: {
      kind: 'po', side, wrote: { away, home }, published: outcome.kind === 'published', otherHad: otherHas,
      prevAs: played ? num(game.as) : null, prevHs: played ? num(game.hs) : null, prevSub: game.sub || null,
      lane: laneBefore ? revive(laneBefore) : null,
      boxTouched: !!box.touched, boxPrev: box.touched && box.prev ? revive(box.prev) : null,
    },
  };
  return { ...outcome, prev };
}

// Put the lane and the score-only box score back the way they were.
async function restoreLaneAndBox(gameId, side, d) {
  if (d.lane) await fsSet(`score_submissions/${gameId}_${side}`, d.lane);
  else await fsDelete(`score_submissions/${gameId}_${side}`);
  if (d.boxTouched) {
    const cur = await fsGet(`box_scores/${gameId}`);
    const hasLineups = cur && (((cur.away_lineup || cur.awayBatters || []).length) || ((cur.home_lineup || cur.homeBatters || []).length));
    if (cur && !hasLineups) {
      if (d.boxPrev) await fsSet(`box_scores/${gameId}`, d.boxPrev);
      else await fsDelete(`box_scores/${gameId}`);
    }
  }
}

async function restoreCaptain(gameId, prev, by) {
  const d = prev.dvsl;
  const shownOf = (g) => ({
    status: g && g.done ? 'final' : g && (g.ppd || g.rained_out) ? 'postponed' : null,
    away_score: g ? num(g.away_score) : null, home_score: g ? num(g.home_score) : null,
  });
  if (d.kind === 'po') {
    const [, key, gs] = PO_RE.exec(gameId);
    const t = (await loadBracket())[key];
    const game = t && t.games.find(x => x.g === Number(gs));
    if (!game) return { shown: prev, kept: 'newer_report' };
    const cur = { status: isPlayed(game) ? 'final' : null, away_score: num(game.as), home_score: num(game.hs) };
    const otherLane = await fsGet(`score_submissions/${gameId}_${other(d.side)}`);
    if (d.published) {
      if (cur.away_score !== d.wrote.away || cur.home_score !== d.wrote.home || game.sub !== d.side || (!d.otherHad && otherLane)) {
        return { shown: cur, kept: 'newer_report' };
      }
      const pg = await fsGet(`playoff_games/${gameId}`);
      const teamId = pg && pg[d.side];
      // Putting "no score" back needs the commissioner's path (captains
      // cannot write a null). It is the texter's own write within the hour,
      // checked above, so the server does it on their behalf.
      const roles = d.prevAs === null
        ? { admin: true, captain_teams: [], member_teams: [], player_ids: [] }
        : { admin: false, captain_teams: [teamId], member_teams: [teamId], player_ids: [] };
      try {
        await actPlayoffScore(null, { bracket: key, g: Number(gs), as: d.prevAs, hs: d.prevHs }, roles);
      } catch (e) {
        if (e instanceof HttpError || (e && e.status && e.code)) throw new ReplyError(`That could not be undone: ${e.message}`, e.code);
        throw e;
      }
    } else if (!d.otherHad && otherLane) {
      return { shown: cur, kept: 'newer_report' };
    }
    await restoreLaneAndBox(gameId, d.side, d);
    await activity('Score Submission', `Undone by text: ${gameId} (${d.side})`, by);
    return { shown: { status: d.prevAs === null ? null : 'final', away_score: d.prevAs, home_score: d.prevHs } };
  }

  const g = await fsGet(`games/${gameId}`);
  if (!g) return { shown: prev, kept: 'newer_report' };
  const side = d.side, oth = other(side);
  const mine = g[`score_submitted_${side}_away`] === d.wrote.away && g[`score_submitted_${side}_home`] === d.wrote.home;
  const otherNew = !d.otherHad && g[`score_submitted_${oth}_away`] !== undefined;
  const siteMoved = d.published && (num(g.away_score) !== d.wrote.away || num(g.home_score) !== d.wrote.home || g.done !== true);
  if (!mine || otherNew || siteMoved) return { shown: shownOf(g), kept: 'newer_report' };

  await fsUpdate(`games/${gameId}`, revive(d.before), { mustExist: true, remove: d.absent || [] });
  await restoreLaneAndBox(gameId, side, d);
  if (d.published) await recalc();
  await activity('Score Submission', `Undone by text: ${gameId} (${side})`, by);
  const after = { ...g, ...d.before };
  for (const k of d.absent || []) delete after[k];
  return { shown: shownOf(after) };
}

// ─── the commissioner's final (admin.html resolveConflict) ────────────────
async function writeOfficeFinal(gameId, away, home, by) {
  const idx = teamIndex(await loadTeams());
  if (PO_RE.test(gameId)) {
    const [, key, gs] = PO_RE.exec(gameId);
    const t = (await loadBracket())[key];
    const game = t && t.games.find(x => x.g === Number(gs));
    if (!game) throw new ReplyError('That playoff game is not in the bracket.', 'no-game');
    const played = isPlayed(game);
    try {
      await actPlayoffScore(null, { bracket: key, g: Number(gs), as: away, hs: home }, { admin: true, captain_teams: [], member_teams: [], player_ids: [] });
    } catch (e) {
      if (e instanceof HttpError || (e && e.status && e.code)) throw new ReplyError(e.message, e.code);
      throw e;
    }
    const pg = await fsGet(`playoff_games/${gameId}`);
    if (!played && pg) await finalPush({ id: gameId, wk: 'PL', date: game.date, away: pg.away, home: pg.home }, idx, away, home);
    await activity('Score Conflict', `Commissioner by text: ${gameId} ${away}–${home}`, by);
    return { prev: { status: played ? 'final' : null, away_score: played ? num(game.as) : null, home_score: played ? num(game.hs) : null,
      dvsl: { kind: 'po-office', prevAs: played ? num(game.as) : null, prevHs: played ? num(game.hs) : null, wrote: { away, home } } } };
  }
  const g = await fsGet(`games/${gameId}`);
  if (!g) throw new ReplyError('That game is no longer on the schedule.', 'no-game');
  const box = await fsGet(`box_scores/${gameId}`);
  const boxStillDiffers = !!(box && box.has_discrepancy === true && Array.isArray(box.discrepancies) && box.discrepancies.length > 0);
  const update = { away_score: away, home_score: home, done: true, score_conflict: false, score_pending: false, score_confirmed: true, last_edited_by: `text: ${String(by.name || 'commissioner').slice(0, 60)}`, last_edited_at: isoNow() };
  if (!boxStillDiffers) update.has_discrepancy = false;
  const before = {}, absent = [];
  for (const k of Object.keys(update)) { if (g[k] === undefined) absent.push(k); else before[k] = g[k]; }
  await fsUpdate(`games/${gameId}`, update, { mustExist: true });
  if (box) await fsUpdate(`box_scores/${gameId}`, { away_score: away, home_score: home });
  const lanes = {};
  for (const side of ['away', 'home']) {
    const lane = await fsGet(`score_submissions/${gameId}_${side}`);
    if (!lane) continue;
    lanes[side] = lane.status === undefined ? null : lane.status;
    const status = (Number(lane.away_score) === away && Number(lane.home_score) === home) ? 'approved' : 'rejected';
    await fsUpdate(`score_submissions/${gameId}_${side}`, { status });
  }
  const meta = { id: gameId, wk: g.wk, date: g.date, away: idx.resolve(g.away), home: idx.resolve(g.home) };
  if (!g.done) await finalPush(meta, idx, away, home);
  await activity('Score Conflict', `Admin resolved (by text): ${idx.short(meta.away)} ${away} – ${idx.short(meta.home)} ${home}`, by);
  await recalc();
  return { prev: {
    status: g.done ? 'final' : (g.ppd || g.rained_out) ? 'postponed' : null, away_score: num(g.away_score), home_score: num(g.home_score),
    dvsl: { kind: 'office', before, absent, lanes, boxPrev: box ? { away_score: box.away_score ?? null, home_score: box.home_score ?? null } : null, wrote: { away, home } },
  } };
}

async function restoreOffice(gameId, prev, by) {
  const d = prev.dvsl || {};
  if (d.kind === 'po-office') {
    const [, key, gs] = PO_RE.exec(gameId);
    try {
      await actPlayoffScore(null, { bracket: key, g: Number(gs), as: d.prevAs, hs: d.prevHs }, { admin: true, captain_teams: [], member_teams: [], player_ids: [] });
    } catch (e) {
      if (e instanceof HttpError || (e && e.status && e.code)) throw new ReplyError(`That could not be undone: ${e.message}`, e.code);
      throw e;
    }
    return { shown: { status: d.prevAs === null ? null : 'final', away_score: d.prevAs, home_score: d.prevHs } };
  }
  const g = await fsGet(`games/${gameId}`);
  if (!g) return;
  if (num(g.away_score) !== d.wrote.away || num(g.home_score) !== d.wrote.home) {
    return { shown: { status: g.done ? 'final' : null, away_score: num(g.away_score), home_score: num(g.home_score) }, kept: 'newer_report' };
  }
  await fsUpdate(`games/${gameId}`, d.before || {}, { mustExist: true, remove: d.absent || [] });
  if (d.boxPrev) await fsUpdate(`box_scores/${gameId}`, d.boxPrev).catch(() => {});
  for (const [side, status] of Object.entries(d.lanes || {})) {
    await fsUpdate(`score_submissions/${gameId}_${side}`, status === null ? {} : { status }, status === null ? { remove: ['status'] } : {}).catch(() => {});
  }
  await activity('Score Conflict', `Commissioner's text final undone: ${gameId}`, by);
  await recalc();
}

// ─── the store ─────────────────────────────────────────────────────────────
const SESSION_KEYS = ['pending', 'last_write', 'asked', 'last_unread_email', 'fan_day', 'fan_n'];

export async function getSender(fromE164) {
  const id = phoneDocId(fromE164);
  if (!id) return null;
  const s = await fsGet(`sms_senders/${id}`);
  if (!s || s.active === false) return null;
  const teamIds = uniq([...(Array.isArray(s.team_ids) ? s.team_ids : []), s.team_id].filter(x => typeof x === 'string' && x));
  return { id, phone: s.phone || fromE164, name: s.name || '', role: s.role === 'admin' ? 'admin' : 'captain', team_id: teamIds[0] || null, team_ids: teamIds, source: s.source || null };
}

export async function getSessionDoc(fromE164) {
  const id = phoneDocId(fromE164);
  return id ? fsGet(`sms_sessions/${id}`) : null;
}

/** Write the engine's Session keys, leaving any other field (pending_box) alone.
 *  withBox:true also writes (or clears) pending_box, for the photo flow,
 *  which hands back the whole session object. */
export async function saveSession(fromE164, session, { withBox = false } = {}) {
  const id = phoneDocId(fromE164);
  if (!id) return;
  const s = session || {};
  const obj = { phone: fromE164, updated_at: new Date() };
  const remove = [];
  for (const k of withBox ? [...SESSION_KEYS, 'pending_box'] : SESSION_KEYS) {
    if (s[k] === undefined || s[k] === null) remove.push(k); else obj[k] = s[k];
  }
  await fsUpdate(`sms_sessions/${id}`, obj, { remove });
}

export function dvslStore() {
  const senders = new Map();   // e164 -> sender (one request's worth)
  const senderFor = async (e164) => {
    if (!senders.has(e164)) senders.set(e164, await getSender(e164));
    return senders.get(e164);
  };
  let teamsCache = null;
  const teams = async () => (teamsCache = teamsCache || await loadTeams());
  const sideFor = (sender, g) => {
    if (!sender || sender.role === 'admin') return 'admin';
    if (sender.team_ids.includes(g.home)) return 'home';
    if (sender.team_ids.includes(g.away)) return 'away';
    return null;
  };

  return {
    async senderLeagues(from) {
      const s = await senderFor(from);
      if (!s) return [];
      // A captain row with no team is never treated as the commissioner.
      if (s.role !== 'admin' && !s.team_ids.length) return [];
      return [{ leagueId: LEAGUE.id, name: s.name || (s.role === 'admin' ? 'Commissioner' : 'Captain'), teamIds: s.role === 'admin' ? [] : s.team_ids }];
    },
    async leagueForNumber() { return LEAGUE.id; },
    async league(id) { return id === LEAGUE.id ? LEAGUE : null; },

    async gamesBetween(leagueId, fromYmd, toYmd) {
      const [ts, games, pgs] = await Promise.all([
        teams(),
        fsQuery('games', [['date_iso', '>=', fromYmd], ['date_iso', '<=', toYmd]]),
        fsQuery('playoff_games'),
      ]);
      const idx = teamIndex(ts);
      const nowMs = Date.now();
      const out = games.filter(g => g.away && g.home).map(g => toStoreGame(g, idx, nowMs));
      const decided = pgs.filter(p => p.away && p.home);
      if (decided.length) out.push(...playoffStoreGames(await loadBracket(), decided, fromYmd, toYmd));
      return out;
    },
    async teams() {
      return (await teams()).map(t => ({
        id: t.id, name: t.name || t.id, abbrev: t.short || null, nickname: null, short_name: null,
        division: null, ageGroup: null, active: t.active !== false,
      }));
    },
    async standings() {
      return (await teams()).filter(t => t.active !== false).map(t => ({
        teamId: t.id, name: t.name || t.id, division: '', ageGroup: '',
        w: num(t.w) || 0, l: num(t.l) || 0, t: num(t.ti) || 0, pct: num(t.pct) || 0,
      })).sort((a, b) => b.pct - a.pct || b.w - a.w || a.l - b.l || a.name.localeCompare(b.name));
    },

    async getSession(from) {
      const d = await getSessionDoc(from);
      if (!d) return null;
      const s = {};
      for (const k of SESSION_KEYS) if (d[k] !== undefined && d[k] !== null) s[k] = d[k];
      return s;
    },
    async setSession(from, session) { await saveSession(from, session); },

    async writeFinal(leagueId, gameId, away, home, by) { return writeOfficeFinal(gameId, away, home, by); },
    async reportFinal(leagueId, gameId, teamId, away, home, by) {
      return reportCaptainFinal({ gameId, teamId, away, home, by });
    },
    // DVSL never holds a near-miss for the coaches to settle, so nobody is asked.
    async coachesFor() { return []; },
    async escalateDispute() {},
    async gameLink(leagueId, gameId) { return `${SITE_BASE}/#game/${gameId}`; },
    async scheduleLink() { return `${SITE_BASE}/schedule.html`; },

    async writeLive(leagueId, gameId, away, home, live, by) {
      if (PO_RE.test(gameId)) throw new ReplyError('Live scores for playoff games are not taken by text. Text the final when it is over.', 'po-live');
      const g = await fsGet(`games/${gameId}`);
      if (!g) throw new ReplyError('That game is no longer on the schedule.', 'no-game');
      if (g.done === true) throw new ReplyError('That game is already final. Text the final score if it is wrong.', 'final');
      const sender = await senderFor(by.phone);
      const side = sideFor(sender, { home: g.home, away: g.away });
      if (!side) throw new ReplyError('Your team is not in that game.', 'not-your-game');
      // scorer.html: whoever holds live_owner broadcasts; anyone else is told no.
      if (g.live_owner && g.live_owner !== side) {
        throw new ReplyError('This game is being live scored in the scorer right now, so the live score there stays. Text the final when it is over.', 'live-owned');
      }
      const update = { away_score: away, home_score: home, live: true, liveAt: new Date() };
      if (!g.live_owner) { update.live_owner = side; update.live_owner_started_at = new Date(); }
      if (live && live.inning != null) { update.inning = live.inning; update.half = live.half === 'bottom' ? 'bottom' : 'top'; }
      const before = {}, absent = [];
      for (const k of Object.keys(update)) { if (g[k] === undefined) absent.push(k); else before[k] = g[k]; }
      await fsUpdate(`games/${gameId}`, update, { mustExist: true });
      const idx = teamIndex(await teams());
      const s0 = toStoreGame(g, idx);
      return { prev: { status: s0.status, away_score: s0.away_score, home_score: s0.home_score, dvsl: { kind: 'live', before, absent, wrote: { away, home } } } };
    },

    async setStatus(leagueId, gameId, status, by) {
      if (PO_RE.test(gameId)) throw new ReplyError('Only the commissioner can call off a playoff game.', 'po-status');
      const g = await fsGet(`games/${gameId}`);
      if (!g) throw new ReplyError('That game is no longer on the schedule.', 'no-game');
      const sender = await senderFor(by.phone);
      const side = sideFor(sender, { home: g.home, away: g.away });
      if (!side) throw new ReplyError('Your team is not in that game.', 'not-your-game');
      const idx = teamIndex(await teams());
      const ppdBy = side === 'admin' ? 'admin' : g[side];
      const editedBy = side === 'admin' ? 'admin' : idx.full(g[side]);
      const update = { ppd: true, rained_out: true, ppd_rescheduled_to: null, ppd_at: isoNow(), ppd_by: ppdBy };
      const before = {}, absent = [];
      for (const k of Object.keys(update)) { if (g[k] === undefined) absent.push(k); else before[k] = g[k]; }
      await fsUpdate(`games/${gameId}`, update, { mustExist: true });
      const awayName = idx.short(g.away), homeName = idx.short(g.home);
      try {
        await fsSet(`pending_gcal_syncs/${gameId}`, {
          game_id: gameId, teams_label: `${awayName} @ ${homeName}`,
          edited_by: editedBy, edited_by_id: side === 'admin' ? '' : g[side],
          summary: `marked PPD by text: Wk ${g.wk || '?'} ${g.date || ''} ${g.time || ''} @ ${g.field || ''}`,
          source: 'sms_ppd_mark', status: 'pending', timestamp: new Date(),
        });
      } catch (e) { console.warn('[sms] gcal queue failed:', e && e.message); }
      await push({
        title: `🌧 PPD: ${awayName} @ ${homeName}`,
        body: `Week ${g.wk || '?'} · ${g.date || ''} ${g.time || ''} @ ${g.field || ''} is postponed. Reschedule TBD.`,
        category: 'rainouts', gameId, teams: [idx.resolve(g.away), idx.resolve(g.home)].filter(Boolean), url: '/schedule.html',
      });
      await activity('Schedule (Captain)', `Marked PPD by text: ${awayName} @ ${homeName} Wk ${g.wk || '?'}`, by);
      const s0 = toStoreGame(g, idx);
      return { prev: { status: s0.status, away_score: s0.away_score, home_score: s0.home_score, dvsl: { kind: 'status', before, absent, wrote: { ppd_at: update.ppd_at } } } };
    },

    async restore(leagueId, gameId, prev, by, report) {
      const d = (prev && prev.dvsl) || null;
      if (!d) return;   // nothing this store wrote
      if (report === 'home' || report === 'away') return restoreCaptain(gameId, prev, by);
      if (report === 'office') return restoreOffice(gameId, prev, by);
      const g = await fsGet(`games/${gameId}`);
      if (!g) return;
      const idx = teamIndex(await teams());
      if (d.kind === 'status') {
        if (g.ppd_at !== d.wrote.ppd_at) return { shown: toStoreGame(g, idx), kept: 'newer_report' };
        // captain.html un-mark PPD clears to null, never deletes
        const back = { ppd: false, rained_out: false, ppd_rescheduled_to: null, ppd_at: null, ppd_by: null, ...d.before };
        await fsUpdate(`games/${gameId}`, back, { mustExist: true });
        try {
          await fsSet(`pending_gcal_syncs/${gameId}`, {
            game_id: gameId, teams_label: `${idx.short(g.away)} @ ${idx.short(g.home)}`,
            edited_by: 'text', edited_by_id: '', summary: `un-marked PPD by text (UNDO): Wk ${g.wk || '?'} ${g.date || ''} ${g.time || ''} @ ${g.field || ''}`,
            source: 'sms_ppd_clear', status: 'pending', timestamp: new Date(),
          });
        } catch (e) { /* best effort */ }
        await activity('Schedule (Captain)', `Un-marked PPD by text (UNDO): ${idx.short(g.away)} @ ${idx.short(g.home)}`, by);
        return;
      }
      if (d.kind === 'live') {
        if (g.done === true || num(g.away_score) !== d.wrote.away || num(g.home_score) !== d.wrote.home) {
          return { shown: toStoreGame(g, idx), kept: 'newer_report' };
        }
        await fsUpdate(`games/${gameId}`, revive(d.before), { mustExist: true, remove: d.absent || [] });
        return;
      }
    },

    async log(leagueId, entry) {
      const s = await senderFor(entry.from).catch(() => null);
      try {
        return await fsCreate('sms_log', {
          at: new Date(entry.at || Date.now()), dir: 'in',
          phone_last4: lastFour(entry.from), name: String(entry.name || '').slice(0, 80),
          team_id: (s && s.team_id) || null, kind: 'score',
          text: String(entry.body || '').slice(0, 500), reply: String(entry.reply || '').slice(0, 1000),
          outcome: entry.outcome || '', game_id: entry.game_id || null,
          ...(entry.simulated ? { simulated: true } : {}),
        });
      } catch (e) { console.warn('[sms] log failed:', e && e.message); return null; }
    },

    // A listed captain texting JOIN signs up for the texts the league starts.
    async recordOptIn(leagueId, o) {
      const id = phoneDocId(o.phone);
      if (!id) return;
      const now = new Date();
      await fsUpdate(`sms_optins/${id}`, {
        phone: o.phone, name: String(o.name || '').slice(0, 80), team_id: (o.team_ids && o.team_ids[0]) || null,
        role: 'captain', consent_text: String(o.consent_text || '').slice(0, 2000), consent_at: now, // the exact words they agreed to, uncut
        confirmed: true, confirmed_at: now, stopped: false, source: 'text',
      });
    },
  };
}
