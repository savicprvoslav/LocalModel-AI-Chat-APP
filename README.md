# Local Chat

**Private, offline-first AI chat for iOS and Android.**

Local Chat runs real GGUF instruction-tuned models directly on your phone via [llama.rn](https://github.com/mybigday/llama.rn). After the initial model download, chat inference works fully on-device — no accounts, no analytics, and no cloud round-trips for prompts or responses.

It is not just a basic chat wrapper. Local Chat includes personas, reusable skills, local memory, tool calling, SQLite persistence, local search, and experimental RAG over past conversations.

The goal is simple: **a useful mobile AI assistant that keeps your data on your device.**

<p align="center">
  <img height="600" alt="Local model catalog and settings" src="https://github.com/user-attachments/assets/f91a6221-b3b0-429e-b533-33d44ccbba13" />
  <img height="600" alt="Local AI chat conversation" src="https://github.com/user-attachments/assets/0acbb6b4-4c20-4b27-babb-7fcd5d37a3a7" />
  <img height="600" alt="Local and network tools settings" src="https://github.com/user-attachments/assets/8cdcc54a-1ec0-41bb-92be-36d4d60e6d9a" />
  <img height="600" alt="Persona and skill-driven chat workflow" src="https://github.com/user-attachments/assets/67379946-192f-405c-aced-4308eae765d8" />
</p>

<p align="center">
  <sub>Local models · Private chat · Explicit tool controls · Personas and skills</sub>
</p>

> **Status:** Early but functional. Local Chat works end-to-end on development builds with real models. The architecture is stable and well-tested, but the app is not yet App Store / Play Store ready. The remaining rough edges are around model distribution, device compatibility, and platform polish.

---

## Why this exists

Most AI chat apps send your prompts to a cloud provider. That is fine for many use cases, but it is the wrong default for private notes, personal thinking, sensitive work, offline usage, or experimentation with local-first AI.

Local Chat takes the opposite approach:

- **Inference runs on-device**
- **Conversations stay in local SQLite**
- **Network access is explicit**
- **Tools are opt-in**
- **No account is required**
- **No analytics are shipped**

The minimum bar is not “can a tiny model answer a prompt?” The bar is: **can a phone run a useful AI assistant with memory, tools, workflows, and a real mobile UX — while keeping user data local?**

---

## What makes it different

- **Local inference** — prompts and responses stay on the device.
- **Real mobile models** — GGUF 3–4B instruction models selected for phone RAM limits.
- **Offline after download** — chat works without a network connection after the model is installed.
- **Tools, skills, and personas** — not just raw chat; the app supports reusable workflows and behavior profiles.
- **Local memory and retrieval** — past conversations can be searched and retrieved locally.
- **Explicit network boundaries** — only model downloads and opt-in network tools make outbound calls.
- **Open architecture** — engine, tools, RAG, DB, model catalog, and UI are separated by clear boundaries.

---

## Current status

| Area | State |
| --- | --- |
| TypeScript / JS layer | Stable, 133 tests passing across 21 suites |
| iOS development build | Works end-to-end with real models on device |
| iOS simulator | UI works, but real llama.rn inference requires a physical device GPU |
| Android development build | Verified end-to-end on Pixel 10 Pro emulator |
| Real Android device | Not yet verified by the maintainer |
| App Store / TestFlight / Play Store | Not yet ready |

---

## Quick start

### Preview the UI without a real model

The fastest way to try the app is with `fakeEngine`, which simulates streaming responses. This does not require a native build or a local model.

In `src/engine/index.ts`, call `useFakeEngineFor` at module load:

```ts
import { useFakeEngineFor } from '@/engine';

useFakeEngineFor({
  scriptedResponse: 'This is a fake response. The real model runs on your device.',
  delayPerTokenMs: 30
});
```

Then run:

```bash
npm install
npm start
# scan the QR with Expo Go
```

### Run with a real local model

`llama.rn` is a native module, so real inference requires a development build. Expo Go is not enough.

```bash
npm install
npx expo prebuild --clean
npx expo run:ios --device
```

Then open the app, pick a model in First Run, wait for the download, and start chatting.

Model downloads are currently around **1.9–3.2 GB**, depending on the selected model.

---

## Core capabilities

- **On-device inference** via `llama.rn`
  - Metal acceleration on iOS
  - CPU fallback where supported
  - GGUF model loading

- **Native model chat templates**
  - Structured messages are passed through llama.rn's Jinja template path
  - Models use their trained prompt format: Qwen 3 ChatML, Phi-4, Gemma, Llama 3.x

- **Streaming chat UX**
  - Markdown rendering
  - Blinking cursor
  - Abort mid-stream
  - Retry on error
  - Model warmup stages
  - Retrieval peek

- **Personas**
  - Built-in personas: Default, Concise, Coach, Engineer, Editor, Tutor
  - Full CRUD
  - Per-conversation override

- **Skills**
  - Built-in task starters: Summarize, Code Review, Commit Message, Translate, Brainstorm, and more
  - Full CRUD
  - AI-assisted skill drafter for creating new skills

- **Local project memory**
  - Freeform notes
  - Structured `name → description` entities
  - Prepended into the system prompt

- **Local search**
  - FTS5 search across all messages
  - Project breadcrumbs
  - SQLite-backed persistence

- **Experimental local RAG**
  - Hybrid retrieval using embeddings + FTS5
  - Relevant snippets from past conversations are pulled into context
  - Portable module under `src/rag/`

---

## Tools

Tools are off by default. Users enable them in **Settings → Tools** using a master gate plus per-tool toggles.

Network tools require an additional opt-in.

| Tool | Network | Description |
| --- | --- | --- |
| `calculator` | No | Safely evaluates arithmetic expressions |
| `current_time` | No | Returns the current local time |
| `weather` | Yes | Gets current weather via OpenWeatherMap |
| `web_search` | Yes | Gets Google-style results via Serper.dev |
| `fetch_url` | Yes | Downloads and strips readable text from a URL |
| `http_request` | Yes | Executes HTTP GET / HEAD; write methods are gated for future confirmation UI |

API keys for `web_search` and `weather` go in `src/config/secrets.local.ts`, which is gitignored. See `src/config/secrets.example.ts`.

---

## Models

The model catalog lives in [src/model/catalog.ts](src/model/catalog.ts). All entries are GGUF and load through `llama.rn`.

| Tier | Model | Size Q4 | Min RAM | Notes |
| --- | --- | --- | --- | --- |
| Compact | SmolLM3 3B | ~1.9 GB | 3 GB | Fastest cold start; useful fallback |
| Compact | Phi-4-mini Instruct | ~2.5 GB | 4 GB | Best stability / quality balance on iPhone; MIT |
| Standard | Qwen 3 4B | ~2.5 GB | 4 GB | Best tool calling; natively trained on ChatML tools |
| Standard | Gemma 4 E2B | ~3.2 GB | 6 GB | Newest; multimodal-ready model, text-only path here |

Multiple models can coexist on the device. One model is active at a time.

Model files are downloaded directly from Hugging Face.

`sha256` in the catalog is optional for now. When present, the downloader verifies the hash. When absent, it falls back to size validation plus GGUF magic-header sanity checks. See `src/model/download.ts`.

---

## Privacy model

Local Chat is designed around a strict privacy boundary:

- No account required
- No analytics
- No cloud inference
- No network calls for prompts or responses
- Conversations live in a local SQLite database
- “Wipe all data” clears models and resets the database
- Outbound calls happen only for:
  - initial model downloads from Hugging Face
  - explicitly enabled network tools

---

## Architecture

Local Chat uses a layered architecture with hard boundaries between UI, chat orchestration, engine integration, storage, tools, and retrieval.

```txt
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
  rag/                    Portable RAG module: embeddings + FTS5 + entity extraction
  integration/rag.ts      App wiring between RAG, llama.rn, and SQLite
  db/                     SQLite schema, migrations, repositories
  model/                  Catalog, download, resume, sha, storage paths
  ui/                     Theme, components, screens
  config/                 Local secrets loader
```

### Boundary rules

- `llama.rn` is imported only in `src/engine/llamaRnEngine.ts`
- `expo-sqlite` is imported only in `src/db/`
- UI imports engine and DB behavior only through `src/chat/` hooks
- Tool definitions are converted to model-compatible OpenAI-style function specs
- RAG is portable and isolated under `src/rag/`

---

## Documentation

Deep documentation lives in [docs/](./docs/):

- [Architecture](./docs/architecture.md) — structure, boundaries, lifecycle, key patterns
- [Engine](./docs/engine.md) — `llama.rn`, Jinja templates, streaming, reasoning extraction
- [Models](./docs/models.md) — catalog, model selection, GGUF, download flow
- [Tools](./docs/tools.md) — registry, OpenAI-spec conversion, tool-call loop
- [RAG](./docs/rag.md) — hybrid retrieval, FTS5, embeddings, entity extraction
- [Database](./docs/database.md) — SQLite schema, migrations, repository pattern
- [Model Hosting](./docs/MODEL_HOSTING.md) — license review and self-hosting checklist

Start with [docs/architecture.md](./docs/architecture.md) for the high-level tour.

---

## Tests

```bash
npm test           # 133 tests across 21 suites
npm run typecheck  # 0 errors
npm run lint
```

Tests cover:

- engine wiring through `fakeEngine`
- DB repositories and migrations
- model download and storage
- prompt building
- reasoning extraction
- tool registry and tool runner
- RAG layer

UI components are covered through a manual smoke matrix for v1. Component tests are intentionally not included yet.

---

## Known limitations

- **Simulator inference:** `llama.rn` requires a real device GPU. The simulator can run the UI, but model loading fails. Use `fakeEngine` for UI development.
- **Catalog hashes:** bundled catalog entries currently ship without `sha256`. Real shipping builds should fill the hashes.
- **Context window:** currently capped at 4096 tokens per conversation. Phi-4-mini supports 128K natively, but per-conversation context override is not exposed yet.
- **Android emulator:** verified on Pixel 10 Pro AVD with NDK `27.1.12297006`. Set `hw.ramSize` to at least `8192`; the default 2 GB AVD memory will OOM-kill the app during model warmup.
- **Real Android devices:** not yet verified by the maintainer.
- **HTTP write methods:** `http_request` only executes GET / HEAD today. POST / PUT / DELETE / PATCH require a user-confirmation UI before they are enabled.
- **Embedding store:** vectors are JSON-encoded and similarity is computed in JS. This is fine for personal-scale corpora, but larger stores should move to `sqlite-vec`.

---

## Roadmap

Near-term:

- Real Android device validation
- Full catalog `sha256` verification
- TestFlight / internal beta packaging
- Better model compatibility matrix by device RAM
- Confirmation UI for HTTP write methods
- More robust model distribution story

Later:

- Import / export conversations
- Skill sharing
- Custom local model catalog
- Voice input
- Per-conversation context settings
- Native vector search via `sqlite-vec`

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

Bug reports and PRs are welcome, especially around:

- Android device testing
- additional model compatibility
- model download reliability
- tool confirmation UI
- `sqlite-vec` integration
- platform polish

---

## License

MIT — see [LICENSE](./LICENSE).
