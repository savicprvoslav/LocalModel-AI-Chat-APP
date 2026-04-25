# Local Chat

Private, on-device AI chat for iOS and Android. Runs a local LLM via [llama.rn](https://github.com/mybigday/llama.rn) — fully offline after the initial model download.

Distinctive identity: warm-dark canvas, mono UI chrome, serif AI prose, status-line composer that shows the model running on your device.

## What works right now

The full JavaScript layer is implemented and tested:

- 5 screens (FirstRun, ConversationList, Conversation, ProjectDetail, Settings) wired via Expo Router
- Engine abstraction with a `fakeEngine` (scripted streams) and a production `llamaRnEngine`
- SQLite persistence: projects, conversations, messages, settings
- Multi-model catalog (Compact 1B, Standard 3B, Capable 7B), simultaneous installs, switch-active flow
- Streaming chat with stop, error, cancelled finish reasons
- Project notes prepended to system prompt for cross-conversation memory
- Theme system (dark hero + light adapt), typography, all visual components
- 36 tests passing across engine, db, model, and chat layers

## What still needs you

The native side requires your account credentials, which I can't authenticate for you:

- [ ] `eas login` (Expo account)
- [ ] First `eas build --profile development` for iOS or Android (~25 min on Expo's cloud)
- [ ] Apple Developer / Google Play Console interaction if you want TestFlight / Play distribution
- [ ] First on-device verification of llama.rn with a real model

Step-by-step in [`MORNING.md`](./MORNING.md).

## Quick start

```bash
npm install --legacy-peer-deps          # already done; rerun if you wipe node_modules
npm test                                 # 36 tests pass
npm run typecheck                        # 0 errors
npm start                                # open Metro bundler

# To run in iOS simulator with native modules:
npx expo prebuild --clean
npx expo run:ios

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
To switch to the fake engine, edit [src/engine/index.ts](src/engine/index.ts) and uncomment the
last block, or run with this snippet in `app/_layout.tsx` (already left as a comment):

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
app/                      Expo Router screens (file-based routing)
  index.tsx               first-run gate → ConversationList
  first-run.tsx           model picker
  conversation/[id].tsx
  project/[id].tsx
  settings.tsx
  _layout.tsx             root layout with providers

src/
  engine/                 ChatEngine interface + fakeEngine + llamaRnEngine
  db/                     SQLite repos (projects, conversations, messages, settings)
  model/                  Catalog (3 models), storage, download with resume + SHA
  chat/                   promptBuilder, useConversation hook
  ui/
    theme/                tokens, typography, ThemeProvider
    components/           StatusLine, Composer, MessageBubble, ModelCard, …
    screens/              the five screens
  providers.tsx           composes ThemeProvider + DB init
  haptics.ts              expo-haptics wrapper

__mocks__/                jest mocks for expo-sqlite, expo-crypto, expo-file-system
docs/superpowers/         design spec + this plan
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

## Tests

```bash
npm test                                 # all
npx jest src/engine                      # engine only
npx jest src/db                          # db repos
npx jest src/model                       # model catalog + storage + download
npx jest src/chat                        # promptBuilder
```

Pure logic. Component tests are intentionally skipped for v1 (covered by the manual smoke matrix in `MORNING.md`).

## Privacy

- No analytics, no crash reporting that ships content. Crash counters okay; message text never.
- The only outbound HTTP call is downloading a GGUF model from Hugging Face. After that, the app makes zero network calls.
- "WIPE ALL DATA" in Settings deletes installed models + clears settings. The SQLite DB is small enough that wiping the app reinstalls cleanly.
