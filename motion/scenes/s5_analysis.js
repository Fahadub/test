/*
 * S5 — «تحليل المشهد» · Scene analysis · 34.0 – 42.0
 *
 * High-end command-center holographic analysis table:
 *   perspective topographic terrain (generic, fictional), contour lines, elevation shading,
 *   friendly unit chevrons, advance arrows, pulsing range rings, scan beam, data columns,
 *   glitch title, indicator panel (lands on 36.0 / 37.2 / 38.4 / 39.6),
 *   verdict lock + slam (40.8) and punch-zoom into «٧» (41.4 → 42.0).
 *
 * Every frame is a pure function of t. Caches below are t-independent (terrain mesh,
 * contour segments, background plate, title sprites, text layout, glyph analysis).
 * Self-contained: does not depend on M.assets.
 */
(function () {
  'use strict';
  const M = window.M;
  const { clamp, lerp, prog, ease, hash, noise1 } = M;
  const W = 1920, H = 1080, FPS = 30;
  const T0 = 34.0;
  const T_TITLE = 34.2, T_VERDICT = 40.8, T_ZOOM = 41.4, T_END = 42.0;

  const STR = {
    title: 'تحليل المشهد',
    vLabel: 'التقدير:',
    vA: 'النصر خلال',
    seven: '٧',
    vB: 'أيام',
  };
  const IND = [
    { label: 'التفوق الجوي', val: 98, cue: 36.0 },
    { label: 'الجاهزية القتالية', val: 100, cue: 37.2 },
    { label: 'الروح المعنوية', val: 100, cue: 38.4 },
    { label: 'الإسناد اللوجستي', val: 96, cue: 39.6 },
  ];

  // ---------- small helpers ----------
  const frac = (x) => x - Math.floor(x);
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const fidx = (t) => Math.round(t * FPS);
  const after = (t, c) => t >= c - 1e-6;
  const since = (t, c) => (after(t, c) ? Math.max(0, t - c) : -1);
  const decay = (t, c, rate) => (after(t, c) ? Math.exp(-Math.max(0, t - c) * rate) : 0);
  const HUD = '124,255,178';
  const GOLD = '242,210,122';
  // boot flicker: 0 before t0, flickers during dur, then 1 (deterministic per frame)
  function boot(t, t0, dur = 0.28, seed = 1) {
    if (t < t0) return 0;
    if (t >= t0 + dur) return 1;
    const k = (t - t0) / dur;
    return hash(fidx(t), seed) > 0.32 ? 0.45 + 0.55 * k : 0.1;
  }
  function chamfer(ctx, x, y, w, h, c) {
    ctx.beginPath();
    ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath();
  }
  // L-bracket with corner at (x,y), arms going toward sign dx / dy
  function bracketPath(ctx, x, y, dx, dy, len) {
    ctx.moveTo(x + dx * len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * len);
  }
  function hudText(ctx, s, x, y, o) {
    M.text(ctx, s, x, y, Object.assign({ family: 'latin', weight: 500, size: 16, color: `rgba(${HUD},0.75)`, align: 'left' }, o));
  }

  // =====================================================================
  // TERRAIN (generic fictional relief) — cached mesh + contour segments
  // =====================================================================
  const GU = 48, GV = 32;            // render mesh vertices
  const FU = 124, FV = 86;           // contour sampling grid
  const WX = 1120, DZ = 780, YMAX = 185, BASE_Y = -46;
  const NLEV = 14;
  const HILLS = [
    // u, v, amplitude, radius
    [0.36, 0.83, 1.00, 0.085], [0.61, 0.87, 0.92, 0.075], [0.79, 0.73, 0.80, 0.07],
    [0.13, 0.66, 0.55, 0.11], [0.93, 0.45, 0.62, 0.09], [0.47, 0.56, 0.30, 0.12],
    [0.24, 0.42, 0.28, 0.07], [0.69, 0.48, 0.38, 0.065], [0.05, 0.93, 0.72, 0.12],
    [0.97, 0.93, 0.78, 0.10], [0.90, 0.13, 0.30, 0.08], [0.07, 0.24, 0.26, 0.08],
  ];
  function rawH(u, v) {
    let h = 0.03;
    for (let k = 0; k < HILLS.length; k++) {
      const c = HILLS[k]; const dx = u - c[0], dy = (v - c[1]) * 1.25;
      h += c[2] * Math.exp(-(dx * dx + dy * dy) / (c[3] * c[3]));
    }
    const rc = 0.69 + 0.2 * u + 0.035 * Math.sin(u * 11);   // long ridge across the back
    const rd = v - rc;
    h += 0.34 * Math.exp(-(rd * rd) / 0.0035) * (0.55 + 0.45 * Math.sin(u * 8 + 1.3));
    h += 0.045 * Math.sin(u * 23 + v * 7) * Math.sin(v * 19 - u * 5);  // erosion ripples
    h += 0.024 * Math.sin(u * 47 + 2.1) * Math.sin(v * 41 + 0.7);
    h *= 0.32 + 0.68 * sstep(0.04, 0.55, v);                        // flatter friendly plain in front
    return Math.max(0, h);
  }
  // colour ramp (low teal → green → pale sand-green peaks)
  const RAMP = [[0, 6, 30, 38], [0.25, 12, 70, 62], [0.5, 30, 126, 84], [0.75, 96, 184, 112], [1.0, 196, 232, 162]];
  const RAMPT = new Float32Array(65 * 3);
  for (let n = 0; n <= 64; n++) {
    const h = n / 64; let k = 0;
    while (k < RAMP.length - 2 && h > RAMP[k + 1][0]) k++;
    const a = RAMP[k], b = RAMP[k + 1], f = clamp((h - a[0]) / (b[0] - a[0]));
    RAMPT[n * 3] = lerp(a[1], b[1], f); RAMPT[n * 3 + 1] = lerp(a[2], b[2], f); RAMPT[n * 3 + 2] = lerp(a[3], b[3], f);
  }

  let TER = null;
  const MS = [[], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2], [2, 3], [0, 2], [0, 1, 2, 3], [1, 2], [1, 3], [0, 1], [3, 0], []];
  function initTerrain() {
    const fine = new Float32Array(FU * FV);
    let mx = 0;
    for (let j = 0; j < FV; j++) for (let i = 0; i < FU; i++) {
      const h = rawH(i / (FU - 1), j / (FV - 1)); fine[j * FU + i] = h; if (h > mx) mx = h;
    }
    for (let k = 0; k < fine.length; k++) fine[k] /= mx;
    const hv = new Float32Array(GU * GV);
    for (let j = 0; j < GV; j++) for (let i = 0; i < GU; i++) hv[j * GU + i] = rawH(i / (GU - 1), j / (GV - 1)) / mx;
    const nq = (GU - 1) * (GV - 1);
    const qh = new Float32Array(nq), qlam = new Float32Array(nq);
    const cx = WX / (GU - 1), cz = DZ / (GV - 1);
    let Lx = -0.62, Ly = 0.66, Lz = -0.32; const Ll = Math.hypot(Lx, Ly, Lz); Lx /= Ll; Ly /= Ll; Lz /= Ll;
    for (let j = 0; j < GV - 1; j++) for (let i = 0; i < GU - 1; i++) {
      const a = hv[j * GU + i], b = hv[j * GU + i + 1], c = hv[(j + 1) * GU + i + 1], d = hv[(j + 1) * GU + i];
      const dX = ((b + c) - (a + d)) * 0.5 * YMAX / cx;
      const dZ = ((d + c) - (a + b)) * 0.5 * YMAX / cz;
      const nl = Math.hypot(dX, 1, dZ);
      const q = j * (GU - 1) + i;
      qh[q] = (a + b + c + d) / 4;
      qlam[q] = Math.max(0, (-dX * Lx + Ly - dZ * Lz) / nl);
    }
    // contour segments (marching squares), bucketed per mesh row for painter's ordering
    const minor = Array.from({ length: GV - 1 }, () => []);
    const major = Array.from({ length: GV - 1 }, () => []);
    const ept = (e, i, j, lev, a, b, c, d) => {
      switch (e) {
        case 0: return [(i + (lev - a) / (b - a)) / (FU - 1), j / (FV - 1)];
        case 1: return [(i + 1) / (FU - 1), (j + (lev - b) / (c - b)) / (FV - 1)];
        case 2: return [(i + (lev - d) / (c - d)) / (FU - 1), (j + 1) / (FV - 1)];
        default: return [i / (FU - 1), (j + (lev - a) / (d - a)) / (FV - 1)];
      }
    };
    for (let l = 1; l < NLEV; l++) {
      const lev = l / NLEV; const isMajor = l % 3 === 0;
      for (let j = 0; j < FV - 1; j++) for (let i = 0; i < FU - 1; i++) {
        const a = fine[j * FU + i], b = fine[j * FU + i + 1], c = fine[(j + 1) * FU + i + 1], d = fine[(j + 1) * FU + i];
        const cs = (a > lev ? 1 : 0) | (b > lev ? 2 : 0) | (c > lev ? 4 : 0) | (d > lev ? 8 : 0);
        const tab = MS[cs];
        for (let s = 0; s < tab.length; s += 2) {
          const p = ept(tab[s], i, j, lev, a, b, c, d), q = ept(tab[s + 1], i, j, lev, a, b, c, d);
          const row = Math.min(GV - 2, Math.floor(((p[1] + q[1]) / 2) * (GV - 1)));
          (isMajor ? major : minor)[row].push(p[0], p[1], q[0], q[1], lev);
        }
      }
    }
    TER = {
      hv, qh, qlam,
      minor: minor.map((a) => new Float32Array(a)),
      major: major.map((a) => new Float32Array(a)),
    };
  }

  // ---------- camera ----------
  function makeCam(t) {
    const lt = t - T0;
    const th = lerp(-0.12, 0.075, ease.inOutQuad(clamp(lt / 8)));
    const phi = lerp(0.99, 0.9, ease.outCubic(clamp(lt / 6)));
    const d = lerp(1760, 1540, ease.outCubic(clamp(lt / 7.5)));
    return { c: Math.cos(th), s: Math.sin(th), sp: Math.sin(phi), cp: Math.cos(phi), d, F: 1400, cx: 660, cy: 536 };
  }
  function proj(cam, X, Y, Z) {
    const xr = X * cam.c - Z * cam.s;
    const zr = X * cam.s + Z * cam.c;
    const ry = Y - cam.d * cam.sp, rz = zr + cam.d * cam.cp;
    const zc = -ry * cam.sp + rz * cam.cp;
    const yc = ry * cam.cp + rz * cam.sp;
    const k = cam.F / zc;
    return { x: cam.cx + xr * k, y: cam.cy - yc * k, s: k };
  }
  // terrain "rise" factor per depth (wave from front to back with overshoot)
  // the build beam sweeps front→back over 34.2–34.85; terrain rises just behind it
  const BUILD0 = 34.2, BUILD_D = 0.62;
  function kAt(t, v) {
    const a = BUILD0 + v * BUILD_D;
    return t >= a + 0.7 ? 1 : ease.outBack(prog(t, a, a + 0.7));
  }
  function terrH(u, v, t) {
    const fu = clamp(u) * (GU - 1), fv = clamp(v) * (GV - 1);
    const i = Math.min(GU - 2, Math.floor(fu)), j = Math.min(GV - 2, Math.floor(fv));
    const a = fu - i, b = fv - j, hv = TER.hv;
    const h = lerp(lerp(hv[j * GU + i], hv[j * GU + i + 1], a), lerp(hv[(j + 1) * GU + i], hv[(j + 1) * GU + i + 1], a), b);
    return h * YMAX * kAt(t, v);
  }
  const P = (cam, t, u, v, lift = 0) => proj(cam, (u - 0.5) * WX, terrH(u, v, t) + lift, (v - 0.5) * DZ);
  const PX = new Float32Array(GU * GV), PY = new Float32Array(GU * GV);

  function beamV(t) {
    if (t >= BUILD0 && t < BUILD0 + BUILD_D * 1.1) return (t - BUILD0) / BUILD_D;
    if (t < 35.3) return null;
    return -0.12 + 1.3 * frac((t - 35.3) / 2.4);
  }

  // =====================================================================
  // CACHED PLATES
  // =====================================================================
  let BG = null, TITLE = null, VL = null;
  function makeBG() {
    const cw = 2112, ch = 1188;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d', { alpha: false });
    let gr = g.createLinearGradient(0, 0, 0, ch);
    gr.addColorStop(0, '#081719'); gr.addColorStop(0.45, '#040c0e'); gr.addColorStop(1, '#010304');
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
    // distant wall monitors, rendered sharp then blurred (depth of field)
    const s = document.createElement('canvas'); s.width = cw; s.height = ch; const sg = s.getContext('2d');
    const r = M.rng(5151);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 10; i++) {
      const w = 170 + r() * 50, h = 96 + r() * 40;
      const x = 16 + i * 212 + r() * 22, y = 40 + row * 160 + r() * 18;
      sg.fillStyle = `rgba(14,46,40,${0.55 + r() * 0.3})`; sg.fillRect(x, y, w, h);
      sg.strokeStyle = 'rgba(124,255,178,0.45)'; sg.lineWidth = 2; sg.strokeRect(x, y, w, h);
      const kind = r();
      sg.strokeStyle = 'rgba(124,255,178,0.5)'; sg.fillStyle = 'rgba(124,255,178,0.4)';
      if (kind < 0.33) {
        sg.beginPath(); sg.arc(x + w / 2, y + h / 2, h * 0.36, 0, Math.PI * 2); sg.stroke();
        sg.beginPath(); sg.arc(x + w / 2, y + h / 2, h * 0.2, 0, Math.PI * 2); sg.stroke();
      } else if (kind < 0.66) {
        for (let k = 0; k < 5; k++) sg.fillRect(x + 12, y + 14 + k * 16, (w - 24) * (0.3 + r() * 0.7), 5);
      } else {
        for (let k = 0; k < 9; k++) { const bh = (h - 30) * (0.2 + r() * 0.8); sg.fillRect(x + 12 + k * ((w - 24) / 9), y + h - 12 - bh, (w - 24) / 9 - 5, bh); }
      }
    }
    // ceiling light strips
    for (let i = 0; i < 6; i++) { sg.fillStyle = 'rgba(160,255,210,0.5)'; sg.fillRect(120 + i * 340, 6, 200, 6); }
    g.save(); g.filter = 'blur(8px)'; g.globalAlpha = 0.42; g.drawImage(s, 0, 0); g.restore();
    // ambient haze
    let rg = g.createRadialGradient(cw * 0.34, ch * 0.56, 0, cw * 0.34, ch * 0.56, 1000);
    rg.addColorStop(0, 'rgba(24,96,74,0.36)'); rg.addColorStop(1, 'rgba(24,96,74,0)');
    g.fillStyle = rg; g.fillRect(0, 0, cw, ch);
    rg = g.createRadialGradient(cw * 0.8, ch * 0.38, 0, cw * 0.8, ch * 0.38, 640);
    rg.addColorStop(0, 'rgba(30,86,96,0.16)'); rg.addColorStop(1, 'rgba(30,86,96,0)');
    g.fillStyle = rg; g.fillRect(0, 0, cw, ch);
    // holo-table emitter glow (under the map; BG is drawn at about (-80,-60))
    g.save(); g.translate(660 + 80, 600 + 60); g.scale(1, 0.62);
    rg = g.createRadialGradient(0, 0, 0, 0, 0, 760);
    rg.addColorStop(0, 'rgba(31,174,91,0.28)'); rg.addColorStop(0.5, 'rgba(31,174,91,0.1)'); rg.addColorStop(1, 'rgba(31,174,91,0)');
    g.fillStyle = rg; g.fillRect(-760, -760, 1520, 1520);
    g.restore();
    // fine dot matrix
    g.fillStyle = 'rgba(124,255,178,0.05)';
    for (let y = 8; y < ch; y += 24) for (let x = 8; x < cw; x += 24) g.fillRect(x, y, 2, 2);
    gr = g.createLinearGradient(0, ch * 0.7, 0, ch);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
    BG = c;

  }

  function makeTitle() {
    const o = { size: 104, family: 'kufi', weight: 700 };
    const tw = Math.ceil(M.measure(document.createElement('canvas').getContext('2d'), STR.title, o));
    const cw = tw + 120, ch = 190;
    const mk = (fn) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; fn(c.getContext('2d')); return c; };
    const main = mk((g) => {
      const gr = g.createLinearGradient(0, ch / 2 - 50, 0, ch / 2 + 50);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#dfffee'); gr.addColorStop(0.56, '#8fe8b8'); gr.addColorStop(1, '#e9fff4');
      M.text(g, STR.title, cw - 60, ch / 2, Object.assign({}, o, { align: 'right', color: gr, glow: 26, glowColor: 'rgba(31,174,91,0.95)', stroke: 2, strokeColor: 'rgba(0,60,30,0.9)' }));
    });
    const tint = (col) => mk((g) => M.text(g, STR.title, cw - 60, ch / 2, Object.assign({}, o, { align: 'right', color: col })));
    TITLE = { main, red: tint('#ff2f55'), cyan: tint('#2fe6ff'), w: cw, h: ch, tw };
  }

  // verdict layout + glyph analysis of «٧» (to know where its stroke is thickest)
  function makeVerdictLayout(ctx) {
    const parts = [
      { s: STR.vLabel, o: { size: 76, family: 'kufi', weight: 700 }, kind: 'label' },
      { s: STR.vA, o: { size: 118, family: 'arabic', weight: 900 }, kind: 'white' },
      { s: STR.seven, o: { size: 190, family: 'arabic', weight: 900 }, kind: 'seven' },
      { s: STR.vB, o: { size: 118, family: 'arabic', weight: 900 }, kind: 'white' },
    ];
    const gaps = [34, 38, 38];
    let total = 0;
    parts.forEach((p, i) => { p.w = M.measure(ctx, p.s, p.o); total += p.w + (i < gaps.length ? gaps[i] : 0); });
    let xr = total / 2;
    parts.forEach((p, i) => { p.cx = xr - p.w / 2; xr -= p.w + (i < gaps.length ? gaps[i] : 0); });
    // glyph distance transform → thickest point of the «٧» stroke
    const S = 460, ox = 230, oy = 330;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.font = `900 190px ${M.FONTS.arabic}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.direction = 'rtl';
    g.fillStyle = '#fff'; g.fillText(STR.seven, ox, oy);
    const data = g.getImageData(0, 0, S, S).data;
    const dt = new Float32Array(S * S);
    let x0 = S, x1 = 0, y0 = S, y1 = 0;
    for (let k = 0; k < S * S; k++) {
      const on = data[k * 4 + 3] > 150; dt[k] = on ? 1e9 : 0;
      if (on) { const x = k % S, y = (k / S) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const D = Math.SQRT2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = y * S + x; if (!dt[k]) continue; let v = dt[k];
      if (x > 0) v = Math.min(v, dt[k - 1] + 1);
      if (y > 0) { v = Math.min(v, dt[k - S] + 1); if (x > 0) v = Math.min(v, dt[k - S - 1] + D); if (x < S - 1) v = Math.min(v, dt[k - S + 1] + D); }
      dt[k] = v;
    }
    let best = 0, bx = ox, by = oy - 60;
    for (let y = S - 1; y >= 0; y--) for (let x = S - 1; x >= 0; x--) {
      const k = y * S + x; if (!dt[k]) continue; let v = dt[k];
      if (x < S - 1) v = Math.min(v, dt[k + 1] + 1);
      if (y < S - 1) { v = Math.min(v, dt[k + S] + 1); if (x < S - 1) v = Math.min(v, dt[k + S + 1] + D); if (x > 0) v = Math.min(v, dt[k + S - 1] + D); }
      dt[k] = v;
      if (v > best || (v === best && y > by)) { best = v; bx = x; by = y; }
    }
    if (x1 < x0) { x0 = ox - 50; x1 = ox + 50; y0 = oy - 140; y1 = oy; best = 14; }
    const seven = parts[2];
    VL = {
      parts, total, boxW: total + 200, boxH: 250,
      // relative to (seven.cx, baseline)
      tgt: { x: bx - ox, y: by - oy }, thick: Math.max(4, best),
      bbox: { x0: x0 - ox, x1: x1 - ox, y0: y0 - oy, y1: y1 - oy },
      seven,
    };
  }

  // =====================================================================
  // LAYERS
  // =====================================================================
  function drawBackground(ctx, t, cam) {
    const lt = t - T0;
    const ox = Math.round(-96 + Math.sin(lt * 0.25) * 18 - (cam.s * 160)), oy = Math.round(-54 - lt * 2);
    ctx.save(); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(BG, ox, oy);
    ctx.restore();
  }

  // ceiling light shafts (volumetric) behind the holo table
  function drawShafts(ctx, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const SH = [[260, 0.9, 150], [820, 1.0, 120], [1500, 0.7, 170]];
    SH.forEach(([x, k, w], i) => {
      const fl = 0.75 + 0.25 * noise1(t * 1.3 + i * 7, 120 + i);
      const a = 0.055 * k * fl;
      const sk = 120 + i * 40;
      const g = ctx.createLinearGradient(0, 0, 0, 900);
      g.addColorStop(0, `rgba(170,255,215,${a})`); g.addColorStop(1, 'rgba(170,255,215,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - w * 0.35, 0); ctx.lineTo(x + w * 0.35, 0); ctx.lineTo(x + w + sk, 900); ctx.lineTo(x - w + sk, 900); ctx.closePath(); ctx.fill();
    });
    ctx.restore();
  }

  // out-of-focus foreground bokeh drifting in front of everything (depth cue)
  function drawBokeh(ctx, t, cam) {
    const a0 = sstep(34.3, 34.9, t);
    if (a0 <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const r = 50 + 90 * hash(i, 951);
      const side = hash(i, 952);
      const bx = (side < 0.5 ? 40 + 420 * hash(i, 953) : 1300 + 600 * hash(i, 953)) + (t - T0) * (14 + 10 * hash(i, 954)) + cam.s * 900;
      const by = (hash(i, 955) < 0.5 ? 880 + 200 * hash(i, 956) : 20 + 160 * hash(i, 956)) + noise1(t * 0.5 + i, 957) * 20;
      const gold = hash(i, 958) > 0.7;
      const a = (0.05 + 0.06 * hash(i, 959)) * a0 * (0.8 + 0.2 * Math.sin(t * 2 + i));
      const g = ctx.createRadialGradient(bx, by, r * 0.6, bx, by, r);
      const c = gold ? GOLD : '150,255,200';
      g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(0.85, `rgba(${c},${a * 1.4})`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.fillRect(bx - r, by - r, 2 * r, 2 * r);
    }
    ctx.restore();
  }

  function drawFloor(ctx, t, cam) {
    const a = boot(t, 34.05, 0.3, 3);
    if (a <= 0) return;
    const c = proj(cam, 0, BASE_Y, 0);
    ctx.save();
    // floor grid (base plane), radial falloff
    ctx.strokeStyle = `rgba(${HUD},${0.075 * a})`; ctx.lineWidth = 1;
    ctx.beginPath();
    const Y = BASE_Y - 30, step = 80;
    for (let X = -1200; X <= 1200; X += step) {
      const p = proj(cam, X, Y, -720), q = proj(cam, X, Y, 1040); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
    }
    for (let Z = -720; Z <= 1040; Z += step) {
      const p = proj(cam, -1200, Y, Z), q = proj(cam, 1200, Y, Z); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawTerrain(ctx, t, cam) {
    const vis = sstep(34.06, 34.4, t);
    if (vis <= 0) return;
    const hv = TER.hv;
    // project mesh
    for (let j = 0; j < GV; j++) {
      const v = j / (GV - 1), kk = kAt(t, v), Z = (v - 0.5) * DZ;
      for (let i = 0; i < GU; i++) {
        const X = (i / (GU - 1) - 0.5) * WX, Y = hv[j * GU + i] * YMAX * kk;
        const xr = X * cam.c - Z * cam.s, zr = X * cam.s + Z * cam.c;
        const ry = Y - cam.d * cam.sp, rz = zr + cam.d * cam.cp;
        const zc = -ry * cam.sp + rz * cam.cp, yc = ry * cam.cp + rz * cam.sp, k = cam.F / zc;
        PX[j * GU + i] = cam.cx + xr * k; PY[j * GU + i] = cam.cy - yc * k;
      }
    }
    ctx.save();
    ctx.globalAlpha = vis;
    // dark underlay (hides AA seams between quads)
    ctx.fillStyle = '#03100f';
    ctx.beginPath();
    for (let i = 0; i < GU; i++) ctx.lineTo(PX[i], PY[i]);
    for (let j = 0; j < GV; j++) ctx.lineTo(PX[j * GU + GU - 1], PY[j * GU + GU - 1]);
    for (let i = GU - 1; i >= 0; i--) ctx.lineTo(PX[(GV - 1) * GU + i], PY[(GV - 1) * GU + i]);
    for (let j = GV - 1; j >= 0; j--) ctx.lineTo(PX[j * GU], PY[j * GU]);
    ctx.fill();

    const vs = beamV(t);
    const kAll = t >= BUILD0 + BUILD_D + 0.72;
    const projC = (u, v, lev) => {
      const X = (u - 0.5) * WX, Z = (v - 0.5) * DZ, Y = lev * YMAX * (kAll ? 1 : kAt(t, v)) + 1.5;
      const xr = X * cam.c - Z * cam.s, zr = X * cam.s + Z * cam.c;
      const ry = Y - cam.d * cam.sp, rz = zr + cam.d * cam.cp;
      const zc = -ry * cam.sp + rz * cam.cp, yc = ry * cam.cp + rz * cam.sp, k = cam.F / zc;
      return [cam.cx + xr * k, cam.cy - yc * k];
    };
    const contourA = 1;
    for (let j = GV - 2; j >= 0; j--) {
      const v = (j + 0.5) / (GV - 1);
      const kk = Math.min(1, kAt(t, v));
      const built = t >= BUILD0 + v * BUILD_D - 0.02;
      const fog = built ? 0.04 + 0.32 * v : 0.82;
      let bb = 0;
      if (vs !== null) { const dv = (v - vs) / 0.028; bb = Math.exp(-dv * dv) + (v < vs ? 0.3 * Math.exp(-(vs - v) / 0.09) : 0); }
      for (let i = 0; i < GU - 1; i++) {
        const q = j * (GU - 1) + i;
        const hh = TER.qh[q] * kk;
        const n = Math.min(64, Math.max(0, Math.round(hh * 64))) * 3;
        const sh = lerp(0.95, 0.22 + 1.25 * TER.qlam[q], kk);
        const f1 = 1 - fog;
        const r = RAMPT[n] * sh * f1 + 4 * fog + 22 * bb;
        const gg = RAMPT[n + 1] * sh * f1 + 16 * fog + 110 * bb;
        const b = RAMPT[n + 2] * sh * f1 + 18 * fog + 76 * bb;
        ctx.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
        const a = j * GU + i;
        ctx.beginPath();
        ctx.moveTo(PX[a], PY[a]); ctx.lineTo(PX[a + 1], PY[a + 1]);
        ctx.lineTo(PX[a + GU + 1], PY[a + GU + 1]); ctx.lineTo(PX[a + GU], PY[a + GU]);
        ctx.closePath(); ctx.fill();
      }
      // mesh grid lines of this row
      ctx.strokeStyle = `rgba(${HUD},${built ? 0.1 + 0.25 * bb : 0.26})`; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < GU; i += 3) { const a = j * GU + i; ctx.moveTo(PX[a], PY[a]); ctx.lineTo(PX[a + GU], PY[a + GU]); }
      if (j % 3 === 0) { const a = j * GU; ctx.moveTo(PX[a], PY[a]); for (let i = 1; i < GU; i++) ctx.lineTo(PX[a + i], PY[a + i]); }
      ctx.stroke();
      // contour lines of this row
      if (contourA > 0 && built) {
        for (let pass = 0; pass < 2; pass++) {
          const segs = pass ? TER.major[j] : TER.minor[j];
          if (!segs.length) continue;
          ctx.beginPath();
          for (let s = 0; s < segs.length; s += 5) {
            const a = projC(segs[s], segs[s + 1], segs[s + 4]), b = projC(segs[s + 2], segs[s + 3], segs[s + 4]);
            ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
          }
          const boost = Math.min(1, bb);
          if (pass) {
            ctx.strokeStyle = `rgba(${HUD},${(0.16 + 0.2 * boost) * contourA})`; ctx.lineWidth = 4.5; ctx.stroke();
            ctx.strokeStyle = `rgba(190,255,215,${(0.78 + 0.22 * boost) * contourA})`; ctx.lineWidth = 1.7; ctx.stroke();
          } else {
            ctx.strokeStyle = `rgba(${HUD},${(0.36 + 0.5 * boost) * contourA})`; ctx.lineWidth = 1.05; ctx.stroke();
          }
        }
      }
    }
    // front skirt (cross-section of the slab)
    const fr = [], bs = [];
    for (let i = 0; i < GU; i++) {
      fr.push([PX[i], PY[i]]);
      const p = proj(cam, (i / (GU - 1) - 0.5) * WX, BASE_Y, -0.5 * DZ); bs.push([p.x, p.y]);
    }
    let minY = 1e9, maxY = -1e9;
    fr.forEach((p) => { minY = Math.min(minY, p[1]); });
    bs.forEach((p) => { maxY = Math.max(maxY, p[1]); });
    let g = ctx.createLinearGradient(0, minY, 0, maxY);
    g.addColorStop(0, 'rgba(31,174,91,0.42)'); g.addColorStop(0.45, 'rgba(10,64,44,0.5)'); g.addColorStop(1, 'rgba(4,26,22,0.3)');
    ctx.fillStyle = g;
    ctx.beginPath(); fr.forEach((p) => ctx.lineTo(p[0], p[1])); for (let i = bs.length - 1; i >= 0; i--) ctx.lineTo(bs[i][0], bs[i][1]); ctx.closePath(); ctx.fill();
    // strata lines on the skirt
    ctx.strokeStyle = `rgba(${HUD},0.22)`; ctx.lineWidth = 1;
    for (let s = 1; s <= 3; s++) {
      const k = s / 4; ctx.beginPath();
      for (let i = 0; i < GU; i++) ctx.lineTo(lerp(fr[i][0], bs[i][0], k), lerp(fr[i][1], bs[i][1], k));
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${HUD},0.65)`; ctx.lineWidth = 1.6;
    ctx.beginPath(); bs.forEach((p) => ctx.lineTo(p[0], p[1])); ctx.stroke();
    // perimeter glow
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    for (let i = 0; i < GU; i++) ctx.lineTo(PX[i], PY[i]);
    for (let j = 0; j < GV; j++) ctx.lineTo(PX[j * GU + GU - 1], PY[j * GU + GU - 1]);
    for (let i = GU - 1; i >= 0; i--) ctx.lineTo(PX[(GV - 1) * GU + i], PY[(GV - 1) * GU + i]);
    for (let j = GV - 1; j >= 0; j--) ctx.lineTo(PX[j * GU], PY[j * GU]);
    ctx.closePath();
    ctx.strokeStyle = `rgba(${HUD},0.18)`; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = `rgba(${HUD},0.7)`; ctx.lineWidth = 1.6; ctx.stroke();
    // scan beam: bright line hugging the terrain + light curtain above it
    if (vs !== null && vs > -0.02 && vs < 1.02) {
      const pts = [];
      for (let n = 0; n <= 48; n++) { const p = P(cam, t, n / 48, clamp(vs), 2); pts.push(p); }
      const ga = sstep(-0.02, 0.06, vs) * (1 - sstep(0.94, 1.02, vs));
      ctx.beginPath(); pts.forEach((p) => ctx.lineTo(p.x, p.y));
      for (let n = pts.length - 1; n >= 0; n--) ctx.lineTo(pts[n].x, pts[n].y - 150 * pts[n].s);
      ctx.closePath();
      const my = pts[24].y;
      g = ctx.createLinearGradient(0, my, 0, my - 160);
      g.addColorStop(0, `rgba(${HUD},${0.22 * ga})`); g.addColorStop(1, `rgba(${HUD},0)`);
      ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); pts.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = `rgba(${HUD},${0.35 * ga})`; ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = `rgba(220,255,235,${0.95 * ga})`; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- tactical overlays ----------
  const UNITS = [
    { u: 0.2, v: 0.15, id: 'A-01', arrow: 0 }, { u: 0.33, v: 0.11, id: 'A-02', arrow: 0 },
    { u: 0.5, v: 0.12, id: 'B-01', arrow: 1 }, { u: 0.64, v: 0.15, id: 'B-02', arrow: 1 },
    { u: 0.8, v: 0.2, id: 'C-01', arrow: 2 },
  ];
  const ARROWS = [
    { p0: [0.25, 0.22], p1: [0.2, 0.55], p2: [0.33, 0.75], obj: [0.36, 0.83], t0: 35.15, id: 'OBJ-1' },
    { p0: [0.55, 0.22], p1: [0.5, 0.52], p2: [0.6, 0.78], obj: [0.61, 0.87], t0: 35.45, id: 'OBJ-2' },
    { p0: [0.79, 0.28], p1: [0.9, 0.5], p2: [0.79, 0.65], obj: [0.79, 0.73], t0: 35.75, id: 'OBJ-3' },
  ];
  const LOGI = { u: 0.47, v: 0.02 };
  const JETS = [
    { ph: 0.0, dur: 3.9, alt: 230, path: (s) => [lerp(-0.15, 1.15, s), 0.3 + 0.42 * s + 0.05 * Math.sin(s * 6)] },
    { ph: 2.1, dur: 4.4, alt: 270, path: (s) => [lerp(1.15, -0.15, s), 0.62 - 0.16 * s + 0.05 * Math.sin(s * 5 + 1)] },
    { ph: 1.0, dur: 5.0, alt: 250, path: (s) => [0.12 + 0.2 * s, lerp(-0.15, 1.15, s)] },
  ];
  const bez = (A, s) => {
    const m = 1 - s;
    return [m * m * A.p0[0] + 2 * m * s * A.p1[0] + s * s * A.p2[0], m * m * A.p0[1] + 2 * m * s * A.p1[1] + s * s * A.p2[1]];
  };
  const bezD = (A, s) => {
    const m = 1 - s;
    return [2 * m * (A.p1[0] - A.p0[0]) + 2 * s * (A.p2[0] - A.p1[0]), 2 * m * (A.p1[1] - A.p0[1]) + 2 * s * (A.p2[1] - A.p1[1])];
  };

  function ringOnTerrain(ctx, cam, t, cu, cv, rW, lift = 4, n = 56, a0 = 0, a1 = Math.PI * 2) {
    ctx.beginPath();
    for (let k = 0; k <= n; k++) {
      const a = a0 + (a1 - a0) * (k / n);
      const p = P(cam, t, cu + (Math.cos(a) * rW) / WX, cv + (Math.sin(a) * rW) / DZ, lift);
      if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    }
  }

  function drawRings(ctx, t, cam) {
    const a0 = sstep(35.0, 35.4, t);
    if (a0 <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hitR = decay(t, IND[1].cue, 3.2);
    // big coverage ring around the centre group (rotating dashes)
    ctx.setLineDash([18, 12]); ctx.lineDashOffset = -t * 40;
    ringOnTerrain(ctx, cam, t, 0.5, 0.25, 190 * a0, 6, 80);
    ctx.strokeStyle = `rgba(${HUD},${0.5 * a0})`; ctx.lineWidth = 2; ctx.stroke();
    ctx.setLineDash([4, 10]); ctx.lineDashOffset = t * 30;
    ringOnTerrain(ctx, cam, t, 0.5, 0.25, 120 * a0, 6, 64);
    ctx.strokeStyle = `rgba(${HUD},${0.4 * a0})`; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.setLineDash([]);
    // pulse waves (beat = 0.6s) from each unit
    for (let u = 0; u < UNITS.length; u++) {
      const U = UNITS[u];
      const pos = unitPos(U, t);
      for (let w = 0; w < 2; w++) {
        const ph = frac((t - 35.0) / 1.2 + w * 0.5 + u * 0.13);
        const r = 18 + ph * 80;
        ringOnTerrain(ctx, cam, t, pos[0], pos[1], r, 3, 32);
        ctx.strokeStyle = `rgba(${HUD},${(1 - ph) * 0.5 * a0})`; ctx.lineWidth = 1.6; ctx.stroke();
      }
      if (hitR > 0) {
        const k = 1 - hitR;
        ringOnTerrain(ctx, cam, t, pos[0], pos[1], 26 + k * 170, 3, 48);
        ctx.strokeStyle = `rgba(230,255,240,${hitR * 0.9})`; ctx.lineWidth = 3; ctx.stroke();
      }
    }
    ctx.restore();
  }

  function unitPos(U, t) {
    const A = ARROWS[U.arrow];
    const adv = 0.05 * ease.inOutQuad(prog(t, 35.6, 41.0));
    const d = bezD(A, 0.05); const l = Math.hypot(d[0], d[1]);
    return [U.u + (d[0] / l) * adv, U.v + (d[1] / l) * adv];
  }

  function drawArrows(ctx, t, cam) {
    const flash = decay(t, IND[2].cue, 3.5);
    ctx.save();
    ARROWS.forEach((A, idx) => {
      const g = ease.inOutCubic(prog(t, A.t0, A.t0 + 1.25));
      if (g <= 0) return;
      const N = 40, sEnd = g, headS = Math.min(0.12, sEnd * 0.5);
      const sBody = sEnd - headS;
      const L = [], R = [], C = [];
      const width = (s) => 22 * (0.45 + 0.55 * clamp(s / Math.max(0.01, sEnd)));
      const edge = (s, w) => {
        const p = bez(A, s), d = bezD(A, s);
        let tx = d[0] * WX, tz = d[1] * DZ; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const nx = -tz, nz = tx;
        const lu = p[0] + (nx * w) / WX, lv = p[1] + (nz * w) / DZ, ru = p[0] - (nx * w) / WX, rv = p[1] - (nz * w) / DZ;
        return [P(cam, t, lu, lv, 5), P(cam, t, ru, rv, 5), P(cam, t, p[0], p[1], 5)];
      };
      for (let k = 0; k <= N; k++) {
        const s = (sBody * k) / N; const e = edge(s, width(s)); L.push(e[0]); R.push(e[1]); C.push(e[2]);
      }
      const hb = edge(sBody, width(sBody) * 2.0);
      const tip = P(cam, t, ...bez(A, sEnd), 5);
      const tail = C[0];
      const gold = flash;
      const col = (a) => (gold > 0.02 ? `rgba(${Math.round(lerp(124, 242, gold))},${Math.round(lerp(255, 210, gold))},${Math.round(lerp(178, 122, gold))},${a})` : `rgba(${HUD},${a})`);
      // ribbon body
      const gr = ctx.createLinearGradient(tail.x, tail.y, tip.x, tip.y);
      gr.addColorStop(0, col(0.04)); gr.addColorStop(0.7, col(0.32 + 0.3 * gold)); gr.addColorStop(1, col(0.55 + 0.35 * gold));
      ctx.fillStyle = gr;
      ctx.beginPath();
      L.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(hb[0].x, hb[0].y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(hb[1].x, hb[1].y);
      for (let k = R.length - 1; k >= 0; k--) ctx.lineTo(R[k].x, R[k].y);
      ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = gr; ctx.lineWidth = 2; ctx.stroke();
      // arrow head (solid)
      ctx.beginPath(); ctx.moveTo(hb[0].x, hb[0].y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(hb[1].x, hb[1].y);
      const lastL = L[L.length - 1], lastR = R[R.length - 1];
      ctx.lineTo(lastR.x, lastR.y); ctx.lineTo(lastL.x, lastL.y); ctx.closePath();
      ctx.globalCompositeOperation = 'source-over';
      const hg = ctx.createLinearGradient(lastL.x, lastL.y, tip.x, tip.y);
      if (gold > 0.02) { hg.addColorStop(0, `rgba(200,162,74,${0.6 + 0.3 * gold})`); hg.addColorStop(1, `rgba(255,236,170,${0.95})`); }
      else { hg.addColorStop(0, 'rgba(0,108,53,0.75)'); hg.addColorStop(0.55, 'rgba(31,174,91,0.9)'); hg.addColorStop(1, 'rgba(150,255,195,0.95)'); }
      ctx.fillStyle = hg; ctx.fill();
      ctx.strokeStyle = gold > 0.02 ? 'rgba(255,244,214,0.9)' : 'rgba(190,255,215,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      // flowing chevrons inside the ribbon
      if (g > 0.3) {
        ctx.strokeStyle = col(0.85); ctx.lineWidth = 2.2;
        for (let c = 0; c < 6; c++) {
          const s = frac(c / 6 + (t - A.t0) * 0.45) * sBody;
          if (s < 0.04 || s > sBody - 0.02) continue;
          const e0 = edge(s, width(s) * 0.7), ef = edge(Math.min(sBody, s + 0.025), 0);
          ctx.beginPath(); ctx.moveTo(e0[0].x, e0[0].y); ctx.lineTo(ef[2].x, ef[2].y); ctx.lineTo(e0[1].x, e0[1].y); ctx.stroke();
        }
      }
      // tip glow while growing
      const tg = (g < 1 ? 1 : 0.35) + gold;
      const rg = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 60);
      rg.addColorStop(0, col(0.5 * tg)); rg.addColorStop(1, col(0));
      ctx.fillStyle = rg; ctx.fillRect(tip.x - 60, tip.y - 60, 120, 120);
      ctx.globalCompositeOperation = 'source-over';
    });
    ctx.restore();
  }

  function drawObjectives(ctx, t, cam) {
    ctx.save();
    ARROWS.forEach((A, idx) => {
      const a = sstep(A.t0 + 0.9, A.t0 + 1.3, t);
      if (a <= 0) return;
      const [u, v] = A.obj;
      ctx.globalCompositeOperation = 'lighter';
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = t * 26 * (idx % 2 ? 1 : -1);
      ringOnTerrain(ctx, cam, t, u, v, 64 - 12 * Math.sin(t * 5 + idx), 4, 40);
      ctx.strokeStyle = `rgba(${GOLD},${0.7 * a})`; ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([]);
      const g = P(cam, t, u, v, 4), top = P(cam, t, u, v, 92);
      ctx.strokeStyle = `rgba(${GOLD},${0.6 * a})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(top.x, top.y + 14); ctx.stroke();
      // floating diamond marker
      const sz = 15 * (1 + 0.08 * Math.sin(t * 6 + idx)) * (0.6 + 0.4 * ease.outBack(sstep(A.t0 + 0.9, A.t0 + 1.25, t)));
      ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(top.x, top.y); ctx.rotate(Math.PI / 4);
      ctx.shadowColor = `rgba(${GOLD},0.9)`; ctx.shadowBlur = 14;
      ctx.fillStyle = `rgba(200,162,74,${0.85 * a})`; ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255,240,200,${a})`; ctx.lineWidth = 1.5; ctx.strokeRect(-sz / 2 - 5, -sz / 2 - 5, sz + 10, sz + 10);
      ctx.restore();
      hudText(ctx, A.id, top.x + 20, top.y - 2, { color: `rgba(${GOLD},${0.9 * a})`, size: 15, weight: 700, letterSpacing: 2 });
    });
    ctx.restore();
  }

  function drawLogistics(ctx, t, cam) {
    const a = sstep(35.7, 36.2, t);
    if (a <= 0) return;
    const fl = decay(t, IND[3].cue, 3);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const b = P(cam, t, LOGI.u, LOGI.v, 3);
    UNITS.forEach((U, i) => {
      const pu = unitPos(U, t);
      const pts = [];
      for (let k = 0; k <= 16; k++) { const s = k / 16; pts.push(P(cam, t, lerp(LOGI.u, pu[0], s), lerp(LOGI.v, pu[1], s), 3)); }
      ctx.setLineDash([3, 7]); ctx.lineDashOffset = -t * 40;
      ctx.beginPath(); pts.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = `rgba(${HUD},${(0.32 + 0.6 * fl) * a})`; ctx.lineWidth = 1.5 + fl * 2; ctx.stroke();
      ctx.setLineDash([]);
      // supply packets
      for (let k = 0; k < 2; k++) {
        const s = frac((t - 35.7) * 0.55 + k * 0.5 + i * 0.17);
        const pk = P(cam, t, lerp(LOGI.u, pu[0], s), lerp(LOGI.v, pu[1], s), 4);
        ctx.fillStyle = `rgba(220,255,235,${0.85 * a})`; ctx.fillRect(pk.x - 2.5, pk.y - 2.5, 5, 5);
      }
    });
    // logistics hub hexagon
    const s = 16 * b.s;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const an = Math.PI / 6 + (k * Math.PI) / 3; ctx.lineTo(b.x + Math.cos(an) * s, b.y + Math.sin(an) * s * 0.6); }
    ctx.closePath(); ctx.fillStyle = `rgba(31,174,91,${0.4 * a + 0.4 * fl})`; ctx.fill();
    ctx.strokeStyle = `rgba(${HUD},${a})`; ctx.lineWidth = 1.5; ctx.stroke();
    if (fl > 0) {
      const k = 1 - fl;
      ringOnTerrain(ctx, cam, t, LOGI.u, LOGI.v, 30 + k * 300, 3, 48);
      ctx.strokeStyle = `rgba(230,255,240,${fl})`; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.restore();
    hudText(ctx, 'LOG-HUB', b.x + 24, b.y + 4, { size: 14, color: `rgba(${HUD},${0.75 * a})`, letterSpacing: 2 });
  }

  function drawUnits(ctx, t, cam) {
    const fl = decay(t, IND[1].cue, 4.5);
    const list = UNITS.map((U, i) => ({ U, i, pos: unitPos(U, t) })).sort((a, b) => b.pos[1] - a.pos[1]);
    list.forEach(({ U, i, pos }) => {
      const sc = ease.outBack(prog(t, 34.85 + i * 0.1, 35.2 + i * 0.1));
      if (sc <= 0) return;
      const g = P(cam, t, pos[0], pos[1], 2), top = P(cam, t, pos[0], pos[1], 70);
      const s = g.s * sc;
      ctx.save();
      // ground marker
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${HUD},0.25)`;
      ctx.beginPath(); ctx.ellipse(g.x, g.y, 20 * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${HUD},0.8)`; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = `rgba(${HUD},0.55)`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(top.x, top.y + 16 * s); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      // badge
      ctx.translate(top.x, top.y); ctx.scale(s, s);
      const bw = 48, bh = 34;
      const gr = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
      gr.addColorStop(0, '#2fd977'); gr.addColorStop(0.5, '#1FAE5B'); gr.addColorStop(1, '#006C35');
      ctx.shadowColor = 'rgba(31,174,91,0.95)'; ctx.shadowBlur = 16 + 20 * fl;
      chamfer(ctx, -bw / 2, -bh / 2, bw, bh, 7); ctx.fillStyle = gr; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(220,255,235,${0.9})`; ctx.lineWidth = 1.6; ctx.stroke();
      // specular top edge
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(-bw / 2 + 7, -bh / 2 + 2, bw - 14, 3);
      // double chevron (advance)
      ctx.strokeStyle = '#eafff2'; ctx.lineWidth = 3.4; ctx.lineJoin = 'miter';
      ctx.beginPath(); ctx.moveTo(-11, 4); ctx.lineTo(0, -5); ctx.lineTo(11, 4);
      ctx.moveTo(-11, 12); ctx.lineTo(0, 3); ctx.lineTo(11, 12); ctx.stroke();
      if (fl > 0) { ctx.globalAlpha = fl * 0.8; ctx.fillStyle = '#ffffff'; chamfer(ctx, -bw / 2, -bh / 2, bw, bh, 7); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.restore();
      hudText(ctx, U.id, top.x + 32 * s, top.y - 10 * s, { size: 15, weight: 700, color: `rgba(${HUD},${0.9 * Math.min(1, sc)})`, letterSpacing: 1 });
    });
  }

  function drawJets(ctx, t, cam) {
    const a0 = sstep(34.7, 35.1, t);
    if (a0 <= 0) return;
    const fl = decay(t, IND[0].cue, 3.2);
    JETS.forEach((J, idx) => {
      const s = frac((t - 34.0 + J.ph) / J.dur);
      const a = a0 * sstep(0, 0.1, s) * (1 - sstep(0.9, 1, s));
      if (a <= 0.01) return;
      const pos = (ss) => { const q = J.path(ss); return P(cam, t, q[0], q[1], J.alt); };
      const p = pos(s), pn = pos(s + 0.004);
      const ang = Math.atan2(pn.y - p.y, pn.x - p.x);
      const q = J.path(s), gp = P(cam, t, clamp(q[0]), clamp(q[1]), 2);
      ctx.save();
      // drop line + ground shadow
      if (q[0] > 0 && q[0] < 1 && q[1] > 0 && q[1] < 1) {
        ctx.setLineDash([3, 5]); ctx.strokeStyle = `rgba(${HUD},${0.35 * a})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(gp.x, gp.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = `rgba(0,0,0,${0.35 * a})`; ctx.beginPath(); ctx.ellipse(gp.x, gp.y, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
      }
      // contrail
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 1; k < 18; k++) {
        const s0 = s - k * 0.011, s1 = s - (k - 1) * 0.011;
        if (s0 < 0) break;
        const p0 = pos(s0), p1 = pos(s1);
        ctx.strokeStyle = `rgba(200,255,225,${(1 - k / 18) * 0.5 * a * (1 + fl)})`; ctx.lineWidth = 3 * (1 - k / 22);
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      }
      if (fl > 0) {
        ctx.strokeStyle = `rgba(230,255,240,${fl * a})`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 16 + (1 - fl) * 70, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      // jet glyph (top-down delta silhouette)
      ctx.translate(p.x, p.y); ctx.rotate(ang); const k = 1.15 * p.s; ctx.scale(k, k);
      ctx.shadowColor = 'rgba(124,255,178,1)'; ctx.shadowBlur = 12 + 18 * fl;
      ctx.fillStyle = `rgba(225,255,236,${a})`;
      ctx.beginPath();
      ctx.moveTo(17, 0); ctx.lineTo(6, -2.6); ctx.lineTo(-1, -13); ctx.lineTo(-5, -13); ctx.lineTo(-3, -3);
      ctx.lineTo(-10, -3); ctx.lineTo(-13, -8); ctx.lineTo(-15, -8); ctx.lineTo(-14, 0);
      ctx.lineTo(-15, 8); ctx.lineTo(-13, 8); ctx.lineTo(-10, 3); ctx.lineTo(-3, 3); ctx.lineTo(-5, 13); ctx.lineTo(-1, 13); ctx.lineTo(6, 2.6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      hudText(ctx, `F-${idx + 1}  FL${280 + idx * 40}`, p.x + 22, p.y - 16, { size: 13, color: `rgba(${HUD},${0.7 * a})`, letterSpacing: 1 });
    });
  }

  function drawMotes(ctx, t, cam) {
    const a0 = sstep(34.6, 35.2, t);
    if (a0 <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 46; i++) {
      const u = 0.04 + 0.92 * hash(i, 71), v = 0.04 + 0.92 * hash(i, 72);
      const per = 2.2 + 1.8 * hash(i, 73);
      const age = frac((t + hash(i, 74) * per) / per);
      const g = P(cam, t, u, v, 6 + age * 120);
      const a = Math.sin(Math.PI * age) * 0.75 * a0;
      const sz = (1.5 + 2 * hash(i, 75)) * g.s;
      ctx.fillStyle = `rgba(170,255,210,${a})`; ctx.fillRect(g.x - sz / 2, g.y - sz / 2, sz, sz);
    }
    // ambient dust in the projector light (screen space)
    for (let i = 0; i < 60; i++) {
      const sp = 8 + 22 * hash(i, 81);
      const x = (hash(i, 82) * W + noise1(t * 0.4 + i, 83) * 40) % W;
      const y = ((hash(i, 84) * H - (t - T0) * sp) % H + H) % H;
      const tw = 0.5 + 0.5 * Math.sin(t * (2 + 3 * hash(i, 85)) + i);
      const a = 0.25 * tw * a0;
      const r = 1 + 2 * hash(i, 86);
      ctx.fillStyle = `rgba(200,255,225,${a})`; ctx.fillRect(x, y, r, r);
    }
    ctx.restore();
  }

  function drawMapLabels(ctx, t, cam) {
    const a = boot(t, 34.4, 0.3, 9) * 0.6;
    if (a <= 0) return;
    const cols = 'ABCDEFGHIJ';
    for (let i = 0; i < 10; i++) {
      const p = proj(cam, ((i + 0.5) / 10 - 0.5) * WX, BASE_Y - 4, -0.5 * DZ - 30);
      hudText(ctx, cols[i], p.x, p.y + 14, { size: 15, align: 'center', color: `rgba(${HUD},${a})` });
    }
  }

  function drawMap(ctx, t, cam) {
    drawFloor(ctx, t, cam);
    drawTerrain(ctx, t, cam);
    drawRings(ctx, t, cam);
    drawLogistics(ctx, t, cam);
    drawArrows(ctx, t, cam);
    drawObjectives(ctx, t, cam);
    drawUnits(ctx, t, cam);
    drawJets(ctx, t, cam);
    drawMotes(ctx, t, cam);
    drawMapLabels(ctx, t, cam);
  }

  // =====================================================================
  // HUD
  // =====================================================================
  function drawTitle(ctx, t) {
    if (t < T_TITLE - 1e-6) return;
    const lt = t - T_TITLE, f = fidx(t);
    let g = lt < 0.55 ? Math.pow(1 - lt / 0.55, 1.6) : 0;
    for (const [gt, gd] of [[35.55, 0.1], [37.75, 0.07], [39.05, 0.1]]) if (t >= gt && t < gt + gd) g = Math.max(g, 0.3);
    const x = 1858 - TITLE.w + 60 - 10, y = 98 - TITLE.h / 2;
    const sc = 1 + 0.12 * Math.pow(1 - clamp(lt / 0.3), 3);
    ctx.save();
    ctx.translate(x + TITLE.w - 60, y + TITLE.h / 2); ctx.scale(sc, sc); ctx.translate(-(x + TITLE.w - 60), -(y + TITLE.h / 2));
    if (g < 0.02) {
      ctx.drawImage(TITLE.main, x, y);
    } else {
      const off = 8 + g * 30;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85 * g;
      ctx.drawImage(TITLE.red, x + off * (0.5 + hash(f, 1)), y + (hash(f, 2) - 0.5) * 8 * g);
      ctx.drawImage(TITLE.cyan, x - off * (0.5 + hash(f, 3)), y + (hash(f, 4) - 0.5) * 8 * g);
      ctx.globalCompositeOperation = 'source-over';
      const n = 16, sh = TITLE.h / n;
      for (let i = 0; i < n; i++) {
        const dx = hash(f * 31 + i, 9) > 1 - 0.55 * g ? (hash(f * 17 + i, 11) - 0.5) * 150 * g : 0;
        ctx.globalAlpha = hash(f * 7 + i, 13) < 0.25 * g ? 0.25 : 1;
        ctx.drawImage(TITLE.main, 0, i * sh, TITLE.w, sh, x + dx, y + i * sh, TITLE.w, sh);
      }
      ctx.globalAlpha = 1;
      // digital noise blocks
      const nb = Math.round(10 * g);
      for (let k = 0; k < nb; k++) {
        const bx = x + 40 + hash(f * 13 + k, 21) * (TITLE.w - 80), by = y + 40 + hash(f * 13 + k, 22) * (TITLE.h - 80);
        ctx.fillStyle = hash(k + f, 23) > 0.5 ? `rgba(${HUD},0.8)` : 'rgba(255,255,255,0.7)';
        ctx.fillRect(bx, by, 10 + hash(k + f, 24) * 70, 3 + hash(k + f, 25) * 10);
      }
    }
    ctx.restore();
    // underline + subtitle
    const wl = ease.outExpo(prog(t, T_TITLE + 0.05, T_TITLE + 0.6));
    const xr = 1850, xl = xr - (TITLE.tw + 40) * wl;
    ctx.save();
    let gr = ctx.createLinearGradient(xl, 0, xr, 0);
    gr.addColorStop(0, `rgba(${HUD},0)`); gr.addColorStop(1, `rgba(${HUD},0.9)`);
    ctx.fillStyle = gr; ctx.fillRect(xl, 150, xr - xl, 3);
    ctx.fillStyle = '#C8A24A'; ctx.fillRect(xr - 90 * wl, 147, 90 * wl, 9);
    ctx.restore();
    hudText(ctx, 'SCENE ANALYSIS  //  SECTOR 07  //  LIVE', xr, 176, { align: 'right', size: 17, letterSpacing: 5, color: `rgba(${HUD},${0.7 * wl})` });
  }

  function drawFrameHUD(ctx, t) {
    const a = boot(t, 34.12, 0.3, 5);
    if (a <= 0) return;
    const ext = ease.outExpo(prog(t, 34.12, 34.6));
    ctx.save();
    ctx.globalAlpha = a;
    const L = 26 + 64 * ext, m = 30;
    ctx.beginPath();
    bracketPath(ctx, m, m, 1, 1, L); bracketPath(ctx, W - m, m, -1, 1, L);
    bracketPath(ctx, m, H - m, 1, -1, L); bracketPath(ctx, W - m, H - m, -1, -1, L);
    ctx.strokeStyle = `rgba(${HUD},0.16)`; ctx.lineWidth = 11; ctx.stroke();
    ctx.strokeStyle = `rgba(${HUD},0.9)`; ctx.lineWidth = 3; ctx.stroke();
    // top-left status block
    const blink = 0.5 + 0.5 * Math.sin(t * 7);
    ctx.fillStyle = `rgba(31,174,91,${0.5 + 0.5 * blink})`;
    ctx.beginPath(); ctx.arc(72, 72, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const tc = Math.max(0, t - T0) + 12 * 60 + 34; // mission clock
    const mm = Math.floor(tc / 60), ss = Math.floor(tc % 60), ff = Math.floor(frac(tc) * 30);
    const pad = (n) => String(n).padStart(2, '0');
    hudText(ctx, 'LIVE FEED  ·  HOLO-TABLE 02', 90, 72, { size: 19, weight: 700, letterSpacing: 3, color: `rgba(${HUD},${0.9 * a})` });
    hudText(ctx, `T+ 00:${pad(mm)}:${pad(ss)}:${pad(ff)}`, 64, 104, { size: 17, letterSpacing: 2, color: `rgba(${HUD},${0.65 * a})` });
    hudText(ctx, `GRID ${pad(34 + Math.floor((t - T0) * 1.5) % 9)}-${pad(17 + fidx(t) % 7)}  ·  ELEV ${(412 + Math.round(noise1(t * 3, 5) * 40))}M`, 64, 128, { size: 15, letterSpacing: 2, color: `rgba(${HUD},${0.5 * a})` });
  }

  function drawDataColumns(ctx, t) {
    const a = boot(t, 34.35, 0.3, 7);
    if (a <= 0) return;
    ctx.save();
    const y0 = 226, y1 = 740, lh = 21;
    for (let col = 0; col < 2; col++) {
      const x = 44 + col * 0, speed = 34 + col * 22;
      const off = (t - T0) * speed;
      const first = Math.floor((y0 + off) / lh);
      if (col === 1) continue; // single dense column on the left edge
      for (let r = first; r * lh - off < y1; r++) {
        const y = r * lh - off;
        if (y < y0) continue;
        const e = Math.min(1, (y - y0) / 80, (y1 - y) / 80);
        const hv = Math.floor(hash(r, 300 + col) * 65535).toString(16).toUpperCase().padStart(4, '0');
        const hot = hash(r, 310) > 0.86;
        hudText(ctx, hv, x, y, { size: 14, color: hot ? `rgba(242,210,122,${0.8 * e * a})` : `rgba(${HUD},${0.38 * e * a})`, letterSpacing: 1 });
      }
    }
    // vertical ruler
    ctx.strokeStyle = `rgba(${HUD},${0.3 * a})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(100, y0); ctx.lineTo(100, y1);
    for (let y = y0; y <= y1; y += 20) { ctx.moveTo(100, y); ctx.lineTo(y % 100 === 30 ? 112 : 106, y); }
    ctx.stroke();
    ctx.restore();
  }

  function drawPanel(ctx, t) {
    const pin = ease.outExpo(prog(t, 34.45, 35.05));
    if (pin <= 0) return;
    const fa = boot(t, 34.45, 0.25, 11);
    const ox = (1 - pin) * 640;
    const x0 = 1290 + ox, x1 = 1862 + ox, y0 = 212, y1 = 794;
    ctx.save();
    ctx.globalAlpha = fa;
    // glass body
    chamfer(ctx, x0, y0, x1 - x0, y1 - y0, 22);
    let g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(8,30,26,0.82)'); g.addColorStop(1, 'rgba(3,12,12,0.78)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = `rgba(${HUD},0.45)`; ctx.lineWidth = 1.5; ctx.stroke();
    // glass sheen
    g = ctx.createLinearGradient(x0, y0, x0 + 300, y0 + 300);
    g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; chamfer(ctx, x0, y0, x1 - x0, y1 - y0, 22); ctx.fill();
    // corner accents
    ctx.strokeStyle = `rgba(${HUD},0.95)`; ctx.lineWidth = 3;
    ctx.beginPath(); bracketPath(ctx, x1 - 2, y0 + 30, -1, -1, 0); ctx.moveTo(x1 - 22, y0 + 1); ctx.lineTo(x1 - 1, y0 + 22); ctx.lineTo(x1 - 1, y0 + 70);
    ctx.moveTo(x0 + 22, y1 - 1); ctx.lineTo(x0 + 1, y1 - 22); ctx.lineTo(x0 + 1, y1 - 70); ctx.stroke();
    // header
    hudText(ctx, 'STATUS INDICATORS', x1 - 30, y0 + 34, { align: 'right', size: 17, weight: 700, letterSpacing: 5, color: `rgba(${HUD},0.85)` });
    hudText(ctx, '04 / 04', x0 + 28, y0 + 34, { size: 16, letterSpacing: 3, color: `rgba(${HUD},0.55)` });
    ctx.fillStyle = `rgba(${HUD},0.25)`; ctx.fillRect(x0 + 24, y0 + 58, x1 - x0 - 48, 1);
    ctx.restore();

    IND.forEach((I, i) => drawIndicator(ctx, t, I, i, x0, x1, y0 + 76 + i * 128, fa));
  }

  function drawIndicator(ctx, t, I, i, x0, x1, ry, fa) {
    const ra = boot(t, 34.6 + i * 0.09, 0.22, 20 + i) * fa;
    if (ra <= 0) return;
    const start = I.cue - 1.05;
    const p = prog(t, start, I.cue);
    const landed = after(t, I.cue);
    const counting = t >= start && !landed;
    const e = landed ? 1 : (1 - Math.cos(Math.PI * p)) / 2;
    const val = landed ? I.val : Math.floor(I.val * e);
    const fillF = (I.val / 100) * e;
    const dt = landed ? t - I.cue : -1;
    const blip = landed ? Math.exp(-dt * 9) : 0;
    const bx0 = x0 + 28, bx1 = x1 - 28, by = ry + 70, bh = 18;
    const head = bx1 - (bx1 - bx0) * fillF;
    ctx.save();
    ctx.globalAlpha = ra;
    // row highlight on landing
    if (blip > 0.01) {
      const gr = ctx.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, `rgba(${HUD},0)`); gr.addColorStop(0.5, `rgba(${HUD},${0.22 * blip})`); gr.addColorStop(1, `rgba(${HUD},0)`);
      ctx.fillStyle = gr; ctx.fillRect(x0 + 6, ry - 6, x1 - x0 - 12, 112);
      // sweep line
      const sx = lerp(x1, x0, clamp(dt / 0.25));
      ctx.fillStyle = `rgba(230,255,240,${0.8 * blip})`; ctx.fillRect(sx - 2, ry - 4, 4, 108);
    }
    // LED
    const ledOn = landed ? 1 : counting ? 0.5 + 0.5 * Math.sin(t * 30) : 0.15;
    ctx.save(); ctx.translate(x1 - 14, ry + 28); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = landed ? '#7CFFB2' : `rgba(${HUD},${ledOn})`;
    if (landed) { ctx.shadowColor = '#7CFFB2'; ctx.shadowBlur = 10; }
    ctx.fillRect(-4, -4, 8, 8); ctx.restore();
    // label
    M.text(ctx, I.label, x1 - 30, ry + 28, { size: 35, family: 'arabic', weight: 700, align: 'right', color: landed ? '#f2fff7' : (counting ? '#d6f5e4' : 'rgba(214,245,228,0.6)'), glow: landed ? 10 + 18 * blip : 0, glowColor: 'rgba(31,174,91,0.8)' });
    // value
    const vs = M.arDigits(val) + '٪';
    const pop = 1 + 0.3 * blip;
    const vw = M.measure(ctx, vs, { size: 52, family: 'arabic', weight: 900 });
    const vcx = bx0 + vw / 2, vcy = ry + 26;
    ctx.save(); ctx.translate(bx0, vcy); ctx.scale(pop, pop);
    M.text(ctx, vs, vw / 2, 0, { size: 52, family: 'arabic', weight: 900, align: 'center', color: landed ? (blip > 0.5 ? '#ffffff' : '#9dffc6') : (counting ? '#7CFFB2' : 'rgba(124,255,178,0.4)'), glow: landed ? 14 + 26 * blip : (counting ? 8 : 0), glowColor: 'rgba(31,174,91,0.95)' });
    ctx.restore();
    if (blip > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const pd = 6 + 70 * ease.outCubic(clamp(dt / 0.35));
      ctx.strokeStyle = `rgba(200,255,225,${blip})`; ctx.lineWidth = 2.5 * blip + 1;
      chamfer(ctx, bx0 - pd * 0.5, vcy - 30 - pd * 0.4, vw * pop + pd, 60 + pd * 0.8, 8); ctx.stroke();
      ctx.restore();
    }
    // bar track
    ctx.fillStyle = 'rgba(124,255,178,0.08)'; ctx.fillRect(bx0, by, bx1 - bx0, bh);
    ctx.strokeStyle = `rgba(${HUD},0.25)`; ctx.lineWidth = 1; ctx.strokeRect(bx0 - 0.5, by - 0.5, bx1 - bx0 + 1, bh + 1);
    // fill (right → left)
    if (fillF > 0.001) {
      const gr = ctx.createLinearGradient(bx1, 0, head, 0);
      gr.addColorStop(0, '#006C35'); gr.addColorStop(0.6, '#1FAE5B'); gr.addColorStop(1, '#7CFFB2');
      ctx.fillStyle = gr; ctx.fillRect(head, by, bx1 - head, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(head, by + 2, bx1 - head, 3);
      if (blip > 0.01) { ctx.fillStyle = `rgba(255,255,255,${0.75 * blip})`; ctx.fillRect(head, by, bx1 - head, bh); }
      // head glow
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const hg = ctx.createRadialGradient(head, by + bh / 2, 0, head, by + bh / 2, 30 + 40 * blip);
      hg.addColorStop(0, `rgba(170,255,210,${landed ? 0.3 + 0.7 * blip : 0.8})`); hg.addColorStop(1, 'rgba(124,255,178,0)');
      ctx.fillStyle = hg; ctx.fillRect(head - 90, by - 80, 180, 180);
      ctx.fillStyle = '#eafff3'; ctx.fillRect(head - 1.5, by - 4, 3, bh + 8);
      ctx.restore();
    }
    // segment gaps
    ctx.fillStyle = 'rgba(3,14,13,0.9)';
    for (let x = bx1 - 12; x > bx0; x -= 12) ctx.fillRect(x, by, 2, bh);
    // tick marks
    ctx.fillStyle = `rgba(${HUD},0.35)`;
    for (let k = 0; k <= 10; k++) { const x = lerp(bx1, bx0, k / 10); ctx.fillRect(x - 0.5, by + bh + 4, 1, k % 5 === 0 ? 9 : 5); }
    ctx.restore();
    // sparks from the bar head at landing (ballistic, analytic)
    if (landed && dt < 0.7) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 16; k++) {
        const ang = Math.PI * (0.5 + 1.0 * hash(k, 400 + i)) + Math.PI; // spray up/left
        const sp = 260 + 420 * hash(k, 410 + i);
        const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp;
        const life = 0.35 + 0.3 * hash(k, 420 + i);
        if (dt > life) continue;
        const px = head + vx * dt, py = by + bh / 2 + vy * dt + 900 * dt * dt;
        const a = 1 - dt / life;
        ctx.strokeStyle = `rgba(210,255,225,${a})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - vx * 0.03, py - (vy + 1800 * dt) * 0.03); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // leader line linking each landed indicator to the map element it summarises
  function drawLeaders(ctx, t, cam) {
    IND.forEach((I, i) => {
      if (!after(t, I.cue)) return;
      const dt = t - I.cue;
      if (dt > 1.0) return;
      const a = 1 - sstep(0.5, 1.0, dt);
      const draw = ease.outExpo(clamp(dt / 0.18));
      let target;
      if (i === 0) { const J = JETS[0]; const s = frac((t - 34.0 + J.ph) / J.dur); const q = J.path(s); target = P(cam, t, q[0], q[1], J.alt); }
      else if (i === 1) { const pos = unitPos(UNITS[3], t); target = P(cam, t, pos[0], pos[1], 70); }
      else if (i === 2) { target = P(cam, t, ...bez(ARROWS[1], 0.85), 5); }
      else target = P(cam, t, LOGI.u, LOGI.v, 3);
      const sx = 1290, sy = 212 + 76 + i * 128 + 26;
      const ex = target.x, ey = target.y;
      const mx = lerp(sx, ex, 0.35);
      const pts = [[sx, sy], [mx, sy], [ex, ey]];
      const segL = [Math.abs(mx - sx), Math.hypot(ex - mx, ey - sy)];
      const tot = segL[0] + segL[1], dl = tot * draw;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(200,255,225,${0.85 * a})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      if (dl <= segL[0]) ctx.lineTo(sx - dl * Math.sign(sx - mx), sy);
      else { ctx.lineTo(mx, sy); const k = (dl - segL[0]) / segL[1]; ctx.lineTo(lerp(mx, ex, k), lerp(sy, ey, k)); }
      ctx.stroke();
      if (draw > 0.98) {
        ctx.beginPath(); ctx.arc(ex, ey, 10 + 6 * Math.sin(dt * 20), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(230,255,240,${a})`; ctx.fillRect(ex - 3, ey - 3, 6, 6);
      }
      ctx.restore();
    });
  }

  function drawBottom(ctx, t) {
    const a = boot(t, 34.5, 0.3, 13);
    if (a <= 0) return;
    const p = prog(t, 34.6, T_VERDICT);
    const done = after(t, T_VERDICT);
    const x0 = 140, x1 = 1230, y = 1006;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(124,255,178,0.1)'; ctx.fillRect(x0, y, x1 - x0, 6);
    const gx = lerp(x0, x1, p);
    const g = ctx.createLinearGradient(x0, 0, gx, 0);
    g.addColorStop(0, done ? 'rgba(200,162,74,0.5)' : 'rgba(31,174,91,0.4)'); g.addColorStop(1, done ? '#F2D27A' : '#7CFFB2');
    ctx.fillStyle = g; ctx.fillRect(x0, y, gx - x0, 6);
    ctx.fillStyle = `rgba(${HUD},0.35)`;
    for (let k = 0; k <= 40; k++) ctx.fillRect(lerp(x0, x1, k / 40), y + 10, 1, k % 5 === 0 ? 8 : 4);
    ctx.restore();
    hudText(ctx, done ? 'ANALYSIS COMPLETE' : 'ANALYSIS IN PROGRESS', x0, y - 18, { size: 16, weight: 700, letterSpacing: 4, color: done ? `rgba(${GOLD},${a})` : `rgba(${HUD},${0.8 * a})` });
    hudText(ctx, String(Math.floor(p * 100)).padStart(3, '0') + ' %', x1, y - 18, { size: 18, weight: 700, align: 'right', letterSpacing: 2, color: done ? `rgba(${GOLD},${a})` : `rgba(${HUD},${0.85 * a})` });
  }

  function drawRadar(ctx, t) {
    const a = boot(t, 34.7, 0.3, 15);
    if (a <= 0) return;
    const cx = 1362, cy = 900, r = 72;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(4,20,18,0.7)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(${HUD},0.45)`; ctx.lineWidth = 1.2;
    for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(cx, cy, (r * k) / 3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    const ang = (t - T0) * 2.6;
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 14; k++) {
      ctx.fillStyle = `rgba(${HUD},${0.22 * (1 - k / 14)})`;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, ang - (k + 1) * 0.06, ang - k * 0.06); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(210,255,230,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); ctx.stroke();
    for (let b = 0; b < 6; b++) {
      const ba = hash(b, 501) * Math.PI * 2, br = r * (0.25 + 0.65 * hash(b, 502));
      const since = ((ang - ba) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const al = Math.max(0, 1 - since / 4);
      ctx.fillStyle = `rgba(170,255,210,${al})`;
      ctx.beginPath(); ctx.arc(cx + Math.cos(ba) * br, cy + Math.sin(ba) * br, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // spectrum / signal bars
    const sx0 = 1462, sx1 = 1856, base = 958;
    for (let k = 0; k < 36; k++) {
      const v = 0.25 + 0.75 * Math.abs(noise1(t * 5 + k * 0.7, 600 + k));
      const h = 8 + v * 78;
      const x = lerp(sx0, sx1, k / 36);
      const gr = ctx.createLinearGradient(0, base, 0, base - h);
      gr.addColorStop(0, 'rgba(0,108,53,0.9)'); gr.addColorStop(1, 'rgba(124,255,178,0.9)');
      ctx.fillStyle = gr; ctx.fillRect(x, base - h, 7, h);
    }
    ctx.fillStyle = `rgba(${HUD},0.3)`; ctx.fillRect(sx0, base + 4, sx1 - sx0, 1);
    ctx.restore();
    hudText(ctx, 'SIGNAL  ·  C2 LINK', 1856, 840, { align: 'right', size: 15, letterSpacing: 3, color: `rgba(${HUD},${0.7 * a})` });
  }

  // =====================================================================
  // VERDICT (40.8) + ZOOM (41.4–42.0)
  // =====================================================================
  const VC = { x: 960, y: 548 };
  function verdictGeo() {
    const bw = VL.boxW, bh = VL.boxH;
    const baseY = VC.y + 50;
    const sv = VL.seven;
    const sevX = VC.x + sv.cx;
    return {
      bw, bh, x0: VC.x - bw / 2, y0: VC.y - bh / 2, baseY, sevX,
      tgtX: sevX + VL.tgt.x, tgtY: baseY + VL.tgt.y,
      sevCY: baseY + (VL.bbox.y0 + VL.bbox.y1) / 2, sevCX: sevX + (VL.bbox.x0 + VL.bbox.x1) / 2,
    };
  }
  // zoom state: scale + translation to bring the «٧» stroke to screen centre
  function zoomState(t) {
    const G = verdictGeo();
    const p = prog(t, T_ZOOM, T_END);
    if (p <= 0) return { p: 0, s: 1, sB: 1, e2: 0, G };
    const need = 1250 / VL.thick; // inscribed radius must exceed the half-diagonal on the last frame
    const sEnd = Math.pow(need, 1 / Math.pow(17 / 18, 2.2)); // last frame is p = 17/18
    const e = Math.pow(p, 2.2);
    const s = Math.exp(Math.log(sEnd) * e);
    const e2 = ease.inOutCubic(prog(t, T_ZOOM, T_END - 0.12));
    return { p, s, sB: 1 + (s - 1) * 0.05, e2, G };
  }
  function applyZoom(ctx, Z, s) {
    if (Z.p <= 0) return;
    const G = Z.G;
    ctx.translate(lerp(G.tgtX, 960, Z.e2), lerp(G.tgtY, 540, Z.e2));
    ctx.rotate(-0.08 * Z.e2 * (s === Z.s ? 1 : 0.3));
    ctx.scale(s, s);
    ctx.translate(-G.tgtX, -G.tgtY);
  }

  function goldGrad(ctx, y0, y1, sweep) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#fff2c4'); g.addColorStop(0.3, '#F2D27A'); g.addColorStop(0.52, '#C8A24A');
    g.addColorStop(0.56, '#8a6a22'); g.addColorStop(0.75, '#d9b45c'); g.addColorStop(1, '#fff0b8');
    return g;
  }
  function whiteGrad(ctx, y0, y1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.48, '#eef8f3'); g.addColorStop(0.54, '#a9c6b8'); g.addColorStop(1, '#f6fffa');
    return g;
  }

  function drawVerdict(ctx, t, Z) {
    const G = Z.G;
    const lockP = prog(t, 40.32, T_VERDICT);
    if (lockP <= 0) return;
    const slammed = after(t, T_VERDICT);
    const dt = slammed ? t - T_VERDICT : -1;
    const zp = Z.p;
    const fadeOthers = 1 - sstep(0.08, 0.5, zp);
    // ---- lock brackets (3 stepped snaps → lock at 40.8) ----
    const steps = [40.32, 40.48, 40.64, 40.8];
    let k = 0;
    for (let s = 0; s < 3; s++) {
      if (t >= steps[s]) k = s + ease.outExpo(prog(t, steps[s], steps[s] + 0.12)) * 1;
    }
    k = slammed ? 3 : Math.min(3, k);
    const off = slammed ? 14 + 10 * Math.exp(-dt * 14) * Math.cos(dt * 40) : lerp(560, 14, k / 3);
    const lockCol = slammed ? `rgba(${GOLD},${0.95 * fadeOthers})` : `rgba(${HUD},0.95)`;
    ctx.save();
    const bx0 = G.x0 - off, by0 = G.y0 - off, bx1 = G.x0 + G.bw + off, by1 = G.y0 + G.bh + off;
    const al = 70;
    ctx.beginPath();
    bracketPath(ctx, bx0, by0, 1, 1, al); bracketPath(ctx, bx1, by0, -1, 1, al);
    bracketPath(ctx, bx0, by1, 1, -1, al); bracketPath(ctx, bx1, by1, -1, -1, al);
    ctx.strokeStyle = slammed ? `rgba(${GOLD},${0.2 * fadeOthers})` : `rgba(${HUD},0.2)`; ctx.lineWidth = 16; ctx.stroke();
    ctx.strokeStyle = lockCol; ctx.lineWidth = 5; ctx.stroke();
    ctx.restore();
    if (!slammed) {
      hudText(ctx, 'LOCKING', bx0 + 6, by0 - 22, { size: 18, weight: 700, letterSpacing: 4, color: `rgba(${HUD},0.9)` });
      ctx.fillStyle = `rgba(${HUD},0.9)`;
      for (let q = 0; q < 3; q++) { if (q <= Math.floor(k)) ctx.fillRect(bx0 + 112 + q * 16, by0 - 31, 10, 18); else { ctx.strokeStyle = `rgba(${HUD},0.6)`; ctx.lineWidth = 1; ctx.strokeRect(bx0 + 112.5 + q * 16, by0 - 30.5, 9, 17); } }
    } else if (fadeOthers > 0) {
      hudText(ctx, 'ASSESSMENT LOCKED', bx0 + 6, by0 - 22, { size: 18, weight: 700, letterSpacing: 4, color: `rgba(${GOLD},${fadeOthers})` });
    }
    // ---- the box: flies in from the camera (40.66) and slams at 40.8 ----
    const inP = prog(t, 40.64, T_VERDICT);
    if (inP <= 0) { drawSevenLock(ctx, t, G, false, -1, lockP, 1); return; }
    let sc, ba;
    if (!slammed) { const e = ease.inCubic(inP); sc = lerp(1.55, 1.0, e); ba = Math.min(1, inP * 1.6); }
    else { sc = 1 - 0.045 * Math.exp(-dt * 13) * Math.cos(dt * 34); ba = 1; }
    ctx.save();
    ctx.translate(VC.x, VC.y); ctx.scale(sc, sc); ctx.translate(-VC.x, -VC.y);
    ctx.globalAlpha = ba * fadeOthers;
    // body
    chamfer(ctx, G.x0, G.y0, G.bw, G.bh, 30);
    let g = ctx.createLinearGradient(0, G.y0, 0, G.y0 + G.bh);
    g.addColorStop(0, 'rgba(8,40,28,0.95)'); g.addColorStop(0.5, 'rgba(3,18,14,0.95)'); g.addColorStop(1, 'rgba(6,30,22,0.95)');
    ctx.fillStyle = g; ctx.fill();
    // outer glow (layered strokes instead of an expensive shadow blur)
    for (const [lw, al] of [[34, 0.05], [20, 0.08], [10, 0.14]]) { ctx.strokeStyle = `rgba(${GOLD},${al})`; ctx.lineWidth = lw; ctx.stroke(); }
    // inner scan texture
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(124,255,178,0.035)';
    for (let y = G.y0 + 4; y < G.y0 + G.bh; y += 6) ctx.fillRect(G.x0, y, G.bw, 2);
    // gold hazard stripes at both ends
    ctx.fillStyle = 'rgba(200,162,74,0.22)';
    for (let s = 0; s < 6; s++) {
      for (const ex of [G.x0 + 24, G.x0 + G.bw - 74]) {
        ctx.beginPath(); const xx = ex + s * 10; ctx.moveTo(xx, G.y0 + G.bh - 18); ctx.lineTo(xx + 5, G.y0 + G.bh - 18); ctx.lineTo(xx + 25, G.y0 + G.bh - 40); ctx.lineTo(xx + 20, G.y0 + G.bh - 40); ctx.fill();
      }
    }
    // inner light from top
    const lg = ctx.createRadialGradient(VC.x, G.y0, 0, VC.x, G.y0, G.bw * 0.6);
    lg.addColorStop(0, 'rgba(242,210,122,0.16)'); lg.addColorStop(1, 'rgba(242,210,122,0)');
    ctx.fillStyle = lg; ctx.fillRect(G.x0, G.y0, G.bw, G.bh);
    ctx.restore();
    // borders
    g = ctx.createLinearGradient(G.x0, 0, G.x0 + G.bw, 0);
    g.addColorStop(0, '#8a6a22'); g.addColorStop(0.25, '#F2D27A'); g.addColorStop(0.5, '#fff4cf'); g.addColorStop(0.75, '#F2D27A'); g.addColorStop(1, '#8a6a22');
    chamfer(ctx, G.x0, G.y0, G.bw, G.bh, 30);
    ctx.strokeStyle = g; ctx.lineWidth = 3.5; ctx.stroke();
    chamfer(ctx, G.x0 + 12, G.y0 + 12, G.bw - 24, G.bh - 24, 22);
    ctx.strokeStyle = 'rgba(124,255,178,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    // top tab
    const tw = 330, th = 34;
    ctx.beginPath(); ctx.moveTo(VC.x - tw / 2, G.y0 + 1); ctx.lineTo(VC.x - tw / 2 + 18, G.y0 - th); ctx.lineTo(VC.x + tw / 2 - 18, G.y0 - th); ctx.lineTo(VC.x + tw / 2, G.y0 + 1); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    if (fadeOthers > 0) hudText(ctx, 'FINAL ASSESSMENT', VC.x, G.y0 - th / 2 - 1, { align: 'center', size: 19, weight: 700, letterSpacing: 6, color: `rgba(20,14,4,${ba * fadeOthers})` });

    // ---- text ----
    ctx.save();
    ctx.translate(VC.x, VC.y); ctx.scale(sc, sc); ctx.translate(-VC.x, -VC.y);
    const sweepX = slammed ? lerp(G.x0 + G.bw + 200, G.x0 - 200, ease.inOutQuad(prog(t, 40.95, 41.4))) : null;
    VL.parts.forEach((p, i) => {
      const x = VC.x + p.cx, y = G.baseY;
      const a = p.kind === 'seven' ? ba : ba * fadeOthers;
      if (a <= 0) return;
      const sz = p.o.size;
      let fill, glowC, glow, stroke = 3, strokeC = 'rgba(0,30,15,0.9)';
      if (p.kind === 'label') { fill = goldGrad(ctx, y - sz * 0.9, y + sz * 0.2); glowC = 'rgba(200,162,74,0.7)'; glow = 14; strokeC = 'rgba(40,26,4,0.9)'; }
      else if (p.kind === 'white') { fill = whiteGrad(ctx, y - sz * 0.85, y + sz * 0.25); glowC = 'rgba(31,174,91,0.75)'; glow = 18; }
      else {
        fill = goldGrad(ctx, y - sz * 0.75, y + sz * 0.1); glowC = 'rgba(242,210,122,0.95)';
        glow = 26 + 14 * Math.sin((t - T_VERDICT) * Math.PI / 0.6) ** 2 + 30 * zp; strokeC = 'rgba(60,40,6,0.9)';
      }
      M.text(ctx, p.s, x, y, Object.assign({}, p.o, { align: 'center', baseline: 'alphabetic', color: fill, glow, glowColor: glowC, stroke, strokeColor: strokeC, alpha: a }));
      // specular sweep (additive band moving across the metal)
      if (sweepX !== null) {
        const sg = ctx.createLinearGradient(sweepX - 90, y - 120, sweepX + 90, y + 40);
        sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,252,235,0.85)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        M.text(ctx, p.s, x, y, Object.assign({}, p.o, { align: 'center', baseline: 'alphabetic', color: sg, alpha: a * 0.9 }));
        ctx.restore();
      }
    });
    drawSevenLock(ctx, t, G, slammed, dt, lockP, fadeOthers);
    // zoom blur ghosts of the «٧»
    if (zp > 0) {
      const p = VL.seven; const x = VC.x + p.cx, y = G.baseY;
      ctx.globalCompositeOperation = 'lighter';
      for (let q = 1; q <= 3; q++) {
        const k2 = 1 + q * 0.035 * Math.min(1, zp * 3);
        ctx.save(); ctx.translate(G.tgtX, G.tgtY); ctx.scale(k2, k2); ctx.translate(-G.tgtX, -G.tgtY);
        M.text(ctx, p.s, x, y, Object.assign({}, p.o, { align: 'center', baseline: 'alphabetic', color: q % 2 ? '#F2D27A' : '#fff1c0', alpha: 0.22 * (1 - q / 4) * Math.min(1, zp * 4) }));
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  // reticle converging onto the «٧» while locking; after the slam it becomes gold corner ticks
  function drawSevenLock(ctx, t, G, slammed, dt, lockP, fo) {
    if (!slammed) {
      const rr = lerp(430, 96, ease.inOutCubic(lockP));
      const rot = (t - 40.32) * 4;
      ctx.save(); ctx.translate(G.sevCX, G.sevCY); ctx.rotate(rot);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${HUD},${0.55 + 0.4 * lockP})`; ctx.lineWidth = 2.4;
      for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.arc(0, 0, rr, q * Math.PI / 2 + 0.22, q * Math.PI / 2 + Math.PI / 2 - 0.22); ctx.stroke(); }
      ctx.lineWidth = 3; ctx.beginPath();
      for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2; ctx.moveTo(Math.cos(a) * (rr - 14), Math.sin(a) * (rr - 14)); ctx.lineTo(Math.cos(a) * (rr + 24), Math.sin(a) * (rr + 24)); }
      ctx.stroke();
      ctx.setLineDash([4, 8]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, rr * 0.62, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      return;
    }
    if (fo <= 0) return;
    const bb = VL.bbox;
    const pad = 12 + 26 * Math.exp(-dt * 16);
    const x0 = G.sevX + bb.x0 - pad, x1 = G.sevX + bb.x1 + pad, y0 = G.baseY + bb.y0 - pad, y1 = G.baseY + bb.y1 + pad;
    const L = 18;
    ctx.save();
    ctx.globalAlpha = fo;
    ctx.beginPath();
    bracketPath(ctx, x0, y0, 1, 1, L); bracketPath(ctx, x1, y0, -1, 1, L);
    bracketPath(ctx, x0, y1, 1, -1, L); bracketPath(ctx, x1, y1, -1, -1, L);
    ctx.strokeStyle = 'rgba(242,210,122,0.25)'; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = '#F2D27A'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  // impact FX in screen space at 40.8
  function drawSlamFX(ctx, t) {
    if (!after(t, T_VERDICT)) return;
    const dt = t - T_VERDICT;
    if (dt > 1.0) return;
    const G = verdictGeo();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // shockwave: the box outline punches outward + a wide ring outside it
    {
      const k = clamp(dt / 0.5);
      if (k < 1) {
        const grow = 420 * ease.outCubic(k);
        chamfer(ctx, G.x0 - grow, G.y0 - grow * 0.55, G.bw + 2 * grow, G.bh + grow * 1.1, 30 + grow * 0.3);
        const fk = (1 - k) * (1 - k);
        ctx.strokeStyle = `rgba(${GOLD},${0.8 * fk})`; ctx.lineWidth = 3 + 26 * (1 - k); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.65 * fk})`; ctx.lineWidth = 2; ctx.stroke();
      }
      const k2 = clamp((dt - 0.04) / 0.75);
      if (k2 > 0 && k2 < 1) {
        const rad = 760 + 900 * ease.outCubic(k2);
        ctx.strokeStyle = `rgba(${GOLD},${0.35 * (1 - k2)})`; ctx.lineWidth = 40 * (1 - k2) + 2;
        ctx.beginPath(); ctx.ellipse(VC.x, VC.y, rad, rad * 0.6, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // anamorphic streak
    const sa = Math.exp(-dt * 5);
    let g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(242,210,122,0)'); g.addColorStop(0.5, `rgba(255,248,225,${0.9 * sa})`); g.addColorStop(1, 'rgba(242,210,122,0)');
    ctx.fillStyle = g; ctx.fillRect(0, VC.y - 2, W, 4);
    g = ctx.createLinearGradient(0, VC.y - 60, 0, VC.y + 60);
    g.addColorStop(0, 'rgba(242,210,122,0)'); g.addColorStop(0.5, `rgba(242,210,122,${0.22 * sa})`); g.addColorStop(1, 'rgba(242,210,122,0)');
    ctx.fillStyle = g; ctx.fillRect(0, VC.y - 60, W, 120);
    // sparks from the box perimeter
    for (let i = 0; i < 64; i++) {
      const life = 0.45 + 0.5 * hash(i, 701);
      if (dt > life) continue;
      const side = Math.floor(hash(i, 702) * 4), al = hash(i, 703);
      let x, y, nx, ny;
      if (side === 0) { x = G.x0 + al * G.bw; y = G.y0; nx = 0; ny = -1; }
      else if (side === 1) { x = G.x0 + al * G.bw; y = G.y0 + G.bh; nx = 0; ny = 1; }
      else if (side === 2) { x = G.x0; y = G.y0 + al * G.bh; nx = -1; ny = 0; }
      else { x = G.x0 + G.bw; y = G.y0 + al * G.bh; nx = 1; ny = 0; }
      const sp = 350 + 900 * hash(i, 704), tang = (hash(i, 705) - 0.5) * 1.4;
      const vx = (nx + (ny !== 0 ? tang : 0)) * sp, vy = (ny + (nx !== 0 ? tang : 0)) * sp;
      const px = x + vx * dt, py = y + vy * dt + 1100 * dt * dt;
      const a = 1 - dt / life;
      ctx.strokeStyle = hash(i, 706) > 0.4 ? `rgba(255,236,180,${a})` : `rgba(255,255,255,${a})`;
      ctx.lineWidth = 1.5 + 1.5 * hash(i, 707);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - vx * 0.035, py - (vy + 2200 * dt) * 0.035); ctx.stroke();
    }
    ctx.restore();
    // flash
    const fa = 0.62 * Math.exp(-dt * 13);
    if (fa > 0.005) M.fill(ctx, '#fff8e6', fa);
  }

  function drawZoomFX(ctx, t, Z) {
    if (Z.p <= 0) return;
    const p = Z.p;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // radial speed lines converging on the «٧»
    const cx = lerp(Z.G.tgtX, 960, Z.e2), cy = lerp(Z.G.tgtY, 540, Z.e2);
    for (let i = 0; i < 90; i++) {
      const ang = hash(i, 801) * Math.PI * 2;
      const ph = frac(hash(i, 802) + (t - T_ZOOM) * (1.6 + 1.6 * hash(i, 803)));
      const r0 = 80 + ph * 1300, len = (60 + 380 * hash(i, 804)) * (0.3 + p * 1.5);
      const a = (0.12 + 0.5 * p) * Math.sin(Math.PI * ph);
      ctx.strokeStyle = hash(i, 805) > 0.5 ? `rgba(${GOLD},${a})` : `rgba(255,255,255,${a * 0.8})`;
      ctx.lineWidth = 1 + 2.5 * hash(i, 806) * p;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len)); ctx.stroke();
    }
    // central bloom
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 900);
    bg.addColorStop(0, `rgba(242,210,122,${0.35 * p})`); bg.addColorStop(1, 'rgba(242,210,122,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // end flash bridging into S6's impact
    const fl = ease.inQuad(prog(t, 41.74, T_END));
    if (fl > 0) M.fill(ctx, '#fff6dc', 0.92 * fl);
  }

  // =====================================================================
  // ENTRANCE: S4 dust fills the screen → blasts open into the holo display
  // =====================================================================
  function drawEntrance(ctx, t) {
    if (t > 34.5) return;
    const p = prog(t, 34.0, 34.36);
    const R = 1500 * ease.outCubic(p);           // clearing radius (elliptical metric)
    const fade = 1 - sstep(34.16, 34.44, t);
    const solid = R < 2;
    // warm sunlit haze lingering over the display
    M.fill(ctx, '#d9b47a', 0.26 * (1 - sstep(34.08, 34.48, t)));
    ctx.save();
    ctx.translate(960, 540); ctx.scale(1.3, 0.88);
    if (solid) { ctx.fillStyle = '#cda672'; ctx.fillRect(-900, -700, 1800, 1400); }
    else {
      const g = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, R + 60);
      g.addColorStop(0, 'rgba(214,176,120,0)');
      g.addColorStop(0.5, `rgba(206,168,112,${0.7 * fade})`);
      g.addColorStop(1, `rgba(198,160,108,${fade})`);
      ctx.fillStyle = g; ctx.fillRect(-900, -700, 1800, 1400);
    }
    ctx.restore();
    // billowing dust puffs: cover the frame at 34.0, blown outward by the holo boot
    for (let i = 0; i < 44; i++) {
      const ang = hash(i, 901) * Math.PI * 2;
      const r0 = 60 + 820 * Math.sqrt(hash(i, 902));
      const rr = r0 + R * (0.55 + 0.35 * hash(i, 905));
      const mask = solid ? 1 : sstep(R * 0.4, R * 0.95, rr);
      const a = (0.35 + 0.4 * hash(i, 904)) * fade * mask;
      if (a <= 0.01) continue;
      const x = 960 + Math.cos(ang) * rr * 1.3, y = 540 + Math.sin(ang) * rr * 0.88;
      const sz = (190 + 260 * hash(i, 903)) * (1 + 0.6 * p);
      const tone = hash(i, 906);
      const c0 = tone > 0.6 ? '246,222,176' : tone > 0.25 ? '222,188,134' : '176,136,90';
      const pg = ctx.createRadialGradient(x - sz * 0.22, y - sz * 0.28, 0, x, y, sz);
      pg.addColorStop(0, `rgba(${c0},${a})`); pg.addColorStop(0.55, `rgba(${c0},${a * 0.55})`); pg.addColorStop(1, `rgba(${c0},0)`);
      ctx.fillStyle = pg; ctx.fillRect(x - sz, y - sz, sz * 2, sz * 2);
    }
    // QA: S4's last dust frame is ~8% darker than this one — dim the first frames so the 34.0 cut doesn't brighten
    M.fill(ctx, '#3a2814', 0.09 * (1 - prog(t, 34.0, 34.15)));
    if (!solid) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // soft holo energy front riding the clearing edge
      const fa = (1 - p) * fade;
      ctx.save(); ctx.translate(960, 540); ctx.scale(1.3, 0.88);
      const rg = ctx.createRadialGradient(0, 0, R * 0.45, 0, 0, R * 0.72);
      rg.addColorStop(0, 'rgba(124,255,178,0)'); rg.addColorStop(0.75, `rgba(170,255,210,${0.2 * fa})`); rg.addColorStop(1, 'rgba(124,255,178,0)');
      ctx.fillStyle = rg; ctx.fillRect(-R, -R, 2 * R, 2 * R);
      ctx.restore();
      // grit streaking outward (motion-blurred)
      for (let i = 0; i < 80; i++) {
        const ang = hash(i, 911) * Math.PI * 2;
        const r0 = R * (0.5 + 0.55 * hash(i, 912));
        const len = (40 + 140 * hash(i, 913)) * (1 - p * 0.5);
        ctx.strokeStyle = `rgba(255,232,190,${0.5 * fade * (0.4 + 0.6 * hash(i, 914))})`; ctx.lineWidth = 1 + 1.5 * hash(i, 915);
        ctx.beginPath(); ctx.moveTo(960 + Math.cos(ang) * r0 * 1.3, 540 + Math.sin(ang) * r0 * 0.88);
        ctx.lineTo(960 + Math.cos(ang) * (r0 + len) * 1.3, 540 + Math.sin(ang) * (r0 + len) * 0.88); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // =====================================================================
  // MAIN
  // =====================================================================
  function init(ctx) {
    if (!TER) initTerrain();
    if (!BG) makeBG();
    if (!TITLE) makeTitle();
    if (!VL) makeVerdictLayout(ctx);
  }

  function draw(ctx, lt, t) {
    init(ctx);
    const cam = makeCam(t);
    const Z = zoomState(t);
    // camera shake: entrance, blips, slam, riser
    let amp = 9 * (1 - sstep(34.0, 34.35, t));
    IND.forEach((I) => { amp += 6 * decay(t, I.cue, 14); });
    amp += 26 * decay(t, T_VERDICT, 7.5);
    amp += 9 * Math.pow(Z.p, 1.5);
    const sh = M.shake(t, amp, 22, 55);
    ctx.translate(W / 2 + sh.x, H / 2 + sh.y); ctx.rotate(sh.r); ctx.translate(-W / 2, -H / 2);

    // ---------- base display ----------
    const baseVis = 1 - sstep(T_ZOOM + 0.02, T_ZOOM + 0.4, t);
    if (baseVis > 0) {
      ctx.save();
      applyZoom(ctx, Z, Z.sB);
      const vp = sstep(40.3, T_VERDICT, t);
      if (t < 34.7) { const k = 1 + 0.07 * (1 - ease.outCubic(prog(t, 34.0, 34.7))); ctx.translate(960, 540); ctx.scale(k, k); ctx.translate(-960, -540); }
      if (vp > 0) { const k = 1 - 0.04 * vp; ctx.translate(960, 540); ctx.scale(k, k); ctx.translate(-960, -540); }
      drawBackground(ctx, t, cam);
      drawShafts(ctx, t);
      drawMap(ctx, t, cam);
      drawLeaders(ctx, t, cam);
      drawDataColumns(ctx, t);
      drawFrameHUD(ctx, t);
      drawTitle(ctx, t);
      drawPanel(ctx, t);
      drawBottom(ctx, t);
      drawRadar(ctx, t);
      drawBokeh(ctx, t, cam);
      // scanlines + rolling hologram band
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath();
      for (let y = 0; y < H; y += 3) ctx.rect(0, y, W, 1);
      ctx.fill();
      const by = frac((t - T0) / 2.4) * (H + 400) - 200;
      const bg = ctx.createLinearGradient(0, by - 120, 0, by + 120);
      bg.addColorStop(0, 'rgba(124,255,178,0)'); bg.addColorStop(0.5, 'rgba(124,255,178,0.045)'); bg.addColorStop(1, 'rgba(124,255,178,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = bg; ctx.fillRect(0, by - 120, W, 240); ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      // verdict dim
      if (vp > 0) M.fill(ctx, '#010605', 0.66 * vp);
    }
    if (baseVis < 1) M.fill(ctx, '#000', 1 - baseVis);

    // ---------- verdict ----------
    ctx.save();
    applyZoom(ctx, Z, Z.s);
    drawVerdict(ctx, t, Z);
    ctx.restore();
    drawSlamFX(ctx, t);
    drawZoomFX(ctx, t, Z);

    // ---------- entrance dust ----------
    drawEntrance(ctx, t);
  }

  M.registerScene({ id: 's5_analysis', start: 34.0, end: 42.0, z: 0, draw });
})();
