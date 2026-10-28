// Real-browser smoke test against a running server (vite preview).
// Usage: node tests/e2e/smoke.mjs <baseUrl> [--expect-model-ready] [--shots dir]
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:4173/';
const expectReady = process.argv.includes('--expect-model-ready');
const shotsIdx = process.argv.indexOf('--shots');
const shots = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const errors = []; const requests = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('request', r => requests.push(r.url()));
const url = new URL(`?db=smoke-${Date.now()}`, base).href;
await page.goto(url);
await page.waitForSelector('#model-status');
console.log('dir/lang:', await page.evaluate(() => [document.documentElement.dir, document.documentElement.lang]));
console.log('title:', await page.textContent('h1'), '|', await page.textContent('.tagline'));
// upload: one valid png, one txt, one duplicate
await page.setInputFiles('#file-input', [
  { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
]);
await page.click('#samples-btn');
await page.waitForFunction(() => document.querySelectorAll('#library .item').length >= 14, null, { timeout: 30000 });
console.log('library items:', await page.locator('#library .item').count(), '| count:', await page.textContent('#library-count'));
console.log('messages:', await page.$$eval('#upload-messages li', ls => ls.map(l => l.textContent)));
await page.waitForFunction(() => ['ready', 'error'].includes(window.__snapfind.model.state.status), null, { timeout: expectReady ? 600000 : 120000 });
console.log('model state:', JSON.stringify(await page.evaluate(() => window.__snapfind.model.state)));
console.log('model line:', await page.textContent('#model-status'), '| retry visible:', await page.isVisible('#model-retry'));
await page.fill('#search-input', 'قطة'); await page.click('#search-form button[type=submit]');
await page.waitForTimeout(500);
console.log('search status:', await page.textContent('#search-status'));
if (shots) await page.screenshot({ path: `${shots}/smoke-ar.png`, fullPage: true });
await page.reload();
await page.waitForFunction(() => document.querySelectorAll('#library .item').length >= 14, null, { timeout: 30000 });
console.log('after reload items:', await page.locator('#library .item').count());
await page.click('#lang-toggle');
console.log('after toggle dir:', await page.evaluate(() => document.documentElement.dir), '|', await page.textContent('#search-form button[type=submit]'));
if (shots) { await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: `${shots}/smoke-en-mobile.png`, fullPage: false }); }
const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log('horizontal overflow on mobile:', hScroll);
const external = [...new Set(requests.map(u => new URL(u).host))].filter(h => h !== new URL(base).host);
console.log('external hosts contacted:', external);
console.log('console errors:', errors.slice(0, 10));
await browser.close();
