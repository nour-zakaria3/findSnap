import { t, setLocale, getLocale } from './i18n.js';
import { openDB } from './db.js';
import { validateFile, hashBlob } from './validate.js';
import { createQueue } from './queue.js';
import { rankImages } from './search.js';
import { exportLibrary, importLibrary } from './backup.js';
import { createModelClient } from './ai/client.js';
import { MODELS, ACTIVE_MODEL } from './config.js';
import { recognizeText } from './ocr.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
// ?db=<name> uses a separate database so tests never touch the real library.
const DB_NAME = params.get('db') ? `snapfind-test-${params.get('db')}` : 'snapfind';
const OCR_ENABLED = params.get('ocr') !== '0';
const MAX_RESULTS = 12;

const EXAMPLES = ['قطة', 'فنجان قهوة', 'فاتورة مطعم', 'رائد فضاء', 'a rocket at night', 'programming code', 'a bar chart', 'chat messages'];

const state = {
  db: null,
  records: new Map(),
  urls: new Map(),
  pendingQuery: null,
  lastQuery: null,
  modelState: { status: 'idle' },
};

const model = createModelClient({ modelKey: ACTIVE_MODEL, device: params.get('device') || undefined });
window.__snapfind = { model, state }; // exposed for automated browser tests

// ---------- i18n ----------
function applyStaticText() {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $('search-input').placeholder = t('search.placeholder');
  $('network-note').textContent = t('privacy.network', { size: `\u2066${MODELS[ACTIVE_MODEL].approxSize}\u2069` });
  $('examples').replaceChildren(...EXAMPLES.map(q => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = q;
    b.addEventListener('click', () => { $('search-input').value = q; runSearch(q); });
    return b;
  }));
  if (DB_NAME !== 'snapfind') { $('testdb-banner').hidden = false; $('testdb-banner').textContent = t('testdb', { name: DB_NAME }); }
}

function initLocale() {
  let saved = params.get('lang');
  try { saved ??= localStorage.getItem('snapfind.lang'); } catch {}
  setLocale(saved === 'en' ? 'en' : 'ar');
  $('lang-toggle').addEventListener('click', () => {
    setLocale(getLocale() === 'ar' ? 'en' : 'ar');
    try { localStorage.setItem('snapfind.lang', getLocale()); } catch {}
    applyStaticText(); renderModel(); renderLibrary(); rerenderSearch();
  });
  applyStaticText();
}

// ---------- model panel ----------
const fmtMB = (b) => `${(b / 1e6).toFixed(0)} MB`;
function renderModel() {
  const s = state.modelState;
  const line = $('model-status'); const bar = $('model-progress');
  line.className = 'status-line';
  bar.hidden = s.status !== 'downloading';
  $('model-retry').hidden = s.status !== 'error';
  $('model-timings').hidden = s.status !== 'ready';
  if (s.status === 'idle') line.textContent = t('model.idle');
  if (s.status === 'downloading') {
    const pct = s.total ? `${fmtMB(s.loaded)} / ${fmtMB(s.total)}` : '';
    line.textContent = t('model.downloading', { pct }) + (s.cached ? ` (${t('model.cached')})` : '');
    if (s.total) { bar.max = s.total; bar.value = s.loaded; } else bar.removeAttribute('value');
  }
  if (s.status === 'initializing') line.textContent = t('model.initializing');
  if (s.status === 'ready') {
    line.textContent = '✓ ' + t('model.ready', { device: s.device === 'webgpu' ? 'WebGPU' : 'WASM' });
    line.classList.add('ok');
    const tm = s.timings || {};
    $('model-timings').textContent = `${MODELS[ACTIVE_MODEL].id}${MODELS[ACTIVE_MODEL].translate ? ' + ' + MODELS[ACTIVE_MODEL].translate.id : ''} · download ${(tm.downloadMs / 1000).toFixed(1)}s · load ${(tm.loadMs / 1000).toFixed(1)}s · warm-up ${(tm.warmupMs / 1000).toFixed(1)}s${s.cached ? ' · cached' : ''}`;
  }
  if (s.status === 'error') { line.textContent = t('model.error', { message: friendlyError(s.message) }); line.classList.add('err'); }
}

