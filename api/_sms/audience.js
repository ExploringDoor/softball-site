// Who gets a team's texts (Builder C): every number that said YES
// (sms_optins confirmed, not stopped) for that team, plus the team's captains
// from sms_senders when THAT number also said YES. A captain listed in
// sms_senders can always text scores in, but is only texted first once the
// phone has opted in (carrier rule: the league only starts a conversation
// with someone who signed up).
import { fsQuery } from '../_lib/dvsl.js';
import { phoneDocId, toE164US } from './ids.js';

export async function loadContacts() {
  const [optins, senders] = await Promise.all([
    fsQuery('sms_optins', [['confirmed', '==', true]]),
    fsQuery('sms_senders', [['active', '==', true]]),
  ]);
  const byId = new Map();
  for (const o of optins) {
    if (o.stopped === true) continue;
    const phone = toE164US(o.phone || '');
    const id = phoneDocId(phone);
    if (!id || id !== o.id) continue;
    byId.set(id, { phone, name: String(o.name || ''), role: o.role || '', teamIds: o.team_id ? [String(o.team_id)] : [] });
  }
  for (const s of senders) {
    const c = byId.get(s.id);
    if (!c) continue;
    const ts = Array.isArray(s.team_ids) && s.team_ids.length ? s.team_ids : (s.team_id ? [s.team_id] : []);
    for (const t of ts) if (t && !c.teamIds.includes(String(t))) c.teamIds.push(String(t));
    if (s.role === 'captain' && !c.role) c.role = 'captain';
  }
  return [...byId.values()];
}

export function contactsForTeams(contacts, teamIds) {
  const set = new Set(teamIds);
  return contacts.filter(c => c.teamIds.some(t => set.has(t)));
}
