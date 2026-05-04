# Model Hosting

Where Local Chat gets its model files, what the licenses say we can and can't do with them, and the operational checklist for self-hosting them on our own infrastructure.

## TL;DR

The current four-model catalog ([src/model/catalog.ts](../src/model/catalog.ts)) is safely re-hostable end-to-end. All four models are under permissive licenses with no click-through gates and no acceptable-use pass-through.

| Model | Upstream | License | Self-host? | Click-through? |
| --- | --- | --- | --- | --- |
| **SmolLM3 3B** | HuggingFaceTB (re-quanted by unsloth) | Apache 2.0 | Yes | No |
| **Phi-4-mini Instruct** | Microsoft (re-quanted by unsloth) | MIT | Yes | No |
| **Qwen 3 4B** | Alibaba Qwen (re-quanted by unsloth) | Apache 2.0 | Yes | No |
| **Gemma 4 E2B** | Google DeepMind (re-quanted by unsloth) | Apache 2.0 | Yes | No |

Gemma 4's license was upgraded from the Gemma Terms of Use to Apache 2.0 in March 2026, which is what unblocked it for our catalog.

## Why we self-host (eventually)

The default URLs in [src/model/catalog.ts](../src/model/catalog.ts) point at Hugging Face. That works for development and for early users, but it's not what we want for any kind of public release:

1. **Reliability.** HF rate-limits, has occasional outages, and can change resolve URLs without notice (we've already lived through one resolve-path migration).
2. **Speed.** A CDN colocated with the user base downloads ~3–5× faster than HF's anycast — especially noticeable for the 2–3 GB GGUFs we ship.
3. **Integrity.** Self-hosting lets us pin a SHA-256 that we ourselves computed, instead of trusting that the upstream HF blob hasn't been silently re-uploaded. (HF's CDN does occasionally re-encode files; the SHA we observed last week may not match the bytes served today.)
4. **Resilience to upstream takedowns.** Models occasionally get pulled, re-licensed, re-quanted with different filenames, or moved between repos. A self-hosted mirror insulates the shipped app from upstream churn.

