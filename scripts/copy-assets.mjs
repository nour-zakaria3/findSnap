// Copies runtime assets from npm packages into public/vendor-free locations so the
// app serves them itself (no CDN): ONNX Runtime WASM and Tesseract worker/core/lang data.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';

import { join } from 'node:path';

const pkgDir = (name) => join('node_modules', name);

const ortDist = join(pkgDir('onnxruntime-web'), 'dist');
mkdirSync('public/ort', { recursive: true });
for (const f of readdirSync(ortDist)) if (/^ort-wasm-simd-threaded\.(jsep|asyncify)?\.?(mjs|wasm)$/.test(f) || /^ort-wasm-simd-threaded\.(mjs|wasm)$/.test(f)) cpSync(join(ortDist, f), join('public/ort', f));

mkdirSync('public/tesseract/core', { recursive: true });
mkdirSync('public/tesseract/lang', { recursive: true });
cpSync(join(pkgDir('tesseract.js'), 'dist/worker.min.js'), 'public/tesseract/worker.min.js');
const core = pkgDir('tesseract.js-core');
for (const f of readdirSync(core)) if (/^tesseract-core.*lstm\.(js|wasm|wasm\.js)$/.test(f)) cpSync(join(core, f), join('public/tesseract/core', f));
for (const l of ['ara', 'eng']) cpSync(join(pkgDir(`@tesseract.js-data/${l}`), `4.0.0_best_int/${l}.traineddata.gz`), `public/tesseract/lang/${l}.traineddata.gz`);
console.log('assets copied');
