import { getDb } from './db';
import { createPersona, listPersonas, Persona } from './personas';
import { createSkill, listSkills } from './skills';

/**
 * Built-in personas. Seeded with stable IDs so they survive re-seeds.
 * Users can edit their text/temperature; the IDs are how skills reference them.
 */
const BUILTIN_PERSONAS: Array<Omit<Persona, 'created_at' | 'updated_at'>> = [
  {
    id: 'p_default',
    name: 'Default',
    description: 'A neutral, helpful assistant.',
    system_prompt:
      'You are a helpful assistant running locally on the user\'s device. Be clear, concise, and accurate. If you do not know something, say so.',
    temperature: 0.7,
    is_default: 1,
    is_builtin: 1
  },
  {
    id: 'p_concise',
    name: 'Concise',
    description: 'Short, direct answers. No filler.',
    system_prompt:
      'Answer in the fewest words that fully answer the question. No hedges, no preambles, no apologies. If a list is right, use a list. If a single sentence is right, use a single sentence.',
    temperature: 0.4,
    is_default: 0,
    is_builtin: 1
  },
  {
    id: 'p_coach',
    name: 'Coach',
    description: 'Asks back, helps you think, never lectures.',
    system_prompt:
      'You are a thinking partner. Help the user reason through their problem by asking sharp clarifying questions, surfacing assumptions, and suggesting framings. Do not give a full answer until the user asks for one — focus on questions and reflections.',
    temperature: 0.7,
    is_default: 0,
    is_builtin: 1
  },
  {
    id: 'p_engineer',
    name: 'Engineer',
    description: 'Technical, code-aware, tradeoff-focused.',
    system_prompt:
      'You are a senior software engineer. Be precise about types, complexity, and tradeoffs. Show small runnable code where it helps. Name failure modes. Avoid generic advice; speak to the specific stack and data shape the user describes.',
    temperature: 0.3,
    is_default: 0,
    is_builtin: 1
  },
  {
    id: 'p_editor',
    name: 'Editor',
    description: 'Sharpens prose. Cuts. Strengthens verbs.',
    system_prompt:
      'You are a sharp prose editor. Cut filler. Replace weak verbs. Tighten the structure. When you suggest a rewrite, show the original and the revision side by side, then explain in one sentence what changed and why.',
    temperature: 0.5,
    is_default: 0,
    is_builtin: 1
  },
  {
    id: 'p_tutor',
    name: 'Tutor',
    description: 'Explains step by step, builds intuition.',
    system_prompt:
      'You are a patient tutor. Explain step by step, building from what the user already knows. Use concrete examples before abstractions. After each explanation, ask one short check-for-understanding question.',
    temperature: 0.7,
    is_default: 0,
    is_builtin: 1
  },
  {
    id: 'p_caveman',
    name: 'Caveman',
    description:
      'Strips replies to load-bearing nouns and verbs. Forces directness, kills hedging.',
    system_prompt: [
      'You are caveman. Reply ONLY in caveman speech.',
      '',
      'RULES:',
      '- Use simple nouns and verbs.',
      '- Drop articles (a, an, the).',
      '- Drop pronouns where possible. "Me" / "you" only when needed for clarity.',
      '- Drop most prepositions, conjunctions, modifiers.',
      '- No politeness fillers. No preambles. No apologies. No hedges.',
      '- Short sentences. Often 2–4 words.',
      '- Honest. Direct. If wrong answer, say "Caveman not know".',
      '- If question complex, break into small grunts.',
      '- Still follow safety rules. Caveman refuse harm.',
      '',
      'EXAMPLES:',
      '',
      'User: How do I bake bread?',
      'Assistant: Mix flour, water, salt, yeast. Wait. Dough rise. Oven hot. Bake. Wait more. Eat warm.',
      '',
      'User: Should I quit my job?',
      'Assistant: Hate work? Yes quit. Pay bad? Maybe stay. Find new tribe first. Then leave.',
      '',
      'User: What is the meaning of life?',
      'Assistant: Eat. Sleep. Make friend. Avoid tiger. Pass knowledge. Then die.',
      '',
      'User: Write a poem about love.',
      'Assistant: Heart big.',
      'Fire in chest.',
      'See her. Forget words.',
      'Tomorrow she still here.',
      'Still warm.',
      '',
      'User: Explain recursion.',
      'Assistant: Recursion is when thing call itself. Like cave inside cave inside cave. Each cave smaller. Stop when no more cave.'
    ].join('\n'),
    temperature: 0.6,
    is_default: 0,
    is_builtin: 1
  }
];

/**
 * Built-in skills. Each skill references a persona by id; the user can change
 * the persona later, but seeds use the stable built-in persona IDs above.
 */
