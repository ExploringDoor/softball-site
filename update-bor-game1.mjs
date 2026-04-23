// One-off: attach BOR Game 1 box score (vs DN, Apr 21 @ Mondauk 4) to the game doc.
// - Finds the games/* doc where away==='dn' && home==='bor' && date==='Apr 21'
// - Writes away_score:3, home_score:22, done:true
// - Writes box_scores/{gameId} in the same admin shape saveBoxScore() uses,
//   with BOR's 14 active batters plus 4 DNPs. No DN lineup / pitching.
// Run: node update-bor-game1.mjs
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, getDoc, doc, query, where, setDoc, updateDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyDXuC-R0aPEX4F7lN5AKq48UC3r5whYzdg",
  authDomain: "dvsl-292dd.firebaseapp.com",
  projectId: "dvsl-292dd",
  storageBucket: "dvsl-292dd.firebasestorage.app",
  messagingSenderId: "145862305559",
  appId: "1:145862305559:web:153ec455bad57e17517952"
});
const db = getFirestore(app);

// Per-player batting lines read from the Game 1 vs DN image.
// Columns: AB R H RBI BB 1B 2B 3B HR   (blank = 0, h = 1B+2B+3B+HR)
// Jersey #s from update-bor-numbers.mjs. `last` is a lowercase substring
// used to match the Firestore `players.name` for this team.
const ACTIVE = [
  { last: 'katz',       num:'22', ab:4, r:3, rbi:3, bb:0, s:3, d:0, t:0, hr:0 },
  { last: 'wilderman',  num:'33', ab:2, r:3, rbi:0, bb:2, s:2, d:0, t:0, hr:0 },
  { last: 'kollender',  num:'20', ab:3, r:2, rbi:3, bb:1, s:1, d:1, t:0, hr:1 },
  { last: 'mintz',      num:'7',  ab:3, r:2, rbi:2, bb:0, s:2, d:0, t:0, hr:0 },
  { last: 'kundtz',     num:'24', ab:3, r:0, rbi:0, bb:0, s:2, d:0, t:0, hr:0 },
  { last: 'wallis',     num:'26', ab:3, r:3, rbi:1, bb:0, s:3, d:0, t:0, hr:0 },
  { last: 'simon',      num:'15', ab:3, r:3, rbi:3, bb:0, s:2, d:1, t:0, hr:0 },
  { last: 'rosenfeld',  num:'34', ab:4, r:2, rbi:0, bb:0, s:3, d:0, t:0, hr:0 },
  { last: 'fleekop',    num:'6',  ab:3, r:1, rbi:4, bb:0, s:0, d:0, t:0, hr:1 },
  { last: 'hersh',      num:'23', ab:3, r:1, rbi:3, bb:0, s:2, d:0, t:0, hr:0 },
  { last: 'chasen',     num:'9',  ab:3, r:1, rbi:1, bb:0, s:3, d:0, t:0, hr:0, firstInitial:'m' },
  { last: 'aliaga',     num:'10', ab:1, r:0, rbi:1, bb:0, s:1, d:0, t:0, hr:0 },
  { last: 'goldshteyn', num:'1',  ab:1, r:0, rbi:0, bb:0, s:0, d:0, t:0, hr:0 },
  { last: 'erlbaum',    num:'4',  ab:3, r:1, rbi:1, bb:0, s:1, d:0, t:0, hr:0 },
];
const DNP = [
  { last: 'bonder',    num:'13' },
  { last: 'rappaport', num:'2'  },
  { last: 'hogan',     num:'17' },
  { last: 'ice',       num:'16' },
];

// 1) Look up the game.
const gamesSnap = await getDocs(query(
  collection(db, 'games'),
  where('away','==','dn'),
  where('home','==','bor'),
  where('date','==','Apr 21')
));
if (gamesSnap.empty) {
  console.error('❌ No game found: DN @ BOR on Apr 21');
  process.exit(1);
}
if (gamesSnap.size > 1) {
  console.error(`⚠️  ${gamesSnap.size} games matched; aborting so we don\'t pick the wrong one.`);
  gamesSnap.forEach(d => console.error(' -', d.id, d.data()));
  process.exit(1);
}
const gameDoc = gamesSnap.docs[0];
const gameId = gameDoc.id;
const gameData = gameDoc.data();
console.log(`✓ Game: ${gameId}  wk=${gameData.wk}  ${gameData.date}  ${gameData.field || ''}`);

