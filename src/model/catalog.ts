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
  }
];

export const getCatalogEntry = (id: string): ModelCatalogEntry | undefined =>
  CATALOG.find((e) => e.id === id);

export const DEFAULT_MODEL_ID = 'llama-3.2-3b-q4';
