// Vercel Serverless Function — /api/send-notification.js
// Sends a push notification (via Firebase Cloud Messaging HTTP v1) to every
// subscriber whose saved preferences match the requested category + team.
//
// Called by admin.html "Send Notification" UI or by an eventual Firestore
// trigger (e.g. when a game is finalized).
//
// Env vars (set in Vercel project settings):
//   FCM_PROJECT_ID            — Firebase project ID (e.g. "dvsl-292dd")
//   FCM_SERVICE_ACCOUNT_JSON  — the FULL service-account JSON as a single-line string.
//                                Get it from Firebase Console →
//                                Project Settings → Service accounts →
//                                "Generate new private key". Copy the entire
//                                JSON content as the value.
//   ADMIN_SEND_SECRET         — a shared secret the client passes in a header
//                                so random internet visitors can't spam pushes.
//                                Put the same string in admin.html when calling
//                                this endpoint.
//
// Request body (JSON):
//   title: string                — notification headline
//   body: string                 — notification body text
//   category: "scores"|"rainouts"|"schedule"|"playoffs"|"team_chat"|"captains_chat"|"announcements"|"photos"|"admin"|"live"|"pregame"
//   team?: string                — team id; omit to target all teams
//   teams?: string[]             — multi-team target (wins over team)
//   url?: string                 — deep-link url on notification click
//   adminOnly?: boolean          — only push to tokens flagged is_admin:true
//   excludeToken?: string        — don't push to this token (sender)
//
// If env vars are missing, returns 503 with a clear message so the admin UI
// can surface the setup requirement to Adam.

