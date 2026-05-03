import type { ChatEngine } from './types';
import { llamaRnEngine } from './llamaRnEngine';
import { createFakeEngine, FakeEngineConfig } from './fakeEngine';

// All catalog entries are GGUF and route through llama.rn. We keep the
// `getEngineForModel(id)` indirection so tests / future runtimes can
// override behavior without touching every call site.
let testOverride: ChatEngine | null = null;

export const setEngine = (e: ChatEngine): void => {
  testOverride = e;
};

export const getEngine = (): ChatEngine => testOverride ?? llamaRnEngine;

export const getEngineForModel = (_modelId: string): ChatEngine =>
  testOverride ?? llamaRnEngine;

/** Test/dev helper: replace the active engine with a fake. */
export const useFakeEngineFor = (cfg: FakeEngineConfig): void => {
  testOverride = createFakeEngine(cfg);
};

export type { ChatEngine, GenerationOptions, StreamCallbacks, LoadProgress, FinishReason } from './types';
export { createFakeEngine } from './fakeEngine';
