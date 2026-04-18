// Seed the `captains` collection from the commissioner's captain-contact sheet.
//
// Usage:   node seed-captains.mjs
// Safe to re-run: uses deterministic doc IDs (`${team_id}_${email-local}`),
// so existing entries are overwritten, not duplicated.
//
// Each doc is the current captain record the login flow + admin directory
// reads. Extra fields (name, phone) are additive and do not break login.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const app = initializeApp({
  apiKey: "AIzaSyDXuC-R0aPEX4F7lN5AKq48UC3r5whYzdg",
  authDomain: "dvsl-292dd.firebaseapp.com",
  projectId: "dvsl-292dd",
  storageBucket: "dvsl-292dd.firebasestorage.app",
  messagingSenderId: "145862305559",
  appId: "1:145862305559:web:153ec455bad57e17517952"
});
const db = getFirestore(app);

// team_id -> display name, kept aligned with TEAMS collection
const TEAM_NAMES = {
  aj:    'Adath Jeshurun',
  ba:    'Beth Am',
  bob:   'Beth Or Blue',
  bor:   'Beth Or Red',
  bsb:   'Beth Sholom Blue',
  bsmc:  "Beth Sholom Men's Club",
  btbj:  "Beth Tikvah-B'Nai Jeshurun",
  cha:   'Chabad',
  dn:    'Darchei Noam Lightning',
  gjc:   'Germantown Jewish Centre',
  gold:  "Goldstein's",
  ki:    'Keneseth Israel',
  oa:    'Or Ami',
  sa:    'Shir Ami',
  tsbka: 'Temple Sinai Black/Kol Ami',
  tsmc:  "Temple Sinai Men's Club",
  tsg:   'Temple Sinai Green',
  tbimc: "Tifereth Bet Israel Men's Club",
  tbir:  'Tifereth Bet Israel Royals',
};

