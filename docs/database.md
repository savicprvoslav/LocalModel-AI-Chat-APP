# Database

How the SQLite layer is structured: the schema, the migration system, the repository pattern. Everything here lives in [src/db/](../src/db/) and goes through `expo-sqlite`.

## Goals

1. **Source of truth.** Conversations, messages, projects, personas, skills, settings, embeddings, project entities — all persistent state lives in one local SQLite database.
2. **Offline-first.** No network round-trips, no cloud sync. The DB is wholly on-device.
3. **Cheap to migrate.** Schema changes ship as numbered migrations applied in order. Tests run against an in-memory DB seeded with the latest schema.
4. **Boring.** SQL inline in TS files. No ORM, no DSL, no migrations CLI.

## Connection lifecycle

[src/db/db.ts](../src/db/db.ts) owns the singleton database handle. The flow on app start:

1. `initDb()` opens the SQLite database (file path: `${FS.documentDirectory}localchat.db`).
2. Reads `PRAGMA user_version`. Falls back to `schema_meta` row if `user_version` is 0.
3. If 0 → fresh install: runs `SCHEMA_SQL` (creates everything at the latest version), sets `user_version = SCHEMA_VERSION`.
4. Otherwise: runs incremental `MIGRATIONS[N]` for every version `N` from `current+1` up to `SCHEMA_VERSION`, in order. Sets the new `user_version` after each.
5. Calls `seedBuiltins()` to ensure built-in personas + skills exist. Idempotent.

`getDb()` returns the singleton. Tests use an in-memory variant via `__mocks__/expo-sqlite.ts`.

## Schema

`SCHEMA_VERSION = 7`. The tables, in dependency order:

| Table | Purpose |
| --- | --- |
| `projects` | Top-level container for related conversations + freeform notes. |
| `personas` | Voice / expertise / tone presets. Six built-ins; user-editable. |
| `skills` | Task starters (Summarize, Code review, …). Twelve built-ins; user-editable. May pin a `model_id` and a `default_persona_id`. |
| `conversations` | A single chat thread. May belong to a project, may be skill-scoped, may have a persona override. |
| `messages` | Each turn (user / assistant / system) with `content`, `model_id`, `token_count`, `finish_reason`, `reasoning_content`, `tool_calls`. |
| `project_entities` | Structured `name → description` rows scoped per project. Prepended to system prompt. |
| `messages_fts` | FTS5 virtual table. Automatically synced via INSERT/UPDATE/DELETE triggers on `messages`. |
| `message_embeddings` | Per-message dense vectors. JSON-encoded `number[]`, scoped by `embedder` name. |
| `settings` | Key-value store. `temperature`, `max_tokens`, `context_window`, `active_model_id`, `tools_enabled`, `tools_per_tool`, etc. |
| `schema_meta` | Internal: schema version + bookkeeping. |

