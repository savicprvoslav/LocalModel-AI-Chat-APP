/**
 * Test helpers for the RAG module. Use the host app's expo-sqlite-backed
 * test DB and a no-op LLM. The 'hash' embedder choice avoids any native
 * module dependency, keeping tests Jest-runnable.
 */
import { initTestDb, getDb, resetDb } from '@/db/db';
import { createRag } from '../Rag';
import type { LlmAdapter, Rag, SqliteAdapter } from '../types';

const dbAdapter: SqliteAdapter = {
  runAsync: (sql, ...params) =>
    getDb().runAsync(sql, ...(params as never[])),
  getFirstAsync: <T,>(sql: string, ...params: unknown[]) =>
    getDb().getFirstAsync<T>(sql, ...(params as never[])),
  getAllAsync: <T,>(sql: string, ...params: unknown[]) =>
    getDb().getAllAsync<T>(sql, ...(params as never[]))
};

/**
 * Fake LLM that just returns a scripted body for fact-extraction tests.
 * Set `cfg.scripted` to control what `streamCompletion` writes.
 */
export type FakeLlmConfig = { ready?: boolean; scripted?: string };
export const createFakeLlm = (cfg: FakeLlmConfig = {}): LlmAdapter => ({
  isReady: () => cfg.ready ?? true,
  async streamCompletion(_prompt, _options, cb) {
    const text = cfg.scripted ?? '';
    for (const ch of text) cb.onToken(ch);
    cb.onDone();
  }
});

export const setupRagForTest = async (
  llmCfg: FakeLlmConfig = {}
): Promise<Rag> => {
  resetDb();
  await initTestDb();
  return createRag({
    llm: createFakeLlm(llmCfg),
    db: dbAdapter,
    embedder: 'hash'
  });
};
