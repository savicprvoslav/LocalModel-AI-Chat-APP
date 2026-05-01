import { initTestDb, resetDb } from '../db';
import { createConversation } from '../conversations';
import {
  appendMessage,
  listMessages,
  updateMessageStream,
  finishMessage,
  deleteMessage
} from '../messages';

beforeEach(async () => {
  resetDb();
  await initTestDb();
});

describe('messages repo', () => {
  it('appends and lists in created_at order', async () => {
    const c = await createConversation({ title: 'T' });
    const m1 = await appendMessage({ conversation_id: c.id, role: 'user', content: 'hi' });
    const m2 = await appendMessage({
      conversation_id: c.id,
      role: 'assistant',
      content: ''
    });
    const list = await listMessages(c.id);
    expect(list.map((m) => m.id)).toEqual([m1.id, m2.id]);
  });

  it('updates streaming content', async () => {
    const c = await createConversation({ title: 'T' });
    const m = await appendMessage({
      conversation_id: c.id,
      role: 'assistant',
      content: ''
    });
    await updateMessageStream(m.id, 'hello');
    await updateMessageStream(m.id, 'hello world');
    const list = await listMessages(c.id);
    expect(list[0]?.content).toBe('hello world');
  });

  it('finishes a message with metadata', async () => {
    const c = await createConversation({ title: 'T' });
    const m = await appendMessage({
      conversation_id: c.id,
      role: 'assistant',
      content: 'partial'
    });
    await finishMessage(m.id, {
      finish_reason: 'cancelled',
      token_count: 7,
      model_id: 'qwen3-4b-q4'
    });
    const list = await listMessages(c.id);
    expect(list[0]?.finish_reason).toBe('cancelled');
    expect(list[0]?.token_count).toBe(7);
    expect(list[0]?.model_id).toBe('qwen3-4b-q4');
  });

  it('deletes a message', async () => {
    const c = await createConversation({ title: 'T' });
    const m = await appendMessage({ conversation_id: c.id, role: 'user', content: 'x' });
    await deleteMessage(m.id);
    expect((await listMessages(c.id)).length).toBe(0);
  });

  it('cascades from conversation delete', async () => {
    const c = await createConversation({ title: 'T' });
    await appendMessage({ conversation_id: c.id, role: 'user', content: 'a' });
    await appendMessage({ conversation_id: c.id, role: 'assistant', content: 'b' });
    const { deleteConversation } = await import('../conversations');
    await deleteConversation(c.id);
    expect((await listMessages(c.id)).length).toBe(0);
  });
});
