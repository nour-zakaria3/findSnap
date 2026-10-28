import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openDB } from '../src/db.js';
import { exportLibrary, importLibrary } from '../src/backup.js';

const rec = (id, extra = {}) => ({ id, name: `${id}.png`, type: 'image/png', size: 3,
  blob: new Blob([new Uint8Array([1, 2, id.charCodeAt(0)])], { type: 'image/png' }), hash: `h-${id}`,
  createdAt: id.charCodeAt(0), status: 'ready', modelKey: 'm', embedding: new Float32Array([0.6, 0.8]),
  ocrText: 'نص', ...extra });

describe('backup', () => {
  it('export → import into an empty DB restores images, metadata and embeddings', async () => {
    const src = await openDB(`b-${Math.random()}`);
    await src.putImage(rec('a')); await src.putImage(rec('b', { status: 'error', error: 'x', embedding: undefined }));
    const json = await exportLibrary(await src.listImages());
    const text = JSON.stringify(json);

    const dst = await openDB(`b-${Math.random()}`);
    const res = await importLibrary(dst, JSON.parse(text));
    expect(res).toEqual({ added: 2, skipped: 0 });
    const a = await dst.getImage('a');
    expect(a.name).toBe('a.png');
    expect(a.ocrText).toBe('نص');
    expect(Array.from(a.embedding).map(x => +x.toFixed(3))).toEqual([0.6, 0.8]);
    expect(new Uint8Array(await a.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 97]));
    expect(a.blob.type).toBe('image/png');
    expect(a.status).toBe('ready');
    // errored / unprocessed items come back queued so they get processed again
    expect((await dst.getImage('b')).status).toBe('queued');
  });

  it('skips images whose content hash already exists', async () => {
    const src = await openDB(`b-${Math.random()}`);
    await src.putImage(rec('a'));
    const json = await exportLibrary(await src.listImages());
    const res = await importLibrary(src, json);
    expect(res).toEqual({ added: 0, skipped: 1 });
    expect((await src.listImages()).length).toBe(1);
  });

  it('rejects files that are not SnapFind backups without touching the DB', async () => {
    const db = await openDB(`b-${Math.random()}`);
    await db.putImage(rec('a'));
    await expect(importLibrary(db, { foo: 1 })).rejects.toThrow('invalid-backup');
    expect((await db.listImages()).length).toBe(1);
  });
});
