// Vercel Serverless Function — /api/update-player.js
// Updates a player's fields in Firebase (e.g., fix team assignment)
// Usage: POST /api/update-player { playerId: "abc123", fields: { team: "tbir" } }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId, fields } = req.body;
  if (!playerId || !fields || typeof fields !== 'object') {
    return res.status(400).json({ error: 'Missing playerId or fields' });
  }

  const FB_KEY = process.env.FIREBASE_API_KEY;
  const FB_PROJECT = 'dvsl-292dd';
  const FB_BASE = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;

  // Only allow updating safe fields
  const ALLOWED_FIELDS = ['team', 'name', 'num', 'pos', 'active'];
  const safeFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.includes(k)) safeFields[k] = v;
  }
  if (Object.keys(safeFields).length === 0) {
    return res.status(400).json({ error: `No allowed fields. Allowed: ${ALLOWED_FIELDS.join(', ')}` });
  }

  try {
    // Build Firestore field values
    const fsFields = {};
    for (const [k, v] of Object.entries(safeFields)) {
      if (typeof v === 'string') fsFields[k] = { stringValue: v };
      else if (typeof v === 'number') fsFields[k] = { doubleValue: v };
      else if (typeof v === 'boolean') fsFields[k] = { booleanValue: v };
      else fsFields[k] = { stringValue: String(v) };
    }

    const fieldPaths = Object.keys(safeFields).map(k => `updateMask.fieldPaths=${k}`).join('&');
    const url = `${FB_BASE}/players/${playerId}?${fieldPaths}&key=${FB_KEY}`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: fsFields })
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: data.error?.message || 'Firebase error' });
    }

    return res.status(200).json({ success: true, updated: safeFields, playerId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
