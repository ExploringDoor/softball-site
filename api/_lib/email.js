// Team email for DVSL (Builder E): schedule change emails to captains and
// rostered players. Admin alert mail stays in api/_lib/notify.js.
//
//   sendEmail({ to, subject, html, text, headers, dry, idempotencyKey })
//     -> { ok, id?, skipped?, error? }        one recipient per message
//   sendEmails([...same], { dry })  -> results[]   Resend batch (100 per call)
//
// DORMANT BY DEFAULT. Nothing goes to a team unless ALL of these are set:
//   provider key   RESEND_API_KEY (default) or SENDGRID_API_KEY
//                  (EMAIL_PROVIDER=resend|sendgrid picks when both are set)
//   EMAIL_FROM     "DVSL Softball <alerts@your-domain>" on a domain verified
//                  with the provider. Unset, the resend.dev sandbox sender, or
//                  a free mailbox (gmail.com, yahoo.com ...) = dormant.
//   EMAIL_UNSUB_SECRET  signs the unsubscribe links (api/_lib/email-unsub.js)
// Optional: EMAIL_REPLY_TO (the commissioner), EMAIL_DAILY_CAP (default 600),
//           EMAIL_DRY_RUN=1 (every call is a preview).
//
// Addresses are PII: nothing here logs or returns a full address. Logs keep
// sha256(lowercased address) + the domain only (see maskEmail).
import crypto from 'crypto';

export const SANDBOX_DOMAINS = new Set(['resend.dev']);
// A provider can only send "from" a domain you control and verified.
export const FREE_MAILBOX_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'aol.com', 'hotmail.com', 'outlook.com', 'live.com',
  'msn.com', 'icloud.com', 'me.com', 'mac.com', 'comcast.net', 'verizon.net', 'att.net', 'protonmail.com', 'proton.me',
]);
const EMAIL_RE = /^[^\s@<>"',;:()\[\]\\]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export function normEmail(s) {
  const e = String(s == null ? '' : s).trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : '';
}
export function emailHash(e) {
  return crypto.createHash('sha256').update(normEmail(e) || String(e || '').trim().toLowerCase()).digest('hex');
}
export function maskEmail(e) {
  const n = normEmail(e);
  return { hash: emailHash(n || e), domain: n ? n.split('@')[1] : '' };
}

// "DVSL Softball <alerts@example.org>" or "alerts@example.org".
export function parseFrom(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || /[\r\n]/.test(s)) return null;
  const m = /^(?:"?([^"<]*?)"?\s*)?<([^<>\s]+)>$/.exec(s);
  const address = normEmail(m ? m[2] : s);
  if (!address) return null;
  return { name: m ? String(m[1] || '').trim() : '', address, domain: address.split('@')[1] };
}

export function providerOf(env = process.env) {
  const want = String(env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (want === 'sendgrid') return env.SENDGRID_API_KEY ? 'sendgrid' : null;
  if (want === 'resend') return env.RESEND_API_KEY ? 'resend' : null;
  if (env.RESEND_API_KEY) return 'resend';
  if (env.SENDGRID_API_KEY) return 'sendgrid';
  return null;
}

export function dailyCap(env = process.env) {
  return Number(env.EMAIL_DAILY_CAP) > 0 ? Math.floor(Number(env.EMAIL_DAILY_CAP)) : 600;
}
export function emailDryEnv(env = process.env) {
  return /^(1|true|yes)$/i.test(String(env.EMAIL_DRY_RUN || ''));
}

// Everything the admin tab shows and every sender checks. No secrets, no
// full addresses (the From address is the league's own, shown as its domain).
export function emailReadiness(env = process.env) {
  const provider = providerOf(env);
  const from = parseFrom(env.EMAIL_FROM);
  const sandbox = !!(from && SANDBOX_DOMAINS.has(from.domain));
  const freeMailbox = !!(from && FREE_MAILBOX_DOMAINS.has(from.domain));
  const replyTo = !!normEmail(env.EMAIL_REPLY_TO);
  const unsubSecret = String(env.EMAIL_UNSUB_SECRET || '').length >= 16;
  let reason = '';
  if (!provider) reason = 'no-provider';
  else if (!from) reason = 'no-from';
  else if (sandbox) reason = 'sandbox-from';
  else if (freeMailbox) reason = 'free-mailbox-from';
  else if (!unsubSecret) reason = 'no-unsub-secret';
  return {
    ready: !reason, reason, provider,
    from: !!from, fromName: from ? from.name : '', fromDomain: from ? from.domain : '',
    sandbox, freeMailbox, replyTo, unsubSecret, dryRun: emailDryEnv(env), cap: dailyCap(env),
  };
}

// Best effort: is the From domain verified at Resend? true / false / null
// (unknown: SendGrid, a sending-only key, or Resend unreachable).
export async function fromDomainVerified(env = process.env) {
  const r = emailReadiness(env);
  if (r.provider !== 'resend' || !r.fromDomain) return null;
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const j = await res.json().catch(() => ({}));
    const list = Array.isArray(j && j.data) ? j.data : [];
    const d = list.find(x => String(x && x.name || '').toLowerCase() === r.fromDomain);
    return d ? String(d.status || '') === 'verified' : false;
  } catch (e) { return null; }
}

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
function cleanSubject(s) {
  const t = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(CTRL, '').replace(/\s+/g, ' ').trim();
  return t.length > 150 ? t.slice(0, 149) + '…' : t;
}
function cleanHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h && typeof h === 'object' ? h : {})) {
    if (!/^[A-Za-z][A-Za-z0-9-]{0,60}$/.test(k)) continue;
    const val = String(v == null ? '' : v);
    if (/[\r\n]/.test(val) || val.length > 2000) continue;
    out[k] = val;
  }
  return out;
}

