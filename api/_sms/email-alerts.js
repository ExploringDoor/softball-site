// Schedule change EMAILS (Builder E). The same changes the text watcher finds
// (api/_sms/alerts.js runScheduleAlerts: one detection pass, snapshots in
// sms_schedule written once) also go out by email, one summary per team per
// run, to the team's captains (captains collection) and its active rostered
// players (player_private.email, else players.email).
//
// Switch: sms_state/config.schedule_emails.enabled (default off), changed only
// through /api/sms-send {action:'email-config'}. Dormant until the env in
// api/_lib/email.js is complete (verified From domain + unsubscribe secret).
//
// Never: an inactive team, a deactivated or pending player, an address on
// email_optouts, a full address in a log line or a response.
import crypto from 'crypto';
import { fsQuery, fsGet, fsSet, fsCommit, encFields, dailyCount } from '../_lib/dvsl.js';
import { escapeHtml } from '../_lib/notify.js';
import { normEmail, maskEmail, emailHash, emailReadiness, sendEmails, dailyCap } from '../_lib/email.js';
import { optedOutSet, unsubUrl, unsubHeaders } from '../_lib/email-unsub.js';
import { dayLabel, formatTime12, shortField, NEW_GAME_FLOOD } from './core.js';
import { SITE } from './config.js';
import { forCompare } from './schedule.js';

export const MAX_ITEMS_PER_EMAIL = 40;
export const SMS_SIGNUP = 'dvsl.vercel.app/sms.html';
const NAVY = '#002D72';
const GOLD = '#C99700';

export function emailSwitch(rawConfig) {
  const c = rawConfig && typeof rawConfig === 'object' ? rawConfig.schedule_emails : null;
  return { ...(c && typeof c === 'object' ? c : {}), enabled: !!(c && c.enabled === true) };
}

const activeTeam = (t) => t && t.id !== '__playoff_brackets' && t.active !== false;

// Map teamId -> { captains:[email], players:[email], emails:[email] } for
// active teams, deduped and lowercased, opt-outs removed (counted).
export async function loadEmailRecipients({ teams = null, optouts = null } = {}) {
  const [tms, captains, players, priv, out] = await Promise.all([
    teams ? Promise.resolve(teams) : fsQuery('teams'),
    fsQuery('captains'),
    fsQuery('players'),
    fsQuery('player_private'),
    optouts ? Promise.resolve(optouts) : optedOutSet(),
  ]);
  const by = new Map();
  for (const t of tms) if (activeTeam(t)) by.set(t.id, { captains: new Set(), players: new Set(), optedOut: 0, emails: [] });
  for (const c of captains) {
    const r = by.get(String(c.team_id || ''));
    const e = normEmail(c.email);
    if (r && e) r.captains.add(e);
  }
  const privById = new Map(priv.map(p => [p.id, p]));
  for (const p of players) {
    if (p.active === false || p.pending_approval === true) continue;
    const r = by.get(String(p.team || ''));
    if (!r) continue;
    const pp = privById.get(p.id);
    const e = normEmail((pp && pp.email) || p.email);
    if (e) r.players.add(e);
  }
  for (const r of by.values()) {
    const all = new Set([...r.captains, ...r.players]);
    for (const e of all) { if (out.has(emailHash(e))) r.optedOut++; else r.emails.push(e); }
    r.emails.sort();
  }
  return by;
}

// ─── words ────────────────────────────────────────────────────────────────
const standing = (s) => (s === 'postponed' ? 'postponed' : s === 'cancelled' ? 'cancelled' : 'on');
const played = (s) => s === 'final' || s === 'live' || s === 'approved';
const when = (s) => [s.time ? formatTime12(s.time) : '', shortField(s.field) ? `at ${shortField(s.field)}` : ''].filter(Boolean).join(' ');

