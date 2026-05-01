import { createEmbedder } from './embeddings/factory';
import { runBackfill } from './backfill/backfill';
import {
  extractFactsFromConversation,
  proposeFactsFromConversation
} from './extraction/extractFacts';
import { retrieve } from './retrieval/retrieve';
import { SqliteFtsSearcher } from './retrieval/fts';
import { SqliteFactStore } from './storage/SqliteFactStore';
import { SqliteVectorStore } from './storage/SqliteVectorStore';
import type {
  ConvMessage,
  Embedder,
  Fact,
  IndexMessageArgs,
  ProposedFact,
  Rag,
  RagConfig,
  RagStatus,
  RetrieveOptions,
  SaveFactArgs,
  Snippet
} from './types';
import type { FactStore, FtsSearcher, VectorStore } from './storage/types';

/**
 * Top-level coordinator. Wires together an embedder, vector + fact stores,
 * and the FTS searcher behind a single object. The host app should create
 * one instance, hold a reference, and call its methods — everything in
 * `src/rag/` flows through here.
 *
 * Stores and the searcher are created from the supplied SqliteAdapter. The
 * embedder is created from `config.embedder` (default 'auto'). Loading is
 * lazy — `warmup()` triggers it explicitly, otherwise it runs on first
 * embed/retrieve call.
 */
class RagImpl implements Rag {
  private readonly embedder: Embedder;
  private readonly vectors: VectorStore;
  private readonly facts: FactStore;
  private readonly fts: FtsSearcher;

  private warmupPromise: Promise<void> | null = null;
  private backfillState: { running: boolean; pct: number } = {
    running: false,
    pct: 0
  };

  constructor(private readonly config: RagConfig) {
    this.embedder = createEmbedder(config.embedder ?? 'auto');
    this.vectors = new SqliteVectorStore(config.db);
    this.facts = new SqliteFactStore(config.db);
    this.fts = new SqliteFtsSearcher(config.db);
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  async warmup(opts?: {
    onDownloadProgress?: (pct: number) => void;
  }): Promise<void> {
    if (this.embedder.isReady()) return;
    if (this.warmupPromise) return this.warmupPromise;
    this.warmupPromise = this.embedder.load(opts).then(() => undefined);
    try {
      await this.warmupPromise;
    } finally {
      this.warmupPromise = null;
    }
  }

  async dispose(): Promise<void> {
    await this.embedder.unload();
  }

  status(): RagStatus {
    return {
      embedder: this.embedder.name,
      embedderReady: this.embedder.isReady(),
      backfill: { ...this.backfillState }
    };
  }

  // ─── Indexing ────────────────────────────────────────────────────────────

  async indexMessage(args: IndexMessageArgs): Promise<void> {
    if (!args.content.trim()) return;
    if (!this.embedder.isReady()) {
      // Warmup is best-effort here — caller already persisted the message,
      // so a failed embed just means "no vector yet, backfill later".
      const ok = await this.embedder.load();
      if (!ok) return;
    }
    try {
      const vector = await this.embedder.embed(args.content);
      if (!vector || vector.length === 0) return;
      await this.vectors.upsert({
        messageId: args.messageId,
        vector,
        embedder: this.embedder.name
      });
    } catch {
      // Swallow — embeddings are an enhancement, not a hard requirement.
    }
  }

  async removeMessage(messageId: string): Promise<void> {
    await this.vectors.delete(messageId);
  }

  // ─── Retrieval ───────────────────────────────────────────────────────────

  async retrieve(query: string, opts?: RetrieveOptions): Promise<Snippet[]> {
    return retrieve(
      { embedder: this.embedder, vectors: this.vectors, fts: this.fts },
      query,
      opts ?? {}
    );
  }

  // ─── Facts ───────────────────────────────────────────────────────────────

  async saveFact(args: SaveFactArgs): Promise<Fact> {
    return this.facts.create(args);
  }
  async listFacts(projectId: string): Promise<Fact[]> {
    return this.facts.list(projectId);
  }
  async updateFact(
    factId: string,
    patch: Partial<Pick<Fact, 'name' | 'description'>>
  ): Promise<void> {
    return this.facts.update(factId, patch);
  }
  async deleteFact(factId: string): Promise<void> {
    return this.facts.delete(factId);
  }
  async extractFactsFromConversation(
    messages: ConvMessage[],
    projectId: string,
    opts?: { signal?: AbortSignal }
  ): Promise<Fact[]> {
    return extractFactsFromConversation(
      { llm: this.config.llm, facts: this.facts },
      messages,
      projectId,
      opts ?? {}
    );
  }
  async proposeFactsFromConversation(
    messages: ConvMessage[],
    projectId: string,
    opts?: { signal?: AbortSignal }
  ): Promise<ProposedFact[]> {
    return proposeFactsFromConversation(
      { llm: this.config.llm, facts: this.facts },
      messages,
      projectId,
      opts ?? {}
    );
  }

  // ─── Maintenance ─────────────────────────────────────────────────────────

  async coverage(): Promise<{ embedded: number; total: number }> {
    return this.vectors.coverage(this.embedder.name);
  }

  async runBackfill(opts?: {
    batchSize?: number;
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
  }): Promise<{ embedded: number; total: number }> {
    if (this.backfillState.running) {
      return this.vectors.coverage(this.embedder.name);
    }
    this.backfillState = { running: true, pct: 0 };
    try {
      // Make sure the embedder is loaded before backfilling — backfill into
      // an unloaded embedder is a no-op.
      if (!this.embedder.isReady()) {
        const ok = await this.embedder.load();
        if (!ok) return this.vectors.coverage(this.embedder.name);
      }
      const result = await runBackfill(
        { embedder: this.embedder, vectors: this.vectors },
        {
          ...(opts?.batchSize !== undefined ? { batchSize: opts.batchSize } : {}),
          ...(opts?.signal ? { signal: opts.signal } : {}),
          onProgress: (pct) => {
            this.backfillState.pct = pct;
            opts?.onProgress?.(pct);
          }
        }
      );
      return result;
    } finally {
      this.backfillState = { running: false, pct: 1 };
    }
  }
}

export const createRag = (config: RagConfig): Rag => new RagImpl(config);
