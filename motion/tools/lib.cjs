// Shared helpers: tiny static server + headless Chromium page with the motion stage loaded.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function openStage(browser, port, log = console.error, pageName = 'index.html') {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => log('[pageerror] ' + (e.stack || e.message)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log(`[console.${m.type()}] ${m.text()}`); });
  page.on('requestfailed', (r) => log('[requestfailed] ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400 && !/scenes\//.test(r.url())) log(`[http ${r.status()}] ${r.url()}`); });
  await page.goto(`http://127.0.0.1:${port}/${pageName}`);
  await page.waitForFunction(() => window.M && window.M.ready === true, null, { timeout: 60000 });
  return page;
}

async function launch() {
  return chromium.launch({ args: ['--disable-gpu-vsync', '--font-render-hinting=none', '--disable-lcd-text'] });
}

async function frameJpeg(page, t, q = 0.93) {
  const data = await page.evaluate(([t, q]) => { M.renderAt(t); return M.snapshot('image/jpeg', q); }, [t, q]);
  return Buffer.from(data.split(',')[1], 'base64');
}
async function framePng(page, t) {
  const data = await page.evaluate((t) => { M.renderAt(t); return M.snapshot('image/png'); }, t);
  return Buffer.from(data.split(',')[1], 'base64');
}
async function drainErrors(page) {
  return page.evaluate(() => M.errors.splice(0));
}

module.exports = { ROOT, serve, launch, openStage, frameJpeg, framePng, drainErrors };