Foreign keys are enforced with `ON DELETE CASCADE` for ownership relationships and `ON DELETE SET NULL` for soft references (a conversation's persona, for example, can be deleted without nuking the conversation).

Indices that matter:

- `idx_conv_project ON conversations(project_id, updated_at DESC)` — for the project-thread list, sorted recent-first.
- `idx_msg_conv ON messages(conversation_id, created_at)` — for loading a conversation's messages.
- `idx_pe_project ON project_entities(project_id)` — for fact-list lookups.

The full SQL is in [src/db/schema.ts](../src/db/schema.ts).

## The migration system

There are two ways to land at the latest schema:

- **Fresh install:** run `SCHEMA_SQL`, the canonical "what does the world look like at vN" SQL.
- **Upgrade:** apply each `MIGRATIONS[N]` array of SQL statements in order from the current version up.

Both paths must converge on the same shape. The test suite verifies this implicitly by running migrations against an empty DB and comparing.

### Why both

- A fresh-install full SCHEMA is much faster than running every historical migration.
- Per-version migration arrays let upgrades be incremental — a 100-version-old install upgrades by running 100 small steps, each known-good in isolation.

### Adding a migration

1. Bump `SCHEMA_VERSION` by 1 in [src/db/schema.ts](../src/db/schema.ts).
2. Add the new `SCHEMA_VERSION` key to `MIGRATIONS` with an array of SQL statements that take a vN-1 DB to vN.
3. Update `SCHEMA_SQL` so it reflects the post-vN world (a fresh install gets the new shape directly).
4. Update the affected repo in `src/db/*.ts` (and its tests) to use the new column / table.
5. Add a test that runs the migration against a vN-1-shaped DB and verifies the post-state.

Things to keep in mind:

- `ALTER TABLE` in SQLite supports `ADD COLUMN` but not `ALTER COLUMN` cleanly. Renames or type changes need a copy-table-rename dance. Avoid them where possible.
- New columns should have a default or be nullable. Existing rows can't be back-filled with NOT NULL otherwise.
- FTS5 triggers reference real columns by name. If you rename `content` on `messages`, you need to rebuild the triggers.

The history so far:

| Version | What it added |
| --- | --- |
| 1 | Initial schema: projects, conversations, messages, settings, schema_meta. |
| 2 | personas, skills, project_entities; `persona_id` and `skill_id` on conversations. |
| 3 | FTS5 virtual table `messages_fts` and triggers; backfill from existing rows. |
| 4 | `model_id` on skills (per-skill model override). |
| 5 | `message_embeddings` table for dense-vector retrieval. |
| 6 | `reasoning_content` on messages — captures `<think>…</think>` text. |
| 7 | `tool_calls` on messages — captures the tool invocations made during an assistant turn. |

## The repos pattern

Each table has a `*.ts` file in `src/db/` exporting plain async functions:

- [conversations.ts](../src/db/conversations.ts): `createConversation`, `getConversation`, `listConversations`, `updateConversation`, `deleteConversation`, `touchConversation` (bumps `updated_at`).
- [messages.ts](../src/db/messages.ts): `appendMessage`, `listMessages`, `updateMessageStream`, `finishMessage`, `deleteMessage`, `clearMessagesForConversation`.
- [projects.ts](../src/db/projects.ts), [personas.ts](../src/db/personas.ts), [skills.ts](../src/db/skills.ts), [settings.ts](../src/db/settings.ts), [search.ts](../src/db/search.ts).
- [src/rag/storage/SqliteFactStore.ts](../src/rag/storage/SqliteFactStore.ts) — repo for `project_entities` (lives under the RAG module since it's the primary consumer).

There are no repository classes. SQL lives inline in the function body. The functions return plain TypeScript objects shaped to match the table.

Why functions:

- Type inference is cleaner without a class hierarchy.
- Functions are trivially mockable (`jest.fn()`) and tree-shakeable.
- Inline SQL is easy to grep for. Tools like [Better SQLite Studio](https://github.com/orgs/anthropics/) work directly against the DB without a generated query layer.

### Streaming writes

`updateMessageStream(id, content)` is called many times per second during generation — every time the chat hook flushes the buffer. The write is `UPDATE messages SET content = ? WHERE id = ?` — fast on a small row, but worth noting that we're hitting WAL mode for each flush. The flush throttles itself to ~30 fps so we don't drown SQLite.

`finishMessage(id, meta)` does the bulk of the column updates at completion: `finish_reason`, `token_count`, `model_id`, `reasoning_content`, `tool_calls`. We use `COALESCE(?, col)` so callers can omit fields they don't want to change.

### `tool_calls` JSON encoding

The `tool_calls` column is `TEXT` storing a JSON array. We could've made it a separate `tool_invocations` table joined by `message_id`, but the data is always read alongside the message and never queried independently. JSON in a column is the right choice for the data shape.

The shape:

```ts
type PersistedToolInvocation = {
  name: string;
  args: Record<string, unknown>;
  result: string;
  error?: string;
};
```

Decoded on read in `messages.ts:parseToolCalls()`. Stored as `null` when no calls were made; never stored as `[]`.

## Search

[src/db/search.ts](../src/db/search.ts) wraps FTS5 for the global Search screen. It joins `messages_fts` against `messages`, `conversations`, and `projects` to produce hits with breadcrumbs (`~/projectname/conversation-title`).

The query goes through a `sanitizeQuery` step that strips characters FTS5 treats as syntax (`"`, `*`, `:`, `(`, `)`) and wraps the result in quotes for phrase search. Without this, a user typing `"what's"` would error out on the unbalanced quote.

## Wipe

Settings → "Wipe all data" calls `wipeAll()` which:

1. Closes the DB.
2. Deletes the underlying SQLite file.
3. Re-runs `initDb()` (creates fresh schema + seeds built-ins).
4. Walks `models/` and deletes every `.gguf` file.

This is the user-facing "factory reset". It's destructive and irreversible (no recycle bin).

## Testing

Tests run against an in-memory SQLite DB via `__mocks__/expo-sqlite.ts`, which uses `better-sqlite3` under the hood for speed. Each test file gets a fresh DB.

Test pattern (typical):

```ts
beforeEach(async () => {
  await resetDb();
  await initDb();   // applies SCHEMA_SQL fresh, runs seeds
});

it('migrates v1 → v7 cleanly', async () => {
  await resetDb();
  await applyV1Schema();   // helper: just SCHEMA_SQL from version 1
  await initDb();          // detects v1, applies migrations 2-7
  // assertions about post-migration shape
});
```

Tests cover:

- Each migration applies cleanly to a vN-1-shaped DB.
- `seedBuiltins` is idempotent.
- Each repo's CRUD round-trips correctly.
- FTS sync triggers fire on insert/update/delete.
- Conversation deletion cascades to messages, message_embeddings.
- Project deletion cascades to project_entities and conversations.

## Privacy and durability

- The DB lives in the app's documents directory. iOS data protection encrypts it at rest as long as the device is locked.
- The DB is included in iCloud / Google backup by default. Users who need to suppress that can use the platform-specific exclude flags (we don't surface that in the UI yet — issue welcome).
- WAL mode is on. Crash recovery is automatic.

## File reference

- [src/db/db.ts](../src/db/db.ts) — connection, init, in-memory test DB.
- [src/db/schema.ts](../src/db/schema.ts) — `SCHEMA_VERSION`, `SCHEMA_SQL`, `MIGRATIONS`.
- [src/db/seeds.ts](../src/db/seeds.ts) — built-in personas + skills.
- [src/db/conversations.ts](../src/db/conversations.ts), [messages.ts](../src/db/messages.ts), [projects.ts](../src/db/projects.ts), [personas.ts](../src/db/personas.ts), [skills.ts](../src/db/skills.ts), [settings.ts](../src/db/settings.ts), [search.ts](../src/db/search.ts) — repos.
- [__mocks__/expo-sqlite.ts](../__mocks__/expo-sqlite.ts) — Jest mock backed by `better-sqlite3`.

## Related docs

- [Architecture](./architecture.md) — where the DB layer sits.
- [RAG](./rag.md) — how `message_embeddings`, `messages_fts`, and `project_entities` are used.
