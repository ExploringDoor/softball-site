// Vercel Serverless Function: /api/account (2026-11 security lockdown)
//
// Every account and roster action that changes who can do what goes through
// here, so the Firestore rules can stay strict. The caller proves who they are
// with a Firebase ID token (Authorization: Bearer <token>); what they may do is
// decided from roles/{uid}, which only this server (service account) or an
// admin writes. Nothing in the request body is trusted for identity or role.
//
// POST { action, ... }  →  { ok:true, ... }  or  { error:'code', message:'...' }
//
// Actions (see DESIGN.md §5):
//   refresh-roles      {uid?}                         self, or any uid for admin
//   refresh-all-roles                                 admin
//   claim-captain      {teamId}
//   claim-player       {playerId}
//   self-add           {teamId, firstName, lastName, num?}
//   approve-player     {playerId, approve}            admin or captain of the team
//   player-update      {playerId, active?, unlink?}   admin or captain of the team
//   move-player        {playerId, teamId}             admin
//   delete-player      {playerId}                     admin
//   set-admin          {targetUid | playerId, admin}  admin
//   captain-decision   {teamId, uid, decision}        admin
//   playoff-score      {bracket, g, as, hs}           admin, or captain of a side
//   sync-playoff-games                                admin
//
// Env: FCM_SERVICE_ACCOUNT_JSON (Firestore), MAILERLITE_TOKEN and
// MAILERLITE_GROUP_ID (optional, subscribe on approval of a registration).
//
// Every approval, link, admin grant, captain decision and player status change
// is logged to roles_audit/{auto} (server only; the rules deny it to clients).
// Public players docs never carry the caller's email: who did it is stored as
// a role ('admin' | 'captain') plus the uid, and the email goes to roles_audit.

import crypto from 'crypto';
import {
  PROJECT, cors, rateLimited, clientIp, requireUser, svcToken,
  fsGet, fsQuery, fsCreate, fsUpdate, fsDelete, fsCommit, enc, dec, encFields,
  getRoles, refreshRoles, setAdmin, dailyCount, lc, body,
} from './_lib/dvsl.js';
import { parseRef, isPlayed, parseBracketField, resolvedSides } from './_lib/bracket.js';
import { sendPush } from './_lib/push.js';
import { notifyAdminEmail } from './_lib/notify.js';

const BRACKETS_ID = '__playoff_brackets';
const BRACKET_KEYS = ['gold', 'silver'];
const DAILY_MAX = 2000;          // shared, non-admin traffic
const ADMIN_DAILY_MAX = 10000;   // admins have their own counter (DESIGN §5 style)
const USER_DAILY_MAX = 300;      // per non-admin uid, so one account can't drain the shared cap
const SELF_ADD_DAILY_MAX = 50;
const CLAIM_ALERT_DAILY_MAX = 30;

// ─── small helpers ────────────────────────────────────────────────────────
class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new HttpError(status, code, message); };

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const UID_RE = /^[A-Za-z0-9]{1,128}$/;
const isId = (s) => typeof s === 'string' && ID_RE.test(s);
const isUid = (s) => typeof s === 'string' && UID_RE.test(s);

// Accepts an integer or a string of digits; returns the int or NaN.
function toInt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
  if (typeof v === 'string' && /^\s*\d{1,4}\s*$/.test(v)) return parseInt(v, 10);
  return NaN;
}
// Name parts: 1–40 chars after trimming, no angle brackets.
function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  if (!s || s.length > 40 || /[<>]/.test(s)) return null;
  return s;
}
// Jersey number: blank → null, else int 0–99. Returns undefined when invalid.
function cleanNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = toInt(v);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : undefined;
}
const teamLabel = (t, id) => (t && (t.name || t.short)) || id || '';
const now = () => new Date();

