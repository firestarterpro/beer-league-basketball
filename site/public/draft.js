// Practice auction draft. Everything runs here in the browser and is saved on this device only.
//
// How the computer plays:
//   - Nominating: one of the top 5 players left (by tier rank), at random, opening at $1.
//   - Bidding: each computer team decides once per player how high it will go: the player's
//     value x a random 0.8-1.2, x 1.15 if he fills an open position (0.6 if he only fits UTIL),
//     never more than its max bid (budget minus $1 for every other empty spot).
//     Computers outbid each other in small steps until only one is left, then it's your turn.
(function () {
  const dataEl = document.getElementById("draft-data");
  if (!dataEl) return;
  const D = JSON.parse(dataEl.textContent);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const KEY = "bl.practiceDraft";
  const SPOTS = D.slots.length;
  const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
  if (!D.pool.length) return;

  // ---------- player values, scaled to this league ----------
  // ESPN values are for $200 budgets. Scale so the players who'll get drafted add up to ~95% of all the money.
  const raw = (p) => (p.espn_value > 0 ? p.espn_value : 1 + 60 * Math.exp(-(p.rank - 1) / 18));
  // Re-priced for each draft's team count (6 now, up to 7).
  const players = {};
  function price(nTeams) {
    const n = Math.max(nTeams, 2);
    const drafted = D.pool.slice(0, n * SPOTS);
    const scale = (n * D.budget * 0.95) / drafted.reduce((s, p) => s + raw(p), 0);
    for (const p of D.pool) players[p.id] = { ...p, pos: p.pos || [], value: Math.max(1, Math.round(raw(p) * scale)) };
  }
  price(D.teams.length);

  // ---------- state ----------
  let S = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
  const rand = (a, b) => a + Math.random() * (b - a);
  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function newDraft() {
    const mine = window.BL.viewTeam();
    const size = Number(($("dr-size") || {}).value) || D.teams.length;
    let names = D.teams.map((t) => ({ name: t.team_name, me: t.team_id === mine }));
    if (!names.some((t) => t.me)) names = [{ name: "You", me: true }, ...names];
    while (names.length < size) names.push({ name: `Team ${names.length + 1}`, me: false });
    if (names.length > size) names = [...names.filter((t) => t.me), ...names.filter((t) => !t.me)].slice(0, Math.max(size, 2));
    price(names.length);
    const order = names.map((_, i) => i).sort(() => Math.random() - 0.5);
    S = { teams: names.map((t) => ({ ...t, budget: D.budget, roster: [] })), order, turn: 0,
          taken: {}, lot: null, log: [], auto: false, done: false };
    nextLot();
  }

  // ---------- rules ----------
  const me = () => S.teams.findIndex((t) => t.me);
  const left = (t) => SPOTS - S.teams[t].roster.length;
  const maxBid = (t) => (left(t) > 0 ? S.teams[t].budget - (left(t) - 1) : 0);
  const available = () => D.pool.filter((p) => !S.taken[p.id]).map((p) => players[p.id]);

  // Which lineup slots a team still has open, filling its players into the slots they fit, UTIL last.
  function openSlots(t) {
    const open = [...D.slots];
    for (const r of S.teams[t].roster) {
      const p = players[r.id];
      let i = open.findIndex((s) => p.pos.includes(s));
      if (i < 0) i = open.indexOf("UTIL");
      if (i >= 0) open.splice(i, 1);
    }
    return open;
  }
  function need(t, p) {
    const centers = S.teams[t].roster.filter((r) => players[r.id].pos.includes("C")).length;
    if (p.pos.includes("C") && centers >= D.centerMax) return 0;
    const open = openSlots(t);
    if (open.some((s) => p.pos.includes(s))) return 1.15;
    return open.includes("UTIL") ? 0.6 : 0;
  }

  // ---------- one player on the block ----------
  function startLot(id, opening, by) {
    const p = players[id];
    const maxes = {};
    S.teams.forEach((t, i) => {
      if (t.me && !S.auto) return;
      maxes[i] = Math.min(maxBid(i), Math.round(p.value * rand(0.8, 1.2) * need(i, p)));
    });
    S.lot = { id, bid: opening, leader: by, maxes, out: [] };
    S.log.unshift({ text: `${S.teams[by].name} put up ${p.name} for $${opening}` , kind: "nom" });
    computersBid();
  }

  function step(bid) { return bid < 10 ? 1 : bid < 40 ? Math.ceil(rand(0, 3)) : Math.ceil(rand(0, 5)); }

  // Computers keep outbidding each other until only one wants him at this price.
  function computersBid() {
    const L = S.lot;
    for (let guard = 0; guard < 2000; guard++) {
      const willing = Object.keys(L.maxes).map(Number).filter((i) => i !== L.leader && L.maxes[i] > L.bid && !L.out.includes(i));
      if (!willing.length) break;
      const c = pickOne(willing);
      L.bid = Math.min(L.maxes[c], L.bid + step(L.bid));
      L.leader = c;
    }
    const u = me();
    const userIn = !S.auto && u >= 0 && !L.out.includes(u) && L.leader !== u && maxBid(u) > L.bid;
    if (!userIn) sell();
    else { save(); render(); }
  }

  function sell() {
    const L = S.lot, p = players[L.id], t = S.teams[L.leader];
    t.budget -= L.bid;
    t.roster.push({ id: L.id, price: L.bid });
    S.taken[L.id] = true;
    S.log.unshift({ text: `${p.name} sold to ${t.name} for $${L.bid}`, kind: "sold", me: t.me });
    S.lot = null;
    S.turn++;
    nextLot();
  }

  function nextLot() {
    const pool = available();
    const open = S.teams.map((_, i) => i).filter((i) => left(i) > 0);
    if (!open.length || !pool.length) { S.done = true; save(); render(); return; }
    // Next team in the order that still has room
    let by;
    for (let k = 0; k < S.order.length; k++) {
      const i = S.order[(S.turn + k) % S.order.length];
      if (left(i) > 0) { by = i; S.turn += k; break; }
    }
    if (S.teams[by].me && !S.auto) { save(); render(); return; }   // your turn to put someone up
    const top5 = pool.filter((p) => need(by, p) > 0).slice(0, 5);
    startLot(pickOne(top5.length ? top5 : pool.slice(0, 5)).id, 1, by);
  }

  const yourTurnToNominate = () => S && !S.done && !S.lot && !S.auto && S.teams[S.order[S.turn % S.order.length]].me;

  // ---------- your moves ----------
  function nominate(id, opening) {
    const u = me();
    opening = Math.round(Number(opening) || 1);
    if (opening < 1 || opening > maxBid(u)) return window.BL.toast(`Open between $1 and $${maxBid(u)}.`, true);
    if (need(u, players[id]) === 0) return window.BL.toast(`${players[id].name} doesn't fit any open spot on your team.`, true);
    startLot(id, opening, u);
  }
  function bid(amount) {
    const u = me(), L = S.lot;
    amount = Math.round(Number(amount));
    if (!(amount > L.bid)) return window.BL.toast(`Bid more than $${L.bid}.`, true);
    if (amount > maxBid(u)) return window.BL.toast(`Your max bid is $${maxBid(u)} (you need $1 for each other open spot).`, true);
    L.bid = amount; L.leader = u;
    computersBid();
  }
  function pass() { S.lot.out.push(me()); computersBid(); }
  function autoFinish() {
    S.auto = true;
    if (S.lot) {   // let the computer bid for you on this one too
      const u = me();
      S.lot.maxes[u] = Math.min(maxBid(u), Math.round(players[S.lot.id].value * rand(0.8, 1.2) * need(u, players[S.lot.id])));
      computersBid();
    } else nextLot();
  }

  // ---------- drawing ----------
  const tierCounts = (t) => {
    const n = { T1: 0, T2: 0, T3: 0 };
    for (const r of t.roster) n[players[r.id].tier]++;
    return n;
  };
  const playerLine = (p) => `<span class="tier-emoji" aria-label="${esc(p.tier)}">${D.emoji[p.tier] || ""}</span>
    <span class="who"><b>${esc(p.name)}</b><span class="muted small">${esc(p.team || "FA")} · ${esc(p.pos.join("/") || "–")}</span></span>`;

  function render() {
    const u = me();
    $("dr-auto").hidden = !S || S.done || S.auto;
    ["dr-avail-card", "dr-teams-card", "dr-log-card"].forEach((id) => ($(id).hidden = !S));
    if (!S) { $("dr-status").textContent = ""; $("dr-lot").hidden = true; return; }
    const mt = S.teams[u];
    $("dr-status").textContent = S.done ? "Draft over. Scroll down to see every team."
      : `${mt.name}: $${mt.budget} left · ${left(u)} spots left · max bid $${maxBid(u)}`;

    // On the block
    const lot = $("dr-lot"), body = $("dr-lot-body");
    lot.hidden = S.done;
    if (S.lot) {
      const L = S.lot, p = players[L.id];
      const leading = L.leader === u;
      $("dr-lot-title").textContent = "On the block";
      body.innerHTML = `<div class="tier-row band-${p.rank <= 50 ? Math.ceil(p.rank / 10) : 0}">
          <span class="num rank">${p.rank}</span>${playerLine(p)}<span class="owner small">Value $${p.value}</span></div>
        <p><b>High bid: $${L.bid}</b> · ${esc(S.teams[L.leader].name)}${leading ? " (you)" : ""}</p>
        ${leading ? `<p class="muted small">You're winning. The computer teams are done bidding on him.</p>` : `
        <div class="row">
          ${[1, 5, 10].map((n) => `<button type="button" data-bid="${L.bid + n}" ${L.bid + n > maxBid(u) ? "disabled" : ""}>$${L.bid + n}</button>`).join("")}
          <input type="number" id="dr-amount" min="${L.bid + 1}" max="${maxBid(u)}" value="${Math.min(L.bid + 1, maxBid(u))}" style="width: 90px" aria-label="Your bid">
          <button class="primary" type="button" id="dr-bid">Bid</button>
          <button type="button" id="dr-pass">Pass</button>
        </div>`}`;
    } else if (yourTurnToNominate()) {
      $("dr-lot-title").textContent = "Your turn: put a player up";
      body.innerHTML = `<p class="muted small">Tap a player in "Players left", or pick here.</p>
        <div class="row">
          <select id="dr-nom" aria-label="Player">${available().map((p) =>
            `<option value="${p.id}">${p.rank}. ${D.emoji[p.tier] || ""} ${esc(p.name)} ($${p.value})</option>`).join("")}</select>
          <label>Opening bid $<input type="number" id="dr-open" min="1" max="${maxBid(u)}" value="1" style="width: 80px"></label>
          <button class="primary" type="button" id="dr-nominate">Put him up</button>
        </div>`;
    } else body.innerHTML = "";

    // Players left
    const q = ($("dr-search").value || "").trim().toLowerCase();
    $("dr-avail").innerHTML = available().filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 80).map((p) =>
      `<li class="tier-row band-${p.rank <= 50 ? Math.ceil(p.rank / 10) : 0}" data-id="${p.id}">
        <span class="num rank">${p.rank}</span>${playerLine(p)}<span class="owner small">$${p.value}</span></li>`).join("");

    // Teams
    $("dr-teams").innerHTML = S.order.map((i) => {
      const t = S.teams[i], n = tierCounts(t);
      const power = n.T1 > 3 || n.T2 > 3;
      return `<div class="team-board${t.me ? " mine" : ""}">
        <div class="row"><b>${esc(t.name)}${t.me ? " (you)" : ""}</b><span class="muted small">$${t.budget} left · ${left(i)} spots</span>
          <span class="small">${D.emoji.T1} ${n.T1} · ${D.emoji.T2} ${n.T2} · ${D.emoji.T3} ${n.T3}</span>
          ${power ? `<span class="pill ok">⚡ Power Play</span>` : ""}</div>
        <ul class="feed small">${t.roster.map((r) => { const p = players[r.id];
          return `<li><span>${D.emoji[p.tier] || ""} ${esc(p.name)} <span class="muted">${esc(p.pos.join("/"))}</span> · $${r.price}</span></li>`; }).join("")
          || `<li class="muted">Nobody yet</li>`}</ul></div>`;
    }).join("");

    // Log
    $("dr-log").innerHTML = S.log.filter((l) => l.kind === "sold").slice(0, 15).map((l) =>
      `<li><span>${l.me ? "✅ " : ""}${esc(l.text)}</span></li>`).join("") || `<li class="muted">Nothing sold yet.</li>`;
  }

  // ---------- wiring ----------
  document.addEventListener("click", (e) => {
    const el = e.target.closest("button, [data-id]");
    if (!el || !S) return;
    if (el.dataset.bid) bid(el.dataset.bid);
    else if (el.id === "dr-bid") bid($("dr-amount").value);
    else if (el.id === "dr-pass") pass();
    else if (el.id === "dr-nominate") nominate($("dr-nom").value, $("dr-open").value);
    else if (el.dataset.id && yourTurnToNominate()) {
      $("dr-nom").value = el.dataset.id;
      $("dr-lot").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  $("dr-new").addEventListener("click", () => {
    if (S && !S.done && !confirm("Start over? This practice draft will be lost.")) return;
    newDraft();
  });
  $("dr-auto").addEventListener("click", autoFinish);
  $("dr-search").addEventListener("input", render);

  S = load();
  if (S && S.teams && S.teams.length) { price(S.teams.length); render(); } else S = null;
  window.BLDraft = { state: () => S, players, newDraft, bid, pass, nominate, autoFinish };   // for testing
})();
