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
};

// "Fantasy Shortcuts": the link bar in the header and the link row at the bottom.
export const SHORTCUTS: [string, string, boolean?][] = [
  ["My team", ESPN.team(), true], ["League home", ESPN.league], ["Add players", ESPN.players], ["FantasyCast", ESPN.fantasycast],
  ["Standings", ESPN.standings], ["Recent activity", ESPN.activity], ["Daily leaders", ESPN.leaders],
  ["Waiver order", ESPN.waivers], ["Draft room", ESPN.draft],
];

export const ESPN_ICON: Record<string, string> = {
  "My team": "👕", "League home": "🏠", "Add players": "➕", FantasyCast: "📺", Standings: "🏆", "Recent activity": "🔔",
  "Daily leaders": "🔥", "Waiver order": "📋", "Draft room": "🎯",
};
