import { createFakeEngine } from '../fakeEngine';

describe('fakeEngine', () => {
  it('streams a scripted response token by token', async () => {
    const engine = createFakeEngine({ scriptedResponse: 'hello world' });
    await engine.load('/fake/path');
    expect(engine.isReady()).toBe(true);

    const tokens: string[] = [];
    let doneInfo: { tokenCount: number; finishReason: string } | undefined;

    await engine.streamCompletion(
      { messages: [{ role: 'user', content: 'prompt' }] },
      { temperature: 0.7, maxTokens: 100 },
      {
        onToken: (t) => tokens.push(t),
        onDone: (i) => {
          doneInfo = i;
        },
        onError: (e) => {
          throw e;
        }
      }
    );

    expect(tokens.join('')).toBe('hello world');
    expect(doneInfo?.finishReason).toBe('stop');
    expect(doneInfo?.tokenCount ?? 0).toBeGreaterThan(0);
  });

  it('respects AbortSignal mid-stream', async () => {
    const engine = createFakeEngine({
      scriptedResponse: 'one two three four',
      delayPerTokenMs: 10
    });
    await engine.load('/fake/path');
    const ctrl = new AbortController();
    const tokens: string[] = [];
    const errors: Error[] = [];

    setTimeout(() => ctrl.abort(), 25);
    await engine.streamCompletion(
      { messages: [{ role: 'user', content: 'p' }] },
      { temperature: 0, maxTokens: 100, signal: ctrl.signal },
      {
        onToken: (t) => tokens.push(t),
        onDone: () => {
          throw new Error('should not finish');
        },
        onError: (e) => errors.push(e)
      }
    );

    expect(errors.length).toBe(1);
    expect(errors[0]?.name).toBe('AbortError');
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('throws if streamCompletion called before load', async () => {
    const engine = createFakeEngine({ scriptedResponse: 'x' });
    await expect(
      engine.streamCompletion(
        { messages: [{ role: 'user', content: 'p' }] },
        { temperature: 0, maxTokens: 1 },
        { onToken: () => undefined, onDone: () => undefined, onError: () => undefined }
      )
    ).rejects.toThrow(/not loaded/i);
  });

  it('emits onError when failOn=stream', async () => {
    const engine = createFakeEngine({ scriptedResponse: 'x', failOn: 'stream' });
    await engine.load('/fake');
    const errors: Error[] = [];
    await engine.streamCompletion(
      { messages: [{ role: 'user', content: 'p' }] },
      { temperature: 0, maxTokens: 1 },
      {
        onToken: () => undefined,
        onDone: () => {
          throw new Error('should not finish');
        },
        onError: (e) => errors.push(e)
      }
    );
    expect(errors.length).toBe(1);
  });
});
