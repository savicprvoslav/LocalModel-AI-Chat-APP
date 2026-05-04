# Local Chat

Private, on-device AI chat for iOS (Android in progress). Runs a local LLM via [llama.rn](https://github.com/mybigday/llama.rn) — fully offline after the initial model download. No accounts, no analytics, no cloud round-trips for inference.

> **Status:** early. Works end-to-end on a development build with real models, but not yet App-Store-ready. The codebase is well-tested and the architecture is stable; the rough edges are around model distribution and platform polish.

## Why

Most chat apps either send your prompts to a cloud provider (OpenAI, Anthropic, Google) or run a stripped-down model in the browser. This one runs full GGUF instruction-tuned models (3–4B parameters) directly on the iOS GPU via Metal, with all conversation data persisted in a local SQLite database that never leaves the device.

The minimum bar is: useful chat experience, sensible models that fit on a phone, and zero outbound network calls unless you explicitly opt in to a tool that needs one.

## Features

- **On-device inference** via llama.rn (Metal-accelerated on iOS, CPU fallback)
- **Native chat templates** — the engine passes structured messages through llama.rn's Jinja path, so each model uses its trained format (Qwen 3 ChatML, Phi-4, Gemma 4, Llama 3.x)
- **Native tool calling** — OpenAI-compatible function specs rendered by each model's template; built-in tools include calculator, current time, weather, web search (Serper), URL fetch, and generic HTTP GET/HEAD
- **Reasoning support** — handles `<think>` blocks (Qwen 3, DeepSeek R1) and Harmony channels (`<|channel|>thought` / `final`); the chat shows the answer and exposes thinking behind a disclosure
- **Personas** — six built-in (Default, Concise, Coach, Engineer, Editor, Tutor), full CRUD, per-conversation override
- **Skills** — twelve built-in task starters (Summarize, Code review, Commit message, Translate, Brainstorm, …) with full CRUD; AI-assisted skill drafter for creating new ones
- **Project memory** — freeform notes plus structured `name → description` entities prepended to the system prompt
- **Retrieval (RAG)** — embeddings + FTS5 hybrid retrieval pulls relevant snippets from past conversations; portable module under `src/rag/`
- **Streaming UX** — markdown rendering, blinking cursor, warming-log stages during model load, retrieval peek, retry-on-error, abort mid-stream
- **Local FTS5 search** across all messages with project breadcrumbs
- **Auto-titling** of conversations from the first message
- **Settings**: temperature, max-tokens, context-window, retrieval on/off, tools master gate + per-tool toggles
- **Themed** — warm-dark canvas, mono UI chrome, serif AI prose; light variant

## Status

| Area | State |
| --- | --- |
| TypeScript / JS layer | Stable, 133 tests passing across 21 suites |
| iOS development build | Works end-to-end with real models on device |
| iOS simulator | Boots and runs UI, but llama.rn requires real device GPU — use `fakeEngine` for simulator |
| Android | Native build configured; not yet exercised in real-device testing |
| App Store / TestFlight | Not yet — see [Known limitations](#known-limitations) |

## Try it without a real model

The fastest way to see the UI is via the `fakeEngine`, which simulates streaming. No native build required.

In `src/engine/index.ts`, call `useFakeEngineFor` at module load:

```ts
import { useFakeEngineFor } from '@/engine';
useFakeEngineFor({
  scriptedResponse: 'This is a fake response. The real model runs on your device.',
  delayPerTokenMs: 30
});
```

Then:

```bash
npm install
npm start
# scan the QR with Expo Go
```

## Run with a real model (development build)

llama.rn is a native module, so it requires a development build (Expo Go is not enough).

```bash
npm install
npx expo prebuild --clean
npx expo run:ios --device      # connect a real iOS device
```

In the app, pick a model in FirstRun, wait for the download (1.9–3.2 GB depending on the model), and start chatting.

## Models

The catalog lives in [src/model/catalog.ts](src/model/catalog.ts). All entries are GGUF and load through llama.rn.

| Tier | Model | Size (Q4) | Min RAM | Notes |
| --- | --- | --- | --- | --- |
| Compact | SmolLM3 3B | ~1.9 GB | 3 GB | Fastest cold-start, decent fallback |
| Compact | Phi-4-mini Instruct | ~2.5 GB | 4 GB | Best stability/quality on iPhone, MIT |
| Standard | Qwen 3 4B | ~2.5 GB | 4 GB | Best tool calling — natively trained on ChatML tools |
| Standard | Gemma 4 E2B | ~3.2 GB | 6 GB | Newest, multimodal-ready (text-only path here) |

Multiple models can coexist on the device; one is active at a time. Model files are downloaded directly from HuggingFace.

`sha256` in the catalog is optional. When present, the downloader verifies the hash; when absent, it falls back to size + GGUF magic-header sanity checks. See `src/model/download.ts`.

## Tools

Tools are off by default. Turn them on in Settings → Tools (master gate + per-tool toggles). Network tools require an extra opt-in.

| Tool | Network | What it does |
| --- | --- | --- |
| `calculator` | no | Evaluate arithmetic expressions safely |
| `current_time` | no | Return the current local time |
| `weather` | yes | Current weather via OpenWeatherMap (free tier) |
| `web_search` | yes | Google results via Serper.dev |
| `fetch_url` | yes | Download and strip readable text from a URL |
| `http_request` | yes | Generic HTTP GET/HEAD (write methods gated for future confirmation UI) |

API keys for `web_search` and `weather` go in `src/config/secrets.local.ts` (gitignored). See `src/config/secrets.example.ts` for the shape.

## Architecture

```
app/                      Expo Router routes
src/
  engine/                 ChatEngine interface + fakeEngine + llamaRnEngine
    types.ts              ChatMessage, ToolSpec, ToolCallEvent, StreamCallbacks
    llamaRnEngine.ts      Production engine; native tool calls via Jinja templates
    fakeEngine.ts         Scripted streams for tests + simulator demos
  chat/
    promptBuilder.ts      buildMessages — context-budget eviction, system layering
    reasoning.ts          stripReasoning / extractReasoning for <think> + Harmony
    useConversation.ts    Streaming hook; tool-call iteration loop
    baseSystemPrompt.ts   Layer underneath every persona
  tools/                  Registry, runner, OpenAI spec converter, built-in tools
  rag/                    Portable RAG module (embeddings + FTS5 + entity extraction)
  integration/rag.ts      App-side wiring of the RAG module to llama.rn + SQLite
  db/                     SQLite schema (v7) + migrations + repos
  model/                  Catalog, download (resume + sha), storage paths
  ui/                     Theme, components, screens
  config/                 Local secrets loader
```

### Boundary rules

- `import 'llama.rn'` only in `src/engine/llamaRnEngine.ts`
- `import 'expo-sqlite'` only in `src/db/`
- UI imports the engine and DB only via `src/chat/` hooks

## Privacy

- No analytics, no crash reporting that ships content
- No network calls for inference — everything runs on-device
- Outbound calls happen only for: (a) initial model download from HuggingFace, (b) tools you explicitly enable
- Conversations live in a local SQLite database; "Wipe all data" in Settings clears models and resets the DB

## Tests

```bash
npm test           # 133 tests across 21 suites
npm run typecheck  # 0 errors
npm run lint
```

Tests cover engine wiring (against `fakeEngine`), DB repos + migrations, model download/storage, prompt building + reasoning extraction, tool registry/runner, and the RAG layer. UI components are covered by the manual smoke matrix; component tests are intentionally not included for v1.

## Known limitations

- **Simulator caveat:** llama.rn requires a real device GPU. The simulator boots the UI but model load fails. Use `fakeEngine` to develop UI flows.
- **Catalog hashes:** the bundled catalog ships without `sha256` for now. The downloader falls back to size + GGUF magic-header validation. Real shipping builds should fill the hashes in.
- **Context window:** capped at 4096 tokens per conversation. Phi-4-mini supports 128K natively but we don't yet expose a per-conversation context override.
- **Android:** the native build is configured but not exercised in real-device testing. Bug reports welcome.
- **HTTP write methods:** `http_request` only executes GET / HEAD today. POST / PUT / DELETE / PATCH need a user-confirmation UI before they're enabled.
- **Embedding store:** vectors are JSON-encoded and similarity is computed in JS. Fast enough for personal-scale corpora; would need `sqlite-vec` for thousands+ messages.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Bug reports and PRs welcome — especially around Android polish, additional models, and the confirmation UI for write-method HTTP.

## License

MIT — see [LICENSE](./LICENSE).
