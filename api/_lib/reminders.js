// Late score + makeup reminders (Builder M). Run by api/league-reminders.js.
//
// What a run does (rules in api/_lib/makeups.js planReminders):
//   * a game 3+ hours past first pitch with no final: push the captain(s) of
//     each side that has no score lane yet (Rule 14), plus a text when
//     sms_state/config.reminders is on;
//   * a postponed game 48 hours past its postponement with no makeup date:
//     push (and text) both captains once (Rule 12);
//   * games 24+ hours unreported and makeups past 48 hours go into ONE
//     commissioner digest a day (push to admins).
// Never twice: each reminder claims reminders_log/{gameId}_{side}_{stage}
// with a create-only precondition BEFORE anything is sent (a crash can lose a
// reminder, never repeat one). The digest also claims digest_{YYYY-MM-DD}.
// reminders_log is server only (default deny in firestore.rules).
//
// dry:true reads only: nothing is claimed, pushed, texted or written.
import { fsGet, fsQuery, fsCommit, fsUpdate, encFields } from './dvsl.js';
import { isPlayed, parseBracketField } from './bracket.js';
import { sendPush, listAllTokens, getRolesMany, selectRecipients } from './push.js';
import { sendEmail } from './email.js';
import { sendSms, twilioConfigured } from '../_sms/send.js';
import { readConfig, inSendWindow } from '../_sms/config.js';
import {
  planReminders, trackMakeups, ymdET, fmtDay, fmtYmd, isStale, gameStartMs, isPpd, isFinal,
  scorePush, scoreText, makeupPush, makeupText, digestPush,
} from './makeups.js';

const BRACKETS_ID = '__playoff_brackets';
const LOG = 'reminders_log';
const KEY_RE = /^[A-Za-z0-9_\-]{1,200}$/;

function defaultDeps() {
  return {
    sendPush,
    // Preview only: how many devices a push would reach (reads, sends nothing).
    countPush: async (opts) => {
      const tokens = await listAllTokens();
      const roles = await getRolesMany(tokens.map(t => t.auth_uid).filter(Boolean));
      return selectRecipients(tokens, roles, opts).length;
    },
    sendSms, twilioConfigured, readConfig, inSendWindow,
    // Digest email through Builder E's mail path (dormant until its env is set) to ADMIN_EMAIL.
    sendEmail,
  };
}

// Create-only write. true = this run owns the key; false = already there.
export async function claim(key, fields) {
  if (!KEY_RE.test(key)) throw new Error('bad key');
  try {
    await fsCommit([{
      update: { name: `${LOG}/${key}`, fields: encFields(fields) },
      currentDocument: { exists: false },
    }]);
    return true;
  } catch (e) {
    if (/ALREADY_EXISTS|\b409\b|FAILED_PRECONDITION/.test(String(e && e.message))) return false;
    throw e;
  }
}

async function loadAll() {
  const [games, teamsRaw, pgDocs, bracketDoc, senders] = await Promise.all([
    fsQuery('games'),
    fsQuery('teams'),
    fsQuery('playoff_games').catch(() => []),
    fsGet(`teams/${BRACKETS_ID}`).catch(() => null),
    fsQuery('sms_senders', [['active', '==', true]]).catch(() => []),
  ]);
  const teams = teamsRaw.filter(t => t.id !== BRACKETS_ID);
  const brackets = { gold: parseBracketField(bracketDoc && bracketDoc.gold), silver: parseBracketField(bracketDoc && bracketDoc.silver) };
  const playoff = [];
  for (const pg of pgDocs) {
    const m = /^po__(gold|silver)_([0-9]+)$/.exec(pg.id || '');
    if (!m || !pg.away || !pg.home) continue;
    const t = brackets[m[1]];
    const bg = t && (t.games || []).find(x => x.g === Number(m[2]));
    if (!bg || !/^\d{4}-\d{2}-\d{2}$/.test(String(bg.date || ''))) continue;
    playoff.push({ id: pg.id, away: pg.away, home: pg.home, date: bg.date, time: bg.time || '', field: bg.field || '', played: isPlayed(bg) });
  }
  return { games, teams, playoff, senders };
}

