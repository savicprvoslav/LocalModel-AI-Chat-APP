/**
 * Lightweight pseudo-embeddings + cosine similarity, used as a fallback
 * when no real embedding model is available.
 *
 * The embedding scheme is feature hashing on lowercased word tokens:
 *   - tokenize on \W+
 *   - drop tokens shorter than 2 chars (cuts noise without dropping initials)
 *   - hash each token to one of `dim` buckets via a fast 32-bit FNV-1a
 *   - increment bucket; also +1 to bucket of bigram for word-pair signal
 *   - L2-normalize the resulting vector
 *
 * This is NOT semantic — it captures lexical overlap (proper nouns, exact
 * shared terms). It is effective for retrieval queries that contain at
 * least one specific word in common with a relevant past message, which
 * covers the most common retrieval queries in this app. Paraphrase-only
 * queries will not retrieve well; we accept that trade for simplicity.
 *
 * Architected to be swapped: anything that returns `{ vector: number[];
 * embedder: string }` can replace this without changing the call sites.
 */

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

const fnv1a = (s: string): number => {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // Math.imul handles 32-bit overflow correctly; >>> 0 keeps it unsigned.
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
const EMBEDDER_NAME = 'hash-fnv-256-v1';

export const HASH_EMBEDDER_NAME = EMBEDDER_NAME;
export const HASH_EMBED_DIM = HASH_DIM;

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
    // Bigram signal — captures simple compound terms.
    if (i > 0) {
      const prev = tokens[i - 1]!;
      bump(fnv1a(`${prev}_${tok}`) % HASH_DIM, 0.7);
    }
  }
  // L2 normalize so cosine reduces to dot product.
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

export const cosineSimilarity = (a: number[], b: number[]): number => {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};
