// Masco-Pet mini-games: Hoops Trivia, Gravity Pong, Prize Wheel.
// Quick Mario Party style games, no losing. Uses window.GP from pet.js.
(function () {
  const ready = () => window.GP && window.GP.state;
  let box, body, title, stopGame = null;

  function modal() {
    if (box) return;
    box = document.createElement("section");
    box.className = "gp-game";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.hidden = true;
    box.innerHTML = `<div class="gp-game-card"><header class="gp-head"><b class="gp-game-title"></b>
      <button type="button" class="gp-x" aria-label="Close game">×</button></header><div class="gp-game-body"></div></div>`;
    document.body.appendChild(box);
    body = box.querySelector(".gp-game-body");
    title = box.querySelector(".gp-game-title");
    box.querySelector(".gp-x").addEventListener("click", close);
    // One handler for every Done button, whichever game drew it.
    box.addEventListener("click", (e) => { if (e.target === box || e.target.closest("button[data-done]")) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden) close(); });
  }
  function close() {
    box.hidden = true;
    const stop = stopGame; stopGame = null;
    if (stop) try { stop(); } catch (e) { /* game already stopped */ }
    GP.render();
    document.querySelector('#gp-panel [data-game]')?.focus({ preventScroll: true });
  }
  function start(name, label, run) {
    modal();
    if (stopGame) { stopGame(); stopGame = null; }
    title.textContent = label;
    box.hidden = false;
    box.dataset.game = name;
    stopGame = run() || null;
  }

  // ---------- Hoops Trivia ----------
  const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
  const bank = () => (window.PET_TRIVIA || []).map(([lvl, q, right, ...wrong]) => ({ id: hash(q), lvl, q, right, wrong }));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function recentRight() {
    const s = GP.state(), T = GP.C.trivia, from = Date.now() - T.windowHours * 3.6e6;
    s.correct = (s.correct || []).filter((t) => t > from);
    return s.correct;
  }
  function flames() {
    const n = recentRight().length, need = GP.C.trivia.need;
    return Array.from({ length: need }, (_, i) => (i < n ? "🔥" : "⚪")).join("") + (n > need ? ` +${n - need}` : "");
  }

  // Levels: every `perLevel` right answers = next level (harder pool, bigger reward).
  // `maxMisses` wrong answers = back to level 1. Past the last level the reward keeps growing.
  const LVL = { e: "Easy", m: "Medium", h: "Hard", x: "Expert" };
  function level() {
    const s = GP.state(), T = GP.C.trivia, L = T.levels;
    s.trivia = s.trivia || { right: 0, wrong: 0 };
    const n = Math.floor(s.trivia.right / T.perLevel), top = L.length - 1, lv = L[Math.min(n, top)];
    const extra = Math.max(0, n - top), bonus = T.bonusPerExtra || {};
    const reward = {};
    for (const k of new Set([...Object.keys(lv.reward), ...Object.keys(bonus)])) reward[k] = (lv.reward[k] || 0) + extra * (bonus[k] || 0);
    return { n: n + 1, name: lv.name + (extra ? ` +${extra}` : ""), pool: lv.pool, reward, toNext: T.perLevel - (s.trivia.right % T.perLevel) };
  }
  const misses = () => {
    const s = GP.state(), m = GP.C.trivia.maxMisses;
    return Array.from({ length: m }, (_, i) => (i < s.trivia.wrong ? "❌" : "⚪")).join("");
  };
  const levelLine = (lv) => `<b>Level ${lv.n} · ${GP.esc(lv.name)}</b> · ${lv.toNext} right to level up · ${GP.prizeText(lv.reward)} each<br>Misses ${misses()}`;

  function trivia() {
    const all = bank();
    if (!all.length) { body.innerHTML = `<p>No questions loaded.</p>`; return; }
    const s = GP.state(), lv = level();
    const inLevel = all.filter((q) => lv.pool.includes(q.lvl));
    let pool = inLevel.filter((q) => !s.seen.includes(q.id));
    if (!pool.length) { const ids = new Set(inLevel.map((q) => q.id)); s.seen = s.seen.filter((id) => !ids.has(id)); pool = inLevel; }
    const q = pool[Math.floor(Math.random() * pool.length)];
    const answers = shuffle([q.right, ...q.wrong]);
    body.innerHTML = `
      <p class="gp-level" data-level>${levelLine(lv)}</p>
      <p class="gp-streak" aria-label="Right answers toward On Fire">${flames()} <small>${GP.C.trivia.need} right in ${GP.C.trivia.windowHours}h = On Fire for ${GP.C.trivia.fireHours || 18}h</small>
        <button type="button" class="gp-link" data-refire>🔄 Reset 🔥</button></p>
      <p class="gp-q"><span class="gp-lvl ${q.lvl}">${LVL[q.lvl] || q.lvl}</span> ${GP.esc(q.q)}</p>
      <div class="gp-answers">${answers.map((a, i) => `<button type="button" data-a="${i}">${GP.esc(a)}</button>`).join("")}</div>
      <p class="gp-result" aria-live="polite"></p>`;
    body.querySelector("[data-a]").focus({ preventScroll: true });
    // Start the 🔥 over: ends On Fire now and clears the right-answer streak.
    body.querySelector("[data-refire]").onclick = () => {
      if (!confirm("Reset your 🔥? On Fire ends now and your streak starts over at 0.")) return;
      s.correct = []; s.fireUntil = Math.min(s.fireUntil || 0, Date.now());
      GP.touch(); trivia();
    };
    body.querySelector(".gp-answers").addEventListener("click", (e) => {
      const b = e.target.closest("[data-a]");
      if (!b || body.querySelector(".gp-answers").dataset.answered) return;
      body.querySelector(".gp-answers").dataset.answered = "1";
      const ok = answers[+b.dataset.a] === q.right;
      body.querySelectorAll("[data-a]").forEach((x) => {
        x.disabled = true;
        if (answers[+x.dataset.a] === q.right) x.classList.add("right");
      });
      if (!ok) b.classList.add("wrong");
      s.seen.push(q.id);
      const res = body.querySelector(".gp-result");
      if (ok) {
        const wasFire = GP.isFire(), T = GP.C.trivia;
        s.correct.push(Date.now());
        s.trivia.right++;
        // `need` right inside the window = 🔥 On Fire for fireHours; the streak starts over.
        if (recentRight().length >= T.need && !(s.fireUntil > Date.now())) {
          s.fireUntil = Date.now() + (T.fireHours || 18) * 3.6e6;
          s.correct = [];
        }
        GP.grant(lv.reward);
        res.innerHTML = `✅ ${pick(["Nothing but net!", "Bucket!", "Swish!", "And one!", "Money!"])} ${GP.prizeText(lv.reward)}`;
        const up = level();
        if (up.n > lv.n) { res.innerHTML += `<br><b>⬆️ LEVEL UP! Level ${up.n}: ${GP.esc(up.name)}</b>`; GP.toast(`⬆️ Trivia level ${up.n}: ${up.name}!`); }
        if (!wasFire && GP.isFire()) { res.innerHTML += `<br><b>🔥 YOU'RE ON FIRE! 🔥</b>`; GP.toast(`🔥 ON FIRE for ${T.fireHours || 18} hours!`); }
      } else {
        s.trivia.wrong++;
        res.innerHTML = `❌ ${pick(["Airball!", "Brick!", "Rejected!", "So close!"])} It was <b>${GP.esc(q.right)}</b>.`;
        if (s.trivia.wrong >= GP.C.trivia.maxMisses) {
          s.trivia = { right: 0, wrong: 0 };
          res.innerHTML += `<br><b>${GP.C.trivia.maxMisses} misses: back to Level 1 (${GP.esc(GP.C.trivia.levels[0].name)}).</b>`;
        }
        GP.touch();
      }
      body.querySelector("[data-level]").innerHTML = levelLine(level());
      body.querySelector(".gp-streak").firstChild.textContent = flames() + " ";
      res.insertAdjacentHTML("afterend", `<div class="gp-row"><button type="button" class="primary" data-next>Next question</button><button type="button" data-done>Done</button></div>`);
      body.querySelector("[data-next]").focus({ preventScroll: true });
      body.querySelector("[data-next]").onclick = trivia;
    });
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ---------- Gravity Pong ----------
  // Paddle on the left (move with mouse/finger or arrow keys). Tap to launch; a power
  // meter swings while you hold the ball, so time your tap. Tap in the air to bump the
  // ball up. Score through the hoop on the right. Ball hits the floor = game over.
  function pong() {
    const P = GP.C.pong, W = 320, H = 220, FLOOR = H - 8;
    const RIM = { x1: 258, x2: 292, y: 86 }, BOARD = { x: 298, top: 44, bottom: 104 };
    let ball = P.balls[0], score = 0, over = false, raf = 0, meter = 0, mt = 0;
    const pad = { x: 12, y: H / 2, w: 8, h: 48 };
    const b = { x: 0, y: 0, vx: 0, vy: 0, r: 8, held: true };

    body.innerHTML = `
      <div class="gp-pong-top"><span>Score <b class="num" data-score>0</b></span><span>Best <b class="num">${GP.state().pongBest || 0}</b></span></div>
      <canvas class="gp-pong" width="${W}" height="${H}" tabindex="0" aria-label="Gravity Pong. Move the paddle with the arrow keys, Space to launch or bump."></canvas>
      <div class="gp-balls" role="radiogroup" aria-label="Ball">${P.balls.map((x, i) =>
        `<button type="button" role="radio" data-ball="${i}" aria-checked="${i === 0}">${x.icon} ${x.label}<small>${x.points} pt${x.points > 1 ? "s" : ""}</small></button>`).join("")}</div>
      <p class="gp-foot">Tap to shoot when the meter is in the green. Tap again in the air to bump it up. Don't let it hit the floor!</p>`;
    const cv = body.querySelector("canvas"), ctx = cv.getContext("2d");
    const dpr = Math.min(3, devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);

    const hold = () => { b.held = true; b.vx = b.vy = 0; meter = 0; mt = 0; };
    hold();
    const ballBtns = body.querySelectorAll("[data-ball]");
    const setBalls = () => ballBtns.forEach((x) => { x.disabled = !b.held || over; x.setAttribute("aria-checked", String(P.balls[+x.dataset.ball] === ball)); });
    body.querySelector(".gp-balls").addEventListener("click", (e) => {
      const x = e.target.closest("[data-ball]");
      if (x && b.held) { ball = P.balls[+x.dataset.ball]; setBalls(); cv.focus({ preventScroll: true }); }
    });

    // Perfect launch lands in the rim centre with the meter at 0.5; off-centre over/undershoots.
    function launch() {
      const g = ball.gravity, apex = RIM.y - 46, target = (RIM.x1 + RIM.x2) / 2;
      const rise = Math.max(4, b.y - apex);
      const vy = -Math.sqrt(2 * g * rise), t = -vy / g + Math.sqrt(2 * (RIM.y - apex) / g);
      b.vy = vy; b.vx = ((target - b.x) / t) * (0.75 + meter * 0.5); b.held = false;
      setBalls();
    }
    function tap() {
      if (over) return;
      if (b.held) launch();
      else b.vy = Math.max(b.vy - P.bump, -9);
    }
    const toY = (e) => { const r = cv.getBoundingClientRect(); return ((e.clientY - r.top) / r.height) * H; };
    const movePad = (y) => { pad.y = Math.max(pad.h / 2, Math.min(FLOOR - pad.h / 2, y)); };
    cv.addEventListener("pointermove", (e) => movePad(toY(e)));
    cv.addEventListener("pointerdown", (e) => { e.preventDefault(); movePad(toY(e)); tap(); });
    cv.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp") movePad(pad.y - 14);
      else if (e.key === "ArrowDown") movePad(pad.y + 14);
      else if (e.key === " " || e.key === "Enter") tap();
      else return;
      e.preventDefault();
    });

    function bounceOff(px, py) {
      const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy);
      if (d >= b.r + 2 || d === 0) return;
      const nx = dx / d, ny = dy / d, dot = b.vx * nx + b.vy * ny;
      if (dot < 0) { b.vx -= 1.7 * dot * nx; b.vy -= 1.7 * dot * ny; }
      b.x = px + nx * (b.r + 2); b.y = py + ny * (b.r + 2);
    }
    function step() {
      if (b.held) {
        b.x = pad.x + pad.w + b.r + 1; b.y = pad.y;
        mt += 0.045; meter = (Math.sin(mt) + 1) / 2;
        return;
      }
      const py = b.y;
      b.vy += ball.gravity; b.x += b.vx; b.y += b.vy;
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.5; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.6; }
      if (b.x + b.r > BOARD.x && b.x < BOARD.x + 4 && b.y > BOARD.top && b.y < BOARD.bottom) { b.x = BOARD.x - b.r; b.vx = -Math.abs(b.vx) * 0.7; }
      bounceOff(RIM.x1, RIM.y); bounceOff(RIM.x2, RIM.y);
      // Swish: crossing the rim line going down, between the two rim ends.
      if (py < RIM.y && b.y >= RIM.y && b.vy > 0 && b.x > RIM.x1 + 3 && b.x < RIM.x2 - 3) {
        score += ball.points;
        body.querySelector("[data-score]").textContent = score;
        flash = { t: 40, text: `+${ball.points}` };
        hold(); setBalls();
        return;
      }
      // Paddle: pong-style bounce back toward the hoop.
      if (b.vx < 0 && b.x - b.r <= pad.x + pad.w && b.x - b.r > pad.x - 10 && Math.abs(b.y - pad.y) < pad.h / 2 + b.r) {
        b.x = pad.x + pad.w + b.r;
        b.vx = Math.max(2.5, Math.abs(b.vx) * 0.95);
        b.vy = Math.min(b.vy, 0) - 3 + ((b.y - pad.y) / (pad.h / 2)) * 1.5;
      }
      if (b.y + b.r >= FLOOR || b.x < -b.r) end();
    }
    let flash = null;
    function draw() {
      const css = getComputedStyle(box);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#1d2b1a"; ctx.fillRect(0, 0, W, H);                      // court
      ctx.fillStyle = "#c98a4b"; ctx.fillRect(0, FLOOR, W, H - FLOOR);
      ctx.strokeStyle = "rgba(255,255,255,.08)";
      for (let x = 0; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FLOOR); ctx.stroke(); }
      ctx.fillStyle = "#e9ebe6"; ctx.fillRect(BOARD.x, BOARD.top, 4, BOARD.bottom - BOARD.top);   // backboard
      ctx.fillStyle = "#888"; ctx.fillRect(BOARD.x + 4, BOARD.top + 20, 18, 4);
      ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 1;                               // net
      for (let i = 0; i <= 4; i++) {
        const x = RIM.x1 + ((RIM.x2 - RIM.x1) * i) / 4;
        ctx.beginPath(); ctx.moveTo(x, RIM.y); ctx.lineTo((RIM.x1 + RIM.x2) / 2 + (x - (RIM.x1 + RIM.x2) / 2) * 0.5, RIM.y + 22); ctx.stroke();
      }
      ctx.strokeStyle = "#ff5a1f"; ctx.lineWidth = 3;                                             // rim
      ctx.beginPath(); ctx.moveTo(RIM.x1, RIM.y); ctx.lineTo(RIM.x2 + 6, RIM.y); ctx.stroke();
      ctx.fillStyle = "#f2b632"; ctx.fillRect(pad.x, pad.y - pad.h / 2, pad.w, pad.h);           // paddle
      ctx.fillStyle = ball.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 1; ctx.stroke();
      if (b.held && !over) {                                                                       // power meter
        const mx = 30, my = FLOOR - 16, mw = 110;
        ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(mx, my, mw, 8);
        ctx.fillStyle = "#3fbf6a"; ctx.fillRect(mx + mw * 0.43, my, mw * 0.14, 8);
        ctx.fillStyle = "#fff"; ctx.fillRect(mx + mw * meter - 1, my - 3, 3, 14);
      }
      if (flash && flash.t-- > 0) {
        ctx.fillStyle = "#ffd84a"; ctx.font = "bold 22px " + (css.getPropertyValue("--display") || "sans-serif");
        ctx.fillText(flash.text, RIM.x1 - 6, RIM.y - 14 - (40 - flash.t) / 2);
      }
      if (over) {
        ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 0, W, H);
      }
    }
    let last = performance.now(), acc = 0;
    function loop(now) {
      acc += Math.min(100, now - last); last = now;
      while (acc >= 1000 / 60) { if (!over) step(); acc -= 1000 / 60; }
      draw();
      if (!over) raf = requestAnimationFrame(loop);
    }
    function end() {
      over = true; setBalls();
      const s = GP.state();
      const tokens = Math.min(P.maxTokens, Math.floor(score / P.pointsPerToken));
      const best = score > (s.pongBest || 0);
      if (best) s.pongBest = score;
      if (tokens) GP.grant({ tokens }); else GP.touch();
      draw();
      const msg = document.createElement("div");
      msg.className = "gp-pong-over";
      msg.innerHTML = `<p><b>${score ? "Game over!" : "Brick! Game over."}</b> Score ${score}${best && score ? " · 🏆 New best!" : ""}${tokens ? ` · +${tokens} 🪙` : ""}</p>
        <div class="gp-row"><button type="button" class="primary" data-again>Play again</button><button type="button" data-done>Done</button></div>`;
      body.querySelector(".gp-foot").replaceWith(msg);
      msg.querySelector("[data-again]").onclick = () => start("pong", "Gravity Pong", pong);
      msg.querySelector("[data-again]").focus({ preventScroll: true });
    }
    setBalls();
    cv.focus({ preventScroll: true });
    raf = requestAnimationFrame(loop);
    return () => { over = true; cancelAnimationFrame(raf); };
  }

  // ---------- Prize Wheel ----------
  // cost 0 = unlimited free spins.
  const unlimited = () => !GP.C.roulette.cost;
  const spinsLeft = () => {
    if (unlimited()) return Infinity;
    const s = GP.state(), day = new Date().toDateString();
    if (s.spinDay !== day) { s.spinDay = day; s.freeDaily = GP.C.roulette.freePerDay; }
    return (s.freeDaily || 0) + (s.freeSpins || 0);
  };
  function wheel() {
    const R = GP.C.roulette, n = R.prizes.length, seg = 360 / n;
    const grad = R.prizes.map((p, i) => `${p.color} ${i * seg}deg ${(i + 1) * seg}deg`).join(", ");
    let angle = 0, spinning = false;
    body.innerHTML = `
      <div class="gp-wheel-wrap"><span class="gp-pointer" aria-hidden="true">▼</span>
        <div class="gp-wheel" style="background: conic-gradient(${grad})">
          ${R.prizes.map((p, i) => `<span style="transform: rotate(${i * seg + seg / 2}deg)"><i>${p.icon}</i></span>`).join("")}
        </div></div>
      <p class="gp-result" aria-live="polite"></p>
      <div class="gp-row"><button type="button" class="primary" data-spin></button><button type="button" data-done>Done</button></div>
      <details class="gp-odds"><summary>What's on the wheel</summary><ul>${R.prizes.map((p) => `<li>${p.icon} ${GP.esc(p.label)}: ${GP.prizeText(p.fx)}</li>`).join("")}</ul></details>`;
    const wheelEl = body.querySelector(".gp-wheel"), btn = body.querySelector("[data-spin]"), res = body.querySelector(".gp-result");
    const label = () => {
      const free = spinsLeft();
      btn.textContent = unlimited() ? "Spin! (free)" : free ? `Spin! (${free} free)` : `Spin for 🪙${R.cost}`;
      btn.disabled = spinning || (!free && GP.state().tokens < R.cost);
    };
    label();
    btn.onclick = () => {
      const s = GP.state();
      if (spinning) return;
      if (unlimited()) { /* free */ }
      else if (spinsLeft()) { if (s.freeDaily > 0) s.freeDaily--; else s.freeSpins--; }
      else if (s.tokens >= R.cost) s.tokens -= R.cost;
      else return;
      GP.touch();
      spinning = true; label(); res.textContent = "";
      const i = R.prizes.indexOf(GP.pickWeighted(R.prizes)), p = R.prizes[i];
      // The prize is yours as soon as the wheel starts, so closing mid-spin loses nothing.
      GP.grant(p.fx, false);
      // Land the chosen slice under the pointer at the top, somewhere inside the slice.
      const within = seg * (0.2 + Math.random() * 0.6);
      angle += 360 * 5 + ((360 - (i * seg + within) - (angle % 360)) + 360) % 360;
      const done = () => {
        if (!spinning) return;
        spinning = false;
        GP.play("cheer", 1200);
        res.innerHTML = `${p.icon} <b>${GP.esc(p.label)}!</b> ${GP.prizeText(p.fx)}`;
        label();
      };
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) { wheelEl.style.transform = `rotate(${angle}deg)`; done(); return; }
      wheelEl.style.transform = `rotate(${angle}deg)`;
      wheelEl.addEventListener("transitionend", done, { once: true });
    };
    btn.focus({ preventScroll: true });
  }

  // ---------- cards for the panel's Games tab ----------
  window.GP_GAMES = {
    cards() {
      const s = GP.state(), T = GP.C.trivia, R = GP.C.roulette;
      const n = recentRight().length, free = spinsLeft(), lv = level();
      return [
        { id: "trivia", icon: "🧠", label: "Hoops Trivia",
          sub: `Level ${lv.n} ${lv.name} · ` + (GP.isFire() && s.fireUntil > Date.now() ? "🔥 On Fire!" : `${Math.min(n, T.need)}/${T.need} toward 🔥`) },
        { id: "pong", icon: "🏀", label: "Gravity Pong", sub: `Best ${s.pongBest || 0} · ${GP.C.pong.pointsPerToken} pts = 1 🪙` },
        { id: "wheel", icon: "🎰", label: "Prize Wheel",
          sub: unlimited() ? "Unlimited free spins!" : free ? `${free} free spin${free > 1 ? "s" : ""} ready!` : `Spin for 🪙${R.cost}`,
          disabled: !free && s.tokens < R.cost ? "Not enough tokens" : "" },
      ];
    },
    open(id) {
      if (!ready()) return;
      if (id === "trivia") start("trivia", "Hoops Trivia", trivia);
      if (id === "pong") start("pong", "Gravity Pong", pong);
      if (id === "wheel") start("wheel", "Prize Wheel", wheel);
    },
  };
})();
