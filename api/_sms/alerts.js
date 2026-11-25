// Schedule-change texts (Builder C), the DVSL half of league-platform
// lib/sms/schedule-watch.ts. The rules (who, what words) are LP core's
// planScheduleAlerts / describeChange, imported from the bundled core.
//
// Every 15 minutes (vercel.json cron -> api/sms-alerts.js): compare every game
// from today on with its sms_schedule snapshot. A game that moved (date, time,
// field), was postponed / cancelled / put back on, was added or was taken off
// texts the opted-in people of both teams (old and new teams when a matchup
// changed). Several changes for one number are one text.
//
// Quiet hours: outside 8 AM to 9 PM New York time nothing is sent AND nothing
// is remembered, so a change made at 11 PM still goes out at 8 AM (the queue).
// Snapshots are written BEFORE the texts go out: a crash can lose an alert,
// never send one twice. The very first run only records.
import { fsQuery, fsGet } from '../_lib/dvsl.js';
import { planScheduleAlerts, describeChange, lastFour, toE164US } from './core.js';
import { normalizeConfig, todayET, inSendWindow, SITE } from './config.js';
import { loadCurrent, snapOfGame, playoffSnaps, toLP, forCompare, sameSnap, writeSnaps } from './schedule.js';
import { loadContacts } from './audience.js';
import { sendMany, tally, twilioConfigured } from './send.js';
// Schedule change EMAILS (Builder E) ride on the same detection pass.
import { emailSwitch, loadEmailRecipients, planScheduleEmails, sendScheduleEmails, previewEmails } from './email-alerts.js';
import { emailReadiness } from '../_lib/email.js';

// "DVSL schedule change:" -> "DVSL: Schedule change:" (brand prefix rule).
export function rebrand(body) {
  return String(body).replace(/^DVSL schedule change/, 'DVSL: Schedule change');
}

async function chunked(ids, fn, size = 20) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await Promise.all(ids.slice(i, i + size).map(fn))));
  return out;
}

// Pure: changes between remembered snapshots and the schedule now.
//   before: Map id -> snap, after: Map id -> snap|null (null = gone)
export function diffSchedule(before, after) {
  const changes = [];
  const ids = new Set([...before.keys(), ...after.keys()]);
  for (const id of ids) {
    const b = before.has(id) ? before.get(id) : null;
    const a = after.has(id) ? after.get(id) : null;
    if (!b && !a) continue;
    if (b && a && sameSnap(b, a)) continue;
    const lines = describeChange(toLP(forCompare(b, a)), toLP(a));
    changes.push({ id, before: b, after: a, lines, changedBy: (a && a._changedBy) || null });
  }
  return changes;
}

export function planTexts(changes, { teams, contacts, copyTo = [] }) {
  const real = changes.filter(c => c.lines.length > 0);
  const plan = planScheduleAlerts({
    changes: real.map(c => ({ gameId: c.id, before: toLP(forCompare(c.before, c.after)), after: toLP(c.after), changedBy: c.changedBy })),
    // An undecided playoff side has no team id: it reads as TBD.
    teams: [...teams.map(t => ({ id: t.id, name: String(t.name || t.id) })), { id: '', name: 'TBD' }],
    contacts: contacts.map(c => ({ phone: c.phone, name: c.name, teamIds: c.teamIds, optedIn: true, active: true })),
    leagueLabel: 'DVSL',
    scheduleLink: SITE + '/schedule.html',
    copyTo: copyTo.map(p => toE164US(p)).filter(Boolean),
  });
  return { real, texts: plan.texts.map(t => ({ ...t, body: rebrand(t.body) })), ignoredNew: plan.ignoredNew };
}

