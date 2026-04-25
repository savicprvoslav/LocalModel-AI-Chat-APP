# Local LLM Chat App — Design Spec

**Date:** 2026-04-25
**Status:** Draft, awaiting user review

## 1. Product summary

A cross-platform mobile chat app that runs a local LLM on-device. Fully offline after first-run model download. Conversations are grouped into projects, and each project has user-written notes that are prepended to every conversation in it as context (e.g., "Tom is the backend lead on Acme, worried about Q4 timeline").

**One sentence:** A private, on-device chat app that remembers what you tell it about your projects.

**Wedge promise:** Open the app, ask anything, get an answer. No internet required, no account, no cloud.

## 2. Scope

### In scope (v1)

- iOS + Android via Expo with custom dev client.
- Curated catalog of three models (Compact 1B, Standard 3B, Capable 7B). Multiple may be installed simultaneously; exactly one is active at a time. User picks the default at first launch.
- Multi-conversation chat with streaming, markdown, code blocks, copy, stop, regenerate.
- Per-conversation system prompt; app-wide default system prompt.
- Projects: group conversations, free-text "project notes" prepended to system prompt.
- Settings: temperature, max tokens, context window, theme, default system prompt, re-download model, wipe data.
- Local persistence (SQLite) for projects, conversations, messages, settings.
- Distinctive visual identity: warm-dark hero with mono UI + serif AI prose.

### Out of scope (v1)

- Embeddings / RAG / semantic search (deferred to v1.5).
- Auto-extracted memory / fact extraction.
- Cloud fallback or BYO API key.
- User-supplied models (BYO GGUF URL or sideloaded GGUF). The catalog is curated for v1.
- Voice input / audio recording / transcription.
- Document upload / file ingestion.
- Tablet / landscape / split-view layouts.
- Sync, accounts, team features.
- Tags, archive, pinning, multi-select.

## 3. Architecture

### 3.1 Module structure

```
src/
  engine/                  # inference layer (only file that imports llama.rn)
    types.ts               # ChatEngine interface, Token, GenerationOptions
    llamaRnEngine.ts       # production impl wrapping llama.rn
    fakeEngine.ts          # in-memory fake for tests/dev
    index.ts               # exports active engine

  model/                   # model file management
    download.ts            # download with progress, resume, integrity check
    storage.ts             # paths, exists checks, delete
    catalog.ts             # static list: { id, url, sha256, sizeMB, contextLen }

  db/                      # persistence (only layer that talks to SQLite)
    schema.ts              # tables + migrations
    projects.ts            # repo: create, rename, delete, update notes
    conversations.ts       # repo: list, create, rename, delete, move
    messages.ts            # repo: append, list by conversation, update on stream
    settings.ts            # key/value store

  chat/                    # orchestration (engine + db together)
    useConversation.ts     # hook: load history, send, stream, cancel, persist
    promptBuilder.ts       # turns context into model input

  ui/
    screens/               # FirstRun, ConversationList, Conversation, ProjectDetail, Settings
    components/            # MessageBubble, Composer, StatusLine, StreamingCursor, etc.
    theme/                 # tokens, dark/light values, typography scale

  app/
    navigation.tsx         # Expo Router (file-based routing)
    providers.tsx          # engine provider, db provider, theme provider
```

### 3.2 Boundary rules

- Only `engine/llamaRnEngine.ts` imports `llama.rn`. Nothing else.
- Only `db/*` imports `expo-sqlite`. Nothing else.
- `chat/` is the only layer that knows both engine and db. UI consumes `chat/` hooks.
- `model/` knows nothing about engine or db — pure file management.
- `ui/` knows nothing about llama.rn or SQLite directly.

This means: swapping llama.rn for `react-native-executorch` later = rewrite one file. Adding cloud fallback = add a new engine impl. Mocking for tests = use `fakeEngine`.

### 3.3 Tech stack

| Concern | Choice |
|---|---|
| App framework | Expo (custom dev client, EAS Build) |
| UI framework | React Native |
| LLM runtime | `llama.rn` (binds llama.cpp on iOS + Android) |
| Persistence | `expo-sqlite` |
| Markdown rendering | `react-native-markdown-display` |
| Navigation | Expo Router (file-based, modern Expo default) |
| Type checking | TypeScript, strict mode |
| Testing | Jest + React Native Testing Library, against `fakeEngine` |

