import type { ChatEngine } from './types';
import { llamaRnEngine } from './llamaRnEngine';
import { liteRtEngine } from './liteRtEngine';
import { createFakeEngine, FakeEngineConfig } from './fakeEngine';
import { getCatalogEntry } from '@/model/catalog';

// Test override wins over runtime selection. `lastUsed` tracks whichever
// engine was most recently picked by `getEngineForModel` so calls that don't
// know the model id (post-load streamCompletion, dispose, extractEntities)
// still hit the right one.
let testOverride: ChatEngine | null = null;
let lastUsed: ChatEngine = llamaRnEngine;

export const setEngine = (e: ChatEngine): void => {
  testOverride = e;
};

export const getEngine = (): ChatEngine => testOverride ?? lastUsed;

/**
 * Pick the engine that matches the model's runtime field in the catalog.
 * Falls back to llama.rn for unknown ids — keeps the existing GGUF path
 * working when a brand-new id flows through.
 */
export const getEngineForModel = (modelId: string): ChatEngine => {
  if (testOverride) return testOverride;
  const entry = getCatalogEntry(modelId);
  const engine = entry?.runtime === 'litert' ? liteRtEngine : llamaRnEngine;
  lastUsed = engine;
  return engine;
};

/** Test/dev helper: replace the active engine with a fake. */
export const useFakeEngineFor = (cfg: FakeEngineConfig): void => {
  testOverride = createFakeEngine(cfg);
};

export type { ChatEngine, GenerationOptions, StreamCallbacks, LoadProgress, FinishReason } from './types';
export { createFakeEngine } from './fakeEngine';
