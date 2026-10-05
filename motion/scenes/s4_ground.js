/*
 * S4 — Ground forces · 24.0 – 34.0
 *
 *  24.0  out of S3's jet-wipe (right → left): the blurred tail of the jet clears to the left, the frame settles
 *  24.0–26.4  SHOT A — very low-angle wide at golden hour: tank column advancing left → right with lit dust
 *             plumes, soldier silhouettes standing in the foreground (rifles low), heat haze over the horizon
 *  25.2  «القوات البرية» slams in (gold metal) + «ثباتٌ كالجبال» (hit: flash, shock ring, sparks, shake)
 *  26.4–28.2  SHOT B — low tracking shot on the lead tank, gun lays onto empty distant dunes
 *  27.0  FIRE: muzzle blast, recoil + hull rock, ground shockwave dust ring, camera shake, flash;
 *        tracer → impact on an empty dune at 27.42
 *  28.2–31.8  SHOT C — Apache-like helicopters cross over the dunes above the advancing column
 *  30.6  second tank shot (column, mid-ground) → impact on empty far dunes at 31.02
 *  31.8  SHOT D (cut on the hit) — telephoto silhouette poster: tank crossing a giant setting sun,
 *        helicopters, soldiers on the crest; «أرضٌ لا تُمَسّ» slams in
 *  33.6–34.0  a dust storm front sweeps over the lens and fills the frame → S5 (holographic display)
 *
 * Every frame is a pure function of t. Caches hold only t-independent content (text sprites).
 */
