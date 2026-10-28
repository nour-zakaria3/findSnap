import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDB } from '../src/db.js';

let n = 0;
const fresh = () => `test-db-${Date.now()}-${n++}`;
const rec = (id, extra = {}) => ({ id, name: `${id}.png`, type: 'image/png', size: 3,
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), hash: `h-${id}`,
  createdAt: Date.now(), status: 'queued', ...extra });

describe('db', () => {
  let name;
  beforeEach(() => { name = fresh(); });

  it('round-trips records, newest first', async () => {
    const db = await openDB(name);
    await db.putImage(rec('a', { createdAt: 1 }));
    await db.putImage(rec('b', { createdAt: 2 }));
    const all = await db.listImages();
    expect(all.map(r => r.id)).toEqual(['b', 'a']);
    expect(all[0].blob.size).toBe(3);
  });

  it('persists across reopen (simulated refresh)', async () => {
    const db1 = await openDB(name);
    await db1.putImage(rec('a', { embedding: new Float32Array([0.5, 0.5]) }));
    db1.close();
    const db2 = await openDB(name);
    const r = await db2.getImage('a');
    expect(r.name).toBe('a.png');
    expect(Array.from(r.embedding)).toEqual([0.5, 0.5]);
  });

  it('updateImage merges fields and keeps the rest', async () => {
    const db = await openDB(name);
    await db.putImage(rec('a'));
    await db.updateImage('a', { status: 'ready' });
    const r = await db.getImage('a');
    expect(r.status).toBe('ready');
    expect(r.name).toBe('a.png');
  });

  it('updateImage on a missing id does not create a record', async () => {
    const db = await openDB(name);
    await expect(db.updateImage('nope', { status: 'ready' })).resolves.toBe(false);
    expect(await db.listImages()).toEqual([]);
  });

  it('finds duplicates by hash', async () => {
    const db = await openDB(name);
    await db.putImage(rec('a'));
    expect((await db.findByHash('h-a')).id).toBe('a');
    expect(await db.findByHash('zzz')).toBeUndefined();
  });

  it('deletes one and all', async () => {
    const db = await openDB(name);
    await db.putImage(rec('a')); await db.putImage(rec('b'));
    await db.deleteImage('a');
    expect((await db.listImages()).map(r => r.id)).toEqual(['b']);
    await db.clearAll();
    expect(await db.listImages()).toEqual([]);
  });

  it('separate DB names are isolated', async () => {
    const db1 = await openDB(name);
    await db1.putImage(rec('a'));
    const db2 = await openDB(fresh());
    expect(await db2.listImages()).toEqual([]);
  });
});
