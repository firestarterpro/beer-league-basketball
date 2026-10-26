// Home page "Upcoming games" as a TV guide on a CRT (#5): one day per channel tab, swipe or tap the
// tabs to surf days. Each player row is a channel; tap it for the NBA versions of the heat ranks.
// W = Weekly power: tap the chip to flip it to HP bars (#6). M = Minutes power: a battery.
// Ranks are the fantasy versions; the NBA versions show when a row opens.
document.addEventListener("DOMContentLoaded", () => {
  const sub = document.getElementById("upcoming-sub");
  const box = document.getElementById("upcoming-days");
  const tabs = document.getElementById("tv-tabs");
  const screen = document.querySelector("#upcoming .tv-screen");
  if (!box) return;
  // The TV sits in a wide or a narrow column depending on the screen; narrow TVs stack each channel.
  const tv = document.querySelector("#upcoming .tv");
  if (tv && window.ResizeObserver) {
    new ResizeObserver(([e]) => {
      tv.classList.toggle("narrow", e.contentRect.width <= 520);
      tv.classList.toggle("tiny", e.contentRect.width <= 430);
    }).observe(tv);
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sfx = (n) => window.BL.sfx && window.BL.sfx(n);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const dayTab = (d) => (d === today ? "Tonight" : d === tomorrow ? "Tomorrow"
    : new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }));
  const dayName = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const rank = (n) => (n ? `#${n}` : "–");
  const slotName = { active: "", bench: "Bench", IR: "IR" };
  // 4 HP bars for the weekly rank, 3 battery cells for the minutes rank.
  const hp = (n) => (!n ? 0 : n <= 25 ? 4 : n <= 50 ? 3 : n <= 100 ? 2 : n <= 200 ? 1 : 0);
  const cells = (n) => (!n ? 0 : n <= 25 ? 3 : n <= 75 ? 2 : n <= 150 ? 1 : 0);
  let days = [], at = 0;

  function row(g, i) {
    const live = g.status === "In Progress";
    const time = g.status === "Final" ? "Final" : live ? "Live" : g.tip || "TBD";
    const bars = hp(g.weekly_fantasy), batt = cells(g.minutes_fantasy);
    return `
      <div class="game channel${g.slot === "active" ? "" : " bench"}${live ? " live" : ""}" role="button" tabindex="0" aria-expanded="false">
        <span class="ch num">CH ${String(i + 1).padStart(2, "0")}</span>
        <span class="time">${esc(time)}${live ? ' <span class="rec-dot" aria-hidden="true"></span>' : ""}</span>
        <span class="who">${esc(g.player_name)}</span>
        <span class="chips">
          <button type="button" class="hp-chip" aria-pressed="false" title="Weekly power (fantasy). Tap to flip.">
            <span class="hp-front">W ${rank(g.weekly_fantasy)}</span>
            <span class="hp-back" aria-hidden="true"><b>HP</b>${[1, 2, 3, 4].map((b) => `<i class="${b <= bars ? "on" : ""}"></i>`).join("")}</span>
          </button>
          <span class="batt-chip" title="Minutes power (fantasy)"><span class="batt lvl-${batt}" aria-hidden="true"><i></i><i></i><i></i></span>M ${rank(g.minutes_fantasy)}</span>
        </span>
        <span class="opp">${esc(g.nba_team)} ${esc(g.opponent)}</span>
        <span class="opp slot">${esc(g.slot === "active" ? g.position_slot || "" : slotName[g.slot] ?? g.slot)}</span>
        <span class="more">NBA version: Weekly ${rank(g.weekly_nba)} · Minutes ${rank(g.minutes_nba)} · ${bars} of 4 HP · battery ${batt} of 3</span>
      </div>`;
  }

  function show(i, how) {
    if (!days.length) return;
    at = (i + days.length) % days.length;
    const [d, games] = days[at];
    const live = games.some((g) => g.status === "In Progress");
    if (screen) screen.classList.toggle("on-air", live);
    tabs.querySelectorAll("[role=tab]").forEach((t, n) => { t.setAttribute("aria-selected", String(n === at)); t.tabIndex = n === at ? 0 : -1; });
    box.innerHTML = `
      <div class="games-day" role="tabpanel" aria-label="${esc(dayName(d))}">
        <h3>${esc(dayName(d))}</h3>
        ${games.map(row).join("")}
        <p class="small tv-foot">${games.filter((g) => g.slot === "active").length} active, ${games.length} total${days.length > 1 ? " · swipe for the next day" : ""}</p>
      </div>`;
    if (how && screen && !(window.BL.calm && window.BL.calm())) {
      screen.classList.remove("zap"); void screen.offsetWidth; screen.classList.add("zap");
    }
  }

  async function load(team) {
    box.innerHTML = ""; tabs.innerHTML = ""; days = [];
    if (screen) screen.classList.remove("on-air");
    if (!team) { sub.textContent = "Pick your team at the top to see its games."; box.innerHTML = '<p class="tv-empty">No signal. Pick your team at the top.</p>'; return; }
    sub.textContent = `${window.BL.teamName(team)} · next 3 days · times Central`;
    try {
      const res = await fetch(`/api/schedule?team=${encodeURIComponent(team)}&days=3`).then((r) => r.json());
      if (!res.ok) throw new Error(res.error);
      const rows = res.data;
      if (!rows.length) { box.innerHTML = '<p class="tv-empty">😴 No games for your players in the next 3 days.</p>'; return; }
      const byDay = {};
      rows.forEach((g) => (byDay[g.game_date.slice(0, 10)] ||= []).push(g));
      days = Object.entries(byDay);
      tabs.innerHTML = days.map(([d], n) => `<button type="button" role="tab" class="day-tab" aria-selected="${n === 0}" tabindex="${n === 0 ? 0 : -1}">${esc(dayTab(d))}</button>`).join("");
      show(0);
    } catch {
      box.innerHTML = '<p class="tv-empty">Couldn\'t load the schedule. Try again in a minute.</p>';
    }
  }

  // Day tabs: click, arrow keys, or swipe the screen.
  tabs.addEventListener("click", (e) => {
    const t = e.target.closest("[role=tab]");
    if (!t) return;
    sfx("channel-click"); show([...tabs.children].indexOf(t), "tab");
  });
  tabs.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step || !days.length) return;
    e.preventDefault(); sfx("channel-click"); show(at + step, "key");
    tabs.children[at].focus();
  });
  let x0 = null, y0 = 0;
  box.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") { x0 = e.clientX; y0 = e.clientY; } });
  box.addEventListener("pointerup", (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && days.length > 1) { sfx("channel-click"); show(at + (dx < 0 ? 1 : -1), "swipe"); }
  });
  box.addEventListener("pointercancel", () => (x0 = null));

  // Rows open to show the NBA ranks; the W chip flips to HP bars.
  box.addEventListener("click", (e) => {
    const chip = e.target.closest(".hp-chip");
    if (chip) {
      const on = chip.getAttribute("aria-pressed") !== "true";
      chip.setAttribute("aria-pressed", String(on)); sfx("card-flip");
      return;
    }
    const ch = e.target.closest(".channel");
    if (!ch) return;
    const open = ch.getAttribute("aria-expanded") !== "true";
    ch.setAttribute("aria-expanded", String(open)); sfx("channel-click");
  });
  box.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("channel")) { e.preventDefault(); e.target.click(); }
  });

  load(window.BL.viewTeam());
  document.addEventListener("bl:team", (e) => load(e.detail));
});
