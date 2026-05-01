import type { Fact } from '../types';

/** A vector row joined with enough message/conversation context for retrieval. */
export type EmbeddingRow = {
  messageId: string;
  vector: number[];
  dim: number;
  embedder: string;
  embeddingCreatedAt: number;
  content: string;
  role: 'user' | 'assistant' | 'system';
  conversationId: string;
  conversationTitle: string;
  projectId: string | null;
  messageCreatedAt: number;
};

export type EmbeddingCoverage = { embedded: number; total: number };

/** A bare message id + content row, used by the backfill scheduler. */
export type UnembeddedRow = { id: string; content: string };

/**
 * Persistence for per-message dense vectors. Implementations may use SQLite
 * with JSON-encoded vectors, sqlite-vec, an in-memory map, or anything else
 * matching the contract.
 */
export interface VectorStore {
  upsert(args: {
    messageId: string;
    vector: number[];
    embedder: string;
  }): Promise<void>;
  delete(messageId: string): Promise<void>;
  has(messageId: string, embedder: string): Promise<boolean>;
  /**
   * All vectors joined with message + conversation context. Used for in-JS
   * cosine ranking. Implementations may apply a hard cap.
   */
  listAllWithContext(options?: {
    excludeConversationId?: string;
    limit?: number;
  }): Promise<EmbeddingRow[]>;
  /** Counts for backfill UI. */
  coverage(embedder: string): Promise<EmbeddingCoverage>;
  /**
   * Messages without an embedding for the given embedder, oldest-first.
   * Used by the backfill scheduler.
   */
  listUnembedded(embedder: string, limit?: number): Promise<UnembeddedRow[]>;
}

/** Snippet returned from FTS5 search before merging with vector hits. */
export type FtsHit = {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  projectId: string | null;
  role: 'user' | 'assistant' | 'system';
  /** May contain `«…»` markers for matched terms. */
  snippet: string;
  createdAt: number;
};

export interface FtsSearcher {
  search(query: string, limit?: number): Promise<FtsHit[]>;
}

/** Persistence for facts (project entities). */
export interface FactStore {
  create(args: {
    projectId: string;
    name: string;
    description?: string;
  }): Promise<Fact>;
  list(projectId: string): Promise<Fact[]>;
  update(
    factId: string,
    patch: Partial<Pick<Fact, 'name' | 'description'>>
  ): Promise<void>;
  delete(factId: string): Promise<void>;
}
