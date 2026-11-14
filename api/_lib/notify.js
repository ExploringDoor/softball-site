// Admin email alerts (Resend) for the DVSL api/ functions.
//
// notifyAdminEmail({ kind, subject, lines }) → { sent, skipped?, status? }
// Used by api/notify-admin.js (captain game edits/adds) and in-process by
// api/account.js / api/register.js (claims, sign-ups). It never throws for a
// send failure: an alert must never fail the user's real action.
//
// Env vars (Vercel project settings): RESEND_API_KEY, ADMIN_EMAIL. When either
// is missing the call is skipped ({ sent:false, skipped:'not-configured' }).

export const KINDS = {
  game_edit:     { subject: 'DVSL: Captain edited a game',        label: 'Captain game edit' },
  game_add:      { subject: 'DVSL: Captain added a game',         label: 'Captain added a game' },
  captain_claim: { subject: 'DVSL: Captain claim',                label: 'Captain claim' },
  signup:        { subject: 'DVSL: New player sign-up',           label: 'Player sign-up' },
  self_add:      { subject: 'DVSL: Player added themselves',      label: 'Self-added player' },
  register:      { subject: 'DVSL: New registration',             label: 'Registration' },
  other:         { subject: 'DVSL notice',                        label: 'Notice' },
};

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// Subjects are one line: no CR/LF (header injection), no control chars.
export function oneLine(s, max) {
  const t = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(CTRL, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}
export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"'`]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
}

export function buildAdminEmail({ kind, subject, lines = [] } = {}) {
  const k = KINDS[kind] ? kind : 'other';
  const extra = oneLine(subject, 120);
  const fullSubject = extra ? `${KINDS[k].subject}: ${extra}` : KINDS[k].subject;
  const clean = (Array.isArray(lines) ? lines : [lines])
    .slice(0, 40)
    .map(l => String(l == null ? '' : l).replace(CTRL, '').slice(0, 2000));
  const text = `${KINDS[k].label}\n\n${clean.join('\n')}\n\nAdmin dashboard: https://dvsl.vercel.app/admin.html\n`;
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:20px;background:#f8fafc">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:24px">
        <div style="font-size:12px;color:#64748b;letter-spacing:.08em;text-transform:uppercase;font-weight:700">${escapeHtml(KINDS[k].label)}</div>
        <div style="font-size:18px;font-weight:700;color:#0f172a;margin:6px 0 16px">${escapeHtml(extra || KINDS[k].subject)}</div>
        <div style="font-size:14px;color:#334155;line-height:1.6;white-space:pre-wrap">${clean.map(escapeHtml).join('<br>')}</div>
        <div style="margin-top:20px">
          <a href="https://dvsl.vercel.app/admin.html" style="display:inline-block;background:#002D72;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700">Open Admin Dashboard</a>
        </div>
      </div>
    </div>`;
  return { kind: k, subject: fullSubject, text, html };
}

export async function notifyAdminEmail({ kind, subject, lines = [] } = {}) {
  const API_KEY = process.env.RESEND_API_KEY;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  if (!API_KEY || !ADMIN_EMAIL) return { sent: false, skipped: 'not-configured' };
  const m = buildAdminEmail({ kind, subject, lines });
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        from: 'DVSL <onboarding@resend.dev>', // Resend's sandbox sender, no domain verification needed
        to: [ADMIN_EMAIL],
        subject: m.subject,
        text: m.text,
        html: m.html,
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      console.error('Resend error:', r.status, d && d.message);
      return { sent: false, skipped: 'send-failed', status: r.status };
    }
    return { sent: true };
  } catch (e) {
    console.error('notifyAdminEmail failed:', e.message);
    return { sent: false, skipped: 'send-failed' };
  }
}