### 3.4 Model catalog

The catalog is a static list defined in `model/catalog.ts`. It cannot be edited by the user in v1.

| Tier | id | Model | Quant | Size | Context (configured) | Min device |
|---|---|---|---|---|---|---|
| Compact | `llama-3.2-1b-q4` | Llama 3.2 1B Instruct | Q4_K_M | ~0.7 GB | 4096 | most modern phones (≥4 GB RAM) |
| Standard | `llama-3.2-3b-q4` | Llama 3.2 3B Instruct | Q4_K_M | ~2.0 GB | 4096 | iPhone 13+ / 8 GB Android |
| Capable | `qwen-2.5-7b-q4` | Qwen 2.5 7B Instruct | Q4_K_M | ~4.5 GB | 4096 | iPhone 15 Pro+ / 12 GB Android |

**Each catalog entry contains:**

```ts
type ModelCatalogEntry = {
  id: string;                 // stable id, used as active_model_id
  tier: 'compact' | 'standard' | 'capable';
  displayName: string;        // shown in UI
  url: string;                // direct GGUF download URL
  sha256: string;             // verification hash
  sizeBytes: number;          // for download progress + free-disk preflight
  contextLen: number;         // configured ctx (not the model's max)
  minRamGB: number;           // for device-fit hint
  recommendedRamGB: number;   // for "recommended" badge
};
```

**Simultaneous installs:** users may have all three installed at once. Exactly one is active (`settings.active_model_id`); switching active model triggers `engine.dispose()` then `engine.load(newModelPath)`. Installed-ness is derived by checking whether the GGUF file exists at the expected path; no DB column required.

**Disk math:** all three models = ~7.2 GB. The Settings screen's Models section shows current usage and free-disk space.

## 4. Data model

Four tables. Migrations versioned in `db/schema.ts`.

```sql
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,        -- uuid
  name          TEXT NOT NULL,
  notes         TEXT NOT NULL DEFAULT '', -- user-written project context, prepended to system prompt
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE conversations (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE, -- nullable: "Inbox" / unfiled
  title           TEXT NOT NULL,           -- auto-generated from first user msg, user-editable
  system_prompt   TEXT NOT NULL DEFAULT '', -- per-conversation override on top of project notes
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_conv_project ON conversations(project_id, updated_at DESC);

CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  model_id        TEXT,                    -- which model generated this (for assistant rows)
  token_count     INTEGER,
  finish_reason   TEXT                     -- 'stop' | 'cancelled' | 'error' | 'length'
);
CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                      -- JSON-encoded
);
```

**Known settings keys:**

| Key | Type | Default | Purpose |
|---|---|---|---|
| `default_system_prompt` | string | `''` | App-wide default; per-conv overrides |
| `active_model_id` | string | (none) | Matches a `catalog.ts` entry; exactly one model is active at a time |
| `temperature` | number | `0.7` | Sampling temperature |
| `max_tokens` | number | `1024` | Max response tokens |
| `context_window` | number | `4096` | Tokens reserved for full prompt + response |
| `theme` | string | `'system'` | `'system' \| 'light' \| 'dark'` |

### 4.1 Design notes

- **Projects are optional.** A conversation with `project_id = NULL` lives in an "Inbox" view. New users aren't forced to create a project before chatting.
- **Two layers of system prompt.** Project notes (broad context) + per-conversation system prompt (specific framing). Either or both can be empty.
- **Cascading deletes.** Delete a project → its conversations go too. Delete a conversation → its messages go.
- **No FTS / no embeddings tables.** Search is `LIKE` on titles/content for v1. Easy to add `messages_fts` virtual table or vec table later without core schema migration.
- **`messages.finish_reason` matters.** Lets the UI distinguish "stopped by user" from "model errored" from "hit token limit", and powers smart Regenerate behavior.

## 5. Core flows

### 5.1 First launch

