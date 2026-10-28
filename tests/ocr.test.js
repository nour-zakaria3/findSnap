import { describe, it, expect, vi } from 'vitest';
vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }));
const { cleanOcrWords } = await import('../src/ocr.js');

describe('cleanOcrWords', () => {
  it('keeps confident words with letters and strips bidi marks', () => {
    const words = [{ text: '‎Invoice‏', confidence: 90 }, { text: 'فاتورة', confidence: 88 }, { text: '©', confidence: 95 }, { text: 'blurry', confidence: 30 }];
    expect(cleanOcrWords(words)).toBe('Invoice فاتورة');
  });
  it('keeps numbers with 3+ digits (invoice numbers, amounts)', () => {
    expect(cleanOcrWords([{ text: '1047', confidence: 90 }, { text: '12', confidence: 90 }])).toBe('1047');
  });
  it('returns empty text for photo noise', () => {
    expect(cleanOcrWords([{ text: '©', confidence: 90 }, { text: '==', confidence: 80 }, { text: 'ee', confidence: 40 }])).toBe('');
  });
});
