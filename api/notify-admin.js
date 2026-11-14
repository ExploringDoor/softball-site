// Vercel Serverless Function — /api/notify-admin
// Emails the commissioner (Resend) about a captain action, e.g. a game edit
// or a game added from the captain portal. The email core is
// api/_lib/notify.js notifyAdminEmail(); claim / sign-up alerts are sent
// in-process by api/account.js and api/register.js, not through here.
//
// Auth: `Authorization: Bearer <Firebase ID token>`; the caller must be the
// admin or an approved captain (roles/{uid}). The sender shown in the email
// is the caller's verified account email, never a name from the request.
// Limits: 10/min per uid; 100/day across captains (admin calls not counted).
//
// Body: { kind: 'game_edit'|'game_add'|'captain_claim'|'signup'|'self_add',
//         gameId?, teamsLabel?, summary?, diff?, subject? }
// If RESEND_API_KEY / ADMIN_EMAIL are missing → 200 { ok:true, sent:false, skipped }.

import { cors, rateLimited, requireUser, getRoles, dailyCount, body as readBody } from './_lib/dvsl.js';
import { notifyAdminEmail, oneLine } from './_lib/notify.js';

const fail = (res, status, error, message) => res.status(status).json({ error, message });
const ALLOWED_KINDS = ['game_edit', 'game_add', 'captain_claim', 'signup', 'self_add'];
const str = (v, max) => (typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : '')).slice(0, max);

export function buildLines(user, roles, b) {
  const who = roles.admin ? 'commissioner' : `captain of ${roles.captain_teams.join(', ')}`;
  const lines = [`Sent by: ${user.email} (${who})`];
  const teamsLabel = oneLine(str(b.teamsLabel, 200), 200);
  const summary = str(b.summary, 2000).trim();
  const diff = str(b.diff, 4000).trim();
  const gameId = oneLine(str(b.gameId, 200), 200);
  if (teamsLabel) lines.push(`Game: ${teamsLabel}`);
  if (summary) lines.push(`Summary: ${summary}`);
  if (diff && diff !== summary) lines.push('', 'Changes:', diff);
  if (gameId) lines.push('', `Game ID: ${gameId}`);
  return lines;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (rateLimited('notify:' + user.uid, 10, 60000)) return fail(res, 429, 'rate-limited', 'Too many requests. Please wait a minute.');

  let roles;
  try { roles = await getRoles(user.uid); }
  catch (e) { return fail(res, 503, 'unavailable', 'Could not check your account. Please try again.'); }
  if (!roles.admin && !roles.captain_teams.length) return fail(res, 403, 'forbidden', 'Only captains can notify the commissioner.');

  const b = readBody(req);
  let kind = b.kind;
  if (kind === undefined || kind === null || kind === '') kind = b.gameId ? 'game_edit' : 'game_add';
  if (!ALLOWED_KINDS.includes(kind)) return fail(res, 400, 'bad-kind', 'Unknown notification kind.');

  if (!roles.admin && await dailyCount('notify') > 100) {
    return fail(res, 429, 'daily-limit', 'The daily limit for commissioner emails was reached.');
  }

  const subject = oneLine(str(b.subject, 200), 120) || oneLine(str(b.teamsLabel, 200), 120);
  const r = await notifyAdminEmail({ kind, subject, lines: buildLines(user, roles, b) });
  if (r.sent) return res.status(200).json({ ok: true, sent: true });
  if (r.skipped === 'not-configured') return res.status(200).json({ ok: true, sent: false, skipped: 'not-configured' });
  return fail(res, 502, 'send-failed', 'Could not email the commissioner.');
}
