import { randomUUID } from 'expo-crypto';
import { getDb } from './db';

export type Role = 'user' | 'assistant' | 'system';
export type FinishReason = 'stop' | 'cancelled' | 'error' | 'length';

/** A single tool invocation persisted on an assistant message. */
export type PersistedToolInvocation = {
  name: string;
  args: Record<string, unknown>;
  result: string;
  error?: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: Role;
  content: string;
  created_at: number;
  model_id: string | null;
  token_count: number | null;
  finish_reason: FinishReason | null;
  /**
   * Reasoning text emitted by the model inside `<think>…</think>`. Stripped
   * out of `content` so the chat reads cleanly; the UI may surface this
   * behind a disclosure ("Show thinking") on assistant messages. `null` for
   * non-assistant messages and for models that don't emit reasoning.
   */
  reasoning_content: string | null;
  /**
   * Tool invocations made during this assistant turn. Stored so a later
   * turn's `buildMessages` can hand the raw tool results back to the model
   * as `role:'tool'` messages — letting follow-up questions reference the
   * actual data without re-running the tool. `null` on user/system messages
   * and on assistant messages that didn't call any tools.
   */
  tool_calls: PersistedToolInvocation[] | null;
};

/** Internal: parse the raw `tool_calls` JSON column into typed shape. */
const parseToolCalls = (raw: unknown): PersistedToolInvocation[] | null => {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as PersistedToolInvocation[];
  } catch {
    // Malformed JSON — treat as no recorded calls rather than erroring out.
  }
  return null;
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
    finish_reason: null,
    reasoning_content: null,
    tool_calls: null
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

export const listMessages = async (conversationId: string): Promise<Message[]> => {
  // SQLite returns `tool_calls` as a string (the raw JSON we wrote). We
  // shape it into `PersistedToolInvocation[]` here so callers don't have
  // to know about the on-disk encoding.
  const rows = await getDb().getAllAsync<Message & { tool_calls: unknown }>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC',
    conversationId
  );
  return rows.map((r) => ({ ...r, tool_calls: parseToolCalls(r.tool_calls) }));
};

export const updateMessageStream = async (id: string, content: string): Promise<void> => {
  await getDb().runAsync('UPDATE messages SET content = ? WHERE id = ?', content, id);
};

export const finishMessage = async (
  id: string,
  meta: {
    finish_reason: FinishReason;
    token_count?: number;
    model_id?: string;
    reasoning_content?: string;
    tool_calls?: PersistedToolInvocation[];
  }
): Promise<void> => {
  const toolCallsJson =
    meta.tool_calls && meta.tool_calls.length > 0
      ? JSON.stringify(meta.tool_calls)
      : null;
  await getDb().runAsync(
    'UPDATE messages SET finish_reason = ?, token_count = ?, model_id = COALESCE(?, model_id), reasoning_content = COALESCE(?, reasoning_content), tool_calls = COALESCE(?, tool_calls) WHERE id = ?',
    meta.finish_reason,
    meta.token_count ?? null,
    meta.model_id ?? null,
    meta.reasoning_content ?? null,
    toolCallsJson,
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