function friendlyError(msg = '') {
  if (/fetch|network|load failed|ERR_/i.test(msg)) return t('error.network');
  if (/memory|allocation/i.test(msg)) return t('error.memory');
  return msg;
}

// ---------- library rendering ----------
function urlFor(rec) {
  if (!state.urls.has(rec.id)) state.urls.set(rec.id, URL.createObjectURL(rec.thumb || rec.blob));
  return state.urls.get(rec.id);
}

function itemEl(rec, extra) {
  const el = document.createElement('figure');
  el.className = 'item'; el.dataset.id = rec.id; el.dataset.status = rec.status;
  const img = document.createElement('img');
  img.src = urlFor(rec); img.alt = rec.name; img.loading = 'lazy';
  const meta = document.createElement('figcaption'); meta.className = 'meta';
  const name = document.createElement('div'); name.className = 'name'; name.textContent = rec.name; name.title = rec.name;
  const badge = document.createElement('span'); badge.className = `badge ${rec.status}`; badge.textContent = t(`status.${rec.status}`);
  meta.append(name, badge);
  if (extra) meta.append(...extra);
  if (rec.status === 'error' && rec.error) {
    const e = document.createElement('div'); e.className = 'err-text'; e.textContent = rec.error; meta.append(e);
  }
  if (rec.ocrText) { img.title = `${t('ocr.text')}: ${rec.ocrText.slice(0, 300)}`; }
  const actions = document.createElement('div'); actions.className = 'actions';
  if (rec.status === 'error') actions.append(button(t('action.retry'), () => queue.retry(rec.id)));
  actions.append(button(t('action.delete'), () => deleteOne(rec.id)));
  meta.append(actions);
  el.append(img, meta);
  return el;
}

function button(label, onClick) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = label;
  b.addEventListener('click', onClick); return b;
}

function sortedRecords() { return [...state.records.values()].sort((a, b) => b.createdAt - a.createdAt); }

function renderLibrary() {
  const recs = sortedRecords();
  $('library').replaceChildren(...recs.map(r => itemEl(r)));
  $('library-empty').hidden = recs.length > 0;
  const ready = recs.filter(r => r.status === 'ready').length;
  $('library-count').textContent = t('library.count', { count: recs.length, ready });
  $('delete-all-btn').disabled = $('export-btn').disabled = recs.length === 0;
}

// ---------- processing ----------
async function processRecord(rec) {
  const embedding = await model.embedImage(rec.blob);
  const patch = { embedding, modelKey: ACTIVE_MODEL };
  if (OCR_ENABLED) {
    try { patch.ocrText = await recognizeText(rec.blob); patch.ocrError = undefined; }
    catch (err) { patch.ocrError = String(err?.message || err); console.warn('[SnapFind] OCR failed', err); }
  }
  return patch;
}

let queue;

async function refreshRecord(id) {
  const rec = await state.db.getImage(id);
  if (rec) state.records.set(id, rec); else state.records.delete(id);
  renderLibrary();
}

// ---------- upload ----------
async function makeThumb(blob) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const dims = { width: bmp.width, height: bmp.height };
  bmp.close?.();
  const thumb = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
  return { thumb, ...dims };
}

function message(text, ok = false) {
  const li = document.createElement('li'); li.textContent = text; if (ok) li.className = 'ok';
  $('upload-messages').prepend(li);
  while ($('upload-messages').children.length > 8) $('upload-messages').lastChild.remove();
}

