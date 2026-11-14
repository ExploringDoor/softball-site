// Shared server helpers for the DVSL api/ functions (2026-11 security lockdown).
//
// Lives in api/_lib so Vercel does not turn it into a route. Import it with
// `import { ... } from './_lib/dvsl.js'` (verified on a preview deploy).
//
// Security model in one paragraph: the Firestore rules trust exactly one
// thing, roles/{uid}, and only this server (service account) or an admin can
// write it. Every endpoint below proves WHO is calling with a Firebase ID token
// (verifyIdToken), then decides WHAT they may do from getRoles(uid). Never
// trust a role, team, or uid that arrives in the request body.

import crypto from 'crypto';

export const PROJECT = process.env.FCM_PROJECT_ID || 'dvsl-292dd';
// Public web key (the same one config.js ships to every browser). Only used
// for Identity Toolkit token lookups, which validate the caller's ID token.
export const FB_WEB_KEY = 'AIzaSyDXuC-R0aPEX4F7lN5AKq48UC3r5whYzdg';
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const FS = `https://firestore.googleapis.com/v1/${DOCS}`;

// ─── CORS, method, origin ─────────────────────────────────────────────────
// Production, the old alias, this project's own preview deployments, and
// local dev. Origin is not authentication (curl can send anything); it only
// stops drive-by use from other websites. Real auth is the ID token.
const PROD_ORIGINS = new Set(['https://dvsl.vercel.app', 'https://softball-site.vercel.app']);
const PREVIEW_RE = /^https:\/\/softball-site-[a-z0-9-]+-adammiller22-4647s-projects\.vercel\.app$/;
const LOCAL_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
export function originAllowed(o) {
  return !!o && (PROD_ORIGINS.has(o) || PREVIEW_RE.test(o) || LOCAL_RE.test(o));
}

// Sets CORS headers and answers OPTIONS / wrong methods.
// Returns true when the response has already been sent.
export function cors(req, res, { methods = ['POST'] } = {}) {
  const o = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', originAllowed(o) ? o : 'https://dvsl.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  if (!methods.includes(req.method)) { res.status(405).json({ error: 'Method not allowed' }); return true; }
  return false;
}

// 403 for requests whose Origin isn't ours. Returns true when it responded.
export function rejectForeignOrigin(req, res) {
  if (originAllowed(req.headers.origin || '')) return false;
  res.status(403).json({ error: 'Forbidden' });
  return true;
}

// ─── Rate limiting ────────────────────────────────────────────────────────
// Per warm instance only (resets on cold start). Good for bursts; pair it
// with dailyCount() for a durable ceiling.
const _hits = new Map();
export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}
export function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const arr = (_hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  _hits.set(key, arr);
  if (_hits.size > 5000) _hits.clear();
  return arr.length > max;
}

// ─── Who is calling ───────────────────────────────────────────────────────
// Validates `Authorization: Bearer <Firebase ID token>` with Identity Toolkit.
// Returns { uid, email (lowercased), emailVerified } or null when missing /
// invalid / disabled. Throws when Google is unreachable, so the caller can
// answer 503 instead of wrongly treating the user as signed out.
export async function verifyIdToken(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FB_WEB_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://dvsl.vercel.app/' },
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ idToken: m[1] }),
  });
  if (r.status >= 500) throw new Error('lookup ' + r.status);
  if (!r.ok) return null;
  const u = ((await r.json()).users || [])[0];
  if (!u || !u.localId || u.disabled || !u.email) return null;
  return { uid: u.localId, email: String(u.email).trim().toLowerCase(), emailVerified: !!u.emailVerified };
}

// Convenience: verify or answer 401/503. Returns the user or null (responded).
export async function requireUser(req, res) {
  let user;
  try { user = await verifyIdToken(req); }
  catch (e) { res.status(503).json({ error: 'Could not check your sign in. Please try again.' }); return null; }
  if (!user) { res.status(401).json({ error: 'Please sign in again.' }); return null; }
  return user;
}

