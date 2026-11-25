// GET /api/league-reminders: late score + makeup reminders (Builder M).
//
// Vercel cron (vercel.json, twice a day). Vercel sends
// `Authorization: Bearer $CRON_SECRET`; with CRON_SECRET unset nobody can
// run it for real (fails closed).
//
// ?dry=1 previews what a run WOULD send and returns the reminder log for the
// admin Makeups panel. Open to the cron secret or a signed-in admin
// (Bearer Firebase ID token). A dry run reads only: it claims, pushes, texts
// and writes nothing.
//
// Pushes go to the captains of the side that hasn't reported (category
// 'scores', captains only) and one daily digest to admins. Texts go out only
// when sms_state/config.reminders.enabled is true, Twilio is configured and
// it's 8 AM to 9 PM in New York.
import crypto from 'crypto';
import { cors, requireUser, getRoles, rateLimited } from './_lib/dvsl.js';
import { runReminders, makeupsReport } from './_lib/reminders.js';

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
  else if (!dry) return res.status(401).json({ error: 'unauthorized' });
  else {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!(await getRoles(user.uid)).admin) return res.status(403).json({ error: 'forbidden', message: 'Commissioner only.' });
    if (rateLimited('league-reminders-dry:' + user.uid, 6, 60 * 1000)) return res.status(429).json({ error: 'rate-limited', message: 'Wait a minute and try again.' });
    who = 'admin';
  }

  try {
    const out = await runReminders({ dry, run: who });
    if (dry) out.report = await makeupsReport({});
    return res.status(200).json(out);
  } catch (e) {
    console.error('[league-reminders] run failed:', e && e.message);
    return res.status(500).json({ error: 'run-failed', message: 'The reminder check failed. It will try again next run.' });
  }
}
