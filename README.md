# Local Chat

Private, on-device AI chat for iOS and Android. Runs a local LLM via [llama.rn](https://github.com/mybigday/llama.rn) — fully offline after the initial model download.

Distinctive identity: warm-dark canvas, mono UI chrome, serif AI prose, status-line composer that shows the model running on your device.

## What works right now

The full JavaScript/TypeScript layer is implemented and tested:

- 7 screens (FirstRun, ConversationList, Conversation, ProjectDetail, Settings, Personas/PersonaEdit, Skills/SkillEdit, Search) wired via Expo Router
- Engine abstraction with a `fakeEngine` (scripted streams) and a production `llamaRnEngine`
- SQLite persistence: projects, conversations, messages, settings, personas, skills, project_entities — schema v3 with migrations
- Multi-model catalog (Compact 1B, Standard 3B, Capable 7B), simultaneous installs, switch-active flow
- Streaming chat with stop, error, cancelled finish reasons
- **Personas** — six built-in (Default, Concise, Coach, Engineer, Editor, Tutor) with full CRUD; per-conversation override via header pill
- **Skills** — twelve built-in task starters with full CRUD; horizontal chip strip on home screen
- **Project memory** — freeform notes + structured entities (`name → description`)
- **Conversation polish**: auto-title from first message, long-press menu (rename, move-to-project, delete), overflow menu (rename, edit system prompt, export to Markdown, clear history, delete), action sheet
- **Local FTS5 search** across all messages, with snippets and project/conversation breadcrumbs
- **Settings sliders** for temperature, max-tokens, context-window
- **Device RAM detection** in FirstRun via `react-native-device-info`
- **Error boundary** at the root — no more red boxes
- Theme system (warm-dark hero + warm-light adapt), typography, all visual components
- Markdown rendering with code blocks, blinking streaming cursor, status-line states (warming/streaming/error/ctxFull)
- **AI tools**: calculator, current time, search across past chats, and an opt-in DuckDuckGo web search. Off by default; configured in Settings → Tools. The model emits a `<tool_call>` block, the app runs it locally, and feeds the result back for a second pass.
- **117 tests passing** across engine, db, model, chat, tools, and search layers

## What still needs you

The native side requires your account credentials, which I can't authenticate for you:

- [ ] `eas login` (Expo account)
- [ ] First `eas build --profile development` for iOS or Android (~25 min on Expo's cloud)
- [ ] Apple Developer / Google Play Console interaction if you want TestFlight / Play distribution
- [ ] First on-device verification of llama.rn with a real model
- [ ] Real SHA-256 hashes in `src/model/catalog.ts` (currently placeholders, downloads run with `skipShaCheck: true`)

Step-by-step in [`MORNING.md`](./MORNING.md).

## Quick start

```bash
eas login
eas build --profile development --platform ios
# wait ~25 min, install the .ipa it produces (drag onto device in Finder, or scan QR from EAS dashboard)
npx expo start --dev-client
```

```bash
npm install                              # .npmrc sets legacy-peer-deps=true automatically
npm test                                 # 59 tests pass
npm run typecheck                        # 0 errors
npm start                                # open Metro bundler

# To run in iOS simulator with native modules:
npx expo prebuild --clean
npx expo run:ios
npx expo run:ios --configuration Release --device

# To run in Android emulator with native modules:
npx expo run:android

# Or with EAS dev build (recommended for real model on device):
npm install -g eas-cli
eas login
eas build --profile development --platform ios
# install the resulting .ipa on your device, then:
npx expo start --dev-client
```

## Try it without a real model

The `fakeEngine` simulates streaming, so the UI is fully usable in Expo Go (no native build).
To switch to the fake engine, edit [src/engine/index.ts](src/engine/index.ts) and call
`useFakeEngineFor(...)` at module load:

```ts
import { useFakeEngineFor } from '@/engine';
useFakeEngineFor({
  scriptedResponse: 'This is a fake response. The real model runs on your device.',
  delayPerTokenMs: 30
});
```

Then `npm start` and scan the QR with Expo Go (iOS / Android). You'll get the full UI streaming a
scripted reply.

## Architecture

See [docs/superpowers/specs/2026-04-25-local-llm-chat-app-design.md](docs/superpowers/specs/2026-04-25-local-llm-chat-app-design.md).

```
app/                      Expo Router routes (file-based)
  index.tsx               first-run gate → ConversationList
  first-run.tsx           model picker
  conversation/[id].tsx
  project/[id].tsx
  settings.tsx
  personas.tsx, persona/[id].tsx
  skills.tsx, skill/[id].tsx
  search.tsx
  _layout.tsx             root layout with providers + ErrorBoundary

src/
  engine/                 ChatEngine interface + fakeEngine + llamaRnEngine
  tools/                  Tool registry, parser, and built-in tools
  db/
    schema.ts             v3 schema + incremental migrations
    db.ts                 connection, init, in-memory test DB
    seeds.ts              built-in personas + skills
    projects.ts, conversations.ts, messages.ts, settings.ts
    personas.ts, skills.ts, projectEntities.ts
    search.ts             FTS5 query
  model/                  Catalog (3 models), storage, download with resume + SHA
  chat/                   promptBuilder, useConversation hook
  ui/
    theme/                tokens, typography, ThemeProvider
    components/           StatusLine, Composer, MessageBubble, ModelCard,
                          StepSlider, ErrorBoundary, …
    screens/              the eight screens
  device.ts               device RAM detection
  haptics.ts              expo-haptics wrapper
  providers.tsx           composes ErrorBoundary + SafeAreaProvider + ThemeProvider + DB init

__mocks__/                jest mocks for expo-sqlite, expo-crypto, expo-file-system
docs/superpowers/         design spec + plan
```

### Boundary rules

- `import 'llama.rn'` only in [src/engine/llamaRnEngine.ts](src/engine/llamaRnEngine.ts).
- `import 'expo-sqlite'` only in [src/db/](src/db/).
- UI never imports the engine or DB directly — only via [src/chat/](src/chat/) hooks.

## Catalog (curated, build-time)

| Tier     | Model                        | Size     | Min RAM | Good for                                    |
| -------- | ---------------------------- | -------- | ------- | ------------------------------------------- |
| Compact  | Llama 3.2 1B Instruct (Q4)   | ~0.7 GB  | 4 GB    | quick answers, low-end devices              |
| Standard | Llama 3.2 3B Instruct (Q4)   | ~2.0 GB  | 6 GB    | balanced default                            |
| Capable  | Qwen 2.5 7B Instruct (Q4)    | ~4.5 GB  | 10 GB   | highest quality, top devices only           |

All three may be installed simultaneously; one is active at a time. SHA-256 hashes in [src/model/catalog.ts](src/model/catalog.ts) are placeholders — see `MORNING.md` for how to fill them in.

## Built-in personas (6)

`Default`, `Concise`, `Coach`, `Engineer`, `Editor`, `Tutor`. Each has its own system prompt, description, and default temperature. Editable via Settings → Personas. The active default is used for any conversation that doesn't explicitly override it. Per-conversation, tap the persona pill in the header to switch.

## Built-in skills (12)

`Summarize`, `Explain like I'm 5`, `Code review`, `Commit message`, `Translate`, `Brainstorm`, `Outline`, `Critique`, `Counter-argument`, `Rewrite`, `Email draft`, `Decision matrix`. Each preconfigures a conversation with a system prompt, default persona, temperature, starter text, and placeholder. Tap a chip on the home screen to start. Editable / duplicable via Settings → Skills.

## Tests

```bash
npm test                                 # all 59
npx jest src/engine                      # engine
npx jest src/db                          # db repos + search
npx jest src/model                       # model layer
npx jest src/chat                        # promptBuilder
```

Pure logic. Component tests are intentionally skipped for v1 (covered by the manual smoke matrix in `MORNING.md`).

## Privacy

- No analytics, no crash reporting that ships content. Crash counters okay; message text never.
- The only outbound HTTP calls are (a) downloading a GGUF model from Hugging Face, and (b) — only if you turn on the optional **Web search** tool — DuckDuckGo's instant-answer API. Tools are off by default and the master gate has to be flipped before any tool runs.
- "WIPE ALL DATA" in Settings deletes installed models + clears settings. The SQLite DB is small enough that wiping the app reinstalls cleanly.
