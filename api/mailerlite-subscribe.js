// Vercel Serverless Function — /api/mailerlite-subscribe
// Proxy so the MailerLite API bearer token stays on the server and out of
// the public HTML. Called by registration.html after a successful signup.
//
// Before this route existed, the token was hardcoded in registration.html
// where any site visitor could `curl` the page and scrape it, letting them
// spam the list or get the MailerLite account flagged.
//
// Env vars (set in Vercel project settings):
//   MAILERLITE_TOKEN        — the API bearer token (starts with eyJ...)
//   MAILERLITE_GROUP_ID     — (optional) the group to add new subscribers to.
//                              If omitted, the subscriber is added to no group.
//
// Request body (JSON):
//   email:  string (required)
//   name?:  string    — first name
//   last?:  string    — last name
//   phone?: string
//   team?:  string    — team affiliation (custom field "team" in MailerLite)
//   (groups from the caller are ignored; the group is server-side only)
//
// Responses:
//   200 { ok: true }          on success
//   400 { error }             on bad input
//   429 { error }             when rate limited
//   502 { error, detail }     on upstream MailerLite failure
//   503 { error }             if env vars are missing

import crypto from 'crypto';

// --- Rate limits (2026-11 endpoint abuse pass) ---
// Public endpoint (the signup form calls it), so no sign-in check. Soft per-IP
// limit per warm instance, plus the durable daily cap below.
const _rlHits = new Map(); // ip -> [timestamps]; lives in a warm instance, resets on cold start
function _rateLimited(req, max, windowMs) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const arr = (_rlHits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  _rlHits.set(ip, arr);
  if (_rlHits.size > 5000) _rlHits.clear();
  return arr.length > max;
}

// --- Durable site-wide daily cap (2026-11 endpoint abuse pass) ---
// The per-IP limit above lives in one warm instance and resets on every cold
// start, so it cannot bound a day's spend. This keeps one counter doc per day
// in Firestore (api_usage/<name>_<YYYY-MM-DD>, field n), bumped with an atomic
// increment through the same service account send-notification.js uses.
// CAVEAT: the DVSL Firestore rules are wide open today, so anyone can reset or
// delete this doc. It becomes tamper-proof when the rules lockdown lands (the
// service account bypasses rules; just never open api_usage to clients).
// If the store is unreachable or not configured we fall back to an in-memory
// count instead of failing a real user's request.
let _svcTok = null, _svcTokExp = 0;
async function _svcAccessToken() {
  if (_svcTok && Date.now() < _svcTokExp) return _svcTok;
  const svc = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: svc.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const jwt = `${unsigned}.${signer.sign(svc.private_key).toString('base64url')}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(4000),
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(data.error_description || 'no access token');
  _svcTok = data.access_token;
  _svcTokExp = Date.now() + 50 * 60 * 1000;
  return _svcTok;
}
const _dayHits = new Map();
// Counts this call against today's total and returns the new total.
async function _dailyCount(name) {
  const id = name + '_' + new Date().toISOString().slice(0, 10);
  try {
    const base = `projects/${process.env.FCM_PROJECT_ID || 'dvsl-292dd'}/databases/(default)/documents`;
    const r = await fetch(`https://firestore.googleapis.com/v1/${base}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await _svcAccessToken()}` },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({ writes: [{
        update: { name: `${base}/api_usage/${id}` },
        updateMask: { fieldPaths: [] },
        updateTransforms: [{ fieldPath: 'n', increment: { integerValue: '1' } }]
      }] })
    });
    if (r.ok) {
      const d = await r.json();
      const n = Number(d.writeResults[0].transformResults[0].integerValue);
      if (n > 0) return n;
    }
  } catch (e) { /* fall through to memory */ }
  if (_dayHits.size > 50) _dayHits.clear();
  const n = (_dayHits.get(id) || 0) + 1;
  _dayHits.set(id, n);
  return n;
}
const _DAILY_MAX = 300; // the whole league is about 300 players

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.MAILERLITE_TOKEN;
  const DEFAULT_GROUP = process.env.MAILERLITE_GROUP_ID;
  if (!TOKEN) {
    return res.status(503).json({ error: 'MailerLite not configured', detail: 'Set MAILERLITE_TOKEN env var.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(_) { body = {}; } }
  body = body || {};
  const email = String(body.email || '').trim();
  if (!email || !email.includes('@') || email.length > 254) return res.status(400).json({ error: 'Valid email required' });

  if (_rateLimited(req, 10, 600000)) return res.status(429).json({ error: 'Too many requests, please wait a few minutes.' });
  if (await _dailyCount('mailerlite-subscribe') > _DAILY_MAX) return res.status(429).json({ error: 'Daily signup limit reached.' });

  // The group is decided here, never by the caller (a caller-supplied list
  // let anyone push addresses into any group on the account).
  const groups = DEFAULT_GROUP ? [DEFAULT_GROUP] : undefined;

  try {
    const upstream = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        email,
        fields: {
          name: String(body.name || '').slice(0, 100),
          last_name: String(body.last || '').slice(0, 100),
          phone: String(body.phone || '').slice(0, 40),
          ...(body.team ? { team: String(body.team).slice(0, 100) } : {})
        },
        ...(groups ? { groups } : {})
      })
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'Upstream error', status: upstream.status, detail: detail.slice(0, 500) });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'Network error', detail: String(e?.message || e) });
  }
}
