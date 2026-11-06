# Mainline legal page template

Two page bodies, `privacy-template.html` and `terms-template.html`, written once for every site Mainline Web Design builds and hosts. Each site gets its own `privacy.html` and `terms.html` (or `/privacy` and `/terms` routes on league-platform) built from these, in that site's own page shell, with a footer link next to the existing footer links.

## Rules for the page you build from this

- Use the site's normal page chrome (nav, footer, fonts, colors) exactly like the site's rules or about page. The page should look like it belongs to that site, not like a legal document pasted in.
- Plain language. No legalese, no all-caps paragraphs. Keep the headings in the template.
- No dashes in copy. Use commas and periods. No emoji anywhere.
- Fill every `{{VARIABLE}}`. Delete every `<!-- IF:name -->` block whose condition is false for the site, and remove the markers from the blocks you keep. Never ship a marker or a brace.
- Everything the page claims must be true for that site today. If the site does not send texts, there is no texting section. If the site runs Google Analytics, say so. If registrant data is readable without a login, fix that before the page goes up, or say in your report that the page is waiting on it.
- Date the page with the day you build it: "Last updated November 5, 2026."
- Footer link text: "Privacy" and "Terms", placed with the other footer links on every public page. On engines with a shared chrome file (STS `js/sts-chrome.js`, D27 `js/d27-chrome.js`, LMLL `js/site.js`), add it there once.
- Do not deploy. Commit on a branch where the folder is a git repo; otherwise leave the edits in the working tree and say so.

## Variables

| Variable | Meaning |
|---|---|
| `{{LEAGUE_NAME}}` | The organization's public name, e.g. "Texas Select Tournaments" |
| `{{LEGAL_NAME}}` | Legal entity if known, else the same as LEAGUE_NAME |
| `{{SITE_URL}}` | Public URL without a trailing slash |
| `{{CONTACT_EMAIL}}` | The address that answers privacy questions, taken from the site's config or contact page |
| `{{STATE}}` | The organization's home state, spelled out, for governing law |
| `{{PROCESSOR}}` | "Stripe", "Square", or "CardConnect" |
| `{{PROCESSOR_URL}}` | Link to that processor's privacy policy |
| `{{EMAIL_SERVICE}}` | "SendGrid" or "MailerLite" |
| `{{ANALYTICS}}` | See the IF blocks: GA, VERCEL, or none |
| `{{REFUND_POLICY}}` | One or two sentences from the site's own rules or registration page, quoted faithfully; if none exists, "Refund requests are handled by {{LEAGUE_NAME}} directly; email {{CONTACT_EMAIL}}." |
| `{{RETENTION_SEASONS}}` | How many seasons contact details are kept for re-registration; use "two" unless the site says otherwise |
| `{{UPDATED}}` | Build date, e.g. "November 5, 2026" |

## IF blocks

| Marker | Keep when |
|---|---|
| `IF:YOUTH` | Players can be under 18 (youth leagues, tournaments, camps, clinics) |
| `IF:ADULT` | Players are adults (adult slow-pitch, men's baseball) |
| `IF:PAYMENTS` | The site takes card payments or deposits |
| `IF:DONATIONS` | The site takes donations (shoot-a-thon) |
| `IF:TEXTING` | The site sends SMS through Twilio |
| `IF:ANALYTICS_GA` | A GA4 measurement id is configured and the loader runs |
| `IF:ANALYTICS_VERCEL` | Vercel Web Analytics script is on the pages |
| `IF:ACCOUNTS` | Coaches, captains, or admins sign in (Firebase Auth, team codes, admin passcodes) |
| `IF:ROSTERS_PUBLIC` | Player names appear on public roster, stats, or leader pages |
| `IF:PHOTOS` | The site publishes team or champion photos |
| `IF:INSURANCE` | Team insurance or refund protection is offered through Vertical Insure |
| `IF:DEMO` | The site is a demo with sample data and no live payments |

## Service providers to name

Vercel (hosting and logs), Google Firebase (database and sign-in), the payment processor, the email service, Twilio where texting exists, Vertical Insure where insurance is offered, and "Always Competing Sports LLC, doing business as Mainline Web Design" as the vendor that builds and operates the site on the organization's behalf.
