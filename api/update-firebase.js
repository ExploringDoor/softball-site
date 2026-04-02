// Vercel Serverless Function — /api/update-firebase.js
// Receives parsed box score data and writes everything to Firebase

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { parsed, gameId, awayTeamId, homeTeamId, date, week, field, recap } = req.body;
  const FB_KEY = process.env.FIREBASE_API_KEY;
  const FB_PROJECT = 'dvsl-292dd';
  const FB_BASE = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;

  const results = [];
  const log = (msg) => results.push(msg);

  try {
    const { awayScore, homeScore, awayBatters, homeBatters, awayPitchers, homePitchers, linescore, notes } = parsed;
    const awayWin = awayScore > homeScore;

    // ── Helper: Firestore REST API ────────────────────────
    async function fsGet(path) {
      const r = await fetch(`${FB_BASE}/${path}?key=${FB_KEY}`);
      return r.ok ? r.json() : null;
    }
    async function fsPatch(path, fields) {
      const body = { fields: toFirestore(fields) };
      const fieldPaths = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
      const r = await fetch(`${FB_BASE}/${path}?${fieldPaths}&key=${FB_KEY}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return r.json();
    }
    async function fsCreate(collection, fields) {
      const r = await fetch(`${FB_BASE}/${collection}?key=${FB_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFirestore(fields) })
      });
      return r.json();
    }
    async function fsQuery(collection, field, op, value) {
      const r = await fetch(`${FB_BASE}:runQuery?key=${FB_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: collection }],
            where: { fieldFilter: { field: { fieldPath: field }, op, value: toFsValue(value) } }
          }
        })
      });
      const data = await r.json();
      return data.filter(d => d.document).map(d => ({
        id: d.document.name.split('/').pop(),
        ...fromFirestore(d.document.fields)
      }));
    }

    function toFsValue(v) {
      if (typeof v === 'string') return { stringValue: v };
      if (typeof v === 'number') return { doubleValue: v };
      if (typeof v === 'boolean') return { booleanValue: v };
      if (v === null) return { nullValue: null };
      return { stringValue: String(v) };
    }
    function toFirestore(obj) {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined) out[k] = { nullValue: null };
        else if (typeof v === 'boolean') out[k] = { booleanValue: v };
        else if (typeof v === 'number') out[k] = { doubleValue: v };
        else if (typeof v === 'string') out[k] = { stringValue: v };
        else if (Array.isArray(v)) out[k] = { arrayValue: { values: v.map(toFsValue) } };
        else out[k] = { stringValue: String(v) };
      }
      return out;
    }
    function fromFirestore(fields) {
      const out = {};
      for (const [k, v] of Object.entries(fields || {})) {
        if (v.stringValue !== undefined) out[k] = v.stringValue;
        else if (v.doubleValue !== undefined) out[k] = v.doubleValue;
        else if (v.integerValue !== undefined) out[k] = parseInt(v.integerValue);
        else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
        else if (v.nullValue !== undefined) out[k] = null;
        else if (v.arrayValue) out[k] = (v.arrayValue.values || []).map(x =>
          x.stringValue ?? x.doubleValue ?? x.integerValue ?? x.booleanValue ?? null
        );
        else out[k] = null;
      }
      return out;
    }

    // ── 1. Update game score ──────────────────────────────
    if (gameId) {
      const gameDoc = await fsGet(`games/${gameId}`);
      if (gameDoc) {
        const gd = fromFirestore(gameDoc.fields);
        const flip = gd.away === homeTeamId;
        await fsPatch(`games/${gameId}`, {
          away_score: flip ? homeScore : awayScore,
          home_score: flip ? awayScore : homeScore,
          done: true
        });
        log(`✓ Game score: ${awayScore}–${homeScore}`);
      }
    }

    // ── 2. Update team standings ──────────────────────────
    for (const [tid, isAway] of [[awayTeamId, true], [homeTeamId, false]]) {
      if (!tid) continue;
      const tDoc = await fsGet(`teams/${tid}`);
      if (!tDoc) continue;
      const t = fromFirestore(tDoc.fields);
      const win = isAway ? awayWin : !awayWin;
      const scored = isAway ? awayScore : homeScore;
      const conceded = isAway ? homeScore : awayScore;
      const w = (t.w || 0) + (win ? 1 : 0);
      const l = (t.l || 0) + (win ? 0 : 1);
      const str = t.streak || '';
      const sl = win ? 'W' : 'L';
      const sn = (str.startsWith(sl) ? parseInt(str.slice(1) || '0') : 0) + 1;
      await fsPatch(`teams/${tid}`, {
        w, l,
        pct: w + l > 0 ? Math.round((w / (w + l)) * 1000) / 1000 : 0,
        rs: (t.rs || 0) + scored,
        ra: (t.ra || 0) + conceded,
        streak: `${sl}${sn}`
      });
      log(`✓ ${t.name || tid}: ${w}-${l} (${sl}${sn})`);
    }

    // ── 3. Update player stats ────────────────────────────
    const allBatters = [
      ...(awayBatters || []).map(b => ({ ...b, teamId: awayTeamId })),
      ...(homeBatters || []).map(b => ({ ...b, teamId: homeTeamId }))
    ];

    // Load all players once
    const playersRes = await fetch(`${FB_BASE}/players?key=${FB_KEY}&pageSize=200`);
    const playersData = await playersRes.json();
    const allPlayers = (playersData.documents || []).map(d => ({
      id: d.name.split('/').pop(),
      ...fromFirestore(d.fields)
    }));

    for (const batter of allBatters) {
      const { name, teamId, ab = 0, r = 0, h = 0, hr = 0, rbi = 0, bb = 0, so = 0, errors = 0 } = batter;
      if (!name || ab === 0) continue;

      // Try to match player by name (first 6 chars of last name) on same team
      const nameLower = name.toLowerCase().trim();
      const nameParts = nameLower.split(' ');
      const lastName = nameParts[nameParts.length - 1];

      let matched = allPlayers.find(p => {
        if (p.team !== teamId) return false;
        const pn = (p.name || '').toLowerCase();
        if (pn === nameLower) return true;
        const pLast = pn.split(' ').pop();
        if (pLast.startsWith(lastName.substring(0, 6))) return true;
        if (pn.startsWith(nameLower.substring(0, 6))) return true;
        return false;
      });

      if (matched) {
        // Update existing player
        const tH = (matched.h || 0) + h;
        const tAB = (matched.ab || 0) + ab;
        const tHR = (matched.hr || 0) + hr;
        const tRBI = (matched.rbi || 0) + rbi;
        const tR = (matched.r || 0) + r;
        const tBB = (matched.bb || 0) + bb;
        const avg = tAB > 0 ? Math.round((tH / tAB) * 1000) / 1000 : 0;
        const slg = tAB > 0 ? Math.round(((tH + tHR) / tAB) * 1000) / 1000 : 0;
        const obp = (tAB + tBB) > 0 ? Math.round(((tH + tBB) / (tAB + tBB)) * 1000) / 1000 : 0;
        await fsPatch(`players/${matched.id}`, {
          h: tH, ab: tAB, hr: tHR, rbi: tRBI, r: tR, bb: tBB,
          avg, slg, ops: Math.round((slg + obp) * 1000) / 1000
        });
        log(`✓ ${matched.name}: .${String(Math.round(avg * 1000)).padStart(3, '0')} · ${tHR}HR · ${tRBI}RBI`);
      } else {
        // New player — add and flag for review
        await fsCreate('players', {
          name, num: batter.num || '??', team: teamId, pos: batter.pos || '??',
          avg: ab > 0 ? Math.round((h / ab) * 1000) / 1000 : 0,
          hr, rbi, h, ab, r, bb,
          slg: ab > 0 ? Math.round(((h + hr) / ab) * 1000) / 1000 : 0,
          ops: 0,
          needs_review: true,
          added_from: 'box_score_api'
        });
        log(`⚠ New player added (needs review): ${name}`);
      }
    }

    // ── 4. Save recap ─────────────────────────────────────
    if (recap || notes) {
      await fsCreate('recaps', {
        game_id: gameId || '',
        date: date || '',
        wk: week || 0,
        away: awayTeamId || '',
        home: homeTeamId || '',
        away_score: awayScore,
        home_score: homeScore,
        field: field || '',
        text: recap || notes || '',
        stars: [],
        created_at: new Date().toISOString()
      });
      log('✓ Recap saved');
    }

    log('🎉 All done! Site updates on next page load.');

    return res.status(200).json({ success: true, results });

  } catch (err) {
    console.error('update-firebase error:', err);
    return res.status(500).json({ error: err.message, results });
  }
}
