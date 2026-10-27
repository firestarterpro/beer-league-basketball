# Current Project Status

## Verified Passing (Latest Check)
- **Home:** Sections collapse, pick-my-team pop-up works, lineup links point to the right team and day, pet info card is in the 8th slot, and Upcoming games sits above pets.
- **Stats:** Single section with team rosters in menu; saving a view works. Portrait icons show next to players who have one (TASK-004).
- **Core Pages:** Draft, Approvals, team pages, and player photos load properly. Player cards show the cartoon portrait when the player has one, else the NBA headshot (TASK-004).
- **Sync Indicator:** "Last synced" displays the newest automatic sync.
- **Cleanup:** Old pages are removed.

## Active / Pending Items
- **TASK-001 (Live):** ESPN-links fix (00093b6) is committed and on the live site; today's `npm run build` verified clean.
- **TASK-002 (Done, awaiting push):** Nightly power model code finished and offline-checked (27/27 runner tests); Task Scheduler runs it from this folder; only the commit/push is left.
- **TASK-003 (Done):** 25 portraits in `site/public/img/players/` (512x512 WebP, each under 80 KB). Owner approved redoing the 13 hand-built ones with the image model — not redone yet.
- **TASK-004 (Done):** Portraits show on player cards and as Stats page icons; new portraits appear from `portraits.json` alone with no code change. Build clean.
- **Known Ignored Warning:** Live stats and post-game runs finished "with errors" last night (NBA box score issue — intentionally left alone).