async function loadTeam(teamId) {
  if (!isId(teamId) || teamId === BRACKETS_ID) fail(400, 'bad-team', 'Pick a team.');
  const t = await fsGet(`teams/${teamId}`);
  if (!t || t.active === false) fail(404, 'no-team', 'That team is not in the league this season.');
  return t;
}
async function loadPlayer(playerId) {
  if (!isId(playerId)) fail(400, 'bad-player', 'Missing player.');
  const p = await fsGet(`players/${playerId}`);
  if (!p) fail(404, 'not-found', 'That player is no longer on the roster.');
  return p;
}
function requireAdmin(roles) {
  if (!roles.admin) fail(403, 'forbidden', 'Only the commissioner can do that.');
}
function requireAdminOrCaptain(roles, teamId) {
  if (roles.admin) return 'admin';
  if (teamId && roles.captain_teams.includes(teamId)) return 'captain';
  fail(403, 'forbidden', 'Only this team\'s captain or the commissioner can do that.');
}
async function refreshQuiet(uid) {
  if (!isUid(uid)) return null;
  return refreshRoles(uid);
}

// Server-only trail of role and roster changes. Never fails the action.
async function audit(action, user, { target_uid, team_id, player_id, ...extra } = {}) {
  try {
    await fsCreate('roles_audit', {
      action,
      actor_uid: user.uid,
      actor_email: user.email || null,
      target_uid: target_uid || null,
      team_id: team_id || null,
      player_id: player_id || null,
      ...extra,
      at: now(),
    });
  } catch (e) { console.warn('[account] roles_audit write failed:', action, e && e.message); }
}

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

// Alerts never fail the user's action.
async function alertAdmin({ title, body: text, kind, subject, lines }) {
  try {
    await sendPush({ title, body: text, category: 'admin', adminOnly: true, url: '/admin.html' }, { senderRole: 'system' });
  } catch (e) { console.warn('[account] admin push failed:', e && e.message); }
  try {
    await notifyAdminEmail({ kind, subject, lines });
  } catch (e) { console.warn('[account] admin email failed:', e && e.message); }
}

// ─── roles ────────────────────────────────────────────────────────────────
async function actRefreshRoles(user, b, roles) {
  const target = b.uid === undefined || b.uid === null || b.uid === '' ? user.uid : b.uid;
  if (!isUid(target)) fail(400, 'bad-uid', 'Bad account id.');
  if (target !== user.uid) requireAdmin(roles);
  const r = await refreshRoles(target);
  return { roles: r };
}

async function actRefreshAllRoles(user, b, roles) {
  requireAdmin(roles);
  const [roleDocs, players, claims] = await Promise.all([
    fsQuery('roles'), fsQuery('players'), fsQuery('captain_claims'),
  ]);
  const uids = new Set();
  roleDocs.forEach(d => uids.add(d.id));
  players.forEach(p => { if (p.auth_uid) uids.add(p.auth_uid); });
  claims.forEach(c => { if (c.auth_uid) uids.add(c.auth_uid); });
  const list = [...uids].filter(isUid);
  let count = 0;
  for (let i = 0; i < list.length; i += 10) {
    await Promise.all(list.slice(i, i + 10).map(u => refreshRoles(u).then(() => { count++; })));
  }
  return { count };
}

// ─── captain claim ────────────────────────────────────────────────────────
// Link an approved captain to their own roster row (TASKS F1): exactly one
// active, non-pending, unclaimed player on the team whose roster email
// (player_private.email || players.email) equals the verified caller email.
// Zero or several matches → no link (the captain can claim in profile.html).
// Returns the linked player id or null. Never fails the claim.
async function linkCaptainPlayer(user, teamId) {
  if (!user.emailVerified || !user.email) return null;
  try {
    const roster = await fsQuery('players', [['team', '==', teamId]]);
    if (roster.some(p => p.auth_uid === user.uid && p.active !== false)) return null; // already linked
    const open = roster.filter(p => p.active !== false && p.pending_approval !== true && !p.auth_uid);
    if (!open.length) return null;
    const privs = await Promise.all(open.map(p => fsGet(`player_private/${p.id}`)));
    const hits = open
      .map((p, i) => ({ p, email: lc((privs[i] && privs[i].email) || p.email) }))
      .filter(x => x.email && x.email === user.email);
    if (hits.length !== 1) return null;
    const { p, email } = hits[0];
    await fsUpdate(`players/${p.id}`, { auth_uid: user.uid, claimed_at: now() }, { mustExist: true });
    await fsUpdate(`player_private/${p.id}`, { team_id: teamId, email, updated_at: now() });
    await audit('player-linked', user, { target_uid: user.uid, team_id: teamId, player_id: p.id, via: 'claim-captain' });
    return p.id;
  } catch (e) {
    console.warn('[account] captain roster link failed:', e && e.message);
    return null;
  }
}

