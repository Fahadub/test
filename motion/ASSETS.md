# M.assets — shared drawing library

`assets.js` attaches everything to `M.assets` (alias it: `const A = M.assets;`).
Load order: `engine.js` → `assets.js` → scenes. `M.assets.init()` is awaited by the engine before the first
frame; it pre-builds sprites (≈3 s). Everything is deterministic: every draw is a pure function of its
arguments (`t` / `age`); caches only hold t-independent content (sprites, textures, meshes, static skies).

**Conventions (all assets)**
- `ctx` is the scene's 2D context; every function wraps its work in `save()/restore()` and leaves the
  context state unchanged. Your current transform is respected (you can `translate/rotate/scale` first).
- Unless stated, `scale = 1` is the documented reference size; `flip:true` mirrors horizontally around the anchor.
- Lighting is baked for a **golden-hour sun on the left / behind** with warm rim light on top edges.
  Where a `light` / `palette` / `tint` / `preset` option exists, pick the same family across a shot
  (`golden`, `dawn`, `day`, `night`).
- Arabic text is only drawn via `M.text` (the flag's Shahada uses Amiri, `family:'naskh'`).
- Cost column = measured render time per call on the preview machine (1080p, software canvas), so you can budget
  the 120 ms/frame limit. A full golden-hour backdrop (sky + clouds + 5 dune layers) costs ≈ 30 ms.

## Gallery

- Page: `gallery.html` (engine + assets + `gallery_scene.js`), 13 segments of 2 s each (0–26 s).
- Render: `node tools/preview.cjs --page gallery.html --range 1:25:2 --sheet --out preview/assets/gallery`
- Screenshots: `preview/assets/gallery/sheet.jpg` (contact sheet) and per segment
  `preview/assets/gallery/t_001.000.png` … `t_025.000.png`:

| t (s) | file | shows |
|---|---|---|
| 1 | `t_001.000.png` | `jet` side / top / front34 / rear34, `sky('dawn')`, `clouds('dawn')`, afterburners |
| 3 | `t_003.000.png` | `tank` column (3 sizes) with `dustPlume`, `dunes('golden')` |
| 5 | `t_005.000.png` | `helicopter` ×2, `soldier` stand/walk/kneel/flip, `radarDish` + beam, rotor wash dust |
| 7 | `t_007.000.png` | `ship` ×2 on `sea`, `missile`, clouds |
| 9 | `t_009.000.png` | `flag` close-up + medium, `lightRays`, `embers` |
| 11 | `t_011.000.png` | `explosion` ages 0.08/0.35/0.9/2.2 s, `muzzleFlash` ages, ground `shockwave` |
| 13 | `t_013.000.png` | `smokeTrail` green/white airshow ribbons, `lensFlare`, `lightRays`, `embers`, `hudBracket`, `scanlines` |
| 15 | `t_015.000.png` | `sky('night', stars)`, `cloudDeck('night')`, `jet(light:'night')`, `motionStreaks` |
| 17 | `t_017.000.png` | `jet3d` banking (hq + fast), `cloudDeck('golden')` |
| 19 | `t_019.000.png` | `jet` at scale 3.8 (frame-filling flyby), `M.shake`, `motionStreaks` |
| 21 | `t_021.000.png` | `tank` recoil + `tankMuzzle` + `muzzleFlash` + distant `explosion`, `flagFlat` |
| 23 | `t_023.000.png` | close-up: `tank` scale 1.75, `helicopter` scale 1.5 |
| 25 | `t_025.000.png` | close-up: `soldier` scale 2.4/2.2, `radarDish` 1.3, `missile` 2.2 |

---

## Environment

### `sky(ctx, {preset, top, mid, horizon, haze, sunColor, glowColor, horizonY, sunX, sunY, sunR, glow, stars, t, cache})`
Full-screen sky (fills the whole 1920×1080 frame; below `horizonY` it continues as haze for dunes/sea to cover).
- `preset`: `'golden'` (default) · `'dawn'` · `'day'` · `'dusk'` · `'night'` (see `A.skyPresets`). `top/mid/horizon/haze` override colours.
- `horizonY` (default 670), `sunX/sunY` (sun centre, px), `sunR` (disc radius px, default 60, `0` = no sun), `glow` bloom strength (default 1).
- `stars:true|count` + `t` → twinkling stars (night). Skies without stars are cached (LRU of 6) — same pixels, ~1 ms instead of ~12 ms. `cache:false` disables.
- Cost ≈ 1 ms cached (12 ms uncached/animated sun).
```js
A.sky(ctx, { preset: 'golden', horizonY: 640, sunX: 1400, sunY: 520, sunR: 55 });
```

### `clouds(ctx, t, {seed, count, y0, y1, speed, scale, tint, alpha, xMin, xMax})`
Soft volumetric cumulus sprites (density field + light marching, lit from upper-left, silver lining).
Clouds drift **left** at `speed` px/s × their depth (0.35…1) → built-in parallax; call several times with
different `seed/scale/speed` for layered depth. Positions wrap seamlessly off-screen.
- Sprite at `scale=1`: ≈ 720×360 px … 950 px wide for near clouds. `y0..y1` = band of cloud centres.
- `tint`: `'golden'` · `'dawn'` · `'day'` · `'night'` · `'storm'` or `{light, mid, shade, rim, amb}` (first use of a new tint builds 8 sprites ≈ 0.3 s).
- Cost ≈ 7 ms for 8 clouds.
```js
A.clouds(ctx, t, { seed: 2, count: 9, y0: 140, y1: 460, speed: 40, scale: 1, tint: 'golden' });
```

### `cloudDeck(ctx, t, {y, depth, speed, tint, seed, alpha})`
A sea of cloud tops seen from above (for "jets over clouds"): 4 seamless tiled rows in perspective from `y`
(far edge) to `y+depth` (default: to the bottom of the frame), scrolling left at `speed` px/s (near rows faster).
Cost ≈ 20 ms.
```js
A.sky(ctx, { preset: 'golden', horizonY: 700, sunX: 1600, sunY: 560 });
A.cloudDeck(ctx, t, { y: 660, tint: 'golden', speed: 260 });
```

### `dunes(ctx, t, {horizonY, layers, palette, scroll, seed, light, amp, bottom})`
Layered sand dunes from `horizonY` to `bottom` (default 1080): far layers hazy/low-contrast, near layers with
lit windward faces, sharp crest highlights, shadowed lee (slip) faces, sand ripples; foreground darkening.
- `layers` (default 5), `scroll` = px/s of the nearest layer (terrain moves left; farther layers slower = parallax),
  `light: 1` sun on the left (default) / `-1` sun on the right, `amp` height multiplier (default 1).
- `palette`: `'golden'` · `'dawn'` · `'day'` · `'dusk'` · `'night'` or `{light, mid, shadow, deep, haze, crest}` (`A.dunePalettes`).
- Cost ≈ 22 ms (5 layers).
```js
A.dunes(ctx, t, { horizonY: 640, layers: 5, scroll: 120, seed: 3, palette: 'golden' });
```

### `sea(ctx, t, {horizonY, palette, sunX, speed, glitter})`
Water from `horizonY` to the bottom: depth gradient, perspective wave crests (anchored, no popping), smoothly
twinkling sun-glitter path under `sunX`, horizon haze. `palette`: `'golden'` · `'day'` · `'dawn'` · `'night'` (`A.seaPalettes`). Cost ≈ 11 ms.
```js
A.sky(ctx, { preset: 'golden', horizonY: 600, sunX: 1300, sunY: 470 });
A.sea(ctx, t, { horizonY: 600, sunX: 1300 });
```

---

## Aircraft

### `jet(ctx, {x, y, scale, rot, view, afterburner, t, flip, light, alpha})`  — HERO
F-15-like twin-tail air-superiority fighter built as a real 3D model (lofted fuselage, raked rectangular
intakes beside the cockpit with dark mouths, swept trapezoid wings with cropped tips, stabilators, **twin vertical
tails**, twin nozzles, bubble canopy with reflections + pilot helmet, wing-pylon missiles, blade antennas,
formation-light strips) rendered into mip-mapped sprites at 128 px/m with smooth two-tone gray camo, panel
lines, rim light and a thin dark outline. Generic green-white fin flash, no emblems.
- **Anchor**: aircraft centre (mid-length on the fuselage axis). **Size at scale=1**: 500 px long (19.4 m ⇒ 25.8 px/m).
- `view`:
  - `'side'` — profile, **nose to the right** (slight 10° yaw shows the intake mouth). ≈ 500×140 px.
  - `'top'` — planform, **nose up (−y)**, right wing on the right. ≈ 340×500 px.
  - `'front34'` — three-quarter front: nose toward the camera and to the right, seen from slightly above.
  - `'rear34'` — three-quarter rear: nose away and to the right, nozzles toward the camera (best for afterburner / formation climbing).
- `rot` (radians) rotates around the anchor: for `side` the nose heads along `rot`; for `top` the heading is `rot − π/2`.
- `flip:true` = mirrored (nose left) **with lighting still from the upper-left**.
- `afterburner` 0..1: animated (needs `t`) plume with white-hot core + shock diamonds; for `front34` it is drawn behind the jet, for `rear34` a hot nozzle disc faces the camera.
- `light`: `'golden'` (default) · `'dawn'` · `'day'` · `'night'` · `'back'` (strong rim) · `'right'` (sun from the right). Each new (view, flip, light) builds a sprite once per page (≈ 250 ms); golden side/front34/rear34 are pre-built.
- `alpha` multiplies opacity. Cost ≈ 2 ms (+2 ms afterburner) at any scale up to ~5.7; above that a live render kicks in (slower, rare).
```js
A.jet(ctx, { x: 960, y: 420, scale: 1.4, view: 'side', afterburner: 1, t });
// heading along a path: rot = atan2(dy, dx) for 'side'
A.jet(ctx, { x: p.x, y: p.y, scale: 0.5, view: 'side', rot: Math.atan2(q.y - p.y, q.x - p.x), t });
// four-ship climbing toward the sun
for (let i = 0; i < 4; i++) A.jet(ctx, { x: 900 + i * 140, y: 600 - i * 60, scale: 0.6 - i * 0.05, view: 'rear34', afterburner: abK, t: t + i * 0.13 });
```

### `jet3d(ctx, {x, y, scale, yaw, pitch, roll, elev, flip, light, afterburner, t, lod, hq, alpha})`
The same model rendered live at any attitude (banking turns, rolls). Same anchor and scale as `jet()`.
- `yaw` (0 = nose right, −0.6 = nose toward the camera, +0.6 = away), `pitch` (+ = nose up), `roll` (+ = right wing down), `elev` camera look-down angle (default 10° = 0.17 rad), all radians.
- `hq:true` → smooth camo + rim + outline (≈ 50 ms at scale 1.4); default fast path ≈ 7–11 ms (auto LOD by size; camo is per-facet).
- Prefer `jet()` sprites for anything that does not need a changing attitude.
```js
A.jet3d(ctx, { x: 700, y: 380, scale: 1.4, yaw: -0.5, pitch: 0.1, roll: -0.6 + Math.sin(t) * 0.2, elev: 0.25, afterburner: 0.6, t, hq: true });
```

### `smokeTrail(ctx, t, {path, u0, u1, color, width, seed, alpha, fade})`
Airshow smoke ribbon along `path(u) → {x, y}` from `u0` (oldest end: widest, faintest, billowing) to `u1`
(fresh smoke right behind the aircraft). Puffs are anchored at fixed path parameters, so a growing trail never
shimmers. Use green `#1FAE5B` and white `#ffffff`. `width` = fresh puff radius (px, default 40). Cost ≈ 13 ms for a 1900 px trail.
```js
const path = (u) => ({ x: -200 + u * 2300, y: 820 - Math.sin(u * 2.4) * 380 });
const head = 0.35 + lt * 0.3;                         // aircraft position along the path
A.smokeTrail(ctx, t, { path, u0: Math.max(0, head - 0.55), u1: head, color: '#1FAE5B', width: 46, seed: 1 });
const p = path(head), q = path(head + 0.01);
A.jet(ctx, { x: p.x, y: p.y, scale: 0.42, view: 'side', rot: Math.atan2(q.y - p.y, q.x - p.x), t });
```

### `helicopter(ctx, {x, y, scale, flip, t, tilt})`
Apache-like attack helicopter, side view, **nose right**: angular flat-panelled fuselage, long cheek sponsons,
stepped tandem canopy, nose sensor turret, chin gun, stub wing with rocket pod + missile rails, IR-suppressed
exhausts, tail boom with fin/stabilator/tail wheel, **animated main-rotor blur disc** (4 blurred blades + tip glint)
and tail-rotor disc, Longbow-style mast radar. Olive-drab with warm rim light.
- **Anchor**: rotor-mast base on the fuselage. **Size at scale=1**: fuselage ≈ 480 px (30 px/m), rotor disc 440 px wide.
- `tilt` radians, + = nose down (default 0.08, forward flight). Cost ≈ 2 ms.
```js
A.helicopter(ctx, { x: 880, y: 330, scale: 1.25, t, tilt: 0.1 });
A.dustPlume(ctx, t, { x: 900, y: 760, scale: 0.7, dir: -1, drift: 20, alpha: 0.5 }); // rotor wash below
```

### `missile(ctx, {x, y, angle, scale, flame, t})`
Side-profile missile pointing along `angle` (0 = right): white body, dark seeker window, generic gold band,
canards + tail fins, animated exhaust (`flame` 0..1). **Anchor**: missile centre. **Size at scale=1**: 220 px long. Cost < 1 ms.
Pair with `smokeTrail` (white) for a launch streak.
```js
A.missile(ctx, { x: 1500, y: 260, angle: -0.42, scale: 1.1, t, flame: 1 });
```

---

## Ground & sea

### `tank(ctx, {x, y, scale, flip, turret, recoil, t, speed, dust, seed, backlight, sun})`  — HERO
Abrams-like MBT, desert tan, 2.5D side view (**facing right**): angular turret with front cheek, roof strip,
bustle basket with stowage, commander's cupola + .50 cal, CITV, gunner's sight, smoke launchers, antennas;
120 mm gun with thermal-sleeve bands, bore evacuator and muzzle sensor; hull with sloped glacis, engine grille;
armoured skirts with seams + heavy front panel with bolts; **7 road wheels, toothed drive sprocket and idler
rotating from `t`, track links moving along the full track loop** (dash offset); contact shadow, rim light.
- **Anchor**: ground point under the hull centre. **Size at scale=1**: hull 7.9 m = 474 px (60 px/m), ≈ 640 px with the gun, roof ≈ 145 px high.
- `turret`: gun elevation (radians, + = up). `recoil` 0..1: barrel slides back and the hull rocks (drive it with an envelope, e.g. `exp(-age*6)`).
- `speed` m/s for wheels/tracks/suspension bob (default 4; 0 = parked). `dust` 0..1 adds a `dustPlume` behind the tracks.
- Lighting: a warm rim light is always added on the sun-facing edges (`sun: 'left'` default, or `'right'`), independent of `flip`.
  `backlight` 0..1 darkens the body and strengthens the rim — use ~0.5 for low-angle shots looking toward the sun.
- The body is rendered at device resolution into a scratch canvas (crisp at any scale). Cost ≈ 8 ms (with dust).

### `tankMuzzle({x, y, scale, flip, turret, recoil}) → {x, y, angle}`
Muzzle tip (screen px) and firing angle for the same options — feed it to `muzzleFlash`.
```js
const age = t - 27.0, rec = age > 0 ? Math.exp(-age * 6) * Math.min(1, age * 40) : 0;
const to = { x: 700, y: 960, scale: 1.0, t, turret: 0.04, recoil: rec, speed: 0, backlight: 0.3 };
A.tank(ctx, to);
const mz = A.tankMuzzle(to);
A.muzzleFlash(ctx, age, { x: mz.x, y: mz.y, angle: mz.angle, scale: 0.9 });
A.shockwave(ctx, age, { x: mz.x + 120, y: 960, scale: 0.5, ground: true });
```

### `soldier(ctx, {x, y, scale, pose, t, flip, phase, rim, color, rimWidth})`
Rim-lit semi-silhouette (dark body + warm rim on the light side): helmet with NVG mount and ear cup,
plate carrier + pouches, backpack, tapered limbs, boots, knee pad; carbine with optic held at **low ready, muzzle
toward the ground — never aiming**.
- **Anchor**: ground between the feet. **Facing**: right. **Size at scale=1**: 1.8 m = 360 px tall (200 px/m).
- `pose`: `'stand'` · `'walk'` (cycle from `t`, `phase` offsets the gait) · `'kneel'`. `rim` colour (default `#ffcf8a`), `color` body colour. Cost < 1 ms.
```js
A.soldier(ctx, { x: 560, y: 1060, scale: 1.25, pose: 'walk', t, phase: 0.3 });
```

### `ship(ctx, {x, y, scale, t, flip, wake})`
Modern stealth frigate, side view, **bow right**: angled superstructure, integrated mast with radar panels and a
rotating radar, bridge windows, stealth funnel, hangar + flight deck, bow gun, VLS hatches, CIWS, life-raft
canisters, railings; gentle pitch/heave; animated bow wave, waterline foam, spray and spreading wake; wavy reflection.
- **Anchor**: waterline centre. **Size at scale=1**: 135 m = 608 px long (4.5 px/m), mast top ≈ 225 px. Draw after `sea()`. Cost ≈ 3 ms.

### `radarDish(ctx, {x, y, scale, angle, t, beam})`
Trailer-mounted ground radar: chassis + wheels, shelter with door, louvres, roof rail, pulsing beacon, mast with
turntable + cable, parabolic dish whose ellipse follows the azimuth (`angle`, default `t*1.2`; concave front with feed
horn / ribbed back). `beam` 0..1 adds a HUD-green scanning wedge whose reach follows the azimuth smoothly.
- **Anchor**: ground centre. **Size at scale=1**: ≈ 350 px wide, ≈ 470 px tall. Cost ≈ 1 ms.

---

## Flag

### `flag(ctx, t, {x, y, w, h, pole, poleLen, light, wind, alpha})`  — HERO
Saudi flag, green `#006C35` (`A.FLAG_GREEN`), Shahada «لا إله إلا الله محمد رسول الله» in **Amiri** white
(via `M.text`), white sword below with the **hilt on the RIGHT and the tip pointing LEFT**, hoist on the left.
Waves via vertical strip displacement (smooth outline clip, no stair-steps) with cloth light/shadow bands from the
wave slope; text stays crisp (2400 px texture + mip levels).
- **Anchor** `(x, y)`: top-left corner of the cloth at the hoist; the flag flies to the right. `w` px wide (default 600), `h` default `w*2/3`.
- `pole:true` draws a metallic pole with a gold collar/ball finial on the left, length `poleLen` (default `2.2*h`).
- `light` 0..1 strength of the shading bands, `wind` speed/amplitude multiplier (default 1). Never draw it upside-down / on the ground (anchor convention prevents it).
- Cost ≈ 35 ms at w = 1080 px, ≈ 10 ms at 400 px.
```js
A.flag(ctx, t, { x: 260, y: 170, w: 1300, pole: true, poleLen: 1200 });
```

### `flagFlat(ctx, x, y, w, h)` / `flagTexture()`
The flat (un-waved) flag drawn at top-left `(x, y)`, size `w × (h || w*2/3)`; `flagTexture()` returns the 2400×1600 canvas.

---

## Effects (analytic — pure functions of `t` or `age`)

### `explosion(ctx, age, {x, y, scale, seed, ground, smokeColor})`
`age` = seconds since detonation (draws nothing for `age < 0` or `> 7`). Flash (0–0.3 s) → structured
fireball that cools through brown → rising, spreading smoke mushroom (lit warm while burning) + debris chunks with
arcing smoke dendrites + sparks + low ground-dust skirt. `(x, y)` = burst point (on the ground when `ground:true`,
default). **Size at scale=1**: fireball ≈ 300 px, smoke column ≈ 450 px tall. Only on empty terrain / markers. Cost ≈ 12 ms at scale 0.6.
```js
A.explosion(ctx, t - 22.6, { x: 1600, y: 720, scale: 0.45, seed: 9 });
```

### `muzzleFlash(ctx, age, {x, y, angle, scale})`
0.2 s star flash (forward cone + side lobes + white core) along `angle`, then blast smoke pushed forward (≈ 1.8 s). Use `tankMuzzle()` for tanks.

### `shockwave(ctx, age, {x, y, scale, ground, color})`
Expanding pressure ring (radius ≈ 460 px at scale 1, ~1.2 s); `ground:true` flattens it onto the floor and throws up a ring of dust.

### `dustPlume(ctx, t, {x, y, scale, seed, dir, rate, color, alpha, life, drift})`
Continuous dust from an emitter on the ground (vehicle tracks, rotor wash, landing). Particles are born every
`1/(14*rate)` s and live `life` s (default 2.6); they drift toward `dir` (−1 = left, default) at `drift` px/s
(default 70×scale) while rising and growing. `color` default `#e2c697`.

### `lightRays(ctx, {x, y, count, alpha, t, color, length, spread, angle, width})`
Additive god rays radiating from `(x, y)` (all directions by default; `spread` + `angle` for a cone), gently breathing with `t`. Cost ≈ 3 ms.

### `lensFlare(ctx, {x, y, intensity, color})`
Bloom + anamorphic streak + hexagonal ghosts along the line through the screen centre + halo ring. Cost ≈ 4 ms.

### `embers(ctx, t, {seed, count, area:{x,y,w,h}, color, size, speed, alpha})`
Glowing sparks rising through `area` with sway and flicker; they fade at the area edges (no popping).

---

## HUD / transitions

### `hudBracket(ctx, x, y, w, h, {color, alpha, t, len, thick, glow, ticks, breathe})`
Target/frame corner brackets around the rect (`x, y` = top-left) in HUD green `#7CFFB2` by default, glowing,
with mid-edge ticks (`ticks:false` to hide); breathes ±3 px with `t` (`breathe:0` to freeze). Tighten it by animating `x,y,w,h`.

### `scanlines(ctx, alpha, {t})`
Full-screen scan lines (cheap pattern fill); with `t` a soft green roll band moves down the screen.

### `motionStreaks(ctx, t, {dir, alpha, count, color, speed, width, length})`
Speed lines for whip-pans / flybys. `dir`: `'up'|'down'|'left'|'right'` or radians = direction the streaks travel.
```js
A.motionStreaks(ctx, t, { dir: 'up', alpha: M.prog(t, 11.4, 11.7), count: 80 });
```

---

## Helpers & advanced

- `A.util`: `smooth, fract, wrap, rgb, rgba, mix, mixs, shade, canvas, scratch, noise2, fbm2, radial, glow(ctx,x,y,r,color,a), tinted, glowOf`.
- `A.puffSprite(i, color)` + `A.drawPuff(ctx, sprite, x, y, r, alpha, rot)`: the soft lit smoke puff used by all smoke/dust (tinted & cached per colour) — use it for custom smoke.
- `A.cloudSprite(idx, tint, kind)`, `A.jetSprite(view, flip, light)` (sprite + nozzle metadata).
- 3D: `A.renderMesh(ctx, mesh, {R, scale, cx, cy, flip, rig})`, `A.camMatrix(yaw, pitch, roll, elev)`, `A.loft`, `A.Mesh`, `A.mat`, `A.lightRigs`.
- Palettes: `A.skyPresets`, `A.cloudTints`, `A.dunePalettes`, `A.seaPalettes`, `A.lightRigs`, `A.FLAG_GREEN`.

## Performance notes

- `node tools/preview.cjs` reports *render + PNG encode*; PNG encoding alone is ≈ 145 ms per 1080p frame, so an
  empty scene already prints ≈ 180 ms. The final renderer encodes JPEG (≈ 35 ms incl. engine vignette + grain).
  The gallery averages ≈ 80 ms/frame render+JPEG excluding one-off sprite builds (≈ 109 ms including them).
- One-off costs land on the first frame that needs them in each browser page: new jet sprite (view/flip/light) ≈ 250 ms,
  new cloud tint ≈ 0.3 s, first `cloudDeck` ever ≈ 1 s (density fields), each further deck tint ≈ 0.2 s. Golden side/front34/rear34 jets, golden clouds, puffs and the flag are pre-built in `init`.
- Expensive calls: `jet3d({hq:true})` ≈ 50 ms, `flag` at w>1000 ≈ 35 ms, `dunes` ≈ 22 ms, `cloudDeck` ≈ 20 ms.
