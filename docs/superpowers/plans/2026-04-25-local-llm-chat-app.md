# Local LLM Chat App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, on-device, cross-platform mobile chat app (iOS + Android) that runs a local LLM via llama.rn, with multi-conversation chat, projects with manual notes, multi-model catalog, and a distinctive Monochrome Technical visual identity.

**Architecture:** Expo (custom dev client) + React Native + TypeScript. Strict module boundaries: `engine/` is the only layer that touches `llama.rn`; `db/` is the only layer that touches `expo-sqlite`; UI consumes `chat/` hooks and never sees inference or persistence directly. A `fakeEngine` lets the entire UI run end-to-end in tests without a real model.

**Tech Stack:** Expo SDK (latest), React Native, TypeScript (strict), `llama.rn`, `expo-sqlite`, `expo-file-system`, `expo-haptics`, `react-native-markdown-display`, Expo Router, Jest + React Native Testing Library.

**Spec reference:** [docs/superpowers/specs/2026-04-25-local-llm-chat-app-design.md](../specs/2026-04-25-local-llm-chat-app-design.md)

---

## File Structure

```
app/                              # Expo Router routes
  _layout.tsx                     # root layout, providers
  index.tsx                       # routing gate (FirstRun vs ConversationList)
  conversation/[id].tsx
  project/[id].tsx
  settings.tsx
  first-run.tsx

src/
  engine/
    types.ts                      # ChatEngine interface, GenerationOptions, Token
    fakeEngine.ts                 # scripted-stream impl for tests + fallback
    llamaRnEngine.ts              # production llama.rn impl
    index.ts                      # exports active engine factory
    __tests__/fakeEngine.test.ts

  model/
    catalog.ts                    # static catalog of three models
    storage.ts                    # paths, exists, delete, free-disk
    download.ts                   # HTTP range download with SHA-256
    __tests__/storage.test.ts
    __tests__/download.test.ts

  db/
    db.ts                         # connection + init
    schema.ts                     # table DDL + migrations
    projects.ts                   # repo
    conversations.ts              # repo
    messages.ts                   # repo
    settings.ts                   # repo
    __tests__/projects.test.ts
    __tests__/conversations.test.ts
    __tests__/messages.test.ts
    __tests__/settings.test.ts

  chat/
    promptBuilder.ts              # pure: assemble prompt under ctx budget
    useConversation.ts            # orchestration hook
    __tests__/promptBuilder.test.ts

  ui/
    theme/
      tokens.ts                   # color tokens (dark + light)
      typography.ts                # type scale + font stacks
      ThemeProvider.tsx
      useTheme.ts
    components/
      ScreenHeader.tsx
      ProjectPill.tsx
      MetaLine.tsx
      StreamingCursor.tsx
      MessageBubble.tsx           # user + assistant variants
      StatusLine.tsx              # all 6 states
      Composer.tsx                # status line + field
      ModelCard.tsx               # for FirstRun + Settings
      ActionSheet.tsx             # custom themed sheet
    screens/
      FirstRunScreen.tsx
      ConversationListScreen.tsx
      ConversationScreen.tsx
      ProjectDetailScreen.tsx
      SettingsScreen.tsx

  providers.tsx                   # composes ThemeProvider, EngineProvider, DbProvider
  haptics.ts                      # thin wrapper around expo-haptics

assets/
  fonts/                          # JetBrains Mono, Charter (or fallbacks)

package.json, app.json, eas.json, tsconfig.json, jest.config.js,
babel.config.js, metro.config.js, .eslintrc.cjs, .gitignore, README.md
```

**Boundary rules** (lint-enforceable later):
- `import 'llama.rn'` only in `src/engine/llamaRnEngine.ts`.
- `import 'expo-sqlite'` only in `src/db/*`.
- `src/ui/**` may not import from `src/engine/llamaRnEngine.ts` or any `src/db/*` directly — only through `src/chat/*` hooks.

---

## Phase 0 — Scaffold

### Task 1: Initialize Expo project with TypeScript

**Files:**
- Create: project root via `create-expo-app`

- [ ] **Step 1: Create the project**

```bash
cd /Users/prvoslavsavic/Documents/ai-local-chatgpt
npx create-expo-app@latest . --template blank-typescript --no-install
```

Expected: Files written. Don't install yet — we'll modify `package.json` first.

- [ ] **Step 2: Move template files into place**

The template puts everything at root. Verify `App.tsx`, `app.json`, `package.json`, `tsconfig.json` exist.

- [ ] **Step 3: Set TypeScript strict**

Replace `tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "types": ["jest", "node"]
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 4: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold expo project with strict typescript"
```

---

### Task 2: Install dependencies

**Files:** `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
npm install expo-router expo-sqlite expo-file-system expo-haptics expo-crypto \
  react-native-markdown-display react-native-safe-area-context \
  react-native-screens react-native-reanimated react-native-gesture-handler \
  zustand
```

- [ ] **Step 2: Install llama.rn**

```bash
npm install llama.rn
```

