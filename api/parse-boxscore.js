// Vercel Serverless Function — /api/parse-boxscore.js
// Receives box score text + game info, sends to Claude API, writes to Firebase

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, gameId, awayTeam, homeTeam, date, week, field } = req.body;

  if (!text) return res.status(400).json({ error: 'No box score text provided' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const FIREBASE_URL = 'https://firestore.googleapis.com/v1/projects/dvsl-292dd/databases/(default)/documents';

  try {
    // ── STEP 1: Send to Claude API ────────────────────────
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `You are parsing a softball box score. Extract ALL data and return ONLY valid JSON, no other text.

Game info:
- Away Team: ${awayTeam}
- Home Team: ${homeTeam}
- Date: ${date}
- Week: ${week}
- Field: ${field}
- Firebase Game ID: ${gameId}

Box score text:
${text}

Return this exact JSON structure:
{
  "awayScore": <number>,
  "homeScore": <number>,
  "awayBatters": [
    {
      "name": "<full name as best you can determine>",
      "num": "<jersey number>",
      "pos": "<position>",
      "ab": <number>,
      "r": <number>,
      "h": <number>,
      "rbi": <number>,
      "bb": <number>,
      "so": <number>,
      "hr": <number>,
      "doubles": <number>,
      "triples": <number>,
      "errors": <number>
    }
  ],
  "homeBatters": [<same structure>],
  "awayPitchers": [
    {
      "name": "<name>",
      "num": "<number>",
      "ip": "<innings pitched>",
      "h": <number>,
      "r": <number>,
      "er": <number>,
      "bb": <number>,
      "so": <number>,
      "hr": <number>
    }
  ],
  "homePitchers": [<same structure>],
  "linescore": {
    "away": [<inning 1>, <inning 2>, ..., <inning 7>],
    "home": [<inning 1>, <inning 2>, ..., <inning 7>],
    "awayHits": <number>,
    "homeHits": <number>,
    "awayErrors": <number>,
    "homeErrors": <number>
  },
  "notes": "<any notable info like HR, 3B, win/loss pitcher>"
}

Important:
- Names may be truncated in the PDF (e.g. "M Amers" = "M Amerstein", "B Schwar" = "B Schwartz") — do your best
- If a stat is missing, use 0
- Return ONLY the JSON object, nothing else`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    if (!claudeRes.ok) throw new Error(`Claude API error: ${claudeData.error?.message}`);

    const rawText = claudeData.content[0].text.trim();
    // Strip any markdown code fences if present
    const jsonText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonText);

    // Return the parsed data to the admin site
    // The admin site will show it for confirmation, then call /api/update-firebase
    return res.status(200).json({
      success: true,
      parsed,
      gameId,
      awayTeam,
      homeTeam,
      date,
      week,
      field
    });

  } catch (err) {
    console.error('parse-boxscore error:', err);
    return res.status(500).json({ error: err.message });
  }
}
