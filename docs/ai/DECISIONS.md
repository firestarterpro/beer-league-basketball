# Locked Decisions & Do-Not-Touch Zones

## Do Not Reopen or Modify Without Approval
1. **NBA Box Score Issue (Live Stats & Post-Game Runs):**
   - Known status: Nightly live stats and post-game runs currently finish "with errors" due to the NBA box score issue.
   - Policy: **Leave this alone** unless the user explicitly opens a task for it. Do not attempt opportunistic fixes when working on site UI or deploy tasks.
2. **Home Page Layout Rules:**
   - Sections must remain collapsible.
   - Upcoming games sits above the pets section, and the pet info card stays in the 8th slot.
   - One merged top bar on every page (site pages + ESPN links, lib/espn.ts TOP_BAR; Jason 2026-10-29). Home button hidden on Home; no Draft or Dashboards buttons. Lineups section merged into Upcoming games.
3. **Removed Legacy Pages:**
   - Old removed pages must stay deleted; do not recreate or re-link them.
4. **Deployment Gate:**
   - Workers may run local build/check commands, but `npm run deploy` (in `site/`, = `astro build && wrangler deploy`) and any direct `wrangler deploy` / `npx wrangler` call are strictly gated by user approval after diff/build verification. Copilot workers have these blocked via `scripts/invoke-worker.ps1`.
