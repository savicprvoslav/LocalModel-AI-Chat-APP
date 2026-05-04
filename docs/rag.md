# RAG

How retrieval-augmented generation works in this app: hybrid retrieval over past conversations, on-device sentence embeddings, FTS5 keyword search, entity extraction. The whole layer lives in [src/rag/](../src/rag/) and is intentionally portable — no app-specific imports, so it could be lifted into its own npm package.

## What problem this solves

Two related problems:

1. **Long-running context across conversations.** When you ask "did Tom say anything about the Postgres migration last week?", the model has zero memory of last week — its context window is whatever you fit in this turn. A retrieval layer searches past conversation history and surfaces the relevant snippets to inject into the prompt.

2. **Project memory.** A "project" is a folder for conversations that share context (a client, a topic, a side project). Inside a project, the model needs to know who the people are, what the constraints are, what's been decided. We persist these as structured `name → description` entities and prepend them to every conversation in the project.

The retrieval layer covers (1). The fact-extraction layer covers (2). Both live behind the same `Rag` interface.

## The shape of the layer

```
┌─────────────────────────────────────────────────────────────────────┐
│  src/integration/rag.ts          Host-app singleton wiring          │
│    └── createRag({ llm, db, embedder })                             │
└────────────────────────────┬────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────────┐
│  src/rag/Rag.ts             RagImpl — top-level coordinator         │
│    ├── warmup() / dispose() / status()                              │
│    ├── indexMessage()                                               │
│    ├── retrieve(query, opts) → Snippet[]                            │
│    ├── proposeFactsFromConversation() → ProposedFact[]              │
│    ├── saveFact() / listFacts() / deleteFact()                      │
│    └── runBackfill()                                                │
└──┬──────────────┬──────────────────┬─────────────────────────────┬──┘
   ↓              ↓                  ↓                             ↓
┌────────┐  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│ embedder│  │ FtsSearcher  │  │ VectorStore      │  │ FactStore            │
│ (MiniLM │  │ (SQLite FTS5)│  │ (SQLite + JS     │  │ (project_entities    │
│  / Hash)│  │              │  │  cosine)         │  │  table)              │
└────────┘  └──────────────┘  └──────────────────┘  └──────────────────────┘
```

The host wires these adapters in [src/integration/rag.ts](../src/integration/rag.ts). The module itself never imports `expo-sqlite` or `llama.rn` directly — it talks to `LlmAdapter` and `SqliteAdapter` interfaces.

## Hybrid retrieval

`Rag.retrieve(query, opts)` is implemented in [src/rag/retrieval/retrieve.ts](../src/rag/retrieval/retrieve.ts). It runs two branches and merges:

### FTS5 branch

SQLite FTS5 full-text index over message content. Created via the `messages_fts` virtual table and kept in sync with INSERT/UPDATE/DELETE triggers (see [src/db/schema.ts](../src/db/schema.ts)). Tokenizer: `porter unicode61`.

For a 5-word query, FTS5 returns up to 25 hits ranked by BM25. We map rank to a score in `[0.15, 0.6]` — capped at 0.6 so a strong vector match can still outrank top FTS hits. Each hit gets snippet highlighting (we strip the `«...»` markers in the merge step).

### Vector branch

We embed the query with the active embedder (see below), then compute cosine similarity against every stored vector whose `embedder` field matches the active embedder name. Cross-embedder vectors are skipped — comparing a 384-dim MiniLM vector to a 256-dim hash vector is mathematically meaningless, but storing both is fine: each row carries an `embedder` column.

Top 25 by similarity are merged into the result map.

### Merge logic

```ts
if not seen:    add with source = 'fts' or 'vector'
if seen:        score = min(1, score_a + score_b);  source = 'hybrid'
```

Summing handles the "FTS hits, vector misses" and "vector hits, FTS misses" cases gracefully — degrading to whichever branch fired. When both fire, the message gets a small boost for showing up in both.

The final list is filtered by `minScore` (default 0.15), sorted by score, and capped at `limit` (default 4).

### Why hybrid

- **FTS5 is exact-match king.** Proper nouns, code snippets, distinctive technical terms — FTS finds them precisely. Small embedders can be weak here because rare tokens get under-trained.
- **Cosine similarity is fuzzy-match king.** Paraphrase, semantic neighborhood, "the meeting" matching "the chat about Postgres" — vectors handle it.
- **Either alone has blind spots.** Hybrid catches both with one extra few-millisecond cost.

### Filtering

`retrieve()` accepts:

