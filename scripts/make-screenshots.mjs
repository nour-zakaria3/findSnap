// Generates synthetic, copyright-free screenshots (Arabic + English) for testing and demo.
// Usage: node scripts/make-screenshots.mjs <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'test-data/screens';
mkdirSync(out, { recursive: true });

const base = `body{margin:0;font-family:"Noto Sans Arabic","Noto Sans","DejaVu Sans",sans-serif}`;
const pages = {
  'receipt-ar': [`<div dir="rtl" style="width:380px;margin:20px auto;background:#fff;padding:24px;border:1px dashed #999;font-size:18px">
    <h2 style="text-align:center;margin:0">مطعم الياسمين</h2><p style="text-align:center">فاتورة ضريبية مبسطة<br>رقم الفاتورة: 1047</p><hr>
    <p>شاورما دجاج × 2 ........ 30 ريال</p><p>عصير برتقال × 1 ........ 12 ريال</p><p>حمص × 1 ........ 15 ريال</p><hr>
    <h3>الإجمالي: 57 ريال</h3><p style="text-align:center">شكراً لزيارتكم</p></div>`, 'body{background:#eee}', [440, 520]],
  'invoice-en': [`<div style="width:560px;margin:20px auto;background:#fff;padding:28px;font-size:16px;border-top:8px solid #2b6cb0">
    <h1 style="margin:0;color:#2b6cb0">INVOICE</h1><p>Invoice #2025-118 · Due: 15 Nov 2025</p><p><b>Bill to:</b> Northwind Design Ltd.</p>
    <table style="width:100%;border-collapse:collapse"><tr style="background:#edf2f7"><th align=left>Item</th><th>Qty</th><th align=right>Amount</th></tr>
    <tr><td>Website redesign</td><td align=center>1</td><td align=right>$2,400.00</td></tr><tr><td>Hosting (12 months)</td><td align=center>1</td><td align=right>$180.00</td></tr></table>
    <h2 style="text-align:right">Total: $2,580.00</h2></div>`, 'body{background:#cbd5e0}', [620, 440]],
  'chat-ar': [`<div dir="rtl" style="width:360px;height:600px;margin:0 auto;background:#e5ddd5;display:flex;flex-direction:column">
    <div style="background:#075e54;color:#fff;padding:14px;font-size:18px">سارة</div>
    <div style="padding:12px;display:flex;flex-direction:column;gap:10px;font-size:17px">
    <div style="align-self:flex-start;background:#dcf8c6;padding:8px 12px;border-radius:8px">مرحبا! هل وصلت إلى المطار؟</div>
    <div style="align-self:flex-end;background:#fff;padding:8px 12px;border-radius:8px">نعم، الرحلة تقلع الساعة 9 مساءً</div>
    <div style="align-self:flex-start;background:#dcf8c6;padding:8px 12px;border-radius:8px">رحلة سعيدة، أرسل لي عندما تصل ✈️</div>
    <div style="align-self:flex-end;background:#fff;padding:8px 12px;border-radius:8px">إن شاء الله، شكراً 🙏</div></div>
    <div style="margin-top:auto;background:#f0f0f0;padding:10px"><div style="background:#fff;border-radius:20px;padding:10px;color:#999">اكتب رسالة</div></div></div>`, '', [360, 600]],
  'code-editor': [`<div style="width:720px;background:#1e1e1e;color:#d4d4d4;font:15px/1.6 'DejaVu Sans Mono',monospace;padding:0">
    <div style="background:#2d2d2d;color:#ccc;padding:8px 14px;font-family:sans-serif">main.py — Visual Studio Code</div><pre style="margin:0;padding:16px">
<span style="color:#c586c0">import</span> pandas <span style="color:#c586c0">as</span> pd

<span style="color:#569cd6">def</span> <span style="color:#dcdcaa">load_sales</span>(path):
    df = pd.read_csv(path)
    df[<span style="color:#ce9178">"total"</span>] = df[<span style="color:#ce9178">"price"</span>] * df[<span style="color:#ce9178">"qty"</span>]
    <span style="color:#c586c0">return</span> df.groupby(<span style="color:#ce9178">"month"</span>).sum()

<span style="color:#c586c0">if</span> __name__ == <span style="color:#ce9178">"__main__"</span>:
    <span style="color:#dcdcaa">print</span>(load_sales(<span style="color:#ce9178">"sales.csv"</span>))
</pre></div>`, 'body{background:#1e1e1e}', [720, 360]],
  'weather-en': [`<div style="width:360px;height:560px;background:linear-gradient(#4facfe,#00f2fe);color:#fff;text-align:center;padding-top:40px;font-size:18px">
    <div style="font-size:26px">Dubai</div><div style="font-size:96px">☀️</div><div style="font-size:72px;font-weight:200">38°</div><div>Sunny · H:41° L:30°</div>
    <div style="display:flex;justify-content:space-around;margin-top:40px"><div>Mon<br>☀️<br>40°</div><div>Tue<br>⛅<br>37°</div><div>Wed<br>🌧️<br>31°</div></div></div>`, '', [360, 600]],
  'boarding-pass': [`<div style="width:640px;margin:20px;background:#fff;border-radius:16px;overflow:hidden;font-size:16px;box-shadow:0 2px 8px #0003">
    <div style="background:#1a365d;color:#fff;padding:16px;font-size:22px">✈ BOARDING PASS · بطاقة صعود الطائرة</div>
    <div style="display:flex;justify-content:space-between;padding:20px;font-size:40px;font-weight:bold"><span>RUH</span><span>→</span><span>CAI</span></div>
    <div style="display:flex;justify-content:space-between;padding:0 20px 20px"><span>Flight SV 305</span><span>Gate B12</span><span>Seat 14A</span><span>Boarding 20:35</span></div></div>`, 'body{background:#e2e8f0}', [680, 300]],
  'chart-dashboard': [`<div style="width:640px;background:#fff;padding:20px;font-size:15px"><h2 style="margin:0 0 12px">Monthly Revenue 2025</h2>
    <div style="display:flex;align-items:flex-end;gap:14px;height:240px;border-bottom:2px solid #333;border-left:2px solid #333;padding:0 10px">
    ${[40,65,50,80,95,70,110,120].map((h,i)=>`<div style="flex:1;background:#3182ce;height:${h*1.8}px" title="${i}"></div>`).join('')}</div>
    <div style="display:flex;gap:14px;padding:4px 10px">${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'].map(m=>`<div style="flex:1;text-align:center">${m}</div>`).join('')}</div></div>`, '', [680, 360]],
  'error-dialog': [`<div style="width:600px;height:340px;background:#f7fafc;display:flex;align-items:center;justify-content:center">
    <div style="background:#fff;border-radius:12px;box-shadow:0 4px 20px #0003;padding:24px;width:400px;font-size:16px">
    <div style="color:#c53030;font-size:22px;font-weight:bold">⚠ Connection failed</div><p>Unable to connect to the server. Please check your internet connection and try again.</p>
    <div style="text-align:right"><button style="font-size:16px;padding:8px 18px">Cancel</button> <button style="font-size:16px;padding:8px 18px;background:#3182ce;color:#fff;border:0">Retry</button></div></div></div>`, '', [600, 340]],
  'calendar-ar': [`<div dir="rtl" style="width:420px;background:#fff;padding:18px;font-size:17px"><h2 style="margin:0 0 10px">التقويم — نوفمبر</h2>
    <div style="border-right:5px solid #805ad5;background:#faf5ff;padding:10px;margin:8px 0">10:00 ص — اجتماع فريق المشروع</div>
    <div style="border-right:5px solid #38a169;background:#f0fff4;padding:10px;margin:8px 0">1:00 م — غداء مع العائلة</div>
    <div style="border-right:5px solid #dd6b20;background:#fffaf0;padding:10px;margin:8px 0">4:30 م — موعد طبيب الأسنان</div>
    <div style="border-right:5px solid #3182ce;background:#ebf8ff;padding:10px;margin:8px 0">7:00 م — محاضرة الذكاء الاصطناعي</div></div>`, '', [420, 330]],
};

const browser = await chromium.launch();
for (const [name, [html, css, [w, h]]] of Object.entries(pages)) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${base}${css}</style>${html}`);
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.close();
}
await browser.close();
console.log('wrote', Object.keys(pages).length, 'screenshots to', out);
