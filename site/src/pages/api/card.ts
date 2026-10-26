// GET ?team=<abv> -> what the "Download card" button draws: the team's front stats, its stats-box
// layout, and the roster with each player's season points. Open to everyone (any team's card).
import type { APIRoute } from "astro";
import { cardDownload } from "../../lib/cards";
import { handle } from "../../lib/http";

export const GET: APIRoute = ({ url }) =>
  handle(async () => {
    const abv = (url.searchParams.get("team") ?? "").toLowerCase();
    if (!/^[a-z0-9]{2,5}$/.test(abv)) throw Object.assign(new Error("Pick a team."), { code: "P0001" });
    const card = await cardDownload(abv);
    if (!card) throw Object.assign(new Error("No team by that name."), { code: "P0001" });
    return card;
  });
