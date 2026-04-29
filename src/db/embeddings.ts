import { getDb } from './db';

export type StoredEmbedding = {
  message_id: string;
  vector: number[];
  dim: number;
  embedder: string;
  created_at: number;
};

export type EmbeddingWithMessage = StoredEmbedding & {
  content: string;
  role: 'user' | 'assistant' | 'system';
  conversation_id: string;
  conversation_title: string;
  project_id: string | null;
  message_created_at: number;
};

export const upsertEmbedding = async (args: {
  message_id: string;
  vector: number[];
  embedder: string;
}): Promise<void> => {
  const json = JSON.stringify(args.vector);
  await getDb().runAsync(
    'INSERT OR REPLACE INTO message_embeddings(message_id,vector,dim,embedder,created_at) VALUES (?,?,?,?,?)',
    args.message_id,
    json,
    args.vector.length,
    args.embedder,
    Date.now()
  );
};

export const deleteEmbedding = async (messageId: string): Promise<void> => {
  await getDb().runAsync(
    'DELETE FROM message_embeddings WHERE message_id = ?',
    messageId
  );
};

export const hasEmbedding = async (messageId: string): Promise<boolean> => {
  const row = await getDb().getFirstAsync<{ message_id: string }>(
    'SELECT message_id FROM message_embeddings WHERE message_id = ?',
    messageId
  );
  return !!row;
};

/**
 * Pull every embedding joined with its message + conversation + project info.
 * Used for in-JS cosine ranking. For personal scale this is fine; if a user
 * grows past ~10k messages, switch to sqlite-vec.
 */
export const listAllEmbeddingsWithContext = async (
  options: { excludeConversationId?: string; limit?: number } = {}
): Promise<EmbeddingWithMessage[]> => {
  const filters: string[] = [];
  const args: (string | number)[] = [];
  if (options.excludeConversationId) {
    filters.push('m.conversation_id != ?');
    args.push(options.excludeConversationId);
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const limit = options.limit ?? 5000;
  args.push(limit);

  const rows = await getDb().getAllAsync<{
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
  }>(
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
    message_id: r.message_id,
    vector: JSON.parse(r.vector) as number[],
    dim: r.dim,
    embedder: r.embedder,
    created_at: r.created_at,
    content: r.content,
    role: r.role,
    conversation_id: r.conversation_id,
    conversation_title: r.conversation_title,
    project_id: r.project_id,
    message_created_at: r.message_created_at
  }));
};

/** Count of embedded vs total messages — for UI progress on re-index. */
export const embeddingCoverage = async (): Promise<{
  embedded: number;
  total: number;
}> => {
  const e = await getDb().getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM message_embeddings'
  );
  const t = await getDb().getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM messages WHERE content != \'\''
  );
  return { embedded: e?.n ?? 0, total: t?.n ?? 0 };
};

/** Returns message ids that don't yet have an embedding, in chronological order. */
export const listUnembeddedMessageIds = async (
  limit = 500
): Promise<Array<{ id: string; content: string }>> =>
  getDb().getAllAsync<{ id: string; content: string }>(
    `SELECT m.id, m.content
     FROM messages m
     LEFT JOIN message_embeddings e ON e.message_id = m.id
     WHERE e.message_id IS NULL
       AND m.content != ''
     ORDER BY m.created_at ASC
     LIMIT ?`,
    limit
  );
