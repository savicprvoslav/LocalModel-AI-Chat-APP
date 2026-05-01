import { createProject, deleteProject } from '@/db/projects';
import { setupRagForTest } from './testHelpers';

describe('Rag fact storage (SqliteFactStore)', () => {
  it('creates and lists per project', async () => {
    const rag = await setupRagForTest();
    const a = await createProject({ name: 'Acme' });
    const b = await createProject({ name: 'Other' });
    await rag.saveFact({ projectId: a.id, name: 'Tom', description: 'lead' });
    await rag.saveFact({ projectId: a.id, name: 'Jess' });
    await rag.saveFact({ projectId: b.id, name: 'X' });
    const aList = await rag.listFacts(a.id);
    const bList = await rag.listFacts(b.id);
    expect(aList.length).toBe(2);
    expect(bList.length).toBe(1);
    expect(aList.map((e) => e.name).sort()).toEqual(['Jess', 'Tom']);
  });

  it('updates fields', async () => {
    const rag = await setupRagForTest();
    const p = await createProject({ name: 'P' });
    const e = await rag.saveFact({ projectId: p.id, name: 'X' });
    await rag.updateFact(e.id, { name: 'Y', description: 'updated' });
    const list = await rag.listFacts(p.id);
    expect(list[0]?.name).toBe('Y');
    expect(list[0]?.description).toBe('updated');
  });

  it('deletes fact', async () => {
    const rag = await setupRagForTest();
    const p = await createProject({ name: 'P' });
    const e = await rag.saveFact({ projectId: p.id, name: 'X' });
    await rag.deleteFact(e.id);
    expect((await rag.listFacts(p.id)).length).toBe(0);
  });

  it('cascades when project is deleted', async () => {
    const rag = await setupRagForTest();
    const p = await createProject({ name: 'P' });
    await rag.saveFact({ projectId: p.id, name: 'X' });
    await rag.saveFact({ projectId: p.id, name: 'Y' });
    await deleteProject(p.id);
    expect((await rag.listFacts(p.id)).length).toBe(0);
  });
});
