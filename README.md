# Beer League Basketball 🏀

**A $0/month full-stack web app for a private family fantasy basketball league, built as a hands-on study of modern web development.**

Live site: https://beer-league.beer-league-site.workers.dev

## Why this exists

On the surface this is a companion website for a seven-team ESPN fantasy league. Underneath, it is a self-directed learning project. I wanted to understand, by building something real that people actually use, what it takes to ship a production website end to end:

- how a **server-rendered web framework** turns data into pages,
- how a **relational database** enforces rules instead of just storing rows,
- how to pull from **third-party APIs** that weren't designed for me,
- how **edge hosting** works and how to run all of it for **zero dollars**,
- and how much **UI, layout, typography, color, sound and motion** can be done with plain web platform features.

The league gave the project real requirements, real users and a real deadline: the site had to be live before draft night.

## What I studied, and where it shows up

| Area | What I learned | Where it lives |
|---|---|---|
| **Server-side rendering** | Astro in `output: "server"` mode, file-based routing, dynamic routes (`team/[abv]`, `player/[id]`), components, layouts and middleware | `site/src/pages`, `site/src/components`, `site/src/layouts` |
| **Edge hosting** | Deploying to Cloudflare Workers, secrets vs. vars, KV storage, Node compatibility flags, why the Worker runs in UTC | `site/wrangler.jsonc`, `site/astro.config.mjs` |
| **Relational data modeling** | Postgres schema design, numbered migrations, views for computed stats, SQL functions for league rules, seeds and SQL test suites | `db/migrations` (17 migrations), `db/tests` |
| **Serverless Postgres** | Neon free tier, the `@neondatabase/serverless` driver, a read-only reporting role for BI tools | `site/src/lib/db.ts`, `004_looker_reader.sql` |
| **REST API design** | 14 JSON endpoints for votes, polls, sync, rankings, pets and trading cards | `site/src/pages/api` |
| **Third-party data** | ESPN Fantasy (cookie-authenticated) and NBA stats APIs; matching players across two systems by name and ID | `sync/espn_sync.py`, `sync/nba_sync.py` |
| **Data pipelines and scheduling** | A Python sync runner on a Windows Task Scheduler, nightly jobs with retry windows, database backups | `sync/sync_runner.py`, `sync/nightly.ps1`, `sync/backup_db.py` |
| **Ranking models** | Weighted "power" scores from box-score and defensive stats, tiers that refresh every four weeks | `sync/power_tiers.py`, `sync/publish_rankings.py` |
| **Auth without accounts** | A single commissioner passcode stored as a Worker secret; everyone else stays login-free | `site/src/lib/lm-auth.ts`, `middleware.ts` |
| **Canvas graphics** | Drawing downloadable trading-card PNGs (front and back) in the browser, fitting text into art and loading web fonts before drawing | `site/public/card-dl.js`, `site/src/lib/cards.ts` |
| **CSS theming and accessibility** | 22 generated retro themes, a per-device theme picker, automated WCAG contrast checks, `prefers-reduced-motion` support | `site/tools/themes`, `site/tools/theme_contrast.py`, `site/public/themes.css` |
| **Web Audio** | 22 sound effects synthesized in code, with no audio files | `site/public/toys.js` |
| **Browser game design** | "Masco-Pets", a Tamagotchi-style team pet with trivia, a prize wheel and syncing between devices | `site/public/pet`, `site/src/components/GigaPet.astro` |
| **Business intelligence** | Report views shaped for Looker Studio's Postgres connector | `db/migrations/006_reports.sql`, `LOOKER_SETUP.md` |
| **Testing** | SQL rule/workflow tests, offline Python tests for the sync scripts, Playwright smoke and click-through runs on desktop and phone sizes | `db/tests`, `sync/test_*.py` |

## Features

- **Player tier rankings** with a sortable table. Tier caps (T1 🤾 / T2 ⛹ / T3 🚶) are enforced on free-agent adds.
- **Team pages and trading cards** with live team points, league rank and pet level, plus a **Download card** button that exports front and back PNGs.
- **Polls, approvals and an action queue** for league decisions. Voting is open, and results are public.
- **Commissioner desk** behind a passcode for overrides, pet controls and avatar requests.
- **Upcoming games panel** and a **Sync Now** button anyone can press.
- **Masco-Pets** team mascots that grow with real player performance.
- **A retro 90s look** with themes per page, CRT and VHS touches, and sound toys you can mute.

## Architecture

```
            ESPN Fantasy API      NBA stats API
                    \                 /
             Python sync on a home PC (Task Scheduler)
                             |
                     Neon Postgres (free)
                     /                  \\
  Astro SSR on Cloudflare Workers     Looker Studio
                 |
          Browser (canvas, Web Audio, CSS themes)
```

**Monthly cost: $0.** Cloudflare Workers free plan, Neon free tier, Looker Studio, and a PC that was already on.

## Things that surprised me

- A named CSS container query on one panel froze Chrome for about 9 seconds per layout. A `ResizeObserver` toggling classes fixed it.
- `all: unset` on a draggable `<button>` silently removes Chrome's built-in drag behavior.
- Rebuilding a list on an input's `change`/`blur` event can swallow the click that caused it.
- Edge Workers run in UTC, so every date shown to people has to be converted to the league's time zone on purpose.
- Some sports data sites block cloud servers, which is why the data sync runs on a home PC.

## Repository layout

| Folder | Contents |
|---|---|
| `site/` | The Astro app: pages, API routes, components, client scripts, themes |
| `db/` | Postgres migrations, seeds, SQL tests and `migrate.py` |
| `sync/` | ESPN/NBA sync, the ranking model loader, the scheduler and backups |
| `SETUP.md` | Going-live steps, in order |
| `LOOKER_SETUP.md` | Connecting Looker Studio to the report views |

## Running it locally

```bash
python db/migrate.py          # schema + seeds on any Postgres
python db/migrate.py --test   # rule, workflow and schedule tests

cd site && npm install
cp .dev.vars.example .dev.vars   # set DATABASE_URL
npm run dev
```

Secrets (database URL, ESPN cookies, commissioner passcode) live in git-ignored `.env` / `.dev.vars` files and Cloudflare secrets. None are committed.

## How it was built

I designed the league rules, ranking model, art direction and features, and built the site with an AI pair programmer (Claude Code) doing much of the implementation. That let me learn by directing, reading, testing and deploying real code across a much wider stack than I could have covered alone in the same time.

## Tech stack

Astro 7 · TypeScript · Cloudflare Workers + KV · Neon Postgres · Python 3 (psycopg, espn_api, nba_api) · Looker Studio · Canvas 2D · Web Audio API · Playwright
