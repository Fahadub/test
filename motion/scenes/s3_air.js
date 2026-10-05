/*
 * S3 — Air force · 12.0 – 24.0
 *
 *  12.0  continues S2's upward whip-pan: vertical motion blur + streaks resolve into a high-altitude golden sky
 *        (we tilt up past big cloud tops over the desert to the horizon and the sun)
 *  12.0–15.0  lead fighter dives out of the sun, the camera whips to follow it; closest pass at 14.4
 *        (big, fast, motion blur, vapour sheath, wingtip vortices, heat shimmer, flash + camera shake),
 *        then it climbs away with contrails; three wingmen stream across behind the titles
 *  15.0  lower-third «سلاح الجو الملكي السعودي» snaps in with HUD brackets
 *  16.2  «صقور السماء» slams in above it (metallic gold), brackets expand
 *  17.4  CUT: chase view behind a four-ship climbing toward the sun
 *  18.6  afterburners ignite (left → right, ~1 frame apart = audio), flash, pressure halos, shake; jets surge into the sun
 *  20.4  CUT: cockpit HUD in a shallow dive over empty desert: conformal pitch ladder, heading / speed / altitude
 *        tapes (Latin numerals), target box tightening on an abstract range marker at each lock beep; LOCK at 21.6
 *  22.2  missile leaves the rail → smoke streak → impact on the empty marker at 22.8 (drum boom)
 *  23.4  a wingman roars past the camera right → left (peak 23.68), filling the frame; its trailing edge + exhaust
 *        blooms end at x ≈ 1070 so S4's entrance (edge at x = 900 at 24.0) continues the wipe
 *
 * World: per-pixel shaded dune heightfield + cloud field baked once into a 1:1 panorama (azimuth ↔ column), so the
 * rotating cameras of shots A/B only blit a window of it. Every frame is a pure function of t; caches hold only
 * t-independent content (terrain plates, panorama, sky gradients, text sprites); scratch canvases are fully cleared.
 */
