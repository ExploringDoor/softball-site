// Outbound texts for DVSL (Builder C). One function every sender uses:
//
//   sendSms({ to, body, kind, team_id, game_id, dry }) -> { ok, sid?, skipped?, error? }
//
// DORMANT BY DEFAULT. Nothing leaves unless the Twilio env is set, and even
// then SMS_DRY_RUN=1 (or dry:true) turns every call into a preview. Callers
// also check the sms_state/config switch for their feature; this file does
// not, so a direct reply from the inbound webhook still works when the
// outbound switches are off.
//
// Consent: the league only STARTS a conversation with a number that said
// YES (sms_optins/{digits}.confirmed === true and not stopped). The only
// exceptions are a direct reply to a text the person just sent ('reply')
// and the one confirming text a web sign-up sends ('optin_confirm', which
// still refuses a number that replied STOP). An 'office_alert' may also go
// to an active admin sender (the commissioner added his own number).
//
// Env (Vercel):
//   TWILIO_ACCOUNT_SID                       required
//   TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET   preferred auth
//   TWILIO_AUTH_TOKEN                         fallback auth (also signs inbound)
//   TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM  who it comes from
//   TWILIO_STATUS_URL                         delivery receipts (api/sms-status)
//   SMS_DRY_RUN=1                             preview only, sends nothing
//   SMS_DAILY_CAP                             outbound ceiling per day (default 500)
//
// Phones are PII: only the last four digits are ever logged.
import { fsGet, fsCreate, dailyCount } from '../_lib/dvsl.js';
import { phoneDocId, toE164US, lastFour } from './ids.js';

export const BRAND = 'DVSL: ';
export const DIRECT_KINDS = new Set(['reply', 'optin_confirm']);

export function twilioConfigured(env = process.env) {
  const auth = (env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET) || env.TWILIO_AUTH_TOKEN;
  return !!(env.TWILIO_ACCOUNT_SID && auth && (env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM));
}
export function dryEnv(env = process.env) {
  return /^(1|true|yes)$/i.test(String(env.SMS_DRY_RUN || ''));
}

// Every outbound text starts with "DVSL: ".
export function branded(body) {
  let s = String(body == null ? '' : body).replace(/\r\n?/g, '\n').trim();
  if (!s.startsWith(BRAND)) s = BRAND + s.replace(/^DVSL[:\s]*/i, '');
  return s.slice(0, 1000);
}

// May the league text this number with this kind of message?
// Returns '' when allowed, else the reason.
export async function consentProblem(e164, kind) {
  if (kind === 'reply') return '';
  const id = phoneDocId(e164);
  if (!id) return 'bad-number';
  const o = await fsGet(`sms_optins/${id}`);
  if (o && o.stopped === true) return 'stopped';
  if (kind === 'optin_confirm') return '';
  if (o && o.confirmed === true) return '';
  if (kind === 'office_alert') {
    const s = await fsGet(`sms_senders/${id}`);
    if (s && s.active !== false && s.role === 'admin') return '';
  }
  return 'not-opted-in';
}

async function logOut(entry) {
  try {
    await fsCreate('sms_log', {
      at: new Date(),
      dir: 'out',
      phone_last4: entry.last4,
      team_id: entry.team_id || null,
      kind: entry.kind || 'other',
      text: entry.text,
      outcome: entry.outcome,
      game_id: entry.game_id || null,
      sid: entry.sid || null,
      error: entry.error || null,
      expires_at: new Date(Date.now() + 120 * 86400 * 1000),
    });
  } catch (e) { /* the text went out (or not); the log line is a nicety */ }
}

export async function sendSms({ to, body, kind = 'other', team_id = null, game_id = null, dry = false } = {}) {
  const env = process.env;
  const e164 = toE164US(to);
  const id = phoneDocId(e164);
  if (!e164 || !id) return { ok: false, skipped: 'bad-number' };
  const text = branded(body);
  if (!text || text === BRAND.trim()) return { ok: false, skipped: 'empty' };
  const last4 = lastFour(e164);

  let problem;
  try { problem = await consentProblem(e164, kind); }
  catch (e) { return { ok: false, error: 'consent-check-failed' }; }
  if (problem) {
    if (!dry) await logOut({ last4, team_id, kind, text, outcome: 'refused:' + problem, game_id });
    return { ok: false, skipped: problem };
  }

  if (dry || dryEnv(env)) return { ok: true, skipped: 'dry', body: text };
  if (!twilioConfigured(env)) return { ok: false, skipped: 'not-configured' };

  const cap = Number(env.SMS_DAILY_CAP) > 0 ? Number(env.SMS_DAILY_CAP) : 500;
  if ((await dailyCount('sms-out')) > cap) {
    await logOut({ last4, team_id, kind, text, outcome: 'refused:daily-cap', game_id });
    return { ok: false, skipped: 'daily-cap' };
  }

  const sid = env.TWILIO_ACCOUNT_SID;
  const user = env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET ? env.TWILIO_API_KEY_SID : sid;
  const pass = env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET ? env.TWILIO_API_KEY_SECRET : env.TWILIO_AUTH_TOKEN;
  const params = new URLSearchParams({ To: e164, Body: text });
  if (env.TWILIO_MESSAGING_SERVICE_SID) params.set('MessagingServiceSid', env.TWILIO_MESSAGING_SERVICE_SID);
  else params.set('From', env.TWILIO_FROM);
  if (env.TWILIO_STATUS_URL) params.set('StatusCallback', env.TWILIO_STATUS_URL);

  let out;
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) out = { ok: false, error: `twilio-${r.status}${j && j.code ? '-' + j.code : ''}` };
    else out = { ok: true, sid: String((j && j.sid) || '') || undefined };
  } catch (e) {
    out = { ok: false, error: 'twilio-unreachable' };
  }
  await logOut({ last4, team_id, kind, text, outcome: out.ok ? 'sent' : 'failed', game_id, sid: out.sid, error: out.error });
  return out;
}

// Send many with a little parallelism, so 40 texts fit a function's time.
export async function sendMany(items, { concurrency = 6 } = {}) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const n = i++;
      try { results[n] = await sendSms(items[n]); } catch (e) { results[n] = { ok: false, error: 'exception' }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export function tally(results) {
  const t = { sent: 0, dry: 0, refused: 0, failed: 0 };
  for (const r of results) {
    if (r && r.ok && r.skipped === 'dry') t.dry++;
    else if (r && r.ok) t.sent++;
    else if (r && r.skipped && r.skipped !== 'not-configured') t.refused++;
    else t.failed++;
  }
  return t;
}