// One change in words, for one email line. before/after are DVSL snapshots
// ({date,time,field,status,away,home}); before is already forCompare'd.
export function describeForEmail(before, after, nameOf) {
  const nm = (id) => (id ? nameOf(id) : 'TBD');
  const shown = after || before;
  const vs = (s) => `${nm(s.away)} vs ${nm(s.home)}`;
  if (!before) {
    return { kind: 'new', line: `NEW GAME: ${dayLabel(after.date)}, ${vs(after)}${when(after) ? ', ' + when(after) : ''}` };
  }
  if (!after) return { kind: 'removed', line: `REMOVED: ${dayLabel(before.date)}, ${vs(before)} is off the schedule` };

  const was = standing(before.status), now = standing(after.status);
  const label = now !== was ? (now === 'postponed' ? 'POSTPONED' : now === 'cancelled' ? 'CANCELLED' : 'BACK ON') : '';
  const dateCh = after.date !== before.date;
  const timeCh = (after.time || '') !== (before.time || '');
  const fieldCh = shortField(after.field) !== shortField(before.field);
  const teamCh = after.away !== before.away || after.home !== before.home;

  let line;
  if (dateCh || timeCh || fieldCh) {
    const to = [dateCh ? dayLabel(after.date) : '', after.time ? formatTime12(after.time) : (timeCh ? 'time to be announced' : '')].filter(Boolean).join(', ');
    const where = shortField(after.field) ? `at ${shortField(after.field)}` : (fieldCh ? 'field to be announced' : '');
    const wasBits = [dateCh ? dayLabel(before.date) : '', timeCh && before.time ? formatTime12(before.time) : '', fieldCh && shortField(before.field) ? `at ${shortField(before.field)}` : ''].filter(Boolean);
    line = `${dayLabel(before.date)}: ${vs(after)} moved to ${[to, where].filter(Boolean).join(' ')}${wasBits.length ? ` (was ${wasBits.join(', ').replace(', at ', ' at ')})` : ''}`;
  } else {
    line = `${dayLabel(shown.date)}, ${vs(after)}${when(after) ? ', ' + when(after) : ''}`;
  }
  if (teamCh) line += ` (was ${vs(before)})`;
  if (label) line = `${label}: ${line}`;
  return { kind: label ? label.toLowerCase().replace(' ', '_') : (teamCh && !dateCh && !timeCh && !fieldCh ? 'matchup' : 'moved'), line };
}

// changes: diffSchedule() output with c.lines (LP words) already filled.
// Flood guard = the texts' rule (LP planScheduleAlerts): more than
// NEW_GAME_FLOOD new games in one run is a season load, and NEW games are not
// emailed at all (other changes in the same run still are).
// -> { emails:[{team, teamName, items, recipients:[email]}], flood, newGames, ignoredNew }
export function planScheduleEmails(changes, { teams, recipients }) {
  const nameOf = (id) => { const t = teams.find(x => x.id === id); return t ? String(t.name || id) : id; };
  const real = changes.filter(c => c.lines && c.lines.length && !(c.after && played(c.after.status)));
  const newGames = real.filter(c => !c.before && c.after).length;
  const flood = newGames > NEW_GAME_FLOOD;
  const byTeam = new Map();
  for (const c of real) {
    if (flood && !c.before) continue;
    const d = describeForEmail(forCompare(c.before, c.after), c.after, nameOf);
    const shown = c.after || c.before;
    const key = `${shown.date} ${shown.time || ''} ${c.id}`;
    const ids = new Set([c.before && c.before.away, c.before && c.before.home, c.after && c.after.away, c.after && c.after.home].filter(Boolean));
    for (const t of ids) {
      if (!recipients.has(t)) continue;                 // inactive or unknown team
      const list = byTeam.get(t) || [];
      if (!list.some(i => i.gameId === c.id)) list.push({ key, gameId: c.id, kind: d.kind, line: d.line });
      byTeam.set(t, list);
    }
  }
  const emails = [];
  for (const [team, items] of byTeam) {
    items.sort((a, b) => a.key.localeCompare(b.key));
    emails.push({ team, teamName: nameOf(team), items, recipients: recipients.get(team).emails });
  }
  emails.sort((a, b) => a.teamName.localeCompare(b.teamName));
  return { emails, flood, newGames, ignoredNew: flood ? newGames : 0 };
}

export function teamLink(teamId) { return `${SITE}/#team/${encodeURIComponent(teamId)}`; }

export function subjectFor(e) {
  const n = e.items.length;
  if (n === 1) {
    const i = e.items[0];
    const head = { new: 'New game', removed: 'Game taken off the schedule', postponed: 'Game postponed', cancelled: 'Game cancelled', back_on: 'Game back on' }[i.kind] || 'Schedule change';
    const day = (/^(?:[A-Z ]+: )?([A-Z][a-z]{2} \d{1,2}\/\d{1,2})/.exec(i.line) || [])[1];
    return `DVSL: ${head} for ${e.teamName}${day ? ', ' + day : ''}`;
  }
  return `DVSL: ${n} schedule changes for ${e.teamName}`;
}

