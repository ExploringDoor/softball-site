// Admin actions for schedule change emails (Builder E), served by
// /api/sms-send after its admin check:
//   email-status              -> switch, readiness, recipient counts per team, last runs, log
//   email-config {enabled}    -> flip sms_state/config.schedule_emails (on re-seeds when the watcher was idle)
//   email-preview {team?}     -> what the next run would email (dry), ONE team's actual email;
//                                with nothing pending, an example built from that team's next game
// Never returns a full address: counts, domains and hashes only.
import { fsGet, fsQuery, fsUpdate } from '../_lib/dvsl.js';
import { emailReadiness, fromDomainVerified } from '../_lib/email.js';
import { optedOutSet } from '../_lib/email-unsub.js';
import { loadEmailRecipients, emailSwitch, planScheduleEmails, previewEmails } from './email-alerts.js';
import { loadTeams, loadCurrent, seedSnapshots } from './schedule.js';
import { runScheduleAlerts } from './alerts.js';
import { todayET, inSendWindow } from './config.js';

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export async function emailStatus() {
  const env = process.env;
  const [raw, teams, runs, log, optouts, verified, usage] = await Promise.all([
    fsGet('sms_state/config'), loadTeams(), fsGet('sms_state/email_runs').catch(() => null),
    fsQuery('email_log', [], { orderBy: ['at', 'desc'], limit: 60 }).catch(() => []),
    optedOutSet().catch(() => new Set()), fromDomainVerified(env),
    fsGet(`api_usage/schedule-email_${new Date().toISOString().slice(0, 10)}`).catch(() => null),
  ]);
  const rec = await loadEmailRecipients({ teams, optouts });
  const names = Object.fromEntries(teams.map(t => [t.id, String(t.name || t.id)]));
  const r = emailReadiness(env);
  return {
    ok: true,
    enabled: emailSwitch(raw).enabled,
    textsEnabled: !!(raw && raw.schedule_alerts && raw.schedule_alerts.enabled === true),
    readiness: { ...r, domainVerified: verified },
    sentToday: usage && Number(usage.n) || 0,
    inWindow: inSendWindow(),
    optedOut: optouts.size,
    teams: [...rec.entries()].map(([id, x]) => ({ id, name: names[id] || id, captains: x.captains.size, players: x.players.size, recipients: x.emails.length, optedOut: x.optedOut }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    lastCheck: runs && runs.last_check_at || null,
    runs: (runs && Array.isArray(runs.runs) ? runs.runs : []).slice(0, 10),
    log: log.map(l => ({ at: l.at || null, team_id: l.team_id || '', domain: l.to_domain || '', subject: String(l.subject || '').slice(0, 160), outcome: l.outcome || '', error: l.error || '' })),
  };
}

export async function emailConfig({ enabled, uid }) {
  const cur = (await fsGet('sms_state/config')) || {};
  const prev = cur.schedule_emails && typeof cur.schedule_emails === 'object' ? cur.schedule_emails : {};
  let reseeded = null;
  // Quiet start: when the watcher was idle (texts off too), record the
  // schedule as it is now so history never goes out. When texts are already
  // on, the watcher has been keeping the snapshots current.
  const textsOn = !!(cur.schedule_alerts && cur.schedule_alerts.enabled === true);
  if (enabled && prev.enabled !== true && !textsOn) reseeded = await seedSnapshots({});
  await fsUpdate('sms_state/config', { schedule_emails: { ...prev, enabled, updated_at: new Date(), updated_by: uid } });
  return { ok: true, key: 'schedule_emails', enabled, reseeded };
}

// An example email for one team, from its next game, when nothing is pending.
async function exampleFor(team, teams) {
  const { current } = await loadCurrent({ fromDate: todayET(), teams });
  const next = [...current.entries()]
    .filter(([, s]) => s.status !== 'final' && (s.away === team || s.home === team))
    .sort((a, b) => (a[1].date + (a[1].time || '')).localeCompare(b[1].date + (b[1].time || '')))[0];
  if (!next) return null;
  const [id, s] = next;
  const after = { ...s, time: s.time === '19:00' ? '20:00' : '19:00' };
  const recipients = await loadEmailRecipients({ teams });
  const plan = planScheduleEmails([{ id, before: s, after, lines: ['example'] }], { teams, recipients });
  const only = { ...plan, emails: plan.emails.filter(e => e.team === team) };
  return previewEmails(only, { team });
}

export async function emailPreview({ team }) {
  const t = ID_RE.test(String(team || '')) ? String(team) : '';
  const dry = await runScheduleAlerts({ dry: true, emailTeam: t });
  const out = {
    ok: true, changes: dry.changes || 0, wouldSeed: !!dry.wouldSeed, enabled: !!dry.emailEnabled, ready: !!dry.emailReady,
    inWindow: !!dry.inWindow, preview: dry.emailPreview || null, example: null,
  };
  const has = out.preview && out.preview.sample && (!t || out.preview.sample.team === t);
  if (!has && t) {
    const teams = await loadTeams();
    if (teams.some(x => x.id === t && x.active !== false)) out.example = await exampleFor(t, teams);
  }
  return out;
}

export async function emailAdmin(action, b, { uid }) {
  if (action === 'email-status') return { status: 200, body: await emailStatus() };
  if (action === 'email-config') {
    if (typeof b.enabled !== 'boolean') return { status: 400, body: { error: 'bad-switch', message: 'Say on or off.' } };
    return { status: 200, body: await emailConfig({ enabled: b.enabled, uid }) };
  }
  if (action === 'email-preview') return { status: 200, body: await emailPreview({ team: b.team }) };
  return { status: 400, body: { error: 'bad-action', message: 'Unknown action.' } };
}
