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
    { id: 'black-13u', age: '13U', color: 'Black', name: 'Empire Black 13u', coach: 'Ben Necci' },
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
