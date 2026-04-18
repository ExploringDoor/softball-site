// Vercel Serverless Function — /api/notify-admin.js
// Sends an email to the admin when a captain edits a game.
// Called from captain.html saveEditGame() after the Firestore write.
//
// Env vars (set in Vercel project settings):
//   RESEND_API_KEY  — from https://resend.com (free tier)
//   ADMIN_EMAIL     — your email (e.g. adam.miller.22@gmail.com)
//
// If either env var is missing, the endpoint returns 200 with skipped=true
// so the captain-side call never breaks the user flow.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = process.env.RESEND_API_KEY;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

  // Silently skip if not configured — don't break captain edits over missing config
  if (!API_KEY || !ADMIN_EMAIL) {
    return res.status(200).json({ skipped: true, reason: 'Email not configured' });
  }

  const {
    gameId = '',
    teamsLabel = '',
    editedBy = '',
    editedByEmail = '',
    summary = '',
    diff = '',
  } = req.body || {};

  const subject = `DVSL: ${editedBy || 'Captain'} edited ${teamsLabel || 'a game'}`;

  const plain =
`A captain just edited a game in the DVSL captain portal.

Game: ${teamsLabel}
Edited by: ${editedBy}${editedByEmail ? ' (' + editedByEmail + ')' : ''}
Summary: ${summary || '(no summary)'}

Changes:
${diff || '(none)'}

You can push this to Google Calendar from the admin dashboard:
https://dvsl-baseball.vercel.app/admin.html

Game ID: ${gameId}
`;

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:20px;background:#f8fafc">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:24px">
        <div style="font-size:12px;color:#64748b;letter-spacing:.08em;text-transform:uppercase;font-weight:700">DVSL Captain Edit</div>
        <div style="font-size:18px;font-weight:700;color:#0f172a;margin:6px 0 16px">${escapeHtml(teamsLabel)}</div>
        <div style="font-size:14px;color:#334155;line-height:1.6">
          <div><strong>Edited by:</strong> ${escapeHtml(editedBy)}${editedByEmail ? ' &lt;' + escapeHtml(editedByEmail) + '&gt;' : ''}</div>
          <div><strong>Summary:</strong> ${escapeHtml(summary || '(no summary)')}</div>
          ${diff ? `<div style="margin-top:12px;padding:12px;background:#f1f5f9;border-radius:6px;font-family:monospace;font-size:13px;white-space:pre-wrap">${escapeHtml(diff)}</div>` : ''}
        </div>
        <div style="margin-top:20px">
          <a href="https://dvsl-baseball.vercel.app/admin.html" style="display:inline-block;background:#002D72;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700">Open Admin Dashboard</a>
        </div>
        <div style="margin-top:16px;font-size:11px;color:#94a3b8">Game ID: ${escapeHtml(gameId)}</div>
      </div>
    </div>
  `;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'DVSL <onboarding@resend.dev>', // Resend's sandbox sender — works without domain verification
        to: [ADMIN_EMAIL],
        subject,
        text: plain,
        html,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('Resend error:', data);
      return res.status(500).json({ error: data.message || 'Resend failed' });
    }
    return res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    console.error('notify-admin exception:', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
