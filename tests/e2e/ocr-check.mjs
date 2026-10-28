// Real-browser OCR check: sample screenshots must yield text, and OCR keyword search must find them.
// Usage: node tests/e2e/ocr-check.mjs <baseUrl>
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
const u = new URL(process.argv[2]); u.searchParams.set('db', `ocr-${Date.now()}`);
await p.goto(u.href);
await p.click('#samples-btn');
await p.waitForFunction(() => { const its = [...document.querySelectorAll('#library .item')]; return its.length >= 14 && its.every(i => ['ready', 'error'].includes(i.dataset.status)); }, null, { timeout: 600000 });
const recs = await p.evaluate(() => [...window.__snapfind.state.records.values()].map(r => [r.name, (r.ocrText || '').slice(0, 80), r.ocrError || '']));
for (const r of recs) console.log(r.join(' | '));
let ok = true;
for (const [q, want] of [['فاتورة', 'receipt-ar.png'], ['invoice', 'invoice-en.png'], ['المطار', 'chat-ar.png'], ['pandas', 'code-editor.png']]) {
  await p.fill('#search-input', q); await p.click('#search-form button[type=submit]');
  await p.waitForFunction(q => window.__snapfind.state.lastResults?.q === q, q);
  const hits = await p.evaluate(() => window.__snapfind.state.lastResults.ranked.filter(h => h.ocrMatch).map(h => window.__snapfind.state.records.get(h.id).name));
  const pass = hits.includes(want); ok &&= pass;
  console.log(pass ? 'PASS' : 'FAIL', q, '->', hits);
}
await b.close(); process.exit(ok ? 0 : 1);
