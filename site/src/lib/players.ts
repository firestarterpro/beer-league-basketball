// Player rows for the Tiers table and player cards: tier, owner, ESPN stat window
// totals, fantasy points under every scoring model, heat ranks (and how they moved
// since the last run) and NBA.com defense.
import { one, query } from "./db";

export const SPLITS = ["season", "last7", "last15", "last30", "projected"] as const;
export type Split = (typeof SPLITS)[number];
export const SPLIT_NAME: Record<Split, string> = {
  season: "This season", last7: "Last 7 days", last15: "Last 15 days", last30: "Last 30 days", projected: "ESPN projection",
};
export const MODEL_NAME: Record<string, string> = { hustle: "Hustle", espn_default: "ESPN Default", balanced: "Balanced" };
export const STAT_NAME: Record<string, string> = {
  pts: "Points", fgm: "Field goals made", fga: "Field goal attempts", ftm: "Free throws made", fta: "Free throw attempts",
  tpm: "3-pointers made", tpmi: "3-pointers missed", reb: "Rebounds", oreb: "Offensive rebounds", dreb: "Defensive rebounds",
  ast: "Assists", stl: "Steals", blk: "Blocks", tov: "Turnovers", pf: "Personal fouls", ff: "Flagrant fouls",
  tf: "Technical fouls", ej: "Ejections", dd: "Double-double", td: "Triple-double", qd: "Quadruple-double", team_win: "Team win",
};
export const HEAT = ["weekly_nba", "minutes_nba", "weekly_fantasy", "minutes_fantasy"] as const;
export const HEAT_NAME: Record<string, string> = {
  weekly_nba: "Weekly Power", minutes_nba: "Minutes Power",
  weekly_fantasy: "Weekly Power (fantasy scoring)", minutes_fantasy: "Minutes Power (fantasy scoring)",
};
// Box-score keys shown in the table, in this order. Totals; the page divides by games for per-game.
export const STAT_KEYS = ["min", "pts", "reb", "ast", "stl", "blk", "tpm", "tpa", "fgm", "fga", "ftm", "fta",
  "oreb", "dreb", "tov", "pf", "dd", "td", "team_win"] as const;

export const TIER_SOURCE_NAME: Record<string, string> = {
  espn: "ESPN's projection rank", avg_nba: "the average of Weekly Power and Minutes Power", ...HEAT_NAME,
};
// Team art in public/img/teams: avatar-<art>.webp and card-<art>.webp for all 7 teams (Jason's final art,
// 2026-10-25; avatars transparent, card stats boxes blanked for the live numbers, see lib/cards.ts).
// SRL became MPS Marine Poop Squad (migration 017); srl stays here until that migration has run.
export const TEAM_ART: Record<string, string> = {
  flag: "flag", lba: "lba", stat: "stat", jme: "jme", jst: "jme", mps: "mps", srl: "mps", cct: "cct", bbt: "bbt",
};
export const avatarSrc = (abv?: string | null) => (abv && TEAM_ART[abv] ? `/img/teams/avatar-${TEAM_ART[abv]}.webp` : null);
// NBA.com headshots and player pages, by NBA.com person id (nba_sync.py link fills players.nba_person_id).
// Loaded straight from NBA.com's image CDN; who gets one is photoSql below.
export const headshotSrc = (nbaId?: number | null, big = false) =>
  nbaId ? `https://cdn.nba.com/headshots/nba/latest/${big ? "1040x760" : "260x190"}/${nbaId}.png` : null;
export const nbaPage = (nbaId?: number | null) => (nbaId ? `https://www.nba.com/player/${nbaId}` : null);
// Photos only for players on a 2026-27 NBA roster who are playing or hurt: an NBA.com id (nba_sync.py link
// only gives ids from NBA.com's current-season roster list), an NBA team at ESPN (not FA), and an ESPN
// status of active or one of the injury ones. Free agents, retirees and suspended players get no photo.
export const INJURED = ["DAY_TO_DAY", "OUT", "INJURY_RESERVE", "QUESTIONABLE", "DOUBTFUL", "PROBABLE"];
export const photoSql = (p = "p") =>
  `(${p}.nba_person_id IS NOT NULL AND coalesce(${p}.nba_team, 'FA') <> 'FA'
    AND upper(${p}.status) IN ('ACTIVE', ${INJURED.map((s) => `'${s}'`).join(", ")}))`;
// Body part, side and estimated return date (espn_sync.py injuries, migration 018). Read through to_jsonb
// so the query still works, with nulls, before 018 has added the columns.
export const injurySql = (p = "p") =>
  `to_jsonb(${p}) ->> 'injury_body_part' AS inj_part, to_jsonb(${p}) ->> 'injury_side' AS inj_side,
   to_jsonb(${p}) ->> 'injury_detail' AS inj_detail, to_jsonb(${p}) ->> 'injury_return_date' AS inj_back`;
