// /api/email-unsubscribe?t=<token>  (Builder E). Public, no sign-in: the
// token is the permission (api/_lib/email-unsub.js; it carries no address).
//
// GET   shows a confirm page and changes NOTHING (mail scanners open links).
// POST  records the opt out in email_optouts/{sha256(address)}.
//       Body "List-Unsubscribe=One-Click" (RFC 8058, sent by Gmail / Yahoo /
//       Apple Mail from the List-Unsubscribe-Post header) answers plain text;
//       the confirm page's button answers a page with an Undo button.
//       Body do=undo removes the opt out again.
// EMAIL_UNSUB_SECRET unset: 503 (and team emails are dormant anyway).
import { rateLimited, clientIp } from './_lib/dvsl.js';
import { readUnsubToken, recordOptOut, undoOptOut, isOptedOut, UNSUB_PATH } from './_lib/email-unsub.js';
import { escapeHtml } from './_lib/notify.js';

function page(res, status, title, bodyHtml) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  // The token is in the URL: never send it on as a Referer.
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.status(status);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(title)}: DVSL Softball</title>
<style>
body{margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a}
.wrap{max-width:520px;margin:0 auto;padding:24px 16px}
.top{background:#002D72;color:#fff;padding:16px 22px;border-radius:8px 8px 0 0;border-bottom:3px solid #C99700;font-weight:bold;font-size:19px;letter-spacing:.05em}
.box{background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:22px;line-height:1.55;font-size:16px}
h1{font-size:20px;margin:0 0 10px}
button{font:inherit;font-weight:bold;background:#002D72;color:#fff;border:0;border-radius:6px;padding:12px 20px;cursor:pointer;margin-top:8px}
button.plain{background:#fff;color:#002D72;border:1px solid #002D72}
a{color:#002D72}
.small{font-size:14px;color:#4b5563}
</style></head><body><div class="wrap"><div class="top">DVSL SOFTBALL</div><div class="box">${bodyHtml}</div></div></body></html>`;
  if (typeof res.send === 'function') return res.send(html);
  res.end(html);
}
function plain(res, status, text) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status);
  if (typeof res.send === 'function') return res.send(text);
  res.end(text);
}

function formFields(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  const s = Buffer.isBuffer(b) ? b.toString('utf8') : typeof b === 'string' ? b : '';
  return Object.fromEntries(new URLSearchParams(s.slice(0, 2000)));
}

const SMS_LINE = '<p class="small">Prefer texts? Sign up at <a href="https://dvsl.vercel.app/sms.html">dvsl.vercel.app/sms.html</a>.</p>';

export default async function handler(req, res) {
  const method = req.method || 'GET';
  if (method === 'OPTIONS') { res.setHeader('Allow', 'GET, POST'); return plain(res, 204, ''); }
  if (method !== 'GET' && method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return plain(res, 405, 'Method not allowed'); }
  if (rateLimited('email-unsub:' + clientIp(req), 30, 60 * 1000)) return plain(res, 429, 'Too many requests. Try again in a minute.');
  if (String(process.env.EMAIL_UNSUB_SECRET || '').length < 16) {
    return page(res, 503, 'Not available', '<h1>Not available yet</h1><p>Email unsubscribe is not set up yet. Reply to the email and the commissioner will take you off the list.</p>');
  }

  const q = req.query || {};
  const token = typeof q.t === 'string' ? q.t : '';
  const hash = readUnsubToken(token);
  if (!hash) {
    return page(res, 400, 'Link not valid', '<h1>This link is not valid</h1><p>It may be cut off. Use the unsubscribe link at the bottom of the latest DVSL schedule email, or reply to that email and the commissioner will take you off the list.</p>');
  }
  const action = `${UNSUB_PATH}?t=${encodeURIComponent(token)}`;

  if (method === 'GET') {
    let already = false;
    try { already = await isOptedOut(hash); } catch (e) { /* show the button anyway */ }
    if (already) {
      return page(res, 200, 'Unsubscribed', `<h1>You are unsubscribed</h1><p>You no longer get DVSL schedule change emails.</p>
<form method="post" action="${escapeHtml(action)}"><input type="hidden" name="do" value="undo"><button type="submit" class="plain">Get schedule emails again</button></form>${SMS_LINE}`);
    }
    return page(res, 200, 'Unsubscribe', `<h1>Stop DVSL schedule emails?</h1><p>You will no longer get an email when one of your team's games is moved, postponed, cancelled or added. Nothing else changes.</p>
<form method="post" action="${escapeHtml(action)}"><input type="hidden" name="do" value="unsubscribe"><button type="submit">Unsubscribe</button></form>${SMS_LINE}`);
  }

  const f = formFields(req);
  const oneClick = String(f['List-Unsubscribe'] || '') === 'One-Click';
  try {
    if (!oneClick && f.do === 'undo') {
      await undoOptOut(hash);
      return page(res, 200, 'Subscribed', `<h1>You will get schedule emails again</h1><p>Thanks. Changes to your team's games will come by email again.</p>
<form method="post" action="${escapeHtml(action)}"><input type="hidden" name="do" value="unsubscribe"><button type="submit" class="plain">Unsubscribe after all</button></form>`);
    }
    await recordOptOut(hash, oneClick ? 'one-click' : 'link');
  } catch (e) {
    console.error('[email-unsubscribe] write failed');
    if (oneClick) return plain(res, 500, 'Could not save. Try again.');
    return page(res, 500, 'Try again', '<h1>That did not save</h1><p>Please try the button again in a minute.</p>');
  }
  if (oneClick) return plain(res, 200, 'Unsubscribed');
  return page(res, 200, 'Unsubscribed', `<h1>You are unsubscribed</h1><p>You will not get DVSL schedule change emails any more.</p>
<form method="post" action="${escapeHtml(action)}"><input type="hidden" name="do" value="undo"><button type="submit" class="plain">Undo</button></form>${SMS_LINE}`);
}
