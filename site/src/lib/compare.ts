// Compare teams (/compare): two fantasy teams side by side for one reporting window, plus each
// player's real contribution. A player's points count for a team only on days that team had him
// in a starting slot (lineups rows, not BE/IR) - the same rule as the team_points_by_model view -
// so nobody's whole season is credited to whoever owns him now.
// Fantasy points come from fantasy_points_by_model (the league's scoring_models rows, highest bonus only).
import { query } from "./db";
import { centralDate } from "./espn";

export const WINDOWS = ["today", "week", "season"] as const;
export type Window = (typeof WINDOWS)[number];
export const asWindow = (w: string | null | undefined): Window => (WINDOWS as readonly string[]).includes(w ?? "") ? (w as Window) : "season";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
/**
 * Date range (league Central time) for a window. "This week" runs Monday to today: ESPN's scoring
 * periods are single days and the league resets weekly things (waiver order) on its weekly cycle;
 * there is no week setting in league_settings, so Monday is an assumption, labelled on the page.
 */
export function windowRange(w: Window, now = new Date()): { from: string | null; to: string; label: string } {
  const today = centralDate(0, now);
  if (w === "today") return { from: ymd(today), to: ymd(today), label: "Today" };
  if (w === "week") {
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
    return { from: ymd(monday), to: ymd(today), label: "This week (Monday to today)" };
  }
  return { from: null, to: ymd(today), label: "Season" };
}

// Full names for every stat the scoring models use (shown instead of ESPN's abbreviations).
export const STAT_LABEL: Record<string, string> = {
  pts: "Points scored", fgm: "Field goals made", fga: "Field goals attempted", ftm: "Free throws made",
  fta: "Free throws attempted", tpm: "Three-pointers made", tpa: "Three-pointers attempted", tpmi: "Three-pointers missed",
  reb: "Total rebounds", oreb: "Offensive rebounds", dreb: "Defensive rebounds", ast: "Assists", stl: "Steals",
  blk: "Blocked shots", tov: "Turnovers", pf: "Personal fouls", ff: "Flagrant fouls", tf: "Technical fouls",
  ej: "Ejections", team_win: "Team wins", dd: "Double-doubles", td: "Triple-doubles", qd: "Quadruple-doubles",
};

export interface PlayerLine {
  team_id: string; player_id: string; name: string; on_roster: boolean;
  games: number; fantasy: number; espn: number | null;
  totals: Record<string, number>;       // summed box score over his started games
  bonus_points: number; dd: number; td: number; qd: number;
}

/**
 * Every started player-game for the two teams in the window, summed per player.
 * Bonus counts follow fantasy_points_by_model: double_cats >= 4 is a quadruple-double game, 3 a triple, 2 a double.
 */
export async function contributions(teams: string[], model: string, from: string | null, to: string): Promise<PlayerLine[]> {
  const rows = await query(
    `WITH g AS (
       SELECT lu.team_id, f.player_id, f.game_date, f.fantasy_points, f.double_cats, l.stat_line,
              l.fantasy_points AS espn_points,
              (SELECT coalesce(max(sm.points), 0) FROM scoring_models sm
               WHERE sm.model_key = $2 AND ((sm.stat = 'dd' AND f.double_cats >= 2)
                  OR (sm.stat = 'td' AND f.double_cats >= 3) OR (sm.stat = 'qd' AND f.double_cats >= 4))) AS bonus
       FROM lineups lu
       JOIN fantasy_points_by_model f ON f.player_id = lu.player_id AND f.game_date = lu.game_date AND f.model_key = $2
       JOIN scoring_ledger l ON l.id = f.ledger_id
       WHERE lu.team_id::text = ANY($1) AND lu.position_slot NOT IN ('BE', 'IR')
         AND lu.game_date <= $4::date AND ($3::date IS NULL OR lu.game_date >= $3::date))
     SELECT g.team_id::text AS team_id, g.player_id, p.name,
            EXISTS (SELECT 1 FROM rosters r WHERE r.player_id = g.player_id AND r.team_id = g.team_id) AS on_roster,
            count(*)::int AS games, sum(g.fantasy_points)::float AS fantasy,
            CASE WHEN count(g.espn_points) = count(*) THEN sum(g.espn_points)::float END AS espn,
            sum(g.bonus)::float AS bonus_points,
            count(*) FILTER (WHERE g.double_cats = 2)::int AS dd,
            count(*) FILTER (WHERE g.double_cats = 3)::int AS td,
            count(*) FILTER (WHERE g.double_cats >= 4)::int AS qd,
            (SELECT jsonb_object_agg(k, v) FROM (
               SELECT kv.key AS k, sum(kv.value::numeric) AS v
               FROM g g2, jsonb_each_text(g2.stat_line) kv
               WHERE g2.team_id = g.team_id AND g2.player_id = g.player_id AND kv.value ~ '^-?[0-9.]+$'
               GROUP BY kv.key) s) AS totals
     FROM g JOIN players p ON p.player_id = g.player_id
     GROUP BY g.team_id, g.player_id, p.name`,
    [teams, model, from, to]);
  return rows.map((r) => ({ ...r, totals: Object.fromEntries(Object.entries(r.totals ?? {}).map(([k, v]) => [k, Number(v)])) })) as PlayerLine[];
}

