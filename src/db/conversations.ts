import { randomUUID } from 'expo-crypto';
import { getDb } from './db';

export type Conversation = {
  id: string;
  project_id: string | null;
  title: string;
  system_prompt: string;
  created_at: number;
  updated_at: number;
};

export const createConversation = async (args: {
  title: string;
  project_id?: string | null;
  system_prompt?: string;
}): Promise<Conversation> => {
  const id = randomUUID();
  const now = Date.now();
  const conv: Conversation = {
    id,
    project_id: args.project_id ?? null,
    title: args.title,
    system_prompt: args.system_prompt ?? '',
    created_at: now,
    updated_at: now
  };
  await getDb().runAsync(
    'INSERT INTO conversations(id,project_id,title,system_prompt,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    conv.id,
    conv.project_id,
    conv.title,
    conv.system_prompt,
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
  patch: Partial<Pick<Conversation, 'title' | 'system_prompt' | 'project_id'>>
): Promise<void> => {
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const vals: (string | number | null)[] = [now];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    vals.push(patch.title);
  }
  if (patch.system_prompt !== undefined) {
    sets.push('system_prompt = ?');
    vals.push(patch.system_prompt);
  }
  if (patch.project_id !== undefined) {
    sets.push('project_id = ?');
    vals.push(patch.project_id);
  }
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
