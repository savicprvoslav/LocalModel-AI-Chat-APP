# Tools

How the model invokes external functions, what's in the registry, the OpenAI-compatible spec layer, the iteration loop that runs tools and feeds results back, and how to add a new tool.

## What "a tool" is

A tool is a function the model can call mid-generation when the user asks something it can't answer from its weights alone — math, current time, weather, web search, fetching a URL, hitting an HTTP endpoint. The model emits a structured tool call; we execute the function locally; we feed the result back; the model continues its answer using the result.

The code layer lives in [src/tools/](../src/tools/).

## Two big design choices

### 1. Generic primitives, not per-service bridges

The PRD originally suggested per-service tools (`calendar.search`, `email.create_draft`, `reminder.create`). Each one would need a real iOS native bridge.

Instead we ship six generic primitives and let the model orchestrate them:

```
web_search → fetch_url → http_request(POST, webhook)
```

Any service that exposes an HTTP API — Slack, Notion, Linear, IFTTT, Zapier, your own backend — is reachable via `http_request` without us shipping a per-service native bridge. The cost is that the user has to give the model context about *which* webhook to use; the win is that we don't ship integrations that go stale.

### 2. Native tool calling via `llama.rn`, not custom XML

An earlier version of this app advertised tools via a custom prompt block:

```
TOOLS YOU CAN CALL:
- web_search: ...
- calculator: ...

TOOL CALL FORMAT — when you need a tool, output exactly:
<tool_call>{"name": "...", "args": {...}}</tool_call>
```

…and parsed `<tool_call>` strings out of the model's output. This worked, but every model interpreted the format slightly differently — some emitted multiple calls per block, some forgot the closing tag, some called nonexistent tools, some described tools instead of invoking them.

We replaced it with **OpenAI-compatible function specs**, passed through `llama.rn`'s native `tools` parameter:

```ts
type ToolSpec = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: { [name]: { type, description? } };
      required?: string[];
    };
  };
};
```

`llama.rn` renders these into each model's *trained* tool-call format via the chat template:

- **Qwen 3 ChatML** — `<|im_start|>tool\n{...}\n<|im_end|>` with structured JSON args
- **Llama 3.x** — JSON tool calls with `<|eom|>` delimiters
- **Phi-4** — built-in function-calling tokens
- **Gemma 4** — Harmony channels

Output side: `llama.rn` parses the model's emitted tool calls into structured `ToolCallEvent`s and delivers them to our engine via `data.tool_calls` per token (with a final settled list on the result object). Our engine dedupes them (see [Engine](./engine.md#tool-call-deduplication)) and hands a clean array to the chat hook.

The deleted code lived in `src/tools/parser.ts` and `src/tools/systemPrompt.ts`. The conversion layer that's still important is [src/tools/openaiSpec.ts](../src/tools/openaiSpec.ts).

## The `Tool` interface

[src/tools/types.ts](../src/tools/types.ts):

```ts
type Tool = {
  id: string;                    // canonical name; matches the spec's function.name
  name: string;                  // human-readable label for UI
  description: string;           // shown to the model in the spec
  params: ToolParam[];
  network: boolean;              // gates UI default-on/off and the second toggle
  run: (args, ctx) => Promise<string>;
};

type ToolParam = {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
};
```

The `network` flag drives two things:

- **Default enablement.** Local tools (calculator, current_time) are enabled by default once the master tool toggle is on. Network tools require an explicit per-tool opt-in. This keeps the privacy promise crisp.
- **UI surfacing.** Settings → Tools shows a "🌐 network" badge on tools that touch the network.

## The registry

[src/tools/registry.ts](../src/tools/registry.ts) is a one-array module. Adding a tool here makes it available to the rest of the app:

```ts
export const ALL_TOOLS: Tool[] = [
  calculatorTool,
  currentTimeTool,
  weatherTool,
  webSearchTool,
  fetchUrlTool,
  httpRequestTool
];
```

Three helpers fall out of this:

- `enabledTools(cfg)` — filters the catalog by `tools_enabled` master gate and `tools_per_tool` overrides.
- `findTool(id)` — used by the runner to dispatch a model-emitted call.
- `DEFAULT_TOOLS_CONFIG` — `{ tools_enabled: false, per_tool: {} }`.

## Built-in tools

