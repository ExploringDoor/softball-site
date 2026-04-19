// Vercel Serverless Function — /api/check-pending-nav.js
//
// The page calls this on load / visibility-resume with its FCM token. We
// return the LIST of unread pending_nav docs for this token (newest first,
// stale items filtered out) so the page can render a banner chip with
// "N new notifications" and let the user tap one to navigate.
//
// Each push writes a new pending_nav doc via /api/send-notification. Docs
// are removed by /api/dismiss-pending-nav (when the user taps the chip or
// X's it) or auto-expired by the STALE_MS window below.
//
// NOTE: we do NOT delete docs on read. Reading is non-destructive so the
// chip can persist across page navigations. Deletion happens only when
// the user explicitly consumes an item.

import crypto from 'crypto';

const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours — anything older is garbage-collected

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PROJECT_ID = process.env.FCM_PROJECT_ID;
  const SVC_JSON   = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!PROJECT_ID || !SVC_JSON) {
    return res.status(503).json({ error: 'Not configured', items: [] });
  }

  const { token } = req.body || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token required', items: [] });
  }

  let svc;
  try { svc = JSON.parse(SVC_JSON); }
  catch { return res.status(500).json({ error: 'Bad service account', items: [] }); }

  let accessToken;
  try { accessToken = await getAccessToken(svc); }
  catch { return res.status(500).json({ error: 'Auth failed', items: [] }); }

  const tokenHash = sha256hex(token);
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;

  // Structured query: token_hash == hash, ordered by ts desc, limit 20.
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
      orderBy: [{ field: { fieldPath: 'ts' }, direction: 'DESCENDING' }],
      limit: 20,
    },
  };

  let rows = [];
  try {
    const resp = await fetch(queryUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });
    if (!resp.ok) {
      return res.status(200).json({ items: [], error: 'query failed' });
    }
    rows = await resp.json();
  } catch {
    return res.status(200).json({ items: [], error: 'query threw' });
  }

  const now = Date.now();
  const items = [];
  const staleDocPaths = [];

  for (const row of rows) {
    if (!row.document) continue;
    const doc = row.document;
    const f = doc.fields || {};
    const ts = f.ts?.integerValue ? parseInt(f.ts.integerValue, 10) : 0;
    const ageMs = ts ? (now - ts) : -1;
    const docPath = doc.name || '';
    const id = docPath.split('/').pop() || '';

    if (!id) continue;
    if (ageMs > STALE_MS || ageMs < 0) {
      // Too old — queue for sweep, skip in response.
      if (docPath) staleDocPaths.push(docPath);
      continue;
    }
    items.push({
      id,
      url: f.url?.stringValue || '/',
      ts,
      ageMs,
      title: f.title?.stringValue || '',
      body: f.body?.stringValue || '',
      category: f.category?.stringValue || '',
    });
  }

  // Fire-and-forget garbage collection of stale docs.
  if (staleDocPaths.length) {
    sweepStale({ accessToken, docPaths: staleDocPaths }).catch(() => {});
  }

  return res.status(200).json({ items });
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

async function sweepStale({ accessToken, docPaths }) {
  // Each docPath is the full "projects/.../documents/pending_nav/{id}".
  for (const p of docPaths) {
    try {
      await fetch(`https://firestore.googleapis.com/v1/${p}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {}
  }
}
