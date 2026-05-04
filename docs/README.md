# Local Chat — Documentation

Deep documentation for [Local Chat](../README.md), a private on-device LLM chat app for iOS and Android built with React Native, Expo, and [llama.rn](https://github.com/mybigday/llama.rn).

These docs explain how the app actually works — the architecture choices, the models we ship, the patterns we lean on, and the tradeoffs behind each. They're written for engineers reading the code, not as marketing material.

## Map

| Doc | What's in it |
| --- | --- |
| [Architecture](./architecture.md) | The layered architecture, boundary rules, request lifecycle, key design patterns |
| [Engine](./engine.md) | `llama.rn` integration, native tool calling, Jinja chat templates, streaming pipeline, reasoning extraction |
| [Models](./models.md) | The model catalog (SmolLM3, Phi-4-mini, Qwen 3, Gemma 4), why each, GGUF format, download flow |
| [Tools](./tools.md) | Tool registry, OpenAI-spec conversion, the tool-call iteration loop, built-in tools |
| [RAG](./rag.md) | Hybrid retrieval (dense embeddings + FTS5), entity extraction, the portable RAG module |
| [Database](./database.md) | SQLite schema, the migration system, the repos pattern |
| [Model Hosting](./MODEL_HOSTING.md) | Where the model files come from, license review, self-hosting checklist |

## Reading order

If you're new to the codebase:

1. [Architecture](./architecture.md) — to understand the layers and how a single chat message flows through the system end-to-end.
2. [Engine](./engine.md) — to understand the most non-obvious layer: how we delegate prompt formatting and tool calling to llama.rn's native Jinja path instead of hand-rolling it.
3. [Database](./database.md) — short, sets up the persistence model that the rest of the app builds on.
4. [Tools](./tools.md) and [RAG](./rag.md) — the two areas that most contributors will want to extend.

If you're trying to add a new model, read [Models](./models.md). To add a new tool, read [Tools](./tools.md). To debug retrieval quality, read [RAG](./rag.md).

## Audience

These docs assume you're comfortable with TypeScript, React Native, and have a working mental model of how a transformer-based LLM does inference. They do not assume familiarity with llama.cpp, GGUF, Expo native modules, SQLite FTS5, or sentence embeddings — those topics are introduced where relevant.

## Conventions

- File references are written as `[path/to/file.ts](../path/to/file.ts)` from the docs directory.
- Symbols are written in `monospace`.
- "We" means the project. "You" means the reader/contributor.
- Comments quoted from the codebase are excerpted verbatim where they explain a non-obvious decision.
