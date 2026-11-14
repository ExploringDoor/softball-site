// Vercel Serverless Function — /api/push-token
// Device push-subscription management. Clients no longer touch the
// notification_tokens collection directly (the rules deny it); everything
// goes through here with the service account.
//
// Proof: possession of the FCM token (it lives only on that device), plus an
// optional `Authorization: Bearer <ID token>` that links the device to the
// signed-in account (auth_uid). The push audience for chat / captain /
// commissioner alerts comes from that account's roles at send time.
//
// Doc id = sha256(token). Token: 100–4096 chars of [A-Za-z0-9_:-].
// POST { action, token, ... }:
//   upsert {categories[], teams[]}  set prefs; with a valid Bearer also link auth_uid
//   get                             → { exists, categories, teams, attached, mine }
//   attach   (Bearer REQUIRED)      auth_uid = caller
//   detach                          remove auth_uid
//   delete                          remove the subscription
// Whenever the linked account changes (attach to someone else, detach,
// delete) the device's inbox (pending_nav) is cleared, so a token that leaked
// can never be used to read the previous owner's notifications.
// Every action first folds legacy auto-id docs for this token into
// notification_tokens/{sha256(token)} and deletes them (lazy migration), so a
// device only ever has one doc and one owner.
// Limits: 30/min per IP; at most 2000 subscription docs (new devices refused
// beyond that); a brand-new token is dry-run with FCM (validate_only) first.

import { cors, rateLimited, clientIp, verifyIdToken, requireUser, fsUpdate, fsSet, fsCommit, fsQuery, body as readBody } from './_lib/dvsl.js';
import { isValidFcmToken, tokenDocId, findTokenDocs, purgePendingNav, countTokenDocs, validateTokenWithFcm } from './_lib/push.js';

const fail = (res, status, error, message) => res.status(status).json({ error, message });
const MAX_DOCS = 2000;
const PREF_RE = /^[A-Za-z0-9_\-]{1,40}$/;

function prefList(a) {
  if (a === undefined || a === null) return [];
  if (!Array.isArray(a) || a.length > 30 || a.some(x => typeof x !== 'string' || !PREF_RE.test(x))) return null;
  return [...new Set(a)];
}

// Optional caller: null when there is no / a bad token or Google is down.
async function optionalUser(req) {
  try { return await verifyIdToken(req); } catch (_) { return null; }
}