// ─── Service account (bypasses Firestore rules) ───────────────────────────
const DATASTORE = 'https://www.googleapis.com/auth/datastore';
export const MESSAGING = 'https://www.googleapis.com/auth/firebase.messaging';
const _svc = new Map(); // scope string -> { tok, exp }
export async function svcToken(scopes = [DATASTORE]) {
  const key = scopes.join(' ');
  const hit = _svc.get(key);
  if (hit && Date.now() < hit.exp) return hit.tok;
  const svc = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON || '{}');
  if (!svc.client_email || !svc.private_key) throw new Error('service account not configured');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: svc.client_email, scope: key, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(svc.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(5000),
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${sig}`,
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(d.error_description || 'no access token');
  _svc.set(key, { tok: d.access_token, exp: Date.now() + 50 * 60 * 1000 });
  return d.access_token;
}

// ─── Firestore REST (service account) ────────────────────────────────────
// Values: JS primitives/arrays/objects. Dates encode as timestamps; to write a
// timestamp from an ISO string use { __ts: '2026-…Z' }. Decoded timestamps
// come back as ISO strings.
export function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') {
    if (typeof v.__ts === 'string') return { timestampValue: v.__ts };
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, enc(x)])) } };
  }
  throw new Error('cannot encode ' + typeof v);
}
export function dec(f) {
  if (!f || typeof f !== 'object') return undefined;
  if ('nullValue' in f) return null;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('stringValue' in f) return f.stringValue;
  if ('timestampValue' in f) return f.timestampValue;
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(dec);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  if ('referenceValue' in f) return f.referenceValue;
  if ('geoPointValue' in f) return f.geoPointValue;
  if ('bytesValue' in f) return f.bytesValue;
  return undefined;
}
function docToObj(doc) {
  const o = { id: doc.name.split('/').pop() };
  for (const [k, f] of Object.entries(doc.fields || {})) o[k] = dec(f);
  return o;
}
function encFields(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => [k, enc(v)]));
}
const fieldPath = (k) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : '`' + k.replace(/`/g, '\\`') + '`');
async function fsFetch(url, init = {}) {
  const tok = await svcToken();
  return fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(8000),
  });
}
async function ok(r, what) {
  if (r.ok) return r;
  const t = await r.text().catch(() => '');
  throw new Error(`${what} ${r.status}: ${t.slice(0, 200)}`);
}
const pathOk = (p) => {
  if (typeof p !== 'string' || !/^[A-Za-z0-9_\-]+(\/[A-Za-z0-9_\-]+)*$/.test(p)) throw new Error('bad path');
  return p;
};

// Get one doc by "collection/id" → object or null.
export async function fsGet(path) {
  const r = await fsFetch(`${FS}/${pathOk(path)}`);
  if (r.status === 404) return null;
  await ok(r, 'get');
  return docToObj(await r.json());
}

