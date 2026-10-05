# «درع الوطن» — Motivational military motion graphic (1:07)

A 67-second, 1920×1080 @ 30 fps motivational motion graphic for the Saudi armed forces with a focus on the air force.
**Style:** semi-realistic illustration ("realistic, slightly cartoon"): clean vector shapes with *realistic lighting* —
multi-stop gradients, rim light, specular highlights, soft contact shadows, atmospheric haze/depth, light rays, dust,
embers, heat shimmer, lens flares, camera shake on impacts. Think a high-end animated military trailer, not flat clip-art
and not a photo. Cinematic grade: warm golden-hour / teal shadows, with Saudi green and gold accents.
**No vocals, no melodic music.** The soundtrack is pure military sound design: SFX + optional war-drum percussion.

The narrative is a *fictional motivational* "scene analysis" whose verdict is: **النصر قادم خلال ٧ أيام** (victory is coming within 7 days),
followed by a 7-day countdown. It does **not** depict a real, named operation.

## Content rules (apply to every scene)
- No named enemy, no enemy flags/symbols, no specific real-world targets, cities or borders. Maps are generic/fictional terrain.
- No people being harmed; no gore. Explosions / strikes only on empty terrain, hills or abstract target markers.
- No official logos/emblems of ministries, branches or units. The national flag of Saudi Arabia is fine.
  Aircraft/vehicle markings: keep generic (e.g. a small plain green-white fin flash / stripe), no roundels with emblems.
- Flag of Saudi Arabia: green `#006C35`, Shahada «لا إله إلا الله محمد رسول الله» in white (Amiri), white sword under it
  with the **hilt on the right and the tip pointing left**. Never draw the flag upside-down, on the ground, or damaged.
- Arabic text must be correctly spelled and fully shaped (always use `M.text`, which sets RTL). Arabic-Indic digits (١٢٣٤٥٦٧) in Arabic copy.
- Palette tokens: green `#006C35`, bright green `#1FAE5B`, gold `#C8A24A`, light gold `#F2D27A`, sand `#D9B47A`, deep night `#05080A`, HUD cyan-green `#7CFFB2`.

## Technical contract (READ CAREFULLY)
- Engine: `engine.js` exposes global `M` (see the file). Each scene file calls
  `M.registerScene({id, start, end, fadeIn, fadeOut, z, draw(ctx, lt, t, M)})`. `lt` = local time = `t - start`.
  `ctx` is a 1920×1080 2D context, transform reset; the engine wraps `draw` in save/restore.
- **Every frame is a pure function of `t`.** Do NOT use `Math.random`, `Date`, `performance.now`, timers, or state that
  depends on previously rendered frames. Use `M.hash(n, seed)`, `M.rng(seed)` (create a fresh one inside draw), `M.noise1(x, seed)`.
  Particles must be computed analytically from `t` (e.g. particle i has birth time b_i = hash(i); position = f(t - b_i)).
  Caches are allowed only for content that never depends on `t` (e.g. a pre-rendered sprite built once and reused).
- Frames are rendered out of order by several browser pages in parallel → any hidden state = flicker bug.
- Performance budget: average ≤ 120 ms per frame at 1080p in `node tools/preview.cjs` (it prints the average).
  `ctx.filter = 'blur(...)'` on full-screen layers is very expensive — blur small offscreen canvases instead, or fake glows with radial gradients / `shadowBlur` on few objects.
- Helpers in `M`: `clamp, lerp, invLerp, prog(t,a,b), env(t,a,b,fadeIn,fadeOut), ease.*, hash, rng, noise1, shake(t,intensity),
  text(ctx,str,x,y,{size,family:'arabic'|'kufi'|'naskh'|'latin',weight,color,align,baseline,glow,glowColor,stroke,strokeColor,alpha,letterSpacing,wordSpacing,shadow}),
  measure, arDigits, vignette, fill, roundRect, W, H, FPS`. Fonts: Cairo 400/700/900 (`arabic`), Lalezar (`kufi`, heavy headline),
  Amiri 700 (`naskh`, calligraphy/flag), Oswald 500/700 (`latin`, HUD numerals).
- The engine already adds a global vignette + film grain and fades from black at 0–0.4 s and to black at 66.4–67 s.
- Shared drawing library: `assets.js` → `M.assets.*`, documented in `ASSETS.md` (jets, tanks, helicopters, ship, soldiers, flag, sky, dunes, clouds, smoke, explosions, muzzle flash, HUD bits). Reuse it for visual consistency; you may extend a scene with local helpers in your own file.
- Preview: `node tools/preview.cjs --range 12:24:1 --sheet --out preview/s3` → per-frame PNGs + `sheet.jpg` contact sheet; exit code 1 + stderr on any JS error. Read the PNGs/sheet to check your work visually.
- Only edit the files you own. Do not git commit.

## Timeline & sync cue sheet (absolute seconds). Tempo grid: 100 BPM → 1 beat = 0.6 s, 1 bar = 2.4 s.
Visual events and audio events MUST land on these exact times.

### S1 — Intro / recon HUD · `scenes/s1_intro.js` · 0.0 – 6.0
Dark tactical night-vision HUD: radar sweep disc, grid, range rings, ticking coordinates, scan lines, faint desert terrain contours.
- 0.6, 1.8, 3.0 — radar contact blips appear (audio: sonar/radar **ping**)
- 1.2 – 2.6 — typewriter text «جارٍ تحليل المشهد…» with blinking cursor (audio: **data ticks**)
- 3.0 – 4.6 — text «تحليل الموقف الميداني» + HUD panels populate
- 4.2 – 5.8 — everything accelerates & converges to center, zoom in (audio: **riser** 4.2→5.8)
- 5.8 – 6.0 — white flash

