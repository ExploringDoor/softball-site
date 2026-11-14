// Vercel Serverless Function — /api/send-notification
// Sends a push (FCM HTTP v1) to every subscriber who should get it. The
// fan-out itself lives in api/_lib/push.js (sendPush); this endpoint decides
// WHO may send WHAT, from the caller's real roles (roles/{uid}).
//
// Auth: `Authorization: Bearer <Firebase ID token>` (no shared secret).
//
// Permission matrix (DESIGN §5):
//   admin    any category / teams / adminOnly / imageDataUrl / url.
//   captain  scores, schedule, rainouts, live: REQUIRE gameId of a game the
//            caller captains a side of (games/{id}, or playoff_games/{po__id});
//            the server sets teams=[away, home] and prefixes the title with
//            the caller's team name.
//            team_chat: teams ⊆ the caller's captain teams.
//            captains_chat: allowed.
//            admin: only with adminOnly:true (score-conflict alert).
//            No imageDataUrl.
//   member   team_chat with teams ⊆ member teams; the title is built here.
//   else     403.
// Limits: title ≤ 120, body ≤ 400 (truncated). 20/min per uid. Daily caps:
// 'push' 500 for non-admin traffic, 'push-admin' 2000 for the admin.
//
// Body: { title, body, category, team?, teams?, url?, gameId?, adminOnly?,
//         rosterOnly?, excludeToken?, excludePlayerIds?, sourceId?, imageDataUrl? }

import { cors, rateLimited, requireUser, getRoles, fsGet, dailyCount, body as readBody } from './_lib/dvsl.js';
import { sendPush, CATEGORIES, IMAGE_MAX, TITLE_MAX, BODY_MAX, clip, safeUrl } from './_lib/push.js';

const fail = (res, status, error, message) => res.status(status).json({ error, message });
const GAME_CATS = ['scores', 'schedule', 'rainouts', 'live'];
const ID_RE = /^[A-Za-z0-9_\-]{1,200}$/;
const TEAM_RE = /^[A-Za-z0-9_\-]{1,60}$/;

async function teamLabel(teamId) {
  try {
    const t = await fsGet(`teams/${teamId}`);
    return clip((t && (t.name || t.short)) || teamId, 60);
  } catch (_) { return teamId; }
}
function prefixed(prefix, title) {
  const t = String(title || '').trim();
  if (!t) return prefix;
  return t.toLowerCase().startsWith(prefix.toLowerCase()) ? t : `${prefix} · ${t}`;
}

// The two sides of a game: games/{id}, or playoff_games/{po__…} for bracket games.
async function gameSides(gameId) {
  const g = await fsGet(`${gameId.startsWith('po__') ? 'playoff_games' : 'games'}/${gameId}`);
  if (!g) return null;
  return [g.away, g.home].filter(x => typeof x === 'string' && x);
}

