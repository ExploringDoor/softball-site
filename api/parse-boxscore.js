// Vercel Serverless Function — /api/parse-boxscore.js
// Receives box score text or image + game info, sends to Claude API

import { cors, rejectForeignOrigin, rateLimited, clientIp, requireUser, getRoles, dailyCount } from './_lib/dvsl.js';
import { buildBoxScorePrompt, buildMessageContent, callBoxScoreAI } from './_lib/boxscore-ai.js';

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

  // The prompt, the roster block, the message content and the Anthropic call
  // live in _lib/boxscore-ai.js (shared with the text-a-box-score flow).
  const prompt = buildBoxScorePrompt({ awayTeam, homeTeam, awayRoster, homeRoster, date, week, field });
  const messageContent = buildMessageContent(prompt, { text, imageBase64, imageType, pdfBase64 });

  try {
    const parsed = await callBoxScoreAI({ apiKey: ANTHROPIC_KEY, content: messageContent });

    return res.status(200).json({ ok: true, success: true, parsed, gameId, awayTeam, homeTeam, date, week, field });

  } catch (err) {
    console.error('parse-boxscore error:', err);
    return fail(res, 502, 'parse-failed', 'Could not read that score sheet. Try a clearer photo or enter it by hand.');
  }
}
