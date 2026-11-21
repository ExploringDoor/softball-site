// Team texts (Builder C): the words for "text my team", pure.
//
// Templates:
//   cancel  "DVSL: Tonight's game vs Shir Ami is CANCELLED. From your Or Ami captain. Reply STOP to opt out."
//   move    "DVSL: Tonight's game vs Shir Ami is MOVED to Mondauk 5 at 7:00 PM. From ... Reply STOP to opt out."
//   free    "DVSL: <up to 300 characters>. From ... Reply STOP to opt out."
// The opponent is named from each receiving team's side, so one cancel sent
// to both teams of a game is two different texts.
import { dayLabel, formatTime12, shortField } from './core.js';

export const TEMPLATES = ['cancel', 'move', 'free'];
export const FREE_MAX = 300;
export const MOVE_MAX = 80;

export function cleanText(s, max) {
  const t = String(s == null ? '' : s)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return t.length > max ? null : t;
}

export function whenPhrase(game, today) {
  if (game.date === today) return { cap: "Tonight's game", low: "tonight's game" };
  return { cap: `The ${dayLabel(game.date)} game`, low: `the ${dayLabel(game.date)} game` };
}

export function whereNow(game) {
  return [dayLabel(game.date), game.time ? formatTime12(game.time) : '', shortField(game.field) ? 'at ' + shortField(game.field) : '']
    .filter(Boolean).join(' ').replace(/ (\d{1,2}:\d{2} [AP]M)/, ', $1');
}

export function signOff({ isAdmin, teamName }) {
  return isAdmin ? 'From the DVSL office.' : `From your ${teamName} captain.`;
}

// game: { date, time, field, away, home } (team ids); teamId: receiving team.
export function buildBody({ template, game = null, teamId, teamNames, text = '', moveTo = '', today, isAdmin, senderTeamName }) {
  const from = signOff({ isAdmin, teamName: senderTeamName || teamNames[teamId] || teamId });
  const tail = ` ${from} Reply STOP to opt out.`;
  if (template === 'free') {
    const t = cleanText(text, FREE_MAX);
    if (!t) return { error: t === null ? 'too-long' : 'empty' };
    const end = /[.!?]$/.test(t) ? '' : '.';
    return { body: `DVSL: ${t}${end}${tail}` };
  }
  if (!game) return { error: 'no-game' };
  const opp = game.away === teamId ? game.home : game.home === teamId ? game.away : null;
  if (!opp) return { error: 'not-your-game' };
  const vs = teamNames[opp] || 'your opponent';
  const w = whenPhrase(game, today);
  if (template === 'cancel') return { body: `DVSL: ${w.cap} vs ${vs} is CANCELLED.${tail}` };
  if (template === 'move') {
    const to = moveTo ? cleanText(moveTo, MOVE_MAX) : whereNow(game);
    if (to === null) return { error: 'too-long' };
    if (!to) return { error: 'empty' };
    return { body: `DVSL: ${w.cap} vs ${vs} is MOVED to ${to.replace(/[.]$/, '')}.${tail}` };
  }
  return { error: 'bad-template' };
}

// GSM-7 texts split at 153 characters a segment, anything else at 67.
export function segments(body) {
  const gsm = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅå_ÆæßÉ!"#%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/.test(body);
  const n = body.length;
  if (gsm) return n <= 160 ? 1 : Math.ceil(n / 153);
  return n <= 70 ? 1 : Math.ceil(n / 67);
}
