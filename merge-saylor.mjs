// One-off: merge the two Jason Saylor player docs into one.
// Keeps the REGISTERED doc (has email/phone/waiver), fixes its capitalization
// from "Jason SAYLOR" → "Jason Saylor", migrates any RSVPs from the manual doc,
// then deletes the manual duplicate.
//
// Safe to re-run: idempotent (skips steps whose end state already holds).
// Run: node merge-saylor.mjs
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, getDoc, doc, query, where, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyDXuC-R0aPEX4F7lN5AKq48UC3r5whYzdg",
  authDomain: "dvsl-292dd.firebaseapp.com",
  projectId: "dvsl-292dd",
  storageBucket: "dvsl-292dd.firebasestorage.app",
  messagingSenderId: "145862305559",
  appId: "1:145862305559:web:153ec455bad57e17517952"
});
const db = getFirestore(app);

const MANUAL_ID   = '6DaN5oR4qPlLVzqcDBDy';                       // "Jason Saylor" (no contact, has RSVP)
const KEEP_ID     = 'reg__tbir__jesaylor23_gmail_com__2026';      // "Jason SAYLOR" (registered)
const CANONICAL   = 'Jason Saylor';

// 1) Fix the name casing on the kept doc.
const keepRef  = doc(db, 'players', KEEP_ID);
const keepSnap = await getDoc(keepRef);
if (!keepSnap.exists()) { console.error('❌ Keep-doc missing:', KEEP_ID); process.exit(1); }
const keepData = keepSnap.data();
if (keepData.name !== CANONICAL) {
  await updateDoc(keepRef, { name: CANONICAL });
  console.log(`✓ Renamed ${KEEP_ID}: "${keepData.name}" → "${CANONICAL}"`);
} else {
  console.log(`= ${KEEP_ID} name already "${CANONICAL}"`);
}

// 2) Migrate availability (RSVP) docs pointing at the manual ID → kept ID.
//    Availability doc IDs are shaped `${team}_${gameId}_${playerId}` per captain.html,
//    so we must create a NEW doc at the kept-ID-shaped key and delete the old one
//    (you can't change a Firestore doc ID in place).
const availSnap = await getDocs(query(collection(db, 'availability'), where('player_id','==',MANUAL_ID)));
if (availSnap.empty) {
  console.log('= no availability docs to migrate');
} else {
  for (const d of availSnap.docs) {
    const a = d.data();
    const newDocId = `${a.team_id}_${a.game_id}_${KEEP_ID}`;
    const newRef   = doc(db, 'availability', newDocId);
    const existing = await getDoc(newRef);
    const merged = {
      ...a,
      player_id: KEEP_ID,
      player_name: CANONICAL,
      updated_at: new Date().toISOString(),
    };
    if (existing.exists()) {
      // Keep the later-updated status if both already exist.
      const cur = existing.data();
      const curTs = Date.parse(cur.updated_at || 0) || 0;
      const oldTs = Date.parse(a.updated_at || 0) || 0;
      if (oldTs > curTs) {
        await setDoc(newRef, merged);
        console.log(`✓ availability ${newDocId}: overwrote with newer manual-doc RSVP`);
      } else {
        console.log(`= availability ${newDocId}: kept existing (newer/same)`);
      }
    } else {
      await setDoc(newRef, merged);
      console.log(`✓ availability ${newDocId}: created (migrated from ${d.id})`);
    }
    await deleteDoc(doc(db, 'availability', d.id));
    console.log(`✗ availability ${d.id}: deleted`);
  }
}

// 3) Delete the manual duplicate player doc.
const manualRef  = doc(db, 'players', MANUAL_ID);
const manualSnap = await getDoc(manualRef);
if (manualSnap.exists()) {
  await deleteDoc(manualRef);
  console.log(`✗ players/${MANUAL_ID}: deleted`);
} else {
  console.log(`= players/${MANUAL_ID}: already gone`);
}

console.log('\nDone.');
process.exit(0);