async function addFiles(files) {
  let added = 0;
  for (const file of files) {
    const v = validateFile(file);
    if (!v.ok) { message(t('upload.rejected', { name: file.name, reason: t(`reason.${v.reason}`) })); continue; }
    try {
      const hash = await hashBlob(file);
      if (await state.db.findByHash(hash)) { message(t('upload.duplicate', { name: file.name })); continue; }
      let thumbInfo;
      try { thumbInfo = await makeThumb(file); }
      catch { message(t('upload.rejected', { name: file.name, reason: t('reason.unreadable') })); continue; }
      const rec = {
        id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, hash,
        blob: new Blob([file], { type: file.type }), thumb: thumbInfo.thumb,
        width: thumbInfo.width, height: thumbInfo.height,
        createdAt: Date.now(), status: 'queued',
      };
      await state.db.putImage(rec);
      state.records.set(rec.id, rec);
      queue.enqueue(rec.id);
      added++;
    } catch (err) {
      message(t('upload.rejected', { name: file.name, reason: err.message }));
    }
  }
  if (added) { message(t('upload.added', { count: added }), true); requestPersistence(); }
  renderLibrary();
}

async function addSamples() {
  $('samples-btn').disabled = true;
  try {
    const base = import.meta.env.BASE_URL + 'samples/';
    const names = await (await fetch(base + 'index.json')).json();
    const files = await Promise.all(names.map(async n => {
      const b = await (await fetch(base + n)).blob();
      return new File([b], n, { type: b.type || (n.endsWith('.png') ? 'image/png' : 'image/jpeg') });
    }));
    await addFiles(files);
  } finally { $('samples-btn').disabled = false; }
}

// ---------- search ----------
let searchSeq = 0;
async function runSearch(raw) {
  const q = raw.trim();
  const status = $('search-status');
  status.className = 'status-line';
  if (!q) { clearSearch(); return; }
  state.lastQuery = q;
  const seq = ++searchSeq;
  const ready = [...state.records.values()].filter(r => r.status === 'ready' && r.embedding);
  if (state.modelState.status !== 'ready') {
    state.pendingQuery = q;
    status.textContent = state.modelState.status === 'error' ? t('search.modelFailed') : t('search.waiting');
    return;
  }
  if (!ready.length) { status.textContent = t('search.noReady'); $('results').replaceChildren(); return; }
  status.textContent = '…';
  try {
    const { vector, usedText, ms } = await model.embedText(q);
    if (seq !== searchSeq) return; // a newer query superseded this one
    const ranked = rankImages(vector, ready, { text: q }).slice(0, MAX_RESULTS);
    state.lastResults = { q, usedText, ranked, ms };
    renderResults();
  } catch (err) {
    if (seq !== searchSeq) return;
    status.textContent = t('model.error', { message: err.message }); status.classList.add('err');
  }
}

function renderResults() {
  const r = state.lastResults; if (!r) return;
  const status = $('search-status');
  const parts = [r.ranked.length ? t('search.results', { q: r.q, count: r.ranked.length }) : t('search.none', { q: r.q })];
  if (r.usedText && r.usedText !== r.q) parts.push(t('search.translated', { text: r.usedText }));
  parts.push(`(${Math.round(r.ms)} ms)`);
  status.textContent = parts.join(' · ');
  const top = r.ranked[0]?.score ?? 1;
  $('results').replaceChildren(...r.ranked.map((hit, i) => {
    const rec = state.records.get(hit.id); if (!rec) return document.createComment('');
    const score = document.createElement('div'); score.className = 'score'; score.title = `${t('search.score')}: ${hit.semantic.toFixed(3)}`;
    const fill = document.createElement('span'); fill.style.width = `${Math.max(4, Math.round((hit.score / top) * 100))}%`; score.append(fill);
    const label = document.createElement('div'); label.className = 'small muted'; label.textContent = `#${i + 1} · ${t('search.score')} ${hit.semantic.toFixed(3)}`;
    const extra = [score, label];
    if (hit.ocrMatch) { const b = document.createElement('span'); b.className = 'badge ocr'; b.textContent = t('search.ocr'); extra.push(b); }
    const el = itemEl(rec, extra); if (i === 0) el.classList.add('best');
    el.dataset.rank = String(i + 1);
    return el;
  }));
}