import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PROJECT_ID = process.env.FCM_PROJECT_ID;
  const SVC_JSON   = process.env.FCM_SERVICE_ACCOUNT_JSON;
  const SECRET     = process.env.ADMIN_SEND_SECRET;

  if (!PROJECT_ID || !SVC_JSON) {
    return res.status(503).json({
      error: 'Push notifications not configured',
      detail: 'Set FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_JSON env vars in Vercel.',
    });
  }
  // Fail closed. If ADMIN_SEND_SECRET is missing/empty the gate used to
  // be bypassed entirely, leaving the endpoint open to the internet to
  // fan-bomb every subscriber. Now we refuse to run until it's set.
  if (!SECRET) {
    return res.status(503).json({
      error: 'Push notifications not configured',
      detail: 'Set ADMIN_SEND_SECRET env var in Vercel.',
    });
  }
  if (req.headers['x-admin-secret'] !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { title, body, category, team, teams, url, excludeToken, adminOnly, sourceId, imageDataUrl } = req.body || {};
  // sourceId: optional stable ID of the originating object (e.g. chat message
  // doc id). Copied onto every pending_nav doc so the notification can be
  // retroactively cleared if the source is deleted (e.g. user deletes a chat
  // message sent by mistake → matching bell items disappear league-wide).
  // `team` (single) and `teams` (array) are both supported. `teams` wins when
  // present — use it for schedule changes that affect multiple teams.
  // imageDataUrl: optional base64 JPEG data URI (e.g. "data:image/jpeg;base64,…")
  // already resized/compressed on the client. Copied into each pending_nav
  // doc so the recipient's Inbox can render it in the card. The push itself
  // stays text-only (FCM webpush image needs a hosted HTTPS URL, not a
  // data URI). Soft-capped at 700KB to stay well under Firestore's 1MB
  // doc limit after other fields are added.
  if (!title || !body || !category) {
    return res.status(400).json({ error: 'title, body, and category are required' });
  }
  let safeImage = null;
  if (imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')) {
    if (imageDataUrl.length > 900_000) {
      return res.status(400).json({ error: 'Image too large — max ~650KB after compression' });
    }
    safeImage = imageDataUrl;
  }

  let svc;
  try { svc = JSON.parse(SVC_JSON); }
  catch(e) { return res.status(500).json({ error: 'Invalid FCM_SERVICE_ACCOUNT_JSON env var' }); }

  // 1. Mint an access token using the service account's private key.
  let accessToken;
  try { accessToken = await getAccessToken(svc); }
  catch(e) { return res.status(500).json({ error: 'Failed to mint access token', detail: e.message }); }

  // 2. Pull matching tokens out of the notification_tokens collection via
  //    the Firestore REST API (reuses same service-account auth).
  let tokenRows = [];
  try { tokenRows = await listMatchingTokens({ projectId: PROJECT_ID, accessToken, category, team, teams, adminOnly }); }
  catch(e) { return res.status(500).json({ error: 'Failed to read tokens', detail: e.message }); }

  // Exclude sender's own token so people don't get pinged for their own chat
  // messages. Callers pass their localStorage 'dvsl-notif-token' here.
  if (excludeToken) tokenRows = tokenRows.filter(r => r.token !== excludeToken);

  if (!tokenRows.length) {
    await logPush({ projectId: PROJECT_ID, accessToken, title, body, category, team, teams, adminOnly, sent: 0, failed: 0, total: 0, note: 'No matching subscribers' }).catch(()=>{});
    return res.status(200).json({ sent: 0, note: 'No matching subscribers' });
  }

  // 3. Fan out FCM sends. We use the send endpoint (one call per token) —
  //    simple and reliable, fine up to a few hundred tokens.
  //
  //    For each recipient we ALSO write a pending_nav/{tokenHash} doc with
  //    {url, ts}. The page polls /api/check-pending-nav on resume to retrieve
  //    it — this is the bulletproof deep-link path that doesn't depend on
  //    iOS Safari / FCM service-worker behavior.
  const clickUrlForNav = url || '/';
  const deadDocIds = []; // tokens to prune (FCM 404/UNREGISTERED)
  const results = await Promise.all(tokenRows.map(async row => {
    // Write pending_nav doc BEFORE the push — so by the time the banner
    // shows and the user taps, Firestore already has the answer. Await
    // this write so there's no race: the doc exists before the push goes
    // out. If the write fails, we still send the push (user just won't
    // get deep-linked this time — strictly better than skipping the push).
    try {
      await writePendingNav({
        projectId: PROJECT_ID, accessToken,
        token: row.token, url: clickUrlForNav, title, body, category, sourceId,
        imageDataUrl: safeImage,
      });
    } catch (_) {}
    try {
      const r = await fcmSend({ projectId: PROJECT_ID, accessToken, token: row.token, title, body, url });
      return { tokenPrefix: row.token.slice(0, 24) + '...', ok: true, messageName: r?.name || null };
    } catch(e) {
      // Detect dead-token signals from FCM so we can prune them. The string
      // "UNREGISTERED" or an HTTP 404 means this device is gone (app deleted,
      // uninstalled PWA, revoked permission, etc).
      const msg = String(e.message || '');
      const isDead = msg.includes('UNREGISTERED') || msg.includes('registration-token-not-registered') || /FCM\s+404/.test(msg);
      if (isDead && row.docId) deadDocIds.push(row.docId);
      return { tokenPrefix: row.token.slice(0, 24) + '...', ok: false, error: msg, dead: isDead };
    }
  }));
  const sent = results.filter(r => r.ok).length;
  const failed = results.length - sent;

  // 4. Prune dead tokens — fire and forget, don't block the response.
  if (deadDocIds.length) {
    pruneDeadTokens({ projectId: PROJECT_ID, accessToken, docIds: deadDocIds })
      .catch(e => console.warn('Prune failed:', e.message));
  }

  // 5. Log this push attempt to the push_log collection so Adam can audit
  //    why certain devices didn't receive pushes. Fire-and-forget.
  logPush({
    projectId: PROJECT_ID, accessToken,
    title, body, category, team, teams, adminOnly,
    sent, failed, total: results.length,
    pruned: deadDocIds.length,
    sampleErrors: results.filter(r => !r.ok).slice(0, 3).map(r => r.error),
  }).catch(() => {});

  return res.status(200).json({ sent, failed, total: results.length, pruned: deadDocIds.length, results });
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

async function listMatchingTokens({ projectId, accessToken, category, team, teams, adminOnly }) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/notification_tokens?pageSize=300`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }});
  const data = await resp.json();
  if (!data.documents) return [];
  // Normalize: prefer `teams` (array); else build single-element from `team`.
  const teamWanted = Array.isArray(teams) && teams.length
    ? teams.filter(Boolean)
    : (team ? [team] : []);
  const out = [];
  for (const d of data.documents) {
    const f = d.fields || {};
    const tok = f.token?.stringValue;
    if (!tok) continue;
    // adminOnly filter: only tokens where is_admin === true
    if (adminOnly && f.is_admin?.booleanValue !== true) continue;
    const cats = (f.categories?.arrayValue?.values || []).map(v => v.stringValue);
    // Categories filter: skip tokens that have explicitly opted into a set
    // that doesn't include this category. EXCEPTION: when `adminOnly` is set,
    // we treat is_admin:true as the explicit subscription — the admin toggle
    // in notifications.html does not write 'admin' to the categories field
    // (it lives in its own row), so without this bypass admin pushes would
    // never deliver to anyone whose categories array is non-empty.
    if (!adminOnly && cats.length && !cats.includes(category)) continue;
    const tokTeams = (f.teams?.arrayValue?.values || []).map(v => v.stringValue);
    // authed_teams: set by profile.html when a player signs in with Firebase
    // Auth and their doc is linked to a team. Used ONLY to gate team_chat
    // pushes — prevents a subscriber who picked "all teams" for score
    // notifications from receiving private team chat messages they aren't
    // actually a member of.
    const tokAuthedTeams = (f.authed_teams?.arrayValue?.values || []).map(v => v.stringValue);
    // is_captain_authed: set by captain.html when a captain successfully
    // signs in via Firebase Auth. Used to gate captains_chat fanout — the
    // notifications.html UI shows a captains_chat toggle that anyone can
    // flip, but this gate ensures only signed-in captains actually receive.
    const tokIsCaptainAuthed = f.is_captain_authed?.booleanValue === true;
    const isTeamChat = category === 'team_chat';
    const isCaptainsChat = category === 'captains_chat';
    if (isTeamChat) {
      // Only push to devices whose authenticated player is on the target team.
      if (!teamWanted.length || !tokAuthedTeams.length) continue;
      if (!teamWanted.some(t => tokAuthedTeams.includes(t))) continue;
    } else if (isCaptainsChat) {
      // Only deliver to tokens flagged as captain-authed by captain.html.
      if (!tokIsCaptainAuthed) continue;
    } else {
      // Empty subscriber teams = "all teams" (always match). Otherwise we need
      // at least one overlap between what we're targeting and what they follow.
      if (teamWanted.length && tokTeams.length && !teamWanted.some(t => tokTeams.includes(t))) continue;
    }
    // Extract the doc ID from the REST path ("projects/.../documents/notification_tokens/{docId}").
    const docId = d.name ? d.name.split('/').pop() : null;
    out.push({ token: tok, docId });
  }
  return out;
}

async function fcmSend({ projectId, accessToken, token, title, body, url }) {
  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  // iOS PWA web push requires an explicit webpush.notification block and
  // a high Urgency header — without these, iOS silently drops the push.
  // Data-only push: NO top-level `notification` block, NO webpush.notification,
  // NO fcm_options.link. This prevents FCM's SDK from auto-displaying the
  // notification and from installing its own notificationclick handler that
  // mangles the URL. Our sw.js handles onBackgroundMessage → showNotification
  // → notificationclick end-to-end, so we control exactly what lands in
  // event.notification.data when the user taps.
  const clickUrl = url || '/';
  const message = {
    token,
    data: {
      title: String(title || 'DVSL'),
      body: String(body || ''),
      url: clickUrl,
    },
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '86400',
      },
    },
  };
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`FCM ${resp.status}: ${text.slice(0,200)}`);
  }
  return await resp.json();
}

// Append one pending_nav doc per push so the recipient's page can list
// unread deep-links and show a banner chip. Creating a new doc each time
// (not upserting) gives us a queue instead of a single overwritable slot —
// critical for "I got a score push and a chat push; let me choose which
// to open." The page fetches the list via /api/check-pending-nav and
// deletes one via /api/dismiss-pending-nav when the user taps or X's it.
async function writePendingNav({ projectId, accessToken, token, url, title, body, category, sourceId, imageDataUrl }) {
  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/pending_nav`;
  const fields = {
    token_hash: { stringValue: tokenHash },
    url:        { stringValue: String(url || '/') },
    ts:         { integerValue: String(Date.now()) },
    title:      { stringValue: String(title || '').slice(0, 200) },
    body:       { stringValue: String(body || '').slice(0, 400) },
    category:   { stringValue: String(category || '') },
  };
  // Cascade-delete key. When sourceId is set (chat message id, typically),
  // the /api/delete-by-source endpoint can later find and delete every
  // pending_nav row that originated from this source, across all tokens.
  if (sourceId) fields.source_id = { stringValue: String(sourceId).slice(0, 200) };
  // Optional attached photo (base64 data URI). Inbox card renders this
  // when present. Already size-validated by the caller.
  if (imageDataUrl) fields.image_data_url = { stringValue: imageDataUrl };
  // POST to the collection endpoint → Firestore auto-generates a doc ID.
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`pending_nav write ${resp.status}: ${text.slice(0,120)}`);
  }
}

