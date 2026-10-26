// Team trading cards (Jason's art, 2026-10-25): the live stats box on the front and the
// roster on the back. The art's own "Rookie Stats" box was blanked (Full Court Press), so
// the site writes the team's numbers into it, on the page and in the downloaded PNGs.
import { one, query } from "./db";
import { TEAM_ART } from "./players";

// Where the blank stats box sits on each card, in % of the card (left, top, right, bottom).
// hdr = the strip the "Rookie Stats" title was in; vals = where HT/WT/PTS... were. rows 1 = one line
// of 4 stats, rows 2 = a 2 x 2 grid. Colours match the lettering the art used.
type Box = { hdr: number[]; vals: number[]; rows: 1 | 2; hdrInk: string; ink: string };
const WIDE: Omit<Box, "hdrInk" | "ink"> = { hdr: [22.66, 86.46, 77.34, 89.9], vals: [7.81, 90.21, 92.19, 93.12], rows: 1 };
export const CARD_BOX: Record<string, Box> = {
  flag: { ...WIDE, hdrInk: "#ff8a1e", ink: "#ffffff" },
  jme: { ...WIDE, hdrInk: "#ff8a1e", ink: "#ffffff" },
  cct: { ...WIDE, hdrInk: "#ff8a1e", ink: "#ffffff" },
  bbt: { ...WIDE, hdrInk: "#ff8a1e", ink: "#ffffff" },
  lba: { hdr: [26.95, 78.02, 72.27, 81.56], vals: [11.72, 82.4, 88.28, 91.04], rows: 2, hdrInk: "#ffc93c", ink: "#ffc93c" },
  stat: { hdr: [25.78, 80.73, 74.61, 83.96], vals: [11.72, 85.0, 87.89, 92.19], rows: 2, hdrInk: "#8ee05a", ink: "#ffffff" },
  mps: { hdr: [21.09, 80.99, 78.91, 84.9], vals: [13.28, 85.94, 87.5, 92.81], rows: 2, hdrInk: "#f5c451", ink: "#f5c451" },
};

// "LBa" is how The Lebroniacs write it (Jason, 2026-10-25); the database keeps LBA so ESPN still links.
export const abvLabel = (abv: string) => (abv.toLowerCase() === "lba" ? "LBa" : abv.toUpperCase());

export type CardStat = { k: string; v: string };
export type CardRow = {
  team_id: string; abv: string; team_name: string; gm_name: string | null; rank: number | null; points: number | null;
  pet: string; top: string | null;
};

const lastName = (n: string) => n.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, "").split(" ").slice(-1)[0];
const fmtPts = (p: number | null) => (p == null ? "--" : Math.round(p).toLocaleString("en-US"));

/** The 4 stats in the front box: team points, league rank, pet level and the top scorer (when it fits). */
export const frontStats = (c: CardRow): CardStat[] => [
  { k: "PTS", v: fmtPts(c.points) },
  { k: "RANK", v: c.rank ? `#${c.rank}` : "--" },
  { k: "PET", v: c.pet },
  { k: "TOP", v: c.top ? lastName(c.top) : "--" },
];

// The pet's level is its Dunking power out of the max (an egg until it hatches, MAX at Super Saiyan).
const petLevel = (r: any, max: number) => {
  if (r.power == null || r.egg) return "EGG";
  const p = Math.round(Number(r.power) || 0);
  return p >= max || (r.super_until && Date.parse(r.super_until) > Date.now()) ? "MAX" : `${p}/${max}`;
};

async function scoringModel() {
  const r = await one<{ v: string }>(`SELECT setting_value AS v FROM league_settings WHERE setting_key = 'scoring_model'`);
  return r?.v || "hustle";
}

/** One row per active team for the card fronts (Home shows all 7). */
export async function cardRows(abv?: string): Promise<CardRow[]> {
  const model = await scoringModel();
  const [rows, settings] = await Promise.all([
    query(`SELECT t.team_id, lower(t.abv) AS abv, t.team_name, t.gm_name, s.rank, s.total_points::float AS points,
                  p.power, p.super_until, coalesce((p.state->>'egg')::boolean, false) AS egg,
                  (SELECT ps.player_name FROM rosters r JOIN player_season_points ps ON ps.player_id = r.player_id AND ps.model_key = $1
                   WHERE r.team_id = t.team_id AND ps.total_points > 0 ORDER BY ps.total_points DESC LIMIT 1) AS top
           FROM teams t LEFT JOIN standings s USING (team_id) LEFT JOIN pets p USING (team_id)
           WHERE t.active AND ($2::text IS NULL OR lower(t.abv) = $2)
           ORDER BY s.rank NULLS LAST, t.team_name`, [model, abv ?? null]),
    one(`SELECT overrides FROM pet_settings WHERE id = 1`).catch(() => null),
  ]);
  const max = Number(settings?.overrides?.maxPower) || 100;
  return rows.map((r: any) => ({
    team_id: r.team_id, abv: r.abv, team_name: r.team_name, gm_name: r.gm_name, rank: r.rank, points: r.points,
    pet: petLevel(r, max), top: r.top,
  }));
}

/** Everything the download needs: the front's stats and the back's roster with each player's points. */
export async function cardDownload(abv: string) {
  const [card] = await cardRows(abv);
  if (!card) return null;
  const model = await scoringModel();
  const [roster, [season]] = await Promise.all([
    query(`SELECT rt.player_name AS name, rt.nba_team, rt.slot, rt.position_slot, rt.positions, rt.tier,
                  coalesce(ps.total_points, 0)::float AS pts, coalesce(ps.games, 0)::int AS gp
           FROM roster_tiers rt LEFT JOIN player_season_points ps ON ps.player_id = rt.player_id AND ps.model_key = $2
           WHERE rt.team_id = $1
           ORDER BY rt.slot = 'IR', ps.total_points DESC NULLS LAST, rt.player_name`, [card.team_id, model]),
    query(`SELECT setting_value AS v FROM league_settings WHERE setting_key = 'season'`),
  ]);
  const teams = await one<{ n: number }>(`SELECT count(*)::int AS n FROM teams WHERE active`);
  return {
    ...card, abv_label: abvLabel(card.abv), season: season?.v ?? "", teams: teams?.n ?? 7, model,
    front: frontStats(card), box: CARD_BOX[TEAM_ART[card.abv]] ?? null,
    art: TEAM_ART[card.abv] ? `/img/teams/card-${TEAM_ART[card.abv]}.webp` : null,
    avatar: TEAM_ART[card.abv] ? `/img/teams/avatar-${TEAM_ART[card.abv]}.webp` : null,
    roster: roster.map((p: any) => ({ name: p.name, nba: p.nba_team, slot: p.slot === "IR" ? "IR" : p.position_slot ?? (p.positions ?? []).join("/"),
      tier: p.tier, pts: Math.round(p.pts), gp: p.gp })),
  };
}
