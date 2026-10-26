// Masco-Pets: a Tamagotchi-style team mascot pet for the picked team. No accounts.
//   Device  - every change autosaves on this device (localStorage bl.pet.<team id>).
//   League  - the pet is pushed to the database now and then (auto, Sync now, or the
//             Save to league button), so every device and the home page see one pet per team.
//   Docked  - sits in the header next to Sync now, like a profile button.
//   Floating- once the header scrolls away it pins top-right, and tucks into the
//             right edge whenever it would cover page content.
//   Visiting- click any team's mascot on the Home wall to see its pet and play with it in
//             practice mode: a throwaway copy, nothing saves or changes the real pet.
//   🪙 / 🏀 - tokens are spent on the Balling buttons; 🏀 points are earned (fx.points, no cap).
//             Each league week (Monday to Sunday) the most points earns weekly.top bonus
//             points, the fewest weekly.bottom, straight line in between.
// Mini-games (trivia, Gravity Pong, roulette) live in pet-games.js and use window.GP.
(function () {
  const C = window.PET_CONFIG;
  const slot = document.getElementById("gp-slot");
  if (!C || !slot) return;

  const get = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const del = (k) => { try { localStorage.removeItem(k); } catch {} };

  const flag = new URLSearchParams(location.search).get("pet");
  if (flag === "on") set("bl.pet.preview", "1");
  if (flag === "off") del("bl.pet.preview");
  if (!C.enabled && !get("bl.pet.preview")) return;

  const TEAMS = JSON.parse(slot.dataset.teams || "[]");
  // Meter keys stay hunger/happy/energy/power (saved pets carry over); names come from config.meters.
  const METERS = ["hunger", "happy", "energy", "power"];
  const meter = (k) => (C.meters && C.meters[k]) || { icon: "", label: k };
  const PROPS = { drink: "🥤", dribble: "🏀", shoot: "🏀", dunk: "🏀", poise: "✨", rest: "⏱️", laps: "💨", cheer: "🎉" };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, hi) => Math.max(0, Math.min(hi, v));
  const today = () => new Date().toDateString();
  // League week id = the date of that week's Monday (local time).
  function weekId(t = Date.now()) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ---------- state ----------
  const team = () => TEAMS.find((t) => t.id === (window.BL ? BL.viewTeam() : get("bl.viewTeam"))) || null;
  // Saved by team id so a renamed team keeps its pet; older saves used the abbreviation.
  const key = (t) => "bl.pet." + t.id;
  const OLD_ABV = { jme: "jst", mps: "srl" };   // JST became JME "Bucket Squad" (2026-10-24); SRL became MPS (2026-10-25)

  function fresh() {
    const now = Date.now();
    return { hunger: 100, happy: 100, energy: 100, power: 0, tokens: C.tokens.daily,
      lastUpdated: now, tokenDay: today(), lastFreeToken: 0,
      egg: false, notice: "",             // egg = not hatched yet; notice = one-time message (e.g. benched)
      actedAt: 0, pushedAt: 0,            // last real change / last save to the league
      correct: [], seen: [],              // trivia: times of right answers, question ids already asked
      trivia: { right: 0, wrong: 0 },     // current trivia run (levels up every 10 right, resets after 5 wrong)
      fireUntil: 0, superUntil: 0,        // timed effects
      spinDay: "", freeSpins: 0,          // roulette
      drop: 0, nextDrop: now + dropGap(), // mystery box
      gifts: [], pongBest: 0,
      points: 0, wk: weekId(), wkPts: 0,  // 🏀 points: all-time total, this league week
      bornAt: 0,                          // first hatch (for the average 🏀 per week)
      lastWk: null, bonusWk: "" };        // last finished week { id, pts }; week whose bonus is settled
  }
  // A team's first visit on a device starts as an egg (unless the league already has its pet).
  function load(t) {
    let s; try { s = JSON.parse(get(key(t)) || get("bl.pet." + t.abv) || get("bl.pet." + (OLD_ABV[t.abv] || t.abv))); } catch {}
    return catchUp(Object.assign(fresh(), s || { egg: true }));
  }
  function save() { if (cur && !visit) set(key(cur), JSON.stringify(st)); }
  const dropGap = () => C.drops.everyMin * 60000 * (0.6 + Math.random() * 0.8);

  // Benched (Hunger or Happy hit 0): sent back to the egg and rehatched brand new with a
  // fresh token balance. Claimed gifts and asked questions are kept so they don't repeat,
  // and so are the 🏀 points (the weekly race isn't lost to a bad day).
  function benchReset(s) {
    const keep = { gifts: s.gifts, seen: s.seen, points: s.points, wk: s.wk, wkPts: s.wkPts, lastWk: s.lastWk, bonusWk: s.bonusWk, bornAt: s.bornAt };
    for (const k of Object.keys(s)) delete s[k];
    return Object.assign(s, fresh(), keep, { notice: "benched", actedAt: Date.now() });
  }

  // Time passing: decay since lastUpdated, the midnight token refill, mystery drops.
  // Eggs don't get hungry.
  function catchUp(s) {
    const now = Date.now(), hrs = s.egg ? 0 : Math.max(0, (now - s.lastUpdated) / 3.6e6);
    for (const k of ["hunger", "happy", "energy"]) s[k] = clamp(s[k] - C.decayPerHour[k] * hrs, 100);
    s.lastUpdated = now;
    if (s.tokenDay !== today()) {
      s.tokens = Math.min(C.tokens.max, Math.max(s.tokens, C.tokens.daily));
      s.tokenDay = today();
    }
    if (s.wk !== weekId()) {
      if (s.wk) s.lastWk = { id: s.wk, pts: s.wkPts || 0 };
      s.wk = weekId(); s.wkPts = 0;
    }
    if (!s.egg && !s.bornAt) s.bornAt = now;
    if (!s.egg && (s.hunger <= 0 || s.happy <= 0)) benchReset(s);
    topUp(s);
    if (!s.drop && !s.egg && now >= s.nextDrop) s.drop = now;
    return s;
  }

  // Never broke: a pet that runs out of tokens gets tokens.floor back, so it can always keep playing.
  function topUp(s) {
    const floor = C.tokens.floor || 0;
    if (s.egg || s.tokens >= 1 || !floor) return false;
    s.tokens = floor;
    return true;
  }

  const maxPower = () => C.maxPower;
  const isFire = (s = st) => !!s && Date.now() < s.fireUntil;
  const isSuper = (s = st) => !!s && (s.power >= maxPower() || Date.now() < s.superUntil);
  // How close to 🔥 On Fire (right trivia answers in the window) and 🌟 Super Saiyan (Dunking).
  const fireHits = (s = st) => (s.correct || []).filter((t) => t > Date.now() - C.trivia.windowHours * 3.6e6).length;
  // Average 🏀 points per week since the first hatch (a pet younger than a week counts as one week).
  const perWeek = (s = st) => Math.round((s.points || 0) / Math.max(1, (Date.now() - (s.bornAt || Date.now())) / 6.048e8));

  // Apply meter changes and 🏀 points. Dunking gains get the league-wide boost from config.
  function apply(fx) {
    if (fx.points > 0) { st.points = (st.points || 0) + fx.points; st.wkPts = (st.wkPts || 0) + fx.points; }
    for (const [k, v] of Object.entries(fx)) {
      if (!(k in STAT_MAX)) continue;
      const gain = k === "power" && v > 0 ? v * (C.powerBoost || 1) : v;
      st[k] = clamp(st[k] + gain, STAT_MAX[k]());
    }
    if (st.hunger <= 0 || st.happy <= 0) benchReset(st);
  }
  const STAT_MAX = { hunger: () => 100, happy: () => 100, energy: () => 100, power: maxPower, tokens: () => C.tokens.max };

  // Prizes from games, the roulette, mystery boxes and commissioner gifts.
  // fx keys: tokens, power, hunger, happy, energy, fireHours, superHours, spins.
  function grant(fx, cheer = true) {
    st = catchUp(st);
    const now = Date.now();
    apply(fx);
    if (fx.fireHours) st.fireUntil = Math.max(st.fireUntil, now) + fx.fireHours * 3.6e6;
    if (fx.superHours) st.superUntil = Math.max(st.superUntil, now) + fx.superHours * 3.6e6;
    if (fx.spins) st.freeSpins += fx.spins;
    touch();
    if (cheer && !busy) play("cheer", 1200);
    render();
  }
  function prizeText(fx) {
    const parts = [];
    if (fx.points) parts.push(`+${fx.points} 🏀`);
    if (fx.tokens) parts.push(`${fx.tokens > 0 ? "+" : ""}${fx.tokens} 🪙`);
    if (fx.power) parts.push(`+${Math.round(fx.power * (C.powerBoost || 1))} ${meter("power").icon}`);
    if (fx.energy) parts.push(`+${fx.energy} ${meter("energy").icon}`);
    if (fx.hunger) parts.push(`+${fx.hunger} ${meter("hunger").icon}`);
    if (fx.happy) parts.push(`+${fx.happy} ${meter("happy").icon}`);
    if (fx.fireHours) parts.push(`🔥 On Fire ${fx.fireHours}h`);
    if (fx.superHours) parts.push(`🌟 Super Saiyan ${fx.superHours}h`);
    if (fx.spins) parts.push(`+${fx.spins} free spin`);
    return parts.join(" · ") || "Nothing this time!";
  }
  function pickWeighted(list) {
    let r = Math.random() * list.reduce((a, p) => a + (p.weight || 1), 0);
    for (const p of list) { r -= p.weight || 1; if (r <= 0) return p; }
    return list[list.length - 1];
  }

  // Any real change: autosave on the device, and mark it for the next league save.
  function touch() { st.actedAt = Date.now(); save(); maybePush("auto"); }

  const costOf = (id) => C.actions[id].cost;
  function blocked(id) {
    const a = C.actions[id];
    if (busy) return "Hang on…";
    if (st.tokens < costOf(id)) return "Not enough tokens.";
    for (const [k, min] of Object.entries(a.needs || {})) if (st[k] < min) return `Needs ${meter(k).icon} ${meter(k).label} ${min}+`;
    return "";
  }

  function act(id) {
    st = catchUp(st);
    if (blocked(id)) return;
    const a = C.actions[id];
    st.tokens -= costOf(id);
    apply(a.fx);
    if (topUp(st)) toast(`🪙 Out of tokens! Here's ${C.tokens.floor} on the house.`);
    touch();
    if (st.notice === "benched") { show(resting()); render(); return; }
    if (id === "laps") runLaps(); else play(a.anim, 1500);
    render();
  }

  // Rehatch: back to an unhatched egg, here and in the league (the wall shows "Not hatched yet").
  function rehatch() {
    if (!confirm(`Rehatch ${cur.name}'s masco-pet? It goes back to an egg and starts over.`)) return;
    benchReset(st);
    Object.assign(st, { egg: true, notice: "" });
    save(); show(resting()); render();
    push("manual");
  }
  // New avatar: the GM pastes an image link; it lands as a private request on the LM desk.
  async function askAvatar() {
    const note = (prompt(`Paste image link of your new avatar (${cur.name}):`) || "").trim();
    if (!note) return;
    if (!/^https?:\/\/\S+$/i.test(note)) { toast("That doesn't look like a link. Copy the image address and paste it here."); return; }
    try {
      const r = await window.BL.post("/api/pet", { op: "avatar_request", team_id: cur.id, note });
      toast(r && r.already ? "🎨 Updated your request with the new link!" : "🎨 Sent to the commissioner's LM desk!");
    } catch (e) { toast(e.message || "Couldn't reach the league. Try again later."); }
  }

  function hatch() {
    Object.assign(st, { egg: false, lastUpdated: Date.now(), bornAt: st.bornAt || Date.now(), tokens: Math.max(st.tokens, C.tokens.daily), nextDrop: Date.now() + dropGap() });
    touch(); play("cheer", 1500);
  }

  function freeToken() {
    if (freeWait() > 0 || st.tokens >= C.tokens.max) return;
    st.tokens += 1; st.lastFreeToken = Date.now(); touch(); render();
  }
  const freeWait = () => (C.tokens.freeCooldownMin > 0 ? Math.max(0, st.lastFreeToken + C.tokens.freeCooldownMin * 60000 - Date.now()) : 0);

  function openDrop() {
    if (!st.drop) return;
    const p = pickWeighted(C.drops.prizes);
    st.drop = 0; st.nextDrop = Date.now() + dropGap();
    grant(p.fx);
    toast(`🎁 ${p.label}! ${prizeText(p.fx)}`);
  }

  // ---------- animation ----------
  // Real frames when config.frames lists them, otherwise the main sprite plus a CSS move.
  let busy = false, frameTimer = 0, anim = "idle";
  const spriteUrl = (t, a, n) => (a ? `/pet/sprites/${t.abv}_${a}_${n}.png` : `/pet/sprites/${t.abv}.png`);
  const frameCount = (a) => (cur && C.frames[cur.abv] && C.frames[cur.abv][a]) || 0;

  function show(a) {
    anim = a;
    clearInterval(frameTimer);
    document.querySelectorAll(".gp-mine, .gp-screen").forEach((el) => (el.dataset.anim = a));
    document.querySelectorAll(".gp-mine .gp-prop").forEach((el) => (el.textContent = PROPS[a] || ""));
    const n = frameCount(a);
    const imgs = document.querySelectorAll(".gp-mine img");
    if (!n) { imgs.forEach((i) => setSrc(i, spriteUrl(cur))); return; }
    let f = 1;
    const step = () => { imgs.forEach((i) => setSrc(i, spriteUrl(cur, a, f))); f = (f % n) + 1; };
    step();
    if (n > 1) frameTimer = setInterval(step, C.frameMs);
  }
  const resting = () => "idle";
  function play(a, ms) {
    busy = true; show(a); render();
    setTimeout(() => { busy = false; show(resting()); render(); }, ms);
  }

  // No art for this team yet -> basketball stand-in (see .gp-noart in pet.css).
  // Missing files are remembered so the page stops asking for them.
  const missing = new Set();
  function setSrc(img, url) {
    const box = img.closest(".gp-sprite");
    if (missing.has(url)) { box.classList.add("gp-noart"); img.removeAttribute("src"); return; }
    if (img.getAttribute("src") === url) return;
    box.classList.remove("gp-noart");
    img.src = url;
  }
  document.addEventListener("error", (e) => {
    const s = e.target.closest && e.target.closest(".gp-sprite");
    if (e.target.tagName !== "IMG" || !s) return;
    missing.add(e.target.getAttribute("src"));
    s.classList.add("gp-noart");
  }, true);

  // One sprite: aura + flames (shown by .gp-fire / .gp-super), picture, emoji prop.
  function spriteHTML(src, { mine = false, alt = "", a = "idle" } = {}) {
    const gone = !src || missing.has(src);
    return `<span class="gp-sprite${mine ? " gp-mine" : ""}${gone ? " gp-noart" : ""}" data-anim="${a}">` +
      `<span class="gp-aura" aria-hidden="true"></span><span class="gp-flames" aria-hidden="true"><i></i><i></i><i></i><i></i></span>` +
      `<img alt="${esc(alt)}"${gone ? "" : ` src="${src}"`}><span class="gp-prop" aria-hidden="true">${mine ? PROPS[a] || "" : ""}</span></span>`;
  }
  const fxClass = (s) => (isFire(s) ? " gp-fire" : "") + (isSuper(s) ? " gp-super" : "");

  // The pet leaves its box and runs one lap around the edge of the screen.
  function runLaps() {
    busy = true; show("laps"); render();
    const done = () => { busy = false; avatar.classList.remove("gp-away"); show(resting()); render(); };
    if (reduced) { play("laps", 1200); return; }
    const from = avatar.getBoundingClientRect();
    const s = Math.round(from.width), pad = 12;
    const W = innerWidth - s - pad, H = innerHeight - s - pad;
    const runner = document.createElement("div");
    runner.className = "gp-runner" + fxClass(st);
    runner.style.width = runner.style.height = s + "px";
    runner.innerHTML = spriteHTML(spriteUrl(cur), { a: "laps" }) + `<span class="gp-ball">🏀</span>`;
    document.body.appendChild(runner);
    avatar.classList.add("gp-away");
    const pts = [[from.left, from.top, 1], [pad, pad, -1], [pad, H, -1], [W, H, 1], [W, pad, 1], [from.left, from.top, 1]];
    const kf = pts.map(([x, y, dir]) => ({ transform: `translate(${x}px, ${y}px) scaleX(${dir})` }));
    const run = runner.animate(kf, { duration: 4200, easing: "linear" });
    run.onfinish = () => { runner.remove(); done(); };
  }

  // ---------- league save (database) ----------
  // GET /api/pet brings the league copy of every pet, commissioner gifts and tuning.
  // A pet syncs every online.autoPushMin minutes (hourly; 0 = off) while a page is open,
  // and right away when anyone presses Sync now ("Sync stats + pet") or Save to league.
  // Newest real change wins.
  let league = null, online = false, pushing = false, pulledAt = Date.now();
  async function pull(force) {
    try {
      const cached = !force && JSON.parse(sessionStorage.getItem("bl.pet.league") || "null");
      if (cached && Date.now() - cached.at < 120000) league = cached.data;
      else {
        const out = await fetch("/api/pet").then((r) => r.json());
        if (!out.ok) throw new Error(out.error);
        league = out.data;
        try { sessionStorage.setItem("bl.pet.league", JSON.stringify({ at: Date.now(), data: league })); } catch {}
      }
      online = true; pulledAt = Date.now();
      tune(league.settings || {});
      adopt();
      weeklyBonus();
      decorate();
      render();
    } catch { online = false; }
  }
  // Commissioner tuning from the Pet desk overrides config.js.
  function tune(over, into = C) {
    for (const [k, v] of Object.entries(over)) {
      if (v && typeof v === "object" && !Array.isArray(v) && into[k] && typeof into[k] === "object") tune(v, into[k]);
      else into[k] = v;
    }
  }
  // If another device changed this team's pet more recently, take its copy.
  function adopt() {
    if (!league || !cur || !st || visit) return;
    const row = (league.pets || []).find((p) => p.abv === cur.abv);
    if (!row || !row.state || (row.state.actedAt || 0) <= (st.actedAt || 0)) return;
    st = catchUp(Object.assign(fresh(), row.state, { pushedAt: row.state.actedAt }));
    save(); show(resting());
  }
  // Weekly bonus, settled by each team's own device once the week is over: the most 🏀
  // points that week gets weekly.top, the fewest weekly.bottom, straight line in between.
  // A team with a league pet that earned nothing counts as 0. It goes on the all-time total.
  const ptsIn = (s, w) => (!s ? null : s.wk === w ? s.wkPts || 0 : s.lastWk && s.lastWk.id === w ? s.lastWk.pts || 0 : null);
  function weeklyBonus() {
    if (!league || !cur || !st || visit) return;
    const w = weekId(Date.now() - 7 * 864e5);
    if (st.bonusWk === w) return;
    const mine = ptsIn(st, w);
    st.bonusWk = w;
    const all = (league.pets || []).filter((p) => p.abv !== cur.abv && p.state).map((p) => ptsIn(p.state, w) || 0);
    all.push(mine || 0);
    const hi = Math.max(...all), lo = Math.min(...all), W = C.weekly || { top: 25, bottom: 10 };
    if (mine == null || hi <= 0) { save(); return; }   // pet didn't exist that week, or nobody played
    const bonus = Math.round(hi === lo ? W.top : W.bottom + ((W.top - W.bottom) * (mine - lo)) / (hi - lo));
    st.points = (st.points || 0) + bonus;
    st.lastBonus = { id: w, pts: bonus, scored: Math.round(mine) };
    touch();
    toast(`🏆 Weekly bonus: +${bonus} 🏀 (you scored ${Math.round(mine)} last week${mine === hi ? ", the most in the league!" : ""})`);
  }

  // ---------- visiting another team's pet (practice mode) ----------
  // A copy of the league's pet; everything works on the copy and none of it is saved.
  let visit = null;
  function visitPet(abv) {
    const t = TEAMS.find((x) => x.abv === String(abv).toLowerCase());
    if (!t) return;
    if (visit) leaveVisit();
    if (cur && cur.abv === t.abv) { open(true); return; }
    const row = league && (league.pets || []).find((p) => p.abv === t.abv);
    visit = { t, home: { cur, st } };
    cur = t;
    st = catchUp(Object.assign(fresh(), row && row.state ? JSON.parse(JSON.stringify(row.state)) : { egg: true }));
    tab = "care"; show(resting()); open(true);
  }
  function leaveVisit() {
    if (!visit) return;
    ({ cur, st } = visit.home);
    visit = null;
    if (cur) show(resting());
    render();
  }

  // Team pages: any element with data-pet-team="<abv>" glows with that team's effects
  // (gp-flame-on = On Fire, gp-super-on = Super Saiyan, both = Superman fire mode).
  function decorate() {
    const now = Date.now(), live = (t) => !!t && Date.parse(t) > now;
    for (const el of document.querySelectorAll("[data-pet-team]")) {
      const row = (league.pets || []).find((p) => p.abv === el.dataset.petTeam.toLowerCase());
      if (!row) continue;
      el.classList.toggle("gp-flame-on", live(row.fire_until));
      el.classList.toggle("gp-super-on", Number(row.power) >= maxPower() || live(row.super_until));
    }
  }

  async function push(kind) {
    if (!cur || !st || pushing || visit) return false;
    pushing = true;
    try {
      const sent = Object.assign({}, st, { pushedAt: Date.now() });
      const row = await window.BL.post("/api/pet", { op: "push", team_id: cur.id, kind, device_id: window.BL.deviceId(), state: sent });
      online = true;
      if (row && row.state && (row.state.actedAt || 0) > (st.actedAt || 0)) {
        st = catchUp(Object.assign(fresh(), row.state)); show(resting());
      } else st.pushedAt = sent.pushedAt;
      save(); sessionStorage.removeItem("bl.pet.league");
      return true;
    } catch { return false; } finally { pushing = false; render(); }
  }
  function maybePush(kind) {
    if (!online || !st || visit) return;
    const due = C.online.autoPushMin > 0 && Date.now() - (st.pushedAt || 0) >= C.online.autoPushMin * 60000;
    if (kind !== "auto" || (due && st.actedAt > st.pushedAt)) push(kind);
  }
  // Sync now: save this pet, then bring back everyone else's (and any new gifts).
  document.addEventListener("click", async (e) => {
    if (!(e.target.closest && e.target.closest("#sync-now")) || !st) return;
    if (st.actedAt) await push("sync");
    await pull(true);
  });

  function claimGift(id) {
    const g = (league && league.gifts || []).find((x) => String(x.id) === String(id));
    if (!g || st.gifts.includes(g.id)) return;
    st.gifts.push(g.id);
    grant(g.fx || {});
    toast(`🎁 ${g.title}: ${prizeText(g.fx || {})}`);
  }
  const openGifts = () => (league && league.gifts || []).filter((g) =>
    !st.gifts.includes(g.id) && (!g.team_id || g.team_id === cur.id));

  // ---------- UI ----------
  let cur = null, st = null, tab = "care";
  const avatar = document.createElement("button");
  avatar.type = "button";
  avatar.className = "gp-avatar";
  avatar.setAttribute("aria-expanded", "false");
  avatar.setAttribute("aria-controls", "gp-panel");
  avatar.innerHTML = spriteHTML("", { mine: true }) + `<span class="gp-badge" hidden>!</span>`;

  const panel = document.createElement("section");
  panel.id = "gp-panel";
  panel.className = "gp-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Masco-Pet");
  panel.hidden = true;

  slot.hidden = false;
  slot.appendChild(avatar);
  document.body.appendChild(panel);

  function toast(msg) {
    if (window.BL && BL.toast) BL.toast(msg);
  }

  function moodLine() {
    if (st.egg) return visit ? "Not hatched yet. Hatch it to practice!" : "An egg! Hatch it, or 💾 Save it as an egg.";
    if (isFire() && isSuper()) return "SUPERMAN FIRE MODE!!";
    if (isSuper()) return "SUPER SAIYAN! Max level power!";
    if (isFire()) return "YOU'RE ON FIRE!";
    const low = ["hunger", "happy", "energy"].reduce((a, b) => (st[a] <= st[b] ? a : b));
    if (st[low] > 70) return "Feeling like an All-Star.";
    if (st[low] > 35) return "Doing fine. Could use a little work.";
    return { hunger: "Heavy legs! Work on Agility.", happy: "Rattled! Take a Time Out.", energy: "Cold hand. Get some shots up." }[low];
  }

  function bars() {
    return METERS.map((k) => {
      const m = meter(k), max = k === "power" ? maxPower() : 100, v = Math.round(st[k]), pct = Math.round((v / max) * 100);
      return `<div class="gp-stat${pct <= 20 && k !== "power" ? " low" : ""}${k === "power" ? " gp-dunk" : ""}" title="${m.label} ${v}/${max}">
        <span>${m.icon}<span class="gp-lbl"> ${m.label}</span></span><span class="gp-bar"><i style="width:${pct}%"></i></span><b class="num">${v}</b></div>`;
    }).join("");
  }

  function buttons() {
    return Object.keys(C.actions).map((id) => {
      const a = C.actions[id], why = blocked(id), cost = costOf(id), pts = a.fx.points ? ` · +${a.fx.points}🏀` : "";
      return `<button type="button" data-act="${id}" title="${a.label}: 🪙${cost}${pts}${why ? ` (${why})` : ""}" aria-label="${a.label}, ${cost} tokens"${why ? " disabled" : ""}>
        <span class="gp-ico">${a.icon}</span><span class="gp-lbl">${a.label}</span><small>🪙${cost}</small></button>`;
    }).join("");
  }

  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
  };
  const until = (t) => {
    const m = Math.max(1, Math.round((t - Date.now()) / 60000));
    return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
  };

  // One-line notes under the screen (benched, commissioner gifts). The mystery box sits on the screen.
  function treats() {
    const out = [];
    if (st.notice === "benched") out.push(`<button type="button" class="gp-chip gp-benched" data-notice>😵 Benched: rehatched with ${C.tokens.daily} 🪙. <b>OK</b></button>`);
    for (const g of openGifts()) out.push(`<button type="button" class="gp-chip" data-gift="${g.id}">🎁 Gift: <b>${esc(g.title)}</b></button>`);
    return out.length ? `<div class="gp-chips">${out.join("")}</div>` : "";
  }

  function gamesTab() {
    const G = window.GP_GAMES;
    if (!G) return `<p class="gp-foot">Games are loading…</p>`;
    const full = st.tokens >= C.tokens.max;
    const free = `<button type="button" class="gp-game-btn" data-free ${full ? "disabled" : ""}>
        <span class="gp-ico">🪙</span><span><b>Free token</b><small data-free-sub>${full ? "Tokens full" : "+1 🪙 any time"}</small></span></button>`;
    return `<div class="gp-games">${free}${G.cards().map((g) => `
      <button type="button" class="gp-game-btn" data-game="${g.id}" ${g.disabled ? `disabled title="${esc(g.disabled)}"` : ""}>
        <span class="gp-ico">${g.icon}</span><span><b>${g.label}</b><small>${g.sub}</small></span></button>`).join("")}</div>`;
  }

  function render() {
    const t = visit ? visit.t : team();
    if (!t) {
      cur = st = null;
      avatar.classList.remove("gp-fire", "gp-super");
      avatar.classList.add("gp-egg");
      avatar.classList.remove("gp-shell");
      avatar.setAttribute("aria-label", "Masco-Pet: pick your team");
      avatar.querySelector(".gp-badge").hidden = true;
      if (!panel.hidden) paint(`
        <header class="gp-head"><b>Masco-Pets</b><button type="button" class="gp-x" aria-label="Close">×</button></header>
        <p class="gp-pick-msg">Pick your team to hatch your masco-pet:</p>
        <div class="gp-pick">${TEAMS.map((x) => `<button type="button" data-team="${x.id}">${esc(x.name)}</button>`).join("")}</div>`);
      return;
    }
    if (!cur || cur.abv !== t.abv) { cur = t; st = load(t); save(); adopt(); show(resting()); }
    avatar.classList.toggle("gp-egg", !!st.egg);
    avatar.classList.toggle("gp-shell", !!st.egg);
    avatar.classList.toggle("gp-fire", isFire());
    avatar.classList.toggle("gp-super", isSuper());
    avatar.setAttribute("aria-label", `${t.name} masco-pet`);
    const badge = avatar.querySelector(".gp-badge");
    const gift = st.drop || openGifts().length;
    badge.hidden = !(gift || st.egg || st.notice || Math.min(st.hunger, st.happy, st.energy) <= 20);
    badge.textContent = gift ? "🎁" : "!";
    badge.classList.toggle("gift", !!gift);
    if (!busy && anim !== resting()) show(resting());
    if (panel.hidden) return;

    const src = avatar.querySelector(".gp-sprite img").getAttribute("src") || spriteUrl(cur);
    // Progress border around the screen: outer gold ring = Dunking toward 🌟 Super Saiyan,
    // inner orange ring = right trivia answers toward 🔥 On Fire.
    const need = C.trivia.need, hits = Math.min(need, fireHits()), supPct = Math.min(100, Math.round((st.power / maxPower()) * 100));
    const fireTxt = isFire() && st.fireUntil > Date.now() ? `🔥 ${until(st.fireUntil)}` : `🔥 ${hits}/${need}`;
    const supTxt = isSuper() ? (st.power >= maxPower() ? "🌟 Max" : `🌟 ${until(st.superUntil)}`) : `🌟 ${supPct}%`;
    const fire = isFire() ? 1 : hits / need, sup = isSuper() ? 1 : supPct / 100;
    const stats = st.egg ? "" : `<p class="gp-pts"><span>🏀 <b>${perWeek()}</b>/w · ${Math.round(st.points || 0)}</span><span>${fireTxt} · ${supTxt}</span></p>`;
    const screen = `<div class="gp-screen gp-ring${fxClass(st)}" data-anim="${anim}" style="--fire:${fire.toFixed(3)};--sup:${sup.toFixed(3)}"
        title="Outer ring: ${meter("power").label} toward Super Saiyan. Inner ring: trivia toward On Fire.">
        <span class="gp-tok" title="Tokens">🪙 <b class="num">${Math.floor(st.tokens)}</b></span>
        ${st.drop && !visit && !st.egg ? `<button type="button" class="gp-box" data-drop aria-label="Open the mystery box">🎁</button>` : ""}
        <button type="button" class="gp-x" aria-label="Close">×</button>
        ${st.egg ? `<span class="gp-egg-big" aria-hidden="true">🥚</span>` : spriteHTML(src, { mine: true, alt: `${t.name} masco-pet`, a: anim })}
        <span class="gp-hoop" aria-hidden="true"><i></i></span><span class="gp-shotball" aria-hidden="true">🏀</span>
        <p class="gp-mood">${moodLine()}</p>
        ${stats}
      </div>`;
    const foot = visit ? "" : `<div class="gp-footbar">
        <button type="button" data-push ${pushing ? "disabled" : ""}>💾 Save</button>
        ${st.egg ? "" : `<button type="button" data-rehatch>🥚 Rehatch</button>`}
      </div>
      <button type="button" class="gp-link gp-avatar-link" data-avatar>🎨 Paste image link of your new avatar</button>
      <p class="gp-foot" data-saved></p>`;
    if (st.egg) {
      paint(`${screen}<button type="button" class="primary gp-hatch" data-hatch>🐣 Hatch!</button>${foot}`);
      countdown();
      return;
    }
    paint(`${screen}
      ${visit ? "" : treats()}
      <div class="gp-tabs" role="tablist">
        <button type="button" role="tab" data-tab="care" aria-selected="${tab === "care"}">🏀 Balling</button>
        <button type="button" role="tab" data-tab="games" aria-selected="${tab === "games"}">🕹️Earn-Points</button>
      </div>
      ${tab === "care" ? `<div class="gp-stats">${bars()}</div><div class="gp-actions">${buttons()}</div>` : gamesTab()}
      ${foot}`);
    countdown();
  }

  // Live bits that change every second are set in place, so the panel (and any
  // animation in it) isn't redrawn every tick.
  function countdown() {
    const b = panel.querySelector("[data-free]"), sub = panel.querySelector("[data-free-sub]"), saved = panel.querySelector("[data-saved]");
    if (b && sub && st.tokens < C.tokens.max) {
      const wait = freeWait(), mm = Math.floor(wait / 60000), ss = String(Math.floor((wait % 60000) / 1000)).padStart(2, "0");
      b.disabled = wait > 0;
      sub.textContent = wait ? `Next one in ${mm}:${ss}` : "+1 🪙 any time";
    }
    if (saved) saved.textContent = st.pushedAt ? `Saved to the league ${ago(st.pushedAt)}. Also saves hourly and with Sync.`
      : online ? "Not saved to the league yet." : "Saved on this device.";
  }

  // Redraw the panel only when it changed, and keep keyboard focus on the same button.
  let painted = "";
  function paint(html) {
    if (html === painted) return;
    const f = document.activeElement, sel = f && panel.contains(f) && f.dataset
      ? Object.keys(f.dataset).map((k) => `[data-${k}${f.dataset[k] ? `="${f.dataset[k]}"` : ""}]`).join("") : "";
    panel.innerHTML = painted = html;
    fit();
    if (sel) (panel.querySelector(sel) || panel.querySelector(".gp-x"))?.focus({ preventScroll: true });
  }

  // The whole pet should fit without scrolling: shrink in steps (smaller screen, then
  // icon-only buttons) until it does.
  function fit() {
    if (panel.hidden) return;
    panel.classList.remove("gp-tight", "gp-tighter");
    for (const c of ["gp-tight", "gp-tighter"]) {
      if (panel.scrollHeight <= panel.clientHeight + 1) break;
      panel.classList.add(c);
    }
  }

  function open(on) {
    panel.hidden = !on;
    avatar.setAttribute("aria-expanded", String(on));
    if (on) { avatar.classList.remove("gp-tucked"); render(); place(); fit(); panel.querySelector("button:not([disabled])")?.focus({ preventScroll: true }); }
    else { leaveVisit(); place(); }
  }

  avatar.addEventListener("click", () => open(panel.hidden));
  panel.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.classList.contains("gp-x")) { open(false); avatar.focus(); }
    else if (b.dataset.act) act(b.dataset.act);
    else if ("free" in b.dataset) freeToken();
    else if (b.dataset.tab) { tab = b.dataset.tab; render(); }
    else if (b.dataset.game) window.GP_GAMES && GP_GAMES.open(b.dataset.game);
    else if ("drop" in b.dataset) openDrop();
    else if (b.dataset.gift) claimGift(b.dataset.gift);
    else if ("push" in b.dataset) {
      if (!st.actedAt) { st.actedAt = Date.now(); save(); }   // e.g. saving a brand-new egg
      toast((await push("manual")) ? "💾 Saved to the league!" : "Couldn't reach the league. Try again later.");
    }
    else if ("rehatch" in b.dataset) rehatch();
    else if ("avatar" in b.dataset) askAvatar();
    else if ("hatch" in b.dataset) hatch();
    else if ("unvisit" in b.dataset) leaveVisit();
    else if ("notice" in b.dataset) { st.notice = ""; save(); render(); }
    else if (b.dataset.team) {
      const p = document.getElementById("team-picker");
      if (p) { p.value = b.dataset.team; p.dispatchEvent(new Event("change")); }
      else { set("bl.viewTeam", b.dataset.team); render(); }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden && !document.querySelector(".gp-game:not([hidden])")) { open(false); avatar.focus(); }
  });
  document.addEventListener("pointerdown", (e) => {
    if (panel.hidden || panel.contains(e.target) || avatar.contains(e.target)) return;
    if (e.target.closest && e.target.closest(".gp-game, #toast")) return;
    open(false);
  });
  document.addEventListener("bl:team", () => { leaveVisit(); render(); });

  // ---------- docking + dodging ----------
  // Docked while the header slot is on screen; otherwise floating top-right.
  // Floating and covering something listed in config.avoid -> tuck into the edge.
  let docked = true, raf = 0;
  new IntersectionObserver(([e]) => { docked = e.isIntersecting; place(); }).observe(slot);

  function place() {
    avatar.classList.toggle("gp-float", !docked);
    if (docked || !panel.hidden) { avatar.classList.remove("gp-tucked"); placePanel(); return; }
    const a = { top: 12, right: innerWidth - 12, bottom: 12 + avatar.offsetHeight, left: innerWidth - 12 - avatar.offsetWidth };
    let hit = false;
    for (const el of document.querySelectorAll(C.avoid)) {
      if (el === slot || el.contains(avatar) || panel.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || !r.width) continue;
      if (r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top) { hit = true; break; }
    }
    avatar.classList.toggle("gp-tucked", hit);
  }
  function placePanel() {
    if (panel.hidden) return;
    const r = avatar.getBoundingClientRect();
    panel.style.setProperty("--gp-top", Math.max(8, Math.round(r.bottom + 8)) + "px");
    fit();
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; place(); }); };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);

  // Clock: decay and the countdowns keep moving while the page is open.
  let tick = 0;
  setInterval(() => {
    tick++;
    if (st && tick % 30 === 0) { st = catchUp(st); save(); maybePush("auto"); }
    // Hourly sync also brings back everyone else's pets and new gifts.
    if (tick % 30 === 0 && C.online.autoPushMin > 0 && Date.now() - pulledAt >= C.online.autoPushMin * 60000) pull(true);
    if (!panel.hidden || tick % 30 === 0) render();
    if (!panel.hidden && st) countdown();
  }, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && st) { st = catchUp(st); save(); render(); } });

  // For pet-games.js.
  window.GP = {
    C, esc, grant, prizeText, pickWeighted, toast, render, spriteHTML, fxClass, isFire, isSuper,
    state: () => st, team: () => cur, sprite: () => cur && spriteUrl(cur), visit: visitPet, visiting: () => !!visit, weekId,
    touch: () => { touch(); render(); },
    play: (a, ms) => !busy && play(a, ms),
  };

  render();
  place();
  pull();
})();
