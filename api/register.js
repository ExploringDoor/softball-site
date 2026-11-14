// Vercel Serverless Function: /api/register (2026-11 security lockdown)
//
// The public sign-up form on index.html posts here instead of writing players
// directly. No sign-in: anyone can register, so the input is validated hard,
// the row lands as pending_approval (a captain or the commissioner approves it
// in their portal before it shows on rosters or can be claimed), and contact
// details go to player_private, never to the public players doc.
// MailerLite subscribe happens on approval (api/account approve-player).
//
// POST { first_name, last_name, num, pos, team, email, phone, waiver_signed:true, season }
//   200 { ok:true, id, pending:true }
//   400 { error:'bad-...', message }      validation
//   403 { error:'Forbidden' }             foreign Origin
//   404 { error:'no-team', message }
//   409 { error:'duplicate', message }
//   429 { error:'rate-limited' | 'daily-limit', message }

import crypto from 'crypto';
import {
  cors, rejectForeignOrigin, rateLimited, clientIp,
  fsGet, fsQuery, fsCommit, encFields, dailyCount, lc, body,
} from './_lib/dvsl.js';
import { sendPush } from './_lib/push.js';
import { notifyAdminEmail } from './_lib/notify.js';

const BRACKETS_ID = '__playoff_brackets';
const DAILY_MAX = 300; // the whole league is about 300 players
// Same list as the Position select in registration-content.html.
export const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LCF', 'CF', 'RCF', 'RF', 'DH', 'UTIL', 'SUB'];
const EMAIL_RE = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/;

const bad = (res, status, error, message) => res.status(status).json({ error, message });

// 20-char [A-Za-z0-9] id, the same shape as a Firestore auto id.
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function newDocId() {
  let out = '';
  while (out.length < 20) {
    for (const b of crypto.randomBytes(32)) {
      if (b < 248 && out.length < 20) out += ID_CHARS[b % 62];
    }
  }
  return out;
}

function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  if (!s || s.length > 40 || /[<>]/.test(s)) return null;
  return s;
}

// Returns { ok:true, value } or { ok:false, error, message }.
export function validateRegistration(b) {
  const first = cleanName(b.first_name);
  if (!first) return { ok: false, error: 'bad-first-name', message: 'Please enter your first name (40 letters max).' };
  const last = cleanName(b.last_name);
  if (!last) return { ok: false, error: 'bad-last-name', message: 'Please enter your last name (40 letters max).' };

  const team = typeof b.team === 'string' ? b.team.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(team) || team === BRACKETS_ID) {
    return { ok: false, error: 'bad-team', message: 'Please select your team.' };
  }

  const emailRaw = b.email == null ? '' : b.email;
  if (typeof emailRaw !== 'string') return { ok: false, error: 'bad-email', message: 'Please enter a valid email address.' };
  const email = lc(emailRaw);
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) {
    return { ok: false, error: 'bad-email', message: 'Please enter a valid email address.' };
  }

  const phoneRaw = b.phone == null ? '' : b.phone;
  if (typeof phoneRaw !== 'string') return { ok: false, error: 'bad-phone', message: 'Please enter a valid phone number.' };
  const phone = phoneRaw.trim();
  if (phone.length > 30 || /[<>]/.test(phone)) {
    return { ok: false, error: 'bad-phone', message: 'Please enter a valid phone number (30 characters max).' };
  }
  if (!email && !phone) return { ok: false, error: 'bad-contact', message: 'Please enter an email or phone number.' };

  let num = null;
  if (b.num !== null && b.num !== undefined && b.num !== '') {
    const n = typeof b.num === 'number' ? b.num
      : (typeof b.num === 'string' && /^\s*\d{1,2}\s*$/.test(b.num) ? parseInt(b.num, 10) : NaN);
    if (!Number.isInteger(n) || n < 0 || n > 99) {
      return { ok: false, error: 'bad-num', message: 'Jersey number must be a whole number from 0 to 99, or blank.' };
    }
    num = n;
  }

  const pos = b.pos == null ? '' : b.pos;
  if (typeof pos !== 'string' || (pos !== '' && !POSITIONS.includes(pos))) {
    return { ok: false, error: 'bad-pos', message: 'Please pick a position from the list.' };
  }

  if (b.waiver_signed !== true) return { ok: false, error: 'bad-waiver', message: 'Please read and sign the waiver.' };

  const s = String(b.season == null ? '' : b.season).trim();
  const season = /^20\d{2}$/.test(s) ? s : String(new Date().getFullYear());

  return { ok: true, value: { first, last, team, email, phone, num, pos, season } };
}