async function actClaimCaptain(user, b) {
  const teamId = b.teamId;
  const team = await loadTeam(teamId);
  const claimId = `${teamId}__${user.uid}`;
  const existing = await fsGet(`captain_claims/${claimId}`);
  const tname = teamLabel(team, teamId);

  if (existing && existing.revoked === true) {
    fail(403, 'revoked', `Your captain access for ${tname} was removed. Contact the commissioner.`);
  }
  if (existing && existing.approved === true) {
    await fsUpdate(`captain_claims/${claimId}`, { last_seen: now() });
    const linked = await linkCaptainPlayer(user, teamId); // self-heal older captains
    await refreshRoles(user.uid);
    return linked ? { status: 'approved', linkedPlayerId: linked } : { status: 'approved' };
  }

  const roster = await fsQuery('captains', [['team_id', '==', teamId]]);
  const match = !!user.email && roster.some(c => lc(c.email) === user.email);

  if (match && !user.emailVerified) return { status: 'verify-email' };

  const base = {
    team_id: teamId,
    team_name: tname,
    auth_uid: user.uid,
    email: user.email,
    last_seen: now(),
  };
  if (!existing) { base.claimed_at = now(); base.revoked = false; }

  if (match) {
    await fsUpdate(`captain_claims/${claimId}`, {
      ...base, approved: true, approved_by: 'roster-verified', approved_at: now(),
    });
    await audit('captain-approved-roster', user, { target_uid: user.uid, team_id: teamId });
    const linked = await linkCaptainPlayer(user, teamId);
    await refreshRoles(user.uid);
    return linked ? { status: 'approved', linkedPlayerId: linked } : { status: 'approved' };
  }

  // No roster match: a pending claim the commissioner approves in admin.html.
  if (!existing) {
    await fsUpdate(`captain_claims/${claimId}`, { ...base, approved: false });
    await audit('captain-claim-requested', user, { target_uid: user.uid, team_id: teamId });
    if (await dailyCount('claim-alert') <= CLAIM_ALERT_DAILY_MAX) {
      await alertAdmin({
        title: 'Captain request waiting',
        body: `Someone asked to captain ${tname}. Review it in Admin.`,
        kind: 'captain_claim',
        subject: `${tname} (waiting for your approval)`,
        lines: [`Team: ${tname}`, `Account: ${user.email}`, 'Approve or deny it in Admin, Captain Claims.'],
      });
    }
  } else {
    await fsUpdate(`captain_claims/${claimId}`, { last_seen: now() });
  }
  return { status: 'pending' };
}

// ─── player claim ─────────────────────────────────────────────────────────
async function actClaimPlayer(user, b) {
  const p = await loadPlayer(b.playerId);
  if (p.active === false || p.pending_approval === true) {
    fail(409, 'not-available', 'That roster spot can\'t be claimed right now. Ask your captain.');
  }
  const out = (status) => ({ status, player: { id: p.id, name: p.name || '', team: p.team || '' } });
  if (p.auth_uid && p.auth_uid !== user.uid) {
    fail(409, 'already-claimed', 'Someone already signed in as this player. If that wasn\'t you, ask your captain or the commissioner.');
  }
  if (p.auth_uid === user.uid) {
    await refreshRoles(user.uid);
    return out('linked');
  }
  const priv = await fsGet(`player_private/${p.id}`);
  const rosterEmail = lc((priv && priv.email) || p.email);
  if (!rosterEmail) {
    fail(409, 'no-email', 'This roster spot has no email yet. Ask your captain to add your email to the roster, then try again.');
  }
  if (rosterEmail !== user.email) {
    fail(409, 'email-mismatch', 'Your account email doesn\'t match the email on this roster spot. Sign in with the email your captain has for you, or ask them to update it.');
  }
  if (!user.emailVerified) return { status: 'verify-email' };

  await fsUpdate(`players/${p.id}`, { auth_uid: user.uid, claimed_at: now() }, { mustExist: true });
  await fsUpdate(`player_private/${p.id}`, { team_id: p.team || '', email: rosterEmail, updated_at: now() });
  await audit('player-linked', user, { target_uid: user.uid, team_id: p.team || null, player_id: p.id, via: 'claim-player' });
  let tname = p.team || '';
  try { tname = teamLabel(await fsGet(`teams/${p.team}`), p.team); } catch (e) { /* label only */ }
  await alertAdmin({
    title: 'New player sign-up',
    body: `New player sign-up: ${p.name || 'a player'} (${tname})`,
    kind: 'signup',
    subject: `${p.name || 'a player'} (${tname})`,
    lines: [`Player: ${p.name || p.id}`, `Team: ${tname}`, `Account: ${user.email}`],
  });
  await refreshRoles(user.uid);
  return out('linked');
}

