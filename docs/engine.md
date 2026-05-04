# Engine

How `src/engine/` integrates `llama.rn`, why we let llama.rn render prompts via the model's own Jinja chat template, how streaming + tool calling works, and how reasoning blocks are extracted from the output.

This is the most non-obvious part of the codebase. It's also the part where most "the model is hallucinating" or "the model isn't calling tools" bugs come from.

## Why an engine layer at all

The chat layer (`src/chat/`) talks to a `ChatEngine` interface, never directly to `llama.rn`. That interface is small:

```ts
interface ChatEngine {
  isReady(): boolean;
  load(modelPath: string, opts?): Promise<void>;
  dispose(): Promise<void>;
  streamCompletion(input, options, callbacks): Promise<void>;
  getContextLength?(): number;
}
```

Two implementations live behind it:

- [llamaRnEngine.ts](../src/engine/llamaRnEngine.ts) — production. Wraps `llama.rn`. Only works in a development build (not Expo Go, not Jest).
- [fakeEngine.ts](../src/engine/fakeEngine.ts) — scripted token streams. Used by tests and for UI development on the iOS simulator (where llama.rn can't run). Constructed via `useFakeEngineFor()` at module load.

This decoupling is what lets the entire test suite run without a native model and what lets us swap engines (a future LiteRT or MLX engine) without touching any UI or chat code.

## The fundamental decision: native chat templates

LLMs are not "send raw text" devices. Every modern instruct model is trained on a specific format that wraps role-tagged messages in special tokens — `<|im_start|>user\n...<|im_end|>\n<|im_start|>assistant\n` for ChatML, `<start_of_turn>user\n...<end_of_turn>` for Gemma, `<|user|>...<|assistant|>...` for Phi, etc. Get the format wrong and you get hallucinated tool calls, weird repetitions, or the model failing to recognize when a turn ends.

GGUF files ship with the model's chat template embedded as a Jinja string. `llama.rn`, `llama.cpp` CLI, and Ollama all support a `jinja: true` mode that tells the runtime: "given these structured messages, render them with the bundled template before tokenizing." That's the path we use.

The first cut of this app rendered prompts in JavaScript with hand-rolled markers like:

```ts
// DON'T do this. Kept here as a cautionary tale.
const newTurn = `<|user|>\n${args.newUserTurn}\n<|assistant|>\n`;
```

This works for one specific family of models and breaks every other. The output looked subtly wrong (hallucinated tool calls, premature turn endings, the model "talking to itself"). The cause was format mismatch — the model was trained on ChatML, we were feeding it the Phi-2 tokens.

Switching to native Jinja templating (passing structured `ChatMessage[]` and letting llama.rn's template handle the rendering) made all of those bugs disappear. The lesson is captured in a comment at the top of [llamaRnEngine.ts](../src/engine/llamaRnEngine.ts):

> We deliberately do NOT hand-roll `<|user|>` / `<|assistant|>` markers in JS: that fights every model that's been trained on its own template, and it's exactly the bug that caused tool-call hallucinations in the first cut of this app.

## The `ChatMessage` shape

What goes into the engine is OpenAI-compatible:

```ts
type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;          // For role:'tool', the tool id that produced the result
  tool_call_id?: string;  // For role:'tool', echoes the call id from the model
};
```

The engine forwards this almost unchanged to `llama.rn`. The chat template inside the GGUF reads it and renders the right tokens for that specific model.

## Loading a model

`llamaRnEngine.load(modelPath)` does five things, in order:

1. **Sanity-check the file** before letting llama.rn touch it. We've been burned by half-downloaded files, redirect-body 404s, and corrupted GGUFs that surface as "Failed to load model" deep in native code. The pre-flight catches them with a clearer error:
   - File exists? Otherwise: `Re-download the model.`
   - Size > 1MB? Below that, it's almost certainly a redirect body or partial. We delete the bad file and ask the user to retry.
   - First 8 bytes are `GGUF`? We base64-read just the header (size = 8 with `position: 0` to satisfy Android's expo-file-system implementation; see the comment in code) and check the magic.
2. **Try Metal first** (GPU offload, `n_gpu_layers: 99`).
3. **Fall back to CPU** if Metal init throws — some devices/models can't allocate enough Metal memory or reject the layout. The CPU path is slower but reliable.
4. **Cache the loaded model** so subsequent `streamCompletion` calls reuse the same context unless the path changes.
5. **Surface load progress** via `onProgress({phase: 'mmap' | 'warmup', percent})`. The chat hook uses this to drive the warming-stages animation.

The reason for the magic-header check: GGUF files start with the bytes `GGUF`. Anything else is corrupt. `llama.rn` would otherwise spend tens of seconds attempting to parse a JSON error body before giving up.

## Streaming

`streamCompletion(input, options, callbacks)` is the hot path. It:

1. Hooks an abort listener so `options.signal?.abort()` calls llama.rn's `stopCompletion()`.
2. Maps our `ChatMessage[]` to llama.rn's `RNLlamaMessage[]`.
3. Calls `ctx.completion({ messages, jinja: true, temperature, n_predict, stop, tools, tool_choice }, onTokenCallback)`.
4. Per-token, fans out via `onToken(text)`.
5. Per-token (and on completion), collects any `tool_calls` llama.rn parses out of the stream into a list.
6. On completion, dedupes tool calls by name (llama.rn streams each call's JSON args character by character, so we'd otherwise see N partial copies of the same call) and fires `onToolCalls(deduped)` once.
7. Calls `onDone({tokenCount, finishReason})` where `finishReason` is `'length'` if we hit `n_predict` or `'stop'` otherwise.

### The stop-token list

`jinja: true` should auto-derive stop tokens from the chat template, but in practice some GGUFs don't set them cleanly. We add a fallback list covering the common end-of-turn tokens:

```ts
stop: [
  '<|im_end|>',     // ChatML — Qwen 2/3, GLM
  '<|endoftext|>',  // GPT-2-style — Phi, Mistral
  '<|eot_id|>',     // Llama 3.x
  '<|end|>',        // Phi-3/4
  '<end_of_turn>',  // Gemma
  '</s>'            // older t5/llama
]
```

Any token not in the model's vocab is silently ignored, so adding extras is safe.

### Tool-call deduplication

`llama.rn` streams structured tool calls token-by-token as the model generates the JSON args. So in a single completion you might see callbacks like:

```
{tool_calls: [{name: 'web_search', arguments: '{}'}]}
{tool_calls: [{name: 'web_search', arguments: '{"q":'}]}
{tool_calls: [{name: 'web_search', arguments: '{"q":"AI'}]}
{tool_calls: [{name: 'web_search', arguments: '{"q":"AI news"}'}]}
```

Naive collection would treat each callback as a separate tool call and run the tool four times — three times with malformed args. The fix is to keep all partials in order and at end-of-stream dedupe by tool name, keeping the last (most-complete) version. This is implemented in `finalizeToolCalls()` in [llamaRnEngine.ts](../src/engine/llamaRnEngine.ts).

The tradeoff: if the model legitimately calls the same tool twice in one turn with different args, we'd lose one call. In practice this is rare and recoverable on the next turn.

## Reasoning extraction

Modern instruct models often emit a "thinking" block before their answer. There are three conventions we handle, all in [src/chat/reasoning.ts](../src/chat/reasoning.ts):

| Model family | Format | Notes |
| --- | --- | --- |
| Qwen 3, DeepSeek R1 | `<think>…</think>` | Standard. Sometimes the closing tag arrives mid-stream with no opening tag because the chat template prefilled `<think>\n` as part of the assistant prefix. |
| gpt-oss, Unsloth Gemma 4 | `<\|channel\|>thought ... <\|channel\|>final ...` | Harmony format. We keep the content of the LAST channel and treat earlier channels as reasoning. |
| Models that emit raw `<tool_call>...</tool_call>` text alongside structured tool calls (Qwen 3 ChatML) | `<tool_call>...</tool_call>` | Hidden from the rendered message — llama.rn already gave us the structured form. |

The exposed helpers:

- `stripReasoning(buffer)` — returns the visible (answer) text. Idempotent: running it on already-stripped text is a no-op. Called both during streaming (so the UI shows "thinking…" instead of an empty bubble) and at render time as defense-in-depth for messages persisted by older app versions.
- `extractReasoning(buffer)` — returns just the reasoning text, joined and trimmed. Persisted to the `reasoning_content` column on the assistant message and exposed in the UI behind a "▸ thinking" disclosure.

The Harmony channel regex deliberately uses `[a-z_]+` (no `i` flag) and is strict to lowercase letters + underscores. Without that strictness, the regex was eating the first letter of the answer when a model emitted `<|channel|>I found …`.

## What the engine does NOT do

A few things are explicitly *not* the engine's job, to keep the layer thin:

- **No conversation state.** The engine takes messages, returns tokens. The chat hook owns history, retries, etc.
- **No DB I/O.** The engine never touches SQLite. The chat hook persists.
- **No prompt budgeting.** The engine assumes the messages fit. The prompt builder already evicted history if needed.
- **No reasoning rendering.** The engine emits raw tokens. The reasoning helpers in `src/chat/reasoning.ts` are what split the buffer.

This separation is what makes the `fakeEngine` test path so cheap — to mock the engine, you just need scripted token output, nothing else.

## File reference

- [src/engine/types.ts](../src/engine/types.ts) — `ChatEngine`, `ChatMessage`, `ToolSpec`, `ToolCallEvent`, `StreamCallbacks`, `LoadProgress`.
- [src/engine/llamaRnEngine.ts](../src/engine/llamaRnEngine.ts) — production engine.
- [src/engine/fakeEngine.ts](../src/engine/fakeEngine.ts) — scripted engine for tests + simulator.
- [src/engine/index.ts](../src/engine/index.ts) — `getEngine()` indirection with a test override.
- [src/chat/reasoning.ts](../src/chat/reasoning.ts) — `stripReasoning` / `extractReasoning`.
- [src/chat/useConversation.ts](../src/chat/useConversation.ts) — the streaming hook that consumes the engine.

## Related docs

- [Tools](./tools.md) — how OpenAI-compatible tool specs flow through the engine.
- [Architecture](./architecture.md) — where this layer sits in the overall app.
- [Models](./models.md) — what GGUF files we support and how each handles chat templates.
