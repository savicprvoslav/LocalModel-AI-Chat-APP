import { initTestDb, resetDb } from '@/db/db';
import { listSkills } from '@/db/skills';
import { importSkillFromMarkdown } from '../importSkill';

beforeEach(async () => {
  resetDb();
  await initTestDb();
});

describe('importSkillFromMarkdown', () => {
  it('creates a skill from a text-only SKILL.md', async () => {
    const md = [
      '---',
      'name: kitchen-adventure',
      'description: A kitchen-themed adventure.',
      '---',
      '',
      '# Instructions',
      '',
      'Be the dungeon master.'
    ].join('\n');

    const r = await importSkillFromMarkdown(md);

    expect(r.skill.name).toBe('Kitchen Adventure');
    expect(r.skill.description).toBe('A kitchen-themed adventure.');
    expect(r.skill.system_prompt).toContain('Be the dungeon master.');
    expect(r.skill.is_builtin).toBe(0);
    expect(r.skill.category).toBe('imported');
    expect(r.warning).toBeNull();

    const all = await listSkills();
    expect(all.some((s) => s.id === r.skill.id)).toBe(true);
  });

  it('flags JS skills with a warning but still imports the body', async () => {
    const md = [
      '---',
      'name: qr-code',
      'description: Generates a QR code.',
      '---',
      '',
      'You MUST use the `run_js` tool.'
    ].join('\n');

    const r = await importSkillFromMarkdown(md);
    expect(r.parsed.kind).toBe('js');
    expect(r.warning).toMatch(/run_js/);
    expect(r.skill.system_prompt).toContain('run_js');
  });

  it('flags native skills with a warning', async () => {
    const md = [
      '---',
      'name: send-email',
      'description: Send an email.',
      '---',
      '',
      'Call the `run_intent` tool.'
    ].join('\n');

    const r = await importSkillFromMarkdown(md);
    expect(r.parsed.kind).toBe('native');
    expect(r.warning).toMatch(/run_intent/);
  });

  it('disambiguates names on collision', async () => {
    const md = [
      '---',
      'name: same-name',
      'description: First copy.',
      '---',
      '',
      'first body'
    ].join('\n');

    const a = await importSkillFromMarkdown(md);
    const b = await importSkillFromMarkdown(md);

    expect(a.skill.name).toBe('Same Name');
    expect(b.skill.name).toBe('Same Name (2)');
  });

  it('falls back to description when the body is empty', async () => {
    const md = ['---', 'name: empty-body', 'description: Just a tagline.', '---'].join(
      '\n'
    );
    const r = await importSkillFromMarkdown(md);
    expect(r.skill.system_prompt).toBe('Just a tagline.');
  });

  it('propagates parse errors', async () => {
    await expect(importSkillFromMarkdown('no frontmatter here')).rejects.toThrow(
      /frontmatter/i
    );
  });
});
