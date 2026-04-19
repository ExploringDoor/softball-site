// Vercel Serverless Function — /api/check-pending-nav.js
//
// The page calls this on load / visibility-resume with its FCM token. We
// look up pending_nav/{tokenHash} in Firestore (written by
// /api/send-notification the moment a push was sent to this token) and
// return the deep-link URL if the push arrived within the last 2 minutes.
// We delete the doc after reading so a URL is only ever consumed once.
//
// This completely sidesteps the iOS-PWA service-worker push event quirks:
// we don't care whether the SW's push listener fires or whether
// notificationclick runs. As long as the HTTP POST to /api/send-notification
// succeeded (server-side), Firestore has the answer and the page can find
// it regardless of what iOS did with the notification banner.
//
// Env vars (same as send-notification.js):
//   FCM_PROJECT_ID
//   FCM_SERVICE_ACCOUNT_JSON

import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PROJECT_ID = process.env.FCM_PROJECT_ID;
  const SVC_JSON   = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!PROJECT_ID || !SVC_JSON) {
    return res.status(503).json({ error: 'Not configured', url: null });
  }

  const { token } = req.body || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token required', url: null });
  }

  let svc;
  try { svc = JSON.parse(SVC_JSON); }
  catch (e) { return res.status(500).json({ error: 'Bad service account', url: null }); }

  let accessToken;
  try { accessToken = await getAccessToken(svc); }
  catch (e) { return res.status(500).json({ error: 'Auth failed', url: null }); }

  const tokenHash = sha256hex(token);
  const docUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/pending_nav/${tokenHash}`;

  // Read the doc.
  let pendingUrl = null;
  let pendingTs  = 0;
  try {
    const resp = await fetch(docUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (resp.ok) {
      const data = await resp.json();
      const f = data.fields || {};
      pendingUrl = f.url?.stringValue || null;
      pendingTs  = f.ts?.integerValue ? parseInt(f.ts.integerValue, 10) : 0;
    }
    // 404 = no pending doc — that's the normal no-push case, not an error.
  } catch (e) {
    return res.status(200).json({ url: null, error: 'read failed' });
  }

  // Freshness gate: 2-minute window. If older, return null and delete so
  // we don't accidentally route the user somewhere stale on a later open.
  const ageMs = pendingTs ? (Date.now() - pendingTs) : -1;
  const fresh = pendingUrl && ageMs >= 0 && ageMs <= 120000;

  // Always delete after read — fire-and-forget; the client has the URL now.
  // (If delete fails, worst case: next check returns null because of the
  // freshness gate once ageMs > 120000.)
  fetch(docUrl, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {});

  return res.status(200).json({
    url: fresh ? pendingUrl : null,
    ageMs: ageMs,
  });
}

// ── helpers ─────────────────────────────────────────────────────────────

function sha256hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

async function getAccessToken(svc) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: svc.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
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
