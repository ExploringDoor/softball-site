// sms_state/config: the four on/off switches (all OFF unless set true) and the
// league clock. Builder C. Server only; the admin Texts tab changes these
// through /api/sms-send {action:'config'}, never by writing Firestore.
import { fsGet } from '../_lib/dvsl.js';
import { todayIn } from './core.js';

export const TZ = 'America/New_York';
export const SITE = 'https://dvsl.vercel.app';
export const SWITCHES = ['inbound', 'box_photo', 'schedule_alerts', 'team_texts', 'reminders']; // reminders: late score + makeup texts (api/league-reminders.js)
// Automatic and bulk texts only go out 8:00 AM to 8:59 PM league time.
export const SEND_FROM_HOUR = 8;
export const SEND_UNTIL_HOUR = 21;

export function normalizeConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const k of SWITCHES) out[k] = { ...(c[k] && typeof c[k] === 'object' ? c[k] : {}), enabled: !!(c[k] && c[k].enabled === true) };
  out.schedule_alerts.phones = Array.isArray(c.schedule_alerts && c.schedule_alerts.phones)
    ? c.schedule_alerts.phones.filter(p => typeof p === 'string') : [];
  return out;
}

export async function readConfig() {
  return normalizeConfig(await fsGet('sms_state/config'));
}

export function todayET(now = new Date()) { return todayIn(TZ, now); }

export function minutesET(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour').value) % 24;
  const m = Number(parts.find(p => p.type === 'minute').value);
  return h * 60 + m;
}

export function inSendWindow(now = new Date()) {
  const m = minutesET(now);
  return m >= SEND_FROM_HOUR * 60 && m < SEND_UNTIL_HOUR * 60;
}

// The DVSL text number for pages, "(215) 555-0100", or '' before one exists.
export function publicNumber(env = process.env) {
  const d = String(env.SMS_PUBLIC_NUMBER || env.TWILIO_FROM || '').replace(/[^\d]/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : '';
}
