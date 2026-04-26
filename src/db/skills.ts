import { randomUUID } from 'expo-crypto';
import { getDb } from './db';

export type Skill = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: string;
  system_prompt: string;
  starter_text: string;
  placeholder_text: string;
  default_persona_id: string | null;
  temperature: number | null;
  is_builtin: number; // 1 | 0
  sort_order: number;
  created_at: number;
  updated_at: number;
};

export const createSkill = async (args: {
  id?: string;
  name: string;
  description?: string;
  emoji?: string;
  category?: string;
  system_prompt: string;
  starter_text?: string;
  placeholder_text?: string;
  default_persona_id?: string | null;
  temperature?: number | null;
  is_builtin?: boolean;
  sort_order?: number;
}): Promise<Skill> => {
  const id = args.id ?? randomUUID();
  const now = Date.now();
  const s: Skill = {
    id,
    name: args.name,
    description: args.description ?? '',
    emoji: args.emoji ?? '',
    category: args.category ?? '',
    system_prompt: args.system_prompt,
    starter_text: args.starter_text ?? '',
    placeholder_text: args.placeholder_text ?? '',
    default_persona_id: args.default_persona_id ?? null,
    temperature: args.temperature ?? null,
    is_builtin: args.is_builtin ? 1 : 0,
    sort_order: args.sort_order ?? 0,
    created_at: now,
    updated_at: now
  };
  await getDb().runAsync(
    'INSERT INTO skills(id,name,description,emoji,category,system_prompt,starter_text,placeholder_text,default_persona_id,temperature,is_builtin,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    s.id,
    s.name,
    s.description,
    s.emoji,
    s.category,
    s.system_prompt,
    s.starter_text,
    s.placeholder_text,
    s.default_persona_id,
    s.temperature,
    s.is_builtin,
    s.sort_order,
    s.created_at,
    s.updated_at
  );
  return s;
};

export const listSkills = async (): Promise<Skill[]> =>
  getDb().getAllAsync<Skill>(
    'SELECT * FROM skills ORDER BY sort_order ASC, name ASC'
  );

export const getSkill = async (id: string): Promise<Skill | null> => {
  const row = await getDb().getFirstAsync<Skill>('SELECT * FROM skills WHERE id = ?', id);
  return row ?? null;
};

export const updateSkill = async (
  id: string,
  patch: Partial<
    Pick<
      Skill,
      | 'name'
      | 'description'
      | 'emoji'
      | 'category'
      | 'system_prompt'
      | 'starter_text'
      | 'placeholder_text'
      | 'default_persona_id'
      | 'temperature'
      | 'sort_order'
    >
  >
): Promise<void> => {
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const vals: (string | number | null)[] = [now];
  const setField = (key: string, value: string | number | null | undefined) => {
    if (value === undefined) return;
    sets.push(`${key} = ?`);
    vals.push(value);
  };
  setField('name', patch.name);
  setField('description', patch.description);
  setField('emoji', patch.emoji);
  setField('category', patch.category);
  setField('system_prompt', patch.system_prompt);
  setField('starter_text', patch.starter_text);
  setField('placeholder_text', patch.placeholder_text);
  setField('default_persona_id', patch.default_persona_id);
  setField('temperature', patch.temperature);
  setField('sort_order', patch.sort_order);
  vals.push(id);
  await getDb().runAsync(`UPDATE skills SET ${sets.join(', ')} WHERE id = ?`, ...vals);
};

export const deleteSkill = async (id: string): Promise<void> => {
  const s = await getSkill(id);
  if (!s) return;
  if (s.is_builtin === 1) {
    throw new Error('cannot delete a built-in skill (you can edit it instead)');
  }
  await getDb().runAsync('DELETE FROM skills WHERE id = ?', id);
};

export const duplicateSkill = async (id: string): Promise<Skill> => {
  const s = await getSkill(id);
  if (!s) throw new Error('skill not found');
  return createSkill({
    name: `${s.name} (copy)`,
    description: s.description,
    emoji: s.emoji,
    category: s.category,
    system_prompt: s.system_prompt,
    starter_text: s.starter_text,
    placeholder_text: s.placeholder_text,
    default_persona_id: s.default_persona_id,
    temperature: s.temperature,
    is_builtin: false,
    sort_order: s.sort_order + 1
  });
};
