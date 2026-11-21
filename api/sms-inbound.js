// POST /api/sms-inbound: Twilio posts every text sent to the DVSL number here,
// and the TwiML we answer with is the reply the texter sees.
//
//   captain texts "DN 12 SA 9"  ->  Twilio  ->  this function
//     1. STOP / START (and the other carrier opt-out words) -> optin.js markStopped / markStarted
//     2. YES to a web sign-up's confirm text                 -> optin.js confirmOptIn
//        (unless a box-score photo is waiting for its YES)
//     3. a photo (MMS), or the YES / NO / EDIT a photo is waiting on -> photo-boxscore.js
//     4. everything else from a listed captain -> the Text a Score engine
//        (_sms/core.js handleInboundText over _sms/dvsl-store.js)
//     5. a number not on the list -> the public auto-reply (_sms/public-faq.js)
//
// DORMANT by default. With no TWILIO_AUTH_TOKEN or TWILIO_INBOUND_URL this
// answers 503 and reads nothing. Every request must carry a valid Twilio
// signature for TWILIO_INBOUND_URL, the EXACT webhook URL given to Twilio
// (https://dvsl.vercel.app/api/sms-inbound), or it gets 403. Then
// sms_state/config decides: inbound.enabled turns scores on, box_photo.enabled
// photos, and opt-in replies work when inbound or team_texts is on. With every
// switch off it answers 503, except that STOP is always recorded.
//
// Everything past the signature check answers HTTP 200 with TwiML (even on
// trouble), so the captain gets a human reply and Twilio does not retry.
// Replies carry the "DVSL: " brand prefix. Phones never reach the console:
// logs show the last four digits only.
//
// Env: TWILIO_AUTH_TOKEN, TWILIO_INBOUND_URL, TWILIO_STATUS_URL (optional:
// delivery receipts for replies), SITE_BASE (optional), FCM_SERVICE_ACCOUNT_JSON.
import {
  handleInboundText, UNKNOWN_SENDER_REPLY, twilioSignatureValid, twiml, isYesReply,
  optInConfirmText, toE164US, lastFour,
} from './_sms/core.js';
import { dvslStore, getSender, getSessionDoc, saveSession, ReplyError, LEAGUE } from './_sms/dvsl-store.js';
import { publicReply } from './_sms/public-faq.js';
import { readConfig } from './_sms/config.js';
import { readRawBody } from './_sms/http.js';
import { confirmOptIn, markStopped, markStarted } from './_sms/optin.js';
import { handlePhoto, handlePhotoReply } from './_sms/photo-boxscore.js';
import { fsCreate, rateLimited, dailyCount } from './_lib/dvsl.js';
import { sendPush } from './_lib/push.js';

// Twilio Advanced Opt-Out's default words. Twilio opts the number out for any
// of them before we see it, so the site's record must agree.
const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'revoke', 'optout', 'stop all', 'opt out']);
const START_WORDS = new Set(['start', 'unstop', 'subscribe']);
const DAILY_MAX = 1500;
const PER_PHONE_PER_MIN = 15;

const keyword = (body) => String(body || '').trim().toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ');

export function withBrand(reply) {
  const r = String(reply || '').trim();
  if (!r) return '';
  return /^DVSL\b/.test(r) ? r : `DVSL: ${r}`;
}

async function logLine(entry) {
  try {
    await fsCreate('sms_log', {
      at: new Date(), dir: 'in', phone_last4: lastFour(entry.from), team_id: entry.team_id || null,
      kind: entry.kind || 'inbound', text: String(entry.body || '').slice(0, 500),
      reply: String(entry.reply || '').slice(0, 1000), outcome: entry.outcome || '',
      ...(entry.game_id ? { game_id: entry.game_id } : {}),
    });
  } catch (e) { console.warn('[sms-inbound] log failed:', e && e.message); }
}

// sms_state/config switches (config.js, builder C). A failed read = all off.
async function switches() {
  try {
    const c = await readConfig();
    return { inbound: !!c.inbound.enabled, box_photo: !!c.box_photo.enabled, team_texts: !!c.team_texts.enabled };
  } catch (e) { return { inbound: false, box_photo: false, team_texts: false }; }
}