// ─── self-add ─────────────────────────────────────────────────────────────
async function actSelfAdd(user, b) {
  const first = cleanName(b.firstName);
  const last = cleanName(b.lastName);
  if (!first || !last) fail(400, 'bad-name', 'Enter your first and last name (40 letters max, no < or >).');
  const num = cleanNum(b.num);
  if (num === undefined) fail(400, 'bad-num', 'Jersey number must be a whole number from 0 to 99, or blank.');
  const team = await loadTeam(b.teamId);
  const teamId = b.teamId;

  const mine = await fsQuery('players', [['auth_uid', '==', user.uid]]);
  if (mine.some(p => p.pending_approval === true && p.active !== false)) {
    fail(409, 'pending-exists', 'You already asked to join a team. Wait for that captain to approve you.');
  }
  if (mine.some(p => p.team === teamId && p.active !== false)) {
    fail(409, 'already-member', 'You\'re already on this team\'s roster.');
  }
  if (await dailyCount('self-add') > SELF_ADD_DAILY_MAX) {
    fail(429, 'daily-limit', 'Too many join requests today. Please try again tomorrow.');
  }

  const t = now();
  // players + player_private in one atomic commit, so a failure never leaves
  // a pending row without its contact doc.
  const id = newDocId();
  await fsCommit([
    {
      update: {
        name: `players/${id}`,
        fields: encFields({
          name: `${first} ${last}`, first_name: first, last_name: last, num, pos: '',
          team: teamId, active: true, pending_approval: true, self_added: true,
          auth_uid: user.uid, added_at: t,
          gp: 0, ab: 0, r: 0, h: 0, s: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, so: 0,
          avg: 0, obp: 0, slg: 0, ops: 0,
        }),
      },
      currentDocument: { exists: false },
    },
    { update: { name: `player_private/${id}`, fields: encFields({ team_id: teamId, email: user.email, updated_at: t }) } },
  ]);
  await audit('player-self-added', user, { target_uid: user.uid, team_id: teamId, player_id: id });
  const tname = teamLabel(team, teamId);
  await alertAdmin({
    title: 'New join request',
    body: `A new player asked to join ${tname}.`,
    kind: 'self_add',
    subject: `${first} ${last} asked to join ${tname}`,
    lines: [`Player: ${first} ${last}`, `Team: ${tname}`, `Account: ${user.email}`, 'The captain (or you) can approve it.'],
  });
  await refreshRoles(user.uid);
  return { status: 'pending', playerId: id };
}

// ─── roster actions (admin / captain) ─────────────────────────────────────
async function mailerliteSubscribe(p, priv) {
  const TOKEN = process.env.MAILERLITE_TOKEN;
  const email = lc((priv && priv.email) || p.email);
  if (!TOKEN || !email) return false;
  const GROUP = process.env.MAILERLITE_GROUP_ID;
  let tname = p.team || '';
  try { tname = teamLabel(await fsGet(`teams/${p.team}`), p.team); } catch (e) { /* label only */ }
  const r = await fetch('https://connect.mailerlite.com/api/subscribers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({
      email,
      fields: {
        name: String(p.first_name || '').slice(0, 100),
        last_name: String(p.last_name || '').slice(0, 100),
        phone: String((priv && priv.phone) || '').slice(0, 40),
        ...(tname ? { team: String(tname).slice(0, 100) } : {}),
      },
      ...(GROUP ? { groups: [GROUP] } : {}),
    }),
  });
  return r.ok;
}

