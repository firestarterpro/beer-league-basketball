// GET ?team=<team_id> -> things that team should probably fix in ESPN: injured starters,
// healthy players still on IR, open roster spots, and tier-cap trouble.
// Each alert: { level: "warn" | "info", text, link: "team" | "players" | "practice" | null }.
import type { APIRoute } from "astro";
import { query } from "../../lib/db";
import { handle } from "../../lib/http";

const OUT = ["OUT", "INJURY_RESERVE", "SUSPENSION"];

export const GET: APIRoute = ({ url }) =>
  handle(async () => {
    const team = url.searchParams.get("team") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(team)) return [];
    const [roster, [badge], [slots]] = await Promise.all([
      query(`SELECT p.name, upper(coalesce(p.status, 'ACTIVE')) AS status, p.injury_note, r.slot
             FROM rosters r JOIN players p USING (player_id) WHERE r.team_id = $1 ORDER BY p.name`, [team]),
      query(`SELECT badge FROM team_badges WHERE team_id = $1`, [team]),
      query(`SELECT array_length(string_to_array(setting_value, ','), 1) AS n
             FROM league_settings WHERE setting_key = 'starter_slots'`),
    ]);
    const alerts: { level: string; text: string; link: string | null }[] = [];
    // No roster yet (before the draft): nothing to flag, so Heads up stays hidden (Jason, 2026-10-25).
    if (!roster.length) return alerts;
    const note = (p: any) => (p.injury_note ? ` (${p.injury_note})` : "");
    for (const p of roster) {
      if (p.slot !== "IR" && OUT.includes(p.status))
        alerts.push({ level: "warn", text: `${p.name} is out${note(p)}. Move him to IR in ESPN so his spot can score.`, link: "team" });
      else if (p.slot !== "IR" && p.status === "DAY_TO_DAY")
        alerts.push({ level: "info", text: `${p.name} is day-to-day${note(p)}. Check on him before tip-off.`, link: "team" });
      else if (p.slot === "IR" && !OUT.includes(p.status) && p.status !== "DAY_TO_DAY")
        alerts.push({ level: "warn", text: `${p.name} is healthy but still on IR. If activating him puts you over the tier caps, it goes to a community vote.`, link: "team" });
    }
    const open = Number(slots?.n ?? 0) - roster.filter((p) => p.slot !== "IR").length;
    if (open > 0)
      alerts.push({ level: "warn", text: `You have ${open} open roster ${open === 1 ? "spot" : "spots"}. Add a player in ESPN.`, link: "players" });
    if (badge?.badge === "Violation")
      alerts.push({ level: "warn", text: "Your roster is over the tier caps from a free-agent add. The LM will open a community vote.", link: null });
    return alerts;
  });
