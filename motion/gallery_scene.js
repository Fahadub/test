/*
 * Asset gallery — every M.assets function shown in context, 2 s per segment.
 * Preview: node tools/preview.cjs --page gallery.html --range 1:23:2 --sheet --out preview/assets/gallery
 */
(function () {
  const A = M.assets;
  const label = (ctx, s, sub) => {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, 1920, 64);
    M.text(ctx, s, 40, 33, { size: 30, family: 'latin', weight: 500, color: '#F2D27A', align: 'left' });
    if (sub) M.text(ctx, sub, 1880, 33, { size: 22, family: 'latin', weight: 500, color: '#cfd8d0', align: 'right' });
    ctx.restore();
  };

  // 0-2: jets, all four views, dawn sky with clouds
  M.registerScene({ id: 'g_jets', start: 0, end: 2, draw(ctx, lt, t) {
    A.sky(ctx, { preset: 'dawn', horizonY: 860, sunX: 1500, sunY: 760, sunR: 55 });
    A.clouds(ctx, t, { seed: 4, count: 7, y0: 560, y1: 820, speed: 60, scale: 1.2, tint: 'dawn', alpha: 0.9 });
    A.jet(ctx, { x: 560, y: 250, scale: 1.5, view: 'side', afterburner: 1, t, light: 'dawn' });
    A.jet(ctx, { x: 1450, y: 330, scale: 1.0, view: 'top', t, light: 'dawn' });
    A.jet(ctx, { x: 560, y: 760, scale: 1.35, view: 'front34', afterburner: 0.5, t, light: 'dawn' });
    A.jet(ctx, { x: 1420, y: 820, scale: 1.35, view: 'rear34', afterburner: 1, t, light: 'dawn' });
    label(ctx, 'jet()  side / top / front34 / rear34  + sky(dawn) + clouds', 'afterburner animated from t');
  } });

  // 2-4: tank column on dunes with dust
  M.registerScene({ id: 'g_tanks', start: 2, end: 4, draw(ctx, lt, t) {
    A.sky(ctx, { preset: 'golden', horizonY: 600, sunX: 360, sunY: 500, sunR: 48 });
    A.dunes(ctx, t, { horizonY: 600, layers: 4, scroll: 30, seed: 5 });
    A.tank(ctx, { x: 520, y: 700, scale: 0.42, t: t + 0.4, dust: 0.7 });
    A.tank(ctx, { x: 1020, y: 790, scale: 0.7, t: t + 0.2, dust: 0.8, turret: 0.03 });
    A.tank(ctx, { x: 1450, y: 960, scale: 1.15, t, dust: 1, turret: 0.06, backlight: 0.5 });
    label(ctx, 'tank()  column + dustPlume() + dunes(golden)', 'road wheels & track links animated');
  } });

  // 4-6: helicopters + soldiers (+ radar)
  M.registerScene({ id: 'g_heli', start: 4, end: 6, draw(ctx, lt, t) {
    A.sky(ctx, { preset: 'golden', horizonY: 700, sunX: 300, sunY: 560, sunR: 50 });
    A.dunes(ctx, t, { horizonY: 700, layers: 4, seed: 7, scroll: 10 });
    A.helicopter(ctx, { x: 880, y: 330, scale: 1.25, t });
    A.helicopter(ctx, { x: 1560, y: 210, scale: 0.55, t: t + 0.13, tilt: 0.12 });
    A.dustPlume(ctx, t, { x: 900, y: 760, scale: 0.7, seed: 3, dir: -1, drift: 20, alpha: 0.5 });
    A.radarDish(ctx, { x: 1640, y: 860, scale: 0.75, t, beam: 0.6 });
    A.soldier(ctx, { x: 260, y: 1060, scale: 1.3, pose: 'stand', t });
    A.soldier(ctx, { x: 560, y: 1060, scale: 1.25, pose: 'walk', t });
    A.soldier(ctx, { x: 900, y: 1060, scale: 1.25, pose: 'kneel', t });
    A.soldier(ctx, { x: 1240, y: 1060, scale: 1.15, pose: 'walk', t, phase: 0.5, flip: true });
    label(ctx, 'helicopter()  soldier(stand/walk/kneel)  radarDish()', 'rifles held low, never aiming');
  } });

  // 6-8: ship at sea
  M.registerScene({ id: 'g_ship', start: 6, end: 8, draw(ctx, lt, t) {
    A.sky(ctx, { preset: 'golden', horizonY: 600, sunX: 1300, sunY: 470, sunR: 55 });
    A.clouds(ctx, t, { seed: 9, count: 5, y0: 160, y1: 420, speed: 15, scale: 0.9 });
    A.sea(ctx, t, { horizonY: 600, sunX: 1300 });
    A.ship(ctx, { x: 520, y: 640, scale: 0.45, t: t + 1 });
    A.ship(ctx, { x: 980, y: 800, scale: 1.45, t });
    A.missile(ctx, { x: 1520, y: 250, angle: -0.42, scale: 1.1, t });
    label(ctx, 'ship() + sea() + missile()', 'bow wave, wake and glitter animated');
  } });

  // 8-10: flag close-up and medium
  M.registerScene({ id: 'g_flag', start: 8, end: 10, draw(ctx, lt, t) {
    A.sky(ctx, { preset: 'golden', horizonY: 980, sunX: 1650, sunY: 820, sunR: 60 });
    A.lightRays(ctx, { x: 1650, y: 820, count: 16, alpha: 0.18, t, length: 1900 });
    A.flag(ctx, t, { x: 140, y: 130, w: 1080, pole: true, poleLen: 1100 });
    A.flag(ctx, t + 0.7, { x: 1400, y: 300, w: 420, pole: true, poleLen: 760 });
    A.embers(ctx, t, { area: { x: 0, y: 300, w: 1920, h: 780 }, count: 40, color: '#ffc070', speed: 40 });
    label(ctx, 'flag()  close-up + medium, light rays, embers', 'hilt right, tip left; Shahada in Amiri');
  } });

  // 10-12: explosion / muzzle flash / shockwave age progression
  M.registerScene({ id: 'g_boom', start: 10, end: 12, draw(ctx, lt, t) {
    A.sky(ctx, { preset: 'golden', horizonY: 700, sunX: 1700, sunY: 560, sunR: 40 });
    A.dunes(ctx, t, { horizonY: 700, layers: 3, seed: 2 });
    const ages = [0.08, 0.35, 0.9, 2.2];
    ages.forEach((a, i) => A.explosion(ctx, a + lt * 0.5, { x: 260 + i * 460, y: 780, scale: 0.55, seed: i + 1 }));
    [0.03, 0.09, 0.4].forEach((a, i) => A.muzzleFlash(ctx, a + lt * 0.05, { x: 120 + i * 300, y: 980, angle: 0, scale: 0.55 }));
    [0.15, 0.45].forEach((a, i) => A.shockwave(ctx, a + lt * 0.1, { x: 1260 + i * 420, y: 990, scale: 0.4, ground: true }));
    label(ctx, 'explosion(age)  muzzleFlash(age)  shockwave(age)', 'ages 0.08 / 0.35 / 0.9 / 2.2 s');
  } });

  // 12-14: smoke trails + rays + flare + embers + HUD + scanlines
  M.registerScene({ id: 'g_air', start: 12, end: 14, draw(ctx, lt, t) {
    A.sky(ctx, { preset: 'dawn', horizonY: 1000, sunX: 1500, sunY: 330, sunR: 50 });
    A.lightRays(ctx, { x: 1500, y: 330, count: 18, alpha: 0.22, t });
    const head = 0.35 + lt * 0.3;
    for (let k = 0; k < 3; k++) {
      const path = (u) => ({ x: -200 + u * 2300, y: 820 - k * 80 - Math.sin(u * 2.4) * 380 + k * 20 * u });
      const col = k === 1 ? '#ffffff' : '#1FAE5B';
      A.smokeTrail(ctx, t, { path, u0: Math.max(0, head - 0.55), u1: head, color: col, width: 46, seed: k + 1 });
      const p = path(head), q = path(head + 0.01);
      A.jet(ctx, { x: p.x, y: p.y, scale: 0.42, rot: Math.atan2(q.y - p.y, q.x - p.x), view: 'side', t, light: 'dawn' });
    }
    A.lensFlare(ctx, { x: 1500, y: 330, intensity: 0.9 });
    A.embers(ctx, t, { count: 30, color: '#ffd080' });
    A.hudBracket(ctx, 760, 420, 380, 240, { t });
    A.scanlines(ctx, 0.12, { t });
    label(ctx, 'smokeTrail() green/white  lightRays()  lensFlare()  embers()  hudBracket()  scanlines()', '');
  } });

  // 14-16: night + cloud deck + jets with night rig; motion streaks
  M.registerScene({ id: 'g_night', start: 14, end: 16, draw(ctx, lt, t) {
    A.sky(ctx, { preset: 'night', horizonY: 640, sunX: 400, sunY: 200, sunR: 26, stars: true, t, glow: 0.6 });
    A.cloudDeck(ctx, t, { y: 600, tint: 'night', speed: 200 });
    A.jet(ctx, { x: 820, y: 360, scale: 1.0, view: 'rear34', afterburner: 1, t, light: 'night' });
    A.jet(ctx, { x: 1300, y: 300, scale: 0.7, view: 'rear34', afterburner: 1, t: t + 0.3, light: 'night' });
    A.motionStreaks(ctx, t, { dir: 'left', alpha: 0.25, count: 40 });
    label(ctx, 'sky(night, stars) + cloudDeck(night) + jet(light:"night") + motionStreaks()', '');
  } });

  // 16-18: golden cloud deck + jet3d banking (live render)
  M.registerScene({ id: 'g_jet3d', start: 16, end: 18, draw(ctx, lt, t) {
    A.sky(ctx, { preset: 'golden', horizonY: 700, sunX: 1600, sunY: 560, sunR: 50 });
    A.cloudDeck(ctx, t, { y: 660, tint: 'golden', speed: 260 });
    A.jet3d(ctx, { x: 700, y: 380, scale: 1.4, yaw: -0.5, pitch: 0.1, roll: -0.6 + Math.sin(t) * 0.2, elev: 0.25, afterburner: 0.6, t, hq: true });
    A.jet3d(ctx, { x: 1400, y: 330, scale: 0.9, yaw: 2.6, pitch: 0.05, roll: 0.5, elev: 0.3, afterburner: 1, t });
    label(ctx, 'jet3d()  any attitude (yaw/pitch/roll) + cloudDeck(golden)', 'hq:true = smooth camo');
  } });

  // 18-20: close flyby (live high-res path) + whip streaks
  M.registerScene({ id: 'g_flyby', start: 18, end: 20, draw(ctx, lt, t) {
    const sh = M.shake(t, 6);
    ctx.translate(sh.x, sh.y);
    A.sky(ctx, { preset: 'golden', horizonY: 900, sunX: 300, sunY: 760, sunR: 40 });
    A.clouds(ctx, t, { seed: 6, count: 6, y0: 700, y1: 900, speed: 300, scale: 1.4 });
    A.jet(ctx, { x: 1500 - lt * 500, y: 560, scale: 3.8, view: 'side', afterburner: 1, t });
    A.motionStreaks(ctx, t, { dir: 'left', alpha: 0.35, count: 50 });
    label(ctx, 'jet() at scale 3.8 (live high-res render path) + M.shake + motionStreaks', '');
  } });

  // 20-22: flat flag reference + tank firing sequence
  M.registerScene({ id: 'g_fire', start: 20, end: 22, draw(ctx, lt, t) {
    A.sky(ctx, { preset: 'golden', horizonY: 640, sunX: 1650, sunY: 540, sunR: 45 });
    A.dunes(ctx, t, { horizonY: 640, layers: 4, seed: 11 });
    const fireT = 20.5, age = t - fireT;
    const rec = age > 0 ? Math.exp(-age * 6) * Math.min(1, age * 40) : 0;
    const to = { x: 700, y: 960, scale: 1.0, t, turret: 0.04, recoil: rec, speed: 0 };
    A.tank(ctx, to);
    const mz = A.tankMuzzle(to);
    A.muzzleFlash(ctx, age, { x: mz.x, y: mz.y, angle: mz.angle, scale: 0.9 });
    A.explosion(ctx, age - 0.35, { x: 1600, y: 720, scale: 0.45, seed: 9 });
    A.flagFlat(ctx, 1500, 90, 330);
    label(ctx, 'tank(recoil) + tankMuzzle() + muzzleFlash + distant explosion; flagFlat()', '');
  } });
  // 22-24: close-ups — tank and helicopter detail
  M.registerScene({ id: 'g_close1', start: 22, end: 24, draw(ctx, lt, t) {
    A.sky(ctx, { preset: 'golden', horizonY: 700, sunX: 250, sunY: 560, sunR: 45 });
    A.dunes(ctx, t, { horizonY: 700, layers: 3, seed: 13, amp: 0.6 });
    A.tank(ctx, { x: 720, y: 1000, scale: 1.75, t, dust: 1, turret: 0.05 });
    A.helicopter(ctx, { x: 1450, y: 330, scale: 1.5, t, tilt: 0.1 });
    label(ctx, 'close-up: tank(scale 1.75) + helicopter(scale 1.5)', '');
  } });

  // 24-26: close-ups — soldiers, radar, missile, ship detail
  M.registerScene({ id: 'g_close2', start: 24, end: 26, draw(ctx, lt, t) {
    A.sky(ctx, { preset: 'golden', horizonY: 760, sunX: 980, sunY: 660, sunR: 60 });
    A.dunes(ctx, t, { horizonY: 760, layers: 3, seed: 3, amp: 0.5 });
    A.radarDish(ctx, { x: 1550, y: 900, scale: 1.3, t, beam: 0.5 });
    A.missile(ctx, { x: 1300, y: 230, angle: -0.25, scale: 2.2, t });
    A.soldier(ctx, { x: 330, y: 1075, scale: 2.4, pose: 'stand', t });
    A.soldier(ctx, { x: 820, y: 1075, scale: 2.2, pose: 'kneel', t });
    label(ctx, 'close-up: soldier(scale 2.4 / 2.2)  radarDish(1.3)  missile(2.2)', '');
  } });
})();
