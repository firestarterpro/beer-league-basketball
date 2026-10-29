// Home-page Masco-Pets wall (PetWall.astro). Shows each team's league-saved pet with its effects.
(function () {
  const C = window.PET_CONFIG, wall = document.getElementById("gp-wall"), card = document.getElementById("gp-wall-card");
  if (!C || !wall) return;
  let on = C.enabled;
  try { on = on || localStorage.getItem("bl.pet.preview"); } catch {}
  if (!on) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const data = JSON.parse(wall.dataset.pets || "{}");
  const max = Number(data.overrides && data.overrides.maxPower) || C.maxPower;
  const now = Date.now(), live = (t) => !!t && Date.parse(t) > now;
  wall.innerHTML = (data.rows || []).map((r) => {
    const egg = r.power == null || r.egg;
    const power = egg ? 0 : Math.round(Number(r.power) || 0), fire = !egg && live(r.fire_until), sup = !egg && (power >= max || live(r.super_until));
    const dunk = (C.meters && C.meters.power && C.meters.power.icon) || "🤾";
    const status = egg ? "🥚 Not hatched yet" : fire && sup ? "🦸 Superman fire mode!" : sup ? "🌟 Super Saiyan" : fire ? "🔥 On Fire" : `${dunk} ${power} / ${max}`;
    const mode = fire && sup ? "🔥🌟" : sup ? "🌟" : fire ? "🔥" : "";
    const sprite = egg
      ? `<span class="gp-egg-wall" aria-hidden="true">🥚</span>`
      : `<span class="gp-sprite"><span class="gp-aura"></span><span class="gp-flames"><i></i><i></i><i></i><i></i></span>
          <img alt="${esc(r.team_name)} masco-pet" src="/pet/sprites/${esc(r.abv)}-anim.webp" onerror="if(this.src.endsWith('-anim.webp'))this.src='/pet/sprites/${esc(r.abv)}.png';else this.parentNode.classList.add('gp-noart')"></span>`;
    return `<div class="gp-mascot gp-visitable${fire ? " gp-fire" : ""}${sup ? " gp-super" : ""}" role="button" tabindex="0" data-visit="${esc(r.abv)}"
      title="${esc(r.team_name)} · ${status}" aria-label="Visit ${esc(r.team_name)}'s masco-pet (${status})">
      <span class="gp-stage">${sprite}${mode ? `<span class="gp-mode" aria-hidden="true">${mode}</span>` : ""}</span>
      <span class="gp-bar" aria-hidden="true"><i style="width:${Math.min(100, Math.round((power / max) * 100))}%"></i></span></div>`;
  }).join("");
  card.hidden = false;
  // Tap a mascot to visit it (practice mode, see pet.js).
  const go = (e) => {
    const m = e.target.closest("[data-visit]");
    if (!m || !window.GP || !GP.visit) return;
    if (e.type === "keydown") { if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); }
    GP.visit(m.dataset.visit);
  };
  wall.addEventListener("click", go);
  wall.addEventListener("keydown", go);
})();
