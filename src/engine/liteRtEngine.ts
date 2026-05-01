/**
 * Production engine wrapping Google's MediaPipe LLM Inference (LiteRT-LM)
 * via the in-tree `react-native-mediapipe-llm` module.
 *
 * Same lifecycle contract as `llamaRnEngine` so the two can be swapped via
 * `setEngine`. Picks up `.task` / `.litertlm` model bundles — not GGUF.
 */
import type { ChatEngine, EmbedResult, GenerationOptions, StreamCallbacks } from './types';
import { HASH_EMBEDDER_NAME, hashEmbed } from '@/chat/vectors';

type MediaPipeLlmModule = typeof import('react-native-mediapipe-llm');

let _mod: MediaPipeLlmModule | null = null;
const getMod = (): MediaPipeLlmModule => {
  if (_mod) return _mod;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _mod = require('react-native-mediapipe-llm') as MediaPipeLlmModule;
  return _mod;
};

let sessionId: number | null = null;
let loadedPath: string | null = null;

const CONTEXT_LEN = 4096;

export const liteRtEngine: ChatEngine = {
  isReady: () => sessionId !== null,

  async load(modelPath: string, opts) {
    if (loadedPath === modelPath && sessionId !== null) return;
    if (sessionId !== null) {
      await getMod().release(sessionId);
      sessionId = null;
      loadedPath = null;
    }
    opts?.onProgress?.({ phase: 'mmap', percent: 0 });
    sessionId = await getMod().createSession({
      modelPath,
      maxTokens: CONTEXT_LEN,
      temperature: 0.8,
      topK: 40
    });
    loadedPath = modelPath;
    opts?.onProgress?.({ phase: 'warmup', percent: 100 });
  },

  async dispose() {
    if (sessionId !== null) {
      await getMod().release(sessionId);
      sessionId = null;
      loadedPath = null;
    }
  },

  async streamCompletion(prompt: string, options: GenerationOptions, cb: StreamCallbacks) {
    const id = sessionId;
    if (id === null) throw new Error('engine not loaded');
    const mod = getMod();

    let aborted = false;
    let tokenCount = 0;

    const partialSub = mod.addPartialListener((event) => {
      if (event.sessionId !== id) return;
      if (aborted) return;
      if (event.done) {
        cb.onDone({ tokenCount, finishReason: tokenCount >= options.maxTokens ? 'length' : 'stop' });
        cleanup();
        return;
      }
      if (event.partial) {
        tokenCount++;
        cb.onToken(event.partial);
      }
    });

    const errorSub = mod.addErrorListener((event) => {
      if (event.sessionId !== id) return;
      if (aborted) return;
      cb.onError(new Error(event.message));
      cleanup();
    });

    const cleanup = () => {
      partialSub.remove();
      errorSub.remove();
      options.signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      aborted = true;
      mod.cancel(id).catch(() => undefined);
      const err = new Error('aborted');
      err.name = 'AbortError';
      cb.onError(err);
      cleanup();
    };
    options.signal?.addEventListener('abort', onAbort);

    try {
      await mod.generate(id, prompt);
    } catch (e) {
      if (!aborted) {
        cb.onError(e instanceof Error ? e : new Error(String(e)));
        cleanup();
      }
    }
  },

  async embed(text: string): Promise<EmbedResult> {
    return { vector: hashEmbed(text), embedder: HASH_EMBEDDER_NAME };
  },

  getContextLength: () => CONTEXT_LEN
};
