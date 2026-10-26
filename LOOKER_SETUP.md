# Looker Studio setup

Looker reads the `report_*` views in Neon through a read-only login, so it can never change league data.

## 1. Create the read-only login

```
sync\.venv\Scripts\python db\migrate.py --looker-password "pick-a-password"
```

## 2. Connect (Neon's guide: https://neon.com/docs/connect/connect-looker-studio)

1. In Looker Studio: **Create** > **Data source** > **PostgreSQL**.
2. Host: your Neon host (the part after `@` and before `/` in the connection string). Port 5432. Database `neondb`.
3. Username `looker_reader`, plus the password from step 1.
4. Tick **Enable SSL**. Upload the ISRG Root X1 certificate as Neon's guide describes. Leave client authentication off.
5. Pick a view from the list below. Repeat for each view you want: one data source per view.

If it fails to connect, save the exact error message and compare your settings with Neon's guide before changing anything else.

## 3. Views to use

| View | Use it for | Good controls |
|---|---|---|
| `report_standings` | Standings table with tier badge | none |
| `report_rosters` | Rosters with tiers, slots, injuries, team badge | team, tier |
| `report_tier_list` | Current tier list, who owns each player | tier |
| `report_tier_history` | Tier changes across snapshots | snapshot_version |
| `report_transactions` | Transaction log | type, team, date range |
| `report_scoring_leaders` | Per-game points, all three models | model_key, date range, tier |
| `report_team_points_by_model` | Team totals under each model | model_key |
| `report_draft` | Draft results | team |
| `report_power_rankings` | Weekly and Minutes Power, NBA and fantasy versions | ranking, run_date (filter `is_latest` = true for the current list) |
| `report_defense` | NBA tracking stats per game | date range |
| `report_injuries` | Rostered players not listed ACTIVE | team |
| `report_poll_results` | Poll counts | question |
| `report_rulebook` | Rules by section and version | section |
| `report_schedule` | Every NBA game, tip time in Central, live status | date range, team |
| `report_team_schedule` | Each fantasy team's players and their upcoming games | team, date range |
| `report_team_games_by_day` | Games per fantasy team per day (active and all) | team, date range |
| `report_freshness` | When each dataset last updated | none |

## 4. Badges

`badge` is Legal, Power Play or Violation. `badge_label` is the same text with ⚡ before Power Play. Use **conditional formatting** on that column: Power Play gets a slime-green background, Violation a muted orange, Legal plain green. Looker can't animate, so there's no glow.

## 5. Keep Neon asleep when idle

Neon's free tier sleeps after 5 minutes idle. That's what keeps it free. In each data source, keep **data freshness** at 12 hours or more, and don't use auto-refresh on the report. Sync jobs run overnight, so that's enough.

## 6. Embed in the site

**File** > **Embed report** > **Enable embedding**, copy the embed URL, and put it in `LOOKER_REPORT_URL` in `site/wrangler.jsonc`. Then `npm run deploy` from `site`.
