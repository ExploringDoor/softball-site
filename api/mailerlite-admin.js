// Vercel Serverless Function — /api/mailerlite-admin
// Server-side proxy for the admin "Email Blast" tab (stats, subscriber list,
// create + send a campaign). Exists so the MailerLite API token stays on the
// server and out of the public admin.html source, where it used to be
// hard-coded (2026-11 security pass).
//
// Env vars (set in Vercel project settings):
//   MAILERLITE_TOKEN     — the API bearer token (starts with eyJ...). Same var
//                          the subscribe proxy uses, so one rotation covers both.
//   MAILERLITE_GROUP_ID  — (optional) the DVSL Players group; defaults below.
//
// NOTE: This is Origin-gated + rate-limited, which stops off-site abuse. It
// does NOT yet verify the caller is a DVSL admin — that (a verified Firebase
// ID token) rides with the Firestore lockdown. Until then the blast is only
// as protected as access to admin.html itself, which is already far better
// than a full-access token sitting in public page source.

const _ALLOWED_ORIGINS = [
  'https://dvsl.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
const _rlHits = new Map();
function _rateLimited(req, max, windowMs) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const arr = (_rlHits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  _rlHits.set(ip, arr);
  if (_rlHits.size > 5000) _rlHits.clear();
  return arr.length > max;
}

const ML_BASE = 'https://connect.mailerlite.com/api';

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowOrigin = _ALLOWED_ORIGINS.includes(origin) ? origin : '';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin || 'https://dvsl.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!allowOrigin) return res.status(403).json({ error: 'Forbidden' });
  if (_rateLimited(req, 20, 60000)) return res.status(429).json({ error: 'Too many requests.' });

  const TOKEN = process.env.MAILERLITE_TOKEN;
  if (!TOKEN) return res.status(503).json({ error: 'MailerLite not configured', detail: 'Set MAILERLITE_TOKEN env var in Vercel.' });
  const GROUP_ID = process.env.MAILERLITE_GROUP_ID || '184141516725290868';
  const H = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` };

  const action = (req.body && req.body.action) || '';

  try {
    if (action === 'stats') {
      const r = await fetch(`${ML_BASE}/groups/${GROUP_ID}`, { headers: H });
      const d = await r.json();
      return res.status(200).json({ active_count: d?.data?.active_count ?? null });
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
      return res.status(200).json({ subscribers });
    }

    if (action === 'send') {
      const subject = String(req.body.subject || '').trim();
      const body = String(req.body.body || '').trim();
      if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required.' });
      // Extra-tight limit on the operation that actually emails ~300 people.
      if (_rateLimited(req, 3, 60000)) return res.status(429).json({ error: 'Too many sends, please wait a minute.' });

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
          emails: [{ subject, from_name: 'DVSL Softball', from: 'toddharris1222@gmail.com', content }],
          groups: [GROUP_ID]
        })
      });
      const campaign = await createRes.json();
      if (!campaign?.data?.id) return res.status(502).json({ error: campaign?.message || 'Failed to create campaign' });
      const campaignId = campaign.data.id;

      const schedRes = await fetch(`${ML_BASE}/campaigns/${campaignId}/schedule`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ delivery: 'instant' })
      });
      if (!schedRes.ok) {
        const e = await schedRes.json().catch(() => ({}));
        return res.status(502).json({ error: e?.message || 'Campaign created but failed to send', campaignId });
      }
      return res.status(200).json({ ok: true, campaignId });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('mailerlite-admin error:', e);
    return res.status(500).json({ error: e.message });
  }
}
