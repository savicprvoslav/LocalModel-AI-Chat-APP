# Morning runbook

What was built overnight, what to do next, and known caveats.

## What's done

- Full Expo + React Native + TypeScript codebase, scaffolded and committed
- Engine abstraction (`fakeEngine` + `llamaRnEngine`, only the latter touches `llama.rn`)
- SQLite persistence with 4 repos and 18 tests
- Multi-model catalog (Compact 1B / Standard 3B / Capable 7B) with download + storage
- Chat orchestration: `promptBuilder` (TDD, 6 tests) + `useConversation` hook
- All 5 screens wired via Expo Router
- Visual design system: warm-dark dark/light tokens, mono+serif type, status-line composer
- 36 tests passing, 0 TypeScript errors
- Plan + spec + this runbook committed under `docs/superpowers/`

Browse the spec: [docs/superpowers/specs/2026-04-25-local-llm-chat-app-design.md](./docs/superpowers/specs/2026-04-25-local-llm-chat-app-design.md)
Browse the plan: [docs/superpowers/plans/2026-04-25-local-llm-chat-app.md](./docs/superpowers/plans/2026-04-25-local-llm-chat-app.md)

## Try it in Expo Go (no native build, fakeEngine path)

Fastest way to feel the UI streaming on your phone in ~2 minutes.

```bash
# 1. Switch to fakeEngine — open src/engine/index.ts and add this near the top:
#    import { useFakeEngineFor } from '@/engine';
#    useFakeEngineFor({ scriptedResponse: 'A fake reply, streaming token by token.', delayPerTokenMs: 30 });
#
#    Or set the active_model_id manually via the FirstRun → Download flow (will fail
#    in Expo Go because llama.rn isn't built; that's fine — the UI exercises everything else).

# 2. Start Metro
npm start

# 3. Scan the QR with Expo Go (iOS / Android)
```

You'll see the FirstRun screen → model picker → on tap, it'll attempt to download. To skip download in Expo Go testing, you can pre-populate `active_model_id` by editing `src/engine/index.ts` to use fakeEngine and writing the setting on app launch. Or just use the next path.

## Run in iOS simulator with the real codebase

```bash
npx expo prebuild --clean       # generates ios/ + android/ from app.json
npx expo run:ios                # builds and launches in iOS simulator (~5–10 min first time)
```

The simulator will boot the FirstRun screen. You can pick a model and start a download — but
**llama.rn won't actually load a model in the simulator** (it requires real device GPU). So
expect: download succeeds → message send → engine load fails.

For real inference: build for a physical device.

## Real device with a real model — EAS dev build

```bash
npm install -g eas-cli
eas login                        # uses your Expo account
eas build --profile development --platform ios
# wait ~25 min, install the .ipa on device

# then on your laptop:
npx expo start --dev-client      # open the dev client app on device, scan QR
```

First send → model loads (~5s warm) → real streaming local LLM. That's the v1 promise.

## Caveats & TODOs

### 1. SHA-256 hashes are placeholders

`src/model/catalog.ts` ships with `'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP'`. Currently the
`FirstRunScreen` and `SettingsScreen` call `downloadModel(...)` with `skipShaCheck: true`, so
this works in dev. To verify integrity for production:

```bash
# Download once on a desktop:
curl -L 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf' -o m.gguf
shasum -a 256 m.gguf
# Paste the result into the corresponding catalog entry's sha256 field.
# Then flip skipShaCheck to false in FirstRunScreen + SettingsScreen.
```

The on-device SHA verification reads the whole file via base64, which takes ~30s for a 2GB
file. For internal/dev builds, leaving it skipped is fine.

### 2. llama.rn requires a development build, not Expo Go

Expo Go ships a fixed set of native modules. `llama.rn` isn't one of them. The codebase is
written so that production code works in a dev build; tests use `fakeEngine`; if the user
opens the app in Expo Go, model loading will fail at runtime (with a clean error message)
but the UI is fully usable.

### 3. expo-file-system uses the legacy API

I imported from `expo-file-system/legacy` because the SDK 19 default is the new "next" API
which has a different shape (`File` class, etc.). The legacy export still works and matches
the older `documentDirectory` / `createDownloadResumable` / `getInfoAsync` API the code
expects. If you upgrade to SDK 55+ and the legacy export is removed, migrate `src/model/`.

### 4. Tablet / landscape

Out of scope. Phone portrait only. The KeyboardAvoidingView and FlatList layout assume a
single-column 360–430pt-wide canvas.

### 5. Component / E2E tests intentionally skipped

The plan opted for unit tests on pure logic + a manual smoke matrix. The 36 tests cover
engine, db, model, and promptBuilder. UI is best validated visually on a device or simulator.

## Manual smoke matrix (run after `npx expo run:ios`)

- [ ] Cold launch → FirstRun shown
- [ ] Pick a model → tap Download → progress shows (will likely fail in simulator without internet; that's OK for verifying UI)
- [ ] Force-bypass FirstRun by setting `active_model_id` directly: open Settings during dev mode and use the "WIPE ALL DATA" → reset cycle, or edit `app/index.tsx` to skip the gate
- [ ] (with fakeEngine) Send a message → streaming bubble with blinking cursor
- [ ] Tap Stop mid-stream → message shows "stopped" finish reason
- [ ] Open Settings → all sections render → DOWNLOAD / SET ACTIVE / DELETE actions appear correctly per row
- [ ] Create a project → set notes → start a new conversation in it → notes prepend to system prompt
- [ ] Long messages: send 10+ turns → context window budgeting drops oldest pair correctly

## Where the code is

```
36 tests, 0 typescript errors
~3,800 lines of source code across 35 source files
```

- Engine: [src/engine/](src/engine/)
- Database: [src/db/](src/db/)
- Model: [src/model/](src/model/)
- Chat: [src/chat/](src/chat/)
- UI: [src/ui/](src/ui/)
- Routes: [app/](app/)
- Tests: `**/__tests__/`
- Mocks: [__mocks__/](__mocks__/)

## Git history

The build is split into small commits along the phase boundaries:

```
git log --oneline
```

You'll see:
- `chore: scaffold expo project with strict typescript, jest, eslint`
- `feat(theme): color tokens, typography, and ThemeProvider`
- `feat(engine): types, fakeEngine (TDD), llama.rn wrapper, factory`
- `feat(db): schema, connection, 4 repos with TDD coverage`
- `feat(model): catalog, storage, and download with progress + sha + resume`
- `feat(chat): promptBuilder (TDD) and useConversation hook`
- `feat(ui): components — MetaLine, StreamingCursor, ProjectPill, ScreenHeader, MessageBubble, StatusLine, Composer, ModelCard`
- `feat(screens): FirstRun, ConversationList, Conversation, ProjectDetail, Settings`
- `feat(app): expo router root layout, providers, and 5 routes`
- `docs: README and morning runbook`

Easy to revert any single phase without losing the others.