```
App opens → check settings.active_model_id
  if missing → FirstRunScreen (model picker):
    1. Brief explainer (private, on-device, no cloud)
    2. Three cards (Compact / Standard / Capable) with size, "min device" hint, and a one-line "good for" description.
       - Standard is pre-selected with a "Recommended" badge.
       - Cards for which the device is below minRamGB are visually muted with a subtle "may be slow on this device" hint, but still selectable.
    3. "Download <selected>" button → model/download.ts
       - Pre-flight: check (sizeBytes × 1.25) free disk space
       - Stream model to <documents>/models/<id>.gguf with progress UI
       - SHA-256 verify on completion
       - On failure: keep partial file, "Resume" button
    4. On success: write settings.active_model_id, navigate to ConversationList
  if present → check file exists on disk for active_model_id
    if missing (user cleared storage) → back to FirstRunScreen
    else → ConversationList
```

### 5.2 Send a message

```
User taps Send →
  useConversation hook:
    1. Insert user message row (status: complete)
    2. Insert assistant message row (status: streaming, content: '')
    3. promptBuilder.build({
         projectNotes: project?.notes,
         conversationSystemPrompt: conversation.system_prompt,
         defaultSystemPrompt: settings.default_system_prompt,
         history: messages,            // truncated to fit context window
         newUserTurn: input
       })
    4. engine.streamCompletion(prompt, { temperature, maxTokens, signal })
       → emits tokens; hook appends to assistant row's content
       → UI re-renders streaming bubble (throttled to ~30fps)
    5. On finish: update assistant row (token_count, finish_reason='stop')
    6. On cancel (user tapped Stop): finish_reason='cancelled', keep partial content
    7. On error: finish_reason='error', show retry button on the bubble
```

### 5.3 Context window management

llama 3.2 3B has 128k nominal but on-device context is set to 4k–8k for memory headroom. `promptBuilder` budgets tokens:

```
budget = contextLen - reservedForResponse(maxTokens) - safety(256)
1. Always include: defaultSystemPrompt + projectNotes + conversationSystemPrompt + new user turn
2. Walk history newest→oldest, including pairs (user+assistant) until budget exhausted
3. If oldest pair won't fit: drop it (don't truncate mid-message)
4. If even (system + new user turn) exceeds budget: hard error — "message too long for current context window"
```

No silent summarization in v1. The user sees what the model sees.

### 5.4 Switch project / conversation

- `ConversationList` shows projects as collapsible groups + an "Inbox" group for unfiled. Within each group, conversations sorted by `updated_at DESC`.
- Tap a conversation → load last N messages (paginate older on scroll up).
- "New conversation" button opens Composer with no messages, optionally pre-filled with active project context.
- Long-press a conversation → action sheet: move to project, rename, delete.

### 5.5 Edit project notes

- Project detail screen: name (inline edit), notes (multi-line text area), list of conversations in project.
- Notes are saved on blur (debounced 500ms).
- Notes take effect on the *next* message sent in any conversation in that project. In-flight generations are not interrupted.

### 5.6 Model lifecycle

llama.rn keeps the model in RAM (~2GB for a Q4 3B). On iOS especially, going to background can trigger OS process kill.

**Strategy:**
- `engine.load(modelPath)` lazily on first send if not loaded (shows "warming up…" indicator, ~2–5s; longer for Capable tier).
- `engine.dispose()` after 60s of app being backgrounded.
- On crash/kill: transparent reload on next send; if reload fails twice in a row, surface error.

### 5.7 Manage models

In Settings → Models, the user sees the catalog with each entry's install state.

**Switch active model:**
```
1. User taps a non-active installed model → "Set as active?" sheet
2. On confirm:
   - settings.active_model_id = newId
   - engine.dispose() current model
   - On next send, engine.load(newPath) — shows "warming up…" status line
3. In-flight generation (if any) is cancelled before dispose; partial assistant content saved with finish_reason='cancelled'
```

**Download an additional model:**
```
1. User taps a non-installed model → "Download <name>?" sheet, shows size + free-disk
2. Pre-flight: check (sizeBytes × 1.25) free disk space; if not enough, show error with the gap ("Need 1.2 GB more free")
3. Same download flow as FirstRun (resume, SHA-256 verify)
4. On success: model is installed, but active_model_id is unchanged (user must explicitly switch)
```

**Delete a model:**
```
1. User long-presses an installed non-active model → "Delete <name>?" destructive sheet
2. On confirm: delete file, free disk
3. Active model cannot be deleted; user must switch first. The active row's delete action is disabled with a quiet hint.
4. Deleting the last installed model is allowed (returns user to FirstRun on next launch).
```

