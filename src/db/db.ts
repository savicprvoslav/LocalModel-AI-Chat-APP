import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, SCHEMA_VERSION, MIGRATIONS } from './schema';
import { seedBuiltins, migrateLegacyDefaultPrompt } from './seeds';

let _db: SQLite.SQLiteDatabase | null = null;

const getStoredVersion = async (db: SQLite.SQLiteDatabase): Promise<number> => {
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM schema_meta WHERE key = ?',
      'version'
    );
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
};

const setStoredVersion = async (
  db: SQLite.SQLiteDatabase,
  version: number
): Promise<void> => {
  await db.runAsync(
    'INSERT OR REPLACE INTO schema_meta(key, value) VALUES (?, ?)',
    'version',
    String(version)
  );
};

const runMigrations = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  const current = await getStoredVersion(db);
  for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
    const steps = MIGRATIONS[v];
    if (!steps) continue;
    for (const sql of steps) {
      try {
        await db.execAsync(sql);
      } catch (e) {
        // ALTER TABLE ADD COLUMN can fail if the column already exists.
        // Other errors should propagate.
        const msg = e instanceof Error ? e.message : String(e);
        if (!/duplicate column name/i.test(msg)) throw e;
      }
    }
    await setStoredVersion(db, v);
  }
};

/**
 * Belt-and-suspenders: every launch, verify the conversations table has the
 * v2 columns. If a previous migration partially failed (or the version row
 * lied), this self-heals without losing data.
 */
const ensureV2ConversationColumns = async (
  db: SQLite.SQLiteDatabase
): Promise<void> => {
  const cols = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(conversations)'
  );
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('persona_id')) {
    await db.execAsync('ALTER TABLE conversations ADD COLUMN persona_id TEXT');
  }
  if (!names.has('skill_id')) {
    await db.execAsync('ALTER TABLE conversations ADD COLUMN skill_id TEXT');
  }
};

export const initDb = async (name = 'chat.db'): Promise<SQLite.SQLiteDatabase> => {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(name);
  await _db.execAsync('PRAGMA foreign_keys = ON;');
  // For new installs: SCHEMA_SQL creates everything from scratch.
  // For existing installs (from before schema_meta): version=0, migrations run additively.
  await _db.execAsync(SCHEMA_SQL);
  // Ensure schema_meta exists then bring up to current version via migrations.
  await runMigrations(_db);
  // Self-heal: even if migrations don't run (stored version already at target,
  // or partial run on a prior launch), make sure required columns exist.
  await ensureV2ConversationColumns(_db);
  await setStoredVersion(_db, SCHEMA_VERSION);
  // Seed built-ins (idempotent) and migrate legacy default_system_prompt setting.
  await seedBuiltins();
  await migrateLegacyDefaultPrompt();
  return _db;
};

export const getDb = (): SQLite.SQLiteDatabase => {
  if (!_db) throw new Error('db not initialized');
  return _db;
};

/** Test-only: open an in-memory DB. Built-ins are NOT seeded so tests can isolate. */
export const initTestDb = async (): Promise<SQLite.SQLiteDatabase> => {
  _db = await SQLite.openDatabaseAsync(':memory:');
  await _db.execAsync('PRAGMA foreign_keys = ON;');
  await _db.execAsync(SCHEMA_SQL);
  await setStoredVersion(_db, SCHEMA_VERSION);
  return _db;
};

/** Test-only: like initTestDb but with built-ins seeded. */
export const initTestDbSeeded = async (): Promise<SQLite.SQLiteDatabase> => {
  await initTestDb();
  await seedBuiltins();
  return _db!;
};

export const resetDb = (): void => {
  _db = null;
};
