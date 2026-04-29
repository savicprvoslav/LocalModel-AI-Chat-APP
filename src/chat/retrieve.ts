import { searchMessages } from '@/db/search';
import {
  EmbeddingWithMessage,
  listAllEmbeddingsWithContext
} from '@/db/embeddings';
import { cosineSimilarity, hashEmbed } from './vectors';

export type RelevantSnippet = {
  message_id: string;
  conversation_id: string;
  conversation_title: string;
  project_id: string | null;
  role: 'user' | 'assistant' | 'system';
  excerpt: string;
  /** Combined score in [0, 1] from FTS rank + cosine similarity. */
  score: number;
  /** Where this hit came from — useful for debugging / future telemetry. */
  source: 'fts' | 'vector' | 'hybrid';
  message_created_at: number;
};

export type RetrieveOptions = {
  excludeConversationId?: string;
  /** Only consider messages from a specific project (or unfiled if null). */
  projectScope?: string | null | 'any';
  /** Maximum snippets to return after merging both sources. Default 4. */
  limit?: number;
  /** Minimum similarity score (after merging) to include. Default 0.15. */
  minScore?: number;
  /** Maximum chars to include in each excerpt. Default 240. */
  excerptMaxChars?: number;
  /** Skip retrieval if the query has fewer than this many alpha chars. Default 4. */
  minQueryChars?: number;
};

const truncate = (s: string, max: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
};

const inProjectScope = (
  e: { project_id: string | null },
  scope: RetrieveOptions['projectScope']
): boolean => {
  if (scope === undefined || scope === 'any') return true;
  if (scope === null) return e.project_id === null;
  return e.project_id === scope;
};

/**
 * Retrieve up to `limit` snippets from past conversations relevant to `query`.
 *
 * Hybrid strategy:
 *  - Run FTS5 search with the user's words (handles proper nouns, exact terms)
 *  - Compute cosine similarity in JS against all embeddings (handles partial
 *    paraphrase via shared bigrams + token overlap, gives a graceful score
 *    even when FTS misses)
 *  - Merge by message_id, summing the two scores (clipped); keep top-k
 *  - Filter out current-conversation messages and rows below threshold
 */
export const retrieveRelevant = async (
  query: string,
  opts: RetrieveOptions = {}
): Promise<RelevantSnippet[]> => {
  const limit = opts.limit ?? 4;
  const minScore = opts.minScore ?? 0.15;
  const excerptMax = opts.excerptMaxChars ?? 240;
  const minQueryChars = opts.minQueryChars ?? 4;

  if (query.replace(/\W/g, '').length < minQueryChars) return [];

  const merged = new Map<string, RelevantSnippet>();
  const bump = (key: string, snip: RelevantSnippet, source: RelevantSnippet['source']) => {
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...snip, source });
      return;
    }
    existing.score = Math.min(1, existing.score + snip.score);
    existing.source = 'hybrid';
  };

  // --- FTS branch ----------------------------------------------------------
  try {
    const ftsHits = await searchMessages(query, 25);
    for (let i = 0; i < ftsHits.length; i++) {
      const h = ftsHits[i]!;
      if (opts.excludeConversationId && h.conversation_id === opts.excludeConversationId)
        continue;
      if (!inProjectScope({ project_id: h.project_id }, opts.projectScope)) continue;
      // FTS hits are returned in created_at desc; convert rank to a [0..0.6]
      // score so it never alone dominates over a strong vector match.
      const ftsScore = Math.max(0.15, 0.6 - i * 0.02);
      bump(
        h.message_id,
        {
          message_id: h.message_id,
          conversation_id: h.conversation_id,
          conversation_title: h.conversation_title,
          project_id: h.project_id,
          role: h.role,
          // FTS already returns a snippet with «...» markers; strip those so
          // the prompt looks clean. They're useful in the search UI, not
          // here.
          excerpt: truncate(h.snippet.replace(/«|»/g, ''), excerptMax),
          score: ftsScore,
          source: 'fts',
          message_created_at: h.created_at
        },
        'fts'
      );
    }
  } catch {
    // FTS missing on extremely old DBs is fine; keep going with vector only.
  }

  // --- Vector branch -------------------------------------------------------
  try {
    const queryVec = hashEmbed(query);
    // Pulling all embeddings is fine for personal-scale corpora. We cap at
    // 5000 in the repo. If you hit that, switch to sqlite-vec.
    const allOpts: { excludeConversationId?: string } = {};
    if (opts.excludeConversationId) allOpts.excludeConversationId = opts.excludeConversationId;
    const all = await listAllEmbeddingsWithContext(allOpts);
    const scored: Array<{ row: EmbeddingWithMessage; score: number }> = [];
    for (const row of all) {
      if (!inProjectScope({ project_id: row.project_id }, opts.projectScope)) continue;
      const sim = cosineSimilarity(queryVec, row.vector);
      if (sim <= 0) continue;
      scored.push({ row, score: sim });
    }
    scored.sort((a, b) => b.score - a.score);
    for (let i = 0; i < Math.min(scored.length, 25); i++) {
      const { row, score } = scored[i]!;
      bump(
        row.message_id,
        {
          message_id: row.message_id,
          conversation_id: row.conversation_id,
          conversation_title: row.conversation_title,
          project_id: row.project_id,
          role: row.role,
          excerpt: truncate(row.content, excerptMax),
          // Cosine sim already lives in roughly [0, 0.7] for hash embeds.
          score,
          source: 'vector',
          message_created_at: row.message_created_at
        },
        'vector'
      );
    }
  } catch {
    // No embeddings yet → vector branch contributes nothing; fine.
  }

  // --- Merge & rank --------------------------------------------------------
  const results = [...merged.values()]
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return results;
};