async function actApprovePlayer(user, b, roles) {
  if (typeof b.approve !== 'boolean') fail(400, 'bad-request', 'Say approve or reject.');
  const p = await loadPlayer(b.playerId);
  const role = requireAdminOrCaptain(roles, p.team);
  if (p.pending_approval !== true) fail(409, 'not-pending', 'That player isn\'t waiting for approval.');
  // players is public: record the role + uid, never the caller's email.
  if (b.approve) {
    await fsUpdate(`players/${p.id}`, { pending_approval: false, approved_by: role, approved_by_uid: user.uid, approved_at: now() }, { mustExist: true });
    if (p.source === 'register' && process.env.MAILERLITE_TOKEN) {
      try { await mailerliteSubscribe(p, await fsGet(`player_private/${p.id}`)); }
      catch (e) { console.warn('[account] mailerlite subscribe failed:', e && e.message); }
    }
  } else {
    await fsUpdate(`players/${p.id}`, { active: false, pending_approval: false, rejected_at: now(), rejected_by: role, rejected_by_uid: user.uid }, { mustExist: true });
  }
  await audit(b.approve ? 'player-approved' : 'player-rejected', user, { target_uid: p.auth_uid, team_id: p.team, player_id: p.id, actor_role: role });
  if (p.auth_uid) await refreshQuiet(p.auth_uid);
  return { status: b.approve ? 'approved' : 'rejected' };
}

async function actPlayerUpdate(user, b, roles) {
  const hasActive = typeof b.active === 'boolean';
  const unlink = b.unlink === true;
  if (!hasActive && !unlink) fail(400, 'bad-request', 'Nothing to change.');
  const p = await loadPlayer(b.playerId);
  const role = requireAdminOrCaptain(roles, p.team);
  const patch = {};
  const remove = [];
  // players is public: record the role + uid, never the caller's email.
  if (hasActive) {
    if (b.active) { patch.active = true; patch.restored_by = role; patch.restored_by_uid = user.uid; patch.restored_at = now(); }
    else { patch.active = false; patch.deactivated_by = role; patch.deactivated_by_uid = user.uid; patch.deactivated_at = now(); }
  }
  if (unlink) {
    remove.push('auth_uid', 'claimed_at');
    patch.unlinked_by = role;
    patch.unlinked_by_uid = user.uid;
    patch.unlinked_at = now();
  }
  await fsUpdate(`players/${p.id}`, patch, { mustExist: true, remove });
  const who = { target_uid: p.auth_uid, team_id: p.team, player_id: p.id, actor_role: role };
  if (hasActive) await audit(b.active ? 'player-restored' : 'player-deactivated', user, who);
  if (unlink) await audit('player-unlinked', user, who);
  if (p.auth_uid) await refreshQuiet(p.auth_uid);
  return { status: 'updated' };
}

async function actMovePlayer(user, b, roles) {
  requireAdmin(roles);
  const p = await loadPlayer(b.playerId);
  await loadTeam(b.teamId);
  await fsUpdate(`players/${p.id}`, { team: b.teamId, updated_at: now() }, { mustExist: true });
  const priv = await fsGet(`player_private/${p.id}`);
  if (priv) await fsUpdate(`player_private/${p.id}`, { team_id: b.teamId, updated_at: now(), updated_by: user.email });
  await audit('player-moved', user, { target_uid: p.auth_uid, team_id: b.teamId, player_id: p.id, from_team_id: p.team || null });
  if (p.auth_uid) await refreshQuiet(p.auth_uid);
  return { status: 'moved' };
}

async function actDeletePlayer(user, b, roles) {
  requireAdmin(roles);
  const p = await loadPlayer(b.playerId);
  await fsDelete(`players/${p.id}`);
  await fsDelete(`player_private/${p.id}`);
  await audit('player-deleted', user, { target_uid: p.auth_uid, team_id: p.team, player_id: p.id, player_name: p.name || null });
  if (p.auth_uid) await refreshQuiet(p.auth_uid);
  return { status: 'deleted' };
}

