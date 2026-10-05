#!/usr/bin/env node
/*
 * Render the full video.
 *   node tools/render.cjs [--workers 3] [--from 0] [--to 67] [--out out/video_silent.mp4] [--audio audio/score.wav --muxed out/video.mp4]
 */
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const { ROOT, serve, launch, openStage, frameJpeg, drainErrors } = require('./lib.cjs');
const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const FPS = 30;
const from = +get('from', 0), to = +get('to', 67);
const workers = +get('workers', 3);
const frames = Math.round((to - from) * FPS);
const tmp = path.resolve(ROOT, get('tmp', 'out/frames'));
const outFile = path.resolve(ROOT, get('out', 'out/video_silent.mp4'));
fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
fs.mkdirSync(path.dirname(outFile), { recursive: true });

(async () => {
  const srv = await serve(); const port = srv.address().port;
  const browser = await launch();
  let errs = 0; const log = (m) => { errs++; console.error(m); };
  const per = Math.ceil(frames / workers); let done = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const page = await openStage(browser, port, log);
    for (let f = w * per; f < Math.min(frames, (w + 1) * per); f++) {
      const t = from + f / FPS;
      fs.writeFileSync(path.join(tmp, `f_${String(f).padStart(5, '0')}.jpg`), await frameJpeg(page, t, 0.95));
      for (const e of await drainErrors(page)) log('[scene error] ' + e);
      if (++done % 150 === 0) console.error(`${done}/${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    await page.close();
  }));
  await browser.close(); srv.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, 'f_%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', get('crf', '18'), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile], { stdio: 'inherit' });
  console.log('video: ' + outFile);
  const audio = get('audio'); const muxed = get('muxed');
  if (audio && muxed) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', outFile, '-i', path.resolve(ROOT, audio), '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', path.resolve(ROOT, muxed)], { stdio: 'inherit' });
    console.log('muxed: ' + path.resolve(ROOT, muxed));
  }
  if (!args.includes('--keep')) fs.rmSync(tmp, { recursive: true, force: true });
  console.error(`errors: ${errs}`);
  process.exit(errs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
