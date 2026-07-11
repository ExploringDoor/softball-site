// Vercel Serverless Function — /api/delete-by-source.js
//
// Deletes every pending_nav doc whose `source_id` field matches the one
// passed in. Used for cascade-deletes: when a user deletes a chat message
// they sent by mistake, the matching notifications should disappear from
// every subscriber's bell panel — not just the sender's.
//
// Protected with ADMIN_SEND_SECRET because this deletes docs for OTHER
// people's tokens (there's no token-hash check — we're intentionally
// clearing a push league-wide). The team-chat / captains-chat pages
// already hold the admin secret to call /api/send-notification, so
// reusing it here is fine.
//
// Request body:
//   { sourceId: string }  — stable id of the originating object
//                            (e.g. the chat message's Firestore doc id)

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
  if (!PROJECT_ID || !SVC_JSON) return res.status(503).json({ error: 'Not configured' });
  // Fail CLOSED — see update-firebase.js. (Audit C3, 2026-07.)
  if (!SECRET) return res.status(503).json({ error: 'Not configured', detail: 'Set ADMIN_SEND_SECRET env var.' });
  if (req.headers['x-admin-secret'] !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { sourceId } = req.body || {};
  if (!sourceId || typeof sourceId !== 'string') {
    return res.status(400).json({ error: 'sourceId required' });
  }

  let svc;
  try { svc = JSON.parse(SVC_JSON); }
  catch { return res.status(500).json({ error: 'Bad service account' }); }

  let accessToken;
  try { accessToken = await getAccessToken(svc); }
  catch { return res.status(500).json({ error: 'Auth failed' }); }

  // Query every pending_nav doc with this source_id. Not filtering by
  // token_hash — the whole point is clearing the push for everyone.
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const query = {
    structuredQuery: {
      from: [{ collectionId: 'pending_nav' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'source_id' },
          op: 'EQUAL',
          value: { stringValue: String(sourceId) },
        },
      },
      limit: 500,
    },
  };
  let paths = [];
  try {
    const resp = await fetch(queryUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });
    const rows = await resp.json();
    paths = (rows || [])
      .filter(r => r.document && r.document.name)
      .map(r => r.document.name);
  } catch {
    return res.status(500).json({ error: 'query failed' });
  }

  // Fire deletes in parallel; best-effort.
  await Promise.all(paths.map(p =>
    fetch(`https://firestore.googleapis.com/v1/${p}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {})
  ));
  return res.status(200).json({ ok: true, deleted: paths.length });
}

// ── helpers ─────────────────────────────────────────────────────────────

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
