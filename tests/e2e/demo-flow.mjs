// Full instructor demo flow with the REAL model in a real browser (Chromium via Playwright).
// Uses an isolated database (?db=...) so it never touches a real library.
// Usage: node tests/e2e/demo-flow.mjs <baseUrl> [--shots dir] [--device wasm|webgpu] [--out report.json]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const base = process.argv[2];
const shots = arg('--shots'); const device = arg('--device'); const out = arg('--out');
const QUERIES = [
  { q: 'قطة', expect: 'cat.jpg' }, { q: 'a cat', expect: 'cat.jpg' },
  { q: 'فنجان قهوة', expect: 'coffee.jpg' }, { q: 'a cup of coffee', expect: 'coffee.jpg' },
  { q: 'رائد فضاء', expect: 'astronaut.jpg' }, { q: 'an astronaut', expect: 'astronaut.jpg' },
  { q: 'صاروخ على منصة الإطلاق', expect: 'rocket.jpg' }, { q: 'a rocket on the launch pad', expect: 'rocket.jpg' },
  { q: 'عملات معدنية', expect: 'coins.jpg' }, { q: 'old coins', expect: 'coins.jpg' },
  { q: 'مجرات في الفضاء', expect: 'galaxies.jpg' }, { q: 'galaxies in deep space', expect: 'galaxies.jpg' },
  { q: 'فاتورة مطعم', expect: ['receipt-ar.png', 'invoice-en.png'] }, { q: 'a restaurant receipt', expect: ['receipt-ar.png', 'invoice-en.png'] },
  { q: 'محادثة على الهاتف', expect: 'chat-ar.png' }, { q: 'chat messages on a phone', expect: 'chat-ar.png' },
  { q: 'كود برمجي', expect: 'code-editor.png' }, { q: 'programming code', expect: 'code-editor.png' },
  { q: 'رسم بياني بالأعمدة', expect: 'chart-dashboard.png' }, { q: 'a bar chart', expect: 'chart-dashboard.png' },
  { q: 'حالة الطقس', expect: 'weather-en.png' }, { q: 'weather forecast app', expect: 'weather-en.png' },
  { q: 'بطاقة صعود الطائرة', expect: 'boarding-pass.png' }, { q: 'flight boarding pass', expect: 'boarding-pass.png' },
  { q: 'تقويم ومواعيد', expect: 'calendar-ar.png' }, { q: 'a calendar with appointments', expect: 'calendar-ar.png' },
];

const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = []; const requests = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('request', r => requests.push({ url: r.url(), method: r.method(), bytes: r.postDataBuffer()?.length || 0 }));
const u = new URL(base); u.searchParams.set('db', `demo-${Date.now()}`); if (device) u.searchParams.set('device', device);
const report = { url: u.href, startedAt: new Date().toISOString() };
const t0 = Date.now();
await page.goto(u.href);
await page.click('#samples-btn');
await page.waitForFunction(() => window.__snapfind.model.state.status === 'ready' || window.__snapfind.model.state.status === 'error', null, { timeout: 15 * 60000 });
report.model = await page.evaluate(() => window.__snapfind.model.state);
report.modelReadyWallMs = Date.now() - t0;
console.log('model:', JSON.stringify(report.model), `wall ${report.modelReadyWallMs} ms`);
if (report.model.status !== 'ready') { console.log('MODEL FAILED'); await browser.close(); process.exit(1); }
const tq = Date.now();
await page.waitForFunction(() => { const its = [...document.querySelectorAll('#library .item')]; return its.length >= 14 && its.every(i => ['ready', 'error'].includes(i.dataset.status)); }, null, { timeout: 15 * 60000 });
report.processAllMs = Date.now() - tq;
report.statuses = await page.$$eval('#library .item', its => its.map(i => [i.querySelector('.name').textContent, i.dataset.status]));
console.log('processed 14 images in', report.processAllMs, 'ms; errors:', report.statuses.filter(s => s[1] !== 'ready'));
if (shots) await page.screenshot({ path: `${shots}/1-processed.png`, fullPage: true });

