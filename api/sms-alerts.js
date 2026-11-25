// GET /api/sms-alerts: the schedule-change watcher (Builder C).
//
// Vercel cron, every 15 minutes (vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET`; anything else is refused, and with
// CRON_SECRET unset nobody can run it (fails closed).
//
// ?dry=1 previews what the next run WOULD text, sends and remembers nothing.
// A dry run is also open to a signed-in admin (Bearer Firebase ID token), for
// the Texts tab in admin.html.
//
// Dormant: a real run answers 503 while neither channel can send (texts need
// the Twilio env + schedule_alerts on; emails need the email env in
// api/_lib/email.js + schedule_emails on). A switch that is on still moves
// the snapshots forward while dormant, so nothing old goes out later.
import crypto from 'crypto';
import { cors, verifyIdToken, getRoles, rateLimited } from './_lib/dvsl.js';
import { runScheduleAlerts } from './_sms/alerts.js';

function isCron(req) {
  const exp = process.env.CRON_SECRET || '';
  if (!exp) return false;
  const got = Buffer.from(String(req.headers.authorization || ''));
  const want = Buffer.from('Bearer ' + exp);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export default async function handler(req, res) {
  if (cors(req, res, { methods: ['GET'] })) return;
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  const dry = q.dry === '1' || q.dry === 'true';

  let who = null;
  if (isCron(req)) who = 'cron';
  else if (dry) {
    let user = null;
    try { user = await verifyIdToken(req); } catch (e) { return res.status(503).json({ error: 'auth-unavailable', message: 'Could not check your sign in.' }); }
    if (user && (await getRoles(user.uid)).admin) {
      if (rateLimited('sms-alerts-dry:' + user.uid, 6, 60 * 1000)) return res.status(429).json({ error: 'rate-limited', message: 'Wait a minute and try again.' });
      who = 'admin';
    }
  }
  if (!who) return res.status(401).json({ error: 'unauthorized' });

  try {
    const out = await runScheduleAlerts({ dry, emailTeam: typeof q.team === 'string' ? q.team.slice(0, 40) : '' });
    // Both switches off is a normal state (200, skipped:'off'); a switch on
    // with nothing able to send is dormant (503), after moving snapshots on.
    if (!dry && out.dormant && out.skipped !== 'off') return res.status(503).json({ error: 'dormant', message: 'Neither schedule texts (Twilio) nor schedule emails can send yet.', skipped: out.skipped || null, changes: out.changes || 0 });
    return res.status(200).json(out);
  } catch (e) {
    console.error('[sms-alerts] run failed:', e && e.message);
    return res.status(500).json({ error: 'run-failed', message: 'The schedule check failed. It will try again next run.' });
  }
}
