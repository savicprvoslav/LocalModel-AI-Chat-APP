import type { Embedder } from '../types';

/**
 * Lightweight pseudo-embeddings via FNV-1a feature hashing on lowercased
 * tokens. Captures lexical overlap (proper nouns, exact shared terms) but
 * NOT meaning. Used as a fallback when a real semantic embedder isn't
 * available — keeps retrieval working at reduced quality on devices that
 * can't run MiniLM.
 *
 * Algorithm:
 *  - tokenize on `\W+`, lowercase, drop tokens shorter than 2 chars
 *  - hash each token to one of `dim` buckets via 32-bit FNV-1a
 *  - increment bucket; +0.7 to bigram bucket for word-pair signal
 *  - L2-normalize
 */

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

const fnv1a = (s: string): number => {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
};

const tokenize = (text: string): string[] => {
  const lower = text.toLowerCase();
  const out: string[] = [];
  for (const m of lower.matchAll(/[\p{L}\p{N}]{2,}/gu)) {
    out.push(m[0]);
  }
  return out;
};

const HASH_DIM = 256;
export const HASH_EMBEDDER_NAME = 'hash-fnv-256-v1';

export const hashEmbed = (text: string): number[] => {
  const vec: number[] = new Array<number>(HASH_DIM).fill(0);
  const bump = (idx: number, by: number): void => {
    const cur = vec[idx] ?? 0;
    vec[idx] = cur + by;
  };
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    bump(fnv1a(tok) % HASH_DIM, 1);
    if (i > 0) {
      const prev = tokens[i - 1]!;
      bump(fnv1a(`${prev}_${tok}`) % HASH_DIM, 0.7);
    }
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  for (let i = 0; i < vec.length; i++) {
    const cur = vec[i] ?? 0;
    vec[i] = cur / norm;
  }
  return vec;
};

export class HashEmbedder implements Embedder {
  readonly name = HASH_EMBEDDER_NAME;
  readonly dim = HASH_DIM;
  isReady(): boolean {
    return true;
  }
  async load(): Promise<boolean> {
    return true;
  }
  async embed(text: string): Promise<number[]> {
    return hashEmbed(text);
  }
  async unload(): Promise<void> {
    /* no-op */
  }
}