// 2) Resolve player full names from Firestore.
const playersSnap = await getDocs(collection(db, 'players'));
const bor = playersSnap.docs.filter(d => (d.data().team || '').toLowerCase() === 'bor');
function pickName(last, firstInitial) {
  const matches = bor.filter(d => (d.data().name || '').toLowerCase().includes(last));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].data().name;
  if (firstInitial) {
    const pref = matches.find(x => (x.data().name || '').trim().toLowerCase().startsWith(firstInitial));
    if (pref) return pref.data().name;
  }
  console.warn(`⚠️  multiple matches for "${last}": ${matches.map(m=>m.data().name).join(', ')} — using first`);
  return matches[0].data().name;
}

// 3) Build the home_lineup array in admin-save shape.
function row(p, dnp) {
  const s = p.s||0, d = p.d||0, t = p.t||0, hr = p.hr||0;
  return {
    name: p.name, num: p.num, pos: '',
    ab: p.ab||0, r: p.r||0,
    s, d, t, hr, h: s+d+t+hr,
    rbi: p.rbi||0, bb: p.bb||0, so: 0,
    sac: 0, sf: 0, roe: 0, fc: 0,
    ...(dnp ? { dnp: true } : {})
  };
}
const home_lineup = [];
for (const p of ACTIVE) {
  const name = pickName(p.last, p.firstInitial);
  if (!name) { console.error(`❌ No BOR player matches "${p.last}"`); process.exit(1); }
  home_lineup.push(row({ ...p, name }, false));
}
// DNPs — include in the doc so lineup screen shows everyone.
for (const p of DNP) {
  const name = pickName(p.last);
  if (!name) { console.warn(`(skip DNP, not found: ${p.last})`); continue; }
  home_lineup.push(row({ name, num: p.num }, true));
}

const AWAY = 3, HOME = 22;
const innings = { away: [0,0,0,0,0,0,0], home: [0,0,0,0,0,0,0] };

const boxData = {
  game_id: gameId,
  wk: gameData.wk,
  date: gameData.date,
  away: gameData.away,
  home: gameData.home,
  away_lineup: [],
  home_lineup,
  away_pitchers: [],
  home_pitchers: [],
  innings,
  away_errors: 0,
  home_errors: 0,
  away_score: AWAY,
  home_score: HOME,
  status: 'final',
  recap: '',
  potg_name: '',
  potg_team: ''
};

// 4) Upsert box_scores/{gameId} (matches saveBoxScore's primary-ref logic).
const primaryRef = doc(db, 'box_scores', gameId);
const primarySnap = await getDoc(primaryRef);
if (primarySnap.exists()) {
  await updateDoc(primaryRef, boxData);
  console.log('✓ box_scores/' + gameId + ' updated');
} else {
  const q2 = query(collection(db, 'box_scores'), where('game_id','==',gameId));
  const snap = await getDocs(q2);
  const primary = snap.docs.find(d => !d.data().team_id);
  if (primary) {
    await updateDoc(doc(db,'box_scores',primary.id), boxData);
    console.log('✓ box_scores/' + primary.id + ' updated (legacy id)');
  } else {
    await setDoc(primaryRef, boxData);
    console.log('✓ box_scores/' + gameId + ' created');
  }
}

// 5) Update games/* with scores + done.
await updateDoc(doc(db,'games',gameId), { away_score: AWAY, home_score: HOME, done: true });
console.log(`✓ games/${gameId} → ${AWAY}-${HOME} final`);

// 6) Sanity — totals.
const tot = home_lineup.filter(p=>!p.dnp).reduce((a,p)=>({
  ab:a.ab+p.ab, r:a.r+p.r, h:a.h+p.h, rbi:a.rbi+p.rbi, bb:a.bb+p.bb,
  s:a.s+p.s, d:a.d+p.d, t:a.t+p.t, hr:a.hr+p.hr
}), {ab:0,r:0,h:0,rbi:0,bb:0,s:0,d:0,t:0,hr:0});
console.log('\nBOR totals:', tot);
console.log('Expected   :', {ab:39,r:22,h:29,rbi:22,bb:3,s:25,d:2,t:0,hr:2});
process.exit(0);
