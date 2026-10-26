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

// "Fantasy Shortcuts": the link bar in the header and the link row at the bottom.
// The third field: "team" = public/team.js points it at the picked team; "lineup" = that team's lineup for tomorrow.
export const SHORTCUTS: [string, string, ("team" | "lineup")?][] = [
  ["Set tomorrow's lineup", ESPN.lineup(), "lineup"], ["My team", ESPN.team(), "team"], ["Rosters & trades", ESPN.rosters], ["League home", ESPN.league], ["Add players", ESPN.players], ["FantasyCast", ESPN.fantasycast],
  ["Standings", ESPN.standings], ["Recent activity", ESPN.activity], ["Daily leaders", ESPN.leaders],
  ["Waiver order", ESPN.waivers], ["Draft room", ESPN.draft],
];

export const ESPN_ICON: Record<string, string> = {
  "Set tomorrow's lineup": "📋", "Rosters & trades": "🔁", "My team": "👕", "League home": "🏠", "Add players": "➕", FantasyCast: "📺", Standings: "🏆", "Recent activity": "🔔",
  "Daily leaders": "🔥", "Waiver order": "⏳", "Draft room": "🎯",
};

// Which shortcuts each page shows (Jason 2026-10-26): Home has them all; every other page only the ones that fit it.
// Longest matching path wins; a path ending in / covers every page under it.
export const PAGE_SHORTCUTS: [path: string, labels: string[]][] = [
  ["/stats", ["Set tomorrow's lineup", "Add players", "Rosters & trades", "Daily leaders"]],
  ["/player/", ["Set tomorrow's lineup", "Add players", "Rosters & trades", "Daily leaders"]],
  ["/team/", ["Set tomorrow's lineup", "My team", "Rosters & trades", "Standings"]],
  ["/draft", ["Draft room", "Rosters & trades"]],
  ["/rules", ["League home", "Standings", "Waiver order"]],
  ["/approvals", ["Set tomorrow's lineup", "My team", "Add players", "Waiver order", "Recent activity"]],
  ["/dashboards", ["Standings", "Recent activity", "FantasyCast", "Daily leaders"]],
  ["/updates", ["Recent activity"]],
];
export function shortcutsFor(path: string) {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (clean === "/") return SHORTCUTS;
  const hit = PAGE_SHORTCUTS.filter(([p]) => (p.endsWith("/") ? clean.startsWith(p) : clean === p)).sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? SHORTCUTS.filter(([label]) => hit[1].includes(label)) : [];
}