export const NBA_INJURY_REPORT = "https://official.nba.com/nba-injury-report-2026-27-season/";
export const isHurt = (status?: string | null) => !!status && INJURED.includes(status.toUpperCase());
/** 'Left foot (fracture)' and 'Back ~Nov 20', from a row with injurySql's columns; nulls when unknown. */
export function injuryText(r: { inj_part?: string | null; inj_side?: string | null; inj_detail?: string | null; inj_back?: string | null }) {
  const part = r.inj_part ? [r.inj_side, r.inj_side ? r.inj_part.toLowerCase() : r.inj_part].filter(Boolean).join(" ") : null;
  const what = part ? part + (r.inj_detail ? ` (${r.inj_detail.toLowerCase()})` : "") : null;
  const back = r.inj_back
    ? `Back ~${new Date(`${r.inj_back}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
    : null;
  return { what, back };
}
export const cardSrc =(abv?: string | null) => (abv && TEAM_ART[abv] ? `/img/teams/card-${TEAM_ART[abv]}.webp` : null);

// SQL for a name with accents, punctuation and Jr./III dropped, the same as sync/power_tiers.py
// norm(), so NBA.com's "Luka Dončić" in the power rankings meets ESPN's "Luka Doncic".
const ACCENTS = "áàâäãåāăąćčçďđéèêëēėęěğģíìîïīįıķĺļľłńňņñóòôöõøōőŕřśšşșťţțúùûüūůűųýÿźżž";
const PLAIN = "aaaaaaaaacccddeeeeeeeeggiiiiiiikllllnnnnoooooooorrsssstttuuuuuuuuyyzzz";
const normName = (col: string) =>
  `btrim(regexp_replace(regexp_replace(regexp_replace(translate(lower(${col}), '${ACCENTS}', '${PLAIN}'),
     '[^a-z0-9 ]', '', 'g'), '\\m(jr|sr|ii|iii|iv)\\M', '', 'g'), '\\s+', ' ', 'g'))`;

/** Tier settings, the current snapshot and what it was built from. */
export async function tierInfo() {
  const [settings, [snap]] = await Promise.all([
    query(`SELECT setting_key, setting_value, source FROM league_settings
           WHERE setting_key IN ('tier1_max_rank', 'tier2_max_rank', 'tier1_cap', 'tier2_cap', 'tier_refresh_weeks', 'tier_ranking', 'max_teams')`),
    query(`SELECT s.version, s.effective_date::text AS effective_date, s.source, s.ranking_run_date::text AS run_date,
                  (SELECT max(version) FROM tier_snapshots WHERE version < s.version) AS prev_version
           FROM current_tier_snapshot s`),
  ]);
  const S: Record<string, string> = Object.fromEntries(settings.map((r) => [r.setting_key, r.setting_value]));
  return {
    t1: Number(S.tier1_max_rank || 25), t2: Number(S.tier2_max_rank || 50),
    cap1: Number(S.tier1_cap || 3), cap2: Number(S.tier2_cap || 3), weeks: Number(S.tier_refresh_weeks || 4),
    ranking: S.tier_ranking && S.tier_ranking !== "tbd" ? S.tier_ranking : null, maxTeams: Number(S.max_teams || 7),
    snapshot: snap ?? null,
  };
}

export const asSplit = (s: string | null | undefined): Split => (SPLITS as readonly string[]).includes(s ?? "") ? (s as Split) : "season";

/** The league's scoring model (league_settings.scoring_model), "hustle" until poll Q13 decides. */
export async function leagueModel(): Promise<string> {
  const row = await one(`SELECT setting_value FROM league_settings WHERE setting_key = 'scoring_model'`);
  return MODEL_NAME[row?.setting_value] ? row!.setting_value : "hustle";
}

