// Links into the league on ESPN. "My team" needs the team's ESPN id (teams.espn_team_id);
// public/team.js points every a[data-espn="team"] at the team picked in "My team".
export const LEAGUE_ID = "1894794086";
const base = "https://fantasy.espn.com/basketball";

export const ESPN = {
  team: (espnTeamId?: number | null) => `${base}/team?leagueId=${LEAGUE_ID}${espnTeamId ? `&teamId=${espnTeamId}` : ""}`,
  players: `${base}/players/add?leagueId=${LEAGUE_ID}`,
  fantasycast: `${base}/fantasycast?leagueId=${LEAGUE_ID}`,
  standings: `${base}/league/standings?leagueId=${LEAGUE_ID}`,
  waivers: `${base}/league/waiverorder?leagueId=${LEAGUE_ID}`,
  activity: `${base}/recentactivity?leagueId=${LEAGUE_ID}`,
  leaders: `${base}/leaders?leagueId=${LEAGUE_ID}`,
  draft: `${base}/draft?leagueId=${LEAGUE_ID}`,
  mockDraft: `${base}/mockdraftlobby`,
  league: `${base}/league?leagueId=${LEAGUE_ID}`,
  settings: `${base}/league/settings?leagueId=${LEAGUE_ID}`,
  rosters: `${base}/league/rosters?leagueId=${LEAGUE_ID}`,
  // One day's lineup screen. Lineups lock before each day's first game, so "tomorrow" is the one people can still change.
  lineup: (espnTeamId?: number | null, period = lineupPeriod(1)) =>
    `${base}/team?leagueId=${LEAGUE_ID}${espnTeamId ? `&teamId=${espnTeamId}` : ""}&scoringPeriodId=${period}&statSplit=singleScoringPeriod`,
};

// ESPN numbers each day of the season: scoring period 7 = Monday, Oct 26, 2026 (Jason's link).
// lineupPeriod(0) = today in league (Central) time, lineupPeriod(1) = tomorrow. Same math as public/team.js.
const PERIOD_7 = Date.UTC(2026, 9, 26);
export function centralDate(offsetDays = 0, now = new Date()): Date {
  const [m, d, y] = now.toLocaleDateString("en-US", { timeZone: "America/Chicago" }).split("/").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays));
}
export const lineupPeriod = (offsetDays = 1) => Math.max(1, 7 + Math.round((centralDate(offsetDays).getTime() - PERIOD_7) / 864e5));
export const dayLabel = (offsetDays = 1) =>
  centralDate(offsetDays).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export const INJURY_REPORT = `${base}/playernews?leagueId=${LEAGUE_ID}`;

// The one top bar on every page (Jason 2026-10-27/29): replaces the old site nav and the ESPN shortcut rows.
// [label, href, icon, kind?]. kind "team" / "lineup" = public/team.js points it at the picked team;
// "site" = a page on this site (opens in the same tab). Home is left off on the Home page itself.
export type BarLink = [label: string, href: string, icon: string, kind?: "team" | "lineup" | "site"];
export const TOP_BAR: BarLink[] = [
  ["Edit Lineup", ESPN.lineup(), "📋", "lineup"],
  ["Free Agents", ESPN.players, "➕"],
  ["ESPN Standings", ESPN.standings, "🏆"],
  ["Injury Report ESPN", INJURY_REPORT, "🩹"],
  ["Beer League Stat", "/stats", "📊", "site"],
  ["Rules/Approvals", "/rules", "📜", "site"],
  ["ESPN Activity", ESPN.activity, "🔔"],
  ["ESPN Daily Leaders", ESPN.leaders, "🔥"],
  ["Fantasy Cast", ESPN.fantasycast, "📺"],
  ["My team", ESPN.team(), "👕", "team"],
  ["Trades", ESPN.rosters, "🔁"],
  ["League home", ESPN.league, "🏀"],
  ["Home", "/", "🏠", "site"],
];
export const topBarFor = (path: string) => (path === "/" ? TOP_BAR.filter(([label]) => label !== "Home") : TOP_BAR);
