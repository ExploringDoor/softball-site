// Phone numbers as Firestore document ids, for every sms_* collection.
//
// TEXTING.md keys sms_senders / sms_optins / sms_sessions by the phone in
// E.164, but api/_lib/dvsl.js only accepts [A-Za-z0-9_-] in a path, so "+" can
// not be in an id. The id is the E.164 number without its "+"
// ("+12155550100" -> "12155550100"); the full E.164 is stored in the doc's
// `phone` field. Every builder uses these two helpers so the ids agree.
//
// Phones are PII: log lastFour() only, never the number.
import { toE164US, lastFour } from './core.js';

export { toE164US, lastFour };

/** "+12155550100" (or "(215) 555-0100") -> "12155550100". "" when not a phone. */
export function phoneDocId(raw) {
  const e = toE164US(raw);
  if (!e) return '';
  const id = e.replace(/^\+/, '');
  return /^[0-9]{8,15}$/.test(id) ? id : '';
}

/** "12155550100" -> "+12155550100". */
export function e164FromDocId(id) {
  return /^[0-9]{8,15}$/.test(String(id || '')) ? '+' + id : '';
}
