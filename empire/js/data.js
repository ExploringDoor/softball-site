/* Empire Softball sample: all site content lives here.
   Real = taken from empiresoftball.org on 2026-11-20 (teams, coaches, the White 16u Elite roster, About text).
   Sample = made up for the demo and marked sample:true (the event dates). */
window.EMPIRE = {
  club: {
    name: 'Empire Softball',
    region: 'Long Island, New York',
    ages: '12U to 18U',
    mission: 'At Empire, our goal is to mold the future Empire generations into hard-working and successful individuals by providing a high quality coaching and training experience for our athletes. Through training and coaching, our coaches will teach lessons that extend well beyond the field.',
    about: [
      'We offer competitive softball teams for players aged 12U to 18U. Our teams compete across the tri-state area and beyond. Our travel season runs from late August to July, divided into three key components: Fall Season, Winter Training, and the Spring/Summer Season.',
      'Our experienced coaches are deeply connected within the softball community and are committed to challenging players both on and off the field. They focus on preparing athletes for success at the next level, including collegiate softball opportunities.'
    ],
    instagram: 'https://www.instagram.com/eya_softball/',
    facebook: 'https://www.facebook.com/profile.php?id=61576889693822'
  },

  season: [
    { n: '01', name: 'Fall Season', when: 'Late August to November', text: 'Showcase weekends and fall tournaments. This is when college coaches do most of their watching.' },
    { n: '02', name: 'Winter Training', when: 'December to March', text: 'Indoor work on hitting, pitching, defense and strength, so every player comes out of winter better than she went in.' },
    { n: '03', name: 'Spring and Summer', when: 'April to July', text: 'The main tournament run across the tri-state area and beyond, finishing with summer championship play.' }
  ],

  teams: [
    { id: 'black-18u', age: '18U', color: 'Black', name: 'Empire Black 18u', coach: 'Alexa Whitenack' },
    { id: 'white-16u-elite', age: '16U', color: 'White', tag: 'Elite', name: 'Empire White 16u Elite', coach: 'Franklin Aaron',
      photo: 'img/teams/white-16u-elite.webp', wide: 'img/photos/white16-team.webp',
      staff: [
        { name: 'Franklin Aaron', role: 'Head Coach', photo: 'img/players/coach-franklin-aaron.webp', phone: '347-551-0304', email: 'franklin@scrappysports.com' },
        { name: 'Chris Hobdy', role: 'Assistant Coach' },
        { name: 'Ava Hoffman', role: 'Assistant Coach' }
      ] },
    { id: 'gold-16u', age: '16U', color: 'Gold', name: 'Empire Gold 16u', coach: 'Nick Siozios' },
    { id: 'black-16u', age: '16U', color: 'Black', name: 'Empire Black 16u', coach: 'Mark LoPorto' },
    { id: 'gold-14u', age: '14U', color: 'Gold', name: 'Empire Gold 14u', coach: 'Nick Siozios', photo: 'img/teams/gold-14u.webp', wide: 'img/photos/gold14-team.webp' },
    { id: 'white-13u', age: '13U', color: 'White', name: 'Empire White 13u', coach: 'Brian Tighe' },
    { id: 'black-13u', age: '13U', color: 'Black', name: 'Empire Black 13u', coach: 'Dan Morra', staff: [{ name: 'Dan Morra', role: 'Head Coach' }, { name: 'Jim Ganly', role: 'Assistant Coach' }] }, /* coaches from the team's October 2026 Instagram post; the old website listed Ben Necci */
    { id: 'gold-12u', age: '12U', color: 'Gold', name: 'Empire Gold 12u', coach: 'Franklin Aaron', photo: 'img/teams/gold-12u.webp', wide: 'img/photos/gold12-team.webp' }
  ],

  /* Real roster, as posted on the club's own site. fl = FieldLevel profile slug. */
  players: [
    { id: 'angelina-mancuso', name: 'Angelina Mancuso', team: 'white-16u-elite', pos: ['2B', 'SS'], school: 'Plainview-Old Bethpage JFK HS', grad: 2027, gpa: '4.0', bats: 'R', throws: 'R', fl: 'angelina.mancuso.2167335' },
    { id: 'gabriella-marino', name: 'Gabriella Marino', team: 'white-16u-elite', pos: ['OF'], school: 'Patchogue-Medford HS', grad: 2027, gpa: '3.0', bats: 'R', throws: 'R', fl: 'gabriella.marino' },
    { id: 'jessica-dobrzeniecki', name: 'Jessica Dobrzeniecki', team: 'white-16u-elite', pos: ['OF', '2B'], school: 'Massapequa HS', grad: 2027, gpa: '3.5', bats: 'R', throws: 'R', fl: 'jessica.dobrzeniecki' },
    { id: 'jocelyn-mueller', name: 'Jocelyn Mueller', team: 'white-16u-elite', pos: ['OF', 'SS'], school: 'Herricks HS', grad: 2028, gpa: '3.8', bats: 'R', throws: 'R', fl: 'jocelyn.mueller' },
    { id: 'julia-candelario', name: 'Julia Candelario', team: 'white-16u-elite', pos: ['SS', '2B', '3B', '1B', 'C'], school: 'Kellenberg HS', grad: 2027, gpa: '3.4', bats: 'R', throws: 'R', fl: 'julia.candelario' },
    { id: 'kaitlyn-lozano', name: 'Kaitlyn Lozano', team: 'white-16u-elite', pos: ['C', 'OF'], school: 'Long Island Lutheran HS', grad: 2027, gpa: '4.0', bats: 'R', throws: 'R', fl: 'kaitlyn.lozano' },
    { id: 'kerriann-orth', name: 'Kerriann Orth', team: 'white-16u-elite', pos: ['C', '2B'], school: 'Plainview-Old Bethpage HS', grad: 2027, gpa: '4.3', bats: 'R', throws: 'R', fl: 'kerriann.orth' },
    { id: 'lia-arduini', name: 'Lia Arduini', team: 'white-16u-elite', pos: ['SS', '3B', '1B', 'P'], school: 'Wheatley HS', grad: 2027, gpa: '3.2', bats: 'R', throws: 'R', fl: 'lia.arduini' },
    { id: 'lily-suarez', name: 'Lily Suarez', team: 'white-16u-elite', pos: ['1B', 'OF'], school: 'Northport HS', grad: 2027, gpa: '3.9', bats: 'L', throws: 'R', fl: 'lily.suarez' },
    { id: 'logan-berg', name: 'Logan Berg', team: 'white-16u-elite', pos: ['OF', '2B', '1B'], school: 'Hicksville HS', grad: 2027, gpa: '3.7', bats: 'R', throws: 'R', fl: 'logan.berg.2166481' },
    { id: 'megan-hobdy', name: 'Megan Hobdy', team: 'white-16u-elite', pos: ['OF', 'P'], school: 'Calhoun HS', grad: 2028, gpa: '4.0', bats: 'R', throws: 'R', fl: 'megan.hobdy' },
    { id: 'shayna-argentina', name: 'Shayna Argentina', team: 'white-16u-elite', pos: ['3B', '2B', '1B', 'OF'], school: 'Long Island Lutheran HS', grad: 2027, gpa: '3.7', bats: 'R', throws: 'R', fl: 'shayna.argentina' },
    { id: 'tiffany-matthews', name: 'Tiffany Matthews', team: 'white-16u-elite', pos: ['OF', 'P'], school: 'Long Island Lutheran HS', grad: 2027, gpa: '3.5', bats: 'R', throws: 'R', fl: 'tiffany.matthews' }
  ],

  /* SAMPLE dates for the demo. Swap for the club's real tournament slate. */
  events: [
    { id: 'e1', sample: true, start: '2027-04-17', end: '2027-04-18', name: 'Spring Opener', place: 'Baldwin Park', city: 'Baldwin, NY', teams: ['white-16u-elite', 'gold-16u', 'black-16u', 'gold-14u'] },
    { id: 'e2', sample: true, start: '2027-05-01', end: '2027-05-02', name: 'Long Island Invitational', place: 'Eisenhower Park', city: 'East Meadow, NY', teams: ['black-18u', 'white-16u-elite', 'white-13u', 'black-13u', 'gold-12u'] },
    { id: 'e3', sample: true, start: '2027-05-29', end: '2027-05-31', name: 'Memorial Day Classic', place: 'Diamond Nation', city: 'Flemington, NJ', teams: ['black-18u', 'white-16u-elite', 'gold-16u', 'gold-14u'] },
    { id: 'e4', sample: true, start: '2027-06-18', end: '2027-06-20', name: 'June College Showcase', place: 'Diamond Nation', city: 'Flemington, NJ', showcase: true, teams: ['black-18u', 'white-16u-elite', 'black-16u'] },
    { id: 'e5', sample: true, start: '2027-06-26', end: '2027-06-27', name: 'Tri-State Championship', place: 'Baldwin Park', city: 'Baldwin, NY', teams: ['gold-14u', 'white-13u', 'black-13u', 'gold-12u'] },
    { id: 'e6', sample: true, start: '2027-07-08', end: '2027-07-11', name: 'Summer Showcase', place: 'Ripken Experience', city: 'Aberdeen, MD', showcase: true, teams: ['black-18u', 'white-16u-elite', 'gold-16u', 'black-16u'] },
    { id: 'e7', sample: true, start: '2027-07-22', end: '2027-07-25', name: 'Summer Finale', place: 'Eisenhower Park', city: 'East Meadow, NY', teams: ['black-18u', 'white-16u-elite', 'gold-16u', 'black-16u', 'gold-14u', 'white-13u', 'black-13u', 'gold-12u'] }
  ],

  photos: [
    { src: 'img/photos/huddle.webp', w: 1800, h: 1200, cap: 'Hands in before first pitch' },
    { src: 'img/photos/champions.webp', w: 1200, h: 1600, cap: 'Champions' },
    { src: 'img/photos/white16-team.webp', w: 1600, h: 1067, cap: 'Empire White 16u Elite' },
    { src: 'img/photos/gold14-team.webp', w: 1200, h: 1600, cap: 'Empire Gold 14u' },
    { src: 'img/photos/gold12-team.webp', w: 1600, h: 1200, cap: 'Empire Gold 12u' },
    { src: 'img/photos/white-unis.webp', w: 960, h: 2081, cap: 'Whites on game day' }
  ]
};