// The email itself. unsub = this recipient's unsubscribe URL.
export function buildScheduleEmail(e, { unsub, replyable = !!normEmail(process.env.EMAIL_REPLY_TO) }) {
  const ask = replyable ? ' Questions? Reply to this email.' : '';
  const shown = e.items.slice(0, MAX_ITEMS_PER_EMAIL);
  const rest = e.items.length - shown.length;
  const link = teamLink(e.team);
  const subject = subjectFor(e);
  const intro = `The ${e.teamName} schedule changed:`;
  const restLine = rest > 0 ? `And ${rest} more on the schedule page.` : '';
  const text = [
    'DVSL SOFTBALL', '',
    intro, '',
    ...shown.map(i => '  ' + i.line),
    ...(restLine ? ['', restLine] : []),
    '',
    `Your team's schedule: ${link}`,
    '',
    `Get these by text instead, or as well: sign up at ${SMS_SIGNUP}`,
    '',
    `You get this because you are on the ${e.teamName} roster in the DVSL.${ask}`,
    `Unsubscribe from schedule emails: ${unsub}`,
    '',
  ].join('\n');

  const li = shown.map(i => {
    const m = /^([A-Z ]+): (.*)$/.exec(i.line);
    const tag = m && /^(NEW GAME|REMOVED|POSTPONED|CANCELLED|BACK ON)$/.test(m[1]) ? m[1] : '';
    const rest = tag ? m[2] : i.line;
    const color = tag === 'POSTPONED' || tag === 'CANCELLED' || tag === 'REMOVED' ? '#B91C1C' : tag ? NAVY : '';
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #eef0f3;font-size:15px;line-height:1.5;color:#1a1a1a">${tag ? `<strong style="color:${color};letter-spacing:.03em">${escapeHtml(tag)}:</strong> ` : ''}${escapeHtml(rest)}</td></tr>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7">
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px 16px">
  <div style="background:${NAVY};color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;border-bottom:3px solid ${GOLD}">
    <strong style="font-size:20px;letter-spacing:.05em">DVSL SOFTBALL</strong>
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;margin-top:2px">Schedule update</div>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;color:#1a1a1a">
    <div style="font-size:16px;font-weight:bold;margin:0 0 6px">${escapeHtml(intro)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${li}</table>
    ${restLine ? `<p style="font-size:14px;color:#4b5563;margin:12px 0 0">${escapeHtml(restLine)}</p>` : ''}
    <p style="margin:22px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:${NAVY};color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:bold;font-size:15px">See the ${escapeHtml(e.teamName)} schedule</a></p>
    <p style="font-size:14px;color:#374151;margin:20px 0 0;line-height:1.5">Get these by text instead, or as well: sign up at <a href="https://${SMS_SIGNUP}" style="color:${NAVY}">${SMS_SIGNUP}</a></p>
  </div>
  <div style="text-align:center;padding:16px 8px;font-size:12px;color:#6b7280;line-height:1.6">
    You get this because you are on the ${escapeHtml(e.teamName)} roster in the DVSL.${escapeHtml(ask)}<br>
    <a href="${escapeHtml(unsub)}" style="color:#6b7280">Unsubscribe from schedule emails</a><br>
    Delaware Valley Synagogue League
  </div>
</div>
</body></html>`;
  return { subject, text, html };
}

// ─── run ──────────────────────────────────────────────────────────────────
const logId = () => crypto.randomBytes(15).toString('base64').replace(/[^A-Za-z0-9]/g, '').padEnd(20, 'x').slice(0, 20);

async function writeLog(rows) {
  const writes = rows.map(r => ({ update: { name: `email_log/${logId()}`, fields: encFields(r) } }));
  try { for (let i = 0; i < writes.length; i += 400) await fsCommit(writes.slice(i, i + 400)); }
  catch (e) { console.error('[schedule-email] log write failed'); }
}

async function rememberRun(entry) {
  try {
    const cur = (await fsGet('sms_state/email_runs')) || {};
    const runs = Array.isArray(cur.runs) ? cur.runs.slice(0, 9) : [];
    const doc = { last_check_at: entry.at, runs: entry.record ? [entry.record, ...runs] : runs };
    await fsSet('sms_state/email_runs', doc);
  } catch (e) { /* a nicety for the admin tab */ }
}

export function emailTally(results) {
  const t = { sent: 0, dry: 0, refused: 0, failed: 0 };
  for (const r of results) {
    if (r && r.ok && r.skipped === 'dry') t.dry++;
    else if (r && r.ok) t.sent++;
    else if (r && r.skipped) t.refused++;
    else t.failed++;
  }
  return t;
}

// Send the planned emails. live=false (switch off or env not ready) sends
// nothing and records why. Never throws.
export async function sendScheduleEmails(plan, { live, enabled, now = new Date(), changes = 0 } = {}) {
  const runId = `${now.toISOString().slice(0, 16)}-${crypto.randomBytes(3).toString('hex')}`;
  const total = plan.emails.reduce((n, e) => n + e.recipients.length, 0);
  const summary = { enabled, live, teams: plan.emails.length, planned: total };
  // Season load: one log line + one run entry, no email about the new games.
  const ignoredNew = plan.ignoredNew || 0;
  const note = ignoredNew ? `season load skipped (${ignoredNew} new games)` : '';
  if (note) {
    summary.ignoredNew = ignoredNew; summary.note = note;
    if (enabled) await writeLog([{ at: now, run_id: runId, kind: 'schedule_email_skip', team_id: null, outcome: 'skipped:season-load', subject: note, new_games: ignoredNew, expires_at: new Date(now.getTime() + 120 * 86400 * 1000) }]);
  }
  const extra = note ? { ignored_new: ignoredNew, note } : {};
  if (!live) {
    const why = !enabled ? 'off' : 'dormant:' + emailReadiness().reason;
    if (enabled && (total || note)) await rememberRun({ at: now, record: { at: now, run_id: runId, changes, teams: plan.emails.length, planned: total, sent: 0, failed: 0, refused: 0, skipped: why, ...extra } });
    else if (enabled) await rememberRun({ at: now });
    return { ...summary, skipped: why };
  }
  if (!total) {
    await rememberRun(note ? { at: now, record: { at: now, run_id: runId, changes, teams: 0, planned: 0, sent: 0, failed: 0, refused: 0, skipped: 'season-load', ...extra } } : { at: now });
    return { ...summary, sent: 0, dry: 0, refused: 0, failed: 0 };
  }

  const cap = dailyCap();
  const items = [];
  for (const e of plan.emails) {
    for (const to of e.recipients) items.push({ e, to });
  }
  // Daily ceiling: one count per recipient, checked before anything leaves.
  const counts = [];
  for (let i = 0; i < items.length; i += 25) counts.push(...(await Promise.all(items.slice(i, i + 25).map(() => dailyCount('schedule-email')))));
  const msgs = items.map((x, i) => {
    if (counts[i] > cap) return null;
    const unsub = unsubUrl(x.to);
    const m = buildScheduleEmail(x.e, { unsub });
    return { to: x.to, subject: m.subject, html: m.html, text: m.text, headers: unsubHeaders(unsub) };
  });
  const toSend = msgs.map((m, i) => ({ m, i })).filter(x => x.m);
  const sent = await sendEmails(toSend.map(x => x.m), { batchKey: 'dvsl-sched-' + runId });
  const results = items.map(() => ({ ok: false, skipped: 'daily-cap' }));
  toSend.forEach((x, k) => { results[x.i] = sent[k]; });

  const expires = new Date(now.getTime() + 120 * 86400 * 1000);
  await writeLog(items.map((x, i) => {
    const r = results[i] || {};
    const { hash, domain } = maskEmail(x.to);
    return {
      at: now, run_id: runId, kind: 'schedule_email', team_id: x.e.team, to_hash: hash, to_domain: domain,
      subject: subjectFor(x.e), game_ids: x.e.items.map(it => it.gameId).slice(0, 40),
      outcome: r.ok ? (r.skipped === 'dry' ? 'dry' : 'sent') : (r.skipped ? 'refused:' + r.skipped : 'failed'),
      provider_id: r.id || null, error: r.error || null, expires_at: expires,
    };
  }));
  const t = emailTally(results);
  await rememberRun({ at: now, record: { at: now, run_id: runId, changes, teams: plan.emails.length, planned: total, ...t, ...extra } });
  return { ...summary, ...t };
}

// For the admin preview: a masked summary and ONE team's actual email.
export function previewEmails(plan, { team = '' } = {}) {
  const pick = plan.emails.find(e => e.team === team) || plan.emails[0] || null;
  return {
    total: plan.emails.reduce((n, e) => n + e.recipients.length, 0),
    flood: plan.flood, newGames: plan.newGames, ignoredNew: plan.ignoredNew || 0,
    teams: plan.emails.map(e => ({ team: e.team, teamName: e.teamName, recipients: e.recipients.length, changes: e.items.length, subject: subjectFor(e) })),
    sample: pick ? { team: pick.team, teamName: pick.teamName, recipients: pick.recipients.length, ...buildScheduleEmail(pick, { unsub: `${SITE}/api/email-unsubscribe?t=PREVIEW` }) } : null,
  };
}
