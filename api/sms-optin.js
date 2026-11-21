// /api/sms-optin: the public "Get DVSL texts" sign-up behind /sms.html.
//
// GET  -> { ok, live, number, teams:[{id,name}] }   (public, nothing personal)
// POST { name, phone, team, role, agree, website } -> one generic answer
//
// The box beside the consent words is unticked and NOT required to submit
// (carriers read a required box as forced consent): an unticked submit saves
// nothing and says so. A ticked submit records the consent words, time, IP
// and browser, then sends ONE text asking for YES. The number gets nothing
// else until that phone replies YES (api/sms-inbound -> confirmOptIn).
//
// Dormant: 503 unless the Twilio env is set and a texting switch is on
// (sms_state/config team_texts or schedule_alerts). Origin required, honeypot,
// 5 sign-ups per IP per 10 minutes, 200 per day.
import { cors, rejectForeignOrigin, rateLimited, clientIp, dailyCount, fsGet, body } from './_lib/dvsl.js';
import { readConfig, publicNumber } from './_sms/config.js';
import { twilioConfigured } from './_sms/send.js';
import { requestOptIn, strictUsE164, ROLES } from './_sms/optin.js';
import { loadTeams } from './_sms/schedule.js';

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

async function isLive() {
  if (!twilioConfigured()) return false;
  try { const c = await readConfig(); return c.team_texts.enabled || c.schedule_alerts.enabled; } catch (e) { return false; }
}

const OK_MESSAGE = 'Thanks. Check your phone for a text from DVSL and reply YES to finish signing up. ' +
  'If nothing arrives in a few minutes, this number may already be signed up, or it replied STOP before: text START to the DVSL number first.';

export default async function handler(req, res) {
  if (cors(req, res, { methods: ['GET', 'POST'] })) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    let teams = [];
    try { teams = (await loadTeams()).filter(t => t.active !== false).map(t => ({ id: t.id, name: String(t.name || t.id) })).sort((a, b) => a.name.localeCompare(b.name)); }
    catch (e) { teams = []; }
    return res.status(200).json({ ok: true, live: await isLive(), number: publicNumber(), teams });
  }

  if (rejectForeignOrigin(req, res)) return;
  const ip = clientIp(req);
  if (rateLimited('sms-optin:' + ip, 5, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'rate-limited', message: 'Too many sign-ups from this connection. Please try again in a little while.' });
  }
  const b = body(req);
  if (clip(b.website, 100)) return res.status(200).json({ ok: true, enrolled: false, message: OK_MESSAGE });

  const name = clip(b.name, 60);
  const teamId = clip(b.team, 40);
  const role = ROLES.includes(b.role) ? b.role : '';
  const e164 = strictUsE164(b.phone);
  if (!name || /[<>]/.test(name)) return res.status(400).json({ error: 'bad-name', message: 'Enter your name.' });
  if (!e164) return res.status(400).json({ error: 'bad-phone', message: 'Enter a US cell phone number, like (215) 555-0100.' });
  if (!role) return res.status(400).json({ error: 'bad-role', message: 'Pick player, captain or fan.' });
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(teamId) || teamId === '__playoff_brackets') return res.status(400).json({ error: 'bad-team', message: 'Pick your team.' });

  if (b.agree !== true) {
    return res.status(200).json({ ok: true, enrolled: false, message: 'Nothing was saved, because the box was not ticked. Tick it if you want DVSL texts.' });
  }

  let team;
  try { team = await fsGet(`teams/${teamId}`); }
  catch (e) { return res.status(503).json({ error: 'unavailable', message: 'Could not reach the league database. Please try again.' }); }
  if (!team || team.active === false) return res.status(400).json({ error: 'bad-team', message: 'Pick your team.' });

  if (!(await isLive())) {
    return res.status(503).json({ error: 'dormant', message: 'DVSL texts are not switched on yet. Please check back soon.' });
  }
  if ((await dailyCount('sms-optin')) > 200) {
    return res.status(429).json({ error: 'busy', message: 'Sign-ups are paused for today. Please try again tomorrow.' });
  }

  try {
    const r = await requestOptIn({
      phone: e164, name, team_id: teamId, team_name: team.name || '', role,
      ip, ua: String(req.headers['user-agent'] || ''),
    });
    if (r.outcome === 'send-failed') {
      return res.status(502).json({ error: 'send-failed', message: 'Your sign-up was saved but the text did not go out. Please try again in a few minutes.' });
    }
  } catch (e) {
    console.error('[sms-optin] failed:', e && e.message);
    return res.status(502).json({ error: 'save-failed', message: 'Could not save your sign-up just now. Please try again.' });
  }
  return res.status(200).json({ ok: true, enrolled: true, message: OK_MESSAGE });
}
