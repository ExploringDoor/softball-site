// Vercel Serverless Function — /api/parse-boxscore.js
// Receives box score text or image + game info, sends to Claude API

import { cors, rejectForeignOrigin, rateLimited, clientIp, requireUser, getRoles, dailyCount } from './_lib/dvsl.js';

// --- Request guard (2026-11 security lockdown) ---
// This endpoint spends money (Anthropic). Callers: the box-score upload in
// admin.html and captain.html. Checks, in order: our Origin, a per-IP burst
// limit, a verified Firebase ID token, the caller's real role from
// roles/{uid} (the admin or an approved captain; plain accounts get 403),
// payload size caps, and a durable site-wide daily cap (api_usage, written
// only by the service account).
const _DAILY_MAX = 150; // real use is a handful of score sheets on a game night
const fail = (res, status, error, message) => res.status(status).json({ error, message });

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (rejectForeignOrigin(req, res)) return;
  if (rateLimited('pbs:' + clientIp(req), 15, 60000)) return fail(res, 429, 'rate-limited', 'Too many requests, please wait a minute.');

  const _user = await requireUser(req, res);
  if (!_user) return;
  let _roles;
  try { _roles = await getRoles(_user.uid); }
  catch (e) { return fail(res, 503, 'unavailable', 'Could not check your account. Please try again.'); }
  if (!_roles.admin && !_roles.captain_teams.length) {
    return fail(res, 403, 'forbidden', 'Only the commissioner and approved captains can read score sheets.');
  }

  if (!req.body || typeof req.body !== 'object') return fail(res, 400, 'no-content', 'No box score content provided');
  const { text, imageBase64, imageType, pdfBase64, gameId, awayTeam, homeTeam, awayRoster, homeRoster, date, week, field } = req.body;

  if (!text && !imageBase64 && !pdfBase64) return fail(res, 400, 'no-content', 'No box score content provided');

  // Bound per-call cost: phone photos / PDFs are well under ~6MB of base64.
  if ([imageBase64, pdfBase64, text].some(v => typeof v === 'string' && v.length > 8000000)) {
    return fail(res, 413, 'too-large', 'File too large. Please use a smaller image or PDF.');
  }
  // Everything that is not the file itself goes into the prompt, so bound it too:
  // pasted text, the two rosters, and the game info fields.
  const _nonFile = JSON.stringify({ text, gameId, awayTeam, homeTeam, awayRoster, homeRoster, date, week, field }) || '';
  if (_nonFile.length > 100000) return fail(res, 413, 'too-large', 'Request too large.');

  if (await dailyCount('parse-boxscore') > _DAILY_MAX) {
    return fail(res, 429, 'daily-limit', 'Daily limit for reading score sheets reached. Please enter the box score by hand or try again tomorrow.');
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return fail(res, 503, 'not-configured', 'Score sheet reading is not set up on the server.');

  // Format rosters for inclusion in the prompt. Scorecards typically
  // write names abbreviated (last name only, "A Snyder", "Snyderman",
  // initial + last, sometimes nicknames). Without the actual roster,
  // Claude transcribes whatever string appears and the captain has to
  // hand-fix every short name. Pass both rosters so the model can
  // resolve abbreviations to the canonical full name.
  const fmtRoster = (arr, label) => {
    if (!Array.isArray(arr) || !arr.length) return `${label} roster: (not provided — use the name as written on the scorecard)`;
    const lines = arr.map(p => {
      const num = p.num ? `#${p.num} ` : '';
      return `  - ${num}${p.name || ''}`;
    }).join('\n');
    return `${label} roster (use these EXACT names whenever the scorecard entry resolves to one of them):\n${lines}`;
  };

  const prompt = `You are parsing a softball box score. Extract ALL data and return ONLY valid JSON, no other text.

Game info:
- Away Team: ${awayTeam}
- Home Team: ${homeTeam}
- Date: ${date}
- Week: ${week}
- Field: ${field}

${fmtRoster(awayRoster, awayTeam || 'Away')}

${fmtRoster(homeRoster, homeTeam || 'Home')}

NAME RESOLUTION RULES (very important):
- Scorecards typically use abbreviated names: last name only ("Snyderman"), first initial + last ("A Snyder", "A. Snyder"), nicknames, or sometimes a number with no name. ALWAYS try to map an abbreviated entry to a full-name entry on the matching team's roster above.
- If a scorecard entry like "A Snyder" or "Snyderman" matches a full-name roster entry like "Andrew Snyderman", output the FULL ROSTER NAME ("Andrew Snyderman") in the "name" field.
- Match by jersey number first when present — # is the strongest signal. Then by last name (case-insensitive). Then by first initial + last name. Only when no roster match is plausible should you keep the raw scorecard string.
- If the scorecard's first/last initials or jersey # don't match anyone on the roster (a sub, walk-on, or scorecard error), keep the raw text as written.
- Disambiguate same-last-name teammates by jersey # or first initial.

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
Rules: Missing stats = 0. Return ONLY the JSON, no commentary.`;

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

    return res.status(200).json({ ok: true, success: true, parsed, gameId, awayTeam, homeTeam, date, week, field });

  } catch (err) {
    console.error('parse-boxscore error:', err);
    return fail(res, 502, 'parse-failed', 'Could not read that score sheet. Try a clearer photo or enter it by hand.');
  }
}