/* SAMPLE measurables for the demo (not the players' real numbers). A family replaces them in the profile builder. */
(function () {
  var M = {
    'angelina-mancuso': { ht: "5'4\"", ev: 66, ov: 58, h1: '2.92' },
    'gabriella-marino': { ht: "5'6\"", ev: 64, ov: 59, h1: '2.88' },
    'jessica-dobrzeniecki': { ht: "5'5\"", ev: 65, ov: 57, h1: '2.95' },
    'jocelyn-mueller': { ht: "5'5\"", ev: 63, ov: 58, h1: '2.85' },
    'julia-candelario': { ht: "5'7\"", ev: 69, ov: 61, h1: '3.02', pop: '1.98' },
    'kaitlyn-lozano': { ht: "5'6\"", ev: 70, ov: 62, h1: '2.98', pop: '1.92' },
    'kerriann-orth': { ht: "5'5\"", ev: 67, ov: 60, h1: '3.05', pop: '1.96' },
    'lia-arduini': { ht: "5'8\"", ev: 68, ov: 61, h1: '3.00', pv: 57 },
    'lily-suarez': { ht: "5'9\"", ev: 71, ov: 58, h1: '3.08' },
    'logan-berg': { ht: "5'6\"", ev: 66, ov: 58, h1: '2.94' },
    'megan-hobdy': { ht: "5'7\"", ev: 65, ov: 60, h1: '2.90', pv: 58 },
    'shayna-argentina': { ht: "5'6\"", ev: 68, ov: 60, h1: '3.01' },
    'tiffany-matthews': { ht: "5'7\"", ev: 66, ov: 61, h1: '2.87', pv: 59 }
  };
  window.EMPIRE.players.forEach(function (p) { p.m = M[p.id] || {}; p.sampleM = true; });
})();

