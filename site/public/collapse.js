// Home: every section folds up. Tap its heading (or the ▾ button) to collapse or expand it.
// Sections start open; what you fold is remembered on this device (bl.collapsed = list of section ids).
(function () {
  const KEY = "bl.collapsed";
  let shut;
  try { shut = new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { shut = new Set(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...shut])); } catch {} };

  document.querySelectorAll(".home-grid section.card").forEach((card) => {
    if (card.parentElement.closest(".card")) return;   // a card inside a card folds with its parent
    const head = card.querySelector(":scope > h2, :scope > .sec-head");
    if (!head) return;
    const h2 = head.matches("h2") ? head : head.querySelector("h2");
    const name = h2 ? h2.textContent.trim() : "this section";
    const id = card.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    card.classList.add("collapsible");
    head.classList.add("cl-head");
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "cl-btn";
    card.appendChild(btn);
    const paint = () => {
      const closed = shut.has(id);
      card.classList.toggle("collapsed", closed);
      btn.textContent = closed ? "▸" : "▾";
      btn.setAttribute("aria-expanded", String(!closed));
      btn.setAttribute("aria-label", `${closed ? "Expand" : "Collapse"} ${name}`);
      btn.title = closed ? "Expand" : "Collapse";
    };
    const toggle = () => {
      if (shut.has(id)) shut.delete(id); else shut.add(id);
      save(); paint();
      if (window.BL && BL.sfx) BL.sfx("channel-click");
    };
    btn.addEventListener("click", toggle);
    // The heading itself toggles too, but not the links or buttons inside it.
    head.addEventListener("click", (e) => { if (!e.target.closest("a, button, input, select")) toggle(); });
    paint();
  });
})();
