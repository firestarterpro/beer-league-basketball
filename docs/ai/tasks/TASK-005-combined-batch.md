# TASK-005: Combined website batch (header + top bar, Upcoming games, player page, roster/tier cleanup)

Worker: **Cline** (Jason picked route 1a, 2026-10-29 00:36 UTC). Spec source:
`/mnt/project-files/plans/build-batch-2026-10-29.md` (copy of the relevant parts below).

**Objective (one, bounded):** build the UI + DB changes below in one local change set, run the build,
and report. Nothing gets committed, pushed, migrated or deployed by the worker.

**Working directory:** `site/` (plus one new file in `db/migrations/`).

## Ground rules (Jason's standing rules)
1. Make no product decisions. If something below is unclear, stop and ask with NUMBERED questions.
2. Build only what is listed. No refactors or "while I'm here" fixes.
3. Never run: `npm run deploy`, `wrangler`, `npx wrangler`, `db\migrate.py`, `git commit/push/reset`,
   anything against Neon, or `sync/test_*_offline.py` (some write to LIVE Neon). `npm run build` is allowed.
4. Public repo: no league members' surnames, no emails, no secrets.
5. Read `CLAUDE.md` and `docs/ai/DECISIONS.md` first. Item 1 (NBA box score) stays untouched.
   Removed pages stay removed (`/tiers`, `/polls`, `/actions`, `/practice-draft`).
   **Jason's newer decisions in this packet replace DECISIONS item 2's "ESPN links" line** (one merged bar now);
   the rest of item 2 still holds (collapsible Home sections, Upcoming games above pets, pet card in the 8th slot).

## Work

### A. Header + one merged top bar (`src/layouts/Base.astro`, `src/lib/espn.ts`, `public/site.css`)
- Move Sync button + last-synced + sound button + pet avatar into the right end of the nav row.
- Move the "My team" + "Theme" pickers below the games ticker, above the left column.
- Phones: Sync + pet stay in the last nav slot, shrunk: icon-only sync button with the time underneath in
  small text, smaller pet avatar, sound button stays.
- ONE merged bar replaces both the nav buttons and the ESPN shortcut row(s) (`shortcut-bar`, `espn-links`),
  on every page. Links, in this order:
  1. Edit Lineup (was "Set tomorrow's lineup"; same per-team tomorrow link, `ESPN.lineup()`)
  2. Free Agents (was "Add players")
  3. ESPN Standings (was "Standings")
  4. Injury Report ESPN -> https://fantasy.espn.com/basketball/playernews?leagueId=1894794086
  5. Beer League Stat -> `/stats` (internal)
  6. Rules/Approvals (see C)
  7. ESPN Activity (was "Recent activity")
  8. ESPN Daily Leaders
  9. Fantasy Cast
  Then (Jason 00:45): 10. My team, 11. Trades, 12. League home, 13. Home (Home is NOT shown on `/`, only on other pages).
  **Remove the Draft and Dashboards buttons** from the bar (the pages themselves stay; just no bar link).
- Rename "Rosters & trades" to **"Trades"** everywhere (espn.ts, index.astro, team/[abv].astro, any other hit).

### B. Home: Upcoming games with Lineups merged in (`src/pages/index.astro`, `public/schedule.js`, `public/team.js`, `site.css`)
- Remove the separate Lineups section (`#lineup`); its content merges into `#upcoming`. Keep the section
  collapsible and keep it above the pets section.
- Much smaller section. Shows only the team picked in "My team", with an "expand: all teams" option for all 7.
- Per day: ONE row of player photo tiles ordered by slot: PG, PG, SG, SG, SF, SF, PF, PF, C, C, UTIL/bench x3, IR x2.
- Each tile: photo + the player's AVERAGE fantasy points (below or on the photo).
- Bench (the 3 UTIL/bench slots) visibly highlighted. Injured players marked. IR players get a
  wheelchair/accessibility icon (♿) over the photo.
