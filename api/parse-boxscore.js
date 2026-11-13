// Vercel Serverless Function — /api/parse-boxscore.js
// Receives box score text or image + game info, sends to Claude API

import crypto from 'crypto';

// --- Request guard (2026-11 security pass) ---
// This endpoint spends money (Anthropic). On a static site a secret baked
// into the page isn't secret, so we gate on Origin + payload size + a soft
// per-instance rate limit. That stops drive-by "curl the public URL in a
// loop" bill abuse. On top of that (below): a verified Firebase ID token and
// a durable site-wide daily cap.
const _ALLOWED_ORIGINS = [
  'https://dvsl.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
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

// --- Signed-in callers only (2026-11 endpoint abuse pass) ---
// Every legitimate caller (admin.html, captain.html) is signed in with Firebase
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
const _DAILY_MAX = 150; // real use is a handful of score sheets on a game night

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

  if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'No box score content provided' });
  const { text, imageBase64, imageType, pdfBase64, gameId, awayTeam, homeTeam, awayRoster, homeRoster, date, week, field } = req.body;

  if (!text && !imageBase64 && !pdfBase64) return res.status(400).json({ error: 'No box score content provided' });

  // Bound per-call cost: phone photos / PDFs are well under ~6MB of base64.
  if ([imageBase64, pdfBase64, text].some(v => typeof v === 'string' && v.length > 8000000)) {
    return res.status(413).json({ error: 'File too large. Please use a smaller image or PDF.' });
  }
  // Everything that is not the file itself goes into the prompt, so bound it too:
  // pasted text, the two rosters, and the game info fields.
  const _nonFile = JSON.stringify({ text, gameId, awayTeam, homeTeam, awayRoster, homeRoster, date, week, field }) || '';
  if (_nonFile.length > 100000) return res.status(413).json({ error: 'Request too large.' });

  if (await _dailyCount('parse-boxscore') > _DAILY_MAX) {
    return res.status(429).json({ error: 'Daily limit for reading score sheets reached. Please enter the box score by hand or try again tomorrow.' });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  // Format rosters for inclusion in the prompt. Scorecards typically
  // write names abbreviated (last name only, "A Snyder", "Snyderman",
  // initial + last, sometimes nicknames). Without the actual roster,
  // Claude transcribes whatever string appears and the captain has to
  // hand-fix every short name. Pass both rosters so the model can
  // resolve abbreviations to the canonical full name.
  const fmtRoster = (arr, label) => {
    if (!Array.isArray(arr) || !arr.length) return `${label} roster: (not provided — use the name as written on the scorecard)`;
    const lines = arr.map(p => {
      const num = p.num ? `#${p.num} ` : '';
      return `  - ${num}${p.name || ''}`;
    }).join('\n');
    return `${label} roster (use these EXACT names whenever the scorecard entry resolves to one of them):\n${lines}`;
  };

  const prompt = `You are parsing a softball box score. Extract ALL data and return ONLY valid JSON, no other text.

Game info:
- Away Team: ${awayTeam}
- Home Team: ${homeTeam}
- Date: ${date}
- Week: ${week}
- Field: ${field}

${fmtRoster(awayRoster, awayTeam || 'Away')}

${fmtRoster(homeRoster, homeTeam || 'Home')}

NAME RESOLUTION RULES (very important):
- Scorecards typically use abbreviated names: last name only ("Snyderman"), first initial + last ("A Snyder", "A. Snyder"), nicknames, or sometimes a number with no name. ALWAYS try to map an abbreviated entry to a full-name entry on the matching team's roster above.
- If a scorecard entry like "A Snyder" or "Snyderman" matches a full-name roster entry like "Andrew Snyderman", output the FULL ROSTER NAME ("Andrew Snyderman") in the "name" field.
- Match by jersey number first when present — # is the strongest signal. Then by last name (case-insensitive). Then by first initial + last name. Only when no roster match is plausible should you keep the raw scorecard string.
- If the scorecard's first/last initials or jersey # don't match anyone on the roster (a sub, walk-on, or scorecard error), keep the raw text as written.
- Disambiguate same-last-name teammates by jersey # or first initial.

Return this exact JSON structure:
{
  "awayScore": <number>,
  "homeScore": <number>,
  "awayBatters": [{"name":"","num":"","pos":"","ab":0,"r":0,"h":0,"rbi":0,"bb":0,"so":0,"hr":0,"doubles":0,"triples":0}],
  "homeBatters": [<same>],
  "awayPitchers": [{"name":"","num":"","ip":"","h":0,"r":0,"er":0,"bb":0,"so":0,"decision":""}],
  "homePitchers": [<same>],
  "linescore": {
    "away": [<inning 1 runs>, ..., <inning 7 runs>],
    "home": [<inning 1 runs>, ..., <inning 7 runs>],
    "awayErrors": 0, "homeErrors": 0
  }
}
Rules: Missing stats = 0. Return ONLY the JSON, no commentary.`;

  // Build message content. Three branches:
  //   1. PDF — send as a `document` block. Anthropic reads PDFs natively
  //      and PRESERVES the visual table structure (column alignment, row
  //      ordering). This is the right path for Excel-exported PDFs where
  //      text extraction via pdfjs destroys the columns and Claude can
  //      no longer parse per-batter rows.
  //   2. Image (jpg/png) — `image` block with vision.
  //   3. Plain text — fallback for older callers that pre-extracted text.
  let messageContent;
  if (pdfBase64) {
    messageContent = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
      { type: 'text', text: prompt }
    ];
  } else if (imageBase64) {
    messageContent = [
      { type: 'image', source: { type: 'base64', media_type: imageType || 'image/jpeg', data: imageBase64 } },
      { type: 'text', text: prompt }
    ];
  } else {
    messageContent = `${prompt}\n\nBox score text:\n${text}`;
  }

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: messageContent }]
      })
    });

    const claudeData = await claudeRes.json();
    if (!claudeRes.ok) throw new Error(`Claude API error: ${claudeData.error?.message}`);

    const rawText = claudeData.content[0].text.trim();
    const jsonText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonText);

    return res.status(200).json({ success: true, parsed, gameId, awayTeam, homeTeam, date, week, field });

  } catch (err) {
    console.error('parse-boxscore error:', err);
    return res.status(500).json({ error: err.message });
  }
}
