# SnapFind — Design (short)

Date: 2026-10-28. Source of requirements: Mohd's two briefs in the project thread
("Prepare the Prototype for Instructor Evaluation" and "Build SnapFind from Start to Finish").
Mohd opted out of a design conversation ("continue working through the phases rather than
stopping after producing a plan"), so choices below marked **[my call]** were made without
discussion and are reported back.

## Intent

An AI-course instructor opens a public URL, uploads a few images/screenshots, watches each
get processed by a local AI model, then types a description in Arabic or English and gets
the relevant images ranked. Everything (images, embeddings, OCR text, queries) stays in
the browser. Reliability of that one flow beats feature count.

## Goals / non-goals / anti-goals

- Goals: the 9-step demo workflow; Arabic default (RTL) + English (LTR); persistence across
  refresh; honest loading/error/empty states; self-hosted static deploy.
- Non-goals: accounts, sync, backend, mobile app, video, albums/tags.
- Anti-goals: any image, query or embedding leaving the device; silent data loss; a UI that
  says "ready" before the model can actually embed; claims of offline support not tested.

## Constraints

Vanilla HTML/CSS/JS + Vite; IndexedDB; Transformers.js (ONNX Runtime Web, WebGPU with WASM
fallback); Tesseract.js; static hosting only; 10 MB max per image; JPEG/PNG/WebP/GIF only.

## Approaches considered for Arabic + English semantic search

| | Approach | Trade-off |
|---|---|---|
| A | Multilingual CLIP-style model (SigLIP 2 / jina-clip-v2) — one model embeds Arabic text, English text and images into one space | Simplest pipeline; but large downloads (hundreds of MB) and Arabic quality unknown until measured |
| B | English CLIP (ViT-B/32) for images + local Arabic→English translation (opus-mt-ar-en) for Arabic queries | Small and well-tested model; extra translation step and translation errors |
| C | English-only CLIP; Arabic only via OCR keyword match | Fails the Arabic semantic-search requirement |

**[my call]** C is out. A vs B is decided by the feasibility test (real inference, a
representative test set, timing). The model id lives in one config module so the decision
is a one-line switch, and the choice goes to Mohd for approval with the evidence.

## Decided structure

- `src/config.js` model ids, limits. `src/i18n.js` AR/EN strings + dir switching.
- `src/db.js` IndexedDB (`snapfind` DB, version 1, store `images`, keyPath `id`). Never
  deletes or clears on open/upgrade. Test runs use a different DB name (`?db=<name>`), so
  destructive tests never touch the real library.
- `src/validate.js` type + 10 MB checks. `src/queue.js` sequential processing; on start,
  records stuck in `processing` (tab closed mid-run) go back to `queued` — recovery, not loss.
- `src/ai/worker.js` Web Worker owning the model: states `idle → downloading → initializing
  → ready | error`, with a real warm-up embedding before `ready`. WebGPU tried first, WASM
  fallback. ORT WASM files self-hosted (no jsDelivr).
- `src/search.js` cosine ranking over stored embeddings + OCR keyword boost.
- `src/ocr.js` Tesseract.js (ara+eng), worker/core/lang data self-hosted from the build.
- Export/import: one JSON file with images as data URLs + metadata (embeddings are
  recomputed on import if the model id differs).

## Left to the builder

Visual styling, exact copy, thumbnail size, score threshold for "relevant".
