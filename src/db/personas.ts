import { randomUUID } from 'expo-crypto';
import { getDb } from './db';

export type Persona = {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  temperature: number | null;
  is_default: number; // 1 | 0
  is_builtin: number; // 1 | 0
  created_at: number;
  updated_at: number;
};

export const createPersona = async (args: {
  id?: string;
  name: string;
  description?: string;
  system_prompt: string;
  temperature?: number | null;
  is_default?: boolean;
  is_builtin?: boolean;
}): Promise<Persona> => {
  const id = args.id ?? randomUUID();
  const now = Date.now();
  const p: Persona = {
    id,
    name: args.name,
    description: args.description ?? '',
    system_prompt: args.system_prompt,
    temperature: args.temperature ?? null,
    is_default: args.is_default ? 1 : 0,
    is_builtin: args.is_builtin ? 1 : 0,
    created_at: now,
    updated_at: now
  };
  await getDb().runAsync(
    'INSERT INTO personas(id,name,description,system_prompt,temperature,is_default,is_builtin,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    p.id,
    p.name,
    p.description,
    p.system_prompt,
    p.temperature,
    p.is_default,
    p.is_builtin,
    p.created_at,
    p.updated_at
  );
  return p;
};

export const listPersonas = async (): Promise<Persona[]> =>
  getDb().getAllAsync<Persona>(
    'SELECT * FROM personas ORDER BY is_default DESC, is_builtin DESC, name ASC'
  );

export const getPersona = async (id: string): Promise<Persona | null> => {
  const row = await getDb().getFirstAsync<Persona>('SELECT * FROM personas WHERE id = ?', id);
  return row ?? null;
};

export const getDefaultPersona = async (): Promise<Persona | null> => {
  const row = await getDb().getFirstAsync<Persona>(
    'SELECT * FROM personas WHERE is_default = 1 LIMIT 1'
  );
  return row ?? null;
};

export const updatePersona = async (
  id: string,
  patch: Partial<Pick<Persona, 'name' | 'description' | 'system_prompt' | 'temperature'>>
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
  if (patch.system_prompt !== undefined) {
    sets.push('system_prompt = ?');
    vals.push(patch.system_prompt);
  }
  if (patch.temperature !== undefined) {
    sets.push('temperature = ?');
    vals.push(patch.temperature);
  }
  vals.push(id);
  await getDb().runAsync(
    `UPDATE personas SET ${sets.join(', ')} WHERE id = ?`,
    ...vals
  );
};

export const setDefaultPersona = async (id: string): Promise<void> => {
  await getDb().runAsync('UPDATE personas SET is_default = 0 WHERE is_default = 1');
  await getDb().runAsync('UPDATE personas SET is_default = 1 WHERE id = ?', id);
};

export const deletePersona = async (id: string): Promise<void> => {
  // Cannot delete a built-in or the default
  const p = await getPersona(id);
  if (!p) return;
  if (p.is_builtin === 1) throw new Error('cannot delete a built-in persona');
  if (p.is_default === 1) throw new Error('cannot delete the default persona');
  await getDb().runAsync('DELETE FROM personas WHERE id = ?', id);
};
