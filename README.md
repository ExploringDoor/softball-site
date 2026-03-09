# DVSL Softball — League Website

Official website for the **Delaware Valley Synagogue League (DVSL)**, a men's slow-pitch softball league in the Philadelphia area (Bucks, Montgomery, and Philadelphia Counties, PA).

## Pages

| File | Description |
|------|-------------|
| `league-site.html` | Main SPA — Home, Standings, Leaderboard, Players, Recaps, History |
| `schedule.html` | Full season schedule with field details |
| `playoffs.html` | Playoff bracket + Champions gallery |
| `standings-history.html` | Year-by-year standings archive (2021–2025) |
| `rules.html` | Official DVSL rulebook (2025) |
| `ground-rules.html` | Field-specific ground rules for all 8 venues |
| `photos.html` | Photo gallery by field and category |

## Assets

| File | Description |
|------|-------------|
| `dvsl-logo-dark.png` | Official DVSL logo — dark/metallic edition |
| `dvsl-logo-glass.png` | Official DVSL logo — glass trophy edition |
| `ki-silver-cup-2025.png` | KI — 2025 Silver Cup Champions photo |
| `champ-photo.png` | Beth Am — 2019 Gold Cup Champions photo |
| `softball_game2.xlsx` | Game stat tracker spreadsheet |

## Setup

No build step required. Pure HTML/CSS/JS — open any `.html` file directly in a browser, or serve with any static host.

### GitHub Pages (recommended)
1. Push all files to a GitHub repo
2. Go to **Settings → Pages**
3. Set source to `main` branch, root `/`
4. Site will be live at `https://yourusername.github.io/repo-name/league-site.html`

### Local dev
```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

## Navigation Structure

All pages link to each other. The site uses `dvsl-logo-dark.png` in the nav bar — make sure all files are in the **same directory**.

## Design System

- **Fonts:** Barlow Condensed (headers) + Barlow (body) — loaded from Google Fonts
- **Colors:** `#070709` bg · `#F5C842` gold · `#E03C31` red · `#22c55e` green · `#60a5fa` blue
- **Theme:** Dark, sports-editorial aesthetic with logo watermarks and scroll animations

## Season Data

- Current season: **2026** (Apr 18 – Sep 11)
- Standings history: 2021, 2023, 2024, 2025
- To add a new season to `standings-history.html`, add a new object to the `DATA` map and a new tab button

## Contact

League email: DVSLCommissioner@gmail.com  
Registration: imleagues.com