| Tool | Network? | What it does | API key? |
| --- | --- | --- | --- |
| `calculator` | no | Safely evaluate an arithmetic expression. Uses a small parser, *not* `eval()`. | — |
| `current_time` | no | Return the current local time. | — |
| `weather` | yes | Current weather via OpenWeatherMap (free tier). | OpenWeatherMap |
| `web_search` | yes | Top Google results via Serper.dev (titles, snippets, links, answer-box, knowledge graph). | Serper.dev |
| `fetch_url` | yes | Download a URL, strip HTML, return readable text capped at 16 KB. | — |
| `http_request` | yes | Generic HTTP GET / HEAD. POST/PUT/DELETE/PATCH are gated until a confirmation UI ships. | — |

API keys for `weather` and `web_search` go in `src/config/secrets.local.ts` (gitignored). See [src/config/secrets.example.ts](../src/config/secrets.example.ts) for the shape, and [src/config/secrets.ts](../src/config/secrets.ts) for the lazy loader.

The HTTP write-method gate is intentional. Once we ship a confirmation card UI, the model will be able to draft a write request and the user will approve before it executes. Until then, write methods return an explicit error so the model abandons rather than tries.

## The OpenAI-spec converter

[src/tools/openaiSpec.ts](../src/tools/openaiSpec.ts) converts our internal `Tool` shape to the OpenAI-compatible `ToolSpec` shape that `llama.rn`'s chat-template machinery expects. It maps our primitive type tags (`'string' | 'number' | 'boolean'`) to JSON-schema types and threads `description` and `required` correctly.

Why this layer exists at all: our `Tool.params` is optimized for prompt rendering; the OpenAI shape is JSON-schema-like and is what every modern instruct model has been trained against. Keeping them separate means `Tool` stays ergonomic to write and the spec stays accurate.

## The runner

[src/tools/runner.ts](../src/tools/runner.ts) is the single dispatch point:

```ts
runToolCall(tool, call, ctxOverride?): Promise<ToolInvocation>
```

It catches handler errors so the chat hook can surface a structured error result to the model and let it self-correct on the next pass. It threads a default 8-second timeout and propagates the conversation's abort signal. It records `durationMs` on every invocation.

## The tool-call iteration loop

This is the most non-obvious part of `useConversation`. When the engine streams back one or more tool calls, the chat hook does not abandon and start over. It runs an iteration loop:

```
1. Stream round R:
   ├─ engine.streamCompletion(messages, …)
   ├─ collect tokens into buffer (UI updates ~30 fps)
   └─ collect structured tool calls

2. If no tool calls → done. Persist + return.

3. Else, for each tool call:
   ├─ findTool(call.name) — must be registered AND in the active set
   ├─ runToolCall(tool, call) — get a ToolInvocation
   └─ stash the (name, args, result, error?) on persistedInvocations

4. Build the next round's messages:
     […original system + history + new user turn,
      assistant: <stripReasoning(buffer)>,        ← what the model said so far
      tool: { name, content: result },
      tool: { name, content: result },
      …]

5. buffer = '' (we're starting a new visible response)
   iterations++; check guards:
     ├─ if iterations >= settings.tools_max_iterations → bail with note
     └─ if calls signature == previous round's signature → model is spinning,
        surface raw tool result to the user, bail

6. Go to step 1.
```

Why this shape:

- **Each tool round reuses the same warmed model context.** Cheap.
- **The model continues from where it left off**, with the tool data in its real context window. Follow-up questions ("what was the humidity?") still have the weather payload.
- **The loop is bounded.** Without bounds, a model that keeps emitting `web_search` would burn tokens forever.
- **Tool results are persisted** on the assistant message in the `tool_calls` JSON column. On the *next* user turn, [buildMessages in promptBuilder.ts](../src/chat/promptBuilder.ts) re-expands them into `role: 'tool'` messages so the raw data stays in context across turns.

## What the model sees

Concretely, when you send "what's the weather in Belgrade?" with `weather` enabled:

