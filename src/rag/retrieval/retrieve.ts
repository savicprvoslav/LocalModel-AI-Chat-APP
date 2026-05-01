import type { Embedder, RetrieveOptions, Snippet } from '../types';
import type { FtsSearcher, VectorStore } from '../storage/types';
import { cosineSimilarity } from './cosine';

/**
 * Hybrid retrieval: FTS5 + dense-vector cosine, merged by message id.
 *
 * Why hybrid: FTS5 nails proper nouns and exact terms (where vectors with
 * a small embedder can be weak); cosine handles paraphrase and semantic
 * overlap (where FTS misses). Summing the two scores degrades gracefully
 * when only one branch hits.
 *
 * Cross-embedder safety: vectors are scoped by embedder name. Rows whose
 * `embedder` field doesn't match the active query embedder are skipped —
 * comparing vectors across schemes is mathematically meaningless.
 */
export type RetrieveDeps = {
  embedder: Embedder;
  vectors: VectorStore;
  fts: FtsSearcher;
};

const truncate = (s: string, max: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
};

const inProjectScope = (
  projectId: string | null,
  scope: RetrieveOptions['projectScope']
): boolean => {
  if (scope === undefined || scope === 'any') return true;
  if (scope === null) return projectId === null;
  return projectId === scope;
};

export const retrieve = async (
  deps: RetrieveDeps,
  query: string,
  opts: RetrieveOptions = {}
): Promise<Snippet[]> => {
  const limit = opts.limit ?? 4;
  const minScore = opts.minScore ?? 0.15;
  const excerptMax = opts.excerptMaxChars ?? 240;
  const minQueryChars = opts.minQueryChars ?? 4;

  if (query.replace(/\W/g, '').length < minQueryChars) return [];

  const merged = new Map<string, Snippet>();
  const bump = (
    key: string,
    snip: Snippet,
    source: Snippet['source']
  ): void => {
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...snip, source });
      return;
    }
    existing.score = Math.min(1, existing.score + snip.score);
    existing.source = 'hybrid';
  };

  // ─── FTS branch ────────────────────────────────────────────────────────────
  try {
    const ftsHits = await deps.fts.search(query, 25);
    for (let i = 0; i < ftsHits.length; i++) {
      const h = ftsHits[i]!;
      if (
        opts.excludeConversationId &&
        h.conversationId === opts.excludeConversationId
      )
        continue;
      if (!inProjectScope(h.projectId, opts.projectScope)) continue;
      // Map rank to a [0..0.6] score so FTS alone never crowds out a strong
      // vector match.
      const ftsScore = Math.max(0.15, 0.6 - i * 0.02);
      bump(
        h.messageId,
        {
          messageId: h.messageId,
          conversationId: h.conversationId,
          conversationTitle: h.conversationTitle,
          projectId: h.projectId,
          role: h.role,
          excerpt: truncate(h.snippet.replace(/«|»/g, ''), excerptMax),
          score: ftsScore,
          source: 'fts',
          messageCreatedAt: h.createdAt
        },
        'fts'
      );
    }
  } catch {
    // FTS missing on extremely old DBs — keep going with vector only.
  }

  // ─── Vector branch ─────────────────────────────────────────────────────────
  if (deps.embedder.isReady()) {
    try {
      const queryVec = await deps.embedder.embed(query);
      const allOpts: { excludeConversationId?: string } = {};
      if (opts.excludeConversationId)
        allOpts.excludeConversationId = opts.excludeConversationId;
      const all = await deps.vectors.listAllWithContext(allOpts);
      const scored: Array<{
        row: (typeof all)[number];
        score: number;
      }> = [];
      for (const row of all) {
        if (row.embedder !== deps.embedder.name) continue; // cross-scheme skip
        if (!inProjectScope(row.projectId, opts.projectScope)) continue;
        const sim = cosineSimilarity(queryVec, row.vector);
        if (sim <= 0) continue;
        scored.push({ row, score: sim });
      }
      scored.sort((a, b) => b.score - a.score);
      for (let i = 0; i < Math.min(scored.length, 25); i++) {
        const { row, score } = scored[i]!;
        bump(
          row.messageId,
          {
            messageId: row.messageId,
            conversationId: row.conversationId,
            conversationTitle: row.conversationTitle,
            projectId: row.projectId,
            role: row.role,
            excerpt: truncate(row.content, excerptMax),
            score,
            source: 'vector',
            messageCreatedAt: row.messageCreatedAt
          },
          'vector'
        );
      }
    } catch {
      // No embeddings yet, embedder failed mid-call → vector branch
      // contributes nothing; FTS still surfaces results.
    }
  }

  return [...merged.values()]
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};