// One pass over each source (no per-row subqueries), so 400+ rows stay quick on Neon.
const ROW_SQL = `
  WITH fp AS (
    SELECT player_id, jsonb_object_agg(model_key, round(fantasy_points, 1)) AS fp
    FROM player_stat_points WHERE split = $1 GROUP BY player_id),
  fp7 AS (
    SELECT player_id, jsonb_object_agg(model_key, round(fantasy_points, 1)) AS fp7
    FROM player_stat_points WHERE split = 'last7' GROUP BY player_id),
  heat AS (            -- latest run of each heat ranking, with the run before it
    SELECT h.player_id,
           jsonb_object_agg(h.ranking, h.rank) AS heat,
           jsonb_object_agg(h.ranking, h.prev_rank) FILTER (WHERE h.prev_rank IS NOT NULL) AS heat_prev,
           jsonb_object_agg(h.ranking, round(h.score, 2)) FILTER (WHERE h.score IS NOT NULL) AS heat_score,
           jsonb_object_agg(h.ranking, round(h.score - h.prev_score, 2)) FILTER (WHERE h.prev_score IS NOT NULL) AS heat_dscore
    FROM (SELECT p.player_id, h.* FROM heat_rank_moves h JOIN players p USING (nba_person_id)
          UNION ALL         -- no NBA.com id on the ranking row: match by name, accents and Jr. ignored
          SELECT p.player_id, h.* FROM heat_rank_moves h
          JOIN (SELECT player_id, ${normName("name")} AS nk FROM players) p ON p.nk = ${normName("h.player_name")}
          WHERE h.nba_person_id IS NULL) h
    GROUP BY h.player_id)
  SELECT p.player_id AS id, p.name, p.nba_team AS nba, p.positions AS pos, p.status, p.injury_note AS injury, p.nba_person_id AS nba_id,
         ${photoSql()} AS photo, ${injurySql()},
         p.auction_value::float AS value, ct.rank::int AS tier_rank, coalesce(ct.tier, 'T3') AS tier,
         t.team_id AS team, t.team_name AS team_name, lower(t.abv) AS abv, r.slot,
         coalesce(ps.games, 0) AS gp, coalesce(ps.totals, '{}') AS t, ps.espn_points::float AS espn,
         fp.fp, fp7.fp7, heat.heat, heat.heat_prev, heat.heat_score, heat.heat_dscore,
         tm.prev_rank::int AS tier_prev_rank, tm.prev_tier,
         CASE WHEN d.games > 0 THEN jsonb_build_object('g', d.games, 'defl', d.deflections, 'cont', d.contests,
              'chg', d.charges, 'box', d.box_outs, 'loose', d.loose_balls,
              'dfg', round(100 * d.dfg_made / nullif(d.dfg_attempted, 0), 1),
              'rim', round(100 * d.rim_dfg_made / nullif(d.rim_dfg_attempted, 0), 1)) END AS def
  FROM players p
  LEFT JOIN current_tiers ct USING (player_id)
  LEFT JOIN player_stats ps ON ps.player_id = p.player_id AND ps.split = $1
  LEFT JOIN fp ON fp.player_id = p.player_id
  LEFT JOIN fp7 ON fp7.player_id = p.player_id
  LEFT JOIN tier_moves tm ON tm.player_id = p.player_id
  LEFT JOIN heat ON heat.player_id = p.player_id
  LEFT JOIN rosters r ON r.player_id = p.player_id
  LEFT JOIN teams t ON t.team_id = r.team_id
  LEFT JOIN player_defense d ON d.player_id = p.player_id`;

/** Every player in the tier snapshot or with stats in this window. */
export function playerRows(split: Split) {
  return query(`${ROW_SQL} WHERE ct.rank IS NOT NULL OR ps.games > 0 ORDER BY ct.rank NULLS LAST, p.name`, [split]);
}

export function playerRow(id: string, split: Split) {
  return one(`${ROW_SQL} WHERE p.player_id = $2`, [split, id]);
}

/**
 * The points standings around one player: everyone with games in the window,
 * ranked by fantasy points under the model. Returns the player plus `around` above and below.
 */
export async function pointsNeighbours(id: string, split: Split, model: string, around = 2) {
  return query(
    `WITH ranked AS (
       SELECT pp.player_id, p.name, p.nba_team, round(pp.fantasy_points, 1)::float AS points, pp.games,
              rank() OVER (ORDER BY pp.fantasy_points DESC)::int AS place,
              row_number() OVER (ORDER BY pp.fantasy_points DESC, p.name) AS n
       FROM player_stat_points pp JOIN players p USING (player_id)
       WHERE pp.split = $2 AND pp.model_key = $3 AND pp.games > 0)
     SELECT r.*, r.player_id = $1 AS me, (SELECT count(*) FROM ranked)::int AS of
     FROM ranked r, (SELECT n FROM ranked WHERE player_id = $1) m
     WHERE r.n BETWEEN m.n - $4 AND m.n + $4
     ORDER BY r.n`,
    [id, split, model, around]);
}

export interface FormulaLine { stat: string; label: string; count: number; points: number; subtotal: number }

/**
 * The scoring formula with one player's numbers in it, the same rules as the
 * player_stat_points view (bonuses paid once per game at the highest level).
 */
