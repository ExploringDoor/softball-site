// POST /api/sms-send {action, ...}: team texts + the admin Texts tab (Builder C).
// Bearer Firebase ID token required; permissions from roles/{uid} only.
//
// Captain or admin:
//   mine                         -> teams you may text, their opted-in counts, upcoming games, live?
//   preview {team, template, gameId?, text?, moveTo?}  -> the exact text(s) and how many get them
//   send    {...same, confirm:true}                     -> sends (dormant/quiet hours refuse)
//     team: a team id; admin may also use 'all' (free text only) or 'both' (both teams of gameId).
//     Captains: own teams only (roles.captain_teams).
// Admin only:
//   status                       -> switches, env readiness, per-team counts, senders, opt-ins, log
//   config {key, enabled}        -> flip a switch in sms_state/config (schedule_alerts ON re-seeds snapshots)
//   add-sender {phone, name, team, role:'captain'|'admin'} / remove-sender {ref}
//   email-status / email-config {enabled} / email-preview {team?}  (schedule emails, api/_sms/email-admin.js)
// The tab never sees a full phone number: last 4 digits, and an opaque `ref`.
// Seeding lives in api/sms-seed.js. The schedule dry run is GET /api/sms-alerts?dry=1.
import { cors, rejectForeignOrigin, rateLimited, requireUser, getRoles, dailyCount, fsGet, fsQuery, fsUpdate, sha256hex, body } from './_lib/dvsl.js';
import { phoneDocId, lastFour } from './_sms/ids.js';
import { readConfig, todayET, inSendWindow, SWITCHES, publicNumber } from './_sms/config.js';
import { twilioConfigured, dryEnv, sendMany, tally } from './_sms/send.js';
import { loadContacts, contactsForTeams } from './_sms/audience.js';
import { loadTeams, loadCurrent, seedSnapshots } from './_sms/schedule.js';
import { buildBody, segments, TEMPLATES } from './_sms/blast.js';
import { strictUsE164 } from './_sms/optin.js';
import { emailAdmin } from './_sms/email-admin.js'; // Builder E: email-status / email-config / email-preview

const MAX_RECIPIENTS = 400;
const refOf = (docId) => sha256hex('sms-sender:' + docId).slice(0, 20);
const err = (res, status, error, message) => res.status(status).json({ error, message });

async function upcomingGames(teamIds, today, teams) {
  const { current } = await loadCurrent({ fromDate: today, teams });
  const set = new Set(teamIds);
  const last = new Date(Date.parse(today + 'T12:00:00Z') + 21 * 86400000).toISOString().slice(0, 10);
  return [...current.entries()]
    .filter(([, s]) => s.date <= last && s.status !== 'final' && (set.has(s.away) || set.has(s.home)))
    .map(([id, s]) => ({ id, date: s.date, time: s.time, field: s.field, away: s.away, home: s.home, status: s.status }))
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}