// Score lanes for the games a plan could touch (3 hours .. 14 days old).
async function loadLanes(games, nowMs) {
  const ids = games.filter(g => {
    if (!g || isPpd(g) || isFinal(g) || g.done === true) return false;
    const age = nowMs - gameStartMs(g);
    return age >= 3 * 3600e3 && age <= 14 * 86400e3;
  }).map(g => g.id);
  const lanes = new Set();
  const keys = ids.flatMap(id => [`${id}_away`, `${id}_home`]);
  for (let i = 0; i < keys.length; i += 20) {
    const got = await Promise.all(keys.slice(i, i + 20).map(k => fsGet(`score_submissions/${k}`).then(d => (d ? k : null)).catch(() => null)));
    for (const k of got) if (k) lanes.add(k);
  }
  return lanes;
}

function namer(teams) {
  const byId = new Map(teams.map(t => [t.id, t]));
  return {
    full: (id) => (byId.get(id) && (byId.get(id).name || byId.get(id).short)) || String(id || ''),
    short: (id) => (byId.get(id) && (byId.get(id).short || byId.get(id).name)) || String(id || '').toUpperCase(),
  };
}

// Captain phones for a team from sms_senders (sendSms still refuses anyone
// who hasn't said YES, so this list is only who MAY get it).
function captainPhones(senders, teamId) {
  return senders.filter(s => s.role === 'captain' && s.active !== false
    && ((Array.isArray(s.team_ids) && s.team_ids.includes(teamId)) || s.team_id === teamId))
    .map(s => (typeof s.phone === 'string' && s.phone) || (/^[0-9]{8,15}$/.test(s.id) ? '+' + s.id : ''))
    .filter(Boolean);
}

function wording(item, nm, textIn) {
  const teamName = nm.full(item.teamId), oppName = nm.full(item.oppId);
  if (item.stage === 'makeup') {
    return { push: makeupPush({ teamName, oppName, entry: item.entry }), text: makeupText({ oppName, entry: item.entry }), kind: 'makeup_reminder' };
  }
  return {
    push: scorePush({ teamName, oppName, startMs: item.startMs, playoff: item.playoff }),
    // Text-in scores are regular season only (playoffs score in the portal).
    text: scoreText({ teamShort: nm.short(item.teamId), oppName, oppShort: nm.short(item.oppId), startMs: item.startMs, textIn: textIn && !item.playoff }),
    kind: 'score_reminder',
  };
}

const gameLabel = (g, nm) => `${nm.short(g.away)} @ ${nm.short(g.home)}`;

