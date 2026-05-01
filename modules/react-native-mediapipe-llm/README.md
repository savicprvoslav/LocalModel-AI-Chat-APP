# react-native-mediapipe-llm

Expo native module wrapping Google's [MediaPipe LLM Inference](https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference) (LiteRT-LM) for on-device LLMs in React Native.

Currently shipped **in-tree** under `modules/` while we validate it on real
devices. Once stable, the plan is to extract to a standalone repo and publish to
npm. See `docs/MODEL_HOSTING.md` for the model distribution story.

## Status

| Phase | Description | Status |
| --- | --- | --- |
| 0 | Module scaffold compiles on iOS + Android | scaffold written, **not yet built on device** |
| 1 | iOS one-shot generation against Gemma 4 E2B `.task` | code written, pending device run |
| 2 | iOS streaming + cancel + lifecycle | code written, pending device run |
| 3 | Android parity | code written, pending device run |
| 4 | Wired into localchat as a `ChatEngine` | wired |

## Public API

```ts
import {
  createSession,
  generate,
  cancel,
  release,
  addPartialListener,
  addErrorListener
} from 'react-native-mediapipe-llm';

const id = await createSession({
  modelPath: '/path/to/gemma-4-E2B-it.task',
  maxTokens: 1024,
  temperature: 0.8,
  topK: 40
});

const sub = addPartialListener(({ sessionId, partial, done }) => {
  if (sessionId !== id) return;
  if (done) sub.remove();
  else process.stdout.write(partial);
});

await generate(id, 'Hello, who are you?');
// later
await release(id);
```

## Platform requirements

- **iOS 16+** — `MediaPipeTasksGenAI` pod requires iOS 16.
- **Android API 24+** — already the default for Expo SDK 54.

## What still needs device validation

1. The exact public API of `LlmInference.Session.generateResponseAsync` on
   iOS — the streaming callback signature in `MediaPipeLlmModule.swift` is
   based on the documented surface for MediaPipe Tasks 0.10.x and may need
   adjusting once we link against the real pod.
2. Whether `addQueryChunk` requires turn-by-turn formatting (system /
   user / assistant tokens) for Gemma's chat template, or whether the
   model's `.task` bundle handles that internally.
3. Mid-stream cancellation behavior — both platforms currently treat cancel
   as "release the session"; if a softer cancel exists in newer SDK
   versions we should switch.
4. Memory / lifecycle around backgrounding the app during a long
   generation.