```
Round 1 input:
  system: <base + persona + project + retrieval>
  user:   what's the weather in Belgrade?
  + tools: [{name: 'weather', description: …, parameters: {location: …}}]

Round 1 output:
  (model emits structured tool call: weather({location: 'Belgrade'}))

App runs the tool:
  weather({location: 'Belgrade'}) → "Weather in Belgrade, RS: clear sky.
  Temperature 23°C. Humidity 38%. Wind 4 m/s."

Round 2 input:
  system: <same as before>
  user:   what's the weather in Belgrade?
  assistant: <empty string — partial response from round 1, none visible yet>
  tool:   <name='weather', content='Weather in Belgrade, RS: clear sky. …'>

Round 2 output:
  "It's clear and 23°C in Belgrade right now, with 38% humidity and a
  light 4 m/s wind."

App: persists message with tool_calls = [{name:'weather', args:{location:'Belgrade'},
  result:'Weather in Belgrade...'}]
```

## Adding a new tool

Five-step recipe:

1. **Write the tool.** Create `src/tools/yourTool.ts`:

   ```ts
   import type { Tool } from './types';

   export const yourTool: Tool = {
     id: 'your_tool',
     name: 'Your Tool',
     description: 'One-line description shown to the model. Be specific about when to use it.',
     network: false,
     params: [
       { name: 'input', type: 'string', required: true, description: 'What goes in.' }
     ],
     run: async (args, ctx) => {
       const input = String(args.input ?? '').trim();
       if (!input) return 'ERROR: missing required arg "input"';
       // ... do the work, respect ctx.timeoutMs and ctx.signal ...
       return 'result string';
     }
   };
   ```

2. **Register it.** Add `yourTool` to `ALL_TOOLS` in [src/tools/registry.ts](../src/tools/registry.ts).

3. **Set `network` correctly.** If the tool reaches the network, set `network: true`. It'll be off by default and require a per-tool opt-in.

4. **Test it.** Add `src/tools/__tests__/yourTool.test.ts`. The tests should cover: happy path, missing required arg, error path, timeout (where applicable), abort propagation.

5. **Don't touch the prompt.** The OpenAI-spec converter handles the wire format. The model template handles the rendering. Trust the chain.

### Things to watch for

- **Always handle `ctx.signal` for network tools.** The `webSearchTool` and `weatherTool` show the right pattern: register an abort listener on `ctx.signal`, propagate to the inner `AbortController`, and `removeEventListener` in `finally` so you don't leak listeners across calls.
- **Cap response size.** `fetch_url` caps at 16 KB; `http_request` at 8 KB. The model's context window is precious; a 200 KB response is almost always 99% chrome.
- **Return a string, not JSON.** The model is going to read it as natural language. A flat sentence is easier to integrate into a synthesized answer than a deep JSON tree.
- **Friendly errors.** Return `'ERROR: <reason>'` strings instead of throwing. The runner catches throws too, but throwing means the chat hook can't show a useful "tool failed because X" line under the assistant message.

## Persistence

Tool invocations are persisted on the assistant message (`tool_calls` column on the `messages` table — added in schema migration v7). Each invocation stores `{ name, args, result, error? }`. The UI surfaces them behind a "▸ tool" disclosure on the assistant bubble. They're also re-expanded into `role: 'tool'` messages on the next turn so the raw payload stays in context.

If the model emits the same call twice in a row, we treat that as "the model is spinning" — break out of the loop and surface the raw tool result to the user with a note that the model didn't synthesize an answer. This is a real failure mode and worth catching loudly.

## File reference

- [src/tools/types.ts](../src/tools/types.ts) — `Tool`, `ToolCall`, `ToolInvocation`.
- [src/tools/registry.ts](../src/tools/registry.ts) — `ALL_TOOLS`, `enabledTools`, `findTool`.
- [src/tools/runner.ts](../src/tools/runner.ts) — `runToolCall`.
- [src/tools/openaiSpec.ts](../src/tools/openaiSpec.ts) — `Tool` → `ToolSpec` conversion.
- [src/tools/calculator.ts](../src/tools/calculator.ts), [currentTime.ts](../src/tools/currentTime.ts), [weather.ts](../src/tools/weather.ts), [webSearch.ts](../src/tools/webSearch.ts), [fetchUrl.ts](../src/tools/fetchUrl.ts), [httpRequest.ts](../src/tools/httpRequest.ts) — built-in tools.
- [src/chat/useConversation.ts](../src/chat/useConversation.ts) — the iteration loop.
- [src/config/secrets.example.ts](../src/config/secrets.example.ts) and [secrets.ts](../src/config/secrets.ts) — API key handling.

## Related docs

- [Engine](./engine.md) — the streaming pipeline that delivers tool calls and dedupes partials.
- [Architecture](./architecture.md) — where the tools layer sits.
