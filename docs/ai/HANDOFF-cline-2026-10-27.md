# Handoff to Cline: finish today's website updates + final deploy (2026-10-27)

Written by Claude from the project threads and a read-only look at the PC repo at ~11:35 UTC.
Repo: `C:\Templar Archives\Basketball Bro\beer-league\` (branch `main`, pushes to GitHub `firestarterpro/beer-league-basketball` branch `master`).
Live site: https://beer-league.beer-league-site.workers.dev

## 0. Ground rules (the owner's standing rules, follow all of them)

1. **Make no decisions.** Where something isn't settled below, present options and ask. Don't pick for the owner.
2. **Number every question** you ask (1, 2, 3...) so they can answer by number.
3. **Don't build anything beyond this list.** No extra features, refactors or "while I'm here" fixes.
4. **Ask before every deploy, Neon/database write, migration, commit and push.** Show the diff and build result first.
5. **Public repo:** no league members' surnames, no email addresses, no secrets. Commits authored as the owner's GitHub noreply address (`firestarterpro` noreply), same as existing history.
6. Read `CLAUDE.md` and `docs/ai/DECISIONS.md` first. Locked: leave the NBA box score / live-stats error alone; keep the Home layout rules (collapsible sections, pet card in the 8th slot, Upcoming games above pets); don't recreate removed pages (`/tiers`, `/polls`, `/actions`, `/practice-draft` are 404 on purpose).
7. **Never run** `sync/test_*_offline.py` against the PC's `sync/.env`: some of them reload `.env` and write to LIVE Neon. Never edit `sync/.env`.

## 1. Current state (verified on the PC)

`HEAD` = `676a2b3` = `origin/master` (everything committed is already live). Uncommitted work:

| Item | Files | State |
|---|---|---|
| TASK-001 ESPN links | (in `00093b6`, already committed + live) | Done. `docs/ai/STATUS.md` still says "pending release verification": update it. |
| TASK-002 nightly power model | `model/build_model.py`, `model/pull_season.py`, `sync/sync_runner.py`, `sync/test_sync_runner.py`, `sync/.env.example` | Done and checked (27/27 offline runner tests). Owner added `BUILD_MODEL_DIR` to `sync/.env`. Task Scheduler already runs these files from this folder, so it's effectively live; only the commit/push is left. |
| TASK-003 portraits | `site/public/img/players/` (25 `portrait-<nbaId>.webp`, `portraits.json`, `README.md`) | 25 made. 12 by the image model, **13 hand-built** (Jokić, SGA, Bam, Murray, Duren, Amen Thompson, Booker, LeBron, Brunson, Alexander-Walker, Jaylen Brown, Tatum, Avdija). Owner said **yes** to redoing those 13 with the image model and **keep** the photo-referenced style. Not redone yet. |
| TASK-004 show portraits | packet: `docs/ai/tasks/TASK-004-show-portraits.md` | **Not started** (the worker was blocked on permissions; nothing changed in `site/src`). Owner picked placements **A + C** only. |
| AI worker setup | `CLAUDE.md`, `docs/ai/`, `scripts/`, `.agents/` | Untracked. |
| Sync console (from 2026-10-26) | `sync/Beer League Control Panel.html`, `sync/Start Sync Console.bat`, `sync/console_schedules.json`, `sync/sync_console_server.py` | Untracked, not part of today's tasks. |
| Never commit | `screenshots/`, `scratch/`, `model/data_season/` (5.4 MB raw NBA data), `model/out_season/` | Raw data and scratch. |

No new database migration exists (latest is `018_injury_details.sql`, already applied on Neon).

## 2. Work to do, in order

### Step 1: TASK-004, show portraits on the site
Follow `docs/ai/tasks/TASK-004-show-portraits.md` exactly. Summary:
- Add one helper in `site/src/lib/players.ts` (e.g. `portraitSrc(nbaId)`) that reads `public/img/players/portraits.json` **at build time** (Cloudflare Workers have no file system at request time) and returns the portrait path or `null`.
- **A.** Player page card (`src/pages/player/[id].astro`, `.pcard-face`): portrait replaces the headshot when the player has one; otherwise the NBA headshot as today, same `photoSql` rule.
- **C.** Stats page / tier list: a small portrait icon next to players who have one; others unchanged.
- Portraits are 512x512 square sprites, headshots are 260x190: size/crop without stretching, and keep phone width working.
- New portraits must appear from the manifest alone (no code change).
- **Out of scope:** team roster rows (`/team/<abv>`, `.face`), Home polls, the portrait files, sync, DB.

Checks: `cd site` then `npm run build` = 0 errors. Wembanyama (`/player/...`, NBA id 1641705) shows the portrait; a player without one shows the headshot. Stats page shows icons only for portrait players. `git status --short` shows changes only in the allowed files. Preview locally (`npm run dev` or `astro preview`) at desktop and phone width if you can.

### Step 2: The 13 portrait redos (owner said yes)
These need an image-generation model; the earlier run used Gemini through Antigravity (`agy`) via the wrapper. Follow the style and post-processing rules in `site/public/img/players/README.md` (512x512 transparent WebP under 80 KB, same filenames, update nothing else in `portraits.json`). See question 2 below for how/when; ask before starting.

### Step 3: Tidy status docs
Update `docs/ai/STATUS.md` (TASK-001 live, TASK-002 done and on, TASK-003/004 results). Keep it short.

### Step 4: Pre-deploy review (show the owner, then wait)
- `git status` and `git diff --stat` for everything that will ship.
- `npm run build` result.
- Surname/email/secret scan of the files to be committed (e.g. search for league members' surnames, `@gmail`, `DATABASE_URL=`, API keys). Report the result.

### Step 5: Deploy (only after the owner says go)
From the repo root in PowerShell:
```
.\sync\.venv\Scripts\python.exe db\migrate.py
.\sync\.venv\Scripts\python.exe db\migrate.py --test
cd site
npm run deploy
```
(`migrate.py` should report nothing new to apply. If it lists a migration to apply, stop and ask.)
Deploy builds the **working tree**, so make sure it holds exactly what was reviewed.

### Step 6: Live checks
On the live site: Home loads (collapsible sections, pet card 8th slot), `/stats` loads with portrait icons, a portrait player's page shows the portrait, a non-portrait player shows the headshot, `/draft` and a team page load, `/tiers` is still 404. Report pass/fail per check.

### Step 7: Commit and push (only after the owner says go)
Commit only the files the owner approves (question 1), authored as the `firestarterpro` noreply address, then:
```
git push origin main:master
```

## 3. Out of scope today
- **New top-bar links** (Edit Lineup, Free Agents, ESPN Standings, Injury Report, Beer League Stats, Rules/Approvals merge, ESPN Activity, Daily Leaders, Fantasy Cast). The owner said "don't act, just log for now". It's logged in `/mnt/project-files/plans/ideal-concocter-plan-2026-10-25.md` with two open questions. Do not build it unless the owner says so.
- Header rework (Sync/pet into the nav row), morning lineup alerts and other held plan items.
- The NBA box score error, Looker, docs 1-7 updates, roster rows/polls portraits.

## 4. Questions for the owner (ask these, don't decide them)

1. **What goes into today's commit/push?** (a) Only today's tasks: TASK-002 code, the portraits, TASK-004 site changes, `docs/ai/STATUS.md`. (b) Option a plus the AI worker setup (`CLAUDE.md`, `docs/ai/`, `scripts/`, `.agents/`). (c) Option b plus the 2026-10-26 sync console files. (d) Something else. In every option, `screenshots/`, `scratch/`, `model/data_season/` and `model/out_season/` stay out (adding them to `.gitignore` is also an option to offer).
2. **The 13 portrait redos:** (a) Redo them first, then deploy everything together. (b) Deploy now with the current 25, and redo the 13 in a later deploy. (c) Skip the redo for now.
3. **If the redo goes ahead, which route?** (a) `pwsh -File scripts/invoke-worker.ps1 -TaskFile <redo packet> -Worker gemini -SkipPermissions` (agy; the owner runs it or approves it). (b) Another image route the owner names.
4. **Top-bar links:** confirm they stay out of today's deploy.

Earlier thread questions 26 and 27 (how TASK-004 and the redo get permission to run) are replaced by questions 2 and 3 now that Cline is doing the work.

## 5. Report back
1. Files changed. 2. Checks run, with results. 3. What was deployed and pushed (Worker version, commit hash). 4. Assumptions. 5. Open questions (numbered).
