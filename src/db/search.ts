import { getDb } from './db';

export type SearchHit = {
  message_id: string;
  conversation_id: string;
  conversation_title: string;
  project_id: string | null;
  project_name: string | null;
  role: 'user' | 'assistant' | 'system';
  snippet: string;
  created_at: number;
};

/**
 * Sanitize raw user input into an FTS5 MATCH query.
 *
 * - Splits on whitespace.
 * - Wraps each token in double quotes (escaping internal `"`) so symbols
 *   don't trip the FTS5 parser.
 * - Adds a `*` suffix on the last token so partial words match
 *   ("design" → matches "designer", "designed").
 *
 * Result: a tolerant prefix+phrase search over the user's words.
 */
const sanitizeQuery = (raw: string): string => {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/"/g, '""'));
  if (tokens.length === 0) return '';
  const head = tokens.slice(0, -1).map((t) => `"${t}"`);
  const last = tokens[tokens.length - 1]!;
  // FTS5 prefix queries require a non-empty token + asterisk.
  const tail = last.length > 0 ? `"${last}"*` : '';
  return [...head, tail].filter(Boolean).join(' ');
};

export const searchMessages = async (
  raw: string,
  limit = 50
): Promise<SearchHit[]> => {
  const query = sanitizeQuery(raw);
  if (!query) return [];
  // snippet() args: table, column index, prefix, suffix, ellipsis, max-tokens.
  const sql = `
    SELECT
      m.id           AS message_id,
      m.conversation_id,
      c.title        AS conversation_title,
      c.project_id,
      p.name         AS project_name,
      m.role,
      m.created_at,
      snippet(messages_fts, 0, '«', '»', '…', 12) AS snippet
    FROM messages_fts
    JOIN messages m ON messages_fts.rowid = m.rowid
    JOIN conversations c ON c.id = m.conversation_id
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE messages_fts MATCH ?
    ORDER BY m.created_at DESC
    LIMIT ?
  `;
  return getDb().getAllAsync<SearchHit>(sql, query, limit);
};
