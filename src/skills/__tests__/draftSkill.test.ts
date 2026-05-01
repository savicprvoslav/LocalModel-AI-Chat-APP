import { createFakeEngine } from '@/engine';
import { Persona } from '@/db/personas';
import { draftSkill, parseDraftResponse, buildDraftPrompt } from '../draftSkill';

const personas: Persona[] = [
  {
    id: 'p_engineer',
    name: 'Engineer',
    description: 'Technical, code-aware.',
    system_prompt: '',
    temperature: 0.3,
    is_default: 0,
    is_builtin: 1,
    created_at: 0,
    updated_at: 0
  },
  {
    id: 'p_default',
    name: 'Default',
    description: 'Helpful assistant.',
    system_prompt: '',
    temperature: 0.7,
    is_default: 1,
    is_builtin: 1,
    created_at: 0,
    updated_at: 0
  }
];

const validJson = JSON.stringify({
  name: 'Pitch Critic',
  description: 'Find the weakest claims in a pitch deck.',
  system_prompt: 'Read the pitch the user provides. Identify the 3 weakest claims by evidence and assumption. For each, state what would strengthen it.',
  temperature: 0.4,
  default_persona_id: 'p_engineer',
  placeholder_text: 'Paste the pitch deck text…',
  starter_text: ''
});

describe('parseDraftResponse', () => {
  it('parses a clean JSON response', () => {
    const d = parseDraftResponse(validJson, personas);
    expect(d.name).toBe('Pitch Critic');
    expect(d.system_prompt).toMatch(/3 weakest claims/);
    expect(d.temperature).toBe(0.4);
    expect(d.default_persona_id).toBe('p_engineer');
  });

  it('strips ```json fences', () => {
    const wrapped = '```json\n' + validJson + '\n```';
    const d = parseDraftResponse(wrapped, personas);
    expect(d.name).toBe('Pitch Critic');
  });

  it('tolerates leading prose and trailing commentary', () => {
    const messy = `Here is the JSON you requested:\n\n${validJson}\n\nHope this helps!`;
    const d = parseDraftResponse(messy, personas);
    expect(d.name).toBe('Pitch Critic');
  });

  it('handles braces inside string values without breaking', () => {
    const tricky = JSON.stringify({
      name: 'Brace test',
      description: 'Has a } in it.',
      system_prompt: 'Match this {regex} and that.',
      temperature: 0.5
    });
    const d = parseDraftResponse(tricky, personas);
    expect(d.system_prompt).toMatch(/{regex}/);
  });

  it('drops invalid persona IDs to null instead of crashing', () => {
    const bad = validJson.replace('p_engineer', 'not_a_real_persona');
    const d = parseDraftResponse(bad, personas);
    expect(d.default_persona_id).toBeNull();
  });

  it('clamps wild temperatures into the 0-2 range', () => {
    const wild = JSON.stringify({
      name: 'X',
      description: 'Y',
      system_prompt: 'Z',
      temperature: 99
    });
    const d = parseDraftResponse(wild, personas);
    expect(d.temperature).toBeLessThanOrEqual(2);
    expect(d.temperature).toBeGreaterThanOrEqual(0);
  });

  it('throws when required fields are missing', () => {
    const noPrompt = JSON.stringify({ name: 'X', description: 'Y' });
    expect(() => parseDraftResponse(noPrompt, personas)).toThrow(/system_prompt/);
  });

  it('throws when no JSON object is present', () => {
    expect(() => parseDraftResponse('I refuse to help with that.', personas)).toThrow(
      /JSON/
    );
  });

  it('throws on malformed JSON', () => {
    expect(() => parseDraftResponse('{ name: "missing quotes" }', personas)).toThrow(
      /malformed/i
    );
  });
});

describe('draftSkill', () => {
  it('round-trips through a fake engine', async () => {
    const engine = createFakeEngine({ scriptedResponse: validJson });
    await engine.load('fake');
    const d = await draftSkill(engine, {
      description: 'a skill that critiques pitch decks',
      personas
    });
    expect(d.name).toBe('Pitch Critic');
    expect(d.default_persona_id).toBe('p_engineer');
  });

  it('refuses if the engine is not ready', async () => {
    const engine = createFakeEngine({ scriptedResponse: validJson });
    await expect(
      draftSkill(engine, { description: 'anything', personas })
    ).rejects.toThrow(/not loaded|model/i);
  });

  it('refuses on empty description', async () => {
    const engine = createFakeEngine({ scriptedResponse: validJson });
    await engine.load('fake');
    await expect(draftSkill(engine, { description: '   ', personas })).rejects.toThrow(
      /describe/i
    );
  });

  it('propagates engine stream errors', async () => {
    const engine = createFakeEngine({ failOn: 'stream' });
    await engine.load('fake');
    await expect(
      draftSkill(engine, { description: 'a skill', personas })
    ).rejects.toThrow(/fake stream failure/);
  });
});

describe('buildDraftPrompt', () => {
  it('includes available personas with IDs', () => {
    const p = buildDraftPrompt('a skill', personas);
    expect(p).toContain('"p_engineer"');
    expect(p).toContain('"p_default"');
  });

  it('handles empty persona list gracefully', () => {
    const p = buildDraftPrompt('a skill', []);
    expect(p).toContain('(none)');
  });
});
