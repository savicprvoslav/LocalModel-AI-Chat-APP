# Runbook

What's been built, what's next, and the known caveats.

## Current state

- Full Expo + RN + TypeScript codebase, **iOS simulator boots and runs end-to-end with `fakeEngine`**
- Schema **v3** (projects, conversations, messages, settings, personas, skills, project_entities, messages_fts)
- 4 SQLite repos + personas + skills + entities + search → **8 repo modules**, all incremental migrations covered
- Multi-model catalog (Compact 1B / Standard 3B / Capable 7B) with download + storage + resume + SHA verify
- Chat orchestration: `promptBuilder` (assembles persona + project + entities + conversation + history under context budget) + `useConversation` hook with auto-titling
- 8 screens wired via Expo Router with safe-area handling
- Visual design system: warm-dark dark/light tokens, mono+serif type, status-line composer with 6 states, blinking streaming cursor
- Personas (6 built-ins, full CRUD, per-conversation switch) + Skills (12 built-ins, full CRUD, home-screen chip strip)
- Project entities (structured `name → description` rows scoped per project, prepended to system prompt)
- FTS5 message search with snippets and project breadcrumbs
- Conversation overflow menu: Rename / Edit system prompt / Export to Markdown / Clear history / Delete
- Settings sliders: temperature, max-tokens, context-window
- Device RAM detection, haptics, error boundary
- **59 tests passing, 0 TypeScript errors**

Browse the spec: [docs/superpowers/specs/2026-04-25-local-llm-chat-app-design.md](./docs/superpowers/specs/2026-04-25-local-llm-chat-app-design.md)
Browse the original plan: [docs/superpowers/plans/2026-04-25-local-llm-chat-app.md](./docs/superpowers/plans/2026-04-25-local-llm-chat-app.md)

## Try it now (no native build needed)

Fastest path — see the UI streaming a fake reply in Expo Go:

1. Edit `src/engine/index.ts` to call `useFakeEngineFor({ scriptedResponse: 'A fake reply, streaming token by token.', delayPerTokenMs: 30 })` at module load
2. `npm start` and scan the QR with Expo Go
3. The download flow will fail (Expo Go doesn't ship `llama.rn`), but you can short-circuit FirstRun by editing `app/index.tsx` to skip the gate temporarily

## Run in iOS simulator with the real codebase

```bash
npx expo prebuild --clean       # regenerates ios/ + android/ from app.json
npx expo run:ios                # builds and launches in iOS simulator
```

The simulator boots the FirstRun screen. You can pick a model and start a download, but **llama.rn won't actually load a model in the simulator** — it requires real device GPU/Metal. So expect: download succeeds → message send → engine load fails.

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

## Caveats

### 1. SHA-256 hashes are placeholders

`src/model/catalog.ts` ships with `'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP'`. Currently the
download flow runs with `skipShaCheck: true`, so this works in dev. To verify integrity for
production:

```bash
# Download once on a desktop:
curl -L 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf' -o m.gguf
shasum -a 256 m.gguf
# Paste the result into the corresponding catalog entry's sha256 field.
# Then flip skipShaCheck to false in FirstRunScreen + SettingsScreen.
```

The on-device SHA verification reads the whole file via base64, which takes ~30s for a 2 GB
file. For internal/dev builds, leaving it skipped is fine.

### 2. llama.rn requires a development build, not Expo Go

Expo Go ships a fixed set of native modules. `llama.rn` isn't one of them. The codebase is
written so production code works in a dev build; tests use `fakeEngine`; if the user opens the
app in Expo Go, model loading fails at runtime (with a clean error message) but the UI is
fully usable.

### 3. expo-file-system uses the legacy API

I imported from `expo-file-system/legacy` because the SDK 54 default is the new "next" API
which has a different shape. The legacy export still works and matches the older
`documentDirectory` / `createDownloadResumable` / `getInfoAsync` API the code expects. If you
upgrade to a future SDK and the legacy export is removed, migrate `src/model/`.

### 4. Tablet / landscape

Out of scope. Phone portrait only. Layout assumes a single-column 360–430pt-wide canvas.

### 5. Component tests intentionally skipped

The plan opted for unit tests on pure logic + a manual smoke matrix. The 59 tests cover
engine, db, model, search, and promptBuilder. UI is best validated on a device or simulator.

### 6. Android Alert.prompt fallback

`Alert.prompt` is iOS-only. On Android, "Rename" actions fall back to a hint that the user
should rename via the conversation header. A themed bottom-sheet modal would unify this; left
for v1.6.

## Manual smoke matrix (run after `npx expo run:ios`)

- [ ] Cold launch → FirstRun shown
- [ ] Pick a model → tap Download → progress shows
- [ ] After download, ConversationList shown with skill chips strip
- [ ] Tap a skill chip → new conversation pre-configured (persona pill + skill pill in header, starter text in composer if any, keyboard auto-focused)
- [ ] Send a message → streaming bubble with blinking cursor
- [ ] First message auto-titles the conversation
- [ ] Tap Stop mid-stream → message shows "stopped"
- [ ] Tap persona pill → action sheet with all personas → switch → next send uses new persona
- [ ] Long-press a conversation in the list → Rename / Move / Delete sheet
- [ ] Tap `⋯` on conversation header → full overflow menu (Rename / Edit prompt / Export / Clear / Delete)
- [ ] Tap Export → native share sheet with Markdown
- [ ] Open Settings → Personas → edit one → changes persist
- [ ] Open Settings → Skills → duplicate a built-in → new custom skill appears
- [ ] Open a Project → add an entity → next conversation in that project sees the entity in its prompt
- [ ] Open Search → type a word → see snippet matches with highlights, tap to jump to conversation
- [ ] Settings → Generation sliders → adjust temperature, max-tokens, context-window
- [ ] Force-quit during download → resume on relaunch
- [ ] Wipe data → re-download

## Where the code is

```
59 tests, 0 typescript errors
```

- Engine: [src/engine/](src/engine/)
- Database: [src/db/](src/db/) (8 repos: projects, conversations, messages, settings, personas, skills, projectEntities, search)
- Model: [src/model/](src/model/)
- Chat: [src/chat/](src/chat/)
- UI: [src/ui/](src/ui/)
- Routes: [app/](app/)
- Tests: `**/__tests__/`
- Mocks: [__mocks__/](__mocks__/)

## What's left for v2 (not in scope here)

- Real device verification of llama.rn (you only — needs your iPhone + EAS auth)
- Auto-extracted entities (run a small extraction prompt after each conversation; gate on real model quality)
- Local RAG with `sqlite-vec` + embedding model
- Cloud fallback (BYO API key) for higher-quality analysis on non-sensitive content
- BYO GGUF URL — let users add custom models
- Voice input / transcription
- Themed bottom-sheet modal to replace `Alert.prompt` on Android
