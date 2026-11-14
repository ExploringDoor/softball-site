// Push fan-out core for the DVSL api/ functions (2026-11 security lockdown).
//
// sendPush() is the ONE place that decides who receives a push. It is called
// by api/send-notification.js (after that endpoint has checked the caller's
// permissions) and in-process by api/account.js / api/register.js for admin
// alerts. sendPush itself does NOT check permissions: callers must.
//
// Audience is decided from roles/{uid} at send time (the same doc the
// Firestore rules trust), never from flags stored on the token doc. The old
// token fields (is_admin, is_captain_authed, authed_teams, player_id) are
// ignored. adminOnly pushes reach a device only when its account has
// roles.admin AND its categories are empty or include 'admin'.

import {
  PROJECT, MESSAGING, svcToken, fsCreate, fsCommit, fsGet, fsQuery,
  dec, normalizeRoles, sha256hex, verifyIdToken,
} from './dvsl.js';

const DATASTORE = 'https://www.googleapis.com/auth/datastore';
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const FS = `https://firestore.googleapis.com/v1/${DOCS}`;
const FCM_SEND = `https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`;

export const CATEGORIES = [
  'scores', 'rainouts', 'schedule', 'playoffs', 'team_chat', 'captains_chat',
  'announcements', 'photos', 'admin', 'live', 'pregame',
];
export const TITLE_MAX = 120;
export const BODY_MAX = 400;
export const IMAGE_MAX = 900_000; // data URI length; keeps pending_nav under 1MB
const MAX_TOKEN_PAGES = 20;       // 20 x 300 = 6000 docs, well over the 2000 cap
const SEND_CONCURRENCY = 25;

// ─── Token helpers ────────────────────────────────────────────────────────
const TOKEN_RE = /^[A-Za-z0-9_:\-]+$/;
export function isValidFcmToken(t) {
  return typeof t === 'string' && t.length >= 100 && t.length <= 4096 && TOKEN_RE.test(t);
}
export const tokenDocId = (token) => sha256hex(token);

// The token's subscription doc: notification_tokens/{sha256(token)}, or a
// legacy auto-id doc found by its token field (before migration M4).
export async function findTokenDoc(token) {
  const byId = await fsGet(`notification_tokens/${tokenDocId(token)}`);
  if (byId) return byId;
  const rows = await fsQuery('notification_tokens', [['token', '==', token]], { limit: 5 });
  return rows[0] || null;
}

// Every doc for this token: the canonical notification_tokens/{sha256} first
// (when it exists), then any legacy auto-id copies.
export async function findTokenDocs(token) {
  const id = tokenDocId(token);
  const [byId, rows] = await Promise.all([
    fsGet(`notification_tokens/${id}`),
    fsQuery('notification_tokens', [['token', '==', token]], { limit: 20 }),
  ]);
  return [...(byId ? [byId] : []), ...rows.filter(r => r.id !== id)];
}

// The account a device belongs to: the first auth_uid among its docs
// (canonical first). A device counts as owned if ANY copy is linked, so a
// stale legacy copy can never make a linked device's inbox readable.
export function tokenOwner(docs) {
  for (const d of docs || []) {
    if (d && typeof d.auth_uid === 'string' && d.auth_uid) return d.auth_uid;
  }
  return null;
}

// The caller's account from `Authorization: Bearer`, or (fallback) an
// `idToken` body field for navigator.sendBeacon, which cannot set headers.
// Same return / throw contract as verifyIdToken.
export async function callerFrom(req, b = {}) {
  if (!/^Bearer .+$/.test((req.headers && req.headers.authorization) || '') && typeof b.idToken === 'string' && b.idToken && b.idToken.length < 8192) {
    return verifyIdToken({ headers: { authorization: 'Bearer ' + b.idToken } });
  }
  return verifyIdToken(req);
}

// Delete every pending_nav doc for this token (its inbox). Used when the
// device's owner changes so a new owner never reads the previous one's items.
export async function purgePendingNav(tokenHash) {
  let total = 0;
  for (let round = 0; round < 10; round++) {
    const rows = await fsQuery('pending_nav', [['token_hash', '==', tokenHash]], { limit: 300 });
    if (!rows.length) break;
    await fsCommit(rows.map(r => ({ delete: `pending_nav/${r.id}` })));
    total += rows.length;
    if (rows.length < 300) break;
  }
  return total;
}

// ─── Small value helpers ─────────────────────────────────────────────────
const CTRL_G = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g; // strip
const CTRL_1 = /[\u0000-\u001F\u007F]/;                               // test (no /g: .test() would keep state)
export function clip(s, max) {
  const t = String(s == null ? '' : s).replace(CTRL_G, '').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}
