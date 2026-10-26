// Stats table: rank by tier / league points / power rankings, sort by any column, filter, switch stat window
// and scoring model. Advanced settings: more filters, columns you can show, hide, rename, reorder and resize,
// and saved views that everyone shares (/api/views). Rows for other stat windows come from /api/player-table.
// This device remembers its last table (bl.statsTable) and its own default view (bl.statsDefault).
(function () {
  const $ = (id) => document.getElementById(id);
  const table = $("pt");
  if (!table) return;
  const data = JSON.parse($("pt-data").textContent);
  const cache = { season: data.rows };
  let rows = data.rows;
  let sort = null;                // { key, dir } from a header click; null = the "Rank by" order
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const ctl = { view: $("pt-view"), model: $("pt-model"), split: $("pt-split"), search: $("pt-search"),
                pos: $("pt-pos"), show: $("pt-show"), pergame: $("pt-pergame") };
  const flt = { tier: $("f-tier"), nba: $("f-nba"), gp: $("f-gp"), min: $("f-min"), inj: $("f-inj") };

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
  // Same list as lib/players.ts INJURED, and the same wording as its injuryText: "Left foot (fracture) · Back ~Nov 20".
  const INJURED = ["DAY_TO_DAY", "OUT", "INJURY_RESERVE", "QUESTIONABLE", "DOUBTFUL", "PROBABLE"];
  const hurt = (r) => !!r.status && INJURED.includes(r.status.toUpperCase());
  const injText = (r) => {
    const part = r.inj_part ? [r.inj_side, r.inj_side ? r.inj_part.toLowerCase() : r.inj_part].filter(Boolean).join(" ")
      + (r.inj_detail ? ` (${r.inj_detail.toLowerCase()})` : "") : r.injury;
    const back = r.inj_back ? "Back ~" + new Date(r.inj_back + "T12:00:00Z")
      .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "";
    return [part, back].filter(Boolean).join(" · ");
  };
  // NBA.com headshot (same URL as lib/players.ts headshotSrc) for players photoSql allows; an empty circle otherwise.
  const face = (r) => r.photo && r.nba_id
    ? `<img class="face" src="https://cdn.nba.com/headshots/nba/latest/260x190/${Number(r.nba_id)}.png" alt="" width="30" height="30" loading="lazy" onerror="this.style.visibility='hidden'">`
    : `<span class="face" aria-hidden="true"></span>`;
  const mpg = (r) => (r.gp && n(r.t.min) != null ? n(r.t.min) / r.gp : null);
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

  // Columns: key, label, title, group, value(row), format, sort direction (1 = small first). text: sorts as words.
  const f1 = (v) => (v == null ? "–" : (Math.round(v * 10) / 10).toFixed(Math.abs(v) >= 100 || Number.isInteger(v) && !ctl.pergame.checked ? 0 : 1));
  const f0 = (v) => (v == null ? "–" : String(Math.round(v)));
  const fp1 = (v) => (v == null ? "–" : `${v.toFixed(1)}%`);
  const rk = (v) => (v == null ? "–" : `#${v}`);
  const txt = (v) => v ?? "–";
  const stat = (k, label, title, group) => ({ key: k, label, title, group, val: (r) => per(r, k), fmt: f1, dir: -1 });
  const COLS = [
    { key: "owner", label: "Team", title: "Fantasy team (or free agent)", group: "Player info", text: true, html: true, cls: "owner small",
      val: (r) => r.team_name || "", fmt: (_, r) => (r.team_name ? esc(r.team_name) + (r.slot === "IR" ? " · IR" : "") : '<span class="muted">Free agent</span>'), dir: 1 },
    { key: "tier", label: "TIER", title: "Tier (from the tier rank)", group: "Player info", text: true,
      val: (r) => r.tier, fmt: (v) => `${data.emoji[v] || ""} ${v || "–"}`, dir: 1 },
    { key: "nba", label: "NBA", title: "NBA team", group: "Player info", text: true, val: (r) => r.nba || "FA", fmt: txt, dir: 1 },
    { key: "pos", label: "POS", title: "Positions", group: "Player info", text: true, val: (r) => (r.pos || []).join("/"), fmt: (v) => v || "–", dir: 1 },
    { key: "status", label: "HEALTH", title: "Injury status from ESPN", group: "Player info", text: true, html: true,
      val: (r) => (hurt(r) ? r.status.replace(/_/g, " ") : ""), fmt: (v, r) => (v ? `<span class="st-hurt" title="${esc(injText(r))}">${esc(v)}</span>${injText(r) ? ` <span class="small">${esc(injText(r))}</span>` : ""}` : '<span class="muted">OK</span>'), dir: -1 },
    { key: "fp", label: "FPTS", title: "Fantasy points (total) under the chosen scoring", group: "Points", val: fp, fmt: f1, dir: -1 },
    { key: "fpg", label: "FP/G", title: "Fantasy points per game", group: "Points", val: (r) => (fp(r) != null && r.gp ? fp(r) / r.gp : null), fmt: f1, dir: -1 },
    { key: "fp7", label: "L7", title: "Fantasy points in the last 7 days", group: "Points", val: fp7, fmt: f1, dir: -1 },
    { key: "move", label: "+/-", title: "Places moved since the last run of this ranking (or the last tier snapshot)", group: "Points",
      val: moveNum, fmt: (_, r) => fmtMove(move(r)), html: true, dir: -1, hideFor: ["points"] },
    { key: "score", label: "SCORE", title: "Power score in this ranking (shows when ranking by a power ranking)", group: "Points", heatOnly: true,
      val: (r) => (r.heat_score ? n(r.heat_score[ctl.view.value]) : null), fmt: (v) => (v == null ? "–" : v.toFixed(2)), dir: -1 },
    { key: "dscore", label: "± SCORE", title: "Power score change since the last run (shows when ranking by a power ranking)", group: "Points", heatOnly: true,
      val: (r) => (r.heat_dscore ? n(r.heat_dscore[ctl.view.value]) : null), fmt: sgn, dir: -1 },
    stat("pts", "PTS", "Points", "Box score"), stat("reb", "REB", "Rebounds", "Box score"), stat("ast", "AST", "Assists", "Box score"),
    stat("stl", "STL", "Steals", "Box score"), stat("blk", "BLK", "Blocks", "Box score"), stat("tpm", "3PM", "3-pointers made", "Box score"),
    { key: "fgp", label: "FG%", title: "Field goal %", group: "Box score", val: (r) => pct(r.t.fgm, r.t.fga), fmt: fp1, dir: -1 },
    { key: "ftp", label: "FT%", title: "Free throw %", group: "Box score", val: (r) => pct(r.t.ftm, r.t.fta), fmt: fp1, dir: -1 },
    stat("tov", "TO", "Turnovers", "Box score"),
    { key: "weekly_nba", label: "W", title: data.heatName.weekly_nba, group: "Power rankings", val: (r) => (r.heat ? n(r.heat.weekly_nba) : null), fmt: rk, dir: 1 },
    { key: "minutes_nba", label: "M", title: data.heatName.minutes_nba, group: "Power rankings", val: (r) => (r.heat ? n(r.heat.minutes_nba) : null), fmt: rk, dir: 1 },
    stat("fgm", "FGM", "Field goals made", "Shooting"), stat("fga", "FGA", "Field goal attempts", "Shooting"),
    stat("ftm", "FTM", "Free throws made", "Shooting"), stat("fta", "FTA", "Free throw attempts", "Shooting"),
    stat("tpa", "3PA", "3-point attempts", "Shooting"),
    { key: "tpp", label: "3P%", title: "3-point %", group: "Shooting", val: (r) => pct(r.t.tpm, r.t.tpa), fmt: fp1, dir: -1 },
    { key: "gp", label: "GP", title: "Games played", group: "More", val: (r) => r.gp, fmt: f0, dir: -1 },
    stat("min", "MIN", "Minutes", "More"), stat("oreb", "OREB", "Offensive rebounds", "More"), stat("dreb", "DREB", "Defensive rebounds", "More"),
    stat("pf", "PF", "Personal fouls", "More"),
    { key: "dd", label: "DD", title: "Double-doubles (games)", group: "More", val: (r) => n(r.t.dd), fmt: f0, dir: -1 },
    { key: "td", label: "TD", title: "Triple-doubles (games)", group: "More", val: (r) => n(r.t.td), fmt: f0, dir: -1 },
    { key: "value", label: "$", title: "ESPN auction value", group: "More", val: (r) => n(r.value), fmt: f0, dir: -1 },
    { key: "defl", label: "DEFL", title: "Deflections per game (NBA.com)", group: "Defense", val: (r) => def(r, "defl"), fmt: f1, dir: -1 },
    { key: "cont", label: "CONT", title: "Contested shots per game", group: "Defense", val: (r) => def(r, "cont"), fmt: f1, dir: -1 },
    { key: "chg", label: "CHG", title: "Charges drawn per game", group: "Defense", val: (r) => def(r, "chg"), fmt: f1, dir: -1 },
    { key: "box", label: "BOX", title: "Box-outs per game", group: "Defense", val: (r) => def(r, "box"), fmt: f1, dir: -1 },
    { key: "loose", label: "LOOSE", title: "Loose balls recovered per game", group: "Defense", val: (r) => def(r, "loose"), fmt: f1, dir: -1 },
    { key: "dfg", label: "DFG%", title: "FG% of shots he defended (lower is better)", group: "Defense", val: (r) => def(r, "dfg"), fmt: fp1, dir: 1 },
    { key: "rim", label: "RIM%", title: "FG% at the rim when he defended (lower is better)", group: "Defense", val: (r) => def(r, "rim"), fmt: fp1, dir: 1 },
    ...["weekly_fantasy", "minutes_fantasy"].map((k) => ({ key: k, label: { weekly_fantasy: "W·f", minutes_fantasy: "M·f" }[k],
      title: data.heatName[k], group: "Power rankings", val: (r) => (r.heat ? n(r.heat[k]) : null), fmt: rk, dir: 1 })),
    ...["weekly_nba", "minutes_nba", "weekly_fantasy", "minutes_fantasy"].flatMap((k) => {
      const short = { weekly_nba: "W", minutes_nba: "M", weekly_fantasy: "W·f", minutes_fantasy: "M·f" }[k];
      return [
        { key: `mv_${k}`, label: `${short} +/-`, title: `${data.heatName[k]}: places moved since the last run`, group: "Power rankings", html: true,
          val: (r) => (r.heat && r.heat[k] != null ? (r.heat_prev && r.heat_prev[k] != null ? r.heat_prev[k] - r.heat[k] : null) : null),
          fmt: (v) => fmtMove(v), dir: -1 },
        { key: `sc_${k}`, label: `${short} SCORE`, title: `${data.heatName[k]}: power score (change since last run)`, group: "Power rankings", html: true,
          val: (r) => (r.heat_score ? n(r.heat_score[k]) : null),
          fmt: (v, r) => (v == null ? "–" : `${v.toFixed(2)}${r.heat_dscore && r.heat_dscore[k] != null ? ` <span class="muted small">${sgn(n(r.heat_dscore[k]))}</span>` : ""}`), dir: -1 },
      ];
    }),
  ];
  const COL = Object.fromEntries(COLS.map((c) => [c.key, c]));
  const NUMERIC = COLS.filter((c) => !c.text && !c.html && c.key !== "move");

  // ---- the table's settings. The site default = the old "medium" table.
  const ON_BY_DEFAULT = new Set(["owner", "fp", "fpg", "fp7", "move", "score", "dscore", "pts", "reb", "ast", "stl", "blk", "tpm", "fgp", "ftp", "tov", "weekly_nba", "minutes_nba"]);
  const SITE_DEFAULT = {
    view: "tier", model: data.model, split: "season", show: "all", pos: "", pergame: true,
    f: { tier: "", nba: "", gp: "", min: "", inj: "", stats: [] },
    cols: COLS.map((c) => ({ k: c.key, on: ON_BY_DEFAULT.has(c.key), l: "", w: 0 })),
  };
  let state = JSON.parse(JSON.stringify(SITE_DEFAULT));
  // Fill a saved or shared config into a full state: unknown keys dropped, new columns added (hidden) at the end.
  function normalize(cfg) {
    const s = JSON.parse(JSON.stringify(SITE_DEFAULT));
    if (!cfg || typeof cfg !== "object") return s;
    for (const k of ["view", "model", "split", "show", "pos"]) if (typeof cfg[k] === "string") s[k] = cfg[k];
    if (typeof cfg.pergame === "boolean") s.pergame = cfg.pergame;
    if (cfg.f && typeof cfg.f === "object") {
      for (const k of ["tier", "nba", "gp", "min", "inj"]) if (cfg.f[k] != null) s.f[k] = String(cfg.f[k]);
      if (Array.isArray(cfg.f.stats)) s.f.stats = cfg.f.stats.filter((x) => x && COL[x.k]).map((x) => ({ k: x.k, v: String(x.v ?? "") })).slice(0, 8);
    }
    if (Array.isArray(cfg.cols)) {
      const seen = new Set();
      const cols = cfg.cols.filter((c) => c && COL[c.k] && !seen.has(c.k) && seen.add(c.k))
        .map((c) => ({ k: c.k, on: !!c.on, l: String(c.l || "").slice(0, 24), w: Math.max(0, Math.min(600, Number(c.w) || 0)) }));
      for (const c of SITE_DEFAULT.cols) if (!seen.has(c.k)) cols.push({ ...c, on: false });
      s.cols = cols;
    }
    return s;
  }
  const hasOpt = (sel, v) => [...sel.options].some((o) => o.value === v);
  // state -> the controls on the page
  function paintControls() {
    for (const k of ["view", "model", "split", "show", "pos"]) ctl[k].value = hasOpt(ctl[k], state[k]) ? state[k] : SITE_DEFAULT[k];
    ctl.pergame.checked = state.pergame;
    for (const k of ["tier", "gp", "min", "inj"]) flt[k].value = state.f[k];
    if (state.f.nba && !hasOpt(flt.nba, state.f.nba)) flt.nba.add(new Option(state.f.nba, state.f.nba));
    flt.nba.value = state.f.nba;
    paintStatFilters();
    paintColList();
  }
  // the controls -> state (the column list and stat filters write to state directly)
  function readControls() {
    for (const k of ["view", "model", "split", "show", "pos"]) state[k] = ctl[k].value;
    state.pergame = ctl.pergame.checked;
    for (const k of ["tier", "nba", "gp", "min", "inj"]) state.f[k] = flt[k].value;
  }
  const remember = () => put("bl.statsTable", state);

  // ---- NBA team filter options from the rows
  [...new Set(data.rows.map((r) => r.nba).filter(Boolean))].sort().forEach((t) => flt.nba.add(new Option(t, t)));

  // ---- stat minimum filters: "PTS ≥ 15"
  function paintStatFilters() {
    const box = $("f-stats");
    box.innerHTML = state.f.stats.map((s, i) => `<div class="row st-statf" data-i="${i}">
        <select data-f="k" aria-label="Stat">${NUMERIC.map((c) => `<option value="${c.key}"${c.key === s.k ? " selected" : ""}>${esc(c.label)} · ${esc(c.title)}</option>`).join("")}</select>
        <span>≥</span><input type="number" step="any" data-f="v" value="${esc(s.v)}" class="st-num" aria-label="Minimum">
        <button type="button" class="link" data-f="x" aria-label="Remove this filter">✕</button></div>`).join("");
  }
  $("f-stats").addEventListener("input", (e) => {
    const row = e.target.closest("[data-i]");
    if (!row) return;
    const s = state.f.stats[row.dataset.i];
    if (e.target.dataset.f === "k") s.k = e.target.value;
    if (e.target.dataset.f === "v") s.v = e.target.value;
    remember(); render();
  });
  $("f-stats").addEventListener("click", (e) => {
    const b = e.target.closest('[data-f="x"]');
    if (!b) return;
    state.f.stats.splice(Number(b.closest("[data-i]").dataset.i), 1);
    paintStatFilters(); remember(); render();
  });
  $("f-stat-add").addEventListener("click", () => {
    if (state.f.stats.length >= 8) return;
    state.f.stats.push({ k: "pts", v: "" });
    paintStatFilters();
    const last = $("f-stats").lastElementChild;
    if (last) last.querySelector("input").focus();
  });
  $("f-clear").addEventListener("click", () => {
    state.f = JSON.parse(JSON.stringify(SITE_DEFAULT.f));
    paintControls(); remember(); render();
  });

  // ---- the column editor
  const labelOf = (c) => (c.l || COL[c.k].label);
  function paintColList() {
    $("st-cols").innerHTML = state.cols.map((c, i) => {
      const d = COL[c.k];
      return `<li class="st-col" data-k="${c.k}">
        <label class="st-col-on"><input type="checkbox" data-c="on"${c.on ? " checked" : ""}> <span class="muted small">${esc(d.group)}</span></label>
        <input data-c="l" value="${esc(c.l)}" placeholder="${esc(d.label)}" maxlength="24" aria-label="Name for ${esc(d.title)}" title="${esc(d.title)}">
        <span class="muted small st-col-title">${esc(d.title)}</span>
        <label class="ctl small">Width <input type="number" data-c="w" min="0" max="600" step="10" value="${c.w || ""}" placeholder="auto" class="st-num" aria-label="Width in pixels"></label>
        <span class="st-col-move">
          <button type="button" data-c="up" aria-label="Move ${esc(labelOf(c))} left"${i === 0 ? " disabled" : ""}>↑</button>
          <button type="button" data-c="down" aria-label="Move ${esc(labelOf(c))} right"${i === state.cols.length - 1 ? " disabled" : ""}>↓</button>
        </span></li>`;
    }).join("");
  }
  const colAt = (el) => state.cols.find((c) => c.k === el.closest("[data-k]").dataset.k);
  $("st-cols").addEventListener("input", (e) => {
    const f = e.target.dataset.c;
    if (!f) return;
    const c = colAt(e.target);
    if (f === "on") c.on = e.target.checked;
    if (f === "l") c.l = e.target.value.slice(0, 24);
    if (f === "w") c.w = Math.max(0, Math.min(600, Number(e.target.value) || 0));
    remember(); render();
  });
  $("st-cols").addEventListener("click", (e) => {
    const b = e.target.closest('button[data-c]');
    if (!b) return;
    const i = state.cols.indexOf(colAt(b)), j = b.dataset.c === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= state.cols.length) return;
    [state.cols[i], state.cols[j]] = [state.cols[j], state.cols[i]];
    paintColList();
    $("st-cols").querySelector(`[data-k="${state.cols[j].k}"] [data-c="${b.dataset.c}"]`)?.focus();
    remember(); render();
  });

  const shown = () => state.cols.filter((c) => c.on && (!COL[c.k].heatOnly || isHeat()) && !(COL[c.k].hideFor || []).includes(ctl.view.value));

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
  const wStyle = (c) => (c.w ? ` style="width:${c.w}px;min-width:${c.w}px;max-width:${c.w}px"` : "");

  function render() {
    const cols = shown();
    const q = ctl.search.value.trim().toLowerCase();
    const pos = ctl.pos.value, show = ctl.show.value, F = state.f;
    const mine = window.BL && window.BL.viewTeam();
    const onlyTeam = show.startsWith("team:") ? show.slice(5) : null;
    const ranks = viewRanks(rows);
    const rankOf = (r) => ranks.get(r.id) ?? null;
    const gpMin = n(F.gp), minMin = n(F.min);
    const statMins = F.stats.filter((s) => n(s.v) != null && COL[s.k]);
    let list = rows.filter((r) => (!q || r.name.toLowerCase().includes(q))
      && (!pos || (r.pos || []).includes(pos))
      && (!onlyTeam || r.team === onlyTeam)
      && (show !== "free" || !r.team)
      && (show !== "mine" || (mine && r.team === mine))
      && (show !== "top50" || (rankOf(r) != null && rankOf(r) <= 50))
      && (show !== "movers" || (typeof move(r) === "number" && Math.abs(move(r)) >= 3))
      && (!F.tier || r.tier === F.tier)
      && (!F.nba || (r.nba || "") === F.nba)
      && (gpMin == null || r.gp >= gpMin)
      && (minMin == null || (mpg(r) ?? 0) >= minMin)
      && (!F.inj || (F.inj === "hurt" ? hurt(r) : !hurt(r)))
      && statMins.every((s) => { const v = COL[s.k].val(r); return v != null && v >= n(s.v); }));
    const by = (val, dir, text) => (a, b) => {
      const x = val(a), y = val(b);
      const blank = (v) => v == null || v === "";
      if (blank(x) && blank(y)) return 0;
      if (blank(x)) return 1;
      if (blank(y)) return -1;
      return (text ? String(x).localeCompare(String(y)) : x - y) * dir;
    };
    const tie = by(rankOf, 1);
    if (!sort && show === "movers") list.sort((a, b) => Math.abs(move(b)) - Math.abs(move(a)) || tie(a, b));
    else if (sort && (sort.key === "rank" || COL[sort.key])) {
      const c = COL[sort.key];
      const cmp = sort.key === "rank" ? by(rankOf, sort.dir) : by(c.val, sort.dir, c.text);
      list.sort((a, b) => cmp(a, b) || tie(a, b) || a.name.localeCompare(b.name));
    } else list.sort((a, b) => tie(a, b) || a.name.localeCompare(b.name));

    const arrow = (k) => (sort && sort.key === k ? (sort.dir === 1 ? " ▲" : " ▼") : "");
    $("pt-head").innerHTML = `<th class="who" scope="col"><button type="button" data-sort="rank">#${arrow("rank") || (sort ? "" : " ▲")}</button> Player</th>`
      + cols.map((c) => { const d = COL[c.k];
        return `<th scope="col" class="${d.text ? "" : "num"}" data-k="${c.k}" title="${esc(d.title)}"${wStyle(c)}><button type="button" data-sort="${c.k}">${esc(labelOf(c))}${arrow(c.k)}</button><span class="st-grip" data-grip="${c.k}" aria-hidden="true"></span></th>`; }).join("");

    $("pt-body").innerHTML = list.map((r) => {
      const k = rankOf(r);
      const tierText = data.tierName[r.tier] || "";
      const injured = hurt(r) ? ` <span class="st-hurt" title="${esc(injText(r) || r.status)}">${esc(r.status.replace(/_/g, " "))}</span>` : "";
      return `<tr${mine && r.team === mine ? ' class="mine"' : ""}>
        <th scope="row" class="who"><a href="/player/${encodeURIComponent(r.id)}">
          <span class="rk num">${k ?? "–"}</span>
          ${face(r)}
          <span class="nm"><b>${esc(r.name)}</b><span class="muted small"><span title="${esc(tierText)} · tier rank ${r.tier_rank ?? "–"}">${data.emoji[r.tier] || ""}</span> ${esc(r.nba || "FA")} · ${esc((r.pos || []).join("/") || "–")}${injured}</span></span>
        </a></th>
        ${cols.map((c) => { const d = COL[c.k]; const v = d.val(r);
          return `<td class="${d.cls || (d.text ? "" : "num")}"${wStyle(c)}>${d.html ? d.fmt(v, r) : esc(d.fmt(v, r))}</td>`; }).join("")}
      </tr>`;
    }).join("");

    const noteBits = [];
    if (isHeat() && !rows.some((r) => r.heat && r.heat[ctl.view.value] != null))
      noteBits.push("This power ranking hasn't been published yet, so nobody has a rank in it.");
    if (!rows.some((r) => r.gp > 0)) noteBits.push(`No games in "${ctl.split.selectedOptions[0].text}" yet, so points and stats are blank.`);
    if (cols.some((c) => COL[c.k].group === "Defense") && !rows.some((r) => r.def))
      noteBits.push("Defense numbers come from NBA.com and show up once players are linked to their NBA.com id.");
    $("pt-note").textContent = noteBits.join(" ");
    const filtered = !!(F.tier || F.nba || gpMin != null || minMin != null || F.inj || statMins.length);
    $("pt-count").innerHTML = show === "mine" && !mine ? "Pick your team at the top first."
      : `${list.length} players` + (onlyTeam ? ` on ${esc(ctl.show.selectedOptions[0].text)}` : "")
        + (filtered ? ` · <button type="button" class="link" id="pt-unfilter">clear the extra filters</button>` : "");
    $("pt-empty").hidden = list.length > 0;
  }

  // ---- sorting, and resizing by dragging a header's right edge
  $("pt-head").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sort]");
    if (!b) return;
    const key = b.dataset.sort;
    const first = key === "rank" ? 1 : COL[key].dir;
    sort = sort && sort.key === key ? { key, dir: -sort.dir } : { key, dir: first };
    render();
  });
  $("pt-head").addEventListener("pointerdown", (e) => {
    const grip = e.target.closest("[data-grip]");
    if (!grip) return;
    e.preventDefault();
    const th = grip.parentElement, c = state.cols.find((x) => x.k === grip.dataset.grip);
    const x0 = e.clientX, w0 = th.getBoundingClientRect().width;
    const cells = () => [th, ...table.querySelectorAll(`tbody tr > td:nth-child(${[...th.parentElement.children].indexOf(th) + 1})`)];
    const all = cells();
    const moveIt = (ev) => {
      c.w = Math.max(30, Math.min(600, Math.round(w0 + ev.clientX - x0)));
      all.forEach((el) => { el.style.width = el.style.minWidth = el.style.maxWidth = c.w + "px"; });
    };
    const done = () => {
      window.removeEventListener("pointermove", moveIt);
      window.removeEventListener("pointerup", done);
      remember(); paintColList();
    };
    window.addEventListener("pointermove", moveIt);
    window.addEventListener("pointerup", done);
  });
  $("pt-count").addEventListener("click", (e) => { if (e.target.id === "pt-unfilter") $("f-clear").click(); });

  // ---- stat window: other windows load from the API
  async function loadSplit() {
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
  }
  // Apply a whole config (a saved view, my default, or the site default).
  function apply(cfg) {
    const before = ctl.split.value;
    state = normalize(cfg);
    sort = null;
    paintControls(); remember();
    if (ctl.split.value !== before) loadSplit(); else render();
  }

  ctl.split.addEventListener("change", () => { readControls(); remember(); loadSplit(); });
  ctl.view.addEventListener("change", () => { sort = null; readControls(); remember(); render(); });
  for (const k of ["model", "show", "pergame", "pos"]) ctl[k].addEventListener("change", () => { readControls(); remember(); render(); });
  for (const k of ["tier", "nba", "inj"]) flt[k].addEventListener("change", () => { readControls(); remember(); render(); });
  for (const k of ["gp", "min"]) flt[k].addEventListener("input", () => { readControls(); remember(); render(); });
  ctl.search.addEventListener("input", render);
  document.addEventListener("bl:team", render);

  // ---- Advanced settings panel
  const advBtn = $("st-adv-btn"), adv = $("st-adv");
  const paintAdv = () => {
    advBtn.setAttribute("aria-expanded", String(!adv.hidden));
    advBtn.textContent = adv.hidden ? "⚙ Advanced settings" : "✕ Close advanced settings";
  };
  advBtn.addEventListener("click", () => { adv.hidden = !adv.hidden; put("bl.statsAdv", !adv.hidden); paintAdv(); });
  adv.hidden = !get("bl.statsAdv");
  paintAdv();

  // ---- saved views (shared through /api/views); my default view lives on this device
  const pick = $("st-view-pick"), note = $("st-view-note");
  let views = [];
  const myDefault = () => get("bl.statsDefault");      // { id, name, config }; id "" = the site default
  const say = (msg) => { note.textContent = msg; };
  function paintViews(selected) {
    const d = myDefault();
    const star = (id) => (d && d.id === id ? " ★ my default" : "");
    pick.innerHTML = `<option value="">Site default${star("")}</option>`
      + views.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}${v.by ? ` · by ${esc(v.by)}` : ""}${v.mine ? " (mine)" : ""}${star(v.id)}</option>`).join("");
    if (d && d.id && !views.some((v) => v.id === d.id)) pick.add(new Option(`${d.name} ★ my default (copy kept on this device)`, d.id));
    pick.value = selected ?? pick.value ?? "";
    if (![...pick.options].some((o) => o.value === pick.value)) pick.value = "";
    paintDel();
  }
  const chosen = () => views.find((v) => v.id === pick.value);
  const paintDel = () => { $("st-view-del").hidden = !(chosen() && chosen().mine); };
  async function loadViews(selected) {
    try {
      const res = await fetch(`/api/views?device=${encodeURIComponent(window.BL ? BL.deviceId() : "")}`).then((r) => r.json());
      if (res.ok) views = res.data;
    } catch {}
    paintViews(selected);
  }
  pick.addEventListener("change", paintDel);
  $("st-view-load").addEventListener("click", () => {
    const v = chosen();
    const d = myDefault();
    if (!pick.value) { apply(SITE_DEFAULT); say("Showing the site's default view."); }
    else if (v) { apply(v.config); say(`Showing "${v.name}".`); }
    else if (d && d.id === pick.value) { apply(d.config); say(`Showing "${d.name}".`); }
  });
  $("st-view-default").addEventListener("click", () => {
    const v = chosen();
    if (!pick.value) { put("bl.statsDefault", null); say("Your default is the site's default view again."); }
    else if (v) { put("bl.statsDefault", { id: v.id, name: v.name, config: v.config }); say(`"${v.name}" now opens first on this device.`); }
    paintViews(pick.value);
  });
  $("st-view-save").addEventListener("click", async () => {
    const name = $("st-view-name").value.trim();
    if (!name) { $("st-view-name").focus(); say("Give the view a name first."); return; }
    readControls();
    try {
      const v = await BL.post("/api/views", { op: "save", device: BL.deviceId(), name, by: BL.teamName(BL.viewTeam()) || "", config: state });
      $("st-view-name").value = "";
      say(`Saved "${v.name}". Everyone can use it now.`);
      await loadViews(v.id);
    } catch (err) { say(err.message); }
  });
  $("st-view-del").addEventListener("click", async () => {
    const v = chosen();
    if (!v || !confirm(`Delete "${v.name}" for everyone? Copies other people saved stay.`)) return;
    try {
      await BL.post("/api/views", { op: "delete", device: BL.deviceId(), id: v.id });
      say(`Deleted "${v.name}".`);
      await loadViews("");
    } catch (err) { say(err.message); }
  });
  $("st-reset").addEventListener("click", () => { apply(SITE_DEFAULT); pick.value = ""; paintDel(); say("Back to the site's default view."); });

  // ---- start: my default view, else what this device used last, else the site default. Links (?view= ?show= ?team=) win.
  const d = myDefault();
  state = normalize(d ? d.config : get("bl.statsTable") || get("bl.tiersTable") && legacy(get("bl.tiersTable")));
  function legacy(old) {   // the old Tiers page's saved settings
    return { view: old.view, model: old.model, split: old.split, show: old.show, pergame: old.pergame };
  }
  const asked = new URLSearchParams(location.search);
  if (asked.get("view")) state.view = asked.get("view");
  if (asked.get("show")) state.show = asked.get("show");
  if (asked.get("team")) state.show = `team:${asked.get("team")}`;
  paintControls();
  readControls();
  if (ctl.split.value !== "season") loadSplit(); else render();
  loadViews(d ? d.id : "");
  // A "How the rankings work" link (/stats#how) opens the explainer.
  if (location.hash === "#how") { const x = document.getElementById("how"); if (x) { x.closest("details.explain-wrap").open = true; x.open = true; x.scrollIntoView(); } }
})();
