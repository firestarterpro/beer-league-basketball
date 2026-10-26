// Toys: sounds, the theme bar and the effects every page shares (Jason's effects pack, 2026-10-24).
// All of it is decoration: if a toy fails, the page still works. Page toys (Home, Polls, Actions...)
// live in their own scripts and use what this file puts on window.BL:
//   BL.sfx(name)            play one of the code-made sounds (Web Audio, nothing to download)
//   BL.fx.static(mid)       CRT static wipe over the page; mid() runs at its peak
//   BL.fx.confetti(x, y)    glitter burst at a screen point
//   BL.fx.stamp(el, text)   thud a rubber stamp onto el
//   BL.fx.slime(force)      drop gutter slime (#4); force skips the dice roll
//   BL.calm()               true when the visitor asked for reduced motion
// Saved on this device: bl.theme (theme pick), bl.sound ("off" mutes), bl.slime ("off"), bl.punches (Sync punch card).
(function () {
  const BL = (window.BL = window.BL || {});
  const get = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  BL.calm = calm;
  BL.store = { get, set };
  BL.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- Sounds: made in code, so there are no files to load ----------
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, out = null, noise = null;
  const last = {};
  function audio() {
    if (!AC) return null;
    if (!ctx) {
      try {
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        out = ctx.createGain(); out.gain.value = 0.55;
        out.connect(comp).connect(ctx.destination);
      } catch { ctx = null; return null; }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }
  function noiseBuf(c) {
    if (noise) return noise;
    const len = Math.floor(c.sampleRate * 1.6), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (noise = b);
  }
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  // A plain oscillator note, optionally sliding from f to f2.
  function tone(c, dest, { type = "sine", f, f2, t, a = 0.005, d = 0.2, v = 0.3 }) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    env(g, t, a, v, d); o.connect(g).connect(dest); o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  // Filtered noise: hiss, clicks, swishes.
  function hiss(c, dest, { t, a = 0.005, d = 0.2, v = 0.3, type = "bandpass", f = 2000, f2, q = 1 }) {
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf(c); fl.type = type; fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    fl.Q.value = q; env(g, t, a, v, d);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 0.9); s.stop(t + a + d + 0.05);
  }
  // A note whose pitch wobbles (creaky door, pea whistle).
  function warble(c, dest, { type = "sine", f, f2, rate, depth, t, a, d, v, filter }) {
    const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.linearRampToValueAtTime(f2, t + a + d);
    lfo.frequency.value = rate; lg.gain.value = depth; lfo.connect(lg).connect(o.frequency);
    env(g, t, a, v, d);
    let node = o;
    if (filter) { const fl = c.createBiquadFilter(); fl.type = "bandpass"; fl.frequency.value = filter; fl.Q.value = 2; o.connect(fl); node = fl; }
    node.connect(g).connect(dest); o.start(t); lfo.start(t); o.stop(t + a + d + 0.05); lfo.stop(t + a + d + 0.05);
  }
  const SFX = {
    "velcro-rip": (c, o, t) => { for (let i = 0; i < 15; i++) hiss(c, o, { t: t + i * 0.021 + rnd(0, 0.008), a: 0.002, d: 0.017, v: rnd(0.22, 0.45), f: rnd(2200, 5000), q: 0.8 }); },
    "tv-static": (c, o, t) => hiss(c, o, { t, a: 0.01, d: 0.3, v: 0.2, type: "highpass", f: 1400 }),
    "punch": (c, o, t) => { hiss(c, o, { t, a: 0.001, d: 0.03, v: 0.5, f: 3200, q: 2 }); tone(c, o, { f: 190, f2: 60, t, d: 0.09, v: 0.5 }); },
    "tama-chirp": (c, o, t) => { tone(c, o, { type: "square", f: 1760, t, d: 0.06, v: 0.09 }); tone(c, o, { type: "square", f: 2349, t: t + 0.09, d: 0.08, v: 0.09 }); },
    "shelf-beep": (c, o, t) => tone(c, o, { type: "square", f: 1975, t, a: 0.002, d: 0.06, v: 0.05 }),
    "slime-splat": (c, o, t) => { hiss(c, o, { t, a: 0.004, d: 0.26, v: 0.45, type: "lowpass", f: 1600, f2: 160, q: 7 }); tone(c, o, { f: 150, f2: 50, t, d: 0.22, v: 0.35 }); },
    "channel-click": (c, o, t) => { hiss(c, o, { t, a: 0.001, d: 0.012, v: 0.45, type: "highpass", f: 2000 }); hiss(c, o, { t: t + 0.045, a: 0.001, d: 0.01, v: 0.3, type: "highpass", f: 3200 }); },
    "card-flip": (c, o, t) => hiss(c, o, { t, a: 0.012, d: 0.08, v: 0.32, f: 1800, f2: 5200, q: 1.2 }),
    "vhs-slide": (c, o, t) => {
      hiss(c, o, { t, a: 0.03, d: 0.38, v: 0.22, type: "lowpass", f: 500, f2: 2600, q: 3 });
      tone(c, o, { type: "sawtooth", f: 58, t, a: 0.05, d: 0.34, v: 0.04 });
      tone(c, o, { f: 230, f2: 90, t: t + 0.42, d: 0.07, v: 0.32 });
    },
    "aim-door-open": (c, o, t) => warble(c, o, { type: "sawtooth", f: 360, f2: 560, rate: 26, depth: 45, t, a: 0.04, d: 0.5, v: 0.14, filter: 1300 }),
    "sticker-slap": (c, o, t) => { hiss(c, o, { t, a: 0.001, d: 0.05, v: 0.5, type: "lowpass", f: 2600 }); tone(c, o, { f: 170, f2: 90, t, d: 0.06, v: 0.35 }); },
    "sticker-peel": (c, o, t) => hiss(c, o, { t, a: 0.16, d: 0.14, v: 0.2, f: 1400, f2: 6400, q: 4 }),
    "locker-slam": (c, o, t) => {
      [212, 563, 921, 1340, 1810].forEach((f, i) => tone(c, o, { f, t, a: 0.001, d: 0.55 - i * 0.08, v: 0.11 }));
      hiss(c, o, { t, a: 0.001, d: 0.09, v: 0.55, type: "lowpass", f: 900 });
    },
    "pencil-scratch": (c, o, t) => { for (let i = 0; i < 4; i++) hiss(c, o, { t: t + i * 0.035, a: 0.004, d: 0.025, v: 0.07, f: rnd(4500, 6500), q: 3 }); },
    "honk": (c, o, t) => {
      const fl = c.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 1900; fl.connect(o);
      tone(c, fl, { type: "sawtooth", f: 330, f2: 296, t, a: 0.02, d: 0.3, v: 0.17 });
      tone(c, fl, { type: "sawtooth", f: 337, f2: 302, t, a: 0.02, d: 0.3, v: 0.17 });
    },
    "whistle-fweet": (c, o, t) => {
      warble(c, o, { f: 2900, rate: 31, depth: 190, t, a: 0.012, d: 0.42, v: 0.13 });
      hiss(c, o, { t, a: 0.01, d: 0.4, v: 0.05, f: 3000, q: 2 });
    },
    "buzzer": (c, o, t) => { tone(c, o, { type: "square", f: 110, t, a: 0.005, d: 0.65, v: 0.1 }); tone(c, o, { type: "square", f: 117, t, a: 0.005, d: 0.65, v: 0.1 }); },
    "ollie": (c, o, t) => {
      hiss(c, o, { t, a: 0.001, d: 0.04, v: 0.6, type: "lowpass", f: 3000 }); tone(c, o, { f: 150, f2: 60, t, d: 0.08, v: 0.4 });
      hiss(c, o, { t: t + 0.34, a: 0.001, d: 0.05, v: 0.5, type: "lowpass", f: 2500 }); tone(c, o, { f: 125, f2: 50, t: t + 0.34, d: 0.1, v: 0.4 });
    },
    "helper-pop": (c, o, t) => tone(c, o, { f: 520, f2: 1450, t, a: 0.003, d: 0.08, v: 0.22 }),
    "xp-ding": (c, o, t) => { tone(c, o, { f: 1318, t, a: 0.005, d: 0.5, v: 0.12 }); tone(c, o, { f: 1975, t: t + 0.12, a: 0.005, d: 0.7, v: 0.1 }); },
    "register-ding": (c, o, t) => {
      hiss(c, o, { t, a: 0.001, d: 0.04, v: 0.3, f: 2500 });
      [2637, 3520, 5274].forEach((f, i) => tone(c, o, { f, t: t + 0.06, a: 0.002, d: 0.9 - i * 0.22, v: 0.09 }));
    },
    "stamp-thud": (c, o, t) => { tone(c, o, { f: 115, f2: 45, t, a: 0.002, d: 0.14, v: 0.6 }); hiss(c, o, { t, a: 0.001, d: 0.05, v: 0.35, type: "lowpass", f: 700 }); },
  };
  const soundOn = () => get("bl.sound") !== "off";
  BL.sfx = (name) => {
    if (!soundOn() || !SFX[name]) return;
    const now = performance.now();
    if (now - (last[name] || 0) < 45) return;   // the same sound twice in a blink is just noise
    last[name] = now;
    const c = audio();
    if (!c) return;
    try { SFX[name](c, out, c.currentTime + 0.01); } catch {}
  };
  BL.sfx.names = Object.keys(SFX);
  BL.buzz = (ms = 15) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

  // ---------- Effects ----------
  BL.fx = {
    static(mid, ms = 340) {
      BL.sfx("tv-static");
      if (calm()) { if (mid) mid(); return; }
      const el = document.createElement("div");
      el.className = "fx-static"; el.style.setProperty("--fx-ms", ms + "ms");
      document.body.appendChild(el);
      const main = document.querySelector("main");
      if (main) main.classList.add("fx-flash");
      setTimeout(() => { if (main) main.classList.remove("fx-flash"); if (mid) mid(); }, ms * 0.45);
      setTimeout(() => el.remove(), ms + 40);
    },
    teamSwitch(go) {
      const picker = document.querySelector(".picker");
      BL.sfx("velcro-rip"); BL.buzz(12);
      if (picker && !calm()) { picker.classList.remove("rip"); void picker.offsetWidth; picker.classList.add("rip"); }
      setTimeout(() => BL.fx.static(go), calm() ? 0 : 140);
    },
    confetti(x, y, { count = 70, colors = ["#ff2fb3", "#ffd200", "#00e5ff", "#7b2ff7", "#39ff6a", "#ffffff"], spread = 1 } = {}) {
      if (calm()) return;
      const cv = document.createElement("canvas"), dpr = Math.min(2, devicePixelRatio || 1);
      cv.className = "fx-confetti"; cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
      document.body.appendChild(cv);
      const g = cv.getContext("2d"); g.scale(dpr, dpr);
      const bits = Array.from({ length: count }, () => {
        const a = rnd(0, Math.PI * 2), s = rnd(2, 8) * spread;
        return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - rnd(2, 5), r: rnd(2, 5), c: colors[Math.floor(rnd(0, colors.length))],
                 spin: rnd(-0.3, 0.3), rot: rnd(0, 6), star: Math.random() < 0.3 };
      });
      const t0 = performance.now();
      (function frame(t) {
        const age = (t - t0) / 1000;
        g.clearRect(0, 0, innerWidth, innerHeight);
        for (const b of bits) {
          b.vy += 0.22; b.vx *= 0.985; b.x += b.vx; b.y += b.vy; b.rot += b.spin;
          g.save(); g.globalAlpha = Math.max(0, 1 - age / 1.4); g.translate(b.x, b.y); g.rotate(b.rot); g.fillStyle = b.c;
          if (b.star) { g.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? b.r * 0.4 : b.r * 1.3; g.lineTo(Math.cos(i * Math.PI / 4) * rr, Math.sin(i * Math.PI / 4) * rr); } g.fill(); }
          else g.fillRect(-b.r, -b.r / 2, b.r * 2, b.r);
          g.restore();
        }
        if (age < 1.4) requestAnimationFrame(frame); else cv.remove();
      })(t0);
    },
    // A rubber stamp that thuds onto el (positioned by the caller's CSS) and stays.
    stamp(el, text, tone = "bad", cls = "") {
      const s = document.createElement("span");
      s.className = `stamp thud ${tone} ${cls}`.trim(); s.textContent = text;
      el.appendChild(s); BL.sfx("stamp-thud"); BL.buzz(10);
      return s;
    },
    slime(force, at) { return dropSlime(force, at); },
  };

  // ---------- Gutter slime (#4): random goo in the outer 32px; wipe it with a sponge ----------
  const SLIME_W = 32;
  const slimeAllowed = () => innerWidth >= 768 && get("bl.slime") !== "off";
  function gooFilter() {
    if (document.getElementById("bl-goo")) return;
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("width", "0"); s.setAttribute("height", "0"); s.setAttribute("aria-hidden", "true");
    s.style.position = "absolute";
    s.innerHTML = '<filter id="bl-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b"/>'
      + '<feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -6"/></filter>';
    document.body.appendChild(s);
  }
  // Would a strip at this side cover text? Containers are fine; text, buttons, images and inputs are not.
  const BOXES = new Set(["HTML", "BODY", "MAIN", "DIV", "SECTION", "ARTICLE", "ASIDE", "HEADER", "FOOTER", "FORM", "UL", "OL", "CANVAS", "NAV", "FIELDSET", "DETAILS"]);
  function stripFree(side, top, h) {
    const xs = side === "l" ? [4, 16, 30] : [innerWidth - 4, innerWidth - 16, innerWidth - 30];
    for (let y = top; y < Math.min(innerHeight, top + h); y += 18) {
      for (const x of xs) {
        for (const el of document.elementsFromPoint(x, y)) {
          if (el.classList && el.classList.contains("slime")) continue;
          if (!BOXES.has(el.tagName)) return false;
        }
      }
    }
    return true;
  }
  let slimeNow = null;
  // at: { side: "l" | "r", top } puts the slime back where it was before a reload.
  function dropSlime(force, at) {
    if (!slimeAllowed() || slimeNow) return null;
    if (!force && Math.random() > 0.13) return null;
    const head = document.querySelector("header");
    const top = at && at.top ? at.top : Math.round(Math.max(head ? head.getBoundingClientRect().bottom : 0, 0) + rnd(8, 160));
    const h = Math.round(rnd(170, 260));
    let side = at && at.side ? at.side : Math.random() < 0.5 ? "l" : "r";
    if (!stripFree(side, top, h)) { side = side === "l" ? "r" : "l"; if (!stripFree(side, top, h)) return null; }
    gooFilter();
    const cv = document.createElement("canvas"), dpr = Math.min(2, devicePixelRatio || 1);
    cv.className = `slime ${side}`; cv.dataset.side = side; cv.width = SLIME_W * dpr; cv.height = h * dpr;
    cv.style.top = top + "px"; cv.style.height = h + "px";
    cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "Slime! Rub it to wipe it off.");
    document.body.appendChild(cv);
    slimeNow = cv;
    const g = cv.getContext("2d"); g.scale(dpr, dpr);
    const wipe = document.createElement("canvas"); wipe.width = cv.width; wipe.height = cv.height;
    const wg = wipe.getContext("2d"); wg.scale(dpr, dpr);
    const y0 = rnd(20, 34), R = rnd(13, 17);
    const drips = Array.from({ length: 3 }, (_, i) => ({ x: 5 + i * 8 + rnd(-1, 2), w: rnd(5, 8.5), len: 0, max: rnd(30, h - y0 - 24), speed: rnd(18, 46) }));
    let wiped = 0, t0 = performance.now(), prev = t0, gone = false;
    setTimeout(() => BL.sfx("slime-splat"), 380);
    function draw(t) {
      if (gone) return;
      const dt = Math.min(0.05, (t - prev) / 1000); prev = t;
      g.clearRect(0, 0, SLIME_W, h);
      g.save();
      if (side === "r") { g.translate(SLIME_W, 0); g.scale(-1, 1); }
      const grad = g.createLinearGradient(0, 0, SLIME_W, 0);
      grad.addColorStop(0, "#3d8c10"); grad.addColorStop(0.55, "#74cc33"); grad.addColorStop(1, "#a4ea63");
      g.fillStyle = grad;
      g.beginPath(); g.ellipse(0, y0, R + 9, R + 14, 0, 0, Math.PI * 2); g.fill();
      for (const d of drips) {
        if (t - t0 > 500 && d.len < d.max) d.len = Math.min(d.max, d.len + d.speed * dt * (1 - d.len / (d.max + 20)));
        const wob = Math.sin(t / 420 + d.x) * 0.8;
        g.beginPath(); g.roundRect ? g.roundRect(d.x - d.w / 2, y0, d.w, d.len + 1, d.w / 2) : g.rect(d.x - d.w / 2, y0, d.w, d.len + 1); g.fill();
        g.beginPath(); g.arc(d.x, y0 + d.len, d.w * 0.72 + wob * 0.3, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = "rgb(255 255 255 / .38)";
      g.beginPath(); g.ellipse(R * 0.5, y0 - R * 0.45, 2.6, 5.5, -0.35, 0, Math.PI * 2); g.fill();
      g.restore();
      if (wiped) { g.globalCompositeOperation = "destination-out"; g.drawImage(wipe, 0, 0, SLIME_W, h); g.globalCompositeOperation = "source-over"; }
      if (!calm() || t - t0 < 50) requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    if (calm()) { drips.forEach((d) => (d.len = d.max * 0.6)); }
    function rub(e) {
      const r = cv.getBoundingClientRect();
      wg.fillStyle = "#000"; wg.beginPath(); wg.arc(e.clientX - r.left, e.clientY - r.top, 15, 0, Math.PI * 2); wg.fill();
      wiped++;
      if (calm()) requestAnimationFrame(draw);
      if (wiped % 4 === 1) BL.sfx("sticker-peel");
      if (wiped % 3 === 0) checkClean();
    }
    let peak = 0;
    function checkClean() {   // dry once 70% of the goo is gone
      const px = g.getImageData(0, 0, cv.width, cv.height).data;
      let on = 0; for (let i = 3; i < px.length; i += 16) if (px[i] > 40) on++;
      peak = Math.max(peak, on);
      if (peak && on < peak * 0.3) dry();
    }
    function dry() {
      if (gone) return;
      cv.classList.add("dry");
      setTimeout(() => { gone = true; cv.remove(); if (slimeNow === cv) slimeNow = null; }, 1200);
    }
    let down = false;
    cv.addEventListener("pointerdown", (e) => { down = true; cv.setPointerCapture(e.pointerId); rub(e); });
    cv.addEventListener("pointermove", (e) => { if (down) rub(e); });
    cv.addEventListener("pointerup", () => { down = false; checkClean(); });
    cv.addEventListener("pointercancel", () => { down = false; });
    setTimeout(dry, 120000);   // dries up on its own after 2 minutes
    return cv;
  }

  // ---------- Theme bar: each page has its own theme; a pick here wins on every page ----------
  function setupThemeBar() {
    const sel = document.getElementById("theme-picker");
    if (sel) {
      const valid = (k) => [...sel.options].some((o) => o.value === k);
      const current = () => { const s = get("bl.theme"); return s && s !== "page" && valid(s) ? s : "page"; };
      const apply = (pick) => {
        set("bl.theme", pick);
        const root = document.documentElement;
        const theme = pick === "page" ? root.dataset.pageTheme : pick;
        const fonts = (window.BL_THEME_FONTS || {})[theme];
        if (fonts) {
          let link = document.getElementById("theme-fonts");
          if (!link) { link = document.createElement("link"); link.rel = "stylesheet"; link.id = "theme-fonts"; document.head.appendChild(link); }
          link.href = `https://fonts.googleapis.com/css2?${fonts}&display=swap`;
        }
        BL.sfx("channel-click");
        if (root.dataset.theme !== theme) BL.fx.static(() => { root.dataset.theme = theme; document.dispatchEvent(new CustomEvent("bl:theme", { detail: theme })); }, 300);
      };
      sel.value = current();
      sel.addEventListener("change", () => apply(sel.value));
    }

    const sound = document.getElementById("sound-toggle");
    if (sound) {
      const paintSound = () => {
        sound.setAttribute("aria-pressed", String(soundOn()));
        sound.textContent = soundOn() ? "🔊" : "🔇";
        sound.title = soundOn() ? "Sound effects are on. Tap to mute." : "Sound effects are off. Tap to turn them on.";
      };
      sound.addEventListener("click", () => { set("bl.sound", soundOn() ? "off" : "on"); paintSound(); BL.sfx("tama-chirp"); });
      paintSound();
    }
  }

  // ---------- Close buttons: a × on each .closable card hides it until the page reloads ----------
  function setupClosers() {
    document.querySelectorAll(".closable").forEach((card) => {
      const x = document.createElement("button");
      x.type = "button"; x.className = "card-x"; x.textContent = "×";
      const h = card.querySelector("h2");
      x.setAttribute("aria-label", `Hide ${h ? h.textContent.trim() : "this section"} (it comes back when you reload)`);
      x.title = "Hide until you reload";
      x.addEventListener("click", () => {
        card.dataset.closed = "1"; card.hidden = true; BL.sfx("channel-click");
        // A grid row that's now empty goes too.
        const grid = card.parentElement;
        if (grid.classList.contains("grid") && ![...grid.children].some((c) => !c.hidden)) grid.hidden = true;
      });
      card.appendChild(x);
    });
  }

  // ---------- Sync Now: coffee punch card + Tamagotchi (#2) ----------
  // Slot centres on punchcard-blank.webp (609x409): 5 columns x 2 rows.
  const COLS = [16.4, 33.2, 49.9, 66.7, 83.4];
  const SLOTS = [...COLS.map((x) => [x, 45.2]), ...COLS.map((x) => [x, 75.8])];
  function setupSync() {
    const btn = document.getElementById("sync-now"), sync = document.getElementById("sync");
    if (!btn || !sync) return;
    const nap = document.createElement("span");
    nap.className = "sync-nap"; nap.setAttribute("aria-hidden", "true");
    nap.innerHTML = '<span class="cup"></span><span class="tama" data-face="-.-"></span><span class="zz">z z</span>';
    btn.after(nap);
    const waiting = () => sync.classList.toggle("waiting", btn.disabled);
    new MutationObserver(waiting).observe(btn, { attributes: true, attributeFilter: ["disabled"] });
    waiting();
    btn.addEventListener("click", () => { punch(btn); setTimeout(() => dropSlime(false), 900); });
  }
  let pop = null;
  function punch(btn) {
    let n = Number(get("bl.punches")) || 0;
    if (n >= 10) n = 0;
    n += 1; set("bl.punches", String(n));
    if (pop) pop.remove();
    pop = document.createElement("div");
    pop.className = "punch-pop"; pop.setAttribute("role", "status");
    pop.setAttribute("aria-label", n === 10 ? "Punch card full: free refill!" : `Punch card: ${n} of 10`);
    pop.innerHTML = SLOTS.slice(0, n).map(([x, y], i) => `<i class="slot${i === n - 1 ? " new" : ""}" style="left:${x}%;top:${y}%"></i>`).join("")
      + `<span class="pc-count">${n} / 10</span>`
      + `<span class="tama pc-tama hop" data-face="${n === 10 ? "^o^" : "°o°"}"></span><span class="pc-say">${n === 10 ? "yum!!" : "feed me!"}</span>`
      + (n === 10 ? '<span class="pc-refill">☕ Free refill!</span>' : "");
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.top = Math.round(r.bottom + 10) + "px";
    pop.style.left = Math.round(Math.min(innerWidth - w - 8, Math.max(8, r.right - w))) + "px";
    BL.sfx("punch"); BL.buzz(10);
    setTimeout(() => BL.sfx("tama-chirp"), 260);
    if (n === 10) setTimeout(() => { BL.sfx("register-ding"); BL.fx.confetti(r.left + r.width / 2, r.bottom + 60, { colors: ["#6b3e1e", "#c8873f", "#fff3d6", "#2f5d3a"] }); }, 420);
    const mine = pop;
    const close = () => { if (pop !== mine) return; mine.classList.add("out"); setTimeout(() => mine.remove(), 230); pop = null; };
    mine.addEventListener("click", close);
    setTimeout(close, n === 10 ? 4200 : 2800);
  }

  // ---------- Nav: Blockbuster aisle beeps + shelf wobble (#3) ----------
  function setupNav() {
    const nav = document.getElementById("site-nav");
    if (!nav) return;
    let lastBeep = 0;
    const beep = () => {
      if (performance.now() - lastBeep < 500) return;
      lastBeep = performance.now();
      BL.sfx("shelf-beep");
      if (!calm()) { nav.classList.remove("wobble"); void nav.offsetWidth; nav.classList.add("wobble"); }
    };
    nav.querySelectorAll('a[href="/polls"], a[href="/approvals"], a[href="/actions"]').forEach((a) => {
      a.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") beep(); });
      a.addEventListener("touchstart", beep, { passive: true });
    });
    // A nav click sometimes slimes the next page (it loads before slime could land here).
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a") && slimeAllowed() && Math.random() < 0.13) { try { sessionStorage.setItem("bl.slimeNext", "1"); } catch {} }
    });
    let next = "";
    try { next = sessionStorage.getItem("bl.slimeNext"); sessionStorage.removeItem("bl.slimeNext"); } catch {}
    if (next) {
      let at = null;
      try { at = JSON.parse(next); } catch {}
      setTimeout(() => dropSlime(true, at && typeof at === "object" ? at : null), 700);
    }
  }

  function setupSlimeToggle() {
    const b = document.getElementById("slime-toggle");
    if (!b) return;
    const paint = () => { b.hidden = innerWidth < 768; b.textContent = `🟢 Gutter slime: ${get("bl.slime") === "off" ? "off" : "on"}`; };
    b.addEventListener("click", () => {
      set("bl.slime", get("bl.slime") === "off" ? "on" : "off");
      paint();
      if (get("bl.slime") !== "off") dropSlime(true);
      else if (slimeNow) { slimeNow.remove(); slimeNow = null; }
    });
    addEventListener("resize", paint);
    paint();
  }

  // ---------- Live scores ticker: NBA on NBC bottom line (#20), every 17 minutes ----------
  function setupTicker() {
    const box = document.getElementById("ticker");
    if (!box) return;
    const score = (g) => (g.status === 1 ? "@" : `${g.away_score ?? 0}–${g.home_score ?? 0}`);
    const status = (g) => (g.status === 1 ? (g.tip ? `${g.tip} CT` : "TBD") : g.status === 2 ? (g.status_text || "Live") : (g.status_text || "Final"));
    const load = async () => {
      try {
        const team = BL.viewTeam ? BL.viewTeam() : "";
        const res = await fetch(`/api/scores${team ? `?team=${encodeURIComponent(team)}` : ""}`).then((r) => r.json());
        const games = res.ok ? res.data : [];
        if (!games.length) { box.hidden = true; return; }
        const live = games.some((g) => g.status === 2);
        const items = games.map((g) => `<span class="tk-game${g.status === 2 ? " live" : ""}${g.mine ? " mine" : ""}">`
          + `<span>${BL.esc(g.away_team)} <b>${BL.esc(score(g))}</b> ${BL.esc(g.home_team)}</span><span class="st">${BL.esc(status(g))}</span></span>`).join("");
        box.innerHTML = `<span class="tk-badge">${live ? "<i></i>Live" : "Today"}</span><div class="tk-track">${items}${calm() ? "" : `<span aria-hidden="true" style="display:contents">${items}</span>`}</div>`;
        box.style.setProperty("--tk-dur", Math.max(30, games.length * 7) + "s");
        box.hidden = false;
      } catch { box.hidden = true; }
    };
    load();
    setInterval(load, 17 * 60 * 1000);
    document.addEventListener("bl:team", load);
  }

  function start() {
    setupThemeBar();
    setupClosers();
    setupSync();
    setupNav();
    setupSlimeToggle();
    setupTicker();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
