// Public auto-reply for the DVSL text number.
//
// A listed captain (sms_senders) gets the full Text a Score conversation. This
// is only for everyone else: a player, a parent, a team that texts the number
// out of the blue. Instead of "this number is not set up to text in scores"
// they get a short, useful answer and the site.
//
// Wired in api/sms-inbound.js, used only when the engine answers with its
// UNKNOWN_SENDER_REPLY, so it never replaces a captain's score or question.
//
// Season wording stays neutral on purpose (no dates, no fees): nothing here
// goes stale between seasons. Keep each reply short, plain ASCII, no links in
// a form other than the bare site name. The "DVSL: " brand prefix is added by
// the webhook.

export const SITE = 'dvsl.vercel.app';

export const REPLY = {
  register: `To join the league, register on the site: ${SITE}/registration.html. Your team captain approves new players.`,
  captain: `Captains: to text in scores, ask the commissioner to add this number. Then text the final, like DN 12 SA 9. Text MENU for more.`,
  scores: `Scores, standings and the schedule are on the site: ${SITE}`,
  texts: `To get your team's texts (rainouts, schedule changes), sign up at ${SITE}/sms.html. Reply STOP any time to opt out.`,
  hello: `Thanks for texting the Delaware Valley Softball League. Schedule, scores and sign-up: ${SITE}`,
};

/** The reply for one text from a number that is not on the list. */
export function publicReply(body) {
  const t = String(body == null ? '' : body).toLowerCase();
  if (/regist|sign\s*up|signup|join the league|join a team|how (do i|do we|to) (join|play|register|sign)|waiver/.test(t)) return REPLY.register;
  // Someone texting a score ("DN 12 SA 9", "we won 7-5") is a captain whose
  // number is not on the list yet.
  const looksLikeScore = /[a-z]/.test(t) && /\b\d{1,2}\b\D{1,30}\b\d{1,2}\b/.test(t);
  if (looksLikeScore || /\bcaptain|\bmanager|text (in )?(a |the )?score|report (a |the )?score/.test(t)) return REPLY.captain;
  if (/\btexts?\b|alert|notif|rainout|rained/.test(t)) return REPLY.texts;
  if (/score|standing|schedule|when|where|field|game|tonight|time/.test(t)) return REPLY.scores;
  return REPLY.hello;
}
