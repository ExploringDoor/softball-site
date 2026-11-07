// Vercel Serverless Function — /api/parse-schedule.js
// Receives CSV text (any format), sends to Claude API, returns structured games array

// --- Request guard (2026-11 security pass) ---
// Paid endpoint (Anthropic). See parse-boxscore.js for the rationale: Origin
// allow-list + size cap + soft per-instance rate limit to stop drive-by
// bill abuse; forge-proof auth lands with the Firestore lockdown.
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

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowOrigin = _ALLOWED_ORIGINS.includes(origin) ? origin : '';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin || 'https://dvsl.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!allowOrigin) return res.status(403).json({ error: 'Forbidden' });
  if (_rateLimited(req, 15, 60000)) return res.status(429).json({ error: 'Too many requests, please wait a minute.' });

  const { csvText, teams } = req.body;
  if (!csvText) return res.status(400).json({ error: 'No CSV content provided' });
  if (typeof csvText === 'string' && csvText.length > 500000) {
    return res.status(413).json({ error: 'Schedule file too large.' });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

  const teamsRef = teams && teams.length
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