(function () {
  'use strict';
  const M = window.M;
  const { clamp, lerp, prog, ease, hash, noise1 } = M;
  const W = 1920, H = 1080, FPS = 30, TAU = Math.PI * 2;
  const A = () => M.assets;
  const U = () => M.assets.util;

  // ---------------------------------------------------------------- timeline
  const T0 = 12.0, T_PEAK = 14.4, T_LT = 15.0, T_SUB = 16.2, T_FORM = 17.4, T_AB = 18.6,
    T_HUD = 20.4, T_LOCK = 21.6, T_MSL = 22.2, T_IMP = 22.8, T_WIPE = 23.4, T_END = 24.0;
  const BEEPS = [20.4, 20.6, 20.78, 20.94, 21.08, 21.2, 21.30, 21.39, 21.47];   // = audio lock beeps
  const AB_ORDER = [0, 0.035, 0.07, 0.11];                                       // ignition stagger, left → right

  const STR_LT = 'سلاح الجو الملكي السعودي';
  const STR_SUB = 'صقور السماء';

  // ---------------------------------------------------------------- helpers
  const decay = (t, c, rate) => (t >= c ? Math.exp(-(t - c) * rate) : 0);
  const pulse = (t, c, rise, rate) => (t < c - rise ? 0 : t < c ? Math.pow((t - c + rise) / rise, 2) : Math.exp(-(t - c) * rate));
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  const SCR = {};
  function scratch(key, w = W, h = H) {
    let c = SCR[key];
    if (!c || c.width !== w || c.height !== h) c = SCR[key] = mk(w, h);
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
    return c;
  }
  const wrap = (v, a, b) => a + ((((v - a) % (b - a)) + (b - a)) % (b - a));
  const glow = (ctx, x, y, r, c, a) => U().glow(ctx, x, y, r, c, a);
  const smoothstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };

  // composite the (w × h, default: whole) top-left region of `src` onto ctx at (x, y) with a box motion blur of
  // total length (dx, dy) px — exact average via 'lighter' accumulation, two passes (fine × coarse taps)
  const BW = W + 512, BH = H + 512;
  function blurBlit(ctx, src, dx, dy, x = 0, y = 0, w = src.width, h = src.height) {
    const L = Math.hypot(dx, dy);
    if (L < 1.5) { ctx.drawImage(src, 0, 0, w, h, x, y, w, h); return; }
    const n1 = L < 14 ? Math.max(2, Math.ceil(L / 3)) : 4;
    const n2 = L < 14 ? 1 : Math.min(6, Math.ceil(L / (n1 * 5)));
    const N = n1 * n2;
    const R = Math.round;
    const B = scratch('blurB', BW, BH), g = B.getContext('2d');
    g.clearRect(0, 0, w + 2, h + 2);
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 / n1;
    g.beginPath(); g.rect(0, 0, w, h); g.clip();
    for (let i = 0; i < n1; i++) {
      const k = n2 === 1 ? (i + 0.5) / n1 - 0.5 : (i + 0.5) / N - 0.5 / n2;
      g.drawImage(src, 0, 0, w, h, R(dx * k), R(dy * k), w, h);
    }
    g.restore();
    if (n2 === 1) { ctx.drawImage(B, 0, 0, w, h, x, y, w, h); return; }
    const C = scratch('blurC', BW, BH), g2 = C.getContext('2d');
    g2.clearRect(0, 0, w + 2, h + 2);
    g2.save(); g2.globalCompositeOperation = 'lighter'; g2.globalAlpha = 1 / n2;
    g2.beginPath(); g2.rect(0, 0, w, h); g2.clip();
    for (let j = 0; j < n2; j++) { const k = (j + 0.5) / n2 - 0.5; g2.drawImage(B, 0, 0, w, h, R(dx * k), R(dy * k), w, h); }
    g2.restore();
    ctx.drawImage(C, 0, 0, w, h, x, y, w, h);
  }

  // ================================================================ terrain: per-pixel shaded dune heightfield (built once, t-independent)
  const RV = new Float32Array(256), PERM = new Uint8Array(512);
  (function () {
    const r = M.rng(9137);
    for (let i = 0; i < 256; i++) { RV[i] = r(); PERM[i] = i; }
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const tmp = PERM[i]; PERM[i] = PERM[j]; PERM[j] = tmp; }
    for (let i = 0; i < 256; i++) PERM[i + 256] = PERM[i];
  })();
  function vn(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = RV[PERM[PERM[X] + Y]], b = RV[PERM[PERM[X + 1] + Y]], c = RV[PERM[PERM[X] + Y + 1]], d = RV[PERM[PERM[X + 1] + Y + 1]];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const DA = 0.42, DCA = Math.cos(DA), DSA = Math.sin(DA);
  const DB = 0.42 + 1.18, DCB = Math.cos(DB), DSB = Math.sin(DB);
  // asymmetric dune profile over one period f ∈ [0,1): long windward rise, short steep slip face
  const duneProf = (f, c) => (f < c ? Math.pow(f / c, 1.6) : Math.pow((1 - f) / (1 - c), 0.75));
  // ground height (m) at ground point (x, y); w / w2 = visibility of the dune ridges / small dunes (LOD)
  // dunes = ridged value noise (crests on the 0.5 iso-lines), anisotropic along the wind axis, domain-warped
  function terrainH(x, y, w, w2) {
    let h = 160 * (vn(x * 1.1e-4 + 3.3, y * 1.1e-4 + 1.7) - 0.5) + 60 * (vn(x * 3e-4 + 7.1, y * 3e-4 + 2.9) - 0.5);
    if (w > 0.001) {
      const p = x * DCA + y * DSA, q = -x * DSA + y * DCA;
      let P = p / 3400, Q = q / 1000;
      Q += 0.9 * (vn(P * 0.6 + 4.1, Q * 0.25 + 2.2) - 0.5);
      P += 0.5 * (vn(P * 0.5 + 9.7, Q * 0.5 + 6.6) - 0.5);
      const v1 = 2 * vn(P, Q) - 1, r1 = 1.06 - Math.sqrt(v1 * v1 + 0.012);
      const pres = vn(P * 0.35 + 1.7, Q * 0.2 + 5.3);
      h += w * 95 * r1 * r1 * r1 * (0.35 + 0.65 * pres);
      if (w2 > 0.001) {
        const v2 = 2 * vn(P * 2.1 + 3.3, Q * 2.3 + 8.8) - 1, r2 = 1.06 - Math.sqrt(v2 * v2 + 0.012);
        h += w2 * 26 * r2 * r2 * r2;
      }
    }
    return h;
  }
  /**
   * Render the desert seen from a camera at height camH (m), cylindrical projection with focal Fp (px/rad):
   * plate column ↔ azimuth phi (phiMin … phiMax), plate row ↔ depression angle below the horizon (row 0 = horizon).
   * Returns {c, res, phiMin, rows}. Drawn at 1/res scale.
   */
  function buildTerrain(o) {
    const Fp = o.F, res = o.res, camH = o.camH;
    const pw = Math.ceil((o.phiMax - o.phiMin) * Fp * res), ph = Math.ceil(o.rows * res);
    const Hh = new Float32Array(pw * ph), Zz = new Float32Array(ph), FL = new Float32Array(ph);
    const SP = new Float32Array(pw), CP = new Float32Array(pw);
    for (let i = 0; i < pw; i++) { const phi = o.phiMin + (i + 0.5) / (Fp * res); SP[i] = Math.sin(phi); CP[i] = Math.cos(phi); }
    const ox = o.ox || 0, oy = o.oy || 0;
    for (let j = 0; j < ph; j++) {
      const beta = Math.max(0.0004, ((j + 0.5) / res) / Fp);
      const z = camH / Math.tan(beta);
      const sb = Math.sin(beta);
      const fl = z / (Fp * res), fr = camH / (sb * sb * Fp * res);
      const fp = Math.max(fl, fr);
      Zz[j] = z; FL[j] = fl;
      const w = clamp(1.7 - fp / 230), w2 = clamp(1.6 - fp / 60);
      const row = j * pw;
      for (let i = 0; i < pw; i++) Hh[row + i] = terrainH(z * SP[i] + ox, z * CP[i] + oy, w, w2);
    }
    const c = mk(pw, ph), g = c.getContext('2d');
    const img = g.createImageData(pw, ph), d = img.data;
    const el = o.sunEl, cE = Math.cos(el), sE = Math.sin(el);
    const sunC = o.sunC || [1.0, 0.76, 0.48], skyC = o.skyC || [0.28, 0.31, 0.46];
    const hzA = o.hazeAway || [0.93, 0.74, 0.6], hzS = o.hazeSun || [1.0, 0.86, 0.66];
    const fogD = o.fogD || 38000;
    for (let j = 0; j < ph; j++) {
      const z = Zz[j], fl = FL[j];
      const jm = Math.max(0, j - 1), jp = Math.min(ph - 1, j + 1);
      const drad = Math.max(1, Zz[jm] - Zz[jp]);
      const fog = 1 - Math.exp(-z / fogD) * clamp(j / (3 * res));
      const row = j * pw;
      for (let i = 0; i < pw; i++) {
        const k = row + i;
        const dhl = 1.9 * (Hh[row + Math.min(pw - 1, i + 1)] - Hh[row + Math.max(0, i - 1)]) / (2 * fl);
        const dhr = 1.9 * (Hh[jm * pw + i] - Hh[jp * pw + i]) / drad;
        const sa = o.sunAz - (o.phiMin + (i + 0.5) / (Fp * res));
        const Ll = Math.sin(sa) * cE, Lr = Math.cos(sa) * cE;
        const inv = 1 / Math.sqrt(dhl * dhl + dhr * dhr + 1);
        const ndl = (-dhl * Ll - dhr * Lr + sE) * inv;
        const lam = ndl > 0 ? ndl : 0;
        const x = z * SP[i] + ox, y = z * CP[i] + oy;
        const n = vn(x * 1.3e-4 + 5.2, y * 1.3e-4 + 2.6), n2 = vn(x * 7e-4 + 1.1, y * 7e-4 + 8.3);
        const hk = clamp((Hh[k] + 40) / 140);
        const ar = (0.86 + 0.1 * n - 0.06 * n2) * (0.82 + 0.25 * hk), ag = (0.53 + 0.12 * n - 0.05 * n2) * (0.8 + 0.27 * hk), ab = (0.3 + 0.08 * n - 0.03 * n2) * (0.85 + 0.2 * hk);
        const sky = 0.55 + 0.45 * inv;
        let r = ar * (sunC[0] * lam * 1.95 + skyC[0] * sky), gg = ag * (sunC[1] * lam * 1.95 + skyC[1] * sky), b = ab * (sunC[2] * lam * 1.95 + skyC[2] * sky);
        r = r / (1 + 0.28 * r); gg = gg / (1 + 0.28 * gg); b = b / (1 + 0.28 * b);
        const cs = Math.cos(sa), sk = cs > 0 ? cs * cs * cs : 0;
        const hr = hzA[0] + (hzS[0] - hzA[0]) * sk, hg = hzA[1] + (hzS[1] - hzA[1]) * sk, hb = hzA[2] + (hzS[2] - hzA[2]) * sk;
        d[k * 4] = 255 * (r + (hr - r) * fog);
        d[k * 4 + 1] = 255 * (gg + (hg - gg) * fog);
        d[k * 4 + 2] = 255 * (b + (hb - b) * fog);
        d[k * 4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return { c, g, res, phiMin: o.phiMin, phiMax: o.phiMax, rows: o.rows, F: Fp, camH };
  }

  // ---- shot A world: camera 5 km above the desert, sun low on the left of the initial view
  const F = 1500, HY = 690;                    // focal length (px/rad), horizon line
  const SUN_TH = -1.47, SUN_Y = 300, SUN_EL = (HY - SUN_Y) / F;
  const CAM_H = 3800, CLOUD_DH = 1000;         // camera height, cloud-top depth below the camera (m)
  // low cumulus field (world layout, t-independent): azimuth phi, ground distance z, radius R (m)
  let LOWC = null;
  function lowClouds() {
    if (LOWC) return LOWC;
    LOWC = [];
    let i = 0;
    for (let zr = 0; zr < 26; zr++) {
      const z = 2000 * Math.pow(1.17, zr);
      const dphi = Math.min(0.16, 3200 / z);
      for (let phi = -2.5; phi < 2.0; phi += dphi) {
        const h1 = hash(i, 71), h2 = hash(i, 72), h3 = hash(i, 73), h4 = hash(i, 74);
        i++;
        const pz = z * (1 + (h2 - 0.5) * 0.15), pp = phi + (h1 - 0.5) * dphi * 0.8;
        const dens = vn(Math.sin(pp) * pz * 4e-5 + 3.1, Math.cos(pp) * pz * 4e-5 + 7.7);
        if (dens < 0.45 || h4 > 0.45 + 0.5 * (dens - 0.45)) continue;
        LOWC.push({ phi: pp, z: pz, R: 900 + 1500 * h3 * dens, idx: Math.floor(hash(i, 75) * 8), flip: h1 > 0.6, i });
      }
    }
    LOWC.sort((a, b) => b.z - a.z);
    return LOWC;
  }
  let TERA = null;
  function terrainA() {
    if (TERA) return TERA;
    TERA = buildTerrain({ F, res: 0.5, camH: CAM_H, phiMin: -2.45, phiMax: 1.98, rows: 1360, sunAz: SUN_TH, sunEl: SUN_EL, fogD: 62000, ox: 1234, oy: -777, hazeAway: [0.9, 0.7, 0.58], hazeSun: [1.0, 0.84, 0.64] });
    // cloud shadows on the ground (long shadows from the low sun)
    const g = TERA.g, res = TERA.res;
    const sx = Math.sin(SUN_TH), sy = Math.cos(SUN_TH), L = (CAM_H - CLOUD_DH) / Math.tan(SUN_EL);
    g.save(); g.globalCompositeOperation = 'multiply';
    for (const cl of lowClouds()) {
      const gx = cl.z * Math.sin(cl.phi) - sx * L, gyy = cl.z * Math.cos(cl.phi) - sy * L;
      const zs = Math.hypot(gx, gyy), ps = Math.atan2(gx, gyy);
      if (zs < 500) continue;
      const px = (ps - TERA.phiMin) * F * res, py = Math.atan(CAM_H / zs) * F * res;
      const rx = F * cl.R * 1.1 / zs * res, ry = F * CAM_H * cl.R / (zs * zs + CAM_H * CAM_H) * res * 1.6;
      if (rx < 0.6) continue;
      g.save(); g.translate(px, py); g.scale(1, Math.max(0.05, ry / rx));
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      const a = 0.38 * clamp(1 - zs / 120000);
      const sc = (k) => `rgb(${255 - (255 - 150) * a * k | 0},${255 - (255 - 132) * a * k | 0},${255 - (255 - 150) * a * k | 0})`;
      rg.addColorStop(0, sc(1)); rg.addColorStop(0.45, sc(0.85)); rg.addColorStop(0.8, sc(0.3)); rg.addColorStop(1, sc(0));
      g.fillStyle = rg; g.fillRect(-rx, -rx, rx * 2, rx * 2);
      g.restore();
    }
    g.restore();
    return TERA;
  }

  // vertical sky gradient (horizontally uniform) – cached per preset
  const SKYC = {};
  function skyGrad(key, h, stops) {
    if (SKYC[key]) return SKYC[key];
    const c = mk(W + 160, h), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, h);
    for (const [k, col] of stops) gr.addColorStop(k, col);
    g.fillStyle = gr; g.fillRect(0, 0, c.width, h);
    return (SKYC[key] = c);
  }
  const skyA = () => skyGrad('A', 860, [[0, '#0e1f3c'], [0.25, '#1b3459'], [0.5, '#3a4f73'], [0.68, '#8a6a6c'], [0.82, '#d98e5c'], [0.93, '#f5b578'], [1, '#ffd8a0']]);

  // ================================================================ text sprites (metallic, t-independent)
  const SPR = {};
  function metalSprite(key, str, o, pal) {
    if (SPR[key]) return SPR[key];
    const tmp = mk(4, 4).getContext('2d');
    const tw = M.measure(tmp, str, o);
    const w = Math.ceil(tw + o.size * 1.4), h = Math.ceil(o.size * 2.6);
    const c = mk(w, h), g = c.getContext('2d');
    const cx = w / 2, cy = h / 2;
    M.text(g, str, cx, cy + o.size * 0.08, Object.assign({}, o, { color: 'rgba(8,4,0,0.8)', shadow: o.size * 0.3 }));
    const depth = Math.max(3, Math.round(o.size * 0.055));
    for (let k = depth; k >= 1; k--) M.text(g, str, cx, cy + k, Object.assign({}, o, { color: pal.extrude }));
    M.text(g, str, cx, cy, Object.assign({}, o, { color: pal.outline, stroke: Math.max(3, o.size * 0.06), strokeColor: pal.outline }));
    M.text(g, str, cx, cy - Math.max(1.5, o.size * 0.022), Object.assign({}, o, { color: pal.hi }));
    const gr = g.createLinearGradient(0, cy - o.size * 0.62, 0, cy + o.size * 0.55);
    pal.face.forEach(([k, col]) => gr.addColorStop(k, col));
    M.text(g, str, cx, cy + 0.6, Object.assign({}, o, { color: gr }));
    const m = mk(w, h), mg = m.getContext('2d');
    M.text(mg, str, cx, cy + 0.6, Object.assign({}, o, { color: '#fff' }));
    return (SPR[key] = { c, m, w, h, tw });
  }
  const GOLD = {
    extrude: '#4a2f08', outline: '#1e1203', hi: '#fff6d8',
    face: [[0, '#fffbe8'], [0.2, '#f8e09a'], [0.42, '#d6ae55'], [0.5, '#8c6420'], [0.56, '#c99a40'], [0.75, '#f2d27a'], [0.9, '#ffe9a8'], [1, '#a8792c']],
  };
  const SILVER = {
    extrude: '#1c242c', outline: '#0a0e12', hi: '#ffffff',
    face: [[0, '#ffffff'], [0.38, '#eef3f6'], [0.5, '#a9b6c0'], [0.58, '#dfe7ec'], [0.85, '#ffffff'], [1, '#c3ccd2']],
  };
  const ltSpr = () => metalSprite('lt', STR_LT, { size: 54, family: 'arabic', weight: 900 }, SILVER);
  const subSpr = () => metalSprite('sub', STR_SUB, { size: 124, family: 'kufi', weight: 700 }, GOLD);
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
      const gr = g.createLinearGradient(bx - 80, 0, bx + 80, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,252,235,${opt.specA || 0.9})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.setTransform(1, 0, -0.35, 1, S.h * 0.175, 0);
      g.fillStyle = gr; g.fillRect(bx - 80, 0, 160, S.h);
      g.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(_spec, 0, 0, S.w, S.h, -S.w / 2, -S.h / 2, S.w, S.h);
    }
    if (opt.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * Math.min(1, opt.flash);
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

  // ================================================================ SHOT A (12.0 – 17.4): flyby
  const JV = 120, JD = 18, KTR = 0.8;          // lead speed (m/s), closest distance (m), camera tracking gain
  // lead jet world position (camera at origin, closest point straight ahead at depth JD); Y = metres above eye level
  function leadPos(t, delay = 0, dz = 0) {
    const s = t - T_PEAK - delay;
    const X = JV * s;
    const Y = 1.6 + 35 * (Math.sqrt(s * s + 0.25) - 0.5) - 5 * s + (s > 0 ? 4 * s * s * s / (1 + s) : 0);
    return { X, Y, Z: JD + dz, s };
  }
  const camTheta = (t) => KTR * Math.atan2(leadPos(t).X, JD);
  function tiltOff(t) { const p = prog(t, T0, T0 + 0.66); return -820 * Math.pow(1 - p, 3); }
  // world (X, Y, Z) → screen (cylindrical projection)
  function projA(t, X, Y, Z, th, tilt) {
    const a = Math.atan2(X, Z), r = Math.hypot(X, Z), r3 = Math.hypot(X, Y, Z);
    return { x: W / 2 + F * (a - th), y: HY + tilt - F * Math.atan2(Y, r), a, r3, e: Math.atan2(Y, r) };
  }
  function jetPoseA(t, delay = 0, dz = 0) {
    const th = camTheta(t), tl = tiltOff(t);
    const p = leadPos(t, delay, dz);
    const q = projA(t, p.X, p.Y, p.Z, th, tl);
    const p2 = leadPos(t + 0.02, delay, dz);
    const climb = Math.atan2(p2.Y - p.Y, Math.hypot(p2.X - p.X, p2.Z - p.Z));
    const s = p.s;
    const roll = -0.28 * Math.exp(-Math.pow((s + 0.9) / 0.9, 2)) + 0.42 * smoothstep(0.2, 2.2, s) + 0.05 * Math.sin(t * 1.7);
    return { x: q.x, y: q.y, scale: 19.4 * F / q.r3 / 500, yaw: q.a, pitch: climb, roll, elev: -q.e, s, r3: q.r3 };
  }
  function shakeA(t) {
    const s = t - T_PEAK;
    return 30 * Math.exp(-Math.pow(s / 0.16, 2)) + (s > 0 ? 18 * Math.exp(-s * 4) : 0) + 4 * decay(t, T_LT, 7) + 6 * decay(t, T_SUB, 6) + 1.2;
  }

  // ---- static world panorama (sky + sun bloom + cirrus + desert + cloud field), built once at 1:1
  //      column ↔ azimuth (PH_MIN … PH_MAX), row PTOP = horizon. A camera that only rotates just blits a window of it.
  const PH_MIN = -2.45, PH_MAX = 1.98, PTOP = 1160, PBOT = 1260;
  function paintWorld(g, th, hy, vw, vh) {
    const inView = (x, w, y0, y1) => x + w / 2 > -60 && x - w / 2 < vw + 60 && y1 > -60 && y0 < vh + 60;
    g.drawImage(skyA(), 0, hy - 860, vw, 860);
    g.fillStyle = '#0e1f3c'; g.fillRect(0, 0, vw, Math.max(0, hy - 860) + 1);
    // sun bloom (warm side of the sky)
    const sx = vw / 2 + F * (SUN_TH - th), sy = SUN_Y - HY + hy;
    g.save(); g.globalCompositeOperation = 'screen';
    g.save(); g.translate(sx, hy); g.scale(3.0, 0.5); glow(g, 0, 0, 900, '#ff8a3a', 0.45); g.restore();
    glow(g, sx, sy, 1100, '#ff9050', 0.35);
    g.globalCompositeOperation = 'lighter';
    glow(g, sx, sy, 380, '#ffb868', 0.4);
    g.restore();
    // high cirrus (thin lit wisps)
    const puff = A().puffSprite;
    for (let i = 0; i < 16; i++) {
      const h1 = hash(i, 41), h2 = hash(i, 42), h3 = hash(i, 43);
      const x = vw / 2 + F * (-2.6 + 5 * h1 - th);
      if (!inView(x, 2400, 0, vh)) continue;
      const y = hy - 220 - 430 * h2;
      g.save(); g.translate(x, y); g.rotate(-0.06 + 0.12 * h3);
      for (let k = 0; k < 3; k++) {
        g.save(); g.translate((k - 1) * 160 * (0.6 + h3), (k - 1) * 9 * (h2 - 0.5)); g.scale(5 + 4 * h3, 0.28 + 0.1 * h2);
        A().drawPuff(g, puff(i * 3 + k, '#ffe9d2'), 0, 0, 70, 0.09 + 0.07 * h2, 0);
        g.restore();
      }
      g.restore();
    }
    // sun disc
    g.save();
    g.fillStyle = U().radial(g, sx, sy, 50, [[0, '#ffffff'], [0.7, '#fff3d6'], [0.92, 'rgba(255,240,205,0.85)'], [1, 'rgba(255,240,205,0)']]);
    g.beginPath(); g.arc(sx, sy, 50, 0, TAU); g.fill();
    g.restore();
    // desert
    const T = terrainA();
    g.drawImage(T.c, vw / 2 + F * (T.phiMin - th), hy, T.c.width / T.res, T.c.height / T.res);
    // distant cumulus towers sitting on the horizon
    for (let i = 0; i < 14; i++) {
      const h1 = hash(i, 51), h2 = hash(i, 52), h3 = hash(i, 53);
      const spr = A().cloudSprite(Math.floor(h3 * 8), 'golden', 0);
      const sc = 0.35 + 0.55 * h2, w = spr.width * sc, h = spr.height * sc;
      const x = vw / 2 + F * (-2.6 + 4.9 * (i + h1 * 0.8) / 14 - th);
      if (!inView(x, w, 0, vh)) continue;
      g.globalAlpha = 0.6;
      g.drawImage(spr, x - w / 2, hy - h * 0.6, w, h);
      g.globalAlpha = 1;
    }
    // horizon haze band over the cloud bases
    const hz = g.createLinearGradient(0, hy - 70, 0, hy + 40);
    hz.addColorStop(0, 'rgba(255,214,160,0)'); hz.addColorStop(0.7, 'rgba(255,214,160,0.55)'); hz.addColorStop(1, 'rgba(255,214,160,0.15)');
    g.fillStyle = hz; g.fillRect(0, hy - 70, vw, 110);
    // low cumulus field between us and the desert (world-placed, far → near)
    for (const cl of lowClouds()) {
      const dist = Math.hypot(cl.z, CLOUD_DH);
      const wpx = 2 * cl.R * F / dist;
      if (wpx < 5) continue;
      const x = vw / 2 + F * (cl.phi - th);
      const yy = hy + F * Math.atan(CLOUD_DH / cl.z);
      const spr = A().cloudSprite(cl.idx, 'golden', 0);
      const w = wpx, h = spr.height * wpx / spr.width;
      if (!inView(x, w, yy - h * 0.7, yy + h * 0.4)) continue;
      const fog = 1 - Math.exp(-cl.z / 60000);
      g.globalAlpha = 0.95 * (1 - 0.6 * fog);
      if (cl.flip) { g.save(); g.translate(x, 0); g.scale(-1, 1); g.drawImage(spr, -w / 2, yy - h * 0.62, w, h); g.restore(); }
      else g.drawImage(spr, x - w / 2, yy - h * 0.62, w, h);
    }
    g.globalAlpha = 1;
  }
  let PANO = null;
  function pano() {
    if (PANO) return PANO;
    const pw = Math.ceil((PH_MAX - PH_MIN) * F), ph = PTOP + PBOT;
    const c = mk(pw, ph);
    paintWorld(c.getContext('2d'), PH_MIN + pw / (2 * F), PTOP, pw, ph);
    return (PANO = c);
  }
  // blit the window of the panorama seen by a camera at azimuth th with the horizon at screen y = hy (margin m px)
  function blitPano(g, th, hy, m = 80) {
    const P = pano();
    const sx = (th - PH_MIN) * F - W / 2;
    g.drawImage(P, sx - m, 0, W + 2 * m, P.height, -m, hy - PTOP, W + 2 * m, P.height);
    return { sx: W / 2 + F * (SUN_TH - th), sy: hy - (HY - SUN_Y) };
  }
  function drawWorldA(g, t, th, tl) {
    const sun = blitPano(g, th, HY + tl);
    // thin cloud wisps at our altitude, close → strong parallax against the panorama
    const puff = A().puffSprite;
    for (let i = 0; i < 7; i++) {
      const h1 = hash(i, 191), h2 = hash(i, 192), h3 = hash(i, 193);
      const x = W / 2 + F * 1.7 * (-2.2 + 4.2 * h1 - th) - t * 40;
      if (x < -1600 || x > W + 1600) continue;
      const y = HY + tl * 1.5 + (h2 < 0.5 ? 150 + 120 * h2 : -330 - 200 * h2);
      g.save(); g.translate(x, y); g.rotate(-0.03 + 0.06 * h3);
      for (let k = 0; k < 3; k++) {
        g.save(); g.translate((k - 1) * 260, (k - 1) * 14 * (h3 - 0.5)); g.scale(7 + 4 * h3, 0.7 + 0.4 * h2);
        A().drawPuff(g, puff(i * 3 + k + 40, '#ffe8d0'), 0, 0, 80, 0.13 + 0.08 * h3, h1 * 3);
        g.restore();
      }
      g.restore();
    }
    // big near cloud tops we rise past during the tilt-in (continues S2's cloud wipe; gone by ~12.15)
    if (tl < -250) {
      for (let i = 0; i < 5; i++) {
        const h1 = hash(i, 57), h2 = hash(i, 58), h3 = hash(i, 59);
        const spr = A().cloudSprite(Math.floor(h3 * 8), 'golden', 0);
        const sc = 2.0 + 1.3 * h2, w = spr.width * sc, h = spr.height * sc;
        const x = W / 2 + (i - 2) * 520 + (h1 - 0.5) * 300;
        const y = HY + tl * 1.4 + 900 + 260 * h2 + (i % 2) * 140;
        if (y - h * 0.62 > H) continue;
        g.globalAlpha = 0.97;
        g.drawImage(spr, x - w / 2, y - h * 0.62, w, h);
      }
      g.globalAlpha = 1;
    }
    return sun;
  }

  // assets' hq jet3d renders through shared scratch canvases that are only cleared over the current size; blur/outline
  // passes can sample beyond it — wipe them completely so a frame never depends on what was rendered before it
  function cleanJet3dScratch() {
    for (const n of ['A', 'M', 'O']) {
      const c = U().scratch('jet3d' + n, 1, 1);
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
    }
  }
  // jet3d into a bounding-box layer, composited with motion blur (dx, dy) — cheap when the jet is small
  function drawJetBlurred(ctx, o, dx, dy, key) {
    const L = Math.hypot(dx, dy);
    if (o.hq) cleanJet3dScratch();
    if (L < 1.5) { A().jet3d(ctx, o); return; }
    const half = 330 * o.scale + 40 + L / 2 + 120 * o.scale * (o.afterburner || 0);
    const pad = L / 2 + 8;
    const x0 = Math.floor(Math.max(-pad, o.x - half)), y0 = Math.floor(Math.max(-pad, o.y - half));
    const x1 = Math.ceil(Math.min(W + pad, o.x + half)), y1 = Math.ceil(Math.min(H + pad, o.y + half));
    if (x1 <= x0 || y1 <= y0) return;
    const bw = x1 - x0, bh = y1 - y0;
    const JL = scratch('jetLayer', BW, BH), jg = JL.getContext('2d');
    jg.clearRect(0, 0, bw, bh);
    A().jet3d(jg, Object.assign({}, o, { x: o.x - x0, y: o.y - y0 }));
    blurBlit(ctx, JL, dx, dy, x0, y0, bw, bh);
  }

  // wingtip vortices / contrails: past positions of points on the jet, projected with the current camera
  function trailPts(t, delay, dz, local, age0, age1, n) {
    const th = camTheta(t), tl = tiltOff(t);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const age = lerp(age0, age1, i / n);
      const tt = t - age;
      const p = leadPos(tt, delay, dz), p2 = leadPos(tt + 0.02, delay, dz);
      const hx = p2.X - p.X, hy = p2.Y - p.Y, hl = Math.hypot(hx, hy) || 1;
      const ux = hx / hl, uy = hy / hl;                        // heading (in X/Y plane)
      const s = p.s, roll = -0.28 * Math.exp(-Math.pow((s + 0.9) / 0.9, 2)) + 0.42 * smoothstep(0.2, 2.2, s);
      // local = [along (m, + = forward), span (m, + = right wing = away from camera), up]
      const X = p.X + ux * local[0], Y = p.Y + uy * local[0] + local[1] * Math.sin(roll) * -1 + local[2];
      const Z = p.Z + local[1] * Math.cos(roll);
      const q = projA(t, X, Y, Z, th, tl);
      pts.push({ x: q.x, y: q.y, age, r3: q.r3 });
    }
    return pts;
  }
  // soft vapour ribbon along projected trail points (pts[0] = youngest); width grows & alpha fades with age
  function strokeTrail(g, pts, w0, w1, col, a0, fade = 2.2, near = 0) {
    g.save(); g.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        const k = i / (pts.length - 1);
        const a = a0 * Math.exp(-p.age * fade) * clamp(p.age / 0.1) * (pass ? 1 : 0.3) * (near ? smoothstep(near, near * 2.5, p.r3) : 1);
        if (a < 0.004) continue;
        const wdt = lerp(w0, w1, k) * (40 / Math.max(8, p.r3)) * (pass ? 1 : 2.6);
        g.strokeStyle = `rgba(${col},${a})`; g.lineWidth = Math.max(0.7, wdt);
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
      }
    }
    g.restore();
  }

  // vapor cone (shock condensation) around the mid fuselage at the closest pass
  function vaporCone(g, t, P) {
    const k = Math.exp(-Math.pow((t - (T_PEAK - 0.03)) / 0.13, 2));
    if (k < 0.02) return;
    const R = A().camMatrix(P.yaw, P.pitch, P.roll, P.elev);
    const sc = P.scale * 500 / 19.4;
    const pr = (x, y, z) => [P.x + (R[0] * x + R[1] * y + R[2] * z) * sc, P.y - (R[3] * x + R[4] * y + R[5] * z) * sc];
    const a0 = pr(1.6, 0.2, 0), a1 = pr(-5.5, 0.2, 0);
    const ax = a0[0] - a1[0], ay = a0[1] - a1[1], L = Math.hypot(ax, ay);
    if (L < 4) return;
    const rb = 2.6 * sc;
    g.save();
    g.translate(a1[0], a1[1]); g.rotate(Math.atan2(ay, ax));
    const flick = 0.8 + 0.2 * Math.sin(t * 90);
    // soft condensation sheath hugging the fuselage, densest just behind the shock (front)
    g.save(); g.globalCompositeOperation = 'screen';
    g.translate(L * 0.62, 0); g.scale(L * 0.55 / rb, 1);
    glow(g, 0, 0, rb, '#ffffff', 0.28 * k * flick);
    g.restore();
    g.restore();
  }

  // heat shimmer: re-draw a region of the target canvas in wobbling strips
  function heatShimmer(ctx, cx, cy, w, h, amp, t, ang = 0) {
    if (amp < 0.3 || w < 8 || h < 8) return;
    const src = ctx.canvas;
    const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
    w = Math.min(1200, Math.ceil(w)); h = Math.min(420, Math.ceil(h));
    const S = scratch('shim', 1200, 420), g = S.getContext('2d');
    g.clearRect(0, 0, 1200, 420);
    g.drawImage(src, x0, y0, w, h, 0, 0, w, h);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const strip = 5;
    for (let y = 0; y < h; y += strip) {
      const v = y / h, env = Math.sin(Math.PI * v);
      const dx = (Math.sin(y * 0.11 + t * 47) + 0.6 * Math.sin(y * 0.31 - t * 71)) * amp * env;
      const dy = Math.sin(y * 0.07 + t * 33) * amp * 0.25 * env;
      const sh2 = Math.min(strip, h - y);
      ctx.drawImage(S, 0, y, w, sh2, x0 + dx, y0 + y + dy, w, sh2);
    }
    ctx.restore();
  }

  function shotA(ctx, t) {
    const th = camTheta(t), tl = tiltOff(t);
    const dt = 1 / 60;                                             // 180° shutter
    const dPan = F * (camTheta(t + dt / 2) - camTheta(t - dt / 2));
    const dTilt = tiltOff(t + dt / 2) - tiltOff(t - dt / 2);
    const sh = M.shake(t, shakeA(t), 22, 31);
    // ---- background layer (sky, sun, clouds, desert) with camera motion blur
    const BG = scratch('bgA'), g = BG.getContext('2d');
    g.clearRect(0, 0, W, H);
    const sun = drawWorldA(g, t, th, tl);
    ctx.save();
    const push = 1.03 + 0.06 * ease.inOutQuad(prog(t, 12.5, 14.25)) - 0.04 * ease.inOutQuad(prog(t, 14.4, 15.6));
    ctx.translate(W / 2 + sh.x, H / 2 + sh.y); ctx.rotate(sh.r); ctx.scale(push, push); ctx.translate(-W / 2, -H / 2);
    const bdx = -dPan, bdy = dTilt * lerp(3.2, 1, prog(t, T0, T0 + 0.3));
    if (Math.hypot(bdx, bdy) >= 1.5) ctx.drawImage(BG, 0, 0);   // opaque underlay: blurred edges never show black
    blurBlit(ctx, BG, bdx, bdy);
    // sun rays + flare (not blurred; they live in the lens)
    const sunVis = clamp(1 - Math.max(0, -sun.sx) / 500) * clamp(1 - Math.max(0, sun.sy) / 1400) * prog(t, 12.2, 12.6);
    if (sunVis > 0.01) {
      A().lightRays(ctx, { x: sun.sx, y: sun.sy, count: 14, alpha: 0.045 * sunVis, t, length: 1800, color: '#ffd9a0', width: 0.024 });
    }
    // ---- trails (behind the jet)
    if (t > 14.1) {
      // wingtip vortices while the jet pulls through the pass
      const tipA = clamp((t - 14.1) / 0.25) * Math.exp(-Math.max(0, t - 14.9) * 2.5);
      for (const sp of [-6.4, 6.4]) strokeTrail(ctx, trailPts(t, 0, 0, [-4.6, sp, 0.3], 0.0, 0.2, 10), 1.2, 4, '255,252,247', 0.6 * tipA, 9);
    }
    if (t > 14.3) {
      // engine contrails as it climbs away
      const ca = clamp((t - 14.3) / 0.5);
      for (const sp of [-0.66, 0.66]) strokeTrail(ctx, trailPts(t, 0, 0, [-9.8, sp, 0], 0.0, 2.4, 26), 4, 34, '255,248,238', 0.5 * ca, 1.0, 60);
    }
    // ---- wingmen streaming across in the distance after the pass
    for (let w = 0; w < 3; w++) {
      const dl = [0.55, 0.85, 1.15][w], dz = [70, 95, 130][w];
      if (t < 15.2) continue;
      const P = jetPoseA(t, dl, dz);
      if (P.x < -200 || P.x > W + 200) continue;
      for (const sp of [-0.66, 0.66]) strokeTrail(ctx, trailPts(t, dl, dz, [-9.8, sp, 0], 0.0, 1.8, 14), 4, 30, '255,248,238', 0.45, 1.1, 60);
      A().jet3d(ctx, { x: P.x, y: P.y, scale: P.scale, yaw: P.yaw, pitch: P.pitch, roll: P.roll + 0.1 * w, elev: P.elev, afterburner: 0.8, t: t + w * 0.3, lod: 0.5 });
    }
    // ---- lead jet (motion blurred relative to the camera)
    const P = jetPoseA(t);
    const Pa = jetPoseA(t - dt / 2), Pb = jetPoseA(t + dt / 2);
    const ab = 0.35 + 0.55 * smoothstep(14.25, 14.7, t);
    if (P.scale > 0.05 && P.x > -1400 && P.x < W + 1400) {
      drawJetBlurred(ctx, { x: P.x, y: P.y, scale: P.scale, yaw: P.yaw, pitch: P.pitch, roll: P.roll, elev: P.elev, afterburner: ab, t, hq: P.scale > 0.9 }, Pb.x - Pa.x, Pb.y - Pa.y, 'jetA');
      vaporCone(ctx, t, P);
      // glint of the sun on the canopy as it turns toward us
      const gk = Math.exp(-Math.pow((t - 14.05) / 0.12, 2));
      if (gk > 0.02) starGlint(ctx, P.x + P.scale * 150 * Math.cos(P.yaw), P.y - P.scale * 30, 90 * P.scale, gk * 0.9, 0.1);
    }
    ctx.restore();
    // heat shimmer behind the nozzles (screen space, after the jet is on the canvas)
    if (P.scale > 0.4) {
      const R = A().camMatrix(P.yaw, P.pitch, P.roll, P.elev), sc = P.scale * 500 / 19.4;
      const nx = W / 2 + sh.x + (P.x + R[0] * -11.5 * sc - W / 2) * push, ny = H / 2 + sh.y + (P.y - R[3] * -11.5 * sc - H / 2) * push;
      heatShimmer(ctx, nx, ny, 160 * P.scale * push * (0.6 + 0.4 * Math.abs(Math.cos(P.yaw))), 60 * P.scale * push, 3 * Math.min(2.5, P.scale) * ab, t);
    }
    // ---- lens: flare + streaks + motes
    if (sunVis > 0.01) A().lensFlare(ctx, { x: W / 2 + sh.x + (sun.sx - W / 2) * push, y: H / 2 + sh.y + (sun.sy - H / 2) * push, intensity: 0.5 * sunVis });
    const whip = clamp(Math.abs(dPan) / 140);
    if (whip > 0.02) A().motionStreaks(ctx, t, { dir: dPan > 0 ? 'left' : 'right', alpha: 0.35 * whip, count: 50, color: '#fff2dc', speed: 3600, width: 2, length: 1.4 });
    const tiltK = clamp(Math.abs(dTilt) / 80);
    if (tiltK > 0.02) A().motionStreaks(ctx, t, { dir: 'down', alpha: 0.55 * tiltK, count: 90, color: '#fff0d6', speed: 3200, width: 3, length: 1.6 });
    drawMotesA(ctx, t, th, sh);
    // flash at the closest pass
    const fl = 0.22 * Math.exp(-Math.pow((t - T_PEAK) / 0.06, 2));
    if (fl > 0.003) M.fill(ctx, '#fff4e0', fl);
    // continue S2's warm wipe
    const wash = 0.4 * Math.pow(1 - prog(t, T0, T0 + 0.4), 1.5);
    if (wash > 0.003) M.fill(ctx, '#ffe2b4', wash);
    // ---- titles
    drawTitles(ctx, t, sh);
  }

  function drawMotesA(ctx, t, th, sh) {
    // glittering ice crystals / dust in the sunlight (parallax: near motes move most with the pan)
    const pan = F * th;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 70; i++) {
      const h1 = hash(i, 61), h2 = hash(i, 62), h3 = hash(i, 63), h4 = hash(i, 64);
      const par = 1.05 + 0.6 * h3;
      const x = wrap(h1 * 2600 - pan * par - t * 30 * h2, -300, 2300) + sh.x * 1.3;
      const y = wrap(h2 * 1300 - t * (10 + 25 * h4) + tiltOff(t) * par, -100, 1200) + sh.y * 1.3;
      const tw = 0.5 + 0.5 * Math.sin(t * (3 + 6 * h4) + i * 2.3);
      const r = 1 + 2.4 * h3;
      glow(ctx, x, y, r * 6, '#ffd7a0', 0.22 * tw);
      ctx.fillStyle = `rgba(255,244,220,${0.6 * tw})`; ctx.fillRect(x - r * 0.5, y - r * 0.5, r, r);
    }
    // a few large out-of-focus bokeh discs
    for (let i = 0; i < 8; i++) {
      const h1 = hash(i, 65), h2 = hash(i, 66), h3 = hash(i, 67);
      const x = wrap(h1 * 2800 - pan * 1.8 - t * 20, -400, 2400), y = 120 + h2 * 860 + tiltOff(t) * 1.6;
      glow(ctx, x, y, 50 + 90 * h3, i % 2 ? '#ffc27a' : '#fff0d0', 0.07);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- titles (15.0 / 16.2)
  const LT_R = 1800, LT_Y = 935, SUB_Y = 805;
  function drawTitles(ctx, t, sh) {
    if (t < T_LT - 0.12) return;
    const S1 = ltSpr(), S2 = subSpr();
    const ox = sh.x * 0.25, oy = sh.y * 0.25;
    const k1 = ease.outCubic(prog(t, T_LT, T_LT + 0.4));
    const k2 = t >= T_SUB - 0.1 ? ease.outCubic(prog(t, T_SUB, T_SUB + 0.35)) : 0;
    // ---- backing panel (dark glass gradient, right → left), green accent bar, gold rule
    const ltW = S1.tw + 120;
    const panelTop = lerp(LT_Y - 62, SUB_Y - 100, k2), panelBot = LT_Y + 52;
    const pw = Math.max(ltW, k2 > 0 ? S2.tw * 1.0 + 140 : 0) * k1;
    ctx.save(); ctx.translate(ox, oy);
    if (pw > 2) {
      const gx = ctx.createLinearGradient(LT_R + 40, 0, LT_R + 40 - pw - 200, 0);
      gx.addColorStop(0, 'rgba(6,14,12,0.78)'); gx.addColorStop(0.6, 'rgba(6,14,12,0.55)'); gx.addColorStop(1, 'rgba(6,14,12,0)');
      ctx.fillStyle = gx; ctx.fillRect(LT_R + 40 - pw - 200, panelTop, pw + 200, panelBot - panelTop);
      // green bar (right edge) with glow
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(31,174,91,0.95)'; ctx.fillRect(LT_R + 34, panelTop, 8, (panelBot - panelTop) * k1);
      ctx.translate(LT_R + 38, (panelTop + panelBot) / 2); ctx.scale(0.12, 1); glow(ctx, 0, 0, (panelBot - panelTop) * 0.7, '#1FAE5B', 0.6);
      ctx.restore();
      // gold rule between the two lines
      const ry = LT_Y - 50;
      const rg = ctx.createLinearGradient(LT_R + 20, 0, LT_R + 20 - pw, 0);
      rg.addColorStop(0, 'rgba(242,210,122,0.95)'); rg.addColorStop(1, 'rgba(242,210,122,0)');
      ctx.fillStyle = rg; ctx.fillRect(LT_R + 20 - pw, ry - 1.5, pw, 3);
      // light sweep along the rule on arrival
      const sw = prog(t, T_LT, T_LT + 0.45);
      if (sw > 0 && sw < 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(LT_R + 20 - pw * sw, ry); ctx.scale(2.4, 0.08); glow(ctx, 0, 0, 90, '#fff4d0', 1); ctx.restore(); }
    }
    // ---- HUD micro-text (Latin numerals)
    if (k1 > 0) {
      const a = k1 * (0.55 + 0.15 * Math.sin(t * 9));
      const alt = Math.round(31000 + (t - T_LT) * 420);
      M.text(ctx, `ALT ${alt.toLocaleString('en-US')} FT   M 1.${Math.floor(38 + (t - T_LT) * 3) % 100}`, LT_R - 4, panelBot + 22, { size: 18, family: 'latin', weight: 500, color: '#7CFFB2', align: 'right', alpha: a, letterSpacing: 2 });
      M.text(ctx, `HDG ${String(Math.round(72 + (t - T_LT) * 4) % 360).padStart(3, '0')}`, LT_R + 40 - pw - 40, panelBot + 22, { size: 18, family: 'latin', weight: 500, color: '#7CFFB2', align: 'left', alpha: a * clamp(pw / 400), letterSpacing: 2 });
    }
    // ---- line 1: «سلاح الجو الملكي السعودي» revealed right → left
    if (t >= T_LT) {
      const rk = ease.outCubic(prog(t, T_LT, T_LT + 0.26));
      const cx = LT_R - S1.tw / 2 - 6;
      ctx.save();
      const xr = LT_R + 20, xl = xr - (S1.tw + 60) * rk;
      ctx.beginPath(); ctx.rect(xl, LT_Y - S1.h / 2, xr - xl, S1.h); ctx.clip();
      drawMetal(ctx, S1, cx, LT_Y, { flash: 0.8 * decay(t, T_LT + 0.05, 6), spec: prog(t, T_LT + 0.35, T_LT + 1.1) * 1.3 - 0.1, specA: 0.7 });
      ctx.restore();
      if (rk > 0 && rk < 1) { starGlint(ctx, xl, LT_Y, 46, 0.9, 0); }
    }
    // ---- line 2: «صقور السماء» slam (16.08 → 16.2)
    if (t >= T_SUB - 0.1) {
      let sc, a;
      if (t < T_SUB) { const k = prog(t, T_SUB - 0.1, T_SUB); sc = lerp(1.38, 1, k * k); a = Math.sqrt(k); }
      else { const age = t - T_SUB; sc = 1 - 0.05 * Math.exp(-age * 9) * Math.cos(age * 30); a = 1; }
      const cx = LT_R - S2.tw / 2 - 4;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cx, SUB_Y); ctx.scale(3.6, 0.8);
      glow(ctx, 0, 0, 140, '#ff9a3a', 0.16 * a + 0.4 * decay(t, T_SUB, 4));
      ctx.restore();
      if (t < T_SUB) for (let j = 3; j >= 1; j--) drawMetal(ctx, S2, cx, SUB_Y, { scale: sc * (1 + j * 0.05), alpha: a * 0.18 / j });
      drawMetal(ctx, S2, cx, SUB_Y, { scale: sc, alpha: a, flash: 0.9 * decay(t, T_SUB, 7), spec: prog(t, T_SUB + 0.06, T_SUB + 0.8) * 1.4 - 0.2, specA: 0.95 });
      // shock line + sparks
      const sa = t - T_SUB;
      if (sa >= 0 && sa < 1.0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const R = 80 + 900 * (1 - Math.exp(-sa * 4.5)), al = Math.pow(clamp(1 - sa / 0.45), 1.5);
        ctx.translate(cx, SUB_Y + 20); ctx.scale(1, 0.16);
        ctx.strokeStyle = `rgba(255,220,150,${0.7 * al})`; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
        ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let i = 0; i < 34; i++) {
          const h1 = hash(i, 91), h2 = hash(i, 92), h3 = hash(i, 93);
          const life = 0.4 + 0.5 * h3;
          if (sa > life) continue;
          const ang = -Math.PI / 2 + (h1 - 0.5) * 3.0, v = 600 + 1100 * h2, kk = 3.4;
          const ex = (1 - Math.exp(-kk * sa)) / kk;
          const x0 = cx + (h1 - 0.5) * S2.tw, y0 = SUB_Y + (h2 - 0.5) * 50;
          const x = x0 + Math.cos(ang) * v * ex, y = y0 + Math.sin(ang) * v * ex + 900 * sa * sa;
          const vx = Math.cos(ang) * v * Math.exp(-kk * sa), vy = Math.sin(ang) * v * Math.exp(-kk * sa) + 1800 * sa;
          ctx.strokeStyle = `rgba(255,${200 + 50 * h3 | 0},140,${1 - sa / life})`; ctx.lineWidth = 1.5 + 2 * h3;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * 0.03, y - vy * 0.03); ctx.stroke();
        }
        ctx.restore();
      }
    }
    // ---- HUD brackets: snap around line 1 at 15.0, expand around both lines at 16.2
    {
      const bx1 = LT_R - S1.tw - 50, bx2 = LT_R + 60;
      const b2x1 = Math.min(bx1, LT_R - S2.tw - 50);
      const x1 = lerp(bx1, b2x1, ease.outBack(k2)), y1 = lerp(LT_Y - 64, SUB_Y - 96, ease.outBack(k2));
      const x2 = bx2, y2 = LT_Y + 50;
      // snap-in from 1.5× size (14.9 → 15.0), overshoot
      const sk = t < T_LT ? lerp(1.6, 1, ease.inQuad(prog(t, T_LT - 0.12, T_LT))) : 1 - 0.06 * Math.exp(-(t - T_LT) * 9) * Math.cos((t - T_LT) * 28);
      const ba = t < T_LT ? prog(t, T_LT - 0.12, T_LT) : 1;
      const cxB = (x1 + x2) / 2, cyB = (y1 + y2) / 2, hw = (x2 - x1) / 2 * sk, hh = (y2 - y1) / 2 * sk;
      const fl = decay(t, T_LT, 8) + decay(t, T_SUB, 8);
      A().hudBracket(ctx, cxB - hw, cyB - hh, hw * 2, hh * 2, { color: fl > 0.3 ? '#e8fff2' : '#7CFFB2', alpha: ba * 0.9, t, len: 34, thick: 3, glow: 12, breathe: 0.6 });
    }
    ctx.restore();
  }


  // ================================================================ SHOT B (17.4 – 20.4): four-ship climbing into the sun
  const HYB_OFF = 120;                                   // horizon lower in frame (we look up)
  const SUNB_X = 1120;
  const TH_B = SUN_TH - (SUNB_X - W / 2) / F;            // camera azimuth: sun lands at x ≈ 1120
  const VPB = { x: SUNB_X - 40, y: SUN_Y + HYB_OFF + 30 }; // vanishing point of the climb (just below-left of the sun)
  // finger-four seen from behind: [lateral m (+ right), vertical m (+ up), depth m]; listed left → right (= ignition order)
  const FORM = [[-17, -9, 46], [-3, -3, 55], [9, -7, 51], [19, -14, 50]];
  function jetDepthB(t, i) {
    const t0 = T_AB + AB_ORDER[i], z0 = FORM[i][2];
    const pre = 9 * (t - T_FORM);
    const d = t - t0;
    return z0 + pre + (d > 0 ? 14 * d + 0.5 * 70 * d * d * (1 - Math.exp(-d * 3)) : 0);
  }
  function jetPoseB(t, i) {
    const z = jetDepthB(t, i);
    const bob = Math.sin(t * 1.3 + i * 1.9) * 0.5, bob2 = Math.cos(t * 1.1 + i * 2.7) * 0.4;
    const ox = FORM[i][0] + bob, oy = FORM[i][1] + bob2;
    return { x: VPB.x + F * ox / z, y: VPB.y - F * oy / z, scale: 19.4 * F / z / 500, z, ox, oy,
      yaw: Math.PI / 2 + Math.atan2(ox, z) * 1.25, elev: -Math.atan2(oy, z) * 1.15 + 0.04, roll: 0.06 * Math.sin(t * 1.7 + i * 2.2) - 0.08 };
  }
  function rollB(t) { return -0.11 + 0.025 * Math.sin((t - T_FORM) * 1.2) + 0.03 * ease.inOutCubic(prog(t, T_AB, T_HUD)); }
  function abB(t, i) {
    const ti = T_AB + AB_ORDER[i];
    return 0.14 + 0.86 * smoothstep(ti, ti + 0.07, t);
  }
  // clouds we fly past (camera space), streaming outward from the vanishing point
  const PASSC = [[-900, -380, 0.1], [700, -460, 0.35], [-1400, -240, 0.55], [1250, -260, 0.8], [-500, -600, 0.62], [200, -700, 0.9]];
  function drawPassClouds(g, t) {
    for (let i = 0; i < PASSC.length; i++) {
      const [cx, cy, ph] = PASSC[i];
      const span = 3400, zn = 330;
      const z = zn + wrap(span * (1 - ph) - (t - T_FORM) * (230 + 140 * smoothstep(T_AB, T_AB + 1, t)) * (1 + 0.15 * i), 0, span);
      const fadeIn = clamp((zn + span - z) / 600), fadeOut = clamp((z - zn) / 300);
      const a = 0.85 * fadeIn * fadeOut;
      if (a < 0.01) continue;
      const spr = A().cloudSprite([0, 1, 3, 4, 6, 7][i], 'golden', 0);
      const R = 420 + 120 * (i % 3);
      const w = 2 * R * F / z, h = w * spr.height / spr.width;
      const x = VPB.x + F * cx / z, y = VPB.y - F * cy / z;
      if (x - w / 2 > W + 200 || x + w / 2 < -200 || y - h > H + 200 || y + h < -200) continue;
      g.globalAlpha = a;
      g.drawImage(spr, x - w / 2, y - h * 0.6, w, h);
    }
    g.globalAlpha = 1;
  }
  function contrailB(g, t, i, P, k) {
    // trail points stay in the air behind the jet: depth z - d (toward the camera), widening as they near us
    const n = 22;
    g.save(); g.lineCap = 'round';
    let prev = null;
    for (let j = 0; j <= n; j++) {
      const d = 14 + Math.pow(j / n, 1.6) * (P.z - 12);
      const zz = P.z - d;
      if (zz < 6) break;
      const x = VPB.x + F * P.ox / zz, y = VPB.y - F * (P.oy + 0.3) / zz;
      if (prev) {
        const age = d / 230;
        const a = (0.2 + 0.18 * k) * Math.exp(-age * 2.2) * clamp((d - 14) / 25) * clamp((zz - 30) / 50);
        const wdt = Math.min(26, F * (0.45 + 0.9 * age + 0.3 * k) / zz);
        if (a > 0.004) {
          g.strokeStyle = `rgba(255,246,236,${a * 0.35})`; g.lineWidth = wdt * 2.4;
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(x, y); g.stroke();
          g.strokeStyle = `rgba(255,250,244,${a})`; g.lineWidth = wdt;
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(x, y); g.stroke();
        }
      }
      prev = { x, y };
    }
    g.restore();
  }
  function shotB(ctx, t) {
    heatShimmerQueue.length = 0;
    const lt = t - T_FORM;
    const ign = t - T_AB;
    const shakeAmt = 2 + 22 * decay(t, T_AB, 4.5) + 6 * decay(t, T_FORM, 10);
    const sh = M.shake(t, shakeAmt, 24, 47);
    const zoom = 1.04 + 0.02 * lt + 0.05 * decay(t, T_AB, 6) - 0.04 * decay(t, T_FORM, 7);
    ctx.save();
    ctx.translate(W / 2 + sh.x, H / 2 + sh.y); ctx.rotate(rollB(t) + sh.r); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);
    const sun = blitPano(ctx, TH_B, HY + HYB_OFF, 360);
    A().lightRays(ctx, { x: sun.sx, y: sun.sy, count: 13, alpha: 0.035 + 0.07 * decay(t, T_AB, 2), t, length: 2200, color: '#ffdca8', width: 0.022 });
    drawPassClouds(ctx, t);
    // jets far → near
    const order = [0, 1, 2, 3].sort((a, b) => jetDepthB(t, b) - jetDepthB(t, a));
    for (const i of order) {
      const P = jetPoseB(t, i), k = abB(t, i);
      contrailB(ctx, t, i, P, k);
    }
    for (const i of order) {
      const P = jetPoseB(t, i), k = abB(t, i);
      const jo = { x: P.x, y: P.y, scale: P.scale, yaw: P.yaw, pitch: 0.04, roll: P.roll, elev: P.elev, light: 'back', afterburner: k, t: t + i * 0.37, lod: 0.5 };
      A().jet3d(ctx, jo);
      // ignition: white-hot bloom + soft pressure halo at the nozzles
      const ti = T_AB + AB_ORDER[i], a = t - ti;
      const R = A().camMatrix(jo.yaw, jo.pitch, jo.roll, jo.elev), sc = P.scale * 500 / 19.4;
      const nx = P.x + (R[0] * -9.45 + R[1] * -0.04) * sc, ny = P.y - (R[3] * -9.45 + R[4] * -0.04) * sc;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, nx, ny, 130 * P.scale * (1 + 0.9 * k), '#ffa050', 0.3 * k + 0.06);
      // afterburner exhaust streaming back toward the camera (away from the vanishing point)
      if (k > 0.2) {
        const ddx = nx - VPB.x, ddy = ny - VPB.y, dl = Math.hypot(ddx, ddy) || 1;
        const len = (180 + 160 * Math.sin(t * 37 + i) * 0.1) * P.scale * k, wd = 16 * P.scale;
        ctx.save(); ctx.translate(nx, ny); ctx.rotate(Math.atan2(ddy, ddx));
        const eg = ctx.createLinearGradient(0, 0, len, 0);
        eg.addColorStop(0, `rgba(255,236,200,${0.55 * k})`); eg.addColorStop(0.35, `rgba(255,150,70,${0.3 * k})`); eg.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.moveTo(0, -wd); ctx.quadraticCurveTo(len * 0.5, -wd * 0.9, len, 0); ctx.quadraticCurveTo(len * 0.5, wd * 0.9, 0, wd); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (a > -0.02 && a < 0.9) {
        const fl = a < 0 ? 0 : Math.exp(-a * 7);
        glow(ctx, nx, ny, 230 * P.scale, '#fff1da', 0.5 * fl);
        glow(ctx, nx, ny, 150 * P.scale, '#ffffff', fl);
        ctx.save(); ctx.translate(nx, ny); ctx.scale(7, 0.1); glow(ctx, 0, 0, 160 * P.scale, '#ffe8c0', 0.9 * fl); ctx.restore();
        if (a > 0) {
          const Rr = (60 + 600 * (1 - Math.exp(-a * 4))) * P.scale, ra = Math.pow(clamp(1 - a / 0.8), 2);
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = U().radial(ctx, nx, ny, Rr, [[0, 'rgba(255,230,190,0)'], [0.75, `rgba(255,230,190,${0.12 * ra})`], [0.92, `rgba(255,244,220,${0.22 * ra})`], [1, 'rgba(255,230,190,0)']]);
          ctx.beginPath(); ctx.arc(nx, ny, Rr, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
      if (k > 0.5) heatShimmerQueue.push([nx, ny, 260 * P.scale, 110 * P.scale, 2.2 * Math.min(2, P.scale * 2) * k]);
    }
    ctx.restore();
    // heat shimmer behind the nozzles (screen-space copies, so approximate the transform)
    const r = rollB(t) + sh.r, cr = Math.cos(r), sr = Math.sin(r);
    for (const q of heatShimmerQueue.splice(0)) {
      const dx = (q[0] - W / 2) * zoom, dy = (q[1] - H / 2) * zoom;
      heatShimmer(ctx, W / 2 + sh.x + dx * cr - dy * sr - 20 * zoom, H / 2 + sh.y + dx * sr + dy * cr + 30 * zoom, q[2] * zoom, q[3] * zoom, q[4], t);
    }
    // lens: flare, speed streaks radiating from the vanishing point, motes
    A().lensFlare(ctx, { x: sun.sx * zoom + (1 - zoom) * W / 2 + sh.x, y: sun.sy * zoom + (1 - zoom) * H / 2 + sh.y, intensity: 0.55 + 0.4 * decay(t, T_AB, 3) });
    speedLinesB(ctx, t, zoom, sh);
    // ignition flash (warm exposure pop) + cut-in flash from shot A
    const pop = 0.28 * decay(t, T_AB, 7) * (t >= T_AB ? 1 : 0);
    if (pop > 0.003) M.fill(ctx, '#fff0d8', pop);
    const cutF = 0.35 * decay(t, T_FORM, 12);
    if (cutF > 0.003) M.fill(ctx, '#fff6e6', cutF);
  }
  const heatShimmerQueue = [];
  function speedLinesB(ctx, t, zoom, sh) {
    const vx = VPB.x, vy = VPB.y;
    const boost = 1 + 2.2 * smoothstep(T_AB, T_AB + 0.6, t);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < 36; i++) {
      const h1 = hash(i, 101), h2 = hash(i, 102), h3 = hash(i, 103);
      const ang = h1 * TAU, R0 = 30 + 80 * h2;                     // lateral offset (m) of the particle's path
      const period = 1.4 + h3;
      const ph = wrap((t - T_FORM) * boost * 0.6 / period + h2, 0, 1); // 0 = far … 1 = at the camera
      const z = 420 * (1 - ph) + 6;
      const z2 = z + 14 * boost;
      const r1 = F * R0 / z, r2 = F * R0 / z2;
      const x1 = vx + Math.cos(ang) * r1, y1 = vy + Math.sin(ang) * r1, x2 = vx + Math.cos(ang) * r2, y2 = vy + Math.sin(ang) * r2;
      const a = 0.22 * clamp(ph * 4) * clamp((1 - ph) * 6) * (0.4 + 0.6 * h3) * (0.4 + 0.6 * boost / 3.2);
      if (a < 0.01) continue;
      ctx.strokeStyle = `rgba(255,240,215,${a})`; ctx.lineWidth = 1 + 2.5 * ph;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.restore();
  }


  // ================================================================ SHOT C (20.4 – 23.4): cockpit HUD, dive on an empty-desert range marker
  const HC = '#7CFFB2', HC_RGB = '124,255,178';
  const HYC = 120;                                          // horizon (screen y, before bank)
  const CAMH_C = 2400, SUN_C = -1.05;
  const TGT = { phi: 0.03, row: 500, R: 380 };              // marker: azimuth, rows below the horizon, radius (m)
  let TERC = null;
  function terrainC() {
    if (TERC) return TERC;
    TERC = buildTerrain({ F, res: 0.8, camH: CAMH_C, phiMin: -0.98, phiMax: 0.98, rows: 1180, sunAz: SUN_C, sunEl: 0.27, fogD: 52000, ox: -5310, oy: 2290, hazeAway: [0.92, 0.72, 0.58], hazeSun: [1.0, 0.84, 0.64] });
    return TERC;
  }
  const skyC = () => skyGrad('C', 520, [[0, '#1a3358'], [0.45, '#4a5f80'], [0.75, '#c98a62'], [0.9, '#f2b67c'], [1, '#ffd6a0']]);
  const bankC = (t) => -0.07 + 0.09 * ease.inOutQuad(prog(t, T_HUD, T_WIPE)) + 0.008 * Math.sin(t * 2.3);
  const zoomC = (t) => 1 + 0.32 * ease.inQuad(prog(t, T_HUD, T_WIPE + 0.4)) + 0.04 * decay(t, T_IMP, 6);
  const tgtScreen = () => ({ x: W / 2 + F * TGT.phi, y: HYC + TGT.row });
  // camera transform for the outside world (bank about the screen centre, zoom about the marker)
  function worldPt(t, x, y) {
    const T = tgtScreen(), z = zoomC(t), b = bankC(t);
    const X = T.x + (x - T.x) * z - W / 2, Y = T.y + (y - T.y) * z - H / 2;
    return { x: W / 2 + X * Math.cos(b) - Y * Math.sin(b), y: H / 2 + X * Math.sin(b) + Y * Math.cos(b) };
  }
  function shakeC(t) { return 1.5 + 9 * decay(t, T_MSL, 6) + 12 * decay(t, T_IMP, 5) + 3 * decay(t, T_LOCK, 10) + 5 * decay(t, T_HUD, 10); }

  function drawOutsideC(ctx, t, sh) {
    const T = tgtScreen(), z = zoomC(t), b = bankC(t);
    ctx.save();
    ctx.translate(W / 2 + sh.x, H / 2 + sh.y); ctx.rotate(b + sh.r); ctx.translate(-W / 2, -H / 2);
    // sky band
    ctx.drawImage(skyC(), -300, HYC - 520, W + 600, 520);
    ctx.fillStyle = '#1a3358'; ctx.fillRect(-300, -400, W + 600, HYC - 520 + 401);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    ctx.translate(-500, HYC - 60); ctx.scale(2.6, 0.6); glow(ctx, 0, 0, 900, '#ff9a4a', 0.6);
    ctx.restore();
    // ground (zoomed about the marker = the dive), clipped below the horizon
    ctx.save();
    ctx.beginPath(); ctx.rect(-400, HYC, W + 800, H + 800); ctx.clip();
    ctx.translate(T.x, T.y); ctx.scale(z, z); ctx.translate(-T.x, -T.y);
    const TC = terrainC();
    ctx.drawImage(TC.c, W / 2 + F * TC.phiMin, HYC, TC.c.width / TC.res, TC.c.height / TC.res);
    drawMarker(ctx, t, T);
    ctx.restore();
    // horizon haze
    const hz = ctx.createLinearGradient(0, HYC - 40, 0, HYC + 70);
    hz.addColorStop(0, 'rgba(255,214,160,0)'); hz.addColorStop(0.45, 'rgba(255,214,160,0.6)'); hz.addColorStop(1, 'rgba(255,214,160,0)');
    ctx.fillStyle = hz; ctx.fillRect(-400, HYC - 40, W + 800, 110);
    // thin cloud wisps below us streaming past (we descend through them)
    const puff = A().puffSprite;
    for (let i = 0; i < 5; i++) {
      const h1 = hash(i, 131), h2 = hash(i, 132), h3 = hash(i, 133);
      const k = wrap((t - T_HUD) * (0.22 + 0.1 * h3) + h1, 0, 1);       // 0 far → 1 passing
      const ang = (h2 - 0.5) * 2.6 + (i % 2 ? Math.PI : 0);
      const r = 60 + 1500 * k * k;
      const x = T.x + Math.cos(ang) * r * 1.4, y = T.y + Math.sin(ang) * r * 0.55 - 60;
      const a = 0.22 * clamp(k * 5) * clamp((1 - k) * 4);
      ctx.save(); ctx.translate(x, y); ctx.scale(4 + 6 * k, 1.2 + 1.6 * k);
      A().drawPuff(ctx, puff(i, '#fff1e0'), 0, 0, 50, a, h3);
      ctx.restore();
    }
    // missile streak + impact (world space)
    drawMissileC(ctx, t, T);
    ctx.restore();
  }

  // abstract range marker painted on empty sand: rings, cross, central pylon with a beacon
  function drawMarker(ctx, t, T) {
    const zT = CAMH_C / Math.tan(TGT.row / F);
    const rx = F * TGT.R / zT, sq = Math.sin(TGT.row / F);
    const scorch = clamp((t - T_IMP) / 0.3);
    ctx.save();
    ctx.translate(T.x, T.y);
    ctx.save(); ctx.scale(1, sq);
    ctx.lineWidth = 3.2;
    for (const [k, a] of [[1, 0.85], [0.66, 0.75], [0.33, 0.8]]) {
      ctx.strokeStyle = `rgba(255,246,230,${a * (1 - 0.6 * scorch)})`;
      ctx.beginPath(); ctx.arc(0, 0, rx * k, 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = `rgba(255,130,60,${0.8 * (1 - 0.6 * scorch)})`; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-rx * 1.35, 0); ctx.lineTo(rx * 1.35, 0); ctx.moveTo(0, -rx * 1.35); ctx.lineTo(0, rx * 1.35); ctx.stroke();
    ctx.fillStyle = `rgba(255,248,236,${0.9 * (1 - scorch)})`; ctx.fillRect(-rx * 0.12, -rx * 0.12, rx * 0.24, rx * 0.24);
    if (scorch > 0) { ctx.fillStyle = U().radial(ctx, 0, 0, rx * 0.9, [[0, `rgba(40,24,18,${0.75 * scorch})`], [1, 'rgba(40,24,18,0)']]); ctx.beginPath(); ctx.arc(0, 0, rx * 0.9, 0, TAU); ctx.fill(); }
    ctx.restore();
    // pylon + blinking beacon (gone after the strike)
    if (t < T_IMP) {
      ctx.fillStyle = 'rgba(60,40,30,0.9)'; ctx.fillRect(-1.5, -rx * 0.45, 3, rx * 0.45);
      const bl = 0.5 + 0.5 * Math.sin(t * TAU * 2.5);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -rx * 0.45, 10 + 10 * bl, '#ff8a3a', 0.9);
      glow(ctx, 0, -rx * 0.45, 4, '#ffffff', 0.9 * bl);
    }
    ctx.restore();
  }

  // missile: launched from under the left wing at 22.2, impacts the marker at 22.8
  const MSL0 = { x: -5, y: -2.2, z: 7 };                     // launch point (m) relative to the camera: left, below, ahead
  function mslDepth(t) {
    const zT = CAMH_C / Math.tan(TGT.row / F);
    const u = clamp((t - T_MSL) / (T_IMP - T_MSL));
    return MSL0.z + (zT - MSL0.z) * (0.02 * u + 0.98 * Math.pow(u, 2.6));
  }
  // screen point for a missile/trail point at depth zz (pre-bank world coords, zoom applied by caller's transform)
  function mslPt(T, zz) {
    const k = MSL0.z / zz;                                      // perspective convergence onto the target line
    return { x: T.x + (150 - T.x) * k, y: T.y + (H + 60 - T.y) * k };
  }
  function drawMissileC(ctx, t, T) {
    const age = t - T_MSL;
    if (age < 0) return;
    const zNow = mslDepth(t), alive = t < T_IMP;
    const puff = A().puffSprite;
    // smoke trail: puffs at fixed depths along the path (no re-sampling → no shimmer)
    const zEnd = alive ? zNow : mslDepth(T_IMP);
    ctx.save();
    const n = 46;
    for (let i = n - 1; i >= 0; i--) {
      const zz = MSL0.z * Math.pow(zEnd / MSL0.z, i / (n - 1));
      if (zz > zNow + 1) continue;
      const p = mslPt(T, zz);
      const born = T_MSL + 0.6 * Math.pow(clamp((zz - MSL0.z) / (mslDepth(T_IMP) - MSL0.z)), 1 / 2.6);
      const pa = Math.max(0, t - born);
      const w = Math.min(900, F * (0.8 + 2.4 * pa) / zz * 2.2);
      const a = 0.55 * Math.exp(-pa * 0.9) * clamp(pa * 12 + 0.2);
      if (p.x < -w || p.x > W + w || p.y < -w || p.y > H + w) continue;
      A().drawPuff(ctx, puff(i, '#f4efe8'), p.x, p.y, w, a, hash(i, 141) * 6 + pa * 0.4);
    }
    ctx.restore();
    if (alive) {
      const p = mslPt(T, zNow), q = mslPt(T, zNow + 3);
      const sc = Math.min(3, MSL0.z / zNow * 2.6);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, p.x, p.y, 30 + 220 * sc, '#ffb060', 0.8);
      glow(ctx, p.x, p.y, 10 + 60 * sc, '#ffffff', 1);
      ctx.restore();
      if (sc > 0.08) A().missile(ctx, { x: p.x, y: p.y, angle: Math.atan2(q.y - p.y, q.x - p.x) + Math.PI, scale: sc, t, flame: 1 });
    }
    // launch flash (bottom-left, near the rail)
    if (age < 0.5) {
      const fl = Math.exp(-age * 9);
      const p0 = mslPt(T, MSL0.z);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, p0.x, p0.y, 620, '#ffc070', 0.85 * fl);
      glow(ctx, p0.x + 60, p0.y - 40, 200, '#ffffff', 0.9 * fl);
      ctx.restore();
    }
    // impact on the empty marker
    const ia = t - T_IMP;
    if (ia > -0.02) {
      const zT = CAMH_C / Math.tan(TGT.row / F);
      A().explosion(ctx, ia, { x: T.x, y: T.y, scale: 0.72, seed: 7 });
      if (ia < 1.4) A().shockwave(ctx, ia, { x: T.x, y: T.y, scale: 0.45, ground: true });
      if (ia >= 0 && ia < 0.4) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, T.x, T.y - 20, 380, '#fff0d0', Math.exp(-ia * 10)); ctx.restore(); }
    }
  }

  // ---------------------------------------------------------------- HUD symbology
  // HUD strokes: dark contrast halo (readable over bright sand) + additive green glow + crisp core
  function hudLine(ctx, pts, a, w = 2.6) {
    if (a <= 0.005) return;
    ctx.beginPath();
    for (const seg of pts) { ctx.moveTo(seg[0], seg[1]); for (let i = 2; i < seg.length; i += 2) ctx.lineTo(seg[i], seg[i + 1]); }
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(0,26,14,${0.32 * a})`; ctx.lineWidth = w + 4; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${HC_RGB},${0.2 * a})`; ctx.lineWidth = w * 3.4; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(${HC_RGB},${0.97 * a})`; ctx.lineWidth = w; ctx.stroke();
    ctx.globalCompositeOperation = op;
  }
  function hudText(ctx, str, x, y, a, o = {}) {
    if (a <= 0.005) return;
    const base = Object.assign({ size: 28, family: 'latin', weight: 500, color: HC, alpha: a, letterSpacing: 1.5 }, o);
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    M.text(ctx, str, x, y, Object.assign({}, base, { color: 'rgba(124,255,178,0.12)', stroke: base.size * 0.32, strokeColor: 'rgba(124,255,178,0.14)' }));
    ctx.globalCompositeOperation = 'source-over';
    M.text(ctx, str, x, y, Object.assign({}, base, { stroke: Math.max(3, base.size * 0.13), strokeColor: 'rgba(0,26,14,0.5)' }));
    ctx.globalCompositeOperation = op;
  }
  function beepIndex(t) { let k = -1; for (let i = 0; i < BEEPS.length; i++) if (t >= BEEPS[i]) k = i; return k; }
  function drawHUD(ctx, t, sh, A0) {
    if (A0 <= 0.01) return;
    const lt = t - T_HUD;
    const boot = (d) => clamp((lt - d) / 0.12);                // staggered power-up
    const flick = (d) => (lt < d + 0.12 ? (hash(Math.round(t * FPS), 151 + Math.round(d * 100)) > 0.35 ? 1 : 0.25) : 1);
    const b = bankC(t);
    ctx.save();
    ctx.translate(sh.x * 0.6, sh.y * 0.6);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // --- pitch ladder (conformal with the horizon), clipped to the HUD glass
    ctx.save();
    ctx.beginPath(); ctx.rect(470, 92, 980, 838); ctx.clip();
    ctx.translate(W / 2, H / 2); ctx.rotate(b); ctx.translate(-W / 2, -H / 2);
    const degPx = F * Math.PI / 180, a1 = A0 * boot(0.04) * flick(0.04);
    for (let d = 0; d >= -30; d -= 5) {
      const y = HYC + (-d) * degPx;
      const hw = d === 0 ? 420 : 150, gap = d === 0 ? 70 : 52;
      const segs = [];
      if (d === 0) segs.push([W / 2 - hw, y, W / 2 - gap, y], [W / 2 + gap, y, W / 2 + hw, y]);
      else {
        // negative pitch: dashed lines with end ticks pointing toward the horizon
        for (const sd of [-1, 1]) {
          for (let k = 0; k < 4; k++) { const x0 = W / 2 + sd * (gap + k * (hw - gap) / 4), x1 = W / 2 + sd * (gap + (k + 0.6) * (hw - gap) / 4); segs.push([x0, y, x1, y]); }
          segs.push([W / 2 + sd * hw, y, W / 2 + sd * hw, y - 18]);
        }
      }
      hudLine(ctx, segs, a1, 2.4);
      if (d !== 0) for (const sd of [-1, 1]) hudText(ctx, String(-d), W / 2 + sd * (hw + 34), y + 2, a1, { size: 26 });
    }
    ctx.restore();
    // --- heading tape (top)
    const a2 = A0 * boot(0.08) * flick(0.08), hdg = 47 + 2.5 * lt;
    {
      const cx = W / 2, y = 190, ppd = 12;
      const segs = [];
      for (let d = Math.floor(hdg - 20); d <= hdg + 20; d++) {
        if (d % 5) continue;
        const x = cx + (d - hdg) * ppd, e = clamp(1 - Math.abs(x - cx) / 240);
        if (e <= 0) continue;
        segs.push([x, y, x, y - (d % 10 ? 10 : 18)]);
        if (d % 10 === 0) hudText(ctx, String(((d / 10) % 36 + 36) % 36).padStart(2, '0'), x, y - 38, a2 * e, { size: 26 });
      }
      segs.push([cx, y + 6, cx - 9, y + 20, cx + 9, y + 20, cx, y + 6]);
      hudLine(ctx, segs, a2, 2.2);
    }
    // --- speed tape (left) and altitude tape (right)
    const a3 = A0 * boot(0.12) * flick(0.12);
    const spd = 482 + 26 * lt + 4 * Math.sin(t * 3);
    const alt = 8240 - 310 * lt;
    tape(ctx, 560, spd, 10, 5.2, a3, -1, Math.round(spd).toString());
    tape(ctx, 1360, alt, 100, 0.52, a3, 1, Math.round(alt).toLocaleString('en-US'));
    hudText(ctx, 'KT', 560, 820, a3 * 0.8, { size: 24 });
    hudText(ctx, 'FT', 1360, 820, a3 * 0.8, { size: 24 });
    // --- boresight cross + flight path marker
    const a4 = A0 * boot(0.06);
    hudLine(ctx, [[W / 2 - 22, 300, W / 2 - 8, 300], [W / 2 + 8, 300, W / 2 + 22, 300], [W / 2, 286, W / 2, 292], [W / 2, 308, W / 2, 314]], a4, 2.2);
    const T = worldPt(t, tgtScreen().x, tgtScreen().y);
    const fx = T.x + 6 * Math.sin(t * 1.3), fy = T.y - 70 + 5 * Math.cos(t * 1.7);
    ctx.beginPath(); ctx.arc(fx, fy, 13, 0, TAU);
    ctx.strokeStyle = `rgba(${HC_RGB},${0.22 * a4})`; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = `rgba(${HC_RGB},${0.95 * a4})`; ctx.lineWidth = 2.4; ctx.stroke();
    hudLine(ctx, [[fx - 13, fy, fx - 36, fy], [fx + 13, fy, fx + 36, fy], [fx, fy - 13, fx, fy - 26]], a4, 2.4);
    // --- bottom data blocks
    const a5 = A0 * boot(0.16) * flick(0.16);
    hudText(ctx, `G ${(1.3 + 0.2 * Math.sin(t * 2.1) + 0.6 * decay(t, T_MSL, 4)).toFixed(1)}`, 560, 880, a5, { align: 'left', size: 30 });
    hudText(ctx, `M ${(0.82 + 0.04 * lt).toFixed(2)}`, 560, 920, a5, { align: 'left', size: 30 });
    const rng = Math.max(0, 6.4 - 0.55 * lt);
    hudText(ctx, `RNG ${rng.toFixed(1)}`, 1360, 880, a5, { align: 'right', size: 30 });
    if (t < T_MSL) hudText(ctx, `ARM  ${t >= T_LOCK ? 'RDY' : '---'}`, 1360, 920, a5, { align: 'right', size: 30 });
    else if (t < T_IMP + 0.3) hudText(ctx, `TOF ${Math.max(0, T_IMP - t).toFixed(1)}`, 1360, 920, a5, { align: 'right', size: 30 });
    // --- target designator: tightens on every lock beep, LOCK at 21.6
    drawTD(ctx, t, T, A0);
    ctx.restore();
  }
  function tape(ctx, x, v, step, ppu, a, side, label) {
    const cy = 540, half = 230, segs = [];
    const v0 = Math.floor((v - half / ppu) / step) * step;
    for (let u = v0; u <= v + half / ppu; u += step) {
      const y = cy - (u - v) * ppu;
      if (Math.abs(y - cy) > half) continue;
      const big = Math.round(u / step) % 2 === 0;
      segs.push([x, y, x + side * (big ? 22 : 12), y]);
      if (big && Math.abs(y - cy) > 36) hudText(ctx, Math.round(u).toLocaleString('en-US'), x + side * 34, y, a * (0.35 + 0.65 * clamp(1.15 - Math.abs(y - cy) / half)), { size: 22, align: side > 0 ? 'left' : 'right' });
    }
    segs.push([x, cy - half, x, cy + half]);
    const bw = 132, bx = side > 0 ? x + 30 : x - 30 - bw;
    segs.push([bx, cy - 26, bx + bw, cy - 26, bx + bw, cy + 26, bx, cy + 26, bx, cy - 26]);
    hudLine(ctx, segs, a, 2.2);
    hudText(ctx, label, bx + bw / 2, cy + 1, a, { size: 34, weight: 700 });
  }
  function drawTD(ctx, t, T, A0) {
    const bi = beepIndex(t);
    if (bi < 0) return;
    const sizes = [300, 262, 228, 198, 172, 150, 132, 116, 102];
    let sz;
    if (t < T_LOCK) {
      const s0 = sizes[bi], s1 = bi > 0 ? sizes[bi - 1] : s0 * 1.25;
      const k = ease.outBack(clamp((t - BEEPS[bi]) / 0.07));
      sz = lerp(s1, s0, k);
    } else {
      const k = clamp((t - T_LOCK) / 0.08);
      sz = lerp(102, 76, ease.outBack(k));
    }
    sz *= 1 + 0.02 * Math.sin(t * 20);
    const beepFl = t < T_LOCK + 0.1 ? Math.exp(-(t - BEEPS[bi]) * 30) : 0;
    const lock = t >= T_LOCK;
    const lockFl = lock ? Math.exp(-(t - T_LOCK) * 9) : 0;
    const a = A0 * (lock ? 1 : 0.75 + 0.25 * beepFl);
    const x0 = T.x - sz / 2, y0 = T.y - sz / 2, L = sz * 0.28;
    const segs = [
      [x0, y0 + L, x0, y0, x0 + L, y0], [x0 + sz - L, y0, x0 + sz, y0, x0 + sz, y0 + L],
      [x0 + sz, y0 + sz - L, x0 + sz, y0 + sz, x0 + sz - L, y0 + sz], [x0 + L, y0 + sz, x0, y0 + sz, x0, y0 + sz - L],
    ];
    if (lock) segs.push([x0, y0, x0 + sz, y0, x0 + sz, y0 + sz, x0, y0 + sz, x0, y0]);
    hudLine(ctx, segs, a, 2.6 + 2.5 * beepFl + 2 * lockFl);
    if (beepFl > 0.05 || lockFl > 0.05) {
      const k = Math.max(beepFl, lockFl);
      ctx.strokeStyle = `rgba(230,255,240,${0.8 * k})`; ctx.lineWidth = 2;
      ctx.strokeRect(x0 - 6, y0 - 6, sz + 12, sz + 12);
    }
    // diamond on the target + cross-hair lines out to the box
    const dm = lock ? 14 : 10;
    hudLine(ctx, [[T.x, T.y - dm, T.x + dm, T.y, T.x, T.y + dm, T.x - dm, T.y, T.x, T.y - dm]], A0, 2.2);
    if (lock) {
      // collapsing lock ring
      const rk = clamp((t - T_LOCK) / 0.16);
      if (rk < 1) { ctx.beginPath(); ctx.arc(T.x, T.y, lerp(320, 60, ease.inCubic(rk)), 0, TAU); ctx.strokeStyle = `rgba(${HC_RGB},${0.8 * (1 - rk * 0.5)})`; ctx.lineWidth = 3; ctx.stroke(); }
      hudLine(ctx, [[x0 - 40, T.y, x0 - 8, T.y], [x0 + sz + 8, T.y, x0 + sz + 40, T.y], [T.x, y0 - 40, T.x, y0 - 8], [T.x, y0 + sz + 8, T.x, y0 + sz + 40]], A0, 2.2);
      const blink = t < T_MSL ? 1 : (Math.floor((t - T_MSL) * 6) % 2 ? 0.45 : 1);
      hudText(ctx, 'LOCK', T.x, y0 - 70, A0 * blink, { size: 54 + 20 * lockFl, weight: 700, letterSpacing: 8, color: lockFl > 0.4 ? '#eafff2' : HC });
    } else {
      // seeker search crosshair
      hudLine(ctx, [[T.x - sz * 0.62, T.y, T.x - sz * 0.5, T.y], [T.x + sz * 0.5, T.y, T.x + sz * 0.62, T.y]], A0 * 0.7, 2);
    }
  }

  function drawCockpitGlass(ctx, t) {
    // HUD combiner glass + canopy reflections + darker canopy edges
    ctx.save();
    ctx.fillStyle = 'rgba(124,255,178,0.035)';
    M.roundRect(ctx, 450, 130, 1020, 820, 26); ctx.fill();
    ctx.strokeStyle = 'rgba(200,255,225,0.10)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalCompositeOperation = 'screen';
    const gx = ctx.createLinearGradient(300, 0, 900, 700);
    gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.5, 'rgba(255,240,220,0.07)'); gx.addColorStop(0.56, 'rgba(255,240,220,0.02)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gx; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.save();
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(4,8,10,0.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function shotC(ctx, t) {
    const sh = M.shake(t, shakeC(t), 20, 61);
    drawOutsideC(ctx, t, sh);
    drawCockpitGlass(ctx, t);
    // HUD powers down / glitches as the wingman's wake hits at 23.4
    const off = prog(t, T_WIPE, T_WIPE + 0.22);
    const glitch = t >= T_WIPE ? (hash(Math.round(t * FPS), 171) > 0.5 ? 0.35 : 1) : 1;
    drawHUD(ctx, t, sh, (1 - off) * glitch);
    A().scanlines(ctx, 0.08, { t });
    // flashes: cut-in (20.4), launch (22.2), impact (22.8)
    const f = 0.35 * decay(t, T_HUD, 14) + 0.18 * decay(t, T_MSL, 9) * (t >= T_MSL ? 1 : 0) + 0.25 * decay(t, T_IMP, 8) * (t >= T_IMP ? 1 : 0);
    if (f > 0.003) M.fill(ctx, t < 21 ? '#d8ffe8' : '#fff2dc', f);
    if (t >= T_WIPE) wingmanWipe(ctx, t);
  }

  // ================================================================ SHOT D (23.4 – 24.0): wingman passes the camera, filling the frame
  // Screen-space choreography: the jet grows as it comes at the lens (scale 4 → 16) while its trailing edge sweeps
  // right → left at ~5000 px/s, reaching x ≈ 1070 on the last frame — S4 opens with that edge at x = 900 moving on.
  const WIPE_EDGE_END = 1070, WIPE_V = 5025;
  function wipeGeom(tt) {
    const d = (T_END - 1 / 30) - tt;
    const u = clamp((tt - T_WIPE) / (T_END - 1 / 30 - T_WIPE));
    const sc = 4 * Math.pow(4, Math.pow(u, 0.85));
    const tail = WIPE_EDGE_END + WIPE_V * d;
    return { sc, tail, cx: tail - 250 * sc * 0.97, cy: lerp(600, 545, ease.outQuad(u)), u };
  }
  function wingmanWipe(ctx, t) {
    const G = wipeGeom(t), Ga = wipeGeom(t - 1 / 60), Gb = wipeGeom(t + 1 / 60);
    // world revealed behind the trailing edge: warm, motion-smeared golden-hour light (matches S4's first frame)
    const reveal = smoothstep(23.74, 23.88, t);
    if (reveal > 0) {
      ctx.save();
      const x0 = 0;
      const gr = ctx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#26304a'); gr.addColorStop(0.28, '#5c5468'); gr.addColorStop(0.45, '#d9854c'); gr.addColorStop(0.55, '#f6b26e');
      gr.addColorStop(0.6, '#e2a26a'); gr.addColorStop(0.72, '#a9744a'); gr.addColorStop(1, '#2e1d14');
      ctx.globalAlpha = reveal;
      ctx.fillStyle = gr; ctx.fillRect(x0, 0, W - x0, H);
      ctx.globalCompositeOperation = 'lighter';
      ctx.save(); ctx.translate(1420, 500); ctx.scale(3.4, 0.45); glow(ctx, 0, 0, 420, '#ffb060', 0.55 * reveal); ctx.restore();
      ctx.restore();
    }
    // the jet: rendered at reduced resolution (sprite mip path), motion-blurred along x, upscaled
    const vx = Gb.cx - Ga.cx;
    const rf = Math.min(1, 120 / (G.sc * 25.8));
    const JL = scratch('jetLayer', BW, BH), jg = JL.getContext('2d');
    const lw = Math.ceil((W + 200) * rf), lh = Math.ceil((H + 200) * rf);
    jg.clearRect(0, 0, lw + 2, lh + 2);
    jg.save(); jg.scale(rf, rf); jg.translate(100, 100);
    A().jet(jg, { x: G.cx, y: G.cy, scale: G.sc, view: 'side', flip: true, afterburner: 0.4, t, rot: 0.02 });
    jg.restore();
    ctx.save();
    ctx.translate(-100, -100); ctx.scale(1 / rf, 1 / rf);
    blurBlit(ctx, JL, vx * rf * 0.8, 0, 0, 0, lw, lh);
    ctx.restore();
    // cool shadowing of the jet body as it fills the lens (S4 continues with a blue-grey band)
    const dark = smoothstep(0.45, 1, G.u);
    if (dark > 0.003) {
      ctx.save(); ctx.globalAlpha = 0.35 * dark;
      const e1 = G.tail - 40, e0 = e1 - 420;
      const dg = ctx.createLinearGradient(e0, 0, e1, 0);
      dg.addColorStop(0, 'rgba(38,48,60,1)'); dg.addColorStop(1, 'rgba(38,48,60,0)');
      ctx.fillStyle = dg; ctx.fillRect(0, 0, Math.max(0, Math.min(W, e1)), H);
      ctx.restore();
    }
    // exhaust heat blooms at the trailing edge (S4 picks these up at its x = edge + 160)
    const ea = smoothstep(0.55, 0.95, G.u);
    if (ea > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const yy of [470, 610]) {
        ctx.save(); ctx.translate(G.tail + 160, yy); ctx.scale(3.2, 0.42);
        glow(ctx, 0, 0, 220, '#ff8a3a', 0.5 * ea); glow(ctx, -40, 0, 80, '#ffe0b0', 0.55 * ea);
        ctx.restore();
      }
      ctx.restore();
    }
    A().motionStreaks(ctx, t, { dir: 'left', alpha: 0.45 * Math.sin(Math.PI * Math.min(1, G.u * 1.2)) + 0.3 * G.u, count: 60, color: '#ffe8c8', speed: 5200, width: 3, length: 1.8 });
  }

  // ================================================================ dispatcher
  function draw(ctx, lt, t) {
    if (t < T_FORM) shotA(ctx, t);
    else if (t < T_HUD) shotB(ctx, t);
    else shotC(ctx, t);
  }

  M.registerScene({ id: 's3_air', start: T0, end: T_END, z: 0, draw });
})();
