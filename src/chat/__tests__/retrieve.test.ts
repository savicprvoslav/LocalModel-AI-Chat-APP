import { initTestDb, resetDb } from '@/db/db';
import { createConversation } from '@/db/conversations';
import { createProject } from '@/db/projects';
import { appendMessage } from '@/db/messages';
import { upsertEmbedding } from '@/db/embeddings';
import { hashEmbed } from '../vectors';
import { retrieveRelevant } from '../retrieve';

const seedMessage = async (
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<string> => {
  const m = await appendMessage({ conversation_id: conversationId, role, content });
  await upsertEmbedding({
    message_id: m.id,
    vector: hashEmbed(content),
    embedder: 'hash-fnv-256-v1'
  });
  return m.id;
};

beforeEach(async () => {
  resetDb();
  await initTestDb();
});

describe('retrieveRelevant', () => {
  it('returns nothing for queries below the min length', async () => {
    const c = await createConversation({ title: 'T' });
    await seedMessage(c.id, 'user', 'Tom worried about the Q4 timeline');
    const hits = await retrieveRelevant('hi');
    expect(hits).toEqual([]);
  });

  it('finds relevant past messages by keyword match', async () => {
    const a = await createConversation({ title: 'last week' });
    await seedMessage(a.id, 'user', 'Tom is worried about the Q4 timeline');
    await seedMessage(a.id, 'assistant', 'We should ask Tom for a status update.');

    const b = await createConversation({ title: 'today' });
    const hits = await retrieveRelevant('Tom Q4 timeline', {
      excludeConversationId: b.id
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.conversation_title).toBe('last week');
  });

  it('excludes the current conversation', async () => {
    const here = await createConversation({ title: 'here' });
    await seedMessage(here.id, 'user', 'Tom Tom Tom — same conversation');
    const elsewhere = await createConversation({ title: 'elsewhere' });
    await seedMessage(elsewhere.id, 'user', 'Tom in another room');

    const hits = await retrieveRelevant('Tom', { excludeConversationId: here.id });
    for (const h of hits) {
      expect(h.conversation_id).not.toBe(here.id);
    }
  });

  it('respects projectScope = specific project id', async () => {
    const p1 = await createProject({ name: 'Acme' });
    const p2 = await createProject({ name: 'Personal' });
    const c1 = await createConversation({ title: 'A', project_id: p1.id });
    const c2 = await createConversation({ title: 'P', project_id: p2.id });
    await seedMessage(c1.id, 'user', 'Acme migration deadline crisis');
    await seedMessage(c2.id, 'user', 'Acme is a fictional company anyway');

    const inAcme = await retrieveRelevant('Acme', { projectScope: p1.id });
    expect(inAcme.every((h) => h.project_id === p1.id)).toBe(true);
    expect(inAcme.length).toBeGreaterThan(0);
  });

  it('respects projectScope = null for inbox-only', async () => {
    const p = await createProject({ name: 'P' });
    const inProject = await createConversation({ title: 'inP', project_id: p.id });
    const inbox = await createConversation({ title: 'inboxOnly' });
    await seedMessage(inProject.id, 'user', 'rare-marker-xyz');
    await seedMessage(inbox.id, 'user', 'rare-marker-xyz');

    const hits = await retrieveRelevant('rare-marker-xyz', { projectScope: null });
    expect(hits.every((h) => h.project_id === null)).toBe(true);
    expect(hits.length).toBe(1);
  });

  it('returns at most `limit` snippets', async () => {
    const c = await createConversation({ title: 'history' });
    for (let i = 0; i < 12; i++) {
      await seedMessage(c.id, 'user', `Acme report number ${i} mentioning Tom`);
    }
    const other = await createConversation({ title: 'now' });
    const hits = await retrieveRelevant('Acme Tom report', {
      excludeConversationId: other.id,
      limit: 3
    });
    expect(hits.length).toBeLessThanOrEqual(3);
  });

  it('ranks higher-similarity messages first', async () => {
    const c = await createConversation({ title: 'old' });
    await seedMessage(c.id, 'user', 'Tom is worried about Q4 timeline and headcount');
    await seedMessage(c.id, 'user', 'random unrelated text about kitchen sinks');

    const other = await createConversation({ title: 'now' });
    const hits = await retrieveRelevant('Tom Q4 timeline headcount', {
      excludeConversationId: other.id,
      limit: 5,
      minScore: 0
    });
    expect(hits[0]?.excerpt.toLowerCase()).toContain('tom');
  });
});
