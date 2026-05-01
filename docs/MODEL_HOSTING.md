# Model Hosting

Where Local Chat gets its model files, what the licenses say we can and can't
do with them, and the operational checklist for self-hosting them on our own
infrastructure.

## TL;DR

| Family | License | Self-host? | Click-through? | Notes |
| --- | --- | --- | --- | --- |
| Qwen 3 | Apache 2.0 | Yes | No | Cleanest license of the lot — covers 1.7B / 4B / 8B |
| **Gemma 4** | **Apache 2.0** | **Yes** | **No** | License upgraded from Gemma TOU in March 2026 |
| Gemma 3n (not shipped) | Gemma Terms of Use | Yes, with extra obligations | Yes | Avoid until we want multimodal |

Today's catalog is therefore safely re-hostable end-to-end. The rest of this
doc covers the actual mechanics.

## Why we self-host

The default URLs in `src/model/catalog.ts` point at Hugging Face. That works,
but it's not what we want to ship long-term:

1. **Reliability.** HF rate-limits, has occasional outages, and can change
   resolve URLs without notice.
2. **Speed.** A CDN colocated with our user base downloads ~3–5× faster than
   HF's anycast.
3. **Integrity.** Self-hosting lets us pin a SHA-256 that we ourselves
   computed, instead of trusting that the upstream HF blob hasn't been
   silently re-uploaded.
4. **Resilience to upstream takedowns.** Models occasionally get pulled,
   re-licensed, or moved between repos. A self-hosted mirror insulates the
   shipped app from that.

## Apache 2.0 in plain English (Gemma 4 + Qwen 3)

You can:

- Mirror the file on any CDN.
- Modify it (re-quantize, repack, convert formats).
- Bundle it into a commercial product.
- Charge users for the product.
- Sublicense your modified version under whatever terms you want, *as long as*
  the original Apache 2.0 grant on the underlying model is preserved.

You must:

- Keep a copy of the **Apache 2.0 license text** alongside any redistribution.
- Keep any **NOTICE** file that ships with the original (Gemma 4 ships one
  attributing Google DeepMind).
- **State that you modified the file** if you did (e.g. quantization counts —
  add a note in our re-host's README or a sidecar `MODIFICATIONS.txt`).
- Not use the **Gemma / Google trademarks** beyond nominative use ("works
  with Gemma" is fine; "Local Chat for Google Gemma" is not).

There is no:

- Field-of-use restriction.
- Click-through agreement requirement.
- Royalty obligation.
- Acceptable-use policy pass-through (unlike the older Gemma Terms of Use,
  which Gemma 4 explicitly replaced).

## Operational checklist for re-hosting a model

For each catalog entry where we want to swap the upstream URL for our own
CDN:

1. **Download the upstream file** to a clean machine.
2. **Compute SHA-256** locally:
   ```sh
   sha256sum /path/to/model.gguf
   # or for LiteRT bundles
   sha256sum /path/to/model.task
   ```
3. **Compare against any published hash** the upstream provides (HF's "file
   info" page, Kaggle's checksum). If it doesn't match, **stop** — do not
   mirror; investigate.
4. **Upload to our CDN** (recommended: Cloudflare R2 with public access via
   a custom domain, or S3 + CloudFront). Object key:
   `models/<id>/<id>.<ext>` to make rotation easy.
5. **Verify the served file** by downloading it back over the public URL and
   re-running `sha256sum`. Must match step 2 exactly.
6. **Update `src/model/catalog.ts`** with the new `url` and `sha256`.
7. **Drop the license + NOTICE files** into `assets/legal/<model-id>/`:
   - `LICENSE` — the upstream license text verbatim
   - `NOTICE` — the upstream NOTICE file verbatim (if any)
   - `MODIFICATIONS` — a one-line note like "Mirrored from
     huggingface.co/... on 2026-05-01. No modifications."
8. **Add an entry to the in-app About / Legal screen** linking to those
   files. (Settings → About → "Open-source models")
9. **Set Cache-Control on the CDN object** to `public, max-age=31536000,
   immutable` — these files are content-addressed by SHA, so they never
   change in place.

## Per-model URLs in our catalog

| Model id | Upstream | Mirror status |
| --- | --- | --- |
| `qwen3-1.7b-q4` | bartowski/Qwen_Qwen3-1.7B-GGUF (HF) | not yet mirrored |
| `qwen3-4b-q4` | bartowski/Qwen_Qwen3-4B-GGUF (HF) | not yet mirrored |
| `qwen3-8b-q4` | bartowski/Qwen_Qwen3-8B-GGUF (HF) | not yet mirrored |
| `phi-4-mini-instruct-q4` | bartowski/microsoft_Phi-4-mini-instruct-GGUF (HF) | not yet mirrored — MIT license |
| `gemma-4-e2b-it-q4` | bartowski/google_gemma-4-E2B-it-GGUF (HF) | not yet mirrored |
| `gemma-4-e4b-it-q4` | bartowski/google_gemma-4-E4B-it-GGUF (HF) | not yet mirrored |
| `gemma-4-e2b-it-litert` | litert-community/gemma-4-E2B-it-litert-lm (HF) | URL confirmed; SHA pending real download |
| `gemma-4-e4b-it-litert` | litert-community/gemma-4-E4B-it-litert-lm (HF) | URL confirmed; SHA pending real download |

The LiteRT bundles ship under the `litert-community/` HF org (not `google/`,
which only hosts the safetensors weights). Each repo has multiple files —
we use `<id>.litertlm`, the same bundle Google's AI Edge Gallery ships to
mobile. Recent `MediaPipeTasksGenAI` (iOS) and `mediapipe.tasks.genai.llminference`
(Android) versions accept `.litertlm` directly. The `-web.task` siblings
target MediaPipe Tasks Web (JS runtime) and are not what we want on
device.

## CDN choice

**Recommended: Cloudflare R2.**

- Egress is free — material for ~5 GB models that get downloaded
  many times per active user.
- No request-count cost beyond the standard Class A/B operations tier.
- Can be fronted by a custom domain with no extra config.
- Same console handles the WAF rules we'd want for hot-linking protection.

**Alternative: GitHub Releases.** Free, well-known, but the 2 GB per-asset
cap rules out anything past Gemma 4 E2B. Acceptable as a temporary mirror
for the smaller models only.

**Avoid:** raw S3 (egress costs add up fast), generic VPS-served files (no
range-request optimization, slow internationally).

## Updating a model

When we want to replace a model in place (newer quant, bug fix, re-pack):

1. **Don't overwrite.** Upload the new file under a new key —
   `models/<id>/<id>-v2.<ext>`. The cache headers we set make in-place
   replacement risky for already-downloaded clients.
2. **Add a new catalog entry** with a new `id` (e.g. `gemma-4-e2b-it-q4-v2`)
   pointing at the new URL and SHA-256.
3. **Mark the old entry deprecated** in the catalog (a comment is enough
   today; we don't have a UI hint for this yet).
4. **Migrate users on next launch** if and only if it's a security-relevant
   change. Otherwise let users upgrade voluntarily — model downloads are
   expensive on metered connections.

## License files in the app

Currently we ship neither the LICENSE nor NOTICE files for any bundled
model. That's a gap to close before any external release. The minimum:

```
assets/legal/
  apache-2.0.txt              # one shared copy, referenced by Gemma 4 + Qwen 3
  llama-3.2-community.txt
  gemma-4-NOTICE.txt
  llama-3.2-acceptable-use.txt
```

Wire those into a `LegalScreen` reachable from Settings → About. The
Apache 2.0 text and the Llama community license text are short enough to
render as plain Markdown in-app — no external link required.
