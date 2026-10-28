import { describe, it, expect } from 'vitest';
import { validateFile, MAX_BYTES } from '../src/validate.js';

const fakeFile = (type, size, name = 'f') => ({ type, size, name });

describe('validateFile', () => {
  it('limit is exactly 10 MB', () => expect(MAX_BYTES).toBe(10 * 1024 * 1024));
  it('accepts jpeg/png/webp/gif up to 10 MB', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
      expect(validateFile(fakeFile(t, MAX_BYTES))).toEqual({ ok: true });
  });
  it('rejects unsupported types', () => {
    expect(validateFile(fakeFile('text/plain', 10))).toEqual({ ok: false, reason: 'unsupported-type' });
    expect(validateFile(fakeFile('image/svg+xml', 10))).toEqual({ ok: false, reason: 'unsupported-type' });
  });
  it('rejects files over 10 MB', () => {
    expect(validateFile(fakeFile('image/png', MAX_BYTES + 1))).toEqual({ ok: false, reason: 'too-large' });
  });
  it('rejects empty files', () => {
    expect(validateFile(fakeFile('image/png', 0))).toEqual({ ok: false, reason: 'empty' });
  });
});
