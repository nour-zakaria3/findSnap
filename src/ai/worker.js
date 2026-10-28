// Web Worker that owns the AI model so inference never freezes the page.
import * as T from '@huggingface/transformers';
import { MODELS } from '../config.js';
import { createEmbedder } from './embedder.js';

// Models are served from this site when the build bundled them (VITE_SELF_HOST_MODELS=1),
// otherwise they are downloaded from huggingface.co. Either way they are cached by the browser.
const SELF_HOSTED = import.meta.env.VITE_SELF_HOST_MODELS === '1';
// Self-hosted files are tried first; huggingface.co remains a fallback for anything missing.
T.env.allowLocalModels = SELF_HOSTED;
T.env.allowRemoteModels = true;
// Must be a path, not an absolute URL: transformers.js skips "local" lookups for http(s) URLs.
if (SELF_HOSTED) T.env.localModelPath = `${import.meta.env.BASE_URL}models/`;
// ONNX Runtime WASM files are served from this site, not from a CDN.
T.env.backends.onnx.wasm.wasmPaths = new URL(`${import.meta.env.BASE_URL}ort/`, self.location.origin).href;

let embedder = null;
let loading = null;
const post = (msg) => self.postMessage(msg);

async function hasWebGPU() {
  try { return !!(self.navigator.gpu && await self.navigator.gpu.requestAdapter()); } catch { return false; }
}

async function isCached(cfg) {
  try {
    const c = await caches.open('transformers-cache');
    const keys = await c.keys();
    return keys.some(k => k.url.includes(cfg.id) && k.url.includes('.onnx'));
  } catch { return false; }
}

async function warmUp(emb) {
  const canvas = new OffscreenCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c33'; ctx.fillRect(0, 0, 64, 64);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const img = await emb.embedImage(blob);
  const { vector } = await emb.embedText('a red square');
  if (!img.length || img.length !== vector.length || !Number.isFinite(img[0]) || !Number.isFinite(vector[0]))
    throw new Error(`warm-up produced invalid embeddings (${img.length} vs ${vector.length})`);
  return img.length;
}

async function load(modelKey, devicePref) {
  const cfg = MODELS[modelKey];
  if (!cfg) throw new Error(`Unknown model ${modelKey}`);
  const cached = await isCached(cfg);
  const files = new Map(); // file -> {loaded,total}
  let dlStart = null, dlEnd = null;
  const onProgress = (p) => {
    if (p.status === 'initiate' || p.status === 'download') { dlStart ??= performance.now(); }
    if (p.status === 'progress') {
      files.set(`${p.name}/${p.file}`, { loaded: p.loaded, total: p.total });
      let loaded = 0, total = 0;
      for (const f of files.values()) { loaded += f.loaded || 0; total += f.total || 0; }
      post({ type: 'status', status: 'downloading', loaded, total, file: p.file, cached });
    }
    if (p.status === 'done') dlEnd = performance.now();
  };

  const devices = devicePref ? [devicePref] : (await hasWebGPU()) ? ['webgpu', 'wasm'] : ['wasm'];
  let lastErr;
  for (const device of devices) {
    try {
      post({ type: 'status', status: 'downloading', loaded: 0, total: 0, cached, device });
      const t0 = performance.now();
      const emb = await createEmbedder(T, cfg, { device, onProgress });
      const tLoaded = performance.now();
      post({ type: 'status', status: 'initializing', device });
      const dims = await warmUp(emb);
      const tReady = performance.now();
      const downloadMs = dlStart != null && dlEnd != null ? dlEnd - dlStart : 0;
      embedder = emb;
      return {
        device, dims, cached, modelKey,
        timings: { downloadMs: Math.round(downloadMs), loadMs: Math.round(tLoaded - t0), warmupMs: Math.round(tReady - tLoaded), totalMs: Math.round(tReady - t0) },
      };
    } catch (err) {
      lastErr = err;
      console.warn(`[SnapFind] model failed on ${device}`, err);
    }
  }
  throw lastErr;
}

self.onmessage = async ({ data }) => {
  const { type, reqId } = data;
  try {
    if (type === 'load') {
      loading ??= load(data.modelKey, data.device).finally(() => { loading = null; });
      const info = await loading;
      post({ type: 'status', status: 'ready', ...info });
      return;
    }
    if (!embedder) throw new Error('model-not-ready');
    if (type === 'embedImage') {
      const t0 = performance.now();
      const vector = await embedder.embedImage(data.blob);
      post({ type: 'result', reqId, vector, ms: performance.now() - t0 }, [vector.buffer]);
    } else if (type === 'embedText') {
      const t0 = performance.now();
      const { vector, usedText } = await embedder.embedText(data.text);
      post({ type: 'result', reqId, vector, usedText, ms: performance.now() - t0 });
    }
  } catch (err) {
    const message = err?.message || String(err);
    if (type === 'load') post({ type: 'status', status: 'error', message });
    else post({ type: 'error', reqId, message });
  }
};
