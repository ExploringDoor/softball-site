// Vercel Serverless Function — /api/parse-schedule.js
// Receives CSV text (any format), sends to Claude API, returns structured games array

import { cors, rejectForeignOrigin, rateLimited, clientIp, requireUser, getRoles, dailyCount } from './_lib/dvsl.js';

// --- Request guard (2026-11 security lockdown) ---
// Paid endpoint (Anthropic). Only caller: the Schedule CSV import in
// admin.html. Checks, in order: our Origin, a per-IP burst limit, a verified
// Firebase ID token, roles/{uid}.admin === true (everyone else gets 403),
// size caps, and a durable site-wide daily cap (api_usage, service account).
const _DAILY_MAX = 40; // a schedule import happens a few times a season
const fail = (res, status, error, message) => res.status(status).json({ error, message });

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (rejectForeignOrigin(req, res)) return;
  if (rateLimited('psch:' + clientIp(req), 15, 60000)) return fail(res, 429, 'rate-limited', 'Too many requests, please wait a minute.');

  const _user = await requireUser(req, res);
  if (!_user) return;
  let _roles;
  try { _roles = await getRoles(_user.uid); }
  catch (e) { return fail(res, 503, 'unavailable', 'Could not check your account. Please try again.'); }
  if (!_roles.admin) return fail(res, 403, 'forbidden', 'Only the commissioner can import schedules.');

  const { csvText, teams } = (req.body && typeof req.body === 'object') ? req.body : {};
  if (!csvText || typeof csvText !== 'string') return fail(res, 400, 'no-content', 'No CSV content provided');
  // A full season is a few hundred rows (well under 50KB). Bound the whole
  // body, since the team list goes into the prompt as well.
  if (csvText.length > 200000 || (JSON.stringify(teams) || '').length > 20000) {
    return fail(res, 413, 'too-large', 'Schedule file too large.');
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return fail(res, 503, 'not-configured', 'Schedule import is not set up on the server.');

  if (await dailyCount('parse-schedule') > _DAILY_MAX) {
    return fail(res, 429, 'daily-limit', 'Daily limit for schedule imports reached. Please try again tomorrow.');
  }

  const teamsRef = Array.isArray(teams) && teams.length
    ? `Known team IDs and names:\n${teams.filter(t => t && typeof t === 'object').map(t => `  ${String(t.id || '')}: ${String(t.name || '')}`).join('\n')}`
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
      const err = await resp.text().catch(() => '');
      console.error('parse-schedule Claude error:', resp.status, err.slice(0, 300));
      return fail(res, 502, 'parse-failed', 'Could not read that schedule file. Please try again.');
    }

    const data = await resp.json();
    const raw = data.content?.[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fail(res, 502, 'parse-failed', 'Could not read that schedule file. Check the columns and try again.');

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ ok: true, ...parsed });
  } catch (e) {
    console.error('parse-schedule error:', e.message);
    return fail(res, 502, 'parse-failed', 'Could not read that schedule file. Please try again.');
  }
}
