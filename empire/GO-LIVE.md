# Empire Softball: what has to happen before the site goes live

Written 2026-11-20 from a full audit of the sample at empire-softball.vercel.app.
Everything in the sample that "saves" lives on one phone or computer, every form sends nothing, and checkout charges nothing.
Items are in the order they need to happen. (Club) = the club does it or sends it. (Adam) = you build or do it. (Both) = decide together.

## 1. Decide with the club, before building anything real

1. (Both) Agree in writing on phase one: which features, the build price, the monthly fee, and who pays outside costs (Vercel, database, SendGrid, Twilio, payment fees). The agreement comes from Always Competing Sports LLC. A sensible phase one: real teams, rosters, schedule, player profiles with coach approval, working forms, and a coach login for news, results, schedule and the top banner. Registration and payments stay on LeagueApps.
2. (Both) Registration and payments: keep LeagueApps and link the Register, "Make a payment" and dues buttons to it, or move to a payment system run by the site (Stripe or Square). Moving is much more work: real checkout, payment plans, receipts, refunds, waivers.
3. (Both) Pick which coach tools launch on day one. Simple ones (news, results, banner, add event, coach's take, Player of the Game) are low risk. Messaging, RSVP, volunteers, paperwork and tryout night need family accounts or texting approval and can wait. Hide whatever waits from the coach desk, menu and search.
4. (Both) Set the roles: director, team coach, family. Decide what each can see and change.
5. (Club) Name who at the club keeps the site up to date and how often.

## 2. Get from the club

Content
6. Current team list with exact names (Instagram now says "Empire Express"), age group, color and Elite tag. Several real results point at teams that are not in the list (Black 12u, Black 14u, Gold 2031, Black and Gold 2031).
7. Age groups for this season. The site says 12U to 18U in some places and 10U to 18U in others, and there is no 10U team.
8. Head coach and assistants for every team, with photos if wanted. Black 13U conflicts: the website says Ben Necci, Instagram says Dan Morra and Jim Ganly.
9. Rosters for all teams. Best: a LeagueApps export (player, team, grad year, parent name, email, phone) so nothing is typed twice. Confirm White 16u Elite is still current.
10. The real tournament and showcase schedule, with which teams play and which are college showcases.
11. Tryout dates, places and fee for next season, and the season fee by age group with payment plans and what it covers.
12. Real answers for the sample FAQ questions, especially the age cutoff.
13. A club email address, plus a yes or no on each coach phone and email that shows publicly (Franklin Aaron's cell and email show on the White pages and print on the back of every White player card).
14. A look at the news, trophy case, honors, jersey numbers and college commits pulled from Instagram, to confirm or correct.
15. Sponsor list and real sponsor packages and prices, or remove the placeholders.
16. Foundation details: 501(c)(3) name and EIN, their own giving link, and how the scholarship is chosen.
17. The club's real waiver, code of conduct, medical release and refund policy wording, and the real paperwork list (what a player needs to be cleared to play).

Permission and privacy
18. Written parent consent for every player shown on a public page (name, photo, school, grad year, GPA, card with QR code), with an opt out for GPA. Nothing goes public until this is in hand.
19. Photo permission for every photo used (headshots, team photos, the 14 Instagram photos). Better team photos for the five teams that have none.
20. A decision on what stays private: exact field times, parking and hotel blocks should be for signed-in families only. Profiles for players under 13 only with parent consent (COPPA).

Accounts and access
21. Who controls the domain. empiresoftball.org is registered at Network Solutions (expires March 16, 2027), and its DNS runs at HostGator. Their email runs through HostGator too (mail server mail.empiresoftball.org). Get the logins or set up a screen share.
22. The list of email addresses they use, so email can be tested after the switch.
23. Old WordPress site: an admin login or page list for redirects, and a full backup before it is ever turned off.

## 3. Build the real version (Adam)

Setup
24. Move the site out of the DVSL repo into its own private GitHub repo, and put the Vercel project on the right account and plan.
25. Set one public web address in the code (https://empiresoftball.org/) and use it for every QR code and share link. Today they use whatever address the page is on, so cards made on the preview would point at the preview forever. Places: purl() and the team card set QR in js/site.js, pageUrl() in js/x-scout.js and js/x-weekend.js.

Logins and database
26. A shared database plus sign-in for coaches and families. Move everything that now lives in the browser (keys starting emp_) into it: profile edits, coach desk, registrations, RSVP, volunteers, paperwork, Player of the Game, tryout night, Derby pledges.
27. Profile changes from families go to a coach to approve before they show publicly.
28. Real photo upload and storage for headshots and news, with location and camera data stripped from every photo.
29. Every form delivers to a real inbox: contact, tryouts, ask about her, sponsor inquiry, give, Derby pledge.

Money (only if they leave LeagueApps)
30. Hosted checkout (Stripe), payment plans with automatic charges, email receipts, refunds, a waiver with e-signature that holds up, and medical info locked to the people who need it.
31. Foundation gifts through the foundation's own link with proper tax receipts. A plan for collecting Derby pledges after the event. Check New York raffle rules before selling raffle tickets online.

Texts and email
32. Email through SendGrid or the club's sender, with SPF and DKIM set on empiresoftball.org and an unsubscribe link.
33. Texting through Twilio needs business registration (10DLC) that takes days to weeks: start early. Add consent wording to every phone field (who texts, how often, rates may apply, reply STOP), keep an opt out list, and cap sends.

Clean out the sample
34. Remove the made up measurables, combine numbers, events, tryout dates, fee, FAQ answers, seeded RSVP answers, volunteer families, paperwork ticks, Player of the Game lines, donor wall and sponsor prices.
35. Remove every "Sample" tag and "this is a sample site" note, and the "Sample site by Main Line Web Design" footer line.
36. Put the age range in one place and take out the typed years so each August rollover is easy.

Pages and polish
37. Privacy policy and terms pages linked in the footer, including how under 13 players are handled.
38. A real 404 page, sitemap.xml, canonical tags, a proper link preview image, smaller photos (the Instagram folder is about 5 MB), alt text, keyboard check, broken link check, security headers.
39. Keep the coach and family tools out of Google (coach, messages, tryout night, paperwork, RSVP, volunteers, family, profile builder, weekend, scout) and behind sign-in. Noindex alone does not stop anyone opening a page.
40. Backups and a restore plan for the database and uploads.

## 4. Before launch day

41. (Both) Import rosters and family contacts, then send families their sign-in.
42. (Adam) Test on a real iPhone and Android phone, including a private tab: home, a team, a player, schedule, every form, family sign-in, coach sign-in, and one coach post that then shows on a second phone.
43. (Adam) If payments moved here: run test mode, then one real small charge and refund.
44. (Both) Train the director and coaches on the real screens and leave a one page how-to.
45. (Adam) Map every old WordPress address to its new page with 301 redirects in vercel.json.
46. (Adam) Lower the DNS TTL the day before.

## 5. Launch day

47. Add empiresoftball.org and www to the Vercel project.
48. At HostGator change ONLY the main A record and the www record to Vercel. Do not move the nameservers and do not touch mail.empiresoftball.org, or club email stops. If a security proxy sits in front of the site, set it to DNS only so Vercel can issue the certificate.
49. Remove the noindex header (empire/vercel.json), the block in robots.txt and the noindex tag on public pages only.
50. Check https on a phone, send a test email to a club address, submit each form, and confirm nothing internal (README, dev server, notes) is served.
51. (Club) Tell families, and update the Instagram bio, Facebook and LeagueApps links. Keep the old hosting a few weeks as a fallback.

## 6. After launch

52. Google Search Console with the sitemap, and analytics.
53. Add the site to the site monitor and the weekly sweep.
54. Renew the domain before March 16, 2027.
55. Season rollover every August: teams, rosters, schedule, fee.
56. A takedown process for players who leave, graduate or ask to be removed.
