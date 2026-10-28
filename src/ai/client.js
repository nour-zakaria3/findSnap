// Main-thread wrapper around the model worker.
export function createModelClient({ modelKey, device } = {}) {
  let worker = null;
  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  let state = { status: 'idle' };
  let readyWaiters = [];

  const setState = (s) => {
    state = s;
    listeners.forEach(cb => cb(state));
    if (s.status === 'ready') { readyWaiters.forEach(w => w.resolve()); readyWaiters = []; }
    if (s.status === 'error') { readyWaiters.forEach(w => w.reject(new Error(s.message))); readyWaiters = []; }
  };

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'status') { const { type, ...s } = data; setState(s); return; }
      const p = pending.get(data.reqId);
      if (!p) return;
      pending.delete(data.reqId);
      data.type === 'error' ? p.reject(new Error(data.message)) : p.resolve(data);
    };
    worker.onerror = (e) => {
      setState({ status: 'error', message: e.message || 'worker crashed' });
      for (const p of pending.values()) p.reject(new Error('worker crashed'));
      pending.clear();
      worker = null;
    };
    return worker;
  }

  const call = (msg, transfer = []) => new Promise((resolve, reject) => {
    const reqId = ++seq;
    pending.set(reqId, { resolve, reject });
    ensureWorker().postMessage({ ...msg, reqId }, transfer);
  });

  return {
    get state() { return state; },
    onState(cb) { listeners.add(cb); cb(state); return () => listeners.delete(cb); },
    load() {
      if (state.status === 'ready' || state.status === 'downloading' || state.status === 'initializing') return;
      setState({ status: 'downloading', loaded: 0, total: 0 });
      ensureWorker().postMessage({ type: 'load', modelKey, device });
    },
    whenReady() {
      if (state.status === 'ready') return Promise.resolve();
      return new Promise((resolve, reject) => readyWaiters.push({ resolve, reject }));
    },
    embedImage: (blob) => call({ type: 'embedImage', blob }).then(r => r.vector),
    embedText: (text) => call({ type: 'embedText', text }).then(r => ({ vector: r.vector, usedText: r.usedText, ms: r.ms })),
  };
}
