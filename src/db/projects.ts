import { randomUUID } from 'expo-crypto';
import { getDb } from './db';

export type Project = {
  id: string;
  name: string;
  notes: string;
  created_at: number;
  updated_at: number;
};

export const createProject = async (args: {
  name: string;
  notes?: string;
}): Promise<Project> => {
  const id = randomUUID();
  const now = Date.now();
  const proj: Project = {
    id,
    name: args.name,
    notes: args.notes ?? '',
    created_at: now,
    updated_at: now
  };
  await getDb().runAsync(
    'INSERT INTO projects(id,name,notes,created_at,updated_at) VALUES (?,?,?,?,?)',
    proj.id,
    proj.name,
    proj.notes,
    proj.created_at,
    proj.updated_at
  );
  return proj;
};

export const listProjects = async (): Promise<Project[]> =>
  getDb().getAllAsync<Project>('SELECT * FROM projects ORDER BY updated_at DESC');

export const getProject = async (id: string): Promise<Project | null> => {
  const row = await getDb().getFirstAsync<Project>('SELECT * FROM projects WHERE id = ?', id);
  return row ?? null;
};

export const updateProject = async (
  id: string,
  patch: Partial<Pick<Project, 'name' | 'notes'>>
): Promise<void> => {
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const vals: (string | number | null)[] = [now];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    vals.push(patch.name);
  }
  if (patch.notes !== undefined) {
    sets.push('notes = ?');
    vals.push(patch.notes);
  }
  vals.push(id);
  await getDb().runAsync(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, ...vals);
};

export const deleteProject = async (id: string): Promise<void> => {
  await getDb().runAsync('DELETE FROM projects WHERE id = ?', id);
};