- `excludeConversationId` — skip the current conversation (avoid surfacing what the user just typed).
- `projectScope` — `'any'` | `null` (inbox-only) | `<projectId>` (project-only). `null` means "messages with no project assigned".
- `limit`, `minScore`, `excerptMaxChars`, `minQueryChars`.

If the query has fewer than `minQueryChars` (default 4) non-whitespace characters, retrieval is skipped entirely — too noisy.

## Embeddings

Two implementations behind the `Embedder` interface, plus an auto-fallback wrapper:

| Embedder | Dim | Source | When |
| --- | --- | --- | --- |
| **MiniLmEmbedder** | 384 | MiniLM-L6-v2 via `react-native-executorch` | Production. Real semantic embeddings. |
| **HashEmbedder** | 256 | Bag-of-words feature hashing in pure JS | Tests, devices without `executorch`, fallback when MiniLM fails to load. |
| **AutoEmbedder** | — | Wrapper. Tries MiniLM first; on `load()` failure, transparently swaps to Hash for the rest of the session. | Default. |

[src/rag/embeddings/factory.ts](../src/rag/embeddings/factory.ts) exposes `createEmbedder(choice: 'auto' | 'minilm' | 'hash')`. The host passes `'auto'` in [src/integration/rag.ts](../src/integration/rag.ts).

### Why MiniLM specifically

MiniLM-L6-v2 is the de-facto default for small sentence embeddings: 22M parameters, 384 dimensions, trained on 1B+ sentence pairs, BSD-3 licensed, cross-platform. It runs comfortably on phones.

We considered larger embedders (BGE, E5) but the marginal quality gain wasn't worth the file size and runtime cost on a 4 GB device that's already running a 3B language model.

### The Hash fallback

`HashEmbedder` is a deterministic feature-hashing embedder. It's not "good" — it's "always works." When `react-native-executorch` is missing or the MiniLM model file fails to download, we don't want retrieval to silently disappear; the Hash fallback keeps it functioning at degraded quality. You'll get correct-when-the-words-overlap retrieval and lose paraphrase matching.

This is a deliberate failure mode: degrade, don't disable.

### Cross-embedder safety

Each row in `message_embeddings` stores its `embedder` name (`'minilm-l6-v2'`, `'hash-256'`). When we retrieve, only rows matching the *currently active* embedder are scored. So if you start with Hash, generate vectors, then later upgrade to MiniLM, the old Hash vectors don't pollute results — they sit dormant until a backfill re-embeds them.

`Rag.runBackfill()` exposes that re-embed path. It walks all messages and (re-)embeds any that don't have a current-embedder vector. The progress is exposed via `Rag.status().backfill`.

## Storage layer

Two SQLite-backed stores:

- **`SqliteVectorStore`** ([src/rag/storage/SqliteVectorStore.ts](../src/rag/storage/SqliteVectorStore.ts)) — the `message_embeddings` table. Columns: `message_id PK`, `vector TEXT (JSON-encoded number[])`, `dim INTEGER`, `embedder TEXT`, `created_at INTEGER`. Operations: upsert, delete, list with conversation/project context joined.
- **`SqliteFactStore`** ([src/rag/storage/SqliteFactStore.ts](../src/rag/storage/SqliteFactStore.ts)) — the `project_entities` table. Columns: `id PK`, `project_id`, `name`, `description`, timestamps. CRUD.

### Why JSON vectors instead of `sqlite-vec`

Two reasons:

1. **Personal-scale corpora are well within JS reach.** Hundreds of messages, low thousands. Cosine over `Float32Array`-backed vectors in JS is fast enough that the round-trip dominates.
2. **`sqlite-vec` is a forced dependency for a marginal win.** It would require a custom build of SQLite or a JSI port. The added complexity isn't justified at our scale.

Migrating later is a known future path. The schema is designed for it: `vector TEXT` becomes `vector BLOB`, the cosine implementation becomes a SQL extension function, and the retrieve logic doesn't care which.

## Entity extraction

[src/rag/extraction/extractFacts.ts](../src/rag/extraction/extractFacts.ts) takes a conversation and asks the model to propose `name → description` entities worth pinning to the project. The flow:

1. Take recent messages in the conversation (capped, oldest dropped).
2. Build a tight extraction prompt:

   > Extract people, places, projects, concepts, deadlines… that are worth remembering for future conversations in this project. Return a JSON array of `{name, description}`.

