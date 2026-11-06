# Dying-platform lead list, November 2026

`dying-platforms-2026-11.csv` holds 185 youth and adult sports organisations in baseball, softball and basketball whose current website sits on a platform that has shut down, is being retired, or has been abandoned by its owner. Every row is a season-long league or an operator with three or more events a year. Single-event tournament directors, Little League, and the Babe Ruth / Cal Ripken / PONY / American Legion governing bodies are excluded on Adam's direction (2026-11-04). Built 2026-11-04 from governing-body and municipal directories, then re-verified by a second independent fetch of every URL the same day.

The first column, `size_tier`, is the sort key. **A** means 25+ teams, 8+ events a year, 10+ member organisations, or 500+ players seen on the site or in the directory. **B** means 12+ teams, 4+ events, or 5+ member organisations. **C** is everything smaller, kept because the platform failure is real but the buyer is small. Tiers were computed from the numbers in `size_signal` with a few hand corrections.

121 of the 185 rows carry a published email or phone (80 emails, 90 phones). The rest name the organisation and the directory entry where a person can be found.

## Counts

| Size tier | Rows |
|---|---|
| C | 107 |
| B | 44 |
| A | 34 |

| Sport | Rows |
|---|---|
| Softball | 99 |
| Basketball | 46 |
| Baseball | 30 |
| Multi-sport | 10 |

| Platform family | Rows |
|---|---|
| LeagueLineup (dead) | 62 |
| Dead, hijacked or parked domain | 20 |
| FrontPage-era / hand-coded static | 17 |
| SportsEngine Sitebuilder legacy | 14 |
| Blue Sombrero / Sports Connect legacy | 13 |
| HomeTeamsONLINE (dead) | 11 |
| Other stale | 10 |
| GoDaddy Website Builder | 10 |
| Google Sites | 9 |
| Wix | 6 |
| Weebly | 5 |
| TeamPages (legacy Active) | 4 |
| Homestead | 3 |
| eteamz (dead) | 1 |

Top states:

| State | Rows |
|---|---|
| NJ | 29 |
| PA | 23 |
| NY | 18 |
| MD | 16 |
| OH | 15 |
| FL | 10 |
| MA | 9 |
| CA | 7 |
| CT | 5 |
| TX | 5 |
| IL | 5 |
| VA | 5 |

Verification: 174 of 185 rows `confirmed` by the second fetch, 11 marked `check` (see Detection rules).

## Tier A at a glance (34 rows)

