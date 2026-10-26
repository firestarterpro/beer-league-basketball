// Home page "Heads up": roster and lineup moves the picked team should make in ESPN. One line each;
// the [[action]] words in the text are the link (to the right day's lineup, the team page or free agents).
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
      const href = (a) => {
        if (a.link === "players") return links.players;
        const u = new URL(a.link === "lineup" ? links.lineup : links.team);
        if (n) u.searchParams.set("teamId", n);
        if (a.link === "lineup") u.searchParams.set("scoringPeriodId", String(window.BL.period(a.day ?? 1)));
        return u.toString();
      };
      list.innerHTML = res.data.map((a) => {
        const parts = esc(a.text).split(/\[\[|\]\]/);
        const html = a.link && parts.length === 3
          ? `${parts[0]}<a href="${esc(href(a))}" target="_blank" rel="noopener">${parts[1]} ↗</a>${parts[2]}`
          : esc(a.text.replace(/\[\[|\]\]/g, ""));
        return `<li class="${a.level === "info" ? "info" : ""}"><span>${html}</span></li>`;
      }).join("");
      card.hidden = false;
    } catch {}
  }
  load(window.BL.viewTeam());
  document.addEventListener("bl:team", (e) => load(e.detail));
});
