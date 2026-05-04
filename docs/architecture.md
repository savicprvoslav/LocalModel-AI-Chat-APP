# Architecture

How the app is structured, why it's structured that way, and what happens when you send a message.

## Goals that shaped the architecture

1. **All inference is on-device.** No prompts, no responses, no embeddings ever leave the phone for inference. The only outbound network calls are: (a) downloading model weights from HuggingFace, (b) explicitly opted-in tool calls (web search, weather, HTTP).
2. **Pluggable engine.** The chat hook should not know whether it's talking to `llama.rn`, the iOS simulator's `fakeEngine`, or a future backend. New engines can be added without touching UI or DB code.
3. **Persistent across launches.** Conversations, projects, personas, skills, settings, message embeddings — all survive app restarts.
4. **Defensible privacy story.** Tools are off by default. Network tools require an explicit second toggle. The RAG layer never sends content over the network.
5. **Small models that don't have GPT-4-grade implicit defaults.** The prompt builder layers a strong [base system prompt](../src/chat/baseSystemPrompt.ts) underneath every persona to compensate.

## Layered architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  app/                          Expo Router routes (file-based)      │
│  └── conversation/[id].tsx     Per-screen wrappers                  │
└────────────────────────────┬────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────────┐
│  src/ui/                       React Native components + theme      │
│  └── screens, components       No engine/DB imports                 │
└────────────────────────────┬────────────────────────────────────────┘
                             ↓ (calls hooks)
┌─────────────────────────────────────────────────────────────────────┐
│  src/chat/                     Conversation hook + prompt builder   │
│  ├── useConversation.ts        Streaming, tool-call iteration       │
│  ├── promptBuilder.ts          Context-budget eviction              │
│  ├── reasoning.ts              <think> / Harmony channel parsing    │
│  └── baseSystemPrompt.ts       The 450-token base layer             │
└──────────────────┬──────────────────────────────────┬───────────────┘
                   ↓                                  ↓
┌──────────────────────────────────┐  ┌──────────────────────────────┐
│  src/engine/                     │  │  src/db/                     │
│  ├── types.ts  (ChatMessage…)    │  │  ├── schema.ts (v7 + migr.)  │
│  ├── llamaRnEngine.ts            │  │  ├── db.ts (init/get)        │
│  ├── fakeEngine.ts               │  │  ├── messages.ts (repo)      │
│  └── index.ts                    │  │  ├── conversations.ts        │
│                                  │  │  ├── personas.ts, skills.ts  │
│  Only place importing 'llama.rn' │  │  └── search.ts (FTS5)        │
└──────────────────────────────────┘  └──────────────────────────────┘
                   ↓                                  ↓
