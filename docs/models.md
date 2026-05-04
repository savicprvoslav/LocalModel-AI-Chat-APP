# Models

The model catalog, why we shipped each entry, what GGUF is, how downloads work, and how to add a new model.

## What ships in the catalog

The full catalog lives in [src/model/catalog.ts](../src/model/catalog.ts). Today it has four entries — all GGUF, all loaded through llama.rn. The lineup is intentionally small: this is a curated catalog, not a kitchen sink.

| Model | Tier | Size (Q4) | Min RAM | Best at |
| --- | --- | --- | --- | --- |
| **SmolLM3 3B** | compact | ~1.9 GB | 3 GB | Fastest cold-start, decent fallback for low-end devices. HuggingFace's open SmolLM3. |
| **Phi-4-mini Instruct (3.8B)** | compact | ~2.5 GB | 4 GB | Best stability/quality on iPhone. Strong math + function calling. MIT license. |
| **Qwen 3 4B** | standard | ~2.5 GB | 4 GB | Best tool calling on-device — natively trained on ChatML tool format. Reliable for `web_search` / `weather` / `http_request` flows. |
| **Gemma 4 E2B** | standard | ~3.2 GB | 6 GB | Newest (Mar/Apr 2026 release). Multimodal-ready in the architecture; we use the text path. Talks about tools rather than emitting structured calls — pair with Qwen 3 if tool calling matters. |

The `tier` field is purely cosmetic for the FirstRun model picker. The "may be slow" hint in the picker is driven by `minRamGB` vs. detected device RAM, not by tier.

## Why these specific models

The decision criteria, in order of weight:

1. **Fits on the device.** Q4 quantization. Total resident memory at warmup must stay under typical iPhone/Android RAM. We previously included Gemma 4 E4B (~5.4 GB) and Qwen 3 8B; both crashed on iPhones with 8 GB RAM. They're noted in the catalog comments as exclusions.
2. **Permissive license.** SmolLM3, Phi-4, Qwen 3, and Gemma 4 are all Apache 2.0 (Gemma upgraded from the Gemma TOU in March 2026). Mistral's repos require an account-gated click-through, so we excluded Ministral.
3. **Native chat template that works in `llama.rn`.** The model's GGUF must contain a working Jinja chat template. All four models do.
4. **Good at tool calling, or honest about not being.** Qwen 3 is trained on the ChatML tool format and reliably emits structured `tool_calls`. Phi-4-mini is also strong here. Gemma 4 will *describe* tools instead of calling them — that's a known weakness. We document it in the catalog `goodFor` field so users pick Qwen 3 when tool calling matters.
5. **Real-world quality at the size.** SmolLM3 is the lowest-end option that doesn't fall apart on multi-turn chat. Phi-4-mini punches above its weight on reasoning; we promote it as the default in the FirstRun picker.

The default in `DEFAULT_MODEL_ID` is `phi-4-mini-instruct-q4`.

### Why "E2B" GGUFs are bigger than 2B

Google's "E2B / E4B" naming refers to *effective* parameters in Gemma 4 — the active parameters during inference. The quantized GGUF that we actually download is larger because it includes the full embedding tables. E2B Q4_K_M is ~3.5 GB on disk; E4B Q4_K_M is ~5.4 GB. Don't confuse "E2B" with a 2-billion-parameter model.

### What we tried and dropped

A short history of catalog churn. Each removal taught us something:

- **MediaPipe LLM via Google's `.task` bundles.** We shipped a custom `react-native-mediapipe-llm` Expo module and a `liteRtEngine.ts` to talk to it. Worked end-to-end on the simulator, but Google's prebuilt iOS binaries can't link on Xcode 26 (XNNPACK SME2 kernels trip the new linker). The native module + the engine + the bundle entries were all deleted in the engine consolidation refactor. The plan: revisit when Google ships a fix or when LiteRT-LM can be rebuilt from source with SME2 disabled.
- **Llama 3.2 1B/3B and Qwen 2.5 7B.** Earlier README versions listed a Compact/Standard/Capable Llama-based catalog. We replaced it with the current four because Qwen 3 is materially better at tool calling, Phi-4-mini is materially better on reasoning, and SmolLM3 covers the ultra-low-end better than Llama 3.2 1B.
- **Ministral 3B.** Wanted it. Mistral gates the repo behind an account-bound click-through. Can't anonymously download → can't ship.

## What GGUF is

GGUF (GPT-Generated Unified Format) is a single-file binary format used by `llama.cpp` and friends. One file contains:

- **Quantized weights** in one of llama.cpp's quantization schemes (Q4_K_M, Q4_K_XL, Q8_0, etc.).
- **The tokenizer**, embedded.
- **Architecture metadata** (model name, hidden size, number of layers, attention heads, …).
- **The Jinja chat template**, embedded as a string.
- **Stop tokens, BOS/EOS, special tokens, etc.**

Magic header: the first four bytes are the ASCII string `GGUF`. Our pre-load sanity check reads the first 8 bytes and rejects the file if it doesn't start with that magic — see [Engine](./engine.md#loading-a-model).

### Q4 quantization

All catalog entries are Q4 quantized. Two variants:

- **Q4_K_M** — standard 4-bit quantization. Used for SmolLM3, Phi-4-mini.
- **UD-Q4_K_XL** — Unsloth Dynamic 4-bit, "extra large". Slightly bigger than Q4_K_M (~10–15%), measurably better quality at the same nominal bit count. Used for Qwen 3 and Gemma 4 because Unsloth ships these and they're worth the extra disk.