| Sport | State | Organisation | Size | Platform | Contact |
|---|---|---|---|---|---|
| Baseball | MD | AABC Travel Baseball (Anne Arundel Baseball Cooperative, Travel Division) | 19 member community baseball orgs (Arden, Broadneck, Crofton, Severna Park, Pasadena, Kent | FrontPage / old static (Google Sites) | none published |
| Baseball | NJ | United States Amateur Baseball League (USABL, Point Pleasant NJ) | 8,500+ teams competed across USABL leagues and tournaments in 2025 (home page); 2,000+ tea | SportsEngine Sitebuilder legacy (current | email + phone |
| Baseball | NY | LI Boys of Summer Baseball League (Selden NY; subsidiary of Long Island Stan Musial Baseball League Inc.) | 240 teams on 110 fields (Axcess Baseball 2017 profile, 2016 season); divisions 13U, 14U, J | LeagueLineup (dead) | email |
| Baseball | NY | Town of Brookhaven Baseball (Brookhaven Parks & Recreation, Centereach NY) | 15+ high school programs on the 2025 TOB Fall HS League schedule (Sachem East x3, William  | LeagueLineup (dead) | email + phone |
| Baseball | OH | Stark-Summit Baseball League (SSBL, Canton OH) | 12 age divisions 8U-18U (8U coach pitch, 8U player pitch, 9U-14U, 15U, 16U, 18U); league r | SportsEngine Sitebuilder legacy | email + phone |
| Baseball | PA | Bux-Mont Connie Mack Baseball League | 27-40 member organizations (Bucks + Montgomery Co.), 13-14U A/B1/B/C1/C leagues + Senior C | FrontPage / old static (Homestead) | email |
| Baseball | PA | York County Baseball (umbrella: 13-19 League, 12U, Adult Rec, Red Lion 35+, Independent Over 30, Oldtimers, Fall; Littlestown/York, PA) | Umbrella org whose Google Sites landing page links 6 separate LeagueLineup league sites (1 | LeagueLineup (dead) | email + phone |
| Basketball | CT | Connecticut Basketball League (CBL) adult men's league | ~50 teams listed on the home page across Men's Tier 1, 2, 3, 4 and 35+ divisions; seasonal | SportsEngine Sitebuilder legacy | phone |
| Basketball | CT | Power Pac Conference (PPC) Eastern CT Youth Travel Basketball League | 14 member towns (Andover, Chariho RI, Columbia, East Lyme, Groton, Mashantucket, New Londo | FrontPage / old static (dead link) | none published |
| Basketball | MA | Cape Cod Youth Basketball League (CCYBL) | 9 member programs (Bourne, Dennis/Yarmouth, Falmouth, Martha's Vineyard, Mashpee, Monomoy, | FrontPage / old static | email + phone |
| Basketball | MD | Mid-Maryland Basketball League (boys and girls travel leagues, Frederick area) | 17 member programs on the boys league site (Ballenger Creek, Brunswick, Catoctin, Crestwoo | Pointstreak Sites (dead link) | email |
| Basketball | NJ | Monroe Sports Center / MultiSports Kingdom basketball leagues (MJBL, Mid-Monmouth, adult) and tournaments | 5 tournaments Nov 2026-Jan 2027 (Fall Brawl, Turkey Tip, Thanksgiving, Holiday Classic, Ne | Other: legacy static HTML site flagged a | phone |
| Basketball | NY | Capital District Girls Basketball League (CDGBL) | 15 towns in the Biddy B division alone (Albany, Amsterdam, Averill Park, Ballston Spa, Bet | TeamPages | none published |
| Basketball | NY | NYC Middle School Basketball League (NYC MSBL) | 26-year citywide public middle school league, boys and girls, cheer program, referee cadet | LeagueLineup (dead) | email + phone |
| Basketball | PA | Metro USA Sports / Metro USA League (Pittsburgh) | 246+ teams, boys and girls grades 3-8 across 5 Pittsburgh-area counties, 10-game regional  | Dead site (domain not resolving) | email |
| Basketball | PA | Region 17 CYO Basketball (Archdiocese of Philadelphia, Chester County) | 12 member parishes/schools (Assumption BVM, St. Agnes, Cornelius, St. Elizabeth, St. Josep | Other stale (WordPress, copyright 2021) | email |
| Multi-sport | OH | North Coast Tournaments (Castalia/Sandusky, OH) | 8 tournaments 2026-27 (3 baseball, 5 softball) in Castalia/Sandusky OH | GoDaddy Website Builder | email + phone |
| Multi-sport | PA | Archdiocese of Philadelphia CYO Region 19 | 18 parishes + 1 regional ministry; ~50 basketball teams (HS 9-10, HS 11-12, Varsity/JV boy | FrontPage / old static | email |
| Softball | DE | Grand Slam Tournaments (Wilmington, DE) | 13 tournaments/showcases in 2026 (Apr-Nov, Wilmington DE); 2 USA Softball National Qualifi | Wix (paid, custom domain) | phone |
| Softball | FL | Sarasota Senior Softball Winter League | 36 teams, men's 60+ and 70+ divisions, winter league, games Mon/Tue/Thu/Fri mornings at 17 | Other stale: HomeTeamsONLINE (dead) + Ba | email + phone |
| Softball | MN | Roseville Senior Softball Association (Roseville, MN) | 26 teams, 55+, two seasons a year (summer May-Sep outdoors, winter Nov-Mar in St. Croix Va | Other stale: HomeTeamsONLINE (dead) | email + phone |
| Softball | NJ | New Jersey Senior Softball (NJSS) / North Jersey Senior Softball Conference (NJSSC) | 72 teams in the NJSSC 50+ and 60+ leagues (SSUSA directory); NJSS umbrella site covers 7 c | FrontPage / old static | email + phone |
| Softball | NY | Hudson Mohawk District 7 Travel Softball League (HudMo) | USA Softball district travel league, 8U-17U divisions, feeds a dozen Capital District town | FrontPage / old static (GoDaddy Website  | email + phone |
| Softball | NY | Long Island Senior Softball Association (LISSA) | 33 teams men's 60+ slow pitch, Tue/Thu Apr-Sep, Pettit Field Rockville Centre + Hempstead | Other stale (dead link lissascoreboard.c | phone |
| Softball | NY | POPS Softball (Past Our Prime Softball) | 38 teams men's 40+ and 50+ divisions, weeknight games Mon-Fri, spring/summer + fall ball,  | Google Sites | email |
| Softball | PA | Beaver County FastPitch League (BCFPL) | 11 member communities (Ambridge, Beaver/Brighton Twp, Beaver Falls, Blackhawk, Central Val | Google Sites | email |
| Softball | PA | Millennium Softball / USA Softball of PA District 6 | 36 teams Sunday league (A-E + Rec divisions) + 32-team fall league + Millennium Cup tourna | FrontPage / old static (Boardhost messag | name only |
| Softball | TN | Big Bang Softball (sanctioning body, Martin TN / Beaumont TX) | 35 dated events listed Dec 2026-Aug 2027; runs its own points system, rankings, team insur | Duda (stale) | email + phone |
| Softball | TX | Harris County Senior Softball League | 28 teams / 4 divisions (United, American, Continental, National) + day league; summer (Apr | Blue Sombrero / Sports Connect legacy | email |
| Baseball | MI | Kensington Valley Baseball & Softball Association (KVBSA, Brighton MI) | 200+ teams from 40+ communities (About page); 52 teams listed in 2026 Successes across 8U- | FrontPage / old static (hand-coded .shtm | email + phone |
| Basketball | MA | Metrowest Youth Basketball League (Metrowest Basketball LLC) | ~90 towns/programs in the team selector (Acushnet-Fairhaven through Winchester, incl. Barr | Other: custom legacy PHP app (current se | none published |
| Basketball | NJ | Garden State Basketball (tournament operator) | 2 separate one-day tournaments every weekend, all year round (~100 events/yr); '30,000 tea | Other stale (WordPress; copy dated 2024; | email + phone |
| Multi-sport | NC | Top Gun Sports / Top Gun-USA Sports (Concord, NC) | 43 tournament listings in the next two weekends alone (Nov 6-18, 2026) across NC/SC/VA/GA; | Old custom ASP.NET WebForms, not mobile- | none published |
| Softball | OH | Western Reserve Fastpitch League / Summit Premier League (Hudson OH) | 80+ teams / 3 levels, 10U-18U (2026 Exposure Events listing); season Apr 13-Jul 31 2026; d | Other: no league website (Exposure Event | name only |

## Columns

| Column | Meaning |
|---|---|
| size_tier | A, B or C as defined above |
| organization | Legal or common name, with town in parentheses where the name alone is ambiguous |
| sport | Softball, Baseball, Basketball, or Multi-sport |
| state | Two-letter code |
| size_signal | What was visible: teams, divisions, age groups, member orgs, events per year |
| platform | Platform family detected (see Detection rules) |
| detection_evidence | What the researcher saw: redirect target, HTML marker, generator tag, Wayback snapshot date |
| url | The URL the directory links to, or the organisation's own domain |
| contact_name, email, phone | Only as published on the site, the archived site, or the directory. Nothing guessed. |
| site_does_today | What the current site actually offers, or "nothing" if it errors |
| multi_event_or_season | Y for every row by construction |
| reason_to_buy | One line on why a league site is worth money to them now |
| source_directory | The directory page the organisation was found in |
| verified_by, verify_status, verify_evidence | Second-fetch result from the merge script, 2026-11-04 |

## Ten best leads

Ranked on size first (Adam: big leagues or big tournament operators only), then on how badly the platform has failed, then on whether a named person with an email or phone is already in the row. All ten came from the second pass on 2026-11-04 evening, which targeted size.

1. **LI Boys of Summer Baseball League** (NY, baseball). 240 teams on 110 fields, $2,200 per team, so a seven-figure operation whose only site was LeagueLineup and is now a Stack Sports redirect. Director name and email published.
2. **Metro USA Sports / Metro USA League** (PA, basketball). 246+ teams, boys and girls grades 3 to 8 across five Pittsburgh-area counties. Domain no longer resolves. Email published.
3. **New Jersey Senior Softball / North Jersey Senior Softball Conference** (NJ, softball). 72 teams in seven county leagues, 2,100+ players, on a Word-generated static site whose Morris County page stopped in 2022. Email and phone published. Union County's 20-team league shares the site.
4. **Kensington Valley Baseball & Softball Association** (MI, baseball). "Michigan's largest travel league", 200+ teams from 40+ communities, on hand-coded .shtml pages. President's name and phone published.
5. **Monroe Sports Center / Mid-Monmouth Basketball** (NJ, basketball). 230+ teams in the Mid-Monmouth league plus the MJBL and five tournaments a year, on a legacy static site that itself says it has been superseded. Phone published.
6. **Sarasota Senior Softball Winter League** (FL, softball). 36 teams in 60+ and 70+ divisions. Its HomeTeamsONLINE site errors and its replacement app returns "unavailable", so it has no working site in season. Email and phone published.
7. **Stark-Summit Baseball League** (OH, baseball). Regional league with 12 age divisions from 8U to 18U on a legacy SportsEngine Sitebuilder site. Commissioner name, email and phone published.
8. **Grand Slam Tournaments** (DE, softball). 13 tournaments and showcases in 2026 from Wilmington, on a Wix site with a 2020 copyright. Director name and phone published. Two hours from Adam.
9. **Connecticut Basketball League** (CT, adult basketball). About 50 teams across men's tiers on a bare sportngin.com subdomain. Phone published.
10. **Mid-Maryland Basketball League** (MD, basketball). 17 member programs; its Pointstreak Sites platform is dead and redirects to Stack Sports, the same fate as LeagueLineup. Email published.

Close behind: Metrowest Youth Basketball League (MA, about 90 towns and 1,100+ teams on a homegrown PHP app that still works, so lower urgency); Big Bang Softball (TN/TX, 35 dated events, stale Duda site, email and phone; it is a sanctioning body as well as an operator); Roseville Senior Softball Association (MN, 26 teams, HomeTeamsONLINE dead); Capital District Girls Basketball League (NY, 15 towns in one division alone, TeamPages); Town of Brookhaven Baseball (NY, municipal, 15+ high school programs and a 36-team tournament, LeagueLineup dead, email and phone); Harris County Senior Softball League (TX, 28 teams, legacy Blue Sombrero) and POPS Softball (NY, 38 teams, Google Sites) from the first pass.

## Sources used

Researchers started from directories, harvested every outbound member-league or operator link, and tested each link. Search engines were used only to find the directories themselves and to recover contact names.

**Veins that produced rows**

- **Senior Softball-USA league directory** (`seniorsoftball.com/<region>` and `?league=ID` pages). About 300 member leagues nationally with team counts, named commissioners, phones, and a "Visit website" link. Produced most of the adult softball rows. The region pages return HTTP 404 but still render the full list.
- **Wayback Machine CDX index of LeagueLineup** (`web.archive.org/cdx/search/cdx?url=leaguelineup.com/welcome.asp*&from=2025`). 479 organisation slugs captured in 2025 or 2026. Each slug's last snapshot gave the name, divisions, schedule year and contacts. Today every one of these URLs redirects to stacksports.com and returns 403. Fetch snapshots with a Safari user agent; the default curl agent is blocked by Incapsula.
- **softballconnected.com/tournament-organizations**. 241 named fastpitch tournament operators in IL, IN, KY, MO, OH, TN with phones. Returns 403 to curl but the list is readable in a browser; operators' own domains were then probed.
- **Township and county "sports organizations" pages** in PA, NJ, MD, VA, GA, OH, MI (South Park Twp, Winslow Twp, Deptford Twp, North Whitehall Twp, York Twp, Barnegat, Ocean City NJ, Hanover County VA, St. Mary's County MD, Henry County GA). Many still link dead LeagueLineup URLs with the president's name and phone beside them.
- **Archdiocese CYO pages** (Philadelphia regions 11 and 19, Newark's Essex County league, Baltimore CYO). Parish leagues of 20 to 50 teams on hand-coded sites or dead LeagueLineup pages.
- **norristownsoftball.com/2023area.html**. A volunteer-maintained list of 35 southeast Pennsylvania adult leagues with team counts. No links, but it surfaced Millennium Softball (36 teams) and Bux-Mont (15). Blocked to curl; readable by browser.
- **NESB (USA Softball New York) RegisterPlay event API**, read in the browser. 305 regional listings grouped by director surfaced season-long leagues and multi-event operators whose own sites were then found and tested.
- **Member-club pages** that link their league: Bux-Mont Connie Mack (Homestead), AABC Travel Baseball (Google Sites), CRAB League (LeagueLineup), York County Baseball (Google Sites hub with six dead LeagueLineup league sites).

**Veins that worked but were excluded on Adam's direction**

- Babe Ruth Southeast Region network (`brlseregion.com/sernetwork`), Babe Ruth Mid-Atlantic and New England region pages, Southern and Northern New Jersey Babe Ruth, Virginia Babe Ruth district sites, and the American Legion Baseball state links on `legion.org`. These produced 29 rows of state and regional governing bodies on 1990s templates or dead LeagueLineup pages, with commissioner emails. Adam: "dead spots". They were removed before the final merge and are not in the CSV. Little League districts and member leagues (24 rows) were removed the same way.

**Veins that were dead ends, so nobody repeats them**

- USA Softball state association sites are now RegisterPlay portals behind a Cloudflare JavaScript challenge. curl and WebFetch both get 403, and the portals no longer have "Leagues" or "Links" pages at all. The national usasoftball.com state pages list commissioners only.
- USSSA, NSA/Global Sports, ISA, TAAF, Nations Baseball state pages list events, not affiliated leagues, and carry no director site links.
- AAU district pages (`aausports.org`) return 403 to every fetch method.
- Dixie Youth (now Diamond Youth Baseball) is entirely on the modern TeamPass platform with no member-league links. PONY zone sites are Blue Sombrero shells run by HQ with no league directory.
- eteamz.com no longer resolves at all, and no directory still linking to it turned up. One eteamz row survived via the SSUSA directory.
- Baltimore County rec councils, Culpeper VA, Gwinnett GA, Middlesex NJ, and most .gov parks pages block curl.

**Second pass (big operators only), same evening**

- **softballconnected.com** again, this time all 235 operator profiles pulled with a desktop user agent (no 403) and 175 operator domains fingerprinted. Profile event counts are zero (the listings are upcoming-only), so event counts came from the operators' own sites. Eight tournament-series rows.
- **USSSA public event feed** (`sportsvc.usssa.com`, 3,421 events) grouped by director: 148 directors run 6+ events, about 28 list a non-USSSA website. Rows whose director carries an `@usssa.com` address were dropped: those people are USSSA area or state directors, not buyers (the USSSA-director vein was closed on 2026-09-30 for that reason). Five rows went out this way.
- **Member-club "leagues we play in" pages**: Islip Travel Baseball's links page gave four Long Island LeagueLineup leagues including LI Boys of Summer; Fairfax County's youth sports directory gave NVTBL; USSSA Michigan's sanctioned-leagues page gave KVBSA.
- **Town recreation "travel basketball" pages** naming the league the town plays in (Power Pac Conference, Capital District Girls Basketball League, Mid-Maryland Basketball League, Metrowest, Connecticut Basketball League). Most leagues named this way have no site at all.
- **Exposure Events listings** in search snippets for basketball tournament operators; Exposure's own organizer pages are Cloudflare-gated, so event counts came from indexed event names.
- **seniorsoftball.com**, all 417 league detail pages this time (310 carry a team count). Only leagues with 15 or more teams were kept per Adam's size rule; most of those were already in the file or on current platforms. Two apparent leads (EMASS, Surf and Sun) were dropped after alternate-domain checks showed they had moved.
- **norristownsoftball.com/2023area.html** rechecked with curl (it worked this time): Keystone (35 teams) is on a current Craft CMS site, Chester County Coed (23) relaunched in June 2026 on a Base44 app, Muhlenberg Sunday (27), Del Val Synagogue (18) and Lewisburg (16) have no findable website.
- Diocesan CYO leagues in NJ, PA, NY, MA and OH were a dead end: most have no league site or sit behind diocese CMSes; Brooklyn-Queens, Dayton, Nassau-Suffolk and Rochester are current. Only Philadelphia Region 17 qualified.
- `msblnational.com` league finder is a map with no URLs; `royhobbs.com` has no affiliate directory; `nationsbaseball.com` is parked. The Internet Archive went offline part way through the pass, which cut the LeagueLineup snapshot reading short.

## Detection rules

Every row's URL was fetched twice: once by the researcher who found it, and once more by the merge script on 2026-11-04 with `curl -sL -m 20` and a desktop Chrome user agent. The merge script's result is in the three trailing columns (`verified_by`, `verify_status`, `verify_evidence`). `confirmed` means the second fetch independently showed the same platform marker or the same dead result. `check` means the second fetch did not reproduce the marker (often a WAF block, a redirect to Facebook, or a platform detected from a sub-page rather than the home page); treat those rows as probable and look before you call.

| Platform label | What counts as evidence |
|---|---|
| LeagueLineup (dead link) | A directory still links to `leaguelineup.com`, and the URL now fails, parks, or redirects to the shutdown notice. LeagueLineup closed 2026-08-31. Size and contact details for these rows come from the directory listing or the last Wayback Machine snapshot, and the snapshot date is in the evidence column. |
| eteamz (dead) | `eteamz.com` or `eteamz.active.com` URL that no longer resolves. Active Network retired the product. |
| HomeTeamsOnline (dead) | `hometeamsonline.com` sites returning a platform-wide connection error during the whole research window. A second homeless-league wave worth watching. |
| Weebly | Host on `*.weebly.com`, or HTML containing `weebly.com`, `_W.configDomain`, `editmysite`, or "Powered by Weebly". |
| Wix free | Host on `*.wixsite.com`, or `wixstatic` assets plus the free-plan ad banner. Paid Wix on a custom domain is listed only when the content is at least two seasons stale. |
| SportsEngine Sitebuilder legacy | Host on `*.sportngin.com`, or `sportngin` assets with the old `ngin` markup, or a SportsEngine page whose latest season is a past one. |
| Blue Sombrero / Sports Connect legacy | `bluesombrero.com` assets or a `*.bluesombrero.com` host (the old DotNetNuke shell), as opposed to the current Sports Connect `clubs.bluesombrero.com` sites, which were rejected when current. |
| FrontPage / old static | `<meta name="GENERATOR" content="Microsoft FrontPage">` or a similar generator (CuteHTML, CoffeeCup, Word HTML), or table layout with no viewport meta and a copyright before 2021. Also Homestead, Tripod, Angelfire, Boardhost. |
| Google Sites / GoDaddy builder / IONOS / TeamPages | Host or asset markers (`sites.google.com`, `wsimg.com`, `godaddysites`, IONOS MyWebsite, `teampages.com`). Kept only when the org is a season-long or multi-event operator with no registration or standings tooling. |
| Dead link (domain hijacked / parked) | The directory's link now serves spam, a casino redirect, or a registrar parking page. The organisation still exists in the directory and usually on Facebook. |
| Other stale | Any platform whose latest visible season is 2024 or earlier. The stale year is in the evidence column. |

Rows were rejected when the second fetch showed a current, maintained site on TeamSnap, LeagueApps, current SportsEngine or Sports Connect, Squarespace, Crossbar, TeamPass, or a WordPress site updated this year.

## What is deliberately not here

- Little League districts and Little League chartered leagues. Adam's direction on 2026-11-04: no money in them. Two research veins (24 Northeast rows plus a stopped Midwest/South/West run) were dropped before the merge.
- Babe Ruth, Cal Ripken, PONY and American Legion state, regional and district bodies and their leagues. Adam, later the same day: dead spots. 29 rows were removed; the veins are described under Sources so nobody re-mines them.
- USSSA area and state directors, identified by an `@usssa.com` address. They run many events but on USSSA's platform, and the vein was closed on 2026-09-30.
- Single-event tournament directors.
- Small organisations whose only web presence is Facebook. Two exceptions were kept with platform "No website" because of size: Western Reserve Fastpitch League (OH, 80+ teams, its Exposure Events listing now returns 410) and Varsity Athletic Club (OH, 8+ events a year on Exposure). Both are marked `check`.

## "No site at all" prospects (not in the CSV)

Real size in a directory, but no website to detect a platform on.

- Union County NJ Senior Softball, 20 teams, about 500 players: one of the seven county leagues on the New Jersey Senior Softball site, so it is folded into that CSV row rather than listed separately
- Central Jersey Softball Association (LeagueLineup slug `cjsbl` dead; an old article cites Old Bridge men's 36 teams and Middletown 20; no archived page to verify)
- South Suburban Senior Softball League, Chicago, 17 teams
- Redding Masters (CA), 20 teams, Facebook only
- Muhlenberg Sunday (27 teams), Del Val Synagogue (18), Lewisburg (16) adult softball leagues on the Norristown area list
- Lehigh Valley Knee-Hi Basketball League (PA), about 22 teams
- Suffolk County Youth Baseball (`scybbl` on LeagueLineup, not archived); East Shore Travel League (CT, domain dead); Mid-Suburban Baseball League (IL, site 404)
- Suburban Basketball League, Mid-Monmouth (now covered via Monroe Sports Center), NCC Travel, Delco Boys Basketball League, Mercer CYO: named on town rec pages, no site found

## Follow-ups a third pass could add

- Buffalo, Rochester, Long Island and northeast Ohio travel basketball leagues, Troy CYO, and adult basketball leagues in Philadelphia, Pittsburgh and Baltimore were not reached before the search budget ran out.
- WJW/Olaff (NJ, about 18 events), Prime Events (NJ, 14), JT Wheatley (DE, 10), Van Horn (Virginia Beach) and Queen of the Hill (Albany) from the USA Softball New York event feed still have no web footprint found; In The Net (Palmyra PA) turned out to be current WordPress.
- A Facebook check of the LeagueLineup orphans before outreach, to confirm none has quietly moved.

## How it was built

Twelve researchers over two passes each took one directory vein, fetched every candidate's home page with curl, and wrote a CSV with the shared header. A merge script deduplicated by host and by LeagueLineup slug, dropped Little League, Babe Ruth, Legion, PONY and USSSA-director rows and one Canadian league, normalised the sport labels, computed the size tier, then fetched every remaining URL a second time and recorded the result in the three trailing columns. No outreach was made and no one was contacted.