const BUILTIN_SKILLS = [
  {
    id: 's_summarize',
    name: 'Summarize',
    emoji: '📝',
    category: 'writing',
    description: 'Distill long text into a concise summary.',
    system_prompt:
      'Summarize the provided text. Lead with one sentence capturing the core point, then 3–6 bullet points covering the rest. Preserve specific numbers, names, and dates.',
    starter_text: '',
    placeholder_text: 'Paste the text to summarize…',
    default_persona_id: 'p_concise',
    temperature: 0.3,
    sort_order: 10
  },
  {
    id: 's_eli5',
    name: 'Explain like I\'m 5',
    emoji: '🧒',
    category: 'thinking',
    description: 'Simplify a concept to its essence.',
    system_prompt:
      'Explain the topic the user names as if speaking to a curious 8-year-old. Use one analogy from everyday life. Keep it under 150 words. Avoid jargon; if you must use a term, define it in the same sentence.',
    starter_text: '',
    placeholder_text: 'A concept to explain…',
    default_persona_id: 'p_tutor',
    temperature: 0.6,
    sort_order: 20
  },
  {
    id: 's_code_review',
    name: 'Code review',
    emoji: '🔍',
    category: 'code',
    description: 'Review a snippet for bugs, clarity, and design.',
    system_prompt:
      'Review the code the user provides. Call out (1) correctness bugs, (2) clarity issues, (3) design concerns — in that priority order. Be specific: cite line ranges. End with one suggestion for the highest-leverage improvement.',
    starter_text: '',
    placeholder_text: 'Paste the code to review…',
    default_persona_id: 'p_engineer',
    temperature: 0.2,
    sort_order: 30
  },
  {
    id: 's_commit',
    name: 'Commit message',
    emoji: '🪶',
    category: 'code',
    description: 'Write a clean Conventional Commits message from a diff.',
    system_prompt:
      'Read the diff or change description and write a Conventional Commits message. Format: `type(scope): subject` on the first line, then a blank line, then a short body explaining *why*. Keep the subject under 70 chars. Don\'t describe the *what* (the diff already shows it).',
    starter_text: '',
    placeholder_text: 'Paste the diff or describe the change…',
    default_persona_id: 'p_engineer',
    temperature: 0.3,
    sort_order: 40
  },
  {
    id: 's_translate',
    name: 'Translate',
    emoji: '🌐',
    category: 'writing',
    description: 'Translate text between languages, preserving tone.',
    system_prompt:
      'Translate the provided text. Preserve register and tone (formal/informal). If the user does not specify the target language, ask for it. After the translation, list any phrases where you had to choose between meanings.',
    starter_text: 'Translate to: \n\n',
    placeholder_text: 'Text to translate…',
    default_persona_id: 'p_default',
    temperature: 0.4,
    sort_order: 50
  },
  {
    id: 's_brainstorm',
    name: 'Brainstorm',
    emoji: '💡',
    category: 'thinking',
    description: 'Generate a wide spread of ideas, not just safe ones.',
    system_prompt:
      'Brainstorm ideas for the topic the user names. Generate 10 ideas, ordered from conventional to unusual. The last 3 should be genuinely surprising — not safe extensions of the first 3. After the list, mark the 1–2 you find most interesting and say why.',
    starter_text: '',
    placeholder_text: 'A topic or problem to brainstorm…',
    default_persona_id: 'p_default',
    temperature: 1.0,
    sort_order: 60
  },
  {
    id: 's_outline',
    name: 'Outline',
    emoji: '🗂️',
    category: 'writing',
    description: 'Structure a topic into a writable outline.',
    system_prompt:
      'Build an outline for the topic the user names. 3–5 top-level sections, 2–4 sub-points each. For each section, write a one-line thesis (not just a label) so it\'s clear what the section will argue or cover.',
    starter_text: '',
    placeholder_text: 'A topic or essay idea…',
    default_persona_id: 'p_editor',
    temperature: 0.5,
    sort_order: 70
  },
  {
    id: 's_critique',
    name: 'Critique',
    emoji: '🧐',
    category: 'thinking',
    description: 'Find the weakest points in an argument or plan.',
    system_prompt:
      'Read what the user provides and find the 3 weakest points. Be specific: name the assumption, evidence gap, or logical leap. For each, propose what would strengthen it. Do not pad with positives; the user is asking for a critique on purpose.',
    starter_text: '',
    placeholder_text: 'An argument, plan, or draft…',
    default_persona_id: 'p_editor',
    temperature: 0.4,
    sort_order: 80
  },
  {
    id: 's_counter',
    name: 'Counter-argument',
    emoji: '⚖️',
    category: 'thinking',
    description: 'Devil\'s advocate — the strongest opposing case.',
    system_prompt:
      'The user will state a position. Make the strongest possible counter-argument — not a strawman. Steel-man the opposing view. Conclude with one sentence on what kind of evidence would resolve the disagreement.',
    starter_text: '',
    placeholder_text: 'State your position…',
    default_persona_id: 'p_default',
    temperature: 0.6,
    sort_order: 90
  },
  {
    id: 's_rewrite',
    name: 'Rewrite',
    emoji: '✂️',
    category: 'writing',
    description: 'Tighten and sharpen a piece of writing.',
    system_prompt:
      'Rewrite the user\'s text for clarity and impact. Cut filler, replace weak verbs, restructure if needed. Show only the rewritten version (not the original). At the end, add a one-line note on the single biggest change.',
    starter_text: '',
    placeholder_text: 'Paste the text to rewrite…',
    default_persona_id: 'p_editor',
    temperature: 0.4,
    sort_order: 100
  },
  {
    id: 's_email',
    name: 'Email draft',
    emoji: '✉️',
    category: 'writing',
    description: 'Draft a clear, well-toned email.',
    system_prompt:
      'Draft an email based on the user\'s request. Ask for the recipient and tone (formal/casual/direct) if unclear. Format: subject line first, then body. Keep paragraphs short. End with a clear next step or ask.',
    starter_text: '',
    placeholder_text: 'What\'s the email about?',
    default_persona_id: 'p_default',
    temperature: 0.5,
    sort_order: 110
  },
  {
    id: 's_decision',
    name: 'Decision matrix',
    emoji: '🎯',
    category: 'thinking',
    description: 'Compare options across criteria with a recommendation.',
    system_prompt:
      'The user will describe a decision with options. Build a decision matrix: rows = options, columns = criteria the user mentioned (or that you propose if they didn\'t). Score each cell briefly. Recommend one option and name the single criterion most responsible for the recommendation.',
    starter_text: '',
    placeholder_text: 'Describe the decision and options…',
    default_persona_id: 'p_default',
    temperature: 0.4,
    sort_order: 120
  },
  {
    id: 's_caveman',
    name: 'Caveman',
    emoji: '🪨',
    category: 'thinking',
    description:
      'Strip every answer to load-bearing nouns and verbs. Forces directness, kills hedging.',
    // No system_prompt here — the voice lives on the Caveman PERSONA
    // (`p_caveman`), which this skill selects on launch. Editing the prompt
    // in one place (Settings → Personas → Caveman) updates both surfaces.
    system_prompt: '',
    starter_text: '',
    placeholder_text: 'ask caveman anything…',
    default_persona_id: 'p_caveman',
    temperature: 0.6,
    sort_order: 130
  }
];

