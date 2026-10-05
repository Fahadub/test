/*
 * S1 — Intro / recon HUD · 0.0 – 6.0
 *
 * Night-vision (green phosphor) tactical recon feed:
 *   generic fictional desert relief (hill-shade + contours, cached), coordinate grid,
 *   PPI radar disc with range rings, bearing ring, conic sweep with phosphor trail,
 *   contacts that ping exactly when the sweep crosses them (0.6 / 1.8 / 3.0),
 *   typewriter «جارٍ تحليل المشهد…» (1.2 – 2.6), glitch title «تحليل الموقف الميداني» (3.0 – 4.6)
 *   with HUD panels booting, acceleration + convergence to the centre (4.2 – 5.8), white flash (5.8 – 6.0).
 *
 * Every frame is a pure function of t. Caches hold only t-independent content
 * (terrain plate, noise tile, text sprites).
 */
(function () {
  'use strict';
  const M = window.M;
  const { clamp, lerp, prog, ease, hash, noise1 } = M;
  const W = 1920, H = 1080, FPS = 30, TAU = Math.PI * 2;

  // ---------------------------------------------------------------- constants
  const HUD = '124,255,178';     // #7CFFB2
  const PHO = '182,255,204';     // phosphor highlight
  const DEEP = '#020805';
  const RX = 960, RY = 458, RR = 296;          // radar centre / radius
  const TXT_Y = 930;                           // Arabic line baseline (middle)
  const T_TYPE0 = 1.2, T_TYPE1 = 2.5, T_TITLE = 3.0, T_TITLE_OUT = 4.6, T_CONV = 4.2, T_CONV1 = 5.8, T_FLASH = 5.8;
  const TYPE_STR = 'جارٍ تحليل المشهد…';
  const TITLE_STR = 'تحليل الموقف الميداني';
  const BLIPS = [
    { c: 0.6, rr: 0.66, id: 'C-01' },
    { c: 1.8, rr: 0.44, id: 'C-02' },
    { c: 3.0, rr: 0.80, id: 'C-03' },
  ];

  // ---------------------------------------------------------------- helpers
  const fidx = (t) => Math.round(t * FPS);
  const frac = (x) => x - Math.floor(x);
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const rgba = (c, a) => `rgba(${c},${a})`;
  const decay = (t, c, rate) => (t >= c ? Math.exp(-(t - c) * rate) : 0);
  const pad = (n, w) => String(Math.floor(n)).padStart(w, '0');
  // power-on flicker: 0 before t0, flickers for dur, then 1 (deterministic per frame)
  function boot(t, t0, dur = 0.25, seed = 1) {
    if (t < t0) return 0;
    if (t >= t0 + dur) return 1;
    const k = (t - t0) / dur;
    return hash(fidx(t), seed) > 0.35 ? 0.4 + 0.6 * k : 0.08;
  }
  function hudText(ctx, s, x, y, o) {
    M.text(ctx, s, x, y, Object.assign({ family: 'latin', weight: 500, size: 16, color: rgba(HUD, 0.8), align: 'left', letterSpacing: 2 }, o));
  }
  function chamfer(ctx, x, y, w, h, c) {
    ctx.beginPath();
    ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath();
  }
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }

  // radar sweep: one turn per 1.6 s, then accelerating (≈8×) during the convergence
  const OM = TAU / 1.6, TH0 = -Math.PI / 2 + 0.35;
  function tau(t) { if (t < T_CONV) return t; const d = t - T_CONV; return t + 0.95 * d * d * d; }
  const theta = (t) => TH0 + OM * tau(t);
  const convK = (t) => prog(t, T_CONV, T_CONV1);

  // ---------------------------------------------------------------- cached plates
  let TERR = null;
  function terrain() {
    if (TERR) return TERR;
    const U = M.assets.util;
    const GW = 300, GH = 190, S = 8;               // plate 2400 x 1520
    const N = (GW + 1) * (GH + 1);
    const hf = new Float32Array(N);
    for (let j = 0; j <= GH; j++) for (let i = 0; i <= GW; i++) {
      const x = i / GW * 5.2, y = j / GH * 3.3;
      let h = U.fbm2(x * 1.05, y * 1.05, 11, 5) * 0.8;
      const warp = U.fbm2(x * 0.7, y * 0.7, 23, 3) * 3.2;
      const rd = Math.sin((x * 2.0 + y * 1.25) * 3.1 + warp);         // long dune ridges
      h += (1 - Math.abs(rd)) * 0.13 * (0.55 + 0.45 * U.fbm2(x * 0.45, y * 0.45, 31, 2));
      h -= Math.exp(-Math.pow((y - 1.9 - 0.35 * Math.sin(x * 1.3)) * 4.0, 2)) * 0.18;   // dry wadi
      hf[j * (GW + 1) + i] = h;
    }
    const at = (i, j) => hf[clamp(j, 0, GH) * (GW + 1) + clamp(i, 0, GW)];
    // hill-shade at grid resolution (phosphor green ramp)
    const sm = mk(GW + 1, GH + 1), sg = sm.getContext('2d');
    const img = sg.createImageData(GW + 1, GH + 1);
    for (let j = 0; j <= GH; j++) for (let i = 0; i <= GW; i++) {
      const dx = at(i + 1, j) - at(i - 1, j), dy = at(i, j + 1) - at(i, j - 1);
      const sh = clamp(0.6 + (-dx * 0.8 - dy * 0.55) * 4.2, 0, 1.25);
      const el = clamp(0.5 + at(i, j) * 0.7, 0, 1);
      const v = clamp(sh * (0.55 + 0.45 * el), 0, 1.2);
      const p = (j * (GW + 1) + i) * 4;
      img.data[p] = 5 + 26 * v; img.data[p + 1] = 18 + 98 * v; img.data[p + 2] = 10 + 44 * v; img.data[p + 3] = 255;
    }
    sg.putImageData(img, 0, 0);
    const c = mk(GW * S, GH * S), g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(sm, 0, 0, GW * S, GH * S);
    // contour lines (marching squares)
    const LV0 = -0.7, LV1 = 0.9, STEP = 0.055;
    const minor = new Path2D(), major = new Path2D();
    let li = 0;
    for (let lv = LV0; lv <= LV1; lv += STEP, li++) {
      const P = li % 4 === 0 ? major : minor;
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
        const a = at(i, j), b = at(i + 1, j), cc = at(i + 1, j + 1), d = at(i, j + 1);
        const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (cc > lv ? 2 : 0) | (d > lv ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const e = [
          [(i + (lv - a) / (b - a)) * S, j * S],          // top
          [(i + 1) * S, (j + (lv - b) / (cc - b)) * S],    // right
          [(i + (lv - d) / (cc - d)) * S, (j + 1) * S],    // bottom
          [i * S, (j + (lv - a) / (d - a)) * S],           // left
        ];
        const seg = (p, q) => { P.moveTo(e[p][0], e[p][1]); P.lineTo(e[q][0], e[q][1]); };
        switch (idx) {
          case 1: case 14: seg(3, 2); break;
          case 2: case 13: seg(2, 1); break;
          case 3: case 12: seg(3, 1); break;
          case 4: case 11: seg(0, 1); break;
          case 5: seg(3, 0); seg(2, 1); break;
          case 6: case 9: seg(0, 2); break;
          case 7: case 8: seg(3, 0); break;
          case 10: seg(0, 1); seg(3, 2); break;
        }
      }
    }
    g.lineJoin = 'round';
    g.strokeStyle = rgba('150,255,180', 0.22); g.lineWidth = 1.6; g.stroke(minor);
    g.strokeStyle = rgba('170,255,195', 0.42); g.lineWidth = 2.6; g.stroke(major);
    // survey grid baked into the plate (moves with the ground)
    g.strokeStyle = rgba(HUD, 0.10); g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= c.width; x += 200) { g.moveTo(x, 0); g.lineTo(x, c.height); }
    for (let y = 0; y <= c.height; y += 200) { g.moveTo(0, y); g.lineTo(c.width, y); }
    g.stroke();
    g.font = "500 18px 'Oswald'"; g.fillStyle = rgba(HUD, 0.32);
    for (let x = 200, k = 0; x < c.width; x += 200, k++) for (let y = 200, q = 0; y < c.height; y += 200, q++) {
      if ((k + q) % 3) continue;
      g.fillText(`${pad(40 + k, 2)}${pad(70 + q, 2)}`, x + 6, y - 6);
      g.fillRect(x - 5, y - 1, 10, 2); g.fillRect(x - 1, y - 5, 2, 10);
    }
    TERR = c;
    return c;
  }

  let NOISE = null;
  function noiseTile() {
    if (NOISE) return NOISE;
    const c = mk(256, 256), g = c.getContext('2d'), img = g.createImageData(256, 256), r = M.rng(4242);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.pow(r(), 3);
      img.data[i] = 60 * v; img.data[i + 1] = 255 * v; img.data[i + 2] = 120 * v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    NOISE = c;
    return c;
  }

  // text sprites (Arabic drawn via M.text into cached canvases)
  const SPR = {};
  function titleSprite() {
    if (SPR.title) return SPR.title;
    const o = { size: 96, family: 'kufi', weight: 700 };
    const tmp = mk(10, 10).getContext('2d');
    const w = Math.ceil(M.measure(tmp, TITLE_STR, o)) + 120, h = 190;
    const c = mk(w, h), g = c.getContext('2d');
    M.text(g, TITLE_STR, w / 2, h / 2, Object.assign({}, o, { color: 'rgba(60,255,140,0.35)', glow: 28, glowColor: 'rgba(30,255,110,0.7)' }));
    // phosphor gradient fill: hot white top → green base, thin bright rim
    const gr = g.createLinearGradient(0, h / 2 - 50, 0, h / 2 + 50);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#d9ffe6'); gr.addColorStop(0.75, '#8dffb8'); gr.addColorStop(1, '#3fe58a');
    M.text(g, TITLE_STR, w / 2, h / 2, Object.assign({}, o, { color: gr, stroke: 2.5, strokeColor: 'rgba(10,60,30,0.9)' }));
    SPR.title = { c, w, h };
    return SPR.title;
  }

  // ---------------------------------------------------------------- layers
  function drawTerrain(ctx, t, K) {
    const T = terrain();
    const zc = 1 + 2.6 * ease.inCubic(K);                      // convergence zoom
    const s = (0.92 + 0.012 * t) * zc;
    const ang = -0.06 + 0.006 * t;
    const dx = -40 + t * 7, dy = 10 - t * 4;
    ctx.save();
    ctx.translate(RX, H / 2 + (RY - H / 2) * (1 - K));
    ctx.rotate(ang);
    ctx.scale(s, s);
    ctx.globalAlpha = 0.85 + 0.15 * K;
    ctx.drawImage(T, -T.width / 2 + dx, -T.height / 2 + dy);
    ctx.restore();
  }

  function blipState(b, t, K) {
    const ang = theta(b.c);
    const rr = b.rr * (1 - 0.85 * ease.inCubic(K));
    return { ang, rr };
  }

  function drawRadar(ctx, t, K, on) {
    if (on <= 0) return;
    const z = 1 + 1.9 * ease.inCubic(K);
    const cx = RX, cy = lerp(RY, H / 2, ease.inOutCubic(K));
    const R = RR * z;
    const th = theta(t);
    ctx.save();
    ctx.globalAlpha *= on;
    // disc body
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.05);
    bg.addColorStop(0, 'rgba(2,24,10,0.55)'); bg.addColorStop(0.85, 'rgba(1,16,7,0.62)'); bg.addColorStop(1, 'rgba(10,60,28,0.55)');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    // sweep trail (conic) — phosphor persistence behind the beam
    const spd = t < T_CONV ? 1 : 1 + 2.85 * (t - T_CONV) * (t - T_CONV);   // sweep speed multiplier
    const step = OM * spd / FPS;                                         // beam travel per frame (rad)
    const wedge = Math.min(TAU * 0.92, 1.5 + step * 2.2);
    const blur = clamp(step * 1.4 / wedge, 0, 0.6);                      // motion-blurred bright zone
    const cg = ctx.createConicGradient(th - wedge, cx, cy);
    const fw = wedge / TAU;
    cg.addColorStop(0, rgba(HUD, 0));
    cg.addColorStop(fw * 0.55, rgba(HUD, 0.05 + 0.08 * blur));
    cg.addColorStop(fw * Math.min(0.85, 1 - blur), rgba(HUD, 0.16 + 0.1 * blur));
    cg.addColorStop(fw * 0.995, rgba(PHO, 0.42));
    cg.addColorStop(fw, rgba(HUD, 0));
    cg.addColorStop(1, rgba(HUD, 0));
    // at very high speed the beam smears into a uniform persistence glow (prevents strobing)
    const smear = clamp((step - 0.35) / 0.6);
    ctx.save();
    ctx.globalAlpha *= 1 - 0.65 * smear;
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.restore();
    if (smear > 0) {
      const dg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      dg.addColorStop(0, rgba(PHO, 0.22 * smear)); dg.addColorStop(0.7, rgba(HUD, 0.1 * smear)); dg.addColorStop(1, rgba(HUD, 0.16 * smear));
      ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    }

    // range rings
    for (let i = 1; i <= 4; i++) {
      const r = R * i / 4;
      ctx.strokeStyle = rgba(HUD, i === 4 ? 0.75 : 0.28); ctx.lineWidth = i === 4 ? 2.5 : 1.3;
      ctx.setLineDash(i % 2 ? [6, 8] : []);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    }
    ctx.setLineDash([]);
    // crosshair + diagonals
    ctx.strokeStyle = rgba(HUD, 0.22); ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    const d = R * Math.SQRT1_2;
    ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d); ctx.moveTo(cx - d, cy + d); ctx.lineTo(cx + d, cy - d);
    ctx.stroke();
    // range labels
    for (let i = 1; i <= 3; i++) hudText(ctx, `${i * 5}`, cx - 8, cy + R * i / 4 + 11, { size: 13, align: 'right', color: rgba(HUD, 0.55), letterSpacing: 0 });
    // bearing ring: ticks every 2°, long every 10°, labels every 30°
    ctx.strokeStyle = rgba(HUD, 0.55); ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let a = 0; a < 360; a += 2) {
      const rad = (a - 90) * Math.PI / 180, L = a % 10 === 0 ? 14 : 6;
      const c1 = Math.cos(rad), s1 = Math.sin(rad);
      ctx.moveTo(cx + c1 * (R + 6), cy + s1 * (R + 6)); ctx.lineTo(cx + c1 * (R + 6 + L), cy + s1 * (R + 6 + L));
    }
    ctx.stroke();
    for (let a = 0; a < 360; a += 30) {
      const rad = (a - 90) * Math.PI / 180;
      hudText(ctx, pad(a, 3), cx + Math.cos(rad) * (R + 38), cy + Math.sin(rad) * (R + 38), { size: 15, align: 'center', color: rgba(HUD, 0.7), letterSpacing: 1 });
    }
    // rotating outer arc segments (counter-rotating)
    ctx.strokeStyle = rgba(HUD, 0.5); ctx.lineWidth = 3;
    const ro = -tau(t) * 0.5;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(cx, cy, R + 64, ro + k * TAU / 3, ro + k * TAU / 3 + 0.7); ctx.stroke(); }
    ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(HUD, 0.25);
    ctx.beginPath(); ctx.arc(cx, cy, R + 64, 0, TAU); ctx.stroke();

    // contracting pulse rings during the convergence
    if (K > 0) {
      for (let k = 0; k < 3; k++) {
        const p = frac(tau(t) * 1.4 + k / 3);
        const r = R * 1.25 * (1 - p);
        ctx.strokeStyle = rgba(PHO, 0.5 * K * Math.sin(p * Math.PI)); ctx.lineWidth = 2 + 4 * K;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      }
    }

    // sweep beam
    const bx = cx + Math.cos(th) * R, by = cy + Math.sin(th) * R;
    const lg = ctx.createLinearGradient(cx, cy, bx, by);
    lg.addColorStop(0, rgba(PHO, 0.25)); lg.addColorStop(1, rgba(PHO, 0.95));
    ctx.save();
    ctx.globalAlpha *= 1 - 0.55 * smear;
    ctx.strokeStyle = rgba(HUD, 0.18); ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = lg; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke();
    M.assets.util.glow(ctx, bx, by, 26, '#9dffc0', 0.7);
    ctx.restore();

    // sonar pings from the centre on each contact
    for (const b of BLIPS) {
      const age = t - b.c;
      if (age < 0 || age > 0.9) continue;
      const p = ease.outCubic(age / 0.9);
      ctx.strokeStyle = rgba(PHO, 0.55 * (1 - p)); ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(cx, cy, R * p, 0, TAU); ctx.stroke();
    }

    // contacts
    const lines = [];
    for (const b of BLIPS) {
      if (t < b.c) continue;
      const st = blipState(b, t, K);
      const px = cx + Math.cos(st.ang) * st.rr * R, py = cy + Math.sin(st.ang) * st.rr * R;
      lines.push([px, py]);
      const dAng = ((th - st.ang) % TAU + TAU) % TAU;     // angle since the beam last crossed it
      const age = t - b.c;
      const br = 0.35 + 0.65 * Math.exp(-dAng / 1.3);
      const hit = Math.exp(-age * 5);
      M.assets.util.glow(ctx, px, py, 34 + 40 * hit, '#7cffb2', 0.55 * br + 0.45 * hit);
      ctx.fillStyle = rgba(PHO, 0.6 + 0.4 * br);
      ctx.beginPath(); ctx.arc(px, py, 5 + 3 * hit, 0, TAU); ctx.fill();
      // ping ring at the contact
      if (age < 1.0) {
        const p = ease.outCubic(age / 1.0);
        ctx.strokeStyle = rgba(PHO, 0.85 * (1 - p)); ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(px, py, 8 + 70 * p, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(px, py, 6 + 38 * ease.outCubic(clamp(age / 0.6)), 0, TAU); ctx.stroke();
      }
    }
    // triangulation lines during the convergence
    if (K > 0 && lines.length) {
      ctx.strokeStyle = rgba(PHO, 0.6 * Math.min(1, K * 3)); ctx.lineWidth = 1.6;
      ctx.setLineDash([10, 6]); ctx.lineDashOffset = -t * 120;
      ctx.beginPath();
      for (const [px, py] of lines) { ctx.moveTo(px, py); ctx.lineTo(cx, cy); }
      ctx.moveTo(lines[0][0], lines[0][1]); for (const [px, py] of lines) ctx.lineTo(px, py); ctx.closePath();
      ctx.stroke(); ctx.setLineDash([]);
    }
    // centre pip
    ctx.fillStyle = rgba(PHO, 0.9);
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // contact brackets + labels (fade out as everything converges)
    const la = 1 - clamp(K * 2.5);
    if (la > 0) for (const b of BLIPS) {
      if (t < b.c) continue;
      const age = t - b.c;
      const st = blipState(b, t, K);
      const px = cx + Math.cos(st.ang) * st.rr * R, py = cy + Math.sin(st.ang) * st.rr * R;
      const sz = lerp(70, 26, ease.outCubic(clamp(age / 0.35)));
      const ba = boot(t, b.c, 0.25, 11 + b.c * 10) * la;
      M.assets.hudBracket(ctx, px - sz / 2, py - sz / 2, sz, sz, { t, alpha: ba, thick: 2, len: sz * 0.3, glow: 6, ticks: false, breathe: 0 });
      // leader + label
      const side = 1;
      const lx = px + side * 44, ly = py - 34;
      const ta = ba * clamp((age - 0.12) / 0.2);
      if (ta > 0) {
        ctx.save(); ctx.globalAlpha *= ta;
        ctx.strokeStyle = rgba(HUD, 0.7); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px + side * 16, py - 12); ctx.lineTo(lx, ly); ctx.lineTo(lx + side * 92, ly); ctx.stroke();
        const brg = ((st.ang * 180 / Math.PI + 90) % 360 + 360) % 360;
        const al = side > 0 ? 'left' : 'right';
        hudText(ctx, b.id, lx + side * 4, ly - 12, { size: 17, weight: 700, color: rgba(PHO, 0.95), align: al });
        hudText(ctx, `BRG ${pad(brg, 3)}  RNG ${(b.rr * 20).toFixed(1)}`, lx + side * 4, ly + 13, { size: 13, color: rgba(HUD, 0.75), align: al, letterSpacing: 1 });
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // top / bottom HUD furniture (time-coded, ticking)
  function drawFrameHud(ctx, t, K) {
    const a = boot(t, 0.25, 0.3, 3);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    // corner brackets
    ctx.strokeStyle = rgba(HUD, 0.7); ctx.lineWidth = 3;
    ctx.beginPath();
    const m = 42, L = 90;
    ctx.moveTo(m, m + L); ctx.lineTo(m, m); ctx.lineTo(m + L, m);
    ctx.moveTo(W - m - L, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, m + L);
    ctx.moveTo(W - m, H - m - L); ctx.lineTo(W - m, H - m); ctx.lineTo(W - m - L, H - m);
    ctx.moveTo(m + L, H - m); ctx.lineTo(m, H - m); ctx.lineTo(m, H - m - L);
    ctx.stroke();
    // top-left: feed id + REC
    const rec = fidx(t) % 24 < 14;
    if (rec) { ctx.fillStyle = 'rgba(255,70,60,0.95)'; ctx.beginPath(); ctx.arc(84, 84, 7, 0, TAU); ctx.fill(); }
    hudText(ctx, 'REC', 100, 85, { size: 18, weight: 700, color: 'rgba(255,120,110,0.9)' });
    hudText(ctx, 'RECON FEED  //  NV-01', 160, 85, { size: 18, weight: 700, color: rgba(PHO, 0.9) });
    hudText(ctx, 'SENSOR EO/IR   MODE NIGHT   GAIN +3.2 dB', 76, 114, { size: 14, color: rgba(HUD, 0.6) });
    // top-right: timecode
    const f = fidx(t);
    const tc = `T+ 00:00:${pad(f / FPS, 2)}:${pad(f % FPS, 2)}`;
    hudText(ctx, tc, W - 76, 85, { size: 20, weight: 700, align: 'right', color: rgba(PHO, 0.9) });
    hudText(ctx, 'LINK  ▮▮▮▮▯   ENC  AES', W - 76, 114, { size: 14, align: 'right', color: rgba(HUD, 0.6) });
    // heading tape
    const hd = 274 + 8 * Math.sin(t * 0.5) + 40 * ease.inCubic(K) * Math.sin(t * 9);
    const tx = 960, ty = 66, tw = 480;
    ctx.lineWidth = 1.5;
    for (let dgs = Math.floor((hd - 30) / 5) * 5; dgs <= hd + 30; dgs += 5) {
      const x = tx + (dgs - hd) * 8;
      const ea = clamp(1 - Math.abs(x - tx) / (tw / 2)) ** 0.7;    // fade toward the tape ends
      if (ea <= 0) continue;
      const big = dgs % 15 === 0;
      ctx.strokeStyle = rgba(HUD, 0.7 * ea);
      ctx.beginPath(); ctx.moveTo(x, ty + 8); ctx.lineTo(x, ty + 8 + (big ? 16 : 8)); ctx.stroke();
      if (big) hudText(ctx, pad(((dgs % 360) + 360) % 360, 3), x, ty - 6, { size: 15, align: 'center', color: rgba(HUD, 0.8 * ea), letterSpacing: 1 });
    }
    ctx.strokeStyle = rgba(HUD, 0.3); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tx - tw / 2 + 40, ty + 8); ctx.lineTo(tx + tw / 2 - 40, ty + 8); ctx.stroke();
    ctx.fillStyle = rgba(PHO, 0.95);
    ctx.beginPath(); ctx.moveTo(tx, ty + 6); ctx.lineTo(tx - 8, ty + 40); ctx.lineTo(tx + 8, ty + 40); ctx.closePath(); ctx.fill();
    // bottom-left: ticking grid coordinates
    const sp = 1 + 9 * ease.inCubic(K);
    const gx = 48213.6 + t * 3.7 * sp + noise1(t * 3 * sp, 5) * 0.8;
    const gy = 77190.2 - t * 2.1 * sp + noise1(t * 3 * sp, 6) * 0.8;
    hudText(ctx, 'GRID', 76, H - 112, { size: 14, color: rgba(HUD, 0.55) });
    hudText(ctx, `X ${gx.toFixed(1)}   Y ${gy.toFixed(1)}`, 76, H - 86, { size: 22, weight: 700, color: rgba(PHO, 0.92), letterSpacing: 2 });
    hudText(ctx, `ALT ${pad(4120 + Math.sin(t * 1.3) * 12 + K * 900, 5)} FT   SPD ${pad(212 + t * 2 + K * 300, 3)} KT`, 76, H - 62, { size: 14, color: rgba(HUD, 0.6) });
    // bottom-right: zoom / fov
    const zoom = 4.0 + 0.06 * t + 8 * ease.inCubic(K);
    hudText(ctx, 'OPTICS', W - 76, H - 112, { size: 14, align: 'right', color: rgba(HUD, 0.55) });
    hudText(ctx, `ZOOM ${zoom.toFixed(1)}x   FOV ${(28 / zoom).toFixed(2)}°`, W - 76, H - 86, { size: 22, weight: 700, align: 'right', color: rgba(PHO, 0.92), letterSpacing: 2 });
    hudText(ctx, `FRAME ${pad(fidx(t) * 7 + 1200, 6)}   SEC 07`, W - 76, H - 62, { size: 14, align: 'right', color: rgba(HUD, 0.6) });
    // side elevation ladder (left) + range ladder (right), subtle
    ctx.strokeStyle = rgba(HUD, 0.35); ctx.lineWidth = 1.2;
    ctx.beginPath();
    const off = (t * 40 * sp) % 30;
    for (let y = 200 - off; y < 880; y += 30) { ctx.moveTo(48, y); ctx.lineTo(60, y); ctx.moveTo(W - 48, y); ctx.lineTo(W - 60, y); }
    ctx.stroke();
    ctx.restore();
  }

  // ---- side panels (boot at 3.0)
  const LROWS = [['TERRAIN', 87], ['VISIBILITY', 92], ['COMMS LINK', 99], ['AIR COVER', 98], ['READINESS', 100]];
  function panelShell(ctx, x, y, w, h, title, code, a) {
    ctx.fillStyle = 'rgba(2,18,9,0.62)';
    chamfer(ctx, x, y, w, h, 16); ctx.fill();
    ctx.strokeStyle = rgba(HUD, 0.55); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = rgba(HUD, 0.14); ctx.fillRect(x + 1, y + 1 + 16, w - 2, 34);
    ctx.fillStyle = rgba(HUD, 0.9); ctx.fillRect(x + 14, y + 26, 4, 16);
    hudText(ctx, title, x + 28, y + 35, { size: 15, weight: 700, color: rgba(PHO, 0.95), letterSpacing: 3 });
    hudText(ctx, code, x + w - 16, y + 35, { size: 13, align: 'right', color: rgba(HUD, 0.6) });
    void a;
  }
  function drawPanels(ctx, t, K) {
    if (t < T_TITLE) return;
    // left: sector analysis bars
    const la = boot(t, T_TITLE, 0.25, 21);
    const slideL = 1 - ease.outCubic(prog(t, T_TITLE, T_TITLE + 0.35));
    ctx.save();
    ctx.globalAlpha *= la;
    ctx.translate(-120 * slideL, 0);
    const x = 74, y = 230, w = 380, h = 470;
    panelShell(ctx, x, y, w, h, 'SECTOR ANALYSIS', 'A-07', la);
    LROWS.forEach(([lab, val], i) => {
      const t0 = T_TITLE + 0.12 + i * 0.16;
      const ra = boot(t, t0, 0.18, 30 + i);
      if (ra <= 0) return;
      const ry = y + 88 + i * 74;
      const k = ease.outCubic(prog(t, t0, t0 + 0.55));
      ctx.save(); ctx.globalAlpha *= ra;
      hudText(ctx, lab, x + 24, ry, { size: 15, color: rgba(HUD, 0.8) });
      hudText(ctx, `${Math.round(val * k)}%`, x + w - 24, ry, { size: 20, weight: 700, align: 'right', color: rgba(PHO, 0.95), letterSpacing: 1 });
      const segs = 28, sw = (w - 48) / segs;
      for (let s = 0; s < segs; s++) {
        const on = s / segs < (val / 100) * k;
        ctx.fillStyle = on ? rgba(s / segs > 0.9 ? PHO : HUD, on ? 0.85 : 0.1) : rgba(HUD, 0.1);
        ctx.fillRect(x + 24 + s * sw, ry + 18, sw - 3, 14);
      }
      ctx.restore();
    });
    ctx.restore();

    // right: contact tracks + signal
    const ra = boot(t, T_TITLE + 0.12, 0.25, 41);
    const slideR = 1 - ease.outCubic(prog(t, T_TITLE + 0.12, T_TITLE + 0.47));
    ctx.save();
    ctx.globalAlpha *= ra;
    ctx.translate(120 * slideR, 0);
    const X = W - 74 - 380, Y = 230, Wd = 380, Hd = 470;
    panelShell(ctx, X, Y, Wd, Hd, 'CONTACT TRACKS', '03 / 03', ra);
    hudText(ctx, 'ID      BRG     RNG      STATUS', X + 24, Y + 80, { size: 13, color: rgba(HUD, 0.55) });
    BLIPS.forEach((b, i) => {
      const t0 = T_TITLE + 0.3 + i * 0.15;
      const a = boot(t, t0, 0.16, 50 + i);
      if (a <= 0) return;
      const brg = ((theta(b.c) * 180 / Math.PI + 90) % 360 + 360) % 360;
      const ry = Y + 112 + i * 36;
      ctx.save(); ctx.globalAlpha *= a;
      ctx.fillStyle = rgba(HUD, i % 2 ? 0.05 : 0.1); ctx.fillRect(X + 16, ry - 15, Wd - 32, 30);
      hudText(ctx, b.id, X + 24, ry, { size: 16, weight: 700, color: rgba(PHO, 0.95), letterSpacing: 1 });
      hudText(ctx, pad(brg, 3), X + 104, ry, { size: 16, color: rgba(HUD, 0.85), letterSpacing: 1 });
      hudText(ctx, (b.rr * 20).toFixed(1), X + 172, ry, { size: 16, color: rgba(HUD, 0.85), letterSpacing: 1 });
      hudText(ctx, 'TRACKED', X + 254, ry, { size: 15, weight: 700, color: rgba(PHO, 0.9) });
      ctx.restore();
    });
    // signal waveform
    const wa = boot(t, T_TITLE + 0.55, 0.2, 61);
    if (wa > 0) {
      ctx.save(); ctx.globalAlpha *= wa;
      const gx = X + 24, gy = Y + 250, gw = Wd - 48, gh = 90;
      hudText(ctx, 'SIGNAL  /  C2 LINK', gx, gy - 14, { size: 13, color: rgba(HUD, 0.55) });
      ctx.strokeStyle = rgba(HUD, 0.18); ctx.lineWidth = 1;
      ctx.strokeRect(gx, gy, gw, gh);
      ctx.beginPath(); ctx.moveTo(gx, gy + gh / 2); ctx.lineTo(gx + gw, gy + gh / 2); ctx.stroke();
      const sp = 1 + 6 * ease.inCubic(K);
      ctx.strokeStyle = rgba(PHO, 0.9); ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 110; i++) {
        const u = i / 110, xx = gx + u * gw;
        const v = Math.sin(u * 26 - t * 9 * sp) * 0.45 * Math.sin(u * 3.1 + t * 1.3) + noise1(u * 40 - t * 30 * sp, 9) * 0.35;
        const yy = gy + gh / 2 + v * gh * 0.45;
        i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
      // spectrum bars
      const by = gy + gh + 22, bh = 70, n = 30, bw = gw / n;
      for (let i = 0; i < n; i++) {
        const v = clamp(0.25 + 0.5 * (0.5 + 0.5 * noise1(i * 0.9 + t * 6 * sp, 13)) + 0.25 * Math.sin(i * 0.4 + t * 3));
        ctx.fillStyle = rgba(i > n * 0.75 ? PHO : HUD, 0.75);
        ctx.fillRect(gx + i * bw, by + bh * (1 - v), bw - 3, bh * v);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- typewriter / title / progress (lower third)
  function clusters(s) {
    const out = [];
    for (const ch of s) {
      const c = ch.codePointAt(0);
      const mark = (c >= 0x064B && c <= 0x065F) || c === 0x0670;
      if (mark && out.length) out[out.length - 1] += ch; else out.push(ch);
    }
    return out;
  }
  const TYPE_CL = clusters(TYPE_STR);
  // keystroke times: uneven human rhythm, pauses on spaces, fixed (t-independent)
  const KEY_T = (() => {
    const w = TYPE_CL.map((c, i) => (c === ' ' ? 1.7 : 0.75 + 0.5 * hash(i, 77)));
    const sum = w.reduce((a, b) => a + b, 0);
    let acc = 0;
    return w.map((x) => { acc += x; return T_TYPE0 + (T_TYPE1 - T_TYPE0) * (acc - x * 0.999) / sum; });
  })();
  const TYPE_O = { size: 66, family: 'arabic', weight: 700, wordSpacing: 12 };

  function drawLowerThird(ctx, t, K) {
    const a0 = boot(t, 0.9, 0.25, 71);
    if (a0 <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a0;
    // caption + progress
    let pct;
    if (t < T_TITLE) pct = 46 * ease.inOutQuad(prog(t, T_TYPE0, 2.7));
    else pct = 46 + 54 * ease.inOutCubic(prog(t, T_TITLE, T_TITLE_OUT));
    const cap = t < T_TITLE ? 'SCENE ANALYSIS  //  ACQUIRING' : (pct >= 99.5 ? 'FIELD ASSESSMENT  //  COMPLETE' : 'FIELD ASSESSMENT  //  PROCESSING');
    const outK = ease.inCubic(prog(t, T_TITLE_OUT, T_TITLE_OUT + 0.35));
    ctx.save();
    ctx.globalAlpha *= 1 - outK;
    hudText(ctx, cap, 960, TXT_Y - 90, { size: 15, align: 'center', color: rgba(HUD, 0.7), letterSpacing: 5 });
    const bw = 560, bx = 960 - bw / 2, by = TXT_Y + 84;
    ctx.fillStyle = rgba(HUD, 0.12); ctx.fillRect(bx, by, bw, 6);
    ctx.fillStyle = rgba(PHO, 0.9); ctx.fillRect(bx + bw * (1 - pct / 100), by, bw * pct / 100, 6);   // fills right → left (Arabic)
    M.assets.util.glow(ctx, bx + bw * (1 - pct / 100), by + 3, 18, '#9dffc0', 0.8);
    hudText(ctx, `${pct.toFixed(0).padStart(3, '0')} %`, bx - 18, by + 4, { size: 16, weight: 700, align: 'right', color: rgba(PHO, 0.9) });
    hudText(ctx, 'ANL', bx + bw + 18, by + 4, { size: 14, color: rgba(HUD, 0.6) });
    // little ticks under the bar
    ctx.fillStyle = rgba(HUD, 0.35);
    for (let i = 0; i <= 20; i++) ctx.fillRect(bx + i * bw / 20 - 0.5, by + 10, 1, i % 5 ? 4 : 8);
    ctx.restore();

    // typewriter (1.2 – 3.0)
    if (t >= T_TYPE0 - 0.3 && t < T_TITLE + 0.15) {
      let n = 0;
      for (let i = 0; i < KEY_T.length; i++) if (t >= KEY_T[i]) n = i + 1;
      const sub = TYPE_CL.slice(0, n).join('');
      const fullW = M.measure(ctx, TYPE_STR, TYPE_O);
      const xR = 960 + fullW / 2;
      const subW = n ? M.measure(ctx, sub, TYPE_O) : 0;
      // glitch-out at 3.0
      const gk = prog(t, T_TITLE - 0.02, T_TITLE + 0.15);
      ctx.save();
      if (gk > 0) { ctx.globalAlpha *= 1 - gk; ctx.translate((hash(fidx(t), 5) - 0.5) * 60 * gk, 0); }
      if (n) {
        M.text(ctx, sub, xR, TXT_Y, Object.assign({}, TYPE_O, { align: 'right', color: rgba('40,255,130', 0.55), glow: 26, glowColor: 'rgba(30,255,110,0.8)' }));
        M.text(ctx, sub, xR, TXT_Y, Object.assign({}, TYPE_O, { align: 'right', color: '#dcffe8' }));
      }
      // cursor: solid while typing, blinking afterwards
      const typing = t < KEY_T[KEY_T.length - 1] + 0.1;
      const blink = typing || (Math.floor((t - T_TYPE0) / 0.3) % 2 === 0);
      if (blink && t >= T_TYPE0 - 0.25) {
        const cx = xR - subW - 14;
        ctx.fillStyle = rgba(PHO, 0.95);
        ctx.shadowColor = 'rgba(60,255,140,0.9)'; ctx.shadowBlur = 16;
        ctx.fillRect(cx - 22, TXT_Y - 34, 22, 62);
        ctx.shadowBlur = 0;
      }
      // keystroke spark at the write head
      for (let i = 0; i < KEY_T.length; i++) {
        const age = t - KEY_T[i];
        if (age < 0 || age > 0.12) continue;
        M.assets.util.glow(ctx, xR - subW, TXT_Y, 60, '#7cffb2', 0.5 * (1 - age / 0.12));
      }
      ctx.restore();
    }

    // title (3.0 – 4.6 … converges out)
    if (t >= T_TITLE) {
      const S = titleSprite();
      const age = t - T_TITLE;
      const inK = ease.outExpo(clamp(age / 0.28));
      const sc = lerp(1.18, 1, inK) * (1 - 0.75 * outK);
      const yy = lerp(TXT_Y, H / 2, ease.inCubic(outK));
      ctx.save();
      ctx.globalAlpha *= clamp(age / 0.06) * (1 - outK);
      ctx.translate(960, yy);
      ctx.scale(sc, sc);
      const glitch = age < 0.3 ? 1 - age / 0.3 : (Math.abs(t - 3.9) < 0.05 ? 0.4 : 0);
      if (glitch > 0) {
        // horizontal slice displacement + split copies
        const f = fidx(t);
        const nS = 9;
        for (let i = 0; i < nS; i++) {
          const y0 = (S.h / nS) * i, sh = S.h / nS + 1;
          const off = (hash(f * 13 + i, 91) - 0.5) * 90 * glitch * (hash(f * 7 + i, 92) > 0.4 ? 1 : 0.1);
          ctx.drawImage(S.c, 0, y0, S.w, sh, -S.w / 2 + off, -S.h / 2 + y0, S.w, sh);
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= 0.45 * glitch;
        ctx.drawImage(S.c, -S.w / 2 - 14 * glitch, -S.h / 2);
        ctx.drawImage(S.c, -S.w / 2 + 14 * glitch, -S.h / 2);
      } else {
        ctx.drawImage(S.c, -S.w / 2, -S.h / 2);
      }
      ctx.restore();
      // brackets framing the title
      const fa = clamp((age - 0.1) / 0.2) * (1 - outK);
      if (fa > 0) {
        const bw2 = (S.w - 40) * sc * lerp(1.25, 1, ease.outCubic(clamp((age - 0.1) / 0.35))), bh2 = 130 * sc;
        M.assets.hudBracket(ctx, 960 - bw2 / 2, yy - bh2 / 2 - 4, bw2, bh2, { t, alpha: fa, thick: 3, len: 34, glow: 10, ticks: false, breathe: 0.6 });
      }
      // flash on landing
      const fl = decay(t, T_TITLE, 9);
      if (fl > 0.01) M.assets.util.glow(ctx, 960, TXT_Y, 520, '#c8ffd8', 0.55 * fl);
    }
    ctx.restore();
  }

  // ---- convergence streaks + core
  function drawConvergence(ctx, t, K) {
    if (K <= 0) return;
    const cx = 960, cy = H / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = 150, sp = 1 + 5 * K;
    for (let i = 0; i < n; i++) {
      const h1 = hash(i, 501), h2 = hash(i, 502), h3 = hash(i, 503);
      const a = h1 * TAU;
      const p = frac(h2 - tau(t) * 0.9 * (0.6 + h3) * sp * 0.4);     // 1 → 0 : moving inward
      const r1 = 140 + p * 1150, len = (90 + 320 * h3) * (0.4 + K);
      const r0 = r1 + len;
      const al = (0.1 + 0.5 * h3) * Math.min(1, K * 2) * (0.6 + 0.8 * K) * sstep(0, 0.25, p);
      const c = Math.cos(a), s = Math.sin(a);
      const g = ctx.createLinearGradient(cx + c * r1, cy + s * r1, cx + c * r0, cy + s * r0);
      g.addColorStop(0, rgba(PHO, al)); g.addColorStop(1, rgba(HUD, 0));
      ctx.strokeStyle = g; ctx.lineWidth = 1 + 2.5 * h2;
      ctx.beginPath(); ctx.moveTo(cx + c * r1, cy + s * r1); ctx.lineTo(cx + c * r0, cy + s * r0); ctx.stroke();
    }
    // lock brackets contracting onto the centre (riser)
    const lk = ease.inOutCubic(prog(t, 4.9, T_FLASH));
    if (t > 4.9) {
      const bw = lerp(1500, 120, lk), bh = lerp(860, 80, lk);
      const la = Math.min(1, (t - 4.9) * 5);
      M.assets.hudBracket(ctx, cx - bw / 2, cy - bh / 2, bw, bh, { t, alpha: la * 0.9, thick: 3 + 3 * lk, len: 60 - 30 * lk, glow: 16, ticks: true, breathe: 0, color: '#aaffcc' });
      // sync readout riding the bracket corner
      const sync = Math.min(100, Math.round(100 * ease.outCubic(prog(t, 4.9, 5.7))));
      ctx.save(); ctx.globalCompositeOperation = 'source-over';
      hudText(ctx, `LOCK  ${String(sync).padStart(3, '0')}%`, cx - bw / 2 + 6, cy - bh / 2 - 18, { size: 16, weight: 700, color: rgba(PHO, 0.95 * la), letterSpacing: 3 });
      hudText(ctx, sync >= 100 ? 'SYNC COMPLETE' : 'CONVERGING', cx + bw / 2 - 6, cy + bh / 2 + 22, { size: 13, align: 'right', color: rgba(HUD, 0.8 * la), letterSpacing: 3 });
      ctx.restore();
      const bw2 = bw * 0.62, bh2 = bh * 0.62;
      M.assets.hudBracket(ctx, cx - bw2 / 2, cy - bh2 / 2, bw2, bh2, { t, alpha: la * 0.5, thick: 2, len: 30, glow: 8, ticks: false, breathe: 0 });
    }
    // overall gain ramp (sensor blooming)
    ctx.fillStyle = rgba('60,255,140', 0.16 * K * K * K); ctx.fillRect(0, 0, W, H);
    // growing core
    const core = ease.inExpo(prog(t, 4.6, T_FLASH + 0.1));
    M.assets.util.glow(ctx, cx, cy, 80 + 900 * core, '#b9ffd0', 0.25 + 0.75 * core);
    M.assets.util.glow(ctx, cx, cy, 30 + 260 * core, '#ffffff', 0.4 + 0.6 * core);
    // anamorphic streak
    ctx.save(); ctx.translate(cx, cy); ctx.scale(10, 0.12 + 0.2 * core);
    M.assets.util.glow(ctx, 0, 0, 90, '#d8ffe6', 0.3 + 0.6 * core);
    ctx.restore();
    ctx.restore();
  }

  // ---- sensor scan band sweeping the ground + out-of-focus foreground motes (depth)
  function drawScanBand(ctx, t, K) {
    const a = boot(t, 0.5, 0.3, 4) * (1 - K);
    if (a <= 0) return;
    const x = -260 + frac((t - 0.45) / 2.4) * 2440;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(x - 260, 0, x, 0);
    g.addColorStop(0, rgba(HUD, 0)); g.addColorStop(0.85, rgba(HUD, 0.05 * a)); g.addColorStop(1, rgba(PHO, 0.16 * a));
    ctx.fillStyle = g; ctx.fillRect(x - 260, 0, 262, H);
    ctx.fillStyle = rgba(PHO, 0.22 * a); ctx.fillRect(x, 0, 2, H);
    // edge ticks on the band
    for (let y = 150; y < H - 120; y += 60) ctx.fillRect(x - 8, y, 16, 1.5);
    ctx.restore();
  }
  function drawMotes(ctx, t, K) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const h1 = hash(i, 601), h2 = hash(i, 602), h3 = hash(i, 603);
      const r = 30 + 80 * h3;
      let x = ((h1 * (W + 400) + t * (8 + 14 * h2)) % (W + 400)) - 200;
      let y = 80 + h2 * (H - 160) - t * (4 + 6 * h3);
      // pulled outward past the camera during the convergence zoom
      const z = 1 + 1.4 * ease.inCubic(K);
      x = 960 + (x - 960) * z; y = 540 + (y - 540) * z;
      const fl = 0.75 + 0.25 * Math.sin(t * (1.3 + h2) + i);
      M.assets.util.glow(ctx, x, y, r * z, '#6dffa8', (0.05 + 0.08 * h1) * fl * Math.min(1, t * 2));
    }
    ctx.restore();
  }

  // ---- night-vision sensor finish
  function drawNvFinish(ctx, t, K) {
    const f = fidx(t);
    ctx.save();
    // sensor noise (pre-baked tile, frame-offset)
    const N = noiseTile();
    const ox = Math.floor(hash(f, 801) * 256), oy = Math.floor(hash(f, 802) * 256);   // integer = fast blits
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16;
    for (let x = -ox; x < W; x += 256) for (let y = -oy; y < H; y += 256) ctx.drawImage(N, x, y);
    // scintillation sparkles
    ctx.globalAlpha = 1;
    for (let i = 0; i < 36; i++) {
      const x = hash(f * 41 + i, 803) * W, y = hash(f * 41 + i, 804) * H, s = hash(f * 41 + i, 805);
      ctx.fillStyle = rgba(PHO, 0.25 + 0.6 * s);
      ctx.fillRect(x, y, 1.5 + s * 2, 1.5 + s * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    M.assets.scanlines(ctx, 0.32, { t });
    // tube vignette (circular, slightly green)
    const g = ctx.createRadialGradient(960, 520, 260, 960, 540, 1180);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,6,2,0.22)'); g.addColorStop(0.75, 'rgba(0,5,2,0.5)'); g.addColorStop(1, 'rgba(0,3,1,0.88)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // brightness flicker (auto-gain)
    const fl = 0.035 * noise1(t * 14, 808) + (K > 0 ? 0.05 * K * noise1(t * 30, 809) : 0);
    if (fl > 0) M.fill(ctx, '#9dffc0', fl * 0.5);
  }

  // ---- CRT power-on (0.0 – 0.5)
  function drawPowerOn(ctx, t) {
    if (t >= 0.5) return;
    const k = ease.outCubic(prog(t, 0.05, 0.45));
    const hh = Math.max(3, H * k);
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, (H - hh) / 2); ctx.fillRect(0, (H + hh) / 2, W, (H - hh) / 2);
    ctx.globalCompositeOperation = 'lighter';
    const la = 1 - k;
    ctx.fillStyle = rgba(PHO, 0.9 * la);
    ctx.fillRect(0, H / 2 - hh / 2 - 2, W, 4); ctx.fillRect(0, H / 2 + hh / 2 - 2, W, 4);
    M.assets.util.glow(ctx, 960, 540, 600, '#9dffc0', 0.6 * la);
    ctx.restore();
  }

  // ---------------------------------------------------------------- draw
  function draw(ctx, lt, t) {
    const K = convK(t);
    // camera: slight drift + shake rising with the convergence (and small pops on pings)
    let shk = 1.2 + 10 * ease.inCubic(K);
    for (const b of BLIPS) shk += 6 * decay(t, b.c, 10);
    shk += 8 * decay(t, T_TITLE, 9);
    const s = M.shake(t, shk, 22, 17);

    ctx.fillStyle = DEEP; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(960 + s.x, 540 + s.y); ctx.rotate(s.r); ctx.translate(-960, -540);
    drawTerrain(ctx, t, K);
    drawScanBand(ctx, t, K);
    drawRadar(ctx, t, K, boot(t, 0.3, 0.35, 2));
    drawConvergence(ctx, t, K);
    // HUD furniture & panels rush into the centre (shrink + fade, lagging ghost copies = motion trail)
    const hudK = (tt) => ease.inCubic(prog(tt, T_CONV, 5.1));
    const cK = hudK(t);
    if (cK < 1) {
      for (let gI = cK > 0.02 && cK < 0.9 ? 1 : 0; gI >= 0; gI--) {
        const kk = hudK(t - gI * 0.07);
        const sc = 1 - 0.88 * kk;
        ctx.save();
        ctx.globalAlpha *= Math.pow(1 - cK, 1.3) * (gI ? 0.35 : 1);
        ctx.translate(960, 540); ctx.scale(sc, sc); ctx.translate(-960, -540);
        drawFrameHud(ctx, t, K);
        drawPanels(ctx, t, K);
        ctx.restore();
      }
    }
    drawLowerThird(ctx, t, K);
    drawMotes(ctx, t, K);
    ctx.restore();
    drawNvFinish(ctx, t, K);
    drawPowerOn(ctx, t);
    // white flash 5.8 → 6.0 (S2 starts on full white)
    const fk = prog(t, T_FLASH, 5.97);
    if (fk > 0) M.fill(ctx, '#ffffff', ease.outQuad(fk));
  }

  M.registerScene({ id: 's1_intro', start: 0.0, end: 6.0, z: 0, draw });
})();
