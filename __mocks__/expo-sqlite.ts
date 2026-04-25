/**
 * Jest mock for expo-sqlite using better-sqlite3.
 *
 * Wraps the synchronous better-sqlite3 API in async methods that mirror the
 * subset of expo-sqlite that our repos use:
 *   openDatabaseAsync, execAsync, runAsync, getFirstAsync, getAllAsync
 */
import Database from 'better-sqlite3';

class MockSQLiteDatabase {
  private db: Database.Database;
  constructor(name: string) {
    this.db = new Database(name === ':memory:' ? ':memory:' : `:memory:`);
  }

  async execAsync(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async runAsync(sql: string, ...args: unknown[]): Promise<void> {
    const flat = args.flatMap((a) => (Array.isArray(a) ? a : [a]));
    this.db.prepare(sql).run(...(flat as unknown[]));
  }

  async getFirstAsync<T>(sql: string, ...args: unknown[]): Promise<T | null> {
    const flat = args.flatMap((a) => (Array.isArray(a) ? a : [a]));
    const row = this.db.prepare(sql).get(...(flat as unknown[]));
    return (row ?? null) as T | null;
  }

  async getAllAsync<T>(sql: string, ...args: unknown[]): Promise<T[]> {
    const flat = args.flatMap((a) => (Array.isArray(a) ? a : [a]));
    return this.db.prepare(sql).all(...(flat as unknown[])) as T[];
  }
}

export const openDatabaseAsync = async (name: string): Promise<MockSQLiteDatabase> =>
  new MockSQLiteDatabase(name);

export type SQLiteDatabase = MockSQLiteDatabase;