// An active (or pending) player on this team already uses this email?
// Contact docs written by captain/admin clients may keep the email as typed,
// so both the lowercased and the raw trimmed form are checked.
async function isDuplicate(team, email, rawEmail) {
  const variants = [...new Set([email, String(rawEmail || '').trim()])].filter(Boolean);
  for (const e of variants) {
    const priv = await fsQuery('player_private', [['team_id', '==', team], ['email', '==', e]]);
    for (const d of priv) {
      const p = await fsGet(`players/${d.id}`);
      if (p && p.active !== false) return true;
    }
  }
  // Rows not migrated to player_private yet still carry email on players.
  for (const e of variants) {
    const legacy = await fsQuery('players', [['team', '==', team], ['email', '==', e]]);
    if (legacy.some(p => p.active !== false)) return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (rejectForeignOrigin(req, res)) return;
  const ip = clientIp(req);
  // Loose burst guard first, so a mistyped form a few times doesn't lock the
  // player out; the strict per-IP limit (DESIGN: 5 / 10 min) counts only
  // requests that pass validation, before any Firestore work.
  if (rateLimited('register-burst:' + ip, 20, 10 * 60 * 1000)) {
    return bad(res, 429, 'rate-limited', 'Too many sign-ups from here. Please wait a few minutes and try again.');
  }
  const v = validateRegistration(body(req));
  if (!v.ok) return bad(res, 400, v.error, v.message);
  if (rateLimited('register:' + ip, 5, 10 * 60 * 1000)) {
    return bad(res, 429, 'rate-limited', 'Too many sign-ups from here. Please wait a few minutes and try again.');
  }
  const { first, last, team, email, phone, num, pos, season } = v.value;

  try {
    const t = await fsGet(`teams/${team}`);
    if (!t || t.active === false) return bad(res, 404, 'no-team', 'That team isn\'t in the league this season. Please pick another.');
    const teamName = t.name || t.short || team;

    if (email && await isDuplicate(team, email, body(req).email)) {
      return bad(res, 409, 'duplicate', `You're already registered on ${teamName} under ${email}. If you meant to update your info, contact your captain or the commissioner.`);
    }

    if (await dailyCount('register') > DAILY_MAX) {
      return bad(res, 429, 'daily-limit', 'Sign-ups are closed for today. Please try again tomorrow.');
    }

    const now = new Date();
    const name = `${first} ${last}`;
    // players + player_private in one atomic commit: a failure never leaves a
    // public pending row without its contact doc (which would also let a retry
    // slip past the duplicate check).
    const id = newDocId();
    await fsCommit([
      {
        update: {
          name: `players/${id}`,
          fields: encFields({
            first_name: first, last_name: last, name,
            num, pos, team, season,
            waiver_signed: true, waiver_signed_at: now, added_at: now,
            pending_approval: true, source: 'register',
          }),
        },
        currentDocument: { exists: false },
      },
      { update: { name: `player_private/${id}`, fields: encFields({ team_id: team, email: email || null, phone: phone || null, updated_at: now }) } },
    ]);

    // Admin alerts: never fail the registration over them. No contact info.
    try {
      await sendPush({
        title: 'New registration',
        body: `A player registered for ${teamName}. Review it in Admin.`,
        category: 'admin', adminOnly: true, url: '/admin.html',
      }, { senderRole: 'system' });
    } catch (e) { console.warn('[register] admin push failed:', e && e.message); }
    try {
      await notifyAdminEmail({
        kind: 'register',
        subject: `${name} (${teamName})`,
        lines: [`Player: ${name}`, `Team: ${teamName}`, `Jersey: ${num == null ? 'none' : '#' + num}${pos ? ' ' + pos : ''}`, 'Waiting for approval in Admin or the captain portal.'],
      });
    } catch (e) { console.warn('[register] admin email failed:', e && e.message); }

    return res.status(200).json({ ok: true, id, pending: true });
  } catch (e) {
    console.error('[register]', e && e.message);
    return bad(res, 500, 'server', 'Something went wrong. Please try again.');
  }
}
