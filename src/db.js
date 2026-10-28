// IndexedDB storage for the image library.
// Safety rule: nothing in this module deletes data except deleteImage/clearAll,
// which the UI only calls after an explicit user confirmation. Upgrades only add stores/indexes.
export const DB_VERSION = 1;
const STORE = 'images';

const req2p = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export function openDB(name = 'snapfind') {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('hash', 'hash', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    open.onblocked = () => reject(new Error('Database is open in another tab with an older version'));
    open.onerror = () => reject(open.error);
    open.onsuccess = () => resolve(wrap(open.result));
  });
}

function wrap(idb) {
  const tx = (mode, fn) => new Promise((resolve, reject) => {
    const t = idb.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then(r => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  });

  return {
    name: idb.name,
    close: () => idb.close(),
    putImage: (rec) => tx('readwrite', s => req2p(s.put(rec))),
    getImage: (id) => tx('readonly', s => req2p(s.get(id))),
    async listImages() {
      const all = await tx('readonly', s => req2p(s.getAll()));
      return all.sort((a, b) => b.createdAt - a.createdAt);
    },
    // Read-modify-write inside one transaction so concurrent updates can't drop fields,
    // and a record deleted meanwhile is not resurrected.
    updateImage: (id, patch) => tx('readwrite', async s => {
      const cur = await req2p(s.get(id));
      if (!cur) return false;
      const next = { ...cur, ...patch };
      for (const k of Object.keys(patch)) if (patch[k] === undefined) delete next[k];
      await req2p(s.put(next));
      return true;
    }),
    deleteImage: (id) => tx('readwrite', s => req2p(s.delete(id))),
    clearAll: () => tx('readwrite', s => req2p(s.clear())),
    findByHash: (hash) => tx('readonly', s => req2p(s.index('hash').get(hash))),
    count: () => tx('readonly', s => req2p(s.count())),
  };
}
