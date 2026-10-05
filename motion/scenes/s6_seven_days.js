/*
 * S6 — Seven-day countdown · scenes/s6_seven_days.js · 42.0 – 58.8
 *
 * Seven 2.4 s beats (42.0, 44.4, 46.8, 49.2, 51.6, 54.0, 56.4). Every beat opens on an impact exactly on
 * the cue: the big Arabic-Indic numeral (0.1 s approach → contact on the cue → squash/rebound), flash,
 * camera shake, shockwave ring, sparks, anamorphic streak; day name + phase line follow within 0.6 s.
 * A persistent RTL bottom timeline (node ١ on the right … node ٧ on the left) lights node by node; its gold
 * progress fill charges into the next node and arrives exactly on each cue.
 * Background illustration per day (M.assets):
 *   ١ jets over a cloud deck · ٢ radar dish + holographic scope (night) · ٣ missile streaks onto empty hills
 *   ٤ tank column · ٥ frigate at sea + coast · ٦ helicopters + jets over the desert · ٧ Saudi flag rising, rays
 * Transitions (one per day change, all centred on the cue):
 *   1→2 whip-pan · 2→3 zoom-through the radar scope · 3→4 sword slash (frame splits) · 4→5 blast doors
 *   5→6 vertical whip · 6→7 zoom into golden light. Day 7 «النصر» = climax. 58.2–58.8 white-gold flash → S7.
 * Every frame is a pure function of t. Caches hold only t-independent content (text sprites, static plates).
 */