## 6. Visual design system

The app commits to a distinctive "Monochrome Technical" identity: mono UI chrome + serif AI prose, warm-toned monochrome palette. Dark mode is the hero treatment; light mode adapts from it.

### 6.1 Color tokens

**Dark (hero):**

| Token | Value | Usage |
|---|---|---|
| `bg.canvas` | `#161412` | App background, composer surface |
| `bg.elevated` | `#1F1C18` | Cards, modals, action sheets |
| `bg.subtle` | `rgba(236,230,216,0.04)` | Composer field background, hover |
| `border.subtle` | `rgba(236,230,216,0.10)` | Section dividers |
| `border.default` | `rgba(236,230,216,0.18)` | Composer border, project pill |
| `text.primary` | `#ECE6D8` | AI prose, headings |
| `text.secondary` | `rgba(236,230,216,0.55)` | User message body |
| `text.tertiary` | `rgba(236,230,216,0.45)` | Status line, metadata |
| `text.quiet` | `rgba(236,230,216,0.30)` | Empty states, kbd hints |
| `accent.warm` | `#E89A4F` | Streaming indicator, stop action, errors |
| `accent.inverse` | `#ECE6D8` (on `#161412`) | Send button background when active |

**Light (adapt):**

| Token | Value | Usage |
|---|---|---|
| `bg.canvas` | `#F8F5EE` | Cream paper |
| `bg.elevated` | `#FFFEF8` | Cards |
| `bg.subtle` | `rgba(26,24,20,0.04)` | Composer field |
| `border.subtle` | `rgba(26,24,20,0.06)` | |
| `border.default` | `rgba(26,24,20,0.18)` | |
| `text.primary` | `#1A1814` | Ink |
| `text.secondary` | `rgba(26,24,20,0.55)` | |
| `text.tertiary` | `rgba(26,24,20,0.45)` | |
| `text.quiet` | `rgba(26,24,20,0.30)` | |
| `accent.warm` | `#C66A1E` | Slightly deeper warm for contrast on cream |
| `accent.inverse` | `#1A1814` | Send button background |

**Principles:**
- No pure white, no pure black. Always warm-tinted. This is the entire visual identity in two pixels.
- The accent color is used **only** for streaming indicators, the Stop action, and error states. Nowhere else. Scarcity is the whole point.

### 6.2 Typography

Two families. Both must support the platform-native fallback chain so first paint isn't blocked.

**Mono — UI chrome, user input, status, code:**
- Stack: `'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, monospace`
- Used for: header, project pill, timestamps, status line, user messages, code blocks, kbd hints.

**Serif — AI prose:**
- Stack: `'Charter', 'Iowan Old Style', Georgia, 'Times New Roman', serif`
- Used for: assistant message body. (Not used for headings or chrome.)

**Type scale (in pt, dark mode reference; same scale in light):**

| Role | Size | Weight | Family |
|---|---|---|---|
| `heading` (screen title) | 16 | 600 | Mono |
| `body.ai` (assistant prose) | 16 | 400 | Serif |
| `body.user` (user message) | 14 | 400 | Mono |
| `meta` (status line, timestamps) | 11 | 400 | Mono |
| `label` (uppercase chrome) | 10 | 600, +0.06em letter-spacing | Mono |
| `kbd` (keyboard hints) | 10 | 400 | Mono |

Line height: `1.55` for serif body, `1.45` for mono body, `1.4` for chrome.

### 6.3 Spacing & radii

- 4pt grid. All spacing is a multiple of 4.
- Standard gaps: `4 / 8 / 12 / 16 / 24 / 32`.
- Border radius: `2` for buttons and chrome, `4` for composer, `8` for elevated cards. **No pill shapes.** Sharp corners reinforce the technical identity.
- Hairline borders only — `1px`. Never thicker.

### 6.4 Composer (the focal element)

The composer is **status-line + field**, full-width, fixed to the bottom above the keyboard.

**Anatomy:**
```
┌─────────────────────────────────────────────┐
│  ~/acme/q4 · llama-3.2-3b · 38 tok/s   ⌘↵   │  ← status line (mono, 11pt, tertiary)
├─────────────────────────────────────────────┤
│  $  message                              ↵  │  ← field (mono, 13pt)
└─────────────────────────────────────────────┘
```

