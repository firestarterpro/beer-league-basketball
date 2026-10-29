// Home page "Upcoming games" (Lineups merged in): per day, one row of player tiles in slot order
// (PG, SG, SF, PF, C, UTIL/bench, IR) with each player's average fantasy points. Bench is highlighted,
// injured players are marked and IR players get a ♿ over the photo. After the last player: a Change
// lineup tile (that team's ESPN lineup for that day) and a Trades tile. Shows the picked team; "All teams" expands.
document.addEventListener("DOMContentLoaded", () => {
  const sec = document.getElementById("upcoming");
  const box = document.getElementById("upcoming-days");
  const tabs = document.getElementById("tv-tabs");
  const allBtn = document.getElementById("upcoming-all");
  if (!box || !sec) return;
  const links = JSON.parse(sec.dataset.links || "{}");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sfx = (n) => window.BL.sfx && window.BL.sfx(n);
  const CT = { timeZone: "America/Chicago" };
  const ymd = (offset) => new Date(Date.now() + offset * 864e5).toLocaleDateString("en-CA", CT);
  const DAYS = 3;
  const dates = [...Array(DAYS)].map((_, i) => ymd(i));
  const dayTab = (i) => (i === 0 ? "Tonight" : i === 1 ? "Tomorrow"
    : new Date(dates[i] + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }));
  const ORDER = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "BE", "IR"];
  const slotOf = (p) => (p.slot === "IR" ? "IR" : p.slot === "bench" ? "BE" : p.pos || "UTIL");
  const sortKey = (p) => { const i = ORDER.indexOf(slotOf(p)); return i < 0 ? 99 : i; };
  let data = null, at = 0, showAll = false;

  const tile = (p, playing) => {
    const s = slotOf(p);
    const bench = s === "BE" || s === "UTIL";
    const cls = ["lu-tile", bench && "bench", p.hurt && "hurt", s === "IR" && "ir", !playing && "off"].filter(Boolean).join(" ");
    const pic = p.img
      ? `<img src="${esc(p.img)}" alt="" loading="lazy" width="96" height="96">`
      : `<span class="lu-init" aria-hidden="true">${esc(p.name.split(" ").map((w) => w[0]).join("").slice(0, 2))}</span>`;
    const note = s === "IR" ? "On IR" : p.hurt ? `Injured${p.injury_note ? ": " + p.injury_note : ""}` : playing ? "Plays" : "No game";
    return `<a class="${cls}" href="/player/${encodeURIComponent(p.id)}" title="${esc(p.name)} · ${esc(s)} · ${esc(note)}">
        <span class="lu-pic">${pic}${s === "IR" ? '<span class="lu-ir" aria-label="On IR">♿</span>' : p.hurt ? '<span class="lu-hurt" aria-label="Injured">🩹</span>' : ""}
          <span class="lu-avg num">${p.avg != null ? p.avg.toFixed(1) : "–"}</span></span>
        <span class="lu-slot">${esc(s === "BE" ? "Bench" : s)}</span>
        <span class="lu-name">${esc(p.name.split(" ").slice(-1)[0])}</span>
      </a>`;
  };
  const tools = (team, i) => {
    const u = new URL(links.lineup);
    if (team.espn_team_id) u.searchParams.set("teamId", team.espn_team_id);
    u.searchParams.set("scoringPeriodId", String(window.BL.period(i)));
    return `<a class="lu-tile lu-tool" href="${esc(u)}" target="_blank" rel="noopener" title="Change lineup on ESPN">
        <span class="lu-pic"><span class="lu-icon" aria-hidden="true">📋</span></span><span class="lu-slot">Change</span><span class="lu-name">lineup ↗</span></a>
      <a class="lu-tile lu-tool" href="${esc(links.trades)}" target="_blank" rel="noopener" title="Trades on ESPN">
        <span class="lu-pic"><span class="lu-icon" aria-hidden="true">🔁</span></span><span class="lu-slot">ESPN</span><span class="lu-name">Trades ↗</span></a>`;
  };

  function show(i) {
    if (!data) return;
    at = (i + DAYS) % DAYS;
    tabs.querySelectorAll("[role=tab]").forEach((t, n) => { t.setAttribute("aria-selected", String(n === at)); t.tabIndex = n === at ? 0 : -1; });
    const d = dates[at];
    const today = data.games.filter((g) => g.d === d);
    const playing = new Set(today.map((g) => g.id));
    const teams = [];
    data.roster.forEach((p) => {
      let t = teams.find((x) => x.team_id === p.team_id);
      if (!t) teams.push((t = { team_id: p.team_id, team_name: p.team_name, espn_team_id: p.espn_team_id, players: [] }));
      t.players.push(p);
    });
    const first = today.find((g) => g.tip)?.tip;
    box.innerHTML = `<div role="tabpanel" aria-label="${esc(dayTab(at))}">
      <p class="lu-day"><b>${esc(dayTab(at))}</b>${first ? ` · first game ${esc(first)} CT` : today.length ? "" : " · no games"}</p>
      ${teams.map((t) => `
        <div class="lu-team">
          ${teams.length > 1 ? `<p class="lu-team-name small">${esc(t.team_name)} · ${t.players.filter((p) => playing.has(p.id) && slotOf(p) !== "IR").length} playing</p>` : ""}
          <div class="lu-row">${t.players.slice().sort((a, b) => sortKey(a) - sortKey(b)).map((p) => tile(p, playing.has(p.id))).join("")}${tools(t, at)}</div>
        </div>`).join("")}
    </div>`;
  }

  async function load() {
    const team = window.BL.viewTeam();
    const q = showAll ? "all" : team;
    if (allBtn) { allBtn.textContent = showAll ? "Just my team" : "All teams"; allBtn.hidden = !team && showAll; }
    box.innerHTML = ""; data = null;
    if (!q) { box.innerHTML = '<p class="muted small">Pick your team at the top, or see all teams.</p>'; return; }
    try {
      const res = await fetch(`/api/lineup?team=${encodeURIComponent(q)}&days=${DAYS}`).then((r) => r.json());
      if (!res.ok) throw new Error(res.error);
      data = res.data;
      if (!data.roster.length) { box.innerHTML = '<p class="muted">No players on the roster yet.</p>'; return; }
      show(at);
    } catch {
      box.innerHTML = '<p class="muted">Couldn\'t load the games. Try again in a minute.</p>';
    }
  }

  tabs.innerHTML = dates.map((_, n) => `<button type="button" role="tab" class="day-tab" aria-selected="${n === 0}" tabindex="${n === 0 ? 0 : -1}">${esc(dayTab(n))}</button>`).join("");
  tabs.addEventListener("click", (e) => {
    const t = e.target.closest("[role=tab]");
    if (t) { sfx("channel-click"); show([...tabs.children].indexOf(t)); }
  });
  tabs.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault(); show(at + step); tabs.children[at].focus();
  });
  if (allBtn) allBtn.addEventListener("click", () => { showAll = !showAll; load(); });

  load();
  document.addEventListener("bl:team", load);
});
