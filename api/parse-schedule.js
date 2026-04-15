// Vercel Serverless Function — /api/parse-schedule.js
// Receives CSV text (any format), sends to Claude API, returns structured games array

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { csvText, teams } = req.body;
  if (!csvText) return res.status(400).json({ error: 'No CSV content provided' });

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