// Build every text this request would send: [{team, body, recipients:[contact]}].
async function plan(b, { roles, today }) {
  const isAdmin = roles.admin === true;
  const template = TEMPLATES.includes(b.template) ? b.template : null;
  if (!template) return { error: ['bad-template', 'Pick cancel, moved or your own message.'] };
  const teams = await loadTeams();
  const names = Object.fromEntries(teams.map(t => [t.id, String(t.name || t.id)]));
  const allowed = isAdmin ? new Set(teams.map(t => t.id)) : new Set(roles.captain_teams);
  const team = String(b.team || '');

  let game = null;
  if (template !== 'free') {
    const gid = String(b.gameId || '');
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(gid)) return { error: ['no-game', 'Pick the game.'] };
    const { current } = await loadCurrent({ fromDate: null, teams });
    const s = current.get(gid);
    if (!s) return { error: ['no-game', 'That game is not on the schedule.'] };
    game = { id: gid, ...s };
  }

  let targets;
  if (team === 'all') {
    if (!isAdmin) return { error: ['forbidden', 'Only the league office can text every team.'] };
    if (template !== 'free') return { error: ['bad-team', 'Pick a team for a game text.'] };
    targets = ['all'];
  } else if (team === 'both') {
    if (!isAdmin || !game) return { error: ['bad-team', 'Pick a team.'] };
    targets = [game.away, game.home].filter(Boolean);
  } else {
    if (!allowed.has(team)) return { error: ['forbidden', isAdmin ? 'Pick a team.' : 'You can only text a team you captain.'] };
    targets = [team];
  }
  if (game && targets.some(t => t !== game.away && t !== game.home)) return { error: ['not-your-game', "That game is not your team's."] };

  const senderTeamName = !isAdmin ? names[team] : '';
  const contacts = await loadContacts();
  const seen = new Set();
  const out = [];
  for (const t of targets) {
    const built = buildBody({ template, game, teamId: t === 'all' ? '' : t, teamNames: names, text: b.text, moveTo: b.moveTo, today, isAdmin, senderTeamName });
    if (built.error) {
      const msg = { 'too-long': 'That message is too long.', empty: 'Write a message first.', 'no-game': 'Pick the game.', 'not-your-game': "That game is not your team's." }[built.error] || 'That did not work.';
      return { error: [built.error, msg] };
    }
    const rec = (t === 'all' ? contacts : contactsForTeams(contacts, [t])).filter(c => !seen.has(c.phone));
    rec.forEach(c => seen.add(c.phone));
    out.push({ team: t, teamName: t === 'all' ? 'Every team' : names[t] || t, body: built.body, recipients: rec });
  }
  return { texts: out, game, template };
}

function summary(p) {
  return p.texts.map(x => ({ team: x.team, teamName: x.teamName, body: x.body, segments: segments(x.body), count: x.recipients.length }));
}

async function liveFor(cfg) { return twilioConfigured() && cfg.team_texts.enabled; }

