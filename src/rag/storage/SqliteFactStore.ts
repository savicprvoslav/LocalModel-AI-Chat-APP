import type { Fact, SqliteAdapter } from '../types';
import type { FactStore } from './types';
import { uuid } from './uuid';

type Row = {
  id: string;
  project_id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
};

const fromRow = (r: Row): Fact => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  description: r.description,
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

export class SqliteFactStore implements FactStore {
  constructor(private readonly db: SqliteAdapter) {}

  async create(args: {
    projectId: string;
    name: string;
    description?: string;
  }): Promise<Fact> {
    const id = uuid();
    const now = Date.now();
    const description = args.description ?? '';
    await this.db.runAsync(
      'INSERT INTO project_entities(id,project_id,name,description,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      id,
      args.projectId,
      args.name,
      description,
      now,
      now
    );
    return {
      id,
      projectId: args.projectId,
      name: args.name,
      description,
      createdAt: now,
      updatedAt: now
    };
  }

  async list(projectId: string): Promise<Fact[]> {
    const rows = await this.db.getAllAsync<Row>(
      'SELECT * FROM project_entities WHERE project_id = ? ORDER BY created_at ASC',
      projectId
    );
    return rows.map(fromRow);
  }

  async update(
    factId: string,
    patch: Partial<Pick<Fact, 'name' | 'description'>>
  ): Promise<void> {
    const now = Date.now();
    const sets: string[] = ['updated_at = ?'];
    const vals: (string | number | null)[] = [now];
    if (patch.name !== undefined) {
      sets.push('name = ?');
      vals.push(patch.name);
    }
    if (patch.description !== undefined) {
      sets.push('description = ?');
      vals.push(patch.description);
    }
    vals.push(factId);
    await this.db.runAsync(
      `UPDATE project_entities SET ${sets.join(', ')} WHERE id = ?`,
      ...vals
    );
  }

  async delete(factId: string): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM project_entities WHERE id = ?',
      factId
    );
  }
}