**Status line states** (this is a mobile-only app; no keyboard-shortcut hints). The model id renders the active catalog entry's id (e.g. `llama-3.2-3b-q4`, `qwen-2.5-7b-q4`):

| State | Left | Right |
|---|---|---|
| empty | `~/<project>/<conv> · <active_model_id> · ctx <ctx>` | (empty) |
| typing | `~/<project>/<conv> · <active_model_id>` | `<n> chars` |
| streaming | `● generating · 142 tok · 38 tok/s` (warm accent) | (empty) |
| warming | `◐ warming up…` (warm accent) | (empty) |
| error | `✕ <reason>` (warm accent) | `tap to retry` |
| ctx-full | `⚠ context full · oldest turn dropped` (warm accent) | (empty) |

The status line carries the entire local-AI identity. It's where the truth about what's running on the user's device lives.

**Field states:**
- empty: `$` prompt at quiet opacity, placeholder "message", right-side `↵` send-glyph at quiet opacity (disabled).
- typing: `$` prompt at primary opacity, content visible, right-side `↵` send-glyph at primary opacity (active tap target). Keyboard return key also submits.
- streaming: prompt dims to 30%, field dims to 30% and is disabled, right side replaces `↵` with `STOP` button (warm accent border + text). Tapping STOP propagates the AbortSignal.

### 6.5 Message bubbles

No traditional bubbles. Messages are **left-bordered blocks**.

**User message:**
- Mono, 14pt, secondary text color
- Left border: 2px, `border.default`
- Padding-left: 12
- Prefixed with `> ` glyph (quiet opacity)

**Assistant message:**
- Serif, 16pt, primary text color
- Left border: 2px, `text.primary` (full opacity — visually anchors)
- Padding-left: 12
- Inline code: `bg.subtle` background, mono, 92% size, 2px radius

**Above each message:**
- A "meta" line in mono 9pt label style, opacity 0.4: `14:22 · sent` or `14:22 · streaming · 142 tok` or `14:22 · stopped`.

**Streaming cursor:**
- Block cursor: 7×14 px solid block in `text.primary` color
- Blink: `1.05s steps(2, jump-none)` infinite (50% off, 50% on — no fade)

### 6.6 Motion language

- **Token streaming render throttle:** 30fps max. Tokens accumulate in a buffer; render flushes every ~33ms.
- **Auto-scroll:** Only when user is within 80px of the bottom. If they scrolled up to read, do not yank them down.
- **Screen transitions:** 200ms ease-out for push, 180ms ease-in for pop. No flashy slides.
- **Message appearance:** New messages fade in over 120ms with 4px upward translate. Streaming cursor appears immediately (no fade) so latency is felt as "alive," not "delayed."
- **Composer state changes:** Status line cross-fades over 150ms when transitioning between states. Field state changes are instantaneous.
- **Pressed states:** 100ms opacity drop to 0.6 on tap. No scale animations.
- **Haptics:** light impact on send, success on generation complete, warning on error or context-full. iOS via `expo-haptics`; Android via the same API (maps to vibration patterns). Respects system "reduce haptics" setting.

### 6.7 Empty and loading states

Empty states are designed with the same care as filled ones — they're the user's first impression after every action.

- **First-run screen:** Centered, single column. App name in mono. One-paragraph promise (serif). Three model cards stacked vertically — each shows tier label (mono uppercase), display name, size, and a one-line "good for" hint in serif. Standard has a `RECOMMENDED` chip in warm accent. Cards below the device's `minRamGB` are muted with a quiet `may be slow on this device` hint, but still tappable. Below the cards: primary button `DOWNLOAD <selected>  ~<size>`. Below the button, three quiet lines: `· runs on your device`, `· no account, no cloud`, `· you can install more models later`.
- **Empty conversation list:** A single line in mono tertiary: `~/no conversations yet`. Below, a quiet `+ NEW` button. Below that, in serif italic: *"Ask anything. It runs here."*
- **Empty conversation (just opened, no messages):** Composer is the entire screen. Status line says `~/<project> · ready`. No prompt, no example chips, no marketing.
- **Model warming up (first send after cold load):** Status line shows `◐ warming up…` with a slow-rotating glyph. Composer field is disabled, dimmed to 50%. Typically 2–5s.

