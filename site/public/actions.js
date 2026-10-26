// Action request page: loads the picked team's roster and request history.
// Toys: search results as a trading-card binder (#14), a chalkboard lineup you drag names onto (#15),
// a skateboard that ollies on IR moves, with a "Whoa! Violation" if a move breaks the caps (#16),
// and an opt-in helper with tier-cap tips (#17). The form fields underneath are unchanged.
document.addEventListener("DOMContentLoaded", function () {
  const $ = (id) => document.getElementById(id);
  const sfx = (n) => BL.sfx && BL.sfx(n);
  const calm = () => (BL.calm ? BL.calm() : false);
  const LABEL = { add_player: "Add", drop_player: "Drop", waiver_claim: "Waiver claim", lineup_change: "Lineup", ir_move: "IR move" };
  const STATUS = { pending: ["Waiting on LM", "warn"], executed: ["Done", "ok"], rejected: ["Not done", "bad"] };
  let roster = [], addPlayers = [];

  function showFields() {
    const type = $("action-type").value;
    document.querySelectorAll("[data-for]").forEach((el) => (el.hidden = !el.dataset.for.split(" ").includes(type)));
    $("roster-label").textContent = type === "waiver_claim" ? "Player to drop" : type === "drop_player" ? "Player to drop" : "Player";
    if (type === "lineup_change") chalkboard();
    checkCaps();
    helperTip();
  }

  async function load() {
    const team = BL.viewTeam();
    $("pick-first").hidden = !!team;
    if (!team) { $("action-form").hidden = $("history").hidden = $("not-opted").hidden = true; return; }
    const res = await fetch(`/api/actions?team=${team}`).then((r) => r.json());
    if (!res.ok) return BL.toast(res.error, true);
    const { info, roster: r, requests } = res.data;
    roster = r;
    const opted = !!(info && info.uses_web_actions);
    $("not-opted").hidden = opted;
    $("action-form").hidden = !opted;
    $("history").hidden = !requests.length;
    $("roster-player").innerHTML = roster.map((p) => `<option value="${p.player_id}">${esc(p.player_name)} (${window.BL.tier(p.tier)} ${p.slot})</option>`).join("");
    $("history-body").innerHTML = requests.map((q) => {
      const [label, tone] = STATUS[q.status];
      return `<tr><td class="num">${new Date(q.submitted_at).toLocaleString()}</td>
        <td>${LABEL[q.action_type]} ${esc(q.player_name || "")}</td>
        <td><span class="pill ${tone}">${label}</span></td><td>${esc(q.lm_notes || "")}</td></tr>`;
    }).join("");
    showFields();
    helperOffer();
  }

  function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  // ---------- Search + card binder (#14) ----------
  const TIER_NAME = { T1: "Tier 1", T2: "Tier 2", T3: "Tier 3" };
  const initials = (s) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  function binder() {
    const box = $("add-binder");
    const shown = addPlayers.slice(0, 12);
    // Rebuild the cards only when the results change. Tapping a card blurs the search box, and its change
    // event lands here between mousedown and mouseup: new nodes then would swallow the click.
    const key = shown.map((p) => p.player_id).join();
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      box.innerHTML = shown.map((p) => {
        const t = (p.tier || "T3").toLowerCase();
        return `<button type="button" class="pcard-mini ${t}" data-pid="${esc(p.player_id)}" aria-pressed="false">
          <img class="frame" src="/img/fx/player-card-${t}-blank.webp" alt="" width="461" height="700" loading="lazy">
          <span class="pm-photo" aria-hidden="true">${esc(initials(p.name))}</span>
          <span class="pm-text">
            <span class="pm-name${p.name.length > 14 ? " long" : ""}">${esc(p.name)}</span>
            <span class="pm-meta">${esc(p.nba_team || "")}${p.rank ? ` · #${p.rank}` : ""}</span>
            <span class="pm-owner">${p.fantasy_team ? "on " + esc(p.fantasy_team) : "Free agent"}</span>
          </span>
          <img class="pm-chip" src="/img/toys/tier-chip-${t}.webp" alt="${TIER_NAME[p.tier || "T3"]}" width="121" height="121">
          <span class="pm-check" aria-hidden="true">✓ Picked</span>
        </button>`;
      }).join("");
    }
    const picked = addPlayerId();
    box.querySelectorAll(".pcard-mini").forEach((c) => {
      c.classList.toggle("picked", c.dataset.pid === picked);
      c.setAttribute("aria-pressed", String(c.dataset.pid === picked));
    });
  }
  $("add-binder").addEventListener("click", (e) => {
    const card = e.target.closest(".pcard-mini");
    if (!card) return;
    const p = addPlayers.find((x) => x.player_id === card.dataset.pid);
    if (!p) return;
    $("add-search").value = p.name;
    sfx("card-flip");
    binder();
    checkCaps();
    helperTip(p);
  });

  let searchTimer;
  $("add-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = $("add-search").value.trim();
      if (q.length < 2) { addPlayers = []; binder(); return; }
      const res = await fetch(`/api/players?q=${encodeURIComponent(q)}`).then((r) => r.json());
      addPlayers = res.ok ? res.data : [];
      $("add-list").innerHTML = addPlayers.map((p) => `<option value="${esc(p.name)}">${window.BL.tier(p.tier)} · ${esc(p.nba_team || "")}${p.fantasy_team ? " · on " + esc(p.fantasy_team) : ""}</option>`).join("");
      binder();
      checkCaps();
    }, 250);
  });

  function addPlayerId() {
    const name = $("add-search").value.trim().toLowerCase();
    return (addPlayers.find((p) => p.name.toLowerCase() === name) || {}).player_id;
  }

  // ---------- Caps check: add / waiver claim, and IR returns to the lineup ----------
  let capSeq = 0;
  async function checkCaps() {
    const type = $("action-type").value;
    const pid = ["add_player", "waiver_claim"].includes(type) ? addPlayerId()
      : type === "ir_move" && $("ir-to").value === "active" ? $("roster-player").value : "";
    const seq = ++capSeq;
    if (!pid) { whoa(false); return; }
    const res = await fetch(`/api/actions?team=${BL.viewTeam()}&check=${encodeURIComponent(pid)}`).then((r) => r.json()).catch(() => ({}));
    if (seq === capSeq) whoa(!!(res.ok && res.data.over));
  }
  function whoa(on) {
    const box = $("heads-up");
    const was = !box.hidden;
    box.hidden = !on;
    if (on && !was) {
      sfx("buzzer");
      if (!calm()) { box.classList.remove("tracking"); void box.offsetWidth; box.classList.add("tracking"); }
      helperSay("Whoa! That move would put you over the tier caps. The LM may send it to a community vote first.");
    }
  }

  // ---------- Chalkboard lineup (#15) ----------
  const SPOTS = ["PG", "SG", "SF", "PF", "C", "UTIL", "UTIL", "UTIL"];
  let chalkPick = null;
  function chalkboard() {
    const slots = $("chalk-slots"), list = $("chalk-roster");
    const active = roster.filter((p) => p.slot !== "IR"), ir = roster.filter((p) => p.slot === "IR");
    // Fill each spot with whoever ESPN has there now (UT = UTIL); the rest of the roster is listed beside it.
    const placed = new Set();
    const who = SPOTS.map((s) => {
      const p = active.find((x) => !placed.has(x.player_id) && (x.position_slot === s || (s === "UTIL" && x.position_slot === "UT")));
      if (p) placed.add(p.player_id);
      return p;
    });
    slots.innerHTML = SPOTS.map((s, i) => `<button type="button" class="chalk-spot" data-slot="${s}">
        <b>${s}</b><span>${who[i] ? esc(who[i].player_name) : "—"}</span></button>`).join("")
      + [0, 1].map((i) => `<div class="chalk-spot ir" aria-disabled="true"><b>IR</b><span>${ir[i] ? esc(ir[i].player_name) : "—"}</span></div>`).join("");
    list.innerHTML = roster.map((p) => `<li><button type="button" class="chalk-name${p.slot === "IR" ? " dust" : ""}" data-pid="${esc(p.player_id)}" draggable="true">
        ${esc(p.player_name)} <small>${window.BL.tier(p.tier)}${p.slot === "IR" ? " IR" : ""}</small></button></li>`).join("");
    if (!$("lineup-date").value) $("lineup-date").value = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    markChalk();
  }
  function markChalk() {
    $("chalk-roster").querySelectorAll(".chalk-name").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.pid === chalkPick)));
  }
  function chalkDrop(pid, spot) {
    const p = roster.find((x) => x.player_id === pid);
    if (!p || !spot) return;
    $("roster-player").value = pid;
    $("lineup-slot").value = spot.dataset.slot;
    $("chalk-slots").querySelectorAll(".chalk-spot.drop").forEach((s) => { s.classList.remove("drop"); s.querySelector("span").textContent = s.dataset.was ?? s.querySelector("span").textContent; });
    spot.dataset.was = spot.querySelector("span").textContent;
    spot.querySelector("span").textContent = p.player_name;
    spot.classList.add("drop");
    chalkPick = pid;
    sfx("pencil-scratch");
    markChalk();
  }
  $("chalk-roster").addEventListener("click", (e) => {
    const b = e.target.closest(".chalk-name");
    if (!b) return;
    chalkPick = chalkPick === b.dataset.pid ? null : b.dataset.pid;
    sfx("pencil-scratch"); markChalk();
  });
  $("chalk-slots").addEventListener("click", (e) => {
    const spot = e.target.closest(".chalk-spot[data-slot]");
    if (spot && chalkPick) chalkDrop(chalkPick, spot);
    else if (spot) BL.toast("Tap a name first, then the spot.");
  });
  // Drag with a mouse (HTML drag and drop) or a finger (pointer events).
  $("chalk-roster").addEventListener("dragstart", (e) => {
    const b = e.target.closest(".chalk-name");
    if (b) { e.dataTransfer.setData("text/plain", b.dataset.pid); e.dataTransfer.effectAllowed = "move"; }
  });
  $("chalk-slots").addEventListener("dragover", (e) => { if (e.target.closest(".chalk-spot[data-slot]")) e.preventDefault(); });
  $("chalk-slots").addEventListener("drop", (e) => {
    e.preventDefault();
    chalkDrop(e.dataTransfer.getData("text/plain"), e.target.closest(".chalk-spot[data-slot]"));
  });
  let ghost = null, ghostPid = null;
  $("chalk-roster").addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".chalk-name");
    if (!b || e.pointerType === "mouse") return;
    ghostPid = b.dataset.pid;
    ghost = b.cloneNode(true); ghost.classList.add("chalk-ghost");
    document.body.appendChild(ghost);
    moveGhost(e);
  });
  const moveGhost = (e) => { if (ghost) { ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px"; } };
  addEventListener("pointermove", (e) => { if (ghost) { e.preventDefault(); moveGhost(e); } }, { passive: false });
  addEventListener("pointerup", (e) => {
    if (!ghost) return;
    ghost.remove(); ghost = null;
    const spot = document.elementFromPoint(e.clientX, e.clientY)?.closest(".chalk-spot[data-slot]");
    if (spot) chalkDrop(ghostPid, spot);
  });
  addEventListener("pointercancel", () => { if (ghost) { ghost.remove(); ghost = null; } });

  // ---------- IR move: skateboard ollie (#16) ----------
  function ollie() {
    if ($("action-type").value !== "ir_move") return;
    sfx("ollie");
    const board = document.querySelector(".ollie");
    if (board && !calm()) { board.classList.remove("go"); void board.offsetWidth; board.classList.add("go"); }
  }
  $("ir-to").addEventListener("change", () => { ollie(); checkCaps(); });
  $("roster-player").addEventListener("change", () => { if ($("action-type").value === "ir_move") { ollie(); checkCaps(); } if ($("action-type").value === "lineup_change") markChalk(); });
  $("lineup-slot").addEventListener("change", markChalk);

  // ---------- Helper (#17): opt in with "Need help?"; "Don't show again" sticks on this device ----------
  const helperMode = () => { try { return localStorage.getItem("bl.helper") || ""; } catch { return ""; } };
  const setHelper = (v) => { try { localStorage.setItem("bl.helper", v); } catch {} };
  function helperOffer() {
    $("helper-ask").hidden = helperMode() !== "";
    $("helper").hidden = helperMode() !== "on";
  }
  function helperSay(text) {
    if (helperMode() !== "on") return;
    $("helper-text").textContent = text;
    const h = $("helper");
    const was = !h.hidden;
    h.hidden = false;
    if (!was || !calm()) { h.classList.remove("pop"); void h.offsetWidth; h.classList.add("pop"); }
    sfx("helper-pop");
  }
  function helperTip(p) {
    const type = $("action-type").value;
    if (p && p.tier === "T1") return helperSay("It looks like you're trying to add a T1. A team can hold 3 T1s and 3 T2s; going over needs a community vote.");
    if (p && p.tier === "T2") return helperSay("A T2! You can hold 3 T2s. I'll shout if this one goes over.");
    if (p) return helperSay("T3 players never count against the caps. Add away!");
    const tips = {
      add_player: "Type a name and pick a card. I'll check the tier caps for you.",
      drop_player: "Dropped players sit on waivers for 2 days before anyone can add them.",
      waiver_claim: "Waiver claims go by waiver order, which resets weekly. Pick who to add and who to drop.",
      lineup_change: "Lineups lock at each day's first tip-off. Drag a name onto a spot on the chalkboard.",
      ir_move: "Bringing someone back from IR counts them against the caps again. I'll check it for you.",
    };
    if (helperMode() === "on" && !$("helper").hidden) $("helper-text").textContent = tips[type] || "";
  }
  $("helper-ask").addEventListener("click", () => {
    setHelper("on"); helperOffer();
    helperSay("Hi! I'm the Beer League helper. Pick what you need and I'll point out the tier caps as you go.");
  });
  $("helper-ok").addEventListener("click", () => { $("helper").hidden = true; });
  $("helper-never").addEventListener("click", () => { setHelper("never"); helperOffer(); BL.toast("The helper won't show up again on this device."); });

  $("action-type").addEventListener("change", showFields);
  $("add-search").addEventListener("change", () => { binder(); checkCaps(); const p = addPlayers.find((x) => x.player_id === addPlayerId()); if (p) helperTip(p); });
  document.addEventListener("bl:team", load);

  $("action-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = $("action-type").value, rosterPid = $("roster-player").value;
    let payload;
    if (type === "add_player") payload = { player_id: addPlayerId() };
    if (type === "drop_player") payload = { player_id: rosterPid };
    if (type === "waiver_claim") payload = { player_id: addPlayerId(), drop_player_id: rosterPid };
    if (type === "lineup_change") payload = { date: $("lineup-date").value, slot: $("lineup-slot").value, player_id: rosterPid };
    if (type === "ir_move") {
      const p = roster.find((x) => x.player_id === rosterPid);
      payload = { player_id: rosterPid, from_slot: p ? p.slot : "", to_slot: $("ir-to").value };
    }
    if (!payload.player_id) return BL.toast("Pick a player from the list.", true);
    if (type === "lineup_change" && !payload.date) return BL.toast("Pick a date.", true);
    try {
      await BL.post("/api/actions", { team_id: BL.viewTeam(), action_type: type, payload });
      BL.toast("Sent to the LM.");
      if (BL.fx) { const st = BL.fx.stamp($("action-form"), "Sent to LM", "ok", "sent-stamp"); setTimeout(() => st.remove(), 4000); }
      $("add-search").value = "";
      addPlayers = []; binder(); chalkPick = null;
      load();
    } catch (err) { BL.toast(err.message, true); }
  });

  load();
});
