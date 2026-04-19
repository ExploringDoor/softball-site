// Vercel Serverless Function — /api/dismiss-pending-nav.js
//
// Deletes one (or all) pending_nav docs for this token.
//
// Called by the page when the user taps a chip (to navigate, consuming
// that item) or X's it (to dismiss without navigating). We verify the
// doc's token_hash matches hash(token) before deleting so a leaked ID
// can't be used by someone who doesn't own the token.
//
// Request body:
//   { token: string, id?: string, dismissAll?: boolean }
//     - id: delete just that one doc
//     - dismissAll: delete all pending_nav docs for this token

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
    return res.status(503).json({ error: 'Not configured' });
  }

  const { token, id, dismissAll } = req.body || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token required' });
  }
  if (!id && !dismissAll) {
    return res.status(400).json({ error: 'id or dismissAll required' });
  }

  let svc;
  try { svc = JSON.parse(SVC_JSON); }
  catch { return res.status(500).json({ error: 'Bad service account' }); }

  let accessToken;
  try { accessToken = await getAccessToken(svc); }
  catch { return res.status(500).json({ error: 'Auth failed' }); }

  const tokenHash = sha256hex(token);

  if (dismissAll) {
    // Query all pending_nav docs for this token, then delete them in a batch.
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
    const query = {
      structuredQuery: {
        from: [{ collectionId: 'pending_nav' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'token_hash' },
            op: 'EQUAL',
            value: { stringValue: tokenHash },
          },
        },
        limit: 100,
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
    await Promise.all(paths.map(p =>
      fetch(`https://firestore.googleapis.com/v1/${p}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {})
    ));
    return res.status(200).json({ ok: true, deleted: paths.length });
  }

  // Single-doc dismiss: read first to verify ownership.
  const docUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/pending_nav/${encodeURIComponent(id)}`;
  try {
    const readResp = await fetch(docUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (readResp.status === 404) {
      // Already gone — treat as success (idempotent).
      return res.status(200).json({ ok: true, note: 'already deleted' });
    }
    if (!readResp.ok) {
      return res.status(500).json({ error: 'read failed' });
    }
    const doc = await readResp.json();
    const docTokenHash = doc.fields?.token_hash?.stringValue;
    if (docTokenHash !== tokenHash) {
      return res.status(403).json({ error: 'token mismatch' });
    }
  } catch {
    return res.status(500).json({ error: 'read threw' });
  }

  // Ownership verified — delete.
  try {
    await fetch(docUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return res.status(500).json({ error: 'delete failed' });
  }
  return res.status(200).json({ ok: true });
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