┌──────────────────────────────────┐  ┌──────────────────────────────┐
│  Native: llama.cpp via JSI       │  │  Native: expo-sqlite         │
└──────────────────────────────────┘  └──────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  src/tools/                    Tool registry + OpenAI spec converter│
│  └── calculator, weather, web_search, http_request, fetch_url, time │
├─────────────────────────────────────────────────────────────────────┤
│  src/rag/                      Portable RAG module (no app deps)    │
│  └── embeddings, retrieval, extraction, storage                     │
├─────────────────────────────────────────────────────────────────────┤
│  src/integration/rag.ts        Wires src/rag into the host app      │
├─────────────────────────────────────────────────────────────────────┤
│  src/model/                    Catalog, download, storage paths     │
└─────────────────────────────────────────────────────────────────────┘
```

## Boundary rules

These rules are enforced by code review (and an upcoming lint rule):

| Rule | Reason |
| --- | --- |
| `import 'llama.rn'` only in [src/engine/llamaRnEngine.ts](../src/engine/llamaRnEngine.ts) | The chat hook should be engine-agnostic. Tests run against the fake engine. |
| `import 'expo-sqlite'` only in [src/db/](../src/db/) | DB-specific concerns shouldn't leak. Tests mock at the `expo-sqlite` boundary. |
| UI never imports engine or DB directly | UI talks to `src/chat/` hooks. Hooks coordinate engine + DB. |
| `src/rag/` has no app-specific imports | The RAG module is intentionally portable — it could be lifted into its own npm package. |

## Key design patterns

### Adapter pattern at every native boundary

Every native module has a thin adapter in front of it so the rest of the codebase depends on an interface, not the module:

- `ChatEngine` interface ([src/engine/types.ts](../src/engine/types.ts)) abstracts the LLM. `llamaRnEngine` implements it; `fakeEngine` implements it for tests.
- `LlmAdapter` and `SqliteAdapter` ([src/rag/types.ts](../src/rag/types.ts)) abstract the LLM and SQLite connection for the RAG layer. The host wires them in [src/integration/rag.ts](../src/integration/rag.ts).
- `Embedder` interface ([src/rag/types.ts](../src/rag/types.ts)) abstracts sentence embeddings. `MiniLmEmbedder` runs `react-native-executorch`; `HashEmbedder` is a deterministic fallback for tests and devices without `executorch`.

### Registry pattern for tools

Tools live in their own files ([src/tools/](../src/tools/)) and self-register in the catalog at [src/tools/registry.ts](../src/tools/registry.ts). Adding a new tool is a matter of writing one file plus one line. The registry is consulted by `useConversation` to know which tools are advertised, and by the runner to dispatch tool calls. See [tools.md](./tools.md) for the full flow.

### Repos as functions, not classes

Each table in `src/db/` has a `*.ts` file exporting plain functions: `appendMessage`, `listMessages`, `finishMessage`, etc. There are no repository classes. SQL lives inline in the function body. This is intentionally low-ceremony — it's faster to read, and there's no DI container to maintain.

### Layering the system prompt

Rather than one big system prompt, we compose six layers on every send (in order):

1. **Base** — the constant safety + style + output-format defaults from [baseSystemPrompt.ts](../src/chat/baseSystemPrompt.ts). Small models lack the implicit defaults frontier models have, so we set them explicitly.
2. **Persona** — voice / expertise / tone (Concise, Coach, Engineer, Editor, Tutor, …).
3. **Project context** — freeform notes plus structured `name → description` entities scoped to the project.
4. **Retrieval** — relevant snippets from past conversations (best-effort; see [rag.md](./rag.md)).
5. **Tools** — *not* in the system prompt anymore. Tool specs flow through llama.rn's native tool API via [openaiSpec.ts](../src/tools/openaiSpec.ts). Tools are described in the chat template, not in our prose. (See [engine.md](./engine.md) for why.)
6. **Conversation override** — per-conversation system prompt set by skill or user.

The composition logic is [composeSystem in src/chat/promptBuilder.ts](../src/chat/promptBuilder.ts).

### Iterative tool-call loop

When the model emits one or more tool calls during a stream, we don't restart the conversation. We:

1. Collect the structured tool calls llama.rn parses out of the stream.
2. Run each tool locally.
3. Append `role: 'tool'` messages with the results.
4. Call `streamCompletion` again to let the model continue from the tool results.
5. Loop, with a guard against the model emitting the same call twice in a row (it's spinning) and a hard `tools_max_iterations` cap.

This is implemented in the round-robin loop in [useConversation.ts](../src/chat/useConversation.ts). See [tools.md](./tools.md) for details.

## Request lifecycle: one chat message, end to end

What happens when you tap **Send** on a message:

```
1. UI                Composer onSend → useConversation.send(text)
                     │
2. Hook              useConversation.send:
   (chat layer)      ├─ load conversation, project, persona, settings
                     ├─ append user Message row to SQLite
                     ├─ index user message into RAG (best-effort, async)
                     ├─ append empty assistant Message row (placeholder)
                     ├─ retrieve relevant past snippets via RAG
                     ├─ buildMessages():
                     │  ├─ compose layered system prompt
                     │  ├─ pack history newest-first under context budget
                     │  └─ drop oldest pairs if needed; drop retrieval if needed
                     │
3. Model load        if engine not loaded for this conversation's model:
                     │  └─ engine.load(modelPath)  (mmap weights, allocate kv-cache)
                     │
4. Stream round 1    engine.streamCompletion({messages, tools}, options, callbacks):
   (engine layer)    ├─ pass to llama.rn with jinja: true
                     ├─ llama.rn renders prompt via the model's own chat template
                     ├─ model emits tokens; engine fans out via onToken callback
                     ├─ each token appended to buffer
                     ├─ buffer is flushed (stripping reasoning) to UI ~30 fps
                     └─ if model emits tool_calls in stream:
                        engine.onToolCalls fires once with deduped structured calls
                     │
5. Tool execution    if tool calls present:
   (chat layer)      ├─ for each call: dispatch to tools registry, run, capture result
                     ├─ append role:'tool' messages with results
                     ├─ go to step 4 (stream round 2) with extended messages
                     └─ guard: same calls twice → bail, max iterations → bail
                     │
