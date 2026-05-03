/**
 * Production engine wrapping llama.rn.
 *
 * Note: llama.rn is a native module — this file imports it but actual model
 * load + inference only works in a development build, not Expo Go and not
 * Jest. Tests live against `fakeEngine` instead.
 *
 * This engine takes structured messages and lets llama.rn apply each model's
 * own Jinja chat template (Qwen 3 ChatML, Phi-4, Gemma, Llama 3.x — they all
 * differ). We deliberately do NOT hand-roll `<|user|>` / `<|assistant|>`
 * markers in JS: that fights every model that's been trained on its own
 * template, and it's exactly the bug that caused tool-call hallucinations
 * in the first cut of this app.
 */
import type {
  ChatEngine,
  ChatMessage,
  GenerationOptions,
  StreamCallbacks,
  StreamInput,
  ToolCallEvent,
  ToolSpec
} from './types';

type RNLlamaMessage = {
  role: string;
  content: string;
};

/** Shape llama.rn returns inside `data.tool_calls` per token. */
type RNLlamaToolCall = {
  type?: 'function';
  id?: string;
  function: {
    name: string;
    arguments: string; // JSON-encoded
  };
};

type LlamaContext = {
  release: () => Promise<void>;
  completion: (
    params: {
      messages?: RNLlamaMessage[];
      prompt?: string;
      jinja?: boolean;
      temperature?: number;
      n_predict?: number;
      stop?: string[];
      prefill_text?: string;
      tools?: object;
      tool_choice?: string;
    },
    onToken: (data: {
      token?: string;
      content?: string;
      reasoning_content?: string;
      tool_calls?: RNLlamaToolCall[];
    }) => void
  ) => Promise<{ stopped_limit?: boolean; tool_calls?: RNLlamaToolCall[] } | null | undefined>;
  stopCompletion: () => void;
};