async function actSetAdmin(user, b, roles) {
  requireAdmin(roles);
  if (typeof b.admin !== 'boolean') fail(400, 'bad-request', 'Say admin true or false.');
  let uid = b.targetUid;
  let viaPlayer = null;
  if (uid === undefined || uid === null || uid === '') {
    const p = await loadPlayer(b.playerId);
    viaPlayer = p.id;
    if (!p.auth_uid) fail(409, 'not-linked', 'That player hasn\'t signed in yet, so there is no account to make an admin.');
    uid = p.auth_uid;
  }
  if (!isUid(uid)) fail(400, 'bad-uid', 'Bad account id.');
  if (!b.admin) {
    const admins = (await fsQuery('roles', [['admin', '==', true]])).map(d => d.id);
    if (admins.includes(uid) && admins.filter(x => x !== uid).length === 0) {
      fail(409, 'last-admin', 'You can\'t remove the last admin.');
    }
  }
  const r = await setAdmin(uid, b.admin);
  await audit(b.admin ? 'admin-grant' : 'admin-revoke', user, { target_uid: uid, player_id: viaPlayer });
  const linked = await fsQuery('players', [['auth_uid', '==', uid]]);
  await Promise.all(linked.map(p => fsUpdate(`players/${p.id}`, { is_admin: b.admin, is_admin_updated_at: now() })));
  return { roles: r };
}

async function actCaptainDecision(user, b, roles) {
  requireAdmin(roles);
  const { teamId, uid, decision } = b;
  if (!isId(teamId) || teamId === BRACKETS_ID) fail(400, 'bad-team', 'Bad team.');
  if (!isUid(uid)) fail(400, 'bad-uid', 'Bad account id.');
  if (!['approve', 'revoke', 'restore'].includes(decision)) fail(400, 'bad-request', 'Decision must be approve, revoke or restore.');
  const claimId = `${teamId}__${uid}`;
  const claim = await fsGet(`captain_claims/${claimId}`);
  if (!claim) fail(404, 'not-found', 'That captain claim no longer exists.');
  let patch;
  if (decision === 'approve') {
    if (claim.revoked === true) fail(409, 'revoked', 'That claim was revoked. Use Restore to give access back.');
    patch = { approved: true, revoked: false, approved_by: user.email, approved_at: now() };
  } else if (decision === 'restore') {
    patch = { approved: true, revoked: false, approved_by: user.email, approved_at: now(), restored_at: now() };
  } else {
    patch = { revoked: true, revoked_at: now(), revoked_by: user.email };
  }
  await fsUpdate(`captain_claims/${claimId}`, patch, { mustExist: true });
  await audit(`captain-${decision}`, user, { target_uid: uid, team_id: teamId });
  const r = await refreshRoles(uid);
  return { status: decision === 'revoke' ? 'revoked' : 'approved', roles: r };
}

