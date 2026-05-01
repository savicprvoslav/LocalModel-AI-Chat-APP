import type { SqliteAdapter } from '../types';
import type { FtsHit, FtsSearcher } from '../storage/types';

/**
 * FTS5 search backed by the host's `messages_fts` virtual table. The FTS
 * schema and triggers are owned by the host (see src/db/schema.ts in this
 * repo); RAG only queries.
 *
 * The user's raw text is sanitized into a tolerant prefix+phrase MATCH:
 * each token is quoted (so symbols don't trip the parser) and the last
 * token gets a `*` suffix for prefix matching.
 */
export class SqliteFtsSearcher implements FtsSearcher {
  constructor(private readonly db: SqliteAdapter) {}

  async search(raw: string, limit = 50): Promise<FtsHit[]> {
    const query = sanitizeFtsQuery(raw);
    if (!query) return [];
    type Row = {
      message_id: string;
      conversation_id: string;
      conversation_title: string;
      project_id: string | null;
      role: 'user' | 'assistant' | 'system';
      snippet: string;
      created_at: number;
    };
    const rows = await this.db.getAllAsync<Row>(
      `SELECT
         m.id           AS message_id,
         m.conversation_id,
         c.title        AS conversation_title,
         c.project_id,
         m.role,
         m.created_at,
         snippet(messages_fts, 0, '«', '»', '…', 12) AS snippet
       FROM messages_fts
       JOIN messages m ON messages_fts.rowid = m.rowid
       JOIN conversations c ON c.id = m.conversation_id
       WHERE messages_fts MATCH ?
       ORDER BY m.created_at DESC
       LIMIT ?`,
      query,
      limit
    );
    return rows.map((r) => ({
      messageId: r.message_id,
      conversationId: r.conversation_id,
      conversationTitle: r.conversation_title,
      projectId: r.project_id,
      role: r.role,
      snippet: r.snippet,
      createdAt: r.created_at
    }));
  }
}

export const sanitizeFtsQuery = (raw: string): string => {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/"/g, '""'));
  if (tokens.length === 0) return '';
  const head = tokens.slice(0, -1).map((t) => `"${t}"`);
  const last = tokens[tokens.length - 1]!;
  const tail = last.length > 0 ? `"${last}"*` : '';
  return [...head, tail].filter(Boolean).join(' ');
};
