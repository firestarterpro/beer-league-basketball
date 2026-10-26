// Home page toys: the VHS shelf in "Open now" (#7), the AIM feed with its jog wheel (#8) and the
// waiver late-fee ticker (#19). The TV guide (#5, #6) is in schedule.js.
document.addEventListener("DOMContentLoaded", () => {
  const BL = window.BL || {};
  const sfx = (n) => BL.sfx && BL.sfx(n);
  const calm = () => (BL.calm ? BL.calm() : false);

  // ---------- VHS shelf: drag a tape right (or tap it) to check it out ----------
  document.querySelectorAll(".vhs-shelf .vhs").forEach((tape) => {
    let x0 = null, dx = 0, dragged = false;
    const checkout = () => {
      sfx("vhs-slide");
      if (calm()) { location.href = tape.href; return; }
      tape.style.transform = "";
      tape.classList.add("out");
      setTimeout(() => (location.href = tape.href), 430);
    };
    tape.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      x0 = e.clientX; dx = 0; dragged = false;
      tape.setPointerCapture(e.pointerId);
    });
    tape.addEventListener("pointermove", (e) => {
      if (x0 === null) return;
      dx = Math.max(0, e.clientX - x0);
      if (dx > 6) dragged = true;
      tape.style.transition = "none";
      tape.style.transform = `translateX(${dx}px) rotate(${Math.min(8, dx / 12)}deg)`;
    });
    const end = () => {
      if (x0 === null) return;
      x0 = null; tape.style.transition = "";
      if (dx > 60) checkout(); else tape.style.transform = "";
    };
    tape.addEventListener("pointerup", end);
    tape.addEventListener("pointercancel", () => { x0 = null; tape.style.transition = ""; tape.style.transform = ""; });
    // A plain tap or Enter also checks the tape out; a short drag that snapped back does nothing.
    tape.addEventListener("click", (e) => {
      e.preventDefault();
      if (dragged && dx <= 60) { dragged = false; return; }
      if (!tape.classList.contains("out")) checkout();
    });
  });

  // ---------- League feed: AIM window ----------
  const log = document.getElementById("feed");
  if (log) {
    let seen = "";
    try { seen = localStorage.getItem("bl.feedSeen") || ""; } catch {}
    const items = [...log.querySelectorAll("li[data-at]")];
    const fresh = seen ? items.filter((li) => li.dataset.at > seen) : [];
    fresh.forEach((li, i) => { li.classList.add("new"); li.style.animationDelay = `${i * 90}ms`; });
    if (items.length) { try { localStorage.setItem("bl.feedSeen", items[0].dataset.at); } catch {} }
    // Browsers only allow sound after a tap, so the door creaks on the first one.
    if (fresh.length) addEventListener("pointerdown", () => sfx("aim-door-open"), { once: true });

    // Jog wheel: each notch (24 degrees of spin) moves one note.
    const jog = document.querySelector(".aim-foot .jog");
    if (jog) {
      let angle = 0, start = null, base = 0, idx = 0;
      const at = (e) => { const r = jog.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
      const goTo = (n) => {
        const next = Math.max(0, Math.min(items.length - 1, n));
        if (next === idx) return;
        idx = next;
        log.scrollTo({ top: items[idx].offsetTop - log.offsetTop - 4, behavior: calm() ? "auto" : "smooth" });
        jog.setAttribute("aria-valuenow", String(idx + 1));
        sfx("channel-click");
      };
      jog.addEventListener("pointerdown", (e) => { start = at(e); base = angle; jog.setPointerCapture(e.pointerId); e.preventDefault(); });
      jog.addEventListener("pointermove", (e) => {
        if (start === null) return;
        let d = at(e) - start;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        angle = base + d; start = at(e); base = angle;
        jog.style.transform = `rotate(${angle}deg)`;
        goTo(Math.round(angle / 24));
      });
      const stop = () => (start = null);
      jog.addEventListener("pointerup", stop);
      jog.addEventListener("pointercancel", stop);
      jog.addEventListener("keydown", (e) => {
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        e.preventDefault(); angle += step * 24; jog.style.transform = `rotate(${angle}deg)`; goTo(idx + step);
      });
      // Scrolling the log by hand keeps the wheel's position honest.
      log.addEventListener("scroll", () => {
        const top = log.scrollTop + log.offsetTop + 8;
        const n = items.findIndex((li) => li.offsetTop + li.offsetHeight > top);
        if (n >= 0) { idx = n; jog.setAttribute("aria-valuenow", String(n + 1)); }
      }, { passive: true });
    }
  }

  // ---------- Waivers: countdown to clearing, and a late fee that ticks up to $25 like a gas pump ----------
  const fees = [...document.querySelectorAll(".latefees li[data-clears]")];
  if (fees.length) {
    const left = (ms) => {
      if (ms <= 0) return "Clears now";
      const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
      return d ? `${d}d ${h}h left` : h ? `${h}h ${m % 60}m left` : `${m % 60}m left`;
    };
    const tick = () => {
      const now = Date.now();
      fees.forEach((li) => {
        const t0 = Date.parse(li.dataset.dropped), t1 = Date.parse(li.dataset.clears);
        li.querySelector(".lf-clock").textContent = left(t1 - now);
        const share = Math.min(1, Math.max(0, (now - t0) / (t1 - t0)));
        li.querySelector(".lf-fee").textContent = `$${(25 * share).toFixed(4)}`;
      });
    };
    tick();
    setInterval(tick, 1000);
    fees.forEach((li) => li.addEventListener("click", () => sfx("register-ding")));
  }
});
