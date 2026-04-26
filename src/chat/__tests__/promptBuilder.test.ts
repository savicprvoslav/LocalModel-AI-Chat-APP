import { buildPrompt, BuildPromptArgs } from '../promptBuilder';
import type { Message } from '@/db/messages';

const mkMsg = (role: 'user' | 'assistant', content: string, t = 1): Message => ({
  id: `${Math.random()}`,
  conversation_id: 'c',
  role,
  content,
  created_at: t,
  model_id: null,
  token_count: null,
  finish_reason: null
});

const baseArgs: BuildPromptArgs = {
  personaSystemPrompt: '',
  projectNotes: '',
  projectEntities: [],
  conversationSystemPrompt: '',
  history: [],
  newUserTurn: 'hello',
  contextWindow: 4096,
  reservedForResponse: 1024
};

describe('buildPrompt', () => {
  it('builds minimal prompt with just user turn', () => {
    const r = buildPrompt(baseArgs);
    expect(r.text).toContain('hello');
    expect(r.dropped).toBe(0);
  });

  it('combines persona + project + conversation system layers', () => {
    const r = buildPrompt({
      ...baseArgs,
      personaSystemPrompt: 'You are a concise assistant',
      projectNotes: 'Acme migrating to Postgres',
      projectEntities: [
        { name: 'Tom', description: 'backend lead' },
        { name: 'Q4 freeze', description: 'no risky merges after Dec 5' }
      ],
      conversationSystemPrompt: 'this is a 1:1 prep'
    });
    expect(r.text).toContain('You are a concise assistant');
    expect(r.text).toContain('PROJECT CONTEXT:');
    expect(r.text).toContain('Acme migrating to Postgres');
    expect(r.text).toContain('Tom: backend lead');
    expect(r.text).toContain('Q4 freeze: no risky merges after Dec 5');
    expect(r.text).toContain('this is a 1:1 prep');
    // ordering
    expect(r.text.indexOf('You are a concise')).toBeLessThan(r.text.indexOf('PROJECT CONTEXT'));
    expect(r.text.indexOf('PROJECT CONTEXT')).toBeLessThan(r.text.indexOf('this is a 1:1 prep'));
  });

  it('renders only entities (no notes) when notes are empty', () => {
    const r = buildPrompt({
      ...baseArgs,
      projectEntities: [{ name: 'Sam', description: 'PM' }]
    });
    expect(r.text).toContain('PROJECT CONTEXT:');
    expect(r.text).toContain('- Sam: PM');
  });

  it('omits PROJECT CONTEXT block when notes and entities both empty', () => {
    const r = buildPrompt({
      ...baseArgs,
      personaSystemPrompt: 'You are X'
    });
    expect(r.text).not.toContain('PROJECT CONTEXT');
  });

  it('drops oldest pairs to fit budget', () => {
    const longContent = 'x'.repeat(2000);
    const history = [
      mkMsg('user', longContent, 1),
      mkMsg('assistant', longContent, 2),
      mkMsg('user', longContent, 3),
      mkMsg('assistant', longContent, 4),
      mkMsg('user', longContent, 5),
      mkMsg('assistant', longContent, 6)
    ];
    const r = buildPrompt({
      ...baseArgs,
      history,
      contextWindow: 2048,
      reservedForResponse: 256
    });
    expect(r.dropped).toBeGreaterThan(0);
  });

  it('keeps newest pair, drops older', () => {
    const history = [
      mkMsg('user', 'old user', 1),
      mkMsg('assistant', 'old asst', 2),
      mkMsg('user', 'recent user', 3),
      mkMsg('assistant', 'recent asst', 4)
    ];
    const r = buildPrompt({ ...baseArgs, history });
    expect(r.text).toContain('recent user');
    expect(r.text).toContain('recent asst');
  });

  it('throws when persona + new turn exceeds budget', () => {
    expect(() =>
      buildPrompt({
        ...baseArgs,
        personaSystemPrompt: 'x'.repeat(50000),
        contextWindow: 1024,
        reservedForResponse: 256
      })
    ).toThrow(/too long/i);
  });

  it('renders history oldest→newest', () => {
    const history = [mkMsg('user', 'first-user', 1), mkMsg('assistant', 'first-asst', 2)];
    const r = buildPrompt({ ...baseArgs, history });
    expect(r.text.indexOf('first-user')).toBeLessThan(r.text.indexOf('first-asst'));
    expect(r.text.indexOf('first-asst')).toBeLessThan(r.text.indexOf(baseArgs.newUserTurn));
  });
});
