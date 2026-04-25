import { initTestDb, resetDb } from '../db';
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject
} from '../projects';

beforeEach(async () => {
  resetDb();
  await initTestDb();
});

describe('projects repo', () => {
  it('creates and lists', async () => {
    const a = await createProject({ name: 'Acme', notes: 'Tom is backend lead' });
    const b = await createProject({ name: 'Personal' });
    const list = await listProjects();
    expect(list.map((p) => p.name).sort()).toEqual(['Acme', 'Personal']);
    expect(list.find((p) => p.id === a.id)?.notes).toBe('Tom is backend lead');
    expect(list.find((p) => p.id === b.id)?.notes).toBe('');
  });

  it('updates name and notes', async () => {
    const p = await createProject({ name: 'X' });
    await new Promise((r) => setTimeout(r, 2));
    await updateProject(p.id, { name: 'Y', notes: 'updated' });
    const got = await getProject(p.id);
    expect(got?.name).toBe('Y');
    expect(got?.notes).toBe('updated');
    expect((got?.updated_at ?? 0)).toBeGreaterThanOrEqual(p.updated_at);
  });

  it('deletes', async () => {
    const p = await createProject({ name: 'X' });
    await deleteProject(p.id);
    expect(await getProject(p.id)).toBeNull();
  });
});
