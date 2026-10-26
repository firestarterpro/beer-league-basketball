# Going live: step by step

Everything is built and tested locally. These are the steps that need your accounts, your PC or your OK, in order. Nothing here costs money.

## 1. Neon database (about 10 minutes)

1. Sign up at https://neon.com (free, no card) and create a project named `beer-league`.
2. On the project dashboard, click **Connect** and copy the connection string. It looks like `postgresql://...@ep-....neon.tech/neondb?sslmode=require`.
3. Keep it on your PC only. In `sync\`, copy `.env.example` to `.env` and paste it after `DATABASE_URL=`.

## 2. Python on your PC

In a terminal, from the `sync` folder:

```
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

## 3. Create the tables

From the project folder:

```
sync\.venv\Scripts\python db\migrate.py
sync\.venv\Scripts\python db\migrate.py --test
```

The test should say `26 passed`, `21 passed` and `8 passed`, each with `0 failed`. It leaves no data behind.

When Claude adds a new migration later, run `db\migrate.py` again. It only runs files it hasn't run before.

## 4. Connect ESPN

1. Log in at fantasy.espn.com in Chrome, open your league, and copy the league ID from the address bar (`leagueId=...`).
2. Press F12 > **Application** > **Cookies** > `https://fantasy.espn.com`. Copy the values of `espn_s2` and `SWID`.
3. Put all three in `sync\.env`. `ESPN_YEAR=2027` is the 2026-27 season (ESPN names seasons by their end year).
4. Run, from `sync`:

```
.\.venv\Scripts\python espn_sync.py teams
```

It lists each ESPN team and whether it linked to a team in the database. Teams link by matching abbreviations (LBA, STAT, JST, FLAG, TM5, TM6, the same as ESPN). If one doesn't link, change its abbreviation on the LM desk or tell Claude.

5. Then run `.\.venv\Scripts\python espn_sync.py nightly`. If anything fails, run `.\.venv\Scripts\python espn_sync.py dump rosters` and share the file it saves in `raw_cache\` (it has no passwords).

## 5. First tier snapshot

On your tier cutoff date:

```
.\.venv\Scripts\python espn_sync.py tiers --version 1 --effective 2026-10-25
```

Ranks come from ESPN's standard projection rankings, re-numbered 1, 2, 3... T1 = 1-25, T2 = 26-50, T3 = 51+. Every 4 weeks, run it again with `--version 2` and the new date.

## 6. NBA tracking stats

```
.\.venv\Scripts\python nba_sync.py schedule
.\.venv\Scripts\python nba_sync.py games --from 2026-10-21
.\.venv\Scripts\python nba_sync.py link
```

`schedule` saves the whole season's games with tip times (and a local copy in `raw_cache\schedule.json`). `today` refreshes live status and scores for today's games.

`link` matches NBA.com players to ESPN players by name and lists any it couldn't match.

## 7. Automatic syncs (Task Scheduler)

`sync_runner.py` decides what runs and when. Task Scheduler starts it every minute; most minutes it does nothing. Times are Central:

| What | When |
|---|---|
| ESPN moves (adds, drops, trades, IR) | checked every 1 or 15 min; Neon is written only when something changed |
| Sync Now button on the website | picked up within a minute, if your PC is on |
| Stats (live fantasy scores, NBA scores, tracking stats) | every 17 min from the first tip until every game is final |
| Post-game (everything + heat rankings + backup) | 30 min after the last game ends |
| Nightly | 6:00am, retried until 8:00; skipped if the post-game run already happened |

To install it, run this from `sync`, then paste the 4 lines it prints into PowerShell:

```
.\.venv\Scripts\python sync_runner.py install
```

Useful commands:

```
.\.venv\Scripts\python sync_runner.py status          # what ran last
.\.venv\Scripts\python sync_runner.py moves-every 15  # or 1
.\.venv\Scripts\python sync_runner.py run postgame    # run a job by hand
```

Logs are in `sync\logs\runner-<date>.log`. `nightly.ps1` still works for a full run by hand.

## 8. Website on Cloudflare

1. Create a free Cloudflare account.
2. From the `site` folder:

```
npm install
npx wrangler login
npx wrangler secret put DATABASE_URL     (paste the Neon string)
npx wrangler secret put LM_PASSCODE      (type the LM passcode; it locks /lm and /pet-desk)
npm run deploy
```

The first deploy also creates the small Cloudflare KV store behind the Sync Now button (free tier). The deploy prints your site address (`beer-league.<you>.workers.dev`). Put it in `sync\.env` as `SITE_URL=` so your PC can see Sync Now presses. Your LM desk is at `/lm` on that address. It isn't linked from anywhere, so keep it to yourself.

## 9. Looker Studio

See [LOOKER_SETUP.md](LOOKER_SETUP.md). When the report exists, paste its embed link into `LOOKER_REPORT_URL` in `site/wrangler.jsonc` and deploy again.

## 10. GitHub (optional, recommended)

Create a private repo and push this folder, so your local LLM and Claude work from the same copy. `.env` and `.dev.vars` are git-ignored, so secrets stay off GitHub.

## Open questions

- Power rankings: `build_model.py` currently reads the 2025-26 sample. It needs pointing at season-to-date data before `nightly.ps1` can publish weekly rankings.