### 6.8 The five screens

**1. FirstRun** — centered single-column download flow.

**2. ConversationList**
- Header (sticky): app mark + `~` glyph, `+ NEW` action, settings cog.
- Body: collapsible project sections + "Inbox" section. Each row: mono title, serif preview snippet (1 line, fade-out gradient), mono relative timestamp (right-aligned).
- Long-press: action sheet for move/rename/delete.

**3. Conversation**
- Header: back arrow, project pill (tap → ProjectDetail), conversation title (tap to rename), overflow menu.
- Body: scrollable message list with meta lines.
- Bottom: composer (status line + field), keyboard-avoiding.

**4. ProjectDetail**
- Header: back, project name (inline edit on tap), overflow (delete).
- Top section: large notes textarea — the v1 memory. Save on blur.
- Below: list of conversations in this project (same row style as ConversationList).
- Bottom: `+ NEW CONVERSATION IN PROJECT` action.

**5. Settings**
- Sectioned list: Models · Defaults · Theme · Data · About.
- **Models:**
  - Header: total disk used by models, free disk available.
  - Three rows (Compact / Standard / Capable). Each row shows: tier label, model id, size.
    - **Installed + active:** primary text color, `● ACTIVE` chip in warm accent, `RE-DOWNLOAD` action (long-press for menu). Cannot be deleted while active.
    - **Installed, not active:** primary text color, `SET ACTIVE` action. Long-press → delete.
    - **Not installed:** muted text, `DOWNLOAD` action.
    - **Below `minRamGB`:** quiet hint line `may be slow on this device`. Still selectable.
- Defaults: default system prompt (multi-line), temperature slider (0–1, step 0.05), max tokens slider (128–2048, step 64), context window slider (2048–8192, step 1024).
- Theme: System / Light / Dark.
- Data: `WIPE ALL DATA` (destructive, double-confirm — wipes DB, settings, *and* all installed models).
- About: version, model card links (per installed model), license.

### 6.9 Tablet / landscape

Not in v1. Phone portrait only. The design assumes a single-column 360–430pt-wide canvas.

## 7. Error handling

### 7.1 Model download

- Network drop → keep partial file, expose `Resume` (HTTP Range requests).
- Disk full → detect early via `expo-file-system`'s free-space check before starting (require `sizeBytes × 1.25`); show "Need <gap> more free" with the actual computed gap.
- SHA-256 mismatch → delete file, show "Download corrupted, try again."
- App backgrounded → continue using `expo-task-manager` background fetch where available; otherwise pause and resume on foreground.

### 7.2 Engine

- Model load fails (corrupted) → bubble structured error. Settings → Models offers `RE-DOWNLOAD` for the affected model, or `SET ACTIVE` for any other installed model.
- Model load fails (OOM, typically Capable on under-spec device) → structured error with a "Switch to a smaller model" action that opens Settings → Models. Active model is left unchanged so the user's choice is explicit.
- Generation OOM mid-stream → mark message `finish_reason='error'`, surface in status line: `✕ out of memory`. Don't crash.
- Process killed by OS in background → on next send, transparent reload. If reload fails twice consecutively, surface error.
- llama.rn native crash → caught at the bridge boundary; UI shows error state, no RN red box.

### 7.3 Database

- SQLite write fails (rare; usually disk full) → don't lose user input. In-memory message retained; banner offers Retry.
- Corrupt DB on launch → `PRAGMA integrity_check` on startup; on failure, offer "Reset chat history" (preserves model + settings).
- Migration failure → keep old DB at `chat.db.bak`, recreate fresh, surface one-time recovery banner with "View backup."

### 7.4 Chat orchestration

- User taps Stop → `AbortSignal` propagates to engine; partial assistant content saved with `finish_reason='cancelled'`. No regenerate auto-fires.
- User backs out mid-generation → generation continues in background; navigating back shows the still-streaming bubble. Single in-flight generation per app, no queueing in v1.
- Message exceeds context budget → caught in `promptBuilder` before engine call; status line shows `⚠ message too long`; user must shorten or raise context in settings.
- Rapid-fire sends → composer disables Send while a generation is in flight.