### S2 — Flag & title · `scenes/s2_flag.js` · 6.0 – 12.0
- 6.0 — **HIT** (big impact boom). Flash decays revealing the Saudi flag waving large against a golden-hour sky with dust; slow push-in.
- 6.6 — title slams in: «القوات المسلحة السعودية» (heavy, metallic gold/white, shockwave ring) (audio: **metal slam**)
- 8.4 — sword gleam travels along the flag's sword + line «درعُ الوطن وسيفُه» (audio: **sword shing**)
- 10.2 — line «عزمٌ لا يلين» (audio: **hit**)
- 11.4 – 12.0 — whip-pan / motion-blur transition upward into the sky (audio: **whoosh** at 11.4)

### S3 — Air force · `scenes/s3_air.js` · 12.0 – 24.0
High-altitude golden-hour sky over Saudi desert dunes, clouds with parallax.
- 12.0 – 15.0 — lead twin-tail air-superiority fighter (F-15-like) crosses; close flyby peak at **14.4** with camera shake (audio: **jet flyby roar**, peak 14.4)
- 15.0 — lower-third with HUD brackets: «سلاح الجو الملكي السعودي»; 16.2 — «صقور السماء» (audio: **hit** 15.0)
- 17.4 – 20.4 — four-ship formation climbing toward the sun; afterburners ignite at **18.6** (audio: **afterburner roar + boom** 18.6)
- 20.4 – 23.4 — cockpit HUD overlay: pitch ladder, speed/altitude tapes (Latin numerals), target box tightens over an abstract ground marker; lock tone beeps 20.4–21.6, **LOCK** at 21.6 (audio: **lock beeps → steady tone**); missile launch streak at **22.2** (audio: **missile whoosh**)
- 23.4 – 24.0 — a jet passes the camera filling the frame → wipe (audio: **whoosh** 23.4)

### S4 — Ground forces · `scenes/s4_ground.js` · 24.0 – 34.0
Low-angle desert at golden hour, heat haze, dust plumes.
- 24.0 – 27.0 — main battle tank column advancing (Abrams-like), soldier silhouettes in foreground (not aiming at anyone)
- 25.2 — «القوات البرية» + «ثباتٌ كالجبال» (audio: **hit**)
- 27.0 — lead tank fires toward empty distant dunes: muzzle flash, shockwave dust ring, camera shake (audio: **cannon BOOM**)
- 28.2 – 31.8 — attack helicopters (Apache-like) cross over the dunes (audio: **rotor thump** 28.2–31.8)
- 30.6 — second tank shot (audio: **cannon BOOM**)
- 31.8 — «أرضٌ لا تُمَسّ» (audio: **hit**)
- 33.6 – 34.0 — dust cloud fills screen → transition (audio: **whoosh** 33.6)

### S5 — Scene analysis · `scenes/s5_analysis.js` · 34.0 – 42.0
Dark command-center holographic display: generic fictional topographic map, grid, friendly unit chevrons (green), animated advance arrows, range rings, scanning beam.
- 34.2 — title «تحليل المشهد» with digital glitch (audio: **glitch**)
- Indicator bars count up (labels Arabic, values Arabic-Indic digits), each lands with a blip (audio: **blip** at each):
  - 36.0 «التفوق الجوي» → ٩٨٪
  - 37.2 «الجاهزية القتالية» → ١٠٠٪
  - 38.4 «الروح المعنوية» → ١٠٠٪
  - 39.6 «الإسناد اللوجستي» → ٩٦٪
- 40.8 — verdict box: «التقدير: النصر خلال ٧ أيام» (audio: **lock tone + hit**)
- 41.4 – 42.0 — zoom into the «٧» → transition (audio: **riser** 41.4→42.0)

### S6 — Seven-day countdown · `scenes/s6_seven_days.js` · 42.0 – 58.8
Seven 2.4 s beats. Each day starts with an impact (audio: **hit** at each start; day 7 = **huge hit**).
Persistent bottom timeline with 7 nodes lighting up one by one; big Arabic numeral + day name + phase line;
background vignette illustrating the phase (use assets), with a punchy transition between days.
| start | numeral | day | phase line | background |
|---|---|---|---|---|
| 42.0 | ١ | اليوم الأول | السيطرة على الأجواء | jets over clouds |
| 44.4 | ٢ | اليوم الثاني | رصدُ التهديدات وتحييدها | radar dish / scanning |
| 46.8 | ٣ | اليوم الثالث | ضرباتٌ دقيقة | missile streaks to empty hills, distant flashes |
| 49.2 | ٤ | اليوم الرابع | تقدّمُ القوات البرية | tank column |
| 51.6 | ٥ | اليوم الخامس | تأمينُ الحدود والسواحل | naval frigate at sea |
| 54.0 | ٦ | اليوم السادس | إحكامُ السيطرة | helicopters + jets over the desert |
| 56.4 | ٧ | اليوم السابع | النصر | Saudi flag rising in golden light, rays |
- 58.2 – 58.8 — white-gold flash transition (audio: **whoosh/riser** 58.2)

### S7 — Finale · `scenes/s7_finale.js` · 58.8 – 67.0
Golden dawn sky; a formation of jets trails green and white smoke across the frame (airshow style).
- 59.4 — formation flyby (audio: **jet flyby**)
- 60.0 — **HUGE HIT**: «النصر قادم» enormous, metallic gold, light rays
- 61.2 — «خلال ٧ أيام» (audio: **hit**)
- 62.4 — «بإذن الله» soft, reverent (audio: **low swell**, no hit)
- 64.2 — flag waving + «حفظ الله الوطن» (audio: **hit**, softer)
- 66.0 — final boom tail; engine fades to black 66.4 – 67.0 (audio: **final boom** 66.0, decay to silence by 67.0)
