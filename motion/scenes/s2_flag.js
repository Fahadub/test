/*
 * S2 — Flag & title · 6.0 – 12.0
 *
 *   6.0  HIT: white flash decays → Saudi flag waving large in golden-hour light, ground shock dust, slow push-in
 *   6.6  «القوات المسلحة السعودية» slams in (metallic gold, shockwave ring, sparks, dust, camera shake)
 *   8.4  gleam travels along the flag's sword (hilt → tip) + «درعُ الوطن وسيفُه» revealed right → left
 *  10.2  HIT: «عزمٌ لا يلين» slams in, replacing the second line
 *  11.4  whip-pan up into the sky with vertical motion blur, streaks and a warm cloud wipe (→ S3)
 *
 * Every frame is a pure function of t. Caches hold only t-independent content
 * (dune plate, metallic text sprites); scratch canvases are fully redrawn every frame.
 */
(function () {
  'use strict';
  const M = window.M;
  const { clamp, lerp, prog, ease, hash, noise1 } = M;
  const W = 1920, H = 1080, FPS = 30, TAU = Math.PI * 2;

  // ---------------------------------------------------------------- timeline
  const T0 = 6.0, T_SLAM = 6.6, T_GLEAM = 8.4, T_HIT = 10.2, T_WHIP = 11.4, T_END = 12.0;
  const STR_TITLE = 'القوات المسلحة السعودية';
  const STR_L2 = 'درعُ الوطن وسيفُه';
  const STR_L3 = 'عزمٌ لا يلين';

  // ---------------------------------------------------------------- layout
  const HORIZON = 790;
  const SUN = { x: 330, y: 575, r: 58 };
  const FLAG = { x: 560, y: 92, w: 1000, poleLen: 1250 };
  const ANCHOR = { x: 1000, y: 300 };                 // push-in focus
  const TITLE_Y = 866, L2_Y = 990;

  // ---------------------------------------------------------------- helpers
  const fidx = (t) => Math.round(t * FPS);
  const decay = (t, c, rate) => (t >= c ? Math.exp(-(t - c) * rate) : 0);
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
  const A = () => M.assets;
  const U = () => M.assets.util;

  // camera push-in (+ impact punches)
  function camScale(t) {
    return 1 + 0.085 * ease.inOutQuad(prog(t, T0, T_WHIP + 0.6))
      + 0.11 * decay(t, T0, 4.5)
      + 0.022 * decay(t, T_SLAM, 9)
      + 0.03 * decay(t, T_HIT, 8);
  }
  // whip-pan offset (content moves DOWN as the camera tilts up)
  function panY(t) { const k = prog(t, T_WHIP, T_END); return 2500 * Math.pow(k, 2.3); }
  function shakeAmt(t) {
    return 30 * decay(t, T0, 5) + 22 * decay(t, T_SLAM, 6) + 4 * decay(t, T_GLEAM, 8) + 16 * decay(t, T_HIT, 6.5)
      + 10 * prog(t, T_WHIP, T_END) + 1.2;
  }

  // ---------------------------------------------------------------- cached plates
  let DUNES = null;
  function dunePlate() {
    if (DUNES) return DUNES;
    const c = mk(W, H + 260), g = c.getContext('2d');
    A().dunes(g, 0, { horizonY: HORIZON, layers: 5, scroll: 0, seed: 4, palette: 'golden', light: 1, amp: 1.35, bottom: H + 260 });
    // warm haze + darker band under the titles (baked)
    const gr = g.createLinearGradient(0, 700, 0, H + 260);
    gr.addColorStop(0, 'rgba(30,14,4,0)'); gr.addColorStop(0.3, 'rgba(24,12,4,0.4)'); gr.addColorStop(0.6, 'rgba(10,5,2,0.7)'); gr.addColorStop(1, 'rgba(8,4,2,0.8)');
    g.fillStyle = gr; g.fillRect(0, 700, W, H + 260 - 700);
    DUNES = c;
    return c;
  }

  // sky + clouds baked once (clouds frozen at a fixed time → t-independent plate); the plate drifts slowly per frame
  const CLOUD_TINT = { light: '#fff3da', mid: '#f7bd86', shade: '#b07a7e', rim: '#fff8e6', amb: '#e0a07e' };
  const PLATE_PAD = 90, DRIFT = 6;                    // px of plate margin, drift px/s (sun drifts with it)
  let SKYP = null;
  function skyPlate() {
    if (SKYP) return SKYP;
    const c = mk(W + PLATE_PAD * 2, H), g = c.getContext('2d');
    g.translate(PLATE_PAD, 0);
    A().sky(g, { preset: 'golden', horizonY: HORIZON, sunX: SUN.x, sunY: SUN.y, sunR: SUN.r, glow: 1.15, cache: false });
    // sky() fills exactly W wide: extend the margins with its edge columns
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(c, PLATE_PAD, 0, 1, H, 0, 0, PLATE_PAD, H);
    g.drawImage(c, PLATE_PAD + W - 1, 0, 1, H, PLATE_PAD + W, 0, PLATE_PAD, H);
    g.translate(PLATE_PAD, 0);
    A().clouds(g, 6.0, { seed: 5, count: 6, y0: 150, y1: 470, speed: 14, scale: 0.85, tint: CLOUD_TINT, alpha: 0.85, xMin: -700, xMax: W + 700 });
    A().clouds(g, 9.0, { seed: 11, count: 4, y0: 560, y1: 700, speed: 26, scale: 1.05, tint: CLOUD_TINT, alpha: 0.6, xMin: -700, xMax: W + 700 });
    for (let i = 0; i < 6; i++) A().cloudSprite(i, CLOUD_TINT, 0);          // pre-warm sprites used by the whip-pan
    A().lightRays(g, { x: SUN.x, y: SUN.y, count: 22, alpha: 0.2, t: 7.0, length: 2000, color: '#ffd9a0', width: 0.05 });
    SKYP = c;
    return c;
  }
  let BGP = null;
  function bgPlate() {                                 // sky plate + dunes merged: one draw per frame outside the whip-pan
    if (BGP) return BGP;
    // covers y ∈ [-BG_TOP, H + BG_BOT] so camera shake / punch-zoom never exposes an edge
    const c = mk(W + PLATE_PAD * 2, H + BG_TOP + BG_BOT), g = c.getContext('2d');
    g.fillStyle = A().skyPresets.golden.top; g.fillRect(0, 0, c.width, BG_TOP + 2);
    g.drawImage(skyPlate(), 0, BG_TOP);
    const D = dunePlate(), dh = H + BG_BOT;
    g.drawImage(D, 0, 0, W, dh, PLATE_PAD, BG_TOP, W, dh);
    g.drawImage(D, 0, 0, 1, dh, 0, BG_TOP, PLATE_PAD, dh);
    g.drawImage(D, W - 1, 0, 1, dh, PLATE_PAD + W, BG_TOP, PLATE_PAD, dh);
    BGP = c;
    return c;
  }
  const BG_PAR = 0.35, BG_TOP = 100, BG_BOT = 120;                                 // background parallax share of the push-in
  const skyDX = (t) => -(t - T0) * DRIFT;
  // sun position on screen (sky layer parallax 0.25, drift, pan 0.55)
  function sunPos(t, cs, pan) {
    const s = 1 + (cs - 1) * BG_PAR;
    return { x: ANCHOR.x + (SUN.x + skyDX(t) - ANCHOR.x) * s, y: ANCHOR.y + (SUN.y - ANCHOR.y) * s + pan * 0.55 };
  }

  // metallic text sprite (t-independent): drop shadow, extrusion, outline, bevel highlight, gold gradient
  const SPR = {};
  function metalSprite(key, str, o, pal) {
    if (SPR[key]) return SPR[key];
    const tmp = mk(4, 4).getContext('2d');
    const tw = M.measure(tmp, str, o);
    const w = Math.ceil(tw + o.size * 1.4), h = Math.ceil(o.size * 2.7);
    const c = mk(w, h), g = c.getContext('2d');
    const cx = w / 2, cy = h / 2;
    const base = Object.assign({}, o);
    // soft drop shadow
    M.text(g, str, cx, cy + o.size * 0.08, Object.assign({}, base, { color: 'rgba(10,5,0,0.75)', shadow: o.size * 0.28 }));
    // extrusion (depth)
    const depth = Math.max(3, Math.round(o.size * 0.06));
    for (let k = depth; k >= 1; k--) M.text(g, str, cx, cy + k, Object.assign({}, base, { color: pal.extrude }));
    // dark outline
    M.text(g, str, cx, cy, Object.assign({}, base, { color: pal.outline, stroke: Math.max(3, o.size * 0.06), strokeColor: pal.outline }));
    // bevel highlight (top edges)
    M.text(g, str, cx, cy - Math.max(1.5, o.size * 0.022), Object.assign({}, base, { color: pal.hi }));
    // gradient face
    const gr = g.createLinearGradient(0, cy - o.size * 0.62, 0, cy + o.size * 0.55);
    pal.face.forEach(([k, col]) => gr.addColorStop(k, col));
    M.text(g, str, cx, cy + 0.6, Object.assign({}, base, { color: gr }));
    // face-only mask (for specular sweeps)
    const m = mk(w, h), mg = m.getContext('2d');
    M.text(mg, str, cx, cy + 0.6, Object.assign({}, base, { color: '#fff' }));
    SPR[key] = { c, m, w, h, tw };
    return SPR[key];
  }
  const GOLD = {
    extrude: '#4a2f08', outline: '#1e1203', hi: '#fff6d8',
    face: [[0, '#fffbe8'], [0.2, '#f8e09a'], [0.42, '#d6ae55'], [0.5, '#8c6420'], [0.56, '#c99a40'], [0.75, '#f2d27a'], [0.9, '#ffe9a8'], [1, '#a8792c']],
  };
  const PALE = {
    extrude: '#3a2a10', outline: '#160e04', hi: '#ffffff',
    face: [[0, '#ffffff'], [0.35, '#fff3d2'], [0.5, '#e3c27a'], [0.58, '#f7e2a8'], [0.85, '#fff8e6'], [1, '#d8b56a']],
  };
  const titleSpr = () => metalSprite('title', STR_TITLE, { size: 112, family: 'kufi', weight: 700 }, GOLD);
  const l2Spr = () => metalSprite('l2', STR_L2, { size: 68, family: 'arabic', weight: 700 }, PALE);
  const l3Spr = () => metalSprite('l3', STR_L3, { size: 94, family: 'kufi', weight: 700 }, GOLD);

  // draw a sprite with an optional moving specular band (u: 0..1 across the text, right → left)
  let _spec = null;
  function drawMetal(ctx, S, x, y, opt = {}) {
    const sc = opt.scale != null ? opt.scale : 1, a = opt.alpha != null ? opt.alpha : 1;
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(x, y); ctx.scale(sc * (opt.sx || 1), sc);
    ctx.drawImage(S.c, -S.w / 2, -S.h / 2);
    if (opt.spec != null && opt.spec > -0.3 && opt.spec < 1.3) {
      if (!_spec || _spec.width < S.w || _spec.height < S.h) _spec = mk(Math.max(S.w, _spec ? _spec.width : 0), Math.max(S.h, _spec ? _spec.height : 0));
      const g = _spec.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.clearRect(0, 0, S.w, S.h);
      g.drawImage(S.m, 0, 0);
      g.globalCompositeOperation = 'source-in';
      const bx = S.w / 2 + S.tw / 2 - opt.spec * (S.tw + 200) + 100;
      const gr = g.createLinearGradient(bx - 90, 0, bx + 90, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,252,235,${opt.specA || 0.9})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.setTransform(1, 0, -0.35, 1, S.h * 0.175, 0);         // slanted band
      g.fillStyle = gr; g.fillRect(bx - 90, 0, 180, S.h);
      g.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(_spec, 0, 0, S.w, S.h, -S.w / 2, -S.h / 2, S.w, S.h);
    }
    if (opt.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * opt.flash;
      ctx.drawImage(S.m, -S.w / 2, -S.h / 2);
    }
    ctx.restore();
  }

  function starGlint(ctx, x, y, r, a, rot = 0) {
    if (a <= 0.01) return;
    const glow = U().glow;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, r * 1.2, '#ffd98a', a * 0.6);
    glow(ctx, 0, 0, r * 0.45, '#ffffff', a);
    ctx.save(); ctx.scale(7, 0.07); glow(ctx, 0, 0, r, '#ffffff', a); ctx.restore();
    ctx.save(); ctx.scale(0.07, 3.2); glow(ctx, 0, 0, r, '#ffffff', a * 0.9); ctx.restore();
    ctx.rotate(Math.PI / 4);
    ctx.save(); ctx.scale(1.8, 0.05); glow(ctx, 0, 0, r, '#fff1c8', a * 0.5); ctx.restore();
    ctx.save(); ctx.scale(0.05, 1.8); glow(ctx, 0, 0, r, '#fff1c8', a * 0.5); ctx.restore();
    ctx.restore();
  }

  // replica of the flag() cloth warp (assets.js) → texture (u,v) to screen, for the sword gleam
  function flagWarp(t, x, y, w, h, wind = 1) {
    const amp = h * 0.075 * Math.min(1.6, wind);
    const ph = (u) => TAU * (u * 1.35 - t * 0.85 * (0.6 + 0.4 * wind));
    const dyf = (u) => { const e = Math.pow(u, 1.05); return amp * e * Math.sin(ph(u)) + amp * 0.32 * e * Math.sin(2.1 * ph(u) + 1.3) + amp * 0.18 * e * Math.sin(TAU * (u * 3.1 - t * 1.7 * wind) + 0.5) + h * 0.02 * u * u; };
    const sy = (u) => 1 + 0.045 * Math.pow(u, 0.9) * Math.cos(ph(u) + 0.4);
    const xf = (u) => w * u * (1 - 0.035 * u) + Math.sin(ph(u)) * w * 0.006 * u;
    return (u, v) => { const hh = h * sy(u); return { x: x + xf(u), y: y + dyf(u) - (hh - h) / 2 + v * hh }; };
  }
  // sword blade centre line in texture space (tip curls up slightly)
  const bladeV = (u) => 0.705 - 0.03 * (1 - U().smooth(0.17, 0.27, u));

  // ---------------------------------------------------------------- world layers
  function layerXform(ctx, s) { ctx.translate(ANCHOR.x, ANCHOR.y); ctx.scale(s, s); ctx.translate(-ANCHOR.x, -ANCHOR.y); }

  // background: merged plate (sky, clouds, rays, dunes); split into sky / ground during the whip-pan (ground moves faster)
  function drawBackground(ctx, t, cs, pan) {
    const s = 1 + (cs - 1) * BG_PAR, dx = -PLATE_PAD + skyDX(t);
    if (pan <= 0) {
      ctx.save(); layerXform(ctx, s); ctx.drawImage(bgPlate(), dx, -BG_TOP); ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(0, pan * 0.55);
    // extension above the frame (higher altitude)
    const top = -pan * 0.55 - 60;
    const g = ctx.createLinearGradient(0, top, 0, 2);
    g.addColorStop(0, '#3a5a8c'); g.addColorStop(0.5, '#24406c'); g.addColorStop(1, '#1d3557');
    ctx.fillStyle = g; ctx.fillRect(0, top, W, -top + 6);
    layerXform(ctx, s); ctx.drawImage(skyPlate(), dx, 0);
    ctx.restore();
    // high-altitude cloud bank above the frame, revealed by the tilt (parallax 0.85)
    ctx.save();
    ctx.translate(0, pan * 0.85);
    for (let i = 0; i < 10; i++) {
      const h1 = hash(i, 511), h2 = hash(i, 512), h3 = hash(i, 513);
      const spr = A().cloudSprite(Math.floor(h1 * 6), CLOUD_TINT, 0);
      const sc = 1.5 + 1.0 * h2, w = spr.width * sc, h = spr.height * sc;
      const x = -250 + (i % 5) * 560 + (h3 - 0.5) * 260 + (i > 4 ? 280 : 0);
      const y = -2150 + (i > 4 ? 520 : 0) + h2 * 260;
      ctx.drawImage(spr, x - w / 2, y, w, h);
    }
    ctx.restore();
    ctx.save();
    ctx.translate(0, pan * 1.15);
    layerXform(ctx, s); ctx.drawImage(dunePlate(), dx + PLATE_PAD, 0);
    ctx.restore();
  }

  function drawBackRays(ctx, t, cs, pan) {
    // impact light burst from the centre at 6.0
    const b = decay(t, T0, 3.2);
    if (b > 0.02) A().lightRays(ctx, { x: 960, y: 520 + pan, count: 28, alpha: 0.5 * b, t: t * 3, length: 2200, color: '#fff0d0', width: 0.035 });
  }

  function drawGround(ctx, t, cs, pan) {
    const s = 1 + (cs - 1) * BG_PAR;
    ctx.save();
    ctx.translate(0, pan * 1.15);
    layerXform(ctx, s);
    // rolling horizon dust
    const puff = A().puffSprite;
    for (let i = 0; i < 6; i++) {
      const h1 = hash(i, 201), h2 = hash(i, 202), h3 = hash(i, 203);
      const x = U().wrap(h1 * 2400 + i * 300 - t * (18 + 30 * h2), -300, 2100);
      const y = HORIZON + 10 + h2 * 90;
      const r = 110 + 120 * h3;
      A().drawPuff(ctx, puff(i, '#f0c48a'), x, y, r, 0.18 + 0.1 * h3, h1 * TAU + t * 0.05);
    }
    // 6.0 ground shock: ring of dust thrown up across the dunes
    const ga = t - T0;
    if (ga >= 0 && ga < 2.2) {
      const puff = A().puffSprite;
      const R = 1150 * (1 - Math.exp(-ga * 2.2));
      for (let i = 0; i < 22; i++) {
        const th = TAU * i / 22 + hash(i, 431) * 0.25, h = hash(i, 432);
        const front = Math.sin(th) > 0;                       // near side of the ring
        const x = 960 + Math.cos(th) * R * (0.9 + 0.15 * h), y = 905 + Math.sin(th) * R * 0.16 + 0;
        const r = (60 + 70 * h) * (0.6 + ga * 1.1) * (front ? 1.15 : 0.8);
        A().drawPuff(ctx, puff(i, '#e0b47c'), x, y - r * 0.35, r, (front ? 0.55 : 0.4) * Math.min(1, ga * 7) * Math.pow(clamp(1 - ga / 2.2), 1.3), h * 6 + ga * 0.3);
      }
    }
    ctx.restore();
  }

  function flagRect(cs, pan) {
    const s = cs;
    return { x: ANCHOR.x + (FLAG.x - ANCHOR.x) * s, y: ANCHOR.y + (FLAG.y - ANCHOR.y) * s + pan, w: FLAG.w * s, h: FLAG.w * s * 2 / 3, poleLen: FLAG.poleLen * s };
  }

  function drawFlag(ctx, t, cs, pan) {
    const r = flagRect(cs, pan);
    A().flag(ctx, t, { x: r.x, y: r.y, w: r.w, pole: true, poleLen: r.poleLen, light: 1, wind: 1 });
    // warm back-light bleed on the hoist side (sun is left of the pole)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = U().radial(ctx, r.x - 30, r.y + r.h * 0.55, r.w * 0.4, [[0, 'rgba(255,190,110,0.3)'], [1, 'rgba(255,190,110,0)']]);
    ctx.fillRect(r.x - 30, r.y + r.h * 0.15 - r.w * 0.4 + r.h * 0.4, r.w * 0.4, r.w * 0.8);
    ctx.restore();
    return r;
  }

  // sword gleam: 8.4 hilt → ~8.85 tip
  function drawSwordGleam(ctx, t, r) {
    const age = t - T_GLEAM;
    if (age < -0.05 || age > 1.3) return;
    const P = flagWarp(t, r.x, r.y, r.w, r.h);
    const k = ease.inOutCubic(clamp(age / 0.45));
    const u = lerp(0.712, 0.175, k);
    const p = P(u, bladeV(u));
    const glow = U().glow;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // whole-blade sheen (rises, then decays)
    const sheen = clamp(age / 0.1) * Math.exp(-Math.max(0, age - 0.35) * 3.5);
    if (sheen > 0.01) {
      for (let i = 0; i <= 26; i++) {
        const uu = lerp(0.18, 0.84, i / 26), q = P(uu, uu > 0.71 ? 0.705 : bladeV(uu));
        glow(ctx, q.x, q.y, r.h * 0.07, '#fff0c8', 0.16 * sheen);
      }
    }
    // travelling hot spot with a trail
    if (age >= 0 && age <= 0.6) {
      const fa = clamp(1 - (age - 0.45) / 0.15);
      for (let j = 0; j < 12; j++) {
        const uu = u + j * 0.012 * (1 - k * 0.3);
        if (uu > 0.715) break;
        const q = P(uu, bladeV(uu));
        glow(ctx, q.x, q.y, r.h * (0.06 - j * 0.003), '#ffffff', 0.55 * (1 - j / 12) * fa);
      }
      const ang = Math.atan2(P(u - 0.01, bladeV(u - 0.01)).y - p.y, P(u - 0.01, bladeV(u - 0.01)).x - p.x);
      starGlint(ctx, p.x, p.y, r.h * 0.11, 0.95 * fa, ang);
    }
    // flash at the guard on the hit, twinkle at the tip on arrival
    const g0 = P(0.712, 0.705);
    starGlint(ctx, g0.x, g0.y, r.h * 0.16, 0.9 * decay(t, T_GLEAM, 8), 0.2);
    if (age > 0.4) {
      const tp = P(0.172, 0.665);
      const tw = Math.exp(-(age - 0.45) * 3.2) * clamp((age - 0.4) / 0.06);
      starGlint(ctx, tp.x, tp.y, r.h * 0.2 * (0.8 + 0.2 * Math.sin(age * 30)), tw, 0.15 + age * 0.6);
    }
    ctx.restore();
  }

  function drawFrontAtmos(ctx, t, cs, pan) {
    // front volumetric rays + sun flare
    const { x: sx, y: sy } = sunPos(t, cs, pan);
    const glow = U().glow, fi = 0.85 + 0.15 * Math.sin(t * 2.3);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, sx, sy, 210, '#ffd9a0', 0.45 * fi);
    ctx.translate(sx, sy); ctx.scale(5, 0.09); glow(ctx, 0, 0, 120, '#fff0d0', 0.5 * fi);
    ctx.restore();
  }

  // dust motes in the sunlight + out-of-focus bokeh + embers
  function drawParticles(ctx, t, cs, pan) {
    const glow = U().glow, wrap = U().wrap;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // fine motes (brighter near the sun)
    for (let i = 0; i < 120; i++) {
      const h1 = hash(i, 301), h2 = hash(i, 302), h3 = hash(i, 303), h4 = hash(i, 304);
      const x = wrap(h1 * 2200 - t * (12 + 40 * h2) + Math.sin(t * (0.6 + h3) + i) * 18, -100, 2100);
      const y = wrap(h2 * 1200 - t * (6 + 16 * h3) + Math.cos(t * (0.5 + h1) + i) * 14, -60, 1140) + pan * (1 + 0.4 * h3);
      const ds = Math.hypot(x - SUN.x, y - SUN.y);
      const lit = 0.25 + 0.75 * Math.exp(-ds / 650);
      const tw = 0.6 + 0.4 * Math.sin(t * (2 + h4 * 5) + i);
      const r = 1 + 2.2 * h4;
      glow(ctx, x, y, r * 5, '#ffcf8a', 0.35 * lit * tw);
      ctx.fillStyle = `rgba(255,236,200,${0.55 * lit * tw})`;
      ctx.fillRect(x - r * 0.5, y - r * 0.5, r, r);
    }
    // impact debris specks blown outward at 6.0
    const ia = t - T0;
    if (ia >= 0 && ia < 1.6) {
      for (let i = 0; i < 70; i++) {
        const h1 = hash(i, 311), h2 = hash(i, 312), h3 = hash(i, 313);
        const a = h1 * TAU, v = 500 + 1300 * h2;
        const d = v * (1 - Math.exp(-ia * 2.2)) / 2.2;
        const x = 960 + Math.cos(a) * d, y = 560 + Math.sin(a) * d * 0.7 + 180 * ia * ia + pan;
        const al = (1 - ia / 1.6) * (0.4 + 0.6 * h3);
        glow(ctx, x, y, 6 + 10 * h3, '#ffd59a', al * 0.8);
      }
    }
    // bokeh (foreground, out of focus, strongest parallax)
    const s = 1 + (cs - 1) * 1.5;
    for (let i = 0; i < 11; i++) {
      const h1 = hash(i, 321), h2 = hash(i, 322), h3 = hash(i, 323);
      let x = wrap(h1 * 2300 - t * (20 + 30 * h2), -200, 2100), y = 100 + h2 * 880 - t * 8 * h3;
      x = ANCHOR.x + (x - ANCHOR.x) * s; y = ANCHOR.y + (y - ANCHOR.y) * s + pan * 1.45;
      const r = 36 + 90 * h3;
      glow(ctx, x, y, r, i % 3 ? '#ffc27a' : '#fff0d0', (0.05 + 0.07 * h1) * (0.8 + 0.2 * Math.sin(t + i)));
    }
    ctx.restore();
    A().embers(ctx, t, { seed: 3, count: 26, area: { x: 0, y: 420 + pan, w: W, h: 660 }, color: '#ffbf6a', size: 2.6, speed: 46, alpha: 0.8 });
  }

  // ---------------------------------------------------------------- titles
  function rule(ctx, cx, y, half, gap, a, col = '242,210,122') {
    if (a <= 0 || half <= gap) return;
    ctx.save();
    ctx.globalAlpha *= a;
    for (const sd of [-1, 1]) {
      const x0 = cx + sd * gap, x1 = cx + sd * half;
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, `rgba(${col},0.95)`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), y - 1.5, Math.abs(x1 - x0), 3);
      // diamond
      ctx.fillStyle = `rgba(${col},1)`;
      ctx.beginPath(); ctx.moveTo(x0, y - 7); ctx.lineTo(x0 + sd * 7, y); ctx.lineTo(x0, y + 7); ctx.lineTo(x0 - sd * 7, y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawTitles(ctx, t, pan) {
    const glow = U().glow;
    // ---- main title slam (6.48 → 6.6)
    const S = titleSpr();
    if (t >= T_SLAM - 0.12) {
      const ty = TITLE_Y + pan * 1.1;
      let sc, a;
      if (t < T_SLAM) { const k = prog(t, T_SLAM - 0.12, T_SLAM); sc = lerp(2.5, 1, k * k); a = Math.sqrt(k); }
      else { const age = t - T_SLAM; sc = 1 - 0.045 * Math.exp(-age * 9) * Math.cos(age * 32); a = 1; }
      // warm bloom behind
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(960, ty); ctx.scale(5.2, 0.9);
      glow(ctx, 0, 0, 150, '#ff9a3a', 0.22 * a + 0.4 * decay(t, T_SLAM, 4));
      ctx.restore();
      // motion trail while slamming in
      if (t < T_SLAM) for (let j = 3; j >= 1; j--) drawMetal(ctx, S, 960, ty, { scale: sc * (1 + j * 0.12), alpha: a * 0.18 / j });
      let spec = null, specA = 0.95;
      const s1 = prog(t, T_SLAM + 0.05, T_SLAM + 0.75), s2 = prog(t, 9.5, 10.2);   // landing glint, later a slower one
      if (s1 > 0 && s1 < 1) spec = s1 * 1.4 - 0.2;
      else if (s2 > 0 && s2 < 1) { spec = s2 * 1.4 - 0.2; specA = 0.55; }
      drawMetal(ctx, S, 960, ty, { scale: sc, alpha: a, spec, specA, flash: 0.9 * decay(t, T_SLAM, 7) });
      // rules under the title
      const rk = ease.outCubic(prog(t, T_SLAM + 0.05, T_SLAM + 0.6));
      rule(ctx, 960, ty + 64, lerp(80, 640, rk), 26, rk * 0.9);
      // star glint on landing (top of the alef of «السعودية»)
      starGlint(ctx, 960 - S.tw / 2 + S.tw * 0.24, ty - 46, 70, 0.9 * decay(t, T_SLAM + 0.06, 5) * (t > T_SLAM + 0.06 ? 1 : 0), 0.1);
    }

    // ---- line 2 (8.4 → 10.2), revealed right → left in step with the sword gleam
    const L2 = l2Spr();
    if (t >= T_GLEAM && t < T_HIT - 0.08) {
      const ly = L2_Y + pan * 1.1;
      const rk = ease.inOutCubic(prog(t, T_GLEAM, T_GLEAM + 0.5));
      const out = ease.inQuad(prog(t, T_HIT - 0.24, T_HIT - 0.08));
      ctx.save();
      const xr = 960 + L2.w / 2, xl = xr - L2.w * rk;
      ctx.beginPath(); ctx.rect(xl, ly - L2.h / 2, xr - xl, L2.h); ctx.clip();
      drawMetal(ctx, L2, 960, ly - 8 * (1 - rk) - 26 * out, { alpha: 1 - out, sx: 1 + 0.35 * out, scale: 1 - 0.1 * out, flash: 0.6 * out, spec: prog(t, T_GLEAM + 0.15, T_GLEAM + 0.8) * 1.3 - 0.1, specA: 0.7 });
      ctx.restore();
      if (rk > 0 && rk < 1) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.translate(xl, ly); ctx.scale(0.12, 1);
        glow(ctx, 0, 0, 120, '#fff2c8', 0.9);
        ctx.restore();
        starGlint(ctx, xl, ly, 40, 0.8, 0);
      }
    }

    // ---- line 3 (10.2 hit)
    if (t >= T_HIT - 0.07) {
      const L3 = l3Spr();
      const ly = L2_Y + 6 + pan * 1.1;
      let sc, a;
      if (t < T_HIT) { const k = prog(t, T_HIT - 0.07, T_HIT); sc = lerp(1.9, 1, k * k); a = k; }
      else { const age = t - T_HIT; sc = 1 - 0.05 * Math.exp(-age * 10) * Math.cos(age * 34); a = 1; }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(960, ly); ctx.scale(3.4, 0.8);
      glow(ctx, 0, 0, 120, '#ffae50', 0.15 + 0.45 * decay(t, T_HIT, 5));
      ctx.restore();
      drawMetal(ctx, L3, 960, ly, { scale: sc, alpha: a, flash: 0.95 * decay(t, T_HIT, 8), spec: prog(t, T_HIT + 0.05, T_HIT + 0.65) * 1.3 - 0.1, specA: 0.9 });
      const rk = ease.outCubic(prog(t, T_HIT, T_HIT + 0.45));
      rule(ctx, 960, ly, lerp(L3.tw / 2 + 40, L3.tw / 2 + 260, rk), L3.tw / 2 + 30, rk);
    }
  }

  // impacts: ground shock (6.0), title shockwave + sparks + dust (6.6), line-3 hit (10.2)
  function drawImpacts(ctx, t, pan) {
    const glow = U().glow;
    // 6.6 title shockwave
    const sa = t - T_SLAM;
    if (sa >= 0 && sa < 1.6) {
      const y = TITLE_Y + pan * 1.1;
      U().glow(ctx, 960, y, 700, '#ffd08a', 0.35 * Math.exp(-sa * 6));
      // flat gold ring around the title
      const R = 120 + 1100 * (1 - Math.exp(-sa * 3.4)), a = Math.pow(clamp(1 - sa / 0.9), 1.6);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(960, y); ctx.scale(1, 0.22);
      ctx.strokeStyle = `rgba(255,214,140,${0.75 * a})`; ctx.lineWidth = 10 * (1 - sa * 0.5);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,240,${0.6 * a})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.96, 0, TAU); ctx.stroke();
      ctx.restore();
      // dust rolling out from the baseline
      const puff = A().puffSprite;
      for (let i = 0; i < 18; i++) {
        const h1 = hash(i, 401), h2 = hash(i, 402), sd = i % 2 ? 1 : -1;
        const d = (200 + 650 * h1) * (1 - Math.exp(-sa * 2.6));
        const x = 960 + sd * (120 + d), yy = y + 46 - sa * (20 + 30 * h2);
        const r = (50 + 50 * h2) * (0.6 + sa * 0.9);
        A().drawPuff(ctx, puff(i, '#d8a868'), x, yy, r, 0.5 * Math.min(1, sa * 8) * Math.pow(clamp(1 - sa / 1.6), 1.3), h1 * 6 + sa);
      }
      // sparks
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let i = 0; i < 46; i++) {
        const h1 = hash(i, 411), h2 = hash(i, 412), h3 = hash(i, 413);
        const life = 0.5 + 0.6 * h3;
        if (sa > life) continue;
        const ang = -Math.PI / 2 + (h1 - 0.5) * 2.9;
        const v = 700 + 1300 * h2, k = 3.2;
        const ex = (1 - Math.exp(-k * sa)) / k;
        const x0 = 960 + (h1 - 0.5) * S_W(), y0 = y + (h2 - 0.5) * 50;
        const x = x0 + Math.cos(ang) * v * ex, yy = y0 + Math.sin(ang) * v * ex + 900 * sa * sa;
        const vx = Math.cos(ang) * v * Math.exp(-k * sa), vy = Math.sin(ang) * v * Math.exp(-k * sa) + 1800 * sa;
        const al = 1 - sa / life;
        ctx.strokeStyle = `rgba(255,${200 + 50 * h3 | 0},140,${al})`; ctx.lineWidth = 1.5 + 2 * h3;
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x - vx * 0.03, yy - vy * 0.03); ctx.stroke();
      }
      ctx.restore();
    }
    // 10.2 hit on line 3
    const ha = t - T_HIT;
    if (ha >= 0 && ha < 1.4) {
      const y = L2_Y + pan * 1.1;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(960, y); ctx.scale(1, 0.18);
      const R = 90 + 900 * (1 - Math.exp(-ha * 3.6)), a = Math.pow(clamp(1 - ha / 0.8), 1.5);
      ctx.strokeStyle = `rgba(255,220,150,${0.7 * a})`; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,240,${0.5 * a})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.95, 0, TAU); ctx.stroke();
      ctx.restore();
      U().glow(ctx, 960, y, 520, '#ffd08a', 0.3 * Math.exp(-ha * 6));
    }
  }
  const S_W = () => titleSpr().tw;

  // ---------------------------------------------------------------- compositor
  function drawWorld(ctx, t, pan) {
    const cs = camScale(t);
    const sh = M.shake(t, shakeAmt(t), 20, 23);
    ctx.save();
    ctx.translate(960 + sh.x, 540 + sh.y); ctx.rotate(sh.r * 1.5); ctx.translate(-960, -540);
    drawBackground(ctx, t, cs, pan);
    drawBackRays(ctx, t, cs, pan);
    drawGround(ctx, t, cs, pan);
    const r = drawFlag(ctx, t, cs, pan);
    drawSwordGleam(ctx, t, r);
    drawFrontAtmos(ctx, t, cs, pan);
    drawParticles(ctx, t, cs, pan);
    drawImpacts(ctx, t, pan);
    drawTitles(ctx, t, pan);
    ctx.restore();
  }

  let _layer = null, _layer2 = null, _layer3 = null;
  function draw(ctx, lt, t) {
    const pan = panY(t);
    if (pan < 2) {
      drawWorld(ctx, t, pan);
    } else {
      // vertical motion blur: average of the frame rendered once, composited at offsets spanning the shutter
      if (!_layer) _layer = mk(W, H);
      const g = _layer.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#1d3557'; g.fillRect(0, 0, W, H);
      drawWorld(g, t, pan);
      const v = (panY(t + 0.5 / FPS) - panY(t - 0.5 / FPS));     // px per frame
      const blur = Math.min(260, v * 0.9);
      // QA: three passes of 4 taps = 64 evenly spaced taps (box blur of length `blur`); integer offsets = fast blits.
      // (was 2 passes / 16 taps: at the end of the whip the taps were ~16 px apart and showed as stepped ghosts)
      if (!_layer2) _layer2 = mk(W, H);
      if (!_layer3) _layer3 = mk(W, H);
      const d = blur / 64, R = Math.round;
      const pass = (gd, src, sp) => {
        gd.setTransform(1, 0, 0, 1, 0, 0); gd.globalCompositeOperation = 'source-over';
        gd.globalAlpha = 1; gd.drawImage(src, 0, R(-2 * sp)); gd.drawImage(src, 0, R(2 * sp));      // edge fillers
        for (let i = 0; i < 4; i++) { gd.globalAlpha = 1 / (i + 1); gd.drawImage(src, 0, R((i - 1.5) * sp)); }
        gd.globalAlpha = 1;
      };
      pass(_layer2.getContext('2d'), _layer, d);
      pass(_layer3.getContext('2d'), _layer2, d * 4);
      pass(ctx, _layer3, d * 16);
      ctx.globalAlpha = 1;
    }
    // whip-pan overlays: streaks + warm cloud wipe
    const wk = prog(t, T_WHIP, T_END);
    if (wk > 0) {
      A().motionStreaks(ctx, t, { dir: 'down', alpha: 0.55 * ease.inQuad(wk), count: 90, color: '#fff0d6', speed: 3200, width: 3, length: 1.6 });
      M.fill(ctx, '#ffe2b4', 0.4 * Math.pow(prog(t, T_WHIP + 0.3, T_END), 2));
    }
    // white impact flash at 6.0 (continues S1's flash)
    const fl = decay(t, T0, 6.5);
    if (fl > 0.003) M.fill(ctx, '#fff9ee', fl);
  }

  M.registerScene({ id: 's2_flag', start: T0, end: T_END, z: 0, draw });
})();
