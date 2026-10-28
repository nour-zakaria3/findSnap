import { describe, it, expect } from 'vitest';
import { rankImages, normalizeText, cosine } from '../src/search.js';

const v = (...xs) => { const a = new Float32Array(xs); const n = Math.hypot(...xs); return a.map(x => x / n); };

describe('search', () => {
  it('cosine of identical unit vectors is 1', () => {
    expect(cosine(v(1, 2, 3), v(1, 2, 3))).toBeCloseTo(1, 5);
  });
  it('ranks by similarity, highest first, skipping records without embeddings', () => {
    const recs = [
      { id: 'far', embedding: v(0, 1) },
      { id: 'near', embedding: v(1, 0.1) },
      { id: 'none' },
    ];
    const out = rankImages(v(1, 0), recs);
    expect(out.map(r => r.id)).toEqual(['near', 'far']);
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });
  it('boosts records whose OCR text contains the query', () => {
    const recs = [
      { id: 'a', embedding: v(1, 1) },
      { id: 'b', embedding: v(1, 1), ocrText: 'Total INVOICE #42' },
    ];
    const out = rankImages(v(1, 1), recs, { text: 'invoice' });
    expect(out[0].id).toBe('b');
    expect(out[0].ocrMatch).toBe(true);
  });
  it('normalizes Arabic alef variants, diacritics and tatweel', () => {
    expect(normalizeText('إِفـاتورة')).toBe(normalizeText('افاتوره'));
    expect(normalizeText('أحمد')).toBe('احمد');
  });
  it('matches Arabic OCR text regardless of alef/taa marbuta variants', () => {
    const recs = [{ id: 'x', embedding: v(0, 1), ocrText: 'رقم الفاتورة: ١٢' }, { id: 'y', embedding: v(1, 0) }];
    const out = rankImages(v(1, 0), recs, { text: 'فاتوره' });
    expect(out.find(r => r.id === 'x').ocrMatch).toBe(true);
  });
  it('works with OCR-only records (no embedding) when text matches', () => {
    const out = rankImages(null, [{ id: 'x', ocrText: 'hello world' }], { text: 'world' });
    expect(out.map(r => r.id)).toEqual(['x']);
  });
});
