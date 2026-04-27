import { initTestDb, resetDb } from '../db';
import { createConversation } from '../conversations';
import { createProject } from '../projects';
import { appendMessage } from '../messages';
import { searchMessages } from '../search';

beforeEach(async () => {
  resetDb();
  await initTestDb();
});

describe('search', () => {
  it('finds a message by exact word', async () => {
    const c = await createConversation({ title: 'T' });
    await appendMessage({
      conversation_id: c.id,
      role: 'user',
      content: 'I want to learn about postgres replication.'
    });
    const hits = await searchMessages('postgres');
    expect(hits.length).toBe(1);
    expect(hits[0]?.snippet).toContain('postgres');
  });

  it('supports prefix match on last token', async () => {
    const c = await createConversation({ title: 'T' });
    await appendMessage({
      conversation_id: c.id,
      role: 'assistant',
      content: 'Replication strategies for high-availability databases.'
    });
    const hits = await searchMessages('replic');
    expect(hits.length).toBe(1);
  });

  it('returns empty for empty query', async () => {
    const c = await createConversation({ title: 'T' });
    await appendMessage({ conversation_id: c.id, role: 'user', content: 'hello' });
    expect(await searchMessages('   ')).toEqual([]);
  });

  it('returns project info when conversation belongs to a project', async () => {
    const p = await createProject({ name: 'Acme' });
    const c = await createConversation({ title: 'Plan', project_id: p.id });
    await appendMessage({
      conversation_id: c.id,
      role: 'user',
      content: 'A unique-marker-token-zzz here.'
    });
    const hits = await searchMessages('unique-marker-token-zzz');
    expect(hits.length).toBe(1);
    expect(hits[0]?.project_id).toBe(p.id);
    expect(hits[0]?.project_name).toBe('Acme');
    expect(hits[0]?.conversation_title).toBe('Plan');
  });

  it('FTS index updates when a message is edited', async () => {
    const c = await createConversation({ title: 'T' });
    const m = await appendMessage({
      conversation_id: c.id,
      role: 'assistant',
      content: 'first version'
    });
    expect((await searchMessages('first')).length).toBe(1);
    expect((await searchMessages('replaced')).length).toBe(0);

    const { updateMessageStream } = await import('../messages');
    await updateMessageStream(m.id, 'replaced version');
    expect((await searchMessages('replaced')).length).toBe(1);
    expect((await searchMessages('first')).length).toBe(0);
  });

  it('FTS index removes entries when a message is deleted', async () => {
    const c = await createConversation({ title: 'T' });
    const m = await appendMessage({
      conversation_id: c.id,
      role: 'user',
      content: 'gone-marker'
    });
    expect((await searchMessages('gone-marker')).length).toBe(1);
    const { deleteMessage } = await import('../messages');
    await deleteMessage(m.id);
    expect((await searchMessages('gone-marker')).length).toBe(0);
  });

  it('handles symbols safely in user input', async () => {
    const c = await createConversation({ title: 'T' });
    await appendMessage({
      conversation_id: c.id,
      role: 'user',
      content: 'How do I read a CSV?'
    });
    // Quotes / apostrophes / parens should not blow up FTS5 parser.
    await expect(searchMessages(`"CSV" how's (works)`)).resolves.toBeTruthy();
  });
});
