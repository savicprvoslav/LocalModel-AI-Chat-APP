import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

let _db: SQLite.SQLiteDatabase | null = null;

export const initDb = async (name = 'chat.db'): Promise<SQLite.SQLiteDatabase> => {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(name);
  await _db.execAsync('PRAGMA foreign_keys = ON;');
  await _db.execAsync(SCHEMA_SQL);
  await _db.runAsync(
    'INSERT OR REPLACE INTO schema_meta(key,value) VALUES (?, ?)',
    'version',
    String(SCHEMA_VERSION)
  );
  return _db;
};

export const getDb = (): SQLite.SQLiteDatabase => {
  if (!_db) throw new Error('db not initialized');
  return _db;
};

/** Test-only: open an in-memory DB. */
export const initTestDb = async (): Promise<SQLite.SQLiteDatabase> => {
  _db = await SQLite.openDatabaseAsync(':memory:');
  await _db.execAsync('PRAGMA foreign_keys = ON;');
  await _db.execAsync(SCHEMA_SQL);
  return _db;
};

export const resetDb = (): void => {
  _db = null;
};
