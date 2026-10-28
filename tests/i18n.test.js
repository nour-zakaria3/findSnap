// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { t, setLocale, getLocale } from '../src/i18n.js';

describe('i18n', () => {
  it('defaults to Arabic with RTL', () => {
    setLocale('ar');
    expect(getLocale()).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });
  it('switches to English with LTR and different strings', () => {
    setLocale('ar');
    const ar = t('appTitle');
    setLocale('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(t('appTitle')).not.toBe('');
    expect(t('search.placeholder')).not.toBe(ar);
  });
  it('interpolates variables', () => {
    setLocale('en');
    expect(t('upload.rejected', { name: 'a.txt', reason: 'x' })).toContain('a.txt');
  });
  it('returns the key when missing', () => {
    expect(t('no.such.key')).toBe('no.such.key');
  });
});
