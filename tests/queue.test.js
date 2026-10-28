import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openDB } from '../src/db.js';
import { createQueue } from '../src/queue.js';

let n = 0;
const rec = (id, status = 'queued') => ({ id, name: id, type: 'image/png', size: 1,
  blob: new Blob([new Uint8Array([1])]), hash: id, createdAt: n++, status });

describe('queue', () => {
  it('processes strictly one at a time, in order', async () => {
    const db = await openDB(`q-${Math.random()}`);
    let active = 0, maxActive = 0; const order = [];
    const q = createQueue({ db, process: async (r) => {
      active++; maxActive = Math.max(maxActive, active); order.push(r.id);
      await new Promise(res => setTimeout(res, 5)); active--;
      return { embedding: new Float32Array([1]) };
    } });
    for (const id of ['a', 'b', 'c']) { await db.putImage(rec(id)); q.enqueue(id); }
    await q.idle();
    expect(maxActive).toBe(1);
    expect(order).toEqual(['a', 'b', 'c']);
    const all = await db.listImages();
    expect(all.every(r => r.status === 'ready')).toBe(true);
    expect(Array.from((await db.getImage('a')).embedding)).toEqual([1]);
  });

  it('marks failures as error and keeps going', async () => {
    const db = await openDB(`q-${Math.random()}`);
    const q = createQueue({ db, process: async (r) => {
      if (r.id === 'bad') throw new Error('boom'); return { embedding: new Float32Array([1]) };
    } });
    for (const id of ['bad', 'good']) { await db.putImage(rec(id)); q.enqueue(id); }
    await q.idle();
    expect((await db.getImage('bad')).status).toBe('error');
    expect((await db.getImage('bad')).error).toBe('boom');
    expect((await db.getImage('good')).status).toBe('ready');
  });

  it('recovers stuck processing records and pending queued ones on start', async () => {
    const db = await openDB(`q-${Math.random()}`);
    await db.putImage(rec('stuck', 'processing'));
    await db.putImage(rec('pending', 'queued'));
    await db.putImage(rec('done', 'ready'));
    const seen = [];
    const q = createQueue({ db, process: async (r) => { seen.push(r.id); return { embedding: new Float32Array([1]) }; } });
    await q.start();
    await q.idle();
    expect(seen.sort()).toEqual(['pending', 'stuck']);
    expect((await db.getImage('stuck')).status).toBe('ready');
  });

  it('retry re-queues an errored record', async () => {
    const db = await openDB(`q-${Math.random()}`);
    let fail = true;
    const q = createQueue({ db, process: async () => { if (fail) throw new Error('x'); return { embedding: new Float32Array([1]) }; } });
    await db.putImage(rec('a')); q.enqueue('a'); await q.idle();
    expect((await db.getImage('a')).status).toBe('error');
    fail = false; await q.retry('a'); await q.idle();
    const r = await db.getImage('a');
    expect(r.status).toBe('ready');
    expect(r.error).toBeUndefined();
  });

  it('skips a record deleted while queued without recreating it', async () => {
    const db = await openDB(`q-${Math.random()}`);
    const q = createQueue({ db, process: async () => ({ embedding: new Float32Array([1]) }) });
    await db.putImage(rec('a')); await db.deleteImage('a'); q.enqueue('a');
    await q.idle();
    expect(await db.listImages()).toEqual([]);
  });

  it('does not process while paused and resumes on start', async () => {
    const db = await openDB(`q-${Math.random()}`);
    const seen = [];
    const q = createQueue({ db, process: async (r) => { seen.push(r.id); return { embedding: new Float32Array([1]) }; } });
    q.pause();
    await db.putImage(rec('a')); q.enqueue('a');
    await new Promise(r => setTimeout(r, 20));
    expect(seen).toEqual([]);
    await q.start(); await q.idle();
    expect(seen).toEqual(['a']);
  });
});