// Two channels, one pass. The watcher runs when EITHER switch is on (texts:
// schedule_alerts, emails: schedule_emails). A channel whose switch is off or
// whose env is not ready sends nothing, but the snapshots still move on, so
// it never sends later about an old change. dormant = neither can send.
export async function runScheduleAlerts({ now = new Date(), dry = false, emailTeam = '' } = {}) {
  const raw = await fsGet('sms_state/config');
  const cfg = normalizeConfig(raw);
  const em = emailSwitch(raw);
  const emailReady = emailReadiness();
  const textLive = cfg.schedule_alerts.enabled && twilioConfigured();
  const emailLive = em.enabled && emailReady.ready;
  const out = {
    ok: true, dry, enabled: cfg.schedule_alerts.enabled, twilio: twilioConfigured(), today: todayET(now), inWindow: inSendWindow(now),
    emailEnabled: em.enabled, emailReady: emailReady.ready, dormant: !textLive && !emailLive,
  };
  if (!dry && !cfg.schedule_alerts.enabled && !em.enabled) return { ...out, skipped: 'off' };
  if (!dry && !out.inWindow) return { ...out, skipped: 'quiet-hours', queued: true };

  const today = out.today;
  const [{ current, teams, bracketDoc }, windowSnaps, anySnap] = await Promise.all([
    loadCurrent({ fromDate: today }),
    fsQuery('sms_schedule', [['date', '>=', today]]),
    fsQuery('sms_schedule', [], { limit: 1 }),
  ]);
  if (!anySnap.length) {
    if (!dry) await writeSnaps([...current.entries()], [], now);
    return { ...out, seeded: !dry, wouldSeed: dry, changes: 0, texts: 0 };
  }

  const before = new Map(windowSnaps.map(d => [d.id, d]));
  // A game moved from the past into the future was remembered under its old date.
  const unseen = [...current.keys()].filter(id => !before.has(id));
  const got = await chunked(unseen, id => fsGet(`sms_schedule/${id}`).catch(() => null));
  got.forEach((d, i) => { if (d) before.set(unseen[i], d); });

  // Remembered as upcoming but no longer upcoming: moved into the past, or deleted.
  const after = new Map(current);
  const left = [...before.keys()].filter(id => !current.has(id));
  const allPo = left.some(id => id.startsWith('po__')) ? playoffSnaps(bracketDoc, teams) : new Map();
  const leftNow = await chunked(left, async id => {
    if (id.startsWith('po__')) return allPo.get(id) || null;
    const g = await fsGet(`games/${id}`).catch(() => undefined);
    if (g === undefined) return undefined;          // read failed: leave it for next run
    return g ? { ...snapOfGame(g), _changedBy: g.updated_by_uid || null } : null;
  });
  left.forEach((id, i) => { if (leftNow[i] === undefined) before.delete(id); else after.set(id, leftNow[i]); });

  const changes = diffSchedule(before, after);
  const contacts = await loadContacts();
  const { real, texts, ignoredNew } = planTexts(changes, { teams, contacts, copyTo: cfg.schedule_alerts.phones });
  out.seeded = false;
  out.changes = real.length;
  out.texts = texts.length;
  if (ignoredNew) out.ignoredNew = ignoredNew;
  // Recipients are only read when there is something to tell.
  const emailPlan = real.length && (dry || em.enabled)
    ? planScheduleEmails(real, { teams, recipients: await loadEmailRecipients({ teams }) })
    : { emails: [], flood: false, newGames: 0 };
  out.emails = emailPlan.emails.reduce((n, e) => n + e.recipients.length, 0);

  if (dry) {
    out.preview = texts.slice(0, 25).map(t => ({ to: `${t.name || 'Contact'} (ends ${lastFour(t.phone)})`, body: t.body }));
    out.changeList = real.slice(0, 40).map(c => ({ id: c.id, lines: c.lines }));
    out.emailPreview = previewEmails(emailPlan, { team: emailTeam });
    return out;
  }
  // Remember everything that differs (also silent differences such as a final
  // score going in or a playoff side filling in), then send.
  const sets = changes.filter(c => c.after).map(c => [c.id, c.after]);
  const dels = changes.filter(c => !c.after).map(c => c.id);
  await writeSnaps(sets, dels, now);

  const teamOf = (phone) => { const c = contacts.find(k => k.phone === phone); return c && c.teamIds[0] || null; };
  const results = textLive
    ? await sendMany(texts.map(t => ({ to: t.phone, body: t.body, kind: 'schedule_alert', team_id: teamOf(t.phone), game_id: t.gameIds[0] || null })))
    : [];
  if (!textLive) out.textsSkipped = cfg.schedule_alerts.enabled ? 'dormant' : 'off';
  out.email = await sendScheduleEmails(emailPlan, { live: emailLive, enabled: em.enabled, now, changes: real.length });
  return { ...out, ...tally(results) };
}
