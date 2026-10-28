// Export/import of the whole library as one JSON file (images as base64).
// Import never deletes or overwrites: existing content (same hash) is skipped.
const FORMAT = 'snapfind-backup';

const toB64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export async function exportLibrary(records) {
  const images = [];
  for (const r of records) {
    images.push({
      id: r.id, name: r.name, type: r.type, size: r.size, hash: r.hash, createdAt: r.createdAt,
      ocrText: r.ocrText ?? null,
      modelKey: r.status === 'ready' ? r.modelKey ?? null : null,
      embedding: r.status === 'ready' && r.embedding ? toB64(new Uint8Array(r.embedding.buffer.slice(0))) : null,
      data: toB64(new Uint8Array(await r.blob.arrayBuffer())),
    });
  }
  return { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), images };
}

export async function importLibrary(db, json) {
  if (!json || json.format !== FORMAT || !Array.isArray(json.images)) throw new Error('invalid-backup');
  let added = 0, skipped = 0;
  for (const img of json.images) {
    if (!img.hash || !img.data || !img.type) { skipped++; continue; }
    if (await db.findByHash(img.hash)) { skipped++; continue; }
    const embedding = img.embedding ? new Float32Array(fromB64(img.embedding).buffer) : undefined;
    const rec = {
      id: (await db.getImage(img.id)) ? crypto.randomUUID() : img.id,
      name: img.name, type: img.type, size: img.size, hash: img.hash,
      createdAt: img.createdAt ?? Date.now(),
      blob: new Blob([fromB64(img.data)], { type: img.type }),
      status: embedding ? 'ready' : 'queued',
    };
    if (embedding) { rec.embedding = embedding; rec.modelKey = img.modelKey; }
    if (img.ocrText) rec.ocrText = img.ocrText;
    await db.putImage(rec);
    added++;
  }
  return { added, skipped };
}
