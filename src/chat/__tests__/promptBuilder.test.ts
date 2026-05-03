import { buildMessages, BuildPromptArgs } from '../promptBuilder';
import type { Message } from '@/db/messages';

const mkMsg = (role: 'user' | 'assistant', content: string, t = 1): Message => ({
  id: `${Math.random()}`,
  conversation_id: 'c',
  role,
  content,
  created_at: t,
  model_id: null,
  token_count: null,
  finish_reason: null,
  reasoning_content: null,
  tool_calls: null
});

const baseArgs: BuildPromptArgs = {
  baseSystemPrompt: '',
  personaSystemPrompt: '',
  projectNotes: '',
  projectEntities: [],
  conversationSystemPrompt: '',
  history: [],
  newUserTurn: 'hello',
  contextWindow: 4096,
  reservedForResponse: 1024
};

describe('buildMessages', () => {
  it('builds minimal messages with just user turn', () => {
    const r = buildMessages(baseArgs);
    const last = r.messages[r.messages.length - 1];
    expect(last?.role).toBe('user');
    expect(last?.content).toBe('hello');
    expect(r.dropped).toBe(0);
  });

  it('combines persona + project + conversation system layers', () => {
    const r = buildMessages({
      ...baseArgs,
      personaSystemPrompt: 'You are a concise assistant',
      projectNotes: 'Acme migrating to Postgres',
      projectEntities: [
        { name: 'Tom', description: 'backend lead' },
        { name: 'Q4 freeze', description: 'no risky merges after Dec 5' }
      ],
      conversationSystemPrompt: 'this is a 1:1 prep'
    });
    const sys = r.messages.find((m) => m.role === 'system');
    expect(sys).toBeDefined();
    expect(sys!.content).toContain('You are a concise assistant');
    expect(sys!.content).toContain('PROJECT CONTEXT:');
    expect(sys!.content).toContain('Acme migrating to Postgres');
    expect(sys!.content).toContain('Tom: backend lead');
    expect(sys!.content).toContain('Q4 freeze: no risky merges after Dec 5');
    expect(sys!.content).toContain('this is a 1:1 prep');
    expect(sys!.content.indexOf('You are a concise')).toBeLessThan(
      sys!.content.indexOf('PROJECT CONTEXT')
    );
    expect(sys!.content.indexOf('PROJECT CONTEXT')).toBeLessThan(
      sys!.content.indexOf('this is a 1:1 prep')
    );
  });

  it('renders only entities (no notes) when notes are empty', () => {
    const r = buildMessages({
      ...baseArgs,
      projectEntities: [{ name: 'Sam', description: 'PM' }]
    });
    const sys = r.messages.find((m) => m.role === 'system');
    expect(sys?.content).toContain('PROJECT CONTEXT:');
    expect(sys?.content).toContain('- Sam: PM');
  });

  it('omits system message when all prompt parts are empty', () => {
    const r = buildMessages(baseArgs);
    expect(r.messages.find((m) => m.role === 'system')).toBeUndefined();
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
    const r = buildMessages({
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
    const r = buildMessages({ ...baseArgs, history });
    const contents = r.messages.map((m) => m.content);
    expect(contents).toContain('recent user');
    expect(contents).toContain('recent asst');
  });

  it('throws when persona + new turn exceeds budget', () => {
    expect(() =>
      buildMessages({
        ...baseArgs,
        personaSystemPrompt: 'x'.repeat(50000),
        contextWindow: 1024,
        reservedForResponse: 256
      })
    ).toThrow(/too long/i);
  });

  it('renders history oldest-first then new user turn last', () => {
    const history = [mkMsg('user', 'first-user', 1), mkMsg('assistant', 'first-asst', 2)];
    const r = buildMessages({ ...baseArgs, history });
    const nonSystem = r.messages.filter((m) => m.role !== 'system');
    expect(nonSystem[0]?.content).toBe('first-user');
    expect(nonSystem[1]?.content).toBe('first-asst');
    expect(nonSystem[2]?.content).toBe('hello');
  });

  it('includes RELEVANT FROM PAST block in system message', () => {
    const r = buildMessages({
      ...baseArgs,
      personaSystemPrompt: 'X',
      relevantSnippets: [
        { source: '~/acme/board-prep', excerpt: 'Tom said the timeline is tight' },
        { source: '~/acme/q4-plan', excerpt: 'Migration scoped for Q1' }
      ]
    });
    const sys = r.messages.find((m) => m.role === 'system');
    expect(sys?.content).toContain('RELEVANT FROM PAST');
    expect(sys?.content).toContain('[~/acme/board-prep]');
    expect(sys?.content).toContain('Tom said the timeline is tight');
  });

  it('omits RELEVANT block when snippets array is empty', () => {
    const r = buildMessages({ ...baseArgs, personaSystemPrompt: 'X', relevantSnippets: [] });
    const sys = r.messages.find((m) => m.role === 'system');
    expect(sys?.content).not.toContain('RELEVANT FROM PAST');
  });

  it('includes the BASE system prompt by default and orders it first', () => {
    const r = buildMessages({
      personaSystemPrompt: 'You are Captain.',
      projectNotes: '',
      projectEntities: [],
      conversationSystemPrompt: '',
      history: [],
      newUserTurn: 'hi',
      contextWindow: 4096,
      reservedForResponse: 1024
    });
    const sys = r.messages.find((m) => m.role === 'system');
    expect(sys?.content).toContain("running entirely on the user's device");
    expect(sys!.content.indexOf("running entirely on the user's device")).toBeLessThan(
      sys!.content.indexOf('You are Captain.')
    );
  });

  it('honors baseSystemPrompt: "" to suppress the base layer', () => {
    const r = buildMessages({ ...baseArgs, personaSystemPrompt: 'X' });
    const sys = r.messages.find((m) => m.role === 'system');
    expect(sys?.content).not.toContain("running entirely on the user's device");
    expect(sys?.content).toContain('X');
  });

  it('drops RELEVANT block (rather than throwing) if it would exceed budget', () => {
    const long = 'x'.repeat(1500);
    const r = buildMessages({
      ...baseArgs,
      contextWindow: 1024,
      reservedForResponse: 256,
      relevantSnippets: [
        { source: 'a', excerpt: long },
        { source: 'b', excerpt: long }
      ]
    });
    const sys = r.messages.find((m) => m.role === 'system');
    const allContent = r.messages.map((m) => m.content).join('');
    expect(allContent).not.toContain(long);
  });

  it('expands persisted tool_calls into role:tool messages after assistant turn', () => {
    const history = [
      mkMsg('user', 'what is the weather?', 1),
      {
        ...mkMsg('assistant', 'The weather in Belgrade is sunny.', 2),
        tool_calls: [
          { name: 'weather', args: { location: 'Belgrade' }, result: 'Sunny, 25°C' }
        ]
      }
    ];
    const r = buildMessages({ ...baseArgs, history });
    const toolMsg = r.messages.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.content).toContain('Sunny, 25°C');
    expect(toolMsg!.name).toBe('weather');
  });
});
