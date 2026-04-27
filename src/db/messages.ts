import { randomUUID } from 'expo-crypto';
import { getDb } from './db';

export type Role = 'user' | 'assistant' | 'system';
export type FinishReason = 'stop' | 'cancelled' | 'error' | 'length';

export type Message = {
  id: string;
  conversation_id: string;
  role: Role;
  content: string;
  created_at: number;
  model_id: string | null;
  token_count: number | null;
  finish_reason: FinishReason | null;
};

export const appendMessage = async (args: {
  conversation_id: string;
  role: Role;
  content: string;
  model_id?: string | null;
}): Promise<Message> => {
  const id = randomUUID();
  const now = Date.now();
  const msg: Message = {
    id,
    conversation_id: args.conversation_id,
    role: args.role,
    content: args.content,
    created_at: now,
    model_id: args.model_id ?? null,
    token_count: null,
    finish_reason: null
  };
  await getDb().runAsync(
    'INSERT INTO messages(id,conversation_id,role,content,created_at,model_id,token_count,finish_reason) VALUES (?,?,?,?,?,?,?,?)',
    msg.id,
    msg.conversation_id,
    msg.role,
    msg.content,
    msg.created_at,
    msg.model_id,
    msg.token_count,
    msg.finish_reason
  );
  return msg;
};

export const listMessages = async (conversationId: string): Promise<Message[]> =>
  getDb().getAllAsync<Message>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC',
    conversationId
  );

export const updateMessageStream = async (id: string, content: string): Promise<void> => {
  await getDb().runAsync('UPDATE messages SET content = ? WHERE id = ?', content, id);
};

export const finishMessage = async (
  id: string,
  meta: { finish_reason: FinishReason; token_count?: number; model_id?: string }
): Promise<void> => {
  await getDb().runAsync(
    'UPDATE messages SET finish_reason = ?, token_count = ?, model_id = COALESCE(?, model_id) WHERE id = ?',
    meta.finish_reason,
    meta.token_count ?? null,
    meta.model_id ?? null,
    id
  );
};

export const deleteMessage = async (id: string): Promise<void> => {
  await getDb().runAsync('DELETE FROM messages WHERE id = ?', id);
};

export const clearMessagesForConversation = async (
  conversationId: string
): Promise<void> => {
  await getDb().runAsync(
    'DELETE FROM messages WHERE conversation_id = ?',
    conversationId
  );
};