3. Stream completion. Parse the response as JSON. Reject anything malformed.
4. De-duplicate against existing facts in the same project (case-insensitive name match).
5. Return `ProposedFact[]` to the UI.

The UI surfaces these in `EntityProposalModal` — the user picks which ones to pin. Pinned facts go into `project_entities` and are prepended to every conversation in that project as the "Known entities" block.

This is run on demand via the conversation overflow → "Extract entities to project" action. It's not automatic — extraction quality is good but the user should still be the curator.

## Indexing

`Rag.indexMessage({ messageId, content })` is called by `useConversation` in two places:

- After persisting the user turn (best-effort, parallel to model warmup).
- After the assistant's final visible answer is persisted (visible only — *not* the reasoning content).

It computes the embedding, upserts into `message_embeddings`, and returns. FTS5 indexing is automatic (the SQLite triggers on `messages` keep `messages_fts` in sync).

Best-effort means errors are swallowed silently. Indexing is an enhancement; failing it should never block a conversation.

## What gets passed to the model

When retrieval returns hits, [buildMessages in src/chat/promptBuilder.ts](../src/chat/promptBuilder.ts) folds them into the system prompt as a `RELEVANT FROM PAST CONVERSATIONS` block:

```
RELEVANT FROM PAST CONVERSATIONS (background only — only mention if directly useful):
- [~/acme/board-prep] Tom said the timeline is tight; aim for late Q1.
- [~/acme/q4-plan] Migration scoped for Q1, not Q4.
```

The "only mention if directly useful" instruction is intentional — we want the snippets to inform the model without it volunteering unrelated context to the user. Small models are imperfect at this; pair with a Concise persona for best results.

## Privacy stance

The whole RAG layer runs on-device:

- Embeddings: computed locally by `react-native-executorch` running MiniLM.
- FTS5: SQLite full-text index, on-device.
- Storage: SQLite, on-device.
- Retrieval: cosine similarity in JS, on-device.

No part of retrieval makes a network call. No conversation content is uploaded for any RAG operation.

## Adding a new embedder

The `Embedder` interface is small:

```ts
interface Embedder {
  readonly name: string;     // unique id stored on each row
  readonly dim: number;      // vector dimension
  isReady(): boolean;
  load(opts?): Promise<boolean>;
  embed(text: string): Promise<number[]>;
  unload(): Promise<void>;
}
```

Add a class implementing it under `src/rag/embeddings/`. Wire it into `createEmbedder()` in `factory.ts`. If you want to make it the new default, change the `'auto'` wrapper to try yours first.

Important: pick a unique `name` and bump it whenever the underlying weights change. Otherwise rows you wrote in the past will look current but contain incompatible vectors.

## File reference

- [src/rag/Rag.ts](../src/rag/Rag.ts) — top-level coordinator.
- [src/rag/types.ts](../src/rag/types.ts) — public interfaces.
- [src/rag/retrieval/retrieve.ts](../src/rag/retrieval/retrieve.ts) — hybrid retrieval logic.
- [src/rag/retrieval/fts.ts](../src/rag/retrieval/fts.ts) — FTS5 wrapper.
- [src/rag/retrieval/cosine.ts](../src/rag/retrieval/cosine.ts) — vector cosine.
- [src/rag/embeddings/MiniLmEmbedder.ts](../src/rag/embeddings/MiniLmEmbedder.ts) — production embedder.
- [src/rag/embeddings/HashEmbedder.ts](../src/rag/embeddings/HashEmbedder.ts) — fallback embedder.
- [src/rag/embeddings/factory.ts](../src/rag/embeddings/factory.ts) — `createEmbedder()` and the AutoEmbedder.
- [src/rag/extraction/extractFacts.ts](../src/rag/extraction/extractFacts.ts) — entity extraction.
- [src/rag/storage/SqliteVectorStore.ts](../src/rag/storage/SqliteVectorStore.ts), [SqliteFactStore.ts](../src/rag/storage/SqliteFactStore.ts) — persistence.
- [src/rag/backfill/backfill.ts](../src/rag/backfill/backfill.ts) — re-embed existing messages.
- [src/integration/rag.ts](../src/integration/rag.ts) — host-app wiring.
- [src/db/schema.ts](../src/db/schema.ts) — `message_embeddings` and `messages_fts` schema.

## Related docs

- [Architecture](./architecture.md) — where this layer sits and how it's invoked.
- [Database](./database.md) — schema details for `message_embeddings`, `project_entities`, and the FTS5 triggers.
- [Engine](./engine.md) — the LLM adapter that the RAG layer uses for entity extraction.
