// How tiers look on the site. The database keeps T1/T2/T3; people see the emoji.
//   T1 = rank 1-25 (max 3 per team), T2 = 26-50 (max 3), T3 = 51+ (no limit).
// public/team.js has the same emoji for pages that draw tiers in the browser.
export const TIER_EMOJI: Record<string, string> = { T1: "🤾", T2: "⛹️", T3: "🚶" };
export const TIER_NAME: Record<string, string> = { T1: "Tier 1", T2: "Tier 2", T3: "Tier 3" };

// Colour band for each group of 10 in the top 50: 1 (ranks 1-10, brightest) to 5 (41-50); 0 below that.
export const band = (rank: number | null | undefined) => (rank && rank <= 50 ? Math.ceil(rank / 10) : 0);
