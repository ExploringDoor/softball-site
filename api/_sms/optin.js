// Who RECEIVES DVSL texts (Builder C). sms_optins/{digits} (phoneDocId), the
// full E.164 in `phone`.
//
// A web form is not consent from the phone (league-platform consent.ts): the
// sign-up page records what was agreed to and sends ONE text asking for YES,
// at most once a day per number. The number counts only after that phone
// replies YES within 7 days (the inbound webhook calls confirmOptIn). STOP is
// handled by Twilio Advanced Opt-Out; the webhook also calls markStopped so
// our own sends refuse the number too.
//
// Interface used by api/sms-inbound.js (Builder A):
//   confirmOptIn(e164) -> { confirmed, name?, team_id?, already?, reply? }
//   markStopped(e164)  -> { ok }
//   markStarted(e164)  -> { ok }   (START / UNSTOP)
import { fsGet, fsUpdate } from '../_lib/dvsl.js';
import { phoneDocId, toE164US, lastFour } from './ids.js';
import { DISCLOSURE, isYesReply, WEB_CONFIRM_RESEND_MS, WEB_CONFIRM_VALID_MS } from './core.js';
import { sendSms } from './send.js';

export { isYesReply, DISCLOSURE };
export const LEAGUE = 'DVSL';
export const LEAGUE_FULL = 'Delaware Valley Softball League';
export const ROLES = ['player', 'captain', 'fan'];

// The words beside the (unticked) box on /sms.html. One copy: the page shows
// it, the record stores it, and the campaign registration quotes it. Based on
// league-platform consentText(), widened to cover the team texts DVSL sends.
export const CONSENT_TEXT =
  `I agree to receive text messages from DVSL (${LEAGUE_FULL}) at this number about my team's games: ` +
  `messages from my team's captain and the league office, a text when one of my team's games is moved, postponed or cancelled, ` +
  `and replies to the scores and questions I text. ` +
  `Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time, or HELP for help. ` +
  `Agreeing is not a condition of registering or playing.`;

// The one text a web sign-up sends (league-platform webConfirmText, DVSL words).
export function webConfirmText(teamName) {
  const which = teamName ? ` for ${teamName}` : '';
  return `DVSL: Reply YES to get DVSL team and schedule texts${which}. Not you? Ignore this text. ${DISCLOSURE}`;
}
// The answer to that YES.
export function welcomeText(teamName) {
  const which = teamName ? ` for ${teamName}` : '';
  return `DVSL: You're signed up for team and schedule texts${which}. ${DISCLOSURE}`;
}

const ms = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0; };

async function teamName(id) {
  if (!id) return '';
  try { const t = await fsGet(`teams/${id}`); return (t && t.name) || ''; } catch (e) { return ''; }
}

// A web sign-up. Writes the record (consent words, when, from where) and
// sends the confirming text. Every outcome answers the browser the same way,
// so the form never reveals whether a number is already on the list.
//   outcome: 'sent' | 'dry' | 'already' | 'stopped' | 'recent' | 'send-failed'
export async function requestOptIn({ phone, name, team_id, team_name, role, ip = '', ua = '', now = new Date(), dry = false }) {
  const e164 = toE164US(phone);
  const id = phoneDocId(e164);
  if (!id) return { outcome: 'invalid' };
  const cur = await fsGet(`sms_optins/${id}`);
  if (cur && cur.stopped === true) return { outcome: 'stopped' };
  if (cur && cur.confirmed === true) return { outcome: 'already' };
  if (cur && cur.confirm_sent_at && now.getTime() - ms(cur.confirm_sent_at) < WEB_CONFIRM_RESEND_MS) return { outcome: 'recent' };

  const rec = {
    phone: e164, name, team_id, role, source: 'web',
    consent_text: CONSENT_TEXT, consent_at: now,
    confirmed: false, confirmed_at: null, stopped: false,
    ip: String(ip || '').slice(0, 60), user_agent: String(ua || '').slice(0, 300),
    requested_at: now,
  };
  if (!dry) await fsUpdate(`sms_optins/${id}`, rec);
  const r = await sendSms({ to: e164, body: webConfirmText(team_name || (await teamName(team_id))), kind: 'optin_confirm', team_id, dry });
  if (r.ok && r.skipped === 'dry') return { outcome: 'dry', body: r.body };
  if (!r.ok) return { outcome: 'send-failed', reason: r.skipped || r.error };
  await fsUpdate(`sms_optins/${id}`, { confirm_sent_at: now });
  return { outcome: 'sent', last4: lastFour(e164) };
}

// A YES arrived. Confirms a web sign-up that is waiting (sent within 7 days).
export async function confirmOptIn(e164, now = new Date()) {
  const id = phoneDocId(e164);
  if (!id) return { confirmed: false };
  const cur = await fsGet(`sms_optins/${id}`);
  if (!cur || cur.stopped === true) return { confirmed: false };
  if (cur.confirmed === true) return { confirmed: true, already: true, name: cur.name || '', team_id: cur.team_id || '' };
  const sentAt = ms(cur.confirm_sent_at);
  if (!sentAt || now.getTime() - sentAt > WEB_CONFIRM_VALID_MS) return { confirmed: false, expired: !!sentAt };
  await fsUpdate(`sms_optins/${id}`, { confirmed: true, confirmed_at: now });
  return { confirmed: true, name: cur.name || '', team_id: cur.team_id || '', reply: welcomeText(await teamName(cur.team_id)) };
}

export async function markStopped(e164, now = new Date()) {
  const id = phoneDocId(e164);
  if (!id) return { ok: false };
  await fsUpdate(`sms_optins/${id}`, { phone: toE164US(e164), stopped: true, stopped_at: now });
  return { ok: true };
}

// START / UNSTOP: Twilio lets the number receive again; a number that had
// confirmed before is back on, a number that never said YES stays unconfirmed.
export async function markStarted(e164, now = new Date()) {
  const id = phoneDocId(e164);
  if (!id) return { ok: false };
  const cur = await fsGet(`sms_optins/${id}`);
  if (!cur) return { ok: true };
  await fsUpdate(`sms_optins/${id}`, { stopped: false, started_at: now });
  return { ok: true };
}

// Strict US mobile check for the public form: NANP area code and exchange 2-9.
export function strictUsE164(raw) {
  const d = String(raw || '').replace(/[^\d]/g, '');
  const e = d.length === 10 ? '+1' + d : (d.length === 11 && d[0] === '1') ? '+' + d : '';
  return /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(e) ? e : '';
}