/** Total rebounds: ESPN's reb when given, else offensive + defensive (never both). Same rule as the views. */
export const rebounds = (t: Record<string, number>) => (t.reb != null ? t.reb : (t.oreb ?? 0) + (t.dreb ?? 0));
/** Three-pointers missed, as the views derive it. */
export const threesMissed = (t: Record<string, number>) => (t.tpa ?? 0) - (t.tpm ?? 0);

export const TEAM_STATS: { key: string; label: string; lowerIsBetter?: boolean; get: (t: Record<string, number>) => number }[] = [
  { key: "pts", label: "Points scored", get: (t) => t.pts ?? 0 },
  { key: "reb", label: "Total rebounds", get: rebounds },
  { key: "ast", label: "Assists", get: (t) => t.ast ?? 0 },
  { key: "stl", label: "Steals", get: (t) => t.stl ?? 0 },
  { key: "blk", label: "Blocked shots", get: (t) => t.blk ?? 0 },
  { key: "tov", label: "Turnovers", lowerIsBetter: true, get: (t) => t.tov ?? 0 },
];

/** "a" / "b" / "tie" for one comparison row. */
export function better(a: number, b: number, lowerIsBetter = false): "a" | "b" | "tie" {
  if (Math.abs(a - b) < 1e-9) return "tie";
  return (a > b) !== lowerIsBetter ? "a" : "b";
}

/** Sum player totals into one team box score. */
export function teamTotals(players: PlayerLine[]) {
  const box: Record<string, number> = {};
  let fantasy = 0, games = 0, espn: number | null = 0;
  for (const p of players) {
    fantasy += p.fantasy; games += p.games;
    espn = espn != null && p.espn != null ? espn + p.espn : null;
    for (const [k, v] of Object.entries(p.totals)) box[k] = (box[k] ?? 0) + v;
  }
  return { fantasy: round1(fantasy), games, espn: espn != null ? round1(espn) : null, box };
}

/** A player's share of his team's fantasy total: only when both are positive (same games, same rule). */
export function share(player: number, team: number): number | null {
  return team > 0 && player >= 0 ? Math.round((1000 * player) / team) / 10 : null;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Scoring breakdown: each scoring_models stat times the player's summed count, plus the game bonuses.
 * ok = it adds back up to the authoritative total from fantasy_points_by_model (within 0.05).
 */
export function breakdown(p: PlayerLine, weights: { stat: string; points: number }[]) {
  const t = { ...p.totals, reb: rebounds(p.totals), tpmi: threesMissed(p.totals) };
  const lines = weights
    .filter((w) => !["dd", "td", "qd"].includes(w.stat))
    .map((w) => ({ stat: w.stat, label: STAT_LABEL[w.stat] ?? w.stat, count: t[w.stat] ?? 0, points: w.points, subtotal: round1((t[w.stat] ?? 0) * w.points) }))
    .filter((l) => l.count !== 0);
  const bonuses = [
    { stat: "dd", label: STAT_LABEL.dd, count: p.dd }, { stat: "td", label: STAT_LABEL.td, count: p.td }, { stat: "qd", label: STAT_LABEL.qd, count: p.qd },
  ].filter((b) => b.count > 0);
  const sum = round1(lines.reduce((s, l) => s + l.count * l.points, 0) + p.bonus_points);
  return { lines, bonuses, bonusPoints: round1(p.bonus_points), sum, ok: Math.abs(sum - round1(p.fantasy)) < 0.05 };
}
