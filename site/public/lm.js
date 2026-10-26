// LM desk: every form/button with data-op posts to /api/lm and reloads.
document.addEventListener("DOMContentLoaded", function () {
  const run = async (data, el) => {
    if (el) el.disabled = true;
    try {
      await BL.post("/api/lm", data);
      location.reload();
    } catch (err) {
      BL.toast(err.message, true);
      if (el) el.disabled = false;
    }
  };

  document.querySelectorAll("button[data-op]").forEach((btn) =>
    btn.addEventListener("click", () => run({ ...btn.dataset }, btn)));

  document.querySelectorAll("form[data-op]").forEach((form) =>
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = { op: form.dataset.op };
      for (const el of form.elements) {
        if (!el.name) continue;
        if (el.type === "checkbox") data[el.name] = el.checked;
        else if (el.tagName === "BUTTON") continue;
        else if (el.name === "options") data.options = el.value.split("\n");
        else data[el.name] = el.value;
      }
      if (e.submitter && e.submitter.name) data[e.submitter.name] = e.submitter.value === "true";
      run(data, e.submitter);
    }));

  // Teams: one Save for every row, plus rows added here (no team_id yet).
  const editor = document.getElementById("team-editor");
  if (editor) {
    const rows = document.getElementById("team-rows");
    document.getElementById("team-add").addEventListener("click", () => {
      rows.appendChild(document.getElementById("team-row-new").content.cloneNode(true));
      rows.lastElementChild.querySelector("input").focus();
    });
    rows.addEventListener("click", (e) => {
      if (e.target.matches("[data-remove-row]")) e.target.closest(".team-row").remove();
    });
    editor.addEventListener("submit", (e) => {
      e.preventDefault();
      const teams = [...rows.querySelectorAll(".team-row")].map((row) => {
        const v = (n) => row.querySelector(`[name="${n}"]`);
        return {
          team_id: row.dataset.teamId || null,
          team_name: v("team_name").value, abv: v("abv").value, gm_name: v("gm_name").value,
          manager_assigned: v("manager_assigned").checked, uses_web_actions: v("uses_web_actions").checked,
        };
      });
      run({ op: "save_teams", teams }, e.submitter);
    });
  }

  // IR form: keep the hidden team in step with the chosen player.
  document.querySelectorAll("select[data-team-from]").forEach((sel) => {
    const hidden = sel.form.elements[sel.dataset.teamFrom];
    sel.addEventListener("change", () => (hidden.value = sel.selectedOptions[0]?.dataset.team || ""));
  });

  // Player search for the claim form.
  const list = document.getElementById("lm-players");
  let found = [], timer;
  document.querySelectorAll("input[data-player]").forEach((input) => {
    const hidden = input.form.elements[input.dataset.player];
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const res = await fetch(`/api/players?q=${encodeURIComponent(input.value.trim())}`).then((r) => r.json());
        found = res.ok ? res.data : [];
        list.innerHTML = "";
        for (const p of found) {
          const o = document.createElement("option");
          o.value = p.name; o.label = `${window.BL.tier(p.tier)} · ${p.nba_team || ""}`;
          list.appendChild(o);
        }
      }, 250);
      const hit = found.find((p) => p.name.toLowerCase() === input.value.trim().toLowerCase());
      hidden.value = hit ? hit.player_id : "";
    });
  });
});