(function () {
  'use strict';
  const M = window.M;
  const { clamp, lerp, prog, ease, hash, noise1 } = M;
  const W = 1920, H = 1080, TAU = Math.PI * 2;
  const A = () => M.assets;
  const U = () => M.assets.util;

  // ---------------------------------------------------------------- timeline (absolute s)
  const T0 = 24.0, T_TITLE = 25.2, T_B = 26.4, T_FIRE1 = 27.0, T_IMP1 = 27.42, T_C = 28.2,
    T_FIRE2 = 30.6, T_IMP2 = 31.02, T_D = 31.8, T_DUST = 33.6, T_END = 34.0;

  const STR_T1 = 'القوات البرية';
  const STR_T2 = 'ثباتٌ كالجبال';
  const STR_T3 = 'أرضٌ لا تُمَسّ';

  // ---------------------------------------------------------------- helpers
  const after = (t, c) => t >= c - 1e-6;
  const decay = (t, c, rate) => (after(t, c) ? Math.exp(-Math.max(0, t - c) * rate) : 0);
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  const SCR = {};
  function scratch(key, w, h) {
    let c = SCR[key];
    if (!c || c.width < w || c.height < h) { c = SCR[key] = mk(Math.max(w, c ? c.width : 0), Math.max(h, c ? c.height : 0)); }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
    // clear a margin too: smoothed sub-rect draws sample a texel beyond the source rect (no stale bleed)
    g.clearRect(0, 0, Math.min(c.width, Math.ceil(w) + 4), Math.min(c.height, Math.ceil(h) + 4));
    return c;
  }
  const glow = (ctx, x, y, r, col, a) => U().glow(ctx, x, y, r, col, a);
  const rgba = (c, a) => U().rgba(c, a);

  // ---------------------------------------------------------------- metal title sprites (t-independent cache)
  const SPR = {};
  function metalSprite(key, str, o, pal) {
    if (SPR[key]) return SPR[key];
    const tmp = mk(4, 4).getContext('2d');
    const tw = M.measure(tmp, str, o);
    const w = Math.ceil(tw + o.size * 1.4), h = Math.ceil(o.size * 2.7);
    const c = mk(w, h), g = c.getContext('2d');
    const cx = w / 2, cy = h / 2;
    M.text(g, str, cx, cy + o.size * 0.1, Object.assign({}, o, { color: 'rgba(10,5,0,0.85)', shadow: o.size * 0.32 }));
    const depth = Math.max(3, Math.round(o.size * 0.06));
    for (let k = depth; k >= 1; k--) M.text(g, str, cx, cy + k, Object.assign({}, o, { color: k > depth * 0.5 ? pal.extrude2 : pal.extrude }));
    M.text(g, str, cx, cy, Object.assign({}, o, { color: pal.outline, stroke: Math.max(3, o.size * 0.065), strokeColor: pal.outline }));
    M.text(g, str, cx, cy - Math.max(1.5, o.size * 0.022), Object.assign({}, o, { color: pal.hi }));
    const gr = g.createLinearGradient(0, cy - o.size * 0.62, 0, cy + o.size * 0.55);
    pal.face.forEach(([k, col]) => gr.addColorStop(k, col));
    M.text(g, str, cx, cy + 0.6, Object.assign({}, o, { color: gr }));
    const m = mk(w, h), mg = m.getContext('2d');
    M.text(mg, str, cx, cy + 0.6, Object.assign({}, o, { color: '#fff' }));
    return (SPR[key] = { c, m, w, h, tw });
  }
  const GOLD = {
    extrude: '#5a3a0c', extrude2: '#2e1c05', outline: '#1e1203', hi: '#fff6d8',
    face: [[0, '#fffbe8'], [0.2, '#f8e09a'], [0.42, '#d6ae55'], [0.5, '#8c6420'], [0.56, '#c99a40'], [0.75, '#f2d27a'], [0.9, '#ffe9a8'], [1, '#a8792c']],
  };
  const SILVER = {
    extrude: '#26303a', extrude2: '#10161c', outline: '#0a0e12', hi: '#ffffff',
    face: [[0, '#ffffff'], [0.38, '#eef3f6'], [0.5, '#a9b6c0'], [0.58, '#dfe7ec'], [0.85, '#ffffff'], [1, '#c3ccd2']],
  };
  const sprT1 = () => metalSprite('t1', STR_T1, { size: 150, family: 'kufi', weight: 700 }, GOLD);
  // QA: Cairo 900 here — Reem Kufi's medial ج is drawn like ب («كالجبال» read as «كالببال»)
  const sprT2 = () => metalSprite('t2', STR_T2, { size: 66, family: 'arabic', weight: 900 }, SILVER);
  const sprT3 = () => metalSprite('t3', STR_T3, { size: 196, family: 'kufi', weight: 700 }, GOLD);
  function drawMetal(ctx, S, x, y, opt = {}) {
    const sc = opt.scale != null ? opt.scale : 1, a = opt.alpha != null ? opt.alpha : 1;
    if (a <= 0.002) return;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, a);
    ctx.translate(x, y); ctx.scale(sc * (opt.sx || 1), sc);
    ctx.drawImage(S.c, -S.w / 2, -S.h / 2);
    if (opt.spec != null && opt.spec > -0.3 && opt.spec < 1.3) {
      // only the sheared band region is masked (cheap): x in [bx - 90 - 0.175h, bx + 90 + 0.175h]
      const bx = S.w / 2 + S.tw / 2 - opt.spec * (S.tw + 200) + 100;
      const xa = Math.max(0, Math.floor(bx - 92 - 0.18 * S.h)), xb = Math.min(S.w, Math.ceil(bx + 92 + 0.18 * S.h));
      if (xb - xa > 2) {
        const bw = xb - xa;
        const sp = scratch('spec', bw, S.h), g = sp.getContext('2d');
        g.drawImage(S.m, xa, 0, bw, S.h, 0, 0, bw, S.h);
        g.globalCompositeOperation = 'source-in';
        const gr = g.createLinearGradient(bx - 90, 0, bx + 90, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,252,235,${opt.specA || 0.9})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.setTransform(1, 0, -0.35, 1, S.h * 0.175 - xa, 0);
        g.fillStyle = gr; g.fillRect(bx - 90, 0, 180, S.h);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(sp, 0, 0, bw, S.h, -S.w / 2 + xa, -S.h / 2, bw, S.h);
      }
    }
    if (opt.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, a) * Math.min(1, opt.flash);
      ctx.drawImage(S.m, -S.w / 2, -S.h / 2);
    }
    ctx.restore();
  }
  function starGlint(ctx, x, y, r, a, rot = 0) {
    if (a <= 0.01) return;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, r * 1.2, '#ffd98a', a * 0.6);
    glow(ctx, 0, 0, r * 0.45, '#ffffff', a);
    ctx.save(); ctx.scale(7, 0.07); glow(ctx, 0, 0, r, '#ffffff', a); ctx.restore();
    ctx.save(); ctx.scale(0.07, 3.2); glow(ctx, 0, 0, r, '#ffffff', a * 0.9); ctx.restore();
    ctx.restore();
  }

  // ---------------------------------------------------------------- environment
  // ground-plane perspective: px per metre at screen row y = (y - hy) / hc
  function sky(ctx, P) {
    A().sky(ctx, Object.assign({ preset: 'golden' }, P.sky));
  }
  function farDunes(ctx, P, camM) {
    // distant dune silhouettes rising above the horizon band
    A().dunes(ctx, camM, { horizonY: P.hy - 34, bottom: P.hy + 70, layers: 4, scroll: P.duneScroll || 6, seed: P.duneSeed || 3, amp: P.duneAmp || 0.42, palette: 'golden' });
  }
  // ---- static per-shot caches (t-independent): sky plate, far-dune strip, ground texture tile
  const CACHE = {};
  function cached(key, w, h, build) {
    if (CACHE[key]) return CACHE[key];
    const c = mk(w, h); build(c.getContext('2d'));
    return (CACHE[key] = c);
  }
  // sky plate: sky gradient + sun + wide bloom + cirrus + god rays, baked once per shot
  function skyPlate(key, P, o = {}) {
    return cached('sky_' + key, W, H, (g) => {
      sky(g, P);
      if (P.sunX != null) {
        g.save(); g.globalCompositeOperation = 'lighter';
        glow(g, P.sunX, P.sunY, 720, '#ff9a40', 0.16);
        g.restore();
      }
      if (o.cirrus) cirrus(g, 0, o.cirrus);
      if (o.rays) A().lightRays(g, Object.assign({ t: 0 }, o.rays));
    });
  }
  // static-camera shots: sky + dunes + floor baked into one plate
  function fullPlate(key, P, o) {
    return cached('full_' + key, W, H, (g) => {
      g.drawImage(skyPlate(key, P, o), 0, 0);
      drawDunes(g, key, P, 0);
      ground(g, P, 0, key);
    });
  }
  // distant dunes baked into a strip slightly wider than the frame (shifted for slow parallax)
  function duneStrip(key, P) {
    const y0 = P.hy - 230;
    const c = cached('dune_' + key, W + 160, 330, (g) => {
      g.translate(0, -y0); g.scale((W + 160) / W, 1);
      farDunes(g, P, 0);
    });
    return { c, y0 };
  }
  function drawDunes(ctx, key, P, shift) {
    const D = duneStrip(key, P);
    ctx.drawImage(D.c, -80 - clamp(shift, -80, 80), D.y0);
  }
  // desert floor texture: periodic tile (2048 px) holding the sand gradient, far edge, ripples, horizon haze
  const TW = 2048;
  function groundTile(key, P) {
    const top = Math.floor(P.hy - 8);
    const c = cached('gnd_' + key, TW, H - top, (g) => {
      const hy = P.hy;
      g.translate(0, -top);
      g.beginPath();
      g.moveTo(0, H + 20);
      for (let x = 0; x <= TW; x += 32) g.lineTo(x, hy - 3 + (Math.sin(x / TW * TAU * 3 + 1) * 0.6 + Math.sin(x / TW * TAU * 7 + 2) * 0.4) * 3);
      g.lineTo(TW, H + 20); g.closePath();
      const gr = g.createLinearGradient(0, hy - 6, 0, H);
      gr.addColorStop(0, '#f6cf96'); gr.addColorStop(0.08, '#eab47a'); gr.addColorStop(0.3, '#c98a55'); gr.addColorStop(0.62, '#8f5638'); gr.addColorStop(1, '#4a2a1e');
      g.fillStyle = gr; g.fill();
      const R = 26;
      g.lineCap = 'round';
      for (let r = 0; r < R; r++) {
        const v = (r + 1) / R;
        const y = hy + 4 + (H + 60 - hy) * v * v;
        const n = Math.max(4, Math.round(TW / 150)), sp = TW / n;
        const al = clamp(v * 1.6) * 0.5;
        const lw = 0.6 + 3.2 * v * v;
        const pts = [];
        for (let k = 0; k < n; k++) {
          const h1 = hash(k, r * 31 + 7), h2 = hash(k, r * 31 + 8);
          const x = k * sp + h1 * sp * 0.8;
          const len = (40 + 120 * h2) * (0.4 + v);
          const yy = y + (h2 - 0.5) * 18 * v;
          pts.push([x, yy, len], [x - TW, yy, len]);
        }
        g.beginPath();
        for (const [x, yy, len] of pts) { g.moveTo(x, yy); g.quadraticCurveTo(x + len * 0.5, yy - 6 * v - 2, x + len, yy + 1); }
        g.strokeStyle = `rgba(70,36,22,${al})`; g.lineWidth = lw; g.stroke();
        g.beginPath();
        for (const [x, yy, len] of pts) { g.moveTo(x + 3, yy - lw * 0.9); g.quadraticCurveTo(x + len * 0.5, yy - 6 * v - 2 - lw * 0.9, x + len - 3, yy + 1 - lw * 0.9); }
        g.strokeStyle = `rgba(255,214,150,${al * 0.75})`; g.lineWidth = lw * 0.6; g.stroke();
      }
      // soft tonal patches (periodic in the tile)
      for (let i = 0; i < 16; i++) {
        const v = 0.1 + 0.9 * hash(i, (P.duneSeed || 1) * 7 + 1);
        const y = hy + 6 + (H + 80 - hy) * v * v;
        const ppm = (y - hy) / P.hc;
        const wdt = Math.min(1100, (8 + 16 * hash(i, 3)) * ppm);
        const dark = hash(i, 4) > 0.45;
        for (const x of [hash(i, 2) * TW, hash(i, 2) * TW - TW, hash(i, 2) * TW + TW]) {
          g.save(); g.translate(x, y); g.scale(wdt / 64, wdt * 0.07 / 64);
          glow(g, 0, 0, 64, dark ? '#3e1f14' : '#ffd8a0', dark ? 0.28 : 0.2);
          g.restore();
        }
      }
      const hg = g.createLinearGradient(0, hy - 30, 0, hy + 40);
      hg.addColorStop(0, 'rgba(255,214,160,0)'); hg.addColorStop(0.45, 'rgba(255,214,160,0.55)'); hg.addColorStop(1, 'rgba(255,214,160,0)');
      g.fillStyle = hg; g.fillRect(0, hy - 30, TW, 70);
    });
    return { c, top };
  }
  // draw the floor as horizontal bands, each scrolled by its own depth (ground-plane parallax)
  function ground(ctx, P, camM, key) {
    const T = groundTile(key, P), hy = P.hy, hc = P.hc;
    const NB = 34;
    let yPrev = T.top;
    for (let b = 1; b <= NB; b++) {
      let y1 = b === NB ? H : Math.round(hy + (H - hy) * Math.pow(b / NB, 1.7));
      if (y1 - yPrev < 2) continue;
      const yc = (yPrev + y1) / 2, ppm = Math.max(0, yc - hy) / hc;
      const off = ((camM * ppm) % TW + TW) % TW;
      const sy = yPrev - T.top, sh = y1 - yPrev;
      const w1 = Math.min(W, TW - off);
      ctx.drawImage(T.c, off, sy, w1, sh, 0, yPrev, w1, sh);
      if (w1 < W) ctx.drawImage(T.c, 0, sy, W - w1, sh, w1, yPrev, W - w1, sh);
      yPrev = y1;
    }
    // forward-scatter glare on the sand under the sun (screen-fixed)
    if (P.sunX != null) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(P.sunX, hy + 10); ctx.scale(5.5, 1);
      glow(ctx, 0, 0, 120, '#ffc070', 0.5);
      ctx.restore();
    }
  }
  // small dry desert scrub tufts on the plain (parallax depth cues)
  function scrub(ctx, P, camM, seed, n) {
    const hy = P.hy, hc = P.hc;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const v = 0.1 + 0.62 * hash(i, seed + 1);
      const y = hy + 4 + (H + 40 - hy) * v * v;
      const ppm = (y - hy) / hc;
      const span = (W + 400) / ppm;
      const wx = hash(i, seed + 2) * 400;
      const x = ((wx - camM) % span + span) % span * ppm - 200;
      const s = ppm * 0.42;
      ctx.fillStyle = `rgba(52,30,20,${0.55 + 0.4 * v})`;
      ctx.beginPath();
      for (let b = 0; b < 9; b++) {
        const a = -Math.PI / 2 + (b / 8 - 0.5) * 2.4 + (hash(b, i + seed) - 0.5) * 0.3;
        const L = s * (0.5 + 0.5 * hash(b, i + 77));
        ctx.moveTo(x - s * 0.1, y); ctx.quadraticCurveTo(x + Math.cos(a) * L * 0.5 - 2, y + Math.sin(a) * L * 0.6, x + Math.cos(a) * L, y + Math.sin(a) * L);
      }
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1, s * 0.05); ctx.stroke();
      ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.18); ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, TAU); ctx.restore();
      ctx.fillStyle = `rgba(40,20,12,${0.3 * v})`; ctx.fill();
    }
    ctx.restore();
  }

  // thin golden-hour cirrus / stratus streaks (soft, cheap, parallax drift)
  function cirrus(ctx, t, o) {
    const n = o.n || 12, seed = o.seed || 1;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const h1 = hash(i, seed + 1), h2 = hash(i, seed + 2), h3 = hash(i, seed + 3), h4 = hash(i, seed + 4);
      const depth = 0.4 + 0.6 * h3;
      const len = (380 + 900 * h2) * (0.6 + 0.6 * depth);
      const x = U().wrap(h1 * (W + 1600) - t * (o.speed || 12) * depth, -900, W + 700);
      const y = o.y0 + (o.y1 - o.y0) * Math.pow(h4, 0.8);
      const th = (8 + 22 * h3) * (0.6 + 0.6 * depth);
      const dS = o.sunX != null ? Math.abs(x + len * 0.5 - o.sunX) / W : 0.5;
      const lit = clamp(1 - dS * 1.3) * clamp((y - 60) / 500);
      for (let k = 0; k < 5; k++) {
        const hx = hash(k, i * 13 + seed), hy = hash(k, i * 17 + seed);
        const cx = x + len * (0.1 + 0.8 * hx), cy = y + (hy - 0.5) * th * 1.4 - k * 1.5;
        const sx = len * (0.18 + 0.2 * hy) / 64, sy = th * (0.5 + 0.6 * hx) / 64;
        ctx.save(); ctx.translate(cx, cy); ctx.scale(sx, sy);
        glow(ctx, 0, 6, 64, '#5a3c58', (o.alpha || 0.3) * 0.55);
        glow(ctx, 0, 0, 64, lit > 0.5 ? '#ffd9a8' : '#e7a98c', (o.alpha || 0.3) * (0.5 + 0.7 * lit));
        ctx.restore();
      }
    }
    ctx.restore();
  }
  // soft tonal patches on the plain (world-anchored, perspective)
  function groundPatches(ctx, P, camM, seed, n) {
    const hy = P.hy, hc = P.hc;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const v = 0.1 + 0.9 * hash(i, seed + 1);
      const y = hy + 6 + (H + 80 - hy) * v * v;
      const ppm = (y - hy) / hc;
      const span = (W + 1400) / ppm;
      const x = ((hash(i, seed + 2) * 600 - camM) % span + span) % span * ppm - 700;
      const wdt = Math.min(1100, (8 + 16 * hash(i, seed + 3)) * ppm);
      const dark = hash(i, seed + 4) > 0.45;
      ctx.save(); ctx.translate(x, y); ctx.scale(wdt / 64, wdt * 0.07 / 64);
      glow(ctx, 0, 0, 64, dark ? '#3e1f14' : '#ffd8a0', dark ? 0.28 : 0.2);
      ctx.restore();
    }
    ctx.restore();
  }
  // tank track marks trailing a tank (world-anchored tread dashes)
  function trackMarks(ctx, T, t, camScroll) {
    const xr = T.x(t) - 3.7 * 60 * T.s, s = T.s;
    if (xr < -20) return;
    ctx.save();
    const x1 = xr - 1500 * s;
    const g = ctx.createLinearGradient(xr, 0, x1, 0);
    g.addColorStop(0, 'rgba(60,30,16,0.32)'); g.addColorStop(1, 'rgba(60,30,16,0)');
    const gl = ctx.createLinearGradient(xr, 0, x1, 0);
    gl.addColorStop(0, 'rgba(255,214,150,0.22)'); gl.addColorStop(1, 'rgba(255,214,150,0)');
    for (const [dy, w] of [[-3 * s, 4.5 * s], [7 * s, 7 * s]]) {
      ctx.fillStyle = g; ctx.fillRect(x1, T.y + dy - w / 2, xr - x1, w);
      ctx.fillStyle = gl; ctx.fillRect(x1, T.y + dy - w / 2 - 1.2 * s, xr - x1, 1.2 * s);
    }
    // faint tread texture, anchored to the ground
    ctx.strokeStyle = g; ctx.globalAlpha = 0.5;
    ctx.setLineDash([3 * s, 4 * s]);
    ctx.lineDashOffset = -camScroll;
    ctx.lineWidth = 6 * s;
    ctx.beginPath(); ctx.moveTo(xr, T.y + 7 * s); ctx.lineTo(x1, T.y + 7 * s); ctx.stroke();
    ctx.restore();
  }
  // ground shock: expanding flattened ring of lifted dust + a brief refractive flash ring
  function groundShock(ctx, age, o) {
    if (age < 0 || age > 2.6) return;
    const s = o.s, sq = 0.2;
    const R = 560 * s * (1 - Math.exp(-age * 4.2));
    const x = o.x - (o.drift || 0) * age, y = o.y;
    if (age < 0.35) {
      const a = Math.pow(1 - age / 0.35, 1.5);
      ctx.save(); ctx.translate(x, y); ctx.scale(1, sq); ctx.globalCompositeOperation = 'lighter';
      const w = 70 * s;
      const g = ctx.createRadialGradient(0, 0, Math.max(0, R - w), 0, 0, R + w * 0.3);
      g.addColorStop(0, 'rgba(255,230,180,0)'); g.addColorStop(0.75, `rgba(255,230,180,${0.35 * a})`); g.addColorStop(0.92, `rgba(255,250,235,${0.55 * a})`); g.addColorStop(1, 'rgba(255,230,180,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R + w * 0.3, 0, TAU); ctx.fill();
      ctx.restore();
    }
    const N = o.n || 40;
    for (let i = 0; i < N; i++) {
      const h = hash(i, (o.seed || 1) + 61), h2 = hash(i, (o.seed || 1) + 62);
      const th = TAU * i / N + (h - 0.5) * 0.25;
      const rr = R * (0.86 + 0.2 * h2);
      const px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr * sq;
      const r = (30 + 36 * h) * s * (0.45 + age * 1.25);
      const front = Math.sin(th) > 0 ? 1 : 0.55;
      const al = 0.7 * Math.min(1, age * 9) * Math.pow(clamp(1 - age / (2.0 + 0.6 * h)), 1.3) * front;
      A().drawPuff(ctx, A().puffSprite(i, h2 > 0.55 ? '#efd2a2' : '#cfab7c'), px, py - r * 0.45 - age * 18 * s, r, al, h * TAU + age * 0.5);
    }
  }

  // ---------------------------------------------------------------- tanks + world-anchored dust
  // T = {s, y, x(t) screen x, vg ground scroll px/s at that depth, seed, speed m/s, bl}
  const DUST_TONES = ['#fde6ba', '#ecd0a0', '#c4a47c', '#9c7d5c'];
  // render soft content (dust/smoke puffs) at reduced resolution into a scratch, then composite (fill-rate saver)
  function lowres(ctx, x0, y0, x1, y1, res, fn) {
    x0 = Math.max(-300, Math.floor(x0)); y0 = Math.max(-300, Math.floor(y0));
    x1 = Math.min(W + 300, Math.ceil(x1)); y1 = Math.min(H + 300, Math.ceil(y1));
    if (x1 - x0 < 4 || y1 - y0 < 4) return;
    const sw = Math.ceil((x1 - x0) * res), sh = Math.ceil((y1 - y0) * res);
    const c = scratch('lowres', sw, sh), g = c.getContext('2d');
    g.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
    fn(g);
    ctx.drawImage(c, 0, 0, sw, sh, x0, y0, sw / res, sh / res);
  }
  function tankDust(ctx, t, T, o = {}) {
    const s = T.s, life = o.life || 3.0, xr = T.x(t) - 3.4 * 60 * s;
    const reach = T.vg * life + 520 * s + (o.wind || 28) * s * life;
    lowres(ctx, xr - reach - 260 * s, T.y - 300 * s - 260 * s, xr + 200 * s, T.y + 120 * s, 0.5, (g) => tankDustRaw(g, t, T, o));
  }
  function tankDustRaw(ctx, t, T, o = {}) {
    const s = T.s, rate = o.rate || (T.s < 0.5 ? 7 : 10), life = o.life || 3.0, dt = 1 / rate;
    const i1 = Math.floor(t / dt), i0 = Math.floor((t - life * 1.1) / dt);
    const alpha = (o.alpha != null ? o.alpha : 0.8);
    const sun = o.sun;
    for (let i = i0; i <= i1; i++) {
      const b = i * dt, a = t - b;
      if (a < 0) continue;
      const h1 = hash(i, T.seed * 13 + 1), h2 = hash(i, T.seed * 13 + 2), h3 = hash(i, T.seed * 13 + 3);
      const L = life * (0.75 + 0.35 * h3) * (i % 3 === 0 ? 0.6 : 1);
      if (a > L) continue;
      const k = a / L;
      // every third puff is track spray thrown up along the whole track run; the rest is the rooster tail
      const spray = i % 3 === 0;
      const ex = spray ? T.x(b) + (h3 - 0.62) * 6.6 * 60 * s : T.x(b) - 3.4 * 60 * s + (h3 - 0.5) * 70 * s;
      const kick = (70 + 110 * h1) * s * (1 - Math.exp(-a * 2.2)) / 2.2 * (spray ? 0.8 : 2.0);
      const x = ex - T.vg * a - kick - (o.wind || 28) * s * a;
      const y = T.y - 8 * s - (16 + 46 * h2) * s * a * (spray ? 0.5 : 1) - 34 * s * Math.sqrt(a) * (0.6 + h1) * (spray ? 0.5 : 1);
      const r = (40 + 40 * h3) * s * (0.45 + (o.grow || 2.5) * Math.pow(k, 0.6)) * (spray ? 0.65 : 1);
      const al = alpha * Math.min(1, a * 5) * Math.pow(1 - k, 1.5) * (0.55 + 0.45 * h1);
      let tone = 1 + (h2 > 0.75 ? -1 : 0);
      if (sun) { const d = Math.hypot(x - sun.x, y - sun.y); tone = d < 360 ? 0 : d < 760 ? tone : Math.min(3, tone + 1 + (h1 > 0.6 ? 1 : 0)); }
      if (o.tone != null) tone = o.tone;
      const col = o.colors ? o.colors[(h2 * o.colors.length) | 0] : (o.tones || DUST_TONES)[tone];
      A().drawPuff(ctx, A().puffSprite(i, col), x, y, r, al, h1 * TAU + a * 0.3);
    }
  }
  function castShadow(ctx, x, y, w, len, skew, a) {
    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, `rgba(40,20,10,${a})`); g.addColorStop(1, 'rgba(40,20,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w / 2 + skew + w * 0.15, y + len); ctx.lineTo(x - w / 2 + skew - w * 0.05, y + len);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // the tank asset composites a sub-rect of shared scratch canvases; with several tank sizes per frame a smoothed
  // sub-rect draw can sample stale texels from an earlier, larger tank → wipe those canvases fully first
  function freshTankScratch() {
    for (const key of ['tankBody', 'tankRim']) { const c = U().scratch(key, 1, 1); U().scratch(key, c.width, c.height); }
  }
  function drawTank(ctx, t, T, o = {}) {
    if (o.tracks !== false) trackMarks(ctx, T, t, o.scroll || 0);
    if (!o.noDust) tankDust(ctx, t, T, o.dust || {});
    const x = T.x(t);
    castShadow(ctx, x + 10 * T.s, T.y - 4 * T.s, 470 * T.s, (o.shadowLen || 70) * T.s, 60 * T.s, 0.32);
    const to = { x, y: T.y, scale: T.s, t: t + T.seed * 0.37, speed: T.speed, backlight: T.bl, turret: o.turret || 0, recoil: o.recoil || 0, seed: T.seed };
    freshTankScratch();
    A().tank(ctx, to);
    return to;
  }

  // ---------------------------------------------------------------- soldiers (soft foreground = depth of field)
  function soldierSoft(ctx, o, res) {
    if (res >= 0.99) { A().soldier(ctx, o); return; }
    const sc = o.scale, hgt = 400 * sc, wid = 320 * sc;
    const cw = Math.ceil(wid * res) + 8, ch = Math.ceil(hgt * res) + 8;
    const c = scratch('sold', cw, ch), g = c.getContext('2d');
    g.setTransform(res, 0, 0, res, (wid * 0.5) * res + 4, (hgt - 20 * sc) * res + 4);
    A().soldier(g, Object.assign({}, o, { x: 0, y: 0 }));
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, 0, 0, cw, ch, o.x - wid * 0.5 - 4 / res, o.y - (hgt - 20 * sc) - 4 / res, cw / res, ch / res);
    ctx.restore();
  }
  // infantry squad walking right (rifles at low ready); x0 at time tRef, screen speed vs (px/s)
  function squad(ctx, t, o) {
    for (let i = 0; i < o.n; i++) {
      const x = o.x0 + i * o.gap + (hash(i, o.seed) - 0.5) * o.gap * 0.4 + o.vs * (t - o.tRef);
      const y = o.y + (hash(i, o.seed + 1) - 0.5) * 6;
      const sc = o.s * (0.94 + 0.12 * hash(i, o.seed + 2));
      if (x < -100 || x > W + 100) continue;
      A().soldier(ctx, { x, y, scale: sc, pose: 'walk', t, phase: hash(i, o.seed + 3), rim: o.rim || '#ffcf8a', color: o.color || '#2a2018', rimWidth: 2 });
    }
  }
  // out-of-focus dark sand mounds framing the bottom of the frame
  function fgShade(ctx, list) {
    ctx.save();
    for (const [x, y, rx, ry, a] of list) {
      ctx.save(); ctx.translate(x, y); ctx.scale(rx / 64, ry / 64);
      glow(ctx, 0, 0, 64, '#1e0f09', a);
      ctx.restore();
    }
    ctx.restore();
  }
  // dark silhouette with a hot rim (for objects in front of the sun). drawFn(g) draws into a bw×bh scratch.
  function silhouette(ctx, bx, by, bw, bh, drawFn, o = {}) {
    const res = o.res || 1, sw = Math.ceil(bw * res), sh = Math.ceil(bh * res);
    const c = scratch('sil', sw, sh), g = c.getContext('2d');
    g.setTransform(res, 0, 0, res, 0, 0);
    drawFn(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = o.k != null ? o.k : 0.9; g.fillStyle = o.dark || '#170b07'; g.fillRect(0, 0, sw, sh);
    const r = scratch('silRim', sw, sh), rg = r.getContext('2d');
    rg.drawImage(c, 0, 0);
    rg.globalCompositeOperation = 'source-in'; rg.fillStyle = o.rim || '#ffbf70'; rg.fillRect(0, 0, sw, sh);
    const rw = o.rw || 3;
    ctx.save();
    ctx.globalAlpha *= 0.9;
    ctx.drawImage(r, 0, 0, sw, sh, bx, by - rw, bw, bh);
    ctx.drawImage(r, 0, 0, sw, sh, bx - rw * 0.7, by - rw * 0.5, bw, bh);
    ctx.globalAlpha /= 0.9;
    ctx.drawImage(c, 0, 0, sw, sh, bx, by, bw, bh);
    ctx.restore();
  }

  // ---------------------------------------------------------------- atmosphere
  function heatHaze(ctx, y0, y1, amp, t, seed = 1) {
    y0 = Math.max(0, Math.round(y0)); y1 = Math.min(H, Math.round(y1));
    const hgt = y1 - y0;
    if (hgt <= 4) return;
    const c = scratch('haze', W, hgt), g = c.getContext('2d');
    g.drawImage(ctx.canvas, 0, y0, W, hgt, 0, 0, W, hgt);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const st = 3;
    for (let y = 0; y < hgt; y += st) {
      const sh = Math.min(st, hgt - y);
      const k = Math.sin(Math.PI * y / hgt);
      const dx = (Math.sin(y * 0.21 + t * 9.0 + seed) * 0.6 + Math.sin(y * 0.083 - t * 5.3) * 0.4 + noise1(y * 0.05 + t * 3, seed) * 0.5) * amp * k;
      ctx.drawImage(c, 0, y, W, sh, dx, y0 + y, W, sh);
    }
    ctx.restore();
  }
  function motes(ctx, t, o) {
    const n = o.n || 70, seed = o.seed || 5;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const h1 = hash(i, seed), h2 = hash(i, seed + 1), h3 = hash(i, seed + 2), h4 = hash(i, seed + 3);
      const depth = 0.3 + 0.7 * h4;
      const x = U().wrap(h1 * (W + 200) + t * (o.vx || 30) * depth + noise1(t * 0.4 + i, seed) * 40, -100, W + 100);
      const y = U().wrap(h2 * H - t * (8 + 14 * h3) * depth + noise1(t * 0.3 + i * 3, seed + 9) * 30, -40, H + 40);
      const dS = o.sunX != null ? Math.hypot(x - o.sunX, y - o.sunY) : 9999;
      const lit = 0.25 + 1.2 * Math.exp(-dS / 520);
      const tw = 0.6 + 0.4 * Math.sin(t * (2 + 4 * h3) + i);
      const a = (o.alpha || 0.5) * lit * tw * (0.3 + 0.7 * h3);
      const r = (1.2 + 3.2 * h4 * h4) * (o.size || 1);
      glow(ctx, x, y, r * 4, '#ffcf8a', a * 0.5);
      ctx.fillStyle = `rgba(255,236,200,${Math.min(1, a)})`;
      ctx.fillRect(x - r * 0.4, y - r * 0.4, r * 0.8, r * 0.8);
    }
    ctx.restore();
  }
  // wind-blown sand streaks skimming the ground
  function sandStreaks(ctx, t, o) {
    const n = o.n || 40, seed = o.seed || 9;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const h1 = hash(i, seed), h2 = hash(i, seed + 1), h3 = hash(i, seed + 2);
      const sp = (o.speed || 420) * (0.6 + 0.8 * h2);
      const len = (60 + 220 * h3) * (o.len || 1);
      const x = U().wrap(h1 * (W + 600) - t * sp, -300, W + 300);
      const y = o.y0 + (o.y1 - o.y0) * Math.pow(h2, 0.7) + Math.sin(t * 3 + i) * 4;
      const a = (o.alpha || 0.25) * (0.3 + 0.7 * h3);
      const dir = sp >= 0 ? 1 : -1;
      const g = ctx.createLinearGradient(x, 0, x + len * dir, 0);
      g.addColorStop(0, `rgba(255,220,160,${a})`); g.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1 + 2 * h3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len * dir, y + (h1 - 0.5) * 6); ctx.stroke();
    }
    ctx.restore();
  }
  function sunBloom(ctx, x, y, k = 1) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 240 * k, '#ffd08a', 0.2);
    glow(ctx, x, y, 80 * k, '#ffffff', 0.32);
    ctx.save(); ctx.translate(x, y); ctx.scale(8, 0.14); glow(ctx, 0, 0, 160 * k, '#ffd9a0', 0.35); ctx.restore();
    ctx.restore();
  }
  function grade(ctx, warm = 1) {
    ctx.save();
    const g2 = ctx.createLinearGradient(0, 0, 0, 160);
    g2.addColorStop(0, 'rgba(6,8,14,0.45)'); g2.addColorStop(1, 'rgba(6,8,14,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, 160);
    const g3 = ctx.createLinearGradient(0, H - 200, 0, H);
    g3.addColorStop(0, 'rgba(10,6,4,0)'); g3.addColorStop(1, `rgba(10,6,4,${0.45 * warm})`);
    ctx.fillStyle = g3; ctx.fillRect(0, H - 200, W, 200);
    ctx.restore();
  }
  // horizontal motion blur of the current frame (squash/stretch resample), blended at alpha
  function hBlur(ctx, f, alpha) {
    if (alpha <= 0.01) return;
    const w = Math.ceil(W / f);
    const c = scratch('hblur', w, H), g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, w, H);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, 0, 0, w, H, 0, 0, W, H);
    ctx.restore();
  }

  // ---------------------------------------------------------------- camera shake
  function shakeAmt(t) {
    let a = 0;
    if (after(t, T_TITLE)) a += 9 * decay(t, T_TITLE, 7);
    if (after(t, T_FIRE1)) a += 32 * decay(t, T_FIRE1, 5.5);
    if (after(t, T_IMP1)) a += 5 * decay(t, T_IMP1, 6);
    if (after(t, T_FIRE2)) a += 16 * decay(t, T_FIRE2, 6);
    if (after(t, T_IMP2)) a += 3 * decay(t, T_IMP2, 6);
    if (after(t, T_D)) a += 16 * decay(t, T_D, 6.5);
    if (after(t, T_DUST - 0.1)) a += 7 * sstep(T_DUST - 0.1, T_DUST + 0.2, t);
    return a;
  }
  function applyShake(ctx, t, k = 1) {
    const a = shakeAmt(t) * k;
    if (a < 0.05) return;
    const s = M.shake(t, a, 22, 41);
    ctx.translate(960, 540); ctx.rotate(s.r * 1.5); ctx.translate(-960 + s.x, -540 + s.y);
  }

  // ================================================================ SHOT A — column advance (24.0 – 26.4)
  const PA = { hy: 812, hc: 1.15, sunX: 500, sunY: 716, duneSeed: 5, duneAmp: 0.5, duneScroll: 5,
    sky: { horizonY: 812, sunX: 500, sunY: 716, sunR: 46, glow: 1.15 } };
  const VCA = 0;                                      // locked-off camera (push-in only)
  const camA = (t) => VCA * (t - T0);
  function tankA(i) {
    // lead (i=0) nearest/right … column recedes to the left-back
    const S = [1.22, 0.72, 0.45, 0.3][i], X0 = [880, 360, 20, -170][i];
    const y = PA.hy + S * 60 * PA.hc;
    const vWorld = 3.4, ppm = S * 60;
    return { s: S, y, seed: 11 + i * 7, speed: vWorld, bl: 0.68, vg: VCA * ppm, x: (tt) => X0 + (vWorld - VCA) * ppm * (tt - T0) };
  }
  const TA = [2, 1, 0].map(tankA);
  function shotA(ctx, t) {
    const lt = t - T0;
    const camM = camA(t);
    // entrance: content settles from the right (continuing the jet's right → left wipe)
    // whip settle: the frame arrives slightly zoomed and offset (within the zoom margin, no exposed edges)
    const se = 1 - ease.outCubic(prog(lt, 0, 0.65));
    const settle = 66 * se;
    const zoom = 1.0 + 0.075 * se + 0.05 * ease.inOutQuad(prog(t, T0, T_B));
    const sun = { x: PA.sunX, y: PA.sunY };
    ctx.save();
    ctx.translate(960, 680); ctx.scale(zoom, zoom); ctx.translate(-960 + settle, -680);
    applyShake(ctx, t);
    ctx.drawImage(fullPlate('A', PA, { cirrus: { n: 12, seed: 3, y0: 90, y1: 520, sunX: PA.sunX, alpha: 0.32 }, rays: { x: PA.sunX, y: PA.sunY, count: 24, alpha: 0.07, color: '#ffd59a', length: 1700, spread: 2.6, angle: -0.35, width: 0.03 } }), 0, 0);
    scrub(ctx, PA, camM, 21, 10);
    for (const T of TA) drawTank(ctx, t, T, { scroll: T.s * 60 * 3.4 * (t - T0), dust: { alpha: 1.5, grow: 3.0, sun, tones: ['#f8dfb2', '#cfae84', '#b08e68', '#9c7c5c'] } });
    squad(ctx, t, { n: 4, x0: 560, gap: 64, y: 874, s: 0.27, vs: (2.2 - VCA) * 54, tRef: T0, seed: 5 });
    sandStreaks(ctx, t, { n: 26, y0: PA.hy + 10, y1: H - 60, alpha: 0.2, speed: 380, seed: 3 });
    heatHaze(ctx, PA.hy - 80, PA.hy + 30, 2.6, t, 2);
    fgShade(ctx, [[1700 - camM * 300, 1120, 700, 120, 0.85], [1050 - camM * 300, 1130, 420, 70, 0.6]]);
    // foreground soldiers (static, watching the column) — soft, rim-lit silhouettes
    const fx = -camM * 260;
    soldierSoft(ctx, { x: 110 + fx, y: PA.hy + 1.15 * 262, scale: 1.3, pose: 'stand', t, rim: '#ffcf8a', rimWidth: 3.4 }, 0.45);
    soldierSoft(ctx, { x: 280 + fx * 0.92, y: PA.hy + 1.15 * 240, scale: 1.18, pose: 'kneel', t, rim: '#ffcf8a', rimWidth: 3.2 }, 0.5);
    ctx.restore();
    const sx = 960 + (PA.sunX - 960 + settle) * zoom, sy = 680 + (PA.sunY - 680) * zoom;
    sunBloom(ctx, sx, sy, 1);
    A().lensFlare(ctx, { x: sx, y: sy, intensity: 0.32 });
    motes(ctx, t, { n: 80, seed: 7, sunX: sx, sunY: sy, alpha: 0.5 });
    grade(ctx);
  }

  // ================================================================ SHOT B — lead tank fires (26.4 – 28.2)
  const PB = { hy: 792, hc: 0.95, sunX: 150, sunY: 650, duneSeed: 8, duneAmp: 0.55, duneScroll: 10,
    sky: { horizonY: 792, sunX: 150, sunY: 650, sunR: 50, glow: 1.2 } };
  const VB = 3.2;                                      // tank speed, camera tracks it (m/s)
  const camB = (t) => VB * (t - T_B);
  const TB = { s: 1.62, y: 792 + 1.62 * 60 * 0.95, seed: 3, speed: VB, bl: 0.62, vg: VB * 1.62 * 60, x: () => 640 };
  const TB2 = { s: 0.52, y: 792 + 0.52 * 60 * 0.95, seed: 17, speed: VB, bl: 0.7, vg: VB * 0.52 * 60, x: (tt) => 60 + 0.35 * 0.52 * 60 * (tt - T_B) };
  const TARGET1 = { x: 1660, y: 770 };
  function gunLay(t) {
    // gun lays onto the target: rises, overshoots, settles before the shot
    const k = prog(t, T_B + 0.05, T_B + 0.5);
    return lerp(-0.012, 0.045, ease.outBack(k));
  }
  function recoilAt(t, c) { return after(t, c) ? Math.exp(-(t - c) * 4.2) * (1 - 0.25 * Math.exp(-(t - c) * 30)) : 0; }
  function cannonBlast(ctx, age, o) {
    // hero muzzle blast: flash star + fire jet, then world-anchored blast smoke (o.drift px/s ground scroll)
    if (age < 0 || age > 3.2) return;
    const s = o.s, ang = o.ang;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const bx = o.x0 - o.drift * age, by = o.y0;
    const NB = o.s > 1 ? 24 : 16;
    // blast smoke rendered at half resolution (soft anyway)
    lowres(ctx, bx - 420 * s, by - 420 * s, bx + 760 * s, by + 260 * s, 0.5, (ctx) => {
    for (let i = 0; i < NB; i++) {
      const h1 = hash(i, 501), h2 = hash(i, 502), h3 = hash(i, 503);
      const side = i % 3 === 0 ? (h2 - 0.5) * 2.4 : (h2 - 0.5) * 0.9;
      const v = (160 + 520 * h1) * s, kk = 3.2;
      const d = v * (1 - Math.exp(-kk * age)) / kk;
      const lx = Math.cos(side) * d, ly = Math.sin(side) * d;
      const x = bx + lx * ca - ly * sa - (18 + 14 * h3) * s * age;
      const y = by + lx * sa + ly * ca - (10 + 26 * h3) * s * age;
      const r = (22 + 26 * h3) * s * (0.5 + 1.6 * Math.pow(age, 0.6));
      const al = 0.85 * Math.min(1, age * 18) * Math.pow(clamp(1 - age / (2.2 + h2)), 1.3);
      const warm = clamp(1 - age / 0.35);
      if (al > 0.01) {
        A().drawPuff(ctx, A().puffSprite(i, h3 > 0.5 ? '#c4b092' : '#a89478'), x, y, r, al * (1 - warm * 0.5), h1 * TAU + age * 0.4);
        if (warm > 0) A().drawPuff(ctx, A().puffSprite(i, '#ff9a4a'), x, y, r * 0.9, al * warm * 0.8, h1 * TAU);
      }
    }
    });
    if (age < 0.26) {
      const k = 1 - age / 0.26, f = Math.pow(k, 1.6);
      ctx.save();
      ctx.translate(o.x, o.y); ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 60 * s, 0, 420 * s, '#ff9a3a', f * 0.9);
      glow(ctx, 30 * s, 0, 200 * s, '#ffe2a0', f);
      const L = 330 * s * (0.7 + 0.3 * k);
      const g = ctx.createLinearGradient(0, 0, L, 0);
      g.addColorStop(0, `rgba(255,255,245,${f})`); g.addColorStop(0.35, `rgba(255,214,110,${0.9 * f})`); g.addColorStop(0.75, `rgba(255,130,40,${0.55 * f})`); g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, -18 * s); ctx.bezierCurveTo(L * 0.3, -60 * s, L * 0.7, -40 * s, L, 0); ctx.bezierCurveTo(L * 0.7, 40 * s, L * 0.3, 60 * s, 0, 18 * s); ctx.closePath(); ctx.fill();
      for (const sd of [-1, 1]) {
        ctx.save(); ctx.rotate(sd * 1.25);
        const g2 = ctx.createLinearGradient(0, 0, L * 0.5, 0);
        g2.addColorStop(0, `rgba(255,245,210,${f})`); g2.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(0, -12 * s); ctx.quadraticCurveTo(L * 0.25, -22 * s, L * 0.5, 0); ctx.quadraticCurveTo(L * 0.25, 22 * s, 0, 12 * s); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.save(); ctx.scale(1, 0.06); glow(ctx, 0, 0, 900 * s, '#fff2d0', f * 0.8); ctx.restore();
      glow(ctx, 0, 0, 110 * s, '#ffffff', f);
      ctx.restore();
    }
    if (age < 0.8) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let i = 0; i < 30; i++) {
        const h1 = hash(i, 511), h2 = hash(i, 512), h3 = hash(i, 513);
        const life = 0.3 + 0.5 * h3; if (age > life) continue;
        const a2 = ang + (h1 - 0.5) * 1.3, v = (700 + 1500 * h2) * s;
        const kk = 3;
        const d = v * (1 - Math.exp(-kk * age)) / kk, d0 = v * (1 - Math.exp(-kk * Math.max(0, age - 0.03))) / kk;
        const px = o.x + Math.cos(a2) * d - o.drift * age, py = o.y + Math.sin(a2) * d + 300 * age * age;
        const qx = o.x + Math.cos(a2) * d0 - o.drift * Math.max(0, age - 0.03), qy = o.y + Math.sin(a2) * d0 + 300 * Math.pow(Math.max(0, age - 0.03), 2);
        ctx.strokeStyle = `rgba(255,${180 + 70 * h1 | 0},110,${1 - age / life})`; ctx.lineWidth = 1.5 + 2 * h3;
        ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px, py); ctx.stroke();
      }
      ctx.restore();
    }
  }
  // overpressure dust lifted off the ground around the muzzle / tank (world-anchored)
  function blastDust(ctx, age, o) {
    if (age < 0 || age > 3.5) return;
    const s = o.s;
    for (let i = 0; i < (o.n || 34); i++) {
      const h1 = hash(i, o.seed + 1), h2 = hash(i, o.seed + 2), h3 = hash(i, o.seed + 3);
      const dir = (h1 - 0.35) * 2;
      const v = (300 + 700 * h2) * s, kk = 2.6;
      const d = v * (1 - Math.exp(-kk * age)) / kk;
      const x = o.x + dir * d - o.drift * age;
      const y = o.y + (h3 - 0.5) * 30 * s - (20 + 70 * h3) * s * Math.sqrt(age) - 12 * s * age;
      const r = (30 + 40 * h3) * s * (0.4 + 1.5 * Math.pow(age, 0.55));
      const al = 0.7 * Math.min(1, age * 10) * Math.pow(clamp(1 - age / (2.4 + h1)), 1.4);
      A().drawPuff(ctx, A().puffSprite(i + 3, h2 > 0.6 ? '#f0d4a4' : '#d6b282'), x, y, r, al, h1 * TAU + age * 0.3);
    }
  }
  function tracer(ctx, t, from, to, t0, t1) {
    if (t < t0 || t > t1 + 0.12) return;
    const k = clamp((t - t0) / (t1 - t0)), k0 = clamp((t - t0 - 0.07) / (t1 - t0));
    const P = (u) => ({ x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u) - Math.sin(u * Math.PI) * 18 });
    const a = P(k), b = P(k0);
    const fade = t > t1 ? 1 - (t - t1) / 0.12 : 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    const g = ctx.createLinearGradient(b.x, b.y, a.x, a.y);
    g.addColorStop(0, 'rgba(255,180,90,0)'); g.addColorStop(1, `rgba(255,240,200,${0.95 * fade})`);
    ctx.strokeStyle = g; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke();
    glow(ctx, a.x, a.y, 40, '#ffd27a', 0.9 * fade);
    ctx.restore();
  }
  function shotB(ctx, t) {
    const age = t - T_FIRE1;
    const camM = camB(t);
    const sun = { x: PB.sunX, y: PB.sunY };
    const punch = after(t, T_FIRE1) ? 0.035 * Math.exp(-age * 5) : 0;
    const push = 1 + 0.05 * ease.inOutQuad(prog(t, T_B, T_C)) + punch;
    ctx.save();
    ctx.translate(800, 700); ctx.scale(push, push); ctx.translate(-800, -700);
    applyShake(ctx, t);
    ctx.drawImage(skyPlate('B', PB, { cirrus: { n: 12, seed: 11, y0: 80, y1: 500, sunX: PB.sunX, alpha: 0.32 }, rays: { x: PB.sunX, y: PB.sunY, count: 20, alpha: 0.06, color: '#ffd59a', length: 1700, spread: 1.8, angle: -0.15, width: 0.03 } }), 0, 0);
    drawDunes(ctx, 'B', PB, camM * PB.duneScroll * 0.8);
    const iAge = t - T_IMP1;
    if (iAge > 0) A().explosion(ctx, iAge, { x: TARGET1.x - 10 * iAge, y: TARGET1.y, scale: 0.44, seed: 4 });
    ground(ctx, PB, camM, 'B');
    scrub(ctx, PB, camM, 51, 9);
    drawTank(ctx, t, TB2, { scroll: (t - T_B) * (VB + 0.35) * 0.52 * 60, dust: { sun } });
    const rec = recoilAt(t, T_FIRE1);
    trackMarks(ctx, TB, t, (t - T_B) * TB.vg);
    tankDust(ctx, t, TB, { alpha: 0.95, sun, life: 2.6, rate: 14 });
    const to = drawTank(ctx, t, TB, { noDust: true, tracks: false, turret: gunLay(t), recoil: rec, shadowLen: 60 });
    const mz = A().tankMuzzle(to);
    if (after(t, T_FIRE1) && age < 0.3) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const f = Math.pow(1 - age / 0.3, 2);
      glow(ctx, mz.x - 140, mz.y + 30, 560, '#ffb050', 0.6 * f);
      ctx.translate(mz.x + 100, TB.y + 10); ctx.scale(3, 0.5); glow(ctx, 0, 0, 260, '#ffc070', 0.6 * f);
      ctx.restore();
    }
    if (after(t, T_FIRE1)) {
      lowres(ctx, mz.x - 820 - 300 * age, TB.y - 420, mz.x + 820, TB.y + 220, 0.5, (g) => {
        groundShock(g, age, { x: mz.x + 40, y: TB.y + 8, s: 1.15, drift: TB.vg * 0.9, seed: 5, n: 44 });
        blastDust(g, age, { x: mz.x - 40, y: TB.y + 4, s: 1.4, drift: TB.vg * 0.6, seed: 70, n: 28 });
      });
      cannonBlast(ctx, age, { x: mz.x, y: mz.y, x0: mz.x + 30, y0: mz.y, ang: mz.angle, s: 1.45, drift: TB.vg * 0.55 });
      tracer(ctx, t, { x: mz.x + 120, y: mz.y }, { x: TARGET1.x, y: TARGET1.y - 14 }, T_FIRE1 + 0.03, T_IMP1);
    }
    // targeting brackets tighten on the empty dune before the shot
    const bk = prog(t, T_B + 0.15, T_FIRE1 - 0.08);
    const ba = sstep(T_B + 0.1, T_B + 0.3, t) * (1 - sstep(T_FIRE1 - 0.02, T_FIRE1 + 0.15, t));
    if (ba > 0) {
      const sz = lerp(260, 120, ease.outCubic(bk));
      A().hudBracket(ctx, TARGET1.x - sz / 2, TARGET1.y - 30 - sz * 0.35, sz, sz * 0.7, { alpha: 0.85 * ba, t, len: 22, thick: 2.5, glow: 10, breathe: 0.4 });
      M.text(ctx, 'RNG 2,450 M', TARGET1.x - sz / 2 - 14, TARGET1.y - 30 - sz * 0.35 + 10, { size: 18, family: 'latin', weight: 500, color: '#7CFFB2', align: 'right', alpha: 0.8 * ba, letterSpacing: 2 });
    }
    sandStreaks(ctx, t, { n: 30, y0: PB.hy + 20, y1: H - 40, alpha: 0.22, speed: 300 + TB.vg * 0.4, seed: 13 });
    heatHaze(ctx, PB.hy - 80, PB.hy + 26, 2.4, t, 5);
    ctx.restore();
    sunBloom(ctx, PB.sunX, PB.sunY, 1.1);
    A().lensFlare(ctx, { x: PB.sunX, y: PB.sunY, intensity: 0.3 });
    motes(ctx, t, { n: 70, seed: 17, sunX: PB.sunX, sunY: PB.sunY, alpha: 0.45, vx: -60 });
    if (after(t, T_FIRE1)) M.fill(ctx, '#ffe6b8', 0.3 * Math.exp(-age * 14));
    grade(ctx);
  }

  // ================================================================ SHOT C — helicopters cross (28.2 – 31.8)
  const PC = { hy: 836, hc: 1.4, sunX: 330, sunY: 668, duneSeed: 12, duneAmp: 0.62, duneScroll: 6,
    sky: { horizonY: 836, sunX: 330, sunY: 668, sunR: 44, glow: 1.1 } };
  const VCC = 0;  // locked-off camera (push-in only)
  const camC = (t) => VCC * (t - T_C);
  function tankC(i) {
    const S = [0.74, 0.5, 0.34][i], X0 = [870, 400, 40][i];
    const y = PC.hy + S * 60 * PC.hc;
    const ppm = S * 60, vW = 4.0;
    return { s: S, y, seed: 31 + i * 5, speed: vW, bl: 0.62, vg: VCC * ppm, vw: vW * ppm, x: (tt) => X0 + (vW - VCC) * ppm * (tt - T_C) };
  }
  const TC3 = [2, 1, 0].map(tankC);
  const SHOOTER_C = TC3[2]; // lead tank of the column (nearest)
  const TARGET2 = { x: 1760, y: 812 };
  const HELIS = [
    { s: 0.42, y: 545, x0: 820, v: 410, t0: T_C, ph: 2.1 },
    { s: 0.62, y: 258, x0: 150, v: 560, t0: T_C, ph: 0.7 },
    { s: 1.0, y: 405, x0: -90, v: 650, t0: T_C, ph: 0 },
  ];
  function shotC(ctx, t) {
    const camM = camC(t);
    const age2 = t - T_FIRE2;
    const sun = { x: PC.sunX, y: PC.sunY };
    const zoom = 1 + 0.035 * ease.inOutQuad(prog(t, T_C, T_D));
    ctx.save();
    ctx.translate(1100, 600); ctx.scale(zoom, zoom); ctx.translate(-1100, -600);
    applyShake(ctx, t);
    ctx.drawImage(fullPlate('C', PC, { cirrus: { n: 13, seed: 23, y0: 70, y1: 560, sunX: PC.sunX, alpha: 0.34 }, rays: { x: PC.sunX, y: PC.sunY, count: 22, alpha: 0.07, color: '#ffd59a', length: 1700, spread: 2.4, angle: -0.4, width: 0.03 } }), 0, 0);
    const iAge = t - T_IMP2;
    if (iAge > 0) A().explosion(ctx, iAge, { x: TARGET2.x, y: TARGET2.y, scale: 0.3, seed: 7 });
    scrub(ctx, PC, camM, 81, 9);
    for (const T of TC3) {
      const scroll = (t - T_C) * T.vw;
      if (T === SHOOTER_C) {
        const to = drawTank(ctx, t, T, { turret: 0.05, recoil: recoilAt(t, T_FIRE2), scroll, dust: { sun } });
        if (after(t, T_FIRE2)) {
          const mz = A().tankMuzzle(to);
          lowres(ctx, mz.x - 700, T.y - 330, mz.x + 760, T.y + 160, 0.5, (g) => {
            groundShock(g, age2, { x: mz.x + 30, y: T.y + 4, s: 0.72, drift: T.vg, seed: 9, n: 26 });
            blastDust(g, age2, { x: mz.x - 20, y: T.y + 2, s: 0.75, drift: T.vg * 0.6, seed: 90, n: 18 });
          });
          cannonBlast(ctx, age2, { x: mz.x, y: mz.y, x0: mz.x + 14, y0: mz.y, ang: mz.angle, s: 0.95, drift: T.vg * 0.5 });
          tracer(ctx, t, { x: mz.x + 50, y: mz.y }, { x: TARGET2.x, y: TARGET2.y - 10 }, T_FIRE2 + 0.03, T_IMP2);
        }
      } else drawTank(ctx, t, T, { scroll, dust: { sun } });
    }
    sandStreaks(ctx, t, { n: 26, y0: PC.hy + 10, y1: H - 60, alpha: 0.2, speed: 360, seed: 23 });
    heatHaze(ctx, PC.hy - 80, PC.hy + 24, 2.4, t, 8);
    for (const Hh of HELIS) {
      const x = Hh.x0 + Hh.v * (t - Hh.t0);
      if (x < -520 || x > W + 600) continue;
      const bob = noise1(t * 0.8 + Hh.ph, 61) * 10 * Hh.s;
      const tilt = 0.13 + noise1(t * 0.6 + Hh.ph, 62) * 0.02;
      const bw = Math.ceil(560 * Hh.s + 80), bh = Math.ceil(320 * Hh.s + 80);
      silhouette(ctx, x - bw * 0.55, Hh.y + bob - bh * 0.45, bw, bh, (g) => A().helicopter(g, { x: bw * 0.55, y: bh * 0.45, scale: Hh.s, t: t + Hh.ph, tilt }), { k: 0.38, dark: '#3a2418', rim: '#ffd59a', rw: 2, res: 0.62 });
    }
    fgCrest(ctx, t);
    ctx.restore();
    const sx = 1100 + (PC.sunX - 1100) * zoom, sy = 600 + (PC.sunY - 600) * zoom;
    sunBloom(ctx, sx, sy, 1);
    A().lensFlare(ctx, { x: sx, y: sy, intensity: 0.28 });
    motes(ctx, t, { n: 70, seed: 27, sunX: sx, sunY: sy, alpha: 0.45 });
    if (after(t, T_FIRE2)) M.fill(ctx, '#ffe6b8', 0.26 * Math.exp(-age2 * 14));
    grade(ctx);
  }
  function fgCrest(ctx, t) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-40, H + 20); ctx.lineTo(-40, 932);
    ctx.bezierCurveTo(200, 902, 420, 930, 640, 990); ctx.bezierCurveTo(760, 1030, 820, 1060, 900, H + 20);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 900, 0, H);
    g.addColorStop(0, '#5a3426'); g.addColorStop(1, '#24140e');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,120,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-40, 932); ctx.bezierCurveTo(200, 902, 420, 930, 640, 990); ctx.stroke();
    ctx.restore();
    soldierSoft(ctx, { x: 200, y: 936, scale: 1.18, pose: 'stand', t, rim: '#ffcf8a', rimWidth: 3 }, 0.55);
    soldierSoft(ctx, { x: 455, y: 950, scale: 1.0, pose: 'kneel', t, rim: '#ffcf8a', rimWidth: 3 }, 0.6);
  }

  // ================================================================ SHOT D — silhouette poster + title (31.8 – 34.0)
  const PD = { hy: 905, sunX: 960, sunY: 760, sunR: 270 };
  function plateD() {
    return cached('plateD', W, H, (g) => {
      A().sky(g, { preset: 'golden', top: '#18172f', mid: '#b84e2a', horizon: '#ffae60', horizonY: PD.hy, sunX: PD.sunX, sunY: PD.sunY, sunR: 0, glow: 1.4, cache: false });
      cirrus(g, 0, { n: 8, seed: 41, y0: 70, y1: 470, sunX: PD.sunX, alpha: 0.28 });
      g.save(); g.globalCompositeOperation = 'lighter';
      glow(g, PD.sunX, PD.sunY, PD.sunR * 3.4, '#ff8a3a', 0.42);
      glow(g, PD.sunX, PD.sunY, PD.sunR * 1.7, '#ffc070', 0.5);
      g.restore();
      const sg = g.createRadialGradient(PD.sunX - 50, PD.sunY - 70, 10, PD.sunX, PD.sunY, PD.sunR);
      sg.addColorStop(0, '#fffcee'); sg.addColorStop(0.5, '#ffeab0'); sg.addColorStop(0.88, '#ffc672'); sg.addColorStop(1, '#ffb25c');
      g.fillStyle = sg; g.beginPath(); g.arc(PD.sunX, PD.sunY, PD.sunR, 0, TAU); g.fill();
      A().lightRays(g, { x: PD.sunX, y: PD.sunY, count: 28, alpha: 0.06, t: 0, color: '#ffd59a', length: 1500, width: 0.028 });
      for (let i = 0; i < 3; i++) {
        const y = 640 + i * 70 + noise1(i, 3) * 10, x = 960 + Math.sin(i * 2.1) * 120;
        g.save(); g.translate(x, y); g.scale(5 + i * 1.5, 0.12 + 0.03 * i);
        glow(g, 0, 0, 90, '#c0603e', 0.2);
        g.restore();
      }
      const dl = (x, seed, amp, base) => base - amp * (0.5 + 0.5 * Math.sin(x * 0.0035 + seed)) - noise1(x * 0.005 + seed, 7) * amp * 0.6;
      for (const [seed, amp, base, col] of [[1.3, 34, PD.hy - 4, '#9a5230'], [4.1, 40, PD.hy + 48, '#5e2c1e']]) {
        g.beginPath(); g.moveTo(-40, H + 20);
        for (let x = -40; x <= W + 40; x += 24) g.lineTo(x, dl(x, seed, amp, base));
        g.lineTo(W + 40, H + 20); g.closePath(); g.fillStyle = col; g.fill();
      }
    });
  }
  function shotD(ctx, t) {
    const lt = t - T_D;
    const push = 1.06 - 0.06 * ease.outCubic(prog(t, T_D, T_D + 0.5)) + 0.05 * ease.inOutQuad(prog(t, T_D + 0.3, T_END)) + 0.08 * ease.inQuad(prog(t, T_DUST, T_END));
    ctx.save();
    ctx.translate(960, 700); ctx.scale(push, push); ctx.translate(-960, -700);
    applyShake(ctx, t);
    ctx.drawImage(plateD(), 0, 0);
    // helicopter silhouettes crossing the sun
    for (const [x0, y, s, v, ph] of [[640, 600, 0.3, 190, 0], [1270, 470, 0.21, 150, 1.3]]) {
      const x = x0 + v * lt, yy = y + noise1(t + ph, 5) * 5;
      const bw = Math.ceil(560 * s + 60), bh = Math.ceil(300 * s + 60);
      silhouette(ctx, x - bw * 0.55, yy - bh * 0.45, bw, bh, (g) => A().helicopter(g, { x: bw * 0.55, y: bh * 0.45, scale: s, t: t + ph, tilt: 0.12 }), { rim: '#ffd08a', rw: 2, k: 0.92 });
    }
    heatHaze(ctx, PD.hy - 110, PD.hy + 10, 3.4, t, 11);
    // tank on the crest, crossing in front of the sun (dark silhouette with hot rim) + glowing dust
    const TD = { s: 0.86, y: 948, seed: 41, speed: 3.5, bl: 1, vg: 0, x: (tt) => 830 + 62 * (tt - T_D) };
    tankDust(ctx, t, TD, { alpha: 0.7, colors: ['#c98a52', '#dba06a', '#b8743f'], wind: 34, life: 2.6 });
    const tx = TD.x(t), K = TD.s * 60;
    const bw = Math.ceil(13 * K), bh = Math.ceil(5.6 * K);
    freshTankScratch();
    silhouette(ctx, tx - 5 * K, TD.y - 4.6 * K, bw, bh, (g) => A().tank(g, { x: 5 * K, y: 4.6 * K, scale: TD.s, t, speed: 3.5, backlight: 1, turret: 0.03 }), { rim: '#ffcf86', rw: 3, k: 0.9 });
    // near crest band with soldiers
    ctx.beginPath(); ctx.moveTo(-40, H + 20); ctx.lineTo(-40, 1000);
    ctx.bezierCurveTo(500, 968, 1300, 975, 1960, 1010); ctx.lineTo(1960, H + 20); ctx.closePath();
    ctx.fillStyle = '#1c0e0a'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,170,90,0.55)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-40, 1000); ctx.bezierCurveTo(500, 968, 1300, 975, 1960, 1010); ctx.stroke();
    soldierSoft(ctx, { x: 190, y: 992, scale: 1.3, pose: 'stand', t, rim: '#ffb870', color: '#140b08', rimWidth: 3.4 }, 0.6);
    soldierSoft(ctx, { x: 1480, y: 985, scale: 1.05, pose: 'kneel', t, rim: '#ffb870', color: '#140b08', rimWidth: 3 }, 0.65);
    soldierSoft(ctx, { x: 1730, y: 996, scale: 1.3, pose: 'stand', t, rim: '#ffb870', color: '#140b08', rimWidth: 3.4 }, 0.6);
    ctx.restore();
    motes(ctx, t, { n: 90, seed: 37, sunX: PD.sunX, sunY: PD.sunY, alpha: 0.6, size: 1.2 });
    grade(ctx, 0.8);
  }

  // ================================================================ titles
  function titleA(ctx, t) {
    if (t < T_TITLE - 0.14 || t > T_FIRE1) return;
    const S1 = sprT1(), S2 = sprT2();
    const cx = 960, y1 = 240, y2 = 364;
    const out = sstep(26.7, 26.95, t);
    let sc, a;
    if (t < T_TITLE) { const k = prog(t, T_TITLE - 0.14, T_TITLE); sc = lerp(1.9, 1, k * k); a = Math.sqrt(k); }
    else { const age = t - T_TITLE; sc = 1 - 0.06 * Math.exp(-age * 9) * Math.cos(age * 30) + 0.022 * age; a = 1; }
    sc *= 1 + 0.12 * out; a *= 1 - out;
    ctx.save();
    applyShake(ctx, t, 0.5);
    ctx.save();
    ctx.globalAlpha = 0.6 * a;
    ctx.translate(cx, (y1 + y2) / 2); ctx.scale(2.7, 0.72);
    const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, 260);
    bg.addColorStop(0, 'rgba(8,10,18,0.85)'); bg.addColorStop(1, 'rgba(8,10,18,0)');
    ctx.fillStyle = bg; ctx.fillRect(-260, -260, 520, 520);
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, y1); ctx.scale(3.6, 0.8);
    glow(ctx, 0, 0, 160, '#ff9a3a', (0.12 + 0.5 * decay(t, T_TITLE, 4)) * a);
    ctx.restore();
    if (t < T_TITLE) for (let j = 2; j >= 1; j--) drawMetal(ctx, S1, cx, y1, { scale: sc * (1 + j * 0.12), alpha: a * 0.2 / j });
    drawMetal(ctx, S1, cx, y1, { scale: sc, alpha: a, flash: 0.95 * decay(t, T_TITLE, 7) + out * 0.6, spec: prog(t, T_TITLE + 0.08, T_TITLE + 0.9) * 1.4 - 0.2, specA: 0.95 });
    slamFX(ctx, t, T_TITLE, cx, y1 + 10, S1.tw, a);
    if (after(t, T_TITLE)) {
      const rk = ease.outCubic(prog(t, T_TITLE + 0.04, T_TITLE + 0.42));
      const hw = (S2.w / 2) * rk;
      ctx.save();
      ctx.beginPath(); ctx.rect(cx - hw, y2 - S2.h / 2, hw * 2, S2.h); ctx.clip();
      drawMetal(ctx, S2, cx, y2, { scale: 1 + 0.05 * out, alpha: 1 - out, flash: 0.6 * decay(t, T_TITLE + 0.3, 6), spec: prog(t, T_TITLE + 0.45, T_TITLE + 1.2) * 1.4 - 0.2, specA: 0.8 });
      ctx.restore();
      const lw = 230 * ease.outCubic(prog(t, T_TITLE + 0.1, T_TITLE + 0.55));
      const ga = (1 - out);
      for (const sd of [-1, 1]) {
        const x0 = cx + sd * (S2.tw / 2 + 40), x1 = x0 + sd * lw;
        const lg = ctx.createLinearGradient(x0, 0, x1, 0);
        lg.addColorStop(0, `rgba(242,210,122,${0.95 * ga})`); lg.addColorStop(1, 'rgba(242,210,122,0)');
        ctx.fillStyle = lg; ctx.fillRect(Math.min(x0, x1), y2 - 1.5, Math.abs(x1 - x0), 3);
        ctx.save(); ctx.translate(x0 + sd * 2, y2); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = `rgba(255,226,150,${ga})`; ctx.fillRect(-6, -6, 12, 12); ctx.restore();
      }
      if (rk > 0 && rk < 1) { starGlint(ctx, cx - hw, y2, 40, 0.8); starGlint(ctx, cx + hw, y2, 40, 0.8); }
    }
    ctx.restore();
  }
  function slamFX(ctx, t, c, cx, cy, tw, a) {
    const sa = t - c;
    if (sa < 0 || sa > 1.2) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // soft expanding pressure ring (flattened)
    const R = 120 + 1000 * (1 - Math.exp(-sa * 4.5)), al = 0.8 * Math.pow(clamp(1 - sa / 0.45), 1.8) * a;
    if (al > 0.01) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.2);
      const w = 60 + 80 * sa;
      const g = ctx.createRadialGradient(0, 0, Math.max(0, R - w), 0, 0, R + w * 0.25);
      g.addColorStop(0, 'rgba(255,200,120,0)'); g.addColorStop(0.8, `rgba(255,214,150,${0.32 * al})`); g.addColorStop(0.95, `rgba(255,248,225,${0.55 * al})`); g.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R + w * 0.25, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // horizontal light streak
    ctx.save(); ctx.translate(cx, cy - 10); ctx.scale(9, 0.1); glow(ctx, 0, 0, 160, '#fff1c8', 0.9 * Math.exp(-sa * 6) * a); ctx.restore();
    // glowing embers bursting out of the letters, slowing and drifting down
    ctx.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const h1 = hash(i, 191), h2 = hash(i, 192), h3 = hash(i, 193);
      const life = 0.55 + 0.6 * h3;
      if (sa > life) continue;
      const ang = -Math.PI / 2 + (h1 - 0.5) * 3.4, v = 500 + 1000 * h2, kk = 4.2;
      const ex = (1 - Math.exp(-kk * sa)) / kk;
      const x0 = cx + (h1 - 0.5) * tw, y0 = cy + (h2 - 0.5) * 70;
      const x = x0 + Math.cos(ang) * v * ex, y = y0 + Math.sin(ang) * v * ex + 260 * sa * sa;
      const vx = Math.cos(ang) * v * Math.exp(-kk * sa), vy = Math.sin(ang) * v * Math.exp(-kk * sa) + 520 * sa;
      const f = (1 - sa / life) * a;
      ctx.strokeStyle = `rgba(255,${190 + 60 * h3 | 0},120,${f})`; ctx.lineWidth = 1.2 + 2 * h3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * 0.022, y - vy * 0.022); ctx.stroke();
      glow(ctx, x, y, 7 + 8 * h3, '#ffb050', f * 0.8);
    }
    ctx.restore();
  }
  function titleD(ctx, t) {
    if (t < T_D - 0.12) return;
    const S = sprT3();
    const cx = 960, cy = 300;
    let sc, a;
    if (t < T_D) { const k = prog(t, T_D - 0.12, T_D); sc = lerp(2.2, 1, k * k); a = Math.sqrt(k); }
    else { const age = t - T_D; sc = 1 - 0.07 * Math.exp(-age * 8) * Math.cos(age * 28) + 0.03 * age; a = 1; }
    ctx.save();
    applyShake(ctx, t, 0.5);
    ctx.save();
    ctx.globalAlpha = 0.5 * a;
    ctx.translate(cx, cy); ctx.scale(2.9, 0.62);
    const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, 280);
    bg.addColorStop(0, 'rgba(10,6,14,0.85)'); bg.addColorStop(1, 'rgba(10,6,14,0)');
    ctx.fillStyle = bg; ctx.fillRect(-280, -280, 560, 560);
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy); ctx.scale(3.4, 0.8);
    glow(ctx, 0, 0, 200, '#ff9a3a', (0.16 + 0.55 * decay(t, T_D, 4)) * a);
    ctx.restore();
    if (t < T_D) for (let j = 2; j >= 1; j--) drawMetal(ctx, S, cx, cy, { scale: sc * (1 + j * 0.12), alpha: a * 0.2 / j });
    const specP = ((t - T_D - 0.1) / 1.1);
    drawMetal(ctx, S, cx, cy, { scale: sc, alpha: a, flash: decay(t, T_D, 6.5), spec: specP * 1.4 - 0.2, specA: 0.95 });
    slamFX(ctx, t, T_D, cx, cy + 30, S.tw, a);
    ctx.restore();
  }

  // ================================================================ transitions
  // entrance: the S3 jet clears to the left as a motion-blurred dark band + exhaust heat; frame un-blurs
  function entrance(ctx, t) {
    const lt = t - T0;
    if (lt > 0.4) return;
    const sm = Math.pow(1 - clamp(lt / 0.32), 1.6);
    hBlur(ctx, 18, 0.85 * sm);
    const edge = 900 - lt * 5000 - lt * lt * 2000;   // continues the S3 jet's ~5000 px/s leftward pass
    if (edge > -460) {
      ctx.save();
      // jet underside: grey camo, blurred, with a specular band
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a3038'); g.addColorStop(0.35, '#59616b'); g.addColorStop(0.42, '#9aa3ab'); g.addColorStop(0.5, '#5d656e'); g.addColorStop(1, '#22272e');
      ctx.fillStyle = g;
      if (edge - 200 > -10) ctx.fillRect(-10, -10, edge - 200 + 10.5, H + 20);
      // motion-blurred trailing edge: the same metal fading out over ~420 px
      const bc = scratch('jetEdge', 420, H), bg = bc.getContext('2d');
      const vg = bg.createLinearGradient(0, 0, 0, H);
      vg.addColorStop(0, '#2a3038'); vg.addColorStop(0.35, '#59616b'); vg.addColorStop(0.42, '#9aa3ab'); vg.addColorStop(0.5, '#5d656e'); vg.addColorStop(1, '#22272e');
      bg.fillStyle = vg; bg.fillRect(0, 0, 420, H);
      bg.globalCompositeOperation = 'destination-in';
      const hg = bg.createLinearGradient(0, 0, 420, 0);
      hg.addColorStop(0, 'rgba(0,0,0,1)'); hg.addColorStop(0.45, 'rgba(0,0,0,0.62)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
      bg.fillStyle = hg; bg.fillRect(0, 0, 420, H);
      ctx.drawImage(bc, 0, 0, 420, H, edge - 200, 0, 420, H);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 30; i++) {
        const y = hash(i, 601) * H, len = 300 + 700 * hash(i, 602);
        const x = edge - hash(i, 603) * 800;
        const lg = ctx.createLinearGradient(x - len, 0, x, 0);
        lg.addColorStop(0, 'rgba(255,220,170,0)'); lg.addColorStop(1, `rgba(255,226,180,${0.12 + 0.2 * hash(i, 604)})`);
        ctx.fillStyle = lg; ctx.fillRect(x - len, y, len, 1 + 3 * hash(i, 605));
      }
      // twin exhaust heat blooms at the trailing edge
      const ea = 1 - clamp(lt / 0.32);
      for (const yy of [470, 610]) {
        ctx.save(); ctx.translate(edge + 160, yy); ctx.scale(3.2, 0.42);
        glow(ctx, 0, 0, 220, '#ff8a3a', 0.5 * ea); glow(ctx, -40, 0, 80, '#ffe0b0', 0.55 * ea);
        ctx.restore();
      }
      ctx.restore();
    }
    A().motionStreaks(ctx, t, { dir: 'left', alpha: 0.45 * (1 - clamp(lt / 0.35)), count: 60, color: '#ffe2b0', speed: 3200 });
  }
  // exit: dust storm front sweeps across and fills the frame (S5 opens on solid dust #cda672)
  function dustOut(ctx, t) {
    if (t < T_DUST - 0.3) return;
    const p = prog(t, T_DUST, T_END - 1 / 30);
    const pre = prog(t, T_DUST - 0.3, T_DUST);
    const front = lerp(-450, 2600, ease.inQuad(p));
    ctx.save();
    // lead wisps blowing in from the left at ground level (anticipation)
    if (pre > 0) {
      for (let i = 0; i < 14; i++) {
        const h1 = hash(i, 721), h2 = hash(i, 722), h3 = hash(i, 723);
        const x = -200 + (pre * 500 + p * 1800) * (0.5 + 0.7 * h1);
        const y = 760 + 300 * h2 - 60 * p;
        A().drawPuff(ctx, A().puffSprite(i, '#e2c08c'), x, y, (90 + 120 * h3) * (1 + p), 0.4 * pre, h1 * TAU + t);
      }
    }
    if (p > 0) {
      const g = ctx.createLinearGradient(front - 1300, 0, front - 250, 0);
      g.addColorStop(0, `rgba(205,166,114,${Math.min(1, 0.5 + p)})`); g.addColorStop(0.6, `rgba(205,166,114,${0.6 * Math.min(1, 0.4 + p)})`); g.addColorStop(1, 'rgba(205,166,114,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      lowres(ctx, 0, 0, W, H, 0.4, (gq) => {
      const N = 44;
      for (let i = 0; i < N; i++) {
        const h1 = hash(i, 701), h2 = hash(i, 702), h3 = hash(i, 703), h4 = hash(i, 704);
        const lag = h1 * 1000;
        const x = front - lag + Math.sin(t * 2 + i) * 20;
        const y = H * (0.05 + 1.0 * h2) - 160 * p * h3;
        const r = Math.min(620, (190 + 260 * h3) * (0.7 + 1.2 * p));
        const lead = clamp((front + 300 - x) / 420);
        const a = (0.5 + 0.4 * h4) * lead;
        if (a < 0.01 || x + r < 0 || x - r > W) continue;
        const tone = h4 > 0.6 ? '#f6deb0' : h4 > 0.25 ? '#ddbc86' : '#b08a5a';
        A().drawPuff(gq, A().puffSprite(i, tone), x, y, r, a, h1 * TAU + t * 0.6);
      }
      });
      // bright sunlit rim on the leading edge of the front
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(front - 60, 600); ctx.scale(0.5, 3.4);
      glow(ctx, 0, 0, 260, '#ffd9a0', 0.4 * (1 - p));
      ctx.restore();
    }
    ctx.restore();
    if (p > 0) {
      A().motionStreaks(ctx, t, { dir: 'right', alpha: 0.35 * Math.sin(Math.PI * p), count: 50, color: '#fff0d0', speed: 3600 });
      const sol = sstep(0.6, 1, p);
      M.fill(ctx, '#cda672', sol);
      // billowing texture on top of the solid dust (matches S5's opening puffs)
      if (sol > 0) lowres(ctx, 0, 0, W, H, 0.4, (gq) => {
        for (let i = 0; i < 16; i++) {
          const h1 = hash(i, 741), h2 = hash(i, 742), h3 = hash(i, 743);
          const x = W * h1 + (t - T_DUST) * 260 * (0.5 + h2), y = H * h2;
          const tone = h3 > 0.55 ? '#f0d4a2' : '#b89064';
          A().drawPuff(gq, A().puffSprite(i, tone), x, y, 300 + 260 * h3, 0.3 * sol, h1 * TAU + t * 0.5);
        }
      });
    }
  }

  // ================================================================ dispatcher
  function draw(ctx, lt, t) {
    const covered = prog(t, T_DUST, T_END - 1 / 30) >= 1;   // final frame: solid dust, nothing behind is visible
    if (t < T_B) shotA(ctx, t);
    else if (t < T_C) shotB(ctx, t);
    else if (t < T_D) shotC(ctx, t);
    else if (!covered) shotD(ctx, t);
    entrance(ctx, t);
    titleA(ctx, t);
    titleD(ctx, t);
    dustOut(ctx, t);
  }

  M.registerScene({ id: 's4_ground', start: T0, end: T_END, z: 0, draw });
})();
