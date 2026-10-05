/*
 * S7 — Finale · 58.8 – 67.0
 *
 *  58.8  enters from S6's white-gold flash: flash decays while the camera pulls back → golden dawn sky
 *  59.4  four-ship formation flies out of the low sun, climbs across the frame trailing green / white smoke
 *  60.0  HUGE HIT: «النصر قادم» slams in, enormous metallic gold; light-ray burst, shockwave, sparks, shake
 *  61.2  HIT: «خلال ٧ أيام» slams in under it (the ٧ on a green medallion with a gold rim)
 *  62.4  «بإذن الله» — soft and reverent: gentle glow fade + reveal, light swell, no shake
 *  64.2  soft hit: the title group dissolves into a warm bloom; the Saudi flag fades in backlit and settles
 *        upward; «حفظ الله الوطن» lands under it
 *  66.0  final boom: bloom pulse, ray burst, gleam across the text, embers; then the composition settles
 *        while the engine fades to black 66.4 – 67.0
 *
 * Every frame is a pure function of t. Caches hold only t-independent content (sky+dune plate, metallic
 * text sprites, path tables, smoke key frames rendered at fixed times); scratch canvases are fully
 * cleared and redrawn every frame. Additive light is rendered at half resolution for speed.
 */
(function () {
  'use strict';
  const M = window.M;
  const { clamp, lerp, prog, ease, hash, noise1 } = M;
  const W = 1920, H = 1080, TAU = Math.PI * 2;
  const A = () => M.assets;
  const U = () => M.assets.util;

  // ------------------------------------------------------------------ timeline
  const T0 = 58.8, T_FLY = 59.4, T_HIT = 60.0, T_L2 = 61.2, T_L3 = 62.4, T_FLAG = 64.2, T_BOOM = 66.0, T_END = 67.0;
  const T_OUT = 63.8;                       // title group starts to lift away (→ flag)

  const S_TITLE = 'النصر قادم';
  const S_L2 = ['خلال', '٧', 'أيام'];        // «خلال ٧ أيام», laid out word by word right → left
  const S_L3 = 'بإذن الله';
  const S_L4 = 'حفظ الله الوطن';

  // ------------------------------------------------------------------ layout
  const HORIZON = 846;
  const SUN = { x: 400, y: 826, r: 60 };
  const TITLE = { x: 960, y: 362, size: 278 };
  const L2 = { y: 598, size: 120, medR: 90 };
  const L3 = { y: 796, size: 116 };
  const FLAG = { x: 548, y: 112, w: 800, poleLen: 1400 };
  const L4 = { x: 976, y: 828, size: 116 };
  const FOCUS = { x: 960, y: 480 };
  const FLAG_IN = [64.08, 64.95];               // flag fades in behind the 64.2 bloom and settles upward

  // ------------------------------------------------------------------ helpers
  const decay = (t, c, rate) => (t >= c ? Math.exp(-(t - c) * rate) : 0);
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function scratch(key, w, h) { return U().scratch('s7_' + key, w, h); }

  // ------------------------------------------------------------------ camera
  function camera(t) {
    const reveal = 0.11 * (1 - ease.outCubic(prog(t, T0, T0 + 1.15)));          // pull back out of the flash
    const drift = 0.05 * ease.inOutQuad(prog(t, 59.3, T_END));                  // slow push-in
    const inhale = t < T_HIT ? -0.022 * ease.inQuad(prog(t, 59.74, T_HIT)) : 0; // breath before the huge hit
    const punch = 0.075 * decay(t, T_HIT, 5.2) + 0.03 * decay(t, T_L2, 7.5) + 0.012 * decay(t, T_FLAG, 6) + 0.026 * decay(t, T_BOOM, 4.5);
    const amp = 30 * decay(t, T_HIT, 4.2) + 13 * decay(t, T_L2, 6) + 4 * decay(t, T_FLAG, 7) + 13 * decay(t, T_BOOM, 4.6)
      + 6 * Math.sin(Math.PI * prog(t, 59.25, 59.95)) + 0.8;
    const sh = M.shake(t, amp, 19, 707);
    return { s: 1 + reveal + drift + inhale + punch, x: sh.x, y: sh.y, r: sh.r };
  }
  function applyCam(ctx, cam, par) {
    const s = 1 + (cam.s - 1) * par;
    ctx.translate(FOCUS.x + cam.x * par, FOCUS.y + cam.y * par);
    ctx.rotate(cam.r * par);
    ctx.scale(s, s);
    ctx.translate(-FOCUS.x, -FOCUS.y);
  }

  // ------------------------------------------------------------------ cached plates
  const PAD = 96;
  const SKY_OPT = { top: '#1a2d55', mid: '#cf7a5c', horizon: '#ffd590', haze: '#ffe3b2', sunColor: '#fff6e0', glowColor: '#ffb868' };
  const CLOUD_TINT = { light: '#fff2dc', mid: '#f6b88c', shade: '#8f6b86', rim: '#fff9ec', amb: '#d89a86' };
  function extendEdges(g, c) {               // copy edge rows / columns into the PAD margins
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(c, PAD, 0, 1, c.height, 0, 0, PAD, c.height);
    g.drawImage(c, PAD + W - 1, 0, 1, c.height, PAD + W, 0, PAD, c.height);
    g.drawImage(c, 0, PAD, c.width, 1, 0, 0, c.width, PAD);
    g.drawImage(c, 0, PAD + H - 1, c.width, 1, 0, PAD + H, c.width, PAD);
  }
  // sky + cirrus + low clouds + dunes merged into one plate (one full-frame draw per frame)
  let BGP = null;
  function bgPlate() {
    if (BGP) return BGP;
    const c = mk(W + PAD * 2, H + PAD * 2), g = c.getContext('2d');
    g.translate(PAD, PAD);
    A().sky(g, Object.assign({ horizonY: HORIZON, sunX: SUN.x, sunY: SUN.y, sunR: SUN.r, glow: 1.25, cache: false }, SKY_OPT));
    // high thin cirrus streaks catching the dawn light
    g.save();
    g.globalCompositeOperation = 'screen';
    for (let i = 0; i < 9; i++) {
      const h1 = hash(i, 4101), h2 = hash(i, 4102), h3 = hash(i, 4103);
      g.save();
      g.translate(-200 + h1 * 2300, 70 + h2 * 330);
      g.rotate(-0.06 + (h3 - 0.5) * 0.08);
      g.scale(5 + h3 * 4, 0.33);
      U().glow(g, 0, 0, 110, '#ffd2a8', 0.18 + 0.14 * h2);
      g.restore();
    }
    g.restore();
    A().clouds(g, 7.0, { seed: 33, count: 5, y0: 640, y1: 790, speed: 18, scale: 0.95, tint: CLOUD_TINT, alpha: 0.7, xMin: -600, xMax: W + 600 });
    extendEdges(g, c);
    g.setTransform(1, 0, 0, 1, PAD, PAD);
    A().dunes(g, 0, { horizonY: HORIZON, layers: 5, scroll: 0, seed: 3, palette: 'golden', light: 1, amp: 0.85, bottom: H + PAD });
    // darker lower band → contrast for the closing titles
    const gr = g.createLinearGradient(0, HORIZON + 20, 0, H + PAD);
    gr.addColorStop(0, 'rgba(30,14,4,0)'); gr.addColorStop(0.4, 'rgba(22,10,3,0.3)'); gr.addColorStop(1, 'rgba(8,4,2,0.75)');
    g.fillStyle = gr; g.fillRect(0, HORIZON, W, H + PAD - HORIZON);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(c, PAD, HORIZON + PAD, 1, H + PAD - HORIZON, 0, HORIZON + PAD, PAD, H + PAD - HORIZON);
    g.drawImage(c, PAD + W - 1, HORIZON + PAD, 1, H + PAD - HORIZON, PAD + W, HORIZON + PAD, PAD, H + PAD - HORIZON);
    BGP = c;
    return c;
  }

  // ------------------------------------------------------------------ metallic text sprites
  const SPR = {};
  const GOLD = {
    shadow: 'rgba(14,7,0,0.78)', extrude: '#7a5216', extrudeDark: '#2a1806', outline: '#170d02', rim: '#ffe39a', hi: '#fffbea',
    face: [[0, '#fffef4'], [0.16, '#fff0b8'], [0.36, '#ecc666'], [0.49, '#9a6a1e'], [0.53, '#7a5012'], [0.58, '#c8952e'], [0.74, '#f6d27a'], [0.88, '#ffefb6'], [1, '#c08a2c']],
  };
  const PALE = {
    shadow: 'rgba(10,6,0,0.7)', extrude: '#6a4c18', extrudeDark: '#241606', outline: '#140c02', rim: '#fff0c4', hi: '#ffffff',
    face: [[0, '#ffffff'], [0.3, '#fff6dc'], [0.48, '#e8c780'], [0.55, '#c99a48'], [0.62, '#f6e2aa'], [0.86, '#fffaf0'], [1, '#e2c07a']],
  };
  function metalSprite(key, str, o, pal) {
    if (SPR[key]) return SPR[key];
    const tmp = mk(4, 4).getContext('2d');
    const base = { size: o.size, family: o.family, weight: o.weight || 700 };
    if (o.wordSpacing != null) base.wordSpacing = o.wordSpacing;
    const tw = M.measure(tmp, str, base);
    const w = Math.ceil(tw + o.size * 1.3), h = Math.ceil(o.size * 2.5);
    const cx = w / 2, cy = h / 2;
    const T = (g, dx, dy, ex) => M.text(g, str, cx + dx, cy + dy, Object.assign({}, base, ex));
    const c = mk(w, h), g = c.getContext('2d');
    // cast shadow
    T(g, 0, o.size * 0.1, { color: pal.shadow, shadow: o.size * 0.3 });
    // extrusion (depth), darker toward the back
    const depth = Math.max(3, Math.round(o.size * (o.depth || 0.065)));
    for (let k = depth; k >= 1; k--) T(g, 0, k, { color: U().mixs(pal.extrude, pal.extrudeDark, k / depth) });
    // dark outline + bright bevel rim
    T(g, 0, 0, { color: pal.outline, stroke: Math.max(3, o.size * 0.075), strokeColor: pal.outline });
    T(g, 0, 0, { color: pal.rim, stroke: Math.max(1.5, o.size * 0.026), strokeColor: pal.rim });
    T(g, 0, -Math.max(1.2, o.size * 0.018), { color: pal.hi });
    // face: chrome-gold gradient + inner shading, built separately and composited
    const f = mk(w, h), fg = f.getContext('2d');
    const gr = fg.createLinearGradient(0, cy - o.size * 0.58, 0, cy + o.size * 0.5);
    pal.face.forEach(([k, col]) => gr.addColorStop(k, col));
    T(fg, 0, 0.8, { color: gr });
    fg.globalCompositeOperation = 'source-atop';
    const dg = fg.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0);     // soft diagonal sheen bands
    dg.addColorStop(0, 'rgba(255,255,255,0)'); dg.addColorStop(0.22, 'rgba(255,250,225,0.22)'); dg.addColorStop(0.3, 'rgba(255,255,255,0)');
    dg.addColorStop(0.62, 'rgba(255,255,255,0)'); dg.addColorStop(0.7, 'rgba(255,248,220,0.18)'); dg.addColorStop(0.76, 'rgba(255,255,255,0)'); dg.addColorStop(1, 'rgba(60,30,0,0.12)');
    fg.fillStyle = dg; fg.fillRect(0, 0, w, h);
    fg.globalCompositeOperation = 'source-over';
    g.drawImage(f, 0, 0);
    // face-only mask (specular sweeps / flashes)
    const m = mk(w, h), mg = m.getContext('2d');
    T(mg, 0, 0.8, { color: '#fff' });
    // pre-blurred bloom (quarter res)
    const q = 4, b = mk(w / q, h / q), bg = b.getContext('2d');
    bg.filter = `blur(${Math.max(2, o.size * 0.05)}px)`;
    bg.drawImage(m, 0, 0, w / q, h / q);
    bg.filter = 'none';
    SPR[key] = { c, m, b, w, h, tw };
    return SPR[key];
  }
  // soft calligraphic sprite (no extrusion) for «بإذن الله»
  function softSprite(key, str, o) {
    if (SPR[key]) return SPR[key];
    const tmp = mk(4, 4).getContext('2d');
    const base = { size: o.size, family: o.family, weight: 700 };
    const tw = M.measure(tmp, str, base);
    const w = Math.ceil(tw + o.size * 2.2), h = Math.ceil(o.size * 2.8);
    const cx = w / 2, cy = h / 2;
    const c = mk(w, h), g = c.getContext('2d');
    M.text(g, str, cx, cy + 4, Object.assign({}, base, { color: 'rgba(20,8,0,0.8)', shadow: o.size * 0.22 }));
    M.text(g, str, cx, cy, Object.assign({}, base, { color: 'rgba(255,200,110,0.85)', glow: o.size * 0.4, glowColor: 'rgba(255,180,80,0.9)' }));
    M.text(g, str, cx, cy, Object.assign({}, base, { color: '#3a2206', stroke: Math.max(3, o.size * 0.05), strokeColor: 'rgba(40,22,4,0.92)' }));
    const gr = g.createLinearGradient(0, cy - o.size * 0.6, 0, cy + o.size * 0.6);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#fff9ec'); gr.addColorStop(0.75, '#fdebbf'); gr.addColorStop(1, '#efcf8a');
    M.text(g, str, cx, cy, Object.assign({}, base, { color: gr }));
    const m = mk(w, h);
    M.text(m.getContext('2d'), str, cx, cy, Object.assign({}, base, { color: '#fff' }));
    SPR[key] = { c, m, w, h, tw };
    return SPR[key];
  }
  const titleSpr = () => metalSprite('title', S_TITLE, { size: TITLE.size, family: 'kufi', depth: 0.06 }, GOLD);
  const l2Spr = (i) => i === 1
    ? metalSprite('l2n', S_L2[1], { size: 160, family: 'kufi', depth: 0.06 }, PALE)
    : metalSprite('l2_' + i, S_L2[i], { size: L2.size, family: 'kufi', depth: 0.07 }, GOLD);
  const l3Spr = () => softSprite('l3', S_L3, { size: L3.size, family: 'naskh' });
  const l4Spr = () => metalSprite('l4', S_L4, { size: L4.size, family: 'kufi', depth: 0.07 }, GOLD);

  // draw a metal sprite: scale, alpha, moving specular band (spec 0..1 = right → left), face flash, bloom
  function drawMetal(ctx, S, x, y, o = {}) {
    const sc = o.scale != null ? o.scale : 1, a = o.alpha != null ? o.alpha : 1;
    if (a <= 0.002) return;
    ctx.save();
    ctx.translate(x, y); ctx.scale(sc, sc);
    if (o.bloom > 0) {                          // soft gold bloom behind the letters
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * Math.min(1, o.bloom);
      ctx.drawImage(S.b, -S.w / 2 - S.w * 0.04, -S.h / 2 - S.h * 0.06, S.w * 1.08, S.h * 1.12);
      ctx.restore();
    }
    ctx.globalAlpha *= a;
    ctx.drawImage(S.c, -S.w / 2, -S.h / 2);
    if (o.spec != null && o.spec > 0 && o.spec < 1) {
      const bw = Math.max(70, S.h * 0.32);
      const bx = S.w / 2 + S.tw / 2 + bw - o.spec * (S.tw + bw * 2);
      // only the columns the slanted band can touch
      const x0 = Math.max(0, Math.floor(bx - bw - S.h * 0.2)), x1 = Math.min(S.w, Math.ceil(bx + bw + S.h * 0.2)), cw = x1 - x0;
      if (cw > 0) {
      const g = scratch('spec', cw, S.h).getContext('2d');
      g.translate(-x0, 0);
      g.drawImage(S.m, x0, 0, cw, S.h, x0, 0, cw, S.h);
      g.globalCompositeOperation = 'source-in';
      const gr = g.createLinearGradient(bx - bw, 0, bx + bw, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.42, `rgba(255,246,214,${0.5 * (o.specA || 1)})`);
      gr.addColorStop(0.5, `rgba(255,255,255,${0.95 * (o.specA || 1)})`); gr.addColorStop(0.58, `rgba(255,246,214,${0.5 * (o.specA || 1)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.setTransform(1, 0, -0.38, 1, S.h * 0.19 - x0, 0);
      g.fillStyle = gr; g.fillRect(bx - bw - S.h, 0, bw * 2 + S.h * 2, S.h);
      g.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(g.canvas, 0, 0, cw, S.h, -S.w / 2 + x0, -S.h / 2, cw, S.h);
      ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (o.flash > 0.003) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * Math.min(1, o.flash);
      ctx.drawImage(S.m, -S.w / 2, -S.h / 2);
      if (o.flash > 1) { ctx.globalAlpha = a * Math.min(1, o.flash - 1); ctx.drawImage(S.m, -S.w / 2, -S.h / 2); }
    }
    ctx.restore();
  }

  function starGlint(ctx, x, y, r, a, rot = 0) {
    if (a <= 0.01) return;
    const glow = U().glow;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, r * 1.3, '#ffd98a', a * 0.55);
    glow(ctx, 0, 0, r * 0.45, '#ffffff', a);
    ctx.save(); ctx.scale(7, 0.07); glow(ctx, 0, 0, r, '#ffffff', a); ctx.restore();
    ctx.save(); ctx.scale(0.07, 3.4); glow(ctx, 0, 0, r, '#ffffff', a * 0.9); ctx.restore();
    ctx.rotate(Math.PI / 4);
    ctx.save(); ctx.scale(1.8, 0.05); glow(ctx, 0, 0, r, '#fff1c8', a * 0.5); ctx.restore();
    ctx.save(); ctx.scale(0.05, 1.8); glow(ctx, 0, 0, r, '#fff1c8', a * 0.5); ctx.restore();
    ctx.restore();
  }

  // analytic spark burst: glowing gold sparks thrown out of a rect, heavy drag + light gravity, motion-blurred
  function sparks(ctx, age, o) {
    if (age < 0 || age > o.life * 1.3) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const drag = o.drag || 3.4, gr = o.gravity != null ? o.gravity : 260;
    const f = (a) => (1 - Math.exp(-drag * a)) / drag;
    const glow = U().glow;
    for (let i = 0; i < o.n; i++) {
      const h1 = hash(i, o.seed), h2 = hash(i, o.seed + 1), h3 = hash(i, o.seed + 2), h4 = hash(i, o.seed + 3), h5 = hash(i, o.seed + 4);
      const life = o.life * (0.45 + 0.75 * h4);
      if (age > life) continue;
      const ox = o.x + (h1 - 0.5) * o.w, oy = o.y + (h2 - 0.5) * o.h;
      const out = Math.atan2((oy - o.y) * 2.2 + (h3 - 0.5) * 60, ox - o.x + (h5 - 0.5) * 40);
      const ang = out + (h3 - 0.5) * 1.2 - (o.up || 0.3) * 0.5;
      const sp = o.speed * (0.35 + 0.9 * h5);
      const wob = 14 * Math.sin(age * (5 + 6 * h1) + i);
      const P = (a) => ({ x: ox + Math.cos(ang) * sp * f(a) + wob * Math.min(1, a * 2), y: oy + Math.sin(ang) * sp * f(a) + 0.5 * gr * a * a });
      const p = P(age), q = P(Math.max(0, age - 0.05));
      const k = 1 - age / life, fade = Math.pow(k, 1.1) * (0.65 + 0.35 * Math.sin(age * (18 + 20 * h2) + i));
      ctx.strokeStyle = `rgba(255,${(196 + 50 * h2) | 0},${(96 + 90 * h1) | 0},${(0.9 * fade).toFixed(3)})`;
      ctx.lineWidth = (1.6 + 2.6 * h4) * (0.55 + 0.45 * k) * (o.thick || 1);
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      glow(ctx, p.x, p.y, (8 + 12 * h4) * (o.thick || 1), '#ffc457', 0.55 * fade);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ formation flight path
  // base path: out of the low sun (lower-left), climbing hard, then levelling across the top toward the right
  const BEZ = [[-520, 1560], [120, 600], [600, 150], [2550, -20]];
  let PATH = null;
  function bez(u) {
    const v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    return [a * BEZ[0][0] + b * BEZ[1][0] + c * BEZ[2][0] + d * BEZ[3][0], a * BEZ[0][1] + b * BEZ[1][1] + c * BEZ[2][1] + d * BEZ[3][1]];
  }
  function buildPath() {
    if (PATH) return PATH;
    const NS = 4000, xs = [], ys = [], cum = [0];
    for (let i = 0; i <= NS; i++) { const p = bez(i / NS); xs.push(p[0]); ys.push(p[1]); if (i) cum.push(cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1])); }
    const L = cum[NS], N = 1600, px = new Float64Array(N + 1), py = new Float64Array(N + 1), tx = new Float64Array(N + 1), ty = new Float64Array(N + 1);
    let j = 0;
    for (let k = 0; k <= N; k++) {
      const s = L * k / N;
      while (j < NS - 1 && cum[j + 1] < s) j++;
      const f = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]);
      px[k] = lerp(xs[j], xs[j + 1], f); py[k] = lerp(ys[j], ys[j + 1], f);
      const dx = xs[j + 1] - xs[j], dy = ys[j + 1] - ys[j], dl = Math.hypot(dx, dy) || 1;
      tx[k] = dx / dl; ty[k] = dy / dl;
    }
    PATH = { L, N, px, py, tx, ty };
    // per-lane puff stations (fixed path parameters → a growing trail never re-samples)
    PATH.lanes = LANES.map((ln) => {
      const st = []; let s = 0;
      while (s < L + 200) { st.push(s); s += Math.max(5, 0.42 * PUFF_R * persp(s)); }
      return st;
    });
    return PATH;
  }
  function pathAt(s) {
    const P = buildPath();
    if (s >= P.L) { const n = P.N; return { x: P.px[n] + P.tx[n] * (s - P.L), y: P.py[n] + P.ty[n] * (s - P.L), tx: P.tx[n], ty: P.ty[n] }; }
    if (s <= 0) return { x: P.px[0] + P.tx[0] * s, y: P.py[0] + P.ty[0] * s, tx: P.tx[0], ty: P.ty[0] };
    const k = s / P.L * P.N, i = Math.floor(k), f = k - i;
    return { x: lerp(P.px[i], P.px[i + 1], f), y: lerp(P.py[i], P.py[i + 1], f), tx: lerp(P.tx[i], P.tx[i + 1], f), ty: lerp(P.ty[i], P.ty[i + 1], f) };
  }
  // perspective: close & big while climbing out of the sun, shrinking as the formation recedes over the top
  function persp(s) { const L = PATH ? PATH.L : 3600; return lerp(1.0, 0.24, smooth(0.1, 0.9, s / L)); }
  // lanes: offset along the normal (+ = outer / upper-left), lag behind the lead, smoke colour
  const LANES = [
    { off: -1.5, lag: 0, col: '#1FAE5B', seed: 11 },
    { off: -0.5, lag: 1, col: '#fff5e8', seed: 23 },
    { off: 0.5, lag: 2, col: '#1FAE5B', seed: 37 },
    { off: 1.5, lag: 3, col: '#fff5e8', seed: 51 },
  ];
  const SPACING = 124, LAG = 200, PUFF_R = 40, JET_SC = 1.1, TAIL = 0.47 * 500;
  // lead jet arc length vs time: g(x) = x(1.6 − 0.6x) (fast close pass, slowing as it recedes)
  const FLY_A = T_FLY, FLY_D = 1.42, S_START = 1147, S_SPAN = 2848;   // lead enters ≈59.32, centre ≈59.7, top-right ≈60.0
  function sLead(t) {
    const x = (t - FLY_A) / FLY_D;
    if (x <= 0) return S_START + S_SPAN * 1.6 * x;
    if (x >= 1) return S_START + S_SPAN + S_SPAN * 0.4 * (x - 1);
    return S_START + S_SPAN * x * (1.6 - 0.6 * x);
  }
  function tLead(s) {                           // inverse of sLead
    const g = (s - S_START) / S_SPAN;
    if (g <= 0) return FLY_A + FLY_D * g / 1.6;
    if (g >= 1) return FLY_A + FLY_D * (1 + (g - 1) / 0.4);
    return FLY_A + FLY_D * (1.6 - Math.sqrt(2.56 - 2.4 * g)) / 1.2;
  }
  function lanePos(s, off) {
    const p = pathAt(s), k = persp(s) * SPACING * off;
    return { x: p.x - p.ty * k, y: p.y + p.tx * k, tx: p.tx, ty: p.ty };   // normal = (ty, −tx) rotated → outer side
  }
  const jetS = (t, ln) => { const s0 = sLead(t); return s0 - ln.lag * LAG * persp(s0); };

  // smoke trails: lit puffs aged analytically from their birth time; rendered at reduced resolution (soft anyway)
  const TRS = 0.36;
  const TW = Math.ceil((W + 160) * TRS), TH = Math.ceil((H + 160) * TRS);
  // draws every born puff of the four ribbons at time t into g (world coordinates, g pre-scaled); returns false if none
  function renderTrails(g, t) {
    const P = buildPath();
    const wind = { x: 16, y: -5 };
    const dis = 1 - 0.45 * prog(t, 61, T_END);                     // gentle dissipation over the finale
    let any = false;
    for (let li = LANES.length - 1; li >= 0; li--) {
      const ln = LANES[li], st = P.lanes[li];
      for (let i = 0; i < st.length; i++) {
        const s = st[i], pz = persp(s);
        const born = tLead(s + ln.lag * LAG * pz + TAIL * JET_SC * pz);
        const a = t - born;
        if (a < 0) break;                                           // stations further along are not born yet
        any = true;
        const h = hash(i, ln.seed);
        const p = lanePos(s, ln.off);
        const r = PUFF_R * pz * (0.42 + 1.05 * (1 - Math.exp(-a * 2.4)) + 0.2 * a) * (0.85 + 0.3 * h);
        const bx = noise1(i * 0.21 + a * 0.3, ln.seed) * r * 0.5 * Math.min(1, a * 1.5);
        const by = noise1(i * 0.21 + a * 0.3, ln.seed + 9) * r * 0.5 * Math.min(1, a * 1.5);
        const x = p.x + bx + wind.x * a, y = p.y + by + wind.y * a - a * 4;
        if (x - r > W + 60 || y + r < -60 || x + r < -60 || y - r > H + 60) continue;
        const al = 0.66 * Math.min(1, a * 10 + 0.25) * Math.exp(-a * 0.2) / (1 + 0.12 * a * pz) * dis * (0.75 + 0.25 * h);
        A().drawPuff(g, A().puffSprite(i, ln.col), x, y, r, al, 0);
      }
    }
    return any;
  }
  // once every jet has passed, the ribbons only drift and dissipate: they are rendered at fixed key times
  // (t-independent cache entries) and interpolated in premultiplied space ('lighter' → exact linear blend, no density dip)
  const TK0 = 60.8, TKD = 0.4, TKC = {};
  function trailKey(i) {
    if (TKC[i]) return TKC[i];
    const c = mk(TW, TH), g = c.getContext('2d');
    g.setTransform(TRS, 0, 0, TRS, 80 * TRS, 80 * TRS);
    renderTrails(g, TK0 + i * TKD);
    return (TKC[i] = c);
  }
  function drawTrails(ctx, t, cam) {
    let src;
    if (t < TK0) {
      src = scratch('trail', TW, TH);
      const g = src.getContext('2d');
      g.setTransform(TRS, 0, 0, TRS, 80 * TRS, 80 * TRS);
      if (!renderTrails(g, t)) return;
    } else {
      const x = (t - TK0) / TKD, i = Math.floor(x + 1e-6), f = clamp(x - i);
      if (f < 1e-4) src = trailKey(i);
      else {
        src = scratch('trailmix', TW, TH);
        const g = src.getContext('2d');
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 1 - f; g.drawImage(trailKey(i), 0, 0);
        g.globalAlpha = f; g.drawImage(trailKey(i + 1), 0, 0);
      }
    }
    ctx.save();
    applyCam(ctx, cam, 0.7);
    ctx.drawImage(src, 0, 0, TW, TH, -80, -80, TW / TRS, TH / TRS);
    ctx.restore();
  }

  function drawJets(ctx, t, cam) {
    if (t < FLY_A - 0.05 || t > FLY_A + FLY_D + 0.5) return;
    ctx.save();
    applyCam(ctx, cam, 0.8);
    for (let li = LANES.length - 1; li >= 0; li--) {
      const ln = LANES[li], s = jetS(t, ln);
      const p = lanePos(s, ln.off), pz = persp(s);
      if (p.x < -400 || p.y < -300 || p.x > W + 400 || p.y > H + 400) continue;
      const rot = Math.atan2(p.ty, p.tx), sc = JET_SC * pz;
      const v = (sLead(t + 0.02) - sLead(t - 0.02)) / 0.04;             // screen speed (px/s)
      // QA: live 3D model banked toward camera (underside + wings visible) instead of the rotated
      // profile sprite, which read as wingless missiles in the climb. One motion-blur ghost.
      const blur = clamp(v / 3500);
      const j3 = { scale: sc, yaw: 0, pitch: -rot, roll: -0.42, t: t + li * 0.13 };
      const d = 1.5 * v / 30 * 0.22;
      if (blur > 0.02 && sc > 0.5) A().jet3d(ctx, Object.assign({ x: p.x - p.tx * d, y: p.y - p.ty * d, afterburner: 0.5, alpha: 0.18 * blur, lod: 0.5 }, j3));
      A().jet3d(ctx, Object.assign({ x: p.x, y: p.y, afterburner: 0.55 }, j3));
      // smoke generator puff right at the nozzle
      const nx = p.x - p.tx * TAIL * sc, ny = p.y - p.ty * TAIL * sc;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      U().glow(ctx, nx, ny, 70 * sc, '#ffcf8a', 0.5);
      ctx.restore();
      // warm rim glint on the canopy from the low sun
      U().glow(ctx, p.x + p.tx * 120 * sc, p.y + p.ty * 120 * sc - 18 * sc, 40 * sc, '#fff2c8', 0.35);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ background
  const BG_PAR = 0.35;
  function drawBackground(ctx, t, cam) {
    ctx.save();
    applyCam(ctx, cam, BG_PAR);
    ctx.drawImage(bgPlate(), -PAD, -PAD);
    ctx.restore();
    // drifting mid-level clouds (parallax over the baked plate)
    ctx.save();
    applyCam(ctx, cam, 0.5);
    A().clouds(ctx, t - 40, { seed: 21, count: 4, y0: 250, y1: 520, speed: 26, scale: 0.72, tint: CLOUD_TINT, alpha: 0.72, xMin: -600, xMax: W + 600 });
    ctx.restore();
    ctx.save();
    applyCam(ctx, cam, 0.55);
    // horizon haze drifting
    const puff = A().puffSprite;
    for (let i = 0; i < 6; i++) {
      const h1 = hash(i, 701), h2 = hash(i, 702), h3 = hash(i, 703);
      const x = U().wrap(h1 * 2400 + (t - T0) * (14 + 20 * h2), -300, 2100);
      A().drawPuff(ctx, puff(i, '#ffd6a0'), x, HORIZON + 6 + h2 * 50, 120 + 100 * h3, 0.16 + 0.08 * h3, h1 * TAU);
    }
    // 60.0 ground shock: a ring of dust thrown up across the dunes
    const ga = t - T_HIT;
    if (ga >= 0 && ga < 2.4) {
      const R = 1250 * (1 - Math.exp(-ga * 2.0));
      for (let i = 0; i < 14; i++) {
        const th = TAU * i / 14 + hash(i, 731) * 0.2, h = hash(i, 732);
        const front = Math.sin(th) > 0;
        const x = 960 + Math.cos(th) * R * (0.9 + 0.15 * h), y = 930 + Math.sin(th) * R * 0.13;
        const r = (70 + 80 * h) * (0.6 + ga * 0.9) * (front ? 1.15 : 0.8);
        A().drawPuff(ctx, puff(i, '#e9be86'), x, y - r * 0.35, r, (front ? 0.5 : 0.35) * Math.min(1, ga * 7) * Math.pow(clamp(1 - ga / 2.4), 1.3), h * 6 + ga * 0.3);
      }
    }
    ctx.restore();
  }

  // low sun bloom: behind the smoke ribbons so drifting smoke silhouettes against it instead of saturating
  const sunPulse = (t) => 0.5 * decay(t, T_HIT, 2.5) + 0.3 * decay(t, T_BOOM, 2) + 0.35 * smooth(T_L3, 63.4, t) * (1 - smooth(64.0, 64.6, t));
  function drawSun(ctx, t, cam) {
    const pulse = sunPulse(t), glow = U().glow;
    ctx.save();
    applyCam(ctx, cam, BG_PAR);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, SUN.x, SUN.y, 520 + 160 * pulse, '#ffb35c', 0.35 + 0.25 * pulse);
    glow(ctx, SUN.x, SUN.y, 150, '#fff4d8', 0.5 + 0.3 * pulse);
    ctx.restore();
  }

  // ------------------------------------------------------------------ additive light, rendered at half resolution
  const flagY = (t) => FLAG.y + 150 * (1 - ease.outCubic(prog(t, FLAG_IN[0], FLAG_IN[1])));
  const flagK = (t) => ease.outQuad(prog(t, FLAG_IN[0], FLAG_IN[0] + 0.24));
  function drawLight(ctx, t, cam, G) {
    const g = scratch('light', W / 2, H / 2).getContext('2d');
    const glow = U().glow, rays = A().lightRays;
    const at = (par) => { g.setTransform(0.5, 0, 0, 0.5, 0, 0); applyCam(g, cam, par); };
    g.globalCompositeOperation = 'lighter';
    // low sun: rays fanning up out of the horizon (its bloom is drawn behind the smoke, see drawSun)
    const pulse = sunPulse(t);
    at(BG_PAR);
    rays(g, { x: SUN.x, y: SUN.y, count: 22, alpha: 0.13 + 0.12 * pulse, t, length: 2300, color: '#ffd9a0', width: 0.04, spread: Math.PI * 1.15, angle: -Math.PI / 2 + 0.25 });
    // title light
    if (t >= 59.8 && t < T_FLAG + 0.05 && G.a > 0) {
      at(1);
      const cx = TITLE.x, cy = TITLE.y + G.dy;
      g.globalAlpha = G.a;
      if (t < T_HIT) {                                // anticipation: an anamorphic line gathering energy
        const k = ease.inQuad(prog(t, 59.8, T_HIT));
        g.save(); g.translate(cx, cy); g.scale(10 * k + 0.5, 0.05); glow(g, 0, 0, 120, '#fff0c8', 0.9 * k); g.restore();
        glow(g, cx, cy, 80 + 60 * k, '#ffffff', 0.7 * k);
      } else {
        const a = t - T_HIT, burst = Math.exp(-a * 2.6);
        const sus = 0.075 + 0.02 * Math.sin(t * 2.1) + 0.06 * decay(t, T_L2, 3) + 0.035 * smooth(T_L3, 63.3, t);
        glow(g, cx, cy, 1000, '#ffb85c', 0.4 * burst + 0.07);
        glow(g, cx, cy, 380, '#fff2d0', 0.55 * burst + 0.1);
        rays(g, { x: cx, y: cy, count: 26, alpha: 0.55 * burst + sus, t, length: 1300 + 1100 * burst, color: '#ffd38a', width: 0.05, angle: t * 0.05 });
        rays(g, { x: cx, y: cy, count: 40, alpha: 0.5 * burst + sus * 0.8, t: t + 3, length: 1100 + 900 * burst, color: '#fff3d6', width: 0.012, angle: -t * 0.035 + 0.3 });
        g.save(); g.translate(cx, cy); g.scale(12, 0.07); glow(g, 0, 0, 130, '#fff6e0', 0.85 * burst + 0.1); g.restore();
        if (t >= T_L2) { const b = decay(t, T_L2, 3.5); glow(g, 960, L2.y + G.dy, 420, '#ffd27a', 0.45 * b); }
        // pressure rings of the two hits
        if (a < 1.7) {
          g.globalAlpha = 0.75 * G.a;
          A().shockwave(g, a, { x: cx, y: cy, scale: 2.9, color: '#ffe2a8' });
          A().shockwave(g, a - 0.07, { x: cx, y: cy, scale: 1.7, color: '#fff6e0' });
        }
        if (t >= T_L2 && t < T_L2 + 1.7) { g.globalAlpha = 0.4 * G.a; A().shockwave(g, t - T_L2, { x: 960, y: L2.y + G.dy, scale: 0.95, color: '#ffe7b8' }); }
        g.globalAlpha = G.a;
        // soft swell under «بإذن الله»
        if (t >= T_L3) glow(g, 960, L3.y + G.dy, 520, '#ffc870', 0.22 * Math.sin(Math.PI * prog(t, T_L3, 63.9)));
      }
      g.globalAlpha = 1;
    }
    // flag back light + «حفظ الله الوطن» glow
    if (t >= FLAG_IN[0]) {
      const k = flagK(t), boom = decay(t, T_BOOM, 1.8), x = FLAG.x, y = flagY(t), w = FLAG.w, h = w * 2 / 3;
      at(0.92);
      glow(g, x + w * 0.5, y + h * 0.45, w * 1.0, '#ffbf70', (0.3 + 0.25 * boom) * k);
      rays(g, { x: x + w * 0.5, y: y + h * 0.45, count: 24, alpha: (0.12 + 0.25 * decay(t, T_FLAG, 2.5) + 0.3 * boom) * k, t, length: 1500 + 500 * boom, color: '#ffe0a0', width: 0.035, spread: Math.PI * 1.3, angle: -Math.PI / 2 + 0.05 * Math.sin(t * 0.7) });
    }
    if (t >= T_FLAG - 0.1) {
      const a = Math.max(0, t - T_FLAG), al = t < T_FLAG ? prog(t, T_FLAG - 0.1, T_FLAG) : 1;
      at(1);
      glow(g, L4.x, L4.y, 620, '#ffb050', (0.22 * Math.exp(-a * 2) + 0.1 + 0.3 * decay(t, T_BOOM, 2)) * al);
      g.save(); g.translate(L4.x, L4.y); g.scale(9, 0.06); glow(g, 0, 0, 120, '#fff4dc', (0.6 * Math.exp(-a * 4) + 0.6 * decay(t, T_BOOM, 3)) * al); g.restore();
    }
    // soft bloom that the title group dissolves into (peaks on the 64.2 hit)
    const bl = 0.34 * (t < T_FLAG ? ease.inQuad(prog(t, 63.9, T_FLAG)) : decay(t, T_FLAG, 4.5));
    if (bl > 0.003) {
      g.setTransform(0.5, 0, 0, 0.5, 0, 0);
      g.fillStyle = U().radial(g, 960, 480, 1300, [[0, `rgba(255,236,196,${bl})`], [0.55, `rgba(255,200,130,${bl * 0.6})`], [1, `rgba(255,170,90,${bl * 0.3})`]]);
      g.fillRect(0, 0, W, H);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(g.canvas, 0, 0, W / 2, H / 2, 0, 0, W, H);
    ctx.restore();
  }

  // ------------------------------------------------------------------ title group (60.0 – 64.2)
  function groupXform(t) {
    const k = prog(t, T_OUT, 64.14);            // the group dissolves into the soft light bloom of 64.2
    return { a: 1 - smooth(0, 1, k), dy: -46 * ease.inCubic(k), s: 1 + 0.06 * ease.inQuad(k), glow: Math.sin(Math.PI * k) };
  }
  // slam: appears exactly on the hit frame slightly oversized, snaps down and settles with a small bounce
  function slamScale(t, c, over) {
    const a = t - c;
    if (a < 0) return 0;
    return 1 + over * Math.exp(-a * 16) - 0.03 * Math.sin(a * 18) * Math.exp(-a * 6);
  }

  function drawTitle(ctx, t, cam, G) {
    if (t < T_HIT || G.a <= 0) return;
    ctx.save();
    applyCam(ctx, cam, 1);
    ctx.translate(FOCUS.x, FOCUS.y + G.dy); ctx.scale(G.s, G.s); ctx.translate(-FOCUS.x, -FOCUS.y);
    const S = titleSpr();
    const a = t - T_HIT;
    const sc = slamScale(t, T_HIT, 0.17) * (1 + 0.03 * ease.inOutQuad(prog(t, T_HIT, T_OUT)));
    const flash = 1.7 * Math.exp(-a * 6.5) + 0.35 * decay(t, T_L2, 7) + 0.7 * G.glow;
    const bloom = 0.9 * Math.exp(-a * 3) + 0.3 + 0.07 * Math.sin(t * 2.3) + 0.18 * smooth(T_L3, 63.2, t);
    // motion smear on the impact frames: stretched ghost copies collapsing into the letters
    if (a < 0.1) {
      const k = 1 - a / 0.1;
      for (let j = 1; j <= 3; j++) drawMetal(ctx, S, TITLE.x, TITLE.y, { scale: sc * (1 + 0.09 * j * k), alpha: 0.2 * k / j * G.a });
    }
    const spec = t < 62 ? prog(t, 60.28, 61.0) : prog(t, 62.75, 63.65);          // impact gleam, then a slow reverent one
    drawMetal(ctx, S, TITLE.x, TITLE.y, { scale: sc, alpha: G.a, flash, bloom, spec, specA: t < 62 ? 1 : 0.55 });
    // star glints at the end of the gleam and at the ٧ hit
    const tl = TITLE.x - S.tw / 2 * sc + 30, tr = TITLE.x + S.tw / 2 * sc - 40;
    starGlint(ctx, tl, TITLE.y - 70, 90, Math.sin(Math.PI * prog(t, 60.9, 61.35)) * G.a, 0.2);
    starGlint(ctx, tr, TITLE.y - 80, 70, Math.sin(Math.PI * prog(t, 62.9, 63.4)) * 0.8 * G.a, 0);
    ctx.restore();
  }

  function l2Layout() {
    const w0 = l2Spr(0).tw, w2 = l2Spr(2).tw, D = L2.medR * 2, gap = 30;
    const tot = w0 + gap + D + gap + w2, right = 960 + tot / 2;
    return [right - w0 / 2, right - w0 - gap - D / 2, right - w0 - gap - D - gap - w2 / 2];
  }
  function drawMedallion(ctx, x, y, R, t, k) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    const glow = U().glow;
    // green glow
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, 0, R * 2.4, '#1FAE5B', 0.45); ctx.restore();
    // drop shadow
    ctx.fillStyle = 'rgba(10,5,0,0.55)'; ctx.beginPath(); ctx.arc(0, 6, R * 1.04, 0, TAU); ctx.fill();
    // green enamel disc
    const dg = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    dg.addColorStop(0, '#2fcf78'); dg.addColorStop(0.45, '#0d8a47'); dg.addColorStop(1, '#00451f');
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    // gold bezel
    const bg = ctx.createLinearGradient(-R, -R, R, R);
    bg.addColorStop(0, '#fff3c0'); bg.addColorStop(0.3, '#e0b048'); bg.addColorStop(0.5, '#7a5014'); bg.addColorStop(0.7, '#f2cf72'); bg.addColorStop(1, '#8a5c18');
    ctx.strokeStyle = bg; ctx.lineWidth = R * 0.12; ctx.beginPath(); ctx.arc(0, 0, R * 0.94, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,236,170,0.75)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, TAU); ctx.stroke();
    // seven gold studs on the bezel (slowly turning)
    for (let i = 0; i < 7; i++) {
      const th = -Math.PI / 2 + i * TAU / 7 + t * 0.12;
      const px = Math.cos(th) * R * 0.94, py = Math.sin(th) * R * 0.94;
      ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(px, py, R * 0.035, 0, TAU); ctx.fill();
    }
    // glossy top highlight
    const hg = ctx.createLinearGradient(0, -R, 0, 0);
    hg.addColorStop(0, 'rgba(255,255,255,0.3)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(0, -R * 0.42, R * 0.66, R * 0.4, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawL2(ctx, t, cam, G) {
    if (t < T_L2 || G.a <= 0) return;
    ctx.save();
    applyCam(ctx, cam, 1);
    ctx.translate(FOCUS.x, FOCUS.y + G.dy); ctx.scale(G.s, G.s); ctx.translate(-FOCUS.x, -FOCUS.y);
    const a = t - T_L2;
    const xs = l2Layout();
    const al = G.a;
    const flash = 1.4 * Math.exp(-a * 7) + 0.7 * G.glow;
    const bloom = 0.7 * Math.exp(-a * 3.5) + 0.22 + 0.12 * smooth(T_L3, 63.2, t);
    // words land on the hit from slightly outside and oversized; the medallion punches in with them
    const sc = slamScale(t, T_L2, 0.2);
    const side = 70 * Math.exp(-a * 16);
    if (a < 0.1) {                                     // impact smear
      const k = 1 - a / 0.1;
      for (let j = 1; j <= 2; j++) {
        drawMetal(ctx, l2Spr(0), xs[0] + side + 30 * j * k, L2.y, { scale: sc * (1 + 0.08 * j * k), alpha: 0.22 * k / j * al });
        drawMetal(ctx, l2Spr(2), xs[2] - side - 30 * j * k, L2.y, { scale: sc * (1 + 0.08 * j * k), alpha: 0.22 * k / j * al });
      }
    }
    ctx.save(); ctx.globalAlpha *= al;
    drawMedallion(ctx, xs[1], L2.y, L2.medR, t, slamScale(t, T_L2, 0.3));
    ctx.restore();
    drawMetal(ctx, l2Spr(1), xs[1], L2.y + 2, { scale: sc, alpha: al, flash: flash * 1.2, bloom: bloom * 1.1, spec: prog(t, 61.55, 62.05) });
    drawMetal(ctx, l2Spr(0), xs[0] + side, L2.y, { scale: sc, alpha: al, flash, bloom, spec: prog(t, 61.45, 62.1) });
    drawMetal(ctx, l2Spr(2), xs[2] - side, L2.y, { scale: sc, alpha: al, flash, bloom, spec: prog(t, 61.45, 62.1) });
    starGlint(ctx, xs[1] + L2.medR * 0.62, L2.y - L2.medR * 0.62, 60, Math.sin(Math.PI * prog(t, 61.25, 61.75)) * G.a, 0);
    ctx.restore();
  }

  function ornament(ctx, cx, y, inner, len, k, a) {    // thin gold rules growing outward + diamond tips
    if (k <= 0 || a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    for (const dir of [-1, 1]) {
      const x0 = cx + dir * inner, x1 = x0 + dir * len * k;
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, 'rgba(255,236,170,1)'); g.addColorStop(0.6, 'rgba(240,196,100,0.7)'); g.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = 'rgba(20,8,0,0.45)'; ctx.fillRect(Math.min(x0, x1), y + 1.5, Math.abs(x1 - x0), 3);
      ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), y - 2, Math.abs(x1 - x0), 4);
      ctx.fillStyle = '#ffe6a6';
      const dx = x0 + dir * 10;
      ctx.beginPath(); ctx.moveTo(dx - 9, y); ctx.lineTo(dx, y - 7); ctx.lineTo(dx + 9, y); ctx.lineTo(dx, y + 7); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawL3(ctx, t, cam, G) {               // «بإذن الله» — soft, reverent
    if (t < T_L3 || G.a <= 0) return;
    const S = l3Spr();
    const k = prog(t, T_L3, T_L3 + 1.1);
    ctx.save();
    applyCam(ctx, cam, 1);
    ctx.translate(FOCUS.x, FOCUS.y + G.dy); ctx.scale(G.s, G.s); ctx.translate(-FOCUS.x, -FOCUS.y);
    const y = L3.y + 16 * (1 - ease.outCubic(k));
    // soft right → left reveal through a feathered mask
    const g = scratch('l3', S.w, S.h).getContext('2d');
    g.drawImage(S.c, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    const e = ease.outQuad(k), fx = S.w * (0.98 - 1.3 * e);       // the right-most letter begins to glow in on 62.4
    const gr = g.createLinearGradient(fx - S.w * 0.3, 0, fx + S.w * 0.3, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(0, 0, S.w, S.h);
    const sc = 1 + 0.04 * (1 - ease.outCubic(k)) + 0.012 * prog(t, T_L3, T_OUT);
    ctx.globalAlpha *= G.a * Math.min(1, 0.15 + k * 2);
    // soft dark cushion under the calligraphy (legibility against the dawn glow)
    ctx.save(); ctx.translate(960, y + 4); ctx.scale(2.6, 0.62);
    ctx.fillStyle = U().radial(ctx, 0, 0, 210, [[0, 'rgba(26,10,2,0.5)'], [0.6, 'rgba(26,10,2,0.28)'], [1, 'rgba(26,10,2,0)']]);
    ctx.fillRect(-210, -210, 420, 420);
    ctx.restore();
    // gentle bloom that rises with the swell
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    U().glow(ctx, 960, y, 300, '#ffcf80', 0.16 * Math.sin(Math.PI * clamp(k * 0.8)) + 0.05);
    ctx.restore();
    ctx.drawImage(g.canvas, 0, 0, S.w, S.h, 960 - S.w / 2 * sc, y - S.h / 2 * sc, S.w * sc, S.h * sc);
    ornament(ctx, 960, y + 6, S.tw / 2 + 40, 250, ease.outCubic(prog(t, T_L3 + 0.25, T_L3 + 1.3)), 1);
    ctx.restore();
  }

  // ------------------------------------------------------------------ flag + «حفظ الله الوطن» (64.2 →)
  function drawFlag(ctx, t, cam) {
    if (t < FLAG_IN[0]) return;
    const k = flagK(t);
    ctx.save();
    applyCam(ctx, cam, 0.92);
    const x = FLAG.x, y = flagY(t), w = FLAG.w, h = w * 2 / 3;
    A().flag(ctx, t, { x, y, w, pole: true, poleLen: FLAG.poleLen, light: 1, wind: 1.05, alpha: k });
    // hoist-side sun bleed
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha *= k;
    ctx.fillStyle = U().radial(ctx, x - 20, y + h * 0.65, w * 0.42, [[0, 'rgba(255,186,110,0.32)'], [1, 'rgba(255,186,110,0)']]);
    ctx.fillRect(x - 20 - w * 0.42, y + h * 0.65 - w * 0.42, w * 0.84, w * 0.84);
    ctx.restore();
  }
  function drawL4(ctx, t, cam) {
    if (t < T_FLAG - 0.1) return;
    const S = l4Spr(), a = t - T_FLAG;
    ctx.save();
    applyCam(ctx, cam, 1);
    // soft hit: drift in from slightly larger, no hard slam
    let sc, al;
    if (t < T_FLAG) { const k = prog(t, T_FLAG - 0.1, T_FLAG); sc = lerp(1.22, 1.0, ease.inQuad(k)); al = 0.15 + 0.6 * k; }
    else { sc = 1 - 0.022 * Math.sin(a * 16) * Math.exp(-a * 6); al = 1; }
    sc *= 1 + 0.025 * ease.inOutQuad(prog(t, T_FLAG, T_END));
    const flash = t < T_FLAG ? 0.5 : 1.1 * Math.exp(-a * 5) + 0.7 * decay(t, T_BOOM, 3.2);
    const bloom = t < T_FLAG ? 0.2 : 0.6 * Math.exp(-a * 3) + 0.26 + 0.6 * decay(t, T_BOOM, 2.4);
    drawMetal(ctx, S, L4.x, L4.y, { scale: sc, alpha: al, flash, bloom, spec: t < 65.6 ? prog(t, 64.55, 65.35) : prog(t, T_BOOM, T_BOOM + 0.45), specA: 0.9 });
    ornament(ctx, L4.x, L4.y + 86, 30, 380, ease.outCubic(prog(t, T_FLAG + 0.1, T_FLAG + 0.9)), al);
    starGlint(ctx, L4.x - S.tw / 2 * sc + 20, L4.y - 50, 70, Math.sin(Math.PI * prog(t, 65.25, 65.7)), 0.15);
    starGlint(ctx, L4.x + S.tw / 2 * sc - 30, L4.y - 46, 80, Math.sin(Math.PI * prog(t, T_BOOM - 0.02, T_BOOM + 0.6)), 0);
    ctx.restore();
  }

  // ------------------------------------------------------------------ particles & grade
  function drawParticles(ctx, t, cam) {
    ctx.save();
    applyCam(ctx, cam, 1.08);
    A().embers(ctx, t, { seed: 71, count: 46, area: { x: -40, y: 260, w: W + 80, h: 860 }, color: '#ffc46a', size: 2.4, speed: 46, alpha: 0.8 });
    A().embers(ctx, t * 0.6, { seed: 72, count: 26, area: { x: -40, y: 0, w: W + 80, h: 1080 }, color: '#fff0c0', size: 1.4, speed: 24, alpha: 0.6 });
    // 60.0 burst
    sparks(ctx, t - T_HIT, { x: TITLE.x, y: TITLE.y, w: 1100, h: 180, n: 110, seed: 900, speed: 1700, life: 1.5, gravity: 620 });
    sparks(ctx, t - T_L2, { x: 960, y: L2.y, w: 420, h: 100, n: 54, seed: 940, speed: 1200, life: 1.1, gravity: 600 });
    sparks(ctx, t - T_BOOM, { x: L4.x, y: L4.y, w: 760, h: 60, n: 40, seed: 970, speed: 900, life: 1.6, gravity: 200, up: 1.2, thick: 0.8 });
    // embers rising after the boom
    if (t > T_BOOM) A().embers(ctx, t, { seed: 73, count: 40, area: { x: 300, y: 500, w: 1320, h: 560 }, color: '#ffd080', size: 2.6, speed: 90, alpha: 0.9 * clamp((t - T_BOOM) * 3) });
    ctx.restore();
  }

  function drawGrade(ctx, t) {
    // cinematic cool top
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, 360);
    g.addColorStop(0, 'rgba(8,22,44,0.34)'); g.addColorStop(1, 'rgba(8,22,44,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 360);
    ctx.restore();
    // pre-hit inhale (darken), short impact flashes, the 58.8 entry flash
    M.fill(ctx, '#000', t < T_HIT ? 0.2 * ease.inQuad(prog(t, 59.74, T_HIT)) : 0);
    const fl = 0.7 * decay(t, T_HIT, 11) + 0.22 * decay(t, T_L2, 11) + 0.2 * decay(t, T_BOOM, 6);
    if (fl > 0.004) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = U().radial(ctx, 960, 480, 1300, [[0, `rgba(255,236,196,${fl})`], [0.55, `rgba(255,200,130,${fl * 0.6})`], [1, `rgba(255,170,90,${fl * 0.3})`]]);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    const ef = 1 - ease.outCubic(prog(t, T0, T0 + 0.62));
    if (ef > 0.002) {
      M.fill(ctx, '#fff6e2', ef);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      U().glow(ctx, 960, 540, 1400, '#ffd890', ef * 0.6);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ scene
  M.registerScene({
    id: 's7_finale', start: T0, end: T_END, z: 1,
    draw(ctx, lt, t) {
      const cam = camera(t);
      const G = groupXform(t);
      drawBackground(ctx, t, cam);
      drawSun(ctx, t, cam);
      drawTrails(ctx, t, cam);
      drawJets(ctx, t, cam);
      if (t > FLY_A + 0.05 && t < 59.9) A().lensFlare(ctx, { x: SUN.x, y: SUN.y, intensity: 0.45 * Math.sin(Math.PI * prog(t, FLY_A, 59.9)) });
      drawLight(ctx, t, cam, G);
      drawFlag(ctx, t, cam);
      drawTitle(ctx, t, cam, G);
      drawL2(ctx, t, cam, G);
      drawL3(ctx, t, cam, G);
      drawL4(ctx, t, cam);
      drawParticles(ctx, t, cam);
      drawGrade(ctx, t);
    },
  });
})();