// Lazy migration (G3). Returns the canonical doc ({id, ...fields}) or null.
// - canonical missing, legacy copies exist: the first legacy copy's prefs
//   (and the first legacy auth_uid found) become notification_tokens/{id};
// - canonical exists: it wins, legacy copies are just dropped;
// - every legacy copy is then deleted. If a dropped copy named a different
//   owner than the one kept, the device inbox is cleared (it may hold items
//   delivered for that other account).
async function consolidate(token, id) {
  const docs = await findTokenDocs(token);
  let canon = docs.find(d => d.id === id) || null;
  const legacy = docs.filter(d => d.id !== id);
  if (!legacy.length) return canon;
  if (!canon) {
    const src = legacy[0];
    const ownerSrc = legacy.find(d => typeof d.auth_uid === 'string' && d.auth_uid);
    canon = {
      token,
      categories: Array.isArray(src.categories) ? src.categories.filter(x => typeof x === 'string') : [],
      teams: Array.isArray(src.teams) ? src.teams.filter(x => typeof x === 'string') : [],
      timestamp: new Date(),
      ...(ownerSrc ? { auth_uid: ownerSrc.auth_uid } : {}),
    };
    await fsSet(`notification_tokens/${id}`, canon);
    canon = { id, ...canon };
  }
  const kept = typeof canon.auth_uid === 'string' && canon.auth_uid ? canon.auth_uid : null;
  const otherOwner = legacy.some(d => typeof d.auth_uid === 'string' && d.auth_uid && d.auth_uid !== kept);
  await fsCommit(legacy.map(d => ({ delete: `notification_tokens/${d.id}` })));
  if (otherOwner) await purgePendingNav(id);
  return canon;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (rateLimited('ptok:' + clientIp(req), 30, 60000)) return fail(res, 429, 'rate-limited', 'Too many requests. Please wait a minute.');
  if (!process.env.FCM_SERVICE_ACCOUNT_JSON) return fail(res, 503, 'not-configured', 'Notifications are not set up on the server.');

  const b = readBody(req);
  const action = b.action;
  const token = b.token;
  if (!['upsert', 'get', 'attach', 'detach', 'delete'].includes(action)) return fail(res, 400, 'bad-action', 'Unknown action.');
  if (!isValidFcmToken(token)) return fail(res, 400, 'bad-token', 'That device token is not valid. Turn notifications off and on again.');
  const id = tokenDocId(token);

  try {
    if (action === 'get') {
      const [doc, user] = await Promise.all([consolidate(token, id), optionalUser(req)]);
      return res.status(200).json({
        ok: true,
        exists: !!doc,
        categories: (doc && Array.isArray(doc.categories)) ? doc.categories : [],
        teams: (doc && Array.isArray(doc.teams)) ? doc.teams : [],
        attached: !!(doc && doc.auth_uid),
        mine: !!(doc && doc.auth_uid && user && user.uid === doc.auth_uid),
      });
    }

    if (action === 'upsert') {
      const categories = prefList(b.categories);
      const teams = prefList(b.teams);
      if (!categories || !teams) return fail(res, 400, 'bad-prefs', 'Invalid notification choices.');
      const user = await optionalUser(req);
      const doc = await consolidate(token, id);
      if (!doc) {
        if (await countTokenDocs(MAX_DOCS + 1) >= MAX_DOCS) {
          return fail(res, 503, 'full', 'Notification sign-ups are full right now. Please tell the commissioner.');
        }
        if (await validateTokenWithFcm(token) === 'dead') {
          return fail(res, 400, 'bad-token', 'That device token is not valid. Turn notifications off and on again.');
        }
      }
      const fields = { token, categories, teams, timestamp: new Date() };
      if (user) {
        if (doc && doc.auth_uid && doc.auth_uid !== user.uid) await purgePendingNav(id);
        fields.auth_uid = user.uid;
      }
      await fsUpdate(`notification_tokens/${id}`, fields);
      return res.status(200).json({ ok: true, attached: !!(fields.auth_uid || (doc && doc.auth_uid)) });
    }

    if (action === 'attach') {
      const user = await requireUser(req, res);
      if (!user) return;
      const doc = await consolidate(token, id);
      if (!doc) return res.status(200).json({ ok: true, exists: false, attached: false });
      if (doc.auth_uid !== user.uid) {
        if (doc.auth_uid) await purgePendingNav(id);
        await fsUpdate(`notification_tokens/${id}`, { auth_uid: user.uid, timestamp: new Date() }, { mustExist: true });
      }
      return res.status(200).json({ ok: true, exists: true, attached: true });
    }

    if (action === 'detach') {
      const doc = await consolidate(token, id);
      if (!doc) return res.status(200).json({ ok: true, exists: false, attached: false });
      if (doc.auth_uid) {
        await purgePendingNav(id);
        await fsUpdate(`notification_tokens/${id}`, { timestamp: new Date() }, { mustExist: true, remove: ['auth_uid'] });
      }
      return res.status(200).json({ ok: true, exists: true, attached: false });
    }

    // delete
    const rows = await fsQuery('notification_tokens', [['token', '==', token]], { limit: 20 });
    const ids = [...new Set([id, ...rows.map(r => r.id)])];
    await fsCommit(ids.map(x => ({ delete: `notification_tokens/${x}` })));
    await purgePendingNav(id);
    return res.status(200).json({ ok: true, deleted: true });
  } catch (e) {
    console.error('push-token failed:', action, e.message);
    return fail(res, 503, 'unavailable', 'Could not update notifications. Please try again.');
  }
}
