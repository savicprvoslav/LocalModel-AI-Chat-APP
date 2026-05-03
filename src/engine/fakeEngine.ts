import { ChatEngine, GenerationOptions, StreamCallbacks, StreamInput } from './types';

export type FakeEngineConfig = {
  scriptedResponse?: string;
  delayPerTokenMs?: number;
  loadDelayMs?: number;
  failOn?: 'load' | 'stream';
};

export const createFakeEngine = (cfg: FakeEngineConfig = {}): ChatEngine => {
  let loaded = false;
  let loadedPath: string | null = null;

  return {
    isReady: () => loaded,

    async load(modelPath: string) {
      if (cfg.failOn === 'load') throw new Error('fake load failure');
      if (cfg.loadDelayMs) await new Promise((r) => setTimeout(r, cfg.loadDelayMs));
      loaded = true;
      loadedPath = modelPath;
    },

    async dispose() {
      loaded = false;
      loadedPath = null;
    },

    async streamCompletion(input: StreamInput, options: GenerationOptions, cb: StreamCallbacks) {
      if (!loaded) throw new Error('engine not loaded');
      if (cfg.failOn === 'stream') {
        cb.onError(new Error('fake stream failure'));
        return;
      }
      const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const text = cfg.scriptedResponse ?? `[fake response to: "${lastUser.slice(-40)}"]`;
      const tokens = text.match(/\S+\s*|\s+/g) ?? [text];
      const delay = cfg.delayPerTokenMs ?? 0;

      let count = 0;
      for (const tok of tokens) {
        if (options.signal?.aborted) {
          const err = new Error('aborted');
          err.name = 'AbortError';
          cb.onError(err);
          return;
        }
        cb.onToken(tok);
        count++;
        if (delay) await new Promise((r) => setTimeout(r, delay));
      }
      cb.onDone({ tokenCount: count, finishReason: 'stop' });
    },

    getContextLength() {
      return 4096;
    }
  };
};
