# TASK-004: Show the player portraits on the site

## Objective
Show each player's cartoon portrait wherever the site shows that player's picture, for players who have
one. Everyone else keeps today's NBA.com headshot, unchanged.

## Working directory
`C:\Templar Archives\Basketball Bro\beer-league\site`

## Read these first
- `public/img/players/portraits.json`: the manifest (`nba_person_id`, `player`, `team`, `added`,
  `source`, `active`). The files are `public/img/players/portrait-<nba_person_id>.webp`: 512x512,
  transparent background, full-body pixel-art sprites. `README.md` in the same folder explains them.
- `src/lib/players.ts`: `headshotSrc()` (NBA.com CDN, by NBA person id), `photoSql()` (which players get
  a photo at all) and `avatarSrc()` / `TEAM_ART` (the team avatars, which these portraits match).
- `src/pages/player/[id].astro` (about line 61, `.pcard-face`) and `src/pages/team/[abv].astro`
  (about line 104, `.face`): today's headshot spots, both with `onerror="this.remove()"`.

## Required behavior
1. One helper in `src/lib/players.ts`, for example `portraitSrc(nbaId)`, that returns the portrait path
   when the id is in the manifest, and null otherwise. Read the manifest at build time. The site runs on
   Cloudflare Workers, so there is no file system at request time.
2. At each chosen spot: portrait if there is one, otherwise the existing headshot, with the same
   `photoSql` rule for who gets a picture at all.
3. Portraits are square sprites, and headshots are 260x190 photos. Size and crop the portrait so it reads
   well in each spot (no stretching), and keep the spot's layout working at phone width.
4. New portraits added later (each 4-week tier refresh) must show up from the manifest alone, with no
   code change.

## Where they appear (chosen by the user, 2026-10-27)
- A. Player page card (`/player/<id>`, `.pcard-face`): the portrait replaces the headshot when the
  player has one.
- C. Stats page / tier list: a new small portrait icon next to players who have one. There are no pictures
  there today, so a player without a portrait gets nothing new.

Not in scope: team roster rows (`/team/<abv>`, `.face`) and Home page polls. Leave them unchanged.

## Allowed changes
- `src/lib/players.ts` and the pages and components for the chosen spots, plus their CSS.

## Out of scope
- No deploy (`npm run deploy`, `wrangler`), commit or push. The user deploys after review.
- The portrait files and manifest, the team art, the sync scripts, the database and schema, and the
  Home page layout rules in `docs/ai/DECISIONS.md` (collapsible sections, pet card in the 8th slot,
  Upcoming games above pets). Don't recreate removed pages.
- Installing packages.

## How to run commands
You run without anyone to approve commands, so only these run, exactly as written, from the `site` folder:
`npm run build`, `git status`, `git diff`, `git log`, and `Get-ChildItem` / `Get-Content` / `Test-Path` /
`Get-Item` / `Select-String`. Use plain `git ...`, not `git -C <path> ...`, and don't chain commands with `;`. Anything
else will be refused: read and edit files with your file tools instead.

## Checks
- `npm run build` passes with zero errors.
- On the player page, a player with a portrait (for example Wembanyama, 1641705) shows it, and a player
  without one shows the headshot as before. On the Stats page, portrait players get the icon and others
  look as before.
- `git status --short` shows changes only in the allowed files.

## Return format
1. Files changed.
2. Checks run, with results.
3. How the portrait is sized at each spot.
4. Assumptions made.
5. Open questions.
