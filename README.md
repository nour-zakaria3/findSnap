# SnapFind

Search your photos and screenshots by describing them, in Arabic or English. Everything runs in your
browser: images, search queries, OCR text and AI embeddings never leave your device.

- Vanilla JS + Vite, IndexedDB storage, Transformers.js (ONNX Runtime Web, WebGPU with WASM fallback), Tesseract.js OCR.
- Arabic UI (right-to-left) by default, English (left-to-right) with one click.
- No backend, no accounts, no paid APIs.

## Run it locally

**Windows:** install Node.js LTS from https://nodejs.org/, then double-click `start.bat`. It installs, builds and opens http://localhost:4173/.
**Mac/Linux:** `./start.sh`.

Do not open `index.html` directly (file://): browsers block the scripts and the AI model there.

Manual steps:

Requires Node.js 20+ (22 recommended) and a recent Chrome, Edge or Firefox.

```bash
npm install
npm run build
npm run preview        # open http://localhost:4173/
```

For development with hot reload: `npm run dev` (http://localhost:5173/).

### Try the demo flow

1. Open the page. The **AI model** card shows the download progress, then “Model ready (WebGPU/WASM)”.
2. Click **Use sample images** (14 images: photos + Arabic/English screenshots) or add your own.
3. Each image goes Queued → Analyzing… → Ready.
4. Search, e.g. `قطة`, `فاتورة مطعم`, `a rocket at night`, `programming code`. The best match is outlined in green;
   Arabic queries show the English text they were translated to.
5. Refresh the page: the library and its embeddings are still there.

Add `?db=test1` to the URL to use a separate, throwaway library (your real one is untouched).

## Network use (what goes over the internet)

| When | What | Where |
|---|---|---|
| First visit | Model files, about 220 MB (CLIP ViT-B/32 + Arabic→English translator, 8-bit) | huggingface.co (or this site, if built with self-hosted models) |
| Later visits | Nothing for the model: files come from the browser cache | — |
| Always | The app's own JS/CSS/WASM, OCR data | the site itself |

Images, queries, OCR text and embeddings are never sent anywhere. Fully offline use after the first load has
**not been verified yet**.

To serve the model files from your own machine instead of Hugging Face:

```bash
npm run models:fetch                                   # downloads into public/models/
VITE_SELF_HOST_MODELS=1 npm run build && npm run preview
```

## Tests

```bash
npm test                    # unit tests (storage, queue, validation, search, backup, i18n)
npm run feasibility         # REAL model: Arabic + English retrieval on test-data/ (30 queries each), timings
npx playwright install chromium   # once, for the browser tests
npm run preview &           # then, in another terminal:
npm run test:smoke          # UI smoke test in a real browser
npm run test:e2e            # full demo flow with the real model, Arabic + English queries, reload persistence
```

All browser tests use an isolated database (`?db=…`).

## Project layout

```
src/main.js        UI wiring          src/db.js        IndexedDB (never clears data on its own)
src/queue.js       sequential queue   src/search.js    cosine ranking + Arabic-aware OCR matching
src/ai/worker.js   model Web Worker   src/ai/embedder.js  shared embedding code (browser + Node tests)
src/ocr.js         Tesseract.js       src/backup.js    export/import JSON backup
src/config.js      model choice       test-data/       retrieval test set + ground truth
```

To publish it on GitHub Pages, follow [DEPLOY.md](DEPLOY.md).
Test data licenses: `test-data/LICENSES.md`.
