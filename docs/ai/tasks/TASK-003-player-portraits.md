# TASK-003: Cartoon portraits for the top 25 players

## Objective
Make one cartoon portrait for each of the 25 players below. Match the style of the 7 team avatars.
Save them so the site can show them later, keyed by NBA person id. This task creates image files and a
manifest only. Wiring them into pages is a later task.

## Working directory
`C:\Templar Archives\Basketball Bro\beer-league\site`

## Style reference (read these first)
The 7 live team avatars in `public/img/teams/`: `avatar-flag.webp`, `avatar-lba.webp`, `avatar-stat.webp`,
`avatar-jme.webp`, `avatar-mps.webp`, `avatar-cct.webp`, `avatar-bbt.webp`.
All are 512x512 WebP with a transparent background. `src/lib/players.ts` (TEAM_ART, avatarSrc) shows how
team avatars are named and referenced. Match their look: same canvas, transparent background, and similar
line, colour and shading feel, so a portrait sits next to a team avatar without clashing.

## The 25 players
Approved by the user (2026-10-27). Last season's (2025-26) Weekly NBA ("hybrid") and Weekly Fantasy power
rankings were combined by average rank (ties go to the better single rank). Both are in
`C:\Templar Archives\Basketball Bro\beer-league-sample\`. The NBA person ids come from that folder's
`player_games_scored.csv`.

| # | Player | Team | NBA person id |
|---|---|---|---|
| 1 | Victor Wembanyama | SAS | 1641705 |
| 2 | Luka Dončić | LAL | 1629029 |
| 3 | Nikola Jokić | DEN | 203999 |
| 4 | Shai Gilgeous-Alexander | OKC | 1628983 |
| 5 | Bam Adebayo | MIA | 1628389 |
| 6 | Joel Embiid | PHI | 203954 |
| 7 | Kevin Durant | HOU | 201142 |
| 8 | Kawhi Leonard | LAC | 202695 |
| 9 | Jamal Murray | DEN | 1627750 |
| 10 | Jalen Duren | DET | 1631105 |
| 11 | Giannis Antetokounmpo | MIL | 203507 |
| 12 | Donovan Mitchell | CLE | 1628378 |
| 13 | Karl-Anthony Towns | NYK | 1626157 |
| 14 | Amen Thompson | HOU | 1641708 |
| 15 | Devin Booker | PHX | 1626164 |
| 16 | Kevin Porter Jr. | MIL | 1629645 |
| 17 | Tyrese Maxey | PHI | 1630178 |
| 18 | LeBron James | LAL | 2544 |
| 19 | Jalen Brunson | NYK | 1628973 |
| 20 | Nickeil Alexander-Walker | ATL | 1629638 |
| 21 | Evan Mobley | CLE | 1630596 |
| 22 | Cooper Flagg | DAL | 1642843 |
| 23 | Jaylen Brown | BOS | 1627759 |
| 24 | Jayson Tatum | BOS | 1628369 |
| 25 | Deni Avdija | POR | 1630166 |

## Image approach
Your choice. Pick whatever method and source material you judge best for this style, and say what you
chose and why in your report.

## Output
- Folder: `public/img/players/` (create it).
- One file per player: `portrait-<nba person id>.webp`, for example `portrait-1641705.webp`.
- 512x512 WebP with a transparent background, like the team avatars. Aim for under 80 KB each.
- A manifest at `public/img/players/portraits.json`, one entry per portrait:
  `{ "nba_person_id": 1641705, "player": "Victor Wembanyama", "team": "SAS", "added": "YYYY-MM-DD",
  "source": "2025-26 weekly_nba + weekly_fantasy top 25", "active": true }`.

## Adding new ones later (design for this, do not do it now)
- Over time, players who newly enter the top 25 get a portrait added in the same style, with a new
  manifest entry.
- Portraits are never removed. A player who drops out of the top 25 keeps their file and manifest
  entry, and `active` stays true.
- Write a short `public/img/players/README.md` with the steps and the style notes you used, so the next
  batch matches this one.
- Cadence (decided by the user): new portraits are added at each 4-week tier refresh, not weekly.
  Do not build any schedule in this task.

## Allowed changes
- New files under `site/public/img/players/` only.

## Out of scope
- No page or component changes (`src/`), no deploy (`npm run deploy`, `wrangler`), and no commit or push.
- No database or schema changes, and no Neon access.
- No changes to sync jobs or scripts (`beer-league/sync/`), credentials, or `.env`.
- Do not edit or replace the existing team art in `public/img/teams/`.
- Do not install packages or tools. If you need one, stop and report what and why.

## Stop and report if
- You cannot create image files with the tools you have.
- A player can't be identified, or the style can't reasonably be matched.
- Anything would need credentials, a paid service, or a change outside `public/img/players/`.

## Checks
- 25 files exist, named by the ids above, each 512x512 WebP with transparency.
- `portraits.json` has 25 entries that match the files.
- `git status --short` in `site` shows changes only under `public/img/players/`.

## Return format
1. Image approach chosen, and why.
2. Files created (count, total size, any over 80 KB).
3. Checks run, with results.
4. Assumptions made.
5. Open questions, including any players that were hard to draw.
