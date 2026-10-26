// Tiers table: rank by tier / league points / power rankings, sort by any column,
// filter, switch stat window and scoring model, add stat groups with "More stats".
// Medium view by default. Rows come from /api/player-table.
(function () {
  const $ = (id) => document.getElementById(id);
  const table = $("pt");
  if (!table) return;
  const data = JSON.parse($("pt-data").textContent);
  const cache = { season: data.rows };
  let rows = data.rows;
  const onlyTeam = new URLSearchParams(location.search).get("team");   // from a team card on Home
  let sort = null;                // { key, dir } from a header click; null = the "Rank by" order
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const PATCH = { T1: "/img/ui/tier-t1.webp", T2: "/img/ui/tier-t2.webp", T3: "/img/ui/tier-t3.webp" };

  const ctl = { view: $("pt-view"), model: $("pt-model"), split: $("pt-split"), search: $("pt-search"),
                pos: $("pt-pos"), show: $("pt-show"), pergame: $("pt-pergame") };
  const groupBoxes = [...document.querySelectorAll("#pt-groups input")];
  const more = $("pt-more"), groupsBox = $("pt-groups");
  try {
    const saved = JSON.parse(localStorage.getItem("bl.tiersTable") || "{}");
    for (const k of ["view", "model", "split", "show"]) if (saved[k] && [...ctl[k].options].some((o) => o.value === saved[k])) ctl[k].value = saved[k];
    if (typeof saved.pergame === "boolean") ctl.pergame.checked = saved.pergame;
    if (Array.isArray(saved.groups)) groupBoxes.forEach((b) => (b.checked = saved.groups.includes(b.value)));
  } catch {}
  const asked = new URLSearchParams(location.search);   // ?view= / ?show= from the Home side lists
  for (const k of ["view", "show"]) if (asked.get(k) && [...ctl[k].options].some((o) => o.value === asked.get(k))) ctl[k].value = asked.get(k);
  const groups = () => new Set(["medium", ...groupBoxes.filter((b) => b.checked).map((b) => b.value)]);
  const remember = () => {
    try {
      localStorage.setItem("bl.tiersTable", JSON.stringify({ view: ctl.view.value, model: ctl.model.value, split: ctl.split.value,
        show: ctl.show.value, pergame: ctl.pergame.checked, groups: [...groups()] }));
    } catch {}
  };
  const setMoreLabel = () => {
    const extra = groups().size - 1;
    more.textContent = groupsBox.hidden ? `＋ More stats${extra ? ` (${extra})` : ""}` : "− Fewer options";
    more.setAttribute("aria-expanded", String(!groupsBox.hidden));
    // The ESPN column steps aside while "More stats" is open or adds columns, so the table gets the width.
    const layout = $("pt-layout");
    if (layout) layout.classList.toggle("no-sides", !groupsBox.hidden || extra > 0);
  };

  // ---- values
  const n = (v) => (v == null || v === "" ? null : Number(v));
  const per = (r, k) => {
    const v = n(r.t[k]);
    if (v == null) return null;
    return ctl.pergame.checked ? (r.gp ? v / r.gp : null) : v;
  };
  const pct = (m, a) => (n(m) && n(a) ? (100 * n(m)) / n(a) : null);
  const fp = (r) => (r.gp > 0 && r.fp ? n(r.fp[ctl.model.value]) : null);
  const fp7 = (r) => (r.fp7 ? n(r.fp7[ctl.model.value]) : null);
  const isHeat = () => !["tier", "points"].includes(ctl.view.value);
  // Places moved since the last run of the "Rank by" list (positive = up). null = no earlier list.
  const move = (r) => {
    const v = ctl.view.value;
    if (v === "tier") return r.tier_rank == null ? null : r.tier_prev_rank == null ? (data.prevVersion ? "new" : null) : r.tier_prev_rank - r.tier_rank;
    if (v === "points") return null;
    const now = r.heat && r.heat[v], before = r.heat_prev && r.heat_prev[v];
    if (now == null) return null;
    return before == null ? (rows.some((x) => x.heat_prev && x.heat_prev[v] != null) ? "new" : null) : before - now;
  };
  const moveNum = (r) => { const m = move(r); return m === "new" ? 999 : m; };
  // Shown as +n / -n places; 0 for no change.
  const fmtMove = (m) => m == null ? '<span class="muted">–</span>' : m === "new" ? '<span class="mv new">NEW</span>'
    : m > 0 ? `<span class="mv up">+${m}</span>` : m < 0 ? `<span class="mv down">-${-m}</span>` : '<span class="mv">0</span>';
  const sgn = (v) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(2)}`);
  const def = (r, k) => (r.def && r.def[k] != null ? (["dfg", "rim"].includes(k) ? n(r.def[k]) : n(r.def[k]) / r.def.g) : null);

  // Columns: key, label, title, group, value(row), format, sort direction (1 = small first)
  const f1 = (v) => (v == null ? "–" : (Math.round(v * 10) / 10).toFixed(Math.abs(v) >= 100 || Number.isInteger(v) && !ctl.pergame.checked ? 0 : 1));
  const f0 = (v) => (v == null ? "–" : String(Math.round(v)));
  const fp1 = (v) => (v == null ? "–" : `${v.toFixed(1)}%`);
  const rk = (v) => (v == null ? "–" : `#${v}`);
  const stat = (k, label, title, group) => ({ key: k, label, title, group, val: (r) => per(r, k), fmt: f1, dir: -1 });
  const COLS = [
    { key: "fp", label: "FPTS", title: "Fantasy points (total) under the chosen scoring", group: "medium", val: fp, fmt: f1, dir: -1 },
    { key: "fpg", label: "FP/G", title: "Fantasy points per game", group: "medium", val: (r) => (fp(r) != null && r.gp ? fp(r) / r.gp : null), fmt: f1, dir: -1 },
    { key: "fp7", label: "L7", title: "Fantasy points in the last 7 days", group: "medium", val: fp7, fmt: f1, dir: -1 },
    { key: "move", label: "+/-", title: "Places moved since the last run of this ranking (or the last tier snapshot)", group: "medium",
      val: moveNum, fmt: (_, r) => fmtMove(move(r)), html: true, dir: -1, hideFor: ["points"] },
    { key: "score", label: "SCORE", title: "Power score in this ranking", group: "medium", heatOnly: true,
      val: (r) => (r.heat_score ? n(r.heat_score[ctl.view.value]) : null), fmt: (v) => (v == null ? "–" : v.toFixed(2)), dir: -1 },
    { key: "dscore", label: "± SCORE", title: "Power score change since the last run", group: "medium", heatOnly: true,
      val: (r) => (r.heat_dscore ? n(r.heat_dscore[ctl.view.value]) : null), fmt: sgn, dir: -1 },
    stat("pts", "PTS", "Points", "medium"), stat("reb", "REB", "Rebounds", "medium"), stat("ast", "AST", "Assists", "medium"),
    stat("stl", "STL", "Steals", "medium"), stat("blk", "BLK", "Blocks", "medium"), stat("tpm", "3PM", "3-pointers made", "medium"),
    { key: "fgp", label: "FG%", title: "Field goal %", group: "medium", val: (r) => pct(r.t.fgm, r.t.fga), fmt: fp1, dir: -1 },
    { key: "ftp", label: "FT%", title: "Free throw %", group: "medium", val: (r) => pct(r.t.ftm, r.t.fta), fmt: fp1, dir: -1 },
    stat("tov", "TO", "Turnovers", "medium"),
    { key: "weekly_nba", label: "W", title: data.heatName.weekly_nba, group: "medium", val: (r) => (r.heat ? n(r.heat.weekly_nba) : null), fmt: rk, dir: 1 },
    { key: "minutes_nba", label: "M", title: data.heatName.minutes_nba, group: "medium", val: (r) => (r.heat ? n(r.heat.minutes_nba) : null), fmt: rk, dir: 1 },
    stat("fgm", "FGM", "Field goals made", "shooting"), stat("fga", "FGA", "Field goal attempts", "shooting"),
    stat("ftm", "FTM", "Free throws made", "shooting"), stat("fta", "FTA", "Free throw attempts", "shooting"),
    stat("tpa", "3PA", "3-point attempts", "shooting"),
    { key: "tpp", label: "3P%", title: "3-point %", group: "shooting", val: (r) => pct(r.t.tpm, r.t.tpa), fmt: fp1, dir: -1 },
    { key: "gp", label: "GP", title: "Games played", group: "more", val: (r) => r.gp, fmt: f0, dir: -1 },
    stat("min", "MIN", "Minutes", "more"), stat("oreb", "OREB", "Offensive rebounds", "more"), stat("dreb", "DREB", "Defensive rebounds", "more"),
    stat("pf", "PF", "Personal fouls", "more"),
    { key: "dd", label: "DD", title: "Double-doubles (games)", group: "more", val: (r) => n(r.t.dd), fmt: f0, dir: -1 },
    { key: "td", label: "TD", title: "Triple-doubles (games)", group: "more", val: (r) => n(r.t.td), fmt: f0, dir: -1 },
    { key: "value", label: "$", title: "ESPN auction value", group: "more", val: (r) => n(r.value), fmt: f0, dir: -1 },
    { key: "defl", label: "DEFL", title: "Deflections per game (NBA.com)", group: "defense", val: (r) => def(r, "defl"), fmt: f1, dir: -1 },
    { key: "cont", label: "CONT", title: "Contested shots per game", group: "defense", val: (r) => def(r, "cont"), fmt: f1, dir: -1 },
    { key: "chg", label: "CHG", title: "Charges drawn per game", group: "defense", val: (r) => def(r, "chg"), fmt: f1, dir: -1 },
    { key: "box", label: "BOX", title: "Box-outs per game", group: "defense", val: (r) => def(r, "box"), fmt: f1, dir: -1 },
    { key: "loose", label: "LOOSE", title: "Loose balls recovered per game", group: "defense", val: (r) => def(r, "loose"), fmt: f1, dir: -1 },
    { key: "dfg", label: "DFG%", title: "FG% of shots he defended (lower is better)", group: "defense", val: (r) => def(r, "dfg"), fmt: fp1, dir: 1 },
    { key: "rim", label: "RIM%", title: "FG% at the rim when he defended (lower is better)", group: "defense", val: (r) => def(r, "rim"), fmt: fp1, dir: 1 },
    ...["weekly_fantasy", "minutes_fantasy"].map((k) => ({ key: k, label: { weekly_fantasy: "W·f", minutes_fantasy: "M·f" }[k],
      title: data.heatName[k], group: "heat", val: (r) => (r.heat ? n(r.heat[k]) : null), fmt: rk, dir: 1 })),
    ...["weekly_nba", "minutes_nba", "weekly_fantasy", "minutes_fantasy"].flatMap((k) => {
      const short = { weekly_nba: "W", minutes_nba: "M", weekly_fantasy: "W·f", minutes_fantasy: "M·f" }[k];
      return [
        { key: `mv_${k}`, label: `${short} +/-`, title: `${data.heatName[k]}: places moved since the last run`, group: "heat", html: true,
          val: (r) => (r.heat && r.heat[k] != null ? (r.heat_prev && r.heat_prev[k] != null ? r.heat_prev[k] - r.heat[k] : null) : null),
          fmt: (v) => fmtMove(v), dir: -1 },
        { key: `sc_${k}`, label: `${short} SCORE`, title: `${data.heatName[k]}: power score (change since last run)`, group: "heat", html: true,
          val: (r) => (r.heat_score ? n(r.heat_score[k]) : null),
          fmt: (v, r) => (v == null ? "–" : `${v.toFixed(2)}${r.heat_dscore && r.heat_dscore[k] != null ? ` <span class="muted small">${sgn(n(r.heat_dscore[k]))}</span>` : ""}`), dir: -1 },
      ];
    }),
  ];
  const shown = () => {
    const g = groups();
    return COLS.filter((c) => g.has(c.group) && (!c.heatOnly || isHeat()) && !(c.hideFor || []).includes(ctl.view.value));
  };

  // ---- the "Rank by" order: tier rank, league points, or a heat ranking. Unranked players go last.
  function viewRanks(list) {
    const v = ctl.view.value;
    const ranks = new Map();
    if (v === "tier") list.forEach((r) => ranks.set(r.id, r.tier_rank ?? null));
    else if (v === "points") {
      [...list].filter((r) => fp(r) != null).sort((a, b) => fp(b) - fp(a)).forEach((r, i) => ranks.set(r.id, i + 1));
    } else list.forEach((r) => ranks.set(r.id, r.heat && r.heat[v] != null ? Number(r.heat[v]) : null));
    return ranks;
  }

  function render() {
    const cols = shown();
    const q = ctl.search.value.trim().toLowerCase();
    const pos = ctl.pos.value, show = ctl.show.value;
    const mine = window.BL && window.BL.viewTeam();
    const ranks = viewRanks(rows);
    const rankOf = (r) => ranks.get(r.id) ?? null;
    let list = rows.filter((r) => (!q || r.name.toLowerCase().includes(q))
      && (!pos || (r.pos || []).includes(pos))
      && (!onlyTeam || r.team === onlyTeam)
      && (show !== "free" || !r.team)
      && (show !== "mine" || (mine && r.team === mine))
      && (show !== "top50" || (rankOf(r) != null && rankOf(r) <= 50))
      && (show !== "movers" || (typeof move(r) === "number" && Math.abs(move(r)) >= 3)));
    const by = (val, dir) => (a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x - y) * dir;
    };
    const tie = by(rankOf, 1);
    if (!sort && show === "movers") list.sort((a, b) => Math.abs(move(b)) - Math.abs(move(a)) || tie(a, b));
    else if (sort) {
      const c = COLS.find((c) => c.key === sort.key);
      const cmp = sort.key === "rank" ? by(rankOf, sort.dir) : by(c.val, sort.dir);
      list.sort((a, b) => cmp(a, b) || tie(a, b) || a.name.localeCompare(b.name));
    } else list.sort((a, b) => tie(a, b) || a.name.localeCompare(b.name));

    const arrow = (k) => (sort && sort.key === k ? (sort.dir === 1 ? " ▲" : " ▼") : "");
    $("pt-head").innerHTML = `<th class="who" scope="col"><button type="button" data-sort="rank">#${arrow("rank") || (sort ? "" : " ▲")}</button> Player</th>`
      + `<th scope="col" class="owner">Team</th>`
      + cols.map((c) => `<th scope="col" class="num" title="${esc(c.title)}"><button type="button" data-sort="${c.key}">${c.label}${arrow(c.key)}</button></th>`).join("");

    $("pt-body").innerHTML = list.map((r) => {
      const k = rankOf(r);
      const heat = k != null && k <= 50 ? Math.ceil(k / 10) : 0;
      const cls = [heat ? `heat-${heat}` : "", k != null && k <= 25 ? "top25" : "", k != null && k <= 10 ? "top10" : "",
        mine && r.team === mine ? "mine" : ""].filter(Boolean).join(" ");
      const hurt = r.status && !/^active$/i.test(r.status)
        ? `<span class="pill bad" title="${esc(r.injury || "")}">${esc(r.status.replace(/_/g, " "))}</span>` : "";
      return `<tr class="${cls}">
        <th scope="row" class="who"><a href="/player/${encodeURIComponent(r.id)}">
          <span class="rk num">${k ?? "–"}</span>
          <img class="patch" src="${PATCH[r.tier] || PATCH.T3}" alt="${esc(data.tierName[r.tier] || "")}" title="${esc(data.tierName[r.tier] || "")} · tier rank ${r.tier_rank ?? "–"}${r.prev_tier && r.prev_tier !== r.tier ? ` (was ${esc(data.tierName[r.prev_tier] || r.prev_tier)})` : ""}" width="30" height="30" loading="lazy">
          <span class="nm"><b>${esc(r.name)}</b> ${r.prev_tier && r.prev_tier !== r.tier ? `<span class="pill ${r.prev_tier > r.tier ? "ok" : "warn"}">${r.prev_tier > r.tier ? "Tier up" : "Tier down"}</span>` : ""}${hurt}<span class="muted small">${esc(r.nba || "FA")} · ${esc((r.pos || []).join("/") || "–")}</span></span>
        </a></th>
        <td class="owner small">${r.team_name ? esc(r.team_name) + (r.slot === "IR" ? " · IR" : "") : '<span class="muted">Free agent</span>'}</td>
        ${cols.map((c) => `<td class="num">${c.html ? c.fmt(c.val(r), r) : esc(c.fmt(c.val(r), r))}</td>`).join("")}
      </tr>`;
    }).join("");

    const noteBits = [];
    if (ctl.view.value !== "tier" && ctl.view.value !== "points" && !rows.some((r) => r.heat && r.heat[ctl.view.value] != null))
      noteBits.push("This power ranking hasn't been published yet, so nobody has a rank in it.");
    if (!rows.some((r) => r.gp > 0)) noteBits.push(`No games in "${ctl.split.selectedOptions[0].text}" yet, so points and stats are blank.`);
    if (groups().has("defense") && !rows.some((r) => r.def))
      noteBits.push("Defense numbers come from NBA.com and show up once players are linked to their NBA.com id.");
    $("pt-note").textContent = noteBits.join(" ");
    const teamName = onlyTeam && (rows.find((r) => r.team === onlyTeam) || {}).team_name;
    $("pt-count").innerHTML = show === "mine" && !mine ? "Pick your team at the top first."
      : `${list.length} players` + (onlyTeam ? ` on ${esc(teamName || "that team")} · <a href="/tiers">show everyone</a>` : "");
    $("pt-empty").hidden = list.length > 0;
  }

  $("pt-head").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sort]");
    if (!b) return;
    const key = b.dataset.sort;
    const c = COLS.find((c) => c.key === key);
    const first = key === "rank" ? 1 : c.dir;
    sort = sort && sort.key === key ? { key, dir: -sort.dir } : { key, dir: first };
    render();
  });
  ctl.split.addEventListener("change", async () => {
    remember();
    const s = ctl.split.value;
    if (!cache[s]) {
      $("pt-count").textContent = "Loading…";
      try {
        const res = await fetch(`/api/player-table?split=${encodeURIComponent(s)}`).then((r) => r.json());
        if (!res.ok) throw new Error(res.error);
        cache[s] = res.data;
      } catch {
        $("pt-count").textContent = "Couldn't load those stats. Try again.";
        return;
      }
    }
    rows = cache[s];
    render();
  });
  ctl.view.addEventListener("change", () => { sort = null; remember(); render(); });
  for (const k of ["model", "show", "pergame"]) ctl[k].addEventListener("change", () => { remember(); render(); });
  groupBoxes.forEach((b) => b.addEventListener("change", () => { remember(); setMoreLabel(); render(); }));
  more.addEventListener("click", () => { groupsBox.hidden = !groupsBox.hidden; setMoreLabel(); });
  setMoreLabel();
  for (const k of ["search", "pos"]) ctl[k].addEventListener("input", render);
  document.addEventListener("bl:team", render);
  if (ctl.split.value !== "season") ctl.split.dispatchEvent(new Event("change"));
  else render();
})();
