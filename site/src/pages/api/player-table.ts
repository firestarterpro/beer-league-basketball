// GET ?split=season|last7|last15|last30|projected -> rows for the Tiers table in that ESPN stat window.
import type { APIRoute } from "astro";
import { handle } from "../../lib/http";
import { asSplit, playerRows } from "../../lib/players";

export const GET: APIRoute = ({ url }) => handle(() => playerRows(asSplit(url.searchParams.get("split"))));
