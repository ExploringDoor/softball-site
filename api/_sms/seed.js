// Seed who may text scores in (Builder C): sms_senders/{digits} from the
// captains collection's phones. Captains are senders (they can text a score)
// but are NOT opted in to receive texts; that takes their own YES.
//
// Rows the admin added by hand (source 'admin') or that came from an opt-in
// (source 'optin') are never touched. Captain rows whose phone is no longer on
// any captains doc are set active:false (never deleted).
import { fsQuery, fsCommit, encFields } from '../_lib/dvsl.js';
import { phoneDocId, toE164US } from './ids.js';

export async function seedSenders({ dry = false, now = new Date() } = {}) {
  const [captains, existing, teams] = await Promise.all([fsQuery('captains'), fsQuery('sms_senders'), fsQuery('teams')]);
  const activeTeam = new Set(teams.filter(t => t.id !== '__playoff_brackets' && t.active !== false).map(t => t.id));
  const want = new Map();
  let noPhone = 0, inactiveTeam = 0;
  for (const c of captains) {
    const id = phoneDocId(c.phone || '');
    if (!id) { noPhone++; continue; }
    if (!c.team_id || !activeTeam.has(c.team_id)) { inactiveTeam++; continue; }
    const row = want.get(id) || { phone: toE164US(c.phone), name: String(c.name || '').slice(0, 80), team_ids: [], role: 'captain', source: 'captains', active: true };
    if (!row.team_ids.includes(c.team_id)) row.team_ids.push(c.team_id);
    want.set(id, row);
  }
  const have = new Map(existing.map(d => [d.id, d]));
  const writes = [];
  let created = 0, updated = 0, kept = 0, deactivated = 0;
  for (const [id, row] of want) {
    const cur = have.get(id);
    if (cur && cur.source && cur.source !== 'captains') { kept++; continue; }
    const fields = { ...row, team_id: row.team_ids[0], updated_at: now };
    if (!cur) { fields.created_at = now; created++; } else updated++;
    writes.push({ update: { name: `sms_senders/${id}`, fields: encFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) } });
  }
  for (const cur of existing) {
    if (want.has(cur.id) || cur.source !== 'captains' || cur.active === false) continue;
    deactivated++;
    writes.push({ update: { name: `sms_senders/${cur.id}`, fields: encFields({ active: false, updated_at: now }) }, updateMask: { fieldPaths: ['active', 'updated_at'] } });
  }
  if (!dry) for (let i = 0; i < writes.length; i += 400) await fsCommit(writes.slice(i, i + 400));
  return { dry, captains: captains.length, created, updated, kept, deactivated, noPhone, inactiveTeam };
}
