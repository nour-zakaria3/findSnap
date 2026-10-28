// Shared embedding logic, used by the browser worker and by the Node feasibility script,
// so the feasibility numbers measure the same code the app runs.
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
export const isArabic = (s) => ARABIC.test(s);

function l2normalize(data) {
  let n = 0;
  for (const x of data) n += x * x;
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] / n;
  return out;
}

const CLASSES = {
  clip: { text: 'CLIPTextModelWithProjection', vision: 'CLIPVisionModelWithProjection', textOut: 'text_embeds', visionOut: 'image_embeds' },
  siglip: { text: 'SiglipTextModel', vision: 'SiglipVisionModel', textOut: 'pooler_output', visionOut: 'pooler_output', pad: { padding: 'max_length', truncation: true, max_length: 64 } },
  jina: { text: 'JinaCLIPTextModel', vision: 'JinaCLIPVisionModel', textOut: 'l2norm_text_embeddings', visionOut: 'l2norm_image_embeddings' },
};

/**
 * @param {object} T  the @huggingface/transformers module
 * @param {object} cfg one entry of MODELS
 * @param {{device?: string, onProgress?: Function}} opts
 */
export async function createEmbedder(T, cfg, { device, onProgress } = {}) {
  const k = CLASSES[cfg.kind];
  const common = { progress_callback: onProgress, dtype: cfg.dtype, ...(device ? { device } : {}) };
  const timings = {};
  const t0 = performance.now();

  const [tokenizer, processor, textModel, visionModel] = await Promise.all([
    T.AutoTokenizer.from_pretrained(cfg.id, { progress_callback: onProgress }),
    T.AutoProcessor.from_pretrained(cfg.id, { progress_callback: onProgress }),
    T[k.text].from_pretrained(cfg.id, common),
    T[k.vision].from_pretrained(cfg.id, common),
  ]);
  let translator = null;
  if (cfg.translate) {
    translator = await T.pipeline('translation', cfg.translate.id, {
      progress_callback: onProgress, dtype: cfg.translate.dtype, ...(device ? { device } : {}),
    });
  }
  timings.loadMs = performance.now() - t0;

  async function translate(text) {
    if (!translator || !isArabic(text)) return text;
    const out = await translator(text, { max_new_tokens: 64 });
    return out[0].translation_text;
  }

  async function embedText(text) {
    const used = await translate(text.trim());
    const inputs = tokenizer([used], { padding: true, truncation: true, ...(k.pad || {}) });
    const out = await textModel(inputs);
    return { vector: l2normalize(out[k.textOut].data), usedText: used };
  }

  async function embedImage(image) {
    const raw = image instanceof T.RawImage ? image
      : (typeof Blob !== 'undefined' && image instanceof Blob) ? await T.RawImage.fromBlob(image)
      : await T.RawImage.read(image);
    const inputs = await processor(raw);
    const out = await visionModel(inputs);
    return l2normalize(out[k.visionOut].data);
  }

  return { embedText, embedImage, translate, timings };
}
