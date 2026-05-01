export type ModelTier = 'compact' | 'standard' | 'capable';
export type ModelRuntime = 'llama-rn' | 'litert';

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
  /**
   * Inference runtime for this model. `llama-rn` loads GGUF via llama.cpp;
   * `litert` loads `.task` / `.litertlm` bundles via Google's MediaPipe LLM
   * Inference. Picked by `getEngineForModel(id)` at load time.
   * Defaults to `llama-rn` on entries that omit it.
   */
  runtime?: ModelRuntime;
};

/**
 * Build-time catalog of supported local models. Entries are independent —
 * adding one doesn't mean removing another. The tier is purely cosmetic
 * for the FirstRun picker; size + RAM checks drive the "may be slow"
 * hint, not the tier.
 *
 * Note on Gemma 4 entries: Google's "E2B / E4B" naming refers to *effective*
 * parameters; the quantized GGUF that we actually download is larger because
 * it includes the embedding tables. E2B Q4_K_M = ~3.5 GB; E4B Q4_K_M = ~5.4 GB.
 *
 * Compatibility caveat for the GGUF Gemma 4 entries: llama.cpp added support
 * in build b8746. If the bundled `llama.rn` pins a llama.cpp older than that,
 * the model will fail at load time with an unsupported-architecture error.
 * If that happens, either upgrade llama.rn or fall back to a Qwen 3 entry
 * — or use the LiteRT (`runtime: 'litert'`) variant, which goes through
 * Google's MediaPipe LLM Inference and is unaffected by llama.cpp version.
 *
 * Gemma 4 weights — both the GGUF and the `.task` bundle — ship under
 * Apache 2.0. See `docs/MODEL_HOSTING.md` for the redistribution and
 * self-hosting story.
 */
export const CATALOG: ModelCatalogEntry[] = [
  {
    id: 'qwen3-1.7b-q4',
    tier: 'compact',
    displayName: 'Qwen 3 1.7B (Q4_K_M)',
    url: 'https://huggingface.co/bartowski/Qwen_Qwen3-1.7B-GGUF/resolve/main/Qwen_Qwen3-1.7B-Q4_K_M.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 1_280_000_000,
    contextLen: 4096,
    minRamGB: 4,
    recommendedRamGB: 6,
    goodFor: 'quick answers, low-end devices, instant warmup — dual-mode reasoning built in',
    runtime: 'llama-rn'
  },
  {
    id: 'qwen3-4b-q4',
    tier: 'standard',
    displayName: 'Qwen 3 4B (Q4_K_M)',
    url: 'https://huggingface.co/bartowski/Qwen_Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 2_500_000_000,
    contextLen: 4096,
    minRamGB: 6,
    recommendedRamGB: 8,
    goodFor: 'balanced quality and speed, the everyday default — Qwen 3 thinking/non-thinking modes',
    runtime: 'llama-rn'
  },
  {
    id: 'gemma-4-e2b-it-q4',
    tier: 'standard',
    displayName: 'Gemma 4 E2B (Q4_K_M)',
    url: 'https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_K_M.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 3_460_000_000,
    contextLen: 4096,
    minRamGB: 8,
    recommendedRamGB: 10,
    goodFor: 'frontier reasoning at edge sizes — Google\'s newest, 128k context-capable',
    runtime: 'llama-rn'
  },
  {
    id: 'qwen3-8b-q4',
    tier: 'capable',
    displayName: 'Qwen 3 8B (Q4_K_M)',
    url: 'https://huggingface.co/bartowski/Qwen_Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 5_030_000_000,
    contextLen: 4096,
    minRamGB: 10,
    recommendedRamGB: 12,
    goodFor: 'highest-quality answers, longer reasoning, top devices only',
    runtime: 'llama-rn'
  },
  {
    id: 'gemma-4-e4b-it-q4',
    tier: 'capable',
    displayName: 'Gemma 4 E4B (Q4_K_M)',
    url: 'https://huggingface.co/bartowski/google_gemma-4-E4B-it-GGUF/resolve/main/google_gemma-4-E4B-it-Q4_K_M.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 5_410_000_000,
    contextLen: 4096,
    minRamGB: 12,
    recommendedRamGB: 16,
    goodFor: 'top-tier on-device reasoning — heaviest option, iPhone 17 Pro / 16 GB Android only',
    runtime: 'llama-rn'
  },
  {
    id: 'gemma-4-e2b-it-litert',
    tier: 'standard',
    displayName: 'Gemma 4 E2B (LiteRT)',
    // LiteRT-LM bundle hosted by the litert-community on HF — same file
    // Google's AI Edge Gallery uses on mobile. Mirror to your own CDN and
    // update both `url` and `sha256` before shipping (see
    // docs/MODEL_HOSTING.md). Compute sha with:
    //   sha256sum gemma-4-E2B-it.litertlm
    url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 2_580_000_000,
    contextLen: 4096,
    // LiteRT runtime is meaningfully more memory-efficient than llama.cpp:
    // smaller int4-mix weights, NPU/GPU offload, tighter KV cache. Google's
    // AI Edge Gallery treats this model as runnable on ~6 GB devices.
    minRamGB: 4,
    recommendedRamGB: 6,
    goodFor: 'Gemma 4 via Google\'s LiteRT runtime — uses iOS Core ML / Android NPU acceleration',
    runtime: 'litert'
  },
  {
    id: 'gemma-4-e4b-it-litert',
    tier: 'capable',
    displayName: 'Gemma 4 E4B (LiteRT)',
    url: 'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it.litertlm',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 3_650_000_000,
    contextLen: 4096,
    // Google's AI Edge Gallery lists this as runnable on ~8 GB devices.
    minRamGB: 6,
    recommendedRamGB: 8,
    goodFor: 'Gemma 4 E4B via LiteRT — better quality than E2B, lighter on RAM than the GGUF variant',
    runtime: 'litert'
  }
];

export const getCatalogEntry = (id: string): ModelCatalogEntry | undefined =>
  CATALOG.find((e) => e.id === id);

export const DEFAULT_MODEL_ID = 'qwen3-4b-q4';
