// "Pick my team" pop-up: the first time someone opens the site (no team on this device or in this visit),
// they pick their team, confirm it, and choose to save it on this device or just use it for now.
// "Just looking" closes it for this visit. No passwords: the header's My team picker can change it any time.
document.addEventListener("DOMContentLoaded", () => {
  const picker = document.getElementById("team-picker");
  if (!picker || !window.BL || BL.viewTeam()) return;
  try { if (sessionStorage.getItem("bl.pickSkip")) return; } catch {}
  const teams = [...picker.options].filter((o) => o.value).map((o) => ({ id: o.value, name: o.textContent }));
  if (!teams.length) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const dlg = document.createElement("dialog");
  dlg.className = "pick-team";
  dlg.setAttribute("aria-labelledby", "pick-title");
  document.body.appendChild(dlg);
  const skip = () => { try { sessionStorage.setItem("bl.pickSkip", "1"); } catch {} dlg.close(); };

  function choose() {
    dlg.innerHTML = `<h2 id="pick-title">Which team is yours?</h2>
      <p class="muted small">Pick your team to see your games, alerts and lineup links. You can change it any time with "My team" at the top.</p>
      <div class="pick-grid">${teams.map((t) => `<button type="button" data-id="${esc(t.id)}">${esc(t.name)}</button>`).join("")}</div>
      <p><button type="button" class="link" data-skip>I'm just looking</button></p>`;
    dlg.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => confirmTeam(teams.find((t) => t.id === b.dataset.id))));
    dlg.querySelector("[data-skip]").addEventListener("click", skip);
  }
  function confirmTeam(t) {
    dlg.innerHTML = `<h2 id="pick-title">You're ${esc(t.name)}?</h2>
      <p class="muted small">Save it on this device and the site remembers you next time. "Just for now" forgets it when you close the browser.</p>
      <div class="row">
        <button type="button" class="primary" data-save="1">Yes, save on this device</button>
        <button type="button" data-save="0">Yes, just for now</button>
        <button type="button" class="link" data-back>Pick again</button>
      </div>`;
    dlg.querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", () => {
      BL.setViewTeam(t.id, b.dataset.save === "1");
      dlg.close();
      BL.toast(b.dataset.save === "1" ? `Saved: ${t.name} on this device.` : `Showing ${t.name} for this visit.`);
    }));
    dlg.querySelector("[data-back]").addEventListener("click", choose);
  }
  dlg.addEventListener("cancel", skip);   // Esc
  choose();
  dlg.showModal();
});
