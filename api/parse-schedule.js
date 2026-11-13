// Vercel Serverless Function — /api/parse-schedule.js
// Receives CSV text (any format), sends to Claude API, returns structured games array

import crypto from 'crypto';

// --- Request guard (2026-11 security pass) ---
// Paid endpoint (Anthropic). See parse-boxscore.js for the rationale: Origin
// allow-list + size cap + soft per-instance rate limit to stop drive-by
// bill abuse. On top of that (below): a verified Firebase ID token and a
// durable site-wide daily cap.
const _ALLOWED_ORIGINS = [
  'https://dvsl.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
const _rlHits = new Map();
function _rateLimited(req, max, windowMs) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const arr = (_rlHits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  _rlHits.set(ip, arr);
  if (_rlHits.size > 5000) _rlHits.clear();
  return arr.length > max;
}

// --- Signed-in callers only (2026-11 endpoint abuse pass) ---
// Every legitimate caller (admin.html) is signed in with Firebase
// Auth, so require their ID token and verify it with Identity Toolkit. This only
// proves "a real DVSL Firebase account", NOT "an admin" or "a captain": sign-up
// is open and the admin flag is still client-writable.
// TODO(firestore-rules-lockdown): add a real role check here once the Firestore
// rules are locked down and the admin flag can no longer be written by clients.
const _FB_WEB_KEY = 'AIzaSyDXuC-R0aPEX4F7lN5AKq48UC3r5whYzdg'; // public web key, same as config.js
// Returns the user record, null if the token is missing or bad; throws if Google is unreachable.
async function _verifyIdToken(req) {
  const idToken = (/^Bearer (.+)$/.exec(req.headers.authorization || '') || [])[1];
  if (!idToken) return null;
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + _FB_WEB_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ idToken })
  });
  if (r.status >= 500) throw new Error('lookup ' + r.status);
  if (!r.ok) return null;
  const u = ((await r.json()).users || [])[0];
  return u && u.localId && u.email && !u.disabled ? u : null;
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
const _DAILY_MAX = 40; // a schedule import happens a few times a season

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowOrigin = _ALLOWED_ORIGINS.includes(origin) ? origin : '';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin || 'https://dvsl.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!allowOrigin) return res.status(403).json({ error: 'Forbidden' });
  if (_rateLimited(req, 15, 60000)) return res.status(429).json({ error: 'Too many requests, please wait a minute.' });

  let _user;
  try { _user = await _verifyIdToken(req); }
  catch (e) { return res.status(503).json({ error: 'Could not check your sign in. Please try again.' }); }
  if (!_user) return res.status(401).json({ error: 'Please sign in again.' });

  const { csvText, teams } = (req.body && typeof req.body === 'object') ? req.body : {};
  if (!csvText || typeof csvText !== 'string') return res.status(400).json({ error: 'No CSV content provided' });
  // A full season is a few hundred rows (well under 50KB). Bound the whole
  // body, since the team list goes into the prompt as well.
  if (csvText.length > 200000 || (JSON.stringify(teams) || '').length > 20000) {
    return res.status(413).json({ error: 'Schedule file too large.' });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

  if (await _dailyCount('parse-schedule') > _DAILY_MAX) {
    return res.status(429).json({ error: 'Daily limit for schedule imports reached. Please try again tomorrow.' });
  }

  const teamsRef = Array.isArray(teams) && teams.length
    ? `Known team IDs and names:\n${teams.map(t => `  ${t.id}: ${t.name}`).join('\n')}`
    : '';

  const prompt = `You are parsing a softball league schedule from a CSV file. The CSV may use any column format or header names. Extract all games and return ONLY valid JSON, no other text.

${teamsRef}

Return this exact JSON structure:
{
  "games": [
    {
      "wk": <week number as integer>,
      "date_iso": "<YYYY-MM-DD>",
      "time_24": "<HH:MM in 24hr format, e.g. 19:00>",
      "away": "<away team ID or name>",
      "home": "<home team ID or name>",
      "field": "<field name>",
      "addr": "<address if available, else empty string>"
    }
  ]
}

Rules:
- If a column maps to a known team ID from the list above, use the ID (lowercase). Otherwise use the name as-is.
- Dates: always output ISO format YYYY-MM-DD. If year is missing, assume 2026.
- Times: convert to 24hr HH:MM. If missing, use empty string "".
- Week numbers: if no explicit week column, try to infer from date order (week 1 = earliest games), or use 0.
- Skip rows that are clearly headers, totals, or blank.
- Return ONLY the JSON object, no markdown, no explanation.

CSV content:
${csvText}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.status(500).json({ error: 'Claude API error: ' + err });
    }

    const data = await resp.json();
    const raw = data.content?.[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Could not parse Claude response', raw });

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
