// Sequential processing queue. One image at a time keeps memory bounded and
// makes progress easy to follow. Status lives in IndexedDB so a refresh mid-run
// resumes instead of losing work.
export function createQueue({ db, process }) {
  const pending = [];
  const listeners = new Set();
  let running = false;
  let paused = false;
  let idleWaiters = [];

  const emit = (evt) => listeners.forEach(cb => cb(evt));
  const settleIdle = () => { const w = idleWaiters; idleWaiters = []; w.forEach(r => r()); };

  async function pump() {
    if (running || paused) return;
    running = true;
    try {
      while (pending.length && !paused) {
        const id = pending.shift();
        const rec = await db.getImage(id);
        if (!rec || rec.status === 'ready') continue;
        await db.updateImage(id, { status: 'processing', error: undefined });
        emit({ id, status: 'processing' });
        try {
          const patch = await process(rec);
          const ok = await db.updateImage(id, { ...patch, status: 'ready', processedAt: Date.now() });
          if (ok) emit({ id, status: 'ready' });
        } catch (err) {
          const message = err?.message || String(err);
          const ok = await db.updateImage(id, { status: 'error', error: message });
          if (ok) emit({ id, status: 'error', error: message });
        }
      }
    } finally {
      running = false;
      if (!pending.length || paused) settleIdle();
    }
  }

  return {
    enqueue(id) {
      if (!pending.includes(id)) pending.push(id);
      emit({ id, status: 'queued' });
      pump();
    },
    async retry(id) {
      const ok = await db.updateImage(id, { status: 'queued', error: undefined });
      if (ok) this.enqueue(id);
    },
    // Re-queue anything left unfinished by a previous session, then run.
    async start() {
      paused = false;
      const all = await db.listImages();
      const unfinished = all.filter(r => r.status === 'queued' || r.status === 'processing')
        .sort((a, b) => a.createdAt - b.createdAt);
      for (const r of unfinished) {
        if (r.status === 'processing') await db.updateImage(r.id, { status: 'queued' });
        if (!pending.includes(r.id)) pending.push(r.id);
      }
      pump();
    },
    pause() { paused = true; },
    get size() { return pending.length + (running ? 1 : 0); },
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    idle() {
      if (!running && (!pending.length || paused)) return Promise.resolve();
      return new Promise(r => idleWaiters.push(r));
    },
  };
}
