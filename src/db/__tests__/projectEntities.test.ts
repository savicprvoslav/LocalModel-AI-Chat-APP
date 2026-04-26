import { initTestDb, resetDb } from '../db';
import { createProject, deleteProject } from '../projects';
import {
  createEntity,
  listEntities,
  updateEntity,
  deleteEntity
} from '../projectEntities';

beforeEach(async () => {
  resetDb();
  await initTestDb();
});

describe('projectEntities repo', () => {
  it('creates and lists per project', async () => {
    const a = await createProject({ name: 'Acme' });
    const b = await createProject({ name: 'Other' });
    await createEntity({ project_id: a.id, name: 'Tom', description: 'lead' });
    await createEntity({ project_id: a.id, name: 'Jess' });
    await createEntity({ project_id: b.id, name: 'X' });
    const aList = await listEntities(a.id);
    const bList = await listEntities(b.id);
    expect(aList.length).toBe(2);
    expect(bList.length).toBe(1);
    expect(aList.map((e) => e.name).sort()).toEqual(['Jess', 'Tom']);
  });

  it('updates fields', async () => {
    const p = await createProject({ name: 'P' });
    const e = await createEntity({ project_id: p.id, name: 'X' });
    await updateEntity(e.id, { name: 'Y', description: 'updated' });
    const list = await listEntities(p.id);
    expect(list[0]?.name).toBe('Y');
    expect(list[0]?.description).toBe('updated');
  });

  it('deletes entity', async () => {
    const p = await createProject({ name: 'P' });
    const e = await createEntity({ project_id: p.id, name: 'X' });
    await deleteEntity(e.id);
    expect((await listEntities(p.id)).length).toBe(0);
  });

  it('cascades when project is deleted', async () => {
    const p = await createProject({ name: 'P' });
    await createEntity({ project_id: p.id, name: 'X' });
    await createEntity({ project_id: p.id, name: 'Y' });
    await deleteProject(p.id);
    expect((await listEntities(p.id)).length).toBe(0);
  });
});
