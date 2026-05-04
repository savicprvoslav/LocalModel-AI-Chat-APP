# Contributing

Thanks for your interest. This is an early-stage project — the architecture is stable but the rough edges are real, and contributions are welcome.

## Setup

```bash
npm install         # .npmrc forces legacy-peer-deps
npm test            # 133 tests should pass
npm run typecheck   # 0 errors expected
npm run lint
```

For UI work without a real model, use `fakeEngine` (see README) and Expo Go.

For real model work, you need an iOS device and a development build:

```bash
npx expo prebuild --clean
npx expo run:ios --device
```

## Code style

- TypeScript strict — no `any` without an explicit cast and a comment explaining why.
- Two-space indent, single quotes, trailing commas where Prettier would put them. Run `npm run lint` before submitting.
- React function components only. State via `useState` / `useReducer` / context — no Redux, no MobX.
- File-level comments explain *why*, not what. Don't add a docstring that just restates the function name.
- Don't introduce new abstractions for hypothetical future requirements. Three similar lines is better than a premature factory.

## Where things live

| Layer | Path | Boundary |
| --- | --- | --- |
| Engine (llama.rn wrapper) | `src/engine/` | Only place that imports `llama.rn` |
| Database (SQLite) | `src/db/` | Only place that imports `expo-sqlite` |
| Chat orchestration | `src/chat/` | Wires engine + db; the UI talks to this, not lower layers |
| Tools | `src/tools/` | Each tool is a single file; register in `registry.ts` |
| RAG | `src/rag/` | Portable module — no app-specific imports |
| UI | `src/ui/` | Theme + components + screens |
| Routes | `app/` | Expo Router file-based routing |

## Adding a tool

1. Create `src/tools/yourTool.ts` exporting a `Tool` (see `src/tools/types.ts`).
2. Register it in `src/tools/registry.ts` by adding to `ALL_TOOLS`.
3. If it's a network tool, set `network: true` — it'll then be off by default until the user opts in.
4. Add a unit test under `src/tools/__tests__/`.

The OpenAI-spec converter (`src/tools/openaiSpec.ts`) handles the wire format. You don't need to touch the prompt — llama.rn renders the spec into the model's native tool format via the chat template.

## Adding a model

Add an entry to `CATALOG` in `src/model/catalog.ts`. Required fields: `id`, `tier`, `displayName`, `url` (HuggingFace direct download), `sizeBytes`, `contextLen`, `minRamGB`, `recommendedRamGB`, `goodFor`. The `sha256` field is optional — when present, the downloader verifies; when absent, it falls back to size + GGUF magic-header validation.

Keep the catalog small. The point is curation, not a kitchen sink.

## Tests

- Pure logic only — no component tests yet.
- Engine tests use `fakeEngine`. Don't test against `llama.rn` directly; it requires a real device.
- DB tests use an in-memory SQLite via `expo-sqlite`'s test mock under `__mocks__/`.
- New tools, new RAG behavior, and new prompt-builder logic should ship with tests.

## Commit messages

Conventional Commits style:

```
feat(scope): short summary
fix(scope): short summary
refactor(scope): short summary
docs: short summary
```

Body explains *why*, not *what*. The diff says what.

## Pull requests

- One topic per PR. Keep them small.
- Update tests in the same PR.
- If the change is user-visible, mention it in the README's feature list or known-limitations section.
- Don't bump versions or edit `CHANGELOG.md` (there isn't one yet).

## Questions

Open an issue. Bug reports with steps to reproduce + a device model + a model id are gold.
