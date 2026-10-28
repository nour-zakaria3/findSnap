// Real-model retrieval test on test-data/ (no mocks).
// Usage: node scripts/feasibility.mjs <modelKey> [--local <dir>] [--out report.json]
// Measures download+load time, per-image and per-query inference time, and recall@1/@3/MRR
// for English and Arabic queries against the ground truth in test-data/queries.json.
import * as T from '@huggingface/transformers';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { MODELS } from '../src/config.js';
import { createEmbedder } from '../src/ai/embedder.js';

const args = process.argv.slice(2);
const key = args[0];
const cfg = MODELS[key];
if (!cfg) { console.error('unknown model', key, Object.keys(MODELS)); process.exit(2); }
const localIdx = args.indexOf('--local');
if (localIdx >= 0) { T.env.allowRemoteModels = false; T.env.localModelPath = args[localIdx + 1]; }
const outIdx = args.indexOf('--out');
T.env.cacheDir = '.feasibility-cache';

const root = 'test-data';
const files = ['photos', 'screens'].flatMap(d => readdirSync(join(root, d)).map(f => `${d}/${f}`)).sort();
const { queries } = JSON.parse(readFileSync(join(root, 'queries.json'), 'utf8'));

let bytes = 0; const seen = new Set();
const onProgress = (p) => { if (p.status === 'progress' && p.progress === 100 && !seen.has(p.file + p.name)) { seen.add(p.file + p.name); bytes += p.total || 0; } };

const t0 = performance.now();
const emb = await createEmbedder(T, cfg, { onProgress });
const loadMs = performance.now() - t0;
console.log(`[${key}] loaded in ${(loadMs / 1000).toFixed(1)}s (${(bytes / 1e6).toFixed(0)} MB fetched)`);

const imgVecs = []; const imgTimes = [];
for (const f of files) {
  const s = performance.now();
  imgVecs.push(await emb.embedImage(join(root, f)));
  imgTimes.push(performance.now() - s);
}
const dims = imgVecs[0].length;

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const results = { en: [], ar: [] }; const qTimes = { en: [], ar: [] };
for (const q of queries) {
  for (const lang of ['en', 'ar']) {
    const s = performance.now();
    const { vector, usedText } = await emb.embedText(q[lang]);
    qTimes[lang].push(performance.now() - s);
    if (vector.length !== dims) throw new Error(`dim mismatch text ${vector.length} vs image ${dims}`);
    const ranked = files.map((f, i) => ({ f, s: dot(vector, imgVecs[i]) })).sort((a, b) => b.s - a.s);
    const rank = ranked.findIndex(r => q.relevant.includes(r.f)) + 1;
    results[lang].push({ q: q[lang], usedText, rank, top3: ranked.slice(0, 3).map(r => `${r.f} (${r.s.toFixed(3)})`) });
  }
}
const stats = (rs) => ({
  n: rs.length,
  recallAt1: +(rs.filter(r => r.rank === 1).length / rs.length).toFixed(3),
  recallAt3: +(rs.filter(r => r.rank <= 3).length / rs.length).toFixed(3),
  mrr: +(rs.reduce((s, r) => s + 1 / r.rank, 0) / rs.length).toFixed(3),
});
const median = (a) => { const s = [...a].sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(1); };
const report = {
  model: key, id: cfg.id, translate: cfg.translate?.id ?? null, dtype: cfg.dtype,
  env: { runtime: `node ${process.version} (onnxruntime-node, CPU)`, cpu: os.cpus()[0]?.model, cores: os.cpus().length, ramGB: Math.round(os.totalmem() / 1e9) },
  images: files.length, queries: queries.length, embeddingDims: dims,
  downloadedMB: +(bytes / 1e6).toFixed(1), loadMs: Math.round(loadMs),
  imageEmbedMs: { median: median(imgTimes), first: +imgTimes[0].toFixed(1) },
  textEmbedMs: { en: median(qTimes.en), ar: median(qTimes.ar) },
  en: stats(results.en), ar: stats(results.ar), details: results,
};
console.log(JSON.stringify({ ...report, details: undefined }, null, 2));
for (const lang of ['en', 'ar']) for (const r of results[lang]) if (r.rank !== 1)
  console.log(`  miss ${lang} rank=${r.rank} "${r.q}"${r.usedText !== r.q ? ` -> "${r.usedText}"` : ''}  top: ${r.top3[0]}`);
if (outIdx >= 0) writeFileSync(args[outIdx + 1], JSON.stringify(report, null, 2));