type InitLlama = (params: {
  model: string;
  n_ctx: number;
  n_gpu_layers?: number;
  no_gpu_devices?: boolean;
  use_mlock?: boolean;
  use_mmap?: boolean;
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

const toRNMessage = (m: ChatMessage): RNLlamaMessage => ({
  role: m.role,
  content: m.content
});

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
    // expo-file-system paths come in as `file://` URIs; llama.cpp expects a
    // raw filesystem path, so we strip the scheme.
    const nativePath = modelPath.replace(/^file:\/\//, '');
    // Sanity-check: file exists, has plausible size, and starts with the
    // GGUF magic header. Catches truncated / redirect-body files before
    // llama.rn buries the real reason behind "Failed to load model".
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FS = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const info = await FS.getInfoAsync(modelPath);
    const size =
      info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
    const head = info.exists
      ? await FS.readAsStringAsync(modelPath, {
          encoding: FS.EncodingType.Base64,
          length: 8
        })
      : '';
    // Base64 encoding of "GGUF" is "R0dVRg==", so the prefix is "R0dVRg".
    const looksLikeGGUF = head.startsWith('R0dVRg');
    console.log(
      `[llama.rn] preload check: size=${size} ggufMagic=${looksLikeGGUF} path=${nativePath}`
    );

    if (!info.exists) {
      throw new Error(`Model file not found at ${nativePath}. Re-download the model.`);
    }
    if (size < 1_000_000) {
      // 1MB floor — every real GGUF (even a tiny test model) is well above
      // this. Anything smaller is an error response body or partial.
      await FS.deleteAsync(modelPath, { idempotent: true });
      throw new Error(
        `Model file is only ${size} bytes — almost certainly a failed-download body. The bad file has been deleted; re-download to retry.`
      );
    }
    if (!looksLikeGGUF) {
      await FS.deleteAsync(modelPath, { idempotent: true });
      throw new Error(
        `Model file does not start with the GGUF magic header. The bad file has been deleted; re-download to retry.`
      );
    }

    // Two-tier load: try Metal (full GPU offload) first, fall back to CPU
    // if Metal init fails. The fallback path is slower but works on devices
    // where Metal can't allocate enough memory or rejects the model layout.
    // We log both errors so the surfaced failure points at the real reason.
    try {
      ctx = await initLlama({
        model: nativePath,
        n_ctx: 4096,
        n_gpu_layers: 99,
        use_mlock: false
      });
      console.log('[llama.rn] initLlama OK on GPU (Metal)');
    } catch (gpuErr) {
      const gpuMsg =
        gpuErr instanceof Error
          ? gpuErr.message
          : JSON.stringify(gpuErr, Object.getOwnPropertyNames(gpuErr as object));
      console.log('[llama.rn] GPU init failed, retrying on CPU:', gpuMsg);
      try {
        ctx = await initLlama({
          model: nativePath,
          n_ctx: 4096,
          n_gpu_layers: 0,
          no_gpu_devices: true,
          use_mlock: false
        });
        console.log('[llama.rn] initLlama OK on CPU (Metal disabled)');
      } catch (cpuErr) {
        const cpuMsg =
          cpuErr instanceof Error
            ? cpuErr.message
            : JSON.stringify(cpuErr, Object.getOwnPropertyNames(cpuErr as object));
        console.log('[llama.rn] CPU init also failed:', cpuMsg);
        throw new Error(
          `Model load failed.\nGPU: ${gpuMsg}\nCPU: ${cpuMsg}\nLikely causes: corrupted file, unsupported architecture, or insufficient memory.`
        );
      }
    }

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

  async streamCompletion(input: StreamInput, options: GenerationOptions, cb: StreamCallbacks) {
    if (!ctx) throw new Error('engine not loaded');

    let aborted = false;
    const onAbort = () => {
      aborted = true;
      ctx?.stopCompletion();
    };
    options.signal?.addEventListener('abort', onAbort);

    let tokenCount = 0;
    // llama.rn streams tool_calls character-by-character as the model
    // emits the JSON args, so we get N partial entries per logical call:
    //   web_search({}), web_search({"q":}), …, web_search({"query":"…"})
    // Naive collection treats each partial as a separate call and runs
    // the tool N times (N-1 with empty args, one with real args).
    //
    // Strategy: keep ALL raw partials in order, then at end-of-stream
    // dedupe by tool name, keeping the LAST occurrence per name (the
    // most-complete version). This handles the partial-emission case
    // correctly. Trade-off: if the model legitimately calls the SAME
    // tool twice in one turn with different args, we'd lose one call —
    // rare in practice and recoverable in the next turn.
    const rawToolCalls: RNLlamaToolCall[] = [];
    const collectToolCalls = (raw: RNLlamaToolCall[] | undefined): void => {
      if (!raw || raw.length === 0) return;
      for (const tc of raw) {
        if (tc.function?.name) rawToolCalls.push(tc);
      }
    };

    const finalizeToolCalls = (): ToolCallEvent[] => {
      const byName = new Map<string, RNLlamaToolCall>();
      for (const tc of rawToolCalls) byName.set(tc.function.name, tc);
      const out: ToolCallEvent[] = [];
      for (const tc of byName.values()) {
        const argsStr = tc.function.arguments ?? '{}';
        let args: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(argsStr) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch {
          // Malformed JSON — fall through with empty args; the runner
          // decides whether to error on missing required params.
        }
        out.push({
          name: tc.function.name,
          args,
          ...(tc.id ? { id: tc.id } : {})
        });
      }
      return out;
    };

    if (input.tools && input.tools.length > 0) {
      console.log(
        `[llama.rn] streamCompletion with ${input.tools.length} tool(s):`,
        input.tools.map((t) => t.function.name).join(', ')
      );
    } else {
      console.log('[llama.rn] streamCompletion with NO tools');
    }

    try {
      const result = await ctx.completion(
        {
          messages: input.messages.map(toRNMessage),
          jinja: true,
          temperature: options.temperature,
          n_predict: options.maxTokens,
          // jinja=true should auto-derive stop tokens from the model's chat
          // template, but in practice some GGUFs don't set them cleanly and
          // the model runs past its end-of-turn marker (Qwen 3 in particular
          // gets stuck in a `<think>` → answer → `<think>` loop). This list
          // covers the common end-of-turn tokens across the modern instruct
          // models we support — adding extras is safe (anything not in the
          // model's vocab is silently ignored).
          stop: [
            '<|im_end|>', // ChatML — Qwen 2/3, GLM, etc.
            '<|endoftext|>', // GPT-2-style — Phi, Mistral
            '<|eot_id|>', // Llama 3.x
            '<|end|>', // Phi-3/4
            '<end_of_turn>', // Gemma
            '</s>' // older t5/llama
          ],
          ...(input.prefillText ? { prefill_text: input.prefillText } : {}),
          ...(input.tools && input.tools.length > 0
            ? { tools: input.tools as unknown as object, tool_choice: 'auto' }
            : {})
        },
        (data) => {
          if (aborted) return;
          // `data.token` is the per-step delta (what we want to append to
          // the buffer). `data.content` and `data.accumulated_text` are
          // cumulative-so-far in some llama.rn builds — appending those
          // makes the buffer grow exponentially with rendered duplicates.
          collectToolCalls(data.tool_calls);
          const text = data.token ?? '';
          if (!text) return;
          tokenCount++;
          cb.onToken(text);
        }
      );

      // Some llama.rn builds put the final tool_calls on the result object
      // rather than per-chunk — fold those in too before deduping.
      collectToolCalls(result?.tool_calls);

      if (aborted) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        cb.onError(err);
        return;
      }

      const finalToolCalls = finalizeToolCalls();
      if (finalToolCalls.length > 0) {
        console.log(
          `[llama.rn] parsed ${finalToolCalls.length} tool call(s) (after dedupe of ${rawToolCalls.length} partials):`,
          finalToolCalls.map((c) => `${c.name}(${JSON.stringify(c.args)})`).join(', ')
        );
        if (cb.onToolCalls) cb.onToolCalls(finalToolCalls);
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

  getContextLength: () => 4096
};
