// Model candidates. The active one is chosen by ACTIVE_MODEL after the feasibility
// test (see docs/feasibility.md). Switching models invalidates stored embeddings,
// so records store `modelKey` and are re-processed if it differs.
export const MODELS = {
  // English CLIP for images + text; Arabic queries are translated locally to English first.
  'clip-b32+opus-ar-en': {
    kind: 'clip',
    id: 'Xenova/clip-vit-base-patch32',
    dtype: 'q8',
    translate: { id: 'Xenova/opus-mt-ar-en', dtype: 'q8', onnxFiles: ['encoder_model_quantized.onnx', 'decoder_model_merged_quantized.onnx'] },
    onnxFiles: ['text_model_quantized.onnx', 'vision_model_quantized.onnx'],
    approxSize: '220 MB',
  },
  // English-only CLIP (no translator). Smaller; Arabic queries are NOT understood semantically.
  'clip-b32-en': {
    kind: 'clip',
    id: 'Xenova/clip-vit-base-patch32',
    dtype: 'q8',
    onnxFiles: ['text_model_quantized.onnx', 'vision_model_quantized.onnx'],
    approxSize: '150 MB',
  },
  // Multilingual SigLIP 2: one model understands Arabic and English directly.
  'siglip2-base': {
    kind: 'siglip',
    id: 'onnx-community/siglip2-base-patch16-224-ONNX',
    dtype: 'q8',
    onnxFiles: ['text_model_quantized.onnx', 'vision_model_quantized.onnx'],
    approxSize: '400 MB',
  },
  // Multilingual jina-clip-v2 (large; included for the feasibility comparison).
  'jina-clip-v2': {
    kind: 'jina',
    id: 'jinaai/jina-clip-v2',
    dtype: 'q4',
    onnxFiles: ['text_model_q4.onnx', 'vision_model_q4.onnx'],
    approxSize: '700 MB',
  },
};

export const DEFAULT_MODEL = 'clip-b32+opus-ar-en';
// `?model=<key>` lets you compare candidates in the browser without rebuilding.
const fromUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('model') : null;
export const ACTIVE_MODEL = fromUrl && MODELS[fromUrl] ? fromUrl : DEFAULT_MODEL;
