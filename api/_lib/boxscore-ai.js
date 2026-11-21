// The AI scorebook reader, shared by api/parse-boxscore.js (captain/admin
// upload on the website) and api/_sms/photo-boxscore.js (a captain texts a
// photo of the scorebook).
//
// Moved here unchanged from api/parse-boxscore.js: the roster block, the
// prompt, the message content (PDF document / image / plain text), the model,
// and the reply parsing. parse-boxscore.js calls exactly these, so the website
// upload behaves the same as before the move.
//
// Also here: the roster name matching captain.html runs on the parsed result
// (_captResolveParsedNames and friends), ported so the text flow maps
// "Kundtz" to "Jason Kundtz" the same way the captain page does. The website
// endpoint does NOT run it (captain.html does it in the browser, with a picker
// for ambiguous names); only the text flow calls resolveParsedNames.

export const BOXSCORE_MODEL = 'claude-sonnet-4-6';
export const BOXSCORE_MAX_TOKENS = 4000;

// Format rosters for inclusion in the prompt. Scorecards typically
// write names abbreviated (last name only, "A Snyder", "Snyderman",
// initial + last, sometimes nicknames). Without the actual roster,
// Claude transcribes whatever string appears and the captain has to
// hand-fix every short name. Pass both rosters so the model can
// resolve abbreviations to the canonical full name.
export const fmtRoster = (arr, label) => {
  if (!Array.isArray(arr) || !arr.length) return `${label} roster: (not provided — use the name as written on the scorecard)`;
  const lines = arr.map(p => {
    const num = p.num ? `#${p.num} ` : '';
    return `  - ${num}${p.name || ''}`;
  }).join('\n');
  return `${label} roster (use these EXACT names whenever the scorecard entry resolves to one of them):\n${lines}`;
};

