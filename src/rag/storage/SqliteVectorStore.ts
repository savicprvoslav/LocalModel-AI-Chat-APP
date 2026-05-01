import type { SqliteAdapter } from '../types';
import type {
  EmbeddingCoverage,
  EmbeddingRow,
  UnembeddedRow,
  VectorStore
} from './types';

/**
 * SQLite-backed vector store. Vectors are stored as JSON arrays in the
 * `message_embeddings` table; cosine ranking is computed in JS by the
 * retrieval layer. For personal-scale corpora (low thousands), this is
 * fast enough; swap to sqlite-vec when crossing ~10k messages.
 *
 * Schema is owned by the host app (see src/db/schema.ts in this repo).
 * RAG only reads/writes — it does not migrate.
 */
export class SqliteVectorStore implements VectorStore {
  constructor(private readonly db: SqliteAdapter) {}

  async upsert(args: {
    messageId: string;
    vector: number[];
    embedder: string;
  }): Promise<void> {
    const json = JSON.stringify(args.vector);
    await this.db.runAsync(
      'INSERT OR REPLACE INTO message_embeddings(message_id,vector,dim,embedder,created_at) VALUES (?,?,?,?,?)',
      args.messageId,
      json,
      args.vector.length,
      args.embedder,
      Date.now()
    );
  }

  async delete(messageId: string): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM message_embeddings WHERE message_id = ?',
      messageId
    );
  }

  async has(messageId: string, embedder: string): Promise<boolean> {
    const row = await this.db.getFirstAsync<{ message_id: string }>(
      'SELECT message_id FROM message_embeddings WHERE message_id = ? AND embedder = ?',
      messageId,
      embedder
    );
    return !!row;
  }

  async listAllWithContext(
    options: { excludeConversationId?: string; limit?: number } = {}
  ): Promise<EmbeddingRow[]> {
    const filters: string[] = [];
    const args: (string | number)[] = [];
    if (options.excludeConversationId) {
      filters.push('m.conversation_id != ?');
      args.push(options.excludeConversationId);
    }
    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const limit = options.limit ?? 5000;
    args.push(limit);

    type Row = {
      message_id: string;
      vector: string;
      dim: number;
      embedder: string;
      created_at: number;
      content: string;
      role: 'user' | 'assistant' | 'system';
      conversation_id: string;
      conversation_title: string;
      project_id: string | null;
      message_created_at: number;
    };

    const rows = await this.db.getAllAsync<Row>(
      `SELECT
         e.message_id,
         e.vector,
         e.dim,
         e.embedder,
         e.created_at,
         m.content,
         m.role,
         m.conversation_id,
         m.created_at AS message_created_at,
         c.title AS conversation_title,
         c.project_id
       FROM message_embeddings e
       JOIN messages m ON m.id = e.message_id
       JOIN conversations c ON c.id = m.conversation_id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT ?`,
      ...args
    );

    return rows.map((r) => ({
      messageId: r.message_id,
      vector: JSON.parse(r.vector) as number[],
      dim: r.dim,
      embedder: r.embedder,
      embeddingCreatedAt: r.created_at,
      content: r.content,
      role: r.role,
      conversationId: r.conversation_id,
      conversationTitle: r.conversation_title,
      projectId: r.project_id,
      messageCreatedAt: r.message_created_at
    }));
  }

  async coverage(embedder: string): Promise<EmbeddingCoverage> {
    const e = await this.db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM message_embeddings WHERE embedder = ?',
      embedder
    );
    const t = await this.db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM messages WHERE content != ''"
    );
    return { embedded: e?.n ?? 0, total: t?.n ?? 0 };
  }

  async listUnembedded(embedder: string, limit = 500): Promise<UnembeddedRow[]> {
    return this.db.getAllAsync<UnembeddedRow>(
      `SELECT m.id, m.content
       FROM messages m
       LEFT JOIN message_embeddings e
         ON e.message_id = m.id AND e.embedder = ?
       WHERE e.message_id IS NULL
         AND m.content != ''
       ORDER BY m.created_at ASC
       LIMIT ?`,
      embedder,
      limit
    );
  }
}