function rerenderSearch() { if (state.lastResults) renderResults(); }
function clearSearch() {
  searchSeq++; state.lastResults = null; state.pendingQuery = null; state.lastQuery = null;
  $('search-input').value = ''; $('results').replaceChildren(); $('search-status').textContent = '';
}

// ---------- delete / backup / storage ----------
async function deleteOne(id) {
  if (!confirm(t('confirm.delete'))) return;
  await state.db.deleteImage(id);
  state.records.delete(id);
  const u = state.urls.get(id); if (u) { URL.revokeObjectURL(u); state.urls.delete(id); }
  if (state.lastResults) state.lastResults.ranked = state.lastResults.ranked.filter(h => h.id !== id);
  renderLibrary(); rerenderSearch();
}

async function deleteAll() {
  if (!confirm(t('confirm.deleteAll', { count: state.records.size }))) return;
  await state.db.clearAll();
  state.records.clear();
  state.urls.forEach(u => URL.revokeObjectURL(u)); state.urls.clear();
  clearSearch(); renderLibrary();
}

async function doExport() {
  const json = await exportLibrary(sortedRecords());
  const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `snapfind-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function doImport(file) {
  try {
    const json = JSON.parse(await file.text());
    const res = await importLibrary(state.db, json);
    for (const r of await state.db.listImages()) {
      if (!state.records.has(r.id)) {
        if (!r.thumb) { try { r.thumb = (await makeThumb(r.blob)).thumb; await state.db.updateImage(r.id, { thumb: r.thumb }); } catch {} }
        state.records.set(r.id, r);
        if (r.status === 'queued' || (r.status === 'ready' && r.modelKey !== ACTIVE_MODEL)) {
          if (r.status === 'ready') await state.db.updateImage(r.id, { status: 'queued' });
          queue.enqueue(r.id);
        }
      }
    }
    message(t('backup.imported', res), true);
  } catch {
    message(t('backup.invalid'));
  }
  renderLibrary();
}

async function requestPersistence() {
  try {
    const persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.());
    $('storage-status').textContent = persisted ? t('storage.persisted') : t('storage.notPersisted');
  } catch {}
}

// ---------- wiring ----------
function wireUI() {
  $('file-input').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
  $('samples-btn').addEventListener('click', addSamples);
  const dz = $('dropzone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  $('search-form').addEventListener('submit', (e) => { e.preventDefault(); runSearch($('search-input').value); });
  $('search-clear').addEventListener('click', clearSearch);
  $('model-retry').addEventListener('click', () => model.load());
  $('export-btn').addEventListener('click', doExport);
  $('import-input').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) doImport(f); e.target.value = ''; });
  $('delete-all-btn').addEventListener('click', deleteAll);
}

async function main() {
  initLocale();
  wireUI();
  try {
    state.db = await openDB(DB_NAME);
  } catch (err) {
    $('fatal').hidden = false; $('fatal').textContent = t('error.db', { message: err.message });
    return;
  }
  for (const r of await state.db.listImages()) {
    // Embeddings from a different model are not comparable: re-process (image data is kept).
    if (r.status === 'ready' && r.modelKey !== ACTIVE_MODEL) { await state.db.updateImage(r.id, { status: 'queued' }); r.status = 'queued'; }
    state.records.set(r.id, r);
  }
  renderLibrary();
  requestPersistence();

  queue = createQueue({ db: state.db, process: processRecord });
  queue.pause(); // nothing is processed until the model is genuinely ready
  queue.onChange(({ id }) => refreshRecord(id));

  model.onState((s) => {
    const was = state.modelState.status;
    state.modelState = s; renderModel();
    if (s.status === 'ready' && was !== 'ready') {
      queue.start();
      if (state.pendingQuery) { const q = state.pendingQuery; state.pendingQuery = null; runSearch(q); }
    }
    if (s.status === 'error') queue.pause();
  });
  model.load();
}

main();