// Query one collection. where: [[field, op, value], ...] with op in
// '==', '!=', '<', '<=', '>', '>=', 'in', 'array-contains', 'array-contains-any'.
const OPS = { '==': 'EQUAL', '!=': 'NOT_EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL', '>': 'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL', 'in': 'IN', 'array-contains': 'ARRAY_CONTAINS', 'array-contains-any': 'ARRAY_CONTAINS_ANY' };
export async function fsQuery(collectionId, where = [], { limit, orderBy } = {}) {
  const filters = where.map(([field, op, value]) => ({ fieldFilter: { field: { fieldPath: field }, op: OPS[op], value: enc(value) } }));
  const q = { from: [{ collectionId }] };
  if (filters.length === 1) q.where = filters[0];
  if (filters.length > 1) q.where = { compositeFilter: { op: 'AND', filters } };
  if (orderBy) q.orderBy = [{ field: { fieldPath: orderBy[0] }, direction: orderBy[1] === 'desc' ? 'DESCENDING' : 'ASCENDING' }];
  if (limit) q.limit = limit;
  const r = await fsFetch(`${FS}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery: q }) });
  await ok(r, 'query');
  return (await r.json()).filter(x => x.document).map(x => docToObj(x.document));
}

// Create with an auto id → new id.
export async function fsCreate(collectionId, obj) {
  const r = await fsFetch(`${FS}/${pathOk(collectionId)}`, { method: 'POST', body: JSON.stringify({ fields: encFields(obj) }) });
  await ok(r, 'create');
  return (await r.json()).name.split('/').pop();
}

// Replace the whole doc (creates it if missing).
export async function fsSet(path, obj) {
  const r = await fsFetch(`${FS}/${pathOk(path)}`, { method: 'PATCH', body: JSON.stringify({ fields: encFields(obj) }) });
  await ok(r, 'set');
}

// Merge the given fields into a doc. mustExist:true fails if it's missing.
// Fields listed in `remove` are deleted.
export async function fsUpdate(path, obj = {}, { mustExist = false, remove = [] } = {}) {
  const keys = [...Object.keys(obj).filter(k => obj[k] !== undefined), ...remove];
  const qs = keys.map(k => 'updateMask.fieldPaths=' + encodeURIComponent(fieldPath(k))).join('&');
  const pre = mustExist ? '&currentDocument.exists=true' : '';
  const r = await fsFetch(`${FS}/${pathOk(path)}?${qs}${pre}`, { method: 'PATCH', body: JSON.stringify({ fields: encFields(obj) }) });
  await ok(r, 'update');
}

export async function fsDelete(path) {
  const r = await fsFetch(`${FS}/${pathOk(path)}`, { method: 'DELETE' });
  if (r.status === 404) return;
  await ok(r, 'delete');
}

// Raw atomic commit (transforms, multi-doc). `writes` use REST shape, with
// names given as "collection/id" and turned into full resource names here.
export async function fsCommit(writes) {
  const full = writes.map(w => {
    const x = JSON.parse(JSON.stringify(w));
    if (x.update && x.update.name) x.update.name = `${DOCS}/${pathOk(x.update.name)}`;
    if (x.delete) x.delete = `${DOCS}/${pathOk(x.delete)}`;
    if (x.transform && x.transform.document) x.transform.document = `${DOCS}/${pathOk(x.transform.document)}`;
    return x;
  });
  const r = await fsFetch(`${FS}:commit`, { method: 'POST', body: JSON.stringify({ writes: full }) });
  await ok(r, 'commit');
  return r.json();
}
export { encFields };

// ─── Roles: the only thing the Firestore rules trust ─────────────────────
const arr = (x) => (Array.isArray(x) ? x.filter(v => typeof v === 'string' && v) : []);
const uniq = (a) => [...new Set(a)];
export function normalizeRoles(d) {
  return {
    admin: !!(d && d.admin === true),
    captain_teams: arr(d && d.captain_teams),
    member_teams: arr(d && d.member_teams),
    player_ids: arr(d && d.player_ids),
  };
}
export async function getRoles(uid) {
  if (!uid) return normalizeRoles(null);
  return normalizeRoles(await fsGet(`roles/${uid}`));
}

// Recompute a user's roles from the authoritative sources. `admin` is NEVER
// derived from data a client could have written; it is carried over from the
// existing roles doc and only changes through setAdmin().
export async function computeRoles(uid) {
  const [existing, claims, players] = await Promise.all([
    fsGet(`roles/${uid}`),
    fsQuery('captain_claims', [['auth_uid', '==', uid]]),
    fsQuery('players', [['auth_uid', '==', uid]]),
  ]);
  const captain_teams = uniq(claims
    .filter(c => c.id === `${c.team_id}__${uid}` && c.approved === true && c.revoked !== true)
    .map(c => c.team_id));
  const member_teams = uniq([
    ...players.filter(p => p.team && p.active !== false && p.pending_approval !== true).map(p => p.team),
    ...captain_teams,
  ]);
  return {
    admin: !!(existing && existing.admin === true),
    captain_teams,
    member_teams,
    player_ids: players.map(p => p.id),
  };
}
// Merge only the derived fields; `admin` is never written by a recompute, so
// a concurrent setAdmin can't be lost and a failed read can't drop it.
export async function refreshRoles(uid) {
  const r = await computeRoles(uid);
  await fsUpdate(`roles/${uid}`, {
    captain_teams: r.captain_teams, member_teams: r.member_teams, player_ids: r.player_ids, updated_at: new Date(),
  });
  return r;
}
export async function setAdmin(uid, admin) {
  const r = await computeRoles(uid);
  r.admin = !!admin;
  await fsUpdate(`roles/${uid}`, { ...r, updated_at: new Date() });
  return r;
}

// ─── Durable daily counter (service account) ─────────────────────────────
// api_usage/<name>_<YYYY-MM-DD>.n, atomic increment. Falls back to memory if
// Firestore is unreachable so a real user is never failed by the counter.
const _day = new Map();
export async function dailyCount(name) {
  const id = `${name}_${new Date().toISOString().slice(0, 10)}`;
  try {
    const d = await fsCommit([{
      update: { name: `api_usage/${id}`, fields: {} },
      updateMask: { fieldPaths: [] },
      updateTransforms: [{ fieldPath: 'n', increment: { integerValue: '1' } }],
    }]);
    const n = Number(d.writeResults[0].transformResults[0].integerValue);
    if (n > 0) return n;
  } catch (e) { /* fall through */ }
  if (_day.size > 50) _day.clear();
  const n = (_day.get(id) || 0) + 1;
  _day.set(id, n);
  return n;
}

export const sha256hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();
export const isNonEmptyStr = (s, max = 200) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;

// Read the JSON body defensively (Vercel parses JSON for us when the
// Content-Type is application/json; anything else becomes {}).
export function body(req) {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
}
