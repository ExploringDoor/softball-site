// POST /api/sms-seed {dry?:bool, what?:'all'|'senders'|'schedule'} (admin only, Builder C).
//
// senders:  sms_senders/{digits} from the captains collection's phones, so
//           captains can text scores in (they still need their own YES to
//           RECEIVE texts).
// schedule: an sms_schedule snapshot for every game, matching the schedule
//           right now, so the change watcher starts quiet and never texts
//           about history. Run it again after any bulk import or restore
//           (memory: reference_island_restore_texts_coaches).
// dry:true reports the counts and writes nothing.
import { cors, rejectForeignOrigin, rateLimited, requireUser, getRoles, body } from './_lib/dvsl.js';
import { seedSenders } from './_sms/seed.js';
import { seedSnapshots } from './_sms/schedule.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (rejectForeignOrigin(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  const user = await requireUser(req, res);
  if (!user) return;
  if (rateLimited('sms-seed:' + user.uid, 5, 60 * 1000)) return res.status(429).json({ error: 'rate-limited', message: 'Wait a minute and try again.' });
  let roles;
  try { roles = await getRoles(user.uid); } catch (e) { return res.status(503).json({ error: 'unavailable', message: 'Could not check your access.' }); }
  if (!roles.admin) return res.status(403).json({ error: 'forbidden', message: 'Admins only.' });

  const b = body(req);
  const dry = b.dry === true;
  const what = ['senders', 'schedule'].includes(b.what) ? b.what : 'all';
  try {
    const out = { ok: true, dry };
    if (what !== 'schedule') out.senders = await seedSenders({ dry });
    if (what !== 'senders') out.schedule = await seedSnapshots({ dry });
    return res.status(200).json(out);
  } catch (e) {
    console.error('[sms-seed] failed:', e && e.message);
    return res.status(500).json({ error: 'failed', message: 'Seeding failed. Nothing was half written that matters; run it again.' });
  }
}
