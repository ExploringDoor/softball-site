// Vercel Serverless Function — /api/check-pending-nav
//
// The inbox badge (every page) and the inbox list call this with the
// device's FCM token. Returns the unread pending_nav items for that token,
// newest first (max 20), plus `count`.
//
// Privacy gate: when any subscription doc for the token (the canonical one
// or a legacy copy) is linked to an account (auth_uid), the item contents are returned only to that account, proven by
// `Authorization: Bearer <ID token>` (or `idToken` in the body, for callers
// that cannot set headers). Otherwise the items come back as content-free
// stubs (`locked: true`) so the badge count still works but nothing private
// leaks to someone who only holds the token.
//
// Reading is non-destructive; /api/dismiss-pending-nav consumes items. Items
// older than 24h are swept here.

import { cors, rateLimited, clientIp, fsQuery, fsCommit, sha256hex, body as readBody } from './_lib/dvsl.js';
import { isValidFcmToken, findTokenDocs, tokenOwner, callerFrom } from './_lib/push.js';

const STALE_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS = 20;
const fail = (res, status, error, message) => res.status(status).json({ error, message, items: [], count: 0 });

export function lockedStub(it) {
  return {
    id: it.id, ts: it.ts, ageMs: it.ageMs, locked: true,
    url: '/inbox.html', title: 'New notification', body: 'Sign in on this device to read it.',
    category: '', sender_role: '', image_data_url: '',
  };
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (rateLimited('pnav:' + clientIp(req), 120, 60000)) return fail(res, 429, 'rate-limited', 'Too many requests.');
  if (!process.env.FCM_SERVICE_ACCOUNT_JSON) return fail(res, 503, 'not-configured', 'Notifications are not set up on the server.');

  const b = readBody(req);
  const token = b.token;
  if (!isValidFcmToken(token)) return fail(res, 400, 'bad-token', 'token required');
  const tokenHash = sha256hex(token);

  let docs, rows;
  try {
    [docs, rows] = await Promise.all([
      findTokenDocs(token),
      fsQuery('pending_nav', [['token_hash', '==', tokenHash]], { limit: 100 }),
    ]);
  } catch (e) {
    return fail(res, 503, 'unavailable', 'Could not load notifications.');
  }

  const owner = tokenOwner(docs);
  let unlocked = !owner;
  if (owner) {
    let user = null;
    try { user = await callerFrom(req, b); } catch (_) { user = null; }
    unlocked = !!(user && user.uid === owner);
  }

  const now = Date.now();
  const stale = [];
  let items = [];
  for (const r of rows) {
    const ts = Number(r.ts) || 0;
    const ageMs = ts ? now - ts : -1;
    if (ageMs > STALE_MS || ageMs < 0) { stale.push(r.id); continue; }
    items.push({
      id: r.id,
      url: typeof r.url === 'string' ? r.url : '/',
      ts, ageMs,
      title: typeof r.title === 'string' ? r.title : '',
      body: typeof r.body === 'string' ? r.body : '',
      category: typeof r.category === 'string' ? r.category : '',
      sender_role: typeof r.sender_role === 'string' ? r.sender_role : '',
      image_data_url: typeof r.image_data_url === 'string' ? r.image_data_url : '',
    });
  }
  items.sort((a, b2) => b2.ts - a.ts);
  const count = items.length;
  if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
  if (!unlocked) items = items.map(lockedStub);

  if (stale.length) {
    await fsCommit(stale.slice(0, 400).map(id => ({ delete: `pending_nav/${id}` }))).catch(() => {});
  }
  return res.status(200).json({ ok: true, items, count, locked: !unlocked });
}
