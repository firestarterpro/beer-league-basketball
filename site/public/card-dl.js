// "Download card" buttons (team pages and Home): draws the team's trading card as two PNGs,
// the front (the art with the live stats in its stats box) and the back (the roster with each
// player's points, team points, league rank and the pet's level). Anyone can download any team.
// Data comes from /api/card?team=<abv>; everything is drawn in the browser, nothing is stored.
(function () {
  const W = 960, H = 1440;
  const PIXEL = '"Silkscreen", "Barlow Condensed", monospace', COND = '"Barlow Condensed", "Arial Narrow", sans-serif';
  const TIER = { T1: "🤾", T2: "⛹️", T3: "🚶" };

  const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  const fonts = () => Promise.all([`700 40px ${PIXEL}`, `400 40px ${PIXEL}`, `800 40px ${COND}`, `600 40px ${COND}`]
    .map((f) => (document.fonts ? document.fonts.load(f).catch(() => null) : null)));

  // Largest font (up to max) that fits text in width w.
  function fit(x, text, font, max, w) {
    let s = max;
    for (; s > 8; s -= 1) { x.font = font.replace("{s}", s); if (x.measureText(text).width <= w) break; }
    return s;
  }
  function outlined(x, text, cx, cy, fill, line) {
    x.lineJoin = "round"; x.lineWidth = line; x.strokeStyle = "#0b0f1e"; x.strokeText(text, cx, cy);
    x.fillStyle = fill; x.fillText(text, cx, cy);
  }
  const rect = (r) => [r[0] / 100 * W, r[1] / 100 * H, (r[2] - r[0]) / 100 * W, (r[3] - r[1]) / 100 * H];

  async function front(d) {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.drawImage(await loadImg(d.art), 0, 0, W, H);
    const b = d.box;
    if (!b) return c;
    x.textAlign = "center"; x.textBaseline = "middle";
    const [hx, hy, hw, hh] = rect(b.hdr);
    const title = (d.season ? `${d.season} season` : "Season stats").toUpperCase();
    fit(x, title, `700 {s}px ${PIXEL}`, Math.round(hh * 0.62), hw * 0.92);
    outlined(x, title, hx + hw / 2, hy + hh / 2, b.hdrInk, 6);
    const [vx, vy, vw, vh] = rect(b.vals);
    // One line of 4 (the top scorer gets more room), or a 2 x 2 grid.
    const cells = b.rows === 1
      ? (() => { const wt = [1, 0.85, 0.95, 1.35], sum = wt.reduce((a, n) => a + n, 0); let cx = vx;
          return wt.map((n) => { const w = vw * n / sum, r = [cx, vy, w, vh]; cx += w; return r; }); })()
      : [0, 1, 2, 3].map((i) => [vx + (i % 2) * vw / 2, vy + Math.floor(i / 2) * vh / 2, vw / 2, vh / 2]);
    // One font size for all 4, the largest that fits every cell.
    const size = Math.min(...d.front.map((s, i) =>
      fit(x, `${s.k} ${s.v}`, `700 {s}px ${PIXEL}`, Math.round(cells[i][3] * (b.rows === 1 ? 0.62 : 0.5)), cells[i][2] * 0.9)));
    x.font = `700 ${size}px ${PIXEL}`;
    d.front.forEach((s, i) => {
      const [cx, cy, cw, ch] = cells[i], text = `${s.k} ${s.v}`;
      // Label a little dimmer than the number, centred together.
      const lw = x.measureText(`${s.k} `).width, tw = x.measureText(text).width, left = cx + (cw - tw) / 2;
      x.textAlign = "left";
      x.globalAlpha = 0.8; outlined(x, `${s.k} `, left, cy + ch / 2, b.ink, 5);
      x.globalAlpha = 1; outlined(x, s.v, left + lw, cy + ch / 2, b.ink, 5);
      x.textAlign = "center";
    });
    return c;
  }

  async function back(d) {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    // Red card stock and a navy panel with halftone dots, like the fronts.
    x.fillStyle = "#d4302a"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#1d4fa8"; x.fillRect(30, 30, W - 60, H - 60);
    x.fillStyle = "#0e1f4d"; x.fillRect(44, 44, W - 88, H - 88);
    x.fillStyle = "rgba(255,255,255,.05)";
    for (let yy = 50; yy < H - 50; yy += 16) for (let xx = 50 + (yy / 16 % 2) * 8; xx < W - 50; xx += 16) { x.beginPath(); x.arc(xx, yy, 2.2, 0, 7); x.fill(); }
    x.strokeStyle = "#ff8a1e"; x.lineWidth = 4; x.strokeRect(58, 58, W - 116, H - 116);

    // Header: avatar, team name, abbreviation and GM.
    try { x.drawImage(await loadImg(d.avatar), 74, 70, 220, 220); } catch {}
    x.textAlign = "left"; x.textBaseline = "alphabetic";
    const name = d.team_name.toUpperCase();
    const ns = fit(x, name, `800 {s}px ${COND}`, 70, W - 330 - 80);
    x.font = `800 ${ns}px ${COND}`; outlined(x, name, 312, 150, "#ffc93c", 8);
    x.font = `700 34px ${PIXEL}`; outlined(x, `${d.abv_label} · GM ${(d.gm_name || "TBD").toUpperCase()}`, 312, 205, "#ffffff", 5);
    x.font = `400 24px ${PIXEL}`; x.fillStyle = "#9fc1ff"; x.fillText(`${d.season} · ${(d.model || "").replace("_", " ")} scoring`.toUpperCase(), 312, 250);

    // Stat strip: team points, league rank, pet level.
    const strip = [["TEAM PTS", d.points == null ? "--" : Math.round(d.points).toLocaleString("en-US")],
      ["LEAGUE RANK", d.rank ? `#${d.rank} of ${d.teams}` : "--"], ["PET LEVEL", d.pet]];
    const sy = 310, sw = (W - 148) / 3;
    strip.forEach(([k, v], i) => {
      const sx = 74 + i * sw;
      x.fillStyle = "#0b0f1e"; x.fillRect(sx + 6, sy, sw - 12, 120);
      x.strokeStyle = "#ff8a1e"; x.lineWidth = 3; x.strokeRect(sx + 6, sy, sw - 12, 120);
      x.textAlign = "center"; x.font = `400 24px ${PIXEL}`; x.fillStyle = "#ff8a1e"; x.fillText(k, sx + sw / 2, sy + 40);
      const vs = fit(x, v, `700 {s}px ${PIXEL}`, 46, sw - 40);
      x.font = `700 ${vs}px ${PIXEL}`; x.fillStyle = "#ffffff"; x.fillText(v, sx + sw / 2, sy + 96);
    });

    // Roster table.
    let y = 490;
    x.textAlign = "left"; x.font = `700 30px ${PIXEL}`; outlined(x, "ROSTER", 80, y, "#ff8a1e", 5);
    x.textAlign = "right"; x.font = `400 22px ${PIXEL}`; x.fillStyle = "#9fc1ff"; x.fillText("FANTASY PTS", W - 80, y);
    y += 22; x.fillStyle = "#ff8a1e"; x.fillRect(80, y, W - 160, 3); y += 12;
    const rows = d.roster.slice(0, 12), rh = 66;
    if (!rows.length) {
      x.textAlign = "center"; x.font = `700 30px ${PIXEL}`; x.fillStyle = "#ffffff";
      x.fillText("ROSTER FILLS IN AFTER THE DRAFT", W / 2, y + 120);
    }
    rows.forEach((p, i) => {
      const ry = y + i * rh;
      if (i % 2 === 0) { x.fillStyle = "rgba(255,255,255,.06)"; x.fillRect(80, ry, W - 160, rh); }
      const mid = ry + rh / 2 + 10;
      x.textAlign = "left"; x.font = `700 22px ${PIXEL}`; x.fillStyle = p.slot === "IR" ? "#ff6b6b" : "#9fc1ff";
      x.fillText((p.slot || "").slice(0, 7), 92, mid);
      x.font = `30px ${COND}`; x.fillText(TIER[p.tier] || "", 200, mid);
      const nm = p.name + (p.nba ? `  ${p.nba}` : "");
      const fs = fit(x, nm, `700 {s}px ${COND}`, 36, W - 250 - 230);
      x.font = `700 ${fs}px ${COND}`; x.fillStyle = "#ffffff"; x.fillText(p.name, 250, mid);
      if (p.nba) { const w = x.measureText(p.name + "  ").width; x.font = `600 ${fs}px ${COND}`; x.fillStyle = "#9fc1ff"; x.fillText(p.nba, 250 + w, mid); }
      x.textAlign = "right"; x.font = `700 30px ${PIXEL}`; x.fillStyle = "#ffc93c"; x.fillText(String(p.pts), W - 92, mid);
    });

    // Footer.
    x.textAlign = "center"; x.font = `400 20px ${PIXEL}`; x.fillStyle = "#9fc1ff";
    const when = new Date().toLocaleDateString("en-US", { dateStyle: "medium" });
    x.fillText(`BEER LEAGUE BASKETBALL · STATS AS OF ${when.toUpperCase()}`, W / 2, H - 84);
    return c;
  }

  const blob = (c) => new Promise((ok) => c.toBlob(ok, "image/png"));
  function save(url, name) { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

  function dialog() {
    let d = document.getElementById("card-dl");
    if (d) return d;
    d = document.createElement("dialog"); d.id = "card-dl"; d.className = "card-dl";
    d.innerHTML = `<form method="dialog"><h2 id="card-dl-title">Your card</h2>
      <p class="muted small" id="card-dl-msg">Drawing the card…</p>
      <div class="card-dl-pair"><figure><img id="card-dl-front" alt="Card front"><figcaption>Front</figcaption></figure>
        <figure><img id="card-dl-back" alt="Card back"><figcaption>Back</figcaption></figure></div>
      <div class="row"><button type="button" class="rs-btn" id="card-dl-both" disabled>⬇ Save both PNGs</button>
        <a class="link" id="card-dl-f" download>Front only</a> <a class="link" id="card-dl-b" download>Back only</a>
        <button class="link" value="close">Close</button></div>
      <p class="muted small">On a phone, you can also press and hold a picture to save it.</p></form>`;
    document.body.appendChild(d);
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
    return d;
  }

  let urls = [];
  async function open(abv) {
    const dlg = dialog(), $ = (id) => document.getElementById(id);
    urls.forEach((u) => URL.revokeObjectURL(u)); urls = [];
    $("card-dl-msg").textContent = "Drawing the card…"; $("card-dl-both").disabled = true;
    $("card-dl-front").removeAttribute("src"); $("card-dl-back").removeAttribute("src");
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    try {
      const r = await fetch(`/api/card?team=${encodeURIComponent(abv)}`).then((r) => r.json());
      if (!r.ok) throw new Error(r.error);
      const d = r.data;
      $("card-dl-title").textContent = d.team_name;
      await fonts();
      const [f, b] = await Promise.all([front(d).then(blob), back(d).then(blob)]);
      urls = [URL.createObjectURL(f), URL.createObjectURL(b)];
      const names = [`${d.abv}-card-front.png`, `${d.abv}-card-back.png`];
      $("card-dl-front").src = urls[0]; $("card-dl-back").src = urls[1];
      $("card-dl-f").href = urls[0]; $("card-dl-f").download = names[0];
      $("card-dl-b").href = urls[1]; $("card-dl-b").download = names[1];
      $("card-dl-both").disabled = false;
      $("card-dl-both").onclick = () => { save(urls[0], names[0]); setTimeout(() => save(urls[1], names[1]), 400); };
      $("card-dl-msg").textContent = "Two PNGs: the front with live stats, and the back with the roster.";
      if (window.BL && BL.sfx) BL.sfx("card-flip");
    } catch (e) {
      $("card-dl-msg").textContent = "Couldn't draw the card. Try again in a minute.";
    }
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-card-dl]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    open(b.dataset.cardDl);
  });
})();
