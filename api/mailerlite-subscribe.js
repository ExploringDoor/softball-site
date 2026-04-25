// Vercel Serverless Function — /api/mailerlite-subscribe
// Proxy so the MailerLite API bearer token stays on the server and out of
// the public HTML. Called by registration.html after a successful signup.
//
// Before this route existed, the token was hardcoded in registration.html
// where any site visitor could `curl` the page and scrape it, letting them
// spam the list or get the MailerLite account flagged.
//
// Env vars (set in Vercel project settings):
//   MAILERLITE_TOKEN        — the API bearer token (starts with eyJ...)
//   MAILERLITE_GROUP_ID     — (optional) default group to add new subscribers to.
//                              If omitted, request body's groups[] is still honored.
//
// Request body (JSON):
//   email:  string (required)
//   name?:  string    — first name
//   last?:  string    — last name
//   phone?: string
//   team?:  string    — team affiliation (custom field "team" in MailerLite)
//   groups?: string[] — override default group list
//
// Responses:
//   200 { ok: true }          on success
//   400 { error }             on bad input
//   502 { error, detail }     on upstream MailerLite failure
//   503 { error }             if env vars are missing

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.MAILERLITE_TOKEN;
  const DEFAULT_GROUP = process.env.MAILERLITE_GROUP_ID;
  if (!TOKEN) {
    return res.status(503).json({ error: 'MailerLite not configured', detail: 'Set MAILERLITE_TOKEN env var.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(_) { body = {}; } }
  body = body || {};
  const email = (body.email || '').trim();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  const groups = Array.isArray(body.groups) && body.groups.length
    ? body.groups
    : (DEFAULT_GROUP ? [DEFAULT_GROUP] : undefined);

  try {
    const upstream = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({
        email,
        fields: {
          name: body.name || '',
          last_name: body.last || '',
          phone: body.phone || '',
          ...(body.team ? { team: body.team } : {})
        },
        ...(groups ? { groups } : {})
      })
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'Upstream error', status: upstream.status, detail: detail.slice(0, 500) });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'Network error', detail: String(e?.message || e) });
  }
}
