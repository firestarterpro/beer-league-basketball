# TASK-008: Review Compare teams page + espn_sync scores fix

**Reviewers:** Jason + Cline. **Review only:** no code changes, no deploy, no DB writes.

**Objective (one, bounded):** Review the Compare teams page and the `espn_sync.py` scores fix
(plus the Oct 20–28 backfill), and report findings. Do not fix anything in this task.

**Working directory:** repo root (`site/` for the page, `sync/` for the sync).
**Relevant files:**
- `site/src/lib/compare.ts`, `site/src/pages/compare.astro`, `site/src/lib/espn.ts` (one top-bar line: Compare teams → `/compare`)
- `sync/espn_sync.py` → `cmd_scores` only
- For context: `db/migrations/001_core.sql` (scoring_ledger, lineups), `db/migrations/003_views.sql` (fantasy_points_by_model), `sync/logs/runner-2026-10-2*.log`

**What to review:**
- **A. Compare page**
  - Started-slot attribution: only lineup slots other than `BE`/`IR` count, and points go to the team that started the player that day.
  - Time windows: Today, This week (assumes a Monday→today week in Central time; is that the league's week?), Season.
  - Player breakdown adds up to the team total; "no longer on this roster" players are handled correctly.
  - ESPN mismatch note, empty states, and accessibility (labels, table headers, keyboard use, contrast).
- **B. `cmd_scores` fix**
  - espn_api's `_get_pro_schedule(period)` returns `{proTeamId: (opponentProTeamId, date_ms)}`. The old code expected `{proTeamId: {period: [game]}}` and crashed with `'tuple' object has no attribute 'get'` on every run from Oct 25 to Oct 28. Each crash rolled back the whole transaction, so 0 rows were ever written.
  - Players with no game that day now get a lineup row dated to that period's game day (it used to be "yesterday").
  - `game_id` is now `period-<lowerTeamId>-<higherTeamId>`, because the tuple has no ESPN game id. Check that nothing joins `scoring_ledger.game_id` to NBA game ids (`games` table).
  - `ms_to_date` uses local time. Check that late tip-offs land on the right day.
- **C. Backfill sanity:** periods 1–9 (Oct 20–28) are in. Counts: scoring_ledger 381, lineups 824 (91 a day, 96 on Oct 28). Period 5 failed once on a `players` insert (probably a collision with the scheduled runner) and the retry was clean.

**Open items (investigate read-only, report, don't fix):**
1. `sync/test_espn_sync_offline.py` fakes `_get_pro_schedule` in the old, wrong shape (line ~105), which is why the tests missed the crash. Say what the update should be. **Do not run the offline tests' DB checks against live Neon.**
2. `standings.total_points` is 0 for every team, so Compare's ESPN-mismatch note shows 0 and Home may show zeros too. Find out why with read-only steps (`cmd_standings` uses `points_for`; season-long leagues may need a different field).
3. Spot-check one team's Season and This week totals on /compare against ESPN's own numbers.

**Do not touch:** `docs/ai/DECISIONS.md` locked items (item 1 = the NBA box score job, separate from this), deploy config, Neon data, migrations.

**Checks to run:** `cd site && npm run build` (verified passing 2026-10-29). `npm run dev` then /compare is fine for looking at the page.

**Done when (observable):** a findings list and a questions list are posted back. No files changed.

**Decisions already made:**
- Compare uses the league's Hustle scoring model and counts only started slots.
- The backfill is approved and done. Re-running `scores --period N` is safe because it upserts.

**Stop and report instead of guessing if:** requirements conflict, credentials are missing, a security
or destructive choice comes up, or a business rule is unclear. Small reversible assumptions are fine; list them.

**Report back:**
- Findings by severity (high / medium / low), each with `file:line` and a one-line suggested fix.
- Numbered open questions.
- Checks run and results, and any assumptions made.
