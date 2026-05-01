import { createSkill, listSkills, Skill } from '@/db/skills';
import { ParsedSkill, parseSkillMd } from './parseSkillMd';

export type ImportResult = {
  skill: Skill;
  parsed: ParsedSkill;
  /** Set when the imported skill calls `run_js` or `run_intent`, which we don't execute. */
  warning: string | null;
};

const KIND_WARNING: Record<ParsedSkill['kind'], string | null> = {
  text: null,
  js: 'This skill expects a `run_js` tool that runs JavaScript in a webview. Local Chat does not execute scripts — only the prompt body was imported, so the skill will read its instructions but cannot call out to JS.',
  native:
    'This skill expects a `run_intent` tool for native actions like sending email or SMS. Local Chat does not execute intents — only the prompt body was imported.'
};

export const importSkillFromMarkdown = async (raw: string): Promise<ImportResult> => {
  const parsed = parseSkillMd(raw);

  const displayName = humanizeName(parsed.name);
  const finalName = await ensureUniqueName(displayName);

  const systemPrompt = parsed.body || parsed.description;

  const skill = await createSkill({
    name: finalName,
    description: parsed.description,
    emoji: '📥',
    category: 'imported',
    system_prompt: systemPrompt,
    placeholder_text: 'What do you want help with?',
    is_builtin: false,
    sort_order: 999
  });

  return { skill, parsed, warning: KIND_WARNING[parsed.kind] };
};

const humanizeName = (kebab: string): string =>
  kebab
    .split('-')
    .filter(Boolean)
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(' ') || kebab;

const ensureUniqueName = async (base: string): Promise<string> => {
  const taken = new Set((await listSkills()).map((s) => s.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})`;
};
