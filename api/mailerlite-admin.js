// Vercel Serverless Function — /api/mailerlite-admin
// Server-side proxy for the admin "Email Blast" tab (stats, subscriber list,
// create + send a campaign). Exists so the MailerLite API token stays on the
// server and out of the public admin.html source, where it used to be
// hard-coded (2026-11 security pass).
//
// Env vars (set in Vercel project settings):
//   MAILERLITE_TOKEN     — the API bearer token (starts with eyJ...). Same var
//                          api/account.js uses to subscribe approved players.
//   MAILERLITE_GROUP_ID  — (optional) the DVSL Players group; defaults below.
//   MAILERLITE_FROM      — (optional) campaign sender address; defaults below.
//
// Access: our Origin, a per-IP burst limit, a verified Firebase ID token,
// and roles/{uid}.admin === true (2026-11 lockdown). Everyone else gets 403.
// 'send' also has a tighter burst limit and a durable daily cap.

import { cors, rejectForeignOrigin, rateLimited, clientIp, requireUser, getRoles, dailyCount } from './_lib/dvsl.js';

const ML_BASE = 'https://connect.mailerlite.com/api';
const SEND_DAILY_MAX = 10; // blasts go to the whole league; a few a season is normal
const fail = (res, status, error, message) => res.status(status).json({ error, message });

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (rejectForeignOrigin(req, res)) return;
  if (rateLimited('ml:' + clientIp(req), 20, 60000)) return fail(res, 429, 'rate-limited', 'Too many requests.');

  // No admin, no MailerLite: this covers the blast and the subscriber list.
  const _user = await requireUser(req, res);
  if (!_user) return;
  let _roles;
  try { _roles = await getRoles(_user.uid); }
  catch (e) { return fail(res, 503, 'unavailable', 'Could not check your account. Please try again.'); }
  if (!_roles.admin) return fail(res, 403, 'forbidden', 'Only the commissioner can use Email Blast.');

  const TOKEN = process.env.MAILERLITE_TOKEN;
  if (!TOKEN) return fail(res, 503, 'not-configured', 'MailerLite is not set up. Set MAILERLITE_TOKEN in Vercel.');
  const FROM = process.env.MAILERLITE_FROM || 'toddharris1222@gmail.com';
  const GROUP_ID = process.env.MAILERLITE_GROUP_ID || '184141516725290868';
  const H = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` };

  const action = (req.body && req.body.action) || '';

  try {
    if (action === 'stats') {
      const r = await fetch(`${ML_BASE}/groups/${GROUP_ID}`, { headers: H });
      const d = await r.json();
      return res.status(200).json({ ok: true, active_count: d?.data?.active_count ?? null });
    }

    if (action === 'subscribers') {
      const r = await fetch(`${ML_BASE}/subscribers?filter[group]=${GROUP_ID}&filter[status]=active&limit=100`, { headers: H });
      const d = await r.json();
      const subscribers = (d?.data || []).map(s => ({
        email: s.email || '',
        name: s.fields?.name || '',
        last_name: s.fields?.last_name || '',
        team: s.fields?.team || ''
      }));
      return res.status(200).json({ ok: true, subscribers });
    }

    if (action === 'send') {
      const subject = String(req.body.subject || '').trim();
      const body = String(req.body.body || '').trim();
      if (!subject || !body) return fail(res, 400, 'bad-request', 'Subject and body are required.');
      if (subject.length > 200 || body.length > 50000) return fail(res, 413, 'too-long', 'That email is too long.');
      // Extra-tight limits on the operation that actually emails ~300 people.
      if (rateLimited('mlsend:' + _user.uid, 3, 60000)) return fail(res, 429, 'rate-limited', 'Too many sends, please wait a minute.');
      if (await dailyCount('mailerlite-send') > SEND_DAILY_MAX) return fail(res, 429, 'daily-limit', 'Daily email blast limit reached. Please try again tomorrow.');

      const content = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <div style="background:#002D72;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;font-family:Arial,sans-serif">
              <strong style="font-size:20px;letter-spacing:.05em">⚾ DVSL SOFTBALL</strong>
            </div>
            <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;line-height:1.6;color:#1a1a1a">
              ${body.replace(/\n/g, '<br>')}
            </div>
            <div style="text-align:center;padding:16px;font-size:11px;color:#9ca3af">
              DVSL — Delaware Valley Synagogue League
            </div>
          </div>`;

      const createRes = await fetch(`${ML_BASE}/campaigns`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          name: subject,
          type: 'regular',
          emails: [{ subject, from_name: 'DVSL Softball', from: FROM, content }],
          groups: [GROUP_ID]
        })
      });
      const campaign = await createRes.json();
      if (!campaign?.data?.id) return fail(res, 502, 'create-failed', campaign?.message || 'Failed to create campaign');
      const campaignId = campaign.data.id;

      const schedRes = await fetch(`${ML_BASE}/campaigns/${campaignId}/schedule`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ delivery: 'instant' })
      });
      if (!schedRes.ok) {
        const e = await schedRes.json().catch(() => ({}));
        return res.status(502).json({ error: 'send-failed', message: e?.message || 'Campaign created but failed to send', campaignId });
      }
      return res.status(200).json({ ok: true, campaignId });
    }

    return fail(res, 400, 'bad-action', 'Unknown action');
  } catch (e) {
    console.error('mailerlite-admin error:', e);
    return fail(res, 502, 'mailerlite-failed', 'MailerLite request failed. Please try again.');
  }
}