const SORRY = 'Sorry, that did not go through. Try again in a minute, or enter it on the captain page.';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).send('POST only');
  if (!process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_INBOUND_URL) return res.status(503).send('Texting is not connected on this deployment.');

  const raw = await readRawBody(req);
  const params = Object.fromEntries(new URLSearchParams(raw).entries());
  if (!twilioSignatureValid(process.env.TWILIO_AUTH_TOKEN, process.env.TWILIO_INBOUND_URL, params, req.headers['x-twilio-signature'])) {
    return res.status(403).send('bad signature');
  }

  const statusUrl = process.env.TWILIO_STATUS_URL || null;
  const answer = (reply) => {
    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    return res.status(200).send(twiml(withBrand(reply), reply ? statusUrl : null));
  };

  const from = toE164US(params.From);
  const body = String(params.Body || '').slice(0, 1600);
  if (!from) return answer('');
  const kw = keyword(body);
  const numMedia = Math.min(10, parseInt(params.NumMedia, 10) || 0);

  // STOP is recorded whatever the switches say: it changes nothing but our list.
  if (STOP_WORDS.has(kw)) {
    try { await markStopped(from); } catch (e) { console.warn('[sms-inbound] markStopped failed', lastFour(from), e && e.message); }
    await logLine({ from, body, kind: 'optout', outcome: 'stopped' });
    return answer('');   // Twilio sends the carrier-required STOP reply itself
  }

  if (rateLimited('sms-in:' + from, PER_PHONE_PER_MIN, 60000)) return answer('');
  if (await dailyCount('sms-inbound') > DAILY_MAX) return answer('');

  const cfg = await switches();
  if (!cfg.inbound && !cfg.team_texts) return res.status(503).send('Texting is turned off.');

  try {
    if (START_WORDS.has(kw)) {
      try { await markStarted(from); } catch (e) { console.warn('[sms-inbound] START failed', lastFour(from), e && e.message); }
      await logLine({ from, body, kind: 'optin', outcome: 'started' });
      return answer('');   // Twilio answers START itself
    }

    const [sender, session] = await Promise.all([getSender(from), getSessionDoc(from)]);
    const photoOn = cfg.inbound && cfg.box_photo;
    const boxWaiting = !!(session && session.pending_box);

    // YES to the web sign-up's confirm text. A YES a box-score photo is
    // waiting on goes to the photo flow instead.
    if (numMedia === 0 && isYesReply(body) && !(boxWaiting && photoOn && sender)) {
      const r = await confirmOptIn(from);
      // Only a sign-up this YES just confirmed is answered here; an already
      // confirmed number's "yes" is read like any other text.
      if (r && r.confirmed && !r.already) {
        const reply = r.reply || optInConfirmText(LEAGUE.name);
        await logLine({ from, body, kind: 'optin', outcome: 'confirmed', reply, team_id: sender && sender.team_id });
        return answer(reply);
      }
    }

    if (!cfg.inbound) {
      const reply = sender ? 'Texting in scores is turned off right now. Enter the score on the captain page.' : publicReply(body);
      await logLine({ from, body, kind: 'inbound', outcome: 'inbound_off', reply, team_id: sender && sender.team_id });
      return answer(reply);
    }

    // A photo of the scorebook.
    if (numMedia > 0) {
      let reply, outcome = 'photo';
      if (!sender) { reply = publicReply(body); outcome = 'public_faq'; }
      else if (!photoOn) { reply = 'Box score photos are not turned on yet. Text the final instead, like DN 12 SA 9.'; outcome = 'photo_off'; }
      else {
        const mediaUrls = [], mediaTypes = [];
        for (let i = 0; i < numMedia; i++) {
          if (params[`MediaUrl${i}`]) { mediaUrls.push(params[`MediaUrl${i}`]); mediaTypes.push(params[`MediaContentType${i}`] || ''); }
        }
        const r = await handlePhoto({ from, sender, mediaUrls, mediaTypes, session: session || {} });
        if (r && r.session !== undefined) await saveSession(from, r.session, { withBox: true });
        reply = (r && r.reply) || '';
      }
      await logLine({ from, body: body || `[${numMedia} photo]`, kind: 'photo', outcome, reply, team_id: sender && sender.team_id });
      return answer(reply);
    }

    // YES / NO / EDIT for a box score the photo flow is holding.
    if (boxWaiting && photoOn && sender) {
      const r = await handlePhotoReply({ from, sender, body, session });
      if (r && r.handled) {
        if (r.session !== undefined) await saveSession(from, r.session, { withBox: true });
        await logLine({ from, body, kind: 'photo', outcome: 'photo_reply', reply: r.reply || '', team_id: sender.team_id });
        return answer(r.reply || '');
      }
    }

    // The Text a Score conversation.
    let result;
    try {
      result = await handleInboundText(dvslStore(), { from, to: params.To || '', body });
    } catch (e) {
      if (e instanceof ReplyError || (e && e.smsReply)) result = { reply: e.smsReply, outcome: 'refused' };
      else {
        console.error('[sms-inbound] engine', lastFour(from), e && (e.stack || e.message));
        result = { reply: SORRY, outcome: 'error' };
      }
    }
    // A number not on the list gets the public auto-reply instead of the bare
    // "not set up". Only on the engine's own unknown-sender answer.
    if (result && result.reply === UNKNOWN_SENDER_REPLY) {
      try { result = { ...result, reply: publicReply(body), outcome: 'public_faq' }; } catch (_) {}
    }
    // A listed captain's text nobody could read: tell the commissioner (no phone in it).
    if (result && result.unread) {
      try {
        await sendPush({
          title: `Text from ${String(result.unread.name || 'a captain').slice(0, 60)} could not be read`,
          body: String(result.unread.body || '').slice(0, 300),
          category: 'admin', adminOnly: true, url: '/admin.html',
        }, { senderRole: 'system' });
      } catch (e) { console.warn('[sms-inbound] unread alert failed:', e && e.message); }
    }
    if (!result || !result.logId) {
      await logLine({ from, body, kind: 'score', outcome: (result && result.outcome) || 'unlogged', reply: (result && result.reply) || '', team_id: sender && sender.team_id, game_id: result && result.gameId });
    }
    return answer((result && result.reply) || '');
  } catch (e) {
    console.error('[sms-inbound]', lastFour(from), e && (e.stack || e.message));
    await logLine({ from, body, kind: 'inbound', outcome: 'error', reply: SORRY });
    return answer(SORRY);
  }
}

// Vercel must NOT parse the body: the Twilio signature covers the exact bytes.
// maxDuration: a box-score photo read can run past Twilio's 15 s (photo-boxscore.js
// finishes it in the background with waitUntil). Mirror it in vercel.json
// functions if this export is not honoured.
export const config = { api: { bodyParser: false }, maxDuration: 60 };