/* SAMPLE club content for the demo: fee, tryout dates, news, results, questions. The club replaces all of it in the coach desk. */
window.EMPIRE.fee = 1800;
window.EMPIRE.tryoutDates = [
  { id: 't1', label: 'Saturday, August 14, 2027: 12U and 13U, 9:00 am' },
  { id: 't2', label: 'Saturday, August 14, 2027: 14U, 12:00 pm' },
  { id: 't3', label: 'Sunday, August 15, 2027: 16U, 9:00 am' },
  { id: 't4', label: 'Sunday, August 15, 2027: 18U, 12:00 pm' }
];
/* REAL: taken from the club's own Instagram posts (eya_softball and its team accounts), read 2026-11-20, rewritten in our words. */
window.EMPIRE.news = [
  { id: 'n9', date: '2026-11-15', title: 'White ends the fall with another championship', text: 'The team closed out the fall season with one more title and heads into the offseason.' },
  { id: 'n8', date: '2026-10-18', title: '14U takes the title on Championship Sunday', text: 'The 14U team went 3-0-1 on the weekend and won the final 11-2 to bring home the championship.' },
  { id: 'n7', date: '2026-10-06', title: 'Meet the 2026 Black 13U', text: 'A new group opens its fall season at the Island Fastpitch USSSA Play Pink Tournament, led by head coach Dan Morra and assistant coach Jim Ganly.' },
  { id: 'n6', date: '2026-08-02', title: 'First 14U tournament title, and unbeaten all night', photo: 'img/ig/champs-14u-2026.webp', text: 'The girls won their first 14U championship without a loss and finished it with a 5-0 shutout in the final.' },
  { id: 'n5', date: '2025-07-16', title: 'Black 18u wins the USA Strong Island Championship', photo: 'img/ig/black18-strong-island.webp', text: 'Empire Black 18u took the Strong Island title in July.' },
  { id: 'n4', date: '2025-06-30', title: 'Gold 12u wins the USSSA State tournament', text: 'Gold 12u went unbeaten and won the state title in an Empire against Empire final. It was the team\'s seventh tournament win of the year.' },
  { id: 'n3', date: '2025-02-06', title: 'Brooke Gullo is the first Empire Athletics Foundation scholarship winner', photo: 'img/ig/brooke-gullo.webp', text: 'Brooke, who is playing at Oswego State, became the first softball player to receive the foundation scholarship, given in memory of Coach Brandon Wilson.' },
  { id: 'n2', date: '2024-07-09', title: 'First Home Run Derby and Combine', text: 'Every Empire team took part in a home run derby and skills combine that raised money for the Empire Athletics Foundation.' }
];
window.EMPIRE.results = [
  { id: 'r20', date: '2026-11-15', team: 'white-16u-elite', event: 'Toys for Tots Tournament', finish: 'Champions' },
  { id: 'r19', date: '2026-10-18', label: 'Empire 14U', event: 'Championship Sunday, October 2026', finish: 'Champions', record: '3-0-1' },
  { id: 'r18', date: '2026-08-02', label: 'Empire Black and Gold 2031', event: 'First 14U tournament title', finish: 'Champions', record: 'Unbeaten' },
  { id: 'r17', date: '2026-07-12', label: 'Empire Gold 2031', event: 'Angels in the Outfield', finish: 'Champions' },
  { id: 'r16', date: '2025-07-16', team: 'black-18u', event: 'USA Strong Island Championship', finish: 'Champions' },
  { id: 'r15', date: '2025-07-15', label: 'Empire Black 12u', event: 'USSSA Angels in the Outfield', finish: 'Champions' },
  { id: 'r14', date: '2025-07-14', team: 'white-16u-elite', event: 'USSSA Angels in the Outfield', finish: 'Finalist' },
  { id: 'r13', date: '2025-07-06', label: 'Empire Black 14u', event: 'CYA Firecracker Classic, 16u division', finish: 'Champions' },
  { id: 'r12', date: '2025-06-30', team: 'gold-12u', event: 'USSSA State Tournament', finish: 'Champions', record: 'Unbeaten' },
  { id: 'r11', date: '2025-06-16', team: 'black-16u', event: 'USSSA Fathers Day Faceoff', finish: 'Co-champions' },
  { id: 'r10', date: '2025-06-02', team: 'white-16u-elite', event: 'We Play for A.K. Tournament', finish: 'Champions' },
  { id: 'r9', date: '2025-05-28', team: 'white-16u-elite', event: 'USSSA Memorial Day Tournament, 18u division', finish: 'Finalist' },
  { id: 'r8', date: '2025-04-07', team: 'gold-12u', event: 'Rally for Hailey', finish: 'Champions' },
  { id: 'r7', date: '2024-11-11', team: 'white-16u-elite', event: 'USSSA Toys for Tots Tournament', finish: 'Champions', record: '5-0' },
  { id: 'r6', date: '2024-11-01', team: 'white-16u-elite', event: 'Island Fastpitch Fall League, 16/18u', finish: 'Champions', record: 'Unbeaten' },
  { id: 'r5', date: '2024-07-28', team: 'white-16u-elite', event: 'USSSA Long Island Championship', finish: 'Champions' }
];
/* REAL: college commitments the club announced on Instagram. */
window.EMPIRE.alumni = [
  { name: 'Brooke Gullo', college: 'Oswego State', note: 'Class of 2025, Empire Black 18u. First Empire Athletics Foundation scholarship winner.', photo: 'img/ig/brooke-gullo.webp' },
  { name: 'Caragh Doyle', college: 'SUNY Old Westbury', note: 'Class of 2025.', photo: 'img/ig/caragh-doyle.webp' },
  { name: 'Giulia Scibilia', college: 'Western Connecticut State University', note: 'Empire\'s first college softball commit, announced October 2024.', photo: 'img/ig/giulia-scibilia.webp' }
];
/* REAL: honors and fall 2025 numbers the club posted for players already on this site. */
(function () {
  var H = {
    'megan-hobdy': { honors: ['All County Honorable Mention 2025', 'Fall 2025 pitching MVP', 'Toys for Tots MVP 2024'], stats: { avg: '.643', era: '1.15' }, statsNote: 'Fall 2025, posted by the team' },
    'shayna-argentina': { honors: ['Fall 2025 season MVP', 'All State All-Star Game 2024'], stats: { avg: '.778' }, statsNote: 'Fall 2025, posted by the team' },
    'tiffany-matthews': { honors: ['All County Pitcher of the Year 2025'] },
    'lia-arduini': { honors: ['All Conference 2025', 'All State All-Star Game 2024'] },
    'kerriann-orth': { honors: ['Toys for Tots defensive MVP 2024', 'All State All-Star Game 2024'] },
    'jocelyn-mueller': { honors: ['Most Improved, fall 2025'] }
  };
  window.EMPIRE.players.forEach(function (p) { if (H[p.id]) { p.honors = H[p.id].honors; if (H[p.id].stats) { p.stats = H[p.id].stats; p.statsNote = H[p.id].statsNote; } } });
  var t = window.EMPIRE.teams.filter(function (x) { return x.id === 'white-16u-elite'; })[0];
  t.blurb = 'Unbeaten in the fall of 2025 and 58-18-1 in 2024, with titles at Toys for Tots, We Play for A.K. and the USSSA Long Island Championship.';
  window.EMPIRE.club.tryoutAges = '10U to 18U'; /* teams run 12U to 18U; tryouts start at 10U (2025-26 tryout post) */
  window.EMPIRE.club.teamBrand = 'Empire Express'; /* name the teams use on Instagram in 2026 */
  window.EMPIRE.club.store = 'https://empire2027.itemorder.com';
  window.EMPIRE.club.program = [
    ['Empire Athletics Foundation', 'A nonprofit that helps keep player fees down, helps athletes who could not otherwise play, and gives scholarships to Empire players moving on to college. The Brandon Wilson Scholarship honors a late Empire coach.'],
    ['Home Run Derby and Combine', 'Once a year every Empire team takes part in a home run derby and a skills combine. Families and friends pledge per home run, and the money goes to the foundation.'],
    ['Winter training and college clinics', 'Teams train indoors through the winter, and Empire has brought in college coaching staffs to run clinics for its players.']
  ];
  window.EMPIRE.photos = window.EMPIRE.photos.concat([
    { src: 'img/ig/champs-14u-2026.webp', w: 1600, h: 1200, cap: 'First 14U title, August 2026' },
    { src: 'img/ig/black18-strong-island.webp', w: 1206, h: 858, cap: 'Black 18u, Strong Island champions' },
    { src: 'img/ig/hands-in.webp', w: 1440, h: 1440, cap: 'Hands in' },
    { src: 'img/ig/angels-2026.webp', w: 1600, h: 1200, cap: 'Angels in the Outfield champions, 2026' },
    { src: 'img/ig/li-championship-2024.webp', w: 1440, h: 1440, cap: 'USSSA Long Island Championship, 2024' },
    { src: 'img/ig/firecracker-dazzle.webp', w: 1440, h: 1080, cap: 'Firecracker Dazzle champions' },
    { src: 'img/ig/nationals-18u.webp', w: 1440, h: 1266, cap: '18u Nationals' },
    { src: 'img/ig/fever-pitch.webp', w: 1440, h: 1080, cap: 'Fever Pitch champions' },
    { src: 'img/ig/white-2024.webp', w: 1440, h: 1335, cap: 'Empire White' },
    { src: 'img/ig/softball-prom.webp', w: 1440, h: 1080, cap: 'Softball Prom champions' },
    { src: 'img/ig/rally-for-hailey.webp', w: 1440, h: 1080, cap: 'Rally for Hailey champions' },
    { src: 'img/ig/back-the-blue.webp', w: 1440, h: 1605, cap: 'Back the Blue champions' },
    { src: 'img/ig/firecracker-classic.webp', w: 1200, h: 900, cap: 'Firecracker Classic champions' },
    { src: 'img/ig/wounded-warriors.webp', w: 1440, h: 914, cap: 'Wounded Warriors champions' }
  ]);
})();
window.EMPIRE.faq = [
  ['How do tryouts work?', 'Tryouts run over about a week at two locations, Seaford and Huntington Station, for age groups 10U to 18U. Every player signs up online first. From the club\'s 2025-26 tryout post.'],
  ['Is there a tryout fee?', 'New players paid a $20 fee when they signed up for 2025-26 tryouts.'],
  ['What does the season fee cover?', 'Sample answer. The club lists what is included here: tournament entries, winter training, uniforms and insurance.'],
  ['Can we pay over time?', 'Sample answer. Registration offers pay in full, three payments or monthly payments, and the coach desk shows who is paid up.'],
  ['Which age group is my daughter?', 'Sample answer. The club posts its age cutoff here so families can check before tryouts.']
];

