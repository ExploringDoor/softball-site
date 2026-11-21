// POST /api/sms-status: Twilio's delivery receipt for the texts DVSL sends
// (team texts and schedule alerts set it as their StatusCallback, and webhook
// replies carry it on their <Message>). Without it, handing a message to
// Twilio is the last we hear: a carrier that quietly refuses one (a changed
// number, or A2P registration not fully live: 30034, 30007 filtered as spam)
// would only show up inside Twilio's console.
//
// What it writes, server only (sms_log is admin read):
//   * a failure (failed / undelivered / any error code) -> a new sms_log row
//     {dir:'out', kind:'delivery_failure', sid, status, error_code, text: what
//     it means in plain words (core delivery.ts), phone_last4}
//   * a final state (delivered / failed / undelivered) -> the delivery_* fields
//     on the sms_log row of the send itself, found by its sid, when there is one
//
// Auth is the Twilio request signature for TWILIO_STATUS_URL (the exact URL
// given to Twilio). Dormant like the rest: 503 without TWILIO_AUTH_TOKEN /
// TWILIO_STATUS_URL, or when every switch in sms_state/config is off.
import { twilioSignatureValid, describeDelivery, lastFour } from './_sms/core.js';
import { readConfig } from './_sms/config.js';
import { readRawBody } from './_sms/http.js';
import { fsCreate, fsQuery, fsUpdate } from './_lib/dvsl.js';

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const SID_RE = /^[A-Z]{2}[0-9a-f]{32}$/;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).send('POST only');
  if (!process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_STATUS_URL) return res.status(503).send('Texting is not connected on this deployment.');

  const raw = await readRawBody(req);
  const params = Object.fromEntries(new URLSearchParams(raw).entries());
  if (!twilioSignatureValid(process.env.TWILIO_AUTH_TOKEN, process.env.TWILIO_STATUS_URL, params, req.headers['x-twilio-signature'])) {
    return res.status(403).send('bad signature');
  }
  let anyOn = false;
  try { const c = await readConfig(); anyOn = Object.values(c).some(v => v && v.enabled === true); } catch (e) { anyOn = false; }
  if (!anyOn) return res.status(503).send('Texting is turned off.');

  const sid = SID_RE.test(String(params.MessageSid || '')) ? params.MessageSid : null;
  const d = describeDelivery(params.MessageStatus, params.ErrorCode);
  const failed = d.state === 'failed' || d.state === 'undelivered';

  try {
    if (failed) {
      await fsCreate('sms_log', {
        at: new Date(), dir: 'out', kind: 'delivery_failure', outcome: 'delivery_failure',
        sid, status: d.state, error_code: d.code, actionable: !!d.actionable,
        text: d.says, phone_last4: lastFour(params.To), team_id: null,
      });
    }
    if (sid && (failed || d.state === 'delivered')) {
      const rows = await fsQuery('sms_log', [['sid', '==', sid]], { limit: 3 });
      for (const r of rows) {
        if (r.kind === 'delivery_failure') continue;
        await fsUpdate(`sms_log/${r.id}`, { delivery_status: d.state, delivery_code: d.code, delivery_note: d.says, delivery_at: new Date() });
      }
    }
  } catch (e) {
    // A lost log line is not worth failing the callback (Twilio would retry).
    console.warn('[sms-status] log failed:', d.state, d.code, e && e.message);
  }
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  return res.status(200).send(EMPTY);
}

export const config = { api: { bodyParser: false } };
