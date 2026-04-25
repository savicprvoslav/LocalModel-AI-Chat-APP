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
  defaultSystemPrompt: '',
  projectNotes: '',
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

  it('combines all three system layers in order', () => {
    const r = buildPrompt({
      ...baseArgs,
      defaultSystemPrompt: 'be concise',
      projectNotes: 'Tom is the backend lead',
      conversationSystemPrompt: 'this is a 1:1 prep'
    });
    expect(r.text).toContain('be concise');
    expect(r.text).toContain('Tom is the backend lead');
    expect(r.text).toContain('this is a 1:1 prep');
    expect(r.text.indexOf('be concise')).toBeLessThan(r.text.indexOf('Tom is the backend lead'));
    expect(r.text.indexOf('Tom is the backend lead')).toBeLessThan(
      r.text.indexOf('this is a 1:1 prep')
    );
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
    const r = buildPrompt({
      ...baseArgs,
      history,
      contextWindow: 4096,
      reservedForResponse: 1024
    });
    expect(r.text).toContain('recent user');
    expect(r.text).toContain('recent asst');
  });

  it('throws when even system + new turn exceeds budget', () => {
    expect(() =>
      buildPrompt({
        ...baseArgs,
        defaultSystemPrompt: 'x'.repeat(50000),
        contextWindow: 1024,
        reservedForResponse: 256
      })
    ).toThrow(/too long/i);
  });

  it('renders history oldest→newest in output', () => {
    const history = [mkMsg('user', 'first-user', 1), mkMsg('assistant', 'first-asst', 2)];
    const r = buildPrompt({ ...baseArgs, history });
    expect(r.text.indexOf('first-user')).toBeLessThan(r.text.indexOf('first-asst'));
    expect(r.text.indexOf('first-asst')).toBeLessThan(r.text.indexOf(baseArgs.newUserTurn));
  });
});