export function buildBoxScorePrompt({ awayTeam, homeTeam, awayRoster, homeRoster, date, week, field } = {}) {
  return `You are parsing a softball box score. Extract ALL data and return ONLY valid JSON, no other text.

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
}

// Build message content. Branches:
//   1. PDF — send as a `document` block. Anthropic reads PDFs natively
//      and PRESERVES the visual table structure (column alignment, row
//      ordering). This is the right path for Excel-exported PDFs where
//      text extraction via pdfjs destroys the columns and Claude can
//      no longer parse per-batter rows.
//   2. Image (jpg/png) — `image` block with vision.
//   3. Plain text — fallback for older callers that pre-extracted text.
//   4. `files` (text flow only): several pages at once, e.g. a scorebook
//      photographed one team per page. Each is an image or a PDF block, in
//      the order sent, followed by the prompt.
export function buildMessageContent(prompt, { text, imageBase64, imageType, pdfBase64, files } = {}) {
  if (Array.isArray(files) && files.length) {
    const blocks = files.map(f => (f.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: f.mediaType || 'image/jpeg', data: f.base64 } }));
    return [...blocks, { type: 'text', text: prompt }];
  }
  if (pdfBase64) {
    return [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
      { type: 'text', text: prompt }
    ];
  }
  if (imageBase64) {
    return [
      { type: 'image', source: { type: 'base64', media_type: imageType || 'image/jpeg', data: imageBase64 } },
      { type: 'text', text: prompt }
    ];
  }
  return `${prompt}\n\nBox score text:\n${text}`;
}

// The model's reply text → the parsed object (throws on bad JSON).
export function parseModelText(rawText) {
  const jsonText = String(rawText).trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(jsonText);
}

// One Anthropic call. Returns the parsed box score; throws on any failure
// (HTTP error, bad JSON). `signal` is optional (the website path never set a
// timeout; the text flow does).
export async function callBoxScoreAI({ apiKey, content, signal }) {
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    ...(signal ? { signal } : {}),
    body: JSON.stringify({
      model: BOXSCORE_MODEL,
      max_tokens: BOXSCORE_MAX_TOKENS,
      messages: [{ role: 'user', content }]
    })
  });

  const claudeData = await claudeRes.json();
  if (!claudeRes.ok) throw new Error(`Claude API error: ${claudeData.error?.message}`);

  const rawText = claudeData.content[0].text.trim();
  return parseModelText(rawText);
}

// Convenience: game info + rosters + file(s) → parsed box score.
export async function readBoxScore(input, { apiKey, signal } = {}) {
  const prompt = buildBoxScorePrompt(input);
  const content = buildMessageContent(prompt, input);
  return callBoxScoreAI({ apiKey, content, signal });
}

// ─── Roster name matching (port of captain.html _capt* helpers) ──────────
// Strips ALL Unicode whitespace (NBSP, tabs, ideographic spaces) so names
// pasted from a PDF/Word with NBSP still dedupe correctly.
export function normName(s) {
  return String(s || '')
    .replace(/\p{Z}+/gu, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
export function surname(s) {
  const n = normName(s);
  if (!n) return '';
  if (n.includes(',')) return n.split(',')[0].trim();
  const parts = n.replace(/\./g, '').split(/\s+/).filter(Boolean);
  while (parts.length > 1 && /^(jr|sr|ii|iii|iv)$/.test(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] || '';
}
export function firstInitial(s) {
  const n = normName(s);
  if (!n) return '';
  if (n.includes(',')) {
    const after = n.split(',')[1] || '';
    return after.trim().charAt(0);
  }
  const parts = n.replace(/\./g, '').split(/\s+/).filter(Boolean);
  if (parts.length < 2) return '';
  return parts[0].charAt(0);
}
export function matchAgainstRoster(parsedName, roster, parsedNum) {
  const last = surname(parsedName);
  if (!last) return { match: null, candidates: [] };
  const candidates = roster.filter(p => surname(p.name) === last);
  if (candidates.length === 0) return { match: null, candidates: [] };
  if (candidates.length === 1) return { match: candidates[0], candidates };
  if (parsedNum != null && String(parsedNum).trim() !== '') {
    const nStr = String(parsedNum).trim();
    const byNum = candidates.filter(p => String(p.num || '').trim() === nStr);
    if (byNum.length === 1) return { match: byNum[0], candidates };
  }
  const initial = firstInitial(parsedName);
  if (initial) {
    const narrow = candidates.filter(p => firstInitial(p.name) === initial);
    if (narrow.length === 1) return { match: narrow[0], candidates };
  }
  return { match: null, candidates };
}
// Mutates `parsed` in place (name → roster name, pid, num) exactly like
// _captResolveParsedNames. Rosters are the active players of each team.
// Returns { ambiguous, unmatched }: ambiguous = several roster players share
// the surname and nothing narrowed it (captain.html shows a picker; a text
// keeps the name as read); unmatched = batters whose name is on no roster
// line at all, so their line will not count toward any player's stats.
export function resolveParsedNames(parsed, awayRoster, homeRoster) {
  const ambiguous = [];
  const unmatched = [];
  if (!parsed) return { ambiguous, unmatched };
  const resolveOne = (entry, roster, side, role) => {
    if (!entry || !entry.name) return;
    const r = matchAgainstRoster(entry.name, roster, entry.num);
    if (r.match) {
      entry.name = r.match.name;
      entry.pid = r.match.id;
      if (!entry.num && r.match.num) entry.num = r.match.num;
    } else if (r.candidates.length > 1) {
      ambiguous.push({ entry, candidates: r.candidates, side, role });
    }
    if (role === 'batter' && !roster.some(p => normName(p.name) === normName(entry.name))) {
      unmatched.push({ name: entry.name, side });
    }
  };
  (parsed.awayBatters || []).forEach(p => resolveOne(p, awayRoster || [], 'away', 'batter'));
  (parsed.homeBatters || []).forEach(p => resolveOne(p, homeRoster || [], 'home', 'batter'));
  (parsed.awayPitchers || []).forEach(p => resolveOne(p, awayRoster || [], 'away', 'pitcher'));
  (parsed.homePitchers || []).forEach(p => resolveOne(p, homeRoster || [], 'home', 'pitcher'));
  return { ambiguous, unmatched };
}

// Strip "did-not-play" batters: every stat column zero/blank (captain.html
// _captApplyParsedToBoxScore, Adam ask 2026-05-14).
const DNP_FIELDS = ['ab', 'r', 'h', 'rbi', 'bb', 'so', 'k', 'hr', 'doubles', 'triples', 'roe', 'fc', 'sac', 'sf'];
export function stripDnp(arr) {
  return (arr || []).filter(p => !DNP_FIELDS.every(f => !(parseInt(p?.[f]) || 0)));
}
