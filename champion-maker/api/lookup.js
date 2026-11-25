// GET /api/lookup?url=<a USSSA event link or event number>
//   -> { ok, source, event: { name, dates, location, logo }, champions: [...], waiting: [...] }
// GET /api/lookup?img=<a USSSA picture address>
//   -> the picture itself, so the page can draw it (USSSA sends no CORS header)
//
// The page cannot ask USSSA directly: USSSA's API answers a browser on another site with no
// CORS header, so this small function asks for it. That makes it a proxy, and an open proxy
// gets abused, so it is deliberately narrow:
//   - it only ever calls www.usssa.com/api and only with a numeric event id
//   - the picture route only fetches https pictures from usssa.com hosts, capped in size
//   - one address gets a limited number of lookups per ten minutes
//
// Works as a Vercel function and under dev-server.mjs. No dependencies.

const USSSA_API = 'https://www.usssa.com/api/';
const TIMEOUT_MS = 12000;
const MAX_DIVISIONS = 60;
const MAX_IN_FLIGHT = 4;          // a burst of calls gets USSSA's rate limiter, not answers
const IMG_MAX_BYTES = 4 * 1024 * 1024;

// ---- per address limit (per warm instance; the narrow scope above is the real guard) ----
const hits = new Map();
function tooMany(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return true; }
  list.push(now); hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return false;
}
function clientIp(req) {
  const h = req.headers || {};
  return String(h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',').pop() || 'local').trim().slice(0, 60);
}

// ---- small readers. null, undefined and "" are NOT zero: USSSA sends null for a game that
// has not been played, and Number(null) is 0, which would read as a finished 0 to 0 game. ----
const str = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const num = (v) => {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

let inFlight = 0;
const waiting = [];
async function gate(fn) {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise((r) => waiting.push(r));
  inFlight++;
  try { return await fn(); } finally { inFlight--; const next = waiting.shift(); if (next) next(); }
}
// Returns the parsed answer, null for "USSSA said no", or undefined for "could not ask".
async function post(action, fields) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(USSSA_API + '?action=' + encodeURIComponent(action), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
        signal: ctl.signal,
      });
      if (res.status < 500 && res.status !== 429) return res.ok ? await res.json() : null;
    } catch (e) { /* timeout or network: try once more */ } finally { clearTimeout(timer); }
    await new Promise((r) => setTimeout(r, 350));
  }
  return undefined;
}

// The event number out of whatever was pasted: "...?eventID=417840", ".../event/name/417840",
// or just the number.
export function eventIdFrom(input) {
  const s = String(input || '').trim();
  if (/^\d{4,8}$/.test(s)) return { id: s };
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return { error: 'not_a_link' }; }
  if (!/(^|\.)usssa\.com$/i.test(u.hostname)) return { error: 'unsupported', host: u.hostname };
  for (const [k, v] of u.searchParams) if (/^(eventid|event_id|id)$/i.test(k) && /^\d{4,8}$/.test(v)) return { id: v };
  const m = u.pathname.match(/(?:^|\/)(\d{5,8})(?:\/|$)/);
  return m ? { id: m[1] } : { error: 'no_event_number' };
}

function tidyDates(d) { return str(d).replace(/\s*-\s*/g, '-').replace(/\s+/g, ' '); }
function titleCase(s) {
  const t = str(s);
  if (!t || t !== t.toUpperCase()) return t;              // only fix ALL CAPS
  return t.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b([A-Za-z]{2})$/, (m) => (/,\s*[A-Za-z]{2}$/.test(t) ? m.toUpperCase() : m));
}

// One division's champion out of its results report, or null when USSSA has not placed anyone.
// ⚠ Only `finish` says who won. `topTeams` is filled from POOL standings the moment pool play
// ends, and `place` is a points standing the host can override, so neither is ever used.
export function championFrom(report, label) {
  if (!report || report.template !== 'divisionReport') return null;
  const rows = Array.isArray(report.tournamentResults) ? report.tournamentResults : [];
  const first = rows.filter((r) => num(r.finish) === 1);
  if (first.length !== 1) return null;                    // nobody placed yet, or co-champions
  const champ = first[0], name = str(champ.teamname);
  if (!name) return null;
  const second = rows.filter((r) => num(r.finish) === 2);
  const runner = second.length === 1 ? second[0] : null;

  // The final: the championship game the champion won. GameType 5 is USSSA's championship.
  const games = (Array.isArray(report.bracketGames) ? report.bracketGames : []).filter((g) => num(g.WinnersScore) != null && num(g.LosersScore) != null);
  const wonByChamp = games.filter((g) => num(g.WinningTeamID) === num(champ.team_id));
  let final = wonByChamp.filter((g) => num(g.GameType) === 5).sort((a, b) => num(b.GameNumber) - num(a.GameNumber))[0];
  if (!final && runner) final = wonByChamp.filter((g) => num(g.LosingTeamID) === num(runner.team_id)).sort((a, b) => num(b.GameNumber) - num(a.GameNumber))[0];
  const w = num(champ.wins), l = num(champ.loses), t = num(champ.tie);
  return {
    division: label,
    team: name,
    runnerUp: final ? str(final.LosingTeamName) : runner ? str(runner.teamname) : '',
    score: final ? num(final.WinnersScore) + '-' + num(final.LosersScore) : '',
    record: w == null || l == null ? '' : w + '-' + l + (t ? '-' + t : ''),
  };
}