6. Persistence       engine onDone:
                     ├─ stripReasoning(buffer) → final visible text
                     ├─ extractReasoning(buffer) → thinking content (collapsed in UI)
                     ├─ updateMessageStream(asstMsg.id, finalVisible)
                     ├─ finishMessage(asstMsg.id, {finish_reason, token_count, …,
                     │   tool_calls: persistedInvocations})
                     ├─ touchConversation(conv.id)  (bumps updated_at)
                     └─ index assistant message into RAG (visible only, not reasoning)
                     │
7. UI update         setState() with final message; FlatList renders the assistant
                     bubble with tool-call disclosure + thinking disclosure
```

The full hook is in [src/chat/useConversation.ts](../src/chat/useConversation.ts) — about 600 lines, including the warming-stages animation, retrieval peek, and retry/abort handling.

## State management

No Redux, no MobX, no Zustand. The app uses:

- **`useState` and `useReducer`** for screen-local state.
- **The `useConversation` hook** for per-conversation state. It owns its own state machine — `idle | warming | streaming | error | cancelled` — and exposes the current view to the UI.
- **SQLite as the source of truth** for everything persistent. Hooks read from SQLite on mount; writes go to SQLite first, then optimistic state update for the UI.

The decision was driven by scope: this app has no shared mutable state across screens that can't be re-fetched from SQLite cheaply. A global store would be ceremony for no benefit.

## Testing model

- **Pure logic only.** No component tests yet. The covered areas:
  - Engine wiring (against `fakeEngine`)
  - DB repos and schema migrations (against an in-memory SQLite via `__mocks__/expo-sqlite.ts`)
  - Model download + storage (against an in-memory FS via `__mocks__/expo-file-system.ts`)
  - Prompt building, reasoning extraction, RAG (HashEmbedder, FTS, retrieval, fact extraction)
  - Tool registry and runner

- **Tests don't load real models.** llama.rn requires a native device GPU; that path is exercised manually on a development build.

- **The `__mocks__/` directory** is what makes Jest tests work without native modules. It mocks `expo-sqlite`, `expo-crypto`, `expo-file-system`, `react-native-device-info`, `expo-haptics`, and a few others. Any new code that imports a native module needs a corresponding mock entry to keep tests running.

## Why these choices

A short rationale for each load-bearing decision:

- **GGUF + llama.rn over MLC, executorch-llm, MediaPipe LLM.** llama.rn has the broadest model support, the most active community, and ships with prebuilt iOS/Android binaries. We initially shipped a MediaPipe LLM module too; it was deleted because Google's prebuilt iOS binaries can't link on Xcode 26 (XNNPACK SME2 kernels). See [models.md](./models.md) for the history.
- **Native Jinja chat templates over hand-rolled markers.** Each model is trained on its own chat format. Rendering `<|user|>...<|assistant|>...` in JS fights every model that's been trained on its template. The first cut of this app did exactly that; tool-call hallucinations were rampant. The fix was to pass structured `messages` to llama.rn and let its `jinja: true` path apply each model's bundled template. See [engine.md](./engine.md).
- **OpenAI-compatible tool specs.** Same reason. Modern instruct models (GPT, Anthropic, Qwen, Llama 3, Phi-4) all converge on the same shape for tool descriptions. Forwarding that to llama.rn lets the model's template render the spec into its trained format. See [tools.md](./tools.md).
- **Hybrid retrieval (FTS5 + vector cosine).** FTS5 is exact-match king; vector search is fuzzy-match king. Hybrid catches both ("the meeting with Tom about Postgres" → BM25 finds "Postgres", vectors find "the migration discussion"). See [rag.md](./rag.md).
- **SQLite + plain JS vectors over `sqlite-vec`.** Personal-scale corpora (hundreds, low thousands of messages) are well within JS-cosine reach. `sqlite-vec` would be a forced dependency for negligible win. The note is in the schema comment, and it's a real future migration path.
- **No global state library.** The app's state is small and rooted in SQLite. A store would be cargo-cult for the size.

## Where to go next

- [Engine](./engine.md) — the most non-obvious layer.
- [Tools](./tools.md) — the second-most non-obvious.
- [Models](./models.md) — what's in the catalog and why.
- [RAG](./rag.md) — embeddings + FTS5 + entity extraction.
- [Database](./database.md) — schema and migrations.
