import { initTestDb, resetDb } from '../db';
import {
  createSkill,
  listSkills,
  getSkill,
  updateSkill,
  deleteSkill,
  duplicateSkill
} from '../skills';

beforeEach(async () => {
  resetDb();
  await initTestDb();
});

describe('skills repo', () => {
  it('creates and lists by sort_order', async () => {
    await createSkill({ name: 'Z', system_prompt: 'z', sort_order: 100 });
    await createSkill({ name: 'A', system_prompt: 'a', sort_order: 1 });
    const list = await listSkills();
    expect(list.map((s) => s.name)).toEqual(['A', 'Z']);
  });

  it('updates fields', async () => {
    const s = await createSkill({ name: 'old', system_prompt: 'x' });
    await updateSkill(s.id, {
      name: 'new',
      emoji: '✨',
      starter_text: 'paste below',
      temperature: 0.5
    });
    const got = await getSkill(s.id);
    expect(got?.name).toBe('new');
    expect(got?.emoji).toBe('✨');
    expect(got?.starter_text).toBe('paste below');
    expect(got?.temperature).toBe(0.5);
  });

  it('refuses to delete a built-in skill', async () => {
    const s = await createSkill({ name: 'BI', system_prompt: 'x', is_builtin: true });
    await expect(deleteSkill(s.id)).rejects.toThrow(/built-in/i);
  });

  it('deletes a custom skill', async () => {
    const s = await createSkill({ name: 'custom', system_prompt: 'x' });
    await deleteSkill(s.id);
    expect(await getSkill(s.id)).toBeNull();
  });

  it('duplicates a built-in as a custom skill', async () => {
    const s = await createSkill({
      name: 'Original',
      system_prompt: 'x',
      emoji: '🌟',
      is_builtin: true
    });
    const copy = await duplicateSkill(s.id);
    expect(copy.id).not.toBe(s.id);
    expect(copy.name).toBe('Original (copy)');
    expect(copy.emoji).toBe('🌟');
    expect(copy.is_builtin).toBe(0);
  });
});
