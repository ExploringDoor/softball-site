// One-off: update jersey numbers for Beth Or Red players.
// Matches by last-name substring on `name`, restricted to team === 'bor'.
// Run: node update-bor-numbers.mjs
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyDXuC-R0aPEX4F7lN5AKq48UC3r5whYzdg",
  authDomain: "dvsl-292dd.firebaseapp.com",
  projectId: "dvsl-292dd",
  storageBucket: "dvsl-292dd.firebasestorage.app",
  messagingSenderId: "145862305559",
  appId: "1:145862305559:web:153ec455bad57e17517952"
});
const db = getFirestore(app);

// last-name (lowercase) -> jersey number
const TARGETS = [
  { last: 'goldshteyn', num: 1 },
  { last: 'rappaport',  num: 2 },
  { last: 'erlbaum',    num: 4 },
  { last: 'fleekop',    num: 6 },
  { last: 'mintz',      num: 7 },
  { last: 'chasen',     num: 9 },  // M. Chasen
  { last: 'aliaga',     num: 10 },
  { last: 'bonder',     num: 13 },
  { last: 'simon',      num: 15 },
  { last: 'ice',        num: 16 },
  { last: 'hogan',      num: 17 },
  { last: 'kollender',  num: 20 },
  { last: 'katz',       num: 22 },
  { last: 'hersh',      num: 23 },
  { last: 'kundtz',     num: 24 },
  { last: 'wallis',     num: 26 },
  { last: 'wilderman',  num: 33 },
  { last: 'rosenfeld',  num: 34 },
];

const snap = await getDocs(collection(db, 'players'));
const bor = snap.docs.filter(d => (d.data().team || '').toLowerCase() === 'bor');
console.log(`Found ${bor.length} BOR players total\n`);

let updated = 0, skipped = 0, missed = [];

for (const t of TARGETS) {
  // Match case-insensitive last-name substring
  const matches = bor.filter(d => (d.data().name || '').toLowerCase().includes(t.last));
  if (matches.length === 0) {
    missed.push(t.last);
    continue;
  }
  if (matches.length > 1) {
    console.log(`⚠️  ${t.last}: ${matches.length} matches — ${matches.map(m => m.data().name).join(', ')}`);
    // For Chasen ("M. Chasen"), prefer exact name starting with "M"
    let pick = matches[0];
    if (t.last === 'chasen') {
      const m = matches.find(x => /^m/i.test(x.data().name.trim()));
      if (m) pick = m;
    }
    await updateDoc(doc(db, 'players', pick.id), { num: String(t.num) });
    console.log(`   → updated ${pick.data().name} to #${t.num}`);
    updated++;
    continue;
  }
  const d = matches[0];
  const cur = d.data().num;
  if (String(cur) === String(t.num)) { skipped++; console.log(`= ${d.data().name} already #${t.num}`); continue; }
  await updateDoc(doc(db, 'players', d.id), { num: String(t.num) });
  console.log(`✓ ${d.data().name}: ${cur || '(blank)'} → #${t.num}`);
  updated++;
}

console.log(`\nDone. Updated ${updated}, already-correct ${skipped}, not found: ${missed.length ? missed.join(', ') : 'none'}`);
process.exit(0);
