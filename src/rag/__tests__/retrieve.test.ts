import { createConversation } from '@/db/conversations';
import { createProject } from '@/db/projects';
import { appendMessage } from '@/db/messages';
import { setupRagForTest } from './testHelpers';
import type { Rag } from '../types';

const seedMessage = async (
  rag: Rag,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<string> => {
  const m = await appendMessage({ conversation_id: conversationId, role, content });
  await rag.indexMessage({ messageId: m.id, content });
  return m.id;
};

describe('Rag.retrieve (hybrid FTS + hash-vector)', () => {
  it('returns nothing for queries below the min length', async () => {
    const rag = await setupRagForTest();
    const c = await createConversation({ title: 'T' });
    await seedMessage(rag, c.id, 'user', 'Tom worried about the Q4 timeline');
    const hits = await rag.retrieve('hi');
    expect(hits).toEqual([]);
  });

  it('finds relevant past messages by keyword match', async () => {
    const rag = await setupRagForTest();
    const a = await createConversation({ title: 'last week' });
    await seedMessage(rag, a.id, 'user', 'Tom is worried about the Q4 timeline');
    await seedMessage(rag, a.id, 'assistant', 'We should ask Tom for a status update.');
    const b = await createConversation({ title: 'today' });
    const hits = await rag.retrieve('Tom Q4 timeline', {
      excludeConversationId: b.id
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.conversationTitle).toBe('last week');
  });

  it('excludes the current conversation', async () => {
    const rag = await setupRagForTest();
    const here = await createConversation({ title: 'here' });
    await seedMessage(rag, here.id, 'user', 'Tom Tom Tom — same conversation');
    const elsewhere = await createConversation({ title: 'elsewhere' });
    await seedMessage(rag, elsewhere.id, 'user', 'Tom in another room');
    const hits = await rag.retrieve('Tom', { excludeConversationId: here.id });
    for (const h of hits) {
      expect(h.conversationId).not.toBe(here.id);
    }
  });

  it('respects projectScope = specific project id', async () => {
    const rag = await setupRagForTest();
    const p1 = await createProject({ name: 'Acme' });
    const p2 = await createProject({ name: 'Personal' });
    const c1 = await createConversation({ title: 'A', project_id: p1.id });
    const c2 = await createConversation({ title: 'P', project_id: p2.id });
    await seedMessage(rag, c1.id, 'user', 'Acme migration deadline crisis');
    await seedMessage(rag, c2.id, 'user', 'Acme is a fictional company anyway');
    const inAcme = await rag.retrieve('Acme', { projectScope: p1.id });
    expect(inAcme.every((h) => h.projectId === p1.id)).toBe(true);
    expect(inAcme.length).toBeGreaterThan(0);
  });

  it('respects projectScope = null for inbox-only', async () => {
    const rag = await setupRagForTest();
    const p = await createProject({ name: 'P' });
    const inProject = await createConversation({ title: 'inP', project_id: p.id });
    const inbox = await createConversation({ title: 'inboxOnly' });
    await seedMessage(rag, inProject.id, 'user', 'rare-marker-xyz');
    await seedMessage(rag, inbox.id, 'user', 'rare-marker-xyz');
    const hits = await rag.retrieve('rare-marker-xyz', { projectScope: null });
    expect(hits.every((h) => h.projectId === null)).toBe(true);
    expect(hits.length).toBe(1);
  });

  it('returns at most `limit` snippets', async () => {
    const rag = await setupRagForTest();
    const c = await createConversation({ title: 'history' });
    for (let i = 0; i < 12; i++) {
      await seedMessage(rag, c.id, 'user', `Acme report number ${i} mentioning Tom`);
    }
    const other = await createConversation({ title: 'now' });
    const hits = await rag.retrieve('Acme Tom report', {
      excludeConversationId: other.id,
      limit: 3
    });
    expect(hits.length).toBeLessThanOrEqual(3);
  });

  it('ranks higher-similarity messages first', async () => {
    const rag = await setupRagForTest();
    const c = await createConversation({ title: 'old' });
    await seedMessage(rag, c.id, 'user', 'Tom is worried about Q4 timeline and headcount');
    await seedMessage(rag, c.id, 'user', 'random unrelated text about kitchen sinks');
    const other = await createConversation({ title: 'now' });
    const hits = await rag.retrieve('Tom Q4 timeline headcount', {
      excludeConversationId: other.id,
      limit: 5,
      minScore: 0
    });
    expect(hits[0]?.excerpt.toLowerCase()).toContain('tom');
  });
});
