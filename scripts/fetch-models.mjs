// Downloads the files the app needs for a model into public/models/<repo id>/,
// so the deployed site can serve the model itself (no third-party request at runtime).
// Usage: node scripts/fetch-models.mjs [modelKey] [--out public/models]
// Requires network access to huggingface.co (run in CI if the dev machine can't reach it).
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MODELS, ACTIVE_MODEL } from '../src/config.js';

const key = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : ACTIVE_MODEL;
const outIdx = process.argv.indexOf('--out');
const out = outIdx > 0 ? process.argv[outIdx + 1] : 'public/models';
const cfg = MODELS[key];
const repos = [{ id: cfg.id, onnx: cfg.onnxFiles }, ...(cfg.translate ? [{ id: cfg.translate.id, onnx: cfg.translate.onnxFiles }] : [])];
const SKIP = /\.(md|bin|safetensors|h5|msgpack|ot|pt|onnx_data)$|^\.gitattributes$/;

async function get(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url);
    if (r.ok) return r;
    if (r.status === 404) throw new Error(`404 ${url}`);
    await new Promise(res => setTimeout(res, 2000 * 2 ** i));
  }
  throw new Error(`failed ${url}`);
}

let total = 0;
for (const { id, onnx } of repos) {
  const meta = await (await get(`https://huggingface.co/api/models/${id}`)).json();
  const files = meta.siblings.map(s => s.rfilename)
    .filter(f => (!f.includes('/') && !SKIP.test(f)) || onnx.map(o => `onnx/${o}`).includes(f));
  for (const o of onnx) if (!files.includes(`onnx/${o}`)) throw new Error(`${id} has no onnx/${o}`);
  for (const f of files) {
    const dest = join(out, id, f);
    if (existsSync(dest) && statSync(dest).size > 0) { total += statSync(dest).size; continue; }
    mkdirSync(dirname(dest), { recursive: true });
    const buf = Buffer.from(await (await get(`https://huggingface.co/${id}/resolve/${meta.sha}/${f}`)).arrayBuffer());
    writeFileSync(dest, buf); total += buf.length;
    console.log(`${id}/${f} ${(buf.length / 1e6).toFixed(1)} MB`);
  }
}
console.log(`model files ready in ${out}: ${(total / 1e6).toFixed(0)} MB`);
