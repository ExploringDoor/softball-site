// Unsubscribe links for DVSL team email (Builder E).
//
// The link carries an opaque token, never the address:
//   t = base64url( iv(12) | AES-256-GCM( sha256(lowercased address) )(32) | tag(16) )
// The key is derived from EMAIL_UNSUB_SECRET. Without the secret nobody can
// read which address a link belongs to, and nobody can make a link for an
// address (the GCM tag fails), so a stranger cannot unsubscribe other people.
// The server learns only sha256(address), which is the email_optouts doc id.
//
// email_optouts/{sha256(address)} = { at, source:'link'|'one-click' }  server only.
import crypto from 'crypto';
import { fsGet, fsQuery, fsSet, fsDelete } from './dvsl.js';
import { emailHash } from './email.js';

export const UNSUB_PATH = '/api/email-unsubscribe';
const SITE = 'https://dvsl.vercel.app';
const HEX64 = /^[0-9a-f]{64}$/;

function key(secret) {
  const s = String(secret || '');
  if (s.length < 16) return null;
  return crypto.createHmac('sha256', s).update('dvsl-email-unsub-v1').digest();
}
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function makeUnsubToken(email, secret = process.env.EMAIL_UNSUB_SECRET) {
  const k = key(secret);
  if (!k) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(Buffer.from(emailHash(email), 'hex')), c.final()]);
  return b64u(Buffer.concat([iv, ct, c.getAuthTag()]));
}

// -> the address hash (64 hex) or null for anything forged, cut or stale.
export function readUnsubToken(token, secret = process.env.EMAIL_UNSUB_SECRET) {
  const k = key(secret);
  const t = String(token || '');
  if (!k || !/^[A-Za-z0-9_-]{70,120}$/.test(t)) return null;
  const raw = unb64u(t);
  if (raw.length !== 12 + 32 + 16) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', k, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(44));
    const h = Buffer.concat([d.update(raw.subarray(12, 44)), d.final()]).toString('hex');
    return HEX64.test(h) ? h : null;
  } catch (e) { return null; }
}

export function unsubUrl(email, secret = process.env.EMAIL_UNSUB_SECRET) {
  const t = makeUnsubToken(email, secret);
  return t ? `${SITE}${UNSUB_PATH}?t=${t}` : '';
}

// RFC 8058 one-click headers for one recipient.
export function unsubHeaders(url) {
  return url ? { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {};
}

export async function optedOutSet() {
  const docs = await fsQuery('email_optouts');
  return new Set(docs.map(d => d.id).filter(id => HEX64.test(id)));
}
export async function isOptedOut(hash) {
  return HEX64.test(hash) ? !!(await fsGet(`email_optouts/${hash}`)) : false;
}
export async function recordOptOut(hash, source = 'link') {
  if (!HEX64.test(hash)) throw new Error('bad hash');
  await fsSet(`email_optouts/${hash}`, { at: new Date(), source: source === 'one-click' ? 'one-click' : 'link' });
}
export async function undoOptOut(hash) {
  if (!HEX64.test(hash)) throw new Error('bad hash');
  await fsDelete(`email_optouts/${hash}`);
}
