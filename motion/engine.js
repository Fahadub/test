/*
 * Deterministic motion-graphics engine.
 * Every frame is a pure function of time t (seconds). No state is carried
 * between frames, so frames can be rendered in any order / in parallel.
 */
(function () {
  const W = 1920, H = 1080, FPS = 30, DURATION = 67;

  // ---------- math ----------
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const invLerp = (a, b, v) => (v - a) / (b - a);
  // progress of t inside [a,b] clamped to 0..1
  const prog = (t, a, b) => clamp(invLerp(a, b, t));
  // 0 -> 1 -> 0 envelope: fades in over [a, a+fi], holds, fades out over [b-fo, b]
  const env = (t, a, b, fi = 0.3, fo = 0.3) =>
    t < a || t > b ? 0 : Math.min(fi > 0 ? clamp((t - a) / fi) : 1, fo > 0 ? clamp((b - t) / fo) : 1);

  const ease = {
    linear: (x) => x,
    inQuad: (x) => x * x,
    outQuad: (x) => 1 - (1 - x) * (1 - x),
    inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
    inCubic: (x) => x * x * x,
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outQuart: (x) => 1 - Math.pow(1 - x, 4),
    inExpo: (x) => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
    outExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inOutExpo: (x) =>
      x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
    outBack: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
    outElastic: (x) => x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
  };

  // ---------- deterministic randomness ----------
  // hash(n, seed) -> [0,1). Use instead of Math.random().
  function hash(n, seed = 0) {
    let x = (n | 0) * 374761393 + (seed | 0) * 668265263;
    x = (x ^ (x >>> 13)) * 1274126177;
    x = x ^ (x >>> 16);
    return (x >>> 0) / 4294967296;
  }
  // seeded PRNG generator (mulberry32). Create it fresh inside draw() with a constant seed.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // smooth 1D value noise in [-1,1]
  function noise1(x, seed = 0) {
    const i = Math.floor(x), f = x - i;
    const u = f * f * (3 - 2 * f);
    return lerp(hash(i, seed), hash(i + 1, seed), u) * 2 - 1;
  }
  // camera shake offset; intensity in px
  function shake(t, intensity, freq = 18, seed = 7) {
    return { x: noise1(t * freq, seed) * intensity, y: noise1(t * freq, seed + 99) * intensity, r: noise1(t * freq * 0.7, seed + 7) * intensity * 0.0006 };
  }

  // ---------- drawing helpers ----------
  const FONTS = {
    arabic: "'Cairo', 'Noto Sans Arabic', sans-serif",       // clean modern Arabic (400/700/900)
    kufi: "'Reem Kufi', 'Cairo', sans-serif",               // geometric military-looking Arabic headline (400-700)
    naskh: "'Amiri', serif",                                 // classical calligraphic Arabic (700) — flag shahada
    latin: "'Oswald', 'Cairo', sans-serif",                  // condensed latin / digits for HUD (200-700)
  };

  /**
   * Draw (Arabic) text. opts: {size, family:'arabic'|'kufi'|'naskh'|'latin', weight, color, align,
   * baseline, glow (px), glowColor, stroke (px), strokeColor, alpha, letterSpacing (px), shadow}
   */
  function text(ctx, str, x, y, opts = {}) {
    const o = Object.assign({ size: 64, family: 'arabic', weight: 700, color: '#fff', align: 'center', baseline: 'middle', alpha: 1 }, opts);
    if (o.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= o.alpha;
    ctx.font = `${o.weight} ${o.size}px ${FONTS[o.family] || o.family}`;
    ctx.textAlign = o.align;
    ctx.textBaseline = o.baseline;
    ctx.direction = /[؀-ۿ]/.test(str) ? 'rtl' : 'ltr';
    if (o.letterSpacing) ctx.letterSpacing = o.letterSpacing + 'px';
    ctx.wordSpacing = (o.wordSpacing != null ? o.wordSpacing : o.family === 'kufi' ? o.size * 0.22 : 0) + 'px';
    if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = o.shadow; ctx.shadowOffsetY = o.shadow * 0.25; }
    if (o.glow) { ctx.shadowColor = o.glowColor || o.color; ctx.shadowBlur = o.glow; }
    if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.stroke; ctx.strokeStyle = o.strokeColor || '#000'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = o.color;
    ctx.fillText(str, x, y);
    if (o.glow) ctx.fillText(str, x, y); // double pass = stronger glow
    ctx.restore();
  }
  function measure(ctx, str, opts = {}) {
    ctx.save();
    ctx.font = `${opts.weight || 700} ${opts.size || 64}px ${FONTS[opts.family || 'arabic'] || opts.family}`;
    ctx.direction = /[؀-ۿ]/.test(str) ? 'rtl' : 'ltr';
    if (opts.letterSpacing) ctx.letterSpacing = opts.letterSpacing + 'px';
    ctx.wordSpacing = (opts.wordSpacing != null ? opts.wordSpacing : opts.family === 'kufi' ? (opts.size || 64) * 0.22 : 0) + 'px';
    const m = ctx.measureText(str).width;
    ctx.restore();
    return m;
  }
  // Western digits -> Arabic-Indic digits ("7" -> "٧")
  const arDigits = (s) => String(s).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

  function vignette(ctx, strength = 0.55, inner = 0.45) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * inner, W / 2, H / 2, H * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  function fill(ctx, color, alpha = 1) {
    if (alpha <= 0) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  }

  // ---------- film grain (pre-baked tile, offset by frame) ----------
  let grainTile = null;
  function makeGrain() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d'); const img = g.createImageData(256, 256); const r = rng(1234);
    for (let i = 0; i < img.data.length; i += 4) { const v = (r() * 255) | 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); grainTile = c;
  }
  function grain(ctx, t, amount = 0.05) {
    if (!grainTile) makeGrain();
    const f = Math.round(t * FPS);
    const ox = hash(f, 3) * 256, oy = hash(f, 4) * 256;
    ctx.save(); ctx.globalAlpha = amount; ctx.globalCompositeOperation = 'overlay';
    for (let x = -ox; x < W; x += 256) for (let y = -oy; y < H; y += 256) ctx.drawImage(grainTile, x, y);
    ctx.restore();
  }

  // ---------- scene registry & compositor ----------
  const scenes = [];
  /**
   * registerScene({id, start, end, fadeIn=0, fadeOut=0, z=0, draw(ctx, lt, t, M)})
   * lt = local time (t - start). Scene may overlap neighbours for crossfades.
   */
  function registerScene(s) {
    scenes.push(Object.assign({ fadeIn: 0, fadeOut: 0, z: 0 }, s));
    scenes.sort((a, b) => a.start - b.start || a.z - b.z);
  }

  let canvas, ctx, layer, lctx;
  function setup() {
    canvas = document.getElementById('stage');
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    layer = document.createElement('canvas'); layer.width = W; layer.height = H;
    lctx = layer.getContext('2d');
  }

  const errors = [];
  function renderAt(t) {
    if (!ctx) setup();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    for (const s of scenes) {
      if (t < s.start || t >= s.end) continue;
      const lt = t - s.start;
      const a = Math.min(s.fadeIn > 0 ? clamp(lt / s.fadeIn) : 1, s.fadeOut > 0 ? clamp((s.end - t) / s.fadeOut) : 1);
      if (a <= 0) continue;
      const target = a < 1 ? lctx : ctx;
      if (a < 1) { lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalAlpha = 1; lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, W, H); }
      target.save();
      try { s.draw(target, lt, t, M); }
      catch (e) {
        errors.push(`${s.id}@${t.toFixed(2)}: ${e && e.stack || e}`);
        target.restore(); target.save(); target.setTransform(1, 0, 0, 1, 0, 0);
        target.fillStyle = '#f00'; target.font = '32px monospace'; target.fillText(`ERROR in ${s.id}: ${e && e.message}`, 40, 60);
      }
      target.restore();
      if (a < 1) { ctx.save(); ctx.globalAlpha = a; ctx.drawImage(layer, 0, 0); ctx.restore(); }
    }
    // global finishing
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    vignette(ctx, 0.45, 0.5);
    grain(ctx, t, 0.06);
    // global fade from / to black
    fill(ctx, '#000', 1 - prog(t, 0, 0.4));
    fill(ctx, '#000', prog(t, DURATION - 0.6, DURATION));
  }

  function snapshot(type = 'image/jpeg', q = 0.93) { return canvas.toDataURL(type, q); }

  const M = {
    W, H, FPS, DURATION,
    clamp, lerp, invLerp, prog, env, ease, hash, rng, noise1, shake,
    FONTS, text, measure, arDigits, vignette, fill, roundRect, grain,
    registerScene, scenes, renderAt, snapshot, errors,
    assets: {},
    ready: false,
  };
  window.M = M;

  async function boot() {
    setup();
    const fams = ["900 40px 'Cairo'", "700 40px 'Cairo'", "400 40px 'Cairo'", "700 40px 'Reem Kufi'", "700 40px 'Amiri'", "700 40px 'Oswald'", "500 40px 'Oswald'"];
    await Promise.all(fams.map((f) => document.fonts.load(f, 'ابجد 0123 ٧')));
    await document.fonts.ready;
    if (M.assets.init) await M.assets.init();
    M.ready = true;
    const q = new URLSearchParams(location.search);
    if (q.has('t')) renderAt(parseFloat(q.get('t')));
    else if (q.has('play')) {
      const t0 = performance.now();
      const loop = () => { const t = ((performance.now() - t0) / 1000) % DURATION; renderAt(t); requestAnimationFrame(loop); };
      loop();
    } else renderAt(0);
  }
  window.addEventListener('load', boot);
})();