Until we self-host, the `sha256` field in catalog entries is left undefined and the downloader falls back to size + GGUF magic-header validation. See [Models](./models.md#download-flow).

## On the unsloth re-quants

All four catalog entries use [unsloth.ai](https://unsloth.ai)'s re-quanted GGUFs rather than the original FP16 / safetensors releases. Why:

- **Working chat templates.** unsloth bakes the Jinja chat template directly into the GGUF, with edge cases (Qwen 3's `<think>` prefill, Phi-4's tool format, Gemma 4's Harmony channels) handled correctly. Other re-quanters sometimes ship templates that load but render slightly wrong tokens.
- **UD-Q4_K_XL when available.** Unsloth's "Dynamic" quantization is measurably better than vanilla Q4_K_M at the same nominal bit count. The Qwen 3 and Gemma 4 entries take advantage of this.
- **Stable URLs.** unsloth pins file names and doesn't re-encode in place.

Licensing flows through. unsloth is redistributing under the upstream license; using their re-quant is equivalent (legally) to using the original. Attribution still goes to Microsoft / Google / Alibaba / HuggingFaceTB — unsloth is a redistribution intermediary, not a co-licensor.

## Apache 2.0 in plain English (SmolLM3, Qwen 3, Gemma 4)

You **can**:

- Mirror the file on any CDN.
- Modify it (re-quantize, repack, convert formats).
- Bundle it into a commercial product.
- Charge users for the product.
- Sublicense your modified version under whatever terms you want, *as long as* the original Apache 2.0 grant on the underlying model is preserved.

You **must**:

- Keep a copy of the **Apache 2.0 license text** alongside any redistribution.
- Keep any **NOTICE** file that ships with the original (Gemma 4 ships one attributing Google DeepMind; Qwen 3 has one attributing Alibaba).
- **State that you modified the file** if you did (e.g. quantization counts — add a note in our re-host's README or a sidecar `MODIFICATIONS.txt`).
- Not use the **Gemma / Qwen / SmolLM trademarks** beyond nominative use ("works with Gemma" is fine; "Local Chat for Google Gemma" is not).

There is **no**:

- Field-of-use restriction.
- Click-through agreement requirement.
- Royalty obligation.
- Acceptable-use policy pass-through (unlike the older Gemma Terms of Use, which Gemma 4 explicitly replaced in March 2026).

## MIT in plain English (Phi-4-mini)

Effectively the same posture as Apache 2.0 for our purposes, with two small differences:

- The license text is shorter (~15 lines instead of ~200) and there's no NOTICE-file requirement.
- There's no explicit patent grant. (Apache 2.0 does grant a patent license; MIT is silent on patents.)

You **must** include the MIT license text and copyright notice when you redistribute.

## Operational checklist for re-hosting a model

For each catalog entry where we want to swap the upstream URL for our own CDN:

1. **Download the upstream file** to a clean machine.
2. **Compute SHA-256** locally:
   ```sh
   shasum -a 256 /path/to/model.gguf
   ```
3. **Compare against any published hash** the upstream provides (HF's "file info" page shows one). If it doesn't match, **stop** — do not mirror; investigate.
4. **Upload to our CDN** (recommended: Cloudflare R2 with public access via a custom domain). Object key:
   `models/<id>/<id>.gguf` to make rotation easy.
5. **Verify the served file** by downloading it back over the public URL and re-running `shasum -a 256`. Must match step 2 exactly.
6. **Update [src/model/catalog.ts](../src/model/catalog.ts)** with the new `url` and `sha256`.
7. **Drop the license + NOTICE files** into `assets/legal/<model-id>/`:
   - `LICENSE` — the upstream license text verbatim
   - `NOTICE` — the upstream NOTICE file verbatim (if any)
   - `MODIFICATIONS` — a one-line note like "Mirrored from huggingface.co/unsloth/Qwen3-4B-GGUF on 2026-05-01. No modifications."
8. **Add an entry to the in-app About / Legal screen** linking to those files. (Settings → About → "Open-source models")
9. **Set Cache-Control on the CDN object** to `public, max-age=31536000, immutable` — these files are content-addressed by SHA, so they never change in place.

## Per-model URLs in our catalog

| Catalog id | Upstream | Mirror status |
| --- | --- | --- |
| `smollm3-3b-q4` | [unsloth/SmolLM3-3B-GGUF](https://huggingface.co/unsloth/SmolLM3-3B-GGUF) | not yet mirrored |
| `phi-4-mini-instruct-q4` | [unsloth/Phi-4-mini-instruct-GGUF](https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF) | not yet mirrored — MIT license |
| `qwen3-4b-q4` | [unsloth/Qwen3-4B-GGUF](https://huggingface.co/unsloth/Qwen3-4B-GGUF) | not yet mirrored |
| `gemma-4-e2b-it-q4` | [unsloth/gemma-4-E2B-it-GGUF](https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF) | not yet mirrored |

The exact filenames inside each repo are visible in the catalog `url` field — `Q4_K_M.gguf` for SmolLM3 and Phi-4-mini, `UD-Q4_K_XL.gguf` for Qwen 3 and Gemma 4. Mirror the *exact* file we ship, not "an equivalent" file with different bytes; the SHA must match what the app expects.

### Models that were dropped

- **Gemma 4 E4B** (~5.4 GB Q4) — caused init crashes on iPhone (8 GB RAM ceiling). Excluded from catalog; not a hosting concern.
- **Qwen 3 8B** — same memory pressure as Gemma 4 E4B. Excluded.
- **Ministral 3B** — Mistral gates the repo behind an account-bound click-through. Can't anonymously download → can't ship → can't mirror.
- **MediaPipe LiteRT bundles** (`.litertlm` files via `litert-community/`) — we previously shipped a custom Expo module to load these. Removed because Google's prebuilt iOS binaries can't link on Xcode 26 (XNNPACK SME2 kernel issue). Will revisit when Google ships a fix or when we rebuild LiteRT-LM from source.

## CDN choice

**Recommended: Cloudflare R2.**

- Egress is free — material for ~2–3 GB models that get downloaded many times per active user.
- No request-count cost beyond the standard Class A/B operations tier.
- Can be fronted by a custom domain with no extra config.
- Same console handles the WAF rules we'd want for hot-linking protection.

**Alternative: GitHub Releases.** Free, well-known. The 2 GB per-asset cap is just barely enough for SmolLM3 (1.9 GB) and rules out everything else in the catalog. Acceptable as a temporary mirror for SmolLM3 only.

**Avoid:** raw S3 (egress costs add up fast on 2 GB downloads), generic VPS-served files (no range-request optimization, slow internationally).

## Updating a model

When we want to replace a model in place (newer quant, bug fix, re-pack):

1. **Don't overwrite.** Upload the new file under a new key — `models/<id>/<id>-v2.gguf`. The cache headers we set make in-place replacement risky for already-downloaded clients.
2. **Add a new catalog entry** with a new `id` (e.g. `qwen3-4b-q4-v2`) pointing at the new URL and SHA-256.
3. **Mark the old entry deprecated** in the catalog (a comment is enough today; we don't have a UI hint for this yet).
4. **Migrate users on next launch** if and only if it's a security-relevant change. Otherwise let users upgrade voluntarily — model downloads are expensive on metered connections, and the user paid for the bytes once already.

## License files in the app

Currently we ship neither the LICENSE nor NOTICE files for any bundled model. That's a gap to close before any external release. The minimum:

```
assets/legal/
  apache-2.0.txt              # one shared copy, referenced by SmolLM3, Qwen 3, Gemma 4
  mit.txt                     # for Phi-4-mini
  smollm3-NOTICE.txt          # if HuggingFaceTB ships one
  qwen3-NOTICE.txt            # Alibaba attribution
  gemma-4-NOTICE.txt          # Google DeepMind attribution
```

Wire those into a `LegalScreen` reachable from Settings → About. The Apache 2.0 and MIT texts are short enough to render as plain Markdown in-app — no external link required. Whatever NOTICE files the upstream ships should be reproduced verbatim in the same screen, attributed.

The Settings → About screen should also surface the unsloth attribution (the GGUFs we ship are unsloth's re-quants of the upstream weights). A line like "GGUFs: unsloth.ai re-quantization, [model] © [original author] under [license]" is the polite minimum.

## Verification checklist before any external launch

- [ ] All catalog entries have a `sha256` filled in (not undefined).
- [ ] The `assets/legal/` directory exists with all required license + NOTICE files.
- [ ] The Settings → About → Legal screen renders them and is reachable in fewer than 3 taps.
- [ ] Every model file is mirrored on our CDN (not pointing at HF anymore).
- [ ] Each mirrored object has `Cache-Control: public, max-age=31536000, immutable`.
- [ ] The CI hash-check runs on every release (compares served bytes against the catalog `sha256`).

None of that is done today. It's the gating list for "early adopters / GitHub-shared dev build" → "App Store / Play Store release."

## Related docs

- [Models](./models.md) — what's in the catalog, why each, GGUF format, download flow.
- [Architecture](./architecture.md) — where the model layer sits in the app.
