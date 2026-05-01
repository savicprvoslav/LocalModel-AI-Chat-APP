/**
 * Public types for the RAG module.
 *
 * Anything exported from `@/rag` is part of the stable surface — callers
 * outside this folder must not import internals. This file is intentionally
 * the single source of types so the module can lift to its own package by
 * mechanical move.
 */

// ─── Boundary interfaces (consumer-supplied) ─────────────────────────────────

/**
 * Minimal LLM surface the RAG module needs. The host app's chat engine
 * implements this — RAG never imports llama.rn or any specific engine.
 */
export interface LlmAdapter {
  isReady(): boolean;
  /**
   * Stream a completion for `prompt`. RAG uses this for fact extraction;
   * we don't need messages-format support here because extraction prompts
   * are deterministic strings.
   */
  streamCompletion(
    prompt: string,
    options: { temperature: number; maxTokens: number; signal?: AbortSignal },
    cb: {
      onToken: (text: string) => void;
      onDone: () => void;
      onError: (err: Error) => void;
    }
  ): Promise<void>;
}

/**
 * The DB surface RAG needs. Modeled on expo-sqlite's promise API so adapting
 * is a no-op; other libs (op-sqlite, etc.) wrap to match.
 */
export interface SqliteAdapter {
  runAsync(sql: string, ...params: SqlParam[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, ...params: SqlParam[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlParam[]): Promise<T[]>;
}
export type SqlParam = string | number | null;

// ─── Domain types ────────────────────────────────────────────────────────────

/** A snippet returned from retrieval, ready to drop into a prompt. */
export type Snippet = {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  projectId: string | null;
  role: 'user' | 'assistant' | 'system';
  excerpt: string;
  /** Combined score in [0, 1]. */
  score: number;
  /** Where this hit came from. */
  source: 'fts' | 'vector' | 'hybrid';
  messageCreatedAt: number;
};

/** A fact (project entity) — a small named piece of recallable knowledge. */
export type Fact = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
};

/** A proposed fact returned by extraction before the user accepts it. */
export type ProposedFact = { name: string; description: string };

/** Minimal message shape RAG needs for fact extraction. */
export type ConvMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

// ─── Options ─────────────────────────────────────────────────────────────────

export type RetrieveOptions = {
  excludeConversationId?: string;
  /**
   * Restrict retrieval to a project (or null for unfiled). 'any' means no
   * scope filter. Default 'any'.
   */
  projectScope?: string | null | 'any';
  /** Default 4. */
  limit?: number;
  /** Default 0.15. */
  minScore?: number;
  /** Default 240. */
  excerptMaxChars?: number;
  /** Default 4. */
  minQueryChars?: number;
};

export type IndexMessageArgs = {
  messageId: string;
  content: string;
};

export type SaveFactArgs = {
  projectId: string;
  name: string;
  description?: string;
};

export type RagStatus = {
  embedder: string;
  embedderReady: boolean;
  backfill: { running: boolean; pct: number };
};

// ─── Embedder surface ────────────────────────────────────────────────────────

/**
 * Anything that turns text into a normalized vector. Implementations may
 * lazy-load weights, fall back across schemes, or fail silently — callers
 * always check `isReady()` and `name`.
 */
export interface Embedder {
  /** Stable identifier persisted alongside vectors so we can avoid mixing. */
  readonly name: string;
  readonly dim: number;
  isReady(): boolean;
  /** Best-effort load. Returns true if the embedder is usable after the call. */
  load(opts?: { onDownloadProgress?: (pct: number) => void }): Promise<boolean>;
  embed(text: string): Promise<number[]>;
  unload(): Promise<void>;
}

// ─── Top-level Rag object ────────────────────────────────────────────────────

export interface Rag {
  /** Eagerly warm the embedder. Safe to call multiple times. */
  warmup(opts?: { onDownloadProgress?: (pct: number) => void }): Promise<void>;
  /** Release embedder resources. Indexing/retrieval will fail until next warmup. */
  dispose(): Promise<void>;
  status(): RagStatus;

  // Indexing
  indexMessage(args: IndexMessageArgs): Promise<void>;
  removeMessage(messageId: string): Promise<void>;

  // Retrieval
  retrieve(query: string, opts?: RetrieveOptions): Promise<Snippet[]>;

  // Facts
  saveFact(args: SaveFactArgs): Promise<Fact>;
  listFacts(projectId: string): Promise<Fact[]>;
  updateFact(
    factId: string,
    patch: Partial<Pick<Fact, 'name' | 'description'>>
  ): Promise<void>;
  deleteFact(factId: string): Promise<void>;
  /**
   * Run extraction and persist any new facts in one shot. Returns the
   * facts that were saved (skipping duplicates of existing ones).
   */
  extractFactsFromConversation(
    messages: ConvMessage[],
    projectId: string,
    opts?: { signal?: AbortSignal }
  ): Promise<Fact[]>;
  /**
   * Run extraction and return proposals without persisting. Used by
   * review-then-confirm UX. Already deduped against existing project facts.
   */
  proposeFactsFromConversation(
    messages: ConvMessage[],
    projectId: string,
    opts?: { signal?: AbortSignal }
  ): Promise<ProposedFact[]>;

  // Maintenance
  /** Embedding coverage for the active embedder. */
  coverage(): Promise<{ embedded: number; total: number }>;
  runBackfill(opts?: {
    batchSize?: number;
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
  }): Promise<{ embedded: number; total: number }>;
}

export type RagConfig = {
  llm: LlmAdapter;
  db: SqliteAdapter;
  /**
   * Which embedder to use. 'auto' tries MiniLM and falls back to hash on any
   * load failure. Default 'auto'.
   */
  embedder?: 'auto' | 'minilm' | 'hash';
};