// Captains exactly as they appear on the commissioner's sheet
const CAPTAINS = [
  // Adath Jeshurun
  { team: 'aj', name: 'Howard Koval',       phone: '215-620-0025', email: 'hskoval@gmail.com' },
  { team: 'aj', name: 'Alan Resnick',       phone: '215-850-0933', email: 'alan.resnick10@gmail.com' },
  { team: 'aj', name: 'Adam Finestone',     phone: '610-505-2420', email: 'adamifinestone@gmail.com' },

  // Beth Am
  { team: 'ba', name: 'Bruce Klugman',      phone: '267-205-4771', email: 'chiefyn1983@gmail.com' },
  { team: 'ba', name: 'Eric Felt',          phone: '',             email: 'ericfeltromeo44@gmail.com' },

  // Beth Or Blue
  { team: 'bob', name: 'Michael Demar',     phone: '267-240-1409', email: 'mikedemar@comcast.net' },
  { team: 'bob', name: 'Craig Schulz',      phone: '215-360-2089', email: '2schulzcraig@gmail.com' },
  { team: 'bob', name: 'Michael Amerstein', phone: '',             email: 'mamerstein@gmail.com' },

  // Beth Or Red
  { team: 'bor', name: 'Jason Kundtz',      phone: '215-237-5749', email: 'kundtz1@yahoo.com' },

  // Beth Sholom Blue
  { team: 'bsb', name: 'Gary Kushner',      phone: '610-909-9301', email: 'gary.kushner@jefferson.edu' },

  // Beth Sholom Men's Club
  { team: 'bsmc', name: 'Max Miller',       phone: '215-605-3068', email: 'maxwellmiller88@gmail.com' },
  { team: 'bsmc', name: 'Steve Pilchik',    phone: '267-738-0202', email: 'shpilchik61@gmail.com' },

  // Beth Tikvah, B'Nai Jeshurun
  { team: 'btbj', name: 'Michael Drossner', phone: '215-514-6004', email: 'michael@drossnerlaw.com' },

  // Chabad
  { team: 'cha', name: 'Michael Cook',      phone: '267-254-3929', email: 'mecooklaw@gmail.com' },
  { team: 'cha', name: 'Rick Rosenstein',   phone: '267-626-1125', email: 'docdesi@gmail.com' },

  // Darchei Noam Lightning
  { team: 'dn', name: 'Aaron Mandelblott',  phone: '267-393-5717', email: 'amondel2@gmail.com' },
  { team: 'dn', name: 'Neal Jacobs',        phone: '610-233-6222', email: 'jacobsneal@yahoo.com' },

  // Germantown Jewish Centre
  { team: 'gjc', name: 'Joel Fish',         phone: '215-266-4350', email: 'joelfish3@aol.com' },
  { team: 'gjc', name: 'Ned Kripke',        phone: '610-639-4119', email: 'kripkefamily@comcast.net' },

  // Goldstein's
  { team: 'gold', name: 'Mitch Pratta',     phone: '267-254-2845', email: 'mitchpratta@gmail.com' },

  // Keneseth Israel
  // Note: Ken Finklestein has no email listed — we keep the record but with a
  // synthetic local-part so his doc id is unique. Update in admin once real
  // email is known.
  { team: 'ki', name: 'Ken Finklestein',    phone: '215-962-2630', email: '' },
  { team: 'ki', name: 'Jeff Orlin',         phone: '267-991-6193', email: 'honeydude614@gmail.com' },

  // Or Ami
  { team: 'oa', name: 'Scott Lipner',       phone: '610-639-6671', email: 'scottlipner@gmail.com' },

  // Shir Ami
  { team: 'sa', name: 'Todd Leon',          phone: '609-792-3133', email: 'TJLeon@mdwcg.com' },
  { team: 'sa', name: 'Rick Phillips',      phone: '609-651-6467', email: 'mdniu@yahoo.com' },

  // Temple Sinai Black/Kol Ami
  { team: 'tsbka', name: 'Jason Smukler',   phone: '215-740-3085', email: 'jsmukler@gmail.com' },
  { team: 'tsbka', name: 'Jonathan Shandell', phone: '215-360-3566', email: 'jonathan.shandell@aya.yale.edu' },

  // Temple Sinai Men's Club
  { team: 'tsmc', name: 'Jeff Workman',     phone: '267-307-1836', email: 'jeffworkman11@gmail.com' },
  { team: 'tsmc', name: 'Ira Letofsky',     phone: '',             email: 'iletofsky@yahoo.com' },

  // Temple Sinai Green
  { team: 'tsg', name: 'Zach Sheard',       phone: '609-923-3005', email: 'zachsheard@gmail.com' },
  { team: 'tsg', name: 'Jesse Wexelblatt',  phone: '267-968-2481', email: 'jwexelblatt@gmail.com' },

  // Tifereth Bet Israel Men's Club
  { team: 'tbimc', name: 'Matt Seltzer',    phone: '215-498-4766', email: 'matthewjseltzer@gmail.com' },
  { team: 'tbimc', name: 'Andy Siegel',     phone: '412-915-9731', email: 'andrewjsiegel@gmail.com' },
  { team: 'tbimc', name: 'Adam Schulang',   phone: '215-704-6932', email: 'aschulang@gmail.com' },

  // Tifereth Bet Israel Royals
  { team: 'tbir', name: 'Mark Schwartz',    phone: '917-751-5286', email: 'markschwa@yahoo.com' },
];

// Deterministic doc id: `${team}_${email-local}` (or name slug if no email)
function docIdFor({ team, email, name }) {
  const local = (email || '').toLowerCase().split('@')[0].replace(/[^a-z0-9]+/g, '');
  if (local) return `${team}_${local}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${team}_${slug}`;
}

async function run() {
  let ok = 0, failed = 0;
  for (const c of CAPTAINS) {
    const team_name = TEAM_NAMES[c.team];
    if (!team_name) { console.error(`Unknown team_id: ${c.team}`); failed++; continue; }
    const id = docIdFor(c);
    const payload = {
      email: (c.email || '').toLowerCase(),
      team_id: c.team,
      team_name,
      name: c.name,
      phone: c.phone || '',
    };
    try {
      await setDoc(doc(db, 'captains', id), payload);
      console.log(`✓ ${id}  ${c.name.padEnd(22)} ${c.team.padEnd(6)} ${c.email}`);
      ok++;
    } catch(e) {
      console.error(`✗ ${id}: ${e.message}`);
      failed++;
    }
  }
  console.log(`\nDone — ${ok} written, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

run();
