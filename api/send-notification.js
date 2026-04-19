// Vercel Serverless Function — /api/send-notification.js
// Sends a push notification (via Firebase Cloud Messaging HTTP v1) to every
// subscriber whose saved preferences match the requested category + team.
//
// Called by admin.html "Send Notification" UI or by an eventual Firestore
// trigger (e.g. when a game is finalized).
//
// Env vars (set in Vercel project settings):
//   FCM_PROJECT_ID            — Firebase project ID (e.g. "dvsl-292dd")
//   FCM_SERVICE_ACCOUNT_JSON  — the FULL service-account JSON as a single-line string.
//                                Get it from Firebase Console →
//                                Project Settings → Service accounts →
//                                "Generate new private key". Copy the entire
//                                JSON content as the value.
//   ADMIN_SEND_SECRET         — a shared secret the client passes in a header
//                                so random internet visitors can't spam pushes.
//                                Put the same string in admin.html when calling
//                                this endpoint.
//
// Request body (JSON):
//   title: string                — notification headline
//   body: string                 — notification body text
//   category: "scores"|"rainouts"|"schedule"|"playoffs"
//   team?: string                — team id; omit to target all teams
//   url?: string                 — deep-link url on notification click
//
// If env vars are missing, returns 503 with a clear message so the admin UI
// can surface the setup requirement to Adam.

import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PROJECT_ID = process.env.FCM_PROJECT_ID;
  const SVC_JSON   = process.env.FCM_SERVICE_ACCOUNT_JSON;
  const SECRET     = process.env.ADMIN_SEND_SECRET;

  if (!PROJECT_ID || !SVC_JSON) {
    return res.status(503).json({
      error: 'Push notifications not configured',
      detail: 'Set FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_JSON env vars in Vercel.',
    });
  }
  if (SECRET && req.headers['x-admin-secret'] !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { title, body, category, team, url } = req.body || {};
  if (!title || !body || !category) {
    return res.status(400).json({ error: 'title, body, and category are required' });
  }

  let svc;
  try { svc = JSON.parse(SVC_JSON); }
  catch(e) { return res.status(500).json({ error: 'Invalid FCM_SERVICE_ACCOUNT_JSON env var' }); }

  // 1. Mint an access token using the service account's private key.
  let accessToken;
  try { accessToken = await getAccessToken(svc); }
  catch(e) { return res.status(500).json({ error: 'Failed to mint access token', detail: e.message }); }

  // 2. Pull matching tokens out of the notification_tokens collection via
  //    the Firestore REST API (reuses same service-account auth).
  let tokens = [];
  try { tokens = await listMatchingTokens({ projectId: PROJECT_ID, accessToken, category, team }); }
  catch(e) { return res.status(500).json({ error: 'Failed to read tokens', detail: e.message }); }

  if (!tokens.length) return res.status(200).json({ sent: 0, note: 'No matching subscribers' });

  // 3. Fan out FCM sends. We use the send endpoint (one call per token) —
  //    simple and reliable, fine up to a few hundred tokens.
  const results = await Promise.all(tokens.map(async tok => {
    try {
      const r = await fcmSend({ projectId: PROJECT_ID, accessToken, token: tok, title, body, url });
      return { tokenPrefix: tok.slice(0, 24) + '...', ok: true, messageName: r?.name || null };
    } catch(e) {
      return { tokenPrefix: tok.slice(0, 24) + '...', ok: false, error: e.message };
    }
  }));
  const sent = results.filter(r => r.ok).length;
  const failed = results.length - sent;
  return res.status(200).json({ sent, failed, total: results.length, results });
}

// ── helpers ────────────────────────────────────────────────────────────

async function getAccessToken(svc) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: svc.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(svc.private_key).toString('base64url');
  const jwt = `${unsigned}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(data.error_description || JSON.stringify(data));
  return data.access_token;
}

async function listMatchingTokens({ projectId, accessToken, category, team }) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/notification_tokens?pageSize=300`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }});
  const data = await resp.json();
  if (!data.documents) return [];
  const out = [];
  for (const d of data.documents) {
    const f = d.fields || {};
    const tok = f.token?.stringValue;
    if (!tok) continue;
    const cats = (f.categories?.arrayValue?.values || []).map(v => v.stringValue);
    if (cats.length && !cats.includes(category)) continue;
    const teams = (f.teams?.arrayValue?.values || []).map(v => v.stringValue);
    // Empty teams = "all teams"; otherwise must include the requested team
    if (team && teams.length && !teams.includes(team)) continue;
    out.push(tok);
  }
  return out;
}

async function fcmSend({ projectId, accessToken, token, title, body, url }) {
  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  // iOS PWA web push requires an explicit webpush.notification block and
  // a high Urgency header — without these, iOS silently drops the push.
  const message = {
    token,
    notification: { title, body },
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '86400',
      },
      fcm_options: { link: url || '/' },
    },
  };
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`FCM ${resp.status}: ${text.slice(0,200)}`);
  }
  return await resp.json();
}