export async function runReminders({ now = new Date(Date.now()), dry = false, run = 'cron', deps } = {}) {
  const d = { ...defaultDeps(), ...(deps || {}) };
  const nowMs = now.getTime();
  const cfg = await d.readConfig();
  const textsOn = !!(cfg.reminders && cfg.reminders.enabled) && d.twilioConfigured() && d.inSendWindow(now);
  const textIn = !!(cfg.inbound && cfg.inbound.enabled);
  const { games, teams, playoff, senders } = await loadAll();
  const lanes = await loadLanes(games, nowMs);
  const nm = namer(teams);
  const plan = planReminders({ games, lanes, playoff, nowMs });

  const out = {
    ok: true, dry, run, at: now.toISOString(), today: ymdET(nowMs),
    texts: { switchOn: !!(cfg.reminders && cfg.reminders.enabled), twilio: d.twilioConfigured(), inWindow: d.inSendWindow(now), willText: textsOn },
    captain: { due: plan.captain.length, alreadySent: 0, sent: 0 },
    office: { due: plan.office.length, alreadySent: 0, inDigest: 0 },
    pushes: 0, textsSent: 0, textsRefused: 0,
    preview: [], digest: null,
  };

  // ── captains ──
  for (const item of plan.captain) {
    const w = wording(item, nm, textIn);
    const phones = captainPhones(senders, item.teamId);
    if (dry) {
      const seen = await fsGet(`${LOG}/${item.key}`).catch(() => null);
      if (seen) { out.captain.alreadySent++; continue; }
      let devices = null;
      try { devices = await d.countPush({ category: 'scores', captainOf: [item.teamId] }); } catch (e) { devices = null; }
      out.preview.push({
        key: item.key, stage: item.stage, gameId: item.gameId, game: gameLabel(item.game, nm), when: fmtDay(item.startMs),
        side: item.side, team: nm.full(item.teamId), push: w.push, pushDevices: devices,
        text: w.text, textCandidates: phones.length, textWouldSend: textsOn,
      });
      continue;
    }
    const mine = await claim(item.key, {
      game_id: item.gameId, side: item.side, stage: item.stage, team_id: item.teamId, at: now, run,
    });
    if (!mine) { out.captain.alreadySent++; continue; }
    let pr = { sent: 0, total: 0 };
    try {
      pr = await d.sendPush({ category: 'scores', captainOf: [item.teamId], title: w.push.title, body: w.push.body, url: w.push.url, gameId: item.gameId }, { senderRole: 'system' });
      out.pushes += pr.sent || 0;
    } catch (e) { console.warn('[reminders] push failed:', e && e.message); }
    let tSent = 0, tRef = 0;
    if (textsOn) {
      for (const to of phones) {
        try {
          const r = await d.sendSms({ to, body: w.text, kind: w.kind, team_id: item.teamId, game_id: item.gameId });
          if (r && r.ok && !r.skipped) tSent++; else tRef++;
        } catch (e) { tRef++; }
      }
    }
    out.textsSent += tSent; out.textsRefused += tRef; out.captain.sent++;
    await fsUpdate(`${LOG}/${item.key}`, { push_sent: pr.sent || 0, push_total: pr.total || 0, texts_sent: tSent, texts_refused: tRef, texts_on: textsOn })
      .catch(() => {});
  }

  // ── commissioner digest (one a day) ──
  const fresh = [];
  for (const item of plan.office) {
    const seen = await fsGet(`${LOG}/${item.key}`).catch(() => null);
    if (seen) out.office.alreadySent++; else fresh.push(item);
  }
  if (fresh.length) {
    const msg = digestPush({ items: fresh, nameOf: nm.short, stillOpen: out.office.alreadySent });
    const digestKey = `digest_${out.today}`;
    if (dry) {
      const sentToday = await fsGet(`${LOG}/${digestKey}`).catch(() => null);
      out.digest = { ...msg, items: fresh.length, alreadySentToday: !!sentToday };
      try { out.digest.devices = await d.countPush({ category: 'admin', adminOnly: true }); } catch (e) { /* preview only */ }
    } else if (await claim(digestKey, { stage: 'digest', at: now, run, items: fresh.length })) {
      const owned = [];
      for (const item of fresh) {
        if (await claim(item.key, { game_id: item.gameId, side: 'admin', stage: item.stage, at: now, run, digest: digestKey })) owned.push(item);
      }
      if (owned.length) {
        const m2 = owned.length === fresh.length ? msg : digestPush({ items: owned, nameOf: nm.short, stillOpen: out.office.alreadySent });
        let pr = { sent: 0, total: 0 };
        try {
          pr = await d.sendPush({ category: 'admin', adminOnly: true, title: m2.title, body: m2.body, url: m2.url }, { senderRole: 'system' });
          out.pushes += pr.sent || 0;
        } catch (e) { console.warn('[reminders] digest push failed:', e && e.message); }
        let emailed = false;
        if (typeof d.sendEmail === 'function' && process.env.ADMIN_EMAIL) {
          try { const r = await d.sendEmail({ to: process.env.ADMIN_EMAIL, subject: m2.title, text: m2.body + '\n\nhttps://dvsl.vercel.app/admin.html', idempotencyKey: digestKey }); emailed = !!(r && r.ok && !r.skipped); }
          catch (e) { console.warn('[reminders] digest email failed:', e && e.message); }
        }
        out.office.inDigest = owned.length;
        out.digest = { ...m2, items: owned.length, pushSent: pr.sent || 0, emailed };
        await fsUpdate(`${LOG}/${digestKey}`, { push_sent: pr.sent || 0, push_total: pr.total || 0, emailed, items: owned.length }).catch(() => {});
      }
    } else {
      out.digest = { skipped: 'already-sent-today', items: fresh.length };
    }
  }
  return out;
}

// For the admin Makeups panel: the tracker plus every log row for the games on it.
export async function makeupsReport({ now = new Date(Date.now()) } = {}) {
  const nowMs = now.getTime();
  const games = await fsQuery('games');
  const { open, madeUp } = trackMakeups(games, nowMs);
  const rows = await fsQuery(LOG, [], { orderBy: ['at', 'desc'], limit: 300 }).catch(() => []);
  const log = rows.map(r => ({
    id: r.id, game_id: r.game_id || null, side: r.side || null, stage: r.stage || null, at: r.at || null, run: r.run || null,
    push_sent: r.push_sent ?? null, push_total: r.push_total ?? null, texts_sent: r.texts_sent ?? null, texts_refused: r.texts_refused ?? null,
    items: r.items ?? null,
  }));
  return {
    open: open.map(e => ({ id: e.id, status: e.status, overdueWhy: e.overdueWhy, stale: isStale(e, nowMs), playBy: fmtYmd(e.playBy) })),
    madeUp: madeUp.length, log,
  };
}