/* REAL: from the White team's own Instagram (empire_white_elite) and the club's Facebook page, read 2026-11-20, in our words.
   Jersey numbers, honors, a college commitment and dated highlights for players already on this site. */
(function () {
  var X = {
    'megan-hobdy': { honors: ['All County 2026', 'Defensive MVP, National All State Championship 2025', 'Fall 2025 pitching MVP'], hl: [
      ['June 2026', 'Named All County at Calhoun.'], ['December 2025', 'Defensive MVP at the National All State Championship in Florida.'], ['October 2025', 'Threw a perfect game with 9 strikeouts and hit a home run the same day.'],
      ['October 2025', 'Fall pitching MVP: 1.15 ERA, hitters batted .162 against her, and she hit .643.'], ['November 2024', 'Toys for Tots overall MVP: hit .636 with 3 home runs and 9 RBI, and won 3 games in the circle with 18 strikeouts.'], ['July 2024', 'Tournament MVP.']] },
    'shayna-argentina': { num: '18', honors: ['Fall 2025 season MVP', 'Toys for Tots offensive MVP 2024', 'All State All-Star Game 2024'], hl: [
      ['October 2025', 'Season MVP for the unbeaten fall: hit .778 while playing third base.'], ['November 2024', 'Toys for Tots offensive MVP with 3 home runs, on her birthday.'], ['July 2024', 'Offensive MVP of the USSSA Long Island Championship.'], ['June 2024', 'Offensive MVP of the Wounded Warrior Tournament.']] },
    'kerriann-orth': { num: '24', honors: ['All County 2026', 'Highest GPA, POB varsity softball 2025', 'Toys for Tots defensive MVP 2024'], hl: [
      ['June 2026', 'Named All County at POB JFK.'], ['June 2025', 'Highest GPA on the POB varsity team, plus the "I Got Your Back" award.'], ['November 2024', 'Toys for Tots defensive MVP: caught every inning, hit .571 and hit a grand slam in the final.'], ['June 2024', 'Team MVP of the Wounded Warrior Tournament.']] },
    'logan-berg': { num: '00', honors: ['All County Honorable Mention 2026'], hl: [['June 2026', 'All County Honorable Mention at Hicksville.'], ['October 2025', 'Went 2 for 3 with two triples.'], ['June 2025', 'Hit .600 for the tournament.']] },
    'tiffany-matthews': { num: '16', honors: ['All County 2025', 'Pitcher of the Year 2025'], hl: [['June 2025', 'All County and Pitcher of the Year.'], ['April 2025', 'Hit a home run in her high school game.']] },
    'lia-arduini': { honors: ['All Conference 2025', 'Fall League championship MVP 2024', 'All State All-Star Game 2024'], hl: [
      ['June 2025', 'Hit .615 for the tournament with 3 doubles and 5 RBI.'], ['June 2025', 'Named All Conference.'], ['October 2024', 'Co-MVP of the Fall League championship: pitched 3 innings and hit a go-ahead home run.'], ['June 2024', 'Pitching MVP of the Wounded Warrior Tournament.'], ['April 2024', '10 strikeouts in one game.']] },
    'angelina-mancuso': { num: '20', honors: ['Tournament batting leader, June 2025'], hl: [['June 2025', 'Led the team for the tournament: .700 with 3 doubles, a home run and 7 RBI.'], ['January 2025', 'Attended the Hofstra Winter All Skills Camp.'], ['November 2024', 'Two walk-off hits, 2 home runs and 9 RBI at Toys for Tots.'], ['October 2024', 'Her first home run was a grand slam.']] },
    'julia-candelario': { num: '63', college: 'SUNY Morrisville', commit: 'Verbal commitment', honors: ['Verbal commitment to SUNY Morrisville, March 2026'], hl: [['March 2026', 'Verbally committed to SUNY Morrisville.'], ['November 2024', 'Hit .667 at Toys for Tots.'], ['October 2024', 'Went 3 for 4 with two doubles and made a bare-hand play in the field.']] },
    'lily-suarez': { num: '9', honors: ['Tournament MVP, USSSA Long Island Championship 2024'], hl: [['June 2025', 'Home run in tournament play.'], ['November 2024', 'Hit .750 with 9 RBI at Toys for Tots.'], ['July 2024', 'Tournament MVP of the USSSA Long Island Championship.']] },
    'jocelyn-mueller': { hl: [['October 2025', 'Most Improved for the fall season.']] },
    'kaitlyn-lozano': { num: '10' }, 'jessica-dobrzeniecki': { num: '22' }, 'gabriella-marino': { num: '44' }
  };
  window.EMPIRE.players.forEach(function (p) { var x = X[p.id]; if (x) Object.keys(x).forEach(function (k) { p[k] = x[k]; }); });
  var T = window.EMPIRE.teams, by = function (id) { return T.filter(function (t) { return t.id === id; })[0]; };
  by('white-16u-elite').ig = 'https://www.instagram.com/empire_white_elite/';
  by('white-16u-elite').partners = [['Brooklyn Delights Bakery', 'Player of the Game sponsor'], ['Max Effort Baseball', 'Winter training'], ['Joe Szadok Fitness', 'Strength and conditioning']];
  by('black-18u').ig = 'https://www.instagram.com/empire_18u_black/';
  window.EMPIRE.results.push({ id: 'r4', date: '2024-06-16', team: 'white-16u-elite', event: 'Island Fastpitch Wounded Warrior Tournament', finish: 'Champions', record: '6-0' });
  window.EMPIRE.news.push(
    { id: 'n12', date: '2026-06-16', title: 'Three White players earn All County honors', text: 'Kerriann Orth and Megan Hobdy were named All County, and Logan Berg earned All County Honorable Mention.' },
    { id: 'n11', date: '2026-03-10', title: 'Julia Candelario commits to SUNY Morrisville', text: 'Julia gave her verbal commitment to play four more years of softball at SUNY Morrisville.' },
    { id: 'n10', date: '2025-10-12', title: 'Megan Hobdy throws a perfect game', text: 'Megan struck out nine in a perfect game and homered the same day, as the team went 3-0 at the Play Pink Tournament.' });
  window.EMPIRE.sponsors = [['Brooklyn Delights Bakery', 'Player of the Game sponsor, Empire White']];
})();