report.queries = [];
for (const { q, expect } of QUERIES) {
  const exp = [].concat(expect);
  await page.fill('#search-input', q);
  const before = await page.evaluate(() => window.__snapfind.state.lastResults);
  await page.click('#search-form button[type=submit]');
  await page.waitForFunction((q) => window.__snapfind.state.lastResults?.q === q, q, { timeout: 120000 });
  const res = await page.evaluate(() => { const r = window.__snapfind.state.lastResults; return { usedText: r.usedText, ms: r.ms, top: r.ranked.slice(0, 3).map(h => ({ name: window.__snapfind.state.records.get(h.id).name, s: +h.score.toFixed(3), ocr: h.ocrMatch })) }; });
  const domTop = await page.$eval('#results .item[data-rank="1"] .name', e => e.textContent);
  const rank = res.top.findIndex(h => exp.includes(h.name)) + 1;
  report.queries.push({ q, ...res, domTop, pass1: rank === 1, pass3: rank > 0 });
  console.log(`${rank === 1 ? 'PASS' : rank > 0 ? 'top3' : 'FAIL'} "${q}"${res.usedText !== q ? ` -> "${res.usedText}"` : ''} top=${res.top.map(h => `${h.name}:${h.s}${h.ocr ? '+ocr' : ''}`).join(', ')} (${Math.round(res.ms)}ms)`);
  if (shots && (q === 'قطة' || q === 'a restaurant receipt')) await page.screenshot({ path: `${shots}/search-${q === 'قطة' ? 'ar-cat' : 'en-receipt'}.png`, fullPage: false });
}
// Persistence: reload and confirm all records + embeddings survive, and search works without re-processing.
const beforeCount = await page.locator('#library .item').count();
await page.reload();
await page.waitForFunction(() => window.__snapfind.model.state.status === 'ready', null, { timeout: 10 * 60000 });
report.reloadModel = await page.evaluate(() => window.__snapfind.model.state);
await page.waitForTimeout(500);
report.afterReload = await page.$$eval('#library .item', its => its.map(i => i.dataset.status));
console.log('reload: before', beforeCount, 'after', report.afterReload.length, 'statuses', [...new Set(report.afterReload)], 'model (2nd load):', JSON.stringify(report.reloadModel.timings), 'cached:', report.reloadModel.cached);
await page.fill('#search-input', 'قطة'); await page.click('#search-form button[type=submit]');
await page.waitForFunction(() => window.__snapfind.state.lastResults?.q === 'قطة', null, { timeout: 60000 });
report.afterReloadTop = await page.$eval('#results .item[data-rank="1"] .name', e => e.textContent);
console.log('after reload, "قطة" top:', report.afterReloadTop);

const pageHost = new URL(base).host;
const ext = requests.filter(r => !r.url.startsWith('blob:') && !r.url.startsWith('data:') && new URL(r.url).host !== pageHost);
report.externalHosts = [...new Set(ext.map(r => new URL(r.url).host))];
report.externalUploads = ext.filter(r => r.method !== 'GET' || r.bytes > 0).map(r => r.url);
report.consoleErrors = errors;
const s1 = report.queries.filter(q => q.pass1).length, s3 = report.queries.filter(q => q.pass3).length;
report.summary = { queries: report.queries.length, top1: s1, top3: s3, ar: report.queries.filter((q, i) => i % 2 === 0 && q.pass1).length, en: report.queries.filter((q, i) => i % 2 === 1 && q.pass1).length };
console.log('summary:', JSON.stringify(report.summary));
console.log('external hosts:', report.externalHosts, 'non-GET/body requests to external hosts:', report.externalUploads);
console.log('console errors:', errors.slice(0, 10));
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
await browser.close();
