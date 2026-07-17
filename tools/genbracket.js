// Generates the 2026 DVSL playoff bracket markup (Gold + Silver).
// 8-team double elimination each, matching the 2025 markup/classes in
// playoffs-content.html. Re-run with real names once seeding is final.

const DATES = {
  r1:    '7/22',   // Wed
  semis: '7/27',   // Mon
  lr1:   '7/27',   // Mon
  lr2:   '7/29',   // Wed
  wfin:  '8/3',    // Mon
  lsemi: '8/3',    // Mon
  lfin:  '8/5',    // Wed
  champ: '8/10',   // Mon
  ifnec: '8/12',   // Wed
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// row: seed tag, name (null => TBD/muted), optional score
function row(seed, name, muted) {
  const nm = name == null ? 'TBD' : name;
  const style = (name == null || muted) ? ' style="color:var(--muted)"' : '';
  return `            <div class="team-row"><span class="team-seed">${esc(seed)}</span><span class="team-name"${style}>${esc(nm)}</span><span class="team-score">—</span></div>`;
}
function matchup(cls, gameNo, info, rows) {
  return `          <div class="matchup ${cls}">
            <div class="matchup-game"><span>GAME ${gameNo}</span><span class="game-info">${esc(info)}</span></div>
${rows.join('\n')}
          </div>`;
}
const spacer = h => `          <div style="height:${h}px"></div>`;

// connector blocks lifted verbatim from the 2025 bracket
const CONN_4_2 = `        <div style="display:flex;flex-direction:column;min-width:32px;flex-shrink:0;padding-top:40px;">
          <div style="flex:1;border-right:1px solid rgba(0,0,0,0.12);border-bottom:1px solid rgba(0,0,0,0.12);border-radius:0 0 4px 0;margin-top:30px;"></div>
          <div style="width:32px;height:1px;background:rgba(0,0,0,0.12);"></div>
          <div style="flex:1;border-right:1px solid rgba(0,0,0,0.12);border-top:1px solid rgba(0,0,0,0.12);border-radius:0 4px 0 0;margin-bottom:30px;"></div>
          <div style="flex:0;height:24px;"></div>
          <div style="flex:1;border-right:1px solid rgba(0,0,0,0.12);border-bottom:1px solid rgba(0,0,0,0.12);border-radius:0 0 4px 0;margin-top:30px;"></div>
          <div style="width:32px;height:1px;background:rgba(0,0,0,0.12);"></div>
          <div style="flex:1;border-right:1px solid rgba(0,0,0,0.12);border-top:1px solid rgba(0,0,0,0.12);border-radius:0 4px 0 0;margin-bottom:30px;"></div>
        </div>`;
const CONN_2_1 = `        <div style="display:flex;flex-direction:column;min-width:32px;flex-shrink:0;padding-top:90px;">
          <div style="flex:1;border-right:1px solid rgba(0,0,0,0.12);border-bottom:1px solid rgba(0,0,0,0.12);border-radius:0 0 4px 0;margin-top:25px;"></div>
          <div style="width:32px;height:1px;background:rgba(0,0,0,0.12);"></div>
          <div style="flex:1;border-right:1px solid rgba(0,0,0,0.12);border-top:1px solid rgba(0,0,0,0.12);border-radius:0 4px 0 0;margin-bottom:25px;"></div>
        </div>`;
const CONN_CHAMP = `        <div style="display:flex;flex-direction:column;min-width:32px;flex-shrink:0;padding-top:210px;">
          <div style="width:32px;height:1px;background:rgba(0,45,114,0.4);"></div>
        </div>`;
const CONN_L = `        <div style="display:flex;flex-direction:column;min-width:32px;flex-shrink:0;padding-top:36px;">
          <div style="flex:1;border-right:1px solid rgba(0,45,114,0.25);border-bottom:1px solid rgba(0,45,114,0.25);border-radius:0 0 4px 0;margin-top:24px;"></div>
          <div style="width:32px;height:1px;background:rgba(0,45,114,0.25);"></div>
          <div style="flex:1;border-right:1px solid rgba(0,45,114,0.25);border-top:1px solid rgba(0,45,114,0.25);border-radius:0 4px 0 0;margin-bottom:24px;"></div>
        </div>`;
const CONN_L_LINE = `        <div style="display:flex;flex-direction:column;min-width:32px;flex-shrink:0;padding-top:60px;">
          <div style="width:32px;height:1px;background:rgba(0,45,114,0.25);"></div>
        </div>`;

// seeds: array of 8 (index 0 = bracket seed 1). null => TBD.
// seedLabel: maps bracket seed -> displayed seed number (Gold 1-8, Silver 9-16)
function buildBracket({ canvasId, dataBracket, show, heading, seeds, seedOffset }) {
  const S = n => seeds[n - 1];                 // team name for bracket seed n
  const L = n => String(n + seedOffset);       // displayed seed label

  const wb = [
    matchup('winner-bracket', 1, `${DATES.r1} · TBD`, [row(L(1), S(1)), row(L(8), S(8))]),
    spacer(24),
    matchup('winner-bracket', 2, `${DATES.r1} · TBD`, [row(L(4), S(4)), row(L(5), S(5))]),
    spacer(24),
    matchup('winner-bracket', 3, `${DATES.r1} · TBD`, [row(L(3), S(3)), row(L(6), S(6))]),
    spacer(24),
    matchup('winner-bracket', 4, `${DATES.r1} · TBD`, [row(L(2), S(2)), row(L(7), S(7))]),
  ].join('\n');

  const semis = [
    matchup('winner-bracket', 5, `${DATES.semis} · TBD`, [row('W1', 'Winner G1', true), row('W2', 'Winner G2', true)]),
    spacer(80),
    matchup('winner-bracket', 6, `${DATES.semis} · TBD`, [row('W3', 'Winner G3', true), row('W4', 'Winner G4', true)]),
  ].join('\n');

  const wfinal = matchup('winner-bracket', 7, `${DATES.wfin} · TBD`, [row('W5', 'Winner G5', true), row('W6', 'Winner G6', true)]);

  const champ = [
    matchup('champ-bracket', 14, `${DATES.champ} · TBD`, [row('W7', 'Winner G7', true), row('W13', 'Winner G13', true)]),
    spacer(20),
    `          <div class="matchup champ-bracket tbd">
            <div class="matchup-game" style="color:var(--gold)"><span>GAME 15</span><span class="game-info">${DATES.ifnec} if necessary · TBD</span></div>
            <div class="team-row"><span class="team-seed"></span><span class="team-name" style="color:var(--muted)">If needed</span><span class="team-score">—</span></div>
            <div class="team-row"><span class="team-seed"></span><span class="team-name" style="color:var(--muted)">If needed</span><span class="team-score">—</span></div>
          </div>`,
  ].join('\n');

  const lr1 = [
    matchup('loser-bracket', 8, `${DATES.lr1} · TBD`, [row('L1', 'Loser G1', true), row('L2', 'Loser G2', true)]),
    spacer(16),
    matchup('loser-bracket', 9, `${DATES.lr1} · TBD`, [row('L3', 'Loser G3', true), row('L4', 'Loser G4', true)]),
  ].join('\n');

  const lr2 = [
    matchup('loser-bracket', 10, `${DATES.lr2} · TBD`, [row('L5', 'Loser G5', true), row('W9', 'Winner G9', true)]),
    spacer(16),
    matchup('loser-bracket', 11, `${DATES.lr2} · TBD`, [row('L6', 'Loser G6', true), row('W8', 'Winner G8', true)]),
  ].join('\n');

  const lsemi = matchup('loser-bracket', 12, `${DATES.lsemi} · TBD`, [row('W10', 'Winner G10', true), row('W11', 'Winner G11', true)]);
  const lfinal = matchup('loser-bracket', 13, `${DATES.lfin} · TBD`, [row('W12', 'Winner G12', true), row('L7', 'Loser G7', true)]);

  return `  <div class="bracket-canvas${show ? ' active' : ''}" id="${canvasId}" data-bracket="${dataBracket}" style="display:${show ? 'block' : 'none'}">
    <div class="bracket-scroll">

      <div style="padding:20px 0 4px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#002D72;">${esc(heading)}</div>

      <div style="padding: 28px 0 4px; font-size:11px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:var(--green);">Winner's Bracket</div>

      <div class="bracket-wrap">

        <div class="b-col">
          <div class="b-col-label">Round 1 · ${DATES.r1}</div>
${wb}
        </div>

${CONN_4_2}

        <div class="b-col" style="justify-content:space-around;padding-top:50px;">
          <div class="b-col-label">Semis · ${DATES.semis}</div>
${semis}
        </div>

${CONN_2_1}

        <div class="b-col" style="padding-top:170px;">
          <div class="b-col-label">W-Final · ${DATES.wfin}</div>
${wfinal}
        </div>

${CONN_CHAMP}

        <div class="b-col" style="padding-top:140px;">
          <div class="b-col-label">Championship · ${DATES.champ}</div>
${champ}
        </div>

      </div>

      <div style="padding: 40px 0 4px; font-size:11px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:var(--blue);">Loser's Bracket</div>

      <div class="bracket-wrap">

        <div class="b-col">
          <div class="b-col-label">L-Round 1 · ${DATES.lr1}</div>
${lr1}
        </div>

${CONN_L}

        <div class="b-col" style="padding-top:20px;">
          <div class="b-col-label">L-Bracket · ${DATES.lr2}</div>
${lr2}
        </div>

${CONN_L}

        <div class="b-col" style="padding-top:20px;">
          <div class="b-col-label">L-Semis · ${DATES.lsemi}</div>
${lsemi}
        </div>

${CONN_L_LINE}

        <div class="b-col" style="padding-top:20px;">
          <div class="b-col-label">L-Final · ${DATES.lfin}</div>
${lfinal}
        </div>

      </div>
    </div>
  </div>`;
}

// ── Seeding ───────────────────────────────────────────────────────────
// Seeds 1-6 are mathematically locked. 7/8 = Beth Or Red + Beth Or Blue in
// some order, decided by their head-to-head on Mon 7/20.
const GOLD = ['SA', 'GOLD', 'BA', 'OA', 'TBIR', 'BSMC', null, null];
// Silver = league seeds 9-16. KI is locked at 9; 10-16 settle on 7/20.
const SILVER = ['KI', null, null, null, null, null, null, null];

const out = `  <!-- 2026 PANE: brackets. Seeds 1-6 locked; 7/8 (Beth Or Red / Beth Or
       Blue) and Silver 10-16 fill in after the last regular-season games
       on Mon 7/20. Generated by scratchpad/genbracket.js — re-run to refill. -->
  <div class="year-pane active" id="year-2026" role="tabpanel" aria-labelledby="2026">

  <div class="bracket-tabs">
    <button class="b-tab active" data-bracket="gold">Gold Bracket</button>
    <button class="b-tab" data-bracket="silver">Silver Bracket</button>
  </div>

  <div class="bracket-legend">
    <div class="legend-item"><div class="legend-bar" style="background:var(--green)"></div>Winner's Bracket</div>
    <div class="legend-item"><div class="legend-bar" style="background:var(--blue)"></div>Loser's Bracket</div>
    <div class="legend-item"><div class="legend-bar" style="background:var(--gold)"></div>Championship</div>
    <div class="legend-item"><span style="color:var(--gold);font-weight:700;font-size:13px;">★</span>&nbsp;Champion</div>
  </div>

${buildBracket({ canvasId: 'bracket-gold-2026', dataBracket: 'gold', show: true, heading: 'Gold Cup · 2026 Playoffs · Seeds 1-8', seeds: GOLD, seedOffset: 0 })}

${buildBracket({ canvasId: 'bracket-silver-2026', dataBracket: 'silver', show: false, heading: 'Silver Cup · 2026 Playoffs · Seeds 9-16', seeds: SILVER, seedOffset: 8 })}

  </div>`;

process.stdout.write(out);
