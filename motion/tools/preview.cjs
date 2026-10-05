#!/usr/bin/env node
/*
 * Render still frames for review.
 *   node tools/preview.cjs --times 12.5,14,16.2 [--out preview/s3] [--sheet] [--cols 3]
 *   node tools/preview.cjs --range 12:24:1.5 --sheet --out preview/s3
 *   --page gallery.html   (render a different html page that uses the same engine)
 * Writes PNG per time (t_012.500.png). With --sheet also writes a labeled contact
 * sheet (sheet.jpg) so many frames can be inspected in one image.
 * Prints page errors / scene exceptions to stderr and exits 1 if any occurred.
 */
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const { ROOT, serve, launch, openStage, framePng, drainErrors } = require('./lib.cjs');

const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
let times = [];
if (get('times')) times = get('times').split(',').map(Number);
if (get('range')) { const [a, b, s] = get('range').split(':').map(Number); for (let t = a; t <= b + 1e-9; t += s) times.push(+t.toFixed(3)); }
if (!times.length) { console.error('need --times or --range'); process.exit(2); }
const out = path.resolve(ROOT, get('out', 'preview'));
fs.mkdirSync(out, { recursive: true });

(async () => {
  const srv = await serve(); const port = srv.address().port;
  const browser = await launch();
  let bad = 0; const log = (m) => { bad++; console.error(m); };
  const page = await openStage(browser, port, log, get('page', 'index.html'));
  const files = []; let ms = 0;
  for (const t of times) {
    const t1 = Date.now();
    const f = path.join(out, `t_${t.toFixed(3).padStart(7, '0')}.png`);
    fs.writeFileSync(f, await framePng(page, t)); files.push([f, t]); ms += Date.now() - t1;
    for (const e of await drainErrors(page)) log('[scene error] ' + e);
  }
  await browser.close(); srv.close();
  console.log(`avg frame time (render+png encode): ${(ms / times.length).toFixed(0)} ms`);
  if (args.includes('--sheet')) {
    const cols = +get('cols', Math.min(3, files.length));
    const rows = Math.ceil(files.length / cols);
    const inputs = []; const filters = [];
    files.forEach(([f, t], i) => {
      inputs.push('-i', f);
      filters.push(`[${i}:v]scale=640:360,drawtext=text='t=${t.toFixed(2)}s':x=8:y=8:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6[v${i}]`);
    });
    for (let i = files.length; i < rows * cols; i++) { filters.push(`color=c=gray:s=640x360:d=1[v${i}]`); }
    const layout = Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * 640}_${Math.floor(i / cols) * 360}`).join('|');
    const fc = filters.join(';') + ';' + Array.from({ length: rows * cols }, (_, i) => `[v${i}]`).join('') + `xstack=inputs=${rows * cols}:layout=${layout}[out]`;
    const sheet = path.join(out, 'sheet.jpg');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', fc, '-map', '[out]', '-frames:v', '1', '-q:v', '3', sheet]);
    console.log('sheet: ' + sheet);
  }
  files.forEach(([f]) => console.log(f));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