### 7.5 Privacy guarantees

- **No analytics or crash reporting that ships content.** Crash counters okay; message text never.
- **No network calls during normal operation.** The only network call is the initial model download. After that, the app makes zero outbound requests.
- **`WIPE ALL DATA`** deletes: SQLite DB, model files, app caches. Single button, double-confirm.

## 8. Testing strategy

- `engine/fakeEngine.ts`: scripted token streams, controllable error injection. All UI tests run against this — no real model in CI.
- **Unit tests:**
  - `promptBuilder` — context budgeting, project notes injection, history truncation. Pure function, easy to cover.
  - `db/*` repos — against in-memory SQLite via expo-sqlite test mode.
  - `model/download` — mocked HTTP, resume logic, integrity check.
- **Component tests** (React Native Testing Library):
  - Conversation screen against `fakeEngine` — streaming, stop, error retry.
  - ConversationList grouping and sorting.
  - ProjectDetail notes save-on-blur.
- **Manual smoke matrix** before each TestFlight build:
  - Cold launch on iPhone 14 + a mid-tier Android (e.g. Pixel 6a).
  - Send → Stop mid-stream → resume.
  - Background app during generation → return.
  - Force-quit during download → resume.
  - Wipe data → re-download.
- **No E2E framework (Detox)** in v1. Manual matrix is sufficient at this scope.

## 9. Non-functional targets

| Metric | Target |
|---|---|
| Cold app launch to ConversationList | < 1.5 s |
| First send to first token (warm Standard) | < 2 s on iPhone 14, < 4 s on Pixel 6a |
| First send after cold Standard load | < 6 s (includes warm) |
| Token throughput (Standard, 3B Q4) | ≥ 30 tok/s on iPhone 14, ≥ 15 tok/s on Pixel 6a |
| Memory footprint (Standard loaded) | < 2.5 GB resident |
| App size (without any model) | < 60 MB |
| Model download size range | 0.7 GB (Compact) → 4.5 GB (Capable) |

Targets above are for the Standard tier (default). Compact runs ~2× faster with smaller memory footprint. Capable runs ~2–3× slower and may not load at all on devices below `minRamGB`.

If a device falls below the throughput target, the user-visible token streaming is still smooth (throttled render); the app does not warn unless inference fails outright. If the active model fails to load due to OOM, the app surfaces a structured error with a "Switch to a smaller model" action that opens Settings → Models.

## 10. Distribution path

- **Phase 1 (personal):** Sideload via Expo dev client to your own devices. Iterate fast.
- **Phase 2 (internal testing):** TestFlight (iOS) + Internal Testing track (Play). Limited audience, no store review.
- **Phase 3 (public launch):** App Store + Google Play. Adds privacy labels, screenshots, age rating, support email. Treat as a separate ~2-week effort after the experience is good.

## 11. Future (out of v1, listed so v1 boundaries are clear)

- v1.1: Local search (FTS), conversation export, more theme polish, message editing.
- v1.5: Embeddings + retrieval (sqlite-vec), local RAG over project conversations.
- v2: Cloud fallback (BYO key), user-supplied GGUF models (BYO URL or sideload), voice input, document ingestion.
- v2+: Auto-extracted memory layered on top of manual notes, sync, team features.

## 12. Open questions for review

None blocking — all major decisions are committed. The following are explicit choices that the user has approved and documented here for the record:

- ✅ Cross-platform iOS + Android (both must ship from v1).
- ✅ Expo dev client + EAS Build (not bare RN, not Flutter).
- ✅ Curated catalog of three models (Compact 1B, Standard 3B, Capable 7B). Multiple may be installed simultaneously; one active at a time. User picks default at first run.
- ✅ Multi-conversation chat with per-conversation system prompt.
- ✅ Projects with manual user-written notes (not RAG, not auto-extracted).
- ✅ SQLite via `expo-sqlite` (not MMKV, not Drizzle).
- ✅ Engine layer abstraction (Shape 2, not direct llama.rn calls in UI).
- ✅ Monochrome Technical visual direction.
- ✅ Mono chrome + serif AI prose typography.
- ✅ Dark hero (warm-dark + bone serif), light adapts.
- ✅ Status-line composer treatment.