// Check and shape one message. Returns { msg } or { skipped }.
function prepare(m, env) {
  const to = normEmail(m && m.to);
  if (!to) return { skipped: 'bad-address' };
  const subject = cleanSubject(m.subject);
  if (!subject || (!m.html && !m.text)) return { skipped: 'empty' };
  const r = emailReadiness(env);
  if (!r.ready) return { skipped: 'dormant:' + r.reason };
  const from = parseFrom(env.EMAIL_FROM);
  const replyTo = normEmail(env.EMAIL_REPLY_TO);
  return {
    msg: {
      to, subject, html: String(m.html || ''), text: String(m.text || ''), headers: cleanHeaders(m.headers),
      from: from.name ? `${from.name.replace(/["<>\r\n]/g, '')} <${from.address}>` : from.address,
      fromObj: from, replyTo, idempotencyKey: m.idempotencyKey ? String(m.idempotencyKey).slice(0, 200) : '',
    },
    provider: r.provider,
  };
}

function resendBody(msg) {
  const b = { from: msg.from, to: [msg.to], subject: msg.subject, html: msg.html || undefined, text: msg.text || undefined };
  if (msg.replyTo) b.reply_to = msg.replyTo;
  if (Object.keys(msg.headers).length) b.headers = msg.headers;
  return b;
}

async function sendgridOne(msg, env) {
  const content = [];
  if (msg.text) content.push({ type: 'text/plain', value: msg.text });
  if (msg.html) content.push({ type: 'text/html', value: msg.html });
  const b = {
    personalizations: [{ to: [{ email: msg.to }] }],
    from: msg.fromObj.name ? { email: msg.fromObj.address, name: msg.fromObj.name } : { email: msg.fromObj.address },
    subject: msg.subject, content,
    tracking_settings: { click_tracking: { enable: false }, open_tracking: { enable: false } },
  };
  if (msg.replyTo) b.reply_to = { email: msg.replyTo };
  if (Object.keys(msg.headers).length) b.headers = msg.headers;
  try {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(b), signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, error: 'sendgrid-' + r.status };
    return { ok: true, id: String(r.headers.get('x-message-id') || '') || undefined };
  } catch (e) { return { ok: false, error: 'sendgrid-unreachable' }; }
}

export async function sendEmail(m = {}) {
  const env = process.env;
  const p = prepare(m, env);
  if (p.skipped) return { ok: false, skipped: p.skipped };
  if (m.dry || emailDryEnv(env)) return { ok: true, skipped: 'dry' };
  const msg = p.msg;
  if (p.provider === 'sendgrid') return sendgridOne(msg, env);
  try {
    const headers = { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
    if (msg.idempotencyKey) headers['Idempotency-Key'] = msg.idempotencyKey;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers, body: JSON.stringify(resendBody(msg)), signal: AbortSignal.timeout(8000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: 'resend-' + r.status };
    return { ok: true, id: String((j && j.id) || '') || undefined };
  } catch (e) { return { ok: false, error: 'resend-unreachable' }; }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Many messages, still one recipient each. Resend: the batch endpoint, 100
// per call, a short pause between calls (its default limit is 2 calls a
// second). SendGrid: one call per message, 5 at a time.
export async function sendEmails(list, { dry = false, pauseMs = 600, batchKey = '' } = {}) {
  const env = process.env;
  const results = new Array(list.length);
  const ready = [];
  list.forEach((m, i) => {
    const p = prepare(m, env);
    if (p.skipped) results[i] = { ok: false, skipped: p.skipped };
    else if (dry || m.dry || emailDryEnv(env)) results[i] = { ok: true, skipped: 'dry' };
    else ready.push({ i, msg: p.msg, provider: p.provider });
  });
  if (!ready.length) return results;

  if (ready[0].provider === 'sendgrid') {
    let n = 0;
    const worker = async () => { while (n < ready.length) { const x = ready[n++]; results[x.i] = await sendgridOne(x.msg, env); } };
    await Promise.all(Array.from({ length: Math.min(5, ready.length) }, worker));
    return results;
  }
  for (let c = 0; c < ready.length; c += 100) {
    const chunk = ready.slice(c, c + 100);
    if (c > 0 && pauseMs) await sleep(pauseMs);
    const headers = { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
    if (batchKey) headers['Idempotency-Key'] = `${batchKey}-${c / 100}`.slice(0, 200);
    try {
      const r = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST', headers, body: JSON.stringify(chunk.map(x => resendBody(x.msg))), signal: AbortSignal.timeout(15000),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { chunk.forEach(x => { results[x.i] = { ok: false, error: 'resend-' + r.status }; }); continue; }
      const ids = Array.isArray(j && j.data) ? j.data : [];
      chunk.forEach((x, k) => { results[x.i] = { ok: true, id: ids[k] && ids[k].id ? String(ids[k].id) : undefined }; });
    } catch (e) {
      chunk.forEach(x => { results[x.i] = { ok: false, error: 'resend-unreachable' }; });
    }
  }
  return results;
}