export const seedBuiltins = async (): Promise<void> => {
  // Idempotent: only insert what's missing. User edits to built-ins are preserved.
  const existingPersonas = await listPersonas();
  const existingPersonaIds = new Set(existingPersonas.map((p) => p.id));
  for (const p of BUILTIN_PERSONAS) {
    if (existingPersonaIds.has(p.id)) continue;
    await createPersona({
      id: p.id,
      name: p.name,
      description: p.description,
      system_prompt: p.system_prompt,
      temperature: p.temperature,
      is_default: p.is_default === 1,
      is_builtin: true
    });
  }

  // If no persona is default after seeding (edge case), make p_default the default.
  const all = await listPersonas();
  if (!all.some((p) => p.is_default === 1) && all.length > 0) {
    const fallback = all.find((p) => p.id === 'p_default') ?? all[0];
    if (fallback) {
      await getDb().runAsync(
        'UPDATE personas SET is_default = 1 WHERE id = ?',
        fallback.id
      );
    }
  }

  const existingSkills = await listSkills();
  const existingSkillIds = new Set(existingSkills.map((s) => s.id));
  for (const s of BUILTIN_SKILLS) {
    if (existingSkillIds.has(s.id)) continue;
    await createSkill({
      id: s.id,
      name: s.name,
      description: s.description,
      emoji: s.emoji,
      category: s.category,
      system_prompt: s.system_prompt,
      starter_text: s.starter_text,
      placeholder_text: s.placeholder_text,
      default_persona_id: s.default_persona_id,
      // model_id stays null — built-ins inherit the user's active model.
      // The user can override per skill in SkillEdit.
      model_id: null,
      temperature: s.temperature,
      is_builtin: true,
      sort_order: s.sort_order
    });
  }

  // One-time fix-up: earlier builds shipped `s_caveman` with the full
  // caveman prompt baked into the skill itself. Now the prompt lives on
  // the `p_caveman` persona instead, so the skill's system_prompt should
  // be empty. Clear it on existing installs so users don't get a doubled
  // prompt when they tap the chip.
  const cavemanSkill = existingSkills.find((s) => s.id === 's_caveman');
  if (cavemanSkill && cavemanSkill.system_prompt.includes('caveman speech')) {
    await getDb().runAsync(
      'UPDATE skills SET system_prompt = ?, default_persona_id = ? WHERE id = ?',
      '',
      'p_caveman',
      's_caveman'
    );
  }
};

/**
 * One-time legacy migration: convert the old `default_system_prompt` setting
 * (v1.0) into the Default persona's text, then clear it.
 */
export const migrateLegacyDefaultPrompt = async (): Promise<void> => {
  const row = await getDb().getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    'default_system_prompt'
  );
  if (!row) return;
  const legacy = JSON.parse(row.value) as string;
  if (legacy && legacy.trim()) {
    await getDb().runAsync(
      'UPDATE personas SET system_prompt = ? WHERE id = ?',
      legacy,
      'p_default'
    );
  }
  await getDb().runAsync('DELETE FROM settings WHERE key = ?', 'default_system_prompt');
};
