// The league syncs the LM's PC runs (sync/sync_runner.py JOBS), for the Updates page.
// The PC does the work; the site only stores the schedule and Run now requests in KV.
export type SyncJob = { key: string; name: string; what: string; when: string; pausable?: boolean };

export const SYNC_JOBS: SyncJob[] = [
  { key: "moves", name: "ESPN moves", pausable: true,
    what: "Rosters and transactions from ESPN. The check is one free ESPN call; the database is only written when something changed.",
    when: "Checked every {moves_every} min" },
  { key: "stats", name: "Live stats", pausable: true,
    what: "Live fantasy scores from ESPN, NBA scores, and tracking stats for finished games.",
    when: "Every {stats_every} min from the first tip until every game is final" },
  { key: "postgame", name: "Post-game", pausable: true,
    what: "Everything: stats, standings, rosters, NBA schedule, heat rankings, then a database backup.",
    when: "{postgame_delay} min after the last game goes final" },
  { key: "nightly", name: "Morning run", pausable: true,
    what: "Last night's games, the NBA schedule, heat rankings and a backup, in case the PC was off after the games.",
    when: "From {nightly_hour}:00 (retried for 2 hours), skipped when the post-game run already happened" },
  { key: "quick", name: "Quick ESPN sync", what: "Rosters, transactions, standings and current scores. Same as the Sync button.",
    when: "When anyone presses Sync" },
  { key: "schedule", name: "NBA schedule", what: "The season's games and tip times from NBA.com.", when: "Part of post-game and morning runs" },
  { key: "heat", name: "Heat rankings", what: "Rebuilds the power-ranking model and publishes the heat list.", when: "Part of post-game and morning runs" },
  { key: "backup", name: "Database backup", what: "A copy of the Neon database into the backups folder on the PC.", when: "Part of post-game and morning runs" },
];

export const SYNC_JOB_KEYS = SYNC_JOBS.map((j) => j.key);
export const PAUSABLE = SYNC_JOBS.filter((j) => j.pausable).map((j) => j.key);

// Same names, defaults and limits as sync_runner.py DEFAULTS / LIMITS.
export const SCHEDULE_FIELDS = [
  { key: "moves_every", label: "ESPN move check every (min)", def: 1, min: 1, max: 60 },
  { key: "stats_every", label: "Live stats every (min)", def: 17, min: 5, max: 60 },
  { key: "postgame_delay", label: "Post-game run, minutes after the last game", def: 30, min: 0, max: 180 },
  { key: "nightly_hour", label: "Morning run starts at (hour, Central)", def: 6, min: 0, max: 10 },
] as const;

export type Schedule = { moves_every?: number; stats_every?: number; postgame_delay?: number; nightly_hour?: number; paused?: string[] };

/** Keep only sensible values, like the PC does. */
export function cleanSchedule(raw: Record<string, unknown>): Schedule {
  const out: Schedule = {};
  for (const f of SCHEDULE_FIELDS) {
    const v = Number(raw[f.key]);
    if (raw[f.key] !== "" && raw[f.key] != null && Number.isInteger(v) && v >= f.min && v <= f.max) out[f.key] = v;
  }
  if (Array.isArray(raw.paused)) out.paused = PAUSABLE.filter((k) => (raw.paused as unknown[]).includes(k));
  return out;
}

// PowerShell, for running a job by hand on the PC.
export const SYNC_DIR = String.raw`C:\Templar Archives\Basketball Bro\beer-league\sync`;
export const psCommand = (job: string) => `cd "${SYNC_DIR}"\n.\\.venv\\Scripts\\python.exe sync_runner.py run ${job}`;
export const PS_STATUS = `cd "${SYNC_DIR}"\n.\\.venv\\Scripts\\python.exe sync_runner.py status`;
