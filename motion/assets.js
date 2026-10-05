/*
 * M.assets — shared drawing library for «درع الوطن».
 * Every draw function is a pure function of its arguments (and t when given).
 * Caches only hold t-independent content (pre-rendered sprites, textures, meshes).
 * See ASSETS.md for the documented API.
 */
(function () {
  const M = window.M;
  const A = (M.assets = M.assets || {});
  const { W, H, clamp, lerp, hash, rng, noise1 } = M;
  const TAU = Math.PI * 2;

  // ======================================================================
  // 0. Utilities
  // ======================================================================
  const smooth = (e0, e1, x) => { const k = clamp((x - e0) / (e1 - e0)); return k * k * (3 - 2 * k); };
  const fract = (x) => x - Math.floor(x);
  const wrap = (v, a, b) => a + ((((v - a) % (b - a)) + (b - a)) % (b - a));

  const _hexCache = {};
  function rgb(c) {
    if (Array.isArray(c)) return c;
    if (_hexCache[c]) return _hexCache[c];
    let r = [255, 255, 255];
    if (c[0] === '#') {
      let h = c.slice(1);
      if (h.length === 3) h = h.split('').map((x) => x + x).join('');
      r = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    } else {
      const m = c.match(/[\d.]+/g); if (m) r = [+m[0], +m[1], +m[2]];
    }
    return (_hexCache[c] = r);
  }
  function rgba(c, a = 1) { const v = rgb(c); return `rgba(${v[0] | 0},${v[1] | 0},${v[2] | 0},${a})`; }
  function mix(c1, c2, k) { const a = rgb(c1), b = rgb(c2); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
  function mixs(c1, c2, k, a = 1) { return rgba(mix(c1, c2, k), a); }
  function shade(c, k) { const v = rgb(c); return k >= 0 ? mix(v, [255, 255, 255], k) : mix(v, [0, 0, 0], -k); }

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  // scratch canvases: re-used across calls, always fully cleared before use (no state carried between frames)
  const _scratch = {};
  function scratch(key, w, h) {
    let c = _scratch[key];
    w = Math.ceil(w); h = Math.ceil(h);
    if (!c || c.width < w || c.height < h) { c = _scratch[key] = canvas(Math.max(w, c ? c.width : 0), Math.max(h, c ? c.height : 0)); }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
    // QA: clear the WHOLE canvas, not just w×h — smoothed sub-rect draws / blurs sample past the
    // requested rect, so leftovers from an earlier (larger) call made output depend on render order.
    g.clearRect(0, 0, c.width, c.height);
    return c;
  }
  // 2D value noise in [-1,1]
  function noise2(x, y, seed = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const h = (i, j) => hash(i * 7919 + j * 104729, seed);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v) * 2 - 1;
  }
  function fbm2(x, y, seed = 0, oct = 4) {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f, seed + i * 31); f *= 2.03; a *= 0.5; }
    return s;
  }
  function radial(ctx, x, y, r, stops) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }
  function glowDot(ctx, x, y, r, color, a = 1) {
    if (a <= 0 || r <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.drawImage(SPR.glow, x - r, y - r, r * 2, r * 2);
    ctx.restore();
    void color;
  }
  // tinted copy of a (white/gray) sprite, cached per color
  const _tintCache = new Map();
  function tinted(spr, color, key) {
    const k = key + '|' + color;
    let c = _tintCache.get(k);
    if (c) return c;
    c = canvas(spr.width, spr.height);
    const g = c.getContext('2d');
    g.drawImage(spr, 0, 0);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(spr, 0, 0);
    _tintCache.set(k, c);
    return c;
  }
  function glowSprite(color, size = 128, falloff = 2.2) {
    const c = canvas(size, size), g = c.getContext('2d'), r = size / 2;
    const v = rgb(color);
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    for (let i = 0; i <= 12; i++) { const k = i / 12; grd.addColorStop(k, `rgba(${v[0]},${v[1]},${v[2]},${Math.pow(1 - k, falloff)})`); }
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    return c;
  }
  const _glowCache = {};
  function glowOf(color) { return _glowCache[color] || (_glowCache[color] = glowSprite(color, 128, 2.2)); }
  function glow(ctx, x, y, r, color, a = 1) {
    if (a <= 0.001 || r <= 0.5) return;
    const ga = ctx.globalAlpha; ctx.globalAlpha = ga * Math.min(1, a);
    ctx.drawImage(glowOf(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = ga;
  }

  const SPR = {}; // sprite store (built in init)

  // ======================================================================
  // 1. Sky
  // ======================================================================
  const SKY = {
    golden: { top: '#1d3557', mid: '#c96f3b', horizon: '#ffcf86', sun: '#fff1c9', glow: '#ffb35c', haze: '#ffd9a0' },
    dawn: { top: '#16233f', mid: '#7a5a86', horizon: '#ffb07a', sun: '#fff0d8', glow: '#ff9a6a', haze: '#f6c2a0' },
    day: { top: '#2f6fb5', mid: '#7fb2dc', horizon: '#e9dcc0', sun: '#ffffff', glow: '#fff1c8', haze: '#efe2c8' },
    dusk: { top: '#0d1430', mid: '#4b2d4f', horizon: '#e0784a', sun: '#ffd6a0', glow: '#ff7a3a', haze: '#c97a5a' },
    night: { top: '#03060c', mid: '#0a1a28', horizon: '#173246', sun: '#dfe9ff', glow: '#7aa6d6', haze: '#1b3346' },
  };
  A.skyPresets = SKY;
  /**
   * sky(ctx, {preset, top, mid, horizon, horizonY, sunX, sunY, sunR, glow, stars, t})
   */
  // static skies are cached (LRU) by their options: identical output, ~10 ms cheaper per frame
  const _skyCache = new Map();
  function sky(ctx, o = {}) {
    if (!o.stars && o.cache !== false) {
      const key = JSON.stringify([o.preset, o.top, o.mid, o.horizon, o.haze, o.sunColor, o.glowColor, o.horizonY, o.sunX, o.sunY, o.sunR, o.glow].map((v) => (typeof v === 'number' ? Math.round(v * 2) / 2 : v)));
      let c = _skyCache.get(key);
      if (!c) {
        c = canvas(W, H);
        skyDraw(c.getContext('2d'), Object.assign({}, o, { horizonY: o.horizonY != null ? Math.round(o.horizonY * 2) / 2 : o.horizonY, sunX: o.sunX != null ? Math.round(o.sunX * 2) / 2 : o.sunX, sunY: o.sunY != null ? Math.round(o.sunY * 2) / 2 : o.sunY }));
        _skyCache.set(key, c);
        if (_skyCache.size > 6) _skyCache.delete(_skyCache.keys().next().value);
      } else { _skyCache.delete(key); _skyCache.set(key, c); }
      ctx.drawImage(c, 0, 0);
      return;
    }
    skyDraw(ctx, o);
  }
  function skyDraw(ctx, o) {
    const P = Object.assign({}, SKY[o.preset || 'golden'] || SKY.golden);
    for (const k of ['top', 'mid', 'horizon', 'haze']) if (o[k]) P[k] = o[k];
    if (o.sunColor) P.sun = o.sunColor;
    if (o.glowColor) P.glow = o.glowColor;
    const hy = o.horizonY != null ? o.horizonY : H * 0.62;
    const sunX = o.sunX != null ? o.sunX : W * 0.7, sunY = o.sunY != null ? o.sunY : hy - 120;
    const sunR = o.sunR != null ? o.sunR : 60;
    const glowK = o.glow != null ? o.glow : 1;
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, rgba(P.top));
    g.addColorStop(0.55, mixs(P.top, P.mid, 0.75));
    g.addColorStop(0.8, rgba(P.mid));
    g.addColorStop(1, rgba(P.horizon));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, Math.max(1, hy) + 1);
    // below horizon: continue haze (dunes/sea normally cover it)
    const g2 = ctx.createLinearGradient(0, hy, 0, H);
    g2.addColorStop(0, rgba(P.horizon)); g2.addColorStop(1, mixs(P.horizon, P.mid, 0.6));
    ctx.fillStyle = g2; ctx.fillRect(0, hy, W, H - hy + 1);
    // stars
    if (o.stars) {
      const n = o.stars === true ? 260 : o.stars;
      const tt = o.t || 0;
      for (let i = 0; i < n; i++) {
        const x = hash(i, 901) * W, y = Math.pow(hash(i, 902), 1.4) * hy * 0.95;
        const tw = 0.55 + 0.45 * Math.sin(tt * (1 + hash(i, 903) * 3) + i);
        const s = 0.6 + Math.pow(hash(i, 904), 6) * 2.2;
        ctx.fillStyle = `rgba(230,240,255,${(0.25 + 0.75 * hash(i, 905)) * tw * (1 - y / hy * 0.6)})`;
        ctx.fillRect(x, y, s, s);
      }
    }
    // horizon glow band (wide, under the sun)
    ctx.globalCompositeOperation = 'screen';
    ctx.save();
    ctx.translate(sunX, hy); ctx.scale(4.5, 1);
    ctx.fillStyle = radial(ctx, 0, 0, 260, [[0, rgba(P.glow, 0.45 * glowK)], [0.5, rgba(P.glow, 0.16 * glowK)], [1, rgba(P.glow, 0)]]);
    ctx.fillRect(-260, -260, 520, 520);
    ctx.restore();
    // sun bloom
    if (sunR > 0) {
      ctx.fillStyle = radial(ctx, sunX, sunY, sunR * 14, [[0, rgba(P.glow, 0.55 * glowK)], [0.18, rgba(P.glow, 0.22 * glowK)], [0.5, rgba(P.glow, 0.06 * glowK)], [1, rgba(P.glow, 0)]]);
      ctx.fillRect(sunX - sunR * 14, sunY - sunR * 14, sunR * 28, sunR * 28);
      ctx.fillStyle = radial(ctx, sunX, sunY, sunR * 3.2, [[0, rgba(P.sun, 0.9)], [0.3, rgba(P.sun, 0.45 * glowK)], [1, rgba(P.glow, 0)]]);
      ctx.fillRect(sunX - sunR * 3.2, sunY - sunR * 3.2, sunR * 6.4, sunR * 6.4);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = radial(ctx, sunX, sunY, sunR, [[0, '#ffffff'], [0.7, rgba(P.sun)], [0.92, rgba(P.sun, 0.85)], [1, rgba(P.sun, 0)]]);
      ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  A.sky = sky;

  // ======================================================================
  // 2. Clouds — volumetric-looking sprites: density field (fbm) + 2D light march
  // ======================================================================
  const CLOUD_TINTS = {
    golden: { light: '#fff0cf', mid: '#f0b07c', shade: '#7e5f74', rim: '#fff7e0', amb: '#c88a74' },
    dawn: { light: '#ffe2d2', mid: '#e0a0a8', shade: '#4f4a72', rim: '#fff2ea', amb: '#9a7a96' },
    day: { light: '#ffffff', mid: '#e8eef5', shade: '#8f9fb3', rim: '#ffffff', amb: '#c4d0de' },
    night: { light: '#8ea6c6', mid: '#4a5f7a', shade: '#121a26', rim: '#c4d8f0', amb: '#26344a' },
    storm: { light: '#d9d3ca', mid: '#9a9a9e', shade: '#363b45', rim: '#f0eae0', amb: '#5a5e68' },
  };
  A.cloudTints = CLOUD_TINTS;
  const CLOUD_N = 8;
  const _cloudField = {};
  // periodic noise helper (period px in x when per>0)
  function pnoise2(x, y, seed, per) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const wx = (i) => (per > 0 ? ((i % per) + per) % per : i);
    const h = (i, j) => hash(wx(i) * 7919 + j * 104729, seed);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v) * 2 - 1;
  }
  function pfbm(x, y, seed, per, oct) {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { s += a * pnoise2(x * f, y * f, seed + i * 31, per ? per * f : 0); f *= 2; a *= 0.5; }
    return s;
  }
  // kind: 0 cumulus, 1 wide cumulus, 2 stratus streak, 'deck' (tileable strip)
  function cloudField(idx, kind) {
    const key = kind + ':' + idx;
    if (_cloudField[key]) return _cloudField[key];
    const deck = kind === 'deck';
    const w = deck ? 768 : 360, h = deck ? 200 : 180;
    const R = rng(4242 + idx * 131 + (deck ? 999 : 0));
    const blobs = [];
    if (deck) {
      for (let i = 0; i < 26; i++) blobs.push({ x: (i + R() * 0.6) / 26 * w, y: h * (0.55 + R() * 0.12), rx: 28 + R() * 34, ry: 26 + R() * 30 });
    } else {
      const k = idx % 3;
      const nb = k === 2 ? 7 : 4 + ((R() * 3) | 0);
      for (let i = 0; i < nb; i++) {
        const u = (i + 0.5) / nb;
        const tall = k === 2 ? 0.35 : Math.sin(u * Math.PI) * (0.8 + R() * 0.4);
        const rx = (k === 2 ? 46 : 40) + R() * 26, ry = k === 2 ? 18 + R() * 10 : 30 + tall * 32 + R() * 10;
        blobs.push({ x: w * (0.14 + 0.72 * u) + (R() - 0.5) * 20, y: h * 0.72 - ry * 0.75 - tall * 18, rx, ry });
      }
    }
    const baseY = deck ? h * 1.2 : h * 0.74;
    const D = new Float32Array(w * h), Hf = new Float32Array(w * h);
    const per = deck ? 24 : 0; // noise period (cells) so the deck strip tiles horizontally
    const ns = deck ? w / 24 : 30;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let se = 0;
      for (const b of blobs) {
        let dx = (x - b.x) / b.rx; if (deck) { dx = ((((x - b.x) % w) + w * 1.5) % w - w / 2) / b.rx; }
        const dy = (y - b.y) / b.ry;
        se += Math.exp(6 * (1 - dx * dx - dy * dy));
      }
      const m = Math.log(se + 1e-9) / 6; // soft union of paraboloid blobs (negative outside)
      // fbm: first 3 octaves drive the bumps, all 5 drive the edges
      let n3 = 0, n5 = 0, a = 0.5, f = 1;
      for (let o = 0; o < 5; o++) {
        const v = a * pnoise2(x / ns * f, y / ns * f, 77 + idx * 13 + o * 31, per ? per * f : 0);
        if (o < 3) n3 += v; n5 += v; f *= 2; a *= 0.5;
      }
      Hf[y * w + x] = Math.max(-0.3, m) * 0.8 + n3 * 0.3;
      let d = smooth(0, 0.3, m + n5 * 0.34 - 0.06);
      if (!deck) {
        d *= smooth(baseY + 12, baseY - 16, y + n5 * 14);
        d *= smooth(0, 14, x) * smooth(w, w - 14, x) * smooth(0, 12, y); // window: zero at sprite borders
      } else {
        d = Math.max(d, smooth(h * 0.6, h * 0.92, y + n5 * 20));
        d *= smooth(h * 0.12, h * 0.3, y);
      }
      D[y * w + x] = d;
    }
    // light march toward the sun (up and slightly left), bilinear samples
    const Tm = new Float32Array(w * h);
    const lx = -0.3, ly = -1, ll = Math.hypot(lx, ly), sx = lx / ll * 2, sy = ly / ll * 2;
    const samp = (px, py) => {
      if (py < 0) return 0;
      if (deck) px = ((px % w) + w) % w; else if (px < 0 || px > w - 2) return 0;
      const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
      const x1 = deck ? (x0 + 1) % w : x0 + 1, y1 = Math.min(h - 1, y0 + 1);
      return lerp(lerp(D[y0 * w + x0], D[y0 * w + x1], fx), lerp(D[y1 * w + x0], D[y1 * w + x1], fx), fy);
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let acc = 0, px = x, py = y;
      for (let s = 0; s < 22; s++) { px += sx; py += sy; if (py < 0) break; acc += samp(px, py); }
      Tm[y * w + x] = Math.exp(-acc * 0.11);
    }
    // bump lighting from the (unsaturated) height field: cauliflower puffs
    const Bm = new Float32Array(w * h);
    const L3x = -0.35, L3y = -0.75, L3z = 0.55;
    for (let y = 1; y < h - 1; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xl = x > 0 ? i - 1 : (deck ? i + w - 1 : i), xr = x < w - 1 ? i + 1 : (deck ? i - w + 1 : i);
      const gx = (Hf[xr] - Hf[xl]) * 0.5, gy = (Hf[i + w] - Hf[i - w]) * 0.5;
      const nx = -gx * 6, ny = -gy * 6, nz = 1, nl = Math.hypot(nx, ny, nz);
      Bm[i] = (nx * L3x + ny * L3y + nz * L3z) / nl;
    }
    return (_cloudField[key] = { w, h, D, Tm, Bm, deck });
  }
  const _cloudCache = {};
  function buildCloud(idx, tint, kind) {
    const T = typeof tint === 'string' ? (CLOUD_TINTS[tint] || CLOUD_TINTS.golden) : tint;
    const F = cloudField(idx, kind);
    const { w, h, D, Tm, Bm } = F;
    const c = canvas(w, h), g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const Lc = rgb(T.light), Mc = rgb(T.mid), Sc = rgb(T.shade), Rc = rgb(T.rim), Ac = rgb(T.amb || T.mid);
    for (let i = 0; i < w * h; i++) {
      const d = D[i]; if (d <= 0.01) continue;
      const y = (i / w) | 0;
      const tr = Tm[i];
      const lit = clamp(Math.pow(tr, 0.8) * 0.75 + (Bm[i] - 0.45) * 0.9 + 0.08);
      let r, gg, b;
      // shade -> mid -> light by transmittance
      if (lit < 0.5) { const k = lit / 0.5; r = lerp(Sc[0], Mc[0], k); gg = lerp(Sc[1], Mc[1], k); b = lerp(Sc[2], Mc[2], k); }
      else { const k = (lit - 0.5) / 0.5; r = lerp(Mc[0], Lc[0], k); gg = lerp(Mc[1], Lc[1], k); b = lerp(Mc[2], Lc[2], k); }
      // ambient bounce at the bottom
      const hb = F.deck ? 0 : smooth(h * 0.45, h * 0.78, y) * 0.35 * (1 - lit);
      r = lerp(r, Ac[0], hb); gg = lerp(gg, Ac[1], hb); b = lerp(b, Ac[2], hb);
      // silver lining on thin lit edges
      const edge = (1 - smooth(0.05, 0.6, d)) * tr * tr;
      r = lerp(r, Rc[0], edge * 0.7); gg = lerp(gg, Rc[1], edge * 0.7); b = lerp(b, Rc[2], edge * 0.7);
      const a = smooth(0.0, 0.55, d);
      const j = i * 4;
      img.data[j] = r; img.data[j + 1] = gg; img.data[j + 2] = b; img.data[j + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    // upscale x2 with smoothing for soft, high quality sprites
    const c2 = canvas(w * 2, h * 2), g2 = c2.getContext('2d');
    g2.imageSmoothingQuality = 'high';
    if (F.deck) { for (const ox of [-1, 0, 1]) g2.drawImage(c, ox * w * 2, 0, w * 2, h * 2); } // wrap-around: seamless tiling
    else { g2.filter = 'blur(0.6px)'; g2.drawImage(c, 0, 0, w * 2, h * 2); }
    return c2;
  }
  function cloudSprite(idx, tint = 'golden', kind = 0) {
    const key = (typeof tint === 'string' ? tint : JSON.stringify(tint)) + ':' + kind + ':' + idx;
    return _cloudCache[key] || (_cloudCache[key] = buildCloud(idx, tint, kind));
  }
  /**
   * clouds(ctx, t, {seed, count, y0, y1, speed, scale, tint, alpha, xMin, xMax})
   * Clouds drift left at `speed` px/s (scaled by each cloud's depth -> parallax).
   */
  function clouds(ctx, t, o = {}) {
    const seed = o.seed || 1, count = o.count != null ? o.count : 8;
    const y0 = o.y0 != null ? o.y0 : 120, y1 = o.y1 != null ? o.y1 : 520;
    const speed = o.speed != null ? o.speed : 20, sc = o.scale || 1, tint = o.tint || 'golden';
    const alpha = o.alpha != null ? o.alpha : 1;
    const xMin = o.xMin != null ? o.xMin : -720 * sc, xMax = o.xMax != null ? o.xMax : W + 720 * sc;
    const span = xMax - xMin;
    const list = [];
    for (let i = 0; i < count; i++) list.push({ i, d: 0.35 + 0.65 * hash(i, seed * 13 + 1) });
    list.sort((a, b) => a.d - b.d);
    ctx.save();
    for (const { i, d } of list) {
      const spr = cloudSprite(Math.floor(hash(i, seed * 13 + 2) * CLOUD_N), tint, 0);
      const s = sc * (0.5 + 0.7 * d) * (0.8 + 0.4 * hash(i, seed * 13 + 3)) * 1.1;
      const w = spr.width * s, h = spr.height * s;
      const x = wrap(xMin + hash(i, seed * 13 + 4) * span - speed * t * d, xMin, xMax);
      const y = lerp(y0, y1, hash(i, seed * 13 + 5));
      ctx.globalAlpha = alpha * (0.6 + 0.4 * d);
      if (hash(i, seed * 13 + 6) < 0.35) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(spr, -w / 2, y - h * 0.62, w, h); ctx.restore(); }
      else ctx.drawImage(spr, x - w / 2, y - h * 0.62, w, h);
    }
    ctx.restore();
  }
  A.clouds = clouds;
  A.cloudSprite = cloudSprite;

  /**
   * cloudDeck(ctx, t, {y, depth, speed, tint, seed, alpha}) — sea of cloud tops seen from above,
   * three tileable rows in perspective between y (far edge) and y+depth (near).
   */
  function cloudDeck(ctx, t, o = {}) {
    const y = o.y != null ? o.y : 700, depth = o.depth != null ? o.depth : H - y;
    const speed = o.speed != null ? o.speed : 120, tint = o.tint || 'golden', seed = (o.seed || 0) % 3;
    const alpha = o.alpha != null ? o.alpha : 1;
    const T = typeof tint === 'string' ? (CLOUD_TINTS[tint] || CLOUD_TINTS.golden) : tint;
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, y - 20, 0, y + depth);
    g.addColorStop(0, rgba(T.mid, 0)); g.addColorStop(0.1, rgba(T.mid, 0.9)); g.addColorStop(1, rgba(mix(T.mid, T.shade, 0.5), 1));
    ctx.fillStyle = g; ctx.fillRect(0, y - 20, W, depth + 40);
    const rows = [[0.0, 0.55, 0.3], [0.22, 1.0, 0.6], [0.5, 1.8, 1.0], [0.85, 3.0, 1.6]];
    rows.forEach(([f, sc, sp], r) => {
      const spr = cloudSprite((seed + r) % 3, tint, 'deck');
      const w = spr.width * sc, h = spr.height * sc;
      const yy = y + depth * f - h * 0.45;
      const off = wrap(-t * speed * sp + hash(r, seed + 5) * w, -w, 0);
      for (let x = off; x < W; x += w - 0.5) ctx.drawImage(spr, Math.floor(x), yy, Math.ceil(w) + 1, h);
      // haze between rows
      if (r < rows.length - 1) {
        const hg = ctx.createLinearGradient(0, yy + h * 0.2, 0, yy + h * 0.9);
        hg.addColorStop(0, rgba(T.mid, 0.0)); hg.addColorStop(0.6, rgba(T.mid, 0.14)); hg.addColorStop(1, rgba(T.mid, 0));
        ctx.fillStyle = hg; ctx.fillRect(0, yy + h * 0.2, W, h * 0.7);
      }
    });
    ctx.restore();
  }
  A.cloudDeck = cloudDeck;

  // ======================================================================
  // 3. Dunes
  // ======================================================================
  const DUNE_PAL = {
    golden: { light: '#ffcf8a', mid: '#dc9d5e', shadow: '#7a4a3e', deep: '#4a2a2c', haze: '#f5c48e', crest: '#fff1c4' },
    dawn: { light: '#f0c0a0', mid: '#c99880', shadow: '#6a4a5a', deep: '#3e2c3c', haze: '#e7b8a8', crest: '#ffe8da' },
    day: { light: '#f4dcae', mid: '#d9b47a', shadow: '#a07a50', deep: '#7a5838', haze: '#efe2c8', crest: '#fff8e8' },
    night: { light: '#4c5a6a', mid: '#2f3a48', shadow: '#151c26', deep: '#0b1016', haze: '#22374a', crest: '#7d93ad' },
    dusk: { light: '#e09a6a', mid: '#a86a4e', shadow: '#4a2c30', deep: '#2a1a20', haze: '#c97a5a', crest: '#ffd0a0' },
  };
  A.dunePalettes = DUNE_PAL;
  /**
   * dunes(ctx, t, {horizonY, layers, palette, scroll, seed, light, amp, bottom})
   * layers drawn far->near; nearest layer scrolls `scroll` px/s (positive = terrain moves left).
   * light: 1 = sun on the left (lee shadows on the right of each crest), -1 = sun on the right.
   */
  function dunes(ctx, t, o = {}) {
    const hy = o.horizonY != null ? o.horizonY : H * 0.6;
    const L = o.layers || 5, seed = o.seed || 1;
    const P = typeof o.palette === 'object' ? Object.assign({}, DUNE_PAL.golden, o.palette) : DUNE_PAL[o.palette || 'golden'] || DUNE_PAL.golden;
    const scroll = o.scroll || 0, light = o.light != null ? (o.light >= 0 ? 1 : -1) : 1;
    const ampK = o.amp != null ? o.amp : 1;
    const bottom = o.bottom != null ? o.bottom : H;
    ctx.save();
    for (let l = 0; l < L; l++) {
      const k = L === 1 ? 1 : l / (L - 1);           // 0 far .. 1 near
      const depth = lerp(0.1, 1, Math.pow(k, 1.4));
      const fog = Math.pow(1 - k, 1.5) * 0.8;
      const base = hy + (bottom - hy) * lerp(0.03, 0.74, Math.pow(k, 1.2));
      const amp = ampK * lerp(10, 200, Math.pow(k, 1.7));
      const S = lerp(420, 1300, Math.pow(k, 1.2));     // mean dune spacing px
      const off = scroll * t * depth + hash(l, seed) * S * 5;
      const cLight = mix(P.light, P.haze, fog), cMid = mix(P.mid, P.haze, fog);
      const cShadow = mix(P.shadow, P.haze, fog * 0.9), cDeep = mix(P.deep, P.haze, fog * 0.85);
      const ls = l * 1000 + seed * 7;
      const ax = (j) => j * S + (hash(j, ls + 4) - 0.5) * S * 0.55; // variable dune widths
      const k0 = Math.floor((off - S * 2) / S), k1 = Math.ceil((off + W + S * 2) / S);
      const trough = (j) => base - amp * 0.16 * hash(j, ls + 1);
      const dn = [];
      for (let j = k0; j <= k1; j++) {
        const a = ax(j) - off, b = ax(j + 1) - off;
        const hk = amp * (0.3 + 0.7 * Math.pow(hash(j, ls + 2), 0.8)) * (0.6 + 0.4 * (b - a) / S);
        const sk = 0.58 + 0.2 * hash(j, ls + 3);
        const c = light > 0 ? lerp(a, b, sk) : lerp(b, a, sk);
        dn.push({ a, b, c, h: hk, ya: trough(j), yb: trough(j + 1), j });
      }
      const j_ = (d) => d.j;
      const ridgeY = (d, x) => {
        const yl = lerp(d.ya, d.yb, (x - d.a) / (d.b - d.a));
        let y;
        const wind = light > 0 ? x <= d.c : x >= d.c;
        if (wind) {
          const p = light > 0 ? (x - d.a) / (d.c - d.a) : (d.b - x) / (d.b - d.c);
          y = d.h * Math.pow(1 - Math.pow(1 - p, 1.9), 1.15);
        } else {
          const q = light > 0 ? (x - d.c) / (d.b - d.c) : (d.c - x) / (d.c - d.a);
          y = d.h * Math.pow(1 - q, 1.7);
        }
        return yl - y + noise1(x * 0.015, ls + 9) * amp * 0.035;
      };
      const step = lerp(10, 5, k);
      ctx.beginPath();
      ctx.moveTo(-10, H + 10);
      for (const d of dn) {
        if (d.b < -30 || d.a > W + 30) continue;
        for (let x = Math.max(d.a, -30); x < Math.min(d.b, W + 30); x += step) {
          if ((x < d.c && x + step > d.c)) ctx.lineTo(d.c, ridgeY(d, d.c));
          ctx.lineTo(x, ridgeY(d, x));
        }
      }
      ctx.lineTo(W + 10, H + 10); ctx.closePath();
      const top = base - amp * 1.15, bot = Math.min(H, base + (bottom - hy) * 0.3 + 60);
      const bg = ctx.createLinearGradient(0, top, 0, bot);
      bg.addColorStop(0, rgba(cLight)); bg.addColorStop(0.4, rgba(mix(cLight, cMid, 0.6))); bg.addColorStop(1, rgba(mix(cMid, cShadow, 0.45)));
      ctx.fillStyle = bg; ctx.fill();
      ctx.save(); // (shadow shapes follow the ridge exactly, so no clip is needed)
      // lee-side shadows: crest -> slip face -> curved shadow edge sweeping down
      for (const d of dn) {
        if (Math.max(d.a, d.b) < -60 || Math.min(d.a, d.b) > W + 60) continue;
        const yc = ridgeY(d, d.c);
        const far = light > 0 ? d.b : d.a, near = light > 0 ? d.a : d.b;
        const yb = base + amp * 1.25 + 20;
        const yt = ridgeY(d, far);
        ctx.beginPath();
        ctx.moveTo(d.c, yc);
        for (let i = 1; i <= 16; i++) { const x = lerp(d.c, far, i / 16); ctx.lineTo(x, ridgeY(d, x)); }
        // valley line: curves down from the trough, bending back under the dune
        const xv = lerp(d.c, far, 0.62 + 0.2 * hash(j_(d), ls + 6));
        ctx.bezierCurveTo(far + (far - d.c) * 0.08, lerp(yt, yb, 0.35), xv, lerp(yt, yb, 0.7), xv, yb);
        const xm = lerp(d.c, near, 0.05 + 0.2 * hash(j_(d), ls + 5));
        ctx.lineTo(xm, yb);
        ctx.bezierCurveTo(xm, lerp(yc, yb, 0.55), lerp(d.c, near, 0.1), yc + d.h * 0.3, d.c, yc);
        ctx.closePath();
        const sg = ctx.createLinearGradient(0, yc, 0, lerp(yc + d.h * 1.2, yb, k));
        const sa = 1 - fog * 0.6;
        sg.addColorStop(0, rgba(cDeep, 0.95 * sa)); sg.addColorStop(0.35, rgba(cShadow, 0.85 * sa)); sg.addColorStop(1, rgba(cShadow, 0));
        ctx.fillStyle = sg; ctx.fill();
      }
      // crest highlight lines on the windward side of each crest
      ctx.lineCap = 'round';
      ctx.lineWidth = 1 + 1.6 * k;
      for (const d of dn) {
        if (Math.max(d.a, d.b) < -60 || Math.min(d.a, d.b) > W + 60) continue;
        const near = light > 0 ? d.a : d.b;
        const cg = ctx.createLinearGradient(lerp(near, d.c, 0.5), 0, d.c, 0);
        cg.addColorStop(0, rgba(mix(P.crest, P.haze, fog), 0)); cg.addColorStop(1, rgba(mix(P.crest, P.haze, fog), 0.75 * (1 - fog * 0.6)));
        ctx.strokeStyle = cg;
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) { const x = lerp(lerp(near, d.c, 0.5), d.c, i / 12); i ? ctx.lineTo(x, ridgeY(d, x) + 1.2) : ctx.moveTo(x, ridgeY(d, x) + 1.2); }
        ctx.stroke();
      }
      // sand ripples on the near layers (follow the windward slope)
      if (k > 0.7) {
        ctx.globalAlpha = Math.min(1, (k - 0.5) * 2);
        ctx.lineWidth = 1 + k;
        for (const d of dn) {
          if (Math.max(d.a, d.b) < -60 || Math.min(d.a, d.b) > W + 60) continue;
          const near = light > 0 ? d.a : d.b;
          const rg = ctx.createLinearGradient(near, 0, d.c, 0);
          rg.addColorStop(0, rgba(cDeep, 0)); rg.addColorStop(0.3, rgba(cDeep, 0.17)); rg.addColorStop(0.75, rgba(cDeep, 0.14)); rg.addColorStop(0.92, rgba(cDeep, 0));
          ctx.strokeStyle = rg;
          for (let r = 0; r < 7; r++) {
            const f = 0.12 + r * 0.1;
            ctx.beginPath();
            for (let i = 0; i <= 18; i++) {
              const x = lerp(near, d.c, i / 18 * 0.9);
              const y = ridgeY(d, x) + d.h * f * (1.25 - 0.45 * i / 18) + Math.sin(x * 0.045 + r * 2.3) * 3 * k + r * r * 0.6;
              i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            }
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      // atmospheric haze at the foot of each layer (depth separation)
      if (fog > 0.03) {
        const hg = ctx.createLinearGradient(0, base - amp * 0.6, 0, base + 40);
        hg.addColorStop(0, rgba(P.haze, 0)); hg.addColorStop(1, rgba(P.haze, fog * 0.55));
        ctx.fillStyle = hg; ctx.fillRect(0, base - amp * 0.6, W, amp * 0.6 + 40);
      }
    }
    // one sun-side sheen over the whole land (cheaper than per layer)
    const sh = ctx.createLinearGradient(light > 0 ? 0 : W, 0, light > 0 ? W : 0, 0);
    sh.addColorStop(0, rgba(P.crest, 0.1)); sh.addColorStop(0.55, rgba(P.crest, 0)); sh.addColorStop(1, rgba(P.deep, 0.08));
    ctx.fillStyle = sh; ctx.fillRect(0, hy + 2, W, bottom - hy);
    // foreground darkening (golden-hour depth)
    const fg = ctx.createLinearGradient(0, lerp(hy, bottom, 0.55), 0, bottom);
    fg.addColorStop(0, rgba(P.deep, 0)); fg.addColorStop(1, rgba(P.deep, 0.35));
    ctx.fillStyle = fg; ctx.fillRect(0, lerp(hy, bottom, 0.55), W, bottom - lerp(hy, bottom, 0.55) + 1);
    ctx.restore();
  }
  A.dunes = dunes;

  // ======================================================================
  // 4. Tiny 3D renderer (lofted meshes, painter's sort, lit faces)
  //    Model space: X forward, Y up, Z right (starboard). Units: meters.
  // ======================================================================
  const V3 = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  };
  function matMul(A, B) { // 3x3 row-major
    const C = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    return C;
  }
  const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
  const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
  const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
  // camera matrix: object attitude (roll about X, pitch about Z, yaw about Y), then camera elevation (look-down)
  function camMatrix(yaw = 0, pitch = 0, roll = 0, elev = 0) {
    let R = matMul(rotZ(pitch), rotX(roll));
    R = matMul(rotY(yaw), R);
    return matMul(rotX(elev), R);
  }

  function Mesh() { return { V: [], F: [] }; }
  function addV(m, p) { m.V.push(p[0], p[1], p[2]); return m.V.length / 3 - 1; }
  const vget = (m, i) => [m.V[i * 3], m.V[i * 3 + 1], m.V[i * 3 + 2]];
  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return p1.map((_, k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
  }
  function crLoop(pts, sub) {
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (let k = 0; k < sub; k++) out.push(catmull(p0, p1, p2, p3, k / sub));
    }
    return out;
  }
  // keyframed scalar with smoothstep easing between keys
  function keys(K) {
    return (s) => {
      if (s <= K[0][0]) return K[0][1];
      for (let i = 1; i < K.length; i++) if (s <= K[i][0]) { const k = (s - K[i - 1][0]) / (K[i][0] - K[i - 1][0]); const e = k * k * (3 - 2 * k); return lerp(K[i - 1][1], K[i][1], e); }
      return K[K.length - 1][1];
    };
  }
  /**
   * loft(mesh, rings, opts): rings = array of closed loops (same point count) of [x,y,z].
   * opts.mat(i, j, ctr, gn) -> material; opts.lines(i, j) -> array of [s0,t0,s1,t1] (face-local) ; opts.bias; opts.capEnd / capStart material
   */
  function loft(m, rings, o = {}) {
    const nr = rings.length, nc = rings[0].length;
    const base = m.V.length / 3;
    for (const r of rings) for (const p of r) addV(m, p);
    const id = (i, j) => base + i * nc + ((j + nc) % nc);
    // geometric face normals, oriented outward using ring centroid
    const cen = rings.map((r) => { const c = [0, 0, 0]; for (const p of r) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return V3.mul(c, 1 / r.length); });
    const fn = [];
    let vote = 0;
    for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc; j++) {
      const a = vget(m, id(i, j)), b = vget(m, id(i, j + 1)), c = vget(m, id(i + 1, j + 1)), d = vget(m, id(i + 1, j));
      let n = V3.cross(V3.sub(c, a), V3.sub(d, b));
      if (Math.hypot(n[0], n[1], n[2]) < 1e-12) n = V3.cross(V3.sub(b, a), V3.sub(d, a));
      n = V3.norm(n);
      const ctr = V3.mul(V3.add(V3.add(a, b), V3.add(c, d)), 0.25);
      const out = V3.sub(ctr, V3.mul(V3.add(cen[i], cen[i + 1]), 0.5));
      vote += V3.dot(n, out) >= 0 ? 1 : -1;
      fn.push({ n, ctr });
    }
    if (vote < 0) for (const f of fn) f.n = V3.mul(f.n, -1); // consistent winding -> one global orientation
    const FN = (i, j) => fn[i * nc + ((j + nc) % nc)];
    // smooth vertex normals (average adjacent faces), face shading normal = avg of its 4 vertex normals
    const vn = (i, j) => {
      let s = [0, 0, 0];
      for (const [di, dj] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) { const ii = i + di; if (ii < 0 || ii >= nr - 1) continue; s = V3.add(s, FN(ii, j + dj).n); }
      return V3.norm(s);
    };
    const VN = [];
    for (let i = 0; i < nr; i++) { VN.push([]); for (let j = 0; j < nc; j++) VN[i].push(vn(i, j)); }
    const sharp = o.sharp || 0; // 0 = fully smooth, 1 = flat
    for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc; j++) {
      const f = FN(i, j);
      let sn = V3.norm(V3.add(V3.add(VN[i][j], VN[i][(j + 1) % nc]), V3.add(VN[i + 1][(j + 1) % nc], VN[i + 1][j])));
      if (sharp) sn = V3.norm(V3.add(V3.mul(sn, 1 - sharp), V3.mul(f.n, sharp)));
      const mat = o.mat ? o.mat(i, j, f.ctr, f.n) : o.material;
      if (!mat) continue;
      const face = { v: [id(i, j), id(i, j + 1), id(i + 1, j + 1), id(i + 1, j)], n: sn, g: f.n, m: mat, b: o.bias || 0, c: f.ctr, k: o.gi ? o.gi(f.ctr, sn) : 1, cv: mat.camoFn ? mat.camoFn(f.ctr[0], f.ctr[1], f.ctr[2]) : 0 };
      if (o.lines) { const L = o.lines(i, j, f.ctr); if (L && L.length) face.L = L; }
      m.F.push(face);
    }
    const cap = (i, mat, sign, flipN) => {
      const v = []; for (let j = 0; j < nc; j++) v.push(id(i, j));
      const c = cen[i]; const nb = V3.norm(V3.sub(cen[Math.max(0, Math.min(nr - 1, i + sign))], c));
      const n = V3.mul(nb, flipN ? 1 : -1);
      m.F.push({ v: sign > 0 ? v : v.slice().reverse(), n, g: n, m: mat, b: o.bias || 0, c, k: 1, cv: mat.camoFn ? mat.camoFn(c[0], c[1], c[2]) : 0 });
    };
    if (o.capStart) cap(0, o.capStart, 1, o.capStartFlip);
    if (o.capEnd) cap(nr - 1, o.capEnd, -1);
    return m;
  }

  // flat decal polygon (e.g. markings) — pts: [[x,y,z]...], n: outward normal
  function decal(m, pts, n, mt, bias = 0.06) {
    const v = pts.map((p) => addV(m, p));
    const c = V3.mul(pts.reduce((a, p) => V3.add(a, p), [0, 0, 0]), 1 / pts.length);
    m.F.push({ v, n, g: n, m: mt, b: bias, c, k: 1, cv: 0 });
  }
  // ---- lighting rigs (directions in camera space: x right, y up, z toward viewer)
  const RIGS = {
    golden: { L: [-0.72, 0.5, 0.42], Lc: [1.7, 1.24, 0.8], sky: [0.17, 0.21, 0.32], gnd: [0.24, 0.16, 0.1], rimD: [0.75, 0.55], rimC: [1.3, 0.85, 0.42], rim: 1.2, env: 'golden' },
    dawn: { L: [-0.5, 0.55, 0.65], Lc: [1.45, 1.05, 0.92], sky: [0.17, 0.17, 0.3], gnd: [0.22, 0.14, 0.14], rimD: [0.7, 0.6], rimC: [1.3, 0.8, 0.7], rim: 1.2, env: 'dawn' },
    day: { L: [-0.45, 0.75, 0.5], Lc: [1.45, 1.4, 1.3], sky: [0.26, 0.31, 0.42], gnd: [0.24, 0.2, 0.16], rimD: [0.6, 0.7], rimC: [1.0, 1.0, 1.05], rim: 0.7, env: 'day' },
    night: { L: [-0.4, 0.7, 0.55], Lc: [0.5, 0.62, 0.85], sky: [0.07, 0.09, 0.14], gnd: [0.04, 0.04, 0.05], rimD: [0.7, 0.5], rimC: [0.45, 0.95, 0.7], rim: 1.1, env: 'night' },
    back: { L: [0.35, 0.55, -0.5], Lc: [1.3, 0.95, 0.6], sky: [0.2, 0.22, 0.32], gnd: [0.22, 0.16, 0.1], rimD: [0.5, 0.8], rimC: [1.6, 1.05, 0.55], rim: 2.0, env: 'golden' },
    right: { L: [0.72, 0.5, 0.42], Lc: [1.7, 1.24, 0.8], sky: [0.17, 0.21, 0.32], gnd: [0.24, 0.16, 0.1], rimD: [-0.75, 0.55], rimC: [1.3, 0.85, 0.42], rim: 1.2, env: 'golden' },
  };
  A.lightRigs = RIGS;
  const ENV = {
    golden: { hi: [1.0, 0.86, 0.62], mid: [0.62, 0.55, 0.6], top: [0.2, 0.3, 0.5], low: [0.16, 0.12, 0.1] },
    dawn: { hi: [1.0, 0.78, 0.7], mid: [0.55, 0.45, 0.6], top: [0.15, 0.2, 0.38], low: [0.14, 0.1, 0.12] },
    day: { hi: [0.95, 0.95, 0.92], mid: [0.6, 0.72, 0.86], top: [0.25, 0.45, 0.75], low: [0.3, 0.26, 0.2] },
    night: { hi: [0.35, 0.45, 0.6], mid: [0.12, 0.18, 0.26], top: [0.03, 0.05, 0.09], low: [0.02, 0.02, 0.03] },
  };
  function prepRig(rig) {
    if (rig._p) return rig;
    const L = V3.norm(rig.L), Hh = V3.norm([L[0], L[1], L[2] + 1]);
    const rl = Math.hypot(rig.rimD[0], rig.rimD[1]);
    rig._p = { L, Hh, rd: [rig.rimD[0] / rl, rig.rimD[1] / rl], env: ENV[rig.env] || ENV.golden };
    return rig;
  }
  const lin = (c) => Math.pow(c / 255, 2.2);
  function mat(hex, o = {}) { const c = rgb(hex); return Object.assign({ c: [lin(c[0]), lin(c[1]), lin(c[2])], spec: 0.25, shin: 24, kind: 'paint', a: 1 }, o); }
  const toS = (v) => Math.round(255 * Math.pow(clamp(v, 0, 1), 1 / 2.2));
  function shadeFace(N, mt, rig, gk = 1, alb) {
    const P = rig._p;
    if (mt.kind === 'emit') return mt.c.map((v) => toS(v));
    const C = alb || mt.c;
    const nx = N[0], ny = N[1], nz = N[2];
    const ndl = nx * P.L[0] + ny * P.L[1] + nz * P.L[2];
    const dif = Math.max(0, (ndl + 0.08) / 1.08);
    const hk = ny * 0.5 + 0.5;
    const amb = [lerp(rig.gnd[0], rig.sky[0], hk), lerp(rig.gnd[1], rig.sky[1], hk), lerp(rig.gnd[2], rig.sky[2], hk)];
    const ndh = Math.max(0, nx * P.Hh[0] + ny * P.Hh[1] + nz * P.Hh[2]);
    const sp = Math.pow(ndh, mt.shin) * mt.spec;
    const fres = Math.pow(1 - Math.max(0, nz), 3);
    const rimK = fres * Math.max(0, nx * P.rd[0] + ny * P.rd[1] + 0.25) * rig.rim * (mt.rim != null ? mt.rim : 1);
    const out = [0, 0, 0];
    for (let k = 0; k < 3; k++) out[k] = C[k] * (rig.Lc[k] * dif * gk + amb[k] * gk * gk) + sp * rig.Lc[k] * gk + rimK * rig.rimC[k] * 0.5;
    if (mt.kind === 'glass' || mt.kind === 'metal') {
      // environment reflection: reflect view vector about the normal
      const ry = 2 * nz * ny; // r = 2(n.v)n - v, v=(0,0,1)
      const E = P.env;
      let env;
      if (ry > 0.35) { const k = clamp((ry - 0.35) / 0.65); env = [lerp(E.mid[0], E.top[0], k), lerp(E.mid[1], E.top[1], k), lerp(E.mid[2], E.top[2], k)]; }
      else if (ry > 0) { const k = ry / 0.35; env = [lerp(E.hi[0], E.mid[0], k), lerp(E.hi[1], E.mid[1], k), lerp(E.hi[2], E.mid[2], k)]; }
      else { const k = clamp(-ry * 3); env = [lerp(E.hi[0] * 0.5, E.low[0], k), lerp(E.hi[1] * 0.5, E.low[1], k), lerp(E.hi[2] * 0.5, E.low[2], k)]; }
      const fr = mt.kind === 'glass' ? 0.25 + 0.75 * Math.pow(1 - Math.max(0, nz), 2) : 0.35;
      for (let k = 0; k < 3; k++) out[k] = lerp(out[k], env[k], fr * (mt.refl != null ? mt.refl : 1)) + sp * 0.6;
    }
    return [toS(out[0]), toS(out[1]), toS(out[2])];
  }

  /**
   * renderMesh(ctx, mesh, {R, scale(px/m), cx, cy, flip, rig, persp(m, 0=ortho), lineW, seam})
   * returns projector info.
   */
  function renderMesh(ctx, mesh, cam) {
    const R = cam.R, sc = cam.scale, cx = cam.cx || 0, cy = cam.cy || 0, flip = cam.flip ? -1 : 1;
    const rig = prepRig(cam.rig || RIGS.golden), persp = cam.persp || 0;
    const V = mesh.V, nv = V.length / 3;
    const P = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      const x = V[i * 3], y = V[i * 3 + 1], z = V[i * 3 + 2];
      const X = R[0] * x + R[1] * y + R[2] * z, Y = R[3] * x + R[4] * y + R[5] * z, Z = R[6] * x + R[7] * y + R[8] * z;
      const k = persp ? persp / Math.max(0.5, persp - Z) : 1;
      P[i * 3] = cx + flip * X * sc * k; P[i * 3 + 1] = cy - Y * sc * k; P[i * 3 + 2] = Z;
    }
    const list = [];
    for (const f of mesh.F) {
      const g = f.g;
      const gz = R[6] * g[0] + R[7] * g[1] + R[8] * g[2];
      if (gz < -0.03) continue;
      let d = 0; for (const i of f.v) d += P[i * 3 + 2];
      list.push([d / f.v.length + f.b, f]);
    }
    list.sort((a, b) => a[0] - b[0]);
    const seam = cam.seam != null ? cam.seam : 0.8, mode = cam.mode || '';
    const lw = cam.lineW || Math.max(0.6, sc * 0.022);
    ctx.lineJoin = 'round';
    for (const [, f] of list) {
      const n = f.n;
      const N = [flip * (R[0] * n[0] + R[1] * n[1] + R[2] * n[2]), R[3] * n[0] + R[4] * n[1] + R[5] * n[2], R[6] * n[0] + R[7] * n[1] + R[8] * n[2]];
      const mt = f.m;
      let c;
      if (mode === 'M') { c = mt.c2 && mt.ratio ? [0, 1, 2].map((q) => Math.round(255 * (1 - f.cv * (1 - mt.ratio[q])))) : [255, 255, 255]; }
      else {
        let alb = null;
        if (mt.c2) alb = mode === 'A' ? mt.c : mode === 'B' ? mt.c2 : [lerp(mt.c[0], mt.c2[0], f.cv), lerp(mt.c[1], mt.c2[1], f.cv), lerp(mt.c[2], mt.c2[2], f.cv)];
        c = shadeFace(N, mt, rig, f.k, alb);
      }
      const col = `rgb(${c[0]},${c[1]},${c[2]})`;
      const v = f.v;
      ctx.beginPath();
      ctx.moveTo(P[v[0] * 3], P[v[0] * 3 + 1]);
      for (let k = 1; k < v.length; k++) ctx.lineTo(P[v[k] * 3], P[v[k] * 3 + 1]);
      ctx.closePath();
      if (mt.a < 1 && mode !== 'M') { ctx.globalAlpha = mt.a; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1; }
      else { ctx.fillStyle = col; ctx.fill(); if (seam > 0) { ctx.strokeStyle = col; ctx.lineWidth = seam; ctx.stroke(); } }
      if (f.L && mode !== 'M') {
        const q = (s, t) => {
          const a = v[0] * 3, b = v[1] * 3, cc = v[2] * 3, dd = v[3] * 3;
          const x0 = lerp(P[a], P[b], t), y0 = lerp(P[a + 1], P[b + 1], t), x1 = lerp(P[dd], P[cc], t), y1 = lerp(P[dd + 1], P[cc + 1], t);
          return [lerp(x0, x1, s), lerp(y0, y1, s)];
        };
        ctx.beginPath();
        for (const L of f.L) { const p0 = q(L[0], L[1]), p1 = q(L[2], L[3]); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
        ctx.strokeStyle = `rgba(${c[0] * 0.45 | 0},${c[1] * 0.45 | 0},${c[2] * 0.5 | 0},0.75)`; ctx.lineWidth = lw; ctx.stroke();
      }
    }
    return { project: (p) => { const X = R[0] * p[0] + R[1] * p[1] + R[2] * p[2], Y = R[3] * p[0] + R[4] * p[1] + R[5] * p[2], Z = R[6] * p[0] + R[7] * p[1] + R[8] * p[2]; const k = persp ? persp / Math.max(0.5, persp - Z) : 1; return [cx + flip * X * sc * k, cy - Y * sc * k, Z]; } };
  }
  A.renderMesh = renderMesh; A.camMatrix = camMatrix; A.loft = loft; A.Mesh = Mesh; A.mat = mat;

  // ======================================================================
  // 5. Jet — F-15-like twin-tail air-superiority fighter (3D model -> sprites)
  //    stations s: meters from the nose tip (0) to the tail (19.4); x = 9.7 - s
  // ======================================================================
  const JET_LEN = 19.4, JET_PX = 500 / JET_LEN; // scale=1 -> 500 px long
  const JC = {
    base: '#8f9ba7', dark: '#5d6976', belly: '#9ea8b2', radome: '#8a949e', metal: '#5f5a57', burnt: '#7a6a5e',
    glass: '#1a2532', intake: '#101418', green: '#0f8a4a', white: '#f2f2ee', missile: '#d9dcd8', frame: '#3e4650',
  };
  function camo(x, y, z) {
    const v = fbm2(x * 0.16 + 3.1, (Math.abs(z) + y * 0.6) * 0.18 + 1.7, 61, 3) + (z < 0 ? 0.03 : 0);
    return smooth(-0.01, 0.03, v);
  }
  function buildJet(lod = 1) {
    const m = Mesh();
    const X = (s) => 9.7 - s;
    const MAT = {}; const gm = (key, hex, o) => MAT[key] || (MAT[key] = mat(hex, o));
    const PAINT = mat(JC.base, { spec: 0.24, shin: 22, camoFn: camo });
    PAINT.c2 = mat(JC.dark).c;
    PAINT.ratio = [0, 1, 2].map((q) => rgb(JC.dark)[q] / rgb(JC.base)[q]); // sRGB multiply ratio for the camo mask
    const BELLY = mat(JC.belly, { spec: 0.22, shin: 20 });
    const paint = (p, under) => (under ? BELLY : PAINT);
    // ---------- fuselage (central body: nose/cockpit tube widening into the engine section)
    const yTop = keys([[0, -0.1], [4.0, 0.56], [6.3, 0.6], [7.5, 0.98], [11, 0.86], [15, 0.62], [18.6, 0.46]]);
    const wS = keys([[4.5, 0.72], [8, 0.66], [12, 0.54], [16, 0.42], [18.6, 0.36]]);
    const yDeck = keys([[9, 0.3], [12, 0.42], [18.6, 0.34]]);
    const hwB = keys([[12.2, 1.95], [16, 1.7], [18.6, 1.36]]);
    const yBot = keys([[9, -0.98], [12, -0.98], [14.5, -0.8], [18.6, -0.55]]);
    const yBel = keys([[9, -0.92], [12, -0.95], [14.5, -0.8], [18.6, -0.56]]);
    const nose = (s) => Math.pow(1 - Math.pow(1 - Math.min(1, s / 4.4), 2.3), 0.62);
    const ANG = [90, 67.5, 45, 28, 12, 0, -30, -60, -90].map((d) => d * Math.PI / 180);
    const cockPt = (s, i) => {
      const r = nose(s), a = 0.76 * r, cy = -0.12 + 0.1 * r;
      const top = s > 6 ? Math.max(yTop(s), cy + 0.66 * r) : cy + 0.66 * r, bot = 0.8 * r;
      const th = ANG[i];
      return [a * Math.cos(th), cy + (th > 0 ? top - cy : bot) * Math.sin(th)];
    };
    const widePt = (s, i) => {
      const yt = yTop(s), w = wS(s), yd = yDeck(s), hw = hwB(s), yb = yBot(s), ybl = yBel(s);
      switch (i) {
        case 0: return [0, yt];
        case 1: return [0.55 * w, yt - 0.2 * (yt - yd)];
        case 2: return [w, lerp(yd, yt, 0.22)];
        case 3: return [w + 0.35 * (hw - w), yd + 0.02];
        case 4: return [hw - 0.12, yd - 0.03];
        case 5: return [hw, yd - 0.32];
        case 6: return [hw, yb + 0.26];
        case 7: return [hw - 0.32, yb];
        default: return [0, ybl];
      }
    };
    const stations = [];
    const push = (a, b, st) => { for (let s = a; s < b - 1e-6; s += st) stations.push(s); };
    stations.push(0.0, 0.03, 0.09);
    const fs = lod >= 1.5 ? 0.2 / lod : 0.3 / lod; // live LODs use coarser stations
    push(0.18, 4.6, fs * 0.8);
    push(4.6, 18.6, fs);
    stations.push(18.6);
    const rings = [];
    const SUB = Math.max(2, lod >= 1.5 ? Math.round(4 * lod) : Math.round(3 * lod));
    const ringParam = [];
    for (const s of stations) {
      const kb = smooth(9.0, 12.2, s);
      const half = [];
      for (let i = 0; i < 9; i++) { const a = cockPt(Math.min(s, 9), i), b = widePt(Math.max(s, 9), i); half.push([lerp(a[0], b[0], kb), lerp(a[1], b[1], kb)]); }
      if (s > 6) half[0][1] = lerp(half[0][1], yTop(s), 1); // spine follows the dorsal line
      const loop = [];
      for (let i = 0; i < 9; i++) loop.push([0, half[i][1], half[i][0]]);
      for (let i = 7; i >= 1; i--) loop.push([0, half[i][1], -half[i][0]]);
      rings.push(crLoop(loop, SUB).map((p) => [X(s), p[1], p[2]]));
    }
    for (let c = 0; c < 16; c++) for (let k = 0; k < SUB; k++) ringParam.push(c + k / SUB);
    const RL = [2.95, 8.4, 10.7, 13.2, 15.6, 17.4]; // ring panel lines
    const giBody = (c) => {
      const s = 9.7 - c[0];
      let k = lerp(0.55, 1.08, smooth(-1.0, 0.9, c[1]));
      k *= 1 - 0.25 * smooth(1.2, 0, Math.abs(c[2])) * smooth(0.3, -0.6, c[1]) * smooth(4.8, 6, s);
      k *= 1 - 0.28 * smooth(1.4, 1.85, Math.abs(c[2])) * smooth(0.3, -0.1, c[1]) * smooth(8.2, 9.2, s) * smooth(15.5, 14.5, s); // wing shadow
      return k;
    };
    loft(m, rings, { gi: giBody,
      mat: (i, j, c) => {
        const s = stations[i], cp = ringParam[j];
        const side = cp <= 8 ? cp : 16 - cp; // 0 top .. 8 bottom (both sides)
        if (s < 2.95) return gm('radome', JC.radome, { spec: 0.3, shin: 26 });
        return paint(c, side > 5.6);
      },
      lines: (i, j) => {
        const s0 = stations[i], s1 = stations[i + 1], cp = ringParam[j];
        const side = cp <= 8 ? cp : 16 - cp;
        const out = [];
        for (const sl of RL) if (sl >= s0 && sl < s1 && !(sl === 8.4 && side < 1.2)) { const f = (sl - s0) / (s1 - s0); out.push([f, 0, f, 1]); }
        if (s0 > 11.5 && (Math.abs(cp - 5) < 1e-6 || Math.abs(cp - 11) < 1e-6 || Math.abs(cp - 3) < 1e-6 || Math.abs(cp - 13) < 1e-6)) out.push([0, 0, 1, 0]);
        if (s0 >= 8.4 && s1 <= 11.0 && (Math.abs(cp - 1.5) < 1e-6 || Math.abs(cp - 14.5) < 1e-6)) out.push([0, 0, 1, 0]);
        return out;
      },
      capEnd: gm('tailcap', '#2a2724', { spec: 0.1 }),
    });
    // ---------- intakes: raked rectangular boxes beside the cockpit (F-15 signature)
    for (const sd of [1, -1]) {
      const zin = 0.8, zout = 1.93, KI = Math.max(12, Math.round((lod >= 1.5 ? 24 : 16) * lod));
      const iTop = keys([[5.0, 0.3], [9, 0.36], [12.6, 0.4]]), iBot = keys([[5.0, -0.98], [12.6, -0.98]]);
      const sec = (s, inset) => {
        const yt = iTop(s) - inset, yb = iBot(s) + inset, z0 = zin + inset, z1 = zout - inset * (1 + 0) - (s > 12 ? (s - 12) * 0.08 : 0);
        const zc = (z0 + z1) / 2, hz = (z1 - z0) / 2, yc = (yt + yb) / 2, hy = (yt - yb) / 2;
        const out = [];
        for (let k = 0; k < KI; k++) {
          const a = TAU * k / KI, cs = Math.cos(a), sn = Math.sin(a);
          const z = zc + hz * Math.sign(cs) * Math.pow(Math.abs(cs), 0.25), y = yc + hy * Math.sign(sn) * Math.pow(Math.abs(sn), 0.25);
          const rake = (0.58 * (yt - y) / (yt - yb) + 0.22 * (z - z0) / (z1 - z0)) * (1 - smooth(5.0, 8.0, s));
          out.push([X(s + rake + (inset ? 0.16 : 0)), y, sd * z]);
        }
        return out;
      };
      const st = [5.0]; for (let s = 5.12; s < 12.6; s += (lod >= 1.5 ? 0.25 : 0.4) / lod) st.push(s); st.push(12.6);
      const ir = [sec(5.0, 0.11), ...st.map((s) => sec(s, 0))];
      // formation-light strips (luminescent) on the intake side + panel lines
      {
        const zz = sd * (zout + 0.012);
        const strip = (s0, s1, y0, y1) => decal(m, sd > 0 ? [[X(s0), y0, zz], [X(s1), y0, zz], [X(s1), y1, zz], [X(s0), y1, zz]] : [[X(s0), y1, zz], [X(s1), y1, zz], [X(s1), y0, zz], [X(s0), y0, zz]], [0, 0, sd], gm('flight', '#c4d898', { kind: 'emit' }), 0.1);
        strip(6.4, 7.5, -0.12, -0.04);
        strip(11.0, 12.1, -0.12, -0.04);
      }
      loft(m, ir, {
        gi: (c, n) => giBody(c) * (Math.abs(c[2]) < zin + 0.05 && n[2] * sd < -0.5 ? 0.6 : 1),
        mat: (i, j, c) => (i === 0 ? gm('lip', '#59626c', { spec: 0.3, shin: 20 }) : paint(c, c[1] < -0.55)),
        lines: (i, j) => {
          const out = [];
          if (i === 2) out.push([0, 0, 0, 1]);
          const s0 = st[i - 1], s1 = st[i];
          if (s0 != null) for (const sl of [7.0, 8.9, 10.4]) if (sl >= s0 && sl < s1) { const f = (sl - s0) / (s1 - s0); out.push([f, 0, f, 1]); }
          if (i > 1 && (j === Math.round(KI * 0.5) || j === 0)) out.push([0, 0, 1, 0]);
          return out;
        },
        capStart: gm('intake', '#14181d', { spec: 0.05, rim: 0.1 }), capStartFlip: true,
        bias: 0.04, sharp: 0.25,
      });
    }
    // ---------- canopy (bubble) + pilot helmet
    const cTop = keys([[3.45, 0.52], [3.95, 0.98], [4.6, 1.27], [5.4, 1.36], [6.2, 1.32], [7.0, 1.14], [7.7, 0.97]]);
    const cW = keys([[3.45, 0.36], [4.3, 0.5], [5.3, 0.54], [6.6, 0.5], [7.7, 0.44]]);
    const crings = [], cst = [];
    for (let s = 3.5; s <= 7.71; s += (lod >= 1.5 ? 0.12 : 0.2) / lod) cst.push(Math.min(s, 7.7));
    const CA = Math.max(10, Math.round(18 * lod));
    for (const s of cst) {
      const r = [], top = cTop(s), w = cW(s), sill = 0.5;
      for (let k = 0; k <= CA; k++) {
        const a = Math.PI * (k / CA); // 0 right -> PI left
        const cs = Math.cos(a), sn = Math.sin(a);
        r.push([X(s), sill + (top - sill) * Math.pow(sn, 0.75), w * Math.sign(cs) * Math.pow(Math.abs(cs), 0.85)]);
      }
      r.push([X(s), sill - 0.18, -w * 0.8]); r.push([X(s), sill - 0.18, w * 0.8]);
      crings.push(r);
    }
    // helmet (drawn before the canopy glass by depth bias)
    const hel = [];
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI * i / 6, rr = Math.sin(a) * 0.17, xx = X(5.35) + Math.cos(a) * 0.19;
      const ring = []; for (let k = 0; k < 10; k++) { const b = TAU * k / 10; ring.push([xx, 0.98 + Math.sin(b) * rr, Math.cos(b) * rr]); }
      hel.push(ring);
    }
    loft(m, hel, { material: gm('helmet', '#20252b', { spec: 0.2, shin: 30, a: 0.22 }), bias: 2.0 });
    loft(m, crings, {
      mat: (i, j) => {
        const s = cst[i];
        if (j >= CA) return gm('frame', JC.frame, { spec: 0.2 });
        if (Math.abs(s - 4.55) < 0.07 || Math.abs(s - 7.55) < 0.12) return gm('frame', JC.frame, { spec: 0.2 });
        if (j === 0 || j === CA - 1) return gm('frame', JC.frame, { spec: 0.2 });
        return gm('glass', JC.glass, { kind: 'glass', spec: 1.6, shin: 60, rim: 0.4 });
      },
      bias: 0.02,
    });
    // ---------- airfoil surfaces
    const airfoil = (n) => { // closed loop of [xc (0..1 chord), yt (unit thickness)]
      const pts = [];
      for (let k = 0; k <= n; k++) { const xc = 0.5 - 0.5 * Math.cos(Math.PI * k / n); pts.push([xc, 1]); }
      for (let k = n - 1; k >= 1; k--) { const xc = 0.5 - 0.5 * Math.cos(Math.PI * k / n); pts.push([xc, -1]); }
      return pts.map(([xc, sg]) => { const yt = 5 * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1036 * xc ** 4); return [xc, sg * yt]; });
    };
    const AF = airfoil(Math.max(6, Math.round(11 * lod)));
    // surface(planform: function(eta) -> {le, te, pos(xc,thick)->[x,y,z]}, nEta, matFn, linesFn)
    const surface = (nEta, frame, o) => {
      const rings = [], etas = [];
      for (let e = 0; e <= nEta; e++) { const eta = e / nEta; etas.push(eta); rings.push(AF.map(([xc, th]) => frame(eta, xc, th))); }
      loft(m, rings, {
        mat: (i, j, c) => o.mat(etas[i], AF[j][0], AF[j][1] < 0 || (AF[(j + 1) % AF.length][1] < 0 && AF[j][1] <= 0), c),
        lines: o.lines ? (i, j) => o.lines(etas[i], etas[i + 1], AF[j][0], AF[(j + 1) % AF.length][0], AF[j][1] < 0) : null,
        capEnd: o.cap, bias: o.bias || 0, sharp: 0.15, gi: o.gi,
      });
    };
    for (const sd of [1, -1]) {
      // main wing
      surface(Math.max(6, Math.round(14 * lod)), (eta, xc, th) => {
        const le = lerp(8.5, 12.85, eta), te = lerp(15.0, 14.6, eta), z = lerp(1.7, 6.5, eta);
        const chord = te - le, t = lerp(0.065, 0.035, eta) * chord;
        // raked tip: last 4% of span pulls the leading edge back
        const s = lerp(le, te, xc);
        return [X(s), 0.36 - eta * 0.08 + th * t * 0.5 + (th > 0 ? 0.02 : 0), sd * z];
      }, {
        mat: (eta, xc, lower, c) => lower ? gm('wl', JC.belly, { spec: 0.2 }) : paint(c, false),
        lines: (e0, e1, x0, x1, lower) => {
          const out = [];
          // flap / aileron hinge line at 80% chord
          if ((x0 - 0.8) * (x1 - 0.8) <= 0 && x0 !== x1) { const tt = (0.8 - x0) / (x1 - x0); out.push([0, tt, 1, tt]); }
          if (e0 <= 0.55 && e1 > 0.55 && x0 >= 0.8 && x1 >= 0.8) { const f = (0.55 - e0) / (e1 - e0); out.push([f, 0, f, 1]); }
          if (e0 <= 0.25 && e1 > 0.25 && x0 < 0.5 && !lower) { const f = (0.25 - e0) / (e1 - e0); out.push([f, 0, f, 1]); }
          return out;
        },
        cap: gm('wtip', JC.base, { spec: 0.2 }),
        gi: (c, n) => (n[1] < 0 ? 0.72 : 1) * lerp(0.82, 1, smooth(1.7, 3.0, Math.abs(c[2]))),
      });
      // horizontal stabilator
      surface(Math.max(4, Math.round(8 * lod)), (eta, xc, th) => {
        const le = lerp(15.9, 18.25, eta), te = lerp(19.45, 19.45, eta), z = lerp(1.62, 4.3, eta);
        const t = 0.045 * (te - le);
        return [X(lerp(le, te, xc)), 0.08 + th * t * 0.5, sd * z];
      }, { mat: (eta, xc, lower, c) => lower ? gm('wl', JC.belly, { spec: 0.2 }) : paint(c, false), cap: gm('wtip', JC.base, { spec: 0.2 }) });
      // vertical tail
      surface(Math.max(5, Math.round(10 * lod)), (eta, xc, th) => {
        const le = lerp(14.3, 16.95, eta), te = lerp(19.0, 18.5, eta), y = lerp(0.42, 3.12, eta);
        const t = lerp(0.05, 0.035, eta) * (te - le);
        return [X(lerp(le, te, xc)), y, sd * 1.62 + th * t * 0.5 + sd * eta * 0.02];
      }, {
        mat: (eta, xc, lower, c) => {
          return paint([c[0], c[1] * 0.3, c[2]], false);
        },
        lines: (e0, e1, x0, x1) => {
          const out = [];
          if (e1 <= 0.62 && (x0 - 0.74) * (x1 - 0.74) <= 0 && x0 !== x1) { const tt = (0.74 - x0) / (x1 - x0); out.push([0, tt, 1, tt]); }
          return out;
        },
        cap: gm('ttip', JC.dark, { spec: 0.2 }),
      });
      // fin flash decals (generic green band with white borders), both faces of the fin
      {
        // rectangle in (s, y) on the fin plane; left edge follows the leading-edge sweep
        const zf = (y) => sd * 1.62 + sd * ((y - 0.42) / 2.7) * 0.02;
        const leS = (y) => lerp(14.3, 16.95, (y - 0.42) / 2.7);
        const band = (y0, y1, mt) => {
          for (const face of [1, -1]) {
            const zo = face * sd * 0.05;
            const pts = [[X(leS(y0) + 0.45), y0, zf(y0) + zo], [X(18.25), y0, zf(y0) + zo], [X(18.25), y1, zf(y1) + zo], [X(leS(y1) + 0.45), y1, zf(y1) + zo]];
            decal(m, face * sd > 0 ? pts : pts.slice().reverse(), [0, 0, face * sd], mt, 0.08);
          }
        };
        band(2.02, 2.1, gm('fw', JC.white, { spec: 0.3 }));
        band(2.1, 2.46, gm('fg', JC.green, { spec: 0.3 }));
        band(2.46, 2.54, gm('fw', JC.white, { spec: 0.3 }));
      }
      // tail boom
      const brings = [];
      for (let s = 14.0; s <= 19.41; s += 0.6 / lod) {
        const ss = Math.min(s, 19.4), r = [], taper = 1 - smooth(18.6, 19.4, ss) * 0.5;
        for (let k = 0; k < 8; k++) { const a = TAU * k / 8 + Math.PI / 8; r.push([X(ss), 0.2 + Math.sin(a) * 0.3 * taper, sd * 1.62 + Math.cos(a) * 0.2 * taper]); }
        brings.push(r);
      }
      loft(m, brings, { mat: (i, j, c) => paint(c, false), capEnd: gm('tailcap', '#2a2724', { spec: 0.1 }) });
      // engine nozzle
      const nrings = [];
      const NA = Math.max(10, Math.round(18 * lod));
      for (let s = 17.7; s <= 19.16; s += 0.12 / lod) {
        const ss = Math.min(s, 19.15), rr = lerp(0.6, 0.5, smooth(17.7, 19.15, ss)), r = [];
        for (let k = 0; k < NA; k++) { const a = TAU * k / NA; r.push([X(ss), -0.04 + Math.sin(a) * rr, sd * 0.66 + Math.cos(a) * rr]); }
        nrings.push(r);
      }
      loft(m, nrings, {
        mat: (i, j) => (i < 2 ? gm('nzl0', JC.burnt, { kind: 'metal', spec: 0.5, shin: 20, refl: 0.4 }) : gm('nzl', JC.metal, { kind: 'metal', spec: 0.6, shin: 16, refl: 0.5 })),
        lines: (i, j) => (j % 2 === 0 ? [[0, 0, 1, 0]] : null),
        capEnd: gm('nzin', '#1b1612', { spec: 0 }), bias: -0.05,
      });
      // missiles on wing pylons (AIM-9-like) — small details
      const mrings = [];
      for (let s = 10.6; s <= 13.61; s += 0.3 / lod) {
        const ss = Math.min(s, 13.6), rr = 0.07 * (ss < 11 ? Math.sqrt((ss - 10.6) / 0.4) : 1), r = [];
        for (let k = 0; k < 8; k++) { const a = TAU * k / 8; r.push([X(ss), 0.02 + Math.sin(a) * rr, sd * 3.75 + Math.cos(a) * rr]); }
        mrings.push(r);
      }
      loft(m, mrings, { material: gm('msl', JC.missile, { spec: 0.4, shin: 30 }) });
      // pylon
      const py = [];
      for (const s of [11.0, 13.4]) { const r = []; for (const [yy, zz] of [[0.3, -0.05], [0.3, 0.05], [0.08, 0.05], [0.08, -0.05]]) r.push([X(s), yy, sd * 3.75 + zz]); py.push(r); }
      loft(m, py, { material: gm('pyl', JC.base, { spec: 0.2 }) });
    }
    // blade antennas on the spine and under the nose, small and dark
    for (const [s0, y0, hgt] of [[8.0, 0.95, 0.28], [12.5, 0.8, 0.22]]) {
      const pts = [[X(s0), y0, 0], [X(s0 + 0.5), y0 - 0.02, 0], [X(s0 + 0.42), y0 + hgt, 0], [X(s0 + 0.28), y0 + hgt, 0]];
      decal(m, pts, [0, 0, 1], gm('ant', '#3a4048', { spec: 0.2 }), 0.02);
      decal(m, pts.slice().reverse(), [0, 0, -1], gm('ant', '#3a4048', { spec: 0.2 }), 0.02);
    }
    // nozzle exit metadata (model space)
    m.nozzles = [1, -1].map((sd) => ({ p: [X(19.15), -0.04, sd * 0.66], axis: [-1, 0, 0], r: 0.5 }));
    m.MAT = MAT;
    return m;
  }

  // view presets: yaw, pitch(nose up), roll, camera elevation (radians)
  const D2R = Math.PI / 180;
  const JET_VIEWS = {
    side: { yaw: -10 * D2R, pitch: 0, roll: 0, elev: 1.5 * D2R },
    top: { top: true },
    front34: { yaw: -38 * D2R, pitch: 0, roll: 0, elev: 14 * D2R },
    rear34: { yaw: 36 * D2R, pitch: 0, roll: 0, elev: 16 * D2R },
  };
  function viewMatrix(v) {
    if (v.top) return [0, 0, 1, 1, 0, 0, 0, 1, 0]; // screen x = Z (right wing), screen y = X (nose up), depth = Y (up)
    return camMatrix(v.yaw, v.pitch, v.roll, v.elev);
  }
  const _meshes = {};
  function jetMesh(lod) { return _meshes['jet' + lod] || (_meshes['jet' + lod] = buildJet(lod)); }
  const SPRITE_PXM = 128;
  /**
   * renderMeshCanvas(mesh, R, pxm, {flip, rig, lod, outline, key}) -> {c, ax, ay, w, h} (ax/ay/w/h in meters)
   * Three passes (base albedo, dark albedo, camo mask) blended per pixel through a blurred mask,
   * so two-tone camo has smooth edges at any size. `key` => reuse scratch canvases (live path).
   */
  function renderMeshCanvas(mesh, R, sc, o = {}) {
    const flip = !!o.flip, rig = o.rig || RIGS.golden;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const V = mesh.V;
    for (let i = 0; i < V.length; i += 3) {
      const X = (R[0] * V[i] + R[1] * V[i + 1] + R[2] * V[i + 2]) * (flip ? -1 : 1), Y = -(R[3] * V[i] + R[4] * V[i + 1] + R[5] * V[i + 2]);
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
    }
    const pad = 4;
    const w = Math.ceil((x1 - x0) * sc + pad * 2), h = Math.ceil((y1 - y0) * sc + pad * 2);
    const ax = -x0 * sc + pad, ay = -y0 * sc + pad;
    const mk = (n) => (o.key ? scratch(o.key + n, w, h) : canvas(w, h));
    const cA = mk('A'), cM = mk('M'), cO = mk('O');
    const lw = Math.max(0.7, sc * 0.016);
    const pr = renderMesh(cA.getContext('2d'), mesh, { R, scale: sc, cx: ax, cy: ay, flip, rig, lineW: lw, mode: 'A' });
    // camo mask pass: per-face multiply colour (white = base paint, darker = dark-grey patches), then blurred
    const gM = cM.getContext('2d');
    gM.fillStyle = '#fff'; gM.fillRect(0, 0, w, h);
    renderMesh(gM, mesh, { R, scale: sc, cx: ax, cy: ay, flip, rig, mode: 'M', seam: 0 });
    const gO = cO.getContext('2d');
    gO.filter = `blur(${Math.max(1.5, sc * 0.12).toFixed(1)}px)`; gO.drawImage(cM, 0, 0); gO.filter = 'none';
    gO.globalCompositeOperation = 'destination-in'; gO.drawImage(cA, 0, 0); gO.globalCompositeOperation = 'source-over';
    const gA = cA.getContext('2d');
    gA.save(); gA.globalCompositeOperation = 'multiply'; gA.drawImage(cO, 0, 0); gA.restore();
    // screen-space rim light: edge band on the side facing the rim light (rig.rimD), added on top
    {
      const rp = Math.max(1.2, sc * 0.035), rd = rig.rimD, rl = Math.hypot(rd[0], rd[1]) || 1;
      const dx = rd[0] / rl * rp, dy = -rd[1] / rl * rp;
      gO.setTransform(1, 0, 0, 1, 0, 0); gO.globalCompositeOperation = 'source-over'; gO.clearRect(0, 0, w, h);
      gO.drawImage(cA, 0, 0);
      gO.globalCompositeOperation = 'destination-out'; gO.drawImage(cA, -dx, -dy);
      gO.globalCompositeOperation = 'source-in';
      const rc = rig.rimC; gO.fillStyle = `rgb(${Math.min(255, rc[0] * 200) | 0},${Math.min(255, rc[1] * 200) | 0},${Math.min(255, rc[2] * 200) | 0})`; gO.fillRect(0, 0, w, h);
      gA.save(); gA.globalCompositeOperation = 'lighter'; gA.globalAlpha = Math.min(1, 0.45 * rig.rim); gA.drawImage(cO, 0, 0); gA.restore();
    }
    // crisp dark outline (slightly cartoon finish)
    gO.setTransform(1, 0, 0, 1, 0, 0); gO.globalCompositeOperation = 'source-over'; gO.clearRect(0, 0, w, h);
    const d = Math.max(1, sc * 0.014);
    for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-d * 0.7, -d * 0.7], [d * 0.7, d * 0.7], [-d * 0.7, d * 0.7], [d * 0.7, -d * 0.7]]) gO.drawImage(cA, dx, dy);
    gO.globalCompositeOperation = 'source-in'; gO.fillStyle = 'rgba(16,18,24,0.8)'; gO.fillRect(0, 0, w, h);
    gO.globalCompositeOperation = 'source-over'; gO.drawImage(cA, 0, 0);
    return { c: cO, ax: ax / sc, ay: ay / sc, w: w / sc, h: h / sc, pr, pw: w, ph: h };
  }
  function nozzleMeta(mesh, R, flip) {
    const P = (p) => { const X = R[0] * p[0] + R[1] * p[1] + R[2] * p[2], Y = R[3] * p[0] + R[4] * p[1] + R[5] * p[2], Z = R[6] * p[0] + R[7] * p[1] + R[8] * p[2]; return [(flip ? -1 : 1) * X, -Y, Z]; };
    return mesh.nozzles.map((nz) => { const p = P(nz.p), q = P(V3.add(nz.p, nz.axis)); return { x: p[0], y: p[1], ax: q[0] - p[0], ay: q[1] - p[1], az: q[2] - p[2], r: nz.r }; });
  }
  const _jetSpr = {};
  function jetSprite(view, flip, light) {
    const key = view + '|' + (flip ? 1 : 0) + '|' + light;
    if (_jetSpr[key]) return _jetSpr[key];
    const mesh = jetMesh(1.6);
    const R = viewMatrix(JET_VIEWS[view] || JET_VIEWS.side);
    const r = renderMeshCanvas(mesh, R, SPRITE_PXM, { flip, rig: RIGS[light] || RIGS.golden });
    const mips = [{ c: r.c, s: SPRITE_PXM }];
    let prev = r.c, ps = SPRITE_PXM;
    while (ps > 10) {
      const nw = Math.ceil(prev.width / 2), nh = Math.ceil(prev.height / 2);
      const q = canvas(nw, nh), qg = q.getContext('2d'); qg.imageSmoothingQuality = 'high';
      qg.drawImage(prev, 0, 0, nw, nh); ps /= 2; mips.push({ c: q, s: ps }); prev = q;
    }
    return (_jetSpr[key] = { mips, ax: r.ax, ay: r.ay, w: r.w, h: r.h, noz: nozzleMeta(mesh, R, flip) });
  }
  // afterburner flame (local to the jet sprite space); additive soft plume built from glow sprites
  function afterburner(ctx, nz, k, t, sc, seed) {
    if (k <= 0.01) return;
    const len = Math.hypot(nz.ax, nz.ay); // projected length of a 1 m axis (0..1)
    const ang = Math.atan2(nz.ay, nz.ax);
    const fl = 0.88 + 0.12 * noise1(t * 24, seed) + 0.06 * Math.sin(t * 77 + seed * 3);
    const L = (3.6 + 3.0 * k) * fl;             // flame length (m)
    const rp = nz.r * sc, Lp = L * len * sc;
    const facing = clamp(nz.az);                // nozzle pointing at the camera -> hot disc visible
    ctx.save();
    ctx.translate(nz.x * sc, nz.y * sc);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, rp * (3 + 2 * k), '#ff8a30', 0.35 * k);
    ctx.rotate(ang);
    // plume: layered soft capsules (feathered edges), orange -> transparent along the axis
    if (Lp > 3) {
      const layers = [[1.3, 0.16, '255,120,40'], [1.0, 0.24, '255,150,60'], [0.72, 0.34, '255,190,100'], [0.45, 0.5, '255,236,190']];
      for (const [wk, ak, c] of layers) {
        const L2 = Lp * (wk > 0.9 ? 1 : 0.55 + 0.45 * wk), w0 = rp * wk, w1 = rp * wk * 0.55;
        const g = ctx.createLinearGradient(0, 0, L2, 0);
        g.addColorStop(0, `rgba(${c},${ak * k})`); g.addColorStop(0.55, `rgba(${c},${ak * k * 0.55})`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, -w0); ctx.bezierCurveTo(L2 * 0.4, -w0 * 1.02, L2 * 0.8, -w1, L2, 0); ctx.bezierCurveTo(L2 * 0.8, w1, L2 * 0.4, w0 * 1.02, 0, w0); ctx.closePath(); ctx.fill();
      }
      // short white-hot core
      const Lc = Math.min(Lp * 0.3, rp * 3.2 * Math.max(0.3, len));
      const gc = ctx.createLinearGradient(0, 0, Lc, 0);
      gc.addColorStop(0, `rgba(255,255,250,${0.95 * k})`); gc.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = gc; ctx.beginPath(); ctx.moveTo(0, -rp * 0.55); ctx.quadraticCurveTo(Lc * 0.5, -rp * 0.45, Lc, 0); ctx.quadraticCurveTo(Lc * 0.5, rp * 0.45, 0, rp * 0.55); ctx.closePath(); ctx.fill();
      // shock diamonds
      for (let i = 1; i <= 4; i++) {
        const xx = Lp * (0.08 + i * 0.12) * fl;
        ctx.save(); ctx.translate(xx, 0); ctx.scale(1.7, 0.7);
        glow(ctx, 0, 0, rp * 0.6, '#fff4dc', k * (1 - i / 5) * 0.85);
        ctx.restore();
      }
    }
    // hot exit disc when the nozzle faces the camera
    if (facing > 0.05) {
      ctx.save(); ctx.scale(Math.max(0.2, 1 - facing * 0.8), 1);
      ctx.fillStyle = radial(ctx, 0, 0, rp, [[0, `rgba(255,252,240,${k})`], [0.55, `rgba(255,200,110,${0.85 * k})`], [1, 'rgba(255,100,30,0)']]);
      ctx.beginPath(); ctx.arc(0, 0, rp, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  /**
   * jet(ctx, {x, y, scale, rot, view:'side'|'top'|'front34'|'rear34', afterburner, t, flip, light, alpha})
   * Anchor: aircraft center (mid-length on the fuselage axis). scale=1 -> 500 px long.
   */
  function jet(ctx, o = {}) {
    const view = JET_VIEWS[o.view] ? o.view : 'side', flip = !!o.flip, light = RIGS[o.light] ? o.light : 'golden';
    const sc = (o.scale != null ? o.scale : 1) * JET_PX; // px per meter
    const ab = o.afterburner || 0, t = o.t || 0;
    ctx.save();
    ctx.translate(o.x || 0, o.y || 0);
    if (o.rot) ctx.rotate(o.rot);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    const tr = ctx.getTransform(); const devScale = Math.hypot(tr.a, tr.b) * sc;
    const S = jetSprite(view, flip, light);
    if (ab > 0) for (const nz of S.noz) if (nz.az < -0.02) afterburner(ctx, nz, ab, t, sc, 3 + (nz.x > 0 ? 1 : 0));
    if (devScale > SPRITE_PXM * 1.15) {
      // very large on screen: render the mesh live at device resolution (smooth camo, crisp lines)
      const pxm = Math.min(devScale, 240);
      const r = renderMeshCanvas(jetMesh(1.4), viewMatrix(JET_VIEWS[view]), pxm, { flip, rig: RIGS[light], key: 'jetLive' });
      ctx.drawImage(r.c, 0, 0, r.pw, r.ph, -r.ax * sc, -r.ay * sc, r.w * sc, r.h * sc);
    } else {
      let mp = S.mips[0];
      for (const q of S.mips) if (q.s >= devScale * 0.9) mp = q;
      ctx.drawImage(mp.c, -S.ax * sc, -S.ay * sc, S.w * sc, S.h * sc);
    }
    if (ab > 0) for (const nz of S.noz) if (nz.az >= -0.02) afterburner(ctx, nz, ab, t, sc, 3 + (nz.x > 0 ? 1 : 0));
    ctx.restore();
  }
  A.jet = jet;
  A.jetSprite = jetSprite;
  /**
   * jet3d(ctx, {x, y, scale, yaw, pitch, roll, elev, flip, light, afterburner, t, lod, persp, hq})
   * Live-rendered jet at any attitude. Same anchor/scale as jet(). hq:true = smooth camo (3 passes, slower).
   */
  function jet3d(ctx, o = {}) {
    const sc = (o.scale != null ? o.scale : 1) * JET_PX;
    const R = camMatrix(o.yaw || 0, o.pitch || 0, o.roll || 0, o.elev != null ? o.elev : 10 * D2R);
    const tr0 = ctx.getTransform(), pxm0 = Math.hypot(tr0.a, tr0.b) * sc;
    const lod = o.lod || (o.hq ? 1.0 : pxm0 < 20 ? 0.5 : pxm0 < 45 ? 0.7 : 1.0);
    const mesh = jetMesh(lod);
    const flip = !!o.flip, ab = o.afterburner || 0, t = o.t || 0, rig = RIGS[o.light] || RIGS.golden;
    ctx.save();
    ctx.translate(o.x || 0, o.y || 0);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    const noz = nozzleMeta(mesh, R, flip);
    if (ab > 0) for (const nz of noz) if (nz.az < -0.02) afterburner(ctx, nz, ab, t, sc, 3 + (nz.x > 0 ? 1 : 0));
    if (o.hq) {
      const tr = ctx.getTransform(); const pxm = Math.min(240, Math.hypot(tr.a, tr.b) * sc);
      const r = renderMeshCanvas(mesh, R, pxm, { flip, rig, key: 'jet3d' });
      ctx.drawImage(r.c, 0, 0, r.pw, r.ph, -r.ax * sc, -r.ay * sc, r.w * sc, r.h * sc);
    } else {
      renderMesh(ctx, mesh, { R, scale: sc, cx: 0, cy: 0, flip, rig, persp: o.persp || 0, lineW: Math.max(0.6, sc * 0.016) });
    }
    if (ab > 0) for (const nz of noz) if (nz.az >= -0.02) afterburner(ctx, nz, ab, t, sc, 3 + (nz.x > 0 ? 1 : 0));
    ctx.restore();
  }
  A.jet3d = jet3d;
  A._jetMesh = jetMesh; A._renderMeshCanvas = renderMeshCanvas;

  // ======================================================================
  // 6. Saudi flag — green #006C35, Shahada (Amiri, white), sword: hilt RIGHT, tip LEFT
  // ======================================================================
  const FLAG_GREEN = '#006C35';
  const SHAHADA = 'لا إله إلا الله محمد رسول الله';
  let _flagTex = null;
  function drawSword(g, TW, TH) {
    // geometry in texture px; blade tip on the LEFT, hilt on the RIGHT
    const yc = TH * 0.705;                 // blade centre line
    const xTip = TW * 0.17, xGuard = TW * 0.705, bh = TH * 0.05;
    g.fillStyle = '#ffffff';
    // blade: straight back (top), edge (bottom) sweeping up to the point at the tip
    g.beginPath();
    g.moveTo(xGuard, yc - bh * 0.5);
    g.lineTo(xTip + TW * 0.05, yc - bh * 0.5);
    g.quadraticCurveTo(xTip + TW * 0.012, yc - bh * 0.5, xTip, yc - bh * 0.95); // slight upturned point
    g.quadraticCurveTo(xTip + TW * 0.03, yc + bh * 0.5, xTip + TW * 0.09, yc + bh * 0.5);
    g.lineTo(xGuard, yc + bh * 0.5);
    g.closePath(); g.fill();
    // crossguard (short vertical bar with rounded ends)
    const gw = TW * 0.014, gh = TH * 0.135;
    g.beginPath(); g.roundRect(xGuard, yc - gh / 2, gw, gh, gw / 2); g.fill();
    // grip
    const x0 = xGuard + gw, gx1 = TW * 0.795, gh2 = bh * 0.78;
    g.beginPath(); g.roundRect(x0 - 2, yc - gh2 / 2, gx1 - x0 + 2, gh2, gh2 * 0.3); g.fill();
    // pommel: curving down at the right end
    g.beginPath();
    g.moveTo(gx1 - 4, yc - gh2 / 2);
    g.quadraticCurveTo(TW * 0.83, yc - gh2 * 0.55, TW * 0.838, yc + TH * 0.045);
    g.quadraticCurveTo(TW * 0.84, yc + TH * 0.07, TW * 0.825, yc + TH * 0.075);
    g.quadraticCurveTo(TW * 0.818, yc + TH * 0.05, TW * 0.81, yc + gh2 * 0.6);
    g.lineTo(gx1 - 4, yc + gh2 / 2);
    g.closePath(); g.fill();
    // small grip rings (green detail lines)
    g.strokeStyle = FLAG_GREEN; g.lineWidth = TW * 0.0025;
    for (const f of [0.3, 0.55, 0.8]) { const xx = lerp(x0, gx1, f); g.beginPath(); g.moveTo(xx, yc - gh2 / 2 + 3); g.lineTo(xx, yc + gh2 / 2 - 3); g.stroke(); }
  }
  function flagTexture() {
    if (_flagTex) return _flagTex;
    const TW = 2400, TH = 1600;
    const c = canvas(TW, TH), g = c.getContext('2d');
    g.fillStyle = FLAG_GREEN; g.fillRect(0, 0, TW, TH);
    // subtle fabric weave
    const R = rng(77);
    g.globalAlpha = 0.05;
    for (let i = 0; i < 2600; i++) { g.fillStyle = R() < 0.5 ? '#000' : '#fff'; g.fillRect(R() * TW, R() * TH, 1 + R() * 40, 1); }
    g.globalAlpha = 1;
    // Shahada — Amiri, white, fitted to ~80% of the width
    const target = TW * 0.8;
    let size = 300;
    const wdt = M.measure(g, SHAHADA, { size, family: 'naskh', weight: 700 });
    size = size * target / wdt;
    M.text(g, SHAHADA, TW / 2, TH * 0.36, { size, family: 'naskh', weight: 700, color: '#ffffff' });
    drawSword(g, TW, TH);
    _flagTex = c;
    return c;
  }
  const _flagMips = {};
  function flagTexFor(px) {
    const base = flagTexture();
    const sizes = [2400, 1600, 1200, 800, 560, 400, 280];
    let s = 2400; for (const z of sizes) if (z >= px * 1.05) s = z;
    if (s === 2400) return base;
    if (!_flagMips[s]) { const c = canvas(s, s * 2 / 3), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(base, 0, 0, c.width, c.height); _flagMips[s] = c; }
    return _flagMips[s];
  }
  /** flagFlat(ctx, x, y, w, h) — the flat, un-waved flag (top-left anchor). */
  function flagFlat(ctx, x, y, w, h) { ctx.drawImage(flagTexture(), x, y, w, h || w * 2 / 3); }
  /**
   * flag(ctx, t, {x, y, w, h, pole, poleLen, light, wind, alpha})
   * Anchor (x, y) = top-left corner of the cloth at the hoist (pole side, left). Flag flies to the right.
   * pole: true -> metallic pole with gold finial on the left (length poleLen, default 2.2*h).
   * light: 0..1 strength of the cloth light/shadow bands (default 1). wind: wave speed/amplitude (default 1).
   */
  function flag(ctx, t, o = {}) {
    const x = o.x || 0, y = o.y || 0, w = o.w || 600, h = o.h || w * 2 / 3;
    const light = o.light != null ? o.light : 1, wind = o.wind != null ? o.wind : 1;
    const tr0 = ctx.getTransform(), devK = Math.hypot(tr0.a, tr0.b);
    const tex = flagTexFor(w * devK);
    const amp = h * 0.075 * Math.min(1.6, wind);
    const ph = (u) => TAU * (u * 1.35 - t * 0.85 * (0.6 + 0.4 * wind));
    const dyf = (u) => { const e = Math.pow(u, 1.05); return amp * e * Math.sin(ph(u)) + amp * 0.32 * e * Math.sin(2.1 * ph(u) + 1.3) + amp * 0.18 * e * Math.sin(TAU * (u * 3.1 - t * 1.7 * wind) + 0.5) + h * 0.02 * u * u; };
    const sy = (u) => 1 + 0.045 * Math.pow(u, 0.9) * Math.cos(ph(u) + 0.4);
    const xf = (u) => w * u * (1 - 0.035 * u) + Math.sin(ph(u)) * w * 0.006 * u;
    const mY = amp * 1.6 + h * 0.08;
    const cw = Math.ceil(w + 8), ch = Math.ceil(h + mY * 2);
    const tmp = scratch('flag', cw, ch), g = tmp.getContext('2d');
    g.imageSmoothingQuality = 'low';
    const strips = Math.max(40, Math.min(560, Math.round(w * devK / 2.0)));
    for (let i = 0; i < strips; i++) {
      const u0 = i / strips, u1 = (i + 1) / strips, um = (u0 + u1) / 2;
      const X0 = xf(u0), X1 = xf(u1);
      const s = sy(um), hh = h * s;
      const yy = mY + dyf(um) - (hh - h) / 2;
      g.drawImage(tex, u0 * tex.width, 0, (u1 - u0) * tex.width + 0.5, tex.height, X0, yy, X1 - X0 + 0.9, hh);
    }
    // smooth the stair-stepped strip edges with an exact outline clip
    g.globalCompositeOperation = 'destination-in';
    g.beginPath();
    const NE = 90;
    for (let i = 0; i <= NE; i++) { const u = i / NE, hh = h * sy(u); const yy = mY + dyf(u) - (hh - h) / 2 + 0.35; i ? g.lineTo(xf(u), yy) : g.moveTo(xf(u), yy); }
    for (let i = NE; i >= 0; i--) { const u = i / NE, hh = h * sy(u); const yy = mY + dyf(u) - (hh - h) / 2 + hh - 0.35; g.lineTo(xf(u) + (i === NE ? 0.9 : 0), yy); }
    g.closePath(); g.fillStyle = '#000'; g.fill();
    g.globalCompositeOperation = 'source-over';
    // cloth shading: light/shadow bands from the wave slope
    if (light > 0) {
      const gr = g.createLinearGradient(0, 0, xf(1), 0);
      const N = 40;
      for (let i = 0; i <= N; i++) {
        const u = i / N, du = 0.01;
        const sl = (dyf(Math.min(1, u + du)) - dyf(Math.max(0, u - du))) / (2 * du * w); // slope
        const v = clamp(-sl * 6, -1, 1) * light; // +: facing the light (upper-left)
        gr.addColorStop(u, v >= 0 ? `rgba(255,232,170,${0.2 * v})` : `rgba(0,14,6,${-0.55 * v})`);
      }
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
      // gentle top-light & a darker lower edge
      const vg = g.createLinearGradient(0, mY - amp, 0, mY + h + amp);
      vg.addColorStop(0, `rgba(255,240,210,${0.12 * light})`); vg.addColorStop(0.6, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.22 * light})`);
      g.fillStyle = vg; g.fillRect(0, 0, cw, ch);
      g.globalCompositeOperation = 'source-over';
    }
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    // pole
    if (o.pole !== false && o.pole != null) {
      const pr = Math.max(3, h * 0.026), len = o.poleLen || h * 2.2;
      const px = x - pr * 0.7;
      const pg = ctx.createLinearGradient(px - pr, 0, px + pr, 0);
      pg.addColorStop(0, '#3c4046'); pg.addColorStop(0.28, '#d9dde2'); pg.addColorStop(0.4, '#ffffff'); pg.addColorStop(0.6, '#9aa2ac'); pg.addColorStop(1, '#2c3036');
      ctx.fillStyle = pg; ctx.fillRect(px - pr, y - pr * 2, pr * 2, len + pr * 2);
      // gold collar + ball finial + spear tip
      const gg = (x0, x1) => { const g2 = ctx.createLinearGradient(x0, 0, x1, 0); g2.addColorStop(0, '#6a4a14'); g2.addColorStop(0.35, '#ffe9a8'); g2.addColorStop(0.6, '#d4a648'); g2.addColorStop(1, '#5a3c10'); return g2; };
      ctx.fillStyle = gg(px - pr * 1.3, px + pr * 1.3); ctx.fillRect(px - pr * 1.3, y - pr * 2.4, pr * 2.6, pr * 1.1);
      const fy = y - pr * 4;
      ctx.fillStyle = radial(ctx, px - pr * 0.7, fy - pr * 0.7, pr * 2.6, [[0, '#fff6d0'], [0.35, '#f0c862'], [0.8, '#8a6020'], [1, '#4a3008']]);
      ctx.beginPath(); ctx.arc(px, fy, pr * 1.75, 0, TAU); ctx.fill();
      ctx.fillStyle = gg(px - pr, px + pr);
      ctx.beginPath(); ctx.moveTo(px - pr * 0.8, fy - pr * 1.4); ctx.quadraticCurveTo(px - pr * 0.5, fy - pr * 3, px, fy - pr * 5); ctx.quadraticCurveTo(px + pr * 0.5, fy - pr * 3, px + pr * 0.8, fy - pr * 1.4); ctx.closePath(); ctx.fill();
    }
    // soft shadow of the cloth (depth)
    ctx.drawImage(tmp, 0, 0, cw, ch, x, y - mY, cw, ch);
    ctx.restore();
  }
  A.flag = flag; A.flagFlat = flagFlat; A.flagTexture = flagTexture; A.FLAG_GREEN = FLAG_GREEN;

  // ======================================================================
  // 7. Tank — Abrams-like MBT, side view (2.5D), desert tan. Facing right; anchor = ground centre.
  //    scale=1 -> hull 7.9 m = 474 px (60 px/m); gun adds ~3.6 m forward.
  // ======================================================================
  const TANK_PX = 60;
  const TC = { hi: '#f6e2b4', light: '#d9bd8a', base: '#b8975f', mid: '#8f7146', dark: '#5e4628', deep: '#33261a', rubber: '#24201c', steel: '#77726a', rim: '#ffe2a8', line: '#2e2416' };
  const TANK_WHEELS = [-2.72, -1.82, -0.92, -0.02, 0.88, 1.78, 2.68];
  function tankGeom(o) {
    const elev = o.turret || 0, rec = clamp(o.recoil || 0);
    const pivot = [1.78, 1.98];
    const rock = -rec * 0.035;
    return { elev, rec, pivot, rock, barrelBack: rec * 0.6 * Math.max(0, 1 - rec * 0.2) };
  }
  /** tankMuzzle({x, y, scale, flip, turret, recoil}) -> {x, y, angle} muzzle tip in screen px & firing angle */
  function tankMuzzle(o) {
    const K = (o.scale != null ? o.scale : 1) * TANK_PX, f = o.flip ? -1 : 1;
    const G = tankGeom(o);
    const L = 4.75 - G.barrelBack;
    let mx = G.pivot[0] + Math.cos(G.elev) * L, my = G.pivot[1] + Math.sin(G.elev) * L;
    // apply hull rock around the rear contact point (-3.9, 0)
    const cr = Math.cos(G.rock), sr = Math.sin(G.rock);
    const rx = mx + 3.9, ry = my;
    mx = -3.9 + rx * cr - ry * sr; my = rx * sr + ry * cr;
    return { x: (o.x || 0) + f * mx * K, y: (o.y || 0) - my * K, angle: f > 0 ? -(G.elev + G.rock) : Math.PI + (G.elev + G.rock) };
  }
  function tank(ctx0, o = {}) {
    const K = (o.scale != null ? o.scale : 1) * TANK_PX;
    const t = o.t || 0, speed = o.speed != null ? o.speed : 4;
    const dist = t * speed;
    const G = tankGeom(o);
    const fl = o.flip ? -1 : 1;
    if (o.dust) {
      // dust kicked up behind the tracks (drawn behind the tank)
      dustPlume(ctx0, t, { x: (o.x || 0) - fl * 3.6 * K, y: (o.y || 0) - 0.25 * K, scale: K / 60 * o.dust, seed: o.seed || 1, dir: -fl, rate: 1, color: '#e6cc9c', alpha: 0.85 });
    }
    // ground contact shadow (directly on the target)
    ctx0.save(); ctx0.translate(o.x || 0, o.y || 0); ctx0.scale(K * 4.8, K * 0.36);
    ctx0.fillStyle = radial(ctx0, 0, 0, 1, [[0, 'rgba(24,14,6,0.6)'], [0.65, 'rgba(24,14,6,0.32)'], [1, 'rgba(24,14,6,0)']]);
    ctx0.beginPath(); ctx0.arc(0, 0, 1, 0, TAU); ctx0.fill(); ctx0.restore();
    // body is drawn into a device-resolution scratch canvas (meters, y up = negative), then rim-lit and composited
    const tr0 = ctx0.getTransform(), dev = Math.max(4, Math.hypot(tr0.a, tr0.b) * K);
    const BX0 = -4.5, BY0 = -4.3, BW = 12.0, BH = 4.8, pad = 3;
    const pw = Math.ceil(BW * dev) + pad * 2, ph = Math.ceil(BH * dev) + pad * 2;
    const cv = scratch('tankBody', pw, ph), ctx = cv.getContext('2d');
    ctx.setTransform(dev, 0, 0, dev, -BX0 * dev + pad, -BY0 * dev + pad);
    ctx.save();
    ctx.lineJoin = 'round';
    const P = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], -pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], -pts[i][1]); ctx.closePath(); };
    const vgrad = (y0, y1, c0, c1, c2) => { const g = ctx.createLinearGradient(0, -y1, 0, -y0); g.addColorStop(0, c0); if (c2) { g.addColorStop(0.55, c1); g.addColorStop(1, c2); } else g.addColorStop(1, c1); return g; };
    const outline = (w = 0.025) => { ctx.strokeStyle = TC.line; ctx.lineWidth = w; ctx.stroke(); };
    // hull rock (recoil) around the rear contact point + slight suspension bob
    const bob = speed ? Math.sin(t * 9.0) * 0.012 + Math.sin(t * 3.1) * 0.01 : 0;
    ctx.translate(-3.9, -bob); ctx.rotate(-G.rock); ctx.translate(3.9, 0);
    // ---- running gear
    const wy = 0.44, wr = 0.34;
    const spr = [-3.56, 0.74, 0.38], idl = [3.42, 0.68, 0.34];
    // lower hull behind the wheels
    P([[-3.85, 0.62], [3.7, 0.62], [3.95, 1.2], [-3.9, 1.25]]); ctx.fillStyle = TC.deep; ctx.fill();
    const wheel = (cx, cy, r, ang, kind) => {
      ctx.save(); ctx.translate(cx, -cy);
      ctx.fillStyle = TC.rubber; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.fillStyle = radial(ctx, -r * 0.3, -r * 0.35, r * 1.2, [[0, '#9a8c74'], [0.6, '#6a604f'], [1, '#3a342a']]);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, TAU); ctx.fill();
      ctx.rotate(ang);
      if (kind === 'sprocket') {
        ctx.fillStyle = '#4a443a';
        for (let i = 0; i < 11; i++) { const a = TAU * i / 11; ctx.save(); ctx.rotate(a); ctx.fillRect(r * 0.78, -r * 0.09, r * 0.3, r * 0.18); ctx.restore(); }
      }
      ctx.fillStyle = '#4c4538';
      for (let i = 0; i < 6; i++) { const a = TAU * i / 6; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.12, 0, TAU); ctx.fill(); }
      ctx.fillStyle = radial(ctx, -r * 0.08, -r * 0.08, r * 0.3, [[0, '#b8ab90'], [1, '#585042']]);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2e2a24';
      for (let i = 0; i < 6; i++) { const a = TAU * i / 6 + 0.5; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.17, Math.sin(a) * r * 0.17, r * 0.035, 0, TAU); ctx.fill(); }
      ctx.restore();
    };
    for (const wx of TANK_WHEELS) wheel(wx, wy, wr, dist / wr, 'road');
    wheel(spr[0], spr[1], spr[2], dist / spr[2], 'sprocket');
    wheel(idl[0], idl[1], idl[2], dist / idl[2], 'idler');
    // track loop (centre line), links animated with dash offset
    const tt = 0.1, tr = (r) => r + tt / 2;
    ctx.beginPath();
    ctx.arc(idl[0], -idl[1], tr(idl[2]), -Math.PI / 2, 1.05, false);
    ctx.lineTo(TANK_WHEELS[6] + 0.12, -(wy - wr - tt / 2));
    ctx.lineTo(TANK_WHEELS[0] - 0.12, -(wy - wr - tt / 2));
    ctx.arc(spr[0], -spr[1], tr(spr[2]), 2.2, Math.PI * 1.5, false);
    ctx.closePath();
    ctx.lineWidth = tt * 1.25; ctx.strokeStyle = '#1c1a17'; ctx.stroke();
    ctx.setLineDash([0.12, 0.07]); ctx.lineDashOffset = -(dist % 0.19);
    ctx.lineWidth = tt * 0.8; ctx.strokeStyle = '#5c564c'; ctx.stroke();
    ctx.setLineDash([0.025, 0.165]); ctx.lineDashOffset = -(dist % 0.19) - 0.05;
    ctx.lineWidth = tt * 1.3; ctx.strokeStyle = '#8a8478'; ctx.stroke();
    ctx.setLineDash([]);
    // ---- upper hull
    const deck = 1.58;
    P([[-3.96, 1.05], [-3.96, deck], [1.72, deck], [3.98, 1.24], [3.98, 1.05]]);
    ctx.fillStyle = vgrad(1.05, deck, TC.base, TC.mid); ctx.fill(); outline();
    // top deck strip (seen slightly from above) + glacis
    P([[-3.96, deck], [-3.86, deck + 0.16], [1.82, deck + 0.16], [1.72, deck]]); ctx.fillStyle = vgrad(deck, deck + 0.16, TC.hi, TC.light); ctx.fill(); outline(0.018);
    P([[1.72, deck], [1.82, deck + 0.16], [4.06, 1.36], [3.98, 1.24]]); ctx.fillStyle = vgrad(1.24, deck + 0.16, TC.light, TC.base); ctx.fill(); outline(0.018);
    // engine grille on the rear deck
    ctx.strokeStyle = 'rgba(60,44,26,0.6)'; ctx.lineWidth = 0.02;
    for (let i = 0; i < 9; i++) { const x = -3.75 + i * 0.16; ctx.beginPath(); ctx.moveTo(x, -deck - 0.02); ctx.lineTo(x + 0.08, -deck - 0.14); ctx.stroke(); }
    // headlight cluster & tow hook at the front
    ctx.fillStyle = TC.dark; ctx.fillRect(3.6, -1.42, 0.22, 0.12);
    ctx.fillStyle = '#fff2c8'; ctx.beginPath(); ctx.arc(3.78, -1.36, 0.045, 0, TAU); ctx.fill();
    ctx.fillStyle = TC.deep; ctx.fillRect(3.85, -1.12, 0.14, 0.1);
    // ---- skirts
    const sTop = 1.3, sBot = 0.58;
    P([[-3.8, sTop], [2.3, sTop], [2.3, sBot], [-3.05, sBot], [-3.35, 0.82], [-3.8, 0.9]]);
    ctx.fillStyle = vgrad(sBot, sTop, TC.light, TC.base, TC.mid); ctx.fill(); outline();
    P([[2.3, sTop], [3.98, sTop], [3.98, 0.86], [3.72, sBot - 0.06], [2.3, sBot - 0.06]]);
    ctx.fillStyle = vgrad(sBot - 0.06, sTop, TC.hi, TC.light, TC.mid); ctx.fill(); outline();
    ctx.strokeStyle = 'rgba(58,42,24,0.75)'; ctx.lineWidth = 0.022;
    for (let x = -3.05; x < 2.3; x += 0.76) { ctx.beginPath(); ctx.moveTo(x, -sTop + 0.02); ctx.lineTo(x, -sBot - 0.02); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-3.8, -sTop - 0.0); ctx.lineTo(3.98, -sTop); ctx.stroke();
    // bottom-edge shadow + top-edge light
    ctx.fillStyle = 'rgba(40,28,14,0.35)'; ctx.fillRect(-3.05, -sBot - 0.07, 5.35, 0.07);
    ctx.fillStyle = 'rgba(255,236,190,0.5)'; ctx.fillRect(-3.8, -sTop - 0.02, 7.78, 0.03);
    // bolts on the heavy front skirt
    ctx.fillStyle = TC.dark;
    for (let i = 0; i < 6; i++) for (const yy of [sTop - 0.12, sBot + 0.08]) { ctx.beginPath(); ctx.arc(2.45 + i * 0.26, -yy, 0.025, 0, TAU); ctx.fill(); }
    // deck rim light (before the turret so the turret occludes it)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,214,150,0.5)'; ctx.lineWidth = 0.03;
    ctx.beginPath(); ctx.moveTo(-3.86, -deck - 0.16); ctx.lineTo(1.82, -deck - 0.16); ctx.lineTo(4.06, -1.36); ctx.stroke(); ctx.restore();
    // ---- turret (shadow on the deck first)
    ctx.fillStyle = 'rgba(30,20,10,0.45)'; ctx.fillRect(-2.9, -deck - 0.16, 4.9, 0.16);
    const roof = 2.42;
    // bustle rack (basket) behind the turret
    ctx.fillStyle = 'rgba(40,30,18,0.9)'; P([[-3.05, 1.8], [-3.92, 1.82], [-3.98, 2.32], [-3.0, 2.3]]); ctx.fill();
    ctx.fillStyle = TC.mid; P([[-3.15, 2.0], [-3.75, 2.0], [-3.8, 2.32], [-3.12, 2.3]]); ctx.fill(); // stowed gear
    ctx.fillStyle = '#7d6a4a'; ctx.beginPath(); ctx.ellipse(-3.45, -2.2, 0.3, 0.12, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = TC.deep; ctx.lineWidth = 0.025;
    ctx.beginPath(); for (let x = -3.05; x >= -3.95; x -= 0.15) { ctx.moveTo(x, -1.8); ctx.lineTo(x - 0.03, -2.34); } ctx.moveTo(-3.0, -2.33); ctx.lineTo(-3.98, -2.35); ctx.moveTo(-3.02, -2.05); ctx.lineTo(-3.95, -2.07); ctx.stroke();
    // turret side
    const tSide = [[2.15, 1.66], [1.78, 2.3], [1.48, roof], [-2.55, roof + 0.02], [-2.98, 2.24], [-3.06, 1.82], [-2.6, 1.68], [-1.4, 1.62], [1.2, 1.62]];
    P(tSide); ctx.fillStyle = vgrad(1.62, roof, TC.light, TC.base, TC.mid); ctx.fill(); outline(0.03);
    // front cheek face (sloped, catches less light)
    P([[2.15, 1.66], [1.78, 2.3], [1.48, roof], [1.62, 2.26], [1.92, 1.68]]); ctx.fillStyle = vgrad(1.66, roof, TC.base, TC.dark); ctx.fill(); outline(0.02);
    // roof strip (seen from slightly above)
    P([[1.48, roof], [1.62, roof + 0.2], [-2.43, roof + 0.22], [-2.55, roof + 0.02]]); ctx.fillStyle = vgrad(roof, roof + 0.22, TC.hi, TC.light); ctx.fill(); outline(0.02);
    // turret panel lines, stowage box, smoke launchers
    ctx.strokeStyle = 'rgba(70,52,30,0.55)'; ctx.lineWidth = 0.02;
    ctx.beginPath(); ctx.moveTo(-1.95, -1.66); ctx.lineTo(-1.95, -roof); ctx.moveTo(0.9, -1.63); ctx.lineTo(0.9, -roof); ctx.moveTo(-2.9, -2.02); ctx.lineTo(1.95, -2.02); ctx.stroke();
    ctx.fillStyle = vgrad(1.74, 2.06, TC.light, TC.mid); ctx.fillRect(-1.75, -2.0, 1.25, 0.26); ctx.strokeStyle = TC.line; ctx.lineWidth = 0.015; ctx.strokeRect(-1.75, -2.0, 1.25, 0.26);
    ctx.fillStyle = TC.dark; ctx.fillRect(-1.75, -2.0, 1.25, 0.03);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) {
      const cx = 1.0 + i * 0.14 + r * 0.07, cy = 2.12 + r * 0.13;
      ctx.fillStyle = TC.deep; ctx.beginPath(); ctx.arc(cx, -cy, 0.06, 0, TAU); ctx.fill();
      ctx.fillStyle = TC.light; ctx.beginPath(); ctx.arc(cx - 0.012, -cy - 0.012, 0.03, 0, TAU); ctx.fill();
    }
    // commander's cupola + .50 cal, CITV, gunner's sight, antennas
    P([[-1.4, roof + 0.1], [-1.35, roof + 0.36], [-0.5, roof + 0.36], [-0.45, roof + 0.1]]); ctx.fillStyle = vgrad(roof + 0.1, roof + 0.36, TC.light, TC.mid); ctx.fill(); outline(0.018);
    ctx.fillStyle = '#2a3238'; for (let i = 0; i < 4; i++) ctx.fillRect(-1.3 + i * 0.2, -roof - 0.3, 0.12, 0.07);
    ctx.fillStyle = '#3c3830'; ctx.fillRect(-1.05, -roof - 0.5, 0.35, 0.14); // MG body
    ctx.fillRect(-0.7, -roof - 0.46, 1.25, 0.045); // barrel
    ctx.fillRect(-0.9, -roof - 0.42, 0.06, 0.08);
    ctx.fillStyle = vgrad(roof + 0.1, roof + 0.5, TC.base, TC.dark); ctx.fillRect(0.55, -roof - 0.5, 0.28, 0.42); // CITV
    ctx.fillStyle = '#1e262c'; ctx.fillRect(0.72, -roof - 0.44, 0.11, 0.1);
    ctx.fillStyle = vgrad(roof + 0.1, roof + 0.34, TC.light, TC.mid); ctx.fillRect(1.0, -roof - 0.34, 0.5, 0.26); // GPS box
    ctx.fillStyle = '#20282e'; ctx.fillRect(1.38, -roof - 0.3, 0.1, 0.16);
    ctx.strokeStyle = '#2a241c'; ctx.lineWidth = 0.02;
    ctx.beginPath(); ctx.moveTo(-2.2, -roof - 0.2); ctx.quadraticCurveTo(-2.3, -roof - 1.0, -2.6, -roof - 1.6); ctx.moveTo(-2.45, -roof - 0.2); ctx.quadraticCurveTo(-2.55, -roof - 0.9, -2.85, -roof - 1.35); ctx.stroke();
    // ---- gun: mantlet + barrel (elevation around the trunnion, recoil slides back)
    ctx.save();
    ctx.translate(G.pivot[0], -G.pivot[1]); ctx.rotate(-G.elev);
    ctx.fillStyle = vgrad(-0.28, 0.28, TC.light, TC.base, TC.dark);
    ctx.save(); ctx.translate(0, 0);
    ctx.beginPath(); ctx.moveTo(-0.1, -0.3); ctx.lineTo(0.55, -0.22); ctx.lineTo(0.55, 0.2); ctx.lineTo(-0.1, 0.28); ctx.closePath();
    const mg = ctx.createLinearGradient(0, -0.3, 0, 0.3); mg.addColorStop(0, TC.light); mg.addColorStop(0.5, TC.base); mg.addColorStop(1, TC.dark);
    ctx.fillStyle = mg; ctx.fill(); outline(0.02);
    ctx.restore();
    const bx0 = 0.5 - G.barrelBack, bx1 = 4.75 - G.barrelBack;
    const bg = ctx.createLinearGradient(0, -0.12, 0, 0.12);
    bg.addColorStop(0, TC.dark); bg.addColorStop(0.25, TC.hi); bg.addColorStop(0.55, TC.base); bg.addColorStop(1, TC.deep);
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.moveTo(bx0, -0.12); ctx.lineTo(bx1, -0.09); ctx.lineTo(bx1, 0.09); ctx.lineTo(bx0, 0.12); ctx.closePath(); ctx.fill(); outline(0.018);
    // bore evacuator
    ctx.beginPath(); ctx.moveTo(bx0 + 1.9, -0.11); ctx.quadraticCurveTo(bx0 + 2.05, -0.17, bx0 + 2.25, -0.17); ctx.lineTo(bx0 + 2.7, -0.165); ctx.quadraticCurveTo(bx0 + 2.87, -0.16, bx0 + 2.95, -0.1);
    ctx.lineTo(bx0 + 2.95, 0.1); ctx.quadraticCurveTo(bx0 + 2.87, 0.16, bx0 + 2.7, 0.165); ctx.lineTo(bx0 + 2.25, 0.17); ctx.quadraticCurveTo(bx0 + 2.05, 0.17, bx0 + 1.9, 0.11); ctx.closePath(); ctx.fill(); outline(0.018);
    // thermal sleeve bands + muzzle
    ctx.strokeStyle = 'rgba(50,36,20,0.7)'; ctx.lineWidth = 0.02;
    for (const bxx of [0.9, 1.45, 3.35, 3.8]) { ctx.beginPath(); ctx.moveTo(bx0 + bxx, -0.105); ctx.lineTo(bx0 + bxx, 0.105); ctx.stroke(); }
    ctx.fillStyle = bg; ctx.fillRect(bx1 - 0.12, -0.11, 0.12, 0.22); ctx.strokeStyle = TC.line; ctx.strokeRect(bx1 - 0.12, -0.11, 0.12, 0.22);
    ctx.fillStyle = TC.dark; ctx.fillRect(bx1 - 0.45, -0.17, 0.16, 0.08); // muzzle reference sensor
    // rim light along the top of the barrel
    ctx.strokeStyle = 'rgba(255,230,170,0.7)'; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.moveTo(bx0, -0.115); ctx.lineTo(bx1, -0.087); ctx.stroke();
    ctx.restore();
    // ---- rim light on the turret roof edge (warm), crisp
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,214,150,0.55)'; ctx.lineWidth = 0.03;
    ctx.beginPath(); ctx.moveTo(1.62, -roof - 0.2); ctx.lineTo(-2.43, -roof - 0.22); ctx.stroke();
    ctx.restore();
    // ---- post: warm rim light on the sun side (+ optional backlight darkening)
    const bl = clamp(o.backlight || 0), sunSide = (o.sun === 'right' ? 1 : -1) * fl; // in canvas space
    const rp = Math.max(1.2, dev * 0.045) * (1 + bl);
    const dx = sunSide * 0.75 * rp, dy = -0.66 * rp;
    if (bl > 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(46,28,16,${0.55 * bl})`; ctx.fillRect(0, 0, pw, ph); ctx.globalCompositeOperation = 'source-over'; }
    const band = scratch('tankRim', pw, ph), rg = band.getContext('2d');
    rg.drawImage(cv, 0, 0); rg.globalCompositeOperation = 'destination-out'; rg.drawImage(cv, -dx, -dy);
    rg.globalCompositeOperation = 'source-in'; rg.fillStyle = '#ffd590'; rg.fillRect(0, 0, pw, ph);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.45 * bl; ctx.drawImage(band, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx0.save();
    ctx0.translate(o.x || 0, o.y || 0);
    if (o.flip) ctx0.scale(-1, 1);
    ctx0.scale(K, K);
    ctx0.drawImage(cv, 0, 0, pw, ph, BX0 - pad / dev, BY0 - pad / dev, pw / dev, ph / dev);
    ctx0.restore();
  }

  A.tank = tank; A.tankMuzzle = tankMuzzle;

  // ======================================================================
  // 8. FX — smoke / dust / fire sprites and analytic particle effects
  // ======================================================================
  function buildPuff(idx, size = 128) {
    // soft noisy puff, lit from upper-left (white/gray; tint with tinted())
    const c = canvas(size, size), g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const r0 = size * 0.42;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x - size / 2, dy = y - size / 2;
      const d = Math.hypot(dx, dy) / r0;
      const n = fbm2(x / 18 + idx * 7.3, y / 18 + idx * 3.1, 500 + idx, 4);
      let a = smooth(1.0, 0.55, d + n * 0.45);
      if (a <= 0) continue;
      const lit = clamp(0.62 - (dx + dy) / (r0 * 3.2) + n * 0.25);
      const v = 150 + lit * 105;
      const i = (y * size + x) * 4;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function buildFire(idx, size = 128) {
    const c = canvas(size, size), g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const r0 = size * 0.44;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x - size / 2, dy = y - size / 2;
      const d = Math.hypot(dx, dy) / r0;
      const n = fbm2(x / 14 + idx * 5.1, y / 14 + idx * 2.7, 700 + idx, 4);
      const k = clamp(1 - (d + n * 0.5));
      if (k <= 0) continue;
      const i = (y * size + x) * 4;
      // white-yellow core -> orange -> deep red edge
      const r = 255, gg = clamp(k * 1.6) * 210 + 40, b = clamp(k * 2.2 - 1.1) * 200 + 20;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = smooth(0, 0.35, k) * 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  const PUFF_N = 6;
  function puffSprite(i, color) { const s = SPR.puff[((i % PUFF_N) + PUFF_N) % PUFF_N]; return color ? tinted(s, color, 'puff' + (((i % PUFF_N) + PUFF_N) % PUFF_N)) : s; }
  function drawPuff(ctx, spr, x, y, r, a, rot) {
    if (a <= 0.003 || r <= 0.5) return;
    const ga = ctx.globalAlpha; ctx.globalAlpha = ga * Math.min(1, a);
    if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(spr, -r, -r, r * 2, r * 2); ctx.restore(); }
    else ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = ga;
  }
  A.puffSprite = puffSprite; A.drawPuff = drawPuff;

  /**
   * dustPlume(ctx, t, {x, y, scale, seed, dir, rate, color, alpha, life, drift})
   * Continuous dust behind a moving vehicle / rotor wash. (x,y)=emitter on the ground. dir=-1 blows left.
   */
  function dustPlume(ctx, t, o = {}) {
    const x = o.x || 0, y = o.y || 0, s = o.scale != null ? o.scale : 1, seed = o.seed || 1;
    const dir = o.dir != null ? o.dir : -1, rate = (o.rate || 1) * 14, life = o.life || 2.6;
    const color = o.color || '#e2c697', alpha = o.alpha != null ? o.alpha : 0.8;
    const drift = o.drift != null ? o.drift : 70 * s;
    const dt = 1 / rate;
    const i1 = Math.floor(t / dt), i0 = Math.floor((t - life) / dt);
    ctx.save();
    for (let i = i0; i <= i1; i++) {
      const b = i * dt, a = t - b;
      if (a < 0 || a > life) continue;
      const k = a / life;
      const h1 = hash(i, seed * 17 + 1), h2 = hash(i, seed * 17 + 2), h3 = hash(i, seed * 17 + 3);
      const vx = (30 + 60 * h1) * s, vy = (18 + 30 * h2) * s;
      const px = x + dir * (drift * a + vx * a * (1 - k * 0.4)) + (h3 - 0.5) * 40 * s;
      const py = y - vy * a - 14 * s * Math.sqrt(a) + (h2 - 0.5) * 10 * s;
      const r = (16 + 22 * h3) * s * (0.6 + 2.6 * Math.pow(k, 0.7));
      const al = alpha * Math.min(1, a * 6) * Math.pow(1 - k, 1.4) * (0.55 + 0.45 * h1);
      drawPuff(ctx, puffSprite(i, color), px, py, r, al, h1 * TAU);
    }
    ctx.restore();
  }
  A.dustPlume = dustPlume;

  /**
   * explosion(ctx, age, {x, y, scale, seed, ground, smokeColor}) — flash -> fireball -> rising smoke mushroom
   * + debris dendrites + sparks, ~5 s. (x,y) = burst point (on the ground when ground:true). scale=1 -> fireball ~300 px.
   */
  function explosion(ctx, age, o = {}) {
    if (age < 0 || age > 7) return;
    const x = o.x || 0, y = o.y || 0, s = o.scale != null ? o.scale : 1, seed = o.seed || 1;
    const ground = o.ground !== false;
    const smokeCol = o.smokeColor || '#7a6c60';
    const rise = (a) => Math.pow(a, 1.35) * 55 * s;
    ctx.save();
    // ground dust skirt (low, wide, brief)
    if (ground) {
      for (let i = 0; i < 10; i++) {
        const side = i % 2 ? 1 : -1, h = hash(i, seed + 11);
        const d = (60 + 200 * h) * s * (1 - Math.exp(-age * 3));
        const r = (34 + 30 * h) * s * (0.6 + age * 0.7);
        const al = 0.6 * Math.min(1, age * 6) * clamp(1 - age / (2.2 + h));
        drawPuff(ctx, puffSprite(i, '#c9a676'), x + side * d, y - r * 0.3, r, al, h * 6);
      }
    }
    // debris dendrites: arcing smoke trails behind flying chunks (continuous tapered strokes)
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const h1 = hash(i, seed + 51), h2 = hash(i, seed + 52), h3 = hash(i, seed + 53);
      const ang = -Math.PI / 2 + (h1 - 0.5) * 2.0, v = (300 + 300 * h2) * s, g = 650 * s;
      const P2 = (aa) => [x + Math.cos(ang) * v * aa, y - 30 * s + Math.sin(ang) * v * aa + 0.5 * g * aa * aa];
      const tEnd = Math.min(age, 0.55 + h3 * 0.35);
      const fadeT = clamp(1 - (age - tEnd) / 1.8);
      if (fadeT <= 0 || tEnd <= 0.01) continue;
      const SEG = 14;
      for (const [wk, ak] of [[1.0, 0.1], [0.55, 0.16], [0.22, 0.22]]) {
        ctx.beginPath();
        for (let k2 = 0; k2 <= SEG; k2++) { const aa = tEnd * k2 / SEG, q = P2(aa); const yy = q[1] - (age - aa) * 10 * s; k2 ? ctx.lineTo(q[0], yy) : ctx.moveTo(q[0], yy); }
        ctx.strokeStyle = `rgba(92,82,72,${ak * fadeT * 2.2})`; ctx.lineWidth = (6 + age * 14) * s * wk; ctx.stroke();
      }
      const lim = 0.55 + h3 * 0.35;
      if (age < lim) {
        const q = P2(age), shr = clamp((lim - age) / 0.12);
        ctx.fillStyle = '#1e1814'; ctx.beginPath(); ctx.arc(q[0], q[1], (2.5 + 2.5 * h3) * s * shr, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter'; glow(ctx, q[0], q[1], 14 * s, '#ff9a40', clamp(1.2 - age) * shr); ctx.globalCompositeOperation = 'source-over';
      }
    }
    // smoke mushroom (rises, spreads, lit warm from below while the fire burns)
    const N = 26;
    for (let i = 0; i < N; i++) {
      const h1 = hash(i, seed + 21), h2 = hash(i, seed + 22), h3 = hash(i, seed + 23);
      const b = 0.12 + h1 * 0.45, a = age - b;
      if (a <= 0) continue;
      const k = clamp(a / 6);
      const capK = h3; // 0 = stem, 1 = cap
      const spread = (h2 - 0.5) * (60 + 220 * capK) * s * (0.5 + k * 1.4);
      const px = x + spread + Math.sin(a * 0.7 + i) * 10 * s;
      const py = y - (30 + 220 * capK) * s * (1 - Math.exp(-a * 1.2)) - rise(a) * (0.7 + 0.9 * capK) - (ground ? 40 * s : 0);
      const r = (45 + 45 * h2) * s * (0.55 + 1.0 * Math.sqrt(k + 0.04)) * (0.8 + 0.5 * capK);
      const al = 0.8 * Math.min(1, a * 4) * Math.pow(1 - k, 1.2);
      const warm = clamp(1.6 - a / 0.9);
      const cool = i % 3 ? smokeCol : '#5e5248';
      if (warm < 1) drawPuff(ctx, puffSprite(i, cool), px, py, r, al * (1 - warm), h1 * TAU + a * 0.15);
      if (warm > 0) drawPuff(ctx, puffSprite(i, '#8a5a38'), px, py, r, al * warm, h1 * TAU + a * 0.15);
    }
    // fireball: opaque structured fire puffs (cooling to smoke), then additive heat
    const FB = 13;
    const fpos = [];
    for (let i = 0; i < FB; i++) {
      const h1 = hash(i, seed + 31), h2 = hash(i, seed + 32), h3 = hash(i, seed + 33);
      const ang = -Math.PI / 2 + (h1 - 0.5) * (ground ? 2.8 : TAU);
      const R = (40 + 110 * h2) * s * (1 - Math.exp(-age * 6));
      const px = x + Math.cos(ang) * R * 1.15, py = y + Math.sin(ang) * R * (ground ? 0.75 : 1) - rise(age) - (ground ? 45 * s : 0);
      const r = (52 + 40 * h3) * s * (0.45 + Math.min(1.3, age * 2.4));
      fpos.push([px, py, r, h1, h3]);
    }
    for (const [px, py, r, h1, h3] of fpos) {
      const life = 0.75 + h3 * 0.55;
      const fa = clamp(1 - age / life);
      if (fa > 0) drawPuff(ctx, SPR.fire[(h1 * 4) | 0], px, py, r, Math.min(1, fa * 1.6), h1 * TAU);
      const sm = smooth(0.3, 1.2, age) * clamp(1 - (age - 1.0) / 2.5);
      if (sm > 0) drawPuff(ctx, puffSprite((h1 * 6) | 0, '#55382a'), px, py - age * 25 * s, r * (1 + age * 0.15), sm * 0.6, h1 * TAU + 1);
    }
    ctx.globalCompositeOperation = 'lighter';
    const heat = clamp(1 - age / 0.9);
    if (heat > 0) for (const [px, py, r] of fpos) glow(ctx, px, py, r * 1.3, '#ff8a30', heat * 0.35);
    if (age < 0.3) {
      const f = Math.pow(1 - age / 0.3, 2);
      glow(ctx, x, y - 50 * s, 520 * s, '#ffcf80', f * 0.9);
      glow(ctx, x, y - 50 * s, 170 * s, '#ffffff', f);
    }
    // sparks
    ctx.lineCap = 'round';
    for (let i = 0; i < 24; i++) {
      const h1 = hash(i, seed + 41), h2 = hash(i, seed + 42);
      const life = 0.45 + 0.5 * h2; if (age > life) continue;
      const ang = -Math.PI / 2 + (h1 - 0.5) * 2.9, v = (600 + 800 * h2) * s;
      const p = (aa) => [x + Math.cos(ang) * v * aa, y - 40 * s + Math.sin(ang) * v * aa + 800 * s * aa * aa];
      const p0 = p(age), p1 = p(Math.max(0, age - 0.045));
      ctx.strokeStyle = `rgba(255,${190 + 60 * h1 | 0},120,${1 - age / life})`; ctx.lineWidth = 2.6 * s;
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p0[0], p0[1]); ctx.stroke();
    }
    ctx.restore();
  }
  A.explosion = explosion;

  /** muzzleFlash(ctx, age, {x, y, angle, scale}) — 0.12 s flash star + blast smoke (1.5 s). angle = firing direction. */
  function muzzleFlash(ctx, age, o = {}) {
    if (age < 0 || age > 2) return;
    const x = o.x || 0, y = o.y || 0, ang = o.angle || 0, s = o.scale != null ? o.scale : 1;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    // blast smoke (pushed forward + sideways)
    for (let i = 0; i < 12; i++) {
      const h1 = hash(i, 71), h2 = hash(i, 72);
      const fwd = (40 + 160 * h1) * s * (1 - Math.exp(-age * 5)) * (i % 3 === 0 ? 1.6 : 1);
      const side = (h2 - 0.5) * 160 * s * (1 - Math.exp(-age * 4));
      const r = (24 + 26 * h2) * s * (0.5 + age * 1.6);
      drawPuff(ctx, puffSprite(i, '#b9a588'), fwd, side - age * 20 * s, r, 0.75 * clamp(1 - age / 1.8) * Math.min(1, age * 20), h1 * 6);
    }
    if (age < 0.2) {
      const k = 1 - age / 0.2, f = Math.pow(k, 1.4);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 40 * s, 0, 260 * s, '#ffb04a', f);
      // main cone
      const L = 240 * s * (0.75 + 0.25 * k);
      const g = ctx.createLinearGradient(0, 0, L, 0);
      g.addColorStop(0, `rgba(255,255,240,${f})`); g.addColorStop(0.4, `rgba(255,200,90,${0.85 * f})`); g.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, -14 * s); ctx.quadraticCurveTo(L * 0.5, -34 * s, L, 0); ctx.quadraticCurveTo(L * 0.5, 34 * s, 0, 14 * s); ctx.closePath(); ctx.fill();
      // side lobes (muzzle brake style star)
      for (const sd of [-1, 1]) {
        ctx.save(); ctx.rotate(sd * 1.15);
        const g2 = ctx.createLinearGradient(0, 0, L * 0.45, 0);
        g2.addColorStop(0, `rgba(255,240,200,${0.9 * f})`); g2.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(0, -8 * s); ctx.lineTo(L * 0.45, 0); ctx.lineTo(0, 8 * s); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      glow(ctx, 18 * s, 0, 90 * s, '#ffffff', f);
      glow(ctx, 70 * s, 0, 70 * s, '#fff2c0', f * 0.8);
    }
    ctx.restore();
  }
  A.muzzleFlash = muzzleFlash;

  /** shockwave(ctx, age, {x, y, scale, ground, color}) — expanding pressure ring (~1 s). ground:true = flattened ring on the floor + kicked-up dust. */
  function shockwave(ctx, age, o = {}) {
    if (age < 0 || age > 1.6) return;
    const x = o.x || 0, y = o.y || 0, s = o.scale != null ? o.scale : 1;
    const R = 460 * s * (1 - Math.exp(-age * 3.0));
    const a = Math.pow(clamp(1 - age / 1.2), 1.4);
    const col = o.color || '#fff0d0';
    const sq = o.ground ? 0.26 : 1;
    ctx.save();
    if (o.ground) {
      // dust thrown up along the ring
      for (let i = 0; i < 28; i++) {
        const th = TAU * i / 28 + hash(i, 61) * 0.2, h = hash(i, 62);
        const rr = R * (0.92 + 0.1 * h);
        const px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr * sq;
        const r = (26 + 30 * h) * s * (0.6 + age * 1.3);
        drawPuff(ctx, puffSprite(i, '#d2b080'), px, py - r * 0.45, r, 0.7 * Math.min(1, age * 8) * clamp(1 - age / 1.6) * (Math.sin(th) > 0 ? 1 : 0.75), h * 6);
      }
    }
    ctx.translate(x, y);
    ctx.scale(1, sq);
    ctx.globalCompositeOperation = 'lighter';
    const w = 46 * s * (0.4 + age);
    const g = ctx.createRadialGradient(0, 0, Math.max(0, R - w), 0, 0, R + w * 0.35);
    g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.7, rgba(col, 0.35 * a)); g.addColorStop(0.9, rgba('#ffffff', 0.85 * a)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R + w * 0.35, 0, TAU); ctx.fill();
    // inner refraction haze
    const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g2.addColorStop(0, rgba(col, 0.18 * a)); g2.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.restore();
  }
  A.shockwave = shockwave;

  /**
   * smokeTrail(ctx, t, {path:(u)=>({x,y}), u0, u1, color, width, seed, alpha, fade})
   * Airshow smoke ribbon along path from u0 (oldest, widest, faintest) to u1 (fresh, at the aircraft).
   */
  function smokeTrail(ctx, t, o = {}) {
    const path = o.path, u0 = o.u0 != null ? o.u0 : 0, u1 = o.u1 != null ? o.u1 : 1;
    if (!path || u1 <= u0) return;
    const col = o.color || '#ffffff', width = o.width || 40, seed = o.seed || 1, alpha = o.alpha != null ? o.alpha : 0.9;
    const fade = o.fade != null ? o.fade : 1;
    // puffs are laid at FIXED path parameters (multiples of du over the whole path) so they never re-sample
    let len = 0, prev = path(0);
    for (let i = 1; i <= 32; i++) { const p = path(i / 32); len += Math.hypot(p.x - prev.x, p.y - prev.y); prev = p; }
    const du = Math.max(1e-4, (width * 0.28) / Math.max(1, len));
    const i0 = Math.ceil(u0 / du), i1 = Math.floor(u1 / du);
    ctx.save();
    for (let i = i0; i <= i1; i++) {
      const u = i * du;
      const k = (u - u0) / (u1 - u0);       // 0 tail .. 1 head
      const p = path(u);
      const ageK = 1 - k;
      const h = hash(i, seed);
      const bil = noise1(i * 0.37 + t * 0.6, seed) * width * 0.5 * ageK;
      const w = width * (0.42 + 1.5 * Math.pow(ageK, 0.8)) * (0.85 + 0.3 * h);
      const a = alpha * Math.pow(Math.max(0, 1 - ageK * fade), 1.1) * (0.7 + 0.3 * h) * Math.min(1, k * 8 + 0.1) * Math.min(1, (u1 - u) / du * 0.5 + 0.5);
      drawPuff(ctx, puffSprite(i, col), p.x + bil * 0.6, p.y + bil - ageK * width * 0.4, w, a * 0.55, h * TAU);
    }
    ctx.restore();
  }
  A.smokeTrail = smokeTrail;

  /** lightRays(ctx, {x, y, count, alpha, t, color, length, spread, angle, width}) — volumetric god rays from a source point. */
  function lightRays(ctx, o = {}) {
    const x = o.x || W / 2, y = o.y || 0, n = o.count || 14, alpha = o.alpha != null ? o.alpha : 0.35;
    const t = o.t || 0, col = o.color || '#ffe2a0', len = o.length || 1600, spread = o.spread != null ? o.spread : TAU;
    const base = o.angle != null ? o.angle : Math.PI / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, len);
    g.addColorStop(0, rgba(col, alpha)); g.addColorStop(0.35, rgba(col, alpha * 0.45)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const h = hash(i, 91);
      const a = base - spread / 2 + spread * (i + 0.5) / n + Math.sin(t * 0.3 + i * 1.7) * 0.03 + (h - 0.5) * spread / n * 0.6;
      const wdt = (o.width || 0.045) * (0.5 + h) * (0.8 + 0.2 * Math.sin(t * 0.9 + i));
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a - wdt) * len, y + Math.sin(a - wdt) * len);
      ctx.lineTo(x + Math.cos(a + wdt) * len, y + Math.sin(a + wdt) * len);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }
  A.lightRays = lightRays;

  /** lensFlare(ctx, {x, y, intensity, color}) — bloom + anamorphic streak + ghosts toward the screen centre. */
  function lensFlare(ctx, o = {}) {
    const x = o.x || 0, y = o.y || 0, I = o.intensity != null ? o.intensity : 1;
    if (I <= 0) return;
    const col = o.color || '#ffd9a0';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 420 * I, col, 0.35 * I);
    glow(ctx, x, y, 120, '#ffffff', 0.8 * I);
    // anamorphic streak
    ctx.save(); ctx.translate(x, y); ctx.scale(9, 0.22); glow(ctx, 0, 0, 110, '#ffe8c0', 0.55 * I); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.scale(4, 0.08); glow(ctx, 0, 0, 120, '#ffffff', 0.7 * I); ctx.restore();
    // ghosts along the axis through the screen centre
    const cx = W / 2, cy = H / 2, dx = cx - x, dy = cy - y;
    const ghosts = [[0.35, 28, '#7cffb2', 0.18], [0.6, 60, '#ffb060', 0.12], [0.85, 18, '#ffffff', 0.25], [1.25, 90, '#6aa8ff', 0.1], [1.55, 40, '#ffd27a', 0.16], [1.9, 140, '#ff9a50', 0.06]];
    for (const [f, r, c, a] of ghosts) {
      const gx = x + dx * f, gy = y + dy * f;
      ctx.fillStyle = radial(ctx, gx, gy, r, [[0, rgba(c, a * 0.4 * I)], [0.75, rgba(c, a * 0.8 * I)], [1, rgba(c, 0)]]);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a2 = k * TAU / 6 + 0.3; k ? ctx.lineTo(gx + Math.cos(a2) * r, gy + Math.sin(a2) * r) : ctx.moveTo(gx + Math.cos(a2) * r, gy + Math.sin(a2) * r); }
      ctx.closePath(); ctx.fill();
    }
    // halo ring
    ctx.strokeStyle = rgba(col, 0.08 * I); ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(x, y, 260, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  A.lensFlare = lensFlare;

  /** embers(ctx, t, {seed, count, area:{x,y,w,h}, color, size, speed, alpha}) — glowing sparks drifting up with sway & flicker. */
  function embers(ctx, t, o = {}) {
    const seed = o.seed || 1, n = o.count || 60, ar = o.area || { x: 0, y: 0, w: W, h: H };
    const col = o.color || '#ffb050', size = o.size || 3, sp = o.speed || 60, alpha = o.alpha != null ? o.alpha : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const h1 = hash(i, seed * 7 + 1), h2 = hash(i, seed * 7 + 2), h3 = hash(i, seed * 7 + 3);
      const v = sp * (0.5 + h2);
      const yy = ar.y + ar.h - wrap(h1 * ar.h + t * v, 0, ar.h);
      const xx = ar.x + h3 * ar.w + Math.sin(t * (0.8 + h1) + i) * 26 + noise1(t * 0.7 + i, seed) * 20;
      const life = clamp((ar.y + ar.h - yy) / (ar.h * 0.15)) * clamp((yy - ar.y) / (ar.h * 0.25));
      const fl = 0.55 + 0.45 * Math.sin(t * (6 + h2 * 8) + i * 2.1);
      const a = alpha * life * fl * (0.4 + 0.6 * h2);
      const r = size * (0.6 + h3 * 1.2);
      glow(ctx, xx, yy, r * 5, col, a * 0.6);
      ctx.fillStyle = `rgba(255,240,200,${a})`; ctx.beginPath(); ctx.arc(xx, yy, r * 0.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  A.embers = embers;

  /** hudBracket(ctx, x, y, w, h, {color, alpha, t, len, thick, glow, ticks}) — target/frame corner brackets (x,y = top-left). */
  function hudBracket(ctx, x, y, w, h, o = {}) {
    const col = o.color || '#7CFFB2', alpha = o.alpha != null ? o.alpha : 1, t = o.t || 0;
    if (alpha <= 0) return;
    const L = o.len || Math.min(w, h) * 0.22, th = o.thick || 3;
    const br = (o.breathe != null ? o.breathe : 1) * Math.sin(t * 4) * 3;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = col; ctx.lineWidth = th; ctx.lineCap = 'square';
    ctx.shadowColor = col; ctx.shadowBlur = o.glow != null ? o.glow : 10;
    const x0 = x - br, y0 = y - br, x1 = x + w + br, y1 = y + h + br;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
    ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
    ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
    ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
    ctx.stroke();
    if (o.ticks !== false) {
      ctx.lineWidth = Math.max(1, th * 0.6); ctx.shadowBlur = 0;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, tk = L * 0.35;
      ctx.beginPath();
      ctx.moveTo(cx, y0 - tk * 0.2); ctx.lineTo(cx, y0 + tk); ctx.moveTo(cx, y1 + tk * 0.2); ctx.lineTo(cx, y1 - tk);
      ctx.moveTo(x0 - tk * 0.2, cy); ctx.lineTo(x0 + tk, cy); ctx.moveTo(x1 + tk * 0.2, cy); ctx.lineTo(x1 - tk, cy);
      ctx.stroke();
    }
    ctx.restore();
  }
  A.hudBracket = hudBracket;

  let _scanPat = null;
  /** scanlines(ctx, alpha, {t, spacing}) — CRT/HUD scan lines + slow bright roll band. */
  function scanlines(ctx, alpha = 0.25, o = {}) {
    if (alpha <= 0) return;
    if (!_scanPat) { const c = canvas(4, 4), g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0.9)'; g.fillRect(0, 0, 4, 1); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 1, 4, 1); _scanPat = ctx.createPattern(c, 'repeat'); }
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = _scanPat; ctx.fillRect(0, 0, W, H);
    if (o.t != null) {
      const yy = wrap(o.t * 180, -200, H + 200);
      const g = ctx.createLinearGradient(0, yy - 120, 0, yy + 120);
      g.addColorStop(0, 'rgba(160,255,200,0)'); g.addColorStop(0.5, 'rgba(160,255,200,0.12)'); g.addColorStop(1, 'rgba(160,255,200,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, yy - 120, W, 240);
    }
    ctx.restore();
  }
  A.scanlines = scanlines;

  /** motionStreaks(ctx, t, {dir, alpha, count, color, speed, width}) — speed lines for whip-pans. dir: radians or 'up'|'down'|'left'|'right' (direction of travel of the streaks). */
  function motionStreaks(ctx, t, o = {}) {
    let dir = o.dir != null ? o.dir : 'up';
    if (typeof dir === 'string') dir = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[dir] || 0;
    const alpha = o.alpha != null ? o.alpha : 0.6; if (alpha <= 0) return;
    const n = o.count || 70, col = o.color || '#ffffff', sp = o.speed || 2600;
    const diag = Math.hypot(W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate(dir);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const h1 = hash(i, 301), h2 = hash(i, 302), h3 = hash(i, 303);
      const len = (120 + 520 * h2) * (o.length || 1);
      const across = (h1 - 0.5) * diag;
      const along = wrap(h3 * diag * 2 + t * sp * (0.6 + h2), -diag, diag);
      const g = ctx.createLinearGradient(along - len, 0, along, 0);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, alpha * (0.3 + 0.7 * h2)));
      ctx.fillStyle = g;
      ctx.fillRect(along - len, across, len, (o.width || 2) * (0.5 + h1 * 1.5));
    }
    ctx.restore();
  }
  A.motionStreaks = motionStreaks;

  // ======================================================================
  // 9. Helicopter — Apache-like attack helicopter, side view, nose right.
  //    Anchor = rotor-mast base on the fuselage. scale=1 -> fuselage 15.5 m = 465 px (30 px/m).
  // ======================================================================
  const HELI_PX = 30;
  const HC = { hi: '#9aa080', light: '#737a5c', base: '#555b44', mid: '#3e4332', dark: '#272a1f', glass: '#1c2730', line: '#14160f', rim: '#ffd59a' };
  function helicopter(ctx, o = {}) {
    const K = (o.scale != null ? o.scale : 1) * HELI_PX, t = o.t || 0;
    const tilt = o.tilt != null ? o.tilt : 0.08; // + = nose down
    ctx.save();
    ctx.translate(o.x || 0, o.y || 0);
    if (o.flip) ctx.scale(-1, 1);
    ctx.rotate(tilt);
    ctx.scale(K, K);
    ctx.lineJoin = 'round';
    const P = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], -pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], -pts[i][1]); ctx.closePath(); };
    const vg = (y0, y1, a, b, c) => { const g = ctx.createLinearGradient(0, -y1, 0, -y0); g.addColorStop(0, a); if (c) { g.addColorStop(0.5, b); g.addColorStop(1, c); } else g.addColorStop(1, b); return g; };
    const ol = (w = 0.05) => { ctx.strokeStyle = HC.line; ctx.lineWidth = w; ctx.stroke(); };
    const elevK = 0.13; // rotor disc seen from slightly above
    // ---- tail rotor (far side, drawn first): blurred disc + 2 blades
    const tr = [-8.75, 1.75], trR = 1.45;
    ctx.save(); ctx.translate(tr[0], -tr[1]);
    ctx.fillStyle = radial(ctx, 0, 0, trR, [[0, 'rgba(40,44,34,0.35)'], [0.8, 'rgba(40,44,34,0.22)'], [1, 'rgba(40,44,34,0)']]);
    ctx.beginPath(); ctx.arc(0, 0, trR, 0, TAU); ctx.fill();
    for (let b = 0; b < 2; b++) {
      const a = t * 40 + b * Math.PI;
      ctx.fillStyle = 'rgba(30,32,26,0.3)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, trR, a, a + 0.5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // ---- tail boom + fin + stabilator
    P([[-2.4, 0.75], [-8.4, 0.62], [-8.9, 0.42], [-8.4, 0.2], [-2.4, -0.35]]);
    ctx.fillStyle = vg(-0.35, 0.75, HC.light, HC.base, HC.mid); ctx.fill(); ol();
    P([[-7.9, 0.5], [-8.6, 2.55], [-9.35, 2.6], [-9.2, 0.3]]); ctx.fillStyle = vg(0.3, 2.6, HC.light, HC.base, HC.mid); ctx.fill(); ol();
    P([[-8.2, 0.2], [-9.6, 0.25], [-9.75, 0.05], [-8.3, 0.02]]); ctx.fillStyle = HC.mid; ctx.fill(); ol(0.04);
    // tail wheel
    ctx.strokeStyle = HC.dark; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.moveTo(-7.7, 0.0); ctx.lineTo(-7.9, 0.55); ctx.stroke();
    ctx.fillStyle = '#1a1a16'; ctx.beginPath(); ctx.arc(-7.9, 0.62, 0.22, 0, TAU); ctx.fill();
    // ---- main gear
    ctx.strokeStyle = HC.dark; ctx.lineWidth = 0.14;
    ctx.beginPath(); ctx.moveTo(1.6, 1.1); ctx.lineTo(1.25, 1.95); ctx.moveTo(0.6, 1.0); ctx.lineTo(1.2, 1.95); ctx.stroke();
    ctx.fillStyle = '#1a1a16'; ctx.beginPath(); ctx.arc(1.25, 2.0, 0.42, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4a4c44'; ctx.beginPath(); ctx.arc(1.25, 2.0, 0.17, 0, TAU); ctx.fill();
    // ---- fuselage (smoothed outline)
    const S = (pts) => { const sm = crLoop(pts, 4); ctx.beginPath(); ctx.moveTo(sm[0][0], -sm[0][1]); for (let i = 1; i < sm.length; i++) ctx.lineTo(sm[i][0], -sm[i][1]); ctx.closePath(); };
    // angular, flat-panelled fuselage (Apache-like)
    P([[5.55, -0.2], [5.15, 0.42], [4.55, 0.62], [3.3, 1.0], [1.5, 1.06], [-0.6, 1.02], [-2.25, 0.88], [-2.6, 0.55], [-2.55, -0.32], [-2.05, -0.78], [-1.0, -1.15], [1.5, -1.26], [3.7, -1.2], [4.9, -0.95]]);
    ctx.fillStyle = vg(-1.26, 1.06, HC.light, HC.base, HC.dark); ctx.fill(); ol();
    // upper facet highlight band (flat top panels catch the light)
    P([[4.55, 0.62], [3.3, 1.0], [1.5, 1.06], [-0.6, 1.02], [-2.25, 0.88], [-2.3, 0.7], [-0.6, 0.82], [1.5, 0.86], [3.3, 0.8], [4.45, 0.45]]);
    ctx.fillStyle = 'rgba(190,196,150,0.28)'; ctx.fill();
    // side sponson (avionics bay) — the long Apache "cheek", boxy
    P([[4.1, -0.2], [3.85, 0.3], [0.1, 0.4], [-1.4, 0.3], [-1.62, -0.25], [-1.32, -0.72], [3.55, -0.74], [4.12, -0.52]]);
    ctx.fillStyle = vg(-0.74, 0.4, HC.hi, HC.base, HC.dark); ctx.fill(); ol(0.045);
    ctx.fillStyle = 'rgba(210,214,170,0.35)'; P([[3.85, 0.3], [0.1, 0.4], [-1.4, 0.3], [-1.3, 0.2], [0.1, 0.28], [3.75, 0.18]]); ctx.fill();
    ctx.strokeStyle = 'rgba(20,22,14,0.45)'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(1.2, -0.36); ctx.lineTo(1.2, 0.68); ctx.moveTo(2.8, -0.37); ctx.lineTo(2.8, 0.62); ctx.stroke();
    // engine nacelle + IR-suppressed exhaust
    S([[-1.25, 0.95], [-1.45, 1.42], [-0.9, 1.78], [1.1, 1.8], [1.55, 1.42], [1.35, 1.0]]); ctx.fillStyle = vg(0.95, 1.8, HC.hi, HC.base, HC.mid); ctx.fill(); ol();
    P([[-1.2, 1.02], [-1.95, 1.2], [-2.05, 1.66], [-1.4, 1.62]]); ctx.fillStyle = HC.dark; ctx.fill(); ol(0.04);
    ctx.fillStyle = '#0e0f0c'; ctx.beginPath(); ctx.ellipse(-2.0, -1.43, 0.1, 0.22, 0.1, 0, TAU); ctx.fill();
    // cockpit: stepped tandem canopy with flat panes and thick frames
    P([[1.45, 0.98], [1.75, 2.12], [3.15, 2.12], [3.42, 1.42], [4.6, 1.32], [4.85, 0.6], [3.0, 0.86]]);
    ctx.fillStyle = HC.mid; ctx.fill(); ol();
    const glass = (pts) => {
      P(pts); const g = ctx.createLinearGradient(0, -1.95, 0.8, -0.6);
      g.addColorStop(0, '#c9d6dc'); g.addColorStop(0.25, '#5d7484'); g.addColorStop(0.55, HC.glass); g.addColorStop(1, '#46545a');
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#11140e'; ctx.lineWidth = 0.07; ctx.stroke();
    };
    glass([[1.66, 1.05], [1.9, 2.02], [2.42, 2.02], [2.36, 1.07]]);
    glass([[2.5, 1.07], [2.55, 2.02], [3.06, 2.02], [3.28, 1.24]]);
    glass([[3.44, 1.22], [3.48, 1.31], [4.5, 1.25], [4.7, 0.68], [3.55, 0.84]]);
    ctx.strokeStyle = 'rgba(255,240,210,0.6)'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(1.95, -1.95); ctx.lineTo(2.3, -1.95); ctx.moveTo(3.62, -1.2); ctx.lineTo(4.4, -1.17); ctx.stroke();
    // nose sensor turret (TADS/PNVS)
    S([[5.2, 0.05], [5.95, 0.1], [6.2, -0.3], [6.0, -0.82], [5.25, -0.85], [5.05, -0.4]]); ctx.fillStyle = vg(-0.85, 0.1, HC.light, HC.mid); ctx.fill(); ol();
    ctx.fillStyle = '#10161c'; ctx.fillRect(5.88, 0.18, 0.24, 0.38);
    ctx.fillStyle = 'rgba(160,220,255,0.6)'; ctx.fillRect(5.95, 0.24, 0.09, 0.1);
    // chin gun
    ctx.fillStyle = HC.dark; ctx.beginPath(); ctx.arc(3.7, 1.3, 0.28, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(3.7, 1.3); ctx.rotate(0.12); ctx.fillStyle = '#20221c'; ctx.fillRect(0, -0.06, 1.5, 0.12); ctx.restore();
    // stub wing + stores (rocket pod, Hellfire-like rails)
    P([[-0.35, 0.42], [1.45, 0.46], [1.55, 0.2], [-0.25, 0.14]]); ctx.fillStyle = vg(0.14, 0.46, HC.hi, HC.mid); ctx.fill(); ol(0.04);
    ctx.fillStyle = HC.dark; ctx.fillRect(0.45, -0.18, 0.25, 0.6);
    const pod = ctx.createLinearGradient(0, 0.42, 0, 0.95); pod.addColorStop(0, HC.light); pod.addColorStop(1, HC.dark);
    ctx.fillStyle = pod; ctx.beginPath(); ctx.roundRect(-0.35, 0.42, 1.8, 0.48, 0.22); ctx.fill(); ol(0.04);
    ctx.fillStyle = '#121310'; ctx.beginPath(); ctx.ellipse(1.43, 0.66, 0.06, 0.2, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 2; i++) { ctx.fillStyle = '#cfccbf'; ctx.beginPath(); ctx.roundRect(-0.2 + i * 0.06, 0.96 + i * 0.2, 1.5, 0.15, 0.075); ctx.fill(); ctx.fillStyle = '#5a5a50'; ctx.fillRect(1.15 + i * 0.06, 0.96 + i * 0.2, 0.08, 0.15); }
    // panel lines
    ctx.strokeStyle = 'rgba(20,22,14,0.55)'; ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.moveTo(-0.8, -0.9); ctx.lineTo(-0.8, 1.05); ctx.moveTo(1.6, -0.95); ctx.lineTo(1.4, 1.15); ctx.moveTo(-2.4, 0.0); ctx.lineTo(4.9, 0.1);
    ctx.moveTo(-4.5, -0.66); ctx.lineTo(-4.5, 0.14); ctx.moveTo(-6.5, -0.62); ctx.lineTo(-6.5, 0.0); ctx.stroke();
    // rim light (warm) along the top edges
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,205,140,0.55)'; ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.moveTo(-8.4, -0.64); ctx.lineTo(-2.4, -0.8); ctx.lineTo(-1.4, -1.55); ctx.lineTo(1.1, -1.62);
    ctx.moveTo(-8.6, -2.55); ctx.lineTo(-9.35, -2.6); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // ---- mast, hub, Longbow radar dome
    ctx.fillStyle = vg(1.6, 2.25, HC.base, HC.dark); ctx.fillRect(-0.18, -2.25, 0.36, 0.7);
    // ---- main rotor disc (motion blur) with 4 blurred blades
    const R = 7.3, hubY = 2.25;
    ctx.save(); ctx.translate(0, -hubY);
    ctx.save(); ctx.scale(1, elevK);
    ctx.fillStyle = radial(ctx, 0, 0, R, [[0, 'rgba(30,32,26,0.28)'], [0.85, 'rgba(30,32,26,0.16)'], [0.97, 'rgba(60,62,52,0.28)'], [1, 'rgba(60,62,52,0)']]);
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    for (let b = 0; b < 4; b++) {
      const a = t * 29 + b * Math.PI / 2;
      ctx.fillStyle = 'rgba(20,22,18,0.22)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a, a + 0.35); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(20,22,18,0.35)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a + 0.27, a + 0.35); ctx.closePath(); ctx.fill();
    }
    // tip path glint
    ctx.strokeStyle = 'rgba(255,225,170,0.25)'; ctx.lineWidth = 0.08 / elevK;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.985, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = HC.dark; ctx.beginPath(); ctx.ellipse(0, 0, 0.55, 0.22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = vg(-0.4, 0.4, HC.hi, HC.base, HC.dark); ctx.beginPath(); ctx.ellipse(0, -0.55, 0.75, 0.36, 0, 0, TAU); ctx.fill(); ol(0.04);
    ctx.restore();
    ctx.restore();
  }
  A.helicopter = helicopter;

  // ======================================================================
  // 10. Sea + frigate
  // ======================================================================
  const SEA_PAL = {
    golden: { far: '#e8b88a', mid: '#4f6e7e', near: '#173444', crest: '#ffd9a0', glint: '#fff1cc' },
    day: { far: '#bcd2e0', mid: '#3d7090', near: '#0f3550', crest: '#e8f4ff', glint: '#ffffff' },
    dawn: { far: '#e8a8a0', mid: '#4a5a78', near: '#141e36', crest: '#ffd0c0', glint: '#fff0e6' },
    night: { far: '#1e3448', mid: '#0c1824', near: '#03080e', crest: '#5a7a98', glint: '#cfe0ff' },
  };
  A.seaPalettes = SEA_PAL;
  /** sea(ctx, t, {horizonY, palette, sunX, speed}) — water from the horizon to the bottom: gradient, animated wave crests, sun glitter path. */
  function sea(ctx, t, o = {}) {
    const hy = o.horizonY != null ? o.horizonY : H * 0.55;
    const P = typeof o.palette === 'object' ? o.palette : SEA_PAL[o.palette || 'golden'] || SEA_PAL.golden;
    const sunX = o.sunX != null ? o.sunX : W * 0.6, sp = o.speed != null ? o.speed : 1;
    ctx.save();
    const g = ctx.createLinearGradient(0, hy, 0, H);
    g.addColorStop(0, rgba(P.far)); g.addColorStop(0.18, rgba(P.mid)); g.addColorStop(1, rgba(P.near));
    ctx.fillStyle = g; ctx.fillRect(0, hy, W, H - hy);
    // wave rows (perspective): each crest is anchored to an integer id, so nothing re-hashes over time
    const rows = 46;
    for (let r = 0; r < rows; r++) {
      const k = r / (rows - 1);
      const yy = hy + (H - hy) * Math.pow(k, 1.9) + 1;
      const amp = 1 + 14 * k * k, len = 16 + 170 * k * k, gap = len * (1.3 + 0.8 * hash(r, 5));
      const shift = t * (20 + 70 * k) * sp + hash(r, 6) * gap * 7;
      const id0 = Math.floor((shift - gap * 2) / gap), id1 = Math.ceil((shift + W + gap) / gap);
      ctx.beginPath();
      for (let id = id0; id <= id1; id++) {
        const x = id * gap - shift;
        const jx = (hash(id, r * 13 + 1) - 0.5) * gap * 0.5, ww = len * (0.6 + 0.6 * hash(id, r * 13 + 2));
        const yj = yy + (hash(id, r * 13 + 3) - 0.5) * amp * 2;
        ctx.moveTo(x + jx, yj); ctx.quadraticCurveTo(x + jx + ww / 2, yj - amp, x + jx + ww, yj);
      }
      ctx.strokeStyle = rgba(P.crest, 0.1 + 0.25 * (1 - k) * (1 - k) + 0.1 * k); ctx.lineWidth = 0.8 + 2.4 * k; ctx.stroke();
      ctx.strokeStyle = rgba(P.near, 0.18 + 0.2 * k); ctx.lineWidth = 0.8 + 3 * k;
      ctx.beginPath();
      for (let id = id0; id <= id1; id++) { const x = id * gap - shift; const jx = (hash(id, r * 13 + 4) - 0.5) * gap; const yj = yy + amp * 1.4; ctx.moveTo(x + jx, yj); ctx.lineTo(x + jx + len * 0.8, yj); }
      ctx.stroke();
    }
    // sun glitter path (each glint twinkles smoothly)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 260; i++) {
      const k = Math.pow(hash(i, 41), 1.6);
      const yy = hy + 2 + (H - hy) * k;
      const spread = 30 + 520 * k;
      const xx = sunX + (hash(i, 42) - 0.5) * spread * 2 * (0.4 + hash(i, 43) * 0.6) + Math.sin(t * 0.7 + i) * 6 * k;
      const tw = Math.sin(t * (3 + 5 * hash(i, 44)) + i * 2.39);
      if (tw < 0.2) continue;
      const a = (tw - 0.2) * 1.25 * (1 - Math.abs(xx - sunX) / (spread + 1)) * (o.glitter != null ? o.glitter : 1);
      const w = 4 + 30 * k * hash(i, 45);
      ctx.fillStyle = rgba(P.glint, Math.min(1, a));
      ctx.fillRect(xx - w / 2, yy, w, 1 + 2.5 * k);
    }
    ctx.globalCompositeOperation = 'source-over';
    // horizon haze line
    const hg = ctx.createLinearGradient(0, hy - 6, 0, hy + 30);
    hg.addColorStop(0, rgba(P.far, 0)); hg.addColorStop(0.3, rgba(P.far, 0.7)); hg.addColorStop(1, rgba(P.far, 0));
    ctx.fillStyle = hg; ctx.fillRect(0, hy - 6, W, 36);
    ctx.restore();
  }
  A.sea = sea;

  const SHIP_PX = 4.5;
  const SC = { hi: '#c6ccd2', light: '#a2abb4', base: '#87919b', mid: '#6b757f', dark: '#4a535c', deep: '#2b3238', line: '#1e2328', glass: '#1a2632' };
  /** ship(ctx, {x, y, scale, t, flip, wake}) — modern stealth frigate, side view, bow right. Anchor = waterline centre. scale=1 -> 135 m = 608 px. */
  function ship(ctx, o = {}) {
    const K = (o.scale != null ? o.scale : 1) * SHIP_PX, t = o.t || 0;
    ctx.save();
    ctx.translate(o.x || 0, o.y || 0);
    if (o.flip) ctx.scale(-1, 1);
    // pitch/heave on the swell
    ctx.rotate(Math.sin(t * 0.9) * 0.006);
    ctx.translate(0, Math.sin(t * 1.3) * 0.25 * K);
    ctx.scale(K, K);
    ctx.lineJoin = 'round';
    const P = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], -pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], -pts[i][1]); ctx.closePath(); };
    const vg = (y0, y1, a, b, c) => { const g = ctx.createLinearGradient(0, -y1, 0, -y0); g.addColorStop(0, a); if (c) { g.addColorStop(0.5, b); g.addColorStop(1, c); } else g.addColorStop(1, b); return g; };
    const ol = (w = 0.35) => { ctx.strokeStyle = SC.line; ctx.lineWidth = w; ctx.stroke(); };
    // reflection: dark wavy bands below the waterline
    for (let i = 0; i < 9; i++) {
      const yy = 0.6 + i * 1.3, a = 0.32 * (1 - i / 9);
      const off = Math.sin(t * 1.7 + i * 1.3) * 1.5;
      ctx.fillStyle = `rgba(12,22,30,${a})`;
      ctx.fillRect(-64 + off - i * 0.8, yy, 126 + i * 1.2, 0.8);
      if (i > 1 && i < 6) { ctx.fillStyle = `rgba(150,160,170,${a * 0.35})`; ctx.fillRect(-20 + off, yy - 0.5, 34, 0.35); }
    }
    // hull
    P([[-67, 0], [-67, 6.5], [-20, 7.2], [30, 8.2], [68, 10.2], [60, 0]]);
    ctx.fillStyle = vg(0, 10.2, SC.light, SC.base, SC.mid); ctx.fill(); ol();
    // knuckle line + boot shadow at the waterline
    ctx.strokeStyle = 'rgba(30,36,40,0.5)'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(-66, -4.2); ctx.lineTo(62, -6.2); ctx.stroke();
    ctx.fillStyle = 'rgba(20,26,30,0.55)'; ctx.fillRect(-67, -1.2, 128, 1.2);
    // deck edge highlight
    ctx.strokeStyle = 'rgba(255,236,200,0.7)'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(-67, -6.5); ctx.lineTo(-20, -7.2); ctx.lineTo(30, -8.2); ctx.lineTo(68, -10.2); ctx.stroke();
    // hangar + aft superstructure
    P([[-40, 7.0], [-38, 15.5], [-6, 16], [-4, 7.8]]); ctx.fillStyle = vg(7, 16, SC.hi, SC.base, SC.mid); ctx.fill(); ol();
    ctx.fillStyle = SC.dark; ctx.fillRect(-39, -14, 9, 6.5);
    // funnel (angled stealth)
    P([[-22, 15.6], [-20, 24], [-11, 24.5], [-8, 15.8]]); ctx.fillStyle = vg(15.6, 24.5, SC.light, SC.mid); ctx.fill(); ol();
    ctx.fillStyle = SC.deep; ctx.fillRect(-20.5, -25, 9.5, 1.3);
    // forward superstructure + bridge
    P([[-6, 8.0], [-4, 21], [16, 22], [24, 17], [28, 8.4]]); ctx.fillStyle = vg(8, 22, SC.hi, SC.base, SC.mid); ctx.fill(); ol();
    P([[-2, 21], [0, 26], [14, 26.5], [17, 21.9]]); ctx.fillStyle = vg(21, 26.5, SC.light, SC.mid); ctx.fill(); ol();
    ctx.fillStyle = SC.glass; P([[2, 23], [3, 25.3], [13.2, 25.6], [15, 23.2]]); ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,190,0.35)'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(3.4, -25); ctx.lineTo(13, -25.3); ctx.stroke();
    // integrated stealth mast with radar panels + rotating radar
    P([[2, 26.3], [5, 40], [10, 40], [12.5, 26.4]]); ctx.fillStyle = vg(26, 40, SC.hi, SC.light, SC.mid); ctx.fill(); ol();
    ctx.fillStyle = SC.dark; P([[5.2, 30], [6, 35], [9, 35], [9.8, 30]]); ctx.fill();
    ctx.fillStyle = SC.deep; ctx.fillRect(7.2, -46, 0.6, 6);
    const ra = t * 2.4, rw = 4.5 * Math.abs(Math.cos(ra)) + 0.6;
    ctx.fillStyle = Math.cos(ra) > 0 ? SC.light : SC.mid; ctx.fillRect(7.5 - rw / 2, -47.2, rw, 1.6);
    ctx.strokeStyle = SC.deep; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(9, -40); ctx.lineTo(10.5, -50); ctx.moveTo(4.5, -40); ctx.lineTo(3.2, -47); ctx.stroke();
    // VLS hatches + gun
    ctx.fillStyle = SC.mid; for (let i = 0; i < 4; i++) ctx.fillRect(30 + i * 2.2, -9.3, 1.8, 0.6);
    P([[38, 9.4], [39, 13.2], [46, 13.6], [48.5, 9.8]]); ctx.fillStyle = vg(9.4, 13.6, SC.hi, SC.base); ctx.fill(); ol(0.3);
    ctx.fillStyle = SC.dark; ctx.save(); ctx.translate(47, -11.8); ctx.rotate(-0.08); ctx.fillRect(0, -0.45, 9, 0.9); ctx.restore();
    // CIWS / small mounts, life-raft canisters, railings
    ctx.fillStyle = SC.light; ctx.fillRect(-5, -18.5, 3, 2.6); ctx.beginPath(); ctx.arc(-3.5, -19.6, 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d8dcdf'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.roundRect(-34 + i * 4.2, -17.4, 3.2, 1.6, 0.8); ctx.fill(); }
    ctx.strokeStyle = 'rgba(40,46,52,0.6)'; ctx.lineWidth = 0.18;
    ctx.beginPath(); ctx.moveTo(-67, -7.6); ctx.lineTo(-40, -8.1); ctx.moveTo(28, -9.4); ctx.lineTo(67, -11.3); ctx.stroke();
    // bow wave + foam along the waterline + wake (animated, soft puffs)
    ctx.restore();
    ctx.save();
    ctx.translate(o.x || 0, o.y || 0);
    if (o.flip) ctx.scale(-1, 1);
    const kk = K;
    const foam = puffSprite(0, '#ffffff');
    for (let i = 0; i < 30; i++) {
      const u = i / 29, xx = lerp(61, -66, u) * kk, ph = t * 5 + i * 1.9;
      const r = (1.6 + 0.6 * Math.sin(ph)) * kk * (u < 0.08 ? 2.2 : 1);
      ctx.save(); ctx.translate(xx, -0.1 * kk - (u < 0.08 ? r * 0.25 : 0)); ctx.scale(1.8, 0.55);
      drawPuff(ctx, puffSprite(i, '#ffffff'), 0, 0, r * 1.4, 0.32 + 0.18 * Math.sin(ph * 0.7) + (u < 0.1 ? 0.3 : 0), 0);
      ctx.restore();
    }
    // bow spray
    for (let i = 0; i < 8; i++) {
      const a = wrap(t * 1.6 + i / 8, 0, 1);
      drawPuff(ctx, puffSprite(i + 3, '#ffffff'), (60 + a * 6) * kk, (-1.5 - a * 3 + a * a * 4) * kk, (1.2 + a * 2) * kk, 0.6 * (1 - a) * Math.min(1, a * 6), i);
    }
    // wake: spreading foam + two V lines
    if (o.wake !== false) {
      for (let i = 0; i < 26; i++) {
        const d = wrap(i * 4.3 + t * 12, 0, 110);
        ctx.save(); ctx.translate((-67 - d) * kk, (0.3 + d * 0.025) * kk); ctx.scale(2.2, 0.45);
        drawPuff(ctx, puffSprite(i, '#f4f8fb'), 0, 0, (2.6 + d * 0.06) * kk, 0.42 * (1 - d / 110) * Math.min(1, d / 10), 0);
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(235,245,255,0.35)'; ctx.lineWidth = Math.max(1, 0.4 * kk);
      ctx.beginPath(); ctx.moveTo(-60 * kk, 0.2 * kk); ctx.lineTo(-180 * kk, 2.4 * kk); ctx.moveTo(-62 * kk, 0.9 * kk); ctx.lineTo(-170 * kk, 5.2 * kk); ctx.stroke();
    }
    void foam;
    ctx.restore();
  }
  A.ship = ship;

  // ======================================================================
  // 11. Soldier — rim-lit semi-silhouette, facing right, rifle held LOW (never aiming).
  //     Anchor = between the feet on the ground. scale=1 -> 1.8 m tall = 360 px.
  // ======================================================================
  const SOLDIER_PX = 200;
  function soldierPose(pose, t, ph) {
    // joint positions in meters (x forward/right, y up)
    if (pose === 'kneel') {
      return { hip: [-0.02, 0.58], chest: [0.06, 0.98], neck: [0.09, 1.18], head: [0.13, 1.31], kneeF: [0.36, 0.52], ankF: [0.33, 0.1], kneeB: [-0.14, 0.07], ankB: [-0.5, 0.11], toeB: [-0.6, 0.0],
        sh: [0.05, 1.12], elB: [-0.04, 0.86], hdB: [0.14, 0.76], elF: [0.3, 0.88], hdF: [0.46, 0.7], rifle: [[-0.02, 0.9], [0.78, 0.36]] };
    }
    const walk = pose === 'walk';
    const cyc = walk ? (t * 1.6 + ph) * TAU : 0;
    const sw = walk ? Math.sin(cyc) : 0, bob = walk ? (1 - Math.abs(Math.cos(cyc))) * 0.025 : 0;
    const hipY = 0.94 + bob;
    const leg = (s) => {
      const a = s * 0.4 + (walk ? 0 : 0.0);
      const knee = [Math.sin(a) * 0.45, hipY - Math.cos(a) * 0.45];
      const bend = walk ? Math.max(0, -s) * 0.75 + 0.06 : 0.03;
      const ank = [knee[0] + Math.sin(a - bend) * 0.44, Math.max(0.09, knee[1] - Math.cos(a - bend) * 0.44)];
      return [knee, ank];
    };
    const [kF, aF] = leg(sw), [kB, aB] = leg(-sw);
    const lean = walk ? 0.05 : 0.015;
    return { hip: [0, hipY], chest: [0.03 + lean, hipY + 0.32], neck: [0.05 + lean * 1.5, hipY + 0.55], head: [0.08 + lean * 1.6, hipY + 0.69],
      kneeF: kF, ankF: aF, kneeB: kB, ankB: aB, toeB: null,
      sh: [0.04 + lean, hipY + 0.49], elB: [-0.04, hipY + 0.24], hdB: [0.15, hipY + 0.1], elF: [0.25, hipY + 0.22], hdF: [0.44, hipY - 0.02],
      rifle: [[-0.06, hipY + 0.2], [0.8, hipY - 0.42]] };
  }
  // tapered organic limb from joint A to B: prof = [[u, halfWidthLeft, halfWidthRight], ...] (left = +normal)
  function limb(g, A, B, prof) {
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1e-6;
    const nx = -dy / L, ny = dx / L;
    const pts = [];
    for (const [u, wl] of prof) pts.push([A[0] + dx * u + nx * wl, A[1] + dy * u + ny * wl]);
    for (let i = prof.length - 1; i >= 0; i--) { const [u, , wr] = prof[i]; pts.push([A[0] + dx * u - nx * wr, A[1] + dy * u - ny * wr]); }
    const sm = crLoop(pts, 3);
    g.beginPath(); g.moveTo(sm[0][0], -sm[0][1]); for (let i = 1; i < sm.length; i++) g.lineTo(sm[i][0], -sm[i][1]); g.closePath(); g.fill();
  }
  function soldierShape(g, J, flipLeg) {
    const P = (pts) => { const sm = crLoop(pts, 3); g.beginPath(); g.moveTo(sm[0][0], -sm[0][1]); for (let i = 1; i < sm.length; i++) g.lineTo(sm[i][0], -sm[i][1]); g.closePath(); g.fill(); };
    const boot = (ank, knee, back) => {
      const a = Math.atan2(ank[1] - knee[1], ank[0] - knee[0]) + Math.PI / 2; // shin direction tilt
      const c = Math.cos(a * 0.35), sn = Math.sin(a * 0.35);
      const T = (x, y) => [ank[0] + x * c - y * sn, Math.max(0, ank[1] + x * sn + y * c)];
      if (back && J.toeB) { P([[ank[0] + 0.05, ank[1] + 0.06], [ank[0] - 0.02, ank[1] + 0.08], [J.toeB[0] - 0.05, J.toeB[1] + 0.03], [J.toeB[0], J.toeB[1]], [ank[0] + 0.06, ank[1] - 0.05]]); return; }
      P([T(-0.07, 0.08), T(0.06, 0.07), T(0.1, -0.02), T(0.2, -0.05), T(0.21, -0.09), T(-0.08, -0.09)]);
    };
    // back leg + boot
    limb(g, J.hip, J.kneeB, [[0, 0.1, 0.1], [0.4, 0.095, 0.085], [1, 0.07, 0.065]]);
    limb(g, J.kneeB, J.ankB, [[0, 0.07, 0.065], [0.35, 0.06, 0.075], [1, 0.05, 0.045]]);
    boot(J.ankB, J.kneeB, true);
    // back arm
    limb(g, J.sh, J.elB, [[0, 0.065, 0.07], [1, 0.05, 0.055]]);
    limb(g, J.elB, J.hdB, [[0, 0.05, 0.05], [0.85, 0.042, 0.04], [1, 0.03, 0.03]]);
    g.beginPath(); g.arc(J.hdB[0], -J.hdB[1], 0.045, 0, TAU); g.fill();
    // rifle at low ready (muzzle toward the ground)
    const [r0, r1] = J.rifle; const rv = [r1[0] - r0[0], r1[1] - r0[1]], rl = Math.hypot(rv[0], rv[1]);
    g.save(); g.translate(r0[0], -r0[1]); g.rotate(-Math.atan2(rv[1], rv[0]));
    g.beginPath(); g.moveTo(-0.02, -0.05); g.lineTo(0.2 * rl, -0.045); g.lineTo(0.22 * rl, -0.06); g.lineTo(0.68 * rl, -0.045); g.lineTo(0.7 * rl, -0.02); g.lineTo(rl, -0.016);
    g.lineTo(rl, 0.016); g.lineTo(0.7 * rl, 0.02); g.lineTo(0.68 * rl, 0.04); g.lineTo(0.32 * rl, 0.045);
    g.lineTo(0.31 * rl, 0.17); g.lineTo(0.25 * rl, 0.16); g.lineTo(0.255 * rl, 0.05); g.lineTo(0.17 * rl, 0.05); g.lineTo(0.15 * rl, 0.12); g.lineTo(0.12 * rl, 0.115); g.lineTo(0.12 * rl, 0.05); g.lineTo(0.0, 0.07); g.closePath(); g.fill();
    g.fillRect(0.25 * rl, -0.1, 0.11 * rl, 0.05); // optic
    g.restore();
    // torso: body + plate carrier + pack
    const hx = J.hip[0], hy = J.hip[1], cx = J.chest[0], cy = J.chest[1], nx = J.neck[0], ny = J.neck[1];
    P([[hx - 0.12, hy - 0.04], [hx - 0.15, hy + 0.12], [cx - 0.17, cy], [nx - 0.13, ny - 0.02], [nx - 0.02, ny + 0.03], [nx + 0.1, ny - 0.02], [cx + 0.16, cy + 0.02], [cx + 0.14, cy - 0.16], [hx + 0.15, hy + 0.04], [hx + 0.12, hy - 0.08]]);
    P([[cx - 0.2, cy + 0.17], [cx - 0.33, cy + 0.12], [cx - 0.34, cy - 0.2], [cx - 0.22, cy - 0.26], [cx - 0.15, cy - 0.12]]); // pack
    P([[cx + 0.12, cy + 0.15], [cx + 0.2, cy + 0.12], [cx + 0.22, cy - 0.12], [cx + 0.18, cy - 0.24], [cx + 0.1, cy - 0.22]]); // chest rig pouches
    // head, helmet, NVG mount, ear cup
    const hdx = J.head[0], hdy = J.head[1];
    P([[hdx - 0.08, hdy - 0.1], [hdx + 0.06, hdy - 0.12], [hdx + 0.1, hdy - 0.05], [hdx + 0.125, hdy - 0.0], [hdx + 0.1, hdy + 0.06], [hdx - 0.1, hdy + 0.06]]); // face/head
    P([[hdx - 0.15, hdy + 0.0], [hdx - 0.13, hdy + 0.1], [hdx - 0.03, hdy + 0.16], [hdx + 0.09, hdy + 0.13], [hdx + 0.14, hdy + 0.05], [hdx + 0.13, hdy + 0.02], [hdx - 0.12, hdy - 0.02]]);
    g.fillRect(hdx + 0.09, -(hdy + 0.1), 0.07, 0.05);
    g.beginPath(); g.ellipse(hdx - 0.03, -(hdy - 0.01), 0.055, 0.065, 0, 0, TAU); g.fill();
    // front leg + boot, front arm (over the rifle)
    limb(g, J.hip, J.kneeF, [[0, 0.1, 0.1], [0.4, 0.095, 0.088], [1, 0.07, 0.066]]);
    limb(g, J.kneeF, J.ankF, [[0, 0.07, 0.066], [0.35, 0.06, 0.078], [1, 0.05, 0.046]]);
    g.beginPath(); g.arc(J.kneeF[0] + 0.035, -J.kneeF[1], 0.065, 0, TAU); g.fill(); // knee pad
    boot(J.ankF, J.kneeF, false);
    limb(g, J.sh, J.elF, [[0, 0.07, 0.07], [1, 0.052, 0.055]]);
    limb(g, J.elF, J.hdF, [[0, 0.052, 0.05], [0.85, 0.044, 0.042], [1, 0.032, 0.032]]);
    g.beginPath(); g.arc(J.hdF[0], -J.hdF[1], 0.047, 0, TAU); g.fill();
    void flipLeg;
  }
  /** soldier(ctx, {x, y, scale, pose:'stand'|'walk'|'kneel', t, flip, rim, color, phase, rimWidth}) */
  function soldier(ctx, o = {}) {
    const K = (o.scale != null ? o.scale : 1) * SOLDIER_PX, t = o.t || 0;
    const J = soldierPose(o.pose || 'stand', t, o.phase || 0);
    const body = o.color || '#241e19', rim = o.rim || '#ffcf8a';
    ctx.save();
    ctx.translate(o.x || 0, o.y || 0);
    if (o.flip) ctx.scale(-1, 1);
    ctx.scale(K, K);
    // contact shadow
    ctx.fillStyle = radial(ctx, 0.05, 0, 0.6, [[0, 'rgba(20,12,6,0.45)'], [1, 'rgba(20,12,6,0)']]);
    ctx.save(); ctx.scale(1, 0.12); ctx.beginPath(); ctx.arc(0.05 / 1, 0, 0.6, 0, TAU); ctx.restore(); ctx.fill();
    // rim pass (offset toward the light: up-left), then the dark body
    const ro = (o.rimWidth || 2.4) / K;
    ctx.fillStyle = rim;
    ctx.save(); ctx.translate(-ro, -ro * 0.8); soldierShape(ctx, J); ctx.restore();
    ctx.fillStyle = body;
    soldierShape(ctx, J);
    // subtle warm bounce on the lower front (ground light)
    ctx.restore();
  }
  A.soldier = soldier;

  // ======================================================================
  // 12. Radar dish + missile
  // ======================================================================
  /** radarDish(ctx, {x, y, scale, angle, t, beam}) — ground radar on a shelter. angle = azimuth (rad, 0 = facing the camera). Anchor = ground centre. scale=1 -> ~380 px tall. */
  function radarDish(ctx, o = {}) {
    const K = (o.scale != null ? o.scale : 1) * 100, ang = o.angle != null ? o.angle : (o.t || 0) * 1.2;
    ctx.save(); ctx.translate(o.x || 0, o.y || 0); ctx.scale(K, K);
    const vg = (y0, y1, a, b) => { const g = ctx.createLinearGradient(0, -y1, 0, -y0); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
    ctx.fillStyle = 'rgba(20,14,8,0.4)'; ctx.beginPath(); ctx.ellipse(0, 0, 2.0, 0.12, 0, 0, TAU); ctx.fill();
    // trailer chassis + wheels
    ctx.fillStyle = '#2e281e'; ctx.fillRect(-1.75, -0.42, 3.5, 0.14);
    for (const wx of [-1.15, -0.55, 0.95]) { ctx.fillStyle = '#1c1a16'; ctx.beginPath(); ctx.arc(wx, -0.24, 0.24, 0, TAU); ctx.fill(); ctx.fillStyle = '#6a604c'; ctx.beginPath(); ctx.arc(wx, -0.24, 0.1, 0, TAU); ctx.fill(); }
    // shelter body with panels, louvres, door, roof rail
    ctx.fillStyle = vg(0.42, 1.6, '#d2bd94', '#7d6c50'); ctx.fillRect(-1.6, -1.6, 3.2, 1.18);
    ctx.strokeStyle = '#2e2618'; ctx.lineWidth = 0.03; ctx.strokeRect(-1.6, -1.6, 3.2, 1.18);
    ctx.strokeStyle = 'rgba(46,38,24,0.5)'; ctx.lineWidth = 0.02;
    ctx.beginPath(); for (const px of [-0.8, 0.0, 0.8]) { ctx.moveTo(px, -1.58); ctx.lineTo(px, -0.44); } ctx.stroke();
    ctx.fillStyle = vg(0.5, 1.4, '#a8946c', '#5e5038'); ctx.fillRect(-1.45, -1.42, 0.55, 0.92); // door
    ctx.strokeStyle = '#2e2618'; ctx.strokeRect(-1.45, -1.42, 0.55, 0.92);
    ctx.fillStyle = '#2a2418'; ctx.fillRect(-1.0, -1.0, 0.06, 0.12);
    ctx.fillStyle = '#3a3226'; for (let i = 0; i < 6; i++) ctx.fillRect(0.95, -1.4 + i * 0.1, 0.5, 0.045); // louvres
    ctx.fillStyle = '#e6d6b0'; ctx.fillRect(-1.6, -1.63, 3.2, 0.05);
    ctx.strokeStyle = '#4a4030'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(-1.5, -1.63); ctx.lineTo(-1.5, -1.78); ctx.lineTo(1.5, -1.78); ctx.lineTo(1.5, -1.63); ctx.stroke();
    // blinking beacon (smooth pulse)
    const bl = 0.5 + 0.5 * Math.sin((o.t || 0) * 5);
    ctx.fillStyle = '#5a1a10'; ctx.beginPath(); ctx.arc(1.3, -1.86, 0.07, 0, TAU); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 1.3, -1.86, 0.35, '#ff5a3a', bl * 0.9); ctx.restore();
    // mast with turntable + cable
    ctx.fillStyle = vg(1.6, 2.9, '#a99878', '#5c5040'); ctx.fillRect(-0.12, -2.9, 0.24, 1.3);
    ctx.fillStyle = '#4a4030'; ctx.fillRect(-0.3, -2.0, 0.6, 0.12); ctx.fillRect(-0.22, -2.95, 0.44, 0.1);
    ctx.strokeStyle = '#1e1a14'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(0.12, -1.7); ctx.quadraticCurveTo(0.5, -1.9, 0.14, -2.3); ctx.stroke();
    // dish: ellipse whose width follows cos(azimuth)
    const c = Math.cos(ang), sn = Math.sin(ang), R = 1.3, cy = -3.35;
    const w = Math.max(0.08, Math.abs(c)) * R;
    ctx.save(); ctx.translate(0, cy);
    if (c >= 0) {
      ctx.fillStyle = radial(ctx, sn * 0.3, -0.2, R * 1.2, [[0, '#f4ead4'], [0.6, '#bfb090'], [1, '#6e624c']]);
      ctx.beginPath(); ctx.ellipse(0, 0, w, R, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3a3226'; ctx.lineWidth = 0.05; ctx.stroke();
      // feed horn struts toward the camera, offset by azimuth
      const fx = sn * 0.9;
      ctx.strokeStyle = '#4a4030'; ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.moveTo(-w * 0.9, 0); ctx.lineTo(fx, 0.05); ctx.moveTo(w * 0.9, 0); ctx.lineTo(fx, 0.05); ctx.moveTo(0, -R * 0.9); ctx.lineTo(fx, 0.05); ctx.stroke();
      ctx.fillStyle = '#2e2820'; ctx.beginPath(); ctx.arc(fx, 0.05, 0.1, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = radial(ctx, -0.3, -0.4, R * 1.3, [[0, '#a89878'], [1, '#4a4030']]);
      ctx.beginPath(); ctx.ellipse(0, 0, w, R, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2a2418'; ctx.lineWidth = 0.05; ctx.stroke();
      ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(0, R); ctx.moveTo(-w, 0); ctx.lineTo(w, 0); ctx.stroke();
      ctx.fillStyle = '#3a3226'; ctx.fillRect(-0.15, -0.15, 0.3, 0.3);
    }
    ctx.restore();
    // rim light
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,214,150,0.4)'; ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.ellipse(0, cy, w, R, 0, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    ctx.restore();
    if (o.beam) {
      // scanning beam: its horizontal reach follows sin(azimuth) continuously (no flips)
      const sn2 = Math.sin(ang), reach = 900 * (o.scale || 1);
      const a = o.beam * Math.abs(sn2);
      if (a > 0.01) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const bx = (o.x || 0), by = (o.y || 0) + cy * K;
        const ex = bx + sn2 * reach, ey = by - reach * 0.32;
        const g = ctx.createLinearGradient(bx, by, ex, ey);
        g.addColorStop(0, `rgba(124,255,178,${0.4 * a})`); g.addColorStop(1, 'rgba(124,255,178,0)');
        const wdt = reach * (0.12 + 0.1 * (1 - Math.abs(sn2)));
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey - wdt); ctx.lineTo(ex, ey + wdt); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }
  A.radarDish = radarDish;

  /** missile(ctx, {x, y, angle, scale, flame, t}) — side profile, points along `angle`. Anchor = missile centre. scale=1 -> 220 px long. */
  function missile(ctx, o = {}) {
    const s = o.scale != null ? o.scale : 1, L = 220 * s, r = 9 * s, t = o.t || 0, fl = o.flame != null ? o.flame : 1;
    ctx.save(); ctx.translate(o.x || 0, o.y || 0); ctx.rotate(o.angle || 0);
    // exhaust
    if (fl > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const f = 0.85 + 0.15 * noise1(t * 30, 9);
      glow(ctx, -L / 2, 0, r * 6 * fl, '#ff9a40', 0.6 * fl);
      for (let i = 0; i < 8; i++) { const u = i / 7; ctx.save(); ctx.translate(-L / 2 - u * L * 0.55 * f * fl, 0); ctx.scale(1.8, 1); glow(ctx, 0, 0, r * (1.6 - u), u < 0.3 ? '#ffffff' : '#ffb060', fl * (1 - u) * 0.8); ctx.restore(); }
      ctx.globalCompositeOperation = 'source-over';
    }
    const bg = ctx.createLinearGradient(0, -r, 0, r);
    bg.addColorStop(0, '#9aa0a6'); bg.addColorStop(0.3, '#ffffff'); bg.addColorStop(0.6, '#d6dadd'); bg.addColorStop(1, '#6a7076');
    // fins (rear) and canards (front)
    ctx.fillStyle = '#9ca2a8';
    ctx.beginPath(); ctx.moveTo(-L * 0.5, -r); ctx.lineTo(-L * 0.47, -r * 3.2); ctx.lineTo(-L * 0.36, -r * 3.2); ctx.lineTo(-L * 0.3, -r); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-L * 0.5, r); ctx.lineTo(-L * 0.47, r * 3.2); ctx.lineTo(-L * 0.36, r * 3.2); ctx.lineTo(-L * 0.3, r); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(L * 0.18, -r); ctx.lineTo(L * 0.22, -r * 2.1); ctx.lineTo(L * 0.27, -r * 2.1); ctx.lineTo(L * 0.28, -r); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(L * 0.18, r); ctx.lineTo(L * 0.22, r * 2.1); ctx.lineTo(L * 0.27, r * 2.1); ctx.lineTo(L * 0.28, r); ctx.closePath(); ctx.fill();
    // body + nose
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.moveTo(-L * 0.5, -r); ctx.lineTo(L * 0.32, -r); ctx.quadraticCurveTo(L * 0.47, -r * 0.9, L * 0.5, 0); ctx.quadraticCurveTo(L * 0.47, r * 0.9, L * 0.32, r); ctx.lineTo(-L * 0.5, r); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2a2e32'; ctx.lineWidth = Math.max(0.8, 1.2 * s); ctx.stroke();
    // seeker window + bands
    ctx.fillStyle = '#3a4048'; ctx.beginPath(); ctx.moveTo(L * 0.42, -r * 0.55); ctx.quadraticCurveTo(L * 0.49, -r * 0.3, L * 0.5, 0); ctx.quadraticCurveTo(L * 0.49, r * 0.3, L * 0.42, r * 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(40,46,52,0.5)'; ctx.fillRect(L * 0.3, -r, L * 0.012, r * 2); ctx.fillRect(-L * 0.1, -r, L * 0.01, r * 2);
    ctx.fillStyle = '#c8a24a'; ctx.fillRect(L * 0.1, -r, L * 0.03, r * 2); // gold band (generic)
    ctx.restore();
  }
  A.missile = missile;

  // export utilities for scenes
  A.util = { smooth, fract, wrap, rgb, rgba, mix, mixs, shade, canvas, scratch, noise2, fbm2, radial, glow, tinted, glowOf };
  A._SPR = SPR;

  A.init = async function () {
    SPR.glow = glowSprite('#ffffff', 128, 2.2);
    SPR.puff = []; for (let i = 0; i < PUFF_N; i++) SPR.puff.push(buildPuff(i));
    SPR.fire = []; for (let i = 0; i < 4; i++) SPR.fire.push(buildFire(i));
    flagTexture();
    for (let i = 0; i < CLOUD_N; i++) cloudSprite(i, 'golden', 0);
    // most-used jet sprites; every other (view, flip, light) combination is built lazily on first use (~250 ms once per page)
    for (const v of ['side', 'front34', 'rear34']) jetSprite(v, false, 'golden');
  };
})();