export function formula(totals: Record<string, number>, weights: { stat: string; points: number }[]) {
  const v = (k: string) => Number(totals[k] ?? 0) || 0;
  const value: Record<string, number> = {
    ...Object.fromEntries(Object.keys(totals).map((k) => [k, v(k)])),
    tpmi: v("tpa") - v("tpm"),
    reb: totals.reb != null ? v("reb") : v("oreb") + v("dreb"),
  };
  const w = Object.fromEntries(weights.map((x) => [x.stat, Number(x.points)]));
  const bonus: Record<string, [number, number | undefined]> = {
    dd: [Math.max(v("dd") - v("td"), 0), w.dd],
    td: [Math.max(v("td") - v("qd"), 0), w.td ?? w.dd],
    qd: [Math.max(v("qd"), 0), w.qd ?? w.td ?? w.dd],
  };
  const lines: FormulaLine[] = [];
  for (const { stat, points } of weights) {
    const count = stat in bonus ? bonus[stat][0] : value[stat] ?? 0;
    const pts = stat in bonus ? bonus[stat][1] ?? 0 : Number(points);
    if (!count) continue;
    lines.push({ stat, label: STAT_NAME[stat] ?? stat, count, points: pts, subtotal: Math.round(count * pts * 10) / 10 });
  }
  // A model with no TD/QD value still pays those games at its next bonus down.
  for (const k of ["td", "qd"] as const)
    if (w[k] == null && bonus[k][0] && bonus[k][1] != null)
      lines.push({ stat: k, label: STAT_NAME[k], count: bonus[k][0], points: bonus[k][1]!, subtotal: Math.round(bonus[k][0] * bonus[k][1]! * 10) / 10 });
  const total = Math.round(lines.reduce((s, l) => s + l.count * l.points, 0) * 10) / 10;
  return { lines, total };
}

// ---- Home sidebars: power-ranking top lists, new arrivals in the top 50, a random spotlight ----

export type HeatTopRow = {
  rank: number; prev_rank: number | null; score: number | null; dscore: number | null;
  name: string; id: string | null; nba: string | null; tier: string | null;
};

/** The latest run of one power ranking, top `n`, matched to ESPN players (by NBA.com id, else by name). */
export async function heatTop(ranking: string, n = 25) {
  return query<HeatTopRow>(
    `SELECT h.rank, h.prev_rank, round(h.score, 2)::float AS score, round(h.score - h.prev_score, 2)::float AS dscore,
            coalesce(p.name, h.player_name) AS name, p.player_id AS id, p.nba_team AS nba, ct.tier
     FROM heat_rank_moves h
     LEFT JOIN LATERAL (
       SELECT player_id, name, nba_team FROM players p
       WHERE p.nba_person_id = h.nba_person_id
          OR (h.nba_person_id IS NULL AND ${normName("p.name")} = ${normName("h.player_name")})
       LIMIT 1) p ON true
     LEFT JOIN current_tiers ct USING (player_id)
     WHERE h.ranking = $1 AND h.rank <= $2
     ORDER BY h.rank`, [ranking, n]);
}

/** Players in the top 50 of the current tier snapshot who weren't in the previous snapshot's top 50. */
export async function newToTop50() {
  return query<{ id: string; name: string; nba: string | null; rank: number; prev_rank: number | null; tier: string }>(
    `SELECT m.player_id AS id, p.name, p.nba_team AS nba, m.rank::int AS rank, m.prev_rank::int AS prev_rank, m.tier
     FROM tier_moves m JOIN players p USING (player_id)
     WHERE m.prev_version IS NOT NULL AND m.rank <= 50 AND (m.prev_rank IS NULL OR m.prev_rank > 50)
     ORDER BY m.rank`);
}

/** One random top-50 player (by tier rank) with his per-game line this season, for the Home spotlight. */
export async function spotlight() {
  return one<{ id: string; name: string; nba: string | null; pos: string[] | null; rank: number; tier: string;
               gp: number; pts: number | null; reb: number | null; ast: number | null; stl: number | null; blk: number | null }>(
    `SELECT p.player_id AS id, p.name, p.nba_team AS nba, p.positions AS pos, ct.rank::int AS rank, ct.tier,
            coalesce(ps.games, 0) AS gp,
            round((ps.totals->>'pts')::numeric / nullif(ps.games, 0), 1)::float AS pts,
            round(coalesce((ps.totals->>'reb')::numeric, (ps.totals->>'oreb')::numeric + (ps.totals->>'dreb')::numeric)
                  / nullif(ps.games, 0), 1)::float AS reb,
            round((ps.totals->>'ast')::numeric / nullif(ps.games, 0), 1)::float AS ast,
            round((ps.totals->>'stl')::numeric / nullif(ps.games, 0), 1)::float AS stl,
            round((ps.totals->>'blk')::numeric / nullif(ps.games, 0), 1)::float AS blk
     FROM current_tiers ct JOIN players p USING (player_id)
     LEFT JOIN player_stats ps ON ps.player_id = p.player_id AND ps.split = 'season'
     WHERE ct.rank <= 50
     ORDER BY random() LIMIT 1`);
}
