// Updates page: fills in the schedule and last runs from /api/sync-now, and (LM) saves the
// schedule, asks for Run now, and shows the PowerShell for running one by hand.
document.addEventListener("DOMContentLoaded", function () {
  const DEFAULTS = { moves_every: 1, stats_every: 17, postgame_delay: 30, nightly_hour: 6 };
  const CT = { timeZone: "America/Chicago" };
  const time = (iso) => new Date(iso).toLocaleTimeString("en-US", { ...CT, hour: "numeric", minute: "2-digit" });
  const when = (iso) => {
    if (!iso) return "never";
    const d = new Date(iso), day = (x) => x.toLocaleDateString("en-US", CT);
    const yest = new Date(Date.now() - 864e5);
    const label = day(d) === day(new Date()) ? "today" : day(d) === day(yest) ? "yesterday"
      : d.toLocaleDateString("en-US", { ...CT, weekday: "short", month: "short", day: "numeric" });
    return `${label} ${time(iso)}`;
  };
  const ago = (iso) => Math.round((Date.now() - new Date(iso)) / 60000);
  const form = document.getElementById("schedule-form");
  let timer;

  function show(d) {
    const st = d.status, saved = d.schedule || {};
    // what the PC is using: what it last reported, with newer saved changes on top
    const sched = { ...DEFAULTS, paused: [], ...((st && st.schedule) || {}), ...saved };
    const seen = document.getElementById("pc-seen");
    if (!d.enabled) seen.textContent = "Syncing from the website isn't set up yet.";
    else if (!st || !st.seen_at) seen.textContent = "The LM's PC hasn't reported here yet. It does after its next update (or within 15 minutes).";
    else {
      const m = ago(st.seen_at);
      seen.textContent = m <= 20 ? `🟢 LM's PC checked in ${m < 1 ? "just now" : m + " min ago"}`
        : `🔴 LM's PC last checked in ${when(st.seen_at)}. It may be off or asleep; nothing syncs until it's back.`;
    }

    const last = (st && st.last_runs) || {};
    if (d.done_at && (!last.quick || d.done_at > last.quick.at)) last.quick = { at: d.done_at, ok: d.ok !== false, why: "Sync button" };
    document.querySelectorAll("tr[data-job]").forEach((tr) => {
      const job = tr.dataset.job, r = last[job];
      const w = tr.querySelector(".js-when");
      w.textContent = w.dataset.template.replace(/\{(\w+)\}/g, (_, k) => sched[k]);
      tr.querySelector(".js-paused").hidden = !(sched.paused || []).includes(job);
      let text = r ? `${when(r.at)}${r.ok ? "" : " ⚠️ finished with errors"}${r.why ? ` · ${r.why}` : ""}` : "–";
      if (job === "moves" && st && st.moves_checked) text += ` · last checked ${when(st.moves_checked)}`;
      if (d.run && d.run.job === job && d.run.requested_at !== (st && st.run_handled)) text = `⏳ Run now asked ${when(d.run.requested_at)}, waiting on the PC`;
      tr.querySelector(".js-last").textContent = text;
    });

    const slate = document.getElementById("slate");
    if (st && st.slate) {
      const tips = st.tips || [];
      slate.textContent = tips.length
        ? `Game day ${st.slate}: ${tips.length} games, first tip ${time(tips[0])}${st.all_final ? ", all final" : ""}.`
        : `No NBA games on ${st.slate}.`;
    }

    if (form && !form.dataset.touched) {
      Object.keys(DEFAULTS).forEach((k) => { form.elements[k].value = saved[k] != null ? saved[k] : ""; });
      form.querySelectorAll("input[name=paused]").forEach((c) => { c.checked = (sched.paused || []).includes(c.value); });
    }
    clearTimeout(timer);
    timer = setTimeout(load, 30000);
  }

  const load = () => fetch("/api/sync-now").then((r) => r.json()).then((out) => out.ok && show(out.data)).catch(() => {});

  document.querySelectorAll(".js-run").forEach((btn) => btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      show(await BL.post("/api/sync-now", { run: btn.dataset.job }));
      BL.toast("Asked. If the LM's PC is on, it starts within about a minute.");
    } catch (e) { BL.toast(e.message, true); }
    btn.disabled = false;
  }));

  if (form) {
    form.addEventListener("input", () => { form.dataset.touched = "1"; });
    const save = async (schedule) => {
      try {
        delete form.dataset.touched;
        show(await BL.post("/api/sync-now", { schedule }));
        BL.toast("Saved. The PC picks it up within a minute.");
      } catch (e) { BL.toast(e.message, true); }
    };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const s = { paused: [...form.querySelectorAll("input[name=paused]:checked")].map((c) => c.value) };
      Object.keys(DEFAULTS).forEach((k) => { if (form.elements[k].value !== "") s[k] = Number(form.elements[k].value); });
      save(s);
    });
    document.getElementById("schedule-reset").addEventListener("click", () => {
      form.dataset.touched = "1";
      form.reset();
      save({ paused: [] });
    });
  }

  const pick = document.getElementById("ps-job");
  if (pick) {
    const cmds = JSON.parse(document.getElementById("ps-commands").textContent);
    const code = document.getElementById("ps-code");
    pick.addEventListener("change", () => { code.textContent = cmds[pick.value]; });
    document.getElementById("ps-copy").addEventListener("click", () =>
      navigator.clipboard.writeText(code.textContent).then(() => BL.toast("Copied. Paste it into PowerShell on the PC."), () => {}));
  }

  load();
});
