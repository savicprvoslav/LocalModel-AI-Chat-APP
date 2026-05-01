/**
 * Production engine wrapping llama.rn.
 *
 * Note: llama.rn is a native module — this file imports it but actual model
 * load + inference only works in a development build, not Expo Go and not
 * Jest. Tests live against `fakeEngine` instead.
 */
import type { ChatEngine, EmbedResult, GenerationOptions, StreamCallbacks } from './types';
import { HASH_EMBEDDER_NAME, hashEmbed } from '@/chat/vectors';

// Lazy-load llama.rn so the JS layer compiles even when the native module
// isn't built (e.g., when running in Expo Go or Jest).
type LlamaContext = {
  release: () => Promise<void>;
  completion: (
    params: {
      prompt: string;
      temperature?: number;
      n_predict?: number;
      stop?: string[];
    },
    onToken: (data: { token: string }) => void
  ) => Promise<{ stopped_limit?: boolean } | null | undefined>;
  stopCompletion: () => void;
};

type InitLlama = (params: {
  model: string;
  n_ctx: number;
  n_gpu_layers: number;
  use_mlock: boolean;
}) => Promise<LlamaContext>;

let _initLlama: InitLlama | null = null;
const getInitLlama = (): InitLlama => {
  if (_initLlama) return _initLlama;
  // Defer require so test/Node environments don't crash on import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('llama.rn');
  _initLlama = mod.initLlama as InitLlama;
  return _initLlama;
};

let ctx: LlamaContext | null = null;
let loadedPath: string | null = null;

export const llamaRnEngine: ChatEngine = {
  isReady: () => ctx !== null,

  async load(modelPath: string, opts) {
    if (loadedPath === modelPath && ctx) return;
    if (ctx) {
      await ctx.release();
      ctx = null;
      loadedPath = null;
    }
    opts?.onProgress?.({ phase: 'mmap', percent: 0 });
    const initLlama = getInitLlama();
    ctx = await initLlama({
      model: modelPath,
      n_ctx: 4096,
      n_gpu_layers: 99,
      use_mlock: false
    });
    loadedPath = modelPath;
    opts?.onProgress?.({ phase: 'warmup', percent: 100 });
  },

  async dispose() {
    if (ctx) {
      await ctx.release();
      ctx = null;
      loadedPath = null;
    }
  },

  async streamCompletion(prompt: string, options: GenerationOptions, cb: StreamCallbacks) {
    if (!ctx) throw new Error('engine not loaded');

    let aborted = false;
    const onAbort = () => {
      aborted = true;
      ctx?.stopCompletion();
    };
    options.signal?.addEventListener('abort', onAbort);

    let tokenCount = 0;
    try {
      const result = await ctx.completion(
        {
          prompt,
          temperature: options.temperature,
          n_predict: options.maxTokens,
          stop: ['<|eot_id|>', '</s>', '<|end|>', '<|user|>', '<|assistant|>', '<|system|>']
        },
        (data: { token: string }) => {
          if (aborted) return;
          tokenCount++;
          cb.onToken(data.token);
        }
      );

      if (aborted) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        cb.onError(err);
        return;
      }
      cb.onDone({
        tokenCount,
        finishReason: result?.stopped_limit ? 'length' : 'stop'
      });
    } catch (e) {
      if (aborted) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        cb.onError(err);
      } else {
        cb.onError(e instanceof Error ? e : new Error(String(e)));
      }
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }
  },

  /**
   * Embedding via the chat model is incompatible with chat mode in llama.rn —
   * the context must be initialized with `embedding: true` and the embedding
   * head needs an aligned tokenizer. Rather than ship a second model and
   * coordinate two contexts, we fall back to feature-hash embeddings.
   *
   * To upgrade later: replace this body with either (a) a separate llama
   * context loaded with `embedding: true` and a small embedding model, or
   * (b) onnxruntime-react-native running MiniLM. Keep the return shape and
   * the call sites are unaffected.
   */
  async embed(text: string): Promise<EmbedResult> {
    return { vector: hashEmbed(text), embedder: HASH_EMBEDDER_NAME };
  },

  getContextLength: () => 4096
};
