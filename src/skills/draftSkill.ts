/**
 * AI-assisted skill drafter. Given a one-line description from the user,
 * asks the active model to return a structured draft (name, description,
 * system_prompt, suggested temperature, suggested persona). The model's
 * output is JSON; this module is tolerant of fenced code blocks, leading
 * prose, and trailing commentary — it extracts the first balanced
 * `{...}` and validates required fields.
 *
 * Returns a draft shape, NOT a persisted skill — the caller decides
 * whether to commit it via `createSkill`.
 */
import { ChatEngine, GenerationOptions } from '@/engine';
import { Persona } from '@/db/personas';

export type SkillDraft = {
  name: string;
  description: string;
  system_prompt: string;
  temperature: number;
  /** ID of a persona from the list passed in, or null if the model picked nothing valid. */
  default_persona_id: string | null;
  placeholder_text: string;
  starter_text: string;
};

export type DraftOptions = {
  description: string;
  personas: Persona[];
  signal?: AbortSignal;
  /** Override generation params; sensible defaults pick low temp for structured output. */
  generation?: Partial<GenerationOptions>;
};

const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 512;

export const buildDraftPrompt = (description: string, personas: Persona[]): string => {
  const personaLines = personas
    .map((p) => `- "${p.id}": ${p.name} — ${p.description || '(no description)'}`)
    .join('\n');

  return [
    '<|system|>',
    'You design "skills" for a local chat app. A skill is a saved prompt template the user invokes with a slash command.',
    'Given the user\'s description, output a JSON object — and ONLY a JSON object — with these fields:',
    '  - name: short Title Case name, 2-4 words.',
    '  - description: one sentence, under 90 characters.',
    '  - system_prompt: the actual instructions the LLM will follow when this skill runs. 2-6 sentences. Concrete, imperative, no preamble.',
    '  - temperature: number between 0 and 1. Lower for analytical/coding tasks, higher for creative.',
    '  - default_persona_id: pick the best fit from the list below by ID, or null if none fits.',
    '  - placeholder_text: 3-7 word hint shown in the empty composer.',
    '  - starter_text: usually "" — only set when a fixed scaffold helps (e.g., "Translate to: ").',
    '',
    'Available personas:',
    personaLines || '(none)',
    '',
    'Output rules: respond with the JSON object, nothing else. No code fences. No commentary. No "Here is...".',
    '',
    '<|user|>',
    description.trim(),
    '',
    '<|assistant|>'
  ].join('\n');
};

export const draftSkill = async (
  engine: ChatEngine,
  opts: DraftOptions
): Promise<SkillDraft> => {
  if (!engine.isReady()) {
    throw new Error('No model loaded. Open a chat once to load the active model first.');
  }
  if (!opts.description.trim()) {
    throw new Error('Describe what the skill should do.');
  }

  const prompt = buildDraftPrompt(opts.description, opts.personas);
  let buffer = '';

  await new Promise<void>((resolve, reject) => {
    void engine.streamCompletion(
      { messages: [{ role: 'user', content: prompt }] },
      {
        temperature: opts.generation?.temperature ?? DEFAULT_TEMPERATURE,
        maxTokens: opts.generation?.maxTokens ?? DEFAULT_MAX_TOKENS,
        signal: opts.signal
      },
      {
        onToken: (t) => {
          buffer += t;
        },
        onDone: () => resolve(),
        onError: (e) => reject(e)
      }
    );
  });

  return parseDraftResponse(buffer, opts.personas);
};

export const parseDraftResponse = (raw: string, personas: Persona[]): SkillDraft => {
  const json = extractJsonObject(raw);
  if (!json) {
    throw new Error('Model did not return a JSON object. Try again or refine the description.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(
      `Model returned malformed JSON: ${e instanceof Error ? e.message : 'unknown'}`
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Model output was not a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;

  const name = strField(obj, 'name');
  const description = strField(obj, 'description');
  const systemPrompt = strField(obj, 'system_prompt');
  if (!name) throw new Error('Model output is missing a name.');
  if (!description) throw new Error('Model output is missing a description.');
  if (!systemPrompt) throw new Error('Model output is missing a system_prompt.');

  let temperature = numField(obj, 'temperature') ?? DEFAULT_TEMPERATURE;
  if (!Number.isFinite(temperature)) temperature = DEFAULT_TEMPERATURE;
  temperature = Math.max(0, Math.min(2, temperature));

  const rawPersonaId = strField(obj, 'default_persona_id');
  const personaIds = new Set(personas.map((p) => p.id));
  const default_persona_id = rawPersonaId && personaIds.has(rawPersonaId) ? rawPersonaId : null;

  return {
    name: name.slice(0, 80),
    description: description.slice(0, 200),
    system_prompt: systemPrompt,
    temperature,
    default_persona_id,
    placeholder_text: strField(obj, 'placeholder_text') ?? 'What do you want help with?',
    starter_text: strField(obj, 'starter_text') ?? ''
  };
};

const strField = (obj: Record<string, unknown>, key: string): string | undefined => {
  const v = obj[key];
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
};

const numField = (obj: Record<string, unknown>, key: string): number | undefined => {
  const v = obj[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

/**
 * Pull the first balanced `{...}` JSON object out of arbitrary text.
 * Handles ```json fences, leading "Here is the JSON:" prose, and
 * trailing commentary. Skips braces inside string literals so a `{`
 * in a value doesn't confuse the brace counter.
 */
const extractJsonObject = (raw: string): string | null => {
  const stripped = raw
    .replace(/^[\s\S]*?```(?:json)?\s*/i, (m) => (m.includes('```') ? '' : m))
    .replace(/```[\s\S]*$/, '');

  const start = stripped.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inStr) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }
  return null;
};
