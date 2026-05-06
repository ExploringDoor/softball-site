// Vercel Serverless Function — /api/parse-boxscore.js
// Receives box score text or image + game info, sends to Claude API

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, imageBase64, imageType, pdfBase64, gameId, awayTeam, homeTeam, date, week, field } = req.body;

  if (!text && !imageBase64 && !pdfBase64) return res.status(400).json({ error: 'No box score content provided' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  const prompt = `You are parsing a softball box score. Extract ALL data and return ONLY valid JSON, no other text.

Game info:
- Away Team: ${awayTeam}
- Home Team: ${homeTeam}
- Date: ${date}
- Week: ${week}
- Field: ${field}

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
Rules: names may be truncated — do your best. Missing stats = 0. Return ONLY the JSON.`;

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
