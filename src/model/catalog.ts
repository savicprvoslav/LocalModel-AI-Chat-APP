export type ModelTier = 'compact' | 'standard' | 'capable';

export type ModelCatalogEntry = {
  id: string;
  tier: ModelTier;
  displayName: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  contextLen: number;
  minRamGB: number;
  recommendedRamGB: number;
  goodFor: string;
};

/**
 * Build-time catalog of supported local models. Entries are independent —
 * adding one doesn't mean removing another. The tier is purely cosmetic
 * for the FirstRun picker; size + RAM checks drive the "may be slow"
 * hint, not the tier.
 *
 * All entries are GGUF and load through llama.rn (`llamaRnEngine`). Earlier
 * revisions of this file also listed `.litertlm` Gemma 4 bundles for Google's
 * MediaPipe / LiteRT-LM runtime, but Google's prebuilt iOS binaries can't be
 * linked on Xcode 26 (XNNPACK SME2 kernels trip the new linker). Those
 * entries are gone until either Google ships a fix or we rebuild LiteRT-LM
 * from source with SME2 disabled. Track in:
 *   - https://github.com/google-ai-edge/mediapipe/issues/6258
 *   - https://github.com/google-ai-edge/LiteRT-LM/issues/2072
 *
 * Note on Gemma 4 entries: Google's "E2B / E4B" naming refers to *effective*
 * parameters; the quantized GGUF that we actually download is larger because
 * it includes the embedding tables. E2B Q4_K_M = ~3.5 GB; E4B Q4_K_M = ~5.4 GB.
 *
 * Compatibility caveat: Gemma 4 GGUF needs llama.cpp build b8746+. If the
 * bundled `llama.rn` pins an older llama.cpp, the model fails at load time
 * with an unsupported-architecture error. If that happens, upgrade llama.rn
 * or fall back to a Qwen 3 entry.
 */
export const CATALOG: ModelCatalogEntry[] = [
  {
    id: 'smollm3-3b-q4',
    tier: 'compact',
    displayName: 'SmolLM3 3B (Q4_K_M)',
    url: 'https://huggingface.co/unsloth/SmolLM3-3B-GGUF/resolve/main/SmolLM3-3B-Q4_K_M.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 1_915_306_528,
    contextLen: 4096,
    minRamGB: 3,
    recommendedRamGB: 4,
    goodFor:
      'lightest option, fastest cold-start — HuggingFace\'s open SmolLM3, good fallback for low-end devices'
  },
  {
    id: 'phi-4-mini-instruct-q4',
    tier: 'compact',
    displayName: 'Phi-4-mini Instruct (Q4_K_M)',
    url: 'https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 2_491_874_272,
    // Phi-4-mini's native context is 128K; we cap at 4096 until we surface a
    // per-conversation context override.
    contextLen: 4096,
    minRamGB: 4,
    recommendedRamGB: 6,
    goodFor:
      'best stability/quality on iPhone — Microsoft Phi-4-mini (3.8B params), strong math & function calling, MIT license'
  },
  {
    id: 'qwen3-4b-q4',
    tier: 'standard',
    displayName: 'Qwen 3 4B (UD-Q4_K_XL)',
    url: 'https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-UD-Q4_K_XL.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 2_546_341_152,
    contextLen: 4096,
    minRamGB: 4,
    recommendedRamGB: 6,
    goodFor:
      'best tool calling on-device — Qwen 3 is natively trained on ChatML tool format; reliable for web_search / weather / http_request flows'
  },
  {
    id: 'gemma-4-e2b-it-q4',
    tier: 'standard',
    displayName: 'Gemma 4 E2B (UD-Q4_K_XL)',
    url: 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-UD-Q4_K_XL.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 3_174_043_296,
    contextLen: 4096,
    minRamGB: 6,
    recommendedRamGB: 8,
    goodFor:
      'newest 2026 model, multimodal-ready — Google Gemma 4 E2B (March/April 2026 release). Talks about tools rather than emitting structured calls; pair with Qwen 3 4B if tool calling matters'
  }
];

// Excluded:
//   • Gemma 4 E4B  — caused init crashes on iPhone (8GB ceiling)
//   • Qwen 3 8B    — same memory pressure, crashed at load
//   • Ministral 3B — Mistral gates the repo, can't be downloaded anonymously
//
// If a higher-capability model is needed later, look for:
//   - Phi-4-multimodal (when Microsoft ships a Q4 GGUF that fits)
//   - Qwen 3 7B (smaller dense variant, if released)
//   - Gemma 4 31B-A4B (MoE — only 4B active, but full weights still load)

export const getCatalogEntry = (id: string): ModelCatalogEntry | undefined =>
  CATALOG.find((e) => e.id === id);

export const DEFAULT_MODEL_ID = 'phi-4-mini-instruct-q4';