async function lookup(eventID) {
  const raw = await gate(() => post('selpV2', { eventID, tabName: 'gameCenter' }));
  if (raw === undefined) return { status: 502, body: { ok: false, error: 'unreachable', message: 'USSSA did not answer. Try again in a minute.' } };
  const info = (raw && raw.info) || {};
  if (!str(info.name)) return { status: 404, body: { ok: false, error: 'not_found', message: 'USSSA has no event with that number.' } };

  const divisions = [];
  for (const g of Array.isArray(raw.gameCenterMenu) ? raw.gameCenterMenu : []) {
    for (const c of Array.isArray(g.ageClasses) ? g.ageClasses : []) {
      const hasResults = (Array.isArray(c.options) ? c.options : []).some((o) => str(o.optionID) === 'results');
      const age = str(c.age || g.age);
      const label = [age ? age.replace(/u$/i, '') + 'U' : '', str(c.Class)].filter(Boolean).join(' ');
      if (str(c.divisionID)) divisions.push({ id: str(c.divisionID), label, hasResults });
    }
  }
  const champions = [], waitingOn = [], failed = [];
  await Promise.all(divisions.slice(0, MAX_DIVISIONS).map(async (d) => {
    if (!d.hasResults) { waitingOn.push(d.label); return; }
    const gmParams = JSON.stringify({ eventID, divisionID: d.id, bnp: '0', bf: '0', option: 'results', isWinner: '0' });   // ONE field, encoded once
    const rep = await gate(() => post('getGameCenterContent', { gmParams }));
    if (rep === undefined) { failed.push(d.label); return; }          // could not ask is not "no champion"
    const c = championFrom(rep, d.label);
    if (c) champions.push(c); else waitingOn.push(d.label);
  }));
  const order = new Map(divisions.map((d, i) => [d.label, i]));
  const byOrder = (a, b) => order.get(a.division || a) - order.get(b.division || b);
  const logo = str(info.logo);
  return {
    status: 200,
    body: {
      ok: true, source: 'USSSA', eventId: eventID,
      event: { name: titleCase(info.name), dates: tidyDates(info.dates), location: titleCase(info.location), logo: okImageUrl(logo) ? '/api/lookup?img=' + encodeURIComponent(logo) : '' },
      champions: champions.sort(byOrder), waiting: waitingOn.sort(byOrder), failed: failed.sort(byOrder),
    },
  };
}

function okImageUrl(s) {
  try { const u = new URL(s); return u.protocol === 'https:' && /(^|\.)usssa\.com$/i.test(u.hostname) && !u.username && !u.port; } catch (e) { return false; }
}
async function image(url, res) {
  if (!okImageUrl(url)) { res.statusCode = 400; return res.end('bad picture address'); }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'error' });
    const type = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!r.ok || !/^image\/(png|jpeg|jpg|gif|webp)$/.test(type)) { res.statusCode = 404; return res.end('no picture'); }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > IMG_MAX_BYTES) { res.statusCode = 413; return res.end('picture too large'); }
    res.statusCode = 200;
    res.setHeader('Content-Type', type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.end(buf);
  } catch (e) { res.statusCode = 502; return res.end('could not fetch picture'); } finally { clearTimeout(timer); }
}

export default async function handler(req, res) {
  const send = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); };
  if (req.method !== 'GET') return send(405, { ok: false, error: 'method' });
  const q = new URL(req.url, 'http://x').searchParams;
  const ip = clientIp(req);

  if (q.get('img')) {
    if (tooMany('img:' + ip, 60, 10 * 60 * 1000)) { res.statusCode = 429; return res.end('slow down'); }
    return image(q.get('img'), res);
  }
  if (tooMany('look:' + ip, 20, 10 * 60 * 1000)) return send(429, { ok: false, error: 'slow_down', message: 'That is a lot of lookups. Wait a few minutes and try again.' });

  const id = eventIdFrom(q.get('url'));
  if (id.error === 'unsupported') return send(400, { ok: false, error: id.error, message: 'Right now this reads USSSA event links only. You can still type the details in below.' });
  if (id.error) return send(400, { ok: false, error: id.error, message: 'That does not look like a USSSA event link. Paste the link to your event page, or just the event number.' });
  try {
    const out = await lookup(id.id);
    if (out.status === 200) res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return send(out.status, out.body);
  } catch (e) {
    return send(500, { ok: false, error: 'server', message: 'Something went wrong reading that event. You can still type the details in below.' });
  }
}