Why not Q3 or Q2: quality degrades sharply below Q4. Why not Q5/Q8: Q4 is the sweet spot for on-device — more bits would push past phone RAM headroom.

## Download flow

The download path lives in [src/model/download.ts](../src/model/download.ts) and is called from the FirstRun screen and the model-management UI in Settings.

```
1. ensureModelsDir()                  Create ${documentDirectory}/models/ if missing
2. freeDiskBytes()                    Pre-flight: 1.25× sizeBytes free required
3. Inspect existing target file       Resume? Restart? Already complete?
4. createDownloadResumable(url, …)    expo-file-system streams to disk with progress
5. Verify post-download size          ≥ 0.9 × sizeBytes; otherwise truncated → delete + error
6. Optional: SHA-256 verification     Only when entry.sha256 is set; otherwise warn + skip
7. Return the local target path
```

A few details worth flagging:

- **No HTTP Range resume across runs.** HuggingFace's Xet CDN serves through signed S3 URLs that don't honor `Range` reliably. Any partial we left behind from a previous failed download is discarded; we restart from byte 0. Inside a single run, `createDownloadResumable` does support pause/resume — that's used for the abort flow.
- **Free-disk check is 1.25× sizeBytes.** Headroom for filesystem journaling, temp files, and a small margin before iOS/Android start aggressively reclaiming.
- **Truncation check is 0.9× sizeBytes.** Catches the common failure mode of redirect bodies (a few hundred bytes of HTML written to a `.gguf` file) before they reach `llama.rn`.
- **SHA-256 is optional.** Catalog entries can ship without a hash. When `entry.sha256` is undefined, the downloader logs a warning and falls back to size + GGUF magic-header validation only. We made this optional because (a) HuggingFace's CDN occasionally re-encodes files, breaking pinned hashes for everyone, and (b) computing a SHA over a 2 GB file via base64 in JavaScript takes 30+ seconds — bad UX. Real shipping builds should fill the hashes in.

## Storage paths

[src/model/storage.ts](../src/model/storage.ts):

```ts
modelsDir() === `${FS.documentDirectory}models/`
modelPath(id) === `${modelsDir()}${id}.gguf`
```

The file name is the catalog `id`, with a `.gguf` extension. Multiple models can coexist; each takes the same naming convention.

`deleteModel(id)`, `modelExists(id)`, `freeDiskBytes()`, and `totalModelBytes(ids)` are exposed for the Settings → Models screen.

## Adding a new model

Adding a model to the catalog is a one-file change:

1. Pick a **Q4 GGUF** that's available on HuggingFace (or a self-hosted mirror) at a stable, public, anonymously-downloadable URL.
2. Add an entry to `CATALOG` in [src/model/catalog.ts](../src/model/catalog.ts):

   ```ts
   {
     id: 'your-model-id',
     tier: 'compact' | 'standard' | 'capable',
     displayName: 'Your Model 4B (Q4_K_M)',
     url: 'https://huggingface.co/.../your-model-Q4_K_M.gguf',
     sizeBytes: 1_915_306_528,        // The actual byte count from HF
     contextLen: 4096,                 // What the app caps at
     minRamGB: 4,
     recommendedRamGB: 6,
     goodFor: 'one-line description shown in FirstRun'
   }
   ```

3. Optional but recommended: compute the SHA-256 with `shasum -a 256 your-model.gguf` and add it to the entry.
4. Test on a real device. Specifically check:
   - Cold load time (we'd like under 30s on iPhone 13+).
   - First-token latency.
   - Tool calling, if `goodFor` mentions it.
   - Multi-turn chat doesn't degrade.

Don't add models faster than you'll exercise them. The point is curation.

## Compatibility caveats

- **Gemma 4 GGUF requires `llama.cpp` build b8746+.** If the bundled `llama.rn` pins an older `llama.cpp`, Gemma 4 fails at load time with an unsupported-architecture error. If that happens, upgrade `llama.rn` or fall back to Qwen 3.
- **Context window is hard-capped at 4096 tokens** in `n_ctx` even when the model supports more (Phi-4-mini natively supports 128K). The cap exists because we don't yet expose a per-conversation context override; raising `n_ctx` globally would inflate kv-cache memory across all conversations.

## Self-hosting

For ops + license + redirect-handling concerns when self-hosting model files, see [MODEL_HOSTING.md](./MODEL_HOSTING.md).

## File reference

- [src/model/catalog.ts](../src/model/catalog.ts) — the catalog and its types.
- [src/model/download.ts](../src/model/download.ts) — resumable download with size + GGUF + SHA validation.
- [src/model/storage.ts](../src/model/storage.ts) — paths, free-disk, delete.
- [src/engine/llamaRnEngine.ts](../src/engine/llamaRnEngine.ts) — model load logic + Metal/CPU fallback.
- [src/ui/screens/FirstRunScreen.tsx](../src/ui/screens/FirstRunScreen.tsx) — the UI for picking and downloading a model.

## Related docs

- [Engine](./engine.md) — how the loaded model is invoked.
- [Architecture](./architecture.md) — where the model layer fits.
- [MODEL_HOSTING.md](./MODEL_HOSTING.md) — license review and self-hosting checklist.
