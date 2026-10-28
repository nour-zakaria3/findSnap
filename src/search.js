export const OCR_BOOST = 0.15;

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// Arabic-aware normalization for OCR keyword matching.
export function normalizeText(s = '') {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭ]/g, '') // harakat / Quranic marks
    .replace(/ـ/g, '')                            // tatweel
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, ' ')
    .trim();
}

const tokens = (s) => normalizeText(s).split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1);

function ocrMatches(ocrText, query) {
  if (!ocrText || !query) return false;
  const hay = normalizeText(ocrText);
  const q = normalizeText(query);
  if (q && hay.includes(q)) return true;
  const words = tokens(query);
  return words.length > 0 && words.every(w => hay.includes(w));
}

// queryVec: normalized text embedding (or null if only keyword search is possible).
export function rankImages(queryVec, records, { text = '' } = {}) {
  const out = [];
  for (const r of records) {
    const hasVec = queryVec && r.embedding && r.embedding.length === queryVec.length;
    const ocrMatch = ocrMatches(r.ocrText, text);
    if (!hasVec && !ocrMatch) continue;
    const semantic = hasVec ? cosine(queryVec, r.embedding) : 0;
    out.push({ id: r.id, semantic, ocrMatch, score: semantic + (ocrMatch ? OCR_BOOST : 0) });
  }
  return out.sort((a, b) => b.score - a.score);
}
