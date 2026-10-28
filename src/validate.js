export const MAX_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function validateFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, reason: 'unsupported-type' };
  if (!file.size) return { ok: false, reason: 'empty' };
  if (file.size > MAX_BYTES) return { ok: false, reason: 'too-large' };
  return { ok: true };
}

export async function hashBlob(blob) {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
