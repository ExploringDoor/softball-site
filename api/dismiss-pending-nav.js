// Vercel Serverless Function — /api/dismiss-pending-nav
//
// Deletes one (or all) pending_nav docs for this device token, when the user
// taps an inbox item or dismisses it.
//
// Request body: { token, id?: string, dismissAll?: boolean, idToken?: string }
// The item must belong to this token (token_hash check). When any
// subscription doc for the token is linked to an account (auth_uid), the caller must also be
// that account: `Authorization: Bearer <ID token>`, or `idToken` in the body
// (navigator.sendBeacon cannot set headers).

import { cors, rateLimited, clientIp, fsGet, fsQuery, fsCommit, fsDelete, sha256hex, body as readBody } from './_lib/dvsl.js';
import { isValidFcmToken, findTokenDocs, tokenOwner, callerFrom } from './_lib/push.js';

const fail = (res, status, error, message) => res.status(status).json({ error, message });
const ID_RE = /^[A-Za-z0-9_\-]{1,200}$/;

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (rateLimited('pdis:' + clientIp(req), 60, 60000)) return fail(res, 429, 'rate-limited', 'Too many requests.');
  if (!process.env.FCM_SERVICE_ACCOUNT_JSON) return fail(res, 503, 'not-configured', 'Notifications are not set up on the server.');

  const b = readBody(req);
  const { token, id, dismissAll } = b;
  if (!isValidFcmToken(token)) return fail(res, 400, 'bad-token', 'token required');
  if (!dismissAll && !(typeof id === 'string' && ID_RE.test(id))) return fail(res, 400, 'bad-request', 'id or dismissAll required');
  const tokenHash = sha256hex(token);

  try {
    const owner = tokenOwner(await findTokenDocs(token));
    if (owner) {
      let user;
      try { user = await callerFrom(req, b); }
      catch (e) { return fail(res, 503, 'unavailable', 'Could not check your sign in. Please try again.'); }
      if (!user || user.uid !== owner) return fail(res, 401, 'sign-in-required', 'Sign in on this device to manage its notifications.');
    }

    if (dismissAll) {
      const rows = await fsQuery('pending_nav', [['token_hash', '==', tokenHash]], { limit: 300 });
      if (rows.length) await fsCommit(rows.map(r => ({ delete: `pending_nav/${r.id}` })));
      return res.status(200).json({ ok: true, deleted: rows.length });
    }

    const item = await fsGet(`pending_nav/${id}`);
    if (!item) return res.status(200).json({ ok: true, note: 'already deleted' });
    if (item.token_hash !== tokenHash) return fail(res, 403, 'token-mismatch', 'That notification belongs to another device.');
    await fsDelete(`pending_nav/${id}`);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('dismiss-pending-nav failed:', e.message);
    return fail(res, 503, 'unavailable', 'Could not update notifications. Please try again.');
  }
}
