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
 * Note on Gemma 4 entries: Google's "E2B / E4B" naming refers to *effective*
 * parameters; the quantized GGUF that we actually download is larger because
 * it includes the embedding tables. E2B Q4_K_M = ~3.5 GB; E4B Q4_K_M = ~5.4 GB.
 *
 * Compatibility caveat for Gemma 4: llama.cpp added support in build b8746.
 * If the bundled `llama.rn` pins a llama.cpp older than that, the model will
 * fail at load time with an unsupported-architecture error. If that happens,
 * either upgrade llama.rn or fall back to a Llama / Qwen entry.
 */
export const CATALOG: ModelCatalogEntry[] = [
  {
    id: 'llama-3.2-1b-q4',
    tier: 'compact',
    displayName: 'Llama 3.2 1B (Q4_K_M)',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 770_000_000,
    contextLen: 4096,
    minRamGB: 4,
    recommendedRamGB: 6,
    goodFor: 'quick answers, low-end devices, instant warmup'
  },
  {
    id: 'llama-3.2-3b-q4',
    tier: 'standard',
    displayName: 'Llama 3.2 3B (Q4_K_M)',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 2_020_000_000,
    contextLen: 4096,
    minRamGB: 6,
    recommendedRamGB: 8,
    goodFor: 'balanced quality and speed, the everyday default'
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
    goodFor: 'frontier reasoning at edge sizes — Google\'s newest, 128k context-capable'
  },
  {
    id: 'qwen-2.5-7b-q4',
    tier: 'capable',
    displayName: 'Qwen 2.5 7B (Q4_K_M)',
    url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 4_680_000_000,
    contextLen: 4096,
    minRamGB: 10,
    recommendedRamGB: 12,
    goodFor: 'highest-quality answers, longer reasoning, top devices only'
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
    goodFor: 'top-tier on-device reasoning — heaviest option, iPhone 17 Pro / 16 GB Android only'
  }
];

export const getCatalogEntry = (id: string): ModelCatalogEntry | undefined =>
  CATALOG.find((e) => e.id === id);

export const DEFAULT_MODEL_ID = 'llama-3.2-3b-q4';