(function () {
  'use strict';
  const M = window.M;
  const { clamp, lerp, prog, ease, hash, noise1 } = M;
  const W = 1920, H = 1080, TAU = Math.PI * 2;
  const A = () => M.assets;
  const U = () => M.assets.util;

  // ---------------------------------------------------------------- timeline (absolute s)
  const T0 = 42.0, T_END = 58.8, BEAT = 2.4, T_WHITE = 58.2, APPROACH = 0.1;
  const CUES = [42.0, 44.4, 46.8, 49.2, 51.6, 54.0, 56.4];
  const DAYS = [
    { num: '١', name: 'اليوم الأول', phase: 'السيطرة على الأجواء' },
    { num: '٢', name: 'اليوم الثاني', phase: 'رصدُ التهديدات وتحييدها' },
    { num: '٣', name: 'اليوم الثالث', phase: 'ضرباتٌ دقيقة' },
    { num: '٤', name: 'اليوم الرابع', phase: 'تقدّمُ القوات البرية' },
    { num: '٥', name: 'اليوم الخامس', phase: 'تأمينُ الحدود والسواحل' },
    { num: '٦', name: 'اليوم السادس', phase: 'إحكامُ السيطرة' },
    { num: '٧', name: 'اليوم السابع', phase: 'النصر' },
  ];
  // TR[j]: transition from day j to day j+1, centred on CUES[j+1] (out = before the cue, in = after)
  const TR = [
    { type: 'whip', out: 0.24, in: 0.34 },
    { type: 'zoom', out: 0.27, in: 0.42 },
    { type: 'slash', out: 0.22, in: 0.42 },
    { type: 'doors', out: 0.22, in: 0.4 },
    { type: 'whipUp', out: 0.24, in: 0.34 },
    { type: 'light', out: 0.32, in: 0.7 },
  ];
  const ENTRY = { type: 'zoomEntry', in: 0.6 };   // day 1 arrives out of S5's punch-zoom flash

  // ---------------------------------------------------------------- helpers
  const dec = (x, r) => (x >= 0 ? Math.exp(-x * r) : 0);
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  const SCR = {};
  function scratch(key, w, h) {
    let c = SCR[key];
    if (!c || c.width < w || c.height < h) c = SCR[key] = mk(Math.max(w, c ? c.width : 0), Math.max(h, c ? c.height : 0));
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
    g.clearRect(0, 0, Math.min(c.width, Math.ceil(w) + 4), Math.min(c.height, Math.ceil(h) + 4));
    return c;
  }
  const glow = (ctx, x, y, r, col, a) => U().glow(ctx, x, y, r, col, a);
  function camXf(ctx, cx, cy, s, rot, dx, dy) {
    ctx.translate(cx + (dx || 0), cy + (dy || 0)); if (rot) ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-cx, -cy);
  }
  const PLATES = {};
  function plate(key, build, w = W, h = H) {
    let c = PLATES[key];
    if (!c) { c = mk(w, h); build(c.getContext('2d')); PLATES[key] = c; }
    return c;
  }

  // ---------------------------------------------------------------- metal text sprites (t-independent cache)
  function fontStr(o) { return `${o.weight || 700} ${o.size}px ${M.FONTS[o.family || 'arabic'] || o.family}`; }
  function inkMetrics(str, o) {
    const g = mk(4, 4).getContext('2d');
    g.font = fontStr(o); g.direction = /[؀-ۿ]/.test(str) ? 'rtl' : 'ltr'; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
    const m = g.measureText(str);
    return { asc: m.actualBoundingBoxAscent, desc: m.actualBoundingBoxDescent };
  }
  const SPR = {};
  // returns {c: lit sprite, m: white mask, w, h, tw}; ink is centred vertically on the canvas centre
  function metalSprite(key, str, o, pal) {
    if (SPR[key]) return SPR[key];
    const tmp = mk(4, 4).getContext('2d');
    const tw = M.measure(tmp, str, o), im = inkMetrics(str, o);
    const padX = o.size * 0.6, w = Math.ceil(tw + padX * 2), h = Math.ceil((im.asc + im.desc) + o.size * 0.9);
    const c = mk(w, h), g = c.getContext('2d');
    const cx = w / 2, by = h / 2 + (im.asc - im.desc) / 2; // alphabetic baseline so the ink is centred
    const oo = Object.assign({}, o, { baseline: 'alphabetic' });
    const T = (y, extra) => M.text(g, str, cx, y, Object.assign({}, oo, extra));
    if (pal.glow) T(by, { color: pal.glow, glow: o.size * 0.28, glowColor: pal.glow, alpha: 0.75 });
    T(by + o.size * 0.06, { color: 'rgba(0,0,0,0.8)', shadow: o.size * 0.22 });
    const depth = Math.max(3, Math.round(o.size * 0.045));
    for (let k = depth; k >= 1; k--) T(by + k, { color: k > depth * 0.5 ? pal.extrude2 : pal.extrude });
    T(by, { color: pal.outline, stroke: Math.max(3, o.size * 0.06), strokeColor: pal.outline });
    T(by - Math.max(1.5, o.size * 0.02), { color: pal.hi });
    // face (gradient metal) with an inner bevel, built on its own layer then composited
    const f = mk(w, h), fg = f.getContext('2d');
    const gr = fg.createLinearGradient(0, by - im.asc, 0, by + im.desc);
    pal.face.forEach(([k, col]) => gr.addColorStop(k, col));
    M.text(fg, str, cx, by + 0.6, Object.assign({}, oo, { color: gr }));
    const bev = Math.max(1.2, o.size * 0.016);
    // bevel bands = glyph minus its shifted copy (fills only, so overlapping glyph contours never show)
    const band = (dx, dy, col) => {
      const bc = mk(w, h), bg2 = bc.getContext('2d');
      M.text(bg2, str, cx, by + 0.6, Object.assign({}, oo, { color: '#fff' }));
      bg2.globalCompositeOperation = 'destination-out';
      M.text(bg2, str, cx + dx, by + 0.6 + dy, Object.assign({}, oo, { color: '#fff' }));
      bg2.globalCompositeOperation = 'source-in';
      bg2.fillStyle = col; bg2.fillRect(0, 0, w, h);
      return bc;
    };
    fg.globalCompositeOperation = 'source-atop';
    fg.filter = `blur(${(bev * 0.35).toFixed(2)}px)`;
    fg.drawImage(band(bev, bev, 'rgba(255,252,236,0.65)'), 0, 0);
    fg.drawImage(band(-bev, -bev, 'rgba(60,34,4,0.5)'), 0, 0);
    fg.filter = 'none';
    g.drawImage(f, 0, 0);
    const m = mk(w, h);
    M.text(m.getContext('2d'), str, cx, by + 0.6, Object.assign({}, oo, { color: '#fff' }));
    return (SPR[key] = { c, m, w, h, tw });
  }
  const GOLD = {
    extrude: '#5a3a0c', extrude2: '#2a1904', outline: '#1a0f02', hi: '#fff6d8',
    face: [[0, '#fffbe8'], [0.22, '#f8e09a'], [0.44, '#d6ae55'], [0.52, '#8c6420'], [0.58, '#c99a40'], [0.78, '#f2d27a'], [0.92, '#ffe9a8'], [1, '#a8792c']],
  };
  const SILVER = {
    extrude: '#26303a', extrude2: '#10161c', outline: '#0a0e12', hi: '#ffffff',
    face: [[0, '#ffffff'], [0.4, '#eef3f6'], [0.52, '#a9b6c0'], [0.6, '#dfe7ec'], [0.85, '#ffffff'], [1, '#c3ccd2']],
  };
  const IVORY = {
    extrude: '#0d3a22', extrude2: '#04140b', outline: '#03110a', hi: '#ffffff', glow: '#1FAE5B',
    face: [[0, '#ffffff'], [0.45, '#fbf6e6'], [0.55, '#e2d6b2'], [0.7, '#fff7dc'], [1, '#f2d27a']],
  };
  function drawSpr(ctx, S, x, y, o = {}) {
    const sc = o.scale != null ? o.scale : 1, a = o.alpha != null ? o.alpha : 1;
    if (a <= 0.002) return;
    ctx.save();
    ctx.globalAlpha *= Math.min(1, a);
    ctx.translate(x, y); ctx.scale(sc * (o.sx || 1), sc);
    ctx.drawImage(S.c, -S.w / 2, -S.h / 2);
    if (o.spec != null && o.spec > -0.2 && o.spec < 1.2) {
      // light sweep travelling right → left (reading direction), masked to the glyphs
      const bx = S.w / 2 + S.tw / 2 + 90 - o.spec * (S.tw + 180);
      const half = 34 + S.h * 0.2;
      const xa = Math.max(0, Math.floor(bx - half)), xb = Math.min(S.w, Math.ceil(bx + half));
      if (xb - xa > 2) {
        const bw = xb - xa, sp = scratch('spec', bw, S.h), g = sp.getContext('2d');
        g.drawImage(S.m, xa, 0, bw, S.h, 0, 0, bw, S.h);
        g.globalCompositeOperation = 'source-in';
        g.setTransform(1, 0, -0.35, 1, S.h * 0.175 - xa, 0);
        const bh = 26 + S.h * 0.03;
        const gr = g.createLinearGradient(bx - bh, 0, bx + bh, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,252,235,${o.specA || 0.85})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(bx - bh, 0, bh * 2, S.h);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(sp, 0, 0, bw, S.h, -S.w / 2 + xa, -S.h / 2, bw, S.h);
      }
    }
    if (o.flash > 0.004) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, a) * Math.min(1, o.flash);
      ctx.drawImage(S.m, -S.w / 2, -S.h / 2);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- layout (consistent across days; day 7 bigger)
  const LAY = { numX: 1660, numY: 392, rightX: 1452, divX: 1512, divH: 250, labelY: 262, nameY: 338, phaseY: 452, lineY: 512, cx: 1300, cy: 390 };
  const LAY7 = { numX: 1668, numY: 382, rightX: 1440, divX: 1508, divH: 330, labelY: 214, nameY: 284, phaseY: 452, lineY: 572, cx: 1300, cy: 390 };
  let TYPE = null;
  function initType() {
    if (TYPE) return;
    TYPE = DAYS.map((d, k) => {
      const big = k === 6;
      const num = metalSprite('n' + k, d.num, { size: big ? 500 : 410, family: 'arabic', weight: 900 }, GOLD);
      const name = metalSprite('d' + k, d.name, { size: big ? 86 : 92, family: 'kufi', weight: 700 }, big ? GOLD : SILVER);
      const phase = metalSprite('p' + k, d.phase, big ? { size: 190, family: 'arabic', weight: 900 } : { size: 70, family: 'arabic', weight: 900 }, big ? GOLD : IVORY);
      return { num, name, phase, L: big ? LAY7 : LAY, big };
    });
  }

  // ---------------------------------------------------------------- state machine
  function dayAt(t) { let k = 0; for (let i = 1; i < 7; i++) if (t >= CUES[i] - 1e-6) k = i; return k; }
  function stateAt(t) {
    const k = dayAt(t), b = t - CUES[k];
    if (k < 6) { const c = CUES[k + 1], T = TR[k]; if (t >= c - T.out) return { k, b, mode: 'out', T, p: clamp((t - (c - T.out)) / T.out) }; }
    const T = k === 0 ? ENTRY : TR[k - 1];
    if (b < T.in) return { k, b, mode: 'in', T, p: clamp(b / T.in) };
    return { k, b, mode: 'none' };
  }

  // =====================================================================================
  // BACKGROUNDS (each covers the full frame; b = time since the day's cue, always ≥ 0)
  // =====================================================================================

  // ---------- day 1: jets over the cloud deck (flying left, into the sun)
  function bg1(ctx, t, b) {
    ctx.save();
    A().sky(ctx, { preset: 'golden', horizonY: 600, sunX: 330, sunY: 395, sunR: 56 });
    A().lightRays(ctx, { x: 330, y: 395, count: 10, alpha: 0.11, t, length: 1500 });
    A().clouds(ctx, t, { seed: 5, count: 3, y0: 360, y1: 520, speed: -40, scale: 0.55, alpha: 0.55 });
    A().cloudDeck(ctx, t, { y: 580, tint: 'golden', speed: -420 });
    // distant pair crossing fast near the horizon (depth cue)
    for (let i = 0; i < 2; i++) {
      const x = lerp(2150, -250, (b - 0.4 - i * 0.12) / 1.6), y = 555 + i * 16;
      if (x > -200 && x < 2100) A().jet(ctx, { x, y, scale: 0.16 - i * 0.02, view: 'side', flip: true, afterburner: 0.6, t: t + i, alpha: 0.85 });
    }
    const J = [{ x: 330, y: 452, s: 0.44, ph: 2.1, v: 10 }, { x: 640, y: 548, s: 0.7, ph: 0.7, v: 22 }, { x: 1060, y: 708, s: 1.22, ph: 0, v: 48 }];
    for (const j of J) {
      const x = j.x + noise1(t * 0.9 + j.ph * 5, 31) * 14 - b * j.v, y = j.y + noise1(t * 0.8 + j.ph * 7, 37) * 9 * j.s - b * 6 * j.s;
      A().jet(ctx, { x, y, scale: j.s, view: 'side', flip: true, rot: noise1(t * 0.6 + j.ph, 41) * 0.025, afterburner: 0.8, t: t + j.ph });
    }
    // near cloud wisps rushing past + speed lines
    A().clouds(ctx, t, { seed: 12, count: 3, y0: 1010, y1: 1120, speed: -1500, scale: 1.4, alpha: 0.5 });
    A().motionStreaks(ctx, t, { dir: 'right', alpha: 0.16, count: 30, speed: 2400 });
    ctx.restore();
  }

  // ---------- day 2: radar at night + holographic scope that detects & neutralises abstract markers
  const SCOPE = { x: 470, y: 410, r: 245, w0: -2.2, om: 2.7 };
  const BLIPS = [{ bd: 0.32, rr: 0.62 }, { bd: 0.62, rr: 0.84 }, { bd: 0.95, rr: 0.42 }, { bd: 1.3, rr: 0.72 }];
  function plate2() {
    return plate('p2', (g) => {
      A().sky(g, { preset: 'night', top: '#020b12', mid: '#0b2a33', horizon: '#3f716b', haze: '#2a4e52', horizonY: 775, sunX: 520, sunR: 0, glow: 0.9, cache: false });
      for (let i = 0; i < 260; i++) {
        const x = hash(i, 601) * W, y = Math.pow(hash(i, 602), 1.5) * 720, s = 0.7 + Math.pow(hash(i, 603), 7) * 2.4;
        g.fillStyle = `rgba(220,240,255,${(0.2 + 0.7 * hash(i, 604)) * (1 - y / 900)})`; g.fillRect(x, y, s, s);
      }
      A().dunes(g, 0, { horizonY: 775, layers: 4, seed: 4, amp: 0.9, palette: { light: '#3f6463', mid: '#264240', shadow: '#0d1b1c', deep: '#060e0f', haze: '#2f5754', crest: '#9ccfbd' } });
    });
  }
  function scope(ctx, t, b) {
    const { x, y, r } = SCOPE, th = SCOPE.w0 + SCOPE.om * b;
    const on = ease.outCubic(prog(b, 0, 0.3));
    ctx.save();
    ctx.globalAlpha = on;
    // glass disc
    ctx.fillStyle = U().radial(ctx, x, y, r, [[0, 'rgba(6,40,28,0.55)'], [0.85, 'rgba(4,30,22,0.45)'], [1, 'rgba(10,60,40,0.2)']]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    // sweep wedge (conic gradient trailing the beam)
    const cg = ctx.createConicGradient(th - 1.2, x, y);
    cg.addColorStop(0, 'rgba(124,255,178,0)'); cg.addColorStop(1.2 / TAU, 'rgba(124,255,178,0.42)'); cg.addColorStop(1.2 / TAU + 0.002, 'rgba(124,255,178,0)'); cg.addColorStop(1, 'rgba(124,255,178,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(190,255,215,0.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(th) * r, y + Math.sin(th) * r); ctx.stroke();
    // rings, cross, ticks
    ctx.strokeStyle = 'rgba(124,255,178,0.38)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 1; i <= 4; i++) { ctx.moveTo(x + r * i / 4, y); ctx.arc(x, y, r * i / 4, 0, TAU); }
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(124,255,178,0.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < 72; i++) { const a = i * TAU / 72, l = i % 6 === 0 ? 16 : 7; ctx.moveTo(x + Math.cos(a) * (r + 10), y + Math.sin(a) * (r + 10)); ctx.lineTo(x + Math.cos(a) * (r + 10 + l), y + Math.sin(a) * (r + 10 + l)); }
    ctx.stroke();
    // rotating outer dashed ring
    ctx.save(); ctx.translate(x, y); ctx.rotate(-b * 0.4);
    ctx.setLineDash([22, 14]); ctx.strokeStyle = 'rgba(124,255,178,0.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r + 44, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // blips: detected when the beam passes, bracket lock, neutralised (green ring), fade to a tracked dot
    BLIPS.forEach((B, i) => {
      const a = SCOPE.w0 + SCOPE.om * B.bd, bx = x + Math.cos(a) * r * B.rr, by = y + Math.sin(a) * r * B.rr;
      const age = b - B.bd;
      if (age < 0) return;
      const lockP = ease.outCubic(prog(age, 0.05, 0.32)), neu = age - 0.42;
      const amber = neu < 0 ? 1 : Math.max(0, 1 - neu / 0.15);
      const pulse = 0.7 + 0.3 * Math.sin(age * 24);
      if (amber > 0) {
        const pin = Math.min(1, age / 0.07), ds = 8 * (1 + 0.8 * (1 - pin) + 0.4 * dec(age - 0.07, 12));
        glow(ctx, bx, by, 30 + 40 * (1 - pin), '#ffb347', 0.8 * amber * pulse * pin + 0.5 * (1 - pin));
        ctx.fillStyle = `rgba(255,190,90,${amber * (0.4 + 0.6 * pin)})`;
        ctx.beginPath(); ctx.moveTo(bx, by - ds); ctx.lineTo(bx + ds, by); ctx.lineTo(bx, by + ds); ctx.lineTo(bx - ds, by); ctx.closePath(); ctx.fill();
      }
      if (neu < 0.5) {
        const s = lerp(46, 15, lockP), al = Math.min(1, age * 8) * (neu > 0 ? Math.max(0, 1 - neu / 0.5) : 1);
        const col = neu > 0 ? `rgba(124,255,178,${al})` : `rgba(255,214,140,${al})`;
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(bx + sx * s, by + sy * (s - 7)); ctx.lineTo(bx + sx * s, by + sy * s); ctx.lineTo(bx + sx * (s - 7), by + sy * s); }
        ctx.stroke();
      }
      if (neu >= 0) {
        const rp = clamp(neu / 0.55);
        ctx.strokeStyle = `rgba(124,255,178,${0.9 * (1 - rp)})`; ctx.lineWidth = 3 * (1 - rp) + 1;
        ctx.beginPath(); ctx.arc(bx, by, 8 + 46 * ease.outCubic(rp), 0, TAU); ctx.stroke();
        glow(ctx, bx, by, 26, '#7cffb2', 0.7 * dec(neu, 4) + 0.25);
        ctx.fillStyle = 'rgba(200,255,225,0.9)'; ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, TAU); ctx.fill();
      }
      if (age > 0.05) M.text(ctx, 'TRK-0' + (i + 1), bx + 22, by - 20, { size: 15, family: 'latin', weight: 500, color: neu > 0 ? '#7CFFB2' : '#ffd68c', align: 'left', alpha: Math.min(1, (age - 0.05) * 6) * 0.9, letterSpacing: 2 });
    });
    ctx.globalCompositeOperation = 'source-over';
    M.text(ctx, 'SCAN  ' + pad2(Math.floor((b * 41) % 60)) + '.' + pad2(Math.floor((b * 977) % 100)), x - r, y + r + 52, { size: 18, family: 'latin', weight: 500, color: '#7CFFB2', align: 'left', alpha: 0.8, letterSpacing: 3 });
    const neutr = BLIPS.filter((B) => b - B.bd > 0.42).length;
    M.text(ctx, 'TRACKS ' + pad2(BLIPS.filter((B) => b >= B.bd).length) + '  ·  CLEAR ' + pad2(neutr), x + r, y + r + 52, { size: 18, family: 'latin', weight: 500, color: '#7CFFB2', align: 'right', alpha: 0.8, letterSpacing: 3 });
    ctx.restore();
  }
  function bg2(ctx, t, b) {
    ctx.save();
    ctx.drawImage(plate2(), 0, 0);
    // a few twinkling bright stars
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const x = hash(i, 611) * W, y = hash(i, 612) * 520, tw = 0.5 + 0.5 * Math.sin(t * (2 + 3 * hash(i, 613)) + i * 2.3);
      glow(ctx, x, y, 7 + 5 * hash(i, 614), '#cfe8ff', 0.5 * tw);
    }
    ctx.restore();
    // horizon glow behind the dish
    glow(ctx, 1460, 790, 520, '#4fd0a0', 0.12);
    A().radarDish(ctx, { x: 1110, y: 830, scale: 0.38, angle: t * 1.25 + 2.0, t, beam: 0.5 });
    A().radarDish(ctx, { x: 1520, y: 968, scale: 0.8, angle: t * 1.7 + 0.6, t, beam: 1 });
    scope(ctx, t, b);
    // low ground mist
    const mg = ctx.createLinearGradient(0, 820, 0, 1080);
    mg.addColorStop(0, 'rgba(60,120,110,0)'); mg.addColorStop(1, 'rgba(30,70,64,0.35)');
    ctx.fillStyle = mg; ctx.fillRect(0, 820, W, 260);
    A().scanlines(ctx, 0.06, { t });
    ctx.restore();
  }

  // ---------- day 3: precision strikes onto empty hills
  function ridgeY(x, L) {
    let v = 0, a = 1, f = L ? 0.0042 : 0.0031;
    for (let o = 0; o < 4; o++) { v += a * noise1(x * f + 3.7 * L, 55 + L * 22 + o * 13); a *= 0.5; f *= 2.13; }
    v /= 1.875;
    return L ? 708 - 92 * (0.5 + 0.5 * v) : 660 - 80 * (0.5 + 0.5 * v);
  }
  const TARGETS = [{ x: 300, L0: 0.0 }, { x: 590, L0: 0.4 }, { x: 860, L0: 0.8 }].map((T, i) => ({ x: T.x, y: ridgeY(T.x, 1) + 8, L0: T.L0, imp: T.L0 + 0.55, i }));
  function plate3() {
    return plate('p3', (g) => {
      A().sky(g, { preset: 'dusk', horizonY: 700, sunX: 250, sunY: 642, sunR: 46, cache: false });
      const hill = (L, top, bot, rim) => {
        g.beginPath(); g.moveTo(0, 820);
        for (let x = 0; x <= W; x += 8) g.lineTo(x, ridgeY(x, L));
        g.lineTo(W, 820); g.closePath();
        const gr = g.createLinearGradient(0, 560, 0, 800); gr.addColorStop(0, top); gr.addColorStop(1, bot);
        g.fillStyle = gr; g.fill();
        g.strokeStyle = rim; g.lineWidth = 2; g.beginPath();
        for (let x = 0; x <= W; x += 8) { const y = ridgeY(x, L); x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      };
      hill(0, '#8a5160', '#5e3a4a', 'rgba(255,190,140,0.35)');
      hill(1, '#5a3238', '#2e1b22', 'rgba(255,170,110,0.55)');
      const hz = g.createLinearGradient(0, 600, 0, 760); hz.addColorStop(0, 'rgba(224,120,74,0)'); hz.addColorStop(1, 'rgba(201,122,90,0.35)');
      g.fillStyle = hz; g.fillRect(0, 600, W, 160);
      A().dunes(g, 0, { horizonY: 748, layers: 3, seed: 11, palette: 'dusk', amp: 0.8 });
    });
  }
  function mPath(T) {
    const P0 = { x: 2000 + T.i * 60, y: -160 + T.i * 50 }, C = { x: T.x + 140 + 40 * T.i, y: -300 + 40 * T.i };
    return (u) => { const v = 1 - u; return { x: v * v * P0.x + 2 * v * u * C.x + u * u * T.x, y: v * v * P0.y + 2 * v * u * C.y + u * u * T.y }; };
  }
  function missileTrail(ctx, path, u, t, alpha, seed) {
    if (alpha <= 0.01 || u <= 0) return;
    const SPAN = 0.8, u0 = Math.max(0, u - SPAN), n = 24;
    const pts = []; for (let i = 0; i <= n; i++) pts.push(path(lerp(u0, u, i / n)));
    const tail = pts[0], head = pts[n];
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // billowing smoke: soft puffs anchored to fixed path parameters (no shimmer), fading toward the tail
    for (let j = 0; j < 44; j++) {
      const uj = j / 44; if (uj > u || uj < u0) continue;
      const age = (u - uj) * 1.3, p = path(uj), fade = clamp(1 - (u - uj) / SPAN);
      const r = 9 + 30 * age + 6 * hash(j, seed);
      const sx = (hash(j, seed + 1) - 0.5) * 26 * age, sy = (hash(j, seed + 2) - 0.5) * 20 * age - 14 * age;
      glow(ctx, p.x + sx, p.y + sy, r, '#e2d6cc', alpha * 0.75 * fade * Math.min(1, age * 8 + 0.3));
    }
    const line = (w, c0, c1) => {
      const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y); g.addColorStop(0, c0); g.addColorStop(1, c1);
      ctx.strokeStyle = g; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    };
    line(12, 'rgba(225,212,200,0)', `rgba(240,230,220,${0.3 * alpha})`);
    line(3, 'rgba(255,250,240,0)', `rgba(255,252,245,${0.95 * alpha})`);
    ctx.restore();
  }
  function bg3(ctx, t, b) {
    ctx.save();
    ctx.drawImage(plate3(), 0, 0);
    // precision targeting grid projected on the terrain (vanishing point on the horizon)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    for (let i = -14; i <= 14; i++) { ctx.moveTo(960 + i * 30, 700); ctx.lineTo(960 + i * 300, 1080); }
    for (let j = 0; j < 9; j++) { const y = 700 + 380 * Math.pow(((j + (b * 0.9) % 1) / 9), 1.8); ctx.moveTo(0, y); ctx.lineTo(W, y); }
    const gg = ctx.createLinearGradient(0, 700, 0, 1080); gg.addColorStop(0, 'rgba(124,255,178,0)'); gg.addColorStop(0.5, 'rgba(124,255,178,0.1)'); gg.addColorStop(1, 'rgba(124,255,178,0.16)');
    ctx.strokeStyle = gg; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
    // distant horizon flashes (empty terrain)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const tb = 1.45 + i * 0.16 + hash(i, 701) * 0.1, age = b - tb;
      if (age < 0 || age > 0.5) continue;
      const fx = 1150 + hash(i, 702) * 700, fy = ridgeY(fx, 0) + 6, a = dec(age, 7) * (0.6 + 0.4 * hash(i, 703));
      glow(ctx, fx, fy, 120, '#ffb060', a * 0.8); glow(ctx, fx, fy, 30, '#ffffff', a);
    }
    ctx.restore();
    // target reticles → missiles → impacts
    for (const T of TARGETS) {
      const age = b - T.imp, path = mPath(T), u = clamp((b - T.L0) / (T.imp - T.L0));
      // reticle
      const ra = Math.min(1, b * 5) * (age < 0 ? 1 : Math.max(0, 1 - age / 0.6));
      if (ra > 0) {
        const lockK = ease.outCubic(prog(b, T.L0 + 0.1, T.imp - 0.08));
        const s = lerp(70, 26, lockK) + (age > 0 ? 80 * ease.outCubic(clamp(age / 0.6)) : 0);
        ctx.save(); ctx.translate(T.x, T.y - 18); ctx.rotate(Math.PI / 4 + (1 - lockK) * 0.8);
        ctx.strokeStyle = age > 0 ? `rgba(242,210,122,${ra})` : `rgba(255,96,72,${ra * (0.75 + 0.25 * Math.sin(b * 30))})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(sx * s, sy * (s - 10)); ctx.lineTo(sx * s, sy * s); ctx.lineTo(sx * (s - 10), sy * s); }
        ctx.stroke();
        ctx.restore();
        M.text(ctx, 'TGT-0' + (T.i + 1), T.x + 44, T.y - 70, { size: 15, family: 'latin', weight: 500, color: age > 0 ? '#F2D27A' : '#ff8a70', align: 'left', alpha: ra * 0.9, letterSpacing: 2 });
      }
      // impact
      if (age >= 0) {
        A().explosion(ctx, age, { x: T.x, y: T.y, scale: 0.4 + 0.04 * T.i, seed: 3 + T.i });
        A().shockwave(ctx, age, { x: T.x, y: T.y + 4, scale: 0.36, ground: true });
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glow(ctx, T.x, T.y - 20, 520, '#ffb060', 0.55 * dec(age, 3.5));
        ctx.restore();
      }
      // trail + missile
      const ta = age < 0 ? 1 : Math.max(0, 1 - age / 1.4);
      if (b > T.L0) missileTrail(ctx, path, u, t, ta, 20 + T.i * 3);
      if (b > T.L0 && age < 0) {
        const p = path(u), q = path(Math.min(1, u + 0.01));
        A().missile(ctx, { x: p.x, y: p.y, angle: Math.atan2(q.y - p.y, q.x - p.x), scale: 0.5, t, flame: 1 });
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, p.x, p.y, 60, '#ffd08a', 0.6); ctx.restore();
      }
    }
    // warm atmospheric haze + embers
    A().embers(ctx, t, { seed: 3, count: 26, area: { x: 0, y: 380, w: 1300, h: 600 }, color: '#ff9a50', size: 2.4, speed: 50, alpha: 0.8 });
    ctx.restore();
  }

  // ---------- day 4: tank column advancing (facing left), world-anchored dust
  const TANKS = [
    { x0: 2060, y: 690, s: 0.27, v: 26, seed: 4 },
    { x0: 1830, y: 726, s: 0.4, v: 40, seed: 3 },
    { x0: 1560, y: 792, s: 0.62, v: 62, seed: 2 },
    { x0: 1150, y: 908, s: 0.95, v: 92, seed: 1 },
  ];
  function plate4() {
    return plate('p4', (g) => {
      A().sky(g, { preset: 'golden', horizonY: 640, sunX: 290, sunY: 520, sunR: 52, cache: false });
      A().dunes(g, 0, { horizonY: 640, layers: 5, seed: 6, palette: 'golden' });
    });
  }
  function trailDust(ctx, bNow, emit, o) {
    const dt = 1 / o.rate, life = o.life;
    const i1 = Math.floor(bNow / dt), i0 = Math.floor((bNow - life) / dt);
    for (let i = i0; i <= i1; i++) {
      const bb = i * dt, a = bNow - bb; if (a < 0 || a > life) continue;
      const k = a / life, E = emit(bb);
      const h1 = hash(i, o.seed), h2 = hash(i, o.seed + 1), h3 = hash(i, o.seed + 2);
      const x = E.x + o.vx * (0.6 + 0.8 * h1) * a * o.s + (h3 - 0.5) * 30 * o.s;
      const y = E.y - o.vy * (0.6 + 0.8 * h2) * a * o.s - 12 * o.s * Math.sqrt(a);
      const r = (14 + 20 * h3) * o.s * (0.7 + 2.6 * Math.pow(k, 0.7));
      const al = o.alpha * Math.min(1, a * 5) * Math.pow(1 - k, 1.5) * (0.6 + 0.4 * h1);
      A().drawPuff(ctx, A().puffSprite(i + o.seed * 7, o.color), x, y, r, al, h1 * TAU);
    }
  }
  function bg4(ctx, t, b) {
    ctx.save();
    ctx.drawImage(plate4(), 0, 0);
    A().lightRays(ctx, { x: 290, y: 520, count: 12, alpha: 0.08, t, length: 1400 });
    for (const T of TANKS) {
      const X = (bb) => T.x0 - T.v * bb;
      const K = T.s * 60; // px per metre
      trailDust(ctx, b, (bb) => ({ x: X(bb) + 3.4 * K, y: T.y - 0.2 * K }), { rate: T.s > 0.5 ? 12 : 8, life: 2.2, s: T.s * 1.6, vx: 30, vy: 22, alpha: 0.75, seed: 40 + T.seed * 3, color: '#e6cc9c' });
      A().tank(ctx, { x: X(b), y: T.y, scale: T.s, flip: true, t: t + T.seed * 0.37, speed: 5, turret: 0.03, backlight: 0.12 });
      if (T.s > 0.5) trailDust(ctx, b, (bb) => ({ x: X(bb) + 1.5 * K, y: T.y + 0.05 * K }), { rate: 8, life: 1.4, s: T.s * 1.1, vx: 18, vy: 8, alpha: 0.4, seed: 60 + T.seed * 3, color: '#f0d8a8' });
    }
    // heat shimmer band + floating dust motes
    const hz = ctx.createLinearGradient(0, 600, 0, 720); hz.addColorStop(0, 'rgba(255,214,150,0)'); hz.addColorStop(0.5, 'rgba(255,214,150,0.18)'); hz.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = hz; ctx.fillRect(0, 600, W, 120);
    A().embers(ctx, t, { seed: 7, count: 30, area: { x: 0, y: 450, w: W, h: 630 }, color: '#ffd9a0', size: 1.8, speed: 22, alpha: 0.55 });
    ctx.restore();
  }

  // ---------- day 5: frigate at sea, coastline, patrol perimeter
  function coastPlate() {
    return plate('coast', (g) => {
      g.beginPath(); g.moveTo(1180, 604);
      for (let x = 1180; x <= W; x += 6) {
        const k = clamp((x - 1180) / 160);
        const y = 600 - k * (22 + 26 * (0.5 + 0.5 * noise1(x * 0.012, 811)) + 14 * Math.max(0, noise1(x * 0.03, 812)));
        g.lineTo(x, y);
      }
      g.lineTo(W, 604); g.closePath();
      const gr = g.createLinearGradient(0, 540, 0, 604); gr.addColorStop(0, '#b88a74'); gr.addColorStop(1, '#8a6458');
      g.fillStyle = gr; g.fill();
      g.fillStyle = 'rgba(255,214,170,0.25)'; g.fillRect(1180, 598, W - 1180, 6);
    }, W, 620);
  }
  function bg5(ctx, t, b) {
    ctx.save();
    A().sky(ctx, { preset: 'golden', horizonY: 600, sunX: 400, sunY: 455, sunR: 55 });
    A().clouds(ctx, t, { seed: 9, count: 5, y0: 170, y1: 420, speed: 14, scale: 0.85, alpha: 0.85 });
    A().sea(ctx, t, { horizonY: 600, sunX: 400 });
    ctx.drawImage(coastPlate(), 0, 0);
    A().ship(ctx, { x: 1520 - 10 * b, y: 640, scale: 0.3, t: t + 1.3, flip: true });
    // patrol perimeter: glowing dashed line in perspective with chevrons travelling along it
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const py = (x) => 690 - x * 0.03;
    ctx.setLineDash([26, 18]); ctx.lineDashOffset = b * 90;
    ctx.strokeStyle = 'rgba(124,255,178,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, py(0)); ctx.lineTo(W, py(W)); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 6; i++) {
      const x = ((i * 340 - b * 160) % 2040 + 2040) % 2040 - 60, y = py(x);
      ctx.fillStyle = 'rgba(124,255,178,0.6)';
      ctx.beginPath(); ctx.moveTo(x - 10, y - 9); ctx.lineTo(x - 22, y); ctx.lineTo(x - 10, y + 9); ctx.lineTo(x - 4, y + 9); ctx.lineTo(x - 16, y); ctx.lineTo(x - 4, y - 9); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // hero frigate (bow left) with pulsing protective sonar rings on the water
    const sx = 940 - 26 * b, sy = 832;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const ph = ((b + i * 0.8) % 2.4) / 2.4, rx = 260 + 760 * ph;
      ctx.strokeStyle = `rgba(124,255,178,${0.38 * (1 - ph) * Math.min(1, ph * 6)})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(sx, sy + 8, rx, rx * 0.11, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    A().ship(ctx, { x: sx, y: sy, scale: 1.15, t, flip: true });
    // spray mist drifting
    A().embers(ctx, t, { seed: 11, count: 22, area: { x: 0, y: 640, w: W, h: 440 }, color: '#fff2d8', size: 1.6, speed: 18, alpha: 0.4 });
    ctx.restore();
  }

  // ---------- day 6: helicopters + jets over the desert, closing control ring
  function plate6() {
    return plate('p6', (g) => {
      A().sky(g, { preset: 'golden', top: '#18294a', horizonY: 720, sunX: 380, sunY: 612, sunR: 50, cache: false });
      A().dunes(g, 0, { horizonY: 720, layers: 4, seed: 9, palette: 'golden', amp: 0.9 });
    });
  }
  const HELIS = [
    { x0: 400, y: 300, s: 0.4, v: 70, ph: 0.4 },
    { x0: 1270, y: 668, s: 0.56, v: 48, ph: 0.9 },
    { x0: 690, y: 640, s: 0.86, v: 60, ph: 0 },
  ];
  function bg6(ctx, t, b) {
    ctx.save();
    ctx.drawImage(plate6(), 0, 0);
    A().lightRays(ctx, { x: 380, y: 612, count: 12, alpha: 0.09, t, length: 1500 });
    // high jets with contrails crossing right → left
    for (let i = 0; i < 2; i++) {
      const jb = b - 0.15 - i * 0.22, x = 2250 - 1500 * jb, y = 150 + i * 58, s = 0.4 - i * 0.06;
      if (x < -300 || x > 2400) continue;
      const tg = ctx.createLinearGradient(x, 0, x + 1400, 0);
      tg.addColorStop(0, 'rgba(255,255,255,0.75)'); tg.addColorStop(1, 'rgba(255,240,220,0)');
      ctx.strokeStyle = tg; ctx.lineWidth = 5 - i; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 90 * s / 0.4, y + 4); ctx.lineTo(x + 1400, y + 10); ctx.stroke();
      A().jet(ctx, { x, y, scale: s, view: 'side', flip: true, afterburner: 0.7, t: t + i });
    }
    // closing control ring on the ground
    const rp = ease.inOutCubic(prog(b, 0.1, 2.3));
    const rx = lerp(860, 400, rp), cx = 900, cy = 828;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(124,255,178,${0.5 * Math.min(1, b * 3)})`; ctx.lineWidth = 3;
    ctx.setLineDash([30, 16]); ctx.lineDashOffset = -b * 120;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, rx * 0.12, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(124,255,178,${0.22 * Math.min(1, b * 3)})`; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, rx * 0.12, 0, 0, TAU); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.3, ex = cx + Math.cos(a) * rx, ey = cy + Math.sin(a) * rx * 0.12, d = 18;
      ctx.fillStyle = `rgba(160,255,200,${0.7 * Math.min(1, b * 3)})`;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.atan2(cy - ey, (cx - ex) * 0.16) * 0 + (Math.cos(a) > 0 ? Math.PI : 0));
      ctx.beginPath(); ctx.moveTo(d, -d * 0.7); ctx.lineTo(0, 0); ctx.lineTo(d, d * 0.7); ctx.lineTo(d * 0.6, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // helicopters (nose left) with rotor-wash dust on the ground
    for (const Hh of HELIS) {
      const X = (bb) => Hh.x0 - Hh.v * bb;
      const gy = 900 + (Hh.s - 0.6) * 120;
      if (Hh.s > 0.5) trailDust(ctx, b, (bb) => ({ x: X(bb), y: gy }), { rate: 10, life: 1.8, s: Hh.s * 1.4, vx: 24, vy: 10, alpha: 0.35, seed: 90 + Math.round(Hh.s * 10), color: '#e8cfa0' });
      const bob = Math.sin(t * 1.6 + Hh.ph * 4) * 6 * Hh.s;
      A().helicopter(ctx, { x: X(b), y: Hh.y + bob, scale: Hh.s, flip: true, t: t + Hh.ph, tilt: 0.12 });
    }
    A().embers(ctx, t, { seed: 13, count: 24, area: { x: 0, y: 500, w: W, h: 580 }, color: '#ffd9a0', size: 1.8, speed: 26, alpha: 0.5 });
    ctx.restore();
  }

  // ---------- day 7: Saudi flag rising in golden light, rays, embers
  function plate7() {
    return plate('p7', (g) => {
      g.scale(1, (H + 100) / H);
      A().sky(g, { preset: 'golden', top: '#2a3550', mid: '#d88a44', horizon: '#ffe0a0', horizonY: 905, sunX: 720, sunY: 812, sunR: 74, glow: 1.5, cache: false });
      A().dunes(g, 0, { horizonY: 905, layers: 3, seed: 13, palette: 'golden', amp: 0.7 });
    }, W, H + 100);
  }
  function flagY(b) { return lerp(1020, 168, ease.outCubic(prog(b, 0.0, 1.5))) - 10 * b; }
  function bg7(ctx, t, b) {
    ctx.save();
    const wf = ease.inQuad(prog(t, T_WHITE, T_END));
    if (wf > 0) camXf(ctx, 960, 540, 1 + 0.08 * wf, 0, 0, 0);
    // crane up: the (taller, cached) sky plate slides down slightly while the flag rises
    const crane = 1 - ease.outCubic(prog(b, 0, 1.6));
    ctx.drawImage(plate7(), 0, Math.round(-30 - 60 * crane));
    A().lightRays(ctx, { x: 720, y: 812, count: 18, alpha: 0.3 + 0.3 * wf, t, length: 2000, color: '#ffe2a0' });
    A().clouds(ctx, t, { seed: 21, count: 6, y0: 770, y1: 900, speed: 16, scale: 1.0, alpha: 0.8 });
    const fy = flagY(b);
    A().flag(ctx, t, { x: 150, y: fy, w: 760, pole: true, poleLen: 1500, wind: 1.1 });
    A().lensFlare(ctx, { x: 720, y: 812, intensity: 0.75 + 0.4 * wf });
    A().embers(ctx, t, { seed: 17, count: 32, area: { x: 0, y: 160, w: W, h: 920 }, color: '#ffd27a', size: 2.6, speed: 60, alpha: 0.9 });
    ctx.restore();
  }

  const BG = [bg1, bg2, bg3, bg4, bg5, bg6, bg7];
  function drawBG(ctx, k, t, b) { ctx.save(); BG[k](ctx, t, b); ctx.restore(); }

  // =====================================================================================
  // TYPOGRAPHY LOCKUP (numeral · divider · label · day name · phase line · underline)
  // =====================================================================================
  function drawScrim(ctx, k, a) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(1340, 390); ctx.scale(1, 0.42);
    const big = k === 6;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 760);
    if (big) { g.addColorStop(0, 'rgba(40,18,0,0.42)'); g.addColorStop(0.6, 'rgba(40,18,0,0.2)'); g.addColorStop(1, 'rgba(40,18,0,0)'); }
    else if (k === 1) { g.addColorStop(0, 'rgba(0,6,6,0.5)'); g.addColorStop(0.6, 'rgba(0,6,6,0.26)'); g.addColorStop(1, 'rgba(0,6,6,0)'); }
    else { g.addColorStop(0, 'rgba(6,10,14,0.55)'); g.addColorStop(0.6, 'rgba(6,10,14,0.28)'); g.addColorStop(1, 'rgba(6,10,14,0)'); }
    ctx.fillStyle = g; ctx.fillRect(-760, -760, 1520, 1520);
    ctx.restore();
  }
  function numeralScale(b) {
    if (b < 0) { const q = clamp((b + APPROACH) / APPROACH); return lerp(2.7, 1, q * q); }
    return 1 - 0.1 * Math.exp(-7 * b) * Math.sin(26 * b);
  }
  // the incoming numeral during the 0.1 s before its cue (drawn above everything of the old day)
  function drawApproach(ctx, k, b) {
    const S = TYPE[k], L = S.L, q = clamp((b + APPROACH) / APPROACH);
    const s = numeralScale(b);
    ctx.save();
    for (let i = 2; i >= 1; i--) drawSpr(ctx, S.num, L.numX, L.numY, { scale: s * (1 + 0.22 * i), alpha: q * (0.32 - 0.1 * i) });
    drawSpr(ctx, S.num, L.numX, L.numY, { scale: s, alpha: q, flash: 0.45 * q });
    ctx.restore();
  }
  function drawType(ctx, k, b, t) {
    const S = TYPE[k], L = S.L, big = S.big;
    const wf = ease.inQuad(prog(t, T_WHITE, T_END));
    ctx.save();
    const s0 = 1 + 0.022 * clamp(b / BEAT) + 0.06 * wf;
    camXf(ctx, L.cx, L.cy, s0, 0, 0, 0);
    drawScrim(ctx, k, clamp(b / 0.12));
    // rays behind the lockup (impact burst; persistent on day 7)
    const rayA = big ? 0.1 + 0.22 * dec(b, 2.5) + 0.25 * wf : 0.22 * dec(b, 3.5);
    if (rayA > 0.01) A().lightRays(ctx, { x: L.numX, y: L.numY, count: big ? 16 : 14, alpha: rayA, t, length: big ? 1500 : 1100, color: '#ffe2a0', width: 0.032 });
    if (big) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, L.numX, L.numY, 380, '#ffcf70', 0.34 + 0.06 * Math.sin(t * 2.2) + 0.3 * wf); ctx.restore(); }
    // numeral
    const ns = numeralScale(b), ny = b >= 0 ? -12 * Math.exp(-6 * b) * Math.sin(22 * b) : 0;
    drawSpr(ctx, S.num, L.numX, L.numY + ny, { scale: ns, flash: dec(b, 10) * 0.4 + 0.25 * wf, spec: (b - 0.7) / 0.45, specA: 0.75 });
    // divider (grows from its centre)
    const dp = ease.outCubic(prog(b, 0.02, 0.3));
    if (dp > 0) {
      const hh = L.divH / 2 * dp;
      const g = ctx.createLinearGradient(0, L.cy - hh, 0, L.cy + hh);
      g.addColorStop(0, 'rgba(242,210,122,0)'); g.addColorStop(0.5, 'rgba(255,236,170,1)'); g.addColorStop(1, 'rgba(242,210,122,0)');
      ctx.fillStyle = g; ctx.fillRect(L.divX - 1.5, L.cy - hh, 3, hh * 2);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, L.divX, L.cy, 40, '#ffe2a0', 0.7 * dp); ctx.restore();
      ctx.save(); ctx.translate(L.divX, L.cy); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#ffe9a8'; ctx.fillRect(-6 * dp, -6 * dp, 12 * dp, 12 * dp); ctx.restore();
    }
    // HUD label (Latin, typewriter)
    const lp = prog(b, 0.22, 0.5);
    if (lp > 0) {
      const str = `DAY ${pad2(k + 1)}  /  07`;
      const n = Math.ceil(str.length * lp);
      M.text(ctx, str.slice(0, n), L.rightX, L.labelY, { size: 22, family: 'latin', weight: 500, color: big ? '#F2D27A' : '#7CFFB2', align: 'right', letterSpacing: 6, alpha: 0.9, glow: 8, glowColor: big ? 'rgba(242,210,122,0.6)' : 'rgba(124,255,178,0.5)' });
      ctx.fillStyle = big ? 'rgba(242,210,122,0.7)' : 'rgba(124,255,178,0.7)';
      ctx.fillRect(L.rightX - 250 * ease.outCubic(lp) - 230, L.labelY - 1, 200 * ease.outCubic(lp), 2);
    }
    // day name: slides in from the numeral side
    const np = ease.outCubic(prog(b, 0.08, 0.42));
    if (np > 0) drawSpr(ctx, S.name, L.rightX - S.name.tw / 2 + 90 * (1 - np), L.nameY, { alpha: np, spec: (b - 0.5) / 0.6, specA: 0.8, flash: 0.5 * (1 - np) });
    // phase line: revealed right → left with a light edge
    const pp = big ? ease.outCubic(prog(b, 0.14, 0.5)) : ease.inOutCubic(prog(b, 0.2, 0.62));
    if (pp > 0) {
      const PS = S.phase, span = PS.tw + 60, edge = L.rightX + 20 - span * pp;
      ctx.save();
      ctx.beginPath(); ctx.rect(edge, L.phaseY - PS.h / 2 - 20, L.rightX + 60 - edge, PS.h + 40); ctx.clip();
      drawSpr(ctx, PS, L.rightX - PS.tw / 2, L.phaseY + 10 * (1 - pp), { spec: (b - (big ? 0.7 : 1.0)) / 0.7, specA: 0.85, flash: big ? 0.6 * dec(b - 0.14, 3) : 0 });
      ctx.restore();
      if (pp < 1) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const eh = PS.h * 0.55;
        const g = ctx.createLinearGradient(0, L.phaseY - eh, 0, L.phaseY + eh);
        g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(0.5, 'rgba(255,250,235,0.95)'); g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = g; ctx.fillRect(edge - 2, L.phaseY - eh, 4, eh * 2);
        glow(ctx, edge, L.phaseY, eh * 0.9, '#ffe2a0', 0.7);
        ctx.restore();
      }
    }
    // underline grows right → left
    const up = ease.outCubic(prog(b, 0.32, 0.8));
    if (up > 0) {
      const len = (S.phase.tw + 40) * up;
      const g = ctx.createLinearGradient(L.rightX, 0, L.rightX - len, 0);
      g.addColorStop(0, 'rgba(255,233,168,0.95)'); g.addColorStop(1, 'rgba(242,210,122,0)');
      ctx.fillStyle = g; ctx.fillRect(L.rightX - len, L.lineY - 1.5, len, 3);
      ctx.save(); ctx.translate(L.rightX + 14, L.lineY); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#ffe9a8'; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
      ctx.fillStyle = big ? 'rgba(242,210,122,0.5)' : 'rgba(31,174,91,0.75)';
      ctx.fillRect(L.rightX - len * 0.6, L.lineY + 8, len * 0.6, 2);
    }
    ctx.restore();
    impactFX(ctx, k, b, t);
  }
  // shockwave rings, anamorphic streak, core bloom, sparks — around the numeral, right after the cue
  function impactFX(ctx, k, b, t) {
    if (b < 0 || b > 1.1) return;
    const L = TYPE[k].L, cx = L.numX, cy = L.numY, big = k === 6 ? 1.45 : 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const pr = b / 0.7;
    if (pr < 1) {
      const r = (100 + 900 * ease.outCubic(pr)) * big;
      ctx.lineWidth = 3 + 30 * (1 - pr);
      ctx.strokeStyle = `rgba(242,210,122,${0.5 * Math.pow(1 - pr, 1.5)})`;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - pr)})`;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, TAU); ctx.stroke();
    }
    const pr2 = (b - 0.08) / 0.6;
    if (pr2 > 0 && pr2 < 1) {
      ctx.lineWidth = 2; ctx.strokeStyle = `rgba(124,255,178,${0.35 * (1 - pr2)})`;
      ctx.beginPath(); ctx.arc(cx, cy, (80 + 560 * ease.outCubic(pr2)) * big, 0, TAU); ctx.stroke();
    }
    const sa = dec(b, 5) * (k === 6 ? 1.2 : 1);
    if (sa > 0.01) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(10, 0.12); glow(ctx, 0, 0, 120, '#fff2d0', 0.8 * sa); ctx.restore();
      ctx.save(); ctx.translate(cx, cy); ctx.scale(4, 0.05); glow(ctx, 0, 0, 140, '#ffffff', sa); ctx.restore();
      glow(ctx, cx, cy, 330 * big, '#ffd98a', 0.65 * sa);
    }
    // sparks (analytic, drag + gravity)
    const N = k === 6 ? 90 : 52;
    ctx.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const life = 0.35 + 0.55 * hash(i, 501 + k);
      if (b > life) continue;
      const ang = hash(i, 502 + k) * TAU, sp = (700 + 1500 * hash(i, 503 + k)) * big, dr = 3.2;
      const dist = sp / dr * (1 - Math.exp(-dr * b)), vNow = sp * Math.exp(-dr * b);
      const x = cx + Math.cos(ang) * (60 + dist), y = cy + Math.sin(ang) * (60 + dist) + 420 * b * b;
      const vx = Math.cos(ang) * vNow, vy = Math.sin(ang) * vNow + 840 * b;
      const a = Math.pow(1 - b / life, 1.2);
      ctx.strokeStyle = hash(i, 504 + k) > 0.45 ? `rgba(255,226,150,${a})` : `rgba(255,255,255,${a})`;
      ctx.lineWidth = 1.4 + 2 * hash(i, 505 + k);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * 0.03, y - vy * 0.03); ctx.stroke();
    }
    ctx.restore();
  }

  // =====================================================================================
  // TRANSITIONS
  // =====================================================================================
  function buffer() { return scratch('buf', W, H); }
  // box-filtered downsample by repeated halving (lx / ly levels in x / y) → smooth blur when stretched back
  function downsample(F, lx, ly, key) {
    let src = F, w = W, h = H;
    const n = Math.max(lx, ly);
    for (let i = 0; i < n; i++) {
      const nw = i < lx ? Math.ceil(w / 2) : w, nh = i < ly ? Math.ceil(h / 2) : h;
      const c = scratch(key + i, nw, nh);
      c.getContext('2d').drawImage(src, 0, 0, w, h, 0, 0, nw, nh);
      src = c; w = nw; h = nh;
    }
    return { c: src, w, h };
  }
  // horizontal / vertical whip: content moves by d (px) with a directional motion blur (k 0..1) + wrap-around fill
  function whipComposite(ctx, F, d, k, vertical) {
    const S = vertical ? H : W;
    const put = (img, sw, sh, o, a) => {
      ctx.globalAlpha = a;
      for (const oo of [o, o - Math.sign(o || 1) * S]) {
        if (!vertical) ctx.drawImage(img, 0, 0, sw, sh, oo, 0, W, H); else ctx.drawImage(img, 0, 0, sw, sh, 0, oo, W, H);
      }
    };
    ctx.save();
    if (k > 0.04) {
      const D = downsample(F, vertical ? 0 : 7, vertical ? 7 : 0, vertical ? 'bv' : 'bh');
      const L = 420 * k;
      put(D.c, D.w, D.h, d, 1);
      for (let j = 1; j <= 2; j++) put(D.c, D.w, D.h, d - L * j / 2, 0.42 - 0.12 * j);
    }
    const sa = Math.pow(1 - clamp(k), 2.2);
    if (sa > 0.02) put(F, W, H, d, sa);
    ctx.restore();
  }
  // radial zoom: blurred copies at increasing scale under a fading sharp layer
  function zoomComposite(ctx, F, cx, cy, s, k) {
    ctx.save();
    const base = ctx.getTransform();
    const put = (img, sw, sh, sc, a) => { ctx.setTransform(base); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy); ctx.drawImage(img, 0, 0, sw, sh, 0, 0, W, H); };
    if (k > 0.04) {
      const D = downsample(F, 4, 4, 'bz');
      put(D.c, D.w, D.h, s, 1);
      for (let j = 1; j <= 4; j++) put(D.c, D.w, D.h, s * (1 + 0.05 * j * k), 0.38 - 0.06 * j);
    }
    const sa = Math.pow(1 - clamp(k), 2.2);
    if (sa > 0.02) put(F, W, H, s, sa);
    ctx.restore();
  }
  function radialStreaks(ctx, t, cx, cy, a, seed) {
    if (a <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const ang = hash(i, seed) * TAU, ph = (hash(i, seed + 1) + t * (2 + 2 * hash(i, seed + 2))) % 1;
      const r0 = 60 + ph * 1200, len = 120 + 420 * hash(i, seed + 3);
      ctx.strokeStyle = hash(i, seed + 4) > 0.5 ? `rgba(242,210,122,${a * Math.sin(Math.PI * ph)})` : `rgba(255,255,255,${0.8 * a * Math.sin(Math.PI * ph)})`;
      ctx.lineWidth = 1 + 2.5 * hash(i, seed + 5);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); ctx.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len)); ctx.stroke();
    }
    ctx.restore();
  }
  // sword slash: a bright diagonal cut across the frame; at the cue the old frame splits along it
  const SLASH = { x0: 1330, x1: 590 };   // cut from (x0, -40) to (x1, H + 40)
  const SG = (() => { const dx = SLASH.x1 - SLASH.x0, dy = H + 80, L = Math.hypot(dx, dy); return { ux: dx / L, uy: dy / L, nx: dy / L, ny: -dx / L }; })();
  function slashLine(ctx, t, q, a) {
    if (a <= 0.01 || q <= 0) return;
    const xa = SLASH.x0, ya = -40, xb = lerp(SLASH.x0, SLASH.x1, q), yb = lerp(-40, H + 40, q);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255,200,110,${0.35 * a})`; ctx.lineWidth = 34;
    ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
    ctx.strokeStyle = `rgba(255,236,180,${0.7 * a})`; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
    if (q < 1) {
      glow(ctx, xb, yb, 140, '#ffe2a0', 0.9 * a); glow(ctx, xb, yb, 40, '#ffffff', a);
      for (let i = 0; i < 18; i++) {   // sparks thrown off the blade tip
        const ang = Math.atan2(SG.uy, SG.ux) + Math.PI + (hash(i, 951) - 0.5) * 1.6, len = 30 + 120 * hash(i, 952);
        const off = 20 + 90 * ((hash(i, 953) + t * 9) % 1);
        ctx.strokeStyle = `rgba(255,226,150,${a * (0.5 + 0.5 * hash(i, 954))})`; ctx.lineWidth = 1.5 + hash(i, 955) * 2;
        ctx.beginPath(); ctx.moveTo(xb + Math.cos(ang) * off, yb + Math.sin(ang) * off); ctx.lineTo(xb + Math.cos(ang) * (off + len), yb + Math.sin(ang) * (off + len)); ctx.stroke();
      }
    }
    ctx.restore();
  }
  // the previous day frozen at the instant of the cut: a constant image (t-independent) → cached once
  const FROZEN = {};
  function frozenPrev(k) {
    if (!FROZEN[k]) { const c = mk(W, H); drawBG(c.getContext('2d'), k - 1, CUES[k], BEAT); FROZEN[k] = c; }
    return FROZEN[k];
  }
  function slashSplit(ctx, t, F, p) {
    const gap = 1500 * ease.outCubic(p), slide = 260 * ease.outCubic(p), a = 1 - p * p;
    const half = (side) => {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(side * SG.nx * gap * 0.5 + side * SG.ux * slide, side * SG.ny * gap * 0.5 + side * SG.uy * slide);
      ctx.beginPath();
      if (side < 0) { ctx.moveTo(-400, -40); ctx.lineTo(SLASH.x0, -40); ctx.lineTo(SLASH.x1, H + 40); ctx.lineTo(-400, H + 40); }
      else { ctx.moveTo(SLASH.x0, -40); ctx.lineTo(W + 400, -40); ctx.lineTo(W + 400, H + 40); ctx.lineTo(SLASH.x1, H + 40); }
      ctx.closePath(); ctx.save(); ctx.clip(); ctx.drawImage(F, 0, 0); ctx.restore();
      // glowing cut edge
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,214,120,${0.6 * (1 - p)})`; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(SLASH.x0, -40); ctx.lineTo(SLASH.x1, H + 40); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${1 - p})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(SLASH.x0, -40); ctx.lineTo(SLASH.x1, H + 40); ctx.stroke();
      ctx.restore();
    };
    half(-1); half(1);
  }
  // blast doors: k = 0 open … 1 closed
  function doors(ctx, t, k, seamFlash) {
    if (k <= 0.001) return;
    const half = H / 2, yE = half * k;
    const door = (top) => {
      ctx.save();
      if (top) ctx.translate(0, yE - half); else { ctx.translate(0, H - yE + half); ctx.scale(1, -1); }
      // panel body (drawn in "top door" space: y 0..half, inner edge at y = half)
      const g = ctx.createLinearGradient(0, 0, 0, half);
      g.addColorStop(0, '#0c1214'); g.addColorStop(0.7, '#1f292d'); g.addColorStop(0.93, '#2e3a3e'); g.addColorStop(1, '#151c1f');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, half);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 1; i < 6; i++) ctx.fillRect(0, i * 80, W, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 1; i < 6; i++) ctx.fillRect(0, i * 80 + 3, W, 1);
      for (let x = 160; x < W; x += 320) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x, 0, 4, half - 70); }
      // hazard band at the inner edge
      ctx.save(); ctx.beginPath(); ctx.rect(0, half - 62, W, 34); ctx.clip();
      ctx.fillStyle = '#b8902e'; ctx.fillRect(0, half - 62, W, 34);
      ctx.fillStyle = '#121618';
      for (let x = -60; x < W + 60; x += 60) { ctx.beginPath(); ctx.moveTo(x, half - 28); ctx.lineTo(x + 30, half - 28); ctx.lineTo(x + 64, half - 62); ctx.lineTo(x + 34, half - 62); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      // green light strip + rivets
      ctx.fillStyle = '#1FAE5B'; ctx.fillRect(0, half - 14, W, 5);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createLinearGradient(0, half - 40, 0, half + 10);
      lg.addColorStop(0, 'rgba(31,174,91,0)'); lg.addColorStop(0.7, 'rgba(31,174,91,0.45)'); lg.addColorStop(1, 'rgba(31,174,91,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, half - 40, W, 50);
      ctx.restore();
      ctx.fillStyle = '#4a565a';
      for (let x = 40; x < W; x += 80) { ctx.beginPath(); ctx.arc(x, half - 80, 4, 0, TAU); ctx.fill(); }
      ctx.restore();
    };
    ctx.save();
    door(true); door(false);
    if (seamFlash > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.save(); ctx.translate(960, yE); ctx.scale(12, 0.1); glow(ctx, 0, 0, 160, '#fff2d0', seamFlash); ctx.restore();
      ctx.fillStyle = `rgba(255,250,235,${seamFlash})`; ctx.fillRect(0, yE - 2, W, 4);
    }
    ctx.restore();
  }

  // =====================================================================================
  // WORLD (background + typography with the day-to-day transitions)
  // =====================================================================================
  function flashAmt(k, b) {
    if (b < 0) return [0, 0];
    if (k === 0) return [0.95 * Math.exp(-b * 5.5), 0.3 * Math.exp(-b * 10)];
    if (k === 6) return [1.0 * Math.exp(-b * 3.2), 0.5 * Math.exp(-b * 7)];
    return [0.75 * Math.exp(-b * 11), 0.26 * Math.exp(-b * 15)];
  }
  function bgFlash(ctx, k, b, mul = 1) { const f = flashAmt(k, b)[0] * mul; if (f > 0.003) M.fill(ctx, '#fff4dc', f); }

  function drawWorld(ctx, t, st) {
    const { k, b } = st;
    if (st.mode === 'none') { drawBG(ctx, k, t, b); bgFlash(ctx, k, b); drawType(ctx, k, b, t); return; }
    const T = st.T, p = st.p;
    if (st.mode === 'out') {
      if (T.type === 'whip' || T.type === 'whipUp' || T.type === 'zoom') {
        const F = buffer(), g = F.getContext('2d');
        drawBG(g, k, t, b); g.save(); drawType(g, k, b, t); g.restore();
        if (T.type === 'zoom') {
          const e = ease.inCubic(p);
          zoomComposite(ctx, F, SCOPE.x, SCOPE.y, 1 + 2.4 * e, Math.min(1, p * 1.6));
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          glow(ctx, 960, 540, 900, '#7cffb2', 0.5 * e);
          ctx.restore();
          radialStreaks(ctx, t, 960, 540, 0.8 * e, 41);
          M.fill(ctx, '#eafff2', 0.55 * e * e);
        } else {
          const e = ease.inCubic(p);
          whipComposite(ctx, F, (T.type === 'whip' ? W : H) * 0.8 * e, Math.min(1, p * 1.5), T.type === 'whipUp');
          A().motionStreaks(ctx, t, { dir: T.type === 'whip' ? 'right' : 'down', alpha: 0.7 * e, count: 70, speed: 3600, width: 3 });
          M.fill(ctx, '#fff4dc', 0.3 * e * e);
        }
      } else if (T.type === 'light') {
        const e = ease.inQuad(p);
        ctx.save(); camXf(ctx, 960, 540, 1 + 0.35 * e, 0, 0, 0);
        drawBG(ctx, k, t, b); drawType(ctx, k, b, t);
        ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        A().lightRays(ctx, { x: 960, y: 540, count: 24, alpha: 0.6 * e, t, length: 1800, color: '#ffe2a0' });
        glow(ctx, 960, 540, 1100, '#ffd98a', 0.9 * e);
        ctx.restore();
        M.fill(ctx, '#fff6e0', 0.92 * e * e);
      } else if (T.type === 'slash') {
        drawBG(ctx, k, t, b);
        ctx.save(); ctx.globalAlpha = 1 - ease.inQuad(p); drawType(ctx, k, b, t); ctx.restore();
        slashLine(ctx, t, ease.inOutCubic(clamp(p / 0.85)), 1);
      } else if (T.type === 'doors') {
        drawBG(ctx, k, t, b); drawType(ctx, k, b, t);
        doors(ctx, t, ease.inCubic(p), 0);
      }
      return;
    }
    // ---- 'in': the new day's background enters; typography slams in on top
    if (T.type === 'whip' || T.type === 'whipUp' || T.type === 'zoom' || T.type === 'zoomEntry') {
      const F = buffer(), g = F.getContext('2d');
      drawBG(g, k, t, b);
      const e = 1 - ease.outCubic(p);
      if (T.type === 'zoom' || T.type === 'zoomEntry') {
        zoomComposite(ctx, F, 960, 540, 1 + (T.type === 'zoom' ? 0.6 : 0.45) * e, e * e);
        radialStreaks(ctx, t, 960, 540, 0.6 * e, T.type === 'zoom' ? 43 : 47);
      } else {
        whipComposite(ctx, F, -(T.type === 'whip' ? W : H) * 0.6 * e, e * e, T.type === 'whipUp');
        A().motionStreaks(ctx, t, { dir: T.type === 'whip' ? 'right' : 'down', alpha: 0.6 * e, count: 60, speed: 3600, width: 3 });
      }
    } else if (T.type === 'light') {
      ctx.save(); camXf(ctx, 960, 540, 1 + 0.14 * (1 - ease.outCubic(p)), 0, 0, 0);
      drawBG(ctx, k, t, b);
      ctx.restore();
    } else if (T.type === 'slash') {
      drawBG(ctx, k, t, b);
      slashSplit(ctx, t, frozenPrev(k), p);
    } else if (T.type === 'doors') {
      drawBG(ctx, k, t, b);
      const open = ease.inOutCubic(prog(b, 0.06, T.in));
      doors(ctx, t, 1 - open, 0.9 * dec(b, 9));
    }
    bgFlash(ctx, k, b, T.type === 'doors' ? 0.3 : T.type === 'slash' ? 0.6 : 1);
    drawType(ctx, k, b, t);
  }

  // =====================================================================================
  // PERSISTENT HUD: bottom timeline (RTL) + top-left readout + frame corners
  // =====================================================================================
  const TL = { y: 994, x1: 1700, x7: 220 };
  const nodeX = (f) => lerp(TL.x1, TL.x7, f / 6);
  function fillPos(t) {
    const k = dayAt(t);
    if (k >= 6) return 6;
    return k + 0.16 * ease.outQuad(prog(t, CUES[k] + 0.35, CUES[k] + 2.0)) + 0.84 * ease.inCubic(prog(t, CUES[k + 1] - 0.3, CUES[k + 1]));
  }
  function hexPath(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * TAU / 6; i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath();
  }
  function drawTimeline(ctx, t) {
    const k = dayAt(t);
    const enter = ease.outBack(prog(t, T0 + 0.02, T0 + 0.4));
    const wf = ease.inQuad(prog(t, T_WHITE, T_END));
    ctx.save();
    ctx.translate(0, (1 - enter) * 150);
    // legibility gradient
    const bg = ctx.createLinearGradient(0, 880, 0, H);
    bg.addColorStop(0, 'rgba(2,8,6,0)'); bg.addColorStop(0.55, 'rgba(2,8,6,0.5)'); bg.addColorStop(1, 'rgba(2,8,6,0.78)');
    ctx.fillStyle = bg; ctx.fillRect(-60, 880, W + 120, 260);   // overscan: the HUD layer shakes slightly
    // base track + ticks
    ctx.fillStyle = 'rgba(210,230,220,0.22)'; ctx.fillRect(TL.x7, TL.y - 1, TL.x1 - TL.x7, 2);
    ctx.fillStyle = 'rgba(210,230,220,0.28)';
    for (let i = 0; i <= 30; i++) { const x = lerp(TL.x1, TL.x7, i / 30); const tall = i % 5 === 0; ctx.fillRect(x - 1, TL.y + (tall ? 12 : 14), 2, tall ? 12 : 6); }
    // end caps
    ctx.fillStyle = 'rgba(124,255,178,0.6)';
    ctx.fillRect(TL.x1 + 46, TL.y - 10, 2, 20);
    for (let i = 0; i < 3; i++) {   // chevrons pointing in the direction of progress (right → left)
      const x = TL.x7 - 50 - i * 18, ca = 0.25 + 0.6 * Math.max(0, Math.sin(t * 5 - i * 0.9));
      ctx.strokeStyle = `rgba(242,210,122,${ca})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x + 6, TL.y - 9); ctx.lineTo(x - 3, TL.y); ctx.lineTo(x + 6, TL.y + 9); ctx.stroke();
    }
    // progress fill (charges into the next node, arriving exactly on its cue)
    const f = fillPos(t), xF = nodeX(f);
    if (f > 0.001) {
      const g = ctx.createLinearGradient(TL.x1, 0, xF, 0);
      g.addColorStop(0, '#1FAE5B'); g.addColorStop(0.7, '#C8A24A'); g.addColorStop(1, '#ffe9a8');
      ctx.fillStyle = g; ctx.fillRect(xF, TL.y - 2.5, TL.x1 - xF, 5);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(242,210,122,0.18)'; ctx.fillRect(xF, TL.y - 8, TL.x1 - xF, 16);
      const charging = f % 1 > 0.001 && f < 6;
      glow(ctx, xF, TL.y, charging ? 46 : 24, '#ffe2a0', charging ? 0.9 : 0.5);
      // travelling glint along the filled part
      const gx = lerp(TL.x1, xF, (t * 0.9) % 1);
      glow(ctx, gx, TL.y, 22, '#ffffff', 0.5);
      ctx.restore();
    }
    // day 7: a completion glint sweeps the whole track right → left
    const cg = prog(t, CUES[6] + 0.25, CUES[6] + 1.05);
    const cgx = lerp(TL.x1 + 40, TL.x7 - 40, ease.inOutQuad(cg));
    if (cg > 0 && cg < 1) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.save(); ctx.translate(cgx, TL.y); ctx.scale(3.2, 0.2); glow(ctx, 0, 0, 90, '#fff2d0', 0.9); ctx.restore();
      glow(ctx, cgx, TL.y, 50, '#ffffff', 0.8);
      ctx.restore();
    }
    // nodes
    for (let i = 0; i < 7; i++) {
      const x = nodeX(i), y = TL.y, act = i === k, past = i < k;
      const age = t - CUES[i];
      const pop = act ? 1 + 0.5 * Math.exp(-age * 9) * Math.cos(age * 22) * (age >= 0 ? 1 : 0) : 1;
      const r = (act ? 27 : 19) * pop;
      // staggered appear on entry
      const ap = ease.outBack(prog(t, T0 + 0.05 + (i * 0.035), T0 + 0.3 + i * 0.035));
      if (ap <= 0) continue;
      ctx.save(); ctx.translate(x, y); ctx.scale(ap, ap); ctx.translate(-x, -y);
      if (act) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glow(ctx, x, y, 80, '#ffd98a', 0.55 + 0.15 * Math.sin(t * 6) + 0.3 * wf);
        ctx.restore();
        // rotating dashed ring
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * 1.4);
        ctx.setLineDash([9, 7]); ctx.strokeStyle = 'rgba(255,233,168,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r + 12, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();
        hexPath(ctx, x, y, r);
        const gg = ctx.createLinearGradient(0, y - r, 0, y + r);
        gg.addColorStop(0, '#fff3c4'); gg.addColorStop(0.45, '#e2b858'); gg.addColorStop(0.55, '#a87a2a'); gg.addColorStop(1, '#f2d27a');
        ctx.fillStyle = gg; ctx.fill();
        ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = 2; ctx.stroke();
        M.text(ctx, DAYS[i].num, x, y + 2, { size: 30 * pop, family: 'arabic', weight: 900, color: '#2a1a02' });
        M.text(ctx, `DAY ${pad2(i + 1)}`, x, y - 54, { size: 17, family: 'latin', weight: 500, color: '#F2D27A', letterSpacing: 4, alpha: Math.min(1, Math.max(0, age) * 6), glow: 6, glowColor: 'rgba(242,210,122,0.6)' });
      } else if (past) {
        const gp = cg > 0 ? Math.max(0, 1 - Math.abs(cgx - x) / 120) : 0;
        if (gp > 0 || wf > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y, 60, '#ffd98a', 0.9 * gp + 0.4 * wf); ctx.restore(); }
        hexPath(ctx, x, y, r);
        ctx.fillStyle = '#006C35'; ctx.fill();
        ctx.strokeStyle = '#C8A24A'; ctx.lineWidth = 2; ctx.stroke();
        M.text(ctx, DAYS[i].num, x, y + 2, { size: 22, family: 'arabic', weight: 700, color: '#ffffff' });
      } else {
        hexPath(ctx, x, y, r);
        ctx.fillStyle = 'rgba(4,12,10,0.7)'; ctx.fill();
        ctx.strokeStyle = 'rgba(210,230,220,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
        M.text(ctx, DAYS[i].num, x, y + 2, { size: 22, family: 'arabic', weight: 700, color: 'rgba(230,240,235,0.5)' });
      }
      ctx.restore();
      // activation burst
      if (age >= 0 && age < 0.6) {
        const q = age / 0.6;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,226,150,${0.9 * (1 - q)})`; ctx.lineWidth = 3 * (1 - q) + 1;
        ctx.beginPath(); ctx.arc(x, y, 26 + 90 * ease.outCubic(q), 0, TAU); ctx.stroke();
        glow(ctx, x, y, 120, '#fff2d0', 0.8 * (1 - q));
        ctx.restore();
      }
    }
    ctx.restore();
  }
  function drawHudChrome(ctx, t) {
    const a = ease.outCubic(prog(t, T0 + 0.1, T0 + 0.5)) * (1 - prog(t, CUES[6] - 0.1, CUES[6] + 0.15));
    if (a <= 0) return;
    const k = dayAt(t);
    ctx.save();
    ctx.globalAlpha = a;
    // corner brackets
    ctx.strokeStyle = 'rgba(124,255,178,0.45)'; ctx.lineWidth = 2;
    const m = 44, l = 46;
    ctx.beginPath();
    ctx.moveTo(m, m + l); ctx.lineTo(m, m); ctx.lineTo(m + l, m);
    ctx.moveTo(W - m - l, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, m + l);
    ctx.stroke();
    // top-left readout
    const blink = Math.floor(t * 2.5) % 2 === 0;
    ctx.fillStyle = blink ? 'rgba(255,90,70,0.95)' : 'rgba(255,90,70,0.35)';
    ctx.beginPath(); ctx.arc(m + 26, m + 32, 6, 0, TAU); ctx.fill();
    M.text(ctx, 'OPERATIONAL TIMELINE', m + 42, m + 33, { size: 20, family: 'latin', weight: 500, color: '#7CFFB2', align: 'left', letterSpacing: 5, alpha: 0.85 });
    const hrs = k * 24 + Math.floor(((t - CUES[k]) / BEAT) * 24);
    const mins = Math.floor((t * 60 * 7.3) % 60), secs = Math.floor((t * 30 * 13.7) % 60);
    M.text(ctx, `D+${pad2(k + 1)}   T+${pad2(Math.min(168, hrs))}:${pad2(mins)}:${pad2(secs)}`, m + 42, m + 64, { size: 18, family: 'latin', weight: 500, color: '#d8efe2', align: 'left', letterSpacing: 4, alpha: 0.7 });
    ctx.restore();
  }

  // =====================================================================================
  // MAIN
  // =====================================================================================
  function shakeAmp(t) {
    let a = 0;
    for (let i = 0; i < 7; i++) { const x = t - CUES[i]; if (x >= 0) a += i === 6 ? 44 * Math.exp(-x * 4.5) : 26 * Math.exp(-x * 8); }
    for (const T of TARGETS) a += 10 * dec(t - CUES[2] - T.imp, 10);
    a += 10 * ease.inQuad(prog(t, T_WHITE, T_END));
    return a;
  }

  function draw(ctx, lt, t) {
    initType();
    const st = stateAt(t);
    const amp = shakeAmp(t);
    const sh = amp > 0.35 ? M.shake(t, amp, 22, 66) : { x: 0, y: 0, r: 0 };
    ctx.save();
    if (amp > 0.35) { ctx.translate(W / 2 + sh.x, H / 2 + sh.y); ctx.rotate(sh.r); ctx.scale(1 + amp * 0.0016, 1 + amp * 0.0016); ctx.translate(-W / 2, -H / 2); }
    drawWorld(ctx, t, st);
    // the next day's numeral approaching its cue
    if (st.k < 6) { const bn = t - CUES[st.k + 1]; if (bn >= -APPROACH) drawApproach(ctx, st.k + 1, bn); }
    ctx.restore();
    // top flash (light) after the typography
    const ff = flashAmt(st.k, st.b)[1];
    if (ff > 0.003) M.fill(ctx, '#fff8ea', ff);
    // HUD (reduced shake)
    ctx.save();
    if (amp > 0.35) ctx.translate(sh.x * 0.35, sh.y * 0.35);
    drawTimeline(ctx, t);
    drawHudChrome(ctx, t);
    ctx.restore();
    // 58.2 – 58.8 white-gold flash into S7
    const wf = prog(t, T_WHITE, T_END);
    if (wf > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 1300, 420, 1400, '#ffd98a', 0.9 * ease.inQuad(wf));
      ctx.restore();
      M.fill(ctx, '#fff8e8', Math.min(1, Math.pow(wf, 1.25) * 1.08));
    }
  }

  M.registerScene({ id: 's6_seven_days', start: T0, end: T_END, z: 0, draw });
})();
