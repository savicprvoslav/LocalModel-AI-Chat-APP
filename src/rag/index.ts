/**
 * Public surface of the RAG module. Anything not re-exported here is
 * internal — callers outside `src/rag/` must not deep-import.
 *
 * To extract this folder into a standalone npm package later: copy the
 * `src/rag/` tree, swap relative imports for package imports, ship.
 */

export { createRag } from './Rag';
export type {
  ConvMessage,
  Embedder,
  Fact,
  IndexMessageArgs,
  LlmAdapter,
  ProposedFact,
  Rag,
  RagConfig,
  RagStatus,
  RetrieveOptions,
  SaveFactArgs,
  Snippet,
  SqliteAdapter,
  SqlParam
} from './types';
