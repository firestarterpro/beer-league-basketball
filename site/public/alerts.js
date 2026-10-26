// Home page "Heads up": roster moves the picked team should make in ESPN.
document.addEventListener("DOMContentLoaded", () => {
  const card = document.getElementById("alerts");
  const list = document.getElementById("alerts-list");
  if (!card) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const links = JSON.parse(card.dataset.links);

  async function load(team) {
    card.hidden = true;
    if (!team) return;
    try {
      const res = await fetch(`/api/alerts?team=${encodeURIComponent(team)}`).then((r) => r.json());
      if (!res.ok || !res.data.length || card.dataset.closed) return;
      const n = window.BL.espnTeam(team);
      const href = (l) => (l === "team" ? links.team + (n ? `&teamId=${n}` : "") : links[l]);
      const label = { team: "Fix it in ESPN ↗", players: "Add players in ESPN ↗", practice: "Practice draft" };
      const text = (a) => (a.link === "team" && a.level === "info" ? "Check in ESPN ↗" : label[a.link]);
      list.innerHTML = res.data.map((a) => `<li class="${a.level === "info" ? "info" : ""}">
          <span>${esc(a.text)}</span>
          ${a.link ? `<a class="small" href="${esc(href(a.link))}"${a.link === "practice" ? "" : ' target="_blank" rel="noopener"'}>${text(a)}</a>` : ""}
        </li>`).join("");
      card.hidden = false;
    } catch {}
  }
  load(window.BL.viewTeam());
  document.addEventListener("bl:team", (e) => load(e.detail));
});
