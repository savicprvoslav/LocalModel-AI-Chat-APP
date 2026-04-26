import { initTestDb, resetDb } from '../db';
import {
  createPersona,
  listPersonas,
  getPersona,
  getDefaultPersona,
  updatePersona,
  setDefaultPersona,
  deletePersona
} from '../personas';

beforeEach(async () => {
  resetDb();
  await initTestDb();
});

describe('personas repo', () => {
  it('creates and lists', async () => {
    const a = await createPersona({ name: 'A', system_prompt: 'You are A' });
    const b = await createPersona({ name: 'B', system_prompt: 'You are B' });
    const list = await listPersonas();
    expect(list.length).toBe(2);
    expect(list.map((p) => p.name).sort()).toEqual(['A', 'B']);
    expect(list.find((p) => p.id === a.id)?.system_prompt).toBe('You are A');
    expect(list.find((p) => p.id === b.id)?.system_prompt).toBe('You are B');
  });

  it('exactly one default', async () => {
    const a = await createPersona({
      name: 'A',
      system_prompt: 'a',
      is_default: true
    });
    const b = await createPersona({ name: 'B', system_prompt: 'b' });
    expect((await getDefaultPersona())?.id).toBe(a.id);

    await setDefaultPersona(b.id);
    expect((await getDefaultPersona())?.id).toBe(b.id);
    const list = await listPersonas();
    const defaults = list.filter((p) => p.is_default === 1);
    expect(defaults.length).toBe(1);
    expect(defaults[0]?.id).toBe(b.id);
  });

  it('updates fields', async () => {
    const p = await createPersona({ name: 'old', system_prompt: 'x' });
    await updatePersona(p.id, {
      name: 'new',
      description: 'd',
      system_prompt: 'y',
      temperature: 0.3
    });
    const got = await getPersona(p.id);
    expect(got?.name).toBe('new');
    expect(got?.description).toBe('d');
    expect(got?.system_prompt).toBe('y');
    expect(got?.temperature).toBe(0.3);
  });

  it('refuses to delete built-in', async () => {
    const p = await createPersona({
      name: 'BI',
      system_prompt: 'x',
      is_builtin: true
    });
    await expect(deletePersona(p.id)).rejects.toThrow(/built-in/i);
  });

  it('refuses to delete default', async () => {
    const p = await createPersona({
      name: 'D',
      system_prompt: 'x',
      is_default: true
    });
    await expect(deletePersona(p.id)).rejects.toThrow(/default/i);
  });

  it('deletes a regular persona', async () => {
    const p = await createPersona({ name: 'temp', system_prompt: 'x' });
    await deletePersona(p.id);
    expect(await getPersona(p.id)).toBeNull();
  });
});
