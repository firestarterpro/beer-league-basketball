// Loads polls with everything a page needs to show them: options, live
// results and (for claim / IR votes) the Yes tally against the threshold.
import { query } from "./db";

export type Poll = {
  id: string;
  question: string;
  description: string | null;
  type: "single_choice" | "multi_select" | "rating" | "ranked" | "text";
  context_type: string;
  context_id: string | null;
  open: boolean;
  closes_at: string | null;
  created_at: string;
  options: { id: string; label: string; votes: number; average_rank: number | null; first_place_votes: number }[];
  ballots: number;
  voters: string[];                 // team names that voted
  average_rating: number | null;
  answers: { team: string; text: string }[];
  tally?: { yes_votes: number; no_votes: number; threshold: number; community_approved: boolean };
  status?: string;                  // claim / IR outcome
  lm_override?: string | null;
  requester?: string | null;        // claim / IR: the team that asked (its Yes is automatic)
};

export async function loadPolls(where: "generic" | "votes" | "all", limit = 30): Promise<Poll[]> {
  const filter =
    where === "generic" ? "p.context_type IN ('generic', 'scrub_nominee')" :
    where === "votes" ? "p.context_type IN ('claim_approval', 'ir_activation')" : "true";
  const polls = await query<Poll>(
    `SELECT p.id, p.question, p.description, p.type, p.context_type, p.context_id, p.closes_at, p.created_at,
            poll_is_open(p.id) AS open,
            coalesce(c.status, i.status) AS status,
            coalesce(c.lm_override, i.lm_override) AS lm_override,
            rt.team_name AS requester
     FROM polls p
     LEFT JOIN restricted_fa_claims c ON p.context_type = 'claim_approval' AND c.id = p.context_id
     LEFT JOIN ir_activations i ON p.context_type = 'ir_activation' AND i.id = p.context_id
     LEFT JOIN teams rt ON rt.team_id = coalesce(c.team_id, i.team_id)
     WHERE ${filter}
     ORDER BY poll_is_open(p.id) DESC, p.created_at DESC
     LIMIT $1`, [limit]);
  if (!polls.length) return [];
  const ids = polls.map((p) => p.id);

  const [options, ranked, ballots, ratings, tallies] = await Promise.all([
    query(`SELECT poll_id, option_id AS id, label, votes::int FROM poll_option_counts
           WHERE poll_id = ANY($1) ORDER BY display_order`, [ids]),
    query(`SELECT poll_id, option_id, average_rank::float, first_place_votes::int FROM poll_ranked_results
           WHERE poll_id = ANY($1)`, [ids]),
    query(`SELECT r.poll_id, t.team_name, r.response_json FROM poll_responses r JOIN teams t USING (team_id)
           WHERE r.poll_id = ANY($1) ORDER BY r.created_at`, [ids]),
    query(`SELECT poll_id, average_rating::float FROM poll_rating_results WHERE poll_id = ANY($1)`, [ids]),
    query(`SELECT poll_id, yes_votes::int, no_votes::int, threshold::int, community_approved
           FROM claim_vote_tally WHERE poll_id = ANY($1)`, [ids]),
  ]);

  for (const p of polls) {
    const rankedFor = ranked.filter((r) => r.poll_id === p.id);
    p.options = options.filter((o) => o.poll_id === p.id).map((o) => {
      const r = rankedFor.find((x) => x.option_id === o.id);
      return { id: o.id, label: o.label, votes: o.votes, average_rank: r?.average_rank ?? null, first_place_votes: r?.first_place_votes ?? 0 };
    });
    const mine = ballots.filter((b) => b.poll_id === p.id);
    p.ballots = mine.length;
    p.voters = mine.map((b) => b.team_name);
    p.answers = p.type === "text" ? mine.map((b) => ({ team: b.team_name, text: b.response_json.text })) : [];
    p.average_rating = ratings.find((r) => r.poll_id === p.id)?.average_rating ?? null;
    p.tally = tallies.find((t) => t.poll_id === p.id);
  }
  return polls;
}

// Teams with a GM: the turnout a poll's "poll fuel" gauge measures against.
export async function managedTeams(): Promise<number> {
  const [r] = await query<{ n: number }>("SELECT count(*)::int AS n FROM teams WHERE active AND manager_assigned");
  return r?.n ?? 0;
}

export const TYPE_LABEL: Record<Poll["type"], string> = {
  single_choice: "Pick one", multi_select: "Pick any", rating: "Rate 1–5", ranked: "Rank them", text: "Short answer",
};
