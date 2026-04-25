import type { ChatEngine } from './types';
import { llamaRnEngine } from './llamaRnEngine';
import { createFakeEngine, FakeEngineConfig } from './fakeEngine';

let active: ChatEngine = llamaRnEngine;

export const setEngine = (e: ChatEngine): void => {
  active = e;
};

export const getEngine = (): ChatEngine => active;

/** Test/dev helper: replace the active engine with a fake. */
export const useFakeEngineFor = (cfg: FakeEngineConfig): void => {
  active = createFakeEngine(cfg);
};

export type { ChatEngine, GenerationOptions, StreamCallbacks, LoadProgress, FinishReason } from './types';
export { createFakeEngine } from './fakeEngine';
