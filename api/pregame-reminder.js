// Vercel Serverless Function — /api/pregame-reminder.js
// Scheduled cron (see vercel.json): runs every 15 minutes and pushes a
// one-hour-heads-up notification to subscribers of both teams for each
// game starting in the next ~60 minutes. Uses a `pregame_reminder_sent`
// flag on the game doc to ensure exactly-once delivery per game.
//
// Env vars reused from /api/send-notification:
//   FCM_PROJECT_ID
//   FCM_SERVICE_ACCOUNT_JSON
//   ADMIN_SEND_SECRET
//
// Vercel crons send a GET with an Authorization: Bearer ${CRON_SECRET}
// header. We validate against CRON_SECRET if set, otherwise the same
// ADMIN_SEND_SECRET fallback works when triggered manually.

import crypto from 'crypto';

export default async function handler(req, res) {
  // Cron secret check — protects the endpoint from random internet hits.
  const CRON_SECRET  = process.env.CRON_SECRET;
  const ADMIN_SECRET = process.env.ADMIN_SEND_SECRET;
  const authHeader   = req.headers['authorization'] || '';
  const bearerToken  = authHeader.replace(/^Bearer\s+/i, '');
  const sentSecret   = req.headers['x-admin-secret'];
  const okCron  = CRON_SECRET && bearerToken === CRON_SECRET;
  const okAdmin = ADMIN_SECRET && sentSecret === ADMIN_SECRET;
  if ((CRON_SECRET || ADMIN_SECRET) && !okCron && !okAdmin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const PROJECT_ID = process.env.FCM_PROJECT_ID;
  const SVC_JSON   = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!PROJECT_ID || !SVC_JSON) {
    return res.status(503).json({ error: 'Push notifications not configured' });
  }

  let svc; try { svc = JSON.parse(SVC_JSON); }
  catch(e) { return res.status(500).json({ error: 'Invalid FCM_SERVICE_ACCOUNT_JSON' }); }

  let accessToken;
  try { accessToken = await getAccessToken(svc); }
  catch(e) { return res.status(500).json({ error: 'Failed to mint access token', detail: e.message }); }

  // 1. Pull every non-finalized game in the next 24h from Firestore REST.
  //    The runs-every-15-minutes cron means we re-check frequently, and the
  //    pregame_reminder_sent flag guarantees we only ping once per game.
  const games = await listUpcomingGames({ projectId: PROJECT_ID, accessToken });
  const now = Date.now();
  const WINDOW_START = now + 45 * 60 * 1000;   // 45 min from now
  const WINDOW_END   = now + 75 * 60 * 1000;   // 75 min from now
  // 30-minute window centered on 60 min out. Cron runs every 15 min so any
  // scheduled game will fall inside at least one window before it starts.

  const pushed = [];
  for (const g of games) {
    if (g.pregame_reminder_sent) continue;
    if (g.done || g.rained_out) continue;
    const startMs = gameStartMs(g);
    if (!startMs) continue;
    if (startMs < WINDOW_START || startMs > WINDOW_END) continue;

    const title = `⚾ Game in 1 hour: ${shortName(g.away)} @ ${shortName(g.home)}`;
    const parts = [];
    if (g.time) parts.push(g.time);
    if (g.field) parts.push(g.field);
    const body = parts.join(' · ') || 'Game starts soon';

    try {
      // Send via the same endpoint we call from the admin UI so logging,
      // token-pruning, and per-user category filtering stay consistent.
      const r = await fetch(process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/api/send-notification`
        : 'http://localhost:3000/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ADMIN_SECRET ? { 'X-Admin-Secret': ADMIN_SECRET } : {}),
        },
        body: JSON.stringify({
          title, body,
          category: 'pregame',
          teams: [g.away, g.home].filter(Boolean),
          url: '/schedule.html',
        }),
      });
      const data = await r.json().catch(() => ({}));
      pushed.push({ gameId: g.id, sent: data.sent || 0 });
      // Mark as sent so we don't re-ping. Fire-and-forget; if this fails
      // we'll send a duplicate on the next cron, which is a minor cost.
      await markSent({ projectId: PROJECT_ID, accessToken, gameId: g.id });
    } catch(e) {
      pushed.push({ gameId: g.id, error: e.message });
    }
  }

  return res.status(200).json({
    checked: games.length,
    pushed: pushed.length,
    details: pushed,
    now: new Date(now).toISOString(),
  });
}

// ── helpers ────────────────────────────────────────────────────────────

async function getAccessToken(svc) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: svc.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(svc.private_key).toString('base64url');
  const jwt = `${unsigned}.${signature}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(data.error_description || JSON.stringify(data));
  return data.access_token;
}

async function listUpcomingGames({ projectId, accessToken }) {
  // Pull a chunk of games — we filter by date client-side to avoid setting
  // up indexes. 300 is plenty for a ~16-game-per-week league.
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/games?pageSize=300`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await resp.json();
  if (!data.documents) return [];
  return data.documents.map(d => {
    const f = d.fields || {};
    return {
      id: d.name.split('/').pop(),
      away: f.away?.stringValue || '',
      home: f.home?.stringValue || '',
      date: f.date?.stringValue || '',
      date_iso: f.date_iso?.stringValue || '',
      time: f.time?.stringValue || '',
      time_24: f.time_24?.stringValue || '',
      field: f.field?.stringValue || '',
      wk: f.wk?.integerValue || f.wk?.stringValue || '',
      done: f.done?.booleanValue === true,
      rained_out: f.rained_out?.booleanValue === true,
      pregame_reminder_sent: f.pregame_reminder_sent?.booleanValue === true,
    };
  });
}

// Combine date_iso ("2026-05-14") + time_24 ("19:00") into a millis timestamp.
// Falls back to parsing `date` ("May 14") + `time` ("7:00 PM") if needed.
function gameStartMs(g) {
  if (g.date_iso && g.time_24) {
    const iso = `${g.date_iso}T${g.time_24}:00`;
    const ms = new Date(iso).getTime();
    if (!isNaN(ms)) return ms;
  }
  if (g.date && g.time) {
    // Assume current year since `date` is just "May 14" format.
    const y = new Date().getFullYear();
    const ms = new Date(`${g.date} ${y} ${g.time}`).getTime();
    if (!isNaN(ms)) return ms;
  }
  return null;
}

async function markSent({ projectId, accessToken, gameId }) {
  const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/games/${gameId}?updateMask.fieldPaths=pregame_reminder_sent`;
  await fetch(endpoint, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { pregame_reminder_sent: { booleanValue: true } } }),
  });
}

// Fallback short name — the API endpoint the notification is sent through
// handles deeper team lookups via the client's teams cache, but the cron
// doesn't have that. The team ID is already short enough to be readable.
function shortName(teamId) {
  return String(teamId || '').toUpperCase();
}
