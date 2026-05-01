import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

export type SessionId = number;

export type CreateSessionOptions = {
  modelPath: string;
  maxTokens?: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  randomSeed?: number;
};

export type PartialEvent = {
  sessionId: SessionId;
  partial: string;
  done: boolean;
};

export type ErrorEvent = {
  sessionId: SessionId;
  message: string;
};

type Events = {
  onPartial: (event: PartialEvent) => void;
  onError: (event: ErrorEvent) => void;
};

type NativeMediaPipeLlm = {
  createSession(opts: CreateSessionOptions): Promise<SessionId>;
  generate(id: SessionId, prompt: string): Promise<void>;
  cancel(id: SessionId): Promise<void>;
  release(id: SessionId): Promise<void>;
  addListener<E extends keyof Events>(event: E, listener: Events[E]): EventSubscription;
};

const native = requireNativeModule<NativeMediaPipeLlm>('MediaPipeLlm');

export const createSession = (opts: CreateSessionOptions): Promise<SessionId> =>
  native.createSession(opts);

export const generate = (id: SessionId, prompt: string): Promise<void> =>
  native.generate(id, prompt);

export const cancel = (id: SessionId): Promise<void> => native.cancel(id);

export const release = (id: SessionId): Promise<void> => native.release(id);

export const addPartialListener = (
  cb: (event: PartialEvent) => void
): EventSubscription => native.addListener('onPartial', cb);

export const addErrorListener = (
  cb: (event: ErrorEvent) => void
): EventSubscription => native.addListener('onError', cb);