async function status() {
  const [cfg, teams, optins, senders, log, snaps] = await Promise.all([
    readConfig(), loadTeams(), fsQuery('sms_optins'), fsQuery('sms_senders'),
    fsQuery('sms_log', [], { orderBy: ['at', 'desc'], limit: 60 }).catch(() => []),
    fsQuery('sms_schedule').catch(() => []),
  ]);
  const optById = new Map(optins.map(o => [o.id, o]));
  const per = {};
  for (const t of teams) per[t.id] = { id: t.id, name: String(t.name || t.id), active: t.active !== false, optedIn: 0, waiting: 0, stopped: 0, senders: 0 };
  for (const o of optins) {
    const p = per[o.team_id]; if (!p) continue;
    if (o.stopped === true) p.stopped++; else if (o.confirmed === true) p.optedIn++; else p.waiting++;
  }
  for (const s of senders) {
    const ts = Array.isArray(s.team_ids) && s.team_ids.length ? s.team_ids : [s.team_id];
    if (s.active !== false) for (const t of ts) if (per[t]) per[t].senders++;
  }
  const env = process.env;
  return {
    ok: true,
    switches: Object.fromEntries(SWITCHES.map(k => [k, cfg[k].enabled])),
    copyPhones: cfg.schedule_alerts.phones.length,
    env: {
      twilio: twilioConfigured(),
      messagingService: !!env.TWILIO_MESSAGING_SERVICE_SID,
      from: !!env.TWILIO_FROM,
      apiKey: !!(env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET),
      authToken: !!env.TWILIO_AUTH_TOKEN,
      inboundUrl: !!env.TWILIO_INBOUND_URL,
      statusUrl: !!env.TWILIO_STATUS_URL,
      cronSecret: !!env.CRON_SECRET,
      dryRun: dryEnv(),
      number: publicNumber(),
    },
    inWindow: inSendWindow(),
    today: todayET(),
    snapshots: snaps.length,
    teams: Object.values(per).filter(t => t.active).sort((a, b) => a.name.localeCompare(b.name)),
    senders: senders.map(s => ({
      ref: refOf(s.id), name: String(s.name || ''), team_id: s.team_id || '', team_ids: Array.isArray(s.team_ids) ? s.team_ids : [],
      role: s.role || '', source: s.source || '', active: s.active !== false, last4: lastFour(s.phone || s.id),
      optedIn: !!(optById.get(s.id) && optById.get(s.id).confirmed === true && optById.get(s.id).stopped !== true),
    })).sort((a, b) => (a.team_id + a.name).localeCompare(b.team_id + b.name)),
    optins: optins.map(o => ({
      name: String(o.name || ''), team_id: o.team_id || '', role: o.role || '', source: o.source || '', last4: lastFour(o.phone || o.id),
      confirmed: o.confirmed === true, stopped: o.stopped === true, at: o.confirmed_at || o.requested_at || o.consent_at || null,
    })).sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 300),
    log: log.map(l => ({ at: l.at || null, dir: l.dir || '', last4: l.phone_last4 || '', team_id: l.team_id || '', kind: l.kind || '', text: String(l.text || '').slice(0, 400), outcome: l.outcome || '', game_id: l.game_id || '' })),
  };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (rejectForeignOrigin(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  if (rateLimited('sms-send:' + user.uid, 20, 60 * 1000)) return err(res, 429, 'rate-limited', 'Too many requests. Wait a minute.');
  const b = body(req);
  const action = String(b.action || '');

  let roles;
  try { roles = await getRoles(user.uid); } catch (e) { return err(res, 503, 'unavailable', 'Could not check your access. Try again.'); }
  const isAdmin = roles.admin === true;
  const isCaptain = roles.captain_teams.length > 0;
  if (!isAdmin && !isCaptain) return err(res, 403, 'forbidden', 'Only captains and the league office can send team texts.');
  const today = todayET();

  try {
    if (action === 'mine') {
      const [cfg, teams, contacts] = await Promise.all([readConfig(), loadTeams(), loadContacts()]);
      const mine = teams.filter(t => t.active !== false && (isAdmin || roles.captain_teams.includes(t.id)));
      const names = Object.fromEntries(teams.map(t => [t.id, String(t.name || t.id)]));
      const games = await upcomingGames(mine.map(t => t.id), today, teams);
      return res.status(200).json({
        ok: true, isAdmin, live: await liveFor(cfg), inWindow: inSendWindow(), number: publicNumber(), today,
        inboundOn: cfg.inbound.enabled, photoOn: cfg.box_photo.enabled,
        teams: mine.map(t => ({ id: t.id, name: names[t.id], optedIn: contactsForTeams(contacts, [t.id]).length })).sort((a, z) => a.name.localeCompare(z.name)),
        games: games.slice(0, 60).map(g => ({ ...g, awayName: names[g.away] || g.away || 'TBD', homeName: names[g.home] || g.home || 'TBD' })),
      });
    }

    if (action === 'preview' || action === 'send') {
      const p = await plan(b, { roles, today });
      if (p.error) return err(res, p.error[0] === 'forbidden' ? 403 : 400, p.error[0], p.error[1]);
      const total = p.texts.reduce((n, x) => n + x.recipients.length, 0);
      const cfg = await readConfig();
      const live = await liveFor(cfg);
      if (action === 'preview') return res.status(200).json({ ok: true, live, inWindow: inSendWindow(), total, texts: summary(p) });

      if (b.confirm !== true) return err(res, 400, 'confirm', 'Preview first, then confirm.');
      if (!live) return err(res, 503, 'dormant', 'Team texts are switched off.');
      if (!inSendWindow()) return err(res, 409, 'quiet-hours', 'Team texts can go out between 8 AM and 9 PM.');
      if (!total) return err(res, 400, 'nobody', 'Nobody on that team has signed up for texts yet.');
      if (total > MAX_RECIPIENTS) return err(res, 400, 'too-many', 'That is more people than one send allows.');
      if (!isAdmin) {
        for (const x of p.texts) if ((await dailyCount('sms-blast-' + x.team)) > 6) return err(res, 429, 'team-cap', 'Your team has had enough texts today.');
      }
      if ((await dailyCount(isAdmin ? 'sms-blast-admin' : 'sms-blast')) > (isAdmin ? 60 : 80)) return err(res, 429, 'daily-cap', 'The daily limit for team texts is reached.');

      const items = [];
      for (const x of p.texts) for (const c of x.recipients) items.push({ to: c.phone, body: x.body, kind: 'team_text', team_id: x.team === 'all' ? (c.teamIds[0] || null) : x.team, game_id: p.game ? p.game.id : null });
      const t = tally(await sendMany(items));
      return res.status(200).json({ ok: true, total, ...t });
    }

    if (!isAdmin) return err(res, 403, 'forbidden', 'Admins only.');

    if (action.startsWith('email-')) {
      const r = await emailAdmin(action, b, { uid: user.uid });
      return res.status(r.status).json(r.body);
    }

    if (action === 'status') return res.status(200).json(await status());

    if (action === 'config') {
      const key = String(b.key || '');
      if (!SWITCHES.includes(key) || typeof b.enabled !== 'boolean') return err(res, 400, 'bad-switch', 'Unknown switch.');
      const cur = (await fsGet('sms_state/config')) || {};
      const prev = cur[key] && typeof cur[key] === 'object' ? cur[key] : {};
      let reseeded = null;
      // Switching the watcher on starts it quiet: snapshots match the schedule now.
      // (When schedule emails are already on, the watcher is running and the snapshots are current.)
      if (key === 'schedule_alerts' && b.enabled && prev.enabled !== true && !(cur.schedule_emails && cur.schedule_emails.enabled === true)) reseeded = await seedSnapshots({});
      await fsUpdate('sms_state/config', { [key]: { ...prev, enabled: b.enabled, updated_at: new Date(), updated_by: user.uid } });
      return res.status(200).json({ ok: true, key, enabled: b.enabled, reseeded });
    }

    if (action === 'add-sender') {
      const e164 = strictUsE164(b.phone);
      const id = phoneDocId(e164);
      const name = String(b.name || '').trim().slice(0, 60);
      const role = b.role === 'admin' ? 'admin' : 'captain';
      const team = String(b.team || '');
      if (!id) return err(res, 400, 'bad-phone', 'Enter a US cell number.');
      if (!name || /[<>]/.test(name)) return err(res, 400, 'bad-name', 'Enter a name.');
      if (role === 'captain') {
        const t = /^[A-Za-z0-9_-]{1,40}$/.test(team) ? await fsGet(`teams/${team}`) : null;
        if (!t || team === '__playoff_brackets') return err(res, 400, 'bad-team', 'Pick a team.');
      }
      await fsUpdate(`sms_senders/${id}`, { phone: e164, name, role, team_id: role === 'captain' ? team : null, team_ids: role === 'captain' ? [team] : [], source: 'admin', active: true, updated_at: new Date(), updated_by: user.uid });
      return res.status(200).json({ ok: true, last4: lastFour(e164) });
    }

    if (action === 'remove-sender') {
      const ref = String(b.ref || '');
      if (!/^[0-9a-f]{20}$/.test(ref)) return err(res, 400, 'bad-ref', 'Unknown sender.');
      const cur = (await fsQuery('sms_senders')).find(s => refOf(s.id) === ref);
      if (!cur) return err(res, 404, 'not-found', 'Unknown sender.');
      await fsUpdate(`sms_senders/${cur.id}`, { active: false, source: cur.source === 'captains' ? 'admin' : (cur.source || 'admin'), updated_at: new Date(), updated_by: user.uid });
      return res.status(200).json({ ok: true });
    }

    return err(res, 400, 'bad-action', 'Unknown action.');
  } catch (e) {
    console.error('[sms-send] failed:', e && e.message);
    return err(res, 500, 'failed', 'That did not work. Try again.');
  }
}