// Decide what this caller may send. Returns { error } or { role, push }.
export async function authorize(user, roles, b) {
  const category = b.category;
  const teamsIn = (Array.isArray(b.teams) && b.teams.length ? b.teams : (b.team ? [b.team] : []))
    .filter(x => typeof x === 'string' && x);
  if (teamsIn.length > 30 || teamsIn.some(t => !TEAM_RE.test(t))) return { error: [400, 'bad-teams', 'Invalid team list.'] };
  const gameId = typeof b.gameId === 'string' && b.gameId ? b.gameId : null;
  if (gameId && !ID_RE.test(gameId)) return { error: [400, 'bad-game', 'Invalid game id.'] };
  const hasImage = !!b.imageDataUrl;
  const base = {
    title: b.title, body: b.body, category,
    url: b.url, sourceId: b.sourceId, gameId: gameId || undefined,
    excludeToken: typeof b.excludeToken === 'string' ? b.excludeToken : undefined,
    excludePlayerIds: Array.isArray(b.excludePlayerIds) ? b.excludePlayerIds.slice(0, 500) : [],
    rosterOnly: b.rosterOnly === true,
  };

  if (roles.admin) {
    if (hasImage) {
      if (typeof b.imageDataUrl !== 'string' || !b.imageDataUrl.startsWith('data:image/')) return { error: [400, 'bad-image', 'The attached image is not a valid image.'] };
      if (b.imageDataUrl.length > IMAGE_MAX) return { error: [413, 'image-too-large', 'Image too large. Max about 650KB after compression.'] };
    }
    return { role: 'admin', push: { ...base, teams: teamsIn, adminOnly: b.adminOnly === true, imageDataUrl: hasImage ? b.imageDataUrl : undefined } };
  }

  if (hasImage) return { error: [403, 'forbidden', 'Only the commissioner can attach photos to notifications.'] };
  const capt = roles.captain_teams;
  const member = roles.member_teams;
  const url = safeUrl(b.url || '/');

  if (capt.length && GAME_CATS.includes(category)) {
    if (b.adminOnly === true) return { error: [403, 'forbidden', 'Captains can only send commissioner alerts as score-conflict alerts.'] };
    if (!gameId) return { error: [400, 'game-required', 'This notification needs the game it is about.'] };
    let sides;
    try { sides = await gameSides(gameId); } catch (e) { return { error: [503, 'unavailable', 'Could not look up that game. Please try again.'] }; }
    if (!sides) return { error: [404, 'game-not-found', 'That game was not found.'] };
    const mine = sides.find(t => capt.includes(t));
    if (!mine) return { error: [403, 'forbidden', "You can only send notifications about your own team's games."] };
    const label = await teamLabel(mine);
    return { role: 'captain', push: { ...base, url, teams: sides, adminOnly: false, title: prefixed(label, b.title) } };
  }
  if (capt.length && category === 'captains_chat') {
    const label = await teamLabel(capt[0]);
    return { role: 'captain', push: { ...base, url, teams: [], adminOnly: false, rosterOnly: false, excludePlayerIds: [], title: prefixed(label, b.title) } };
  }
  if (capt.length && category === 'admin') {
    if (b.adminOnly !== true) return { error: [403, 'forbidden', 'Captains can only send commissioner alerts as adminOnly.'] };
    const label = await teamLabel(capt[0]);
    return { role: 'captain', push: { ...base, url, teams: [], adminOnly: true, rosterOnly: false, excludePlayerIds: [], title: prefixed(label, b.title) } };
  }
  if (category === 'team_chat') {
    if (!teamsIn.length) return { error: [400, 'team-required', 'Pick the team this message is for.'] };
    if (b.adminOnly === true) return { error: [403, 'forbidden', 'Not allowed.'] };
    if (capt.length && teamsIn.every(t => capt.includes(t))) {
      const label = await teamLabel(teamsIn[0]);
      return { role: 'captain', push: { ...base, url, teams: teamsIn, adminOnly: false, title: prefixed(label, b.title) } };
    }
    if (member.length && teamsIn.every(t => member.includes(t))) {
      const label = await teamLabel(teamsIn[0]);
      return { role: 'member', push: { ...base, url, teams: teamsIn, adminOnly: false, title: `${label} chat` } };
    }
    return { error: [403, 'forbidden', 'You can only message your own team.'] };
  }
  if (capt.length || member.length) return { error: [403, 'forbidden', 'Your account cannot send this kind of notification.'] };
  return { error: [403, 'forbidden', 'Only the commissioner, captains and team members can send notifications.'] };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!process.env.FCM_SERVICE_ACCOUNT_JSON) {
    return fail(res, 503, 'not-configured', 'Push notifications are not set up on the server.');
  }
  const user = await requireUser(req, res);
  if (!user) return;
  // Burst limits: 120/min for anyone (checked before the roles read), 20/min
  // for non-admins. Admin bulk flows (a rain-out day) send one push per game.
  if (rateLimited('push-all:' + user.uid, 120, 60000)) return fail(res, 429, 'rate-limited', 'Too many notifications. Please wait a minute.');

  const b = readBody(req);
  if (typeof b.title !== 'string' || !b.title.trim() || typeof b.body !== 'string' || !b.body.trim() || !CATEGORIES.includes(b.category)) {
    return fail(res, 400, 'bad-request', 'title, body and a known category are required.');
  }
  if (b.title.length > 2000 || b.body.length > 5000) return fail(res, 413, 'too-long', 'That notification is too long.');

  let roles;
  try { roles = await getRoles(user.uid); }
  catch (e) { return fail(res, 503, 'unavailable', 'Could not check your account. Please try again.'); }
  if (!roles.admin && rateLimited('push:' + user.uid, 20, 60000)) return fail(res, 429, 'rate-limited', 'Too many notifications. Please wait a minute.');

  const a = await authorize(user, roles, b);
  if (a.error) return fail(res, ...a.error);

  const n = await dailyCount(a.role === 'admin' ? 'push-admin' : 'push');
  if (n > (a.role === 'admin' ? 2000 : 500)) return fail(res, 429, 'daily-limit', 'The daily notification limit was reached. Please try again tomorrow.');

  // Final clamps (sendPush clamps again).
  a.push.title = clip(a.push.title, TITLE_MAX);
  a.push.body = clip(a.push.body, BODY_MAX);
  try {
    const r = await sendPush(a.push, { senderRole: a.role, senderUid: user.uid });
    return res.status(200).json({ ok: true, ...r });
  } catch (e) {
    console.error('send-notification failed:', e.message);
    return fail(res, 502, 'send-failed', 'Could not send the notification. Please try again.');
  }
}