(Note: llama.rn requires a development build — won't work in Expo Go, but installs fine and the JS layer compiles.)

- [ ] **Step 3: Install dev deps**

```bash
npm install -D @types/react @types/jest jest jest-expo \
  @testing-library/react-native @testing-library/jest-native \
  eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  eslint-plugin-react eslint-plugin-react-native \
  prettier
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install runtime and dev dependencies"
```

---

### Task 3: Configure Expo Router, app.json, EAS

**Files:** `app.json`, `eas.json`, `babel.config.js`, `metro.config.js`

- [ ] **Step 1: Replace `app.json`**

```json
{
  "expo": {
    "name": "Local Chat",
    "slug": "local-chat",
    "version": "0.1.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "localchat",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.local.chat"
    },
    "android": {
      "package": "com.local.chat",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#161412"
      }
    },
    "plugins": [
      "expo-router",
      ["expo-sqlite", { "useSQLCipher": false }]
    ],
    "experiments": { "typedRoutes": true }
  }
}
```

- [ ] **Step 2: Create `eas.json`**

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

- [ ] **Step 3: Update `babel.config.js`**

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin'
    ]
  };
};
```

- [ ] **Step 4: Verify metro picks up TS path aliases**

Create/replace `metro.config.js`:

```javascript
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('cjs');
module.exports = config;
```

- [ ] **Step 5: Commit**

```bash
git add app.json eas.json babel.config.js metro.config.js
git commit -m "chore: configure expo router, eas, and metro"
```

---

### Task 4: Configure Jest

**Files:** `jest.config.js`, `jest-setup.ts`, `package.json` (scripts)

- [ ] **Step 1: Create `jest.config.js`**

```javascript
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEach: ['<rootDir>/jest-setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-markdown-display|llama\\.rn))'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']
};
```

- [ ] **Step 2: Create `jest-setup.ts`**

```typescript
import '@testing-library/jest-native/extend-expect';
```

- [ ] **Step 3: Add test scripts to `package.json`**

```json
{
  "scripts": {
    "start": "expo start",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 4: Verify Jest runs (no tests yet — exit 0 is fine)**

```bash
npx jest --passWithNoTests
```

Expected: green "no tests found" pass.

- [ ] **Step 5: Commit**

```bash
git add jest.config.js jest-setup.ts package.json
git commit -m "chore: configure jest with jest-expo preset"
```

---

## Phase 1 — Theme system

### Task 5: Define color and typography tokens

**Files:**
- Create: `src/ui/theme/tokens.ts`
- Create: `src/ui/theme/typography.ts`

- [ ] **Step 1: Create `src/ui/theme/tokens.ts`**

```typescript
export type ColorTokens = {
  bg: { canvas: string; elevated: string; subtle: string };
  border: { subtle: string; default: string };
  text: { primary: string; secondary: string; tertiary: string; quiet: string };
  accent: { warm: string; inverse: string };
};

export const darkTokens: ColorTokens = {
  bg: {
    canvas: '#161412',
    elevated: '#1F1C18',
    subtle: 'rgba(236,230,216,0.04)'
  },
  border: {
    subtle: 'rgba(236,230,216,0.10)',
    default: 'rgba(236,230,216,0.18)'
  },
  text: {
    primary: '#ECE6D8',
    secondary: 'rgba(236,230,216,0.55)',
    tertiary: 'rgba(236,230,216,0.45)',
    quiet: 'rgba(236,230,216,0.30)'
  },
  accent: {
    warm: '#E89A4F',
    inverse: '#ECE6D8'
  }
};

export const lightTokens: ColorTokens = {
  bg: {
    canvas: '#F8F5EE',
    elevated: '#FFFEF8',
    subtle: 'rgba(26,24,20,0.04)'
  },
  border: {
    subtle: 'rgba(26,24,20,0.06)',
    default: 'rgba(26,24,20,0.18)'
  },
  text: {
    primary: '#1A1814',
    secondary: 'rgba(26,24,20,0.55)',
    tertiary: 'rgba(26,24,20,0.45)',
    quiet: 'rgba(26,24,20,0.30)'
  },
  accent: {
    warm: '#C66A1E',
    inverse: '#1A1814'
  }
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 2, md: 4, lg: 8 } as const;
```

- [ ] **Step 2: Create `src/ui/theme/typography.ts`**

```typescript
import { Platform, TextStyle } from 'react-native';

const monoStack = Platform.select({
  ios: 'JetBrainsMono-Regular',
  android: 'JetBrainsMono-Regular',
  default: 'monospace'
})!;

const serifStack = Platform.select({
  ios: 'Charter-Regular',
  android: 'Charter-Regular',
  default: 'serif'
})!;

export const fonts = {
  mono: monoStack,
  monoBold: Platform.select({ ios: 'JetBrainsMono-Bold', android: 'JetBrainsMono-Bold', default: 'monospace' })!,
  serif: serifStack
};

export type TypeStyle = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'fontWeight' | 'letterSpacing' | 'lineHeight' | 'textTransform'>;

export const type: Record<
  'heading' | 'bodyAi' | 'bodyUser' | 'meta' | 'label' | 'kbd',
  TypeStyle
> = {
  heading: { fontFamily: fonts.monoBold, fontSize: 16, fontWeight: '600', lineHeight: 22 },
  bodyAi:  { fontFamily: fonts.serif,    fontSize: 16, lineHeight: 25 },
  bodyUser:{ fontFamily: fonts.mono,     fontSize: 14, lineHeight: 20 },
  meta:    { fontFamily: fonts.mono,     fontSize: 11, lineHeight: 15 },
  label:   { fontFamily: fonts.monoBold, fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', lineHeight: 14 },
  kbd:     { fontFamily: fonts.mono,     fontSize: 10, lineHeight: 14 }
};
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/theme/tokens.ts src/ui/theme/typography.ts
git commit -m "feat(theme): color tokens and typography scale"
```

---

### Task 6: ThemeProvider and useTheme

**Files:**
- Create: `src/ui/theme/ThemeProvider.tsx`
- Create: `src/ui/theme/useTheme.ts`

- [ ] **Step 1: Create `useTheme` hook with context**

`src/ui/theme/useTheme.ts`:

```typescript
import { createContext, useContext } from 'react';
import { darkTokens, lightTokens, ColorTokens, spacing, radii } from './tokens';
import { type, fonts } from './typography';

export type ThemeMode = 'light' | 'dark';
export type Theme = {
  mode: ThemeMode;
  colors: ColorTokens;
  type: typeof type;
  fonts: typeof fonts;
  spacing: typeof spacing;
  radii: typeof radii;
};

export const buildTheme = (mode: ThemeMode): Theme => ({
  mode,
  colors: mode === 'dark' ? darkTokens : lightTokens,
  type, fonts, spacing, radii
});

export const ThemeContext = createContext<Theme>(buildTheme('dark'));
export const useTheme = (): Theme => useContext(ThemeContext);
```

- [ ] **Step 2: Create `ThemeProvider`**

`src/ui/theme/ThemeProvider.tsx`:

```tsx
import { ReactNode, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { ThemeContext, buildTheme, ThemeMode } from './useTheme';

type Props = {
  children: ReactNode;
  override?: ThemeMode | 'system';
};

export const ThemeProvider = ({ children, override = 'system' }: Props) => {
  const sys = useColorScheme();
  const mode: ThemeMode = useMemo(() => {
    if (override === 'system') return sys === 'light' ? 'light' : 'dark';
    return override;
  }, [override, sys]);
  const theme = useMemo(() => buildTheme(mode), [mode]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/theme/
git commit -m "feat(theme): provider and useTheme hook"
```

---

## Phase 2 — Engine abstraction

### Task 7: Define ChatEngine interface

**Files:** `src/engine/types.ts`

- [ ] **Step 1: Create the interface**

```typescript
export type Role = 'system' | 'user' | 'assistant';
export type ChatTurn = { role: Role; content: string };

export type GenerationOptions = {
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
};

export type StreamCallbacks = {
  onToken: (text: string) => void;
  onDone: (info: { tokenCount: number; finishReason: 'stop' | 'length' }) => void;
  onError: (err: Error) => void;
};

export type LoadProgress = { phase: 'mmap' | 'warmup'; percent: number };

export interface ChatEngine {
  /** Returns true if a model is currently loaded and ready. */
  isReady(): boolean;
  /** Loads a model from a local path. Idempotent if same path is already loaded. */
  load(modelPath: string, opts?: { onProgress?: (p: LoadProgress) => void }): Promise<void>;
  /** Frees model from RAM. Safe to call when not loaded. */
  dispose(): Promise<void>;
  /** Streams completion. Calls callbacks on the JS thread. */
  streamCompletion(prompt: string, options: GenerationOptions, cb: StreamCallbacks): Promise<void>;
  /** Optional: returns model-reported context length. */
  getContextLength?(): number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/types.ts
git commit -m "feat(engine): ChatEngine interface"
```

---

### Task 8: Implement fakeEngine

**Files:**
- Create: `src/engine/fakeEngine.ts`
- Create: `src/engine/__tests__/fakeEngine.test.ts`

- [ ] **Step 1: Write failing test**

`src/engine/__tests__/fakeEngine.test.ts`:

```typescript
import { createFakeEngine } from '../fakeEngine';

describe('fakeEngine', () => {
  it('streams a scripted response token by token', async () => {
    const engine = createFakeEngine({ scriptedResponse: 'hello world' });
    await engine.load('/fake/path');
    expect(engine.isReady()).toBe(true);

    const tokens: string[] = [];
    let doneInfo: { tokenCount: number; finishReason: string } | undefined;

    await engine.streamCompletion('prompt', { temperature: 0.7, maxTokens: 100 }, {
      onToken: t => tokens.push(t),
      onDone: i => { doneInfo = i; },
      onError: e => { throw e; }
    });

    expect(tokens.join('')).toBe('hello world');
    expect(doneInfo?.finishReason).toBe('stop');
    expect(doneInfo?.tokenCount).toBeGreaterThan(0);
  });

  it('respects AbortSignal mid-stream', async () => {
    const engine = createFakeEngine({ scriptedResponse: 'one two three four', delayPerTokenMs: 5 });
    await engine.load('/fake/path');
    const ctrl = new AbortController();
    const tokens: string[] = [];
    const errors: Error[] = [];

    setTimeout(() => ctrl.abort(), 12);
    await engine.streamCompletion('p', { temperature: 0, maxTokens: 100, signal: ctrl.signal }, {
      onToken: t => tokens.push(t),
      onDone: () => { throw new Error('should not finish'); },
      onError: e => errors.push(e)
    });

    expect(errors.length).toBe(1);
    expect(errors[0].name).toBe('AbortError');
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.length).toBeLessThan(4);
  });

  it('throws if streamCompletion called before load', async () => {
    const engine = createFakeEngine({ scriptedResponse: 'x' });
    await expect(
      engine.streamCompletion('p', { temperature: 0, maxTokens: 1 }, {
        onToken: () => {}, onDone: () => {}, onError: () => {}
      })
    ).rejects.toThrow(/not loaded/i);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
npx jest src/engine/__tests__/fakeEngine.test.ts
```

Expected: cannot find module `../fakeEngine`.

- [ ] **Step 3: Implement `fakeEngine`**

`src/engine/fakeEngine.ts`:

```typescript
import { ChatEngine, GenerationOptions, StreamCallbacks } from './types';

export type FakeEngineConfig = {
  scriptedResponse?: string;
  delayPerTokenMs?: number;
  loadDelayMs?: number;
  failOn?: 'load' | 'stream';
};

export const createFakeEngine = (cfg: FakeEngineConfig = {}): ChatEngine => {
  let loaded = false;
  let loadedPath: string | null = null;

  return {
    isReady: () => loaded,

    async load(modelPath: string) {
      if (cfg.failOn === 'load') throw new Error('fake load failure');
      if (cfg.loadDelayMs) await new Promise(r => setTimeout(r, cfg.loadDelayMs));
      loaded = true;
      loadedPath = modelPath;
    },

    async dispose() {
      loaded = false;
      loadedPath = null;
    },

    async streamCompletion(_prompt: string, options: GenerationOptions, cb: StreamCallbacks) {
      if (!loaded) throw new Error('engine not loaded');
      if (cfg.failOn === 'stream') {
        cb.onError(new Error('fake stream failure'));
        return;
      }
      const text = cfg.scriptedResponse ?? `[fake response to: "${_prompt.slice(-40)}"]`;
      const tokens = text.match(/\S+\s*|\s+/g) ?? [text];
      const delay = cfg.delayPerTokenMs ?? 0;

      for (const tok of tokens) {
        if (options.signal?.aborted) {
          const err = new Error('aborted'); err.name = 'AbortError';
          cb.onError(err);
          return;
        }
        cb.onToken(tok);
        if (delay) await new Promise(r => setTimeout(r, delay));
      }
      cb.onDone({ tokenCount: tokens.length, finishReason: 'stop' });
    },

    getContextLength() { return 4096; }
  };
};
```

- [ ] **Step 4: Run test, verify PASS**

```bash
npx jest src/engine/__tests__/fakeEngine.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/engine/fakeEngine.ts src/engine/__tests__/fakeEngine.test.ts
git commit -m "feat(engine): fakeEngine with TDD coverage"
```

---

### Task 9: Implement llamaRnEngine

**Files:** `src/engine/llamaRnEngine.ts`, `src/engine/index.ts`

- [ ] **Step 1: Create `llamaRnEngine.ts`**

(No unit test — requires real llama.rn native module + a model file. Verified manually on device.)

```typescript
import { initLlama, LlamaContext } from 'llama.rn';
import { ChatEngine, GenerationOptions, StreamCallbacks, LoadProgress } from './types';

let ctx: LlamaContext | null = null;
let loadedPath: string | null = null;

export const llamaRnEngine: ChatEngine = {
  isReady: () => ctx !== null,

  async load(modelPath: string, opts) {
    if (loadedPath === modelPath && ctx) return;
    if (ctx) {
      await ctx.release();
      ctx = null; loadedPath = null;
    }
    opts?.onProgress?.({ phase: 'mmap', percent: 0 });
    ctx = await initLlama({
      model: modelPath,
      n_ctx: 4096,
      n_gpu_layers: 99,
      use_mlock: false
    });
    loadedPath = modelPath;
    opts?.onProgress?.({ phase: 'warmup', percent: 100 });
  },

  async dispose() {
    if (ctx) {
      await ctx.release();
      ctx = null;
      loadedPath = null;
    }
  },

  async streamCompletion(prompt: string, options: GenerationOptions, cb: StreamCallbacks) {
    if (!ctx) throw new Error('engine not loaded');

    let aborted = false;
    const onAbort = () => {
      aborted = true;
      ctx?.stopCompletion();
    };
    options.signal?.addEventListener('abort', onAbort);

    let tokenCount = 0;
    try {
      const result = await ctx.completion(
        {
          prompt,
          temperature: options.temperature,
          n_predict: options.maxTokens,
          stop: ['<|eot_id|>', '</s>', '<|end|>']
        },
        (data) => {
          if (aborted) return;
          tokenCount++;
          cb.onToken(data.token);
        }
      );

      if (aborted) {
        const err = new Error('aborted'); err.name = 'AbortError';
        cb.onError(err);
        return;
      }
      cb.onDone({
        tokenCount,
        finishReason: result?.stopped_limit ? 'length' : 'stop'
      });
    } catch (e) {
      if (aborted) {
        const err = new Error('aborted'); err.name = 'AbortError';
        cb.onError(err);
      } else {
        cb.onError(e instanceof Error ? e : new Error(String(e)));
      }
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }
  },

  getContextLength: () => 4096
};
```

- [ ] **Step 2: Create `src/engine/index.ts`**

```typescript
import { ChatEngine } from './types';
import { llamaRnEngine } from './llamaRnEngine';
import { createFakeEngine } from './fakeEngine';

let active: ChatEngine = llamaRnEngine;

export const setEngine = (e: ChatEngine) => { active = e; };
export const getEngine = (): ChatEngine => active;

// Test/dev helper:
export const useFakeEngineFor = (cfg: Parameters<typeof createFakeEngine>[0]) => {
  active = createFakeEngine(cfg);
};

export type { ChatEngine } from './types';
export { createFakeEngine } from './fakeEngine';
```

- [ ] **Step 3: Verify it typechecks**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/engine/llamaRnEngine.ts src/engine/index.ts
git commit -m "feat(engine): llama.rn production engine + factory"
```

---

## Phase 3 — Database

### Task 10: DB connection and schema

**Files:** `src/db/db.ts`, `src/db/schema.ts`

- [ ] **Step 1: Create `src/db/schema.ts`**

```typescript
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_project ON conversations(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  model_id TEXT,
  token_count INTEGER,
  finish_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
```

- [ ] **Step 2: Create `src/db/db.ts`**

```typescript
import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

let _db: SQLite.SQLiteDatabase | null = null;

export const initDb = async (name = 'chat.db'): Promise<SQLite.SQLiteDatabase> => {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(name);
  await _db.execAsync('PRAGMA foreign_keys = ON;');
  await _db.execAsync(SCHEMA_SQL);
  await _db.runAsync(
    'INSERT OR REPLACE INTO schema_meta(key,value) VALUES (?, ?)',
    'version', String(SCHEMA_VERSION)
  );
  return _db;
};

export const getDb = (): SQLite.SQLiteDatabase => {
  if (!_db) throw new Error('db not initialized');
  return _db;
};

/** Test-only: open an in-memory DB. */
export const initTestDb = async (): Promise<SQLite.SQLiteDatabase> => {
  _db = await SQLite.openDatabaseAsync(':memory:');
  await _db.execAsync('PRAGMA foreign_keys = ON;');
  await _db.execAsync(SCHEMA_SQL);
  return _db;
};

export const resetDb = () => { _db = null; };
```

- [ ] **Step 3: Commit**

```bash
git add src/db/db.ts src/db/schema.ts
git commit -m "feat(db): connection and schema"
```

---

### Task 11: Settings repo with TDD

**Files:** `src/db/settings.ts`, `src/db/__tests__/settings.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { initTestDb, resetDb } from '../db';
import { getSetting, setSetting, getAllSettings, DEFAULT_SETTINGS } from '../settings';

beforeEach(async () => { resetDb(); await initTestDb(); });

describe('settings repo', () => {
  it('returns default when key missing', async () => {
    expect(await getSetting('temperature')).toBe(DEFAULT_SETTINGS.temperature);
    expect(await getSetting('theme')).toBe(DEFAULT_SETTINGS.theme);
  });

  it('round-trips a value', async () => {
    await setSetting('temperature', 0.4);
    expect(await getSetting('temperature')).toBe(0.4);
  });

  it('round-trips strings', async () => {
    await setSetting('default_system_prompt', 'be concise');
    expect(await getSetting('default_system_prompt')).toBe('be concise');
  });

  it('getAllSettings merges defaults and stored', async () => {
    await setSetting('temperature', 0.2);
    const all = await getAllSettings();
    expect(all.temperature).toBe(0.2);
    expect(all.theme).toBe(DEFAULT_SETTINGS.theme);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
npx jest src/db/__tests__/settings.test.ts
```

- [ ] **Step 3: Implement settings repo**

`src/db/settings.ts`:

```typescript
import { getDb } from './db';

export type Theme = 'system' | 'light' | 'dark';

export type Settings = {
  default_system_prompt: string;
  active_model_id: string | null;
  temperature: number;
  max_tokens: number;
  context_window: number;
  theme: Theme;
};

export const DEFAULT_SETTINGS: Settings = {
  default_system_prompt: '',
  active_model_id: null,
  temperature: 0.7,
  max_tokens: 1024,
  context_window: 4096,
  theme: 'system'
};

export const getSetting = async <K extends keyof Settings>(key: K): Promise<Settings[K]> => {
  const row = await getDb().getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?', key
  );
  if (!row) return DEFAULT_SETTINGS[key];
  return JSON.parse(row.value) as Settings[K];
};

export const setSetting = async <K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> => {
  await getDb().runAsync(
    'INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)',
    key, JSON.stringify(value)
  );
};

export const getAllSettings = async (): Promise<Settings> => {
  const rows = await getDb().getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings'
  );
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) {
      (out as Record<string, unknown>)[r.key] = JSON.parse(r.value);
    }
  }
  return out;
};
```

- [ ] **Step 4: Run test, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add src/db/settings.ts src/db/__tests__/settings.test.ts
git commit -m "feat(db): settings repo"
```

---

### Task 12: Projects repo

**Files:** `src/db/projects.ts`, `src/db/__tests__/projects.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { initTestDb, resetDb } from '../db';
import { createProject, listProjects, getProject, updateProject, deleteProject } from '../projects';

beforeEach(async () => { resetDb(); await initTestDb(); });

describe('projects repo', () => {
  it('creates and lists', async () => {
    const a = await createProject({ name: 'Acme', notes: 'Tom is backend lead' });
    const b = await createProject({ name: 'Personal' });
    const list = await listProjects();
    expect(list.map(p => p.name)).toEqual(expect.arrayContaining(['Acme', 'Personal']));
    expect(list.find(p => p.id === a.id)?.notes).toBe('Tom is backend lead');
    expect(list.find(p => p.id === b.id)?.notes).toBe('');
  });

  it('updates name and notes', async () => {
    const p = await createProject({ name: 'X' });
    await updateProject(p.id, { name: 'Y', notes: 'updated' });
    const got = await getProject(p.id);
    expect(got?.name).toBe('Y');
    expect(got?.notes).toBe('updated');
    expect(got!.updated_at).toBeGreaterThanOrEqual(p.updated_at);
  });

  it('deletes', async () => {
    const p = await createProject({ name: 'X' });
    await deleteProject(p.id);
    expect(await getProject(p.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Implement**

`src/db/projects.ts`:

```typescript
import { randomUUID } from 'expo-crypto';
import { getDb } from './db';

export type Project = {
  id: string;
  name: string;
  notes: string;
  created_at: number;
  updated_at: number;
};

export const createProject = async (args: { name: string; notes?: string }): Promise<Project> => {
  const id = randomUUID();
  const now = Date.now();
  const proj: Project = { id, name: args.name, notes: args.notes ?? '', created_at: now, updated_at: now };
  await getDb().runAsync(
    'INSERT INTO projects(id,name,notes,created_at,updated_at) VALUES (?,?,?,?,?)',
    proj.id, proj.name, proj.notes, proj.created_at, proj.updated_at
  );
  return proj;
};

export const listProjects = async (): Promise<Project[]> =>
  getDb().getAllAsync<Project>('SELECT * FROM projects ORDER BY updated_at DESC');

export const getProject = async (id: string): Promise<Project | null> => {
  const row = await getDb().getFirstAsync<Project>('SELECT * FROM projects WHERE id = ?', id);
  return row ?? null;
};

export const updateProject = async (
  id: string, patch: Partial<Pick<Project, 'name' | 'notes'>>
): Promise<void> => {
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const vals: unknown[] = [now];
  if (patch.name !== undefined) { sets.push('name = ?'); vals.push(patch.name); }
  if (patch.notes !== undefined) { sets.push('notes = ?'); vals.push(patch.notes); }
  vals.push(id);
  await getDb().runAsync(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, ...vals);
};

export const deleteProject = async (id: string): Promise<void> => {
  await getDb().runAsync('DELETE FROM projects WHERE id = ?', id);
};
```

- [ ] **Step 4: Run test, verify PASS**
- [ ] **Step 5: Commit**

```bash
git add src/db/projects.ts src/db/__tests__/projects.test.ts
git commit -m "feat(db): projects repo"
```

---

### Task 13: Conversations repo

**Files:** `src/db/conversations.ts`, `src/db/__tests__/conversations.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { initTestDb, resetDb } from '../db';
import { createProject } from '../projects';
import {
  createConversation, listConversations, getConversation,
  updateConversation, deleteConversation, listConversationsByProject
} from '../conversations';

beforeEach(async () => { resetDb(); await initTestDb(); });

describe('conversations repo', () => {
  it('creates with and without project', async () => {
    const p = await createProject({ name: 'Acme' });
    const c1 = await createConversation({ title: 'First', project_id: p.id });
    const c2 = await createConversation({ title: 'Inbox-only' });
    expect(c1.project_id).toBe(p.id);
    expect(c2.project_id).toBeNull();
  });

  it('lists by project', async () => {
    const p = await createProject({ name: 'Acme' });
    await createConversation({ title: 'A', project_id: p.id });
    await createConversation({ title: 'B', project_id: p.id });
    await createConversation({ title: 'Solo' });
    const inProj = await listConversationsByProject(p.id);
    const inbox = await listConversationsByProject(null);
    expect(inProj.length).toBe(2);
    expect(inbox.length).toBe(1);
  });

  it('updates title and system prompt', async () => {
    const c = await createConversation({ title: 'old' });
    await updateConversation(c.id, { title: 'new', system_prompt: 'be terse' });
    const got = await getConversation(c.id);
    expect(got?.title).toBe('new');
    expect(got?.system_prompt).toBe('be terse');
  });

  it('cascades delete from project', async () => {
    const p = await createProject({ name: 'P' });
    const c = await createConversation({ title: 'C', project_id: p.id });
    const { deleteProject } = await import('../projects');
    await deleteProject(p.id);
    expect(await getConversation(c.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Implement**

`src/db/conversations.ts`:

```typescript
import { randomUUID } from 'expo-crypto';
import { getDb } from './db';

export type Conversation = {
  id: string;
  project_id: string | null;
  title: string;
  system_prompt: string;
  created_at: number;
  updated_at: number;
};

export const createConversation = async (args: {
  title: string;
  project_id?: string | null;
  system_prompt?: string;
}): Promise<Conversation> => {
  const id = randomUUID();
  const now = Date.now();
  const conv: Conversation = {
    id,
    project_id: args.project_id ?? null,
    title: args.title,
    system_prompt: args.system_prompt ?? '',
    created_at: now,
    updated_at: now
  };
  await getDb().runAsync(
    'INSERT INTO conversations(id,project_id,title,system_prompt,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    conv.id, conv.project_id, conv.title, conv.system_prompt, conv.created_at, conv.updated_at
  );
  return conv;
};

export const listConversations = async (): Promise<Conversation[]> =>
  getDb().getAllAsync<Conversation>('SELECT * FROM conversations ORDER BY updated_at DESC');

export const listConversationsByProject = async (projectId: string | null): Promise<Conversation[]> =>
  projectId === null
    ? getDb().getAllAsync<Conversation>(
        'SELECT * FROM conversations WHERE project_id IS NULL ORDER BY updated_at DESC'
      )
    : getDb().getAllAsync<Conversation>(
        'SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC', projectId
      );

export const getConversation = async (id: string): Promise<Conversation | null> => {
  const row = await getDb().getFirstAsync<Conversation>('SELECT * FROM conversations WHERE id = ?', id);
  return row ?? null;
};

export const updateConversation = async (
  id: string,
  patch: Partial<Pick<Conversation, 'title' | 'system_prompt' | 'project_id'>>
): Promise<void> => {
  const now = Date.now();
  const sets: string[] = ['updated_at = ?'];
  const vals: unknown[] = [now];
  if (patch.title !== undefined) { sets.push('title = ?'); vals.push(patch.title); }
  if (patch.system_prompt !== undefined) { sets.push('system_prompt = ?'); vals.push(patch.system_prompt); }
  if (patch.project_id !== undefined) { sets.push('project_id = ?'); vals.push(patch.project_id); }
  vals.push(id);
  await getDb().runAsync(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`, ...vals);
};

export const deleteConversation = async (id: string): Promise<void> => {
  await getDb().runAsync('DELETE FROM conversations WHERE id = ?', id);
};

export const touchConversation = async (id: string): Promise<void> => {
  await getDb().runAsync('UPDATE conversations SET updated_at = ? WHERE id = ?', Date.now(), id);
};
```

- [ ] **Step 4: Run test, verify PASS**
- [ ] **Step 5: Commit**

```bash
git add src/db/conversations.ts src/db/__tests__/conversations.test.ts
git commit -m "feat(db): conversations repo"
```

---

### Task 14: Messages repo

**Files:** `src/db/messages.ts`, `src/db/__tests__/messages.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { initTestDb, resetDb } from '../db';
import { createConversation } from '../conversations';
import {
  appendMessage, listMessages, updateMessageStream, finishMessage, deleteMessage
} from '../messages';

beforeEach(async () => { resetDb(); await initTestDb(); });

describe('messages repo', () => {
  it('appends and lists in created_at order', async () => {
    const c = await createConversation({ title: 'T' });
    const m1 = await appendMessage({ conversation_id: c.id, role: 'user', content: 'hi' });
    const m2 = await appendMessage({ conversation_id: c.id, role: 'assistant', content: '' });
    const list = await listMessages(c.id);
    expect(list.map(m => m.id)).toEqual([m1.id, m2.id]);
  });

  it('updates streaming content', async () => {
    const c = await createConversation({ title: 'T' });
    const m = await appendMessage({ conversation_id: c.id, role: 'assistant', content: '' });
    await updateMessageStream(m.id, 'hello');
    await updateMessageStream(m.id, 'hello world');
    const list = await listMessages(c.id);
    expect(list[0].content).toBe('hello world');
  });

  it('finishes a message with metadata', async () => {
    const c = await createConversation({ title: 'T' });
    const m = await appendMessage({ conversation_id: c.id, role: 'assistant', content: 'partial' });
    await finishMessage(m.id, { finish_reason: 'cancelled', token_count: 7, model_id: 'llama-3.2-3b-q4' });
    const list = await listMessages(c.id);
    expect(list[0].finish_reason).toBe('cancelled');
    expect(list[0].token_count).toBe(7);
    expect(list[0].model_id).toBe('llama-3.2-3b-q4');
  });

  it('deletes a message', async () => {
    const c = await createConversation({ title: 'T' });
    const m = await appendMessage({ conversation_id: c.id, role: 'user', content: 'x' });
    await deleteMessage(m.id);
    expect((await listMessages(c.id)).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Implement**

`src/db/messages.ts`:

```typescript
import { randomUUID } from 'expo-crypto';
import { getDb } from './db';

export type Role = 'user' | 'assistant' | 'system';
export type FinishReason = 'stop' | 'cancelled' | 'error' | 'length';

export type Message = {
  id: string;
  conversation_id: string;
  role: Role;
  content: string;
  created_at: number;
  model_id: string | null;
  token_count: number | null;
  finish_reason: FinishReason | null;
};

export const appendMessage = async (args: {
  conversation_id: string;
  role: Role;
  content: string;
  model_id?: string | null;
}): Promise<Message> => {
  const id = randomUUID();
  const now = Date.now();
  const msg: Message = {
    id, conversation_id: args.conversation_id, role: args.role, content: args.content,
    created_at: now, model_id: args.model_id ?? null, token_count: null, finish_reason: null
  };
  await getDb().runAsync(
    'INSERT INTO messages(id,conversation_id,role,content,created_at,model_id,token_count,finish_reason) VALUES (?,?,?,?,?,?,?,?)',
    msg.id, msg.conversation_id, msg.role, msg.content, msg.created_at, msg.model_id, msg.token_count, msg.finish_reason
  );
  return msg;
};

export const listMessages = async (conversationId: string): Promise<Message[]> =>
  getDb().getAllAsync<Message>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC',
    conversationId
  );

export const updateMessageStream = async (id: string, content: string): Promise<void> => {
  await getDb().runAsync('UPDATE messages SET content = ? WHERE id = ?', content, id);
};

export const finishMessage = async (
  id: string,
  meta: { finish_reason: FinishReason; token_count?: number; model_id?: string }
): Promise<void> => {
  await getDb().runAsync(
    'UPDATE messages SET finish_reason = ?, token_count = ?, model_id = COALESCE(?, model_id) WHERE id = ?',
    meta.finish_reason, meta.token_count ?? null, meta.model_id ?? null, id
  );
};

export const deleteMessage = async (id: string): Promise<void> => {
  await getDb().runAsync('DELETE FROM messages WHERE id = ?', id);
};
```

- [ ] **Step 4: Run test, verify PASS**
- [ ] **Step 5: Commit**

```bash
git add src/db/messages.ts src/db/__tests__/messages.test.ts
git commit -m "feat(db): messages repo with streaming updates"
```

---

## Phase 4 — Model layer

### Task 15: Model catalog

**Files:** `src/model/catalog.ts`

- [ ] **Step 1: Create catalog**

```typescript
export type ModelTier = 'compact' | 'standard' | 'capable';

export type ModelCatalogEntry = {
  id: string;
  tier: ModelTier;
  displayName: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  contextLen: number;
  minRamGB: number;
  recommendedRamGB: number;
  goodFor: string;
};

export const CATALOG: ModelCatalogEntry[] = [
  {
    id: 'llama-3.2-1b-q4',
    tier: 'compact',
    displayName: 'Llama 3.2 1B (Q4_K_M)',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 770_000_000,
    contextLen: 4096,
    minRamGB: 4,
    recommendedRamGB: 6,
    goodFor: 'quick answers, low-end devices, instant warmup'
  },
  {
    id: 'llama-3.2-3b-q4',
    tier: 'standard',
    displayName: 'Llama 3.2 3B (Q4_K_M)',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 2_020_000_000,
    contextLen: 4096,
    minRamGB: 6,
    recommendedRamGB: 8,
    goodFor: 'balanced quality and speed, the everyday default'
  },
  {
    id: 'qwen-2.5-7b-q4',
    tier: 'capable',
    displayName: 'Qwen 2.5 7B (Q4_K_M)',
    url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
    sha256: 'REPLACE_WITH_REAL_SHA256_BEFORE_SHIP',
    sizeBytes: 4_680_000_000,
    contextLen: 4096,
    minRamGB: 10,
    recommendedRamGB: 12,
    goodFor: 'highest-quality answers, longer reasoning, top devices only'
  }
];

export const getCatalogEntry = (id: string): ModelCatalogEntry | undefined =>
  CATALOG.find(e => e.id === id);

export const DEFAULT_MODEL_ID = 'llama-3.2-3b-q4';
```

> **Note:** The `sha256` placeholders MUST be replaced with real hashes before any production build. Compute via `shasum -a 256 <file.gguf>` after downloading once on a desktop. For dev/internal builds, the SHA check can be soft-bypassed via a debug flag in `model/download.ts`.

- [ ] **Step 2: Commit**

```bash
git add src/model/catalog.ts
git commit -m "feat(model): static catalog of three tiers"
```

---

### Task 16: Storage helpers

**Files:** `src/model/storage.ts`, `src/model/__tests__/storage.test.ts`

- [ ] **Step 1: Write tests** (using mocked `expo-file-system`)

```typescript
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///docs/',
  makeDirectoryAsync: jest.fn(async () => {}),
  getInfoAsync: jest.fn(async (p: string) => ({ exists: p.includes('exists'), uri: p })),
  deleteAsync: jest.fn(async () => {}),
  getFreeDiskStorageAsync: jest.fn(async () => 5_000_000_000)
}));

import { modelPath, modelExists, deleteModel, freeDiskBytes, modelsDir } from '../storage';

describe('model/storage', () => {
  it('returns the conventional path under documents/models/', () => {
    expect(modelsDir()).toBe('file:///docs/models/');
    expect(modelPath('llama-3.2-3b-q4')).toBe('file:///docs/models/llama-3.2-3b-q4.gguf');
  });

  it('reports existence', async () => {
    await expect(modelExists('exists-id')).resolves.toBe(true);
    await expect(modelExists('missing')).resolves.toBe(false);
  });

  it('deletes', async () => {
    await deleteModel('llama-3.2-3b-q4');
  });

  it('reports free disk', async () => {
    await expect(freeDiskBytes()).resolves.toBe(5_000_000_000);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

`src/model/storage.ts`:

```typescript
import * as FS from 'expo-file-system';

export const modelsDir = (): string => `${FS.documentDirectory}models/`;
export const modelPath = (id: string): string => `${modelsDir()}${id}.gguf`;

export const ensureModelsDir = async (): Promise<void> => {
  await FS.makeDirectoryAsync(modelsDir(), { intermediates: true });
};

export const modelExists = async (id: string): Promise<boolean> => {
  const info = await FS.getInfoAsync(modelPath(id));
  return info.exists;
};

export const deleteModel = async (id: string): Promise<void> => {
  await FS.deleteAsync(modelPath(id), { idempotent: true });
};

export const freeDiskBytes = async (): Promise<number> => FS.getFreeDiskStorageAsync();

export const totalModelBytes = async (ids: string[]): Promise<number> => {
  let total = 0;
  for (const id of ids) {
    const info = await FS.getInfoAsync(modelPath(id));
    if (info.exists && info.size) total += info.size;
  }
  return total;
};
```

- [ ] **Step 4: Run, verify PASS**
- [ ] **Step 5: Commit**

```bash
git add src/model/storage.ts src/model/__tests__/storage.test.ts
git commit -m "feat(model): storage helpers"
```

---

### Task 17: Download with progress, resume, SHA-256

**Files:** `src/model/download.ts`, `src/model/__tests__/download.test.ts`

- [ ] **Step 1: Write tests** (mocked FileSystem.createDownloadResumable)

```typescript
jest.mock('expo-file-system', () => {
  let progressFn: ((p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void) | null = null;
  return {
    documentDirectory: 'file:///docs/',
    makeDirectoryAsync: jest.fn(async () => {}),
    getInfoAsync: jest.fn(async (p: string) => ({ exists: false, uri: p, size: 0 })),
    deleteAsync: jest.fn(async () => {}),
    getFreeDiskStorageAsync: jest.fn(async () => 10_000_000_000),
    createDownloadResumable: jest.fn((_url: string, _path: string, _opts: unknown, onProgress: (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void) => {
      progressFn = onProgress;
      return {
        downloadAsync: jest.fn(async () => {
          progressFn?.({ totalBytesWritten: 50, totalBytesExpectedToWrite: 100 });
          progressFn?.({ totalBytesWritten: 100, totalBytesExpectedToWrite: 100 });
          return { uri: _path };
        }),
        savable: jest.fn(() => ({}))
      };
    }),
    readAsStringAsync: jest.fn(async () => 'fake'),
    EncodingType: { Base64: 'base64' }
  };
});

jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn(async () => 'computed_sha'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' }
}));

import { downloadModel } from '../download';
import { CATALOG } from '../catalog';

describe('model/download', () => {
  it('reports progress and completes', async () => {
    const entry = { ...CATALOG[0], sha256: 'computed_sha', sizeBytes: 100 };
    const progress: number[] = [];
    await downloadModel(entry, { onProgress: p => progress.push(p), skipShaCheck: false });
    expect(progress.length).toBeGreaterThanOrEqual(2);
    expect(progress[progress.length - 1]).toBe(1);
  });

  it('throws if free disk is insufficient', async () => {
    const FS = require('expo-file-system');
    FS.getFreeDiskStorageAsync.mockResolvedValueOnce(50);
    const entry = { ...CATALOG[0], sizeBytes: 100, sha256: 'computed_sha' };
    await expect(downloadModel(entry, { skipShaCheck: true })).rejects.toThrow(/free disk/i);
  });

  it('throws on SHA mismatch', async () => {
    const entry = { ...CATALOG[0], sha256: 'WRONG', sizeBytes: 100 };
    await expect(downloadModel(entry, { skipShaCheck: false })).rejects.toThrow(/sha-256/i);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

`src/model/download.ts`:

```typescript
import * as FS from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { ensureModelsDir, modelPath, freeDiskBytes } from './storage';
import { ModelCatalogEntry } from './catalog';

export type DownloadOptions = {
  onProgress?: (fraction: number) => void;
  skipShaCheck?: boolean;
  signal?: AbortSignal;
};

export const downloadModel = async (
  entry: ModelCatalogEntry,
  opts: DownloadOptions = {}
): Promise<string> => {
  await ensureModelsDir();
  const target = modelPath(entry.id);

  // Pre-flight free-disk check (1.25× sizeBytes).
  const free = await freeDiskBytes();
  const needed = Math.ceil(entry.sizeBytes * 1.25);
  if (free < needed) {
    const gapMB = Math.ceil((needed - free) / 1_000_000);
    throw new Error(`Need ${gapMB} MB more free disk space`);
  }

  // Resume if a partial download exists at target.
  const partial = await FS.getInfoAsync(target);
  const startBytes = partial.exists && partial.size ? partial.size : 0;

  const resumable = FS.createDownloadResumable(
    entry.url,
    target,
    { headers: startBytes ? { Range: `bytes=${startBytes}-` } : undefined },
    (progress) => {
      if (opts.signal?.aborted) return;
      const total = progress.totalBytesExpectedToWrite || entry.sizeBytes;
      const written = (startBytes ?? 0) + progress.totalBytesWritten;
      opts.onProgress?.(Math.min(1, written / total));
    }
  );

  if (opts.signal) {
    opts.signal.addEventListener('abort', () => {
      resumable.pauseAsync().catch(() => {});
    });
  }

  const result = await resumable.downloadAsync();
  if (!result) throw new Error('download returned no result');

  if (!opts.skipShaCheck) {
    // Note: hashing a 2GB file via base64 in JS is slow (~30s+).
    // For internal/dev builds skipShaCheck=true is acceptable.
    const fileContent = await FS.readAsStringAsync(target, { encoding: FS.EncodingType.Base64 });
    const computed = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      fileContent,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    if (computed !== entry.sha256) {
      await FS.deleteAsync(target, { idempotent: true });
      throw new Error(`SHA-256 mismatch: expected ${entry.sha256}, got ${computed}`);
    }
  }

  opts.onProgress?.(1);
  return target;
};
```

- [ ] **Step 4: Run, verify PASS**
- [ ] **Step 5: Commit**

```bash
git add src/model/download.ts src/model/__tests__/download.test.ts
git commit -m "feat(model): download with resume + sha verification"
```

---

## Phase 5 — Chat orchestration

### Task 18: promptBuilder (pure function, heavy TDD)

**Files:** `src/chat/promptBuilder.ts`, `src/chat/__tests__/promptBuilder.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { buildPrompt, BuildPromptArgs } from '../promptBuilder';
import { Message } from '@/db/messages';

const mkMsg = (role: 'user' | 'assistant', content: string, t = 1): Message => ({
  id: Math.random().toString(), conversation_id: 'c', role, content,
  created_at: t, model_id: null, token_count: null, finish_reason: null
});

describe('buildPrompt', () => {
  const baseArgs: BuildPromptArgs = {
    defaultSystemPrompt: '',
    projectNotes: '',
    conversationSystemPrompt: '',
    history: [],
    newUserTurn: 'hello',
    contextWindow: 4096,
    reservedForResponse: 1024
  };

  it('builds minimal prompt with just user turn', () => {
    const r = buildPrompt(baseArgs);
    expect(r.text).toContain('hello');
    expect(r.dropped).toBe(0);
  });

  it('combines all three system layers in order', () => {
    const r = buildPrompt({
      ...baseArgs,
      defaultSystemPrompt: 'be concise',
      projectNotes: 'Tom is the backend lead',
      conversationSystemPrompt: 'this is a 1:1 prep'
    });
    const sys = r.text.split('\n\n')[0];
    expect(sys).toContain('be concise');
    expect(sys).toContain('Tom is the backend lead');
    expect(sys).toContain('this is a 1:1 prep');
    expect(sys.indexOf('be concise')).toBeLessThan(sys.indexOf('Tom is the backend lead'));
    expect(sys.indexOf('Tom is the backend lead')).toBeLessThan(sys.indexOf('this is a 1:1 prep'));
  });

  it('drops oldest pairs to fit budget', () => {
    const longContent = 'x'.repeat(2000); // ~500 tokens at 4 chars/tok
    const history = [
      mkMsg('user', longContent, 1),
      mkMsg('assistant', longContent, 2),
      mkMsg('user', longContent, 3),
      mkMsg('assistant', longContent, 4),
      mkMsg('user', longContent, 5),
      mkMsg('assistant', longContent, 6)
    ];
    const r = buildPrompt({
      ...baseArgs,
      history,
      contextWindow: 2048,
      reservedForResponse: 256
    });
    expect(r.dropped).toBeGreaterThan(0);
  });

  it('throws when even the system + new turn exceeds budget', () => {
    expect(() => buildPrompt({
      ...baseArgs,
      defaultSystemPrompt: 'x'.repeat(50000),
      contextWindow: 1024,
      reservedForResponse: 256
    })).toThrow(/too long/i);
  });

  it('preserves pair integrity (user+assistant always dropped together)', () => {
    const history = [
      mkMsg('user', 'old user 1', 1),
      mkMsg('assistant', 'old asst 1', 2),
      mkMsg('user', 'recent user', 3),
      mkMsg('assistant', 'recent asst', 4)
    ];
    const r = buildPrompt({
      ...baseArgs,
      history,
      contextWindow: 200, // very tight
      reservedForResponse: 50
    });
    if (r.dropped > 0) {
      expect(r.dropped % 2).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

`src/chat/promptBuilder.ts`:

```typescript
import type { Message } from '@/db/messages';

export type BuildPromptArgs = {
  defaultSystemPrompt: string;
  projectNotes: string;
  conversationSystemPrompt: string;
  history: Message[];          // ordered oldest→newest
  newUserTurn: string;
  contextWindow: number;
  reservedForResponse: number;
};

export type BuildPromptResult = {
  text: string;
  dropped: number;
  systemTokensApprox: number;
  historyTokensApprox: number;
};

const SAFETY = 256;
// Cheap approximate token count: 1 token ≈ 4 chars (plenty conservative for English).
const approxTokens = (s: string): number => Math.ceil(s.length / 4);

const composeSystem = (a: BuildPromptArgs): string => {
  const parts: string[] = [];
  if (a.defaultSystemPrompt.trim()) parts.push(a.defaultSystemPrompt.trim());
  if (a.projectNotes.trim()) parts.push(`PROJECT CONTEXT:\n${a.projectNotes.trim()}`);
  if (a.conversationSystemPrompt.trim()) parts.push(a.conversationSystemPrompt.trim());
  return parts.join('\n\n');
};

const formatTurn = (role: 'user' | 'assistant', content: string): string =>
  role === 'user' ? `<|user|>\n${content}` : `<|assistant|>\n${content}`;

export const buildPrompt = (args: BuildPromptArgs): BuildPromptResult => {
  const budget = args.contextWindow - args.reservedForResponse - SAFETY;
  if (budget <= 0) throw new Error('context window too small for reserved response');

  const sys = composeSystem(args);
  const sysBlock = sys ? `<|system|>\n${sys}\n\n` : '';
  const newTurn = `${formatTurn('user', args.newUserTurn)}\n<|assistant|>\n`;

  const sysTokens = approxTokens(sysBlock);
  const newTurnTokens = approxTokens(newTurn);
  const fixedTokens = sysTokens + newTurnTokens;

  if (fixedTokens > budget) {
    throw new Error('Message too long for current context window');
  }

  // Walk history newest→oldest, including pairs (user+assistant).
  const pairs: Array<[Message, Message | undefined]> = [];
  for (let i = args.history.length - 1; i >= 0; i--) {
    const m = args.history[i];
    if (m.role === 'assistant') {
      const u = i > 0 && args.history[i - 1].role === 'user' ? args.history[i - 1] : undefined;
      pairs.push([m, u]);
      if (u) i -= 1;
    } else if (m.role === 'user') {
      pairs.push([m, undefined]);
    }
  }
  // pairs is now newest→oldest
  let used = fixedTokens;
  const includedPairs: Array<[Message, Message | undefined]> = [];
  for (const [a2, b] of pairs) {
    const text = b
      ? `${formatTurn('user', b.content)}\n${formatTurn('assistant', a2.content)}\n`
      : `${formatTurn(a2.role as 'user' | 'assistant', a2.content)}\n`;
    const tk = approxTokens(text);
    if (used + tk > budget) break;
    used += tk;
    includedPairs.push([a2, b]);
  }
  const droppedPairs = pairs.length - includedPairs.length;
  const droppedMessages = pairs
    .slice(includedPairs.length)
    .reduce((sum, [, b]) => sum + (b ? 2 : 1), 0);

  // Render included pairs oldest→newest.
  const historyText = includedPairs
    .reverse()
    .map(([a2, b]) => b
      ? `${formatTurn('user', b.content)}\n${formatTurn('assistant', a2.content)}\n`
      : `${formatTurn(a2.role as 'user' | 'assistant', a2.content)}\n`
    )
    .join('');

  const text = sysBlock + historyText + newTurn;
  return {
    text,
    dropped: droppedMessages,
    systemTokensApprox: sysTokens,
    historyTokensApprox: used - fixedTokens
  };
};
```

- [ ] **Step 4: Run, verify PASS** (5 tests)
- [ ] **Step 5: Commit**

```bash
git add src/chat/promptBuilder.ts src/chat/__tests__/promptBuilder.test.ts
git commit -m "feat(chat): promptBuilder with context budgeting"
```

---

### Task 19: useConversation hook

**Files:** `src/chat/useConversation.ts`

This is integration glue — tested via component tests in Task 28 (Conversation screen).

- [ ] **Step 1: Implement**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { Message, appendMessage, finishMessage, listMessages, updateMessageStream } from '@/db/messages';
import { Conversation, getConversation, touchConversation } from '@/db/conversations';
import { Project, getProject } from '@/db/projects';
import { getAllSettings, Settings } from '@/db/settings';
import { getEngine } from '@/engine';
import { buildPrompt } from './promptBuilder';
import { getCatalogEntry } from '@/model/catalog';
import { modelPath } from '@/model/storage';

export type ConversationStatus = 'idle' | 'warming' | 'streaming' | 'error' | 'cancelled';

export type UseConversationState = {
  conversation: Conversation | null;
  project: Project | null;
  messages: Message[];
  status: ConversationStatus;
  error: string | null;
  tokenCount: number;
  tokRate: number; // tokens per second over the last 1s
};

export const useConversation = (conversationId: string) => {
  const [state, setState] = useState<UseConversationState>({
    conversation: null, project: null, messages: [],
    status: 'idle', error: null, tokenCount: 0, tokRate: 0
  });
  const abortRef = useRef<AbortController | null>(null);
  const settingsRef = useRef<Settings | null>(null);

  const reload = useCallback(async () => {
    const conv = await getConversation(conversationId);
    if (!conv) return;
    const project = conv.project_id ? await getProject(conv.project_id) : null;
    const messages = await listMessages(conversationId);
    if (!settingsRef.current) settingsRef.current = await getAllSettings();
    setState(s => ({ ...s, conversation: conv, project, messages }));
  }, [conversationId]);

  useEffect(() => { reload(); }, [reload]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || state.status === 'streaming') return;
    const settings = settingsRef.current ?? await getAllSettings();
    settingsRef.current = settings;

    const conv = state.conversation ?? await getConversation(conversationId);
    if (!conv) throw new Error('conversation not found');
    const project = conv.project_id ? await getProject(conv.project_id) : null;
    const history = await listMessages(conversationId);

    const userMsg = await appendMessage({ conversation_id: conv.id, role: 'user', content: text });
    const asstMsg = await appendMessage({
      conversation_id: conv.id, role: 'assistant', content: '',
      model_id: settings.active_model_id ?? null
    });
    setState(s => ({ ...s, messages: [...history, userMsg, asstMsg], status: 'streaming', tokenCount: 0, tokRate: 0, error: null }));

    let prompt: string;
    try {
      const built = buildPrompt({
        defaultSystemPrompt: settings.default_system_prompt,
        projectNotes: project?.notes ?? '',
        conversationSystemPrompt: conv.system_prompt,
        history,
        newUserTurn: text,
        contextWindow: settings.context_window,
        reservedForResponse: settings.max_tokens
      });
      prompt = built.text;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finishMessage(asstMsg.id, { finish_reason: 'error' });
      setState(s => ({ ...s, status: 'error', error: msg }));
      return;
    }

    // Engine load if not ready
    const engine = getEngine();
    if (!engine.isReady()) {
      const modelId = settings.active_model_id;
      if (!modelId) {
        setState(s => ({ ...s, status: 'error', error: 'no active model' }));
        return;
      }
      const entry = getCatalogEntry(modelId);
      if (!entry) {
        setState(s => ({ ...s, status: 'error', error: 'unknown model id' }));
        return;
      }
      setState(s => ({ ...s, status: 'warming' }));
      try {
        await engine.load(modelPath(modelId));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await finishMessage(asstMsg.id, { finish_reason: 'error' });
        setState(s => ({ ...s, status: 'error', error: msg }));
        return;
      }
      setState(s => ({ ...s, status: 'streaming' }));
    }

    abortRef.current = new AbortController();
    let buffer = '';
    let count = 0;
    const startedAt = Date.now();
    let lastFlush = startedAt;

    const flush = async () => {
      lastFlush = Date.now();
      await updateMessageStream(asstMsg.id, buffer);
      setState(s => ({
        ...s,
        messages: s.messages.map(m => m.id === asstMsg.id ? { ...m, content: buffer } : m),
        tokenCount: count,
        tokRate: count / Math.max(0.5, (Date.now() - startedAt) / 1000)
      }));
    };

    await engine.streamCompletion(
      prompt,
      { temperature: settings.temperature, maxTokens: settings.max_tokens, signal: abortRef.current.signal },
      {
        onToken: (t) => {
          buffer += t;
          count++;
          if (Date.now() - lastFlush >= 33) { void flush(); }
        },
        onDone: async ({ tokenCount, finishReason }) => {
          await updateMessageStream(asstMsg.id, buffer);
          await finishMessage(asstMsg.id, { finish_reason: finishReason, token_count: tokenCount, model_id: settings.active_model_id ?? undefined });
          await touchConversation(conv.id);
          setState(s => ({
            ...s, status: 'idle', tokenCount,
            messages: s.messages.map(m => m.id === asstMsg.id ? { ...m, content: buffer, token_count: tokenCount, finish_reason: finishReason } : m)
          }));
        },
        onError: async (err) => {
          await updateMessageStream(asstMsg.id, buffer);
          if (err.name === 'AbortError') {
            await finishMessage(asstMsg.id, { finish_reason: 'cancelled' });
            setState(s => ({
              ...s, status: 'cancelled',
              messages: s.messages.map(m => m.id === asstMsg.id ? { ...m, content: buffer, finish_reason: 'cancelled' } : m)
            }));
          } else {
            await finishMessage(asstMsg.id, { finish_reason: 'error' });
            setState(s => ({
              ...s, status: 'error', error: err.message,
              messages: s.messages.map(m => m.id === asstMsg.id ? { ...m, content: buffer, finish_reason: 'error' } : m)
            }));
          }
        }
      }
    );
  }, [conversationId, state.conversation, state.status]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { ...state, send, stop, reload };
};
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/chat/useConversation.ts
git commit -m "feat(chat): useConversation orchestration hook"
```

---

## Phase 6 — UI components

### Task 20: Theme-aware primitives

**Files:**
- `src/ui/components/MetaLine.tsx`
- `src/ui/components/StreamingCursor.tsx`
- `src/ui/components/ProjectPill.tsx`
- `src/ui/components/ScreenHeader.tsx`

- [ ] **Step 1: Create `MetaLine`**

```tsx
import { Text, View, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../theme/useTheme';

export const MetaLine = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => {
  const t = useTheme();
  return (
    <View style={style}>
      <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>{children}</Text>
    </View>
  );
};
```

- [ ] **Step 2: Create `StreamingCursor`**

```tsx
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useTheme } from '../theme/useTheme';

export const StreamingCursor = () => {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 525, easing: Easing.step1, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 525, easing: Easing.step1, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View style={{
      width: 7, height: 14, marginLeft: 2, opacity,
      backgroundColor: t.colors.text.primary, alignSelf: 'baseline'
    }} />
  );
};
```

- [ ] **Step 3: Create `ProjectPill`**

```tsx
import { Text, View, Pressable } from 'react-native';
import { useTheme } from '../theme/useTheme';

export const ProjectPill = ({ name, onPress }: { name: string; onPress?: () => void }) => {
  const t = useTheme();
  const inner = (
    <View style={{
      paddingHorizontal: t.spacing.sm, paddingVertical: 3,
      borderWidth: 1, borderColor: t.colors.border.default, borderRadius: t.radii.sm
    }}>
      <Text style={{ ...t.type.label, color: t.colors.text.secondary, fontSize: 9.5 }}>
        {name.toUpperCase()}
      </Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
};
```

- [ ] **Step 4: Create `ScreenHeader`**

```tsx
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

type Props = {
  left?: React.ReactNode;
  title?: string;
  right?: React.ReactNode;
};

export const ScreenHeader = ({ left, title, right }: Props) => {
  const t = useTheme();
  return (
    <View style={{
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.md,
      paddingBottom: t.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border.subtle,
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm
    }}>
      <View>{left}</View>
      <View style={{ flex: 1 }}>
        {title ? <Text style={{ ...t.type.heading, color: t.colors.text.primary }}>{title}</Text> : null}
      </View>
      <View>{right}</View>
    </View>
  );
};
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/MetaLine.tsx src/ui/components/StreamingCursor.tsx src/ui/components/ProjectPill.tsx src/ui/components/ScreenHeader.tsx
git commit -m "feat(ui): theme-aware primitives"
```

---

### Task 21: MessageBubble (user + assistant)

**Files:** `src/ui/components/MessageBubble.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../theme/useTheme';
import { Message } from '@/db/messages';
import { StreamingCursor } from './StreamingCursor';
import { MetaLine } from './MetaLine';

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const metaForMessage = (m: Message, isStreaming: boolean): string => {
  const time = formatTime(m.created_at);
  if (isStreaming) return `${time} · streaming · ${m.token_count ?? 0} tok`;
  if (m.finish_reason === 'cancelled') return `${time} · stopped`;
  if (m.finish_reason === 'error') return `${time} · errored`;
  if (m.role === 'user') return `${time} · sent`;
  return `${time} · ${m.token_count ?? 0} tok`;
};

export const MessageBubble = ({
  message, isStreaming
}: { message: Message; isStreaming: boolean }) => {
  const t = useTheme();

  if (message.role === 'user') {
    return (
      <View style={{ marginBottom: t.spacing.lg }}>
        <MetaLine style={{ marginBottom: t.spacing.xs }}>{metaForMessage(message, false)}</MetaLine>
        <View style={{
          paddingLeft: t.spacing.md,
          borderLeftWidth: 2,
          borderLeftColor: t.colors.border.default
        }}>
          <Text style={{ ...t.type.bodyUser, color: t.colors.text.secondary }}>
            <Text style={{ color: t.colors.text.quiet }}>{'> '}</Text>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  // assistant
  return (
    <View style={{ marginBottom: t.spacing.lg }}>
      <MetaLine style={{ marginBottom: t.spacing.xs }}>{metaForMessage(message, isStreaming)}</MetaLine>
      <View style={{
        paddingLeft: t.spacing.md,
        borderLeftWidth: 2,
        borderLeftColor: t.colors.text.primary
      }}>
        <Markdown
          style={{
            body: { ...t.type.bodyAi, color: t.colors.text.primary },
            code_inline: { backgroundColor: t.colors.bg.subtle, fontFamily: t.fonts.mono, fontSize: 14, paddingHorizontal: 5, borderRadius: 2 },
            fence: { backgroundColor: t.colors.bg.subtle, fontFamily: t.fonts.mono, fontSize: 13, padding: t.spacing.sm, borderRadius: 4 },
            paragraph: { marginTop: 0, marginBottom: t.spacing.sm }
          }}
        >
          {message.content || ' '}
        </Markdown>
        {isStreaming ? <StreamingCursor /> : null}
      </View>
    </View>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/MessageBubble.tsx
git commit -m "feat(ui): MessageBubble user + assistant variants"
```

---

### Task 22: StatusLine (all states)

**Files:** `src/ui/components/StatusLine.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

export type StatusLineState =
  | { kind: 'empty'; project?: string; conv?: string; modelId: string; ctx: number }
  | { kind: 'typing'; project?: string; conv?: string; modelId: string; charCount: number }
  | { kind: 'streaming'; tokenCount: number; tokRate: number }
  | { kind: 'warming' }
  | { kind: 'error'; reason: string }
  | { kind: 'ctxFull' };

const breadcrumb = (project?: string, conv?: string): string => {
  const parts = ['~'];
  if (project) parts.push(project.toLowerCase().replace(/\s+/g, '-'));
  if (conv) parts.push(conv.toLowerCase().replace(/\s+/g, '-').slice(0, 24));
  return parts.join('/');
};

export const StatusLine = ({ state }: { state: StatusLineState }) => {
  const t = useTheme();
  let left: string; let right: string | null = null; let warm = false;

  switch (state.kind) {
    case 'empty':
      left = `${breadcrumb(state.project, state.conv)} · ${state.modelId} · ctx ${state.ctx}`;
      break;
    case 'typing':
      left = `${breadcrumb(state.project, state.conv)} · ${state.modelId}`;
      right = `${state.charCount} chars`;
      break;
    case 'streaming':
      left = `● generating · ${state.tokenCount} tok · ${state.tokRate.toFixed(0)} tok/s`;
      warm = true;
      break;
    case 'warming':
      left = '◐ warming up…';
      warm = true;
      break;
    case 'error':
      left = `✕ ${state.reason}`;
      right = 'tap to retry';
      warm = true;
      break;
    case 'ctxFull':
      left = '⚠ context full · oldest turn dropped';
      warm = true;
      break;
  }

  const color = warm ? t.colors.accent.warm : t.colors.text.tertiary;

  return (
    <View style={{
      paddingHorizontal: t.spacing.md,
      paddingTop: t.spacing.sm,
      paddingBottom: t.spacing.xs,
      flexDirection: 'row',
      justifyContent: 'space-between'
    }}>
      <Text style={{ ...t.type.meta, color }} numberOfLines={1}>{left}</Text>
      {right ? <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>{right}</Text> : null}
    </View>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/StatusLine.tsx
git commit -m "feat(ui): StatusLine with all 6 states"
```

---

### Task 23: Composer

**Files:** `src/ui/components/Composer.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react';
import { Pressable, Text, TextInput, View, Keyboard } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { StatusLine, StatusLineState } from './StatusLine';

type Props = {
  status: StatusLineState;
  disabled?: boolean;
  isStreaming?: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
  placeholder?: string;
};

export const Composer = ({ status, disabled, isStreaming, onSend, onStop, placeholder = 'message' }: Props) => {
  const t = useTheme();
  const [value, setValue] = useState('');

  const liveStatus: StatusLineState = isStreaming
    ? status
    : value.length > 0 && status.kind === 'empty'
      ? { kind: 'typing', project: status.project, conv: status.conv, modelId: status.modelId, charCount: value.length }
      : status;

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    Keyboard.dismiss();
  };

  return (
    <View style={{
      borderTopWidth: 1,
      borderTopColor: t.colors.border.subtle,
      backgroundColor: t.colors.bg.canvas
    }}>
      <StatusLine state={liveStatus} />
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: t.spacing.md,
        paddingTop: t.spacing.xs,
        paddingBottom: t.spacing.md,
        gap: t.spacing.sm
      }}>
        <Text style={{ ...t.type.bodyUser, color: isStreaming ? t.colors.text.quiet : t.colors.text.tertiary }}>$</Text>
        <TextInput
          value={isStreaming ? '' : value}
          onChangeText={setValue}
          placeholder={isStreaming ? '…' : placeholder}
          placeholderTextColor={t.colors.text.quiet}
          editable={!isStreaming && !disabled}
          multiline
          style={{
            flex: 1,
            ...t.type.bodyUser,
            color: t.colors.text.primary,
            opacity: isStreaming ? 0.3 : 1,
            maxHeight: 120,
            paddingVertical: 4
          }}
          onSubmitEditing={send}
          submitBehavior="blurAndSubmit"
          returnKeyType="send"
        />
        {isStreaming ? (
          <Pressable onPress={onStop} style={{
            paddingHorizontal: t.spacing.sm + 1,
            paddingVertical: 4,
            borderWidth: 1,
            borderColor: t.colors.accent.warm,
            borderRadius: t.radii.sm
          }}>
            <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>STOP</Text>
          </Pressable>
        ) : (
          <Pressable onPress={send} disabled={value.trim().length === 0 || disabled}>
            <Text style={{ ...t.type.label, color: value.trim().length === 0 ? t.colors.text.quiet : t.colors.text.primary }}>↵</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/Composer.tsx
git commit -m "feat(ui): Composer with status-line + field"
```

---

### Task 24: ModelCard

**Files:** `src/ui/components/ModelCard.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { ModelCatalogEntry } from '@/model/catalog';

type Props = {
  entry: ModelCatalogEntry;
  selected?: boolean;
  installed?: boolean;
  active?: boolean;
  recommended?: boolean;
  belowMinRam?: boolean;
  onPress?: () => void;
};

const fmtGB = (bytes: number) => `${(bytes / 1_000_000_000).toFixed(1)} GB`;

export const ModelCard = ({
  entry, selected, installed, active, recommended, belowMinRam, onPress
}: Props) => {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      borderWidth: 1,
      borderColor: selected ? t.colors.accent.inverse : t.colors.border.default,
      borderRadius: t.radii.md,
      padding: t.spacing.md,
      marginBottom: t.spacing.sm,
      backgroundColor: selected ? t.colors.bg.subtle : 'transparent',
      opacity: pressed ? 0.85 : (belowMinRam ? 0.55 : 1)
    })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: t.spacing.xs }}>
        <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>{entry.tier.toUpperCase()}</Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.xs }}>
          {recommended ? <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>RECOMMENDED</Text> : null}
          {active ? <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>● ACTIVE</Text> : null}
          {installed && !active ? <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>INSTALLED</Text> : null}
        </View>
      </View>
      <Text style={{ ...t.type.bodyUser, color: t.colors.text.primary, marginBottom: t.spacing.xs }}>
        {entry.displayName}
      </Text>
      <Text style={{ ...t.type.bodyAi, color: t.colors.text.secondary, fontSize: 14, marginBottom: t.spacing.sm }}>
        {entry.goodFor}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>{fmtGB(entry.sizeBytes)}</Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>min {entry.minRamGB} GB RAM</Text>
      </View>
      {belowMinRam ? (
        <Text style={{ ...t.type.meta, color: t.colors.accent.warm, marginTop: t.spacing.xs }}>
          may be slow on this device
        </Text>
      ) : null}
    </Pressable>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/ModelCard.tsx
git commit -m "feat(ui): ModelCard for FirstRun and Settings"
```

---

## Phase 7 — Screens

### Task 25: FirstRunScreen

**Files:** `app/first-run.tsx`, `src/ui/screens/FirstRunScreen.tsx`

- [ ] **Step 1: Implement screen**

`src/ui/screens/FirstRunScreen.tsx`:

```tsx
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, Pressable, Alert } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { ModelCard } from '../components/ModelCard';
import { CATALOG, DEFAULT_MODEL_ID, ModelCatalogEntry } from '@/model/catalog';
import { downloadModel } from '@/model/download';
import { setSetting } from '@/db/settings';

type Props = { onComplete: () => void; deviceRamGB?: number };

const fmtGB = (b: number) => `${(b / 1_000_000_000).toFixed(1)} GB`;

export const FirstRunScreen = ({ onComplete, deviceRamGB = 8 }: Props) => {
  const t = useTheme();
  const [selected, setSelected] = useState<string>(DEFAULT_MODEL_ID);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const entry = CATALOG.find(e => e.id === selected)!;

  const start = async () => {
    setError(null);
    setDownloading(true);
    setProgress(0);
    try {
      await downloadModel(entry, {
        onProgress: setProgress,
        skipShaCheck: true // dev mode default; toggle in settings later
      });
      await setSetting('active_model_id', entry.id);
      onComplete();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{
      padding: t.spacing.xl,
      paddingTop: t.spacing.xxl + t.spacing.lg,
      backgroundColor: t.colors.bg.canvas,
      flexGrow: 1
    }}>
      <Text style={{ ...t.type.heading, color: t.colors.text.primary, marginBottom: t.spacing.xs }}>
        local chat
      </Text>
      <Text style={{ ...t.type.bodyAi, color: t.colors.text.secondary, fontSize: 15, marginBottom: t.spacing.xl }}>
        A private chat that runs on your device. No account, no cloud. Pick a model to download — you can install more later.
      </Text>

      {CATALOG.map(e => (
        <ModelCard
          key={e.id}
          entry={e}
          selected={selected === e.id}
          recommended={e.id === DEFAULT_MODEL_ID}
          belowMinRam={deviceRamGB < e.minRamGB}
          onPress={() => !downloading && setSelected(e.id)}
        />
      ))}

      {error ? (
        <Text style={{ ...t.type.meta, color: t.colors.accent.warm, marginTop: t.spacing.md }}>
          ✕ {error}
        </Text>
      ) : null}

      <Pressable onPress={start} disabled={downloading} style={{
        marginTop: t.spacing.lg,
        paddingVertical: t.spacing.md,
        backgroundColor: t.colors.accent.inverse,
        borderRadius: t.radii.sm,
        alignItems: 'center',
        opacity: downloading ? 0.7 : 1
      }}>
        {downloading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <ActivityIndicator color={t.colors.bg.canvas} />
            <Text style={{ ...t.type.label, color: t.colors.bg.canvas }}>
              DOWNLOADING {Math.round(progress * 100)}%
            </Text>
          </View>
        ) : (
          <Text style={{ ...t.type.label, color: t.colors.bg.canvas }}>
            DOWNLOAD {entry.displayName.toUpperCase()}  {fmtGB(entry.sizeBytes)}
          </Text>
        )}
      </Pressable>

      <View style={{ marginTop: t.spacing.lg, gap: t.spacing.xs }}>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>· runs on your device</Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>· no account, no cloud</Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>· you can install more models later</Text>
      </View>
    </ScrollView>
  );
};
```

- [ ] **Step 2: Wire route**

`app/first-run.tsx`:

```tsx
import { router } from 'expo-router';
import { FirstRunScreen } from '@/ui/screens/FirstRunScreen';

export default function FirstRun() {
  return <FirstRunScreen onComplete={() => router.replace('/')} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/first-run.tsx src/ui/screens/FirstRunScreen.tsx
git commit -m "feat(screens): FirstRun with model picker"
```

---

### Task 26: ConversationListScreen

**Files:** `app/index.tsx`, `src/ui/screens/ConversationListScreen.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import { Project, listProjects } from '@/db/projects';
import { Conversation, listConversations, createConversation } from '@/db/conversations';
import { listMessages } from '@/db/messages';

type Row = {
  type: 'project-header' | 'inbox-header' | 'conversation';
  project?: Project;
  conversation?: Conversation;
  preview?: string;
};

const formatRelative = (ts: number): string => {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d/60)}m`;
  if (d < 86400) return `${Math.floor(d/3600)}h`;
  return `${Math.floor(d/86400)}d`;
};

export const ConversationListScreen = () => {
  const t = useTheme();
  const [rows, setRows] = useState<Row[]>([]);

  const reload = useCallback(async () => {
    const [projects, conversations] = await Promise.all([listProjects(), listConversations()]);
    const byProject = new Map<string | null, Conversation[]>();
    for (const c of conversations) {
      const k = c.project_id;
      if (!byProject.has(k)) byProject.set(k, []);
      byProject.get(k)!.push(c);
    }
    const out: Row[] = [];
    if (byProject.has(null)) {
      out.push({ type: 'inbox-header' });
      for (const c of byProject.get(null)!) {
        const msgs = await listMessages(c.id);
        out.push({ type: 'conversation', conversation: c, preview: msgs[msgs.length - 1]?.content?.slice(0, 80) });
      }
    }
    for (const p of projects) {
      const list = byProject.get(p.id);
      if (!list) continue;
      out.push({ type: 'project-header', project: p });
      for (const c of list) {
        const msgs = await listMessages(c.id);
        out.push({ type: 'conversation', conversation: c, preview: msgs[msgs.length - 1]?.content?.slice(0, 80) });
      }
    }
    setRows(out);
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const newConversation = async () => {
    const c = await createConversation({ title: 'New conversation' });
    router.push(`/conversation/${c.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <ScreenHeader
        title="local chat"
        right={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <Pressable onPress={newConversation}><Text style={{ ...t.type.label, color: t.colors.text.primary }}>+ NEW</Text></Pressable>
            <Pressable onPress={() => router.push('/settings')}><Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>⚙</Text></Pressable>
          </View>
        }
      />
      {rows.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>~/no conversations yet</Text>
          <Pressable onPress={newConversation} style={{ marginTop: t.spacing.md }}>
            <Text style={{ ...t.type.label, color: t.colors.text.primary }}>+ NEW</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => `${r.type}-${r.project?.id ?? r.conversation?.id ?? i}`}
          renderItem={({ item }) => {
            if (item.type === 'inbox-header') return (
              <Text style={{ ...t.type.label, color: t.colors.text.tertiary, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.lg, paddingBottom: t.spacing.xs }}>~/INBOX</Text>
            );
            if (item.type === 'project-header') return (
              <Pressable onPress={() => item.project && router.push(`/project/${item.project.id}`)}>
                <Text style={{ ...t.type.label, color: t.colors.text.tertiary, paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.lg, paddingBottom: t.spacing.xs }}>
                  ~/{item.project!.name.toUpperCase()}
                </Text>
              </Pressable>
            );
            if (item.type === 'conversation' && item.conversation) {
              const c = item.conversation;
              return (
                <Pressable onPress={() => router.push(`/conversation/${c.id}`)} style={{ paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm + 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Text style={{ ...t.type.bodyUser, color: t.colors.text.primary, flex: 1 }} numberOfLines={1}>{c.title}</Text>
                    <Text style={{ ...t.type.meta, color: t.colors.text.tertiary, marginLeft: t.spacing.sm }}>{formatRelative(c.updated_at)}</Text>
                  </View>
                  {item.preview ? (
                    <Text style={{ ...t.type.bodyAi, color: t.colors.text.tertiary, fontSize: 13 }} numberOfLines={1}>
                      {item.preview}
                    </Text>
                  ) : null}
                </Pressable>
              );
            }
            return null;
          }}
        />
      )}
    </View>
  );
};
```

- [ ] **Step 2: Wire route**

`app/index.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { ConversationListScreen } from '@/ui/screens/ConversationListScreen';
import { getSetting } from '@/db/settings';
import { modelExists } from '@/model/storage';

export default function Index() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const id = await getSetting('active_model_id');
      if (!id || !(await modelExists(id))) {
        router.replace('/first-run');
        return;
      }
      setReady(true);
    })();
  }, []);

  if (!ready) return <View style={{ flex: 1 }}><ActivityIndicator /></View>;
  return <ConversationListScreen />;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/index.tsx src/ui/screens/ConversationListScreen.tsx
git commit -m "feat(screens): ConversationList with project grouping"
```

---

### Task 27: ConversationScreen

**Files:** `app/conversation/[id].tsx`, `src/ui/screens/ConversationScreen.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useRef } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import { ProjectPill } from '../components/ProjectPill';
import { MessageBubble } from '../components/MessageBubble';
import { Composer } from '../components/Composer';
import { StatusLineState } from '../components/StatusLine';
import { useConversation } from '@/chat/useConversation';
import { useEffect, useState } from 'react';
import { getSetting } from '@/db/settings';

export const ConversationScreen = ({ conversationId }: { conversationId: string }) => {
  const t = useTheme();
  const { conversation, project, messages, status, error, tokenCount, tokRate, send, stop } = useConversation(conversationId);
  const listRef = useRef<FlatList>(null);
  const [activeModel, setActiveModel] = useState<string>('');
  const [ctx, setCtx] = useState<number>(4096);

  useEffect(() => {
    (async () => {
      setActiveModel(await getSetting('active_model_id') ?? '');
      setCtx(await getSetting('context_window'));
    })();
  }, []);

  const isStreaming = status === 'streaming';
  const isWarming = status === 'warming';

  const statusState: StatusLineState = isWarming
    ? { kind: 'warming' }
    : status === 'error'
      ? { kind: 'error', reason: error ?? 'unknown' }
      : isStreaming
        ? { kind: 'streaming', tokenCount, tokRate }
        : { kind: 'empty', project: project?.name, conv: conversation?.title, modelId: activeModel || 'no-model', ctx };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScreenHeader
        left={<Pressable onPress={() => router.back()}><Text style={{ ...t.type.heading, color: t.colors.text.primary }}>←</Text></Pressable>}
        title={conversation?.title ?? '…'}
        right={project ? <ProjectPill name={project.name} onPress={() => router.push(`/project/${project.id}`)} /> : null}
      />
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={{ padding: t.spacing.lg }}
        renderItem={({ item, index }) => (
          <MessageBubble
            message={item}
            isStreaming={isStreaming && index === messages.length - 1 && item.role === 'assistant'}
          />
        )}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />
      <Composer
        status={statusState}
        isStreaming={isStreaming || isWarming}
        onSend={send}
        onStop={stop}
        disabled={!conversation}
      />
    </KeyboardAvoidingView>
  );
};
```

- [ ] **Step 2: Wire route**

`app/conversation/[id].tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/ui/screens/ConversationScreen';

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConversationScreen conversationId={id} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/conversation/ src/ui/screens/ConversationScreen.tsx
git commit -m "feat(screens): Conversation with streaming chat"
```

---

### Task 28: ProjectDetailScreen

**Files:** `app/project/[id].tsx`, `src/ui/screens/ProjectDetailScreen.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View, Alert } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import { Project, getProject, updateProject, deleteProject } from '@/db/projects';
import { Conversation, listConversationsByProject, createConversation } from '@/db/conversations';

export const ProjectDetailScreen = ({ projectId }: { projectId: string }) => {
  const t = useTheme();
  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const p = await getProject(projectId);
      if (p) { setProject(p); setName(p.name); setNotes(p.notes); }
      setConversations(await listConversationsByProject(projectId));
    })();
  }, [projectId]);

  const queueSave = (next: { name?: string; notes?: string }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateProject(projectId, next).catch(() => {});
    }, 500);
  };

  const onChangeName = (v: string) => { setName(v); queueSave({ name: v }); };
  const onChangeNotes = (v: string) => { setNotes(v); queueSave({ notes: v }); };

  const newInProject = async () => {
    const c = await createConversation({ title: 'New conversation', project_id: projectId });
    router.push(`/conversation/${c.id}`);
  };

  const confirmDelete = () => {
    Alert.alert('Delete project?', 'This deletes all conversations in this project.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteProject(projectId);
        router.replace('/');
      }}
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <ScreenHeader
        left={<Pressable onPress={() => router.back()}><Text style={{ ...t.type.heading, color: t.colors.text.primary }}>←</Text></Pressable>}
        right={<Pressable onPress={confirmDelete}><Text style={{ ...t.type.label, color: t.colors.accent.warm }}>DELETE</Text></Pressable>}
      />
      <View style={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <Text style={{ ...t.type.label, color: t.colors.text.tertiary }}>NAME</Text>
        <TextInput
          value={name}
          onChangeText={onChangeName}
          style={{ ...t.type.heading, color: t.colors.text.primary, borderBottomWidth: 1, borderBottomColor: t.colors.border.subtle, paddingVertical: t.spacing.xs }}
        />
        <Text style={{ ...t.type.label, color: t.colors.text.tertiary, marginTop: t.spacing.lg }}>NOTES</Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.quiet }}>What you tell the model about this project. Prepended to every conversation.</Text>
        <TextInput
          value={notes}
          onChangeText={onChangeNotes}
          multiline
          textAlignVertical="top"
          placeholder="Tom is the backend lead, worried about Q4 timeline…"
          placeholderTextColor={t.colors.text.quiet}
          style={{ ...t.type.bodyAi, color: t.colors.text.primary, fontSize: 15, minHeight: 160, padding: t.spacing.md, borderWidth: 1, borderColor: t.colors.border.subtle, borderRadius: t.radii.sm }}
        />

        <View style={{ marginTop: t.spacing.xl }}>
          <Text style={{ ...t.type.label, color: t.colors.text.tertiary, marginBottom: t.spacing.sm }}>CONVERSATIONS</Text>
          {conversations.map(c => (
            <Pressable key={c.id} onPress={() => router.push(`/conversation/${c.id}`)} style={{ paddingVertical: t.spacing.sm }}>
              <Text style={{ ...t.type.bodyUser, color: t.colors.text.primary }}>{c.title}</Text>
            </Pressable>
          ))}
          <Pressable onPress={newInProject} style={{ marginTop: t.spacing.sm }}>
            <Text style={{ ...t.type.label, color: t.colors.text.primary }}>+ NEW CONVERSATION IN PROJECT</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
};
```

- [ ] **Step 2: Wire route**

`app/project/[id].tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { ProjectDetailScreen } from '@/ui/screens/ProjectDetailScreen';

export default function Project() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProjectDetailScreen projectId={id} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/project/ src/ui/screens/ProjectDetailScreen.tsx
git commit -m "feat(screens): ProjectDetail with notes editor"
```

---

### Task 29: SettingsScreen + Models section

**Files:** `app/settings.tsx`, `src/ui/screens/SettingsScreen.tsx`

- [ ] **Step 1: Implement**

`src/ui/screens/SettingsScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../theme/useTheme';
import { ScreenHeader } from '../components/ScreenHeader';
import { ModelCard } from '../components/ModelCard';
import { CATALOG } from '@/model/catalog';
import { modelExists, deleteModel as fsDeleteModel, totalModelBytes, freeDiskBytes, modelPath } from '@/model/storage';
import { downloadModel } from '@/model/download';
import { getAllSettings, setSetting, Settings } from '@/db/settings';
import { getEngine } from '@/engine';

const fmtGB = (b: number) => `${(b / 1_000_000_000).toFixed(2)} GB`;

export const SettingsScreen = () => {
  const t = useTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const [used, setUsed] = useState(0);
  const [free, setFree] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);

  const reload = async () => {
    const s = await getAllSettings();
    setSettings(s);
    const inst: Record<string, boolean> = {};
    for (const e of CATALOG) inst[e.id] = await modelExists(e.id);
    setInstalled(inst);
    setUsed(await totalModelBytes(Object.keys(inst).filter(k => inst[k])));
    setFree(await freeDiskBytes());
  };

  useEffect(() => { reload(); }, []);

  const setActive = async (id: string) => {
    if (settings?.active_model_id === id) return;
    await getEngine().dispose();
    await setSetting('active_model_id', id);
    setSettings(s => s ? { ...s, active_model_id: id } : s);
  };

  const startDownload = async (id: string) => {
    const entry = CATALOG.find(e => e.id === id)!;
    setDownloading(id);
    try {
      await downloadModel(entry, { skipShaCheck: true });
      await reload();
    } catch (e) {
      Alert.alert('Download failed', e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(null);
    }
  };

  const confirmDelete = (id: string) => {
    Alert.alert('Delete model?', 'Frees disk space.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await fsDeleteModel(id);
        await reload();
      }}
    ]);
  };

  if (!settings) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg.canvas }}>
      <ScreenHeader
        left={<Pressable onPress={() => router.back()}><Text style={{ ...t.type.heading, color: t.colors.text.primary }}>←</Text></Pressable>}
        title="settings"
      />
      <View style={{ padding: t.spacing.lg }}>
        <Text style={{ ...t.type.label, color: t.colors.text.tertiary, marginBottom: t.spacing.sm }}>MODELS</Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary, marginBottom: t.spacing.md }}>
          using {fmtGB(used)} · {fmtGB(free)} free
        </Text>

        {CATALOG.map(e => {
          const isInstalled = installed[e.id];
          const isActive = settings.active_model_id === e.id;
          return (
            <View key={e.id}>
              <ModelCard
                entry={e}
                installed={isInstalled}
                active={isActive}
              />
              <View style={{ flexDirection: 'row', gap: t.spacing.md, marginBottom: t.spacing.lg, marginTop: -t.spacing.xs }}>
                {!isInstalled ? (
                  <Pressable onPress={() => startDownload(e.id)} disabled={downloading !== null}>
                    <Text style={{ ...t.type.label, color: downloading === e.id ? t.colors.text.tertiary : t.colors.text.primary }}>
                      {downloading === e.id ? 'DOWNLOADING…' : 'DOWNLOAD'}
                    </Text>
                  </Pressable>
                ) : isActive ? (
                  <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>● ACTIVE</Text>
                ) : (
                  <>
                    <Pressable onPress={() => setActive(e.id)}><Text style={{ ...t.type.label, color: t.colors.text.primary }}>SET ACTIVE</Text></Pressable>
                    <Pressable onPress={() => confirmDelete(e.id)}><Text style={{ ...t.type.label, color: t.colors.accent.warm }}>DELETE</Text></Pressable>
                  </>
                )}
              </View>
            </View>
          );
        })}

        <Text style={{ ...t.type.label, color: t.colors.text.tertiary, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>DEFAULTS</Text>
        <Text style={{ ...t.type.meta, color: t.colors.text.tertiary }}>default system prompt</Text>
        <TextInput
          value={settings.default_system_prompt}
          onChangeText={v => { setSettings({ ...settings, default_system_prompt: v }); setSetting('default_system_prompt', v); }}
          multiline
          style={{ ...t.type.bodyAi, color: t.colors.text.primary, fontSize: 14, minHeight: 80, padding: t.spacing.sm, borderWidth: 1, borderColor: t.colors.border.subtle, borderRadius: t.radii.sm, marginTop: t.spacing.xs }}
        />

        <Text style={{ ...t.type.label, color: t.colors.text.tertiary, marginTop: t.spacing.xl, marginBottom: t.spacing.sm }}>DATA</Text>
        <Pressable onPress={() => Alert.alert('Wipe all data?', 'Deletes DB, settings, and all installed models.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Wipe', style: 'destructive', onPress: () => Alert.alert('Confirm', 'Are you absolutely sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Wipe everything', style: 'destructive', onPress: async () => {
              for (const e of CATALOG) await fsDeleteModel(e.id);
              // Could also drop tables; for v1 the user can reinstall the app.
              router.replace('/first-run');
            }}
          ])}
        ])}>
          <Text style={{ ...t.type.label, color: t.colors.accent.warm }}>WIPE ALL DATA</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};
```

`app/settings.tsx`:

```tsx
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
export default function Settings() { return <SettingsScreen />; }
```

- [ ] **Step 2: Commit**

```bash
git add app/settings.tsx src/ui/screens/SettingsScreen.tsx
git commit -m "feat(screens): Settings with multi-model management"
```

---

## Phase 8 — Wiring

### Task 30: Root layout, providers, db init

**Files:** `app/_layout.tsx`, `src/providers.tsx`

- [ ] **Step 1: Create `src/providers.tsx`**

```tsx
import { ReactNode, useEffect, useState } from 'react';
import { ThemeProvider } from './ui/theme/ThemeProvider';
import { initDb } from './db/db';

export const AppProviders = ({ children }: { children: ReactNode }) => {
  const [ready, setReady] = useState(false);
  useEffect(() => { initDb().then(() => setReady(true)); }, []);
  if (!ready) return null;
  return <ThemeProvider>{children}</ThemeProvider>;
};
```

- [ ] **Step 2: Create `app/_layout.tsx`**

```tsx
import { Stack } from 'expo-router';
import { AppProviders } from '@/providers';

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="first-run" />
        <Stack.Screen name="conversation/[id]" />
        <Stack.Screen name="project/[id]" />
        <Stack.Screen name="settings" />
      </Stack>
    </AppProviders>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/providers.tsx app/_layout.tsx
git commit -m "feat(app): root layout with providers and DB init"
```

---

### Task 31: Haptics wrapper

**Files:** `src/haptics.ts`

- [ ] **Step 1: Implement**

```typescript
import * as Haptics from 'expo-haptics';

export const hapticImpactLight = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
export const hapticSuccess = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
export const hapticWarning = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
```

- [ ] **Step 2: Wire into Composer.send and useConversation onDone/onError**

In `src/ui/components/Composer.tsx`, import and call `hapticImpactLight()` inside `send()` before `onSend(trimmed)`.

In `src/chat/useConversation.ts`, call `hapticSuccess()` in `onDone`, `hapticWarning()` in error/abort branches.

- [ ] **Step 3: Commit**

```bash
git add src/haptics.ts src/ui/components/Composer.tsx src/chat/useConversation.ts
git commit -m "feat(haptics): wire impact/success/warning"
```

---

## Phase 9 — Verification & ship-readiness

### Task 32: Add fonts, icons, and assets

**Files:** `assets/fonts/`, `assets/icon.png`, `assets/adaptive-icon.png`

- [ ] **Step 1: Download fonts**

Place `JetBrainsMono-Regular.ttf` and `JetBrainsMono-Bold.ttf` in `assets/fonts/`.

For Charter, use Apple's system Charter on iOS (loads automatically) or fall back to Georgia. Include a Charter-Bold optional. Where Charter isn't available, the typography stack falls back gracefully.

- [ ] **Step 2: Configure font loading in `_layout.tsx`**

```tsx
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { AppProviders } from '@/providers';

export default function RootLayout() {
  const [loaded] = useFonts({
    'JetBrainsMono-Regular': require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    'JetBrainsMono-Bold': require('../assets/fonts/JetBrainsMono-Bold.ttf')
  });
  if (!loaded) return null;
  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="first-run" />
        <Stack.Screen name="conversation/[id]" />
        <Stack.Screen name="project/[id]" />
        <Stack.Screen name="settings" />
      </Stack>
    </AppProviders>
  );
}
```

- [ ] **Step 3: Add app icons**

Use a placeholder `icon.png` (1024×1024) and `adaptive-icon.png` (1024×1024). Color: `#161412` background, bone accent. Can be replaced later.

- [ ] **Step 4: Commit**

```bash
git add assets/ app/_layout.tsx
git commit -m "feat(assets): fonts and app icons"
```

---

### Task 33: Final typecheck, lint, full test run

- [ ] **Step 1: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Lint**

```bash
npx eslint . --ext .ts,.tsx --max-warnings 0
```

Fix any errors inline.

- [ ] **Step 3: Run all tests**

```bash
npx jest
```

Expected: all tests passing.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: lint and typecheck pass"
```

---

### Task 34: README and runbook

**Files:** `README.md`

- [ ] **Step 1: Write README**

```markdown
# Local Chat

Private, on-device AI chat for iOS and Android. Runs a local LLM via llama.rn — fully offline after the initial model download.

## Quick start (development)

```bash
npm install
npm test                      # all tests pass against fakeEngine
npx expo prebuild             # generate ios/ + android/ for native modules
```

Then either:
- **iOS simulator:** `npx expo run:ios` (requires Xcode)
- **Android emulator:** `npx expo run:android` (requires Android Studio)
- **Physical device, EAS dev build (recommended for real model):**
  ```bash
  npm install -g eas-cli
  eas login
  eas build --profile development --platform ios   # ~25 min
  # install resulting .ipa on device, then:
  npx expo start --dev-client
  ```

## What runs without the native build?

Everything except real LLM inference. The app boots, the UI is fully wired, the database works. With `fakeEngine` (default in tests), conversations stream scripted responses. To swap to fakeEngine for dev, edit `src/engine/index.ts` and import `useFakeEngineFor` early.

## Architecture

See [docs/superpowers/specs/2026-04-25-local-llm-chat-app-design.md](docs/superpowers/specs/2026-04-25-local-llm-chat-app-design.md) for the full design.

## Project structure

```
app/                  # Expo Router screens
src/engine/           # ChatEngine interface + impls (fake + llama.rn)
src/db/               # SQLite repos (projects, conversations, messages, settings)
src/model/            # Catalog, storage, download
src/chat/             # promptBuilder, useConversation hook
src/ui/               # Theme, components, screens
```

## Boundary rules

- `llama.rn` is imported only in `src/engine/llamaRnEngine.ts`.
- `expo-sqlite` is imported only in `src/db/*`.
- UI never imports the engine or DB directly — only via `src/chat/*`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with quick-start and architecture"
```

---

### Task 35: Smoke test on iOS simulator

- [ ] **Step 1: Prebuild native projects**

```bash
npx expo prebuild --clean
```

- [ ] **Step 2: Run on iOS simulator**

```bash
npx expo run:ios
```

- [ ] **Step 3: Manual smoke checks**

- App launches → FirstRun screen.
- Pick a model (Standard preselected) → tap Download. (Will likely fail in simulator without internet; that's OK — verifies UI flow.)
- Force a fake engine: edit `src/engine/index.ts` to call `useFakeEngineFor({ scriptedResponse: 'hello from fake' })` at module load, restart bundler.
- Skip First Run by setting `active_model_id` directly: open `app/index.tsx`, temporarily route to ConversationList.
- Send a message → verify streaming bubble appears with fake response.
- Tap Stop mid-stream → verify "stopped" finish reason.
- Open Settings → verify all sections render.

This validates the JS layer end-to-end. Real-model verification on hardware is the next step (post-EAS build).

---

## Self-Review Checklist

After implementation, verify against the spec:

- [ ] Section 2 in-scope items all have at least one task: chat ✓, projects + notes ✓, multi-model ✓, settings ✓, persistence ✓, theme ✓.
- [ ] Section 3.4 catalog matches `src/model/catalog.ts`.
- [ ] Section 4 schema matches `src/db/schema.ts` exactly (4 tables + indexes + cascading FKs).
- [ ] Section 5 flows: first-run (Task 25), send (Task 19), context budget (Task 18), switch project (Task 26 + 28), edit notes (Task 28), model lifecycle (Task 19/29), manage models (Task 29).
- [ ] Section 6 design system: tokens (Task 5), composer (Task 23), bubbles (Task 21), screens (Tasks 25–29), motion (Task 20 cursor + 31 haptics).
- [ ] Section 7 error handling: download failures (Task 17 + 25), engine errors (Task 19), DB errors implicit, chat orchestration cancel (Task 19), context-full (Task 18 throws).
- [ ] Section 8 testing: unit (Tasks 8, 11–14, 16–18), component-level (Task 35 manual), no E2E (per spec).
- [ ] Section 9 NFRs: documented in README, validated manually in Task 35.
- [ ] No placeholders. SHA-256 hashes in catalog flagged with explicit "REPLACE" note + skip-check dev path.
