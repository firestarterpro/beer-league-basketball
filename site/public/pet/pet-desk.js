// Masco-Pet desk (pet-desk.astro): gifts, live tuning, league pet resets.
(function () {
  const C = window.PET_CONFIG || {};
  const reload = () => { try { sessionStorage.removeItem("bl.pet.league"); } catch {} location.reload(); };
  const run = async (data, done) => {
    try { await BL.post("/api/pet", data); BL.toast(done); setTimeout(reload, 800); }
    catch (e) { BL.toast(e.message, true); }
  };
  const at = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

  // Gifts
  const gift = document.getElementById("gift-form");
  gift.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(gift), fx = {};
    for (const k of ["tokens", "points", "power", "energy", "hunger", "happy", "fireHours", "superHours", "spins"]) if (Number(f.get(k))) fx[k] = Number(f.get(k));
    run({ op: "gift", title: f.get("title"), team_id: f.get("team_id") || null, days: Number(f.get("days")) || 14, fx }, "🎁 Gift sent!");
  });
  document.getElementById("random-gift").addEventListener("click", () => {
    const pool = (C.roulette && C.roulette.prizes || []).filter((p) => Object.keys(p.fx).length);
    if (!pool.length) return;
    const p = pool[Math.floor(Math.random() * pool.length)];
    run({ op: "gift", title: `Surprise ${p.label}!`, team_id: null, fx: p.fx }, `🎲 Everyone gets: ${p.label}`);
  });
  document.querySelectorAll("[data-end-gift]").forEach((b) =>
    b.addEventListener("click", () => run({ op: "end_gift", gift_id: Number(b.dataset.endGift) }, "Gift ended.")));

  // Tuning: show config.js defaults as placeholders, current overrides as values.
  const tune = document.getElementById("tune-form");
  const over = JSON.parse(tune.dataset.overrides || "{}");
  for (const input of tune.querySelectorAll("input")) {
    input.placeholder = at(C, input.name) ?? "";
    const v = at(over, input.name);
    if (v != null) input.value = v;
  }
  tune.addEventListener("submit", (e) => {
    e.preventDefault();
    const out = {};
    for (const input of tune.querySelectorAll("input")) {
      if (input.value === "") continue;
      const keys = input.name.split("."), last = keys.pop();
      let o = out;
      for (const k of keys) o = o[k] = o[k] || {};
      o[last] = Number(input.value);
    }
    run({ op: "settings", overrides: out }, "Tuning saved.");
  });
  document.getElementById("tune-clear").addEventListener("click", () => run({ op: "settings", overrides: {} }, "Back to defaults."));

  // Resets
  document.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => {
    if (confirm(`Rehatch ${b.dataset.name}'s masco-pet back to an egg?`)) run({ op: "reset", team_id: b.dataset.reset }, "🥚 Rehatched.");
  }));
})();