// Delete notification_tokens docs whose FCM tokens returned UNREGISTERED.
// Firestore REST ":commit" with delete operations — one round-trip deletes
// the whole batch. We don't care about per-doc failures; pruning is best-effort.
async function pruneDeadTokens({ projectId, accessToken, docIds }) {
  if (!docIds.length) return;
  const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const writes = docIds.map(id => ({
    delete: `projects/${projectId}/databases/(default)/documents/notification_tokens/${id}`,
  }));
  await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
}

// Write a compact record of every push attempt to the push_log collection.
// Lets Adam audit delivery from the admin UI: "why didn't Mike get that push?"
async function logPush({ projectId, accessToken, title, body, category, team, teams, adminOnly, sent, failed, total, pruned, note, sampleErrors }) {
  try {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/push_log`;
    const nowIso = new Date().toISOString();
    const fields = {
      timestamp: { timestampValue: nowIso },
      title: { stringValue: String(title || '').slice(0, 200) },
      body: { stringValue: String(body || '').slice(0, 400) },
      category: { stringValue: String(category || '') },
      sent: { integerValue: String(sent || 0) },
      failed: { integerValue: String(failed || 0) },
      total: { integerValue: String(total || 0) },
    };
    if (typeof pruned === 'number') fields.pruned = { integerValue: String(pruned) };
    if (team) fields.team = { stringValue: String(team) };
    if (Array.isArray(teams) && teams.length) {
      fields.teams = { arrayValue: { values: teams.map(t => ({ stringValue: String(t) })) } };
    }
    if (adminOnly) fields.adminOnly = { booleanValue: true };
    if (note) fields.note = { stringValue: String(note).slice(0, 200) };
    if (Array.isArray(sampleErrors) && sampleErrors.length) {
      fields.sampleErrors = { arrayValue: { values: sampleErrors.map(e => ({ stringValue: String(e).slice(0, 300) })) } };
    }
    await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
  } catch(e) {
    console.warn('logPush failed:', e.message);
  }
}