- No opponent ("vs team") info. Only the first game's start time, next to the day label.
- After the last player each day: a "Change lineup" icon tile (links to that team's ESPN lineup for that
  day) and a "Trades" icon tile (`ESPN.rosters`), both the same size as a player tile.
- Day buttons (Tonight / Tomorrow / 3rd day): remove the shading so the text is easy to read.
- Data: use what the page/APIs already have (rosters, `position_slot`, `slot`, injury fields, player points).
  If avg fantasy points or slot order isn't available without a new query, add the smallest query in
  `src/lib/` and report it.

### C. Rules/Approvals merge (`src/pages/rules.astro`, `src/pages/approvals.astro`)
- One page at `/rules` holding both the rules and the Approvals & Requests content.
- **Delete `/approvals`** (Jason 00:45; no redirect, same as `/tiers`). Update any links that pointed to it.

### D. Player page (`src/pages/player/[id].astro`, `site.css`)
- "How he scores": attempts sit next to makes (FGM | FGA, FTM | FTA, 3PM | 3PA) instead of negatives grouped at the
  bottom. Every row shows `[count x pts = pts]` (stat count x scoring weight = fantasy points).
- Layout: "How he scores" moves to the RIGHT column. Points standings + Power rankings move to the LEFT column,
  and the left column starts at the top beside a narrower, more condensed top player info block.
- Points standings shows 9 players (4 above, the player, 4 below) instead of 5.
- Must still work at phone width.

### E. Roster + tier-cap cleanup
- Roster everywhere on the site: 2 PG, 2 SG, 2 SF, 2 PF, 2 C, 3 UTIL/bench, 2 IR (13, up to 15 with 2 injured).
  Search the site for the old "10 spots / no bench" wording and fix it (rules page, Home rule snippets, alerts).
- New migration `db/migrations/019_roster_and_no_tier_caps.sql` (WRITE ONLY, do not run):
  - `league_settings`: roster_size 13, starter_slots `PG,PG,SG,SG,SF,SF,PF,PF,C,C`, bench_slots 3 (UTIL/bench), ir_slots 2
    (match the existing key/value style in `008_roster_slots.sql`).
  - Tier caps are NOT enforced, only noted. Remove enforcement: `would_exceed_caps`, the cap check + community
    vote in `create_claim` / `create_ir_activation` (005, 009), and the "Violation" badge logic in views
    (003 `team_badges`). Prefer `CREATE OR REPLACE` that keeps signatures so nothing else breaks; list every
    object you change. Stop and ask before any DROP TABLE or data delete.
- Site side: remove the enforcement flows: FA-add cap checks, "Whoa! Violation" helper in approvals,
  violation/Power Play enforcement messages, the "Over the caps"/Violation stamps, cap alerts in
  `api/alerts.ts`, LM drop actions for cap breaks (`lm.astro`, `api/actions.ts`).
- KEEP all tier display: tier medals/emoji, T1/T2/T3 counts, tier notes ("max 3 T1, max 3 T2" as a guideline).

## Out of scope
Stats page portrait icons (another thread is doing the head-zoom), portrait files, `sync/`, `model/`,
docs 1-7 (Claude handles those), deploy.

## Checks
- `cd site` then `npm run build` = 0 errors (first verified run of this check; report the output).
- `git status --short`: changes only in the files named above + the new migration.
- If you can: `npm run dev` and look at Home, a player page, a team page, /rules at desktop and phone width.

## Done when (observable)
- One merged bar on every page in the order above; no ESPN shortcut row; Home button absent on `/` only;
  no Draft or Dashboards button; `/approvals` returns 404 and its content is on `/rules`.
- Home has no Lineups section; Upcoming games shows the picked team's tile rows per the rules in B.
- Player page layout per D with 9-row Points standings.
- No user-facing text says tier caps are enforced or shows a Violation stamp; tiers still display.
- Migration 019 exists, unrun.

## Report back
Changed files, build output, assumptions made, open questions (numbered).
