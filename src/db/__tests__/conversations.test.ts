import { initTestDb, resetDb } from '../db';
import { createProject, deleteProject } from '../projects';
import {
  createConversation,
  getConversation,
  updateConversation,
  listConversationsByProject,
  touchConversation
} from '../conversations';

beforeEach(async () => {
  resetDb();
  await initTestDb();
});

describe('conversations repo', () => {
  it('creates with and without project', async () => {
    const p = await createProject({ name: 'Acme' });
    const c1 = await createConversation({ title: 'First', project_id: p.id });
    const c2 = await createConversation({ title: 'Inbox-only' });
    expect(c1.project_id).toBe(p.id);
    expect(c2.project_id).toBeNull();
  });

  it('lists by project and inbox', async () => {
    const p = await createProject({ name: 'Acme' });
    await createConversation({ title: 'A', project_id: p.id });
    await createConversation({ title: 'B', project_id: p.id });
    await createConversation({ title: 'Solo' });
    const inProj = await listConversationsByProject(p.id);
    const inbox = await listConversationsByProject(null);
    expect(inProj.length).toBe(2);
    expect(inbox.length).toBe(1);
  });

  it('updates title and system prompt', async () => {
    const c = await createConversation({ title: 'old' });
    await updateConversation(c.id, { title: 'new', system_prompt: 'be terse' });
    const got = await getConversation(c.id);
    expect(got?.title).toBe('new');
    expect(got?.system_prompt).toBe('be terse');
  });

  it('cascades delete from project', async () => {
    const p = await createProject({ name: 'P' });
    const c = await createConversation({ title: 'C', project_id: p.id });
    await deleteProject(p.id);
    expect(await getConversation(c.id)).toBeNull();
  });

  it('touchConversation bumps updated_at', async () => {
    const c = await createConversation({ title: 'T' });
    await new Promise((r) => setTimeout(r, 2));
    await touchConversation(c.id);
    const got = await getConversation(c.id);
    expect((got?.updated_at ?? 0)).toBeGreaterThan(c.updated_at);
  });
});