const strList = (a, max = 30) => (Array.isArray(a) ? a : [])
  .filter(x => typeof x === 'string' && x)
  .slice(0, max);

// Deep links must stay on this site. A relative path ('/x', '/#game/1') is
// always fine; absolute https URLs only when allowExternal (admin sends).
export function safeUrl(url, { allowExternal = false } = {}) {
  if (typeof url !== 'string' || !url || url.length > 500 || CTRL_1.test(url) || /\s/.test(url)) return '/';
  if (url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\')) return url;
  if (/^https:\/\/dvsl\.vercel\.app(\/|$)/.test(url)) return url;
  if (allowExternal && /^https:\/\/[A-Za-z0-9.-]+(\/|$|\?|#)/.test(url)) return url;
  return '/';
}

// ─── Audience ────────────────────────────────────────────────────────────
// Pure: given token docs ({id, token, categories, teams, auth_uid})
// and a Map uid -> roles, return the docs that should receive this push.
export function selectRecipients(tokens, rolesByUid, opts) {
  const category = opts.category;
  const adminOnly = !!opts.adminOnly || category === 'admin';
  const teamWanted = strList(opts.teams);
  const excludeIds = strList(opts.excludePlayerIds, 500);
  const rosterOnly = !!opts.rosterOnly;
  const excludeToken = opts.excludeToken || null;
  // When a device has its canonical doc (id = sha256(token)), only that doc
  // counts: legacy copies may carry a stale owner or stale prefs.
  const hasCanonical = new Set();
  for (const t of tokens) {
    if (t && typeof t.token === 'string' && t.token && t.id === tokenDocId(t.token)) hasCanonical.add(t.token);
  }
  const seen = new Set();
  const out = [];
  for (const t of tokens) {
    const tok = t && t.token;
    if (typeof tok !== 'string' || !tok) continue;
    if (excludeToken && tok === excludeToken) continue;
    if (seen.has(tok)) continue; // legacy + re-keyed copies of one device
    if (hasCanonical.has(tok) && t.id !== tokenDocId(tok)) continue;
    const uid = typeof t.auth_uid === 'string' && t.auth_uid ? t.auth_uid : null;
    const roles = uid ? (rolesByUid.get(uid) || normalizeRoles(null)) : null;
    const cats = strList(t.categories, 100);
    const tokTeams = strList(t.teams, 100);

    if (adminOnly) {
      if (!roles || !roles.admin) continue;
      const optedIn = cats.length === 0 || cats.includes('admin');
      if (!optedIn) continue;
    } else {
      if (cats.length && !cats.includes(category)) continue;
      if (category === 'team_chat') {
        if (!roles || !teamWanted.length) continue;
        if (!teamWanted.some(x => roles.member_teams.includes(x))) continue;
      } else if (category === 'captains_chat') {
        if (!roles || !roles.captain_teams.length) continue;
      } else if (teamWanted.length && tokTeams.length && !teamWanted.some(x => tokTeams.includes(x))) {
        continue; // empty on either side = "all teams"
      }
    }
    if (rosterOnly && (!roles || !roles.player_ids.length)) continue;
    if (excludeIds.length && roles && roles.player_ids.some(p => excludeIds.includes(p))) continue;
    seen.add(tok);
    out.push(t);
  }
  return out;
}

// Does this push need anyone's roles? (Skips the roles reads for plain
// score / schedule broadcasts.)
function needsRoles(opts) {
  return !!(opts.adminOnly || opts.category === 'admin' || opts.category === 'team_chat'
    || opts.category === 'captains_chat' || opts.rosterOnly
    || (Array.isArray(opts.excludePlayerIds) && opts.excludePlayerIds.length));
}

// ─── Firestore reads (service account, raw REST for list / batchGet) ─────
async function rawFetch(url, init = {}) {
  const tok = await svcToken([DATASTORE]);
  return fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(8000),
  });
}
function docObj(d) {
  const o = { id: String(d.name || '').split('/').pop() };
  for (const [k, f] of Object.entries(d.fields || {})) o[k] = dec(f);
  return o;
}

// Every notification_tokens doc (paginated).
export async function listAllTokens() {
  const out = [];
  let pageToken = '';
  for (let i = 0; i < MAX_TOKEN_PAGES; i++) {
    const qs = `pageSize=300${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
    const r = await rawFetch(`${FS}/notification_tokens?${qs}`);
    if (!r.ok) throw new Error('list tokens ' + r.status);
    const d = await r.json();
    for (const doc of d.documents || []) out.push(docObj(doc));
    if (!d.nextPageToken) break;
    pageToken = d.nextPageToken;
  }
  return out;
}

// How many notification_tokens docs exist (aggregation count, capped).
export async function countTokenDocs(upTo = 5000) {
  const r = await rawFetch(`${FS}:runAggregationQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredAggregationQuery: {
        structuredQuery: { from: [{ collectionId: 'notification_tokens' }] },
        aggregations: [{ alias: 'n', count: { upTo } }],
      },
    }),
  });
  if (!r.ok) throw new Error('count tokens ' + r.status);
  const rows = await r.json();
  const f = rows && rows[0] && rows[0].result && rows[0].result.aggregateFields && rows[0].result.aggregateFields.n;
  return Number(f ? f.integerValue : 0);
}

