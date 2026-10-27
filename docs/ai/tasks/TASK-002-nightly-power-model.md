# TASK-002: Nightly power rankings from this season's games

## Objective
Make the morning sync job build the power rankings from this season's games, so the rankings change
each day and Scrub of the Week gets candidates. Today the model only reads a frozen draft-day data set,
and the morning job never pulls new games.

## Working directory
`C:\Templar Archives\Basketball Bro\beer-league`. The two areas are `model/` and `sync/`.

## Read these first
- `model/pull_draft.py`: the existing pull. Imitate its stats.nba.com calls, its raw_cache resume, its
  `.done` markers, its retry delays, and the way it writes one combined CSV per endpoint.
- `model/build_model.py`: the model (steps 1-7). It reads `model/data/` and writes the 4 ranking CSVs to
  `model/out_draft/`. It already scores games that lack hustle, defensive or tracking box scores.
- `sync/sync_runner.py`: `run_heat()` (about line 258) and `JOBS` (about line 69). "heat" runs
  `<BUILD_MODEL_DIR>/build_model.py`, then `publish_rankings.py <BUILD_MODEL_DIR>`. The "nightly"
  (6-8am Central) and "postgame" jobs, and the Updates page's "heat" button, all use it.
- `sync/publish_rankings.py`: reads `ranking_weekly_nba.csv`, `ranking_weekly_fantasy.csv` and
  `ranking_minutes_{nba,fantasy}[_min30].csv` from the top level of the folder it is given. `--dry-run`
  only reads the files and never connects to the database.
- `docs/ai/DECISIONS.md`: locked decisions and areas to leave alone.

## Decisions already made (do not change)
- Folder: `beer-league/model` holds the nightly model. `BUILD_MODEL_DIR` will point there. The user sets
  it in `sync/.env` after review; you do not.
- Data window: each team's last 20 games of the 2026-27 regular season, rolling (newest first, like
  `RECENCY_RANK`).
- Early season: use only this season's games, even when a team has played fewer than 20. No top-up from
  2025-26, no preseason games, and no minimum before publishing.
- The model's scoring (steps 1-7, weights, BLOCK_MIN rule) stays the same.

## Required behavior
1. A season pull in `model/`, as a new script or a mode of the existing one (your choice). It selects the
   window above and fetches only games it doesn't already have (raw_cache). It writes combined CSVs for
   `build_model.py` to read.
2. `build_model.py` (or a thin wrapper) reads that season data and writes the 4 ranking CSVs where
   `publish_rankings.py` will find them when the runner calls it.
3. `run_heat()` runs: pull, then build, then publish. If the pull fails, log it and still finish the job,
   as other steps do. The runner gives each script 30 minutes, so keep a routine nightly pull (a few new
   games) well under that. Make sure a slow stats.nba.com day cannot hang the morning job.
4. The draft-day files stay as they are: `model/data/`, `model/out_draft/` and `pull_draft.py`'s
   behavior. Put the season data and output in their own folders.
5. `run_heat()` still skips cleanly when `BUILD_MODEL_DIR` is not set.

## Allowed changes
- New or edited files in `model/`.
- `run_heat()` in `sync/sync_runner.py`, plus `test_sync_runner.py` if a test needs updating.
- `sync/.env.example`: a comment line only, if the folder meaning changes.

## Out of scope (do not touch)
- The NBA box score / live stats / post-game code paths in `nba_sync.py` and `espn_sync.py`
  (DECISIONS.md item 1). Leave the other runner jobs, the schedule and nightly_hour unchanged.
- `sync/.env`, credentials, and the database or schema. No Neon access of any kind: run `publish_rankings.py` only with
  `--dry-run`, and never without it.
- The site (`site/`), deploys (`npm run deploy`, `wrangler`), `git push`, `git reset`, commits, and deleting
  files or folders (including `beer-league-sample`).
- Installing packages. The sync `.venv` already has pandas, numpy, nba_api and psycopg. If you need
  anything else, stop and ask.

## Checks to run (use the sync venv: `sync\.venv\Scripts\python.exe`)
1. The season pull for real (it calls stats.nba.com; slow is fine). Report teams, games per team (min
   and max) and any failed calls.
2. The build on that data. Report that the 4 ranking CSVs exist, and the Weekly NBA top 10.
3. `publish_rankings.py <output folder> --dry-run`: no "no file found" lines for the 4 rankings.
4. A second pull run that fetches nothing new, to show the cache works.
5. `python test_sync_runner.py` in `sync/`, which has no network and no database: it passes.

## Stop and report if
Requirements conflict, stats.nba.com blocks you repeatedly, something needs credentials or a database
write, or a change would touch anything out of scope. Make small reversible assumptions and list them.

## Return format
1. Files changed or created.
2. Checks run, with results (numbers above).
3. The exact `BUILD_MODEL_DIR` value the user should set.
4. Assumptions made.
5. Open questions.