// ─── playoffs ─────────────────────────────────────────────────────────────
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// fsGet without the update time; this one keeps it for the commit precondition.
async function getBracketDoc() {
  const tok = await svcToken();
  const r = await fetch(`${FS_BASE}/teams/${BRACKETS_ID}`, {
    headers: { Authorization: `Bearer ${tok}` },
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('bracket get ' + r.status);
  const d = await r.json();
  const data = {};
  for (const [k, f] of Object.entries(d.fields || {})) data[k] = dec(f);
  return { data, updateTime: d.updateTime };
}

// Bracket team NAME → team id: case-insensitive, trimmed equality on
// teams.name, teams.short or the doc id, ACTIVE teams only (not the brackets
// doc). A key that fits two different teams is ambiguous and resolves to null,
// so the caller gets 409 not-ready instead of being matched to the wrong team.
function buildTeamIdMap(teams) {
  const map = new Map();
  const add = (k, id) => {
    if (!k) return;
    if (!map.has(k)) map.set(k, id);
    else if (map.get(k) !== id) map.set(k, null);
  };
  teams.filter(t => t && t.id !== BRACKETS_ID && t.active !== false).forEach(t => {
    add(lc(t.name), t.id);
    add(lc(t.short), t.id);
    add(lc(t.id), t.id);
  });
  return (name) => (name ? map.get(lc(name)) || null : null);
}
async function teamIdResolver() {
  return buildTeamIdMap(await fsQuery('teams'));
}

// True if a game that consumes game n (directly or down the line) is played.
function feedsPlayedGame(t, n) {
  const seen = new Set([n]);
  const q = [n];
  while (q.length) {
    const cur = q.shift();
    for (const x of t.games || []) {
      if (seen.has(x.g)) continue;
      const refs = [parseRef(x.away), parseRef(x.home)];
      if (refs.some(r => (r.kind === 'WG' || r.kind === 'LG') && r.g === cur)) {
        if (isPlayed(x)) return true;
        seen.add(x.g);
        q.push(x.g);
      }
    }
  }
  return false;
}

// Rewrite playoff_games for the given brackets from the bracket doc.
// Returns { count, deleted }.
async function syncPlayoffGames(keys, bracketData, idOf) {
  const data = bracketData || ((await getBracketDoc()) || {}).data || {};
  const resolveId = idOf || await teamIdResolver();
  const writes = [];
  const keep = new Set();
  for (const key of keys) {
    const t = parseBracketField(data[key]);
    if (!t) continue;
    for (const g of t.games) {
      if (!Number.isInteger(g.g)) continue;
      const s = resolvedSides(t, g);
      const id = `po__${key}_${g.g}`;
      keep.add(id);
      writes.push({
        update: {
          name: `playoff_games/${id}`,
          fields: encFields({ bracket: key, g: g.g, away: resolveId(s.away), home: resolveId(s.home), decided: isPlayed(g) }),
        },
      });
    }
  }
  const existing = await fsQuery('playoff_games');
  let deleted = 0;
  for (const d of existing) {
    const mine = keys.includes(d.bracket) || keys.some(k => d.id.startsWith(`po__${k}_`));
    if (mine && !keep.has(d.id)) { writes.push({ delete: `playoff_games/${d.id}` }); deleted++; }
  }
  for (let i = 0; i < writes.length; i += 400) await fsCommit(writes.slice(i, i + 400));
  return { count: keep.size, deleted };
}

async function actSyncPlayoffGames(user, b, roles) {
  requireAdmin(roles);
  return syncPlayoffGames(BRACKET_KEYS);
}

// fsCommit errors read "commit <status>: <first 200 chars of the body>".
const isConflict = (e) => /FAILED_PRECONDITION|ABORTED|commit 409|stored version|base version/.test(String(e && e.message));

async function actPlayoffScore(user, b, roles) {
  const key = b.bracket;
  if (!BRACKET_KEYS.includes(key)) fail(400, 'bad-bracket', 'Bracket must be gold or silver.');
  const gnum = toInt(b.g);
  if (!Number.isInteger(gnum) || gnum < 1) fail(400, 'bad-game', 'Bad game number.');
  const isAdmin = roles.admin === true;
  const score = (v) => {
    if (isAdmin && (v === null || v === '')) return null;
    const n = toInt(v);
    return Number.isInteger(n) && n >= 0 && n <= 99 ? n : undefined;
  };
  const as = score(b.as), hs = score(b.hs);
  if (as === undefined || hs === undefined) fail(400, 'bad-score', 'Scores must be whole numbers from 0 to 99.');
  if (!isAdmin && as === hs) fail(400, 'tie', 'Playoff games can\'t end in a tie. Check the score.');

  const idOf = await teamIdResolver();
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await getBracketDoc();
    const t = doc && parseBracketField(doc.data[key]);
    if (!t) fail(404, 'no-bracket', 'That bracket isn\'t set up.');
    const game = t.games.find(x => x.g === gnum);
    if (!game) fail(404, 'no-game', 'That playoff game doesn\'t exist.');

    let sub = 'admin';
    if (!isAdmin) {
      const s = resolvedSides(t, game);
      const awayId = idOf(s.away), homeId = idOf(s.home);
      if (!awayId || !homeId) fail(409, 'not-ready', 'Both teams for this game aren\'t decided yet.');
      const side = roles.captain_teams.includes(awayId) ? 'away' : roles.captain_teams.includes(homeId) ? 'home' : null;
      if (!side) fail(403, 'forbidden', 'Only a captain of one of these two teams can enter this score.');
      if (isPlayed(game)) {
        if (game.sub !== side) fail(409, 'locked', 'This game already has a final. Ask the commissioner to change it.');
        if (feedsPlayedGame(t, gnum)) fail(409, 'locked', 'A later game that depends on this result was already played. Ask the commissioner to change it.');
      }
      sub = side;
    }

    game.as = as;
    game.hs = hs;
    game.sub = sub;
    try {
      await fsCommit([{
        update: { name: `teams/${BRACKETS_ID}`, fields: { [key]: enc(JSON.stringify(t)) } },
        updateMask: { fieldPaths: [key] },
        currentDocument: { updateTime: doc.updateTime },
      }]);
    } catch (e) {
      if (isConflict(e) && attempt < 2) continue;
      if (isConflict(e)) fail(409, 'busy', 'Someone else just updated the bracket. Please try again.');
      throw e;
    }
    try {
      await syncPlayoffGames([key], { ...doc.data, [key]: JSON.stringify(t) }, idOf);
    } catch (e) { console.warn('[account] playoff_games sync failed:', e && e.message); }
    return { game };
  }
  fail(409, 'busy', 'Someone else just updated the bracket. Please try again.');
}

// ─── handler ──────────────────────────────────────────────────────────────
const ACTIONS = {
  'refresh-roles': actRefreshRoles,
  'refresh-all-roles': actRefreshAllRoles,
  'claim-captain': actClaimCaptain,
  'claim-player': actClaimPlayer,
  'self-add': actSelfAdd,
  'approve-player': actApprovePlayer,
  'player-update': actPlayerUpdate,
  'move-player': actMovePlayer,
  'delete-player': actDeletePlayer,
  'set-admin': actSetAdmin,
  'captain-decision': actCaptainDecision,
  'playoff-score': actPlayoffScore,
  'sync-playoff-games': actSyncPlayoffGames,
};

export default async function handler(req, res) {
  if (cors(req, res)) return;
  // Loose per-IP burst guard before the token lookup; the real limit is per uid.
  if (rateLimited('account-ip:' + clientIp(req), 120, 60000)) {
    return res.status(429).json({ error: 'rate-limited', message: 'Too many requests. Please wait a minute.' });
  }
  const user = await requireUser(req, res);
  if (!user) return;
  if (rateLimited('account:' + user.uid, 30, 60000)) {
    return res.status(429).json({ error: 'rate-limited', message: 'Too many requests. Please wait a minute.' });
  }
  const b = body(req);
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, b.action) ? ACTIONS[b.action] : null;
  if (!fn) return res.status(400).json({ error: 'bad-action', message: 'Unknown action.' });
  try {
    // Daily caps. Admins have their own counter so other accounts can't lock
    // the commissioner out. Non-admins have a per-uid cap, then the shared
    // cap; a self refresh-roles (every page's sign-in gate) skips the shared
    // cap so it keeps working even if it is drained.
    const roles = await getRoles(user.uid);
    const busy = () => res.status(429).json({ error: 'daily-limit', message: 'The site is very busy today. Please try again tomorrow.' });
    if (roles.admin) {
      if (await dailyCount('account-admin') > ADMIN_DAILY_MAX) return busy();
    } else {
      if (await dailyCount('account-u-' + user.uid) > USER_DAILY_MAX) {
        return res.status(429).json({ error: 'daily-limit', message: 'Too many requests from this account today. Please try again tomorrow.' });
      }
      const selfRefresh = b.action === 'refresh-roles' && (b.uid === undefined || b.uid === null || b.uid === '' || b.uid === user.uid);
      if (!selfRefresh && await dailyCount('account') > DAILY_MAX) return busy();
    }
    const out = await fn(user, b, roles);
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.code, message: e.message });
    console.error('[account]', b.action, e && e.message);
    return res.status(500).json({ error: 'server', message: 'Something went wrong. Please try again.' });
  }
}

// Exposed for unit tests only.
export const _test = { feedsPlayedGame, cleanName, cleanNum, toInt, buildTeamIdMap, newDocId };

// Used by the text-a-score webhook (api/sms-inbound.js) so a texted playoff
// score goes through the exact same checks as the captain portal.
// Call as actPlayoffScore(null, { bracket, g, as, hs }, roles); it throws
// HttpError { status, code, message } when the score is refused.
export { actPlayoffScore, HttpError };