// roles/{uid} for many uids → Map uid -> normalized roles (missing = none).
export async function getRolesMany(uids) {
  const list = [...new Set(uids.filter(u => typeof u === 'string' && /^[A-Za-z0-9_\-]{1,128}$/.test(u)))];
  const map = new Map();
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const r = await rawFetch(`${FS}:batchGet`, {
      method: 'POST',
      body: JSON.stringify({ documents: chunk.map(u => `${DOCS}/roles/${u}`) }),
    });
    if (!r.ok) throw new Error('roles batchGet ' + r.status);
    for (const row of await r.json()) {
      if (row.found) {
        const o = docObj(row.found);
        map.set(o.id, normalizeRoles(o));
      }
    }
  }
  for (const u of list) if (!map.has(u)) map.set(u, normalizeRoles(null));
  return map;
}

// ─── FCM ─────────────────────────────────────────────────────────────────
// Returns { ok:true, name } or { ok:false, httpStatus, status, errorCode, message }.
async function fcmSend(accessToken, token, { title, body, url }, { validateOnly = false } = {}) {
  // Data-only message: sw.js shows the notification itself (iOS PWA needs
  // the high Urgency header or it drops the push).
  const message = {
    token,
    data: { title: String(title || 'DVSL'), body: String(body || ''), url: String(url || '/') },
    webpush: { headers: { Urgency: 'high', TTL: '86400' } },
  };
  let r;
  try {
    r = await fetch(FCM_SEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify(validateOnly ? { message, validate_only: true } : { message }),
    });
  } catch (e) {
    return { ok: false, httpStatus: 0, status: 'NETWORK', errorCode: '', message: String(e.message || e) };
  }
  if (r.ok) {
    const d = await r.json().catch(() => ({}));
    return { ok: true, name: d.name || null };
  }
  const j = await r.json().catch(() => ({}));
  const err = j.error || {};
  const fcmDetail = (err.details || []).find(x => x && x.errorCode) || {};
  return {
    ok: false, httpStatus: r.status, status: err.status || '',
    errorCode: fcmDetail.errorCode || '', message: String(err.message || '').slice(0, 300),
  };
}

// Is this failure "the device is gone / the token is junk" (prune it)?
// INVALID_ARGUMENT also covers payload mistakes on OUR side, so it only
// counts when FCM says the registration token itself is the problem.
export function isDeadTokenError(e) {
  if (!e || e.ok) return false;
  if (e.errorCode === 'UNREGISTERED') return true;
  if (e.httpStatus === 404 || e.status === 'NOT_FOUND') return true;
  if ((e.status === 'INVALID_ARGUMENT' || e.errorCode === 'INVALID_ARGUMENT') && /registration token/i.test(e.message || '')) return true;
  return false;
}

// Dry-run a token with FCM (validate_only). Returns 'ok' | 'dead' | 'unknown'.
export async function validateTokenWithFcm(token) {
  try {
    const at = await svcToken([MESSAGING, DATASTORE]);
    const r = await fcmSend(at, token, { title: 'DVSL', body: '', url: '/' }, { validateOnly: true });
    if (r.ok) return 'ok';
    return isDeadTokenError(r) ? 'dead' : 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  });
  await Promise.all(workers);
  return out;
}

