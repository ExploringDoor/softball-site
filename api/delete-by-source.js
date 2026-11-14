// Vercel Serverless Function — /api/delete-by-source
//
// Deletes a chat message and/or every pending_nav (inbox) item its push
// created, league-wide. Clients cannot delete either directly any more for
// single messages; this endpoint checks who is asking with the service
// account.
//
// Auth: `Authorization: Bearer <Firebase ID token>`.
// Body, one of:
//   { collection: 'team_messages'|'captain_chat', id }  delete the message
//       AND its inbox items. Allowed: the admin; the message's sender_uid
//       (team_messages) / author_uid (captain_chat); for team_messages also a
//       captain of its team_id. If the message is already gone, the
//       {sourceId} rules below apply to the inbox cascade.
//   { sourceId }  inbox cascade only. If a team_messages / captain_chat doc
//       with that id still exists, the same message rules apply; if it no
//       longer exists: the admin, any captain, or the user who sent the push
//       (every pending_nav item carries sender_uid == caller).

import { cors, rateLimited, requireUser, getRoles, fsGet, fsQuery, fsCommit, fsDelete, body as readBody } from './_lib/dvsl.js';

const fail = (res, status, error, message) => res.status(status).json({ error, message });
const ID_RE = /^[A-Za-z0-9_\-]{1,200}$/;
const COLLECTIONS = { team_messages: 'team', captain_chat: 'captain' };

// Pure permission check. msg = { kind:'team'|'captain', doc } or null; items = pending_nav rows.
// Mirrors the Firestore delete rules: team_messages admin | captain of its
// team | own sender_uid; captain_chat admin | own author_uid.
export function mayCascade(uid, roles, msg, items) {
  if (roles.admin) return true;
  if (msg) {
    const d = msg.doc || {};
    if (msg.kind === 'team') return (!!d.sender_uid && d.sender_uid === uid) || (!!d.team_id && roles.captain_teams.includes(d.team_id));
    return !!d.author_uid && d.author_uid === uid;
  }
  if (roles.captain_teams.length) return true;
  return items.length > 0 && items.every(r => r.sender_uid === uid);
}

async function deleteItems(items) {
  for (let i = 0; i < items.length; i += 400) {
    await fsCommit(items.slice(i, i + 400).map(r => ({ delete: `pending_nav/${r.id}` })));
  }
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const user = await requireUser(req, res);
  if (!user) return;
  if (rateLimited('dbs:' + user.uid, 30, 60000)) return fail(res, 429, 'rate-limited', 'Too many requests. Please wait a minute.');

  const b = readBody(req);
  const msgMode = b.collection !== undefined;
  let sourceId, collection = null;
  if (msgMode) {
    if (!Object.prototype.hasOwnProperty.call(COLLECTIONS, b.collection)) return fail(res, 400, 'bad-request', 'collection must be team_messages or captain_chat');
    if (typeof b.id !== 'string' || !ID_RE.test(b.id)) return fail(res, 400, 'bad-request', 'id required');
    collection = b.collection;
    sourceId = b.id;
  } else {
    sourceId = b.sourceId;
    if (typeof sourceId !== 'string' || !ID_RE.test(sourceId)) return fail(res, 400, 'bad-request', 'sourceId required');
  }

  try {
    const [roles, tm, cc, items] = await Promise.all([
      getRoles(user.uid),
      collection === 'captain_chat' ? null : fsGet(`team_messages/${sourceId}`),
      collection === 'team_messages' ? null : fsGet(`captain_chat/${sourceId}`),
      fsQuery('pending_nav', [['source_id', '==', sourceId]], { limit: 500 }),
    ]);
    const msg = tm ? { kind: 'team', doc: tm, path: `team_messages/${sourceId}` }
      : (cc ? { kind: 'captain', doc: cc, path: `captain_chat/${sourceId}` } : null);

    if (!msg && !items.length) return res.status(200).json({ ok: true, deleted: 0, messageDeleted: false });
    if (!mayCascade(user.uid, roles, msg, items)) {
      return fail(res, 403, 'forbidden', msgMode ? 'You can only delete your own messages.' : 'You can only clear notifications for your own messages.');
    }
    let messageDeleted = false;
    if (msgMode && msg) {
      await fsDelete(msg.path);
      messageDeleted = true;
    }
    await deleteItems(items);
    return res.status(200).json({ ok: true, deleted: items.length, messageDeleted });
  } catch (e) {
    console.error('delete-by-source failed:', e.message);
    return fail(res, 503, 'unavailable', 'Could not delete that. Please try again.');
  }
}
