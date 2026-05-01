export const SCHEMA_VERSION = 6;

/**
 * Initial schema (v1). Used for `:memory:` test DBs.
 * Production migrations apply incrementally from any older version.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  persona_id TEXT REFERENCES personas(id) ON DELETE SET NULL,
  skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_project ON conversations(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  model_id TEXT,
  token_count INTEGER,
  finish_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  temperature REAL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  emoji TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  starter_text TEXT NOT NULL DEFAULT '',
  placeholder_text TEXT NOT NULL DEFAULT '',
  default_persona_id TEXT REFERENCES personas(id) ON DELETE SET NULL,
  model_id TEXT,
  temperature REAL,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS project_entities (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pe_project ON project_entities(project_id);

-- Per-message dense vectors for hybrid retrieval.
-- Vectors are JSON-encoded number arrays; we compute cosine similarity in JS.
-- For personal-scale corpora (hundreds of messages, low thousands), this is
-- fast enough. To scale up, swap to sqlite-vec (requires op-sqlite).
CREATE TABLE IF NOT EXISTS message_embeddings (
  message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  vector TEXT NOT NULL,
  dim INTEGER NOT NULL,
  embedder TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- FTS5 virtual table for searching message content.
-- Synced via triggers below; rebuilt on reinstall.
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- Photos / images attached to a message. Files live on disk under
-- documentDirectory/attachments/<message_id>/<filename>; this table
-- stores the metadata + URI. Cascades on message delete.
CREATE TABLE IF NOT EXISTS message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image')),
  uri TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER,
  source TEXT NOT NULL CHECK (source IN ('camera', 'library')),
  caption TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_att_msg ON message_attachments(message_id, created_at);
`;

/**
 * Incremental migrations applied in order.
 * Each migration takes the DB from version N-1 to N.
 *
 * Tests use SCHEMA_SQL directly (in-memory DBs); production uses these.
 */
export const MIGRATIONS: Record<number, string[]> = {
  2: [
    `CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      temperature REAL,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      emoji TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      starter_text TEXT NOT NULL DEFAULT '',
      placeholder_text TEXT NOT NULL DEFAULT '',
      default_persona_id TEXT REFERENCES personas(id) ON DELETE SET NULL,
      temperature REAL,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS project_entities (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_pe_project ON project_entities(project_id)`,
    `ALTER TABLE conversations ADD COLUMN persona_id TEXT`,
    `ALTER TABLE conversations ADD COLUMN skill_id TEXT`
  ],
  3: [
    `CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      content='messages',
      content_rowid='rowid',
      tokenize='porter unicode61'
    )`,
    `CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
    END`,
    `CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
    END`,
    `CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
      INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
    END`,
    // Backfill the FTS index from any pre-existing messages.
    `INSERT INTO messages_fts(rowid, content) SELECT rowid, content FROM messages WHERE rowid NOT IN (SELECT rowid FROM messages_fts)`
  ],
  4: [
    // Per-skill model override. Falls back to active_model_id when null.
    `ALTER TABLE skills ADD COLUMN model_id TEXT`
  ],
  5: [
    `CREATE TABLE IF NOT EXISTS message_embeddings (
      message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
      vector TEXT NOT NULL,
      dim INTEGER NOT NULL,
      embedder TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`
  ],
  6: [
    `CREATE TABLE IF NOT EXISTS message_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('image')),
      uri TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      size_bytes INTEGER,
      source TEXT NOT NULL CHECK (source IN ('camera', 'library')),
      caption TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_msg_att_msg ON message_attachments(message_id, created_at)`
  ]
};
