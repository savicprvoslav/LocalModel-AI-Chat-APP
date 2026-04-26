import { randomUUID } from 'expo-crypto';
import { getDb } from './db';

export type ProjectEntity = {
  id: string;
  project_id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
};

export const createEntity = async (args: {
  project_id: string;
  name: string;
  description?: string;
}): Promise<ProjectEntity> => {
  const id = randomUUID();
  const now = Date.now();
  const e: ProjectEntity = {
    id,
    project_id: args.project_id,
    name: args.name,
    description: args.description ?? '',
    created_at: now,
    updated_at: now
  };
  await getDb().runAsync(
    'INSERT INTO project_entities(id,project_id,name,description,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    e.id,
    e.project_id,
    e.name,
    e.description,
    e.created_at,
    e.updated_at
  );
  return e;
};

export const listEntities = async (projectId: string): Promise<ProjectEntity[]> =>
  getDb().getAllAsync<ProjectEntity>(
    'SELECT * FROM project_entities WHERE project_id = ? ORDER BY created_at ASC',
    projectId
  );

export const updateEntity = async (
  id: string,
  patch: Partial<Pick<ProjectEntity, 'name' | 'description'>>
): Promise<void> => {
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
  vals.push(id);
  await getDb().runAsync(
    `UPDATE project_entities SET ${sets.join(', ')} WHERE id = ?`,
    ...vals
  );
};

export const deleteEntity = async (id: string): Promise<void> => {
  await getDb().runAsync('DELETE FROM project_entities WHERE id = ?', id);
};
