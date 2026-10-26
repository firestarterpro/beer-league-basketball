// Team picker + voting-team lock. No accounts: everything lives on this device.
//   bl.viewTeam  - whose dashboard you're looking at (switch freely)
//   bl.voteTeam  - stamped on your first vote; later ballots use it
//   bl.deviceId  - random id so the LM can approve a voting-team change
(function () {
  const get = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  if (!get("bl.deviceId")) set("bl.deviceId", (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2));

  const TIER_EMOJI = { T1: "🤾", T2: "⛹️", T3: "🚶" };   // same as src/lib/tiers.ts

  window.BL = {
    tier: (t) => TIER_EMOJI[t] || TIER_EMOJI.T3,
    viewTeam: () => get("bl.viewTeam"),
    voteTeam: () => get("bl.voteTeam"),
    deviceId: () => get("bl.deviceId"),
    setVoteTeam: (id) => set("bl.voteTeam", id),
    // ESPN's own team number for the picked team (1-6), for links into ESPN.
    espnTeam: (id) => {
      const o = document.querySelector(`#team-picker option[value="${id}"]`);
      return o ? o.dataset.espn || "" : "";
    },
    teamName: (id) => {
      const o = document.querySelector(`#team-picker option[value="${id}"]`);
      return o ? o.textContent : "";
    },
    async post(url, data) {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const out = await res.json().catch(() => ({ ok: false, error: "No response from the server." }));
      if (!out.ok) throw new Error(out.error || "Something went wrong.");
      return out.data;
    },
    toast(msg, bad) {
      let t = document.getElementById("toast");
      if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
      t.textContent = msg; t.className = bad ? "bad" : ""; t.hidden = false;
      clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 3500);
    },
  };

  // Point every "My team on ESPN" link at the picked team.
  const espnLinks = () => {
    const n = window.BL.espnTeam(get("bl.viewTeam"));
    document.querySelectorAll('a[data-espn="team"]').forEach((a) => {
      const u = new URL(a.href);
      if (n) u.searchParams.set("teamId", n); else u.searchParams.delete("teamId");
      a.href = u.toString();
    });
  };
  document.addEventListener("bl:team", espnLinks);

  document.addEventListener("DOMContentLoaded", () => {
  const picker = document.getElementById("team-picker");
  if (picker) {
    picker.value = get("bl.viewTeam");
    espnLinks();
    picker.addEventListener("change", () => {
      set("bl.viewTeam", picker.value);
      const go = () => document.dispatchEvent(new CustomEvent("bl:team", { detail: picker.value }));
      // toys.js: velcro rip + TV static first, then the page switches teams
      if (window.BL.fx && window.BL.fx.teamSwitch) window.BL.fx.teamSwitch(go); else go();
    });
  }

  // Sync Now: anyone can ask the LM's PC to pull ESPN. Hidden until Cloudflare KV is set up.
  const sync = document.getElementById("sync");
  if (sync) {
    const btn = document.getElementById("sync-now");
    const label = document.getElementById("sync-status");
    const time = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    let polls = 0, timer;
    const show = (s) => {
      if (!s || !s.enabled) { sync.hidden = true; return false; }
      sync.hidden = false;
      const waiting = s.requested_at && (!s.done_at || s.requested_at > s.done_at);
      btn.disabled = !!waiting;
      label.textContent = waiting ? `Asked ${time(s.requested_at)}, waiting on the LM's PC`
        : s.done_at ? `Last synced ${time(s.done_at)}${s.ok === false ? " (with errors)" : ""}` : "Updates";
      return waiting;
    };
    const check = () => fetch("/api/sync-now").then((r) => r.json()).then((out) => {
      const waiting = show(out.data);
      clearTimeout(timer);
      if (waiting && polls++ < 30) timer = setTimeout(check, 20000);   // up to 10 minutes
    }).catch(() => {});
    btn.addEventListener("click", async () => {
      try {
        show(await window.BL.post("/api/sync-now", {}));
        window.BL.toast("Sync requested. If the LM's PC is on, it syncs within about a minute.");
        polls = 0; clearTimeout(timer); timer = setTimeout(check, 20000);
      } catch (e) { window.BL.toast(e.message, true); }
    });
    check();
  }

  // If the LM approved a voting-team change for this device, apply it.
  if (get("bl.voteTeam")) {
    fetch(`/api/team-change?device=${encodeURIComponent(get("bl.deviceId"))}`)
      .then((r) => r.json())
      .then((out) => {
        if (out.ok && out.data && out.data.to && out.data.to !== get("bl.voteTeam")) {
          set("bl.voteTeam", out.data.to);
          window.BL.toast("The LM approved your voting-team change.");
        }
      })
      .catch(() => {});
  }
  });
})();

// A link to #some-id that points at a collapsed <details> panel opens it.
(function () {
  const open = () => {
    const el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el && el.tagName === "DETAILS") { el.open = true; el.scrollIntoView(); }
  };
  document.addEventListener("DOMContentLoaded", open);
  window.addEventListener("hashchange", open);
})();
