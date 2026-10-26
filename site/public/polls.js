// Voting forms on poll cards. First vote stamps your voting team on this device.
// The toys: stickers slap on and peel off (#9), yearbook cards drag with a locker slam (#10),
// hearts fill and the Tamagotchi cheers up (#11), the notebook grows doodles (#12), and on approvals
// the noses vote the moment you press one: Yes honks and slimes, No buzzes (#13).
// Your last ballot on this device is filled back in (bl.ballot.<poll id>); nothing about it goes to the server.
document.addEventListener("DOMContentLoaded", function () {
  // A page can include this twice (side-column poll + Approvals); wire the forms once.
  if (window.BL_POLLS_WIRED) return;
  window.BL_POLLS_WIRED = true;
  const sfx = (n) => BL.sfx && BL.sfx(n);
  const calm = () => (BL.calm ? BL.calm() : false);
  const store = {
    get(id) { try { return JSON.parse(localStorage.getItem("bl.ballot." + id) || "null"); } catch { return null; } },
    set(id, v) { try { localStorage.setItem("bl.ballot." + id, JSON.stringify(v)); } catch {} },
  };

  function voteAs(form) {
    const box = form.querySelector(".vote-as");
    const locked = BL.voteTeam();
    if (locked) {
      box.innerHTML = "";
      box.append(`Voting as: ${BL.teamName(locked) || "your team"} · `);
      const a = document.createElement("a");
      a.href = "#"; a.textContent = "request change";
      a.addEventListener("click", (e) => { e.preventDefault(); requestChange(locked); });
      box.append(a);
    } else {
      box.textContent = BL.viewTeam()
        ? `Voting as: ${BL.teamName(BL.viewTeam())} · Your first vote locks this team on this device.`
        : "Pick your team at the top of the page before voting.";
    }
  }

  async function requestChange(from) {
    const to = BL.viewTeam();
    if (!to || to === from) {
      BL.toast("Pick the team you want to vote as in the My team menu, then click request change.", true);
      return;
    }
    try {
      await BL.post("/api/team-change", { device: BL.deviceId(), from, to });
      BL.toast("Request sent to the LM.");
    } catch (err) { BL.toast(err.message, true); }
  }

  function response(form, type) {
    if (type === "single_choice") {
      const c = form.querySelector("input[type=radio]:checked");
      return c ? { option_id: c.value } : null;
    }
    if (type === "multi_select") {
      const ids = [...form.querySelectorAll("input[type=checkbox]:checked")].map((i) => i.value);
      return ids.length ? { option_ids: ids } : null;
    }
    if (type === "ranked") return { ranking: [...form.querySelectorAll(".ranklist li")].map((li) => li.dataset.option) };
    if (type === "rating") {
      const c = form.querySelector("input[type=radio]:checked");
      return c ? { rating: Number(c.value) } : null;
    }
    const text = form.querySelector("textarea").value.trim();
    return text ? { text } : null;
  }

  // Put this device's last ballot back on the form.
  function refill(form, type, r) {
    if (!r) return false;
    if (type === "single_choice" && r.option_id) {
      const i = form.querySelector(`input[value="${CSS.escape(r.option_id)}"]`);
      if (i) i.checked = true;
    } else if (type === "multi_select" && r.option_ids) {
      r.option_ids.forEach((id) => { const i = form.querySelector(`input[value="${CSS.escape(id)}"]`); if (i) i.checked = true; });
    } else if (type === "ranked" && r.ranking) {
      const list = form.querySelector(".ranklist");
      r.ranking.forEach((id) => { const li = list.querySelector(`li[data-option="${CSS.escape(id)}"]`); if (li) list.appendChild(li); });
    } else if (type === "rating" && r.rating) {
      const i = form.querySelector(`input[value="${r.rating}"]`);
      if (i) i.checked = true;
    } else if (type === "text" && r.text) {
      form.querySelector("textarea").value = r.text;
    } else return false;
    return true;
  }

  // ---------- Stickers (#9) ----------
  function stickers(form) {
    const opts = [...form.querySelectorAll(".sticker-opt")];
    const paint = () => opts.forEach((o) => o.classList.toggle("stuck", o.querySelector("input").checked));
    opts.forEach((o) => {
      const input = o.querySelector("input");
      input.addEventListener("change", () => {
        if (input.type === "radio") {
          opts.forEach((x) => { if (x !== o && x.classList.contains("stuck")) peel(x); });
        } else if (!input.checked) { peel(o); paint(); return; }
        slap(o);
        paint();
      });
    });
    paint();
  }
  function slap(o) {
    sfx("sticker-slap"); BL.buzz && BL.buzz(8);
    if (calm()) return;
    o.classList.remove("slap"); void o.offsetWidth; o.classList.add("slap");
    const r = o.querySelector(".sticker").getBoundingClientRect();
    BL.fx && BL.fx.confetti(r.left + r.width / 2, r.top + r.height / 2, { count: 36, spread: 0.7 });
  }
  function peel(o) {
    sfx("sticker-peel");
    if (calm()) return;
    const ghost = o.querySelector(".sticker").cloneNode();
    ghost.classList.add("peeling");
    o.querySelector(".sticker").after(ghost);
    setTimeout(() => ghost.remove(), 600);
  }

  // ---------- Yearbook cards: drag to rank (#10); the arrows still work ----------
  function yearbook(form) {
    const list = form.querySelector(".ranklist");
    if (!list) return;
    form.querySelectorAll("[data-move]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const li = btn.closest("li");
        const sib = btn.dataset.move === "-1" ? li.previousElementSibling : li.nextElementSibling;
        if (sib) { btn.dataset.move === "-1" ? sib.before(li) : sib.after(li); sfx("card-flip"); btn.focus(); }
      }));
    let drag = null, startY = 0, moved = false;
    const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
    list.querySelectorAll(".yb-grip, .yb-photo").forEach((h) => {   // handles only, so the page still scrolls on phones
      h.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        drag = h.closest("li"); startY = e.clientY; moved = false;
        drag.setPointerCapture(e.pointerId);
        drag.classList.add("dragging");
        e.preventDefault();
      });
    });
    list.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 4) moved = true;
      drag.style.transform = `translateY(${dy}px) rotate(${Math.max(-3, Math.min(3, dy / 30))}deg)`;
      const mid = e.clientY;
      const prev = drag.previousElementSibling, next = drag.nextElementSibling;
      if (prev && mid < prev.getBoundingClientRect().top + prev.offsetHeight / 2) {
        prev.before(drag); startY -= prev.offsetHeight + gap; drag.style.transform = `translateY(${e.clientY - startY}px)`; sfx("card-flip");
      } else if (next && mid > next.getBoundingClientRect().top + next.offsetHeight / 2) {
        next.after(drag); startY += next.offsetHeight + gap; drag.style.transform = `translateY(${e.clientY - startY}px)`; sfx("card-flip");
      }
    });
    const drop = () => {
      if (!drag) return;
      drag.classList.remove("dragging"); drag.style.transform = "";
      if (moved) {
        sfx("locker-slam");
        if (!calm()) { list.classList.remove("slam"); void list.offsetWidth; list.classList.add("slam"); }
      }
      drag = null;
    };
    list.addEventListener("pointerup", drop);
    list.addEventListener("pointercancel", drop);
  }

  // ---------- Tamagotchi hearts (#11) ----------
  const FACES = ["T_T", "-_-", "o_o", "^_^", "^o^"];
  function hearts(form) {
    const box = form.querySelector(".hearts");
    if (!box) return;
    const labels = [...box.querySelectorAll(".heart")], tama = box.querySelector(".tama");
    const fill = (n) => {
      labels.forEach((l, i) => l.classList.toggle("full", i < n));
      tama.dataset.face = n ? FACES[n - 1] : "o_o";
    };
    const picked = () => Number((box.querySelector("input:checked") || {}).value || 0);
    labels.forEach((l, i) => {
      l.addEventListener("pointerenter", () => fill(i + 1));
      l.querySelector("input").addEventListener("change", () => {
        fill(i + 1); sfx("tama-chirp");
        if (!calm()) { tama.classList.remove("hop"); void tama.offsetWidth; tama.classList.add("hop"); }
      });
    });
    box.addEventListener("pointerleave", () => fill(picked()));
    fill(picked());
  }

  // ---------- Notebook doodles (#12): a doodle in the margin every 50 characters ----------
  const DOODLES = ["🏀", "❤️", "⭐", "😎", "🍕", "✏️", "🌈", "🔥", "👟", "🏆"];
  function notebook(form) {
    const nb = form.querySelector(".notebook");
    if (!nb) return;
    const ta = nb.querySelector("textarea"), box = nb.querySelector(".doodles"), count = nb.querySelector(".nb-count");
    let shown = 0, scratch = 0;
    const draw = () => {
      const want = Math.floor(ta.value.length / 50);
      while (shown < want) {
        const d = document.createElement("span");
        const left = shown % 2 === 0;
        d.textContent = DOODLES[shown % DOODLES.length];
        d.style.top = `${8 + ((shown * 37) % 80)}%`;
        d.style[left ? "left" : "right"] = "4px";
        d.style.setProperty("--r", `${(shown * 47) % 40 - 20}deg`);
        box.appendChild(d); shown++;
      }
      while (shown > want && box.lastChild) { box.lastChild.remove(); shown--; }
      count.textContent = `${ta.value.length} / 500`;
    };
    ta.addEventListener("input", () => {
      draw();
      if (performance.now() - scratch > 260) { scratch = performance.now(); sfx("pencil-scratch"); }
    });
    draw();
  }

  // ---------- Noses (#13): pressing one votes ----------
  function noses(form) {
    form.querySelectorAll(".nose input").forEach((input) => {
      input.addEventListener("change", () => {
        const yes = input.closest(".nose").classList.contains("yes");
        sfx(yes ? "honk" : "buzzer"); BL.buzz && BL.buzz(yes ? 20 : 60);
        if (yes && BL.fx) {
          // The page reloads with the new tally; the slime comes back in the same spot.
          const goo = BL.fx.slime(true);
          try { sessionStorage.setItem("bl.slimeNext", goo ? JSON.stringify({ side: goo.dataset.side, top: parseInt(goo.style.top, 10) }) : "1"); } catch {}
        }
        if (form.requestSubmit) form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { cancelable: true }));
      });
    });
  }

  document.querySelectorAll("[data-poll] form.vote").forEach((form) => {
    const card = form.closest("[data-poll]");
    const type = card.dataset.type;
    voteAs(form);
    document.addEventListener("bl:team", () => voteAs(form));

    const mine = store.get(card.dataset.poll);
    const who = BL.voteTeam() || BL.viewTeam();
    if (mine && (!who || mine.team === who) && refill(form, type, mine.response)) {
      form.classList.add("voted");
      const note = document.createElement("p");
      note.className = "small muted"; note.textContent = "Your last vote from this device is filled in.";
      form.querySelector(".vote-as").after(note);
    }

    stickers(form);
    yearbook(form);
    hearts(form);
    notebook(form);
    noses(form);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const team = BL.voteTeam() || BL.viewTeam();
      if (!team) return BL.toast("Pick your team at the top of the page first.", true);
      const r = response(form, type);
      if (!r) return BL.toast("Make a choice first.", true);
      const btn = form.querySelector("button[type=submit]");
      if (btn) btn.disabled = true;
      form.classList.add("sending");
      try {
        await BL.post("/api/vote", { poll_id: card.dataset.poll, team_id: team, response: r });
        if (!BL.voteTeam()) BL.setVoteTeam(team);
        store.set(card.dataset.poll, { team, response: r });
        if (BL.fx && !form.querySelector(".nose")) BL.fx.stamp(card, "Voted!", "ok", "voted-stamp");
        // Let the stamp land and the sound finish, then show the new results.
        setTimeout(() => location.reload(), calm() ? 0 : 900);
      } catch (err) {
        BL.toast(err.message, true);
        if (btn) btn.disabled = false;
        form.classList.remove("sending");
        form.querySelectorAll(".nose input").forEach((i) => (i.checked = false));
      }
    });
  });

  // Results are live: refresh when you come back to the tab after a minute away.
  let left = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) left = Date.now();
    else if (Date.now() - left > 60000 && !document.querySelector("form.vote :focus")) location.reload();
  });
});
