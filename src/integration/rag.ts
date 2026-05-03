/**
 * Host-app singleton wiring for the RAG module.
 *
 * `src/rag/` is intentionally global-free so it can be lifted to a
 * standalone package. This file holds the app's singleton instance and
 * the adapters that bridge our `llamaRnEngine` and `expo-sqlite` DB
 * into the surfaces RAG expects.
 *
 * Initialize once after `initDb()` succeeds (see src/providers.tsx).
 */
import { createRag } from '@/rag';
import type { LlmAdapter, Rag, SqliteAdapter } from '@/rag';
import { getDb } from '@/db/db';
import { llamaRnEngine } from '@/engine/llamaRnEngine';

let _rag: Rag | null = null;

const buildLlmAdapter = (): LlmAdapter => ({
  isReady: () => llamaRnEngine.isReady(),
  // RAG's adapter contract is intentionally string-based (see rag/types.ts).
  // The engine moved to a structured messages API; we wrap by sending the
  // RAG prompt as a single user-role message.
  streamCompletion: (prompt, options, cb) =>
    llamaRnEngine.streamCompletion(
      { messages: [{ role: 'user', content: prompt }] },
      options,
      cb
    )
});

const buildDbAdapter = (): SqliteAdapter => ({
  runAsync: (sql, ...params) =>
    getDb().runAsync(sql, ...(params as never[])),
  getFirstAsync: <T,>(sql: string, ...params: unknown[]) =>
    getDb().getFirstAsync<T>(sql, ...(params as never[])),
  getAllAsync: <T,>(sql: string, ...params: unknown[]) =>
    getDb().getAllAsync<T>(sql, ...(params as never[]))
});

/**
 * Initialize the singleton. Idempotent. Call after `initDb()` so the
 * SQLite handle is ready when adapters fire.
 */
export const initRag = (): Rag => {
  if (_rag) return _rag;
  _rag = createRag({
    llm: buildLlmAdapter(),
    db: buildDbAdapter(),
    embedder: 'auto'
  });
  return _rag;
};

/** Returns the singleton; throws if not initialized. */
export const getRag = (): Rag => {
  if (!_rag) throw new Error('rag not initialized — call initRag() first');
  return _rag;
};

/** Test/dev helper. Replace the singleton with a stub. */
export const setRag = (rag: Rag | null): void => {
  _rag = rag;
};
