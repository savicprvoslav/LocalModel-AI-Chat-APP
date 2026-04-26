import { randomUUID } from 'expo-crypto';
import { getDb } from './db';

export type Conversation = {
  id: string;
  project_id: string | null;
  title: string;
  system_prompt: string;
  persona_id: string | null;
  skill_id: string | null;
  created_at: number;
  updated_at: number;
};

export const createConversation = async (args: {
  title: string;
  project_id?: string | null;
  system_prompt?: string;
  persona_id?: string | null;
  skill_id?: string | null;
}): Promise<Conversation> => {
  const id = randomUUID();
  const now = Date.now();
  const conv: Conversation = {
    id,
    project_id: args.project_id ?? null,
    title: args.title,
    system_prompt: args.system_prompt ?? '',
    persona_id: args.persona_id ?? null,
    skill_id: args.skill_id ?? null,
    created_at: now,
    updated_at: now
  };
  await getDb().runAsync(
    'INSERT INTO conversations(id,project_id,title,system_prompt,persona_id,skill_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    conv.id,
    conv.project_id,
    conv.title,
    conv.system_prompt,
    conv.persona_id,
    conv.skill_id,
    conv.created_at,
    conv.updated_at
  );
  return conv;
};

export const listConversations = async (): Promise<Conversation[]> =>
  getDb().getAllAsync<Conversation>(
    'SELECT * FROM conversations ORDER BY updated_at DESC'
  );

export const listConversationsByProject = async (
  projectId: string | null
): Promise<Conversation[]> =>
  projectId === null
    ? getDb().getAllAsync<Conversation>(
        'SELECT * FROM conversations WHERE project_id IS NULL ORDER BY updated_at DESC'
      )
    : getDb().getAllAsync<Conversation>(
        'SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC',
        projectId
      );

export const getConversation = async (id: string): Promise<Conversation | null> => {
  const row = await getDb().getFirstAsync<Conversation>(
    'SELECT * FROM conversations WHERE id = ?',
    id
  );
  return row ?? null;
};

export const updateConversation = async (
  id: string,
  patch: Partial<
    Pick<Conversation, 'title' | 'system_prompt' | 'project_id' | 'persona_id' | 'skill_id'>
  >
): Promise<void> => {
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const vals: (string | number | null)[] = [now];
  const setField = (key: string, value: string | null | undefined) => {
    if (value === undefined) return;
    sets.push(`${key} = ?`);
    vals.push(value);
  };
  setField('title', patch.title);
  setField('system_prompt', patch.system_prompt);
  setField('project_id', patch.project_id);
  setField('persona_id', patch.persona_id);
  setField('skill_id', patch.skill_id);
  vals.push(id);
  await getDb().runAsync(
    `UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`,
    ...vals
  );
};

export const deleteConversation = async (id: string): Promise<void> => {
  await getDb().runAsync('DELETE FROM conversations WHERE id = ?', id);
};

export const touchConversation = async (id: string): Promise<void> => {
  await getDb().runAsync(
    'UPDATE conversations SET updated_at = ? WHERE id = ?',
    Date.now(),
    id
  );
};
