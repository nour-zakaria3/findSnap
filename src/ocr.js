// OCR with Tesseract.js. Worker script, WASM core and language data are self-hosted
// (copied from npm packages at build time), so OCR makes no third-party requests.
import { createWorker } from 'tesseract.js';

let workerPromise = null;
const base = () => `${new URL(import.meta.env.BASE_URL, location.origin).href}tesseract/`;

function getWorker() {
  workerPromise ??= createWorker(['ara', 'eng'], 1, {
    workerPath: `${base()}worker.min.js`,
    corePath: `${base()}core/`,
    langPath: `${base()}lang/`,
    gzip: true,
    cacheMethod: 'write',
  }).catch(err => { workerPromise = null; throw err; });
  return workerPromise;
}

export async function recognizeText(blob) {
  const worker = await getWorker();
  // tesseract.js v5+ only returns word-level data when `blocks` output is requested.
  const { data } = await worker.recognize(blob, {}, { text: true, blocks: true });
  return cleanOcrWords((data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words))));
}

// Keep confident words that contain at least two letters; Tesseract emits symbol noise on photos.
export function cleanOcrWords(words) {
  const kept = words
    .filter(w => w.confidence >= 60)
    .map(w => w.text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim())
    .filter(t => (t.match(/\p{L}/gu) || []).length >= 2 || (t.match(/\p{N}/gu) || []).length >= 3);
  const text = kept.join(' ').replace(/\s+/g, ' ').trim();
  return text.length >= 3 ? text : '';
}
