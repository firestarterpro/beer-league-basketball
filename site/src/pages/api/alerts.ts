// GET ?team=<team_id> -> things that team should probably fix in ESPN, for the next lineup that can still change:
// today's before the day's first tip-off, tomorrow's after it (lineups lock at each day's first game).
//   injured starters (smart about the 2-day waiver: due back soon = sit tight, longer = IR or a pickup),
//   day-to-day starters, starters with no game while a bench player has one, healthy players still on IR,
//   open roster spots, and tier-cap trouble.
// Each alert: { level: "warn" | "info", text, link: "team" | "lineup" | "players" | null, day }.
// The part of text inside [[ ]] becomes the link (alerts.js); day = 0 today / 1 tomorrow, for lineup links.
import type { APIRoute } from "astro";
import { query } from "../../lib/db";
import { handle } from "../../lib/http";

const OUT = ["OUT", "INJURY_RESERVE", "SUSPENSION"];
const WAIVER_DAYS = 2;

export const GET: APIRoute = ({ url }) =>
  handle(async () => {
    const team = url.searchParams.get("team") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(team)) return [];
    const [roster, [badge], [settings], [day]] = await Promise.all([
      query(`SELECT p.name, upper(coalesce(p.status, 'ACTIVE')) AS status, p.injury_note, r.slot, nba_tricode(p.nba_team) AS nba,
                    to_jsonb(p) ->> 'injury_return_date' AS back
             FROM rosters r JOIN players p USING (player_id) WHERE r.team_id = $1 ORDER BY p.name`, [team]),
      query(`SELECT badge FROM team_badges WHERE team_id = $1`, [team]),
      query(`SELECT array_length(string_to_array(max(setting_value) FILTER (WHERE setting_key = 'starter_slots'), ','), 1) AS starters,
                    coalesce(max(setting_value) FILTER (WHERE setting_key = 'ir_slots'), '2')::int AS ir_slots,
                    coalesce(max(setting_value) FILTER (WHERE setting_key = 'waiver_period_days'), '${WAIVER_DAYS}')::int AS waiver_days
             FROM league_settings`),
      // Which day can still change: today until its first tip, then tomorrow. Plus which NBA teams play that day.
      query(`WITH today AS (SELECT (now() AT TIME ZONE 'America/Chicago')::date AS d),
                  pick AS (SELECT CASE WHEN coalesce((SELECT min(tip_utc) FROM games, today WHERE game_date = today.d AND NOT postponed), now() + interval '1 day') > now()
                                       THEN 0 ELSE 1 END AS off FROM today)
             SELECT pick.off, (today.d + pick.off) AS target,
                    to_char(today.d + pick.off, 'Dy Mon FMDD') AS label,
                    coalesce((SELECT array_agg(DISTINCT t) FROM games g, unnest(ARRAY[g.home_team, g.away_team]) t
                              WHERE g.game_date = today.d + pick.off AND NOT g.postponed), '{}') AS playing,
                    EXISTS (SELECT 1 FROM games WHERE game_date >= today.d) AS has_schedule
             FROM today, pick`),
    ]);
    const alerts: { level: string; text: string; link: string | null; day: number }[] = [];
    // No roster yet (before the draft): nothing to flag, so Heads up stays hidden (Jason, 2026-10-25).
    if (!roster.length) return alerts;
    const off: number = day?.off ?? 1;
    const when = off === 0 ? `today (${day?.label})` : `tomorrow (${day?.label})`;
    const add = (level: string, text: string, link: string | null) => alerts.push({ level, text, link, day: off });
    const note = (p: any) => (p.injury_note ? ` (${p.injury_note})` : "");
    const backDate = (p: any) => (p.back ? new Date(`${p.back}T12:00:00Z`) : null);
    const backText = (p: any) => backDate(p)?.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    // Days from the target lineup day until he's expected back (null = unknown).
    const daysOut = (p: any) => {
      const b = backDate(p), t = day?.target ? new Date(day.target) : null;
      return b && t ? Math.round((b.getTime() - Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 12)) / 864e5) : null;
    };
    const playing = new Set<string>(day?.playing ?? []);
    const plays = (p: any) => !!p.nba && playing.has(p.nba);
    const healthy = (p: any) => !OUT.includes(p.status);
    const irUsed = roster.filter((p) => p.slot === "IR").length;
    const irFree = Math.max(0, (settings?.ir_slots ?? 2) - irUsed);
    const waiver = settings?.waiver_days ?? WAIVER_DAYS;
    const benchWithGame = roster.filter((p) => p.slot === "bench" && healthy(p) && plays(p));

    for (const p of roster) {
      if (p.slot !== "IR" && p.slot !== "bench" && OUT.includes(p.status)) {
        const d = daysOut(p);
        const swap = benchWithGame.length ? ` Start ${benchWithGame[0].name} in his spot.` : "";
        if (d != null && d <= waiver)
          add("info", `${p.name} is out${note(p)} but due back ~${backText(p)}. Don't drop him: a pickup takes ${waiver} days on waivers anyway.${swap} [[Set your lineup for ${when}]].`, "lineup");
        else if (irFree > 0)
          add("warn", `${p.name} is out${note(p)}${p.back ? `, back ~${backText(p)}` : ""}. [[Move him to IR in ESPN]] so his spot can score.`, "lineup");
        else
          add("warn", `${p.name} is out${note(p)}${p.back ? `, back ~${backText(p)}` : ""} and your IR is full. Waivers take ${waiver} days, so [[look for a pickup in ESPN]] now if he's out a while.`, "players");
      } else if (p.slot !== "IR" && p.slot !== "bench" && p.status === "DAY_TO_DAY")
        add("info", `${p.name} is day-to-day${note(p)}. [[Check your lineup for ${when}]] before tip-off.`, "lineup");
      else if (p.slot === "IR" && healthy(p) && p.status !== "DAY_TO_DAY")
        add("warn", `${p.name} is healthy but still on IR. [[Activate him in ESPN]]; if that puts you over the tier caps, it goes to a community vote.`, "lineup");
    }
    // Starters with no game that day, when a healthy bench player does have one.
    if (day?.has_schedule && playing.size && benchWithGame.length) {
      const idle = roster.filter((p) => p.slot === "active" && healthy(p) && p.nba && !plays(p));
      idle.slice(0, benchWithGame.length).forEach((p, i) =>
        add("info", `${p.name} has no game ${when}, but ${benchWithGame[i].name} on your bench does. [[Swap them for ${when}]].`, "lineup"));
    }
    const open = Number(settings?.starters ?? 0) - roster.filter((p) => p.slot !== "IR").length;
    if (open > 0)
      add("warn", `You have ${open} open roster ${open === 1 ? "spot" : "spots"}. [[Add a player in ESPN]].`, "players");
    if (badge?.badge === "Violation")
      add("warn", "Your roster is over the tier caps from a free-agent add. The LM will open a community vote.", null);
    return alerts;
  });