// ─── The fan-out ─────────────────────────────────────────────────────────
// sendPush({ title, body, category, teams=[], url='/', adminOnly=false,
//            rosterOnly=false, excludeToken, excludePlayerIds=[], sourceId,
//            imageDataUrl, gameId }, { senderRole='system', senderUid })
//   → { sent, failed, total, pruned }
export async function sendPush(opts = {}, { senderRole = 'system', senderUid = null } = {}) {
  const category = CATEGORIES.includes(opts.category) ? opts.category : null;
  if (!category) throw new Error('unknown category');
  const title = clip(opts.title, TITLE_MAX) || 'DVSL';
  const body = clip(opts.body, BODY_MAX);
  const url = safeUrl(opts.url || '/', { allowExternal: senderRole === 'admin' });
  const teams = strList(opts.teams);
  const adminOnly = !!opts.adminOnly || category === 'admin';
  const sourceId = typeof opts.sourceId === 'string' && /^[A-Za-z0-9_\-]{1,200}$/.test(opts.sourceId) ? opts.sourceId : null;
  const image = typeof opts.imageDataUrl === 'string' && opts.imageDataUrl.startsWith('data:image/')
    && opts.imageDataUrl.length <= IMAGE_MAX ? opts.imageDataUrl : null;
  const role = ['admin', 'captain', 'member', 'system'].includes(senderRole) ? senderRole : 'system';
  const sel = {
    category, teams, adminOnly,
    rosterOnly: !!opts.rosterOnly,
    excludeToken: typeof opts.excludeToken === 'string' ? opts.excludeToken : null,
    excludePlayerIds: strList(opts.excludePlayerIds, 500),
  };

  const tokens = await listAllTokens();
  const rolesByUid = needsRoles(sel)
    ? await getRolesMany(tokens.map(t => t.auth_uid).filter(Boolean))
    : new Map();
  const recipients = selectRecipients(tokens, rolesByUid, sel);

  const logBase = {
    timestamp: new Date(), title, body, category, sender_role: role,
    ...(teams.length ? { teams } : {}),
    ...(adminOnly ? { adminOnly: true } : {}),
    ...(typeof opts.gameId === 'string' && opts.gameId ? { game_id: opts.gameId.slice(0, 200) } : {}),
    ...(senderUid ? { sender_uid: senderUid } : {}),
  };
  if (!recipients.length) {
    await fsCreate('push_log', { ...logBase, sent: 0, failed: 0, total: 0, pruned: 0, note: 'No matching subscribers' }).catch(() => {});
    return { sent: 0, failed: 0, total: 0, pruned: 0 };
  }

  const accessToken = await svcToken([MESSAGING, DATASTORE]);
  const results = await pool(recipients, SEND_CONCURRENCY, async (row) => {
    // pending_nav first, so the inbox already has the item when the banner
    // is tapped. A failed write never blocks the push.
    try {
      await fsCreate('pending_nav', {
        token_hash: sha256hex(row.token),
        url, ts: Date.now(), title, body, category,
        sender_role: role,
        ...(senderUid ? { sender_uid: senderUid } : {}),
        ...(sourceId ? { source_id: sourceId } : {}),
        ...(image ? { image_data_url: image } : {}),
      });
    } catch (_) { /* best effort */ }
    const r = await fcmSend(accessToken, row.token, { title, body, url });
    return { row, r };
  });

  const sent = results.filter(x => x.r.ok).length;
  const failed = results.length - sent;
  let deadRows = results.filter(x => isDeadTokenError(x.r) && x.row.id).map(x => x.row);
  let note;
  // Safety valve: if every single send failed, the problem is more likely
  // ours (credentials, payload) than every device at once. Don't prune.
  if (sent === 0 && results.length >= 5 && deadRows.length) { note = `skipped pruning ${deadRows.length}: every send failed`; deadRows = []; }
  let pruned = 0;
  if (deadRows.length) {
    try {
      for (let i = 0; i < deadRows.length; i += 400) {
        await fsCommit(deadRows.slice(i, i + 400).map(row => ({ delete: `notification_tokens/${row.id}` })));
      }
      pruned = deadRows.length;
      // A pruned device has no subscription doc, so its inbox would read as
      // unlocked: clear it (including the item just written above).
      const hashes = [...new Set(deadRows.map(row => sha256hex(row.token)))];
      await pool(hashes, 10, h => purgePendingNav(h).catch(() => 0));
    } catch (e) { console.warn('prune failed:', e.message); }
  }
  const sampleErrors = results.filter(x => !x.r.ok).slice(0, 3)
    .map(x => `${x.r.httpStatus} ${x.r.status} ${x.r.errorCode} ${x.r.message}`.slice(0, 300));
  await fsCreate('push_log', {
    ...logBase, sent, failed, total: results.length, pruned,
    ...(sampleErrors.length ? { sampleErrors } : {}),
    ...(note ? { note } : {}),
  }).catch(() => {});
  return { sent, failed, total: results.length, pruned };
}
